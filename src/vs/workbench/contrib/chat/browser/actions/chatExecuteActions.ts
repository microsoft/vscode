/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { basename, relativePath } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IRemoteCodingAgent, IRemoteCodingAgentsService } from '../../../remoteCodingAgents/common/remoteCodingAgentsService.js';
import { IChatAgent, IChatAgentHistoryEntry, IChatAgentService } from '../../common/chatAgents.js';
import { ChatContextKeys, ChatContextKeyExprs } from '../../common/chatContextKeys.js';
import { IChatModel, IChatRequestModel, toChatHistoryContent } from '../../common/chatModel.js';
import { IChatMode, IChatModeService } from '../../common/chatModes.js';
import { chatVariableLeader } from '../../common/chatParserTypes.js';
import { ChatRequestParser } from '../../common/chatRequestParser.js';
import { IChatPullRequestContent, IChatService } from '../../common/chatService.js';
import { IChatSessionsExtensionPoint, IChatSessionsService } from '../../common/chatSessionsService.js';
import { ChatRequestVariableSet, isChatRequestFileEntry } from '../../common/chatVariableEntries.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, } from '../../common/constants.js';
import { ILanguageModelChatMetadata } from '../../common/languageModels.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { IChatWidget, IChatWidgetService, showChatWidgetInViewOrEditor } from '../chat.js';
import { getEditingSessionContext } from '../chatEditing/chatEditingActions.js';
import { ACTION_ID_NEW_CHAT, CHAT_CATEGORY, handleCurrentEditingSession, handleModeSwitch } from './chatActions.js';

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
		const telemetryService = accessor.get(ITelemetryService);
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
}

const whenNotInProgress = ChatContextKeys.requestInProgress.negate();

export class ChatSubmitAction extends SubmitAction {
	static readonly ID = 'workbench.action.chat.submit';

	constructor() {
		const menuCondition = ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask);

		super({
			id: ChatSubmitAction.ID,
			title: localize2('interactive.submit.label', "Send and Dispatch"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.send,
			toggled: {
				condition: ChatContextKeys.lockedToCodingAgent,
				icon: Codicon.sendToRemoteAgent,
				tooltip: localize('sendToRemoteAgent', "Send to coding agent"),
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
					id: MenuId.ChatExecuteSecondary,
					group: 'group_1',
					order: 1,
					when: ContextKeyExpr.or(
						ChatContextKeys.withinEditSessionDiff,
						ContextKeyExpr.and(menuCondition, ChatContextKeys.lockedToCodingAgent.negate())
					),
				},
				{
					id: MenuId.ChatExecute,
					order: 4,
					when: ContextKeyExpr.and(
						whenNotInProgress,
						menuCondition,
						ChatContextKeys.withinEditSessionDiff.negate(),
					),
					group: 'navigation',
				}]
		});
	}
}

export class ChatDelegateToEditSessionAction extends Action2 {
	static readonly ID = 'workbench.action.chat.delegateToEditSession';

