/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISearchService, ITextQueryProps, ISearchProgressItem, ISearchComplete, IFileQueryProps, SearchProviderType, ISearchResultProvider, ITextQuery, IFileMatch, QueryType, FileMatch, pathIncludedInQuery } from 'vs/workbench/services/search/common/search';
import { URI } from 'vs/base/common/uri';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { editorMatchesToTextSearchResults, addContextToEditorMatches } from 'vs/workbench/services/search/common/searchHelpers';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { coalesce } from 'vs/base/common/arrays';

export class SimpleSearchService implements ISearchService {

	_serviceBrand: any;

	constructor(
		@IModelService private modelService: IModelService,
		@IEditorService private editorService: IEditorService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {

	}

	textSearch(query: ITextQueryProps<URI>, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete> {
		// Get local results from dirty/untitled
		const localResults = this.getLocalResults(query);

		if (onProgress) {
			coalesce(localResults.values()).forEach(onProgress);
		}

		return Promise.resolve(undefined);
	}

	fileSearch(query: IFileQueryProps<URI>, token?: CancellationToken): Promise<ISearchComplete> {
		return Promise.resolve(undefined);
	}

	clearCache(cacheKey: string): Promise<void> {
		return Promise.resolve(undefined);
	}

	registerSearchResultProvider(scheme: string, type: SearchProviderType, provider: ISearchResultProvider): IDisposable {
		return Disposable.None;
	}

	private getLocalResults(query: ITextQuery): ResourceMap<IFileMatch> {
		const localResults = new ResourceMap<IFileMatch>();

		if (query.type === QueryType.Text) {
			const models = this.modelService.getModels();
			models.forEach((model) => {
				const resource = model.uri;
				if (!resource) {
					return;
				}

				if (!this.editorService.isOpen({ resource })) {
					return;
				}

				// Support untitled files
				if (resource.scheme === Schemas.untitled) {
					if (!this.untitledEditorService.exists(resource)) {
						return;
					}
				}

				// Don't support other resource schemes than files for now
				// todo@remote
				// why is that? we should search for resources from other
				// schemes
				else if (resource.scheme !== Schemas.file) {
					return;
				}

				if (!this.matches(resource, query)) {
					return; // respect user filters
				}

				// Use editor API to find matches
				const matches = model.findMatches(query.contentPattern.pattern, false, query.contentPattern.isRegExp, query.contentPattern.isCaseSensitive, query.contentPattern.isWordMatch ? query.contentPattern.wordSeparators : null, false, query.maxResults);
				if (matches.length) {
					const fileMatch = new FileMatch(resource);
					localResults.set(resource, fileMatch);

					const textSearchResults = editorMatchesToTextSearchResults(matches, model, query.previewOptions);
					fileMatch.results = addContextToEditorMatches(textSearchResults, model, query);
				} else {
					localResults.set(resource, null);
				}
			});
		}

		return localResults;
	}

	private matches(resource: URI, query: ITextQuery): boolean {
		// includes
		if (query.includePattern) {
			if (resource.scheme !== Schemas.file) {
				return false; // if we match on file patterns, we have to ignore non file resources
			}
		}

		return pathIncludedInQuery(query, resource.fsPath);
	}
}

registerSingleton(ISearchService, SimpleSearchService, true);