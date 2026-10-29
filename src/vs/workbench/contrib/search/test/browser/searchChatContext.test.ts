/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IFileQuery, ISearchService } from '../../../../services/search/common/search.js';
import { MAX_CHAT_FILE_COMPLETION_RESULTS, searchFilesAndFolders } from '../../browser/searchChatContext.js';

suite('Search Chat Context', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('limits file completion search results', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		let actualMaxResults: number | undefined;
		instantiationService.stub(ISearchService, {
			fileSearch: async (query: IFileQuery) => {
				actualMaxResults = query.maxResults;
				return { results: [], messages: [] };
			},
		});

		await searchFilesAndFolders(
			URI.file('/workspace'),
			'file',
			true,
			CancellationToken.None,
			undefined,
			new TestConfigurationService(),
			instantiationService.get(ISearchService),
			MAX_CHAT_FILE_COMPLETION_RESULTS
		);

		assert.strictEqual(actualMaxResults, 100);
	});
});
