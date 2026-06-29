"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { FontPicker } from "@/components/ui/font-picker";
import { 
	Play, 
	Check, 
	AlertTriangle, 
	FileVideo, 
	Image as ImageIcon, 
	Type as TypeIcon, 
	Download, 
	FolderArchive,
	Trash2,
	Plus,
	UploadCloud,
	ChevronRight,
	Minimize2
} from "lucide-react";
import { addWatermark, type WatermarkOptions } from "@/services/ffmpeg/watermark-service";
import JSZip from "jszip";

interface VideoQueueItem {
	id: string;
	file: File;
	previewUrl: string;
	status: "idle" | "processing" | "done" | "error";
	progress: number;
	outputUrl?: string;
	width?: number;
	height?: number;
	duration?: number;
}

const getVideoMetadata = (file: File): Promise<{ width: number; height: number; duration: number }> => {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const video = document.createElement("video");
		video.onloadedmetadata = () => {
			resolve({ 
				width: video.videoWidth, 
				height: video.videoHeight, 
				duration: video.duration || 10
			});
			URL.revokeObjectURL(url);
		};
		video.onerror = () => {
			reject(new Error("Failed to load video metadata"));
			URL.revokeObjectURL(url);
		};
		video.src = url;
	});
};

export default function WatermarkPage() {
	const [queue, setQueue] = useState<VideoQueueItem[]>([]);
	const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

	// Aspect ratio config
	const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1" | "4:3">("16:9");

	// Watermark 1 configuration
	const [watermarkType, setWatermarkType] = useState<"text" | "image">("text");
	const [watermarkText, setWatermarkText] = useState("Watermark Awal");
	const [fontFamily, setFontFamily] = useState("Inter");
	const [fontSize, setFontSize] = useState(24);
	const [fontColor, setFontColor] = useState("#ffffff");
	const [opacity, setOpacity] = useState(60);
	const [borderWidth, setBorderWidth] = useState(2);
	const [borderColor, setBorderColor] = useState("#000000");
	const [logoFile, setLogoFile] = useState<File | null>(null);
	const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
	const [logoSize, setLogoSize] = useState(15);

	// Position 1 configuration
	const [positionPreset, setPositionPreset] = useState<"tl" | "tr" | "c" | "bl" | "br" | "custom">("tr");
	const [xPercent, setXPercent] = useState(90);
	const [yPercent, setYPercent] = useState(10);

	// Watermark 2 (Dual) configuration
	const [isDual, setIsDual] = useState(false);
	const [watermarkType2, setWatermarkType2] = useState<"text" | "image">("text");
	const [watermarkText2, setWatermarkText2] = useState("Watermark Akhir");
	const [logoFile2, setLogoFile2] = useState<File | null>(null);
	const [logoPreviewUrl2, setLogoPreviewUrl2] = useState<string | null>(null);
	
	// Position 2 configuration
	const [positionPreset2, setPositionPreset2] = useState<"tl" | "tr" | "c" | "bl" | "br" | "custom">("br");
	const [xPercent2, setXPercent2] = useState(90);
	const [yPercent2, setYPercent2] = useState(90);

	// Dynamic scaling sync
	const [scaleFactor, setScaleFactor] = useState(0.3);

	// App state
	const [isProcessingBatch, setIsProcessingBatch] = useState(false);
	const [isDragActive, setIsDragActive] = useState(false);
	const [isZipping, setIsZipping] = useState(false);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const logoInputRef = useRef<HTMLInputElement>(null);
	const logoInputRef2 = useRef<HTMLInputElement>(null);
	const previewContainerRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);


	const applyPreset = (preset: "tl" | "tr" | "c" | "bl" | "br") => {
		setPositionPreset(preset);
		switch (preset) {
			case "tl":
				setXPercent(10);
				setYPercent(10);
				break;
			case "tr":
				setXPercent(90);
				setYPercent(10);
				break;
			case "c":
				setXPercent(50);
				setYPercent(50);
				break;
			case "bl":
				setXPercent(10);
				setYPercent(90);
				break;
			case "br":
				setXPercent(90);
				setYPercent(90);
				break;
		}
	};

	const applyPreset2 = (preset: "tl" | "tr" | "c" | "bl" | "br") => {
		setPositionPreset2(preset);
		switch (preset) {
			case "tl":
				setXPercent2(10);
				setYPercent2(10);
				break;
			case "tr":
				setXPercent2(90);
				setYPercent2(10);
				break;
			case "c":
				setXPercent2(50);
				setYPercent2(50);
				break;
			case "bl":
				setXPercent2(10);
				setYPercent2(90);
				break;
			case "br":
				setXPercent2(90);
				setYPercent2(90);
				break;
		}
	};

	const handleFiles = useCallback(async (files: FileList) => {
		const newItems: VideoQueueItem[] = [];
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (file.type.startsWith("video/")) {
				try {
					const meta = await getVideoMetadata(file);
					newItems.push({
						id: crypto.randomUUID(),
						file,
						previewUrl: URL.createObjectURL(file),
						status: "idle",
						progress: 0,
						width: meta.width,
						height: meta.height,
						duration: meta.duration,
					});
				} catch (err) {
					console.error("Gagal membaca metadata video:", err);
					newItems.push({
						id: crypto.randomUUID(),
						file,
						previewUrl: URL.createObjectURL(file),
						status: "idle",
						progress: 0,
						width: 1920,
						height: 1080,
						duration: 10,
					});
				}
			}
		}

		setQueue((q) => {
			const merged = [...q, ...newItems];
			if (merged.length > 0 && !activeVideoId) {
				setActiveVideoId(merged[0].id);
			}
			return merged;
		});
	}, [activeVideoId]);

	// Global drag & drop listener to allow dropping files anywhere on the page
	useEffect(() => {
		const handleDragOverGlobal = (e: DragEvent) => {
			e.preventDefault();
			setIsDragActive(true);
		};

		const handleDragLeaveGlobal = (e: DragEvent) => {
			e.preventDefault();
			// Only set false if we leave the window
			if (e.clientX === 0 && e.clientY === 0) {
				setIsDragActive(false);
			}
		};

		const handleDropGlobal = (e: DragEvent) => {
			e.preventDefault();
			setIsDragActive(false);
			if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
				handleFiles(e.dataTransfer.files);
			}
		};

		window.addEventListener("dragover", handleDragOverGlobal);
		window.addEventListener("dragleave", handleDragLeaveGlobal);
		window.addEventListener("drop", handleDropGlobal);

		return () => {
			window.removeEventListener("dragover", handleDragOverGlobal);
			window.removeEventListener("dragleave", handleDragLeaveGlobal);
			window.removeEventListener("drop", handleDropGlobal);
		};
	}, [handleFiles]);

	const onDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragActive(true);
	};

	const onDragLeave = () => {
		setIsDragActive(false);
	};

	const onDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragActive(false);
		if (e.dataTransfer.files) {
			handleFiles(e.dataTransfer.files);
		}
	};

	const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			setLogoFile(file);
			if (logoPreviewUrl) {
				URL.revokeObjectURL(logoPreviewUrl);
			}
			setLogoPreviewUrl(URL.createObjectURL(file));
		}
	};

	const handleLogoUpload2 = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			setLogoFile2(file);
			if (logoPreviewUrl2) {
				URL.revokeObjectURL(logoPreviewUrl2);
			}
			setLogoPreviewUrl2(URL.createObjectURL(file));
		}
	};

	// Calculate exact scale factor for preview sync
	useEffect(() => {
		const updateScale = () => {
			const videoEl = videoRef.current;
			if (!videoEl) return;

			const activeVideo = queue.find((v) => v.id === activeVideoId);
			if (!activeVideo || !activeVideo.width) return;

			const rect = videoEl.getBoundingClientRect();
			if (rect.width > 0) {
				setScaleFactor(rect.width / activeVideo.width);
			}
		};

		// Set observer or timeout to handle scaling once loaded
		const interval = setInterval(updateScale, 500);
		window.addEventListener("resize", updateScale);

		return () => {
			clearInterval(interval);
			window.removeEventListener("resize", updateScale);
		};
	}, [activeVideoId, queue]);

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		const rect = previewContainerRef.current?.getBoundingClientRect();
		if (!rect) return;

		const initialPointerX = e.clientX;
		const initialPointerY = e.clientY;
		const initialXPercent = xPercent;
		const initialYPercent = yPercent;

		setPositionPreset("custom");

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaX = moveEvent.clientX - initialPointerX;
			const deltaY = moveEvent.clientY - initialPointerY;

			const percentDeltaX = (deltaX / rect.width) * 100;
			const percentDeltaY = (deltaY / rect.height) * 100;

			const newX = Math.max(2, Math.min(98, initialXPercent + percentDeltaX));
			const newY = Math.max(2, Math.min(98, initialYPercent + percentDeltaY));

			setXPercent(newX);
			setYPercent(newY);
		};

		const handlePointerUp = () => {
			document.removeEventListener("pointermove", handlePointerMove);
			document.removeEventListener("pointerup", handlePointerUp);
		};

		document.addEventListener("pointermove", handlePointerMove);
		document.addEventListener("pointerup", handlePointerUp);
	};

	const handlePointerDown2 = (e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		const rect = previewContainerRef.current?.getBoundingClientRect();
		if (!rect) return;

		const initialPointerX = e.clientX;
		const initialPointerY = e.clientY;
		const initialXPercent = xPercent2;
		const initialYPercent = yPercent2;

		setPositionPreset2("custom");

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaX = moveEvent.clientX - initialPointerX;
			const deltaY = moveEvent.clientY - initialPointerY;

			const percentDeltaX = (deltaX / rect.width) * 100;
			const percentDeltaY = (deltaY / rect.height) * 100;

			const newX = Math.max(2, Math.min(98, initialXPercent + percentDeltaX));
			const newY = Math.max(2, Math.min(98, initialYPercent + percentDeltaY));

			setXPercent2(newX);
			setYPercent2(newY);
		};

		const handlePointerUp = () => {
			document.removeEventListener("pointermove", handlePointerMove);
			document.removeEventListener("pointerup", handlePointerUp);
		};

		document.addEventListener("pointermove", handlePointerMove);
		document.addEventListener("pointerup", handlePointerUp);
	};

	const startBatchProcess = async () => {
		if (queue.length === 0) return;
		if (watermarkType === "image" && !logoFile) {
			alert("Silakan unggah logo watermark PNG terlebih dahulu!");
			return;
		}
		if (isDual && watermarkType2 === "image" && !logoFile2) {
			alert("Silakan unggah logo watermark kedua terlebih dahulu!");
			return;
		}

		setIsProcessingBatch(true);

		for (const item of queue) {
			if (item.status === "done") continue;

			setQueue((q) =>
				q.map((v) =>
					v.id === item.id ? { ...v, status: "processing", progress: 0 } : v,
				),
			);
			setActiveVideoId(item.id);

			const opt: WatermarkOptions = {
				type: watermarkType,
				xPercent,
				yPercent,
				text: watermarkText,
				fontSize,
				fontFamily,
				fontColor,
				opacity,
				borderWidth,
				borderColor,
				imageFile: logoFile,
				imageSize: logoSize,

				// Dual Options
				isDual,
				type2: watermarkType2,
				xPercent2,
				yPercent2,
				text2: watermarkText2,
				imageFile2: logoFile2,
			};

			try {
				const outUrl = await addWatermark(item.file, opt, (p) => {
					setQueue((q) =>
						q.map((v) => (v.id === item.id ? { ...v, progress: p } : v)),
					);
				});
				setQueue((q) =>
					q.map((v) =>
						v.id === item.id
							? { ...v, status: "done", progress: 100, outputUrl: outUrl }
							: v,
					),
				);
			} catch (err) {
				console.error(`Gagal memproses watermark pada ${item.file.name}:`, err);
				setQueue((q) =>
					q.map((v) => (v.id === item.id ? { ...v, status: "error" } : v)),
				);
			}
		}

		setIsProcessingBatch(false);
	};

	const removeVideo = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		const item = queue.find((q) => q.id === id);
		if (item) {
			URL.revokeObjectURL(item.previewUrl);
			if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
		}
		setQueue((q) => q.filter((v) => v.id !== id));
		if (activeVideoId === id) setActiveVideoId(null);
	};

	const downloadAllAsZip = async () => {
		setIsZipping(true);
		try {
			const zip = new JSZip();
			const doneItems = queue.filter((q) => q.status === "done" && q.outputUrl);
			if (doneItems.length === 0) return;

			for (let i = 0; i < doneItems.length; i++) {
				const item = doneItems[i];
				const response = await fetch(item.outputUrl!);
				const blob = await response.blob();
				zip.file(`Watermarked_${item.file.name}`, blob);
			}

			const content = await zip.generateAsync({ type: "blob" });
			const zipUrl = URL.createObjectURL(content);

			const a = document.createElement("a");
			a.href = zipUrl;
			a.download = `watermarked_videos_${Date.now()}.zip`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(zipUrl);
		} catch (error) {
			console.error("Gagal membuat ZIP file:", error);
		} finally {
			setIsZipping(false);
		}
	};

	const activeVideo = queue.find((v) => v.id === activeVideoId);

	// Load Google Fonts dynamically for previews
	useEffect(() => {
		if (typeof window !== "undefined") {
			const linkId = "google-fonts-watermark-tool";
			if (!document.getElementById(linkId)) {
				const link = document.createElement("link");
				link.id = linkId;
				link.rel = "stylesheet";
				link.href =
					"https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;700&family=Lobster&family=Montserrat:wght@400;700&family=Oswald:wght@400;700&family=Pacifico&family=Poppins:wght@400;700&family=Roboto:wght@400;700&family=Playfair+Display:wght@400;700&family=Kanit:wght@400;700&family=Open+Sans:wght@400;700&display=swap";
				document.head.appendChild(link);
			}
		}
	}, []);

	// Aspect ratio class helper
	const aspectClass = 
		aspectRatio === "16:9" ? "aspect-video" :
		aspectRatio === "9:16" ? "aspect-[9/16]" :
		aspectRatio === "1:1" ? "aspect-square" :
		"aspect-[4/3]";

	return (
		<div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-blue-600/30 selection:text-blue-200">
			<Header />

			{/* Global Drag & Drop Overlay */}
			{isDragActive && (
				<div className="fixed inset-0 bg-blue-600/10 backdrop-blur-md border-4 border-dashed border-blue-500 z-50 flex flex-col items-center justify-center pointer-events-none">
					<div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl flex flex-col items-center shadow-2xl animate-bounce">
						<UploadCloud size={48} className="text-blue-500 mb-2" />
						<h3 className="text-sm font-bold text-white">Lepaskan untuk Menambahkan Video</h3>
						<p className="text-[10px] text-zinc-400 mt-1">Dukung format MP4, WebM, MOV, dll.</p>
					</div>
				</div>
			)}

			<main className="flex-grow max-w-7xl w-full mx-auto px-4 py-8 flex flex-col gap-6">
				{/* Top Info Header */}
				<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-900 pb-6">
					<div>
						<h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
							Watermark Massal
						</h1>
						<p className="text-xs text-zinc-400 mt-1">
							Bakar watermark teks atau logo gambar secara cepat ke banyak video sekaligus.
						</p>
					</div>
					<div className="flex items-center gap-2">
						{queue.length > 0 && (
							<Button
								variant="outline"
								onClick={() => setQueue([])}
								disabled={isProcessingBatch}
								size="sm"
								className="text-xs text-zinc-400 border-zinc-800 hover:bg-zinc-900"
							>
								Clear Queue
							</Button>
						)}
					</div>
				</div>

				{/* Drag & Drop Upload Zone */}
				{queue.length === 0 ? (
					<div
						onDragOver={onDragOver}
						onDragLeave={onDragLeave}
						onDrop={onDrop}
						onClick={() => fileInputRef.current?.click()}
						className={`flex-grow border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-12 text-center cursor-pointer transition-all duration-300 ${
							isDragActive
								? "border-blue-500 bg-blue-600/5"
								: "border-zinc-800 bg-zinc-900/10 hover:border-zinc-700 hover:bg-zinc-900/20"
						}`}
					>
						<input
							type="file"
							ref={fileInputRef}
							accept="video/*"
							multiple
							className="hidden"
							onChange={(e) => e.target.files && handleFiles(e.target.files)}
						/>
						<div className="p-4 bg-zinc-900 rounded-full border border-zinc-800 shadow-md mb-4 text-blue-400">
							<UploadCloud size={32} />
						</div>
						<h3 className="font-semibold text-sm">Unggah Video Anda</h3>
						<p className="text-xs text-zinc-400 max-w-xs mt-2 leading-relaxed">
							Seret dan letakkan file video di sini, atau klik untuk memilih file dari komputer Anda.
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
						{/* Left Column: Preview & Configuration */}
						<div className="lg:col-span-7 flex flex-col gap-6">
							{/* Preview Card */}
							<div className="bg-zinc-900/30 rounded-2xl border border-zinc-900 p-4 flex flex-col gap-4 shadow-xl">
								<div className="flex justify-between items-center">
									<h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
										Interactive Preview ({activeVideo?.file.name})
									</h3>
									{/* Aspect Ratio Selector */}
									<div className="flex items-center gap-1.5 bg-zinc-950 p-1 border border-zinc-850 rounded-lg">
										{(["16:9", "9:16", "1:1", "4:3"] as const).map((r) => (
											<button
												key={r}
												type="button"
												onClick={() => setAspectRatio(r)}
												className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${
													aspectRatio === r
														? "bg-blue-600 text-white"
														: "text-zinc-500 hover:text-white"
												}`}
											>
												{r}
											</button>
										))}
									</div>
								</div>

								{activeVideo ? (
									<div
										ref={previewContainerRef}
										className={`relative ${aspectClass} w-full bg-black rounded-lg overflow-hidden border border-zinc-850 shadow-inner group select-none`}
									>
										<video
											ref={videoRef}
											src={activeVideo.previewUrl}
											muted
											loop
											playsInline
											controls
											className="w-full h-full object-contain pointer-events-none"
										/>

										{/* Interactive Overlay Layer 1 */}
										<div
											className="absolute transition-transform pointer-events-auto select-none cursor-move z-10"
											onPointerDown={handlePointerDown}
											style={{
												left: `${xPercent}%`,
												top: `${yPercent}%`,
												transform: `translate(-${xPercent}%, -${yPercent}%)`,
											}}
										>
											{watermarkType === "text" ? (
												<div
													style={{
														fontFamily: fontFamily,
														fontSize: `${fontSize * scaleFactor}px`,
														color: fontColor,
														opacity: opacity / 100,
														fontWeight: "bold",
														whiteSpace: "nowrap",
														textShadow: borderWidth > 0
															? `-${borderWidth}px -${borderWidth}px 0 ${borderColor}, ${borderWidth}px -${borderWidth}px 0 ${borderColor}, -${borderWidth}px ${borderWidth}px 0 ${borderColor}, ${borderWidth}px ${borderWidth}px 0 ${borderColor}`
															: "none",
													}}
													className="relative"
												>
													{watermarkText || "Watermark Awal"}
													{isDual && (
														<span className="absolute -top-4 left-0 bg-blue-500 text-[8px] text-white px-1 rounded whitespace-nowrap">Early (Top)</span>
													)}
												</div>
											) : logoPreviewUrl ? (
												<div className="relative">
													<img
														src={logoPreviewUrl}
														alt="Watermark Logo"
														style={{
															width: `${Math.round((activeVideo.width || 1920) * (logoSize / 100) * scaleFactor)}px`,
															height: "auto",
															opacity: opacity / 100,
														}}
													/>
													{isDual && (
														<span className="absolute -top-4 left-0 bg-blue-500 text-[8px] text-white px-1 rounded whitespace-nowrap">Early (Top)</span>
													)}
												</div>
											) : (
												<div className="bg-zinc-900/90 text-[10px] text-zinc-500 border border-dashed border-zinc-800 rounded px-2 py-1 flex items-center gap-1.5 font-sans">
													<ImageIcon size={12} />
													Belum ada logo
												</div>
											)}
										</div>

										{/* Interactive Overlay Layer 2 (Dual) */}
										{isDual && (
											<div
												className="absolute transition-transform pointer-events-auto select-none cursor-move z-10"
												onPointerDown={handlePointerDown2}
												style={{
													left: `${xPercent2}%`,
													top: `${yPercent2}%`,
													transform: `translate(-${xPercent2}%, -${yPercent2}%)`,
												}}
											>
												{watermarkType2 === "text" ? (
													<div
														style={{
															fontFamily: fontFamily,
															fontSize: `${fontSize * scaleFactor}px`,
															color: fontColor,
															opacity: opacity / 100,
															fontWeight: "bold",
															whiteSpace: "nowrap",
															textShadow: borderWidth > 0
																? `-${borderWidth}px -${borderWidth}px 0 ${borderColor}, ${borderWidth}px -${borderWidth}px 0 ${borderColor}, -${borderWidth}px ${borderWidth}px 0 ${borderColor}, ${borderWidth}px ${borderWidth}px 0 ${borderColor}`
																: "none",
														}}
														className="relative"
													>
														{watermarkText2 || "Watermark Akhir"}
														<span className="absolute -top-4 left-0 bg-indigo-500 text-[8px] text-white px-1 rounded whitespace-nowrap">Late (Bottom)</span>
													</div>
												) : logoPreviewUrl2 ? (
													<div className="relative">
														<img
															src={logoPreviewUrl2}
															alt="Watermark Logo 2"
															style={{
																width: `${Math.round((activeVideo.width || 1920) * (logoSize / 100) * scaleFactor)}px`,
																height: "auto",
																opacity: opacity / 100,
															}}
														/>
														<span className="absolute -top-4 left-0 bg-indigo-500 text-[8px] text-white px-1 rounded whitespace-nowrap">Late (Bottom)</span>
													</div>
												) : (
													<div className="bg-zinc-900/90 text-[10px] text-zinc-500 border border-dashed border-zinc-800 rounded px-2 py-1 flex items-center gap-1.5 font-sans">
														<ImageIcon size={12} />
														Belum ada logo 2
													</div>
												)}
											</div>
										)}

										{/* Tip Indicator */}
										<div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-[9px] text-zinc-400 px-2 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
											Drag watermark di atas untuk memindahkan posisi
										</div>
									</div>
								) : (
									<div className="aspect-video w-full bg-zinc-950 rounded-lg flex items-center justify-center border border-zinc-850">
										<p className="text-zinc-500 text-xs">Pilih video dari antrian untuk melihat preview</p>
									</div>
								)}
							</div>

							{/* Config Settings Card */}
							<div className="bg-zinc-900/30 rounded-2xl border border-zinc-900 p-6 flex flex-col gap-6 shadow-xl">
								<div className="flex items-center justify-between">
									<h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
										Pengaturan Watermark
									</h3>

									{/* Dual Watermark Switch */}
									<label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-400 hover:text-white">
										<input
											type="checkbox"
											checked={isDual}
											onChange={(e) => setIsDual(e.target.checked)}
											className="rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-0 focus:ring-offset-0"
										/>
										Dual Watermark (Beda Posisi & Durasi)
									</label>
								</div>

								{/* Watermark 2 parameters (Dynamic) */}
								{isDual && (
									<div className="flex flex-col gap-4 border border-zinc-900 p-4 rounded-xl bg-zinc-950/20">
										<span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
											Watermark 2 (Durasi Akhir - Bawah)
										</span>

										{/* Watermark 2 Type Selector */}
										<div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950 rounded-lg border border-zinc-855">
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => setWatermarkType2("text")}
												className={`text-xs gap-1.5 ${
													watermarkType2 === "text"
														? "bg-zinc-900 text-white font-bold"
														: "text-zinc-400 hover:text-white"
												}`}
											>
												<TypeIcon size={14} />
												Teks Watermark 2
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => setWatermarkType2("image")}
												className={`text-xs gap-1.5 ${
													watermarkType2 === "image"
														? "bg-zinc-900 text-white font-bold"
														: "text-zinc-400 hover:text-white"
												}`}
											>
												<ImageIcon size={14} />
												Logo Gambar 2
											</Button>
										</div>

										{watermarkType2 === "text" ? (
											<div className="flex flex-col gap-2">
												<Label htmlFor="wm-text2" className="text-xs text-zinc-400">Konten Teks 2</Label>
												<Input
													id="wm-text2"
													value={watermarkText2}
													onChange={(e) => setWatermarkText2(e.target.value)}
													placeholder="Masukkan teks watermark kedua..."
													className="bg-zinc-950 border-zinc-850 focus-visible:ring-indigo-600 text-xs text-white"
												/>
											</div>
										) : (
											<div className="flex flex-col gap-2">
												<Label className="text-xs text-zinc-400">Berkas Logo 2 (PNG Transparan)</Label>
												<input
													type="file"
													ref={logoInputRef2}
													accept="image/png"
													className="hidden"
													onChange={handleLogoUpload2}
												/>
												<div className="flex items-center gap-3">
													<Button
														type="button"
														variant="outline"
														onClick={() => logoInputRef2.current?.click()}
														className="text-xs border-zinc-800 hover:bg-zinc-900 bg-zinc-950"
													>
														Pilih Gambar 2
													</Button>
													{logoFile2 && (
														<span className="text-xs text-zinc-400 max-w-[200px] truncate">
															{logoFile2.name}
														</span>
													)}
												</div>
											</div>
										)}

										{/* Position grid selector 2 */}
										<div className="flex flex-col gap-3 border-t border-zinc-850/50 pt-3">
											<Label className="text-xs text-zinc-400">Posisi Akhir</Label>
											<div className="grid grid-cols-5 gap-1.5 bg-zinc-950 p-2 rounded-lg border border-zinc-850 self-start">
												{(["tl", "tr", "c", "bl", "br"] as const).map((preset) => (
													<button
														key={preset}
														type="button"
														onClick={() => applyPreset2(preset)}
														className={`text-[9px] uppercase font-bold py-1.5 px-2.5 rounded border transition-all ${
															positionPreset2 === preset
																? "bg-indigo-600/20 border-indigo-500 text-indigo-400"
																: "border-zinc-855 hover:border-zinc-700 bg-zinc-900 text-zinc-400"
														}`}
													>
														{preset}
													</button>
												))}
											</div>
										</div>
									</div>
								)}

								{/* Opacity Slider */}
								<div className="flex flex-col gap-2 border-t border-zinc-850/50 pt-4">
									<div className="flex justify-between items-center">
										<Label className="text-xs text-zinc-400">Transparansi Watermark</Label>
										<span className="text-xs font-mono font-bold text-blue-400">{opacity}%</span>
									</div>
									<Slider
										value={[opacity]}
										onValueChange={(val) => setOpacity(val[0])}
										min={10}
										max={100}
										step={5}
										className="my-1.5"
									/>
								</div>


								{/* Position grid selector */}
								<div className="flex flex-col gap-3 border-t border-zinc-850/50 pt-4">
									<Label className="text-xs text-zinc-400">Posisi Watermark</Label>
									<div className="grid grid-cols-3 gap-2 w-40 bg-zinc-950 p-2 rounded-lg border border-zinc-850 self-start">
										<button
											type="button"
											onClick={() => applyPreset("tl")}
											className={`aspect-square w-full rounded border transition-all ${
												positionPreset === "tl" ? "bg-blue-600/20 border-blue-500" : "border-zinc-800 hover:border-zinc-700 bg-zinc-900"
											}`}
											title="Top Left"
										/>
										<div className="aspect-square w-full flex items-center justify-center text-[10px] text-zinc-600 font-bold uppercase font-mono">Top</div>
										<button
											type="button"
											onClick={() => applyPreset("tr")}
											className={`aspect-square w-full rounded border transition-all ${
												positionPreset === "tr" ? "bg-blue-600/20 border-blue-500" : "border-zinc-800 hover:border-zinc-700 bg-zinc-900"
											}`}
											title="Top Right"
										/>
										<div className="aspect-square w-full flex items-center justify-center text-[10px] text-zinc-600 font-bold uppercase font-mono">Mid L</div>
										<button
											type="button"
											onClick={() => applyPreset("c")}
											className={`aspect-square w-full rounded border transition-all ${
												positionPreset === "c" ? "bg-blue-600/20 border-blue-500" : "border-zinc-800 hover:border-zinc-700 bg-zinc-900"
											}`}
											title="Center"
										/>
										<div className="aspect-square w-full flex items-center justify-center text-[10px] text-zinc-600 font-bold uppercase font-mono">Mid R</div>
										<button
											type="button"
											onClick={() => applyPreset("bl")}
											className={`aspect-square w-full rounded border transition-all ${
												positionPreset === "bl" ? "bg-blue-600/20 border-blue-500" : "border-zinc-800 hover:border-zinc-700 bg-zinc-900"
											}`}
											title="Bottom Left"
										/>
										<div className="aspect-square w-full flex items-center justify-center text-[10px] text-zinc-600 font-bold uppercase font-mono">Btm</div>
										<button
											type="button"
											onClick={() => applyPreset("br")}
											className={`aspect-square w-full rounded border transition-all ${
												positionPreset === "br" ? "bg-blue-600/20 border-blue-500" : "border-zinc-800 hover:border-zinc-700 bg-zinc-900"
											}`}
											title="Bottom Right"
										/>
									</div>
								</div>
							</div>
						</div>

						{/* Right Column: Processing Queue list */}
						<div className="lg:col-span-5 flex flex-col gap-6">
							<div className="bg-zinc-900/30 rounded-2xl border border-zinc-900 p-6 flex flex-col gap-4 shadow-xl h-full max-h-[720px] overflow-hidden">
								<div className="flex items-center justify-between">
									<h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
										Antrean Video ({queue.length})
									</h3>
									{queue.length > 0 && (
										<Button
											type="button"
											variant="ghost"
											onClick={() => fileInputRef.current?.click()}
											disabled={isProcessingBatch}
											className="text-xs text-blue-400 hover:text-blue-300 font-bold gap-1"
										>
											<Plus size={14} />
											Add Files
										</Button>
									)}
								</div>

								{/* Queue Scrolling list */}
								<div className="flex-grow overflow-y-auto space-y-3 pr-1">
									{queue.map((item) => (
										<div
											key={item.id}
											onClick={() => !isProcessingBatch && setActiveVideoId(item.id)}
											className={`p-3.5 rounded-xl border flex items-center gap-3.5 cursor-pointer relative group transition-all duration-200 ${
												activeVideoId === item.id
													? "border-blue-600/80 bg-blue-600/5"
													: "border-zinc-850 bg-zinc-900/20 hover:border-zinc-800"
											}`}
										>
											<div className="p-2.5 bg-zinc-950 border border-zinc-850 rounded-lg text-zinc-400">
												<FileVideo size={20} />
											</div>

											<div className="flex-grow min-w-0 pr-6">
												<h4 className="text-xs font-bold text-white truncate leading-none">
													{item.file.name}
												</h4>
												<p className="text-[10px] text-zinc-500 font-mono mt-1">
													{(item.file.size / (1024 * 1024)).toFixed(1)} MB
												</p>

												{/* Progress Bar inside Queue List */}
												{item.status === "processing" && (
													<div className="mt-2">
														<div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
															<div
																className="h-full bg-blue-500 transition-all duration-250"
																style={{ width: `${item.progress}%` }}
															/>
														</div>
														<span className="text-[9px] font-bold font-mono text-blue-400 mt-1 block">
															Processing: {item.progress}%
														</span>
													</div>
												)}
											</div>

											{/* Status badge & individual Actions */}
											<div className="flex items-center gap-1.5 z-10">
												{item.status === "done" && item.outputUrl && (
													<a
														href={item.outputUrl}
														download={`WM_${item.file.name}`}
														onClick={(e) => e.stopPropagation()}
														className="p-1.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded hover:bg-green-500/20 transition-all"
														title="Download Hasil"
													>
														<Download size={14} />
													</a>
												)}
												{item.status === "error" && (
													<AlertTriangle size={16} className="text-red-500" />
												)}
												{item.status === "done" && (
													<Check size={16} className="text-green-500 animate-pulse" />
												)}
												
												{!isProcessingBatch && (
													<button
														type="button"
														onClick={(e) => removeVideo(item.id, e)}
														className="p-1.5 text-zinc-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
														title="Hapus"
													>
														<Trash2 size={14} />
													</button>
												)}
											</div>
										</div>
									))}
								</div>

								{/* Bottom Queue Action Buttons */}
								<div className="border-t border-zinc-900 pt-4 flex flex-col gap-3">
									<Button
										type="button"
										onClick={startBatchProcess}
										disabled={
											isProcessingBatch || 
											queue.filter((q) => q.status !== "done").length === 0
										}
										className="w-full bg-blue-600 hover:bg-blue-500 font-bold gap-2 text-xs h-10 shadow-lg shadow-blue-500/10"
									>
										{isProcessingBatch ? (
											<>
												<Spinner size="sm" className="mr-1" />
												Bakar Watermark...
											</>
										) : (
											<>
												<Play size={14} fill="currentColor" />
												Proses {queue.filter((q) => q.status !== "done").length} Video
											</>
										)}
									</Button>

									{queue.filter((q) => q.status === "done").length > 0 && (
										<Button
											type="button"
											variant="secondary"
											onClick={downloadAllAsZip}
											disabled={isZipping}
											className="w-full border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:text-white font-bold gap-2 text-xs h-10"
										>
											{isZipping ? (
												<>
													<Spinner size="sm" className="mr-1" />
													Membuat ZIP...
												</>
											) : (
												<>
													<FolderArchive size={14} />
													Unduh Semua (ZIP)
												</>
											)}
										</Button>
									)}
								</div>
							</div>
						</div>
					</div>
				)}
			</main>

			<Footer />
		</div>
	);
}
