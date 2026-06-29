import { getPersistedKeybindingsState } from "../persisted-state";

export function v7ToV8({ state }: { state: unknown }): unknown {
	const v7 = getPersistedKeybindingsState({ state });
	if (!v7) return state;
	const keybindings = { ...v7.keybindings };

	// If the user has "s" mapped to "split", migrate it to "c"
	if (keybindings["s"] === "split") {
		delete keybindings["s"];
		keybindings["c"] = "split";
	}

	return { ...v7, keybindings };
}
