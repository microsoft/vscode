/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IIdentifiedSingleEditOperation, ITextModel } from 'vs/editor/common/model';

export class SortLinesCommand implements editorCommon.ICommand {

	private readonly selection: Selection;
	private readonly descending: boolean;
	private selectionId: string | null;

	constructor(selection: Selection, descending: boolean) {
		this.selection = selection;
		this.descending = descending;
		this.selectionId = null;
	}

	public getEditOperations(model: ITextModel, builder: editorCommon.IEditOperationBuilder): void {
		let op = sortLines(model, this.selection, this.descending);
		if (op) {
			builder.addEditOperation(op.range, op.text);
		}

		this.selectionId = builder.trackSelection(this.selection);
	}

	public computeCursorState(model: ITextModel, helper: editorCommon.ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this.selectionId!);
	}

	public static canRun(model: ITextModel | null, selection: Selection, descending: boolean): boolean {
		if (model === null) {
			return false;
		}

		let data = getSortData(model, selection, descending);

		if (!data) {
			return false;
		}

		for (let i = 0, len = data.before.length; i < len; i++) {
			if (data.before[i] !== data.after[i]) {
				return true;
			}
		}

		return false;
	}
}

function getSortData(model: ITextModel, selection: Selection, descending: boolean) {
	let startLineNumber = selection.startLineNumber;
	let endLineNumber = selection.endLineNumber;

	if (selection.endColumn === 1) {
		endLineNumber--;
	}

	// Nothing to sort if user didn't select anything.
	if (startLineNumber >= endLineNumber) {
		return null;
	}

	let linesToSort: string[] = [];

	// Get the contents of the selection to be sorted.
	for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
		linesToSort.push(model.getLineContent(lineNumber));
	}

	let sorted = linesToSort.slice(0);
	sorted.sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	// If descending, reverse the order.
	if (descending === true) {
		sorted = sorted.reverse();
	}

	return {
		startLineNumber: startLineNumber,
		endLineNumber: endLineNumber,
		before: linesToSort,
		after: sorted
	};
}

/**
 * Generate commands for sorting lines on a model.
 */
function sortLines(model: ITextModel, selection: Selection, descending: boolean): IIdentifiedSingleEditOperation | null {
	let data = getSortData(model, selection, descending);

	if (!data) {
		return null;
	}

	return EditOperation.replace(
		new Range(data.startLineNumber, 1, data.endLineNumber, model.getLineMaxColumn(data.endLineNumber)),
		data.after.join('\n')
	);
}
