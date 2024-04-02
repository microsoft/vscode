/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { CursorMoveCommands } from 'vs/editor/common/cursor/cursorMoveCommands';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import * as nls from 'vs/nls';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

export class ExpandLineSelectionAction extends EditorAction {
	constructor() {
		super({
			id: 'expandLineSelection',
			label: nls.localize('expandLineSelection', "Expand Line Selection"),
			alias: 'Expand Line Selection',
			precondition: undefined,
			kbOpts: {
				weight: KeybindingWeight.EditorCore,
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyCode.KeyL
			},
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		args = args || {};
		if (!editor.hasModel()) {
			return;
		}
		const viewModel = editor._getViewModel();
		viewModel.model.pushStackElement();
		viewModel.setCursorStates(
			args.source,
			CursorChangeReason.Explicit,
			CursorMoveCommands.expandLineSelection(viewModel, viewModel.getCursorStates())
		);
		viewModel.revealAllCursors(args.source, true);
	}
}

registerEditorAction(ExpandLineSelectionAction);
