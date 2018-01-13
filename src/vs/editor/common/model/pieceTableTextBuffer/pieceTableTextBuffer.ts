/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import * as strings from 'vs/base/common/strings';
import { ITextSource } from 'vs/editor/common/model/pieceTableTextBuffer/textSource';
import { IValidatedEditOperation } from 'vs/editor/common/model/linesTextBuffer/linesTextBuffer';
import { PieceTableBase, SENTINEL } from 'vs/editor/common/model/pieceTableTextBuffer/pieceTableBase';
import { IIdentifiedSingleEditOperation, EndOfLinePreference, ITextBuffer, ApplyEditsResult, IInternalModelContentChange } from 'vs/editor/common/model';
import { ModelRawChange, ModelRawLineChanged, ModelRawLinesDeleted, ModelRawLinesInserted } from 'vs/editor/common/model/textModelEvents';

export class PieceTableTextBuffer extends PieceTableBase implements ITextBuffer {
	private _BOM: string;
	private _EOL: string;
	private _mightContainRTL: boolean;
	private _mightContainNonBasicASCII: boolean;

	constructor(textSource: ITextSource) {
		super(textSource.chunks);
		this._BOM = textSource.BOM;
		this._EOL = textSource.EOL;
		this._mightContainNonBasicASCII = !textSource.isBasicASCII;
		this._mightContainRTL = textSource.containsRTL;
	}

	// #region TextBuffer
	public getLinesContent(): string[] {
		return this.getContentOfSubTree(this._root).split(/\r\n|\r|\n/);
	}

	public getLinesContent2(): string {
		return this.getContentOfSubTree(this._root);
	}

	public getLineCount(): number {
		return this._lineCnt;
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

	public getValueInRange(range: Range, eol: EndOfLinePreference = EndOfLinePreference.TextDefined): string {
		if (range.isEmpty()) {
			return '';
		}

		if (range.startLineNumber === range.endLineNumber) {
			return this.getLineRawContent(range.startLineNumber).substring(range.startColumn - 1, range.endColumn - 1);
		}

		const lineEnding = this._getEndOfLine(eol);
		const startLineIndex = range.startLineNumber - 1;
		const endLineIndex = range.endLineNumber - 1;
		let resultLines: string[] = [];

		resultLines.push(this.getLineContent(startLineIndex + 1).substring(range.startColumn - 1));
		for (let i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this.getLineContent(i + 1));
		}
		resultLines.push(this.getLineContent(endLineIndex + 1).substring(0, range.endColumn - 1));

		return resultLines.join(lineEnding);
	}

	public getValueInRange2(range: Range, eol: EndOfLinePreference = EndOfLinePreference.TextDefined): string {
		// todo, validate range.
		if (range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn) {
			return '';
		}

		let startPosition = this.nodeAt2(new Position(range.startLineNumber, range.startColumn));
		let endPosition = this.nodeAt2(new Position(range.endLineNumber, range.endColumn));

		if (startPosition.node === endPosition.node) {
			let node = startPosition.node;
			let buffer = this._buffers[node.piece.bufferIndex].buffer;
			let startOffset = this.getStartOffset(node);
			return buffer.substring(startOffset + startPosition.remainder, startOffset + endPosition.remainder);
		}

		let x = startPosition.node;
		let buffer = this._buffers[x.piece.bufferIndex].buffer;
		let startOffset = this.getStartOffset(x);
		let ret = buffer.substring(startOffset + startPosition.remainder, startOffset + x.piece.length);

		x = x.next();
		while (x !== SENTINEL) {
			let buffer = this._buffers[x.piece.bufferIndex].buffer;
			let startOffset = this.getStartOffset(x);

			if (x === endPosition.node) {
				ret += buffer.substring(startOffset, startOffset + endPosition.remainder);
				break;
			} else {
				ret += buffer.substr(startOffset, x.piece.length);
			}

			x = x.next();
		}

		return ret;
	}

	public getLineContent(lineNumber: number): string {
		return this.getLineRawContent(lineNumber).replace(/(\r\n|\r|\n)$/, '');
	}

	public getOffsetAt(lineNumber: number, column: number): number {
		let leftLen = 0; // inorder

		let x = this._root;

		while (x !== SENTINEL) {
			if (x.left !== SENTINEL && x.lf_left + 1 >= lineNumber) {
				x = x.left;
			} else if (x.lf_left + x.piece.lineFeedCnt + 1 >= lineNumber) {
				leftLen += x.size_left;
				// lineNumber >= 2
				let accumualtedValInCurrentIndex = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
				return leftLen += accumualtedValInCurrentIndex + column - 1;
			} else {
				lineNumber -= x.lf_left + x.piece.lineFeedCnt;
				leftLen += x.size_left + x.piece.length;
				x = x.right;
			}
		}

		return leftLen;
	}

	public getPositionAt(offset: number): Position {
		offset = Math.floor(offset);
		offset = Math.max(0, offset);

		let x = this._root;
		let lfCnt = 0;
		let originalOffset = offset;

		while (x !== SENTINEL) {
			if (x.size_left !== 0 && x.size_left >= offset) {
				x = x.left;
			} else if (x.size_left + x.piece.length >= offset) {
				let out = this.getIndexOf(x, offset - x.size_left);

				lfCnt += x.lf_left + out.index;

				if (out.index === 0) {
					let lineStartOffset = this.getOffsetAt(lfCnt + 1, 1);
					let column = originalOffset - lineStartOffset;
					return new Position(lfCnt + 1, column + 1);
				}

				return new Position(lfCnt + 1, out.remainder + 1);
			} else {
				offset -= x.size_left + x.piece.length;
				lfCnt += x.lf_left + x.piece.lineFeedCnt;

				if (x.right === SENTINEL) {
					// last node
					let lineStartOffset = this.getOffsetAt(lfCnt + 1, 1);
					let column = originalOffset - offset - lineStartOffset;
					return new Position(lfCnt + 1, column + 1);
				} else {
					x = x.right;
				}
			}
		}

		return new Position(1, 1);
	}

