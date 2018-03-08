/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import { IExpression } from 'vs/base/common/glob';
import { IProgress, ILineMatch, IPatternInfo, ISearchStats } from 'vs/platform/search/common/search';
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
}

export interface ITelemetryEvent {
	eventName: string;
	data: ITelemetryData;
}

export interface IRawSearchService {
	fileSearch(search: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>;
	textSearch(search: IRawSearch): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>;
	clearCache(cacheKey: string): TPromise<void>;
	fetchTelemetry(): PPromise<void, ITelemetryEvent>;
}

export interface IRawFileMatch {
	base?: string;
	relativePath: string;
	basename: string;
	size?: number;
}

export interface ISearchEngine<T> {
	search: (onResult: (matches: T) => void, onProgress: (progress: IProgress) => void, done: (error: Error, complete: ISerializedSearchComplete) => void) => void;
	cancel: () => void;
}

export interface ISerializedSearchComplete {
	limitHit: boolean;
	stats: ISearchStats;
}

export interface ISerializedFileMatch {
	path: string;
	lineMatches?: ILineMatch[];
	numMatches?: number;
}

// Type of the possible values for progress calls from the engine
export type ISerializedSearchProgressItem = ISerializedFileMatch | ISerializedFileMatch[] | IProgress;
export type IFileSearchProgressItem = IRawFileMatch | IRawFileMatch[] | IProgress;


export class FileMatch implements ISerializedFileMatch {
	path: string;
	lineMatches: LineMatch[];

	constructor(path: string) {
		this.path = path;
		this.lineMatches = [];
	}

	addMatch(lineMatch: LineMatch): void {
		this.lineMatches.push(lineMatch);
	}

	serialize(): ISerializedFileMatch {
		let lineMatches: ILineMatch[] = [];
		let numMatches = 0;

		for (let i = 0; i < this.lineMatches.length; i++) {
			numMatches += this.lineMatches[i].offsetAndLengths.length;
			lineMatches.push(this.lineMatches[i].serialize());
		}

		return {
			path: this.path,
			lineMatches,
			numMatches
		};
	}
}

export class LineMatch implements ILineMatch {
	preview: string;
	lineNumber: number;
	offsetAndLengths: number[][];

	constructor(preview: string, lineNumber: number) {
		this.preview = preview.replace(/(\r|\n)*$/, '');
		this.lineNumber = lineNumber;
		this.offsetAndLengths = [];
	}

	addMatch(offset: number, length: number): void {
		this.offsetAndLengths.push([offset, length]);
	}

	serialize(): ILineMatch {
		const result = {
			preview: this.preview,
			lineNumber: this.lineNumber,
			offsetAndLengths: this.offsetAndLengths
		};

		return result;
	}
}