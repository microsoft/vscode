/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, clearNode, EventType, getWindow, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { disposableTimeout } from '../../../../base/common/async.js';
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
/** Below this transcript width the rail hides so it does not crowd the content (and the native scrollbar is kept). */
export const MIN_HOST_WIDTH = 320;
/** Skip re-positioning a mark for sub-pixel drift, so estimate noise doesn't cause micro-jitter. */
const RELAYOUT_MIN_DELTA = 0.5;
/** Fisheye "fan" lens: standard deviation (px) of the magnification falloff around the focus. */
const FAN_SIGMA = 40;
/** Fisheye "fan" lens: how far (px) neighbouring marks are pushed apart around the focus. */
const FAN_SPREAD = 14;
/** The fan lingers this long (ms) after the last scroll — while the pointer is away — before collapsing. */
const FAN_LINGER = 2000;
/** A hard wheel flick only reveals the fan if the transcript actually scrolls within this window (ms) — so flicking against the top/bottom limit, which moves nothing, never blooms it. */
const HARD_WHEEL_REVEAL_WINDOW = 200;
/**
 * Pill placement. `'proportional'` scatters pills at their real scroll position (an overview ruler);
 * `'even'` stacks them as an evenly-spaced dock centred in the lane (stable under virtualization, and
 * tidier when big responses would otherwise cluster the pills). The scrollbar thumb stays proportional
 * either way, and the fan is hidden until engaged, so `'even'` still reads calmly at rest.
 */
const PILL_LAYOUT: 'proportional' | 'even' = 'even';
/** Even layout: vertical gap (px) between pill centres — also the min so hit targets never overlap. */
const EVEN_PILL_SPACING = 26;

interface IMarkEntry {
	tick: PromptTick;
	readonly button: HTMLButtonElement;
	readonly bar: HTMLElement;
	/** Last applied `top` (px) so tiny relayout deltas can be skipped. */
	lastTop?: number;
	/** Proportional (pre-fan) centre (px) from the last layout, used as the fan's rest position. */
	baseCenter?: number;
}

