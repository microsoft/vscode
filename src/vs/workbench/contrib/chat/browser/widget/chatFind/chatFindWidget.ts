/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './chatFindWidget.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { DeferredPromise, Delayer, raceCancellation } from '../../../../../../base/common/async.js';
import { cancelOnDispose } from '../../../../../../base/common/cancellation.js';
import { createRegExp } from '../../../../../../base/common/strings.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, runOnChange } from '../../../../../../base/common/observable.js';
import { Range as EditorRange } from '../../../../../../editor/common/core/range.js';
import { EditorOption } from '../../../../../../editor/common/config/editorOptions.js';
import { IEditorDecorationsCollection } from '../../../../../../editor/common/editorCommon.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { localize } from '../../../../../../nls.js';
import { ISimpleFindResultCount, SimpleFindWidget } from '../../../../codeEditor/browser/find/simpleFindWidget.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { ChatTreeItem, IChatCodeBlockInfo, IChatFindController } from '../../chat.js';
import { IChatListItemTemplate } from '../chatListRenderer.js';
import { CodeBlockPart } from '../chatContentParts/codeBlockPart.js';
import { ChatFindCommandId } from './chatFindCommandIds.js';
import { getChatFindHighlightRegistry, supportsCssHighlightApi } from './chatFindHighlights.js';
import { ChatFindModel, IChatFindMatch, MAX_FIND_MATCHES } from './chatFindModel.js';

export interface IChatFindHost {
	readonly transcriptDomNode: HTMLElement;
	readonly activeModel?: IObservable<IChatModel | undefined>;
	readonly transcriptVisible?: IObservable<boolean>;
	getItems(): readonly ChatTreeItem[];
	readonly onDidChangeContent: Event<void>;
	hasElement?(item: ChatTreeItem): boolean;
	reveal(item: ChatTreeItem, relativeTop?: number): void;
	getTemplateDataForRequestId(requestId: string | undefined): IChatListItemTemplate | undefined;
	readonly onDidRerenderRow: Event<IChatListItemTemplate>;
	editorsInUse(): Iterable<CodeBlockPart>;
	getCodeBlockInfoForEditor(uri: URI): IChatCodeBlockInfo | undefined;
	/** Scroll offset of the transcript, in list content space. */
	getScrollTop(): number;
	setScrollTop(scrollTop: number): void;
	/** Height of the transcript's visible area. */
	getRenderHeight(): number;
	/** Id of the last item intersecting the viewport, used to start Find from what is on screen. */
	getViewportAnchorItemId(): string | undefined;
}

/** Upper bound on the number of DOM ranges highlighted at once (only ever the currently mounted/visible rows). */
const MAX_VISIBLE_HIGHLIGHTS = 500;

const CHAT_FIND_WIDGET_INITIAL_WIDTH = 350;

/**
 * How long typing settles before Find searches. Searching per keystroke publishes a count for
 * every prefix, so the label counts up and down while the user is still typing.
 */
const SEARCH_DEBOUNCE_DELAY = 150;

/**
 * Bounds how many times the result count waits for a fresh search to supersede the one it was
 * waiting on, so continuous typing can't keep the label pending forever.
 */
const MAX_SETTLE_WAITS = 20;

const CURRENT_MATCH_HIGHLIGHT_NAME = 'chat-find-current-match';
const OTHER_MATCH_HIGHLIGHT_NAME = 'chat-find-other-match';

/**
 * Elements that do not interrupt the flow of a line, so `Hi <b>there</b>` reads as `Hi there`.
 * Anything else starts a new line, so the tail of one block cannot fuse with the head of the next.
 */
const INLINE_TAGS = new Set(['A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE', 'CODE', 'DATA', 'DEL', 'DFN', 'EM', 'I', 'INS', 'KBD', 'MARK', 'Q', 'S', 'SAMP', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR']);

/** The closest ancestor of `node` that starts a new line, at most `root`. */
function nearestBlock(node: Node, root: HTMLElement): Element {
	let element = node.parentElement;
	while (element && element !== root && INLINE_TAGS.has(element.tagName)) {
		element = element.parentElement;
	}
	return element ?? root;
}

export function findMatchRangesInDom(root: HTMLElement, regex: RegExp, limit: number, excludedRoots: readonly HTMLElement[] = []): Range[] {
	if (root.hasAttribute('data-chat-find-ignore')) {
		return [];
	}
	const ignoredRoots: Element[] = [...excludedRoots];
	const ownerDocument = root.ownerDocument;
	const nodes: { node: Text; start: number; end: number }[] = [];
	let buffer = '';
	let block: Element | undefined;
	let separatorPending = false;
	const walker = ownerDocument.createTreeWalker(root, 5 /* NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT */);
	let current: Node | null;
	while ((current = walker.nextNode())) {
		if (ignoredRoots.some(candidate => candidate.contains(current))) {
			separatorPending = true;
			continue;
		}
		if (current.nodeType !== 3 /* Node.TEXT_NODE */) {
			const element = current as Element;
			if (element.hasAttribute('data-chat-find-ignore')) {
				ignoredRoots.push(element);
				separatorPending = true;
			} else {
				separatorPending ||= element.tagName === 'BR';
			}
			continue;
		}
		const text = current.textContent;
		if (!text) {
			continue;
		}
		const nodeBlock = nearestBlock(current, root);
		if (buffer && (separatorPending || nodeBlock !== block)) {
			buffer += '\n';
		}
		block = nodeBlock;
		separatorPending = false;
		nodes.push({ node: current as Text, start: buffer.length, end: buffer.length + text.length });
		buffer += text;
	}

	if (!buffer) {
		return [];
	}

	const ranges: Range[] = [];
	regex.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(buffer))) {
		const range = toDomRange(ownerDocument, nodes, match.index, match.index + match[0].length);
		if (range) {
			ranges.push(range);
		}
		if (match[0].length === 0) {
			regex.lastIndex++;
		}
		if (ranges.length >= limit) {
			break;
		}
	}
	return ranges;
}

