/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tail } from 'vs/base/common/arrays';
import { SmallImmutableSet } from './smallImmutableSet';
import { lengthAdd, lengthZero, Length, lengthHash } from './length';

export const enum AstNodeKind {
	Text = 0,
	Bracket = 1,
	Pair = 2,
	UnexpectedClosingBracket = 3,
	List = 4,
}

export type AstNode = PairAstNode | ListAstNode | BracketAstNode | InvalidBracketAstNode | TextAstNode;

abstract class BaseAstNode {
	abstract readonly kind: AstNodeKind;
	abstract readonly children: readonly AstNode[];
	abstract readonly missingBracketIds: SmallImmutableSet<number>;

	/**
	 * In case of a list, determines the height of the (2,3) tree.
	*/
	abstract readonly listHeight: number;

	abstract canBeReused(
		expectedClosingCategories: SmallImmutableSet<number>,
		endLineDidChange: boolean
	): boolean;

	/**
	 * Flattenes all lists in this AST. Only for debugging.
	 */
	abstract flattenLists(): AstNode;

	/**
	 * Creates a deep clone.
	 */
	abstract clone(): AstNode;

	protected _length: Length;

	get length(): Length {
		return this._length;
	}

	constructor(length: Length) {
		this._length = length;
	}
}

export class PairAstNode extends BaseAstNode {
	public static create(
		openingBracket: BracketAstNode,
		child: AstNode | null,
		closingBracket: BracketAstNode | null
	) {
		const length = computeLength(openingBracket, child, closingBracket);

		const children = new Array(1);
		children[0] = openingBracket;
		if (child) {
			children.push(child);
		}
		if (closingBracket) {
			children.push(closingBracket);
		}

		return new PairAstNode(length, children, child ? child.missingBracketIds : SmallImmutableSet.getEmpty());
	}

	get kind(): AstNodeKind.Pair {
		return AstNodeKind.Pair;
	}
	get listHeight() {
		return 0;
	}

	canBeReused(
		openedBracketIds: SmallImmutableSet<number>,
		endLineDidChange: boolean
	) {
		if (this.closingBracket === null) {
			// Unclosed pair ast nodes only
			// end at the end of the document
			// or when a parent node is closed.

			// This could be improved:
			// Only return false if some next token is neither "undefined" nor a bracket that closes a parent.

			return false;
		}

		if (openedBracketIds.intersects(this.missingBracketIds)) {
			return false;
		}

		return true;
	}

	flattenLists(): PairAstNode {
		return PairAstNode.create(
			this.openingBracket.flattenLists(),
			this.child && this.child.flattenLists(),
			this.closingBracket && this.closingBracket.flattenLists()
		);
	}

	get openingBracket(): BracketAstNode {
		return this.children[0] as BracketAstNode;
	}

	get child(): AstNode | null {
		if (this.children.length <= 1) {
			return null;
		}
		if (this.children[1].kind === AstNodeKind.Bracket) {
			return null;
		}
		return this.children[1] || null;
	}

	get closingBracket(): BracketAstNode | null {
		if (this.children.length <= 1) {
			return null;
		}
		if (this.children[1].kind === AstNodeKind.Bracket) {
			return this.children[1] || null;
		}
		return (this.children[2] as BracketAstNode) || null;
	}

	private constructor(
		length: Length,
		public readonly children: readonly AstNode[],
		public readonly missingBracketIds: SmallImmutableSet<number>
	) {
		super(length);
	}

	clone(): PairAstNode {
		return new PairAstNode(
			this.length,
			clone(this.children),
			this.missingBracketIds
		);
	}
}

function computeLength(openingBracket: BracketAstNode, child: AstNode | null, closingBracket: BracketAstNode | null): Length {
	let length = openingBracket.length;
	if (child) {
		length = lengthAdd(length, child.length);
	}
	if (closingBracket) {
		length = lengthAdd(length, closingBracket.length);
	}
	return length;
}

