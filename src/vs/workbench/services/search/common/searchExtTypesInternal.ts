/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FileSearchProviderFolderOptions, FileSearchProviderOptions, TextSearchProviderFolderOptions, TextSearchProviderOptions } from './searchExtTypes.js';

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
