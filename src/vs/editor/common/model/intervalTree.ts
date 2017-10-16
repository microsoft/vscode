/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration } from 'vs/editor/common/editorCommon';

//
// The red-black tree is based on the "Introduction to Algorithms" by Cormen, Leiserson and Rivest.
//

// TODO@interval!!!
export const ClassName = {
	EditorInfoDecoration: 'infosquiggly',
	EditorWarningDecoration: 'warningsquiggly',
	EditorErrorDecoration: 'errorsquiggly'
};

/**
 * Describes the behavior of decorations when typing/editing near their edges.
 * Note: Please do not edit the values, as they very carefully match `DecorationRangeBehavior`
 */
export const enum TrackedRangeStickiness {
	AlwaysGrowsWhenTypingAtEdges = 0,
	NeverGrowsWhenTypingAtEdges = 1,
	GrowsOnlyWhenTypingBefore = 2,
	GrowsOnlyWhenTypingAfter = 3,
}

export const enum NodeColor {
	Red,
	Black
}

export class IntervalNode implements IModelDecoration {

	public parent: IntervalNode;
	public left: IntervalNode;
	public right: IntervalNode;
	public color: NodeColor;

	public start: number;
	public end: number;
	public delta: number;
	public maxEnd: number;

	public id: string;
	public ownerId: number;
	public options: ModelDecorationOptions;
	public isForValidation: boolean;
	public stickiness: TrackedRangeStickiness;

	public cachedVersionId: number;
	public cachedAbsoluteStart: number;
	public cachedAbsoluteEnd: number;
	public range: Range;

	public visited: boolean;

	constructor(id: string, start: number, end: number) {
		this.parent = null;
		this.left = null;
		this.right = null;
		this.color = NodeColor.Red;

		this.start = start;
		this.end = end;
		this.delta = start;
		this.maxEnd = end;

		this.id = id;
		this.ownerId = 0;
		this.options = null;
		this.isForValidation = false;
		this.stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;

		this.cachedVersionId = 0;
		this.cachedAbsoluteStart = start;
		this.cachedAbsoluteEnd = end;
		this.range = null;

		this.visited = false;
	}

	public setOptions(options: ModelDecorationOptions) {
		this.options = options;
		this.isForValidation = (
			this.options.className === ClassName.EditorErrorDecoration
			|| this.options.className === ClassName.EditorWarningDecoration
		);
		this.stickiness = <number>this.options.stickiness;
	}

	public setCachedOffsets(absoluteStart: number, absoluteEnd: number, cachedVersionId: number): void {
		this.cachedVersionId = cachedVersionId;
		if (this.cachedAbsoluteStart === absoluteStart && this.cachedAbsoluteEnd === absoluteEnd) {
			// no change
			return;
		}
		this.cachedAbsoluteStart = absoluteStart;
		this.cachedAbsoluteEnd = absoluteEnd;
		this.range = null;
	}

	public detach(): void {
		this.parent = null;
		this.left = null;
		this.right = null;
	}
}

const SENTINEL: IntervalNode = new IntervalNode(null, 0, 0);
SENTINEL.parent = SENTINEL;
SENTINEL.left = SENTINEL;
SENTINEL.right = SENTINEL;
SENTINEL.color = NodeColor.Black;

export class IntervalTree {

	public root: IntervalNode;

	constructor() {
		this.root = SENTINEL;
	}

	public intervalSearch(start: number, end: number, filterOwnerId: number, filterOutValidation: boolean, cachedVersionId: number): IntervalNode[] {
		if (this.root === SENTINEL) {
			return [];
		}
		return intervalSearch(this, start, end, filterOwnerId, filterOutValidation, cachedVersionId);
	}

	public search(filterOwnerId: number, filterOutValidation: boolean, overviewRulerOnly: boolean, cachedVersionId: number): IntervalNode[] {
		if (this.root === SENTINEL) {
			return [];
		}
		return search(this, filterOwnerId, filterOutValidation, overviewRulerOnly, cachedVersionId);
	}