export class ListAstNode extends BaseAstNode {
	public static create(items: AstNode[]): ListAstNode {
		if (items.length === 0) {
			return new ListAstNode(lengthZero, 0, items, SmallImmutableSet.getEmpty());
		} else {
			let length = items[0].length;
			let unopenedBrackets = items[0].missingBracketIds;
			for (let i = 1; i < items.length; i++) {
				length = lengthAdd(length, items[i].length);
				unopenedBrackets = unopenedBrackets.merge(items[i].missingBracketIds);
			}
			return new ListAstNode(length, items[0].listHeight + 1, items, unopenedBrackets);
		}
	}

	get kind(): AstNodeKind.List {
		return AstNodeKind.List;
	}
	get children(): readonly AstNode[] {
		return this._items;
	}
	get missingBracketIds(): SmallImmutableSet<number> {
		return this._unopenedBrackets;
	}

	private constructor(
		length: Length,
		public readonly listHeight: number,
		private readonly _items: AstNode[],
		private _unopenedBrackets: SmallImmutableSet<number>
	) {
		super(length);
	}

	canBeReused(
		openedBracketIds: SmallImmutableSet<number>,
		endLineDidChange: boolean
	): boolean {
		if (this._items.length === 0) {
			// might not be very helpful
			return true;
		}

		if (openedBracketIds.intersects(this.missingBracketIds)) {
			return false;
		}

		let lastChild: AstNode = this;
		while (lastChild.children.length > 0 && lastChild.kind === AstNodeKind.List) {
			lastChild = tail(lastChild.children);
		}

		return lastChild.canBeReused(
			openedBracketIds,
			endLineDidChange
		);
	}

	flattenLists(): ListAstNode {
		const items = new Array<AstNode>();
		for (const c of this.children) {
			const normalized = c.flattenLists();
			if (normalized.kind === AstNodeKind.List) {
				items.push(...normalized._items);
			} else {
				items.push(normalized);
			}
		}
		return ListAstNode.create(items);
	}

	clone(): ListAstNode {
		return new ListAstNode(this.length, this.listHeight, clone(this._items), this.missingBracketIds);
	}

	private handleChildrenChanged(): void {
		const items = this._items;
		if (items.length === 0) {
			return;
		}

		let length = items[0].length;
		let unopenedBrackets = items[0].missingBracketIds;
		for (let i = 1; i < items.length; i++) {
			length = lengthAdd(length, items[i].length);
			unopenedBrackets = unopenedBrackets.merge(items[i].missingBracketIds);
		}
		this._length = length;
		this._unopenedBrackets = unopenedBrackets;
	}

	/**
	 * Appends the given node to the end of this (2,3) tree.
	 * Returns the new root.
	*/
	append(nodeToAppend: AstNode): AstNode {
		const newNode = this._append(nodeToAppend);
		if (newNode) {
			return ListAstNode.create([this, newNode]);
		}
		return this;
	}

	/**
	 * @returns Additional node after tree
	*/
	private _append(nodeToAppend: AstNode): AstNode | undefined {
		// assert nodeToInsert.listHeight <= tree.listHeight

		if (nodeToAppend.listHeight === this.listHeight) {
			return nodeToAppend;
		}

		const lastItem = this._items[this._items.length - 1];
		const newNodeAfter = (lastItem.kind === AstNodeKind.List) ? lastItem._append(nodeToAppend) : nodeToAppend;

		if (!newNodeAfter) {
			this.handleChildrenChanged();
			return undefined;
		}

		// Can we take the element?
		if (this._items.length >= 3) {
			// assert tree.items.length === 3

			// we need to split to maintain (2,3)-tree property.
			// Send the third element + the new element to the parent.
			const third = this._items.pop()!;
			this.handleChildrenChanged();
			return ListAstNode.create([third, newNodeAfter]);
		} else {
			this._items.push(newNodeAfter);
			this.handleChildrenChanged();
			return undefined;
		}
	}

	/**
	 * Prepends the given node to the end of this (2,3) tree.
	 * Returns the new root.
	*/
	prepend(nodeToPrepend: AstNode): AstNode {
		const newNode = this._prepend(nodeToPrepend);
		if (newNode) {
			return ListAstNode.create([newNode, this]);
		}
		return this;
	}

