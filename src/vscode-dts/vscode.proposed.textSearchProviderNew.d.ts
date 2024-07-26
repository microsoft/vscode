/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/59921

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

	/**
	 * Options that apply to text search.
	 */
	export interface TextSearchProviderOptionsNew {

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
				 * Use ignore files at the parent directory. If set, {@link TextSearchProviderOptionsNew.useIgnoreFiles.local} should also be `true`.
				 */
				parent: boolean;
				/**
				 * Use global ignore files. If set, {@link TextSearchProviderOptionsNew.useIgnoreFiles.local} should also be `true`.
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
	export interface TextSearchCompleteNew {
		/**
		 * Whether the search hit the limit on the maximum number of search results.
		 * `maxResults` on {@linkcode TextSearchProviderOptionsNew} specifies the max number of results.
		 * - If exactly that number of matches exist, this should be false.
		 * - If `maxResults` matches are returned and more exist, this should be true.
		 * - If search hits an internal limit which is less than `maxResults`, this should be true.
		 */
		limitHit?: boolean;
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
	 * The potential context information for a {@link TextSearchResultNew}.
	 */
	export class TextSearchContextNew {
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
	 * A result payload for a text search, pertaining to matches within a single file.
	 */
	export type TextSearchResultNew = TextSearchMatchNew | TextSearchContextNew;

	/**
	 * A TextSearchProvider provides search results for text results inside files in the workspace.
	 */
	export interface TextSearchProviderNew {
		/**
		 * WARNING: VERY EXPERIMENTAL.
		 *
		 * Provide results that match the given text pattern.
		 * @param query The parameters for this query.
		 * @param options A set of options to consider while searching.
		 * @param progress A progress callback that must be invoked for all results.
		 * @param token A cancellation token.
		 */
		provideTextSearchResults(query: TextSearchQueryNew, options: TextSearchProviderOptionsNew, progress: Progress<TextSearchResultNew>, token: CancellationToken): ProviderResult<TextSearchCompleteNew>;
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
		export function registerTextSearchProviderNew(scheme: string, provider: TextSearchProviderNew): Disposable;
	}
}
