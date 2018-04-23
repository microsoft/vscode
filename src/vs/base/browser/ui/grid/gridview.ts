/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event, anyEvent, Emitter } from 'vs/base/common/event';
import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { SplitView, IView } from 'vs/base/browser/ui/splitview/splitview';
import { empty as EmptyDisposable, IDisposable } from 'vs/base/common/lifecycle';

export { IView } from 'vs/base/browser/ui/splitview/splitview';
export { Orientation } from 'vs/base/browser/ui/sash/sash';

function orthogonal(orientation: Orientation): Orientation {
	return orientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
}

export interface ILeafNode<T extends IView> {
	view: T;
}

export interface IBranchNode<T extends IView> {
	children: IGridNode<T>[];
}

export type IGridNode<T extends IView> = ILeafNode<T> | IBranchNode<T>;

export interface IGrid<T extends IView> {
	layout(width: number, height: number): void;
	addView(view: IView, size: number, location: number[]): void;
	removeView(location: number[]): void;
	moveView(from: number[], to: number[]): void;
	resizeView(location: number[], size: number): void;
	getViewSize(location: number[]): number;
	getViews(): IBranchNode<T>;
}

function tail<T>(arr: T[]): [T[], T] {
	return [arr.slice(0, arr.length - 1), arr[length - 1]];
}

abstract class AbstractNode implements IView {

	abstract minimumSize: number;
	abstract maximumSize: number;
	abstract onDidChange: Event<number>;
	abstract render(container: HTMLElement, orientation: Orientation): void;

	protected size: number | undefined;
	protected orthogonalSize: number | undefined;
	readonly orientation;

	layout(size: number): void {
		this.size = size;
	}

	orthogonalLayout(size: number): void {
		this.orthogonalSize = size;
	}

	dispose(): void {

	}
}

class BranchNode<T extends IView> extends AbstractNode {

	readonly children: Node<T>[] = [];
	private splitview: SplitView;

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

	private _onDidChange = new Emitter<number | undefined>();
	get onDidChange(): Event<number | undefined> { return this._onDidChange.event; }
	private onDidChangeDisposable: IDisposable = EmptyDisposable;

	constructor(readonly orientation: Orientation) {
		super();
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
		this.splitview.addView(node, size, index);
		this.children.splice(index, 0, node);
		this.onDidChildrenChange();
	}

	removeChild(index: number): Node<T> {
		const child = this.children[index];
		this.splitview.removeView(index);
		this.children.splice(index, 1);
		this.onDidChildrenChange();
		return child;
	}

	resizeChild(index: number, size: number): void {
		this.splitview.resizeView(index, size);
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

	constructor(readonly view: T, readonly orientation: Orientation) {
		super();
	}

	get minimumSize(): number { return this.view.minimumSize; }
	get maximumSize(): number { return this.view.maximumSize; }
	get onDidChange(): Event<number> { return this.view.onDidChange; }

	render(container: HTMLElement, orientation: Orientation): void {
		return this.view.render(container, orientation);
	}

	layout(size: number): void {
		super.layout(size);
		return this.view.layout(size, this.orientation);
	}
}

type Node<T extends IView> = BranchNode<T> | LeafNode<T>;

export class GridView<T extends IView> implements IGrid<T>, IDisposable {

	private root: BranchNode<T>;

	constructor(container: HTMLElement) {
		this.root = new BranchNode(Orientation.VERTICAL);
		this.root.render(container);
	}

	addView(view: T, size: number, location: number[]): void {
		const [rest, index] = tail(location);
		const [pathToParent, parent] = this.getNode(rest);
		const node = new LeafNode<T>(view, orthogonal(parent.orientation));

		if (parent instanceof BranchNode) {
			parent.addChild(node, size, index);
		} else {
			const [, grandParent] = tail(pathToParent);
			const [, parentIndex] = tail(rest);
			grandParent.removeChild(parentIndex);

			const newParent = new BranchNode<T>(parent.orientation);
			grandParent.addChild(newParent, 20, parentIndex);
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
		throw new Error('Method not implemented.');
	}

	getViews(): IBranchNode<T> {
		return this._getViews(this.root) as IBranchNode<T>;
	}

	private _getViews(node: Node<T>): IGridNode<T> {
		if (node instanceof BranchNode) {
			return { children: node.children.map(c => this._getViews(c)) };
		} else {
			return { view: node.view };
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
		const child = node.children[index];
		path.push(node);

		return this.getNode(rest, child, path);
	}

	dispose(): void {
		this.root.dispose();
	}
}