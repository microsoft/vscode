/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parentPort } from 'worker_threads';
import { IArcTextReplacement } from '../../../base/common/editArcTracker.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { DefaultLinesDiffComputer } from '../../../editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js';
import type { ILinesDiffComputerOptions } from '../../../editor/common/diff/linesDiffComputer.js';
import type { RangeMapping } from '../../../editor/common/diff/rangeMapping.js';
import type { IDetailedDiffResult, IDiffCountResult, IDiffHunk, IDiffHunksResult } from '../common/diffComputeService.js';

export function computeDiffCounts(originalText: string, modifiedText: string, timeoutMs: number): IDiffCountResult {
	const stopwatch = StopWatch.create();
	const originalLines = originalText.split(/\r\n|\r|\n/);
	const modifiedLines = modifiedText.split(/\r\n|\r|\n/);
	const diffComputer = new DefaultLinesDiffComputer();
	const options: ILinesDiffComputerOptions = {
		ignoreTrimWhitespace: true,
		maxComputationTimeMs: timeoutMs,
		computeMoves: false,
	};
	const result = diffComputer.computeDiff(originalLines, modifiedLines, options);

	let added = 0;
	let removed = 0;
	for (const change of result.changes) {
		removed += change.original.length;
		added += change.modified.length;
	}

	const originalLineStarts = getLineStarts(originalText);
	const modifiedLineStarts = getLineStarts(modifiedText);
	const toChanges = (diff: typeof result) => diff.changes.flatMap(change => {
		const rangeMappings = change.innerChanges ?? [change.toRangeMapping2(originalLines, modifiedLines)];
		return rangeMappings.map(mapping => ({
			startOffset: getOffset(mapping.originalRange, originalLineStarts, false),
			endOffsetExclusive: getOffset(mapping.originalRange, originalLineStarts, true),
			newText: modifiedText.substring(
				getOffset(mapping.modifiedRange, modifiedLineStarts, false),
				getOffset(mapping.modifiedRange, modifiedLineStarts, true),
			),
		}));
	});
	let changes = toChanges(result);
	let hitTimeout = result.hitTimeout;
	let offset = 0;
	const reconstructed: string[] = [];
	for (const change of changes) {
		reconstructed.push(originalText.substring(offset, change.startOffset), change.newText);
		offset = change.endOffsetExclusive;
	}
	reconstructed.push(originalText.substring(offset));
	if (reconstructed.join('') !== modifiedText) {
		// Only repeat the diff when whitespace ignored by the line counts is needed for attribution.
		const characterResult = diffComputer.computeDiff(originalLines, modifiedLines, {
			...options,
			ignoreTrimWhitespace: false,
			maxComputationTimeMs: timeoutMs === 0 ? 0 : Math.max(1, timeoutMs - stopwatch.elapsed()),
		});
		changes = toChanges(characterResult);
		hitTimeout = characterResult.hitTimeout;
	}
	return { added, removed, changes, hitTimeout };
}

function getLineStarts(content: string): number[] {
	const result = [0];
	for (let index = 0; index < content.length; index++) {
		const charCode = content.charCodeAt(index);
		if (charCode === 13) {
			if (content.charCodeAt(index + 1) === 10) {
				index++;
			}
			result.push(index + 1);
		} else if (charCode === 10) {
			result.push(index + 1);
		}
	}
	return result;
}

function getOffset(range: { readonly startLineNumber: number; readonly startColumn: number; readonly endLineNumber: number; readonly endColumn: number }, lineStarts: readonly number[], end: boolean): number {
	const lineNumber = end ? range.endLineNumber : range.startLineNumber;
	const column = end ? range.endColumn : range.startColumn;
	const lineStart = lineStarts[Math.min(lineNumber - 1, lineStarts.length - 1)];
	return lineStart + column - 1;
}

export function computeDetailedDiff(originalText: string, modifiedText: string, timeoutMs: number): IDetailedDiffResult {
	const { added, removed, hunks, hitTimeout } = computeHunks(originalText, modifiedText, timeoutMs);
	let replacements = hunks.flatMap(hunk => hunk.replacements);
	// The line diff misses changes to line breaks alone, so the whole text is replaced then.
	if (applyReplacements(originalText, replacements) !== modifiedText) {
		replacements = [{ start: 0, endExclusive: originalText.length, text: modifiedText }];
	}
	return { added, removed, replacements, hitTimeout };
}

export function computeDiffHunks(originalText: string, modifiedText: string, timeoutMs: number): IDiffHunksResult {
	const { hunks, hitTimeout } = computeHunks(originalText, modifiedText, timeoutMs);
	return { hunks, hitTimeout };
}

