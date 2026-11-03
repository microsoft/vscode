/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getWindow } from '../../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import type { IPartGridRect } from './partGrid.js';

/**
 * The class of the plain cards that move in place of cards with native
 * content. Under them, what draws natively over the window, such as an
 * integrated browser, gives way.
 */
export const PART_GRID_MOTION_CLASS = 'part-grid-motion';

/**
 * How long cards take to move, in milliseconds.
 */
export const PART_GRID_MOTION_DURATION = 160;

/**
 * What the motion of the cards of a grid needs from it.
 */
export interface IPartGridMotionHost {
	readonly container: HTMLElement;

	/**
	 * The element of a cell, which hides while its card moves.
	 */
	getCellElement(id: string): HTMLElement | undefined;

	/**
	 * The card of a cell, whose look a moving card takes.
	 */
	getCard(id: string): HTMLElement | undefined;
}

/**
 * What, drawn over the window rather than in a cell, does not move with
 * the cell: integrated browsers and canvases, drawn natively, and webviews
 * and notebooks, drawn in overlays. Their cards move as plain cards.
 */
const NATIVE_CONTENT_SELECTOR = '.browser-container-wrapper, .session-canvas-editor, [id^="webview-editor-element-"], .notebookOverlay';

interface IMoving {
	readonly from: IPartGridRect;
	to: IPartGridRect;
	/** For a card with native content: the plain card that moves instead of it. */
	readonly ghost: HTMLElement | undefined;
}

function sameRect(a: IPartGridRect, b: IPartGridRect): boolean {
	return Math.round(a.left) === Math.round(b.left) && Math.round(a.top) === Math.round(b.top) && Math.round(a.width) === Math.round(b.width) && Math.round(a.height) === Math.round(b.height);
}

/**
 * Moves the cards of a grid by transforms only: a cell moves with what it
 * shows, and a card that gets smaller is clipped, not stretched. A card
 * with native content, which cannot move with its cell, moves as a plain
 * card, its cell hidden meanwhile. Without motion (see
 * {@link isMotionEnabled}), cards are where they go at once.
 */
export class PartGridMotion extends Disposable {

	private layer: HTMLElement | undefined;
	private slot: HTMLElement | undefined;
	private readonly moving = new Map<string, IMoving>();
	private settleTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(private readonly host: IPartGridMotionHost) {
		super();

		this._register(toDisposable(() => this.clear()));
	}

	/**
	 * Whether cards are in motion.
	 */
	get active(): boolean {
		return this.moving.size > 0 || !!this.slot;
	}

	/**
	 * Where a cell is laid out while its card moves, without the transform
	 * that moves it.
	 */
	getLayoutRect(id: string): IPartGridRect | undefined {
		return this.moving.get(id)?.from;
	}

	isMotionEnabled(): boolean {
		return !!this.host.container.closest('.monaco-enable-motion');
	}

	/**
	 * Moves the cards from where they are, `from`, to where they go, `to`,
	 * and opens the slot of `slotId`, its card at `slot`, as when hovering
	 * where a dragged card goes. The cards that no longer move go back.
	 */
	reflow(from: ReadonlyMap<string, IPartGridRect>, to: ReadonlyMap<string, IPartGridRect>, slotId: string, slot: IPartGridRect): void {
		this.cancelSettle();

		for (const [id, target] of to) {
			const origin = from.get(id);
			if (id === slotId) {
				// The dragged card shows in its slot, outlined
				if (origin) {
					this.moveTo(id, origin, target);
				}
				this.showSlot(id, slot);
			} else if (origin && !sameRect(origin, target)) {
				this.moveTo(id, origin, target);
			} else {
				this.moveBack(id);
			}
		}

		for (const id of [...this.moving.keys()]) {
			if (!to.has(id)) {
				this.moveBack(id);
			}
		}
	}

	/**
	 * Moves the cards back to their cells, as when the drag leaves where it
	 * would go, or ends without a drop.
	 */
	reset(): void {
		this.slot?.remove();
		this.slot = undefined;
		for (const id of [...this.moving.keys()]) {
			this.moveBack(id);
		}
	}

