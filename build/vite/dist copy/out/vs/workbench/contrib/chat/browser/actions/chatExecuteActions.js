/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { getModeNameForTelemetry, buildCustomAgentHandoffsInfo, getHandoffId, IChatModeService } from '../../common/chatModes.js';
import { chatVariableLeader } from '../../common/requestParser/chatParserTypes.js';
import { ChatStopCancellationNoopEventName, IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { isInClaudeAgentsFolder } from '../../common/promptSyntax/config/promptFileLocations.js';
import { IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { IChatWidgetService } from '../chat.js';
import { getAgentSessionProvider, AgentSessionProviders } from '../agentSessions/agentSessions.js';
import { getEditingSessionContext } from '../chatEditing/chatEditingActions.js';
import { ctxHasEditorModification, ctxHasRequestInProgress, ctxIsGlobalEditingSession } from '../chatEditing/chatEditingEditorContextKeys.js';
import { ACTION_ID_NEW_CHAT, CHAT_CATEGORY, clearChatSessionPreservingType, handleCurrentEditingSession, handleModeSwitch } from './chatActions.js';
import { CreateRemoteAgentJobAction } from './chatContinueInAction.js';
import { CTX_HOVER_MODE } from '../../../inlineChat/common/inlineChat.js';
class SubmitAction extends Action2 {
    async run(accessor, ...args) {
        const context = args[0];
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
                let message;
                if (editsToUndo === 1) {
                    if (entriesModifiedInRequestsToRemove.length === 1) {
                        message = localize('chat.removeLast.confirmation.message2', "This will remove your last request and undo the edits made to {0}. Do you want to proceed?", basename(entriesModifiedInRequestsToRemove[0].modifiedURI));
                    }
                    else {
                        message = localize('chat.removeLast.confirmation.multipleEdits.message', "This will remove your last request and undo edits made to {0} files in your working set. Do you want to proceed?", entriesModifiedInRequestsToRemove.length);
                    }
                }
                else {
                    if (entriesModifiedInRequestsToRemove.length === 1) {
                        message = localize('chat.remove.confirmation.message2', "This will remove all subsequent requests and undo edits made to {0}. Do you want to proceed?", basename(entriesModifiedInRequestsToRemove[0].modifiedURI));
                    }
                    else {
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
                    telemetryService.publicLog2('chat.undoEditsConfirmation', {
                        editRequestType: configurationService.getValue('chat.editRequests'),
                        outcome: 'cancelled',
                        editsUndoCount: editsToUndo
                    });
                    return;
                }
                else if (editsToUndo > 0) {
                    telemetryService.publicLog2('chat.undoEditsConfirmation', {
                        editRequestType: configurationService.getValue('chat.editRequests'),
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
        }
        else if (widget?.viewModel?.model.checkpoint) {
            widget.viewModel.model.setCheckpoint(undefined);
        }
        widget?.acceptInput(context?.inputValue);
    }
    async handleDelegation(accessor, widget, delegationTarget) {
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
const requestInProgressOrPendingToolCall = ContextKeyExpr.or(ChatContextKeys.requestInProgress, ChatContextKeys.Editing.hasToolConfirmation, ChatContextKeys.Editing.hasQuestionCarousel);
const requestInProgressWithoutInput = ContextKeyExpr.and(ChatContextKeys.requestInProgress, ChatContextKeys.inputHasText.negate());
const pendingToolCall = ContextKeyExpr.or(ChatContextKeys.Editing.hasToolConfirmation, ContextKeyExpr.and(ChatContextKeys.Editing.hasQuestionCarousel, ChatContextKeys.inputHasText.negate()));
const noQuestionCarouselOrHasInput = ContextKeyExpr.or(ChatContextKeys.Editing.hasQuestionCarousel.negate(), ChatContextKeys.inputHasText);
const whenNotInProgress = ChatContextKeys.requestInProgress.negate();
export class ChatSubmitAction extends SubmitAction {
    static { this.ID = 'workbench.action.chat.submit'; }
    constructor() {
        const menuCondition = ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask);
        const precondition = ContextKeyExpr.and(ChatContextKeys.inputHasText, whenNotInProgress, ChatContextKeys.chatSessionOptionsValid);
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
                when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.withinEditSessionDiff.negate()),
                primary: 3 /* KeyCode.Enter */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            menu: [
                {
                    id: MenuId.ChatExecute,
                    order: 4,
                    when: ContextKeyExpr.and(whenNotInProgress, menuCondition, ChatContextKeys.withinEditSessionDiff.negate(), noQuestionCarouselOrHasInput),
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
                    when: ContextKeyExpr.and(ContextKeyExpr.or(ctxHasEditorModification.negate(), ChatContextKeys.inputHasText), whenNotInProgress, ChatContextKeys.requestInProgress.negate(), menuCondition),
                }
            ]
        });
    }
}
export const ToggleAgentModeActionId = 'workbench.action.chat.toggleAgentMode';
class ToggleChatModeAction extends Action2 {
    static { this.ID = ToggleAgentModeActionId; }
    constructor() {
        super({
            id: ToggleChatModeAction.ID,
            title: localize2('interactive.toggleAgent.label', "Switch to Next Agent"),
            f1: true,
            category: CHAT_CATEGORY,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.requestInProgress.negate())
        });
    }
    async run(accessor, ...args) {
        const commandService = accessor.get(ICommandService);
        const instaService = accessor.get(IInstantiationService);
        const modeService = accessor.get(IChatModeService);
        const telemetryService = accessor.get(ITelemetryService);
        const chatWidgetService = accessor.get(IChatWidgetService);
        const arg = args.at(0);
        let widget;
        if (arg?.sessionResource) {
            widget = chatWidgetService.getWidgetBySessionResource(arg.sessionResource);
        }
        else {
            widget = getEditingSessionContext(accessor, args)?.chatWidget;
        }
        if (!widget) {
            return;
        }
        const chatSession = widget.viewModel?.model;
        const requestCount = chatSession?.getRequests().length ?? 0;
        const switchToMode = (arg && (modeService.findModeById(arg.modeId) || modeService.findModeByName(arg.modeId))) ?? this.getNextMode(widget, requestCount, modeService);
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
        telemetryService.publicLog2('chat.modeChange', {
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
    getNextMode(chatWidget, requestCount, modeService) {
        const modes = modeService.getModes();
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
    static { this.ID = 'workbench.action.chat.switchToNextModel'; }
    constructor() {
        super({
            id: SwitchToNextModelAction.ID,
            title: localize2('interactive.switchToNextModel.label', "Switch to Next Model"),
            category: CHAT_CATEGORY,
            f1: true,
            precondition: ChatContextKeys.enabled,
        });
    }
    run(accessor, ...args) {
        const widgetService = accessor.get(IChatWidgetService);
        const widget = widgetService.lastFocusedWidget;
        widget?.input.switchToNextModel();
    }
}
export class OpenModelPickerAction extends Action2 {
    static { this.ID = 'workbench.action.chat.openModelPicker'; }
    constructor() {
        super({
            id: OpenModelPickerAction.ID,
            title: localize2('interactive.openModelPicker.label', "Open Model Picker"),
            category: CHAT_CATEGORY,
            f1: false,
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 89 /* KeyCode.Period */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ChatContextKeys.inChatInput
            },
            precondition: ChatContextKeys.enabled,
            menu: {
                id: MenuId.ChatInput,
                order: 3,
                group: 'navigation',
                when: ContextKeyExpr.and(ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeys.chatSessionHasTargetedModels), ContextKeyExpr.or(ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Chat), ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.EditorInline), ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Notebook), ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Terminal)), 
                // Hide in welcome view when session type is not local
                ContextKeyExpr.or(ChatContextKeys.inAgentSessionsWelcome.negate(), ChatContextKeys.chatSessionHasTargetedModels, ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local)))
            }
        });
    }
    async run(accessor, ...args) {
        const widgetService = accessor.get(IChatWidgetService);
        const widget = widgetService.lastFocusedWidget;
        if (widget) {
            await widgetService.reveal(widget);
            widget.input.openModelPicker();
        }
    }
}
export class OpenPermissionPickerAction extends Action2 {
    static { this.ID = 'workbench.action.chat.openPermissionPicker'; }
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
                order: 10,
                group: 'navigation',
                when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat), ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Ask), ChatContextKeys.inQuickChat.negate(), ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeys.lockedCodingAgentId.isEqualTo(AgentSessionProviders.Background)))
            }
        });
    }
    async run(accessor) {
        const widgetService = accessor.get(IChatWidgetService);
        const widget = widgetService.lastFocusedWidget;
        if (widget) {
            widget.input.openPermissionPicker();
        }
    }
}
export class OpenModePickerAction extends Action2 {
    static { this.ID = 'workbench.action.chat.openModePicker'; }
    constructor() {
        super({
            id: OpenModePickerAction.ID,
            title: localize2('interactive.openModePicker.label', "Open Agent Picker"),
            tooltip: localize('setChatMode', "Set Agent"),
            category: CHAT_CATEGORY,
            f1: false,
            precondition: ChatContextKeys.enabled,
            keybinding: {
                when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
                primary: 2048 /* KeyMod.CtrlCmd */ | 89 /* KeyCode.Period */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            menu: [
                {
                    id: MenuId.ChatInput,
                    order: 1,
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat), ChatContextKeys.inQuickChat.negate(), ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeys.chatSessionHasCustomAgentTarget), 
                    // Show in welcome view for local sessions or sessions with custom agent target
                    ContextKeyExpr.or(ChatContextKeys.inAgentSessionsWelcome.negate(), ChatContextKeys.chatSessionHasCustomAgentTarget, ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local))),
                    group: 'navigation',
                },
            ]
        });
    }
    async run(accessor, ...args) {
        const widgetService = accessor.get(IChatWidgetService);
        const widget = widgetService.lastFocusedWidget;
        if (widget) {
            widget.input.openModePicker();
        }
    }
}
export class OpenSessionTargetPickerAction extends Action2 {
    static { this.ID = 'workbench.action.chat.openSessionTargetPicker'; }
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
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat), ChatContextKeys.inQuickChat.negate(), ChatContextKeys.chatSessionIsEmpty, IsSessionsWindowContext),
                    group: 'navigation',
                },
                {
                    id: MenuId.ChatInputSecondary,
                    order: 0,
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat), ChatContextKeys.inQuickChat.negate(), IsSessionsWindowContext.negate(), ChatContextKeys.chatSessionIsEmpty),
                    group: 'navigation',
                },
            ]
        });
    }
    async run(accessor, ...args) {
        const widgetService = accessor.get(IChatWidgetService);
        const widget = widgetService.lastFocusedWidget;
        if (widget) {
            widget.input.openSessionTargetPicker();
        }
    }
}
export class OpenDelegationPickerAction extends Action2 {
    static { this.ID = 'workbench.action.chat.openDelegationPicker'; }
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
                    when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat), ChatContextKeys.inQuickChat.negate(), ChatContextKeys.chatSessionSupportsDelegation, ChatContextKeys.chatSessionIsEmpty.negate()),
                    group: 'navigation',
                },
            ]
        });
    }
    async run(accessor, ...args) {
        const widgetService = accessor.get(IChatWidgetService);
        const widget = widgetService.lastFocusedWidget;
        if (widget) {
            widget.input.openDelegationPicker();
        }
    }
}
export class OpenWorkspacePickerAction extends Action2 {
    static { this.ID = 'workbench.action.chat.openWorkspacePicker'; }
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
                    id: MenuId.ChatInput,
                    order: 0.6,
                    when: ContextKeyExpr.and(ChatContextKeys.inAgentSessionsWelcome, ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType), IsSessionsWindowContext),
                    group: 'navigation',
                },
                {
                    id: MenuId.ChatInputSecondary,
                    order: 0.6,
                    when: ContextKeyExpr.and(ChatContextKeys.inAgentSessionsWelcome, ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType), IsSessionsWindowContext.negate()),
                    group: 'navigation',
                },
            ]
        });
    }
    async run(accessor, ...args) {
        // The picker is opened via the action view item
    }
}
export class ChatSessionPrimaryPickerAction extends Action2 {
    static { this.ID = 'workbench.action.chat.chatSessionPrimaryPicker'; }
    constructor() {
        super({
            id: ChatSessionPrimaryPickerAction.ID,
            title: localize2('interactive.openChatSessionPrimaryPicker.label', "Open Primary Session Picker"),
            category: CHAT_CATEGORY,
            f1: false,
            precondition: ChatContextKeys.enabled,
            menu: {
                id: MenuId.ChatInput,
                order: 4,
                group: 'navigation',
                when: ContextKeyExpr.and(ChatContextKeys.chatSessionHasModels, ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent, ContextKeyExpr.and(ChatContextKeys.inAgentSessionsWelcome, ChatContextKeys.chatSessionType.notEqualsTo('local'))))
            }
        });
    }
    async run(accessor, ...args) {
        const widgetService = accessor.get(IChatWidgetService);
        const widget = widgetService.lastFocusedWidget;
        if (widget) {
            widget.input.openChatSessionPicker();
        }
    }
}
export const ChangeChatModelActionId = 'workbench.action.chat.changeModel';
class ChangeChatModelAction extends Action2 {
    static { this.ID = ChangeChatModelActionId; }
    constructor() {
        super({
            id: ChangeChatModelAction.ID,
            title: localize2('interactive.changeModel.label', "Change Model"),
            category: CHAT_CATEGORY,
            f1: false,
            precondition: ChatContextKeys.enabled,
        });
    }
    run(accessor, ...args) {
        const modelInfo = args[0];
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
    static { this.ID = 'workbench.action.edits.submit'; }
    constructor() {
        const notInProgressOrEditing = ContextKeyExpr.and(ContextKeyExpr.or(whenNotInProgress, ChatContextKeys.editingRequestType.isEqualTo("s" /* ChatContextKeys.EditingRequestType.Sent */)), ChatContextKeys.editingRequestType.notEqualsTo("q" /* ChatContextKeys.EditingRequestType.Queue */), ChatContextKeys.editingRequestType.notEqualsTo("st" /* ChatContextKeys.EditingRequestType.Steer */));
        const menuCondition = ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Ask);
        const precondition = ContextKeyExpr.and(ChatContextKeys.inputHasText, notInProgressOrEditing, ChatContextKeys.chatSessionOptionsValid);
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
                    when: ContextKeyExpr.and(notInProgressOrEditing, menuCondition, noQuestionCarouselOrHasInput),
                    group: 'navigation',
                    alt: {
                        id: 'workbench.action.chat.sendToNewChat',
                        title: localize2('chat.newChat.label', "Send to New Chat"),
                        icon: Codicon.plus
                    }
                }
            ]
        });
    }
}
class SubmitWithoutDispatchingAction extends Action2 {
    static { this.ID = 'workbench.action.chat.submitWithoutDispatching'; }
    constructor() {
        const precondition = ContextKeyExpr.and(ChatContextKeys.inputHasText, whenNotInProgress, ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask));
        super({
            id: SubmitWithoutDispatchingAction.ID,
            title: localize2('interactive.submitWithoutDispatch.label', "Send"),
            f1: false,
            category: CHAT_CATEGORY,
            precondition,
            keybinding: {
                when: ChatContextKeys.inChatInput,
                primary: 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(accessor, ...args) {
        const context = args[0];
        const widgetService = accessor.get(IChatWidgetService);
        const widget = context?.widget ?? widgetService.lastFocusedWidget;
        widget?.acceptInput(context?.inputValue, { noCommandDetection: true });
    }
}
export class ChatSubmitWithCodebaseAction extends Action2 {
    static { this.ID = 'workbench.action.chat.submitWithCodebase'; }
    constructor() {
        const precondition = ContextKeyExpr.and(ChatContextKeys.inputHasText, whenNotInProgress);
        super({
            id: ChatSubmitWithCodebaseAction.ID,
            title: localize2('actions.chat.submitWithCodebase', "Send with {0}", `${chatVariableLeader}codebase`),
            precondition,
            keybinding: {
                when: ChatContextKeys.inChatInput,
                primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
        });
    }
    run(accessor, ...args) {
        const context = args[0];
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
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */,
                when: ChatContextKeys.inChatInput,
            }
        });
    }
    async run(accessor, ...args) {
        const context = args[0];
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
    static { this.ID = CancelChatActionId; }
    constructor() {
        super({
            id: CancelAction.ID,
            title: localize2('interactive.cancel.label', "Cancel"),
            f1: false,
            category: CHAT_CATEGORY,
            icon: Codicon.stopCircle,
            menu: [{
                    id: MenuId.ChatExecute,
                    when: ContextKeyExpr.and(ContextKeyExpr.or(requestInProgressWithoutInput, pendingToolCall), ChatContextKeys.remoteJobCreating.negate(), ChatContextKeys.currentlyEditing.negate()),
                    order: 4,
                    group: 'navigation',
                }, {
                    id: MenuId.ChatEditorInlineExecute,
                    when: ContextKeyExpr.and(ctxIsGlobalEditingSession.negate(), ctxHasRequestInProgress, CTX_HOVER_MODE.negate()),
                    order: 4,
                    group: 'navigation',
                }
            ],
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 9 /* KeyCode.Escape */,
                when: ContextKeyExpr.and(requestInProgressOrPendingToolCall, ChatContextKeys.remoteJobCreating.negate()),
                win: { primary: 512 /* KeyMod.Alt */ | 1 /* KeyCode.Backspace */ },
            }
        });
    }
    async run(accessor, ...args) {
        const context = args[0];
        const widgetService = accessor.get(IChatWidgetService);
        const logService = accessor.get(ILogService);
        const telemetryService = accessor.get(ITelemetryService);
        const widget = context?.widget ?? widgetService.lastFocusedWidget;
        if (!widget) {
            telemetryService.publicLog2(ChatStopCancellationNoopEventName, {
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
        }
        else {
            telemetryService.publicLog2(ChatStopCancellationNoopEventName, {
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
    static { this.ID = CancelChatEditId; }
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
                primary: 9 /* KeyCode.Escape */,
                when: ContextKeyExpr.and(ChatContextKeys.inChatInput, EditorContextKeys.hoverVisible.toNegated(), EditorContextKeys.hasNonEmptySelection.toNegated(), EditorContextKeys.hasMultipleSelections.toNegated(), ContextKeyExpr.or(ChatContextKeys.currentlyEditing, ChatContextKeys.currentlyEditingInput)),
                weight: 100 /* KeybindingWeight.EditorContrib */ - 5
            }
        });
    }
    run(accessor, ...args) {
        const context = args[0];
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
    static { this.ID = GetHandoffsActionId; }
    constructor() {
        super({
            id: GetHandoffsAction.ID,
            title: localize2('chat.getHandoffs.label', "Get Handoffs"),
            f1: false,
            category: CHAT_CATEGORY,
        });
    }
    run(accessor, ...args) {
        const modeService = accessor.get(IChatModeService);
        const arg = args.at(0);
        const { builtin, custom } = modeService.getModes();
        let allModes = [...builtin, ...custom];
        if (arg?.sourceCustomAgent) {
            const filterName = arg.sourceCustomAgent;
            allModes = allModes.filter(m => m.name.get().toLowerCase() === filterName.toLowerCase());
        }
        return buildCustomAgentHandoffsInfo(allModes);
    }
}
export const ExecuteHandoffActionId = 'workbench.action.chat.executeHandoff';
class ExecuteHandoffAction extends Action2 {
    static { this.ID = ExecuteHandoffActionId; }
    constructor() {
        super({
            id: ExecuteHandoffAction.ID,
            title: localize2('chat.executeHandoff.label', "Execute Handoff"),
            f1: false,
            category: CHAT_CATEGORY,
        });
    }
    async run(accessor, ...args) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const modeService = accessor.get(IChatModeService);
        const arg = args.at(0);
        if (!arg?.id && !arg?.label) {
            return { success: false, error: 'Either id or label is required' };
        }
        // Resolve the target widget: explicit sessionResource, or fall back to last-focused
        let widget;
        if (arg.sessionResource) {
            let sessionResource;
            try {
                sessionResource = URI.parse(arg.sessionResource);
            }
            catch {
                return { success: false, error: `Invalid sessionResource URI: '${arg.sessionResource}'` };
            }
            widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
        }
        else {
            widget = chatWidgetService.lastFocusedWidget;
        }
        if (!widget) {
            return { success: false, error: 'No chat widget found. Provide sessionResource or focus a chat widget.' };
        }
        // Resolve the source custom agent whose handoffs we search (case-insensitive)
        let sourceMode;
        if (arg.sourceCustomAgent) {
            const filterName = arg.sourceCustomAgent.toLowerCase();
            const { builtin, custom } = modeService.getModes();
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
export function registerChatExecuteActions() {
    registerAction2(ChatSubmitAction);
    registerAction2(ChatEditingSessionSubmitAction);
    registerAction2(SubmitWithoutDispatchingAction);
    registerAction2(CancelAction);
    registerAction2(SendToNewChatAction);
    registerAction2(ChatSubmitWithCodebaseAction);
    registerAction2(ToggleChatModeAction);
    registerAction2(SwitchToNextModelAction);
    registerAction2(OpenModelPickerAction);
    registerAction2(OpenPermissionPickerAction);
    registerAction2(OpenModePickerAction);
    registerAction2(OpenSessionTargetPickerAction);
    registerAction2(OpenDelegationPickerAction);
    registerAction2(OpenWorkspacePickerAction);
    registerAction2(ChatSessionPrimaryPickerAction);
    registerAction2(ChangeChatModelAction);
    registerAction2(CancelEdit);
    registerAction2(GetHandoffsAction);
    registerAction2(ExecuteHandoffAction);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEV4ZWN1dGVBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdEV4ZWN1dGVBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFeEQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNyRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFD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