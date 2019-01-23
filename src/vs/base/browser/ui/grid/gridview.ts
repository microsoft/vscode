/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./gridview';
import { Event, Emitter, Relay } from 'vs/base/common/event';
import { Orientation, Sash } from 'vs/base/browser/ui/sash/sash';
import { SplitView, IView as ISplitView, Sizing, LayoutPriority, ISplitViewStyles } from 'vs/base/browser/ui/splitview/splitview';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { $ } from 'vs/base/browser/dom';
import { tail2 as tail } from 'vs/base/common/arrays';
import { Color } from 'vs/base/common/color';

export { Sizing, LayoutPriority } from 'vs/base/browser/ui/splitview/splitview';
export { Orientation } from 'vs/base/browser/ui/sash/sash';

export interface IView {
	readonly element: HTMLElement;
	readonly minimumWidth: number;
	readonly maximumWidth: number;
	readonly minimumHeight: number;
	readonly maximumHeight: number;
	readonly onDidChange: Event<{ width: number; height: number; } | undefined>;
	readonly priority?: LayoutPriority;
	readonly snapSize?: number;
	layout(width: number, height: number): void;
}

export function orthogonal(orientation: Orientation): Orientation {
	return orientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
}

export interface Box {
	top: number;
	left: number;
	width: number;
	height: number;
}

export interface GridLeafNode {
	readonly view: IView;
	readonly box: Box;
}

export interface GridBranchNode {
	readonly children: GridNode[];
	readonly box: Box;
}

export type GridNode = GridLeafNode | GridBranchNode;

export function isGridBranchNode(node: GridNode): node is GridBranchNode {
	return !!(node as any).children;
}

export interface IGridViewStyles extends ISplitViewStyles { }

const defaultStyles: IGridViewStyles = {
	separatorBorder: Color.transparent
};

export interface IGridViewOptions {
	styles?: IGridViewStyles;
	proportionalLayout?: boolean; // default true
}

class BranchNode implements ISplitView, IDisposable {

	readonly element: HTMLElement;
	readonly children: Node[] = [];
	private splitview: SplitView;

	private _size: number;
	get size(): number { return this._size; }

	private _orthogonalSize: number;
	get orthogonalSize(): number { return this._orthogonalSize; }

	private _styles: IGridViewStyles;
	get styles(): IGridViewStyles { return this._styles; }

	get width(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.size : this.orthogonalSize;
	}

	get height(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.orthogonalSize : this.size;
	}

	get minimumSize(): number {
		return this.children.length === 0 ? 0 : Math.max(...this.children.map(c => c.minimumOrthogonalSize));
	}

	get maximumSize(): number {
		return Math.min(...this.children.map(c => c.maximumOrthogonalSize));
	}

	get minimumOrthogonalSize(): number {
		return this.splitview.minimumSize;
	}

	get maximumOrthogonalSize(): number {
		return this.splitview.maximumSize;
	}

	get minimumWidth(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.minimumOrthogonalSize : this.minimumSize;
	}

	get minimumHeight(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.minimumSize : this.minimumOrthogonalSize;
	}

	get maximumWidth(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.maximumOrthogonalSize : this.maximumSize;
	}

	get maximumHeight(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.maximumSize : this.maximumOrthogonalSize;
	}

	private _onDidChange = new Emitter<number | undefined>();
	readonly onDidChange: Event<number | undefined> = this._onDidChange.event;

	private childrenChangeDisposable: IDisposable = Disposable.None;

	private _onDidSashReset = new Emitter<number[]>();
	readonly onDidSashReset: Event<number[]> = this._onDidSashReset.event;
	private splitviewSashResetDisposable: IDisposable = Disposable.None;
	private childrenSashResetDisposable: IDisposable = Disposable.None;

	get orthogonalStartSash(): Sash | undefined { return this.splitview.orthogonalStartSash; }
	set orthogonalStartSash(sash: Sash | undefined) { this.splitview.orthogonalStartSash = sash; }
	get orthogonalEndSash(): Sash | undefined { return this.splitview.orthogonalEndSash; }
	set orthogonalEndSash(sash: Sash | undefined) { this.splitview.orthogonalEndSash = sash; }

