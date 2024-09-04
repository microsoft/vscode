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
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ICommentService } from './commentService.js';
import { ctxCommentEditorFocused, SimpleCommentEditor } from './simpleCommentEditor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
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
		controller.nextCommentThread();
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
		controller.previousCommentThread();
	},
	weight: KeybindingWeight.EditorContrib,
	primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F9
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: CommentCommandId.NextRange,
	handler: async (accessor, args?: { range: IRange; fileComment: boolean }) => {
		const activeEditor = getActiveEditor(accessor);
		if (!activeEditor) {
			return Promise.resolve();
		}

		const controller = CommentController.get(activeEditor);
		if (!controller) {
			return Promise.resolve();
		}
		controller.nextCommentingRange();
	},
	when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ContextKeyExpr.or(EditorContextKeys.focus, CommentContextKeys.commentFocused, ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Comments)))),
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow),
	weight: KeybindingWeight.EditorContrib
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: CommentCommandId.NextRange,
		title: nls.localize('comments.nextCommentingRange', "Go to Next Commenting Range"),
		category: 'Comments',
	},
	when: CommentContextKeys.activeEditorHasCommentingRange
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: CommentCommandId.PreviousRange,
	handler: async (accessor, args?: { range: IRange; fileComment: boolean }) => {
		const activeEditor = getActiveEditor(accessor);
		if (!activeEditor) {
			return Promise.resolve();
		}

		const controller = CommentController.get(activeEditor);
		if (!controller) {
			return Promise.resolve();
		}
		controller.previousCommentingRange();
	},
	when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ContextKeyExpr.or(EditorContextKeys.focus, CommentContextKeys.commentFocused, ContextKeyExpr.and(accessibilityHelpIsShown, accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Comments)))),
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow),
	weight: KeybindingWeight.EditorContrib
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: CommentCommandId.PreviousRange,
		title: nls.localize('comments.previousCommentingRange', "Go to Previous Commenting Range"),
		category: 'Comments',
	},
	when: CommentContextKeys.activeEditorHasCommentingRange
});

CommandsRegistry.registerCommand({
	id: CommentCommandId.ToggleCommenting,
	handler: (accessor) => {
		const commentService = accessor.get(ICommentService);
		const enable = commentService.isCommentingEnabled;
		commentService.enableCommenting(!enable);
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: CommentCommandId.ToggleCommenting,
		title: nls.localize('comments.toggleCommenting', "Toggle Editor Commenting"),
		category: 'Comments',
	},
	when: CommentContextKeys.WorkspaceHasCommenting
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: CommentCommandId.Add,
	handler: async (accessor, args?: { range: IRange; fileComment: boolean }) => {
		const activeEditor = getActiveEditor(accessor);
		if (!activeEditor) {
			return Promise.resolve();
		}

		const controller = CommentController.get(activeEditor);
		if (!controller) {
			return Promise.resolve();
		}

		const position = args?.range ? new Range(args.range.startLineNumber, args.range.startLineNumber, args.range.endLineNumber, args.range.endColumn)
			: (args?.fileComment ? undefined : activeEditor.getSelection());
		const notificationService = accessor.get(INotificationService);
		try {
			await controller.addOrToggleCommentAtLine(position, undefined);
		} catch (e) {
			notificationService.error(nls.localize('comments.addCommand.error', "The cursor must be within a commenting range to add a comment")); // TODO: Once we have commands to go to next commenting range they should be included as buttons in the error.
		}
	},
	weight: KeybindingWeight.EditorContrib,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC),
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: CommentCommandId.Add,
		title: nls.localize('comments.addCommand', "Add Comment on Current Selection"),
		category: 'Comments'
	},
	when: CommentContextKeys.activeCursorHasCommentingRange
});

CommandsRegistry.registerCommand({
	id: CommentCommandId.CollapseAll,
	handler: (accessor) => {
		return getActiveController(accessor)?.collapseAll();
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: CommentCommandId.CollapseAll,
		title: nls.localize('comments.collapseAll', "Collapse All Comments"),
		category: 'Comments'
	},
	when: CommentContextKeys.WorkspaceHasCommenting
});

CommandsRegistry.registerCommand({
	id: CommentCommandId.ExpandAll,
	handler: (accessor) => {
		return getActiveController(accessor)?.expandAll();
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: CommentCommandId.ExpandAll,
		title: nls.localize('comments.expandAll', "Expand All Comments"),
		category: 'Comments'
	},
	when: CommentContextKeys.WorkspaceHasCommenting
});

CommandsRegistry.registerCommand({
	id: CommentCommandId.ExpandUnresolved,
	handler: (accessor) => {
		return getActiveController(accessor)?.expandUnresolved();
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: CommentCommandId.ExpandUnresolved,
		title: nls.localize('comments.expandUnresolved', "Expand Unresolved Comments"),
		category: 'Comments'
	},
	when: CommentContextKeys.WorkspaceHasCommenting
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
	when: ctxCommentEditorFocused,
	handler: (accessor, args) => {
		const activeCodeEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (activeCodeEditor instanceof SimpleCommentEditor) {
			activeCodeEditor.getParentThread().collapse();
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

function getActiveController(accessor: ServicesAccessor): CommentController | undefined {
	const activeEditor = getActiveEditor(accessor);
	if (!activeEditor) {
		return undefined;
	}

	const controller = CommentController.get(activeEditor);
	if (!controller) {
		return undefined;
	}
	return controller;
}

