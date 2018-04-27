/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gridview';
import { Event, anyEvent, Emitter, mapEvent } from 'vs/base/common/event';
import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { SplitView, IView as ISplitView } from 'vs/base/browser/ui/splitview/splitview';
import { empty as EmptyDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { $, append } from 'vs/base/browser/dom';

export interface IView {
	readonly minimumWidth: number;
	readonly maximumWidth: number;
	readonly minimumHeight: number;
	readonly maximumHeight: number;
	readonly onDidChange: Event<{ width: number; height: number; }>;
	render(container: HTMLElement): void;
	layout(width: number, height: number): void;
}

/*
TODO:
- GridView.orientation setter/getter
- implement move

- create grid wrapper which lets you talk only abut views, not locations
	- GridView.getLocation(HTMLElement)
- create grid wrapper which automatically sizes the new views

- NEW: 	add a color to show a border where the sash is, similar to how other
		widgets have a color (e.g. Button, with applyStyles). Challenge is that this
		color has to be applied via JS and not CSS to not apply it to all views
*/

function orthogonal(orientation: Orientation): Orientation {
	return orientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
}

export class GridLeafNode {
	constructor(readonly view: IView) { }
}

export class GridBranchNode {
	constructor(readonly children: GridNode[]) { }
}

export type GridNode = GridLeafNode | GridBranchNode;

export interface IGrid {
	layout(width: number, height: number): void;
	addView(view: IView, size: number, location: number[]): void;
	removeView(location: number[]): void;
	moveView(from: number[], to: number[]): void;
	resizeView(location: number[], size: number): void;
	getViewSize(location: number[]): number;
	getViews(): GridBranchNode;
}

function tail<T>(arr: T[]): [T[], T] {
	if (arr.length === 0) {
		throw new Error('Invalid tail call');
	}

	return [arr.slice(0, arr.length - 1), arr[arr.length - 1]];
}

abstract class AbstractNode implements ISplitView {

	readonly orientation: Orientation;

	private _size: number | undefined;
	get size(): number | undefined { return this._size; }

	private _orthogonalSize: number | undefined;
	get orthogonalSize(): number | undefined { return this._orthogonalSize; }

	abstract readonly minimumSize: number;
	abstract readonly maximumSize: number;
	abstract readonly minimumOrthogonalSize: number;
	abstract readonly maximumOrthogonalSize: number;
	abstract readonly onDidChange: Event<number>;

	constructor(orientation: Orientation, size?: number, orthogonalSize?: number) {
		this.orientation = orientation;
		this._size = size;
		this._orthogonalSize = orthogonalSize;
	}

	layout(size: number): void {
		this._size = size;
	}

	orthogonalLayout(size: number): void {
		this._orthogonalSize = size;
	}

	abstract render(container: HTMLElement): void;

	dispose(): void { }
}

class BranchNode extends AbstractNode {

	readonly children: Node[];
	private splitview: SplitView;

	get minimumSize(): number {
		return Math.max(...this.children.map(c => c.minimumOrthogonalSize));
	}

	get maximumSize(): number {
		return Math.min(...this.children.map(c => c.maximumOrthogonalSize));
	}

	get minimumOrthogonalSize(): number {
		return this.children.reduce((r, c) => r + c.minimumSize, 0);
	}

	get maximumOrthogonalSize(): number {
		return this.children.reduce((r, c) => r + c.maximumSize, 0);
	}

	private _onDidChange: Emitter<number | undefined>;
	get onDidChange(): Event<number | undefined> { return this._onDidChange.event; }
	private onDidChangeDisposable: IDisposable;

	constructor(orientation: Orientation, size?: number, orthogonalSize?: number) {
		super(orientation, size, orthogonalSize);

		this._onDidChange = new Emitter<number | undefined>();
		this.children = [];
		this.onDidChangeDisposable = EmptyDisposable;
	}

	layout(size: number): void {
		super.orthogonalLayout(size);

		for (const child of this.children) {
			child.orthogonalLayout(size);
		}
	}

	orthogonalLayout(size: number): void {
		super.layout(size);
		this.splitview.layout(size);
	}

	render(container: HTMLElement): void {
		this.splitview = new SplitView(container, { orientation: this.orientation });
		this.layout(this.size);
		this.orthogonalLayout(this.orthogonalSize);
	}

	addChild(node: Node, size: number, index: number): void {
		if (index < 0 || index > this.children.length) {
			throw new Error('Invalid index');
		}

		this.splitview.addView(node, size, index);
		this.children.splice(index, 0, node);
		this.onDidChildrenChange();
	}

	removeChild(index: number): Node {
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

class LeafNode extends AbstractNode {

	constructor(readonly view: IView, orientation: Orientation, orthogonalSize: number) {
		super(orientation, undefined, orthogonalSize);
	}

	private get width(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.orthogonalSize : this.size;
	}

	private get height(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.size : this.orthogonalSize;
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

	render(container: HTMLElement): void {
		return this.view.render(container);
	}

	layout(size: number): void {
		super.layout(size);
		return this.view.layout(this.width, this.height);
	}

	orthogonalLayout(size: number): void {
		super.orthogonalLayout(size);
		return this.view.layout(this.width, this.height);
	}
}

type Node = BranchNode | LeafNode;

export class GridView implements IGrid, IDisposable {

	private root: BranchNode;

	constructor(container: HTMLElement) {
		const el = append(container, $('.monaco-grid-view'));
		this.root = new BranchNode(Orientation.VERTICAL);
		this.root.render(el);
	}

	addView(view: IView, size: number, location: number[]): void {
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
			newParent.addChild(newSibling, Number.MAX_VALUE, 0);

			const node = new LeafNode(view, grandParent.orientation, parent.size);
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

	getViews(): GridBranchNode {
		return this._getViews(this.root) as GridBranchNode;
	}

	private _getViews(node: Node): GridNode {
		if (node instanceof BranchNode) {
			return new GridBranchNode(node.children.map(c => this._getViews(c)));
		} else {
			return new GridLeafNode(node.view);
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
		this.root.dispose();
	}
}