	constructor(
		readonly orientation: Orientation,
		styles: IGridViewStyles,
		readonly proportionalLayout: boolean,
		size: number = 0,
		orthogonalSize: number = 0
	) {
		this._styles = styles;
		this._size = size;
		this._orthogonalSize = orthogonalSize;

		this.element = $('.monaco-grid-branch-node');
		this.splitview = new SplitView(this.element, { orientation, styles });
		this.splitview.layout(size);

		const onDidSashReset = Event.map(this.splitview.onDidSashReset, i => [i]);
		this.splitviewSashResetDisposable = onDidSashReset(this._onDidSashReset.fire, this._onDidSashReset);
	}

	style(styles: IGridViewStyles): void {
		this._styles = styles;
		this.splitview.style(styles);

		for (const child of this.children) {
			if (child instanceof BranchNode) {
				child.style(styles);
			}
		}
	}

	layout(size: number): void {
		this._orthogonalSize = size;

		for (const child of this.children) {
			child.orthogonalLayout(size);
		}
	}

	orthogonalLayout(size: number): void {
		this._size = size;
		this.splitview.layout(size);
	}

	addChild(node: Node, size: number | Sizing, index: number): void {
		if (index < 0 || index > this.children.length) {
			throw new Error('Invalid index');
		}

		this.splitview.addView(node, size, index);
		this._addChild(node, index);
		this.onDidChildrenChange();
	}

	private _addChild(node: Node, index: number): void {
		const first = index === 0;
		const last = index === this.children.length;
		this.children.splice(index, 0, node);
		node.orthogonalStartSash = this.splitview.sashes[index - 1];
		node.orthogonalEndSash = this.splitview.sashes[index];

		if (!first) {
			this.children[index - 1].orthogonalEndSash = this.splitview.sashes[index - 1];
		}

		if (!last) {
			this.children[index + 1].orthogonalStartSash = this.splitview.sashes[index];
		}
	}

	removeChild(index: number, sizing?: Sizing): void {
		if (index < 0 || index >= this.children.length) {
			throw new Error('Invalid index');
		}

		this.splitview.removeView(index, sizing);
		this._removeChild(index);
		this.onDidChildrenChange();
	}

	private _removeChild(index: number): Node {
		const first = index === 0;
		const last = index === this.children.length - 1;
		const [child] = this.children.splice(index, 1);

		if (!first) {
			this.children[index - 1].orthogonalEndSash = this.splitview.sashes[index - 1];
		}

		if (!last) { // [0,1,2,3] (2) => [0,1,3]
			this.children[index].orthogonalStartSash = this.splitview.sashes[Math.max(index - 1, 0)];
		}

		return child;
	}

	moveChild(from: number, to: number): void {
		if (from === to) {
			return;
		}

		if (from < 0 || from >= this.children.length) {
			throw new Error('Invalid from index');
		}

		if (to < 0 || to > this.children.length) {
			throw new Error('Invalid to index');
		}

		if (from < to) {
			to--;
		}

		this.splitview.moveView(from, to);

		const child = this._removeChild(from);
		this._addChild(child, to);
	}

	swapChildren(from: number, to: number): void {
		if (from === to) {
			return;
		}

		if (from < 0 || from >= this.children.length) {
			throw new Error('Invalid from index');
		}

		if (to < 0 || to >= this.children.length) {
			throw new Error('Invalid to index');
		}

		this.splitview.swapViews(from, to);
		[this.children[from].orthogonalStartSash, this.children[from].orthogonalEndSash, this.children[to].orthogonalStartSash, this.children[to].orthogonalEndSash] = [this.children[to].orthogonalStartSash, this.children[to].orthogonalEndSash, this.children[from].orthogonalStartSash, this.children[from].orthogonalEndSash];
		[this.children[from], this.children[to]] = [this.children[to], this.children[from]];
	}

	resizeChild(index: number, size: number): void {
		if (index < 0 || index >= this.children.length) {
			throw new Error('Invalid index');
		}

		this.splitview.resizeView(index, size);
	}

	distributeViewSizes(recursive = false): void {
		this.splitview.distributeViewSizes();

		if (recursive) {
			for (const child of this.children) {
				if (child instanceof BranchNode) {
					child.distributeViewSizes(true);
				}
			}
		}
	}

	getChildSize(index: number): number {
		if (index < 0 || index >= this.children.length) {
			throw new Error('Invalid index');
		}

		return this.splitview.getViewSize(index);
	}

