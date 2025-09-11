/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../base/common/assert.js';
import { splitLines } from '../../../../base/common/strings.js';
import { Position } from '../position.js';
import { PositionOffsetTransformer } from './positionToOffsetImpl.js';
import { Range } from '../range.js';
import { LineRange } from '../ranges/lineRange.js';
import { TextLength } from '../text/textLength.js';
import { OffsetRange } from '../ranges/offsetRange.js';

export abstract class AbstractText {
	abstract getValueOfRange(range: Range): string;
	abstract readonly length: TextLength;

	get endPositionExclusive(): Position {
		return this.length.addToPosition(new Position(1, 1));
	}

	get lineRange(): LineRange {
		return this.length.toLineRange();
	}

	getValue(): string {
		return this.getValueOfRange(this.length.toRange());
	}

	getValueOfOffsetRange(range: OffsetRange): string {
		return this.getValueOfRange(this.getTransformer().getRange(range));
	}

	getLineLength(lineNumber: number): number {
		return this.getValueOfRange(new Range(lineNumber, 1, lineNumber, Number.MAX_SAFE_INTEGER)).length;
	}

	private _transformer: PositionOffsetTransformer | undefined = undefined;

	getTransformer(): PositionOffsetTransformer {
		if (!this._transformer) {
			this._transformer = new PositionOffsetTransformer(this.getValue());
		}
		return this._transformer;
	}

	getLineAt(lineNumber: number): string {
		return this.getValueOfRange(new Range(lineNumber, 1, lineNumber, Number.MAX_SAFE_INTEGER));
	}

	getLines(): string[] {
		const value = this.getValue();
		return splitLines(value);
	}

	getLinesOfRange(range: LineRange): string[] {
		return range.mapToLineArray(lineNumber => this.getLineAt(lineNumber));
	}

	equals(other: AbstractText): boolean {
		if (this === other) {
			return true;
		}
		return this.getValue() === other.getValue();
	}
}

export class LineBasedText extends AbstractText {
	constructor(
		private readonly _getLineContent: (lineNumber: number) => string,
		private readonly _lineCount: number
	) {
		assert(_lineCount >= 1);

		super();
	}

	override getValueOfRange(range: Range): string {
		if (range.startLineNumber === range.endLineNumber) {
			return this._getLineContent(range.startLineNumber).substring(range.startColumn - 1, range.endColumn - 1);
		}
		let result = this._getLineContent(range.startLineNumber).substring(range.startColumn - 1);
		for (let i = range.startLineNumber + 1; i < range.endLineNumber; i++) {
			result += '\n' + this._getLineContent(i);
		}
		result += '\n' + this._getLineContent(range.endLineNumber).substring(0, range.endColumn - 1);
		return result;
	}

	override getLineLength(lineNumber: number): number {
		return this._getLineContent(lineNumber).length;
	}

	get length(): TextLength {
		const lastLine = this._getLineContent(this._lineCount);
		return new TextLength(this._lineCount - 1, lastLine.length);
	}
}

export class ArrayText extends LineBasedText {
	constructor(lines: string[]) {
		super(
			lineNumber => lines[lineNumber - 1],
			lines.length
		);
	}
}

export class StringText extends AbstractText {
	private readonly _t;

	constructor(public readonly value: string) {
		super();
		this._t = new PositionOffsetTransformer(this.value);
	}

	getValueOfRange(range: Range): string {
		return this._t.getOffsetRange(range).substring(this.value);
	}

	get length(): TextLength {
		return this._t.textLength;
	}
}
