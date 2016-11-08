/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';
import { ViewLineToken, ViewLineTokens } from 'vs/editor/common/core/viewLineToken';
import { InlineDecoration } from 'vs/editor/common/viewModel/viewModel';
import { CharCode } from 'vs/base/common/charCode';
import { LineParts } from 'vs/editor/common/core/lineParts';

function cmpLineDecorations(a: InlineDecoration, b: InlineDecoration): number {
	return Range.compareRangesUsingStarts(a.range, b.range);
}

export function createLineParts(lineNumber: number, minLineColumn: number, lineContent: string, tabSize: number, lineTokens: ViewLineTokens, rawLineDecorations: InlineDecoration[], renderWhitespace: 'none' | 'boundary' | 'all'): LineParts {
	if (renderWhitespace !== 'none') {
		let oldLength = rawLineDecorations.length;
		rawLineDecorations = insertWhitespaceLineDecorations(lineNumber, lineContent, tabSize, lineTokens.getFauxIndentLength(), renderWhitespace, rawLineDecorations);
		if (rawLineDecorations.length !== oldLength) {
			rawLineDecorations.sort(cmpLineDecorations);
		}
	}

	if (rawLineDecorations.length > 0) {
		return createViewLineParts(lineNumber, minLineColumn, lineTokens, lineContent, rawLineDecorations);
	} else {
		return createFastViewLineParts(lineTokens, lineContent);
	}
}

export function getColumnOfLinePartOffset(stopRenderingLineAfter: number, lineParts: ViewLineToken[], lineMaxColumn: number, charOffsetInPart: number[], partIndex: number, partLength: number, offset: number): number {
	if (partIndex >= lineParts.length) {
		return stopRenderingLineAfter;
	}

	if (offset === 0) {
		return lineParts[partIndex].startIndex + 1;
	}

	if (offset === partLength) {
		return (partIndex + 1 < lineParts.length ? lineParts[partIndex + 1].startIndex + 1 : lineMaxColumn);
	}

	let originalMin = lineParts[partIndex].startIndex;
	let originalMax = (partIndex + 1 < lineParts.length ? lineParts[partIndex + 1].startIndex : lineMaxColumn - 1);

	let min = originalMin;
	let max = originalMax;

	// invariant: offsetOf(min) <= offset <= offsetOf(max)
	while (min + 1 < max) {
		let mid = Math.floor((min + max) / 2);
		let midOffset = charOffsetInPart[mid];

		if (midOffset === offset) {
			return mid + 1;
		} else if (midOffset > offset) {
			max = mid;
		} else {
			min = mid;
		}
	}

	if (min === max) {
		return min + 1;
	}

	let minOffset = charOffsetInPart[min];
	let maxOffset = (max < originalMax ? charOffsetInPart[max] : partLength);

	let distanceToMin = offset - minOffset;
	let distanceToMax = maxOffset - offset;

	if (distanceToMin <= distanceToMax) {
		return min + 1;
	} else {
		return max + 1;
	}
}

function trimEmptyTrailingPart(parts: ViewLineToken[], lineContent: string): ViewLineToken[] {
	if (parts.length <= 1) {
		return parts;
	}
	var lastPartStartIndex = parts[parts.length - 1].startIndex;
	if (lastPartStartIndex < lineContent.length) {
		// All is good
		return parts;
	}
	// Remove last line part
	return parts.slice(0, parts.length - 1);
}

function insertOneCustomLineDecoration(dest: InlineDecoration[], lineNumber: number, startColumn: number, endColumn: number, className: string): void {
	dest.push(new InlineDecoration(new Range(lineNumber, startColumn, lineNumber, endColumn), className));
}

