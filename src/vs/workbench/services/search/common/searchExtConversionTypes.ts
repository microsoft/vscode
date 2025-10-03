/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray, coalesce } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { IProgress } from '../../../../platform/progress/common/progress.js';
import { DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS } from './search.js';
import { Range, FileSearchProvider2, FileSearchProviderOptions, ProviderResult, TextSearchComplete2, TextSearchContext2, TextSearchMatch2, TextSearchProvider2, TextSearchProviderOptions, TextSearchQuery2, TextSearchResult2, TextSearchCompleteMessage } from './searchExtTypes.js';

// old types that are retained for backward compatibility
// TODO: delete this when search apis are adopted by all first-party extensions

/**
 * A relative pattern is a helper to construct glob patterns that are matched
 * relatively to a base path. The base path can either be an absolute file path
 * or a [workspace folder](#WorkspaceFolder).
 */
export interface RelativePattern {

	/**
	 * A base file path to which this pattern will be matched against relatively.
	 */
	base: string;

	/**
	 * A file glob pattern like `*.{ts,js}` that will be matched on file paths
	 * relative to the base path.
	 *
	 * Example: Given a base of `/home/work/folder` and a file path of `/home/work/folder/index.js`,
	 * the file glob pattern will match on `index.js`.
	 */
	pattern: string;
}

/**
 * A file glob pattern to match file paths against. This can either be a glob pattern string
 * (like `** /*.{ts,js}` without space before / or `*.{ts,js}`) or a [relative pattern](#RelativePattern).
 *
 * Glob patterns can have the following syntax:
 * * `*` to match zero or more characters in a path segment
 * * `?` to match on one character in a path segment
 * * `**` to match any number of path segments, including none
 * * `{}` to group conditions (e.g. `** /*.{ts,js}` without space before / matches all TypeScript and JavaScript files)
 * * `[]` to declare a range of characters to match in a path segment (e.g., `example.[0-9]` to match on `example.0`, `example.1`, …)
 * * `[!...]` to negate a range of characters to match in a path segment (e.g., `example.[!0-9]` to match on `example.a`, `example.b`, but not `example.0`)
 *
 * Note: a backslash (`\`) is not valid within a glob pattern. If you have an existing file
 * path to match against, consider to use the [relative pattern](#RelativePattern) support
 * that takes care of converting any backslash into slash. Otherwise, make sure to convert
 * any backslash to slash when creating the glob pattern.
 */
export type GlobPattern = string | RelativePattern;

/**
 * The parameters of a query for text search.
 */
export interface TextSearchQuery {
	/**
	 * The text pattern to search for.
	 */
	pattern: string;

	/**
	 * Whether or not `pattern` should match multiple lines of text.
	 */
	isMultiline?: boolean;

	/**
	 * Whether or not `pattern` should be interpreted as a regular expression.
	 */
	isRegExp?: boolean;

	/**
	 * Whether or not the search should be case-sensitive.
	 */
	isCaseSensitive?: boolean;

	/**
	 * Whether or not to search for whole word matches only.
	 */
	isWordMatch?: boolean;
}

/**
 * A file glob pattern to match file paths against.
 * TODO@roblou - merge this with the GlobPattern docs/definition in vscode.d.ts.
 * @see [GlobPattern](#GlobPattern)
 */
export type GlobString = string;

/**
 * Options common to file and text search
 */
export interface SearchOptions {
	/**
	 * The root folder to search within.
	 */
	folder: URI;

	/**
	 * Files that match an `includes` glob pattern should be included in the search.
	 */
	includes: GlobString[];

	/**
	 * Files that match an `excludes` glob pattern should be excluded from the search.
	 */
	excludes: GlobString[];

	/**
	 * Whether external files that exclude files, like .gitignore, should be respected.
	 * See the vscode setting `"search.useIgnoreFiles"`.
	 */
	useIgnoreFiles: boolean;

	/**
	 * Whether symlinks should be followed while searching.
	 * See the vscode setting `"search.followSymlinks"`.
	 */
	followSymlinks: boolean;

	/**
	 * Whether global files that exclude files, like .gitignore, should be respected.
	 * See the vscode setting `"search.useGlobalIgnoreFiles"`.
	 */
	useGlobalIgnoreFiles: boolean;

	/**
	 * Whether files in parent directories that exclude files, like .gitignore, should be respected.
	 * See the vscode setting `"search.useParentIgnoreFiles"`.
	 */
	useParentIgnoreFiles: boolean;
}

