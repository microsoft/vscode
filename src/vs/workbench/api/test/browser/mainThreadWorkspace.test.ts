/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { MainThreadWorkspace } from 'vs/workbench/api/browser/mainThreadWorkspace';
import { SingleProxyRPCProtocol } from 'vs/workbench/api/test/common/testRPCProtocol';
import { IFileQuery, ISearchService } from 'vs/workbench/services/search/common/search';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

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
});
