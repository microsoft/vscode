/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface FindTextInFilesResponse2 {
		/**
		 * The results of the text search, in batches.
		 */
		results: AsyncIterable<TextSearchResult>;
		/**
		 * The text search completion information that gets returned on completion.
		 */
		complete: Thenable<TextSearchComplete2>;
	}

	export interface TextSearchComplete2 {
		/**
		 * Whether the search hit the limit on the maximum number of search results.
		 * `maxResults` on {@linkcode TextSearchProviderOptions} specifies the max number of results.
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
		message?: TextSearchCompleteMessage[];
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
		 * Messaged are untrusted by default.
		 */
		trusted?: boolean;
		/**
		 * The message type, this affects how the message will be rendered.
		 */
		type: TextSearchCompleteMessageType;
	}

	/**
	 * Represents the severity of a TextSearchComplete message.
	 */
	export enum TextSearchCompleteMessageType {
		Information = 1,
		Warning = 2,
	}

	export namespace workspace {
		/**
		 * Search text in files across all {@link workspace.workspaceFolders workspace folders} in the workspace.
		 * @param query The query parameters for the search - the search string, whether it's case-sensitive, or a regex, or matches whole words.
		 * @param options An optional set of query options. Include and exclude patterns, maxResults, etc.
		 * @param callback A callback, called for each result
		 * @param token A token that can be used to signal cancellation to the underlying search engine.
		 * @return A thenable that resolves when the search is complete.
		 */
		export function findTextInFiles(query: TextSearchQuery, options?: FindTextInFilesOptions, token?: CancellationToken): FindTextInFilesResponse2;

		/**
		 * Register a text search provider.
		 *
		 * Only one provider can be registered per scheme.
		 *
		 * @param scheme The provider will be invoked for workspace folders that have this file scheme.
		 * @param provider The provider.
		 * @return A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerTextSearchProvider(scheme: string, provider: TextSearchProvider2): Disposable;
	}

	/**
	 * A TextSearchProvider provides search results for text results inside files in the workspace.
	 */
	export interface TextSearchProvider2 {
		/**
		 * Provide results that match the given text pattern.
		 * @param query The parameters for this query.
		 * @param options A set of options to consider while searching.
		 * @param progress A progress callback that must be invoked for all results.
		 * @param token A cancellation token.
		 */
		provideTextSearchResults2(query: TextSearchQuery, options: TextSearchProviderOptions[], progress: Progress<TextSearchResult>, token: CancellationToken): ProviderResult<TextSearchComplete2>;
	}

}
