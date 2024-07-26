/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/59924

	export interface FindTextInFilesOptionsNew {
		/**
		 * A {@link GlobPattern glob pattern} that defines the files to search for. The glob pattern
		 * will be matched against the file paths of files relative to their workspace. Use a {@link RelativePattern relative pattern}
		 * to restrict the search results to a {@link WorkspaceFolder workspace folder}.
		 */
		include?: GlobPattern[];

		/**
		 * A {@link GlobPattern glob pattern} that defines files and folders to exclude. The glob pattern
		 * will be matched against the file paths of resulting matches relative to their workspace.
		 */
		exclude?: GlobPattern[];

		/**
		 * Which settings to follow when searching for files. Defaults to {@link ExcludeSettingOptions.searchAndFilesExclude}.
		 */
		useExcludeSettings?: ExcludeSettingOptions;

		/**
		 * The maximum number of results to search for
		 */
		maxResults?: number;


		/**
		 * Which file locations we should look for ignore (.gitignore or .ignore) files to respect.
		 *
		 * When any of these fields are `undefined`, we will:
		 * - assume the value if possible (e.g. if only one is valid)
		 * or
		 * - follow settings using the value for the corresponding `search.use*IgnoreFiles` settting.
		 *
		 * Will log an error if an invalid combination is set.
		 */
		useIgnoreFiles?: {
			/**
			 * Use ignore files at the current workspace root.
			 * May default to `search.useIgnoreFiles` setting if not set.
			 */
			local?: boolean;
			/**
			 * Use ignore files at the parent directory. When set to `true`, {@link FindTextInFilesOptionsNew.useIgnoreFiles.local} must be `true`.
			 * May default to `search.useParentIgnoreFiles` setting if not set.
			 */
			parent?: boolean;
			/**
			 * Use global ignore files. When set to `true`, {@link FindTextInFilesOptionsNew.useIgnoreFiles.local} must also be `true`.
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
			 * The maximum number of lines in the preview.
			 * Only search providers that support multiline search will ever return more than one line in the match.
			 */
			matchLines?: number;

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
		results: AsyncIterable<TextSearchResultNew>;
		/**
		 * The text search completion information. This resolves on completion.
		 */
		complete: Thenable<TextSearchCompleteNew>;
	}

	/*
	* Options for following search.exclude and files.exclude settings.
	*/
	export enum ExcludeSettingOptions {
		/*
		 * Don't use any exclude settings.
		 */
		none = 1,
		/*
		 * Use:
		 * - files.exclude setting
		 */
		filesExclude = 2,
		/*
		 * Use:
		 * - files.exclude setting
		 * - search.exclude setting
		 */
		searchAndFilesExclude = 3
	}

	export namespace workspace {
		/**
		 * WARNING: VERY EXPERIMENTAL.
		 *
		 * Search text in files across all {@link workspace.workspaceFolders workspace folders} in the workspace.
		 * @param query The query parameters for the search - the search string, whether it's case-sensitive, or a regex, or matches whole words.
		 * @param options An optional set of query options. Include and exclude patterns, maxResults, etc.
		 * @param callback A callback, called for each result
		 * @param token A token that can be used to signal cancellation to the underlying search engine.
		 * @return A thenable that resolves when the search is complete.
		 */
		export function findTextInFilesNew(query: TextSearchQueryNew, options?: FindTextInFilesOptionsNew, token?: CancellationToken): FindTextInFilesResponse;
	}
}
