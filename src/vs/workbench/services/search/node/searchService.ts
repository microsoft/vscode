/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getPathFromAmdModule } from 'vs/base/common/amd';
import * as arrays from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { canceled } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { keys, ResourceMap, values } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import * as objects from 'vs/base/common/objects';
import { StopWatch } from 'vs/base/common/stopwatch';
import { URI as uri } from 'vs/base/common/uri';
import * as pfs from 'vs/base/node/pfs';
import { getNextTickChannel } from 'vs/base/parts/ipc/node/ipc';
import { Client, IIPCOptions } from 'vs/base/parts/ipc/node/ipc.cp';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDebugParams, IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { deserializeSearchError, FileMatch, ICachedSearchStats, IFileMatch, IFileQuery, IFileSearchStats, IFolderQuery, IProgress, ISearchComplete, ISearchConfiguration, ISearchEngineStats, ISearchProgressItem, ISearchQuery, ISearchResultProvider, ISearchService, ITextQuery, pathIncludedInQuery, QueryType, SearchError, SearchErrorCode, SearchProviderType } from 'vs/platform/search/common/search';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { addContextToEditorMatches, editorMatchesToTextSearchResults } from 'vs/workbench/services/search/common/searchHelpers';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IRawSearchService, ISerializedFileMatch, ISerializedSearchComplete, ISerializedSearchProgressItem, isSerializedSearchComplete, isSerializedSearchSuccess } from './search';
import { SearchChannelClient } from './searchIpc';

export class SearchService extends Disposable implements ISearchService {
	_serviceBrand: any;

