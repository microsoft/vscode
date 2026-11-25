/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getWindow, prepend } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import type { IPartGridRect } from './partGrid.js';
import { findOverlayAnchors, hideOverlaysIn } from '../../../../base/browser/overlayLayoutElement.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { unclipCells } from './partGridMotion.js';

/**
 * How long cards take to make way for what goes among them, and to settle,
 * in milliseconds.
 */
export const PART_GRID_REFLOW_DURATION = 200;

/**
 * The size of the watermark in the slot of what goes among the cards, in
 * pixels, at most.
 */
const SLOT_WATERMARK_SIZE = 128;

/**
 * The class of a cell whose card shows a placeholder for what draws over it
 * while it moves (see {@link PartGridReflow}).
 */
export const PART_GRID_PLACEHOLDER_CLASS = 'part-grid-placeholder-card';

/**
 * A cell that shows, as what makes the cards make way sees it.
 */
export interface IPartGridReflowCell {
	readonly id: string;
	readonly element: HTMLElement;
	readonly card: HTMLElement;

	/**
	 * Whether the cell is a part, which something can go beside or into.
	 */
	readonly isPart: boolean;

	/**
	 * The editor shown under an element of the cell that something draws
	 * over, such as a webview, which shows as a placeholder while its card
	 * moves.
	 */
	describeOverlay(anchor: HTMLElement): { readonly name: string; readonly icon: ThemeIcon | undefined } | undefined;

	/**
	 * Lays the cell out at a size, moved by `dx`/`dy`, while its card makes
	 * way; without one, as its grid lays it out.
	 */
	layoutPreview(preview: { readonly width: number; readonly height: number; readonly dx: number; readonly dy: number } | undefined): void;
}

/**
 * The look of a card, read as the cards start to make way.
 */
export interface IPartGridCardLook {
	readonly radius: string;
	readonly background: string | undefined;
	readonly border: string | undefined;
}

function isTransparent(color: string): boolean {
	return !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
}

function readLook(card: HTMLElement): IPartGridCardLook {
	const look = getWindow(card).getComputedStyle(card);
	return {
		radius: look.borderTopLeftRadius,
		background: isTransparent(look.backgroundColor) ? undefined : look.backgroundColor,
		border: parseFloat(look.borderTopWidth) > 0 && !isTransparent(look.borderTopColor) ? look.borderTopColor : undefined
	};
}

export function rectOf(element: HTMLElement): IPartGridRect {
	const { left, top, width, height } = element.getBoundingClientRect();
	return { left, top, width, height };
}

/**
 * A cell as the cards started to make way.
 */
export interface IPartGridReflowCellState {
	readonly cell: IPartGridReflowCell;

	/** Where its card was. */
	readonly start: IPartGridRect;

	/** Where the cell was. */
	readonly cellStart: IPartGridRect;

	/**
	 * The elements of the cell that something draws over rather than in it,
	 * such as a webview or a native view, which does not move with the cell:
	 * hidden while its card moves, each shows a placeholder instead.
	 */
	readonly anchors: readonly HTMLElement[];

	/** The look of its card. */
	readonly look: IPartGridCardLook;

	/** The card under the cell's content that shows where its card is going. */
	frame?: HTMLElement;

	/** Where its card shows, or goes in a slide. */
	shown: IPartGridRect;

	/** The size its card is laid out at. */
	laidOut: { readonly width: number; readonly height: number };
}

/**
 * Makes the cards of a grid make way for what goes among them, such as a
 * dragged card or a new part, by transforms and clips only, the grid as it
 * is: each card slides over where it goes, its frame, under the cells,
 * showing the card there, and what goes among them shows as an empty card
 * with the watermark of an empty editor (the slot). A slide that is running
 * changes course from where it is, as CSS transitions do.
 *
 * Without motion, it reads where the cards are and shows nothing.
 */
export class PartGridReflow extends Disposable {

	readonly containerRect: IPartGridRect;

