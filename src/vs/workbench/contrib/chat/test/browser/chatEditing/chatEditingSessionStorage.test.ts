/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { cloneAndChange } from '../../../../../../base/common/objects.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestEnvironmentService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatEditingSessionStorage, IChatEditingSessionStop, StoredSessionState } from '../../../browser/chatEditing/chatEditingSessionStorage.js';
import { ChatEditingSnapshotTextModelContentProvider } from '../../../browser/chatEditing/chatEditingTextModelContentProviders.js';
import { ISnapshotEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';

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

	function makeStop(requestId: string | undefined, before: string, after: string): IChatEditingSessionStop {
		const stopId = generateUuid();
		const resource = URI.file('/foo.js');
		return {
			stopId,
			entries: new ResourceMap([
				[resource, { resource, languageId: 'javascript', snapshotUri: ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(sessionResource, requestId, stopId, resource.path), original: `contents${before}}`, current: `contents${after}`, state: ModifiedFileEntryState.Modified, telemetryInfo: { agentId: 'agentId', command: 'cmd', requestId: generateUuid(), result: undefined, sessionResource: sessionResource, modelId: undefined, modeId: undefined, applyCodeBlockSuggestionId: undefined, feature: undefined } } satisfies ISnapshotEntry],
			]),
		};
	}

	function generateState(): StoredSessionState {
		const initialFileContents = new ResourceMap<string>();
		for (let i = 0; i < 10; i++) { initialFileContents.set(URI.file(`/foo${i}.js`), `fileContents${Math.floor(i / 2)}`); }

		return {
			initialFileContents,
			recentSnapshot: makeStop(undefined, 'd', 'e'),
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
