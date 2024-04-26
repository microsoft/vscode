/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface FindFiles2Options {
		// note: this is just FindTextInFilesOptions without select properties (include, previewOptions, beforeContext, afterContext)

		/**
		 * A {@link GlobPattern glob pattern} that defines files and folders to exclude. The glob pattern
		 * will be matched against the file paths of resulting matches relative to their workspace.
		 */
		exclude?: GlobPattern;

		/**
		 * Which settings to follow when searching for files. Defaults to {@link ExcludeSettingOptions.searchAndFilesExclude}.
		 */
		excludeSettings?: ExcludeSettingOptions;

		/**
		 * The maximum number of results to search for
		 */
		maxResults?: number;

		/**
		 * Which file locations we should look for ignore (.gitignore or .ignore) files to follow.
		 * Defaults to {@link SearchIgnoreOptions.followSettings}.
		 */
		ignoreFilesToUse?: SearchIgnoreOptions;

		/**
		 * Whether symlinks should be followed while searching.
		 * Defaults to the value for `search.followSymlinks` in settings.
		 * For more info, see the setting listed above.
		 */
		followSymlinks?: boolean;

		/**
		 * If set to true, the `filePattern` arg will be fuzzy-searched instead of glob-searched.
		 * If `filePattern` is a {@link RelativePattern relative pattern}, then the fuzzy search will act on the `pattern` of the {@link RelativePattern RelativePattern}
		 */
		fuzzy?: boolean;
	}

	export enum ExcludeSettingOptions {
		/*
		 * Don't use any exclude settings.
		 */
		none,
		/*
		 * Use:
		 * - files.exclude setting
		 */
		filesExclude,
		/*
		 * Use:
		 * - files.exclude setting
		 * - search.exclude setting
		 */
		searchAndFilesExclude
	}

	/*
	 * Which locations of .gitignore and .ignore files to follow.
	*/
	export enum SearchIgnoreOptions {
		/*
		 * Don't use ignore files.
		 */
		none,
		/*
		 * Use:
		 * - ignore files at the workspace root.
		 */
		localOnly,
		/*
		 * Use:
		 * - ignore files at the workspace root.
		 *
		 * Follow `search.useParentIgnoreFiles`and `search.useGlobalIgnoreFiles` in settings
		 * to dictate whether to use parent and global ignore files.
		 */
		localAndFollowSettings,
		/*
		 * Use:
		 * - ignore files at the workspace root.
		 * - ignore files directly under parent folder(s) of the workspace root.
		 */
		localAndParent,
		/*
		 * Use:
		 * - ignore files at the workspace root.
		 * - global ignore files (e.g. $HOME/.config/git/ignore).
		 */
		localAndGlobal,
		/*
		 * Use:
		 * - ignore files at the workspace root.
		 * - ignore files directly under parent folder(s) of the workspace root.
		 * - global ignore files (e.g. $HOME/.config/git/ignore).
		 */
		all,
		/*
		* Follow `search.useIgnoreFiles`, `search.useParentIgnoreFiles`, and `search.useGlobalIgnoreFiles` in settings.
		*/
		followSettings,
	}

	/**
	 * Represents a session of a currently logged in user.
	 */
	export namespace workspace {
		/**
		 * Find files across all {@link workspace.workspaceFolders workspace folders} in the workspace.
		 *
		 * @example
		 * findFiles('**​/*.js', {exclude: '**​/out/**', useIgnoreFiles: true, maxResults: 10})
		 *
		 * @param filePattern A {@link GlobPattern glob pattern} that defines the files to search for. The glob pattern
		 * will be matched against the file paths of resulting matches relative to their workspace. Use a {@link RelativePattern relative pattern}
		 * to restrict the search results to a {@link WorkspaceFolder workspace folder}.
		 * @param options A set of {@link FindFiles2Options FindFiles2Options} that defines where and how to search (e.g. exclude settings).
		 * @param token A token that can be used to signal cancellation to the underlying search engine.
		 * @returns A thenable that resolves to an array of resource identifiers. Will return no results if no
		 * {@link workspace.workspaceFolders workspace folders} are opened.
		 */
		export function findFiles2(filePattern: GlobPattern, options?: FindFiles2Options, token?: CancellationToken): Thenable<Uri[]>;
	}
}
