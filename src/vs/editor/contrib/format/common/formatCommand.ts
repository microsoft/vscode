/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';

export class EditOperationsCommand implements editorCommon.ICommand {

	private _edits:editorCommon.ISingleEditOperation[];
	private _initialSelection: editorCommon.IEditorSelection;
	private _selectionId: string;

	constructor(edits:editorCommon.ISingleEditOperation[], initialSelection: editorCommon.IEditorSelection) {
		this._edits = edits;
		this._initialSelection = initialSelection;
	}

	public getEditOperations(model: editorCommon.ITokenizedModel, builder: editorCommon.IEditOperationBuilder): void {
		this._edits
			// We know that this edit.range comes from the mirror model, so it should only contain \n and no \r's
			.map((edit) => EditOperationsCommand.trimEdit(edit, model))
			.filter((edit) => edit !== null) // produced above in case the edit.text is identical to the existing text
			.forEach((edit) => builder.addEditOperation(Range.lift(edit.range), edit.text));

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

	public computeCursorState(model: editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): editorCommon.IEditorSelection {
		return helper.getTrackedSelection(this._selectionId);
	}

	static fixLineTerminators(edit: editorCommon.ISingleEditOperation, model: editorCommon.ITokenizedModel): void {
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
	static trimEdit(edit:editorCommon.ISingleEditOperation, model: editorCommon.ITokenizedModel): editorCommon.ISingleEditOperation {

		this.fixLineTerminators(edit, model);

		return this._trimEdit(model.validateRange(edit.range), edit.text, edit.forceMoveMarkers, model);
	}

	static _trimEdit(editRange:Range, editText:string, editForceMoveMarkers:boolean, model: editorCommon.ITokenizedModel): editorCommon.ISingleEditOperation {

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
