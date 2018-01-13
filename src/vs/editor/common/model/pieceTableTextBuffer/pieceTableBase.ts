/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Position } from 'vs/editor/common/core/position';
import { PrefixSumComputer, PrefixSumIndexOfResult } from 'vs/editor/common/viewModel/prefixSumComputer';
import { IRawPTBuffer } from 'vs/editor/common/model/pieceTableTextBuffer/textSource';

export const enum NodeColor {
	Black = 0,
	Red = 1,
}

function getNodeColor(node: TreeNode) {
	return node.color;
}

function setNodeColor(node: TreeNode, color: NodeColor) {
	node.color = color;
}

function leftest(node: TreeNode): TreeNode {
	while (node.left !== SENTINEL) {
		node = node.left;
	}
	return node;
}

function righttest(node: TreeNode): TreeNode {
	while (node.right !== SENTINEL) {
		node = node.right;
	}
	return node;
}

function calculateSize(node: TreeNode): number {
	if (node === SENTINEL) {
		return 0;
	}

	return node.size_left + node.piece.length + calculateSize(node.right);
}

function calculateLF(node: TreeNode): number {
	if (node === SENTINEL) {
		return 0;
	}

	return node.lf_left + node.piece.lineFeedCnt + calculateLF(node.right);
}

function resetSentinel(): void {
	SENTINEL.parent = SENTINEL;
}

const lfRegex = new RegExp(/\r\n|\r|\n/g);

export function constructLineStarts(chunk: string): number[] {
	let lineStarts = [0];

	// Reset regex to search from the beginning
	lfRegex.lastIndex = 0;
	let prevMatchStartIndex = -1;
	let prevMatchLength = 0;

	let m: RegExpExecArray;
	do {
		if (prevMatchStartIndex + prevMatchLength === chunk.length) {
			// Reached the end of the line
			break;
		}

		m = lfRegex.exec(chunk);
		if (!m) {
			break;
		}

		const matchStartIndex = m.index;
		const matchLength = m[0].length;

		if (matchStartIndex === prevMatchStartIndex && matchLength === prevMatchLength) {
			// Exit early if the regex matches the same range twice
			break;
		}

		prevMatchStartIndex = matchStartIndex;
		prevMatchLength = matchLength;

		lineStarts.push(matchStartIndex + matchLength);

	} while (m);

	return lineStarts;
}

export class TreeNode {
	parent: TreeNode;
	left: TreeNode;
	right: TreeNode;
	color: NodeColor;

	// Piece
	piece: IPiece;
	size_left: number; // size of the left subtree (not inorder)
	lf_left: number; // line feeds cnt in the left subtree (not in order)

	constructor(piece: IPiece, color: NodeColor) {
		this.piece = piece;
		this.color = color;
		this.size_left = 0;
		this.lf_left = 0;
		this.parent = null;
		this.left = null;
		this.right = null;
	}

	public next(): TreeNode {
		if (this.right !== SENTINEL) {
			return leftest(this.right);
		}

		let node: TreeNode = this;

		while (node.parent !== SENTINEL) {
			if (node.parent.left === node) {
				break;
			}

			node = node.parent;
		}

		if (node.parent === SENTINEL) {
			return SENTINEL;
		} else {
			return node.parent;
		}
	}

	public prev(): TreeNode {
		if (this.left !== SENTINEL) {
			return righttest(this.left);
		}

		let node: TreeNode = this;

		while (node.parent !== SENTINEL) {
			if (node.parent.right === node) {
				break;
			}

			node = node.parent;
		}

		if (node.parent === SENTINEL) {
			return SENTINEL;
		} else {
			return node.parent;
		}
	}

	public detach(): void {
		this.parent = null;
		this.left = null;
		this.right = null;
	}
}

export const SENTINEL: TreeNode = new TreeNode(null, NodeColor.Black);
SENTINEL.parent = SENTINEL;
SENTINEL.left = SENTINEL;
SENTINEL.right = SENTINEL;
setNodeColor(SENTINEL, NodeColor.Black);

export interface NodePosition {
	/**
	 * Piece Index
	 */
	node: TreeNode;
	/**
	 * remainer in current piece.
	*/
	remainder: number;
	/**
	 * node start offset in document.
	 */
	nodeStartOffset: number;
}

export interface BufferCursor {
	/**
	 * Line number in current buffer
	 */
	line: number;
	/**
	 * Column number in current buffer
	 */
	column: number;
}

export interface IPiece {
	bufferIndex: number;
	length: number;
	lineFeedCnt: number;

	shift(offset: number);
}

export class OriginalPiece implements IPiece {
	bufferIndex: number;
	start: BufferCursor;
	end: BufferCursor;
	length: number;
	lineFeedCnt: number;

	constructor(bufferIndex: number, start: BufferCursor, end: BufferCursor, lineFeedCnt: number, length: number) {
		this.bufferIndex = bufferIndex;
		this.start = start;
		this.end = end;
		this.lineFeedCnt = lineFeedCnt;
		this.length = length;
	}

	shift(offset: number) {

	}
}

export class Piece implements IPiece {
	bufferIndex: number;
	offset: number;
	length: number; // size of current piece

	lineFeedCnt: number;
	lineStarts: PrefixSumComputer;

	constructor(bufferIndex: number, offset: number, length: number, lineFeedCnt: number, lineLengthsVal: Uint32Array) {
		this.bufferIndex = bufferIndex;
		this.offset = offset;
		this.length = length;
		this.lineFeedCnt = lineFeedCnt;
		this.lineStarts = null;

		if (lineLengthsVal) {
			let newVal = new Uint32Array(lineLengthsVal.length);
			newVal.set(lineLengthsVal);
			this.lineStarts = new PrefixSumComputer(newVal);
		}
	}

	shift(offset: number) {
		this.offset += offset;
		this.length -= offset;
	}
}

export class StringBuffer {
	buffer: string;
	lineStarts: number[];

	constructor(buffer: string, lineStarts: number[]) {
		this.buffer = buffer;
		this.lineStarts = lineStarts;
	}
}


export class PieceTableBase {
	protected _buffers: StringBuffer[]; // 0 is change buffer, others are readonly original buffer.
	protected _root: TreeNode;
	protected _lineCnt: number;

	constructor(chunks: IRawPTBuffer[]) {
		this._buffers = [
			new StringBuffer('', [0])
		];
		this._root = SENTINEL;
		this._lineCnt = 1;

		let lastNode: TreeNode = null;
		for (let i = 0, len = chunks.length; i < len; i++) {
			if (chunks[i].text.length > 0) {
				let lineStarts: number[];
				if (chunks[i].lineStarts) {
					lineStarts = chunks[i].lineStarts;
				} else {
					lineStarts = constructLineStarts(chunks[i].text);
				}

				let piece = new OriginalPiece(
					i + 1,
					{ line: 0, column: 0 },
					{ line: lineStarts.length - 1, column: chunks[i].text.length - lineStarts[lineStarts.length - 1] },
					lineStarts.length - 1,
					chunks[i].text.length
				);
				this._buffers.push(new StringBuffer(chunks[i].text, lineStarts));
				lastNode = this.rbInsertRight(lastNode, piece);
			}
		}

		this.computeLineCount();
	}

