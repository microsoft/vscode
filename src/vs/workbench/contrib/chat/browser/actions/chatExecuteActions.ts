/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { chatVariableLeader } from '../../common/chatParserTypes.js';
import { IChatService } from '../../common/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatMode, validateChatMode } from '../../common/constants.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { getEditingSessionContext } from '../chatEditing/chatEditingActions.js';
import { CHAT_CATEGORY, handleCurrentEditingSession } from './chatActions.js';
import { ACTION_ID_NEW_CHAT, waitForChatSessionCleared } from './chatClearActions.js';

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

const whenNotInProgressOrPaused = ContextKeyExpr.or(ChatContextKeys.isRequestPaused, ChatContextKeys.requestInProgress.negate());

export class ChatSubmitAction extends SubmitAction {
	static readonly ID = 'workbench.action.chat.submit';

	constructor() {
		const precondition = ChatContextKeys.chatMode.isEqualTo(ChatMode.Ask);

		super({
			id: ChatSubmitAction.ID,
			title: localize2('interactive.submit.label', "Send and Dispatch"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.send,
			precondition,
			keybinding: {
				when: ChatContextKeys.inChatInput,
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.ChatExecuteSecondary,
					group: 'group_1',
					order: 1,
					when: precondition
				},
				{
					id: MenuId.ChatExecute,
					order: 4,
					when: ContextKeyExpr.and(
						whenNotInProgressOrPaused,
						precondition,
					),
					group: 'navigation',
				},
			]
		});
	}
}

export const ToggleAgentModeActionId = 'workbench.action.chat.toggleAgentMode';

export interface IToggleChatModeArgs {
	mode: ChatMode;
}

class ToggleChatModeAction extends Action2 {

	static readonly ID = ToggleAgentModeActionId;

	constructor() {
		super({
			id: ToggleChatModeAction.ID,
			title: localize2('interactive.toggleAgent.label', "Set Chat Mode"),
			f1: true,
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.requestInProgress.negate()),
			tooltip: localize('setChatMode', "Set Mode"),
			keybinding: {
				when: ContextKeyExpr.and(
					ChatContextKeys.inChatInput,
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel)),
				primary: KeyMod.CtrlCmd | KeyCode.Period,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.ChatExecute,
					order: 1,
					when: ContextKeyExpr.and(
						ChatContextKeys.enabled,
						ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel),
						ChatContextKeys.inQuickChat.negate(),
					),
					group: 'navigation',
				},
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const commandService = accessor.get(ICommandService);
		const configurationService = accessor.get(IConfigurationService);
		const dialogService = accessor.get(IDialogService);

		const context = getEditingSessionContext(accessor, args);
		if (!context?.chatWidget) {
			return;
		}

		const arg = args.at(0) as IToggleChatModeArgs | undefined;
		const chatSession = context.chatWidget.viewModel?.model;
		const requestCount = chatSession?.getRequests().length ?? 0;
		const switchToMode = validateChatMode(arg?.mode) ?? this.getNextMode(context.chatWidget, requestCount, configurationService);
		const needToClearEdits = (!configurationService.getValue(ChatConfiguration.Edits2Enabled) && (context.chatWidget.input.currentMode === ChatMode.Edit || switchToMode === ChatMode.Edit)) && requestCount > 0;

		if (switchToMode === context.chatWidget.input.currentMode) {
			return;
		}

		if (needToClearEdits) {
			// If not using edits2 and switching into or out of edit mode, ask to discard the session
			const phrase = localize('switchMode.confirmPhrase', "Switching chat modes will end your current edit session.");
			if (!context.editingSession) {
				return;
			}

			const currentEdits = context.editingSession.entries.get();
			const undecidedEdits = currentEdits.filter((edit) => edit.state.get() === ModifiedFileEntryState.Modified);
			if (undecidedEdits.length > 0) {
				if (!await handleCurrentEditingSession(context.editingSession, phrase, dialogService)) {
					return;
				}
			} else {
				const confirmation = await dialogService.confirm({
					title: localize('agent.newSession', "Start new session?"),
					message: localize('agent.newSessionMessage', "Changing the chat mode will end your current edit session. Would you like to change the chat mode?"),
					primaryButton: localize('agent.newSession.confirm', "Yes"),
					type: 'info'
				});
				if (!confirmation.confirmed) {
					return;
				}
			}
		}

		context.chatWidget.input.setChatMode(switchToMode);

