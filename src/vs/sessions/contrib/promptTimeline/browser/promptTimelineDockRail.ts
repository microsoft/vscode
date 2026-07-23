/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, clearNode, EventType, getWindow } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { MIN_HOST_WIDTH } from './promptTimelineLayout.js';
import { PromptDiffStat, PromptFileDiff, PromptTick, IPromptScrollLayout } from './promptTimelineModel.js';
import { IPromptReviewFileEvent, IPromptTimelineRail } from './promptTimelineRail.js';
import './media/promptTimeline.css';

/**
 * Upper bound on the number of resting dots drawn on the handle. The flyout list is uncapped (it
 * lists every prompt), but the dot preview would grow unboundedly tall for very long sessions, so
 * it is capped and an overflow indicator is shown once there are more prompts than dots.
 */
const MAX_REST_DOTS = 50;

interface IRowEntry {
	tick: PromptTick;
	readonly button: HTMLButtonElement;
	readonly label: HTMLElement;
	readonly stat: HTMLElement;
}

/** Unique-per-instance suffix so the flyout's id (referenced by the handle's `aria-controls`) never collides. */
let dockIdSeq = 0;

/**
 * A minimal, left-edge prompt timeline. At rest it is only a small handle in the transcript's left
 * gutter (one dot per prompt) — no per-prompt marks, no diff colour — so the transcript stays calm.
 * Hovering, tapping, or focusing the handle expands a flyout listing every prompt (its text and a
 * diff badge); activating a row reveals that prompt and closes the flyout. Because the list is
 * evenly spaced and never derived from response heights, it stays stable under virtualization.
 *
 * The handle is an accessible disclosure button (`aria-expanded`/`aria-controls`) wired for mouse,
 * touch (via {@link Gesture}) and keyboard; the flyout is a single-tab-stop toolbar whose rows are
 * reached with Arrow/Home/End and dismissed with Escape.
 *
 * It implements the same {@link IPromptTimelineRail} contract as the overview-ruler rail so the two
 * are interchangeable behind the `sessions.promptTimeline.rail` setting; the scroll-driven and
 * fisheye affordances the ruler needs (hard-wheel bloom, proportional scroll layout) are no-ops here.
 */
export class PromptTimelineDockRail extends Disposable implements IPromptTimelineRail {

	private readonly _domNode: HTMLElement;
	private readonly _rest: HTMLButtonElement;
	private readonly _list: HTMLElement;
	private readonly _rowDisposables = this._register(new DisposableStore());
	private readonly _rows: IRowEntry[] = [];
	private _activeRequestId: string | undefined;
	private _hostWidth = Number.POSITIVE_INFINITY;
	/** Disclosure held open by explicit activation (handle click/tap/keyboard, or a row focused via keyboard). */
	private _open = false;
	/** Pointer is over the rail; reveals the flyout transiently (independent of {@link _open}). */
	private _hovering = false;

	private readonly _onDidSelect = this._register(new Emitter<string>());
	readonly onDidSelect: Event<string> = this._onDidSelect.event;

	// The dock lists prompts and jumps to them; it never opens the review drill-down the ruler's hover
	// card offers, so these stay unused. They are kept to satisfy the shared rail contract.
	private readonly _onDidReview = this._register(new Emitter<PromptTick>());
	readonly onDidReview: Event<PromptTick> = this._onDidReview.event;
	private readonly _onDidReviewFile = this._register(new Emitter<IPromptReviewFileEvent>());
	readonly onDidReviewFile: Event<IPromptReviewFileEvent> = this._onDidReviewFile.event;

	get domNode(): HTMLElement { return this._domNode; }

