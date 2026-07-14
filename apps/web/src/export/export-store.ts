import { create } from "zustand";
import type { ExportFormat, ExportQuality, ExportResult, ExportState } from "@/export";
import { downloadBuffer, getExportMimeType } from "@/export";
import type { FrameRate } from "opencut-wasm";
import { mediaTime, mediaTimeToSeconds, TICKS_PER_SECOND } from "@/wasm";
import { frameRateToFloat } from "@/fps/utils";

interface ExportStore extends ExportState {
	worker: Worker | null;
	filename: string;
	format: ExportFormat;
	cancelExport: () => void;
	clearExportState: () => void;
	startExport: (args: {
		width: number;
		height: number;
		fps: FrameRate;
		format: ExportFormat;
		quality: ExportQuality;
		includeAudio: boolean;
		audioBuffer: AudioBuffer | null;
		duration: number;
		renderFrame: (time: number) => Promise<void>;
		getCompositorCanvas: () => HTMLCanvasElement;
		filename: string;
	}) => Promise<ExportResult>;
}

export const useExportStore = create<ExportStore>((set, get) => {
	let activeWorker: Worker | null = null;
	let userCancelled = false;

	return {
		isExporting: false,
		progress: 0,
		result: null,
		worker: null,
		filename: "",
		format: "mp4",

		cancelExport: () => {
			userCancelled = true;
			if (activeWorker) {
				activeWorker.postMessage({ type: "cancel" });
			}
			set({ isExporting: false, result: { success: false, cancelled: true } });
		},

		clearExportState: () => {
			userCancelled = false;
			if (activeWorker) {
				activeWorker.terminate();
				activeWorker = null;
			}
			set({ isExporting: false, progress: 0, result: null, worker: null, filename: "" });
		},

		startExport: async ({
			width,
			height,
			fps,
			format,
			quality,
			includeAudio,
			audioBuffer,
			duration,
			renderFrame,
			getCompositorCanvas,
			filename,
		}) => {
			userCancelled = false;
			set({ isExporting: true, progress: 0, result: null, filename, format });

			if (activeWorker) {
				activeWorker.terminate();
			}

			const worker = new Worker(new URL("./export.worker.ts", import.meta.url), {
				type: "module",
			});
			activeWorker = worker;
			set({ worker });

			return new Promise<ExportResult>(async (resolve) => {
				worker.onmessage = (event) => {
					const msg = event.data;

					if (msg.type === "error") {
						worker.terminate();
						activeWorker = null;
						const res = { success: false, error: msg.error };
						set({ isExporting: false, result: res, worker: null });
						resolve(res);
					} else if (msg.type === "complete") {
						worker.terminate();
						activeWorker = null;
						const res = { success: true, buffer: msg.buffer };
						set({ isExporting: false, result: res, progress: 1, worker: null });

						// Auto-download file
						downloadBuffer({
							buffer: msg.buffer,
							filename: get().filename,
							mimeType: getExportMimeType({ format: get().format }),
						});

						resolve(res);
					} else if (msg.type === "cancelled") {
						worker.terminate();
						activeWorker = null;
						const res = { success: false, cancelled: true };
						set({ isExporting: false, result: res, worker: null });
						resolve(res);
					}
				};

				try {
					let audioData = undefined;
					if (includeAudio && audioBuffer) {
						const channels = [];
						const transferables = [];
						for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
							const channelData = audioBuffer.getChannelData(i);
							const copy = new Float32Array(channelData);
							channels.push(copy);
							transferables.push(copy.buffer);
						}
						audioData = {
							sampleRate: audioBuffer.sampleRate,
							numberOfChannels: audioBuffer.numberOfChannels,
							length: audioBuffer.length,
							channels,
						};

						worker.postMessage({
							type: "init",
							width,
							height,
							fps,
							format,
							quality,
							shouldIncludeAudio: true,
							audioData,
						}, transferables);
					} else {
						worker.postMessage({
							type: "init",
							width,
							height,
							fps,
							format,
							quality,
							shouldIncludeAudio: false,
						});
					}

					await new Promise<void>((resolveInit, rejectInit) => {
						const originalHandler = worker.onmessage;
						worker.onmessage = (event) => {
							if (event.data.type === "initialized") {
								worker.onmessage = originalHandler;
								resolveInit();
							} else if (event.data.type === "error") {
								worker.onmessage = originalHandler;
								rejectInit(new Error(event.data.error));
							}
						};
					});

					const fpsFloat = frameRateToFloat(fps);
					const ticksPerFrame = Math.round(
						(TICKS_PER_SECOND * fps.denominator) / fps.numerator,
					);
					const frameCount = Math.floor(duration / ticksPerFrame);

					for (let i = 0; i < frameCount; i++) {
						if (userCancelled) {
							return;
						}

						const timeTicks = i * ticksPerFrame;
						const timeSeconds = mediaTimeToSeconds({ time: mediaTime({ ticks: timeTicks }) });

						await renderFrame(timeTicks);

						const canvas = getCompositorCanvas();
						const imageBitmap = await createImageBitmap(canvas);

						worker.postMessage({
							type: "frame",
							imageBitmap,
							timeSeconds,
							durationSeconds: 1 / fpsFloat,
						}, [imageBitmap]);

						await new Promise<void>((resolveFrame, rejectFrame) => {
							const originalHandler = worker.onmessage;
							worker.onmessage = (event) => {
								if (event.data.type === "frame-encoded") {
									worker.onmessage = originalHandler;
									resolveFrame();
								} else if (event.data.type === "error") {
									worker.onmessage = originalHandler;
									rejectFrame(new Error(event.data.error));
								}
							};
						});

						const progress = includeAudio
							? 0.05 + (i / frameCount) * 0.95
							: i / frameCount;
						set({ progress });
					}

					if (userCancelled) return;
					worker.postMessage({ type: "close-video" });

				} catch (err) {
					console.error("Export process failed:", err);
					worker.terminate();
					activeWorker = null;
					const res = {
						success: false,
						error: err instanceof Error ? err.message : "Export process failed",
					};
					set({ isExporting: false, result: res, worker: null });
					resolve(res);
				}
			});
		},
	};
});