function toDomRange(ownerDocument: Document, nodes: { node: Text; start: number; end: number }[], start: number, end: number): Range | undefined {
	// A match can begin or end on a block separator, which belongs to no text node, so the
	// offsets are clamped into the nearest node rather than dropping the match.
	const startEntry = nodes.find(n => start < n.end);
	const endEntry = nodes.find(n => end <= n.end);
	if (!startEntry || !endEntry || endEntry.start < startEntry.start) {
		return undefined;
	}
	const range = ownerDocument.createRange();
	range.setStart(startEntry.node, Math.max(start - startEntry.start, 0));
	range.setEnd(endEntry.node, Math.max(end - endEntry.start, 0));
	return range;
}

function isDetailsElement(node: Node): node is HTMLDetailsElement {
	return (node as Element).tagName === 'DETAILS';
}

/** Opens every closed `<details>` ancestor of `node`, stopping at (and excluding) `root`. Returns whether any were toggled. */
export function openAncestorDisclosures(root: HTMLElement, node: Node): boolean {
	let opened = false;
	let current: Node | null = node;
	while (current && current !== root) {
		if (isDetailsElement(current) && !current.open) {
			current.open = true;
			opened = true;
		}
		current = current.parentNode;
	}
	return opened;
}

/** Whether `show()` should capture the pre-Find focus target, so repeatedly opening an already-visible widget doesn't clobber it. */
export function shouldCaptureFocusBeforeShow(wasVisible: boolean): boolean {
	return !wasVisible;
}

export function rangesEqual(a: Range, b: Range): boolean {
	return a.startContainer === b.startContainer && a.startOffset === b.startOffset
		&& a.endContainer === b.endContainer && a.endOffset === b.endOffset;
}

/** Breathing room kept between a revealed match and the edge of the transcript viewport. */
const MATCH_REVEAL_PADDING = 30;

/**
 * The scroll offset that brings a match spanning `top`..`bottom` (measured from the top of the
 * viewport) into view, or `undefined` when it is already comfortably visible. Moves by the least
 * amount that clears the padding, and aligns the top of a match too tall to fit.
 */
export function computeRevealScrollTop(scrollTop: number, renderHeight: number, top: number, bottom: number): number | undefined {
	const alignTop = () => Math.max(0, scrollTop + top - MATCH_REVEAL_PADDING);
	if (top < MATCH_REVEAL_PADDING) {
		return alignTop();
	}
	if (bottom > renderHeight - MATCH_REVEAL_PADDING) {
		return bottom - top > renderHeight - 2 * MATCH_REVEAL_PADDING
			? alignTop()
			: Math.max(0, scrollTop + bottom - renderHeight + MATCH_REVEAL_PADDING);
	}
	return undefined;
}

interface ILocatedCodeMatch {
	readonly codeBlock: CodeBlockPart;
	readonly range: EditorRange;
}

type LocatedMatch = Range | ILocatedCodeMatch;

function isCodeMatch(match: LocatedMatch): match is ILocatedCodeMatch {
	return 'codeBlock' in match;
}

export function findMatchRangesInCodeBlock(codeBlock: CodeBlockPart, regex: RegExp, limit: number): EditorRange[] {
	const model = codeBlock.editor.getModel();
	if (!model) {
		return [];
	}

	const ranges: EditorRange[] = [];
	regex.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(model.getValue()))) {
		const start = model.getPositionAt(match.index);
		const end = model.getPositionAt(match.index + match[0].length);
		ranges.push(EditorRange.fromPositions(start, end));
		if (match[0].length === 0) {
			regex.lastIndex++;
		}
		if (ranges.length >= limit) {
			break;
		}
	}
	return ranges;
}

/** Finds text across a chat widget's logical transcript. */
export class ChatFindWidget extends SimpleFindWidget implements IChatFindController {

	private readonly _model: ChatFindModel;

	private readonly _findWidgetVisibleKey: IContextKey<boolean>;
	private readonly _findWidgetFocusedKey: IContextKey<boolean>;
	private readonly _findInputFocusedKey: IContextKey<boolean>;

