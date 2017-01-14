/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { ViewLineToken, ViewLineTokens } from 'vs/editor/common/core/viewLineToken';
import { InlineDecoration } from 'vs/editor/common/viewModel/viewModel';
import { CharCode } from 'vs/base/common/charCode';
import { LineParts } from 'vs/editor/common/core/lineParts';
import { Constants } from 'vs/editor/common/core/uint';

export class Decoration {
	_decorationBrand: void;

	public readonly startColumn: number;
	public readonly endColumn: number;
	public readonly className: string;

	constructor(startColumn: number, endColumn: number, className: string) {
		this.startColumn = startColumn;
		this.endColumn = endColumn;
		this.className = className;
	}

	public static filter(lineDecorations: InlineDecoration[], lineNumber: number, minLineColumn: number, maxLineColumn: number): Decoration[] {
		if (lineDecorations.length === 0) {
			return [];
		}

		let result: Decoration[] = [], resultLen = 0;

		for (let i = 0, len = lineDecorations.length; i < len; i++) {
			let d = lineDecorations[i];
			let range = d.range;
			let className = d.inlineClassName;

			if (range.endLineNumber < lineNumber || range.startLineNumber > lineNumber) {
				// Ignore decorations that sit outside this line
				continue;
			}

			if (range.isEmpty()) {
				// Ignore empty range decorations
				continue;
			}

			let startColumn = (range.startLineNumber === lineNumber ? range.startColumn : minLineColumn);
			let endColumn = (range.endLineNumber === lineNumber ? range.endColumn : maxLineColumn);

			if (endColumn <= 1) {
				// An empty decoration (endColumn === 1)
				continue;
			}

			result[resultLen++] = new Decoration(startColumn, endColumn, className);
		}

		return result;
	}

	public static compare(a: Decoration, b: Decoration): number {
		if (a.startColumn === b.startColumn) {
			if (a.endColumn === b.endColumn) {
				if (a.className < b.className) {
					return -1;
				}
				if (a.className > b.className) {
					return 1;
				}
				return 0;
			}
			return a.endColumn - b.endColumn;
		}
		return a.startColumn - b.startColumn;
	}
}

export function createLineParts(lineContent: string, tabSize: number, lineTokens: ViewLineTokens, lineDecorations: Decoration[], renderWhitespace: 'none' | 'boundary' | 'all'): LineParts {
	if (renderWhitespace !== 'none') {
		insertWhitespaceLineDecorations(lineContent, tabSize, lineTokens.getFauxIndentLength(), renderWhitespace, lineDecorations);
	}

	if (lineDecorations.length > 0) {
		lineDecorations.sort(Decoration.compare);
		return createViewLineParts(lineTokens, lineContent, lineDecorations);
	} else {
		return createFastViewLineParts(lineTokens, lineContent);
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

function insertOneCustomLineDecoration(dest: Decoration[], startColumn: number, endColumn: number, className: string): void {
	dest.push(new Decoration(startColumn, endColumn, className));
}

function insertWhitespaceLineDecorations(lineContent: string, tabSize: number, fauxIndentLength: number, renderWhitespace: 'none' | 'boundary' | 'all', result: Decoration[]): void {
	let lineLength = lineContent.length;
	if (lineLength === fauxIndentLength) {
		return;
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

	insertCustomLineDecorationsWithStateMachine(lineContent, tabSize, result, sm_endIndex, sm_decoration);
}

function insertCustomLineDecorationsWithStateMachine(lineContent: string, tabSize: number, result: Decoration[], sm_endIndex: number[], sm_decoration: string[]): void {
	let lineLength = lineContent.length;
	let currentStateIndex = 0;
	let stateEndIndex = sm_endIndex[currentStateIndex];
	let stateDecoration = sm_decoration[currentStateIndex];

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
				insertOneCustomLineDecoration(result, whitespaceStartColumn, index + 2, stateDecoration);
			}
			whitespaceStartColumn = index + 2;
			tmpIndent = tmpIndent % tabSize;

			currentStateIndex++;
			stateEndIndex = sm_endIndex[currentStateIndex];
			stateDecoration = sm_decoration[currentStateIndex];
		} else {
			if (stateDecoration !== null && tmpIndent >= tabSize) {
				insertOneCustomLineDecoration(result, whitespaceStartColumn, index + 2, stateDecoration);
				whitespaceStartColumn = index + 2;
				tmpIndent = tmpIndent % tabSize;
			}
		}
	}
}

function createFastViewLineParts(lineTokens: ViewLineTokens, lineContent: string): LineParts {
	let parts = lineTokens.getTokens();
	parts = trimEmptyTrailingPart(parts, lineContent);
	return new LineParts(parts, lineContent.length + 1);
}

function createViewLineParts(lineTokens: ViewLineTokens, lineContent: string, _lineDecorations: Decoration[]): LineParts {
	// lineDecorations might overlap on top of each other, so they need to be normalized
	var lineDecorations = LineDecorationsNormalizer.normalize(_lineDecorations),
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
	 * Normalize line decorations. Overlapping decorations will generate multiple segments
	 */
	public static normalize(lineDecorations: Decoration[]): DecorationSegment[] {
		if (lineDecorations.length === 0) {
			return [];
		}

		let result: DecorationSegment[] = [];

		let stack = new Stack();
		let nextStartOffset = 0;

		for (let i = 0, len = lineDecorations.length; i < len; i++) {
			let d = lineDecorations[i];

			let currentStartOffset = d.startColumn - 1;
			let currentEndOffset = d.endColumn - 2;

			nextStartOffset = stack.consumeLowerThan(currentStartOffset, nextStartOffset, result);

			if (stack.count === 0) {
				nextStartOffset = currentStartOffset;
			}
			stack.insert(currentEndOffset, d.className);
		}

		stack.consumeLowerThan(Constants.MAX_SAFE_SMALL_INTEGER, nextStartOffset, result);

		return result;
	}

}
