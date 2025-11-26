/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceMap } from '../../../../../base/common/map.js';
import { cloneAndChange } from '../../../../../base/common/objects.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestEnvironmentService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatEditingSessionStorage, StoredSessionState } from '../../browser/chatEditing/chatEditingSessionStorage.js';

suite('ChatEditingSessionStorage', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse('chat://test-session');
	let fs: FileService;
	let storage: TestChatEditingSessionStorage;

	class TestChatEditingSessionStorage extends ChatEditingSessionStorage {
		public get storageLocation() {
			return super._getStorageLocation();
		}
	}

	setup(() => {
		fs = ds.add(new FileService(new NullLogService()));
		ds.add(fs.registerProvider(TestEnvironmentService.workspaceStorageHome.scheme, ds.add(new InMemoryFileSystemProvider())));

		storage = new TestChatEditingSessionStorage(
			sessionResource,
			fs,
			TestEnvironmentService,
			new NullLogService(),
			// eslint-disable-next-line local/code-no-any-casts
			{ getWorkspace: () => ({ id: 'workspaceId' }) } as any,
		);
	});

	function generateState(): StoredSessionState {
		const initialFileContents = new ResourceMap<string>();
		for (let i = 0; i < 10; i++) { initialFileContents.set(URI.file(`/foo${i}.js`), `fileContents${Math.floor(i / 2)}`); }

		return {
			initialFileContents,
			timeline: undefined,
		};
	}

	test('state is empty initially', async () => {
		const s = await storage.restoreState();
		assert.strictEqual(s, undefined);
	});

	test('round trips state', async () => {
		const original = generateState();
		await storage.storeState(original);

		const changer = (x: any) => {
			return URI.isUri(x) ? x.toString() : x instanceof Map ? cloneAndChange([...x.values()], changer) : undefined;
		};

		const restored = await storage.restoreState();
		assert.deepStrictEqual(cloneAndChange(restored, changer), cloneAndChange(original, changer));
	});

	test('clears state', async () => {
		await storage.storeState(generateState());
		await storage.clearState();
		const s = await storage.restoreState();
		assert.strictEqual(s, undefined);
	});
});
