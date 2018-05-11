/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as arrays from 'vs/base/common/arrays';
import { asWinJsPromise } from 'vs/base/common/async';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import * as glob from 'vs/base/common/glob';
import { isEqualOrParent } from 'vs/base/common/paths';
import * as strings from 'vs/base/common/strings';
import URI, { UriComponents } from 'vs/base/common/uri';
import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import { IItemAccessor, ScorerCache, compareItemsByScore, prepareQuery } from 'vs/base/parts/quickopen/common/quickOpenScorer';
import { ICachedSearchStats, IFileMatch, IFolderQuery, IPatternInfo, IProgress, IRawSearchQuery, ISearchQuery } from 'vs/platform/search/common/search';
import { IFileSearchProgressItem, IRawFileMatch, ISerializedFileMatch, ISerializedSearchComplete, ISerializedSearchProgressItem } from 'vs/workbench/services/search/node/search';
import * as vscode from 'vscode';
import { ExtHostSearchShape, IMainContext, MainContext, MainThreadSearchShape } from './extHost.protocol';

export class ExtHostSearch implements ExtHostSearchShape {

	private readonly _proxy: MainThreadSearchShape;
	private readonly _searchProvider = new Map<number, vscode.SearchProvider>();
	private _handlePool: number = 0;

	private _fileSearchThingy = new FileSearchEngine();

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadSearch);
	}

	registerSearchProvider(scheme: string, provider: vscode.SearchProvider) {
		const handle = this._handlePool++;
		this._searchProvider.set(handle, provider);
		this._proxy.$registerSearchProvider(handle, scheme);
		return {
			dispose: () => {
				this._searchProvider.delete(handle);
				this._proxy.$unregisterProvider(handle);
			}
		};
	}

	$provideFileSearchResults(handle: number, session: number, rawQuery: IRawSearchQuery): TPromise<void> {
		const provider = this._searchProvider.get(handle);
		if (!provider.provideFileSearchResults) {
			return TPromise.as(undefined);
		}

		const query = reviveQuery(rawQuery);
		return this._fileSearchThingy.fileSearch(query, provider).then(
			() => { }, // still need to return limitHit
			null,
			progress => {
				if (Array.isArray(progress)) {
					progress.forEach(p => {
						const uri = URI.parse(p.path);
						this._proxy.$handleFindMatch(handle, session, uri);
					});
				} else {
					const uri = URI.parse((<ISerializedFileMatch>progress).path);
					this._proxy.$handleFindMatch(handle, session, uri);
				}
			});
	}

	$provideTextSearchResults(handle: number, session: number, pattern: IPatternInfo, query: IRawSearchQuery): TPromise<void> {
		return TPromise.join(
			query.folderQueries.map(fq => this.provideTextSearchResultsForFolder(handle, session, pattern, query, fq))
		).then(
			() => { },
			(err: Error[]) => {
				return TPromise.wrapError(err[0]);
			});
	}

	private provideTextSearchResultsForFolder(handle: number, session: number, pattern: IPatternInfo, query: IRawSearchQuery, folderQuery: IFolderQuery<UriComponents>): TPromise<void> {
		const provider = this._searchProvider.get(handle);
		if (!provider.provideTextSearchResults) {
			return TPromise.as(undefined);
		}

		const includes: string[] = query.includePattern ? Object.keys(query.includePattern) : [];
		if (folderQuery.includePattern) {
			includes.push(...Object.keys(folderQuery.includePattern));
		}

		const excludes: string[] = query.excludePattern ? Object.keys(query.excludePattern) : [];
		if (folderQuery.excludePattern) {
			excludes.push(...Object.keys(folderQuery.excludePattern));
		}

		const searchOptions: vscode.TextSearchOptions = {
			folder: URI.from(folderQuery.folder),
			excludes,
			includes,
			useIgnoreFiles: !query.disregardIgnoreFiles,
			followSymlinks: !query.ignoreSymlinks,
			encoding: query.fileEncoding
		};

		const collector = new TextSearchResultsCollector(handle, session, this._proxy);
		const progress = {
			report: (data: vscode.TextSearchResult) => {
				collector.add(data);
			}
		};
		return asWinJsPromise(token => provider.provideTextSearchResults(pattern, searchOptions, progress, token))
			.then(() => collector.flush());
	}
}