	// #region Piece Table
	insert(offset: number, value: string): void {
		// todo, validate value and offset.
		if (this._root !== SENTINEL) {
			let { node, remainder, nodeStartOffset } = this.nodeAt(offset);
			if (this.isChangeBufferNode(node)) {
				// changed buffer
				this.insertToChangedPiece(node, remainder, nodeStartOffset, offset, value);
				this.computeLineCount();
				return;
			}

			let piece = <OriginalPiece>node.piece;
			let bufferIndex = piece.bufferIndex;
			let insertPosInBuffer = this.positionInBuffer(node, remainder);

			if (nodeStartOffset === offset) {
				this.insertContentToNodeLeft(value, node);
			} else if (nodeStartOffset + node.piece.length > offset) {
				// we are inserting into the middle of a node.
				let nodesToDel = [];
				let newRightPiece = new OriginalPiece(
					piece.bufferIndex,
					insertPosInBuffer,
					piece.end,
					this.getLineFeedCnt(piece.bufferIndex, insertPosInBuffer, piece.end),
					this.offsetInBuffer(bufferIndex, piece.end) - this.offsetInBuffer(bufferIndex, insertPosInBuffer)
				);

				if (this.endWithCR(value)) {
					let headOfRight = this.nodeCharCodeAt(node, remainder);

					if (headOfRight === 10 /** \n */) {
						let newStart: BufferCursor = { line: newRightPiece.start.line + 1, column: 0 };
						newRightPiece.start = newStart;
						newRightPiece.length -= 1;
						newRightPiece.lineFeedCnt = this.getLineFeedCnt(newRightPiece.bufferIndex, newRightPiece.start, newRightPiece.end); // @todo, we can optimize
						value += '\n';
					}
				}

				// reuse node for content before insertion point.
				if (this.startWithLF(value)) {
					let tailOfLeft = this.nodeCharCodeAt(node, remainder - 1);
					if (tailOfLeft === 13 /** \r */) {
						let previousPos = this.positionInBuffer(node, remainder - 1);
						this.deleteOriginalNodeTail(node, previousPos);
						value = '\r' + value;

						if (node.piece.length === 0) {
							nodesToDel.push(node);
						}
					} else {
						this.deleteOriginalNodeTail(node, insertPosInBuffer);
					}
				} else {
					this.deleteOriginalNodeTail(node, insertPosInBuffer);
				}

				let newPiece = this.createNewPiece(value);
				if (newRightPiece.length > 0) {
					this.rbInsertRight(node, newRightPiece);
				}
				this.rbInsertRight(node, newPiece);
				this.deleteNodes(nodesToDel);
			} else {
				this.insertContentToNodeRight(value, node);
			}
		} else {
			// insert new node
			let piece = this.createNewPiece(value);
			this.rbInsertLeft(null, piece);
		}

		// todo, this is too brutal. Total line feed count should be updated the same way as lf_left.
		this.computeLineCount();
	}

	insertContentToNodeLeft(value: string, node: TreeNode) {
		// we are inserting content to the beginning of node
		let nodesToDel = [];
		if (this.endWithCR(value) && this.startWithLF(node)) {
			// move `\n` to new node.

			if (this.isChangeBufferNode(node)) {
				let piece = <Piece>node.piece;
				piece.shift(1);
				piece.lineFeedCnt--;
				piece.lineStarts.removeValues(0, 1);
			} else {
				let piece = <OriginalPiece>node.piece;
				let newStart: BufferCursor = { line: piece.start.line + 1, column: 0 };
				piece.start = newStart;
				piece.lineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, piece.start, piece.end); // @todo, we can optimize
				piece.length -= 1;
			}

			value += '\n';
			this.updateMetadata(node, -1, -1);

			if (node.piece.length === 0) {
				nodesToDel.push(node);
			}
		}

