/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatLayoutMode, IChatLayoutOwner, SESSIONS_LAYOUT_SCOPE_SETTING, getChatLayoutOwnerAfterReplacement } from '../../../common/chatLayout.js';
import { SessionLayoutMode } from '../../../common/sessionLayoutMode.js';
import { ISession } from '../../sessions/common/session.js';
import { ISessionsManagementService } from '../../sessions/common/sessionsManagement.js';
import { IRememberedLayoutMode, ISessionLayoutModeService, LayoutModeOwnerKind } from '../common/sessionLayoutModeService.js';

const SCHEMA_VERSION = 1;

/** The chat window modes, per chat. */
const CHAT_WINDOW_KEY = 'sessions.chatWindow.layoutMode';

/** The main window modes, by `sessions.experimental.layoutScope`: per chat, or shared. */
const MAIN_WINDOW_KEYS: Record<ChatLayoutMode, string> = {
	'chat': 'sessions.chatLayout.layoutMode',
	'chat-shared': 'sessions.sharedChatLayout.layoutMode',
	'session-shared': 'sessions.singlePane.layoutMode',
};

function isRememberedLayoutMode(value: unknown): value is IRememberedLayoutMode {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const { mode, splitLayout, inputOnly } = value as Partial<IRememberedLayoutMode>;
	return (mode === SessionLayoutMode.ChatOnly || mode === SessionLayoutMode.EditorOnly || mode === SessionLayoutMode.Stacked || mode === SessionLayoutMode.SideBySide)
		&& (splitLayout === SessionLayoutMode.Stacked || splitLayout === SessionLayoutMode.SideBySide)
		&& typeof inputOnly === 'boolean';
}

function toRecord(mode: IRememberedLayoutMode): IRememberedLayoutMode {
	return Object.freeze({ mode: mode.mode, splitLayout: mode.splitLayout, inputOnly: mode.inputOnly });
}

function modesEqual(a: IRememberedLayoutMode | undefined, b: IRememberedLayoutMode): boolean {
	return !!a && a.mode === b.mode && a.splitLayout === b.splitLayout && a.inputOnly === b.inputOnly;
}

/** The most chats whose modes are remembered: the ones set least recently are forgotten first. */
const MAX_PER_CHAT_ENTRIES = 200;

function ownerId(owner: IChatLayoutOwner): string {
	return `${owner.sessionResource.toString()}\n${owner.chatResource.toString()}`;
}

/**
 * Modes per chat, persisted as `{ version, entries: [session, chat, mode][] }` from the least to the most recently set,
 * up to {@link MAX_PER_CHAT_ENTRIES}.
 */
class PerChatModes {

	private readonly _entries = new Map<string, { readonly owner: IChatLayoutOwner; readonly mode: IRememberedLayoutMode }>();

