/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';

interface IEditOperation {
	range:editorCommon.IEditorRange;
	text:string;
}

export class ReplaceAllCommand implements editorCommon.ICommand {

	private _ranges: editorCommon.IEditorRange[];
	private _replaceStrings: string[];

	constructor(ranges: editorCommon.IEditorRange[], replaceStrings:string[]) {
		this._ranges = ranges;
		this._replaceStrings = replaceStrings;
	}

	public getEditOperations(model:editorCommon.ITokenizedModel, builder:editorCommon.IEditOperationBuilder): void {
		if (this._ranges.length > 0) {
			// Collect all edit operations
			var ops:IEditOperation[] = [];
			for (var i = 0; i < this._ranges.length; i++) {
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
			var resultOps:IEditOperation[] = [];
			var previousOp = ops[0];
			for (var i = 1; i < ops.length; i++) {
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

			for (var i = 0; i < resultOps.length; i++) {
				builder.addEditOperation(resultOps[i].range, resultOps[i].text);
			}
		}
	}

	public computeCursorState(model:editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): editorCommon.IEditorSelection {
		var inverseEditOperations = helper.getInverseEditOperations();
		var srcRange = inverseEditOperations[inverseEditOperations.length - 1].range;
		return Selection.createSelection(
			srcRange.endLineNumber,
			srcRange.endColumn,
			srcRange.endLineNumber,
			srcRange.endColumn
		);
	}
}