	private readonly _targetWindow: Window & typeof globalThis;

	private readonly _repaintScheduler = this._register(new MutableDisposable());
	private readonly _revealScheduler = this._register(new MutableDisposable());
	private readonly _recomputeDelayer = this._register(new Delayer<void>(200));
	private readonly _searchDelayer = this._register(new Delayer<void>(SEARCH_DEBOUNCE_DELAY));
	private readonly _codeDecorations = new Map<CodeBlockPart, IEditorDecorationsCollection>();
	private readonly _historyInterest = this._register(new MutableDisposable<DisposableStore>());
	private readonly _historyListeners = this._register(new DisposableStore());
	private _historyReadFailed = false;
	private _pendingTreeReveal: IChatFindMatch | undefined;

	private _lastFocusedElement: HTMLElement | undefined;
	private _lastNavigationWasPrevious = false;
	private _unlocatableSkips = 0;
	private _pendingSearch: Promise<void> | undefined;
	/** Pending while the active match is still being located, which can drop unreachable matches. */
	private _settleBarrier: DeferredPromise<void> | undefined;

	/** Bounds the skip walk so a query whose matches are all unlocatable cannot spin. */
	private static readonly MAX_UNLOCATABLE_SKIPS = 50;

	/**
	 * Frames to wait for a revealed row to mount before treating a match as unreachable. The list
	 * mounts and re-measures rows over several frames after a long scroll, so a single frame is
	 * not enough to tell "not there yet" from "not there".
	 */
	private static readonly MAX_LOCATE_ATTEMPTS = 4;

	constructor(
		private readonly host: IChatFindHost,
		@IContextViewService contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHoverService hoverService: IHoverService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super({
			showCommonFindToggles: true,
			checkImeCompletionState: true,
			showResultCount: true,
			matchesLimit: MAX_FIND_MATCHES,
			initialWidth: CHAT_FIND_WIDGET_INITIAL_WIDTH,
			enableSash: true,
			appendCaseSensitiveActionId: ChatFindCommandId.ToggleFindCaseSensitive,
			appendRegexActionId: ChatFindCommandId.ToggleFindRegex,
			appendWholeWordsActionId: ChatFindCommandId.ToggleFindWholeWord,
			previousMatchActionId: ChatFindCommandId.FindPrevious,
			nextMatchActionId: ChatFindCommandId.FindNext,
			closeWidgetActionId: ChatFindCommandId.FindHide,
		}, contextViewService, contextKeyService, hoverService, keybindingService, configurationService, accessibilityService);

		this._targetWindow = dom.getWindow(this.host.transcriptDomNode);

		this._findWidgetVisibleKey = ChatContextKeys.findWidgetVisible.bindTo(contextKeyService);
		this._findWidgetFocusedKey = ChatContextKeys.findWidgetFocused.bindTo(contextKeyService);
		this._findInputFocusedKey = ChatContextKeys.findInputFocused.bindTo(contextKeyService);

		this._model = this._register(new ChatFindModel(() => this.host.getItems(), () => this.host.getViewportAnchorItemId()));
		this._register(this._model.onDidChangeMatches(() => this._onMatchesChanged()));

		if (host.activeModel) {
			this._register(runOnChange(host.activeModel, () => {
				if (this.visible) {
					this._close(false);
				}
				this._model.clear();
			}));
		}
		if (host.transcriptVisible) {
			this._register(runOnChange(host.transcriptVisible, visible => {
				if (!visible) {
					this._cancelSearchInterest();
					this._searchDelayer.cancel();
					this._pendingSearch = undefined;
				} else if (this._isModelStale()) {
					this._scheduleSearch();
				} else {
					this._scheduleRecompute();
				}
			}));
		}
		this._register(this.host.onDidChangeContent(() => {
			this._scheduleRecompute();
		}));
		this._register(this.host.onDidRerenderRow(template => {
			if (template.currentElement && this._model.invalidateRenderedRow(template.currentElement)) {
				this._scheduleRecompute();
			}
			if (this.isVisible()) {
				this._scheduleRepaint();
			}
		}));

		dom.append(this.host.transcriptDomNode.parentElement ?? this.host.transcriptDomNode, this.getDomNode());
	}

	get visible(): boolean {
		return this.isVisible();
	}

	override show(seedText?: string, focus: boolean = true): void {
		if (this.host.transcriptVisible?.get() === false || (this.host.activeModel && !this.host.activeModel.get())) {
			return;
		}
		if (shouldCaptureFocusBeforeShow(this.isVisible())) {
			this._lastFocusedElement = this._targetWindow.document.activeElement as HTMLElement | undefined;
			const model = this.host.activeModel?.get();
			if (model?.olderHistoryCursor) {
				this._historyListeners.add(runOnChange(model.olderHistoryCursor, () => {
					this._historyReadFailed = false;
					this._scheduleRecompute();
				}));
			}
			if (model?.olderHistoryUnavailable) {
				this._historyListeners.add(runOnChange(model.olderHistoryUnavailable, unavailable => {
					if (unavailable) {
						this._historyInterest.clear();
					}
					this._scheduleRecompute();
				}));
			}
		}
		this._findWidgetVisibleKey.set(true);
		// Opening reads the count before the seed text reaches the model, reporting "No results".
		this._beginSettle();
		if (focus) {
			super.reveal(seedText);
		} else {
			super.show(seedText);
		}
		this.findFirst();
	}

