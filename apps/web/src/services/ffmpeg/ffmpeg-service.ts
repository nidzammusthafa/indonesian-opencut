import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;

export async function getFFmpeg(): Promise<FFmpeg> {
	if (ffmpegInstance) return ffmpegInstance;

	const ffmpeg = new FFmpeg();
	const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

	ffmpeg.on("log", ({ message }) => {
		console.log("[FFmpeg Log]:", message);
	});

	await ffmpeg.load({
		coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
		wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
	});

	ffmpegInstance = ffmpeg;
	return ffmpeg;
}
