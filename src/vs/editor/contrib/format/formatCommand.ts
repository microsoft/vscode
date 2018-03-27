/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';
import { TextEdit } from 'vs/editor/common/modes';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Selection } from 'vs/editor/common/core/selection';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITextModel, EndOfLineSequence, ISingleEditOperation } from 'vs/editor/common/model';
import { EditOperation } from 'vs/editor/common/core/editOperation';

export class EditOperationsCommand implements editorCommon.ICommand {

	static _handleEolEdits(editor: ICodeEditor, edits: TextEdit[]): ISingleEditOperation[] {
		let newEol: EndOfLineSequence = undefined;
		let singleEdits: ISingleEditOperation[] = [];

		for (let edit of edits) {
			if (typeof edit.eol === 'number') {
				newEol = edit.eol;
			}
			if (edit.range && typeof edit.text === 'string') {
				singleEdits.push(edit);
			}
		}

		if (typeof newEol === 'number') {
			editor.getModel().setEOL(newEol);
		}

		return singleEdits;
	}

	static executeAsCommand(editor: ICodeEditor, _edits: TextEdit[]) {
		let edits = this._handleEolEdits(editor, _edits);
		const cmd = new EditOperationsCommand(edits, editor.getSelection());
		editor.pushUndoStop();
		editor.executeCommand('formatEditsCommand', cmd);
		editor.pushUndoStop();
	}

	static execute(editor: ICodeEditor, _edits: TextEdit[]) {
		let edits = this._handleEolEdits(editor, _edits);
		editor.pushUndoStop();
		editor.executeEdits('formatEditsCommand', edits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text)));
		editor.pushUndoStop();
	}

	private _edits: ISingleEditOperation[];
	private _initialSelection: Selection;
	private _selectionId: string;

	constructor(edits: ISingleEditOperation[], initialSelection: Selection) {
		this._initialSelection = initialSelection;
		this._edits = edits;
	}

	public getEditOperations(model: ITextModel, builder: editorCommon.IEditOperationBuilder): void {

		for (let edit of this._edits) {
			// We know that this edit.range comes from the mirror model, so it should only contain \n and no \r's
			let trimEdit = EditOperationsCommand.trimEdit(edit, model);
			if (trimEdit !== null) { // produced above in case the edit.text is identical to the existing text
				builder.addEditOperation(Range.lift(edit.range), edit.text);
			}
		}

		var selectionIsSet = false;
		if (Array.isArray(this._edits) && this._edits.length === 1 && this._initialSelection.isEmpty()) {
			if (this._edits[0].range.startColumn === this._initialSelection.endColumn &&
				this._edits[0].range.startLineNumber === this._initialSelection.endLineNumber) {
				selectionIsSet = true;
				this._selectionId = builder.trackSelection(this._initialSelection, true);
			} else if (this._edits[0].range.endColumn === this._initialSelection.startColumn &&
				this._edits[0].range.endLineNumber === this._initialSelection.startLineNumber) {
				selectionIsSet = true;
				this._selectionId = builder.trackSelection(this._initialSelection, false);
			}
		}

		if (!selectionIsSet) {
			this._selectionId = builder.trackSelection(this._initialSelection);
		}
	}

	public computeCursorState(model: ITextModel, helper: editorCommon.ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this._selectionId);
	}

	static fixLineTerminators(edit: ISingleEditOperation, model: ITextModel): void {
		edit.text = edit.text.replace(/\r\n|\r|\n/g, model.getEOL());
	}

	/**
	 * This is used to minimize the edits by removing changes that appear on the edges of the range which are identical
	 * to the current text.
	 *
	 * The reason this was introduced is to allow better selection tracking of the current cursor and solve
	 * bug #15108. There the cursor was jumping since the tracked selection was in the middle of the range edit
	 * and was lost.
	 */
	static trimEdit(edit: ISingleEditOperation, model: ITextModel): ISingleEditOperation {

		this.fixLineTerminators(edit, model);

		return this._trimEdit(model.validateRange(edit.range), edit.text, edit.forceMoveMarkers, model);
	}

	static _trimEdit(editRange: Range, editText: string, editForceMoveMarkers: boolean, model: ITextModel): ISingleEditOperation {

		let currentText = model.getValueInRange(editRange);

		// Find the equal characters in the front
		let commonPrefixLength = strings.commonPrefixLength(editText, currentText);

		// If the two strings are identical, return no edit (no-op)
		if (commonPrefixLength === currentText.length && commonPrefixLength === editText.length) {
			return null;
		}

		if (commonPrefixLength > 0) {
			// Apply front trimming
			let newStartPosition = model.modifyPosition(editRange.getStartPosition(), commonPrefixLength);
			editRange = new Range(newStartPosition.lineNumber, newStartPosition.column, editRange.endLineNumber, editRange.endColumn);
			editText = editText.substring(commonPrefixLength);
			currentText = currentText.substr(commonPrefixLength);
		}

		// Find the equal characters in the rear
		let commonSuffixLength = strings.commonSuffixLength(editText, currentText);

		if (commonSuffixLength > 0) {
			// Apply rear trimming
			let newEndPosition = model.modifyPosition(editRange.getEndPosition(), -commonSuffixLength);
			editRange = new Range(editRange.startLineNumber, editRange.startColumn, newEndPosition.lineNumber, newEndPosition.column);
			editText = editText.substring(0, editText.length - commonSuffixLength);
			currentText = currentText.substring(0, currentText.length - commonSuffixLength);
		}

		return {
			text: editText,
			range: editRange,
			forceMoveMarkers: editForceMoveMarkers
		};
	}
}
