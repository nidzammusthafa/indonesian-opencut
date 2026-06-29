"use client";

import { resolveAnimationPathValueAtTime } from "@/animation";
import { Section, SectionContent, SectionFields } from "@/components/section";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { useKeyframedParamProperty } from "@/components/editor/panels/properties/hooks/use-keyframed-param-property";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import type { ParamValue, ParamValues } from "@/params";
import {
	getElementParams,
	readElementParamValue,
	writeElementParamValue,
	type ElementParamDefinition,
} from "@/params/registry";
import type { TimelineElement } from "@/timeline";
import type { MediaTime } from "@/wasm";
import { useEditor } from "@/editor/use-editor";
import { useCaptionGlobalSync } from "@/subtitles/hooks/use-caption-global-sync";
import { useState } from "react";
import { Save, Check, Download } from "lucide-react";
import { UpdateElementsCommand } from "@/commands";
import { useCaptionGlobalModeStore } from "@/subtitles/stores/caption-global-mode-store";

export function ElementParamsTab({
	element,
	trackId,
	paramKeys,
	sectionKey,
}: {
	element: TimelineElement;
	trackId: string;
	paramKeys?: readonly string[];
	sectionKey: string;
}) {
	const editor = useEditor();
	useEditor((e) => e.timeline.getPreviewTracks());

	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const allParams = getElementParams({ element });
	const params = allParams.filter(
		(param) => !paramKeys || paramKeys.includes(param.key),
	);
	const baseValues = buildValues({ element, params });
	const allBaseValues = buildValues({ element, params: allParams });

	const isTextElement = element.type === "text";
	const isCaptionGlobalMode = useCaptionGlobalModeStore((s) => s.isGlobalMode);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [applySuccess, setApplySuccess] = useState(false);
	const handleSaveStyle = () => {
		const styleParams = [
			"fontFamily",
			"fontSize",
			"color",
			"textAlign",
			"fontWeight",
			"fontStyle",
			"textDecoration",
			"letterSpacing",
			"lineHeight",
			"background.enabled",
			"background.color",
			"background.opacity",
			"background.cornerRadius",
			"background.paddingX",
			"background.paddingY",
			"background.offsetX",
			"background.offsetY",
			"stroke.enabled",
			"stroke.color",
			"stroke.width",
			"highlight.enabled",
			"highlight.color",
			"highlight.borderColor",
			"highlight.borderWidth",
			"highlight.fontSize",
			"transform.positionX",
			"transform.positionY",
			"transform.scaleX",
			"transform.scaleY",
			"transform.rotate",
			"opacity",
			"blendMode",
		];
		const savedStyle: ParamValues = {};
		for (const key of styleParams) {
			const param = allParams.find((p) => p.key === key);
			if (param) {
				savedStyle[key] = allBaseValues[key] ?? param.default;
			}
		}
		localStorage.setItem("default-caption-style", JSON.stringify(savedStyle));

		setSaveSuccess(true);
		setTimeout(() => setSaveSuccess(false), 2000);
	};

	const handleApplyStyle = () => {
		const saved = localStorage.getItem("default-caption-style");
		if (!saved) return;
		try {
			const savedStyle = parseSavedParamValues({ raw: saved });
			const updates: ParamValues = {};
			for (const [key, value] of Object.entries(savedStyle)) {
				updates[key] = value;
			}

			const elementIds = [element.id];
			if (isCaptionGlobalMode) {
				const activeScene = editor.scenes.getActiveScene();
				const track = activeScene.tracks.overlay.find((t) => t.id === trackId);
				if (track) {
					for (const el of track.elements) {
						if (el.id !== element.id) {
							elementIds.push(el.id);
						}
					}
				}
			}

			const command = new UpdateElementsCommand({
				updates: elementIds.map((id) => ({
					elementId: id,
					trackId,
					patch: {
						params: updates,
					},
				})),
			});
			editor.command.execute({ command });

			setApplySuccess(true);
			setTimeout(() => setApplySuccess(false), 2000);
		} catch (_e) {
			// ignore
		}
	};

	return (
		<Section sectionKey={`${element.id}:${sectionKey}`}>
			<SectionContent className="pt-4">
				<SectionFields>
					{params
						.filter((param) => isVisible({ param, values: baseValues }))
						.map((param) => (
							<ElementParamField
								key={param.key}
								element={element}
								trackId={trackId}
								param={param}
								baseValue={baseValues[param.key] ?? param.default}
								localTime={localTime}
								isPlayheadWithinElementRange={isPlayheadWithinElementRange}
							/>
						))}
				</SectionFields>
				{isTextElement && (
					<div className="flex gap-2 mt-4 pt-4 border-t border-zinc-800">
						<button
							type="button"
							onClick={handleSaveStyle}
							className="flex-1 h-8 rounded-md bg-primary text-primary-foreground font-medium text-xs flex items-center justify-center gap-1 cursor-pointer hover:bg-primary/90 transition-colors"
						>
							{saveSuccess ? (
								<>
									<Check size={12} className="text-green-300" />
									Style Saved!
								</>
							) : (
								<>
									<Save size={12} />
									Save Style
								</>
							)}
						</button>
						<button
							type="button"
							onClick={handleApplyStyle}
							className="flex-1 h-8 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 font-medium text-xs flex items-center justify-center gap-1 cursor-pointer hover:bg-zinc-800 transition-colors"
						>
							{applySuccess ? (
								<>
									<Check size={12} className="text-green-500" />
									Style Applied!
								</>
							) : (
								<>
									<Download size={12} />
									Apply Style
								</>
							)}
						</button>
					</div>
				)}
			</SectionContent>
		</Section>
	);
}

