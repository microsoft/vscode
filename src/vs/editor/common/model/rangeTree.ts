/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { ITextModel } from '../model.js';

interface TreeRange {
	startInclusive: number;
	endExclusive: number;
}
export interface RangeTreeLeafNode<T> {
	startInclusive: number;
	endExclusive: number;
	parent: RangeTreeBranchNode<T> | undefined;
	data: T;
}

interface RangeTreeBranchNode<T> {
	maxLeftStartInclusive: number;
	segmentStartRange: TreeRange;
	parent: RangeTreeBranchNode<T> | undefined;
	left: RangeTreeNode<T> | undefined;
	right: RangeTreeNode<T> | undefined;
}

type RangeTreeNode<T> = RangeTreeLeafNode<T> | RangeTreeBranchNode<T>;

function isLeaf<T>(node: RangeTreeNode<T>): node is RangeTreeLeafNode<T> {
	return (node as RangeTreeLeafNode<T>).data !== undefined;
}

export class TokenRangeTree<T> {
	private _root: RangeTreeBranchNode<T>;
	constructor(private readonly _textModel: ITextModel, private readonly _endIncrement: number = 20) {
		const range = { startInclusive: 0, endExclusive: this.getEnd() };
		this._root = {
			maxLeftStartInclusive: this.getMidPoint(range),
			segmentStartRange: range,
			parent: undefined,
			left: undefined,
			right: undefined
		};

	}

	get root(): RangeTreeNode<T> | undefined {
		return this._root;
	}

	private shrinkSegmentRange(shrinkToTheLeft: boolean, oldSegmentRange: TreeRange): TreeRange {
		if (shrinkToTheLeft) {
			const rangeSize = this.shrinkRangeSize(oldSegmentRange.endExclusive - oldSegmentRange.startInclusive, true);
			return { startInclusive: oldSegmentRange.startInclusive, endExclusive: oldSegmentRange.endExclusive - rangeSize };
		} else {
			const rangeSize = this.shrinkRangeSize(oldSegmentRange.endExclusive - oldSegmentRange.startInclusive);
			return { startInclusive: oldSegmentRange.startInclusive + rangeSize, endExclusive: oldSegmentRange.endExclusive };
		}
	}

	private shrinkRangeSize(oldRangeSize: number, useCeil: boolean = false): number {
		const newSize = oldRangeSize / 2;
		return Math.max(useCeil ? Math.ceil(newSize) : Math.floor(newSize), 1);
	}

	private getMidPoint(segmentRange: TreeRange): number {
		return segmentRange.startInclusive + Math.floor((segmentRange.endExclusive - segmentRange.startInclusive) / 2);
	}

	private rangeStartIsLessThan(one: TreeRange, two: number): boolean {
		return (one.startInclusive <= two);
	}

	private rangesOverlap(one: TreeRange, two: TreeRange): boolean {
		return (one.startInclusive < two.endExclusive && one.endExclusive > two.startInclusive) || (two.startInclusive < one.endExclusive && two.endExclusive > one.startInclusive);
	}

	private _end: number = 0;
	private _lastEnd: number = 0;
	private getEnd(): number {
		const lineCount = this._textModel.getLineCount();
		const currentEnd = this._textModel.getOffsetAt(new Position(lineCount, this._textModel.getLineMaxColumn(lineCount)));
		if (currentEnd > this._end) {
			this._end = currentEnd + this._endIncrement;
		} else if (currentEnd < (this._end - this._endIncrement)) {
			this._end = currentEnd + this._endIncrement;
		}
		return this._end;
	}

	insert(startInclusive: number, endExclusive: number, data: T): void {
		const newNode: RangeTreeLeafNode<T> = { startInclusive, endExclusive, data, parent: undefined };
		// First delete the range, then insert the new range
		const end = this.getEnd();
		const startingSegmentRange = { startInclusive: 0, endExclusive: end };
		if (end !== this._lastEnd) {
			this.tryBalance(end > this._lastEnd ? 'left' : 'right', this._root, startingSegmentRange, []);
		}
		this._lastEnd = end;
		this.deleteFrom(newNode, this._root);
		this.insertAt(newNode, this._root, startingSegmentRange);
	}

