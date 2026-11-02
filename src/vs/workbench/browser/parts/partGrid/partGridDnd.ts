/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, DragAndDropObserver, EventHelper, EventType, getWindow, hide, isAncestor, show } from '../../../../base/browser/dom.js';
import { applyDragImage } from '../../../../base/browser/ui/dnd/dnd.js';
import { Direction } from '../../../../base/browser/ui/grid/grid.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { IEditorIdentifier } from '../../../common/editor.js';
import { DraggedEditorIdentifier } from '../../dnd.js';
import { disposeEditorDropOverlays } from '../editor/editorDropTarget.js';
import type { PartGridLocation } from './partGrid.js';

/**
 * The transfer of a part dragged within its window's part grid.
 */
export class DraggedPartIdentifier {

	constructor(readonly grid: object, readonly cellId: string) { }
}

/**
 * How close to an edge of the window, in pixels, a drop goes to that edge of
 * the window rather than beside the cell under it.
 */
export const PART_GRID_WINDOW_EDGE_ZONE = 16;

export interface IPartGridDropCell {
	readonly id: string;
	readonly element: HTMLElement;
}

export interface IPartGridDrop {
	readonly location: PartGridLocation;

	/**
	 * Where the drop indicator shows, in client coordinates.
	 */
	readonly indicator: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

interface IRect {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

function contains(rect: IRect, x: number, y: number): boolean {
	return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

function half(rect: IRect, direction: Direction, fraction = 0.5): IRect {
	switch (direction) {
		case Direction.Left: return { left: rect.left, top: rect.top, width: rect.width * fraction, height: rect.height };
		case Direction.Right: return { left: rect.left + rect.width * (1 - fraction), top: rect.top, width: rect.width * fraction, height: rect.height };
		case Direction.Up: return { left: rect.left, top: rect.top, width: rect.width, height: rect.height * fraction };
		case Direction.Down: return { left: rect.left, top: rect.top + rect.height * (1 - fraction), width: rect.width, height: rect.height * fraction };
	}
}

/**
 * Where a drop at a point of the grid goes: to an edge of the window when
 * close to it, else beside the cell under the point, on its side nearest to
 * the point. A drop on the excluded cell (the dragged one) goes nowhere.
 */
export function getPartGridDrop(x: number, y: number, container: IRect, cells: readonly IPartGridDropCell[], excludedCellId?: string): IPartGridDrop | undefined {
	if (!contains(container, x, y)) {
		return undefined;
	}

	const windowEdges: [Direction, number][] = [
		[Direction.Left, x - container.left],
		[Direction.Right, container.left + container.width - x],
		[Direction.Up, y - container.top],
		[Direction.Down, container.top + container.height - y]
	];
	const [windowEdge, windowEdgeDistance] = windowEdges.reduce((nearest, edge) => edge[1] < nearest[1] ? edge : nearest);
	if (windowEdgeDistance <= PART_GRID_WINDOW_EDGE_ZONE) {
		return { location: { edge: windowEdge }, indicator: half(container, windowEdge, 0.25) };
	}

	for (const cell of cells) {
		const bounds = cell.element.getBoundingClientRect();
		const rect: IRect = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
		if (rect.width === 0 || rect.height === 0 || !contains(rect, x, y)) {
			continue;
		}

		if (cell.id === excludedCellId) {
			return undefined;
		}

		const sides: [Direction, number][] = [
			[Direction.Left, (x - rect.left) / rect.width],
			[Direction.Right, (rect.left + rect.width - x) / rect.width],
			[Direction.Up, (y - rect.top) / rect.height],
			[Direction.Down, (rect.top + rect.height - y) / rect.height]
		];
		const [direction] = sides.reduce((nearest, side) => side[1] < nearest[1] ? side : nearest);

		return { location: { reference: cell.id, direction }, indicator: half(rect, direction) };
	}

	return undefined;
}

/**
 * What a {@link PartGridDropTarget} needs from its grid.
 */
export interface IPartGridDropTargetHost {
	readonly grid: object;
	readonly container: HTMLElement;

	/**
	 * The cells that show, as drop targets.
	 */
	getVisibleCells(): readonly IPartGridDropCell[];

	/**
	 * Moves a cell, as dropped.
	 */
	moveCell(id: string, location: PartGridLocation): void;

	/**
	 * Whether editors can go into new parts.
	 */
	canCreateParts(): boolean;

	/**
	 * Moves editors into a new part at an edge of the window, as dropped.
	 */
	moveEditorsIntoNewPart(editors: readonly IEditorIdentifier[], edge: Direction): void;
}

/**
 * The drop a {@link PartGridDropTarget} takes.
 */
type PartGridDragged =
	{ readonly cellId: string } |
	{ readonly editors: readonly IEditorIdentifier[] };

/**
 * Takes the drop of a part dragged within its grid, and of editors dropped on
 * an edge of the window outside any part, showing where they go.
 */
export class PartGridDropTarget extends Disposable {

	private readonly partTransfer = LocalSelectionTransfer.getInstance<DraggedPartIdentifier>();
	private readonly editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();

	private readonly indicator: HTMLElement;

	constructor(private readonly host: IPartGridDropTargetHost) {
		super();

		this.indicator = append(host.container, $('.part-grid-drop-indicator'));
		hide(this.indicator);
		this._register(toDisposable(() => this.indicator.remove()));

		this.registerListeners();
	}

	private registerListeners(): void {
		const container = this.host.container;

		// Capture: the parts in the grid do not take the drag of a part
		this._register(addDisposableListener(container, EventType.DRAG_OVER, e => this.onDragOver(e), true));
		this._register(addDisposableListener(container, EventType.DROP, e => this.onDrop(e), true));
		this._register(addDisposableListener(container, EventType.DRAG_LEAVE, e => {
			if (!e.relatedTarget || !isAncestor(e.relatedTarget as Node, container)) {
				this.hideIndicator();
			}
		}));
		this._register(addDisposableListener(getWindow(container), EventType.DRAG_END, () => this.hideIndicator()));
	}

	/**
	 * What is dragged over the grid that the grid may take: a part of the
	 * grid, or editors, which the grid takes only near an edge of the window
	 * (see {@link getDrop}), also over a part there.
	 */
	private getDragged(e: DragEvent): PartGridDragged | undefined {
		const parts = this.partTransfer.getData(DraggedPartIdentifier.prototype);
		if (parts?.[0]?.grid === this.host.grid) {
			return { cellId: parts[0].cellId };
		}

		const editors = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
		if (editors?.length && this.host.canCreateParts()) {
			return { editors: editors.map(({ identifier }) => identifier) };
		}

		return undefined;
	}

	private getDrop(e: DragEvent, dragged: PartGridDragged): IPartGridDrop | undefined {
		const bounds = this.host.container.getBoundingClientRect();
		const drop = getPartGridDrop(e.clientX, e.clientY, bounds, this.host.getVisibleCells(), hasKey(dragged, { cellId: true }) ? dragged.cellId : undefined);

		// Editors go into a new part only at an edge of the window
		if (hasKey(dragged, { editors: true }) && drop && !hasKey(drop.location, { edge: true })) {
			return undefined;
		}

		return drop;
	}

	private onDragOver(e: DragEvent): void {
		const dragged = this.getDragged(e);
		if (!dragged) {
			this.hideIndicator();
			return;
		}

		const drop = this.getDrop(e, dragged);
		if (!drop && hasKey(dragged, { editors: true })) {
			this.hideIndicator();
			return; // editors elsewhere are not the grid's
		}

		EventHelper.stop(e, true);
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = drop ? 'move' : 'none';
		}

		// Editors at an edge of the window are the grid's, also over a part,
		// whose own drop overlay, if it showed, goes away
		if (drop && hasKey(dragged, { editors: true })) {
			disposeEditorDropOverlays(this.host.container);
		}

		if (!drop) {
			this.hideIndicator();
			return;
		}

		const { left, top, width, height } = drop.indicator;
		this.indicator.style.left = `${left}px`;
		this.indicator.style.top = `${top}px`;
		this.indicator.style.width = `${width}px`;
		this.indicator.style.height = `${height}px`;
		show(this.indicator);
	}

	private onDrop(e: DragEvent): void {
		const dragged = this.getDragged(e);
		if (!dragged) {
			return;
		}

		const drop = this.getDrop(e, dragged);
		if (!drop && hasKey(dragged, { editors: true })) {
			return; // editors elsewhere are not the grid's
		}

		EventHelper.stop(e, true);
		this.hideIndicator();

		if (hasKey(dragged, { cellId: true })) {
			this.partTransfer.clearData(DraggedPartIdentifier.prototype);
			if (drop) {
				this.host.moveCell(dragged.cellId, drop.location);
			}
		} else {
			this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
			if (drop && hasKey(drop.location, { edge: true })) {
				this.host.moveEditorsIntoNewPart(dragged.editors, drop.location.edge);
			}
		}
	}


	private hideIndicator(): void {
		hide(this.indicator);
	}
}

/**
 * Makes an element, such as the frame of a part's card, drag the part
 * within its grid.
 */
export function registerPartDragHandle(handle: HTMLElement, grid: object, cellId: string, getLabel: () => string): IDisposable {
	const disposables = new DisposableStore();
	const partTransfer = LocalSelectionTransfer.getInstance<DraggedPartIdentifier>();

	handle.draggable = true;
	disposables.add(new DragAndDropObserver(handle, {
		onDragStart: e => {
			partTransfer.setData([new DraggedPartIdentifier(grid, cellId)], DraggedPartIdentifier.prototype);
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				applyDragImage(e, handle, getLabel());
			}
		},
		onDragEnd: () => partTransfer.clearData(DraggedPartIdentifier.prototype)
	}));

	return disposables;
}
