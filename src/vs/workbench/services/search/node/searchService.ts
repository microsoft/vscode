/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import glob = require('vs/base/common/glob');
import objects = require('vs/base/common/objects');
import scorer = require('vs/base/common/scorer');
import strings = require('vs/base/common/strings');
import { getNextTickChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import { IProgress, LineMatch, FileMatch, ISearchComplete, ISearchProgressItem, QueryType, IFileMatch, ISearchQuery, ISearchConfiguration, ISearchService } from 'vs/platform/search/common/search';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IRawSearch, ISerializedSearchComplete, ISerializedSearchProgressItem, ISerializedFileMatch, IRawSearchService } from './search';
import { ISearchChannel, SearchChannelClient } from './searchIpc';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export class SearchService implements ISearchService {
	public _serviceBrand: any;

	private diskSearch: DiskSearch;

	constructor(
		@IModelService private modelService: IModelService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.diskSearch = new DiskSearch(!environmentService.isBuilt || environmentService.verbose);
	}

	public extendQuery(query: ISearchQuery): void {
		const configuration = this.configurationService.getConfiguration<ISearchConfiguration>();

		// Configuration: Encoding
		if (!query.fileEncoding) {
			let fileEncoding = configuration && configuration.files && configuration.files.encoding;
			query.fileEncoding = fileEncoding;
		}

		// Configuration: File Excludes
		let fileExcludes = configuration && configuration.files && configuration.files.exclude;
		if (fileExcludes) {
			if (!query.excludePattern) {
				query.excludePattern = fileExcludes;
			} else {
				objects.mixin(query.excludePattern, fileExcludes, false /* no overwrite */);
			}
		}
	}

	public search(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {
		this.extendQuery(query);

		let rawSearchQuery: PPromise<void, ISearchProgressItem>;
		return new PPromise<ISearchComplete, ISearchProgressItem>((onComplete, onError, onProgress) => {

			// Get local results from dirty/untitled
			let localResultsFlushed = false;
			let localResults = this.getLocalResults(query);

			let flushLocalResultsOnce = function () {
				if (!localResultsFlushed) {
					localResultsFlushed = true;
					Object.keys(localResults).map((key) => localResults[key]).filter((res) => !!res).forEach(onProgress);
				}
			};

			// Delegate to parent for real file results
			rawSearchQuery = this.diskSearch.search(query).then(

				// on Complete
				(complete) => {
					flushLocalResultsOnce();
					onComplete({
						limitHit: complete.limitHit,
						results: complete.results.filter((match) => typeof localResults[match.resource.toString()] === 'undefined'), // dont override local results
						stats: complete.stats
					});
				},

				// on Error
				(error) => {
					flushLocalResultsOnce();
					onError(error);
				},

				// on Progress
				(progress) => {
					flushLocalResultsOnce();

					// Match
					if (progress.resource) {
						if (typeof localResults[progress.resource.toString()] === 'undefined') { // don't override local results
							onProgress(progress);
						}
					}

					// Progress
					else {
						onProgress(<IProgress>progress);
					}
				});
		}, () => rawSearchQuery && rawSearchQuery.cancel());
	}

	private getLocalResults(query: ISearchQuery): { [resourcePath: string]: IFileMatch; } {
		let localResults: { [resourcePath: string]: IFileMatch; } = Object.create(null);

		if (query.type === QueryType.Text) {
			let models = this.modelService.getModels();
			models.forEach((model) => {
				let resource = model.uri;
				if (!resource) {
					return;
				}

				// Support untitled files
				if (resource.scheme === 'untitled') {
					if (!this.untitledEditorService.get(resource)) {
						return;
					}
				}

				// Don't support other resource schemes than files for now
				else if (resource.scheme !== 'file') {
					return;
				}

				if (!this.matches(resource, query.filePattern, query.includePattern, query.excludePattern)) {
					return; // respect user filters
				}

				// Use editor API to find matches
				let matches = model.findMatches(query.contentPattern.pattern, false, query.contentPattern.isRegExp, query.contentPattern.isCaseSensitive, query.contentPattern.isWordMatch, false);
				if (matches.length) {
					let fileMatch = new FileMatch(resource);
					localResults[resource.toString()] = fileMatch;

					matches.forEach((match) => {
						fileMatch.lineMatches.push(new LineMatch(model.getLineContent(match.range.startLineNumber), match.range.startLineNumber - 1, [[match.range.startColumn - 1, match.range.endColumn - match.range.startColumn]]));
					});
				} else {
					localResults[resource.toString()] = false; // flag as empty result
				}
			});
		}

		return localResults;
	}

	private matches(resource: uri, filePattern: string, includePattern: glob.IExpression, excludePattern: glob.IExpression): boolean {
		let workspaceRelativePath = this.contextService.toWorkspaceRelativePath(resource);

		// file pattern
		if (filePattern) {
			if (resource.scheme !== 'file') {
				return false; // if we match on file pattern, we have to ignore non file resources
			}

			if (!scorer.matches(resource.fsPath, strings.stripWildcards(filePattern).toLowerCase())) {
				return false;
			}
		}

		// includes
		if (includePattern) {
			if (resource.scheme !== 'file') {
				return false; // if we match on file patterns, we have to ignore non file resources
			}

			if (!glob.match(includePattern, workspaceRelativePath || resource.fsPath)) {
				return false;
			}
		}

		// excludes
		if (excludePattern) {
			if (resource.scheme !== 'file') {
				return true; // e.g. untitled files can never be excluded with file patterns
			}

			if (glob.match(excludePattern, workspaceRelativePath || resource.fsPath)) {
				return false;
			}
		}

		return true;
	}

	public clearCache(cacheKey: string): TPromise<void> {
		return this.diskSearch.clearCache(cacheKey);
	}
}

export class DiskSearch {

	private raw: IRawSearchService;

	constructor(verboseLogging: boolean) {
		const client = new Client(
			uri.parse(require.toUrl('bootstrap')).fsPath,
			{
				serverName: 'Search',
				timeout: 60 * 60 * 1000,
				args: ['--type=searchService'],
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
			rootFolders: query.folderResources ? query.folderResources.map(r => r.fsPath) : [],
			extraFiles: query.extraFileResources ? query.extraFileResources.map(r => r.fsPath) : [],
			filePattern: query.filePattern,
			excludePattern: query.excludePattern,
			includePattern: query.includePattern,
			maxResults: query.maxResults,
			sortByScore: query.sortByScore,
			cacheKey: query.cacheKey
		};

		if (query.type === QueryType.Text) {
			rawSearch.contentPattern = query.contentPattern;
			rawSearch.fileEncoding = query.fileEncoding;
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