function reviveQuery(rawQuery: IRawSearchQuery): ISearchQuery {
	return {
		...rawQuery,
		...{
			folderQueries: rawQuery.folderQueries && rawQuery.folderQueries.map(reviveFolderQuery),
			extraFileResources: rawQuery.extraFileResources && rawQuery.extraFileResources.map(components => URI.revive(components))
		}
	};
}

function reviveFolderQuery(rawFolderQuery: IFolderQuery<UriComponents>): IFolderQuery<URI> {
	return {
		...rawFolderQuery,
		folder: URI.revive(rawFolderQuery.folder)
	};
}

class TextSearchResultsCollector {
	private _batchedCollector: BatchedCollector<IFileMatch>;

	private _currentFileMatch: IFileMatch;

	constructor(private _handle: number, private _session: number, private _proxy: MainThreadSearchShape) {
		this._batchedCollector = new BatchedCollector<IFileMatch>(512, items => this.sendItems(items));
	}

	add(data: vscode.TextSearchResult): void {
		// Collects TextSearchResults into IRawFileMatches and collates using BatchedCollector.
		// This is efficient for ripgrep which sends results back one file at a time. It wouldn't be efficient for other search
		// providers that send results in random order. We could do this step afterwards instead.
		if (this._currentFileMatch && this._currentFileMatch.resource.toString() !== data.uri.toString()) {
			this.pushToCollector();
			this._currentFileMatch = null;
		}

		if (!this._currentFileMatch) {
			this._currentFileMatch = {
				resource: data.uri,
				lineMatches: []
			};
		}

		// TODO@roblou - line text is sent for every match
		const matchRange = data.preview.match;
		this._currentFileMatch.lineMatches.push({
			lineNumber: data.range.start.line,
			preview: data.preview.text,
			offsetAndLengths: [[matchRange.start.character, matchRange.end.character - matchRange.start.character]]
		});
	}

	private pushToCollector(): void {
		const size = this._currentFileMatch.lineMatches.reduce((acc, match) => acc + match.offsetAndLengths.length, 0);
		this._batchedCollector.addItem(this._currentFileMatch, size);
	}

	flush(): void {
		this.pushToCollector();
		this._batchedCollector.flush();
	}

	private sendItems(items: IFileMatch | IFileMatch[]): void {
		items = Array.isArray(items) ? items : [items];
		this._proxy.$handleFindMatch(this._handle, this._session, items);
	}
}

/**
 * Collects items that have a size - before the cumulative size of collected items reaches START_BATCH_AFTER_COUNT, the callback is called for every
 * set of items collected.
 * But after that point, the callback is called with batches of maxBatchSize.
 * If the batch isn't filled within some time, the callback is also called.
 */
class BatchedCollector<T> {
	private static readonly TIMEOUT = 4000;

	// After START_BATCH_AFTER_COUNT items have been collected, stop flushing on timeout
	private static readonly START_BATCH_AFTER_COUNT = 50;

	private totalNumberCompleted = 0;
	private batch: T[] = [];
	private batchSize = 0;
	private timeoutHandle: number;

	constructor(private maxBatchSize: number, private cb: (items: T | T[]) => void) {
	}

	addItem(item: T, size: number): void {
		if (!item) {
			return;
		}

		if (this.maxBatchSize > 0) {
			this.addItemToBatch(item, size);
		} else {
			this.cb(item);
		}
	}

	addItems(items: T[], size: number): void {
		if (!items) {
			return;
		}

		if (this.maxBatchSize > 0) {
			this.addItemsToBatch(items, size);
		} else {
			this.cb(items);
		}
	}

	private addItemToBatch(item: T, size: number): void {
		this.batch.push(item);
		this.batchSize += size;
		this.onUpdate();
	}

	private addItemsToBatch(item: T[], size: number): void {
		this.batch = this.batch.concat(item);
		this.batchSize += size;
		this.onUpdate();
	}

	private onUpdate(): void {
		if (this.totalNumberCompleted < BatchedCollector.START_BATCH_AFTER_COUNT) {
			// Flush because we aren't batching yet
			this.flush();
		} else if (this.batchSize >= this.maxBatchSize) {
			// Flush because the batch is full
			this.flush();
		} else if (!this.timeoutHandle) {
			// No timeout running, start a timeout to flush
			this.timeoutHandle = setTimeout(() => {
				this.flush();
			}, BatchedCollector.TIMEOUT);
		}
	}

