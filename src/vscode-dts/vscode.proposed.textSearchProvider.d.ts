/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/59921

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
				 * Use ignore files at the parent directory. If set, {@link TextSearchProviderOptions.useIgnoreFiles.local} should also be `true`.
				 */
				parent: boolean;
				/**
				 * Use global ignore files. If set, {@link TextSearchProviderOptions.useIgnoreFiles.local} should also be `true`.
				 */
				global: boolean;
			};
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
			 */
			matchLines: number;

			/**
			 * The maximum number of characters included per line.
			 */
			charsPerLine: number;
		};

		/**
		 * Exclude files larger than `maxFileSize` in bytes.
		 */
		maxFileSize: number;

		/**
		 * Interpret files using this encoding.
		 * See the vscode setting `"files.encoding"`
		 */
		encoding: string;

		/**
		 * Number of lines of context to include before and after each match.
		 */
		surroundingContext: number;
	}

	/**
	 * Information collected when text search is complete.
	 */
	export interface TextSearchComplete {
		/**
		 * Whether the search hit the limit on the maximum number of search results.
		 * `maxResults` on {@linkcode TextSearchProviderOptions} specifies the max number of results.
		 * - If exactly that number of matches exist, this should be false.
		 * - If `maxResults` matches are returned and more exist, this should be true.
		 * - If search hits an internal limit which is less than `maxResults`, this should be true.
		 */
		limitHit?: boolean;
	}

	/**
	 * The main match information for a {@link TextSearchResult}.
	 */
	interface TextSearchMatch {
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
	 * A result payload for a text search, pertaining to matches within a single file.
	 */
	export interface TextSearchResult {
		/**
		 * The uri for the matching document.
		 */
		uri: Uri;
		/**
		 * The match corresponding to this result
		 */
		match: TextSearchMatch;
		/**
		 * Any applicable context lines
		 */
		surroundingContext: {

			/**
			 * One line of text.
			 * previewOptions.charsPerLine applies to this
			 */
			text: string;

			/**
			 * The line number of this line of context.
			 */
			lineNumber: number;
		}[];
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
		provideTextSearchResults(query: TextSearchQuery, options: TextSearchProviderOptions, progress: Progress<TextSearchResult>, token: CancellationToken): ProviderResult<TextSearchComplete>;
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
		export function registerTextSearchProvider(scheme: string, provider: TextSearchProvider): Disposable;
	}
}
