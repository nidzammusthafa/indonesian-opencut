import type { ParamValues } from "@/params";

export interface TextStylePreset {
	id: string;
	name: string;
	values: ParamValues;
	createdAt: number;
}
