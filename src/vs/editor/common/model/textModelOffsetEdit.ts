/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditOperation } from '../core/editOperation.js';
import { Range } from '../core/range.js';
import { OffsetEdit, SingleOffsetEdit } from '../core/edits/offsetEdit.js';
import { OffsetRange } from '../core/ranges/offsetRange.js';
import { DetailedLineRangeMapping } from '../diff/rangeMapping.js';
import { ITextModel, IIdentifiedSingleEditOperation } from '../model.js';
import { IModelContentChange } from '../textModelEvents.js';
import { LengthEdit } from '../core/edits/lengthEdit.js';
import { countEOL } from '../core/misc/eolCounter.js';

export function offsetEditToEditOperations(offsetEdit: OffsetEdit, doc: ITextModel): IIdentifiedSingleEditOperation[] {
	const edits: IIdentifiedSingleEditOperation[] = [];
	for (const singleEdit of offsetEdit.edits) {
		const range = Range.fromPositions(
			doc.getPositionAt(singleEdit.replaceRange.start),
			doc.getPositionAt(singleEdit.replaceRange.start + singleEdit.replaceRange.length)
		);
		edits.push(EditOperation.replace(range, singleEdit.newText));
	}
	return edits;
}

export function offsetEditFromContentChanges(contentChanges: readonly IModelContentChange[]) {
	const editsArr = contentChanges.map(c => new SingleOffsetEdit(OffsetRange.ofStartAndLength(c.rangeOffset, c.rangeLength), c.text));
	editsArr.reverse();
	const edits = new OffsetEdit(editsArr);
	return edits;
}

export function offsetEditFromLineRangeMapping(original: ITextModel, modified: ITextModel, changes: readonly DetailedLineRangeMapping[]): OffsetEdit {
	const edits: SingleOffsetEdit[] = [];
	for (const c of changes) {
		for (const i of c.innerChanges ?? []) {
			const newText = modified.getValueInRange(i.modifiedRange);

			const startOrig = original.getOffsetAt(i.originalRange.getStartPosition());
			const endExOrig = original.getOffsetAt(i.originalRange.getEndPosition());
			const origRange = new OffsetRange(startOrig, endExOrig);

			edits.push(new SingleOffsetEdit(origRange, newText));
		}
	}

	return new OffsetEdit(edits);
}

export function linesLengthEditFromModelContentChange(c: IModelContentChange[]): LengthEdit {
	const contentChanges = c.slice().reverse();
	const lengthEdits = contentChanges.map(c => LengthEdit.replace(
		// Expand the edit range to include the entire line
		new OffsetRange(c.range.startLineNumber - 1, c.range.endLineNumber),
		countEOL(c.text)[0] + 1)
	);
	const lengthEdit = LengthEdit.compose(lengthEdits);
	return lengthEdit;
}
