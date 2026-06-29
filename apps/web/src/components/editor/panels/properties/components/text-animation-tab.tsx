"use client";

import { useEditor } from "@/editor/use-editor";
import { UpdateElementsCommand } from "@/commands";
import type { TimelineElement } from "@/timeline";
import { useState } from "react";
import { TEXT_ANIMATION_PRESETS } from "@/text-animation/presets";
import { applyTextAnimations } from "@/text-animation/apply";
import { Sparkles, Trash2 } from "lucide-react";

export function TextAnimationTab({
	element,
	trackId,
}: {
	element: TimelineElement;
	trackId: string;
}) {
	const editor = useEditor();

	// Get current active settings from element params
	const presetInId = (element.params["animation.in"] as string) || "none";
	const durationIn = typeof element.params["animation.in.duration"] === "number"
		? element.params["animation.in.duration"]
		: 0.4;

	const presetOutId = (element.params["animation.out"] as string) || "none";
	const durationOut = typeof element.params["animation.out.duration"] === "number"
		? element.params["animation.out.duration"]
		: 0.3;

	const [activeTab, setActiveTab] = useState<"in" | "out">("in");

	const handleSelectPreset = ({
		direction,
		presetId,
	}: {
		direction: "in" | "out";
		presetId: string;
	}) => {
		const targetPresetId = presetId === "none" ? null : presetId;

		let nextPresetInId = direction === "in" ? targetPresetId : (presetInId === "none" ? null : presetInId);
		let nextPresetOutId = direction === "out" ? targetPresetId : (presetOutId === "none" ? null : presetOutId);

		const preset = TEXT_ANIMATION_PRESETS.find((p) => p.id === presetId);
		const defaultDuration = preset?.defaultDuration ?? (direction === "in" ? 0.4 : 0.3);

		const nextDurationIn = direction === "in" ? defaultDuration : durationIn;
		const nextDurationOut = direction === "out" ? defaultDuration : durationOut;

		const nextAnimations = applyTextAnimations({
			element,
			presetInId: nextPresetInId,
			durationIn: nextDurationIn,
			presetOutId: nextPresetOutId,
			durationOut: nextDurationOut,
		});

		const command = new UpdateElementsCommand({
			updates: [
				{
					elementId: element.id,
					trackId,
					patch: {
						params: {
							...element.params,
							"animation.in": nextPresetInId || "none",
							"animation.in.duration": nextDurationIn,
							"animation.out": nextPresetOutId || "none",
							"animation.out.duration": nextDurationOut,
						},
						animations: nextAnimations,
					},
				},
			],
		});
		editor.command.execute({ command });
	};

	const handleDurationChange = (value: number) => {
		const nextDurationIn = activeTab === "in" ? value : durationIn;
		const nextDurationOut = activeTab === "out" ? value : durationOut;

		const nextPresetInId = presetInId === "none" ? null : presetInId;
		const nextPresetOutId = presetOutId === "none" ? null : presetOutId;

		const nextAnimations = applyTextAnimations({
			element,
			presetInId: nextPresetInId,
			durationIn: nextDurationIn,
			presetOutId: nextPresetOutId,
			durationOut: nextDurationOut,
		});

		const command = new UpdateElementsCommand({
			updates: [
				{
					elementId: element.id,
					trackId,
					patch: {
						params: {
							...element.params,
							"animation.in.duration": nextDurationIn,
							"animation.out.duration": nextDurationOut,
						},
						animations: nextAnimations,
					},
				},
			],
		});
		editor.command.execute({ command });
	};

	const handleClearAll = () => {
		const nextAnimations = applyTextAnimations({
			element,
			presetInId: null,
			durationIn: 0.4,
			presetOutId: null,
			durationOut: 0.3,
		});

		const command = new UpdateElementsCommand({
			updates: [
				{
					elementId: element.id,
					trackId,
					patch: {
						params: {
							...element.params,
							"animation.in": "none",
							"animation.in.duration": 0.4,
							"animation.out": "none",
							"animation.out.duration": 0.3,
						},
						animations: nextAnimations,
					},
				},
			],
		});
		editor.command.execute({ command });
	};

	const presets = TEXT_ANIMATION_PRESETS.filter((p) => p.direction === activeTab);
	const currentPresetId = activeTab === "in" ? presetInId : presetOutId;
	const currentDuration = activeTab === "in" ? durationIn : durationOut;

	return (
		<div className="flex flex-col h-full bg-zinc-950 text-zinc-200">
			{/* Tab Selector */}
			<div className="flex border-b border-zinc-900">
				<button
					type="button"
					onClick={() => setActiveTab("in")}
					className={`flex-1 py-2 text-xs font-semibold border-b-2 cursor-pointer transition-colors ${
						activeTab === "in"
							? "border-primary text-zinc-100 bg-zinc-900/40"
							: "border-transparent text-zinc-400 hover:text-zinc-200"
					}`}
				>
					Animasi IN (Masuk)
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("out")}
					className={`flex-1 py-2 text-xs font-semibold border-b-2 cursor-pointer transition-colors ${
						activeTab === "out"
							? "border-primary text-zinc-100 bg-zinc-900/40"
							: "border-transparent text-zinc-400 hover:text-zinc-200"
					}`}
				>
					Animasi OUT (Keluar)
				</button>
			</div>

			{/* Configuration Options */}
			<div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
				{/* Duration Slider */}
				{currentPresetId !== "none" && (
					<div className="flex flex-col gap-1.5">
						<div className="flex justify-between items-center text-xs font-medium text-zinc-400">
							<span>Durasi Animasi</span>
							<span className="text-zinc-200 font-semibold">{currentDuration.toFixed(2)}s</span>
						</div>
						<input
							type="range"
							min="0.1"
							max="2.0"
							step="0.05"
							value={currentDuration}
							onChange={(e) => handleDurationChange(parseFloat(e.target.value))}
							className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-primary"
						/>
					</div>
				)}

				{/* Presets Grid */}
				<div className="flex flex-col gap-2">
					<span className="text-xs font-semibold text-zinc-400">Katalog Preset Animasi</span>
					<div className="grid grid-cols-2 gap-2">
						{/* None option */}
						<button
							type="button"
							onClick={() => handleSelectPreset({ direction: activeTab, presetId: "none" })}
							className={`p-3 rounded-lg border text-left flex flex-col gap-1 cursor-pointer transition-all ${
								currentPresetId === "none"
									? "bg-zinc-900 border-primary shadow-md shadow-primary/10"
									: "bg-zinc-950/40 border-zinc-900 hover:border-zinc-800"
							}`}
						>
							<span className="text-xs font-semibold text-zinc-200">Tanpa Animasi</span>
							<span className="text-[10px] text-zinc-500">Nonaktifkan animasi</span>
						</button>

						{/* Custom presets */}
						{presets.map((preset) => (
							<button
								key={preset.id}
								type="button"
								onClick={() => handleSelectPreset({ direction: activeTab, presetId: preset.id })}
								className={`p-3 rounded-lg border text-left flex flex-col gap-1 cursor-pointer transition-all ${
									currentPresetId === preset.id
										? "bg-zinc-900 border-primary shadow-md shadow-primary/10"
										: "bg-zinc-950/40 border-zinc-900 hover:border-zinc-800"
								}`}
							>
								<div className="flex items-center gap-1.5">
									<Sparkles size={11} className="text-primary" />
									<span className="text-xs font-semibold text-zinc-200">{preset.name}</span>
								</div>
								<span className="text-[10px] text-zinc-500 truncate max-w-[130px]">
									Gunakan kurva bezier
								</span>
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Clear All Footer */}
			{(presetInId !== "none" || presetOutId !== "none") && (
				<div className="p-3 border-t border-zinc-900 bg-zinc-950 flex justify-end">
					<button
						type="button"
						onClick={handleClearAll}
						className="flex items-center justify-center gap-1.5 px-3 h-8 rounded-md bg-red-950/20 border border-red-950/40 text-red-400 hover:bg-red-950/30 hover:border-red-900 text-xs font-semibold cursor-pointer transition-all"
					>
						<Trash2 size={12} />
						Hapus Semua Animasi
					</button>
				</div>
			)}
		</div>
	);
}
