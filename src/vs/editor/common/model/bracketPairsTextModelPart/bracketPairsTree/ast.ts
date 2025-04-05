/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { CursorColumns } from '../../../core/cursorColumns.js';
import { BracketKind } from '../../../languages/supports/languageBracketsConfiguration.js';
import { ITextModel } from '../../../model.js';
import { Length, lengthAdd, lengthGetLineCount, lengthToObj, lengthZero } from './length.js';
import { SmallImmutableSet } from './smallImmutableSet.js';
import { OpeningBracketId } from './tokenizer.js';

export const enum AstNodeKind {
	Text = 0,
	Bracket = 1,
	Pair = 2,
	UnexpectedClosingBracket = 3,
	List = 4,
}

export type AstNode = PairAstNode | ListAstNode | BracketAstNode | InvalidBracketAstNode | TextAstNode;

/**
 * The base implementation for all AST nodes.
*/
abstract class BaseAstNode {
	public abstract readonly kind: AstNodeKind;

	public abstract readonly childrenLength: number;

	/**
	 * Might return null even if {@link idx} is smaller than {@link BaseAstNode.childrenLength}.
	*/
	public abstract getChild(idx: number): AstNode | null;

	/**
	 * Try to avoid using this property, as implementations might need to allocate the resulting array.
	*/
	public abstract readonly children: readonly AstNode[];

	/**
	 * Represents the set of all (potentially) missing opening bracket ids in this node.
	 * E.g. in `{ ] ) }` that set is {`[`, `(` }.
	*/
	public abstract readonly missingOpeningBracketIds: SmallImmutableSet<OpeningBracketId>;

	/**
	 * In case of a list, determines the height of the (2,3) tree.
	*/
	public abstract readonly listHeight: number;

	protected _length: Length;

	/**
	 * The length of the entire node, which should equal the sum of lengths of all children.
	*/
	public get length(): Length {
		return this._length;
	}

	public constructor(length: Length) {
		this._length = length;
	}

	/**
	 * @param openBracketIds The set of all opening brackets that have not yet been closed.
	 */
	public abstract canBeReused(
		openBracketIds: SmallImmutableSet<OpeningBracketId>
	): boolean;

	/**
	 * Flattens all lists in this AST. Only for debugging.
	 */
	public abstract flattenLists(): AstNode;

	/**
	 * Creates a deep clone.
	 */
	public abstract deepClone(): AstNode;

	public abstract computeMinIndentation(offset: Length, textModel: ITextModel): number;
}

/**
 * Represents a bracket pair including its child (e.g. `{ ... }`).
 * Might be unclosed.
 * Immutable, if all children are immutable.
*/
export class PairAstNode extends BaseAstNode {
	public static create(
		openingBracket: BracketAstNode,
		child: AstNode | null,
		closingBracket: BracketAstNode | null
	) {
		let length = openingBracket.length;
		if (child) {
			length = lengthAdd(length, child.length);
		}
		if (closingBracket) {
			length = lengthAdd(length, closingBracket.length);
		}
		return new PairAstNode(length, openingBracket, child, closingBracket, child ? child.missingOpeningBracketIds : SmallImmutableSet.getEmpty());
	}

	public get kind(): AstNodeKind.Pair {
		return AstNodeKind.Pair;
	}
	public get listHeight() {
		return 0;
	}
	public get childrenLength(): number {
		return 3;
	}
	public getChild(idx: number): AstNode | null {
		switch (idx) {
			case 0: return this.openingBracket;
			case 1: return this.child;
			case 2: return this.closingBracket;
		}
		throw new Error('Invalid child index');
	}

	/**
	 * Avoid using this property, it allocates an array!
	*/
	public get children() {
		const result: AstNode[] = [];
		result.push(this.openingBracket);
		if (this.child) {
			result.push(this.child);
		}
		if (this.closingBracket) {
			result.push(this.closingBracket);
		}
		return result;
	}

	private constructor(
		length: Length,
		public readonly openingBracket: BracketAstNode,
		public readonly child: AstNode | null,
		public readonly closingBracket: BracketAstNode | null,
		public readonly missingOpeningBracketIds: SmallImmutableSet<OpeningBracketId>
	) {
		super(length);
	}

