/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, Promises, raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { compareItemsByFuzzyScore, FuzzyScorerCache, prepareQuery } from '../../../../base/common/fuzzyScorer.js';
import * as glob from '../../../../base/common/glob.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { basename, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { FileType, IFileService } from '../../../../platform/files/common/files.js';
import { IgnoreFile } from '../../search/common/ignoreFile.js';
import { IFileQuery, IFolderQuery, ISearchComplete, ISearchResultProvider, ITextQuery, isFilePatternMatch, QueryGlobTester } from '../../search/common/search.js';

interface IFileSearchCache extends IDisposable {
	readonly cancellation: CancellationTokenSource;
	readonly folders: Map<string, Promise<URI[]>>;
}

export class AgentHostFileSearchProvider extends Disposable implements ISearchResultProvider {

	private readonly caches = this._register(new DisposableMap<string, IFileSearchCache>());

	constructor(
		@IFileService private readonly fileService: IFileService,
	) {
		super();
	}

	async fileSearch(query: IFileQuery, token = CancellationToken.None): Promise<ISearchComplete> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		let cache: IFileSearchCache | undefined;
		if (query.cacheKey) {
			cache = this.caches.get(query.cacheKey);
			if (!cache) {
				const cancellation = new CancellationTokenSource();
				cache = { cancellation, folders: new Map(), dispose: () => cancellation.dispose(true) };
				this.caches.set(query.cacheKey, cache);
			}
		}

		const folders = await Promise.all(query.folderQueries.map(folderQuery => {
			const key = JSON.stringify([folderQuery, query.includePattern, query.excludePattern, query.ignoreGlobCase]);
			let files = cache?.folders.get(key);
			if (!files) {
				files = this.collectFiles(query, folderQuery, cache?.cancellation.token ?? token).catch(error => {
					cache?.folders.delete(key);
					throw error;
				});
				cache?.folders.set(key, files);
			}
			return raceCancellationError(files, token);
		}));
		const seen = new ResourceSet();
		const matches: { resource: URI; relativePath: string }[] = [];
		const add = (resource: URI, relativePath: string) => {
			if (!seen.has(resource) && (!query.filePattern || isFilePatternMatch({ relativePath, searchPath: relativePath }, query.filePattern, !query.shouldGlobMatchFilePattern, query.ignoreGlobCase))) {
				seen.add(resource);
				matches.push({ resource, relativePath });
			}
		};
		for (let i = 0; i < folders.length; i++) {
			const root = query.folderQueries[i].folder;
			for (const resource of folders[i]) {
				add(resource, resource.path.slice(root.path.replace(/\/$/, '').length + 1));
			}
		}
		for (const resource of query.extraFileResources ?? []) {
			if (!query.excludePattern || !glob.match(query.excludePattern, resource.path, { ignoreCase: query.ignoreGlobCase })) {
				add(resource, resource.path);
			}
		}
		if (query.sortByScore && query.filePattern && !query.shouldGlobMatchFilePattern) {
			const prepared = prepareQuery(query.filePattern);
			const scorerCache: FuzzyScorerCache = Object.create(null);
			matches.sort((a, b) => compareItemsByFuzzyScore(a, b, prepared, true, {
				getItemLabel: item => basename(item.resource),
				getItemDescription: item => item.relativePath,
				getItemPath: item => item.relativePath,
			}, scorerCache));
		}
		const limit = query.exists ? 0 : query.maxResults || matches.length;
		return {
			results: matches.slice(0, limit).map(({ resource }) => ({ resource })),
			limitHit: matches.length > limit,
			messages: [],
		};
	}

	private async collectFiles(query: IFileQuery, folderQuery: IFolderQuery, token: CancellationToken): Promise<URI[]> {
		const provider = this.fileService.getProvider(folderQuery.folder.scheme);
		if (!provider) {
			throw new Error(`No filesystem provider for ${folderQuery.folder.scheme}`);
		}
		const disposables = new DisposableStore();
		const limiter = disposables.add(new Limiter<[string, FileType][]>(16));
		const tester = new QueryGlobTester(query, folderQuery);
		const files: URI[] = [];
		const visit = async (directory: URI, relativeDirectory: string, parentIgnore?: IgnoreFile): Promise<void> => {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const entries = await limiter.queue(async () => {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				return provider.readdir(directory);
			});
			let ignore = parentIgnore;
			// Parent and global ignore files can be outside the host's granted query roots.
			if (!folderQuery.disregardIgnoreFiles) {
				for (const name of ['.gitignore', '.ignore']) {
					if (entries.some(([entry]) => entry === name)) {
						const content = await this.fileService.readFile(joinPath(directory, name));
						ignore = new IgnoreFile(content.value.toString(), `/${relativeDirectory}`, ignore, query.ignoreGlobCase || folderQuery.ignoreGlobCase);
					}
				}
			}
			const siblings = new Set(entries.map(([name]) => name));
			const directories: Promise<void>[] = [];
			for (const [name, type] of entries) {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				const relativePath = relativeDirectory + name;
				const isDirectory = !!(type & FileType.Directory);
				if ((folderQuery.ignoreSymlinks && (type & FileType.SymbolicLink))
					|| (ignore && !ignore.isPathIncludedInTraversal(`/${relativePath}`, isDirectory))
					|| tester.matchesExcludesSync(relativePath, name, sibling => siblings.has(sibling))) {
					continue;
				}
				const resource = joinPath(directory, name);
				if (isDirectory) {
					directories.push(visit(resource, `${relativePath}/`, ignore));
				} else if ((type & FileType.File) && tester.includedInQuerySync(relativePath, name, sibling => siblings.has(sibling))) {
					files.push(resource);
				}
			}
			await Promises.settled(directories);
		};
		try {
			await visit(folderQuery.folder, '');
			return files;
		} finally {
			disposables.dispose();
		}
	}

	async clearCache(cacheKey: string): Promise<void> {
		this.caches.deleteAndDispose(cacheKey);
	}

	async getAIName(): Promise<undefined> {
		return undefined;
	}

	async textSearch(_query: ITextQuery): Promise<ISearchComplete> {
		throw new Error('Agent host file search does not provide text search');
	}
}
