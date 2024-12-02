/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from '../core/position.js';
import { StorableToken } from './treeSitterTokenStore.js';

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

export function isLeaf<T>(node: RangeTreeNode<T>): node is RangeTreeLeafNode<T> {
	return (node as RangeTreeLeafNode<T>).data !== undefined;
}

interface NodeToInsert<T> {
	newNode: RangeTreeLeafNode<T>;
	startingNode: RangeTreeBranchNode<T>;
	startingSegmentRange: TreeRange;
}

interface IRangable {
	getEnd(): number;
}

export class TokenRangeTree<T> {
	private _root: RangeTreeBranchNode<T>;
	constructor(private readonly _rangable: IRangable, private readonly _endIncrement: number = 20) {
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

	private rangesOverlapOrTouch(one: TreeRange, two: TreeRange): boolean {
		return (one.startInclusive < two.endExclusive && one.endExclusive >= two.startInclusive) || (two.startInclusive <= one.endExclusive && two.endExclusive > one.startInclusive);
	}

	private _end: number = 0;
	private _lastEnd: number = 0;
	private getEnd(): number {
		const currentEnd = this._rangable.getEnd();
		if ((currentEnd > this._end) || this._end === 0) {
			this._end = currentEnd + this._endIncrement;
		} else if (currentEnd < (this._end - this._endIncrement)) {
			this._end = currentEnd + this._endIncrement;
		}
		return this._end;
	}


	/**
	 * @param items A sorted array of items to insert.
	 */
	insert(items: StorableToken<T>[]): void {
		// First delete the range, then insert the new range

		const end = this.getEnd();
		const startingSegmentRange = { startInclusive: 0, endExclusive: end };
		if (end !== this._lastEnd) {
			this.tryBalance(this._root, startingSegmentRange);
		}
		this._lastEnd = end;

		const newNodes: NodeToInsert<T>[] = items.map(item => ({ startingNode: this._root, startingSegmentRange, newNode: { startInclusive: item.offsetStartInclusive, endExclusive: item.offsetEndExclusive, data: item.metadata, parent: undefined } }));
		for (const node of newNodes) {
			this.deleteFrom({ startInclusive: node.newNode.startInclusive, endExclusive: node.newNode.endExclusive }, this._root);
		}
		this.insertAt(newNodes);
	}

	private insertAt(toInsert: NodeToInsert<T>[]): void {
		let newNode!: RangeTreeLeafNode<T>;
		let current!: RangeTreeNode<T>;
		let segmentRange!: TreeRange;

		const moveToNextInsert = (): boolean => {
			if (toInsert.length === 0) {
				return false;
			}
			const nextInsert = toInsert.shift()!;
			newNode = nextInsert.newNode;
			current = nextInsert.startingNode;
			segmentRange = nextInsert.startingSegmentRange;
			return true;
		};

		if (!moveToNextInsert()) {
			return;
		}

		while (true) {
			if (isLeaf(current) && current.startInclusive === newNode.startInclusive && current.endExclusive === newNode.endExclusive) {
				current.data = newNode.data;
				if (!moveToNextInsert()) {
					break;
				}
			}

			if (!isLeaf(current)) {
				const intendedMidPoint = this.getMidPoint(segmentRange);
				if (current.maxLeftStartInclusive !== intendedMidPoint) {
					// need to rebalance because length of document has changed.
					this.tryBalance(current, segmentRange);
				}

				if (this.rangeStartIsLessThan(newNode, current.maxLeftStartInclusive)) {
					if (current.left) {
						current = current.left;
						segmentRange = this.shrinkSegmentRange(true, segmentRange);
						continue;
					} else {
						current.left = newNode;
						newNode.parent = current;
						if (!moveToNextInsert()) {
							break;
						}
					}
				} else {
					if (current.right) {
						current = current.right;
						segmentRange = this.shrinkSegmentRange(false, segmentRange);
						continue;
					} else {
						current.right = newNode;
						newNode.parent = current;
						if (!moveToNextInsert()) {
							break;
						}
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
					if (!moveToNextInsert()) {
						break;
					}
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
				toInsert.unshift({ newNode: current, startingNode: newBranch, startingSegmentRange: segmentRange });
				current = newBranch;
			}
		}
	}

	private deleteFrom(toDelete: TreeRange, startingNode: RangeTreeBranchNode<T>): void {
		this.traversePostOrderFromNode(toDelete, startingNode, (node) => {
			// We don't delete identical ranges as then can just be reused.
			const deleteLeaf = isLeaf(node) && this.rangesOverlap(node, toDelete) && (node.startInclusive !== toDelete.startInclusive || node.endExclusive !== toDelete.endExclusive);
			const deleteBranch = !isLeaf(node) && !node.left && !node.right;
			if (deleteLeaf || deleteBranch) {
				if (node.parent?.left === node) {
					node.parent.left = undefined;
				} else if (node.parent?.right === node) {
					node.parent.right = undefined;
				}
				node.parent = undefined;
			}
		});
	}

	// callback return value indicates if the traversal should stop going right
	traverseInOrder(startInclusive: number, endExclusive: number, callback: (node: RangeTreeLeafNode<T>) => void): void {
		return this.traverseInOrderFromNode({ startInclusive, endExclusive }, this._root, callback,);
	}

	private traverseInOrderFromNode(range: TreeRange, startingNode: RangeTreeBranchNode<T>, callback: (node: RangeTreeLeafNode<T>) => void): void {
		let current: RangeTreeNode<T> | undefined = startingNode;
		const visited: RangeTreeNode<T>[] = [];
		let needsToCheckRight = true;

		while (visited.length > 0 || current) {
			if (current) {
				visited.push(current);
				if (!isLeaf(current) && ((current.segmentStartRange.startInclusive <= range.startInclusive) || (range.endExclusive >= current.segmentStartRange.startInclusive))) {
					// There could be overlapping ranges in this subtree.
					const leftRange = (current.left && !isLeaf(current.left)) ? current.left.segmentStartRange : current.left;
					if (leftRange && this.rangesOverlapOrTouch(leftRange, range)) {
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
				if (this.rangesOverlap(current, range)) {
					callback(current);
				} else if (current.startInclusive > range.endExclusive) {
					needsToCheckRight = false;
				}
			}
			if (current && !isLeaf(current) && needsToCheckRight && ((current.segmentStartRange.startInclusive <= range.startInclusive) || (range.endExclusive >= current.segmentStartRange.startInclusive))) {
				// There could be overlapping ranges in this subtree.
				const rightRange = (current.right && !isLeaf(current.right)) ? current.right.segmentStartRange : current.right;
				if (rightRange && this.rangesOverlapOrTouch(rightRange, range)) {
					current = current.right;
				} else {
					current = undefined;
				}
			} else {
				current = undefined;
			}
		}
	}

	private traversePreOrderFromNode(range: TreeRange, startingNode: RangeTreeBranchNode<T>, callback: (node: RangeTreeNode<T>, segmentRange: TreeRange) => boolean): void {
		let current: { node: RangeTreeNode<T>; segmentRange: TreeRange } | undefined = { node: startingNode, segmentRange: range };
		const stack: { node: RangeTreeNode<T>; segmentRange: TreeRange }[] = [];

		while (stack.length > 0 || current) {
			if (current) {
				if (!isLeaf(current.node)) {
					if (!callback(current.node, current.segmentRange)) {
						current = undefined;
						continue;
					}
				}
				stack.push(current);
				current = (!isLeaf(current.node) && current.node.left) ? { node: current.node.left, segmentRange: this.shrinkSegmentRange(true, current.segmentRange) } : undefined;
			} else {
				current = stack.pop()!;
				current = (!isLeaf(current.node) && current.node.right) ? { node: current.node.right, segmentRange: this.shrinkSegmentRange(false, current.segmentRange) } : undefined;
			}
		}
	}

	public traversePostOrder(callback: (node: RangeTreeNode<T>, segmentRange: TreeRange) => void): void {
		const end = this.getEnd();
		const startingSegmentRange = { startInclusive: 0, endExclusive: end };
		this.traversePostOrderFromNode(startingSegmentRange, this._root, callback);
	}

	private traversePostOrderFromNode(range: TreeRange, startingNode: RangeTreeBranchNode<T>, callback: (node: RangeTreeNode<T>, segmentRange: TreeRange) => void): void {
		let current: { node: RangeTreeNode<T>; segmentRange: TreeRange } | undefined = { node: startingNode, segmentRange: range };
		const stack: { node: RangeTreeNode<T>; segmentRange: TreeRange }[] = [];
		let lastVisitedNode: RangeTreeNode<T> | undefined = undefined;

		while (stack.length > 0 || current) {
			if (current) {
				stack.push(current);
				current = (!isLeaf(current.node) && current.node.left) ? { node: current.node.left, segmentRange: this.shrinkSegmentRange(true, current.segmentRange) } : undefined;
			} else {
				const peekNode = stack[stack.length - 1];
				if (!isLeaf(peekNode.node) && peekNode.node.right && lastVisitedNode !== peekNode.node.right) {
					current = { node: peekNode.node.right, segmentRange: this.shrinkSegmentRange(false, peekNode.segmentRange) };
				} else {
					callback(peekNode.node, peekNode.segmentRange);
					lastVisitedNode = stack.pop()!.node;
				}
			}
		}
	}

	private rangeContainsStartPoint(outer: TreeRange, inner: TreeRange): boolean {
		return (inner.startInclusive >= outer.startInclusive) && (inner.startInclusive < outer.endExclusive);
	}

	private tryBalance(initialNode: RangeTreeBranchNode<T>, initialSegmentRange: TreeRange) {
		const needsReInsert: RangeTreeLeafNode<T>[] = [];
		const needsClearing: RangeTreeBranchNode<T>[] = [];

		this.traversePreOrderFromNode(initialSegmentRange, initialNode, (node, segmentRange) => {
			if (isLeaf(node)) {
				return true;
			}
			const intendedMidPoint = this.getMidPoint(segmentRange);
			if (node.maxLeftStartInclusive === intendedMidPoint) {
				return false;
			}

			if (node.right) {
				const intendedRightSegmentRange = this.shrinkSegmentRange(false, segmentRange);
				if (!isLeaf(node.right) && (this._end < node.right.segmentStartRange.startInclusive)) {
					// the document got smaller remove the entire right subtree
					needsClearing.push(node.right);
					node.right = undefined;
				} else if (isLeaf(node.right)) {
					if (!this.rangeContainsStartPoint(intendedRightSegmentRange, node.right) && this._end >= node.right.endExclusive) {
						needsReInsert.push(node.right);
						node.right.parent = undefined;
						node.right = undefined;
					}
				}
			}
			if (node.left) {
				const intendedLeftSegmentRange = this.shrinkSegmentRange(true, segmentRange);
				if (isLeaf(node.left)) {
					if (!this.rangeContainsStartPoint(intendedLeftSegmentRange, node.left) && this._end >= node.left.endExclusive) {
						needsReInsert.push(node.left);
						node.left.parent = undefined;
						node.left = undefined;
					}
				}
			}

			node.maxLeftStartInclusive = intendedMidPoint;
			node.segmentStartRange = segmentRange;

			if (node.parent && node.parent.maxLeftStartInclusive === node.maxLeftStartInclusive) {
				if (node.parent.left === node) {
					node.parent.left = undefined;
				} else if (node.parent.right === node) {
					node.parent.right = undefined;
				}
				node.parent = undefined;
			}

			return true;
		});

		for (const node of needsClearing) {
			this.traversePostOrderFromNode(node.segmentStartRange, node, (node) => {
				if (isLeaf(node)) {
					if (node.parent?.left === node) {
						node.parent.left = undefined;
					} else if (node.parent?.right === node) {
						node.parent.right = undefined;
					}
				} else {
					if (node.left) {
						node.left.parent = undefined;
						node.left = undefined;
					}
					if (node.right) {
						node.right.parent = undefined;
						node.right = undefined;
					}
				}
				node.parent = undefined;

			});
		}
		const end = this.getEnd();
		const startingSegmentRange = { startInclusive: 0, endExclusive: end };
		this.insertAt(needsReInsert.map(node => ({ newNode: node, startingNode: this._root, startingSegmentRange })));
	}

	printTree(): string | undefined {
		const toPrint: string[] = [];
		const stack: { node: RangeTreeNode<T>; prefix: string; isLeft: boolean | undefined }[] = [];
		stack.push({ node: this._root, prefix: '', isLeft: undefined });

		while (stack.length > 0) {
			const { node, prefix, isLeft } = stack.pop()!;
			if (node) {
				const nodeLabel = isLeaf(node)
					? `[${node.startInclusive}, ${node.endExclusive}]`
					: `(${node.maxLeftStartInclusive})`;

				// allow-any-unicode-next-line
				toPrint.push(prefix + ((isLeft === true) ? '├── ' : (isLeft === false ? '└── ' : '')) + nodeLabel);

				if (!isLeaf(node)) {
					// allow-any-unicode-next-line
					const childPrefix = prefix + ((isLeft === true) ? '│   ' : (isLeft === false ? '    ' : ''));
					if (node.right) {
						stack.push({ node: node.right, prefix: childPrefix, isLeft: false });
					}
					if (node.left) {
						stack.push({ node: node.left, prefix: childPrefix, isLeft: true });
					}
				}
			}
		}
		return toPrint.join('\n');
	}
}
