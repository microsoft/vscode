/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { IContextViewProvider } from '../../../../../base/browser/ui/contextview/contextview.js';
import { AbstractFindController, AbstractTree, IFindFilter, IFindWidgetStyles } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FuzzyScore, IMatch } from '../../../../../base/common/filters.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { nextCharLength } from '../../../../../base/common/strings.js';
import { localize } from '../../../../../nls.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

/**
 * Text of a session that a search matches besides its title and the titles of its chats:
 * - `folder`: the label of its workspace or the name of one of its folders
 * - `repository`: the GitHub repository of its first folder, as `owner/name`
 * - `group`: the name of a custom group or comparison whose header the session's row is under
 * - `branch`: a Git branch the session works on
 * - `pullRequest`: a pull request's number and title
 * - `host`: the remote host the session runs on
 */
export type SessionSearchFieldKind = 'folder' | 'repository' | 'group' | 'branch' | 'pullRequest' | 'host';

/** The fields a search hint can name: group headers always show the names of the groups a row is in. */
export type SessionSearchHintKind = Exclude<SessionSearchFieldKind, 'group'>;

export interface ISessionSearchField {
	readonly kind: SessionSearchFieldKind;
	readonly text: string;
}

/** The text of a session that searching the Sessions list matches. */
export interface ISessionSearchDocument {
	/** The title the session's row shows. */
	readonly title: string;
	/** The titles of the chats the session's row lists. */
	readonly chatTitles: readonly string[];
	/** The rest of its text. A hint names the first field that contains a word. */
	readonly fields: readonly ISessionSearchField[];
}

/** A field the session matched a word in, which neither its title, chat titles, row, nor section headers show. */
export interface ISessionSearchHint {
	readonly kind: SessionSearchHintKind;
	readonly text: string;
	readonly matches: readonly IMatch[];
}

/** A word of the query that only a session's fields contain, and those fields. */
export interface ISessionSearchFieldWord {
	readonly word: string;
	readonly fields: readonly ISessionSearchField[];
}

export interface ISessionSearchMatch {
	/** The words of the query. */
	readonly words: readonly string[];
	/** The occurrences of the query's words in the title. */
	readonly titleMatches: readonly IMatch[];
	/** Whether a word is missing from the title, so that the session matched through its other text. */
	readonly matchesBeyondTitle: boolean;
	/** The words that neither the title nor a chat title contains. */
	readonly fieldWords: readonly ISessionSearchFieldWord[];
}

const COMBINING_DIACRITICAL_MARKS = /[\u0300-\u036f]/g;
/** Greek final sigma, which case folding maps to sigma; lowercasing a lone capital sigma (U+03A3) can only produce the latter. */
const GREEK_FINAL_SIGMA = /\u03c2/g;
const ASCII_TEXT = /^[\x00-\x7f]*$/;

interface IFoldedSearchText {
	readonly folded: string;
	/** For each folded character, where the character of the text it comes from starts. */
	readonly starts: readonly number[];
	/** For each folded character, where the character of the text it comes from ends. */
	readonly ends: readonly number[];
}

/**
 * Folds a text for searching one user-perceived character at a time: drops the accents of Latin, Greek, and Cyrillic
 * letters in composed and decomposed form alike, keeps the characters of other scripts whole, and folds case.
 */
function foldSearchTextWithOffsets(text: string): IFoldedSearchText {
	let folded = '';
	const starts: number[] = [];
	const ends: number[] = [];
	for (let start = 0; start < text.length;) {
		const end = start + Math.max(1, nextCharLength(text, start));
		const character = text.substring(start, end).normalize('NFD').replace(COMBINING_DIACRITICAL_MARKS, '').normalize('NFC').toLowerCase().replace(GREEK_FINAL_SIGMA, '\u03c3');
		for (let index = 0; index < character.length; index++) {
			starts.push(start);
			ends.push(end);
		}
		folded += character;
		start = end;
	}
	return { folded, starts, ends };
}

const foldedSearchTexts = new LRUCache<string, string>(10000);

/** Folds a text for searching, see {@link foldSearchTextWithOffsets}. */
function foldSearchText(text: string): string {
	if (ASCII_TEXT.test(text)) {
		return text.toLowerCase();
	}
	let folded = foldedSearchTexts.get(text);
	if (folded === undefined) {
		folded = foldSearchTextWithOffsets(text).folded;
		foldedSearchTexts.set(text, folded);
	}
	return folded;
}

/**
 * The words that searching the Sessions list for a pattern looks for. A result contains every word, in any order,
 * ignoring case and accents.
 */
export class SessionsListSearchQuery {

	static readonly empty = new SessionsListSearchQuery('');

	readonly words: readonly string[];

	constructor(pattern: string) {
		// A word of only accents folds to nothing.
		this.words = [...new Set(pattern.split(/\s+/).map(word => foldSearchText(word)).filter(word => word.length > 0))];
	}

	get isEmpty(): boolean {
		return this.words.length === 0;
	}
}

