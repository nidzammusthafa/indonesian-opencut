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
	let globalEndTime = 0;

	for (const segment of segments) {
		const words = segment.text.trim().split(/\s+/);
		if (words.length === 0 || (words.length === 1 && words[0] === "")) continue;

		const segmentDuration = Math.max(0.1, segment.end - segment.start);
		const wordsPerSecond = words.length / segmentDuration;

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

		let chunkStartTime = segment.start;
		for (const chunk of chunks) {
			const chunkDuration = Math.max(minDuration, chunk.wordCount / wordsPerSecond);
			const adjustedStartTime = Math.max(chunkStartTime, globalEndTime);

			captions.push({
				text: chunk.text,
				startTime: adjustedStartTime,
				duration: chunkDuration,
			});

			globalEndTime = adjustedStartTime + chunkDuration;
			chunkStartTime += chunkDuration;
		}
	}

	return captions;
}
