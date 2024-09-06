/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import { FileSearchProviderFolderOptions, FileSearchProviderOptions, TextSearchProviderFolderOptions, TextSearchProviderOptions, Range } from './searchExtTypes.js';

interface RipgrepSearchOptionsCommon {
	numThreads?: number;
}

export type TextSearchProviderOptionsRipgrep = Omit<Partial<TextSearchProviderOptions>, 'folderOptions'> & {
	folderOptions: TextSearchProviderFolderOptions;
};

export type FileSearchProviderOptionsRipgrep = & {
	folderOptions: FileSearchProviderFolderOptions;
} & FileSearchProviderOptions;

export interface RipgrepTextSearchOptions extends TextSearchProviderOptionsRipgrep, RipgrepSearchOptionsCommon { }

export interface RipgrepFileSearchOptions extends FileSearchProviderOptionsRipgrep, RipgrepSearchOptionsCommon { }

/**
 * The main match information for a {@link TextSearchResultNew}.
 */
export class RipgrepTextSearchMatch {
	/**
	 * @param uri The uri for the matching document.
	 * @param ranges The ranges associated with this match.
	 * @param previewText The text that is used to preview the match. The highlighted range in `previewText` is specified in `ranges`.
	 */
	constructor(
		public uri: URI,
		public ranges: { sourceRange: Range; previewRange: Range }[],
		public previewText: string) { }

}

/**
 * The potential context information for a {@link TextSearchResultNew}.
 */
export class RipgrepTextSearchContext {
	/**
	 * @param uri The uri for the matching document.
	 * @param text The line of context text.
	 * @param lineNumber The line number of this line of context.
	 */
	constructor(
		public uri: URI,
		public text: string,
		public lineNumber: number) { }
}

/**
 * A result payload for a text search, pertaining to matches within a single file.
 */
export type RipgrepTextSearchResult = RipgrepTextSearchMatch | RipgrepTextSearchContext;