	flush(): void {
		if (this.batchSize) {
			this.totalNumberCompleted += this.batchSize;
			this.cb(this.batch);
			this.batch = [];
			this.batchSize = 0;

			if (this.timeoutHandle) {
				clearTimeout(this.timeoutHandle);
				this.timeoutHandle = 0;
			}
		}
	}
}

interface IDirectoryEntry {
	base: string;
	relativePath: string;
	basename: string;
}

interface IDirectoryTree {
	rootEntries: IDirectoryEntry[];
	pathToEntries: { [relativePath: string]: IDirectoryEntry[] };
}

export class FileWalker {
	private config: ISearchQuery;
	private filePattern: string;
	private normalizedFilePatternLowercase: string;
	private includePattern: glob.ParsedExpression;
	private maxResults: number;
	private exists: boolean;
	// private maxFilesize: number;
	private isLimitHit: boolean;
	private resultCount: number;
	private isCanceled: boolean;
	private errors: string[];

	// private filesWalked: number;
	// private directoriesWalked: number;

	private folderExcludePatterns: Map<string, AbsoluteAndRelativeParsedExpression>;
	private globalExcludePattern: glob.ParsedExpression;

	constructor(config: ISearchQuery) {
		this.config = config;
		this.filePattern = config.filePattern;
		this.includePattern = config.includePattern && glob.parse(config.includePattern);
		this.maxResults = config.maxResults || null;
		this.exists = config.exists;
		// this.maxFilesize = config.maxFileSize || null;
		this.resultCount = 0;
		this.isLimitHit = false;
		this.errors = [];

		// this.filesWalked = 0;
		// this.directoriesWalked = 0;

		if (this.filePattern) {
			this.normalizedFilePatternLowercase = strings.stripWildcards(this.filePattern).toLowerCase();
		}

		this.globalExcludePattern = config.excludePattern && glob.parse(config.excludePattern);
		this.folderExcludePatterns = new Map<string, AbsoluteAndRelativeParsedExpression>();

		config.folderQueries.forEach(folderQuery => {
			const folderExcludeExpression: glob.IExpression = {
				...(folderQuery.excludePattern || {}),
				...(this.config.excludePattern || {})
			};

			// Add excludes for other root folders
			const folderString = URI.from(folderQuery.folder).toString();
			config.folderQueries
				.map(rootFolderQuery => rootFolderQuery.folder)
				.filter(rootFolder => rootFolder !== folderQuery.folder)
				.forEach(otherRootFolder => {
					// Exclude nested root folders
					const otherString = URI.from(otherRootFolder).toString();
					if (isEqualOrParent(otherString, folderString)) {
						folderExcludeExpression[path.relative(folderString, otherString)] = true;
					}
				});

			this.folderExcludePatterns.set(folderString, new AbsoluteAndRelativeParsedExpression(folderExcludeExpression, folderString));
		});
	}

	public cancel(): void {
		this.isCanceled = true;
	}

