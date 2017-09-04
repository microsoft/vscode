/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import * as objects from 'vs/base/common/objects';
import * as paths from 'vs/base/common/paths';
import * as glob from 'vs/base/common/glob';
import { IFilesConfiguration } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';

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
	registerSearchResultProvider(provider: ISearchResultProvider): IDisposable;
}

export interface ISearchResultProvider {
	search(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem>;
}

export interface IFolderQuery {
	folder: uri;
	excludePattern?: glob.IExpression;
	includePattern?: glob.IExpression;
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

	excludePattern?: glob.IExpression;
	includePattern?: glob.IExpression;
	contentPattern?: IPatternInfo;
	folderQueries?: IFolderQuery[];
	usingSearchPaths?: boolean;
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
		exclude: glob.IExpression;
		useRipgrep: boolean;
		useIgnoreFilesByDefault: boolean;
	};
	editor: {
		wordSeparators: string;
	};
}

export function getExcludes(configuration: ISearchConfiguration): glob.IExpression {
	const fileExcludes = configuration && configuration.files && configuration.files.exclude;
	const searchExcludes = configuration && configuration.search && configuration.search.exclude;

	if (!fileExcludes && !searchExcludes) {
		return undefined;
	}

	if (!fileExcludes || !searchExcludes) {
		return fileExcludes || searchExcludes;
	}

	let allExcludes: glob.IExpression = Object.create(null);
	allExcludes = objects.mixin(allExcludes, fileExcludes);
	allExcludes = objects.mixin(allExcludes, searchExcludes, true);

	return allExcludes;
}

export function pathIncludedInQuery(query: ISearchQuery, fsPath: string): boolean {
	if (query.excludePattern && glob.match(query.excludePattern, fsPath)) {
		return false;
	}

	if (query.includePattern && !glob.match(query.includePattern, fsPath)) {
		return false;
	}

	// If searchPaths are being used, the extra file must be in a subfolder and match the pattern, if present
	if (query.usingSearchPaths) {
		return query.folderQueries.every(fq => {
			const searchPath = fq.folder.fsPath;
			if (paths.isEqualOrParent(fsPath, searchPath)) {
				return !fq.includePattern || !!glob.match(fq.includePattern, fsPath);
			} else {
				return false;
			}
		});
	}

	return true;
}
