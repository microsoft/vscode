/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, ISettableObservable, derived, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { SessionLayoutMode, SessionTerminalPosition } from '../../../common/sessionGridLayout/sessionGridLayout.js';
import { IChatWindowKind, SessionSplitLayout } from '../../../services/chatWindow/browser/chatWindowService.js';

function isLayoutMode(value: unknown): value is SessionLayoutMode {
	return value === SessionLayoutMode.Stacked || value === SessionLayoutMode.SideBySide || value === SessionLayoutMode.EditorOnly || value === SessionLayoutMode.ChatOnly;
}

/**
 * The defaults of a kind of chat window, kept in the profile: what its chat windows were last left as, which a new one
 * of the kind opens with. The keys and values are those chat windows always stored, so profiles that stored them still load.
 */
export class ChatWindowDefaults {

	private readonly _prefix: string;

	constructor(
		kind: IChatWindowKind,
		private readonly _storageService: IStorageService,
	) {
		this._prefix = `sessions.chatWindow.${kind.id}`;
	}

	/** The layout of its chat windows with an editor area. */
	getLayout(): SessionLayoutMode | undefined {
		const value = this._storageService.get(`${this._prefix}.layout`, StorageScope.PROFILE);
		return isLayoutMode(value) ? value : undefined;
	}

	setLayout(layout: SessionLayoutMode): void {
		this._storageService.store(`${this._prefix}.layout`, layout, StorageScope.PROFILE, StorageTarget.USER);
	}

	/** Whether the chat below the editor area was left dragged down to its input. */
	getInputOnly(): boolean {
		return this._storageService.getBoolean(`${this._prefix}.inputOnly`, StorageScope.PROFILE, true);
	}

	setInputOnly(inputOnly: boolean): void {
		this._storageService.store(`${this._prefix}.inputOnly`, inputOnly, StorageScope.PROFILE, StorageTarget.USER);
	}

	/** Where the terminals of its chat windows show. */
	getTerminalPosition(): SessionTerminalPosition {
		const value = this._storageService.get(`${this._prefix}.terminalPosition`, StorageScope.PROFILE);
		return value === SessionTerminalPosition.UnderEditor || value === SessionTerminalPosition.UnderChat ? value : SessionTerminalPosition.FullWidth;
	}

	setTerminalPosition(position: SessionTerminalPosition): void {
		this._storageService.store(`${this._prefix}.terminalPosition`, position, StorageScope.PROFILE, StorageTarget.USER);
	}
}

/** How a chat is remembered to show in a chat window. */
export interface IRememberedChatLayout {
	readonly mode: SessionLayoutMode;
	readonly splitLayout: SessionSplitLayout;
	readonly inputOnly: boolean;
}

/** How the chat of a chat window is remembered to show with its editor area, per chat. */
export interface IChatWindowRememberedMode {
	/** How the chat last showed in a chat window, if it did. */
	readonly initial: IRememberedChatLayout | undefined;
	/** Remembers what the user chose for the chat. */
	set(layout: IRememberedChatLayout): void;
}

/** The most chats whose layout is remembered; the least recently changed are forgotten first. */
const MAX_REMEMBERED_CHAT_LAYOUTS = 200;

/** Remembers, per chat and in the workspace, how each chat last showed in a chat window. */
export class ChatWindowChatLayouts {

	static readonly STORAGE_KEY = 'sessions.chatWindow.chatLayouts';

	constructor(private readonly _storageService: IStorageService) { }

	private _read(): [string, IRememberedChatLayout][] {
		try {
			const stored: unknown = JSON.parse(this._storageService.get(ChatWindowChatLayouts.STORAGE_KEY, StorageScope.WORKSPACE, '[]'));
			return Array.isArray(stored) ? stored.filter((entry): entry is [string, IRememberedChatLayout] => Array.isArray(entry)
				&& typeof entry[0] === 'string'
				&& isLayoutMode(entry[1]?.mode)
				&& (entry[1].splitLayout === SessionLayoutMode.Stacked || entry[1].splitLayout === SessionLayoutMode.SideBySide)
				&& typeof entry[1].inputOnly === 'boolean') : [];
		} catch {
			return [];
		}
	}

