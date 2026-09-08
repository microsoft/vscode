/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRegExp } from '../../../../../../base/common/strings.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ChatTreeItem } from '../../chat.js';
import { getChatFindTextParts } from './chatFindContent.js';
import { isRequestVM, isResponseVM } from '../../../common/model/chatViewModel.js';
import { annotateSpecialMarkdownContentWithSource } from '../../../common/widget/annotations.js';
import { moveResponseOutcomeToolsAfterFinalResponse } from '../chatListRenderer.js';
import { getChatRequestText } from '../../chatRequestText.js';

/** Upper bound on tracked matches, mirroring `LIMIT_FIND_COUNT` in `textModelSearch.ts`, so a pathological regex can't pin the UI. */
export const MAX_FIND_MATCHES = 9999;

export interface IChatFindOptions {
	readonly isRegex: boolean;
	readonly matchCase: boolean;
	readonly wholeWord: boolean;
}

export type ChatFindItemKind = 'request' | 'response';

export interface IChatFindMatch {
	readonly itemId: string;
	readonly itemKind: ChatFindItemKind;
	/** Index into the row's rendered parts, or `-1` for row-level text. */
	readonly partIndex: number;
	/**
	 * For `partIndex === -1` response matches, the first rendered-part index that can hold this
	 * text. Keeps the search off the parts that response content already owns, whose matches
	 * are counted separately.
	 */
	readonly scopeStartPartIndex?: number;
	/** 0-based index of this match among all matches found within the same (itemId, partIndex) segment. */
	readonly occurrenceIndex: number;
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

interface IChatFindSegment {
	readonly itemId: string;
	readonly itemKind: ChatFindItemKind;
	readonly partIndex: number;
	readonly scopeStartPartIndex?: number;
	readonly text: string;
}

/** Stable identity of a match, used to keep the "active" match anchored across recomputes (e.g. while streaming). */
interface IChatFindAnchor {
	readonly itemId: string;
	readonly partIndex: number;
	readonly occurrenceIndex: number;
}

function buildSegments(items: readonly ChatTreeItem[]): IChatFindSegment[] {
	const segments: IChatFindSegment[] = [];
	for (const item of items) {
		if (isRequestVM(item)) {
			// Index the text the row actually displays: a request rendered as a
			// widget (an Agent Merge summary) keeps its own text out of the DOM,
			// where a match could not be revealed.
			const text = getChatRequestText(item);
			if (text && text.trim().length > 0) {
				segments.push({ itemId: item.id, itemKind: 'request', partIndex: -1, text });
			}
		} else if (isResponseVM(item)) {
			// A filtered response renders no content at all, so row-level text starts at 0.
			const isFiltered = !!item.errorDetails?.responseIsFiltered;
			const annotated = isFiltered ? [] : annotateSpecialMarkdownContentWithSource(item.response.value);
			const renderedContent = item.isComplete
				? moveResponseOutcomeToolsAfterFinalResponse(annotated.map(entry => entry.content))
				: annotated.map(entry => entry.content);
			// Mirrors the renderer, which puts the references slot first and code citations
			// between the response content and the trailing parts that hold row-level text.
			const trailingPartIndex = isFiltered ? 0 : renderedContent.length + 1 + (item.codeCitations?.length ? 1 : 0);
			// Indexes only what the response renders: `getChatFindTextParts` deliberately omits
			// reasoning and tool result payloads, whose text does not exist in the DOM until
			// their container is expanded, so a match there could never be revealed.
			const parts = getChatFindTextParts(item);
			const textByRenderedPart = new Map<number, string>();
			for (const part of parts) {
				if (part.text.trim().length > 0) {
					const annotatedPart = annotated.find(entry => entry.sourceIndexes.includes(part.partIndex))?.content;
					const renderedPartIndex = annotatedPart ? renderedContent.indexOf(annotatedPart) : -1;
					const partIndex = renderedPartIndex >= 0 ? renderedPartIndex + 1 : -1;
					textByRenderedPart.set(partIndex, (textByRenderedPart.get(partIndex) ?? '') + part.text);
				}
			}
			for (const [partIndex, text] of [...textByRenderedPart].sort(([first], [second]) => {
				if (first === -1) {
					return 1;
				}
				if (second === -1) {
					return -1;
				}
				return first - second;
			})) {
				segments.push({
					itemId: item.id,
					itemKind: 'response',
					partIndex,
					scopeStartPartIndex: partIndex === -1 ? trailingPartIndex : undefined,
					text,
				});
			}
		}
	}
	return segments;
}

/**
 * Bounds a single segment's scan. Higher than {@link MAX_FIND_MATCHES} because a segment has to be
 * scanned past the cap to know which of its occurrences are the newest, but still finite so a
 * pathological regex over a huge response cannot pin the UI.
 */
const MAX_SEGMENT_SCAN = 100_000;

/** The segment's last `limit` matches, since navigation visits a segment's newest occurrence first. */
function findMatchesInSegment(segment: IChatFindSegment, regex: RegExp, limit: number): IChatFindMatch[] {
	if (limit <= 0) {
		return [];
	}
	const matches: IChatFindMatch[] = [];
	regex.lastIndex = 0;
	let occurrenceIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(segment.text))) {
		matches.push({
			itemId: segment.itemId,
			itemKind: segment.itemKind,
			partIndex: segment.partIndex,
			scopeStartPartIndex: segment.scopeStartPartIndex,
			occurrenceIndex,
			start: match.index,
			end: match.index + match[0].length,
			text: match[0],
		});
		occurrenceIndex++;
		if (match[0].length === 0) {
			regex.lastIndex++;
		}
		// Trimming at twice the limit bounds the window without shifting on every match.
		if (matches.length >= limit * 2) {
			matches.splice(0, matches.length - limit);
		}
		if (occurrenceIndex >= MAX_SEGMENT_SCAN) {
			break;
		}
	}
	return matches.length > limit ? matches.slice(-limit) : matches;
}

