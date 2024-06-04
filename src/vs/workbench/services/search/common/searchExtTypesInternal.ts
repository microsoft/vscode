/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { FileSearchOptions, TextSearchOptions } from './searchExtTypes';

interface RipGrepSearchOptionsCommon {
	numThreads?: number;
}

export interface RipgrepTextSearchOptions extends TextSearchOptions, RipGrepSearchOptionsCommon { }

export interface RipgrepFileSearchOptions extends FileSearchOptions, RipGrepSearchOptionsCommon { }
