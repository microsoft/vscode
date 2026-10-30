/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { derived, waitForState } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { Menus, SessionHeaderMenus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { SessionIsCreatedContext, SessionItemIsMultiSelectionContext } from '../../../common/contextkeys.js';
import { SessionLayoutMode } from '../../../common/sessionGridLayout/sessionGridLayout.js';
import { CHAT_WINDOWS_ENABLED_SETTING, ChatWindowContext, IChatWindowKind, IChatWindowOpenOptions, IChatWindowService, OPEN_CHAT_IN_WINDOW_COMMAND_ID } from '../../../services/chatWindow/browser/chatWindowService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { deserializeChatWindowEditors, ISerializedChatWindowEditor, isSerializedChatWindowEditor, serializeChatWindowEditors } from './chatWindowEditors.js';
import { chatWindowTitle, isChatWindowChatGone } from './chatWindowOpening.js';

/**
 * A chat of the sessions list: the chat beside an editor area, where the files it works on, its changes and the editors
 * opened from it show, as the main window's editor area does for it.
 */
export const CHAT_WINDOW_KIND: IChatWindowKind = {
	id: 'chatWithEditors',
	title: localize('chatWindow.title', "Chat"),
	windowSize: { width: 1200, height: 800 },
	defaultLayout: SessionLayoutMode.SideBySide,
	showActivityBar: true,
};

/**
 * Moves the chat `session` shows in the main window, or its main chat, to a chat window of its own: the main window then
 * shows the session it showed before, or a new session. The chat takes the editors it has open in the main window along,
 * to the editor area beside it, but only while the main window shows that chat.
 */
export async function openChatInWindow(accessor: ServicesAccessor, session: ISession, chat?: URI, options?: IChatWindowOpenOptions, editors?: { readonly editors: EditorInput[]; readonly activeEditor: EditorInput | undefined }): Promise<void> {
	const chatWindowService = accessor.get(IChatWindowService);
	const sessionsService = accessor.get(ISessionsService);
	const editorGroupsService = accessor.get(IEditorGroupsService);

	const shown = sessionsService.visibleSessions.get().find(candidate => candidate?.sessionId === session.sessionId && !candidate.scopedChatResource);
	const chatResource = chat ?? shown?.activeChat.get().resource;
	// The main window's editors are the chat's while the main window is laid out for it and shows it as its active chat.
	const mainActive = sessionsService.mainWindowActiveSession.get();
	const ownsEditors = mainActive?.sessionId === session.sessionId
		&& (!chatResource || isEqual(mainActive.activeChat.get().resource, chatResource));
	await chatWindowService.open(CHAT_WINDOW_KIND, {
		session: session.resource,
		chat: chatResource,
		title: derived(reader => chatWindowTitle(session, chatResource, reader)),
		editorArea: { moveEditorsFrom: ownsEditors ? editorGroupsService.mainPart.groups : [], editors: editors?.editors, activeEditor: editors?.activeEditor },
	}, options);
}

/** The chat windows open when the window last closed, by session and chat resource. */
export const OPEN_CHAT_WINDOWS_STORAGE_KEY = 'sessions.chatWindow.openChats';

interface IStoredChatWindow {
	readonly session: string;
	readonly chat?: string;
	readonly editors?: readonly ISerializedChatWindowEditor[];
	/** Whether it showed its terminals. */
	readonly terminal?: boolean;
}

/** Whether chats can be opened in windows of their own: the setting is on, and AI features are enabled. */
export const ChatWindowsEnabledContext = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.has(`config.${CHAT_WINDOWS_ENABLED_SETTING}`))!;

/** How long restoring a chat window waits for its session to load. */
const RESTORE_SESSION_TIMEOUT = 30_000;

/**
 * Opens the chat windows that were open when the window last closed. They stay stored while restoring is pending, while
 * chat windows are disabled and while AI features are hidden, so that they open again once they can.
 */
