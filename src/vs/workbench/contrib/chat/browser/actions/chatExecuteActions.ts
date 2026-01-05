/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
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
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatMode, IChatModeService } from '../../common/chatModes.js';
import { chatVariableLeader } from '../../common/requestParser/chatParserTypes.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, } from '../../common/constants.js';
import { ILanguageModelChatMetadata } from '../../common/languageModels.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { getEditingSessionContext } from '../chatEditing/chatEditingActions.js';
import { ctxHasEditorModification } from '../chatEditing/chatEditingEditorContextKeys.js';
import { ACTION_ID_NEW_CHAT, CHAT_CATEGORY, handleCurrentEditingSession, handleModeSwitch } from './chatActions.js';
import { ContinueChatInSessionAction } from './chatContinueInAction.js';

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
		const inlineWidget = context?.widget ?? widgetService.lastFocusedWidget;
		const locationData = inlineWidget?.locationData;

		if (inlineWidget && locationData?.type === ChatAgentLocation.EditorInline && locationData.delegateSessionResource) {
			const sessionWidget = widgetService.getWidgetBySessionResource(locationData.delegateSessionResource);

			if (sessionWidget) {
				await widgetService.reveal(sessionWidget);
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
};

type ChatModeChangeEvent = {
	fromMode: string;
	mode: string;
	requestCount: number;
	storage?: string;
	extensionId?: string;
	toolsCount?: number;
	handoffsCount?: number;
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
		const switchToMode = (arg && modeService.findModeById(arg.modeId)) ?? this.getNextMode(widget, requestCount, configurationService, modeService);

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

		telemetryService.publicLog2<ChatModeChangeEvent, ChatModeChangeClassification>('chat.modeChange', {
			fromMode: currentMode.name.get(),
			mode: switchToMode.name.get(),
			requestCount: requestCount,
			storage,
			extensionId,
			toolsCount,
			handoffsCount
		});

		widget.input.setChatMode(switchToMode.id);

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
			await widgetService.reveal(widget);
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
		const dialogService = accessor.get(IDialogService);
		const chatService = accessor.get(IChatService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const inputBeforeClear = widget.getInput();

		// Cancel any in-progress request before clearing
		if (widget.viewModel) {
			chatService.cancelCurrentRequestForSession(widget.viewModel.sessionResource);
		}

		if (widget.viewModel?.model) {
			if (!(await handleCurrentEditingSession(widget.viewModel.model, undefined, dialogService))) {
				return;
			}
		}

		await widget.clear();
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
	registerAction2(ContinueChatInSessionAction);
	registerAction2(ToggleChatModeAction);
	registerAction2(SwitchToNextModelAction);
	registerAction2(OpenModelPickerAction);
	registerAction2(OpenModePickerAction);
	registerAction2(ChatSessionPrimaryPickerAction);
	registerAction2(ChangeChatModelAction);
	registerAction2(CancelEdit);
}