	private insertAt(newNode: RangeTreeLeafNode<T>, startingNode: RangeTreeBranchNode<T>, startSegmentRange: TreeRange): void {
		let current: RangeTreeNode<T> = startingNode;
		let segmentRange: TreeRange = startSegmentRange;

		while (true) {
			if (isLeaf(current) && current.startInclusive === newNode.startInclusive && current.endExclusive === newNode.endExclusive) {
				current.data = newNode.data;
				break;
			}

			if (!isLeaf(current)) {
				const intendedMidPoint = this.getMidPoint(segmentRange);
				if (current.maxLeftStartInclusive !== intendedMidPoint) {
					// need to rebalance because length of document has changed.
					this.tryBalance(current.maxLeftStartInclusive < intendedMidPoint ? 'left' : 'right', current, segmentRange, []);
				}

				if (this.rangeStartIsLessThan(newNode, current.maxLeftStartInclusive)) {
					if (current.left) {
						current = current.left;
						segmentRange = this.shrinkSegmentRange(true, segmentRange);
						continue;
					} else {
						current.left = newNode;
						newNode.parent = current;
						break;
					}
				} else {
					if (current.right) {
						current = current.right;
						segmentRange = this.shrinkSegmentRange(false, segmentRange);
						continue;
					} else {
						current.right = newNode;
						newNode.parent = current;
						break;
					}
				}
			} else {
				// if there's overlap, then the old range should be deleted.
				if (this.rangesOverlap(current, newNode)) {
					if (current.parent?.left === current) {
						current.parent.left = newNode;
					} else if (current.parent?.right === current) {
						current.parent.right = newNode;
					}
					newNode.parent = current.parent;
					break;
				}


				const newMidPont = this.getMidPoint(segmentRange);
				const newBranch: RangeTreeBranchNode<T> = {
					maxLeftStartInclusive: newMidPont,
					parent: current.parent,
					left: undefined,
					right: undefined,
					segmentStartRange: segmentRange
				};
				if (current.parent?.left === current) {
					current.parent.left = newBranch;
				} else if (current.parent?.right === current) {
					current.parent.right = newBranch;
				}

				current.parent = undefined;
				this.insertAt(current, newBranch, segmentRange);
				this.insertAt(newNode, newBranch, segmentRange);
				break;
			}
		}
	}

	private deleteFrom(toDelete: RangeTreeLeafNode<T>, startingNode: RangeTreeBranchNode<T>): void {
		this.traverseInOrderFromNode(toDelete, startingNode, (node) => {
			if (node.parent?.left === node) {
				node.parent.left = undefined;
			} else if (node.parent?.right === node) {
				node.parent.right = undefined;
			}
			node.parent = undefined;
		});
	}

	// callback return value indicates if the traversal should stop going right
	traverseInOrder(range: Range, callback: (node: RangeTreeLeafNode<T>) => void): void {
		const startInclusive = this._textModel.getOffsetAt(range.getStartPosition());
		const endExclusive = this._textModel.getOffsetAt(range.getEndPosition()) + 1;
		return this.traverseInOrderFromNode({ startInclusive, endExclusive }, this._root, callback,);
	}

	private traverseInOrderFromNode(toDelete: TreeRange, startingNode: RangeTreeBranchNode<T>, callback: (node: RangeTreeLeafNode<T>) => void): void {
		let current: RangeTreeNode<T> | undefined = startingNode;
		const visited: RangeTreeNode<T>[] = [];
		let needsToCheckRight = true;

		while (visited.length > 0 || current) {
			if (current) {
				visited.push(current);
				if (!isLeaf(current) && ((current.segmentStartRange.startInclusive <= toDelete.startInclusive) || (toDelete.endExclusive >= current.segmentStartRange.startInclusive))) {
					// There could be overlapping ranges in this subtree.
					const leftRange = (current.left && !isLeaf(current.left)) ? current.left.segmentStartRange : current.left;
					if (leftRange && this.rangesOverlap(leftRange, toDelete)) {
						current = current.left;
					} else {
						current = undefined;
					}
				} else {
					current = undefined;
				}

				continue;
			}
			current = visited.pop();
			if (current && isLeaf(current)) {
				if (this.rangesOverlap(current, toDelete)) {
					callback(current);
				} else if (current.startInclusive > toDelete.endExclusive) {
					needsToCheckRight = false;
				}
			}
			if (current && !isLeaf(current) && needsToCheckRight && ((current.segmentStartRange.startInclusive <= toDelete.startInclusive) || (toDelete.endExclusive >= current.segmentStartRange.startInclusive))) {
				// There could be overlapping ranges in this subtree.
				const rightRange = (current.right && !isLeaf(current.right)) ? current.right.segmentStartRange : current.right;
				if (rightRange && this.rangesOverlap(rightRange, toDelete)) {
					current = current.right;
				} else {
					current = undefined;
				}
			} else {
				current = undefined;
			}
		}

	}

	// private tryRebalance(node: RangeTreeBranchNode<T>, rangeSize: number, segmentRange: TreeRange): void {
	// 	const current: RangeTreeNode<T> = node;
	// 	while (true) {
	// 		const intendedMidPoint = segmentRange.startInclusive + rangeSize;
	// 		if (!isLeaf(current)) {
	// 			if (node.maxLeftEndExclusive === intendedMidPoint) {
	// 				return;
	// 			}

	// 		}
	// 	}
	// }

	private rangeContainsStartPoint(outer: TreeRange, inner: TreeRange): boolean {
		return (inner.startInclusive >= outer.startInclusive) && (inner.startInclusive < outer.endExclusive);
	}

