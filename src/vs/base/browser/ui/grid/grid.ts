/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBoundarySashes, Orientation } from 'vs/base/browser/ui/sash/sash';
import { equals, tail2 as tail } from 'vs/base/common/arrays';
import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import 'vs/css!./gridview';
import { Box, GridView, IGridViewOptions, IGridViewStyles, IView as IGridViewView, IViewSize, orthogonal, Sizing as GridViewSizing, GridLocation } from './gridview';
import type { SplitView, AutoSizing as SplitViewAutoSizing } from 'vs/base/browser/ui/splitview/splitview';

export { IViewSize, LayoutPriority, Orientation, orthogonal } from './gridview';

export const enum Direction {
	Up,
	Down,
	Left,
	Right
}

function oppositeDirection(direction: Direction): Direction {
	switch (direction) {
		case Direction.Up: return Direction.Down;
		case Direction.Down: return Direction.Up;
		case Direction.Left: return Direction.Right;
		case Direction.Right: return Direction.Left;
	}
}

/**
 * The interface to implement for views within a {@link Grid}.
 */
export interface IView extends IGridViewView {

	/**
	 * The preferred width for when the user double clicks a sash
	 * adjacent to this view.
	 */
	readonly preferredWidth?: number;

	/**
	 * The preferred height for when the user double clicks a sash
	 * adjacent to this view.
	 */
	readonly preferredHeight?: number;
}

export interface GridLeafNode<T extends IView> {
	readonly view: T;
	readonly box: Box;
	readonly cachedVisibleSize: number | undefined;
}

export interface GridBranchNode<T extends IView> {
	readonly children: GridNode<T>[];
	readonly box: Box;
}

export type GridNode<T extends IView> = GridLeafNode<T> | GridBranchNode<T>;

export function isGridBranchNode<T extends IView>(node: GridNode<T>): node is GridBranchNode<T> {
	return !!(node as any).children;
}

function getGridNode<T extends IView>(node: GridNode<T>, location: GridLocation): GridNode<T> {
	if (location.length === 0) {
		return node;
	}

	if (!isGridBranchNode(node)) {
		throw new Error('Invalid location');
	}

	const [index, ...rest] = location;
	return getGridNode(node.children[index], rest);
}

interface Range {
	readonly start: number;
	readonly end: number;
}

function intersects(one: Range, other: Range): boolean {
	return !(one.start >= other.end || other.start >= one.end);
}

interface Boundary {
	readonly offset: number;
	readonly range: Range;
}

function getBoxBoundary(box: Box, direction: Direction): Boundary {
	const orientation = getDirectionOrientation(direction);
	const offset = direction === Direction.Up ? box.top :
		direction === Direction.Right ? box.left + box.width :
			direction === Direction.Down ? box.top + box.height :
				box.left;

	const range = {
		start: orientation === Orientation.HORIZONTAL ? box.top : box.left,
		end: orientation === Orientation.HORIZONTAL ? box.top + box.height : box.left + box.width
	};

	return { offset, range };
}

function findAdjacentBoxLeafNodes<T extends IView>(boxNode: GridNode<T>, direction: Direction, boundary: Boundary): GridLeafNode<T>[] {
	const result: GridLeafNode<T>[] = [];

	function _(boxNode: GridNode<T>, direction: Direction, boundary: Boundary): void {
		if (isGridBranchNode(boxNode)) {
			for (const child of boxNode.children) {
				_(child, direction, boundary);
			}
		} else {
			const { offset, range } = getBoxBoundary(boxNode.box, direction);

			if (offset === boundary.offset && intersects(range, boundary.range)) {
				result.push(boxNode);
			}
		}
	}

	_(boxNode, direction, boundary);
	return result;
}

function getLocationOrientation(rootOrientation: Orientation, location: GridLocation): Orientation {
	return location.length % 2 === 0 ? orthogonal(rootOrientation) : rootOrientation;
}

function getDirectionOrientation(direction: Direction): Orientation {
	return direction === Direction.Up || direction === Direction.Down ? Orientation.VERTICAL : Orientation.HORIZONTAL;
}

