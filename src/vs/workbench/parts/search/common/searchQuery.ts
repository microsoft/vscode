/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// import nls = require('vs/nls');
import * as collections from 'vs/base/common/collections';
import * as glob from 'vs/base/common/glob';
import * as paths from 'vs/base/common/paths';
import * as strings from 'vs/base/common/strings';
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

		const { searchPaths, includePattern } = this.getSearchPaths(options.includePattern);

		const excludePattern = patternListToIExpression(splitGlobPattern(options.excludePattern));

		return {
			type,
			folderQueries,
			extraFileResources: options.extraFileResources,
			filePattern: options.filePattern,
			excludePattern,
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

	/**
	 * Take the includePattern as seen in the search viewlet, and split into components that look like searchPaths, and
	 * glob patterns. Glob patterns are expanded from 'foo/bar' to '{foo/bar/**, **\/foo/bar}
	 */
	private getSearchPaths(pattern: string): { searchPaths: string[]; includePattern: glob.IExpression } {
		const isSearchPath = (segment: string) => {
			// A segment is a search path if it is an absolute path or starts with ./
			return paths.isAbsolute(segment) || strings.startsWith(segment, './');
		};

		const segments = splitGlobPattern(pattern);
		const groups = collections.groupBy(segments,
			segment => isSearchPath(segment) ? 'searchPaths' : 'exprSegments');
		groups.searchPaths = groups.searchPaths || [];
		groups.exprSegments = groups.exprSegments || [];

		const searchPaths = groups.searchPaths;
		const exprSegments = groups.exprSegments
			.map(p => {
				if (p[0] === '.') {
					p = '*' + p; // convert ".js" to "*.js"
				}

				return strings.format('{{0}/**,**/{1}}', p, p); // convert foo to {foo/**,**/foo} to cover files and folders
			});

		const { absoluteSearchPaths, additionalIncludePatterns } = this.splitSearchPaths(searchPaths);
		const expression = patternListToIExpression(exprSegments.concat(additionalIncludePatterns));

		return {
			searchPaths: absoluteSearchPaths,
			includePattern: expression
		};
	}

	private getExcludesForFolder(folderConfig: ISearchConfiguration, options: IQueryOptions): glob.IExpression | null {
		return options.disregardExcludeSettings ?
			null :
			getExcludes(folderConfig);
	}

	/**
	 * Split search paths (./ or absolute paths in the includePatterns) into absolute paths and globs applied to those paths
	 */
	private splitSearchPaths(searchPaths: string[]): { absoluteSearchPaths: string[], additionalIncludePatterns: string[] } {
		if (!this.workspaceContextService.hasWorkspace() || !searchPaths.length) {
			// No workspace => ignore search paths
			return {
				absoluteSearchPaths: [],
				additionalIncludePatterns: []
			};
		}

		const absoluteSearchPaths: string[] = [];
		const additionalIncludePatterns: string[] = [];

		for (const searchPath of searchPaths) {
			// 1 open folder => just resolve the search paths to absolute paths
			const { pathPortion, globPortion } = splitGlobFromPath(searchPath);
			const absolutePathPortions = this.expandAbsoluteSearchPaths(pathPortion);
			absoluteSearchPaths.push(...absolutePathPortions);

			if (globPortion) {
				additionalIncludePatterns.push(...absolutePathPortions.map(abs => paths.join(abs, globPortion)));
			}
		}

		return {
			absoluteSearchPaths,
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

function patternListToIExpression(patterns: string[]): glob.IExpression {
	return patterns.reduce((glob, cur) => { glob[cur] = true; return glob; }, Object.create(null));
}

function splitGlobPattern(pattern: string): string[] {
	return glob.splitGlobAware(pattern, ',')
		.map(s => s.trim())
		.filter(s => !!s.length);
}
