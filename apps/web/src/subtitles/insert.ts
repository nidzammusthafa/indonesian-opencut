import type { EditorCore } from "@/core";
import {
	AddTrackCommand,
	BatchCommand,
	InsertElementCommand,
	RemoveTrackCommand,
} from "@/commands";
import { buildSubtitleTextElement } from "./build-subtitle-text-element";
import type { SubtitleCue } from "./types";

import { mediaTimeToSeconds } from "@/wasm";

export function insertCaptionChunksAsTextTrack({
	editor,
	captions,
}: {
	editor: EditorCore;
	captions: SubtitleCue[];
}): string | null {
	const maxDurationSeconds = mediaTimeToSeconds({
		time: editor.timeline.getTotalDuration(),
	});

	const validCaptions = captions
		.filter((caption) => caption.startTime < maxDurationSeconds)
		.map((caption) => {
			const duration = Math.min(
				caption.duration,
				maxDurationSeconds - caption.startTime,
			);
			return {
				...caption,
				duration: Math.max(0.1, duration),
			};
		});

	if (validCaptions.length === 0) {
		return null;
	}

	const addTrackCommand = new AddTrackCommand({ type: "text", index: 0 });
	const trackId = addTrackCommand.getTrackId();
	const canvasSize = editor.project.getActive().settings.canvasSize;
	const insertCommands = validCaptions.map(
		(caption, index) =>
			new InsertElementCommand({
				placement: { mode: "explicit", trackId },
				element: buildSubtitleTextElement({
					index,
					caption,
					canvasSize,
				}),
			}),
	);
	editor.command.execute({
		command: new BatchCommand([
			addTrackCommand,
			...insertCommands,
		]),
	});

	return trackId;
}
