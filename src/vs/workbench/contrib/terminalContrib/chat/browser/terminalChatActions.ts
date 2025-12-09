/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ChatViewId, IChatWidgetService } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/chatContextKeys.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { LocalChatSessionUri } from '../../../chat/common/chatUri.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../chat/common/constants.js';
import { AbstractInline1ChatAction } from '../../../inlineChat/browser/inlineChatActions.js';
import { isDetachedTerminalInstance, ITerminalChatService, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { registerActiveXtermAction } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextMenuGroup } from '../../../terminal/browser/terminalMenus.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatCommandId, TerminalChatContextKeys } from './terminalChat.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { getIconId } from '../../../terminal/browser/terminalIcon.js';
import { TerminalChatController } from './terminalChatController.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { isString } from '../../../../../base/common/types.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IPreferencesService, IOpenSettingsOptions } from '../../../../services/preferences/common/preferences.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TerminalChatAgentToolsSettingId } from '../../chatAgentTools/common/terminalChatAgentToolsConfiguration.js';

registerActiveXtermAction({
	id: TerminalChatCommandId.Start,
	title: localize2('startChat', 'Open Inline Chat'),
	category: localize2('terminalCategory', "Terminal"),
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.KeyI,
		when: ContextKeyExpr.and(TerminalContextKeys.focusInAny),
		// HACK: Force weight to be higher than the extension contributed keybinding to override it until it gets replaced
		weight: KeybindingWeight.ExternalExtension + 1, // KeybindingWeight.WorkbenchContrib,
	},
	f1: true,
	precondition: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.hasChatAgent
	),
	menu: {
		id: MenuId.TerminalInstanceContext,
		group: TerminalContextMenuGroup.Chat,
		order: 2,
		when: ChatContextKeys.enabled
	},
	run: (_xterm, _accessor, activeInstance, opts?: unknown) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}

		const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
		if (!contr) {
			return;
		}

		if (opts) {
			function isValidOptionsObject(obj: unknown): obj is { query: string; isPartialQuery?: boolean } {
				return typeof obj === 'object' && obj !== null && 'query' in obj && isString(obj.query);
			}
			opts = isString(opts) ? { query: opts } : opts;
			if (isValidOptionsObject(opts)) {
				contr.updateInput(opts.query, false);
				if (!opts.isPartialQuery) {
					contr.terminalChatWidget?.acceptInput();
				}
			}

		}

		contr.terminalChatWidget?.reveal();
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.Close,
	title: localize2('closeChat', 'Close'),
	category: AbstractInline1ChatAction.category,
	keybinding: {
		primary: KeyCode.Escape,
		when: ContextKeyExpr.and(
			ContextKeyExpr.or(TerminalContextKeys.focus, TerminalChatContextKeys.focused),
			TerminalChatContextKeys.visible
		),
		weight: KeybindingWeight.WorkbenchContrib,
	},
	menu: [{
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 2,
	}],
	icon: Codicon.close,
	f1: true,
	precondition: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		TerminalChatContextKeys.visible,
	),
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
		contr?.terminalChatWidget?.clear();
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.RunCommand,
	title: localize2('runCommand', 'Run Chat Command'),
	shortTitle: localize2('run', 'Run'),
	category: AbstractInline1ChatAction.category,
	precondition: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.requestActive.negate(),
		TerminalChatContextKeys.responseContainsCodeBlock,
		TerminalChatContextKeys.responseContainsMultipleCodeBlocks.negate()
	),
	icon: Codicon.play,
	keybinding: {
		when: TerminalChatContextKeys.requestActive.negate(),
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.CtrlCmd | KeyCode.Enter,
	},
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 0,
		when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsCodeBlock, TerminalChatContextKeys.responseContainsMultipleCodeBlocks.negate(), TerminalChatContextKeys.requestActive.negate())
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
		contr?.terminalChatWidget?.acceptCommand(true);
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.RunFirstCommand,
	title: localize2('runFirstCommand', 'Run First Chat Command'),
	shortTitle: localize2('runFirst', 'Run First'),
	category: AbstractInline1ChatAction.category,
	precondition: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.requestActive.negate(),
		TerminalChatContextKeys.responseContainsMultipleCodeBlocks
	),
	icon: Codicon.play,
	keybinding: {
		when: TerminalChatContextKeys.requestActive.negate(),
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.CtrlCmd | KeyCode.Enter,
	},
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 0,
		when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsMultipleCodeBlocks, TerminalChatContextKeys.requestActive.negate())
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
		contr?.terminalChatWidget?.acceptCommand(true);
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.InsertCommand,
	title: localize2('insertCommand', 'Insert Chat Command'),
	shortTitle: localize2('insert', 'Insert'),
	category: AbstractInline1ChatAction.category,
	icon: Codicon.insert,
	precondition: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.requestActive.negate(),
		TerminalChatContextKeys.responseContainsCodeBlock,
		TerminalChatContextKeys.responseContainsMultipleCodeBlocks.negate()
	),
	keybinding: {
		when: TerminalChatContextKeys.requestActive.negate(),
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.Alt | KeyCode.Enter,
		secondary: [KeyMod.CtrlCmd | KeyCode.Enter | KeyMod.Alt]
	},
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 1,
		when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsCodeBlock, TerminalChatContextKeys.responseContainsMultipleCodeBlocks.negate(), TerminalChatContextKeys.requestActive.negate())
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
		contr?.terminalChatWidget?.acceptCommand(false);
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.InsertFirstCommand,
	title: localize2('insertFirstCommand', 'Insert First Chat Command'),
	shortTitle: localize2('insertFirst', 'Insert First'),
	category: AbstractInline1ChatAction.category,
	precondition: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.requestActive.negate(),
		TerminalChatContextKeys.responseContainsMultipleCodeBlocks
	),
	keybinding: {
		when: TerminalChatContextKeys.requestActive.negate(),
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.Alt | KeyCode.Enter,
		secondary: [KeyMod.CtrlCmd | KeyCode.Enter | KeyMod.Alt]
	},
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 1,
		when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsMultipleCodeBlocks, TerminalChatContextKeys.requestActive.negate())
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
		contr?.terminalChatWidget?.acceptCommand(false);
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.RerunRequest,
	title: localize2('chat.rerun.label', "Rerun Request"),
	f1: false,
	icon: Codicon.refresh,
	category: AbstractInline1ChatAction.category,
	precondition: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.requestActive.negate(),
	),
	keybinding: {
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.CtrlCmd | KeyCode.KeyR,
		when: TerminalChatContextKeys.focused
	},
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 5,
		when: ContextKeyExpr.and(TerminalChatContextKeys.inputHasText.toNegated(), TerminalChatContextKeys.requestActive.negate())
	},
	run: async (_xterm, _accessor, activeInstance) => {
		const chatService = _accessor.get(IChatService);
		const chatWidgetService = _accessor.get(IChatWidgetService);
		const contr = TerminalChatController.activeChatController;
		const model = contr?.terminalChatWidget?.inlineChatWidget.chatWidget.viewModel?.model;
		if (!model) {
			return;
		}

		const lastRequest = model.getRequests().at(-1);
		if (lastRequest) {
			const widget = chatWidgetService.getWidgetBySessionResource(model.sessionResource);
			await chatService.resendRequest(lastRequest, {
				noCommandDetection: false,
				attempt: lastRequest.attempt + 1,
				location: ChatAgentLocation.Terminal,
				userSelectedModelId: widget?.input.currentLanguageModel
			});
		}
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.ViewInChat,
	title: localize2('viewInChat', 'View in Chat'),
	category: AbstractInline1ChatAction.category,
	precondition: ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.requestActive.negate(),
	),
	icon: Codicon.chatSparkle,
	menu: [{
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: 'zzz',
		order: 1,
		isHiddenByDefault: true,
		when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsCodeBlock, TerminalChatContextKeys.requestActive.negate()),
	}],
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
		contr?.viewInChat();
	}
});

