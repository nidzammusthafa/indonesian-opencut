import { getFFmpeg } from "./ffmpeg-service";
import { loadFullFont } from "@/fonts/google-fonts";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";

export interface WatermarkOptions {
	type: "text" | "image";
	xPercent: number;
	yPercent: number;
	text?: string;
	fontSize?: number;
	fontFamily?: string;
	fontColor?: string;
	opacity?: number;
	borderWidth?: number;
	borderColor?: string;
	imageFile?: File | null;
	imageSize?: number;
	imageOpacity?: number;

	// Dual Watermark options
	isDual?: boolean;
	type2?: "text" | "image";
	xPercent2?: number;
	yPercent2?: number;
	text2?: string;
	imageFile2?: File | null;
}

const getVideoMetadata = (
	file: File,
): Promise<{ width: number; height: number; duration: number }> => {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const video = document.createElement("video");
		video.onloadedmetadata = () => {
			resolve({
				width: video.videoWidth,
				height: video.videoHeight,
				duration: video.duration || 10, // fallback to 10s if not readable
			});
			URL.revokeObjectURL(url);
		};
		video.onerror = () => {
			reject(new Error("Failed to load video metadata"));
			URL.revokeObjectURL(url);
		};
		video.src = url;
	});
};

async function renderTextWatermarkPng({
	text,
	fontFamily,
	fontSize,
	fontColor,
	opacity,
	borderWidth,
	borderColor,
}: {
	text: string;
	fontFamily?: string;
	fontSize?: number;
	fontColor?: string;
	opacity?: number;
	borderWidth?: number;
	borderColor?: string;
}): Promise<Uint8Array> {
	const family = fontFamily || "Inter";
	const size = fontSize || 24;
	const strokeWidth = borderWidth || 0;
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas 2D context is not available");

	try {
		if (!SYSTEM_FONTS.has(family)) {
			await loadFullFont({ family, weights: [400, 700] });
		}
		await document.fonts.load(`700 ${size}px "${family.replace(/"/g, '\\"')}"`);
	} catch (error) {
		console.warn(
			`Gagal memuat font ${family}, memakai fallback browser:`,
			error,
		);
	}

	const font = `700 ${size}px "${family.replace(/"/g, '\\"')}", sans-serif`;
	context.font = font;
	context.textBaseline = "alphabetic";
	context.lineJoin = "round";

	const metrics = context.measureText(text);
	const ascent = metrics.actualBoundingBoxAscent || size * 0.8;
	const descent = metrics.actualBoundingBoxDescent || size * 0.2;
	const padding = Math.ceil(Math.max(strokeWidth * 2, size * 0.2, 4));
	canvas.width = Math.max(1, Math.ceil(metrics.width + padding * 2));
	canvas.height = Math.max(1, Math.ceil(ascent + descent + padding * 2));

	context.font = font;
	context.textBaseline = "alphabetic";
	context.lineJoin = "round";
	context.globalAlpha = Math.max(0, Math.min(1, (opacity ?? 60) / 100));
	const x = padding;
	const y = padding + ascent;
	if (strokeWidth > 0) {
		context.lineWidth = strokeWidth * 2;
		context.strokeStyle = borderColor || "#000000";
		context.strokeText(text, x, y);
	}
	context.fillStyle = fontColor || "#ffffff";
	context.fillText(text, x, y);

	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((result) => {
			if (result) resolve(result);
			else reject(new Error("Failed to render text watermark image"));
		}, "image/png");
	});

	return new Uint8Array(await blob.arrayBuffer());
}

