/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gridview';
import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { tail2 as tail, equals } from 'vs/base/common/arrays';
import { orthogonal, IView, GridView } from './gridview';
import { domEvent } from 'vs/base/browser/event';

export { Orientation } from './gridview';

export class GridLeafNode<T extends IView> {
	constructor(readonly view: T) { }
}

export class GridBranchNode<T extends IView> {
	constructor(readonly children: GridNode<T>[]) { }
}

export type GridNode<T extends IView> = GridLeafNode<T> | GridBranchNode<T>;

export function isGridBranchNode<T extends IView>(node: GridNode<T>): node is GridBranchNode<T> {
	return !!(node as any).children;
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

function directionOrientation(direction: Direction): Orientation {
	return direction === Direction.Up || direction === Direction.Down ? Orientation.VERTICAL : Orientation.HORIZONTAL;
}

export interface IGridDnd {

}

export interface IGridOptions {
	dnd?: IGridDnd;
}

class DndController implements IDisposable {

	private disposables: IDisposable[] = [];

	constructor(container: HTMLElement, gridview: GridView) {
		domEvent(container, 'dragover')(this.onDragOver, this, this.disposables);
	}

	private onDragOver(ev: DragEvent) {
		// find target element
		console.log('DRAG OVER');
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class Grid<T extends IView> implements IDisposable {

	private gridview: GridView;
	private views = new Map<T, HTMLElement>();
	private disposables: IDisposable[] = [];

	get orientation(): Orientation { return this.gridview.orientation; }
	set orientation(orientation: Orientation) { this.gridview.orientation = orientation; }

	constructor(container: HTMLElement, view: T, options: IGridOptions = {}) {
		this.gridview = new GridView(container);
		this.disposables.push(this.gridview);

		this._addView(view, 0, [0]);

		if (options.dnd) {
			this.disposables.push(new DndController(container, this.gridview));
		}
	}

	layout(width: number, height: number): void {
		this.gridview.layout(width, height);
	}

	addView(newView: T, size: number, referenceView: T, direction: Direction): void {
		if (this.views.has(newView)) {
			throw new Error('Can\'t add same view twice');
		}

		const orientation = directionOrientation(direction);

		if (this.views.size === 1 && this.orientation !== orientation) {
			this.orientation = orientation;
		}

		const referenceLocation = this.getViewLocation(referenceView);
		const location = getRelativeLocation(this.gridview.orientation, referenceLocation, direction);

		this._addView(newView, size, location);
	}

	protected _addView(newView: T, size: number, location): void {
		this.views.set(newView, newView.element);
		this.gridview.addView(newView, size, location);
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

	moveView(view: T, size: number, referenceView: T, direction: Direction): void {
		if (!this.views.has(view)) {
			throw new Error('View not found');
		}

		const fromLocation = this.getViewLocation(view);
		const [fromRest, fromIndex] = tail(fromLocation);

		const referenceLocation = this.getViewLocation(referenceView);
		const toLocation = getRelativeLocation(this.gridview.orientation, referenceLocation, direction);

		if (fromLocation.length <= toLocation.length) {
			const toRest = toLocation.slice(0, fromRest.length);

			if (equals(fromRest, toRest)) {
				const index = fromRest.length;

				if (fromIndex <= toLocation[index]) {
					toLocation[index] -= 1;
				}
			}
		}

		this.gridview.removeView(fromLocation);
		this.gridview.addView(view, size, toLocation);
	}

	swapViews(from: T, to: T): void {
		const fromLocation = this.getViewLocation(from);
		const toLocation = this.getViewLocation(to);
		return this.gridview.swapViews(fromLocation, toLocation);
	}

	resizeView(view: T, size: number): void {
		const location = this.getViewLocation(view);
		return this.gridview.resizeView(location, size);
	}

	getViewSize(view: T): number {
		const location = this.getViewLocation(view);
		return this.gridview.getViewSize(location);
	}

	getViews(): GridBranchNode<T> {
		return this.gridview.getViews() as GridBranchNode<T>;
	}

	private getViewLocation(view: T): number[] {
		const element = this.views.get(view);

		if (!element) {
			throw new Error('View not found');
		}

		return getGridLocation(element);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export interface ISerializableView extends IView {
	toJSON(): any;
}

export interface IViewDeserializer<T extends ISerializableView> {
	fromJSON(json: any): T;
}

/**
 * TODO: view sizes?
 */
export class SerializableGrid<T extends ISerializableView> extends Grid<T> {

	private static serializeNode<T extends ISerializableView>(node: GridNode<T>): any {
		if (isGridBranchNode(node)) {
			return { type: 'branch', data: node.children.map(c => SerializableGrid.serializeNode(c)) };
		} else {
			return { type: 'leaf', data: node.view.toJSON() };
		}
	}

	private static deserializeNode<T extends ISerializableView>(json: any, deserializer: IViewDeserializer<T>): GridNode<T> {
		if (!json || typeof json !== 'object') {
			throw new Error('Invalid JSON');
		}

		const type = json.type;
		const data = json.data;

		if (type === 'branch') {
			if (!Array.isArray(data)) {
				throw new Error('Invalid JSON: \'data\' property of branch must be an array.');
			}

			return new GridBranchNode<T>((data as any[]).map(c => SerializableGrid.deserializeNode(c, deserializer)));
		} else if (type === 'leaf') {
			return new GridLeafNode<T>(deserializer.fromJSON(data));
		}

		throw new Error('Invalid JSON: \'type\' property must be either \'branch\' or \'leaf\'.');
	}

	private static getFirstLeaf<T extends IView>(node: GridNode<T>): GridLeafNode<T> | undefined {
		if (!isGridBranchNode(node)) {
			return node;
		}

		return SerializableGrid.getFirstLeaf(node.children[0]);
	}

	static deserialize<T extends ISerializableView>(container: HTMLElement, json: any, deserializer: IViewDeserializer<T>, options: IGridOptions = {}): SerializableGrid<T> {
		if (typeof json.orientation !== 'number') {
			throw new Error('Invalid JSON: \'orientation\' property must be a number.');
		}

		const orientation = json.orientation as Orientation;
		const root = SerializableGrid.deserializeNode(json.root, deserializer);
		const firstLeaf = SerializableGrid.getFirstLeaf(root);

		if (!firstLeaf) {
			throw new Error('Invalid serialized state, first leaf not found');
		}

		const result = new SerializableGrid<T>(container, firstLeaf.view, options);
		result.orientation = orientation;
		result.populate(firstLeaf.view, orientation, root);

		return result;
	}

	private populate(referenceView: T, orientation: Orientation, node: GridNode<T>): void {
		if (!isGridBranchNode(node)) {
			return;
		}

		const direction = orientation === Orientation.VERTICAL ? Direction.Down : Direction.Right;
		let isFirstChild = true;

		for (const child of node.children) {
			if (!isFirstChild) {
				const firstLeaf = SerializableGrid.getFirstLeaf(node);
				this.addView(firstLeaf.view, 100, referenceView, direction);
				referenceView = firstLeaf.view;
			}

			isFirstChild = false;
			this.populate(referenceView, orthogonal(orientation), child);
		}
	}

	serialize(): any {
		return {
			root: SerializableGrid.serializeNode(this.getViews()),
			orientation: this.orientation
		};
	}
}