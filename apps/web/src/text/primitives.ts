import type { TextCanvasContext, TextBlockMeasurement } from "@/text/layout";
import { DEFAULTS } from "@/timeline/defaults";
import { clamp } from "@/utils/math";
import { CORNER_RADIUS_MAX, CORNER_RADIUS_MIN } from "./background";
import {
	drawTextDecoration,
	getTextBackgroundRect,
	measureTextBlock,
	setCanvasLetterSpacing,
} from "./layout";
import { FONT_SIZE_SCALE_REFERENCE } from "./typography";

export type TextAlign = "left" | "center" | "right";
export type TextFontWeight = "normal" | "bold";
export type TextFontStyle = "normal" | "italic";
export type TextDecoration = "none" | "underline" | "line-through";

export interface TextLayoutParams {
	content: string;
	fontSize: number;
	fontFamily: string;
	fontWeight: TextFontWeight;
	fontStyle: TextFontStyle;
	textAlign: TextAlign;
	textDecoration?: TextDecoration;
	letterSpacing?: number;
	lineHeight?: number;
}

export interface ResolvedTextLayout {
	scaledFontSize: number;
	fontString: string;
	letterSpacing: number;
	lineHeightPx: number;
	fontSizeRatio: number;
	textAlign: TextAlign;
	textDecoration: TextDecoration;
}

export interface MeasuredTextLayout extends ResolvedTextLayout {
	lines: string[];
	lineMetrics: TextMetrics[];
	block: TextBlockMeasurement;
}

export interface ResolvedTextBackgroundLike {
	enabled: boolean;
	color: string;
	paddingX: number;
	paddingY: number;
	offsetX: number;
	offsetY: number;
	cornerRadius: number;
	opacity?: number;
}

export function quoteFontFamily({ fontFamily }: { fontFamily: string }): string {
	return `"${fontFamily.replace(/"/g, '\\"')}"`;
}

export function buildTextFontString({
	fontFamily,
	fontWeight,
	fontStyle,
	scaledFontSize,
}: {
	fontFamily: string;
	fontWeight: TextFontWeight;
	fontStyle: TextFontStyle;
	scaledFontSize: number;
}): string {
	return `${fontStyle} ${fontWeight} ${scaledFontSize}px ${quoteFontFamily({ fontFamily })}, sans-serif`;
}

export function resolveTextLayout({
	text,
	canvasHeight,
}: {
	text: TextLayoutParams;
	canvasHeight: number;
}): ResolvedTextLayout {
	const scaledFontSize =
		text.fontSize * (canvasHeight / FONT_SIZE_SCALE_REFERENCE);
	const fontWeight = text.fontWeight === "bold" ? "bold" : "normal";
	const fontStyle = text.fontStyle === "italic" ? "italic" : "normal";
	const letterSpacing = text.letterSpacing ?? DEFAULTS.text.letterSpacing;
	const lineHeightPx =
		scaledFontSize * (text.lineHeight ?? DEFAULTS.text.lineHeight);
	const fontSizeRatio = text.fontSize / 15;

	return {
		scaledFontSize,
		fontString: buildTextFontString({
			fontFamily: text.fontFamily,
			fontWeight,
			fontStyle,
			scaledFontSize,
		}),
		letterSpacing,
		lineHeightPx,
		fontSizeRatio,
		textAlign: text.textAlign,
		textDecoration: text.textDecoration ?? "none",
	};
}

export function measureTextLayout({
	text,
	canvasHeight,
	ctx,
}: {
	text: TextLayoutParams;
	canvasHeight: number;
	ctx: TextCanvasContext;
}): MeasuredTextLayout {
	const resolvedLayout = resolveTextLayout({ text, canvasHeight });
	const lines = text.content.split("\n");

	ctx.save();
	ctx.font = resolvedLayout.fontString;
	ctx.textBaseline = "middle";
	setCanvasLetterSpacing({
		ctx,
		letterSpacingPx: resolvedLayout.letterSpacing,
	});
	const lineMetrics = lines.map((line) => ctx.measureText(line));
	ctx.restore();

	const block = measureTextBlock({
		lineMetrics,
		lineHeightPx: resolvedLayout.lineHeightPx,
	});

	return {
		...resolvedLayout,
		lines,
		lineMetrics,
		block,
	};
}

