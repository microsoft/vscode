/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MainThreadWorkspace } from '../../browser/mainThreadWorkspace.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { IFileQuery, ISearchService } from '../../../services/search/common/search.js';
import { workbenchInstantiationService } from '../../../test/browser/workbenchTestServices.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';

suite('MainThreadWorkspace', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let configService: TestConfigurationService;
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables) as TestInstantiationService;

		configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		configService.setUserConfiguration('search', {});
	});

	test('simple', () => {
		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery) {
				assert.strictEqual(query.folderQueries.length, 1);
				assert.strictEqual(query.folderQueries[0].disregardIgnoreFiles, true);

				assert.deepStrictEqual({ ...query.includePattern }, { 'foo': true });
				assert.strictEqual(query.maxResults, 10);

				return Promise.resolve({ results: [], messages: [] });
			}
		});

		const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({ $initializeWorkspace: () => { } })));
		return mtw.$startFileSearch(null, { maxResults: 10, includePattern: 'foo', disregardSearchExcludeSettings: true }, CancellationToken.None);
	});

	test('exclude defaults', () => {
		configService.setUserConfiguration('search', {
			'exclude': { 'searchExclude': true }
		});
		configService.setUserConfiguration('files', {
			'exclude': { 'filesExclude': true }
		});

		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery) {
				assert.strictEqual(query.folderQueries.length, 1);
				assert.strictEqual(query.folderQueries[0].disregardIgnoreFiles, true);
				assert.strictEqual(query.folderQueries[0].excludePattern?.length, 1);
				assert.deepStrictEqual(query.folderQueries[0].excludePattern[0].pattern, { 'filesExclude': true });

				return Promise.resolve({ results: [], messages: [] });
			}
		});

		const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({ $initializeWorkspace: () => { } })));
		return mtw.$startFileSearch(null, { maxResults: 10, includePattern: '', disregardSearchExcludeSettings: true }, CancellationToken.None);
	});

	test('disregard excludes', () => {
		configService.setUserConfiguration('search', {
			'exclude': { 'searchExclude': true }
		});
		configService.setUserConfiguration('files', {
			'exclude': { 'filesExclude': true }
		});

		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery) {
				assert.deepStrictEqual(query.folderQueries[0].excludePattern, []);
				assert.deepStrictEqual(query.excludePattern, undefined);

				return Promise.resolve({ results: [], messages: [] });
			}
		});

		const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({ $initializeWorkspace: () => { } })));
		return mtw.$startFileSearch(null, { maxResults: 10, includePattern: '', disregardSearchExcludeSettings: true, disregardExcludeSettings: true }, CancellationToken.None);
	});

	test('do not disregard anything if disregardExcludeSettings is true', () => {
		configService.setUserConfiguration('search', {
			'exclude': { 'searchExclude': true }
		});
		configService.setUserConfiguration('files', {
			'exclude': { 'filesExclude': true }
		});

		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery) {
				assert.strictEqual(query.folderQueries.length, 1);
				assert.strictEqual(query.folderQueries[0].disregardIgnoreFiles, true);
				assert.deepStrictEqual(query.folderQueries[0].excludePattern, []);

				return Promise.resolve({ results: [], messages: [] });
			}
		});

		const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({ $initializeWorkspace: () => { } })));
		return mtw.$startFileSearch(null, { maxResults: 10, includePattern: '', disregardExcludeSettings: true, disregardSearchExcludeSettings: false }, CancellationToken.None);
	});

	test('exclude string', () => {
		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery) {
				assert.deepStrictEqual(query.folderQueries[0].excludePattern, []);
				assert.deepStrictEqual({ ...query.excludePattern }, { 'exclude/**': true });

				return Promise.resolve({ results: [], messages: [] });
			}
		});

		const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({ $initializeWorkspace: () => { } })));
		return mtw.$startFileSearch(null, { maxResults: 10, includePattern: '', excludePattern: [{ pattern: 'exclude/**' }], disregardSearchExcludeSettings: true }, CancellationToken.None);
	});
	test('Valid revived URI after moving to EH', () => {
		const uriComponents: UriComponents = {
			scheme: 'test',
			path: '/Users/username/Downloads',
		};
		instantiationService.stub(ISearchService, {
			fileSearch(query: IFileQuery) {
				assert.strictEqual(query.folderQueries?.length, 1);
				assert.ok(URI.isUri(query.folderQueries[0].folder));
				assert.strictEqual(query.folderQueries[0].folder.path, '/Users/username/Downloads');
				assert.strictEqual(query.folderQueries[0].folder.scheme, 'test');

				return Promise.resolve({ results: [], messages: [] });
			}
		});

		const mtw = disposables.add(instantiationService.createInstance(MainThreadWorkspace, SingleProxyRPCProtocol({ $initializeWorkspace: () => { } })));
		return mtw.$startFileSearch(uriComponents, { filePattern: '*.md' }, CancellationToken.None);
	});
});