	public canBeReused(openBracketIds: SmallImmutableSet<OpeningBracketId>) {
		if (this.closingBracket === null) {
			// Unclosed pair ast nodes only
			// end at the end of the document
			// or when a parent node is closed.

			// This could be improved:
			// Only return false if some next token is neither "undefined" nor a bracket that closes a parent.

			return false;
		}

		if (openBracketIds.intersects(this.missingOpeningBracketIds)) {
			return false;
		}

		return true;
	}

	public flattenLists(): PairAstNode {
		return PairAstNode.create(
			this.openingBracket.flattenLists(),
			this.child && this.child.flattenLists(),
			this.closingBracket && this.closingBracket.flattenLists()
		);
	}

	public deepClone(): PairAstNode {
		return new PairAstNode(
			this.length,
			this.openingBracket.deepClone(),
			this.child && this.child.deepClone(),
			this.closingBracket && this.closingBracket.deepClone(),
			this.missingOpeningBracketIds
		);
	}

	public computeMinIndentation(offset: Length, textModel: ITextModel): number {
		return this.child ? this.child.computeMinIndentation(lengthAdd(offset, this.openingBracket.length), textModel) : Number.MAX_SAFE_INTEGER;
	}
}

export abstract class ListAstNode extends BaseAstNode {
	/**
	 * This method uses more memory-efficient list nodes that can only store 2 or 3 children.
	*/
	public static create23(item1: AstNode, item2: AstNode, item3: AstNode | null, immutable: boolean = false): ListAstNode {
		let length = item1.length;
		let missingBracketIds = item1.missingOpeningBracketIds;

		if (item1.listHeight !== item2.listHeight) {
			throw new Error('Invalid list heights');
		}

		length = lengthAdd(length, item2.length);
		missingBracketIds = missingBracketIds.merge(item2.missingOpeningBracketIds);

		if (item3) {
			if (item1.listHeight !== item3.listHeight) {
				throw new Error('Invalid list heights');
			}
			length = lengthAdd(length, item3.length);
			missingBracketIds = missingBracketIds.merge(item3.missingOpeningBracketIds);
		}
		return immutable
			? new Immutable23ListAstNode(length, item1.listHeight + 1, item1, item2, item3, missingBracketIds)
			: new TwoThreeListAstNode(length, item1.listHeight + 1, item1, item2, item3, missingBracketIds);
	}

	public static create(items: AstNode[], immutable: boolean = false): ListAstNode {
		if (items.length === 0) {
			return this.getEmpty();
		} else {
			let length = items[0].length;
			let unopenedBrackets = items[0].missingOpeningBracketIds;
			for (let i = 1; i < items.length; i++) {
				length = lengthAdd(length, items[i].length);
				unopenedBrackets = unopenedBrackets.merge(items[i].missingOpeningBracketIds);
			}
			return immutable
				? new ImmutableArrayListAstNode(length, items[0].listHeight + 1, items, unopenedBrackets)
				: new ArrayListAstNode(length, items[0].listHeight + 1, items, unopenedBrackets);
		}
	}

	public static getEmpty() {
		return new ImmutableArrayListAstNode(lengthZero, 0, [], SmallImmutableSet.getEmpty());
	}

	public get kind(): AstNodeKind.List {
		return AstNodeKind.List;
	}

	public get missingOpeningBracketIds(): SmallImmutableSet<OpeningBracketId> {
		return this._missingOpeningBracketIds;
	}

	private cachedMinIndentation: number = -1;

	/**
	 * Use ListAstNode.create.
	*/
	constructor(
		length: Length,
		public readonly listHeight: number,
		private _missingOpeningBracketIds: SmallImmutableSet<OpeningBracketId>
	) {
		super(length);
	}

	protected throwIfImmutable(): void {
		// NOOP
	}

	protected abstract setChild(idx: number, child: AstNode): void;

	public makeLastElementMutable(): AstNode | undefined {
		this.throwIfImmutable();
		const childCount = this.childrenLength;
		if (childCount === 0) {
			return undefined;
		}
		const lastChild = this.getChild(childCount - 1)!;
		const mutable = lastChild.kind === AstNodeKind.List ? lastChild.toMutable() : lastChild;
		if (lastChild !== mutable) {
			this.setChild(childCount - 1, mutable);
		}
		return mutable;
	}

