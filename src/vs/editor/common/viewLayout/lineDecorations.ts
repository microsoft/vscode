/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import { Constants } from 'vs/editor/common/core/uint';
import { InlineDecoration, InlineDecorationType } from 'vs/editor/common/viewModel/viewModel';

export class LineDecoration {
	_lineDecorationBrand: void;

	constructor(
		public readonly startColumn: number,
		public readonly endColumn: number,
		public readonly className: string,
		public readonly type: InlineDecorationType
	) {
	}

	private static _equals(a: LineDecoration, b: LineDecoration): boolean {
		return (
			a.startColumn === b.startColumn
			&& a.endColumn === b.endColumn
			&& a.className === b.className
			&& a.type === b.type
		);
	}

	public static equalsArr(a: LineDecoration[], b: LineDecoration[]): boolean {
		let aLen = a.length;
		let bLen = b.length;
		if (aLen !== bLen) {
			return false;
		}
		for (let i = 0; i < aLen; i++) {
			if (!LineDecoration._equals(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}

	public static filter(lineDecorations: InlineDecoration[], lineNumber: number, minLineColumn: number, maxLineColumn: number): LineDecoration[] {
		if (lineDecorations.length === 0) {
			return [];
		}

		let result: LineDecoration[] = [], resultLen = 0;

		for (let i = 0, len = lineDecorations.length; i < len; i++) {
			let d = lineDecorations[i];
			let range = d.range;

			if (range.endLineNumber < lineNumber || range.startLineNumber > lineNumber) {
				// Ignore decorations that sit outside this line
				continue;
			}

			if (range.isEmpty() && (d.type === InlineDecorationType.Regular || d.type === InlineDecorationType.RegularAffectingLetterSpacing)) {
				// Ignore empty range decorations
				continue;
			}

			let startColumn = (range.startLineNumber === lineNumber ? range.startColumn : minLineColumn);
			let endColumn = (range.endLineNumber === lineNumber ? range.endColumn : maxLineColumn);

			result[resultLen++] = new LineDecoration(startColumn, endColumn, d.inlineClassName, d.type);
		}

		return result;
	}

	public static compare(a: LineDecoration, b: LineDecoration): number {
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
			let i = 0;

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
			for (let i = 0; i < this.count; i++) {
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
	public static normalize(lineContent: string, lineDecorations: LineDecoration[]): DecorationSegment[] {
		if (lineDecorations.length === 0) {
			return [];
		}

		let result: DecorationSegment[] = [];

		let stack = new Stack();
		let nextStartOffset = 0;

		for (let i = 0, len = lineDecorations.length; i < len; i++) {
			let d = lineDecorations[i];
			let startColumn = d.startColumn;
			let endColumn = d.endColumn;
			let className = d.className;

			// If the position would end up in the middle of a high-low surrogate pair, we move it to before the pair
			if (startColumn > 1) {
				const charCodeBefore = lineContent.charCodeAt(startColumn - 2);
				if (strings.isHighSurrogate(charCodeBefore)) {
					startColumn--;
				}
			}

			if (endColumn > 1) {
				const charCodeBefore = lineContent.charCodeAt(endColumn - 2);
				if (strings.isHighSurrogate(charCodeBefore)) {
					endColumn--;
				}
			}

			let currentStartOffset = startColumn - 1;
			let currentEndOffset = endColumn - 2;

			nextStartOffset = stack.consumeLowerThan(currentStartOffset, nextStartOffset, result);

			if (stack.count === 0) {
				nextStartOffset = currentStartOffset;
			}
			stack.insert(currentEndOffset, className);
		}

		stack.consumeLowerThan(Constants.MAX_SAFE_SMALL_INTEGER, nextStartOffset, result);

		return result;
	}

}
