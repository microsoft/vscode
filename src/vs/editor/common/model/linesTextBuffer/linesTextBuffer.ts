/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import * as strings from 'vs/base/common/strings';
import * as arrays from 'vs/base/common/arrays';
import { PrefixSumComputer } from 'vs/editor/common/viewModel/prefixSumComputer';
import { ISingleEditOperationIdentifier, IIdentifiedSingleEditOperation, EndOfLinePreference, ITextBuffer, ApplyEditsResult, IInternalModelContentChange } from 'vs/editor/common/model';
import { ITextSnapshot } from 'vs/platform/files/common/files';

export interface IValidatedEditOperation {
	sortIndex: number;
	identifier: ISingleEditOperationIdentifier;
	range: Range;
	rangeOffset: number;
	rangeLength: number;
	lines: string[];
	forceMoveMarkers: boolean;
	isAutoWhitespaceEdit: boolean;
}

/**
 * A processed string with its EOL resolved ready to be turned into an editor model.
 */
export interface ITextSource {
	/**
	 * The text split into lines.
	 */
	readonly lines: string[];
	/**
	 * The BOM (leading character sequence of the file).
	 */
	readonly BOM: string;
	/**
	 * The end of line sequence.
	 */
	readonly EOL: string;
	/**
	 * The text contains Unicode characters classified as "R" or "AL".
	 */
	readonly containsRTL: boolean;
	/**
	 * The text contains only characters inside the ASCII range 32-126 or \t \r \n
	 */
	readonly isBasicASCII: boolean;
}

class LinesTextBufferSnapshot implements ITextSnapshot {

	private readonly _lines: string[];
	private readonly _linesLength: number;
	private readonly _eol: string;
	private readonly _bom: string;
	private _lineIndex: number;

	constructor(lines: string[], eol: string, bom: string) {
		this._lines = lines;
		this._linesLength = this._lines.length;
		this._eol = eol;
		this._bom = bom;
		this._lineIndex = 0;
	}

	public read(): string {
		if (this._lineIndex >= this._linesLength) {
			return null;
		}

		let result: string = null;

		if (this._lineIndex === 0) {
			result = this._bom + this._lines[this._lineIndex];
		} else {
			result = this._lines[this._lineIndex];
		}

		this._lineIndex++;

		if (this._lineIndex < this._linesLength) {
			result += this._eol;
		}

		return result;
	}
}

export class LinesTextBuffer implements ITextBuffer {

	private _lines: string[];
	private _BOM: string;
	private _EOL: string;
	private _mightContainRTL: boolean;
	private _mightContainNonBasicASCII: boolean;
	private _lineStarts: PrefixSumComputer;

	constructor(textSource: ITextSource) {
		this._lines = textSource.lines.slice(0);
		this._BOM = textSource.BOM;
		this._EOL = textSource.EOL;
		this._mightContainRTL = textSource.containsRTL;
		this._mightContainNonBasicASCII = !textSource.isBasicASCII;
		this._constructLineStarts();
	}

	private _constructLineStarts(): void {
		const eolLength = this._EOL.length;
		const linesLength = this._lines.length;
		const lineStartValues = new Uint32Array(linesLength);
		for (let i = 0; i < linesLength; i++) {
			lineStartValues[i] = this._lines[i].length + eolLength;
		}
		this._lineStarts = new PrefixSumComputer(lineStartValues);
	}

	public equals(other: ITextBuffer): boolean {
		if (!(other instanceof LinesTextBuffer)) {
			return false;
		}
		if (this._BOM !== other._BOM) {
			return false;
		}
		if (this._EOL !== other._EOL) {
			return false;
		}
		if (this._lines.length !== other._lines.length) {
			return false;
		}
		for (let i = 0, len = this._lines.length; i < len; i++) {
			if (this._lines[i] !== other._lines[i]) {
				return false;
			}
		}
		return true;
	}

	public mightContainRTL(): boolean {
		return this._mightContainRTL;
	}

	public mightContainNonBasicASCII(): boolean {
		return this._mightContainNonBasicASCII;
	}

	public getBOM(): string {
		return this._BOM;
	}

	public getEOL(): string {
		return this._EOL;
	}

	public getOffsetAt(lineNumber: number, column: number): number {
		return this._lineStarts.getAccumulatedValue(lineNumber - 2) + column - 1;
	}

	public getPositionAt(offset: number): Position {
		offset = Math.floor(offset);
		offset = Math.max(0, offset);

		let out = this._lineStarts.getIndexOf(offset);

		let lineLength = this._lines[out.index].length;

		// Ensure we return a valid position
		return new Position(out.index + 1, Math.min(out.remainder + 1, lineLength + 1));
	}

