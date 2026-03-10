/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IFileMatch, IFileQuery, ISearchComplete, ISearchProgressItem, ISearchResultProvider, ITextQuery } from '../../../../workbench/services/search/common/search.js';

/**
 * A file search provider for the `github-remote-file://` scheme.
 * Walks the virtual file tree via `IFileService.resolve()` to produce search results,
 * since ripgrep and native file search are not available for this virtual filesystem.
 */
export class GitHubRemoteFileSearchProvider implements ISearchResultProvider {

	private static readonly MAX_DEPTH = 10;

	constructor(
		@IFileService private readonly fileService: IFileService,
	) { }

	async getAIName(): Promise<string | undefined> {
		return undefined;
	}

	async textSearch(_query: ITextQuery, _onProgress?: (p: ISearchProgressItem) => void, _token?: CancellationToken): Promise<ISearchComplete> {
		return { results: [], messages: [] };
	}

	async fileSearch(query: IFileQuery, token?: CancellationToken): Promise<ISearchComplete> {
		const results: IFileMatch[] = [];
		const maxResults = query.maxResults ?? 512;
		const patternLower = query.filePattern?.toLowerCase();

		for (const folderQuery of query.folderQueries) {
			if (token?.isCancellationRequested) {
				break;
			}
			await this.collectFiles(folderQuery.folder, results, maxResults, patternLower, 0, token);
		}

		return {
			results,
			limitHit: results.length >= maxResults,
			messages: [],
		};
	}

	async clearCache(_cacheKey: string): Promise<void> { }

	private async collectFiles(uri: URI, results: IFileMatch[], maxResults: number, patternLower: string | undefined, depth: number, token?: CancellationToken): Promise<void> {
		if (results.length >= maxResults || depth > GitHubRemoteFileSearchProvider.MAX_DEPTH || token?.isCancellationRequested) {
			return;
		}

		try {
			const stat = await this.fileService.resolve(uri);
			if (!stat.children) {
				return;
			}

			const children = stat.children.slice().sort((a, b) => {
				if (a.isDirectory !== b.isDirectory) {
					return a.isDirectory ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			});

			for (const child of children) {
				if (results.length >= maxResults || token?.isCancellationRequested) {
					break;
				}
				if (child.isDirectory) {
					await this.collectFiles(child.resource, results, maxResults, patternLower, depth + 1, token);
				} else {
					if (patternLower && !child.name.toLowerCase().includes(patternLower)) {
						continue;
					}
					results.push({ resource: child.resource });
				}
			}
		} catch {
			// ignore errors for individual directories
		}
	}
}
