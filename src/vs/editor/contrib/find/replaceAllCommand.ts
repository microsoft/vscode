/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';

interface IEditOperation {
	range: Range;
	text: string;
}

export class ReplaceAllCommand implements editorCommon.ICommand {

	private readonly _editorSelection: Selection;
	private _trackedEditorSelectionId: string | null;
	private readonly _ranges: Range[];
	private readonly _replaceStrings: string[];

	constructor(editorSelection: Selection, ranges: Range[], replaceStrings: string[]) {
		this._editorSelection = editorSelection;
		this._ranges = ranges;
		this._replaceStrings = replaceStrings;
		this._trackedEditorSelectionId = null;
	}

	public getEditOperations(model: ITextModel, builder: editorCommon.IEditOperationBuilder): void {
		if (this._ranges.length > 0) {
			// Collect all edit operations
			let ops: IEditOperation[] = [];
			for (let i = 0; i < this._ranges.length; i++) {
				ops.push({
					range: this._ranges[i],
					text: this._replaceStrings[i]
				});
			}

			// Sort them in ascending order by range starts
			ops.sort((o1, o2) => {
				return Range.compareRangesUsingStarts(o1.range, o2.range);
			});

			// Merge operations that touch each other
			let resultOps: IEditOperation[] = [];
			let previousOp = ops[0];
			for (let i = 1; i < ops.length; i++) {
				if (previousOp.range.endLineNumber === ops[i].range.startLineNumber && previousOp.range.endColumn === ops[i].range.startColumn) {
					// These operations are one after another and can be merged
					previousOp.range = previousOp.range.plusRange(ops[i].range);
					previousOp.text = previousOp.text + ops[i].text;
				} else {
					resultOps.push(previousOp);
					previousOp = ops[i];
				}
			}
			resultOps.push(previousOp);

			for (const op of resultOps) {
				builder.addEditOperation(op.range, op.text);
			}
		}

		this._trackedEditorSelectionId = builder.trackSelection(this._editorSelection);
	}

	public computeCursorState(model: ITextModel, helper: editorCommon.ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this._trackedEditorSelectionId!);
	}
}
