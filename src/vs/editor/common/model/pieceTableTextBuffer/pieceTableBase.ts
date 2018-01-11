/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Position } from 'vs/editor/common/core/position';
import { PrefixSumComputer, PrefixSumIndexOfResult } from 'vs/editor/common/viewModel/prefixSumComputer';

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
	piece: Piece;
	size_left: number; // size of the left subtree (not inorder)
	lf_left: number; // line feeds cnt in the left subtree (not in order)

	constructor(piece: Piece, color: NodeColor) {
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

export interface BufferCursor {
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

export class Piece {
	isOriginalBuffer: boolean;
	offset: number;
	length: number; // size of current piece

	lineFeedCnt: number;
	lineStarts: PrefixSumComputer;

	constructor(isOriginalBuffer: boolean, offset: number, length: number, lineFeedCnt: number, lineLengthsVal: Uint32Array) {
		this.isOriginalBuffer = isOriginalBuffer;
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
}

export class PieceTableBase {
	protected _originalBuffer: string;
	protected _changeBuffer: string;
	protected _root: TreeNode;
	protected _lineCnt: number;

	constructor(originalBuffer: string, lineStarts?: number[]) {
		this._originalBuffer = originalBuffer;
		this._changeBuffer = '';
		this._root = SENTINEL;
		this._lineCnt = 1;

		if (this._originalBuffer.length > 0) {
			let lineLengths: Uint32Array;
			if (lineStarts) {
				lineLengths = new Uint32Array(lineStarts.length);
				for (let i = 1; i < lineStarts.length; i++) {
					lineLengths[i - 1] = lineStarts[i] - lineStarts[i - 1];
				}

				lineLengths[lineStarts.length - 1] = this._originalBuffer.length - lineStarts[lineStarts.length - 1];
			} else {
				lineLengths = this.constructLineLengths(this._originalBuffer);
			}

			let piece = new Piece(true, 0, this._originalBuffer.length, lineLengths.length - 1, lineLengths);
			this.rbInsertLeft(null, piece);
			this._lineCnt = lineLengths.length;
		}
	}

	// #region Piece Table
	insert(offset: number, value: string): void {
		// todo, validate value and offset.
		if (this._root !== SENTINEL) {
			let { node, remainder, nodeStartOffset } = this.nodeAt(offset);
			let insertPos = node.piece.lineStarts.getIndexOf(remainder);

			if (!node.piece.isOriginalBuffer && (node.piece.offset + node.piece.length === this._changeBuffer.length) && (nodeStartOffset + node.piece.length === offset)) {
				// append content to this node, we don't want to keep adding node when users simply type in sequence
				this.appendToNode(node, value);
			} else {
				if (nodeStartOffset === offset) {
					// we are inserting content to the beginning of node
					let nodesToDel = [];
					if (this.endWithCR(value) && this.startWithLF(node)) {
						// move `\n` to new node.
						value += '\n';
						node.piece.offset++;
						node.piece.length--;
						node.piece.lineFeedCnt--;
						node.piece.lineStarts.removeValues(0, 1);
						this.updateMetadata(node, -1, -1);

						if (node.piece.length === 0) {
							nodesToDel.push(node);
						}
					}

					let newPiece = this.createNewPiece(value);
					let newNode = this.rbInsertLeft(node, newPiece);
					this.validateCRLFWithPrevNode(newNode);
					this.deleteNodes(nodesToDel);
				} else if (nodeStartOffset + node.piece.length > offset) {
					// we are inserting into the middle of a node.
					let nodesToDel = [];
					let newRightPiece = new Piece(
						node.piece.isOriginalBuffer,
						node.piece.offset + remainder,
						node.piece.length - remainder,
						node.piece.lineFeedCnt - insertPos.index,
						node.piece.lineStarts.values
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
							let previousPos = node.piece.lineStarts.getIndexOf(remainder - 1);
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
					// we are inserting to the right of this node.
					if (this.adjustCarriageReturnFromNext(value, node)) {
						// move \n to the new node.
						value += '\n';
					}

					let newPiece = this.createNewPiece(value);
					let newNode = this.rbInsertRight(node, newPiece);
					this.validateCRLFWithPrevNode(newNode);
				}
			}
		} else {
			// insert new node
			let piece = this.createNewPiece(value);
			this.rbInsertLeft(null, piece);
		}

		// todo, this is too brutal. Total line feed count should be updated the same way as lf_left.
		this.computeLineCount();
	}

	delete(offset: number, cnt: number): void {
		if (cnt <= 0 || this._root === SENTINEL) {
			return;
		}

		let startPosition = this.nodeAt(offset);
		let endPosition = this.nodeAt(offset + cnt);
		let startNode = startPosition.node;
		let endNode = endPosition.node;
		let startSplitPos = startNode.piece.lineStarts.getIndexOf(startPosition.remainder);

		if (startNode === endNode) {
			// deletion falls into one node.
			let endSplitPos = startNode.piece.lineStarts.getIndexOf(endPosition.remainder);

			if (startPosition.nodeStartOffset === offset) {
				if (cnt === startNode.piece.length) { // delete node
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

		let nodesToDel = [];
		// update first touched node
		this.deleteNodeTail(startNode, startSplitPos);
		if (startNode.piece.length === 0) {
			nodesToDel.push(startNode);
		}

		// update last touched node
		let endSplitPos = endNode.piece.lineStarts.getIndexOf(endPosition.remainder);
		this.deleteNodeHead(endNode, endSplitPos);
		if (endNode.piece.length === 0) {
			nodesToDel.push(endNode);
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

	deleteNodes(nodes: TreeNode[]): void {
		for (let i = 0; i < nodes.length; i++) {
			this.rbDelete(nodes[i]);
		}
	}

	createNewPiece(text: string): Piece {
		const startOffset = this._changeBuffer.length;
		this._changeBuffer += text;
		const lineLengths = this.constructLineLengths(text);
		return new Piece(false, startOffset, text.length, lineLengths.length - 1, lineLengths);
	}

	getLineRawContent(lineNumber: number): string {
		let x = this._root;

		let ret = '';
		while (x !== SENTINEL) {
			if (x.left !== SENTINEL && x.lf_left >= lineNumber - 1) {
				x = x.left;
			} else if (x.lf_left + x.piece.lineFeedCnt > lineNumber - 1) {
				let prevAccumualtedValue = x.piece.lineStarts.getAccumulatedValue(lineNumber - x.lf_left - 2);
				let accumualtedValue = x.piece.lineStarts.getAccumulatedValue(lineNumber - x.lf_left - 1);
				let buffer = x.piece.isOriginalBuffer ? this._originalBuffer : this._changeBuffer;

				return buffer.substring(x.piece.offset + prevAccumualtedValue, x.piece.offset + accumualtedValue);
			} else if (x.lf_left + x.piece.lineFeedCnt === lineNumber - 1) {
				let prevAccumualtedValue = x.piece.lineStarts.getAccumulatedValue(lineNumber - x.lf_left - 2);
				let buffer = x.piece.isOriginalBuffer ? this._originalBuffer : this._changeBuffer;

				ret = buffer.substring(x.piece.offset + prevAccumualtedValue, x.piece.offset + x.piece.length);
				break;
			} else {
				lineNumber -= x.lf_left + x.piece.lineFeedCnt;
				x = x.right;
			}
		}

		// search in order, to find the node contains end column
		x = x.next();
		while (x !== SENTINEL) {
			let buffer = x.piece.isOriginalBuffer ? this._originalBuffer : this._changeBuffer;

			if (x.piece.lineFeedCnt > 0) {
				let accumualtedValue = x.piece.lineStarts.getAccumulatedValue(0);

				ret += buffer.substring(x.piece.offset, x.piece.offset + accumualtedValue);
				return ret;
			} else {
				ret += buffer.substr(x.piece.offset, x.piece.length);
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
	deleteNodeHead(node: TreeNode, pos?: PrefixSumIndexOfResult) {
		// it's okay to delete CR in CRLF.
		let cnt = node.piece.lineStarts.getAccumulatedValue(pos.index - 1) + pos.remainder;
		node.piece.length -= cnt;
		node.piece.offset += cnt;
		node.piece.lineFeedCnt -= pos.index;
		this.deletePrefixSumHead(node.piece.lineStarts, pos);
		this.updateMetadata(node, -cnt, -pos.index);
	}

	deleteNodeTail(node: TreeNode, start: PrefixSumIndexOfResult) {
		let cnt = node.piece.length - node.piece.lineStarts.getAccumulatedValue(start.index - 1) - start.remainder;
		let hitCRLF = this.hitTestCRLF(node, node.piece.lineStarts.getAccumulatedValue(start.index - 1) + start.remainder, start);
		node.piece.length -= cnt;
		let lf_delta = start.index - node.piece.lineFeedCnt;
		node.piece.lineFeedCnt = start.index;
		this.deletePrefixSumTail(node.piece.lineStarts, start);

		if (hitCRLF) {
			node.piece.lineFeedCnt += 1;
			lf_delta += 1;
			node.piece.lineStarts.insertValues(node.piece.lineStarts.values.length, new Uint32Array(1) /*[0]*/);
		}

		this.updateMetadata(node, -cnt, lf_delta);
	}

	// remove start-end from node.
	shrinkNode(node: TreeNode, start: PrefixSumIndexOfResult, end?: PrefixSumIndexOfResult) {
		// read operation first
		let oldLineLengthsVal = node.piece.lineStarts.values;
		let offset = node.piece.lineStarts.getAccumulatedValue(start.index - 1) + start.remainder;
		let endOffset = node.piece.lineStarts.getAccumulatedValue(end.index - 1) + end.remainder;

		// write.
		let startHitCRLF = this.hitTestCRLF(node, offset, start);
		let nodeOldLength = node.piece.length;
		node.piece.length = offset;
		let lf_delta = start.index - node.piece.lineFeedCnt;
		node.piece.lineFeedCnt = start.index;
		node.piece.lineStarts = new PrefixSumComputer(oldLineLengthsVal.slice(0, start.index + 1));
		node.piece.lineStarts.changeValue(start.index, start.remainder);

		if (startHitCRLF) {
			node.piece.lineFeedCnt += 1;
			lf_delta += 1;
			node.piece.lineStarts.insertValues(node.piece.lineStarts.values.length, new Uint32Array(1) /*[0]*/);
		}
		this.updateMetadata(node, offset - nodeOldLength, lf_delta);

		let newPieceLength = nodeOldLength - endOffset;
		if (newPieceLength <= 0) {
			return;
		}

		let newPiece: Piece = new Piece(
			node.piece.isOriginalBuffer,
			endOffset + node.piece.offset,
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
		this._changeBuffer += value;
		node.piece.length += value.length;
		const lineLengths = this.constructLineLengths(value);
		let lineFeedCount = lineLengths.length - 1;

		let lf_delta = lineFeedCount;
		if (hitCRLF) {
			node.piece.lineFeedCnt += lineFeedCount - 1;
			lf_delta--;
			let lineStarts = node.piece.lineStarts;
			lineStarts.removeValues(lineStarts.values.length - 1, 1);
			lineStarts.changeValue(lineStarts.values.length - 1, lineStarts.values[lineStarts.values.length - 1] + 1);
			lineStarts.insertValues(lineStarts.values.length, lineLengths.slice(1));
		} else {
			node.piece.lineFeedCnt += lineFeedCount;
			let lineStarts = node.piece.lineStarts;
			lineStarts.changeValue(lineStarts.values.length - 1, lineStarts.values[lineStarts.values.length - 1] + lineLengths[0]);
			lineStarts.insertValues(lineStarts.values.length, lineLengths.slice(1));
		}

		this.updateMetadata(node, value.length, lf_delta);
	}

	nodeAt(offset: number): BufferCursor {
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

	nodeAt2(position: Position): BufferCursor {
		let x = this._root;
		let lineNumber = position.lineNumber;
		let column = position.column;
		let nodeStartOffset = 0;

		while (x !== SENTINEL) {
			if (x.left !== SENTINEL && x.lf_left >= lineNumber - 1) {
				x = x.left;
			} else if (x.lf_left + x.piece.lineFeedCnt > lineNumber - 1) {
				let prevAccumualtedValue = x.piece.lineStarts.getAccumulatedValue(lineNumber - x.lf_left - 2);
				let accumualtedValue = x.piece.lineStarts.getAccumulatedValue(lineNumber - x.lf_left - 1);
				nodeStartOffset += x.size_left;

				return {
					node: x,
					remainder: Math.min(prevAccumualtedValue + column - 1, accumualtedValue),
					nodeStartOffset
				};
			} else if (x.lf_left + x.piece.lineFeedCnt === lineNumber - 1) {
				let prevAccumualtedValue = x.piece.lineStarts.getAccumulatedValue(lineNumber - x.lf_left - 2);
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
				let accumualtedValue = x.piece.lineStarts.getAccumulatedValue(0);
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
		let buffer = node.piece.isOriginalBuffer ? this._originalBuffer : this._changeBuffer;

		return buffer.charCodeAt(node.piece.offset + offset);
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
		let buffer = node.piece.isOriginalBuffer ? this._originalBuffer : this._changeBuffer;
		let currentContent = buffer.substr(node.piece.offset, node.piece.length);

		return currentContent;
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

		if (val.piece.lineStarts.getAccumulatedValue(0) !== 1 /* if it's \n, the first line is 1 char */) {
			return false;
		}

		// charCodeAt is expensive when the buffer is large.
		return this.nodeCharCodeAt(val, 0) === 10;
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

		let currentLineLen = node.piece.lineStarts.getAccumulatedValue(position.index);
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
		prev.piece.length -= 1;
		prev.piece.lineFeedCnt -= 1;
		let lineStarts = prev.piece.lineStarts;
		// lineStarts.values.length >= 2 due to a `\r`
		lineStarts.removeValues(lineStarts.values.length - 1, 1);
		lineStarts.changeValue(lineStarts.values.length - 1, lineStarts.values[lineStarts.values.length - 1] - 1);
		this.updateMetadata(prev, - 1, -1);

		if (prev.piece.length === 0) {
			nodesToDel.push(prev);
		}

		// update nextNode
		next.piece.length -= 1;
		next.piece.offset += 1;
		next.piece.lineFeedCnt -= 1;
		lineStarts = next.piece.lineStarts;
		lineStarts.removeValues(0, 1);
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
					nextNode.piece.offset += 1;
					nextNode.piece.length -= 1;
					nextNode.piece.lineFeedCnt -= 1;
					nextNode.piece.lineStarts.removeValues(0, 1); // remove the first line, which is empty.
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
	rbInsertRight(node: TreeNode, p: Piece): TreeNode {
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

		let buffer = node.piece.isOriginalBuffer ? this._originalBuffer : this._changeBuffer;
		let currentContent = buffer.substr(node.piece.offset, node.piece.length);

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
