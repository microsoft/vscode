/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import * as objects from 'vs/base/common/objects';
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

export interface IFolderQuery {
	folder: uri;
	excludePattern?: IExpression;
	includePattern?: IExpression;
	fileEncoding?: string;
}

export interface ICommonQueryOptions {
	extraFileResources?: uri[];
	filePattern?: string; // file search only
	fileEncoding?: string;
	maxResults?: number;
	sortByScore?: boolean;
	cacheKey?: string;
	useRipgrep?: boolean;
	disregardIgnoreFiles?: boolean;
	disregardExcludeSettings?: boolean;
}

export interface IQueryOptions extends ICommonQueryOptions {
	excludePattern?: string;
	includePattern?: string;
}

export interface ISearchQuery extends ICommonQueryOptions {
	type: QueryType;

	excludePattern?: IExpression;
	includePattern?: IExpression;
	contentPattern?: IPatternInfo;
	folderQueries?: IFolderQuery[];
}

export enum QueryType {
	File = 1,
	Text = 2
}

export interface IPatternInfo {
	pattern: string;
	isRegExp?: boolean;
	isWordMatch?: boolean;
	wordSeparators?: string;
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

export interface ISearchLog {
	message?: string;
}

export interface ISearchProgressItem extends IFileMatch, IProgress, ISearchLog {
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
		useRipgrep: boolean;
		useIgnoreFilesByDefault: boolean;
	};
	editor: {
		wordSeparators: string;
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
	allExcludes = objects.mixin(allExcludes, fileExcludes);
	allExcludes = objects.mixin(allExcludes, searchExcludes, true);

	return allExcludes;
}

export function getMergedExcludes(query: ISearchQuery, absolutePaths?: boolean): IExpression {
	const globalExcludePattern: IExpression = query.excludePattern || {};

	return query.folderQueries
		.map(folderQuery => {
			const mergedFolderExclude = objects.assign({}, globalExcludePattern, folderQuery.excludePattern || {});
			return absolutePaths ?
				makeExcludesAbsolute(mergedFolderExclude, folderQuery.folder) :
				mergedFolderExclude;
		});
}

function makeExcludesAbsolute(excludePattern: IExpression, rootFolder: uri) {
	return Object.keys(excludePattern)
		.reduce((absolutePattern: IExpression, key: string) => {
			const value = excludePattern[key];
			key = paths.join(rootFolder.fsPath, key);
			absolutePattern[key] = value;
			return absolutePattern;
		}, {});
}