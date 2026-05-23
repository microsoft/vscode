/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobileOverlayViews.css';
import './mobileDiffColors.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { URI } from '../../../../../base/common/uri.js';
import { basename } from '../../../../../base/common/resources.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { TokenizationRegistry } from '../../../../../editor/common/languages.js';
import { generateTokensCSSForColorMap } from '../../../../../editor/common/languages/supports/tokenization.js';
import { computeUnifiedDiff, hasMultipleTokenClasses, type IDiffHunk, regexTokenizeLines, resolveMobileDiffLanguageId, tokenizeFileLines } from './mobileDiffHelpers.js';

const $ = DOM.$;

/**
 * Command ID for opening the {@link MobileDiffView}.
 *
 * Accepts {@link IMobileDiffViewData} as the single argument. Phone-only.
 *
 * For backwards compatibility the command also accepts a bare
 * {@link IFileDiffViewData} (without siblings) — in that case the view
 * is rendered without prev/next navigation.
 */
export const MOBILE_OPEN_DIFF_VIEW_COMMAND_ID = 'sessions.mobile.openDiffView';

/**
 * Minimal subset of diff entry fields consumed by the mobile diff view.
 * Defined locally to avoid importing from vs/workbench/contrib in vs/sessions/browser.
 */
export interface IFileDiffViewData {
	/**
	 * URI of the file before the change. `undefined` when the file is
	 * newly added by the agent and there is no prior content; the diff
	 * is rendered against an empty original (all lines as additions).
	 */
	readonly originalURI: URI | undefined;
	/**
	 * URI of the file after the change. `undefined` when the file was
	 * deleted by the agent — the diff is rendered as all-removed lines
	 * read from {@link originalURI}.
	 */
	readonly modifiedURI: URI | undefined;
	readonly identical: boolean;
	readonly added: number;
	readonly removed: number;
}

/**
 * Data passed to {@link MobileDiffView} when opening a diff view.
 *
 * When {@link siblings} is provided and contains more than one entry,
 * the header renders prev/next chevrons that navigate within the list.
 */
export interface IMobileDiffViewData {
	readonly diff: IFileDiffViewData;
	readonly siblings?: readonly IFileDiffViewData[];
	readonly index?: number;
}

/**
 * Full-screen overlay for viewing file changes produced by a coding agent
 * session on phone viewports.
 *
 * Renders a unified diff with coloured +/- gutters, line numbers, and
 * Monaco-quality syntax highlighting. Text is read from the file service
 * via the modified/original URIs stored in {@link IFileDiffViewData}.
 * This keeps the view lightweight — it avoids embedding a full Monaco
 * diff editor while still giving users a readable, theme-aware view.
 *
 * Follows the account-sheet overlay pattern: appends to the workbench
 * container, disposes on back-button tap.
 */
export class MobileDiffView extends Disposable {

	private readonly _onDidDispose = this._register(new Emitter<void>());
	/**
	 * Fires when this view has been disposed (either externally or
	 * because the user tapped Back). Used by the mobile overlay
	 * contribution to clear its `MutableDisposable<MobileDiffView>` slot.
	 */
	readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private readonly viewStore = this._register(new DisposableStore());

	private disposed = false;
	/** Bumped on every body render so late-arriving `textFileService.read`
	 *  promises know to drop their results when the user navigated away. */
	private renderGeneration = 0;

	private readonly siblings: readonly IFileDiffViewData[];
	private currentIndex: number;

	private titleEl!: HTMLElement;
	private subtitleEl!: HTMLElement;
	private positionEl!: HTMLElement;
	private prevBtn!: HTMLButtonElement;
	private nextBtn!: HTMLButtonElement;
	private contentArea!: HTMLElement;
	private scrollWrapper!: HTMLElement;

	constructor(
		workbenchContainer: HTMLElement,
		data: IMobileDiffViewData,
		private readonly textFileService: ITextFileService,
		private readonly languageService: ILanguageService,
	) {
		super();

		// Normalise siblings into a non-empty array so all subsequent code
		// can index it directly. If the caller didn't pass siblings we
		// treat the single diff as its own one-element list.
		this.siblings = data.siblings && data.siblings.length > 0 ? data.siblings : [data.diff];
		const startIndex = data.index ?? this.siblings.indexOf(data.diff);
		this.currentIndex = startIndex >= 0 ? startIndex : 0;

		this.render(workbenchContainer);
		this.renderBodyForCurrent();
	}

