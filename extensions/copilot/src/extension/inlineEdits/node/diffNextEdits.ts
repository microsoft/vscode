/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiffService } from '../../../platform/diff/common/diffService';
import { LineEdit, LineReplacement } from '../../../util/vs/editor/common/core/edits/lineEdit';
import { LineRangeMapping } from '../../../util/vs/editor/common/diff/rangeMapping';
import { Lines } from '../../prompt/node/editGeneration';
import { getTrailingArrayEmptyLineCount } from '../../prompts/node/codeMapper/codeMapper';

/**
 * Generates the next edit based on the current lines and the desired lines.
 */
export async function generateDiffNextEdits(
	diffService: IDiffService,
	currentLines: string[],
	desiredLines: Lines
): Promise<LineEdit> {
	const adjustedDesiredLines = eliminateTrimEmptyLinesDifference(currentLines, desiredLines);
	const diff = await diffService.computeDiff(
		currentLines.join('\n'),
		adjustedDesiredLines.join('\n'),
		{
			ignoreTrimWhitespace: false,
			maxComputationTimeMs: 1000,
			computeMoves: false
		}
	);
	const lineEdit = createLineEditFromDiff(diff.changes, adjustedDesiredLines);
	return lineEdit;
}

function eliminateTrimEmptyLinesDifference(sourceLines: Lines, resultLines: Lines): Lines {
	const leadingEmptyLineCount = getLeadingEmptyLineCount(sourceLines);
	const trailingEmptyLineCount = getTrailingArrayEmptyLineCount(sourceLines);

	const leadingResultEmptyLineCount = getLeadingEmptyLineCount(resultLines);
	const trailingResultEmptyLineCount = getTrailingArrayEmptyLineCount(resultLines);

	const trimResultLines = resultLines.slice(leadingResultEmptyLineCount, resultLines.length - trailingResultEmptyLineCount);
	return [
		...sourceLines.slice(0, leadingEmptyLineCount),
		...trimResultLines,
		...sourceLines.slice(sourceLines.length - trailingEmptyLineCount, sourceLines.length)
	];
}

function getLeadingEmptyLineCount(lines: readonly string[]): number {
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() !== '') {
			return i;
		}
	}
	return lines.length;
}

function createLineEditFromDiff(changes: readonly LineRangeMapping[], resultingLines: Lines): LineEdit {
	return new LineEdit(changes.map((change) => {
		return createSingleLineEditFromDiff(change, resultingLines);
	}));
}

function createSingleLineEditFromDiff(diff: LineRangeMapping, newLines: readonly string[]): LineReplacement {
	return new LineReplacement(diff.original, newLines.slice(diff.modified.startLineNumber - 1, diff.modified.endLineNumberExclusive - 1));
}