function ElementParamField({
	element,
	trackId,
	param,
	baseValue,
	localTime,
	isPlayheadWithinElementRange,
}: {
	element: TimelineElement;
	trackId: string;
	param: ElementParamDefinition;
	baseValue: ParamValue;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
}) {
	const resolvedValue = resolveAnimationPathValueAtTime({
		animations: element.animations,
		propertyPath: param.key,
		localTime,
		fallbackValue: baseValue,
	});

	// Hook untuk sinkronisasi global caption
	// Hanya aktif jika element adalah text (caption) dan param adalah style param
	const { expandPreviewToSiblings } = useCaptionGlobalSync({
		element,
		trackId,
		param,
	});

	const animatedParam = useKeyframedParamProperty({
		param,
		trackId,
		elementId: element.id,
		animations: element.animations,
		propertyPath: param.key,
		localTime,
		isPlayheadWithinElementRange,
		resolvedValue,
		buildBaseUpdates: ({ value }) =>
			writeElementParamValue({ element, param, value }),
	});

	// Wrap onPreview: update caption yang dipilih + semua sibling caption jika global mode aktif
	const handlePreview = (value: number | string | boolean) => {
		animatedParam.onPreview(value);
		expandPreviewToSiblings(value);
	};

	return (
		<PropertyParamField
			param={param}
			value={resolvedValue}
			onPreview={handlePreview}
			onCommit={animatedParam.onCommit}
			keyframe={
				param.keyframable === false
					? undefined
					: {
							isActive: animatedParam.isKeyframedAtTime,
							isDisabled: !isPlayheadWithinElementRange,
							onToggle: animatedParam.toggleKeyframe,
						}
			}
		/>
	);
}

function buildValues({
	element,
	params,
}: {
	element: TimelineElement;
	params: readonly ElementParamDefinition[];
}): ParamValues {
	const values: ParamValues = {};
	for (const param of params) {
		const value = readElementParamValue({ element, param });
		if (value !== null) {
			values[param.key] = value;
		}
	}
	return values;
}

function isParamValue(value: unknown): value is ParamValue {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

function parseSavedParamValues({ raw }: { raw: string }): ParamValues {
	const parsed: unknown = JSON.parse(raw);
	const values: ParamValues = {};
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return values;
	}

	for (const [key, value] of Object.entries(parsed)) {
		if (isParamValue(value)) {
			values[key] = value;
		}
	}
	return values;
}

function isVisible({
	param,
	values,
}: {
	param: ElementParamDefinition;
	values: ParamValues;
}): boolean {
	return (param.dependencies ?? []).every((dependency) =>
		areParamValuesEqual({
			left: values[dependency.param],
			right: dependency.equals,
		}),
	);
}

function areParamValuesEqual({
	left,
	right,
}: {
	left: ParamValue | undefined;
	right: ParamValue;
}): boolean {
	return left === right;
}
