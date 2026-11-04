/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventHelper, EventType, getWindow, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import type { IPartGridRect, PartGridLocation } from './partGrid.js';
import { getPartGridDropAt } from './partGridDnd.js';
import { PART_GRID_MOTION_CLASS } from './partGridMotion.js';
import { IPartGridReflowCell, IPartGridReflowCellState, PART_GRID_REFLOW_DURATION, PartGridReflow } from './partGridReflow.js';

/**
 * How far, in pixels, the pointer moves before a card lifts, so that a
 * click does not drag it.
 */
export const PART_GRID_DRAG_THRESHOLD = 4;

/**
 * How far, in pixels, the pointer moves from where it lifted the card before
 * an edge of the window under the card takes it: the grabber of a card can be
 * at an edge of the window, which it does not go to as it lifts.
 */
export const PART_GRID_LIFT_DISTANCE = 32;

/**
 * How far, in pixels, the pointer goes past the border of the zone of
 * where a card goes before it goes elsewhere, so that it does not flip
 * between two places at their border.
 */
export const PART_GRID_DROP_HYSTERESIS = 8;

/**
 * The scale of a lifted card, about where the pointer holds it.
 */
const LIFT_SCALE = 0.6;

/**
 * Where a dragged card goes: to a location in the grid, or into the part of
 * another card (a merge).
 */
export type PartGridCardDrop = { readonly location: PartGridLocation } | { readonly merge: string };

/**
 * A cell that shows, as the card drag sees it.
 */
export type IPartGridCardDragCell = IPartGridReflowCell;

/**
 * What a {@link PartGridCardDrag} needs from its grid.
 */
export interface IPartGridCardDragHost {
	readonly container: HTMLElement;

	isMotionEnabled(): boolean;

	getVisibleCells(): readonly IPartGridCardDragCell[];

	canMerge(id: string, targetId: string): boolean;

	/**
	 * Where the cards of the cells that show would be, in client
	 * coordinates, after a drop: a dry run that does not change the grid.
	 */
	previewArrangement(id: string, drop: PartGridCardDrop): ReadonlyMap<string, IPartGridRect> | undefined;

	/**
	 * Moves or merges the dragged part, as dropped.
	 */
	drop(id: string, drop: PartGridCardDrop): void;
}

/**
 * Drags the card of a part by the pointer within its window: the card lifts
 * and follows the pointer, and the other cards make way for it where it
 * goes (see {@link CardDragSession}). Escape cancels.
 */
export class PartGridCardDrag extends Disposable {

	private readonly session = this._register(new MutableDisposable<CardDragSession>());

	constructor(private readonly host: IPartGridCardDragHost) {
		super();
	}

	/**
	 * Whether a card is dragged, from its lift until it settled.
	 */
	get isActive(): boolean {
		return !!this.session.value;
	}

	/**
	 * Starts dragging the card of a part from a pointer down on it, such as
	 * on its grabber. The card lifts once the pointer moves. Returns whether
	 * the drag started.
	 */
	start(id: string, e: PointerEvent): boolean {
		if (e.button !== 0 || this.session.value?.isDragging) {
			return false;
		}

		const cell = this.host.getVisibleCells().find(candidate => candidate.id === id && candidate.isPart);
		if (!cell) {
			return false;
		}

		// A card still settling settles at once
		this.session.value?.settle();
		this.session.clear();
		const session = new CardDragSession(this.host, cell, e, () => {
			if (this.session.value === session) {
				this.session.clear();
			}
		});
		this.session.value = session;

		return true;
	}
}

type Resolved =
	{ readonly kind: 'keep' } |
	{ readonly kind: 'drop'; readonly key: string; readonly drop: PartGridCardDrop };

const NONE = 'none';

function keyOf(drop: PartGridCardDrop): string {
	return JSON.stringify(drop);
}

/**
 * One drag of a card:
 * - it lifts once the pointer moves, a smaller copy with a shadow that
 *   follows the pointer by transforms only;
 * - where it goes changes only once the pointer is some way into another
 *   zone (see {@link PART_GRID_DROP_HYSTERESIS}); the zones are those of the
 *   cards where they show, not where they were, so that where it goes does
 *   not flip under the pointer;
 * - for each place it goes, a dry run of the move finds where every card
 *   goes, once, and the other cards make way (see {@link PartGridReflow});
 * - dropped, the card settles into its slot, then the grid moves the part,
 *   once.
 * Without motion, no card lifts or slides: where the card goes shows as a
 * slot, and the drop moves the part at once.
 */