	public walk(provider: vscode.SearchProvider, onResult: (result: IRawFileMatch) => void, done: (error: Error, isLimitHit: boolean) => void): void {
		const extraFiles = this.config.extraFileResources.map(uri => uri.toString());
		const folderQueries = this.config.folderQueries;

		// Support that the file pattern is a full path to a file that exists
		this.checkFilePatternAbsoluteMatch((exists, size) => {
			if (this.isCanceled) {
				return done(null, this.isLimitHit);
			}

			// Report result from file pattern if matching
			if (exists) {
				this.resultCount++;
				onResult({
					relativePath: this.filePattern,
					basename: path.basename(this.filePattern),
					size
				});

				// Optimization: a match on an absolute path is a good result and we do not
				// continue walking the entire root paths array for other matches because
				// it is very unlikely that another file would match on the full absolute path
				return done(null, this.isLimitHit);
			}

			// For each extra file
			if (extraFiles) {
				extraFiles.forEach(extraFilePath => {
					const basename = path.basename(extraFilePath);
					if (this.globalExcludePattern && this.globalExcludePattern(extraFilePath, basename)) {
						return; // excluded
					}

					// File: Check for match on file pattern and include pattern
					this.matchFile(onResult, { relativePath: extraFilePath /* no workspace relative path */, basename });
				});
			}

			// For each root folder
			const searchAllFoldersP = TPromise.join(folderQueries.map(fq => {
				// const options: vscode.FileSearchOptions = {
				// 	excludes: [],
				// 	includes: [],
				// 	folder: fq.folder,
				// 	followSymlinks: !this.config.ignoreSymlinks,
				// 	useIgnoreFiles: !this.config.disregardIgnoreFiles
				// };

				const includes: string[] = this.config.includePattern ? Object.keys(this.config.includePattern) : [];
				if (fq.includePattern) {
					includes.push(...Object.keys(fq.includePattern));
				}

				const excludes: string[] = this.config.excludePattern ? Object.keys(this.config.excludePattern) : [];
				if (fq.excludePattern) {
					excludes.push(...Object.keys(fq.excludePattern));
				}

				const options: vscode.FileSearchOptions = {
					folder: URI.from(fq.folder),
					excludes,
					includes,
					useIgnoreFiles: !this.config.disregardIgnoreFiles,
					followSymlinks: !this.config.ignoreSymlinks
				};

				let filePatternSeen = false;
				return asWinJsPromise(token => {
					const tree = this.initDirectoryTree();

					const noSiblingsClauses = true;
					return provider.provideFileSearchResults(options, {
						report: (result: URI) => {
							const relativePath = path.relative(fq.folder.toString(), result.toString());

							if (noSiblingsClauses) {
								if (relativePath === this.filePattern) {
									filePatternSeen = true;
								}
								const basename = path.basename(relativePath);
								this.matchFile(onResult, { base: fq.folder.toString(), relativePath, basename });
								// if (this.isLimitHit) {
								// 	killCmd();
								// 	break;
								// }

								return;
							}

							// TODO: Optimize siblings clauses with ripgrep here.
							this.addDirectoryEntries(tree, fq.folder.toString(), relativePath, onResult);
						}
					},
						token).then(() => {
							if (noSiblingsClauses && this.isLimitHit) {
								if (!filePatternSeen) {
									this.checkFilePatternRelativeMatch(fq.folder.toString(), (match, size) => {
										if (match) {
											this.resultCount++;
											onResult({
												base: fq.folder.toString(),
												relativePath: this.filePattern,
												basename: path.basename(this.filePattern),
											});
										}
									});
								}

								return;
							}

							this.matchDirectoryTree(tree, fq.folder.toString(), onResult);
						});
				});
			}));

			searchAllFoldersP.then(() => {
				// TODO
				done(null, false);
			}, err => {
				const errorMessage = toErrorMessage(err);
				console.error(errorMessage);
				this.errors.push(errorMessage);
				// rootFolderDone(err, undefined);
			});
		});
	}

	private initDirectoryTree(): IDirectoryTree {
		const tree: IDirectoryTree = {
			rootEntries: [],
			pathToEntries: Object.create(null)
		};
		tree.pathToEntries['.'] = tree.rootEntries;
		return tree;
	}

	private addDirectoryEntries({ pathToEntries }: IDirectoryTree, base: string, relativeFile: string, onResult: (result: IRawFileMatch) => void) {
		// Support relative paths to files from a root resource (ignores excludes)
		if (relativeFile === this.filePattern) {
			const basename = path.basename(this.filePattern);
			this.matchFile(onResult, { base: base, relativePath: this.filePattern, basename });
		}

		function add(relativePath: string) {
			const basename = path.basename(relativePath);
			const dirname = path.dirname(relativePath);
			let entries = pathToEntries[dirname];
			if (!entries) {
				entries = pathToEntries[dirname] = [];
				add(dirname);
			}
			entries.push({
				base,
				relativePath,
				basename
			});
		}

		add(relativeFile);
	}

