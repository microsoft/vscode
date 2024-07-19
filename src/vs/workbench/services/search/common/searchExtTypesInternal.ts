/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from 'vs/base/common/uri';
import { GlobPattern } from 'vs/workbench/services/search/common/searchExtTypes';

interface RipgrepSearchOptionsCommon {
	numThreads?: number;
}

export interface FolderOptions {
	/**
	 * The root folder to search within.
	 */
	folder: URI;

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
		 * Use ignore files at the parent directory. If set, {@link TextSearchProviderOptionsNew.useIgnoreFiles.local} should also be `true`.
		 */
		parent: boolean;
		/**
		 * Use global ignore files. If set, {@link TextSearchProviderOptionsNew.useIgnoreFiles.local} should also be `true`.
		 */
		global: boolean;
	};
}

export interface TextSearchProviderOptionsRipgrep {

	folderOptions: FolderOptions;

	/**
	 * The maximum number of results to be returned.
	 */
	maxResults: number;

	/**
	 * Options to specify the size of the result text preview.
	 */
	previewOptions: {
		/**
		 * The maximum number of lines in the preview.
		 * Only search providers that support multiline search will ever return more than one line in the match.
		 */
		matchLines: number;

		/**
		 * The maximum number of characters included per line.
		 */
		charsPerLine: number;
	};

	/**
	 * Exclude files larger than `maxFileSize` in bytes.
	 */
	maxFileSize: number;

	/**
	 * Interpret files using this encoding.
	 * See the vscode setting `"files.encoding"`
	 */
	encoding: string;

	/**
	 * Number of lines of context to include before and after each match.
	 */
	surroundingContext: number;
}

export interface FileSearchProviderOptionsRipgrep {
	folderOptions: FolderOptions;

	/**
	 * An object with a lifespan that matches the session's lifespan. If the provider chooses to, this object can be used as the key for a cache,
	 * and searches with the same session object can search the same cache. When the token is cancelled, the session is complete and the cache can be cleared.
	 */
	session: unknown;

	/**
	 * The maximum number of results to be returned.
	 */
	maxResults: number;
}

export interface RipgrepTextSearchOptions extends TextSearchProviderOptionsRipgrep, RipgrepSearchOptionsCommon { }

export interface RipgrepFileSearchOptions extends FileSearchProviderOptionsRipgrep, RipgrepSearchOptionsCommon { }