export class ChatWindowsRestoration extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsChatWindowsRestoration';

	/** Restoring replaces the stored chat windows one by one: saving before it ends would store only the ones it opened so far. */
	private _restoring = false;
	private _keepStored = false;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IChatWindowService private readonly _chatWindowService: IChatWindowService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		super();
		const stored = this._read();
		this._register(this._storageService.onWillSaveState(() => this._save()));
		this._register(this._sessionsManagementService.onDidChangeSessions(e => this._forget(e.removed)));
		if (!stored.length) {
			return;
		}
		if (!configurationService.getValue<boolean>(CHAT_WINDOWS_ENABLED_SETTING) || chatEntitlementService.sentiment.hidden) {
			// Not restored, but kept for when they can be: nothing is saved over them until a chat window opens.
			this._keepStored = true;
			return;
		}
		this._restoring = true;
		this._restore(stored)
			.catch(error => this._logService.error('[ChatWindow] Failed to restore chat windows', error))
			.finally(() => this._restoring = false);
	}

	private _read(): IStoredChatWindow[] {
		try {
			const stored: unknown = JSON.parse(this._storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE, '[]'));
			return Array.isArray(stored) ? stored.filter((entry): entry is IStoredChatWindow => typeof entry?.session === 'string'
				&& (entry.chat === undefined || typeof entry.chat === 'string')
				&& (entry.editors === undefined || (Array.isArray(entry.editors) && entry.editors.every(isSerializedChatWindowEditor)))
				&& (entry.terminal === undefined || typeof entry.terminal === 'boolean')) : [];
		} catch {
			return [];
		}
	}

	/** Storing waits for the next save of the state, which can be far off: a removed session must not be restored by a restart before it. */
	private _forget(removed: readonly ISession[]): void {
		if (!removed.length) {
			return;
		}
		const removedResources = new Set(removed.map(session => session.resource.toString()));
		const stored = this._read();
		const remaining = stored.filter(entry => !removedResources.has(entry.session));
		if (remaining.length === stored.length) {
			return;
		}
		if (remaining.length) {
			this._storageService.store(OPEN_CHAT_WINDOWS_STORAGE_KEY, JSON.stringify(remaining), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}

	private _save(): void {
		if (this._restoring) {
			return;
		}
		const windows = this._chatWindowService.windows.get().filter(window => window.kind === CHAT_WINDOW_KIND);
		if (this._keepStored && !windows.length) {
			return;
		}
		this._keepStored = false;
		const stored: IStoredChatWindow[] = windows.map(window => ({
			session: window.content.get().session.toString(),
			chat: window.content.get().chat?.toString(),
			editors: window.editorArea ? window.editorArea.groups.flatMap(group => serializeChatWindowEditors(group)) : undefined,
			terminal: window.terminalShown.get() || undefined,
		}));
		if (stored.length) {
			this._storageService.store(OPEN_CHAT_WINDOWS_STORAGE_KEY, JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}

	private async _restore(stored: readonly IStoredChatWindow[]): Promise<void> {
		// After the main window restored the sessions it shows, and their editors, so that these are not shown there again.
		await waitForState(this._sessionsService.initialRestoreComplete);
		for (const entry of stored) {
			const session = await this._waitForSession(URI.parse(entry.session));
			if (!session) {
				this._logService.info(`[ChatWindow] Not restoring the chat window of ${entry.session}: the session is gone`);
				continue;
			}
			if (entry.chat) {
				const chatResource = URI.parse(entry.chat);
				await waitForState(derived(reader => !session.loading.read(reader)));
				if (isChatWindowChatGone(session, chatResource, undefined)) {
					this._logService.info(`[ChatWindow] Not restoring the chat window of ${entry.chat}: the chat is gone`);
					continue;
				}
			}
			try {
				const editors = deserializeChatWindowEditors(this._instantiationService, entry.editors ?? [], error => this._logService.error('[ChatWindow] Failed to restore an editor of a chat window', error));
				await this._instantiationService.invokeFunction(accessor => openChatInWindow(accessor, session, entry.chat ? URI.parse(entry.chat) : undefined, { preserveFocus: true, showTerminal: entry.terminal }, editors));
			} catch (error) {
				this._logService.error(`[ChatWindow] Failed to restore the chat window of ${entry.session}`, error);
			}
		}
	}

	private async _waitForSession(resource: URI): Promise<ISession | undefined> {
		const session = this._sessionsManagementService.getSession(resource);
		if (session) {
			return session;
		}
		const store = new DisposableStore();
		try {
			return await raceTimeout(new Promise<ISession | undefined>(resolve => {
				store.add(this._sessionsManagementService.onDidChangeSessions(() => {
					const loaded = this._sessionsManagementService.getSession(resource);
					if (loaded) {
						resolve(loaded);
					}
				}));
			}), RESTORE_SESSION_TIMEOUT);
		} finally {
			store.dispose();
		}
	}
}

registerAction2(class OpenSessionInChatWindowAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.openInChatWindow',
			title: localize2('openSessionInNewWindow', "Open in New Window"),
			icon: Codicon.openInWindow,
			precondition: ChatWindowsEnabledContext,
			menu: [{
				id: Menus.SessionItemContextMenu,
				// Right after Open to the Side.
				group: '0_pin',
				order: 1.5,
				when: ContextKeyExpr.and(ChatWindowsEnabledContext, IsSessionsWindowContext, SessionItemIsMultiSelectionContext.negate()),
			}, ...SessionHeaderMenus.map(id => ({
				id,
				// Before Close.
				group: 'secondary/4_pin',
				order: 14,
				when: ContextKeyExpr.and(ChatWindowsEnabledContext, IsSessionsWindowContext, SessionIsCreatedContext, ContextKeyExpr.has(ChatWindowContext.key).negate()),
			}))],
		});
	}

	override async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const session = Array.isArray(context) ? context[0] : context;
		if (session) {
			await openChatInWindow(accessor, session);
		}
	}
});