	public count(): number {
		if (this.root === SENTINEL) {
			return 0;
		}
		return nodeCount(this);
	}

	/**
	 * Will not set `cachedAbsoluteStart` nor `cachedAbsoluteEnd` on the returned nodes!
	 */
	public collectNodesFromOwner(ownerId: number): IntervalNode[] {
		return collectNodesFromOwner(this, ownerId);
	}

	public insert(node: IntervalNode): void {
		rbTreeInsert(this, node);
	}

	public delete(node: IntervalNode): void {
		rbTreeDelete(this, node);
	}

	public resolveNode(node: IntervalNode, cachedVersionId: number): void {
		const initialNode = node;
		let delta = 0;
		while (node !== this.root) {
			if (node === node.parent.right) {
				delta += node.parent.delta;
			}
			node = node.parent;
		}

		const nodeStart = initialNode.start + delta;
		const nodeEnd = initialNode.end + delta;
		initialNode.setCachedOffsets(nodeStart, nodeEnd, cachedVersionId);
	}

	public acceptReplace(offset: number, length: number, textLength: number, forceMoveMarkers: boolean): void {
		// Our strategy is to remove all directly impacted nodes, and then add them back to the tree.

		// (1) collect all nodes that are intersecting this edit as nodes of interest
		const nodesOfInterest = searchForEditing(this, offset, offset + length);

		// (2) remove all nodes that are intersecting this edit
		for (let i = 0, len = nodesOfInterest.length; i < len; i++) {
			const node = nodesOfInterest[i];
			rbTreeDelete(this, node);
		}

		// (3) edit all tree nodes except the nodes of interest
		noOverlapReplace(this, offset, offset + length, textLength);

		// (4) edit the nodes of interest and insert them back in the tree
		for (let i = 0, len = nodesOfInterest.length; i < len; i++) {
			const node = nodesOfInterest[i];
			node.start = node.cachedAbsoluteStart;
			node.end = node.cachedAbsoluteEnd;
			nodeAcceptEdit(node, offset, (offset + length), textLength, forceMoveMarkers);
			node.maxEnd = node.end;
			rbTreeInsert(this, node);
		}
	}

	public assertInvariants(): void {
		assert(SENTINEL.color === NodeColor.Black);
		assert(SENTINEL.parent === SENTINEL);
		assert(SENTINEL.left === SENTINEL);
		assert(SENTINEL.right === SENTINEL);
		assert(SENTINEL.start === 0);
		assert(SENTINEL.end === 0);
		assert(SENTINEL.delta === 0);
		assert(this.root.parent === SENTINEL);
		assertValidTree(this);
	}

	public getAllInOrder(): IntervalNode[] {
		return search(this, 0, false, false, 0);
	}

	public print(): void {
		if (this.root === SENTINEL) {
			console.log(`~~ empty`);
			return;
		}
		let out: string[] = [];
		this._print(this.root, '', 0, out);
		console.log(out.join(''));
	}

	private _print(n: IntervalNode, indent: string, delta: number, out: string[]): void {
		out.push(`${indent}[${n.color === NodeColor.Red ? 'R' : 'B'},${n.delta}, ${n.start}->${n.end}, ${n.maxEnd}] : {${delta + n.start}->${delta + n.end}}, maxEnd: ${n.maxEnd + delta}\n`);
		if (n.left !== SENTINEL) {
			this._print(n.left, indent + '    ', delta, out);
		} else {
			out.push(`${indent}    NIL\n`);
		}
		if (n.right !== SENTINEL) {
			this._print(n.right, indent + '    ', delta + n.delta, out);
		} else {
			out.push(`${indent}    NIL\n`);
		}
	}
}


//#region Editing

const enum MarkerMoveSemantics {
	MarkerDefined = 0,
	ForceMove = 1,
	ForceStay = 2
}