	override hide(): void {
		this._close(true);
	}

	private _close(restoreFocus: boolean): void {
		super.hide();
		this._findWidgetVisibleKey.reset();
		this._historyListeners.clear();
		this._cancelSearchInterest();
		this._searchDelayer.cancel();
		this._pendingSearch = undefined;
		this._clearHighlights();
		if (restoreFocus) {
			this._restoreFocus();
		} else {
			this._lastFocusedElement = undefined;
		}
	}

	find(previous: boolean): void {
		if (!this.visible || this.host.transcriptVisible?.get() === false) {
			return;
		}
		this._lastNavigationWasPrevious = previous;
		this._unlocatableSkips = 0;
		if (this._flushPendingSearch()) {
			// The query was not searched yet, so Enter lands on its first match, not its second.
			return;
		}
		if (this._recomputeDelayer.isTriggered()) {
			// A page from another reader can arrive before the debounced content refresh.
			this._recomputeDelayer.cancel();
			if (this._refreshLoadedMatches()) {
				return;
			}
		}
		const { matches, activeIndex } = this._model;
		const atBoundary = !matches.length || (previous ? activeIndex === 0 : activeIndex === matches.length - 1);
		if (atBoundary && matches.length < MAX_FIND_MATCHES && this._seekOlder(matches.at(-1), previous)) {
			return;
		}
		this._historyInterest.clear();
		this._advanceActiveMatch(previous);
	}

	/**
	 * Runs a debounced search now, if one is still waiting. Returns whether it ran, so navigation
	 * acts on the query the user actually typed rather than the previous one.
	 */
	private _flushPendingSearch(): boolean {
		if (!this._pendingSearch) {
			return false;
		}
		this._searchDelayer.cancel();
		this._pendingSearch = undefined;
		this._search();
		return true;
	}

	private _advanceActiveMatch(previous: boolean): void {
		if (previous) {
			this._model.previous();
		} else {
			this._model.next();
		}
		this._navigateToActive();
		void this.updateResultCount();
	}

	/**
	 * Steps past a match the DOM cannot produce, so navigation never appears to do nothing. The
	 * index predicts where the renderer puts content, and a prediction can still be wrong for
	 * content whose placement is decided at render time; rather than stall, keep going the same
	 * way. Bounded so a query whose matches are all unlocatable cannot spin.
	 */
	private _skipUnlocatableMatch(): void {
		if (this._unlocatableSkips >= ChatFindWidget.MAX_UNLOCATABLE_SKIPS) {
			this._completeSettle();
			return;
		}
		this._unlocatableSkips++;
		this._advanceActiveMatch(this._lastNavigationWasPrevious);
	}

	findFirst(): void {
		if (!this.visible) {
			return;
		}
		this._unlocatableSkips = 0;
		// Toggling an option supersedes a keystroke still waiting out the debounce.
		this._searchDelayer.cancel();
		this._pendingSearch = undefined;
		this._search();
	}

	next(): void {
		if (!this.visible) {
			this.show(undefined, false);
		}
		this.find(false);
	}

	previous(): void {
		if (!this.visible) {
			this.show(undefined, false);
		}
		this.find(true);
	}

	focus(): void {
		this.focusFindBox();
	}

	toggleCaseSensitive(): void {
		this.changeState({ matchCase: !this._getCaseSensitiveValue() });
	}

	toggleWholeWord(): void {
		this.changeState({ wholeWord: !this._getWholeWordValue() });
	}

	toggleRegex(): void {
		this.changeState({ isRegex: !this._getRegexValue() });
	}

	protected _onInputChanged(): boolean {
		this._unlocatableSkips = 0;
		this._scheduleSearch();
		// Optimistic: keeps the buttons usable until `updateResultCount` corrects the label.
		return this._model.matches.length > 0;
	}

	/** Whether the widget's query or options have moved on from what the model last searched. */
	private _isModelStale(): boolean {
		const options = this._currentFindOptions();
		const current = this._model.options;
		return this.inputValue !== this._model.query
			|| options.isRegex !== current.isRegex
			|| options.matchCase !== current.matchCase
			|| options.wholeWord !== current.wholeWord;
	}

	/**
	 * Runs the search once typing pauses. Searching per keystroke would publish a count for every
	 * prefix, and each of those counts can then shed unreachable matches, so the label ends up
	 * ticking up and down before landing on the real number.
	 */
	private _scheduleSearch(): void {
		// An option toggle also reaches here via `findFirst`; a duplicate would swallow Enter.
		if (!this.visible || this.host.transcriptVisible?.get() === false || (!this._isModelStale() && !this._pendingSearch)) {
			return;
		}
		this._cancelSearchInterest();
		const search = this._searchDelayer.trigger(() => this._search());
		this._pendingSearch = search;
		search.catch(() => { }).finally(() => {
			if (this._pendingSearch === search) {
				this._pendingSearch = undefined;
			}
		});
	}

