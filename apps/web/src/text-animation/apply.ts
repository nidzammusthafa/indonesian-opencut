import type { TimelineElement } from "@/timeline";
import type { ElementAnimations, ScalarAnimationChannel, ScalarAnimationKey } from "@/animation/types";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import { generateUUID } from "@/utils/id";
import { getCurveHandlesForNormalizedCubicBezier } from "@/animation/curve-bridge";
import type { PropertyAnimationDef, TextAnimationPreset } from "./types";
import { CUBIC_BEZIER_IN, CUBIC_BEZIER_OUT, TEXT_ANIMATION_PRESETS } from "./presets";

function getPropertyBaseValue(element: TimelineElement, propertyPath: string): number {
	const val = element.params[propertyPath];
	if (typeof val === "number") {
		return val;
	}
	if (propertyPath === "opacity" || propertyPath === "transform.scaleX" || propertyPath === "transform.scaleY") {
		return 1;
	}
	return 0;
}

function getPropertyValue(baseValue: number, def: PropertyAnimationDef, position: "start" | "end"): number {
	if (position === "start") {
		if (def.absoluteStart !== undefined) return def.absoluteStart;
		if (def.offsetStart !== undefined) return baseValue + def.offsetStart;
		return baseValue;
	} else {
		if (def.absoluteEnd !== undefined) return def.absoluteEnd;
		if (def.offsetEnd !== undefined) return baseValue + def.offsetEnd;
		return baseValue;
	}
}

