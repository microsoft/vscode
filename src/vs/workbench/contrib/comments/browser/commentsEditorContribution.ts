/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import './media/review.css';
import { IActiveCodeEditor, isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import * as nls from '../../../../nls.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ICommentService } from './commentService.js';
import { ctxCommentEditorFocused, SimpleCommentEditor } from './simpleCommentEditor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { CommentController, ID } from './commentsController.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { CommentContextKeys } from '../common/commentContextKeys.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { accessibilityHelpIsShown, accessibleViewCurrentProviderId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { CommentCommandId } from '../common/commentCommandIds.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { CommentsInputContentProvider } from './commentsInputContentProvider.js';
import { AccessibleViewProviderId } from '../../../../platform/accessibility/browser/accessibleView.js';
import { CommentWidgetFocus } from './commentThreadZoneWidget.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { CommentThread, CommentThreadCollapsibleState, CommentThreadState } from '../../../../editor/common/languages.js';

registerEditorContribution(ID, CommentController, EditorContributionInstantiation.AfterFirstRender);
registerWorkbenchContribution2(CommentsInputContentProvider.ID, CommentsInputContentProvider, WorkbenchPhase.BlockRestore);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: CommentCommandId.NextThread,
	handler: async (accessor, args?: { range: IRange; fileComment: boolean }) => {
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
	weight: KeybindingWeight.EditorContrib,
	primary: KeyMod.Alt | KeyCode.F9,
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: CommentCommandId.PreviousThread,
	handler: async (accessor, args?: { range: IRange; fileComment: boolean }) => {
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
	weight: KeybindingWeight.EditorContrib,
	primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F9
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CommentCommandId.NextCommentedRange,
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
				primary: KeyMod.Alt | KeyCode.F10,
				weight: KeybindingWeight.EditorContrib,
				when: CommentContextKeys.activeEditorHasCommentingRange
			}
		});
	}
	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
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
			id: CommentCommandId.PreviousCommentedRange,
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
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F10,
				weight: KeybindingWeight.EditorContrib,
				when: CommentContextKeys.activeEditorHasCommentingRange
			}
		});
	}
	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
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
			id: CommentCommandId.NextRange,
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
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow),
				weight: KeybindingWeight.EditorContrib,
				when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ContextKeyExpr.or(EditorContextKeys.focus, CommentContextKeys.commentFocused, ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Comments))))
			}
		});
	}

	override run(accessor: ServicesAccessor, args?: { range: IRange; fileComment: boolean }): void {
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
			id: CommentCommandId.PreviousRange,
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
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow),
				weight: KeybindingWeight.EditorContrib,
				when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ContextKeyExpr.or(EditorContextKeys.focus, CommentContextKeys.commentFocused, ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Comments))))
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
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
			id: CommentCommandId.ToggleCommenting,
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
	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const commentService = accessor.get(ICommentService);
		const enable = commentService.isCommentingEnabled;
		commentService.enableCommenting(!enable);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CommentCommandId.Add,
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
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC),
				weight: KeybindingWeight.EditorContrib,
				when: CommentContextKeys.activeCursorHasCommentingRange
			}
		});
	}

	override async run(accessor: ServicesAccessor, args?: { range: IRange; fileComment: boolean }): Promise<void> {
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
			id: CommentCommandId.FocusCommentOnCurrentLine,
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
	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
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
			} else {
				await controller.revealCommentThread(commentAtLine[0].commentThread.threadId, undefined, false, CommentWidgetFocus.Widget);
			}
		} catch (e) {
			error = true;
		}
		if (error) {
			notificationService.error(nls.localize('comments.focusCommand.error', "The cursor must be on a line with a comment to focus the comment"));
		}
	}
});

function changeAllCollapseState(commentService: ICommentService, newState: (commentThread: CommentThread) => CommentThreadCollapsibleState) {
	for (const resource of commentService.commentsModel.resourceCommentThreads) {
		for (const thread of resource.commentThreads) {
			thread.thread.collapsibleState = newState(thread.thread);
		}
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CommentCommandId.CollapseAll,
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
	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const commentService = accessor.get(ICommentService);
		changeAllCollapseState(commentService, () => CommentThreadCollapsibleState.Collapsed);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CommentCommandId.ExpandAll,
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
	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const commentService = accessor.get(ICommentService);
		changeAllCollapseState(commentService, () => CommentThreadCollapsibleState.Expanded);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CommentCommandId.ExpandUnresolved,
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
	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const commentService = accessor.get(ICommentService);
		changeAllCollapseState(commentService, (commentThread) => {
			return commentThread.state === CommentThreadState.Unresolved ? CommentThreadCollapsibleState.Expanded : CommentThreadCollapsibleState.Collapsed;
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: CommentCommandId.Submit,
	weight: KeybindingWeight.EditorContrib,
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	when: ctxCommentEditorFocused,
	handler: (accessor, args) => {
		const activeCodeEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (activeCodeEditor instanceof SimpleCommentEditor) {
			activeCodeEditor.getParentThread().submitComment();
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: CommentCommandId.Hide,
	weight: KeybindingWeight.EditorContrib,
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.or(ctxCommentEditorFocused, CommentContextKeys.commentFocused),
	handler: async (accessor, args) => {
		const activeCodeEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		const keybindingService = accessor.get(IKeybindingService);
		// Unfortunate, but collapsing the comment thread might cause a dialog to show
		// If we don't wait for the key up here, then the dialog will consume it and immediately close
		await keybindingService.enableKeybindingHoldMode(CommentCommandId.Hide);
		if (activeCodeEditor instanceof SimpleCommentEditor) {
			activeCodeEditor.getParentThread().collapse();
		} else if (activeCodeEditor) {
			const controller = CommentController.get(activeCodeEditor);
			if (!controller) {
				return;
			}
			const notificationService = accessor.get(INotificationService);
			const commentService = accessor.get(ICommentService);
			let error = false;
			try {
				const activeComment = commentService.lastActiveCommentcontroller?.activeComment;
				if (!activeComment) {
					error = true;
				} else {
					controller.collapseAndFocusRange(activeComment.thread.threadId);
				}
			} catch (e) {
				error = true;
			}
			if (error) {
				notificationService.error(nls.localize('comments.focusCommand.error', "The cursor must be on a line with a comment to focus the comment"));
			}
		}
	}
});

export function getActiveEditor(accessor: ServicesAccessor): IActiveCodeEditor | null {
	let activeTextEditorControl = accessor.get(IEditorService).activeTextEditorControl;

	if (isDiffEditor(activeTextEditorControl)) {
		if (activeTextEditorControl.getOriginalEditor().hasTextFocus()) {
			activeTextEditorControl = activeTextEditorControl.getOriginalEditor();
		} else {
			activeTextEditorControl = activeTextEditorControl.getModifiedEditor();
		}
	}

	if (!isCodeEditor(activeTextEditorControl) || !activeTextEditorControl.hasModel()) {
		return null;
	}

	return activeTextEditorControl;
}

