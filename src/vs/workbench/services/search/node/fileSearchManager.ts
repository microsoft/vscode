/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import * as glob from 'vs/base/common/glob';
import * as resources from 'vs/base/common/resources';
import { StopWatch } from 'vs/base/common/stopwatch';
import { URI } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFileMatch, IFileSearchProviderStats, IFolderQuery, ISearchCompleteStats, IFileQuery } from 'vs/platform/search/common/search';
import { QueryGlobTester, resolvePatternsForProvider } from 'vs/workbench/services/search/node/search';
import * as vscode from 'vscode';

export interface IInternalFileMatch {
	base: URI;
	original?: URI;
	relativePath?: string; // Not present for extraFiles or absolute path matches
	basename: string;
	size?: number;
}

export interface IDirectoryEntry {
	base: URI;
	relativePath: string;
	basename: string;
}

export interface IDirectoryTree {
	rootEntries: IDirectoryEntry[];
	pathToEntries: { [relativePath: string]: IDirectoryEntry[] };
}


class FileSearchEngine {
	private filePattern: string;
	private includePattern: glob.ParsedExpression;
	private maxResults: number;
	private exists: boolean;
	private isLimitHit: boolean;
	private resultCount: number;
	private isCanceled: boolean;

	private activeCancellationTokens: Set<CancellationTokenSource>;

	private globalExcludePattern: glob.ParsedExpression;

	constructor(private config: IFileQuery, private provider: vscode.FileSearchProvider) {
		this.filePattern = config.filePattern;
		this.includePattern = config.includePattern && glob.parse(config.includePattern);
		this.maxResults = config.maxResults || null;
		this.exists = config.exists;
		this.resultCount = 0;
		this.isLimitHit = false;
		this.activeCancellationTokens = new Set<CancellationTokenSource>();

		this.globalExcludePattern = config.excludePattern && glob.parse(config.excludePattern);
	}

	public cancel(): void {
		this.isCanceled = true;
		this.activeCancellationTokens.forEach(t => t.cancel());
		this.activeCancellationTokens = new Set();
	}

	public search(_onResult: (match: IInternalFileMatch) => void): TPromise<IInternalSearchComplete> {
		const folderQueries = this.config.folderQueries;

		return new TPromise((resolve, reject) => {
			const onResult = (match: IInternalFileMatch) => {
				this.resultCount++;
				_onResult(match);
			};

			// Support that the file pattern is a full path to a file that exists
			if (this.isCanceled) {
				return resolve({ limitHit: this.isLimitHit });
			}

			// For each extra file
			if (this.config.extraFileResources) {
				this.config.extraFileResources
					.forEach(extraFile => {
						const extraFileStr = extraFile.toString(); // ?
						const basename = path.basename(extraFileStr);
						if (this.globalExcludePattern && this.globalExcludePattern(extraFileStr, basename)) {
							return; // excluded
						}

						// File: Check for match on file pattern and include pattern
						this.matchFile(onResult, { base: extraFile, basename });
					});
			}

			// For each root folder
			TPromise.join(folderQueries.map(fq => {
				return this.searchInFolder(fq, onResult);
			})).then(stats => {
				resolve({
					limitHit: this.isLimitHit,
					stats: stats[0] // Only looking at single-folder workspace stats...
				});
			}, (errs: Error[]) => {
				const errMsg = errs
					.map(err => toErrorMessage(err))
					.filter(msg => !!msg)[0];

				reject(new Error(errMsg));
			});
		});
	}

	private searchInFolder(fq: IFolderQuery<URI>, onResult: (match: IInternalFileMatch) => void): TPromise<IFileSearchProviderStats> {
		let cancellation = new CancellationTokenSource();
		return new TPromise((resolve, reject) => {
			const options = this.getSearchOptionsForFolder(fq);
			const tree = this.initDirectoryTree();

			const queryTester = new QueryGlobTester(this.config, fq);
			const noSiblingsClauses = !queryTester.hasSiblingExcludeClauses();

			let providerSW: StopWatch;
			new TPromise(_resolve => process.nextTick(_resolve))
				.then(() => {
					this.activeCancellationTokens.add(cancellation);

					providerSW = StopWatch.create();
					return this.provider.provideFileSearchResults(
						{
							pattern: this.config.filePattern || ''
						},
						options,
						cancellation.token);
				})
				.then(results => {
					const providerTime = providerSW.elapsed();
					const postProcessSW = StopWatch.create();

					if (this.isCanceled) {
						return null;
					}

					if (results) {
						results.forEach(result => {
							const relativePath = path.relative(fq.folder.fsPath, result.fsPath);

							if (noSiblingsClauses) {
								const basename = path.basename(result.fsPath);
								this.matchFile(onResult, { base: fq.folder, relativePath, basename });

								return;
							}

							// TODO: Optimize siblings clauses with ripgrep here.
							this.addDirectoryEntries(tree, fq.folder, relativePath, onResult);
						});
					}

					this.activeCancellationTokens.delete(cancellation);
					if (this.isCanceled) {
						return null;
					}

					this.matchDirectoryTree(tree, queryTester, onResult);
					return <IFileSearchProviderStats>{
						providerTime,
						postProcessTime: postProcessSW.elapsed()
					};
				}).then(
					stats => {
						cancellation.dispose();
						resolve(stats);
					},
					err => {
						cancellation.dispose();
						reject(err);
					});
		});
	}

