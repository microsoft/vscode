/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventHelper, EventType, getWindow, prepend } from '../../../../base/browser/dom.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import type { IPartGridRect, PartGridLocation } from './partGrid.js';
import { getPartGridDropAt } from './partGridDnd.js';
import { hasNativeContent, PART_GRID_MOTION_CLASS, unclipCells } from './partGridMotion.js';

/**
 * How long cards take to make way for a dragged card, and it to settle, in
 * milliseconds.
 */
export const PART_GRID_REFLOW_DURATION = 200;

/**
 * How far, in pixels, the pointer moves before a card lifts, so that a
 * click does not drag it.
 */
export const PART_GRID_DRAG_THRESHOLD = 4;

/**
 * How far, in pixels, the pointer goes past the border of the zone of
 * where a card goes before it goes elsewhere, so that it does not flip
 * between two places at their border.
 */
export const PART_GRID_DROP_HYSTERESIS = 8;

/**
 * The scale of a lifted card.
 */
const LIFT_SCALE = 0.98;

/**
 * Where a dragged card goes: to a location in the grid, or into the part of
 * another card (a merge).
 */
export type PartGridCardDrop = { readonly location: PartGridLocation } | { readonly merge: string };

/**
 * A cell that shows, as the card drag sees it.
 */
export interface IPartGridCardDragCell {
	readonly id: string;
	readonly element: HTMLElement;
	readonly card: HTMLElement;

	/**
	 * Whether the cell is a part, which a card can go beside or merge into.
	 */
	readonly isPart: boolean;

	/**
	 * Hides or shows what the cell shows, such as what draws over the window
	 * rather than in it, while its card moves as a plain card.
	 */
	setContentVisible(visible: boolean): void;
}

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

		this.session.clear(); // a card still settling settles at once
		const session = new CardDragSession(this.host, cell, e, () => {
			if (this.session.value === session) {
				this.session.clear();
			}
		});
		this.session.value = session;

		return true;
	}
}

interface ICellState {
	readonly cell: IPartGridCardDragCell;

	/** Where its card was as the drag started. */
	readonly start: IPartGridRect;

	/** Where its cell was as the drag started. */
	readonly cellStart: IPartGridRect;

	/** Whether what it shows draws over the window, hidden while its card moves as a plain card. */
	readonly native: boolean;

	/** The card under the cell's content that shows where its card is going. */
	frame?: HTMLElement;
}

type Resolved =
	{ readonly kind: 'keep' } |
	{ readonly kind: 'drop'; readonly key: string; readonly drop: PartGridCardDrop };

const NONE = 'none';

function keyOf(drop: PartGridCardDrop): string {
	return JSON.stringify(drop);
}

function sameRect(a: IPartGridRect, b: IPartGridRect): boolean {
	return Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
}

function rectOf(element: HTMLElement): IPartGridRect {
	const { left, top, width, height } = element.getBoundingClientRect();
	return { left, top, width, height };
}

function isTransparent(color: string): boolean {
	return !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
}

/**
 * One drag of a card:
 * - it lifts once the pointer moves, a slightly smaller copy with a shadow
 *   that follows the pointer by transforms only;
 * - where it goes changes only once the pointer is some way into another
 *   zone (see {@link PART_GRID_DROP_HYSTERESIS}); the zones are those of the
 *   cards where they show, not where they were, so that where it goes does
 *   not flip under the pointer;
 * - for each place it goes, a dry run of the move finds where every card
 *   goes, once, and the other cards slide there, a running slide going on
 *   from where it is to where it now goes;
 * - dropped, the grid moves the part once, and the card settles into its
 *   place from where it was lifted.
 * Without motion, no card lifts or slides: where the card goes shows as a
 * slot, and the drop moves the part at once.
 */
class CardDragSession extends Disposable {

	private readonly targetWindow: Window;
	private readonly startX: number;
	private readonly startY: number;

	private phase: 'pending' | 'dragging' | 'settling' = 'pending';
	private motion = false;

	private containerRect: IPartGridRect = { left: 0, top: 0, width: 0, height: 0 };
	private readonly states = new Map<string, ICellState>();
	private dragged: ICellState | undefined;

	/** Where it goes, by its key, and where the cards show for it. */
	private current: { readonly key: string; readonly drop: PartGridCardDrop | undefined } = { key: NONE, drop: undefined };
	private visual = new Map<string, IPartGridRect>();

	private readonly visuals = this._register(new DisposableStore());
	private frameLayer: HTMLElement | undefined;
	private topLayer: HTMLElement | undefined;
	private slot: HTMLElement | undefined;
	private indicator: HTMLElement | undefined;
	private liftedGhost: HTMLElement | undefined;
	private settleTimer: ReturnType<typeof setTimeout> | undefined;
	private radius = '0px';

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

