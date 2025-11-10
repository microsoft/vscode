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
import { isLocation } from '../../../../../editor/common/languages.js';
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
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IRemoteCodingAgent, IRemoteCodingAgentsService } from '../../../remoteCodingAgents/common/remoteCodingAgentsService.js';
import { IChatAgent, IChatAgentHistoryEntry, IChatAgentService } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
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
import { ctxHasEditorModification } from '../chatEditing/chatEditingEditorContextKeys.js';
import { chatSessionResourceToId } from '../../common/chatUri.js';
import { isITextModel } from '../../../../../editor/common/model.js';

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
}

const whenNotInProgress = ChatContextKeys.requestInProgress.negate();

export class ChatSubmitAction extends SubmitAction {
	static readonly ID = 'workbench.action.chat.submit';

	constructor() {
		const menuCondition = ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask);
		const precondition = ContextKeyExpr.and(
			ChatContextKeys.inputHasText,
			whenNotInProgress,
		);

		super({
			id: ChatSubmitAction.ID,
			title: localize2('interactive.submit.label', "Send"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.send,
			precondition,
			toggled: {
				condition: ChatContextKeys.lockedToCodingAgent,
				icon: Codicon.send,
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
						whenNotInProgress,
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
						whenNotInProgress,
						ChatContextKeys.requestInProgress.negate(),
						menuCondition
					),
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
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const context = args[0] as IChatExecuteActionContext | undefined;
		const widgetService = accessor.get(IChatWidgetService);
		const instantiationService = accessor.get(IInstantiationService);
		const inlineWidget = context?.widget ?? widgetService.lastFocusedWidget;
		const locationData = inlineWidget?.locationData;

		if (inlineWidget && locationData?.type === ChatAgentLocation.EditorInline && locationData.delegateSessionResource) {
			const sessionWidget = widgetService.getWidgetBySessionResource(locationData.delegateSessionResource);

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
	comment: 'Reporting when agent is switched between different modes';
	fromMode?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous agent' };
	toMode?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new agent' };
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

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
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
						ContextKeyExpr.or(
							ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Chat),
							ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.EditorInline),
							ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Notebook),
							ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Terminal))
					)
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
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
						ChatContextKeys.lockedToCodingAgent.negate()),
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

