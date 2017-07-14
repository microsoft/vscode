/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// import nls = require('vs/nls');
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

		const { searchPaths, additionalIncludePatterns } = this.getSearchPaths(options);
		const includePattern = objects.clone(options.includePattern);
		for (const additionalInclude of additionalIncludePatterns) {
			includePattern[additionalInclude] = true;
		}

		return {
			type,
			folderQueries,
			extraFileResources: options.extraFileResources,
			filePattern: options.filePattern,
			excludePattern: options.excludePattern,
			includePattern,
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

		const searchPaths: string[] = [];
		const additionalIncludePatterns: string[] = [];

		for (const searchPath of options.searchPaths) {
			// 1 open folder => just resolve the search paths to absolute paths
			const { pathPortion, globPortion } = splitGlobFromPath(searchPath);
			const absolutePathPortions = this.expandAbsoluteSearchPaths(pathPortion);
			searchPaths.push(...absolutePathPortions);

			if (globPortion) {
				additionalIncludePatterns.push(...absolutePathPortions.map(abs => paths.join(abs, globPortion)));
			}
		}

		return {
			searchPaths,
			additionalIncludePatterns
		};
	}

	private expandAbsoluteSearchPaths(searchPath: string): string[] {
		if (paths.isAbsolute(searchPath)) {
			return [searchPath];
		}

		const workspace = this.workspaceContextService.getWorkspace();
		if (workspace.roots.length === 1) {
			return [paths.join(workspace.roots[0].fsPath, searchPath)];
		} else {
			const relativeSearchPathMatch = searchPath.match(/\.\/([^\/]+)(\/.+)?/);
			if (relativeSearchPathMatch) {
				const searchPathRoot = relativeSearchPathMatch[1];
				const matchingRoots = workspace.roots.filter(root => paths.basename(root.fsPath) === searchPathRoot);
				if (matchingRoots.length) {
					return matchingRoots.map(root => paths.join(root.fsPath, relativeSearchPathMatch[2] || ''));
				} else {
					// throw new Error(nls.localize('search.invalidRootFolder', 'No root folder named {}', searchPathRoot));
				}
			} else {
				// Malformed ./ search path
				// throw new Error(nls.localize('search.invalidRelativeInclude', 'Invalid folder include pattern: {}', searchPath));
			}
		}

		return [];
	}
}

function splitGlobFromPath(searchPath: string): { pathPortion: string, globPortion?: string } {
	const globCharMatch = searchPath.match(/[\*\{\}\(\)\[\]\?]/);
	if (globCharMatch) {
		const globCharIdx = globCharMatch.index;
		const lastSlashMatch = searchPath.substr(0, globCharIdx).match(/[/|\\][^/\\]*$/);
		if (lastSlashMatch) {
			return {
				pathPortion: searchPath.substr(0, lastSlashMatch.index),
				globPortion: searchPath.substr(lastSlashMatch.index + 1)
			};
		}
	}

	// No glob char, or malformed
	return {
		pathPortion: searchPath
	};
}
