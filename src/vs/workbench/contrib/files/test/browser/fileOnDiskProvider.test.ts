/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { workbenchInstantiationService, TestServiceAccessor } from '../../../../test/browser/workbenchTestServices.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TextFileContentProvider } from '../../common/files.js';
import { snapshotToString } from '../../../../services/textfile/common/textfiles.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Files - FileOnDiskContentProvider', () => {

	const disposables = new DisposableStore();
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
	});

	teardown(() => {
		disposables.clear();
	});

	test('provideTextContent', async () => {
		const provider = disposables.add(instantiationService.createInstance(TextFileContentProvider));
		const uri = URI.parse('testFileOnDiskContentProvider://foo');

		const content = await provider.provideTextContent(uri.with({ scheme: 'conflictResolution', query: JSON.stringify({ scheme: uri.scheme }) }));

		assert.ok(content);
		assert.strictEqual(snapshotToString(content.createSnapshot()), 'Hello Html');
		assert.strictEqual(accessor.fileService.getLastReadFileUri().scheme, uri.scheme);
		assert.strictEqual(accessor.fileService.getLastReadFileUri().path, uri.path);

		content.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
