/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Range} from 'vs/editor/common/core/range';
import {EditOperation} from 'vs/editor/common/core/editOperation';
import EditorCommon = require('vs/editor/common/editorCommon');
import Strings = require('vs/base/common/strings');
import {Position} from 'vs/editor/common/core/position';

export class SortLinesCommand implements EditorCommon.ICommand {

	private selection:EditorCommon.IEditorSelection;
	private selectionId:string;
	private descending:boolean;

	constructor(selection:EditorCommon.IEditorSelection, descending:boolean) {
		this.selection = selection;
		this.descending = descending;
	}

	public getEditOperations(model:EditorCommon.ITokenizedModel, builder:EditorCommon.IEditOperationBuilder):void {
		var ops = sortLines(model, this.selection, this.descending);
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
export function sortLines(model:EditorCommon.ITextModel, selection:EditorCommon.IEditorSelection, descending:boolean): EditorCommon.IIdentifiedSingleEditOperation[] {
	var r:EditorCommon.IIdentifiedSingleEditOperation[] = [];

	// Nothing to sort if user didn't select anything.
	if (selection.startLineNumber === selection.endLineNumber) {
		return r;
	}

	var linesToSort = [];

	// Get the contents of the selection to be sorted.
	for (var lineNumber = selection.startLineNumber; lineNumber <= selection.endLineNumber; lineNumber++) {
		linesToSort.push(model.getLineContent(lineNumber));
	}

	var sorted = linesToSort.sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	// If descending, reverse the order.
	if (descending === true) {
		sorted = sorted.reverse();
	}

	// Make sure all text across start and end lines are replaced.
	selection.startColumn = 1;
	selection.endColumn = model.getLineMaxColumn(selection.endLineNumber);

	r.push(EditOperation.replace(selection, sorted.join('\n')));

	return r;
}
