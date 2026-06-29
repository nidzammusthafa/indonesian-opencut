import { Button } from "@/components/ui/button";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useReducer, useRef, useState, useEffect } from "react";
import { extractTimelineAudio } from "@/media/mediabunny";
import { useEditor } from "@/editor/use-editor";
import { TRANSCRIPTION_DIAGNOSTICS_SCOPE } from "@/transcription/diagnostics";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type {
	CaptionChunk,
	TranscriptionLanguage,
	TranscriptionProgress,
} from "@/transcription/types";
import { transcriptionService } from "@/services/transcription/service";
import { cloudflareTranscriptionService } from "@/services/transcription/cloudflare-service";
import { decodeAudioToFloat32 } from "@/media/audio";
import { buildCaptionChunks } from "@/transcription/caption";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import { parseSubtitleFile } from "@/subtitles/parse";
import { Spinner } from "@/components/ui/spinner";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
} from "@/components/section";
import { AlertCircleIcon, CloudUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DiagnosticSeverity } from "@/diagnostics/types";
import { 
	AddTrackCommand, 
	BatchCommand, 
	InsertElementCommand, 
	DeleteElementsCommand, 
	UpdateElementsCommand,
} from "@/commands";
import { mediaTimeToSeconds } from "@/wasm";
import { buildSubtitleTextElement } from "../build-subtitle-text-element";
import { Trash2, Plus, Globe, User, Cloud, Save, Check } from "lucide-react";
import { useCaptionGlobalModeStore } from "@/subtitles/stores/caption-global-mode-store";
import type { SubtitleCue } from "../types";


const DIAGNOSTIC_BUTTON_VARIANT: Record<
	DiagnosticSeverity,
	"caution" | "destructive-foreground"
> = {
	caution: "caution",
	error: "destructive-foreground",
};

type ProcessingState =
	| { status: "idle"; error: string | null; warnings: string[] }
	| { status: "processing"; step: string };

type ProcessingAction =
	| { type: "start"; step: string }
	| { type: "update_step"; step: string }
	| { type: "succeed"; warnings: string[] }
	| { type: "fail"; error: string };

const IDLE_STATE: ProcessingState = {
	status: "idle",
	error: null,
	warnings: [],
};

/* eslint-disable opencut/prefer-object-params -- React reducers must accept (state, action). */
function processingReducer(
	state: ProcessingState,
	action: ProcessingAction,
): ProcessingState {
	switch (action.type) {
		case "start":
			return { status: "processing", step: action.step };
		case "update_step":
			if (state.status !== "processing") return state;
			return { status: "processing", step: action.step };
		case "succeed":
			return { status: "idle", error: null, warnings: action.warnings };
		case "fail":
			return { status: "idle", error: action.error, warnings: [] };
	}
}
/* eslint-enable opencut/prefer-object-params */