class CardDragSession extends Disposable {

	private readonly targetWindow: Window;
	private readonly startX: number;
	private readonly startY: number;

	private phase: 'pending' | 'dragging' | 'settling' = 'pending';
	/** The layer over the window that takes the pointer from the press, with the cursor of the drag once the card lifted. */
	private readonly cursor: HTMLElement;
	private reflow: PartGridReflow | undefined;
	private dragged: IPartGridReflowCellState | undefined;

	/** Where it goes, by its key. */
	private current: { readonly key: string; readonly drop: PartGridCardDrop | undefined } = { key: NONE, drop: undefined };

	private readonly visuals = this._register(new DisposableStore());
	private topLayer: HTMLElement | undefined;
	private indicator: HTMLElement | undefined;
	private liftedGhost: HTMLElement | undefined;
	private settleTimer: ReturnType<typeof setTimeout> | undefined;
	private pendingDrop: PartGridCardDrop | undefined;
	private leftStart = false;

	/**
	 * From the pointer to the center of the lifted card, where it shows: where
	 * the card goes beside or into a part is found there, not under the
	 * pointer, which holds the card by its edge.
	 */
	private centerOffset = { x: 0, y: 0 };

	constructor(
		private readonly host: IPartGridCardDragHost,
		private readonly draggedCell: IPartGridCardDragCell,
		e: PointerEvent,
		private readonly onDidEnd: () => void
	) {
		super();

		this.targetWindow = getWindow(host.container);
		this.startX = e.clientX;
		this.startY = e.clientY;

		// The pointer goes on to this drag, also over what draws over the window
		const target = e.target instanceof Element ? e.target : undefined;
		try {
			target?.setPointerCapture(e.pointerId);
		} catch {
			// a pointer that is not down, such as a synthetic one, is not captured
		}

		// From the press, a layer over the window takes the pointer: the first move can otherwise go into what draws over
		// the window, such as a webview beside the card, which takes the pointer from the window before its capture applies
		const cursor = this.cursor = append(host.container, $('.part-grid-drag-cursor.part-grid-drag-pending'));
		this._register(toDisposable(() => cursor.remove()));

		this._register(addDisposableListener(this.targetWindow, EventType.POINTER_MOVE, e => this.onPointerMove(e), true));
		this._register(addDisposableListener(this.targetWindow, EventType.POINTER_UP, e => this.onPointerUp(e), true));
		this._register(addDisposableListener(this.targetWindow, 'pointercancel', () => this.cancel(), true));
		if (target) {
			// Losing the pointer before it lifted, such as to another window, is a press that ends there
			this._register(addDisposableListener(target, 'lostpointercapture', () => this.isDragging ? this.cancel() : this.phase === 'pending' ? this.onDidEnd() : undefined));
		}
		this._register(addDisposableListener(this.targetWindow, EventType.KEY_DOWN, e => {
			if (this.phase !== 'settling' && new StandardKeyboardEvent(e).equals(KeyCode.Escape)) {
				EventHelper.stop(e, true);
				this.cancel();
			}
		}, true));
		// The window losing focus, such as to another window, cancels the drag: the pointer goes on elsewhere
		this._register(addDisposableListener(this.targetWindow, EventType.BLUR, () => this.isDragging ? this.cancel() : undefined));
		// Disposed, such as with its grid, a drop that still settles is dropped: nothing moves into a grid that goes
		this._register(toDisposable(() => {
			this.pendingDrop = undefined;
			this.cleanUp();
		}));
	}

	get isDragging(): boolean {
		return this.phase === 'dragging';
	}

	/**
	 * Moves the part at once, if it was dropped and still settles, such as
	 * when another drag starts.
	 */
	settle(): void {
		if (this.pendingDrop) {
			this.finish();
		}
	}

	private get motion(): boolean {
		return !!this.reflow?.motion;
	}

	private onPointerMove(e: PointerEvent): void {
		if (this.phase === 'pending') {
			if (Math.abs(e.clientX - this.startX) < PART_GRID_DRAG_THRESHOLD && Math.abs(e.clientY - this.startY) < PART_GRID_DRAG_THRESHOLD) {
				return;
			}
			this.lift();
		}

		if (this.phase !== 'dragging') {
			return;
		}

		EventHelper.stop(e, true);

		// Pointer moves come once a frame: what follows them writes styles and reads nothing
		this.follow(e.clientX, e.clientY);
		this.retarget(e.clientX, e.clientY);
	}

