"use client";

import { resolveAnimationPathValueAtTime } from "@/animation";
import { applyTextAnimations } from "@/text-animation/apply";
import { Section, SectionContent, SectionFields } from "@/components/section";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { useKeyframedParamProperty } from "@/components/editor/panels/properties/hooks/use-keyframed-param-property";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import type { ParamValue, ParamValues } from "@/params";
import {
	getElementParams,
	readElementParamValue,
	writeElementParamValue,
	type ElementParamDefinition,
} from "@/params/registry";
import type { TimelineElement } from "@/timeline";
import type { MediaTime } from "@/wasm";
import { useEditor } from "@/editor/use-editor";
import { useCaptionGlobalSync } from "@/subtitles/hooks/use-caption-global-sync";
import { useState, useEffect } from "react";
import { Save, Check, Download, Plus, Trash2, LayoutGrid } from "lucide-react";
import type { TextStylePreset } from "@/text/types";
import { UpdateElementsCommand } from "@/commands";
import { useCaptionGlobalModeStore } from "@/subtitles/stores/caption-global-mode-store";

function generatePresetId(): string {
	return `preset_${Date.now()}`;
}

function getTimestamp(): number {
	return Date.now();
}

export function ElementParamsTab({
	element,
	trackId,
	paramKeys,
	sectionKey,
}: {
	element: TimelineElement;
	trackId: string;
	paramKeys?: readonly string[];
	sectionKey: string;
}) {
	const editor = useEditor();
	useEditor((e) => e.timeline.getPreviewTracks());

	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const allParams = getElementParams({ element });
	const isCaption = element.type === "text" && element.name.startsWith("Caption");
	const params = allParams.filter((param) => {
		if (!isCaption && param.key.startsWith("highlight.")) {
			return false;
		}
		return !paramKeys || paramKeys.includes(param.key);
	});
	const baseValues = buildValues({ element, params });
	const allBaseValues = buildValues({ element, params: allParams });

	const isTextElement = element.type === "text";
	const isCaptionGlobalMode = useCaptionGlobalModeStore((s) => s.isGlobalMode);
	const [customPresets, setCustomPresets] = useState<TextStylePreset[]>([]);
	const [newPresetName, setNewPresetName] = useState("");
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [applySuccess, setApplySuccess] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const saved = localStorage.getItem("custom-text-style-presets");
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				if (Array.isArray(parsed)) {
					setTimeout(() => {
						setCustomPresets(parsed);
					}, 0);
				}
			} catch (e) {
				console.error("Gagal memuat preset gaya teks kustom:", e);
			}
		}
	}, []);

	const handleSaveCustomPreset = (e: React.FormEvent) => {
		e.preventDefault();
		if (!newPresetName.trim()) return;

		const styleParams = [
			"fontFamily",
			"fontSize",
			"color",
			"textAlign",
			"fontWeight",
			"fontStyle",
			"textDecoration",
			"letterSpacing",
			"lineHeight",
			"background.enabled",
			"background.color",
			"background.opacity",
			"background.cornerRadius",
			"background.paddingX",
			"background.paddingY",
			"background.offsetX",
			"background.offsetY",
			"stroke.enabled",
			"stroke.color",
			"stroke.width",
			"highlight.enabled",
			"highlight.color",
			"highlight.borderColor",
			"highlight.borderWidth",
			"highlight.fontSize",
			"transform.positionX",
			"transform.positionY",
			"transform.scaleX",
			"transform.scaleY",
			"transform.rotate",
			"opacity",
			"blendMode",
			"animation.in",
			"animation.in.duration",
			"animation.out",
			"animation.out.duration",
		];

		const savedStyle: ParamValues = {};
		for (const key of styleParams) {
			const param = allParams.find((p) => p.key === key);
			if (param) {
				savedStyle[key] = allBaseValues[key] ?? param.default;
			} else if (key.startsWith("animation.")) {
				const val = element.params[key];
				if (val !== undefined) {
					savedStyle[key] = val;
				}
			}
		}

		const newPreset: TextStylePreset = {
			id: generatePresetId(),
			name: newPresetName.trim(),
			values: savedStyle,
			createdAt: getTimestamp(),
		};

		const updated = [...customPresets, newPreset];
		setCustomPresets(updated);
		localStorage.setItem("custom-text-style-presets", JSON.stringify(updated));
		setNewPresetName("");
	};

	const handleApplyCustomPreset = (preset: TextStylePreset) => {
		const isCaption = element.type === "text" && element.name.startsWith("Caption");
		const elementIds = [element.id];
		if (isCaption && isCaptionGlobalMode) {
			const activeScene = editor.scenes.getActiveScene();
			const track = activeScene.tracks.overlay.find((t) => t.id === trackId);
			if (track) {
				for (const el of track.elements) {
					if (el.id !== element.id) {
						elementIds.push(el.id);
					}
				}
			}
		}

		const command = new UpdateElementsCommand({
			updates: elementIds.map((id) => {
				const valIn = preset.values["animation.in"];
				const presetInId = typeof valIn === "string" ? valIn : "none";
				const durationIn = typeof preset.values["animation.in.duration"] === "number"
					? preset.values["animation.in.duration"]
					: 0.4;
				const valOut = preset.values["animation.out"];
				const presetOutId = typeof valOut === "string" ? valOut : "none";
				const durationOut = typeof preset.values["animation.out.duration"] === "number"
					? preset.values["animation.out.duration"]
					: 0.3;

				const tempElement = {
					...element,
					params: {
						...element.params,
						...preset.values,
					},
				};

				const nextAnimations = applyTextAnimations({
					element: tempElement,
					presetInId: presetInId === "none" ? null : presetInId,
					durationIn,
					presetOutId: presetOutId === "none" ? null : presetOutId,
					durationOut,
				});

				return {
					elementId: id,
					trackId,
					patch: {
						params: preset.values,
						animations: nextAnimations,
					},
				};
			}),
		});
		editor.command.execute({ command });
	};

	const handleDeleteCustomPreset = (id: string) => {
		const updated = customPresets.filter((p) => p.id !== id);
		setCustomPresets(updated);
		localStorage.setItem("custom-text-style-presets", JSON.stringify(updated));
	};

	const handleSaveStyle = () => {
		const styleParams = [
			"fontFamily",
			"fontSize",
			"color",
			"textAlign",
			"fontWeight",
			"fontStyle",
			"textDecoration",
			"letterSpacing",
			"lineHeight",
			"background.enabled",
			"background.color",
			"background.opacity",
			"background.cornerRadius",
			"background.paddingX",
			"background.paddingY",
			"background.offsetX",
			"background.offsetY",
			"stroke.enabled",
			"stroke.color",
			"stroke.width",
			"highlight.enabled",
			"highlight.color",
			"highlight.borderColor",
			"highlight.borderWidth",
			"highlight.fontSize",
			"transform.positionX",
			"transform.positionY",
			"transform.scaleX",
			"transform.scaleY",
			"transform.rotate",
			"opacity",
			"blendMode",
		];
		const savedStyle: ParamValues = {};
		for (const key of styleParams) {
			const param = allParams.find((p) => p.key === key);
			if (param) {
				savedStyle[key] = allBaseValues[key] ?? param.default;
			}
		}
		localStorage.setItem("default-caption-style", JSON.stringify(savedStyle));

		setSaveSuccess(true);
		setTimeout(() => setSaveSuccess(false), 2000);
	};

	const handleApplyStyle = () => {
		const saved = localStorage.getItem("default-caption-style");
		if (!saved) return;
		try {
			const savedStyle = parseSavedParamValues({ raw: saved });
			const updates: ParamValues = {};
			for (const [key, value] of Object.entries(savedStyle)) {
				updates[key] = value;
			}

			const elementIds = [element.id];
			if (isCaptionGlobalMode) {
				const activeScene = editor.scenes.getActiveScene();
				const track = activeScene.tracks.overlay.find((t) => t.id === trackId);
				if (track) {
					for (const el of track.elements) {
						if (el.id !== element.id) {
							elementIds.push(el.id);
						}
					}
				}
			}

			const command = new UpdateElementsCommand({
				updates: elementIds.map((id) => ({
					elementId: id,
					trackId,
					patch: {
						params: updates,
					},
				})),
			});
			editor.command.execute({ command });

			setApplySuccess(true);
			setTimeout(() => setApplySuccess(false), 2000);
		} catch (_e) {
			// ignore
		}
	};

	return (
		<Section sectionKey={`${element.id}:${sectionKey}`}>
			<SectionContent className="pt-4">
				<SectionFields>
					{params
						.filter((param) => isVisible({ param, values: baseValues }))
						.map((param) => (
							<ElementParamField
								key={param.key}
								element={element}
								trackId={trackId}
								param={param}
								baseValue={baseValues[param.key] ?? param.default}
								localTime={localTime}
								isPlayheadWithinElementRange={isPlayheadWithinElementRange}
							/>
						))}
				</SectionFields>
				{isTextElement && (
					<>
						{isCaption ? (
							<div className="flex gap-2 mt-4 pt-4 border-t border-zinc-800">
								<button
									type="button"
									onClick={handleSaveStyle}
									className="flex-1 h-8 rounded-md bg-primary text-primary-foreground font-medium text-xs flex items-center justify-center gap-1 cursor-pointer hover:bg-primary/90 transition-colors"
								>
									{saveSuccess ? (
										<>
											<Check size={12} className="text-green-300" />
											Style Saved!
										</>
									) : (
										<>
											<Save size={12} />
											Save Style
										</>
									)}
								</button>
								<button
									type="button"
									onClick={handleApplyStyle}
									className="flex-1 h-8 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 font-medium text-xs flex items-center justify-center gap-1 cursor-pointer hover:bg-zinc-800 transition-colors"
								>
									{applySuccess ? (
										<>
											<Check size={12} className="text-green-500" />
											Style Applied!
										</>
									) : (
										<>
											<Download size={12} />
											Apply Style
										</>
									)}
								</button>
							</div>
						) : (
							/* Custom Text Style Presets */
							<div className="mt-6 pt-4 border-t border-zinc-800 flex flex-col gap-3">
								<div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
									<LayoutGrid size={13} className="text-zinc-500" />
									<span>Preset Gaya Teks (Watermark / Template)</span>
								</div>

								<form onSubmit={handleSaveCustomPreset} className="flex gap-1">
									<input
										type="text"
										placeholder="Nama preset baru..."
										value={newPresetName}
										onChange={(e) => setNewPresetName(e.target.value)}
										className="flex-1 h-8 px-2.5 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-200 placeholder-zinc-650 focus:outline-none focus:border-zinc-700"
									/>
									<button
										type="submit"
										disabled={!newPresetName.trim()}
										className="h-8 px-3 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 text-zinc-200 font-medium text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors"
									>
										<Plus size={12} />
										Simpan
									</button>
								</form>

								{customPresets.length > 0 ? (
									<div className="max-h-36 overflow-y-auto pr-1 flex flex-col gap-1.5 scrollbar-thin">
										{customPresets.map((preset) => (
											<div
												key={preset.id}
												className="flex items-center justify-between p-2 rounded-md bg-zinc-950/60 border border-zinc-900 hover:border-zinc-800 transition-colors"
											>
												<span className="text-xs text-zinc-300 font-medium truncate max-w-[140px]">
													{preset.name}
												</span>
												<div className="flex items-center gap-1">
													<button
														type="button"
														onClick={() => handleApplyCustomPreset(preset)}
														className="h-6 px-2.5 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-[10px] text-zinc-300 font-medium cursor-pointer transition-colors"
													>
														Terapkan
													</button>
													<button
														type="button"
														onClick={() => handleDeleteCustomPreset(preset.id)}
														className="h-6 w-6 rounded border border-transparent hover:border-red-950/40 hover:bg-red-950/20 text-zinc-500 hover:text-red-400 flex items-center justify-center cursor-pointer transition-colors"
													>
														<Trash2 size={12} />
													</button>
												</div>
											</div>
										))}
									</div>
								) : (
									<div className="py-4 text-center rounded-md border border-dashed border-zinc-800">
										<p className="text-[11px] text-zinc-500">Belum ada preset kustom yang disimpan.</p>
									</div>
								)}
							</div>
						)}
					</>
				)}
			</SectionContent>
		</Section>
	);
}

