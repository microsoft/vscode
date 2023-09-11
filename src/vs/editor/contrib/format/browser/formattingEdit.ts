/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditOperation, ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { EndOfLineSequence } from 'vs/editor/common/model';
import { TextEdit } from 'vs/editor/common/languages';
import { StableEditorScrollState } from 'vs/editor/browser/stableEditorScroll';

export class FormattingEdit {

	private static _handleEolEdits(editor: ICodeEditor, edits: TextEdit[]): ISingleEditOperation[] {
		let newEol: EndOfLineSequence | undefined = undefined;
		const singleEdits: ISingleEditOperation[] = [];

		for (const edit of edits) {
			if (typeof edit.eol === 'number') {
				newEol = edit.eol;
			}
			if (edit.range && typeof edit.text === 'string') {
				singleEdits.push(edit);
			}
		}

		if (typeof newEol === 'number') {
			if (editor.hasModel()) {
				editor.getModel().pushEOL(newEol);
			}
		}

		return singleEdits;
	}

	private static _isFullModelReplaceEdit(editor: ICodeEditor, edit: ISingleEditOperation): boolean {
		if (!editor.hasModel()) {
			return false;
		}
		const model = editor.getModel();
		const editRange = model.validateRange(edit.range);
		const fullModelRange = model.getFullModelRange();
		return fullModelRange.equalsRange(editRange);
	}

	static execute(editor: ICodeEditor, _edits: TextEdit[], addUndoStops: boolean) {
		if (addUndoStops) {
			editor.pushUndoStop();
		}
		const scrollState = StableEditorScrollState.capture(editor);
		const edits = FormattingEdit._handleEolEdits(editor, _edits);
		if (edits.length === 1 && FormattingEdit._isFullModelReplaceEdit(editor, edits[0])) {
			// We use replace semantics and hope that markers stay put...
			editor.executeEdits('formatEditsCommand', edits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text)));
		} else {
			editor.executeEdits('formatEditsCommand', edits.map(edit => EditOperation.replaceMove(Range.lift(edit.range), edit.text)));
		}
		if (addUndoStops) {
			editor.pushUndoStop();
		}
		scrollState.restoreRelativeVerticalPositionOfCursor(editor);
	}
}
