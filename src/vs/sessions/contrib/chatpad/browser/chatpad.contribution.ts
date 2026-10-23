/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { raceTimeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { waitForState } from '../../../../base/common/observable.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { ChatWindowMenuOrder, IChatWindowService } from '../../../services/chatWindow/browser/chatWindowService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import type { ISessionsProvider, ISessionsProviderChatpad } from '../../../services/sessions/common/sessionsProvider.js';
import { getChatpadChatWindowContent, OPEN_CHATPAD_COMMAND_ID, CHATPAD_CHAT_WINDOW_KIND, ChatpadEnabledContext, ChatpadWindowContext } from './chatpad.js';
import { ChatpadLauncherContribution } from './chatpadLauncher.js';

interface IResolvedChatpad {
	readonly provider: ISessionsProvider;
	readonly chatpad: ISessionsProviderChatpad;
}

/** Resolves the Chatpad of the first provider that has one. */
async function resolveChatpad(providersService: ISessionsProvidersService, logService: ILogService): Promise<IResolvedChatpad | undefined> {
	for (const provider of providersService.getProviders()) {
		if (!provider.getChatpad) {
			continue;
		}
		try {
			const chatpad = await provider.getChatpad();
			if (chatpad) {
				return { provider, chatpad };
			}
		} catch (error) {
			logService.error(`[Chatpad] Failed to resolve the Chatpad of ${provider.id}`, error);
		}
	}
	return undefined;
}

function notifyUnavailable(notificationService: INotificationService): void {
	notificationService.info(localize('chatpad.unavailable', "The Chatpad is not available. It requires an agent host that provides one."));
}

/** Where the Clear action shows: before the chat window's Layout and Dock. */
const CHATPAD_CLEAR_ORDER = { titleBar: ChatWindowMenuOrder.titleBar.layout - 1, header: ChatWindowMenuOrder.header.layout - 1 };

registerAction2(class OpenChatpadAction extends Action2 {
	constructor() {
		super({
			id: OPEN_CHATPAD_COMMAND_ID,
			title: localize2('openChatpad', "Open Chatpad"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ChatpadEnabledContext,
		});
	}

	/** Shows the Chatpad in its chat window: its note above its chat, docked in the main window by default. */
	override async run(accessor: ServicesAccessor): Promise<void> {
		const providersService = accessor.get(ISessionsProvidersService);
		const chatWindowService = accessor.get(IChatWindowService);
		const logService = accessor.get(ILogService);
		const notificationService = accessor.get(INotificationService);

		const resolved = await resolveChatpad(providersService, logService);
		if (!resolved) {
			notifyUnavailable(notificationService);
			return;
		}
		await chatWindowService.open(CHATPAD_CHAT_WINDOW_KIND, getChatpadChatWindowContent(resolved.chatpad));
	}
});

registerAction2(class ClearChatpadAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatpad.clear',
			title: localize2('clearChatpad', "Clear Chatpad"),
			category: SessionsCategories.Sessions,
			icon: Codicon.clearAll,
			f1: true,
			precondition: ContextKeyExpr.and(ChatpadEnabledContext, ChatpadWindowContext),
			menu: [{
				id: Menus.TitleBarRightLayout,
				group: 'navigation',
				order: CHATPAD_CLEAR_ORDER.titleBar,
				when: ChatpadWindowContext,
			}, {
				id: Menus.ChatWindowTitle,
				group: 'navigation',
				order: CHATPAD_CLEAR_ORDER.header,
				when: ChatpadWindowContext,
			}],
		});
	}

	/** Deletes the Chatpad chat, which deletes its note with it, and shows a new Chatpad in its chat window. */
	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatWindowService = accessor.get(IChatWindowService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const providersService = accessor.get(ISessionsProvidersService);
		const dialogService = accessor.get(IDialogService);
		const logService = accessor.get(ILogService);
		const notificationService = accessor.get(INotificationService);

		const window = chatWindowService.getActiveWindow();
		const session = window?.kind.id === CHATPAD_CHAT_WINDOW_KIND.id ? sessionsManagementService.getSession(window.content.get().session) : undefined;
		const provider = session ? providersService.getProvider(session.providerId) : undefined;
		if (!window || !session || !provider?.getChatpad) {
			return;
		}

		const { confirmed } = await dialogService.confirm({
			type: 'warning',
			message: localize('clearChatpad.confirm', "Do you want to clear the Chatpad?"),
			detail: localize('clearChatpad.confirmDetail', "This deletes the note and the conversation with its chat. This cannot be undone."),
			primaryButton: localize({ key: 'clearChatpad.confirmButton', comment: ['&& denotes a mnemonic'] }, "&&Clear"),
		});
		if (!confirmed) {
			return;
		}

		try {
			// The chat window stays open while its Chatpad is deleted and a new one is made.
			await window.replace((async () => {
				await sessionsManagementService.deleteSession(session);
				const chatpad = await provider.getChatpad?.();
				if (!chatpad) {
					notifyUnavailable(notificationService);
					return undefined;
				}
				return getChatpadChatWindowContent(chatpad);
			})());
		} catch (error) {
			logService.error('[Chatpad] Failed to clear the Chatpad', error);
			notificationService.error(localize('clearChatpad.failed', "Could not clear the Chatpad."));
		}
	}
});

