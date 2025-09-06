/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ValueWithChangeEvent } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ContextKeyValue } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ISearchResult, ISearchTreeFileMatch } from '../../search/browser/searchTreeModel/searchTreeCommon.js';
import { SearchResultHighlighter } from './searchResultHighlighter.js';

export class SearchMultiDiffSourceResolver extends Disposable implements IMultiDiffSourceResolver {
	private static readonly _scheme = 'search-multi-diff-source';
	private static readonly _activeResolvers = new Map<string, SearchMultiDiffSourceResolver>();

	public static getMultiDiffSourceUri(searchResult: ISearchResult): URI {
		const id = new Date().getTime().toString() + '-' + Math.random().toString();
		return URI.from({
			scheme: SearchMultiDiffSourceResolver._scheme,
			path: `/${id}`
		});
	}

	private readonly _resources: ValueWithChangeEvent<readonly MultiDiffEditorItem[]>;
	private readonly _searchResultHighlighter: SearchResultHighlighter;
	private readonly _id: string;

	constructor(
		private readonly _searchResult: ISearchResult,
		multiDiffSourceUri: URI,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._id = multiDiffSourceUri.path.substring(1); // Remove leading slash
		this._searchResultHighlighter = this._register(instantiationService.createInstance(SearchResultHighlighter));
		this._resources = new ValueWithChangeEvent([]);

		// Store this resolver so it can be found by URI
		SearchMultiDiffSourceResolver._activeResolvers.set(this._id, this);
		this._register({ dispose: () => SearchMultiDiffSourceResolver._activeResolvers.delete(this._id) });

		// Listen for changes to the search result
		this._register(this._searchResult.onChange(() => {
			this._updateMultiDiffItems();
		}));

		this._updateMultiDiffItems();
	}

	canHandleUri(uri: URI): boolean {
		if (uri.scheme !== SearchMultiDiffSourceResolver._scheme) {
			return false;
		}
		const id = uri.path.substring(1); // Remove leading slash
		return SearchMultiDiffSourceResolver._activeResolvers.has(id);
	}

	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {
		const id = uri.path.substring(1); // Remove leading slash
		const resolver = SearchMultiDiffSourceResolver._activeResolvers.get(id);
		
		if (!resolver) {
			throw new Error(`No search multi-diff resolver found for ${uri.toString()}`);
		}

		return {
			resources: resolver._resources,
			contextKeys: {
				'searchEditor.multiDiff': true
			} as Record<string, ContextKeyValue>
		};
	}

	private _updateMultiDiffItems(): void {
		const fileMatches = this._searchResult.matches();
		const items: MultiDiffEditorItem[] = [];

		for (const fileMatch of fileMatches) {
			if (fileMatch.textMatches().length === 0) {
				continue;
			}

			const originalUri = fileMatch.resource;
			const modifiedUri = this._searchResultHighlighter.getHighlightedFileUri(fileMatch);

			// Store the file match for the highlighter
			this._searchResultHighlighter.setFileMatch(modifiedUri, fileMatch);

			items.push(new MultiDiffEditorItem(
				originalUri, // original version (without highlights)
				modifiedUri, // modified version (with search highlights)
				originalUri, // go to file URI (for navigation)
				fileMatch.name(), // editor title
				{
					'searchEditor.fileMatch': true,
					'searchEditor.matchCount': fileMatch.count()
				}
			));
		}

		this._resources.setValue(items);
	}
}

export class SearchMultiDiffSourceResolverContribution extends Disposable {
	static readonly ID = 'workbench.contrib.searchMultiDiffSourceResolver';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
	) {
		super();

		this._register(multiDiffSourceResolverService.registerResolver({
			canHandleUri: (uri: URI) => {
				if (uri.scheme !== 'search-multi-diff-source') {
					return false;
				}
				const id = uri.path.substring(1); // Remove leading slash
				return SearchMultiDiffSourceResolver._activeResolvers.has(id);
			},
			resolveDiffSource: async (uri: URI) => {
				const id = uri.path.substring(1); // Remove leading slash
				const resolver = SearchMultiDiffSourceResolver._activeResolvers.get(id);
				
				if (!resolver) {
					throw new Error(`No search multi-diff resolver found for ${uri.toString()}`);
				}

				return {
					resources: resolver._resources,
					contextKeys: {
						'searchEditor.multiDiff': true
					} as Record<string, ContextKeyValue>
				};
			}
		}));
	}
}