/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { CharCode } from 'vs/base/common/charCode';
import { ITextBuffer, EndOfLinePreference, IIdentifiedSingleEditOperation, ApplyEditsResult, ISingleEditOperationIdentifier, IInternalModelContentChange } from 'vs/editor/common/model';
import { BufferPiece, LeafOffsetLenEdit } from 'vs/editor/common/model/chunksTextBuffer/bufferPiece';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as strings from 'vs/base/common/strings';
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

export class ChunksTextBuffer implements ITextBuffer {

	private _BOM: string;
	private _actual: Buffer;
	private _mightContainRTL: boolean;
	private _mightContainNonBasicASCII: boolean;

	constructor(pieces: BufferPiece[], _averageChunkSize: number, BOM: string, eol: '\r\n' | '\n', containsRTL: boolean, isBasicASCII: boolean) {
		this._BOM = BOM;
		const averageChunkSize = Math.floor(Math.min(65536.0, Math.max(128.0, _averageChunkSize)));
		const delta = Math.floor(averageChunkSize / 3);
		const min = averageChunkSize - delta;
		const max = 2 * min;
		this._actual = new Buffer(pieces, min, max, eol);
		this._mightContainRTL = containsRTL;
		this._mightContainNonBasicASCII = !isBasicASCII;
	}

	equals(other: ITextBuffer): boolean {
		if (!(other instanceof ChunksTextBuffer)) {
			return false;
		}
		return this._actual.equals(other._actual);
	}
	mightContainRTL(): boolean {
		return this._mightContainRTL;
	}
	mightContainNonBasicASCII(): boolean {
		return this._mightContainNonBasicASCII;
	}
	getBOM(): string {
		return this._BOM;
	}
	getEOL(): string {
		return this._actual.getEOL();
	}
	getOffsetAt(lineNumber: number, column: number): number {
		return this._actual.convertPositionToOffset(lineNumber, column);
	}
	getPositionAt(offset: number): Position {
		return this._actual.convertOffsetToPosition(offset);
	}
	getRangeAt(offset: number, length: number): Range {
		return this._actual.convertOffsetLenToRange(offset, length);
	}
	getValueInRange(range: Range, eol: EndOfLinePreference): string {
		if (range.isEmpty()) {
			return '';
		}

		const text = this._actual.getValueInRange(range);
		switch (eol) {
			case EndOfLinePreference.TextDefined:
				return text;
			case EndOfLinePreference.LF:
				if (this.getEOL() === '\n') {
					return text;
				} else {
					return text.replace(/\r\n/g, '\n');
				}
			case EndOfLinePreference.CRLF:
				if (this.getEOL() === '\r\n') {
					return text;
				} else {
					return text.replace(/\n/g, '\r\n');
				}
		}
		return null;
	}

	public createSnapshot(preserveBOM: boolean): ITextSnapshot {
		return this._actual.createSnapshot(preserveBOM ? this._BOM : '');
	}

	getValueLengthInRange(range: Range, eol: EndOfLinePreference): number {
		if (range.isEmpty()) {
			return 0;
		}
		const eolCount = range.endLineNumber - range.startLineNumber;
		const result = this._actual.getValueLengthInRange(range);
		switch (eol) {
			case EndOfLinePreference.TextDefined:
				return result;
			case EndOfLinePreference.LF:
				if (this.getEOL() === '\n') {
					return result;
				} else {
					return result - eolCount; // \r\n => \n
				}
			case EndOfLinePreference.CRLF:
				if (this.getEOL() === '\r\n') {
					return result;
				} else {
					return result + eolCount; // \n => \r\n
				}
		}
		return 0;
	}

	public getLength(): number {
		return this._actual.getLength();
	}

	getLineCount(): number {
		return this._actual.getLineCount();
	}

	getLinesContent(): string[] {
		return this._actual.getLinesContent();
	}

	getLineContent(lineNumber: number): string {
		return this._actual.getLineContent(lineNumber);
	}

	getLineCharCode(lineNumber: number, index: number): number {
		return this._actual.getLineCharCode(lineNumber, index);
	}

	getLineLength(lineNumber: number): number {
		return this._actual.getLineLength(lineNumber);
	}

	getLineFirstNonWhitespaceColumn(lineNumber: number): number {
		const result = this._actual.getLineFirstNonWhitespaceIndex(lineNumber);
		if (result === -1) {
			return 0;
		}
		return result + 1;
	}
	getLineLastNonWhitespaceColumn(lineNumber: number): number {
		const result = this._actual.getLineLastNonWhitespaceIndex(lineNumber);
		if (result === -1) {
			return 0;
		}
		return result + 1;
	}
	setEOL(newEOL: '\r\n' | '\n'): void {
		if (this.getEOL() === newEOL) {
			// nothing to do...
			return;
		}
		this._actual.setEOL(newEOL);
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

	applyEdits(rawOperations: IIdentifiedSingleEditOperation[], recordTrimAutoWhitespace: boolean): ApplyEditsResult {
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
		operations.sort(ChunksTextBuffer._sortOpsAscending);

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
		let reverseRanges = ChunksTextBuffer._getInverseEditRanges(operations);
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
					result.push(this.getLineContent(lineNumber).substring(lastEndColumn - 1));
				} else {
					result.push('\n');
					result.push(this.getLineContent(lineNumber));
				}
			}

