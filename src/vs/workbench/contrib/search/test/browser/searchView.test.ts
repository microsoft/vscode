/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISearchComplete, ISearchProgressItem } from '../../../../services/search/common/search.js';
import { SearchView } from '../../browser/searchView.js';

suite('Search View - keyword suggestions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves existing AI results when no pending promise is stored', async () => {
		const setAIQuery = sinon.spy();
		const aiSearch = sinon.spy();
		const cachedResults: ISearchComplete = { results: [], messages: [] };
		const view: { getKeywordSuggestions(): Promise<void>; _cachedResults: ISearchComplete } = Object.assign(Object.create(SearchView.prototype), {
			viewModel: { hasAIResults: true, searchResult: { setAIQueryUsingTextQuery: setAIQuery }, aiSearch },
			_cachedResults: cachedResults
		});

		await view.getKeywordSuggestions();
		await view.getKeywordSuggestions();

		assert.deepStrictEqual({ resets: setAIQuery.callCount, requests: aiSearch.callCount, cache: view._cachedResults }, {
			resets: 0, requests: 0, cache: cachedResults
		});
	});

	test('reuses an AI request before and after its first streamed match', async () => {
		const pending = new DeferredPromise<ISearchComplete>();
		const setAIQuery = sinon.spy();
		let onResult: ((result: ISearchProgressItem | undefined) => void) | undefined;
		let hasAIResults = false;
		const aiSearch = sinon.spy((callback: (result: ISearchProgressItem | undefined) => void) => {
			onResult = callback;
			hasAIResults = true;
			return pending.p;
		});
		const view: {
			getKeywordSuggestions(): Promise<void>;
			_pendingSemanticSearchPromise: Promise<ISearchComplete> | undefined;
			_cachedResults: ISearchComplete | undefined;
		} = Object.assign(Object.create(SearchView.prototype), {
			viewModel: {
				get hasAIResults() { return hasAIResults; },
				searchResult: { setAIQueryUsingTextQuery: setAIQuery },
				aiSearch
			}
		});

		const first = view.getKeywordSuggestions();
		const second = view.getKeywordSuggestions();
		onResult!({ resource: URI.file('/sample'), results: [] });
		const pendingAfterMatch = view._pendingSemanticSearchPromise;
		await view.getKeywordSuggestions();
		const complete: ISearchComplete = { results: [], messages: [] };
		await pending.complete(complete);
		await Promise.all([first, second]);

		assert.deepStrictEqual({ resets: setAIQuery.callCount, requests: aiSearch.callCount, pendingAfterMatch, cache: view._cachedResults }, {
			resets: 1, requests: 1, pendingAfterMatch: undefined, cache: complete
		});
	});
});
