/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { getModeNameForTelemetry, buildCustomAgentHandoffsInfo, getHandoffId, IChatMode, IChatModeService, IChatModes } from '../../common/chatModes.js';
import { chatVariableLeader } from '../../common/requestParser/chatParserTypes.js';
import { ChatStopCancellationNoopClassification, ChatStopCancellationNoopEvent, ChatStopCancellationNoopEventName, IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { ILanguageModelChatMetadata } from '../../common/languageModels.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { isInClaudeAgentsFolder } from '../../common/promptSyntax/config/promptFileLocations.js';
import { IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { getAgentSessionProvider, AgentSessionProviders } from '../agentSessions/agentSessions.js';
import { getEditingSessionContext } from '../chatEditing/chatEditingActions.js';
import { ctxHasEditorModification, ctxHasRequestInProgress, ctxIsGlobalEditingSession } from '../chatEditing/chatEditingEditorContextKeys.js';
import { ACTION_ID_NEW_CHAT, CHAT_CATEGORY, clearChatSessionPreservingType, handleCurrentEditingSession, handleModeSwitch } from './chatActions.js';
import { CreateRemoteAgentJobAction } from './chatContinueInAction.js';

export interface IVoiceChatExecuteActionContext {
	readonly disableTimeout?: boolean;
}

export interface IChatExecuteActionContext {
	widget?: IChatWidget;
	inputValue?: string;
	voice?: IVoiceChatExecuteActionContext;
}

abstract class SubmitAction extends Action2 {
	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		const context = args[0] as IChatExecuteActionContext | undefined;
		const telemetryService = accessor.get(ITelemetryService);
		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;

		// Check if there's a pending delegation target
		const pendingDelegationTarget = widget?.input.pendingDelegationTarget;
		if (pendingDelegationTarget && pendingDelegationTarget !== AgentSessionProviders.Local) {
			return await this.handleDelegation(accessor, widget, pendingDelegationTarget);
		}

		if (widget?.viewModel?.editing) {
			const configurationService = accessor.get(IConfigurationService);
			const dialogService = accessor.get(IDialogService);
			const chatService = accessor.get(IChatService);
			const chatModel = chatService.getSession(widget.viewModel.sessionResource);
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

				type EditUndoEvent = {
					editRequestType: string;
					outcome: 'cancelled' | 'applied';
					editsUndoCount: number;
				};

				type EditUndoEventClassification = {
					owner: 'justschen';
					comment: 'Event used to gain insights into when there are pending changes to undo, and whether edited requests are applied or cancelled.';
					editRequestType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Current entry point for editing a request.' };
					outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the edit was cancelled or applied.' };
					editsUndoCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of edits that would be undone.'; 'isMeasurement': true };
				};

				if (!confirmation.confirmed) {
					telemetryService.publicLog2<EditUndoEvent, EditUndoEventClassification>('chat.undoEditsConfirmation', {
						editRequestType: configurationService.getValue<string>('chat.editRequests'),
						outcome: 'cancelled',
						editsUndoCount: editsToUndo
					});
					return;
				} else if (editsToUndo > 0) {
					telemetryService.publicLog2<EditUndoEvent, EditUndoEventClassification>('chat.undoEditsConfirmation', {
						editRequestType: configurationService.getValue<string>('chat.editRequests'),
						outcome: 'applied',
						editsUndoCount: editsToUndo
					});
				}

				if (confirmation.checkboxChecked) {
					await configurationService.updateValue('chat.editing.confirmEditRequestRemoval', false);
				}

				// Restore the snapshot to what it was before the request(s) that we deleted
				const snapshotRequestId = chatRequests[itemIndex].id;
				await session.restoreSnapshot(snapshotRequestId, undefined);
			}
		} else if (widget?.viewModel?.model.checkpoint) {
			widget.viewModel.model.setCheckpoint(undefined);
		}
		widget?.acceptInput(context?.inputValue);
	}

	private async handleDelegation(accessor: ServicesAccessor, widget: IChatWidget, delegationTarget: Exclude<AgentSessionProviders, AgentSessionProviders.Local>): Promise<void> {
		const chatSessionsService = accessor.get(IChatSessionsService);

		// Find the contribution for the delegation target
		const contributions = chatSessionsService.getAllChatSessionContributions();
		const targetContribution = contributions.find(contrib => {
			const providerType = getAgentSessionProvider(contrib.type);
			return providerType === delegationTarget;
		});

		if (!targetContribution) {
			throw new Error(`No contribution found for delegation target: ${delegationTarget}`);
		}

		if (targetContribution.canDelegate === false) {
			throw new Error(`The contribution for delegation target: ${delegationTarget} does not support delegation.`);
		}

		return new CreateRemoteAgentJobAction().run(accessor, targetContribution, widget);
	}
}

