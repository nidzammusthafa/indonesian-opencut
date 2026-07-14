"use client";

import { usePreviewStore } from "@/preview/preview-store";
import { Headphones, Eye } from "lucide-react";

export function AssetPreviewOverlay() {
	const {
		assetPreviewUrl,
		assetPreviewName,
		assetPreviewType,
		assetPreviewWidth,
		assetPreviewHeight,
	} = usePreviewStore();

	if (!assetPreviewUrl && assetPreviewType !== "audio") {
		return null;
	}

	const aspectRatio =
		assetPreviewWidth && assetPreviewHeight
			? `${assetPreviewWidth} / ${assetPreviewHeight}`
			: undefined;

	return (
		<div className="absolute inset-0 z-[45] flex flex-col items-center justify-center bg-black/90 animate-in fade-in duration-200">
			<div className="absolute top-3 left-3 z-[46] flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-sky-400 border border-sky-400/20 backdrop-blur-md">
				<Eye className="size-3" />
				<span>Asset Preview</span>
			</div>

			<div className="flex size-full items-center justify-center p-4">
				{assetPreviewType === "image" && assetPreviewUrl && (
					<img
						src={assetPreviewUrl}
						alt={assetPreviewName || "Preview"}
						className="max-h-full max-w-full rounded object-contain shadow-2xl"
						style={{ aspectRatio }}
					/>
				)}

				{assetPreviewType === "video" && assetPreviewUrl && (
					<video
						src={assetPreviewUrl}
						className="max-h-full max-w-full rounded object-contain shadow-2xl"
						style={{ aspectRatio }}
						controls
						autoPlay
						muted
						loop
					/>
				)}

				{assetPreviewType === "audio" && (
					<div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/5 bg-gradient-to-b from-white/5 to-white/0 p-8 shadow-2xl backdrop-blur-lg text-center max-w-[80%]">
						<div className="flex size-20 items-center justify-center rounded-full bg-linear-to-tr from-sky-400 to-indigo-500 text-white shadow-lg shadow-sky-500/20">
							<Headphones className="size-10" />
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="truncate text-sm font-semibold text-white max-w-[240px]">
								{assetPreviewName || "Audio Asset"}
							</span>
							<span className="text-[11px] text-white/40 uppercase tracking-wider font-medium">
								Audio File
							</span>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
