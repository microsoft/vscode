/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Direction, GridNode, isGridBranchNode, ISerializableView, ISerializedGrid, ISerializedNode, IViewSize, Orientation, SerializableGrid, Sizing } from '../../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { IContentPart, IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';

/**
 * What a cell of a {@link PartGrid} shows that is not an editor part, such as
 * a title row of the window.
 */
export interface IPartGridView {
	readonly element: HTMLElement;

	readonly minimumWidth: number;
	readonly maximumWidth: number;
	readonly minimumHeight: number;
	readonly maximumHeight: number;

	readonly onDidChange: Event<IViewSize | undefined>;

	layout(width: number, height: number, top: number, left: number): void;
	setVisible?(visible: boolean): void;
}

/**
 * Where a cell goes: beside another cell, or at an edge of the window.
 */
export type PartGridLocation =
	{ readonly reference: string; readonly direction: Direction } |
	{ readonly edge: Direction };

/**
 * The state of a {@link PartGrid}: its topology and sizes, the cells hidden
 * on purpose, and the state of each part in it.
 */
export interface IPartGridState {
	readonly grid: ISerializedGrid | undefined;
	readonly hidden: readonly string[];
	readonly parts: { readonly [id: string]: unknown };
}

/**
 * What {@link PartGrid.restore} needs for a cell: the part, created from its
 * state, or the view.
 */
export type PartGridCellContent = { readonly part: IContentPart } | { readonly view: IPartGridView };

class PartGridCell implements ISerializableView {

	readonly element: HTMLElement;

	get minimumWidth(): number { return this.view.minimumWidth; }
	get maximumWidth(): number { return this.view.maximumWidth; }
	get minimumHeight(): number { return this.view.minimumHeight; }
	get maximumHeight(): number { return this.view.maximumHeight; }

	readonly onDidChange: Event<IViewSize | undefined>;

	constructor(readonly id: string, readonly view: IPartGridView, readonly part: IContentPart | undefined) {
		this.element = $('.part-grid-cell');
		this.element.dataset.partGridCell = id;
		this.element.appendChild(view.element);
		this.onDidChange = view.onDidChange;
	}

	layout(width: number, height: number, top: number, left: number): void {
		this.view.layout(width, height, top, left);
	}

	setVisible(visible: boolean): void {
		this.view.setVisible?.(visible);
	}

	toJSON(): object {
		return { id: this.id };
	}
}

function createCell(id: string, content: PartGridCellContent): PartGridCell {
	if (hasKey(content, { view: true })) {
		return new PartGridCell(id, content.view, undefined);
	}

	const part = content.part;
	return new PartGridCell(id, {
		element: part.element as HTMLElement,
		get minimumWidth() { return part.minimumWidth; },
		get maximumWidth() { return part.maximumWidth; },
		get minimumHeight() { return part.minimumHeight; },
		get maximumHeight() { return part.maximumHeight; },
		onDidChange: part.onDidChange,
		layout: (width, height, top, left) => part.layout(width, height, top, left)
	}, part);
}

function hasEditors(part: IContentPart): boolean {
	return part.groups.some(group => !group.isEmpty);
}

function collectLeaves(node: ISerializedNode, into: ISerializedNode[] = []): ISerializedNode[] {
	if (node.type === 'leaf') {
		into.push(node);
	} else {
		node.data.forEach(child => collectLeaves(child, into));
	}

	return into;
}

/**
 * The grid of the parts of a window. Its cells are editor parts and other
 * views, such as a title row.
 *
 * A part shows while it has editors: it hides when its last editor closes
 * and shows again when an editor opens in it. Once no part has editors,
 * {@link onDidBecomeEmpty} fires, so that the owner can close the window.
 */
export class PartGrid extends Disposable {

	private readonly gridDisposables = this._register(new MutableDisposable<DisposableStore>());
	private grid: SerializableGrid<PartGridCell> | undefined;

