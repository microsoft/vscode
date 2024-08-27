/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { IProgress } from 'vs/platform/progress/common/progress';

export class Position {
	constructor(readonly line: number, readonly character: number) { }

	isBefore(other: Position): boolean { return false; }
	isBeforeOrEqual(other: Position): boolean { return false; }
	isAfter(other: Position): boolean { return false; }
	isAfterOrEqual(other: Position): boolean { return false; }
	isEqual(other: Position): boolean { return false; }
	compareTo(other: Position): number { return 0; }
	translate(lineDelta?: number, characterDelta?: number): Position;
	translate(change: { lineDelta?: number; characterDelta?: number }): Position;
	translate(_?: any, _2?: any): Position { return new Position(0, 0); }
	with(line?: number, character?: number): Position;
	with(change: { line?: number; character?: number }): Position;
	with(_: any): Position { return new Position(0, 0); }
}

export class Range {
	readonly start: Position;
	readonly end: Position;

	constructor(startLine: number, startCol: number, endLine: number, endCol: number) {
		this.start = new Position(startLine, startCol);
		this.end = new Position(endLine, endCol);
	}

	isEmpty = false;
	isSingleLine = false;
	contains(positionOrRange: Position | Range): boolean { return false; }
	isEqual(other: Range): boolean { return false; }
	intersection(range: Range): Range | undefined { return undefined; }
	union(other: Range): Range { return new Range(0, 0, 0, 0); }

	with(start?: Position, end?: Position): Range;
	with(change: { start?: Position; end?: Position }): Range;
	with(_: any): Range { return new Range(0, 0, 0, 0); }
}

export type ProviderResult<T> = T | undefined | null | Thenable<T | undefined | null>;

/**
 * A relative pattern is a helper to construct glob patterns that are matched
 * relatively to a base path. The base path can either be an absolute file path
 * or a [workspace folder](#WorkspaceFolder).
 */
export interface RelativePattern {

	/**
	 * A base file path to which this pattern will be matched against relatively. The
	 * file path must be absolute, should not have any trailing path separators and
	 * not include any relative segments (`.` or `..`).
	 */
	baseUri: URI;

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
export interface TextSearchQueryNew {
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


export interface TextSearchProviderFolderOptions {
	/**
	 * The root folder to search within.
	 */
	folder: URI;

	/**
	 * Files that match an `includes` glob pattern should be included in the search.
	 */
	includes: string[];

	/**
	 * Files that match an `excludes` glob pattern should be excluded from the search.
	 */
	excludes: GlobPattern[];

	/**
	 * Whether symlinks should be followed while searching.
	 * For more info, see the setting description for `search.followSymlinks`.
	 */
	followSymlinks: boolean;

	/**
	 * Which file locations we should look for ignore (.gitignore or .ignore) files to respect.
	 */
	useIgnoreFiles: {
		/**
		 * Use ignore files at the current workspace root.
		 */
		local: boolean;
		/**
		 * Use ignore files at the parent directory. If set, {@link TextSearchProviderOptions.useIgnoreFiles.local} should also be `true`.
		 */
		parent: boolean;
		/**
		 * Use global ignore files. If set, {@link TextSearchProviderOptions.useIgnoreFiles.local} should also be `true`.
		 */
		global: boolean;
	};

	/**
	 * Interpret files using this encoding.
	 * See the vscode setting `"files.encoding"`
	 */
	encoding: string;
}

/**
 * Options that apply to text search.
 */
export interface TextSearchProviderOptions {

	folderOptions: TextSearchProviderFolderOptions[];

	/**
	 * The maximum number of results to be returned.
	 */
	maxResults: number;

	/**
	 * Options to specify the size of the result text preview.
	 */
	previewOptions: {
		/**
		 * The maximum number of lines in the preview.
		 * Only search providers that support multiline search will ever return more than one line in the match.
		 * Defaults to 100.
		 */
		matchLines: number;

		/**
		 * The maximum number of characters included per line.
		 * Defaults to 10000.
		 */
		charsPerLine: number;
	};

	/**
	 * Exclude files larger than `maxFileSize` in bytes.
	 */
	maxFileSize: number | undefined;


	/**
	 * Number of lines of context to include before and after each match.
	 */
	surroundingContext: number;
}


/**
 * Information collected when text search is complete.
 */
export interface TextSearchCompleteNew {
	/**
	 * Whether the search hit the limit on the maximum number of search results.
	 * `maxResults` on [`TextSearchOptions`](#TextSearchOptions) specifies the max number of results.
	 * - If exactly that number of matches exist, this should be false.
	 * - If `maxResults` matches are returned and more exist, this should be true.
	 * - If search hits an internal limit which is less than `maxResults`, this should be true.
	 */
	limitHit?: boolean;
}

export interface FileSearchProviderFolderOptions {
	/**
	 * The root folder to search within.
	 */
	folder: URI;

