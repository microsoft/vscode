/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../../../base/common/resources.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IChatAgentService, IChatAgentHistoryEntry } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { toChatHistoryContent } from '../../common/chatModel.js';
import { ChatMode2, IChatMode, validateChatMode2 } from '../../common/chatModes.js';
import { chatVariableLeader } from '../../common/chatParserTypes.js';
import { IChatService } from '../../common/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatMode, } from '../../common/constants.js';
import { ILanguageModelChatMetadata } from '../../common/languageModels.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { getEditingSessionContext } from '../chatEditing/chatEditingActions.js';
import { ACTION_ID_NEW_CHAT, CHAT_CATEGORY, handleCurrentEditingSession, handleModeSwitch } from './chatActions.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { IRemoteCodingAgentsService } from '../../../remoteCodingAgents/common/remoteCodingAgentsService.js';

export interface IVoiceChatExecuteActionContext {
	readonly disableTimeout?: boolean;
}

export interface IChatExecuteActionContext {
	widget?: IChatWidget;
	inputValue?: string;
	voice?: IVoiceChatExecuteActionContext;
}

abstract class SubmitAction extends Action2 {
	async run(accessor: ServicesAccessor, ...args: any[]) {
		const context: IChatExecuteActionContext | undefined = args[0];

		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (widget?.viewModel?.editing) {
			const configurationService = accessor.get(IConfigurationService);
			const dialogService = accessor.get(IDialogService);
			const chatService = accessor.get(IChatService);
			const chatModel = chatService.getSession(widget.viewModel.sessionId);
			if (!chatModel) {
				return;
			}

			const session = chatModel.editingSession;
			if (!session) {
				return;
			}

			const requestId = widget.viewModel?.editing.id;

			if (requestId) {
				const chatRequests = chatModel.getRequests();
				const itemIndex = chatRequests.findIndex(request => request.id === requestId);
				const editsToUndo = chatRequests.length - itemIndex;

				const requestsToRemove = chatRequests.slice(itemIndex);
				const requestIdsToRemove = new Set(requestsToRemove.map(request => request.id));
				const entriesModifiedInRequestsToRemove = session.entries.get().filter((entry) => requestIdsToRemove.has(entry.lastModifyingRequestId)) ?? [];
				const shouldPrompt = entriesModifiedInRequestsToRemove.length > 0 && configurationService.getValue('chat.editing.confirmEditRequestRemoval') === true;

				let message: string;
				if (editsToUndo === 1) {
					if (entriesModifiedInRequestsToRemove.length === 1) {
						message = localize('chat.removeLast.confirmation.message2', "This will remove your last request and undo the edits made to {0}. Do you want to proceed?", basename(entriesModifiedInRequestsToRemove[0].modifiedURI));
					} else {
						message = localize('chat.removeLast.confirmation.multipleEdits.message', "This will remove your last request and undo edits made to {0} files in your working set. Do you want to proceed?", entriesModifiedInRequestsToRemove.length);
					}
				} else {
					if (entriesModifiedInRequestsToRemove.length === 1) {
						message = localize('chat.remove.confirmation.message2', "This will remove all subsequent requests and undo edits made to {0}. Do you want to proceed?", basename(entriesModifiedInRequestsToRemove[0].modifiedURI));
					} else {
						message = localize('chat.remove.confirmation.multipleEdits.message', "This will remove all subsequent requests and undo edits made to {0} files in your working set. Do you want to proceed?", entriesModifiedInRequestsToRemove.length);
					}
				}

				const confirmation = shouldPrompt
					? await dialogService.confirm({
						title: editsToUndo === 1
							? localize('chat.removeLast.confirmation.title', "Do you want to undo your last edit?")
							: localize('chat.remove.confirmation.title', "Do you want to undo {0} edits?", editsToUndo),
						message: message,
						primaryButton: localize('chat.remove.confirmation.primaryButton', "Yes"),
						checkbox: { label: localize('chat.remove.confirmation.checkbox', "Don't ask again"), checked: false },
						type: 'info'
					})
					: { confirmed: true };

				if (!confirmation.confirmed) {
					return;
				}

				if (confirmation.checkboxChecked) {
					await configurationService.updateValue('chat.editing.confirmEditRequestRemoval', false);
				}

				// Restore the snapshot to what it was before the request(s) that we deleted
				const snapshotRequestId = chatRequests[itemIndex].id;
				await session.restoreSnapshot(snapshotRequestId, undefined);
			}
		}
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
				}]
		});
	}
}

