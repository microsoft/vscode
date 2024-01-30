/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
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
		 * @param include A {@link GlobPattern glob pattern} that defines the files to search for. The glob pattern
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
		export function findFiles2(include: GlobPattern, exclude?: GlobPattern | { useDefaultExclude: boolean; additionalExclude?: GlobPattern }, maxResults?: number, token?: CancellationToken): Thenable<Uri[]>;
	}
}
