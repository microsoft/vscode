/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Point, SyntaxNode } from 'web-tree-sitter';
import { BugIndicatingError } from '../../../util/vs/base/common/errors';
import { Range, Uri } from '../../../vscodeTypes';

export interface TreeSitterOffsetRange {
	startIndex: number;
	endIndex: number;
}

export interface TreeSitterExpressionInfo extends TreeSitterOffsetRange {
	version?: number;
	identifier: string;
	text: string;
}

export interface TreeSitterExpressionLocationInfo extends TreeSitterOffsetRange {
	text: string;
	version?: number;
	uri?: Uri;
	range?: Range;
	identifier?: string;
}

export interface TreeSitterPoint {
	row: number;
	column: number;
}

export interface TreeSitterPointRange {
	startPosition: TreeSitterPoint;
	endPosition: TreeSitterPoint;
}

/** Util functions to deal with `TreeSitterOffsetRange` type */
export const TreeSitterOffsetRange = {
	/** check if `container` contains `containee` (non-strict, ie [0, 3] contains [0, 3] */
	doesContain: (container: TreeSitterOffsetRange, containee: TreeSitterOffsetRange): boolean => container.startIndex <= containee.startIndex && containee.endIndex <= container.endIndex,

	ofSyntaxNode: (n: SyntaxNode): TreeSitterOffsetRange => ({ startIndex: n.startIndex, endIndex: n.endIndex }),

	/** sort by `node.startIndex`, break ties by `node.endIndex` (so that nodes with same start index are sorted in descending order) */
	compare: (a: TreeSitterOffsetRange, b: TreeSitterOffsetRange): number => a.startIndex - b.startIndex || b.endIndex - a.endIndex,
	isEqual: (a: TreeSitterOffsetRange, b: TreeSitterOffsetRange): boolean => TreeSitterOffsetRange.compare(a, b) === 0,

	doIntersect: (a: TreeSitterOffsetRange, b: TreeSitterOffsetRange) => {
		const start = Math.max(a.startIndex, b.startIndex);
		const end = Math.min(a.endIndex, b.endIndex);
		return start < end;
	},

	len: (n: TreeSitterOffsetRange) => n.endIndex - n.startIndex,

	/** Given offset ranges [a0, a1] and [b0, b1], returns overlap size */
	intersectionSize: (a: TreeSitterOffsetRange, b: TreeSitterOffsetRange): number => {
		const start = Math.max(a.startIndex, b.startIndex);
		const end = Math.min(a.endIndex, b.endIndex);
		return Math.max(end - start, 0);
	},

	/** Check the given object extends TreeSitterOffsetRange  */
	isTreeSitterOffsetRange(obj: any): obj is TreeSitterOffsetRange {
		return typeof obj.startIndex === 'number' && typeof obj.endIndex === 'number';
	},
};

export const TreeSitterPoint = {

	isEqual(n: TreeSitterPoint, other: TreeSitterPoint): boolean {
		return n.row === other.row && n.column === other.column;
	},

	isBefore(n: TreeSitterPoint, other: TreeSitterPoint): boolean {
		if (n.row < other.row || (n.row === other.row && n.column < other.column)) {
			return true;
		}
		return false;
	},

	isAfter(n: TreeSitterPoint, other: TreeSitterPoint): boolean {
		return TreeSitterPoint.isBefore(other, n);
	},

	isBeforeOrEqual(n: TreeSitterPoint, other: TreeSitterPoint): boolean {
		const isBefore = TreeSitterPoint.isBefore(n, other);
		const isEqual = TreeSitterPoint.isEqual(n, other);
		if (isBefore || isEqual) {
			return true;
		}
		return false;
	},

	equals(n: TreeSitterPoint, other: TreeSitterPoint): boolean {
		return n.column === other.column && n.row === other.row;
	},

	isAfterOrEqual(n: TreeSitterPoint, other: TreeSitterPoint): boolean {
		return TreeSitterPoint.isBeforeOrEqual(other, n);
	},

	ofPoint: (n: Point): TreeSitterPoint => ({
		row: n.row,
		column: n.column
	}),
};

export const TreeSitterPointRange = {

	/** check if `container` contains `containee` (non-strict) */
	doesContain: (container: TreeSitterPointRange, containee: TreeSitterPointRange): boolean => {
		return TreeSitterPoint.isBeforeOrEqual(container.startPosition, containee.startPosition) && TreeSitterPoint.isAfterOrEqual(container.endPosition, containee.endPosition);
	},

	equals: (a: TreeSitterPointRange, b: TreeSitterPointRange): boolean => {
		return TreeSitterPoint.equals(a.startPosition, b.startPosition) && TreeSitterPoint.equals(a.endPosition, b.endPosition);
	},

	ofSyntaxNode: (n: SyntaxNode): TreeSitterPointRange => ({
		startPosition: n.startPosition,
		endPosition: n.endPosition
	}),
};

export interface Node extends TreeSitterOffsetRange {
	type: string;
}

export const Node = {
	ofSyntaxNode: (n: SyntaxNode) => ({
		type: n.type,
		startIndex: n.startIndex,
		endIndex: n.endIndex,
	}),
};

export interface TreeSitterChunkHeaderInfo extends TreeSitterOffsetRange {
	text: string;
	range: TreeSitterPointRange;
}

export const TreeSitterChunkHeaderInfo = {
	ofSyntaxNode: (n: SyntaxNode): TreeSitterChunkHeaderInfo => ({
		range: TreeSitterPointRange.ofSyntaxNode(n),
		startIndex: n.startIndex,
		text: n.text,
		endIndex: n.endIndex,
	}),
};

/**
 * Represents a node in the overlay tree.
 */
export class OverlayNode {
	constructor(
		public readonly startIndex: number,
		public readonly endIndex: number,
		/**
		 * @example `class_declaration`
		 */
		public kind: string, // TODO@ulugbekna: come up with more generic kinds so that these aren't per-language, then use enum?
		public readonly children: OverlayNode[],
	) {
		if (startIndex > endIndex) {
			throw new BugIndicatingError('startIndex must be less than endIndex');
		}
		let minStartIndex = startIndex;
		for (const child of children) {
			if (child.startIndex < minStartIndex) {
				throw new BugIndicatingError('Invalid child startIndex');
			}
			if (child.endIndex > endIndex) {
				throw new BugIndicatingError('Invalid child endIndex');
			}
			minStartIndex = Math.max(child.endIndex, minStartIndex);
		}
	}

	toString() {
		const printedNodes: string[] = [];
		function toString(node: OverlayNode, indent = '') {
			printedNodes.push(`${indent}${node.kind} [${node.startIndex}, ${node.endIndex}]`);
			node.children.forEach(child => toString(child, indent + '    '));
		}
		toString(this);
		return printedNodes.join('\n');
	}
}
