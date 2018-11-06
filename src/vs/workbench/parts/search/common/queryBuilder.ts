/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import * as collections from 'vs/base/common/collections';
import * as glob from 'vs/base/common/glob';
import { untildify } from 'vs/base/common/labels';
import * as objects from 'vs/base/common/objects';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import * as strings from 'vs/base/common/strings';
import { URI as uri } from 'vs/base/common/uri';
import { isMultilineRegexSource } from 'vs/editor/common/model/textModelSearch';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { getExcludes, ICommonQueryProps, IFileQuery, IFolderQuery, IPatternInfo, ISearchConfiguration, ITextQuery, ITextSearchPreviewOptions, pathIncludedInQuery, QueryType } from 'vs/platform/search/common/search';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';

export interface ISearchPathPattern {
	searchPath: uri;
	pattern?: string;
}

export interface ISearchPathsResult {
	searchPaths?: ISearchPathPattern[];
	pattern?: glob.IExpression;
}

export interface ICommonQueryBuilderOptions {
	_reason?: string;
	excludePattern?: string;
	includePattern?: string;
	extraFileResources?: uri[];

	maxResults?: number;
	maxFileSize?: number;
	useRipgrep?: boolean;
	disregardIgnoreFiles?: boolean;
	disregardGlobalIgnoreFiles?: boolean;
	disregardExcludeSettings?: boolean;
	ignoreSymlinks?: boolean;
}

export interface IFileQueryBuilderOptions extends ICommonQueryBuilderOptions {
	filePattern?: string;
	exists?: boolean;
	sortByScore?: boolean;
	cacheKey?: string;
}

export interface ITextQueryBuilderOptions extends ICommonQueryBuilderOptions {
	previewOptions?: ITextSearchPreviewOptions;
	fileEncoding?: string;
	beforeContext?: number;
	afterContext?: number;
}

