/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { PPromise } from 'vs/base/common/winjs.base';
import glob = require('vs/base/common/glob');
import { IProgress, ILineMatch, IPatternInfo } from 'vs/platform/search/common/search';

export interface IRawSearch {
	rootFolders: string[];
	extraFiles?: string[];
	filePattern?: string;
	excludePattern?: glob.IExpression;
	includePattern?: glob.IExpression;
	contentPattern?: IPatternInfo;
	maxResults?: number;
	maxFilesize?: number;
	fileEncoding?: string;
}

export interface IRawSearchService {
	fileSearch(search: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>;
	textSearch(search: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>;
}

export interface ISearchEngine {
	search: (onResult: (match: ISerializedFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, isLimitHit: boolean) => void) => void;
	cancel: () => void;
}

export interface ISerializedSearchComplete {
	limitHit: boolean;
}

export interface ISerializedFileMatch {
	path?: string;
	lineMatches?: ILineMatch[];
}

export interface ISerializedSearchProgressItem extends ISerializedFileMatch, IProgress {
	// Marker interface to indicate the possible values for progress calls from the engine
}