function computeHunks(originalText: string, modifiedText: string, timeoutMs: number): IDiffHunksResult & { readonly added: number; readonly removed: number } {
	const originalLines = originalText.split(/\r\n|\r|\n/);
	const modifiedLines = modifiedText.split(/\r\n|\r|\n/);
	const diffComputer = new DefaultLinesDiffComputer();
	const result = diffComputer.computeDiff(originalLines, modifiedLines, {
		ignoreTrimWhitespace: false,
		maxComputationTimeMs: timeoutMs,
		computeMoves: false,
	});

	let added = 0;
	let removed = 0;
	const originalOffsets = new LineOffsetConverter(originalText);
	const modifiedOffsets = new LineOffsetConverter(modifiedText);
	const hunks: IDiffHunk[] = result.changes.map(change => {
		removed += change.original.length;
		added += change.modified.length;
		const mappings = change.innerChanges ?? [change.toRangeMapping2(originalLines, modifiedLines)];
		const ranges = mappings.map(mapping => toOffsetRanges(mapping, originalOffsets, modifiedOffsets));
		return {
			originalStartLineNumber: change.original.startLineNumber,
			originalEndLineNumberExclusive: change.original.endLineNumberExclusive,
			modifiedStartLineNumber: change.modified.startLineNumber,
			modifiedEndLineNumberExclusive: change.modified.endLineNumberExclusive,
			replacements: ranges.map(({ original, modified }) => ({ ...original, text: modifiedText.substring(modified.start, modified.endExclusive) })),
			reverseReplacements: ranges.map(({ original, modified }) => ({ ...modified, text: originalText.substring(original.start, original.endExclusive) })),
		};
	});

	return { added, removed, hunks, hitTimeout: result.hitTimeout };
}

/** The offsets that `mapping` maps between the original and the modified text. */
function toOffsetRanges(mapping: RangeMapping, originalOffsets: LineOffsetConverter, modifiedOffsets: LineOffsetConverter) {
	return {
		original: {
			start: originalOffsets.getOffset(mapping.originalRange.startLineNumber, mapping.originalRange.startColumn),
			endExclusive: originalOffsets.getOffset(mapping.originalRange.endLineNumber, mapping.originalRange.endColumn),
		},
		modified: {
			start: modifiedOffsets.getOffset(mapping.modifiedRange.startLineNumber, mapping.modifiedRange.startColumn),
			endExclusive: modifiedOffsets.getOffset(mapping.modifiedRange.endLineNumber, mapping.modifiedRange.endColumn),
		},
	};
}

function applyReplacements(value: string, replacements: readonly IArcTextReplacement[]): string {
	let result = '';
	let offset = 0;
	for (const replacement of replacements) {
		result += value.substring(offset, replacement.start);
		result += replacement.text;
		offset = replacement.endExclusive;
	}
	return result + value.substring(offset);
}

class LineOffsetConverter {
	private readonly _lineStarts = [0];

	constructor(private readonly _text: string) {
		const lineBreak = /\r\n|\r|\n/g;
		let match: RegExpExecArray | null;
		while ((match = lineBreak.exec(_text))) {
			this._lineStarts.push(match.index + match[0].length);
		}
	}

	getOffset(lineNumber: number, column: number): number {
		const lineStart = this._lineStarts[Math.min(Math.max(lineNumber - 1, 0), this._lineStarts.length - 1)];
		return Math.min(lineStart + Math.max(column - 1, 0), this._text.length);
	}
}

function main() {
	const port = parentPort;
	if (!port) {
		throw new Error('This module should only be used in a worker thread.');
	}

	port.on('message', ({ id, fn, args }: { id: number; fn: string; args: unknown[] }) => {
		try {
			if (fn === 'computeDiffCounts') {
				const res = computeDiffCounts(args[0] as string, args[1] as string, args[2] as number);
				port.postMessage({ id, res });
			} else if (fn === 'computeDetailedDiff') {
				const res = computeDetailedDiff(args[0] as string, args[1] as string, args[2] as number);
				port.postMessage({ id, res });
			} else if (fn === 'computeDiffHunks') {
				const res = computeDiffHunks(args[0] as string, args[1] as string, args[2] as number);
				port.postMessage({ id, res });
			} else {
				port.postMessage({ id, err: { message: `Unknown function: ${fn}` } });
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const stack = err instanceof Error ? err.stack : undefined;
			port.postMessage({ id, err: { message, stack } });
		}
	});
}

if (parentPort) {
	main();
}