	private matchDirectoryTree({ rootEntries, pathToEntries }: IDirectoryTree, rootFolder: string, onResult: (result: IRawFileMatch) => void) {
		const self = this;
		const excludePattern = this.folderExcludePatterns.get(rootFolder);
		const filePattern = this.filePattern;
		function matchDirectory(entries: IDirectoryEntry[]) {
			// self.directoriesWalked++;
			for (let i = 0, n = entries.length; i < n; i++) {
				const entry = entries[i];
				const { relativePath, basename } = entry;

				// Check exclude pattern
				// If the user searches for the exact file name, we adjust the glob matching
				// to ignore filtering by siblings because the user seems to know what she
				// is searching for and we want to include the result in that case anyway
				if (excludePattern.test(relativePath, basename, () => filePattern !== basename ? entries.map(entry => entry.basename) : [])) {
					continue;
				}

				const sub = pathToEntries[relativePath];
				if (sub) {
					matchDirectory(sub);
				} else {
					// self.filesWalked++;
					if (relativePath === filePattern) {
						continue; // ignore file if its path matches with the file pattern because that is already matched above
					}

					self.matchFile(onResult, entry);
				}

				if (self.isLimitHit) {
					break;
				}
			}
		}
		matchDirectory(rootEntries);
	}

	public getStats(): any {
		return null;
		// return {
		// 	fromCache: false,
		// 	traversal: Traversal[this.traversal],
		// 	errors: this.errors,
		// 	fileWalkStartTime: this.fileWalkStartTime,
		// 	fileWalkResultTime: Date.now(),
		// 	directoriesWalked: this.directoriesWalked,
		// 	filesWalked: this.filesWalked,
		// 	resultCount: this.resultCount,
		// 	cmdForkResultTime: this.cmdForkResultTime,
		// 	cmdResultCount: this.cmdResultCount
		// };
	}

	private checkFilePatternAbsoluteMatch(clb: (exists: boolean, size?: number) => void): void {
		if (!this.filePattern || !path.isAbsolute(this.filePattern)) {
			return clb(false);
		}

		return fs.stat(this.filePattern, (error, stat) => {
			return clb(!error && !stat.isDirectory(), stat && stat.size); // only existing files
		});
	}

	private checkFilePatternRelativeMatch(basePath: string, clb: (matchPath: string, size?: number) => void): void {
		if (!this.filePattern || path.isAbsolute(this.filePattern)) {
			return clb(null);
		}

		const absolutePath = path.join(basePath, this.filePattern);

		return fs.stat(absolutePath, (error, stat) => {
			return clb(!error && !stat.isDirectory() ? absolutePath : null, stat && stat.size); // only existing files
		});
	}

	private matchFile(onResult: (result: IRawFileMatch) => void, candidate: IRawFileMatch): void {
		if (this.isFilePatternMatch(candidate.relativePath) && (!this.includePattern || this.includePattern(candidate.relativePath, candidate.basename))) {
			this.resultCount++;

			if (this.exists || (this.maxResults && this.resultCount > this.maxResults)) {
				this.isLimitHit = true;
			}

			if (!this.isLimitHit) {
				onResult(candidate);
			}
		}
	}

	private isFilePatternMatch(path: string): boolean {
		// Check for search pattern
		if (this.filePattern) {
			if (this.filePattern === '*') {
				return true; // support the all-matching wildcard
			}

			return strings.fuzzyContains(path, this.normalizedFilePatternLowercase);
		}

		// No patterns means we match all
		return true;
	}
}

/**
 * This class exists to provide one interface on top of two ParsedExpressions, one for absolute expressions and one for relative expressions.
 * The absolute and relative expressions don't "have" to be kept separate, but this keeps us from having to path.join every single
 * file searched, it's only used for a text search with a searchPath
 */
class AbsoluteAndRelativeParsedExpression {
	private absoluteParsedExpr: glob.ParsedExpression;
	private relativeParsedExpr: glob.ParsedExpression;

	constructor(public expression: glob.IExpression, private root: string) {
		this.init(expression);
	}

	/**
	 * Split the IExpression into its absolute and relative components, and glob.parse them separately.
	 */
	private init(expr: glob.IExpression): void {
		let absoluteGlobExpr: glob.IExpression;
		let relativeGlobExpr: glob.IExpression;
		Object.keys(expr)
			.filter(key => expr[key])
			.forEach(key => {
				if (path.isAbsolute(key)) {
					absoluteGlobExpr = absoluteGlobExpr || glob.getEmptyExpression();
					absoluteGlobExpr[key] = expr[key];
				} else {
					relativeGlobExpr = relativeGlobExpr || glob.getEmptyExpression();
					relativeGlobExpr[key] = expr[key];
				}
			});

		this.absoluteParsedExpr = absoluteGlobExpr && glob.parse(absoluteGlobExpr, { trimForExclusions: true });
		this.relativeParsedExpr = relativeGlobExpr && glob.parse(relativeGlobExpr, { trimForExclusions: true });
	}

