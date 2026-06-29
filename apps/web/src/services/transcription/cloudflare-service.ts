import type {
	TranscriptionResult,
	TranscriptionSegment,
	CaptionChunk,
} from "@/transcription/types";

class CloudflareTranscriptionService {
	async transcribe({
		audioBlob,
		language,
		workerUrl,
		maxWords = 5,
	}: {
		audioBlob: Blob;
		language?: string;
		workerUrl: string;
		maxWords?: number;
	}): Promise<TranscriptionResult> {
		if (!workerUrl) {
			throw new Error("Cloudflare Worker URL is required");
		}

		// Ensure url ends without slash, then append path
		const url = new URL(
			workerUrl.endsWith("/") ? workerUrl.slice(0, -1) : workerUrl,
		);
		url.searchParams.set("model", "large-v3-turbo");
		if (language && language !== "auto") {
			url.searchParams.set("language", language);
		}

		const response = await fetch(url.toString(), {
			method: "POST",
			body: audioBlob,
			headers: {
				"Content-Type": "audio/wav",
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Cloudflare transcription failed: ${response.statusText} (${errorText})`,
			);
		}

		const data = await response.json();

		if (data.error) {
			throw new Error(`Cloudflare Workers AI Error: ${data.error}`);
		}

		const text = data.text || "";
		const segments: TranscriptionSegment[] = [];
		let captionChunks: CaptionChunk[] | undefined;

		if (data.words && Array.isArray(data.words) && data.words.length > 0) {
			let currentChunk: any[] = [];
			const MAX_WORDS = maxWords;
			const MAX_DURATION = 2.5; // Max duration in seconds
			const MAX_GAP = 0.8; // Max silence/gap between words in seconds

			for (let i = 0; i < data.words.length; i++) {
				const word = data.words[i];
				const cleanWord = word.word.trim();
				if (!cleanWord) continue;

				if (currentChunk.length === 0) {
					currentChunk.push(word);
				} else {
					const firstWord = currentChunk[0];
					const prevWord = currentChunk[currentChunk.length - 1];

					const gap = word.start - prevWord.end;
					const duration = word.end - firstWord.start;

					const shouldSplit =
						currentChunk.length >= MAX_WORDS ||
						duration > MAX_DURATION ||
						gap > MAX_GAP ||
						prevWord.word.trim().endsWith(".") ||
						prevWord.word.trim().endsWith("?") ||
						prevWord.word.trim().endsWith("!") ||
						prevWord.word.trim().endsWith(",");

					if (shouldSplit) {
						const segmentText = currentChunk
							.map((w: any) => w.word.trim())
							.join(" ");
						segments.push({
							text: segmentText,
							start: currentChunk[0].start,
							end: prevWord.end,
						});
						currentChunk = [word];
					} else {
						currentChunk.push(word);
					}
				}
			}

			if (currentChunk.length > 0) {
				const segmentText = currentChunk
					.map((w: any) => w.word.trim())
					.join(" ");
				segments.push({
					text: segmentText,
					start: currentChunk[0].start,
					end: currentChunk[currentChunk.length - 1].end,
				});
			}

			// Build caption chunks directly from word-level data — these are the segments
			// already grouped above; convert them to CaptionChunk[] with accurate timing.
			captionChunks = segments.map((seg) => ({
				text: seg.text,
				startTime: seg.start,
				duration: Math.max(0.1, seg.end - seg.start),
			}));
		} else if (data.vtt) {
			// Normalize newlines and split by double newlines to isolate each cue block
			const vttText = data.vtt.replace(/\r\n/g, "\n");
			const blocks = vttText.split(/\n\s*\n/);

			for (const block of blocks) {
				const lines = block
					.split("\n")
					.map((l: string) => l.trim())
					.filter(Boolean);
				if (lines.length === 0) continue;
				if (lines[0].startsWith("WEBVTT")) continue;

				// Find the line that has the timing indicator
				const timingIndex = lines.findIndex((l: string) => l.includes("-->"));
				if (timingIndex === -1) continue;

				const timingLine = lines[timingIndex];
				const [startStr, endStr] = timingLine
					.split("-->")
					.map((s: string) => s.trim());
				const start = parseVttTime(startStr);
				const end = parseVttTime(endStr);

				// Everything after timingLine is the actual subtitle text for this cue
				const textLines = lines.slice(timingIndex + 1);
				if (textLines.length === 0) continue;

				const textContent = textLines.join(" ");

				segments.push({
					text: textContent,
					start,
					end,
				});
			}
		} else {
			// absolute fallback: one big segment
			segments.push({
				text,
				start: 0,
				end: 10.0, // default or approximate based on duration if we had it
			});
		}

		// For VTT/fallback paths, merge segments to keep chunk sizes reasonable.
		// For word-level path, captionChunks is already built with accurate timing.
		const mergedSegments = captionChunks ? segments : mergeSegments(segments, maxWords);

		// We refine boundaries by shifting trailing conjunctions/CTAs to the next segment.
		const finalSegments = refineSegments(mergedSegments);

		return {
			text,
			segments: finalSegments,
			captionChunks,
			language: language || "auto",
		};
	}
}

function mergeSegments(
	rawSegments: TranscriptionSegment[],
	maxWords = 5,
	maxGap = 0.5,
): TranscriptionSegment[] {
	if (rawSegments.length === 0) return [];

	const merged: TranscriptionSegment[] = [];
	let current = { ...rawSegments[0] };

	for (let i = 1; i < rawSegments.length; i++) {
		const next = rawSegments[i];
		const currentWordsCount = current.text
			.trim()
			.split(/\s+/)
			.filter(Boolean).length;
		const gap = next.start - current.end;

		const endsWithPunctuation = /[.!?]$/.test(current.text.trim());

		if (
			!endsWithPunctuation &&
			currentWordsCount < maxWords &&
			gap >= 0 &&
			gap <= maxGap
		) {
			current.text = `${current.text.trim()} ${next.text.trim()}`;
			current.end = next.end;
		} else {
			merged.push(current);
			current = { ...next };
		}
	}

	merged.push(current);
	return merged;
}

function parseVttTime(timeStr: string): number {
	// Format: HH:MM:SS.mmm or MM:SS.mmm
	const parts = timeStr.split(":");
	let seconds = 0;
	if (parts.length === 3) {
		seconds += parseFloat(parts[0]) * 3600; // HH
		seconds += parseFloat(parts[1]) * 60; // MM
		seconds += parseFloat(parts[2]); // SS.mmm
	} else if (parts.length === 2) {
		seconds += parseFloat(parts[0]) * 60; // MM
		seconds += parseFloat(parts[1]); // SS.mmm
	}
	return seconds;
}

function refineSegments(segments: TranscriptionSegment[]): TranscriptionSegment[] {
	if (segments.length <= 1) return segments;

	const refined = segments.map((seg) => ({ ...seg }));
	const wordsToMove = [
		"hingga", "dan", "atau", "karena", "tapi", "namun", "sehingga",
		"untuk", "yang", "saat", "ketika", "jika", "kalau", "dengan",
		"maka", "bahwa", "yaitu", "klik", "order", "beli"
	];

	for (let i = 0; i < refined.length - 1; i++) {
		const current = refined[i];
		const next = refined[i + 1];

		const currentWords = current.text.trim().split(/\s+/);
		if (currentWords.length <= 1) continue;

		const lastWord = currentWords[currentWords.length - 1]
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "");

		if (wordsToMove.includes(lastWord)) {
			const movedWord = currentWords.pop()!;
			current.text = currentWords.join(" ");
			next.text = `${movedWord} ${next.text.trim()}`;
		}
	}

	return refined;
}

export const cloudflareTranscriptionService =
	new CloudflareTranscriptionService();
