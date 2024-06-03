/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { FileSearchOptions, TextSearchOptions } from './searchExtTypes';

interface SearchOptionsExtendedCommon {
	numThreads?: number;
}

export interface TextSearchOptionsExtended extends TextSearchOptions, SearchOptionsExtendedCommon { }

export interface FileSearchOpionsExtended extends FileSearchOptions, SearchOptionsExtendedCommon { }
