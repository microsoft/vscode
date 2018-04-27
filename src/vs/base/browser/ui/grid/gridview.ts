/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gridview';
import { Event, anyEvent, Emitter } from 'vs/base/common/event';
import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { SplitView, IView as ISplitView } from 'vs/base/browser/ui/splitview/splitview';
import { empty as EmptyDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { $, append } from 'vs/base/browser/dom';

// export { IView } from 'vs/base/browser/ui/splitview/splitview';
export { Orientation } from 'vs/base/browser/ui/sash/sash';

export interface IView {
	readonly minimumWidth: number;
	readonly maximumWidth: number;
	readonly minimumHeight: number;
	readonly maximumHeight: number;
	readonly onDidChange: Event<number | undefined>;
	render(container: HTMLElement): void;
	layout(width: number, height: number): void;
}

/*
TODO:
- IView needs to change to accommodate width/height
- GridView.getLocation(HTMLElement)
- GridView.orientation setter/getter

- create grid wrapper which lets you talk only abut views, not locations
- create grid wrapper which automatically sizes the new views
*/

function orthogonal(orientation: Orientation): Orientation {
	return orientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
}

export class GridLeafNode<T extends IView> {
	constructor(readonly view: T) { }
}

export class GridBranchNode<T extends IView> {
	constructor(readonly children: GridNode<T>[]) { }
}

export type GridNode<T extends IView> = GridLeafNode<T> | GridBranchNode<T>;

export interface IGrid<T extends IView> {
	layout(width: number, height: number): void;
	addView(view: IView, size: number, location: number[]): void;
	removeView(location: number[]): void;
	moveView(from: number[], to: number[]): void;
	resizeView(location: number[], size: number): void;
	getViewSize(location: number[]): number;
	getViews(): GridBranchNode<T>;
}

function tail<T>(arr: T[]): [T[], T] {
	if (arr.length === 0) {
		throw new Error('Invalid tail call');
	}

	return [arr.slice(0, arr.length - 1), arr[arr.length - 1]];
}

abstract class AbstractNode implements ISplitView {

	abstract minimumSize: number;
	abstract maximumSize: number;

	abstract onDidChange: Event<number>;
	abstract render(container: HTMLElement): void;

	private _size: number | undefined;
	get size(): number | undefined { return this._size; }

	private _orthogonalSize: number | undefined;
	get orthogonalSize(): number | undefined { return this._orthogonalSize; }

	constructor(size?: number, orthogonalSize?: number) {
		this._size = size;
		this._orthogonalSize = orthogonalSize;
	}

	layout(size: number): void {
		this._size = size;
	}

	orthogonalLayout(size: number): void {
		this._orthogonalSize = size;
	}

	dispose(): void { }
}

class BranchNode<T extends IView> extends AbstractNode {

	readonly children: Node<T>[];
	private splitview: SplitView;
	readonly orientation: Orientation;

	get minimumSize(): number {
		let result = 0;

		for (const child of this.children) {
			if (!(child instanceof BranchNode)) {
				continue;
			}

			for (const grandchild of child.children) {
				result += grandchild.minimumSize;
			}
		}

		return result;
	}

	get maximumSize(): number {
		let result = 0;

		for (const child of this.children) {
			if (!(child instanceof BranchNode)) {
				continue;
			}

			for (const grandchild of child.children) {
				result += grandchild.maximumSize;
			}
		}

		return result;
	}

	private _onDidChange: Emitter<number | undefined>;
	get onDidChange(): Event<number | undefined> { return this._onDidChange.event; }
	private onDidChangeDisposable: IDisposable;

	constructor(orientation: Orientation, size?: number, orthogonalSize?: number) {
		super(size, orthogonalSize);

		this.orientation = orientation;
		this._onDidChange = new Emitter<number | undefined>();
		this.children = [];
		this.onDidChangeDisposable = EmptyDisposable;
	}

	layout(size: number): void {
		super.layout(size);

		for (const child of this.children) {
			child.orthogonalLayout(size);
		}
	}

	orthogonalLayout(size: number): void {
		super.orthogonalLayout(size);
		this.splitview.layout(size);
	}

	render(container: HTMLElement): void {
		this.splitview = new SplitView(container, { orientation: this.orientation });
		this.layout(this.size);
		this.orthogonalLayout(this.orthogonalSize);
	}

	addChild(node: Node<T>, size: number, index: number): void {
		if (index < 0 || index > this.children.length) {
			throw new Error('Invalid index');
		}

		this.splitview.addView(node, size, index);
		this.children.splice(index, 0, node);
		this.onDidChildrenChange();
	}

	removeChild(index: number): Node<T> {
		if (index < 0 || index >= this.children.length) {
			throw new Error('Invalid index');
		}

		const child = this.children[index];
		this.splitview.removeView(index);
		this.children.splice(index, 1);
		this.onDidChildrenChange();
		return child;
	}

	resizeChild(index: number, size: number): void {
		if (index < 0 || index >= this.children.length) {
			throw new Error('Invalid index');
		}

		this.splitview.resizeView(index, size);
	}

	getChildSize(index: number): number {
		if (index < 0 || index >= this.children.length) {
			throw new Error('Invalid index');
		}

		return this.splitview.getViewSize(index);
	}

	private onDidChildrenChange(): void {
		const onDidChildrenChange = anyEvent(...this.children.map(c => c.onDidChange));
		this.onDidChangeDisposable.dispose();
		this.onDidChangeDisposable = onDidChildrenChange(this._onDidChange.fire, this._onDidChange);
	}

	dispose(): void {
		for (const child of this.children) {
			child.dispose();
		}

		this.onDidChangeDisposable.dispose();
		this.splitview.dispose();
		super.dispose();
	}
}

class LeafNode<T extends IView> extends AbstractNode {

	constructor(readonly view: T, orthogonalSize: number) {
		super(undefined, orthogonalSize);
	}

	get minimumSize(): number { return /* this.view.minimumSize */ 20; }
	get maximumSize(): number { return /* this.view.maximumSize */ Number.MAX_VALUE; }
	get onDidChange(): Event<number> { return this.view.onDidChange; }

	render(container: HTMLElement): void {
		return this.view.render(container);
	}

	layout(size: number): void {
		super.layout(size);
		return this.view.layout(size, void 0);
	}
}

type Node<T extends IView> = BranchNode<T> | LeafNode<T>;

export class GridView<T extends IView> implements IGrid<T>, IDisposable {

	private root: BranchNode<T>;

	constructor(container: HTMLElement) {
		const el = append(container, $('.monaco-grid-view'));
		this.root = new BranchNode(Orientation.VERTICAL);
		this.root.render(el);
	}

	addView(view: T, size: number, location: number[]): void {
		const [rest, index] = tail(location);
		const [pathToParent, parent] = this.getNode(rest);

		if (parent instanceof BranchNode) {
			const node = new LeafNode<T>(view, parent.size);
			parent.addChild(node, size, index);
		} else {
			const [, grandParent] = tail(pathToParent);
			const [, parentIndex] = tail(rest);
			grandParent.removeChild(parentIndex);

			// console.log('PROMOTE', parent.size, parent.orthogonalSize);
			const newParent = new BranchNode<T>(orthogonal(grandParent.orientation), parent.orthogonalSize, parent.size);
			// console.log('TO', newParent.orientation, newParent.size, newParent.orthogonalSize);
			grandParent.addChild(newParent, parent.size, parentIndex);
			newParent.layout(parent.orthogonalSize);

			const newSibling = new LeafNode<T>(parent.view, parent.size);
			newParent.addChild(newSibling, Number.MAX_VALUE, 0);

			const node = new LeafNode<T>(view, parent.size);
			newParent.addChild(node, size, index);
		}
	}

	removeView(location: number[]): void {
		const [rest, index] = tail(location);
		const [pathToParent, parent] = this.getNode(rest);

		if (!(parent instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		parent.removeChild(index);

		if (parent.children.length === 0) {
			throw new Error('Invalid grid state');
		}

		if (parent.children.length > 1) {
			return;
		}

		const [, grandParent] = tail(pathToParent);
		const [, parentIndex] = tail(rest);

		const sibling = parent.removeChild(0);
		grandParent.removeChild(parentIndex);
		grandParent.addChild(sibling, 20, parentIndex);
	}

	layout(width: number, height: number): void {
		console.log('grid layout', width, height);
		this.root.layout(width);
		this.root.orthogonalLayout(height);
	}

	moveView(from: number[], to: number[]): void {
		throw new Error('Method not implemented.');
	}

	resizeView(location: number[], size: number): void {
		const [rest, index] = tail(location);
		const [, parent] = this.getNode(rest);

		if (!(parent instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		parent.resizeChild(index, size);
	}

	getViewSize(location: number[]): number {
		const [rest, index] = tail(location);
		const [, parent] = this.getNode(rest);

		if (!(parent instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		return parent.getChildSize(index);
	}

	getViews(): GridBranchNode<T> {
		return this._getViews(this.root) as GridBranchNode<T>;
	}

	private _getViews(node: Node<T>): GridNode<T> {
		if (node instanceof BranchNode) {
			return new GridBranchNode(node.children.map(c => this._getViews(c)));
		} else {
			return new GridLeafNode(node.view);
		}
	}

	private getNode(location: number[], node: Node<T> = this.root, path: BranchNode<T>[] = []): [BranchNode<T>[], Node<T>] {
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
		this.root.dispose();
	}
}
