/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import Strings = require('vs/base/common/strings');
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';

export class EditOperationsCommand implements EditorCommon.ICommand {

	private _edits:EditorCommon.ISingleEditOperation[];
	private _initialSelection: EditorCommon.IEditorSelection;
	private _selectionId: string;

	constructor(edits:EditorCommon.ISingleEditOperation[], initialSelection: EditorCommon.IEditorSelection) {
		this._edits = edits;
		this._initialSelection = initialSelection;
	}

	public getEditOperations(model: EditorCommon.ITokenizedModel, builder: EditorCommon.IEditOperationBuilder): void {
		this._edits
			// We know that this edit.range comes from the mirror model, so it should only contain \n and no \r's
			.map((edit) => this.fixLineTerminators(edit, model) )
			.map((edit) => this.trimEdit(edit, model))
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

	public computeCursorState(model: EditorCommon.ITokenizedModel, helper: EditorCommon.ICursorStateComputerData): EditorCommon.IEditorSelection {
		return helper.getTrackedSelection(this._selectionId);
	}

	private fixLineTerminators(edit: EditorCommon.ISingleEditOperation, model: EditorCommon.ITokenizedModel) : EditorCommon.ISingleEditOperation {
		edit.text = edit.text.replace(/\r\n|\r|\n/g, model.getEOL());
		return edit;
	}

	/**
	 * This is used to minimize the edits by removing changes that appear on the edges of the range which are identical
	 * to the current text.
	 *
	 * The reason this was introduced is to allow better selection tracking of the current cursor and solve
	 * bug #15108. There the cursor was jumping since the tracked selection was in the middle of the range edit
	 * and was lost.
	 */
	private trimEdit(edit:EditorCommon.ISingleEditOperation, model: EditorCommon.ITokenizedModel): EditorCommon.ISingleEditOperation {

		var currentText = model.getValueInRange(edit.range);

		// Find the equal characters in the front
		var commonPrefixLength = Strings.commonPrefixLength(edit.text, currentText);

		// If the two strings are identical, return no edit
		if (commonPrefixLength === currentText.length && commonPrefixLength === edit.text.length) {
			return null;
		}

		// Only compute a common suffix if none of the strings is already fully contained in the prefix
		var commonSuffixLength = 0;
		if (commonPrefixLength !== currentText.length && commonPrefixLength !== edit.text.length) {
			commonSuffixLength = Strings.commonSuffixLength(edit.text, currentText);
		}

		// Adjust start position
		var newStartPosition = new Position(edit.range.startLineNumber, edit.range.startColumn);
		newStartPosition = model.modifyPosition(newStartPosition, commonPrefixLength);

		// Adjust end position
		var newEndPosition = new Position(edit.range.endLineNumber, edit.range.endColumn);
		newEndPosition = model.modifyPosition(newEndPosition, -commonSuffixLength);

		//Trim the text
		var newText = edit.text.slice(commonPrefixLength, edit.text.length - commonSuffixLength);

		return {
			text: newText,
				range: {
					startLineNumber:newStartPosition.lineNumber,
					startColumn:newStartPosition.column,
					endLineNumber:newEndPosition.lineNumber,
					endColumn: newEndPosition.column
			}};
	}
}