registerAction2(class AppendToChatpadAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.appendToChatpad',
			title: localize2('appendToChatpad', "Append to Chatpad"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ChatpadEnabledContext,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const providersService = accessor.get(ISessionsProvidersService);
		const logService = accessor.get(ILogService);
		const notificationService = accessor.get(INotificationService);
		const quickInputService = accessor.get(IQuickInputService);

		const resolved = await resolveChatpad(providersService, logService);
		if (!resolved?.provider.appendToChatpad) {
			notifyUnavailable(notificationService);
			return;
		}
		const text = await quickInputService.input({
			placeHolder: localize('appendToChatpad.placeholder', "Text to append to the Chatpad"),
			prompt: localize('appendToChatpad.prompt', "Press Enter to append the text as typed, without asking the Chatpad chat."),
			validateInput: async value => value.trim() ? undefined : localize('appendToChatpad.empty', "Enter text to append."),
		});
		if (!text?.trim()) {
			return;
		}
		try {
			await resolved.provider.appendToChatpad(text);
		} catch (error) {
			logService.error('[Chatpad] Failed to append to the Chatpad', error);
			notificationService.error(localize('appendToChatpad.failed', "Could not append to the Chatpad."));
		}
	}
});

/** Whether the Chatpad was open when the window last closed. */
const CHATPAD_OPEN_STORAGE_KEY = 'sessions.chatpad.open';

/** How long restoring the Chatpad waits for an agent host that provides it. */
const CHATPAD_RESTORE_TIMEOUT = 30_000;

/** Opens the Chatpad, as it was, when it was open as the window last closed. */
class ChatpadRestoration extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsChatpadRestoration';

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IChatWindowService private readonly _chatWindowService: IChatWindowService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly _providersService: ISessionsProvidersService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const wasOpen = this._storageService.getBoolean(CHATPAD_OPEN_STORAGE_KEY, StorageScope.WORKSPACE, false);
		this._register(this._storageService.onWillSaveState(() => this._storageService.store(
			CHATPAD_OPEN_STORAGE_KEY,
			this._chatWindowService.windows.get().some(window => window.kind === CHATPAD_CHAT_WINDOW_KIND),
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE,
		)));
		if (wasOpen) {
			this._restore().catch(error => this._logService.error('[Chatpad] Failed to restore the Chatpad', error));
		}
	}

	private async _restore(): Promise<void> {
		await waitForState(this._sessionsService.initialRestoreComplete);
		const deadline = Date.now() + CHATPAD_RESTORE_TIMEOUT;
		while (Date.now() < deadline && !this._store.isDisposed) {
			if (this._contextKeyService.contextMatchesRules(ChatpadEnabledContext)) {
				const resolved = await resolveChatpad(this._providersService, this._logService);
				if (resolved) {
					if (!this._chatWindowService.windows.get().some(window => window.kind === CHATPAD_CHAT_WINDOW_KIND)) {
						await this._chatWindowService.open(CHATPAD_CHAT_WINDOW_KIND, getChatpadChatWindowContent(resolved.chatpad), { preserveFocus: true });
					}
					return;
				}
			}
			// Once an agent host that provides it is there.
			await raceTimeout(Event.toPromise(Event.any<unknown>(this._providersService.onDidChangeProviders, this._contextKeyService.onDidChangeContext)), Math.max(0, deadline - Date.now()));
		}
	}
}

registerWorkbenchContribution2(ChatpadLauncherContribution.ID, ChatpadLauncherContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatpadRestoration.ID, ChatpadRestoration, WorkbenchPhase.AfterRestored);
