/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import * as arrays from 'vs/base/common/arrays';
import * as objects from 'vs/base/common/objects';
import * as collections from 'vs/base/common/collections';
import * as glob from 'vs/base/common/glob';
import * as paths from 'vs/base/common/paths';
import * as strings from 'vs/base/common/strings';
import uri from 'vs/base/common/uri';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IPatternInfo, IQueryOptions, IFolderQuery, ISearchQuery, QueryType, ISearchConfiguration, getExcludes, pathIncludedInQuery } from 'vs/platform/search/common/search';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export interface ISearchPathPattern {
	searchPath: uri;
	pattern?: string;
}

export interface ISearchPathsResult {
	searchPaths?: ISearchPathPattern[];
	pattern?: glob.IExpression;
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
		let { searchPaths, pattern: includePattern } = this.parseSearchPaths(options.includePattern);
		let excludePattern = this.parseExcludePattern(options.excludePattern);

		// Build folderQueries from searchPaths, if given, otherwise folderResources
		let folderQueries = folderResources && folderResources.map(uri => this.getFolderQueryForRoot(uri, options));
		if (searchPaths && searchPaths.length) {
			const allRootExcludes = folderQueries && this.mergeExcludesFromFolderQueries(folderQueries);
			folderQueries = searchPaths.map(searchPath => this.getFolderQueryForSearchPath(searchPath));
			if (allRootExcludes) {
				excludePattern = objects.mixin(excludePattern || Object.create(null), allRootExcludes);
			}
		}

		const useRipgrep = !folderResources || folderResources.every(folder => {
			const folderConfig = this.configurationService.getConfiguration<ISearchConfiguration>(undefined, { resource: folder });
			return folderConfig.search.useRipgrep;
		});

		const query = <ISearchQuery>{
			type,
			folderQueries,
			usingSearchPaths: !!(searchPaths && searchPaths.length),
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

		// Filter extraFileResources against global include/exclude patterns - they are already expected to not belong to a workspace
		let extraFileResources = options.extraFileResources && options.extraFileResources.filter(extraFile => pathIncludedInQuery(query, extraFile.fsPath));
		query.extraFileResources = extraFileResources && extraFileResources.length ? extraFileResources : undefined;

		return query;
	}

	/**
	 * Take the includePattern as seen in the search viewlet, and split into components that look like searchPaths, and
	 * glob patterns. Glob patterns are expanded from 'foo/bar' to '{foo/bar/**, **\/foo/bar}.
	 *
	 * Public for test.
	 */
	public parseSearchPaths(pattern: string): ISearchPathsResult {
		const isSearchPath = (segment: string) => {
			// A segment is a search path if it is an absolute path or starts with ./
			return paths.isAbsolute(segment) || strings.startsWith(segment, './') || strings.startsWith(segment, '.\\');
		};

		const segments = splitGlobPattern(pattern);
		const groups = collections.groupBy(segments,
			segment => isSearchPath(segment) ? 'searchPaths' : 'exprSegments');

		const exprSegments = (groups.exprSegments || [])
			.map(p => {
				if (p[0] === '.') {
					p = '*' + p; // convert ".js" to "*.js"
				}

				return strings.format('{**/{0}/**,**/{0}}', p); // convert foo to {foo/**,**/foo} to cover files and folders
			});

		const result: ISearchPathsResult = {};
		const searchPaths = this.expandSearchPathPatterns(groups.searchPaths);
		if (searchPaths && searchPaths.length) {
			result.searchPaths = searchPaths;
		}

		const includePattern = patternListToIExpression(exprSegments);
		if (includePattern) {
			result.pattern = includePattern;
		}

		return result;
	}

	/**
	 * Takes the input from the excludePattern as seen in the searchViewlet. Runs the same algorithm as parseSearchPaths,
	 * but the result is a single IExpression that encapsulates all the exclude patterns.
	 */
	public parseExcludePattern(pattern: string): glob.IExpression | undefined {
		const result = this.parseSearchPaths(pattern);
		let excludeExpression = glob.getEmptyExpression();
		if (result.pattern) {
			excludeExpression = objects.mixin(excludeExpression, result.pattern);
		}

		if (result.searchPaths) {
			result.searchPaths.forEach(searchPath => {
				const excludeFsPath = searchPath.searchPath.fsPath;
				const excludePath = searchPath.pattern ?
					paths.join(excludeFsPath, searchPath.pattern) :
					excludeFsPath;

				excludeExpression[excludePath] = true;
			});
		}

		return Object.keys(excludeExpression).length ? excludeExpression : undefined;
	}