	private getSearchOptionsForFolder(fq: IFolderQuery<URI>): vscode.FileSearchOptions {
		const includes = resolvePatternsForProvider(this.config.includePattern, fq.includePattern);
		const excludes = resolvePatternsForProvider(this.config.excludePattern, fq.excludePattern);

		return {
			folder: fq.folder,
			excludes,
			includes,
			useIgnoreFiles: !fq.disregardIgnoreFiles,
			useGlobalIgnoreFiles: !fq.disregardGlobalIgnoreFiles,
			followSymlinks: !fq.ignoreSymlinks,
			maxResults: this.config.maxResults
		};
	}

	private initDirectoryTree(): IDirectoryTree {
		const tree: IDirectoryTree = {
			rootEntries: [],
			pathToEntries: Object.create(null)
		};
		tree.pathToEntries['.'] = tree.rootEntries;
		return tree;
	}

	private addDirectoryEntries({ pathToEntries }: IDirectoryTree, base: URI, relativeFile: string, onResult: (result: IInternalFileMatch) => void) {
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

	private matchDirectoryTree({ rootEntries, pathToEntries }: IDirectoryTree, queryTester: QueryGlobTester, onResult: (result: IInternalFileMatch) => void) {
		const self = this;
		const filePattern = this.filePattern;
		function matchDirectory(entries: IDirectoryEntry[]) {
			const hasSibling = glob.hasSiblingFn(() => entries.map(entry => entry.basename));
			for (let i = 0, n = entries.length; i < n; i++) {
				const entry = entries[i];
				const { relativePath, basename } = entry;

				// Check exclude pattern
				// If the user searches for the exact file name, we adjust the glob matching
				// to ignore filtering by siblings because the user seems to know what she
				// is searching for and we want to include the result in that case anyway
				if (!queryTester.includedInQuerySync(relativePath, basename, filePattern !== basename ? hasSibling : undefined)) {
					continue;
				}

				const sub = pathToEntries[relativePath];
				if (sub) {
					matchDirectory(sub);
				} else {
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

	private matchFile(onResult: (result: IInternalFileMatch) => void, candidate: IInternalFileMatch): void {
		if (!this.includePattern || this.includePattern(candidate.relativePath, candidate.basename)) {
			if (this.exists || (this.maxResults && this.resultCount >= this.maxResults)) {
				this.isLimitHit = true;
				this.cancel();
			}

			if (!this.isLimitHit) {
				onResult(candidate);
			}
		}
	}
}

interface IInternalSearchComplete {
	limitHit: boolean;
	stats?: IFileSearchProviderStats;
}

export class FileSearchManager {

	private static readonly BATCH_SIZE = 512;

	fileSearch(config: IFileQuery, provider: vscode.FileSearchProvider, onBatch: (matches: IFileMatch[]) => void, token: CancellationToken): TPromise<ISearchCompleteStats> {
		const engine = new FileSearchEngine(config, provider);

		let resultCount = 0;
		const onInternalResult = (batch: IInternalFileMatch[]) => {
			resultCount += batch.length;
			onBatch(batch.map(m => this.rawMatchToSearchItem(m)));
		};

		return this.doSearch(engine, FileSearchManager.BATCH_SIZE, onInternalResult, token).then(
			result => {
				return <ISearchCompleteStats>{
					limitHit: result.limitHit,
					stats: {
						fromCache: false,
						type: 'fileSearchProvider',
						resultCount,
						detailStats: result.stats
					}
				};
			});
	}

	private rawMatchToSearchItem(match: IInternalFileMatch): IFileMatch {
		if (match.relativePath) {
			return {
				resource: resources.joinPath(match.base, match.relativePath)
			};
		} else {
			// extraFileResources
			return {
				resource: match.base
			};
		}
	}

	private doSearch(engine: FileSearchEngine, batchSize: number, onResultBatch: (matches: IInternalFileMatch[]) => void, token: CancellationToken): TPromise<IInternalSearchComplete> {
		token.onCancellationRequested(() => {
			engine.cancel();
		});

		const _onResult = match => {
			if (match) {
				batch.push(match);
				if (batchSize > 0 && batch.length >= batchSize) {
					onResultBatch(batch);
					batch = [];
				}
			}
		};

		let batch: IInternalFileMatch[] = [];
		return engine.search(_onResult).then(result => {
			if (batch.length) {
				onResultBatch(batch);
			}

			return result;
		}, error => {
			if (batch.length) {
				onResultBatch(batch);
			}

			return TPromise.wrapError(error);
		});
	}
}
