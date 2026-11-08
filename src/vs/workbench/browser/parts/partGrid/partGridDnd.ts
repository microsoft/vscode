/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventHelper, EventType, getWindow, getWindows, hide, isAncestor, isHTMLElement, onDidRegisterWindow, onDidUnregisterWindow, show } from '../../../../base/browser/dom.js';
import { Direction } from '../../../../base/browser/ui/grid/grid.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { Disposable, DisposableMap, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { EditorInputCapabilities, IEditorIdentifier } from '../../../common/editor.js';
import { DraggedEditorIdentifier } from '../../dnd.js';
import { disposeEditorDropOverlays } from '../editor/editorDropTarget.js';
import type { IPartGridRect, PartGridLocation } from './partGrid.js';
import { IPartGridReflowCell, PART_GRID_REFLOW_DURATION, PartGridReflow } from './partGridReflow.js';

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
 * How far into a card from its edge, in pixels, editors dropped there go
 * into a new part beside it (its rim), rather than into or beside a group
 * of its part. Between cards, the gap goes to the nearest card's rim.
 */
export const PART_GRID_RIM = 12;

/**
 * How far, in pixels, the pointer goes past the border of a zone before
 * dragged editors go elsewhere.
 */
const EDITOR_DROP_HYSTERESIS = 4;

/**
 * The id of the cell a new part for dropped editors would get, in a dry run.
 */
export const PART_GRID_NEW_PART_ID = '\u0000new-part';

/**
 * Where editors dropped at a point of the grid go into a new part: at an
 * edge of the window close to it (see {@link PART_GRID_WINDOW_EDGE_ZONE}),
 * beside a card on the rim of the card (see {@link PART_GRID_RIM}), or
 * beside the card nearest to a gap between cards. Elsewhere, inside a card,
 * they go into or beside a group of its part, which is not the grid's.
 */
export function getPartGridNewPartZone(x: number, y: number, container: IRect, cells: readonly { readonly id: string; readonly rect: IRect }[]): PartGridLocation | undefined {
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
		return { edge: windowEdge };
	}

	const over = rects.find(({ rect }) => contains(rect, x, y));
	if (over) {
		const { rect } = over;
		const sides: [Direction, number][] = [
			[Direction.Left, x - rect.left],
			[Direction.Right, rect.left + rect.width - x],
			[Direction.Up, y - rect.top],
			[Direction.Down, rect.top + rect.height - y]
		];
		const [direction, distance] = sides.reduce((nearest, side) => side[1] < nearest[1] ? side : nearest);
		return distance <= PART_GRID_RIM ? { reference: over.id, direction } : undefined;
	}

	// In a gap: beside the nearest card, on its side toward the point
	let nearest: { readonly id: string; readonly direction: Direction; readonly distance: number } | undefined;
	for (const { id, rect } of rects) {
		const dx = x < rect.left ? rect.left - x : x > rect.left + rect.width ? x - rect.left - rect.width : 0;
		const dy = y < rect.top ? rect.top - y : y > rect.top + rect.height ? y - rect.top - rect.height : 0;
		const distance = Math.hypot(dx, dy);
		const direction = dx >= dy ? (x < rect.left ? Direction.Left : Direction.Right) : (y < rect.top ? Direction.Up : Direction.Down);
		if (!nearest || distance < nearest.distance) {
			nearest = { id, direction, distance };
		}
	}

	return nearest && nearest.distance <= PART_GRID_RIM ? { reference: nearest.id, direction: nearest.direction } : undefined;
}

/**
 * What a {@link PartGridDropTarget} needs from its grid.
 */
export interface IPartGridDropTargetHost {
	readonly container: HTMLElement;

	isMotionEnabled(): boolean;

	/**
	 * The cells that show.
	 */
	getVisibleCells(): readonly IPartGridReflowCell[];

	/**
	 * Whether editors can go into new parts.
	 */
	canCreateParts(): boolean;

	/**
	 * The cell of the part dragged editors come from.
	 */
	getSourceCell(editors: readonly IEditorIdentifier[]): string | undefined;

