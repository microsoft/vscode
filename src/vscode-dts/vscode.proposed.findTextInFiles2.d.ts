/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/59924

	export interface FindTextInFilesOptions2 {
		/**
		 * An array of {@link GlobPattern} that defines the files to search for.
		 * The glob patterns will be matched against the file paths of files relative to their workspace or {@link GlobPattern}'s `baseUri` if applicable.
		 * Use a {@link RelativePattern} to restrict the search results to a {@link WorkspaceFolder workspace folder}.
		 *
		 * If more than one value is used, the values are combined with a logical OR.
		 *
		 * For example, consider the following code:
		 *
		 * ```ts
		 * const ab = findTextInFiles2('foo', {include: ['*.ts', '*.js']});
		 * const a = findTextInFiles2('foo', {include: ['*.ts']});
		 * const b = findTextInFiles2('foo', {include: ['*.js']});
		 * ```
		 *
		 * In this, `ab` will be the union of results from `a` and `b`.
		 */
		include?: GlobPattern[];

		/**
		 * An array of {@link GlobPattern} that defines files to exclude.
		 * The glob patterns will be matched against the file paths of files relative to their workspace or {@link RelativePattern}'s `baseUri` if applicable.
		 *
		 * If more than one value is used, the values are combined with a logical AND.
		 * For example, consider the following code:
		 *
		 * ```ts
		 * const ab = findTextInFiles2('foo', {exclude: ['*.ts', '*.js']});
		 * const a = findTextInFiles2('foo', {exclude: ['*.ts']});
		 * const b = findTextInFiles2('foo', {exclude: ['*.js']});
		 * ```
		 *
		 * In this, `ab` will be the intersection of results from `a` and `b`.
		 */
		exclude?: GlobPattern[];

		/**
		 * Which settings to follow when searching for files. Defaults to `ExcludeSettingOptions.searchAndFilesExclude`.
		 */
		useExcludeSettings?: ExcludeSettingOptions;

		/**
		 * The maximum number of results to search for. Defaults to 20000 results.
		 */
		maxResults?: number;

		/**
		 * Which file locations have ignore (`.gitignore` or `.ignore`) files to follow.
		 *
		 * When any of these fields are `undefined`, the value will either be assumed (e.g. if only one is valid),
		 * or it will follow settings based on the corresponding `search.use*IgnoreFiles` setting.
		 *
		 * Will log an error if an invalid combination is set.
		 *
		 * Although `.ignore` files are uncommon, they can be leveraged if there are patterns
		 * that should not be known to git, but should be known to the search providers.
		 * They should be in the same locations where `.gitignore` files are found, and they follow the same format.
		 */
		useIgnoreFiles?: {
			/**
			 * Use ignore files at the current workspace root.
			 * May default to `search.useIgnoreFiles` setting if not set.
			 */
			local?: boolean;
			/**
			 * Use ignore files at the parent directory. When set to `true`, `local` in {@link FindTextInFilesOptions2.useIgnoreFiles} must be `true`.
			 * May default to `search.useParentIgnoreFiles` setting if not set.
			 */
			parent?: boolean;
			/**
			 * Use global ignore files. When set to `true`, `local` in {@link FindTextInFilesOptions2.useIgnoreFiles} must also be `true`.
			 * May default to `search.useGlobalIgnoreFiles` setting if not set.
			 */
			global?: boolean;
		};

		/**
		 * Whether symlinks should be followed while searching.
		 * Defaults to the value for `search.followSymlinks` in settings.
		 * For more info, see the setting description for `search.followSymlinks`.
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
		previewOptions?: {
			/**
			 * The maximum number of lines in the preview of the match itself (not including surrounding context lines).
			 * Only search providers that support multiline search will ever return more than one line in the match.
			 */
			numMatchLines?: number;

			/**
			 * The maximum number of characters included per line.
			 */
			charsPerLine?: number;
		};

		/**
		 * Number of lines of context to include before and after each match.
		 */
		surroundingContext?: number;
	}

	export interface FindTextInFilesResponse {
		/**
		 * The results of the text search, in batches. To get completion information, wait on the `complete` property.
		 */
		results: AsyncIterable<TextSearchResult2>;
		/**
		 * The text search completion information. This resolves on completion.
		 */
		complete: Thenable<TextSearchComplete2>;
	}

	export namespace workspace {
		/**
		 * Search text in files across all {@link workspace.workspaceFolders workspace folders} in the workspace.
		 * @param query The query parameters for the search - the search string, whether it's case-sensitive, or a regex, or matches whole words.
		 * @param options An optional set of query options.
		 * @param callback A callback, called for each {@link TextSearchResult2 result}. This can be a direct match, or context that surrounds a match.
		 * @param token A token that can be used to signal cancellation to the underlying search engine.
		 * @return A thenable that resolves when the search is complete.
		 */
		export function findTextInFiles2(query: TextSearchQuery2, options?: FindTextInFilesOptions2, token?: CancellationToken): FindTextInFilesResponse;
	}
}