	public makeFirstElementMutable(): AstNode | undefined {
		this.throwIfImmutable();
		const childCount = this.childrenLength;
		if (childCount === 0) {
			return undefined;
		}
		const firstChild = this.getChild(0)!;
		const mutable = firstChild.kind === AstNodeKind.List ? firstChild.toMutable() : firstChild;
		if (firstChild !== mutable) {
			this.setChild(0, mutable);
		}
		return mutable;
	}

	public canBeReused(openBracketIds: SmallImmutableSet<OpeningBracketId>): boolean {
		if (openBracketIds.intersects(this.missingOpeningBracketIds)) {
			return false;
		}

		if (this.childrenLength === 0) {
			// Don't reuse empty lists.
			return false;
		}

		let lastChild: ListAstNode = this;
		while (lastChild.kind === AstNodeKind.List) {
			const lastLength = lastChild.childrenLength;
			if (lastLength === 0) {
				// Empty lists should never be contained in other lists.
				throw new BugIndicatingError();
			}
			lastChild = lastChild.getChild(lastLength - 1) as ListAstNode;
		}

		return lastChild.canBeReused(openBracketIds);
	}

	public handleChildrenChanged(): void {
		this.throwIfImmutable();

		const count = this.childrenLength;

		let length = this.getChild(0)!.length;
		let unopenedBrackets = this.getChild(0)!.missingOpeningBracketIds;

		for (let i = 1; i < count; i++) {
			const child = this.getChild(i)!;
			length = lengthAdd(length, child.length);
			unopenedBrackets = unopenedBrackets.merge(child.missingOpeningBracketIds);
		}

		this._length = length;
		this._missingOpeningBracketIds = unopenedBrackets;
		this.cachedMinIndentation = -1;
	}

	public flattenLists(): ListAstNode {
		const items: AstNode[] = [];
		for (const c of this.children) {
			const normalized = c.flattenLists();
			if (normalized.kind === AstNodeKind.List) {
				items.push(...normalized.children);
			} else {
				items.push(normalized);
			}
		}
		return ListAstNode.create(items);
	}

	public computeMinIndentation(offset: Length, textModel: ITextModel): number {
		if (this.cachedMinIndentation !== -1) {
			return this.cachedMinIndentation;
		}

		let minIndentation = Number.MAX_SAFE_INTEGER;
		let childOffset = offset;
		for (let i = 0; i < this.childrenLength; i++) {
			const child = this.getChild(i);
			if (child) {
				minIndentation = Math.min(minIndentation, child.computeMinIndentation(childOffset, textModel));
				childOffset = lengthAdd(childOffset, child.length);
			}
		}

		this.cachedMinIndentation = minIndentation;
		return minIndentation;
	}

	/**
	 * Creates a shallow clone that is mutable, or itself if it is already mutable.
	 */
	public abstract toMutable(): ListAstNode;

	public abstract appendChildOfSameHeight(node: AstNode): void;
	public abstract unappendChild(): AstNode | undefined;
	public abstract prependChildOfSameHeight(node: AstNode): void;
	public abstract unprependChild(): AstNode | undefined;
}

class TwoThreeListAstNode extends ListAstNode {
	public get childrenLength(): number {
		return this._item3 !== null ? 3 : 2;
	}
	public getChild(idx: number): AstNode | null {
		switch (idx) {
			case 0: return this._item1;
			case 1: return this._item2;
			case 2: return this._item3;
		}
		throw new Error('Invalid child index');
	}
	protected setChild(idx: number, node: AstNode): void {
		switch (idx) {
			case 0: this._item1 = node; return;
			case 1: this._item2 = node; return;
			case 2: this._item3 = node; return;
		}
		throw new Error('Invalid child index');
	}

	public get children(): readonly AstNode[] {
		return this._item3 ? [this._item1, this._item2, this._item3] : [this._item1, this._item2];
	}

	public get item1(): AstNode {
		return this._item1;
	}
	public get item2(): AstNode {
		return this._item2;
	}
	public get item3(): AstNode | null {
		return this._item3;
	}

