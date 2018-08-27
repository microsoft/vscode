/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event } from 'vs/base/common/event';
import { IExpression } from 'vs/base/common/glob';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFileSearchStats, IPatternInfo, IProgress, ISearchEngineStats, ITextSearchPreviewOptions, ITextSearchResult, ITextSearchStats } from 'vs/platform/search/common/search';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';

export interface IFolderSearch {
	folder: string;
	excludePattern?: IExpression;
	includePattern?: IExpression;
	fileEncoding?: string;
	disregardIgnoreFiles?: boolean;
}

export interface IRawSearch {
	folderQueries: IFolderSearch[];
	ignoreSymlinks?: boolean;
	extraFiles?: string[];
	filePattern?: string;
	excludePattern?: IExpression;
	includePattern?: IExpression;
	contentPattern?: IPatternInfo;
	maxResults?: number;
	exists?: boolean;
	sortByScore?: boolean;
	cacheKey?: string;
	maxFilesize?: number;
	useRipgrep?: boolean;
	disregardIgnoreFiles?: boolean;
	previewOptions?: ITextSearchPreviewOptions;
}

export interface ITelemetryEvent {
	eventName: string;
	data: ITelemetryData;
}

export interface IRawSearchService {
	fileSearch(search: IRawSearch): Event<ISerializedSearchProgressItem | ISerializedSearchComplete>;
	textSearch(search: IRawSearch): Event<ISerializedSearchProgressItem | ISerializedSearchComplete>;
	clearCache(cacheKey: string): TPromise<void>;
}

export interface IRawFileMatch {
	base?: string;
	relativePath: string;
	basename: string;
	size?: number;
}

export interface ISearchEngine<T> {
	search: (onResult: (matches: T) => void, onProgress: (progress: IProgress) => void, done: (error: Error, complete: ISearchEngineSuccess) => void) => void;
	cancel: () => void;
}

export interface ISerializedSearchSuccess {
	type: 'success';
	limitHit: boolean;
	stats: IFileSearchStats | ITextSearchStats;
}

export interface ISearchEngineSuccess {
	limitHit: boolean;
	stats: ISearchEngineStats;
}

export interface ISerializedSearchError {
	type: 'error';
	error: {
		message: string,
		stack: string
	};
}

export type ISerializedSearchComplete = ISerializedSearchSuccess | ISerializedSearchError;

export function isSerializedSearchComplete(arg: ISerializedSearchProgressItem | ISerializedSearchComplete): arg is ISerializedSearchComplete {
	if ((arg as any).type === 'error') {
		return true;
	} else if ((arg as any).type === 'success') {
		return true;
	} else {
		return false;
	}
}

export function isSerializedSearchSuccess(arg: ISerializedSearchComplete): arg is ISerializedSearchSuccess {
	return arg.type === 'success';
}

export interface ISerializedFileMatch {
	path: string;
	matches?: ITextSearchResult[];
	numMatches?: number;
}

// Type of the possible values for progress calls from the engine
export type ISerializedSearchProgressItem = ISerializedFileMatch | ISerializedFileMatch[] | IProgress;
export type IFileSearchProgressItem = IRawFileMatch | IRawFileMatch[] | IProgress;


export class FileMatch implements ISerializedFileMatch {
	path: string;
	matches: ITextSearchResult[];

	constructor(path: string) {
		this.path = path;
		this.matches = [];
	}

	addMatch(match: ITextSearchResult): void {
		this.matches.push(match);
	}

	serialize(): ISerializedFileMatch {
		return {
			path: this.path,
			matches: this.matches,
			numMatches: this.matches.length
		};
	}
}