const whenNoActiveRequest = ChatContextKeys.hasActiveRequest.negate();
const whenNotInProgress = ChatContextKeys.requestInProgress.negate();

export class ChatSubmitAction extends SubmitAction {
	static readonly ID = 'workbench.action.chat.submit';

	constructor() {
		const menuCondition = ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask);
		const precondition = ContextKeyExpr.and(
			ChatContextKeys.inputHasText,
			ContextKeyExpr.or(whenNotInProgress, ChatContextKeys.editingRequestType.isEqualTo(ChatContextKeys.EditingRequestType.Sent)),
			ChatContextKeys.chatSessionOptionsValid,
		);

		super({
			id: ChatSubmitAction.ID,
			title: localize2('interactive.submit.label', "Send"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.arrowUp,
			precondition,
			toggled: {
				condition: ChatContextKeys.lockedToCodingAgent,
				icon: Codicon.arrowUp,
				tooltip: localize('sendToAgent', "Send to Agent"),
			},
			keybinding: {
				when: ContextKeyExpr.and(
					ChatContextKeys.inChatInput,
					ChatContextKeys.withinEditSessionDiff.negate(),
				),
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.ChatExecute,
					order: 4,
					when: ContextKeyExpr.and(
						whenNoActiveRequest,
						menuCondition,
						ChatContextKeys.withinEditSessionDiff.negate(),
					),
					group: 'navigation',
					alt: {
						id: 'workbench.action.chat.sendToNewChat',
						title: localize2('chat.newChat.label', "Send to New Chat"),
						icon: Codicon.plus
					}
				}, {
					id: MenuId.ChatEditorInlineExecute,
					group: 'navigation',
					order: 4,
					when: ContextKeyExpr.and(
						ContextKeyExpr.or(ctxHasEditorModification.negate(), ChatContextKeys.inputHasText),
						whenNoActiveRequest,
						menuCondition
					),
				}]
		});
	}
}


export const ToggleAgentModeActionId = 'workbench.action.chat.toggleAgentMode';

export interface IToggleChatModeArgs {
	modeId: ChatModeKind | string;
	sessionResource: URI | undefined;
}

type ChatModeChangeClassification = {
	owner: 'digitarald';
	comment: 'Reporting when agent is switched between different modes';
	fromMode?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous agent name' };
	mode?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new agent name' };
	requestCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of requests in the current chat session'; 'isMeasurement': true };
	storage?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Source of the target mode (builtin, local, user, extension)' };
	extensionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Extension ID if the target mode is from an extension' };
	toolsCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of custom tools in the target mode'; 'isMeasurement': true };
	handoffsCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of handoffs in the target mode'; 'isMeasurement': true };
	isClaudeAgent?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the target mode is a Claude agent file from .claude/agents/' };
};

type ChatModeChangeEvent = {
	fromMode: string;
	mode: string;
	requestCount: number;
	storage?: string;
	extensionId?: string;
	toolsCount?: number;
	handoffsCount?: number;
	isClaudeAgent?: boolean;
};

class ToggleChatModeAction extends Action2 {

	static readonly ID = ToggleAgentModeActionId;

