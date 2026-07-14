"use client";

import { useExportStore } from "@/export/export-store";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { X, Film, CheckCircle, AlertTriangle } from "lucide-react";

export function ExportProgressToast() {
	const { isExporting, progress, result, filename, cancelExport, clearExportState } = useExportStore();

	if (!isExporting && !result) {
		return null;
	}

	const isSuccess = result?.success;
	const isError = result && !result.success && !result.cancelled;

	return (
		<div className="fixed bottom-4 right-4 z-50 flex w-80 animate-in slide-in-from-bottom-5 duration-300 flex-col gap-3 rounded-xl border border-white/10 bg-black/60 p-4 shadow-2xl backdrop-blur-xl transition-all">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{isExporting && (
						<Film className="size-4 animate-pulse text-sky-400" />
					)}
					{isSuccess && (
						<CheckCircle className="size-4 text-emerald-400" />
					)}
					{isError && (
						<AlertTriangle className="size-4 text-rose-400" />
					)}
					<span className="truncate text-sm font-medium text-white max-w-[180px]">
						{filename || "video.mp4"}
					</span>
				</div>
				<button
					type="button"
					onClick={clearExportState}
					className="rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
				>
					<X className="size-4" />
				</button>
			</div>

			{isExporting && (
				<div className="flex flex-col gap-1.5">
					<div className="flex justify-between text-xs text-white/60">
						<span>Exporting...</span>
						<span>{Math.round(progress * 100)}%</span>
					</div>
					<Progress value={progress * 100} className="h-1.5 bg-white/10 [&>div]:bg-gradient-to-r [&>div]:from-sky-400 [&>div]:to-indigo-500" />
					<Button
						variant="ghost"
						size="sm"
						onClick={cancelExport}
						className="mt-1 h-7 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
					>
						Cancel Export
					</Button>
				</div>
			)}

			{isSuccess && (
				<div className="flex flex-col gap-1">
					<span className="text-xs text-emerald-400 font-medium">Export Complete!</span>
					<span className="text-[10px] text-white/50">Your file has been downloaded.</span>
				</div>
			)}

			{isError && (
				<div className="flex flex-col gap-1">
					<span className="text-xs text-rose-400 font-medium">Export Failed</span>
					<span className="text-[10px] text-white/50 truncate">{result?.error || "Unknown error"}</span>
				</div>
			)}
		</div>
	);
}