	private onDidChildrenChange(): void {
		const onDidChildrenChange = Event.any(...this.children.map(c => c.onDidChange));
		this.childrenChangeDisposable.dispose();
		this.childrenChangeDisposable = onDidChildrenChange(this._onDidChange.fire, this._onDidChange);

		const onDidChildrenSashReset = Event.any(...this.children.map((c, i) => Event.map(c.onDidSashReset, location => [i, ...location])));
		this.childrenSashResetDisposable.dispose();
		this.childrenSashResetDisposable = onDidChildrenSashReset(this._onDidSashReset.fire, this._onDidSashReset);

		this._onDidChange.fire(undefined);
	}

	trySet2x2(other: BranchNode): IDisposable {
		if (this.children.length !== 2 || other.children.length !== 2) {
			return Disposable.None;
		}

		if (this.getChildSize(0) !== other.getChildSize(0)) {
			return Disposable.None;
		}

		const [firstChild, secondChild] = this.children;
		const [otherFirstChild, otherSecondChild] = other.children;

		if (!(firstChild instanceof LeafNode) || !(secondChild instanceof LeafNode)) {
			return Disposable.None;
		}

		if (!(otherFirstChild instanceof LeafNode) || !(otherSecondChild instanceof LeafNode)) {
			return Disposable.None;
		}

		if (this.orientation === Orientation.VERTICAL) {
			secondChild.linkedWidthNode = otherFirstChild.linkedHeightNode = firstChild;
			firstChild.linkedWidthNode = otherSecondChild.linkedHeightNode = secondChild;
			otherSecondChild.linkedWidthNode = firstChild.linkedHeightNode = otherFirstChild;
			otherFirstChild.linkedWidthNode = secondChild.linkedHeightNode = otherSecondChild;
		} else {
			otherFirstChild.linkedWidthNode = secondChild.linkedHeightNode = firstChild;
			otherSecondChild.linkedWidthNode = firstChild.linkedHeightNode = secondChild;
			firstChild.linkedWidthNode = otherSecondChild.linkedHeightNode = otherFirstChild;
			secondChild.linkedWidthNode = otherFirstChild.linkedHeightNode = otherSecondChild;
		}

		const mySash = this.splitview.sashes[0];
		const otherSash = other.splitview.sashes[0];
		mySash.linkedSash = otherSash;
		otherSash.linkedSash = mySash;

		this._onDidChange.fire(undefined);
		other._onDidChange.fire(undefined);

		return toDisposable(() => {
			mySash.linkedSash = otherSash.linkedSash = undefined;
			firstChild.linkedHeightNode = firstChild.linkedWidthNode = undefined;
			secondChild.linkedHeightNode = secondChild.linkedWidthNode = undefined;
			otherFirstChild.linkedHeightNode = otherFirstChild.linkedWidthNode = undefined;
			otherSecondChild.linkedHeightNode = otherSecondChild.linkedWidthNode = undefined;
		});
	}

	dispose(): void {
		for (const child of this.children) {
			child.dispose();
		}

		this._onDidChange.dispose();
		this._onDidSashReset.dispose();

		this.splitviewSashResetDisposable.dispose();
		this.childrenSashResetDisposable.dispose();
		this.childrenChangeDisposable.dispose();
		this.splitview.dispose();
	}
}

class LeafNode implements ISplitView, IDisposable {

	private _size: number = 0;
	get size(): number { return this._size; }

	private _orthogonalSize: number;
	get orthogonalSize(): number { return this._orthogonalSize; }

	readonly onDidSashReset: Event<number[]> = Event.None;

	private _onDidLinkedWidthNodeChange = new Relay<number | undefined>();
	private _linkedWidthNode: LeafNode | undefined = undefined;
	get linkedWidthNode(): LeafNode | undefined { return this._linkedWidthNode; }
	set linkedWidthNode(node: LeafNode | undefined) {
		this._onDidLinkedWidthNodeChange.input = node ? node._onDidViewChange : Event.None;
		this._linkedWidthNode = node;
		this._onDidSetLinkedNode.fire(undefined);
	}

	private _onDidLinkedHeightNodeChange = new Relay<number | undefined>();
	private _linkedHeightNode: LeafNode | undefined = undefined;
	get linkedHeightNode(): LeafNode | undefined { return this._linkedHeightNode; }
	set linkedHeightNode(node: LeafNode | undefined) {
		this._onDidLinkedHeightNodeChange.input = node ? node._onDidViewChange : Event.None;
		this._linkedHeightNode = node;
		this._onDidSetLinkedNode.fire(undefined);
	}

