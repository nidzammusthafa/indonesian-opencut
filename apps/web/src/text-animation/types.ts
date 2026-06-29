export type TextAnimationDirection = "in" | "out";

export interface PropertyAnimationDef {
	propertyPath: string;
	// Use absolute values
	absoluteStart?: number;
	absoluteEnd?: number;
	// Or offsets from the base value
	offsetStart?: number;
	offsetEnd?: number;
	// Or multiplier of the base value (useful for relative scale/opacity)
	multiplierStart?: number;
	multiplierEnd?: number;
}

export interface TextAnimationPreset {
	id: string;
	name: string;
	direction: TextAnimationDirection;
	defaultDuration: number; // in seconds
	properties: PropertyAnimationDef[];
}
