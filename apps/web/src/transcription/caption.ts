import type { TranscriptionSegment, CaptionChunk } from "@/transcription/types";
import {
	DEFAULT_WORDS_PER_CAPTION,
	MIN_CAPTION_DURATION_SECONDS,
} from "@/transcription/caption-defaults";

export function buildCaptionChunks({
	segments,
	wordsPerChunk = DEFAULT_WORDS_PER_CAPTION,
	minDuration = MIN_CAPTION_DURATION_SECONDS,
}: {
	segments: TranscriptionSegment[];
	wordsPerChunk?: number;
	minDuration?: number;
}): CaptionChunk[] {
	const captions: CaptionChunk[] = [];
	// Only used to prevent genuine visual overlap (<50ms gap)
	let globalEndTime = 0;

	for (const segment of segments) {
		const words = segment.text.trim().split(/\s+/);
		if (words.length === 0 || (words.length === 1 && words[0] === "")) continue;

		const segmentDuration = Math.max(0.1, segment.end - segment.start);

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
		// Each chunk's startTime is anchored to the segment's real start, not accumulated durations.
		let wordOffset = 0;
		for (const chunk of chunks) {
			const startProportion = wordOffset / words.length;
			const endProportion = (wordOffset + chunk.wordCount) / words.length;

			const chunkStart = segment.start + segmentDuration * startProportion;
			let chunkDuration = segmentDuration * (endProportion - startProportion);

			// Apply a minimum only for single-chunk segments (to avoid flashing too fast).
			// For multi-chunk, use the actual proportion — don't clamp up, which causes drift.
			if (chunks.length === 1) {
				chunkDuration = Math.max(minDuration, chunkDuration);
			} else {
				chunkDuration = Math.max(0.1, chunkDuration);
			}

			// Prevent genuine visual overlap only — if a previous caption ends within 50ms
			// of this one's start, nudge forward slightly.
			const adjustedStartTime = globalEndTime > chunkStart + 0.05
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