	public getRangeAt(offset: number, length: number): Range {
		const startResult = this._lineStarts.getIndexOf(offset);
		const startLineLength = this._lines[startResult.index].length;
		const startColumn = Math.min(startResult.remainder + 1, startLineLength + 1);

		const endResult = this._lineStarts.getIndexOf(offset + length);
		const endLineLength = this._lines[endResult.index].length;
		const endColumn = Math.min(endResult.remainder + 1, endLineLength + 1);

		return new Range(startResult.index + 1, startColumn, endResult.index + 1, endColumn);
	}

	private _getEndOfLine(eol: EndOfLinePreference): string {
		switch (eol) {
			case EndOfLinePreference.LF:
				return '\n';
			case EndOfLinePreference.CRLF:
				return '\r\n';
			case EndOfLinePreference.TextDefined:
				return this.getEOL();
		}
		throw new Error('Unknown EOL preference');
	}

	public getValueInRange(range: Range, eol: EndOfLinePreference): string {
		if (range.isEmpty()) {
			return '';
		}

		if (range.startLineNumber === range.endLineNumber) {
			return this._lines[range.startLineNumber - 1].substring(range.startColumn - 1, range.endColumn - 1);
		}

		const lineEnding = this._getEndOfLine(eol);
		const startLineIndex = range.startLineNumber - 1;
		const endLineIndex = range.endLineNumber - 1;
		let resultLines: string[] = [];

		resultLines.push(this._lines[startLineIndex].substring(range.startColumn - 1));
		for (let i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._lines[i]);
		}
		resultLines.push(this._lines[endLineIndex].substring(0, range.endColumn - 1));

