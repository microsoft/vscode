/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapArrayOrNot } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import * as glob from 'vs/base/common/glob';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import * as paths from 'vs/base/common/paths';
import { getNLines } from 'vs/base/common/strings';
import { URI, UriComponents } from 'vs/base/common/uri';
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
	textSearch(query: ITextQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete>;
	fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete>;
	extendQuery(query: ITextQuery | IFileQuery): void;
	clearCache(cacheKey: string): Promise<void>;
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
export const enum SearchProviderType {
	file,
	fileIndex,
	text
}

export interface ISearchResultProvider {
	textSearch(query: ITextQuery, onProgress?: (p: ISearchProgressItem) => void, token?: CancellationToken): Promise<ISearchComplete>;
	fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete>;
	clearCache(cacheKey: string): Promise<void>;
}

export interface IFolderQuery<U extends UriComponents=URI> {
	folder: U;
	excludePattern?: glob.IExpression;
	includePattern?: glob.IExpression;
	fileEncoding?: string;
	disregardIgnoreFiles?: boolean;
	disregardGlobalIgnoreFiles?: boolean;
	ignoreSymlinks?: boolean;
}

export interface ICommonQueryProps<U extends UriComponents> {
	/** For telemetry - indicates what is triggering the source */
	_reason?: string;

	folderQueries: IFolderQuery<U>[];
	includePattern?: glob.IExpression;
	excludePattern?: glob.IExpression;
	extraFileResources?: U[];

	useRipgrep?: boolean;
	maxResults?: number;
	usingSearchPaths?: boolean;
}

export interface IFileQueryProps<U extends UriComponents> extends ICommonQueryProps<U> {
	type: QueryType.File;
	filePattern?: string;

	// TODO: Remove this!
	disregardExcludeSettings?: boolean;

	/**
	 * If true no results will be returned. Instead `limitHit` will indicate if at least one result exists or not.
	 * Currently does not work with queries including a 'siblings clause'.
	 */
	exists?: boolean;
	sortByScore?: boolean;
	cacheKey?: string;
}

export interface ITextQueryProps<U extends UriComponents> extends ICommonQueryProps<U> {
	type: QueryType.Text;
	contentPattern: IPatternInfo;

	previewOptions?: ITextSearchPreviewOptions;
	maxFileSize?: number;
	usePCRE2?: boolean;
	afterContext?: number;
	beforeContext?: number;

	userDisabledExcludesAndIgnoreFiles?: boolean;
}

export type IFileQuery = IFileQueryProps<URI>;
export type IRawFileQuery = IFileQueryProps<UriComponents>;
export type ITextQuery = ITextQueryProps<URI>;
export type IRawTextQuery = ITextQueryProps<UriComponents>;

export type IRawQuery = IRawTextQuery | IRawFileQuery;
export type ISearchQuery = ITextQuery | IFileQuery;

export const enum QueryType {
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
}

export interface IExtendedExtensionSearchOptions {
	usePCRE2?: boolean;
}

export interface IFileMatch<U extends UriComponents = URI> {
	resource: U;
	results?: ITextSearchResult[];
}

export type IRawFileMatch2 = IFileMatch<UriComponents>;

export interface ITextSearchPreviewOptions {
	matchLines: number;
	charsPerLine: number;
}

export interface ISearchRange {
	readonly startLineNumber: number;
	readonly startColumn: number;
	readonly endLineNumber: number;
	readonly endColumn: number;
}

export interface ITextSearchResultPreview {
	text: string;
	matches: ISearchRange | ISearchRange[];
}

export interface ITextSearchMatch {
	uri?: URI;
	ranges: ISearchRange | ISearchRange[];
	preview: ITextSearchResultPreview;
}

export interface ITextSearchContext {
	uri?: URI;
	text: string;
	lineNumber: number;
}

export type ITextSearchResult = ITextSearchMatch | ITextSearchContext;

export function resultIsMatch(result: ITextSearchResult): result is ITextSearchMatch {
	return !!(<ITextSearchMatch>result).preview;
}

export interface IProgress {
	total?: number;
	worked?: number;
	message?: string;
}

export type ISearchProgressItem = IFileMatch | IProgress;

export interface ISearchCompleteStats {
	limitHit?: boolean;
	stats?: IFileSearchStats | ITextSearchStats;
}

export interface ISearchComplete extends ISearchCompleteStats {
	results: IFileMatch[];
}

export interface ITextSearchStats {
	type: 'textSearchProvider' | 'searchProcess';
}

export interface IFileSearchStats {
	fromCache: boolean;
	detailStats: ISearchEngineStats | ICachedSearchStats | IFileSearchProviderStats | IFileIndexProviderStats;

	resultCount: number;
	type: 'fileIndexProvider' | 'fileSearchProvider' | 'searchProcess';
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

export class FileMatch implements IFileMatch {
	results: ITextSearchResult[] = [];
	constructor(public resource: URI) {
		// empty
	}
}

export class TextSearchMatch implements ITextSearchMatch {
	ranges: ISearchRange | ISearchRange[];
	preview: ITextSearchResultPreview;

	constructor(text: string, range: ISearchRange | ISearchRange[], previewOptions?: ITextSearchPreviewOptions) {
		this.ranges = range;

		if (previewOptions && previewOptions.matchLines === 1 && !Array.isArray(range)) {
			// 1 line preview requested
			text = getNLines(text, previewOptions.matchLines);
			const leadingChars = Math.floor(previewOptions.charsPerLine / 5);
			const previewStart = Math.max(range.startColumn - leadingChars, 0);
			const previewText = text.substring(previewStart, previewOptions.charsPerLine + previewStart);

			const endColInPreview = (range.endLineNumber - range.startLineNumber + 1) <= previewOptions.matchLines ?
				Math.min(previewText.length, range.endColumn - previewStart) :  // if number of match lines will not be trimmed by previewOptions
				previewText.length; // if number of lines is trimmed

			this.preview = {
				text: previewText,
				matches: new OneLineRange(0, range.startColumn - previewStart, endColInPreview)
			};
		} else {
			const firstMatchLine = Array.isArray(range) ? range[0].startLineNumber : range.startLineNumber;

			// n line, no preview requested, or multiple matches in the preview
			this.preview = {
				text,
				matches: mapArrayOrNot(range, r => new SearchRange(r.startLineNumber - firstMatchLine, r.startColumn, r.endLineNumber - firstMatchLine, r.endColumn))
			};
		}
	}
}

export class SearchRange implements ISearchRange {
	startLineNumber: number;
	startColumn: number;
	endLineNumber: number;
	endColumn: number;

	constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
		this.startLineNumber = startLineNumber;
		this.startColumn = startColumn;
		this.endLineNumber = endLineNumber;
		this.endColumn = endColumn;
	}
}

export class OneLineRange extends SearchRange {
	constructor(lineNumber: number, startColumn: number, endColumn: number) {
		super(lineNumber, startColumn, lineNumber, endColumn);
	}
}

export interface ISearchConfigurationProperties {
	exclude: glob.IExpression;
	useRipgrep: boolean;
	useLegacySearch: boolean;
	/**
	 * Use ignore file for file search.
	 */
	useIgnoreFiles: boolean;
	useGlobalIgnoreFiles: boolean;
	followSymlinks: boolean;
	smartCase: boolean;
	globalFindClipboard: boolean;
	location: 'sidebar' | 'panel';
	useReplacePreview: boolean;
	showLineNumbers: boolean;
	usePCRE2: boolean;
	actionsPosition: 'auto' | 'right';
	collapseResults: 'auto' | 'alwaysCollapse' | 'alwaysExpand';
}

export interface ISearchConfiguration extends IFilesConfiguration {
	search: ISearchConfigurationProperties;
	editor: {
		wordSeparators: string;
	};
}

export function getExcludes(configuration: ISearchConfiguration): glob.IExpression | undefined {
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

export function pathIncludedInQuery(queryProps: ICommonQueryProps<URI>, fsPath: string): boolean {
	if (queryProps.excludePattern && glob.match(queryProps.excludePattern, fsPath)) {
		return false;
	}

	if (queryProps.includePattern && !glob.match(queryProps.includePattern, fsPath)) {
		return false;
	}

	// If searchPaths are being used, the extra file must be in a subfolder and match the pattern, if present
	if (queryProps.usingSearchPaths) {
		return !!queryProps.folderQueries && queryProps.folderQueries.every(fq => {
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

export enum SearchErrorCode {
	unknownEncoding = 1,
	regexParseError,
	globParseError,
	invalidLiteral,
	rgProcessError,
	other
}

export class SearchError extends Error {
	constructor(message: string, readonly code?: SearchErrorCode) {
		super(message);
	}
}

export function deserializeSearchError(errorMsg: string): SearchError {
	try {
		const details = JSON.parse(errorMsg);
		return new SearchError(details.message, details.code);
	} catch (e) {
		return new SearchError(errorMsg, SearchErrorCode.other);
	}
}

export function serializeSearchError(searchError: SearchError): Error {
	const details = { message: searchError.message, code: searchError.code };
	return new Error(JSON.stringify(details));
}
