/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IChatRendererContent } from '../../common/model/chatViewModel.js';
import { IChatContentPart } from './chatContentParts/chatContentParts.js';

/** Responses with more renderable parts than this render their older parts on demand. */
export const DEFERRED_RENDERING_MIN_PARTS = 200;
/** How many of the newest parts are rendered at least when a long response is first shown. */
export const DEFERRED_RENDERING_INITIAL_PARTS = 40;
/** How many parts are rendered at least each time more of a long response is shown. */
export const DEFERRED_RENDERING_CHUNK_PARTS = 40;
/** Ranges smaller than this are rendered right away, since deferring them saves little. */
export const DEFERRED_RENDERING_MIN_DEFERRED_PARTS = 40;

/** Describes which parts of a response may start or end a range that renders on demand. */
export interface IDeferredRenderingContent {
	readonly length: number;
	/**
	 * Whether the part at `index` can begin rendered content right after a range that renders on demand:
	 * rendering it ends any open thinking group, and no subagent group spans across it.
	 */
	isBoundary(index: number): boolean;
	/** Whether the part at `index` must always be rendered, for example because it is still live. */
	isProtected(index: number): boolean;
}

/** A contiguous range of content indices `[start, end)` whose parts render on demand. */
export interface IDeferredRange {
	readonly start: number;
	readonly end: number;
}

/**
 * Picks the range of a long response that renders on demand. The range ends at a boundary at or before
 * `endLimit`, so the part after it starts a new group exactly as it would in a full render, and it starts
 * after the last protected part before that end. Returns `undefined` when the range would be too small.
 */
export function computeDeferredRange(content: IDeferredRenderingContent, endLimit: number, startFloor: number, minimumDeferred: number): IDeferredRange | undefined {
	let end = Math.min(endLimit, content.length - 1);
	while (end > startFloor && !content.isBoundary(end)) {
		end--;
	}
	let start = startFloor;
	for (let index = end - 1; index >= startFloor; index--) {
		if (content.isProtected(index)) {
			start = index + 1;
			break;
		}
	}
	start = snapDeferredStart(content, start, end);
	return end - start >= minimumDeferred ? { start, end } : undefined;
}

/**
 * A deferred range that does not begin the response must begin at a boundary: rendering that boundary would
 * have ended the group that the parts before the range left open.
 */
function snapDeferredStart(content: IDeferredRenderingContent, start: number, end: number): number {
	if (start === 0) {
		return start;
	}
	while (start < end && !content.isBoundary(start)) {
		start++;
	}
	return start;
}

/** The end of the range after rendering at least `minimum` of its newest parts. */
export function getNextDeferredEnd(range: IDeferredRange, content: IDeferredRenderingContent, minimum: number): number {
	let end = range.end - minimum;
	if (end <= range.start) {
		return range.start;
	}
	while (end > range.start && !content.isBoundary(end)) {
		end--;
	}
	return end;
}

/** The start of the range after rendering at least `minimum` of its oldest parts. */
export function getNextDeferredStart(range: IDeferredRange, content: IDeferredRenderingContent, minimum: number): number {
	let start = range.start + minimum;
	if (start >= range.end) {
		return range.end;
	}
	while (start < range.end && !content.isBoundary(start)) {
		start++;
	}
	return start;
}

/**
 * Which side of the deferred range to render next, given where the gap control is relative to the visible part of
 * the list, or `undefined` when it is more than a viewport away.
 *
 * Parts above the viewport render newest first and keep the content below them in place. Parts below it render
 * oldest first, growing the content downwards. When the gap is visible, the side that keeps most of the visible
 * content still is chosen, unless the user opened the steps and reads them from the first one.
 */
export function getDeferredRenderingSide(gap: { readonly top: number; readonly bottom: number }, viewport: { readonly top: number; readonly bottom: number }, preferOldest: boolean): 'oldest' | 'newest' | undefined {
	const margin = viewport.bottom - viewport.top;
	if (gap.bottom < viewport.top - margin || gap.top > viewport.bottom + margin) {
		return undefined;
	}
	if (gap.bottom <= viewport.top) {
		return 'newest';
	}
	if (gap.top >= viewport.bottom || preferOldest) {
		return 'oldest';
	}
	return (gap.top + gap.bottom) / 2 < (viewport.top + viewport.bottom) / 2 ? 'newest' : 'oldest';
}

/**
 * Counts the fenced code blocks a markdown string renders, excluding the `vscode-extensions` blocks that
 * `ChatMarkdownContentPart` renders without numbering them. Parts that are not rendered yet report this count
 * so the code blocks after them keep the numbers they would have in a full render.
 */
