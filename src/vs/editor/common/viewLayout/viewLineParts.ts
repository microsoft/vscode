/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import {Arrays} from 'vs/editor/common/core/arrays';
import {ViewLineToken, IEditorRange, ViewLineTokens} from 'vs/editor/common/editorCommon';
import {Range} from 'vs/editor/common/core/range';

function cmpLineDecorations(a:ILineDecoration, b:ILineDecoration): number {
	return Range.compareRangesUsingStarts(a.range, b.range);
}

export function createLineParts(lineNumber:number, minLineColumn:number, lineContent:string, tabSize:number, lineTokens:ViewLineTokens, rawLineDecorations:ILineDecoration[], renderWhitespace:boolean, indentGuides:boolean): LineParts {
	if (indentGuides || renderWhitespace) {
		let customLineDecorations:CustomLineDecorations;
		if (indentGuides && renderWhitespace) {
			customLineDecorations = CustomLineDecorations.RenderWhitespaceAndIndentGuides;
		} else if (renderWhitespace) {
			customLineDecorations = CustomLineDecorations.RenderWhitespace;
		} else {
			customLineDecorations = CustomLineDecorations.RenderIndentGuides;
		}

		let oldLength = rawLineDecorations.length;
		rawLineDecorations = insertCustomLineDecorations(customLineDecorations, lineNumber, lineContent, tabSize, lineTokens.getFauxIndentLength(), rawLineDecorations);
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

export function getColumnOfLinePartOffset(stopRenderingLineAfter:number, lineParts:ViewLineToken[], lineMaxColumn:number, charOffsetInPart:number[], partIndex:number, partLength:number, offset:number): number {
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
		let mid = Math.floor( (min + max) / 2 );
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

const _tab = '\t'.charCodeAt(0);
const _space = ' '.charCodeAt(0);

function insertOneWhitespace(dest:ILineDecoration[], lineNumber:number, startColumn:number, endColumn:number, className:string): void {
	dest.push({
		range: new Range(lineNumber, startColumn, lineNumber, endColumn),
		options: {
			inlineClassName: className
		}
	});
}

enum CustomLineDecorations {
	RenderWhitespace,
	RenderIndentGuides,
	RenderWhitespaceAndIndentGuides
}

function insertCustomLineDecorations(customLineDecorations:CustomLineDecorations, lineNumber:number, lineContent: string, tabSize:number, fauxIndentLength: number, rawLineDecorations: ILineDecoration[]): ILineDecoration[] {
	let lineLength = lineContent.length;
	if (lineLength === fauxIndentLength) {
		return rawLineDecorations;
	}
	if (fauxIndentLength > 0 && customLineDecorations === CustomLineDecorations.RenderIndentGuides) {
		// no indent guides on faux indented lines
		return rawLineDecorations;
	}

	let firstChar = lineContent.charCodeAt(fauxIndentLength);
	let lastChar = lineContent.charCodeAt(lineLength - 1);

	if (firstChar !== _tab && firstChar !== _space && lastChar !== _tab && lastChar !== _space) {
		// This line contains no leading nor trailing whitespace => fast path
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

	let result = rawLineDecorations.slice(0);
	let tmpIndent = 0;
	let whitespaceStartColumn = fauxIndentLength + 1;

	let leadingClassName:string;
	switch (customLineDecorations) {
		case CustomLineDecorations.RenderWhitespaceAndIndentGuides:
			if (fauxIndentLength > 0) {
				leadingClassName = 'leading whitespace';
			} else {
				leadingClassName = 'leading whitespace indent-guide';
			}
			break;
		case CustomLineDecorations.RenderWhitespace:
			leadingClassName = 'leading whitespace';
			break;
		case CustomLineDecorations.RenderIndentGuides:
			leadingClassName = 'indent-guide';
			break;
	}

	let trailingClassName:string;
	switch (customLineDecorations) {
		case CustomLineDecorations.RenderWhitespaceAndIndentGuides:
			trailingClassName = 'trailing whitespace';
			break;
		case CustomLineDecorations.RenderWhitespace:
			trailingClassName = 'trailing whitespace';
			break;
		case CustomLineDecorations.RenderIndentGuides:
			trailingClassName = '';
			break;
	}

	for (let i = fauxIndentLength; i < lineLength; i++) {
		let chCode = lineContent.charCodeAt(i);

		if (chCode === _tab) {
			tmpIndent = tabSize;
		} else {
			tmpIndent++;
		}

		if (i < firstNonWhitespaceIndex) {
			// in leading whitespace
			// push for every indent or when the end of the leading whitespace is reached
			if (tmpIndent >= tabSize || i === firstNonWhitespaceIndex - 1) {
				insertOneWhitespace(result, lineNumber, whitespaceStartColumn, i + 2, leadingClassName);
				whitespaceStartColumn = i + 2;
				tmpIndent = 0;
			}
			continue;
		}

		if (i > lastNonWhitespaceIndex) {
			// in trailing whitespace
			// push for every indent or when the end of the string is reached
			if (tmpIndent >= tabSize || i === lineLength - 1) {
				insertOneWhitespace(result, lineNumber, whitespaceStartColumn, i + 2, trailingClassName);
				whitespaceStartColumn = i + 2;
				tmpIndent = 0;
			}
			continue;
		}

		if (i === lastNonWhitespaceIndex) {

			if (customLineDecorations === CustomLineDecorations.RenderIndentGuides) {
				// no need to create additional parts at the end when rendering indent guides
				break;
			}

			whitespaceStartColumn = i + 2;
			tmpIndent = tmpIndent % tabSize;
		}
	}

	return result;
}

export class LineParts {
	_linePartsTrait: void;
	private _parts: ViewLineToken[];

	constructor(parts: ViewLineToken[]) {
		this._parts = parts;
	}

	public getParts(): ViewLineToken[] {
		return this._parts;
	}

	public equals(other:LineParts): boolean {
		return ViewLineToken.equalsArray(this._parts, other._parts);
	}

	public findIndexOfOffset(offset:number): number {
		return Arrays.findIndexInSegmentsArray(this._parts, offset);
	}
}

function createFastViewLineParts(lineTokens:ViewLineTokens, lineContent:string): LineParts {
	let parts = lineTokens.getTokens();
	parts = trimEmptyTrailingPart(parts, lineContent);
	return new LineParts(parts);
}

function createViewLineParts(lineNumber:number, minLineColumn:number, lineTokens:ViewLineTokens, lineContent:string, rawLineDecorations:ILineDecoration[]): LineParts {
	// lineDecorations might overlap on top of each other, so they need to be normalized
	var lineDecorations = LineDecorationsNormalizer.normalize(lineNumber, minLineColumn, rawLineDecorations),
		lineDecorationsIndex = 0,
		lineDecorationsLength = lineDecorations.length;

	var actualLineTokens = lineTokens.getTokens(),
		nextStartOffset:number,
		currentTokenEndOffset:number,
		currentTokenClassName:string;

	var parts:ViewLineToken[] = [];

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

	return new LineParts(parts);
}

export class DecorationSegment {
	startOffset:number;
	endOffset:number;
	className:string;

	constructor(startOffset:number, endOffset:number, className:string) {
		this.startOffset = startOffset;
		this.endOffset = endOffset;
		this.className = className;
	}
}

class Stack {
	public count:number;
	private stopOffsets:number[];
	private classNames:string[];

	constructor() {
		this.stopOffsets = [];
		this.classNames = [];
		this.count = 0;
	}

	public consumeLowerThan(maxStopOffset:number, nextStartOffset:number, result:DecorationSegment[]): number {

		while (this.count > 0 && this.stopOffsets[0] < maxStopOffset) {
			var i = 0;

			// Take all equal stopping offsets
			while(i + 1 < this.count && this.stopOffsets[i] === this.stopOffsets[i + 1]) {
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

	public insert(stopOffset:number, className:string): void {
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

export interface ILineDecoration {
	range: IEditorRange;
	options: {
		inlineClassName?: string;
	};
}

export class LineDecorationsNormalizer {
	/**
	 * A number that is guaranteed to be larger than the maximum line column
	 */
	private static MAX_LINE_LENGTH = 10000000;

	/**
	 * Normalize line decorations. Overlapping decorations will generate multiple segments
	 */
	public static normalize(lineNumber:number, minLineColumn:number, lineDecorations:ILineDecoration[]): DecorationSegment[] {

		var result:DecorationSegment[] = [];

		if (lineDecorations.length === 0) {
			return result;
		}

		var stack = new Stack(),
			nextStartOffset = 0,
			d:ILineDecoration,
			currentStartOffset:number,
			currentEndOffset:number,
			i:number,
			len:number;

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
			stack.insert(currentEndOffset, d.options.inlineClassName);
		}

		stack.consumeLowerThan(LineDecorationsNormalizer.MAX_LINE_LENGTH, nextStartOffset, result);

		return result;
	}

}