	constructor() {
		super();
		this._domNode = $('nav.prompt-timeline-rail.prompt-timeline-rail-dock');
		this._domNode.setAttribute('aria-label', localize('promptTimeline.dock.railLabel', "Prompt timeline"));
		this._domNode.setAttribute('role', 'toolbar');
		this._domNode.setAttribute('aria-orientation', 'vertical');

		const panelId = `prompt-timeline-dock-panel-${dockIdSeq++}`;

		// The resting affordance is a disclosure button that expands the flyout. It carries one dot per
		// prompt (built in `setTicks`); the dots are decorative, so the button owns the accessible name.
		this._rest = append(this._domNode, $<HTMLButtonElement>('button.prompt-timeline-dock-rest'));
		this._rest.setAttribute('aria-haspopup', 'true');
		this._rest.setAttribute('aria-expanded', 'false');
		this._rest.setAttribute('aria-controls', panelId);
		this._rest.setAttribute('aria-label', localize('promptTimeline.dock.toggleLabel', "Show prompts"));
		this._rest.tabIndex = 0;

		this._list = append(this._domNode, $('.prompt-timeline-dock-panel'));
		this._list.id = panelId;

		// Mouse: reveal while the pointer is over the rail subtree. The rail element is
		// pointer-transparent (its children opt back in), so `mouseenter` never fires on it — bubble
		// `mouseover`/`mouseout` from the handle and flyout instead, and only collapse once the pointer
		// truly leaves the rail subtree.
		this._register(addDisposableListener(this._domNode, EventType.MOUSE_OVER, () => {
			this._hovering = true;
			this._updateRevealed();
		}));
		this._register(addDisposableListener(this._domNode, EventType.MOUSE_OUT, (e: MouseEvent) => {
			if (!this._domNode.contains(e.relatedTarget as Node | null)) {
				this._hovering = false;
				this._updateRevealed();
			}
		}));

		// Touch + click + keyboard toggle on the handle (iOS needs both click and tap per Sessions guidance).
		this._register(Gesture.addTarget(this._rest));
		this._register(addDisposableListener(this._rest, EventType.CLICK, e => { e.preventDefault(); this._toggleOpen(); }));
		this._register(addDisposableListener(this._rest, TouchEventType.Tap, () => this._toggleOpen()));
		this._register(addDisposableListener(this._rest, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
				event.preventDefault();
				event.stopPropagation();
				this._toggleOpen();
			}
		}));

		// Keyboard: one Tab stop into the flyout; Arrow/Home/End move between rows, Escape dismisses.
		this._register(addDisposableListener(this._list, EventType.KEY_DOWN, e => this._onListKeyDown(e)));

		// Focus fully leaving the rail collapses the disclosure (covers Shift+Tab off the handle,
		// Tab past the last row, and tapping elsewhere on touch, where no mouseout fires).
		this._register(addDisposableListener(this._domNode, EventType.FOCUS_OUT, (e: FocusEvent) => {
			if (!this._domNode.contains(e.relatedTarget as Node | null)) {
				this._open = false;
				this._updateRevealed();
			}
		}));
	}

	/** Reveal whenever the disclosure is open OR the pointer is hovering; keep `aria-expanded` in sync. */
	private _updateRevealed(): void {
		const revealed = this._open || this._hovering;
		this._domNode.classList.toggle('revealed', revealed);
		this._rest.setAttribute('aria-expanded', String(revealed));
	}

	/** Toggle the disclosure via explicit activation: opening focuses a row, closing returns to the handle. */
	private _toggleOpen(): void {
		if (this._open) {
			this._close();
		} else {
			this._open = true;
			this._updateRevealed();
			this._focusActiveRow();
		}
	}

	/** Collapse the disclosure and return focus to the handle (shared close path for activation and Escape). */
	private _close(): void {
		this._open = false;
		this._updateRevealed();
		this._rest.focus();
	}

	private _focusActiveRow(): void {
		const activeIndex = this._rows.findIndex(r => r.button.tabIndex === 0);
		this._rows[activeIndex >= 0 ? activeIndex : 0]?.button.focus();
	}

	setFilesProvider(_provider: (tick: PromptTick) => readonly PromptFileDiff[]): void {
		// The dock does not surface per-file changes; the ruler rail's hover card does.
	}

	/** Rebuilds the resting handle's dots so there is one per prompt, capped at {@link MAX_REST_DOTS}. */
	private _renderDots(count: number): void {
		clearNode(this._rest);
		const dots = Math.min(count, MAX_REST_DOTS);
		for (let i = 0; i < dots; i++) {
			append(this._rest, $('.prompt-timeline-dock-dot'));
		}
		// More prompts than dots: a small trailing marker signals the count is truncated.
		if (count > MAX_REST_DOTS) {
			append(this._rest, $('.prompt-timeline-dock-dot-more'));
		}
	}

	setTicks(ticks: readonly PromptTick[]): void {
		const sameStructure = ticks.length === this._rows.length
			&& ticks.every((t, i) => this._rows[i]?.tick.requestId === t.requestId);
		if (sameStructure) {
			// Only the stats changed (streaming edits); update them in place so focus/hover are kept.
			for (let i = 0; i < ticks.length; i++) {
				this._renderRow(this._rows[i], ticks[i]);
			}
			this._updateActiveClasses();
			return;
		}

		this._rowDisposables.clear();
		this._rows.length = 0;
		clearNode(this._list);
		// One resting dot per prompt, so the handle previews how many prompts the flyout holds.
		this._renderDots(ticks.length);

		for (const tick of ticks) {
			const button = append(this._list, $<HTMLButtonElement>('button.prompt-timeline-dock-row'));
			button.tabIndex = -1;
			const label = append(button, $('span.prompt-timeline-dock-row-label'));
			const stat = append(button, $('span.prompt-timeline-dock-row-stat'));
			const entry: IRowEntry = { tick, button, label, stat };
			this._renderRow(entry, tick);
			const requestId = tick.requestId;
			// Activating a row jumps to the prompt and closes the flyout (focus returns to the handle),
			// so it does not linger over the transcript.
			this._rowDisposables.add(addDisposableListener(button, EventType.CLICK, () => {
				this._onDidSelect.fire(requestId);
				this._close();
			}));
			this._rowDisposables.add(addDisposableListener(button, EventType.FOCUS, () => {
				// Keyboard-focusing a row (e.g. Tab in from the handle) counts as opening the disclosure.
				this._open = true;
				this._updateRevealed();
				this._updateTabStops(this._rows.indexOf(entry));
			}));
			this._rows.push(entry);
		}

		const activeIndex = this._rows.findIndex(r => r.tick.requestId === this._activeRequestId);
		this._updateTabStops(activeIndex >= 0 ? activeIndex : 0);
		this._updateActiveClasses();
	}

	private _renderRow(entry: IRowEntry, tick: PromptTick): void {
		entry.tick = tick;
		entry.button.setAttribute('aria-label', tick.ariaLabel);
		entry.label.textContent = tick.text;
		entry.label.title = tick.text;
		this._renderStat(entry.stat, tick.stat);
	}

	private _renderStat(container: HTMLElement, stat: PromptDiffStat | undefined): void {
		clearNode(container);
		if (!stat || stat.added + stat.removed === 0) {
			container.classList.add('hidden');
			return;
		}
		container.classList.remove('hidden');
		append(container, $('span.added')).textContent = `+${stat.added}`;
		append(container, $('span.removed')).textContent = `\u2212${stat.removed}`;
	}

	/** Roving tabindex: exactly one row is tabbable so the flyout is a single Tab stop. */
	private _updateTabStops(focusIndex: number): void {
		for (let i = 0; i < this._rows.length; i++) {
			this._rows[i].button.tabIndex = i === focusIndex ? 0 : -1;
		}
	}

	private _onListKeyDown(e: KeyboardEvent): void {
		if (this._rows.length === 0) {
			return;
		}
		const event = new StandardKeyboardEvent(e);
		if (event.keyCode === KeyCode.Escape) {
			event.preventDefault();
			event.stopPropagation();
			this._close();
			return;
		}
		const currentIndex = this._rows.findIndex(r => r.button === getWindow(this._domNode).document.activeElement);
		let nextIndex: number;
		switch (event.keyCode) {
			case KeyCode.DownArrow: nextIndex = Math.min(this._rows.length - 1, currentIndex + 1); break;
			case KeyCode.UpArrow: nextIndex = Math.max(0, currentIndex - 1); break;
			case KeyCode.Home: nextIndex = 0; break;
			case KeyCode.End: nextIndex = this._rows.length - 1; break;
			default: return;
		}
		event.preventDefault();
		event.stopPropagation();
		this._updateTabStops(nextIndex);
		this._rows[nextIndex]?.button.focus();
	}

	setActive(requestId: string | undefined): void {
		this._activeRequestId = requestId;
		this._updateActiveClasses();
	}

	private _updateActiveClasses(): void {
		for (const row of this._rows) {
			const active = this._activeRequestId !== undefined
				&& (row.tick.requestId === this._activeRequestId || row.tick.allRequestIds.includes(this._activeRequestId));
			row.button.classList.toggle('active', active);
			// Expose the current prompt to assistive tech, mirroring the overview-ruler rail.
			if (active) {
				row.button.setAttribute('aria-current', 'location');
			} else {
				row.button.removeAttribute('aria-current');
			}
		}
	}

	focusTick(requestId: string): void {
		this._rows.find(r => r.tick.requestId === requestId || r.tick.allRequestIds.includes(requestId))?.button.focus();
	}

	setHostWidth(width: number): void {
		if (width > 0 && width !== this._hostWidth) {
			this._hostWidth = width;
			// Too narrow to place the handle beside the content: hide it (the native scrollbar remains).
			this._domNode.classList.toggle('overflowing', width < MIN_HOST_WIDTH);
		}
	}

	// The ruler blooms its fan on a hard scroll and scatters marks by scroll position; the dock is a
	// static, evenly-spaced list, so both are intentionally no-ops.
	notifyHardWheel(): void { }
	setScrollLayout(_layout: IPromptScrollLayout | undefined): void { }
}