function ElementParamField({
	element,
	trackId,
	param,
	baseValue,
	localTime,
	isPlayheadWithinElementRange,
}: {
	element: TimelineElement;
	trackId: string;
	param: ElementParamDefinition;
	baseValue: ParamValue;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
}) {
	const resolvedValue = resolveAnimationPathValueAtTime({
		animations: element.animations,
		propertyPath: param.key,
		localTime,
		fallbackValue: baseValue,
	});

	// Hook untuk sinkronisasi global caption
	// Hanya aktif jika element adalah text (caption) dan param adalah style param
	const { expandPreviewToSiblings } = useCaptionGlobalSync({
		element,
		trackId,
		param,
	});

	const animatedParam = useKeyframedParamProperty({
		param,
		trackId,
		elementId: element.id,
		animations: element.animations,
		propertyPath: param.key,
		localTime,
		isPlayheadWithinElementRange,
		resolvedValue,
		buildBaseUpdates: ({ value }) =>
			writeElementParamValue({ element, param, value }),
	});

	// Wrap onPreview: update caption yang dipilih + semua sibling caption jika global mode aktif
	const handlePreview = (value: number | string | boolean) => {
		animatedParam.onPreview(value);
		expandPreviewToSiblings(value);
	};

	return (
		<PropertyParamField
			param={param}
			value={resolvedValue}
			onPreview={handlePreview}
			onCommit={animatedParam.onCommit}
			keyframe={
				param.keyframable === false
					? undefined
					: {
							isActive: animatedParam.isKeyframedAtTime,
							isDisabled: !isPlayheadWithinElementRange,
							onToggle: animatedParam.toggleKeyframe,
						}
			}
		/>
	);
}

function buildValues({
	element,
	params,
}: {
	element: TimelineElement;
	params: readonly ElementParamDefinition[];
}): ParamValues {
	const values: ParamValues = {};
	for (const param of params) {
		const value = readElementParamValue({ element, param });
		if (value !== null) {
			values[param.key] = value;
		}
	}
	return values;
}

function isParamValue(value: unknown): value is ParamValue {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

function parseSavedParamValues({ raw }: { raw: string }): ParamValues {
	const parsed: unknown = JSON.parse(raw);
	const values: ParamValues = {};
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return values;
	}

	for (const [key, value] of Object.entries(parsed)) {
		if (isParamValue(value)) {
			values[key] = value;
		}
	}
	return values;
}

function isVisible({
	param,
	values,
}: {
	param: ElementParamDefinition;
	values: ParamValues;
}): boolean {
	return (param.dependencies ?? []).every((dependency) =>
		areParamValuesEqual({
			left: values[dependency.param],
			right: dependency.equals,
		}),
	);
}

function areParamValuesEqual({
	left,
	right,
}: {
	left: ParamValue | undefined;
	right: ParamValue;
}): boolean {
	return left === right;
}