	constructor() {
		super({
			id: ToggleChatModeAction.ID,
			title: localize2('interactive.toggleAgent.label', "Switch to Next Agent"),
			f1: true,
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.requestInProgress.negate())
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		const commandService = accessor.get(ICommandService);
		const instaService = accessor.get(IInstantiationService);
		const telemetryService = accessor.get(ITelemetryService);
		const chatWidgetService = accessor.get(IChatWidgetService);

		const arg = args.at(0) as IToggleChatModeArgs | undefined;
		let widget: IChatWidget | undefined;
		if (arg?.sessionResource) {
			widget = chatWidgetService.getWidgetBySessionResource(arg.sessionResource);
		} else {
			widget = getEditingSessionContext(accessor, args)?.chatWidget;
		}

		if (!widget) {
			return;
		}

		const chatSession = widget.viewModel?.model;
		const requestCount = chatSession?.getRequests().length ?? 0;
		const modes = widget.input.currentChatModesObs.get();
		const switchToMode = (arg && (modes.findModeById(arg.modeId) || modes.findModeByName(arg.modeId))) ?? this.getNextMode(widget, requestCount, modes);

		const currentMode = widget.input.currentModeObs.get();
		if (switchToMode.id === currentMode.id) {
			return;
		}

		const chatModeCheck = await instaService.invokeFunction(handleModeSwitch, widget.input.currentModeKind, switchToMode.kind, requestCount, widget.viewModel?.model);
		if (!chatModeCheck) {
			return;
		}

		// Send telemetry for mode change
		const storage = switchToMode.source?.storage ?? 'builtin';
		const extensionId = switchToMode.source?.storage === 'extension' ? switchToMode.source.extensionId.value : undefined;
		const toolsCount = switchToMode.customTools?.get()?.length ?? 0;
		const handoffsCount = switchToMode.handOffs?.get()?.length ?? 0;

		const modeUri = switchToMode.uri?.get();
		const isClaudeAgent = modeUri ? isInClaudeAgentsFolder(modeUri) : undefined;

		telemetryService.publicLog2<ChatModeChangeEvent, ChatModeChangeClassification>('chat.modeChange', {
			fromMode: getModeNameForTelemetry(currentMode),
			mode: getModeNameForTelemetry(switchToMode),
			requestCount: requestCount,
			storage,
			extensionId,
			toolsCount,
			handoffsCount,
			isClaudeAgent
		});

		widget.input.setChatMode(switchToMode.id);

		if (chatModeCheck.needToClearSession) {
			await commandService.executeCommand(ACTION_ID_NEW_CHAT);
		}
	}

	private getNextMode(chatWidget: IChatWidget, requestCount: number, modes: IChatModes): IChatMode {
		const flat = [
			...modes.builtin.filter(mode => {
				return mode.kind !== ChatModeKind.Edit || requestCount === 0;
			}),
			...(modes.custom ?? []),
		];

		const curModeIndex = flat.findIndex(mode => mode.id === chatWidget.input.currentModeObs.get().id);
		const newMode = flat[(curModeIndex + 1) % flat.length];
		return newMode;
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

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		widget?.input.switchToNextModel();
	}
}

export class OpenModelPickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openModelPicker';

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
				when:
					ContextKeyExpr.and(
						ContextKeyExpr.or(
							ChatContextKeys.lockedToCodingAgent.negate(),
							ChatContextKeys.chatSessionHasTargetedModels),
						ContextKeyExpr.or(
							ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Chat),
							ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.EditorInline),
							ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Notebook),
							ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Terminal)),
						// Hide in welcome view when session type is not local
						ContextKeyExpr.or(
							ChatContextKeys.inAgentSessionsWelcome.negate(),
							ChatContextKeys.chatSessionHasTargetedModels,
							ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local))
					)
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (widget) {
			await widgetService.reveal(widget);
			widget.input.openModelPicker();
		}
	}
}

