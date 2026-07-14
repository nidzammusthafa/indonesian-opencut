import {
	Output,
	Mp4OutputFormat,
	WebMOutputFormat,
	BufferTarget,
	CanvasSource,
	AudioBufferSource,
	QUALITY_LOW,
	QUALITY_MEDIUM,
	QUALITY_HIGH,
	QUALITY_VERY_HIGH,
} from "mediabunny";
import type { ExportFormat, ExportQuality } from "@/export";

const qualityMap = {
	low: QUALITY_LOW,
	medium: QUALITY_MEDIUM,
	high: QUALITY_HIGH,
	very_high: QUALITY_VERY_HIGH,
};

let output: Output | null = null;
let videoSource: CanvasSource | null = null;
let audioSource: AudioBufferSource | null = null;
let offscreenCanvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let isCancelled = false;

self.onmessage = async (event: MessageEvent) => {
	const message = event.data;

	try {
		if (message.type === "init") {
			isCancelled = false;
			const {
				width,
				height,
				fps,
				format,
				quality,
				shouldIncludeAudio,
				audioData,
			} = message;

			offscreenCanvas = new OffscreenCanvas(width, height);
			ctx = offscreenCanvas.getContext("2d");
			if (!ctx) {
				throw new Error("Failed to get 2d context for OffscreenCanvas in worker");
			}

			const outputFormat =
				format === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat();

			output = new Output({
				format: outputFormat,
				target: new BufferTarget(),
			});

			videoSource = new CanvasSource(offscreenCanvas, {
				codec: format === "webm" ? "vp9" : "avc",
				bitrate: qualityMap[quality as ExportQuality],
			});

			const fpsFloat = fps.numerator / fps.denominator;
			output.addVideoTrack(videoSource, { frameRate: fpsFloat });

			if (shouldIncludeAudio && audioData) {
				const { sampleRate, numberOfChannels, length, channels } = audioData;

				// Reconstruct AudioBuffer inside the worker
				const audioBuffer = new AudioBuffer({
					length,
					numberOfChannels,
					sampleRate,
				});

				for (let c = 0; c < numberOfChannels; c++) {
					audioBuffer.copyToChannel(channels[c], c);
				}

				let audioCodec: "aac" | "opus" = format === "webm" ? "opus" : "aac";

				if (audioCodec === "aac" && typeof AudioEncoder !== "undefined") {
					const { supported } = await AudioEncoder.isConfigSupported({
						codec: "mp4a.40.2",
						sampleRate: audioBuffer.sampleRate,
						numberOfChannels: audioBuffer.numberOfChannels,
						bitrate: 192000,
					});
					if (!supported) audioCodec = "opus";
				}

				audioSource = new AudioBufferSource({
					codec: audioCodec,
					bitrate: qualityMap[quality as ExportQuality],
				});
				output.addAudioTrack(audioSource);
			}

			await output.start();

			if (audioSource && audioData) {
				// We reconstruct AudioBuffer for the add method
				const { sampleRate, numberOfChannels, length, channels } = audioData;
				const audioBuffer = new AudioBuffer({
					length,
					numberOfChannels,
					sampleRate,
				});
				for (let c = 0; c < numberOfChannels; c++) {
					audioBuffer.copyToChannel(channels[c], c);
				}
				await audioSource.add(audioBuffer);
				audioSource.close();
			}

			self.postMessage({ type: "initialized" });
		} else if (message.type === "frame") {
			if (isCancelled) {
				if (message.imageBitmap) {
					message.imageBitmap.close();
				}
				return;
			}

			const { imageBitmap, timeSeconds, durationSeconds } = message;

			if (ctx && imageBitmap) {
				ctx.clearRect(0, 0, offscreenCanvas!.width, offscreenCanvas!.height);
				ctx.drawImage(imageBitmap, 0, 0);
				imageBitmap.close();
			}

			if (videoSource) {
				await videoSource.add(timeSeconds, durationSeconds);
			}

			self.postMessage({ type: "frame-encoded" });
		} else if (message.type === "close-video") {
			if (videoSource) {
				videoSource.close();
			}

			if (output) {
				await output.finalize();
				const target = output.target as BufferTarget;
				const buffer = target.buffer;
				if (buffer) {
					self.postMessage({ type: "complete", buffer }, [buffer]);
				} else {
					self.postMessage({ type: "error", error: "Failed to export video (empty buffer)" });
				}
			}
		} else if (message.type === "cancel") {
			isCancelled = true;
			if (output) {
				await output.cancel();
			}
			self.postMessage({ type: "cancelled" });
		}
	} catch (error) {
		console.error("Worker export error:", error);
		self.postMessage({
			type: "error",
			error: error instanceof Error ? error.message : "Unknown export error in worker",
		});
	}
};
