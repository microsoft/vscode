/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, ISettableObservable, derived, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatWindowLayoutMode, ChatWindowSplitLayout, ChatWindowTerminalPosition, isChatWindowLayoutMode, isChatWindowSplitLayout } from './chatWindowLayout.js';

/** The layout mode of a chat window until the user chooses one. */
const DEFAULT_LAYOUT_MODE = ChatWindowLayoutMode.SideBySide;

/**
 * The prefix of the keys of {@link ChatWindowDefaults}. The keys and values are those chat windows of the Agents window
 * stored before they were built on parts, so profiles that stored them still load.
 */
const DEFAULTS_KEY_PREFIX = 'sessions.chatWindow.chatWithEditors';

/** What chat windows were last left as, kept in the profile: a new chat window opens with it. */
export class ChatWindowDefaults {

	constructor(private readonly _storageService: IStorageService) { }

	getLayoutMode(): ChatWindowLayoutMode | undefined {
		const value = this._storageService.get(`${DEFAULTS_KEY_PREFIX}.layout`, StorageScope.PROFILE);
		return isChatWindowLayoutMode(value) ? value : undefined;
	}

	setLayoutMode(mode: ChatWindowLayoutMode): void {
		this._storageService.store(`${DEFAULTS_KEY_PREFIX}.layout`, mode, StorageScope.PROFILE, StorageTarget.USER);
	}

	/** Whether the chat below the main part was left dragged down to its input. */
	getInputOnly(): boolean {
		return this._storageService.getBoolean(`${DEFAULTS_KEY_PREFIX}.inputOnly`, StorageScope.PROFILE, true);
	}

	setInputOnly(inputOnly: boolean): void {
		this._storageService.store(`${DEFAULTS_KEY_PREFIX}.inputOnly`, inputOnly, StorageScope.PROFILE, StorageTarget.USER);
	}

	getTerminalPosition(): ChatWindowTerminalPosition {
		const value = this._storageService.get(`${DEFAULTS_KEY_PREFIX}.terminalPosition`, StorageScope.PROFILE);
		return value === ChatWindowTerminalPosition.UnderEditor || value === ChatWindowTerminalPosition.UnderChat ? value : ChatWindowTerminalPosition.FullWidth;
	}

	setTerminalPosition(position: ChatWindowTerminalPosition): void {
		this._storageService.store(`${DEFAULTS_KEY_PREFIX}.terminalPosition`, position, StorageScope.PROFILE, StorageTarget.USER);
	}
}

/** How a chat is remembered to show in a chat window. */
export interface IRememberedChatLayout {
	readonly mode: ChatWindowLayoutMode;
	readonly splitLayout: ChatWindowSplitLayout;
	readonly inputOnly: boolean;
}

/** The most chats whose layout or sizes are remembered; the least recently changed are forgotten first. */
const MAX_REMEMBERED_CHATS = 200;

/** Remembers values per chat in the workspace, under `key`, keeping those of the chats changed last. */
class PerChatMemory<T> {

	constructor(
		private readonly _storageService: IStorageService,
		private readonly _key: string,
		private readonly _isValue: (value: unknown) => value is T,
	) { }

	private _read(): [string, T][] {
		try {
			const stored: unknown = JSON.parse(this._storageService.get(this._key, StorageScope.WORKSPACE, '[]'));
			return Array.isArray(stored) ? stored.filter((entry): entry is [string, T] => Array.isArray(entry) && typeof entry[0] === 'string' && this._isValue(entry[1])) : [];
		} catch {
			return [];
		}
	}

	get(chat: URI): T | undefined {
		const key = chat.toString();
		return this._read().find(([candidate]) => candidate === key)?.[1];
	}

