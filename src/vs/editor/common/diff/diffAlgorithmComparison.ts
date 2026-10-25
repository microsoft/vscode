/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from '../../../base/common/stopwatch.js';
import { ArrayText } from '../core/text/abstractText.js';
import { ILinesDiffComputer, ILinesDiffComputerOptions, LinesDiff } from './linesDiffComputer.js';
import { DetailedLineRangeMapping } from './rangeMapping.js';

/**
 * Compares the speed and correctness of two diff algorithms on the same input.
 * Contains only metadata, never text content, so it can be sent as telemetry.
 */
export interface IDiffAlgorithmComparison {
	readonly primary: IDiffAlgorithmRun;
	readonly secondary: IDiffAlgorithmRun;
	/** Whether both algorithms produced the same line and inner changes. */
	readonly isIdentical: boolean;
}

export interface IDiffAlgorithmRun {
	readonly timeMs: number;
	readonly threw: boolean;
	readonly hitTimeout: boolean;
	readonly changeCount: number;
	/**
	 * Whether applying the inner changes to the original reproduces the modified text.
	 * `unverified` if the diff ignores trim whitespace, timed out or lacks inner changes.
	 */
	readonly validity: 'valid' | 'invalid' | 'unverified';
}

export function compareDiffAlgorithms(
	originalLines: string[],
	modifiedLines: string[],
	options: ILinesDiffComputerOptions,
	primary: ILinesDiffComputer,
	secondary: ILinesDiffComputer,
): IDiffAlgorithmComparison {
	const primaryRun = runDiffAlgorithm(originalLines, modifiedLines, options, primary);
	const secondaryRun = runDiffAlgorithm(originalLines, modifiedLines, options, secondary);
	return {
		primary: primaryRun.run,
		secondary: secondaryRun.run,
		isIdentical: primaryRun.diff !== undefined && secondaryRun.diff !== undefined
			&& formatChanges(primaryRun.diff) === formatChanges(secondaryRun.diff),
	};
}

function runDiffAlgorithm(originalLines: string[], modifiedLines: string[], options: ILinesDiffComputerOptions, algorithm: ILinesDiffComputer): { run: IDiffAlgorithmRun; diff: LinesDiff | undefined } {
	const sw = StopWatch.create();
	let diff: LinesDiff;
	try {
		diff = algorithm.computeDiff(originalLines, modifiedLines, options);
	} catch {
		return { run: { timeMs: sw.elapsed(), threw: true, hitTimeout: false, changeCount: 0, validity: 'unverified' }, diff: undefined };
	}
	const timeMs = sw.elapsed();
	return {
		run: { timeMs, threw: false, hitTimeout: diff.hitTimeout, changeCount: diff.changes.length, validity: getValidity(diff, originalLines, modifiedLines, options) },
		diff,
	};
}

function getValidity(diff: LinesDiff, originalLines: string[], modifiedLines: string[], options: ILinesDiffComputerOptions): IDiffAlgorithmRun['validity'] {
	if (options.ignoreTrimWhitespace || diff.hitTimeout || diff.changes.some(c => !c.innerChanges)) {
		return 'unverified';
	}
	try {
		const edit = DetailedLineRangeMapping.toTextEdit(diff.changes, new ArrayText(modifiedLines));
		return edit.normalize().apply(new ArrayText(originalLines)) === modifiedLines.join('\n') ? 'valid' : 'invalid';
	} catch {
		return 'invalid';
	}
}

function formatChanges(diff: LinesDiff): string {
	return diff.changes.map(c => `${c.original}->${c.modified} ${c.innerChanges?.map(i => i.toString()).join(' ')}`).join('\n');
}
