/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gridview';
import { Event, anyEvent, Emitter, mapEvent, Relay } from 'vs/base/common/event';
import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { SplitView, IView as ISplitView, Sizing } from 'vs/base/browser/ui/splitview/splitview';
import { empty as EmptyDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { $, append } from 'vs/base/browser/dom';
import { tail2 as tail } from 'vs/base/common/arrays';

export { Sizing } from 'vs/base/browser/ui/splitview/splitview';
export { Orientation } from 'vs/base/browser/ui/sash/sash';

export interface IView {
	readonly element: HTMLElement;
	readonly minimumWidth: number;
	readonly maximumWidth: number;
	readonly minimumHeight: number;
	readonly maximumHeight: number;
	readonly onDidChange: Event<{ width: number; height: number; }>;
	layout(width: number, height: number): void;
}

/*
TODO:
	- NEW: 	add a color to show a border where the sash is, similar to how other
			widgets have a color (e.g. Button, with applyStyles). Challenge is that this
			color has to be applied via JS and not CSS to not apply it to all views
			NOT CSS
*/

export function orthogonal(orientation: Orientation): Orientation {
	return orientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
}

export interface GridLeafNode {
	readonly view: IView;
	readonly size: number;
}

export interface GridBranchNode {
	readonly children: GridNode[];
	readonly size: number;
}

export type GridNode = GridLeafNode | GridBranchNode;

export function isGridBranchNode(node: GridNode): node is GridBranchNode {
	return !!(node as any).children;
}

class BranchNode implements ISplitView, IDisposable {

	readonly element: HTMLElement;
	readonly children: Node[];
	private splitview: SplitView;

	private _size: number;
	get size(): number { return this._size; }

	private _orthogonalSize: number;
	get orthogonalSize(): number { return this._orthogonalSize; }

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
		return this.children.length === 0 ? 0 : this.children.reduce((r, c) => r + c.minimumSize, 0);
	}

	get maximumOrthogonalSize(): number {
		return this.children.length === 0 ? Number.POSITIVE_INFINITY : this.children.reduce((r, c) => r + c.maximumSize, 0);
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

	private _onDidChange: Emitter<number | undefined>;
	get onDidChange(): Event<number | undefined> { return this._onDidChange.event; }
	private childrenChangeDisposable: IDisposable = EmptyDisposable;

	private _onDidSashReset = new Emitter<number[]>();
	readonly onDidSashReset: Event<number[]> = this._onDidSashReset.event;
	private splitviewSashResetDisposable: IDisposable = EmptyDisposable;
	private childrenSashResetDisposable: IDisposable = EmptyDisposable;

	constructor(
		readonly orientation: Orientation,
		size: number = 0,
		orthogonalSize: number = 0
	) {
		this._size = size;
		this._orthogonalSize = orthogonalSize;

		this._onDidChange = new Emitter<number | undefined>();
		this.children = [];

		this.element = $('.monaco-grid-branch-node');
		this.splitview = new SplitView(this.element, { orientation: this.orientation });
		this.splitview.layout(size);

		const onDidSashReset = mapEvent(this.splitview.onDidSashReset, i => [i]);
		this.splitviewSashResetDisposable = onDidSashReset(this._onDidSashReset.fire, this._onDidSashReset);
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
		this.children.splice(index, 0, node);
		this.onDidChildrenChange();
	}

	removeChild(index: number, sizing?: Sizing): void {
		if (index < 0 || index >= this.children.length) {
			throw new Error('Invalid index');
		}

		this.splitview.removeView(index, sizing);
		this.children.splice(index, 1);
		this.onDidChildrenChange();
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
		[this.children[from], this.children[to]] = [this.children[to], this.children[from]];
	}

	resizeChild(index: number, size: number): void {
		if (index < 0 || index >= this.children.length) {
			throw new Error('Invalid index');
		}

		this.splitview.resizeView(index, size);
	}

	distributeViewSizes(): void {
		this.splitview.distributeViewSizes();
	}

	getChildSize(index: number): number {
		if (index < 0 || index >= this.children.length) {
			throw new Error('Invalid index');
		}

		return this.splitview.getViewSize(index);
	}

	private onDidChildrenChange(): void {
		const onDidChildrenChange = anyEvent(...this.children.map(c => c.onDidChange));
		this.childrenChangeDisposable.dispose();
		this.childrenChangeDisposable = onDidChildrenChange(this._onDidChange.fire, this._onDidChange);

		const onDidChildrenSashReset = anyEvent(...this.children.map((c, i) => mapEvent(c.onDidSashReset, location => [i, ...location])));
		this.childrenSashResetDisposable.dispose();
		this.childrenSashResetDisposable = onDidChildrenSashReset(this._onDidSashReset.fire, this._onDidSashReset);

		this._onDidChange.fire();
	}

	dispose(): void {
		for (const child of this.children) {
			child.dispose();
		}

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

	constructor(
		readonly view: IView,
		readonly orientation: Orientation,
		orthogonalSize: number = 0
	) {
		this._orthogonalSize = orthogonalSize;
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

	get minimumSize(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.view.minimumHeight : this.view.minimumWidth;
	}

	get maximumSize(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.view.maximumHeight : this.view.maximumWidth;
	}

	get minimumOrthogonalSize(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.view.minimumWidth : this.view.minimumHeight;
	}

	get maximumOrthogonalSize(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.view.maximumWidth : this.view.maximumHeight;
	}

	get onDidChange(): Event<number> {
		return mapEvent(this.view.onDidChange, this.orientation === Orientation.HORIZONTAL ? ({ width }) => width : ({ height }) => height);
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

function flipNode(node: Node, size: number, orthogonalSize: number): Node {
	if (node instanceof BranchNode) {
		const result = new BranchNode(orthogonal(node.orientation), size, orthogonalSize);

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

		return result;
	} else {
		return new LeafNode(node.view, orthogonal(node.orientation), orthogonalSize);
	}
}

export class GridView implements IDisposable {

	private element: HTMLElement;
	private root: BranchNode;
	private onDidSashResetRelay = new Relay<number[]>();
	readonly onDidSashReset: Event<number[]> = this.onDidSashResetRelay.event;

	get orientation(): Orientation {
		return this.root.orientation;
	}

	set orientation(orientation: Orientation) {
		if (this.root.orientation === orientation) {
			return;
		}

		const oldRoot = this.root;
		this.element.removeChild(oldRoot.element);

		this.root = flipNode(oldRoot, oldRoot.orthogonalSize, oldRoot.size) as BranchNode;
		this.element.appendChild(this.root.element);
		this.onDidSashResetRelay.input = this.root.onDidSashReset;

		this.root.layout(oldRoot.size);
		this.root.orthogonalLayout(oldRoot.orthogonalSize);

		oldRoot.dispose();
	}

	get width(): number {
		return this.root.width;
	}

	get height(): number {
		return this.root.height;
	}

	get minimumWidth(): number {
		return this.root.minimumWidth;
	}

	get minimumHeight(): number {
		return this.root.minimumHeight;
	}

	get maximumWidth(): number {
		return this.root.maximumHeight;
	}

	get maximumHeight(): number {
		return this.root.maximumHeight;
	}

	constructor(container: HTMLElement) {
		this.element = append(container, $('.monaco-grid-view'));
		this.root = new BranchNode(Orientation.VERTICAL);
		this.element.appendChild(this.root.element);
		this.onDidSashResetRelay.input = this.root.onDidSashReset;
	}

	layout(width: number, height: number): void {
		const [size, orthogonalSize] = this.root.orientation === Orientation.HORIZONTAL ? [height, width] : [width, height];
		this.root.layout(size);
		this.root.orthogonalLayout(orthogonalSize);
	}

	addView(view: IView, size: number | Sizing, location: number[]): void {
		const [rest, index] = tail(location);
		const [pathToParent, parent] = this.getNode(rest);

		if (parent instanceof BranchNode) {
			const node = new LeafNode(view, orthogonal(parent.orientation), parent.orthogonalSize);
			parent.addChild(node, size, index);

		} else {
			const [, grandParent] = tail(pathToParent);
			const [, parentIndex] = tail(rest);
			grandParent.removeChild(parentIndex);

			const newParent = new BranchNode(parent.orientation, parent.size, parent.orthogonalSize);
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

		if (parent.children.length > 1 || pathToParent.length === 0) {
			return node.view;
		}

		const [, grandParent] = tail(pathToParent);
		const [, parentIndex] = tail(rest);

		const sibling = parent.children[0];
		parent.removeChild(0);
		grandParent.removeChild(parentIndex, sizing);

		if (sibling instanceof BranchNode) {
			for (let i = 0; i < sibling.children.length; i++) {
				const child = sibling.children[i];
				grandParent.addChild(child, child.size, parentIndex + i);
			}
		} else {
			const newSibling = new LeafNode(sibling.view, orthogonal(sibling.orientation), sibling.size);
			grandParent.addChild(newSibling, sibling.orthogonalSize, parentIndex);
		}

		return node.view;
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

	distributeViewSizes(location: number[]): void {
		const [, node] = this.getNode(location);

		if (!(node instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		node.distributeViewSizes();
	}

	getViewSize(location: number[]): { width: number; height: number; } {
		const [, node] = this.getNode(location);
		return { width: node.width, height: node.height };
	}

	getViews(): GridBranchNode {
		return this._getViews(this.root) as GridBranchNode;
	}

	private _getViews(node: Node): GridNode {
		if (node instanceof BranchNode) {
			return { children: node.children.map(c => this._getViews(c)), size: node.orthogonalSize };
		} else {
			return { view: node.view, size: node.size };
		}
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

	dispose(): void {
		this.onDidSashResetRelay.dispose();
		this.root.dispose();
	}
}