	/**
	 * Ends the motion at once, as once the cells are where their cards were
	 * shown to go.
	 */
	commit(): void {
		this.clear();
	}

	/**
	 * Glides the cards whose boxes changed from where they were to where
	 * they are, as after a move: each starts where it was, by a transform,
	 * and moves to where it is.
	 */
	glide(from: ReadonlyMap<string, IPartGridRect>, to: ReadonlyMap<string, IPartGridRect>): void {
		this.clear();
		if (!this.isMotionEnabled()) {
			return;
		}

		for (const [id, target] of to) {
			const origin = from.get(id);
			if (!origin || sameRect(origin, target)) {
				continue;
			}

			const cell = this.host.getCellElement(id);
			if (!cell) {
				continue;
			}

			if (this.hasNativeContent(cell)) {
				const ghost = this.createGhost(id, origin, target);
				this.moving.set(id, { from: origin, to: target, ghost });
				cell.style.visibility = 'hidden';
				this.placeGhost(ghost, origin, target, origin, false);
				void ghost.offsetWidth;
				this.placeGhost(ghost, origin, target, target, true);
			} else {
				this.moving.set(id, { from: origin, to: target, ghost: undefined });
				// From where it was, to where it is: it starts clipped to its size there, if smaller
				this.transformCell(cell, target, origin, false);
				void cell.offsetWidth;
				this.transformCell(cell, target, target, true);
			}
		}
		this.settle();
	}

	private moveTo(id: string, from: IPartGridRect, to: IPartGridRect): void {
		const cell = this.host.getCellElement(id);
		if (!cell) {
			return;
		}

		let moving = this.moving.get(id);
		if (!moving) {
			const ghost = this.hasNativeContent(cell) ? this.createGhost(id, from, to) : undefined;
			moving = { from, to, ghost };
			this.moving.set(id, moving);
			if (ghost) {
				cell.style.visibility = 'hidden';
				this.placeGhost(ghost, from, to, from, false);
				void ghost.offsetWidth;
			}
		}

		moving.to = to;
		if (moving.ghost) {
			this.placeGhost(moving.ghost, moving.from, to, to, true);
		} else {
			this.transformCell(cell, from, to, true);
		}
	}

	private moveBack(id: string): void {
		const moving = this.moving.get(id);
		const cell = this.host.getCellElement(id);
		if (!moving || !cell) {
			return;
		}

		if (moving.ghost) {
			this.placeGhost(moving.ghost, moving.from, moving.to, moving.from, true);
		} else {
			this.transformCell(cell, moving.from, moving.from, true);
		}
		this.settleOne(id);
	}

	/**
	 * Moves a cell laid out over `layout` to show over `box`: translated
	 * there, and clipped to its size if smaller.
	 */
	private transformCell(cell: HTMLElement, layout: IPartGridRect, box: IPartGridRect, animate: boolean): void {
		const style = cell.style;
		style.transition = animate && this.isMotionEnabled() ? '' : 'none';
		cell.classList.add('part-grid-moving');
		const dx = box.left - layout.left;
		const dy = box.top - layout.top;
		style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
		const clipRight = Math.max(0, layout.width - box.width);
		const clipBottom = Math.max(0, layout.height - box.height);
		style.clipPath = clipRight || clipBottom ? `inset(0 ${clipRight}px ${clipBottom}px 0)` : '';
	}

	private hasNativeContent(cell: HTMLElement): boolean {
		// What the cell shows is not built here: it is found by what marks it as drawn natively or in an overlay
		// eslint-disable-next-line no-restricted-syntax
		return !!cell.querySelector(NATIVE_CONTENT_SELECTOR);
	}

	private createGhost(id: string, from: IPartGridRect, to: IPartGridRect): HTMLElement {
		const ghost = append(this.getLayer(), $(`.part-grid-motion-card.${PART_GRID_MOTION_CLASS}`));
		this.applyLook(ghost, id);

		return ghost;
	}