export class QueryBuilder {

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) { }

	text(contentPattern: IPatternInfo, folderResources?: uri[], options: ITextQueryBuilderOptions = {}): ITextQuery {
		contentPattern.isCaseSensitive = this.isCaseSensitive(contentPattern);
		contentPattern.isMultiline = this.isMultiline(contentPattern);
		const searchConfig = this.configurationService.getValue<ISearchConfiguration>();
		contentPattern.wordSeparators = searchConfig.editor.wordSeparators;

		const fallbackToPCRE = folderResources && folderResources.some(folder => {
			const folderConfig = this.configurationService.getValue<ISearchConfiguration>({ resource: folder });
			return !folderConfig.search.useRipgrep;
		});

		const commonQuery = this.commonQuery(folderResources, options);
		return <ITextQuery>{
			...commonQuery,
			type: QueryType.Text,
			contentPattern,
			previewOptions: options.previewOptions,
			maxFileSize: options.maxFileSize,
			usePCRE2: searchConfig.search.usePCRE2 || fallbackToPCRE || false,
			beforeContext: options.beforeContext,
			afterContext: options.afterContext
		};
	}

	file(folderResources: uri[] | undefined, options: IFileQueryBuilderOptions = {}): IFileQuery {
		const commonQuery = this.commonQuery(folderResources, options);
		return <IFileQuery>{
			...commonQuery,
			type: QueryType.File,
			filePattern: options.filePattern
				? options.filePattern.trim()
				: options.filePattern,
			exists: options.exists,
			sortByScore: options.sortByScore,
			cacheKey: options.cacheKey
		};
	}

	private commonQuery(folderResources?: uri[], options: ICommonQueryBuilderOptions = {}): ICommonQueryProps<uri> {
		let { searchPaths, pattern: includePattern } = this.parseSearchPaths(options.includePattern || '');
		let excludePattern = this.parseExcludePattern(options.excludePattern || '');

		// Build folderQueries from searchPaths, if given, otherwise folderResources
		const folderQueries = searchPaths && searchPaths.length ?
			searchPaths.map(searchPath => this.getFolderQueryForSearchPath(searchPath, options)) :
			folderResources && folderResources.map(uri => this.getFolderQueryForRoot(uri, options));

		const useRipgrep = !folderResources || folderResources.every(folder => {
			const folderConfig = this.configurationService.getValue<ISearchConfiguration>({ resource: folder });
			return !folderConfig.search.useLegacySearch;
		});

		const queryProps: ICommonQueryProps<uri> = {
			_reason: options._reason,
			folderQueries: folderQueries || [],
			usingSearchPaths: !!(searchPaths && searchPaths.length),
			extraFileResources: options.extraFileResources,

			excludePattern,
			includePattern,
			maxResults: options.maxResults,
			useRipgrep
		};

		// Filter extraFileResources against global include/exclude patterns - they are already expected to not belong to a workspace
		let extraFileResources = options.extraFileResources && options.extraFileResources.filter(extraFile => pathIncludedInQuery(queryProps, extraFile.fsPath));
		queryProps.extraFileResources = extraFileResources && extraFileResources.length ? extraFileResources : undefined;

		return queryProps;
	}

	/**
	 * Resolve isCaseSensitive flag based on the query and the isSmartCase flag, for search providers that don't support smart case natively.
	 */
	private isCaseSensitive(contentPattern: IPatternInfo): boolean {
		if (contentPattern.isSmartCase) {
			if (contentPattern.isRegExp) {
				// Consider it case sensitive if it contains an unescaped capital letter
				if (strings.containsUppercaseCharacter(contentPattern.pattern, true)) {
					return true;
				}
			} else if (strings.containsUppercaseCharacter(contentPattern.pattern)) {
				return true;
			}
		}

		return !!contentPattern.isCaseSensitive;
	}

	private isMultiline(contentPattern: IPatternInfo): boolean {
		if (contentPattern.isMultiline) {
			return true;
		}

		if (contentPattern.isRegExp && isMultilineRegexSource(contentPattern.pattern)) {
			return true;
		}

		return false;
	}

	/**
	 * Take the includePattern as seen in the search viewlet, and split into components that look like searchPaths, and
	 * glob patterns. Glob patterns are expanded from 'foo/bar' to '{foo/bar/**, **\/foo/bar}.
	 *
	 * Public for test.
	 */
	public parseSearchPaths(pattern: string): ISearchPathsResult {
		const isSearchPath = (segment: string) => {
			// A segment is a search path if it is an absolute path or starts with ./, ../, .\, or ..\
			return paths.isAbsolute(segment) || /^\.\.?[\/\\]/.test(segment);
		};

		const segments = splitGlobPattern(pattern)
			.map(segment => untildify(segment, this.environmentService.userHome));
		const groups = collections.groupBy(segments,
			segment => isSearchPath(segment) ? 'searchPaths' : 'exprSegments');

		const expandedExprSegments = (groups.exprSegments || [])
			.map(p => {
				if (p[0] === '.') {
					p = '*' + p; // convert ".js" to "*.js"
				}

				return expandGlobalGlob(p);
			});
		const exprSegments = arrays.flatten(expandedExprSegments);

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
	 * Takes the input from the excludePattern as seen in the searchView. Runs the same algorithm as parseSearchPaths,
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

	private getExcludesForFolder(folderConfig: ISearchConfiguration, options: ICommonQueryBuilderOptions): glob.IExpression | undefined {
		return options.disregardExcludeSettings ?
			undefined :
			getExcludes(folderConfig);
	}

	/**
	 * Split search paths (./ or absolute paths in the includePatterns) into absolute paths and globs applied to those paths
	 */
	private expandSearchPathPatterns(searchPaths: string[]): ISearchPathPattern[] {
		if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY || !searchPaths || !searchPaths.length) {
			// No workspace => ignore search paths
			return [];
		}

		const searchPathPatterns = arrays.flatten(searchPaths.map(searchPath => {
			// 1 open folder => just resolve the search paths to absolute paths
			const { pathPortion, globPortion } = splitGlobFromPath(searchPath);
			const pathPortions = this.expandAbsoluteSearchPaths(pathPortion);
			return pathPortions.map(searchPath => {
				return <ISearchPathPattern>{
					searchPath,
					pattern: globPortion
				};
			});
		}));

		return searchPathPatterns.filter(arrays.uniqueFilter(searchPathPattern => searchPathPattern.searchPath.toString()));
	}

	/**
	 * Takes a searchPath like `./a/foo` and expands it to absolute paths for all the workspaces it matches.
	 */
	private expandAbsoluteSearchPaths(searchPath: string): uri[] {
		if (paths.isAbsolute(searchPath)) {
			// Currently only local resources can be searched for with absolute search paths
			return [uri.file(paths.normalize(searchPath))];
		}

		if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.FOLDER) {
			const workspaceUri = this.workspaceContextService.getWorkspace().folders[0].uri;
			return [resources.joinPath(workspaceUri, searchPath)];
		} else if (searchPath === './') {
			return []; // ./ or ./**/foo makes sense for single-folder but not multi-folder workspaces
		} else {
			const relativeSearchPathMatch = searchPath.match(/\.[\/\\]([^\/\\]+)([\/\\].+)?/);
			if (relativeSearchPathMatch) {
				const searchPathRoot = relativeSearchPathMatch[1];
				const matchingRoots = this.workspaceContextService.getWorkspace().folders.filter(folder => folder.name === searchPathRoot);
				if (matchingRoots.length) {
					return matchingRoots.map(root => {
						return relativeSearchPathMatch[2] ?
							resources.joinPath(root.uri, relativeSearchPathMatch[2]) :
							root.uri;
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

	private getFolderQueryForSearchPath(searchPath: ISearchPathPattern, options: ICommonQueryBuilderOptions): IFolderQuery {
		const searchPathWorkspaceFolder = this.workspaceContextService.getWorkspaceFolder(searchPath.searchPath);
		const searchPathRelativePath = searchPathWorkspaceFolder && searchPath.searchPath.path.substr(searchPathWorkspaceFolder.uri.path.length + 1);

		const rootConfig = this.getFolderQueryForRoot(searchPath.searchPath, options);
		let resolvedExcludes: glob.IExpression = {};
		if (searchPathWorkspaceFolder && rootConfig.excludePattern) {
			// Resolve excludes relative to the search path
			for (let excludePattern in rootConfig.excludePattern) {
				const { pathPortion, globPortion } = splitSimpleGlob(excludePattern);
				if (!pathPortion) { // **/foo
					if (globPortion) {
						resolvedExcludes[globPortion] = rootConfig.excludePattern[excludePattern];
					}
				} else if (strings.startsWith(pathPortion, searchPathRelativePath)) { // searchPathRelativePath/something/**/foo
					// Strip `searchPathRelativePath/`
					const resolvedPathPortion = pathPortion.substr(searchPathRelativePath.length + 1);
					const resolvedPattern = globPortion ?
						resolvedPathPortion + globPortion :
						resolvedPathPortion;

					resolvedExcludes[resolvedPattern] = rootConfig.excludePattern[excludePattern];
				}
			}
		}

		return {
			...rootConfig,
			...{
				includePattern: searchPath.pattern ? patternListToIExpression([searchPath.pattern]) : undefined,
				excludePattern: Object.keys(resolvedExcludes).length ? resolvedExcludes : undefined
			}
		};
	}

	private getFolderQueryForRoot(folder: uri, options: ICommonQueryBuilderOptions): IFolderQuery {
		const folderConfig = this.configurationService.getValue<ISearchConfiguration>({ resource: folder });
		return <IFolderQuery>{
			folder,
			excludePattern: this.getExcludesForFolder(folderConfig, options),
			fileEncoding: folderConfig.files && folderConfig.files.encoding,
			disregardIgnoreFiles: typeof options.disregardIgnoreFiles === 'boolean' ? options.disregardIgnoreFiles : !folderConfig.search.useIgnoreFiles,
			disregardGlobalIgnoreFiles: typeof options.disregardGlobalIgnoreFiles === 'boolean' ? options.disregardGlobalIgnoreFiles : !folderConfig.search.useGlobalIgnoreFiles,
			ignoreSymlinks: typeof options.ignoreSymlinks === 'boolean' ? options.ignoreSymlinks : !folderConfig.search.followSymlinks,
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
				// If the last slash was the only slash, then we now have '' or 'C:' or '.'. Append a slash.
				pathPortion += '/';
			}

			return {
				pathPortion,
				globPortion: searchPath.substr((lastSlashMatch.index || 0) + 1)
			};
		}
	}

	// No glob char, or malformed
	return {
		pathPortion: searchPath
	};
}

function splitSimpleGlob(searchPath: string): { pathPortion: string, globPortion?: string } {
	const globCharMatch = searchPath.match(/[\*\{\}\(\)\[\]\?]/);
	if (globCharMatch) {
		const globCharIdx = globCharMatch.index || 0;
		return {
			pathPortion: searchPath.substr(0, globCharIdx),
			globPortion: searchPath.substr(globCharIdx)
		};
	}

	// No glob char
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

/**
 * Note - we used {} here previously but ripgrep can't handle nested {} patterns. See https://github.com/Microsoft/vscode/issues/32761
 */
function expandGlobalGlob(pattern: string): string[] {
	const patterns = [
		`**/${pattern}/**`,
		`**/${pattern}`
	];

	return patterns.map(p => p.replace(/\*\*\/\*\*/g, '**'));
}
