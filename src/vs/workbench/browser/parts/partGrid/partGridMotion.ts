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
	readonly cell: HTMLElement;
	/** For a card with native content: the plain card that moves instead of it. */
	readonly ghost: HTMLElement | undefined;
}

function sameRect(a: IPartGridRect, b: IPartGridRect): boolean {
	return Math.round(a.left) === Math.round(b.left) && Math.round(a.top) === Math.round(b.top) && Math.round(a.width) === Math.round(b.width) && Math.round(a.height) === Math.round(b.height);
}

/**
 * Glides the cards of a grid that moved from where they were to where they
 * are (FLIP), by transforms only: a cell moves with what it shows, and a
 * card that was smaller is clipped, not stretched. A card with native
 * content, which cannot move with its cell, moves as a plain card, its cell
 * hidden meanwhile. Without motion (see {@link isMotionEnabled}), cards are
 * where they go at once.
 */
export class PartGridMotion extends Disposable {

	private layer: HTMLElement | undefined;
	private readonly moving = new Map<string, IMoving>();
	private settleTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(private readonly host: IPartGridMotionHost) {
		super();

		this._register(toDisposable(() => this.clear()));
	}

	isMotionEnabled(): boolean {
		return !!this.host.container.closest('.monaco-enable-motion');
	}

	/**
	 * Glides the cards whose boxes changed from where they were, `from`, to
	 * where they are, `to`: each starts where it was, by a transform, and
	 * moves to where it is.
	 */
	glide(from: ReadonlyMap<string, IPartGridRect>, to: ReadonlyMap<string, IPartGridRect>): void {
		this.clear();
		if (!this.isMotionEnabled()) {
			return;
		}

		const glides: { readonly moving: IMoving; readonly origin: IPartGridRect; readonly target: IPartGridRect }[] = [];
		for (const [id, target] of to) {
			const origin = from.get(id);
			const cell = origin && !sameRect(origin, target) ? this.host.getCellElement(id) : undefined;
			if (!origin || !cell) {
				continue;
			}

			const moving: IMoving = { cell, ghost: this.hasNativeContent(cell) ? this.createGhost(id) : undefined };
			this.moving.set(id, moving);
			glides.push({ moving, origin, target });
		}
		if (!glides.length) {
			return;
		}

		// Each starts where it was, then, with one style flush for all, goes where it is
		for (const { moving, origin, target } of glides) {
			if (moving.ghost) {
				moving.cell.style.visibility = 'hidden';
				this.placeGhost(moving.ghost, origin, target, origin, false);
			} else {
				this.transformCell(moving.cell, target, origin, false);
			}
		}
		void this.host.container.offsetWidth;
		for (const { moving, origin, target } of glides) {
			if (moving.ghost) {
				this.placeGhost(moving.ghost, origin, target, target, true);
			} else {
				this.transformCell(moving.cell, target, target, true);
			}
		}

		this.settleTimer = setTimeout(() => this.clear(), PART_GRID_MOTION_DURATION + 20);
	}

	/**
	 * Shows a cell laid out over `layout` over `box`: translated there, and
	 * clipped to its size if smaller.
	 */
	private transformCell(cell: HTMLElement, layout: IPartGridRect, box: IPartGridRect, animate: boolean): void {
		const style = cell.style;
		style.transition = animate ? '' : 'none';
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

	private createGhost(id: string): HTMLElement {
		const ghost = append(this.getLayer(), $(`.part-grid-motion-card.${PART_GRID_MOTION_CLASS}`));
		const card = this.host.getCard(id);
		if (card) {
			const look = getWindow(card).getComputedStyle(card);
			ghost.style.setProperty('--part-grid-motion-radius', look.borderTopLeftRadius);
			// A card whose content draws its surface has none of its own: the plain card then takes the editor's
			if (look.backgroundColor !== 'rgba(0, 0, 0, 0)' && look.backgroundColor !== 'transparent') {
				ghost.style.setProperty('--part-grid-motion-background', look.backgroundColor);
			}
		}

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
		style.transition = animate ? '' : 'none';
		style.left = `${from.left}px`;
		style.top = `${from.top}px`;
		style.width = `${width}px`;
		style.height = `${height}px`;
		style.transform = `translate(${box.left - from.left}px, ${box.top - from.top}px)`;
		style.clipPath = `inset(0 ${width - box.width}px ${height - box.height}px 0 round var(--part-grid-motion-radius, 0px))`;
	}

	private getLayer(): HTMLElement {
		if (!this.layer) {
			this.layer = append(this.host.container, $('.part-grid-motion-layer'));
		}

		return this.layer;
	}

	private clear(): void {
		if (this.settleTimer !== undefined) {
			clearTimeout(this.settleTimer);
			this.settleTimer = undefined;
		}
		for (const { cell, ghost } of this.moving.values()) {
			ghost?.remove();
			cell.style.visibility = '';
			cell.style.transform = '';
			cell.style.clipPath = '';
			cell.style.transition = '';
			cell.classList.remove('part-grid-moving');
		}
		this.moving.clear();
		this.layer?.remove();
		this.layer = undefined;
	}
}
