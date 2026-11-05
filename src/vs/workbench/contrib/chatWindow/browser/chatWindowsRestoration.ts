/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IContentPart } from '../../../services/editor/common/editorGroupsService.js';
import { IChatWindow, IChatWindowChatPart, IChatWindowOpenOptions, IChatWindowProvider } from './chatWindow.js';
import { deserializeChatWindowEditors, isChatWindowChatPart, ISerializedChatWindowEditor, isSerializedChatWindowEditor, serializeChatWindowEditors } from './chatWindowEditors.js';

/**
 * The chat windows open when the window last closed. The key and the format are those chat windows of the Agents window
 * always used, so the windows open before they were built on parts open again. Those stored the session of a chat
 * window, and its chat only when it was not the session's main chat: a provider resolves the session to its main chat.
 */
export const OPEN_CHAT_WINDOWS_STORAGE_KEY = 'sessions.chatWindow.openChats';

interface IStoredChatWindow {
	/** The chat it opened for, the first of its chats; see {@link OPEN_CHAT_WINDOWS_STORAGE_KEY}. */
	readonly chat?: string;
	/** Its other chats, in their order, when it showed several. */
	readonly chats?: readonly string[];
	/** Its active chat, when it showed several. */
	readonly activeChat?: string;
	/** The session, as stored before chat windows were built on parts. */
	readonly session?: string;
	readonly editors?: readonly ISerializedChatWindowEditor[];
	/** Whether it showed its terminals. */
	readonly terminal?: boolean;
	/** The groups of its chat part besides the chat's own, such as an editor split beside the chat; checked as it restores. */
	readonly chatPart?: unknown;
	/** The editors of the parts it created, such as for editors dropped on its edges, one list per part. */
	readonly created?: readonly (readonly ISerializedChatWindowEditor[])[];
}

function isStoredChatWindow(entry: Partial<IStoredChatWindow> | undefined): entry is IStoredChatWindow {
	return (typeof entry?.chat === 'string' || typeof entry?.session === 'string')
		&& (entry.chat === undefined || typeof entry.chat === 'string')
		&& (entry.session === undefined || typeof entry.session === 'string')
		&& (entry.chats === undefined || (Array.isArray(entry.chats) && entry.chats.every(chat => typeof chat === 'string')))
		&& (entry.activeChat === undefined || typeof entry.activeChat === 'string')
		&& (entry.editors === undefined || (Array.isArray(entry.editors) && entry.editors.every(isSerializedChatWindowEditor)))
		&& (entry.terminal === undefined || typeof entry.terminal === 'boolean')
		&& (entry.created === undefined || (Array.isArray(entry.created) && entry.created.every(editors => Array.isArray(editors) && editors.every(isSerializedChatWindowEditor))));
}

function storedChat(entry: IStoredChatWindow): string {
	return (entry.chat ?? entry.session)!;
}

/** What {@link ChatWindowsRestoration} needs of the chat window service. */
export interface IChatWindowsRestorationHost {
	readonly provider: IObservable<IChatWindowProvider | undefined>;
	readonly windows: IObservable<readonly IChatWindow[]>;
	open(chat: URI, options: IChatWindowOpenOptions): Promise<IChatWindow | undefined>;
	/** Whether `window` shows its terminals, so that it shows them again. */
	terminalsShown(window: IChatWindow): boolean;
	/** The groups of `window`'s chat part besides the chat's own, so that it shows them again. */
	chatPart(window: IChatWindow): IChatWindowChatPart | undefined;
	/** The parts `window` created, such as for editors dropped on its edges, so that it shows them again. */
	createdParts(window: IChatWindow): readonly IContentPart[];
	/** Makes `chat`, one of `window`'s chats, its active chat without focusing it, as it was when it last closed. */
	activateChat?(window: IChatWindow, chat: URI): void;
}

/**
 * Opens the chat windows that were open when the window last closed, once the provider registers. They stay stored while
 * restoring is pending and while the provider does not restore, such as while chat windows are disabled or AI features
 * are hidden, so that they open again once they can. A chat that is gone is not restored, and is forgotten.
 */
export class ChatWindowsRestoration extends Disposable {

	/** Restoring replaces the stored chat windows one by one: saving before it ends would store only the ones it opened so far. */
	private _restoring = false;
	private _keepStored = false;
	private _restored = false;
	private readonly _providerListener = this._register(new MutableDisposable());

