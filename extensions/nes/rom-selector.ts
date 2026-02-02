import type { ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getSelectListTheme } from "@mariozechner/pi-coding-agent";
import {
	Container,
	Input,
	SelectList,
	Spacer,
	Text,
	TUI,
	type Component,
	type Focusable,
	type SelectItem,
	getEditorKeybindings,
} from "@mariozechner/pi-tui";
import type { RomEntry } from "./roms.js";

const MAX_VISIBLE_ROMS = 10;

class RomSelectorDialog extends Container implements Focusable {
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly items: SelectItem[];
	private readonly filterInput: Input;
	private listComponent: Component;
	private selectList: SelectList | null = null;
	private onSelect: (value: string) => void;
	private onCancel: () => void;
	private _focused = false;

	constructor(
		roms: RomEntry[],
		tui: TUI,
		theme: Theme,
		onSelect: (value: string) => void,
		onCancel: () => void,
	) {
		super();
		this.tui = tui;
		this.theme = theme;
		this.items = roms.map((rom) => ({ value: rom.path, label: rom.name }));
		this.onSelect = onSelect;
		this.onCancel = onCancel;
		this.filterInput = new Input();
		this.filterInput.setValue("");
		this.listComponent = new Text("", 0, 0);
		this.updateList();
		this.buildLayout();
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.filterInput.focused = value;
	}

	invalidate(): void {
		super.invalidate();
		this.buildLayout();
	}

	handleInput(data: string): void {
		const kb = getEditorKeybindings();
		if (
			kb.matches(data, "selectUp") ||
			kb.matches(data, "selectDown") ||
			kb.matches(data, "selectConfirm") ||
			kb.matches(data, "selectCancel") ||
			kb.matches(data, "pageUp") ||
			kb.matches(data, "pageDown")
		) {
			if (this.selectList) {
				this.selectList.handleInput(data);
			} else if (kb.matches(data, "selectCancel")) {
				this.onCancel();
			}
			this.tui.requestRender();
			return;
		}

		const before = this.filterInput.getValue();
		this.filterInput.handleInput(data);
		const after = this.filterInput.getValue();
		if (after !== before) {
			this.updateList();
			this.buildLayout();
		}
		this.tui.requestRender();
	}

	private updateList(): void {
		const filter = this.filterInput.getValue().trim().toLowerCase();
		const filteredItems = filter.length
			? this.items.filter((item) => (item.label ?? item.value).toLowerCase().includes(filter))
			: this.items;

		if (filteredItems.length === 0) {
			this.selectList = null;
			this.listComponent = new Text(this.theme.fg("warning", "  No matching ROMs"), 1, 0);
			return;
		}

		const list = new SelectList(filteredItems, Math.min(filteredItems.length, MAX_VISIBLE_ROMS), getSelectListTheme());
		list.onSelect = (item) => this.onSelect(item.value);
		list.onCancel = () => this.onCancel();
		this.selectList = list;
		this.listComponent = list;
	}

	private buildLayout(): void {
		this.clear();
		this.addChild(new DynamicBorder((line) => this.theme.fg("accent", line)));
		this.addChild(new Text(this.theme.fg("accent", this.theme.bold("Select a ROM")), 1, 0));
		this.addChild(new Text(this.theme.fg("dim", "Type to filter · ↑↓ navigate · Enter select · Esc cancel"), 1, 0));
		this.addChild(new Spacer(1));
		this.addChild(new Text(this.theme.fg("muted", "Filter:"), 1, 0));
		this.addChild(this.filterInput);
		this.addChild(new Spacer(1));
		this.addChild(this.listComponent);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder((line) => this.theme.fg("accent", line)));
	}
}

export async function selectRomWithFilter(
	ctx: ExtensionCommandContext,
	roms: RomEntry[],
): Promise<string | null> {
	const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const dialog = new RomSelectorDialog(
			roms,
			tui,
			theme,
			(value) => done(value),
			() => done(null),
		);
		return dialog;
	});
	return result ?? null;
}
