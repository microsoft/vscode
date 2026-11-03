/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as arraysEqual } from '../../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IReference, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
import { IChatModelInputState } from '../model/chatModel.js';
import { CHAT_PROVIDER_ID } from '../participants/chatParticipantContribTypes.js';
import { IChatRequestVariableEntry } from '../attachments/chatVariableEntries.js';
import { ChatAgentLocation, ChatModeKind } from '../constants.js';
import { ChatBinaryReferenceCollection, ChatStorageCorruptionError } from '../model/chatSessionResources.js';
import { ChatStorageOwner, IChatSessionStore } from '../model/chatSessionStore.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { localize } from '../../../../../nls.js';

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
	readonly whenReady: Promise<void>;

	clearHistory(): void;
	getHistory(location: ChatAgentLocation, historyKey?: string): readonly IChatModelInputState[];
	append(location: ChatAgentLocation, history: IChatModelInputState, historyKey?: string): void;
	moveHistory(location: ChatAgentLocation, fromHistoryKey: string, toHistoryKey: string): void;
}

interface IChatHistory {
	history?: { [providerId: string]: IChatModelInputState[] };
}

export type ChatHistoryChange = { kind: 'append'; location: ChatAgentLocation; historyKey: string | undefined; entry: IChatModelInputState } | { kind: 'move'; location: ChatAgentLocation; fromHistoryKey: string; toHistoryKey: string } | { kind: 'clear' | 'load' | 'replace' };

export const ChatInputHistoryMaxEntries = 40;

export class ChatWidgetHistoryService extends Disposable implements IChatWidgetHistoryService {
	_serviceBrand: undefined;

	private memento: Memento<IChatHistory>;
	private viewState: IChatHistory;
	private readonly storedState = this._register(new MutableDisposable<IReference<IChatHistory>>());
	private readonly liveReferences = this._register(new ChatBinaryReferenceCollection());
	private readonly pendingMutations: ((state: IChatHistory) => void)[] = [];
	private initialized = false;
	private loadFailure: { readonly error: unknown } | undefined;
	private resetPending = false;
	private loadRetryDelay = 200;
	private generation = 0;
	private saveTask: Promise<void> | undefined;
	private readonly saveScheduler = this._register(new RunOnceScheduler(() => {
		void this.save().catch(error => this.logService.error('Unable to save chat input history', error));
	}, 200));
	readonly whenReady: Promise<void>;

	private readonly _onDidChangeHistory = this._register(new Emitter<ChatHistoryChange>());
	private changed = false;
	readonly onDidChangeHistory = this._onDidChangeHistory.event;

	constructor(
		@IStorageService storageService: IStorageService,
		@IChatSessionStore private readonly sessionStore: IChatSessionStore,
		@ILogService private readonly logService: ILogService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		super();

		this.memento = new Memento<IChatHistory>('interactive-session', storageService);
		const loadedState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this.viewState = { ...loadedState };
		this.whenReady = this.load();
		this._register(sessionStore.onDidInvalidateOwnedData(owner => {
			if (owner === ChatStorageOwner.InputHistory && this.initialized && !this.loadFailure) {
				this.changed = true;
				this.generation++;
				this.saveScheduler.schedule();
			}
		}));

		this._register(storageService.onWillSaveState(() => {
			void this.save().catch(error => this.logService.error('Unable to save chat input history', error));
		}));
		this._register(lifecycleService.onWillShutdown(event => {
			this.saveScheduler.cancel();
			event.join(this.save().finally(() => this.saveScheduler.cancel()).catch(error => this.logService.error('Unable to save chat input history', error)), {
				id: 'chatInputHistory',
				label: localize('chatInputHistory.saving', "Saving chat input history"),
			});
		}));
	}