function adjustMarkerBeforeColumn(markerOffset: number, markerStickToPreviousCharacter: boolean, checkOffset: number, moveSemantics: MarkerMoveSemantics): boolean {
	if (markerOffset < checkOffset) {
		return true;
	}
	if (markerOffset > checkOffset) {
		return false;
	}
	if (moveSemantics === MarkerMoveSemantics.ForceMove) {
		return false;
	}
	if (moveSemantics === MarkerMoveSemantics.ForceStay) {
		return true;
	}
	return markerStickToPreviousCharacter;
};

/**
 * This is a lot more complicated than strictly necessary to maintain the same behaviour
 * as when decorations were implemented using two markers.
 */
function nodeAcceptEdit(node: IntervalNode, start: number, end: number, textLength: number, forceMoveMarkers: boolean): void {
	const startStickToPreviousCharacter = (
		node.stickiness === TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
		|| node.stickiness === TrackedRangeStickiness.GrowsOnlyWhenTypingBefore
	);
	const endStickToPreviousCharacter = (
		node.stickiness === TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
		|| node.stickiness === TrackedRangeStickiness.GrowsOnlyWhenTypingBefore
	);

	const deletingCnt = (end - start);
	const insertingCnt = textLength;
	const commonLength = Math.min(deletingCnt, insertingCnt);

	const nodeStart = node.start;
	let startDone = false;

	const nodeEnd = node.end;
	let endDone = false;

	{
		const moveSemantics = forceMoveMarkers ? MarkerMoveSemantics.ForceMove : (deletingCnt > 0 ? MarkerMoveSemantics.ForceStay : MarkerMoveSemantics.MarkerDefined);
		if (!startDone && adjustMarkerBeforeColumn(nodeStart, startStickToPreviousCharacter, start, moveSemantics)) {
			startDone = true;
		}
		if (!endDone && adjustMarkerBeforeColumn(nodeEnd, endStickToPreviousCharacter, start, moveSemantics)) {
			endDone = true;
		}
	}

	if (commonLength > 0 && !forceMoveMarkers) {
		const moveSemantics = (deletingCnt > insertingCnt ? MarkerMoveSemantics.ForceStay : MarkerMoveSemantics.MarkerDefined);
		if (!startDone && adjustMarkerBeforeColumn(nodeStart, startStickToPreviousCharacter, start + commonLength, moveSemantics)) {
			startDone = true;
		}
		if (!endDone && adjustMarkerBeforeColumn(nodeEnd, endStickToPreviousCharacter, start + commonLength, moveSemantics)) {
			endDone = true;
		}
	}

	{
		const moveSemantics = forceMoveMarkers ? MarkerMoveSemantics.ForceMove : MarkerMoveSemantics.MarkerDefined;
		if (!startDone && adjustMarkerBeforeColumn(nodeStart, startStickToPreviousCharacter, end, moveSemantics)) {
			node.start = start + insertingCnt;
			startDone = true;
		}
		if (!endDone && adjustMarkerBeforeColumn(nodeEnd, endStickToPreviousCharacter, end, moveSemantics)) {
			node.end = start + insertingCnt;
			endDone = true;
		}
	}

	// Finish
	const deltaColumn = (insertingCnt - deletingCnt);
	if (!startDone) {
		node.start = Math.max(0, nodeStart + deltaColumn);
		startDone = true;
	}
	if (!endDone) {
		node.end = Math.max(0, nodeEnd + deltaColumn);
		endDone = true;
	}

	if (node.start > node.end) {
		node.end = node.start;
	}
}