	private tryBalance(direction: 'right' | 'left', node: RangeTreeBranchNode<T>, segmentRange: TreeRange, needsReInsert: RangeTreeLeafNode<T>[]) {
		if (!isLeaf(node)) {
			const intendedMidPoint = this.getMidPoint(segmentRange);
			if (node.maxLeftStartInclusive === intendedMidPoint) {
				return;
			}
			if (node.right) {
				const intendedRightSegmentRange = this.shrinkSegmentRange(false, segmentRange);
				if (!isLeaf(node.right) && (this._end < node.right.segmentStartRange.startInclusive)) {
					// the document got smaller remove the entire right subtree
					node.right = undefined;
				} else if (!isLeaf(node.right)) {
					this.tryBalance(direction, node.right, intendedRightSegmentRange, needsReInsert);
				} else if (isLeaf(node.right) && !this.rangeContainsStartPoint(intendedRightSegmentRange, node.right)) {
					needsReInsert.push(node.right);
					node.right = undefined;
				}
			}
			if (node.left) {
				const intendedLeftSegmentRange = this.shrinkSegmentRange(true, segmentRange);
				if (!isLeaf(node.left)) {
					this.tryBalance(direction, node.left, intendedLeftSegmentRange, needsReInsert);
				} else if (isLeaf(node.left) && !this.rangeContainsStartPoint(intendedLeftSegmentRange, node.left)) {
					needsReInsert.push(node.left);
					node.left = undefined;
				}
			}
			node.maxLeftStartInclusive = intendedMidPoint;
			node.segmentStartRange = segmentRange;
			// The document got smaller and now we have branch nodes where there should be only leaves.
			if (node.right && !isLeaf(node.right) && node.right?.maxLeftStartInclusive === node.maxLeftStartInclusive) {
				node.right = undefined;
			}

			let toInsert = needsReInsert.length > 0 ? needsReInsert[0] : undefined;
			while (toInsert) {
				if (this.rangeContainsStartPoint(segmentRange, toInsert)) {
					this.insertAt(toInsert, node, segmentRange);
					needsReInsert.shift();
					toInsert = needsReInsert.length > 0 ? needsReInsert[0] : undefined;
				} else {
					toInsert = undefined;
				}
			}
		}
	}

	printTree(): string | undefined {
		const toPrint: string[] = [];
		const printNode = (node: RangeTreeNode<T> | undefined, prefix: string, isLeft: boolean) => {
			if (!node) { return; }
			// allow-any-unicode-next-line
			toPrint.push(prefix + (isLeft ? '├── ' : '└── ') + (isLeaf(node) ? `[${node.startInclusive}, ${node.endExclusive}]` : `(${node.maxLeftStartInclusive})`));
			if (!isLeaf(node)) {
				// allow-any-unicode-next-line
				printNode(node.left, prefix + (isLeft ? '│   ' : '    '), true);
				// allow-any-unicode-next-line
				printNode(node.right, prefix + (isLeft ? '│   ' : '    '), false);
			}
		};

		if (this._root) {
			toPrint.push(`(${this._root.maxLeftStartInclusive})`);
			printNode(this._root.left, '', true);
			printNode(this._root.right, '', false);
			return toPrint.join('\n');
		} else {
			return undefined;
		}
	}

	// callback return value indicates if the traversal should continue
	// traverseInOrder(range: Range, callback: (node: TokenNode) => boolean): void {
	// 	const startInclusive = this._textModel.getOffsetAt(range.getStartPosition());
	// 	const endExclusive = this._textModel.getOffsetAt(range.getEndPosition()) + 1;
	// 	const current: TokenNode | undefined = this._root;
	// 	if (!current) {
	// 		return;
	// 	}
	// 	return this.traverseInOrderFromNode(TraverseDirection.InOrder, current, callback, startInclusive, endExclusive);
	// }

	// private traverseInOrderFromNode(direction: TraverseDirection, node: TokenNode, callback: (node: TokenNode) => boolean, startInclusive: number, endExclusive: number): void {
	// 	const isEndMax = endExclusive === this.getEnd();
	// 	let current: TokenNode | undefined = node;
	// 	const toVisit: TokenNode[] = [];
	// 	while (current || toVisit.length > 0) {
	// 		if (current) {
	// 			toVisit.push(current);
	// 			if (direction === TraverseDirection.InOrder) {
	// 				current = (startInclusive <= current.startInclusive) ? current.left : undefined;
	// 			} else {
	// 				current = ((endExclusive >= current.endExclusive) || isEndMax) ? current.right : undefined;
	// 			}
	// 			continue;
	// 		}
	// 		current = toVisit.pop()!;
	// 		if (((direction === TraverseDirection.InOrder) && (current.startInclusive >= startInclusive) && ((current.startInclusive < endExclusive) || isEndMax))
	// 			|| ((direction === TraverseDirection.ReverseOrder) && (current.endExclusive >= startInclusive) && ((current.endExclusive < endExclusive) || isEndMax))) {
	// 			if (!callback(current)) {
	// 				break;
	// 			}
	// 		}
	// 		if (direction === TraverseDirection.InOrder) {
	// 			current = ((endExclusive >= current.endExclusive) || isEndMax) ? current.right : undefined;
	// 		} else {
	// 			current = (startInclusive <= current.startInclusive) ? current.left : undefined;
	// 		}
	// 	}
	// }
}
