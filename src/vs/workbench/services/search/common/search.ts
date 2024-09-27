/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapArrayOrNot } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import * as glob from '../../../../base/common/glob.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import * as objects from '../../../../base/common/objects.js';
import * as extpath from '../../../../base/common/extpath.js';
import { fuzzyContains, getNLines } from '../../../../base/common/strings.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IFilesConfiguration } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryData } from '../../../../platform/telemetry/common/telemetry.js';
import { Event } from '../../../../base/common/event.js';
import * as paths from '../../../../base/common/path.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { GlobPattern, TextSearchCompleteMessageType } from './searchExtTypes.js';
import { isThenable } from '../../../../base/common/async.js';
import { ResourceSet } from '../../../../base/common/map.js';

export { TextSearchCompleteMessageType };

export const VIEWLET_ID = 'workbench.view.search';
export const PANEL_ID = 'workbench.panel.search';
export const VIEW_ID = 'workbench.view.search';
export const SEARCH_RESULT_LANGUAGE_ID = 'search-result';

export const SEARCH_EXCLUDE_CONFIG = 'search.exclude';
export const DEFAULT_MAX_SEARCH_RESULTS = 20000;

// Warning: this pattern is used in the search editor to detect offsets. If you
// change this, also change the search-result built-in extension
const SEARCH_ELIDED_PREFIX = '⟪ ';
const SEARCH_ELIDED_SUFFIX = ' characters skipped ⟫';
const SEARCH_ELIDED_MIN_LEN = (SEARCH_ELIDED_PREFIX.length + SEARCH_ELIDED_SUFFIX.length + 5) * 2;

export const ISearchService = createDecorator<ISearchService>('searchService');

/**
 * A service that enables to search for files or with in files.
 */