	public test(_path: string, basename?: string, siblingsFn?: () => string[] | TPromise<string[]>): string | TPromise<string> {
		return (this.relativeParsedExpr && this.relativeParsedExpr(_path, basename, siblingsFn)) ||
			(this.absoluteParsedExpr && this.absoluteParsedExpr(path.join(this.root, _path), basename, siblingsFn));
	}

	public getBasenameTerms(): string[] {
		const basenameTerms = [];
		if (this.absoluteParsedExpr) {
			basenameTerms.push(...glob.getBasenameTerms(this.absoluteParsedExpr));
		}

		if (this.relativeParsedExpr) {
			basenameTerms.push(...glob.getBasenameTerms(this.relativeParsedExpr));
		}

		return basenameTerms;
	}

	public getPathTerms(): string[] {
		const pathTerms = [];
		if (this.absoluteParsedExpr) {
			pathTerms.push(...glob.getPathTerms(this.absoluteParsedExpr));
		}

		if (this.relativeParsedExpr) {
			pathTerms.push(...glob.getPathTerms(this.relativeParsedExpr));
		}

		return pathTerms;
	}
}

export class FileSearchEngine {

	private static readonly BATCH_SIZE = 512;

	private caches: { [cacheKey: string]: Cache; } = Object.create(null);

	public fileSearch(config: ISearchQuery, provider: vscode.SearchProvider): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem> {
		if (config.sortByScore) {
			let sortedSearch = this.trySortedSearchFromCache(config);
			if (!sortedSearch) {
				const walkerConfig = config.maxResults ?
					{
						...config,
						...{ maxResults: null }
					} :
					config;

				const walker = new FileWalker(walkerConfig);
				sortedSearch = this.doSortedSearch(walker, provider, config);
			}

			return new PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>((c, e, p) => {
				process.nextTick(() => { // allow caller to register progress callback first
					sortedSearch.then(([result, rawMatches]) => {
						const serializedMatches = rawMatches.map(rawMatch => this.rawMatchToSearchItem(rawMatch));
						this.sendProgress(serializedMatches, p, FileSearchEngine.BATCH_SIZE);
						c(result);
					}, e, p);
				});
			}, () => {
				sortedSearch.cancel();
			});
		}

		let searchPromise: PPromise<void, IFileSearchProgressItem>;
		return new PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>((c, e, p) => {
			const walker = new FileWalker(config);
			searchPromise = this.doSearch(walker, provider, FileSearchEngine.BATCH_SIZE)
				.then(c, e, progress => {
					if (Array.isArray(progress)) {
						p(progress.map(m => this.rawMatchToSearchItem(m)));
					} else if ((<IRawFileMatch>progress).relativePath) {
						p(this.rawMatchToSearchItem(<IRawFileMatch>progress));
					} else {
						p(<IProgress>progress);
					}
				});
		}, () => {
			searchPromise.cancel();
		});
	}

	private rawMatchToSearchItem(match: IRawFileMatch): ISerializedFileMatch {
		return { path: match.base ? path.join(match.base, match.relativePath) : match.relativePath };
	}