export const ToggleAgentModeActionId = 'workbench.action.chat.toggleAgentMode';

export interface IToggleChatModeArgs {
	mode: IChatMode | ChatMode;
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
					id: MenuId.ChatInput,
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
		const instaService = accessor.get(IInstantiationService);

		const context = getEditingSessionContext(accessor, args);
		if (!context?.chatWidget) {
			return;
		}

		const arg = args.at(0) as IToggleChatModeArgs | undefined;
		const chatSession = context.chatWidget.viewModel?.model;
		const requestCount = chatSession?.getRequests().length ?? 0;
		const switchToMode = validateChatMode2(arg?.mode) ?? this.getNextMode(context.chatWidget, requestCount, configurationService);

		if (switchToMode.id === context.chatWidget.input.currentMode2.id) {
			return;
		}

		const chatModeCheck = await instaService.invokeFunction(handleModeSwitch, context.chatWidget.input.currentMode, switchToMode.kind, requestCount, context.editingSession);
		if (!chatModeCheck) {
			return;
		}

		context.chatWidget.input.setChatMode2(switchToMode);

		if (chatModeCheck.needToClearSession) {
			if (context.chatWidget.viewModel?.editing) {
				context.chatWidget.input.dispose();
			}
			await commandService.executeCommand(ACTION_ID_NEW_CHAT);
		}
	}

	private getNextMode(chatWidget: IChatWidget, requestCount: number, configurationService: IConfigurationService): IChatMode {
		const modes = [ChatMode2.Ask];
		if (configurationService.getValue(ChatConfiguration.Edits2Enabled) || requestCount === 0) {
			modes.push(ChatMode2.Edit);
		}
		modes.push(ChatMode2.Agent);

		const modeIndex = modes.findIndex(mode => mode.id === chatWidget.input.currentMode2.id);
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
				}]
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
			f1: false,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Period,
				weight: KeybindingWeight.WorkbenchContrib,
				when: ChatContextKeys.inChatInput
			},
			precondition: ChatContextKeys.enabled,
			menu: {
				id: MenuId.ChatInput,
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

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (widget) {
			widget.input.openModelPicker();
		}
	}
}

export const ChangeChatModelActionId = 'workbench.action.chat.changeModel';
class ChangeChatModelAction extends Action2 {
	static readonly ID = ChangeChatModelActionId;