	private readonly _states = new Map<string, IPartGridReflowCellState>();
	get states(): ReadonlyMap<string, IPartGridReflowCellState> { return this._states; }

	private _shown = new Map<string, IPartGridRect>();
	/**
	 * Where the cards of the parts show, as zones: where they go, not where
	 * they are in a slide.
	 */
	get shown(): ReadonlyMap<string, IPartGridRect> { return this._shown; }

	private readonly visuals = this._register(new DisposableStore());
	private readonly settled = this._register(new MutableDisposable());
	private frameLayer: HTMLElement | undefined;
	private slot: HTMLElement | undefined;
	private watermark: HTMLElement | undefined;
	private mergeTarget: HTMLElement | undefined;

	/**
	 * @param movingId The cell that moves on its own, such as a dragged card,
	 * which does not make way: its place shows as the slot.
	 * @param slotLikeId The cell whose card's look the slot takes; by
	 * default the moving cell.
	 */
	constructor(
		private readonly container: HTMLElement,
		cells: readonly IPartGridReflowCell[],
		readonly motion: boolean,
		private readonly movingId: string | undefined,
		slotLikeId?: string
	) {
		super();

		this.containerRect = rectOf(container);

		// Where everything is, and how it looks, read once, before anything is written
		const staticAnchors = new Map<HTMLElement, boolean>();
		for (const cell of cells) {
			const start = rectOf(cell.card);
			const anchors = motion ? findOverlayAnchors(cell.element) : [];
			this._states.set(cell.id, { cell, start, cellStart: rectOf(cell.element), anchors, look: readLook(cell.card), shown: start, laidOut: { width: start.width, height: start.height } });
			for (const anchor of anchors) {
				staticAnchors.set(anchor, getWindow(anchor).getComputedStyle(anchor).position === 'static');
			}
		}
		this._shown = this.getPartRects(new Map(Array.from(this._states.values(), state => [state.cell.id, state.start])));

		this._register(toDisposable(() => this.cleanUp()));
		if (!motion) {
			return;
		}

		this.visuals.add(unclipCells(container, Array.from(this._states.values(), state => state.cell.element)));
		container.classList.add('part-grid-card-dragging');

		// The frames of the cards are under the cells: they show where each card goes
		this.frameLayer = prepend(container, $('.part-grid-frame-layer'));
		for (const state of this._states.values()) {
			if (state.anchors.length) {
				// What draws over the cell does not move with it: it hides, and the cell shows a placeholder for it, its tabs as they are
				this.visuals.add(hideOverlaysIn(state.cell.element));
				state.cell.element.classList.add(PART_GRID_PLACEHOLDER_CLASS);
				for (const anchor of state.anchors) {
					this.visuals.add(this.createPlaceholder(state.cell, anchor, !!staticAnchors.get(anchor)));
				}
			}
			state.cell.element.style.setProperty('--part-grid-frame-radius', state.look.radius);
			if (state.cell.id !== movingId) {
				state.frame = this.createFrame(state.look);
				this.placeFrame(state.frame, state.start);
				state.cell.element.classList.add('part-grid-reflow');
			}
		}

		// Where what moves goes: an empty card, with the watermark of an empty editor
		const moving = movingId !== undefined ? this._states.get(movingId) : undefined;
		this.slot = this.createFrame(this._states.get(slotLikeId ?? movingId ?? '')?.look);
		this.slot.classList.add('slot');
		this.watermark = append(this.frameLayer, $('.part-grid-slot-watermark'));
		this.watermark.style.left = `${this.containerRect.left}px`;
		this.watermark.style.top = `${this.containerRect.top}px`;
		this.placeSlot(moving?.start);

		// Everything starts where it is, then moves
		container.classList.add('part-grid-reflowing');
	}

