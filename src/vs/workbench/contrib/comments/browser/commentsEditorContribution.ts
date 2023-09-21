/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import 'vs/css!./media/review';
import { IActiveCodeEditor, ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import * as nls from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { ctxCommentEditorFocused, SimpleCommentEditor } from 'vs/workbench/contrib/comments/browser/simpleCommentEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CommentController, ID } from 'vs/workbench/contrib/comments/browser/commentsController';
import { IRange, Range } from 'vs/editor/common/core/range';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CommentContextKeys } from 'vs/workbench/contrib/comments/common/commentContextKeys';

export class NextCommentThreadAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.nextCommentThreadAction',
			label: nls.localize('nextCommentThreadAction', "Go to Next Comment Thread"),
			alias: 'Go to Next Comment Thread',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.Alt | KeyCode.F9,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = CommentController.get(editor);
		controller?.nextCommentThread();
	}
}

export class PreviousCommentThreadAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.previousCommentThreadAction',
			label: nls.localize('previousCommentThreadAction', "Go to Previous Comment Thread"),
			alias: 'Go to Previous Comment Thread',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F9,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = CommentController.get(editor);
		controller?.previousCommentThread();
	}
}

registerEditorContribution(ID, CommentController, EditorContributionInstantiation.AfterFirstRender);
registerEditorAction(NextCommentThreadAction);
registerEditorAction(PreviousCommentThreadAction);

export class NextCommentingRangeAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.goToNextCommentingRange',
			label: nls.localize('goToNextCommentingRange', "Go to Next Commenting Range"),
			alias: 'Go to Next Commenting Range',
			precondition: CommentContextKeys.WorkspaceHasCommenting,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = CommentController.get(editor);
		controller?.nextCommentingRange();
	}
}

export class PreviousCommentingRangeAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.goToPreviousCommentingRange',
			label: nls.localize('goToPreviousCommentingRange', "Go to Previous Commenting Range"),
			alias: 'Go to Next Commenting Range',
			precondition: CommentContextKeys.WorkspaceHasCommenting,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = CommentController.get(editor);
		controller?.previousCommentingRange();
	}
}

registerEditorAction(NextCommentingRangeAction);
registerEditorAction(PreviousCommentingRangeAction);

const TOGGLE_COMMENTING_COMMAND = 'workbench.action.toggleCommenting';
CommandsRegistry.registerCommand({
	id: TOGGLE_COMMENTING_COMMAND,
	handler: (accessor) => {
		const commentService = accessor.get(ICommentService);
		const enable = commentService.isCommentingEnabled;
		commentService.enableCommenting(!enable);
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: TOGGLE_COMMENTING_COMMAND,
		title: nls.localize('comments.toggleCommenting', "Toggle Editor Commenting"),
		category: 'Comments',
	},
	when: CommentContextKeys.WorkspaceHasCommenting
});

const ADD_COMMENT_COMMAND = 'workbench.action.addComment';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: ADD_COMMENT_COMMAND,
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
		id: ADD_COMMENT_COMMAND,
		title: nls.localize('comments.addCommand', "Add Comment on Current Selection"),
		category: 'Comments'
	},
	when: CommentContextKeys.activeCursorHasCommentingRange
});

const COLLAPSE_ALL_COMMENT_COMMAND = 'workbench.action.collapseAllComments';
CommandsRegistry.registerCommand({
	id: COLLAPSE_ALL_COMMENT_COMMAND,
	handler: (accessor) => {
		return getActiveController(accessor)?.collapseAll();
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: COLLAPSE_ALL_COMMENT_COMMAND,
		title: nls.localize('comments.collapseAll', "Collapse All Comments"),
		category: 'Comments'
	},
	when: CommentContextKeys.WorkspaceHasCommenting
});

const EXPAND_ALL_COMMENT_COMMAND = 'workbench.action.expandAllComments';
CommandsRegistry.registerCommand({
	id: EXPAND_ALL_COMMENT_COMMAND,
	handler: (accessor) => {
		return getActiveController(accessor)?.expandAll();
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: EXPAND_ALL_COMMENT_COMMAND,
		title: nls.localize('comments.expandAll', "Expand All Comments"),
		category: 'Comments'
	},
	when: CommentContextKeys.WorkspaceHasCommenting
});

const EXPAND_UNRESOLVED_COMMENT_COMMAND = 'workbench.action.expandUnresolvedComments';
CommandsRegistry.registerCommand({
	id: EXPAND_UNRESOLVED_COMMENT_COMMAND,
	handler: (accessor) => {
		return getActiveController(accessor)?.expandUnresolved();
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: EXPAND_UNRESOLVED_COMMENT_COMMAND,
		title: nls.localize('comments.expandUnresolved', "Expand Unresolved Comments"),
		category: 'Comments'
	},
	when: CommentContextKeys.WorkspaceHasCommenting
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.submitComment',
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
	id: 'workbench.action.hideComment',
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

