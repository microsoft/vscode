/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
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
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { CHAT_WINDOW_TEXT_EDITOR, ChatWindowEditorViewTypeContext, IChatWindowService } from '../../../services/chatWindow/browser/chatWindowService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import type { ISessionsProvider, ISessionsProviderChatpad } from '../../../services/sessions/common/sessionsProvider.js';
import { CHATPAD_NOTE_MARKDOWN_EDITOR, getChatpadChatWindowContent, OPEN_CHATPAD_COMMAND_ID, setChatpadNoteViewType, CHATPAD_CHAT_WINDOW_KIND, ChatpadEnabledContext, ChatpadAvailableContext, ChatpadWindowContext, CHATPAD_ENABLED_SETTING } from './chatpad.js';
import { ChatpadLauncherContribution } from './chatpadLauncher.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[CHATPAD_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			description: localize('sessions.chatpad.enabled', "Controls whether the Chatpad of the Agents window can be opened, and whether it is restored at startup when it was open. Turning it off hides the Open Chatpad and Append to Chatpad commands and the Open Chatpad button; a Chatpad that is open stays until closed."),
		},
	}
});

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

/** Where the Clear action shows in the chat window's title bar and docked header, before its layout actions. */
const CHATPAD_CLEAR_ORDER = 0;

/** Where the action that switches the editor of the note shows: after Clear. */
const CHATPAD_NOTE_EDITOR_ORDER = 1;

registerAction2(class OpenChatpadAction extends Action2 {
	constructor() {
		super({
			id: OPEN_CHATPAD_COMMAND_ID,
			title: localize2('openChatpad', "Open Chatpad"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ChatpadAvailableContext,
		});
	}

	/** Shows the Chatpad in its chat window: its note above its chat, docked in the main window by default. */
	override async run(accessor: ServicesAccessor): Promise<void> {
		if (!accessor.get(IContextKeyService).contextMatchesRules(ChatpadAvailableContext)) {
			return;
		}
		const providersService = accessor.get(ISessionsProvidersService);
		const chatWindowService = accessor.get(IChatWindowService);
		const logService = accessor.get(ILogService);
		const notificationService = accessor.get(INotificationService);
		const storageService = accessor.get(IStorageService);

		const resolved = await resolveChatpad(providersService, logService);
		if (!resolved) {
			notifyUnavailable(notificationService);
			return;
		}
		await chatWindowService.open(CHATPAD_CHAT_WINDOW_KIND, getChatpadChatWindowContent(resolved.chatpad, storageService));
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
				id: Menus.ChatWindowTitleBar,
				group: 'navigation',
				order: CHATPAD_CLEAR_ORDER,
				when: ContextKeyExpr.and(ChatpadEnabledContext, ChatpadWindowContext),
			}, {
				id: Menus.ChatWindowTitle,
				group: 'navigation',
				order: CHATPAD_CLEAR_ORDER,
				when: ContextKeyExpr.and(ChatpadEnabledContext, ChatpadWindowContext),
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
		const storageService = accessor.get(IStorageService);

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
				return getChatpadChatWindowContent(chatpad, storageService);
			})());
		} catch (error) {
			logService.error('[Chatpad] Failed to clear the Chatpad', error);
			notificationService.error(localize('clearChatpad.failed', "Could not clear the Chatpad."));
		}
	}
});

const TOGGLE_CHATPAD_NOTE_EDITOR_COMMAND_ID = 'sessions.chatpad.toggleNoteEditor';
const ChatpadNoteAsTextContext = ChatWindowEditorViewTypeContext.isEqualTo(CHAT_WINDOW_TEXT_EDITOR);

registerAction2(class ToggleChatpadNoteEditorAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHATPAD_NOTE_EDITOR_COMMAND_ID,
			title: localize2('toggleChatpadNoteEditor', "Toggle Chatpad Note Between Text and Markdown Editor"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(ChatpadEnabledContext, ChatpadWindowContext),
		});
	}

	/** Shows the note as text, or back in the Markdown editor, and remembers the choice for when the Chatpad opens. */
	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatWindowService = accessor.get(IChatWindowService);
		const storageService = accessor.get(IStorageService);
		const window = chatWindowService.getActiveWindow();
		const editor = window?.kind.id === CHATPAD_CHAT_WINDOW_KIND.id ? window.content.get().editor : undefined;
		if (!window || !editor) {
			return;
		}
		const viewType = editor.viewType === CHAT_WINDOW_TEXT_EDITOR ? CHATPAD_NOTE_MARKDOWN_EDITOR : CHAT_WINDOW_TEXT_EDITOR;
		setChatpadNoteViewType(storageService, viewType);
		await window.setEditor({ ...editor, viewType });
	}
});

// What the button does, rather than a checked toggle, as Dock does: after Clear, in the title bar and the docked header.
for (const [asText, title, icon] of [
	[false, localize2('openChatpadNoteAsText', "Open Note as Text"), Codicon.file],
	[true, localize2('openChatpadNoteInMarkdownEditor', "Open Note in Markdown Editor"), Codicon.markdown],
] as const) {
	const when = asText ? ChatpadNoteAsTextContext : ChatpadNoteAsTextContext.negate();
	MenuRegistry.appendMenuItem(Menus.ChatWindowTitleBar, {
		command: { id: TOGGLE_CHATPAD_NOTE_EDITOR_COMMAND_ID, title, icon },
		group: 'navigation',
		order: CHATPAD_NOTE_EDITOR_ORDER,
		when: ContextKeyExpr.and(ChatpadEnabledContext, ChatpadWindowContext, when),
	});
	MenuRegistry.appendMenuItem(Menus.ChatWindowTitle, {
		command: { id: TOGGLE_CHATPAD_NOTE_EDITOR_COMMAND_ID, title, icon },
		group: 'navigation',
		order: CHATPAD_NOTE_EDITOR_ORDER,
		when: ContextKeyExpr.and(ChatpadEnabledContext, ChatpadWindowContext, when),
	});
}

registerAction2(class AppendToChatpadAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.appendToChatpad',
			title: localize2('appendToChatpad', "Append to Chatpad"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ChatpadAvailableContext,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		if (!accessor.get(IContextKeyService).contextMatchesRules(ChatpadAvailableContext)) {
			return;
		}
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
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		super();
		const wasOpen = this._storageService.getBoolean(CHATPAD_OPEN_STORAGE_KEY, StorageScope.WORKSPACE, false);
		// Not restored while the Chatpad is off or AI features are disabled, but kept for when it can be: nothing is saved over it until the Chatpad opens.
		let keepStored = wasOpen && (!configurationService.getValue<boolean>(CHATPAD_ENABLED_SETTING) || chatEntitlementService.sentiment.hidden);
		this._register(this._storageService.onWillSaveState(() => {
			const open = this._chatWindowService.windows.get().some(window => window.kind === CHATPAD_CHAT_WINDOW_KIND);
			if (keepStored && !open) {
				return;
			}
			keepStored = false;
			this._storageService.store(CHATPAD_OPEN_STORAGE_KEY, open, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}));
		if (wasOpen && !keepStored) {
			this._restore().catch(error => this._logService.error('[Chatpad] Failed to restore the Chatpad', error));
		}
	}

	private async _restore(): Promise<void> {
		await waitForState(this._sessionsService.initialRestoreComplete);
		const deadline = Date.now() + CHATPAD_RESTORE_TIMEOUT;
		while (Date.now() < deadline && !this._store.isDisposed) {
			if (this._contextKeyService.contextMatchesRules(ChatpadAvailableContext)) {
				const resolved = await resolveChatpad(this._providersService, this._logService);
				if (resolved) {
					if (!this._chatWindowService.windows.get().some(window => window.kind === CHATPAD_CHAT_WINDOW_KIND)) {
						await this._chatWindowService.open(CHATPAD_CHAT_WINDOW_KIND, getChatpadChatWindowContent(resolved.chatpad, this._storageService), { preserveFocus: true });
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