function searchForEditing(T: IntervalTree, start: number, end: number): IntervalNode[] {
	// https://en.wikipedia.org/wiki/Interval_tree#Augmented_tree
	// Now, it is known that two intervals A and B overlap only when both
	// A.low <= B.high and A.high >= B.low. When searching the trees for
	// nodes overlapping with a given interval, you can immediately skip:
	//  a) all nodes to the right of nodes whose low value is past the end of the given interval.
	//  b) all nodes that have their maximum 'high' value below the start of the given interval.
	let node = T.root;
	let delta = 0;
	let nodeMaxEnd = 0;
	let nodeStart = 0;
	let nodeEnd = 0;
	let result: IntervalNode[] = [];
	let resultLen = 0;
	while (node !== SENTINEL) {
		if (node.visited) {
			// going up from this node
			node.left.visited = false;
			node.right.visited = false;
			if (node === node.parent.right) {
				delta -= node.parent.delta;
			}
			node = node.parent;
			continue;
		}

		if (!node.left.visited) {
			// first time seeing this node
			nodeMaxEnd = delta + node.maxEnd;
			if (nodeMaxEnd < start) {
				// cover case b) from above
				// there is no need to search this node or its children
				node.visited = true;
				continue;
			}

			if (node.left !== SENTINEL) {
				// go left
				node = node.left;
				continue;
			}
		}

		// handle current node
		nodeStart = delta + node.start;
		if (nodeStart > end) {
			// cover case a) from above
			// there is no need to search this node or its right subtree
			node.visited = true;
			continue;
		}

		nodeEnd = delta + node.end;
		if (nodeEnd >= start) {
			node.setCachedOffsets(nodeStart, nodeEnd, 0);
			result[resultLen++] = node;
		}
		node.visited = true;

		if (node.right !== SENTINEL && !node.right.visited) {
			// go right
			delta += node.delta;
			node = node.right;
			continue;
		}
	}

	if (T.root) {
		T.root.visited = false;
	}

	return result;
}

function noOverlapReplace(T: IntervalTree, start: number, end: number, textLength: number): void {
	// https://en.wikipedia.org/wiki/Interval_tree#Augmented_tree
	// Now, it is known that two intervals A and B overlap only when both
	// A.low <= B.high and A.high >= B.low. When searching the trees for
	// nodes overlapping with a given interval, you can immediately skip:
	//  a) all nodes to the right of nodes whose low value is past the end of the given interval.
	//  b) all nodes that have their maximum 'high' value below the start of the given interval.
	let node = T.root;
	let delta = 0;
	let nodeMaxEnd = 0;
	let nodeStart = 0;
	while (node !== SENTINEL) {
		if (node.visited) {
			// going up from this node
			node.left.visited = false;
			node.right.visited = false;
			if (node === node.parent.right) {
				delta -= node.parent.delta;
			}
			recomputeMaxEnd(node);
			node = node.parent;
			continue;
		}

		if (!node.left.visited) {
			// first time seeing this node
			nodeMaxEnd = delta + node.maxEnd;
			if (nodeMaxEnd < start) {
				// cover case b) from above
				// there is no need to search this node or its children
				node.visited = true;
				continue;
			}

			if (node.left !== SENTINEL) {
				// go left
				node = node.left;
				continue;
			}
		}

		// handle current node
		nodeStart = delta + node.start;
		if (nodeStart > end) {
			node.start += (textLength - (end - start));
			node.end += (textLength - (end - start));
			node.delta += (textLength - (end - start));
			// cover case a) from above
			// there is no need to search this node or its right subtree
			node.visited = true;
			continue;
		}

		node.visited = true;

		if (node.right !== SENTINEL && !node.right.visited) {
			// go right
			delta += node.delta;
			node = node.right;
			continue;
		}
	}

	if (T.root) {
		T.root.visited = false;
	}
}

//#endregion

//#region Searching

function nodeCount(T: IntervalTree): number {
	let node = T.root;
	let count = 0;
	while (node !== SENTINEL) {
		if (node.visited) {
			// going up from this node
			node.left.visited = false;
			node.right.visited = false;
			node = node.parent;
			continue;
		}

		if (node.left !== SENTINEL && !node.left.visited) {
			// go left
			node = node.left;
			continue;
		}

		// handle current node
		count++;
		node.visited = true;

		if (node.right !== SENTINEL && !node.right.visited) {
			// go right
			node = node.right;
			continue;
		}
	}

	if (T.root) {
		T.root.visited = false;
	}

	return count;
}

