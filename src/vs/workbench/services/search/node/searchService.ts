/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {PPromise} from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import glob = require('vs/base/common/glob');
import objects = require('vs/base/common/objects');
import strings = require('vs/base/common/strings');
import { Client } from 'vs/base/node/service.cp';
import {IProgress, LineMatch, FileMatch, ISearchComplete, ISearchProgressItem, QueryType, IFileMatch, ISearchQuery, ISearchConfiguration, ISearchService} from 'vs/platform/search/common/search';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/browser/untitledEditorService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IRawSearch, ISerializedSearchComplete, ISerializedSearchProgressItem, IRawSearchService, SearchService as RawSearchService} from 'vs/workbench/services/search/node/rawSearchService';

export class SearchService implements ISearchService {
	public serviceId = ISearchService;

	private diskSearch: DiskSearch;

	constructor(
		@IModelService private modelService: IModelService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		let config = contextService.getConfiguration();
		this.diskSearch = new DiskSearch(!config.env.isBuilt || config.env.verboseLogging);
	}

	public search(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {
		return this.configurationService.loadConfiguration().then((configuration: ISearchConfiguration) => {

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

			let rawSearchQuery: PPromise<void, ISearchProgressItem>;
			return new PPromise<ISearchComplete, ISearchProgressItem>((onComplete, onError, onProgress) => {

				// Get local results from dirty/untitled
				let localResultsFlushed = false;
				let localResults = this.getLocalResults(query);

				let flushLocalResultsOnce = function() {
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
						onComplete({ results: complete.results.filter((match) => typeof localResults[match.resource.toString()] === 'undefined'), limitHit: complete.limitHit }); // dont override local results
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
							if (typeof localResults[progress.resource.toString()] === 'undefined') { // dont override local results
								onProgress(progress);
							}
						}

						// Progress
						else {
							onProgress(<IProgress>progress);
						}
					});
			}, () => rawSearchQuery && rawSearchQuery.cancel());
		});
	}

	private getLocalResults(query: ISearchQuery): { [resourcePath: string]: IFileMatch; } {
		let localResults: { [resourcePath: string]: IFileMatch; } = Object.create(null);

		if (query.type === QueryType.Text) {
			let models = this.modelService.getModels();
			models.forEach((model) => {
				let resource = model.getAssociatedResource();
				if (!resource) {
					return;
				}

				// Support untitled files
				if (resource.scheme === 'untitled') {
					if (!this.untitledEditorService.get(resource)) {
						return;
					}
				}

				// Dont support other resource schemes than files for now
				else if (resource.scheme !== 'file') {
					return;
				}

				if (!this.matches(resource, query.filePatterns.map((p) => this.patternToRegExp(p.pattern)), query.includePattern, query.excludePattern)) {
					return; // respect user filters
				}

				// Use editor API to find matches
				let ranges = model.findMatches(query.contentPattern.pattern, false, query.contentPattern.isRegExp, query.contentPattern.isCaseSensitive, query.contentPattern.isWordMatch);
				if (ranges.length) {
					let fileMatch = new FileMatch(resource);
					localResults[resource.toString()] = fileMatch;

					ranges.forEach((range) => {
						fileMatch.lineMatches.push(new LineMatch(model.getLineContent(range.startLineNumber), range.startLineNumber - 1, [[range.startColumn - 1, range.endColumn - range.startColumn]]));
					});
				} else {
					localResults[resource.toString()] = false; // flag as empty result
				}
			});
		}

		return localResults;
	}

	private patternToRegExp(pattern: string): RegExp {
		if (pattern[0] === '.') {
			pattern = '*' + pattern; // convert a .<something> to a *.<something> query
		}

		// escape to regular expressions
		pattern = strings.anchorPattern(strings.convertSimple2RegExpPattern(pattern), true, false);

		return new RegExp(pattern, 'i');
	}

	private matches(resource: uri, filePatterns: RegExp[], includePattern: glob.IExpression, excludePattern: glob.IExpression): boolean {
		let workspaceRelativePath = this.contextService.toWorkspaceRelativePath(resource);

		// file patterns
		if (filePatterns && filePatterns.length) {
			if (resource.scheme !== 'file') {
				return false; // if we match on file pattern, we have to ignore non file resources
			}

			if (!filePatterns.some((pattern) => pattern.test(resource.fsPath))) {
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
}

class DiskSearch {

	private raw: IRawSearchService;

	constructor(verboseLogging: boolean) {
		const client = new Client(
			uri.parse(require.toUrl('bootstrap')).fsPath,
			{
				serverName: 'Search',
				timeout: 60 * 1000,
				args: ['--type=searchService'],
				env: {
					AMD_ENTRYPOINT: 'vs/workbench/services/search/node/searchApp',
					PIPE_LOGGING: 'true',
					VERBOSE_LOGGING: verboseLogging
				}
			}
		);

		this.raw = client.getService<IRawSearchService>('SearchService', RawSearchService);
	}

	public search(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {
		let result: IFileMatch[] = [];
		let request: PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>;

		let rootResources: uri[] = [];
		if (query.rootResources) {
			rootResources.push(...query.rootResources);
		}

		let rawSearch: IRawSearch = {
			rootPaths: rootResources.map(r => r.fsPath),
			filePatterns: query.filePatterns,
			excludePattern: query.excludePattern,
			includePattern: query.includePattern,
			maxResults: query.maxResults
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

		return new PPromise<ISearchComplete, ISearchProgressItem>((c, e, p) => {
			request.done((complete) => {
				c({
					limitHit: complete.limitHit,
					results: result
				});
			}, e, (data) => {

				// Match
				if (data.path) {
					let fileMatch = new FileMatch(uri.file(data.path));
					result.push(fileMatch);

					if (data.lineMatches) {
						for (let j = 0; j < data.lineMatches.length; j++) {
							fileMatch.lineMatches.push(new LineMatch(data.lineMatches[j].preview, data.lineMatches[j].lineNumber, data.lineMatches[j].offsetAndLengths));
						}
					}

					p(fileMatch);
				}

				// Progress
				else {
					p(<IProgress>data);
				}
			});
		}, () => request.cancel());
	}
}