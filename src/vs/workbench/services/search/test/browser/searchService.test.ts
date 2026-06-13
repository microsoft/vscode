/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestServiceAccessor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IFileQuery, QueryType } from '../../common/search.js';
import { SearchService } from '../../common/searchService.js';

suite('SearchService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('fileSearch returns empty for virtual workspace without provider', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables) as TestInstantiationService;
		const accessor = instantiationService.createInstance(TestServiceAccessor);
		const folder = URI.from({ scheme: 'vscode-vfs', path: '/workspace' });
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(accessor.fileService.registerProvider(folder.scheme, fileSystemProvider));
		await fileSystemProvider.mkdir(folder);

		const searchService = disposables.add(instantiationService.createInstance(SearchService));
		const query: IFileQuery = {
			type: QueryType.File,
			folderQueries: [{ folder }]
		};

		const result = await searchService.fileSearch(query);

		assert.deepStrictEqual(result.results, []);
	});
});
