/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, clearNode, EventType, getWindow } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { MIN_HOST_WIDTH } from './promptTimelineLayout.js';
import { PromptDiffStat, PromptFileDiff, PromptTick, IPromptScrollLayout } from './promptTimelineModel.js';
import { IPromptReviewFileEvent, IPromptTimelineRail } from './promptTimelineRail.js';
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

/**
 * Which of a row's two buttons holds the flyout's roving tab stop: the label (jump to the prompt) or
 * the diff badge (review that prompt's changes).
 */
type RowColumn = 'jump' | 'diff';

/** Where a row preview came from — see {@link PromptTimelineGutterRail._setPreview}. */
type PreviewSource = 'dot' | 'row';

interface IRowEntry {
	tick: PromptTick;
	/** Row container. Holds the `reviewable` state and the layout both buttons share; not focusable. */
	readonly container: HTMLElement;
	/** Left button: reveals the prompt in the transcript. */
	readonly jump: HTMLButtonElement;
	/** Right button: opens this prompt's changes as a diff. Dropped when the prompt edited nothing. */
	readonly diff: HTMLButtonElement;
	readonly label: HTMLElement;
	readonly stat: HTMLElement;
}

/** Unique-per-instance suffix so the flyout's id (referenced by the handle's `aria-controls`) never collides. */
let gutterIdSeq = 0;