	private _cancelSearchInterest(): void {
		this._pendingTreeReveal = undefined;
		this._historyInterest.clear();
		this._historyReadFailed = false;
		this._recomputeDelayer.cancel();
		this._revealScheduler.clear();
		this._repaintScheduler.clear();
		this._completeSettle();
	}

	private _search(): void {
		this._cancelSearchInterest();
		this._model.setQuery(this.inputValue, this._currentFindOptions());
		this._navigateToActive();
		if (!this._model.activeMatch) {
			this._seekOlder();
		}
	}

	private _scheduleRecompute(): void {
		if (!this.visible || this.host.transcriptVisible?.get() === false || this._isModelStale()) {
			return;
		}
		this._recomputeDelayer.trigger(() => {
			if (!this._refreshLoadedMatches()) {
				this._scheduleRepaint();
			}
			if (!this._model.activeMatch && !this._historyReadFailed) {
				this._seekOlder();
			}
		}).catch(() => { });
	}

	/** Returns whether newly available text already satisfied the search for its first hit. */
	private _refreshLoadedMatches(): boolean {
		const hadMatch = !!this._model.activeMatch;
		this._model.recompute();
		if (!hadMatch && this._model.activeMatch) {
			this._historyInterest.clear();
			this._navigateToActive();
			void this.updateResultCount();
			return true;
		}
		if (this._pendingTreeReveal && this._model.isActiveOccurrence(this._pendingTreeReveal)) {
			this._navigateToActive();
		} else {
			this._pendingTreeReveal = undefined;
		}
		return false;
	}

	/** A pending provider read is shared with the transcript; only this widget's interest is cancelled. */
	private _seekOlder(boundary?: IChatFindMatch, previous = false): boolean {
		if (this._historyInterest.value) {
			return true;
		}
		const model = this.host.activeModel?.get();
		const cursor = model?.olderHistoryCursor?.get();
		if (!this.visible || this.host.transcriptVisible?.get() === false || !this._model.query || this._model.isInvalidRegex || !model?.loadOlderHistory || cursor === undefined || model.olderHistoryUnavailable?.get()) {
			return false;
		}
		this._recomputeDelayer.cancel();
		this._revealScheduler.clear();
		this._completeSettle();
		void this._readUntilMatch(model, cursor, boundary, previous);
		return true;
	}

	private async _readUntilMatch(model: IChatModel, cursor: string, boundary: IChatFindMatch | undefined, previous: boolean): Promise<void> {
		const token = cancelOnDispose(this._historyInterest.value = new DisposableStore());
		this._historyReadFailed = false;
		void this.updateResultCount();
		const visited = new Set<string>();
		try {
			while (!token.isCancellationRequested && model.loadOlderHistory) {
				visited.add(cursor);
				try {
					await raceCancellation(model.loadOlderHistory(), token);
				} catch {
					if (token.isCancellationRequested) {
						return;
					}
					this._historyReadFailed = true;
				}
				if (token.isCancellationRequested || this._isModelStale()) {
					return;
				}
				this._recomputeDelayer.cancel();
				this._model.recompute();
				const next = model.olderHistoryCursor?.get();
				this._historyReadFailed ||= !model.olderHistoryCursor || !model.loadOlderHistory || (next !== undefined && visited.has(next));
				if (boundary ? this._model.selectOlderThan(boundary, previous) : this._model.activeMatch) {
					this._navigateToActive();
					return;
				}
				if (this._historyReadFailed || next === undefined || this._model.matches.length >= MAX_FIND_MATCHES) {
					if (boundary) {
						this._advanceActiveMatch(previous);
					}
					return;
				}
				cursor = next;
			}
		} finally {
			if (!token.isCancellationRequested) {
				this._historyInterest.clear();
				void this.updateResultCount();
			}
		}
	}

	/** Marks the start of locating an active match, if one is not already in progress. */
	private _beginSettle(): void {
		this._settleBarrier ??= new DeferredPromise<void>();
	}

	/** Marks the active match as located, dropped, or given up on, releasing the result count. */
	private _completeSettle(): void {
		const barrier = this._settleBarrier;
		this._settleBarrier = undefined;
		void barrier?.complete();
	}

	/**
	 * Waits for the query to be searched and its active match to be located. Locating can drop
	 * matches that turn out to be unreachable, so reading the count before then reports a total
	 * that is about to change.
	 */
	private async _whenSettled(): Promise<void> {
		// `FindInput.onDidChange` reads the count before `onInput` schedules the search.
		await Promise.resolve();
		for (let attempt = 0; attempt < MAX_SETTLE_WAITS; attempt++) {
			const pending = [this._pendingSearch, this._settleBarrier?.p].filter(isDefined);
			if (!pending.length) {
				return;
			}
			// A newer search may have started while awaiting, so re-check rather than assume.
			await Promise.all(pending).catch(() => { });
		}
	}

