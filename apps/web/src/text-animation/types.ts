import type { TimelineElement } from "@/timeline";

export type TextAnimationDirection = "in" | "out";

export interface PropertyAnimationDef {
	propertyPath: string;
	// Use absolute values
	absoluteStart?: number;
	absoluteEnd?: number;
	// Or offsets from the base value
	offsetStart?: number;
	offsetEnd?: number;
}

export interface TextAnimationPreset {
	id: string;
	name: string;
	direction: TextAnimationDirection;
	defaultDuration: number; // in seconds
	properties: PropertyAnimationDef[];
}
