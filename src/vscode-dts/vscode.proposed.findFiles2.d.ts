/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 2

declare module 'vscode' {

	export interface FindFiles2Options {
		/**
		 * An array of {@link GlobPattern} that defines files to exclude.
		 * The glob patterns will be matched against the file paths of files relative to their workspace or {@link RelativePattern}'s `baseUri` if applicable.
		 *
		 * If more than one value is used, the values are combined with a logical AND.
		 * For example, consider the following code:
		 *
		 * ```ts
		 * const ab = findFiles(['**​/*.js'], {exclude: ['*.ts', '*.js']});
		 * const a = findFiles(['**​/*.js'], {exclude: ['*.ts']});
		 * const b = findFiles(['**​/*.js'], {exclude: ['*.js']});
		 * ```
		 *
		 * In this, `ab` will be the intersection of results from `a` and `b`.
		 */
		exclude?: GlobPattern[];

		/**
		 * Which settings to follow when searching for files. Defaults to `ExcludeSettingOptions.searchAndFilesExclude`.
		 */
		useExcludeSettings?: ExcludeSettingOptions;

		/**
		 * The maximum number of results to search for. Defaults to 20000 results.
		 */
		maxResults?: number;

		/**
		 * Which file locations have ignore (`.gitignore` or `.ignore`) files to follow.
		 *
		 * When any of these fields are `undefined`, the value will either be assumed (e.g. if only one is valid),
		 * or it will follow settings based on the corresponding `search.use*IgnoreFiles` setting.
		 *
		 * Will log an error if an invalid combination is set.
		 *
		 * Although `.ignore` files are uncommon, they can be leveraged if there are patterns
		 * that should not be known to git, but should be known to the search providers.
		 * They should be in the same locations where `.gitignore` files are found, and they follow the same format.
		 */
		useIgnoreFiles?: {
			/**
			 * Use ignore files at the current workspace root.
			 * May default to `search.useIgnoreFiles` setting if not set.
			 */
			local?: boolean;
			/**
			 * Use ignore files at the parent directory. When set to `true`, {@link FindFiles2Options.useIgnoreFiles.local} must also be `true`.
			 * May default to `search.useParentIgnoreFiles` setting if not set.
			 */
			parent?: boolean;
			/**
			 * Use global ignore files. When set to `true`, {@link FindFiles2Options.useIgnoreFiles.local} must also be `true`.
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
	}

	/**
	 * Options for following search.exclude and files.exclude settings.
	 */
	export enum ExcludeSettingOptions {
		/**
		 * Don't use any exclude settings.
		 */
		None = 1,
		/**
		 * Use the `files.exclude` setting
		 */
		FilesExclude = 2,
		/**
		 * Use the `files.exclude` and `search.exclude` settings
		 */
		SearchAndFilesExclude = 3
	}

	export namespace workspace {
		/**
		 * Find files across all {@link workspace.workspaceFolders workspace folders} in the workspace.
		 *
		 * @example
		 * findFiles(['**​/*.js'], {exclude: ['**​/out/**'], useIgnoreFiles: true, maxResults: 10})
		 *
		 * @param filePattern An array of {@link GlobPattern GlobPattern} that defines the files to search for.
		 * The glob patterns will be matched against the file paths of files relative to their workspace or {@link baseUri GlobPattern.baseUri} if applicable.
		 * Use a {@link RelativePattern RelativePatten} to restrict the search results to a {@link WorkspaceFolder workspace folder}.
		 *
		 * If more than one value is used, the values are combined with a logical OR.
		 *
		 * For example, consider the following code:
		 *
		 * ```ts
		 * const ab = findFiles(['*.ts', '*.js']);
		 * const a = findFiles(['**​/*.ts']);
		 * const b = findFiles(['**​/*.js']);
		 * ```
		 *
		 * In this, `ab` will be the union of results from `a` and `b`.
		 * @param options A set of {@link FindFiles2Options FindFiles2Options} that defines where and how to search (e.g. exclude settings).
		 * @param token A token that can be used to signal cancellation to the underlying search engine.
		 * @returns A thenable that resolves to an array of resource identifiers. Will return no results if no
		 * {@link workspace.workspaceFolders workspace folders} are opened.
		 */
		export function findFiles2(filePattern: GlobPattern[], options?: FindFiles2Options, token?: CancellationToken): Thenable<Uri[]>;
	}
}