/**
 * Options to specify the size of the result text preview.
 * These options don't affect the size of the match itself, just the amount of preview text.
 */
export interface TextSearchPreviewOptions {
	/**
	 * The maximum number of lines in the preview.
	 * Only search providers that support multiline search will ever return more than one line in the match.
	 */
	matchLines: number;

	/**
	 * The maximum number of characters included per line.
	 */
	charsPerLine: number;
}

/**
 * Options that apply to text search.
 */
export interface TextSearchOptions extends SearchOptions {
	/**
	 * The maximum number of results to be returned.
	 */
	maxResults: number;

	/**
	 * Options to specify the size of the result text preview.
	 */
	previewOptions?: TextSearchPreviewOptions;

	/**
	 * Exclude files larger than `maxFileSize` in bytes.
	 */
	maxFileSize?: number;

	/**
	 * Interpret files using this encoding.
	 * See the vscode setting `"files.encoding"`
	 */
	encoding?: string;

	/**
	 * Number of lines of context to include before each match.
	 */
	beforeContext?: number;

	/**
	 * Number of lines of context to include after each match.
	 */
	afterContext?: number;
}
/**
 * Options that apply to AI text search.
 */
export interface AITextSearchOptions extends SearchOptions {
	/**
	 * The maximum number of results to be returned.
	 */
	maxResults: number;

	/**
	 * Options to specify the size of the result text preview.
	 */
	previewOptions?: TextSearchPreviewOptions;

	/**
	 * Exclude files larger than `maxFileSize` in bytes.
	 */
	maxFileSize?: number;

	/**
	 * Number of lines of context to include before each match.
	 */
	beforeContext?: number;

	/**
	 * Number of lines of context to include after each match.
	 */
	afterContext?: number;
}

/**
 * Information collected when text search is complete.
 */
export interface TextSearchComplete {
	/**
	 * Whether the search hit the limit on the maximum number of search results.
	 * `maxResults` on [`TextSearchOptions`](#TextSearchOptions) specifies the max number of results.
	 * - If exactly that number of matches exist, this should be false.
	 * - If `maxResults` matches are returned and more exist, this should be true.
	 * - If search hits an internal limit which is less than `maxResults`, this should be true.
	 */
	limitHit?: boolean;

	/**
	 * Additional information regarding the state of the completed search.
	 *
	 * Supports links in markdown syntax:
	 * - Click to [run a command](command:workbench.action.OpenQuickPick)
	 * - Click to [open a website](https://aka.ms)
	 */
	message?: TextSearchCompleteMessage | TextSearchCompleteMessage[];
}

/**
 * The parameters of a query for file search.
 */
export interface FileSearchQuery {
	/**
	 * The search pattern to match against file paths.
	 */
	pattern: string;
}

/**
 * Options that apply to file search.
 */
export interface FileSearchOptions extends SearchOptions {
	/**
	 * The maximum number of results to be returned.
	 */
	maxResults?: number;

	/**
	 * A CancellationToken that represents the session for this search query. If the provider chooses to, this object can be used as the key for a cache,
	 * and searches with the same session object can search the same cache. When the token is cancelled, the session is complete and the cache can be cleared.
	 */
	session?: CancellationToken;
}

/**
 * A preview of the text result.
 */
export interface TextSearchMatchPreview {
	/**
	 * The matching lines of text, or a portion of the matching line that contains the match.
	 */
	text: string;

	/**
	 * The Range within `text` corresponding to the text of the match.
	 * The number of matches must match the TextSearchMatch's range property.
	 */
	matches: Range | Range[];
}

/**
 * A match from a text search
 */
export interface TextSearchMatch {
	/**
	 * The uri for the matching document.
	 */
	uri: URI;

	/**
	 * The range of the match within the document, or multiple ranges for multiple matches.
	 */
	ranges: Range | Range[];

	/**
	 * A preview of the text match.
	 */
	preview: TextSearchMatchPreview;
}

/**
 * Checks if the given object is of type TextSearchMatch.
 * @param object The object to check.
 * @returns True if the object is a TextSearchMatch, false otherwise.
 */
function isTextSearchMatch(object: any): object is TextSearchMatch {
	return 'uri' in object && 'ranges' in object && 'preview' in object;
}

/**
 * A line of context surrounding a TextSearchMatch.
 */
export interface TextSearchContext {
	/**
	 * The uri for the matching document.
	 */
	uri: URI;

