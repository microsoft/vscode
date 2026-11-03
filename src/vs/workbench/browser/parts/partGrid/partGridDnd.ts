/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventHelper, EventType, getWindow, hide, isAncestor, isHTMLElement, show } from '../../../../base/browser/dom.js';
import { Direction } from '../../../../base/browser/ui/grid/grid.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { IEditorIdentifier } from '../../../common/editor.js';
import { DraggedEditorIdentifier } from '../../dnd.js';
import { disposeEditorDropOverlays } from '../editor/editorDropTarget.js';
import type { PartGridLocation } from './partGrid.js';

/**
 * How close to an edge of the window, in pixels, a drop goes to that edge of
 * the window rather than beside the cell under it.
 */
export const PART_GRID_WINDOW_EDGE_ZONE = 16;

export interface IPartGridDropCell {
	readonly id: string;
	readonly element: HTMLElement;
}

/**
 * Where a drop goes: to a location in the grid, or, for a part dropped on
 * the center of another part, into that part (a merge).
 */
export type IPartGridDrop = ({ readonly location: PartGridLocation } | { readonly merge: string }) & {

	/**
	 * Where the drop indicator shows, in client coordinates.
	 */
	readonly indicator: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
};

/**
 * How far into a part, as a share of its size from each side, a dropped
 * part goes beside it. Further in, its center, the part merges into it, if
 * they merge, else it goes beside it on the side nearest to the point.
 */
export const PART_GRID_SIDE_ZONE = 0.25;

interface IRect {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

function union(rects: readonly IRect[]): IRect {
	const left = Math.min(...rects.map(rect => rect.left));
	const top = Math.min(...rects.map(rect => rect.top));
	const right = Math.max(...rects.map(rect => rect.left + rect.width));
	const bottom = Math.max(...rects.map(rect => rect.top + rect.height));

	return { left, top, width: right - left, height: bottom - top };
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
 *
 * The edges of the window are those of the parts (the cells): views beside
 * them that span the window, such as a title row, stay at the edge, and the
 * room between the parts and the edges of the window counts as the edge.
 */
export function getPartGridDrop(x: number, y: number, container: IRect, cells: readonly IPartGridDropCell[], excludedCellId?: string, canMerge?: (targetId: string) => boolean): IPartGridDrop | undefined {
	const rects = cells.map(cell => {
		const bounds = cell.element.getBoundingClientRect();
		return { id: cell.id, rect: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height } };
	});

	return getPartGridDropAt(x, y, container, rects, excludedCellId, canMerge);
}

/**
 * As {@link getPartGridDrop}, for cells where they show rather than where
 * their elements are, such as cards that make way for a dragged card.
 */
export function getPartGridDropAt(x: number, y: number, container: IRect, cells: readonly { readonly id: string; readonly rect: IRect }[], excludedCellId?: string, canMerge?: (targetId: string) => boolean): IPartGridDrop | undefined {
	if (!contains(container, x, y)) {
		return undefined;
	}

	const rects = cells.filter(({ rect }) => rect.width > 0 && rect.height > 0);
	const area = rects.length ? union(rects.map(({ rect }) => rect)) : container;

	const windowEdges: [Direction, number][] = [
		[Direction.Left, x - area.left],
		[Direction.Right, area.left + area.width - x],
		[Direction.Up, y - area.top],
		[Direction.Down, area.top + area.height - y]
	];
	const [windowEdge, windowEdgeDistance] = windowEdges.reduce((nearest, edge) => edge[1] < nearest[1] ? edge : nearest);
	if (windowEdgeDistance <= PART_GRID_WINDOW_EDGE_ZONE) {
		return { location: { edge: windowEdge }, indicator: half(area, windowEdge, 0.25) };
	}

	for (const { id, rect } of rects) {
		if (!contains(rect, x, y)) {
			continue;
		}
		const cell = { id };

		if (cell.id === excludedCellId) {
			return undefined;
		}

		const sides: [Direction, number][] = [
			[Direction.Left, (x - rect.left) / rect.width],
			[Direction.Right, (rect.left + rect.width - x) / rect.width],
			[Direction.Up, (y - rect.top) / rect.height],
			[Direction.Down, (rect.top + rect.height - y) / rect.height]
		];
		const [direction, distance] = sides.reduce((nearest, side) => side[1] < nearest[1] ? side : nearest);

		// The center of a part: the dropped part merges into it, if they merge; else it goes beside it, on its nearest side
		if (canMerge && distance > PART_GRID_SIDE_ZONE && canMerge(cell.id)) {
			return { merge: cell.id, indicator: rect };
		}

		return { location: { reference: cell.id, direction }, indicator: half(rect, direction) };
	}

	return undefined;
}

/**
 * What a {@link PartGridDropTarget} needs from its grid.
 */
export interface IPartGridDropTargetHost {
	readonly container: HTMLElement;