	/**
	 * Files that match an `includes` glob pattern should be included in the search.
	 */
	includes: string[];

	/**
	 * Files that match an `excludes` glob pattern should be excluded from the search.
	 */
	excludes: GlobPattern[];

	/**
	 * Whether symlinks should be followed while searching.
	 * For more info, see the setting description for `search.followSymlinks`.
	 */
	followSymlinks: boolean;

	/**
	 * Which file locations we should look for ignore (.gitignore or .ignore) files to respect.
	 */
	useIgnoreFiles: {
		/**
		 * Use ignore files at the current workspace root.
		 */
		local: boolean;
		/**
		 * Use ignore files at the parent directory. If set, {@link FileSearchProviderOptions.useIgnoreFiles.local} should also be `true`.
		 */
		parent: boolean;
		/**
		 * Use global ignore files. If set, {@link FileSearchProviderOptions.useIgnoreFiles.local} should also be `true`.
		 */
		global: boolean;
	};
}

/**
 * Options that apply to file search.
 */
export interface FileSearchProviderOptions {
	folderOptions: FileSearchProviderFolderOptions[];

	/**
	 * An object with a lifespan that matches the session's lifespan. If the provider chooses to, this object can be used as the key for a cache,
	 * and searches with the same session object can search the same cache. When the token is cancelled, the session is complete and the cache can be cleared.
	 */
	session: unknown;

	/**
	 * The maximum number of results to be returned.
	 */
	maxResults: number;
}

/**
 * The main match information for a {@link TextSearchResultNew}.
 */
export class TextSearchMatchNew {
	/**
	 * @param uri The uri for the matching document.
	 * @param ranges The ranges associated with this match.
	 * @param previewText The text that is used to preview the match. The highlighted range in `previewText` is specified in `ranges`.
	 */
	constructor(
		public uri: URI,
		public ranges: { sourceRange: Range; previewRange: Range }[],
		public previewText: string) { }

}

/**
 * The potential context information for a {@link TextSearchResultNew}.
 */
export class TextSearchContextNew {
	/**
	 * @param uri The uri for the matching document.
	 * @param text The line of context text.
	 * @param lineNumber The line number of this line of context.
	 */
	constructor(
		public uri: URI,
		public text: string,
		public lineNumber: number) { }
}

/**
 * A result payload for a text search, pertaining to matches within a single file.
 */
export type TextSearchResultNew = TextSearchMatchNew | TextSearchContextNew;


/**
 * A FileSearchProvider provides search results for files in the given folder that match a query string. It can be invoked by quickaccess or other extensions.
 *
 * A FileSearchProvider is the more powerful of two ways to implement file search in VS Code. Use a FileSearchProvider if you wish to search within a folder for
 * all files that match the user's query.
 *
 * The FileSearchProvider will be invoked on every keypress in quickaccess. When `workspace.findFiles` is called, it will be invoked with an empty query string,
 * and in that case, every file in the folder should be returned.
 */
export interface FileSearchProviderNew {
	/**
	 * Provide the set of files that match a certain file path pattern.
	 * @param query The parameters for this query.
	 * @param options A set of options to consider while searching files.
	 * @param progress A progress callback that must be invoked for all results.
	 * @param token A cancellation token.
	 */
	provideFileSearchResults(pattern: string, options: FileSearchProviderOptions, token: CancellationToken): ProviderResult<URI[]>;
}

/**
 * A TextSearchProvider provides search results for text results inside files in the workspace.
 */
export interface TextSearchProviderNew {
	/**
	 * Provide results that match the given text pattern.
	 * @param query The parameters for this query.
	 * @param options A set of options to consider while searching.
	 * @param progress A progress callback that must be invoked for all results.
	 * @param token A cancellation token.
	 */
	provideTextSearchResults(query: TextSearchQueryNew, options: TextSearchProviderOptions, progress: IProgress<TextSearchResultNew>, token: CancellationToken): ProviderResult<TextSearchCompleteNew>;
}

/**
 * Information collected when text search is complete.
 */
export interface TextSearchCompleteNew {
	/**
	 * Whether the search hit the limit on the maximum number of search results.
	 * `maxResults` on {@linkcode TextSearchOptions} specifies the max number of results.
	 * - If exactly that number of matches exist, this should be false.
	 * - If `maxResults` matches are returned and more exist, this should be true.
	 * - If search hits an internal limit which is less than `maxResults`, this should be true.
	 */
	limitHit?: boolean;

