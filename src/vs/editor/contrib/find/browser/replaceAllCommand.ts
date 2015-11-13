/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';

interface IEditOperation {
	range:EditorCommon.IEditorRange;
	text:string;
}

export class ReplaceAllCommand implements EditorCommon.ICommand {

	private _ranges: EditorCommon.IEditorRange[];
	private _replaceStrings: string[];

	constructor(ranges: EditorCommon.IEditorRange[], replaceStrings:string[]) {
		this._ranges = ranges;
		this._replaceStrings = replaceStrings;
	}

	public getEditOperations(model:EditorCommon.ITokenizedModel, builder:EditorCommon.IEditOperationBuilder): void {
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

	public computeCursorState(model:EditorCommon.ITokenizedModel, helper: EditorCommon.ICursorStateComputerData): EditorCommon.IEditorSelection {
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
