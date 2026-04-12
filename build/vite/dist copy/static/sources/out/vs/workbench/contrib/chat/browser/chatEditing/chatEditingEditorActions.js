/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../../platform/accessibility/common/accessibility.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IListService } from '../../../../../platform/list/browser/listService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { resolveCommandsContext } from '../../../../browser/parts/editor/editorCommandsContext.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { EditorResourceAccessor, SideBySideEditor, TEXT_DIFF_EDITOR_ID } from '../../../../common/editor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { CTX_HOVER_MODE } from '../../../inlineChat/common/inlineChat.js';
import { MultiDiffEditor } from '../../../multiDiffEditor/browser/multiDiffEditor.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_EDITOR_FOCUSED } from '../../../notebook/common/notebookContextKeys.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatEditingService, parseChatMultiDiffUri, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME } from '../../common/editing/chatEditingService.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { ctxCursorInChangeRange, ctxHasEditorModification, ctxHasRequestInProgress, ctxIsCurrentlyBeingModified, ctxIsGlobalEditingSession, ctxReviewModeEnabled } from './chatEditingEditorContextKeys.js';
import { ChatEditingExplanationWidgetManager } from './chatEditingExplanationWidget.js';
import { IChatEditingExplanationModelManager } from './chatEditingExplanationModelManager.js';
import { IChatWidgetService } from '../chat.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Event } from '../../../../../base/common/event.js';
import { ChatConfiguration } from '../../common/constants.js';
class ChatEditingEditorAction extends Action2 {
    constructor(desc) {
        super({
            category: CHAT_CATEGORY,
            ...desc
        });
    }
    async run(accessor, ...args) {
        const instaService = accessor.get(IInstantiationService);
        const chatEditingService = accessor.get(IChatEditingService);
        const editorService = accessor.get(IEditorService);
        const uri = EditorResourceAccessor.getOriginalUri(editorService.activeEditorPane?.input, { supportSideBySide: SideBySideEditor.PRIMARY });
        if (!uri || !editorService.activeEditorPane) {
            return;
        }
        const session = chatEditingService.editingSessionsObs.get()
            .find(candidate => candidate.getEntry(uri));
        if (!session) {
            return;
        }
        const entry = session.getEntry(uri);
        const ctrl = entry.getEditorIntegration(editorService.activeEditorPane);
        return instaService.invokeFunction(this.runChatEditingCommand.bind(this), session, entry, ctrl, ...args);
    }
}
class NavigateAction extends ChatEditingEditorAction {
    constructor(next) {
        super({
            id: next
                ? 'chatEditor.action.navigateNext'
                : 'chatEditor.action.navigatePrevious',
            title: next
                ? localize2('next', 'Go to Next Chat Edit')
                : localize2('prev', 'Go to Previous Chat Edit'),
            icon: next ? Codicon.arrowDown : Codicon.arrowUp,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ctxHasEditorModification),
            keybinding: {
                primary: next
                    ? 512 /* KeyMod.Alt */ | 63 /* KeyCode.F5 */
                    : 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 63 /* KeyCode.F5 */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(ctxHasEditorModification, ContextKeyExpr.or(EditorContextKeys.focus, NOTEBOOK_CELL_LIST_FOCUSED)),
            },
            f1: true,
            menu: {
                id: MenuId.ChatEditingEditorContent,
                group: 'navigate',
                order: !next ? 2 : 3,
                when: ContextKeyExpr.and(ctxReviewModeEnabled, ctxHasEditorModification)
            }
        });
        this.next = next;
    }
    async runChatEditingCommand(accessor, session, entry, ctrl) {
        const instaService = accessor.get(IInstantiationService);
        const done = this.next
            ? ctrl.next(false)
            : ctrl.previous(false);
        if (done) {
            return;
        }
        const didOpenNext = await instaService.invokeFunction(openNextOrPreviousChange, session, entry, this.next);
        if (didOpenNext) {
            return;
        }
        //ELSE: wrap inside the same file
        this.next
            ? ctrl.next(true)
            : ctrl.previous(true);
    }
}
async function openNextOrPreviousChange(accessor, session, entry, next) {
    const editorService = accessor.get(IEditorService);
    const entries = session.entries.get();
    let idx = entries.indexOf(entry);
    let newEntry;
    while (true) {
        idx = (idx + (next ? 1 : -1) + entries.length) % entries.length;
        newEntry = entries[idx];
        if (newEntry.state.get() === 0 /* ModifiedFileEntryState.Modified */) {
            break;
        }
        else if (newEntry === entry) {
            return false;
        }
    }
    const pane = await editorService.openEditor({
        resource: newEntry.modifiedURI,
        options: {
            revealIfOpened: false,
            revealIfVisible: false,
        }
    }, ACTIVE_GROUP);
    if (!pane) {
        return false;
    }
    if (session.entries.get().includes(newEntry)) {
        // make sure newEntry is still valid!
        newEntry.getEditorIntegration(pane).reveal(next);
    }
    return true;
}
class KeepOrUndoAction extends ChatEditingEditorAction {
    constructor(id, _keep) {
        super({
            id,
            title: _keep
                ? localize2('accept', 'Keep Chat Edits')
                : localize2('discard', 'Undo Chat Edits'),
            shortTitle: _keep
                ? localize2('accept2', 'Keep')
                : localize2('discard2', 'Undo'),
            tooltip: _keep
                ? localize2('accept3', 'Keep Chat Edits in this File')
                : localize2('discard3', 'Undo Chat Edits in this File'),
            precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
            icon: _keep
                ? Codicon.check
                : Codicon.discard,
            f1: true,
            keybinding: {
                when: ContextKeyExpr.or(EditorContextKeys.focus, NOTEBOOK_EDITOR_FOCUSED),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10, // win over new-window-action
                primary: _keep
                    ? 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 55 /* KeyCode.KeyY */
                    : 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 44 /* KeyCode.KeyN */,
            },
            menu: {
                id: MenuId.ChatEditingEditorContent,
                group: 'a_resolve',
                order: _keep ? 0 : 1,
                when: ContextKeyExpr.and(!_keep ? ctxReviewModeEnabled : undefined, ContextKeyExpr.or(ctxIsGlobalEditingSession, ctxHasRequestInProgress.negate()))
            }
        });
        this._keep = _keep;
    }
    async runChatEditingCommand(accessor, session, entry, _integration) {
        const instaService = accessor.get(IInstantiationService);
        const configService = accessor.get(IConfigurationService);
        if (this._keep) {
            session.accept(entry.modifiedURI);
        }
        else {
            session.reject(entry.modifiedURI);
        }
        if (configService.getValue(ChatConfiguration.RevealNextChangeOnResolve)) {
            await instaService.invokeFunction(openNextOrPreviousChange, session, entry, true);
        }
    }
}
export class AcceptAction extends KeepOrUndoAction {
    static { this.ID = 'chatEditor.action.accept'; }
    constructor() {
        super(AcceptAction.ID, true);
    }
}
export class RejectAction extends KeepOrUndoAction {
    static { this.ID = 'chatEditor.action.reject'; }
    constructor() {
        super(RejectAction.ID, false);
    }
}
const acceptHunkId = 'chatEditor.action.acceptHunk';
const undoHunkId = 'chatEditor.action.undoHunk';
class AcceptRejectHunkAction extends ChatEditingEditorAction {
    constructor(_accept) {
        super({
            id: _accept ? acceptHunkId : undoHunkId,
            title: _accept ? localize2('acceptHunk', 'Keep this Change') : localize2('undo', 'Undo this Change'),
            shortTitle: _accept ? localize2('acceptHunkShort', 'Keep') : localize2('undoShort', 'Undo'),
            precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
            f1: true,
            keybinding: {
                when: ContextKeyExpr.and(ctxCursorInChangeRange, ContextKeyExpr.or(EditorContextKeys.focus, NOTEBOOK_CELL_LIST_FOCUSED)),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                primary: _accept
                    ? 2048 /* KeyMod.CtrlCmd */ | 55 /* KeyCode.KeyY */
                    : 2048 /* KeyMod.CtrlCmd */ | 44 /* KeyCode.KeyN */
            },
            menu: {
                id: MenuId.ChatEditingEditorHunk,
                order: 1
            }
        });
        this._accept = _accept;
    }
    async runChatEditingCommand(accessor, session, entry, ctrl, ...args) {
        const instaService = accessor.get(IInstantiationService);
        const configService = accessor.get(IConfigurationService);
        if (this._accept) {
            await ctrl.acceptNearestChange(args[0]);
        }
        else {
            await ctrl.rejectNearestChange(args[0]);
        }
        if (configService.getValue(ChatConfiguration.RevealNextChangeOnResolve) && entry.changesCount.get() === 0) {
            // no more changes, move to next file
            await instaService.invokeFunction(openNextOrPreviousChange, session, entry, true);
        }
    }
}
export class AcceptHunkAction extends AcceptRejectHunkAction {
    static { this.ID = acceptHunkId; }
    constructor() {
        super(true);
    }
}
export class RejectHunkAction extends AcceptRejectHunkAction {
    static { this.ID = undoHunkId; }
    constructor() {
        super(false);
    }
}
class ToggleDiffAction extends ChatEditingEditorAction {
    constructor() {
        super({
            id: 'chatEditor.action.toggleDiff',
            title: localize2('diff', 'Toggle Diff Editor for Chat Edits'),
            category: CHAT_CATEGORY,
            toggled: {
                condition: ContextKeyExpr.or(EditorContextKeys.inDiffEditor, ActiveEditorContext.isEqualTo(TEXT_DIFF_EDITOR_ID)),
                icon: Codicon.goToFile,
            },
            precondition: ContextKeyExpr.and(ctxHasEditorModification),
            icon: Codicon.diffSingle,
            keybinding: {
                when: EditorContextKeys.focus,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 65 /* KeyCode.F7 */,
            },
            menu: [{
                    id: MenuId.ChatEditingEditorHunk,
                    order: 10
                }, {
                    id: MenuId.ChatEditingEditorContent,
                    group: 'a_resolve',
                    order: 2,
                    when: ContextKeyExpr.and(ctxReviewModeEnabled)
                }, {
                    id: MenuId.ChatEditorInlineExecute,
                    group: 'a_resolve',
                    order: 2,
                    when: ContextKeyExpr.and(ctxReviewModeEnabled, CTX_HOVER_MODE)
                }]
        });
    }
    runChatEditingCommand(_accessor, _session, _entry, integration, ...args) {
        integration.toggleDiff(args[0]);
    }
}
class ToggleAccessibleDiffViewAction extends ChatEditingEditorAction {
    constructor() {
        super({
            id: 'chatEditor.action.showAccessibleDiffView',
            title: localize2('accessibleDiff', 'Show Accessible Diff View for Chat Edits'),
            f1: true,
            precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
            keybinding: {
                when: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 65 /* KeyCode.F7 */,
            }
        });
    }
    runChatEditingCommand(_accessor, _session, _entry, integration) {
        integration.enableAccessibleDiffView();
    }
}
export class ReviewChangesAction extends ChatEditingEditorAction {
    constructor() {
        super({
            id: 'chatEditor.action.reviewChanges',
            title: localize2('review', "Review"),
            precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
            menu: [{
                    id: MenuId.ChatEditingEditorContent,
                    group: 'a_resolve',
                    order: 3,
                    when: ContextKeyExpr.and(ctxReviewModeEnabled.negate(), ctxIsCurrentlyBeingModified.negate(), ContextKeyExpr.or(ctxIsGlobalEditingSession, ctxHasRequestInProgress.negate())),
                }]
        });
    }
    runChatEditingCommand(_accessor, _session, entry, _integration, ..._args) {
        entry.enableReviewModeUntilSettled();
    }
}
export class AcceptAllEditsAction extends ChatEditingEditorAction {
    static { this.ID = 'chatEditor.action.acceptAllEdits'; }
    constructor() {
        super({
            id: AcceptAllEditsAction.ID,
            title: localize2('acceptAllEdits', 'Keep All Chat Edits'),
            tooltip: localize2('acceptAllEditsTooltip', 'Keep All Chat Edits in this Session'),
            precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
            icon: Codicon.checkAll,
            f1: true,
            keybinding: {
                when: ContextKeyExpr.or(EditorContextKeys.focus, NOTEBOOK_EDITOR_FOCUSED),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10,
                primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 55 /* KeyCode.KeyY */,
            },
        });
    }
    async runChatEditingCommand(_accessor, session, _entry, _integration, ..._args) {
        await session.accept();
    }
}
// --- multi file diff
class MultiDiffAcceptDiscardAction extends Action2 {
    constructor(accept) {
        super({
            id: accept ? 'chatEditing.multidiff.acceptAllFiles' : 'chatEditing.multidiff.discardAllFiles',
            title: accept ? localize('accept4', 'Keep All Edits') : localize('discard4', 'Undo All Edits'),
            icon: accept ? Codicon.check : Codicon.discard,
            menu: {
                when: ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME),
                id: MenuId.EditorTitle,
                order: accept ? 0 : 1,
                group: 'navigation',
            },
        });
        this.accept = accept;
    }
    async run(accessor, ...args) {
        const chatEditingService = accessor.get(IChatEditingService);
        const editorService = accessor.get(IEditorService);
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const listService = accessor.get(IListService);
        const resolvedContext = resolveCommandsContext(args, editorService, editorGroupsService, listService);
        const groupContext = resolvedContext.groupedEditors[0];
        if (!groupContext) {
            return;
        }
        const editor = groupContext.editors[0];
        if (!(editor instanceof MultiDiffEditorInput) || !editor.resource) {
            return;
        }
        const { chatSessionResource } = parseChatMultiDiffUri(editor.resource);
        const session = chatEditingService.getEditingSession(chatSessionResource);
        if (session) {
            if (this.accept) {
                await session.accept();
            }
            else {
                await session.reject();
            }
            editorService.closeEditor({ editor, groupId: groupContext.group.id });
        }
    }
}
const explainMultiDiffSchemes = [CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, 'copilotcli-worktree-changes', 'copilotcloud-pr-changes'];
class ExplainMultiDiffAction extends Action2 {
    constructor() {
        super({
            id: 'chatEditing.multidiff.explain',
            title: localize('explain', 'Explain'),
            menu: {
                when: ContextKeyExpr.and(ContextKeyExpr.or(...explainMultiDiffSchemes.map(scheme => ContextKeyExpr.equals('resourceScheme', scheme))), ContextKeyExpr.has(`config.${ChatConfiguration.ExplainChangesEnabled}`)),
                id: MenuId.MultiDiffEditorContent,
                order: 10,
            },
        });
        this._widgetsByInput = new WeakMap();
    }
    async run(accessor, ...args) {
        const editorService = accessor.get(IEditorService);
        const explanationModelManager = accessor.get(IChatEditingExplanationModelManager);
        const chatWidgetService = accessor.get(IChatWidgetService);
        const viewsService = accessor.get(IViewsService);
        const chatEditingService = accessor.get(IChatEditingService);
        const activePane = editorService.activeEditorPane;
        if (!activePane) {
            return;
        }
        // Check if we're in a multi-diff editor
        if (!(activePane instanceof MultiDiffEditor) || !activePane.viewModel) {
            return;
        }
        const input = activePane.input;
        if (!input) {
            return;
        }
        // Dispose existing widgets for this input and create new store
        this._widgetsByInput.get(input)?.dispose();
        const widgetsStore = new DisposableStore();
        this._widgetsByInput.set(input, widgetsStore);
        // Dispose widgets when the input is disposed
        Event.once(input.onWillDispose)(() => {
            widgetsStore.dispose();
            this._widgetsByInput.delete(input);
        });
        const viewModel = activePane.viewModel;
        const items = viewModel.items.get();
        // Try to extract chat session resource from the multi-diff editor URI or by scanning sessions
        let chatSessionResource;
        if (input instanceof MultiDiffEditorInput && input.resource?.scheme === CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME) {
            chatSessionResource = parseChatMultiDiffUri(input.resource).chatSessionResource;
        }
        if (!chatSessionResource) {
            // Scan sessions to find one that owns files in this multi-diff editor
            // Use goToFileUri if available, otherwise extract file path from the modified URI
            const fileUris = items.map(item => {
                const docDiffItem = item.documentDiffItem;
                const goToFileUri = docDiffItem?.multiDiffEditorItem?.goToFileUri;
                if (goToFileUri) {
                    return goToFileUri;
                }
                // Fallback: extract file path from the modified URI (e.g., git: URIs have the path)
                const modifiedUri = docDiffItem?.multiDiffEditorItem?.modifiedUri ?? item.modifiedUri;
                if (modifiedUri?.path) {
                    return URI.file(modifiedUri.path);
                }
                return undefined;
            }).filter((uri) => !!uri);
            for (const session of chatEditingService.editingSessionsObs.get()) {
                if (fileUris.some(uri => session.getEntry(uri))) {
                    chatSessionResource = session.chatSessionResource;
                    break;
                }
            }
        }
        // First pass: collect all diffs grouped by file
        const diffsByFile = new Map();
        for (const item of items) {
            const modifiedUri = item.modifiedUri;
            if (!modifiedUri) {
                continue;
            }
            // Try to get the editor for this item
            const editorInfo = activePane.tryGetCodeEditor(modifiedUri);
            if (!editorInfo) {
                continue;
            }
            // Get diff info from the view model
            const diffEditorVM = item.diffEditorViewModel;
            await diffEditorVM.waitForDiff();
            const diff = diffEditorVM.diff.get();
            if (!diff || diff.identical) {
                continue;
            }
            const fileKey = modifiedUri.toString();
            const existing = diffsByFile.get(fileKey);
            if (existing) {
                // Add changes to existing file entry
                existing.changes.push(...diff.mappings.map(m => m.lineRangeMapping));
            }
            else {
                // Create new file entry
                diffsByFile.set(fileKey, {
                    editor: editorInfo.editor,
                    changes: diff.mappings.map(m => m.lineRangeMapping),
                    originalModel: diffEditorVM.model.original,
                    modifiedModel: diffEditorVM.model.modified,
                });
            }
        }
        // Second pass: create managers for each file with all its changes
        const allDiffInfos = [];
        for (const fileData of diffsByFile.values()) {
            // Build diff info with all changes for this file
            const diffInfo = {
                changes: fileData.changes,
                identical: false,
                originalModel: fileData.originalModel,
                modifiedModel: fileData.modifiedModel,
            };
            allDiffInfos.push(diffInfo);
            // Create a widget manager for this file - it will observe state from model manager
            const manager = new ChatEditingExplanationWidgetManager(fileData.editor, chatWidgetService, viewsService, explanationModelManager, diffInfo.modifiedModel.uri);
            widgetsStore.add(manager);
        }
        // Generate explanations for all files in a single request
        // This populates state which triggers the managers' autoruns to create widgets
        if (allDiffInfos.length > 0) {
            widgetsStore.add(explanationModelManager.generateExplanations(allDiffInfos, chatSessionResource, CancellationToken.None));
        }
    }
}
export function registerChatEditorActions() {
    registerAction2(class NextAction extends NavigateAction {
        constructor() { super(true); }
    });
    registerAction2(class PrevAction extends NavigateAction {
        constructor() { super(false); }
    });
    registerAction2(ReviewChangesAction);
    registerAction2(AcceptAction);
    registerAction2(RejectAction);
    registerAction2(AcceptAllEditsAction);
    registerAction2(AcceptHunkAction);
    registerAction2(RejectHunkAction);
    registerAction2(ToggleDiffAction);
    registerAction2(ToggleAccessibleDiffViewAction);
    registerAction2(class extends MultiDiffAcceptDiscardAction {
        constructor() { super(true); }
    });
    registerAction2(class extends MultiDiffAcceptDiscardAction {
        constructor() { super(false); }
    });
    registerAction2(ExplainMultiDiffAction);
    MenuRegistry.appendMenuItem(MenuId.ChatEditingEditorContent, {
        command: {
            id: navigationBearingFakeActionId,
            title: localize('label', "Navigation Status"),
            precondition: ContextKeyExpr.false(),
        },
        group: 'navigate',
        order: -1,
        when: ContextKeyExpr.and(ctxReviewModeEnabled, ctxHasEditorModification),
    });
}
export const navigationBearingFakeActionId = 'chatEditor.navigation.bearings';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdFZGl0b3JBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nRWRpdG9yQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFLL0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFdEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNuSCxPQUFPLEVBQUUsT0FBTyxFQUFtQixNQUFNLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3BJLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDbkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDbkcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLGdCQUFnQixFQUFFLG1CQUFtQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFN0csT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1B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