function collectNodesFromOwner(T: IntervalTree, ownerId: number): IntervalNode[] {
	let node = T.root;
	let result: IntervalNode[] = [];
	let resultLen = 0;
	while (node !== SENTINEL) {
		if (node.visited) {
			// going up from this node
			node.left.visited = false;
			node.right.visited = false;
			node = node.parent;
			continue;
		}

		if (node.left !== SENTINEL && !node.left.visited) {
			// go left
			node = node.left;
			continue;
		}

		// handle current node
		if (node.ownerId === ownerId) {
			result[resultLen++] = node;
		}

		node.visited = true;

		if (node.right !== SENTINEL && !node.right.visited) {
			// go right
			node = node.right;
			continue;
		}
	}

	if (T.root) {
		T.root.visited = false;
	}

	return result;
}

function search(T: IntervalTree, filterOwnerId: number, filterOutValidation: boolean, overviewRulerOnly: boolean, cachedVersionId: number): IntervalNode[] {
	let node = T.root;
	let delta = 0;
	let nodeStart = 0;
	let nodeEnd = 0;
	let result: IntervalNode[] = [];
	let resultLen = 0;
	while (node !== SENTINEL) {
		if (node.visited) {
			// going up from this node
			node.left.visited = false;
			node.right.visited = false;
			if (node === node.parent.right) {
				delta -= node.parent.delta;
			}
			node = node.parent;
			continue;
		}

		if (node.left !== SENTINEL && !node.left.visited) {
			// go left
			node = node.left;
			continue;
		}

		// handle current node
		nodeStart = delta + node.start;
		nodeEnd = delta + node.end;

		node.setCachedOffsets(nodeStart, nodeEnd, cachedVersionId);

		let include = true;
		if (filterOwnerId && node.ownerId && node.ownerId !== filterOwnerId) {
			include = false;
		}
		if (filterOutValidation && node.isForValidation) {
			include = false;
		}
		if (overviewRulerOnly && !node.options.overviewRuler.color) {
			include = false;
		}
		if (include) {
			result[resultLen++] = node;
		}

		node.visited = true;

		if (node.right !== SENTINEL && !node.right.visited) {
			// go right
			delta += node.delta;
			node = node.right;
			continue;
		}
	}

	if (T.root) {
		T.root.visited = false;
	}

	return result;
}

function intervalSearch(T: IntervalTree, intervalStart: number, intervalEnd: number, filterOwnerId: number, filterOutValidation: boolean, cachedVersionId: number): IntervalNode[] {
	// https://en.wikipedia.org/wiki/Interval_tree#Augmented_tree
	// Now, it is known that two intervals A and B overlap only when both
	// A.low <= B.high and A.high >= B.low. When searching the trees for
	// nodes overlapping with a given interval, you can immediately skip:
	//  a) all nodes to the right of nodes whose low value is past the end of the given interval.
	//  b) all nodes that have their maximum 'high' value below the start of the given interval.

	let node = T.root;
	let delta = 0;
	let nodeMaxEnd = 0;
	let nodeStart = 0;
	let nodeEnd = 0;
	let result: IntervalNode[] = [];
	let resultLen = 0;
	while (node !== SENTINEL) {
		if (node.visited) {
			// going up from this node
			node.left.visited = false;
			node.right.visited = false;
			if (node === node.parent.right) {
				delta -= node.parent.delta;
			}
			node = node.parent;
			continue;
		}

		if (!node.left.visited) {
			// first time seeing this node
			nodeMaxEnd = delta + node.maxEnd;
			if (nodeMaxEnd < intervalStart) {
				// cover case b) from above
				// there is no need to search this node or its children
				node.visited = true;
				continue;
			}

			if (node.left !== SENTINEL) {
				// go left
				node = node.left;
				continue;
			}
		}

		// handle current node
		nodeStart = delta + node.start;
		if (nodeStart > intervalEnd) {
			// cover case a) from above
			// there is no need to search this node or its right subtree
			node.visited = true;
			continue;
		}

		nodeEnd = delta + node.end;

		if (nodeEnd >= intervalStart) {
			// There is overlap
			node.setCachedOffsets(nodeStart, nodeEnd, cachedVersionId);

			let include = true;
			if (filterOwnerId && node.ownerId && node.ownerId !== filterOwnerId) {
				include = false;
			}
			if (filterOutValidation && node.isForValidation) {
				include = false;
			}

			if (include) {
				result[resultLen++] = node;
			}
		}

		node.visited = true;

		if (node.right !== SENTINEL && !node.right.visited) {
			// go right
			delta += node.delta;
			node = node.right;
			continue;
		}
	}

	if (T.root) {
		T.root.visited = false;
	}

	return result;
}

