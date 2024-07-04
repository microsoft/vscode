/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/59924

	export interface FindTextInFilesTargetOptions extends FindFilesTargetOptions {

		/**
		 * A {@link GlobPattern glob pattern} that defines the files to search for. The glob pattern
		 * will be matched against the file paths of files relative to their workspace. Use a {@link RelativePattern relative pattern}
		 * to restrict the search results to a {@link WorkspaceFolder workspace folder}.
		 */
		include?: GlobPattern;
	}

	/**
	 * Options that can be set on a findTextInFiles search.
	 */
	export interface FindTextInFilesOptions {
		/**
		 * options that dictate which files to target
		 */
		fileTargetOptions?: FindTextInFilesTargetOptions;

		/**
		 * Options that dictate how the search query is presented
		 */
		presentationOptions?: {
			/**
			 * Options to specify the size of the result text preview.
			 */
			previewOptions?: TextSearchPreviewOptions;

			/**
			 * Number of lines of context to include before and after each match.
			 */
			surroundingContext?: number;
		};

		/**
		 * The maximum number of results to search for
		 */
		maxResults?: number;

		/**
		 * Interpret files using this encoding.
		 * See the vscode setting `"files.encoding"`
		 */
		encoding?: string;

	}

	export namespace workspace {
		/**
		 * Search text in files across all {@link workspace.workspaceFolders workspace folders} in the workspace.
		 * @param query The query parameters for the search - the search string, whether it's case-sensitive, or a regex, or matches whole words.
		 * @param callback A callback, called for each result
		 * @param options A set of query options.
		 * @param token A token that can be used to signal cancellation to the underlying search engine.
		 * @return A thenable that resolves when the search is complete.
		 */
		export function findTextInFiles(query: TextSearchQuery, callback: (result: TextSearchResult) => void, options?: FindTextInFilesOptions, token?: CancellationToken): Thenable<TextSearchComplete>;
	}
}