	constructor(
		private readonly _key: string,
		private readonly _storageService: IStorageService,
		logService: ILogService,
	) {
		const raw = _storageService.get(_key, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		try {
			const parsed: unknown = JSON.parse(raw);
			const entries = (parsed as { version?: unknown; entries?: unknown }).entries;
			if ((parsed as { version?: unknown }).version !== SCHEMA_VERSION || !Array.isArray(entries)) {
				throw new Error('unsupported schema');
			}
			const loaded: { owner: IChatLayoutOwner; mode: IRememberedLayoutMode }[] = [];
			for (const entry of entries) {
				if (!Array.isArray(entry) || entry.length !== 3 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string' || !isRememberedLayoutMode(entry[2])) {
					throw new Error('malformed entry');
				}
				loaded.push({ owner: { sessionResource: URI.parse(entry[0]), chatResource: URI.parse(entry[1]) }, mode: toRecord(entry[2]) });
			}
			for (const { owner, mode } of loaded.slice(-MAX_PER_CHAT_ENTRIES)) {
				this._entries.set(ownerId(owner), { owner, mode });
			}
		} catch (error) {
			logService.warn(`[SessionLayoutModeService] Dropping malformed '${_key}': ${error}`);
			_storageService.remove(_key, StorageScope.WORKSPACE);
		}
	}

	get(owner: IChatLayoutOwner): IRememberedLayoutMode | undefined {
		return this._entries.get(ownerId(owner))?.mode;
	}

	set(owner: IChatLayoutOwner, mode: IRememberedLayoutMode): void {
		const id = ownerId(owner);
		const existing = this._entries.get(id);
		// Most recently set last.
		this._entries.delete(id);
		if (existing && modesEqual(existing.mode, mode)) {
			this._entries.set(id, existing);
			return;
		}
		this._entries.set(id, { owner, mode: toRecord(mode) });
		for (const oldest of this._entries.keys()) {
			if (this._entries.size <= MAX_PER_CHAT_ENTRIES) {
				break;
			}
			this._entries.delete(oldest);
		}
		this._save();
	}

	forget(predicate: (owner: IChatLayoutOwner) => boolean): void {
		let changed = false;
		for (const [id, { owner }] of this._entries) {
			if (predicate(owner)) {
				this._entries.delete(id);
				changed = true;
			}
		}
		if (changed) {
			this._save();
		}
	}

	remapSession(replacement: { readonly from: ISession; readonly to: ISession }): void {
		const moved = [...this._entries.values()].filter(({ owner }) => isEqual(owner.sessionResource, replacement.from.resource));
		if (moved.length === 0) {
			return;
		}
		for (const { owner } of moved) {
			this._entries.delete(ownerId(owner));
		}
		for (const { owner, mode } of moved) {
			const remapped = getChatLayoutOwnerAfterReplacement(owner, replacement);
			this._entries.set(ownerId(remapped), { owner: remapped, mode });
		}
		this._save();
	}

	private _save(): void {
		if (this._entries.size === 0) {
			this._storageService.remove(this._key, StorageScope.WORKSPACE);
			return;
		}
		const entries = [...this._entries.values()].map(({ owner, mode }) => [owner.sessionResource.toString(), owner.chatResource.toString(), mode]);
		this._storageService.store(this._key, JSON.stringify({ version: SCHEMA_VERSION, entries }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

/** One mode per {@link LayoutModeOwnerKind}, persisted as `{ version, entries: [kind, mode][] }`. */
class SharedModes {

	private readonly _entries = new Map<LayoutModeOwnerKind, IRememberedLayoutMode>();

	constructor(
		private readonly _key: string,
		private readonly _storageService: IStorageService,
		logService: ILogService,
	) {
		const raw = _storageService.get(_key, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		try {
			const parsed: unknown = JSON.parse(raw);
			const entries = (parsed as { version?: unknown; entries?: unknown }).entries;
			if ((parsed as { version?: unknown }).version !== SCHEMA_VERSION || !Array.isArray(entries)) {
				throw new Error('unsupported schema');
			}
			const loaded: [LayoutModeOwnerKind, IRememberedLayoutMode][] = [];
			for (const entry of entries) {
				if (!Array.isArray(entry) || entry.length !== 2 || (entry[0] !== LayoutModeOwnerKind.Existing && entry[0] !== LayoutModeOwnerKind.Draft && entry[0] !== LayoutModeOwnerKind.QuickChat) || !isRememberedLayoutMode(entry[1])) {
					throw new Error('malformed entry');
				}
				loaded.push([entry[0], toRecord(entry[1])]);
			}
			for (const [kind, mode] of loaded) {
				this._entries.set(kind, mode);
			}
		} catch (error) {
			logService.warn(`[SessionLayoutModeService] Dropping malformed '${_key}': ${error}`);
			_storageService.remove(_key, StorageScope.WORKSPACE);
		}
	}

	get(kind: LayoutModeOwnerKind): IRememberedLayoutMode | undefined {
		return this._entries.get(kind);
	}

	set(kind: LayoutModeOwnerKind, mode: IRememberedLayoutMode): void {
		if (modesEqual(this._entries.get(kind), mode)) {
			return;
		}
		this._entries.set(kind, toRecord(mode));
		this._storageService.store(this._key, JSON.stringify({ version: SCHEMA_VERSION, entries: [...this._entries] }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

export class SessionLayoutModeService extends Disposable implements ISessionLayoutModeService {

	declare readonly _serviceBrand: undefined;

	/** The layout scope, fixed at startup as the layout controllers read it. */
	private readonly _scope: ChatLayoutMode;
	private readonly _mainPerChat: PerChatModes | undefined;
	private readonly _mainShared: SharedModes | undefined;
	private readonly _chatWindow: PerChatModes;

	constructor(
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
	) {
		super();

		const configured = configurationService.getValue<string>(SESSIONS_LAYOUT_SCOPE_SETTING);
		this._scope = configured === 'chat' || configured === 'chat-shared' ? configured : 'session-shared';
		if (this._scope === 'chat') {
			this._mainPerChat = new PerChatModes(MAIN_WINDOW_KEYS[this._scope], storageService, logService);
		} else {
			this._mainShared = new SharedModes(MAIN_WINDOW_KEYS[this._scope], storageService, logService);
		}
		this._chatWindow = new PerChatModes(CHAT_WINDOW_KEY, storageService, logService);

		const perChat = [this._mainPerChat, this._chatWindow].filter(modes => !!modes);
		const forgetSession = (session: ISession) => perChat.forEach(modes => modes.forget(owner => isEqual(owner.sessionResource, session.resource)));
		this._register(sessionsManagementService.onDidDeleteChat(({ sessionResource, chatResource }) => {
			perChat.forEach(modes => modes.forget(owner => isEqual(owner.sessionResource, sessionResource) && isEqual(owner.chatResource, chatResource)));
		}));
		this._register(sessionsManagementService.onDidDeleteSession(forgetSession));
		this._register(sessionsManagementService.onDidArchiveSession(forgetSession));
		this._register(sessionsManagementService.onDidReplaceSession(replacement => {
			if (!isEqual(replacement.from.resource, replacement.to.resource)) {
				perChat.forEach(modes => modes.remapSession(replacement));
			}
		}));
	}

	getMainWindowMode(owner: IChatLayoutOwner, kind: LayoutModeOwnerKind): IRememberedLayoutMode | undefined {
		return this._mainPerChat ? this._mainPerChat.get(owner) : this._mainShared?.get(kind);
	}

	setMainWindowMode(owner: IChatLayoutOwner, kind: LayoutModeOwnerKind, mode: IRememberedLayoutMode): void {
		if (this._mainPerChat) {
			this._mainPerChat.set(owner, mode);
		} else {
			this._mainShared?.set(kind, mode);
		}
	}

	getChatWindowMode(owner: IChatLayoutOwner): IRememberedLayoutMode | undefined {
		return this._chatWindow.get(owner);
	}

	setChatWindowMode(owner: IChatLayoutOwner, mode: IRememberedLayoutMode): void {
		this._chatWindow.set(owner, mode);
	}

	getChatWindowInitialMode(owner: IChatLayoutOwner, kind: LayoutModeOwnerKind): IRememberedLayoutMode | undefined {
		return this._chatWindow.get(owner) ?? this.getMainWindowMode(owner, kind);
	}

	returnToMainWindow(owner: IChatLayoutOwner, kind: LayoutModeOwnerKind): IRememberedLayoutMode | undefined {
		const chatWindowMode = this._chatWindow.get(owner);
		if (chatWindowMode && this._mainPerChat) {
			this._mainPerChat.set(owner, chatWindowMode);
		}
		return this.getMainWindowMode(owner, kind);
	}
}

registerSingleton(ISessionLayoutModeService, SessionLayoutModeService, InstantiationType.Delayed);