export function countMarkdownCodeBlocks(markdown: string): number {
	let count = 0;
	let openFence: string | undefined;
	for (const line of markdown.split(/\r?\n/)) {
		const match = /^ {0,3}(?<fence>`{3,}|~{3,})(?<info>.*)$/.exec(line);
		const fence = match?.groups?.fence;
		const info = match?.groups?.info ?? '';
		if (!openFence) {
			// A backtick fence's info string cannot contain backticks.
			if (fence && !(fence[0] === '`' && info.includes('`'))) {
				openFence = fence;
				if (info.trim().split(/\s+/)[0] !== 'vscode-extensions') {
					count++;
				}
			}
		} else if (fence && fence[0] === openFence[0] && fence.length >= openFence.length && !info.trim()) {
			openFence = undefined;
		}
	}
	return count;
}

/**
 * Identifies a part well enough to find it again after the content of a response is reordered, for example
 * when a completed response moves session outcome tools after its final answer.
 */
export function getDeferredRenderingContentKey(part: IChatRendererContent | undefined): string | undefined {
	if (!part) {
		return undefined;
	}
	switch (part.kind) {
		case 'markdownContent':
			return `markdown:${part.content.value.length}:${part.content.value.slice(0, 100)}`;
		case 'toolInvocation':
		case 'toolInvocationSerialized':
			return `tool:${part.toolCallId}`;
		case 'systemNotification':
			return `notification:${part.content.value}`;
		default:
			return part.kind;
	}
}

/**
 * Tracks which parts of one long response render on demand. Parts in `[start, end)` are rendered as
 * {@link ChatDeferredContentPart}s. A gap control placed after the last of them offers to render more.
 */
export class ChatDeferredResponseRendering extends Disposable {

	private _start: number;
	private _end: number;
	private _startKey: string | undefined;
	private _endKey: string | undefined;

	/** Renders the oldest parts first, after the user opened the collapsed range that holds them. */
	preferOldest = false;

	/** The list index the response was last rendered at. */
	elementIndex = 0;

	/** Whether the range was chosen to match the collapsed steps of a completed response. */
	matchesCompletedResponseCollapse = false;

	/**
	 * Whether the thinking group that the parts before the range leave open still has to be ended, as the
	 * boundary at the start of the range would have done in a full render.
	 */
	needsLeadingFinalization = false;

	/** The control shown in place of the parts that are not rendered yet. */
	readonly gap: HTMLElement;
	private readonly _button: HTMLButtonElement;
	private readonly _label: HTMLElement;

	constructor(
		readonly elementId: string,
		range: IDeferredRange,
		content: ReadonlyArray<IChatRendererContent>,
		onDidRequestMore: () => void,
	) {
		super();
		this._start = range.start;
		this._end = range.end;
		this.gap = dom.$('.chat-deferred-content-gap');
		this._button = dom.append(this.gap, dom.$<HTMLButtonElement>('button.chat-deferred-content-gap-button', { type: 'button' }));
		dom.append(this._button, dom.$('span.chat-deferred-content-gap-icon', { 'aria-hidden': 'true' })).classList.add(...ThemeIcon.asClassNameArray(Codicon.unfold));
		this._label = dom.append(this._button, dom.$('span.chat-deferred-content-gap-label'));
		this._register(dom.addDisposableListener(this._button, dom.EventType.CLICK, () => onDidRequestMore()));
		this._register({ dispose: () => this.gap.remove() });
		this.updateKeys(content);
	}

	get start(): number {
		return this._start;
	}

	get end(): number {
		return this._end;
	}

	get count(): number {
		return this._end - this._start;
	}

	get startKey(): string | undefined {
		return this._startKey;
	}

	get endKey(): string | undefined {
		return this._endKey;
	}

	get button(): HTMLButtonElement {
		return this._button;
	}

	isDeferred(index: number): boolean {
		return index >= this._start && index < this._end;
	}

	setRange(range: IDeferredRange, content: ReadonlyArray<IChatRendererContent>): void {
		this._start = range.start;
		this._end = Math.max(range.start, range.end);
		this.updateKeys(content);
	}

	/** Renders every remaining part on the next pass. */
	clear(): void {
		this._start = this._end = 0;
		this._startKey = this._endKey = undefined;
		this.gap.remove();
	}

	private updateKeys(content: ReadonlyArray<IChatRendererContent>): void {
		this._startKey = this._start > 0 ? getDeferredRenderingContentKey(content[this._start - 1]) : undefined;
		this._endKey = getDeferredRenderingContentKey(content[this._end]);
		const label = localize('chat.deferredContent.show', "Show {0} Earlier Items", this.count);
		this._label.textContent = label;
		this._button.setAttribute('aria-label', label);
	}
}

/**
 * Stands in for a part that is not rendered yet. It keeps the part's position in the response, so that rendering
 * it later replaces this element in place and every index-based relationship of the renderer is preserved.
 */
export class ChatDeferredContentPart implements IChatContentPart {

	readonly domNode: HTMLElement;

	constructor(
		private readonly _state: ChatDeferredResponseRendering,
		private readonly _index: number,
		/** Code blocks the part is expected to number, so later parts keep their numbers. */
		readonly estimatedCodeBlockCount: number,
		/** Whether the part renders a file tree, so later trees keep their numbers. */
		readonly isTree: boolean,
	) {
		this.domNode = dom.$('.chat-deferred-content-part');
		this.domNode.hidden = true;
	}

	get isDeferred(): boolean {
		return this._state.isDeferred(this._index);
	}

	hasSameContent(): boolean {
		return this.isDeferred;
	}

	dispose(): void {
		// The renderer replaces or removes the element itself, like it does for every other part.
	}
}
