/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { GhostTextData, MultiGhostTextControllerMulti } from 'vs/editor/contrib/multiGhostText/browser/multiGhostTextController';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

type ShowInput = {
	ghostTexts: GhostTextData[];
	auto: boolean;
};

export class ShowMultiGhostTextMulti extends EditorAction {
	constructor() {
		super({
			id: '_showMultiGhostTextMulti',
			label: 'Show Multi Ghost Text',
			alias: 'Show Multi Ghost Text',
			precondition: EditorContextKeys.writable,
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor, input: ShowInput): Promise<void> {
		console.log('Show Multi Ghost Text', JSON.stringify(input, null, 2));
		console.log('Editor cursor', JSON.stringify(editor.getPosition()));
		const controller = MultiGhostTextControllerMulti.get(editor);
		controller?.showGhostText(input.ghostTexts);
	}
}

export class SelectNextGhostTextMulti extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.multiGhostTextMulti.selectNext',
			label: 'Select Next Ghost Text',
			alias: 'Select Next Ghost Text',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyK,
				kbExpr: EditorContextKeys.writable,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = MultiGhostTextControllerMulti.get(editor);
		controller?.selectNext();
	}
}

export class SelectPreviousGhostTextMulti extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.multiGhostTextMulti.selectPrevious',
			label: 'Select Previous Ghost Text',
			alias: 'Select Previous Ghost Text',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyJ,
				kbExpr: EditorContextKeys.writable,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = MultiGhostTextControllerMulti.get(editor);
		controller?.selectPrevious();
	}
}

export class AcceptAllGhostTextMulti extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.multiGhostTextMulti.acceptAll',
			label: 'Accept All Ghost Text',
			alias: 'Accept All Ghost Text',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyY,
				kbExpr: EditorContextKeys.writable,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = MultiGhostTextControllerMulti.get(editor);
		controller?.acceptAll();
	}
}

export class AcceptSelectedGhostTextMulti extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.multiGhostTextMulti.acceptSelected',
			label: 'Accept Selected Ghost Text',
			alias: 'Accept Selected Ghost Text',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyU,
				kbExpr: EditorContextKeys.writable,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = MultiGhostTextControllerMulti.get(editor);
		controller?.acceptSelected();
	}
}