	protected async _getResultCount(): Promise<ISimpleFindResultCount | undefined> {
		await this._whenSettled();
		if (this._model.isInvalidRegex) {
			return undefined;
		}
		const model = this.host.activeModel?.get();
		const cursor = model?.olderHistoryCursor;
		const hasOlder = cursor?.get() !== undefined;
		const unavailable = model?.olderHistoryUnavailable?.get();
		const searching = !!this._historyInterest.value;
		const incomplete = !!this._model.query && (searching || this._historyReadFailed || !!unavailable || hasOlder || (!!model?.loadOlderHistory && !cursor));
		const resultCount = this._model.matches.length;
		let status: string | undefined;
		if (searching) {
			status = localize('chat.find.searchingHistory', "Searching…");
		} else if (this._historyReadFailed && resultCount) {
			status = localize('chat.find.partialAfterFailure', "{0} of {1}+ (search incomplete)", this._model.activeIndex + 1, resultCount);
		} else if (!resultCount && incomplete) {
			status = localize('chat.find.searchIncomplete', "Search incomplete");
		}
		return {
			resultIndex: this._model.activeIndex, resultCount, incomplete, status,
			canRetry: !searching && !unavailable && hasOlder && !!model?.loadOlderHistory,
		};
	}

	protected _onFocusTrackerFocus(): void {
		this._findWidgetFocusedKey.set(true);
	}

	protected _onFocusTrackerBlur(): void {
		this._findWidgetFocusedKey.reset();
	}

	protected _onFindInputFocusTrackerFocus(): void {
		this._findInputFocusedKey.set(true);
	}

	protected _onFindInputFocusTrackerBlur(): void {
		this._findInputFocusedKey.reset();
	}

	private _currentFindOptions() {
		return { isRegex: this._getRegexValue(), matchCase: this._getCaseSensitiveValue(), wholeWord: this._getWholeWordValue() };
	}

	private _onMatchesChanged(): void {
		if (!this._historyInterest.value) {
			void this.updateResultCount();
		}
	}

	private _navigateToActive(): void {
		this._pendingTreeReveal = undefined;
		this._revealScheduler.clear();
		const match = this._model.activeMatch;
		this._clearHighlights();
		this._beginSettle();

		if (!match) {
			this._completeSettle();
			return;
		}

		const item = this._getRevealableItem(match);
		if (!item) {
			return;
		}
		this.host.reveal(item);
		this._revealScheduler.value = dom.scheduleAtNextAnimationFrame(this._targetWindow, () => this._revealActiveMatch(match));
	}

	private _getRevealableItem(match: IChatFindMatch): ChatTreeItem | undefined {
		if (this._model.isActiveOccurrence(match)) {
			const item = this._findItemForMatch(match);
			if (item && this.host.hasElement?.(item) !== false) {
				return item;
			}
			// The view model can contain a prepended page before the list refreshes.
			this._pendingTreeReveal = item ? match : undefined;
		}
		this._completeSettle();
		return undefined;
	}

	private _revealActiveMatch(match: IChatFindMatch, attempt: number = 0): void {
		const item = this._getRevealableItem(match);
		if (!item) {
			return;
		}
		const locatedMatch = this._locateMatch(match);
		if (!locatedMatch) {
			// A long jump outruns the list, which mounts and re-measures rows over later frames.
			if (attempt < ChatFindWidget.MAX_LOCATE_ATTEMPTS) {
				this.host.reveal(item);
				this._revealScheduler.value = dom.scheduleAtNextAnimationFrame(this._targetWindow, () => this._revealActiveMatch(match, attempt + 1));
				return;
			}
			this._repaintVisibleHighlights();
			this._skipUnlocatableMatch();
			return;
		}
		if (isCodeMatch(locatedMatch)) {
			const uri = locatedMatch.codeBlock.uri;
			const sourceRevealed = uri ? this.host.getCodeBlockInfoForEditor(uri)?.reveal?.() : false;
			const revealCodeMatch = () => {
				locatedMatch.codeBlock.editor.revealRangeInCenter(locatedMatch.range);
				this._repaintVisibleHighlights();
				this._revealRect(this._codeMatchRect(locatedMatch));
				this._completeSettle();
			};
			const disclosureOpened = openAncestorDisclosures(this.host.transcriptDomNode, locatedMatch.codeBlock.element);
			if (sourceRevealed || disclosureOpened) {
				this._revealScheduler.value = dom.scheduleAtNextAnimationFrame(this._targetWindow, revealCodeMatch);
			} else {
				revealCodeMatch();
			}
			return;
		}

		const range = locatedMatch;
		const opened = this._openAncestorDisclosures(range);
		this._repaintVisibleHighlights();
		if (opened) {
			this._revealScheduler.value = dom.scheduleAtNextAnimationFrame(this._targetWindow, () => {
				this._revealRect(this._rangeRect(range));
				this._completeSettle();
			});
		} else {
			this._revealRect(this._rangeRect(range));
			this._completeSettle();
		}
	}

