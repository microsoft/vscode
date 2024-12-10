/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatAgentLocation, IChatAgentService } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { applyingChatEditsContextKey, IChatEditingService } from '../../common/chatEditingService.js';
import { chatAgentLeader, extractAgentAndCommand } from '../../common/chatParserTypes.js';
import { IChatService } from '../../common/chatService.js';
import { EditsViewId, IChatWidget, IChatWidgetService } from '../chat.js';
import { ChatViewPane } from '../chatViewPane.js';
import { CHAT_CATEGORY } from './chatActions.js';

export interface IVoiceChatExecuteActionContext {
	readonly disableTimeout?: boolean;
}

export interface IChatExecuteActionContext {
	widget?: IChatWidget;
	inputValue?: string;
	voice?: IVoiceChatExecuteActionContext;
}

abstract class SubmitAction extends Action2 {
	run(accessor: ServicesAccessor, ...args: any[]) {
		const context: IChatExecuteActionContext | undefined = args[0];

		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		widget?.acceptInput(context?.inputValue);
	}
}

export class ChatSubmitAction extends SubmitAction {
	static readonly ID = 'workbench.action.chat.submit';

	constructor() {
		super({
			id: ChatSubmitAction.ID,
			title: localize2('interactive.submit.label', "Send and Dispatch"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(ChatContextKeys.inputHasText, ChatContextKeys.requestInProgress.negate(), ChatContextKeys.location.notEqualsTo(ChatAgentLocation.EditingSession)),
			keybinding: {
				when: ChatContextKeys.inChatInput,
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.ChatExecuteSecondary,
					group: 'group_1',
					order: 1
				},
				{
					id: MenuId.ChatExecute,
					order: 4,
					when: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), ChatContextKeys.location.notEqualsTo(ChatAgentLocation.EditingSession)),
					group: 'navigation',
				},
			]
		});
	}
}

export class ChatEditingSessionSubmitAction extends SubmitAction {
	static readonly ID = 'workbench.action.edits.submit';

	constructor() {
		super({
			id: ChatEditingSessionSubmitAction.ID,
			title: localize2('edits.submit.label', "Send"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(ChatContextKeys.inputHasText, ChatContextKeys.requestInProgress.negate(), ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession), applyingChatEditsContextKey.toNegated()),
			keybinding: {
				when: ChatContextKeys.inChatInput,
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.ChatExecuteSecondary,
					group: 'group_1',
					when: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession), applyingChatEditsContextKey.toNegated()),
					order: 1
				},
				{
					id: MenuId.ChatExecute,
					order: 4,
					when: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession), applyingChatEditsContextKey.toNegated()),
					group: 'navigation',
				},
			]
		});
	}
}

class SubmitWithoutDispatchingAction extends Action2 {
	static readonly ID = 'workbench.action.chat.submitWithoutDispatching';

	constructor() {
		super({
			id: SubmitWithoutDispatchingAction.ID,
			title: localize2('interactive.submitWithoutDispatch.label', "Send"),
			f1: false,
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.inputHasText,
				ChatContextKeys.requestInProgress.negate(),
				ContextKeyExpr.and(ContextKeyExpr.or(
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Editor),
				))),
			keybinding: {
				when: ChatContextKeys.inChatInput,
				primary: KeyMod.Alt | KeyMod.Shift | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.ChatExecuteSecondary,
					group: 'group_1',
					order: 2
				} // need 'when'?
			]
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const context: IChatExecuteActionContext | undefined = args[0];

		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		widget?.acceptInput(context?.inputValue, { noCommandDetection: true });
	}
}

export const ChatModelPickerActionId = 'workbench.action.chat.pickModel';
MenuRegistry.appendMenuItem(MenuId.ChatExecute, {
	command: {
		id: ChatModelPickerActionId,
		title: localize2('chat.pickModel.label', "Pick Model"),
	},
	order: 3,
	group: 'navigation',
	when: ContextKeyExpr.and(
		ChatContextKeys.languageModelsAreUserSelectable,
		ContextKeyExpr.or(
			ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Panel),
			ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.EditingSession),
			ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Editor),
			ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Notebook),
			ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Terminal)
		)
	),
});

export class ChatSubmitSecondaryAgentAction extends Action2 {
	static readonly ID = 'workbench.action.chat.submitSecondaryAgent';