	/**
	 * The cards of the parts among some rects.
	 */
	private getPartRects(rects: ReadonlyMap<string, IPartGridRect>): Map<string, IPartGridRect> {
		const parts = new Map<string, IPartGridRect>();
		for (const [id, rect] of rects) {
			if (this._states.get(id)?.cell.isPart || id === this.slotId) {
				parts.set(id, rect);
			}
		}

		return parts;
	}

	private slotId: string | undefined;

	/**
	 * Shows the cards where they go, by the rects of a dry run, and the slot
	 * at the rect of `slotId` in them. Without rects, everything goes back to
	 * where it was, the slot where what moves was. Merging, the part it
	 * merges into is highlighted where it shows. Without motion, only where
	 * the cards show changes, as zones.
	 */
	show(rects: ReadonlyMap<string, IPartGridRect> | undefined, slotId: string | undefined, mergeId?: string): void {
		this.slotId = slotId;
		const target = rects ?? new Map(Array.from(this._states.values(), state => [state.cell.id, state.start]));
		this._shown = this.getPartRects(target);
		if (!this.motion) {
			return;
		}

		for (const state of this._states.values()) {
			if (state.cell.id === this.movingId) {
				continue;
			}

			const rect = target.get(state.cell.id);
			if (rect) {
				// Laid out for real, as large as where it was and where it goes, so that what it shows fills the card as it slides: it shows the rest once the slide ends
				const size = { width: Math.max(state.shown.width, rect.width), height: Math.max(state.shown.height, rect.height) };
				state.shown = rect;
				this.layOut(state, size);
			}
			this.placeCell(state, rect);
			if (state.frame) {
				this.placeFrame(state.frame, rect);
			}
		}

		// Once the cards slid, each is laid out where it shows, exactly
		const timer = setTimeout(() => {
			for (const state of this._states.values()) {
				if (state.cell.id !== this.movingId) {
					this.layOut(state, state.shown);
				}
			}
		}, PART_GRID_REFLOW_DURATION + 20);
		this.settled.value = toDisposable(() => clearTimeout(timer));

		// The slot shows where what moves goes, or, without rects, where it was
		const moving = this.movingId !== undefined ? this._states.get(this.movingId) : undefined;
		this.placeSlot(rects ? (slotId !== undefined ? rects.get(slotId) : undefined) : moving?.start);
		this.showMergeTarget(mergeId !== undefined ? target.get(mergeId) : undefined);
	}

	/**
	 * Puts everything back where it was, in a slide.
	 */
	restore(): void {
		this.container.classList.add('part-grid-settling');
		this.show(undefined, undefined);
	}

	/**
	 * Shows what goes in the slot as there: the slot loses its watermark.
	 */
	fill(): void {
		this.container.classList.add('part-grid-settling');
		if (this.watermark) {
			this.watermark.style.opacity = '0';
		}
	}

	/**
	 * Lays a cell out with its card at a size, unless it is already, as its
	 * grid lays it out at the size its card had. What draws over the window
	 * is hidden meanwhile, and lays out once it shows again.
	 */
	private layOut(state: IPartGridReflowCellState, size: { readonly width: number; readonly height: number }): void {
		if ((Math.round(size.width) === Math.round(state.laidOut.width) && Math.round(size.height) === Math.round(state.laidOut.height))) {
			return;
		}

		state.laidOut = { width: size.width, height: size.height };
		const start = state.start;
		if (Math.round(size.width) === Math.round(start.width) && Math.round(size.height) === Math.round(start.height)) {
			state.cell.layoutPreview(undefined);
			return;
		}

		// The cell keeps the room it had around its card
		state.cell.layoutPreview({
			width: size.width + state.cellStart.width - start.width,
			height: size.height + state.cellStart.height - start.height,
			dx: state.shown.left - start.left,
			dy: state.shown.top - start.top
		});
	}

