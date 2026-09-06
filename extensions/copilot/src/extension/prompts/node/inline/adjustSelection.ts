/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractDocument } from '../../../../platform/editing/common/abstractText';
import { OverlayNode } from '../../../../platform/parser/node/nodes';
import { binarySearch2, equals } from '../../../../util/vs/base/common/arrays';
import { CharCode } from '../../../../util/vs/base/common/charCode';
import { BugIndicatingError } from '../../../../util/vs/base/common/errors';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { Range } from '../../../../vscodeTypes';

export function getAdjustedSelection<TDocument extends AbstractDocument>(
	ast: OverlayNode,
	document: TDocument,
	userSelection: Range,
): { adjusted: OffsetRange; original: OffsetRange } {
	const documentText = document.getText();
	const astWithoutWs = alignOverlayNodesToNonWsText(ast, documentText);
	const root = LinkedOverlayNode.convertToLinkedTree(documentText, astWithoutWs ?? ast);
	const start = document.getOffsetAtPosition(userSelection.start);
	const end = document.getOffsetAtPosition(userSelection.end);
	const adjustedSelection = markSelectedNodes(root, start, end);
	return { adjusted: adjustedSelection, original: new OffsetRange(start, end) };
}

function alignOverlayNodesToNonWsText(ast: OverlayNode, text: string): OverlayNode | undefined {
	const newStartIndex = alignToNonWsTextRight(ast.startIndex, text);
	const newEndIndex = Math.max(newStartIndex, alignToNonWsTextLeft(ast.endIndex, text));
	if (newStartIndex === newEndIndex) { // indentation-based structure can include nodes which can just contain newlines
		return undefined;
	}
	const arr = ast.children.map(child => alignOverlayNodesToNonWsText(child, text)).filter(s => s !== undefined);
	if (newStartIndex === ast.startIndex && newEndIndex === ast.endIndex && equals(arr, ast.children)) {
		return ast;
	}
	return new OverlayNode(newStartIndex, newEndIndex, ast.kind, arr);
}

function alignToNonWsTextRight(idx: number, str: string): number {
	while (idx < str.length) {
		const ch = str.charCodeAt(idx);
		if (ch !== CharCode.Space && ch !== CharCode.Tab && ch !== CharCode.LineFeed && ch !== CharCode.CarriageReturn) {
			return idx;
		}
		idx++;
	}
	return idx;
}

function alignToNonWsTextLeft(idx: number, str: string): number {
	while (idx > 0) {
		const ch = str.charCodeAt(idx - 1);
		if (ch !== CharCode.Space && ch !== CharCode.Tab && ch !== CharCode.LineFeed && ch !== CharCode.CarriageReturn) {
			return idx;
		}
		idx--;
	}
	return idx;
}

function markSelectedNodes(root: LinkedOverlayNode, start: number, end: number) {
	[start, end] = moveTowardsContent(root, start, end);
	return adjustSelection(root, start, end);
}

/**
 * If the selection sits on whitespace, move it towards the closest content
 */
function moveTowardsContent(root: LinkedOverlayNode, initialStart: number, initialEnd: number): [number, number] {
	const selectedText = root.text.substring(initialStart, initialEnd);
	const selectedTextIsEmptyOrWhitespace = /^\s*$/.test(selectedText);
	if (!selectedTextIsEmptyOrWhitespace) {
		return [initialStart, initialEnd];
	}
	let start = initialStart;
	let end = initialEnd;
	let goLeft = true;
	let goRight = true;
	do {
		if (goRight && end >= root.text.length) {
			// can't go right anymore
			goRight = false;
		}
		if (goRight) {
			const nextCharCode = root.text.charCodeAt(end);
			if (nextCharCode === CharCode.CarriageReturn || nextCharCode === CharCode.LineFeed) {
				// Hit the EOL
				goRight = false;
			} else if (nextCharCode !== CharCode.Space && nextCharCode !== CharCode.Tab) {
				// Hit real content
				return [end, end + 1];
			} else {
				end++;
			}
		}
		if (goLeft && start === 0) {
			// can't go left anymore
			goLeft = false;
		}
		if (goLeft) {
			const prevCharCode = root.text.charCodeAt(start - 1);
			if (prevCharCode === CharCode.CarriageReturn || prevCharCode === CharCode.LineFeed) {
				// Hit the EOL
				goLeft = false;
			} else if (prevCharCode !== CharCode.Space && prevCharCode !== CharCode.Tab) {
				// Hit real content
				return [start - 1, start];
			} else {
				start--;
			}
		}
	} while (goLeft || goRight);

	// Couldn't find real content
	return [initialStart, initialEnd];
}