export function getRelativeLocation(rootOrientation: Orientation, location: GridLocation, direction: Direction): GridLocation {
	const orientation = getLocationOrientation(rootOrientation, location);
	const directionOrientation = getDirectionOrientation(direction);

	if (orientation === directionOrientation) {
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

	if (!parentElement) {
		throw new Error('Invalid grid element');
	}

	let el = parentElement.firstElementChild;
	let index = 0;

	while (el !== element && el !== parentElement.lastElementChild && el) {
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
function getGridLocation(element: HTMLElement): GridLocation {
	const parentElement = element.parentElement;

	if (!parentElement) {
		throw new Error('Invalid grid element');
	}

	if (/\bmonaco-grid-view\b/.test(parentElement.className)) {
		return [];
	}

	const index = indexInParent(parentElement);
	const ancestor = parentElement.parentElement!.parentElement!.parentElement!.parentElement!;
	return [...getGridLocation(ancestor), index];
}

export type DistributeSizing = { type: 'distribute' };
export type SplitSizing = { type: 'split' };
export type AutoSizing = { type: 'auto' };
export type InvisibleSizing = { type: 'invisible'; cachedVisibleSize: number };
export type Sizing = DistributeSizing | SplitSizing | AutoSizing | InvisibleSizing;

export namespace Sizing {
	export const Distribute: DistributeSizing = { type: 'distribute' };
	export const Split: SplitSizing = { type: 'split' };
	export const Auto: AutoSizing = { type: 'auto' };
	export function Invisible(cachedVisibleSize: number): InvisibleSizing { return { type: 'invisible', cachedVisibleSize }; }
}

export interface IGridStyles extends IGridViewStyles { }
export interface IGridOptions extends IGridViewOptions { }

/**
 * The {@link Grid} exposes a Grid widget in a friendlier API than the underlying
 * {@link GridView} widget. Namely, all mutation operations are addressed by the
 * model elements, rather than indexes.
 *
 * It support the same features as the {@link GridView}.
 */
export class Grid<T extends IView = IView> extends Disposable {

	protected gridview: GridView;
	private views = new Map<T, HTMLElement>();

	/**
	 * The orientation of the grid. Matches the orientation of the root
	 * {@link SplitView} in the grid's {@link GridLocation} model.
	 */
	get orientation(): Orientation { return this.gridview.orientation; }
	set orientation(orientation: Orientation) { this.gridview.orientation = orientation; }

	/**
	 * The width of the grid.
	 */
	get width(): number { return this.gridview.width; }

	/**
	 * The height of the grid.
	 */
	get height(): number { return this.gridview.height; }

	/**
	 * The minimum width of the grid.
	 */
	get minimumWidth(): number { return this.gridview.minimumWidth; }

	/**
	 * The minimum height of the grid.
	 */
	get minimumHeight(): number { return this.gridview.minimumHeight; }

	/**
	 * The maximum width of the grid.
	 */
	get maximumWidth(): number { return this.gridview.maximumWidth; }

	/**
	 * The maximum height of the grid.
	 */
	get maximumHeight(): number { return this.gridview.maximumHeight; }

	/**
	 * Fires whenever a view within the grid changes its size constraints.
	 */
	readonly onDidChange: Event<{ width: number; height: number } | undefined>;

	/**
	 * Fires whenever the user scrolls a {@link SplitView} within
	 * the grid.
	 */
	readonly onDidScroll: Event<void>;

	/**
	 * A collection of sashes perpendicular to each edge of the grid.
	 * Corner sashes will be created for each intersection.
	 */
	get boundarySashes(): IBoundarySashes { return this.gridview.boundarySashes; }
	set boundarySashes(boundarySashes: IBoundarySashes) { this.gridview.boundarySashes = boundarySashes; }

	/**
	 * Enable/disable edge snapping across all grid views.
	 */
	set edgeSnapping(edgeSnapping: boolean) { this.gridview.edgeSnapping = edgeSnapping; }

	/**
	 * The DOM element for this view.
	 */
	get element(): HTMLElement { return this.gridview.element; }

	private didLayout = false;

	/**
	 * Create a new {@link Grid}. A grid must *always* have a view
	 * inside.
	 *
	 * @param view An initial view for this Grid.
	 */
	constructor(view: T | GridView, options: IGridOptions = {}) {
		super();

		if (view instanceof GridView) {
			this.gridview = view;
			this.gridview.getViewMap(this.views);
		} else {
			this.gridview = new GridView(options);
		}

		this._register(this.gridview);
		this._register(this.gridview.onDidSashReset(this.onDidSashReset, this));

		if (!(view instanceof GridView)) {
			this._addView(view, 0, [0]);
		}

		this.onDidChange = this.gridview.onDidChange;
		this.onDidScroll = this.gridview.onDidScroll;
	}

	style(styles: IGridStyles): void {
		this.gridview.style(styles);
	}

	/**
	 * Layout the {@link Grid}.
	 *
	 * Optionally provide a `top` and `left` positions, those will propagate
	 * as an origin for positions passed to {@link IView.layout}.
	 *
	 * @param width The width of the {@link Grid}.
	 * @param height The height of the {@link Grid}.
	 * @param top Optional, the top location of the {@link Grid}.
	 * @param left Optional, the left location of the {@link Grid}.
	 */
	layout(width: number, height: number, top: number = 0, left: number = 0): void {
		this.gridview.layout(width, height, top, left);
		this.didLayout = true;
	}

	/**
	 * Add a {@link IView view} to this {@link Grid}, based on another reference view.
	 *
	 * Take this grid as an example:
	 *
	 * ```
	 *  +-----+---------------+
	 *  |  A  |      B        |
	 *  +-----+---------+-----+
	 *  |        C      |     |
	 *  +---------------+  D  |
	 *  |        E      |     |
	 *  +---------------+-----+
	 * ```
	 *
	 * Calling `addView(X, Sizing.Distribute, C, Direction.Right)` will make the following
	 * changes:
	 *
	 * ```
	 *  +-----+---------------+
	 *  |  A  |      B        |
	 *  +-----+-+-------+-----+
	 *  |   C   |   X   |     |
	 *  +-------+-------+  D  |
	 *  |        E      |     |
	 *  +---------------+-----+
	 * ```
	 *
	 * Or `addView(X, Sizing.Distribute, D, Direction.Down)`:
	 *
	 * ```
	 *  +-----+---------------+
	 *  |  A  |      B        |
	 *  +-----+---------+-----+
	 *  |        C      |  D  |
	 *  +---------------+-----+
	 *  |        E      |  X  |
	 *  +---------------+-----+
	 * ```
	 *
	 * @param newView The view to add.
	 * @param size Either a fixed size, or a dynamic {@link Sizing} strategy.
	 * @param referenceView Another view to place this new view next to.
	 * @param direction The direction the new view should be placed next to the reference view.
	 */
	addView(newView: T, size: number | Sizing, referenceView: T, direction: Direction): void {
		if (this.views.has(newView)) {
			throw new Error('Can\'t add same view twice');
		}

		const orientation = getDirectionOrientation(direction);

		if (this.views.size === 1 && this.orientation !== orientation) {
			this.orientation = orientation;
		}

		const referenceLocation = this.getViewLocation(referenceView);
		const location = getRelativeLocation(this.gridview.orientation, referenceLocation, direction);

		let viewSize: number | GridViewSizing;

		if (typeof size === 'number') {
			viewSize = size;
		} else if (size.type === 'split') {
			const [, index] = tail(referenceLocation);
			viewSize = GridViewSizing.Split(index);
		} else if (size.type === 'distribute') {
			viewSize = GridViewSizing.Distribute;
		} else if (size.type === 'auto') {
			const [, index] = tail(referenceLocation);
			viewSize = GridViewSizing.Auto(index);
		} else {
			viewSize = size;
		}

		this._addView(newView, viewSize, location);
	}

	private addViewAt(newView: T, size: number | DistributeSizing | InvisibleSizing, location: GridLocation): void {
		if (this.views.has(newView)) {
			throw new Error('Can\'t add same view twice');
		}

		let viewSize: number | GridViewSizing;

		if (typeof size === 'number') {
			viewSize = size;
		} else if (size.type === 'distribute') {
			viewSize = GridViewSizing.Distribute;
		} else {
			viewSize = size;
		}

		this._addView(newView, viewSize, location);
	}

	protected _addView(newView: T, size: number | GridViewSizing, location: GridLocation): void {
		this.views.set(newView, newView.element);
		this.gridview.addView(newView, size, location);
	}

	/**
	 * Remove a {@link IView view} from this {@link Grid}.
	 *
	 * @param view The {@link IView view} to remove.
	 * @param sizing Whether to distribute other {@link IView view}'s sizes.
	 */
	removeView(view: T, sizing?: Sizing): void {
		if (this.views.size === 1) {
			throw new Error('Can\'t remove last view');
		}

		const location = this.getViewLocation(view);

		let gridViewSizing: DistributeSizing | SplitViewAutoSizing | undefined;

		if (sizing?.type === 'distribute') {
			gridViewSizing = GridViewSizing.Distribute;
		} else if (sizing?.type === 'auto') {
			const index = location[location.length - 1];
			gridViewSizing = GridViewSizing.Auto(index === 0 ? 1 : index - 1);
		}

		this.gridview.removeView(location, gridViewSizing);
		this.views.delete(view);
	}

	/**
	 * Move a {@link IView view} to another location in the grid.
	 *
	 * @remarks See {@link Grid.addView}.
	 *
	 * @param view The {@link IView view} to move.
	 * @param sizing Either a fixed size, or a dynamic {@link Sizing} strategy.
	 * @param referenceView Another view to place the view next to.
	 * @param direction The direction the view should be placed next to the reference view.
	 */
	moveView(view: T, sizing: number | Sizing, referenceView: T, direction: Direction): void {
		const sourceLocation = this.getViewLocation(view);
		const [sourceParentLocation, from] = tail(sourceLocation);

		const referenceLocation = this.getViewLocation(referenceView);
		const targetLocation = getRelativeLocation(this.gridview.orientation, referenceLocation, direction);
		const [targetParentLocation, to] = tail(targetLocation);

		if (equals(sourceParentLocation, targetParentLocation)) {
			this.gridview.moveView(sourceParentLocation, from, to);
		} else {
			this.removeView(view, typeof sizing === 'number' ? undefined : sizing);
			this.addView(view, sizing, referenceView, direction);
		}
	}

	/**
	 * Move a {@link IView view} to another location in the grid.
	 *
	 * @remarks Internal method, do not use without knowing what you're doing.
	 * @remarks See {@link GridView.moveView}.
	 *
	 * @param view The {@link IView view} to move.
	 * @param location The {@link GridLocation location} to insert the view on.
	 */
	moveViewTo(view: T, location: GridLocation): void {
		const sourceLocation = this.getViewLocation(view);
		const [sourceParentLocation, from] = tail(sourceLocation);
		const [targetParentLocation, to] = tail(location);

		if (equals(sourceParentLocation, targetParentLocation)) {
			this.gridview.moveView(sourceParentLocation, from, to);
		} else {
			const size = this.getViewSize(view);
			const orientation = getLocationOrientation(this.gridview.orientation, sourceLocation);
			const cachedViewSize = this.getViewCachedVisibleSize(view);
			const sizing = typeof cachedViewSize === 'undefined'
				? (orientation === Orientation.HORIZONTAL ? size.width : size.height)
				: Sizing.Invisible(cachedViewSize);

			this.removeView(view);
			this.addViewAt(view, sizing, location);
		}
	}

	/**
	 * Swap two {@link IView views} within the {@link Grid}.
	 *
	 * @param from One {@link IView view}.
	 * @param to Another {@link IView view}.
	 */
	swapViews(from: T, to: T): void {
		const fromLocation = this.getViewLocation(from);
		const toLocation = this.getViewLocation(to);
		return this.gridview.swapViews(fromLocation, toLocation);
	}

	/**
	 * Resize a {@link IView view}.
	 *
	 * @param view The {@link IView view} to resize.
	 * @param size The size the view should be.
	 */
	resizeView(view: T, size: IViewSize): void {
		const location = this.getViewLocation(view);
		return this.gridview.resizeView(location, size);
	}

	/**
	 * Returns whether all other {@link IView views} are at their minimum size.
	 *
	 * @param view The reference {@link IView view}.
	 */
	isViewSizeMaximized(view: T): boolean {
		const location = this.getViewLocation(view);
		return this.gridview.isViewSizeMaximized(location);
	}

	/**
	 * Get the size of a {@link IView view}.
	 *
	 * @param view The {@link IView view}. Provide `undefined` to get the size
	 * of the grid itself.
	 */
	getViewSize(view?: T): IViewSize {
		if (!view) {
			return this.gridview.getViewSize();
		}

		const location = this.getViewLocation(view);
		return this.gridview.getViewSize(location);
	}

	/**
	 * Get the cached visible size of a {@link IView view}. This was the size
	 * of the view at the moment it last became hidden.
	 *
	 * @param view The {@link IView view}.
	 */
	getViewCachedVisibleSize(view: T): number | undefined {
		const location = this.getViewLocation(view);
		return this.gridview.getViewCachedVisibleSize(location);
	}

	/**
	 * Maximize the size of a {@link IView view} by collapsing all other views
	 * to their minimum sizes.
	 *
	 * @param view The {@link IView view}.
	 */
	maximizeViewSize(view: T): void {
		const location = this.getViewLocation(view);
		this.gridview.maximizeViewSize(location);
	}

	/**
	 * Distribute the size among all {@link IView views} within the entire
	 * grid or within a single {@link SplitView}.
	 */
	distributeViewSizes(): void {
		this.gridview.distributeViewSizes();
	}

	/**
	 * Returns whether a {@link IView view} is visible.
	 *
	 * @param view The {@link IView view}.
	 */
	isViewVisible(view: T): boolean {
		const location = this.getViewLocation(view);
		return this.gridview.isViewVisible(location);
	}

	/**
	 * Set the visibility state of a {@link IView view}.
	 *
	 * @param view The {@link IView view}.
	 */
	setViewVisible(view: T, visible: boolean): void {
		const location = this.getViewLocation(view);
		this.gridview.setViewVisible(location, visible);
	}

	/**
	 * Returns a descriptor for the entire grid.
	 */
	getViews(): GridBranchNode<T> {
		return this.gridview.getView() as GridBranchNode<T>;
	}

	/**
	 * Utility method to return the collection all views which intersect
	 * a view's edge.
	 *
	 * @param view The {@link IView view}.
	 * @param direction Which direction edge to be considered.
	 * @param wrap Whether the grid wraps around (from right to left, from bottom to top).
	 */
	getNeighborViews(view: T, direction: Direction, wrap: boolean = false): T[] {
		if (!this.didLayout) {
			throw new Error('Can\'t call getNeighborViews before first layout');
		}

		const location = this.getViewLocation(view);
		const root = this.getViews();
		const node = getGridNode(root, location);
		let boundary = getBoxBoundary(node.box, direction);

		if (wrap) {
			if (direction === Direction.Up && node.box.top === 0) {
				boundary = { offset: root.box.top + root.box.height, range: boundary.range };
			} else if (direction === Direction.Right && node.box.left + node.box.width === root.box.width) {
				boundary = { offset: 0, range: boundary.range };
			} else if (direction === Direction.Down && node.box.top + node.box.height === root.box.height) {
				boundary = { offset: 0, range: boundary.range };
			} else if (direction === Direction.Left && node.box.left === 0) {
				boundary = { offset: root.box.left + root.box.width, range: boundary.range };
			}
		}

		return findAdjacentBoxLeafNodes(root, oppositeDirection(direction), boundary)
			.map(node => node.view);
	}

	private getViewLocation(view: T): GridLocation {
		const element = this.views.get(view);

		if (!element) {
			throw new Error('View not found');
		}

		return getGridLocation(element);
	}

	private onDidSashReset(location: GridLocation): void {
		const resizeToPreferredSize = (location: GridLocation): boolean => {
			const node = this.gridview.getView(location) as GridNode<T>;

			if (isGridBranchNode(node)) {
				return false;
			}

			const direction = getLocationOrientation(this.orientation, location);
			const size = direction === Orientation.HORIZONTAL ? node.view.preferredWidth : node.view.preferredHeight;

			if (typeof size !== 'number') {
				return false;
			}

			const viewSize = direction === Orientation.HORIZONTAL ? { width: Math.round(size) } : { height: Math.round(size) };
			this.gridview.resizeView(location, viewSize);
			return true;
		};

		if (resizeToPreferredSize(location)) {
			return;
		}

		const [parentLocation, index] = tail(location);

		if (resizeToPreferredSize([...parentLocation, index + 1])) {
			return;
		}

		this.gridview.distributeViewSizes(parentLocation);
	}
}

export interface ISerializableView extends IView {
	toJSON(): object;
}

export interface IViewDeserializer<T extends ISerializableView> {
	fromJSON(json: any): T;
}

export interface ISerializedLeafNode {
	type: 'leaf';
	data: any;
	size: number;
	visible?: boolean;
}

export interface ISerializedBranchNode {
	type: 'branch';
	data: ISerializedNode[];
	size: number;
}

export type ISerializedNode = ISerializedLeafNode | ISerializedBranchNode;

export interface ISerializedGrid {
	root: ISerializedNode;
	orientation: Orientation;
	width: number;
	height: number;
}

/**
 * A {@link Grid} which can serialize itself.
 */
export class SerializableGrid<T extends ISerializableView> extends Grid<T> {

	private static serializeNode<T extends ISerializableView>(node: GridNode<T>, orientation: Orientation): ISerializedNode {
		const size = orientation === Orientation.VERTICAL ? node.box.width : node.box.height;

		if (!isGridBranchNode(node)) {
			if (typeof node.cachedVisibleSize === 'number') {
				return { type: 'leaf', data: node.view.toJSON(), size: node.cachedVisibleSize, visible: false };
			}

			return { type: 'leaf', data: node.view.toJSON(), size };
		}

		return { type: 'branch', data: node.children.map(c => SerializableGrid.serializeNode(c, orthogonal(orientation))), size };
	}

	/**
	 * Construct a new {@link SerializableGrid} from a JSON object.
	 *
	 * @param json The JSON object.
	 * @param deserializer A deserializer which can revive each view.
	 * @returns A new {@link SerializableGrid} instance.
	 */
	static deserialize<T extends ISerializableView>(json: ISerializedGrid, deserializer: IViewDeserializer<T>, options: IGridOptions = {}): SerializableGrid<T> {
		if (typeof json.orientation !== 'number') {
			throw new Error('Invalid JSON: \'orientation\' property must be a number.');
		} else if (typeof json.width !== 'number') {
			throw new Error('Invalid JSON: \'width\' property must be a number.');
		} else if (typeof json.height !== 'number') {
			throw new Error('Invalid JSON: \'height\' property must be a number.');
		}

		const gridview = GridView.deserialize(json, deserializer, options);
		const result = new SerializableGrid<T>(gridview, options);

		return result;
	}

	/**
	 * Construct a new {@link SerializableGrid} from a grid descriptor.
	 *
	 * @param gridDescriptor A grid descriptor in which leaf nodes point to actual views.
	 * @returns A new {@link SerializableGrid} instance.
	 */
	static from<T extends ISerializableView>(gridDescriptor: GridDescriptor<T>, options: IGridOptions = {}): SerializableGrid<T> {
		return SerializableGrid.deserialize(createSerializedGrid(gridDescriptor), { fromJSON: view => view }, options);
	}

	/**
	 * Useful information in order to proportionally restore view sizes
	 * upon the very first layout call.
	 */
	private initialLayoutContext: boolean = true;

	/**
	 * Serialize this grid into a JSON object.
	 */
	serialize(): ISerializedGrid {
		return {
			root: SerializableGrid.serializeNode(this.getViews(), this.orientation),
			orientation: this.orientation,
			width: this.width,
			height: this.height
		};
	}

	override layout(width: number, height: number, top: number = 0, left: number = 0): void {
		super.layout(width, height, top, left);

		if (this.initialLayoutContext) {
			this.initialLayoutContext = false;
			this.gridview.trySet2x2();
		}
	}
}

export type GridLeafNodeDescriptor<T> = { size?: number; data?: any };
export type GridBranchNodeDescriptor<T> = { size?: number; groups: GridNodeDescriptor<T>[] };
export type GridNodeDescriptor<T> = GridBranchNodeDescriptor<T> | GridLeafNodeDescriptor<T>;
export type GridDescriptor<T> = { orientation: Orientation } & GridBranchNodeDescriptor<T>;

function isGridBranchNodeDescriptor<T>(nodeDescriptor: GridNodeDescriptor<T>): nodeDescriptor is GridBranchNodeDescriptor<T> {
	return !!(nodeDescriptor as GridBranchNodeDescriptor<T>).groups;
}

export function sanitizeGridNodeDescriptor<T>(nodeDescriptor: GridNodeDescriptor<T>, rootNode: boolean): void {
	if (!rootNode && (nodeDescriptor as any).groups && (nodeDescriptor as any).groups.length <= 1) {
		(nodeDescriptor as any).groups = undefined;
	}

	if (!isGridBranchNodeDescriptor(nodeDescriptor)) {
		return;
	}

	let totalDefinedSize = 0;
	let totalDefinedSizeCount = 0;

	for (const child of nodeDescriptor.groups) {
		sanitizeGridNodeDescriptor(child, false);

		if (child.size) {
			totalDefinedSize += child.size;
			totalDefinedSizeCount++;
		}
	}

	const totalUndefinedSize = totalDefinedSizeCount > 0 ? totalDefinedSize : 1;
	const totalUndefinedSizeCount = nodeDescriptor.groups.length - totalDefinedSizeCount;
	const eachUndefinedSize = totalUndefinedSize / totalUndefinedSizeCount;

	for (const child of nodeDescriptor.groups) {
		if (!child.size) {
			child.size = eachUndefinedSize;
		}
	}
}

function createSerializedNode<T>(nodeDescriptor: GridNodeDescriptor<T>): ISerializedNode {
	if (isGridBranchNodeDescriptor(nodeDescriptor)) {
		return { type: 'branch', data: nodeDescriptor.groups.map(c => createSerializedNode(c)), size: nodeDescriptor.size! };
	} else {
		return { type: 'leaf', data: nodeDescriptor.data, size: nodeDescriptor.size! };
	}
}

function getDimensions(node: ISerializedNode, orientation: Orientation): { width?: number; height?: number } {
	if (node.type === 'branch') {
		const childrenDimensions = node.data.map(c => getDimensions(c, orthogonal(orientation)));

		if (orientation === Orientation.VERTICAL) {
			const width = node.size || (childrenDimensions.length === 0 ? undefined : Math.max(...childrenDimensions.map(d => d.width || 0)));
			const height = childrenDimensions.length === 0 ? undefined : childrenDimensions.reduce((r, d) => r + (d.height || 0), 0);
			return { width, height };
		} else {
			const width = childrenDimensions.length === 0 ? undefined : childrenDimensions.reduce((r, d) => r + (d.width || 0), 0);
			const height = node.size || (childrenDimensions.length === 0 ? undefined : Math.max(...childrenDimensions.map(d => d.height || 0)));
			return { width, height };
		}
	} else {
		const width = orientation === Orientation.VERTICAL ? node.size : undefined;
		const height = orientation === Orientation.VERTICAL ? undefined : node.size;
		return { width, height };
	}
}

/**
 * Creates a new JSON object from a {@link GridDescriptor}, which can
 * be deserialized by {@link SerializableGrid.deserialize}.
 */
export function createSerializedGrid<T>(gridDescriptor: GridDescriptor<T>): ISerializedGrid {
	sanitizeGridNodeDescriptor(gridDescriptor, true);

	const root = createSerializedNode(gridDescriptor);
	const { width, height } = getDimensions(root, gridDescriptor.orientation);

	return {
		root,
		orientation: gridDescriptor.orientation,
		width: width || 1,
		height: height || 1
	};
}