		if (needToClearEdits) {
			await commandService.executeCommand(ACTION_ID_NEW_CHAT);
		}
	}

	private getNextMode(chatWidget: IChatWidget, requestCount: number, configurationService: IConfigurationService): ChatMode {
		const modes = [ChatMode.Ask];
		if (configurationService.getValue(ChatConfiguration.Edits2Enabled) || requestCount === 0) {
			modes.push(ChatMode.Edit);
		}
		modes.push(ChatMode.Agent);

		const modeIndex = modes.indexOf(chatWidget.input.currentMode);
		const newMode = modes[(modeIndex + 1) % modes.length];
		return newMode;
	}
}

export const ToggleRequestPausedActionId = 'workbench.action.chat.toggleRequestPaused';
export class ToggleRequestPausedAction extends Action2 {
	static readonly ID = ToggleRequestPausedActionId;

	constructor() {
		super({
			id: ToggleRequestPausedAction.ID,
			title: localize2('interactive.toggleRequestPausd.label', "Toggle Request Paused"),
			category: CHAT_CATEGORY,
			icon: Codicon.debugPause,
			toggled: {
				condition: ChatContextKeys.isRequestPaused,
				icon: Codicon.play,
				tooltip: localize('requestIsPaused', "Resume Request"),
			},
			tooltip: localize('requestNotPaused', "Pause Request"),
			menu: [
				{
					id: MenuId.ChatExecute,
					order: 3.5,
					when: ContextKeyExpr.and(
						ChatContextKeys.canRequestBePaused,
						ChatContextKeys.chatMode.isEqualTo(ChatMode.Agent),
						ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel),
						ContextKeyExpr.or(ChatContextKeys.isRequestPaused.negate(), ChatContextKeys.inputHasText.negate()),
					),
					group: 'navigation',
				},
			]
		});
	}

	override run(accessor: ServicesAccessor, ...args: any[]): void {
		const context: IChatExecuteActionContext | undefined = args[0];
		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		widget?.togglePaused();
	}
}

class SwitchToNextModelAction extends Action2 {
	static readonly ID = 'workbench.action.chat.switchToNextModel';

	constructor() {
		super({
			id: SwitchToNextModelAction.ID,
			title: localize2('interactive.switchToNextModel.label', "Switch to Next Model"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}

	override run(accessor: ServicesAccessor, ...args: any[]): void {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		widget?.input.switchToNextModel();
	}
}

export const ChatOpenModelPickerActionId = 'workbench.action.chat.openModelPicker';
class OpenModelPickerAction extends Action2 {
	static readonly ID = ChatOpenModelPickerActionId;

	constructor() {
		super({
			id: OpenModelPickerAction.ID,
			title: localize2('interactive.openModelPicker.label', "Open Model Picker"),
			category: CHAT_CATEGORY,
			f1: true,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Period,
				weight: KeybindingWeight.WorkbenchContrib,
				when: ChatContextKeys.inChatInput
			},
			precondition: ChatContextKeys.enabled,
			menu: {
				id: MenuId.ChatExecute,
				order: 3,
				group: 'navigation',
				when: ContextKeyExpr.and(
					ChatContextKeys.languageModelsAreUserSelectable,
					ContextKeyExpr.or(
						ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Panel),
						ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Editor),
						ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Notebook),
						ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Terminal)
					)
				),
			}
		});
	}

	override run(accessor: ServicesAccessor, ...args: any[]): void {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (widget) {
			widget.input.openModelPicker();
		}
	}
}

export class ChatEditingSessionSubmitAction extends SubmitAction {
	static readonly ID = 'workbench.action.edits.submit';

	constructor() {
		const precondition = ChatContextKeys.chatMode.notEqualsTo(ChatMode.Ask);

		super({
			id: ChatEditingSessionSubmitAction.ID,
			title: localize2('edits.submit.label', "Send"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.send,
			precondition,
			keybinding: {
				when: ChatContextKeys.inChatInput,
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.ChatExecuteSecondary,
					group: 'group_1',
					when: ContextKeyExpr.and(whenNotInProgressOrPaused, precondition),
					order: 1
				},
				{
					id: MenuId.ChatExecute,
					order: 4,
					when: ContextKeyExpr.and(
						ContextKeyExpr.or(
							ContextKeyExpr.and(ChatContextKeys.isRequestPaused, ChatContextKeys.inputHasText),
							ChatContextKeys.requestInProgress.negate(),
						),
						precondition),
					group: 'navigation',
				},
			]
		});
	}
}