registerAction2(class ShowChatTerminalsAction extends Action2 {
	constructor() {
		super({
			id: TerminalChatCommandId.ViewHiddenChatTerminals,
			title: localize2('viewHiddenChatTerminals', 'View Hidden Chat Terminals'),
			category: localize2('terminalCategory2', 'Terminal'),
			f1: true,
			precondition: ContextKeyExpr.and(TerminalChatContextKeys.hasHiddenChatTerminals, ChatContextKeys.enabled),
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(TerminalChatContextKeys.hasHiddenChatTerminals, ContextKeyExpr.equals('view', ChatViewId)),
				group: 'terminal',
				order: 0,
				isHiddenByDefault: true
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		const terminalService = accessor.get(ITerminalService);
		const groupService = accessor.get(ITerminalGroupService);
		const editorService = accessor.get(ITerminalEditorService);
		const terminalChatService = accessor.get(ITerminalChatService);
		const quickInputService = accessor.get(IQuickInputService);
		const instantiationService = accessor.get(IInstantiationService);
		const chatService = accessor.get(IChatService);

		const visible = new Set<ITerminalInstance>([...groupService.instances, ...editorService.instances]);
		const toolInstances = terminalChatService.getToolSessionTerminalInstances();

		if (toolInstances.length === 0) {
			return;
		}

		const all = new Map<number, ITerminalInstance>();

		for (const i of toolInstances) {
			if (!visible.has(i)) {
				all.set(i.instanceId, i);
			}
		}

		const items: IQuickPickItem[] = [];
		interface IItemMeta {
			label: string;
			description: string | undefined;
			detail: string | undefined;
			id: string;
		}
		const lastCommandLocalized = (command: string) => localize2('chatTerminal.lastCommand', 'Last: {0}', command).value;

		const metas: IItemMeta[] = [];
		for (const instance of all.values()) {
			const iconId = instantiationService.invokeFunction(getIconId, instance);
			const label = `$(${iconId}) ${instance.title}`;
			const lastCommand = instance.capabilities.get(TerminalCapability.CommandDetection)?.commands.at(-1)?.command;

			// Get the chat session title
			const chatSessionId = terminalChatService.getChatSessionIdForInstance(instance);
			let chatSessionTitle: string | undefined;
			if (chatSessionId) {
				const sessionUri = LocalChatSessionUri.forSession(chatSessionId);
				// Try to get title from active session first, then fall back to persisted title
				chatSessionTitle = chatService.getSession(sessionUri)?.title || chatService.getPersistedSessionTitle(sessionUri);
			}

			let description: string | undefined;
			if (chatSessionTitle) {
				description = `${chatSessionTitle}`;
			}

			metas.push({
				label,
				description,
				detail: lastCommand ? lastCommandLocalized(lastCommand) : undefined,
				id: String(instance.instanceId),
			});
		}

		for (const m of metas) {
			items.push({
				label: m.label,
				description: m.description,
				detail: m.detail,
				id: m.id
			});
		}

		const qp = quickInputService.createQuickPick<IQuickPickItem>();
		qp.placeholder = localize2('selectChatTerminal', 'Select a chat terminal to show and focus').value;
		qp.items = items;
		qp.canSelectMany = false;
		qp.title = localize2('showChatTerminals.title', 'Chat Terminals').value;
		qp.matchOnDescription = true;
		qp.matchOnDetail = true;
		const qpDisposables = new DisposableStore();
		qpDisposables.add(qp);
		qpDisposables.add(qp.onDidAccept(async () => {
			const sel = qp.selectedItems[0];
			if (sel) {
				const instance = all.get(Number(sel.id));
				if (instance) {
					terminalService.setActiveInstance(instance);
					await terminalService.revealTerminal(instance);
					qp.hide();
					terminalService.focusInstance(instance);
				} else {
					qp.hide();
				}
			} else {
				qp.hide();
			}
		}));
		qpDisposables.add(qp.onDidHide(() => {
			qpDisposables.dispose();
			qp.dispose();
		}));
		qp.show();
	}
});



KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: TerminalChatCommandId.FocusMostRecentChatTerminal,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ChatContextKeys.inChatSession,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyT,
	handler: async (accessor: ServicesAccessor) => {
		const terminalChatService = accessor.get(ITerminalChatService);
		const part = terminalChatService.getMostRecentProgressPart();
		if (!part) {
			return;
		}
		await part.focusTerminal();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: TerminalChatCommandId.FocusMostRecentChatTerminalOutput,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ChatContextKeys.inChatSession,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyO,
	handler: async (accessor: ServicesAccessor) => {
		const terminalChatService = accessor.get(ITerminalChatService);
		const part = terminalChatService.getMostRecentProgressPart();
		if (!part) {
			return;
		}
		await part.toggleOutputFromKeyboard();
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: TerminalChatCommandId.FocusMostRecentChatTerminal,
		title: localize('chat.focusMostRecentTerminal', 'Chat: Focus Most Recent Terminal'),
	},
	when: ChatContextKeys.inChatSession
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: TerminalChatCommandId.FocusMostRecentChatTerminalOutput,
		title: localize('chat.focusMostRecentTerminalOutput', 'Chat: Focus Most Recent Terminal Output'),
	},
	when: ChatContextKeys.inChatSession
});