	private _onDidSetLinkedNode = new Emitter<number | undefined>();
	private _onDidViewChange: Event<number | undefined>;
	readonly onDidChange: Event<number | undefined>;

	constructor(
		readonly view: IView,
		readonly orientation: Orientation,
		orthogonalSize: number = 0
	) {
		this._orthogonalSize = orthogonalSize;

		this._onDidViewChange = Event.map(this.view.onDidChange, this.orientation === Orientation.HORIZONTAL ? e => e && e.width : e => e && e.height);
		this.onDidChange = Event.any(this._onDidViewChange, this._onDidSetLinkedNode.event, this._onDidLinkedWidthNodeChange.event, this._onDidLinkedHeightNodeChange.event);
	}

	get width(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.orthogonalSize : this.size;
	}

	get height(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.size : this.orthogonalSize;
	}

	get element(): HTMLElement {
		return this.view.element;
	}

	private get minimumWidth(): number {
		return this.linkedWidthNode ? Math.max(this.linkedWidthNode.view.minimumWidth, this.view.minimumWidth) : this.view.minimumWidth;
	}

	private get maximumWidth(): number {
		return this.linkedWidthNode ? Math.min(this.linkedWidthNode.view.maximumWidth, this.view.maximumWidth) : this.view.maximumWidth;
	}

	private get minimumHeight(): number {
		return this.linkedHeightNode ? Math.max(this.linkedHeightNode.view.minimumHeight, this.view.minimumHeight) : this.view.minimumHeight;
	}

	private get maximumHeight(): number {
		return this.linkedHeightNode ? Math.min(this.linkedHeightNode.view.maximumHeight, this.view.maximumHeight) : this.view.maximumHeight;
	}

	get minimumSize(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.minimumHeight : this.minimumWidth;
	}

	get maximumSize(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.maximumHeight : this.maximumWidth;
	}

	get priority(): LayoutPriority | undefined {
		return this.view.priority;
	}

	get snapSize(): number | undefined {
		return this.view.snapSize;
	}

	get minimumOrthogonalSize(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.minimumWidth : this.minimumHeight;
	}

	get maximumOrthogonalSize(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.maximumWidth : this.maximumHeight;
	}

	set orthogonalStartSash(sash: Sash) {
		// noop
	}

	set orthogonalEndSash(sash: Sash) {
		// noop
	}

	layout(size: number): void {
		this._size = size;
		return this.view.layout(this.width, this.height);
	}

	orthogonalLayout(size: number): void {
		this._orthogonalSize = size;
		return this.view.layout(this.width, this.height);
	}

	dispose(): void { }
}

type Node = BranchNode | LeafNode;

function flipNode<T extends Node>(node: T, size: number, orthogonalSize: number): T {
	if (node instanceof BranchNode) {
		const result = new BranchNode(orthogonal(node.orientation), node.styles, node.proportionalLayout, size, orthogonalSize);

		let totalSize = 0;

		for (let i = node.children.length - 1; i >= 0; i--) {
			const child = node.children[i];
			const childSize = child instanceof BranchNode ? child.orthogonalSize : child.size;

			let newSize = node.size === 0 ? 0 : Math.round((size * childSize) / node.size);
			totalSize += newSize;

			// The last view to add should adjust to rounding errors
			if (i === 0) {
				newSize += size - totalSize;
			}

			result.addChild(flipNode(child, orthogonalSize, newSize), newSize, 0);
		}

		return result as T;
	} else {
		return new LeafNode((node as LeafNode).view, orthogonal(node.orientation), orthogonalSize) as T;
	}
}

export class GridView implements IDisposable {

	readonly element: HTMLElement;
	private styles: IGridViewStyles;
	private proportionalLayout: boolean;

	private _root: BranchNode;
	private onDidSashResetRelay = new Relay<number[]>();
	readonly onDidSashReset: Event<number[]> = this.onDidSashResetRelay.event;

	private disposable2x2: IDisposable = Disposable.None;

	private get root(): BranchNode {
		return this._root;
	}

	private set root(root: BranchNode) {
		const oldRoot = this._root;

		if (oldRoot) {
			this.element.removeChild(oldRoot.element);
			oldRoot.dispose();
		}

		this._root = root;
		this.element.appendChild(root.element);
		this.onDidSashResetRelay.input = root.onDidSashReset;
		this._onDidChange.input = Event.map(root.onDidChange, () => undefined); // TODO
	}

	get orientation(): Orientation {
		return this._root.orientation;
	}