	private async load(): Promise<void> {
		let stored: IReference<IChatHistory> | undefined;
		try {
			stored = await this.sessionStore.readOwnedData(ChatStorageOwner.InputHistory);
			this.loadFailure = undefined;
			this.loadRetryDelay = 200;
		} catch (error) {
			this.loadFailure = { error };
			this.logService.error('Unable to load chat input history', error);
			if (!this._store.isDisposed) {
				this.saveScheduler.schedule(this.loadRetryDelay);
				this.loadRetryDelay = Math.min(this.loadRetryDelay * 2, 30000);
			}
		}
		if (this._store.isDisposed) {
			stored?.dispose();
			return;
		}
		if (stored) {
			this.viewState = stored.object;
			this.storedState.value = stored;
			for (const mutation of this.pendingMutations) {
				mutation(this.viewState);
			}
			this.clearLegacyState();
		} else if (!this.loadFailure && Object.keys(this.viewState.history ?? {}).length) {
			this.changed = true;
		}
		if (!this.loadFailure) {
			this.pendingMutations.length = 0;
		}
		this.initialized = true;
		this.liveReferences.set(this.viewState);
		if (!this.loadFailure) {
			this._onDidChangeHistory.fire({ kind: 'load' });
		}
		if (this.changed && !this.loadFailure) {
			this.saveScheduler.schedule();
		}
	}

	private clearLegacyState(): void {
		delete this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE).history;
		this.memento.saveMemento();
	}

	private mutate(mutation: (state: IChatHistory) => void): void {
		if (!this.initialized || this.loadFailure) {
			this.pendingMutations.push(mutation);
		}
		mutation(this.viewState);
		this.liveReferences.set(this.viewState);
		this.generation++;
		this.changed = true;
		if (!this.loadFailure || this.resetPending || this.loadFailure.error instanceof ChatStorageCorruptionError) {
			this.saveScheduler.schedule();
		}
	}

	async save(): Promise<void> {
		await this.whenReady;
		if (this.saveTask) {
			await this.saveTask;
			if (this.changed && !this._store.isDisposed) {
				return this.save();
			}
			return;
		}
		this.saveTask = this.flush();
		try {
			await this.saveTask;
		} finally {
			this.saveTask = undefined;
		}
	}

	private async flush(): Promise<void> {
		if (this.loadFailure && !this.resetPending) {
			await this.load();
		}
		if (this.loadFailure && !this.resetPending && !(this.loadFailure.error instanceof ChatStorageCorruptionError)) {
			throw this.loadFailure.error;
		}
		while (this.changed && !this._store.isDisposed) {
			const generation = this.generation;
			const stored = await this.sessionStore.writeOwnedData(ChatStorageOwner.InputHistory, this.viewState);
			if (this._store.isDisposed || generation !== this.generation) {
				stored.dispose();
				continue;
			}
			this.viewState = stored.object;
			this.storedState.value = stored;
			this.liveReferences.set(this.viewState);
			this.changed = false;
			this.resetPending = false;
			this.loadFailure = undefined;
			this.loadRetryDelay = 200;
			this.pendingMutations.length = 0;
			this.clearLegacyState();
			this._onDidChangeHistory.fire({ kind: 'replace' });
		}
	}

	getHistory(location: ChatAgentLocation, historyKey?: string): IChatModelInputState[] {
		const key = this.getKey(location, historyKey);
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

	private getKey(location: ChatAgentLocation, historyKey?: string): string {
		// Preserve history for panel by continuing to use the same old provider id. Use the location as a key for other chat locations.
		const locationKey = location === ChatAgentLocation.Chat ? CHAT_PROVIDER_ID : location;
		return historyKey === undefined ? locationKey : `${locationKey}:${historyKey}`;
	}

	append(location: ChatAgentLocation, history: IChatModelInputState, historyKey?: string): void {
		const key = this.getKey(location, historyKey);
		const snapshot = { ...history, attachments: history.attachments.map(attachment => ({ ...attachment })) };
		this.mutate(state => {
			state.history ??= {};
			state.history[key] = (state.history[key] ?? []).map(entry => this.migrateHistoryEntry(entry)).concat(snapshot).slice(-ChatInputHistoryMaxEntries);
		});
		this._onDidChangeHistory.fire({ kind: 'append', location, historyKey, entry: history });
	}

	moveHistory(location: ChatAgentLocation, fromHistoryKey: string, toHistoryKey: string): void {
		if (fromHistoryKey === toHistoryKey) {
			return;
		}

		const fromHistory = this.getHistory(location, fromHistoryKey);
		if (fromHistory.length === 0 && this.initialized && !this.loadFailure) {
			return;
		}

		const fromKey = this.getKey(location, fromHistoryKey);
		const toKey = this.getKey(location, toHistoryKey);
		this.mutate(state => {
			state.history ??= {};
			state.history[toKey] = [...state.history[toKey] ?? [], ...state.history[fromKey] ?? []].map(entry => this.migrateHistoryEntry(entry)).slice(-ChatInputHistoryMaxEntries);
			delete state.history[fromKey];
		});
		this._onDidChangeHistory.fire({ kind: 'move', location, fromHistoryKey, toHistoryKey });
	}

	clearHistory(): void {
		this.pendingMutations.length = 0;
		this.resetPending = true;
		this.mutate(state => { state.history = {}; });
		this._onDidChangeHistory.fire({ kind: 'clear' });
	}

	override dispose(): void {
		super.dispose();
		this.pendingMutations.length = 0;
		this.viewState = {};
	}
}

