/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './chatFindWidget.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { createRegExp } from '../../../../../../base/common/strings.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { Event } from '../../../../../../base/common/event.js';
import { MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { Range as EditorRange } from '../../../../../../editor/common/core/range.js';
import { IEditorDecorationsCollection } from '../../../../../../editor/common/editorCommon.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { SimpleFindWidget } from '../../../../codeEditor/browser/find/simpleFindWidget.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatTreeItem, IChatFindController } from '../../chat.js';
import { IChatListItemTemplate } from '../chatListRenderer.js';
import { CodeBlockPart } from '../chatContentParts/codeBlockPart.js';
import { ChatFindCommandId } from './chatFindCommandIds.js';
import { getChatFindHighlightRegistry, supportsCssHighlightApi } from './chatFindHighlights.js';
import { ChatFindModel, IChatFindMatch } from './chatFindModel.js';

export interface IChatFindHost {
	readonly transcriptDomNode: HTMLElement;
	getItems(): readonly ChatTreeItem[];
	readonly onDidChangeContent: Event<void>;
	reveal(item: ChatTreeItem, relativeTop?: number): void;
	getTemplateDataForRequestId(requestId: string | undefined): IChatListItemTemplate | undefined;
	readonly onDidRerenderRow: Event<IChatListItemTemplate>;
	editorsInUse(): Iterable<CodeBlockPart>;
}

/** Upper bound on the number of DOM ranges highlighted at once (only ever the currently mounted/visible rows). */
const MAX_VISIBLE_HIGHLIGHTS = 500;

const CHAT_FIND_WIDGET_INITIAL_WIDTH = 350;

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
	const ownerDocument = root.ownerDocument;
	const nodes: { node: Text; start: number; end: number }[] = [];
	let buffer = '';
	let block: Element | undefined;
	let separatorPending = false;
	const walker = ownerDocument.createTreeWalker(root, 5 /* NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT */);
	let current: Node | null;
	while ((current = walker.nextNode())) {
		if (excludedRoots.some(candidate => candidate.contains(current))) {
			separatorPending = true;
			continue;
		}
		if (current.nodeType !== 3 /* Node.TEXT_NODE */) {
			separatorPending ||= (current as Element).tagName === 'BR';
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
	private readonly _codeDecorations = new Map<CodeBlockPart, IEditorDecorationsCollection>();

	private _lastFocusedElement: HTMLElement | undefined;
	private _lastNavigationWasPrevious = false;
	private _unlocatableSkips = 0;

	/** Bounds the skip walk so a query whose matches are all unlocatable cannot spin. */
	private static readonly MAX_UNLOCATABLE_SKIPS = 50;

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
			showResultCount: true,
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

		this._model = this._register(new ChatFindModel(() => this.host.getItems()));
		this._register(this._model.onDidChangeMatches(() => this._onMatchesChanged()));

		this._register(this.host.onDidChangeContent(() => {
			if (this.isVisible()) {
				this._recomputeDelayer.trigger(() => {
					this._model.recompute();
					// The row usually rerenders before this debounced pass, so its repaint ran
					// against the previous match set; repaint again now the new matches exist.
					this._scheduleRepaint();
				}).catch(() => { });
			}
		}));
		this._register(this.host.onDidRerenderRow(() => {
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
		if (shouldCaptureFocusBeforeShow(this.isVisible())) {
			this._lastFocusedElement = this._targetWindow.document.activeElement as HTMLElement | undefined;
		}
		this._findWidgetVisibleKey.set(true);
		if (focus) {
			super.reveal(seedText);
		} else {
			super.show(seedText);
		}
		this._model.setQuery(this.inputValue, this._currentFindOptions());
		this._navigateToActive();
	}

	override hide(): void {
		super.hide();
		this._findWidgetVisibleKey.reset();
		this._recomputeDelayer.cancel();
		this._clearHighlights();
		this._model.clear();
		this._restoreFocus();
	}

	find(previous: boolean): void {
		this._lastNavigationWasPrevious = previous;
		this._unlocatableSkips = 0;
		this._advanceActiveMatch(previous);
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
	 * Moves past a match the DOM cannot produce, so navigation never appears to do nothing. The
	 * index predicts where the renderer will put content, and a part nested in a lazily-built
	 * container has no DOM node to land on; rather than stall, continue in the same direction.
	 */
	private _skipUnlocatableMatch(): void {
		if (this._unlocatableSkips >= ChatFindWidget.MAX_UNLOCATABLE_SKIPS) {
			return;
		}
		this._unlocatableSkips++;
		this._advanceActiveMatch(this._lastNavigationWasPrevious);
	}

	findFirst(): void {
		this._model.setQuery(this.inputValue, this._currentFindOptions());
		this._navigateToActive();
	}

	next(): void {
		this.find(false);
	}

	previous(): void {
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
		this._model.setQuery(this.inputValue, this._currentFindOptions());
		this._navigateToActive();
		return this._model.matches.length > 0;
	}

	protected async _getResultCount(): Promise<{ resultIndex: number; resultCount: number } | undefined> {
		if (this._model.isInvalidRegex) {
			return undefined;
		}
		return { resultIndex: this._model.activeIndex, resultCount: this._model.matches.length };
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
		void this.updateResultCount();
	}

	private _navigateToActive(): void {
		const match = this._model.activeMatch;
		this._clearHighlights();

		if (!match) {
			return;
		}

		const item = this._findItemForMatch(match);
		if (item) {
			this.host.reveal(item);
		}

		this._revealScheduler.value = dom.scheduleAtNextAnimationFrame(this._targetWindow, () => this._revealActiveMatch(match));
	}

	private _revealActiveMatch(match: IChatFindMatch): void {
		const locatedMatch = this._locateMatch(match);
		if (!locatedMatch) {
			this._repaintVisibleHighlights();
			this._skipUnlocatableMatch();
			return;
		}
		if (isCodeMatch(locatedMatch)) {
			const revealCodeMatch = () => {
				locatedMatch.codeBlock.editor.revealRangeInCenter(locatedMatch.range);
				this._repaintVisibleHighlights();
			};
			if (openAncestorDisclosures(this.host.transcriptDomNode, locatedMatch.codeBlock.element)) {
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
			this._revealScheduler.value = dom.scheduleAtNextAnimationFrame(this._targetWindow, () => this._scrollRangeIntoView(range));
		} else {
			this._scrollRangeIntoView(range);
		}
	}

	private _scrollRangeIntoView(range: Range | undefined): void {
		const container = range && (range.startContainer.nodeType === this._targetWindow.Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement);
		container?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
		this._clearHighlights();
		super.dispose();
	}
}
