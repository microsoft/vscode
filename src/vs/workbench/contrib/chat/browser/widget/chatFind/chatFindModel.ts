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

export interface IHistoryFindLocation {
	readonly turnId: string;
	readonly kind: ChatFindItemKind;
	readonly occurrence: number;
}

export interface IChatFindNavigationLocation extends IHistoryFindLocation {
	/** Set only for renderer-owned text; never sent to the host. */
	readonly localPartIndex?: number;
}

export function historyLocationKey(location: IChatFindNavigationLocation): string {
	return JSON.stringify([location.turnId, location.kind, location.occurrence, location.localPartIndex]);
}

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
	readonly historyLocation?: IHistoryFindLocation;
}

interface IChatFindSegment {
	readonly historyTurnId?: string;
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

function buildSegments(item: ChatTreeItem): IChatFindSegment[] {
	if (isRequestVM(item)) {
		const text = getChatRequestText(item);
		const isHistoryRequest = !item.isSystemInitiated && !item.isHiddenFromTranscript && !item.isRequestHiddenFromTranscript
			&& !item.pendingKind && !item.isPendingRequestHandoff && text === item.messageText;
		return text?.trim() ? [{ itemId: item.id, itemKind: 'request', historyTurnId: isHistoryRequest ? item.id : undefined, partIndex: -1, text }] : [];
	}
	if (!isResponseVM(item)) {
		return [];
	}

	const isFiltered = !!item.errorDetails?.responseIsFiltered;
	const content = isFiltered ? [] : annotateSpecialMarkdownContentWithSource(item.response.value);
	const rendered = content.map(entry => entry.content);
	const renderedContent = item.isComplete ? moveResponseOutcomeToolsAfterFinalResponse(rendered) : rendered;
	// References precede the response body; code citations precede trailing row-level text.
	const trailingPartIndex = isFiltered ? 0 : renderedContent.length + 1 + (item.codeCitations?.length ? 1 : 0);
	const segments = new Map<number, IChatFindSegment>();
	for (const part of getChatFindTextParts(item)) {
		if (!part.text.length) {
			continue;
		}
		const annotatedPart = content.find(entry => entry.sourceIndexes.includes(part.partIndex))?.content;
		const renderedPartIndex = annotatedPart ? renderedContent.indexOf(annotatedPart) : -1;
		const partIndex = renderedPartIndex >= 0 ? renderedPartIndex + 1 : -1;
		segments.set(partIndex, {
			itemId: item.id,
			itemKind: 'response',
			historyTurnId: part.isHistoryMarkdown && partIndex >= 0 && !item.isHiddenFromTranscript ? item.requestId : undefined,
			partIndex,
			scopeStartPartIndex: partIndex === -1 ? trailingPartIndex : undefined,
			text: (segments.get(partIndex)?.text ?? '') + part.text,
		});
	}
	return [...segments.values()].sort((a, b) => (a.partIndex === -1 ? trailingPartIndex : a.partIndex) - (b.partIndex === -1 ? trailingPartIndex : b.partIndex));
}

/** Keep the existing scan bound for text without a protocol identity. */
const MAX_SEGMENT_SCAN = 100_000;

/** Number a turn side's matches in forward order, retaining only its newest `limit` results. */
function findMatchesInItem(segments: readonly IChatFindSegment[], regex: RegExp, limit: number): IChatFindMatch[] {
	const matches: IChatFindMatch[] = [];
	let historyOccurrence = 0;
	for (const segment of segments) {
		let occurrenceIndex = 0;
		for (const match of segment.text.matchAll(regex)) {
			if (match[0].length === 0) {
				continue;
			}
			matches.push({
				itemId: segment.itemId,
				itemKind: segment.itemKind,
				partIndex: segment.partIndex,
				scopeStartPartIndex: segment.scopeStartPartIndex,
				occurrenceIndex: occurrenceIndex++,
				start: match.index,
				end: match.index + match[0].length,
				text: match[0],
				historyLocation: segment.historyTurnId === undefined ? undefined : { turnId: segment.historyTurnId, kind: segment.itemKind, occurrence: historyOccurrence++ },
			});
			if (matches.length >= limit * 2) {
				matches.splice(0, matches.length - limit);
			}
			if (segment.historyTurnId === undefined && occurrenceIndex >= MAX_SEGMENT_SCAN) {
				break;
			}
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
	private readonly _matchByLocation = new Map<string, number>();
	private readonly _navigationLocations = new Map<IChatFindMatch, IChatFindNavigationLocation>();
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

	locationOf(match: IChatFindMatch | undefined): IHistoryFindLocation | undefined {
		return match?.historyLocation;
	}

	navigationLocationOf(match: IChatFindMatch | undefined): IChatFindNavigationLocation | undefined {
		return match && this._navigationLocations.get(match);
	}

	selectLocation(location: IChatFindNavigationLocation): boolean {
		return this._selectIndex(this._matchByLocation.get(historyLocationKey(location)) ?? -1);
	}

	selectMatch(match: IChatFindMatch): boolean {
		return this._selectIndex(this._matches.indexOf(match));
	}

	private _selectIndex(index: number): boolean {
		if (index < 0) {
			return false;
		}
		this._activeIndex = index;
		this._updateAnchor();
		this._onDidChangeMatches.fire();
		return true;
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
		this._matchByLocation.clear();
		this._navigationLocations.clear();

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
		const matches: IChatFindMatch[] = [];
		for (let i = items.length - 1; i >= 0 && matches.length < MAX_FIND_MATCHES; i--) {
			const itemMatches = findMatchesInItem(buildSegments(items[i]), regex, MAX_FIND_MATCHES - matches.length);
			for (const match of itemMatches.reverse()) {
				const item = items[i];
				const location = match.historyLocation ?? {
					turnId: isResponseVM(item) ? item.requestId : item.id,
					kind: match.itemKind, occurrence: match.occurrenceIndex, localPartIndex: match.partIndex,
				};
				this._navigationLocations.set(match, location);
				this._matchByLocation.set(historyLocationKey(location), matches.length);
				matches.push(match);
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
		this._matchByLocation.clear();
		this._navigationLocations.clear();
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