/** The occurrences in `text` of `words`, which are folded for searching, sorted and merged. */
export function findSearchWords(words: readonly string[], text: string): IMatch[] {
	const offsets = ASCII_TEXT.test(text) ? undefined : foldSearchTextWithOffsets(text);
	const folded = offsets?.folded ?? text.toLowerCase();
	const matches: IMatch[] = [];
	for (const word of words) {
		if (!word) {
			continue;
		}
		for (let start = folded.indexOf(word); start !== -1; start = folded.indexOf(word, start + word.length)) {
			const last = start + word.length - 1;
			matches.push(offsets ? { start: offsets.starts[start], end: offsets.ends[last] } : { start, end: last + 1 });
		}
	}
	matches.sort((a, b) => a.start - b.start);
	const merged: IMatch[] = [];
	for (const match of matches) {
		const last = merged.at(-1);
		if (last && match.start <= last.end) {
			merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, match.end) };
		} else {
			merged.push(match);
		}
	}
	return merged;
}

function isHintField(kind: SessionSearchFieldKind): kind is SessionSearchHintKind {
	return kind !== 'group';
}

/** Matches a session against a query with words, or returns `undefined` when its text lacks one of them. */
export function matchSessionSearch(query: SessionsListSearchQuery, document: ISessionSearchDocument): ISessionSearchMatch | undefined {
	const title = foldSearchText(document.title);
	let chatTitles: readonly string[] | undefined;
	let fields: readonly string[] | undefined;
	const fieldWords: ISessionSearchFieldWord[] = [];
	let matchesBeyondTitle = false;
	for (const word of query.words) {
		if (title.includes(word)) {
			continue;
		}
		matchesBeyondTitle = true;
		chatTitles ??= document.chatTitles.map(chatTitle => foldSearchText(chatTitle));
		if (chatTitles.some(chatTitle => chatTitle.includes(word))) {
			continue;
		}
		fields ??= document.fields.map(field => foldSearchText(field.text));
		const matchingFields = document.fields.filter((_field, index) => fields![index].includes(word));
		if (matchingFields.length === 0) {
			return undefined;
		}
		fieldWords.push({ word, fields: matchingFields });
	}
	return {
		words: query.words,
		titleMatches: findSearchWords(query.words, document.title),
		matchesBeyondTitle,
		fieldWords,
	};
}

/**
 * Explains why a session matched when a word of the query is in neither its title, its chat titles, nor `shownTexts`,
 * the other texts that its row and the section headers above it show: names the first field that contains such a word.
 */
export function getSessionSearchHint(match: ISessionSearchMatch, shownTexts: readonly string[]): ISessionSearchHint | undefined {
	let shown: readonly string[] | undefined;
	for (const { word, fields } of match.fieldWords) {
		shown ??= shownTexts.map(text => foldSearchText(text));
		if (shown.some(text => text.includes(word))) {
			continue;
		}
		for (const field of fields) {
			if (isHintField(field.kind)) {
				return { kind: field.kind, text: field.text, matches: findSearchWords(match.words, field.text) };
			}
		}
	}
	return undefined;
}

/**
 * The tree filter data of a search result: its highlighted characters as the positions of a {@link FuzzyScore},
 * which rows render with `createMatches`.
 */
export function toSearchFilterData(matches: readonly IMatch[]): FuzzyScore {
	const score: FuzzyScore = [0, 0];
	// `createMatches` reads positions from the end.
	for (let index = matches.length - 1; index >= 0; index--) {
		for (let position = matches[index].end - 1; position >= matches[index].start; position--) {
			score.push(position);
		}
	}
	return score;
}

/** What a search of the Sessions list shows. */
export interface ISessionsListSearchResults {
	/** How many sessions and chats it shows. */
	readonly count: number;
	/** How many of them matched a word outside their title. */
	readonly beyondTitleCount: number;
}

export interface ISessionsListFindControllerDelegate {
	/** Whether the pattern has words to search for. */
	isSearching(): boolean;
	/** Called after the tree filtered its rows by a changed pattern. */
	didFilter(): void;
	/** What the search shows. */
	getResults(): ISessionsListSearchResults;
}

export interface ISessionsListFindControllerOptions {
	readonly findWidgetContainer?: HTMLElement;
	readonly styles?: IFindWidgetStyles;
}

/**
 * The find widget of the Sessions list. It uses the tree's find widget, but the list's filter searches instead of the
 * tree's fuzzy matching of row labels.
 */
export class SessionsListFindController<T> extends AbstractFindController<T, FuzzyScore> {

	private readonly _onDidSearch = new Emitter<ISessionsListSearchResults | undefined>();
	/** Fires what the search shows after its pattern changes; `undefined` when the pattern has no words. */
	readonly onDidSearch: Event<ISessionsListSearchResults | undefined> = this._onDidSearch.event;

	private readonly _onDidChangeResults = new Emitter<ISessionsListSearchResults>();
	/** Fires what the search shows after the rows changed while its pattern stayed the same. */
	readonly onDidChangeResults: Event<ISessionsListSearchResults> = this._onDidChangeResults.event;

