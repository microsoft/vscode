/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import * as glob from 'vs/base/common/glob';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFileSearchStats, IPatternInfo, IProgress, ISearchEngineStats, ITextSearchPreviewOptions, ITextSearchResult, ITextSearchStats, ISearchQuery, IFolderQuery } from 'vs/platform/search/common/search';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';

export interface IFolderSearch {
	folder: string;
	excludePattern?: glob.IExpression;
	includePattern?: glob.IExpression;
	fileEncoding?: string;
	disregardIgnoreFiles?: boolean;
	disregardGlobalIgnoreFiles?: boolean;
}

export interface IRawSearch {
	folderQueries: IFolderSearch[];
	ignoreSymlinks?: boolean;
	extraFiles?: string[];
	filePattern?: string;
	excludePattern?: glob.IExpression;
	includePattern?: glob.IExpression;
	contentPattern?: IPatternInfo;
	maxResults?: number;
	exists?: boolean;
	sortByScore?: boolean;
	cacheKey?: string;
	maxFilesize?: number;
	useRipgrep?: boolean;
	disregardIgnoreFiles?: boolean;
	previewOptions?: ITextSearchPreviewOptions;
	disregardGlobalIgnoreFiles?: boolean;
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

/**
 *  Computes the patterns that the provider handles. Discards sibling clauses and 'false' patterns
 */
export function resolvePatternsForProvider(globalPattern: glob.IExpression, folderPattern: glob.IExpression): string[] {
	const merged = {
		...(globalPattern || {}),
		...(folderPattern || {})
	};

	return Object.keys(merged)
		.filter(key => {
			const value = merged[key];
			return typeof value === 'boolean' && value;
		});
}

export class QueryGlobTester {

	private _excludeExpression: glob.IExpression;
	private _parsedExcludeExpression: glob.ParsedExpression;

	private _parsedIncludeExpression: glob.ParsedExpression;

	constructor(config: ISearchQuery, folderQuery: IFolderQuery) {
		this._excludeExpression = {
			...(config.excludePattern || {}),
			...(folderQuery.excludePattern || {})
		};
		this._parsedExcludeExpression = glob.parse(this._excludeExpression);

		// Empty includeExpression means include nothing, so no {} shortcuts
		let includeExpression: glob.IExpression = config.includePattern;
		if (folderQuery.includePattern) {
			if (includeExpression) {
				includeExpression = {
					...includeExpression,
					...folderQuery.includePattern
				};
			} else {
				includeExpression = folderQuery.includePattern;
			}
		}

		if (includeExpression) {
			this._parsedIncludeExpression = glob.parse(includeExpression);
		}
	}

	/**
	 * Guaranteed sync - siblingsFn should not return a promise.
	 */
	public includedInQuerySync(testPath: string, basename?: string, hasSibling?: (name: string) => boolean): boolean {
		if (this._parsedExcludeExpression && this._parsedExcludeExpression(testPath, basename, hasSibling)) {
			return false;
		}

		if (this._parsedIncludeExpression && !this._parsedIncludeExpression(testPath, basename, hasSibling)) {
			return false;
		}

		return true;
	}

	/**
	 * Guaranteed async.
	 */
	public includedInQuery(testPath: string, basename?: string, hasSibling?: (name: string) => boolean | TPromise<boolean>): TPromise<boolean> {
		const excludeP = this._parsedExcludeExpression ?
			TPromise.as(this._parsedExcludeExpression(testPath, basename, hasSibling)).then(result => !!result) :
			TPromise.wrap(false);

		return excludeP.then(excluded => {
			if (excluded) {
				return false;
			}

			return this._parsedIncludeExpression ?
				TPromise.as(this._parsedIncludeExpression(testPath, basename, hasSibling)).then(result => !!result) :
				TPromise.wrap(true);
		}).then(included => {
			return included;
		});
	}

	public hasSiblingExcludeClauses(): boolean {
		return hasSiblingClauses(this._excludeExpression);
	}
}

function hasSiblingClauses(pattern: glob.IExpression): boolean {
	for (let key in pattern) {
		if (typeof pattern[key] !== 'boolean') {
			return true;
		}
	}

	return false;
}
