/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as arraysEqual } from '../../../../base/common/arrays.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';
import { IChatModelInputState } from './chatModel.js';
import { CHAT_PROVIDER_ID } from './chatParticipantContribTypes.js';
import { IChatRequestVariableEntry } from './chatVariableEntries.js';
import { ChatAgentLocation, ChatModeKind } from './constants.js';

interface IChatHistoryEntry {
	text: string;
	state?: IChatInputState;
}

/** The collected input state for chat history entries */
interface IChatInputState {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
	chatContextAttachments?: ReadonlyArray<IChatRequestVariableEntry>;

	/**
	 * This should be a mode id (ChatMode | string).
	 * { id: string } is the old IChatMode. This is deprecated but may still be in persisted data.
	 */
	chatMode?: ChatModeKind | string | { id: string };
}

export const IChatWidgetHistoryService = createDecorator<IChatWidgetHistoryService>('IChatWidgetHistoryService');
export interface IChatWidgetHistoryService {
	_serviceBrand: undefined;

	readonly onDidChangeHistory: Event<ChatHistoryChange>;

	clearHistory(): void;
	getHistory(location: ChatAgentLocation): readonly IChatModelInputState[];
	append(location: ChatAgentLocation, history: IChatModelInputState): void;
}

interface IChatHistory {
	history?: { [providerId: string]: IChatModelInputState[] };
}

export type ChatHistoryChange = { kind: 'append'; entry: IChatModelInputState } | { kind: 'clear' };

export const ChatInputHistoryMaxEntries = 40;

export class ChatWidgetHistoryService extends Disposable implements IChatWidgetHistoryService {
	_serviceBrand: undefined;

	private memento: Memento<IChatHistory>;
	private viewState: IChatHistory;

	private readonly _onDidChangeHistory = this._register(new Emitter<ChatHistoryChange>());
	private changed = false;
	readonly onDidChangeHistory = this._onDidChangeHistory.event;

	constructor(
		@IStorageService storageService: IStorageService
	) {
		super();

		this.memento = new Memento<IChatHistory>('interactive-session', storageService);
		const loadedState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this.viewState = loadedState;

		this._register(storageService.onWillSaveState(() => {
			if (this.changed) {
				this.memento.saveMemento();
				this.changed = false;
			}
		}));
	}

	getHistory(location: ChatAgentLocation): IChatModelInputState[] {
		const key = this.getKey(location);
		const history = this.viewState.history?.[key] ?? [];
		return history.map(entry => this.migrateHistoryEntry(entry));
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private migrateHistoryEntry(entry: any): IChatModelInputState {
		// If it's already in the new format (has 'inputText' property), return as-is
		if (entry.inputText !== undefined) {
			return entry as IChatModelInputState;
		}

		// Otherwise, it's an old IChatHistoryEntry with 'text' and 'state' properties
		const oldEntry = entry as IChatHistoryEntry;
		const oldState = oldEntry.state ?? {};

		// Migrate chatMode to the new mode structure
		let modeId: string;
		let modeKind: ChatModeKind | undefined;
		if (oldState.chatMode) {
			if (typeof oldState.chatMode === 'string') {
				modeId = oldState.chatMode;
				modeKind = Object.values(ChatModeKind).includes(oldState.chatMode as ChatModeKind)
					? oldState.chatMode as ChatModeKind
					: undefined;
			} else if (typeof oldState.chatMode === 'object' && oldState.chatMode !== null) {
				// Old format: { id: string }
				const oldMode = oldState.chatMode as { id?: string };
				modeId = oldMode.id ?? ChatModeKind.Ask;
				modeKind = oldMode.id && Object.values(ChatModeKind).includes(oldMode.id as ChatModeKind)
					? oldMode.id as ChatModeKind
					: undefined;
			} else {
				modeId = ChatModeKind.Ask;
				modeKind = ChatModeKind.Ask;
			}
		} else {
			modeId = ChatModeKind.Ask;
			modeKind = ChatModeKind.Ask;
		}

		return {
			inputText: oldEntry.text ?? '',
			attachments: oldState.chatContextAttachments ?? [],
			mode: {
				id: modeId,
				kind: modeKind
			},
			contrib: oldEntry.state || {},
			selectedModel: undefined,
			selections: []
		};
	}

	private getKey(location: ChatAgentLocation): string {
		// Preserve history for panel by continuing to use the same old provider id. Use the location as a key for other chat locations.
		return location === ChatAgentLocation.Chat ? CHAT_PROVIDER_ID : location;
	}

	append(location: ChatAgentLocation, history: IChatModelInputState): void {
		this.viewState.history ??= {};

		const key = this.getKey(location);
		this.viewState.history[key] = this.getHistory(location).concat(history).slice(-ChatInputHistoryMaxEntries);
		this.changed = true;
		this._onDidChangeHistory.fire({ kind: 'append', entry: history });
	}

	clearHistory(): void {
		this.viewState.history = {};
		this.changed = true;
		this._onDidChangeHistory.fire({ kind: 'clear' });
	}
}

export class ChatHistoryNavigator extends Disposable {
	/**
	 * Index of our point in history. Goes 1 past the length of `_history`
	 */
	private _currentIndex: number;
	private _history: readonly IChatModelInputState[];
	private _overlay: (IChatModelInputState | undefined)[] = [];

