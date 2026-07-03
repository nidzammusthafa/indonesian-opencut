import type { TranscriptionSegment, CaptionChunk } from "@/transcription/types";
import {
	DEFAULT_WORDS_PER_CAPTION,
} from "@/transcription/caption-defaults";

export function buildCaptionChunks({
	segments,
	wordsPerChunk = DEFAULT_WORDS_PER_CAPTION,
}: {
	segments: TranscriptionSegment[];
	wordsPerChunk?: number;
	minDuration?: number; // kept for API compatibility, no longer used for clamping
}): CaptionChunk[] {
	const captions: CaptionChunk[] = [];
	// Only used to prevent zero-duration / genuinely overlapping captions (same timestamp)
	let globalEndTime = 0;

	for (const segment of segments) {
		const words = segment.text.trim().split(/\s+/);
		if (words.length === 0 || (words.length === 1 && words[0] === "")) continue;

		const segmentDuration = Math.max(0.05, segment.end - segment.start);

		const chunks: { text: string; wordCount: number }[] = [];

		if (words.length <= 6) {
			chunks.push({
				text: segment.text.trim(),
				wordCount: words.length,
			});
		} else {
			let currentWords: string[] = [];

			for (const word of words) {
				currentWords.push(word);
				const cleanWord = word.trim();

				// Detect sentence endings or major clauses
				const endsWithPunctuation = /[.!?]$/.test(cleanWord);
				const endsWithComma = /,$/.test(cleanWord);

				const shouldSplit =
					currentWords.length >= wordsPerChunk ||
					endsWithPunctuation ||
					(endsWithComma && currentWords.length >= 2);

				if (shouldSplit) {
					chunks.push({
						text: currentWords.join(" "),
						wordCount: currentWords.length,
					});
					currentWords = [];
				}
			}

			if (currentWords.length > 0) {
				chunks.push({
					text: currentWords.join(" "),
					wordCount: currentWords.length,
				});
			}
		}

		// Distribute chunks proportionally across the segment's actual time window.
		// Each chunk's startTime is anchored to the real Whisper-derived timestamp.
		// We do NOT clamp to minDuration — that was causing cumulative drift.
		let wordOffset = 0;
		for (const chunk of chunks) {
			const startProportion = wordOffset / words.length;
			const endProportion = (wordOffset + chunk.wordCount) / words.length;

			const chunkStart = segment.start + segmentDuration * startProportion;
			// Enforce a tiny minimum (50ms) purely to prevent zero-length captions
			const chunkDuration = Math.max(0.05, segmentDuration * (endProportion - startProportion));

			// Overlap guard: only nudge forward if a previous caption genuinely overlaps
			// (i.e. ends AFTER this one's start, not just within a small tolerance).
			// We allow up to 30ms overlap — clamp only the real collisions.
			const adjustedStartTime = globalEndTime > chunkStart + 0.03
				? globalEndTime
				: chunkStart;

			captions.push({
				text: chunk.text,
				startTime: adjustedStartTime,
				duration: chunkDuration,
			});

			globalEndTime = adjustedStartTime + chunkDuration;
			wordOffset += chunk.wordCount;
		}
	}

	return captions;
}