export class ChatHistoryNavigator extends Disposable {
	/**
	 * Index of our point in history. Goes 1 past the length of `_history`
	 */
	private _currentIndex: number;
	private _history: readonly IChatModelInputState[];
	private _overlay: (IChatModelInputState | undefined)[] = [];
	private readonly overlayReferences = this._register(new ChatBinaryReferenceCollection());
	private _historyKey: string | undefined;

	public get values() {
		return this.chatWidgetHistoryService.getHistory(this.location, this._historyKey);
	}

	public get whenReady(): Promise<void> {
		return this.chatWidgetHistoryService.whenReady;
	}

	constructor(
		private readonly location: ChatAgentLocation,
		@IChatWidgetHistoryService private readonly chatWidgetHistoryService: IChatWidgetHistoryService
	) {
		super();
		this._history = this.chatWidgetHistoryService.getHistory(this.location, this._historyKey);
		this._currentIndex = this._history.length;

		this._register(this.chatWidgetHistoryService.onDidChangeHistory(e => {
			if (e.kind === 'append') {
				if (e.location !== this.location || e.historyKey !== this._historyKey) {
					return;
				}
				const prevLength = this._history.length;
				this._history = this.chatWidgetHistoryService.getHistory(this.location, this._historyKey);
				const newLength = this._history.length;

				// If this append operation adjusted all history entries back, move our index back too
				// if we weren't pointing to the end of the history.
				if (prevLength === newLength) {
					this._overlay.shift();
					this.overlayReferences.set(this._overlay);
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
				this.overlayReferences.clear();
			} else if (e.kind === 'move') {
				if (e.location !== this.location || (e.fromHistoryKey !== this._historyKey && e.toHistoryKey !== this._historyKey)) {
					return;
				}
				this._history = this.chatWidgetHistoryService.getHistory(this.location, this._historyKey);
				this._currentIndex = this._history.length;
				this._overlay = [];
				this.overlayReferences.clear();
			} else if (e.kind === 'load' || e.kind === 'replace') {
				this._history = this.chatWidgetHistoryService.getHistory(this.location, this._historyKey);
				if (e.kind === 'load') {
					this._currentIndex = this._history.length;
				}
			}
		}));
	}

	public setHistoryKey(historyKey: string | undefined) {
		if (this._historyKey === historyKey) {
			return;
		}

		this._historyKey = historyKey;
		this._history = this.chatWidgetHistoryService.getHistory(this.location, this._historyKey);
		this._currentIndex = this._history.length;
		this._overlay = [];
		this.overlayReferences.clear();
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
		this.overlayReferences.set(this._overlay);
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
		this.overlayReferences.clear();
		this._currentIndex = this._history.length;

		if (!entriesEqual(this._history.at(-1), entry)) {
			this.chatWidgetHistoryService.append(this.location, entry, this._historyKey);
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
