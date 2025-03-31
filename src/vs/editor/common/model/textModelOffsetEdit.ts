/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditOperation } from '../core/editOperation.js';
import { Range } from '../core/range.js';
import { OffsetEdit, SingleOffsetEdit } from '../core/offsetEdit.js';
import { OffsetRange } from '../core/offsetRange.js';
import { DetailedLineRangeMapping } from '../diff/rangeMapping.js';
import { ITextModel, IIdentifiedSingleEditOperation } from '../model.js';
import { IModelContentChange } from '../textModelEvents.js';


export abstract class OffsetEdits {

	private constructor() {
		// static utils only!
	}

	static asEditOperations(offsetEdit: OffsetEdit, doc: ITextModel): IIdentifiedSingleEditOperation[] {
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

	static fromContentChanges(contentChanges: readonly IModelContentChange[]) {
		const editsArr = contentChanges.map(c => new SingleOffsetEdit(OffsetRange.ofStartAndLength(c.rangeOffset, c.rangeLength), c.text));
		editsArr.reverse();
		const edits = new OffsetEdit(editsArr);
		return edits;
	}

	static fromLineRangeMapping(original: ITextModel, modified: ITextModel, changes: readonly DetailedLineRangeMapping[]): OffsetEdit {
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
}
