/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, groupAdjacentBy, numberComparator } from '../../../../base/common/arrays.js';
import { assert, checkAdjacentItems } from '../../../../base/common/assert.js';
import { splitLines } from '../../../../base/common/strings.js';
import { LineRange } from '../ranges/lineRange.js';
import { BaseStringEdit, StringEdit, StringReplacement } from './stringEdit.js';
import { Position } from '../position.js';
import { Range } from '../range.js';
import { TextReplacement, TextEdit } from './textEdit.js';
import { AbstractText } from '../text/abstractText.js';

export class LineEdit {
	public static readonly empty = new LineEdit([]);

	public static deserialize(data: SerializedLineEdit): LineEdit {
		return new LineEdit(data.map(e => LineReplacement.deserialize(e)));
	}

	public static fromStringEdit(edit: BaseStringEdit, initialValue: AbstractText): LineEdit {
		const textEdit = TextEdit.fromStringEdit(edit, initialValue);
		return LineEdit.fromTextEdit(textEdit, initialValue);
	}

	public static fromTextEdit(edit: TextEdit, initialValue: AbstractText): LineEdit {
		const edits = edit.replacements;

		const result: LineReplacement[] = [];

		const currentEdits: TextReplacement[] = [];
		for (let i = 0; i < edits.length; i++) {
			const edit = edits[i];
			const nextEditRange = i + 1 < edits.length ? edits[i + 1] : undefined;
			currentEdits.push(edit);
			if (nextEditRange && nextEditRange.range.startLineNumber === edit.range.endLineNumber) {
				continue;
			}

			const singleEdit = TextReplacement.joinReplacements(currentEdits, initialValue);
			currentEdits.length = 0;

			const singleLineEdit = LineReplacement.fromSingleTextEdit(singleEdit, initialValue);
			result.push(singleLineEdit);
		}

		return new LineEdit(result);
	}

	public static createFromUnsorted(edits: readonly LineReplacement[]): LineEdit {
		const result = edits.slice();
		result.sort(compareBy(i => i.lineRange.startLineNumber, numberComparator));
		return new LineEdit(result);
	}

	constructor(
		/**
		 * Have to be sorted by start line number and non-intersecting.
		*/
		public readonly replacements: readonly LineReplacement[]
	) {
		assert(checkAdjacentItems(replacements, (i1, i2) => i1.lineRange.endLineNumberExclusive <= i2.lineRange.startLineNumber));
	}

	public isEmpty(): boolean {
		return this.replacements.length === 0;
	}

	public toEdit(initialValue: AbstractText): StringEdit {
		const edits: StringReplacement[] = [];
		for (const edit of this.replacements) {
			const singleEdit = edit.toSingleEdit(initialValue);
			edits.push(singleEdit);
		}
		return new StringEdit(edits);
	}

	public toString(): string {
		return this.replacements.map(e => e.toString()).join(',');
	}

	public serialize(): SerializedLineEdit {
		return this.replacements.map(e => e.serialize());
	}

	public getNewLineRanges(): LineRange[] {
		const ranges: LineRange[] = [];
		let offset = 0;
		for (const e of this.replacements) {
			ranges.push(LineRange.ofLength(e.lineRange.startLineNumber + offset, e.newLines.length),);
			offset += e.newLines.length - e.lineRange.length;
		}
		return ranges;
	}

	public mapLineNumber(lineNumber: number): number {
		let lineDelta = 0;
		for (const e of this.replacements) {
			if (e.lineRange.endLineNumberExclusive > lineNumber) {
				break;
			}

			lineDelta += e.newLines.length - e.lineRange.length;
		}
		return lineNumber + lineDelta;
	}

	public mapLineRange(lineRange: LineRange): LineRange {
		return new LineRange(
			this.mapLineNumber(lineRange.startLineNumber),
			this.mapLineNumber(lineRange.endLineNumberExclusive),
		);
	}


	/** TODO improve, dont require originalLines */
	public mapBackLineRange(lineRange: LineRange, originalLines: string[]): LineRange {
		const i = this.inverse(originalLines);
		return i.mapLineRange(lineRange);
	}

	public touches(other: LineEdit): boolean {
		return this.replacements.some(e1 => other.replacements.some(e2 => e1.lineRange.intersect(e2.lineRange)));
	}

	public rebase(base: LineEdit): LineEdit {
		return new LineEdit(
			this.replacements.map(e => new LineReplacement(base.mapLineRange(e.lineRange), e.newLines)),
		);
	}