	/**
	 * Scrolls the transcript so `rect` is in view, in either direction, and reports whether it
	 * moved.
	 *
	 * Deliberately not `Element.scrollIntoView`: the chat list picks up native scrolling by
	 * reading the container's `scrollTop` and resetting it to `0` (see `scrollToActiveElement` in
	 * `listView.ts`), so the browser can only ever hand it a downward delta. Scrolling up — which
	 * is now the common direction, since matches run newest first — would silently do nothing.
	 */
	private _scrollRectIntoView(rect: { readonly top: number; readonly bottom: number } | undefined): boolean {
		if (!rect) {
			return false;
		}
		const viewportTop = this.host.transcriptDomNode.getBoundingClientRect().top;
		const scrollTop = computeRevealScrollTop(
			this.host.getScrollTop(),
			this.host.getRenderHeight(),
			rect.top - viewportTop,
			rect.bottom - viewportTop
		);
		if (scrollTop === undefined) {
			return false;
		}
		this.host.setScrollTop(scrollTop);
		return true;
	}

	/** Scrolls to a match and repaints once the rows the scroll brought into view have mounted. */
	private _revealRect(rect: { readonly top: number; readonly bottom: number } | undefined): void {
		if (this._scrollRectIntoView(rect)) {
			this._scheduleRepaint();
		}
	}

	/** The match's own rectangle, falling back to its element for ranges that measure as empty. */
	private _rangeRect(range: Range): { readonly top: number; readonly bottom: number } | undefined {
		const rect = range.getBoundingClientRect();
		if (rect.height > 0) {
			return rect;
		}
		const element = range.startContainer.nodeType === this._targetWindow.Node.ELEMENT_NODE
			? range.startContainer as Element
			: range.startContainer.parentElement;
		return element?.getBoundingClientRect();
	}

	/**
	 * The matched line's rectangle inside an embedded editor. Only visible lines exist in the DOM,
	 * so the position is derived from the editor's layout rather than looked up as a node.
	 */
	private _codeMatchRect(codeMatch: ILocatedCodeMatch): { readonly top: number; readonly bottom: number } | undefined {
		const editor = codeMatch.codeBlock.editor;
		const editorDomNode = editor.getDomNode();
		if (!editorDomNode) {
			return undefined;
		}
		const lineTop = editorDomNode.getBoundingClientRect().top
			+ editor.getTopForLineNumber(codeMatch.range.startLineNumber)
			- editor.getScrollTop();
		return { top: lineTop, bottom: lineTop + editor.getOption(EditorOption.lineHeight) };
	}

	private _findItemForMatch(match: IChatFindMatch): ChatTreeItem | undefined {
		return this.host.getItems().find(item => item.id === match.itemId);
	}

	/** Opens every closed `<details>` ancestor of `range`, up to the transcript root. Returns whether any were toggled. */
	private _openAncestorDisclosures(range: Range): boolean {
		return openAncestorDisclosures(this.host.transcriptDomNode, range.startContainer);
	}

	private _scheduleRepaint(): void {
		this._repaintScheduler.value = dom.scheduleAtNextAnimationFrame(this._targetWindow, () => this._repaintVisibleHighlights());
	}

	private _tryCreateRegex(): RegExp | undefined {
		try {
			return createRegExp(this._model.query, this._model.options.isRegex, {
				matchCase: this._model.options.matchCase,
				wholeWord: this._model.options.wholeWord,
				global: true,
				unicode: true,
			});
		} catch {
			return undefined;
		}
	}

	/**
	 * The DOM subtrees that can own `match`, in document order. Matches with a rendered part use
	 * it directly; row-level response matches search the trailing parts (error details and other
	 * content following the response body) so their occurrence is not counted against the body.
	 */
	private _locateMatchRoots(match: IChatFindMatch, template: IChatListItemTemplate | undefined): HTMLElement[] {
		if (match.partIndex >= 0) {
			const partRoot = template?.renderedParts?.[match.partIndex]?.domNode;
			if (partRoot) {
				return [partRoot];
			}
		} else if (match.scopeStartPartIndex !== undefined && template?.renderedParts) {
			const trailing = template.renderedParts.slice(match.scopeStartPartIndex).map(part => part?.domNode).filter(isDefined);
			if (trailing.length) {
				return trailing;
			}
		}
		return template?.value ? [template.value] : [];
	}