	constructor(
		tree: AbstractTree<T, FuzzyScore, unknown>,
		filter: IFindFilter<T>,
		contextViewProvider: IContextViewProvider,
		private readonly delegate: ISessionsListFindControllerDelegate,
		options: ISessionsListFindControllerOptions,
	) {
		super(tree, filter, contextViewProvider, { ...options, placeholder: localize('sessionsList.searchPlaceholder', "Search sessions") });
		this.disposables.add(this._onDidSearch);
		this.disposables.add(this._onDidChangeResults);
		// Sessions change while the widget is open: keep its "no sessions found" message current.
		this.disposables.add(tree.onDidChangeModel(() => {
			if (this.isOpened()) {
				const results = this.renderResults(false);
				if (results) {
					this._onDidChangeResults.fire(results);
				}
			}
		}));
	}

	protected applyPattern(): void {
		this.tree.refilter();
		this.delegate.didFilter();
		const searching = this.delegate.isSearching();
		if (searching) {
			this.tree.focusNext(0, true, undefined, node => node.filterData !== undefined);
			const [focus] = this.tree.getFocus();
			if (focus !== undefined && this.tree.getRelativeTop(focus) === null) {
				this.tree.reveal(focus, 0.5);
			}
		}
		this._onDidSearch.fire(this.renderResults(searching));
	}

	private renderResults(announce: boolean): ISessionsListSearchResults | undefined {
		if (!this.delegate.isSearching()) {
			this.renderMessage(false);
			return undefined;
		}
		const results = this.delegate.getResults();
		// The input announces its "no sessions found" message itself.
		this.renderMessage(results.count === 0, localize('sessionsList.noResults', "No sessions found"));
		if (announce && results.count > 0) {
			status(results.count === 1
				? localize('sessionsList.oneResult', "1 session found")
				: localize('sessionsList.results', "{0} sessions found", results.count));
		}
		return results;
	}
}

type SessionsListSearchEvent = {
	wordCount: number;
	resultCount: number;
	beyondTitleResultCount: number;
	queryChangeCount: number;
	openCount: number;
	durationMs: number;
};

type SessionsListSearchClassification = {
	owner: 'alexdima';
	comment: 'Tracks searches of the Agents window Sessions list, from the first word typed until the query is cleared, the search is closed, or the list is disposed, to measure whether they find sessions. The query text is not collected.';
	wordCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of distinct words in the last query of the search.' };
	resultCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of sessions and chats the last query showed when the search ended, including sessions that arrived or changed after it was typed.' };
	beyondTitleResultCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of those results that matched a word outside their title, such as in a chat title, folder, branch, or pull request.' };
	queryChangeCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of times the query changed during the search.' };
	openCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of sessions or chats opened from the list during the search.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Time in milliseconds from the first word of the search until it ended.' };
};

/** Logs one event per search of the Sessions list, from its first word until its query is cleared, it is closed, or the list is disposed. */
export class SessionsListSearchTelemetry implements IDisposable {

	private search: { readonly startTime: number; queryChangeCount: number; openCount: number; wordCount: number; resultCount: number; beyondTitleResultCount: number } | undefined;

	constructor(
		private readonly telemetryService: ITelemetryService,
		private readonly now: () => number = Date.now,
	) { }

	/** Records the results of a query. A query without words ends the search. */
	queryChanged(wordCount: number, resultCount: number, beyondTitleResultCount: number): void {
		if (wordCount === 0) {
			this.end();
			return;
		}
		this.search ??= { startTime: this.now(), queryChangeCount: 0, openCount: 0, wordCount: 0, resultCount: 0, beyondTitleResultCount: 0 };
		this.search.queryChangeCount++;
		this.search.wordCount = wordCount;
		this.search.resultCount = resultCount;
		this.search.beyondTitleResultCount = beyondTitleResultCount;
	}

	/** Records the results of the current query after sessions changed, which does not change the query. */
	resultsChanged(resultCount: number, beyondTitleResultCount: number): void {
		if (this.search) {
			this.search.resultCount = resultCount;
			this.search.beyondTitleResultCount = beyondTitleResultCount;
		}
	}

	resultOpened(): void {
		if (this.search) {
			this.search.openCount++;
		}
	}

	/** Ends a search that is still open, such as when the window reloads. */
	dispose(): void {
		this.end();
	}

	private end(): void {
		const search = this.search;
		if (!search) {
			return;
		}
		this.search = undefined;
		this.telemetryService.publicLog2<SessionsListSearchEvent, SessionsListSearchClassification>('agents/sessionsListSearch', {
			wordCount: search.wordCount,
			resultCount: search.resultCount,
			beyondTitleResultCount: search.beyondTitleResultCount,
			queryChangeCount: search.queryChangeCount,
			openCount: search.openCount,
			durationMs: Math.max(0, this.now() - search.startTime),
		});
	}
}