	/**
	 * One line of text.
	 * previewOptions.charsPerLine applies to this
	 */
	text: string;

	/**
	 * The line number of this line of context.
	 */
	lineNumber: number;
}

export type TextSearchResult = TextSearchMatch | TextSearchContext;

/**
 * A FileSearchProvider provides search results for files in the given folder that match a query string. It can be invoked by quickaccess or other extensions.
 *
 * A FileSearchProvider is the more powerful of two ways to implement file search in VS Code. Use a FileSearchProvider if you wish to search within a folder for
 * all files that match the user's query.
 *
 * The FileSearchProvider will be invoked on every keypress in quickaccess. When `workspace.findFiles` is called, it will be invoked with an empty query string,
 * and in that case, every file in the folder should be returned.
 */
export interface FileSearchProvider {
	/**
	 * Provide the set of files that match a certain file path pattern.
	 * @param query The parameters for this query.
	 * @param options A set of options to consider while searching files.
	 * @param progress A progress callback that must be invoked for all results.
	 * @param token A cancellation token.
	 */
	provideFileSearchResults(query: FileSearchQuery, options: FileSearchOptions, token: CancellationToken): ProviderResult<URI[]>;
}

/**
 * A TextSearchProvider provides search results for text results inside files in the workspace.
 */
export interface TextSearchProvider {
	/**
	 * Provide results that match the given text pattern.
	 * @param query The parameters for this query.
	 * @param options A set of options to consider while searching.
	 * @param progress A progress callback that must be invoked for all results.
	 * @param token A cancellation token.
	 */
	provideTextSearchResults(query: TextSearchQuery, options: TextSearchOptions, progress: IProgress<TextSearchResult>, token: CancellationToken): ProviderResult<TextSearchComplete>;
}
/**
 * Options that can be set on a findTextInFiles search.
 */
export interface FindTextInFilesOptions {
	/**
	 * A [glob pattern](#GlobPattern) that defines the files to search for. The glob pattern
	 * will be matched against the file paths of files relative to their workspace. Use a [relative pattern](#RelativePattern)
	 * to restrict the search results to a [workspace folder](#WorkspaceFolder).
	 */
	include?: GlobPattern;

	/**
	 * A [glob pattern](#GlobPattern) that defines files and folders to exclude. The glob pattern
	 * will be matched against the file paths of resulting matches relative to their workspace. When `undefined` only default excludes will
	 * apply, when `null` no excludes will apply.
	 */
	exclude?: GlobPattern | null;

	/**
	 * The maximum number of results to search for
	 */
	maxResults?: number;

	/**
	 * Whether external files that exclude files, like .gitignore, should be respected.
	 * See the vscode setting `"search.useIgnoreFiles"`.
	 */
	useIgnoreFiles?: boolean;

	/**
	 * Whether global files that exclude files, like .gitignore, should be respected.
	 * See the vscode setting `"search.useGlobalIgnoreFiles"`.
	 */
	useGlobalIgnoreFiles?: boolean;

	/**
	 * Whether files in parent directories that exclude files, like .gitignore, should be respected.
	 * See the vscode setting `"search.useParentIgnoreFiles"`.
	 */
	useParentIgnoreFiles: boolean;

	/**
	 * Whether symlinks should be followed while searching.
	 * See the vscode setting `"search.followSymlinks"`.
	 */
	followSymlinks?: boolean;

	/**
	 * Interpret files using this encoding.
	 * See the vscode setting `"files.encoding"`
	 */
	encoding?: string;

	/**
	 * Options to specify the size of the result text preview.
	 */
	previewOptions?: TextSearchPreviewOptions;

	/**
	 * Number of lines of context to include before each match.
	 */
	beforeContext?: number;

	/**
	 * Number of lines of context to include after each match.
	 */
	afterContext?: number;
}

function newToOldFileProviderOptions(options: FileSearchProviderOptions): FileSearchOptions[] {
	return options.folderOptions.map(folderOption => ({
		folder: folderOption.folder,
		excludes: folderOption.excludes.map(e => typeof (e) === 'string' ? e : e.pattern),
		includes: folderOption.includes,
		useGlobalIgnoreFiles: folderOption.useIgnoreFiles.global,
		useIgnoreFiles: folderOption.useIgnoreFiles.local,
		useParentIgnoreFiles: folderOption.useIgnoreFiles.parent,
		followSymlinks: folderOption.followSymlinks,
		maxResults: options.maxResults,
		session: <CancellationToken | undefined>options.session // TODO: make sure that we actually use a cancellation token here.
	} satisfies FileSearchOptions));
}

