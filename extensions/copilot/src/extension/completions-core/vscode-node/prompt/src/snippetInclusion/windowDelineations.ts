/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IndentationTree } from '../indentation/classes';
import { clearLabels, visitTree } from '../indentation/manipulation';
import { parseTree } from '../indentation/parsing';

/**
 * Returns a list of (startline, endline) pairs representing fixed size windows
 *
 * @param windowLength length of fixed size window
 * @param lines lines to extract fixed size windows from
 * @returns list of (startline, endline) pairs
 */
export function getBasicWindowDelineations(windowLength: number, lines: string[]): [number, number][] {
	const windows: [number, number][] = [];
	const length = lines.length;
	if (length === 0) {
		return [];
	}
	if (length < windowLength) {
		// if not long enough to reach a single window length, return full document
		return [[0, length]];
	}
	for (let startLine = 0; startLine < length - windowLength + 1; startLine++) {
		windows.push([startLine, startLine + windowLength]);
	}
	return windows;
}

/**
 * Calculate all windows like with the following properties:
 * - they are all of length <= maxLength
 * - they are all of length >= minLength
 *   - except if they are followed by enough blank lines to reach length >= minLength
 * - they are a contiguous subsequence from [parentline, child1, child2, ..., childn]
 * - which neither starts nor ends with a blank line
 * Note that windows of the form "parent with all its children" could
 * appear in different ways with that definition,
 * e.g. as "childi" of its parent, and as "parent, child1, ..., childn" where the parent is itself.
 * Nevertheless, it will only be listed once.
 * @param lines
 */
export function getIndentationWindowsDelineations(
	lines: string[],
	languageId: string,
	minLength: number,
	maxLength: number
): [number, number][] {
	// Deal with degenerate cases
	if (lines.length < minLength || maxLength === 0) {
		return [];
	}

	const windows: [number, number][] = [];
	// For each node, keep track of how long its children extend, or whether it can't be included in a window anyhow
	type TreeLabel = { totalLength: number; firstLineAfter: number };
	// Todo: add groupBlocks here as well
	const labeledTree = clearLabels(parseTree(lines.join('\n'), languageId)) as IndentationTree<TreeLabel>;
	visitTree(
		labeledTree,
		node => {
			if (node.type === 'blank') {
				node.label = { totalLength: 1, firstLineAfter: node.lineNumber + 1 };
				return;
			}
			// Statistics to gather on the way, to be consumed by parents
			let totalLength = node.type === 'line' ? 1 : 0;
			let firstLineAfter = node.type === 'line' ? node.lineNumber + 1 : NaN;
			// we consider intervals [a, b] which correspond to including children number a (-1 means parent) through b exclusive.
			// the window start and end lines are computed here, such that startLine (inclusive) to endLine (exclusive) covers the window
			function getStartLine(a: number) {
				return a === -1
					? firstLineAfter - totalLength
					: node.subs[a].label!.firstLineAfter - node.subs[a].label!.totalLength;
			}
			function getEndLine(b: number, startLine: number) {
				return b === 0 ? startLine + 1 : node.subs[b - 1].label!.firstLineAfter;
			}
			// iteratively go through candidates for [a, b[:
			// if from a to including b would be too long, add the window a to b exclusive and increase a as far as necessary, otherwise increase b
			// a = -1 will mean: include the parent
			let a = node.type === 'line' ? -1 : 0; // if the parent is a line, consider using it
			let lengthFromAToBInclusive = node.type === 'line' ? 1 : 0; // if so, the length is 1, otherwise 0
			let lastBThatWasntABlank = 0;
			for (let b = 0; b < node.subs.length; b++) {
				// don't let the window start with blank lines
				while (a >= 0 && a < node.subs.length && node.subs[a].type === 'blank') {
					lengthFromAToBInclusive -= node.subs[a].label!.totalLength;
					a++;
				}
				if (node.subs[b].type !== 'blank') {
					lastBThatWasntABlank = b;
				}
				// add subs[b] to the window
				firstLineAfter = node.subs[b].label!.firstLineAfter;
				totalLength += node.subs[b].label!.totalLength;
				lengthFromAToBInclusive += node.subs[b].label!.totalLength;
				if (lengthFromAToBInclusive > maxLength) {
					const startLine = getStartLine(a);
					const endLine = getEndLine(b, startLine);
					const endLineTrimmedForBlanks =
						lastBThatWasntABlank === b ? endLine : getEndLine(lastBThatWasntABlank, startLine);
					// for the test, note that blanks count for getting us over the minLength:
					if (minLength <= endLine - startLine) {
						windows.push([startLine, endLineTrimmedForBlanks]);
					}
					while (lengthFromAToBInclusive > maxLength) {
						// remove subs[a] from the window
						lengthFromAToBInclusive -=
							a === -1
								? node.type === 'line'
									? 1
									: // this cannot happen: if not a line, we start with a = 0 unless it's a line
									0
								: node.subs[a].label!.totalLength;
						a++;
					}
				}
			}
			// if there's anything left to add (a < b), do it
			if (a < node.subs.length) {
				const startLine = getStartLine(a);
				const endLine = firstLineAfter;
				const endLineTrimmedForBlanks =
					a === -1 ? endLine : node.subs[lastBThatWasntABlank].label!.firstLineAfter;
				// note: even if fillUpWindowWithPartOfNextNeighbor is true,
				// there is no next similar file here, so nothing to extend the window to
				if (minLength <= endLine - startLine) {
					windows.push([startLine, endLineTrimmedForBlanks]);
				}
				// Set the node's label
			}
			node.label = { totalLength, firstLineAfter };
		},
		'bottomUp'
	);
	// windows is an array of [start, end] pairs,
	// but some may appear twice, and should be removed
	return windows
		.sort((a, b) => a[0] - b[0] || a[1] - b[1])
		.filter((a, i, arr) => i === 0 || a[0] !== arr[i - 1][0] || a[1] !== arr[i - 1][1]);
}