	private onPointerUp(e: PointerEvent): void {
		if (this.phase === 'pending') {
			this.onDidEnd(); // a click
			return;
		}

		if (this.phase !== 'dragging') {
			return;
		}

		EventHelper.stop(e, true);
		this.retarget(e.clientX, e.clientY);

		const bounds = this.reflow!.containerRect;
		const inside = e.clientX >= bounds.left && e.clientX <= bounds.left + bounds.width && e.clientY >= bounds.top && e.clientY <= bounds.top + bounds.height;
		const drop = this.current.drop;
		if (!drop || !inside) {
			this.cancel();
			return;
		}

		this.commit(drop);
	}

	//#region Lift

	private lift(): void {
		this.phase = 'dragging';
		const motion = this.host.isMotionEnabled();
		const reflow = this.reflow = new PartGridReflow(this.host.container, this.host.getVisibleCells(), motion, this.draggedCell.id);
		const dragged = this.dragged = reflow.states.get(this.draggedCell.id);
		if (motion && dragged) {
			const start = dragged.start;
			this.centerOffset = { x: (start.left + start.width / 2 - this.startX) * LIFT_SCALE, y: (start.top + start.height / 2 - this.startY) * LIFT_SCALE };
		}

		// The cursor grabs over the whole window: one layer over it, rather than a cursor on every element
		const container = this.host.container;
		const cursor = this.cursor;
		cursor.classList.remove('part-grid-drag-pending');
		container.classList.add('part-grid-card-dragging');
		this.visuals.add(toDisposable(() => { cursor.remove(); container.classList.remove('part-grid-card-dragging'); }));

		if (!motion || !dragged) {
			this.indicator = append(this.host.container, $('.part-grid-drop-indicator.part'));
			this.indicator.style.display = 'none';
			this.indicator.style.borderRadius = dragged?.look.radius ?? '';
			return;
		}

		this.topLayer = append(this.host.container, $('.part-grid-motion-layer'));

		// The lifted card: the cell itself, which shows what it shows as it moves, a placeholder for what draws over it
		const element = dragged.cell.element;
		element.style.transformOrigin = `${this.startX - dragged.cellStart.left}px ${this.startY - dragged.cellStart.top}px`;
		element.classList.add('part-grid-lifted');

		// The card lifts in the next frame, from where it is
		this.visuals.add(scheduleAtNextAnimationFrame(this.targetWindow, () => {
			if (this.phase === 'dragging') {
				this.getLifted().style.scale = `${LIFT_SCALE}`;
			}
		}));
	}

	/**
	 * Where the center of the lifted card is for a pointer, inside the window.
	 */
	private probe(x: number, y: number): [number, number] {
		const bounds = this.reflow!.containerRect;
		const clamp = (value: number, min: number, size: number) => Math.min(Math.max(value, min), min + size);
		return [clamp(x + this.centerOffset.x, bounds.left, bounds.width), clamp(y + this.centerOffset.y, bounds.top, bounds.height)];
	}

	private getLifted(): HTMLElement {
		return this.liftedGhost ?? this.draggedCell.element;
	}

	private follow(x: number, y: number): void {
		if (this.motion) {
			this.getLifted().style.translate = `${x - this.startX}px ${y - this.startY}px`;
		}
	}

	private createGhost(state: IPartGridReflowCellState): HTMLElement {
		const ghost = append(this.topLayer!, $(`.part-grid-motion-card.part-grid-lifted-card.${PART_GRID_MOTION_CLASS}`));
		ghost.style.setProperty('--part-grid-motion-radius', state.look.radius);
		if (state.look.background) {
			ghost.style.setProperty('--part-grid-motion-background', state.look.background);
		}
		ghost.style.left = `${state.start.left}px`;
		ghost.style.top = `${state.start.top}px`;
		ghost.style.width = `${state.start.width}px`;
		ghost.style.height = `${state.start.height}px`;
		ghost.style.transformOrigin = `${this.startX - state.start.left}px ${this.startY - state.start.top}px`;

		return ghost;
	}

	//#endregion

	//#region Where it goes