	/**
	 * @returns Additional node before tree
	*/
	private _prepend(nodeToPrepend: AstNode): AstNode | undefined {
		// assert nodeToInsert.listHeight <= tree.listHeight

		if (nodeToPrepend.listHeight === this.listHeight) {
			return nodeToPrepend;
		}

		if (this.kind !== AstNodeKind.List) {
			throw new Error('unexpected');
		}

		const first = this._items[0];
		const newNodeBefore = (first.kind === AstNodeKind.List) ? first._prepend(nodeToPrepend) : nodeToPrepend;

		if (!newNodeBefore) {
			this.handleChildrenChanged();
			return undefined;
		}

		if (this._items.length >= 3) {
			// assert this.items.length === 3

			// we need to split to maintain (2,3)-this property.
			const first = this._items.shift()!;
			this.handleChildrenChanged();
			return ListAstNode.create([newNodeBefore, first]);
		} else {
			this._items.unshift(newNodeBefore);
			this.handleChildrenChanged();
			return undefined;
		}
	}
}

function clone(arr: readonly AstNode[]): AstNode[] {
	const result = new Array<AstNode>(arr.length);
	for (let i = 0; i < arr.length; i++) {
		result[i] = arr[i].clone();
	}
	return result;
}

const emptyArray: readonly AstNode[] = [];

export class TextAstNode extends BaseAstNode {
	get kind(): AstNodeKind.Text {
		return AstNodeKind.Text;
	}
	get listHeight() {
		return 0;
	}
	get children(): readonly AstNode[] {
		return emptyArray;
	}
	get missingBracketIds(): SmallImmutableSet<number> {
		return SmallImmutableSet.getEmpty();
	}

	canBeReused(
		openedBracketIds: SmallImmutableSet<number>,
		endLineDidChange: boolean
	) {
		// Don't reuse text from a line that got changed.
		// Otherwise, long brackes might not be detected.
		return !endLineDidChange;
	}

	flattenLists(): TextAstNode {
		return this;
	}
	clone(): TextAstNode {
		return this;
	}
}

export class BracketAstNode extends BaseAstNode {
	private static cacheByLength = new Map<number, BracketAstNode>();

	public static create(length: Length): BracketAstNode {
		const lengthKey = lengthHash(length);
		const cached = BracketAstNode.cacheByLength.get(lengthKey);
		if (cached) {
			return cached;
		}

		const node = new BracketAstNode(length);
		BracketAstNode.cacheByLength.set(lengthKey, node);
		return node;
	}

	private constructor(length: Length) {
		super(length);
	}

	get kind(): AstNodeKind.Bracket {
		return AstNodeKind.Bracket;
	}
	get listHeight() {
		return 0;
	}
	get children(): readonly AstNode[] {
		return emptyArray;
	}

	get missingBracketIds(): SmallImmutableSet<number> {
		return SmallImmutableSet.getEmpty();
	}

	canBeReused(
		expectedClosingCategories: SmallImmutableSet<number>,
		endLineDidChange: boolean
	) {
		// These nodes could be reused,
		// but not in a general way.
		// Their parent may be reused.
		return false;
	}

	flattenLists(): BracketAstNode {
		return this;
	}

	clone(): BracketAstNode {
		return this;
	}
}

export class InvalidBracketAstNode extends BaseAstNode {
	get kind(): AstNodeKind.UnexpectedClosingBracket {
		return AstNodeKind.UnexpectedClosingBracket;
	}
	get listHeight() {
		return 0;
	}
	get children(): readonly AstNode[] {
		return emptyArray;
	}

	public readonly missingBracketIds: SmallImmutableSet<number>;

	constructor(closingBrackets: SmallImmutableSet<number>, length: Length) {
		super(length);
		this.missingBracketIds = closingBrackets;
	}

	canBeReused(
		openedBracketIds: SmallImmutableSet<number>,
		endLineDidChange: boolean
	) {
		return !openedBracketIds.intersects(this.missingBracketIds);
	}

	flattenLists(): InvalidBracketAstNode {
		return this;
	}

	clone(): InvalidBracketAstNode {
		return this;
	}
}
