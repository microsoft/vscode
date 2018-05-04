/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gridview';
import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { tail2 as tail } from 'vs/base/common/arrays';
import { orthogonal, IView, GridView } from './gridview';

export { Orientation } from './gridview';

export interface GridLeafNode<T extends IView> {
	readonly view: T;
	readonly size: number;
}

export interface GridBranchNode<T extends IView> {
	readonly children: GridNode<T>[];
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

export class Grid<T extends IView> implements IDisposable {

	private gridview: GridView;
	private views = new Map<T, HTMLElement>();
	private disposables: IDisposable[] = [];

	get orientation(): Orientation { return this.gridview.orientation; }
	set orientation(orientation: Orientation) { this.gridview.orientation = orientation; }

	get width(): number { return this.gridview.width; }
	get height(): number { return this.gridview.height; }

	constructor(container: HTMLElement, view: T) {
		this.gridview = new GridView(container);
		this.disposables.push(this.gridview);

		this._addView(view, 0, [0]);
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

	swapViews(from: T, to: T): void {
		const fromLocation = this.getViewLocation(from);
		const toLocation = this.getViewLocation(to);
		return this.gridview.swapViews(fromLocation, toLocation);
	}

	resizeView(view: T, size: number): void {
		const location = this.getViewLocation(view);
		return this.gridview.resizeView(location, size);
	}

	getViewSize(view: T): { width: number; height: number; } {
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
 * TODO:
 * 	view sizes should be serialized too
 */
export class SerializableGrid<T extends ISerializableView> extends Grid<T> {

	private static serializeNode<T extends ISerializableView>(node: GridNode<T>): any {
		if (isGridBranchNode(node)) {
			return { type: 'branch', data: node.children.map(c => SerializableGrid.serializeNode(c)) };
		} else {
			return { type: 'leaf', data: node.view.toJSON(), size: node.size };
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

			const nodes = data as any[];
			const children = nodes.map(c => SerializableGrid.deserializeNode(c, deserializer));

			return { children };

		} else if (type === 'leaf') {
			if (typeof json.size !== 'number') {
				throw new Error('Invalid JSON: \'size\' property of leaf must be a number.');
			}

			const view = deserializer.fromJSON(data) as T;
			const size = json.size as number;

			return { view, size };
		}

		throw new Error('Invalid JSON: \'type\' property must be either \'branch\' or \'leaf\'.');
	}

	private static getFirstLeaf<T extends IView>(node: GridNode<T>): GridLeafNode<T> | undefined {
		if (!isGridBranchNode(node)) {
			return node;
		}

		return SerializableGrid.getFirstLeaf(node.children[0]);
	}

	static deserialize<T extends ISerializableView>(container: HTMLElement, json: any, deserializer: IViewDeserializer<T>): SerializableGrid<T> {
		if (typeof json.orientation !== 'number') {
			throw new Error('Invalid JSON: \'orientation\' property must be a number.');
		}

		const orientation = json.orientation as Orientation;
		const root = SerializableGrid.deserializeNode(json.root, deserializer);
		const firstLeaf = SerializableGrid.getFirstLeaf(root);

		if (!firstLeaf) {
			throw new Error('Invalid serialized state, first leaf not found');
		}

		const result = new SerializableGrid<T>(container, firstLeaf.view);
		result.orientation = orientation;
		result.populate(firstLeaf.view, orientation, root);

		return result;
	}

	private populate(referenceView: T, orientation: Orientation, node: GridNode<T>): void {
		if (!isGridBranchNode(node)) {
			return;
		}

		const direction = orientation === Orientation.VERTICAL ? Direction.Down : Direction.Right;
		const firstLeaves = node.children.map(c => SerializableGrid.getFirstLeaf(c));

		for (const leaf of firstLeaves.slice(1)) {
			this.addView(leaf.view, leaf.size, referenceView, direction);
		}

		for (let i = 0; i < node.children.length; i++) {
			this.populate(firstLeaves[i].view, orthogonal(orientation), node.children[i]);
		}
	}

	serialize(): any {
		return {
			root: SerializableGrid.serializeNode(this.getViews()),
			orientation: this.orientation,
			width: this.width,
			height: this.height
		};
	}
}