	public get values() {
		return this.chatWidgetHistoryService.getHistory(this.location);
	}

	constructor(
		private readonly location: ChatAgentLocation,
		@IChatWidgetHistoryService private readonly chatWidgetHistoryService: IChatWidgetHistoryService
	) {
		super();
		this._history = this.chatWidgetHistoryService.getHistory(this.location);
		this._currentIndex = this._history.length;

		this._register(this.chatWidgetHistoryService.onDidChangeHistory(e => {
			if (e.kind === 'append') {
				const prevLength = this._history.length;
				this._history = this.chatWidgetHistoryService.getHistory(this.location);
				const newLength = this._history.length;

				// If this append operation adjusted all history entries back, move our index back too
				// if we weren't pointing to the end of the history.
				if (prevLength === newLength) {
					this._overlay.shift();
					if (this._currentIndex < this._history.length) {
						this._currentIndex = Math.max(this._currentIndex - 1, 0);
					}
				} else if (this._currentIndex === prevLength) {
					this._currentIndex = newLength;
				}
			} else if (e.kind === 'clear') {
				this._history = [];
				this._currentIndex = 0;
				this._overlay = [];
			}
		}));
	}

	public isAtEnd() {
		return this._currentIndex === Math.max(this._history.length, this._overlay.length);
	}

	public isAtStart() {
		return this._currentIndex === 0;
	}

	/**
	 * Replaces a history entry at the current index in this view of the history.
	 * Allows editing of old history entries while preventing accidental navigation
	 * from losing the edits.
	 */
	public overlay(entry: IChatModelInputState) {
		this._overlay[this._currentIndex] = entry;
	}

	public resetCursor() {
		this._currentIndex = this._history.length;
	}

	public previous() {
		this._currentIndex = Math.max(this._currentIndex - 1, 0);
		return this.current();
	}

	public next() {
		this._currentIndex = Math.min(this._currentIndex + 1, this._history.length);
		return this.current();
	}

	public current() {
		return this._overlay[this._currentIndex] ?? this._history[this._currentIndex];
	}

	/**
	 * Appends a new entry to the navigator. Resets the state back to the end
	 * and clears any overlayed entries.
	 */
	public append(entry: IChatModelInputState) {
		this._overlay = [];
		this._currentIndex = this._history.length;

		if (!entriesEqual(this._history.at(-1), entry)) {
			this.chatWidgetHistoryService.append(this.location, entry);
		}
	}
}

function entriesEqual(a: IChatModelInputState | undefined, b: IChatModelInputState | undefined): boolean {
	if (!a || !b) {
		return false;
	}

	if (a.inputText !== b.inputText) {
		return false;
	}

	if (!arraysEqual(a.attachments, b.attachments, (x, y) => x.id === y.id)) {
		return false;
	}

	return true;
}