	constructor() {
		super({
			id: ChatDelegateToEditSessionAction.ID,
			title: localize2('interactive.submit.panel.label', "Send to Edit Session"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.commentDiscussion,
			keybinding: {
				when: ContextKeyExpr.and(
					ChatContextKeys.inChatInput,
					ChatContextKeys.withinEditSessionDiff,
				),
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [
				{
					id: MenuId.ChatExecute,
					order: 4,
					when: ContextKeyExpr.and(
						whenNotInProgress,
						ChatContextKeys.withinEditSessionDiff,
					),
					group: 'navigation',
				},
				{
					id: MenuId.ChatExecuteSecondary,
					group: 'group_1',
					order: 1,
					when: ContextKeyExpr.and(
						whenNotInProgress,
						ChatContextKeys.filePartOfEditSession,
					),
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const context: IChatExecuteActionContext | undefined = args[0];
		const widgetService = accessor.get(IChatWidgetService);
		const instantiationService = accessor.get(IInstantiationService);
		const inlineWidget = context?.widget ?? widgetService.lastFocusedWidget;
		const locationData = inlineWidget?.locationData;

		if (inlineWidget && locationData?.type === ChatAgentLocation.EditorInline && locationData.delegateSessionId) {
			const sessionWidget = widgetService.getWidgetBySessionId(locationData.delegateSessionId);

			if (sessionWidget) {
				await instantiationService.invokeFunction(showChatWidgetInViewOrEditor, sessionWidget);
				sessionWidget.attachmentModel.addContext({
					id: 'vscode.delegate.inline',
					kind: 'file',
					modelDescription: `User's chat context`,
					name: 'delegate-inline',
					value: { range: locationData.wholeRange, uri: locationData.document },
				});
				sessionWidget.acceptInput(inlineWidget.getInput(), {
					noCommandDetection: true,
					enableImplicitContext: false,
				});

				inlineWidget.setInput('');
				locationData.close();
			}
		}
	}
}

export const ToggleAgentModeActionId = 'workbench.action.chat.toggleAgentMode';

export interface IToggleChatModeArgs {
	modeId: ChatModeKind | string;
}

type ChatModeChangeClassification = {
	owner: 'digitarald';
	comment: 'Reporting when Chat mode is switched between different modes';
	fromMode?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous chat mode' };
	toMode?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new chat mode' };
	requestCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of requests in the current chat session'; 'isMeasurement': true };
};

type ChatModeChangeEvent = {
	fromMode: string;
	toMode: string;
	requestCount: number;
};

class ToggleChatModeAction extends Action2 {

	static readonly ID = ToggleAgentModeActionId;

	constructor() {
		super({
			id: ToggleChatModeAction.ID,
			title: localize2('interactive.toggleAgent.label', "Switch to Next Chat Mode"),
			f1: true,
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.requestInProgress.negate())
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const commandService = accessor.get(ICommandService);
		const configurationService = accessor.get(IConfigurationService);
		const instaService = accessor.get(IInstantiationService);
		const modeService = accessor.get(IChatModeService);
		const telemetryService = accessor.get(ITelemetryService);

		const context = getEditingSessionContext(accessor, args);
		if (!context?.chatWidget) {
			return;
		}

		const arg = args.at(0) as IToggleChatModeArgs | undefined;
		const chatSession = context.chatWidget.viewModel?.model;
		const requestCount = chatSession?.getRequests().length ?? 0;
		const switchToMode = (arg && modeService.findModeById(arg.modeId)) ?? this.getNextMode(context.chatWidget, requestCount, configurationService, modeService);

		const currentMode = context.chatWidget.input.currentModeObs.get();
		if (switchToMode.id === currentMode.id) {
			return;
		}

		const chatModeCheck = await instaService.invokeFunction(handleModeSwitch, context.chatWidget.input.currentModeKind, switchToMode.kind, requestCount, context.editingSession);
		if (!chatModeCheck) {
			return;
		}

		// Send telemetry for mode change
		telemetryService.publicLog2<ChatModeChangeEvent, ChatModeChangeClassification>('chat.modeChange', {
			fromMode: currentMode.id,
			toMode: switchToMode.id,
			requestCount: requestCount
		});

		context.chatWidget.input.setChatMode(switchToMode.id);

		if (chatModeCheck.needToClearSession) {
			await commandService.executeCommand(ACTION_ID_NEW_CHAT);
		}
	}

	private getNextMode(chatWidget: IChatWidget, requestCount: number, configurationService: IConfigurationService, modeService: IChatModeService): IChatMode {
		const modes = modeService.getModes();
		const flat = [
			...modes.builtin.filter(mode => {
				return mode.kind !== ChatModeKind.Edit || configurationService.getValue(ChatConfiguration.Edits2Enabled) || requestCount === 0;
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
				when:
					ContextKeyExpr.and(
						ChatContextKeys.lockedToCodingAgent.negate(),
						ChatContextKeys.languageModelsAreUserSelectable,
						ContextKeyExpr.or(
							ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Chat),
							ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.EditorInline),
							ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Notebook),
							ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Terminal))
					)
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

export class OpenModePickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openModePicker';

	constructor() {
		super({
			id: OpenModePickerAction.ID,
			title: localize2('interactive.openModePicker.label', "Open Mode Picker"),
			tooltip: localize('setChatMode', "Set Mode"),
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
						ChatContextKeys.lockedToCodingAgent.negate(),
						ChatContextKeyExprs.chatSetupTriggerContext?.negate()),
					group: 'navigation',
				},
			]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.lastFocusedWidget;
		if (widget) {
			widget.input.openModePicker();
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
		const menuCondition = ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Ask);

		super({
			id: ChatEditingSessionSubmitAction.ID,
			title: localize2('edits.submit.label', "Send"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.send,
			menu: [
				{
					id: MenuId.ChatExecuteSecondary,
					group: 'group_1',
					when: ContextKeyExpr.and(whenNotInProgress, menuCondition),
					order: 1
				},
				{
					id: MenuId.ChatExecute,
					order: 4,
					when: ContextKeyExpr.and(
						ChatContextKeys.requestInProgress.negate(),
						menuCondition),
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
			},
			menu: [
				{
					id: MenuId.ChatExecuteSecondary,
					group: 'group_1',
					order: 2,
					when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask),
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

	static readonly markdownStringTrustedOptions = {
		isTrusted: {
			enabledCommands: [] as string[],
		},
	};

	constructor() {
		const precondition = ContextKeyExpr.and(
			whenNotInProgress,
			ChatContextKeys.remoteJobCreating.negate(),
		);

		super({
			id: CreateRemoteAgentJobAction.ID,
			// TODO(joshspicer): Generalize title/tooltip - pull from contribution
			title: localize2('actions.chat.createRemoteJob', "Delegate to Coding Agent"),
			icon: Codicon.sendToRemoteAgent,
			tooltip: localize('delegateToCodingAgentToolTip', "Delegate this task to the GitHub Copilot coding agent. The agent will continue work asynchronously and create a pull request with the proposed changes. Iterate further via chat or from the associated pull request."),
			precondition,
			toggled: {
				condition: ChatContextKeys.remoteJobCreating,
				icon: Codicon.sync,
				tooltip: localize('remoteJobCreating', "Delegating to Coding Agent"),
			},
			menu: [
				{
					id: MenuId.ChatExecute,
					group: 'navigation',
					order: 3.4,
					when: ContextKeyExpr.and(
						ChatContextKeys.hasRemoteCodingAgent,
						ChatContextKeys.lockedToCodingAgent.negate(),
						ContextKeyExpr.equals(`config.${ChatConfiguration.DelegateToCodingAgentInSecondaryMenu}`, false)
					),
				},
				{
					id: MenuId.ChatExecuteSecondary,
					group: 'group_3',
					order: 1,
					when: ContextKeyExpr.and(
						ChatContextKeys.hasRemoteCodingAgent,
						ChatContextKeys.lockedToCodingAgent.negate(),
						ContextKeyExpr.equals(`config.${ChatConfiguration.DelegateToCodingAgentInSecondaryMenu}`, true)
					),
				}
			]
		});
	}

	private async pickCodingAgent<T extends IChatSessionsExtensionPoint | IRemoteCodingAgent>(
		quickPickService: IQuickInputService,
		options: T[]
	): Promise<T | undefined> {
		if (options.length === 0) {
			return undefined;
		}
		if (options.length === 1) {
			return options[0];
		}
		const pick = await quickPickService.pick(
			options.map(a => ({
				label: a.displayName,
				description: a.description,
				agent: a,
			})),
			{
				title: localize('selectCodingAgent', "Select Coding Agent"),
			}
		);
		if (!pick) {
			return undefined;
		}
		return pick.agent;
	}

	private async createWithChatSessions(
		chatSessionsService: IChatSessionsService,
		chatService: IChatService,
		quickPickService: IQuickInputService,
		sessionId: string,
		attachedContext: ChatRequestVariableSet,
		userPrompt: string,
		chatSummary?: {
			prompt?: string;
			history?: string;
		}
	) {
		const contributions = chatSessionsService.getAllChatSessionContributions();
		const agent = await this.pickCodingAgent(quickPickService, contributions);
		if (!agent) {
			throw new Error('No coding agent selected');
		}
		// TODO(jospicer): The previous chat history doesn't get sent to chat participants!
		const { type } = agent;

		await chatService.sendRequest(sessionId, userPrompt, {
			agentIdSilent: type,
			attachedContext: attachedContext.asArray(),
			chatSummary,
		});
	}

	private async createWithLegacy(
		remoteCodingAgentService: IRemoteCodingAgentsService,
		commandService: ICommandService,
		quickPickService: IQuickInputService,
		chatModel: IChatModel,
		addedRequest: IChatRequestModel,
		widget: IChatWidget,
		userPrompt: string,
		summary?: string,
	) {
		const agents = remoteCodingAgentService.getAvailableAgents();
		const agent = await this.pickCodingAgent(quickPickService, agents);
		if (!agent) {
			chatModel.completeResponse(addedRequest);
			return;
		}

		// Execute the remote command
		const result: Omit<IChatPullRequestContent, 'kind'> | string | undefined = await commandService.executeCommand(agent.command, {
			userPrompt,
			summary,
			_version: 2, // Signal that we support the new response format
		});

		if (result && typeof result === 'object') { /* _version === 2 */
			chatModel.acceptResponseProgress(addedRequest, { kind: 'pullRequest', ...result });
			chatModel.acceptResponseProgress(addedRequest, {
				kind: 'markdownContent', content: new MarkdownString(
					localize('remoteAgentResponse2', "Your work will be continued in this pull request."),
					CreateRemoteAgentJobAction.markdownStringTrustedOptions
				)
			});
		} else if (typeof result === 'string') {
			chatModel.acceptResponseProgress(addedRequest, {
				kind: 'markdownContent',
				content: new MarkdownString(
					localize('remoteAgentResponse', "Coding agent response: {0}", result),
					CreateRemoteAgentJobAction.markdownStringTrustedOptions
				)
			});
			// Extension will open up the pull request in another view
			widget.clear();
		} else {
			chatModel.acceptResponseProgress(addedRequest, {
				kind: 'markdownContent',
				content: new MarkdownString(
					localize('remoteAgentError', "Coding agent session cancelled."),
					CreateRemoteAgentJobAction.markdownStringTrustedOptions
				)
			});
		}
	}

	/**
	 * Converts full URIs from the user's systems into workspace-relative paths for coding agent.
	 */
	private extractRelativeFromAttachedContext(attachedContext: ChatRequestVariableSet, workspaceContextService: IWorkspaceContextService): string[] {
		const workspaceFolder = workspaceContextService.getWorkspace().folders[0];
		if (!workspaceFolder) {
			return [];
		}
		if (!attachedContext) {
			return [];
		}
		const relativePaths: string[] = [];
		for (const contextEntry of attachedContext.asArray()) {
			if (isChatRequestFileEntry(contextEntry)) { // TODO: Extend for more variable types as needed
				if (!(contextEntry.value instanceof URI)) {
					continue;
				}
				const fileUri = contextEntry.value;
				const relativePathResult = relativePath(workspaceFolder.uri, fileUri);
				if (relativePathResult) {
					relativePaths.push(relativePathResult);
				}
			}
		}
		return relativePaths;
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const contextKeyService = accessor.get(IContextKeyService);
		const remoteJobCreatingKey = ChatContextKeys.remoteJobCreating.bindTo(contextKeyService);

		try {
			remoteJobCreatingKey.set(true);

			const configurationService = accessor.get(IConfigurationService);
			const widgetService = accessor.get(IChatWidgetService);
			const chatAgentService = accessor.get(IChatAgentService);
			const chatService = accessor.get(IChatService);
			const commandService = accessor.get(ICommandService);
			const quickPickService = accessor.get(IQuickInputService);
			const remoteCodingAgentService = accessor.get(IRemoteCodingAgentsService);
			const chatSessionsService = accessor.get(IChatSessionsService);
			const workspaceContextService = accessor.get(IWorkspaceContextService);

			const widget = widgetService.lastFocusedWidget;
			if (!widget) {
				return;
			}
			const sessionId = widget.viewModel?.sessionId;
			if (!sessionId) {
				return;
			}
			const chatModel = widget.viewModel?.model;
			if (!chatModel) {
				return;
			}

			const chatRequests = chatModel.getRequests();
			let userPrompt = widget.getInput();
			if (!userPrompt) {
				if (!chatRequests.length) {
					// Nothing to do
					return;
				}
				userPrompt = 'implement this.';
			}

			const attachedContext = widget.input.getAttachedAndImplicitContext(sessionId);
			widget.input.acceptInput(true);

			const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
			const instantiationService = accessor.get(IInstantiationService);
			const requestParser = instantiationService.createInstance(ChatRequestParser);

			// Add the request to the model first
			const parsedRequest = requestParser.parseChatRequest(sessionId, userPrompt, ChatAgentLocation.Chat);
			const addedRequest = chatModel.addRequest(
				parsedRequest,
				{ variables: attachedContext.asArray() },
				0,
				undefined,
				defaultAgent
			);

			let title: string | undefined = undefined;

			// -- summarize userPrompt if necessary
			let summarizedUserPrompt: string | undefined = undefined;
			if (defaultAgent && userPrompt.length > 10_000) {
				chatModel.acceptResponseProgress(addedRequest, {
					kind: 'progressMessage',
					content: new MarkdownString(
						localize('summarizeUserPromptCreateRemoteJob', "Summarizing user prompt"),
						CreateRemoteAgentJobAction.markdownStringTrustedOptions,
					)
				});

				({ title, summarizedUserPrompt } = await this.generateSummarizedUserPrompt(sessionId, userPrompt, attachedContext, title, chatAgentService, defaultAgent, summarizedUserPrompt));
			}

			let summary: string = '';
			const relativeAttachedContext = this.extractRelativeFromAttachedContext(attachedContext, workspaceContextService);
			if (relativeAttachedContext.length) {
				summary += `\n\n${localize('attachedFiles', "The user has attached the following files from their workspace:")}\n${relativeAttachedContext.map(file => `- ${file}`).join('\n')}\n\n`;
			}

			// -- summarize context if necessary
			if (defaultAgent && chatRequests.length > 1) {
				chatModel.acceptResponseProgress(addedRequest, {
					kind: 'progressMessage',
					content: new MarkdownString(
						localize('analyzingChatHistory', "Analyzing chat history"),
						CreateRemoteAgentJobAction.markdownStringTrustedOptions
					)
				});
				({ title, summary } = await this.generateSummarizedChatHistory(chatRequests, sessionId, title, chatAgentService, defaultAgent, summary));
			}

			if (title) {
				summary += `\nTITLE: ${title}\n`;
			}


			const isChatSessionsExperimentEnabled = configurationService.getValue<boolean>(ChatConfiguration.UseCloudButtonV2);
			if (isChatSessionsExperimentEnabled) {
				await chatService.removeRequest(sessionId, addedRequest.id);
				return await this.createWithChatSessions(
					chatSessionsService,
					chatService,
					quickPickService,
					sessionId,
					attachedContext,
					userPrompt,
					{
						prompt: summarizedUserPrompt,
						history: summary,
					},
				);
			}

			chatModel.acceptResponseProgress(addedRequest, {
				kind: 'progressMessage',
				content: new MarkdownString(
					localize('creatingRemoteJob', "Delegating to coding agent"),
					CreateRemoteAgentJobAction.markdownStringTrustedOptions
				)
			});

			await this.createWithLegacy(remoteCodingAgentService, commandService, quickPickService, chatModel, addedRequest, widget, summarizedUserPrompt || userPrompt, summary);
			chatModel.setResponse(addedRequest, {});
			chatModel.completeResponse(addedRequest);
		} catch (e) {
			console.error('Error creating remote coding agent job', e);
			throw e;
		} finally {
			remoteJobCreatingKey.set(false);
		}
	}

	private async generateSummarizedChatHistory(chatRequests: IChatRequestModel[], sessionId: string, title: string | undefined, chatAgentService: IChatAgentService, defaultAgent: IChatAgent, summary: string) {
		const historyEntries: IChatAgentHistoryEntry[] = chatRequests
			.map(req => ({
				request: {
					sessionId: sessionId,
					requestId: req.id,
					agentId: req.response?.agent?.id ?? '',
					message: req.message.text,
					command: req.response?.slashCommand?.name,
					variables: req.variableData,
					location: ChatAgentLocation.Chat,
					editedFileEvents: req.editedFileEvents,
				},
				response: toChatHistoryContent(req.response!.response.value),
				result: req.response?.result ?? {}
			}));

		// TODO: Determine a cutoff point where we stop including earlier history
		//      For example, if the user has already delegated to a coding agent once,
		// 		 prefer the conversation afterwards.
		title ??= await chatAgentService.getChatTitle(defaultAgent.id, historyEntries, CancellationToken.None);
		summary += await chatAgentService.getChatSummary(defaultAgent.id, historyEntries, CancellationToken.None);
		return { title, summary };
	}

	private async generateSummarizedUserPrompt(sessionId: string, userPrompt: string, attachedContext: ChatRequestVariableSet, title: string | undefined, chatAgentService: IChatAgentService, defaultAgent: IChatAgent, summarizedUserPrompt: string | undefined) {
		const userPromptEntry: IChatAgentHistoryEntry = {
			request: {
				sessionId: sessionId,
				requestId: generateUuid(),
				agentId: '',
				message: userPrompt,
				command: undefined,
				variables: { variables: attachedContext.asArray() },
				location: ChatAgentLocation.Chat,
				editedFileEvents: [],
			},
			response: [],
			result: {}
		};
		const historyEntries = [userPromptEntry];
		title = await chatAgentService.getChatTitle(defaultAgent.id, historyEntries, CancellationToken.None);
		summarizedUserPrompt = await chatAgentService.getChatSummary(defaultAgent.id, historyEntries, CancellationToken.None);
		return { title, summarizedUserPrompt };
	}
}

export class ChatSubmitWithCodebaseAction extends Action2 {
	static readonly ID = 'workbench.action.chat.submitWithCodebase';

	constructor() {
		const precondition = ContextKeyExpr.and(
			// if the input has prompt instructions attached, allow submitting requests even
			// without text present - having instructions is enough context for a request
			ContextKeyExpr.or(ChatContextKeys.inputHasText, ChatContextKeys.hasPromptFile),
			whenNotInProgress,
		);

		super({
			id: ChatSubmitWithCodebaseAction.ID,
			title: localize2('actions.chat.submitWithCodebase', "Send with {0}", `${chatVariableLeader}codebase`),
			precondition,
			menu: {
				id: MenuId.ChatExecuteSecondary,
				group: 'group_1',
				order: 3,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Chat),
					ChatContextKeys.lockedToCodingAgent.negate()
				),
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
			whenNotInProgress,
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
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Chat),
					ChatContextKeys.lockedToCodingAgent.negate()
				)
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
				when: ContextKeyExpr.and(
					ChatContextKeys.requestInProgress,
					ChatContextKeys.remoteJobCreating.negate()
				),
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

	run(accessor: ServicesAccessor, ...args: any[]) {
		const context: IChatExecuteActionContext | undefined = args[0];

		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}
		widget.finishedEditing();
	}
}


export function registerChatExecuteActions() {
	registerAction2(ChatSubmitAction);
	registerAction2(ChatDelegateToEditSessionAction);
	registerAction2(ChatEditingSessionSubmitAction);
	registerAction2(SubmitWithoutDispatchingAction);
	registerAction2(CancelAction);
	registerAction2(SendToNewChatAction);
	registerAction2(ChatSubmitWithCodebaseAction);
	registerAction2(CreateRemoteAgentJobAction);
	registerAction2(ToggleChatModeAction);
	registerAction2(SwitchToNextModelAction);
	registerAction2(OpenModelPickerAction);
	registerAction2(OpenModePickerAction);
	registerAction2(ChangeChatModelAction);
	registerAction2(CancelEdit);
}