	constructor(
		private readonly _host: IChatWindowsRestorationHost,
		@IStorageService private readonly _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._storageService.onWillSaveState(() => this._save()));
		this._keepStored = this._read().length > 0;
		this._register(autorun(reader => {
			const provider = this._host.provider.read(reader);
			this._providerListener.value = provider?.onDidRemoveChats(chats => this._forget(chats));
			if (!provider || this._restored) {
				return;
			}
			if (!provider.restoreEnabled.read(reader)) {
				return;
			}
			this._restored = true;
			const stored = this._read();
			if (!stored.length) {
				this._keepStored = false;
				return;
			}
			this._restoring = true;
			this._restore(provider, stored)
				.catch(error => this._logService.error('[ChatWindow] Failed to restore chat windows', error))
				.finally(() => {
					this._restoring = false;
					this._keepStored = false;
				});
		}));
	}

	private _read(): IStoredChatWindow[] {
		try {
			const stored: unknown = JSON.parse(this._storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE, '[]'));
			return Array.isArray(stored) ? stored.filter(isStoredChatWindow) : [];
		} catch {
			return [];
		}
	}

	private _write(stored: readonly IStoredChatWindow[]): void {
		if (stored.length) {
			this._storageService.store(OPEN_CHAT_WINDOWS_STORAGE_KEY, JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}

	/** Storing waits for the next save of the state, which can be far off: a removed chat must not be restored by a restart before it. */
	private _forget(chats: readonly URI[]): void {
		if (!chats.length) {
			return;
		}
		const removed = new Set(chats.map(chat => chat.toString()));
		const stored = this._read();
		// The chats that remain of each window, the first of which it opens for; a window with none left goes
		let changed = false;
		const remaining = stored.flatMap(entry => {
			const all = [storedChat(entry), ...(entry.chats ?? [])];
			const kept = all.filter(chat => !removed.has(chat));
			if (kept.length === all.length) {
				return [entry];
			}
			changed = true;
			if (!kept.length) {
				return [];
			}
			const [chat, ...others] = kept;
			return [{ ...entry, chat, session: undefined, chats: others.length ? others : undefined, activeChat: entry.activeChat && kept.includes(entry.activeChat) ? entry.activeChat : undefined }];
		});
		if (changed) {
			this._write(remaining);
		}
	}

	private _save(): void {
		if (this._restoring) {
			return;
		}
		const windows = this._host.windows.get();
		if (this._keepStored && !windows.length) {
			return;
		}
		this._keepStored = false;
		this._write(windows.map(window => {
			const [chat, ...chats] = window.chats.get().map(candidate => candidate.toString());
			return {
				chat,
				chats: chats.length ? chats : undefined,
				activeChat: chats.length ? window.chat.get().toString() : undefined,
				editors: window.mainPart.groups.flatMap(group => serializeChatWindowEditors(group)),
				terminal: this._host.terminalsShown(window) || undefined,
				chatPart: this._host.chatPart(window),
				created: this._createdParts(window),
			};
		}));
	}

	private _createdParts(window: IChatWindow): ISerializedChatWindowEditor[][] | undefined {
		const created = this._host.createdParts(window)
			.map(part => part.groups.flatMap(group => serializeChatWindowEditors(group)))
			.filter(editors => editors.length > 0);
		return created.length ? created : undefined;
	}

	private async _restore(provider: IChatWindowProvider, stored: readonly IStoredChatWindow[]): Promise<void> {
		for (const entry of stored) {
			// The chats that can open again: a window opens for the first of them, and with none it does not open
			const restorable: URI[] = [];
			for (const stored of [storedChat(entry), ...(entry.chats ?? [])]) {
				const candidate = URI.parse(stored);
				if (await provider.canRestore(candidate)) {
					restorable.push(candidate);
				} else {
					this._logService.info(`[ChatWindow] Not restoring ${candidate.toString()} in its chat window: the chat is gone`);
				}
			}
			const [chat, ...chats] = restorable;
			if (!chat) {
				continue;
			}
			try {
				const onError = (error: unknown) => this._logService.error('[ChatWindow] Failed to restore an editor of a chat window', error);
				const editors = deserializeChatWindowEditors(this._instantiationService, entry.editors ?? [], onError);
				const createdParts = (entry.created ?? []).map(created => deserializeChatWindowEditors(this._instantiationService, created, onError)).filter(created => created.editors.length > 0);
				// The groups of its chat part only while all its chats restore, which they place
				const chatPart = isChatWindowChatPart(entry.chatPart) && chats.length === (entry.chats?.length ?? 0) && chat.toString() === storedChat(entry) ? entry.chatPart : undefined;
				const window = await this._host.open(chat, { preserveFocus: true, chats: chats.length ? chats : undefined, showTerminals: entry.terminal, editors, chatPart, createdParts: createdParts.length ? createdParts : undefined });
				// Its active chat, any of those it restored, the first too
				if (window && entry.activeChat && restorable.some(candidate => candidate.toString() === entry.activeChat)) {
					this._host.activateChat?.(window, URI.parse(entry.activeChat));
				}
			} catch (error) {
				this._logService.error(`[ChatWindow] Failed to restore the chat window of ${chat.toString()}`, error);
			}
		}
	}
}