export function applyTextAnimations({
	element,
	presetInId,
	durationIn,
	presetOutId,
	durationOut,
}: {
	element: TimelineElement;
	presetInId: string | null;
	durationIn: number;
	presetOutId: string | null;
	durationOut: number;
}): ElementAnimations {
	const presetIn = TEXT_ANIMATION_PRESETS.find((p) => p.id === presetInId && p.direction === "in");
	const presetOut = TEXT_ANIMATION_PRESETS.find((p) => p.id === presetOutId && p.direction === "out");

	const elementDurationSec = mediaTimeToSeconds({ time: element.duration });

	// Clamp durations to prevent overlaps
	let dIn = presetIn ? durationIn : 0;
	let dOut = presetOut ? durationOut : 0;
	if (dIn + dOut > elementDurationSec) {
		const total = dIn + dOut;
		const scale = elementDurationSec / total;
		dIn *= scale;
		dOut *= scale;
	}

	// Copy existing animations to preserve non-text-preset animations (like volume, custom effects)
	const nextAnimations: ElementAnimations = { ...(element.animations ?? {}) };

	// Properties affected by preset animations
	const allAffectedProperties = new Set<string>();
	if (presetIn) {
		for (const prop of presetIn.properties) {
			allAffectedProperties.add(prop.propertyPath);
		}
	}
	if (presetOut) {
		for (const prop of presetOut.properties) {
			allAffectedProperties.add(prop.propertyPath);
		}
	}

	// List of all keys to clean up if we switch from animation to none
	const textAnimationProperties = [
		"opacity",
		"transform.positionX",
		"transform.positionY",
		"transform.scaleX",
		"transform.scaleY",
		"transform.rotate",
	];

	// Clean up properties that are no longer affected by presets
	for (const prop of textAnimationProperties) {
		if (!allAffectedProperties.has(prop)) {
			// If it was animated by a preset before, delete its animation channel to reset it to static
			delete nextAnimations[prop];
		}
	}

	// Generate keyframes for each affected property
	for (const propertyPath of allAffectedProperties) {
		const baseValue = getPropertyBaseValue(element, propertyPath);
		const propIn = presetIn?.properties.find((p) => p.propertyPath === propertyPath);
		const propOut = presetOut?.properties.find((p) => p.propertyPath === propertyPath);

		const keys: ScalarAnimationKey[] = [];

		if (propIn && propOut) {
			// Both IN and OUT presets affect this property
			const valInStart = getPropertyValue(baseValue, propIn, "start");
			const valInEnd = getPropertyValue(baseValue, propIn, "end");
			const valOutStart = getPropertyValue(baseValue, propOut, "start");
			const valOutEnd = getPropertyValue(baseValue, propOut, "end");

			// Key 1: In Start (time 0)
			const key1: ScalarAnimationKey = {
				id: generateUUID(),
				time: mediaTimeFromSeconds({ seconds: 0 }),
				value: valInStart,
				segmentToNext: "bezier",
				tangentMode: "flat",
			};

			// Key 2: In End (time dIn)
			const key2: ScalarAnimationKey = {
				id: generateUUID(),
				time: mediaTimeFromSeconds({ seconds: dIn }),
				value: valInEnd,
				segmentToNext: "linear",
				tangentMode: "flat",
			};

			// Key 3: Out Start (time duration - dOut)
			const key3: ScalarAnimationKey = {
				id: generateUUID(),
				time: mediaTimeFromSeconds({ seconds: elementDurationSec - dOut }),
				value: valOutStart,
				segmentToNext: "bezier",
				tangentMode: "flat",
			};

			// Key 4: Out End (time duration)
			const key4: ScalarAnimationKey = {
				id: generateUUID(),
				time: mediaTimeFromSeconds({ seconds: elementDurationSec }),
				value: valOutEnd,
				segmentToNext: "linear",
				tangentMode: "flat",
			};

			// Set Bezier handles for transition In (Key 1 to Key 2)
			const handlesIn = getCurveHandlesForNormalizedCubicBezier({
				leftKey: key1,
				rightKey: key2,
				cubicBezier: CUBIC_BEZIER_IN,
				referenceSpanValue: valInEnd - valInStart || 1,
			});
			if (handlesIn) {
				key1.rightHandle = handlesIn.rightHandle;
				key2.leftHandle = handlesIn.leftHandle;
			}

			// Set Bezier handles for transition Out (Key 3 to Key 4)
			const handlesOut = getCurveHandlesForNormalizedCubicBezier({
				leftKey: key3,
				rightKey: key4,
				cubicBezier: CUBIC_BEZIER_OUT,
				referenceSpanValue: valOutEnd - valOutStart || 1,
			});
			if (handlesOut) {
				key3.rightHandle = handlesOut.rightHandle;
				key4.leftHandle = handlesOut.leftHandle;
			}

			keys.push(key1, key2, key3, key4);
		} else if (propIn) {
			// Only IN preset affects this property
			const valInStart = getPropertyValue(baseValue, propIn, "start");
			const valInEnd = getPropertyValue(baseValue, propIn, "end");

			const key1: ScalarAnimationKey = {
				id: generateUUID(),
				time: mediaTimeFromSeconds({ seconds: 0 }),
				value: valInStart,
				segmentToNext: "bezier",
				tangentMode: "flat",
			};

			const key2: ScalarAnimationKey = {
				id: generateUUID(),
				time: mediaTimeFromSeconds({ seconds: dIn }),
				value: valInEnd,
				segmentToNext: "linear",
				tangentMode: "flat",
			};

			const handlesIn = getCurveHandlesForNormalizedCubicBezier({
				leftKey: key1,
				rightKey: key2,
				cubicBezier: CUBIC_BEZIER_IN,
				referenceSpanValue: valInEnd - valInStart || 1,
			});
			if (handlesIn) {
				key1.rightHandle = handlesIn.rightHandle;
				key2.leftHandle = handlesIn.leftHandle;
			}

			keys.push(key1, key2);
		} else if (propOut) {
			// Only OUT preset affects this property
			const valOutStart = getPropertyValue(baseValue, propOut, "start");
			const valOutEnd = getPropertyValue(baseValue, propOut, "end");

			const key1: ScalarAnimationKey = {
				id: generateUUID(),
				time: mediaTimeFromSeconds({ seconds: elementDurationSec - dOut }),
				value: valOutStart,
				segmentToNext: "bezier",
				tangentMode: "flat",
			};

			const key2: ScalarAnimationKey = {
				id: generateUUID(),
				time: mediaTimeFromSeconds({ seconds: elementDurationSec }),
				value: valOutEnd,
				segmentToNext: "linear",
				tangentMode: "flat",
			};

			const handlesOut = getCurveHandlesForNormalizedCubicBezier({
				leftKey: key1,
				rightKey: key2,
				cubicBezier: CUBIC_BEZIER_OUT,
				referenceSpanValue: valOutEnd - valOutStart || 1,
			});
			if (handlesOut) {
				key1.rightHandle = handlesOut.rightHandle;
				key2.leftHandle = handlesOut.leftHandle;
			}

			keys.push(key1, key2);
		}

		nextAnimations[propertyPath] = {
			keys,
		};
	}

	return nextAnimations;
}
