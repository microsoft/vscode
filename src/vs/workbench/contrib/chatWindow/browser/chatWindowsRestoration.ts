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
import { IChatWindow, IChatWindowOpenOptions, IChatWindowProvider } from './chatWindow.js';
import { deserializeChatWindowEditors, ISerializedChatWindowEditor, isSerializedChatWindowEditor, serializeChatWindowEditors } from './chatWindowEditors.js';

/**
 * The chat windows open when the window last closed. The key and the format are those chat windows of the Agents window
 * always used, so the windows open before they were built on parts open again. Those stored the session of a chat
 * window, and its chat only when it was not the session's main chat: a provider resolves the session to its main chat.
 */
export const OPEN_CHAT_WINDOWS_STORAGE_KEY = 'sessions.chatWindow.openChats';

interface IStoredChatWindow {
	/** The chat; see {@link OPEN_CHAT_WINDOWS_STORAGE_KEY}. */
	readonly chat?: string;
	/** The session, as stored before chat windows were built on parts. */
	readonly session?: string;
	readonly editors?: readonly ISerializedChatWindowEditor[];
	/** Whether it showed its terminals. */
	readonly terminal?: boolean;
}

function isStoredChatWindow(entry: Partial<IStoredChatWindow> | undefined): entry is IStoredChatWindow {
	return (typeof entry?.chat === 'string' || typeof entry?.session === 'string')
		&& (entry.chat === undefined || typeof entry.chat === 'string')
		&& (entry.session === undefined || typeof entry.session === 'string')
		&& (entry.editors === undefined || (Array.isArray(entry.editors) && entry.editors.every(isSerializedChatWindowEditor)))
		&& (entry.terminal === undefined || typeof entry.terminal === 'boolean');
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
		const remaining = stored.filter(entry => !removed.has(storedChat(entry)));
		if (remaining.length !== stored.length) {
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
		this._write(windows.map(window => ({
			chat: window.chat.get().toString(),
			editors: window.mainPart.groups.flatMap(group => serializeChatWindowEditors(group)),
			terminal: this._host.terminalsShown(window) || undefined,
		})));
	}

	private async _restore(provider: IChatWindowProvider, stored: readonly IStoredChatWindow[]): Promise<void> {
		for (const entry of stored) {
			const chat = URI.parse(storedChat(entry));
			if (!await provider.canRestore(chat)) {
				this._logService.info(`[ChatWindow] Not restoring the chat window of ${chat.toString()}: the chat is gone`);
				continue;
			}
			try {
				const editors = deserializeChatWindowEditors(this._instantiationService, entry.editors ?? [], error => this._logService.error('[ChatWindow] Failed to restore an editor of a chat window', error));
				await this._host.open(chat, { preserveFocus: true, showTerminals: entry.terminal, editors });
			} catch (error) {
				this._logService.error(`[ChatWindow] Failed to restore the chat window of ${chat.toString()}`, error);
			}
		}
	}
}
