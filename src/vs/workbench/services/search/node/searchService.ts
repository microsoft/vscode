/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import objects = require('vs/base/common/objects');
import scorer = require('vs/base/common/scorer');
import strings = require('vs/base/common/strings');
import { getNextTickChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import { IProgress, LineMatch, FileMatch, ISearchComplete, ISearchProgressItem, QueryType, IFileMatch, ISearchQuery, ISearchConfiguration, ISearchService, pathIncludedInQuery, ISearchResultProvider } from 'vs/platform/search/common/search';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IRawSearch, IFolderSearch, ISerializedSearchComplete, ISerializedSearchProgressItem, ISerializedFileMatch, IRawSearchService } from './search';
import { ISearchChannel, SearchChannelClient } from './searchIpc';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ResourceMap } from 'vs/base/common/map';
import { IDisposable } from 'vs/base/common/lifecycle';

export class SearchService implements ISearchService {
	public _serviceBrand: any;

	private diskSearch: DiskSearch;
	private readonly searchProvider: ISearchResultProvider[] = [];

	constructor(
		@IModelService private modelService: IModelService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.diskSearch = new DiskSearch(!environmentService.isBuilt || environmentService.verbose);
		this.registerSearchResultProvider(this.diskSearch);
	}

	public registerSearchResultProvider(provider: ISearchResultProvider): IDisposable {
		this.searchProvider.push(provider);
		return {
			dispose: () => {
				const idx = this.searchProvider.indexOf(provider);
				if (idx >= 0) {
					this.searchProvider.splice(idx, 1);
				}
			}
		};
	}

	public extendQuery(query: ISearchQuery): void {
		const configuration = this.configurationService.getConfiguration<ISearchConfiguration>();

		// Configuration: Encoding
		if (!query.fileEncoding) {
			const fileEncoding = configuration && configuration.files && configuration.files.encoding;
			query.fileEncoding = fileEncoding;
		}

		// Configuration: File Excludes
		if (!query.disregardExcludeSettings) {
			const fileExcludes = configuration && configuration.files && configuration.files.exclude;
			if (fileExcludes) {
				if (!query.excludePattern) {
					query.excludePattern = fileExcludes;
				} else {
					objects.mixin(query.excludePattern, fileExcludes, false /* no overwrite */);
				}
			}
		}
	}

	public search(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {

		let combinedPromise: TPromise<void>;

		return new PPromise<ISearchComplete, ISearchProgressItem>((onComplete, onError, onProgress) => {

			// Get local results from dirty/untitled
			const localResults = this.getLocalResults(query);

			// Allow caller to register progress callback
			process.nextTick(() => localResults.values().filter((res) => !!res).forEach(onProgress));

			const providerPromises = this.searchProvider.map(provider => TPromise.wrap(provider.search(query)).then(e => e,
				err => {
					// TODO@joh
					// single provider fail. fail all?
					onError(err);
				},
				progress => {
					if (progress.resource) {
						// Match
						if (!localResults.has(progress.resource)) { // don't override local results
							onProgress(progress);
						}
					} else {
						// Progress
						onProgress(<IProgress>progress);
					}
				}
			));

			combinedPromise = TPromise.join(providerPromises).then(values => {

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
				if (resource.scheme === 'untitled') {
					if (!this.untitledEditorService.exists(resource)) {
						return;
					}
				}

				// Don't support other resource schemes than files for now
				else if (resource.scheme !== 'file') {
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
			if (resource.scheme !== 'file') {
				return false; // if we match on file pattern, we have to ignore non file resources
			}

			if (!scorer.matches(resource.fsPath, strings.stripWildcards(query.filePattern).toLowerCase())) {
				return false;
			}
		}

		// includes
		if (query.includePattern) {
			if (resource.scheme !== 'file') {
				return false; // if we match on file patterns, we have to ignore non file resources
			}
		}

		return pathIncludedInQuery(query, resource.fsPath);
	}

	public clearCache(cacheKey: string): TPromise<void> {
		return this.diskSearch.clearCache(cacheKey);
	}
}

export class DiskSearch implements ISearchResultProvider {

	private raw: IRawSearchService;

	constructor(verboseLogging: boolean, timeout: number = 60 * 60 * 1000) {
		const client = new Client(
			uri.parse(require.toUrl('bootstrap')).fsPath,
			{
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
			}
		);

		const channel = getNextTickChannel(client.getChannel<ISearchChannel>('search'));
		this.raw = new SearchChannelClient(channel);
	}

	public search(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {
		let request: PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>;

		let rawSearch: IRawSearch = {
			folderQueries: query.folderQueries ? query.folderQueries.map(q => {
				return <IFolderSearch>{
					excludePattern: q.excludePattern,
					includePattern: q.includePattern,
					fileEncoding: q.fileEncoding,
					folder: q.folder.fsPath
				};
			}) : [],
			extraFiles: query.extraFileResources ? query.extraFileResources.map(r => r.fsPath) : [],
			filePattern: query.filePattern,
			excludePattern: query.excludePattern,
			includePattern: query.includePattern,
			maxResults: query.maxResults,
			sortByScore: query.sortByScore,
			cacheKey: query.cacheKey,
			useRipgrep: query.useRipgrep,
			disregardIgnoreFiles: query.disregardIgnoreFiles
		};

		if (query.type === QueryType.Text) {
			rawSearch.contentPattern = query.contentPattern;
		}

		if (query.type === QueryType.File) {
			request = this.raw.fileSearch(rawSearch);
		} else {
			request = this.raw.textSearch(rawSearch);
		}

		return DiskSearch.collectResults(request);
	}

	public static collectResults(request: PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>): PPromise<ISearchComplete, ISearchProgressItem> {
		let result: IFileMatch[] = [];
		return new PPromise<ISearchComplete, ISearchProgressItem>((c, e, p) => {
			request.done((complete) => {
				c({
					limitHit: complete.limitHit,
					results: result,
					stats: complete.stats
				});
			}, e, (data) => {

				// Matches
				if (Array.isArray(data)) {
					const fileMatches = data.map(d => this.createFileMatch(d));
					result = result.concat(fileMatches);
					fileMatches.forEach(p);
				}

				// Match
				else if ((<ISerializedFileMatch>data).path) {
					const fileMatch = this.createFileMatch(<ISerializedFileMatch>data);
					result.push(fileMatch);
					p(fileMatch);
				}

				// Progress
				else {
					p(<IProgress>data);
				}
			});
		}, () => request.cancel());
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