			if (range.startLineNumber === lastEndLineNumber) {
				result.push(this.getLineContent(range.startLineNumber).substring(lastEndColumn - 1, range.startColumn - 1));
			} else {
				result.push('\n');
				result.push(this.getLineContent(range.startLineNumber).substring(0, range.startColumn - 1));
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

	private _doApplyEdits(operations: IValidatedEditOperation[]): IInternalModelContentChange[] {

		// Sort operations descending
		operations.sort(ChunksTextBuffer._sortOpsDescending);

		let contentChanges: IInternalModelContentChange[] = [];
		let edits: OffsetLenEdit[] = [];

		for (let i = 0, len = operations.length; i < len; i++) {
			const op = operations[i];

			const text = (op.lines ? op.lines.join(this.getEOL()) : '');
			edits[i] = new OffsetLenEdit(op.sortIndex, op.rangeOffset, op.rangeLength, text);

			const startLineNumber = op.range.startLineNumber;
			const startColumn = op.range.startColumn;
			const endLineNumber = op.range.endLineNumber;
			const endColumn = op.range.endColumn;

			if (startLineNumber === endLineNumber && startColumn === endColumn && (!op.lines || op.lines.length === 0)) {
				// no-op
				continue;
			}

			contentChanges.push({
				range: op.range,
				rangeLength: op.rangeLength,
				text: text,
				rangeOffset: op.rangeOffset,
				forceMoveMarkers: op.forceMoveMarkers
			});
		}

		this._actual.replaceOffsetLen(edits);

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
}


class BufferNodes {

	public length: Uint32Array;
	public newLineCount: Uint32Array;

	constructor(count: number) {
		this.length = new Uint32Array(count);
		this.newLineCount = new Uint32Array(count);
	}

}

class BufferCursor {
	constructor(
		public offset: number,
		public leafIndex: number,
		public leafStartOffset: number,
		public leafStartNewLineCount: number
	) { }

	public set(offset: number, leafIndex: number, leafStartOffset: number, leafStartNewLineCount: number) {
		this.offset = offset;
		this.leafIndex = leafIndex;
		this.leafStartOffset = leafStartOffset;
		this.leafStartNewLineCount = leafStartNewLineCount;
	}
}

class OffsetLenEdit {
	constructor(
		public readonly initialIndex: number,
		public readonly offset: number,
		public length: number,
		public text: string
	) { }
}

class InternalOffsetLenEdit {
	constructor(
		public readonly startLeafIndex: number,
		public readonly startInnerOffset: number,
		public readonly endLeafIndex: number,
		public readonly endInnerOffset: number,
		public text: string
	) { }
}

class LeafReplacement {
	constructor(
		public readonly startLeafIndex: number,
		public readonly endLeafIndex: number,
		public readonly replacements: BufferPiece[]
	) { }
}

const BUFFER_CURSOR_POOL_SIZE = 10;
const BufferCursorPool = new class {
	private _pool: BufferCursor[];
	private _len: number;

	constructor() {
		this._pool = [];
		for (let i = 0; i < BUFFER_CURSOR_POOL_SIZE; i++) {
			this._pool[i] = new BufferCursor(0, 0, 0, 0);
		}
		this._len = this._pool.length;
	}

	public put(cursor: BufferCursor): void {
		if (this._len > this._pool.length) {
			// oh, well
			return;
		}
		this._pool[this._len++] = cursor;
	}

	public take(): BufferCursor {
		if (this._len === 0) {
			// oh, well
			console.log(`insufficient BufferCursor pool`);
			return new BufferCursor(0, 0, 0, 0);
		}
		const result = this._pool[this._len - 1];
		this._pool[this._len--] = null;
		return result;
	}
};

class BufferSnapshot implements ITextSnapshot {

	private readonly _pieces: BufferPiece[];
	private readonly _piecesLength: number;
	private readonly _BOM: string;
	private _piecesIndex: number;

	constructor(pieces: BufferPiece[], BOM: string) {
		this._pieces = pieces;
		this._piecesLength = this._pieces.length;
		this._BOM = BOM;
		this._piecesIndex = 0;
	}

	public read(): string {
		if (this._piecesIndex >= this._piecesLength) {
			return null;
		}

		let result: string = null;
		if (this._piecesIndex === 0) {
			result = this._BOM + this._pieces[this._piecesIndex].text;
		} else {
			result = this._pieces[this._piecesIndex].text;
		}

		this._piecesIndex++;
		return result;
	}
}

class Buffer {

	private _minLeafLength: number;
	private _maxLeafLength: number;
	private _idealLeafLength: number;

	private _eol: '\r\n' | '\n';
	private _eolLength: number;

	private _leafs: BufferPiece[];
	private _nodes: BufferNodes;
	private _nodesCount: number;
	private _leafsStart: number;
	private _leafsEnd: number;

	constructor(pieces: BufferPiece[], minLeafLength: number, maxLeafLength: number, eol: '\r\n' | '\n') {
		if (!(2 * minLeafLength >= maxLeafLength)) {
			throw new Error(`assertion violation`);
		}

		this._minLeafLength = minLeafLength;
		this._maxLeafLength = maxLeafLength;
		this._idealLeafLength = (minLeafLength + maxLeafLength) >>> 1;

		this._eol = eol;
		this._eolLength = this._eol.length;

		this._leafs = pieces;
		this._nodes = null;
		this._nodesCount = 0;
		this._leafsStart = 0;
		this._leafsEnd = 0;

		this._rebuildNodes();
	}

	equals(other: Buffer): boolean {
		return Buffer.equals(this, other);
	}

	private static equals(a: Buffer, b: Buffer): boolean {
		const aLength = a.getLength();
		const bLength = b.getLength();
		if (aLength !== bLength) {
			return false;
		}
		if (a.getLineCount() !== b.getLineCount()) {
			return false;
		}

		let remaining = aLength;
		let aLeafIndex = -1, aLeaf = null, aLeafLength = 0, aLeafRemaining = 0;
		let bLeafIndex = -1, bLeaf = null, bLeafLength = 0, bLeafRemaining = 0;

		while (remaining > 0) {
			if (aLeafRemaining === 0) {
				aLeafIndex++;
				aLeaf = a._leafs[aLeafIndex];
				aLeafLength = aLeaf.length();
				aLeafRemaining = aLeafLength;
			}

			if (bLeafRemaining === 0) {
				bLeafIndex++;
				bLeaf = b._leafs[bLeafIndex];
				bLeafLength = bLeaf.length();
				bLeafRemaining = bLeafLength;
			}

			let consuming = Math.min(aLeafRemaining, bLeafRemaining);

			let aStr = aLeaf.substr(aLeafLength - aLeafRemaining, consuming);
			let bStr = bLeaf.substr(bLeafLength - bLeafRemaining, consuming);

			if (aStr !== bStr) {
				return false;
			}

			remaining -= consuming;
			aLeafRemaining -= consuming;
			bLeafRemaining -= consuming;
		}

		return true;
	}

	public getEOL(): string {
		return this._eol;
	}

	private _rebuildNodes() {
		const leafsCount = this._leafs.length;

		this._nodesCount = (1 << log2(leafsCount));
		this._leafsStart = this._nodesCount;
		this._leafsEnd = this._leafsStart + leafsCount;

		this._nodes = new BufferNodes(this._nodesCount);
		for (let i = this._nodesCount - 1; i >= 1; i--) {
			this._updateSingleNode(i);
		}
	}

	private _updateSingleNode(nodeIndex: number): void {
		const left = LEFT_CHILD(nodeIndex);
		const right = RIGHT_CHILD(nodeIndex);

		let length = 0;
		let newLineCount = 0;

		if (this.IS_NODE(left)) {
			length += this._nodes.length[left];
			newLineCount += this._nodes.newLineCount[left];
		} else if (this.IS_LEAF(left)) {
			const leaf = this._leafs[this.NODE_TO_LEAF_INDEX(left)];
			length += leaf.length();
			newLineCount += leaf.newLineCount();
		}

		if (this.IS_NODE(right)) {
			length += this._nodes.length[right];
			newLineCount += this._nodes.newLineCount[right];
		} else if (this.IS_LEAF(right)) {
			const leaf = this._leafs[this.NODE_TO_LEAF_INDEX(right)];
			length += leaf.length();
			newLineCount += leaf.newLineCount();
		}

		this._nodes.length[nodeIndex] = length;
		this._nodes.newLineCount[nodeIndex] = newLineCount;
	}

	private _findOffset(offset: number, result: BufferCursor): boolean {
		if (offset > this._nodes.length[1]) {
			return false;
		}

		let it = 1;
		let searchOffset = offset;
		let leafStartOffset = 0;
		let leafStartNewLineCount = 0;
		while (!this.IS_LEAF(it)) {
			const left = LEFT_CHILD(it);
			const right = RIGHT_CHILD(it);

			let leftNewLineCount = 0;
			let leftLength = 0;
			if (this.IS_NODE(left)) {
				leftNewLineCount = this._nodes.newLineCount[left];
				leftLength = this._nodes.length[left];
			} else if (this.IS_LEAF(left)) {
				const leaf = this._leafs[this.NODE_TO_LEAF_INDEX(left)];
				leftNewLineCount = leaf.newLineCount();
				leftLength = leaf.length();
			}

			let rightLength = 0;
			if (this.IS_NODE(right)) {
				rightLength += this._nodes.length[right];
			} else if (this.IS_LEAF(right)) {
				rightLength += this._leafs[this.NODE_TO_LEAF_INDEX(right)].length();
			}

			if (searchOffset < leftLength || rightLength === 0) {
				// go left
				it = left;
			} else {
				// go right
				searchOffset -= leftLength;
				leafStartOffset += leftLength;
				leafStartNewLineCount += leftNewLineCount;
				it = right;
			}
		}
		it = this.NODE_TO_LEAF_INDEX(it);

		result.set(offset, it, leafStartOffset, leafStartNewLineCount);
		return true;
	}

	private _findOffsetCloseAfter(offset: number, start: BufferCursor, result: BufferCursor): boolean {
		if (offset > this._nodes.length[1]) {
			return false;
		}

		let innerOffset = offset - start.leafStartOffset;
		const leafsCount = this._leafs.length;

		let leafIndex = start.leafIndex;
		let leafStartOffset = start.leafStartOffset;
		let leafStartNewLineCount = start.leafStartNewLineCount;

		while (true) {
			const leaf = this._leafs[leafIndex];

			if (innerOffset < leaf.length() || (innerOffset === leaf.length() && leafIndex + 1 === leafsCount)) {
				result.set(offset, leafIndex, leafStartOffset, leafStartNewLineCount);
				return true;
			}

			leafIndex++;

			if (leafIndex >= leafsCount) {
				result.set(offset, leafIndex, leafStartOffset, leafStartNewLineCount);
				return true;
			}

			leafStartOffset += leaf.length();
			leafStartNewLineCount += leaf.newLineCount();
			innerOffset -= leaf.length();
		}
	}

	private _findLineStart(lineNumber: number, result: BufferCursor): boolean {
		let lineIndex = lineNumber - 1;
		if (lineIndex < 0 || lineIndex > this._nodes.newLineCount[1]) {
			result.set(0, 0, 0, 0);
			return false;
		}

		let it = 1;
		let leafStartOffset = 0;
		let leafStartNewLineCount = 0;
		while (!this.IS_LEAF(it)) {
			const left = LEFT_CHILD(it);
			const right = RIGHT_CHILD(it);

			let leftNewLineCount = 0;
			let leftLength = 0;
			if (this.IS_NODE(left)) {
				leftNewLineCount = this._nodes.newLineCount[left];
				leftLength = this._nodes.length[left];
			} else if (this.IS_LEAF(left)) {
				const leaf = this._leafs[this.NODE_TO_LEAF_INDEX(left)];
				leftNewLineCount = leaf.newLineCount();
				leftLength = leaf.length();
			}

			if (lineIndex <= leftNewLineCount) {
				// go left
				it = left;
				continue;
			}

			// go right
			lineIndex -= leftNewLineCount;
			leafStartOffset += leftLength;
			leafStartNewLineCount += leftNewLineCount;
			it = right;
		}
		it = this.NODE_TO_LEAF_INDEX(it);

		const innerLineStartOffset = (lineIndex === 0 ? 0 : this._leafs[it].lineStartFor(lineIndex - 1));

		result.set(leafStartOffset + innerLineStartOffset, it, leafStartOffset, leafStartNewLineCount);
		return true;
	}

	private _findLineEnd(start: BufferCursor, lineNumber: number, result: BufferCursor): void {
		let innerLineIndex = lineNumber - 1 - start.leafStartNewLineCount;
		const leafsCount = this._leafs.length;

		let leafIndex = start.leafIndex;
		let leafStartOffset = start.leafStartOffset;
		let leafStartNewLineCount = start.leafStartNewLineCount;
		while (true) {
			const leaf = this._leafs[leafIndex];

			if (innerLineIndex < leaf.newLineCount()) {
				const lineEndOffset = this._leafs[leafIndex].lineStartFor(innerLineIndex);
				result.set(leafStartOffset + lineEndOffset, leafIndex, leafStartOffset, leafStartNewLineCount);
				return;
			}

			leafIndex++;

			if (leafIndex >= leafsCount) {
				result.set(leafStartOffset + leaf.length(), leafIndex - 1, leafStartOffset, leafStartNewLineCount);
				return;
			}

			leafStartOffset += leaf.length();
			leafStartNewLineCount += leaf.newLineCount();
			innerLineIndex = 0;
		}
	}

	private _findLine(lineNumber: number, start: BufferCursor, end: BufferCursor): boolean {
		if (!this._findLineStart(lineNumber, start)) {
			return false;
		}

		this._findLineEnd(start, lineNumber, end);
		return true;
	}

	public getLength(): number {
		return this._nodes.length[1];
	}

	public getLineCount(): number {
		return this._nodes.newLineCount[1] + 1;
	}

	public getLineContent(lineNumber: number): string {
		const start = BufferCursorPool.take();
		const end = BufferCursorPool.take();

		if (!this._findLine(lineNumber, start, end)) {
			BufferCursorPool.put(start);
			BufferCursorPool.put(end);
			throw new Error(`Line not found`);
		}

		let result: string;
		if (lineNumber === this.getLineCount()) {
			// last line is not trailed by an eol
			result = this.extractString(start, end.offset - start.offset);
		} else {
			result = this.extractString(start, end.offset - start.offset - this._eolLength);
		}

		BufferCursorPool.put(start);
		BufferCursorPool.put(end);
		return result;
	}

	public getLineCharCode(lineNumber: number, index: number): number {
		const start = BufferCursorPool.take();

		if (!this._findLineStart(lineNumber, start)) {
			BufferCursorPool.put(start);
			throw new Error(`Line not found`);
		}

		const tmp = BufferCursorPool.take();
		this._findOffsetCloseAfter(start.offset + index, start, tmp);
		const result = this._leafs[tmp.leafIndex].charCodeAt(tmp.offset - tmp.leafStartNewLineCount);
		BufferCursorPool.put(tmp);

		BufferCursorPool.put(start);
		return result;
	}

	public getLineLength(lineNumber: number): number {
		const start = BufferCursorPool.take();
		const end = BufferCursorPool.take();

		if (!this._findLine(lineNumber, start, end)) {
			BufferCursorPool.put(start);
			BufferCursorPool.put(end);
			throw new Error(`Line not found`);
		}

		let result: number;
		if (lineNumber === this.getLineCount()) {
			// last line is not trailed by an eol
			result = end.offset - start.offset;
		} else {
			result = end.offset - start.offset - this._eolLength;
		}

		BufferCursorPool.put(start);
		BufferCursorPool.put(end);
		return result;
	}

	public getLineFirstNonWhitespaceIndex(lineNumber: number): number {
		const start = BufferCursorPool.take();

		if (!this._findLineStart(lineNumber, start)) {
			BufferCursorPool.put(start);
			throw new Error(`Line not found`);
		}

		let leafIndex = start.leafIndex;
		let searchStartOffset = start.offset - start.leafStartOffset;
		BufferCursorPool.put(start);

		const leafsCount = this._leafs.length;
		let totalDelta = 0;
		while (true) {
			const leaf = this._leafs[leafIndex];

			const leafResult = leaf.findLineFirstNonWhitespaceIndex(searchStartOffset);
			if (leafResult === -2) {
				// reached EOL
				return -1;
			}
			if (leafResult !== -1) {
				return (leafResult - searchStartOffset) + totalDelta;
			}

			leafIndex++;

			if (leafIndex >= leafsCount) {
				return -1;
			}

			totalDelta += (leaf.length() - searchStartOffset);
			searchStartOffset = 0;
		}
	}

	public getLineLastNonWhitespaceIndex(lineNumber: number): number {
		const start = BufferCursorPool.take();
		const end = BufferCursorPool.take();

		if (!this._findLineStart(lineNumber, start)) {
			BufferCursorPool.put(start);
			BufferCursorPool.put(end);
			throw new Error(`Line not found`);
		}

		this._findLineEnd(start, lineNumber, end);

		const startOffset = start.offset;
		const endOffset = end.offset;
		let leafIndex = end.leafIndex;
		let searchStartOffset = end.offset - end.leafStartOffset - this._eolLength;

		BufferCursorPool.put(start);
		BufferCursorPool.put(end);

		let totalDelta = 0;
		while (true) {
			const leaf = this._leafs[leafIndex];

			const leafResult = leaf.findLineLastNonWhitespaceIndex(searchStartOffset);
			if (leafResult === -2) {
				// reached EOL
				return -1;
			}
			if (leafResult !== -1) {
				const delta = (searchStartOffset - 1 - leafResult);
				const absoluteOffset = (endOffset - this._eolLength) - delta - totalDelta;
				return absoluteOffset - startOffset;
			}

			leafIndex--;

			if (leafIndex < 0) {
				return -1;
			}

			totalDelta += searchStartOffset;
			searchStartOffset = leaf.length();
		}
	}

	public getLinesContent(): string[] {
		let result: string[] = new Array<string>(this.getLineCount());
		let resultIndex = 0;

		let currentLine = '';
		for (let leafIndex = 0, leafsCount = this._leafs.length; leafIndex < leafsCount; leafIndex++) {
			const leaf = this._leafs[leafIndex];
			const leafNewLineCount = leaf.newLineCount();

			if (leafNewLineCount === 0) {
				// special case => push entire leaf text
				currentLine += leaf.text;
				continue;
			}

			let leafSubstrOffset = 0;
			for (let newLineIndex = 0; newLineIndex < leafNewLineCount; newLineIndex++) {
				const newLineStart = leaf.lineStartFor(newLineIndex);
				currentLine += leaf.substr(leafSubstrOffset, newLineStart - leafSubstrOffset - this._eolLength);
				result[resultIndex++] = currentLine;

				currentLine = '';
				leafSubstrOffset = newLineStart;
			}
			currentLine += leaf.substr(leafSubstrOffset, leaf.length());
		}
		result[resultIndex++] = currentLine;

		return result;
	}

	public extractString(start: BufferCursor, len: number): string {
		if (!(start.offset + len <= this._nodes.length[1])) {
			throw new Error(`assertion violation`);
		}

		let innerLeafOffset = start.offset - start.leafStartOffset;
		let leafIndex = start.leafIndex;
		let res = '';
		while (len > 0) {
			const leaf = this._leafs[leafIndex];
			const cnt = Math.min(len, leaf.length() - innerLeafOffset);
			res += leaf.substr(innerLeafOffset, cnt);

			len -= cnt;
			innerLeafOffset = 0;

			if (len === 0) {
				break;
			}

			leafIndex++;
		}
		return res;
	}

	private _getOffsetAt(lineNumber: number, column: number, result: BufferCursor): boolean {
		const lineStart = BufferCursorPool.take();

		if (!this._findLineStart(lineNumber, lineStart)) {
			BufferCursorPool.put(lineStart);
			return false;
		}

		const startOffset = lineStart.offset + column - 1;
		if (!this._findOffsetCloseAfter(startOffset, lineStart, result)) {
			BufferCursorPool.put(lineStart);
			return false;
		}

		BufferCursorPool.put(lineStart);
		return true;
	}

	public convertPositionToOffset(lineNumber: number, column: number): number {
		const r = BufferCursorPool.take();

		if (!this._findLineStart(lineNumber, r)) {
			BufferCursorPool.put(r);
			throw new Error(`Position not found`);
		}

		const result = r.offset + column - 1;

		BufferCursorPool.put(r);
		return result;
	}

	/**
	 * returns `lineNumber`
	 */
	private _findLineStartBeforeOffsetInLeaf(offset: number, leafIndex: number, leafStartOffset: number, leafStartNewLineCount: number, result: BufferCursor): number {
		const leaf = this._leafs[leafIndex];
		const lineStartIndex = leaf.findLineStartBeforeOffset(offset - leafStartOffset);
		const lineStartOffset = leafStartOffset + leaf.lineStartFor(lineStartIndex);

		result.set(lineStartOffset, leafIndex, leafStartOffset, leafStartNewLineCount);
		return leafStartNewLineCount + lineStartIndex + 2;
	}

	/**
	 * returns `lineNumber`.
	 */
	private _findLineStartBeforeOffset(offset: number, location: BufferCursor, result: BufferCursor): number {

		let leafIndex = location.leafIndex;
		let leafStartOffset = location.leafStartOffset;
		let leafStartNewLineCount = location.leafStartNewLineCount;
		while (true) {
			const leaf = this._leafs[leafIndex];

			if (leaf.newLineCount() >= 1 && leaf.lineStartFor(0) + leafStartOffset <= offset) {
				// must be in this leaf
				return this._findLineStartBeforeOffsetInLeaf(offset, leafIndex, leafStartOffset, leafStartNewLineCount, result);
			}

			// continue looking in previous leaf
			leafIndex--;

			if (leafIndex < 0) {
				result.set(0, 0, 0, 0);
				return 1;
			}

			leafStartOffset -= this._leafs[leafIndex].length();
			leafStartNewLineCount -= this._leafs[leafIndex].newLineCount();
		}
	}

	public convertOffsetToPosition(offset: number): Position {
		const r = BufferCursorPool.take();
		const lineStart = BufferCursorPool.take();

		if (!this._findOffset(offset, r)) {
			BufferCursorPool.put(r);
			BufferCursorPool.put(lineStart);
			throw new Error(`Offset not found`);
		}

		const lineNumber = this._findLineStartBeforeOffset(offset, r, lineStart);
		const column = offset - lineStart.offset + 1;

		BufferCursorPool.put(r);
		BufferCursorPool.put(lineStart);

		return new Position(lineNumber, column);
	}

	public convertOffsetLenToRange(offset: number, len: number): Range {
		const r = BufferCursorPool.take();
		const lineStart = BufferCursorPool.take();

		if (!this._findOffset(offset, r)) {
			BufferCursorPool.put(r);
			BufferCursorPool.put(lineStart);
			throw new Error(`Offset not found`);
		}
		const startLineNumber = this._findLineStartBeforeOffset(offset, r, lineStart);
		const startColumn = offset - lineStart.offset + 1;

		if (!this._findOffset(offset + len, r)) {
			BufferCursorPool.put(r);
			BufferCursorPool.put(lineStart);
			throw new Error(`Offset not found`);
		}
		const endLineNumber = this._findLineStartBeforeOffset(offset + len, r, lineStart);
		const endColumn = offset + len - lineStart.offset + 1;

		BufferCursorPool.put(r);
		BufferCursorPool.put(lineStart);

		return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
	}

	public getValueInRange(range: Range): string {
		const start = BufferCursorPool.take();

		if (!this._getOffsetAt(range.startLineNumber, range.startColumn, start)) {
			BufferCursorPool.put(start);
			throw new Error(`Line not found`);
		}

		const endOffset = this.convertPositionToOffset(range.endLineNumber, range.endColumn);
		const result = this.extractString(start, endOffset - start.offset);

		BufferCursorPool.put(start);
		return result;
	}

	public createSnapshot(BOM: string): ITextSnapshot {
		return new BufferSnapshot(this._leafs, BOM);
	}

	public getValueLengthInRange(range: Range): number {
		const startOffset = this.convertPositionToOffset(range.startLineNumber, range.startColumn);
		const endOffset = this.convertPositionToOffset(range.endLineNumber, range.endColumn);
		return endOffset - startOffset;
	}

	//#region Editing

	private _mergeAdjacentEdits(edits: OffsetLenEdit[]): OffsetLenEdit[] {
		// Check if we must merge adjacent edits
		let merged: OffsetLenEdit[] = [], mergedLength = 0;
		let prev = edits[0];
		for (let i = 1, len = edits.length; i < len; i++) {
			const curr = edits[i];
			if (prev.offset + prev.length === curr.offset) {
				// merge into `prev`
				prev.length = prev.length + curr.length;
				prev.text = prev.text + curr.text;
			} else {
				merged[mergedLength++] = prev;
				prev = curr;
			}
		}
		merged[mergedLength++] = prev;

		return merged;
	}

	private _resolveEdits(edits: OffsetLenEdit[]): InternalOffsetLenEdit[] {
		edits = this._mergeAdjacentEdits(edits);

		let result: InternalOffsetLenEdit[] = [];
		let tmp = new BufferCursor(0, 0, 0, 0);
		let tmp2 = new BufferCursor(0, 0, 0, 0);
		for (let i = 0, len = edits.length; i < len; i++) {
			const edit = edits[i];

			let text = edit.text;

			this._findOffset(edit.offset, tmp);
			let startLeafIndex = tmp.leafIndex;
			let startInnerOffset = tmp.offset - tmp.leafStartOffset;
			if (startInnerOffset > 0) {
				const startLeaf = this._leafs[startLeafIndex];
				const charBefore = startLeaf.charCodeAt(startInnerOffset - 1);
				if (charBefore === CharCode.CarriageReturn) {
					// include the replacement of \r in the edit
					text = '\r' + text;

					this._findOffsetCloseAfter(edit.offset - 1, tmp, tmp2);
					startLeafIndex = tmp2.leafIndex;
					startInnerOffset = tmp2.offset - tmp2.leafStartOffset;
					// this._findOffset(edit.offset - 1, tmp);
					// startLeafIndex = tmp.leafIndex;
					// startInnerOffset = tmp.offset - tmp.leafStartOffset;
				}
			}

			this._findOffset(edit.offset + edit.length, tmp);
			let endLeafIndex = tmp.leafIndex;
			let endInnerOffset = tmp.offset - tmp.leafStartOffset;
			const endLeaf = this._leafs[endLeafIndex];
			if (endInnerOffset < endLeaf.length()) {
				const charAfter = endLeaf.charCodeAt(endInnerOffset);
				if (charAfter === CharCode.LineFeed) {
					// include the replacement of \n in the edit
					text = text + '\n';

					this._findOffsetCloseAfter(edit.offset + edit.length + 1, tmp, tmp2);
					endLeafIndex = tmp2.leafIndex;
					endInnerOffset = tmp2.offset - tmp2.leafStartOffset;
					// this._findOffset(edit.offset + edit.length + 1, tmp);
					// endLeafIndex = tmp.leafIndex;
					// endInnerOffset = tmp.offset - tmp.leafStartOffset;
				}
			}

			result[i] = new InternalOffsetLenEdit(
				startLeafIndex, startInnerOffset,
				endLeafIndex, endInnerOffset,
				text
			);
		}

		return result;
	}

	private _pushLeafReplacement(startLeafIndex: number, endLeafIndex: number, replacements: LeafReplacement[]): LeafReplacement {
		const res = new LeafReplacement(startLeafIndex, endLeafIndex, []);
		replacements.push(res);
		return res;
	}

	private _flushLeafEdits(accumulatedLeafIndex: number, accumulatedLeafEdits: LeafOffsetLenEdit[], replacements: LeafReplacement[]): void {
		if (accumulatedLeafEdits.length > 0) {
			const rep = this._pushLeafReplacement(accumulatedLeafIndex, accumulatedLeafIndex, replacements);
			BufferPiece.replaceOffsetLen(this._leafs[accumulatedLeafIndex], accumulatedLeafEdits, this._idealLeafLength, this._maxLeafLength, rep.replacements);
		}
		accumulatedLeafEdits.length = 0;
	}

	private _pushLeafEdits(start: number, length: number, text: string, accumulatedLeafEdits: LeafOffsetLenEdit[]): void {
		if (length !== 0 || text.length !== 0) {
			accumulatedLeafEdits.push(new LeafOffsetLenEdit(start, length, text));
		}
	}

	private _appendLeaf(leaf: BufferPiece, leafs: BufferPiece[], prevLeaf: BufferPiece): BufferPiece {
		if (prevLeaf === null) {
			leafs.push(leaf);
			prevLeaf = leaf;
			return prevLeaf;
		}

		let prevLeafLength = prevLeaf.length();
		let currLeafLength = leaf.length();

		if ((prevLeafLength < this._minLeafLength || currLeafLength < this._minLeafLength) && prevLeafLength + currLeafLength <= this._maxLeafLength) {
			const joinedLeaf = BufferPiece.join(prevLeaf, leaf);
			leafs[leafs.length - 1] = joinedLeaf;
			prevLeaf = joinedLeaf;
			return prevLeaf;
		}

		const lastChar = prevLeaf.charCodeAt(prevLeafLength - 1);
		const firstChar = leaf.charCodeAt(0);

		if (
			(lastChar >= 0xd800 && lastChar <= 0xdbff) || (lastChar === CharCode.CarriageReturn && firstChar === CharCode.LineFeed)
		) {
			const modifiedPrevLeaf = BufferPiece.deleteLastChar(prevLeaf);
			leafs[leafs.length - 1] = modifiedPrevLeaf;

			const modifiedLeaf = BufferPiece.insertFirstChar(leaf, lastChar);
			leaf = modifiedLeaf;
		}

		leafs.push(leaf);
		prevLeaf = leaf;
		return prevLeaf;
	}

	private static _compareEdits(a: OffsetLenEdit, b: OffsetLenEdit): number {
		if (a.offset === b.offset) {
			if (a.length === b.length) {
				return (a.initialIndex - b.initialIndex);
			}
			return (a.length - b.length);
		}
		return a.offset - b.offset;
	}

	public replaceOffsetLen(_edits: OffsetLenEdit[]): void {
		_edits.sort(Buffer._compareEdits);

		const initialLeafLength = this._leafs.length;
		const edits = this._resolveEdits(_edits);

		let accumulatedLeafIndex = 0;
		let accumulatedLeafEdits: LeafOffsetLenEdit[] = [];
		let replacements: LeafReplacement[] = [];

		for (let i = 0, len = edits.length; i < len; i++) {
			const edit = edits[i];

			const startLeafIndex = edit.startLeafIndex;
			const endLeafIndex = edit.endLeafIndex;

			if (startLeafIndex !== accumulatedLeafIndex) {
				this._flushLeafEdits(accumulatedLeafIndex, accumulatedLeafEdits, replacements);
				accumulatedLeafIndex = startLeafIndex;
			}

			const leafEditStart = edit.startInnerOffset;
			const leafEditEnd = (startLeafIndex === endLeafIndex ? edit.endInnerOffset : this._leafs[startLeafIndex].length());
			this._pushLeafEdits(leafEditStart, leafEditEnd - leafEditStart, edit.text, accumulatedLeafEdits);

			if (startLeafIndex < endLeafIndex) {
				this._flushLeafEdits(accumulatedLeafIndex, accumulatedLeafEdits, replacements);
				accumulatedLeafIndex = endLeafIndex;

				// delete leafs in the middle
				if (startLeafIndex + 1 < endLeafIndex) {
					this._pushLeafReplacement(startLeafIndex + 1, endLeafIndex - 1, replacements);
				}

				// delete on last leaf
				const leafEditStart = 0;
				const leafEditEnd = edit.endInnerOffset;
				this._pushLeafEdits(leafEditStart, leafEditEnd - leafEditStart, '', accumulatedLeafEdits);
			}
		}
		this._flushLeafEdits(accumulatedLeafIndex, accumulatedLeafEdits, replacements);

		let leafs: BufferPiece[] = [];
		let leafIndex = 0;
		let prevLeaf: BufferPiece = null;

		for (let i = 0, len = replacements.length; i < len; i++) {
			const replaceStartLeafIndex = replacements[i].startLeafIndex;
			const replaceEndLeafIndex = replacements[i].endLeafIndex;
			const innerLeafs = replacements[i].replacements;

			// add leafs to the left of this replace op.
			while (leafIndex < replaceStartLeafIndex) {
				prevLeaf = this._appendLeaf(this._leafs[leafIndex], leafs, prevLeaf);
				leafIndex++;
			}

			// delete leafs that get replaced.
			while (leafIndex <= replaceEndLeafIndex) {
				leafIndex++;
			}

			// add new leafs.
			for (let j = 0, lenJ = innerLeafs.length; j < lenJ; j++) {
				prevLeaf = this._appendLeaf(innerLeafs[j], leafs, prevLeaf);
			}
		}

		// add remaining leafs to the right of the last replacement.
		while (leafIndex < initialLeafLength) {
			prevLeaf = this._appendLeaf(this._leafs[leafIndex], leafs, prevLeaf);
			leafIndex++;
		}

		if (leafs.length === 0) {
			// don't leave behind an empty leafs array
			leafs.push(new BufferPiece(''));
		}

		this._leafs = leafs;
		this._rebuildNodes();
	}

	public setEOL(newEOL: '\r\n' | '\n'): void {
		let leafs: BufferPiece[] = [];
		for (let i = 0, len = this._leafs.length; i < len; i++) {
			leafs[i] = BufferPiece.normalizeEOL(this._leafs[i], newEOL);
		}
		this._leafs = leafs;
		this._rebuildNodes();
		this._eol = newEOL;
		this._eolLength = this._eol.length;
	}

	//#endregion

	private IS_NODE(i: number): boolean {
		return (i < this._nodesCount);
	}
	private IS_LEAF(i: number): boolean {
		return (i >= this._leafsStart && i < this._leafsEnd);
	}
	private NODE_TO_LEAF_INDEX(i: number): number {
		return (i - this._leafsStart);
	}
	// private LEAF_TO_NODE_INDEX(i: number): number {
	// 	return (i + this._leafsStart);
	// }
}

function log2(n: number): number {
	let v = 1;
	for (let pow = 1; ; pow++) {
		v = v << 1;
		if (v >= n) {
			return pow;
		}
	}
	// return -1;
}

function LEFT_CHILD(i: number): number {
	return (i << 1);
}

function RIGHT_CHILD(i: number): number {
	return (i << 1) + 1;
}