	set(chat: URI, value: T): void {
		const key = chat.toString();
		const entries = this._read().filter(([candidate]) => candidate !== key);
		entries.push([key, value]);
		this._storageService.store(this._key, JSON.stringify(entries.slice(-MAX_REMEMBERED_CHATS)), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

function isRememberedChatLayout(value: unknown): value is IRememberedChatLayout {
	const candidate = value as Partial<IRememberedChatLayout> | undefined;
	return isChatWindowLayoutMode(candidate?.mode) && isChatWindowSplitLayout(candidate.splitLayout) && typeof candidate.inputOnly === 'boolean';
}

/** Remembers, per chat and in the workspace, how each chat last showed in a chat window. */
export class ChatWindowChatLayouts {

	/** The key chat windows of the Agents window stored them under before they were built on parts. */
	static readonly STORAGE_KEY = 'sessions.chatWindow.chatLayouts';

	private readonly _memory: PerChatMemory<IRememberedChatLayout>;

	constructor(storageService: IStorageService) {
		this._memory = new PerChatMemory(storageService, ChatWindowChatLayouts.STORAGE_KEY, isRememberedChatLayout);
	}

	get(chat: URI): IRememberedChatLayout | undefined {
		return this._memory.get(chat);
	}

	set(chat: URI, layout: IRememberedChatLayout): void {
		this._memory.set(chat, { mode: layout.mode, splitLayout: layout.splitLayout, inputOnly: layout.inputOnly });
	}
}

/** The sizes the parts of a chat window showed with, per topology; see the window's part grid. */
export type ChatWindowPartSizes = Record<string, Record<string, { readonly width: number; readonly height: number }>>;

function isPartSizes(value: unknown): value is ChatWindowPartSizes {
	return !!value && typeof value === 'object' && Object.values(value).every(sizes => !!sizes && typeof sizes === 'object'
		&& Object.values(sizes as Record<string, Partial<{ width: unknown; height: unknown }> | undefined>).every(size => typeof size?.width === 'number' && typeof size.height === 'number'));
}

/** Remembers, per chat and in the workspace, the sizes the parts of its chat window last showed with, so that they come back after a reload. */
export class ChatWindowChatSizes {

	/** The key chat windows of the Agents window stored them under before they were built on parts. */
	static readonly STORAGE_KEY = 'sessions.chatWindow.chatSizes';

	private readonly _memory: PerChatMemory<ChatWindowPartSizes>;

	constructor(storageService: IStorageService) {
		this._memory = new PerChatMemory(storageService, ChatWindowChatSizes.STORAGE_KEY, isPartSizes);
	}

	get(chat: URI): ChatWindowPartSizes | undefined {
		return this._memory.get(chat);
	}

	set(chat: URI, sizes: ChatWindowPartSizes): void {
		this._memory.set(chat, sizes);
	}
}

/** How the chat of a chat window is remembered to show, per chat. */
export interface IChatWindowRememberedLayout {
	/** How the chat last showed in a chat window, if it did. */
	readonly initial: IRememberedChatLayout | undefined;
	/** Remembers what the user chose for the chat. */
	set(layout: IRememberedChatLayout): void;
}

/**
 * The state of an open chat window: how it shows its chat part and its main part, and where its terminals show.
 *
 * It opens as its chat is remembered, or else as chat windows were last left. What the user chooses becomes the defaults
 * of chat windows and is remembered for the chat. Showing only the chat because the main part has nothing to show
 * ({@link showChatOnly}) changes neither.
 */
export class ChatWindowState {

	/** The layout modes a chat window offers. */
	static readonly LAYOUT_MODES: readonly ChatWindowLayoutMode[] = [ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.EditorOnly, ChatWindowLayoutMode.ChatOnly];

	private readonly _layoutMode: ISettableObservable<ChatWindowLayoutMode>;
	readonly layoutMode: IObservable<ChatWindowLayoutMode>;

	private readonly _inputOnly: ISettableObservable<boolean>;
	/** In {@link ChatWindowLayoutMode.Stacked}: whether the chat shows only its input. */
	readonly inputOnly: IObservable<boolean>;

	private readonly _lastSplitLayout: ISettableObservable<ChatWindowSplitLayout>;
	/** How the main part and the chat part are arranged while both show, or will next show. */
	readonly splitLayout: IObservable<ChatWindowSplitLayout>;

	private readonly _terminalPosition: ISettableObservable<ChatWindowTerminalPosition>;
	readonly terminalPosition: IObservable<ChatWindowTerminalPosition>;

	constructor(
		private readonly _defaults: ChatWindowDefaults,
		private readonly _remembered?: IChatWindowRememberedLayout,
	) {
		const remembered = _remembered?.initial;
		const mode = remembered?.mode ?? _defaults.getLayoutMode() ?? DEFAULT_LAYOUT_MODE;
		this._layoutMode = observableValue(this, mode);
		this.layoutMode = this._layoutMode;
		this._lastSplitLayout = observableValue<ChatWindowSplitLayout>(this, remembered?.splitLayout ?? (isChatWindowSplitLayout(mode) ? mode : DEFAULT_LAYOUT_MODE));
		this.splitLayout = derived(this, reader => {
			const current = this._layoutMode.read(reader);
			return isChatWindowSplitLayout(current) ? current : this._lastSplitLayout.read(reader);
		});
		this._inputOnly = observableValue(this, remembered?.inputOnly ?? _defaults.getInputOnly());
		this.inputOnly = this._inputOnly;
		this._terminalPosition = observableValue(this, _defaults.getTerminalPosition());
		this.terminalPosition = this._terminalPosition;
	}

	setLayoutMode(mode: ChatWindowLayoutMode): void {
		if (this._layoutMode.get() === mode) {
			return;
		}
		if (isChatWindowSplitLayout(mode)) {
			this._lastSplitLayout.set(mode, undefined);
		}
		this._layoutMode.set(mode, undefined);
		this._defaults.setLayoutMode(mode);
		this._remember();
	}

	/**
	 * Arranges the main part and the chat part as `splitLayout`: at once while both show, else the next time both show,
	 * without showing the one that is hidden. Either way it is remembered for the chat.
	 */
	setSplitLayout(splitLayout: ChatWindowSplitLayout): void {
		if (isChatWindowSplitLayout(this._layoutMode.get())) {
			this.setLayoutMode(splitLayout);
			return;
		}
		if (this._lastSplitLayout.get() !== splitLayout) {
			this._lastSplitLayout.set(splitLayout, undefined);
			this._remember();
		}
	}

	/** Shows both the main part and the chat part again, as they were last arranged. */
	showBoth(): void {
		this.setLayoutMode(this._lastSplitLayout.get());
	}

	/** Shows only the chat, such as while the main part has nothing to show, without changing what is remembered. */
	showChatOnly(): void {
		this._layoutMode.set(ChatWindowLayoutMode.ChatOnly, undefined);
	}

	setInputOnly(inputOnly: boolean): void {
		if (this._inputOnly.get() === inputOnly) {
			return;
		}
		this._inputOnly.set(inputOnly, undefined);
		this._defaults.setInputOnly(inputOnly);
		this._remember();
	}

	setTerminalPosition(position: ChatWindowTerminalPosition): void {
		if (this._terminalPosition.get() === position) {
			return;
		}
		this._terminalPosition.set(position, undefined);
		this._defaults.setTerminalPosition(position);
	}

	private _remember(): void {
		this._remembered?.set({ mode: this._layoutMode.get(), splitLayout: this._lastSplitLayout.get(), inputOnly: this._inputOnly.get() });
	}
}