function insertWhitespaceLineDecorations(lineNumber: number, lineContent: string, tabSize: number, fauxIndentLength: number, renderWhitespace: 'none' | 'boundary' | 'all', rawLineDecorations: InlineDecoration[]): InlineDecoration[] {
	let lineLength = lineContent.length;
	if (lineLength === fauxIndentLength) {
		return rawLineDecorations;
	}

	let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineContent);
	let lastNonWhitespaceIndex: number;
	if (firstNonWhitespaceIndex === -1) {
		// The entire line is whitespace
		firstNonWhitespaceIndex = lineLength;
		lastNonWhitespaceIndex = lineLength;
	} else {
		lastNonWhitespaceIndex = strings.lastNonWhitespaceIndex(lineContent);
	}

	let sm_endIndex: number[] = [];
	let sm_decoration: string[] = [];

	if (fauxIndentLength > 0) {
		// add faux indent state
		sm_endIndex.push(fauxIndentLength - 1);
		sm_decoration.push(null);
	}
	if (firstNonWhitespaceIndex > fauxIndentLength) {
		// add leading whitespace state
		sm_endIndex.push(firstNonWhitespaceIndex - 1);
		sm_decoration.push('vs-whitespace');

	}

	let startOfWhitespace = -1;
	let hasTab = false;

	for (let i = Math.max(firstNonWhitespaceIndex, fauxIndentLength); i <= lastNonWhitespaceIndex; ++i) {
		let currentCharIsTab = lineContent.charCodeAt(i) === CharCode.Tab;
		if (currentCharIsTab || lineContent.charCodeAt(i) === CharCode.Space) {
			if (currentCharIsTab) {
				hasTab = true;
			}
			if (startOfWhitespace === -1) {
				startOfWhitespace = i;
			}
		} else if (startOfWhitespace !== -1) {
			if (renderWhitespace === 'all' || renderWhitespace === 'boundary' && (hasTab || i - startOfWhitespace >= 2)) {
				sm_endIndex.push(startOfWhitespace - 1);
				sm_decoration.push(null);

				sm_endIndex.push(i - 1);
				sm_decoration.push('vs-whitespace');
			}

			startOfWhitespace = -1;
			hasTab = false;
		}
	}

	// add content state
	sm_endIndex.push(lastNonWhitespaceIndex);
	sm_decoration.push(null);

	// add trailing whitespace state
	sm_endIndex.push(lineLength - 1);
	sm_decoration.push('vs-whitespace');

	// add dummy state to avoid array length checks
	sm_endIndex.push(lineLength);
	sm_decoration.push(null);

	return insertCustomLineDecorationsWithStateMachine(lineNumber, lineContent, tabSize, rawLineDecorations, sm_endIndex, sm_decoration);
}

function insertCustomLineDecorationsWithStateMachine(lineNumber: number, lineContent: string, tabSize: number, rawLineDecorations: InlineDecoration[], sm_endIndex: number[], sm_decoration: string[]): InlineDecoration[] {
	let lineLength = lineContent.length;
	let currentStateIndex = 0;
	let stateEndIndex = sm_endIndex[currentStateIndex];
	let stateDecoration = sm_decoration[currentStateIndex];

	let result = rawLineDecorations.slice(0);
	let tmpIndent = 0;
	let whitespaceStartColumn = 1;

	for (let index = 0; index < lineLength; index++) {
		let chCode = lineContent.charCodeAt(index);

		if (chCode === CharCode.Tab) {
			tmpIndent = tabSize;
		} else {
			tmpIndent++;
		}

		if (index === stateEndIndex) {
			if (stateDecoration !== null) {
				insertOneCustomLineDecoration(result, lineNumber, whitespaceStartColumn, index + 2, stateDecoration);
			}
			whitespaceStartColumn = index + 2;
			tmpIndent = tmpIndent % tabSize;

			currentStateIndex++;
			stateEndIndex = sm_endIndex[currentStateIndex];
			stateDecoration = sm_decoration[currentStateIndex];
		} else {
			if (stateDecoration !== null && tmpIndent >= tabSize) {
				insertOneCustomLineDecoration(result, lineNumber, whitespaceStartColumn, index + 2, stateDecoration);
				whitespaceStartColumn = index + 2;
				tmpIndent = tmpIndent % tabSize;
			}
		}
	}

	return result;
}

function createFastViewLineParts(lineTokens: ViewLineTokens, lineContent: string): LineParts {
	let parts = lineTokens.getTokens();
	parts = trimEmptyTrailingPart(parts, lineContent);
	return new LineParts(parts, lineContent.length + 1);
}

function createViewLineParts(lineNumber: number, minLineColumn: number, lineTokens: ViewLineTokens, lineContent: string, rawLineDecorations: InlineDecoration[]): LineParts {
	// lineDecorations might overlap on top of each other, so they need to be normalized
	var lineDecorations = LineDecorationsNormalizer.normalize(lineNumber, minLineColumn, rawLineDecorations),
		lineDecorationsIndex = 0,
		lineDecorationsLength = lineDecorations.length;

	var actualLineTokens = lineTokens.getTokens(),
		nextStartOffset: number,
		currentTokenEndOffset: number,
		currentTokenClassName: string;

	var parts: ViewLineToken[] = [];

	for (var i = 0, len = actualLineTokens.length; i < len; i++) {
		nextStartOffset = actualLineTokens[i].startIndex;
		currentTokenEndOffset = (i + 1 < len ? actualLineTokens[i + 1].startIndex : lineTokens.getTextLength());
		currentTokenClassName = actualLineTokens[i].type;

		while (lineDecorationsIndex < lineDecorationsLength && lineDecorations[lineDecorationsIndex].startOffset < currentTokenEndOffset) {
			if (lineDecorations[lineDecorationsIndex].startOffset > nextStartOffset) {
				// the first decorations starts after the token
				parts.push(new ViewLineToken(nextStartOffset, currentTokenClassName));
				nextStartOffset = lineDecorations[lineDecorationsIndex].startOffset;
			}

			parts.push(new ViewLineToken(nextStartOffset, currentTokenClassName + ' ' + lineDecorations[lineDecorationsIndex].className));

			if (lineDecorations[lineDecorationsIndex].endOffset >= currentTokenEndOffset) {
				// this decoration goes on to the next token
				nextStartOffset = currentTokenEndOffset;
				break;
			} else {
				// this decorations stops inside this token
				nextStartOffset = lineDecorations[lineDecorationsIndex].endOffset + 1;
				lineDecorationsIndex++;
			}
		}

		if (nextStartOffset < currentTokenEndOffset) {
			parts.push(new ViewLineToken(nextStartOffset, currentTokenClassName));
		}
	}

	return new LineParts(parts, lineContent.length + 1);
}