		let newPiece = this.createNewPiece(value);
		let newNode = this.rbInsertLeft(node, newPiece);
		this.validateCRLFWithPrevNode(newNode);
		this.deleteNodes(nodesToDel);
	}

	insertContentToNodeRight(value: string, node: TreeNode) {
		// we are inserting to the right of this node.
		if (this.adjustCarriageReturnFromNext(value, node)) {
			// move \n to the new node.
			value += '\n';
		}

		let newPiece = this.createNewPiece(value);
		let newNode = this.rbInsertRight(node, newPiece);
		this.validateCRLFWithPrevNode(newNode);
	}

	insertToChangedPiece(node: TreeNode, remainder: number, nodeStartOffset: number, offset: number, value: string) {
		let piece: Piece = <Piece>node.piece;
		let insertPos = piece.lineStarts.getIndexOf(remainder);

		if (piece.offset + piece.length === this._buffers[0].buffer.length && (nodeStartOffset + piece.length === offset)) {
			this.appendToNode(node, value);
		} else {
			if (nodeStartOffset === offset) {
				this.insertContentToNodeLeft(value, node);
			} else if (nodeStartOffset + node.piece.length > offset) {
				// we are inserting into the middle of a node.
				let nodesToDel = [];
				let newRightPiece = new Piece(
					piece.bufferIndex,
					piece.offset + remainder,
					piece.length - remainder,
					piece.lineFeedCnt - insertPos.index,
					piece.lineStarts.values
				);

				if (this.endWithCR(value)) {
					let headOfRight = this.nodeCharCodeAt(node, remainder);

					if (headOfRight === 10 /** \n */) {
						newRightPiece.offset++;
						newRightPiece.length--;
						newRightPiece.lineFeedCnt--;
						newRightPiece.lineStarts.removeValues(0, insertPos.index + 1);
						value += '\n';
					} else {
						this.deletePrefixSumHead(newRightPiece.lineStarts, insertPos);
					}
				} else {
					this.deletePrefixSumHead(newRightPiece.lineStarts, insertPos);
				}

				// reuse node for content before insertion point.
				if (this.startWithLF(value)) {
					let tailOfLeft = this.nodeCharCodeAt(node, remainder - 1);
					if (tailOfLeft === 13 /** \r */) {
						let previousPos = piece.lineStarts.getIndexOf(remainder - 1);
						this.deleteNodeTail(node, previousPos);
						value = '\r' + value;

						if (node.piece.length === 0) {
							nodesToDel.push(node);
						}
					} else {
						this.deleteNodeTail(node, insertPos);
					}
				} else {
					this.deleteNodeTail(node, insertPos);
				}

				let newPiece = this.createNewPiece(value);
				if (newRightPiece.length > 0) {
					this.rbInsertRight(node, newRightPiece);
				}
				this.rbInsertRight(node, newPiece);
				this.deleteNodes(nodesToDel);
			} else {
				this.insertContentToNodeRight(value, node);
			}
		}
	}

	deletePartOfChangedNode(startNode: TreeNode, offset: number, cnt: number, startPosition, endPosition) {
		let piece = <Piece>startNode.piece;
		let startSplitPos = piece.lineStarts.getIndexOf(startPosition.remainder);
		let endSplitPos = piece.lineStarts.getIndexOf(endPosition.remainder);

		if (startPosition.nodeStartOffset === offset) {
			if (cnt === piece.length) { // delete node
				let next = startNode.next();
				this.rbDelete(startNode);
				this.validateCRLFWithPrevNode(next);
				this.computeLineCount();
				return;
			}
			this.deleteNodeHead(startNode, endSplitPos);
			this.validateCRLFWithPrevNode(startNode);
			this.computeLineCount();
			return;
		}

		if (startPosition.nodeStartOffset + startNode.piece.length === offset + cnt) {
			this.deleteNodeTail(startNode, startSplitPos);
			this.validateCRLFWithNextNode(startNode);
			this.computeLineCount();
			return;
		}

		// delete content in the middle, this node will be splitted to nodes
		this.shrinkNode(startNode, startSplitPos, endSplitPos);
		this.computeLineCount();
		return;
	}

	delete(offset: number, cnt: number): void {
		if (cnt <= 0 || this._root === SENTINEL) {
			return;
		}

		let startPosition = this.nodeAt(offset);
		let endPosition = this.nodeAt(offset + cnt);
		let startNode = startPosition.node;
		let endNode = endPosition.node;
		// let startSplitPos = startNode.piece.lineStarts.getIndexOf(startPosition.remainder);

		if (startNode === endNode) {
			if (this.isChangeBufferNode(startNode)) {
				return this.deletePartOfChangedNode(startNode, offset, cnt, startPosition, endPosition);
			}

			let startSplitPosInBuffer = this.positionInBuffer(startNode, startPosition.remainder);
			let endSplitPosInBuffer = this.positionInBuffer(startNode, endPosition.remainder);

			if (startPosition.nodeStartOffset === offset) {
				if (cnt === startNode.piece.length) { // delete node
					let next = startNode.next();
					this.rbDelete(startNode);
					this.validateCRLFWithPrevNode(next);
					this.computeLineCount();
					return;
				}
				this.deleteOriginalNodeHead(startNode, endSplitPosInBuffer);
				this.validateCRLFWithPrevNode(startNode);
				this.computeLineCount();
				return;
			}

			if (startPosition.nodeStartOffset + startNode.piece.length === offset + cnt) {
				this.deleteOriginalNodeTail(startNode, startSplitPosInBuffer);
				this.validateCRLFWithNextNode(startNode);
				this.computeLineCount();
				return;
			}

			// delete content in the middle, this node will be splitted to nodes
			this.shrinkOriginalNode(startNode, startSplitPosInBuffer, endSplitPosInBuffer);
			this.computeLineCount();
			return;
		}

		let nodesToDel = [];

		if (this.isChangeBufferNode(startNode)) {
			// changed buffer
			let piece = <Piece>startNode.piece;
			let startSplitPos = piece.lineStarts.getIndexOf(startPosition.remainder);
			// update first touched node
			this.deleteNodeTail(startNode, startSplitPos);
			if (startNode.piece.length === 0) {
				nodesToDel.push(startNode);
			}
		} else {
			let startSplitPosInBuffer = this.positionInBuffer(startNode, startPosition.remainder);
			this.deleteOriginalNodeTail(startNode, startSplitPosInBuffer);
			if (startNode.piece.length === 0) {
				nodesToDel.push(startNode);
			}
		}

		// update last touched node
		if (this.isChangeBufferNode(endNode)) {
			let piece = <Piece>endNode.piece;
			let endSplitPos = piece.lineStarts.getIndexOf(endPosition.remainder);
			this.deleteNodeHead(endNode, endSplitPos);
			if (endNode.piece.length === 0) {
				nodesToDel.push(endNode);
			}
		} else {
			let endSplitPosInBuffer = this.positionInBuffer(endNode, endPosition.remainder);
			this.deleteOriginalNodeHead(endNode, endSplitPosInBuffer);
			if (endNode.piece.length === 0) {
				nodesToDel.push(endNode);
			}
		}

		// delete nodes in between
		let secondNode = startNode.next();
		for (let node = secondNode; node !== SENTINEL && node !== endNode; node = node.next()) {
			nodesToDel.push(node);
		}

		let prev = startNode.piece.length === 0 ? startNode.prev() : startNode;
		this.deleteNodes(nodesToDel);
		this.validateCRLFWithNextNode(prev);
		this.computeLineCount();
	}

	positionInBuffer(node: TreeNode, remainder: number): BufferCursor {
		let piece = <OriginalPiece>node.piece;
		let bufferIndex = node.piece.bufferIndex;
		let lineStarts = this._buffers[bufferIndex].lineStarts;

		let startOffset = lineStarts[piece.start.line] + piece.start.column;
		// let endOffset = lineStarts[piece.end.line] + piece.end.column;

		let offset = startOffset + remainder;

		// binary search offset between startOffset and endOffset
		let low = piece.start.line;
		let high = piece.end.line;

		let mid: number;
		let midStop: number;
		let midStart: number;

		while (low <= high) {
			mid = low + ((high - low) / 2) | 0;
			midStart = lineStarts[mid];

			if (mid === high) {
				break;
			}

			midStop = lineStarts[mid + 1];

			if (offset < midStart) {
				high = mid - 1;
			} else if (offset >= midStop) {
				low = mid + 1;
			} else {
				break;
			}
		}

		return {
			line: mid,
			column: offset - midStart
		};
	}

	getLineFeedCnt(bufferIndex: number, start: BufferCursor, end: BufferCursor): number {
		// we don't need to worry about start
		// abc\r|\n, or abc|\r, or abc|\n, or abc|\r\n doesn't change the fact that, there is one line break after start.

		// now let's take care of end
		// abc\r|\n, if end is in between \r and \n, we need to add line feed count by 1
		if (end.column === 0) {
			return end.line - start.line;
		}

		let lineStarts = this._buffers[bufferIndex].lineStarts;
		if (end.line === lineStarts.length - 1) {
			// it means, there is no \n after end, otherwise, there will be one more lineStart.
			return end.line - start.line;
		}

		let nextLineStartOffset = lineStarts[end.line + 1];
		let endOffset = lineStarts[end.line] + end.column;
		if (nextLineStartOffset > endOffset + 1) {
			// there are more than 1 character after end, which means it can't be \n
			return end.line - start.line;
		}
		// endOffset + 1 === nextLineStartOffset
		// character at endOffset is \n, so we check the character before first
		// if character at endOffset is \r, end.column is 0 and we can't get here.
		let previousCharOffset = endOffset - 1; // end.column > 0 so it's okay.
		let buffer = this._buffers[bufferIndex].buffer;

		if (buffer.charCodeAt(previousCharOffset) === 13) {
			return end.line - start.line + 1;
		} else {
			return end.line - start.line;
		}
	}

	offsetInBuffer(bufferIndex: number, cursor: BufferCursor): number {
		let lineStarts = this._buffers[bufferIndex].lineStarts;

		return lineStarts[cursor.line] + cursor.column;
	}

	deleteNodes(nodes: TreeNode[]): void {
		for (let i = 0; i < nodes.length; i++) {
			this.rbDelete(nodes[i]);
		}
	}

	createNewPiece(text: string): Piece {
		const startOffset = this._buffers[0].buffer.length;
		this._buffers[0].buffer += text;
		const lineLengths = this.constructLineLengths(text);
		return new Piece(0, startOffset, text.length, lineLengths.length - 1, lineLengths);
	}

	getLineRawContent(lineNumber: number): string {
		let x = this._root;

		let ret = '';
		while (x !== SENTINEL) {
			if (x.left !== SENTINEL && x.lf_left >= lineNumber - 1) {
				x = x.left;
			} else if (x.lf_left + x.piece.lineFeedCnt > lineNumber - 1) {
				let prevAccumualtedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
				let accumualtedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 1);
				let buffer = this._buffers[x.piece.bufferIndex].buffer;
				let startOffset = this.getStartOffset(x);
				return buffer.substring(startOffset + prevAccumualtedValue, startOffset + accumualtedValue);
			} else if (x.lf_left + x.piece.lineFeedCnt === lineNumber - 1) {
				let prevAccumualtedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
				let buffer = this._buffers[x.piece.bufferIndex].buffer;
				let startOffset = this.getStartOffset(x);

				ret = buffer.substring(startOffset + prevAccumualtedValue, startOffset + x.piece.length);
				break;
			} else {
				lineNumber -= x.lf_left + x.piece.lineFeedCnt;
				x = x.right;
			}
		}

		// search in order, to find the node contains end column
		x = x.next();
		while (x !== SENTINEL) {
			let buffer = this._buffers[x.piece.bufferIndex].buffer;

			if (x.piece.lineFeedCnt > 0) {
				let accumualtedValue = this.getAccumulatedValue(x, 0);
				let startOffset = this.getStartOffset(x);

				ret += buffer.substring(startOffset, startOffset + accumualtedValue);
				return ret;
			} else {
				let startOffset = this.getStartOffset(x);
				ret += buffer.substr(startOffset, x.piece.length);
			}

			x = x.next();
		}

		return ret;
	}

	computeLineCount() {
		let x = this._root;

		let ret = 1;
		while (x !== SENTINEL) {
			ret += x.lf_left + x.piece.lineFeedCnt;
			x = x.right;
		}

		this._lineCnt = ret;
	}

	// #region node operations
	getStartOffset(node: TreeNode) {
		if (this.isChangeBufferNode(node)) {
			return (<Piece>node.piece).offset;
		} else {
			return this.offsetInBuffer(node.piece.bufferIndex, (<OriginalPiece>node.piece).start);
		}
	}

	getIndexOf(node: TreeNode, accumulatedValue: number): PrefixSumIndexOfResult {
		if (this.isChangeBufferNode(node)) {
			return (<Piece>node.piece).lineStarts.getIndexOf(accumulatedValue);
		} else {
			let piece = <OriginalPiece>node.piece;
			let pos = this.positionInBuffer(node, accumulatedValue);
			let lineCnt = pos.line - piece.start.line;

			if (this.offsetInBuffer(piece.bufferIndex, piece.end) - this.offsetInBuffer(piece.bufferIndex, piece.start) === accumulatedValue) {
				// we are checking the end of this node, so a CRLF check is necessary.
				let realLineCnt = this.getLineFeedCnt(node.piece.bufferIndex, piece.start, pos);
				if (realLineCnt !== lineCnt) {
					// aha yes, CRLF
					return new PrefixSumIndexOfResult(realLineCnt, 0);
				}
			}

			return new PrefixSumIndexOfResult(lineCnt, pos.column);
		}
	}

	getAccumulatedValue(node: TreeNode, index: number) {
		if (this.isChangeBufferNode(node)) {
			return (<Piece>node.piece).lineStarts.getAccumulatedValue(index);
		} else {
			if (index < 0) {
				return 0;
			}
			let piece = <OriginalPiece>node.piece;
			let lineStarts = this._buffers[piece.bufferIndex].lineStarts;
			let expectedLineStartIndex = piece.start.line + index + 1;
			if (expectedLineStartIndex > piece.end.line) {
				return lineStarts[piece.end.line] + piece.end.column - lineStarts[piece.start.line] - piece.start.column;
			} else {
				return lineStarts[expectedLineStartIndex] - lineStarts[piece.start.line] - piece.start.column;
			}
		}
	}

	deleteOriginalNodeTail(node: TreeNode, pos: BufferCursor) {
		let piece = <OriginalPiece>node.piece;
		let originalLFCnt = piece.lineFeedCnt;
		let originalEndOffset = this.offsetInBuffer(piece.bufferIndex, piece.end);
		piece.end = pos;
		let newEndOffset = this.offsetInBuffer(piece.bufferIndex, piece.end);
		piece.lineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, piece.start, piece.end);
		let lf_delta = piece.lineFeedCnt - originalLFCnt;
		let size_delta = newEndOffset - originalEndOffset;
		piece.length += size_delta;
		this.updateMetadata(node, size_delta, lf_delta);
	}

	deleteOriginalNodeHead(node: TreeNode, pos: BufferCursor) {
		let piece = <OriginalPiece>node.piece;
		let originalLFCnt = piece.lineFeedCnt;
		let originalStartOffset = this.offsetInBuffer(piece.bufferIndex, piece.start);

		piece.start = pos;
		piece.lineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, piece.start, piece.end); // @todo, maybe we can optimize this case as we just change start.
		let newStartOffset = this.offsetInBuffer(piece.bufferIndex, piece.start);
		let lf_delta = piece.lineFeedCnt - originalLFCnt;
		let size_delta = originalStartOffset - newStartOffset;
		piece.length += size_delta;
		this.updateMetadata(node, size_delta, lf_delta);
	}

	shrinkOriginalNode(node: TreeNode, start: BufferCursor, end: BufferCursor) {
		let piece = <OriginalPiece>node.piece;
		let originalStartPos = piece.start;
		let originalEndPos = piece.end;

		// old piece
		// originalStartPos, start
		let oldLength = piece.length;
		let oldLFCnt = piece.lineFeedCnt;
		piece.end = start;
		piece.lineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, piece.start, piece.end);
		let newLength = this.offsetInBuffer(piece.bufferIndex, start) - this.offsetInBuffer(piece.bufferIndex, originalStartPos);
		let newLFCnt = piece.lineFeedCnt;
		piece.length = newLength;
		this.updateMetadata(node, newLength - oldLength, newLFCnt - oldLFCnt);

		// new right piece
		// end, originalEndPos
		let newPiece = new OriginalPiece(
			piece.bufferIndex,
			end,
			originalEndPos,
			this.getLineFeedCnt(piece.bufferIndex, end, originalEndPos),
			this.offsetInBuffer(piece.bufferIndex, originalEndPos) - this.offsetInBuffer(piece.bufferIndex, end)
		);

		let newNode = this.rbInsertRight(node, newPiece);
		this.validateCRLFWithPrevNode(newNode);
	}

	deleteNodeHead(node: TreeNode, pos?: PrefixSumIndexOfResult) {
		let piece = <Piece>node.piece;
		// it's okay to delete CR in CRLF.
		let cnt = piece.lineStarts.getAccumulatedValue(pos.index - 1) + pos.remainder;
		piece.length -= cnt;
		piece.offset += cnt;
		piece.lineFeedCnt -= pos.index;
		this.deletePrefixSumHead(piece.lineStarts, pos);
		this.updateMetadata(node, -cnt, -pos.index);
	}

	deleteNodeTail(node: TreeNode, start: PrefixSumIndexOfResult) {
		let piece = <Piece>node.piece;
		let cnt = node.piece.length - piece.lineStarts.getAccumulatedValue(start.index - 1) - start.remainder;
		let hitCRLF = this.hitTestCRLF(node, piece.lineStarts.getAccumulatedValue(start.index - 1) + start.remainder, start);
		node.piece.length -= cnt;
		let lf_delta = start.index - node.piece.lineFeedCnt;
		node.piece.lineFeedCnt = start.index;
		this.deletePrefixSumTail(piece.lineStarts, start);

		if (hitCRLF) {
			node.piece.lineFeedCnt += 1;
			lf_delta += 1;
			piece.lineStarts.insertValues(piece.lineStarts.values.length, new Uint32Array(1) /*[0]*/);
		}

		this.updateMetadata(node, -cnt, lf_delta);
	}

	// remove start-end from node.
	shrinkNode(node: TreeNode, start: PrefixSumIndexOfResult, end?: PrefixSumIndexOfResult) {
		let piece = <Piece>node.piece;
		// read operation first
		let oldLineLengthsVal = piece.lineStarts.values;
		let offset = piece.lineStarts.getAccumulatedValue(start.index - 1) + start.remainder;
		let endOffset = piece.lineStarts.getAccumulatedValue(end.index - 1) + end.remainder;

		// write.
		let startHitCRLF = this.hitTestCRLF(node, offset, start);
		let nodeOldLength = piece.length;
		piece.length = offset;
		let lf_delta = start.index - piece.lineFeedCnt;
		piece.lineFeedCnt = start.index;
		piece.lineStarts = new PrefixSumComputer(oldLineLengthsVal.slice(0, start.index + 1));
		piece.lineStarts.changeValue(start.index, start.remainder);

		if (startHitCRLF) {
			node.piece.lineFeedCnt += 1;
			lf_delta += 1;
			piece.lineStarts.insertValues(piece.lineStarts.values.length, new Uint32Array(1) /*[0]*/);
		}
		this.updateMetadata(node, offset - nodeOldLength, lf_delta);

		let newPieceLength = nodeOldLength - endOffset;
		if (newPieceLength <= 0) {
			return;
		}

		let newPiece: Piece = new Piece(
			node.piece.bufferIndex,
			endOffset + piece.offset,
			newPieceLength,
			oldLineLengthsVal.length - end.index - 1,
			oldLineLengthsVal.slice(end.index)
		);
		newPiece.lineStarts.changeValue(0, newPiece.lineStarts.values[0] - end.remainder);

		let newNode = this.rbInsertRight(node, newPiece);
		this.validateCRLFWithPrevNode(newNode);
	}

	appendToNode(node: TreeNode, value: string): void {
		if (this.adjustCarriageReturnFromNext(value, node)) {
			value += '\n';
		}

		let hitCRLF = this.startWithLF(value) && this.endWithCR(node);
		this._buffers[0].buffer += value;
		node.piece.length += value.length;
		const lineLengths = this.constructLineLengths(value);
		let lineFeedCount = lineLengths.length - 1;

		let lf_delta = lineFeedCount;
		let piece = <Piece>node.piece;
		if (hitCRLF) {
			node.piece.lineFeedCnt += lineFeedCount - 1;
			lf_delta--;
			let lineStarts = piece.lineStarts;
			lineStarts.removeValues(lineStarts.values.length - 1, 1);
			lineStarts.changeValue(lineStarts.values.length - 1, lineStarts.values[lineStarts.values.length - 1] + 1);
			lineStarts.insertValues(lineStarts.values.length, lineLengths.slice(1));
		} else {
			piece.lineFeedCnt += lineFeedCount;
			let lineStarts = piece.lineStarts;
			lineStarts.changeValue(lineStarts.values.length - 1, lineStarts.values[lineStarts.values.length - 1] + lineLengths[0]);
			lineStarts.insertValues(lineStarts.values.length, lineLengths.slice(1));
		}

		this.updateMetadata(node, value.length, lf_delta);
	}

	nodeAt(offset: number): NodePosition {
		let x = this._root;
		let nodeStartOffset = 0;

		while (x !== SENTINEL) {
			if (x.size_left > offset) {
				x = x.left;
			} else if (x.size_left + x.piece.length >= offset) {
				nodeStartOffset += x.size_left;
				return {
					node: x,
					remainder: offset - x.size_left,
					nodeStartOffset
				};
			} else {
				offset -= x.size_left + x.piece.length;
				nodeStartOffset += x.size_left + x.piece.length;
				x = x.right;
			}
		}

		return null;
	}

	nodeAt2(position: Position): NodePosition {
		let x = this._root;
		let lineNumber = position.lineNumber;
		let column = position.column;
		let nodeStartOffset = 0;

		while (x !== SENTINEL) {
			if (x.left !== SENTINEL && x.lf_left >= lineNumber - 1) {
				x = x.left;
			} else if (x.lf_left + x.piece.lineFeedCnt > lineNumber - 1) {
				let prevAccumualtedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
				let accumualtedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 1);
				nodeStartOffset += x.size_left;

				return {
					node: x,
					remainder: Math.min(prevAccumualtedValue + column - 1, accumualtedValue),
					nodeStartOffset
				};
			} else if (x.lf_left + x.piece.lineFeedCnt === lineNumber - 1) {
				let prevAccumualtedValue = this.getAccumulatedValue(x, lineNumber - x.lf_left - 2);
				if (prevAccumualtedValue + column - 1 <= x.piece.length) {
					return {
						node: x,
						remainder: prevAccumualtedValue + column - 1,
						nodeStartOffset
					};
				} else {
					column -= x.piece.length - prevAccumualtedValue;
					break;
				}
			} else {
				lineNumber -= x.lf_left + x.piece.lineFeedCnt;
				nodeStartOffset += x.size_left + x.piece.length;
				x = x.right;
			}
		}

		// search in order, to find the node contains position.column
		x = x.next();
		while (x !== SENTINEL) {

			if (x.piece.lineFeedCnt > 0) {
				let accumualtedValue = this.getAccumulatedValue(x, 0);
				let nodeStartOffset = this.offsetOfNode(x);
				return {
					node: x,
					remainder: Math.min(column - 1, accumualtedValue),
					nodeStartOffset
				};
			} else {
				if (x.piece.length >= column - 1) {
					let nodeStartOffset = this.offsetOfNode(x);
					return {
						node: x,
						remainder: column - 1,
						nodeStartOffset
					};
				} else {
					column -= x.piece.length;
				}
			}

			x = x.next();
		}

		return null;
	}

	nodeCharCodeAt(node: TreeNode, offset: number): number {
		if (node.piece.lineFeedCnt < 1) {
			return -1;
		}
		let buffer = this._buffers[node.piece.bufferIndex];

		if (this.isChangeBufferNode(node)) {
			let piece = <Piece>node.piece;
			return buffer.buffer.charCodeAt(piece.offset + offset);
		} else {
			let piece = <OriginalPiece>node.piece;
			let newOffset = this.offsetInBuffer(piece.bufferIndex, piece.start) + offset;
			return buffer.buffer.charCodeAt(newOffset);
		}
	}

	private isChangeBufferNode(node: TreeNode) {
		return node.piece.bufferIndex === 0;
	}

	offsetOfNode(node: TreeNode): number {
		if (!node) {
			return 0;
		}
		let pos = node.size_left;
		while (node !== this._root) {
			if (node.parent.right === node) {
				pos += node.parent.size_left + node.parent.piece.length;
			}

			node = node.parent;
		}

		return pos;
	}

	getNodeContent(node: TreeNode): string {
		let buffer = this._buffers[node.piece.bufferIndex];
		if (this.isChangeBufferNode(node)) {
			let piece = <Piece>node.piece;
			let currentContent = buffer.buffer.substr(piece.offset, node.piece.length);
			return currentContent;
		} else {
			let piece = <OriginalPiece>node.piece;
			let startOffset = this.offsetInBuffer(piece.bufferIndex, piece.start);
			let endOffset = this.offsetInBuffer(piece.bufferIndex, piece.end);
			return buffer.buffer.substring(startOffset, endOffset);
		}

	}

	deletePrefixSumTail(prefixSum: PrefixSumComputer, position: PrefixSumIndexOfResult): void {
		prefixSum.removeValues(position.index + 1, prefixSum.values.length - position.index - 1);
		prefixSum.changeValue(position.index, position.remainder);
	}

	deletePrefixSumHead(prefixSum: PrefixSumComputer, position: PrefixSumIndexOfResult): void {
		prefixSum.changeValue(position.index, prefixSum.values[position.index] - position.remainder);
		if (position.index > 0) {
			prefixSum.removeValues(0, position.index);
		}
	}

	// #endregion

	// #region CRLF
	startWithLF(val: string | TreeNode): boolean {
		if (typeof val === 'string') {
			return val.charCodeAt(0) === 10;
		}

		if (val === SENTINEL || val.piece.lineFeedCnt === 0) {
			return false;
		}

		if (this.isChangeBufferNode(val)) {
			let piece = <Piece>val.piece;

			if (piece.lineStarts.getAccumulatedValue(0) !== 1 /* if it's \n, the first line is 1 char */) {
				return false;
			}

			// charCodeAt is expensive when the buffer is large.
			return this.nodeCharCodeAt(val, 0) === 10;
		} else {
			let piece = <OriginalPiece>val.piece;
			let lineStarts = this._buffers[piece.bufferIndex].lineStarts;
			let line = piece.start.line;
			let startOffset = lineStarts[line] + piece.start.column;
			if (line === lineStarts.length - 1) {
				// last line, so there is no line feed at the end of this line
				return false;
			}
			let nextLineOffset = lineStarts[line + 1];
			if (nextLineOffset > startOffset + 1) {
				return false;
			}
			return this._buffers[piece.bufferIndex].buffer.charCodeAt(startOffset) === 10;
		}
	}

	endWithCR(val: string | TreeNode): boolean {
		if (typeof val === 'string') {
			return val.charCodeAt(val.length - 1) === 13;
		}

		if (val === SENTINEL || val.piece.lineFeedCnt === 0) {
			return false;
		}

		return this.nodeCharCodeAt(val, val.piece.length - 1) === 13;
	}

	hitTestCRLF(node: TreeNode, offset: number, position: PrefixSumIndexOfResult) {
		if (node.piece.lineFeedCnt < 1) {
			return false;
		}

		let piece = <Piece>node.piece;
		let currentLineLen = piece.lineStarts.getAccumulatedValue(position.index);
		if (offset === currentLineLen - 1) {
			// charCodeAt becomes slow (single or even two digits ms) when the changed buffer is long
			return this.nodeCharCodeAt(node, offset - 1) === 13/* \r */ && this.nodeCharCodeAt(node, offset) === 10 /* \n */;
		}
		return false;
	}

	validateCRLFWithPrevNode(nextNode: TreeNode) {
		if (this.startWithLF(nextNode)) {
			let node = nextNode.prev();
			if (this.endWithCR(node)) {
				this.fixCRLF(node, nextNode);
			}
		}
	}

	validateCRLFWithNextNode(node: TreeNode) {
		if (this.endWithCR(node)) {
			let nextNode = node.next();
			if (this.startWithLF(nextNode)) {
				this.fixCRLF(node, nextNode);
			}
		}
	}

	fixCRLF(prev: TreeNode, next: TreeNode) {
		let nodesToDel = [];
		// update node
		if (this.isChangeBufferNode(prev)) {
			prev.piece.length -= 1;
			prev.piece.lineFeedCnt -= 1;
			let lineStarts = (<Piece>prev.piece).lineStarts;
			// lineStarts.values.length >= 2 due to a `\r`
			lineStarts.removeValues(lineStarts.values.length - 1, 1);
			lineStarts.changeValue(lineStarts.values.length - 1, lineStarts.values[lineStarts.values.length - 1] - 1);
		} else {
			// prev ends with \r
			let piece = <OriginalPiece>prev.piece;
			let lineStarts = this._buffers[piece.bufferIndex].lineStarts;
			if (piece.end.column === 0) {
				// it means, last line ends with \r, not \r\n
				let newEnd: BufferCursor = { line: piece.end.line - 1, column: lineStarts[piece.end.line] - lineStarts[piece.end.line - 1] - 1 };
				piece.end = newEnd;
			} else {
				// \r\n
				let newEnd: BufferCursor = { line: piece.end.line, column: piece.end.column - 1 };
				piece.end = newEnd;
			}

			piece.length -= 1;
			piece.lineFeedCnt -= 1;
		}

		this.updateMetadata(prev, - 1, -1);
		if (prev.piece.length === 0) {
			nodesToDel.push(prev);
		}

		// update nextNode
		if (this.isChangeBufferNode(next)) {
			next.piece.shift(1);
			next.piece.lineFeedCnt -= 1;
			let lineStarts = (<Piece>next.piece).lineStarts;
			lineStarts.removeValues(0, 1);
		} else {
			let piece = <OriginalPiece>next.piece;
			let newStart: BufferCursor = { line: piece.start.line + 1, column: 0 };
			piece.start = newStart;
			piece.length -= 1;
			piece.lineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, piece.start, piece.end); // @todo, we can optimize
		}

		this.updateMetadata(next, - 1, -1);
		if (next.piece.length === 0) {
			nodesToDel.push(next);
		}

		// create new piece which contains \r\n
		let piece = this.createNewPiece('\r\n');
		this.rbInsertRight(prev, piece);
		// delete empty nodes

		for (let i = 0; i < nodesToDel.length; i++) {
			this.rbDelete(nodesToDel[i]);
		}
	}

	adjustCarriageReturnFromNext(value: string, node: TreeNode): boolean {
		if (this.endWithCR(value)) {
			let nextNode = node.next();
			if (this.startWithLF(nextNode)) {
				// move `\n` forward
				value += '\n';

				if (nextNode.piece.length === 1) {
					this.rbDelete(nextNode);
				} else {
					if (this.isChangeBufferNode(nextNode)) {
						nextNode.piece.shift(1);
						nextNode.piece.lineFeedCnt -= 1;
						(<Piece>nextNode.piece).lineStarts.removeValues(0, 1); // remove the first line, which is empty.
					} else {
						let piece = <OriginalPiece>nextNode.piece;
						let newStart: BufferCursor = { line: piece.start.line + 1, column: 0 };
						piece.start = newStart;
						piece.length -= 1;
						piece.lineFeedCnt = this.getLineFeedCnt(piece.bufferIndex, piece.start, piece.end); // @todo, we can optimize
					}
					this.updateMetadata(nextNode, -1, -1);
				}
				return true;
			}
		}

		return false;
	}

	// #endregion

	// #endregion

	// #region Red Black Tree

	leftRotate(x: TreeNode) {
		let y = x.right;

		// fix size_left
		y.size_left += x.size_left + (x.piece ? x.piece.length : 0);
		y.lf_left += x.lf_left + (x.piece ? x.piece.lineFeedCnt : 0);
		x.right = y.left;

		if (y.left !== SENTINEL) {
			y.left.parent = x;
		}
		y.parent = x.parent;
		if (x.parent === SENTINEL) {
			this._root = y;
		} else if (x.parent.left === x) {
			x.parent.left = y;
		} else {
			x.parent.right = y;
		}
		y.left = x;
		x.parent = y;
	}

	rightRotate(y: TreeNode) {
		let x = y.left;
		y.left = x.right;
		if (x.right !== SENTINEL) {
			x.right.parent = y;
		}
		x.parent = y.parent;

		// fix size_left
		y.size_left -= x.size_left + (x.piece ? x.piece.length : 0);
		y.lf_left -= x.lf_left + (x.piece ? x.piece.lineFeedCnt : 0);

		if (y.parent === SENTINEL) {
			this._root = x;
		} else if (y === y.parent.right) {
			y.parent.right = x;
		} else {
			y.parent.left = x;
		}

		x.right = y;
		y.parent = x;
	}

	/**
	 *      node              node
	 *     /  \              /  \
	 *    a   b    <----   a    b
	 *                         /
	 *                        z
	 */
	rbInsertRight(node: TreeNode, p: IPiece): TreeNode {
		let z = new TreeNode(p, NodeColor.Red);
		z.left = SENTINEL;
		z.right = SENTINEL;
		z.parent = SENTINEL;
		z.size_left = 0;
		z.lf_left = 0;

		let x = this._root;
		if (x === SENTINEL) {
			this._root = z;
			setNodeColor(z, NodeColor.Black);
		} else if (node.right === SENTINEL) {
			node.right = z;
			z.parent = node;
		} else {
			let nextNode = leftest(node.right);
			nextNode.left = z;
			z.parent = nextNode;
		}

		this.fixInsert(z);
		return z;
	}

	/**
	 *      node              node
	 *     /  \              /  \
	 *    a   b     ---->   a    b
	 *                       \
	 *                        z
	 */
	rbInsertLeft(node: TreeNode, p: Piece): TreeNode {
		let z = new TreeNode(p, NodeColor.Red);
		z.left = SENTINEL;
		z.right = SENTINEL;
		z.parent = SENTINEL;
		z.size_left = 0;
		z.lf_left = 0;

		let x = this._root;
		if (x === SENTINEL) {
			this._root = z;
			setNodeColor(z, NodeColor.Black);
		} else if (node.left === SENTINEL) {
			node.left = z;
			z.parent = node;
		} else {
			let prevNode = righttest(node.left); // a
			prevNode.right = z;
			z.parent = prevNode;
		}

		this.fixInsert(z);
		return z;
	}

	rbDelete(z: TreeNode) {
		let x: TreeNode;
		let y: TreeNode;

		if (z.left === SENTINEL) {
			y = z;
			x = y.right;
		} else if (z.right === SENTINEL) {
			y = z;
			x = y.left;
		} else {
			y = leftest(z.right);
			x = y.right;
		}

		if (y === this._root) {
			this._root = x;

			// if x is null, we are removing the only node
			setNodeColor(x, NodeColor.Black);

			z.detach();
			resetSentinel();
			this._root.parent = SENTINEL;

			return;
		}

		let yWasRed = (getNodeColor(y) === NodeColor.Red);

		if (y === y.parent.left) {
			y.parent.left = x;
		} else {
			y.parent.right = x;
		}

		if (y === z) {
			x.parent = y.parent;
			this.recomputeMetadata(x);
		} else {
			if (y.parent === z) {
				x.parent = y;
			} else {
				x.parent = y.parent;
			}

			// as we make changes to x's hierarchy, update size_left of subtree first
			this.recomputeMetadata(x);

			y.left = z.left;
			y.right = z.right;
			y.parent = z.parent;
			setNodeColor(y, getNodeColor(z));

			if (z === this._root) {
				this._root = y;
			} else {
				if (z === z.parent.left) {
					z.parent.left = y;
				} else {
					z.parent.right = y;
				}
			}

			if (y.left !== SENTINEL) {
				y.left.parent = y;
			}
			if (y.right !== SENTINEL) {
				y.right.parent = y;
			}
			// update metadata
			// we replace z with y, so in this sub tree, the length change is z.item.length
			y.size_left = z.size_left;
			y.lf_left = z.lf_left;
			this.recomputeMetadata(y);
		}

		z.detach();

		if (x.parent.left === x) {
			let newSizeLeft = calculateSize(x);
			let newLFLeft = calculateLF(x);
			if (newSizeLeft !== x.parent.size_left || newLFLeft !== x.parent.lf_left) {
				let delta = newSizeLeft - x.parent.size_left;
				let lf_delta = newLFLeft - x.parent.lf_left;
				x.parent.size_left = newSizeLeft;
				x.parent.lf_left = newLFLeft;
				this.updateMetadata(x.parent, delta, lf_delta);
			}
		}

		this.recomputeMetadata(x.parent);

		if (yWasRed) {
			resetSentinel();
			return;
		}

		// RB-DELETE-FIXUP
		let w: TreeNode;
		while (x !== this._root && getNodeColor(x) === NodeColor.Black) {
			if (x === x.parent.left) {
				w = x.parent.right;

				if (getNodeColor(w) === NodeColor.Red) {
					setNodeColor(w, NodeColor.Black);
					setNodeColor(x.parent, NodeColor.Red);
					this.leftRotate(x.parent);
					w = x.parent.right;
				}

				if (getNodeColor(w.left) === NodeColor.Black && getNodeColor(w.right) === NodeColor.Black) {
					setNodeColor(w, NodeColor.Red);
					x = x.parent;
				} else {
					if (getNodeColor(w.right) === NodeColor.Black) {
						setNodeColor(w.left, NodeColor.Black);
						setNodeColor(w, NodeColor.Red);
						this.rightRotate(w);
						w = x.parent.right;
					}

					setNodeColor(w, getNodeColor(x.parent));
					setNodeColor(x.parent, NodeColor.Black);
					setNodeColor(w.right, NodeColor.Black);
					this.leftRotate(x.parent);
					x = this._root;
				}
			} else {
				w = x.parent.left;

				if (getNodeColor(w) === NodeColor.Red) {
					setNodeColor(w, NodeColor.Black);
					setNodeColor(x.parent, NodeColor.Red);
					this.rightRotate(x.parent);
					w = x.parent.left;
				}

				if (getNodeColor(w.left) === NodeColor.Black && getNodeColor(w.right) === NodeColor.Black) {
					setNodeColor(w, NodeColor.Red);
					x = x.parent;

				} else {
					if (getNodeColor(w.left) === NodeColor.Black) {
						setNodeColor(w.right, NodeColor.Black);
						setNodeColor(w, NodeColor.Red);
						this.leftRotate(w);
						w = x.parent.left;
					}

					setNodeColor(w, getNodeColor(x.parent));
					setNodeColor(x.parent, NodeColor.Black);
					setNodeColor(w.left, NodeColor.Black);
					this.rightRotate(x.parent);
					x = this._root;
				}
			}
		}
		setNodeColor(x, NodeColor.Black);
		resetSentinel();
	}

	fixInsert(x: TreeNode) {
		this.recomputeMetadata(x);

		while (x !== this._root && getNodeColor(x.parent) === NodeColor.Red) {
			if (x.parent === x.parent.parent.left) {
				const y = x.parent.parent.right;

				if (getNodeColor(y) === NodeColor.Red) {
					setNodeColor(x.parent, NodeColor.Black);
					setNodeColor(y, NodeColor.Black);
					setNodeColor(x.parent.parent, NodeColor.Red);
					x = x.parent.parent;
				} else {
					if (x === x.parent.right) {
						x = x.parent;
						this.leftRotate(x);
					}

					setNodeColor(x.parent, NodeColor.Black);
					setNodeColor(x.parent.parent, NodeColor.Red);
					this.rightRotate(x.parent.parent);
				}
			} else {
				const y = x.parent.parent.left;

				if (getNodeColor(y) === NodeColor.Red) {
					setNodeColor(x.parent, NodeColor.Black);
					setNodeColor(y, NodeColor.Black);
					setNodeColor(x.parent.parent, NodeColor.Red);
					x = x.parent.parent;
				} else {
					if (x === x.parent.left) {
						x = x.parent;
						this.rightRotate(x);
					}
					setNodeColor(x.parent, NodeColor.Black);
					setNodeColor(x.parent.parent, NodeColor.Red);
					this.leftRotate(x.parent.parent);
				}
			}
		}

		setNodeColor(this._root, NodeColor.Black);
	}

	updateMetadata(x: TreeNode, delta: number, lineFeedCntDelta: number): void {
		// node length change or line feed count change
		while (x !== this._root && x !== SENTINEL) {
			if (x.parent.left === x) {
				x.parent.size_left += delta;
				x.parent.lf_left += lineFeedCntDelta;
			}

			x = x.parent;
		}
	}

	recomputeMetadata(x: TreeNode) {
		let delta = 0;
		let lf_delta = 0;
		if (x === this._root) {
			return;
		}

		if (delta === 0) {
			// go upwards till the node whose left subtree is changed.
			while (x !== this._root && x === x.parent.right) {
				x = x.parent;
			}

			if (x === this._root) {
				// well, it means we add a node to the end (inorder)
				return;
			}

			// x is the node whose right subtree is changed.
			x = x.parent;

			delta = calculateSize(x.left) - x.size_left;
			lf_delta = calculateLF(x.left) - x.lf_left;
			x.size_left += delta;
			x.lf_left += lf_delta;
		}

		// go upwards till root. O(logN)
		while (x !== this._root && (delta !== 0 || lf_delta !== 0)) {
			if (x.parent.left === x) {
				x.parent.size_left += delta;
				x.parent.lf_left += lf_delta;
			}

			x = x.parent;
		}
	}

	getContentOfSubTree(node: TreeNode): string {
		if (node === SENTINEL) {
			return '';
		}

		let buffer = this._buffers[node.piece.bufferIndex];
		let currentContent;
		if (this.isChangeBufferNode(node)) {
			currentContent = buffer.buffer.substr((<Piece>node.piece).offset, node.piece.length);
		} else {
			let piece = <OriginalPiece>node.piece;
			let startOffset = this.offsetInBuffer(piece.bufferIndex, piece.start);
			let endOffset = this.offsetInBuffer(piece.bufferIndex, piece.end);
			currentContent = buffer.buffer.substring(startOffset, endOffset);
		}

		return this.getContentOfSubTree(node.left) + currentContent + this.getContentOfSubTree(node.right);
	}

	constructLineLengths(chunk: string): Uint32Array {
		let lineStarts = constructLineStarts(chunk);
		const lineLengths = new Uint32Array(lineStarts.length);
		for (let i = 1; i < lineStarts.length; i++) {
			lineLengths[i - 1] = lineStarts[i] - lineStarts[i - 1];
		}

		lineLengths[lineStarts.length - 1] = chunk.length - lineStarts[lineStarts.length - 1];

		return lineLengths;
	}

	// #endregion
}
