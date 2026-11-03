/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventHelper, EventType, getWindow, prepend, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
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
 * The size of the watermark in the slot of a dragged card, in pixels, at
 * most.
 */
const SLOT_WATERMARK_SIZE = 128;

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

	/** The look of its card, read as the drag starts. */
	readonly look: ICardLook;

	/** The card under the cell's content that shows where its card is going. */
	frame?: HTMLElement;
}

interface ICardLook {
	readonly radius: string;
	readonly background: string | undefined;
	readonly border: string | undefined;
}

function readLook(card: HTMLElement): ICardLook {
	const look = getWindow(card).getComputedStyle(card);
	return {
		radius: look.borderTopLeftRadius,
		background: isTransparent(look.backgroundColor) ? undefined : look.backgroundColor,
		border: parseFloat(look.borderTopWidth) > 0 && !isTransparent(look.borderTopColor) ? look.borderTopColor : undefined
	};
}

type Resolved =
	{ readonly kind: 'keep' } |
	{ readonly kind: 'drop'; readonly key: string; readonly drop: PartGridCardDrop };

const NONE = 'none';

function keyOf(drop: PartGridCardDrop): string {
	return JSON.stringify(drop);
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
	private watermark: HTMLElement | undefined;

	/**
	 * From the pointer to the center of the lifted card, where it shows: where
	 * the card goes is found there, not under the pointer, which holds the
	 * card by its edge.
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
		// A drop that still settles, such as when another drag starts, moves the part at once
		this._register(toDisposable(() => this.pendingDrop ? this.finish() : this.cleanUp()));
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

		// Where everything is as the drag starts, and how it looks, read once, before anything is written
		for (const cell of this.host.getVisibleCells()) {
			const state: ICellState = { cell, start: rectOf(cell.card), cellStart: rectOf(cell.element), native: this.motion && hasNativeContent(cell.element), look: readLook(cell.card) };
			this.states.set(cell.id, state);
		}
		this.dragged = this.states.get(this.draggedCell.id);
		this.visual = this.getPartRects(new Map(Array.from(this.states.values(), state => [state.cell.id, state.start])));
		this.radius = this.dragged?.look.radius ?? '0px';
		if (this.motion && this.dragged) {
			const start = this.dragged.start;
			this.centerOffset = { x: (start.left + start.width / 2 - this.startX) * LIFT_SCALE, y: (start.top + start.height / 2 - this.startY) * LIFT_SCALE };
		}

		this.host.container.classList.add('part-grid-card-dragging');
		this.visuals.add(toDisposable(() => this.host.container.classList.remove('part-grid-card-dragging')));

		// The cursor grabs over the whole window: one layer over it, rather than a cursor on every element
		const cursor = append(this.host.container, $('.part-grid-drag-cursor'));
		this.visuals.add(toDisposable(() => cursor.remove()));

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
			state.cell.element.style.setProperty('--part-grid-frame-radius', state.look.radius);
			if (state !== dragged) {
				state.frame = this.createFrame(state.look);
				this.placeFrame(state.frame, state.start);
				state.cell.element.classList.add('part-grid-reflow');
			}
		}

		// Where it goes: an empty card, with the watermark of an empty editor
		this.slot = this.createFrame(dragged.look);
		this.slot.classList.add('slot');
		this.watermark = append(this.frameLayer, $('.part-grid-slot-watermark'));
		this.watermark.style.left = `${this.containerRect.left}px`;
		this.watermark.style.top = `${this.containerRect.top}px`;
		this.placeSlot(dragged.start);

		// The lifted card: the cell itself, which shows what it shows as it moves, or, for what draws over the window, a plain card
		if (dragged.native) {
			this.liftedGhost = this.createGhost(dragged);
		} else {
			const element = dragged.cell.element;
			element.style.transformOrigin = `${this.startX - dragged.cellStart.left}px ${this.startY - dragged.cellStart.top}px`;
			element.classList.add('part-grid-lifted');
		}

		// Everything starts where it is; the card lifts in the next frame, from where it is
		this.host.container.classList.add('part-grid-reflowing');
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
		const bounds = this.containerRect;
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
	 * Where the card goes for the pointer, among the cards where they show:
	 * to an edge of the window where the pointer is near it, else beside or
	 * into the part under the center of the card. Over where it shows itself,
	 * or outside the window, where it goes does not change.
	 */
	private resolve(x: number, y: number): Resolved {
		const id = this.draggedCell.id;
		const rects = Array.from(this.visual, ([cellId, rect]) => ({ id: cellId, rect }));
		const canMerge = (targetId: string) => targetId === id || this.host.canMerge(id, targetId);

		// An edge of the window, where the pointer pushes the card; over itself, only once it first left where it started, as it lifts there
		const atPointer = getPartGridDropAt(x, y, this.containerRect, rects);
		if (atPointer && hasKey(atPointer, { location: true }) && hasKey(atPointer.location, { edge: true })) {
			return this.isOverSlot(x, y) && !this.leftStart ? { kind: 'keep' } : { kind: 'drop', key: keyOf({ location: atPointer.location }), drop: { location: atPointer.location } };
		}

		// Beside or into a part: where the center of the card is
		const [cx, cy] = this.probe(x, y);
		if (this.isOverSlot(cx, cy)) {
			return { kind: 'keep' }; // over itself, it is there already
		}

		const drop = getPartGridDropAt(cx, cy, this.containerRect, rects, undefined, canMerge);
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

	private leftStart = false;

	private isOverSlot(x: number, y: number): boolean {
		const slot = this.visual.get(this.draggedCell.id);
		return !!slot && x >= slot.left && x <= slot.left + slot.width && y >= slot.top && y <= slot.top + slot.height;
	}

	/**
	 * Goes elsewhere only once the pointer is {@link PART_GRID_DROP_HYSTERESIS}
	 * away from the zone of where it goes now.
	 */
	private retarget(x: number, y: number): void {
		if (!this.leftStart && (Math.hypot(x - this.startX, y - this.startY) > PART_GRID_LIFT_DISTANCE || !this.isOverSlot(...this.probe(x, y)))) {
			this.leftStart = true;
		}

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
		this.placeSlot(merge === undefined ? rects.get(this.draggedCell.id) : undefined);
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
	private createFrame(look: ICardLook | undefined): HTMLElement {
		const frame = append(this.frameLayer!, $('.part-grid-frame'));
		append(frame, $('.part-grid-frame-fill'));
		const bounds = this.containerRect;
		frame.style.left = `${bounds.left}px`;
		frame.style.top = `${bounds.top}px`;
		frame.style.width = `${bounds.width}px`;
		frame.style.height = `${bounds.height}px`;

		if (look) {
			this.applyLook(frame, look);
		}

		return frame;
	}

	private applyLook(frame: HTMLElement, look: ICardLook): void {
		frame.style.setProperty('--part-grid-frame-radius', look.radius);
		if (look.background) {
			frame.style.setProperty('--part-grid-frame-background', look.background);
		}
		if (look.border) {
			frame.style.setProperty('--part-grid-frame-border', look.border);
		}
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

	private placeSlot(rect: IPartGridRect | undefined): void {
		if (this.slot) {
			this.placeFrame(this.slot, rect);
		}

		const watermark = this.watermark;
		if (!watermark) {
			return;
		}
		if (!rect) {
			watermark.style.opacity = '0';
			return;
		}

		// Centered in the slot, by a transform, as large as a third of the slot, at most its size
		const scale = Math.min(1, Math.min(rect.width, rect.height) / 3 / SLOT_WATERMARK_SIZE);
		const bounds = this.containerRect;
		watermark.style.opacity = '';
		watermark.style.translate = `${rect.left - bounds.left + rect.width / 2 - SLOT_WATERMARK_SIZE / 2}px ${rect.top - bounds.top + rect.height / 2 - SLOT_WATERMARK_SIZE / 2}px`;
		watermark.style.scale = `${scale}`;
	}

	private createGhost(state: ICellState): HTMLElement {
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

	//#region Drop

	/**
	 * Settles the dropped card into its slot, where the other cards already
	 * show as they will be, then moves the part, once: what lays out again
	 * with the move, which can take a while, does so once nothing moves.
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
		this.pendingDrop = drop;
		const lifted = this.dragged;
		if (!lifted) {
			this.finish();
			return;
		}

		this.host.container.classList.add('part-grid-settling');
		const merge = hasKey(drop, { merge: true }) ? drop.merge : undefined;

		if (merge !== undefined) {
			// A part that merges goes away: a plain card goes into the part it merges into, and fades
			const target = this.visual.get(merge) ?? this.states.get(merge)?.start;
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
			const slot = this.visual.get(id);
			if (slot && this.liftedGhost) {
				this.settleGhost(this.liftedGhost, lifted.start, slot);
			} else if (slot) {
				// Its content shows over its slot as the other cards' does, until the move lays it out there
				lifted.cell.element.style.scale = '';
				this.placeCell(lifted, slot);
			}
			// The slot is its card now
			if (this.watermark) {
				this.watermark.style.opacity = '0';
			}
		}

		this.settleTimer = setTimeout(() => this.finish(), PART_GRID_REFLOW_DURATION + 30);
	}

	private pendingDrop: PartGridCardDrop | undefined;

	/**
	 * Moves the part, as dropped, and shows the cards as laid out: they are
	 * where they show already.
	 */
	private finish(): void {
		const drop = this.pendingDrop;
		this.pendingDrop = undefined;
		this.cleanUp();
		if (drop) {
			this.host.drop(this.draggedCell.id, drop);
		}
		this.onDidEnd();
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
		this.host.container.classList.add('part-grid-settling');
		for (const state of this.states.values()) {
			if (state !== this.dragged) {
				this.placeCell(state, state.start);
				if (state.frame) {
					this.placeFrame(state.frame, state.start);
				}
			}
		}
		this.placeSlot(this.dragged?.start);
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
		this.watermark = undefined;
		this.visuals.clear();
	}

	//#endregion
}