		this._register(addDisposableListener(this.targetWindow, EventType.POINTER_MOVE, e => this.onPointerMove(e), true));
		this._register(addDisposableListener(this.targetWindow, EventType.POINTER_UP, e => this.onPointerUp(e), true));
		this._register(addDisposableListener(this.targetWindow, 'pointercancel', () => this.cancel(), true));
		if (target) {
			this._register(addDisposableListener(target, 'lostpointercapture', () => this.isDragging ? this.cancel() : undefined));
		}
		this._register(addDisposableListener(this.targetWindow, EventType.KEY_DOWN, e => {
			if (this.phase !== 'settling' && new StandardKeyboardEvent(e).equals(KeyCode.Escape)) {
				EventHelper.stop(e, true);
				this.cancel();
			}
		}, true));
		this._register(toDisposable(() => this.cleanUp()));
	}

	get isDragging(): boolean {
		return this.phase === 'dragging';
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

		const inside = e.clientX >= this.containerRect.left && e.clientX <= this.containerRect.left + this.containerRect.width && e.clientY >= this.containerRect.top && e.clientY <= this.containerRect.top + this.containerRect.height;
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
		this.motion = this.host.isMotionEnabled();
		this.containerRect = rectOf(this.host.container);

		// Where everything is as the drag starts, read once
		for (const cell of this.host.getVisibleCells()) {
			const state: ICellState = { cell, start: rectOf(cell.card), cellStart: rectOf(cell.element), native: this.motion && hasNativeContent(cell.element) };
			this.states.set(cell.id, state);
		}
		this.dragged = this.states.get(this.draggedCell.id);
		this.visual = this.getPartRects(new Map(Array.from(this.states.values(), state => [state.cell.id, state.start])));

		this.radius = getWindow(this.draggedCell.card).getComputedStyle(this.draggedCell.card).borderTopLeftRadius;
		this.host.container.classList.add('part-grid-card-dragging');
		this.visuals.add(toDisposable(() => this.host.container.classList.remove('part-grid-card-dragging')));

		if (!this.motion) {
			this.indicator = append(this.host.container, $('.part-grid-drop-indicator.part'));
			this.indicator.style.display = 'none';
			this.indicator.style.borderRadius = this.radius;
			return;
		}

		const dragged = this.dragged;
		if (!dragged) {
			return;
		}

		this.visuals.add(unclipCells(this.host.container, Array.from(this.states.values(), state => state.cell.element)));

		// The frames of the cards are under the cells: they show where each card goes
		this.frameLayer = prepend(this.host.container, $('.part-grid-frame-layer'));
		this.topLayer = append(this.host.container, $('.part-grid-motion-layer'));

		for (const state of this.states.values()) {
			if (state.native) {
				// What draws over the window does not move with the cell: its card moves as a plain card
				state.cell.setContentVisible(false);
				state.cell.element.style.visibility = 'hidden';
			}
			if (state !== dragged) {
				state.cell.element.style.setProperty('--part-grid-frame-radius', getWindow(state.cell.card).getComputedStyle(state.cell.card).borderTopLeftRadius);
				state.frame = this.createFrame(state.cell.card);
				this.placeFrame(state.frame, state.start);
				state.cell.element.classList.add('part-grid-reflow');
			}
		}

		this.slot = this.createFrame(undefined);
		this.slot.classList.add('slot');
		this.placeFrame(this.slot, dragged.start);

		// The lifted card: the cell itself, which shows what it shows as it moves, or, for what draws over the window, a plain card
		if (dragged.native) {
			this.liftedGhost = this.createGhost(dragged);
		} else {
			const element = dragged.cell.element;
			element.style.transformOrigin = `${this.startX - dragged.cellStart.left}px ${this.startY - dragged.cellStart.top}px`;
			element.classList.add('part-grid-lifted');
		}

		// With one style flush, everything starts where it is, then moves
		void this.host.container.offsetWidth;
		this.host.container.classList.add('part-grid-reflowing');
		this.getLifted().style.scale = `${LIFT_SCALE}`;
	}

	private getLifted(): HTMLElement {
		return this.liftedGhost ?? this.draggedCell.element;
	}

	private follow(x: number, y: number): void {
		if (this.motion) {
			this.getLifted().style.translate = `${x - this.startX}px ${y - this.startY}px`;
		}
	}

	//#endregion

	//#region Where it goes

	/**
	 * The cards of the parts, where they show, as zones.
	 */
	private getPartRects(rects: ReadonlyMap<string, IPartGridRect>): Map<string, IPartGridRect> {
		const parts = new Map<string, IPartGridRect>();
		for (const [id, rect] of rects) {
			if (this.states.get(id)?.cell.isPart) {
				parts.set(id, rect);
			}
		}

		return parts;
	}

	/**
	 * Where the card goes for a point of the window, among the cards where
	 * they show: over where it shows itself, or over the center of a part it does not merge
	 * into, or outside the window, where it goes does not change.
	 */
	private resolve(x: number, y: number): Resolved {
		const id = this.draggedCell.id;
		const slot = this.visual.get(id);
		if (slot && x >= slot.left && x <= slot.left + slot.width && y >= slot.top && y <= slot.top + slot.height) {
			return { kind: 'keep' }; // over itself, also at an edge of the window: it is there already
		}

		const rects = Array.from(this.visual, ([cellId, rect]) => ({ id: cellId, rect }));
		const drop = getPartGridDropAt(x, y, this.containerRect, rects, undefined, targetId => targetId === id || this.host.canMerge(id, targetId));
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

	/**
	 * Goes elsewhere only once the pointer is {@link PART_GRID_DROP_HYSTERESIS}
	 * away from the zone of where it goes now.
	 */
	private retarget(x: number, y: number): void {
		const candidate = this.resolve(x, y);
		if (candidate.kind === 'keep' || candidate.key === this.current.key) {
			return;
		}

		const bounds = this.containerRect;
		const clamp = (value: number, min: number, size: number) => Math.min(Math.max(value, min), min + size);
		const h = PART_GRID_DROP_HYSTERESIS;
		for (const [dx, dy] of [[h, 0], [-h, 0], [0, h], [0, -h]]) {
			const near = this.resolve(clamp(x + dx, bounds.left, bounds.width), clamp(y + dy, bounds.top, bounds.height));
			if (near.kind === 'drop' && near.key === this.current.key) {
				return;
			}
		}

		const rects = this.host.previewArrangement(this.draggedCell.id, candidate.drop);
		if (!rects) {
			return;
		}

		this.current = { key: candidate.key, drop: candidate.drop };
		if (this.motion) {
			// The zones follow the cards to where they show
			this.visual = this.getPartRects(rects);
			this.reflow(rects);
		} else {
			this.showSlot(rects);
		}
	}

	private showSlot(rects: ReadonlyMap<string, IPartGridRect>): void {
		const indicator = this.indicator;
		if (!indicator) {
			return;
		}

		const drop = this.current.drop;
		const merge = drop && hasKey(drop, { merge: true }) ? drop.merge : undefined;
		const rect = merge !== undefined ? this.states.get(merge)?.start : rects.get(this.draggedCell.id);
		indicator.classList.toggle('merge', merge !== undefined);
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

	//#region Reflow

	/**
	 * Slides the other cards to where they go. A card in a slide changes
	 * where it slides to, from where it is.
	 */
	private reflow(rects: ReadonlyMap<string, IPartGridRect>): void {
		for (const state of this.states.values()) {
			if (state === this.dragged) {
				continue;
			}

			const rect = rects.get(state.cell.id);
			this.placeCell(state, rect);
			if (state.frame) {
				this.placeFrame(state.frame, rect);
			}
		}

		const drop = this.current.drop;
		const merge = drop && hasKey(drop, { merge: true }) ? drop.merge : undefined;
		if (this.slot) {
			this.placeFrame(this.slot, merge === undefined ? rects.get(this.draggedCell.id) : undefined);
		}
		this.showMergeTarget(merge !== undefined ? rects.get(merge) : undefined);
	}

	/**
	 * Shows the content of a cell over where its card goes: moved there, and
	 * clipped to its size there if smaller. Its card frame shows the rest.
	 */
	private placeCell(state: ICellState, rect: IPartGridRect | undefined): void {
		const style = state.cell.element.style;
		if (!rect) {
			style.opacity = '0';
			return;
		}

		style.opacity = '';
		const start = state.start;
		const dx = rect.left - start.left;
		const dy = rect.top - start.top;
		style.translate = dx || dy ? `${dx}px ${dy}px` : '';

		const insetLeft = start.left - state.cellStart.left;
		const insetTop = start.top - state.cellStart.top;
		const right = state.cellStart.width - insetLeft - Math.min(start.width, rect.width);
		const bottom = state.cellStart.height - insetTop - Math.min(start.height, rect.height);
		style.clipPath = `inset(${insetTop}px ${right}px ${bottom}px ${insetLeft}px round var(--part-grid-frame-radius, 0px))`;
	}

	private showMergeTarget(rect: IPartGridRect | undefined): void {
		if (!rect) {
			this.indicator?.remove();
			this.indicator = undefined;
			return;
		}

		this.indicator ??= append(this.host.container, $('.part-grid-drop-indicator.part.merge'));
		this.indicator.style.borderRadius = this.radius;
		this.indicator.style.left = `${rect.left}px`;
		this.indicator.style.top = `${rect.top}px`;
		this.indicator.style.width = `${rect.width}px`;
		this.indicator.style.height = `${rect.height}px`;
	}

	/**
	 * A card frame: the size of the window, clipped to where the card is,
	 * so that it changes where it goes by its clip only. It takes the look
	 * of the card, or, without one, of a plain card. What draws over the
	 * window hides meanwhile, so that the frames of its cards show.
	 */
	private createFrame(card: HTMLElement | undefined): HTMLElement {
		const frame = append(this.frameLayer!, $('.part-grid-frame'));
		append(frame, $('.part-grid-frame-fill'));
		const bounds = this.containerRect;
		frame.style.left = `${bounds.left}px`;
		frame.style.top = `${bounds.top}px`;
		frame.style.width = `${bounds.width}px`;
		frame.style.height = `${bounds.height}px`;

		const look = card ? getWindow(card).getComputedStyle(card) : undefined;
		if (look) {
			frame.style.setProperty('--part-grid-frame-radius', look.borderTopLeftRadius);
			if (!isTransparent(look.backgroundColor)) {
				frame.style.setProperty('--part-grid-frame-background', look.backgroundColor);
			}
			if (parseFloat(look.borderTopWidth) > 0 && !isTransparent(look.borderTopColor)) {
				frame.style.setProperty('--part-grid-frame-border', look.borderTopColor);
			}
		}

		return frame;
	}

	private placeFrame(frame: HTMLElement, rect: IPartGridRect | undefined): void {
		if (!rect) {
			frame.style.opacity = '0';
			return;
		}

		const bounds = this.containerRect;
		const top = rect.top - bounds.top;
		const right = bounds.left + bounds.width - rect.left - rect.width;
		const bottom = bounds.top + bounds.height - rect.top - rect.height;
		const left = rect.left - bounds.left;
		frame.style.opacity = '';
		frame.style.setProperty('--part-grid-frame-clip', `inset(${top}px ${right}px ${bottom}px ${left}px round var(--part-grid-frame-radius, 0px))`);
		frame.style.setProperty('--part-grid-frame-fill-clip', `inset(${top + 1}px ${right + 1}px ${bottom + 1}px ${left + 1}px round max(0px, calc(var(--part-grid-frame-radius, 0px) - 1px)))`);
	}

	private createGhost(state: ICellState): HTMLElement {
		const ghost = append(this.topLayer!, $(`.part-grid-motion-card.part-grid-lifted-card.${PART_GRID_MOTION_CLASS}`));
		const look = getWindow(state.cell.card).getComputedStyle(state.cell.card);
		ghost.style.setProperty('--part-grid-motion-radius', look.borderTopLeftRadius);
		if (!isTransparent(look.backgroundColor)) {
			ghost.style.setProperty('--part-grid-motion-background', look.backgroundColor);
		}
		ghost.style.left = `${state.start.left}px`;
		ghost.style.top = `${state.start.top}px`;
		ghost.style.width = `${state.start.width}px`;
		ghost.style.height = `${state.start.height}px`;
		ghost.style.transformOrigin = `${this.startX - state.start.left}px ${this.startY - state.start.top}px`;

		return ghost;
	}

	//#endregion

	//#region Drop

	/**
	 * Moves the part once, then settles the cards from where they show to
	 * where the move put them.
	 */
	private commit(drop: PartGridCardDrop): void {
		const id = this.draggedCell.id;
		if (!this.motion) {
			this.cleanUp();
			this.host.drop(id, drop);
			this.onDidEnd();
			return;
		}

		this.phase = 'settling';
		const merge = hasKey(drop, { merge: true }) ? drop.merge : undefined;

		// Where the cards show, read once before the move
		const shown = new Map<string, IPartGridRect>();
		for (const state of this.states.values()) {
			shown.set(state.cell.id, rectOf(state === this.dragged && this.liftedGhost ? this.liftedGhost : state.cell.card));
		}

		// A part that merges goes away with the move: a plain card goes into the part it merges into
		const lifted = this.dragged;
		if (merge !== undefined && lifted && !this.liftedGhost) {
			this.liftedGhost = this.createGhost(lifted);
			const from = shown.get(id)!;
			this.liftedGhost.style.transformOrigin = '0 0';
			this.liftedGhost.style.translate = `${from.left - lifted.start.left}px ${from.top - lifted.start.top}px`;
			this.liftedGhost.style.scale = `${LIFT_SCALE}`;
			lifted.cell.element.style.visibility = 'hidden';
		}

		this.host.drop(id, drop);

		// The cards that are where they show stay; those still sliding glide on from where they show
		const container = this.host.container;
		container.classList.remove('part-grid-reflowing', 'part-grid-card-dragging');
		this.slot?.remove();
		for (const state of this.states.values()) {
			if (!state.native) {
				state.frame?.remove(); // the card shows its own look again
			}
		}
		this.indicator?.remove();
		this.indicator = undefined;

		const moved: { readonly element: HTMLElement; readonly from: IPartGridRect; readonly card: HTMLElement; readonly lifted: boolean }[] = [];
		for (const state of this.states.values()) {
			const style = state.cell.element.style;
			state.cell.element.classList.remove('part-grid-reflow', 'part-grid-lifted');
			style.translate = style.scale = style.clipPath = style.opacity = style.transformOrigin = '';
			if (state.native && state !== this.dragged) {
				continue; // shows again once settled
			}
			if (state === this.dragged && (merge !== undefined || this.liftedGhost)) {
				continue;
			}
			moved.push({ element: state.cell.element, from: shown.get(state.cell.id)!, card: state.cell.card, lifted: state === this.dragged });
		}

		// Read where they went once, then write where each starts
		const settled = moved.map(entry => ({ ...entry, to: rectOf(entry.card), cell: rectOf(entry.element) }));
		for (const { element, from, to, cell, lifted } of settled) {
			if (!lifted && sameRect(from, to)) {
				continue;
			}

			// Scaled about the top left of its card, uniformly, so that what it shows is not stretched
			const scale = lifted ? Math.min(from.width / Math.max(1, to.width), from.height / Math.max(1, to.height)) : 1;
			element.style.transformOrigin = `${to.left - cell.left}px ${to.top - cell.top}px`;
			element.style.translate = `${from.left - to.left}px ${from.top - to.top}px`;
			element.style.scale = scale !== 1 ? `${scale}` : '';
			element.classList.add('part-grid-settle');
		}

		const ghost = this.liftedGhost;
		const ghostTarget = merge !== undefined ? this.states.get(merge)?.start : undefined;
		const draggedTo = lifted && this.liftedGhost && merge === undefined ? rectOf(lifted.cell.card) : undefined;

		void container.offsetWidth;
		container.classList.add('part-grid-settling');
		for (const { element } of settled) {
			element.style.translate = element.style.scale = '';
		}

		if (ghost && lifted) {
			const to = merge !== undefined ? (ghostTarget ?? lifted.start) : draggedTo ?? lifted.start;
			ghost.style.transformOrigin = '0 0';
			ghost.style.translate = `${to.left - lifted.start.left}px ${to.top - lifted.start.top}px`;
			ghost.style.scale = `${to.width / Math.max(1, lifted.start.width)} ${to.height / Math.max(1, lifted.start.height)}`;
			if (merge !== undefined) {
				ghost.style.opacity = '0';
			}
		}

		this.settleTimer = setTimeout(() => this.onDidEnd(), PART_GRID_REFLOW_DURATION + 30);
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
		this.host.container.classList.add('part-grid-settling');
		for (const state of this.states.values()) {
			if (state !== this.dragged) {
				this.placeCell(state, state.start);
				if (state.frame) {
					this.placeFrame(state.frame, state.start);
				}
			}
		}
		if (this.dragged && this.slot) {
			this.placeFrame(this.slot, this.dragged.start);
		}
		this.showMergeTarget(undefined);

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

		const container = this.host.container;
		container.classList.remove('part-grid-reflowing', 'part-grid-settling');
		for (const state of this.states.values()) {
			const element = state.cell.element;
			element.classList.remove('part-grid-reflow', 'part-grid-lifted', 'part-grid-settle');
			const style = element.style;
			style.translate = style.scale = style.clipPath = style.opacity = style.transformOrigin = style.visibility = '';
			style.removeProperty('--part-grid-frame-radius');
			if (state.native) {
				state.cell.setContentVisible(true);
			}
		}
		this.states.clear();

		this.frameLayer?.remove();
		this.frameLayer = undefined;
		this.topLayer?.remove();
		this.topLayer = undefined;
		this.indicator?.remove();
		this.indicator = undefined;
		this.liftedGhost = undefined;
		this.slot = undefined;
		this.visuals.clear();
	}

	//#endregion
}