	/** Locates the active match's DOM range within its rendered content part (or the whole row as a fallback). */
	private _locateMatch(match: IChatFindMatch, regex?: RegExp): LocatedMatch | undefined {
		const template = this.host.getTemplateDataForRequestId(match.itemId);
		const roots = this._locateMatchRoots(match, template);
		if (!roots.length) {
			return undefined;
		}
		const effectiveRegex = regex ?? this._tryCreateRegex();
		if (!effectiveRegex) {
			return undefined;
		}

		const locations: { node: Node; order: number; match: LocatedMatch }[] = [];
		for (const root of roots) {
			const codeBlocks = [...this.host.editorsInUse()]
				.filter(codeBlock => root.contains(codeBlock.element))
				.sort((first, second) => first.element.compareDocumentPosition(second.element) & 4 ? -1 : 1);

			findMatchRangesInDom(
				root,
				effectiveRegex,
				match.occurrenceIndex + 1,
				codeBlocks.map(codeBlock => codeBlock.element)
			).forEach((range, order) => locations.push({ node: range.startContainer, order, match: range }));

			for (const codeBlock of codeBlocks) {
				const ranges = findMatchRangesInCodeBlock(codeBlock, effectiveRegex, match.occurrenceIndex + 1);
				for (let order = 0; order < ranges.length; order++) {
					locations.push({
						node: codeBlock.element,
						order,
						match: { codeBlock, range: ranges[order] },
					});
				}
			}
		}
		locations.sort((first, second) => first.node === second.node
			? first.order - second.order
			: first.node.compareDocumentPosition(second.node) & 4 ? -1 : 1);
		return locations[match.occurrenceIndex]?.match;
	}

	private _repaintVisibleHighlights(): void {
		const registry = getChatFindHighlightRegistry(this._targetWindow);

		if (!this.isVisible() || !this._model.matches.length || !this._model.query) {
			registry.clear(this);
			this._updateCodeDecorations(new Map());
			return;
		}

		const regex = this._tryCreateRegex();
		if (!regex) {
			registry.clear(this);
			this._updateCodeDecorations(new Map());
			return;
		}

		const currentRanges: Range[] = [];
		const otherRanges: Range[] = [];
		const codeDecorations = new Map<CodeBlockPart, { range: EditorRange; current: boolean }[]>();
		// Counts code-block matches too: they are painted as editor decorations rather than DOM
		// ranges, so bounding only the ranges would let an all-code result set rescan every match.
		let locatedCount = 0;
		// Most matches usually belong to rows the virtualized list has not rendered. Skipping them
		// on the row lookup alone keeps a transcript-wide result set from scanning parts per repaint.
		const renderedRows = new Map<string, boolean>();
		for (let index = 0; index < this._model.matches.length && locatedCount < MAX_VISIBLE_HIGHLIGHTS; index++) {
			const match = this._model.matches[index];
			let isRendered = renderedRows.get(match.itemId);
			if (isRendered === undefined) {
				isRendered = !!this.host.getTemplateDataForRequestId(match.itemId);
				renderedRows.set(match.itemId, isRendered);
			}
			if (!isRendered) {
				continue;
			}
			const locatedMatch = this._locateMatch(match, regex);
			if (!locatedMatch) {
				continue;
			}
			locatedCount++;
			if (isCodeMatch(locatedMatch)) {
				const decorations = codeDecorations.get(locatedMatch.codeBlock) ?? [];
				decorations.push({ range: locatedMatch.range, current: index === this._model.activeIndex });
				codeDecorations.set(locatedMatch.codeBlock, decorations);
			} else {
				(index === this._model.activeIndex ? currentRanges : otherRanges).push(locatedMatch);
			}
		}

		if (supportsCssHighlightApi(this._targetWindow)) {
			registry.setRanges(this, CURRENT_MATCH_HIGHLIGHT_NAME, currentRanges, 1);
			registry.setRanges(this, OTHER_MATCH_HIGHLIGHT_NAME, otherRanges, 0);
		} else {
			registry.clear(this);
		}
		this._updateCodeDecorations(codeDecorations);
	}

	private _updateCodeDecorations(matches: Map<CodeBlockPart, { range: EditorRange; current: boolean }[]>): void {
		for (const [codeBlock, collection] of this._codeDecorations) {
			collection.clear();
			if (!matches.has(codeBlock)) {
				this._codeDecorations.delete(codeBlock);
			}
		}
		for (const [codeBlock, decorations] of matches) {
			let collection = this._codeDecorations.get(codeBlock);
			if (!collection) {
				collection = codeBlock.editor.createDecorationsCollection();
				this._codeDecorations.set(codeBlock, collection);
			}
			collection.set(decorations.map(({ range, current }) => ({
				range,
				options: {
					description: current ? 'chat-find-current-match' : 'chat-find-other-match',
					inlineClassName: current ? 'chat-find-current-match' : 'chat-find-other-match',
				},
			})));
		}
	}

	private _clearHighlights(): void {
		getChatFindHighlightRegistry(this._targetWindow).clear(this);
		this._updateCodeDecorations(new Map());
	}

	private _restoreFocus(): void {
		const target = this._lastFocusedElement;
		this._lastFocusedElement = undefined;
		if (target && target.isConnected) {
			target.focus();
		} else {
			this.host.transcriptDomNode.focus();
		}
	}

	override dispose(): void {
		this._completeSettle();
		this._clearHighlights();
		super.dispose();
	}
}
