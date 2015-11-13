/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import {EditOperation} from 'vs/editor/common/core/editOperation';
import EditorCommon = require('vs/editor/common/editorCommon');
import Strings = require('vs/base/common/strings');

export class TrimTrailingWhitespaceCommand implements EditorCommon.ICommand {

	private selection:EditorCommon.IEditorSelection;
	private selectionId:string;

	constructor(selection:EditorCommon.IEditorSelection) {
		this.selection = selection;
	}

	public getEditOperations(model:EditorCommon.ITokenizedModel, builder:EditorCommon.IEditOperationBuilder):void {
		var ops = trimTrailingWhitespace(model, []);
		for (var i = 0, len = ops.length; i < len; i++) {
			var op = ops[i];

			builder.addEditOperation(op.range, op.text);
		}

		this.selectionId = builder.trackSelection(this.selection);
	}

	public computeCursorState(model:EditorCommon.ITokenizedModel, helper: EditorCommon.ICursorStateComputerData):EditorCommon.IEditorSelection {
		return helper.getTrackedSelection(this.selectionId);
	}
}

/**
 * Generate commands for trimming trailing whitespace on a model and ignore lines on which cursors are sitting.
 */
export function trimTrailingWhitespace(model:EditorCommon.ITextModel, cursors: EditorCommon.IPosition[]): EditorCommon.IIdentifiedSingleEditOperation[] {
	// Sort cursors ascending
	cursors.sort((a, b) => {
		if (a.lineNumber === b.lineNumber) {
			return a.column - b.column;
		}
		return a.lineNumber - b.lineNumber;
	});

	// Reduce multiple cursors on the same line and only keep the last one on the line
	for (var i = cursors.length - 2; i >= 0; i--) {
		if (cursors[i].lineNumber === cursors[i + 1].lineNumber) {
			// Remove cursor at `i`
			cursors.splice(i, 1);
		}
	}

	var r:EditorCommon.IIdentifiedSingleEditOperation[] = [],
		cursorIndex = 0,
		cursorLen = cursors.length,
		lineNumber:number,
		lineCount:number,
		lineContent:string,
		minEditColumn:number,
		maxLineColumn:number,
		fromColumn:number,
		// toColumn:number,
		lastNonWhitespaceIndex:number;

	for (lineNumber = 1, lineCount = model.getLineCount(); lineNumber <= lineCount; lineNumber++) {
		lineContent = model.getLineContent(lineNumber);
		maxLineColumn = lineContent.length + 1;
		minEditColumn = 0;

		if (cursorIndex < cursorLen && cursors[cursorIndex].lineNumber === lineNumber) {
			minEditColumn = cursors[cursorIndex].column;
			cursorIndex++;
			if (minEditColumn === maxLineColumn) {
				// The cursor is at the end of the line => no edits for sure on this line
				continue;
			}
		}

		if (lineContent.length === 0) {
			continue;
		}

		lastNonWhitespaceIndex = Strings.lastNonWhitespaceIndex(lineContent);

		fromColumn = 0;
		if (lastNonWhitespaceIndex === -1) {
			// Entire line is whitespace
			fromColumn = 1;
		} else if (lastNonWhitespaceIndex !== lineContent.length - 1) {
			// There is trailing whitespace
			fromColumn = lastNonWhitespaceIndex + 2;
		} else {
			// There is no trailing whitespace
			continue;
		}

		fromColumn = Math.max(minEditColumn, fromColumn);
		r.push(EditOperation.delete(new Range(
			lineNumber, fromColumn,
			lineNumber, maxLineColumn
		)));
	}

	return r;
}