//#endregion

//#region Insertion
function rbTreeInsert(T: IntervalTree, newNode: IntervalNode): IntervalNode {
	if (T.root === SENTINEL) {
		newNode.parent = SENTINEL;
		newNode.left = SENTINEL;
		newNode.right = SENTINEL;
		newNode.color = NodeColor.Black;
		T.root = newNode;
		return T.root;
	}

	treeInsert(T, newNode);

	recomputeMaxEndWalkToRoot(newNode.parent);

	// repair tree
	let x = newNode;
	while (x !== T.root && x.parent.color === NodeColor.Red) {
		if (x.parent === x.parent.parent.left) {
			const y = x.parent.parent.right;

			if (y.color === NodeColor.Red) {
				x.parent.color = NodeColor.Black;
				y.color = NodeColor.Black;
				x.parent.parent.color = NodeColor.Red;
				x = x.parent.parent;
			} else {
				if (x === x.parent.right) {
					x = x.parent;
					leftRotate(T, x);
				}
				x.parent.color = NodeColor.Black;
				x.parent.parent.color = NodeColor.Red;
				rightRotate(T, x.parent.parent);
			}
		} else {
			const y = x.parent.parent.left;

			if (y.color === NodeColor.Red) {
				x.parent.color = NodeColor.Black;
				y.color = NodeColor.Black;
				x.parent.parent.color = NodeColor.Red;
				x = x.parent.parent;
			} else {
				if (x === x.parent.left) {
					x = x.parent;
					rightRotate(T, x);
				}
				x.parent.color = NodeColor.Black;
				x.parent.parent.color = NodeColor.Red;
				leftRotate(T, x.parent.parent);
			}
		}
	}

	T.root.color = NodeColor.Black;

	return newNode;
}

function treeInsert(T: IntervalTree, z: IntervalNode): void {
	let delta: number = 0;
	let x = T.root;
	const zAbsoluteStart = z.start;
	const zAbsoluteEnd = z.end;
	while (true) {
		const cmp = intervalCompare(zAbsoluteStart, zAbsoluteEnd, x.start + delta, x.end + delta);
		if (cmp < 0) {
			// this node should be inserted to the left
			// => it is not affected by the node's delta
			if (x.left === SENTINEL) {
				z.start -= delta;
				z.end -= delta;
				z.maxEnd -= delta;
				x.left = z;
				break;
			} else {
				x = x.left;
			}
		} else {
			// this node should be inserted to the right
			// => it is not affected by the node's delta
			if (x.right === SENTINEL) {
				z.start -= (delta + x.delta);
				z.end -= (delta + x.delta);
				z.maxEnd -= (delta + x.delta);
				x.right = z;
				break;
			} else {
				delta += x.delta;
				x = x.right;
			}
		}
	}

	z.parent = x;
	z.left = SENTINEL;
	z.right = SENTINEL;
	z.color = NodeColor.Red;
}
//#endregion