	/**
	 * Where the card goes for the pointer, among the cards where they show:
	 * to an edge of the window where the pointer is near it, else beside or
	 * into the part under the center of the card. Over where it shows itself,
	 * or outside the window, where it goes does not change.
	 */
	private resolve(x: number, y: number): Resolved {
		const reflow = this.reflow!;
		const id = this.draggedCell.id;
		const rects = Array.from(reflow.shown, ([cellId, rect]) => ({ id: cellId, rect }));
		const canMerge = (targetId: string) => targetId === id || this.host.canMerge(id, targetId);

		// An edge of the window, where the pointer pushes the card; over itself, only once it first left where it started, as it lifts there
		const atPointer = getPartGridDropAt(x, y, reflow.containerRect, rects);
		if (atPointer && hasKey(atPointer, { location: true }) && hasKey(atPointer.location, { edge: true })) {
			return this.isOverSlot(x, y) && !this.leftStart ? { kind: 'keep' } : { kind: 'drop', key: keyOf({ location: atPointer.location }), drop: { location: atPointer.location } };
		}

		// Beside or into a part: where the center of the card is
		const [cx, cy] = this.probe(x, y);
		if (this.isOverSlot(cx, cy)) {
			return { kind: 'keep' }; // over itself, it is there already
		}

		const drop = getPartGridDropAt(cx, cy, reflow.containerRect, rects, undefined, canMerge);
		if (!drop) {
			return { kind: 'keep' };
		}

		if (hasKey(drop, { merge: true })) {
			return drop.merge === id ? { kind: 'keep' } : { kind: 'drop', key: keyOf({ merge: drop.merge }), drop: { merge: drop.merge } };
		}

		if (hasKey(drop.location, { reference: true }) && drop.location.reference === id) {
			return { kind: 'keep' };
		}

		return { kind: 'drop', key: keyOf({ location: drop.location }), drop: { location: drop.location } };
	}

	private isOverSlot(x: number, y: number): boolean {
		const slot = this.reflow?.shown.get(this.draggedCell.id);
		return !!slot && x >= slot.left && x <= slot.left + slot.width && y >= slot.top && y <= slot.top + slot.height;
	}

	/**
	 * Goes elsewhere only once the pointer is {@link PART_GRID_DROP_HYSTERESIS}
	 * away from the zone of where it goes now.
	 */
	private retarget(x: number, y: number): void {
		const reflow = this.reflow;
		if (!reflow) {
			return;
		}

		if (!this.leftStart && (Math.hypot(x - this.startX, y - this.startY) > PART_GRID_LIFT_DISTANCE || !this.isOverSlot(...this.probe(x, y)))) {
			this.leftStart = true;
		}

		const candidate = this.resolve(x, y);
		if (candidate.kind === 'keep' || candidate.key === this.current.key) {
			return;
		}

		if (isNearZone(reflow.containerRect, x, y, (nx, ny) => { const near = this.resolve(nx, ny); return near.kind === 'drop' && near.key === this.current.key; })) {
			return;
		}

		// Merging, the cards stay as they are as the card lifted, the part it merges into highlighted: what the merge changes shows once it is done
		const merge = hasKey(candidate.drop, { merge: true }) ? candidate.drop.merge : undefined;
		const rects = merge === undefined ? this.host.previewArrangement(this.draggedCell.id, candidate.drop) : undefined;
		if (merge === undefined && !rects) {
			return;
		}

		this.current = { key: candidate.key, drop: candidate.drop };
		if (this.motion) {
			// The zones follow the cards to where they show
			reflow.show(rects, this.draggedCell.id, merge);
		} else {
			this.showSlot(merge !== undefined ? reflow.states.get(merge)?.start : rects?.get(this.draggedCell.id), merge !== undefined);
		}
	}

	private showSlot(rect: IPartGridRect | undefined, merge: boolean): void {
		const indicator = this.indicator;
		if (!indicator) {
			return;
		}

		indicator.classList.toggle('merge', merge);
		if (!rect) {
			indicator.style.display = 'none';
			return;
		}

		indicator.style.left = `${rect.left}px`;
		indicator.style.top = `${rect.top}px`;
		indicator.style.width = `${rect.width}px`;
		indicator.style.height = `${rect.height}px`;
		indicator.style.display = '';
	}

	//#endregion

	//#region Drop

