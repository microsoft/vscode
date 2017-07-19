/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// import nls = require('vs/nls');
import * as arrays from 'vs/base/common/arrays';
import * as collections from 'vs/base/common/collections';
import * as glob from 'vs/base/common/glob';
import * as paths from 'vs/base/common/paths';
import * as strings from 'vs/base/common/strings';
import uri from 'vs/base/common/uri';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IPatternInfo, IQueryOptions, IFolderQuery, ISearchQuery, QueryType, ISearchConfiguration, getExcludes } from 'vs/platform/search/common/search';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

interface ISearchPathPattern {
	searchPath: uri;
	pattern?: string;
}

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
		let { searchPaths, includePattern } = this.getSearchPaths(options.includePattern);

		// Build folderQueries from searchPaths, if given, otherwise folderResources
		searchPaths = (searchPaths && searchPaths.length) ?
			searchPaths :
			folderResources && folderResources.map(fr => <ISearchPathPattern>{ searchPath: fr });

		const folderQueries = searchPaths && searchPaths.map(searchPath => {
			const folderQuery = this.getFolderQuery(searchPath.searchPath, options);
			if (searchPath.pattern) {
				folderQuery.includePattern = patternListToIExpression([searchPath.pattern]);
			}

			return folderQuery;
		});

		const useRipgrep = !folderResources || folderResources.every(folder => {
			const folderConfig = this.configurationService.getConfiguration<ISearchConfiguration>(undefined, { resource: folder });
			return folderConfig.search.useRipgrep;
		});

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
			disregardExcludeSettings: options.disregardExcludeSettings
		};
	}

	/**
	 * Take the includePattern as seen in the search viewlet, and split into components that look like searchPaths, and
	 * glob patterns. Glob patterns are expanded from 'foo/bar' to '{foo/bar/**, **\/foo/bar}
	 */
	private getSearchPaths(pattern: string): { searchPaths: ISearchPathPattern[]; includePattern?: glob.IExpression } {
		const isSearchPath = (segment: string) => {
			// A segment is a search path if it is an absolute path or starts with ./
			return paths.isAbsolute(segment) || strings.startsWith(segment, './');
		};

		const segments = splitGlobPattern(pattern);
		const groups = collections.groupBy(segments,
			segment => isSearchPath(segment) ? 'searchPaths' : 'exprSegments');

		const exprSegments = (groups.exprSegments || [])
			.map(p => {
				if (p[0] === '.') {
					p = '*' + p; // convert ".js" to "*.js"
				}

				return strings.format('{{0}/**,**/{1}}', p, p); // convert foo to {foo/**,**/foo} to cover files and folders
			});

		return {
			searchPaths: this.expandSearchPathPatterns(groups.searchPaths),
			includePattern: patternListToIExpression(exprSegments)
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
	private expandSearchPathPatterns(searchPaths: string[]): ISearchPathPattern[] {
		if (!this.workspaceContextService.hasWorkspace() || !searchPaths || !searchPaths.length) {
			// No workspace => ignore search paths
			return [];
		}

		return arrays.flatten(searchPaths.map(searchPath => {
			// 1 open folder => just resolve the search paths to absolute paths
			const { pathPortion, globPortion } = splitGlobFromPath(searchPath);
			const pathPortions = this.expandAbsoluteSearchPaths(pathPortion);
			return pathPortions.map(searchPath => {
				return <ISearchPathPattern>{
					searchPath: uri.parse(searchPath),
					pattern: globPortion
				};
			});
		}));
	}

	/**
	 * Takes a searchPath like `./a/foo` and expands it to absolute paths for all the workspaces it matches.
	 */
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

	private getFolderQuery(folder: uri, options?: IQueryOptions): IFolderQuery {
		const folderConfig = this.configurationService.getConfiguration<ISearchConfiguration>(undefined, { resource: folder });
		return <IFolderQuery>{
			folder,
			excludePattern: this.getExcludesForFolder(folderConfig, options),
			fileEncoding: folderConfig.files.encoding
		};
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
	return patterns.length ?
		patterns.reduce((glob, cur) => { glob[cur] = true; return glob; }, Object.create(null)) :
		null;
}

function splitGlobPattern(pattern: string): string[] {
	return glob.splitGlobAware(pattern, ',')
		.map(s => s.trim())
		.filter(s => !!s.length);
}
