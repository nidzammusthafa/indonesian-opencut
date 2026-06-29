import type { TextAnimationPreset } from "./types";

export const CUBIC_BEZIER_IN: [number, number, number, number] = [0, 0, 0.2, 1]; // ease-out
export const CUBIC_BEZIER_OUT: [number, number, number, number] = [0.8, 0, 1, 1]; // ease-in

export const TEXT_ANIMATION_PRESETS: TextAnimationPreset[] = [
	// --- IN ANIMATIONS ---
	{
		id: "fade-in",
		name: "Fade In",
		direction: "in",
		defaultDuration: 0.4,
		properties: [
			// Start: 0, End: baseValue (dynamic user opacity)
			{ propertyPath: "opacity", absoluteStart: 0 },
		],
	},
	{
		id: "slide-up",
		name: "Slide Up",
		direction: "in",
		defaultDuration: 0.4,
		properties: [
			{ propertyPath: "transform.positionY", offsetStart: 80, offsetEnd: 0 },
		],
	},
	{
		id: "slide-down",
		name: "Slide Down",
		direction: "in",
		defaultDuration: 0.4,
		properties: [
			{ propertyPath: "transform.positionY", offsetStart: -80, offsetEnd: 0 },
		],
	},
	{
		id: "slide-left",
		name: "Slide Left",
		direction: "in",
		defaultDuration: 0.4,
		properties: [
			{ propertyPath: "transform.positionX", offsetStart: 120, offsetEnd: 0 },
		],
	},
	{
		id: "slide-right",
		name: "Slide Right",
		direction: "in",
		defaultDuration: 0.4,
		properties: [
			{ propertyPath: "transform.positionX", offsetStart: -120, offsetEnd: 0 },
		],
	},
	{
		id: "zoom-in",
		name: "Zoom In",
		direction: "in",
		defaultDuration: 0.4,
		properties: [
			// Start: 0.5 * baseValue, End: baseValue (dynamic user scale)
			{ propertyPath: "transform.scaleX", multiplierStart: 0.5 },
			{ propertyPath: "transform.scaleY", multiplierStart: 0.5 },
		],
	},
	{
		id: "zoom-out",
		name: "Zoom Out",
		direction: "in",
		defaultDuration: 0.4,
		properties: [
			// Start: 1.5 * baseValue, End: baseValue (dynamic user scale)
			{ propertyPath: "transform.scaleX", multiplierStart: 1.5 },
			{ propertyPath: "transform.scaleY", multiplierStart: 1.5 },
		],
	},
	{
		id: "rise-fade",
		name: "Rise & Fade",
		direction: "in",
		defaultDuration: 0.5,
		properties: [
			{ propertyPath: "opacity", absoluteStart: 0 },
			{ propertyPath: "transform.positionY", offsetStart: 80, offsetEnd: 0 },
		],
	},
	{
		id: "scale-fade",
		name: "Scale & Fade",
		direction: "in",
		defaultDuration: 0.5,
		properties: [
			{ propertyPath: "opacity", absoluteStart: 0 },
			{ propertyPath: "transform.scaleX", multiplierStart: 0.5 },
			{ propertyPath: "transform.scaleY", multiplierStart: 0.5 },
		],
	},
	{
		id: "typewriter",
		name: "Typewriter Effect",
		direction: "in",
		defaultDuration: 0.8,
		properties: [
			{ propertyPath: "opacity", absoluteStart: 0 },
		],
	},

	// --- OUT ANIMATIONS ---
	{
		id: "fade-out",
		name: "Fade Out",
		direction: "out",
		defaultDuration: 0.3,
		properties: [
			// Start: baseValue, End: 0
			{ propertyPath: "opacity", absoluteEnd: 0 },
		],
	},
	{
		id: "slide-up-out",
		name: "Slide Up Out",
		direction: "out",
		defaultDuration: 0.3,
		properties: [
			{ propertyPath: "transform.positionY", offsetStart: 0, offsetEnd: -80 },
		],
	},
	{
		id: "slide-down-out",
		name: "Slide Down Out",
		direction: "out",
		defaultDuration: 0.3,
		properties: [
			{ propertyPath: "transform.positionY", offsetStart: 0, offsetEnd: 80 },
		],
	},
	{
		id: "slide-left-out",
		name: "Slide Left Out",
		direction: "out",
		defaultDuration: 0.3,
		properties: [
			{ propertyPath: "transform.positionX", offsetStart: 0, offsetEnd: -120 },
		],
	},
	{
		id: "slide-right-out",
		name: "Slide Right Out",
		direction: "out",
		defaultDuration: 0.3,
		properties: [
			{ propertyPath: "transform.positionX", offsetStart: 0, offsetEnd: 120 },
		],
	},
	{
		id: "zoom-in-out",
		name: "Zoom In Out",
		direction: "out",
		defaultDuration: 0.3,
		properties: [
			// Start: baseValue, End: 0.5 * baseValue
			{ propertyPath: "transform.scaleX", multiplierEnd: 0.5 },
			{ propertyPath: "transform.scaleY", multiplierEnd: 0.5 },
		],
	},
	{
		id: "sink-fade",
		name: "Sink & Fade",
		direction: "out",
		defaultDuration: 0.4,
		properties: [
			{ propertyPath: "opacity", absoluteEnd: 0 },
			{ propertyPath: "transform.positionY", offsetStart: 0, offsetEnd: 80 },
		],
	},
];