	public equals(other: ITextBuffer): boolean {
		if (!(other instanceof PieceTableTextBuffer)) {
			return false;
		}
		if (this._BOM !== other._BOM) {
			return false;
		}
		if (this._EOL !== other._EOL) {
			return false;
		}
		if (this.getLinesContent2() !== other.getLinesContent2()) {
			return false;
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

	public setEOL(newEOL: string): void {
		this._EOL = newEOL;
	}

	public applyEdits(rawOperations: IIdentifiedSingleEditOperation[], recordTrimAutoWhitespace: boolean): ApplyEditsResult {
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
				rangeOffset: this.getOffsetAt(validatedRange.startLineNumber, validatedRange.startColumn),
				rangeLength: this.getValueLengthInRange(validatedRange),
				lines: op.text ? op.text.split(/\r\n|\r|\n/) : null,
				forceMoveMarkers: op.forceMoveMarkers,
				isAutoWhitespaceEdit: op.isAutoWhitespaceEdit || false
			};
		}

		// Sort operations ascending
		operations.sort(PieceTableTextBuffer._sortOpsAscending);

		for (let i = 0, count = operations.length - 1; i < count; i++) {
			let rangeEnd = operations[i].range.getEndPosition();
			let nextRangeStart = operations[i + 1].range.getStartPosition();

			if (nextRangeStart.isBefore(rangeEnd)) {
				// overlapping ranges
				throw new Error('Overlapping ranges are not allowed!');
			}
		}

		if (canReduceOperations) {
			// operations = this._reduceOperations(operations);
		}

		// Delta encode operations
		let reverseRanges = PieceTableTextBuffer._getInverseEditRanges(operations);
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

		return new ApplyEditsResult(
			reverseOperations,
			rawContentChanges,
			contentChanges,
			trimAutoWhitespaceLineNumbers
		);
	}

	private _doApplyEdits(operations: IValidatedEditOperation[]): [ModelRawChange[], IInternalModelContentChange[]] {
		operations.sort(PieceTableTextBuffer._sortOpsDescending);

		let rawContentChanges: ModelRawChange[] = [];
		let contentChanges: IInternalModelContentChange[] = [];

		// operations are from bottom to top
		for (let i = 0; i < operations.length; i++) {
			let op = operations[i];

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

			const text = (op.lines ? op.lines.join(this.getEOL()) : '');

			if (text) {
				// replacement
				this.delete(op.rangeOffset, op.rangeLength);
				this.insert(op.rangeOffset, text);

			} else {
				// deletion
				this.delete(op.rangeOffset, op.rangeLength);
			}

			for (let j = startLineNumber; j <= startLineNumber + editingLinesCnt; j++) {
				rawContentChanges.push(
					new ModelRawLineChanged(j, this.getLineContent(j))
				);
			}

			if (editingLinesCnt < deletingLinesCnt) {
				rawContentChanges.push(
					new ModelRawLinesDeleted(startLineNumber + editingLinesCnt + 1, endLineNumber)
				);
			}

			if (editingLinesCnt < insertingLinesCnt) {
				let newLinesContent: string[] = [];
				for (let j = editingLinesCnt + 1; j <= insertingLinesCnt; j++) {
					newLinesContent.push(op.lines[j]);
				}

				newLinesContent[newLinesContent.length - 1] = this.getLineContent(startLineNumber + insertingLinesCnt - 1);

				rawContentChanges.push(
					new ModelRawLinesInserted(startLineNumber + editingLinesCnt + 1, startLineNumber + insertingLinesCnt, newLinesContent)
				);
			}

			const contentChangeRange = new Range(startLineNumber, startColumn, endLineNumber, endColumn);
			contentChanges.push({
				range: contentChangeRange,
				rangeLength: op.rangeLength,
				text: text,
				lines: op.lines,
				rangeOffset: op.rangeOffset,
				forceMoveMarkers: op.forceMoveMarkers
			});
		}
		return [rawContentChanges, contentChanges];
	}

	public getValueLengthInRange(range: Range, eol: EndOfLinePreference = EndOfLinePreference.TextDefined): number {
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

	public getLineCharCode(lineNumber: number, index: number): number {
		return this.getLineContent(lineNumber).charCodeAt(index);
	}

	public getLineLength(lineNumber: number): number {
		return this.getLineContent(lineNumber).length;
	}

	public getLineMinColumn(lineNumber: number): number {
		return 1;
	}

	public getLineMaxColumn(lineNumber: number): number {
		return this.getLineLength(lineNumber) + 1;
	}

	public getLineFirstNonWhitespaceColumn(lineNumber: number): number {
		const result = strings.firstNonWhitespaceIndex(this.getLineContent(lineNumber));
		if (result === -1) {
			return 0;
		}
		return result + 1;
	}

	public getLineLastNonWhitespaceColumn(lineNumber: number): number {
		const result = strings.lastNonWhitespaceIndex(this.getLineContent(lineNumber));
		if (result === -1) {
			return 0;
		}
		return result + 2;
	}

	public getRangeAt(start: number, length: number): Range {
		let end = start + length;
		const startPosition = this.getPositionAt(start);
		const endPosition = this.getPositionAt(end);
		return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
	}

	// #endregion

	// #region helper
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
	// #endregion
}
