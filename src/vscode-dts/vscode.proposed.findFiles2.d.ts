/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface FindFiles2Options {
		// note: this is just FindTextInFilesOptions without select properties (include, previewOptions, beforeContext, afterContext)

		/**
		 * A {@link GlobPattern glob pattern} that defines files and folders to exclude. The glob pattern
		 * will be matched against the file paths of resulting matches relative to their workspace. When `undefined`, default excludes will
		 * apply.
		 */
		exclude?: GlobPattern;

		/**
		 * Whether to use the values for files.exclude. Defaults to false.
		 */
		useDefaultExcludes?: boolean;

		/**
		 * The maximum number of results to search for
		 */
		maxResults?: number;

		/**
		 * Whether external files that exclude files, like .gitignore, should be respected.
		 * See the vscode setting `"search.useIgnoreFiles"`.
		 */
		useIgnoreFiles?: boolean;

		/**
		 * Whether global files that exclude files, like .gitignore, should be respected.
		 * See the vscode setting `"search.useGlobalIgnoreFiles"`.
		 */
		useGlobalIgnoreFiles?: boolean;

		/**
		 * Whether files in parent directories that exclude files, like .gitignore, should be respected.
		 * See the vscode setting `"search.useParentIgnoreFiles"`.
		 */
		useParentIgnoreFiles?: boolean;

		/**
		 * Whether symlinks should be followed while searching.
		 * See the vscode setting `"search.followSymlinks"`.
		 */
		followSymlinks?: boolean;
	}

	/**
	 * Represents a session of a currently logged in user.
	 */
	export namespace workspace {
		/**
		 * Find files across all {@link workspace.workspaceFolders workspace folders} in the workspace.
		 *
		 * @example
		 * findFiles('**​/*.js', {useDefaultExclude: true, additionalExclude: '**​/out/**'}, 10)
		 *
		 * @param filePattern A {@link GlobPattern glob pattern} that defines the files to search for. The glob pattern
		 * will be matched against the file paths of resulting matches relative to their workspace. Use a {@link RelativePattern relative pattern}
		 * to restrict the search results to a {@link WorkspaceFolder workspace folder}.
		 * @param exclude  Either:
		 * 1. A {@link GlobPattern glob pattern} that defines files and folders to exclude. Using this form would be the same as using the second form as
		 * `{ useDefaultExclude: false; additionalExclude?: excludeString }`. Therefore, this assumes that you ignore the default exclude settings.
		 *
		 * Or
		 *
		 * 2. An object with:
		 * - useDefaultExclude: a boolean to used to determine whether to incorporate any excludes that already come with the workspace settings (ie: `search.excludes`)
		 * - additionalExclude: a {@link GlobPattern glob pattern}` that contains any extra excludes that are not covered by the default or the `search.excludes` settings.
		 *
		 * In all cases, the glob pattern will be matched against the file paths of resulting matches relative to their workspace.
		 * @param maxResults An upper-bound for the result.
		 * @param token A token that can be used to signal cancellation to the underlying search engine.
		 * @returns A thenable that resolves to an array of resource identifiers. Will return no results if no
		 * {@link workspace.workspaceFolders workspace folders} are opened.
		 */
		export function findFiles2(filePattern: GlobPattern, options?: FindFiles2Options, token?: CancellationToken): Thenable<Uri[]>;
	}
}
