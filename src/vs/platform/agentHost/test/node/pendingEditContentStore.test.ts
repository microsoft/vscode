/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import { PendingEditContentStore, registerPendingEditContentProvider } from '../../node/copilot/pendingEditContentStore.js';

suite('PendingEditContentStore', () => {
	const disposables = new DisposableStore();
	let fileService: FileService;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(registerPendingEditContentProvider(fileService));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('writes, deletes, and disposes pending edit content', async () => {
		const store = disposables.add(new PendingEditContentStore('copilot:/test-session', 'test-session', fileService, new NullLogService()));
		const first = await store.write('tool-call-1', '/workspace/first.txt', 'first content');
		const second = await store.write('tool-call-2', '/workspace/second.txt', 'second content');
		const contents = await Promise.all([first, second].map(uri => uri ? fileService.readFile(uri).then(file => file.value.toString()) : undefined));

		store.delete('tool-call-1');
		await timeout(0);
		store.dispose();
		await timeout(0);

		assert.deepStrictEqual({
			contents,
			exists: [
				first ? await fileService.exists(first) : undefined,
				second ? await fileService.exists(second) : undefined,
			],
		}, {
			contents: ['first content', 'second content'],
			exists: [false, false],
		});
	});
});
