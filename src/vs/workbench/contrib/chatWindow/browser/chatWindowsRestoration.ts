/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { AuxiliaryWindowMode } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
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
	/** The chat whose layout and part sizes it remembers, when not the one first in its tabs. */
	readonly layoutChat?: string;
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
	/** Where on the screen it showed, and whether maximized or in full screen; checked as it restores. */
	readonly window?: unknown;
}

/** Where on the screen a chat window shows, and whether maximized or in full screen. */
export interface IChatWindowBounds {
	readonly bounds: IRectangle;
	readonly mode?: AuxiliaryWindowMode;
}

/**
 * Whether `value`, read from storage, is where a chat window showed. Bounds off every display, such as one that was
 * removed, are left to opening the window, which validates them as it does for every auxiliary window.
 */
function isChatWindowBounds(value: unknown): value is IChatWindowBounds {
	const candidate = value as Partial<IChatWindowBounds> | undefined;
	const bounds = candidate?.bounds as Partial<IRectangle> | undefined;
	const mode = candidate?.mode;
	return [bounds?.x, bounds?.y, bounds?.width, bounds?.height].every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate))
		&& (mode === undefined || mode === AuxiliaryWindowMode.Maximized || mode === AuxiliaryWindowMode.Normal || mode === AuxiliaryWindowMode.Fullscreen);
}

function isStoredChatWindow(entry: Partial<IStoredChatWindow> | undefined): entry is IStoredChatWindow {
	return (typeof entry?.chat === 'string' || typeof entry?.session === 'string')
		&& (entry.chat === undefined || typeof entry.chat === 'string')
		&& (entry.session === undefined || typeof entry.session === 'string')
		&& (entry.layoutChat === undefined || typeof entry.layoutChat === 'string')
		&& (entry.chats === undefined || (Array.isArray(entry.chats) && entry.chats.every(chat => typeof chat === 'string')))
		&& (entry.activeChat === undefined || typeof entry.activeChat === 'string')
		&& (entry.editors === undefined || (Array.isArray(entry.editors) && entry.editors.every(isSerializedChatWindowEditor)))
		&& (entry.terminal === undefined || typeof entry.terminal === 'boolean')
		&& (entry.created === undefined || (Array.isArray(entry.created) && entry.created.every(editors => Array.isArray(editors) && editors.every(isSerializedChatWindowEditor))));
}

function storedChat(entry: IStoredChatWindow): string {
	return (entry.chat ?? entry.session)!;
}

/**
 * The chats that remain of a stored window without `removed`, the first of which it opens for: none for a window with
 * none left, and undefined when it had none of them.
 */
