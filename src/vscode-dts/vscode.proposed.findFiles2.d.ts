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

		/**
		 * Whether to use the values for files.exclude. Defaults to true.
		 * @deprecated please use {@link FindFiles2Options.excludeSettings} instead.
		 * */
		useDefaultExcludes?: boolean;

		/**
		 * Whether to use the values for search.exclude. Defaults to true. Will not be followed if `useDefaultExcludes` is set to `false`.
		 * @deprecated please use {@link FindFiles2Options.excludeSettings} instead.
		 */
		useDefaultSearchExcludes?: boolean;

		/**
		 * Whether external files that exclude files, like .gitignore, should be respected.
		 * Defaults to the value for `search.useIgnoreFiles` in settings.
		 * For more info, see the setting listed above.
		 * @deprecated please use {@link FindFiles2Options.ignoreFilesToUse} instead.
		 */
		useIgnoreFiles?: boolean;

		/**
		 * Whether global files that exclude files, like .gitignore, should be respected.
		 * Must set `useIgnoreFiles` to `true` to use this.
		 * Defaults to the value for `search.useGlobalIgnoreFiles` in settings.
		 * For more info, see the setting listed above.
		 * @deprecated please use {@link FindFiles2Options.ignoreFilesToUse} instead.
		 */
		useGlobalIgnoreFiles?: boolean;

		/**
		 * Whether files in parent directories that exclude files, like .gitignore, should be respected.
		 * Must set `useIgnoreFiles` to `true` to use this.
		 * Defaults to the value for `search.useParentIgnoreFiles` in settings.
		 * For more info, see the setting listed above.
		 * @deprecated please use {@link FindFiles2Options.ignoreFilesToUse} instead.
		 */
		useParentIgnoreFiles?: boolean;
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

	/*
	 * Which locations of .gitignore and .ignore files to follow when searching.
	*/
	export enum SearchIgnoreOptions {
		/*
		 * Don't use ignore files.
		 */
		none = 1,
		/*
		 * Use:
		 * - ignore files at the workspace root.
		 */
		localOnly = 2,
		/*
		 * Use:
		 * - ignore files at the workspace root.
		 *
		 * Follow `search.useParentIgnoreFiles`and `search.useGlobalIgnoreFiles` in settings
		 * to dictate whether to use parent and global ignore files.
		 */
		localAndFollowSettings = 3,
		/*
		 * Use:
		 * - ignore files at the workspace root.
		 * - ignore files directly under parent folder(s) of the workspace root.
		 */
		localAndParent = 4,
		/*
		 * Use:
		 * - ignore files at the workspace root.
		 * - global ignore files (e.g. $HOME/.config/git/ignore).
		 */
		localAndGlobal = 5,
		/*
		 * Use:
		 * - ignore files at the workspace root.
		 * - ignore files directly under parent folder(s) of the workspace root.
		 * - global ignore files (e.g. $HOME/.config/git/ignore).
		 */
		all = 6,
		/*
		* Follow `search.useIgnoreFiles`, `search.useParentIgnoreFiles`, and `search.useGlobalIgnoreFiles` in settings.
		*/
		followSettings = 7,
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
