/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentInfo, DocumentInfoWithOffset, SimilarFileInfo } from '../prompt';
import { CursorContextInfo } from './cursorContext';
import { SnippetProviderType, SnippetSemantics, SnippetWithProviderInfo } from './snippets';

class FifoCache<T> {
	private keys: string[] = [];
	private cache: { [key: string]: T } = {};
	private size: number;
	constructor(size: number) {
		this.size = size;
	}
	put(key: string, value: T) {
		this.cache[key] = value;
		if (this.keys.length > this.size) {
			this.keys.push(key);
			const leavingKey = this.keys.shift() ?? '';
			delete this.cache[leavingKey];
		}
	}
	get(key: string): T | undefined {
		return this.cache[key];
	}
}

export interface ScoredSnippetMarker {
	score: number;
	startLine: number;
	endLine: number;
}

/**
 * A snippet of code together with a relevance score.
 *
 * The scoring system assumes that a snippet with a **bigger** score is **more** relevant.
 */
export interface ScoredSnippet extends ScoredSnippetMarker {
	snippet: string;
	relativePath?: string;
}

export enum SortOptions {
	Ascending = 'ascending',
	Descending = 'descending',
	None = 'none',
}

class Tokenizer {
	private readonly stopsForLanguage: Set<string>;
	constructor(doc: DocumentInfo) {
		this.stopsForLanguage = SPECIFIC_STOPS.get(doc.languageId) ?? GENERIC_STOPS;
	}
	tokenize(a: string): Set<string> {
		return new Set<string>(splitIntoWords(a).filter(x => !this.stopsForLanguage.has(x)));
	}
}

/**
 * For a number of documents (the similar files),
 * associate to each document and its kind of window computation (as key)
 * the sequence b_1, ..., b_n, where
 * b_i is the set of tokens in the ith window --
 * e.g. for window length 10,
 * WINDOWED_TOKEN_SET_CACHE(doc)[0]
 * holds the tokens in the first 10 lines of the document.
 */
const WINDOWED_TOKEN_SET_CACHE = new FifoCache<Set<string>[]>(20);

/**
 * For a given document, extracts the best matching snippets from other documents
 * by comparing all of a set of windows in the object doc.
 */
export abstract class WindowedMatcher {
	protected referenceDoc: DocumentInfoWithOffset;
	protected tokenizer: Tokenizer;

	protected abstract id(): string;
	protected abstract similarityScore(a: Set<string>, b: Set<string>): number;
	/**
	 * Given an array of lines, returns an array of pairs <startLine, endLine> of indices,
	 * such that each pair is a window of lines to consider adding.
	 * startLine is inclusive, endLine is exclusive.
	 * @param lines Lines of a source text, in order
	 */
	protected abstract getWindowsDelineations(lines: string[]): [number, number][];

	/**
	 * Subclasses should implement this method to return the desired context info for tokenization
	 * from the reference document. Will only be called after constructor is finished.
	 * The tokenizer used in WindowedMatcher is a simple tokenizer for Jaccard similarity, NOT an
	 * OpenAI model tokenizer.
	 */
	protected abstract _getCursorContextInfo(referenceDoc: DocumentInfoWithOffset): CursorContextInfo;

	protected constructor(referenceDoc: DocumentInfoWithOffset) {
		this.referenceDoc = referenceDoc;
		this.tokenizer = new Tokenizer(referenceDoc); // Just uses language info from referenceDoc
	}

	/**
	 * Lazy getter for referenceTokens since it relies on properties
	 * that are not initialized in the constructor of WindowedMatcher
	 * but in the constructor of its subclasses.
	 */
	protected referenceTokensCache: Set<string> | undefined;
	get referenceTokens(): Promise<Set<string>> {
		return Promise.resolve(this.createReferenceTokens());
	}

	private createReferenceTokens(): Set<string> {
		return (this.referenceTokensCache ??= this.tokenizer.tokenize(
			this._getCursorContextInfo(this.referenceDoc).context
		));
	}