	get(chat: URI): IRememberedChatLayout | undefined {
		const key = chat.toString();
		return this._read().find(([candidate]) => candidate === key)?.[1];
	}

	set(chat: URI, layout: IRememberedChatLayout): void {
		const key = chat.toString();
		const entries = this._read().filter(([candidate]) => candidate !== key);
		entries.push([key, { mode: layout.mode, splitLayout: layout.splitLayout, inputOnly: layout.inputOnly }]);
		this._storageService.store(ChatWindowChatLayouts.STORAGE_KEY, JSON.stringify(entries.slice(-MAX_REMEMBERED_CHAT_LAYOUTS)), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

/** The sizes the cells of a chat window showed with, per topology; see `ChatWindowGridHost.exportSizes`. */
export type ChatWindowCellSizes = Record<string, Record<string, { readonly width: number; readonly height: number }>>;

function isCellSizes(value: unknown): value is ChatWindowCellSizes {
	return !!value && typeof value === 'object' && Object.values(value).every(sizes => !!sizes && typeof sizes === 'object'
		&& Object.values(sizes as Record<string, Partial<{ width: unknown; height: unknown }> | undefined>).every(size => typeof size?.width === 'number' && typeof size.height === 'number'));
}

/** Remembers, per chat and in the workspace, the sizes the cells of its chat window last showed with, so that they come back after a reload. */
export class ChatWindowChatSizes {

	static readonly STORAGE_KEY = 'sessions.chatWindow.chatSizes';

	constructor(private readonly _storageService: IStorageService) { }

	private _read(): [string, ChatWindowCellSizes][] {
		try {
			const stored: unknown = JSON.parse(this._storageService.get(ChatWindowChatSizes.STORAGE_KEY, StorageScope.WORKSPACE, '[]'));
			return Array.isArray(stored) ? stored.filter((entry): entry is [string, ChatWindowCellSizes] => Array.isArray(entry) && typeof entry[0] === 'string' && isCellSizes(entry[1])) : [];
		} catch {
			return [];
		}
	}

	get(chat: URI): ChatWindowCellSizes | undefined {
		const key = chat.toString();
		return this._read().find(([candidate]) => candidate === key)?.[1];
	}

	set(chat: URI, sizes: ChatWindowCellSizes): void {
		const key = chat.toString();
		const entries = this._read().filter(([candidate]) => candidate !== key);
		entries.push([key, sizes]);
		this._storageService.store(ChatWindowChatSizes.STORAGE_KEY, JSON.stringify(entries.slice(-MAX_REMEMBERED_CHAT_LAYOUTS)), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

/**
 * The state of an open chat window: how it shows its chat and its editor area, and where its terminals show. Changes become
 * the defaults of its kind, and are remembered for its chat.
 *
 * It opens as its chat is remembered, or else with the defaults of its kind. What the window cannot show is shown as the
 * closest it can, without changing what is remembered: without an editor area, it shows only the chat. Only what the
 * user chooses in the window is remembered, and never a layout without an editor area.
 */
export class ChatWindowState {

	private readonly _layout: ISettableObservable<SessionLayoutMode>;
	readonly layout: IObservable<SessionLayoutMode>;

	private readonly _inputOnly: ISettableObservable<boolean>;
	/** In {@link SessionLayoutMode.Stacked}: whether the chat shows only its input. */
	readonly inputOnly: IObservable<boolean>;

	private readonly _lastSplitLayout: ISettableObservable<SessionSplitLayout>;
	/** How the editor area and the chat are arranged while both show, or last showed. */
	readonly splitLayout: IObservable<SessionSplitLayout>;

	private readonly _terminalPosition: ISettableObservable<SessionTerminalPosition>;
	readonly terminalPosition: IObservable<SessionTerminalPosition>;

	private readonly _terminalShown = observableValue<boolean>(this, false);
	/** Whether the terminals show. */
	readonly terminalShown: IObservable<boolean> = this._terminalShown;

	/** The layouts it can show. */
	readonly layouts: readonly SessionLayoutMode[];

	constructor(
		readonly kind: IChatWindowKind,
		readonly hasEditorArea: boolean,
		private readonly _defaults: ChatWindowDefaults,
		private readonly _rememberedMode?: IChatWindowRememberedMode,
	) {
		this.layouts = hasEditorArea
			? [SessionLayoutMode.Stacked, SessionLayoutMode.SideBySide, SessionLayoutMode.EditorOnly, SessionLayoutMode.ChatOnly]
			: [SessionLayoutMode.ChatOnly];
		const remembered = hasEditorArea ? _rememberedMode?.initial : undefined;
		const layout = [remembered?.mode, _defaults.getLayout(), kind.defaultLayout].find(candidate => candidate !== undefined && this.layouts.includes(candidate)) ?? this.layouts[0];
		this._layout = observableValue(this, layout);
		this.layout = this._layout;
		const splitLayout = remembered?.splitLayout ?? (layout === SessionLayoutMode.SideBySide ? SessionLayoutMode.SideBySide : kind.defaultLayout === SessionLayoutMode.SideBySide ? SessionLayoutMode.SideBySide : SessionLayoutMode.Stacked);
		this._lastSplitLayout = observableValue<SessionSplitLayout>(this, splitLayout);
		this.splitLayout = derived(this, reader => {
			const current = this._layout.read(reader);
			return current === SessionLayoutMode.Stacked || current === SessionLayoutMode.SideBySide ? current : this._lastSplitLayout.read(reader);
		});
		this._inputOnly = observableValue(this, remembered?.inputOnly ?? _defaults.getInputOnly());
		this.inputOnly = this._inputOnly;
		this._terminalPosition = observableValue(this, _defaults.getTerminalPosition());
		this.terminalPosition = this._terminalPosition;
	}

	setLayout(layout: SessionLayoutMode): void {
		if (!this.layouts.includes(layout) || this._layout.get() === layout) {
			return;
		}
		if (layout === SessionLayoutMode.Stacked || layout === SessionLayoutMode.SideBySide) {
			this._lastSplitLayout.set(layout, undefined);
		}
		this._layout.set(layout, undefined);
		if (this.hasEditorArea) {
			this._defaults.setLayout(layout);
		}
		this._remember();
	}

	/**
	 * Arranges the editor area and the chat as `splitLayout`: at once while both show, else the next time both show,
	 * without showing the one that is hidden. Either way it is remembered for the chat.
	 */
	setSplitLayout(splitLayout: SessionSplitLayout): void {
		if (!this.layouts.includes(splitLayout)) {
			return;
		}
		const layout = this._layout.get();
		if (layout === SessionLayoutMode.Stacked || layout === SessionLayoutMode.SideBySide) {
			this.setLayout(splitLayout);
			return;
		}
		if (this._lastSplitLayout.get() !== splitLayout) {
			this._lastSplitLayout.set(splitLayout, undefined);
			this._remember();
		}
	}

	/** Shows both the editor area and the chat again, as they were last arranged. */
	showBoth(): void {
		this.setLayout(this._lastSplitLayout.get());
	}

	setInputOnly(inputOnly: boolean): void {
		if (this._inputOnly.get() === inputOnly) {
			return;
		}
		this._inputOnly.set(inputOnly, undefined);
		this._defaults.setInputOnly(inputOnly);
		this._remember();
	}

	setTerminalPosition(position: SessionTerminalPosition): void {
		if (this._terminalPosition.get() === position) {
			return;
		}
		this._terminalPosition.set(position, undefined);
		this._defaults.setTerminalPosition(position);
	}

	setTerminalShown(shown: boolean): void {
		this._terminalShown.set(shown, undefined);
	}

	private _remember(): void {
		if (this._rememberedMode && this.hasEditorArea) {
			this._rememberedMode.set({ mode: this._layout.get(), splitLayout: this._lastSplitLayout.get(), inputOnly: this._inputOnly.get() });
		}
	}
}
