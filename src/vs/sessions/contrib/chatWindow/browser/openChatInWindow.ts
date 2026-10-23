/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { Menus, SessionHeaderMenus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { SessionIsCreatedContext, SessionItemIsMultiSelectionContext } from '../../../common/contextkeys.js';
import { ChatWindowContext, ChatWindowLayout, IChatWindowKind, IChatWindowOpenOptions, IChatWindowService } from '../../../services/chatWindow/browser/chatWindowService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { deserializeChatWindowEditors, ISerializedChatWindowEditor, isSerializedChatWindowEditor, serializeChatWindowEditors } from './chatWindowEditors.js';
import { raceTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { waitForState } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';

/**
 * A chat of the sessions list: the chat beside an editor area, where the files it works on, its changes and the editors
 * opened from it show, as the main window's editor area does for it.
 */
const CHAT_WINDOW_KIND: IChatWindowKind = {
	id: 'chatWithEditors',
	title: localize('chatWindow.title', "Chat"),
	windowSize: { width: 1200, height: 800 },
	defaultLayout: ChatWindowLayout.SideBySide,
};

/**
 * Moves the chat `session` shows in the main window, or its main chat, to a chat window of its own: the main window then
 * shows the session it showed before, or a new session. The chat takes the editors it has open in the main window along,
 * to the editor area beside it.
 */
async function openChatInWindow(accessor: ServicesAccessor, session: ISession, chat?: URI, options?: IChatWindowOpenOptions, editors?: { readonly editors: EditorInput[]; readonly activeEditor: EditorInput | undefined }): Promise<void> {
	const chatWindowService = accessor.get(IChatWindowService);
	const sessionsService = accessor.get(ISessionsService);
	const editorGroupsService = accessor.get(IEditorGroupsService);

	const shown = sessionsService.visibleSessions.get().find(candidate => candidate?.sessionId === session.sessionId);
	// The main window's editors are the session's while the main window is laid out for it.
	const ownsEditors = sessionsService.mainWindowActiveSession.get()?.sessionId === session.sessionId;
	await chatWindowService.open(CHAT_WINDOW_KIND, {
		session: session.resource,
		chat: chat ?? shown?.activeChat.get().resource,
		title: session.title,
		editorArea: { moveEditorsFrom: ownsEditors ? editorGroupsService.mainPart.groups : [], editors: editors?.editors, activeEditor: editors?.activeEditor },
	}, options);
}

/** The chat windows of chats of the sessions list open when the window last closed, by session and chat resource. */
const OPEN_CHAT_WINDOWS_STORAGE_KEY = 'sessions.chatWindow.openChats';

interface IStoredChatWindow {
	readonly session: string;
	readonly chat?: string;
	readonly editors?: readonly ISerializedChatWindowEditor[];
}

/** How long restoring a chat window waits for its session to load. */
const RESTORE_SESSION_TIMEOUT = 30_000;

/** Opens the chat windows of chats of the sessions list that were open when the window last closed. */
class ChatWindowsRestoration extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsChatWindowsRestoration';

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IChatWindowService private readonly _chatWindowService: IChatWindowService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const stored = this._read();
		this._register(this._storageService.onWillSaveState(() => this._save()));
		if (stored.length) {
			this._restore(stored).catch(error => this._logService.error('[ChatWindow] Failed to restore chat windows', error));
		}
	}

	private _read(): IStoredChatWindow[] {
		try {
			const stored: unknown = JSON.parse(this._storageService.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE, '[]'));
			return Array.isArray(stored) ? stored.filter((entry): entry is IStoredChatWindow => typeof entry?.session === 'string'
				&& (entry.chat === undefined || typeof entry.chat === 'string')
				&& (entry.editors === undefined || (Array.isArray(entry.editors) && entry.editors.every(isSerializedChatWindowEditor)))) : [];
		} catch {
			return [];
		}
	}

	private _save(): void {
		const stored: IStoredChatWindow[] = this._chatWindowService.windows.get()
			.filter(window => window.kind === CHAT_WINDOW_KIND)
			.map(window => ({
				session: window.content.get().session.toString(),
				chat: window.content.get().chat?.toString(),
				editors: window.editorGroup ? serializeChatWindowEditors(window.editorGroup) : undefined,
			}));
		if (stored.length) {
			this._storageService.store(OPEN_CHAT_WINDOWS_STORAGE_KEY, JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}

	private async _restore(stored: readonly IStoredChatWindow[]): Promise<void> {
		// After the main window restored the sessions it shows, so that these are not shown there again.
		await waitForState(this._sessionsService.initialRestoreComplete);
		for (const entry of stored) {
			const session = await this._waitForSession(URI.parse(entry.session));
			if (!session) {
				this._logService.info(`[ChatWindow] Not restoring the chat window of ${entry.session}: the session is gone`);
				continue;
			}
			const editors = deserializeChatWindowEditors(this._instantiationService, entry.editors ?? []);
			await this._instantiationService.invokeFunction(accessor => openChatInWindow(accessor, session, entry.chat ? URI.parse(entry.chat) : undefined, { preserveFocus: true }, editors));
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

registerWorkbenchContribution2(ChatWindowsRestoration.ID, ChatWindowsRestoration, WorkbenchPhase.AfterRestored);

registerAction2(class OpenSessionInChatWindowAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.openInChatWindow',
			title: localize2('openSessionInNewWindow', "Open in New Window"),
			icon: Codicon.openInWindow,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: Menus.SessionItemContextMenu,
				// Right after Open to the Side.
				group: '0_pin',
				order: 1.5,
				when: ContextKeyExpr.and(IsSessionsWindowContext, SessionItemIsMultiSelectionContext.negate()),
			}, ...SessionHeaderMenus.map(id => ({
				id,
				// Before Close.
				group: 'secondary/4_pin',
				order: 14,
				when: ContextKeyExpr.and(IsSessionsWindowContext, SessionIsCreatedContext, ContextKeyExpr.has(ChatWindowContext.key).negate()),
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

registerAction2(class OpenActiveChatInChatWindowAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.openActiveChatInChatWindow',
			title: localize2('openActiveChatInNewWindow', "Open Chat in New Window"),
			category: SessionsCategories.Sessions,
			icon: Codicon.openInWindow,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, IsSessionsWindowContext, SessionIsCreatedContext),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const session = accessor.get(ISessionsService).activeSession.get();
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
				when: InSessionChatWindowContext,
			})),
		});
	}

	override async run(accessor: ServicesAccessor, context?: IActiveSession): Promise<void> {
		const chatWindowService = accessor.get(IChatWindowService);
		const window = (context && chatWindowService.windows.get().find(candidate => candidate.session.get() === context)) ?? chatWindowService.getActiveWindow();
		if (window && (window.kind === CHAT_WINDOW_KIND)) {
			await chatWindowService.moveToMainWindow(window);
		}
	}
});