	private readonly cells = new Map<string, PartGridCell>();
	private readonly cellDisposables = this._register(new DisposableMap<string>());

	private readonly hidden = new Set<string>();
	private readonly empty = new Set<string>();

	private dimension: IViewSize | undefined;

	private readonly _onDidChangePartEmpty = this._register(new Emitter<{ readonly id: string; readonly empty: boolean }>());
	/**
	 * Fires when a part gets its first editor or loses its last one.
	 */
	readonly onDidChangePartEmpty = this._onDidChangePartEmpty.event;

	private readonly _onDidBecomeEmpty = this._register(new Emitter<void>());
	/**
	 * Fires when the last editor of the last part with editors closes.
	 */
	readonly onDidBecomeEmpty = this._onDidBecomeEmpty.event;

	constructor(private readonly container: HTMLElement) {
		super();
	}

	/**
	 * Adds an editor part beside another cell or at an edge of the window
	 * (by default, the right edge). It leaves the grid when it closes.
	 */
	addPart(id: string, part: IContentPart, location?: PartGridLocation, size?: number): void {
		this.addCell(this.register(id, { part }), location ?? { edge: Direction.Right }, size);
	}

	/**
	 * Adds a view that is not an editor part, such as a title row.
	 */
	addView(id: string, view: IPartGridView, location?: PartGridLocation, size?: number): void {
		this.addCell(this.register(id, { view }), location ?? { edge: Direction.Right }, size);
	}

	private register(id: string, content: PartGridCellContent): PartGridCell {
		if (this.cells.has(id)) {
			throw new Error(`The part grid already has a cell '${id}'.`);
		}

		const cell = createCell(id, content);
		this.cells.set(id, cell);
		const disposables = new DisposableStore();
		this.cellDisposables.set(id, disposables);

		if (cell.part) {
			this.trackEditors(id, cell.part, disposables);
		}

		return cell;
	}

	private addCell(cell: PartGridCell, location: PartGridLocation, size: number | undefined): void {
		if (!this.grid) {
			this.setGrid(new SerializableGrid<PartGridCell>(cell, { proportionalLayout: false }));
		} else if (hasKey(location, { reference: true })) {
			this.grid.addView(cell, size ?? Sizing.Split, this.getCell(location.reference), location.direction);
		} else {
			this.addAtEdge(cell, location.edge, size);
		}

		this.updateAllVisibility();
	}

	private trackEditors(id: string, part: IContentPart, disposables: DisposableStore): void {
		const groupListeners = disposables.add(new DisposableMap<IEditorGroup>());
		const update = () => this.updateEmpty(id, part);
		const trackGroup = (group: IEditorGroup) => groupListeners.set(group, group.onDidModelChange(() => update()));

		part.groups.forEach(trackGroup);
		disposables.add(part.onDidAddGroup(group => { trackGroup(group); update(); }));
		disposables.add(part.onDidRemoveGroup(group => { groupListeners.deleteAndDispose(group); update(); }));
		disposables.add(part.onWillClose(() => this.removeCell(id)));

		if (!hasEditors(part)) {
			this.empty.add(id);
		}
	}

	private updateEmpty(id: string, part: IContentPart): void {
		const empty = !hasEditors(part);
		if (empty === this.empty.has(id)) {
			return;
		}

		if (empty) {
			this.empty.add(id);
		} else {
			this.empty.delete(id);
		}

		this.updateVisibility(id);
		this._onDidChangePartEmpty.fire({ id, empty });

		if (empty && this.isEmpty) {
			this._onDidBecomeEmpty.fire();
		}
	}

