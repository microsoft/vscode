/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, clearNode, EventType, getWindow } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { MIN_HOST_WIDTH } from './promptTimelineLayout.js';
import { PromptTick } from './promptTimelineModel.js';
import { IPromptTimelineRail } from './promptTimelineRail.js';
import './media/promptTimeline.css';

/**
 * Upper bound on the number of resting dots drawn on the handle. The flyout list is uncapped (it
 * lists every prompt), but the dot column would grow unboundedly tall for very long sessions, so it
 * is capped: past the cap the dots are evenly sampled across the session (every dot still stands for
 * a real prompt, so the "you are here" dot always exists) and a trailing marker signals the sampling.
 */
const MAX_REST_DOTS = 50;
/** Never sample below this: two dots are the fewest that can still span the session's start and end. */
const MIN_REST_DOTS = 2;
const WHEEL_GESTURE_GAP_MS = 120;
/**
 * Resting-dot geometry, mirrored from the `--prompt-timeline-gutter-*` variables in
 * `promptTimeline.css` so {@link restDotCount} can size the column without measuring it (which would
 * force a reflow per render). Keep the two in sync.
 */
const DOT_SIZE = 4;
const DOT_GAP = 4;
const HANDLE_PADDING_Y = 8;
const MORE_MARKER_HEIGHT = 8;
/** Clearance kept between the handle and the transcript's top/bottom edges (`--prompt-timeline-gutter-inset`). */
const GUTTER_INSET = 12;

/** How many resting dots fit for `promptCount` prompts in a rail `railHeight` px tall (0 when unmeasured). */
export function restDotCount(promptCount: number, railHeight: number): number {
	const capped = Math.min(promptCount, MAX_REST_DOTS);
	if (promptCount <= MIN_REST_DOTS || railHeight <= 0) {
		return capped;
	}
	const available = railHeight - 2 * (GUTTER_INSET + HANDLE_PADDING_Y);
	const step = DOT_SIZE + DOT_GAP;
	// Skip the marker's reservation only if the fixed cap left every prompt its own dot.
	if (capped === promptCount && Math.floor((available + DOT_GAP) / step) >= promptCount) {
		return capped;
	}
	return Math.max(MIN_REST_DOTS, Math.min(capped, Math.floor((available - MORE_MARKER_HEIGHT) / step)));
}

/** Where a row preview came from — see {@link PromptTimelineGutterRail._setPreview}. */
type PreviewSource = 'dot' | 'row';

interface IRowEntry {
	tick: PromptTick;
	readonly container: HTMLElement;
	readonly jump: HTMLButtonElement;
	readonly label: HTMLElement;
}

/** Unique-per-instance suffix so the flyout's id (referenced by the handle's `aria-controls`) never collides. */
let gutterIdSeq = 0;

/** A left-edge handle that opens a list of prompt titles for navigating the transcript. */
export class PromptTimelineGutterRail extends Disposable implements IPromptTimelineRail {

	private readonly _domNode: HTMLElement;
	private readonly _rest: HTMLButtonElement;
	private readonly _list: HTMLElement;
	private readonly _rowDisposables = this._register(new DisposableStore());
	/** Held separately from {@link _rowDisposables}: the dots are re-rendered on resize, without the rows. */
	private readonly _dotDisposables = this._register(new DisposableStore());
	private readonly _rows: IRowEntry[] = [];
	/** The resting dots, in order; `_dotTicks[i]` is the tick index dot `i` stands for. */
	private readonly _dots: HTMLElement[] = [];
	private readonly _dotTicks: number[] = [];
	private _activeRequestId: string | undefined;
	private _hostWidth = Number.POSITIVE_INFINITY;
	/** Cached rail height; only changes on resize (observed), so rendering never forces a reflow to read it. */
	private _railHeight = 0;
	private _resizeObserverReady = false;
	/** Prompt count of the last {@link setTicks}, so a resize can re-sample the dots without new ticks. */
	private _tickCount = 0;
	/** Disclosure held open by explicit activation (handle click/tap/keyboard, or a row focused via keyboard). */
	private _open = false;
	/** Pointer is over the rail; reveals the flyout transiently (independent of {@link _open}). */
	private _hovering = false;
	/** Tick index previewed by the dot currently under the pointer, or `-1` when no dot is hovered. */
	private _previewIndex = -1;
	/** Row currently showing the full-width preview band, or `-1`; only dot-driven previews band. */
	private _previewBand = -1;
	/** Tick index of the prompt the transcript is scrolled to, or `-1`; re-applied when the dots re-render. */
	private _activeIndex = -1;
	/** Row holding the flyout's single tab stop. */
	private _focusRow = 0;
	private _loadOlder: (() => Promise<void>) | undefined;
	private _loadingOlder: (() => Promise<void>) | undefined;
	private _olderButton: Button | undefined;
	private _loadingFromButton = false;
	private _historyError: HTMLElement | undefined;