	public constructor(
		length: Length,
		listHeight: number,
		private _item1: AstNode,
		private _item2: AstNode,
		private _item3: AstNode | null,
		missingOpeningBracketIds: SmallImmutableSet<OpeningBracketId>
	) {
		super(length, listHeight, missingOpeningBracketIds);
	}

	public deepClone(): ListAstNode {
		return new TwoThreeListAstNode(
			this.length,
			this.listHeight,
			this._item1.deepClone(),
			this._item2.deepClone(),
			this._item3 ? this._item3.deepClone() : null,
			this.missingOpeningBracketIds
		);
	}

	public appendChildOfSameHeight(node: AstNode): void {
		if (this._item3) {
			throw new Error('Cannot append to a full (2,3) tree node');
		}
		this.throwIfImmutable();
		this._item3 = node;
		this.handleChildrenChanged();
	}

	public unappendChild(): AstNode | undefined {
		if (!this._item3) {
			throw new Error('Cannot remove from a non-full (2,3) tree node');
		}
		this.throwIfImmutable();
		const result = this._item3;
		this._item3 = null;
		this.handleChildrenChanged();
		return result;
	}

	public prependChildOfSameHeight(node: AstNode): void {
		if (this._item3) {
			throw new Error('Cannot prepend to a full (2,3) tree node');
		}
		this.throwIfImmutable();
		this._item3 = this._item2;
		this._item2 = this._item1;
		this._item1 = node;
		this.handleChildrenChanged();
	}

	public unprependChild(): AstNode | undefined {
		if (!this._item3) {
			throw new Error('Cannot remove from a non-full (2,3) tree node');
		}
		this.throwIfImmutable();
		const result = this._item1;
		this._item1 = this._item2;
		this._item2 = this._item3;
		this._item3 = null;

		this.handleChildrenChanged();
		return result;
	}

	override toMutable(): ListAstNode {
		return this;
	}
}

/**
 * Immutable, if all children are immutable.
*/
class Immutable23ListAstNode extends TwoThreeListAstNode {
	override toMutable(): ListAstNode {
		return new TwoThreeListAstNode(this.length, this.listHeight, this.item1, this.item2, this.item3, this.missingOpeningBracketIds);
	}

	protected override throwIfImmutable(): void {
		throw new Error('this instance is immutable');
	}
}

/**
 * For debugging.
*/
class ArrayListAstNode extends ListAstNode {
	get childrenLength(): number {
		return this._children.length;
	}
	getChild(idx: number): AstNode | null {
		return this._children[idx];
	}
	protected setChild(idx: number, child: AstNode): void {
		this._children[idx] = child;
	}
	get children(): readonly AstNode[] {
		return this._children;
	}

	constructor(
		length: Length,
		listHeight: number,
		private readonly _children: AstNode[],
		missingOpeningBracketIds: SmallImmutableSet<OpeningBracketId>
	) {
		super(length, listHeight, missingOpeningBracketIds);
	}

	deepClone(): ListAstNode {
		const children = new Array<AstNode>(this._children.length);
		for (let i = 0; i < this._children.length; i++) {
			children[i] = this._children[i].deepClone();
		}
		return new ArrayListAstNode(this.length, this.listHeight, children, this.missingOpeningBracketIds);
	}

	public appendChildOfSameHeight(node: AstNode): void {
		this.throwIfImmutable();
		this._children.push(node);
		this.handleChildrenChanged();
	}

	public unappendChild(): AstNode | undefined {
		this.throwIfImmutable();
		const item = this._children.pop();
		this.handleChildrenChanged();
		return item;
	}

	public prependChildOfSameHeight(node: AstNode): void {
		this.throwIfImmutable();
		this._children.unshift(node);
		this.handleChildrenChanged();
	}

	public unprependChild(): AstNode | undefined {
		this.throwIfImmutable();
		const item = this._children.shift();
		this.handleChildrenChanged();
		return item;
	}

	public override toMutable(): ListAstNode {
		return this;
	}
}

/**
 * Immutable, if all children are immutable.
*/
class ImmutableArrayListAstNode extends ArrayListAstNode {
	override toMutable(): ListAstNode {
		return new ArrayListAstNode(this.length, this.listHeight, [...this.children], this.missingOpeningBracketIds);
	}