export interface ISearchService {
	readonly _serviceBrand: undefined;
	textSearch(query: ITextQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete>;
	aiTextSearch(query: IAITextQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete>;
	getAIName(): Promise<string | undefined>;
	textSearchSplitSyncAsync(query: ITextQuery, token?: CancellationToken | undefined, onProgress?: ((result: ISearchProgressItem) => void) | undefined, notebookFilesToIgnore?: ResourceSet, asyncNotebookFilesToIgnore?: Promise<ResourceSet>): { syncResults: ISearchComplete; asyncResults: Promise<ISearchComplete> };
	fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete>;
	clearCache(cacheKey: string): Promise<void>;
	registerSearchResultProvider(scheme: string, type: SearchProviderType, provider: ISearchResultProvider): IDisposable;
}

/**
 * TODO@roblou - split text from file search entirely, or share code in a more natural way.
 */
export const enum SearchProviderType {
	file,
	text,
	aiText
}

export interface ISearchResultProvider {
	getAIName(): Promise<string | undefined>;
	textSearch(query: ITextQuery, onProgress?: (p: ISearchProgressItem) => void, token?: CancellationToken): Promise<ISearchComplete>;
	fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete>;
	clearCache(cacheKey: string): Promise<void>;
}


export interface ExcludeGlobPattern<U extends UriComponents = URI> {
	folder?: U;
	pattern: glob.IExpression;
}

export interface IFolderQuery<U extends UriComponents = URI> {
	folder: U;
	folderName?: string;
	excludePattern?: ExcludeGlobPattern<U>[];
	includePattern?: glob.IExpression;
	fileEncoding?: string;
	disregardIgnoreFiles?: boolean;
	disregardGlobalIgnoreFiles?: boolean;
	disregardParentIgnoreFiles?: boolean;
	ignoreSymlinks?: boolean;
}

export interface ICommonQueryProps<U extends UriComponents> {
	/** For telemetry - indicates what is triggering the source */
	_reason?: string;

	folderQueries: IFolderQuery<U>[];
	// The include pattern for files that gets passed into ripgrep.
	// Note that this will override any ignore files if applicable.
	includePattern?: glob.IExpression;
	excludePattern?: glob.IExpression;
	extraFileResources?: U[];

	onlyOpenEditors?: boolean;

	maxResults?: number;
	usingSearchPaths?: boolean;
	onlyFileScheme?: boolean;
}

export interface IFileQueryProps<U extends UriComponents> extends ICommonQueryProps<U> {
	type: QueryType.File;
	filePattern?: string;

	// when walking through the tree to find the result, don't use the filePattern to fuzzy match.
	// Instead, should use glob matching.
	shouldGlobMatchFilePattern?: boolean;

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
	surroundingContext?: number;

	userDisabledExcludesAndIgnoreFiles?: boolean;
}

export interface IAITextQueryProps<U extends UriComponents> extends ICommonQueryProps<U> {
	type: QueryType.aiText;
	contentPattern: string;

	previewOptions?: ITextSearchPreviewOptions;
	maxFileSize?: number;
	surroundingContext?: number;

	userDisabledExcludesAndIgnoreFiles?: boolean;
}

export type IFileQuery = IFileQueryProps<URI>;
export type IRawFileQuery = IFileQueryProps<UriComponents>;
export type ITextQuery = ITextQueryProps<URI>;
export type IRawTextQuery = ITextQueryProps<UriComponents>;
export type IAITextQuery = IAITextQueryProps<URI>;
export type IRawAITextQuery = IAITextQueryProps<UriComponents>;

export type IRawQuery = IRawTextQuery | IRawFileQuery | IRawAITextQuery;
export type ISearchQuery = ITextQuery | IFileQuery | IAITextQuery;

export const enum QueryType {
	File = 1,
	Text = 2,
	aiText = 3
}

/* __GDPR__FRAGMENT__
	"IPatternInfo" : {
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
	isUnicode?: boolean;
	isCaseSensitive?: boolean;
	notebookInfo?: INotebookPatternInfo;
}

export interface INotebookPatternInfo {
	isInNotebookMarkdownInput?: boolean;
	isInNotebookMarkdownPreview?: boolean;
	isInNotebookCellInput?: boolean;
	isInNotebookCellOutput?: boolean;
}

export interface IExtendedExtensionSearchOptions {
	usePCRE2?: boolean;
}

export interface IFileMatch<U extends UriComponents = URI> {
	resource: U;
	results?: ITextSearchResult<U>[];
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

export interface ITextSearchMatch<U extends UriComponents = URI> {
	uri?: U;
	rangeLocations: SearchRangeSetPairing[];
	previewText: string;
	webviewIndex?: number;
	cellFragment?: string;
}

export interface ITextSearchContext<U extends UriComponents = URI> {
	uri?: U;
	text: string;
	lineNumber: number;
}

export type ITextSearchResult<U extends UriComponents = URI> = ITextSearchMatch<U> | ITextSearchContext<U>;

export function resultIsMatch(result: ITextSearchResult): result is ITextSearchMatch {
	return !!(<ITextSearchMatch>result).rangeLocations && !!(<ITextSearchMatch>result).previewText;
}

export interface IProgressMessage {
	message: string;
}

export type ISearchProgressItem = IFileMatch | IProgressMessage;

export function isFileMatch(p: ISearchProgressItem): p is IFileMatch {
	return !!(<IFileMatch>p).resource;
}

export function isProgressMessage(p: ISearchProgressItem | ISerializedSearchProgressItem): p is IProgressMessage {
	return !!(p as IProgressMessage).message;
}

export interface ITextSearchCompleteMessage {
	text: string;
	type: TextSearchCompleteMessageType;
	trusted?: boolean;
}

export interface ISearchCompleteStats {
	limitHit?: boolean;
	messages: ITextSearchCompleteMessage[];
	stats?: IFileSearchStats | ITextSearchStats;
}

export interface ISearchComplete extends ISearchCompleteStats {
	results: IFileMatch[];
	exit?: SearchCompletionExitCode;
}

export const enum SearchCompletionExitCode {
	Normal,
	NewSearchStarted
}

export interface ITextSearchStats {
	type: 'textSearchProvider' | 'searchProcess' | 'aiTextSearchProvider';
}

export interface IFileSearchStats {
	fromCache: boolean;
	detailStats: ISearchEngineStats | ICachedSearchStats | IFileSearchProviderStats;

	resultCount: number;
	type: 'fileSearchProvider' | 'searchProcess';
	sortingTime?: number;
}

export interface ICachedSearchStats {
	cacheWasResolved: boolean;
	cacheLookupTime: number;
	cacheFilterTime: number;
	cacheEntryCount: number;
}

export interface ISearchEngineStats {
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

export class FileMatch implements IFileMatch {
	results: ITextSearchResult[] = [];
	constructor(public resource: URI) {
		// empty
	}
}

export interface SearchRangeSetPairing {
	source: ISearchRange;
	preview: ISearchRange;
}

export class TextSearchMatch implements ITextSearchMatch {
	rangeLocations: SearchRangeSetPairing[] = [];
	previewText: string;
	webviewIndex?: number;

	constructor(text: string, ranges: ISearchRange | ISearchRange[], previewOptions?: ITextSearchPreviewOptions, webviewIndex?: number) {
		this.webviewIndex = webviewIndex;

		// Trim preview if this is one match and a single-line match with a preview requested.
		// Otherwise send the full text, like for replace or for showing multiple previews.
		// TODO this is fishy.
		const rangesArr = Array.isArray(ranges) ? ranges : [ranges];

		if (previewOptions && previewOptions.matchLines === 1 && isSingleLineRangeList(rangesArr)) {
			// 1 line preview requested
			text = getNLines(text, previewOptions.matchLines);

			let result = '';
			let shift = 0;
			let lastEnd = 0;
			const leadingChars = Math.floor(previewOptions.charsPerLine / 5);
			for (const range of rangesArr) {
				const previewStart = Math.max(range.startColumn - leadingChars, 0);
				const previewEnd = range.startColumn + previewOptions.charsPerLine;
				if (previewStart > lastEnd + leadingChars + SEARCH_ELIDED_MIN_LEN) {
					const elision = SEARCH_ELIDED_PREFIX + (previewStart - lastEnd) + SEARCH_ELIDED_SUFFIX;
					result += elision + text.slice(previewStart, previewEnd);
					shift += previewStart - (lastEnd + elision.length);
				} else {
					result += text.slice(lastEnd, previewEnd);
				}

				lastEnd = previewEnd;
				this.rangeLocations.push({
					source: range,
					preview: new OneLineRange(0, range.startColumn - shift, range.endColumn - shift)
				});

			}

			this.previewText = result;
		} else {
			const firstMatchLine = Array.isArray(ranges) ? ranges[0].startLineNumber : ranges.startLineNumber;

			const rangeLocs = mapArrayOrNot(ranges, r => ({
				preview: new SearchRange(r.startLineNumber - firstMatchLine, r.startColumn, r.endLineNumber - firstMatchLine, r.endColumn),
				source: r
			}));

			this.rangeLocations = Array.isArray(rangeLocs) ? rangeLocs : [rangeLocs];
			this.previewText = text;
		}
	}
}

function isSingleLineRangeList(ranges: ISearchRange[]): boolean {
	const line = ranges[0].startLineNumber;
	for (const r of ranges) {
		if (r.startLineNumber !== line || r.endLineNumber !== line) {
			return false;
		}
	}

	return true;
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

export const enum ViewMode {
	List = 'list',
	Tree = 'tree'
}

export const enum SearchSortOrder {
	Default = 'default',
	FileNames = 'fileNames',
	Type = 'type',
	Modified = 'modified',
	CountDescending = 'countDescending',
	CountAscending = 'countAscending'
}

export interface ISearchConfigurationProperties {
	exclude: glob.IExpression;
	useRipgrep: boolean;
	/**
	 * Use ignore file for file search.
	 */
	useIgnoreFiles: boolean;
	useGlobalIgnoreFiles: boolean;
	useParentIgnoreFiles: boolean;
	followSymlinks: boolean;
	smartCase: boolean;
	globalFindClipboard: boolean;
	location: 'sidebar' | 'panel';
	useReplacePreview: boolean;
	showLineNumbers: boolean;
	usePCRE2: boolean;
	actionsPosition: 'auto' | 'right';
	maintainFileSearchCache: boolean;
	maxResults: number | null;
	collapseResults: 'auto' | 'alwaysCollapse' | 'alwaysExpand';
	searchOnType: boolean;
	seedOnFocus: boolean;
	seedWithNearestWord: boolean;
	searchOnTypeDebouncePeriod: number;
	mode: 'view' | 'reuseEditor' | 'newEditor';
	searchEditor: {
		doubleClickBehaviour: 'selectWord' | 'goToLocation' | 'openLocationToSide';
		singleClickBehaviour: 'default' | 'peekDefinition';
		reusePriorSearchConfiguration: boolean;
		defaultNumberOfContextLines: number | null;
		focusResultsOnSearch: boolean;
		experimental: {};
	};
	sortOrder: SearchSortOrder;
	decorations: {
		colors: boolean;
		badges: boolean;
	};
	quickAccess: {
		preserveInput: boolean;
	};
	defaultViewMode: ViewMode;
	experimental: {
		closedNotebookRichContentResults: boolean;
	};
}

export interface ISearchConfiguration extends IFilesConfiguration {
	search: ISearchConfigurationProperties;
	editor: {
		wordSeparators: string;
	};
}

export function getExcludes(configuration: ISearchConfiguration, includeSearchExcludes = true): glob.IExpression | undefined {
	const fileExcludes = configuration && configuration.files && configuration.files.exclude;
	const searchExcludes = includeSearchExcludes && configuration && configuration.search && configuration.search.exclude;

	if (!fileExcludes && !searchExcludes) {
		return undefined;
	}

	if (!fileExcludes || !searchExcludes) {
		return fileExcludes || searchExcludes || undefined;
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

	if (queryProps.includePattern || queryProps.usingSearchPaths) {
		if (queryProps.includePattern && glob.match(queryProps.includePattern, fsPath)) {
			return true;
		}

		// If searchPaths are being used, the extra file must be in a subfolder and match the pattern, if present
		if (queryProps.usingSearchPaths) {
			return !!queryProps.folderQueries && queryProps.folderQueries.some(fq => {
				const searchPath = fq.folder.fsPath;
				if (extpath.isEqualOrParent(fsPath, searchPath)) {
					const relPath = paths.relative(searchPath, fsPath);
					return !fq.includePattern || !!glob.match(fq.includePattern, relPath);
				} else {
					return false;
				}
			});
		}

		return false;
	}

	return true;
}

export enum SearchErrorCode {
	unknownEncoding = 1,
	regexParseError,
	globParseError,
	invalidLiteral,
	rgProcessError,
	other,
	canceled
}

export class SearchError extends Error {
	constructor(message: string, readonly code?: SearchErrorCode) {
		super(message);
	}
}

export function deserializeSearchError(error: Error): SearchError {
	const errorMsg = error.message;

	if (isCancellationError(error)) {
		return new SearchError(errorMsg, SearchErrorCode.canceled);
	}

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
	/**
	 * The path of the file relative to the containing `base` folder.
	 * This path is exactly as it appears on the filesystem.
	 */
	relativePath: string;
	/**
	 * This path is transformed for search purposes. For example, this could be
	 * the `relativePath` with the workspace folder name prepended. This way the
	 * search algorithm would also match against the name of the containing folder.
	 *
	 * If not given, the search algorithm should use `relativePath`.
	 */
	searchPath: string | undefined;
}

export interface ISearchEngine<T> {
	search: (onResult: (matches: T) => void, onProgress: (progress: IProgressMessage) => void, done: (error: Error | null, complete: ISearchEngineSuccess) => void) => void;
	cancel: () => void;
}

export interface ISerializedSearchSuccess {
	type: 'success';
	limitHit: boolean;
	messages: ITextSearchCompleteMessage[];
	stats?: IFileSearchStats | ITextSearchStats;
}

export interface ISearchEngineSuccess {
	limitHit: boolean;
	messages: ITextSearchCompleteMessage[];
	stats: ISearchEngineStats;
}

export interface ISerializedSearchError {
	type: 'error';
	error: {
		message: string;
		stack: string;
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

export function isFilePatternMatch(candidate: IRawFileMatch, filePatternToUse: string, fuzzy = true): boolean {
	const pathToMatch = candidate.searchPath ? candidate.searchPath : candidate.relativePath;
	return fuzzy ?
		fuzzyContains(pathToMatch, filePatternToUse) :
		glob.match(filePatternToUse, pathToMatch);
}

export interface ISerializedFileMatch {
	path: string;
	results?: ITextSearchResult[];
	numMatches?: number;
}

// Type of the possible values for progress calls from the engine
export type ISerializedSearchProgressItem = ISerializedFileMatch | ISerializedFileMatch[] | IProgressMessage;
export type IFileSearchProgressItem = IRawFileMatch | IRawFileMatch[] | IProgressMessage;


export class SerializableFileMatch implements ISerializedFileMatch {
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

	private _excludeExpression: glob.IExpression[]; // TODO: evaluate globs based on baseURI of pattern
	private _parsedExcludeExpression: glob.ParsedExpression[];

	private _parsedIncludeExpression: glob.ParsedExpression | null = null;

	constructor(config: ISearchQuery, folderQuery: IFolderQuery) {
		// todo: try to incorporate folderQuery.excludePattern.folder if available
		this._excludeExpression = folderQuery.excludePattern?.map(excludePattern => {
			return {
				...(config.excludePattern || {}),
				...(excludePattern.pattern || {})
			} satisfies glob.IExpression;
		}) ?? [];

		if (this._excludeExpression.length === 0) {
			// even if there are no folderQueries, we want to observe  the global excludes
			this._excludeExpression = [config.excludePattern || {}];
		}

		this._parsedExcludeExpression = this._excludeExpression.map(e => glob.parse(e));

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

	private _evalParsedExcludeExpression(testPath: string, basename: string | undefined, hasSibling?: (name: string) => boolean): string | null {
		// todo: less hacky way of evaluating sync vs async sibling clauses
		let result: string | null = null;

		for (const folderExclude of this._parsedExcludeExpression) {

			// find first non-null result
			const evaluation = folderExclude(testPath, basename, hasSibling);

			if (typeof evaluation === 'string') {
				result = evaluation;
				break;
			}
		}
		return result;
	}


	matchesExcludesSync(testPath: string, basename?: string, hasSibling?: (name: string) => boolean): boolean {
		if (this._parsedExcludeExpression && this._evalParsedExcludeExpression(testPath, basename, hasSibling)) {
			return true;
		}

		return false;
	}

	/**
	 * Guaranteed sync - siblingsFn should not return a promise.
	 */
	includedInQuerySync(testPath: string, basename?: string, hasSibling?: (name: string) => boolean): boolean {
		if (this._parsedExcludeExpression && this._evalParsedExcludeExpression(testPath, basename, hasSibling)) {
			return false;
		}

		if (this._parsedIncludeExpression && !this._parsedIncludeExpression(testPath, basename, hasSibling)) {
			return false;
		}

		return true;
	}

	/**
	 * Evaluating the exclude expression is only async if it includes sibling clauses. As an optimization, avoid doing anything with Promises
	 * unless the expression is async.
	 */
	includedInQuery(testPath: string, basename?: string, hasSibling?: (name: string) => boolean | Promise<boolean>): Promise<boolean> | boolean {

		const isIncluded = () => {
			return this._parsedIncludeExpression ?
				!!(this._parsedIncludeExpression(testPath, basename, hasSibling)) :
				true;
		};

		return Promise.all(this._parsedExcludeExpression.map(e => {
			const excluded = e(testPath, basename, hasSibling);
			if (isThenable(excluded)) {
				return excluded.then(excluded => {
					if (excluded) {
						return false;
					}

					return isIncluded();
				});
			}

			return isIncluded();

		})).then(e => e.some(e => !!e));


	}

	hasSiblingExcludeClauses(): boolean {
		return this._excludeExpression.reduce((prev, curr) => hasSiblingClauses(curr) || prev, false);
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

export function hasSiblingPromiseFn(siblingsFn?: () => Promise<string[]>) {
	if (!siblingsFn) {
		return undefined;
	}

	let siblings: Promise<Record<string, true>>;
	return (name: string) => {
		if (!siblings) {
			siblings = (siblingsFn() || Promise.resolve([]))
				.then(list => list ? listToMap(list) : {});
		}
		return siblings.then(map => !!map[name]);
	};
}

export function hasSiblingFn(siblingsFn?: () => string[]) {
	if (!siblingsFn) {
		return undefined;
	}

	let siblings: Record<string, true>;
	return (name: string) => {
		if (!siblings) {
			const list = siblingsFn();
			siblings = list ? listToMap(list) : {};
		}
		return !!siblings[name];
	};
}

function listToMap(list: string[]) {
	const map: Record<string, true> = {};
	for (const key of list) {
		map[key] = true;
	}
	return map;
}

export function excludeToGlobPattern(excludesForFolder: { baseUri?: URI | undefined; patterns: string[] }[]): GlobPattern[] {
	return excludesForFolder.flatMap(exclude => exclude.patterns.map(pattern => {
		return exclude.baseUri ?
			{
				baseUri: exclude.baseUri,
				pattern: pattern
			} : pattern;
	}));
}

export const DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS = {
	matchLines: 100,
	charsPerLine: 10000
};
