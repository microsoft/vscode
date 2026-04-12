/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { isCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { isImplicitVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry, isStringVariableEntry, isWorkspaceVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { isChatViewTitleActionContext } from '../../common/actions/chatActions.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { applyingChatEditsFailedContextKey, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingResourceContextKey, chatEditingWidgetFileStateContextKey, decidedChatEditingResourceContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService } from '../../common/editing/chatEditingService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { isChatTreeItem, isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { IChatWidgetService } from '../chat.js';
import { isAgentSession } from '../agentSessions/agentSessionsModel.js';
import { AgentSessionProviders } from '../agentSessions/agentSessions.js';
export class EditingSessionAction extends Action2 {
    constructor(opts) {
        super({
            category: CHAT_CATEGORY,
            ...opts
        });
    }
    run(accessor, ...args) {
        const context = getEditingSessionContext(accessor, args);
        if (!context || !context.editingSession) {
            return;
        }
        return this.runEditingSessionAction(accessor, context.editingSession, context.chatWidget, ...args);
    }
}
/**
 * Resolve view title toolbar context. If none, return context from the lastFocusedWidget.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEditingSessionContext(accessor, args) {
    const arg0 = args.at(0);
    const context = isChatViewTitleActionContext(arg0) ? arg0 : undefined;
    const chatWidgetService = accessor.get(IChatWidgetService);
    const chatEditingService = accessor.get(IChatEditingService);
    let chatWidget = context ? chatWidgetService.getWidgetBySessionResource(context.sessionResource) : undefined;
    if (!chatWidget) {
        chatWidget = chatWidgetService.lastFocusedWidget ?? chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).find(w => w.supportsChangingModes);
    }
    if (!chatWidget?.viewModel) {
        return;
    }
    const editingSession = chatEditingService.getEditingSession(chatWidget.viewModel.model.sessionResource);
    return { editingSession, chatWidget };
}
class WorkingSetAction extends EditingSessionAction {
    runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
        const uris = [];
        if (URI.isUri(args[0])) {
            uris.push(args[0]);
        }
        else if (chatWidget) {
            uris.push(...chatWidget.input.selectedElements);
        }
        if (!uris.length) {
            return;
        }
        return this.runWorkingSetAction(accessor, editingSession, chatWidget, ...uris);
    }
}
registerAction2(class OpenFileInDiffAction extends WorkingSetAction {
    constructor() {
        super({
            id: 'chatEditing.openFileInDiff',
            title: localize2('open.fileInDiff', 'Open Changes in Diff Editor'),
            icon: Codicon.diffSingle,
            menu: [{
                    id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
                    when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, 0 /* ModifiedFileEntryState.Modified */),
                    order: 2,
                    group: 'navigation'
                }],
        });
    }
    async runWorkingSetAction(accessor, currentEditingSession, _chatWidget, ...uris) {
        const editorService = accessor.get(IEditorService);
        for (const uri of uris) {
            let pane = editorService.activeEditorPane;
            if (!pane) {
                pane = await editorService.openEditor({ resource: uri });
            }
            if (!pane) {
                return;
            }
            const editedFile = currentEditingSession.getEntry(uri);
            editedFile?.getEditorIntegration(pane).toggleDiff(undefined, true);
        }
    }
});
registerAction2(class AcceptAction extends WorkingSetAction {
    constructor() {
        super({
            id: 'chatEditing.acceptFile',
            title: localize2('accept.file', 'Keep'),
            icon: Codicon.check,
            menu: [{
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
                    id: MenuId.MultiDiffEditorFileToolbar,
                    order: 0,
                    group: 'navigation',
                }, {
                    id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
                    when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, 0 /* ModifiedFileEntryState.Modified */),
                    order: 0,
                    group: 'navigation'
                }],
        });
    }
    async runWorkingSetAction(accessor, currentEditingSession, chatWidget, ...uris) {
        await currentEditingSession.accept(...uris);
    }
});
registerAction2(class DiscardAction extends WorkingSetAction {
    constructor() {
        super({
            id: 'chatEditing.discardFile',
            title: localize2('discard.file', 'Undo'),
            icon: Codicon.discard,
            menu: [{
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
                    id: MenuId.MultiDiffEditorFileToolbar,
                    order: 2,
                    group: 'navigation',
                }, {
                    id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
                    when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, 0 /* ModifiedFileEntryState.Modified */),
                    order: 1,
                    group: 'navigation'
                }],
        });
    }
    async runWorkingSetAction(accessor, currentEditingSession, chatWidget, ...uris) {
        await currentEditingSession.reject(...uris);
    }
});
export class ChatEditingAcceptAllAction extends EditingSessionAction {
    constructor() {
        super({
            id: 'chatEditing.acceptAllFiles',
            title: localize('accept', 'Keep'),
            icon: Codicon.check,
            tooltip: localize('acceptAllEdits', 'Keep All Edits'),
            precondition: hasUndecidedChatEditingResourceContextKey,
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
                when: ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey, ChatContextKeys.inChatInput),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
            },
            menu: [
                {
                    id: MenuId.ChatEditingWidgetToolbar,
                    group: 'navigation',
                    order: 0,
                    when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey))
                }
            ]
        });
    }
    async runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
        await editingSession.accept();
    }
}
registerAction2(ChatEditingAcceptAllAction);
export class ChatEditingDiscardAllAction extends EditingSessionAction {
    constructor() {
        super({
            id: 'chatEditing.discardAllFiles',
            title: localize('discard', 'Undo'),
            icon: Codicon.discard,
            tooltip: localize('discardAllEdits', 'Undo All Edits'),
            precondition: hasUndecidedChatEditingResourceContextKey,
            menu: [
                {
                    id: MenuId.ChatEditingWidgetToolbar,
                    group: 'navigation',
                    order: 1,
                    when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), hasUndecidedChatEditingResourceContextKey)
                }
            ],
            keybinding: {
                when: ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey, ChatContextKeys.inChatInput, ChatContextKeys.inputHasText.negate()),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */,
            },
        });
    }
    async runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
        await discardAllEditsWithConfirmation(accessor, editingSession);
    }
}
registerAction2(ChatEditingDiscardAllAction);
export class ToggleExplanationWidgetAction extends EditingSessionAction {
    static { this.ID = 'chatEditing.toggleExplanationWidget'; }
    constructor() {
        super({
            id: ToggleExplanationWidgetAction.ID,
            title: localize('explainButton', 'Explain'),
            tooltip: localize('toggleExplanationTooltip', 'Toggle Change Explanations'),
            precondition: hasUndecidedChatEditingResourceContextKey,
            menu: [
                {
                    id: MenuId.ChatEditingWidgetToolbar,
                    group: 'navigation',
                    order: 2,
                    when: ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey, ContextKeyExpr.has(`config.${ChatConfiguration.ExplainChangesEnabled}`))
                }
            ],
        });
    }
    async runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
        if (editingSession.hasExplanations()) {
            editingSession.clearExplanations();
        }
        else {
            await editingSession.triggerExplanationGeneration();
        }
    }
}
registerAction2(ToggleExplanationWidgetAction);
export async function discardAllEditsWithConfirmation(accessor, currentEditingSession) {
    const dialogService = accessor.get(IDialogService);
    // Ask for confirmation if there are any edits
    const entries = currentEditingSession.entries.get().filter(e => e.state.get() === 0 /* ModifiedFileEntryState.Modified */);
    if (entries.length > 0) {
        const confirmation = await dialogService.confirm({
            title: localize('chat.editing.discardAll.confirmation.title', "Undo all edits?"),
            message: entries.length === 1
                ? localize('chat.editing.discardAll.confirmation.oneFile', "This will undo changes made in {0}. Do you want to proceed?", basename(entries[0].modifiedURI))
                : localize('chat.editing.discardAll.confirmation.manyFiles', "This will undo changes made in {0} files. Do you want to proceed?", entries.length),
            primaryButton: localize('chat.editing.discardAll.confirmation.primaryButton', "Yes"),
            type: 'info'
        });
        if (!confirmation.confirmed) {
            return false;
        }
    }
    await currentEditingSession.reject();
    return true;
}
export class ChatEditingShowChangesAction extends EditingSessionAction {
    static { this.ID = 'chatEditing.viewChanges'; }
    static { this.LABEL = localize('chatEditing.viewChanges', 'View All Edits'); }
    constructor() {
        super({
            id: ChatEditingShowChangesAction.ID,
            title: { value: ChatEditingShowChangesAction.LABEL, original: ChatEditingShowChangesAction.LABEL },
            tooltip: ChatEditingShowChangesAction.LABEL,
            f1: true,
            icon: Codicon.diffMultiple,
            precondition: hasUndecidedChatEditingResourceContextKey,
            menu: [
                {
                    id: MenuId.ChatEditingWidgetToolbar,
                    group: 'navigation',
                    order: 4,
                    when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.and(hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey))
                }
            ],
        });
    }
    async runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
        await editingSession.show();
    }
}
registerAction2(ChatEditingShowChangesAction);
export class ViewAllSessionChangesAction extends Action2 {
    static { this.ID = 'chatEditing.viewAllSessionChanges'; }
    constructor() {
        super({
            id: ViewAllSessionChangesAction.ID,
            title: localize2('chatEditing.viewAllSessionChanges', 'View All Changes'),
            icon: Codicon.diffMultiple,
            category: CHAT_CATEGORY,
            precondition: ContextKeyExpr.and(ContextKeyExpr.equals('sessions.hasGitRepository', true), ChatContextKeys.hasAgentSessionChanges),
            menu: [
                {
                    id: MenuId.ChatEditingSessionChangesToolbar,
                    group: 'navigation',
                    order: 10,
                }
            ],
        });
    }
    async run(accessor, sessionOrSessionResource) {
        const agentSessionsService = accessor.get(IAgentSessionsService);
        const commandService = accessor.get(ICommandService);
        const chatEditingService = accessor.get(IChatEditingService);
        if (!URI.isUri(sessionOrSessionResource) && !isAgentSession(sessionOrSessionResource)) {
            return;
        }
        const sessionResource = URI.isUri(sessionOrSessionResource)
            ? sessionOrSessionResource
            : sessionOrSessionResource.resource;
        const session = agentSessionsService.getSession(sessionResource);
        const changes = session?.changes;
        if (!session || !changes) {
            return;
        }
        if (session.providerType === AgentSessionProviders.Background ||
            session.providerType === AgentSessionProviders.Cloud) {
            if (!Array.isArray(changes) || changes.length === 0) {
                return;
            }
            // Use agent session changes
            const resources = changes.map(d => ({
                originalUri: d.originalUri,
                modifiedUri: d.modifiedUri
            }));
            await commandService.executeCommand('_workbench.openMultiDiffEditor', {
                multiDiffSourceUri: sessionResource.with({ scheme: sessionResource.scheme + '-worktree-changes' }),
                title: localize('chatEditing.allChanges.title', 'All Session Changes'),
                resources,
            });
            session?.setRead(true);
            return;
        }
        // Use edit session changes
        const editingSession = chatEditingService.getEditingSession(sessionResource);
        await editingSession?.show();
        session?.setRead(true);
    }
}
registerAction2(ViewAllSessionChangesAction);
function filterToUserAttachedContext(attachedContext) {
    if (!attachedContext?.length) {
        return [];
    }
    return attachedContext.filter(a => !isImplicitVariableEntry(a) &&
        !isWorkspaceVariableEntry(a) &&
        !isStringVariableEntry(a) &&
        !(isPromptFileVariableEntry(a) && a.automaticallyAdded) &&
        !(isPromptTextVariableEntry(a) && a.automaticallyAdded));
}
async function restoreSnapshotWithConfirmationByRequestId(accessor, sessionResource, requestId) {
    const configurationService = accessor.get(IConfigurationService);
    const dialogService = accessor.get(IDialogService);
    const chatWidgetService = accessor.get(IChatWidgetService);
    const widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
    const chatService = accessor.get(IChatService);
    const chatModel = chatService.getSession(sessionResource);
    if (!chatModel) {
        return false;
    }
    const session = chatModel.editingSession;
    if (!session) {
        return false;
    }
    const chatRequests = chatModel.getRequests();
    const itemIndex = chatRequests.findIndex(request => request.id === requestId);
    if (itemIndex === -1) {
        return false;
    }
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
        widget?.viewModel?.model.setCheckpoint(undefined);
        return false;
    }
    if (confirmation.checkboxChecked) {
        await configurationService.updateValue('chat.editing.confirmEditRequestRemoval', false);
    }
    await chatService.cancelCurrentRequestForSession(sessionResource, 'restoreCheckpoint');
    // Restore the snapshot to what it was before the request(s) that we deleted
    const snapshotRequestId = chatRequests[itemIndex].id;
    await session.restoreSnapshot(snapshotRequestId, undefined);
    return true;
}
async function restoreSnapshotWithConfirmation(accessor, item) {
    const requestId = isRequestVM(item) ? item.id :
        isResponseVM(item) ? item.requestId : undefined;
    if (!requestId) {
        return false;
    }
    return restoreSnapshotWithConfirmationByRequestId(accessor, item.sessionResource, requestId);
}
registerAction2(class RemoveAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.undoEdits',
            title: localize2('chat.undoEdits.label', "Undo Requests"),
            f1: false,
            category: CHAT_CATEGORY,
            icon: Codicon.discard,
            keybinding: {
                primary: 20 /* KeyCode.Delete */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */,
                },
                when: ContextKeyExpr.and(ChatContextKeys.inChatSession, EditorContextKeys.textInputFocus.negate(), ChatContextKeys.inChatQuestionCarousel.negate()),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
            },
            menu: [
                {
                    id: MenuId.ChatMessageTitle,
                    group: 'navigation',
                    order: 2,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${ChatConfiguration.EditRequests}`, 'input').negate(), ContextKeyExpr.equals(`config.${ChatConfiguration.CheckpointsEnabled}`, false), ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeyExprs.isAgentHostSession)),
                }
            ]
        });
    }
    async run(accessor, ...args) {
        let item = args[0];
        const chatWidgetService = accessor.get(IChatWidgetService);
        const configurationService = accessor.get(IConfigurationService);
        const widget = (isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource)) || chatWidgetService.lastFocusedWidget;
        if (!isResponseVM(item) && !isRequestVM(item)) {
            item = widget?.getFocus();
        }
        if (!item) {
            return;
        }
        const confirmed = await restoreSnapshotWithConfirmation(accessor, item);
        if (confirmed && isRequestVM(item) && configurationService.getValue('chat.undoRequests.restoreInput')) {
            widget?.focusInput();
            widget?.input.setValue(item.messageText, false);
            const userAttachments = filterToUserAttachedContext(item.attachedContext);
            if (userAttachments.length) {
                await widget?.input.restoreAttachments(userAttachments);
            }
        }
    }
});
registerAction2(class RestoreCheckpointAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.restoreCheckpoint',
            title: localize2('chat.restoreCheckpoint.label', "Restore Checkpoint"),
            tooltip: localize2('chat.restoreCheckpoint.tooltip', "Restores workspace and chat to this point"),
            f1: false,
            category: CHAT_CATEGORY,
            keybinding: {
                primary: 20 /* KeyCode.Delete */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */,
                },
                when: ContextKeyExpr.and(ChatContextKeys.inChatSession, EditorContextKeys.textInputFocus.negate(), ChatContextKeys.inChatQuestionCarousel.negate()),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
            },
            menu: [
                {
                    id: MenuId.ChatMessageCheckpoint,
                    group: 'navigation',
                    order: 2,
                    when: ContextKeyExpr.and(ChatContextKeys.isRequest, ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeyExprs.isAgentHostSession), ChatContextKeys.isFirstRequest.negate())
                }
            ]
        });
    }
    async run(accessor, ...args) {
        let item = args[0];
        const chatWidgetService = accessor.get(IChatWidgetService);
        const widget = (isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource)) || chatWidgetService.lastFocusedWidget;
        if (!isResponseVM(item) && !isRequestVM(item)) {
            item = widget?.getFocus();
        }
        if (!item) {
            return;
        }
        const userAttachments = isRequestVM(item) ? filterToUserAttachedContext(item.attachedContext) : [];
        if (isRequestVM(item)) {
            widget?.focusInput();
            widget?.input.setValue(item.messageText, false);
        }
        widget?.viewModel?.model.setCheckpoint(item.id);
        const confirmed = await restoreSnapshotWithConfirmation(accessor, item);
        if (confirmed && userAttachments.length) {
            await widget?.input.restoreAttachments(userAttachments);
        }
    }
});
registerAction2(class StartOverAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.startOver',
            title: localize2('chat.startOver.label', "Start Over"),
            tooltip: localize2('chat.startOver.tooltip', "Clears the chat and undoes all changes"),
            f1: false,
            category: CHAT_CATEGORY,
            menu: [
                {
                    id: MenuId.ChatMessageCheckpoint,
                    group: 'navigation',
                    order: 2,
                    when: ContextKeyExpr.and(ChatContextKeys.isRequest, ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeyExprs.isAgentHostSession), ChatContextKeys.isFirstRequest)
                }
            ]
        });
    }
    async run(accessor, ...args) {
        let item = args[0];
        const chatWidgetService = accessor.get(IChatWidgetService);
        const widget = (isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource)) || chatWidgetService.lastFocusedWidget;
        if (!isResponseVM(item) && !isRequestVM(item)) {
            item = widget?.getFocus();
        }
        if (!item) {
            return;
        }
        widget?.viewModel?.model.setCheckpoint(item.id);
        await restoreSnapshotWithConfirmation(accessor, item);
    }
});
registerAction2(class RestoreLastCheckpoint extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.restoreLastCheckpoint',
            title: localize2('chat.restoreLastCheckpoint.label', "Restore to Last Checkpoint"),
            f1: true,
            category: CHAT_CATEGORY,
            icon: Codicon.discard,
            precondition: ContextKeyExpr.and(ChatContextKeys.inChatSession, ContextKeyExpr.equals(`config.${ChatConfiguration.CheckpointsEnabled}`, true), ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeyExprs.isAgentHostSession))
        });
    }
    async run(accessor, ...args) {
        let item = args[0];
        const chatWidgetService = accessor.get(IChatWidgetService);
        const chatService = accessor.get(IChatService);
        const widget = (isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource)) || chatWidgetService.lastFocusedWidget;
        if (!isResponseVM(item) && !isRequestVM(item)) {
            item = widget?.getFocus();
        }
        const sessionResource = widget?.viewModel?.sessionResource ?? (isChatTreeItem(item) ? item.sessionResource : undefined);
        if (!sessionResource) {
            return;
        }
        const chatModel = chatService.getSession(sessionResource);
        if (!chatModel?.editingSession) {
            return;
        }
        const checkpointRequest = chatModel.checkpoint;
        if (!checkpointRequest) {
            alert(localize('chat.restoreCheckpoint.none', 'There is no checkpoint to restore.'));
            return;
        }
        widget?.viewModel?.model.setCheckpoint(checkpointRequest.id);
        widget?.focusInput();
        widget?.input.setValue(checkpointRequest.message.text, false);
        await restoreSnapshotWithConfirmationByRequestId(accessor, sessionResource, checkpointRequest.id);
    }
});
registerAction2(class EditAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.editRequests',
            title: localize2('chat.editRequests.label', "Edit Request"),
            f1: false,
            category: CHAT_CATEGORY,
            icon: Codicon.edit,
            keybinding: {
                primary: 3 /* KeyCode.Enter */,
                when: ContextKeyExpr.and(ChatContextKeys.inChatSession, EditorContextKeys.textInputFocus.negate()),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
            },
            menu: [
                {
                    id: MenuId.ChatMessageTitle,
                    group: 'navigation',
                    order: 2,
                    when: ContextKeyExpr.and(ContextKeyExpr.or(ContextKeyExpr.equals(`config.${ChatConfiguration.EditRequests}`, 'hover'), ContextKeyExpr.equals(`config.${ChatConfiguration.EditRequests}`, 'input')))
                }
            ]
        });
    }
    async run(accessor, ...args) {
        let item = args[0];
        const chatWidgetService = accessor.get(IChatWidgetService);
        const widget = (isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource)) || chatWidgetService.lastFocusedWidget;
        if (!isResponseVM(item) && !isRequestVM(item)) {
            item = widget?.getFocus();
        }
        if (!item) {
            return;
        }
        if (isRequestVM(item)) {
            widget?.startEditing(item.id);
        }
    }
});
registerAction2(class OpenWorkingSetHistoryAction extends Action2 {
    static { this.id = 'chat.openFileUpdatedBySnapshot'; }
    constructor() {
        super({
            id: OpenWorkingSetHistoryAction.id,
            title: localize('chat.openFileUpdatedBySnapshot.label', "Open File"),
            menu: [{
                    id: MenuId.ChatEditingCodeBlockContext,
                    group: 'navigation',
                    order: 0,
                },]
        });
    }
    async run(accessor, ...args) {
        const context = args[0];
        if (!context?.sessionResource) {
            return;
        }
        const editorService = accessor.get(IEditorService);
        await editorService.openEditor({ resource: context.uri });
    }
});
registerAction2(class OpenWorkingSetHistoryAction extends Action2 {
    static { this.id = 'chat.openFileSnapshot'; }
    constructor() {
        super({
            id: OpenWorkingSetHistoryAction.id,
            title: localize('chat.openSnapshot.label', "Open File Snapshot"),
            menu: [{
                    id: MenuId.ChatEditingCodeBlockContext,
                    group: 'navigation',
                    order: 1,
                },]
        });
    }
    async run(accessor, ...args) {
        const context = args[0];
        if (!context?.sessionResource) {
            return;
        }
        const chatService = accessor.get(IChatService);
        const chatEditingService = accessor.get(IChatEditingService);
        const editorService = accessor.get(IEditorService);
        const chatModel = chatService.getSession(context.sessionResource);
        if (!chatModel) {
            return;
        }
        const snapshot = chatEditingService.getEditingSession(chatModel.sessionResource)?.getSnapshotUri(context.requestId, context.uri, context.stopId);
        if (snapshot) {
            const editor = await editorService.openEditor({ resource: snapshot, label: localize('chatEditing.snapshot', '{0} (Snapshot)', basename(context.uri)), options: { activation: EditorActivation.ACTIVATE } });
            if (isCodeEditor(editor)) {
                editor.updateOptions({ readOnly: true });
            }
        }
    }
});
registerAction2(class ResolveSymbolsContextAction extends EditingSessionAction {
    constructor() {
        super({
            id: 'workbench.action.edits.addFilesFromReferences',
            title: localize2('addFilesFromReferences', "Add Files From References"),
            f1: false,
            category: CHAT_CATEGORY,
            menu: {
                id: MenuId.ChatInputSymbolAttachmentContext,
                group: 'navigation',
                order: 1,
                when: ContextKeyExpr.and(ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask), EditorContextKeys.hasReferenceProvider)
            }
        });
    }
    async runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
        if (args.length === 0 || !isLocation(args[0])) {
            return;
        }
        const textModelService = accessor.get(ITextModelService);
        const languageFeaturesService = accessor.get(ILanguageFeaturesService);
        const symbol = args[0];
        const modelReference = await textModelService.createModelReference(symbol.uri);
        try {
            const textModel = modelReference.object.textEditorModel;
            if (!textModel) {
                return;
            }
            const position = new Position(symbol.range.startLineNumber, symbol.range.startColumn);
            const [references, definitions, implementations] = await Promise.all([
                this.getReferences(position, textModel, languageFeaturesService),
                this.getDefinitions(position, textModel, languageFeaturesService),
                this.getImplementations(position, textModel, languageFeaturesService)
            ]);
            // Sort the references, definitions and implementations by
            // how important it is that they make it into the working set as it has limited size
            const attachments = [];
            for (const reference of [...definitions, ...implementations, ...references]) {
                attachments.push(chatWidget.attachmentModel.asFileVariableEntry(reference.uri));
            }
            chatWidget.attachmentModel.addContext(...attachments);
        }
        finally {
            modelReference.dispose();
        }
    }
    async getReferences(position, textModel, languageFeaturesService) {
        const referenceProviders = languageFeaturesService.referenceProvider.all(textModel);
        const references = await Promise.all(referenceProviders.map(async (referenceProvider) => {
            return await referenceProvider.provideReferences(textModel, position, { includeDeclaration: true }, CancellationToken.None) ?? [];
        }));
        return references.flat();
    }
    async getDefinitions(position, textModel, languageFeaturesService) {
        const definitionProviders = languageFeaturesService.definitionProvider.all(textModel);
        const definitions = await Promise.all(definitionProviders.map(async (definitionProvider) => {
            return await definitionProvider.provideDefinition(textModel, position, CancellationToken.None) ?? [];
        }));
        return definitions.flat();
    }
    async getImplementations(position, textModel, languageFeaturesService) {
        const implementationProviders = languageFeaturesService.implementationProvider.all(textModel);
        const implementations = await Promise.all(implementationProviders.map(async (implementationProvider) => {
            return await implementationProvider.provideImplementation(textModel, position, CancellationToken.None) ?? [];
        }));
        return implementations.flat();
    }
});
export class ViewPreviousEditsAction extends EditingSessionAction {
    static { this.Id = 'chatEditing.viewPreviousEdits'; }
    static { this.Label = localize('chatEditing.viewPreviousEdits', 'View Previous Edits'); }
    constructor() {
        super({
            id: ViewPreviousEditsAction.Id,
            title: { value: ViewPreviousEditsAction.Label, original: ViewPreviousEditsAction.Label },
            tooltip: ViewPreviousEditsAction.Label,
            f1: true,
            icon: Codicon.diffMultiple,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, hasUndecidedChatEditingResourceContextKey.negate()),
            menu: [
                {
                    id: MenuId.ChatEditingWidgetToolbar,
                    group: 'navigation',
                    order: 4,
                    when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.and(hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey.negate()))
                }
            ],
        });
    }
    async runEditingSessionAction(accessor, editingSession, chatWidget, ...args) {
        await editingSession.show(true);
    }
}
registerAction2(ViewPreviousEditsAction);
/**
 * Workbench command to explore accepting working set changes from an extension. Executing
 * the command will accept the changes for the provided resources across all edit sessions.
 */
CommandsRegistry.registerCommand('_chat.editSessions.accept', async (accessor, resources) => {
    if (resources.length === 0) {
        return;
    }
    const uris = resources.map(resource => URI.revive(resource));
    const chatEditingService = accessor.get(IChatEditingService);
    for (const editingSession of chatEditingService.editingSessionsObs.get()) {
        await editingSession.accept(...uris);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFakUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUU5RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDekUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdEYsT0FBTyxFQUFFLFVBQVUsRUFBWSxNQUFNLDJDQUEyQyxDQUFDO0FBRWpGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFFLE9BQU8sRUFBbUIsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN4RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUs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