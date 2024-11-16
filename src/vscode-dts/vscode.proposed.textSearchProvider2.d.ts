/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/59921

	/**
	 * The parameters of a query for text search. All optional booleans default to `false`.
	 */
	export interface TextSearchQuery2 {
		/**
		 * The text pattern to search for.
		 *
		 * If explicitly contains a newline character (`\n`), the default search behavior
		 * will automatically enable {@link isMultiline}.
		 */
		pattern: string;

		/**
		 * Whether or not `pattern` should match multiple lines of text.
		 *
		 * If using the default search provider, this will be interpreted as `true` if
		 * `pattern` contains a newline character (`\n`).
		 */
		isMultiline?: boolean;

		/**
		 * Whether or not `pattern` should be interpreted as a regular expression.
		 *
		 * If using the default search provider, this will be interpreted case-insensitively
		 * if {@link isCaseSensitive} is `false` or not set.
		 */
		isRegExp?: boolean;

		/**
		 * Whether or not the search should be case-sensitive.
		 *
		 * If using the default search provider, this can be affected by the `search.smartCase` setting.
		 * See the setting description for more information.
		 */
		isCaseSensitive?: boolean;

		/**
		 * Whether or not to search for whole word matches only.
		 *
		 * If enabled, the default search provider will check for boundary characters
		 * (regex pattern `\b`) surrounding the {@link pattern} to see whether something
		 * is a word match.
		 */
		isWordMatch?: boolean;
	}

	/**
	 * Options that apply to text search.
	 */
	export interface TextSearchProviderOptions {

		folderOptions: {
			/**
			 * The root folder to search within.
			 */
			folder: Uri;

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
				* Use ignore files at the parent directory. If set, `local` in {@link TextSearchProviderFolderOptions.useIgnoreFiles} should also be `true`.
				*/
				parent: boolean;
				/**
				 * Use global ignore files. If set, `local` in {@link TextSearchProviderFolderOptions.useIgnoreFiles} should also be `true`.
				 */
				global: boolean;
			};

			/**
			 * Interpret files using this encoding.
			 * See the vscode setting `"files.encoding"`
			 */
			encoding: string;
		}[];

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
	export interface TextSearchComplete2 {
		/**
		 * Whether the search hit the limit on the maximum number of search results.
		 * `maxResults` on {@link TextSearchProviderOptions} specifies the max number of results.
		 * - If exactly that number of matches exist, this should be false.
		 * - If `maxResults` matches are returned and more exist, this should be true.
		 * - If search hits an internal limit which is less than `maxResults`, this should be true.
		 */
		limitHit?: boolean;
	}

	/**
	 * A query match instance in a file.
	 *
	 * For example, consider this excerpt:
	 *
	 * ```ts
	 * const bar = 1;
	 * console.log(bar);
	 * const foo = bar;
	 * ```
	 *
	 * If the query is `log`, then the line `console.log(bar);` should be represented using a {@link TextSearchMatch2}.
	 */
	export class TextSearchMatch2 {
		/**
		 * @param uri The uri for the matching document.
		 * @param ranges The ranges associated with this match.
		 * @param previewText The text that is used to preview the match. The highlighted range in `previewText` is specified in `ranges`.
		 */
		constructor(uri: Uri, ranges: { sourceRange: Range; previewRange: Range }[], previewText: string);

		/**
		 * The uri for the matching document.
		 */
		uri: Uri;

		/**
		 * The ranges associated with this match.
		 */
		ranges: {
			/**
			 * The range of the match within the document, or multiple ranges for multiple matches.
			 */
			sourceRange: Range;
			/**
			 * The Range within `previewText` corresponding to the text of the match.
			 */
			previewRange: Range;
		}[];

		previewText: string;
	}

	/**
	 * The context lines of text that are not a part of a match,
	 * but that surround a match line of type {@link TextSearchMatch2}.
	 *
	 * For example, consider this excerpt:
	 *
	 * ```ts
	 * const bar = 1;
	 * console.log(bar);
	 * const foo = bar;
	 * ```
	 *
	 * If the query is `log`, then the lines `const bar = 1;` and `const foo = bar;`
	 * should be represented using two separate {@link TextSearchContext2} for the search instance.
	 * This example assumes that the finder requests one line of surrounding context.
	 */
	export class TextSearchContext2 {
		/**
		 * @param uri The uri for the matching document.
		 * @param text The line of context text.
		 * @param lineNumber The line number of this line of context.
		 */
		constructor(uri: Uri, text: string, lineNumber: number);

		/**
		 * The uri for the matching document.
		 */
		uri: Uri;

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

	/**
	 * A result payload for a text search, pertaining to {@link TextSearchMatch2 matches}
	 * and its associated {@link TextSearchContext2 context} within a single file.
	 */
	export type TextSearchResult2 = TextSearchMatch2 | TextSearchContext2;

	/**
	 * A TextSearchProvider provides search results for text results inside files in the workspace.
	 */
	export interface TextSearchProvider2 {
		/**
		 * Provide results that match the given text pattern.
		 * @param query The parameters for this query.
		 * @param options A set of options to consider while searching.
		 * @param progress A progress callback that must be invoked for all {@link TextSearchResult2 results}.
		 * These results can be direct matches, or context that surrounds matches.
		 * @param token A cancellation token.
		 */
		provideTextSearchResults(query: TextSearchQuery2, options: TextSearchProviderOptions, progress: Progress<TextSearchResult2>, token: CancellationToken): ProviderResult<TextSearchComplete2>;
	}

	export namespace workspace {
		/**
		 * Register a text search provider.
		 *
		 * Only one provider can be registered per scheme.
		 *
		 * @param scheme The provider will be invoked for workspace folders that have this file scheme.
		 * @param provider The provider.
		 * @return A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerTextSearchProvider2(scheme: string, provider: TextSearchProvider2): Disposable;
	}
}