	private doSortedSearch(walker: FileWalker, provider: vscode.SearchProvider, config: IRawSearchQuery): PPromise<[ISerializedSearchComplete, IRawFileMatch[]], IProgress> {
		let searchPromise: PPromise<void, IFileSearchProgressItem>;
		let allResultsPromise = new PPromise<[ISerializedSearchComplete, IRawFileMatch[]], IFileSearchProgressItem>((c, e, p) => {
			let results: IRawFileMatch[] = [];
			searchPromise = this.doSearch(walker, provider, -1)
				.then(result => {
					c([result, results]);
					// TODO@roblou telemetry
					// if (this.telemetryPipe) {
					// 	// __GDPR__TODO__ classify event
					// 	this.telemetryPipe({
					// 		eventName: 'fileSearch',
					// 		data: result.stats
					// 	});
					// }
				}, e, progress => {
					if (Array.isArray(progress)) {
						results = progress;
					} else {
						p(progress);
					}
				});
		}, () => {
			searchPromise.cancel();
		});

		let cache: Cache;
		if (config.cacheKey) {
			cache = this.getOrCreateCache(config.cacheKey);
			cache.resultsToSearchCache[config.filePattern] = allResultsPromise;
			allResultsPromise.then(null, err => {
				delete cache.resultsToSearchCache[config.filePattern];
			});
			allResultsPromise = this.preventCancellation(allResultsPromise);
		}

		let chained: TPromise<void>;
		return new PPromise<[ISerializedSearchComplete, IRawFileMatch[]], IProgress>((c, e, p) => {
			chained = allResultsPromise.then(([result, results]) => {
				const scorerCache: ScorerCache = cache ? cache.scorerCache : Object.create(null);
				const unsortedResultTime = Date.now();
				return this.sortResults(config, results, scorerCache)
					.then(sortedResults => {
						const sortedResultTime = Date.now();

						c([{
							stats: {
								...result.stats,
								...{ unsortedResultTime, sortedResultTime }
							},
							limitHit: result.limitHit || typeof config.maxResults === 'number' && results.length > config.maxResults
						}, sortedResults]);
					});
			}, e, p);
		}, () => {
			chained.cancel();
		});
	}

	private getOrCreateCache(cacheKey: string): Cache {
		const existing = this.caches[cacheKey];
		if (existing) {
			return existing;
		}
		return this.caches[cacheKey] = new Cache();
	}

	private trySortedSearchFromCache(config: IRawSearchQuery): TPromise<[ISerializedSearchComplete, IRawFileMatch[]]> {
		const cache = config.cacheKey && this.caches[config.cacheKey];
		if (!cache) {
			return undefined;
		}

		const cacheLookupStartTime = Date.now();
		const cached = this.getResultsFromCache(cache, config.filePattern);
		if (cached) {
			let chained: TPromise<void>;
			return new TPromise<[ISerializedSearchComplete, IRawFileMatch[]], IProgress>((c, e) => {
				chained = cached.then(([result, results, cacheStats]) => {
					const cacheLookupResultTime = Date.now();
					return this.sortResults(config, results, cache.scorerCache)
						.then(sortedResults => {
							const sortedResultTime = Date.now();

							const stats: ICachedSearchStats = {
								fromCache: true,
								cacheLookupStartTime: cacheLookupStartTime,
								cacheFilterStartTime: cacheStats.cacheFilterStartTime,
								cacheLookupResultTime: cacheLookupResultTime,
								cacheEntryCount: cacheStats.cacheFilterResultCount,
								resultCount: results.length
							};
							if (config.sortByScore) {
								stats.unsortedResultTime = cacheLookupResultTime;
								stats.sortedResultTime = sortedResultTime;
							}
							if (!cacheStats.cacheWasResolved) {
								stats.joined = result.stats;
							}
							c([
								{
									limitHit: result.limitHit || typeof config.maxResults === 'number' && results.length > config.maxResults,
									stats: stats
								},
								sortedResults
							]);
						});
				}, e);
			}, () => {
				chained.cancel();
			});
		}
		return undefined;
	}

	private sortResults(config: IRawSearchQuery, results: IRawFileMatch[], scorerCache: ScorerCache): TPromise<IRawFileMatch[]> {
		// we use the same compare function that is used later when showing the results using fuzzy scoring
		// this is very important because we are also limiting the number of results by config.maxResults
		// and as such we want the top items to be included in this result set if the number of items
		// exceeds config.maxResults.
		const query = prepareQuery(config.filePattern);
		const compare = (matchA: IRawFileMatch, matchB: IRawFileMatch) => compareItemsByScore(matchA, matchB, query, true, FileMatchItemAccessor, scorerCache);

		return arrays.topAsync(results, compare, config.maxResults, 10000);
	}

	private sendProgress(results: ISerializedFileMatch[], progressCb: (batch: ISerializedFileMatch[]) => void, batchSize: number) {
		if (batchSize && batchSize > 0) {
			for (let i = 0; i < results.length; i += batchSize) {
				progressCb(results.slice(i, i + batchSize));
			}
		} else {
			progressCb(results);
		}
	}