export function drawMeasuredTextLayout({
	ctx,
	layout,
	textColor,
	background,
	backgroundColor,
	stroke,
	highlight,
	textBaseline = "middle",
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	textColor: string;
	background?: ResolvedTextBackgroundLike | null;
	backgroundColor?: string;
	stroke?: {
		enabled: boolean;
		color: string;
		width: number;
	} | null;
	highlight?: {
		enabled: boolean;
		color: string;
		activeWordIndex: number;
		borderColor?: string;
		borderWidth?: number;
		fontSize?: number; // scale multiplier e.g. 1.2 = 20% bigger
	} | null;
	textBaseline?: CanvasTextBaseline;
}): void {
	ctx.font = layout.fontString;
	ctx.textAlign = layout.textAlign;
	ctx.textBaseline = textBaseline;
	ctx.fillStyle = textColor;
	setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });

	if (
		background?.enabled &&
		backgroundColor &&
		backgroundColor !== "transparent" &&
		layout.lines.length > 0
	) {
		const backgroundRect = getTextBackgroundRect({
			textAlign: layout.textAlign,
			block: layout.block,
			background: {
				...background,
				color: backgroundColor,
			},
			fontSizeRatio: layout.fontSizeRatio,
		});
		if (backgroundRect) {
			const p =
				clamp({
					value: background.cornerRadius,
					min: CORNER_RADIUS_MIN,
					max: CORNER_RADIUS_MAX,
				}) / 100;
			const radius =
				(Math.min(backgroundRect.width, backgroundRect.height) / 2) * p;
			const originalAlpha = ctx.globalAlpha;
			const opacity = background.opacity !== undefined ? background.opacity / 100 : 1;
			ctx.globalAlpha = originalAlpha * opacity;
			ctx.fillStyle = backgroundColor;
			ctx.beginPath();
			ctx.roundRect(
				backgroundRect.left,
				backgroundRect.top,
				backgroundRect.width,
				backgroundRect.height,
				radius,
			);
			ctx.fill();
			ctx.globalAlpha = originalAlpha;
			ctx.fillStyle = textColor;
		}
	}

	let globalWordCounter = 0;

	for (let index = 0; index < layout.lines.length; index++) {
		const lineY = index * layout.lineHeightPx - layout.block.visualCenterOffset;
		const line = layout.lines[index];

		if (highlight?.enabled) {
			const words = line.split(" ");
			const highlightFontScale = highlight.fontSize ?? 1;

			// --- Pass 1: measure each word's width using its actual font ---
			// We need to know the scaled width of the active word to correctly
			// compute the total line width for alignment offset.
			const wordWidths: number[] = [];
			let totalLineWidth = 0;

			for (let w = 0; w < words.length; w++) {
				const isActive = (globalWordCounter + w) === highlight.activeWordIndex;
				const wordSpace = words[w] + (w < words.length - 1 ? " " : "");

				if (isActive && highlightFontScale !== 1) {
					// Temporarily switch to scaled font to measure
					const scaledFont = layout.fontString.replace(
						/(\d+(?:\.\d+)?)px/,
						(_match, size) => `${parseFloat(size) * highlightFontScale}px`,
					);
					ctx.save();
					ctx.font = scaledFont;
					setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });
					const w_scaled = ctx.measureText(wordSpace).width;
					ctx.restore();
					wordWidths.push(w_scaled);
					totalLineWidth += w_scaled;
				} else {
					// Normal font
					ctx.save();
					ctx.font = layout.fontString;
					setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });
					const w_normal = ctx.measureText(wordSpace).width;
					ctx.restore();
					wordWidths.push(w_normal);
					totalLineWidth += w_normal;
				}
			}

			// --- Compute start X based on alignment using true total width ---
			let currentX = 0;
			if (layout.textAlign === "center") {
				currentX = -totalLineWidth / 2;
			} else if (layout.textAlign === "right") {
				currentX = -totalLineWidth;
			}
			// "left" → currentX stays 0

			const originalTextAlign: CanvasTextAlign = ctx.textAlign;
			ctx.textAlign = "left";

			// --- Pass 2: draw each word at its computed position ---
			for (let w = 0; w < words.length; w++) {
				const word = words[w];
				const isWordActive = globalWordCounter === highlight.activeWordIndex;
				const wordSpace = word + (w < words.length - 1 ? " " : "");
				const scaledWordWidth = wordWidths[w];

				ctx.save();

				if (isWordActive && highlightFontScale !== 1) {
					// Scale font for active word
					const scaledFont = layout.fontString.replace(
						/(\d+(?:\.\d+)?)px/,
						(_match, size) => `${parseFloat(size) * highlightFontScale}px`,
					);
					ctx.font = scaledFont;
					setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });
				} else {
					ctx.font = layout.fontString;
					setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });
				}

				// Draw position — already correct because we used scaled widths in Pass 1
				const drawX = currentX;

				if (isWordActive) {
					ctx.fillStyle = highlight.color;
				} else {
					ctx.fillStyle = textColor;
				}

				// Global stroke (text border)
				if (stroke?.enabled) {
					ctx.strokeStyle = stroke.color;
					ctx.lineWidth = stroke.width * (layout.scaledFontSize / 15);
					ctx.lineJoin = "round";
					ctx.lineCap = "round";
					ctx.strokeText(wordSpace, drawX, lineY);
				}

				// Highlight border for active word
				if (isWordActive && highlight.borderWidth && highlight.borderWidth > 0) {
					ctx.strokeStyle = highlight.borderColor ?? "#000000";
					ctx.lineWidth = highlight.borderWidth * (layout.scaledFontSize / 15);
					ctx.lineJoin = "round";
					ctx.lineCap = "round";
					ctx.strokeText(wordSpace, drawX, lineY);
				}

				ctx.fillText(wordSpace, drawX, lineY);
				ctx.restore();

				// Advance X by the pre-measured scaled word width
				currentX += scaledWordWidth;
				globalWordCounter++;
			}

			ctx.textAlign = originalTextAlign;
		} else {
			if (stroke?.enabled) {
				ctx.strokeStyle = stroke.color;
				ctx.lineWidth = stroke.width * (layout.scaledFontSize / 15);
				ctx.lineJoin = "round";
				ctx.lineCap = "round";
				ctx.strokeText(line, 0, lineY);
			}
			ctx.fillText(line, 0, lineY);
		}

		drawTextDecoration({
			ctx,
			textDecoration: layout.textDecoration,
			lineWidth: layout.lineMetrics[index].width,
			lineY,
			metrics: layout.lineMetrics[index],
			scaledFontSize: layout.scaledFontSize,
			textAlign: layout.textAlign,
		});
	}
}

export function strokeMeasuredTextLayout({
	ctx,
	layout,
	strokeColor,
	strokeWidth,
	textBaseline = "middle",
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	strokeColor: string;
	strokeWidth: number;
	textBaseline?: CanvasTextBaseline;
}): void {
	ctx.font = layout.fontString;
	ctx.textAlign = layout.textAlign;
	ctx.textBaseline = textBaseline;
	ctx.strokeStyle = strokeColor;
	ctx.lineWidth = strokeWidth;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });

	for (let index = 0; index < layout.lines.length; index++) {
		const lineY = index * layout.lineHeightPx - layout.block.visualCenterOffset;
		ctx.strokeText(layout.lines[index], 0, lineY);
	}
}