	/**
	 * Places a plain card over a box: sized for both where it was and
	 * where it goes, moved by a transform, and clipped to the box.
	 */
	private placeGhost(ghost: HTMLElement, from: IPartGridRect, to: IPartGridRect, box: IPartGridRect, animate: boolean): void {
		const width = Math.max(from.width, to.width);
		const height = Math.max(from.height, to.height);
		const style = ghost.style;
		style.transition = animate && this.isMotionEnabled() ? '' : 'none';
		style.left = `${from.left}px`;
		style.top = `${from.top}px`;
		style.width = `${width}px`;
		style.height = `${height}px`;
		style.transform = `translate(${box.left - from.left}px, ${box.top - from.top}px)`;
		style.clipPath = `inset(0 ${width - box.width}px ${height - box.height}px 0 round var(--part-grid-motion-radius, 0px))`;
	}

	private showSlot(id: string, box: IPartGridRect): void {
		if (!this.slot) {
			this.slot = append(this.getLayer(), $('.part-grid-motion-slot'));
			this.applyLook(this.slot, id);
		}

		const style = this.slot.style;
		style.left = `${box.left}px`;
		style.top = `${box.top}px`;
		style.width = `${box.width}px`;
		style.height = `${box.height}px`;
	}

	private applyLook(element: HTMLElement, id: string): void {
		const card = this.host.getCard(id);
		if (!card) {
			return;
		}

		const look = getWindow(card).getComputedStyle(card);
		element.style.setProperty('--part-grid-motion-radius', look.borderTopLeftRadius);
		// A card whose content draws its surface has none of its own: the plain card then takes the editor's
		if (look.backgroundColor !== 'rgba(0, 0, 0, 0)' && look.backgroundColor !== 'transparent') {
			element.style.setProperty('--part-grid-motion-background', look.backgroundColor);
		}
	}

	private getLayer(): HTMLElement {
		if (!this.layer) {
			this.layer = append(this.host.container, $('.part-grid-motion-layer'));
		}

		return this.layer;
	}

	private release(id: string): void {
		const moving = this.moving.get(id);
		this.moving.delete(id);
		moving?.ghost?.remove();
		const cell = this.host.getCellElement(id);
		if (cell) {
			cell.style.visibility = '';
			cell.style.transform = '';
			cell.style.clipPath = '';
			cell.style.transition = '';
			cell.classList.remove('part-grid-moving');
		}
		if (!this.active) {
			this.layer?.remove();
			this.layer = undefined;
		}
	}

	private readonly settling = new Map<string, ReturnType<typeof setTimeout>>();

	/**
	 * Lets a card arrive back before it is in its cell again.
	 */
	private settleOne(id: string): void {
		clearTimeout(this.settling.get(id));
		if (!this.isMotionEnabled()) {
			this.release(id);
			return;
		}

		this.settling.set(id, setTimeout(() => {
			this.settling.delete(id);
			const moving = this.moving.get(id);
			if (moving && sameRect(moving.to, moving.from)) {
				this.release(id);
			} else if (moving) {
				// Moved again meanwhile
				return;
			}
		}, PART_GRID_MOTION_DURATION + 20));
		const moving = this.moving.get(id);
		if (moving) {
			moving.to = moving.from;
		}
	}

	/**
	 * Ends the motion once the cards arrived.
	 */
	private settle(): void {
		this.cancelSettle();
		if (!this.isMotionEnabled()) {
			this.clear();
			return;
		}

		this.settleTimer = setTimeout(() => this.clear(), PART_GRID_MOTION_DURATION + 20);
	}

	private cancelSettle(): void {
		if (this.settleTimer !== undefined) {
			clearTimeout(this.settleTimer);
			this.settleTimer = undefined;
		}
	}

	private clear(): void {
		this.cancelSettle();
		for (const timer of this.settling.values()) {
			clearTimeout(timer);
		}
		this.settling.clear();
		this.slot?.remove();
		this.slot = undefined;
		for (const id of [...this.moving.keys()]) {
			this.release(id);
		}
		this.layer?.remove();
		this.layer = undefined;
	}
}
