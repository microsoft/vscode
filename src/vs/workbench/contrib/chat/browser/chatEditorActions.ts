/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ICodeEditor, isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize2 } from '../../../../nls.js';
import { EditorAction2, ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { CHAT_CATEGORY } from './actions/chatActions.js';
import { ChatEditorController, ctxHasEditorModification, ctxHasRequestInProgress } from './chatEditorController.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { hasUndecidedChatEditingResourceContextKey, IChatEditingService } from '../common/chatEditingService.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Range } from '../../../../editor/common/core/range.js';
import { getNotebookEditorFromEditorPane } from '../../notebook/browser/notebookBrowser.js';
import { ctxNotebookHasEditorModification } from '../../notebook/browser/contrib/chatEdit/notebookChatEditController.js';

abstract class NavigateAction extends Action2 {

	constructor(readonly next: boolean) {
		super({
			id: next
				? 'chatEditor.action.navigateNext'
				: 'chatEditor.action.navigatePrevious',
			title: next
				? localize2('next', 'Go to Next Chat Edit')
				: localize2('prev', 'Go to Previous Chat Edit'),
			category: CHAT_CATEGORY,
			icon: next ? Codicon.arrowDown : Codicon.arrowUp,
			keybinding: {
				primary: next
					? KeyMod.Alt | KeyCode.F5
					: KeyMod.Alt | KeyMod.Shift | KeyCode.F5,
				weight: KeybindingWeight.EditorContrib,
				when: ContextKeyExpr.and(ContextKeyExpr.or(ctxHasEditorModification, ctxNotebookHasEditorModification), EditorContextKeys.focus),
			},
			f1: true,
			menu: {
				id: MenuId.ChatEditingEditorContent,
				group: 'navigate',
				order: !next ? 2 : 3,
			}
		});
	}

	override async run(accessor: ServicesAccessor) {

		const chatEditingService = accessor.get(IChatEditingService);
		const editorService = accessor.get(IEditorService);

		const editor = editorService.activeTextEditorControl;
		if (!isCodeEditor(editor) || !editor.hasModel()) {
			return;
		}

		const session = chatEditingService.currentEditingSession;
		if (!session) {
			return;
		}

		const ctrl = ChatEditorController.get(editor);
		if (!ctrl) {
			return;
		}

		const done = this.next
			? ctrl.revealNext(true)
			: ctrl.revealPrevious(true);

		if (done) {
			return;
		}

		const entries = session.entries.get();
		const idx = entries.findIndex(e => isEqual(e.modifiedURI, editor.getModel().uri));
		if (idx < 0) {
			return;
		}

		const newIdx = (idx + (this.next ? 1 : -1) + entries.length) % entries.length;
		if (idx === newIdx) {
			// wrap inside the same file
			if (this.next) {
				ctrl.revealNext(false);
			} else {
				ctrl.revealPrevious(false);
			}
			return;
		}

		const entry = entries[newIdx];
		const change = entry.diffInfo.get().changes.at(this.next ? 0 : -1);

		const newEditorPane = await editorService.openEditor({
			resource: entry.modifiedURI,
			options: {
				selection: change && Range.fromPositions({ lineNumber: change.modified.startLineNumber, column: 1 }),
				revealIfOpened: false,
				revealIfVisible: false,
			}
		}, ACTIVE_GROUP);


		const newEditor = newEditorPane?.getControl();
		if (isCodeEditor(newEditor)) {
			ChatEditorController.get(newEditor)?.initNavigation();
		}
	}
}

abstract class AcceptDiscardAction extends Action2 {

	constructor(id: string, readonly accept: boolean) {
		super({
			id,
			title: accept
				? localize2('accept', 'Accept Chat Edit')
				: localize2('discard', 'Discard Chat Edit'),
			shortTitle: accept
				? localize2('accept2', 'Accept')
				: localize2('discard2', 'Discard'),
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(ctxHasRequestInProgress.negate(), hasUndecidedChatEditingResourceContextKey, ContextKeyExpr.or(ctxHasEditorModification, ctxNotebookHasEditorModification)),
			icon: accept
				? Codicon.check
				: Codicon.discard,
			f1: true,
			keybinding: {
				when: EditorContextKeys.focus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: accept
					? KeyMod.CtrlCmd | KeyCode.Enter
					: KeyMod.CtrlCmd | KeyCode.Backspace
			},
			menu: {
				id: MenuId.ChatEditingEditorContent,
				group: 'a_resolve',
				order: accept ? 0 : 1,
			}
		});
	}

	override run(accessor: ServicesAccessor) {
		const chatEditingService = accessor.get(IChatEditingService);
		const editorService = accessor.get(IEditorService);

		let uri = getNotebookEditorFromEditorPane(editorService.activeEditorPane)?.textModel?.uri;
		if (!uri) {
			const editor = editorService.activeTextEditorControl;
			uri = isCodeEditor(editor) && editor.hasModel() ? editor.getModel().uri : undefined;
		}
		if (!uri) {
			return;
		}

		const session = chatEditingService.currentEditingSession;
		if (!session) {
			return;
		}

		if (this.accept) {
			session.accept(uri);
		} else {
			session.reject(uri);
		}
	}
}

export class AcceptAction extends AcceptDiscardAction {

	static readonly ID = 'chatEditor.action.accept';

	constructor() {
		super(AcceptAction.ID, true);
	}
}

export class RejectAction extends AcceptDiscardAction {

	static readonly ID = 'chatEditor.action.reject';

	constructor() {
		super(RejectAction.ID, false);
	}
}

class UndoHunkAction extends EditorAction2 {
	constructor() {
		super({
			id: 'chatEditor.action.undoHunk',
			title: localize2('undo', 'Undo this Change'),
			shortTitle: localize2('undo2', 'Undo'),
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), hasUndecidedChatEditingResourceContextKey),
			icon: Codicon.discard,
			f1: true,
			keybinding: {
				when: EditorContextKeys.focus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backspace
			},
			menu: {
				id: MenuId.ChatEditingEditorHunk,
				order: 1
			}
		});
	}

	override runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		ChatEditorController.get(editor)?.undoNearestChange(args[0]);
	}
}

class OpenDiffFromHunkAction extends EditorAction2 {
	constructor() {
		super({
			id: 'chatEditor.action.diffHunk',
			title: localize2('diff', 'Open Diff'),
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), hasUndecidedChatEditingResourceContextKey),
			icon: Codicon.diffSingle,
			menu: {
				id: MenuId.ChatEditingEditorHunk,
				order: 10
			}
		});
	}

	override runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]) {
		ChatEditorController.get(editor)?.openDiff(args[0]);
	}
}

export function registerChatEditorActions() {
	registerAction2(class NextAction extends NavigateAction { constructor() { super(true); } });
	registerAction2(class PrevAction extends NavigateAction { constructor() { super(false); } });
	registerAction2(AcceptAction);
	registerAction2(RejectAction);
	registerAction2(UndoHunkAction);
	registerAction2(OpenDiffFromHunkAction);
}
