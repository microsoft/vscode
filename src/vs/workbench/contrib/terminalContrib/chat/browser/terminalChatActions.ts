/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/chatContextKeys.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { AbstractInline1ChatAction } from '../../../inlineChat/browser/inlineChatActions.js';
import { isDetachedTerminalInstance, ITerminalChatService, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { registerActiveXtermAction } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextMenuGroup } from '../../../terminal/browser/terminalMenus.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { MENU_TERMINAL_CHAT_WIDGET_STATUS, MENU_TERMINAL_CHAT_WIDGET_TOOLBAR, TerminalChatCommandId, TerminalChatContextKeys } from './terminalChat.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { getIconId } from '../../../terminal/browser/terminalIcon.js';
import { TerminalChatController } from './terminalChatController.js';

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

		if (opts) {
			opts = typeof opts === 'string' ? { query: opts } : opts;
			if (typeof opts === 'object' && opts !== null && 'query' in opts && typeof opts.query === 'string') {
				contr?.updateInput(opts.query, false);
				if (!('isPartialQuery' in opts && opts.isPartialQuery)) {
					contr?.terminalChatWidget?.acceptInput();
				}
			}

		}

		contr?.terminalChatWidget?.reveal();
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
			const widget = chatWidgetService.getWidgetBySessionId(model.sessionId);
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

registerAction2(class ShowHiddenOrToolTerminalsAction extends Action2 {
	constructor() {
		super({
			id: TerminalChatCommandId.ShowHiddenOrToolTerminals,
			title: localize2('showHiddenOrToolTerminals', 'Show Hidden/Tool Terminals'),
			// TODO: FIXED eslint-disable-next-line local/code-no-unexternalized-strings
			category: localize2('terminalCategory2', 'Terminal'),
			f1: true,
			menu: [{
				id: MENU_TERMINAL_CHAT_WIDGET_TOOLBAR,
				group: 'overflow',
				order: 50,
				when: TerminalContextKeys.terminalHasHidden
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

		const visible = new Set<ITerminalInstance>([...groupService.instances, ...editorService.instances]);
		const backgrounded = terminalService.instances.filter(i => !visible.has(i));
		const toolInstances = new Set(terminalChatService.getToolSessionTerminalInstances());

		const all = new Map<number, { instance: ITerminalInstance; isBackground: boolean; isTool: boolean }>();
		for (const i of backgrounded) {
			all.set(i.instanceId, { instance: i, isBackground: true, isTool: toolInstances.has(i) });
		}
		for (const i of toolInstances) {
			if (all.has(i.instanceId)) {
				all.get(i.instanceId)!.isTool = true;
			} else {
				all.set(i.instanceId, { instance: i, isBackground: !visible.has(i), isTool: true });
			}
		}

		if (all.size === 0) {
			return;
		}

		const items: IQuickPickItem[] = [];
		for (const { instance, isBackground, isTool } of all.values()) {
			const iconId = instantiationService.invokeFunction(getIconId, instance);
			const prefix: string[] = [];
			if (isTool) {
				prefix.push('wrench');
			}
			if (isBackground) {
				prefix.push('eye-closed');
			}
			const labelPrefix = prefix.length ? prefix.map(p => `$(${p})`).join(' ') + ' ' : '';
			items.push({
				label: `${labelPrefix}$(${iconId}) ${instance.title}`,
				description: isTool && isBackground ? localize2('terminalHiddenToolDesc', 'Tool Session • Hidden').value : isTool ? localize2('terminalToolDesc', 'Tool Session').value : localize2('terminalHiddenDesc', 'Hidden').value,
				id: String(instance.instanceId)
			});
		}

		const qp = quickInputService.createQuickPick<IQuickPickItem>();
		qp.items = items.sort((a, b) => a.label.localeCompare(b.label));
		qp.canSelectMany = false;
		qp.title = localize2('showHiddenOrToolTerms.title', 'Hidden / Tool Terminals').value;
		qp.matchOnDescription = true;
		qp.onDidAccept(() => {
			const sel = qp.selectedItems[0];
			if (sel) {
				const target = all.get(Number(sel.id));
				if (target) {
					if (target.isBackground) {
						terminalService.showBackgroundTerminal(target.instance);
					} else {
						terminalService.focusInstance(target.instance);
					}
				}
			}
			qp.hide();
		});
		qp.onDidHide(() => qp.dispose());
		qp.show();
	}
});
