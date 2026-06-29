"use client";

/**
 * Hook yang menyediakan fungsi untuk memperluas preview update
 * ke semua caption lain ketika Caption Global Mode aktif.
 *
 * Cara kerja:
 * - Saat `onPreview` dipanggil untuk satu caption, hook ini juga mengirim
 *   previewElements untuk semua caption lain di track yang sama.
 * - Karena `commitPreview()` meng-commit SEMUA element yang ada di previewOverlay,
 *   tidak perlu intercept commit — perubahan siblings akan ikut ter-commit otomatis.
 */

import { useCallback } from "react";
import { useEditor } from "@/editor/use-editor";
import { useCaptionGlobalModeStore } from "@/subtitles/stores/caption-global-mode-store";
import { writeElementParamValue, type ElementParamDefinition } from "@/params/registry";
import type { TimelineElement } from "@/timeline";

// Kunci param yang perlu disinkronkan saat global mode aktif (style saja, bukan content/timing)
const STYLE_PARAM_KEYS = new Set([
	"fontFamily", "fontSize", "color", "textAlign", "fontWeight", "fontStyle",
	"textDecoration", "letterSpacing", "lineHeight",
	"background.enabled", "background.color", "background.opacity",
	"background.cornerRadius", "background.paddingX", "background.paddingY",
	"background.offsetX", "background.offsetY",
	"stroke.enabled", "stroke.color", "stroke.width",
	"highlight.enabled", "highlight.color", "highlight.borderColor",
	"highlight.borderWidth", "highlight.fontSize",
]);

export function useCaptionGlobalSync({
	element,
	trackId,
	param,
}: {
	element: TimelineElement;
	trackId: string;
	param: ElementParamDefinition;
}) {
	const editor = useEditor();
	const isGlobalMode = useCaptionGlobalModeStore((s) => s.isGlobalMode);

	/**
	 * Dapatkan semua caption lain di track yang sama (sibling captions).
	 * Hanya jika:
	 * 1. Mode global aktif
	 * 2. Param yang diubah adalah style param (bukan content/teks/timing)
	 * 3. Element yang diedit adalah text element (caption)
	 */
	const getSiblingCaptions = useCallback((): TimelineElement[] => {
		if (!isGlobalMode) return [];
		if (!STYLE_PARAM_KEYS.has(param.key)) return [];
		if (element.type !== "text") return [];

		const activeScene = editor.scenes.getActiveScene();
		const textTrack = activeScene.tracks.overlay.find(
			(t) => t.id === trackId && t.type === "text",
		);
		if (!textTrack) return [];

		return textTrack.elements.filter((el) => el.id !== element.id);
	}, [editor, element, trackId, param.key, isGlobalMode]);

	/**
	 * Dipanggil saat `onPreview` terjadi.
	 * Memperluas update ke semua sibling caption agar perubahan visual
	 * terlihat realtime di canvas untuk semua caption sekaligus.
	 */
	const expandPreviewToSiblings = useCallback(
		(value: number | string | boolean) => {
			const siblings = getSiblingCaptions();
			if (siblings.length === 0) return;

			editor.timeline.previewElements({
				updates: siblings.map((sibling) => ({
					trackId,
					elementId: sibling.id,
					// writeElementParamValue mengembalikan Partial<TimelineElement>
					// yang berisi patch params untuk sibling
					updates: writeElementParamValue({ element: sibling, param, value }),
				})),
			});
		},
		[editor, getSiblingCaptions, trackId, param],
	);

	return {
		isGlobalMode,
		expandPreviewToSiblings,
	};
}