/**
 * The overview-ruler rail. The whole session is compressed into the rail height
 * like the editor's overview ruler: each prompt is a mark at its proportional
 * scroll position, coloured only to signal whether it changed code. The rail sits
 * in a gutter just beside the transcript's native scrollbar (which keeps handling
 * scroll and position); the active mark is the "you-are-here". Detail lives in the
 * hover card.
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
	/** Lane-local Y the fisheye "fan" magnifies around, or undefined when the fan is at rest. */
	private _fanCenter: number | undefined;
	/** Cached top (client px) of the marks column, captured on pointer-enter so the fan can follow the cursor without a per-move reflow. */
	private _laneTop = 0;
	/** Cached client Y of the rail's top edge, refreshed on resize; used to place the hover card and derive the lane-local pointer Y without a per-hover forced reflow. */
	private _domTop: number | undefined;
	/** True while the pointer is over the lane (keeps the fan open; the linger only collapses once it leaves). */
	private _hovering = false;
	/** Timestamp (ms) of the last hard/fast wheel flick; the fan blooms only if a real scroll follows it within {@link HARD_WHEEL_REVEAL_WINDOW}. */
	private _hardWheelAt = 0;
	/** Last scroll offset seen, to detect real transcript movement (vs. a wheel that hit the scroll limit and moved nothing). */
	private _lastScrollTop: number | undefined;
	/** Collapses the fan {@link FAN_LINGER}ms after the last scroll, unless the pointer is keeping it open. */
	private readonly _fanHide = this._register(new MutableDisposable());
	/** Timestamp (ms) of the last scroll/leave that should keep the fan up; the linger timer re-checks this instead of being churned every scroll frame. */
	private _lastFanActivityAt = 0;
	/** When the user prefers reduced motion the fan is disabled (marks stay their calm rest size). */
	private _reducedMotion = false;
	/** True while keyboard focus is inside the rail: the marks stay revealed (`:focus-within`) but the fisheye is suppressed. */
	private _focused = false;

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

		// Hovering anywhere along the marks column blooms the fisheye "fan" and lets it FOLLOW the
		// cursor (a macOS-dock feel). The lane's top edge is cached (refreshed on resize) so each
		// hover/move converts the pointer Y to lane-local space without a per-event
		// getBoundingClientRect (a forced reflow that would stutter while the transcript's styles are
		// dirty during scroll).
		this._register(addDisposableListener(this._marksContainer, EventType.MOUSE_ENTER, e => {
			this._laneTop = this._laneTopNow();
			this._hovering = true;
			this._fanHide.clear(); // hovering keeps the fan open — no linger countdown
			this._engage(e.clientY - this._laneTop);
		}));
		this._register(addDisposableListener(this._marksContainer, EventType.MOUSE_MOVE, e => {
			this._hovering = true;
			this._engage(e.clientY - this._laneTop);
		}));
		this._register(addDisposableListener(this._marksContainer, EventType.MOUSE_LEAVE, () => {
			this._hovering = false;
			this._scheduleFanHide();
		}));

		// The fan is a pointer-only flourish, so it must respect reduced-motion. Read it now and
		// track changes; keyboard users always get the calm, static marks + card + navigation.
		const win = getWindow(this._domNode);
		const reducedMotionQuery = win.matchMedia?.('(prefers-reduced-motion: reduce)');
		if (reducedMotionQuery) {
			this._reducedMotion = reducedMotionQuery.matches;
			this._register(addDisposableListener(reducedMotionQuery, 'change', () => {
				this._reducedMotion = reducedMotionQuery.matches;
				this._applyFan();
			}));
		}

		// Keyboard focus reveals a calm dock: the marks stay up (`:focus-within` in CSS) but the fisheye
		// is suppressed, so tabbing through never leaves the pills magnified from an earlier scroll.
		this._register(addDisposableListener(this._domNode, EventType.FOCUS_IN, () => {
			this._focused = true;
			this._collapseFan();
		}));
		this._register(addDisposableListener(this._domNode, EventType.FOCUS_OUT, () => {
			if (!this._domNode.contains(getWindow(this._domNode).document.activeElement)) {
				this._focused = false;
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

	/**
	 * Records a hard/fast wheel flick. The fan does NOT bloom here — it blooms only if the transcript
	 * actually scrolls shortly after (see {@link setScrollLayout}). This way a hard flick against the
	 * top/bottom scroll limit, which moves nothing, never reveals the fan.
	 */
	notifyHardWheel(): void {
		this._hardWheelAt = Date.now();
	}

	/** Lane-local Y of the active mark (the prompt currently scrolled to), or the nearest visible one. */
	private _activeCenter(): number | undefined {
		const active = this._marks.find(m => m.tick.requestId === this._activeRequestId && m.baseCenter !== undefined);
		if (active?.baseCenter !== undefined) {
			return active.baseCenter;
		}
		// Fall back to the last laid-out mark (or the first) so a scroll still blooms somewhere real.
		const laidOut = this._marks.filter(m => m.baseCenter !== undefined);
		return laidOut.at(-1)?.baseCenter;
	}

	/**
	 * Lane-local Y for the fisheye focus while SCROLLING: glides continuously with the viewport by
	 * interpolating between pills. Each prompt has a content position (`layout.marks[].top`) and a dock
	 * position (`baseCenter`); we find where the viewport (`scrollTop`) sits between two prompts in
	 * content space and place the focus at the matching fraction between their dock positions. So the
	 * fisheye travels smoothly through the pills as you scroll (rather than snapping at prompt
	 * boundaries), while still tracking the real scroll position. Returns `undefined` if not laid out.
	 */
	private _scrollFanCenter(): number | undefined {
		const layout = this._layout;
		if (!layout) {
			return undefined;
		}
		const topById = new Map(layout.marks.map(m => [m.requestId, m.top]));
		const pts: { contentTop: number; center: number }[] = [];
		for (const entry of this._marks) {
			const contentTop = topById.get(entry.tick.requestId);
			if (contentTop !== undefined && entry.baseCenter !== undefined) {
				pts.push({ contentTop, center: entry.baseCenter });
			}
		}
		if (pts.length === 0) {
			return undefined;
		}
		pts.sort((a, b) => a.contentTop - b.contentTop);
		// `contentTop`s are in the adaptive ESTIMATED space (summing to `layout.total`), but
		// `layout.scrollTop`/`scrollHeight` are the transcript's REAL scroll space. Under virtualization
		// those spaces differ, so scale the scroll position into the estimated space before comparing.
		const scrollTop = layout.scrollHeight > 0
			? (layout.scrollTop / layout.scrollHeight) * layout.total
			: layout.scrollTop;
		if (scrollTop <= pts[0].contentTop) {
			return pts[0].center;
		}
		const last = pts[pts.length - 1];
		if (scrollTop >= last.contentTop) {
			return last.center;
		}
		for (let i = 0; i < pts.length - 1; i++) {
			const a = pts[i];
			const b = pts[i + 1];
			if (scrollTop >= a.contentTop && scrollTop <= b.contentTop) {
				const span = b.contentTop - a.contentTop;
				const frac = span > 0 ? (scrollTop - a.contentTop) / span : 0;
				return a.center + frac * (b.center - a.center);
			}
		}
		return last.center;
	}

	setActive(requestId: string | undefined): void {
		this._activeRequestId = requestId;
		this._updateActiveClasses();
		// Note: the scroll-driven fan follow is handled continuously in `_relayout` (it glides with the
		// viewport), so we do not re-centre here — that would snap the fan at prompt boundaries.
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
		const prevScrollTop = this._lastScrollTop;
		this._layout = layout;
		if (layout) {
			this._lastScrollTop = layout.scrollTop;
			// Only react to a REAL scroll movement. A wheel flick against the top/bottom limit fires
			// wheel events (so notifyHardWheel runs) but doesn't change scrollTop, so it never reveals
			// the fan here. Programmatic nudges during virtualization re-measure lack a recent hard
			// wheel, so they don't reveal it either.
			if (prevScrollTop !== undefined && Math.abs(layout.scrollTop - prevScrollTop) > 0.5) {
				this._onScrolled();
			}
		}
		// Scroll fires many events per frame; coalesce so we lay out (and touch the DOM) once.
		this._scheduleRelayout();
	}

	/**
	 * Handles a real transcript scroll: blooms the fan if it followed a deliberate hard flick, and
	 * keeps it alive (re-arms the linger) while you keep scrolling. Pointer hover owns the fan on its
	 * own, so this defers to it.
	 */
	private _onScrolled(): void {
		if (this._hovering || this._focused) {
			return;
		}
		if (this._domNode.classList.contains('engaged')) {
			// Already open: keep it up while actively scrolling (the glide happens in `_relayout`).
			this._scheduleFanHide();
			return;
		}
		// Not open yet: only a deliberate hard flick that actually moved the transcript blooms it.
		if (Date.now() - this._hardWheelAt <= HARD_WHEEL_REVEAL_WINDOW) {
			const center = this._scrollFanCenter() ?? this._activeCenter();
			if (center !== undefined) {
				this._engage(center);
				this._scheduleFanHide();
			}
		}
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
				entry.baseCenter = undefined;
				entry.button.style.transform = '';
				entry.bar.style.transform = '';
				continue;
			}
			entry.button.classList.remove('hidden');
			visible.push({ entry, center: top * scale });
		}

		if (PILL_LAYOUT === 'even') {
			// Evenly-spaced dock, centred vertically as a group. Stable under virtualization (pills do
			// not drift as row heights re-measure) and tidy when big responses would cluster them.
			this._spaceEvenCenters(visible, height);
		} else {
			// Prompts can sit arbitrarily close in content space (a short turn, or after height
			// re-estimates settle), which would let the >=24px hit targets overlap. Push adjacent
			// marks apart to keep a full target's spacing while staying as close to their
			// proportional position as the rail allows.
			spaceMarkCenters(visible, height, MIN_TARGET);
		}

		for (const { entry, center } of visible) {
			entry.baseCenter = center;
			// The button is a >=24px hit target centered on the mark's (spaced) position.
			const y = center - MIN_TARGET / 2;
			// Skip sub-pixel drift so estimate noise doesn't jitter the marks.
			if (entry.lastTop !== undefined && Math.abs(y - entry.lastTop) < RELAYOUT_MIN_DELTA) {
				continue;
			}
			entry.lastTop = y;
			entry.button.style.top = `${y}px`;
		}

		// While the fan is open because of scrolling (not steered by the pointer, and not while keyboard
		// focus is showing the calm dock), glide its focus with the viewport so the fisheye travels
		// smoothly through the pills as you scroll.
		if (this._domNode.classList.contains('engaged') && !this._hovering && !this._focused) {
			const scrollCenter = this._scrollFanCenter();
			if (scrollCenter !== undefined) {
				this._fanCenter = scrollCenter;
			}
		}

		// Re-apply the pointer fisheye against the freshly measured rest positions.
		this._applyFan();
	}

	/**
	 * Even (dock) placement: stacks the pills at a fixed spacing and centres the whole group in the
	 * lane. If the group is taller than the lane it distributes across the full height instead, so a
	 * long session still fits. Mutates each item's `center` in place.
	 */
	private _spaceEvenCenters(visible: { entry: IMarkEntry; center: number }[], height: number): void {
		const n = visible.length;
		if (n === 0) {
			return;
		}
		const groupHeight = n * EVEN_PILL_SPACING;
		let start: number;
		let step: number;
		if (groupHeight <= height) {
			// Compact group centred vertically.
			step = EVEN_PILL_SPACING;
			start = (height - groupHeight) / 2 + step / 2;
		} else {
			// Too many to fit at the ideal spacing: spread evenly across the full height.
			step = (height - EVEN_PILL_SPACING) / (n - 1);
			start = EVEN_PILL_SPACING / 2;
		}
		for (let i = 0; i < n; i++) {
			visible[i].center = start + i * step;
		}
	}

	/**
	 * Fisheye "fan": magnify the marks near {@link _fanCenter} and gently spread their neighbours
	 * apart, so a dense cluster becomes easy to read and click. It is a pointer-only flourish layered
	 * on top of the proportional layout — the marks' `top` (owned by `_relayout`) is untouched; the
	 * fan only adds a CSS `transform`, so keyboard navigation and the base layout are unaffected.
	 * Disabled entirely under reduced-motion.
	 */
	private _applyFan(): void {
		const center = this._fanCenter;
		const fanning = center !== undefined && !this._reducedMotion;
		for (const entry of this._marks) {
			if (entry.baseCenter === undefined) {
				continue;
			}
			if (!fanning) {
				entry.button.style.transform = '';
				entry.bar.style.transform = '';
				continue;
			}
			const d = entry.baseCenter - center!;
			const m = Math.exp(-(d * d) / (2 * FAN_SIGMA * FAN_SIGMA));
			// Spread neighbours away from the focus (dock feel) and grow the focused bar the most.
			entry.button.style.transform = `translateY(${FAN_SPREAD * Math.tanh(d / FAN_SIGMA)}px)`;
			entry.bar.style.transform = `scale(${1 + m * 0.9}, ${1 + m * 0.6})`;
		}
	}

	/**
	 * Opens the fan at {@link center} (lane-local Y): reveals the marks (via `.engaged`) and applies
	 * the fisheye. Reveal happens even under reduced motion (the marks just don't magnify).
	 */
	private _engage(center: number): void {
		this._domNode.classList.add('engaged');
		this._fanCenter = center;
		this._applyFan();
	}

	/** Collapses the fan back to the plain scrollbar (marks hidden, no fisheye). */
	private _collapseFan(): void {
		if (!this._domNode.classList.contains('engaged')) {
			return;
		}
		this._domNode.classList.remove('engaged');
		this._fanCenter = undefined;
		this._applyFan();
	}

	/**
	 * (Re)starts the linger countdown: {@link FAN_LINGER}ms after the last scroll the fan collapses —
	 * but only if the pointer is not keeping it open. Called on every scroll frame and when the pointer
	 * leaves, so it avoids churning the timer: it just stamps the activity time and, when the single
	 * running timer fires, it re-arms for the remaining time if more scrolling happened since.
	 */
	private _scheduleFanHide(): void {
		this._lastFanActivityAt = Date.now();
		if (!this._fanHide.value) {
			this._armFanHide(FAN_LINGER);
		}
	}

	private _armFanHide(delay: number): void {
		this._fanHide.value = disposableTimeout(() => {
			this._fanHide.clear();
			if (this._hovering) {
				return; // hovering keeps it up; leaving re-arms the countdown
			}
			const remaining = FAN_LINGER - (Date.now() - this._lastFanActivityAt);
			if (remaining > 0) {
				this._armFanHide(remaining); // more scrolling happened since — keep waiting
			} else {
				this._collapseFan();
			}
		}, delay);
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

	/** Lane-local Y (client px) of the marks column top, from the cached rail top (refreshed on resize). Reads layout lazily only if the cache is not yet primed, so hovering never forces a reflow mid-scroll. */
	private _laneTopNow(): number {
		if (this._domTop === undefined) {
			this._domTop = this._domNode.getBoundingClientRect().top;
		}
		// The marks column is inset:0 at the top, so its client top equals the rail's.
		return this._domTop;
	}

	private _showCard(entry: IMarkEntry): void {
		// Position the card from the mark's known lane-local centre instead of reading
		// getBoundingClientRect (a forced synchronous layout that stutters while the transcript's
		// styles are dirty during scroll). The marks column is inset:0 at the top, so `baseCenter`
		// is the Y relative to the rail; the hovered mark sits near the fan focus, where its
		// magnification translate is ~0, so this matches the visible position. Falls back to a
		// measured rect only if the mark has not been laid out yet.
		const centerY = entry.baseCenter
			?? (entry.button.getBoundingClientRect().top - this._domNode.getBoundingClientRect().top + MIN_TARGET / 2);
		this._card.show(entry.tick, centerY);
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
			// Height only changes here (window/input-part resize); refresh the cached height and top
			// (used by hover/scrub to avoid per-event reflows) and lay out.
			this._railHeight = this._domNode.clientHeight;
			this._domTop = this._domNode.getBoundingClientRect().top;
			this._relayout();
		});
		observer.observe(this._domNode);
		this._register(toDisposable(() => observer.disconnect()));
	}
}