export class DecorationSegment {
	startOffset: number;
	endOffset: number;
	className: string;

	constructor(startOffset: number, endOffset: number, className: string) {
		this.startOffset = startOffset;
		this.endOffset = endOffset;
		this.className = className;
	}
}

class Stack {
	public count: number;
	private stopOffsets: number[];
	private classNames: string[];

	constructor() {
		this.stopOffsets = [];
		this.classNames = [];
		this.count = 0;
	}

	public consumeLowerThan(maxStopOffset: number, nextStartOffset: number, result: DecorationSegment[]): number {

		while (this.count > 0 && this.stopOffsets[0] < maxStopOffset) {
			var i = 0;

			// Take all equal stopping offsets
			while (i + 1 < this.count && this.stopOffsets[i] === this.stopOffsets[i + 1]) {
				i++;
			}

			// Basically we are consuming the first i + 1 elements of the stack
			result.push(new DecorationSegment(nextStartOffset, this.stopOffsets[i], this.classNames.join(' ')));
			nextStartOffset = this.stopOffsets[i] + 1;

			// Consume them
			this.stopOffsets.splice(0, i + 1);
			this.classNames.splice(0, i + 1);
			this.count -= (i + 1);
		}

		if (this.count > 0 && nextStartOffset < maxStopOffset) {
			result.push(new DecorationSegment(nextStartOffset, maxStopOffset - 1, this.classNames.join(' ')));
			nextStartOffset = maxStopOffset;
		}

		return nextStartOffset;
	}

	public insert(stopOffset: number, className: string): void {
		if (this.count === 0 || this.stopOffsets[this.count - 1] <= stopOffset) {
			// Insert at the end
			this.stopOffsets.push(stopOffset);
			this.classNames.push(className);
		} else {
			// Find the insertion position for `stopOffset`
			for (var i = 0; i < this.count; i++) {
				if (this.stopOffsets[i] >= stopOffset) {
					this.stopOffsets.splice(i, 0, stopOffset);
					this.classNames.splice(i, 0, className);
					break;
				}
			}
		}
		this.count++;
		return;
	}
}

export class LineDecorationsNormalizer {
	/**
	 * A number that is guaranteed to be larger than the maximum line column
	 */
	private static MAX_LINE_LENGTH = 10000000;

	/**
	 * Normalize line decorations. Overlapping decorations will generate multiple segments
	 */
	public static normalize(lineNumber: number, minLineColumn: number, lineDecorations: InlineDecoration[]): DecorationSegment[] {

		var result: DecorationSegment[] = [];

		if (lineDecorations.length === 0) {
			return result;
		}

		var stack = new Stack(),
			nextStartOffset = 0,
			d: InlineDecoration,
			currentStartOffset: number,
			currentEndOffset: number,
			i: number,
			len: number;

		for (i = 0, len = lineDecorations.length; i < len; i++) {
			d = lineDecorations[i];

			if (d.range.endLineNumber < lineNumber || d.range.startLineNumber > lineNumber) {
				// Ignore decorations that sit outside this line
				continue;
			}

			if (d.range.startLineNumber === d.range.endLineNumber && d.range.startColumn === d.range.endColumn) {
				// Ignore empty range decorations
				continue;
			}

			currentStartOffset = (d.range.startLineNumber === lineNumber ? d.range.startColumn - 1 : minLineColumn - 1);
			currentEndOffset = (d.range.endLineNumber === lineNumber ? d.range.endColumn - 2 : LineDecorationsNormalizer.MAX_LINE_LENGTH - 1);

			if (currentEndOffset < 0) {
				// An empty decoration (endColumn === 1)
				continue;
			}

			nextStartOffset = stack.consumeLowerThan(currentStartOffset, nextStartOffset, result);

			if (stack.count === 0) {
				nextStartOffset = currentStartOffset;
			}
			stack.insert(currentEndOffset, d.inlineClassName);
		}

		stack.consumeLowerThan(LineDecorationsNormalizer.MAX_LINE_LENGTH, nextStartOffset, result);

		return result;
	}

}

