/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as arrays from 'vs/base/common/arrays';
import { Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap, values } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import * as objects from 'vs/base/common/objects';
import * as strings from 'vs/base/common/strings';
import uri from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as pfs from 'vs/base/node/pfs';
import { getNextTickChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client, IIPCOptions } from 'vs/base/parts/ipc/node/ipc.cp';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDebugParams, IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';
import { FileMatch, IFileMatch, IFolderQuery, IProgress, ISearchComplete, ISearchConfiguration, ISearchProgressItem, ISearchQuery, ISearchResultProvider, ISearchService, LineMatch, pathIncludedInQuery, QueryType, SearchProviderType } from 'vs/platform/search/common/search';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IRawSearch, IRawSearchService, ISerializedFileMatch, ISerializedSearchComplete, ISerializedSearchProgressItem, isSerializedSearchComplete, isSerializedSearchSuccess, ITelemetryEvent } from './search';
import { ISearchChannel, SearchChannelClient } from './searchIpc';
import { getPathFromAmdModule } from 'vs/base/common/amd';

export class SearchService extends Disposable implements ISearchService {
	public _serviceBrand: any;

	private diskSearch: DiskSearch;
	private readonly fileSearchProviders = new Map<string, ISearchResultProvider>();
	private readonly textSearchProviders = new Map<string, ISearchResultProvider>();
	private readonly fileIndexProviders = new Map<string, ISearchResultProvider>();

	constructor(
		@IModelService private modelService: IModelService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ILogService private logService: ILogService,
		@IExtensionService private extensionService: IExtensionService
	) {
		super();
		this.diskSearch = new DiskSearch(!environmentService.isBuilt || environmentService.verbose, /*timeout=*/undefined, environmentService.debugSearch);
		this._register(this.diskSearch.onTelemetry(event => {
			this.telemetryService.publicLog(event.eventName, event.data);
		}));
	}