//#region Deletion
function rbTreeDelete(T: IntervalTree, z: IntervalNode): void {

	let x: IntervalNode;
	let y: IntervalNode;

	// RB-DELETE except we don't swap z and y in case c)
	// i.e. we always delete what's pointed at by z.

	if (z.left === SENTINEL) {
		x = z.right;
		y = z;

		// x's delta is no longer influenced by z's delta
		x.delta += z.delta;
		x.start += z.delta;
		x.end += z.delta;

	} else if (z.right === SENTINEL) {
		x = z.left;
		y = z;

	} else {
		y = leftest(z.right);
		x = y.right;

		// y's delta is no longer influenced by z's delta,
		// but we don't want to walk the entire right-hand-side subtree of x.
		// we therefore maintain z's delta in y, and adjust only x
		x.start += y.delta;
		x.end += y.delta;
		x.delta += y.delta;

		y.start += z.delta;
		y.end += z.delta;
		y.delta = z.delta;
	}

	if (y === T.root) {
		T.root = x;
		x.color = NodeColor.Black;

		z.detach();
		resetSentinel();
		recomputeMaxEnd(x);
		T.root.parent = SENTINEL;
		return;
	}

	let yWasRed = (y.color === NodeColor.Red);

	if (y === y.parent.left) {
		y.parent.left = x;
	} else {
		y.parent.right = x;
	}

	if (y === z) {
		x.parent = y.parent;
	} else {

		if (y.parent === z) {
			x.parent = y;
		} else {
			x.parent = y.parent;
		}

		y.left = z.left;
		y.right = z.right;
		y.parent = z.parent;
		y.color = z.color;

		if (z === T.root) {
			T.root = y;
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
	}

	z.detach();

	if (yWasRed) {
		recomputeMaxEndWalkToRoot(x.parent);
		if (y !== z) {
			recomputeMaxEndWalkToRoot(y);
			recomputeMaxEndWalkToRoot(y.parent);
		}
		resetSentinel();
		return;
	}

	recomputeMaxEndWalkToRoot(x);
	recomputeMaxEndWalkToRoot(x.parent);
	if (y !== z) {
		recomputeMaxEndWalkToRoot(y);
		recomputeMaxEndWalkToRoot(y.parent);
	}

	// RB-DELETE-FIXUP
	let w: IntervalNode;
	while (x !== T.root && x.color === NodeColor.Black) {

		if (x === x.parent.left) {
			w = x.parent.right;

			if (w.color === NodeColor.Red) {
				w.color = NodeColor.Black;
				x.parent.color = NodeColor.Red;
				leftRotate(T, x.parent);
				w = x.parent.right;
			}

			if (w.left.color === NodeColor.Black && w.right.color === NodeColor.Black) {
				w.color = NodeColor.Red;
				x = x.parent;
			} else {
				if (w.right.color === NodeColor.Black) {
					w.left.color = NodeColor.Black;
					w.color = NodeColor.Red;
					rightRotate(T, w);
					w = x.parent.right;
				}

				w.color = x.parent.color;
				x.parent.color = NodeColor.Black;
				w.right.color = NodeColor.Black;
				leftRotate(T, x.parent);
				x = T.root;
			}

		} else {
			w = x.parent.left;

			if (w.color === NodeColor.Red) {
				w.color = NodeColor.Black;
				x.parent.color = NodeColor.Red;
				rightRotate(T, x.parent);
				w = x.parent.left;
			}

			if (w.left.color === NodeColor.Black && w.right.color === NodeColor.Black) {
				w.color = NodeColor.Red;
				x = x.parent;

			} else {
				if (w.left.color === NodeColor.Black) {
					w.right.color = NodeColor.Black;
					w.color = NodeColor.Red;
					leftRotate(T, w);
					w = x.parent.left;
				}

				w.color = x.parent.color;
				x.parent.color = NodeColor.Black;
				w.left.color = NodeColor.Black;
				rightRotate(T, x.parent);
				x = T.root;
			}
		}
	}

	x.color = NodeColor.Black;
	resetSentinel();
}

function leftest(node: IntervalNode): IntervalNode {
	while (node.left !== SENTINEL) {
		node = node.left;
	}
	return node;
}

function resetSentinel(): void {
	SENTINEL.parent = SENTINEL;
	SENTINEL.delta = 0; // optional
	SENTINEL.start = 0; // optional
	SENTINEL.end = 0; // optional
}
//#endregion

//#region Rotations
function leftRotate(T: IntervalTree, x: IntervalNode): void {
	const y = x.right;				// set y.

	y.delta += x.delta;				// y's delta is no longer influenced by x's delta
	y.start += x.delta;
	y.end += x.delta;

	x.right = y.left;				// turn y's left subtree into x's right subtree.
	if (y.left !== SENTINEL) {
		y.left.parent = x;
	}
	y.parent = x.parent;			// link x's parent to y.
	if (x.parent === SENTINEL) {
		T.root = y;
	} else if (x === x.parent.left) {
		x.parent.left = y;
	} else {
		x.parent.right = y;
	}

	y.left = x;						// put x on y's left.
	x.parent = y;

	recomputeMaxEnd(x);
	recomputeMaxEnd(y);
}

function rightRotate(T: IntervalTree, y: IntervalNode): void {
	const x = y.left;

	y.delta -= x.delta;
	y.start -= x.delta;
	y.end -= x.delta;

	y.left = x.right;
	if (x.right !== SENTINEL) {
		x.right.parent = y;
	}
	x.parent = y.parent;
	if (y.parent === SENTINEL) {
		T.root = x;
	} else if (y === y.parent.right) {
		y.parent.right = x;
	} else {
		y.parent.left = x;
	}

	x.right = y;
	y.parent = x;

	recomputeMaxEnd(y);
	recomputeMaxEnd(x);
}
//#endregion

//#region max end computation

function computeMaxEnd(node: IntervalNode): number {
	let maxEnd = node.end;
	if (node.left !== SENTINEL) {
		const leftMaxEnd = node.left.maxEnd;
		if (leftMaxEnd > maxEnd) {
			maxEnd = leftMaxEnd;
		}
	}
	if (node.right !== SENTINEL) {
		const rightMaxEnd = node.right.maxEnd + node.delta;
		if (rightMaxEnd > maxEnd) {
			maxEnd = rightMaxEnd;
		}
	}
	return maxEnd;
}

function recomputeMaxEnd(node: IntervalNode): void {
	node.maxEnd = computeMaxEnd(node);
}

function recomputeMaxEndWalkToRoot(node: IntervalNode): void {
	while (node !== SENTINEL) {

		const maxEnd = computeMaxEnd(node);

		if (node.maxEnd === maxEnd) {
			// no need to go further
			return;
		}

		node.maxEnd = maxEnd;
		node = node.parent;
	}
}

//#endregion

//#region utils
function intervalCompare(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
	if (aStart === bStart) {
		return aEnd - bEnd;
	}
	return aStart - bStart;
}
//#endregion

//#region Assertion

function depth(n: IntervalNode): number {
	if (n === SENTINEL) {
		// The leafs are black
		return 1;
	}
	assert(depth(n.left) === depth(n.right));
	return (n.color === NodeColor.Black ? 1 : 0) + depth(n.left);
}

function assertValidNode(n: IntervalNode, delta): void {
	if (n === SENTINEL) {
		return;
	}

	let l = n.left;
	let r = n.right;

	if (n.color === NodeColor.Red) {
		assert(l.color === NodeColor.Black);
		assert(r.color === NodeColor.Black);
	}

	let expectedMaxEnd = n.end;
	if (l !== SENTINEL) {
		assert(intervalCompare(l.start + delta, l.end + delta, n.start + delta, n.end + delta) <= 0);
		expectedMaxEnd = Math.max(expectedMaxEnd, l.maxEnd);
	}
	if (r !== SENTINEL) {
		assert(intervalCompare(n.start + delta, n.end + delta, r.start + delta + n.delta, r.end + delta + n.delta) <= 0);
		expectedMaxEnd = Math.max(expectedMaxEnd, r.maxEnd + n.delta);
	}
	assert(n.maxEnd === expectedMaxEnd);

	assertValidNode(l, delta);
	assertValidNode(r, delta + n.delta);
}

function assertValidTree(tree: IntervalTree): void {
	if (tree.root === SENTINEL) {
		return;
	}
	assert(tree.root.color === NodeColor.Black);
	assert(depth(tree.root.left) === depth(tree.root.right));
	assertValidNode(tree.root, 0);
}

function assert(condition: boolean): void {
	if (!condition) {
		throw new Error('Assertion violation');
	}
}

//#endregion
