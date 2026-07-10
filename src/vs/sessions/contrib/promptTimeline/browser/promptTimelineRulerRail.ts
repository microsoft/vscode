/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, clearNode, EventType, getWindow, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { PromptTimelineCard } from './promptTimelineCard.js';
import { spaceMarkCenters } from './promptTimelineLayout.js';
import { IPromptScrollLayout, PromptFileDiff, PromptTick } from './promptTimelineModel.js';
import { IPromptReviewFileEvent, IPromptTimelineRail } from './promptTimelineRail.js';
import './media/promptTimeline.css';

/** Minimum clickable target size (WCAG 2.5.8) for each mark's hit area. */
const MIN_TARGET = 24;
/** Below this transcript width the rail hides so it does not crowd the content. */
const MIN_HOST_WIDTH = 320;
/** Skip re-positioning a mark for sub-pixel drift, so estimate noise doesn't cause micro-jitter. */
const RELAYOUT_MIN_DELTA = 0.5;

interface IMarkEntry {
	tick: PromptTick;
	readonly button: HTMLButtonElement;
	readonly bar: HTMLElement;
	/** Last applied `top` (px) so tiny relayout deltas can be skipped. */
	lastTop?: number;
}

/**
 * The overview-ruler rail. The whole session is compressed into the rail height
 * like the editor's overview ruler: each prompt is a mark at its proportional
 * scroll position, coloured only to signal whether it changed code. The rail sits
 * in a gutter beside the transcript's native scrollbar (no second slider); the
 * active mark is the "you-are-here". Detail lives in the hover card.
 */
export class PromptTimelineRulerRail extends Disposable implements IPromptTimelineRail {

	private readonly _domNode: HTMLElement;
	private readonly _marksContainer: HTMLElement;
	private readonly _card: PromptTimelineCard;
	private readonly _markDisposables = this._register(new DisposableStore());
	private readonly _marks: IMarkEntry[] = [];
	/** Delays enabling the glide until after a structural rebuild's first layout, so freshly created marks don't slide in from the top. */
	private readonly _glideEnabler = this._register(new MutableDisposable());

	private _activeRequestId: string | undefined;
	private _layout: IPromptScrollLayout | undefined;
	private _resizeObserverReady = false;
	private _hostWidth = Number.POSITIVE_INFINITY;
	/** Cached rail height; only changes on resize (observed), so we avoid reading it — a forced reflow — on every scroll. */
	private _railHeight = 0;
	/** Coalesces scroll-driven relayouts to one per animation frame. */
	private readonly _relayoutScheduled = this._register(new MutableDisposable());

	private readonly _onDidSelect = this._register(new Emitter<string>());
	readonly onDidSelect: Event<string> = this._onDidSelect.event;

	private readonly _onDidReview = this._register(new Emitter<PromptTick>());
	readonly onDidReview: Event<PromptTick> = this._onDidReview.event;

	private readonly _onDidReviewFile = this._register(new Emitter<IPromptReviewFileEvent>());
	readonly onDidReviewFile: Event<IPromptReviewFileEvent> = this._onDidReviewFile.event;

	get domNode(): HTMLElement { return this._domNode; }

	constructor() {
		super();
		this._domNode = $('nav.prompt-timeline-rail.prompt-timeline-rail-ruler');
		this._domNode.setAttribute('aria-label', localize('promptTimeline.railLabel', "Prompt timeline"));
		this._domNode.setAttribute('role', 'toolbar');
		this._domNode.setAttribute('aria-orientation', 'vertical');
		this._marksContainer = append(this._domNode, $('.prompt-timeline-ruler-marks'));
		this._card = this._register(new PromptTimelineCard(this._domNode));
		this._register(this._card.onDidReview(tick => this._onDidReview.fire(tick)));
		this._register(this._card.onDidReviewFile(e => this._onDidReviewFile.fire(e)));

		// Toolbar keyboard model: one Tab stop, Arrow/Home/End move between marks.
		this._register(addDisposableListener(this._marksContainer, EventType.KEY_DOWN, e => this._onMarksKeyDown(e)));

		this._register(addDisposableListener(this._domNode, EventType.FOCUS_OUT, () => {
			if (!this._domNode.contains(getWindow(this._domNode).document.activeElement)) {
				this._card.scheduleHide();
			}
		}));
	}