CommandsRegistry.registerCommand(TerminalChatCommandId.OpenTerminalSettingsLink, async (accessor, scopeRaw: string) => {
	const preferencesService = accessor.get(IPreferencesService);

	if (scopeRaw === 'global') {
		preferencesService.openSettings({
			query: `@id:${ChatConfiguration.GlobalAutoApprove}`
		});
	} else {
		const scope = parseInt(scopeRaw);
		const target = !isNaN(scope) ? scope as ConfigurationTarget : undefined;
		const options: IOpenSettingsOptions = {
			jsonEditor: true,
			revealSetting: {
				key: TerminalChatAgentToolsSettingId.AutoApprove,
			}
		};
		switch (target) {
			case ConfigurationTarget.APPLICATION: preferencesService.openApplicationSettings(options); break;
			case ConfigurationTarget.USER:
			case ConfigurationTarget.USER_LOCAL: preferencesService.openUserSettings(options); break;
			case ConfigurationTarget.USER_REMOTE: preferencesService.openRemoteSettings(options); break;
			case ConfigurationTarget.WORKSPACE:
			case ConfigurationTarget.WORKSPACE_FOLDER: preferencesService.openWorkspaceSettings(options); break;
			default: {
				// Fallback if something goes wrong
				preferencesService.openSettings({
					target: ConfigurationTarget.USER,
					query: `@id:${TerminalChatAgentToolsSettingId.AutoApprove}`,
				});
				break;
			}
		}

	}
});

CommandsRegistry.registerCommand(TerminalChatCommandId.DisableSessionAutoApproval, async (accessor, chatSessionId: string) => {
	const terminalChatService = accessor.get(ITerminalChatService);
	terminalChatService.setChatSessionAutoApproval(chatSessionId, false);
});
