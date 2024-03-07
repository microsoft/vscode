/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertFn, checkAdjacentItems } from 'vs/base/common/assert';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Position } from 'vs/editor/common/core/position';
import { PositionOffsetTransformer } from 'vs/editor/common/core/positionToOffset';
import { Range } from 'vs/editor/common/core/range';
import { RangeLength } from 'vs/editor/common/core/rangeLength';

export class TextEdit {
	constructor(public readonly edits: readonly SingleTextEdit[]) {
		assertFn(() => checkAdjacentItems(edits, (a, b) => a.range.getEndPosition().isBeforeOrEqual(b.range.getStartPosition())));
	}

	mapPosition(position: Position): Position | Range {
		let lineDelta = 0;
		let curLine = 0;
		let columnDeltaInCurLine = 0;

		for (const edit of this.edits) {
			const start = edit.range.getStartPosition();
			const end = edit.range.getEndPosition();

			if (position.isBeforeOrEqual(start)) {
				break;
			}

			const len = RangeLength.ofText(edit.text);
			if (position.isBefore(end)) {
				const startPos = new Position(start.lineNumber + lineDelta, start.column + (start.lineNumber + lineDelta === curLine ? columnDeltaInCurLine : 0));
				const endPos = len.addToPosition(startPos);
				return rangeFromPositions(startPos, endPos);
			}

			lineDelta += len.lineCount - (edit.range.endLineNumber - edit.range.startLineNumber);

			if (len.lineCount === 0) {
				if (end.lineNumber !== start.lineNumber) {
					columnDeltaInCurLine += len.columnCount - (end.column - 1);
				} else {
					columnDeltaInCurLine += len.columnCount - (end.column - start.column);
				}
			} else {
				columnDeltaInCurLine = len.columnCount;
			}
			curLine = end.lineNumber + lineDelta;
		}

		return new Position(position.lineNumber + lineDelta, position.column + (position.lineNumber + lineDelta === curLine ? columnDeltaInCurLine : 0));
	}

	mapRange(range: Range): Range {
		function getStart(p: Position | Range) {
			return p instanceof Position ? p : p.getStartPosition();
		}

		function getEnd(p: Position | Range) {
			return p instanceof Position ? p : p.getEndPosition();
		}

		const start = getStart(this.mapPosition(range.getStartPosition()));
		const end = getEnd(this.mapPosition(range.getEndPosition()));

		return rangeFromPositions(start, end);
	}

	// TODO: `doc` is not needed for this!
	inverseMapPosition(positionAfterEdit: Position, doc: IText): Position | Range {
		const reversed = this.inverse(doc);
		return reversed.mapPosition(positionAfterEdit);
	}

	inverseMapRange(range: Range, doc: IText): Range {
		const reversed = this.inverse(doc);
		return reversed.mapRange(range);
	}

	apply(text: IText): string {
		let result = '';
		let lastEditEnd = new Position(1, 1);
		for (const edit of this.edits) {
			const editRange = edit.range;
			const editStart = editRange.getStartPosition();
			const editEnd = editRange.getEndPosition();

			const r = rangeFromPositions(lastEditEnd, editStart);
			if (!r.isEmpty()) {
				result += text.getValue(r);
			}
			result += edit.text;
			lastEditEnd = editEnd;
		}
		const r = rangeFromPositions(lastEditEnd, text.endPositionExclusive);
		if (!r.isEmpty()) {
			result += text.getValue(r);
		}
		return result;
	}

	applyToString(str: string): string {
		const strText = new StringText(str);
		return this.apply(strText);
	}

	inverse(doc: IText): TextEdit {
		const ranges = this.getNewRanges();
		return new TextEdit(this.edits.map((e, idx) => new SingleTextEdit(ranges[idx], doc.getValue(e.range))));
	}

	getNewRanges(): Range[] {
		const newRanges: Range[] = [];
		let previousEditEndLineNumber = 0;
		let lineOffset = 0;
		let columnOffset = 0;
		for (const edit of this.edits) {
			const textLength = RangeLength.ofText(edit.text);
			const newRangeStart = Position.lift({
				lineNumber: edit.range.startLineNumber + lineOffset,
				column: edit.range.startColumn + (edit.range.startLineNumber === previousEditEndLineNumber ? columnOffset : 0)
			});
			const newRange = textLength.createRange(newRangeStart);
			newRanges.push(newRange);
			lineOffset = newRange.endLineNumber - edit.range.endLineNumber;
			columnOffset = newRange.endColumn - edit.range.endColumn;
			previousEditEndLineNumber = edit.range.endLineNumber;
		}
		return newRanges;
	}
}

export class SingleTextEdit {
	constructor(
		public readonly range: Range,
		public readonly text: string,
	) {
	}

	static equals(first: SingleTextEdit, second: SingleTextEdit) {
		return first.range.equalsRange(second.range) && first.text === second.text;
	}
}

function rangeFromPositions(start: Position, end: Position): Range {
	if (!start.isBeforeOrEqual(end)) {
		throw new BugIndicatingError('start must be before end');
	}
	return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
}

export interface IText {
	getValue(range: Range): string;
	readonly endPositionExclusive: Position;
}

export class LineBasedText implements IText {
	constructor(
		private readonly _getLineContent: (lineNumber: number) => string,
		private readonly _lineCount: number,
	) { }

	getValue(range: Range): string {
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

	get endPositionExclusive(): Position {
		const lastLine = this._getLineContent(this._lineCount);
		return new Position(this._lineCount, lastLine.length + 1);
	}
}

export class StringText implements IText {
	private readonly _t = new PositionOffsetTransformer(this.str);

	constructor(private readonly str: string) { }

	getValue(range: Range): string {
		return this._t.getOffsetRange(range).substring(this.str);
	}

	get endPositionExclusive(): Position {
		return this._t.getPosition(this.str.length);
	}
}