	set orientation(orientation: Orientation) {
		if (this._root.orientation === orientation) {
			return;
		}

		const { size, orthogonalSize } = this._root;
		this.root = flipNode(this._root, orthogonalSize, size);
		this.root.layout(size);
		this.root.orthogonalLayout(orthogonalSize);
	}

	get width(): number { return this.root.width; }
	get height(): number { return this.root.height; }

	get minimumWidth(): number { return this.root.minimumWidth; }
	get minimumHeight(): number { return this.root.minimumHeight; }
	get maximumWidth(): number { return this.root.maximumHeight; }
	get maximumHeight(): number { return this.root.maximumHeight; }

	private _onDidChange = new Relay<{ width: number; height: number; } | undefined>();
	readonly onDidChange = this._onDidChange.event;

	constructor(options: IGridViewOptions = {}) {
		this.element = $('.monaco-grid-view');
		this.styles = options.styles || defaultStyles;
		this.proportionalLayout = typeof options.proportionalLayout !== 'undefined' ? !!options.proportionalLayout : true;
		this.root = new BranchNode(Orientation.VERTICAL, this.styles, this.proportionalLayout);
	}

	style(styles: IGridViewStyles): void {
		this.styles = styles;
		this.root.style(styles);
	}

	layout(width: number, height: number): void {
		const [size, orthogonalSize] = this.root.orientation === Orientation.HORIZONTAL ? [height, width] : [width, height];
		this.root.layout(size);
		this.root.orthogonalLayout(orthogonalSize);
	}

	addView(view: IView, size: number | Sizing, location: number[]): void {
		this.disposable2x2.dispose();
		this.disposable2x2 = Disposable.None;

		const [rest, index] = tail(location);
		const [pathToParent, parent] = this.getNode(rest);

		if (parent instanceof BranchNode) {
			const node = new LeafNode(view, orthogonal(parent.orientation), parent.orthogonalSize);
			parent.addChild(node, size, index);

		} else {
			const [, grandParent] = tail(pathToParent);
			const [, parentIndex] = tail(rest);
			grandParent.removeChild(parentIndex);

			const newParent = new BranchNode(parent.orientation, this.styles, this.proportionalLayout, parent.size, parent.orthogonalSize);
			grandParent.addChild(newParent, parent.size, parentIndex);
			newParent.orthogonalLayout(parent.orthogonalSize);

			const newSibling = new LeafNode(parent.view, grandParent.orientation, parent.size);
			newParent.addChild(newSibling, 0, 0);

			if (typeof size !== 'number' && size.type === 'split') {
				size = Sizing.Split(0);
			}

			const node = new LeafNode(view, grandParent.orientation, parent.size);
			newParent.addChild(node, size, index);
		}
	}