	/**
	 * Where the cards would be, in client coordinates, with dragged editors
	 * in a new part at a location, the new part's under
	 * {@link PART_GRID_NEW_PART_ID}: a dry run.
	 */
	previewNewPart(editors: readonly IEditorIdentifier[], location: PartGridLocation): ReadonlyMap<string, IPartGridRect> | undefined;

	/**
	 * Moves editors into a new part at a location, as dropped, or copies
	 * them there.
	 */
	moveEditorsIntoNewPart(editors: readonly IEditorIdentifier[], location: PartGridLocation, copy: boolean): void;

	/**
	 * Whether editors dropped on a part split it, as the editor groups do,
	 * by `workbench.editor.splitOnDragAndDrop`, before key modifiers.
	 */
	splitsOnDragAndDrop(): boolean;
}

function isToggleSplitOperation(e: DragEvent): boolean {
	return (e.altKey && !isMacintosh) || (e.shiftKey && isMacintosh);
}

function isCopyOperation(e: DragEvent, editors: readonly IEditorIdentifier[]): boolean {
	// Singleton editors only move
	return ((e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh)) && !editors.some(({ editor }) => editor.hasCapability(EditorInputCapabilities.Singleton));
}

/**
 * Takes the drop of editors where they go into a new part: at an edge of
 * the window, on the rim of a card or between cards (see
 * {@link getPartGridNewPartZone}), even over a part, whose own drop overlay
 * gives way. Into or beside a group of a part, the part's own drop target
 * takes them, as before.
 *
 * Where they go shows as an empty card that the other cards make way for
 * (see {@link PartGridReflow}), found among the cards where they show, and
 * changing only past the border of a zone; dropped, the new part comes once
 * the cards settled. Without motion, where they go shows as a slot.
 * Parts drag by the pointer instead (see `PartGridCardDrag`).
 */
export class PartGridDropTarget extends Disposable {

	private readonly editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();

	private readonly indicator: HTMLElement;

	/** Where dragged editors go into a new part, by its key, if they do. */
	private current: { readonly key: string; readonly location: PartGridLocation | undefined } = { key: NONE_KEY, location: undefined };
	private readonly reflow = this._register(new MutableDisposable<PartGridReflow>());
	private readonly reflowEnd = this._register(new MutableDisposable());
	private settling = false;

	constructor(private readonly host: IPartGridDropTargetHost) {
		super();

		this.indicator = append(host.container, $('.part-grid-drop-indicator'));
		hide(this.indicator);
		this._register(toDisposable(() => this.indicator.remove()));

		this.registerListeners();
	}

	private registerListeners(): void {
		const container = this.host.container;

		// Capture: editors where they go into a new part are the grid's, also over a part. On the window, by where the
		// pointer is: as the cards make way, what is under the pointer can be outside the grid, such as what draws over it,
		// and a drop with no move after that goes there
		const targetDocument = getWindow(container).document;
		this._register(addDisposableListener(targetDocument, EventType.DRAG_OVER, e => this.isInGrid(e) && this.onDragOver(e), true));
		this._register(addDisposableListener(targetDocument, EventType.DROP, e => this.isInGrid(e) && this.onDrop(e), true));
		// Only once the pointer is out of the grid: Chromium tells no related target as what is under the pointer changes, as the cards make way
		this._register(addDisposableListener(container, EventType.DRAG_LEAVE, e => {
			// Editors no longer dragged, such as a drag from another window that ended there, show nowhere
			if (!this.getDragged()) {
				this.reset();
				return;
			}
			if (e.relatedTarget && isAncestor(e.relatedTarget as Node, container)) {
				return;
			}
			const bounds = container.getBoundingClientRect();
			if (e.clientX <= bounds.left || e.clientX >= bounds.right || e.clientY <= bounds.top || e.clientY >= bounds.bottom) {
				this.reset();
			}
		}));
		// A drag ends in the window it started in, such as another window whose editors were dragged here and
		// cancelled there. In the capture phase: a drag that a cell takes over ends there.
		const dragEndListeners = this._register(new DisposableMap<number>());
		const listen = (window: CodeWindow) => dragEndListeners.set(window.vscodeWindowId, addDisposableListener(window, EventType.DRAG_END, () => this.reset(), true));
		for (const { window } of getWindows()) {
			listen(window);
		}
		this._register(onDidRegisterWindow(({ window }) => listen(window)));
		this._register(onDidUnregisterWindow(window => dragEndListeners.deleteAndDispose(window.vscodeWindowId)));
	}

