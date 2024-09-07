/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Progress } from '../../../../../platform/progress/common/progress.js';
import { ITextQuery, QueryType } from '../../common/search.js';
import { ProviderResult, TextSearchCompleteNew, TextSearchProviderOptions, TextSearchProviderNew, TextSearchQueryNew, TextSearchResultNew } from '../../common/searchExtTypes.js';
import { NativeTextSearchManager } from '../../node/textSearchManager.js';

suite('NativeTextSearchManager', () => {
	test('fixes encoding', async () => {
		let correctEncoding = false;
		const provider: TextSearchProviderNew = {
			provideTextSearchResults(query: TextSearchQueryNew, options: TextSearchProviderOptions, progress: Progress<TextSearchResultNew>, token: CancellationToken): ProviderResult<TextSearchCompleteNew> {
				correctEncoding = options.folderOptions[0].encoding === 'windows-1252';

				return null;
			}
		};

		const query: ITextQuery = {
			type: QueryType.Text,
			contentPattern: {
				pattern: 'a'
			},
			folderQueries: [{
				folder: URI.file('/some/folder'),
				fileEncoding: 'windows1252'
			}]
		};

		const m = new NativeTextSearchManager(query, provider);
		await m.search(() => { }, CancellationToken.None);

		assert.ok(correctEncoding);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