	/**
	 * Shows the content of a cell over a rect: moved there, and clipped to
	 * the rect's size, from its top left, whatever size it is laid out at,
	 * so that the clip slides from size to size as the cell lays out at
	 * another. Its card frame shows the rest.
	 */
	placeCell(state: IPartGridReflowCellState, rect: IPartGridRect | undefined): void {
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
		style.clipPath = `inset(${insetTop}px calc(100% - ${insetLeft + rect.width}px) calc(100% - ${insetTop + rect.height}px) ${insetLeft}px round var(--part-grid-frame-radius, 0px))`;
	}

	private showMergeTarget(rect: IPartGridRect | undefined): void {
		if (!rect) {
			this.mergeTarget?.remove();
			this.mergeTarget = undefined;
			return;
		}

		const moving = this.movingId !== undefined ? this._states.get(this.movingId) : undefined;
		this.mergeTarget ??= append(this.container, $('.part-grid-drop-indicator.part.merge'));
		this.mergeTarget.style.borderRadius = moving?.look.radius ?? '';
		this.mergeTarget.style.left = `${rect.left}px`;
		this.mergeTarget.style.top = `${rect.top}px`;
		this.mergeTarget.style.width = `${rect.width}px`;
		this.mergeTarget.style.height = `${rect.height}px`;
	}

	/**
	 * A card frame: the size of the window, clipped to where the card is,
	 * so that it changes where it goes by its clip only. It takes the look
	 * of the card, or, without one, of a plain card.
	 */
	private createFrame(look: IPartGridCardLook | undefined): HTMLElement {
		const frame = append(this.frameLayer!, $('.part-grid-frame'));
		append(frame, $('.part-grid-frame-fill'));
		const bounds = this.containerRect;
		frame.style.left = `${bounds.left}px`;
		frame.style.top = `${bounds.top}px`;
		frame.style.width = `${bounds.width}px`;
		frame.style.height = `${bounds.height}px`;

		if (look) {
			frame.style.setProperty('--part-grid-frame-radius', look.radius);
			if (look.background) {
				frame.style.setProperty('--part-grid-frame-background', look.background);
			}
			if (look.border) {
				frame.style.setProperty('--part-grid-frame-border', look.border);
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

	/**
	 * A placeholder over an element that something draws over: an empty
	 * editor's watermark, with the icon and name of the editor shown there.
	 */
	private createPlaceholder(cell: IPartGridReflowCell, anchor: HTMLElement, positionAnchor: boolean): IDisposable {
		const placeholder = append(anchor, $('.part-grid-placeholder', { 'aria-hidden': 'true' }));
		append(placeholder, $('.part-grid-slot-watermark'));
		const editor = cell.describeOverlay(anchor);
		if (editor) {
			const label = append(placeholder, $('.part-grid-placeholder-label'));
			append(label, $(`span${ThemeIcon.asCSSSelector(editor.icon ?? Codicon.file)}`));
			append(label, $('span.part-grid-placeholder-name')).textContent = editor.name;
		}
		if (positionAnchor) {
			anchor.style.position = 'relative';
		}

		return toDisposable(() => {
			placeholder.remove();
			if (positionAnchor) {
				anchor.style.position = '';
			}
		});
	}

	private cleanUp(): void {
		this.settled.clear();
		const container = this.container;
		container.classList.remove('part-grid-reflowing', 'part-grid-settling', 'part-grid-card-dragging');
		for (const state of this._states.values()) {
			const element = state.cell.element;
			element.classList.remove('part-grid-reflow', 'part-grid-lifted', 'part-grid-settle');
			const style = element.style;
			style.translate = style.scale = style.clipPath = style.opacity = style.transformOrigin = style.visibility = '';
			style.removeProperty('--part-grid-frame-radius');
			// As the grid lays it out, unless it did already, such as with a move
			state.cell.layoutPreview(undefined);
			element.classList.remove(PART_GRID_PLACEHOLDER_CLASS);
		}
		this._states.clear();

		this.frameLayer?.remove();
		this.frameLayer = undefined;
		this.mergeTarget?.remove();
		this.mergeTarget = undefined;
		this.slot = undefined;
		this.watermark = undefined;
		this.visuals.clear();
	}
}