export class OpenPermissionPickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openPermissionPicker';

	constructor() {
		super({
			id: OpenPermissionPickerAction.ID,
			title: localize2('interactive.openPermissionPicker.label', "Open Permission Picker"),
			tooltip: localize('setPermissionLevel', "Set Permissions"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: {
				id: MenuId.ChatInputSecondary,
				order: 1,
				group: 'navigation',
				when:
					ContextKeyExpr.and(
						ChatContextKeys.enabled,
						ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
						ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Ask),
						ChatContextKeys.inQuickChat.negate(),
						ContextKeyExpr.or(
							ChatContextKeys.lockedToCodingAgent.negate(),
							ChatContextKeys.lockedCodingAgentId.isEqualTo(AgentSessionProviders.Background),
							ChatContextKeys.lockedCodingAgentId.isEqualTo(AgentSessionProviders.Claude),
						),
					)
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (widget) {
			widget.input.openPermissionPicker();
		}
	}
}

export class OpenModePickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openModePicker';

	constructor() {
		super({
			id: OpenModePickerAction.ID,
			title: localize2('interactive.openModePicker.label', "Open Agent Picker"),
			tooltip: localize('setChatMode', "Set Agent"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ChatContextKeys.enabled,
			keybinding: {
				when: ContextKeyExpr.and(
					ChatContextKeys.inChatInput,
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
				primary: KeyMod.CtrlCmd | KeyCode.Period,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.ChatInput,
					order: 1,
					when: ContextKeyExpr.and(
						ChatContextKeys.enabled,
						ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
						ChatContextKeys.inQuickChat.negate(),
						ContextKeyExpr.or(
							ChatContextKeys.lockedToCodingAgent.negate(),
							ChatContextKeys.chatSessionHasCustomAgentTarget),
						// Show in welcome view for local sessions or sessions with custom agent target
						ContextKeyExpr.or(
							ChatContextKeys.inAgentSessionsWelcome.negate(),
							ChatContextKeys.chatSessionHasCustomAgentTarget,
							ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local))),
					group: 'navigation',
				},
			]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (widget) {
			widget.input.openModePicker();
		}
	}
}

export class OpenSessionTargetPickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openSessionTargetPicker';

	constructor() {
		super({
			id: OpenSessionTargetPickerAction.ID,
			title: localize2('interactive.openSessionTargetPicker.label', "Open Session Target Picker"),
			tooltip: localize('setSessionTarget', "Set Session Target"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.or(ChatContextKeys.chatSessionIsEmpty, ChatContextKeys.inAgentSessionsWelcome), ChatContextKeys.currentlyEditingInput.negate(), ChatContextKeys.currentlyEditing.negate()),
			menu: [
				{
					id: MenuId.ChatInput,
					order: 0,
					when: ContextKeyExpr.and(
						ChatContextKeys.enabled,
						ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
						ChatContextKeys.inQuickChat.negate(),
						ChatContextKeys.chatSessionIsEmpty,
						IsSessionsWindowContext),
					group: 'navigation',
				},
				{
					id: MenuId.ChatInputSecondary,
					order: 0,
					when: ContextKeyExpr.and(
						ChatContextKeys.enabled,
						ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
						ChatContextKeys.inQuickChat.negate(),
						IsSessionsWindowContext.negate(),
						ChatContextKeys.chatSessionIsEmpty),
					group: 'navigation',
				},
			]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (widget) {
			widget.input.openSessionTargetPicker();
		}
	}
}

export class OpenDelegationPickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openDelegationPicker';

	constructor() {
		super({
			id: OpenDelegationPickerAction.ID,
			title: localize2('interactive.openDelegationPicker.label', "Open Delegation Picker"),
			tooltip: localize('delegateSession', "Delegate Session"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.chatSessionIsEmpty.negate(), ChatContextKeys.currentlyEditingInput.negate(), ChatContextKeys.currentlyEditing.negate()),
			menu: [
				{
					id: MenuId.ChatInputSecondary,
					order: 0.5,
					when: ContextKeyExpr.and(
						ChatContextKeys.enabled,
						ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
						ChatContextKeys.inQuickChat.negate(),
						ChatContextKeys.chatSessionSupportsDelegation,
						ChatContextKeys.chatSessionIsEmpty.negate()
					),
					group: 'navigation',
				},
			]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (widget) {
			widget.input.openDelegationPicker();
		}
	}
}

export class OpenWorkspacePickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openWorkspacePicker';

	constructor() {
		super({
			id: OpenWorkspacePickerAction.ID,
			title: localize2('interactive.openWorkspacePicker.label', "Open Workspace Picker"),
			tooltip: localize('selectWorkspace', "Select Target Workspace"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.inAgentSessionsWelcome),
			menu: [
				{
					id: MenuId.ChatInputSecondary,
					order: 0.6,
					when: ContextKeyExpr.and(
						ChatContextKeys.inAgentSessionsWelcome,
						ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType)
					),
					group: 'navigation',
				},
			]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		// The picker is opened via the action view item
	}
}

export class ChatSessionPrimaryPickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.chatSessionPrimaryPicker';
	constructor() {
		super({
			id: ChatSessionPrimaryPickerAction.ID,
			title: localize2('interactive.openChatSessionPrimaryPicker.label', "Open Primary Session Picker"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [
				{
					// Cloud sessions: keep on the primary chat input toolbar
					id: MenuId.ChatInput,
					order: 4,
					group: 'navigation',
					when:
						ContextKeyExpr.and(
							ChatContextKeys.chatSessionHasModels,
							ChatContextKeys.chatSessionType.isEqualTo(AgentSessionProviders.Cloud),
							ContextKeyExpr.or(
								ChatContextKeys.lockedToCodingAgent,
								ContextKeyExpr.and(
									ChatContextKeys.inAgentSessionsWelcome,
									ChatContextKeys.chatSessionType.notEqualsTo('local')
								)
							)
						)
				},
				{
					// All other coding agents (Claude, etc.): show in the secondary toolbar.
					// In the Agents window only, hide the worktree/branch pickers for Copilot
					// CLI sessions because their option groups are surfaced through the CLI
					// session UI there. They remain visible in the regular VS Code workbench.
					id: MenuId.ChatInputSecondary,
					order: 4,
					group: 'navigation',
					when:
						ContextKeyExpr.and(
							ChatContextKeys.chatSessionHasModels,
							ChatContextKeys.chatSessionType.notEqualsTo(AgentSessionProviders.Cloud),
							ContextKeyExpr.or(
								IsSessionsWindowContext.negate(),
								ChatContextKeys.chatSessionType.notEqualsTo(AgentSessionProviders.Background)
							),
							ContextKeyExpr.or(
								ChatContextKeys.lockedToCodingAgent,
								ContextKeyExpr.and(
									ChatContextKeys.inAgentSessionsWelcome,
									ChatContextKeys.chatSessionType.notEqualsTo('local')
								)
							)
						)
				},
			]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (widget) {
			widget.input.openChatSessionPicker();
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

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const modelInfo = args[0] as Pick<ILanguageModelChatMetadata, 'vendor' | 'id' | 'family'>;
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
		const notInProgressOrEditing = ContextKeyExpr.and(
			ContextKeyExpr.or(whenNoActiveRequest, ChatContextKeys.editingRequestType.isEqualTo(ChatContextKeys.EditingRequestType.Sent)),
			ChatContextKeys.editingRequestType.notEqualsTo(ChatContextKeys.EditingRequestType.Queue),
			ChatContextKeys.editingRequestType.notEqualsTo(ChatContextKeys.EditingRequestType.Steer)
		);

		const menuCondition = ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Ask);
		const precondition = ContextKeyExpr.and(
			ChatContextKeys.inputHasText,
			notInProgressOrEditing,
			ChatContextKeys.chatSessionOptionsValid
		);

		super({
			id: ChatEditingSessionSubmitAction.ID,
			title: localize2('edits.submit.label', "Send"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.arrowUp,
			precondition,
			menu: [
				{
					id: MenuId.ChatExecute,
					order: 4,
					when: ContextKeyExpr.and(
						notInProgressOrEditing,
						menuCondition),
					group: 'navigation',
					alt: {
						id: 'workbench.action.chat.sendToNewChat',
						title: localize2('chat.newChat.label', "Send to New Chat"),
						icon: Codicon.plus
					}
				}]
		});
	}
}

class SubmitWithoutDispatchingAction extends Action2 {
	static readonly ID = 'workbench.action.chat.submitWithoutDispatching';

	constructor() {
		const precondition = ContextKeyExpr.and(
			ChatContextKeys.inputHasText,
			whenNotInProgress,
			ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask),
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
			}
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]) {
		const context = args[0] as IChatExecuteActionContext | undefined;

		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		widget?.acceptInput(context?.inputValue, { noCommandDetection: true });
	}
}

export class ChatSubmitWithCodebaseAction extends Action2 {
	static readonly ID = 'workbench.action.chat.submitWithCodebase';

	constructor() {
		const precondition = ContextKeyExpr.and(
			ChatContextKeys.inputHasText,
			whenNotInProgress,
		);

		super({
			id: ChatSubmitWithCodebaseAction.ID,
			title: localize2('actions.chat.submitWithCodebase', "Send with {0}", `${chatVariableLeader}codebase`),
			precondition,
			keybinding: {
				when: ChatContextKeys.inChatInput,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]) {
		const context = args[0] as IChatExecuteActionContext | undefined;

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
		const precondition = ChatContextKeys.inputHasText;

		super({
			id: 'workbench.action.chat.sendToNewChat',
			title: localize2('chat.newChat.label', "Send to New Chat"),
			precondition,
			category: CHAT_CATEGORY,
			f1: false,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
				when: ChatContextKeys.inChatInput,
			}
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		const context = args[0] as IChatExecuteActionContext | undefined;

		const widgetService = accessor.get(IChatWidgetService);
		const viewsService = accessor.get(IViewsService);
		const dialogService = accessor.get(IDialogService);
		const chatService = accessor.get(IChatService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const inputBeforeClear = widget.getInput();

		// Cancel any in-progress request before clearing
		if (widget.viewModel) {
			await chatService.cancelCurrentRequestForSession(widget.viewModel.sessionResource, 'newSessionAction');
		}

		if (widget.viewModel?.model) {
			if (!(await handleCurrentEditingSession(widget.viewModel.model, undefined, dialogService))) {
				return;
			}
		}

		// Clear the input from the current session before creating a new one
		widget.setInput('');

		await clearChatSessionPreservingType(widget, viewsService);

		widget.acceptInput(inputBeforeClear, { storeToHistory: true });
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
				when: ContextKeyExpr.and(
					ChatContextKeys.hasActiveRequest,
					ChatContextKeys.remoteJobCreating.negate(),
					ChatContextKeys.currentlyEditing.negate(),
				),
				order: 4,
				group: 'navigation',
			}, {
				id: MenuId.ChatEditorInlineExecute,
				when: ContextKeyExpr.and(
					ctxIsGlobalEditingSession.negate(),
					ctxHasRequestInProgress,
				),
				order: 4,
				group: 'navigation',
			}
			],
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Escape,
				when: ContextKeyExpr.and(
					ChatContextKeys.hasActiveRequest,
					ChatContextKeys.remoteJobCreating.negate()
				),
				win: { primary: KeyMod.Alt | KeyCode.Backspace },
			}
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		const context = args[0] as IChatExecuteActionContext | undefined;
		const widgetService = accessor.get(IChatWidgetService);
		const logService = accessor.get(ILogService);
		const telemetryService = accessor.get(ITelemetryService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			telemetryService.publicLog2<ChatStopCancellationNoopEvent, ChatStopCancellationNoopClassification>(ChatStopCancellationNoopEventName, {
				source: 'cancelAction',
				reason: 'noWidget',
				requestInProgress: 'unknown',
				pendingRequests: 0,
			});
			logService.info('ChatCancelAction#run: No focused chat widget was found');
			return;
		}

		const chatService = accessor.get(IChatService);
		if (widget.viewModel) {
			await chatService.cancelCurrentRequestForSession(widget.viewModel.sessionResource, 'cancelAction');
		} else {
			telemetryService.publicLog2<ChatStopCancellationNoopEvent, ChatStopCancellationNoopClassification>(ChatStopCancellationNoopEventName, {
				source: 'cancelAction',
				reason: 'noViewModel',
				requestInProgress: 'unknown',
				pendingRequests: 0,
			});
			logService.info('ChatCancelAction#run: Canceled chat widget has no view model');
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
			icon: Codicon.x,
			menu: [
				{
					id: MenuId.ChatMessageTitle,
					group: 'navigation',
					order: 1,
					when: ContextKeyExpr.and(ChatContextKeys.isRequest, ChatContextKeys.currentlyEditing, ContextKeyExpr.equals(`config.${ChatConfiguration.EditRequests}`, 'input'))
				}
			],
			keybinding: {
				primary: KeyCode.Escape,
				when: ContextKeyExpr.and(ChatContextKeys.inChatInput,
					EditorContextKeys.hoverVisible.toNegated(),
					EditorContextKeys.hasNonEmptySelection.toNegated(),
					EditorContextKeys.hasMultipleSelections.toNegated(),
					ContextKeyExpr.or(ChatContextKeys.currentlyEditing, ChatContextKeys.currentlyEditingInput)),
				weight: KeybindingWeight.EditorContrib - 5
			}
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]) {
		const context = args[0] as IChatExecuteActionContext | undefined;

		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}
		widget.finishedEditing();
	}
}

// --- Handoff Discovery & Execution Commands ---

export const GetHandoffsActionId = 'workbench.action.chat.getHandoffs';

interface IGetHandoffsArgs {
	/**
	 * Name of the custom agent (defined in an `.agent.md` file) whose handoffs
	 * you want to retrieve. If omitted, all
	 * handoffs from all agents and built-in modes are returned.
	 */
	sourceCustomAgent?: string;

	sessionType?: string;
}

/**
 * Discovers the handoffs available across custom agents (and built-in modes).
 *
 * **Return value**: `ICustomAgentInfo[]` — an array where each element
 * represents an agent/mode with its `id`, `name`, `isBuiltin`,
 * `visibility`, and `handoffs` list.
 *
 * @see ICustomAgentInfo
 * @see IHandoffInfo
 */
class GetHandoffsAction extends Action2 {

	static readonly ID = GetHandoffsActionId;

	constructor() {
		super({
			id: GetHandoffsAction.ID,
			title: localize2('chat.getHandoffs.label', "Get Handoffs"),
			f1: false,
			category: CHAT_CATEGORY,
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]) {
		const modeService = accessor.get(IChatModeService);
		const arg = args.at(0) as IGetHandoffsArgs | undefined;

		const { builtin, custom } = modeService.getModes(arg?.sessionType ?? localChatSessionType);
		let allModes: readonly IChatMode[] = [...builtin, ...custom];

		if (arg?.sourceCustomAgent) {
			const filterName = arg.sourceCustomAgent;
			allModes = allModes.filter(m => m.name.get().toLowerCase() === filterName.toLowerCase());
		}

		return buildCustomAgentHandoffsInfo(allModes);
	}
}

export const ExecuteHandoffActionId = 'workbench.action.chat.executeHandoff';

interface IExecuteHandoffArgs {
	/**
	 * The stable handoff ID (from getHandoffs). Primary match key.
	 * IDs are unique within a given source agent; when handoffs from
	 * multiple source agents share the same target+label, also provide
	 * `sourceCustomAgent` to disambiguate.
	 */
	id?: string;
	/** Fallback: handoff label to match. Case-insensitive. */
	label?: string;
	/**
	 * The chat session URI identifying which chat widget to execute in.
	 * If omitted, falls back to the last-focused chat widget.
	 */
	sessionResource?: string;
	/**
	 * Name of the *source* custom agent (from `.agent.md`) that declares the handoff to
	 * execute. If omitted, falls back to the session's currently active mode/agent.
	 */
	sourceCustomAgent?: string;
}

interface IExecuteHandoffResult {
	success: boolean;
	targetMode?: string;
	error?: string;
}

class ExecuteHandoffAction extends Action2 {

	static readonly ID = ExecuteHandoffActionId;

	constructor() {
		super({
			id: ExecuteHandoffAction.ID,
			title: localize2('chat.executeHandoff.label', "Execute Handoff"),
			f1: false,
			category: CHAT_CATEGORY,
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<IExecuteHandoffResult> {
		const chatWidgetService = accessor.get(IChatWidgetService);

		const arg = args.at(0) as IExecuteHandoffArgs | undefined;
		if (!arg?.id && !arg?.label) {
			return { success: false, error: 'Either id or label is required' };
		}

		// Resolve the target widget: explicit sessionResource, or fall back to last-focused
		let widget: IChatWidget | undefined;
		if (arg.sessionResource) {
			let sessionResource;
			try {
				sessionResource = URI.parse(arg.sessionResource);
			} catch {
				return { success: false, error: `Invalid sessionResource URI: '${arg.sessionResource}'` };
			}
			widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
		} else {
			widget = chatWidgetService.lastFocusedWidget;
		}
		if (!widget) {
			return { success: false, error: 'No chat widget found. Provide sessionResource or focus a chat widget.' };
		}

		// Resolve the source custom agent whose handoffs we search (case-insensitive)
		let sourceMode: IChatMode | undefined;
		if (arg.sourceCustomAgent) {
			const filterName = arg.sourceCustomAgent.toLowerCase();
			const { builtin, custom } = widget.input.currentChatModesObs.get();
			sourceMode = [...builtin, ...custom].find(m => m.name.get().toLowerCase() === filterName || m.id.toLowerCase() === filterName);
		}
		if (!sourceMode) {
			sourceMode = widget.input.currentModeObs.get();
		}

		const handoffs = sourceMode?.handOffs?.get();
		if (!handoffs || handoffs.length === 0) {
			return { success: false, error: `No handoffs available for mode '${sourceMode?.name.get()}'` };
		}

		// Match by id first, then by label
		let matchedHandoff = arg.id
			? handoffs.find(h => getHandoffId(h) === arg.id)
			: undefined;

		if (!matchedHandoff && arg.label) {
			const labelLower = arg.label.trim().toLowerCase();
			matchedHandoff = handoffs.find(h => h.label.trim().toLowerCase() === labelLower);
		}

		if (!matchedHandoff) {
			const identifier = arg.id ?? arg.label;
			return { success: false, error: `No handoff with identifier '${identifier}' found for mode '${sourceMode?.name.get()}'` };
		}

		await widget.executeHandoff(matchedHandoff);
		return { success: true, targetMode: matchedHandoff.agent };
	}
}


export function registerChatExecuteActions(): DisposableStore {
	const store = new DisposableStore();
	store.add(registerAction2(ChatSubmitAction));
	store.add(registerAction2(ChatEditingSessionSubmitAction));
	store.add(registerAction2(SubmitWithoutDispatchingAction));
	store.add(registerAction2(CancelAction));
	store.add(registerAction2(SendToNewChatAction));
	store.add(registerAction2(ChatSubmitWithCodebaseAction));
	store.add(registerAction2(ToggleChatModeAction));
	store.add(registerAction2(SwitchToNextModelAction));
	store.add(registerAction2(OpenModelPickerAction));
	store.add(registerAction2(OpenPermissionPickerAction));
	store.add(registerAction2(OpenModePickerAction));
	store.add(registerAction2(OpenSessionTargetPickerAction));
	store.add(registerAction2(OpenDelegationPickerAction));
	store.add(registerAction2(OpenWorkspacePickerAction));
	store.add(registerAction2(ChatSessionPrimaryPickerAction));
	store.add(registerAction2(ChangeChatModelAction));
	store.add(registerAction2(CancelEdit));
	store.add(registerAction2(GetHandoffsAction));
	store.add(registerAction2(ExecuteHandoffAction));
	return store;
}
