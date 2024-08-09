/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Progress } from 'vs/platform/progress/common/progress';
import { ITextQuery, QueryType } from 'vs/workbench/services/search/common/search';
import { ProviderResult, TextSearchCompleteNew, TextSearchProviderOptions, TextSearchProviderNew, TextSearchQueryNew, TextSearchResultNew } from 'vs/workbench/services/search/common/searchExtTypes';
import { NativeTextSearchManager } from 'vs/workbench/services/search/node/textSearchManager';

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
