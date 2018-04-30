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
- GridView.orientation setter/getter
- implement move

- create grid wrapper which automatically sizes the new views

- NEW: 	add a color to show a border where the sash is, similar to how other
		widgets have a color (e.g. Button, with applyStyles). Challenge is that this
		color has to be applied via JS and not CSS to not apply it to all views
- fix splitview issue: it can't be used before layout was called
- NEW:  provide a method to find a neighbour view from a given view. this would
		help when removing a view to know which next view to set active. The definition
		of the next view could be to a) check on the same dimension first (left/up) and
		then go one dimension up.
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

class BranchNode implements ISplitView, IDisposable {

	readonly element: HTMLElement;
	readonly children: Node[];
	private splitview: SplitView;

	private _size: number;
	get size(): number { return this._size; }

	private _orthogonalSize: number;
	get orthogonalSize(): number { return this._orthogonalSize; }

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

	constructor(
		readonly orientation: Orientation,
		size: number = 0,
		orthogonalSize: number = 0
	) {
		this._size = size;
		this._orthogonalSize = orthogonalSize;

		this._onDidChange = new Emitter<number | undefined>();
		this.children = [];
		this.onDidChangeDisposable = EmptyDisposable;

		this.element = $('.monaco-grid-branch-node');
		this.splitview = new SplitView(this.element, { orientation: this.orientation });
		this.layout(this.size);
		this.orthogonalLayout(this.orthogonalSize);
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

	addChild(node: Node, size: number, index: number): void {
		if (index < 0 || index > this.children.length) {
			throw new Error('Invalid index');
		}

		this.splitview.addView(node, size, index);
		this.children.splice(index, 0, node);
		this.onDidChildrenChange();
	}

	removeChild(index: number): void {
		if (index < 0 || index >= this.children.length) {
			throw new Error('Invalid index');
		}

		this.splitview.removeView(index);
		this.children.splice(index, 1);
		this.onDidChildrenChange();
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
	}
}

class LeafNode implements ISplitView, IDisposable {

	private _size: number = 0;
	get size(): number { return this._size; }

	private _orthogonalSize: number;
	get orthogonalSize(): number { return this._orthogonalSize; }

	constructor(
		readonly view: IView,
		readonly orientation: Orientation,
		orthogonalSize: number = 0
	) {
		this._orthogonalSize = orthogonalSize;
	}

	private get width(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.orthogonalSize : this.size;
	}

	private get height(): number {
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

export class GridView implements IGrid, IDisposable {

	private root: BranchNode;

	get orientation(): Orientation {
		return this.root.orientation;
	}

	constructor(container: HTMLElement) {
		const el = append(container, $('.monaco-grid-view'));
		this.root = new BranchNode(Orientation.VERTICAL);
		el.appendChild(this.root.element);
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
			newParent.addChild(newSibling, 0, 0);

			const node = new LeafNode(view, grandParent.orientation, parent.size);
			newParent.addChild(node, size, index);
		}
	}

	removeView(location: number[]): IView {
		const [rest, index] = tail(location);
		const [pathToParent, parent] = this.getNode(rest);

		if (!(parent instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		const node = parent.children[index];

		if (!(node instanceof LeafNode)) {
			throw new Error('Invalid location');
		}

		parent.removeChild(index);

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
		grandParent.removeChild(parentIndex);
		grandParent.addChild(sibling, sibling.orthogonalSize, parentIndex);

		return node.view;
	}

	layout(width: number, height: number): void {
		this.root.layout(width);
		this.root.orthogonalLayout(height);
	}

	moveView(from: number[], to: number[]): void {
		const size = this.getViewSize(from);
		const view = this.removeView(from);
		this.addView(view, size, to);
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

export function getRelativeLocation(rootOrientation: Orientation, location: number[], direction: Direction): number[] {
	const orientation = location.length % 2 === 0
		? orthogonal(rootOrientation)
		: rootOrientation;

	const sameDimension = (orientation === Orientation.HORIZONTAL && (direction === Direction.Left || direction === Direction.Right))
		|| (orientation === Orientation.VERTICAL && (direction === Direction.Up || direction === Direction.Down));

	if (sameDimension) {
		let [rest, index] = tail(location);

		if (direction === Direction.Right || direction === Direction.Down) {
			index += 1;
		}

		return [...rest, index];
	} else {
		const index = (direction === Direction.Right || direction === Direction.Down) ? 1 : 0;
		return [...location, index];
	}
}

function indexInParent(element: HTMLElement): number {
	const parentElement = element.parentElement;
	let el = parentElement.firstElementChild;
	let index = 0;

	while (el !== element && el !== parentElement.lastElementChild) {
		el = el.nextElementSibling;
		index++;
	}

	return index;
}

/**
 * This will break as soon as DOM structures of the Splitview or Gridview change.
 */
function getGridLocation(element: HTMLElement): number[] {
	if (/\bmonaco-grid-view\b/.test(element.parentElement.className)) {
		return [];
	}

	const index = indexInParent(element.parentElement);
	const ancestor = element.parentElement.parentElement.parentElement.parentElement;
	return [...getGridLocation(ancestor), index];
}

export enum Direction {
	Up,
	Down,
	Left,
	Right
}

export class SplitGridView<T extends IView> implements IDisposable {

	private gridview: GridView;
	private views = new Map<T, HTMLElement>();

	constructor(container: HTMLElement, view: T) {
		this.gridview = new GridView(container);
		this._addView(view, 0, [0]);
	}

	splitView(view: T, direction: Direction, newView: T, size: number): void {
		if (this.views.has(newView)) {
			throw new Error('Can\'t add same view twice');
		}

		const referenceLocation = this.getViewLocation(view);
		const location = getRelativeLocation(this.gridview.orientation, referenceLocation, direction);

		this._addView(newView, size, location);
	}

	private _addView(view: T, size: number, location: number[]): void {
		this.views.set(view, view.element);
		this.gridview.addView(view, size, location);
	}

	removeView(view: T): void {
		if (this.views.size === 1) {
			throw new Error('Can\'t remove last view');
		}

		if (!this.views.has(view)) {
			throw new Error('View not found');
		}

		const location = this.getViewLocation(view);
		this.gridview.removeView(location);
		this.views.delete(view);
	}

	layout(width: number, height: number): void {
		this.gridview.layout(width, height);
	}

	moveView(from: T, to: T): void {
		const fromLocation = this.getViewLocation(from);
		const toLocation = this.getViewLocation(to);
		return this.gridview.moveView(fromLocation, toLocation);
	}

	resizeView(view: T, size: number): void {
		const location = this.getViewLocation(view);
		return this.gridview.resizeView(location, size);
	}

	getViewSize(view: T): number {
		const location = this.getViewLocation(view);
		return this.gridview.getViewSize(location);
	}

	getViews(): GridBranchNode {
		return this.gridview.getViews();
	}

	private getViewLocation(view: T): number[] {
		const element = this.views.get(view);

		if (!element) {
			throw new Error('View not found');
		}

		return getGridLocation(element);
	}

	dispose(): void {
		this.gridview.dispose();
	}
}
