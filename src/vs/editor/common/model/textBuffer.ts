/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import * as strings from 'vs/base/common/strings';
import * as arrays from 'vs/base/common/arrays';
import { ITextSource } from 'vs/editor/common/model/textSource';
import { PrefixSumComputer } from 'vs/editor/common/viewModel/prefixSumComputer';
import { IValidatedEditOperation } from 'vs/editor/common/model/editableTextModel';
import { ModelRawChange, IModelContentChange, ModelRawLineChanged, ModelRawLinesDeleted, ModelRawLinesInserted } from 'vs/editor/common/model/textModelEvents';
import { ILineEdit } from 'vs/editor/common/model/modelLine';

export interface ITextBuffer {
	mightContainRTL(): boolean;
	mightContainNonBasicASCII(): boolean;
	getOffsetAt(position: Position): number;
	getPositionAt(offset: number): Position;
	getBOM(): string;
}

export class ApplyEditResult {

	constructor(
		public readonly reverseEdits: editorCommon.IIdentifiedSingleEditOperation[],
		public readonly rawChanges: ModelRawChange[],
		public readonly changes: IInternalModelContentChange[],
		public readonly trimAutoWhitespaceLineNumbers: number[]
	) { }

}

interface IIdentifiedLineEdit extends ILineEdit {
	lineNumber: number;
}

export interface IInternalModelContentChange extends IModelContentChange {
	range: Range;
	lines: string[];
	rangeOffset: number;
	forceMoveMarkers: boolean;
}

export class TextBuffer {

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

