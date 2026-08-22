/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { checkGlobFileExists } from '../../common/workspaceContains.js';
import { IFileQuery, ISearchService } from '../../../search/common/search.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('Workspace Contains', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('glob search disregards ignore files and exclude settings', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables) as TestInstantiationService;
		const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		configurationService.setUserConfiguration('search', { useIgnoreFiles: true });
		configurationService.setUserConfiguration('files', { exclude: { '**/Content': true } });

		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery) {
				assert.deepStrictEqual({
					disregardIgnoreFiles: query.folderQueries[0].disregardIgnoreFiles,
					excludePattern: query.folderQueries[0].excludePattern
				}, {
					disregardIgnoreFiles: true,
					excludePattern: []
				});

				return Promise.resolve({ limitHit: true, results: [], messages: [] });
			}
		});

		const exists = await instantiationService.invokeFunction(
			checkGlobFileExists,
			[URI.file('/workspace')],
			['**/Content/test123.json'],
			CancellationToken.None
		);

		assert.strictEqual(exists, true);
	});
});
