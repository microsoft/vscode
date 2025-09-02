/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ValueWithChangeEvent } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ContextKeyValue } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMultiDiffSourceResolver, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ISearchResult, ISearchTreeFileMatch } from '../../search/browser/searchTreeModel/searchTreeCommon.js';
import { SearchResultHighlighter } from './searchResultHighlighter.js';

export class SearchMultiDiffSourceResolver extends Disposable implements IMultiDiffSourceResolver {
	private static readonly _scheme = 'search-multi-diff-source';

	public static getMultiDiffSourceUri(): URI {
		return URI.from({
			scheme: SearchMultiDiffSourceResolver._scheme,
			path: `/${new Date().getTime()}-${Math.random()}`
		});
	}

	private readonly _resources: ValueWithChangeEvent<readonly MultiDiffEditorItem[]>;
	private readonly _searchResultHighlighter: SearchResultHighlighter;

	constructor(
		private readonly _searchResult: ISearchResult,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._searchResultHighlighter = this._register(instantiationService.createInstance(SearchResultHighlighter));
		this._resources = new ValueWithChangeEvent([]);

		// Listen for changes to the search result
		this._register(this._searchResult.onChange(() => {
			this._updateMultiDiffItems();
		}));

		this._updateMultiDiffItems();
	}

	canHandleUri(uri: URI): boolean {
		return uri.scheme === SearchMultiDiffSourceResolver._scheme;
	}

	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {
		return {
			resources: this._resources,
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