	private mergeExcludesFromFolderQueries(folderQueries: IFolderQuery[]): glob.IExpression | undefined {
		const mergedExcludes = folderQueries.reduce((merged: glob.IExpression, fq: IFolderQuery) => {
			if (fq.excludePattern) {
				objects.mixin(merged, this.getAbsoluteIExpression(fq.excludePattern, fq.folder.fsPath));
			}

			return merged;
		}, Object.create(null));

		// Don't return an empty IExpression
		return Object.keys(mergedExcludes).length ? mergedExcludes : undefined;
	}

	private getAbsoluteIExpression(expr: glob.IExpression, root: string): glob.IExpression {
		return Object.keys(expr)
			.reduce((absExpr: glob.IExpression, key: string) => {
				if (expr[key] && !paths.isAbsolute(key)) {
					const absPattern = paths.join(root, key);
					absExpr[absPattern] = true;
				}

				return absExpr;
			}, Object.create(null));
	}

	private getExcludesForFolder(folderConfig: ISearchConfiguration, options: IQueryOptions): glob.IExpression | undefined {
		return options.disregardExcludeSettings ?
			undefined :
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

		const searchPathPatterns = arrays.flatten(searchPaths.map(searchPath => {
			// 1 open folder => just resolve the search paths to absolute paths
			const { pathPortion, globPortion } = splitGlobFromPath(searchPath);
			const pathPortions = this.expandAbsoluteSearchPaths(pathPortion);
			return pathPortions.map(searchPath => {
				return <ISearchPathPattern>{
					searchPath: uri.file(searchPath),
					pattern: globPortion
				};
			});
		}));

		return searchPathPatterns.filter(arrays.uniqueFilter(searchPathPattern => searchPathPattern.searchPath.toString()));
	}

	/**
	 * Takes a searchPath like `./a/foo` and expands it to absolute paths for all the workspaces it matches.
	 */
	private expandAbsoluteSearchPaths(searchPath: string): string[] {
		if (paths.isAbsolute(searchPath)) {
			return [paths.normalize(searchPath)];
		}

		const workspace = this.workspaceContextService.getWorkspace();
		if (this.workspaceContextService.hasFolderWorkspace()) {
			return [paths.normalize(
				paths.join(workspace.roots[0].fsPath, searchPath))];
		} else if (searchPath === './') {
			return []; // ./ or ./**/foo makes sense for single-folder but not multi-folder workspaces
		} else {
			const relativeSearchPathMatch = searchPath.match(/\.[\/\\]([^\/\\]+)([\/\\].+)?/);
			if (relativeSearchPathMatch) {
				const searchPathRoot = relativeSearchPathMatch[1];
				const matchingRoots = workspace.roots.filter(root => paths.basename(root.fsPath) === searchPathRoot);
				if (matchingRoots.length) {
					return matchingRoots.map(root => {
						return relativeSearchPathMatch[2] ?
							paths.normalize(paths.join(root.fsPath, relativeSearchPathMatch[2])) :
							root.fsPath;
					});
				} else {
					// No root folder with name
					const searchPathNotFoundError = nls.localize('search.noWorkspaceWithName', "No folder in workspace with name: {0}", searchPathRoot);
					throw new Error(searchPathNotFoundError);
				}
			} else {
				// Malformed ./ search path, ignore
			}
		}

		return [];
	}

	private getFolderQueryForSearchPath(searchPath: ISearchPathPattern): IFolderQuery {
		const folder = searchPath.searchPath;
		const folderConfig = this.configurationService.getConfiguration<ISearchConfiguration>(undefined, { resource: folder });
		return <IFolderQuery>{
			folder,
			includePattern: searchPath.pattern && patternListToIExpression([searchPath.pattern]),
			fileEncoding: folderConfig.files && folderConfig.files.encoding
		};
	}

	private getFolderQueryForRoot(folder: uri, options?: IQueryOptions): IFolderQuery {
		const folderConfig = this.configurationService.getConfiguration<ISearchConfiguration>(undefined, { resource: folder });
		return <IFolderQuery>{
			folder,
			excludePattern: this.getExcludesForFolder(folderConfig, options),
			fileEncoding: folderConfig.files && folderConfig.files.encoding
		};
	}
}

function splitGlobFromPath(searchPath: string): { pathPortion: string, globPortion?: string } {
	const globCharMatch = searchPath.match(/[\*\{\}\(\)\[\]\?]/);
	if (globCharMatch) {
		const globCharIdx = globCharMatch.index;
		const lastSlashMatch = searchPath.substr(0, globCharIdx).match(/[/|\\][^/\\]*$/);
		if (lastSlashMatch) {
			let pathPortion = searchPath.substr(0, lastSlashMatch.index);
			if (!pathPortion.match(/[/\\]/)) {
				// If the last slash was the only slash, then we now have '' or 'C:'. Append a slash.
				pathPortion += '/';
			}

			return {
				pathPortion,
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
		undefined;
}

function splitGlobPattern(pattern: string): string[] {
	return glob.splitGlobAware(pattern, ',')
		.map(s => s.trim())
		.filter(s => !!s.length);
}
