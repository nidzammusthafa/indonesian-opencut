import type { LanguageCode } from "./languages";

export type TranscriptionLanguage = LanguageCode | "auto";

export interface TranscriptionSegment {
	text: string;
	start: number;
	end: number;
}

export interface TranscriptionResult {
	text: string;
	segments: TranscriptionSegment[];
	language: string;
	/** Pre-built caption chunks from word-level timestamps. When present, use
	 *  these directly instead of calling buildCaptionChunks() to preserve
	 *  per-word timing accuracy. */
	captionChunks?: CaptionChunk[];
}

export type TranscriptionStatus =
	| "idle"
	| "loading-model"
	| "transcribing"
	| "complete"
	| "error";

export interface TranscriptionProgress {
	status: TranscriptionStatus;
	progress: number;
	message?: string;
}

export type TranscriptionModelId =
	| "whisper-tiny"
	| "whisper-small"
	| "whisper-medium"
	| "whisper-large-v3-turbo";

export interface TranscriptionModel {
	id: TranscriptionModelId;
	name: string;
	huggingFaceId: string;
	description: string;
}

export interface WordTiming {
	word: string;
	start: number; // in seconds
	end: number;   // in seconds
}

export interface CaptionChunk {
	text: string;
	startTime: number;
	duration: number;
	wordTimings?: WordTiming[];
}