	private diskSearch: DiskSearch;
	private readonly fileSearchProviders = new Map<string, ISearchResultProvider>();
	private readonly textSearchProviders = new Map<string, ISearchResultProvider>();
	private readonly fileIndexProviders = new Map<string, ISearchResultProvider>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IUntitledEditorService private readonly untitledEditorService: IUntitledEditorService,
		@IEditorService private readonly editorService: IEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super();
		this.diskSearch = this.instantiationService.createInstance(DiskSearch, !environmentService.isBuilt || environmentService.verbose, /*timeout=*/undefined, environmentService.debugSearch);
	}

	registerSearchResultProvider(scheme: string, type: SearchProviderType, provider: ISearchResultProvider): IDisposable {
		let list: Map<string, ISearchResultProvider>;
		if (type === SearchProviderType.file) {
			list = this.fileSearchProviders;
		} else if (type === SearchProviderType.text) {
			list = this.textSearchProviders;
		} else if (type === SearchProviderType.fileIndex) {
			list = this.fileIndexProviders;
		}

		list.set(scheme, provider);

		return toDisposable(() => {
			list.delete(scheme);
		});
	}

	extendQuery(query: IFileQuery): void {
		const configuration = this.configurationService.getValue<ISearchConfiguration>();

		// Configuration: File Excludes
		if (!query.disregardExcludeSettings) {
			const fileExcludes = objects.deepClone(configuration && configuration.files && configuration.files.exclude);
			if (fileExcludes) {
				if (!query.excludePattern) {
					query.excludePattern = fileExcludes;
				} else {
					objects.mixin(query.excludePattern, fileExcludes, false /* no overwrite */);
				}
			}
		}
	}

	textSearch(query: ITextQuery, token?: CancellationToken, onProgress?: (item: ISearchProgressItem) => void): Promise<ISearchComplete> {
		// Get local results from dirty/untitled
		const localResults = this.getLocalResults(query);

		if (onProgress) {
			arrays.coalesce(localResults.values()).forEach(onProgress);
		}

		this.logService.trace('SearchService#search', JSON.stringify(query));

		const onProviderProgress = progress => {
			if (progress.resource) {
				// Match
				if (!localResults.has(progress.resource) && onProgress) { // don't override local results
					onProgress(progress);
				}
			} else if (onProgress) {
				// Progress
				onProgress(<IProgress>progress);
			}

			if (progress.message) {
				this.logService.debug('SearchService#search', progress.message);
			}
		};

		return this.doSearch(query, token, onProviderProgress);
	}

	fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete> {
		return this.doSearch(query, token);
	}

	private doSearch(query: ISearchQuery, token?: CancellationToken, onProgress?: (item: ISearchProgressItem) => void): Promise<ISearchComplete> {
		const schemesInQuery = this.getSchemesInQuery(query);

		const providerActivations: Promise<any>[] = [Promise.resolve(null)];
		schemesInQuery.forEach(scheme => providerActivations.push(this.extensionService.activateByEvent(`onSearch:${scheme}`)));
		providerActivations.push(this.extensionService.activateByEvent('onSearch:file'));

		const providerPromise = Promise.all(providerActivations)
			.then(() => this.extensionService.whenInstalledExtensionsRegistered())
			.then(() => {
				// Cancel faster if search was canceled while waiting for extensions
				if (token && token.isCancellationRequested) {
					return Promise.reject(canceled());
				}

				const progressCallback = (item: ISearchProgressItem) => {
					if (token && token.isCancellationRequested) {
						return;
					}

					if (onProgress) {
						onProgress(item);
					}
				};

				return this.searchWithProviders(query, progressCallback, token);
			})
			.then(completes => {
				completes = arrays.coalesce(completes);
				if (!completes.length) {
					return {
						limitHit: false,
						results: []
					};
				}

				return <ISearchComplete>{
					limitHit: completes[0] && completes[0].limitHit,
					stats: completes[0].stats,
					results: arrays.flatten(completes.map(c => c.results))
				};
			});

		return new Promise((resolve, reject) => {
			if (token) {
				token.onCancellationRequested(() => {
					reject(canceled());
				});
			}

			providerPromise.then(resolve, reject);
		});
	}

	private getSchemesInQuery(query: ISearchQuery): Set<string> {
		const schemes = new Set<string>();
		if (query.folderQueries) {
			query.folderQueries.forEach(fq => schemes.add(fq.folder.scheme));
		}

		if (query.extraFileResources) {
			query.extraFileResources.forEach(extraFile => schemes.add(extraFile.scheme));
		}

		return schemes;
	}

	private searchWithProviders(query: ISearchQuery, onProviderProgress: (progress: ISearchProgressItem) => void, token?: CancellationToken) {
		const e2eSW = StopWatch.create(false);

		const diskSearchQueries: IFolderQuery[] = [];
		const searchPs: Promise<ISearchComplete>[] = [];

		const fqs = this.groupFolderQueriesByScheme(query);
		keys(fqs).forEach(scheme => {
			const schemeFQs = fqs.get(scheme);
			const provider = query.type === QueryType.File ?
				this.fileSearchProviders.get(scheme) || this.fileIndexProviders.get(scheme) :
				this.textSearchProviders.get(scheme);

			if (!provider && scheme === 'file') {
				diskSearchQueries.push(...schemeFQs);
			} else if (!provider) {
				console.warn('No search provider registered for scheme: ' + scheme);
			} else {
				const oneSchemeQuery: ISearchQuery = {
					...query,
					...{
						folderQueries: schemeFQs
					}
				};

				searchPs.push(query.type === QueryType.File ?
					provider.fileSearch(<IFileQuery>oneSchemeQuery, token) :
					provider.textSearch(<ITextQuery>oneSchemeQuery, onProviderProgress, token));
			}
		});

		const diskSearchExtraFileResources = query.extraFileResources && query.extraFileResources.filter(res => res.scheme === Schemas.file);

		if (diskSearchQueries.length || diskSearchExtraFileResources) {
			const diskSearchQuery: ISearchQuery = {
				...query,
				...{
					folderQueries: diskSearchQueries
				},
				extraFileResources: diskSearchExtraFileResources
			};

			searchPs.push(diskSearchQuery.type === QueryType.File ?
				this.diskSearch.fileSearch(diskSearchQuery, token) :
				this.diskSearch.textSearch(diskSearchQuery, onProviderProgress, token));
		}

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
			const searchError = deserializeSearchError(err.message);
			this.sendTelemetry(query, endToEndTime, null, searchError);

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
		const fileSchemeOnly = query.folderQueries.every(fq => fq.folder.scheme === 'file');
		const otherSchemeOnly = query.folderQueries.every(fq => fq.folder.scheme !== 'file');
		const scheme = fileSchemeOnly ? 'file' :
			otherSchemeOnly ? 'other' :
				'mixed';

		if (query.type === QueryType.File && complete && complete.stats) {
			const fileSearchStats = complete.stats as IFileSearchStats;
			if (fileSearchStats.fromCache) {
				const cacheStats: ICachedSearchStats = fileSearchStats.detailStats as ICachedSearchStats;

				/* __GDPR__
					"cachedSearchComplete" : {
						"reason" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth"  },
						"resultCount" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true  },
						"workspaceFolderCount" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true  },
						"type" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
						"endToEndTime" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"sortingTime" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"cacheWasResolved" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
						"cacheLookupTime" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"cacheFilterTime" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"cacheEntryCount" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"scheme" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
					}
				 */
				this.telemetryService.publicLog('cachedSearchComplete', {
					reason: query._reason,
					resultCount: fileSearchStats.resultCount,
					workspaceFolderCount: query.folderQueries.length,
					type: fileSearchStats.type,
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

				/* __GDPR__
					"searchComplete" : {
						"reason" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
						"resultCount" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"workspaceFolderCount" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"type" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
						"endToEndTime" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"sortingTime" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"traversal" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
						"fileWalkTime" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"directoriesWalked" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"filesWalked" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"cmdTime" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"cmdResultCount" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
						"scheme" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
						"useRipgrep" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
					}
				 */
				this.telemetryService.publicLog('searchComplete', {
					reason: query._reason,
					resultCount: fileSearchStats.resultCount,
					workspaceFolderCount: query.folderQueries.length,
					type: fileSearchStats.type,
					endToEndTime: endToEndTime,
					sortingTime: fileSearchStats.sortingTime,
					traversal: searchEngineStats.traversal,
					fileWalkTime: searchEngineStats.fileWalkTime,
					directoriesWalked: searchEngineStats.directoriesWalked,
					filesWalked: searchEngineStats.filesWalked,
					cmdTime: searchEngineStats.cmdTime,
					cmdResultCount: searchEngineStats.cmdResultCount,
					scheme,
					useRipgrep: query.useRipgrep
				});
			}
		} else if (query.type === QueryType.Text) {
			let errorType: string;
			if (err) {
				errorType = err.code === SearchErrorCode.regexParseError ? 'regex' :
					err.code === SearchErrorCode.unknownEncoding ? 'encoding' :
						err.code === SearchErrorCode.globParseError ? 'glob' :
							err.code === SearchErrorCode.invalidLiteral ? 'literal' :
								err.code === SearchErrorCode.other ? 'other' :
									'unknown';
			}

			/* __GDPR__
				"textSearchComplete" : {
					"reason" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
					"workspaceFolderCount" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
					"endToEndTime" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
					"scheme" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
					"error" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
					"useRipgrep" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
					"usePCRE2" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
				}
			 */
			this.telemetryService.publicLog('textSearchComplete', {
				reason: query._reason,
				workspaceFolderCount: query.folderQueries.length,
				endToEndTime: endToEndTime,
				scheme,
				error: errorType,
				useRipgrep: query.useRipgrep,
				usePCRE2: !!query.usePCRE2
			});
		}
	}

	private getLocalResults(query: ITextQuery): ResourceMap<IFileMatch> {
		const localResults = new ResourceMap<IFileMatch>();

		if (query.type === QueryType.Text) {
			const models = this.modelService.getModels();
			models.forEach((model) => {
				const resource = model.uri;
				if (!resource) {
					return;
				}

				if (!this.editorService.isOpen({ resource })) {
					return;
				}

				// Support untitled files
				if (resource.scheme === Schemas.untitled) {
					if (!this.untitledEditorService.exists(resource)) {
						return;
					}
				}

				// Don't support other resource schemes than files for now
				// todo@remote
				// why is that? we should search for resources from other
				// schemes
				else if (resource.scheme !== Schemas.file) {
					return;
				}

				if (!this.matches(resource, query)) {
					return; // respect user filters
				}

				// Use editor API to find matches
				const matches = model.findMatches(query.contentPattern.pattern, false, query.contentPattern.isRegExp, query.contentPattern.isCaseSensitive, query.contentPattern.isWordMatch ? query.contentPattern.wordSeparators : null, false, query.maxResults);
				if (matches.length) {
					const fileMatch = new FileMatch(resource);
					localResults.set(resource, fileMatch);

					const textSearchResults = editorMatchesToTextSearchResults(matches, model, query.previewOptions);
					fileMatch.results = addContextToEditorMatches(textSearchResults, model, query);
				} else {
					localResults.set(resource, null);
				}
			});
		}

		return localResults;
	}

	private matches(resource: uri, query: ITextQuery): boolean {
		// includes
		if (query.includePattern) {
			if (resource.scheme !== Schemas.file) {
				return false; // if we match on file patterns, we have to ignore non file resources
			}
		}

		return pathIncludedInQuery(query, resource.fsPath);
	}

	clearCache(cacheKey: string): Promise<void> {
		const clearPs = [
			this.diskSearch,
			...values(this.fileIndexProviders),
			...values(this.fileSearchProviders)
		].map(provider => provider && provider.clearCache(cacheKey));

		return Promise.all(clearPs)
			.then(() => { });
	}
}

export class DiskSearch implements ISearchResultProvider {
	_serviceBrand: any;

	private raw: IRawSearchService;

	constructor(
		verboseLogging: boolean,
		timeout: number = 60 * 60 * 1000,
		searchDebug: IDebugParams | undefined,
		@ILogService private readonly logService: ILogService
	) {
		const opts: IIPCOptions = {
			serverName: 'Search',
			timeout: timeout,
			args: ['--type=searchService'],
			// See https://github.com/Microsoft/vscode/issues/27665
			// Pass in fresh execArgv to the forked process such that it doesn't inherit them from `process.execArgv`.
			// e.g. Launching the extension host process with `--inspect-brk=xxx` and then forking a process from the extension host
			// results in the forked process inheriting `--inspect-brk=xxx`.
			freshExecArgv: true,
			env: {
				AMD_ENTRYPOINT: 'vs/workbench/services/search/node/searchApp',
				PIPE_LOGGING: 'true',
				VERBOSE_LOGGING: verboseLogging
			},
			useQueue: true
		};

		if (searchDebug) {
			if (searchDebug.break && searchDebug.port) {
				opts.debugBrk = searchDebug.port;
			} else if (!searchDebug.break && searchDebug.port) {
				opts.debug = searchDebug.port;
			}
		}

		const client = new Client(
			getPathFromAmdModule(require, 'bootstrap-fork'),
			opts);

		const channel = getNextTickChannel(client.getChannel('search'));
		this.raw = new SearchChannelClient(channel);
	}

	textSearch(query: ITextQuery, onProgress?: (p: ISearchProgressItem) => void, token?: CancellationToken): Promise<ISearchComplete> {
		const folderQueries = query.folderQueries || [];
		return Promise.all(folderQueries.map(q => q.folder.scheme === Schemas.file && pfs.exists(q.folder.fsPath)))
			.then(exists => {
				if (token && token.isCancellationRequested) {
					throw canceled();
				}

				query.folderQueries = folderQueries.filter((q, index) => exists[index]);
				const event: Event<ISerializedSearchProgressItem | ISerializedSearchComplete> = this.raw.textSearch(query);

				return DiskSearch.collectResultsFromEvent(event, onProgress, token);
			});
	}

	fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete> {
		const folderQueries = query.folderQueries || [];
		return Promise.all(folderQueries.map(q => q.folder.scheme === Schemas.file && pfs.exists(q.folder.fsPath)))
			.then(exists => {
				if (token && token.isCancellationRequested) {
					throw canceled();
				}

				query.folderQueries = folderQueries.filter((q, index) => exists[index]);
				let event: Event<ISerializedSearchProgressItem | ISerializedSearchComplete>;
				event = this.raw.fileSearch(query);

				const onProgress = (p: IProgress) => {
					if (p.message) {
						// Should only be for logs
						this.logService.debug('SearchService#search', p.message);
					}
				};

				return DiskSearch.collectResultsFromEvent(event, onProgress, token);
			});
	}

	/**
	 * Public for test
	 */
	static collectResultsFromEvent(event: Event<ISerializedSearchProgressItem | ISerializedSearchComplete>, onProgress?: (p: ISearchProgressItem) => void, token?: CancellationToken): Promise<ISearchComplete> {
		let result: IFileMatch[] = [];

		let listener: IDisposable;
		return new Promise<ISearchComplete>((c, e) => {
			if (token) {
				token.onCancellationRequested(() => {
					if (listener) {
						listener.dispose();
					}

					e(canceled());
				});
			}

			listener = event(ev => {
				if (isSerializedSearchComplete(ev)) {
					if (isSerializedSearchSuccess(ev)) {
						c({
							limitHit: ev.limitHit,
							results: result,
							stats: ev.stats
						});
					} else {
						e(ev.error);
					}

					listener.dispose();
				} else {
					// Matches
					if (Array.isArray(ev)) {
						const fileMatches = ev.map(d => this.createFileMatch(d));
						result = result.concat(fileMatches);
						if (onProgress) {
							fileMatches.forEach(onProgress);
						}
					}

					// Match
					else if ((<ISerializedFileMatch>ev).path) {
						const fileMatch = this.createFileMatch(<ISerializedFileMatch>ev);
						result.push(fileMatch);

						if (onProgress) {
							onProgress(fileMatch);
						}
					}

					// Progress
					else if (onProgress) {
						onProgress(<IProgress>ev);
					}
				}
			});
		});
	}

	private static createFileMatch(data: ISerializedFileMatch): FileMatch {
		const fileMatch = new FileMatch(uri.file(data.path));
		if (data.results) {
			// const matches = data.results.filter(resultIsMatch);
			fileMatch.results.push(...data.results);
		}
		return fileMatch;
	}

	clearCache(cacheKey: string): Promise<void> {
		return this.raw.clearCache(cacheKey);
	}
}