	public equals(other: ITextSource): boolean {
		if (this._BOM !== other.BOM) {
			return false;
		}
		if (this._EOL !== other.EOL) {
			return false;
		}
		if (this._lines.length !== other.lines.length) {
			return false;
		}
		for (let i = 0, len = this._lines.length; i < len; i++) {
			if (this._lines[i] !== other.lines[i]) {
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

	// TODO@TextModel
	public getOffsetAt(position: Position): number {
		return this.getOffsetAt2(position.lineNumber, position.column);
	}

	// TODO@TextModel
	public getOffsetAt2(lineNumber: number, column: number): number {
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

	// TODO@TextModel
	public getRangeAt(start: number, end: number): Range {
		const startResult = this._lineStarts.getIndexOf(start);
		const startLineLength = this._lines[startResult.index].length;
		const startColumn = Math.min(startResult.remainder + 1, startLineLength + 1);

		const endResult = this._lineStarts.getIndexOf(end);
		const endLineLength = this._lines[endResult.index].length;
		const endColumn = Math.min(endResult.remainder + 1, endLineLength + 1);

		return new Range(startResult.index + 1, startColumn, endResult.index + 1, endColumn);
	}

	// TODO@TextModel
	public getRangeAt2(offset: number, length: number): Range {
		return this.getRangeAt(offset, offset + length);
	}

	private _getEndOfLine(eol: editorCommon.EndOfLinePreference): string {
		switch (eol) {
			case editorCommon.EndOfLinePreference.LF:
				return '\n';
			case editorCommon.EndOfLinePreference.CRLF:
				return '\r\n';
			case editorCommon.EndOfLinePreference.TextDefined:
				return this.getEOL();
		}
		throw new Error('Unknown EOL preference');
	}

	public getValueInRange(range: Range, eol: editorCommon.EndOfLinePreference = editorCommon.EndOfLinePreference.TextDefined): string {
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

	public getValueLengthInRange(range: Range, eol: editorCommon.EndOfLinePreference = editorCommon.EndOfLinePreference.TextDefined): number {
		if (range.isEmpty()) {
			return 0;
		}

		if (range.startLineNumber === range.endLineNumber) {
			return (range.endColumn - range.startColumn);
		}

		let startOffset = this.getOffsetAt(new Position(range.startLineNumber, range.startColumn));
		let endOffset = this.getOffsetAt(new Position(range.endLineNumber, range.endColumn));
		return endOffset - startOffset;
	}

	public getLineCount(): number {
		return this._lines.length;
	}

	public getLinesContent(): string[] {
		return this._lines.slice(0);
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

	public getLineMinColumn(lineNumber: number): number {
		return 1;
	}

	public getLineMaxColumn(lineNumber: number): number {
		return this._lines[lineNumber - 1].length + 1;
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

	public setEOL(newEOL: string): void {
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

	public _applyEdits(rawOperations: editorCommon.IIdentifiedSingleEditOperation[], recordTrimAutoWhitespace: boolean): ApplyEditResult {
		if (rawOperations.length === 0) {
			return new ApplyEditResult([], [], [], []);
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
				identifier: op.identifier,
				range: validatedRange,
				rangeOffset: this.getOffsetAt(validatedRange.getStartPosition()),
				rangeLength: this.getValueLengthInRange(validatedRange),
				lines: op.text ? op.text.split(/\r\n|\r|\n/) : null,
				forceMoveMarkers: op.forceMoveMarkers,
				isAutoWhitespaceEdit: op.isAutoWhitespaceEdit || false
			};
		}

		// Sort operations ascending
		operations.sort(TextBuffer._sortOpsAscending);

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
		let reverseRanges = TextBuffer._getInverseEditRanges(operations);
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

		let reverseOperations: editorCommon.IIdentifiedSingleEditOperation[] = [];
		for (let i = 0; i < operations.length; i++) {
			let op = operations[i];
			let reverseRange = reverseRanges[i];

			reverseOperations[i] = {
				identifier: op.identifier,
				range: reverseRange,
				text: this.getValueInRange(op.range),
				forceMoveMarkers: op.forceMoveMarkers
			};
		}

		this._mightContainRTL = mightContainRTL;
		this._mightContainNonBasicASCII = mightContainNonBasicASCII;

		const [rawContentChanges, contentChanges] = this._doApplyEdits(operations);

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

		return new ApplyEditResult(
			reverseOperations,
			rawContentChanges,
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
			rangeOffset: this.getOffsetAt(entireEditRange.getStartPosition()),
			rangeLength: this.getValueLengthInRange(entireEditRange),
			lines: result.join('').split('\n'),
			forceMoveMarkers: forceMoveMarkers,
			isAutoWhitespaceEdit: false
		};
	}

	private _doApplyEdits(operations: IValidatedEditOperation[]): [ModelRawChange[], IInternalModelContentChange[]] {

		// Sort operations descending
		operations.sort(TextBuffer._sortOpsDescending);

		let rawContentChanges: ModelRawChange[] = [];
		let contentChanges: IInternalModelContentChange[] = [];
		let lineEditsQueue: IIdentifiedLineEdit[] = [];

		const queueLineEdit = (lineEdit: IIdentifiedLineEdit) => {
			if (lineEdit.startColumn === lineEdit.endColumn && lineEdit.text.length === 0) {
				// empty edit => ignore it
				return;
			}
			lineEditsQueue.push(lineEdit);
		};

		const flushLineEdits = () => {
			if (lineEditsQueue.length === 0) {
				return;
			}

			lineEditsQueue.reverse();

			// `lineEditsQueue` now contains edits from smaller (line number,column) to larger (line number,column)
			let currentLineNumber = lineEditsQueue[0].lineNumber;
			let currentLineNumberStart = 0;

			for (let i = 1, len = lineEditsQueue.length; i < len; i++) {
				const lineNumber = lineEditsQueue[i].lineNumber;

				if (lineNumber === currentLineNumber) {
					continue;
				}

				// this._invalidateLine(currentLineNumber - 1); //TODO@TextBuffer
				this._lines[currentLineNumber - 1] = applyLineEdits(
					this._lines[currentLineNumber - 1],
					lineEditsQueue.slice(currentLineNumberStart, i)
				);
				this._lineStarts.changeValue(currentLineNumber - 1, this._lines[currentLineNumber - 1].length + this._EOL.length);
				rawContentChanges.push(
					new ModelRawLineChanged(currentLineNumber, this._lines[currentLineNumber - 1])
				);

				currentLineNumber = lineNumber;
				currentLineNumberStart = i;
			}

			// this._invalidateLine(currentLineNumber - 1); //TODO@TextBuffer
			this._lines[currentLineNumber - 1] = applyLineEdits(
				this._lines[currentLineNumber - 1],
				lineEditsQueue.slice(currentLineNumberStart, lineEditsQueue.length)
			);
			this._lineStarts.changeValue(currentLineNumber - 1, this._lines[currentLineNumber - 1].length + this._EOL.length);
			rawContentChanges.push(
				new ModelRawLineChanged(currentLineNumber, this._lines[currentLineNumber - 1])
			);

			lineEditsQueue = [];
		};

		for (let i = 0, len = operations.length; i < len; i++) {
			const op = operations[i];

			// console.log();
			// console.log('-------------------');
			// console.log('OPERATION #' + (i));
			// console.log('op: ', op);
			// console.log('<<<\n' + this._lines.map(l => l.text).join('\n') + '\n>>>');

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

			// Iterating descending to overlap with previous op
			// in case there are common lines being edited in both
			for (let j = editingLinesCnt; j >= 0; j--) {
				const editLineNumber = startLineNumber + j;

				queueLineEdit({
					lineNumber: editLineNumber,
					startColumn: (editLineNumber === startLineNumber ? startColumn : 1),
					endColumn: (editLineNumber === endLineNumber ? endColumn : this.getLineMaxColumn(editLineNumber)),
					text: (op.lines ? op.lines[j] : '')
				});
			}

			if (editingLinesCnt < deletingLinesCnt) {
				// Must delete some lines

				// Flush any pending line edits
				flushLineEdits();

				const spliceStartLineNumber = startLineNumber + editingLinesCnt;

				const [t1, t2] = splitLine(this._lines[endLineNumber - 1], endColumn);
				this._lines[endLineNumber - 1] = t1;
				const endLineRemains = t2;
				// this._invalidateLine(spliceStartLineNumber - 1); //TODO@TextBuffer

				const spliceCnt = endLineNumber - spliceStartLineNumber;

				this._lines.splice(spliceStartLineNumber, spliceCnt);
				this._lineStarts.removeValues(spliceStartLineNumber, spliceCnt);

				// Reconstruct first line
				this._lines[spliceStartLineNumber - 1] += endLineRemains;
				this._lineStarts.changeValue(spliceStartLineNumber - 1, this._lines[spliceStartLineNumber - 1].length + this._EOL.length);

				rawContentChanges.push(
					new ModelRawLineChanged(spliceStartLineNumber, this._lines[spliceStartLineNumber - 1])
				);

				rawContentChanges.push(
					new ModelRawLinesDeleted(spliceStartLineNumber + 1, spliceStartLineNumber + spliceCnt)
				);
			}

			if (editingLinesCnt < insertingLinesCnt) {
				// Must insert some lines

				// Flush any pending line edits
				flushLineEdits();

				const spliceLineNumber = startLineNumber + editingLinesCnt;
				let spliceColumn = (spliceLineNumber === startLineNumber ? startColumn : 1);
				if (op.lines) {
					spliceColumn += op.lines[editingLinesCnt].length;
				}

				// Split last line
				const [t1, t2] = splitLine(this._lines[spliceLineNumber - 1], spliceColumn);
				this._lines[spliceLineNumber - 1] = t1;
				const leftoverLine = t2;
				this._lineStarts.changeValue(spliceLineNumber - 1, this._lines[spliceLineNumber - 1].length + this._EOL.length);
				rawContentChanges.push(
					new ModelRawLineChanged(spliceLineNumber, this._lines[spliceLineNumber - 1])
				);
				// this._invalidateLine(spliceLineNumber - 1); //TODO@TextBuffer

				// Lines in the middle
				let newLines: string[] = [];
				let newLinesContent: string[] = [];
				let newLinesLengths = new Uint32Array(insertingLinesCnt - editingLinesCnt);
				for (let j = editingLinesCnt + 1; j <= insertingLinesCnt; j++) {
					newLines.push(op.lines[j]);
					newLinesContent.push(op.lines[j]);
					newLinesLengths[j - editingLinesCnt - 1] = op.lines[j].length + this._EOL.length;
				}
				this._lines = arrays.arrayInsert(this._lines, startLineNumber + editingLinesCnt, newLines);
				newLinesContent[newLinesContent.length - 1] += leftoverLine;
				this._lineStarts.insertValues(startLineNumber + editingLinesCnt, newLinesLengths);

				// Last line
				this._lines[startLineNumber + insertingLinesCnt - 1] += leftoverLine;
				this._lineStarts.changeValue(startLineNumber + insertingLinesCnt - 1, this._lines[startLineNumber + insertingLinesCnt - 1].length + this._EOL.length);
				rawContentChanges.push(
					new ModelRawLinesInserted(spliceLineNumber + 1, startLineNumber + insertingLinesCnt, newLinesContent.join('\n'))
				);
			}

			const contentChangeRange = new Range(startLineNumber, startColumn, endLineNumber, endColumn);
			const text = (op.lines ? op.lines.join(this.getEOL()) : '');
			contentChanges.push({
				range: contentChangeRange,
				rangeLength: op.rangeLength,
				text: text,
				lines: op.lines,
				rangeOffset: op.rangeOffset,
				forceMoveMarkers: op.forceMoveMarkers
			});

			// console.log('AFTER:');
			// console.log('<<<\n' + this._lines.map(l => l.text).join('\n') + '\n>>>');
		}

		flushLineEdits();

		return [rawContentChanges, contentChanges];
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

export function applyLineEdits(text: string, edits: ILineEdit[]): string {
	let deltaColumn = 0;
	let resultText = text;

	for (let i = 0, len = edits.length; i < len; i++) {
		let edit = edits[i];

		// console.log();
		// console.log('=============================');
		// console.log('EDIT #' + i + ' [ ' + edit.startColumn + ' -> ' + edit.endColumn + ' ] : <<<' + edit.text + '>>>');
		// console.log('deltaColumn: ' + deltaColumn);

		let startColumn = deltaColumn + edit.startColumn;
		let endColumn = deltaColumn + edit.endColumn;
		let deletingCnt = endColumn - startColumn;
		let insertingCnt = edit.text.length;

		// Perform the edit & update `deltaColumn`
		resultText = resultText.substring(0, startColumn - 1) + edit.text + resultText.substring(endColumn - 1);
		deltaColumn += insertingCnt - deletingCnt;
	}

	// Save the resulting text
	return resultText;
}

export function splitLine(text: string, splitColumn: number): [string, string] {
	const myText = text.substring(0, splitColumn - 1);
	const otherText = text.substring(splitColumn - 1);

	return [myText, otherText];
}
