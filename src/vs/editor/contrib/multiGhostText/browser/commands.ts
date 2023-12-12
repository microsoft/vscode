/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { GhostTextData, MultiGhostTextController } from 'vs/editor/contrib/multiGhostText/browser/multiGhostTextController';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

type ShowInput = {
	ghostText: GhostTextData;
	auto: boolean;
};

export class ShowMultiGhostText extends EditorAction {
	constructor() {
		super({
			id: '_showMultiGhostText',
			label: 'Show Multi Ghost Text',
			alias: 'Show Multi Ghost Text',
			precondition: EditorContextKeys.writable,
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor, input: ShowInput): Promise<void> {
		// console.log('Show Multi Ghost Text', JSON.stringify(input, null, 2));
		// console.log('Editor cursor', JSON.stringify(editor.getPosition()));
		const controller = MultiGhostTextController.get(editor);
		controller?.showGhostText(input.ghostText, input.auto);
	}
}

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
		console.log('Accept Ghost Text');
		const controller = MultiGhostTextController.get(editor);
		controller?.accept();
	}
}

// export class AcceptGhostText extends EditorAction {
// 	constructor() {
// 		super({
// 			id: 'editor.action.multiGhostText.accept',
// 			label: 'Accept Ghost Text',
// 			alias: 'Accept Ghost Text',
// 			precondition: EditorContextKeys.writable,
// 			kbOpts: [{
// 				weight: KeybindingWeight.EditorContrib + 1,
// 				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Minus,
// 				kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, MultiGhostTextController.multiGhostTextVisibleContext)
// 			}],
// 		});
// 	}

// 	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
// 		console.log('Accept Ghost Text');
// 		const controller = MultiGhostTextController.get(editor);
// 		controller?.acceptAndNext(false);
// 	}
// }

export class JumpToGhostText extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.multiGhostText.jumpToNext',
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
		console.log('Jump to Next Ghost Text');
		const controller = MultiGhostTextController.get(editor);
		controller?.jumpToCurrent();
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
		console.log('Reject Ghost Text');
		const controller = MultiGhostTextController.get(editor);
		controller?.clear();
	}
}

