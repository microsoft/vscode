/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Event } from 'vs/base/common/event';
import * as glob from 'vs/base/common/glob';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import * as paths from 'vs/base/common/paths';
import uri, { UriComponents } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFilesConfiguration } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const VIEW_ID = 'workbench.view.search';

export const ISearchHistoryService = createDecorator<ISearchHistoryService>('searchHistoryService');
export const ISearchService = createDecorator<ISearchService>('searchService');

/**
 * A service that enables to search for files or with in files.
 */
export interface ISearchService {
	_serviceBrand: any;
	search(query: ISearchQuery, onProgress?: (result: ISearchProgressItem) => void): TPromise<ISearchComplete>;
	extendQuery(query: ISearchQuery): void;
	clearCache(cacheKey: string): TPromise<void>;
	registerSearchResultProvider(scheme: string, type: SearchProviderType, provider: ISearchResultProvider): IDisposable;
}

export interface ISearchHistoryValues {
	search?: string[];
	replace?: string[];
	include?: string[];
	exclude?: string[];
}

export interface ISearchHistoryService {
	_serviceBrand: any;
	onDidClearHistory: Event<void>;
	clearHistory(): void;
	load(): ISearchHistoryValues;
	save(history: ISearchHistoryValues): void;
}

/**
 * TODO@roblou - split text from file search entirely, or share code in a more natural way.
 */
export enum SearchProviderType {
	file,
	fileIndex,
	text
}

export interface ISearchResultProvider {
	search(query: ISearchQuery, onProgress?: (p: ISearchProgressItem) => void): TPromise<ISearchComplete>;
	clearCache(cacheKey: string): TPromise<void>;
}

export interface IFolderQuery<U extends UriComponents=uri> {
	folder: U;
	excludePattern?: glob.IExpression;
	includePattern?: glob.IExpression;
	fileEncoding?: string;
	disregardIgnoreFiles?: boolean;
}

export interface ICommonQueryOptions<U> {
	extraFileResources?: U[];
	filePattern?: string; // file search only
	fileEncoding?: string;
	maxResults?: number;
	/**
	 * If true no results will be returned. Instead `limitHit` will indicate if at least one result exists or not.
	 *
	 * Currently does not work with queries including a 'siblings clause'.
	 */
	exists?: boolean;
	sortByScore?: boolean;
	cacheKey?: string;
	useRipgrep?: boolean;
	disregardIgnoreFiles?: boolean;
	disregardExcludeSettings?: boolean;
	ignoreSymlinks?: boolean;
	maxFileSize?: number;
}

export interface IQueryOptions extends ICommonQueryOptions<uri> {
	excludePattern?: string;
	includePattern?: string;
}

export interface ISearchQueryProps<U extends UriComponents> extends ICommonQueryOptions<U> {
	type: QueryType;

	excludePattern?: glob.IExpression;
	includePattern?: glob.IExpression;
	contentPattern?: IPatternInfo;
	folderQueries?: IFolderQuery<U>[];
	usingSearchPaths?: boolean;
}

export type ISearchQuery = ISearchQueryProps<uri>;
export type IRawSearchQuery = ISearchQueryProps<UriComponents>;

export enum QueryType {
	File = 1,
	Text = 2
}
/* __GDPR__FRAGMENT__
	"IPatternInfo" : {
		"pattern" : { "classification": "CustomerContent", "purpose": "FeatureInsight" },
		"isRegExp": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
		"isWordMatch": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
		"wordSeparators": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"isMultiline": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
		"isCaseSensitive": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
		"isSmartCase": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
	}
*/
export interface IPatternInfo {
	pattern: string;
	isRegExp?: boolean;
	isWordMatch?: boolean;
	wordSeparators?: string;
	isMultiline?: boolean;
	isCaseSensitive?: boolean;
	isSmartCase?: boolean;
}

export interface IFileMatch<U extends UriComponents = uri> {
	resource?: U;
	lineMatches?: ILineMatch[];
}

export type IRawFileMatch2 = IFileMatch<UriComponents>;

export interface ILineMatch {
	preview: string;
	lineNumber: number;
	offsetAndLengths: number[][];
}

export interface IProgress {
	total?: number;
	worked?: number;
	message?: string;
}

export interface ISearchProgressItem extends IFileMatch, IProgress {
	// Marker interface to indicate the possible values for progress calls from the engine
}

export interface ISearchCompleteStats {
	limitHit?: boolean;
	stats?: IFileSearchStats;
}

export interface ISearchComplete extends ISearchCompleteStats {
	results: IFileMatch[];
}

export interface IFileSearchStats {
	fromCache: boolean;
	detailStats: ISearchEngineStats | ICachedSearchStats | IFileSearchProviderStats | IFileIndexProviderStats;

	resultCount: number;
	type: 'fileIndexProver' | 'fileSearchProvider' | 'searchProcess';
	sortingTime?: number;
}

export interface ICachedSearchStats {
	cacheWasResolved: boolean;
	cacheLookupTime: number;
	cacheFilterTime: number;
	cacheEntryCount: number;
}

export interface ISearchEngineStats {
	traversal: string;
	fileWalkTime: number;
	directoriesWalked: number;
	filesWalked: number;
	cmdTime: number;
	cmdResultCount?: number;
}

export interface IFileSearchProviderStats {
	providerTime: number;
	postProcessTime: number;
}

export interface IFileIndexProviderStats {
	providerTime: number;
	providerResultCount: number;
	fileWalkTime: number;
	directoriesWalked: number;
	filesWalked: number;
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

export interface ISearchConfigurationProperties {
	exclude: glob.IExpression;
	useRipgrep: boolean;
	/**
	 * Use ignore file for file search.
	 */
	useIgnoreFiles: boolean;
	followSymlinks: boolean;
	smartCase: boolean;
	globalFindClipboard: boolean;
	location: 'sidebar' | 'panel';
}

export interface ISearchConfiguration extends IFilesConfiguration {
	search: ISearchConfigurationProperties;
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
	// clone the config as it could be frozen
	allExcludes = objects.mixin(allExcludes, objects.deepClone(fileExcludes));
	allExcludes = objects.mixin(allExcludes, objects.deepClone(searchExcludes), true);

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