	constructor() {
		super({
			id: ChatSubmitSecondaryAgentAction.ID,
			title: localize2({ key: 'actions.chat.submitSecondaryAgent', comment: ['Send input from the chat input box to the secondary agent'] }, "Submit to Secondary Agent"),
			precondition: ContextKeyExpr.and(ChatContextKeys.inputHasText, ChatContextKeys.inputHasAgent.negate(), ChatContextKeys.requestInProgress.negate()),
			menu: {
				id: MenuId.ChatExecuteSecondary,
				group: 'group_1',
				order: 3,
				when: ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Panel)
			},
			keybinding: {
				when: ChatContextKeys.inChatInput,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const context: IChatExecuteActionContext | undefined = args[0];
		const agentService = accessor.get(IChatAgentService);
		const secondaryAgent = agentService.getSecondaryAgent();
		if (!secondaryAgent) {
			return;
		}

		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		if (extractAgentAndCommand(widget.parsedInput).agentPart) {
			widget.acceptInput();
		} else {
			widget.lastSelectedAgent = secondaryAgent;
			widget.acceptInputWithPrefix(`${chatAgentLeader}${secondaryAgent.name}`);
		}
	}
}

class SendToChatEditingAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.sendToChatEditing',
			title: localize2('chat.sendToChatEditing.label', "Send to Copilot Edits"),
			precondition: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), ChatContextKeys.inputHasAgent.negate(), ChatContextKeys.inputHasText),
			category: CHAT_CATEGORY,
			f1: false,
			menu: {
				id: MenuId.ChatExecuteSecondary,
				group: 'group_1',
				order: 4,
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					ChatContextKeys.editingParticipantRegistered,
					ChatContextKeys.location.notEqualsTo(ChatAgentLocation.EditingSession),
					ChatContextKeys.location.notEqualsTo(ChatAgentLocation.Editor)
				)
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter,
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					ChatContextKeys.editingParticipantRegistered,
					ChatContextKeys.location.notEqualsTo(ChatAgentLocation.EditingSession),
					ChatContextKeys.location.notEqualsTo(ChatAgentLocation.Editor),
				)
			}
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		if (!accessor.get(IChatAgentService).getDefaultAgent(ChatAgentLocation.EditingSession)) {
			return;
		}

		const context: IChatExecuteActionContext | undefined = args[0];

		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget || widget.viewModel?.model.initialLocation === ChatAgentLocation.EditingSession) {
			return;
		}

		const viewsService = accessor.get(IViewsService);
		const dialogService = accessor.get(IDialogService);
		const chatEditingService = accessor.get(IChatEditingService);

		const currentEditingSession = chatEditingService.currentEditingSessionObs.get();
		const currentEditCount = currentEditingSession?.entries.get().length;
		if (currentEditCount) {
			const result = await dialogService.confirm({
				title: localize('chat.startEditing.confirmation.title', "Start new editing session?"),
				message: currentEditCount === 1
					? localize('chat.startEditing.confirmation.message.one', "Starting a new editing session will end your current editing session containing {0} file. Do you wish to proceed?", currentEditCount)
					: localize('chat.startEditing.confirmation.message.many', "Starting a new editing session will end your current editing session containing {0} files. Do you wish to proceed?", currentEditCount),
				type: 'info',
				primaryButton: localize('chat.startEditing.confirmation.primaryButton', "Yes")
			});

			if (!result.confirmed) {
				return;
			}

			await currentEditingSession?.stop(true);
		}

		const { widget: editingWidget } = await viewsService.openView(EditsViewId) as ChatViewPane;
		for (const attachment of widget.attachmentModel.attachments) {
			if (attachment.isFile && URI.isUri(attachment.value)) {
				chatEditingService.currentEditingSessionObs.get()?.addFileToWorkingSet(attachment.value);
			} else {
				editingWidget.attachmentModel.addContext(attachment);
			}
		}

		editingWidget.setInput(widget.getInput());
		widget.setInput('');
		widget.attachmentModel.clear();
		editingWidget.acceptInput();
		editingWidget.focusInput();
	}
}

class SendToNewChatAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.sendToNewChat',
			title: localize2('chat.newChat.label', "Send to New Chat"),
			precondition: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), ChatContextKeys.inputHasText),
			category: CHAT_CATEGORY,
			f1: false,
			menu: {
				id: MenuId.ChatExecuteSecondary,
				group: 'group_2',
				when: ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Panel)

			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
				when: ChatContextKeys.inChatInput,
			}
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const context: IChatExecuteActionContext | undefined = args[0];

		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		widget.clear();
		widget.acceptInput(context?.inputValue);
	}
}

export class CancelAction extends Action2 {
	static readonly ID = 'workbench.action.chat.cancel';
	constructor() {
		super({
			id: CancelAction.ID,
			title: localize2('interactive.cancel.label', "Cancel"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.stopCircle,
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.or(ChatContextKeys.requestInProgress, ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession), applyingChatEditsContextKey)),
				order: 4,
				group: 'navigation',
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Escape,
				win: { primary: KeyMod.Alt | KeyCode.Backspace },
			}
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const context: IChatExecuteActionContext | undefined = args[0];

		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const chatService = accessor.get(IChatService);
		if (widget.viewModel) {
			chatService.cancelCurrentRequestForSession(widget.viewModel.sessionId);
		}

		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (currentEditingSession && currentEditingSession?.chatSessionId === widget.viewModel?.sessionId) {
			chatEditingService.currentAutoApplyOperation?.cancel();
		}
	}
}

export function registerChatExecuteActions() {
	registerAction2(ChatSubmitAction);
	registerAction2(ChatEditingSessionSubmitAction);
	registerAction2(SubmitWithoutDispatchingAction);
	registerAction2(CancelAction);
	registerAction2(SendToNewChatAction);
	registerAction2(ChatSubmitSecondaryAgentAction);
	registerAction2(SendToChatEditingAction);
}