function withoutChats(entry: IStoredChatWindow, removed: ReadonlySet<string>): IStoredChatWindow[] | undefined {
	const all = [storedChat(entry), ...(entry.chats ?? [])];
	const kept = all.filter(chat => !removed.has(chat));
	if (kept.length === all.length) {
		return undefined;
	}
	if (!kept.length) {
		return [];
	}
	const [chat, ...others] = kept;
	return [{ ...entry, chat, session: undefined, chats: others.length ? others : undefined, activeChat: entry.activeChat && kept.includes(entry.activeChat) ? entry.activeChat : undefined }];
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
	/** The chats of `window` in the order its tabs show them, so that they open again in it; by default the order they joined in. */
	chatsInOrder?(window: IChatWindow): readonly URI[] | undefined;
	/** The chat whose layout and part sizes `window` remembers, which is not always the first of its tabs. */
	layoutChatOf?(window: IChatWindow): URI | undefined;
	/** Makes `chat`, one of `window`'s chats, its active chat without focusing it, as it was when it last closed. */
	activateChat?(window: IChatWindow, chat: URI): void;
	/** Where on the screen `window` shows, so that it shows there again. */
	windowState?(window: IChatWindow): IChatWindowBounds | undefined;
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
	/**
	 * The chats of stored chat windows that did not open as they restored, which stay stored to restore next time: a
	 * window that failed to open, or the chats of one that did not come up in any window.
	 */
	private _failed: IStoredChatWindow[] = [];
	/** The chat each chat of {@link _failed} resolved as when that is another one, so that it is known once that one shows. */
	private readonly _canonical = new Map<string, string>();
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
		// Each chat of a window that failed to open is retired for good once it, or the chat it opens as, shows in a window,
		// so that closing that window does not bring it back; its other chats stay stored.
		this._register(autorun(reader => {
			const shown = this._shownChats(reader);
			const provider = this._host.provider.read(reader);
			const retired = new Set(this._failed.flatMap(entry => [storedChat(entry), ...(entry.chats ?? [])]).filter(chat => this._isShown(chat, shown, provider)));
			if (retired.size) {
				this._failed = this._failed.flatMap(entry => withoutChats(entry, retired) ?? [entry]);
				for (const chat of retired) {
					this._canonical.delete(chat);
				}
			}
		}));
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
				provider.didFinishRestore?.([]);
				return;
			}
			this._restoring = true;
			const claimed: URI[] = [];
			this._restore(provider, stored, claimed)
				.catch(error => this._logService.error('[ChatWindow] Failed to restore chat windows', error))
				.finally(() => {
					this._restoring = false;
					this._keepStored = false;
					provider.didFinishRestore?.(claimed);
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
		this._failed = this._failed.flatMap(entry => withoutChats(entry, removed) ?? [entry]);
		const stored = this._read();
		let changed = false;
		const remaining = stored.flatMap(entry => {
			const kept = withoutChats(entry, removed);
			changed ||= !!kept;
			return kept ?? [entry];
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
		// A window that failed to open stays stored, until its chat opens in a window
		const failed = this._failed;
		this._write([...windows.map(window => {
			const [chat, ...chats] = (this._host.chatsInOrder?.(window) ?? window.openedChats.get()).map(candidate => candidate.toString());
			const layoutChat = this._host.layoutChatOf?.(window)?.toString();
			return {
				chat,
				layoutChat: layoutChat !== chat ? layoutChat : undefined,
				chats: chats.length ? chats : undefined,
				activeChat: chats.length ? window.chat.get().toString() : undefined,
				editors: window.mainPart.groups.flatMap(group => serializeChatWindowEditors(group)),
				terminal: this._host.terminalsShown(window) || undefined,
				chatPart: this._host.chatPart(window),
				created: this._createdParts(window),
				window: this._host.windowState?.(window),
			};
		}), ...failed]);
	}

	private _createdParts(window: IChatWindow): ISerializedChatWindowEditor[][] | undefined {
		const created = this._host.createdParts(window)
			.map(part => part.groups.flatMap(group => serializeChatWindowEditors(group)))
			.filter(editors => editors.length > 0);
		return created.length ? created : undefined;
	}

	private _shownChats(reader: IReader | undefined): Set<string> {
		return new Set(this._host.windows.read(reader).flatMap(window => window.openedChats.read(reader).map(chat => chat.toString())));
	}

	/** Whether `chat`, a stored chat, shows in a window among `shown`: itself, or the chat it opens as. */
	private _isShown(chat: string, shown: ReadonlySet<string>, provider: IChatWindowProvider | undefined): boolean {
		if (shown.has(chat)) {
			return true;
		}
		const canonical = this._canonical.get(chat) ?? provider?.canonicalChatOf?.(URI.parse(chat))?.toString();
		return !!canonical && shown.has(canonical);
	}

	/**
	 * Keeps the chats of `entry` that did not come up in any window as it restored, also once some did, in their order:
	 * all of them, as stored, when its window failed to open, and otherwise those its window did not take, such as a
	 * chat beside one that shows in another window already. A chat that shows as another one in any window came up.
	 */
	private _retainUnopened(provider: IChatWindowProvider, entry: IStoredChatWindow, restorable: readonly URI[]): void {
		const shown = this._shownChats(undefined);
		const unopened: string[] = [];
		for (const chat of restorable.map(candidate => candidate.toString())) {
			const canonical = provider.canonicalChatOf?.(URI.parse(chat))?.toString();
			if (canonical && canonical !== chat) {
				this._canonical.set(chat, canonical);
			}
			if (!this._isShown(chat, shown, provider)) {
				unopened.push(chat);
			} else {
				this._canonical.delete(chat);
			}
		}
		if (unopened.length === restorable.length) {
			this._failed.push(entry);
		} else if (unopened.length) {
			const [chat, ...chats] = unopened;
			this._failed.push({ chat, chats: chats.length ? chats : undefined });
		}
	}

	/** Restores `stored`, adding the chats it restores or tries to, in a window that fails to open too, to `claimed`. */
	private async _restore(provider: IChatWindowProvider, stored: readonly IStoredChatWindow[], claimed: URI[]): Promise<void> {
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
			claimed.push(...restorable);
			try {
				const onError = (error: unknown) => this._logService.error('[ChatWindow] Failed to restore an editor of a chat window', error);
				const editors = deserializeChatWindowEditors(this._instantiationService, entry.editors ?? [], onError);
				const createdParts = (entry.created ?? []).map(created => deserializeChatWindowEditors(this._instantiationService, created, onError)).filter(created => created.editors.length > 0);
				// The groups of its chat part only while all its chats restore, which they place
				const chatPart = isChatWindowChatPart(entry.chatPart) && chats.length === (entry.chats?.length ?? 0) && chat.toString() === storedChat(entry) ? entry.chatPart : undefined;
				const layoutChat = restorable.find(candidate => candidate.toString() === entry.layoutChat);
				const windowState = isChatWindowBounds(entry.window) ? entry.window : undefined;
				const window = await this._host.open(chat, { preserveFocus: true, chats: chats.length ? chats : undefined, restoreChatsOnReveal: true, showTerminals: entry.terminal, editors, chatPart, layoutChat, createdParts: createdParts.length ? createdParts : undefined, bounds: windowState?.bounds, mode: windowState?.mode });
				// Its active chat, any of those it restored, the first too
				if (window && entry.activeChat && restorable.some(candidate => candidate.toString() === entry.activeChat)) {
					this._host.activateChat?.(window, URI.parse(entry.activeChat));
				}
			} catch (error) {
				this._logService.error(`[ChatWindow] Failed to restore the chat window of ${chat.toString()}`, error);
			}
			this._retainUnopened(provider, entry, restorable);
		}
	}
}