	private isInGrid(e: DragEvent): boolean {
		if (isAncestor(e.target as Node, this.host.container)) {
			return true;
		}
		const bounds = this.host.container.getBoundingClientRect();
		return e.clientX >= bounds.left && e.clientX <= bounds.right && e.clientY >= bounds.top && e.clientY <= bounds.bottom;
	}

	/**
	 * The editors dragged, where they can go into a new part: where editors
	 * dropped split what they are dropped on, as the editor groups do.
	 */
	private getDragged(e?: DragEvent): readonly IEditorIdentifier[] | undefined {
		const editors = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
		const splits = this.host.splitsOnDragAndDrop() !== (!!e && isToggleSplitOperation(e));
		if (editors?.length && splits && this.host.canCreateParts()) {
			return editors.map(({ identifier }) => identifier);
		}

		return undefined;
	}

	/**
	 * The cards of the parts where they show, and the new part's place.
	 */
	private getZones(): { readonly id: string; readonly rect: IRect }[] {
		const shown = this.reflow.value?.shown;
		if (shown) {
			return Array.from(shown, ([id, rect]) => ({ id, rect }));
		}

		return this.host.getVisibleCells().filter(cell => cell.isPart).map(cell => {
			const { left, top, width, height } = cell.card.getBoundingClientRect();
			return { id: cell.id, rect: { left, top, width, height } };
		});
	}

	private resolve(x: number, y: number, zones: readonly { readonly id: string; readonly rect: IRect }[]): { readonly key: string; readonly location: PartGridLocation | undefined } | 'keep' {
		// Over the new part's place, it goes there already
		const slot = zones.find(zone => zone.id === PART_GRID_NEW_PART_ID);
		if (slot && contains(slot.rect, x, y)) {
			return 'keep';
		}

		const location = getPartGridNewPartZone(x, y, this.host.container.getBoundingClientRect(), zones.filter(zone => zone.id !== PART_GRID_NEW_PART_ID));
		return location ? { key: JSON.stringify(location), location } : { key: NONE_KEY, location: undefined };
	}

	private onDragOver(e: DragEvent): void {
		if (this.settling) {
			return;
		}

		const editors = this.getDragged(e);
		if (!editors) {
			this.reset();
			return;
		}

		this.retarget(e.clientX, e.clientY, editors);
		if (!this.current.location) {
			return; // into or beside a group: the part's own drop target takes them
		}

		EventHelper.stop(e, true);
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = isCopyOperation(e, editors) ? 'copy' : 'move';
		}