	setFilesProvider(provider: (tick: PromptTick) => readonly PromptFileDiff[]): void {
		this._card.setFilesProvider(provider);
	}

	setTicks(ticks: readonly PromptTick[]): void {
		const sameStructure = ticks.length === this._marks.length
			&& ticks.every((t, i) => this._marks[i]?.tick.requestId === t.requestId);
		if (sameStructure) {
			for (let i = 0; i < ticks.length; i++) {
				this._renderMark(this._marks[i], ticks[i]);
			}
			this._updateActiveClasses();
			this._relayout();
			return;
		}

		this._markDisposables.clear();
		this._marks.length = 0;
		clearNode(this._marksContainer);
		this._card.hide();
		// New buttons start at top:0; disable the glide so they don't animate from
		// the top into place, then re-enable it after this layout so later drift glides.
		this._marksContainer.classList.remove('glide');
		this._glideEnabler.clear();

		for (const tick of ticks) {
			const button = append(this._marksContainer, $<HTMLButtonElement>('button.prompt-timeline-ruler-mark'));
			button.tabIndex = -1;
			const bar = append(button, $('span.prompt-timeline-ruler-bar'));
			const entry: IMarkEntry = { tick, button, bar };
			this._renderMark(entry, tick);
			const requestId = tick.requestId;
			this._markDisposables.add(addDisposableListener(button, EventType.CLICK, () => this._onDidSelect.fire(requestId)));
			this._markDisposables.add(addDisposableListener(button, EventType.MOUSE_ENTER, () => this._showCard(entry)));
			this._markDisposables.add(addDisposableListener(button, EventType.FOCUS, () => { this._showCard(entry); this._updateTabStops(this._marks.indexOf(entry)); }));
			this._markDisposables.add(addDisposableListener(button, EventType.MOUSE_LEAVE, () => this._card.scheduleHide()));
			this._marks.push(entry);
		}

		this._ensureResizeObserver();
		// Make the active mark (else the first) the single Tab stop into the toolbar.
		const activeIndex = this._marks.findIndex(m => m.tick.requestId === this._activeRequestId);
		this._updateTabStops(activeIndex >= 0 ? activeIndex : 0);
		this._updateActiveClasses();
		this._relayout();
		// Marks are now positioned; enable the glide for subsequent (drift) relayouts.
		this._glideEnabler.value = scheduleAtNextAnimationFrame(getWindow(this._domNode), () => this._marksContainer.classList.add('glide'));
	}

	/** Roving tabindex: exactly one mark is tabbable so the toolbar is a single Tab stop. */
	private _updateTabStops(focusIndex: number): void {
		for (let i = 0; i < this._marks.length; i++) {
			this._marks[i].button.tabIndex = i === focusIndex ? 0 : -1;
		}
	}

	private _onMarksKeyDown(e: KeyboardEvent): void {
		if (this._marks.length === 0) {
			return;
		}
		const event = new StandardKeyboardEvent(e);
		const currentIndex = this._marks.findIndex(m => m.button === getWindow(this._domNode).document.activeElement);
		let nextIndex: number;
		switch (event.keyCode) {
			case KeyCode.DownArrow: nextIndex = Math.min(this._marks.length - 1, currentIndex + 1); break;
			case KeyCode.UpArrow: nextIndex = Math.max(0, currentIndex - 1); break;
			case KeyCode.Home: nextIndex = 0; break;
			case KeyCode.End: nextIndex = this._marks.length - 1; break;
			default: return;
		}
		event.preventDefault();
		event.stopPropagation();
		this._updateTabStops(nextIndex);
		this._marks[nextIndex]?.button.focus();
	}

	private _renderMark(entry: IMarkEntry, tick: PromptTick): void {
		entry.tick = tick;
		entry.button.setAttribute('aria-label', tick.ariaLabel);
		// Two-tone bar: a green added segment and a red removed segment, sized by
		// the turn's diff split. Gray when the turn made no edits.
		clearNode(entry.bar);
		const stat = tick.stat;
		const edited = !!stat && stat.added + stat.removed > 0;
		entry.bar.classList.toggle('edited', edited);
		if (edited) {
			// Only append the sides that exist so a pure-add turn is fully green and a
			// pure-delete turn fully red; the min-width floor keeps a lopsided split visible.
			if (stat!.added > 0) {
				append(entry.bar, $('span.seg-add')).style.flexGrow = String(stat!.added);
			}
			if (stat!.removed > 0) {
				append(entry.bar, $('span.seg-del')).style.flexGrow = String(stat!.removed);
			}
		}
	}