		return resultLines.join(lineEnding);
	}

	public createSnapshot(preserveBOM: boolean): ITextSnapshot {
		return new LinesTextBufferSnapshot(this._lines.slice(0), this._EOL, preserveBOM ? this._BOM : '');
	}

	public getValueLengthInRange(range: Range, eol: EndOfLinePreference): number {
		if (range.isEmpty()) {
			return 0;
		}

		if (range.startLineNumber === range.endLineNumber) {
			return (range.endColumn - range.startColumn);
		}

		let startOffset = this.getOffsetAt(range.startLineNumber, range.startColumn);
		let endOffset = this.getOffsetAt(range.endLineNumber, range.endColumn);
		return endOffset - startOffset;
	}

	public getLineCount(): number {
		return this._lines.length;
	}

	public getLinesContent(): string[] {
		return this._lines.slice(0);
	}

	public getLength(): number {
		return this._lineStarts.getTotalValue();
	}

	public getLineContent(lineNumber: number): string {
		return this._lines[lineNumber - 1];
	}

	public getLineCharCode(lineNumber: number, index: number): number {
		return this._lines[lineNumber - 1].charCodeAt(index);
	}

	public getLineLength(lineNumber: number): number {
		return this._lines[lineNumber - 1].length;
	}

	public getLineFirstNonWhitespaceColumn(lineNumber: number): number {
		const result = strings.firstNonWhitespaceIndex(this._lines[lineNumber - 1]);
		if (result === -1) {
			return 0;
		}
		return result + 1;
	}

	public getLineLastNonWhitespaceColumn(lineNumber: number): number {
		const result = strings.lastNonWhitespaceIndex(this._lines[lineNumber - 1]);
		if (result === -1) {
			return 0;
		}
		return result + 2;
	}

	//#region Editing

	public setEOL(newEOL: '\r\n' | '\n'): void {
		this._EOL = newEOL;
		this._constructLineStarts();
	}

	private static _sortOpsAscending(a: IValidatedEditOperation, b: IValidatedEditOperation): number {
		let r = Range.compareRangesUsingEnds(a.range, b.range);
		if (r === 0) {
			return a.sortIndex - b.sortIndex;
		}
		return r;
	}

	private static _sortOpsDescending(a: IValidatedEditOperation, b: IValidatedEditOperation): number {
		let r = Range.compareRangesUsingEnds(a.range, b.range);
		if (r === 0) {
			return b.sortIndex - a.sortIndex;
		}
		return -r;
	}

	public applyEdits(rawOperations: IIdentifiedSingleEditOperation[], recordTrimAutoWhitespace: boolean): ApplyEditsResult {
		if (rawOperations.length === 0) {
			return new ApplyEditsResult([], [], []);
		}

		let mightContainRTL = this._mightContainRTL;
		let mightContainNonBasicASCII = this._mightContainNonBasicASCII;
		let canReduceOperations = true;

		let operations: IValidatedEditOperation[] = [];
		for (let i = 0; i < rawOperations.length; i++) {
			let op = rawOperations[i];
			if (canReduceOperations && op._isTracked) {
				canReduceOperations = false;
			}
			let validatedRange = op.range;
			if (!mightContainRTL && op.text) {
				// check if the new inserted text contains RTL
				mightContainRTL = strings.containsRTL(op.text);
			}
			if (!mightContainNonBasicASCII && op.text) {
				mightContainNonBasicASCII = !strings.isBasicASCII(op.text);
			}
			operations[i] = {
				sortIndex: i,
				identifier: op.identifier || null,
				range: validatedRange,
				rangeOffset: this.getOffsetAt(validatedRange.startLineNumber, validatedRange.startColumn),
				rangeLength: this.getValueLengthInRange(validatedRange, EndOfLinePreference.TextDefined),
				lines: op.text ? op.text.split(/\r\n|\r|\n/) : null,
				forceMoveMarkers: op.forceMoveMarkers || false,
				isAutoWhitespaceEdit: op.isAutoWhitespaceEdit || false
			};
		}

		// Sort operations ascending
		operations.sort(LinesTextBuffer._sortOpsAscending);

		for (let i = 0, count = operations.length - 1; i < count; i++) {
			let rangeEnd = operations[i].range.getEndPosition();
			let nextRangeStart = operations[i + 1].range.getStartPosition();

			if (nextRangeStart.isBefore(rangeEnd)) {
				// overlapping ranges
				throw new Error('Overlapping ranges are not allowed!');
			}
		}

		if (canReduceOperations) {
			operations = this._reduceOperations(operations);
		}

		// Delta encode operations
		let reverseRanges = LinesTextBuffer._getInverseEditRanges(operations);
		let newTrimAutoWhitespaceCandidates: { lineNumber: number, oldContent: string }[] = [];

		for (let i = 0; i < operations.length; i++) {
			let op = operations[i];
			let reverseRange = reverseRanges[i];

			if (recordTrimAutoWhitespace && op.isAutoWhitespaceEdit && op.range.isEmpty()) {
				// Record already the future line numbers that might be auto whitespace removal candidates on next edit
				for (let lineNumber = reverseRange.startLineNumber; lineNumber <= reverseRange.endLineNumber; lineNumber++) {
					let currentLineContent = '';
					if (lineNumber === reverseRange.startLineNumber) {
						currentLineContent = this.getLineContent(op.range.startLineNumber);
						if (strings.firstNonWhitespaceIndex(currentLineContent) !== -1) {
							continue;
						}
					}
					newTrimAutoWhitespaceCandidates.push({ lineNumber: lineNumber, oldContent: currentLineContent });
				}
			}
		}

		let reverseOperations: IIdentifiedSingleEditOperation[] = [];
		for (let i = 0; i < operations.length; i++) {
			let op = operations[i];
			let reverseRange = reverseRanges[i];

			reverseOperations[i] = {
				identifier: op.identifier,
				range: reverseRange,
				text: this.getValueInRange(op.range, EndOfLinePreference.TextDefined),
				forceMoveMarkers: op.forceMoveMarkers
			};
		}

		this._mightContainRTL = mightContainRTL;
		this._mightContainNonBasicASCII = mightContainNonBasicASCII;

		const contentChanges = this._doApplyEdits(operations);

		let trimAutoWhitespaceLineNumbers: number[] = null;
		if (recordTrimAutoWhitespace && newTrimAutoWhitespaceCandidates.length > 0) {
			// sort line numbers auto whitespace removal candidates for next edit descending
			newTrimAutoWhitespaceCandidates.sort((a, b) => b.lineNumber - a.lineNumber);

			trimAutoWhitespaceLineNumbers = [];
			for (let i = 0, len = newTrimAutoWhitespaceCandidates.length; i < len; i++) {
				let lineNumber = newTrimAutoWhitespaceCandidates[i].lineNumber;
				if (i > 0 && newTrimAutoWhitespaceCandidates[i - 1].lineNumber === lineNumber) {
					// Do not have the same line number twice
					continue;
				}

				let prevContent = newTrimAutoWhitespaceCandidates[i].oldContent;
				let lineContent = this.getLineContent(lineNumber);

				if (lineContent.length === 0 || lineContent === prevContent || strings.firstNonWhitespaceIndex(lineContent) !== -1) {
					continue;
				}

				trimAutoWhitespaceLineNumbers.push(lineNumber);
			}
		}

		return new ApplyEditsResult(
			reverseOperations,
			contentChanges,
			trimAutoWhitespaceLineNumbers
		);
	}

	/**
	 * Transform operations such that they represent the same logic edit,
	 * but that they also do not cause OOM crashes.
	 */
	private _reduceOperations(operations: IValidatedEditOperation[]): IValidatedEditOperation[] {
		if (operations.length < 1000) {
			// We know from empirical testing that a thousand edits work fine regardless of their shape.
			return operations;
		}

		// At one point, due to how events are emitted and how each operation is handled,
		// some operations can trigger a high ammount of temporary string allocations,
		// that will immediately get edited again.
		// e.g. a formatter inserting ridiculous ammounts of \n on a model with a single line
		// Therefore, the strategy is to collapse all the operations into a huge single edit operation
		return [this._toSingleEditOperation(operations)];
	}

	_toSingleEditOperation(operations: IValidatedEditOperation[]): IValidatedEditOperation {
		let forceMoveMarkers = false,
			firstEditRange = operations[0].range,
			lastEditRange = operations[operations.length - 1].range,
			entireEditRange = new Range(firstEditRange.startLineNumber, firstEditRange.startColumn, lastEditRange.endLineNumber, lastEditRange.endColumn),
			lastEndLineNumber = firstEditRange.startLineNumber,
			lastEndColumn = firstEditRange.startColumn,
			result: string[] = [];

		for (let i = 0, len = operations.length; i < len; i++) {
			let operation = operations[i],
				range = operation.range;

			forceMoveMarkers = forceMoveMarkers || operation.forceMoveMarkers;

			// (1) -- Push old text
			for (let lineNumber = lastEndLineNumber; lineNumber < range.startLineNumber; lineNumber++) {
				if (lineNumber === lastEndLineNumber) {
					result.push(this._lines[lineNumber - 1].substring(lastEndColumn - 1));
				} else {
					result.push('\n');
					result.push(this._lines[lineNumber - 1]);
				}
			}

			if (range.startLineNumber === lastEndLineNumber) {
				result.push(this._lines[range.startLineNumber - 1].substring(lastEndColumn - 1, range.startColumn - 1));
			} else {
				result.push('\n');
				result.push(this._lines[range.startLineNumber - 1].substring(0, range.startColumn - 1));
			}

			// (2) -- Push new text
			if (operation.lines) {
				for (let j = 0, lenJ = operation.lines.length; j < lenJ; j++) {
					if (j !== 0) {
						result.push('\n');
					}
					result.push(operation.lines[j]);
				}
			}

			lastEndLineNumber = operation.range.endLineNumber;
			lastEndColumn = operation.range.endColumn;
		}

		return {
			sortIndex: 0,
			identifier: operations[0].identifier,
			range: entireEditRange,
			rangeOffset: this.getOffsetAt(entireEditRange.startLineNumber, entireEditRange.startColumn),
			rangeLength: this.getValueLengthInRange(entireEditRange, EndOfLinePreference.TextDefined),
			lines: result.join('').split('\n'),
			forceMoveMarkers: forceMoveMarkers,
			isAutoWhitespaceEdit: false
		};
	}

	private _setLineContent(lineNumber: number, content: string): void {
		this._lines[lineNumber - 1] = content;
		this._lineStarts.changeValue(lineNumber - 1, content.length + this._EOL.length);
	}

	private _doApplyEdits(operations: IValidatedEditOperation[]): IInternalModelContentChange[] {

		// Sort operations descending
		operations.sort(LinesTextBuffer._sortOpsDescending);

		let contentChanges: IInternalModelContentChange[] = [];

		for (let i = 0, len = operations.length; i < len; i++) {
			const op = operations[i];

			const startLineNumber = op.range.startLineNumber;
			const startColumn = op.range.startColumn;
			const endLineNumber = op.range.endLineNumber;
			const endColumn = op.range.endColumn;

			if (startLineNumber === endLineNumber && startColumn === endColumn && (!op.lines || op.lines.length === 0)) {
				// no-op
				continue;
			}

			const deletingLinesCnt = endLineNumber - startLineNumber;
			const insertingLinesCnt = (op.lines ? op.lines.length - 1 : 0);
			const editingLinesCnt = Math.min(deletingLinesCnt, insertingLinesCnt);

			for (let j = editingLinesCnt; j >= 0; j--) {
				const editLineNumber = startLineNumber + j;
				let editText = (op.lines ? op.lines[j] : '');

				if (editLineNumber === startLineNumber || editLineNumber === endLineNumber) {
					const editStartColumn = (editLineNumber === startLineNumber ? startColumn : 1);
					const editEndColumn = (editLineNumber === endLineNumber ? endColumn : this.getLineLength(editLineNumber) + 1);

					editText = (
						this._lines[editLineNumber - 1].substring(0, editStartColumn - 1)
						+ editText
						+ this._lines[editLineNumber - 1].substring(editEndColumn - 1)
					);
				}

				this._setLineContent(editLineNumber, editText);
			}

			if (editingLinesCnt < deletingLinesCnt) {
				// Must delete some lines

				const spliceStartLineNumber = startLineNumber + editingLinesCnt;
				const endLineRemains = this._lines[endLineNumber - 1].substring(endColumn - 1);

				// Reconstruct first line
				this._setLineContent(spliceStartLineNumber, this._lines[spliceStartLineNumber - 1] + endLineRemains);

				this._lines.splice(spliceStartLineNumber, endLineNumber - spliceStartLineNumber);
				this._lineStarts.removeValues(spliceStartLineNumber, endLineNumber - spliceStartLineNumber);
			}

			if (editingLinesCnt < insertingLinesCnt) {
				// Must insert some lines

				const spliceLineNumber = startLineNumber + editingLinesCnt;
				let spliceColumn = (spliceLineNumber === startLineNumber ? startColumn : 1);
				if (op.lines) {
					spliceColumn += op.lines[editingLinesCnt].length;
				}

				// Split last line
				const leftoverLine = this._lines[spliceLineNumber - 1].substring(spliceColumn - 1);

				this._setLineContent(spliceLineNumber, this._lines[spliceLineNumber - 1].substring(0, spliceColumn - 1));

				// Lines in the middle
				let newLines: string[] = new Array<string>(insertingLinesCnt - editingLinesCnt);
				let newLinesLengths = new Uint32Array(insertingLinesCnt - editingLinesCnt);
				for (let j = editingLinesCnt + 1; j <= insertingLinesCnt; j++) {
					newLines[j - editingLinesCnt - 1] = op.lines[j];
					newLinesLengths[j - editingLinesCnt - 1] = op.lines[j].length + this._EOL.length;
				}
				newLines[newLines.length - 1] += leftoverLine;
				newLinesLengths[newLines.length - 1] += leftoverLine.length;
				this._lines = arrays.arrayInsert(this._lines, startLineNumber + editingLinesCnt, newLines);
				this._lineStarts.insertValues(startLineNumber + editingLinesCnt, newLinesLengths);
			}

			const contentChangeRange = new Range(startLineNumber, startColumn, endLineNumber, endColumn);
			const text = (op.lines ? op.lines.join(this.getEOL()) : '');
			contentChanges.push({
				range: contentChangeRange,
				rangeLength: op.rangeLength,
				text: text,
				rangeOffset: op.rangeOffset,
				forceMoveMarkers: op.forceMoveMarkers
			});
		}

		return contentChanges;
	}

	/**
	 * Assumes `operations` are validated and sorted ascending
	 */
	public static _getInverseEditRanges(operations: IValidatedEditOperation[]): Range[] {
		let result: Range[] = [];

		let prevOpEndLineNumber: number;
		let prevOpEndColumn: number;
		let prevOp: IValidatedEditOperation = null;
		for (let i = 0, len = operations.length; i < len; i++) {
			let op = operations[i];

			let startLineNumber: number;
			let startColumn: number;

			if (prevOp) {
				if (prevOp.range.endLineNumber === op.range.startLineNumber) {
					startLineNumber = prevOpEndLineNumber;
					startColumn = prevOpEndColumn + (op.range.startColumn - prevOp.range.endColumn);
				} else {
					startLineNumber = prevOpEndLineNumber + (op.range.startLineNumber - prevOp.range.endLineNumber);
					startColumn = op.range.startColumn;
				}
			} else {
				startLineNumber = op.range.startLineNumber;
				startColumn = op.range.startColumn;
			}

			let resultRange: Range;

			if (op.lines && op.lines.length > 0) {
				// the operation inserts something
				let lineCount = op.lines.length;
				let firstLine = op.lines[0];
				let lastLine = op.lines[lineCount - 1];

				if (lineCount === 1) {
					// single line insert
					resultRange = new Range(startLineNumber, startColumn, startLineNumber, startColumn + firstLine.length);
				} else {
					// multi line insert
					resultRange = new Range(startLineNumber, startColumn, startLineNumber + lineCount - 1, lastLine.length + 1);
				}
			} else {
				// There is nothing to insert
				resultRange = new Range(startLineNumber, startColumn, startLineNumber, startColumn);
			}

			prevOpEndLineNumber = resultRange.endLineNumber;
			prevOpEndColumn = resultRange.endColumn;

			result.push(resultRange);
			prevOp = op;
		}

		return result;
	}

	//#endregion
}