	private render(workbenchContainer: HTMLElement): void {
		// -- Root overlay -----------------------------------------
		const overlay = DOM.append(workbenchContainer, $('div.mobile-overlay-view'));
		this.viewStore.add(DOM.addDisposableListener(overlay, DOM.EventType.CONTEXT_MENU, e => e.preventDefault()));
		this.viewStore.add(toDisposable(() => overlay.remove()));

		// -- Header -----------------------------------------------
		const header = DOM.append(overlay, $('div.mobile-overlay-header'));

		const backBtn = DOM.append(header, $('button.mobile-overlay-back-btn', { type: 'button' })) as HTMLButtonElement;
		backBtn.setAttribute('aria-label', localize('diffView.back', "Back"));
		DOM.append(backBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronLeft));
		this.viewStore.add(Gesture.addTarget(backBtn));
		this.viewStore.add(DOM.addDisposableListener(backBtn, DOM.EventType.CLICK, () => this.dispose()));
		this.viewStore.add(DOM.addDisposableListener(backBtn, TouchEventType.Tap, () => this.dispose()));

		const info = DOM.append(header, $('div.mobile-overlay-header-info.inline'));
		this.titleEl = DOM.append(info, $('div.mobile-overlay-header-title'));
		this.subtitleEl = DOM.append(info, $('div.mobile-overlay-header-subtitle'));

