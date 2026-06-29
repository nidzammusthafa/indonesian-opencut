import { FONT_SIZE_SCALE_REFERENCE } from "@/text/typography";
import {
	getTextVisualRect,
	measureTextBlock,
	setCanvasLetterSpacing,
} from "@/text/layout";
import { DEFAULTS } from "@/timeline/defaults";
import { mediaTimeFromSeconds } from "@/wasm";
import type { CreateTextElement } from "@/timeline";
import type { ParamValue, ParamValues } from "@/params";
import type { TextBackground } from "@/text/background";
import type { TextStroke } from "@/text/stroke";
import type {
	TextAlign,
	TextDecoration,
	TextFontStyle,
	TextFontWeight,
} from "@/text/primitives";
import type { SubtitleCue, SubtitleStyleOverrides } from "./types";

const SUBTITLE_MAX_WIDTH_RATIO = 0.8;
const SUBTITLE_BOTTOM_MARGIN_RATIO = 0.15;
const SUBTITLE_FONT_SIZE = 5;
const MEASUREMENT_CANVAS_SIZE = 4096;

function quoteFontFamily({ fontFamily }: { fontFamily: string }): string {
	return `"${fontFamily.replace(/"/g, '\\"')}"`;
}

function createMeasurementContext(): CanvasRenderingContext2D | null {
	const canvas = document.createElement("canvas");
	canvas.width = MEASUREMENT_CANVAS_SIZE;
	canvas.height = MEASUREMENT_CANVAS_SIZE;
	return canvas.getContext("2d");
}

function measureLineWidth({
	ctx,
	text,
}: {
	ctx: CanvasRenderingContext2D;
	text: string;
}): number {
	return ctx.measureText(text).width;
}

function wrapSubtitleText({
	ctx,
	text,
	maxWidth,
}: {
	ctx: CanvasRenderingContext2D;
	text: string;
	maxWidth: number;
}): string {
	const normalized = text.trim().replace(/\r\n/g, "\n");
	const paragraphs = normalized.split("\n");
	const wrappedParagraphs: string[] = [];

	for (const paragraph of paragraphs) {
		const trimmedParagraph = paragraph.trim();
		if (!trimmedParagraph) {
			wrappedParagraphs.push("");
			continue;
		}

		const words = trimmedParagraph.split(/\s+/);
		let currentLine = words[0] ?? "";
		const lines: string[] = [];

		for (let i = 1; i < words.length; i++) {
			const nextLine = `${currentLine} ${words[i]}`;
			if (measureLineWidth({ ctx, text: nextLine }) <= maxWidth) {
				currentLine = nextLine;
				continue;
			}

			lines.push(currentLine);
			currentLine = words[i];
		}

		lines.push(currentLine);

		if (lines.length > 2) {
			// Balanced split: find the split point that makes the two lines as equal in character length as possible.
			let bestSplit = 1;
			let minDiff = Infinity;

			for (let i = 1; i < words.length; i++) {
				const line1 = words.slice(0, i).join(" ");
				const line2 = words.slice(i).join(" ");
				const diff = Math.abs(line1.length - line2.length);
				if (diff < minDiff) {
					minDiff = diff;
					bestSplit = i;
				}
			}

			const line1 = words.slice(0, bestSplit).join(" ");
			const line2 = words.slice(bestSplit).join(" ");
			wrappedParagraphs.push([line1, line2].join("\n"));
		} else {
			wrappedParagraphs.push(lines.join("\n"));
		}
	}

	return wrappedParagraphs.join("\n");
}

function measureWrappedTextBlock({
	ctx,
	content,
	canvasHeight,
	textAlign,
	background,
	fontSize,
	lineHeight,
}: {
	ctx: CanvasRenderingContext2D;
	content: string;
	canvasHeight: number;
	textAlign: TextAlign;
	background: TextBackground;
	fontSize: number;
	lineHeight: number;
}) {
	const scaledFontSize = fontSize * (canvasHeight / FONT_SIZE_SCALE_REFERENCE);
	const lineHeightPx = lineHeight * scaledFontSize;
	const lines = content.split("\n");
	const lineMetrics = lines.map((line) => ctx.measureText(line));

	const block = measureTextBlock({
		lineMetrics,
		lineHeightPx,
	});
	const visualRect = getTextVisualRect({
		textAlign,
		block,
		background,
		fontSizeRatio: fontSize / 15,
	});

	return {
		block,
		visualRect,
	};
}