class SubmitWithoutDispatchingAction extends Action2 {
	static readonly ID = 'workbench.action.chat.submitWithoutDispatching';

	constructor() {
		const precondition = ContextKeyExpr.and(
			// if the input has prompt instructions attached, allow submitting requests even
			// without text present - having instructions is enough context for a request
			ContextKeyExpr.or(ChatContextKeys.inputHasText, ChatContextKeys.hasPromptFile),
			whenNotInProgressOrPaused,
			ChatContextKeys.chatMode.isEqualTo(ChatMode.Ask),
		);

		super({
			id: SubmitWithoutDispatchingAction.ID,
			title: localize2('interactive.submitWithoutDispatch.label', "Send"),
			f1: false,
			category: CHAT_CATEGORY,
			precondition,
			keybinding: {
				when: ChatContextKeys.inChatInput,
				primary: KeyMod.Alt | KeyMod.Shift | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.ChatExecuteSecondary,
					group: 'group_1',
					order: 2,
					when: ChatContextKeys.chatMode.isEqualTo(ChatMode.Ask),
				}
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

export class ChatSubmitWithCodebaseAction extends Action2 {
	static readonly ID = 'workbench.action.chat.submitWithCodebase';

	constructor() {
		const precondition = ContextKeyExpr.and(
			// if the input has prompt instructions attached, allow submitting requests even
			// without text present - having instructions is enough context for a request
			ContextKeyExpr.or(ChatContextKeys.inputHasText, ChatContextKeys.hasPromptFile),
			whenNotInProgressOrPaused,
		);

		super({
			id: ChatSubmitWithCodebaseAction.ID,
			title: localize2('actions.chat.submitWithCodebase', "Send with {0}", `${chatVariableLeader}codebase`),
			precondition,
			menu: {
				id: MenuId.ChatExecuteSecondary,
				group: 'group_1',
				order: 3,
				when: ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Panel),
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

		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const languageModelToolsService = accessor.get(ILanguageModelToolsService);
		const codebaseTool = languageModelToolsService.getToolByName('codebase');
		if (!codebaseTool) {
			return;
		}

		widget.input.attachmentModel.addContext({
			id: codebaseTool.id,
			name: codebaseTool.displayName ?? '',
			fullName: codebaseTool.displayName ?? '',
			value: undefined,
			icon: ThemeIcon.isThemeIcon(codebaseTool.icon) ? codebaseTool.icon : undefined,
			kind: 'tool'
		});
		widget.acceptInput();
	}
}

class SendToNewChatAction extends Action2 {
	constructor() {
		const precondition = ContextKeyExpr.and(
			// if the input has prompt instructions attached, allow submitting requests even
			// without text present - having instructions is enough context for a request
			ContextKeyExpr.or(ChatContextKeys.inputHasText, ChatContextKeys.hasPromptFile),
			whenNotInProgressOrPaused,
		);

		super({
			id: 'workbench.action.chat.sendToNewChat',
			title: localize2('chat.newChat.label', "Send to New Chat"),
			precondition,
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
		const chatService = accessor.get(IChatService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		widget.clear();
		if (widget.viewModel) {
			await waitForChatSessionCleared(widget.viewModel.sessionId, chatService);
		}
		widget.acceptInput(context?.inputValue);
	}
}

export const CancelChatActionId = 'workbench.action.chat.cancel';
export class CancelAction extends Action2 {
	static readonly ID = CancelChatActionId;
	constructor() {
		super({
			id: CancelAction.ID,
			title: localize2('interactive.cancel.label', "Cancel"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.stopCircle,
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(ChatContextKeys.isRequestPaused.negate(), ChatContextKeys.requestInProgress),
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
	}
}

export function registerChatExecuteActions() {
	registerAction2(ChatSubmitAction);
	registerAction2(ChatEditingSessionSubmitAction);
	registerAction2(SubmitWithoutDispatchingAction);
	registerAction2(CancelAction);
	registerAction2(SendToNewChatAction);
	registerAction2(ChatSubmitWithCodebaseAction);
	registerAction2(ToggleChatModeAction);
	registerAction2(ToggleRequestPausedAction);
	registerAction2(SwitchToNextModelAction);
	registerAction2(OpenModelPickerAction);
}