		// Prev/Next nav appears on the right side when we have siblings.
		// We always create the elements (so layout space is reserved) but
		// keep them hidden when there is only a single file.
		const nav = DOM.append(header, $('div.mobile-diff-nav'));
		this.prevBtn = DOM.append(nav, $('button.mobile-diff-nav-btn.prev', { type: 'button' })) as HTMLButtonElement;
		this.prevBtn.setAttribute('aria-label', localize('diffView.prevFile', "Previous file"));
		DOM.append(this.prevBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronUp));
		this.positionEl = DOM.append(nav, $('span.mobile-diff-nav-position'));
		this.nextBtn = DOM.append(nav, $('button.mobile-diff-nav-btn.next', { type: 'button' })) as HTMLButtonElement;
		this.nextBtn.setAttribute('aria-label', localize('diffView.nextFile', "Next file"));
		DOM.append(this.nextBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));

		this.viewStore.add(Gesture.addTarget(this.prevBtn));
		this.viewStore.add(Gesture.addTarget(this.nextBtn));
		const onPrev = () => this.navigate(-1);
		const onNext = () => this.navigate(+1);
		this.viewStore.add(DOM.addDisposableListener(this.prevBtn, DOM.EventType.CLICK, onPrev));
		this.viewStore.add(DOM.addDisposableListener(this.prevBtn, TouchEventType.Tap, onPrev));
		this.viewStore.add(DOM.addDisposableListener(this.nextBtn, DOM.EventType.CLICK, onNext));
		this.viewStore.add(DOM.addDisposableListener(this.nextBtn, TouchEventType.Tap, onNext));

		nav.style.display = this.siblings.length > 1 ? '' : 'none';

		// -- Body -------------------------------------------------
		const body = DOM.append(overlay, $('div.mobile-overlay-body'));
		this.scrollWrapper = DOM.append(body, $('div.mobile-overlay-scroll'));
		this.contentArea = DOM.append(this.scrollWrapper, $('div.mobile-diff-output'));

		// Horizontal swipe between sibling files. We mount on the scroll
		// wrapper so vertical scrolling continues to work normally; the
		// gesture only activates when horizontal motion clearly dominates.
		this.viewStore.add(this.attachSwipeNavigation(this.scrollWrapper));
	}

	private attachSwipeNavigation(target: HTMLElement): { dispose(): void } {
		const store = new DisposableStore();
		if (this.siblings.length <= 1) {
			return store;
		}

		let startX = 0;
		let startY = 0;
		let startTime = 0;
		let tracking = false;

		const onPointerDown = (e: PointerEvent) => {
			if (e.pointerType !== 'touch') {
				return;
			}
			tracking = true;
			startX = e.clientX;
			startY = e.clientY;
			startTime = Date.now();
		};
		const onPointerUp = (e: PointerEvent) => {
			if (!tracking) {
				return;
			}
			tracking = false;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			const dt = Date.now() - startTime;
			const absDx = Math.abs(dx);
			const absDy = Math.abs(dy);

			// Require a horizontal-dominant swipe of at least 30% of the
			// viewport width or 0.5 px/ms velocity. Vertical swipes are
			// passed through untouched (they're scrolling).
			const viewportWidth = target.clientWidth;
			const minDistance = viewportWidth * 0.3;
			const velocity = absDx / Math.max(dt, 1);
			if (absDx <= absDy * 1.5) {
				return;
			}
			if (absDx < minDistance && velocity < 0.5) {
				return;
			}

			// Swipe left → next file, swipe right → previous file.
			this.navigate(dx < 0 ? +1 : -1);
		};

		store.add(DOM.addDisposableListener(target, 'pointerdown', onPointerDown));
		store.add(DOM.addDisposableListener(target, 'pointerup', onPointerUp));
		store.add(DOM.addDisposableListener(target, 'pointercancel', () => { tracking = false; }));
		return store;
	}

	private navigate(delta: number): void {
		const next = this.currentIndex + delta;
		if (next < 0 || next >= this.siblings.length) {
			return;
		}
		this.currentIndex = next;
		this.renderBodyForCurrent();
	}

	private renderBodyForCurrent(): void {
		// Bump the render generation so any inflight `textFileService.read`
		// from the previous file knows to drop its results before writing
		// into the now-stale container.
		this.renderGeneration++;

		const diff = this.siblings[this.currentIndex];
		const fileNameUri = diff.modifiedURI ?? diff.originalURI;
		const fileName = fileNameUri ? basename(fileNameUri) : '';

		// Header content
		this.titleEl.textContent = fileName;
		// Render +N / -N as styled spans so they pick up the same accent
		// colours as the changes-list (`mobile-changes-row-added` /
		// `mobile-changes-row-removed`). The previous flat textContent
		// rendered everything as foreground colour.
		DOM.clearNode(this.subtitleEl);
		if (!diff.identical) {
			if (diff.added) {
				DOM.append(this.subtitleEl, $('span.mobile-changes-row-added')).textContent = `+${diff.added}`;
			}
			if (diff.added && diff.removed) {
				DOM.append(this.subtitleEl, document.createTextNode(' '));
			}
			if (diff.removed) {
				DOM.append(this.subtitleEl, $('span.mobile-changes-row-removed')).textContent = `-${diff.removed}`;
			}
		}

		if (this.siblings.length > 1) {
			this.positionEl.textContent = localize(
				'diffView.position',
				"{0} / {1}",
				this.currentIndex + 1,
				this.siblings.length,
			);
			this.prevBtn.disabled = this.currentIndex === 0;
			this.nextBtn.disabled = this.currentIndex === this.siblings.length - 1;
			this.prevBtn.setAttribute('aria-disabled', String(this.prevBtn.disabled));
			this.nextBtn.setAttribute('aria-disabled', String(this.nextBtn.disabled));
		}

		// Reset scroll position so the user starts at the top of each file.
		this.scrollWrapper.scrollTop = 0;
		this.scrollWrapper.scrollLeft = 0;

		DOM.clearNode(this.contentArea);
		this.loadDiffContent(this.contentArea, diff);
	}

	private loadDiffContent(container: HTMLElement, diff: IFileDiffViewData): void {
		if (diff.identical) {
			const empty = DOM.append(container, $('div.mobile-diff-empty-state'));
			empty.textContent = localize('diffView.noChanges', "No changes in this file.");
			return;
		}

		const loadingEl = DOM.append(container, $('div.mobile-diff-empty-state'));
		loadingEl.textContent = localize('diffView.loading', "Loading…");

		const generation = this.renderGeneration;
		const languageId = resolveMobileDiffLanguageId(this.languageService, diff);

		void this.loadAndRender(container, diff, languageId, generation);
	}

	private async loadAndRender(
		container: HTMLElement,
		diff: IFileDiffViewData,
		languageId: string,
		generation: number,
	): Promise<void> {
		const [originalText, modifiedText] = await Promise.all([
			diff.originalURI
				? this.textFileService.read(diff.originalURI, { acceptTextOnly: true }).then(m => m.value).catch(() => '')
				: Promise.resolve(''),
			diff.modifiedURI
				? this.textFileService.read(diff.modifiedURI, { acceptTextOnly: true }).then(m => m.value).catch(() => '')
				: Promise.resolve(''),
		]);

		if (this.disposed || generation !== this.renderGeneration) {
			return;
		}

		const hunks = computeUnifiedDiff(originalText, modifiedText);
		if (hunks.length === 0) {
			DOM.clearNode(container);
			const empty = DOM.append(container, $('div.mobile-diff-empty-state'));
			empty.textContent = localize('diffView.noChanges', "No changes in this file.");
			return;
		}

		// Attempt Monaco tokenization. The sessions workbench does not load
		// built-in language extensions (JS, TS, Python, etc.), so
		// `TokenizationRegistry.getOrCreate` resolves to null for those languages
		// and falls back to `nullTokenizeEncoded` — every token gets class `mtk1`
		// (plain foreground). Detect that case and fall back to a lightweight
		// regex tokenizer that covers the most common syntax patterns.
		const [origLineHtml, modLineHtml] = await Promise.all([
			tokenizeFileLines(this.languageService, originalText, languageId),
			tokenizeFileLines(this.languageService, modifiedText, languageId),
		]);

		// Real tokenization produces multiple distinct mtk* classes; if ALL
		// non-empty lines contain only `mtk1`, the grammar did not fire.
		const hasRealTokens = hasMultipleTokenClasses(origLineHtml) || hasMultipleTokenClasses(modLineHtml);
		const origLines = hasRealTokens ? origLineHtml : regexTokenizeLines(originalText, languageId);
		const modLines = hasRealTokens ? modLineHtml : regexTokenizeLines(modifiedText, languageId);

		if (this.disposed || generation !== this.renderGeneration) {
			return;
		}

		DOM.clearNode(container);

		// Inject a <style> block with the Monaco token colour-map so that
		// `mtk*` classes produced by `tokenizeToString` resolve to colours.
		// Not needed for the regex fallback which uses CSS classes, but
		// kept so both paths share the same container node.
		const colorMap = TokenizationRegistry.getColorMap();
		if (colorMap && hasRealTokens) {
			const styleEl = document.createElement('style');
			styleEl.textContent = generateTokensCSSForColorMap(colorMap);
			container.appendChild(styleEl);
		}

		this.renderHunks(container, hunks, origLines, modLines);
	}

	private renderHunks(
		container: HTMLElement,
		hunks: IDiffHunk[],
		origLineHtml: readonly string[],
		modLineHtml: readonly string[],
	): void {
		for (const hunk of hunks) {
			// Hunk header — sticky inside the scroll container so the
			// `@@ -..,.. +..,.. @@` indicator stays anchored as the user
			// scrolls through the hunk's lines.
			const headerEl = DOM.append(container, $('div.mobile-diff-hunk-header'));
			headerEl.textContent = hunk.header;

			// Lines
			for (const line of hunk.lines) {
				const row = DOM.append(container, $('div.mobile-diff-line'));
				row.classList.add(line.type);

				const numEl = DOM.append(row, $('span.mobile-diff-line-num'));
				numEl.textContent = line.lineNum !== undefined ? String(line.lineNum) : '';

				const gutter = DOM.append(row, $('span.mobile-diff-gutter'));
				gutter.textContent = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

				const content = DOM.append(row, $('span.mobile-diff-content'));
				// `lineNum` is 1-based and indexes into the source the
				// line was taken from: original for context/removed,
				// modified for added (see `computeUnifiedDiff`). The
				// tokenization pass returns one HTML span block per
				// line in the same order, so a direct lookup gives us
				// the highlighted markup.
				if (line.lineNum !== undefined) {
					const source = line.type === 'added' ? modLineHtml : origLineHtml;
					const html = source[line.lineNum - 1];
					if (html !== undefined) {
						content.innerHTML = html;
					} else if (line.text) {
						content.textContent = line.text;
					}
				} else if (line.text) {
					content.textContent = line.text;
				}
			}
		}
	}

	override dispose(): void {
		this.disposed = true;
		// Notify external slot-holders before any registered disposables
		// (including the emitter itself) get torn down by `super.dispose()`.
		this._onDidDispose.fire();
		this.viewStore.dispose();
		super.dispose();
	}
}

/**
 * Opens a {@link MobileDiffView} for the given file diff.
 * Returns the view instance; dispose it to close.
 */
export function openMobileDiffView(
	workbenchContainer: HTMLElement,
	data: IMobileDiffViewData,
	textFileService: ITextFileService,
	languageService: ILanguageService,
): MobileDiffView {
	return new MobileDiffView(workbenchContainer, data, textFileService, languageService);
}
