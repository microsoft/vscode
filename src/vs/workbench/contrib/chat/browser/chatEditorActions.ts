/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize2 } from '../../../../nls.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { CHAT_CATEGORY } from './actions/chatActions.js';
import { ChatEditorController, ctxHasEditorModification } from './chatEditorController.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatEditingService } from '../common/chatEditingService.js';

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
				when: ContextKeyExpr.and(ctxHasEditorModification, EditorContextKeys.focus),
			},
			f1: true,
			menu: {
				id: MenuId.EditorTitle,
				group: 'navigation',
				order: next ? -100 : -101,
				when: ctxHasEditorModification
			}
		});
	}

	override run(accessor: ServicesAccessor) {

		const editor = accessor.get(IEditorService).activeTextEditorControl;

		if (!isCodeEditor(editor)) {
			return;
		}

		if (this.next) {
			ChatEditorController.get(editor)?.revealNext();
		} else {
			ChatEditorController.get(editor)?.revealPrevious();
		}
	}
}

abstract class AcceptDiscardAction extends Action2 {

	constructor(readonly accept: boolean) {
		super({
			id: accept
				? 'chatEditor.action.accept'
				: 'chatEditor.action.reject',
			title: accept
				? localize2('accept', 'Accept Chat Edit')
				: localize2('reject', 'Reject Chat Edit'),
			category: CHAT_CATEGORY,
			icon: accept
				? Codicon.check
				: Codicon.discard,
			menu: {
				id: MenuId.EditorTitle,
				group: 'navigation',
				order: accept ? -103 : -102,
				when: ctxHasEditorModification
			}
		});
	}

	override run(accessor: ServicesAccessor) {
		const chatEditingService = accessor.get(IChatEditingService);
		const editorService = accessor.get(IEditorService);

		const editor = editorService.activeTextEditorControl;
		if (!isCodeEditor(editor) || !editor.hasModel()) {
			return;
		}

		const session = chatEditingService.getEditingSession(editor.getModel().uri);
		if (!session) {
			return;
		}

		if (this.accept) {
			session.accept(editor.getModel().uri);
		} else {
			session.reject(editor.getModel().uri);
		}
	}
}


export function registerChatEditorActions() {
	registerAction2(class NextAction extends NavigateAction { constructor() { super(true); } });
	registerAction2(class PrevAction extends NavigateAction { constructor() { super(false); } });
	registerAction2(class AcceptAction extends AcceptDiscardAction { constructor() { super(true); } });
	registerAction2(class RejectAction extends AcceptDiscardAction { constructor() { super(false); } });
}