/** Searches the logical chat transcript independently of rendered rows. */
export class ChatFindModel extends Disposable {

	private readonly _onDidChangeMatches = this._register(new Emitter<void>());
	readonly onDidChangeMatches: Event<void> = this._onDidChangeMatches.event;

	private _query = '';
	private _options: IChatFindOptions = { isRegex: false, matchCase: false, wholeWord: false };
	private _matches: IChatFindMatch[] = [];
	private _activeIndex = -1;
	private _activeAnchor: IChatFindAnchor | undefined;
	private _invalidRegex = false;

	constructor(
		private readonly getItems: () => readonly ChatTreeItem[],
		private readonly getViewportAnchorItemId: () => string | undefined = () => undefined
	) {
		super();
	}

	get query(): string {
		return this._query;
	}

	get options(): IChatFindOptions {
		return this._options;
	}

	/** True when the current query is an invalid regular expression. */
	get isInvalidRegex(): boolean {
		return this._invalidRegex;
	}

	get matches(): readonly IChatFindMatch[] {
		return this._matches;
	}

	get activeIndex(): number {
		return this._activeIndex;
	}

	get activeMatch(): IChatFindMatch | undefined {
		return this._activeIndex >= 0 ? this._matches[this._activeIndex] : undefined;
	}

	setQuery(query: string, options: IChatFindOptions): void {
		const changed = query !== this._query
			|| options.isRegex !== this._options.isRegex
			|| options.matchCase !== this._options.matchCase
			|| options.wholeWord !== this._options.wholeWord;
		this._query = query;
		this._options = options;
		if (changed) {
			this._activeAnchor = undefined;
			this._activeIndex = -1;
		}
		this.recompute();
	}

