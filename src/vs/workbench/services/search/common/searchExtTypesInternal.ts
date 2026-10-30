/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FileSearchProviderFolderOptions, FileSearchProviderOptions, TextSearchProviderFolderOptions, TextSearchProviderOptions } from './searchExtTypes.js';

interface RipgrepSearchOptionsCommon {
	numThreads?: number;
}

/**
 * Folder options of the built-in ripgrep text search provider.
 */
export interface TextSearchProviderFolderOptionsRipgrep extends TextSearchProviderFolderOptions {

	/**
	 * The patterns of the enabled `!`-prefixed exclude exceptions, without the `!`.
	 * Only set for providers that declare {@link IExcludeExceptionsTextSearchProvider}.
	 */
	excludeExceptions?: string[];

	/**
	 * The other folders of the query that are inside this folder, relative to it. They are searched
	 * on their own, so the search for exclude exceptions skips them. Set with {@link excludeExceptions}.
	 */
	nestedFolders?: string[];
}

/**
 * A text search provider that can search the paths that exclude exceptions re-include.
 */
export interface IExcludeExceptionsTextSearchProvider {
	readonly supportsExcludeExceptions: true;
}

export function supportsExcludeExceptions(provider: object): provider is IExcludeExceptionsTextSearchProvider {
	return (provider as Partial<IExcludeExceptionsTextSearchProvider>).supportsExcludeExceptions === true;
}

export type TextSearchProviderOptionsRipgrep = Omit<Partial<TextSearchProviderOptions>, 'folderOptions'> & {
	folderOptions: TextSearchProviderFolderOptionsRipgrep;
};

export type FileSearchProviderOptionsRipgrep = & {
	folderOptions: FileSearchProviderFolderOptions;
} & FileSearchProviderOptions;

export interface RipgrepTextSearchOptions extends TextSearchProviderOptionsRipgrep, RipgrepSearchOptionsCommon { }

export interface RipgrepFileSearchOptions extends FileSearchProviderOptionsRipgrep, RipgrepSearchOptionsCommon { }
