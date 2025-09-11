/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditOperation } from '../core/editOperation.js';
import { Range } from '../core/range.js';
import { StringEdit, StringReplacement } from '../core/edits/stringEdit.js';
import { OffsetRange } from '../core/ranges/offsetRange.js';
import { DetailedLineRangeMapping } from '../diff/rangeMapping.js';
import { ITextModel, IIdentifiedSingleEditOperation } from '../model.js';
import { IModelContentChange } from './mirrorTextModel.js';
import { LengthEdit } from '../core/edits/lengthEdit.js';
import { countEOL } from '../core/misc/eolCounter.js';

export function offsetEditToEditOperations(offsetEdit: StringEdit, doc: ITextModel): IIdentifiedSingleEditOperation[] {
	const edits: IIdentifiedSingleEditOperation[] = [];
	for (const singleEdit of offsetEdit.replacements) {
		const range = Range.fromPositions(
			doc.getPositionAt(singleEdit.replaceRange.start),
			doc.getPositionAt(singleEdit.replaceRange.start + singleEdit.replaceRange.length)
		);
		edits.push(EditOperation.replace(range, singleEdit.newText));
	}
	return edits;
}

export function offsetEditFromContentChanges(contentChanges: readonly IModelContentChange[]) {
	const editsArr = contentChanges.map(c => new StringReplacement(OffsetRange.ofStartAndLength(c.rangeOffset, c.rangeLength), c.text));
	editsArr.reverse();
	const edits = new StringEdit(editsArr);
	return edits;
}

export function offsetEditFromLineRangeMapping(original: ITextModel, modified: ITextModel, changes: readonly DetailedLineRangeMapping[]): StringEdit {
	const edits: StringReplacement[] = [];
	for (const c of changes) {
		for (const i of c.innerChanges ?? []) {
			const newText = modified.getValueInRange(i.modifiedRange);

			const startOrig = original.getOffsetAt(i.originalRange.getStartPosition());
			const endExOrig = original.getOffsetAt(i.originalRange.getEndPosition());
			const origRange = new OffsetRange(startOrig, endExOrig);

			edits.push(new StringReplacement(origRange, newText));
		}
	}

	return new StringEdit(edits);
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
