/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { ICharChange, IDiffComputationResult, ILineChange } from 'vs/editor/common/diff/diffComputer';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { LineRange, LineRangeMapping, RangeMapping } from 'vs/workbench/contrib/mergeEditor/browser/model';

export interface IDiffComputer {
	computeDiff(textModel1: ITextModel, textModel2: ITextModel): Promise<IDiffComputerResult>;
}

export interface IDiffComputerResult {
	diffs: LineRangeMapping[] | null;
}

export class EditorWorkerServiceDiffComputer implements IDiffComputer {
	constructor(@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService) { }

	async computeDiff(textModel1: ITextModel, textModel2: ITextModel): Promise<IDiffComputerResult> {
		const diffs = await this.editorWorkerService.computeDiff(textModel1.uri, textModel2.uri, false, 1000);
		if (!diffs || diffs.quitEarly) {
			return { diffs: null };
		}
		return { diffs: EditorWorkerServiceDiffComputer.fromDiffComputationResult(diffs, textModel1, textModel2) };
	}

	public static fromDiffComputationResult(result: IDiffComputationResult, textModel1: ITextModel, textModel2: ITextModel): LineRangeMapping[] {
		return result.changes.map((c) => fromLineChange(c, textModel1, textModel2));
	}
}

function fromLineChange(lineChange: ILineChange, originalTextModel: ITextModel, modifiedTextModel: ITextModel): LineRangeMapping {
	let originalRange: LineRange;
	if (lineChange.originalEndLineNumber === 0) {
		// Insertion
		originalRange = new LineRange(lineChange.originalStartLineNumber + 1, 0);
	} else {
		originalRange = new LineRange(lineChange.originalStartLineNumber, lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1);
	}

	let modifiedRange: LineRange;
	if (lineChange.modifiedEndLineNumber === 0) {
		// Deletion
		modifiedRange = new LineRange(lineChange.modifiedStartLineNumber + 1, 0);
	} else {
		modifiedRange = new LineRange(lineChange.modifiedStartLineNumber, lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1);
	}

	let innerDiffs = lineChange.charChanges?.map(c => rangeMappingFromCharChange(c));
	if (!innerDiffs) {
		innerDiffs = [rangeMappingFromLineRanges(originalRange, modifiedRange)];
	}

	return new LineRangeMapping(
		originalTextModel,
		originalRange,
		modifiedTextModel,
		modifiedRange,
		innerDiffs
	);
}

function rangeMappingFromLineRanges(originalRange: LineRange, modifiedRange: LineRange): RangeMapping {
	return new RangeMapping(
		new Range(
			originalRange.startLineNumber,
			1,
			originalRange.endLineNumberExclusive,
			1,
		),
		new Range(
			modifiedRange.startLineNumber,
			1,
			modifiedRange.endLineNumberExclusive,
			1,
		)
	);
}

function rangeMappingFromCharChange(charChange: ICharChange): RangeMapping {
	return new RangeMapping(
		new Range(charChange.originalStartLineNumber, charChange.originalStartColumn, charChange.originalEndLineNumber, charChange.originalEndColumn),
		new Range(charChange.modifiedStartLineNumber, charChange.modifiedStartColumn, charChange.modifiedEndLineNumber, charChange.modifiedEndColumn)
	);
}
