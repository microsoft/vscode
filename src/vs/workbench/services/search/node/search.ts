/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import * as glob from 'vs/base/common/glob';
import { IFileSearchStats, IFolderQuery, IProgress, IRawFileQuery, IRawTextQuery, ISearchEngineStats, ISearchQuery, ITextSearchMatch, ITextSearchStats, ITextSearchResult } from 'vs/platform/search/common/search';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';

export interface ITelemetryEvent {
	eventName: string;
	data: ITelemetryData;
}

export interface IRawSearchService {
	fileSearch(search: IRawFileQuery): Event<ISerializedSearchProgressItem | ISerializedSearchComplete>;
	textSearch(search: IRawTextQuery): Event<ISerializedSearchProgressItem | ISerializedSearchComplete>;
	clearCache(cacheKey: string): Promise<void>;
}

export interface IRawFileMatch {
	base?: string;
	relativePath: string;
	basename: string;
	size?: number;
}

export interface ISearchEngine<T> {
	search: (onResult: (matches: T) => void, onProgress: (progress: IProgress) => void, done: (error: Error | null, complete: ISearchEngineSuccess) => void) => void;
	cancel: () => void;
}

export interface ISerializedSearchSuccess {
	type: 'success';
	limitHit: boolean;
	stats: IFileSearchStats | ITextSearchStats | null;
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

export function isSerializedFileMatch(arg: ISerializedSearchProgressItem): arg is ISerializedFileMatch {
	return !!(<ISerializedFileMatch>arg).path;
}

export interface ISerializedFileMatch {
	path?: string;
	results?: ITextSearchResult[];
	numMatches?: number;
}

// Type of the possible values for progress calls from the engine
export type ISerializedSearchProgressItem = ISerializedFileMatch | ISerializedFileMatch[] | IProgress;
export type IFileSearchProgressItem = IRawFileMatch | IRawFileMatch[] | IProgress;


export class FileMatch implements ISerializedFileMatch {
	path: string;
	results: ITextSearchMatch[];

	constructor(path: string) {
		this.path = path;
		this.results = [];
	}

	addMatch(match: ITextSearchMatch): void {
		this.results.push(match);
	}

	serialize(): ISerializedFileMatch {
		return {
			path: this.path,
			results: this.results,
			numMatches: this.results.length
		};
	}
}

/**
 *  Computes the patterns that the provider handles. Discards sibling clauses and 'false' patterns
 */
export function resolvePatternsForProvider(globalPattern: glob.IExpression | undefined, folderPattern: glob.IExpression | undefined): string[] {
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
		let includeExpression: glob.IExpression | undefined = config.includePattern;
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
	includedInQuerySync(testPath: string, basename?: string, hasSibling?: (name: string) => boolean): boolean {
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
	includedInQuery(testPath: string, basename?: string, hasSibling?: (name: string) => boolean | Promise<boolean>): Promise<boolean> {
		const excludeP = this._parsedExcludeExpression ?
			Promise.resolve(this._parsedExcludeExpression(testPath, basename, hasSibling)).then(result => !!result) :
			Promise.resolve(false);

		return excludeP.then(excluded => {
			if (excluded) {
				return false;
			}

			return this._parsedIncludeExpression ?
				Promise.resolve(this._parsedIncludeExpression(testPath, basename, hasSibling)).then(result => !!result) :
				Promise.resolve(true);
		}).then(included => {
			return included;
		});
	}

	hasSiblingExcludeClauses(): boolean {
		return hasSiblingClauses(this._excludeExpression);
	}
}

function hasSiblingClauses(pattern: glob.IExpression): boolean {
	for (const key in pattern) {
		if (typeof pattern[key] !== 'boolean') {
			return true;
		}
	}

	return false;
}
