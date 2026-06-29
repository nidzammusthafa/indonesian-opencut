import { create } from "zustand";

interface CaptionGlobalModeStore {
	isGlobalMode: boolean;
	setGlobalMode: (value: boolean) => void;
	toggleGlobalMode: () => void;
}

export const useCaptionGlobalModeStore = create<CaptionGlobalModeStore>(
	(set) => ({
		isGlobalMode: true, // Default: global mode aktif
		setGlobalMode: (value) => set({ isGlobalMode: value }),
		toggleGlobalMode: () =>
			set((state) => ({ isGlobalMode: !state.isGlobalMode })),
	}),
);
