/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface FindFilesTargetOptions {
		/**
		 * A {@link GlobPattern glob pattern} that defines files and folders to exclude. The glob pattern
		 * will be matched against the file paths of resulting matches relative to their workspace.
		 */
		exclude?: GlobPattern;

		/**
		 * Which settings to follow when searching for files. Defaults to {@link ExcludeSettingOptions.searchAndFilesExclude}.
		 */
		useExcludeSettings?: ExcludeSettingOptions;

		/**
		 * Which file locations we should look for ignore (.gitignore or .ignore) files to respect.
		 * When `undefined`, we will follow settings (or assume the value if only one is valid) using the value for the corresponding `search.use*IgnoreFiles` settting.
		 * Any time that `parent` or `global` is set to `true`, `local` must also be `true`.
		 * Will log an error if an invalid combination is set.
		 */
		useIgnoreFiles?: {
			/**
			 * Use ignore files at the current workspace root.
			 */
			local?: boolean;
			/**
			 * Use ignore files at the parent directory.
			 */
			parent?: boolean;
			/**
			 * Use global ignore files.
			 */
			global?: boolean;
		};

		/**
		 * Whether symlinks should be followed while searching.
		 * Defaults to the value for `search.followSymlinks` in settings.
		 * For more info, see the setting listed above.
		 */
		followSymlinks?: boolean;
	}

	export interface FindFiles2Options {
		/**
		 * options that dictate which files to target
		 */
		fileTargetOptions?: FindFilesTargetOptions;

		/**
		 * The maximum number of results to search for
		 */
		maxResults?: number;
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
