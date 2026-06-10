/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/73524

	/**
	 * Options that apply to file search.
	 */
	export interface FileSearchProviderOptions {
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
				 * Use ignore files at the parent directory. If set, `local` in {@link FileSearchProviderOptions.useIgnoreFiles} should also be `true`.
				 */
				parent: boolean;
				/**
				 * Use global ignore files. If set, `local` in {@link FileSearchProviderOptions.useIgnoreFiles} should also be `true`.
				 */
				global: boolean;
			};
		}[];

		/**
		 * An object with a lifespan that matches the session's lifespan. If the provider chooses to, this object can be used as the key for a cache,
		 * and searches with the same session object can search the same cache. When the object is garbage-collected, the session is complete and the cache can be cleared.
		 * Please do not store any references to the session object, except via a weak reference (e.g. `WeakRef` or `WeakMap`).
		 */
		session: object;

		/**
		 * The maximum number of results to be returned.
		 */
		maxResults: number;
	}

	/**
	 * A FileSearchProvider provides search results for files in the given folder that match a query string. It can be invoked by quickopen or other extensions.
	 *
	 * A FileSearchProvider is the more powerful of two ways to implement file search in the editor. Use a FileSearchProvider if you wish to search within a folder for
	 * all files that match the user's query.
	 *
	 * The FileSearchProvider will be invoked on every keypress in quickopen.
	 */
	export interface FileSearchProvider2 {
		/**
		 * Provide the set of files that match a certain file path pattern.
		 *
		 * @param pattern The search pattern to match against file paths. The `pattern` should be interpreted in a
		 * *relaxed way* as the editor will apply its own highlighting and scoring on the results. A good rule of
		 * thumb is to match case-insensitive and to simply check that the characters of `pattern` appear in their
		 * order in a candidate file path. Don't use prefix, substring, or similar strict matching. When `pattern`
		 * is empty, all files in the folder should be returned.
		 * @param options A set of options to consider while searching files.
		 * @param token A cancellation token.
		 */
		provideFileSearchResults(pattern: string, options: FileSearchProviderOptions, token: CancellationToken): ProviderResult<Uri[]>;
	}

	export namespace workspace {
		/**
		 *
		 * Register a search provider.
		 *
		 * Only one provider can be registered per scheme.
		 *
		 * @param scheme The provider will be invoked for workspace folders that have this file scheme.
		 * @param provider The provider.
		 * @return A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerFileSearchProvider2(scheme: string, provider: FileSearchProvider2): Disposable;
	}
}