	/** Rebuilds matches from the current transcript, preserving the active match's anchor when it still exists. */
	recompute(): void {
		const previousAnchor = this._activeAnchor;

		if (!this._query) {
			this._matches = [];
			this._activeIndex = -1;
			this._activeAnchor = undefined;
			this._invalidRegex = false;
			this._onDidChangeMatches.fire();
			return;
		}

		let regex: RegExp;
		try {
			regex = createRegExp(this._query, this._options.isRegex, {
				matchCase: this._options.matchCase,
				wholeWord: this._options.wholeWord,
				global: true,
				unicode: true,
			});
			this._invalidRegex = false;
		} catch {
			this._invalidRegex = true;
			this._matches = [];
			this._activeIndex = -1;
			this._onDidChangeMatches.fire();
			return;
		}

		const items = this.getItems();
		const segments = buildSegments(items);
		const matches: IChatFindMatch[] = [];
		// Newest first: `buildSegments` produces transcript order, so both walks are reversed.
		for (let index = segments.length - 1; index >= 0 && matches.length < MAX_FIND_MATCHES; index--) {
			const segmentMatches = findMatchesInSegment(segments[index], regex, MAX_FIND_MATCHES - matches.length);
			for (let occurrence = segmentMatches.length - 1; occurrence >= 0; occurrence--) {
				matches.push(segmentMatches[occurrence]);
			}
		}

		this._matches = matches;

		if (previousAnchor) {
			this._activeIndex = matches.findIndex(m => m.itemId === previousAnchor.itemId && m.partIndex === previousAnchor.partIndex && m.occurrenceIndex === previousAnchor.occurrenceIndex);
		}
		if (this._activeIndex < 0) {
			this._activeIndex = this._seedActiveIndex(matches, items);
		}
		this._updateAnchor();

		this._onDidChangeMatches.fire();
	}

	/** Moves to the next match in navigation order, which is the next one *back* in the transcript. */
	next(): IChatFindMatch | undefined {
		if (this._matches.length === 0) {
			return undefined;
		}
		this._activeIndex = this._activeIndex < 0 ? 0 : (this._activeIndex + 1) % this._matches.length;
		this._updateAnchor();
		this._onDidChangeMatches.fire();
		return this.activeMatch;
	}

	/** Moves to the previous match in navigation order, which is the next one *forward* in the transcript. */
	previous(): IChatFindMatch | undefined {
		if (this._matches.length === 0) {
			return undefined;
		}
		this._activeIndex = this._activeIndex <= 0 ? this._matches.length - 1 : this._activeIndex - 1;
		this._updateAnchor();
		this._onDidChangeMatches.fire();
		return this.activeMatch;
	}

	clear(): void {
		this._query = '';
		this._matches = [];
		this._activeIndex = -1;
		this._activeAnchor = undefined;
		this._invalidRegex = false;
	}

	private _updateAnchor(): void {
		const active = this.activeMatch;
		this._activeAnchor = active ? { itemId: active.itemId, partIndex: active.partIndex, occurrenceIndex: active.occurrenceIndex } : undefined;
	}

	/**
	 * Picks where to start when no previous active match survived: the newest match that is not
	 * below the viewport, so Find begins at what the user is looking at rather than at the end of
	 * the transcript. Falls back to the newest match overall when everything on screen is older
	 * than every match.
	 */
	private _seedActiveIndex(matches: readonly IChatFindMatch[], items: readonly ChatTreeItem[]): number {
		if (matches.length === 0) {
			return -1;
		}
		const anchorItemId = this.getViewportAnchorItemId();
		if (anchorItemId === undefined) {
			return 0;
		}
		const positions = new Map<string, number>();
		items.forEach((item, position) => positions.set(item.id, position));
		const anchorPosition = positions.get(anchorItemId);
		if (anchorPosition === undefined) {
			return 0;
		}
		// Newest first, so the first match at or above the anchor is the nearest one.
		const seeded = matches.findIndex(match => {
			const position = positions.get(match.itemId);
			return position !== undefined && position <= anchorPosition;
		});
		return seeded >= 0 ? seeded : 0;
	}
}
