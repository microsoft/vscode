/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes';
import { ICodeEditor } from '../../../browser/editorBrowser';
import { EditorAction, registerEditorAction, ServicesAccessor } from '../../../browser/editorExtensions';
import { ReplaceCommand } from '../../../common/commands/replaceCommand';
import { MoveOperations } from '../../../common/cursor/cursorMoveOperations';
import { Range } from '../../../common/core/range';
import { ICommand } from '../../../common/editorCommon';
import { EditorContextKeys } from '../../../common/editorContextKeys';
import * as nls from '../../../../nls';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry';

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
					primary: KeyMod.WinCtrl | KeyCode.KeyT
				},
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (!editor.hasModel()) {
			return;
		}

		const model = editor.getModel();
		const commands: ICommand[] = [];
		const selections = editor.getSelections();

		for (const selection of selections) {
			if (!selection.isEmpty()) {
				continue;
			}

			const lineNumber = selection.startLineNumber;
			const column = selection.startColumn;

			const lastColumn = model.getLineMaxColumn(lineNumber);

			if (lineNumber === 1 && (column === 1 || (column === 2 && lastColumn === 2))) {
				// at beginning of file, nothing to do
				continue;
			}

			// handle special case: when at end of line, transpose left two chars
			// otherwise, transpose left and right chars
			const endPosition = (column === lastColumn) ?
				selection.getPosition() :
				MoveOperations.rightPosition(model, selection.getPosition().lineNumber, selection.getPosition().column);

			const middlePosition = MoveOperations.leftPosition(model, endPosition);
			const beginPosition = MoveOperations.leftPosition(model, middlePosition);

			const leftChar = model.getValueInRange(Range.fromPositions(beginPosition, middlePosition));
			const rightChar = model.getValueInRange(Range.fromPositions(middlePosition, endPosition));

			const replaceRange = Range.fromPositions(beginPosition, endPosition);
			commands.push(new ReplaceCommand(replaceRange, rightChar + leftChar));
		}

		if (commands.length > 0) {
			editor.pushUndoStop();
			editor.executeCommands(this.id, commands);
			editor.pushUndoStop();
		}
	}
}

registerEditorAction(TransposeLettersAction);
