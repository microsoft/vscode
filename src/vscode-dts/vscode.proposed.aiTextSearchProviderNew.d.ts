/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
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
		provideAITextSearchResults(query: string, options: TextSearchProviderOptions, progress: Progress<TextSearchResultNew>, token: CancellationToken): ProviderResult<TextSearchCompleteNew>;
	}

	export namespace workspace {
		/**
		 * Register an AI text search provider.
		 *
		 * Only one provider can be registered per scheme.
		 *
		 * @param scheme The provider will be invoked for workspace folders that have this file scheme.
		 * @param provider The provider.
		 * @return A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerAITextSearchProviderNew(scheme: string, provider: AITextSearchProviderNew): Disposable;
	}
}