	protected override throwIfImmutable(): void {
		throw new Error('this instance is immutable');
	}
}

const emptyArray: readonly AstNode[] = [];

abstract class ImmutableLeafAstNode extends BaseAstNode {
	public get listHeight() {
		return 0;
	}
	public get childrenLength(): number {
		return 0;
	}
	public getChild(idx: number): AstNode | null {
		return null;
	}
	public get children(): readonly AstNode[] {
		return emptyArray;
	}

	public flattenLists(): this & AstNode {
		return this as this & AstNode;
	}
	public deepClone(): this & AstNode {
		return this as this & AstNode;
	}
}

export class TextAstNode extends ImmutableLeafAstNode {
	public get kind(): AstNodeKind.Text {
		return AstNodeKind.Text;
	}
	public get missingOpeningBracketIds(): SmallImmutableSet<OpeningBracketId> {
		return SmallImmutableSet.getEmpty();
	}

	public canBeReused(_openedBracketIds: SmallImmutableSet<OpeningBracketId>) {
		return true;
	}

	public computeMinIndentation(offset: Length, textModel: ITextModel): number {
		const start = lengthToObj(offset);
		// Text ast nodes don't have partial indentation (ensured by the tokenizer).
		// Thus, if this text node does not start at column 0, the first line cannot have any indentation at all.
		const startLineNumber = (start.columnCount === 0 ? start.lineCount : start.lineCount + 1) + 1;
		const endLineNumber = lengthGetLineCount(lengthAdd(offset, this.length)) + 1;

		let result = Number.MAX_SAFE_INTEGER;

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			const firstNonWsColumn = textModel.getLineFirstNonWhitespaceColumn(lineNumber);
			const lineContent = textModel.getLineContent(lineNumber);
			if (firstNonWsColumn === 0) {
				continue;
			}

			const visibleColumn = CursorColumns.visibleColumnFromColumn(lineContent, firstNonWsColumn, textModel.getOptions().tabSize)!;
			result = Math.min(result, visibleColumn);
		}

		return result;
	}
}

export class BracketAstNode extends ImmutableLeafAstNode {
	public static create(
		length: Length,
		bracketInfo: BracketKind,
		bracketIds: SmallImmutableSet<OpeningBracketId>
	): BracketAstNode {
		const node = new BracketAstNode(length, bracketInfo, bracketIds);
		return node;
	}

	public get kind(): AstNodeKind.Bracket {
		return AstNodeKind.Bracket;
	}

	public get missingOpeningBracketIds(): SmallImmutableSet<OpeningBracketId> {
		return SmallImmutableSet.getEmpty();
	}

	private constructor(
		length: Length,
		public readonly bracketInfo: BracketKind,
		/**
		 * In case of a opening bracket, this is the id of the opening bracket.
		 * In case of a closing bracket, this contains the ids of all opening brackets it can close.
		*/
		public readonly bracketIds: SmallImmutableSet<OpeningBracketId>
	) {
		super(length);
	}

	public get text() {
		return this.bracketInfo.bracketText;
	}

	public get languageId() {
		return this.bracketInfo.languageId;
	}

	public canBeReused(_openedBracketIds: SmallImmutableSet<OpeningBracketId>) {
		// These nodes could be reused,
		// but not in a general way.
		// Their parent may be reused.
		return false;
	}

	public computeMinIndentation(offset: Length, textModel: ITextModel): number {
		return Number.MAX_SAFE_INTEGER;
	}
}

export class InvalidBracketAstNode extends ImmutableLeafAstNode {
	public get kind(): AstNodeKind.UnexpectedClosingBracket {
		return AstNodeKind.UnexpectedClosingBracket;
	}

	public readonly missingOpeningBracketIds: SmallImmutableSet<OpeningBracketId>;

	public constructor(closingBrackets: SmallImmutableSet<OpeningBracketId>, length: Length) {
		super(length);
		this.missingOpeningBracketIds = closingBrackets;
	}

	public canBeReused(openedBracketIds: SmallImmutableSet<OpeningBracketId>) {
		return !openedBracketIds.intersects(this.missingOpeningBracketIds);
	}

	public computeMinIndentation(offset: Length, textModel: ITextModel): number {
		return Number.MAX_SAFE_INTEGER;
	}
}