	removeView(location: number[], sizing?: Sizing): IView {
		this.disposable2x2.dispose();
		this.disposable2x2 = Disposable.None;

		const [rest, index] = tail(location);
		const [pathToParent, parent] = this.getNode(rest);

		if (!(parent instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		const node = parent.children[index];

		if (!(node instanceof LeafNode)) {
			throw new Error('Invalid location');
		}

		parent.removeChild(index, sizing);

		if (parent.children.length === 0) {
			throw new Error('Invalid grid state');
		}

		if (parent.children.length > 1) {
			return node.view;
		}

		if (pathToParent.length === 0) { // parent is root
			const sibling = parent.children[0];

			if (sibling instanceof LeafNode) {
				return node.view;
			}

			// we must promote sibling to be the new root
			parent.removeChild(0);
			this.root = sibling;
			return node.view;
		}

		const [, grandParent] = tail(pathToParent);
		const [, parentIndex] = tail(rest);

		const sibling = parent.children[0];
		parent.removeChild(0);

		const sizes = grandParent.children.map((_, i) => grandParent.getChildSize(i));
		grandParent.removeChild(parentIndex, sizing);

		if (sibling instanceof BranchNode) {
			sizes.splice(parentIndex, 1, ...sibling.children.map(c => c.size));

			for (let i = 0; i < sibling.children.length; i++) {
				const child = sibling.children[i];
				grandParent.addChild(child, child.size, parentIndex + i);
			}
		} else {
			const newSibling = new LeafNode(sibling.view, orthogonal(sibling.orientation), sibling.size);
			grandParent.addChild(newSibling, sibling.orthogonalSize, parentIndex);
		}

		for (let i = 0; i < sizes.length; i++) {
			grandParent.resizeChild(i, sizes[i]);
		}

		return node.view;
	}

	moveView(parentLocation: number[], from: number, to: number): void {
		const [, parent] = this.getNode(parentLocation);

		if (!(parent instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		parent.moveChild(from, to);
	}

	swapViews(from: number[], to: number[]): void {
		const [fromRest, fromIndex] = tail(from);
		const [, fromParent] = this.getNode(fromRest);

		if (!(fromParent instanceof BranchNode)) {
			throw new Error('Invalid from location');
		}

		const fromSize = fromParent.getChildSize(fromIndex);
		const fromNode = fromParent.children[fromIndex];

		if (!(fromNode instanceof LeafNode)) {
			throw new Error('Invalid from location');
		}

		const [toRest, toIndex] = tail(to);
		const [, toParent] = this.getNode(toRest);

		if (!(toParent instanceof BranchNode)) {
			throw new Error('Invalid to location');
		}

		const toSize = toParent.getChildSize(toIndex);
		const toNode = toParent.children[toIndex];

		if (!(toNode instanceof LeafNode)) {
			throw new Error('Invalid to location');
		}

		if (fromParent === toParent) {
			fromParent.swapChildren(fromIndex, toIndex);
		} else {
			fromParent.removeChild(fromIndex);
			toParent.removeChild(toIndex);

			fromParent.addChild(toNode, fromSize, fromIndex);
			toParent.addChild(fromNode, toSize, toIndex);

			fromParent.layout(fromParent.orthogonalSize);
			toParent.layout(toParent.orthogonalSize);
		}
	}

	resizeView(location: number[], size: number): void {
		const [rest, index] = tail(location);
		const [, parent] = this.getNode(rest);

		if (!(parent instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		parent.resizeChild(index, size);
	}

	getViewSize(location: number[]): { width: number; height: number; } {
		const [, node] = this.getNode(location);
		return { width: node.width, height: node.height };
	}

	maximizeViewSize(location: number[]): void {
		const [ancestors, node] = this.getNode(location);

		if (!(node instanceof LeafNode)) {
			throw new Error('Invalid location');
		}

		for (let i = 0; i < ancestors.length; i++) {
			ancestors[i].resizeChild(location[i], Number.POSITIVE_INFINITY);
		}
	}

	distributeViewSizes(location?: number[]): void {
		if (!location) {
			this.root.distributeViewSizes(true);
			return;
		}

		const [, node] = this.getNode(location);

		if (!(node instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		node.distributeViewSizes();
	}

	getViews(): GridBranchNode {
		return this._getViews(this.root, this.orientation, { top: 0, left: 0, width: this.width, height: this.height }) as GridBranchNode;
	}

	private _getViews(node: Node, orientation: Orientation, box: Box): GridNode {
		if (node instanceof LeafNode) {
			return { view: node.view, box };
		}

		const children: GridNode[] = [];
		let offset = 0;

		for (const child of node.children) {
			const childOrientation = orthogonal(orientation);
			const childBox: Box = orientation === Orientation.HORIZONTAL
				? { top: box.top, left: box.left + offset, width: child.width, height: box.height }
				: { top: box.top + offset, left: box.left, width: box.width, height: child.height };

			children.push(this._getViews(child, childOrientation, childBox));
			offset += orientation === Orientation.HORIZONTAL ? child.width : child.height;
		}

		return { children, box };
	}

	private getNode(location: number[], node: Node = this.root, path: BranchNode[] = []): [BranchNode[], Node] {
		if (location.length === 0) {
			return [path, node];
		}

		if (!(node instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		const [index, ...rest] = location;

		if (index < 0 || index >= node.children.length) {
			throw new Error('Invalid location');
		}

		const child = node.children[index];
		path.push(node);

		return this.getNode(rest, child, path);
	}

	trySet2x2(): void {
		this.disposable2x2.dispose();
		this.disposable2x2 = Disposable.None;

		if (this.root.children.length !== 2) {
			return;
		}

		const [first, second] = this.root.children;

		if (!(first instanceof BranchNode) || !(second instanceof BranchNode)) {
			return;
		}

		this.disposable2x2 = first.trySet2x2(second);
	}

	dispose(): void {
		this.onDidSashResetRelay.dispose();
		this.root.dispose();

		if (this.element && this.element.parentElement) {
			this.element.parentElement.removeChild(this.element);
		}
	}
}