	setActive(requestId: string | undefined): void {
		this._activeRequestId = requestId;
		this._updateActiveClasses();
	}

	focusTick(requestId: string): void {
		this._marks.find(m => m.tick.requestId === requestId || m.tick.allRequestIds.includes(requestId))?.button.focus();
	}

	setHostWidth(width: number): void {
		if (width > 0 && width !== this._hostWidth) {
			this._hostWidth = width;
			this._relayout();
		}
	}

	setScrollLayout(layout: IPromptScrollLayout | undefined): void {
		this._layout = layout;
		// Scroll fires many events per frame; coalesce so we lay out (and touch the DOM) once.
		this._scheduleRelayout();
	}

	/** Coalesces relayout to at most once per animation frame. */
	private _scheduleRelayout(): void {
		if (this._relayoutScheduled.value) {
			return;
		}
		this._relayoutScheduled.value = scheduleAtNextAnimationFrame(getWindow(this._domNode), () => {
			this._relayoutScheduled.clear();
			this._relayout();
		});
	}

	/** Places each mark at its proportional scroll position, spaced so hit targets never overlap. */
	private _relayout(): void {
		// Use the cached height (refreshed only on resize) to avoid a forced reflow per scroll.
		const height = this._railHeight > 0 ? this._railHeight : (this._railHeight = this._domNode.clientHeight);
		const layout = this._layout;
		const overflowing = this._hostWidth < MIN_HOST_WIDTH;
		this._domNode.classList.toggle('overflowing', overflowing);
		if (overflowing || height <= 0 || !layout || layout.total <= 0) {
			return;
		}
		const scale = height / layout.total;
		const topById = new Map(layout.marks.map(m => [m.requestId, m.top]));

		// Collect visible marks (in order) with their desired proportional centre.
		const visible: { entry: IMarkEntry; center: number }[] = [];
		for (const entry of this._marks) {
			const top = topById.get(entry.tick.requestId);
			if (top === undefined) {
				entry.button.classList.add('hidden');
				entry.lastTop = undefined;
				continue;
			}
			entry.button.classList.remove('hidden');
			visible.push({ entry, center: top * scale });
		}

		// Prompts can sit arbitrarily close in content space (a short turn, or after height
		// re-estimates settle), which would let the >=24px hit targets overlap. Push adjacent
		// marks apart to keep a full target's spacing while staying as close to their
		// proportional position as the rail allows.
		spaceMarkCenters(visible, height, MIN_TARGET);

		for (const { entry, center } of visible) {
			// The button is a >=24px hit target centered on the mark's (spaced) position.
			const y = center - MIN_TARGET / 2;
			// Skip sub-pixel drift so estimate noise doesn't jitter the marks.
			if (entry.lastTop !== undefined && Math.abs(y - entry.lastTop) < RELAYOUT_MIN_DELTA) {
				continue;
			}
			entry.lastTop = y;
			entry.button.style.top = `${y}px`;
		}
	}

	private _updateActiveClasses(): void {
		for (const entry of this._marks) {
			const isActive = entry.tick.requestId === this._activeRequestId;
			entry.button.classList.toggle('active', isActive);
			if (isActive) {
				entry.button.setAttribute('aria-current', 'location');
			} else {
				entry.button.removeAttribute('aria-current');
			}
		}
	}

	private _showCard(entry: IMarkEntry): void {
		const markRect = entry.button.getBoundingClientRect();
		const domRect = this._domNode.getBoundingClientRect();
		this._card.show(entry.tick, markRect.top - domRect.top + markRect.height / 2);
	}

	private _ensureResizeObserver(): void {
		if (this._resizeObserverReady) {
			return;
		}
		const ResizeObserverCtor = getWindow(this._domNode).ResizeObserver;
		if (!ResizeObserverCtor) {
			return;
		}
		this._resizeObserverReady = true;
		const observer = new ResizeObserverCtor(() => {
			// Height only changes here (window/input-part resize); refresh the cache and lay out.
			this._railHeight = this._domNode.clientHeight;
			this._relayout();
		});
		observer.observe(this._domNode);
		this._register(toDisposable(() => observer.disconnect()));
	}
}