function adjustSelection(root: LinkedOverlayNode, start: number, end: number): OffsetRange {
	// If the selection starts at the end of a line with content, move over the line feed
	if (start > 0 && start < end && root.text.charCodeAt(start - 1) !== CharCode.LineFeed && root.text.charCodeAt(start) === CharCode.LineFeed) {
		start++;
	}

	start = moveToStartOfLineOverWhitespace(root, start);
	end = moveToEndOfLineOverWhitespace(root, end);

	let startNode = root.findLeaf2(start);
	let endNode = root.findLeaf2(end);

	let hasChanged = false;

	const extendStart = (newStart: number) => {
		if (newStart < start) {
			start = moveToStartOfLineOverWhitespace(root, newStart);
			hasChanged = true;
			startNode = root.findLeaf2(start);
		}
	};

	const extendEnd = (newEnd: number) => {
		if (newEnd > end) {
			end = moveToEndOfLineOverWhitespace(root, newEnd);
			hasChanged = true;
			endNode = root.findLeaf2(end);
		}
	};

	do {
		hasChanged = false;

		if (startNode instanceof LinkedOverlayNodeGap) {
			const matchingGap = (startNode.isFirstGapInParent ? startNode.parent.lastGap : null);
			const hasSelectedContentInGap = startNode.hasSelectedContent(start, end);
			const hasSelectedContentInMatchingGap = (matchingGap && matchingGap.hasSelectedContent(start, end));
			const extendSelection = (hasSelectedContentInGap || hasSelectedContentInMatchingGap);
			if (extendSelection) {
				extendStart(startNode.firstNonWhitespaceIndex);
			}
			if (extendSelection && matchingGap) {
				extendEnd(matchingGap.lastNonWhitespaceIndex + 1);
			}
		}

		if (endNode instanceof LinkedOverlayNodeGap) {
			const matchingFirstGap = (endNode.isLastGapInParent ? endNode.parent.firstGap : null);
			const hasSelectedContentInGap = endNode.hasSelectedContent(start, end);
			const hasSelectedContentInFirstGap = (matchingFirstGap && matchingFirstGap.hasSelectedContent(start, end));
			const extendSelection = (hasSelectedContentInGap || hasSelectedContentInFirstGap);
			if (extendSelection && endNode.lastNonWhitespaceIndex + 1 > end) {
				extendEnd(endNode.lastNonWhitespaceIndex + 1);
			}
			if (extendSelection && matchingFirstGap) {
				extendStart(matchingFirstGap.firstNonWhitespaceIndex);
			}
		}

		if (startNode instanceof LinkedOverlayNode && root.hasContentInRange(new OffsetRange(start, end))) {
			// Hit a leaf!
			if (startNode.startIndex < start) {
				extendStart(startNode.startIndex);
			}
		}

		if (endNode instanceof LinkedOverlayNode && root.hasContentInRange(new OffsetRange(start, end))) {
			// Hit a leaf!
			if (endNode.endIndex > end) {
				extendEnd(endNode.endIndex);
			}
		}

	} while (hasChanged);

	return new OffsetRange(start, end);
}

function moveToStartOfLineOverWhitespace(root: LinkedOverlayNode, start: number): number {
	// Move start to the start of the line if it only goes over whitespace
	while (start > 0) {
		const charCodeBeforeSelection = root.text.charCodeAt(start - 1);
		if (charCodeBeforeSelection !== CharCode.Space && charCodeBeforeSelection !== CharCode.Tab) {
			break;
		}
		start--;
	}
	return start;
}

