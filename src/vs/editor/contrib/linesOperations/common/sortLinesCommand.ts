/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EditOperation} from 'vs/editor/common/core/editOperation';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {Range} from 'vs/editor/common/core/range';

export class SortLinesCommand implements editorCommon.ICommand {

	private selection:editorCommon.IEditorSelection;
	private selectionId:string;
	private descending:boolean;

	constructor(selection:editorCommon.IEditorSelection, descending:boolean) {
		this.selection = selection;
		this.descending = descending;
	}

	public getEditOperations(model:editorCommon.ITokenizedModel, builder:editorCommon.IEditOperationBuilder):void {
		let op = sortLines(model, this.selection, this.descending);
		if (op) {
			builder.addEditOperation(op.range, op.text);
		}

		this.selectionId = builder.trackSelection(this.selection);
	}

	public computeCursorState(model:editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData):editorCommon.IEditorSelection {
		return helper.getTrackedSelection(this.selectionId);
	}
}

/**
 * Generate commands for sorting lines on a model.
 */
export function sortLines(model:editorCommon.ITextModel, selection:editorCommon.IEditorSelection, descending:boolean): editorCommon.IIdentifiedSingleEditOperation {
	let startLineNumber = selection.startLineNumber;
	let endLineNumber = selection.endLineNumber;

	if (selection.endColumn === 1) {
		endLineNumber--;
	}

	// Nothing to sort if user didn't select anything.
	if (startLineNumber >= endLineNumber) {
		return null;
	}

	let linesToSort = [];

	// Get the contents of the selection to be sorted.
	for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
		linesToSort.push(model.getLineContent(lineNumber));
	}

	let sorted = linesToSort.sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	// If descending, reverse the order.
	if (descending === true) {
		sorted = sorted.reverse();
	}

	return EditOperation.replace(
		new Range(startLineNumber, 1, endLineNumber, model.getLineMaxColumn(endLineNumber)),
		sorted.join('\n')
	);
}
