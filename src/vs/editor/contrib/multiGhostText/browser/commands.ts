/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { MultiGhostTextController } from 'vs/editor/contrib/multiGhostText/browser/multiGhostTextController';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

export class AcceptGhostText extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.multiGhostText.accept',
			label: 'Accept Ghost Text',
			alias: 'Accept Ghost Text',
			precondition: EditorContextKeys.writable,
			kbOpts: [
				{
					weight: KeybindingWeight.EditorContrib + 1,
					primary: KeyCode.Tab,
					kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, MultiGhostTextController.multiGhostTextVisibleContext, MultiGhostTextController.cursorAtGhostTextContext)
				}]
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = MultiGhostTextController.get(editor);
		controller?.accept();
	}
}

export class JumpToGhostText extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.multiGhostText.jumpTo',
			label: 'Jump to Ghost Text',
			alias: 'Jump to Ghost Text',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Equal,
				kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, MultiGhostTextController.multiGhostTextVisibleContext)
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = MultiGhostTextController.get(editor);
		controller?.jumpToCurrent();
	}
}

export class NextGhostText extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.multiGhostText.next',
			label: 'Next Ghost Text',
			alias: 'Next Ghost Text',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Equal,
				kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, MultiGhostTextController.cursorAtGhostTextContext)
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = MultiGhostTextController.get(editor);
		controller?.showNext();
	}
}

export class RejectGhostText extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.multiGhostText.reject',
			label: 'Reject Ghost Text',
			alias: 'Reject Ghost Text',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: 100,
				primary: KeyCode.Escape,
				kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, MultiGhostTextController.multiGhostTextVisibleContext)
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = MultiGhostTextController.get(editor);
		controller?.clear();
	}
}