export class OldFileSearchProviderConverter implements FileSearchProvider2 {
	constructor(private provider: FileSearchProvider) { }

	provideFileSearchResults(pattern: string, options: FileSearchProviderOptions, token: CancellationToken): ProviderResult<URI[]> {
		const getResult = async () => {
			const newOpts = newToOldFileProviderOptions(options);
			return Promise.all(newOpts.map(
				o => this.provider.provideFileSearchResults({ pattern }, o, token)));
		};
		return getResult().then(e => coalesce(e).flat());
	}
}

function newToOldTextProviderOptions(options: TextSearchProviderOptions): TextSearchOptions[] {
	return options.folderOptions.map(folderOption => ({
		folder: folderOption.folder,
		excludes: folderOption.excludes.map(e => typeof (e) === 'string' ? e : e.pattern),
		includes: folderOption.includes,
		useGlobalIgnoreFiles: folderOption.useIgnoreFiles.global,
		useIgnoreFiles: folderOption.useIgnoreFiles.local,
		useParentIgnoreFiles: folderOption.useIgnoreFiles.parent,
		followSymlinks: folderOption.followSymlinks,
		maxResults: options.maxResults,
		previewOptions: newToOldPreviewOptions(options.previewOptions),
		maxFileSize: options.maxFileSize,
		encoding: folderOption.encoding,
		afterContext: options.surroundingContext,
		beforeContext: options.surroundingContext
	} satisfies TextSearchOptions));
}

export function newToOldPreviewOptions(options: {
	matchLines?: number;
	charsPerLine?: number;
} | undefined
): {
	matchLines: number;
	charsPerLine: number;
} {
	return {
		matchLines: options?.matchLines ?? DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS.matchLines,
		charsPerLine: options?.charsPerLine ?? DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS.charsPerLine
	};
}

export function oldToNewTextSearchResult(result: TextSearchResult): TextSearchResult2 {
	if (isTextSearchMatch(result)) {
		const ranges = asArray(result.ranges).map((r, i) => {
			const previewArr = asArray(result.preview.matches);
			const matchingPreviewRange = previewArr[i];
			return { sourceRange: r, previewRange: matchingPreviewRange };
		});
		return new TextSearchMatch2(result.uri, ranges, result.preview.text);
	} else {
		return new TextSearchContext2(result.uri, result.text, result.lineNumber);
	}
}

export class OldTextSearchProviderConverter implements TextSearchProvider2 {
	constructor(private provider: TextSearchProvider) { }

	provideTextSearchResults(query: TextSearchQuery2, options: TextSearchProviderOptions, progress: IProgress<TextSearchResult2>, token: CancellationToken): ProviderResult<TextSearchComplete2> {

		const progressShim = (oldResult: TextSearchResult) => {
			if (!validateProviderResult(oldResult)) {
				return;
			}
			progress.report(oldToNewTextSearchResult(oldResult));
		};

		const getResult = async () => {
			return coalesce(await Promise.all(
				newToOldTextProviderOptions(options).map(
					o => this.provider.provideTextSearchResults(query, o, { report: (e) => progressShim(e) }, token))))
				.reduce(
					(prev, cur) => ({ limitHit: prev.limitHit || cur.limitHit }),
					{ limitHit: false }
				);
		};
		const oldResult = getResult();
		return oldResult.then((e) => {
			return {
				limitHit: e.limitHit,
				message: coalesce(asArray(e.message))
			} satisfies TextSearchComplete2;
		});
	}
}

function validateProviderResult(result: TextSearchResult): boolean {
	if (extensionResultIsMatch(result)) {
		if (Array.isArray(result.ranges)) {
			if (!Array.isArray(result.preview.matches)) {
				console.warn('INVALID - A text search provider match\'s`ranges` and`matches` properties must have the same type.');
				return false;
			}

			if ((<Range[]>result.preview.matches).length !== result.ranges.length) {
				console.warn('INVALID - A text search provider match\'s`ranges` and`matches` properties must have the same length.');
				return false;
			}
		} else {
			if (Array.isArray(result.preview.matches)) {
				console.warn('INVALID - A text search provider match\'s`ranges` and`matches` properties must have the same length.');
				return false;
			}
		}
	}

	return true;
}

export function extensionResultIsMatch(data: TextSearchResult): data is TextSearchMatch {
	return !!(<TextSearchMatch>data).preview;
}