	public humanReadablePatch(originalLines: string[]): string {
		const result: string[] = [];

		function pushLine(originalLineNumber: number, modifiedLineNumber: number, kind: 'unmodified' | 'deleted' | 'added', content: string | undefined) {
			const specialChar = (kind === 'unmodified' ? ' ' : (kind === 'deleted' ? '-' : '+'));

			if (content === undefined) {
				content = '[[[[[ WARNING: LINE DOES NOT EXIST ]]]]]';
			}

			const origLn = originalLineNumber === -1 ? '   ' : originalLineNumber.toString().padStart(3, ' ');
			const modLn = modifiedLineNumber === -1 ? '   ' : modifiedLineNumber.toString().padStart(3, ' ');

			result.push(`${specialChar} ${origLn} ${modLn} ${content}`);
		}

		function pushSeperator() {
			result.push('---');
		}

		let lineDelta = 0;
		let first = true;

		for (const edits of groupAdjacentBy(this.replacements, (e1, e2) => e1.lineRange.distanceToRange(e2.lineRange) <= 5)) {
			if (!first) {
				pushSeperator();
			} else {
				first = false;
			}

			let lastLineNumber = edits[0].lineRange.startLineNumber - 2;

			for (const edit of edits) {
				for (let i = Math.max(1, lastLineNumber); i < edit.lineRange.startLineNumber; i++) {
					pushLine(i, i + lineDelta, 'unmodified', originalLines[i - 1]);
				}

				const range = edit.lineRange;
				const newLines = edit.newLines;
				for (const replaceLineNumber of range.mapToLineArray(n => n)) {
					const line = originalLines[replaceLineNumber - 1];
					pushLine(replaceLineNumber, -1, 'deleted', line);
				}
				for (let i = 0; i < newLines.length; i++) {
					const line = newLines[i];
					pushLine(-1, range.startLineNumber + lineDelta + i, 'added', line);
				}

				lastLineNumber = range.endLineNumberExclusive;

				lineDelta += edit.newLines.length - edit.lineRange.length;
			}

			for (let i = lastLineNumber; i <= Math.min(lastLineNumber + 2, originalLines.length); i++) {
				pushLine(i, i + lineDelta, 'unmodified', originalLines[i - 1]);
			}
		}

		return result.join('\n');
	}

	public apply(lines: string[]): string[] {
		const result: string[] = [];

		let currentLineIndex = 0;

		for (const edit of this.replacements) {
			while (currentLineIndex < edit.lineRange.startLineNumber - 1) {
				result.push(lines[currentLineIndex]);
				currentLineIndex++;
			}

			for (const newLine of edit.newLines) {
				result.push(newLine);
			}

			currentLineIndex = edit.lineRange.endLineNumberExclusive - 1;
		}

		while (currentLineIndex < lines.length) {
			result.push(lines[currentLineIndex]);
			currentLineIndex++;
		}

		return result;
	}

	public inverse(originalLines: string[]): LineEdit {
		const newRanges = this.getNewLineRanges();
		return new LineEdit(this.replacements.map((e, idx) => new LineReplacement(
			newRanges[idx],
			originalLines.slice(e.lineRange.startLineNumber - 1, e.lineRange.endLineNumberExclusive - 1),
		)));
	}
}

export class LineReplacement {
	public static deserialize(e: SerializedLineReplacement): LineReplacement {
		return new LineReplacement(
			LineRange.ofLength(e[0], e[1] - e[0]),
			e[2],
		);
	}

	public static fromSingleTextEdit(edit: TextReplacement, initialValue: AbstractText): LineReplacement {
		// 1: ab[cde
		// 2: fghijk
		// 3: lmn]opq

		// replaced with

		// 1n: 123
		// 2n: 456
		// 3n: 789

		// simple solution: replace [1..4) with [1n..4n)

		const newLines = splitLines(edit.text);
		let startLineNumber = edit.range.startLineNumber;
		const survivingFirstLineText = initialValue.getValueOfRange(Range.fromPositions(
			new Position(edit.range.startLineNumber, 1),
			edit.range.getStartPosition()
		));
		newLines[0] = survivingFirstLineText + newLines[0];

		let endLineNumberEx = edit.range.endLineNumber + 1;
		const editEndLineNumberMaxColumn = initialValue.getTransformer().getLineLength(edit.range.endLineNumber) + 1;
		const survivingEndLineText = initialValue.getValueOfRange(Range.fromPositions(
			edit.range.getEndPosition(),
			new Position(edit.range.endLineNumber, editEndLineNumberMaxColumn)
		));
		newLines[newLines.length - 1] = newLines[newLines.length - 1] + survivingEndLineText;

		// Replacing [startLineNumber, endLineNumberEx) with newLines would be correct, however it might not be minimal.

		const startBeforeNewLine = edit.range.startColumn === initialValue.getTransformer().getLineLength(edit.range.startLineNumber) + 1;
		const endAfterNewLine = edit.range.endColumn === 1;

		if (startBeforeNewLine && newLines[0].length === survivingFirstLineText.length) {
			// the replacement would not delete any text on the first line
			startLineNumber++;
			newLines.shift();
		}

		if (newLines.length > 0 && startLineNumber < endLineNumberEx && endAfterNewLine && newLines[newLines.length - 1].length === survivingEndLineText.length) {
			// the replacement would not delete any text on the last line
			endLineNumberEx--;
			newLines.pop();
		}

		return new LineReplacement(new LineRange(startLineNumber, endLineNumberEx), newLines);
	}