		// The drop overlay of the part under the editors, if it showed, goes away
		disposeEditorDropOverlays(this.host.container);
	}

	/**
	 * Goes elsewhere only once the pointer is past the border of the zone of
	 * where it goes now; for each place, a dry run finds where the cards go.
	 */
	private retarget(x: number, y: number, editors: readonly IEditorIdentifier[]): void {
		const zones = this.getZones();
		const candidate = this.resolve(x, y, zones);
		if (candidate === 'keep' || candidate.key === this.current.key) {
			return;
		}

		const bounds = this.host.container.getBoundingClientRect();
		const h = EDITOR_DROP_HYSTERESIS;
		const clamp = (value: number, min: number, size: number) => Math.min(Math.max(value, min), min + size);
		const nearCurrent = [[h, 0], [-h, 0], [0, h], [0, -h]].some(([dx, dy]) => {
			const near = this.resolve(clamp(x + dx, bounds.left, bounds.width), clamp(y + dy, bounds.top, bounds.height), zones);
			return near !== 'keep' && near.key === this.current.key;
		});
		if (nearCurrent) {
			return;
		}

		const rects = candidate.location ? this.host.previewNewPart(editors, candidate.location) : undefined;
		const location = rects ? candidate.location : undefined;
		this.current = location ? candidate : { key: NONE_KEY, location: undefined };
		this.show(rects, editors);
	}

	/**
	 * Shows the cards where they go, and the new part's place, or, without
	 * rects, as they are.
	 */
	private show(rects: ReadonlyMap<string, IPartGridRect> | undefined, editors: readonly IEditorIdentifier[]): void {
		if (!this.host.isMotionEnabled()) {
			const slot = rects?.get(PART_GRID_NEW_PART_ID);
			if (!slot) {
				hide(this.indicator);
				return;
			}
			this.indicator.style.left = `${slot.left}px`;
			this.indicator.style.top = `${slot.top}px`;
			this.indicator.style.width = `${slot.width}px`;
			this.indicator.style.height = `${slot.height}px`;
			show(this.indicator);
			return;
		}

		if (rects) {
			this.reflowEnd.clear();
			if (!this.reflow.value) {
				this.reflow.value = new PartGridReflow(this.host.container, this.host.getVisibleCells(), true, undefined, this.host.getSourceCell(editors));
			}
			this.reflow.value.show(rects, PART_GRID_NEW_PART_ID);
			return;
		}

		// Back where they were: the cards slide back, and then what shows them goes
		const reflow = this.reflow.value;
		if (reflow) {
			reflow.restore();
			const timer = setTimeout(() => this.reflow.clear(), PART_GRID_REFLOW_DURATION + 30);
			this.reflowEnd.value = toDisposable(() => clearTimeout(timer));
		}
	}

	private onDrop(e: DragEvent): void {
		const editors = this.getDragged(e);
		if (!editors || this.settling) {
			return;
		}

		// Where the last move showed them going, as the cards made way for it; without one, where the drop is
		if (!this.current.location) {
			this.retarget(e.clientX, e.clientY, editors);
		}
		const location = this.current.location;
		if (!location) {
			return; // into or beside a group: the part's own drop target takes them
		}

		EventHelper.stop(e, true);
		hide(this.indicator);
		this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
		this.current = { key: NONE_KEY, location: undefined };
		const copy = isCopyOperation(e, editors);

		const reflow = this.reflow.value;
		if (!reflow) {
			this.host.moveEditorsIntoNewPart(editors, location, copy);
			return;
		}

		// The new part comes once the cards settled, in the slot shown for it
		this.settling = true;
		this.reflowEnd.clear();
		reflow.fill();
		const timer = setTimeout(() => this.finish(editors, location, copy), PART_GRID_REFLOW_DURATION + 30);
		// Disposed meanwhile, such as with its grid, the drop is dropped: no part is created for a grid that goes
		this.reflowEnd.value = toDisposable(() => clearTimeout(timer));
	}

	private finish(editors: readonly IEditorIdentifier[], location: PartGridLocation, copy: boolean): void {
		this.settling = false;
		// The new part lays out the cards where they show; what it does not lay out, the clean up does
		this.host.moveEditorsIntoNewPart(editors, location, copy);
		this.reflow.clear();
	}

	private reset(): void {
		if (this.settling) {
			return;
		}

		hide(this.indicator);
		if (this.current.key !== NONE_KEY || this.reflow.value) {
			this.current = { key: NONE_KEY, location: undefined };
			this.show(undefined, []);
		}
	}
}

const NONE_KEY = 'none';

/**
 * The title of an editor group in a cell, if a target is its empty space,
 * which drags the group (the space beside its tabs, or its title itself).
 * A pointer down there drags the part instead (see `PartGrid.startPartDrag`).
 */
export function getPartTitleDragSource(target: EventTarget | null, cell: HTMLElement): HTMLElement | undefined {
	if (!isHTMLElement(target)) {
		return undefined;
	}

	const title = target.classList.contains('tabs-container') ? target.closest<HTMLElement>('.title') : target.classList.contains('title') ? target : null;
	const group = title?.parentElement;
	if (!title || !group?.classList.contains('editor-group-container') || !cell.contains(group)) {
		return undefined;
	}

	return title;
}