	constructor() {
		super({
			id: ChangeChatModelAction.ID,
			title: localize2('interactive.changeModel.label', "Change Model"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ChatContextKeys.enabled,
		});
	}

	override run(accessor: ServicesAccessor, ...args: any[]): void {
		const modelInfo: Pick<ILanguageModelChatMetadata, 'vendor' | 'id' | 'family'> = args[0];
		// Type check the arg
		assertType(typeof modelInfo.vendor === 'string' && typeof modelInfo.id === 'string' && typeof modelInfo.family === 'string');
		const widgetService = accessor.get(IChatWidgetService);
		const widgets = widgetService.getAllWidgets();
		for (const widget of widgets) {
			widget.input.switchModel(modelInfo);
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
				}]
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

export class CreateRemoteAgentJobAction extends Action2 {
	static readonly ID = 'workbench.action.chat.createRemoteAgentJob';

	constructor() {
		const precondition = ContextKeyExpr.and(
			ContextKeyExpr.or(ChatContextKeys.inputHasText, ChatContextKeys.hasPromptFile),
			whenNotInProgressOrPaused,
			ChatContextKeys.remoteJobCreating.negate(),
		);

		super({
			id: CreateRemoteAgentJobAction.ID,
			title: localize2('actions.chat.createRemoteJob', "Create Remote Job"),
			icon: Codicon.cloudUpload,
			precondition,
			toggled: {
				condition: ChatContextKeys.remoteJobCreating,
				icon: Codicon.sync,
				tooltip: localize('remoteJobCreating', "Remote job is being created"),
			},
			menu: {
				id: MenuId.ChatExecute,
				group: 'navigation',
				order: 0,
				when: ChatContextKeys.hasRemoteCodingAgent
			}
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const contextKeyService = accessor.get(IContextKeyService);
		const remoteJobCreatingKey = ChatContextKeys.remoteJobCreating.bindTo(contextKeyService);

		try {
			remoteJobCreatingKey.set(true);

			const remoteCodingAgent = accessor.get(IRemoteCodingAgentsService);
			const commandService = accessor.get(ICommandService);
			const widgetService = accessor.get(IChatWidgetService);
			const chatAgentService = accessor.get(IChatAgentService);

			const widget = widgetService.lastFocusedWidget;
			if (!widget) {
				return;
			}
			const session = widget.viewModel?.sessionId;
			if (!session) {
				return;
			}

			const userPrompt = widget.getInput();
			widget.setInput();

			const chatModel = widget.viewModel?.model;
			const chatRequests = chatModel.getRequests();
			const agents = remoteCodingAgent.getAvailableAgents();
			const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Panel);

			const agent = agents[0]; // TODO: We just pick the first one for testing
			if (!agent) {
				return;
			}

			let summary: string | undefined;
			if (defaultAgent && chatRequests.length > 0) {
				const historyEntries: IChatAgentHistoryEntry[] = chatRequests
					.filter(req => req.response) // Only include completed requests
					.map(req => ({
						request: {
							sessionId: session,
							requestId: req.id,
							agentId: req.response?.agent?.id ?? '',
							message: req.message.text,
							command: req.response?.slashCommand?.name,
							variables: req.variableData,
							location: ChatAgentLocation.Panel,
							editedFileEvents: req.editedFileEvents,
						},
						response: toChatHistoryContent(req.response!.response.value),
						result: req.response?.result ?? {}
					}));

				summary = await chatAgentService.getChatSummary(defaultAgent.id, historyEntries, CancellationToken.None);
			}
			await commandService.executeCommand(agent.command, {
				userPrompt,
				summary: summary || `Chat session with ${chatRequests.length} messages`
			});
		} finally {
			remoteJobCreatingKey.set(false);
		}
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
		const dialogService = accessor.get(IDialogService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const editingSession = widget.viewModel?.model.editingSession;
		if (editingSession) {
			if (!(await handleCurrentEditingSession(editingSession, undefined, dialogService))) {
				return;
			}
		}

		widget.clear();
		await widget.waitForReady();
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
			menu: [{
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(ChatContextKeys.isRequestPaused.negate(), ChatContextKeys.requestInProgress),
				order: 4,
				group: 'navigation',
			},
			],
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

export const CancelChatEditId = 'workbench.edit.chat.cancel';
export class CancelEdit extends Action2 {
	static readonly ID = CancelChatEditId;
	constructor() {
		super({
			id: CancelEdit.ID,
			title: localize2('interactive.cancelEdit.label', "Cancel Edit"),
			f1: false,
			category: CHAT_CATEGORY,
			keybinding: {
				primary: KeyCode.Escape,
				when: ContextKeyExpr.and(ChatContextKeys.inChatInput,
					EditorContextKeys.hoverVisible.toNegated(),
					EditorContextKeys.hasNonEmptySelection.toNegated(),
					EditorContextKeys.hasMultipleSelections.toNegated()),
				weight: KeybindingWeight.EditorContrib - 5
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
		widget.input.dispose();
	}
}


export function registerChatExecuteActions() {
	registerAction2(ChatSubmitAction);
	registerAction2(ChatEditingSessionSubmitAction);
	registerAction2(SubmitWithoutDispatchingAction);
	registerAction2(CancelAction);
	registerAction2(SendToNewChatAction);
	registerAction2(ChatSubmitWithCodebaseAction);
	registerAction2(CreateRemoteAgentJobAction);
	registerAction2(ToggleChatModeAction);
	registerAction2(ToggleRequestPausedAction);
	registerAction2(SwitchToNextModelAction);
	registerAction2(OpenModelPickerAction);
	registerAction2(ChangeChatModelAction);
	registerAction2(CancelEdit);
}
