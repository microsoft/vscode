/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDefined } from 'vs/base/common/types';
import { Range } from 'vs/editor/common/core/range';
import { ICharChange, IDiffComputationResult, ILineChange } from 'vs/editor/common/diff/diffComputer';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { DetailedLineRangeMapping, RangeMapping } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';

export interface IDiffComputer {
	computeDiff(textModel1: ITextModel, textModel2: ITextModel): Promise<IDiffComputerResult>;
}

export interface IDiffComputerResult {
	diffs: DetailedLineRangeMapping[] | null;
}

export class EditorWorkerServiceDiffComputer implements IDiffComputer {
	constructor(@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService) { }

	async computeDiff(textModel1: ITextModel, textModel2: ITextModel): Promise<IDiffComputerResult> {
		const diffs = await this.editorWorkerService.computeDiff(textModel1.uri, textModel2.uri, false, 1000);
		if (!diffs) {
			return { diffs: null };
		}
		return { diffs: EditorWorkerServiceDiffComputer.fromDiffComputationResult(diffs, textModel1, textModel2) };
	}

	public static fromDiffComputationResult(result: IDiffComputationResult, textModel1: ITextModel, textModel2: ITextModel): DetailedLineRangeMapping[] {
		return result.changes.map((c) => fromLineChange(c, textModel1, textModel2));
	}
}

function fromLineChange(lineChange: ILineChange, originalTextModel: ITextModel, modifiedTextModel: ITextModel): DetailedLineRangeMapping {
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

	let innerDiffs = lineChange.charChanges?.map(c => rangeMappingFromCharChange(c, originalTextModel, modifiedTextModel)).filter(isDefined);
	if (!innerDiffs || innerDiffs.length === 0) {
		innerDiffs = [rangeMappingFromLineRanges(originalRange, modifiedRange)];
	}

	return new DetailedLineRangeMapping(
		originalRange,
		originalTextModel,
		modifiedRange,
		modifiedTextModel,
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

function rangeMappingFromCharChange(charChange: ICharChange, inputTextModel: ITextModel, modifiedTextModel: ITextModel): RangeMapping | undefined {
	return normalizeRangeMapping(new RangeMapping(
		new Range(charChange.originalStartLineNumber, charChange.originalStartColumn, charChange.originalEndLineNumber, charChange.originalEndColumn),
		new Range(charChange.modifiedStartLineNumber, charChange.modifiedStartColumn, charChange.modifiedEndLineNumber, charChange.modifiedEndColumn)
	), inputTextModel, modifiedTextModel);
}

function normalizeRangeMapping(rangeMapping: RangeMapping, inputTextModel: ITextModel, outputTextModel: ITextModel): RangeMapping | undefined {
	const inputRangeEmpty = rangeMapping.inputRange.isEmpty();
	const outputRangeEmpty = rangeMapping.outputRange.isEmpty();

	if (inputRangeEmpty && outputRangeEmpty) {
		return undefined;
	}

	const originalStartsAtEndOfLine = isAtEndOfLine(rangeMapping.inputRange.startLineNumber, rangeMapping.inputRange.startColumn, inputTextModel);
	const modifiedStartsAtEndOfLine = isAtEndOfLine(rangeMapping.outputRange.startLineNumber, rangeMapping.outputRange.startColumn, outputTextModel);

	if (!inputRangeEmpty && !outputRangeEmpty && originalStartsAtEndOfLine && modifiedStartsAtEndOfLine) {
		// a b c [\n] x y z \n
		// d e f [\n a] \n
		// ->
		// a b c \n [] x y z \n
		// d e f \n [a] \n

		return new RangeMapping(
			rangeMapping.inputRange.setStartPosition(rangeMapping.inputRange.startLineNumber + 1, 1),

			rangeMapping.outputRange.setStartPosition(rangeMapping.outputRange.startLineNumber + 1, 1),
		);
	}

	if (
		modifiedStartsAtEndOfLine &&
		originalStartsAtEndOfLine &&
		((inputRangeEmpty && rangeEndsAtEndOfLine(rangeMapping.outputRange, outputTextModel)) ||
			(outputRangeEmpty && rangeEndsAtEndOfLine(rangeMapping.inputRange, inputTextModel)))
	) {
		// o: a b c [] \n x y z \n
		// m: d e f [\n a] \n
		// ->
		// o: a b c \n [] x y z \n
		// m: d e f \n [a \n]

		// or

		// a b c [\n x y z] \n
		// d e f [] \n a \n
		// ->
		// a b c \n [x y z \n]
		// d e f \n [] a \n

		return new RangeMapping(
			moveRange(rangeMapping.inputRange),
			moveRange(rangeMapping.outputRange)
		);
	}

	return rangeMapping;
}

function isAtEndOfLine(lineNumber: number, column: number, model: ITextModel): boolean {
	return column >= model.getLineMaxColumn(lineNumber);
}

function rangeEndsAtEndOfLine(range: Range, model: ITextModel,): boolean {
	return isAtEndOfLine(range.endLineNumber, range.endColumn, model);
}

function moveRange(range: Range): Range {
	return new Range(
		range.startLineNumber + 1,
		1,
		range.endLineNumber + 1,
		1,
	);
}
