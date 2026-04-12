/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyChord } from '../../../../base/common/keyCodes.js';
import './media/review.css';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import * as nls from '../../../../nls.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ICommentService } from './commentService.js';
import { ctxCommentEditorFocused, SimpleCommentEditor } from './simpleCommentEditor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { CommentController, ID } from './commentsController.js';
import { Range } from '../../../../editor/common/core/range.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { CommentContextKeys } from '../common/commentContextKeys.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { accessibilityHelpIsShown, accessibleViewCurrentProviderId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { CommentsInputContentProvider } from './commentsInputContentProvider.js';
import { CommentWidgetFocus } from './commentThreadZoneWidget.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { CommentThreadCollapsibleState, CommentThreadState } from '../../../../editor/common/languages.js';
registerEditorContribution(ID, CommentController, 1 /* EditorContributionInstantiation.AfterFirstRender */);
registerWorkbenchContribution2(CommentsInputContentProvider.ID, CommentsInputContentProvider, 2 /* WorkbenchPhase.BlockRestore */);
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: "editor.action.nextCommentThreadAction" /* CommentCommandId.NextThread */,
    handler: async (accessor, args) => {
        const activeEditor = getActiveEditor(accessor);
        if (!activeEditor) {
            return Promise.resolve();
        }
        const controller = CommentController.get(activeEditor);
        if (!controller) {
            return Promise.resolve();
        }
        controller.nextCommentThread(true);
    },
    weight: 100 /* KeybindingWeight.EditorContrib */,
    primary: 512 /* KeyMod.Alt */ | 67 /* KeyCode.F9 */,
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: "editor.action.previousCommentThreadAction" /* CommentCommandId.PreviousThread */,
    handler: async (accessor, args) => {
        const activeEditor = getActiveEditor(accessor);
        if (!activeEditor) {
            return Promise.resolve();
        }
        const controller = CommentController.get(activeEditor);
        if (!controller) {
            return Promise.resolve();
        }
        controller.previousCommentThread(true);
    },
    weight: 100 /* KeybindingWeight.EditorContrib */,
    primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 67 /* KeyCode.F9 */
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: "editor.action.nextCommentedRangeAction" /* CommentCommandId.NextCommentedRange */,
            title: {
                value: nls.localize('comments.NextCommentedRange', "Go to Next Commented Range"),
                original: 'Go to Next Commented Range'
            },
            category: {
                value: nls.localize('commentsCategory', "Comments"),
                original: 'Comments'
            },
            menu: [{
                    id: MenuId.CommandPalette,
                    when: CommentContextKeys.activeEditorHasCommentingRange
                }],
            keybinding: {
                primary: 512 /* KeyMod.Alt */ | 68 /* KeyCode.F10 */,
                weight: 100 /* KeybindingWeight.EditorContrib */,
                when: CommentContextKeys.activeEditorHasCommentingRange
            }
        });
    }
    run(accessor, ...args) {
        const activeEditor = getActiveEditor(accessor);
        if (!activeEditor) {
            return;
        }
        const controller = CommentController.get(activeEditor);
        if (!controller) {
            return;
        }
        controller.nextCommentThread(false);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: "editor.action.previousCommentedRangeAction" /* CommentCommandId.PreviousCommentedRange */,
            title: {
                value: nls.localize('comments.previousCommentedRange', "Go to Previous Commented Range"),
                original: 'Go to Previous Commented Range'
            },
            category: {
                value: nls.localize('commentsCategory', "Comments"),
                original: 'Comments'
            },
            menu: [{
                    id: MenuId.CommandPalette,
                    when: CommentContextKeys.activeEditorHasCommentingRange
                }],
            keybinding: {
                primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 68 /* KeyCode.F10 */,
                weight: 100 /* KeybindingWeight.EditorContrib */,
                when: CommentContextKeys.activeEditorHasCommentingRange
            }
        });
    }
    run(accessor, ...args) {
        const activeEditor = getActiveEditor(accessor);
        if (!activeEditor) {
            return;
        }
        const controller = CommentController.get(activeEditor);
        if (!controller) {
            return;
        }
        controller.previousCommentThread(false);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: "editor.action.nextCommentingRange" /* CommentCommandId.NextRange */,
            title: {
                value: nls.localize('comments.nextCommentingRange', "Go to Next Commenting Range"),
                original: 'Go to Next Commenting Range'
            },
            category: {
                value: nls.localize('commentsCategory', "Comments"),
                original: 'Comments'
            },
            menu: [{
                    id: MenuId.CommandPalette,
                    when: CommentContextKeys.activeEditorHasCommentingRange
                }],
            keybinding: {
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */),
                weight: 100 /* KeybindingWeight.EditorContrib */,
                when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ContextKeyExpr.or(EditorContextKeys.focus, CommentContextKeys.commentFocused, ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewCurrentProviderId.isEqualTo("comments" /* AccessibleViewProviderId.Comments */))))
            }
        });
    }
    run(accessor, args) {
        const activeEditor = getActiveEditor(accessor);
        if (!activeEditor) {
            return;
        }
        const controller = CommentController.get(activeEditor);
        if (!controller) {
            return;
        }
        controller.nextCommentingRange();
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: "editor.action.previousCommentingRange" /* CommentCommandId.PreviousRange */,
            title: {
                value: nls.localize('comments.previousCommentingRange', "Go to Previous Commenting Range"),
                original: 'Go to Previous Commenting Range'
            },
            category: {
                value: nls.localize('commentsCategory', "Comments"),
                original: 'Comments'
            },
            menu: [{
                    id: MenuId.CommandPalette,
                    when: CommentContextKeys.activeEditorHasCommentingRange
                }],
            keybinding: {
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */),
                weight: 100 /* KeybindingWeight.EditorContrib */,
                when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ContextKeyExpr.or(EditorContextKeys.focus, CommentContextKeys.commentFocused, ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewCurrentProviderId.isEqualTo("comments" /* AccessibleViewProviderId.Comments */))))
            }
        });
    }
    async run(accessor, ...args) {
        const activeEditor = getActiveEditor(accessor);
        if (!activeEditor) {
            return;
        }
        const controller = CommentController.get(activeEditor);
        if (!controller) {
            return;
        }
        controller.previousCommentingRange();
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: "workbench.action.toggleCommenting" /* CommentCommandId.ToggleCommenting */,
            title: {
                value: nls.localize('comments.toggleCommenting', "Toggle Editor Commenting"),
                original: 'Toggle Editor Commenting'
            },
            category: {
                value: nls.localize('commentsCategory', "Comments"),
                original: 'Comments'
            },
            menu: [{
                    id: MenuId.CommandPalette,
                    when: CommentContextKeys.WorkspaceHasCommenting
                }]
        });
    }
    run(accessor, ...args) {
        const commentService = accessor.get(ICommentService);
        const enable = commentService.isCommentingEnabled;
        commentService.enableCommenting(!enable);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: "workbench.action.addComment" /* CommentCommandId.Add */,
            title: {
                value: nls.localize('comments.addCommand', "Add Comment on Current Selection"),
                original: 'Add Comment on Current Selection'
            },
            category: {
                value: nls.localize('commentsCategory', "Comments"),
                original: 'Comments'
            },
            menu: [{
                    id: MenuId.CommandPalette,
                    when: CommentContextKeys.activeCursorHasCommentingRange
                }],
            keybinding: {
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 33 /* KeyCode.KeyC */),
                weight: 100 /* KeybindingWeight.EditorContrib */,
                when: CommentContextKeys.activeCursorHasCommentingRange
            }
        });
    }
    async run(accessor, args) {
        const activeEditor = getActiveEditor(accessor);
        if (!activeEditor) {
            return;
        }
        const controller = CommentController.get(activeEditor);
        if (!controller) {
            return;
        }
        const position = args?.range ? new Range(args.range.startLineNumber, args.range.startLineNumber, args.range.endLineNumber, args.range.endColumn)
            : (args?.fileComment ? undefined : activeEditor.getSelection());
        await controller.addOrToggleCommentAtLine(position, undefined);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: "workbench.action.focusCommentOnCurrentLine" /* CommentCommandId.FocusCommentOnCurrentLine */,
            title: {
                value: nls.localize('comments.focusCommentOnCurrentLine', "Focus Comment on Current Line"),
                original: 'Focus Comment on Current Line'
            },
            category: {
                value: nls.localize('commentsCategory', "Comments"),
                original: 'Comments'
            },
            f1: true,
            precondition: CommentContextKeys.activeCursorHasComment,
        });
    }
    async run(accessor, ...args) {
        const activeEditor = getActiveEditor(accessor);
        if (!activeEditor) {
            return;
        }
        const controller = CommentController.get(activeEditor);
        if (!controller) {
            return;
        }
        const position = activeEditor.getSelection();
        const notificationService = accessor.get(INotificationService);
        let error = false;
        try {
            const commentAtLine = controller.getCommentsAtLine(position);
            if (commentAtLine.length === 0) {
                error = true;
            }
            else {
                await controller.revealCommentThread(commentAtLine[0].commentThread.threadId, undefined, false, CommentWidgetFocus.Widget);
            }
        }
        catch (e) {
            error = true;
        }
        if (error) {
            notificationService.error(nls.localize('comments.focusCommand.error', "The cursor must be on a line with a comment to focus the comment"));
        }
    }
});
function changeAllCollapseState(commentService, newState) {
    for (const resource of commentService.commentsModel.resourceCommentThreads) {
        for (const thread of resource.commentThreads) {
            thread.thread.collapsibleState = newState(thread.thread);
        }
    }
}
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: "workbench.action.collapseAllComments" /* CommentCommandId.CollapseAll */,
            title: {
                value: nls.localize('comments.collapseAll', "Collapse All Comments"),
                original: 'Collapse All Comments'
            },
            category: {
                value: nls.localize('commentsCategory', "Comments"),
                original: 'Comments'
            },
            menu: [{
                    id: MenuId.CommandPalette,
                    when: CommentContextKeys.WorkspaceHasCommenting
                }]
        });
    }
    run(accessor, ...args) {
        const commentService = accessor.get(ICommentService);
        changeAllCollapseState(commentService, () => CommentThreadCollapsibleState.Collapsed);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: "workbench.action.expandAllComments" /* CommentCommandId.ExpandAll */,
            title: {
                value: nls.localize('comments.expandAll', "Expand All Comments"),
                original: 'Expand All Comments'
            },
            category: {
                value: nls.localize('commentsCategory', "Comments"),
                original: 'Comments'
            },
            menu: [{
                    id: MenuId.CommandPalette,
                    when: CommentContextKeys.WorkspaceHasCommenting
                }]
        });
    }
    run(accessor, ...args) {
        const commentService = accessor.get(ICommentService);
        changeAllCollapseState(commentService, () => CommentThreadCollapsibleState.Expanded);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: "workbench.action.expandUnresolvedComments" /* CommentCommandId.ExpandUnresolved */,
            title: {
                value: nls.localize('comments.expandUnresolved', "Expand Unresolved Comments"),
                original: 'Expand Unresolved Comments'
            },
            category: {
                value: nls.localize('commentsCategory', "Comments"),
                original: 'Comments'
            },
            menu: [{
                    id: MenuId.CommandPalette,
                    when: CommentContextKeys.WorkspaceHasCommenting
                }]
        });
    }
    run(accessor, ...args) {
        const commentService = accessor.get(ICommentService);
        changeAllCollapseState(commentService, (commentThread) => {
            return commentThread.state === CommentThreadState.Unresolved ? CommentThreadCollapsibleState.Expanded : CommentThreadCollapsibleState.Collapsed;
        });
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: "editor.action.submitComment" /* CommentCommandId.Submit */,
    weight: 100 /* KeybindingWeight.EditorContrib */,
    primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
    when: ctxCommentEditorFocused,
    handler: (accessor, args) => {
        const activeCodeEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
        if (activeCodeEditor instanceof SimpleCommentEditor) {
            activeCodeEditor.getParentThread().submitComment();
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: "workbench.action.hideComment" /* CommentCommandId.Hide */,
    weight: 100 /* KeybindingWeight.EditorContrib */,
    primary: 9 /* KeyCode.Escape */,
    secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */],
    when: ContextKeyExpr.or(ctxCommentEditorFocused, CommentContextKeys.commentFocused),
    handler: async (accessor, args) => {
        const activeCodeEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
        const keybindingService = accessor.get(IKeybindingService);
        const notificationService = accessor.get(INotificationService);
        const commentService = accessor.get(ICommentService);
        // Unfortunate, but collapsing the comment thread might cause a dialog to show
        // If we don't wait for the key up here, then the dialog will consume it and immediately close
        await keybindingService.enableKeybindingHoldMode("workbench.action.hideComment" /* CommentCommandId.Hide */);
        if (activeCodeEditor instanceof SimpleCommentEditor) {
            activeCodeEditor.getParentThread().collapse();
        }
        else if (activeCodeEditor) {
            const controller = CommentController.get(activeCodeEditor);
            if (!controller) {
                return;
            }
            let error = false;
            try {
                const activeComment = commentService.lastActiveCommentcontroller?.activeComment;
                if (!activeComment) {
                    error = true;
                }
                else {
                    controller.collapseAndFocusRange(activeComment.thread.threadId);
                }
            }
            catch (e) {
                error = true;
            }
            if (error) {
                notificationService.error(nls.localize('comments.focusCommand.error', "The cursor must be on a line with a comment to focus the comment"));
            }
        }
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: "workbench.action.hideComment" /* CommentCommandId.Hide */,
    weight: 100 /* KeybindingWeight.EditorContrib */,
    primary: 2048 /* KeyMod.CtrlCmd */ | 9 /* KeyCode.Escape */,
    win: { primary: 512 /* KeyMod.Alt */ | 1 /* KeyCode.Backspace */ },
    when: ContextKeyExpr.and(EditorContextKeys.focus, CommentContextKeys.commentWidgetVisible),
    handler: async (accessor, args) => {
        const activeCodeEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
        const keybindingService = accessor.get(IKeybindingService);
        // Unfortunate, but collapsing the comment thread might cause a dialog to show
        // If we don't wait for the key up here, then the dialog will consume it and immediately close
        await keybindingService.enableKeybindingHoldMode("workbench.action.hideComment" /* CommentCommandId.Hide */);
        if (activeCodeEditor) {
            const controller = CommentController.get(activeCodeEditor);
            if (controller) {
                await controller.collapseVisibleComments();
            }
        }
    }
});
export function getActiveEditor(accessor) {
    let activeTextEditorControl = accessor.get(IEditorService).activeTextEditorControl;
    if (isDiffEditor(activeTextEditorControl)) {
        if (activeTextEditorControl.getOriginalEditor().hasTextFocus()) {
            activeTextEditorControl = activeTextEditorControl.getOriginalEditor();
        }
        else {
            activeTextEditorControl = activeTextEditorControl.getModifiedEditor();
        }
    }
    if (!isCodeEditor(activeTextEditorControl) || !activeTextEditorControl.hasModel()) {
        return null;
    }
    return activeTextEditorControl;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudHNFZGl0b3JDb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jb21tZW50cy9icm93c2VyL2NvbW1lbnRzRWRpdG9yQ29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQW1CLE1BQU0scUNBQXFDLENBQUM7QUFDaEYsT0FBTyxvQkFBb0IsQ0FBQztBQUM1QixPQUFPLEVBQXFCLFlBQVksRUFBRSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RyxPQUFPLEVBQW1DLDBCQUEwQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDN0gsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDOUYsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEVBQUUsbUJBQW1CLEVBQW9CLE1BQU0sK0RBQStELENBQUM7QUFDdEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3RELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3hGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDaEUsT0FBTyxFQUFVLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxN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