export const addWatermark = async ({
	file,
	options,
	onProgress,
}: {
	file: File;
	options: WatermarkOptions;
	onProgress: (progress: number) => void;
}): Promise<string> => {
	const ffmpeg = await getFFmpeg();

	const handleProgress = ({ progress }: { progress: number }) => {
		onProgress(Math.max(0, Math.min(100, Math.round(progress * 100))));
	};
	ffmpeg.on("progress", handleProgress);

	const { width: vw, duration } = await getVideoMetadata(file);
	const halfDuration = (duration / 2).toFixed(3);

	const buffer = await file.arrayBuffer();
	const inputName = `input_wm_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
	const outputName = `out_wm_${Date.now()}.mp4`;

	await ffmpeg.writeFile(inputName, new Uint8Array(buffer));

	const tempInputNames: string[] = [];
	let watermarkInputIndex1: number | null = null;
	let watermarkInputIndex2: number | null = null;
	const execArgs: string[] = ["-y", "-i", inputName];
	let nextInputIndex = 1;

	try {
		// Determine which inputs to add
		if (options.type === "text") {
			const textPngName = `wm_text1_${Date.now()}.png`;
			const textPng = await renderTextWatermarkPng({
				text: options.text || "My Watermark",
				fontSize: options.fontSize,
				fontFamily: options.fontFamily,
				fontColor: options.fontColor,
				opacity: options.opacity,
				borderWidth: options.borderWidth,
				borderColor: options.borderColor,
			});
			await ffmpeg.writeFile(textPngName, textPng);
			execArgs.push("-i", textPngName);
			tempInputNames.push(textPngName);
			watermarkInputIndex1 = nextInputIndex;
			nextInputIndex += 1;
		} else if (options.type === "image" && options.imageFile) {
			const imageName1 = `wm_logo1_${Date.now()}_${options.imageFile.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
			const imgBuffer = await options.imageFile.arrayBuffer();
			await ffmpeg.writeFile(imageName1, new Uint8Array(imgBuffer));
			execArgs.push("-i", imageName1);
			tempInputNames.push(imageName1);
			watermarkInputIndex1 = nextInputIndex;
			nextInputIndex += 1;
		}

		if (options.isDual && options.type2 === "text") {
			const textPngName2 = `wm_text2_${Date.now()}.png`;
			const textPng2 = await renderTextWatermarkPng({
				text: options.text2 || "My Watermark",
				fontSize: options.fontSize,
				fontFamily: options.fontFamily,
				fontColor: options.fontColor,
				opacity: options.opacity,
				borderWidth: options.borderWidth,
				borderColor: options.borderColor,
			});
			await ffmpeg.writeFile(textPngName2, textPng2);
			execArgs.push("-i", textPngName2);
			tempInputNames.push(textPngName2);
			watermarkInputIndex2 = nextInputIndex;
			nextInputIndex += 1;
		} else if (
			options.isDual &&
			options.type2 === "image" &&
			options.imageFile2
		) {
			const imageName2 = `wm_logo2_${Date.now()}_${options.imageFile2.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
			const imgBuffer = await options.imageFile2.arrayBuffer();
			await ffmpeg.writeFile(imageName2, new Uint8Array(imgBuffer));
			execArgs.push("-i", imageName2);
			tempInputNames.push(imageName2);
			watermarkInputIndex2 = nextInputIndex;
			nextInputIndex += 1;
		}

		// Build filter graph
		let filterComplex = "";
		let lastOut = "[0:v]";

		// Watermark 1 (First 50% duration)
		const enableTime1 = options.isDual ? `:enable='lt(t,${halfDuration})'` : "";
		if (options.type === "text" && watermarkInputIndex1 !== null) {
			const xFactor = (options.xPercent / 100).toFixed(3);
			const yFactor = (options.yPercent / 100).toFixed(3);
			const nextOut = `[v_wm1]`;
			filterComplex += `[${watermarkInputIndex1}:v]format=rgba[wm1_rendered]; `;
			filterComplex += `${lastOut}[wm1_rendered]overlay=x=(W-w)*${xFactor}:y=(H-h)*${yFactor}${enableTime1}${nextOut}; `;
			lastOut = nextOut;
		} else if (
			options.type === "image" &&
			options.imageFile &&
			watermarkInputIndex1 !== null
		) {
			const imageSize = options.imageSize || 15;
			const targetLogoWidth = Math.round(vw * (imageSize / 100));
			const op = (
				(options.imageOpacity ?? options.opacity ?? 60) / 100
			).toFixed(2);
			const xFactor = (options.xPercent / 100).toFixed(3);
			const yFactor = (options.yPercent / 100).toFixed(3);

			const nextOut = `[v_wm1]`;
			filterComplex += `[${watermarkInputIndex1}:v]scale=w=${targetLogoWidth}:h=-1,format=rgba,colorchannelmixer=aa=${op}[wm1_scaled]; `;
			filterComplex += `${lastOut}[wm1_scaled]overlay=x=(W-w)*${xFactor}:y=(H-h)*${yFactor}${enableTime1}${nextOut}; `;
			lastOut = nextOut;
		}

		// Watermark 2 (Second 50% duration)
		if (options.isDual) {
			const enableTime2 = `:enable='gte(t,${halfDuration})'`;
			const type2 = options.type2 || "text";
			const xPercent2 = options.xPercent2 ?? 50;
			const yPercent2 = options.yPercent2 ?? 50;

			if (type2 === "text" && watermarkInputIndex2 !== null) {
				const xFactor = (xPercent2 / 100).toFixed(3);
				const yFactor = (yPercent2 / 100).toFixed(3);
				const nextOut = `[v_wm2]`;
				filterComplex += `[${watermarkInputIndex2}:v]format=rgba[wm2_rendered]; `;
				filterComplex += `${lastOut}[wm2_rendered]overlay=x=(W-w)*${xFactor}:y=(H-h)*${yFactor}${enableTime2}${nextOut}; `;
				lastOut = nextOut;
			} else if (
				type2 === "image" &&
				options.imageFile2 &&
				watermarkInputIndex2 !== null
			) {
				const imageSize = options.imageSize || 15;
				const targetLogoWidth = Math.round(vw * (imageSize / 100));
				const op = (
					(options.imageOpacity ?? options.opacity ?? 60) / 100
				).toFixed(2);
				const xFactor = (xPercent2 / 100).toFixed(3);
				const yFactor = (yPercent2 / 100).toFixed(3);

				const nextOut = `[v_wm2]`;
				filterComplex += `[${watermarkInputIndex2}:v]scale=w=${targetLogoWidth}:h=-1,format=rgba,colorchannelmixer=aa=${op}[wm2_scaled]; `;
				filterComplex += `${lastOut}[wm2_scaled]overlay=x=(W-w)*${xFactor}:y=(H-h)*${yFactor}${enableTime2}${nextOut}; `;
				lastOut = nextOut;
			}
		}

		// Remove trailing semicolon and map the final labeled video stream explicitly.
		let filterComplexClean = filterComplex.trim();
		if (filterComplexClean.endsWith(";")) {
			filterComplexClean = filterComplexClean.slice(0, -1);
		}

		if (lastOut !== "[0:v]") {
			execArgs.push(
				"-filter_complex",
				filterComplexClean,
				"-map",
				lastOut,
				"-map",
				"0:a?",
			);
		}

		execArgs.push(
			"-c:a",
			"copy",
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-preset",
			"fast",
			"-crf",
			"23",
			outputName,
		);

		await ffmpeg.exec(execArgs);

		const data = await ffmpeg.readFile(outputName);
		const bytes =
			typeof data === "string" ? new TextEncoder().encode(data) : data;
		const outputBuffer = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(outputBuffer).set(bytes);
		const blob = new Blob([outputBuffer], { type: "video/mp4" });
		const url = URL.createObjectURL(blob);

		return url;
	} catch (error) {
		console.error("FFmpeg processing error:", error);
		throw error;
	} finally {
		ffmpeg.off("progress", handleProgress);
		try {
			await ffmpeg.deleteFile(inputName);
		} catch (_e) {
			// Best-effort cleanup.
		}
		try {
			await ffmpeg.deleteFile(outputName);
		} catch (_e) {
			// Best-effort cleanup.
		}
		for (const tempInputName of tempInputNames) {
			try {
				await ffmpeg.deleteFile(tempInputName);
			} catch (_e) {
				// Best-effort cleanup.
			}
		}
	}
};
