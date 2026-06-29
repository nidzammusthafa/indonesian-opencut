import {
	pipeline,
	type AutomaticSpeechRecognitionPipeline,
	type AutomaticSpeechRecognitionOutput,
} from "@huggingface/transformers";
import type { TranscriptionSegment, CaptionChunk } from "@/transcription/types";
import {
	DEFAULT_CHUNK_LENGTH_SECONDS,
	DEFAULT_STRIDE_SECONDS,
} from "@/transcription/audio";

export type WorkerMessage =
	| { type: "init"; modelId: string }
	| { type: "transcribe"; audio: Float32Array; language: string }
	| { type: "cancel" };

export type WorkerResponse =
	| { type: "init-progress"; progress: number }
	| { type: "init-complete" }
	| { type: "init-error"; error: string }
	| { type: "transcribe-progress"; progress: number }
	| {
			type: "transcribe-complete";
			text: string;
			segments: TranscriptionSegment[];
			captionChunks: CaptionChunk[];
	  }
	| { type: "transcribe-error"; error: string }
	| { type: "cancelled" };

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let cancelled = false;
let lastReportedProgress = -1;
const fileBytes = new Map<string, { loaded: number; total: number }>();

const MAX_WORDS_PER_CHUNK = 5;
const MAX_CHUNK_DURATION = 2.5;
const MAX_WORD_GAP = 0.8;

/** Build CaptionChunk[] from word-level timestamps for precise synchronization. */
function buildChunksFromWords(
	words: Array<{ word: string; start: number; end: number }>,
): CaptionChunk[] {
	const chunks: CaptionChunk[] = [];
	let currentGroup: Array<{ word: string; start: number; end: number }> = [];

	for (const wordData of words) {
		const cleanWord = wordData.word.replace(/\s+/g, " ").trim();
		if (!cleanWord) continue;

		if (currentGroup.length === 0) {
			currentGroup.push(wordData);
			continue;
		}

		const firstWord = currentGroup[0];
		const prevWord = currentGroup[currentGroup.length - 1];
		const gap = wordData.start - prevWord.end;
		const duration = prevWord.end - firstWord.start;

		const shouldSplit =
			currentGroup.length >= MAX_WORDS_PER_CHUNK ||
			duration >= MAX_CHUNK_DURATION ||
			gap > MAX_WORD_GAP ||
			prevWord.word.trimEnd().endsWith(".") ||
			prevWord.word.trimEnd().endsWith("?") ||
			prevWord.word.trimEnd().endsWith("!") ||
			prevWord.word.trimEnd().endsWith(",");

		if (shouldSplit) {
			chunks.push({
				text: currentGroup.map((w) => w.word.trim()).join(" "),
				startTime: firstWord.start,
				duration: Math.max(0.1, prevWord.end - firstWord.start),
			});
			currentGroup = [wordData];
		} else {
			currentGroup.push(wordData);
		}
	}

	if (currentGroup.length > 0) {
		const first = currentGroup[0];
		const last = currentGroup[currentGroup.length - 1];
		chunks.push({
			text: currentGroup.map((w) => w.word.trim()).join(" "),
			startTime: first.start,
			duration: Math.max(0.1, last.end - first.start),
		});
	}

	return chunks;
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
	const message = event.data;

	switch (message.type) {
		case "init":
			await handleInit({ modelId: message.modelId });
			break;
		case "transcribe":
			await handleTranscribe({
				audio: message.audio,
				language: message.language,
			});
			break;
		case "cancel":
			cancelled = true;
			self.postMessage({ type: "cancelled" } satisfies WorkerResponse);
			break;
	}
};

async function handleInit({ modelId }: { modelId: string }) {
	lastReportedProgress = -1;
	fileBytes.clear();

	try {
		transcriber = (await pipeline("automatic-speech-recognition", modelId, {
			dtype: "q4",
			device: "auto",
			progress_callback: (progressInfo: {
				status?: string;
				file?: string;
				loaded?: number;
				total?: number;
			}) => {
				const file = progressInfo.file;
				if (!file) return;

				const loaded = progressInfo.loaded ?? 0;
				const total = progressInfo.total ?? 0;

				if (progressInfo.status === "progress" && total > 0) {
					fileBytes.set(file, { loaded, total });
				} else if (progressInfo.status === "done") {
					const existing = fileBytes.get(file);
					if (existing) {
						fileBytes.set(file, {
							loaded: existing.total,
							total: existing.total,
						});
					}
				}

				// sum all bytes
				let totalLoaded = 0;
				let totalSize = 0;
				for (const { loaded, total } of fileBytes.values()) {
					totalLoaded += loaded;
					totalSize += total;
				}

				if (totalSize === 0) return;

				const overallProgress = (totalLoaded / totalSize) * 100;
				const roundedProgress = Math.floor(overallProgress);

				if (roundedProgress !== lastReportedProgress) {
					lastReportedProgress = roundedProgress;
					self.postMessage({
						type: "init-progress",
						progress: roundedProgress,
					} satisfies WorkerResponse);
				}
			},
		})) as unknown as AutomaticSpeechRecognitionPipeline;

		self.postMessage({ type: "init-complete" } satisfies WorkerResponse);
	} catch (error) {
		self.postMessage({
			type: "init-error",
			error: error instanceof Error ? error.message : "Failed to load model",
		} satisfies WorkerResponse);
	}
}

async function handleTranscribe({
	audio,
	language,
}: {
	audio: Float32Array;
	language: string;
}) {
	if (!transcriber) {
		self.postMessage({
			type: "transcribe-error",
			error: "Model not initialized",
		} satisfies WorkerResponse);
		return;
	}

	cancelled = false;

	try {
		const rawResult = await transcriber(audio, {
			chunk_length_s: DEFAULT_CHUNK_LENGTH_SECONDS,
			stride_length_s: DEFAULT_STRIDE_SECONDS,
			language: language === "auto" ? undefined : language,
			task: "transcribe", // explicitly prevent translation mode
			return_timestamps: true, // word-level not supported by quantized ONNX models
		});

		if (cancelled) return;

		const result: AutomaticSpeechRecognitionOutput = Array.isArray(rawResult)
			? rawResult[0]
			: rawResult;

		const segments: TranscriptionSegment[] = [];

		if (result.chunks) {
			for (const chunk of result.chunks) {
				if (chunk.timestamp && chunk.timestamp.length >= 2) {
					segments.push({
						text: chunk.text,
						start: chunk.timestamp[0] ?? 0,
						end: chunk.timestamp[1] ?? chunk.timestamp[0] ?? 0,
					});
				}
			}
		}

		// Local quantized ONNX models do not support cross-attentions required for
		// word-level timestamps. captionChunks is left empty so assets-view.tsx
		// falls back to buildCaptionChunks() with segment-level timing.
		const captionChunks: CaptionChunk[] = [];

		self.postMessage({
			type: "transcribe-complete",
			text: result.text,
			segments,
			captionChunks,
		} satisfies WorkerResponse);
	} catch (error) {
		if (cancelled) return;
		self.postMessage({
			type: "transcribe-error",
			error: error instanceof Error ? error.message : "Transcription failed",
		} satisfies WorkerResponse);
	}
}
