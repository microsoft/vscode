/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from '../../../../base/common/arrays.js';
import { DeferredPromise, raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { randomChance } from '../../../../base/common/numbers.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { isNumber } from '../../../../base/common/types.js';
import { URI, URI as uri } from '../../../../base/common/uri.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { DEFAULT_MAX_SEARCH_RESULTS, deserializeSearchError, FileMatch, IAITextQuery, ICachedSearchStats, IFileMatch, IFileQuery, IFileSearchStats, IFolderQuery, IProgressMessage, ISearchComplete, ISearchEngineStats, ISearchProgressItem, ISearchQuery, ISearchResultProvider, ISearchService, isFileMatch, isProgressMessage, ITextQuery, pathIncludedInQuery, QueryType, SEARCH_RESULT_LANGUAGE_ID, SearchError, SearchErrorCode, SearchProviderType } from './search.js';
import { getTextSearchMatchWithModelContext, editorMatchesToTextSearchResults } from './searchHelpers.js';

export class SearchService extends Disposable implements ISearchService {

	declare readonly _serviceBrand: undefined;

	private readonly fileSearchProviders = new Map<string, ISearchResultProvider>();
	private readonly textSearchProviders = new Map<string, ISearchResultProvider>();
	private readonly aiTextSearchProviders = new Map<string, ISearchResultProvider>();

	private deferredFileSearchesByScheme = new Map<string, DeferredPromise<ISearchResultProvider>>();
	private deferredTextSearchesByScheme = new Map<string, DeferredPromise<ISearchResultProvider>>();
	private deferredAITextSearchesByScheme = new Map<string, DeferredPromise<ISearchResultProvider>>();

	private loggedSchemesMissingProviders = new Set<string>();

	constructor(
		@IModelService private readonly modelService: IModelService,
		@IEditorService private readonly editorService: IEditorService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IFileService private readonly fileService: IFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super();
	}

	registerSearchResultProvider(scheme: string, type: SearchProviderType, provider: ISearchResultProvider): IDisposable {
		let list: Map<string, ISearchResultProvider>;
		let deferredMap: Map<string, DeferredPromise<ISearchResultProvider>>;
		if (type === SearchProviderType.file) {
			list = this.fileSearchProviders;
			deferredMap = this.deferredFileSearchesByScheme;
		} else if (type === SearchProviderType.text) {
			list = this.textSearchProviders;
			deferredMap = this.deferredTextSearchesByScheme;
		} else if (type === SearchProviderType.aiText) {
			list = this.aiTextSearchProviders;
			deferredMap = this.deferredAITextSearchesByScheme;
		} else {
			throw new Error('Unknown SearchProviderType');
		}

		list.set(scheme, provider);

		if (deferredMap.has(scheme)) {
			deferredMap.get(scheme)!.complete(provider);
			deferredMap.delete(scheme);
		}

		return toDisposable(() => {
			list.delete(scheme);
		});
	}

	async textSearch(query: ITextQuery, token?: CancellationToken, onProgress?: (item: ISearchProgressItem) => void): Promise<ISearchComplete> {
		const results = this.textSearchSplitSyncAsync(query, token, onProgress);
		const openEditorResults = results.syncResults;
		const otherResults = await results.asyncResults;
		return {
			limitHit: otherResults.limitHit || openEditorResults.limitHit,
			results: [...otherResults.results, ...openEditorResults.results],
			messages: [...otherResults.messages, ...openEditorResults.messages]
		};
	}

	async aiTextSearch(query: IAITextQuery, token?: CancellationToken, onProgress?: (item: ISearchProgressItem) => void): Promise<ISearchComplete> {
		const onProviderProgress = (progress: ISearchProgressItem) => {
			// Match
			if (onProgress) { // don't override open editor results
				if (isFileMatch(progress)) {
					onProgress(progress);
				} else {
					onProgress(<IProgressMessage>progress);
				}
			}

			if (isProgressMessage(progress)) {
				this.logService.debug('SearchService#search', progress.message);
			}
		};
		return this.doSearch(query, token, onProviderProgress);
	}

	async getAIName(): Promise<string | undefined> {
		const provider = this.getSearchProvider(QueryType.aiText).get(Schemas.file);
		return await provider?.getAIName();
	}

	textSearchSplitSyncAsync(
		query: ITextQuery,
		token?: CancellationToken | undefined,
		onProgress?: ((result: ISearchProgressItem) => void) | undefined,
		notebookFilesToIgnore?: ResourceSet,
		asyncNotebookFilesToIgnore?: Promise<ResourceSet>
	): {
		syncResults: ISearchComplete;
		asyncResults: Promise<ISearchComplete>;
	} {
		// Get open editor results from dirty/untitled
		const openEditorResults = this.getOpenEditorResults(query);

		if (onProgress) {
			arrays.coalesce([...openEditorResults.results.values()]).filter(e => !(notebookFilesToIgnore && notebookFilesToIgnore.has(e.resource))).forEach(onProgress);
		}

		const syncResults: ISearchComplete = {
			results: arrays.coalesce([...openEditorResults.results.values()]),
			limitHit: openEditorResults.limitHit ?? false,
			messages: []
		};

		const getAsyncResults = async () => {
			const resolvedAsyncNotebookFilesToIgnore = await asyncNotebookFilesToIgnore ?? new ResourceSet();
			const onProviderProgress = (progress: ISearchProgressItem) => {
				if (isFileMatch(progress)) {
					// Match
					if (!openEditorResults.results.has(progress.resource) && !resolvedAsyncNotebookFilesToIgnore.has(progress.resource) && onProgress) { // don't override open editor results
						onProgress(progress);
					}
				} else if (onProgress) {
					// Progress
					onProgress(<IProgressMessage>progress);
				}

				if (isProgressMessage(progress)) {
					this.logService.debug('SearchService#search', progress.message);
				}
			};
			return await this.doSearch(query, token, onProviderProgress);
		};

		return {
			syncResults,
			asyncResults: getAsyncResults()
		};
	}

	fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete> {
		return this.doSearch(query, token);
	}

	schemeHasFileSearchProvider(scheme: string): boolean {
		return this.fileSearchProviders.has(scheme);
	}

	private doSearch(query: ISearchQuery, token?: CancellationToken, onProgress?: (item: ISearchProgressItem) => void): Promise<ISearchComplete> {
		this.logService.trace('SearchService#search', JSON.stringify(query));

		const schemesInQuery = this.getSchemesInQuery(query);

		const providerActivations: Promise<any>[] = [Promise.resolve(null)];
		schemesInQuery.forEach(scheme => providerActivations.push(this.extensionService.activateByEvent(`onSearch:${scheme}`)));
		providerActivations.push(this.extensionService.activateByEvent('onSearch:file'));

		const providerPromise = (async () => {
			await Promise.all(providerActivations);
			await this.extensionService.whenInstalledExtensionsRegistered();

			// Cancel faster if search was canceled while waiting for extensions
			if (token && token.isCancellationRequested) {
				return Promise.reject(new CancellationError());
			}

			const progressCallback = (item: ISearchProgressItem) => {
				if (token && token.isCancellationRequested) {
					return;
				}

				onProgress?.(item);
			};

			const exists = await Promise.all(query.folderQueries.map(query => this.fileService.exists(query.folder)));
			query.folderQueries = query.folderQueries.filter((_, i) => exists[i]);

			let completes = await this.searchWithProviders(query, progressCallback, token);
			completes = arrays.coalesce(completes);
			if (!completes.length) {
				return {
					limitHit: false,
					results: [],
					messages: [],
				};
			}

			return {
				limitHit: completes[0] && completes[0].limitHit,
				stats: completes[0].stats,
				messages: arrays.coalesce(completes.flatMap(i => i.messages)).filter(arrays.uniqueFilter(message => message.type + message.text + message.trusted)),
				results: completes.flatMap((c: ISearchComplete) => c.results),
				aiKeywords: completes.flatMap((c: ISearchComplete) => c.aiKeywords).filter(keyword => keyword !== undefined),
			};
		})();

		return token ? raceCancellationError<ISearchComplete>(providerPromise, token) : providerPromise;
	}

	private getSchemesInQuery(query: ISearchQuery): Set<string> {
		const schemes = new Set<string>();
		query.folderQueries?.forEach(fq => schemes.add(fq.folder.scheme));

		query.extraFileResources?.forEach(extraFile => schemes.add(extraFile.scheme));

		return schemes;
	}

	private async waitForProvider(queryType: QueryType, scheme: string): Promise<ISearchResultProvider> {
		const deferredMap: Map<string, DeferredPromise<ISearchResultProvider>> = this.getDeferredTextSearchesByScheme(queryType);

		if (deferredMap.has(scheme)) {
			return deferredMap.get(scheme)!.p;
		} else {
			const deferred = new DeferredPromise<ISearchResultProvider>();
			deferredMap.set(scheme, deferred);
			return deferred.p;
		}
	}

	private getSearchProvider(type: QueryType): Map<string, ISearchResultProvider> {
		switch (type) {
			case QueryType.File:
				return this.fileSearchProviders;
			case QueryType.Text:
				return this.textSearchProviders;
			case QueryType.aiText:
				return this.aiTextSearchProviders;
			default:
				throw new Error(`Unknown query type: ${type}`);
		}
	}

	private getDeferredTextSearchesByScheme(type: QueryType): Map<string, DeferredPromise<ISearchResultProvider>> {
		switch (type) {
			case QueryType.File:
				return this.deferredFileSearchesByScheme;
			case QueryType.Text:
				return this.deferredTextSearchesByScheme;
			case QueryType.aiText:
				return this.deferredAITextSearchesByScheme;
			default:
				throw new Error(`Unknown query type: ${type}`);
		}
	}

	private async searchWithProviders(query: ISearchQuery, onProviderProgress: (progress: ISearchProgressItem) => void, token?: CancellationToken) {
		const e2eSW = StopWatch.create(false);

		const searchPs: Promise<ISearchComplete>[] = [];

		const fqs = this.groupFolderQueriesByScheme(query);
		const someSchemeHasProvider = [...fqs.keys()].some(scheme => {
			return this.getSearchProvider(query.type).has(scheme);
		});

		if (query.type === QueryType.aiText && !someSchemeHasProvider) {
			return [];
		}
		await Promise.all([...fqs.keys()].map(async scheme => {
			if (query.onlyFileScheme && scheme !== Schemas.file) {
				return;
			}
			const schemeFQs = fqs.get(scheme)!;
			let provider = this.getSearchProvider(query.type).get(scheme);

			if (!provider) {
				if (someSchemeHasProvider) {
					if (!this.loggedSchemesMissingProviders.has(scheme)) {
						this.logService.warn(`No search provider registered for scheme: ${scheme}. Another scheme has a provider, not waiting for ${scheme}`);
						this.loggedSchemesMissingProviders.add(scheme);
					}
					return;
				} else {
					if (!this.loggedSchemesMissingProviders.has(scheme)) {
						this.logService.warn(`No search provider registered for scheme: ${scheme}, waiting`);
						this.loggedSchemesMissingProviders.add(scheme);
					}
					provider = await this.waitForProvider(query.type, scheme);
				}
			}

			const oneSchemeQuery: ISearchQuery = {
				...query,
				...{
					folderQueries: schemeFQs
				}
			};

			const doProviderSearch = () => {
				switch (query.type) {
					case QueryType.File:
						return provider.fileSearch(<IFileQuery>oneSchemeQuery, token);
					case QueryType.Text:
						return provider.textSearch(<ITextQuery>oneSchemeQuery, onProviderProgress, token);
					default:
						return provider.textSearch(<ITextQuery>oneSchemeQuery, onProviderProgress, token);
				}
			};

			searchPs.push(doProviderSearch());
		}));

		return Promise.all(searchPs).then(completes => {
			const endToEndTime = e2eSW.elapsed();
			this.logService.trace(`SearchService#search: ${endToEndTime}ms`);
			completes.forEach(complete => {
				this.sendTelemetry(query, endToEndTime, complete);
			});
			return completes;
		}, err => {
			const endToEndTime = e2eSW.elapsed();
			this.logService.trace(`SearchService#search: ${endToEndTime}ms`);
			const searchError = deserializeSearchError(err);
			this.logService.trace(`SearchService#searchError: ${searchError.message}`);
			this.sendTelemetry(query, endToEndTime, undefined, searchError);

			throw searchError;
		});
	}

	private groupFolderQueriesByScheme(query: ISearchQuery): Map<string, IFolderQuery[]> {
		const queries = new Map<string, IFolderQuery[]>();

		query.folderQueries.forEach(fq => {
			const schemeFQs = queries.get(fq.folder.scheme) || [];
			schemeFQs.push(fq);

			queries.set(fq.folder.scheme, schemeFQs);
		});

		return queries;
	}

	private sendTelemetry(query: ISearchQuery, endToEndTime: number, complete?: ISearchComplete, err?: SearchError): void {
		if (!randomChance(5 / 100)) {
			// Noisy events, only send 5% of them
			return;
		}

		const fileSchemeOnly = query.folderQueries.every(fq => fq.folder.scheme === Schemas.file);
		const otherSchemeOnly = query.folderQueries.every(fq => fq.folder.scheme !== Schemas.file);
		const scheme = fileSchemeOnly ? Schemas.file :
			otherSchemeOnly ? 'other' :
				'mixed';

		if (query.type === QueryType.File && complete && complete.stats) {
			const fileSearchStats = complete.stats as IFileSearchStats;
			if (fileSearchStats.fromCache) {
				const cacheStats: ICachedSearchStats = fileSearchStats.detailStats as ICachedSearchStats;

				type CachedSearchCompleteClassifcation = {
					owner: 'roblourens';
					comment: 'Fired when a file search is completed from previously cached results';
					reason?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Indicates which extension or UI feature triggered this search' };
					resultCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of search results' };
					workspaceFolderCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of folders in the workspace' };
					endToEndTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The total search time' };
					sortingTime?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The amount of time spent sorting results' };
					cacheWasResolved: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the cache was already resolved when the search began' };
					cacheLookupTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The amount of time spent looking up the cache to use for the search' };
					cacheFilterTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The amount of time spent searching within the cache' };
					cacheEntryCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of entries in the searched-in cache' };
					scheme: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The uri scheme of the folder searched in' };
				};
				type CachedSearchCompleteEvent = {
					reason?: string;
					resultCount: number;
					workspaceFolderCount: number;
					endToEndTime: number;
					sortingTime?: number;
					cacheWasResolved: boolean;
					cacheLookupTime: number;
					cacheFilterTime: number;
					cacheEntryCount: number;
					scheme: string;
				};
				this.telemetryService.publicLog2<CachedSearchCompleteEvent, CachedSearchCompleteClassifcation>('cachedSearchComplete', {
					reason: query._reason,
					resultCount: fileSearchStats.resultCount,
					workspaceFolderCount: query.folderQueries.length,
					endToEndTime: endToEndTime,
					sortingTime: fileSearchStats.sortingTime,
					cacheWasResolved: cacheStats.cacheWasResolved,
					cacheLookupTime: cacheStats.cacheLookupTime,
					cacheFilterTime: cacheStats.cacheFilterTime,
					cacheEntryCount: cacheStats.cacheEntryCount,
					scheme
				});
			} else {
				const searchEngineStats: ISearchEngineStats = fileSearchStats.detailStats as ISearchEngineStats;

				type SearchCompleteClassification = {
					owner: 'roblourens';
					comment: 'Fired when a file search is completed';
					reason?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Indicates which extension or UI feature triggered this search' };
					resultCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of search results' };
					workspaceFolderCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of folders in the workspace' };
					endToEndTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The total search time' };
					sortingTime?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The amount of time spent sorting results' };
					fileWalkTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The amount of time spent walking file system' };
					directoriesWalked: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of directories walked' };
					filesWalked: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of files walked' };
					cmdTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The amount of time spent running the search command' };
					cmdResultCount?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of results returned from the search command' };
					scheme: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The uri scheme of the folder searched in' };
				};
				type SearchCompleteEvent = {
					reason?: string;
					resultCount: number;
					workspaceFolderCount: number;
					endToEndTime: number;
					sortingTime?: number;
					fileWalkTime: number;
					directoriesWalked: number;
					filesWalked: number;
					cmdTime: number;
					cmdResultCount?: number;
					scheme: string;

				};

				this.telemetryService.publicLog2<SearchCompleteEvent, SearchCompleteClassification>('searchComplete', {
					reason: query._reason,
					resultCount: fileSearchStats.resultCount,
					workspaceFolderCount: query.folderQueries.length,
					endToEndTime: endToEndTime,
					sortingTime: fileSearchStats.sortingTime,
					fileWalkTime: searchEngineStats.fileWalkTime,
					directoriesWalked: searchEngineStats.directoriesWalked,
					filesWalked: searchEngineStats.filesWalked,
					cmdTime: searchEngineStats.cmdTime,
					cmdResultCount: searchEngineStats.cmdResultCount,
					scheme
				});
			}
		} else if (query.type === QueryType.Text) {
			let errorType: string | undefined;
			if (err) {
				errorType = err.code === SearchErrorCode.regexParseError ? 'regex' :
					err.code === SearchErrorCode.unknownEncoding ? 'encoding' :
						err.code === SearchErrorCode.globParseError ? 'glob' :
							err.code === SearchErrorCode.invalidLiteral ? 'literal' :
								err.code === SearchErrorCode.other ? 'other' :
									err.code === SearchErrorCode.canceled ? 'canceled' :
										'unknown';
			}

			type TextSearchCompleteClassification = {
				owner: 'roblourens';
				comment: 'Fired when a text search is completed';
				reason?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Indicates which extension or UI feature triggered this search' };
				workspaceFolderCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The number of folders in the workspace' };
				endToEndTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The total search time' };
				scheme: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The uri scheme of the folder searched in' };
				error?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The type of the error, if any' };
			};
			type TextSearchCompleteEvent = {
				reason?: string;
				workspaceFolderCount: number;
				endToEndTime: number;
				scheme: string;
				error?: string;
			};
			this.telemetryService.publicLog2<TextSearchCompleteEvent, TextSearchCompleteClassification>('textSearchComplete', {
				reason: query._reason,
				workspaceFolderCount: query.folderQueries.length,
				endToEndTime: endToEndTime,
				scheme,
				error: errorType,
			});
		}
	}

	private getOpenEditorResults(query: ITextQuery): { results: ResourceMap<IFileMatch | null>; limitHit: boolean } {
		const openEditorResults = new ResourceMap<IFileMatch | null>(uri => this.uriIdentityService.extUri.getComparisonKey(uri));
		let limitHit = false;

		if (query.type === QueryType.Text) {
			const canonicalToOriginalResources = new ResourceMap<URI>();
			for (const editorInput of this.editorService.editors) {
				const canonical = EditorResourceAccessor.getCanonicalUri(editorInput, { supportSideBySide: SideBySideEditor.PRIMARY });
				const original = EditorResourceAccessor.getOriginalUri(editorInput, { supportSideBySide: SideBySideEditor.PRIMARY });

				if (canonical) {
					canonicalToOriginalResources.set(canonical, original ?? canonical);
				}
			}

			const models = this.modelService.getModels();
			models.forEach((model) => {
				const resource = model.uri;
				if (!resource) {
					return;
				}

				if (limitHit) {
					return;
				}

				const originalResource = canonicalToOriginalResources.get(resource);
				if (!originalResource) {
					return;
				}

				// Skip search results
				if (model.getLanguageId() === SEARCH_RESULT_LANGUAGE_ID && !(query.includePattern && query.includePattern['**/*.code-search'])) {
					// TODO: untitled search editors will be excluded from search even when include *.code-search is specified
					return;
				}

				// Block walkthrough, webview, etc.
				if (originalResource.scheme !== Schemas.untitled && !this.fileService.hasProvider(originalResource)) {
					return;
				}

				// Exclude files from the git FileSystemProvider, e.g. to prevent open staged files from showing in search results
				if (originalResource.scheme === 'git') {
					return;
				}

				if (!this.matches(originalResource, query)) {
					return; // respect user filters
				}

				// Use editor API to find matches
				const askMax = (isNumber(query.maxResults) ? query.maxResults : DEFAULT_MAX_SEARCH_RESULTS) + 1;
				let matches = model.findMatches(query.contentPattern.pattern, false, !!query.contentPattern.isRegExp, !!query.contentPattern.isCaseSensitive, query.contentPattern.isWordMatch ? query.contentPattern.wordSeparators! : null, false, askMax);
				if (matches.length) {
					if (askMax && matches.length >= askMax) {
						limitHit = true;
						matches = matches.slice(0, askMax - 1);
					}

					const fileMatch = new FileMatch(originalResource);
					openEditorResults.set(originalResource, fileMatch);

					const textSearchResults = editorMatchesToTextSearchResults(matches, model, query.previewOptions);
					fileMatch.results = getTextSearchMatchWithModelContext(textSearchResults, model, query);
				} else {
					openEditorResults.set(originalResource, null);
				}
			});
		}

		return {
			results: openEditorResults,
			limitHit
		};
	}

	private matches(resource: uri, query: ITextQuery): boolean {
		return pathIncludedInQuery(query, resource.fsPath);
	}

	async clearCache(cacheKey: string): Promise<void> {
		const clearPs = Array.from(this.fileSearchProviders.values())
			.map(provider => provider && provider.clearCache(cacheKey));
		await Promise.all(clearPs);
	}
}
