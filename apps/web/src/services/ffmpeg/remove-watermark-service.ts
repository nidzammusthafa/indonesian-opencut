import { getFFmpeg } from "./ffmpeg-service";

export interface RemoveWatermarkOptions {
	xPercent: number; // center of box
	yPercent: number;
	widthPercent: number;
	heightPercent: number;
}

const getVideoMetadata = (file: File): Promise<{ width: number; height: number }> => {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const video = document.createElement("video");
		video.onloadedmetadata = () => {
			resolve({ width: video.videoWidth, height: video.videoHeight });
			URL.revokeObjectURL(url);
		};
		video.onerror = () => {
			reject(new Error("Failed to load video metadata"));
			URL.revokeObjectURL(url);
		};
		video.src = url;
	});
};

export const removeWatermark = async (
	file: File,
	options: RemoveWatermarkOptions,
	onProgress: (progress: number) => void,
): Promise<string> => {
	const ffmpeg = await getFFmpeg();

	const handleProgress = ({ progress }: { progress: number }) => {
		onProgress(Math.max(0, Math.min(100, Math.round(progress * 100))));
	};
	ffmpeg.on("progress", handleProgress);

	const { width: vw, height: vh } = await getVideoMetadata(file);

	const buffer = await file.arrayBuffer();
	const inputName = `input_rm_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
	const outputName = `out_rm_${Date.now()}.mp4`;

	await ffmpeg.writeFile(inputName, new Uint8Array(buffer));

	// Calculate absolute pixel coordinates for the delogo filter
	// options are stored in percentage relative to the video dimensions
	const boxW = Math.max(8, Math.round(vw * (options.widthPercent / 100)));
	const boxH = Math.max(8, Math.round(vh * (options.heightPercent / 100)));
	const boxX = Math.max(0, Math.min(vw - boxW, Math.round(vw * (options.xPercent / 100) - boxW / 2)));
	const boxY = Math.max(0, Math.min(vh - boxH, Math.round(vh * (options.yPercent / 100) - boxH / 2)));

	// delogo filter syntax: delogo=x=X:y=Y:w=W:h=H
	const delogoFilter = `delogo=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}`;

	const execArgs: string[] = [
		"-y",
		"-i",
		inputName,
		"-vf",
		delogoFilter,
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
	];

	try {
		await ffmpeg.exec(execArgs);

		const data = await ffmpeg.readFile(outputName);
		const blob = new Blob([data as any], { type: "video/mp4" });
		const url = URL.createObjectURL(blob);

		return url;
	} catch (error) {
		console.error("FFmpeg processing error during watermark removal:", error);
		throw error;
	} finally {
		ffmpeg.off("progress", handleProgress);
		try {
			await ffmpeg.deleteFile(inputName);
		} catch (e) {}
		try {
			await ffmpeg.deleteFile(outputName);
		} catch (e) {}
	}
};