registerAction2(class OpenChatInChatWindowAction extends Action2 {
	constructor() {
		super({
			id: OPEN_CHAT_IN_WINDOW_COMMAND_ID,
			title: localize2('openChatInNewWindow', "Open in New Window"),
			icon: Codicon.openInWindow,
			precondition: ChatWindowsEnabledContext,
			menu: [{
				id: Menus.SessionChatItemContext,
				group: '0_window',
				order: 1,
				when: ContextKeyExpr.and(ChatWindowsEnabledContext, IsSessionsWindowContext, ContextKeyExpr.has('sessionChatItem.isUntitled').negate()),
			}],
		});
	}

	override async run(accessor: ServicesAccessor, context?: { readonly session: ISession; readonly chat: IChat }): Promise<void> {
		if (context) {
			await openChatInWindow(accessor, context.session, context.chat.resource);
		}
	}
});

registerAction2(class OpenActiveChatInChatWindowAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.openActiveChatInChatWindow',
			title: localize2('openActiveChatInNewWindow', "Open Chat in New Window"),
			category: SessionsCategories.Sessions,
			icon: Codicon.openInWindow,
			f1: true,
			precondition: ContextKeyExpr.and(ChatWindowsEnabledContext, IsSessionsWindowContext, SessionIsCreatedContext, ContextKeyExpr.has(ChatWindowContext.key).negate()),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const session = accessor.get(ISessionsService).mainWindowActiveSession.get();
		if (session) {
			await openChatInWindow(accessor, session);
		}
	}
});

/** Inside a chat window that shows a chat of the sessions list. */
const InSessionChatWindowContext = ChatWindowContext.isEqualTo(CHAT_WINDOW_KIND.id);

registerAction2(class MoveChatToMainWindowAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatWindow.moveToMainWindow',
			title: localize2('moveChatToMainWindow', "Move to Main Window"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, InSessionChatWindowContext),
			menu: SessionHeaderMenus.map(id => ({
				id,
				// Before Close.
				group: 'secondary/4_pin',
				order: 14,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, InSessionChatWindowContext),
			})),
		});
	}

	override async run(accessor: ServicesAccessor, context?: unknown): Promise<void> {
		const chatWindowService = accessor.get(IChatWindowService);
		// The chat window the header it runs from belongs to, by its session, else the one it acts on.
		const window = chatWindowService.windows.get().find(candidate => candidate.session.get() === context) ?? chatWindowService.resolveWindow(context);
		if (window && window.kind === CHAT_WINDOW_KIND) {
			await chatWindowService.moveToMainWindow(window);
		}
	}
});

/** Names this module, which registers chat window actions, in the list of the chat window contribution; see `chatWindowContributions`. */
export const openChatInWindowContribution = 'openChatInWindow';