function isParamValue(value: unknown): value is ParamValue {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

function readSavedCaptionStyle(): ParamValues {
	if (typeof window === "undefined") return {};
	const saved = localStorage.getItem("default-caption-style");
	if (!saved) return {};

	try {
		const parsed: unknown = JSON.parse(saved);
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
	} catch (_e) {
		return {};
	}
}

function readSavedNumber({
	style,
	key,
	fallback,
}: {
	style: ParamValues;
	key: string;
	fallback: number;
}): number {
	const value = style[key];
	return typeof value === "number" ? value : fallback;
}

function readSavedString({
	style,
	key,
	fallback,
}: {
	style: ParamValues;
	key: string;
	fallback: string;
}): string {
	const value = style[key];
	return typeof value === "string" ? value : fallback;
}

function readSavedBoolean({
	style,
	key,
	fallback,
}: {
	style: ParamValues;
	key: string;
	fallback: boolean;
}): boolean {
	const value = style[key];
	return typeof value === "boolean" ? value : fallback;
}

function readSavedTextAlign({
	style,
	key,
	fallback,
}: {
	style: ParamValues;
	key: string;
	fallback: TextAlign;
}): TextAlign {
	const value = style[key];
	if (value === "left" || value === "center" || value === "right") {
		return value;
	}
	return fallback;
}

function readSavedFontWeight({
	style,
	key,
	fallback,
}: {
	style: ParamValues;
	key: string;
	fallback: TextFontWeight;
}): TextFontWeight {
	const value = style[key];
	if (value === "normal" || value === "bold") {
		return value;
	}
	return fallback;
}

function readSavedFontStyle({
	style,
	key,
	fallback,
}: {
	style: ParamValues;
	key: string;
	fallback: TextFontStyle;
}): TextFontStyle {
	const value = style[key];
	if (value === "normal" || value === "italic") {
		return value;
	}
	return fallback;
}

function readSavedTextDecoration({
	style,
	key,
	fallback,
}: {
	style: ParamValues;
	key: string;
	fallback: TextDecoration;
}): TextDecoration {
	const value = style[key];
	if (value === "none" || value === "underline" || value === "line-through") {
		return value;
	}
	return fallback;
}

function resolveSubtitleStyle({
	style,
}: {
	style: SubtitleStyleOverrides | undefined;
}): {
	fontFamily: string;
	fontSize: number;
	color: string;
	textAlign: TextAlign;
	fontWeight: TextFontWeight;
	fontStyle: TextFontStyle;
	textDecoration: TextDecoration;
	letterSpacing: number;
	lineHeight: number;
	background: TextBackground;
	stroke: TextStroke;
	highlightColor: string;
	highlightEnabled: boolean;
	highlightBorderColor: string;
	highlightBorderWidth: number;
	highlightFontSize: number | undefined;
	transformPositionX: number | undefined;
	transformPositionY: number | undefined;
	transformScaleX: number;
	transformScaleY: number;
	transformRotate: number;
	opacity: number;
	blendMode: string;
	placement: NonNullable<SubtitleStyleOverrides["placement"]>;
} {
	const savedStyle = readSavedCaptionStyle();

	const fontSize =
		style?.fontSizeRatioOfPlayHeight != null
			? style.fontSizeRatioOfPlayHeight * FONT_SIZE_SCALE_REFERENCE
			: (style?.fontSize ??
				readSavedNumber({
					style: savedStyle,
					key: "fontSize",
					fallback: SUBTITLE_FONT_SIZE,
				}));

	return {
		fontFamily:
			style?.fontFamily ??
			readSavedString({
				style: savedStyle,
				key: "fontFamily",
				fallback: "Arial",
			}),
		fontSize,
		color:
			style?.color ??
			readSavedString({ style: savedStyle, key: "color", fallback: "#ffffff" }),
		textAlign:
			style?.textAlign ??
			readSavedTextAlign({
				style: savedStyle,
				key: "textAlign",
				fallback: "center",
			}),
		fontWeight:
			style?.fontWeight ??
			readSavedFontWeight({
				style: savedStyle,
				key: "fontWeight",
				fallback: "bold",
			}),
		fontStyle:
			style?.fontStyle ??
			readSavedFontStyle({
				style: savedStyle,
				key: "fontStyle",
				fallback: "normal",
			}),
		textDecoration:
			style?.textDecoration ??
			readSavedTextDecoration({
				style: savedStyle,
				key: "textDecoration",
				fallback: "none",
			}),
		letterSpacing:
			style?.letterSpacing ??
			readSavedNumber({
				style: savedStyle,
				key: "letterSpacing",
				fallback: DEFAULTS.text.letterSpacing,
			}),
		lineHeight:
			style?.lineHeight ??
			readSavedNumber({
				style: savedStyle,
				key: "lineHeight",
				fallback: DEFAULTS.text.lineHeight,
			}),
		background: {
			...DEFAULTS.text.background,
			enabled: readSavedBoolean({
				style: savedStyle,
				key: "background.enabled",
				fallback: false,
			}),
			color: readSavedString({
				style: savedStyle,
				key: "background.color",
				fallback: DEFAULTS.text.background.color,
			}),
			opacity: readSavedNumber({
				style: savedStyle,
				key: "background.opacity",
				fallback: DEFAULTS.text.background.opacity,
			}),
			cornerRadius: readSavedNumber({
				style: savedStyle,
				key: "background.cornerRadius",
				fallback: DEFAULTS.text.background.cornerRadius,
			}),
			paddingX: readSavedNumber({
				style: savedStyle,
				key: "background.paddingX",
				fallback: DEFAULTS.text.background.paddingX,
			}),
			paddingY: readSavedNumber({
				style: savedStyle,
				key: "background.paddingY",
				fallback: DEFAULTS.text.background.paddingY,
			}),
			offsetX: readSavedNumber({
				style: savedStyle,
				key: "background.offsetX",
				fallback: DEFAULTS.text.background.offsetX,
			}),
			offsetY: readSavedNumber({
				style: savedStyle,
				key: "background.offsetY",
				fallback: DEFAULTS.text.background.offsetY,
			}),
			...(style?.background ?? {}),
		},
		stroke: style?.stroke ?? {
			enabled: readSavedBoolean({
				style: savedStyle,
				key: "stroke.enabled",
				fallback: false,
			}),
			color: readSavedString({
				style: savedStyle,
				key: "stroke.color",
				fallback: "#000000",
			}),
			width: readSavedNumber({
				style: savedStyle,
				key: "stroke.width",
				fallback: 2,
			}),
		},
		highlightColor:
			style?.highlightColor ??
			readSavedString({
				style: savedStyle,
				key: "highlight.color",
				fallback: "#FACC15",
			}),
		highlightEnabled:
			style?.highlightEnabled ??
			readSavedBoolean({
				style: savedStyle,
				key: "highlight.enabled",
				fallback: false,
			}),
		highlightBorderColor: readSavedString({
			style: savedStyle,
			key: "highlight.borderColor",
			fallback: "#000000",
		}),
		highlightBorderWidth: readSavedNumber({
			style: savedStyle,
			key: "highlight.borderWidth",
			fallback: 0,
		}),
		highlightFontSize:
			typeof savedStyle["highlight.fontSize"] === "number"
				? savedStyle["highlight.fontSize"]
				: undefined,
		transformPositionX:
			typeof savedStyle["transform.positionX"] === "number"
				? savedStyle["transform.positionX"]
				: undefined,
		transformPositionY:
			typeof savedStyle["transform.positionY"] === "number"
				? savedStyle["transform.positionY"]
				: undefined,
		transformScaleX: readSavedNumber({
			style: savedStyle,
			key: "transform.scaleX",
			fallback: DEFAULTS.element.transform.scaleX,
		}),
		transformScaleY: readSavedNumber({
			style: savedStyle,
			key: "transform.scaleY",
			fallback: DEFAULTS.element.transform.scaleY,
		}),
		transformRotate: readSavedNumber({
			style: savedStyle,
			key: "transform.rotate",
			fallback: DEFAULTS.element.transform.rotate,
		}),
		opacity: readSavedNumber({
			style: savedStyle,
			key: "opacity",
			fallback: DEFAULTS.element.opacity,
		}),
		blendMode: readSavedString({
			style: savedStyle,
			key: "blendMode",
			fallback: DEFAULTS.element.blendMode,
		}),
		placement: {
			verticalAlign: style?.placement?.verticalAlign ?? "bottom",
			marginLeftRatio: style?.placement?.marginLeftRatio,
			marginRightRatio: style?.placement?.marginRightRatio,
			marginVerticalRatio: style?.placement?.marginVerticalRatio,
		},
	};
}

function resolveTargetWidth({
	canvasWidth,
	placement,
}: {
	canvasWidth: number;
	placement: ReturnType<typeof resolveSubtitleStyle>["placement"];
}): number {
	const leftRatio = placement.marginLeftRatio ?? 0;
	const rightRatio = placement.marginRightRatio ?? 0;
	const hasExplicitMargins = leftRatio > 0 || rightRatio > 0;
	if (!hasExplicitMargins) {
		return canvasWidth * SUBTITLE_MAX_WIDTH_RATIO;
	}

	const availableWidth = canvasWidth * (1 - leftRatio - rightRatio);
	return Math.max(0, availableWidth);
}

function resolvePositionX({
	canvasWidth,
	textAlign,
	placement,
	visualRect,
}: {
	canvasWidth: number;
	textAlign: TextAlign;
	placement: ReturnType<typeof resolveSubtitleStyle>["placement"];
	visualRect: { left: number; width: number };
}): number {
	const leftMargin = canvasWidth * (placement.marginLeftRatio ?? 0);
	const rightMargin = canvasWidth * (placement.marginRightRatio ?? 0);
	const canvasCenterX = canvasWidth / 2;

	if (textAlign === "left") {
		return leftMargin - visualRect.left - canvasCenterX;
	}

	if (textAlign === "right") {
		return (
			canvasWidth -
			rightMargin -
			(visualRect.left + visualRect.width) -
			canvasCenterX
		);
	}

	const availableWidth = canvasWidth - leftMargin - rightMargin;
	const targetCenterX = leftMargin + availableWidth / 2;
	return (
		targetCenterX - (visualRect.left + visualRect.width / 2) - canvasCenterX
	);
}

function resolvePositionY({
	canvasHeight,
	placement,
	visualRect,
}: {
	canvasHeight: number;
	placement: ReturnType<typeof resolveSubtitleStyle>["placement"];
	visualRect: { top: number; height: number };
}): number {
	const margin =
		canvasHeight *
		(placement.marginVerticalRatio ?? SUBTITLE_BOTTOM_MARGIN_RATIO);
	const canvasCenterY = canvasHeight / 2;

	if (placement.verticalAlign === "top") {
		return margin - visualRect.top - canvasCenterY;
	}

	if (placement.verticalAlign === "middle") {
		const targetCenterY = canvasHeight / 2;
		return (
			targetCenterY - (visualRect.top + visualRect.height / 2) - canvasCenterY
		);
	}

	return (
		canvasHeight - margin - (visualRect.top + visualRect.height) - canvasCenterY
	);
}

export function buildSubtitleTextElement({
	index,
	caption,
	canvasSize,
}: {
	index: number;
	caption: SubtitleCue;
	canvasSize: { width: number; height: number };
}): CreateTextElement {
	const ctx = createMeasurementContext();
	const style = resolveSubtitleStyle({
		style: caption.style,
	});
	const fontFamily = quoteFontFamily({
		fontFamily: style.fontFamily,
	});
	const fontWeight = style.fontWeight;
	const fontStyle = style.fontStyle === "italic" ? "italic" : "normal";
	const scaledFontSize =
		style.fontSize * (canvasSize.height / FONT_SIZE_SCALE_REFERENCE);
	const fontString = `${fontStyle} ${fontWeight} ${scaledFontSize}px ${fontFamily}, sans-serif`;
	const maxWidth = resolveTargetWidth({
		canvasWidth: canvasSize.width,
		placement: style.placement,
	});

	let content = caption.text;
	let positionX = 0;
	let positionY = 0;
	let adjustedFontSize = style.fontSize;

	if (ctx) {
		ctx.font = fontString;
		setCanvasLetterSpacing({ ctx, letterSpacingPx: style.letterSpacing });
		content = wrapSubtitleText({
			ctx,
			text: caption.text,
			maxWidth,
		});

		let measurement = measureWrappedTextBlock({
			ctx,
			content,
			canvasHeight: canvasSize.height,
			textAlign: style.textAlign,
			background: style.background,
			fontSize: adjustedFontSize,
			lineHeight: style.lineHeight,
		});

		// Auto-fit: if the measured text width exceeds the allowed maxWidth,
		// scale down the font size proportionally to prevent overflow.
		if (measurement.visualRect.width > maxWidth) {
			const scale = maxWidth / measurement.visualRect.width;
			// Scale down the font size, keeping a minimum readable limit of 1
			adjustedFontSize = Math.max(1, style.fontSize * scale);

			// Re-measure with the new font size
			const scaledFontSizePx =
				adjustedFontSize * (canvasSize.height / FONT_SIZE_SCALE_REFERENCE);
			ctx.font = `${fontStyle} ${fontWeight} ${scaledFontSizePx}px ${fontFamily}, sans-serif`;

			measurement = measureWrappedTextBlock({
				ctx,
				content,
				canvasHeight: canvasSize.height,
				textAlign: style.textAlign,
				background: style.background,
				fontSize: adjustedFontSize,
				lineHeight: style.lineHeight,
			});
		}

		positionX = resolvePositionX({
			canvasWidth: canvasSize.width,
			textAlign: style.textAlign,
			placement: style.placement,
			visualRect: measurement.visualRect,
		});
		positionY = resolvePositionY({
			canvasHeight: canvasSize.height,
			placement: style.placement,
			visualRect: measurement.visualRect,
		});
	}

	return {
		...DEFAULTS.text.element,
		name: `Caption ${index + 1}`,
		duration: mediaTimeFromSeconds({ seconds: caption.duration }),
		startTime: mediaTimeFromSeconds({ seconds: caption.startTime }),
		params: {
			...DEFAULTS.text.element.params,
			content,
			fontSize: adjustedFontSize,
			fontFamily: style.fontFamily,
			color: style.color,
			textAlign: style.textAlign,
			fontWeight: style.fontWeight,
			fontStyle: style.fontStyle,
			textDecoration: style.textDecoration,
			letterSpacing: style.letterSpacing,
			lineHeight: style.lineHeight,
			"background.enabled": style.background.enabled,
			"background.color": style.background.color,
			"background.opacity":
				style.background.opacity ?? DEFAULTS.text.background.opacity,
			"background.cornerRadius":
				style.background.cornerRadius ?? DEFAULTS.text.background.cornerRadius,
			"background.paddingX":
				style.background.paddingX ?? DEFAULTS.text.background.paddingX,
			"background.paddingY":
				style.background.paddingY ?? DEFAULTS.text.background.paddingY,
			"background.offsetX":
				style.background.offsetX ?? DEFAULTS.text.background.offsetX,
			"background.offsetY":
				style.background.offsetY ?? DEFAULTS.text.background.offsetY,
			"stroke.enabled": style.stroke.enabled,
			"stroke.color": style.stroke.color,
			"stroke.width": style.stroke.width,
			"highlight.enabled": style.highlightEnabled,
			"highlight.color": style.highlightColor,
			"highlight.borderColor": style.highlightBorderColor,
			"highlight.borderWidth": style.highlightBorderWidth,
			"highlight.fontSize": style.highlightFontSize ?? 1,
			"transform.positionX": style.transformPositionX ?? positionX,
			"transform.positionY": style.transformPositionY ?? positionY,
			"transform.scaleX": style.transformScaleX,
			"transform.scaleY": style.transformScaleY,
			"transform.rotate": style.transformRotate,
			opacity: style.opacity,
			blendMode: style.blendMode,
		},
	};
}