	/**
	 * The cells that show, as drop targets.
	 */
	getVisibleCells(): readonly IPartGridDropCell[];

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
 * Takes the drop of editors on an edge of the window outside any part,
 * showing where they go. Parts drag by the pointer instead (see
 * `PartGridCardDrag`).
 */
export class PartGridDropTarget extends Disposable {

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

		// Capture: editors at an edge of the window are the grid's, also over a part
		this._register(addDisposableListener(container, EventType.DRAG_OVER, e => this.onDragOver(e), true));
		this._register(addDisposableListener(container, EventType.DROP, e => this.onDrop(e), true));
		this._register(addDisposableListener(container, EventType.DRAG_LEAVE, e => {
			if (!e.relatedTarget || !isAncestor(e.relatedTarget as Node, container)) {
				hide(this.indicator);
			}
		}));
		// In the capture phase: a drag that a cell takes over ends there
		this._register(addDisposableListener(getWindow(container), EventType.DRAG_END, () => hide(this.indicator), true));
	}

	private getDragged(): readonly IEditorIdentifier[] | undefined {
		const editors = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
		if (editors?.length && this.host.canCreateParts()) {
			return editors.map(({ identifier }) => identifier);
		}

		return undefined;
	}

	/**
	 * Editors go into a new part only at an edge of the window.
	 */
	private getDrop(e: DragEvent): (IPartGridDrop & { readonly location: { readonly edge: Direction } }) | undefined {
		const drop = getPartGridDrop(e.clientX, e.clientY, this.host.container.getBoundingClientRect(), this.host.getVisibleCells());
		if (drop && hasKey(drop, { location: true }) && hasKey(drop.location, { edge: true })) {
			return { location: drop.location, indicator: drop.indicator };
		}

		return undefined;
	}

	private onDragOver(e: DragEvent): void {
		const drop = this.getDragged() ? this.getDrop(e) : undefined;
		if (!drop) {
			hide(this.indicator);
			return; // editors elsewhere are not the grid's
		}

		EventHelper.stop(e, true);
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}

		// The drop overlay of the part under the editors, if it showed, goes away
		disposeEditorDropOverlays(this.host.container);

		const { left, top, width, height } = drop.indicator;
		this.indicator.style.left = `${left}px`;
		this.indicator.style.top = `${top}px`;
		this.indicator.style.width = `${width}px`;
		this.indicator.style.height = `${height}px`;
		show(this.indicator);
	}

	private onDrop(e: DragEvent): void {
		const editors = this.getDragged();
		const drop = editors ? this.getDrop(e) : undefined;
		if (!editors || !drop) {
			return; // editors elsewhere are not the grid's
		}

		EventHelper.stop(e, true);
		hide(this.indicator);
		this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
		this.host.moveEditorsIntoNewPart(editors, drop.location.edge);
	}
}

/**
 * The title of an editor group in a cell, if a target is its empty space,
 * which drags the group (the space beside its tabs, or its title itself),
 * and the group is one whose title drags the part, as `canDragPart` says.
 * A pointer down there drags the part instead (see `PartGrid.startPartDrag`).
 */
export function getPartTitleDragSource(target: EventTarget | null, cell: HTMLElement, canDragPart: (group: HTMLElement) => boolean): HTMLElement | undefined {
	if (!isHTMLElement(target)) {
		return undefined;
	}

	const title = target.classList.contains('tabs-container') ? target.closest<HTMLElement>('.title') : target.classList.contains('title') ? target : null;
	const group = title?.parentElement;
	if (!title || !group?.classList.contains('editor-group-container') || !cell.contains(group) || !canDragPart(group)) {
		return undefined;
	}

	return title;
}