	/**
	 * Additional information regarding the state of the completed search.
	 *
	 * Messages with "Information" style support links in markdown syntax:
	 * - Click to [run a command](command:workbench.action.OpenQuickPick)
	 * - Click to [open a website](https://aka.ms)
	 *
	 * Commands may optionally return { triggerSearch: true } to signal to the editor that the original search should run be again.
	 */
	message?: TextSearchCompleteMessageNew[];
}

/**
 * A message regarding a completed search.
 */
export interface TextSearchCompleteMessageNew {
	/**
	 * Markdown text of the message.
	 */
	text: string;
	/**
	 * Whether the source of the message is trusted, command links are disabled for untrusted message sources.
	 * Messaged are untrusted by default.
	 */
	trusted?: boolean;
	/**
	 * The message type, this affects how the message will be rendered.
	 */
	type: TextSearchCompleteMessageType;
}


/**
 * A FileSearchProvider provides search results for files in the given folder that match a query string. It can be invoked by quickaccess or other extensions.
 *
 * A FileSearchProvider is the more powerful of two ways to implement file search in VS Code. Use a FileSearchProvider if you wish to search within a folder for
 * all files that match the user's query.
 *
 * The FileSearchProvider will be invoked on every keypress in quickaccess. When `workspace.findFiles` is called, it will be invoked with an empty query string,
 * and in that case, every file in the folder should be returned.
 */
export interface FileSearchProviderNew {
	/**
	 * Provide the set of files that match a certain file path pattern.
	 * @param query The parameters for this query.
	 * @param options A set of options to consider while searching files.
	 * @param progress A progress callback that must be invoked for all results.
	 * @param token A cancellation token.
	 */
	provideFileSearchResults(pattern: string, options: FileSearchProviderOptions, token: CancellationToken): ProviderResult<URI[]>;
}

/**
 * A TextSearchProvider provides search results for text results inside files in the workspace.
 */
export interface TextSearchProviderNew {
	/**
	 * Provide results that match the given text pattern.
	 * @param query The parameters for this query.
	 * @param options A set of options to consider while searching.
	 * @param progress A progress callback that must be invoked for all results.
	 * @param token A cancellation token.
	 */
	provideTextSearchResults(query: TextSearchQueryNew, options: TextSearchProviderOptions, progress: IProgress<TextSearchResultNew>, token: CancellationToken): ProviderResult<TextSearchCompleteNew>;
}

/**
 * Information collected when text search is complete.
 */
export interface TextSearchCompleteNew {
	/**
	 * Whether the search hit the limit on the maximum number of search results.
	 * `maxResults` on {@linkcode TextSearchOptions} specifies the max number of results.
	 * - If exactly that number of matches exist, this should be false.
	 * - If `maxResults` matches are returned and more exist, this should be true.
	 * - If search hits an internal limit which is less than `maxResults`, this should be true.
	 */
	limitHit?: boolean;

	/**
	 * Additional information regarding the state of the completed search.
	 *
	 * Messages with "Information" style support links in markdown syntax:
	 * - Click to [run a command](command:workbench.action.OpenQuickPick)
	 * - Click to [open a website](https://aka.ms)
	 *
	 * Commands may optionally return { triggerSearch: true } to signal to the editor that the original search should run be again.
	 */
	message?: TextSearchCompleteMessageNew[];
}

/**
 * A message regarding a completed search.
 */
export interface TextSearchCompleteMessageNew {
	/**
	 * Markdown text of the message.
	 */
	text: string;
	/**
	 * Whether the source of the message is trusted, command links are disabled for untrusted message sources.
	 * Messaged are untrusted by default.
	 */
	trusted?: boolean;
	/**
	 * The message type, this affects how the message will be rendered.
	 */
	type: TextSearchCompleteMessageType;
}

/**
 * Options for following search.exclude and files.exclude settings.
 */
export enum ExcludeSettingOptions {
	/*
	 * Don't use any exclude settings.
	 */
	None = 1,
	/*
	 * Use:
	 * - files.exclude setting
	 */
	FilesExclude = 2,
	/*
	 * Use:
	 * - files.exclude setting
	 * - search.exclude setting
	 */
	SearchAndFilesExclude = 3
}

export enum TextSearchCompleteMessageType {
	Information = 1,
	Warning = 2,
}


/**
 * A message regarding a completed search.
 */
export interface TextSearchCompleteMessage {
	/**
	 * Markdown text of the message.
	 */
	text: string;
	/**
	 * Whether the source of the message is trusted, command links are disabled for untrusted message sources.
	 */
	trusted?: boolean;
	/**
	 * The message type, this affects how the message will be rendered.
	 */
	type: TextSearchCompleteMessageType;
}


/**
 * An AITextSearchProvider provides additional AI text search results in the workspace.
 */
export interface AITextSearchProviderNew {
	/**
	 * WARNING: VERY EXPERIMENTAL.
	 *
	 * Provide results that match the given text pattern.
	 * @param query The parameter for this query.
	 * @param options A set of options to consider while searching.
	 * @param progress A progress callback that must be invoked for all results.
	 * @param token A cancellation token.
	 */
	provideAITextSearchResults(query: string, options: TextSearchProviderOptions, progress: IProgress<TextSearchResultNew>, token: CancellationToken): ProviderResult<TextSearchCompleteNew>;
}