function moveToEndOfLineOverWhitespace(root: LinkedOverlayNode, end: number): number {
	const charCodeBefore = end > 0 ? root.text.charCodeAt(end - 1) : CharCode.Null;
	if (charCodeBefore === CharCode.LineFeed) {
		// Do not leave first character of the line
		return end;
	}

	// Move end to the end of the line if it only goes over whitespace
	while (end < root.text.length) {
		const charCodeAfterSelection = root.text.charCodeAt(end);
		if (charCodeAfterSelection !== CharCode.Space && charCodeAfterSelection !== CharCode.Tab) {
			break;
		}
		end++;
	}
	return end;
}

function debugstr(str: string) {
	return str.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

/**
 * A tree datastructure which has parent pointers and markers if a node will survive or not.
 */
export class LinkedOverlayNode {

	public static convertToLinkedTree(text: string, root: OverlayNode): LinkedOverlayNode {
		const linkedRoot = new LinkedOverlayNode(text, null, root.startIndex, root.endIndex, root.kind, [], 0); // parentChildIndex
		LinkedOverlayNode._convertChildrenToLinkedTree(text, root, linkedRoot); // Start with depth 1
		return linkedRoot;
	}

	private static _convertChildrenToLinkedTree(text: string, overlayNode: OverlayNode, linkedNode: LinkedOverlayNode) {
		for (let i = 0; i < overlayNode.children.length; i++) {
			const child = overlayNode.children[i];
			const linkedChild = new LinkedOverlayNode(text, linkedNode, child.startIndex, child.endIndex, child.kind, [], i);
			linkedNode.children.push(linkedChild);
			LinkedOverlayNode._convertChildrenToLinkedTree(text, child, linkedChild);
		}
	}

	constructor(
		private readonly _originalText: string,
		public readonly parent: LinkedOverlayNode | null,
		public readonly startIndex: number,
		public readonly endIndex: number,
		public readonly kind: string, // TODO@ulugbekna: come up with more generic kinds so that these aren't per-language, then use enum?
		public readonly children: LinkedOverlayNode[],
		private readonly myIndex: number, // Added parentChildIndex field
	) { }

	public get text(): string {
		return this._originalText.substring(this.startIndex, this.endIndex);
	}

	public textAt(range: OffsetRange): string {
		return range.substring(this._originalText);
	}

	/**
	 * Intersects the selection with this node's range to check if there is any non-whitespace text selected from this gap.
	 */
	public hasContentInRange(range: OffsetRange): boolean {
		const content = this.textAt(range);
		return !/^\s*$/s.test(content);
	}

	public toString(): string {
		return `Node (${this.startIndex}-${this.endIndex}) ${debugstr(this._originalText.substring(this.startIndex, this.endIndex))}`;
	}

	gapBeforeChild(childIndex: number): LinkedOverlayNodeGap {
		const startIndex = (childIndex === 0 ? this.startIndex : this.children[childIndex - 1].endIndex);
		const endIndex = (childIndex === this.children.length ? this.endIndex : this.children[childIndex].startIndex);
		return new LinkedOverlayNodeGap(this._originalText, this, startIndex, endIndex, childIndex);
	}

	childAt(childIndex: number): LinkedOverlayNode | null {
		return this.children[childIndex] ?? null;
	}

	public get firstGap(): LinkedOverlayNodeGap | null {
		if (this.children.length === 0) {
			// there are no gaps
			return null;
		}
		return this.gapBeforeChild(0);
	}

	public get lastGap(): LinkedOverlayNodeGap | null {
		if (this.children.length === 0) {
			// there are no gaps
			return null;
		}
		return this.gapBeforeChild(this.children.length);
	}

	/**
	 * @return The deepest node which contains the offset. If the node is a leaf, the second pair result is 0.
	 *   If the node is not a leaf, the second pair result will be -(n+1) (or ~n, using bitwise notation),
	 *   where n is the index of the child before which the offset lies. (i.e. offset lies between children n-1 and n)
	 */
	public findLeaf(offset: number): [LinkedOverlayNode, number] {
		if (this.children.length === 0) {
			return [this, 0];
		}

		const index = binarySearch2(this.children.length, (index) => {
			const child = this.children[index];
			if (offset >= child.startIndex && offset <= child.endIndex) {
				return 0;
			} else if (offset < child.startIndex) {
				return 1;
			} else {
				return -1;
			}
		});

		if (index < 0) {
			return [this, index];
		}

		return this.children[index].findLeaf(offset);
	}

	public findLeaf2(offset: number): LinkedOverlayNodeOrGap {
		const [leaf, leafChildGapIndex] = this.findLeaf(offset);
		if (leafChildGapIndex < 0) {
			return leaf.gapBeforeChild(~leafChildGapIndex);
		}
		return leaf;
	}

	public get nextLeaf(): LinkedOverlayNode | null {
		let currentNode: LinkedOverlayNode | null = this;
		do {
			const nextSibling = currentNode.nextSibling;
			if (nextSibling) {
				return nextSibling.leftMostLeafChild;
			}
			// go up until finding a next sibling
			currentNode = currentNode.parent;
		} while (currentNode);
		return null;
	}

	public get leftMostLeafChild(): LinkedOverlayNode {
		let currentNode: LinkedOverlayNode = this;
		while (currentNode.children.length > 0) {
			currentNode = currentNode.children[0];
		}
		return currentNode;
	}

	public get prevSibling(): LinkedOverlayNode | null {
		const parent = this.parent;
		const prevIndex = this.myIndex - 1;
		return (parent && prevIndex >= 0) ? parent.children[prevIndex] : null;
	}

	public get nextSibling(): LinkedOverlayNode | null {
		const parent = this.parent;
		const nextIndex = this.myIndex + 1;
		return (parent && nextIndex < parent.children.length) ? parent.children[nextIndex] : null;
	}
}

/**
 * Represents a gap (before the first child, between two children, or after the last child) in a `LinkedOverlayNode`.
 */
class LinkedOverlayNodeGap {

	constructor(
		private readonly _originalText: string,
		public readonly parent: LinkedOverlayNode,
		public readonly startIndex: number,
		public readonly endIndex: number,
		public readonly gapIndex: number,
	) {
		if (this.startIndex > this.endIndex) {
			throw new BugIndicatingError('Invalid gap');
		}
	}

	public get range(): OffsetRange {
		return new OffsetRange(this.startIndex, this.endIndex);
	}

	public get isFirstGapInParent(): boolean {
		return this.gapIndex === 0;
	}

	public get isLastGapInParent(): boolean {
		return this.gapIndex === this.parent.children.length;
	}

	public toString(): string {
		return `NodeGap (${this.startIndex}-${this.endIndex}) ${debugstr(this._originalText.substring(this.startIndex, this.endIndex))}`;
	}

	public get text(): string {
		return this._originalText.substring(this.startIndex, this.endIndex);
	}

	/**
	 * Intersects the selection with this node's range to check if there is any non-whitespace text selected from this gap.
	 */
	public hasSelectedContent(start: number, end: number): boolean {
		const selectedGapRange = this.range.intersect(new OffsetRange(start, end));
		const selectedGapText = selectedGapRange ? this._originalText.substring(selectedGapRange.start, selectedGapRange.endExclusive) : '';
		return !/^\s*$/s.test(selectedGapText);
	}

	public get firstNonWhitespaceIndex(): number {
		let index = this.startIndex;
		while (index < this.endIndex) {
			const charCode = this._originalText.charCodeAt(index);
			if (charCode !== CharCode.Tab && charCode !== CharCode.Space && charCode !== CharCode.LineFeed) {
				return index;
			}
			index++;
		}
		return this.endIndex;
	}

	public get lastNonWhitespaceIndex(): number {
		let index = this.endIndex - 1;
		while (index >= this.startIndex) {
			const charCode = this._originalText.charCodeAt(index);
			if (charCode !== CharCode.Tab && charCode !== CharCode.Space && charCode !== CharCode.LineFeed) {
				return index;
			}
			index--;
		}
		return this.startIndex - 1;
	}

	public get nextLeaf(): LinkedOverlayNode | null {
		const nextSibling = this.parent.childAt(this.gapIndex);
		return nextSibling ? nextSibling.leftMostLeafChild : this.parent.nextLeaf;
	}

}

type LinkedOverlayNodeOrGap = LinkedOverlayNode | LinkedOverlayNodeGap;
