/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IEditorService } from '../../../editor/common/editorService.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { TestExtensionService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { ITextQuery, QueryType } from '../../common/search.js';
import { SearchService } from '../../common/searchService.js';

suite('SearchService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSearchService(disposables: DisposableStore, fileService: IFileService): SearchService {
		// Minimal stubs for services that are only consulted by the open-editor
		// pre-pass (which has nothing to do with the provider-resolution path
		// exercised here).
		// eslint-disable-next-line local/code-no-any-casts
		const modelService = { getModels: () => [] } as any as IModelService;
		// eslint-disable-next-line local/code-no-any-casts
		const editorService = { editors: [] } as any as IEditorService;
		const extensionService: IExtensionService = new TestExtensionService();
		const logService = new NullLogService();
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		return disposables.add(new SearchService(
			modelService,
			editorService,
			NullTelemetryService,
			logService,
			extensionService,
			fileService,
			uriIdentityService
		));
	}

	test('textSearch does not hang when only a file system provider (no search provider) is registered for the scheme (#260035)', async () => {
		const disposables = store.add(new DisposableStore());
		const fileService = new TestFileService();

		const memfsScheme = 'memfs';
		// Simulate a custom FS provider being registered (like `memfs:/` in the
		// `fsprovider-sample` extension) while NO search provider is registered
		// for the scheme.
		// eslint-disable-next-line local/code-no-any-casts
		(fileService as any).hasProvider = (resource: URI) => resource.scheme === memfsScheme;
		// eslint-disable-next-line local/code-no-any-casts
		(fileService as any).exists = async (_resource: URI) => true;

		const service = createSearchService(disposables, fileService);

		const query: ITextQuery = {
			type: QueryType.Text,
			contentPattern: { pattern: 'console.log' },
			folderQueries: [{ folder: URI.from({ scheme: memfsScheme, path: '/' }) }]
		};

		const tokenSource = disposables.add(new CancellationTokenSource());
		// Before the fix this call would hang forever because SearchService would
		// `await this.waitForProvider(...)` on a deferred promise that is never
		// resolved. With the fix it returns an empty result quickly.
		const result = await Promise.race([
			service.textSearch(query, tokenSource.token),
			new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 2000))
		]);

		assert.notStrictEqual(result, 'timeout', 'textSearch hung waiting for a non-existent provider');
		assert.ok(typeof result !== 'string');
		assert.strictEqual((result as { results: unknown[] }).results.length, 0);
	});
});
