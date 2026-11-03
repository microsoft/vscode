/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IndexedDB } from '../../../../base/browser/indexedDB.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IndexedDBFileSystemProvider } from '../../browser/indexedDBFileSystemProvider.js';

suite('IndexedDB file synchronization', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('refreshes cached presence and absence from another provider connection', async () => {
		const name = `chat-storage-test-${generateUuid()}`;
		const database = await IndexedDB.create(name, 1, ['files']);
		const otherDatabase = await IndexedDB.create(name, 1, ['files']);
		disposables.add(toDisposable(() => database.close()));
		disposables.add(toDisposable(() => otherDatabase.close()));
		const first = disposables.add(new IndexedDBFileSystemProvider(Schemas.vscodeUserData, database, 'files', false));
		const second = disposables.add(new IndexedDBFileSystemProvider(Schemas.vscodeUserData, otherDatabase, 'files', false));
		const root = URI.from({ scheme: Schemas.vscodeUserData, path: '/' });
		const resource = root.with({ path: '/session.json' });
		try {
			await first.readdir(root);
			await second.writeFile(resource, VSBuffer.fromString('committed').buffer, { create: true, overwrite: true, atomic: false, unlock: false });
			await first.synchronize(root);
			const visible = await first.readdir(root);
			const size = (await first.stat(resource)).size;
			await second.delete(resource, { recursive: false, useTrash: false, atomic: false });
			await first.synchronize(root);
			assert.deepStrictEqual({ visible: visible.map(([name]) => name), size, remaining: await first.readdir(root) }, { visible: ['session.json'], size: 9, remaining: [] });
			await assert.rejects(first.stat(resource));
		} finally {
			database.close();
			otherDatabase.close();
			await new Promise<void>((resolve, reject) => {
				const request = indexedDB.deleteDatabase(name);
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});
		}
	});
});