/**
 * A minimal, left-edge prompt timeline. At rest it is only a small handle in the transcript's left
 * gutter (one dot per prompt, the current prompt's dot accented) — no per-prompt marks, no diff
 * colour — so the transcript stays calm. Hovering, tapping, or focusing the handle expands a flyout
 * listing every prompt (its text and a diff badge) to the *right* of the dots, so the dots stay
 * visible and keep working as a scrubber: hovering an individual dot previews its prompt in the
 * flyout. Because the list is evenly spaced and never derived from response heights, it stays stable
 * under virtualization.
 *
 * Each row is split into two buttons so the prompt's changes are reachable without leaving the rail:
 * the label on the left reveals the prompt in the transcript, and the diff badge on the right opens
 * just that turn's changes (the ruler rail offers the same drill-down from its hover card). The badge
 * is absent for prompts that edited nothing. Both close the flyout.
 *
 * The handle is an accessible disclosure button (`aria-expanded`/`aria-controls`) wired for mouse,
 * touch (via {@link Gesture}) and keyboard; the flyout is a single-tab-stop toolbar where Up/Down
 * (and Home/End) move between rows, Left/Right move between a row's two buttons, and Escape dismisses.
 *
 * It implements the same {@link IPromptTimelineRail} contract as the overview-ruler rail so the two
 * are interchangeable behind the `sessions.chatTimeline.display` setting; the scroll-driven and
 * fisheye affordances the ruler needs (hard-wheel bloom, proportional scroll layout) are no-ops here.
 */
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
	/** Which of that row's two buttons holds it. */
	private _focusColumn: RowColumn = 'jump';

	private readonly _onDidSelect = this._register(new Emitter<string>());
	readonly onDidSelect: Event<string> = this._onDidSelect.event;

	/** Fired by a row's diff button to review that prompt's whole changeset. */
	private readonly _onDidReview = this._register(new Emitter<PromptTick>());
	readonly onDidReview: Event<PromptTick> = this._onDidReview.event;
	// Per-FILE review is only offered by the ruler rail's hover card; the gutter rail's rows drill down
	// to the whole prompt. Kept to satisfy the shared rail contract.
	private readonly _onDidReviewFile = this._register(new Emitter<IPromptReviewFileEvent>());
	readonly onDidReviewFile: Event<IPromptReviewFileEvent> = this._onDidReviewFile.event;

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
			}
		}));

		// Keyboard: one Tab stop into the flyout; Up/Down (and Home/End) move between rows, Left/Right
		// between a row's label and diff buttons, Escape dismisses.
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

	/**
	 * Collapse the disclosure (shared close path for activation, Escape, and row actions).
	 *
	 * `restoreFocus` returns focus to the handle so keyboard users are not stranded; the diff action
	 * opts out, because the multi-diff editor it opens takes focus itself and pulling focus back to
	 * the rail first would fight it.
	 */
	private _close(restoreFocus = true): void {
		this._open = false;
		this._updateRevealed();
		if (restoreFocus) {
			this._rest.focus();
		}
	}

	private _focusActiveRow(): void {
		this._focusCell(this._focusRow, this._focusColumn);
	}

	setFilesProvider(_provider: (tick: PromptTick) => readonly PromptFileDiff[]): void {
		// The gutter rail's rows review a whole prompt; only the ruler rail's hover card lists the
		// individual files, so it has no use for the provider.
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

	/** Previews the prompt a hovered dot stands for by highlighting its row and scrolling it into view. */
	/**
	 * Previews the prompt a row stands for: highlights it and scrolls it into view.
	 *
	 * `source` decides whether the row gets the full-width band. A preview from a hovered *dot* points
	 * at a row the pointer is nowhere near, so the whole row lights up to say "this one". A preview
	 * from the pointer resting on the row itself must NOT band it: the row's two halves light up
	 * individually under the pointer, and a band covering both would paint over that — making a row
	 * with two buttons read as one.
	 */
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
		const top = container.offsetTop;
		const bottom = top + container.offsetHeight;
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
		const sameStructure = ticks.length === this._rows.length
			&& ticks.every((t, i) => this._rows[i]?.tick.requestId === t.requestId);
		if (sameStructure) {
			// Note the focused target before any button can disappear underneath it.
			const doc = getWindow(this._domNode).document;
			const focusedCell = this._isLiveCell(doc.activeElement) ? doc.activeElement : undefined;
			// Only the stats changed (streaming edits); update them in place so focus/hover are kept.
			for (let i = 0; i < ticks.length; i++) {
				this._renderRow(this._rows[i], ticks[i]);
			}
			// A prompt whose first edit just landed gains a diff button; re-apply the tab stops so it
			// joins the roving order (and so a stop never lands on one that went away).
			this._updateTabStops(this._focusRow, this._focusColumn);
			// The focused badge is the one that went away (its prompt's edits netted back to zero):
			// follow the tab stop to its fallback, instead of leaving focus on a `display: none` button
			// — which the browser strands on <body>, and the rail then reads as a real focus-out.
			if (focusedCell && !this._isLiveCell(focusedCell)) {
				this._cell(this._focusRow, this._focusColumn)?.focus();
			}
			this._updateActiveClasses();
			return;
		}

		this._rowDisposables.clear();
		this._rows.length = 0;
		this._previewIndex = -1;
		this._previewBand = -1;
		clearNode(this._list);
		// The resting dots preview how many prompts the flyout holds and where the transcript is.
		this._renderDots(ticks.length);

		for (const tick of ticks) {
			// The row is a plain container, not a button: it holds two independent targets, and a
			// button may not nest inside a button.
			const container = append(this._list, $('.prompt-timeline-gutter-row'));
			const jump = append(container, $<HTMLButtonElement>('button.prompt-timeline-gutter-row-jump'));
			jump.tabIndex = -1;
			const label = append(jump, $('span.prompt-timeline-gutter-row-label'));
			const diff = append(container, $<HTMLButtonElement>('button.prompt-timeline-gutter-row-diff'));
			diff.tabIndex = -1;
			const stat = append(diff, $('span.prompt-timeline-gutter-row-stat'));
			const entry: IRowEntry = { tick, container, jump, diff, label, stat };
			this._renderRow(entry, tick);
			const requestId = tick.requestId;
			// Both targets collapse the disclosure so it does not linger over the transcript (a pointer
			// still resting on the rail keeps it revealed, as hover always has). Jumping returns focus
			// to the handle; reviewing leaves it alone, for the diff editor to take.
			this._rowDisposables.add(addDisposableListener(jump, EventType.CLICK, () => {
				this._onDidSelect.fire(requestId);
				this._close();
			}));
			this._rowDisposables.add(addDisposableListener(diff, EventType.CLICK, () => {
				this._onDidReview.fire(entry.tick);
				this._close(/*restoreFocus*/ false);
			}));
			for (const [button, column] of [[jump, 'jump'], [diff, 'diff']] as const) {
				this._rowDisposables.add(addDisposableListener(button, EventType.FOCUS, () => {
					// Keyboard-focusing a row (e.g. Tab in from the handle) counts as opening the disclosure.
					this._open = true;
					this._updateRevealed();
					this._updateTabStops(this._rows.indexOf(entry), column);
				}));
			}
			this._rows.push(entry);
		}

		const activeIndex = this._rows.findIndex(r => r.tick.requestId === this._activeRequestId);
		this._updateTabStops(activeIndex >= 0 ? activeIndex : 0, 'jump');
		this._updateActiveClasses();
	}

	private _renderRow(entry: IRowEntry, tick: PromptTick): void {
		entry.tick = tick;
		entry.jump.setAttribute('aria-label', tick.ariaLabel);
		entry.label.textContent = tick.text;
		entry.label.title = tick.text;
		// A stat that nets out to no changed lines is treated as nothing to review.
		const stat = tick.stat && tick.stat.added + tick.stat.removed > 0 ? tick.stat : undefined;
		this._renderStat(entry.stat, stat);
		// Prompts that edited nothing have nothing to review: the row drops its second half entirely
		// (rather than showing it disabled), which also takes it out of the focus order.
		entry.container.classList.toggle('reviewable', !!stat);
		if (stat) {
			entry.diff.setAttribute('aria-label', localize(
				'promptTimeline.gutter.reviewChanges',
				"Review Changes for Prompt: {0}, {1}",
				tick.text,
				stat.fileCount === 1
					? localize('promptTimeline.gutter.reviewOneFile', "1 file changed")
					: localize('promptTimeline.gutter.reviewNFiles', "{0} files changed", stat.fileCount),
			));
		}
	}

	private _renderStat(container: HTMLElement, stat: PromptDiffStat | undefined): void {
		clearNode(container);
		if (!stat) {
			return;
		}
		append(container, $('span.added')).textContent = `+${stat.added}`;
		append(container, $('span.removed')).textContent = `\u2212${stat.removed}`;
	}

	/** The button a row column maps to, or undefined when that row has no changes to review. */
	private _cell(rowIndex: number, column: RowColumn): HTMLButtonElement | undefined {
		const entry = this._rows[rowIndex];
		if (!entry) {
			return undefined;
		}
		if (column === 'jump') {
			return entry.jump;
		}
		return entry.container.classList.contains('reviewable') ? entry.diff : undefined;
	}

	/** True when `element` is a row button that is still a live focus target — a dropped badge is not. */
	private _isLiveCell(element: Element | null): boolean {
		return this._rows.some(row => row.jump === element
			|| (row.diff === element && row.container.classList.contains('reviewable')));
	}

	/**
	 * Roving tabindex: exactly one button across the whole flyout is tabbable, so it stays a single Tab
	 * stop even though every row now holds two. A requested diff column falls back to the label when
	 * that row has no changes, so the tab stop can never land on a hidden (unfocusable) button.
	 */
	private _updateTabStops(focusIndex: number, column: RowColumn = this._focusColumn): void {
		this._focusRow = Math.max(0, Math.min(this._rows.length - 1, focusIndex));
		this._focusColumn = this._cell(this._focusRow, column) ? column : 'jump';
		const focused = this._cell(this._focusRow, this._focusColumn);
		for (const entry of this._rows) {
			entry.jump.tabIndex = entry.jump === focused ? 0 : -1;
			entry.diff.tabIndex = entry.diff === focused ? 0 : -1;
		}
	}

	/** Moves the roving tab stop and the focus together, clamping the row and resolving the column. */
	private _focusCell(rowIndex: number, column: RowColumn): void {
		this._updateTabStops(rowIndex, column);
		this._cell(this._focusRow, this._focusColumn)?.focus();
	}

	/**
	 * The flyout's toolbar keyboard model: Up/Down (and Home/End) walk the rows keeping the current
	 * column where the target row has one, Left/Right cross between a row's label and diff buttons,
	 * and Escape dismisses.
	 */
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
		const currentIndex = this._rows.findIndex(r => r.jump === activeElement || r.diff === activeElement);
		const currentColumn: RowColumn = this._rows[currentIndex]?.diff === activeElement ? 'diff' : 'jump';
		let nextIndex = currentIndex;
		let nextColumn = currentColumn;
		switch (event.keyCode) {
			case KeyCode.DownArrow: nextIndex = Math.min(this._rows.length - 1, currentIndex + 1); break;
			case KeyCode.UpArrow: nextIndex = Math.max(0, currentIndex - 1); break;
			case KeyCode.Home: nextIndex = 0; break;
			case KeyCode.End: nextIndex = this._rows.length - 1; break;
			case KeyCode.RightArrow: nextColumn = 'diff'; break;
			case KeyCode.LeftArrow: nextColumn = 'jump'; break;
			default: return;
		}
		event.preventDefault();
		event.stopPropagation();
		this._focusCell(nextIndex, nextColumn);
	}

	setActive(requestId: string | undefined): void {
		this._activeRequestId = requestId;
		this._updateActiveClasses();
	}

	private _updateActiveClasses(): void {
		let activeIndex = -1;
		for (let i = 0; i < this._rows.length; i++) {
			const row = this._rows[i];
			const active = this._activeRequestId !== undefined
				&& (row.tick.requestId === this._activeRequestId || row.tick.allRequestIds.includes(this._activeRequestId));
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
		const index = this._rows.findIndex(r => r.tick.requestId === requestId || r.tick.allRequestIds.includes(requestId));
		if (index >= 0) {
			this._focusCell(index, 'jump');
		}
	}

	setHostWidth(width: number): void {
		if (width > 0 && width !== this._hostWidth) {
			this._hostWidth = width;
			// Too narrow to place the handle beside the content: hide it (the native scrollbar remains).
			this._domNode.classList.toggle('overflowing', width < MIN_HOST_WIDTH);
		}
	}

	// The ruler blooms its fan on a hard scroll and scatters marks by scroll position; the gutter rail is a
	// static, evenly-spaced list, so both are intentionally no-ops.
	notifyHardWheel(): void { }
	setScrollLayout(_layout: IPromptScrollLayout | undefined): void { }
}