export class ChatSessionPrimaryPickerAction extends Action2 {
	static readonly ID = 'workbench.action.chat.chatSessionPrimaryPicker';
	constructor() {
		super({
			id: ChatSessionPrimaryPickerAction.ID,
			title: localize2('interactive.openChatSessionPrimaryPicker.label', "Open Picker"),
			category: CHAT_CATEGORY,
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: {
				id: MenuId.ChatInput,
				order: 4,
				group: 'navigation',
				when:
					ContextKeyExpr.and(
						ChatContextKeys.lockedToCodingAgent,
						ChatContextKeys.chatSessionHasModels
					)
			}
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
		const menuCondition = ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Ask);
		const precondition = ContextKeyExpr.and(
			ChatContextKeys.inputHasText,
			whenNotInProgress
		);

		super({
			id: ChatEditingSessionSubmitAction.ID,
			title: localize2('edits.submit.label', "Send"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.send,
			precondition,
			menu: [
				{
					id: MenuId.ChatExecute,
					order: 4,
					when: ContextKeyExpr.and(
						ChatContextKeys.requestInProgress.negate(),
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
export class CreateRemoteAgentJobAction extends Action2 {
	static readonly ID = 'workbench.action.chat.createRemoteAgentJob';

	static readonly markdownStringTrustedOptions = {
		isTrusted: {
			enabledCommands: [] as string[],
		},
	};

	constructor() {
		const precondition = ContextKeyExpr.and(
			ChatContextKeys.inputHasText,
			whenNotInProgress,
			ChatContextKeys.remoteJobCreating.negate(),
		);

		super({
			id: CreateRemoteAgentJobAction.ID,
			// TODO(joshspicer): Generalize title/tooltip - pull from contribution
			title: localize2('actions.chat.createRemoteJob', "Delegate to Agent"),
			icon: Codicon.sendToRemoteAgent,
			precondition,
			toggled: {
				condition: ChatContextKeys.remoteJobCreating,
				icon: Codicon.sync,
				tooltip: localize('remoteJobCreating', "Delegating to Agent"),
			},
			menu: [
				{
					id: MenuId.ChatExecute,
					group: 'navigation',
					order: 3.4,
					when: ContextKeyExpr.and(
						ContextKeyExpr.or(
							ChatContextKeys.hasRemoteCodingAgent,
							ChatContextKeys.hasCloudButtonV2
						),
						ChatContextKeys.lockedToCodingAgent.negate(),
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
				placeHolder: localize('selectBackgroundAgent', "Select Agent to delegate the task to"),
			}
		);
		if (!pick) {
			return undefined;
		}
		return pick.agent;
	}

	private async createWithChatSessions(
		targetAgentId: string,
		chatSessionsService: IChatSessionsService,
		chatService: IChatService,
		quickPickService: IQuickInputService,
		sessionResource: URI,
		attachedContext: ChatRequestVariableSet,
		userPrompt: string,
		chatSummary?: {
			prompt?: string;
			history?: string;
		}
	) {
		await chatService.sendRequest(sessionResource, userPrompt, {
			agentIdSilent: targetAgentId,
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
		if (!attachedContext) {
			return [];
		}
		const relativePaths: string[] = [];
		for (const contextEntry of attachedContext.asArray()) {
			if (isChatRequestFileEntry(contextEntry)) { // TODO: Extend for more variable types as needed
				if (!(contextEntry.value instanceof URI)) {
					continue;
				}
				const workspaceFolder = workspaceContextService.getWorkspaceFolder(contextEntry.value);
				const fileUri = contextEntry.value;
				const relativePathResult = workspaceFolder ? relativePath(workspaceFolder.uri, fileUri) : undefined;
				if (relativePathResult) {
					relativePaths.push(relativePathResult);
				}
			}
		}
		return relativePaths;
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
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
			const editorService = accessor.get(IEditorService);

			const widget = widgetService.lastFocusedWidget;
			if (!widget) {
				return;
			}
			if (!widget.viewModel) {
				return;
			}
			const chatModel = widget.viewModel.model;
			if (!chatModel) {
				return;
			}

			const sessionResource = widget.viewModel.sessionResource;
			const chatRequests = chatModel.getRequests();
			let userPrompt = widget.getInput();
			if (!userPrompt) {
				if (!chatRequests.length) {
					// Nothing to do
					return;
				}
				userPrompt = 'implement this.';
			}

			const attachedContext = widget.input.getAttachedAndImplicitContext(sessionResource);
			widget.input.acceptInput(true);

			// For inline editor mode, add selection or cursor information
			if (widget.location === ChatAgentLocation.EditorInline) {
				const activeEditor = editorService.activeTextEditorControl;
				if (activeEditor) {
					const model = activeEditor.getModel();
					let activeEditorUri: URI | undefined = undefined;
					if (model && isITextModel(model)) {
						activeEditorUri = model.uri as URI;
					}
					const selection = activeEditor.getSelection();
					if (activeEditorUri && selection) {
						attachedContext.add({
							kind: 'file',
							id: 'vscode.implicit.selection',
							name: basename(activeEditorUri),
							value: {
								uri: activeEditorUri,
								range: selection
							},
						});
					}
				}
			}

			const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
			const instantiationService = accessor.get(IInstantiationService);
			const requestParser = instantiationService.createInstance(ChatRequestParser);

			const contributions = chatSessionsService.getAllChatSessionContributions();

			// Sort contributions by order, then alphabetically by display name
			const sortedContributions = [...contributions].sort((a, b) => {
				// Both have no order - sort by display name
				if (a.order === undefined && b.order === undefined) {
					return a.displayName.localeCompare(b.displayName);
				}

				// Only a has no order - push it to the end
				if (a.order === undefined) {
					return 1;
				}

				// Only b has no order - push it to the end
				if (b.order === undefined) {
					return -1;
				}

				// Both have orders - compare numerically
				const orderCompare = a.order - b.order;
				if (orderCompare !== 0) {
					return orderCompare;
				}

				// Same order - sort by display name
				return a.displayName.localeCompare(b.displayName);
			});

			const agent = await this.pickCodingAgent(quickPickService, sortedContributions);
			if (!agent) {
				widget.setInput(userPrompt); // Restore prompt
				throw new Error('No coding agent selected');
			}
			const { type } = agent;

			// Add the request to the model first
			const parsedRequest = requestParser.parseChatRequest(sessionResource, userPrompt, ChatAgentLocation.Chat);
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

				({ title, summarizedUserPrompt } = await this.generateSummarizedUserPrompt(sessionResource, userPrompt, attachedContext, title, chatAgentService, defaultAgent, summarizedUserPrompt));
			}

			let summary: string = '';
			const relativeAttachedContext = this.extractRelativeFromAttachedContext(attachedContext, workspaceContextService);
			if (relativeAttachedContext.length) {
				summary += `\n\n${localize('attachedFiles', "The user has attached the following files from their workspace:")}\n${relativeAttachedContext.map(file => `- ${file}`).join('\n')}\n\n`;
			}

			// Add selection or cursor information to the summary
			attachedContext.asArray().forEach(ctx => {
				if (isChatRequestFileEntry(ctx) && ctx.value && isLocation(ctx.value)) {
					const range = ctx.value.range;
					const isSelection = range.startLineNumber !== range.endLineNumber || range.startColumn !== range.endColumn;

					// Get relative path for the file
					let filePath = ctx.name;
					const workspaceFolder = workspaceContextService.getWorkspaceFolder(ctx.value.uri);

					if (workspaceFolder && ctx.value.uri) {
						const relativePathResult = relativePath(workspaceFolder.uri, ctx.value.uri);
						if (relativePathResult) {
							filePath = relativePathResult;
						}
					}

					if (isSelection) {
						summary += `User has selected text in file ${filePath} from ${range.startLineNumber}:${range.startColumn} to ${range.endLineNumber}:${range.endColumn}\n`;
					} else {
						summary += `User is on file ${filePath} at position ${range.startLineNumber}:${range.startColumn}\n`;
					}
				}
			});

			// -- summarize context if necessary
			if (defaultAgent && chatRequests.length > 1) {
				chatModel.acceptResponseProgress(addedRequest, {
					kind: 'progressMessage',
					content: new MarkdownString(
						localize('analyzingChatHistory', "Analyzing chat history"),
						CreateRemoteAgentJobAction.markdownStringTrustedOptions
					)
				});
				({ title, summary } = await this.generateSummarizedChatHistory(chatRequests, sessionResource, title, chatAgentService, defaultAgent, summary));
			}

			if (title) {
				summary += `\nTITLE: ${title}\n`;
			}


			const isChatSessionsExperimentEnabled = configurationService.getValue<boolean>(ChatConfiguration.UseCloudButtonV2);
			if (isChatSessionsExperimentEnabled) {
				await chatService.removeRequest(sessionResource, addedRequest.id);
				return await this.createWithChatSessions(
					type,
					chatSessionsService,
					chatService,
					quickPickService,
					sessionResource,
					attachedContext,
					userPrompt,
					{
						prompt: summarizedUserPrompt,
						history: summary,
					},
				);
			}

			// -- Below is the legacy implementation

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

	private async generateSummarizedChatHistory(chatRequests: IChatRequestModel[], sessionResource: URI, title: string | undefined, chatAgentService: IChatAgentService, defaultAgent: IChatAgent, summary: string) {
		const historyEntries: IChatAgentHistoryEntry[] = chatRequests
			.map(req => ({
				request: {
					sessionId: chatSessionResourceToId(sessionResource),
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

	private async generateSummarizedUserPrompt(sessionResource: URI, userPrompt: string, attachedContext: ChatRequestVariableSet, title: string | undefined, chatAgentService: IChatAgentService, defaultAgent: IChatAgent, summarizedUserPrompt: string | undefined) {
		const userPromptEntry: IChatAgentHistoryEntry = {
			request: {
				sessionId: chatSessionResourceToId(sessionResource),
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
		const precondition = ContextKeyExpr.and(
			// if the input has prompt instructions attached, allow submitting requests even
			// without text present - having instructions is enough context for a request
			ContextKeyExpr.or(ChatContextKeys.inputHasText, ChatContextKeys.hasPromptFile),
		);

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
		const dialogService = accessor.get(IDialogService);
		const chatService = accessor.get(IChatService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		// Cancel any in-progress request before clearing
		if (widget.viewModel) {
			chatService.cancelCurrentRequestForSession(widget.viewModel.sessionResource);
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
			}, {
				id: MenuId.ChatEditorInlineExecute,
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

	run(accessor: ServicesAccessor, ...args: unknown[]) {
		const context = args[0] as IChatExecuteActionContext | undefined;
		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const chatService = accessor.get(IChatService);
		if (widget.viewModel) {
			chatService.cancelCurrentRequestForSession(widget.viewModel.sessionResource);
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
	registerAction2(ChatSessionPrimaryPickerAction);
	registerAction2(ChangeChatModelAction);
	registerAction2(CancelEdit);
}
