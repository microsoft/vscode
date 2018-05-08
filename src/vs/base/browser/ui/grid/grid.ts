/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gridview';
import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { tail2 as tail, tail2 } from 'vs/base/common/arrays';
import { orthogonal, IView, GridView, Sizing as GridViewSizing } from './gridview';

export { Orientation } from './gridview';

export interface GridLeafNode<T extends IView> {
	readonly view: T;
	readonly size: number;
}

export interface GridBranchNode<T extends IView> {
	readonly children: GridNode<T>[];
	readonly size: number;
}

export type GridNode<T extends IView> = GridLeafNode<T> | GridBranchNode<T>;

export function isGridBranchNode<T extends IView>(node: GridNode<T>): node is GridBranchNode<T> {
	return !!(node as any).children;
}

function getLocationOrientation(rootOrientation: Orientation, location: number[]): Orientation {
	return location.length % 2 === 0 ? orthogonal(rootOrientation) : rootOrientation;
}

function getSize(dimensions: { width: number; height: number; }, orientation: Orientation) {
	return orientation === Orientation.HORIZONTAL ? dimensions.width : dimensions.height;
}

export function getRelativeLocation(rootOrientation: Orientation, location: number[], direction: Direction): number[] {
	const orientation = getLocationOrientation(rootOrientation, location);

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
 * Find the grid location of a specific DOM element by traversing the parent
 * chain and finding each child index on the way.
 *
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

export enum Sizing {
	Distribute = 'distribute',
	Split = 'split'
}

export class Grid<T extends IView> implements IDisposable {

	protected gridview: GridView;
	private views = new Map<T, HTMLElement>();
	private disposables: IDisposable[] = [];

	get orientation(): Orientation { return this.gridview.orientation; }
	set orientation(orientation: Orientation) { this.gridview.orientation = orientation; }

	get width(): number { return this.gridview.width; }
	get height(): number { return this.gridview.height; }

	public sashResetSizing: Sizing = Sizing.Distribute;

	constructor(container: HTMLElement, view: T) {
		this.gridview = new GridView(container);
		this.disposables.push(this.gridview);

		this.gridview.onDidSashReset(this.onDidSashReset, this, this.disposables);

		this._addView(view, 0, [0]);
	}

	layout(width: number, height: number): void {
		this.gridview.layout(width, height);
	}

	addView(newView: T, size: number | Sizing, referenceView: T, direction: Direction): void {
		if (this.views.has(newView)) {
			throw new Error('Can\'t add same view twice');
		}

		const orientation = directionOrientation(direction);

		if (this.views.size === 1 && this.orientation !== orientation) {
			this.orientation = orientation;
		}

		const referenceLocation = this.getViewLocation(referenceView);
		const location = getRelativeLocation(this.gridview.orientation, referenceLocation, direction);

		let viewSize: number | GridViewSizing;

		if (size === Sizing.Split) {
			const [, index] = tail2(referenceLocation);
			viewSize = GridViewSizing.Split(index);
		} else if (size === Sizing.Distribute) {
			viewSize = GridViewSizing.Distribute;
		} else {
			viewSize = size;
		}

		this._addView(newView, viewSize, location);
	}

	protected _addView(newView: T, size: number | GridViewSizing, location): void {
		this.views.set(newView, newView.element);
		this.gridview.addView(newView, size, location);
	}

	removeView(view: T, sizing?: Sizing): void {
		if (this.views.size === 1) {
			throw new Error('Can\'t remove last view');
		}

		if (!this.views.has(view)) {
			throw new Error('View not found');
		}

		const location = this.getViewLocation(view);
		this.gridview.removeView(location, sizing === Sizing.Distribute ? GridViewSizing.Distribute : undefined);
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

	private onDidSashReset(location: number[]): void {
		if (this.sashResetSizing === Sizing.Split) {
			const orientation = getLocationOrientation(this.orientation, location);
			const firstViewSize = getSize(this.gridview.getViewSize(location), orientation);
			const [parentLocation, index] = tail2(location);
			const secondViewSize = getSize(this.gridview.getViewSize([...parentLocation, index + 1]), orientation);
			const totalSize = firstViewSize + secondViewSize;
			this.gridview.resizeView(location, Math.floor(totalSize / 2));

		} else {
			const [parentLocation,] = tail2(location);
			this.gridview.distributeViewSizes(parentLocation);
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export interface ISerializableView extends IView {
	toJSON(): object;
}

export interface IViewDeserializer<T extends ISerializableView> {
	fromJSON(json: object): T;
}

interface InitialLayoutContext<T extends ISerializableView> {
	width: number;
	height: number;
	root: GridBranchNode<T>;
}

export interface ISerializedNode {
	type: 'branch' | 'leaf';
	data: ISerializedNode[] | object;
	size: number;
}

export interface ISerializedGrid {
	root: ISerializedNode;
	orientation: Orientation;
	width: number;
	height: number;
}

export class SerializableGrid<T extends ISerializableView> extends Grid<T> {

	private static serializeNode<T extends ISerializableView>(node: GridNode<T>): ISerializedNode {
		if (isGridBranchNode(node)) {
			return { type: 'branch', data: node.children.map(c => SerializableGrid.serializeNode(c)), size: node.size };
		} else {
			return { type: 'leaf', data: node.view.toJSON(), size: node.size };
		}
	}

	private static deserializeNode<T extends ISerializableView>(json: ISerializedNode, deserializer: IViewDeserializer<T>): GridNode<T> {
		if (!json || typeof json !== 'object') {
			throw new Error('Invalid JSON');
		}

		const type = json.type;
		const data = json.data;

		if (type === 'branch') {
			if (!Array.isArray(data)) {
				throw new Error('Invalid JSON: \'data\' property of branch must be an array.');
			} else if (typeof json.size !== 'number') {
				throw new Error('Invalid JSON: \'size\' property of branch must be a number.');
			}

			const nodes = data as ISerializedNode[];
			const children = nodes.map(c => SerializableGrid.deserializeNode(c, deserializer));
			const size = json.size as number;

			return { children, size };

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

	static deserialize<T extends ISerializableView>(container: HTMLElement, json: ISerializedGrid, deserializer: IViewDeserializer<T>): SerializableGrid<T> {
		if (typeof json.orientation !== 'number') {
			throw new Error('Invalid JSON: \'orientation\' property must be a number.');
		} else if (typeof json.width !== 'number') {
			throw new Error('Invalid JSON: \'width\' property must be a number.');
		} else if (typeof json.height !== 'number') {
			throw new Error('Invalid JSON: \'height\' property must be a number.');
		}

		const root = SerializableGrid.deserializeNode(json.root, deserializer) as GridBranchNode<T>;
		const firstLeaf = SerializableGrid.getFirstLeaf(root);

		if (!firstLeaf) {
			throw new Error('Invalid serialized state, first leaf not found');
		}

		const orientation = json.orientation as Orientation;
		const width = json.width as number;
		const height = json.height as number;

		const result = new SerializableGrid<T>(container, firstLeaf.view);
		result.orientation = orientation;
		result.restoreViews(firstLeaf.view, orientation, root);
		result.initialLayoutContext = { width, height, root };

		return result;
	}

	/**
	 * Useful information in order to proportionally restore view sizes
	 * upon the very first layout call.
	 */
	private initialLayoutContext: InitialLayoutContext<T> | undefined;

	serialize(): ISerializedGrid {
		return {
			root: SerializableGrid.serializeNode(this.getViews()),
			orientation: this.orientation,
			width: this.width,
			height: this.height
		};
	}

	layout(width: number, height: number): void {
		super.layout(width, height);

		if (this.initialLayoutContext) {
			const widthScale = width / this.initialLayoutContext.width;
			const heightScale = height / this.initialLayoutContext.height;

			this.restoreViewsSize([], this.initialLayoutContext.root, this.orientation, widthScale, heightScale);
			this.initialLayoutContext = undefined;
		}
	}

	/**
	 * Recursively restores views which were just deserialized.
	 */
	private restoreViews(referenceView: T, orientation: Orientation, node: GridNode<T>): void {
		if (!isGridBranchNode(node)) {
			return;
		}

		const direction = orientation === Orientation.VERTICAL ? Direction.Down : Direction.Right;
		const firstLeaves = node.children.map(c => SerializableGrid.getFirstLeaf(c));

		for (let i = 1; i < firstLeaves.length; i++) {
			this.addView(firstLeaves[i].view, firstLeaves[i].size, referenceView, direction);
			referenceView = firstLeaves[i].view;
		}

		for (let i = 0; i < node.children.length; i++) {
			this.restoreViews(firstLeaves[i].view, orthogonal(orientation), node.children[i]);
		}
	}

	/**
	 * Recursively restores view sizes.
	 * This should be called only after the very first layout call.
	 */
	private restoreViewsSize(location: number[], node: GridNode<T>, orientation: Orientation, widthScale: number, heightScale: number): void {
		if (!isGridBranchNode(node)) {
			return;
		}

		const scale = orientation === Orientation.VERTICAL ? heightScale : widthScale;

		for (let i = 0; i < node.children.length; i++) {
			const child = node.children[i];
			const childLocation = [...location, i];

			if (i < node.children.length - 1) {
				this.gridview.resizeView(childLocation, Math.floor(child.size * scale));
			}

			this.restoreViewsSize(childLocation, child, orthogonal(orientation), widthScale, heightScale);
		}
	}
}