	/**
	 * Returns a sorted array of snippets with their scores according to the sort option.
	 * @param snippets ScoredSnippet[]
	 *
	 */
	sortScoredSnippets(snippets: ScoredSnippetMarker[], sortOption = SortOptions.Descending): ScoredSnippetMarker[] {
		return sortOption === SortOptions.Ascending
			? snippets.sort((snippetA, snippetB) => (snippetA.score > snippetB.score ? 1 : -1))
			: sortOption === SortOptions.Descending
				? snippets.sort((snippetA, snippetB) => (snippetA.score > snippetB.score ? -1 : 1))
				: snippets;
	}
	/**
	 * Returns all snippet markers with their scores.
	 * @param objectDoc
	 *
	 */
	async retrieveAllSnippets(
		objectDoc: SimilarFileInfo,
		sortOption = SortOptions.Descending
	): Promise<ScoredSnippetMarker[]> {
		const snippets: ScoredSnippetMarker[] = [];

		if (objectDoc.source.length === 0 || (await this.referenceTokens).size === 0) {
			return snippets;
		}

		const lines = objectDoc.source.split('\n');
		const key = this.id() + ':' + objectDoc.source;
		const tokensInWindows = WINDOWED_TOKEN_SET_CACHE.get(key) ?? [];
		// if the tokens are not cached, we need to compute them
		const needToComputeTokens = tokensInWindows.length === 0;
		const tokenizedLines = needToComputeTokens ? lines.map(l => this.tokenizer.tokenize(l), this.tokenizer) : [];

		// Compute the windows with the score
		for (const [index, [startLine, endLine]] of this.getWindowsDelineations(lines).entries()) {
			if (needToComputeTokens) {
				const tokensInWindow = new Set<string>();
				tokenizedLines
					.slice(startLine, endLine)
					.forEach(x => x.forEach(s => tokensInWindow.add(s), tokensInWindow));
				tokensInWindows.push(tokensInWindow);
			}
			// Now tokensInWindows[index] contains the tokens in the window, whether we just computed them or not
			const tokensInWindow = tokensInWindows[index];
			const score = this.similarityScore(tokensInWindow, await this.referenceTokens);

			// If snippets overlap, keep the one with highest score.
			// Note: Assuming the getWindowsDelineations function returns windows in sorted ascending line ranges.
			if (snippets.length && startLine > 0 && snippets[snippets.length - 1].endLine > startLine) {
				if (snippets[snippets.length - 1].score < score) {
					snippets[snippets.length - 1].score = score;
					snippets[snippets.length - 1].startLine = startLine;
					snippets[snippets.length - 1].endLine = endLine;
				}
				continue;
			}

			snippets.push({
				score,
				startLine,
				endLine,
			});
		}

		// If we didn't get the token sets from the cache, time to put them there!
		if (needToComputeTokens) {
			WINDOWED_TOKEN_SET_CACHE.put(key, tokensInWindows);
		}

		return this.sortScoredSnippets(snippets, sortOption);
	}

	findMatches(objectDoc: SimilarFileInfo, maxSnippetsPerFile: number): Promise<SnippetWithProviderInfo[]> {
		const snippet = this.findBestMatch(objectDoc, maxSnippetsPerFile);
		return snippet;
	}

	/**
	 * Returns the snippet from the object document
	 * that is most similar to the reference Document
	 * together with its Jaccard score
	 *
	 * @param objectDoc
	 */
	async findBestMatch(objectDoc: SimilarFileInfo, maxSnippetsPerFile: number): Promise<SnippetWithProviderInfo[]> {
		if (objectDoc.source.length === 0 || (await this.referenceTokens).size === 0) {
			return [];
		}
		const lines = objectDoc.source.split('\n');
		const snippets = await this.retrieveAllSnippets(objectDoc, SortOptions.Descending);

		// safe guard against empty lists
		if (snippets.length === 0) {
			return [];
		}

		const bestSnippets: SnippetWithProviderInfo[] = [];

		for (let i = 0; i < snippets.length && i < maxSnippetsPerFile; i++) {
			// Skip null scored snippets.
			if (snippets[i].score !== 0) {
				// Get the snippet's text.
				const snippetCode = lines.slice(snippets[i].startLine, snippets[i].endLine).join('\n');
				bestSnippets.push({
					snippet: snippetCode,
					semantics: SnippetSemantics.Snippet,
					provider: SnippetProviderType.SimilarFiles,
					...snippets[i],
				});
			}
		}

		return bestSnippets;
	}
}

/**
 * Split by non-alphanumeric characters
 */
export function splitIntoWords(a: string): string[] {
	return a.split(/[^a-zA-Z0-9]/).filter(x => x.length > 0);
}

const ENGLISH_STOPS = new Set([
	// - pronouns
	'we',
	'our',
	'you',
	'it',
	'its',
	'they',
	'them',
	'their',
	'this',
	'that',
	'these',
	'those',
	// - verbs
	'is',
	'are',
	'was',
	'were',
	'be',
	'been',
	'being',
	'have',
	'has',
	'had',
	'having',
	'do',
	'does',
	'did',
	'doing',
	'can',
	'don',
	't',
	's',
	'will',
	'would',
	'should',
	// - wh-words
	'what',
	'which',
	'who',
	'when',
	'where',
	'why',
	'how',
	// - articles
	'a',
	'an',
	'the',
	// - prepositions
	'and',
	'or',
	'not',
	'no',
	'but',
	'because',
	'as',
	'until',
	'again',
	'further',
	'then',
	'once',
	'here',
	'there',
	'all',
	'any',
	'both',
	'each',
	'few',
	'more',
	'most',
	'other',
	'some',
	'such',
	'above',
	'below',
	'to',
	'during',
	'before',
	'after',
	'of',
	'at',
	'by',
	'about',
	'between',
	'into',
	'through',
	'from',
	'up',
	'down',
	'in',
	'out',
	'on',
	'off',
	'over',
	'under',
	'only',
	'own',
	'same',
	'so',
	'than',
	'too',
	'very',
	'just',
	'now',
]);

/**
 * A generic set of stops for any programming language
 */
const GENERIC_STOPS = new Set([
	// words that are common in programming languages
	'if',
	'then',
	'else',
	'for',
	'while',
	'with',
	'def',
	'function',
	'return',
	'TODO',
	'import',
	'try',
	'catch',
	'raise',
	'finally',
	'repeat',
	'switch',
	'case',
	'match',
	'assert',
	'continue',
	'break',
	'const',
	'class',
	'enum',
	'struct',
	'static',
	'new',
	'super',
	'this',
	'var',
	// words that are common in English comments:
	...ENGLISH_STOPS,
]);

/**
 * Specific stops for certain languages
 * Note that ENGLISH_STOPS need to be added to this set if they are to be included
 */
const SPECIFIC_STOPS: Map<string, Set<string>> = new Map([
	// none yet
]);