export function Captions() {
	const [selectedLanguage, setSelectedLanguage] = useState<TranscriptionLanguage>(() => {
		if (typeof window !== "undefined") {
			return (localStorage.getItem("transcription-selected-language") as TranscriptionLanguage) ?? "auto";
		}
		return "auto";
	});
	const [processing, dispatch] = useReducer(processingReducer, IDLE_STATE);
	const containerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const editor = useEditor();
	const activeScene = useEditor((e) => e.scenes.getActiveScene());
	const textTracks = activeScene.tracks.overlay.filter(
		(track) => track.type === "text",
	);
	const textTrack = textTracks[0];
	const captionsList = textTrack ? textTrack.elements : [];

	// Global/Individual mode — menggunakan Zustand store agar bisa diakses dari hook lain
	const { isGlobalMode: isCaptionGlobalMode, setGlobalMode: setIsCaptionGlobalMode } = useCaptionGlobalModeStore();

	// Cloudflare transcription mode
	const [useCloudflare, setUseCloudflare] = useState<boolean>(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem("transcription-use-cloudflare") === "true";
		}
		return false;
	});
	const [cloudflareWorkerUrl, setCloudflareWorkerUrl] = useState<string>(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem("cf-whisper-url") ?? "";
		}
		return "";
	});
	const [maxWords, setMaxWords] = useState<number>(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("transcription-max-words");
			return saved ? parseInt(saved, 10) : 3;
		}
		return 3;
	});
	// Load global mode on mount
	useEffect(() => {
		if (typeof window !== "undefined") {
			const savedMode = localStorage.getItem("transcription-global-mode");
			if (savedMode !== null) {
				setIsCaptionGlobalMode(savedMode === "true");
			}
		}
	}, [setIsCaptionGlobalMode]);

	const sortedCaptions = [...captionsList].sort(
		(a, b) => mediaTimeToSeconds({ time: a.startTime }) - mediaTimeToSeconds({ time: b.startTime }),
	);

	const handleAddManualCaption = () => {
		const currentTime = editor.playback.getCurrentTime();
		const canvasSize = editor.project.getActive().settings.canvasSize;
		
		const maxDurationSeconds = mediaTimeToSeconds({
			time: editor.timeline.getTotalDuration(),
		});
		const startTime = Math.min(
			mediaTimeToSeconds({ time: currentTime }),
			maxDurationSeconds,
		);
		const duration = Math.min(2.0, maxDurationSeconds - startTime);

		if (duration <= 0.05) return;

		const newCaption: SubtitleCue = {
			text: "Subtitle Baru...",
			startTime,
			duration,
		};

		let trackId = textTrack?.id;
		const commands = [];
		if (!trackId) {
			const addTrackCommand = new AddTrackCommand({ type: "text", index: 0 });
			trackId = addTrackCommand.getTrackId();
			commands.push(addTrackCommand);
		}

		commands.push(
			new InsertElementCommand({
				placement: { mode: "explicit", trackId },
				element: buildSubtitleTextElement({
					index: captionsList.length,
					caption: newCaption,
					canvasSize,
				}),
			}),
		);

		editor.command.execute({
			command: new BatchCommand(commands),
		});
	};

	const handleUpdateCaptionText = (elementId: string, newText: string) => {
		if (!textTrack) return;
		editor.command.execute({
			command: new UpdateElementsCommand({
				updates: [
					{
						trackId: textTrack.id,
						elementId,
						patch: {
							params: {
								content: newText,
							},
						},
					},
				],
			}),
		});
	};

	const handleDeleteCaption = (elementId: string) => {
		if (!textTrack) return;
		editor.command.execute({
			command: new DeleteElementsCommand({
				elements: [
					{
						trackId: textTrack.id,
						elementId,
					},
				],
			}),
		});
	};

	const isProcessing = processing.status === "processing";

	const activeDiagnostics = useEditor((e) =>
		e.diagnostics.getActive({ scope: TRANSCRIPTION_DIAGNOSTICS_SCOPE }),
	);

	const handleProgress = (progress: TranscriptionProgress) => {
		if (progress.status === "loading-model") {
			dispatch({
				type: "update_step",
				step: `Loading model ${Math.round(progress.progress)}%`,
			});
		} else if (progress.status === "transcribing") {
			dispatch({ type: "update_step", step: "Transcribing..." });
		}
	};

	const insertCaptions = ({
		captions,
	}: {
		captions: CaptionChunk[];
	}): boolean => {
		const trackId = insertCaptionChunksAsTextTrack({ editor, captions });
		return trackId !== null;
	};

	const handleGenerateTranscript = async () => {
		dispatch({ type: "start", step: "Extracting audio..." });
		try {
			const audioBlob = await extractTimelineAudio({
				tracks: editor.scenes.getActiveScene().tracks,
				mediaAssets: editor.media.getAssets(),
				totalDuration: editor.timeline.getTotalDuration(),
			});

			let result;

			if (useCloudflare && cloudflareWorkerUrl) {
				dispatch({ type: "update_step", step: "Sending to Cloud Server..." });
				result = await cloudflareTranscriptionService.transcribe({
					audioBlob,
					language: selectedLanguage,
					workerUrl: cloudflareWorkerUrl,
					maxWords,
				});
			} else {
				dispatch({ type: "update_step", step: "Preparing audio..." });
				const { samples } = await decodeAudioToFloat32({
					audioBlob,
					sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
				});

				result = await transcriptionService.transcribe({
					audioData: samples,
					language: selectedLanguage === "auto" ? undefined : selectedLanguage,
					onProgress: handleProgress,
				});
			}


			dispatch({ type: "update_step", step: "Generating captions..." });
			// Use pre-built word-accurate chunks when available (word-level timing),
			// otherwise fall back to the linear distribution of buildCaptionChunks().
			const captionChunks = result.captionChunks && result.captionChunks.length > 0
				? result.captionChunks
				: buildCaptionChunks({ segments: result.segments, wordsPerChunk: maxWords });

			if (!insertCaptions({ captions: captionChunks })) {
				dispatch({ type: "fail", error: "No captions were generated" });
				return;
			}

			dispatch({ type: "succeed", warnings: [] });
		} catch (error) {
			console.error("Transcription failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	const handleImportFile = async ({ file }: { file: File }) => {
		dispatch({ type: "start", step: "Reading subtitle file..." });
		try {
			const input = await file.text();
			const result = parseSubtitleFile({
				fileName: file.name,
				input,
			});

			if (result.captions.length === 0) {
				dispatch({
					type: "fail",
					error: "No valid subtitle cues were found in the subtitle file",
				});
				return;
			}

			dispatch({ type: "update_step", step: "Importing subtitles..." });

			if (!insertCaptions({ captions: result.captions })) {
				dispatch({ type: "fail", error: "No captions were generated" });
				return;
			}

			const nextWarnings = [...result.warnings];
			if (result.skippedCueCount > 0) {
				nextWarnings.unshift(
					`Imported ${result.captions.length} subtitle cue(s) and skipped ${result.skippedCueCount} malformed cue(s).`,
				);
			}

			dispatch({ type: "succeed", warnings: nextWarnings });
		} catch (error) {
			console.error("Subtitle import failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleFileChange = async ({
		event,
	}: {
		event: React.ChangeEvent<HTMLInputElement>;
	}) => {
		const file = event.target.files?.[0];
		if (event.target) {
			event.target.value = "";
		}
		if (!file) return;

		await handleImportFile({ file });
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage("auto");
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage(matchedLanguage.code);
	};

	const error = processing.status === "idle" ? processing.error : null;
	const warnings = processing.status === "idle" ? processing.warnings : [];

	return (
		<PanelView
			title="Captions"
			contentClassName="px-0 flex flex-col h-full"
			actions={
				<TooltipProvider>
					<div className="flex items-center gap-1.5">
						{!isProcessing &&
							activeDiagnostics.map((diagnostic) => (
								<Tooltip key={diagnostic.id}>
									<TooltipTrigger asChild>
										<Button
											variant={DIAGNOSTIC_BUTTON_VARIANT[diagnostic.severity]}
											size="icon"
											aria-label={diagnostic.message}
										>
											<HugeiconsIcon icon={AlertCircleIcon} size={16} />
										</Button>
									</TooltipTrigger>
									<TooltipContent>{diagnostic.message}</TooltipContent>
								</Tooltip>
							))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleImportClick}
							disabled={isProcessing}
							className="items-center justify-center gap-1.5"
						>
							<HugeiconsIcon icon={CloudUploadIcon} />
							Import
						</Button>
					</div>
				</TooltipProvider>
			}
			ref={containerRef}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".srt,.ass"
				className="hidden"
				onChange={(event) => void handleFileChange({ event })}
			/>
			<Section
				showTopBorder={false}
				showBottomBorder={false}
				className="flex-1"
			>
				<SectionContent className="flex flex-col gap-4 h-full pt-1">
					<SectionFields>
						<SectionField label="Transcription Engine">
							<div className="flex gap-2 mb-2">
								<Button
									type="button"
									variant={useCloudflare ? "outline" : "default"}
									size="sm"
									className="flex-1 text-[11px]"
									onClick={() => setUseCloudflare(false)}
								>
									<User size={12} className="mr-1" />
									Local AI
								</Button>
								<Button
									type="button"
									variant={useCloudflare ? "default" : "outline"}
									size="sm"
									className="flex-1 text-[11px]"
									onClick={() => setUseCloudflare(true)}
								>
									<Cloud size={12} className="mr-1" />
									Cloud
								</Button>
							</div>
						</SectionField>
 
						{useCloudflare && (
							<SectionField label="API URL">
								<input
									type="text"
									placeholder="https://api.whisper-server.com"
									value={cloudflareWorkerUrl}
									onChange={(e) => {
										setCloudflareWorkerUrl(e.target.value);
										localStorage.setItem("cf-whisper-url", e.target.value);
									}}
									className="border-input bg-accent h-7 w-full rounded-md border px-2.5 text-xs outline-none focus-visible:border-primary"
								/>
							</SectionField>
						)}

						<SectionField label="Language">
							<Select
								value={selectedLanguage}
								onValueChange={(value) => handleLanguageChange({ value })}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a language" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto detect</SelectItem>
									{TRANSCRIPTION_LANGUAGES.map((language) => (
										<SelectItem key={language.code} value={language.code}>
											{language.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>

						<SectionField label="Max Words per Caption">
							<Select
								value={maxWords.toString()}
								onValueChange={(value) => {
									const val = parseInt(value, 10);
									setMaxWords(val);
									localStorage.setItem("transcription-max-words", value);
								}}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select max words" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="1">1 word (Flashing style)</SelectItem>
									<SelectItem value="2">2 words</SelectItem>
									<SelectItem value="3">3 words (Recommended)</SelectItem>
									<SelectItem value="4">4 words</SelectItem>
									<SelectItem value="5">5 words</SelectItem>
									<SelectItem value="6">6 words</SelectItem>
								</SelectContent>
							</Select>
						</SectionField>

						<SectionField label="Subtitle Style Mode">
							<div className="flex gap-2">
								<Button
									type="button"
									variant={isCaptionGlobalMode ? "outline" : "default"}
									size="sm"
									className="flex-1 text-[11px]"
									onClick={() => setIsCaptionGlobalMode(false)}
								>
									<User size={12} className="mr-1" />
									Individual
								</Button>
								<Button
									type="button"
									variant={isCaptionGlobalMode ? "default" : "outline"}
									size="sm"
									className="flex-1 text-[11px]"
									onClick={() => setIsCaptionGlobalMode(true)}
								>
									<Globe size={12} className="mr-1" />
									Global
								</Button>
							</div>
							{isCaptionGlobalMode && (
								<p className="text-[10px] text-muted-foreground mt-1">
									Perubahan style dari Properties panel akan diterapkan ke semua caption.
								</p>
							)}
						</SectionField>
					</SectionFields>

					<div className="flex flex-col gap-2.5">
						<Button
							type="button"
							className="w-full"
							onClick={handleGenerateTranscript}
							disabled={isProcessing || activeDiagnostics.length > 0}
						>
							{isProcessing && <Spinner className="mr-1" />}
							{isProcessing ? processing.step : "Generate transcript"}
						</Button>

						<div className="flex items-center my-1">
							<div className="flex-grow border-t border-zinc-800" />
							<span className="px-2 text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Atau</span>
							<div className="flex-grow border-t border-zinc-800" />
						</div>

						<Button
							type="button"
							variant="outline"
							className="w-full flex items-center justify-center gap-1.5"
							onClick={handleAddManualCaption}
							disabled={isProcessing}
						>
							<Plus size={14} />
							Tambah Subtitle Manual
						</Button>
					</div>

					{error && (
						<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}
					{warnings.length > 0 && (
						<div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
							<ul className="space-y-1 text-sm text-amber-700">
								{warnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</div>
					)}

					{sortedCaptions.length > 0 && (
						<div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1 border-t border-zinc-850 pt-4 mt-2">
							<span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
								Daftar Subtitle ({sortedCaptions.length})
							</span>
							<div className="space-y-2">
								{sortedCaptions.map((cap) => {
									const startSec = mediaTimeToSeconds({ time: cap.startTime });
									const durSec = mediaTimeToSeconds({ time: cap.duration });
									const endSec = startSec + durSec;
									const contentVal = typeof cap.params.content === "string" ? cap.params.content : "";
									
									return (
										<div
											key={cap.id}
											className="bg-zinc-900/40 p-2 rounded-lg border border-zinc-800/80 flex flex-col gap-1.5 group relative hover:border-zinc-700 transition-all"
										>
											<div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
												<span>{startSec.toFixed(2)}s ➜ {endSec.toFixed(2)}s</span>
												<button
													type="button"
													onClick={() => handleDeleteCaption(cap.id)}
													className="text-zinc-500 hover:text-red-500 transition-colors"
													title="Hapus"
												>
													<Trash2 size={12} />
												</button>
											</div>
											<textarea
												value={contentVal}
												onChange={(e) => handleUpdateCaptionText(cap.id, e.target.value)}
												rows={1}
												className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 resize-none font-sans"
											/>
										</div>
									);
								})}
							</div>
						</div>
					)}
				</SectionContent>
			</Section>
		</PanelView>
	);
}
