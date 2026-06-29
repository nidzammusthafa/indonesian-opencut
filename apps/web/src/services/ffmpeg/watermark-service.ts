import { getFFmpeg } from "./ffmpeg-service";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

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

function escapeFFmpegText(text: string): string {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "'\\\\''")
		.replace(/:/g, "\\:")
		.replace(/,/g, "\\,")
		.replace(/;/g, "\\;")
		.replace(/%/g, "\\%");
}

async function prepareWatermarkFont({
	ffmpeg,
	fontFamily,
}: {
	ffmpeg: FFmpeg;
	fontFamily?: string;
}): Promise<string> {
	const font = fontFamily || "Inter";
	const FONT_MAP: Record<string, { fileName: string; urls: string[] }> = {
		Inter: {
			fileName: "Inter-Bold.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/inter/static/Inter-Bold.ttf",
				"https://cdn.jsdelivr.net/fontsource/fonts/inter@5.0.15/latin-700-normal.ttf",
			],
		},
		Arial: {
			fileName: "Arial.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/apache/arimo/static/Arimo-Bold.ttf",
				"https://cdnjs.cloudflare.com/ajax/libs/liberation-fonts/2.00.1/LiberationSans-Bold.ttf",
			],
		},
		Georgia: {
			fileName: "Georgia.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/gelasio/static/Gelasio-Bold.ttf",
			],
		},
		"Courier New": {
			fileName: "CourierNew.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/courierprime/CourierPrime-Bold.ttf",
			],
		},
		Impact: {
			fileName: "Impact.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
			],
		},
		"Comic Sans MS": {
			fileName: "ComicSansMS.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/comicneue/ComicNeue-Bold.ttf",
			],
		},
		"Times New Roman": {
			fileName: "TimesNewRoman.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/apache/tinos/static/Tinos-Bold.ttf",
			],
		},
		Roboto: {
			fileName: "Roboto-Bold.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-Bold.ttf",
			],
		},
		Montserrat: {
			fileName: "Montserrat-Bold.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/static/Montserrat-Bold.ttf",
			],
		},
		Oswald: {
			fileName: "Oswald-Bold.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/static/Oswald-Bold.ttf",
			],
		},
		Poppins: {
			fileName: "Poppins-Bold.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Bold.ttf",
			],
		},
		"Playfair Display": {
			fileName: "PlayfairDisplay-Bold.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/static/PlayfairDisplay-Bold.ttf",
			],
		},
		"Bebas Neue": {
			fileName: "BebasNeue-Regular.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf",
			],
		},
		Pacifico: {
			fileName: "Pacifico-Regular.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/pacifico/Pacifico-Regular.ttf",
			],
		},
		Lobster: {
			fileName: "Lobster-Regular.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/lobster/Lobster-Regular.ttf",
			],
		},
		Kanit: {
			fileName: "Kanit-Bold.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/kanit/static/Kanit-Bold.ttf",
			],
		},
		"Open Sans": {
			fileName: "OpenSans-Bold.ttf",
			urls: [
				"https://raw.githubusercontent.com/google/fonts/main/ofl/opensans/static/OpenSans-Bold.ttf",
			],
		},
	};

	const config = FONT_MAP[font] || FONT_MAP["Inter"];

	try {
		const exists = await ffmpeg.readFile(config.fileName);
		if (exists && exists.length > 1000) {
			return config.fileName;
		}
	} catch (_e) {
		// Font has not been written to the FFmpeg filesystem yet.
	}

	for (const url of config.urls) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				const contentType = response.headers.get("content-type") || "";
				if (!contentType.includes("text/html")) {
					const blob = await response.blob();
					if (blob.size > 1000) {
						await ffmpeg.writeFile(config.fileName, await fetchFile(blob));
						return config.fileName;
					}
				}
			}
		} catch (e) {
			console.warn(`Gagal memuat font dari ${url}:`, e);
		}
	}

	return "Inter-Bold.ttf";
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

	const fontFileName = await prepareWatermarkFont({
		ffmpeg,
		fontFamily: options.fontFamily,
	});
	const virtualFontPath = fontFileName.startsWith("/")
		? fontFileName
		: `/${fontFileName}`;

	let imageName1 = "";
	let imageName2 = "";
	const execArgs: string[] = ["-y", "-i", inputName];

	try {
		// Determine which inputs to add
		if (options.type === "image" && options.imageFile) {
			imageName1 = `wm_logo1_${Date.now()}_${options.imageFile.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
			const imgBuffer = await options.imageFile.arrayBuffer();
			await ffmpeg.writeFile(imageName1, new Uint8Array(imgBuffer));
			execArgs.push("-i", imageName1);
		}

		if (options.isDual && options.type2 === "image" && options.imageFile2) {
			imageName2 = `wm_logo2_${Date.now()}_${options.imageFile2.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
			const imgBuffer = await options.imageFile2.arrayBuffer();
			await ffmpeg.writeFile(imageName2, new Uint8Array(imgBuffer));
			execArgs.push("-i", imageName2);
		}

		// Build filter graph
		let filterComplex = "";
		let lastOut = "[0:v]";

		// Watermark 1 (First 50% duration)
		const enableTime1 = options.isDual ? `:enable='lt(t,${halfDuration})'` : "";
		if (options.type === "text") {
			const cleanText = options.text || "My Watermark";
			const escapedText = escapeFFmpegText(cleanText);
			const fSize = options.fontSize || 24;
			const op = ((options.opacity ?? 60) / 100).toFixed(2);
			const fontColorHex = (options.fontColor || "#ffffff").replace("#", "0x");
			const xFactor = (options.xPercent / 100).toFixed(3);
			const yFactor = (options.yPercent / 100).toFixed(3);

			let borderParams = "";
			if (options.borderWidth && options.borderWidth > 0) {
				const borderW = options.borderWidth;
				const borderColorHex = (options.borderColor || "#000000").replace(
					"#",
					"0x",
				);
				borderParams = `:borderw=${borderW}:bordercolor=${borderColorHex}@1.0`;
			}

			const nextOut = `[v_wm1]`;
			filterComplex += `${lastOut}drawtext=fontfile=${virtualFontPath}:text='${escapedText}':fontsize=${fSize}:fontcolor=${fontColorHex}@${op}${borderParams}:x=(w-text_w)*${xFactor}:y=(h-text_h)*${yFactor}${enableTime1}${nextOut}; `;
			lastOut = nextOut;
		} else if (options.type === "image" && options.imageFile) {
			const imageSize = options.imageSize || 15;
			const targetLogoWidth = Math.round(vw * (imageSize / 100));
			const op = (
				(options.imageOpacity ?? options.opacity ?? 60) / 100
			).toFixed(2);
			const xFactor = (options.xPercent / 100).toFixed(3);
			const yFactor = (options.yPercent / 100).toFixed(3);

			const nextOut = `[v_wm1]`;
			// Logo 1 is at input index 1
			filterComplex += `[1:v]scale=w=${targetLogoWidth}:h=-1,format=rgba,colorchannelmixer=aa=${op}[wm1_scaled]; `;
			filterComplex += `${lastOut}[wm1_scaled]overlay=x=(W-w)*${xFactor}:y=(H-h)*${yFactor}${enableTime1}${nextOut}; `;
			lastOut = nextOut;
		}

		// Watermark 2 (Second 50% duration)
		if (options.isDual) {
			const enableTime2 = `:enable='gte(t,${halfDuration})'`;
			const type2 = options.type2 || "text";
			const xPercent2 = options.xPercent2 ?? 50;
			const yPercent2 = options.yPercent2 ?? 50;

			if (type2 === "text") {
				const cleanText = options.text2 || "My Watermark";
				const escapedText = escapeFFmpegText(cleanText);
				const fSize = options.fontSize || 24;
				const op = ((options.opacity ?? 60) / 100).toFixed(2);
				const fontColorHex = (options.fontColor || "#ffffff").replace(
					"#",
					"0x",
				);
				const xFactor = (xPercent2 / 100).toFixed(3);
				const yFactor = (yPercent2 / 100).toFixed(3);

				let borderParams = "";
				if (options.borderWidth && options.borderWidth > 0) {
					const borderW = options.borderWidth;
					const borderColorHex = (options.borderColor || "#000000").replace(
						"#",
						"0x",
					);
					borderParams = `:borderw=${borderW}:bordercolor=${borderColorHex}@1.0`;
				}

				const nextOut = `[v_wm2]`;
				filterComplex += `${lastOut}drawtext=fontfile=${virtualFontPath}:text='${escapedText}':fontsize=${fSize}:fontcolor=${fontColorHex}@${op}${borderParams}:x=(w-text_w)*${xFactor}:y=(h-text_h)*${yFactor}${enableTime2}${nextOut}; `;
				lastOut = nextOut;
			} else if (type2 === "image" && options.imageFile2) {
				const imageSize = options.imageSize || 15;
				const targetLogoWidth = Math.round(vw * (imageSize / 100));
				const op = (
					(options.imageOpacity ?? options.opacity ?? 60) / 100
				).toFixed(2);
				const xFactor = (xPercent2 / 100).toFixed(3);
				const yFactor = (yPercent2 / 100).toFixed(3);

				const nextOut = `[v_wm2]`;
				// Logo 2 index depends on whether Logo 1 was also an image. If Logo 1 was image, Logo 2 is input 2. Otherwise input 1.
				const logo2InputIndex = options.type === "image" ? 2 : 1;
				filterComplex += `[${logo2InputIndex}:v]scale=w=${targetLogoWidth}:h=-1,format=rgba,colorchannelmixer=aa=${op}[wm2_scaled]; `;
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
		if (imageName1) {
			try {
				await ffmpeg.deleteFile(imageName1);
			} catch (_e) {
				// Best-effort cleanup.
			}
		}
		if (imageName2) {
			try {
				await ffmpeg.deleteFile(imageName2);
			} catch (_e) {
				// Best-effort cleanup.
			}
		}
	}
};
