/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { InlineEditController } from 'vs/editor/contrib/inlineEdit/browser/inlineEditController';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

export class AcceptInlineEdit extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineEdit.accept',
			label: 'Accept Inline Edit',
			alias: 'Accept Inline Edit',
			precondition: EditorContextKeys.writable,
			kbOpts: [
				{
					weight: KeybindingWeight.EditorContrib + 1,
					primary: KeyCode.Tab,
					kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, InlineEditController.inlineEditVisibleContext, InlineEditController.cursorAtInlineEditContext)
				}]
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditController.get(editor);
		controller?.accept();
	}
}

export class JumpToInlineEdit extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineEdit.jumpTo',
			label: 'Jump to Inline Edit',
			alias: 'Jump to Inline Edit',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyG,
				kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, InlineEditController.inlineEditVisibleContext)
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditController.get(editor);
		controller?.jumpToCurrent();
	}
}

export class JumpBackInlineEdit extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineEdit.jumpBack',
			label: 'Jump Back from Inline Edit',
			alias: 'Jump Back from Inline Edit',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 10,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyG,
				kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, InlineEditController.cursorAtInlineEditContext)
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditController.get(editor);
		controller?.jumpBack();
	}
}

export class RejectInlineEdit extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineEdit.reject',
			label: 'Reject Inline Edit',
			alias: 'Reject Inline Edit',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape,
				kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, InlineEditController.inlineEditVisibleContext)
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditController.get(editor);
		controller?.clear(true);
	}
}