	private readonly _onDidSelect = this._register(new Emitter<string>());
	readonly onDidSelect: Event<string> = this._onDidSelect.event;

	get domNode(): HTMLElement { return this._domNode; }

	constructor() {
		super();
		this._domNode = $('nav.prompt-timeline-rail.prompt-timeline-rail-gutter');
		this._domNode.setAttribute('aria-label', localize('promptTimeline.gutter.railLabel', "Prompt timeline"));
		this._domNode.setAttribute('role', 'toolbar');
		this._domNode.setAttribute('aria-orientation', 'vertical');

		const panelId = `prompt-timeline-gutter-panel-${gutterIdSeq++}`;

		// The resting affordance is a disclosure button that expands the flyout. It carries one dot per
		// prompt (built in `setTicks`); the dots are decorative — pointer targets only, never focusable —
		// so the button owns the accessible name and the flyout rows carry the per-prompt semantics.
		this._rest = append(this._domNode, $<HTMLButtonElement>('button.prompt-timeline-gutter-rest'));
		this._rest.setAttribute('aria-haspopup', 'true');
		this._rest.setAttribute('aria-expanded', 'false');
		this._rest.setAttribute('aria-controls', panelId);
		this._rest.setAttribute('aria-label', localize('promptTimeline.gutter.toggleLabel', "Show prompts"));
		this._rest.tabIndex = 0;

		this._list = append(this._domNode, $('.prompt-timeline-gutter-panel'));
		this._list.id = panelId;
		this._register(addDisposableListener(this._list, EventType.SCROLL, () => {
			if (this._loadOlder || this._loadingFromButton) {
				this._updateOlderHistoryChevron();
			}
		}));
		let lastWheelTime = -Infinity;
		let pagedInGesture = false;
		this._register(addDisposableListener(this._list, 'wheel', e => {
			if (e.timeStamp - lastWheelTime > WHEEL_GESTURE_GAP_MS || e.deltaY > 0) {
				pagedInGesture = false;
			}
			lastWheelTime = e.timeStamp;
			if (!pagedInGesture && this._loadOlder && e.deltaY < 0 && !e.ctrlKey && !e.shiftKey && this._atHistoryStart()) {
				pagedInGesture = true;
				void this._requestOlder();
			}
		}));
		let touchY: number | undefined;
		this._register(addDisposableListener(this._list, 'touchstart', (e: TouchEvent) => {
			touchY = e.touches.length === 1 ? e.touches[0].clientY : undefined;
		}, { passive: true }));
		this._register(addDisposableListener(this._list, 'touchmove', (e: TouchEvent) => {
			if (touchY !== undefined && e.touches.length === 1 && e.touches[0].clientY > touchY && this._atHistoryStart()) {
				touchY = undefined;
				void this._requestOlder();
			}
		}, { passive: true }));

		// Mouse: reveal while the pointer is over the rail subtree. The rail element is
		// pointer-transparent (its children opt back in), so `mouseenter` never fires on it — bubble
		// `mouseover`/`mouseout` from the handle and flyout instead, and only collapse once the pointer
		// truly leaves the rail subtree. The handle and the flyout are laid out flush (the flyout starts
		// exactly at the handle's right edge — see the shared `--prompt-timeline-gutter-handle-*` vars), so
		// they form one contiguous hover region: travelling between them keeps `relatedTarget` inside the
		// rail and never collapses, which means a leave here is always a real leave.
		this._register(addDisposableListener(this._domNode, EventType.MOUSE_OVER, () => {
			this._hovering = true;
			this._updateRevealed();
		}));
		this._register(addDisposableListener(this._domNode, EventType.MOUSE_OUT, (e: MouseEvent) => {
			if (!this._domNode.contains(e.relatedTarget as Node | null)) {
				this._hovering = false;
				this._setPreview(-1);
				this._updateRevealed();
			}
		}));

		// Keep row and dot feedback paired whichever side of the gutter rail the pointer enters from.
		this._register(addDisposableListener(this._list, EventType.MOUSE_OVER, e => {
			const target = e.target as Node | null;
			const rowIndex = target === null ? -1 : this._rows.findIndex(row => row.container.contains(target));
			this._setPreview(rowIndex, 'row');
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
			} else if (event.keyCode === KeyCode.UpArrow && this._open && this._rows.length === 0) {
				event.preventDefault();
				event.stopPropagation();
				void this._requestOlder();
			}
		}));

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
			this._focusPrompt(this._focusRow);
			if (!this._rows.length) {
				void this._requestOlder();
			}
		}
	}

	setOlderHistoryLoader(loadOlder: (() => Promise<void>) | undefined): void {
		if (this._loadOlder !== loadOlder) {
			this._loadOlder = loadOlder;
			if (loadOlder && !this._olderButton) {
				this._olderButton = this._createOlderButton();
			}
			if (loadOlder && this._loadingOlder !== loadOlder) {
				this._loadingFromButton = false;
				this._setOlderButtonLoading(false);
			}
			this._historyError?.remove();
			this._historyError = undefined;
			this._rest.classList.toggle('has-older-prompts', !!loadOlder);
			this._rest.ariaDescription = loadOlder ? localize('promptTimeline.gutter.olderPromptsHint', "Press Up Arrow on the first prompt to load earlier prompts.") : null;
			this._updateOlderHistoryChevron();
		}
	}

	private _createOlderButton(): Button {
		const label = localize('promptTimeline.gutter.loadEarlier', "Load Earlier Prompts");
		const button = this._register(new Button(this._list, { ariaLabel: label, title: label }));
		button.element.classList.add('prompt-timeline-gutter-older');
		this._list.prepend(button.element);
		this._register(addDisposableListener(button.element, EventType.FOCUS, () => {
			this._open = true;
			this._updateRevealed();
		}));
		this._register(button.onDidClick(() => {
			button.focus();
			void this._requestOlder(true);
		}));
		this._register(button.onDidEscape(() => this._close()));
		return button;
	}

	private _setOlderButtonLoading(loading: boolean): void {
		const button = this._olderButton;
		if (button) {
			const icon = renderIcon(loading ? Codicon.ellipsis : Codicon.chevronUpCompact);
			icon.ariaHidden = 'true';
			button.element.replaceChildren(icon);
			button.element.ariaBusy = String(loading);
			button.enabled = !loading;
		}
	}

	private _atHistoryStart(): boolean {
		return this._list.scrollTop <= 1;
	}

	private _updateOlderHistoryChevron(): void {
		// The final cursor can disappear before all the prompts from that page have been inserted.
		const hasOlder = !!this._loadOlder || (this._loadingFromButton && !!this._olderButton?.hasFocus());
		const show = hasOlder && this._atHistoryStart();
		if (!show && this._olderButton?.hasFocus()) {
			const target = this._rows[hasOlder ? this._focusRow : 0]?.jump;
			(target ?? this._rest).focus({ preventScroll: true });
		}
		this._list.classList.toggle('has-older-prompts', hasOlder);
		this._list.classList.toggle('show-older-prompts-chevron', show);
	}

	private async _requestOlder(fromButton = false): Promise<void> {
		const load = this._loadOlder;
		if (!load || this._loadingOlder === load || (!this._open && !this._hovering)) {
			return;
		}
		this._loadingOlder = load;
		this._loadingFromButton = fromButton;
		this._setOlderButtonLoading(true);
		this._historyError?.remove();
		this._historyError = undefined;
		try {
			await load();
		} catch {
			if (load === this._loadOlder && !this._store.isDisposed && (this._open || this._hovering)) {
				this._historyError = $('span.prompt-timeline-gutter-error', { role: 'status' });
				this._list.prepend(this._historyError);
				this._historyError.textContent = localize('promptTimeline.gutter.historyError', "Could not load earlier prompts. Try again.");
			}
		} finally {
			if (this._loadingOlder === load) {
				this._loadingOlder = undefined;
				this._loadingFromButton = false;
				if (!this._store.isDisposed) {
					this._setOlderButtonLoading(false);
					this._updateOlderHistoryChevron();
				}
			}
		}
	}

	private _close(): void {
		this._open = false;
		this._updateRevealed();
		this._rest.focus();
	}

	/**
	 * Rebuilds the resting handle's dots. There is one dot per prompt as long as they fit — capped by
	 * {@link MAX_REST_DOTS} and by the room the rail actually has (see {@link restDotCount}); beyond
	 * that the dots are evenly sampled across the session so every dot still stands for a real prompt
	 * (and the active prompt always maps to one), with a trailing marker signalling the sampling.
	 */
	private _renderDots(count: number): void {
		this._dotDisposables.clear();
		clearNode(this._rest);
		this._dots.length = 0;
		this._dotTicks.length = 0;
		const dots = restDotCount(count, this._railHeight);
		for (let i = 0; i < dots; i++) {
			const dot = append(this._rest, $('.prompt-timeline-gutter-dot'));
			const tickIndex = dots === count ? i : Math.round(i * (count - 1) / (dots - 1));
			this._dots.push(dot);
			this._dotTicks.push(tickIndex);
			// Hovering a dot previews the prompt it stands for: the flyout is already revealed by the
			// bubbling `mouseover`, so this just brings that row into view and highlights it.
			this._dotDisposables.add(addDisposableListener(dot, EventType.MOUSE_OVER, () => this._setPreview(tickIndex)));
		}
		// The dots are sampled rather than one-per-prompt: a small trailing marker signals the elision.
		if (count > dots) {
			append(this._rest, $('.prompt-timeline-gutter-dot-more'));
		}
		this._updateDotHighlights();
	}

	/**
	 * Observes the rail so the dot column keeps fitting when the transcript's height changes — the
	 * window resizing, the chat input growing, a split view. The rail is only mounted once, so the
	 * observer is created on the first render and lives for the rail's lifetime.
	 */
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
			// Ignore the zero height the rail reports while hidden, so the last real measurement (and
			// with it the dot count) survives until it is shown again.
			const height = this._domNode.clientHeight;
			if (height <= 0 || height === this._railHeight) {
				return;
			}
			this._railHeight = height;
			if (restDotCount(this._tickCount, height) !== this._dots.length) {
				this._renderDots(this._tickCount);
			}
		});
		observer.observe(this._domNode);
		this._register(toDisposable(() => observer.disconnect()));
	}

	/** A dot previews its corresponding row; a row under the pointer already has a hover highlight. */
	private _setPreview(index: number, source: PreviewSource = 'dot'): void {
		const band = source === 'dot' ? index : -1;
		if (this._previewIndex === index && this._previewBand === band) {
			return;
		}
		this._previewIndex = index;
		this._previewBand = band;
		for (let i = 0; i < this._rows.length; i++) {
			this._rows[i].container.classList.toggle('preview', i === band);
		}
		this._updateDotHighlights();
		if (index >= 0) {
			this._revealRow(index);
		}
	}

	/**
	 * Accents the dots standing for the active ("you are here") and previewed prompts. Once the dots
	 * are sampled the nearest dot stands in, so both accents survive a re-sampling on resize.
	 */
	private _updateDotHighlights(): void {
		const activeDot = this._findNearestDotIndex(this._activeIndex);
		const previewDot = this._findNearestDotIndex(this._previewIndex);
		for (let i = 0; i < this._dots.length; i++) {
			this._dots[i].classList.toggle('active', i === activeDot);
			this._dots[i].classList.toggle('preview', i === previewDot);
		}
	}

	private _findNearestDotIndex(tickIndex: number): number {
		if (tickIndex < 0) {
			return -1;
		}
		let nearestDot = -1;
		let bestDelta = Number.POSITIVE_INFINITY;
		for (let i = 0; i < this._dotTicks.length; i++) {
			const delta = Math.abs(this._dotTicks[i] - tickIndex);
			if (delta < bestDelta) {
				bestDelta = delta;
				nearestDot = i;
			}
		}
		return nearestDot;
	}

	/**
	 * Scrolls a row into view inside the flyout. Done by hand rather than with `scrollIntoView` so a
	 * hover can never scroll the transcript (or any other ancestor) behind the rail.
	 */
	private _revealRow(index: number): void {
		const container = this._rows[index]?.container;
		if (!container) {
			return;
		}
		const top = index === 0 && this._loadOlder ? 0 : container.offsetTop;
		const bottom = container.offsetTop + container.offsetHeight;
		const viewTop = this._list.scrollTop;
		const viewBottom = viewTop + this._list.clientHeight;
		if (top < viewTop) {
			this._list.scrollTop = top;
		} else if (bottom > viewBottom) {
			this._list.scrollTop = bottom - this._list.clientHeight;
		}
	}

	setTicks(ticks: readonly PromptTick[]): void {
		this._tickCount = ticks.length;
		// The rail is displayed by the time ticks arrive, so this is the first chance to measure it.
		this._ensureResizeObserver();
		if (this._railHeight <= 0) {
			this._railHeight = this._domNode.clientHeight;
		}
		const start = this._rows.length && ticks.length > this._rows.length ? ticks.findIndex(t => t.requestId === this._rows[0].tick.requestId) : -1;
		if (start >= 0 && this._rows.every((r, i) => r.tick.requestId === ticks[start + i]?.requestId)) {
			const first = this._rows[0].container;
			const showButtonPage = start > 0 && this._loadingFromButton && this._olderButton?.hasFocus() && this._atHistoryStart();
			const preserveScroll = start > 0 && !showButtonPage && (this._open || this._hovering);
			const relativeTop = preserveScroll ? first.offsetTop - this._list.scrollTop : 0;
			this._setPreview(-1);
			const prefix = ticks.slice(0, start).map(t => this._createRow(t));
			if (prefix.length) {
				first.before(...prefix.map(r => r.container));
				this._rows.unshift(...prefix);
				this._focusRow += start;
			}
			for (let i = this._rows.length; i < ticks.length; i++) {
				const row = this._createRow(ticks[i]);
				this._list.appendChild(row.container);
				this._rows.push(row);
			}
			this._renderDots(ticks.length);
			if (showButtonPage) {
				this._list.scrollTop = 0;
			} else if (preserveScroll) {
				this._list.scrollTop = first.offsetTop - relativeTop;
			}
		}
		const sameStructure = ticks.length === this._rows.length
			&& ticks.every((t, i) => this._rows[i]?.tick.requestId === t.requestId);
		if (sameStructure) {
			for (let i = 0; i < ticks.length; i++) {
				const row = this._rows[i];
				if (row.tick.text !== ticks[i].text || row.tick.ariaLabel !== ticks[i].ariaLabel) {
					this._renderRow(row, ticks[i]);
				}
			}
			this._updateTabStops(this._focusRow);
			this._updateActiveClasses();
			return;
		}

		this._rowDisposables.clear();
		for (const row of this._rows) {
			row.container.remove();
		}
		this._rows.length = 0;
		this._previewIndex = -1;
		this._previewBand = -1;
		// The resting dots preview how many prompts the flyout holds and where the transcript is.
		this._renderDots(ticks.length);

		for (const tick of ticks) {
			const entry = this._createRow(tick);
			this._list.appendChild(entry.container);
			this._rows.push(entry);
		}

		const activeIndex = this._rows.findIndex(r => r.tick.requestId === this._activeRequestId);
		this._updateTabStops(activeIndex >= 0 ? activeIndex : 0);
		this._updateActiveClasses();
	}

	private _createRow(tick: PromptTick): IRowEntry {
		const container = $('.prompt-timeline-gutter-row');
		const jump = append(container, $<HTMLButtonElement>('button.prompt-timeline-gutter-row-jump'));
		jump.tabIndex = -1;
		const label = append(jump, $('span.prompt-timeline-gutter-row-label'));
		const entry: IRowEntry = { tick, container, jump, label };
		this._renderRow(entry, tick);
		this._rowDisposables.add(addDisposableListener(jump, EventType.CLICK, () => {
			this._onDidSelect.fire(entry.tick.requestId);
			this._close();
		}));
		this._rowDisposables.add(addDisposableListener(jump, EventType.FOCUS, () => {
			this._open = true;
			this._updateRevealed();
			this._updateTabStops(this._rows.indexOf(entry));
		}));
		return entry;
	}

	private _renderRow(entry: IRowEntry, tick: PromptTick): void {
		entry.tick = tick;
		entry.jump.setAttribute('aria-label', tick.ariaLabel);
		entry.label.textContent = tick.text;
		entry.label.title = tick.text;
	}

	private _updateTabStops(focusIndex: number): void {
		this._focusRow = Math.max(0, Math.min(this._rows.length - 1, focusIndex));
		for (let i = 0; i < this._rows.length; i++) {
			this._rows[i].jump.tabIndex = i === this._focusRow ? 0 : -1;
		}
	}

	private _focusPrompt(rowIndex: number): void {
		this._updateTabStops(rowIndex);
		this._rows[this._focusRow]?.jump.focus();
		if (this._loadOlder && this._focusRow === 0) {
			this._list.scrollTop = 0;
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
		const activeElement = getWindow(this._domNode).document.activeElement;
		const currentIndex = this._rows.findIndex(r => r.jump === activeElement);
		if (event.keyCode === KeyCode.Enter) {
			// Activate the row button here: unhandled, Enter reaches workbench keybindings scoped to the
			// chat widget (e.g. editing requests), which consume it before the button's native click.
			if (currentIndex !== -1) {
				event.preventDefault();
				event.stopPropagation();
				this._rows[currentIndex].jump.click();
			}
			return;
		}
		let nextIndex = currentIndex;
		switch (event.keyCode) {
			case KeyCode.DownArrow: nextIndex = Math.min(this._rows.length - 1, currentIndex + 1); break;
			case KeyCode.UpArrow:
				if (currentIndex === 0) {
					void this._requestOlder();
				}
				nextIndex = Math.max(0, currentIndex - 1);
				break;
			case KeyCode.Home: nextIndex = 0; break;
			case KeyCode.End: nextIndex = this._rows.length - 1; break;
			default: return;
		}
		event.preventDefault();
		event.stopPropagation();
		this._focusPrompt(nextIndex);
	}

	setActive(requestId: string | undefined): void {
		this._activeRequestId = requestId;
		this._updateActiveClasses();
	}

	private _updateActiveClasses(): void {
		let activeIndex = -1;
		for (let i = 0; i < this._rows.length; i++) {
			const row = this._rows[i];
			const active = row.tick.requestId === this._activeRequestId;
			if (active) {
				activeIndex = i;
			}
			row.container.classList.toggle('active', active);
			// Expose the current prompt to assistive tech, mirroring the overview-ruler rail. It marks
			// the jump button, which is the one that names the prompt.
			if (active) {
				row.jump.setAttribute('aria-current', 'location');
			} else {
				row.jump.removeAttribute('aria-current');
			}
		}
		// Accent the dot standing for the prompt the transcript is scrolled to, so the resting handle
		// reads as a "you are here" and tracks scrolling.
		this._activeIndex = activeIndex;
		this._updateDotHighlights();
	}

	focusTick(requestId: string): void {
		const index = this._rows.findIndex(r => r.tick.requestId === requestId);
		if (index >= 0) {
			this._focusPrompt(index);
		}
	}

	setHostWidth(width: number): void {
		if (width > 0 && width !== this._hostWidth) {
			this._hostWidth = width;
			// Too narrow to place the handle beside the content: hide it (the native scrollbar remains).
			this._domNode.classList.toggle('overflowing', width < MIN_HOST_WIDTH);
		}
	}

}