	constructor(
		public readonly lineRange: LineRange,
		public readonly newLines: readonly string[],
	) { }

	public toSingleTextEdit(initialValue: AbstractText): TextReplacement {
		if (this.newLines.length === 0) {
			// Deletion
			const textLen = initialValue.getTransformer().textLength;
			if (this.lineRange.endLineNumberExclusive === textLen.lineCount + 2) {
				let startPos: Position;
				if (this.lineRange.startLineNumber > 1) {
					const startLineNumber = this.lineRange.startLineNumber - 1;
					const startColumn = initialValue.getTransformer().getLineLength(startLineNumber) + 1;
					startPos = new Position(startLineNumber, startColumn);
				} else {
					// Delete everything.
					// In terms of lines, this would end up with 0 lines.
					// However, a string has always 1 line (which can be empty).
					startPos = new Position(1, 1);
				}

				const lastPosition = textLen.addToPosition(new Position(1, 1));
				return new TextReplacement(Range.fromPositions(startPos, lastPosition), '');
			} else {
				return new TextReplacement(new Range(this.lineRange.startLineNumber, 1, this.lineRange.endLineNumberExclusive, 1), '');
			}

		} else if (this.lineRange.isEmpty) {
			// Insertion

			let endLineNumber: number;
			let column: number;
			let text: string;
			const insertionLine = this.lineRange.startLineNumber;
			if (insertionLine === initialValue.getTransformer().textLength.lineCount + 2) {
				endLineNumber = insertionLine - 1;
				column = initialValue.getTransformer().getLineLength(endLineNumber) + 1;
				text = this.newLines.map(l => '\n' + l).join('');
			} else {
				endLineNumber = insertionLine;
				column = 1;
				text = this.newLines.map(l => l + '\n').join('');
			}
			return new TextReplacement(Range.fromPositions(new Position(endLineNumber, column)), text);
		} else {
			const endLineNumber = this.lineRange.endLineNumberExclusive - 1;
			const endLineNumberMaxColumn = initialValue.getTransformer().getLineLength(endLineNumber) + 1;
			const range = new Range(
				this.lineRange.startLineNumber,
				1,
				endLineNumber,
				endLineNumberMaxColumn
			);
			// Don't add \n to the last line. This is because we subtract one from lineRange.endLineNumberExclusive for endLineNumber.
			const text = this.newLines.join('\n');
			return new TextReplacement(range, text);
		}
	}

	public toSingleEdit(initialValue: AbstractText): StringReplacement {
		const textEdit = this.toSingleTextEdit(initialValue);
		const range = initialValue.getTransformer().getOffsetRange(textEdit.range);
		return new StringReplacement(range, textEdit.text);
	}

	public toString(): string {
		return `${this.lineRange}->${JSON.stringify(this.newLines)}`;
	}

	public serialize(): SerializedLineReplacement {
		return [
			this.lineRange.startLineNumber,
			this.lineRange.endLineNumberExclusive,
			this.newLines,
		];
	}

	public removeCommonSuffixPrefixLines(initialValue: AbstractText): LineReplacement {
		let startLineNumber = this.lineRange.startLineNumber;
		let endLineNumberEx = this.lineRange.endLineNumberExclusive;

		let trimStartCount = 0;
		while (
			startLineNumber < endLineNumberEx && trimStartCount < this.newLines.length
			&& this.newLines[trimStartCount] === initialValue.getLineAt(startLineNumber)
		) {
			startLineNumber++;
			trimStartCount++;
		}

		let trimEndCount = 0;
		while (
			startLineNumber < endLineNumberEx && trimEndCount + trimStartCount < this.newLines.length
			&& this.newLines[this.newLines.length - 1 - trimEndCount] === initialValue.getLineAt(endLineNumberEx - 1)
		) {
			endLineNumberEx--;
			trimEndCount++;
		}

		if (trimStartCount === 0 && trimEndCount === 0) {
			return this;
		}
		return new LineReplacement(new LineRange(startLineNumber, endLineNumberEx), this.newLines.slice(trimStartCount, this.newLines.length - trimEndCount));
	}

	public toLineEdit(): LineEdit {
		return new LineEdit([this]);
	}
}

export type SerializedLineEdit = SerializedLineReplacement[];
export type SerializedLineReplacement = [startLineNumber: number, endLineNumber: number, newLines: readonly string[]];

export namespace SerializedLineReplacement {
	export function is(thing: unknown): thing is SerializedLineReplacement {
		return (
			Array.isArray(thing)
			&& thing.length === 3
			&& typeof thing[0] === 'number'
			&& typeof thing[1] === 'number'
			&& Array.isArray(thing[2])
			&& thing[2].every((e: unknown) => typeof e === 'string')
		);
	}
}
