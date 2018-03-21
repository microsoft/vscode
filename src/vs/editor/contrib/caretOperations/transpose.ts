/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Range } from 'vs/editor/common/core/range';
import { ICommand } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { registerEditorAction, EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ReplaceCommand } from 'vs/editor/common/commands/replaceCommand';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

class TransposeLettersAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.transposeLetters',
			label: nls.localize('transposeLetters.label', "Transpose Letters"),
			alias: 'Transpose Letters',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: 0,
				mac: {
					primary: KeyMod.WinCtrl | KeyCode.KEY_T
				}
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		let model = editor.getModel();
		let commands: ICommand[] = [];
		let selections = editor.getSelections();

		for (let i = 0; i < selections.length; i++) {
			let selection = selections[i];
			if (!selection.isEmpty()) {
				continue;
			}
			let lineNumber = selection.startLineNumber;
			let column = selection.startColumn;
			if (column === 1) {
				// at the beginning of line
				continue;
			}
			let maxColumn = model.getLineMaxColumn(lineNumber);
			if (column === maxColumn) {
				// at the end of line
				continue;
			}

			let lineContent = model.getLineContent(lineNumber);
			let charToTheLeft = lineContent.charAt(column - 2);
			let charToTheRight = lineContent.charAt(column - 1);

			let replaceRange = new Range(lineNumber, column - 1, lineNumber, column + 1);

			commands.push(new ReplaceCommand(replaceRange, charToTheRight + charToTheLeft));
		}

		if (commands.length > 0) {
			editor.pushUndoStop();
			editor.executeCommands(this.id, commands);
			editor.pushUndoStop();
		}
	}
}

registerEditorAction(TransposeLettersAction);