	public registerSearchResultProvider(scheme: string, type: SearchProviderType, provider: ISearchResultProvider): IDisposable {
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

	public extendQuery(query: ISearchQuery): void {
		const configuration = this.configurationService.getValue<ISearchConfiguration>();

		// Configuration: Encoding
		if (!query.fileEncoding) {
			const fileEncoding = configuration && configuration.files && configuration.files.encoding;
			query.fileEncoding = fileEncoding;
		}

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

	public search(query: ISearchQuery, onProgress?: (item: ISearchProgressItem) => void): TPromise<ISearchComplete> {
		let combinedPromise: TPromise<void>;

		return new TPromise<ISearchComplete>((onComplete, onError) => {

			// Get local results from dirty/untitled
			const localResults = this.getLocalResults(query);

			if (onProgress) {
				localResults.values().filter((res) => !!res).forEach(onProgress);
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

			const startTime = Date.now();

			const schemesInQuery = query.folderQueries.map(fq => fq.folder.scheme);
			const providerActivations = schemesInQuery.map(scheme => this.extensionService.activateByEvent(`onSearch:${scheme}`));

			const providerPromise = TPromise.join(providerActivations)
				.then(() => this.searchWithProviders(query, onProviderProgress))
				.then(completes => {
					completes = completes.filter(c => !!c);
					if (!completes.length) {
						return null;
					}

					return <ISearchComplete>{
						limitHit: completes[0] && completes[0].limitHit,
						stats: completes[0].stats,
						results: arrays.flatten(completes.map(c => c.results))
					};
				}, errs => {
					if (!Array.isArray(errs)) {
						errs = [errs];
					}

					errs = errs.filter(e => !!e);
					return TPromise.wrapError(errs[0]);
				});

			combinedPromise = providerPromise.then(value => {
				this.logService.debug(`SearchService#search: ${Date.now() - startTime}ms`);
				const values = [value];

				const result: ISearchComplete = {
					limitHit: false,
					results: [],
					stats: undefined
				};

				// TODO@joh
				// sorting, disjunct results
				for (const value of values) {
					if (!value) {
						continue;
					}
					// TODO@joh individual stats/limit
					result.stats = value.stats || result.stats;
					result.limitHit = value.limitHit || result.limitHit;

					for (const match of value.results) {
						if (!localResults.has(match.resource)) {
							result.results.push(match);
						}
					}
				}

				return result;

			}).then(onComplete, onError);

		}, () => combinedPromise && combinedPromise.cancel());
	}

	private searchWithProviders(query: ISearchQuery, onProviderProgress: (progress: ISearchProgressItem) => void) {
		const diskSearchQueries: IFolderQuery[] = [];
		const searchPs = [];

		query.folderQueries.forEach(fq => {
			let provider = query.type === QueryType.File ?
				this.fileSearchProviders.get(fq.folder.scheme) || this.fileIndexProviders.get(fq.folder.scheme) :
				this.textSearchProviders.get(fq.folder.scheme);

			if (!provider && fq.folder.scheme === 'file') {
				diskSearchQueries.push(fq);
			} else if (!provider) {
				throw new Error('No search provider registered for scheme: ' + fq.folder.scheme);
			} else {
				const oneFolderQuery = {
					...query,
					...{
						folderQueries: [fq]
					}
				};

				searchPs.push(provider.search(oneFolderQuery, onProviderProgress));
			}
		});

		const diskSearchExtraFileResources = query.extraFileResources && query.extraFileResources.filter(res => res.scheme === 'file');

		if (diskSearchQueries.length || diskSearchExtraFileResources) {
			const diskSearchQuery: ISearchQuery = {
				...query,
				...{
					folderQueries: diskSearchQueries
				},
				extraFileResources: diskSearchExtraFileResources
			};

			searchPs.push(this.diskSearch.search(diskSearchQuery, onProviderProgress));
		}

		return TPromise.join(searchPs);
	}

	private getLocalResults(query: ISearchQuery): ResourceMap<IFileMatch> {
		const localResults = new ResourceMap<IFileMatch>();

		if (query.type === QueryType.Text) {
			let models = this.modelService.getModels();
			models.forEach((model) => {
				let resource = model.uri;
				if (!resource) {
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
				let matches = model.findMatches(query.contentPattern.pattern, false, query.contentPattern.isRegExp, query.contentPattern.isCaseSensitive, query.contentPattern.isWordMatch ? query.contentPattern.wordSeparators : null, false, query.maxResults);
				if (matches.length) {
					let fileMatch = new FileMatch(resource);
					localResults.set(resource, fileMatch);

					matches.forEach((match) => {
						fileMatch.lineMatches.push(new LineMatch(model.getLineContent(match.range.startLineNumber), match.range.startLineNumber - 1, [[match.range.startColumn - 1, match.range.endColumn - match.range.startColumn]]));
					});
				} else {
					localResults.set(resource, null);
				}
			});
		}

		return localResults;
	}

	private matches(resource: uri, query: ISearchQuery): boolean {
		// file pattern
		if (query.filePattern) {
			if (resource.scheme !== Schemas.file) {
				return false; // if we match on file pattern, we have to ignore non file resources
			}

			if (!strings.fuzzyContains(resource.fsPath, strings.stripWildcards(query.filePattern).toLowerCase())) {
				return false;
			}
		}

		// includes
		if (query.includePattern) {
			if (resource.scheme !== Schemas.file) {
				return false; // if we match on file patterns, we have to ignore non file resources
			}
		}

		return pathIncludedInQuery(query, resource.fsPath);
	}

	public clearCache(cacheKey: string): TPromise<void> {
		const clearPs = [
			this.diskSearch,
			...values(this.fileIndexProviders)
		].map(provider => provider && provider.clearCache(cacheKey));

		return TPromise.join(clearPs)
			.then(() => { });
	}
}

export class DiskSearch implements ISearchResultProvider {

	private raw: IRawSearchService;

	constructor(verboseLogging: boolean, timeout: number = 60 * 60 * 1000, searchDebug?: IDebugParams) {
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
			}
		};

		if (searchDebug) {
			if (searchDebug.break && searchDebug.port) {
				opts.debugBrk = searchDebug.port;
			} else if (!searchDebug.break && searchDebug.port) {
				opts.debug = searchDebug.port;
			}
		}

		const client = new Client(
			getPathFromAmdModule(require, 'bootstrap'),
			opts);

		const channel = getNextTickChannel(client.getChannel<ISearchChannel>('search'));
		this.raw = new SearchChannelClient(channel);
	}

	public get onTelemetry(): Event<ITelemetryEvent> {
		return this.raw.onTelemetry;
	}

	public search(query: ISearchQuery, onProgress?: (p: ISearchProgressItem) => void): TPromise<ISearchComplete> {
		const folderQueries = query.folderQueries || [];
		return TPromise.join(folderQueries.map(q => q.folder.scheme === Schemas.file && pfs.exists(q.folder.fsPath)))
			.then(exists => {
				const existingFolders = folderQueries.filter((q, index) => exists[index]);
				const rawSearch = this.rawSearchQuery(query, existingFolders);

				let event: Event<ISerializedSearchProgressItem | ISerializedSearchComplete>;
				if (query.type === QueryType.File) {
					event = this.raw.fileSearch(rawSearch);
				} else {
					event = this.raw.textSearch(rawSearch);
				}

				return DiskSearch.collectResultsFromEvent(event, onProgress);
			});
	}

	private rawSearchQuery(query: ISearchQuery, existingFolders: IFolderQuery[]) {
		let rawSearch: IRawSearch = {
			folderQueries: [],
			extraFiles: [],
			filePattern: query.filePattern,
			excludePattern: query.excludePattern,
			includePattern: query.includePattern,
			maxResults: query.maxResults,
			exists: query.exists,
			sortByScore: query.sortByScore,
			cacheKey: query.cacheKey,
			useRipgrep: query.useRipgrep,
			disregardIgnoreFiles: query.disregardIgnoreFiles,
			ignoreSymlinks: query.ignoreSymlinks
		};

		for (const q of existingFolders) {
			rawSearch.folderQueries.push({
				excludePattern: q.excludePattern,
				includePattern: q.includePattern,
				fileEncoding: q.fileEncoding,
				disregardIgnoreFiles: q.disregardIgnoreFiles,
				folder: q.folder.fsPath
			});
		}

		if (query.extraFileResources) {
			for (const r of query.extraFileResources) {
				if (r.scheme === Schemas.file) {
					rawSearch.extraFiles.push(r.fsPath);
				}
			}
		}

		if (query.type === QueryType.Text) {
			rawSearch.contentPattern = query.contentPattern;
		}

		return rawSearch;
	}

	public static collectResultsFromEvent(event: Event<ISerializedSearchProgressItem | ISerializedSearchComplete>, onProgress?: (p: ISearchProgressItem) => void): TPromise<ISearchComplete> {
		let result: IFileMatch[] = [];

		let listener: IDisposable;
		return new TPromise<ISearchComplete>((c, e) => {
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
		},
			() => listener && listener.dispose());
	}

	private static createFileMatch(data: ISerializedFileMatch): FileMatch {
		let fileMatch = new FileMatch(uri.file(data.path));
		if (data.lineMatches) {
			for (let j = 0; j < data.lineMatches.length; j++) {
				fileMatch.lineMatches.push(new LineMatch(data.lineMatches[j].preview, data.lineMatches[j].lineNumber, data.lineMatches[j].offsetAndLengths));
			}
		}
		return fileMatch;
	}

	public clearCache(cacheKey: string): TPromise<void> {
		return this.raw.clearCache(cacheKey);
	}
}
