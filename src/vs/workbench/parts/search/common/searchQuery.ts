/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { IExpression } from 'vs/base/common/glob';
import * as objects from 'vs/base/common/objects';
import * as paths from 'vs/base/common/paths';
import uri from 'vs/base/common/uri';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IPatternInfo, IQueryOptions, IFolderQueryOptions, ISearchQuery, QueryType, ISearchConfiguration, getExcludes } from 'vs/platform/search/common/search';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class QueryBuilder {

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService) {
	}

	public text(contentPattern: IPatternInfo, folderResources?: uri[], options?: IQueryOptions): ISearchQuery {
		return this.query(QueryType.Text, contentPattern, folderResources, options);
	}

	public file(folderResources?: uri[], options?: IQueryOptions): ISearchQuery {
		return this.query(QueryType.File, null, folderResources, options);
	}

	private query(type: QueryType, contentPattern: IPatternInfo, folderResources?: uri[], options: IQueryOptions = {}): ISearchQuery {
		const folderQueries = folderResources && folderResources.map(folder => {
			const folderConfig = this.configurationService.getConfiguration<ISearchConfiguration>(undefined, { resource: folder });
			return <IFolderQueryOptions>{
				folder,
				excludePattern: this.getExcludesForFolder(folderConfig, options),
				fileEncoding: folderConfig.files.encoding
			};
		});

		const useRipgrep = !folderResources || folderResources.every(folder => {
			const folderConfig = this.configurationService.getConfiguration<ISearchConfiguration>(undefined, { resource: folder });
			return folderConfig.search.useRipgrep;
		});

		const searchPaths = this.getSearchPaths(options).searchPaths;

		return {
			type,
			folderQueries,
			extraFileResources: options.extraFileResources,
			filePattern: options.filePattern,
			excludePattern: options.excludePattern,
			includePattern: options.includePattern,
			maxResults: options.maxResults,
			sortByScore: options.sortByScore,
			cacheKey: options.cacheKey,
			contentPattern: contentPattern,
			useRipgrep,
			disregardIgnoreFiles: options.disregardIgnoreFiles,
			disregardExcludeSettings: options.disregardExcludeSettings,
			searchPaths
		};
	}

	private getExcludesForFolder(folderConfig: ISearchConfiguration, options: IQueryOptions): IExpression | null {
		const settingsExcludePattern = getExcludes(folderConfig);

		if (options.disregardExcludeSettings) {
			return null;
		} else if (options.excludePattern) {
			return objects.mixin(options.excludePattern, settingsExcludePattern, false /* no overwrite */);
		} else {
			return settingsExcludePattern;
		}
	}

	private getSearchPaths(options: IQueryOptions): { searchPaths: string[], additionalIncludePatterns: string[] } {
		if (!this.workspaceContextService.hasWorkspace() || !options.searchPaths) {
			// No workspace => ignore search paths
			return {
				searchPaths: [],
				additionalIncludePatterns: []
			};
		}

		const workspace = this.workspaceContextService.getWorkspace();
		if (workspace.roots.length < 2) {
			// 1 open folder => just resolve the search paths to absolute paths
			const searchPaths = options.searchPaths.map(searchPath => {
				const relativeSearchPathMatch = searchPath.match(/\.\/(.+)/);
				if (relativeSearchPathMatch) {
					return paths.join(workspace.roots[0].fsPath, relativeSearchPathMatch[1]);
				} else {
					return null;
				}
			});

			return {
				searchPaths,
				additionalIncludePatterns: []
			};
		}

		// Is a multiroot workspace
		const searchPaths: string[] = [];
		const additionalIncludePatterns: string[] = [];

		// Resolve searchPaths, relative or absolute, against roots
		for (const searchPath of options.searchPaths) {
			if (paths.isAbsolute(searchPath)) {
				searchPaths.push(searchPath); // later, pull out globs
			} else {
				const relativeSearchPathMatch = searchPath.match(/\.\/(.+)\/(.+)/);
				if (relativeSearchPathMatch) {
					const searchPathRoot = relativeSearchPathMatch[1];
					const matchingRoots = workspace.roots.filter(root => paths.basename(root.fsPath) === searchPathRoot);
					if (!matchingRoots.length) {
						throw new Error(nls.localize('search.invalidRootFolder', 'No root folder named {}', searchPathRoot));
					}

					searchPaths.push(...matchingRoots.map(root => paths.join(root.fsPath, relativeSearchPathMatch[2])));
				} else {
					// Malformed ./ search path
					throw new Error(nls.localize('search.invalidRelativeInclude', 'Invalid folder include pattern: {}', searchPath));
				}
			}
		}

		return { searchPaths, additionalIncludePatterns };
	}
}