	private getResultsFromCache(cache: Cache, searchValue: string): PPromise<[ISerializedSearchComplete, IRawFileMatch[], CacheStats], IProgress> {
		if (path.isAbsolute(searchValue)) {
			return null; // bypass cache if user looks up an absolute path where matching goes directly on disk
		}

		// Find cache entries by prefix of search value
		const hasPathSep = searchValue.indexOf(path.sep) >= 0;
		let cached: PPromise<[ISerializedSearchComplete, IRawFileMatch[]], IFileSearchProgressItem>;
		let wasResolved: boolean;
		for (let previousSearch in cache.resultsToSearchCache) {

			// If we narrow down, we might be able to reuse the cached results
			if (strings.startsWith(searchValue, previousSearch)) {
				if (hasPathSep && previousSearch.indexOf(path.sep) < 0) {
					continue; // since a path character widens the search for potential more matches, require it in previous search too
				}

				const c = cache.resultsToSearchCache[previousSearch];
				c.then(() => { wasResolved = false; });
				wasResolved = true;
				cached = this.preventCancellation(c);
				break;
			}
		}

		if (!cached) {
			return null;
		}

		return new PPromise<[ISerializedSearchComplete, IRawFileMatch[], CacheStats], IProgress>((c, e, p) => {
			cached.then(([complete, cachedEntries]) => {
				const cacheFilterStartTime = Date.now();

				// Pattern match on results
				let results: IRawFileMatch[] = [];
				const normalizedSearchValueLowercase = strings.stripWildcards(searchValue).toLowerCase();
				for (let i = 0; i < cachedEntries.length; i++) {
					let entry = cachedEntries[i];

					// Check if this entry is a match for the search value
					if (!strings.fuzzyContains(entry.relativePath, normalizedSearchValueLowercase)) {
						continue;
					}

					results.push(entry);
				}

				c([complete, results, {
					cacheWasResolved: wasResolved,
					cacheFilterStartTime: cacheFilterStartTime,
					cacheFilterResultCount: cachedEntries.length
				}]);
			}, e, p);
		}, () => {
			cached.cancel();
		});
	}

	private doSearch(walker: FileWalker, provider: vscode.SearchProvider, batchSize?: number): PPromise<ISerializedSearchComplete, IFileSearchProgressItem> {
		return new PPromise<ISerializedSearchComplete, IFileSearchProgressItem>((c, e, p) => {
			let batch: IRawFileMatch[] = [];
			walker.walk(provider, (match) => {
				if (match) {
					if (batchSize) {
						batch.push(match);
						if (batchSize > 0 && batch.length >= batchSize) {
							p(batch);
							batch = [];
						}
					} else {
						p(match);
					}
				}
			},
				(error, limitHit) => {
					if (batch.length) {
						p(batch);
					}
					if (error) {
						e(error);
					} else {
						c({
							limitHit,
							stats: walker.getStats()
						});
					}
				});
		}, () => {
			walker.cancel();
		});
	}

	public clearCache(cacheKey: string): TPromise<void> {
		delete this.caches[cacheKey];
		return TPromise.as(undefined);
	}

	private preventCancellation<C, P>(promise: PPromise<C, P>): PPromise<C, P> {
		return new PPromise<C, P>((c, e, p) => {
			// Allow for piled up cancellations to come through first.
			process.nextTick(() => {
				promise.then(c, e, p);
			});
		}, () => {
			// Do not propagate.
		});
	}
}

class Cache {

	public resultsToSearchCache: { [searchValue: string]: PPromise<[ISerializedSearchComplete, IRawFileMatch[]], IFileSearchProgressItem>; } = Object.create(null);

	public scorerCache: ScorerCache = Object.create(null);
}

const FileMatchItemAccessor = new class implements IItemAccessor<IRawFileMatch> {

	public getItemLabel(match: IRawFileMatch): string {
		return match.basename; // e.g. myFile.txt
	}

	public getItemDescription(match: IRawFileMatch): string {
		return match.relativePath.substr(0, match.relativePath.length - match.basename.length - 1); // e.g. some/path/to/file
	}

	public getItemPath(match: IRawFileMatch): string {
		return match.relativePath; // e.g. some/path/to/file/myFile.txt
	}
};

interface CacheStats {
	cacheWasResolved: boolean;
	cacheFilterStartTime: number;
	cacheFilterResultCount: number;
}