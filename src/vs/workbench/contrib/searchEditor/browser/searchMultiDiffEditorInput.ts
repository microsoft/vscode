/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MultiDiffEditorInput } from '../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolverService, IResolvedMultiDiffSource, IMultiDiffSourceResolver } from '../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { SearchMultiDiffSourceResolver } from './searchMultiDiffSourceResolver.js';
import { ISearchResult } from '../../search/browser/searchTreeModel/searchTreeCommon.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';

export const SearchMultiDiffEditorScheme = 'search-multi-diff-editor';

export class SearchMultiDiffEditorInput extends MultiDiffEditorInput implements IMultiDiffSourceResolver {
	private readonly _searchMultiDiffSourceResolver: SearchMultiDiffSourceResolver;

	public static createInput(searchResult: ISearchResult, instantiationService: IInstantiationService): SearchMultiDiffEditorInput {
		const multiDiffSource = URI.parse(`${SearchMultiDiffEditorScheme}:${new Date().getMilliseconds().toString() + Math.random().toString()}`);
		return instantiationService.createInstance(
			SearchMultiDiffEditorInput,
			multiDiffSource,
			searchResult
		);
	}

	constructor(
		multiDiffSource: URI,
		private readonly _searchResult: ISearchResult,
		@ITextModelService _textModelService: ITextModelService,
		@ITextResourceConfigurationService _textResourceConfigurationService: ITextResourceConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService _multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ITextFileService _textFileService: ITextFileService,
	) {
		super(multiDiffSource, undefined, undefined, true, _textModelService, _textResourceConfigurationService, instantiationService, _multiDiffSourceResolverService, _textFileService);

		this._searchMultiDiffSourceResolver = this._register(instantiationService.createInstance(SearchMultiDiffSourceResolver, _searchResult));
		this._register(_multiDiffSourceResolverService.registerResolver(this));
	}

	canHandleUri(uri: URI): boolean {
		return uri.toString() === this.multiDiffSource.toString();
	}

	async resolveDiffSource(_: URI): Promise<IResolvedMultiDiffSource> {
		return this._searchMultiDiffSourceResolver.resolveDiffSource(_);
	}
}