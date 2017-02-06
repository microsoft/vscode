/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import { mixin } from 'vs/base/common/objects';
import { IExpression } from 'vs/base/common/glob';
import { IFilesConfiguration } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ID = 'searchService';

export const ISearchService = createDecorator<ISearchService>(ID);

/**
 * A service that enables to search for files or with in files.
 */
export interface ISearchService {
	_serviceBrand: any;
	search(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem>;
	extendQuery(query: ISearchQuery): void;
	clearCache(cacheKey: string): TPromise<void>;
}

export interface IQueryOptions {
	folderResources?: uri[];
	extraFileResources?: uri[];
	filePattern?: string;
	excludePattern?: IExpression;
	includePattern?: IExpression;
	maxResults?: number;
	sortByScore?: boolean;
	cacheKey?: string;
	fileEncoding?: string;
}

export interface ISearchQuery extends IQueryOptions {
	type: QueryType;
	contentPattern?: IPatternInfo;
}

export enum QueryType {
	File = 1,
	Text = 2
}

export interface IPatternInfo {
	pattern: string;
	isRegExp?: boolean;
	isWordMatch?: boolean;
	isMultiline?: boolean;
	isCaseSensitive?: boolean;
}

export interface IFileMatch {
	resource?: uri;
	lineMatches?: ILineMatch[];
}

export interface ILineMatch {
	preview: string;
	lineNumber: number;
	offsetAndLengths: number[][];
}

export interface IProgress {
	total?: number;
	worked?: number;
}

export interface ISearchProgressItem extends IFileMatch, IProgress {
	// Marker interface to indicate the possible values for progress calls from the engine
}

export interface ISearchComplete {
	limitHit?: boolean;
	results: IFileMatch[];
	stats: ISearchStats;
}

export interface ISearchStats {
	fromCache: boolean;
	resultCount: number;
	unsortedResultTime?: number;
	sortedResultTime?: number;
}

export interface ICachedSearchStats extends ISearchStats {
	cacheLookupStartTime: number;
	cacheFilterStartTime: number;
	cacheLookupResultTime: number;
	cacheEntryCount: number;
	joined?: ISearchStats;
}

export interface IUncachedSearchStats extends ISearchStats {
	traversal: string;
	errors: string[];
	fileWalkStartTime: number;
	fileWalkResultTime: number;
	directoriesWalked: number;
	filesWalked: number;
	cmdForkStartTime?: number;
	cmdForkResultTime?: number;
	cmdResultCount?: number;
}


// ---- very simple implementation of the search model --------------------

export class FileMatch implements IFileMatch {
	public lineMatches: LineMatch[] = [];
	constructor(public resource: uri) {
		// empty
	}
}

export class LineMatch implements ILineMatch {
	constructor(public preview: string, public lineNumber: number, public offsetAndLengths: number[][]) {
		// empty
	}
}

export interface ISearchConfiguration extends IFilesConfiguration {
	search: {
		exclude: IExpression;
	};
}

export function getExcludes(configuration: ISearchConfiguration): IExpression {
	const fileExcludes = configuration && configuration.files && configuration.files.exclude;
	const searchExcludes = configuration && configuration.search && configuration.search.exclude;

	if (!fileExcludes && !searchExcludes) {
		return null;
	}

	if (!fileExcludes || !searchExcludes) {
		return fileExcludes || searchExcludes;
	}

	let allExcludes: IExpression = Object.create(null);
	allExcludes = mixin(allExcludes, fileExcludes);
	allExcludes = mixin(allExcludes, searchExcludes, true);

	return allExcludes;
}