	/**
	 * Whether no part of the grid has editors.
	 */
	get isEmpty(): boolean {
		for (const cell of this.cells.values()) {
			if (cell.part && !this.empty.has(cell.id)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Whether the part has no editors.
	 */
	isPartEmpty(id: string): boolean {
		return this.empty.has(id);
	}

	private addAtEdge(cell: PartGridCell, edge: Direction, size: number | undefined): void {
		const grid = this.grid!;
		const orientation = edge === Direction.Up || edge === Direction.Down ? Orientation.VERTICAL : Orientation.HORIZONTAL;
		const atEnd = edge === Direction.Right || edge === Direction.Down;
		const root = grid.getViews();
		const edgeChild = root.children[atEnd ? root.children.length - 1 : 0];

		// Beside the only cell, or beside a cell at that edge of the root
		// along the grid's orientation, the grid adds it in place
		if (!isGridBranchNode(edgeChild) && (root.children.length === 1 || grid.orientation === orientation)) {
			grid.addView(cell, size ?? Sizing.Distribute, edgeChild.view, edge);
			return;
		}

		// Otherwise the grid is rebuilt with the cell at the edge of its root
		const state = grid.serialize();
		const extent = orientation === Orientation.VERTICAL ? state.height : state.width;
		const cellSize = Math.min(size ?? Math.round(extent / (grid.orientation === orientation ? root.children.length + 1 : 2)), extent);
		const added: ISerializedNode = { type: 'leaf', data: cell.toJSON(), size: cellSize };
		const children = state.root.type === 'branch' ? state.root.data : [state.root];
		let newRoot: ISerializedNode;
		if (grid.orientation === orientation) {
			newRoot = { ...state.root, type: 'branch', data: atEnd ? [...children, added] : [added, ...children] };
		} else {
			const rest: ISerializedNode = { type: 'branch', data: children, size: Math.max(0, extent - cellSize) };
			newRoot = { type: 'branch', data: atEnd ? [rest, added] : [added, rest], size: orientation === Orientation.VERTICAL ? state.width : state.height };
		}
		this.setGrid(this.deserialize({ root: newRoot, orientation, width: state.width, height: state.height }));
	}

	private getCell(id: string): PartGridCell {
		const cell = this.cells.get(id);
		if (!cell) {
			throw new Error(`The part grid has no cell '${id}'.`);
		}

		return cell;
	}

	private deserialize(state: ISerializedGrid): SerializableGrid<PartGridCell> {
		return SerializableGrid.deserialize<PartGridCell>(state, { fromJSON: (data: { id: string }) => this.getCell(data.id) }, { proportionalLayout: false });
	}

	private setGrid(grid: SerializableGrid<PartGridCell>): void {
		const disposables = new DisposableStore();
		disposables.add(grid);
		disposables.add({ dispose: () => grid.element.remove() });
		this.gridDisposables.value = disposables;
		this.grid = grid;

		grid.element.classList.add('part-grid');
		this.container.appendChild(grid.element);

		if (this.dimension) {
			grid.layout(this.dimension.width, this.dimension.height);
		}
	}

	/**
	 * Removes a cell from the grid. A part is removed when it closes.
	 */
	removeCell(id: string): void {
		const cell = this.cells.get(id);
		if (!cell) {
			return;
		}

		if (this.grid && this.cells.size > 1) {
			this.grid.removeView(cell);
		} else {
			this.gridDisposables.clear();
			this.grid = undefined;
		}

		cell.element.remove();
		this.cells.delete(id);
		this.hidden.delete(id);
		this.empty.delete(id);
		this.cellDisposables.deleteAndDispose(id);

		this.updateAllVisibility();
	}

	/**
	 * Moves a cell beside another cell or to an edge of the window.
	 */
	moveCell(id: string, location: PartGridLocation): void {
		const cell = this.getCell(id);
		if (!this.grid || this.cells.size < 2) {
			return;
		}

		if (hasKey(location, { reference: true })) {
			this.grid.moveView(cell, Sizing.Distribute, this.getCell(location.reference), location.direction);
		} else {
			this.grid.removeView(cell);
			this.addAtEdge(cell, location.edge, undefined);
		}

		this.updateAllVisibility();
	}

	/**
	 * Swaps the places of two cells.
	 */
	swapCells(id: string, otherId: string): void {
		this.grid?.swapViews(this.getCell(id), this.getCell(otherId));
	}

	/**
	 * Shows or hides a cell. A part also hides while it has no editors.
	 */
	setCellVisible(id: string, visible: boolean): void {
		this.getCell(id);
		if (visible) {
			this.hidden.delete(id);
		} else {
			this.hidden.add(id);
		}

		this.updateVisibility(id);
	}

	/**
	 * Whether a cell shows: it is not hidden and, for a part, it has editors.
	 */
	isCellVisible(id: string): boolean {
		return this.cells.has(id) && !this.hidden.has(id) && !this.empty.has(id);
	}

	private updateVisibility(id: string): void {
		const cell = this.cells.get(id);
		if (!cell || !this.grid) {
			return;
		}

		// A grid does not hide its only cell, so that cell hides itself
		const visible = this.isCellVisible(id);
		const alone = this.cells.size === 1;
		const visibleInGrid = alone || visible;
		if (this.grid.isViewVisible(cell) !== visibleInGrid) {
			this.grid.setViewVisible(cell, visibleInGrid);
		}

		cell.element.style.display = alone && !visible ? 'none' : '';
		if (alone) {
			cell.setVisible(visible);
		}
	}

	private updateAllVisibility(): void {
		for (const id of this.cells.keys()) {
			this.updateVisibility(id);
		}
	}

	getCellSize(id: string): IViewSize {
		return this.grid ? this.grid.getViewSize(this.getCell(id)) : { width: 0, height: 0 };
	}

	resizeCell(id: string, size: IViewSize): void {
		this.grid?.resizeView(this.getCell(id), size);
	}

	/**
	 * The ids of the cells in the order of the grid, with the orientation of
	 * each branch, such as `row(a, column(b, c))`.
	 */
	describe(): string {
		if (!this.grid) {
			return '';
		}

		const describe = (node: GridNode<PartGridCell>, orientation: Orientation): string => {
			if (!isGridBranchNode(node)) {
				return node.view.id;
			}

			const children = node.children.map(child => describe(child, orientation === Orientation.HORIZONTAL ? Orientation.VERTICAL : Orientation.HORIZONTAL));
			return `${orientation === Orientation.HORIZONTAL ? 'row' : 'column'}(${children.join(', ')})`;
		};

		const root = this.grid.getViews();
		return root.children.length === 1 ? describe(root.children[0], this.grid.orientation) : describe(root, this.grid.orientation);
	}

	layout(width: number, height: number): void {
		this.dimension = { width, height };
		this.grid?.layout(width, height);
	}

	/**
	 * Returns the topology, sizes and visibility of the grid and the state of
	 * each part in it, to restore it with {@link restore}.
	 */
	createState(): IPartGridState {
		const parts: { [id: string]: unknown } = {};
		for (const cell of this.cells.values()) {
			if (cell.part) {
				parts[cell.id] = cell.part.createState();
			}
		}

		return { grid: this.grid?.serialize(), hidden: Array.from(this.hidden), parts };
	}

	/**
	 * Restores a grid from {@link createState}. `createContent` creates the
	 * part (from its state) or the view of each cell.
	 */
	static restore(container: HTMLElement, state: IPartGridState, createContent: (id: string, partState: unknown | undefined) => PartGridCellContent): PartGrid {
		const partGrid = new PartGrid(container);
		if (!state.grid) {
			return partGrid;
		}

		const ids = collectLeaves(state.grid.root).map(leaf => (leaf.data as { id: string }).id);
		for (const id of ids) {
			partGrid.register(id, createContent(id, state.parts[id]));
		}

		for (const id of state.hidden) {
			if (partGrid.cells.has(id)) {
				partGrid.hidden.add(id);
			}
		}

		partGrid.setGrid(partGrid.deserialize(state.grid));
		partGrid.updateAllVisibility();

		return partGrid;
	}

	override dispose(): void {
		this.cells.clear();

		super.dispose();
	}
}
