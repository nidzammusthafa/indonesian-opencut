import { EditorCore } from "@/core";
import { Command, type CommandResult } from "@/commands/base-command";
import type { SceneTracks, TimelineElement } from "@/timeline";
import {
	findTrackInSceneTracks,
	updateElementInSceneTracks,
} from "@/timeline";
import { applyElementUpdate } from "@/timeline/update-pipeline";

export class UpdateElementsCommand extends Command {
	private savedState: SceneTracks | null = null;
	private readonly updates: Array<{
		trackId: string;
		elementId: string;
		patch: Partial<TimelineElement>;
	}>;

	constructor({
		updates,
	}: {
		updates: Array<{
			trackId: string;
			elementId: string;
			patch: Partial<TimelineElement>;
		}>;
	}) {
		super();
		let nextUpdates = [...updates];
		
		try {
			const { useCaptionGlobalModeStore } = require("../../../subtitles/stores/caption-global-mode-store");
			const isGlobalMode = useCaptionGlobalModeStore.getState().isGlobalMode;

			if (isGlobalMode) {
				const editor = EditorCore.getInstance();
				const activeScene = editor.scenes.getActiveSceneOrNull();
				if (activeScene) {
					const siblingUpdates: typeof updates = [];
					for (const update of updates) {
						const track = activeScene.tracks.overlay.find(
							(t) => t.id === update.trackId && t.type === "text",
						);
						if (!track) continue;

						const element = track.elements.find((el) => el.id === update.elementId);
						if (element && element.type === "text" && element.name.startsWith("Caption")) {
							const siblings = track.elements.filter((el) => el.id !== element.id);
							for (const sibling of siblings) {
								const siblingPatch: Partial<TimelineElement> = {};
								if (update.patch.params) {
									const paramsPatch = { ...update.patch.params };
									delete paramsPatch.content;
									if (Object.keys(paramsPatch).length > 0) {
										siblingPatch.params = paramsPatch;
									}
								}
								if (Object.keys(siblingPatch).length > 0) {
									siblingUpdates.push({
										trackId: update.trackId,
										elementId: sibling.id,
										patch: siblingPatch,
									});
								}
							}
						}
					}
					if (siblingUpdates.length > 0) {
						nextUpdates = [...nextUpdates, ...siblingUpdates];
					}
				}
			}
		} catch (e) {
			// ignore on SSR or initialization
		}

		this.updates = nextUpdates;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		let updatedTracks = this.savedState;

		for (const updateEntry of this.updates) {
			const currentTrack = findTrackInSceneTracks({
				tracks: updatedTracks,
				trackId: updateEntry.trackId,
			});
			const currentElement = currentTrack?.elements.find(
				(element) => element.id === updateEntry.elementId,
			);
			if (!currentTrack || !currentElement) {
				continue;
			}

			const nextElement = applyElementUpdate({
				element: currentElement,
				patch: updateEntry.patch,
				context: {
					tracks: updatedTracks,
					trackId: updateEntry.trackId,
				},
			});

			updatedTracks = updateElementInSceneTracks({
				tracks: updatedTracks,
				trackId: updateEntry.trackId,
				elementId: updateEntry.elementId,
				update: () => nextElement,
			});
		}

		editor.timeline.updateTracks(updatedTracks);
		return undefined;
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
		}
	}
}
