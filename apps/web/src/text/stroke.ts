export interface TextStroke {
	enabled: boolean;
	color: string;
	width: number; // piksel, range 1-10
	lineJoin?: "miter" | "round" | "bevel";
}

export const DEFAULT_TEXT_STROKE: TextStroke = {
	enabled: false,
	color: "#000000",
	width: 2,
	lineJoin: "round",
};
