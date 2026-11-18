/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefaultLinesDiffComputer } from '../../../util/vs/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer';
import { ILinesDiffComputerOptions } from '../../../util/vs/editor/common/diff/linesDiffComputer';
import { DetailedLineRangeMapping } from '../../../util/vs/editor/common/diff/rangeMapping';


export async function computeDiff(original: string, modified: string, options: ILinesDiffComputerOptions): Promise<IDiffComputationResult> {
	return computeDiffSync(original, modified, options);
}

export function computeDiffSync(original: string, modified: string, options: ILinesDiffComputerOptions): IDiffComputationResult {
	const originalLines = original.split(/\r\n|\r|\n/);
	const modifiedLines = modified.split(/\r\n|\r|\n/);
	const diffComputer = new DefaultLinesDiffComputer();
	const result = diffComputer.computeDiff(originalLines, modifiedLines, options);

	const identical = (result.changes.length > 0 ? false : original === modified);

	function getLineChanges(changes: readonly DetailedLineRangeMapping[]): ILineChange[] {
		return changes.map(m => ([m.original.startLineNumber, m.original.endLineNumberExclusive, m.modified.startLineNumber, m.modified.endLineNumberExclusive, m.innerChanges?.map(m => [
			m.originalRange.startLineNumber,
			m.originalRange.startColumn,
			m.originalRange.endLineNumber,
			m.originalRange.endColumn,
			m.modifiedRange.startLineNumber,
			m.modifiedRange.startColumn,
			m.modifiedRange.endLineNumber,
			m.modifiedRange.endColumn,
		])]));
	}

	return {
		identical,
		quitEarly: result.hitTimeout,
		changes: getLineChanges(result.changes),
		moves: result.moves.map(m => ([
			m.lineRangeMapping.original.startLineNumber,
			m.lineRangeMapping.original.endLineNumberExclusive,
			m.lineRangeMapping.modified.startLineNumber,
			m.lineRangeMapping.modified.endLineNumberExclusive,
			getLineChanges(m.changes)
		])),
	};
}

export interface IDiffComputationResult {
	quitEarly: boolean;
	changes: ILineChange[];
	identical: boolean;
	moves: ITextMove[];
}

export type ILineChange = [
	originalStartLine: number,
	originalEndLine: number,
	modifiedStartLine: number,
	modifiedEndLine: number,
	charChanges: ICharChange[] | undefined,
];

export type ICharChange = [
	originalStartLine: number,
	originalStartColumn: number,
	originalEndLine: number,
	originalEndColumn: number,

	modifiedStartLine: number,
	modifiedStartColumn: number,
	modifiedEndLine: number,
	modifiedEndColumn: number,
];

export type ITextMove = [
	originalStartLine: number,
	originalEndLine: number,
	modifiedStartLine: number,
	modifiedEndLine: number,
	changes: ILineChange[],
];
