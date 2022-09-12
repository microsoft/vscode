/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertFn, checkAdjacentItems } from 'vs/base/common/assert';
import { IReader, observableFromEvent } from 'vs/base/common/observable';
import { isDefined } from 'vs/base/common/types';
import { Range } from 'vs/editor/common/core/range';
import { IDocumentDiffProvider } from 'vs/editor/common/diff/documentDiffProvider';
import { LineRange as DiffLineRange, RangeMapping as DiffRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { ITextModel } from 'vs/editor/common/model';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { DetailedLineRangeMapping, RangeMapping } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';

export interface IMergeDiffComputer {
	computeDiff(textModel1: ITextModel, textModel2: ITextModel, reader: IReader): Promise<IMergeDiffComputerResult>;
}

export interface IMergeDiffComputerResult {
	diffs: DetailedLineRangeMapping[] | null;
}

export class MergeDiffComputer implements IMergeDiffComputer {

	private readonly mergeAlgorithm = observableFromEvent(
		this.configurationService.onDidChangeConfiguration,
		() => /** @description config: mergeAlgorithm.diffAlgorithm */ this.configurationService.getValue<'smart' | 'experimental'>('mergeEditor.diffAlgorithm')
	);

	constructor(
		private readonly documentDiffProvider: IDocumentDiffProvider,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
	}

	async computeDiff(textModel1: ITextModel, textModel2: ITextModel, reader: IReader): Promise<IMergeDiffComputerResult> {
		const diffAlgorithm = this.mergeAlgorithm.read(reader);
		const result = await this.documentDiffProvider.computeDiff(
			textModel1,
			textModel2,
			{
				ignoreTrimWhitespace: false,
				maxComputationTime: 0,
				diffAlgorithm,
			}
		);

		const changes = result.changes.map(c =>
			new DetailedLineRangeMapping(
				toLineRange(c.originalRange),
				textModel1,
				toLineRange(c.modifiedRange),
				textModel2,
				c.innerChanges?.map(ic => normalizeRangeMapping(toRangeMapping(ic), textModel1, textModel2)).filter(isDefined)
			)
		);

		assertFn(() => {
			return checkAdjacentItems(changes,
				(m1, m2) => m2.inputRange.startLineNumber - m1.inputRange.endLineNumberExclusive === m2.outputRange.startLineNumber - m1.outputRange.endLineNumberExclusive &&
					// There has to be an unchanged line in between (otherwise both diffs should have been joined)
					m1.inputRange.endLineNumberExclusive < m2.inputRange.startLineNumber &&
					m1.outputRange.endLineNumberExclusive < m2.outputRange.startLineNumber,
			);
		});

		return {
			diffs: changes
		};
	}
}

function toLineRange(range: DiffLineRange): LineRange {
	return new LineRange(range.startLineNumber, range.length);
}

function toRangeMapping(mapping: DiffRangeMapping): RangeMapping {
	return new RangeMapping(mapping.originalRange, mapping.modifiedRange);
}

function normalizeRangeMapping(rangeMapping: RangeMapping, inputTextModel: ITextModel, outputTextModel: ITextModel): RangeMapping | undefined {
	const inputRangeEmpty = rangeMapping.inputRange.isEmpty();
	const outputRangeEmpty = rangeMapping.outputRange.isEmpty();

	if (inputRangeEmpty && outputRangeEmpty) {
		return undefined;
	}

	if (rangeMapping.inputRange.startLineNumber > inputTextModel.getLineCount()
		|| rangeMapping.outputRange.startLineNumber > outputTextModel.getLineCount()) {
		return rangeMapping;
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