	/**
	 * Settles the dropped card into its slot, where the other cards already
	 * show as they will be, then moves the part, once: what lays out again
	 * with the move, which can take a while, does so once nothing moves.
	 */
	private commit(drop: PartGridCardDrop): void {
		const id = this.draggedCell.id;
		const reflow = this.reflow;
		const lifted = this.dragged;
		if (!this.motion || !reflow || !lifted) {
			this.cleanUp();
			try {
				this.host.drop(id, drop);
			} finally {
				this.onDidEnd();
			}
			return;
		}

		this.phase = 'settling';
		this.pendingDrop = drop;
		const merge = hasKey(drop, { merge: true }) ? drop.merge : undefined;

		if (merge !== undefined) {
			// A part that merges goes away: a plain card goes into the part it merges into, and fades
			reflow.fill();
			const target = reflow.shown.get(merge) ?? reflow.states.get(merge)?.start;
			if (!this.liftedGhost) {
				this.liftedGhost = this.createGhost(lifted);
				this.liftedGhost.style.translate = lifted.cell.element.style.translate;
				this.liftedGhost.style.scale = `${LIFT_SCALE}`;
				lifted.cell.element.style.visibility = 'hidden';
			}
			if (target) {
				this.settleGhost(this.liftedGhost, lifted.start, target);
			}
			this.liftedGhost.style.opacity = '0';
		} else {
			reflow.fill();
			const slot = reflow.shown.get(id);
			if (slot && this.liftedGhost) {
				this.settleGhost(this.liftedGhost, lifted.start, slot);
			} else if (slot) {
				// Its content shows over its slot as the other cards' does, until the move lays it out there
				lifted.cell.element.style.scale = '';
				reflow.placeCell(lifted, slot);
			}
		}

		this.settleTimer = setTimeout(() => this.finish(), PART_GRID_REFLOW_DURATION + 30);
	}

	/**
	 * Moves the part, as dropped, and shows the cards as laid out: they are
	 * where they show already.
	 */
	private finish(): void {
		const drop = this.pendingDrop;
		this.pendingDrop = undefined;
		// A drop that fails still ends the drag: nothing of it stays over the window, and another can start
		try {
			if (drop && hasKey(drop, { merge: true })) {
				// The cards are as they were: the merge, once they show so, glides them to where it puts them
				this.cleanUp();
				this.host.drop(this.draggedCell.id, drop);
			} else if (drop) {
				// The move lays out the cards where they show; what it does not lay out, the clean up does
				this.host.drop(this.draggedCell.id, drop);
			}
		} catch (error) {
			onUnexpectedError(error); // it settles from a timer, where nothing else would report it
		} finally {
			this.cleanUp();
			this.onDidEnd();
		}
	}

	/**
	 * Moves a plain card that was over `start` to over `target`, scaled
	 * about its top left.
	 */
	private settleGhost(ghost: HTMLElement, start: IPartGridRect, target: IPartGridRect): void {
		ghost.style.transformOrigin = '0 0';
		ghost.style.translate = `${target.left - start.left}px ${target.top - start.top}px`;
		ghost.style.scale = `${target.width / Math.max(1, start.width)} ${target.height / Math.max(1, start.height)}`;
	}

	/**
	 * Puts everything back where it was: the cards slide back, and the lifted
	 * card glides back into its place.
	 */
	private cancel(): void {
		if (this.phase !== 'dragging' || !this.motion) {
			this.onDidEnd();
			return;
		}

		this.phase = 'settling';
		this.current = { key: NONE, drop: undefined };
		this.reflow?.restore();

		const lifted = this.getLifted().style;
		lifted.translate = '';
		lifted.scale = '';

		this.settleTimer = setTimeout(() => this.onDidEnd(), PART_GRID_REFLOW_DURATION + 30);
	}

	private cleanUp(): void {
		if (this.settleTimer !== undefined) {
			clearTimeout(this.settleTimer);
			this.settleTimer = undefined;
		}

		this.reflow?.dispose();
		this.reflow = undefined;
		this.dragged = undefined;
		this.topLayer?.remove();
		this.topLayer = undefined;
		this.indicator?.remove();
		this.indicator = undefined;
		this.liftedGhost = undefined;
		this.visuals.clear();
	}

	//#endregion
}

/**
 * Whether a point is within {@link PART_GRID_DROP_HYSTERESIS} of a zone,
 * as `inZone` says for points around it, inside the window.
 */
export function isNearZone(bounds: IPartGridRect, x: number, y: number, inZone: (x: number, y: number) => boolean): boolean {
	const clamp = (value: number, min: number, size: number) => Math.min(Math.max(value, min), min + size);
	const h = PART_GRID_DROP_HYSTERESIS;
	return [[h, 0], [-h, 0], [0, h], [0, -h]].some(([dx, dy]) => inZone(clamp(x + dx, bounds.left, bounds.width), clamp(y + dy, bounds.top, bounds.height)));
}
