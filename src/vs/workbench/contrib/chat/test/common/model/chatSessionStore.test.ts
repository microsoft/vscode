/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUserDataProfilesService, toUserDataProfile } from '../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IAnyWorkspaceIdentifier, IWorkspaceContextService, WorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { TestWorkspace, Workspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IDidEnterWorkspaceEvent, IWorkspaceEditingService } from '../../../../../services/workspaces/common/workspaceEditing.js';
import { InMemoryTestFileService, TestContextService, TestLifecycleService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatModel, ISerializableChatData3 } from '../../../common/model/chatModel.js';
import { ChatSessionStore, IChatTransfer } from '../../../common/model/chatSessionStore.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { MockChatModel } from './mockChatModel.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';

function createMockChatModel(sessionResource: URI, options?: { customTitle?: string }): ChatModel {
	const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
	if (!sessionId) {
		throw new Error('createMockChatModel requires a local session URI');
	}
	const model = new MockChatModel(sessionResource);
	model.sessionId = sessionId;
	if (options?.customTitle) {
		model.customTitle = options.customTitle;
	}
	// Cast to ChatModel - the mock implements enough of the interface for testing
	return model as unknown as ChatModel;
}

class MockWorkspaceEditingService extends Disposable implements Partial<IWorkspaceEditingService> {
	private readonly _onDidEnterWorkspace = this._register(new Emitter<IDidEnterWorkspaceEvent>());
	readonly onDidEnterWorkspace = this._onDidEnterWorkspace.event;

	fireWorkspaceTransition(oldWorkspace: IAnyWorkspaceIdentifier, newWorkspace: IAnyWorkspaceIdentifier): Promise<void> {
		const promises: Promise<void>[] = [];
		const event: IDidEnterWorkspaceEvent = {
			oldWorkspace,
			newWorkspace,
			join: (promise: Promise<void>) => promises.push(promise)
		};
		this._onDidEnterWorkspace.fire(event);
		return Promise.all(promises).then(() => { });
	}
}

suite('ChatSessionStore', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let mockWorkspaceEditingService: MockWorkspaceEditingService;

	function createChatSessionStore(isEmptyWindow: boolean = false): ChatSessionStore {
		const workspace = isEmptyWindow ? new Workspace('empty-window-id', []) : TestWorkspace;
		instantiationService.stub(IWorkspaceContextService, new TestContextService(workspace));
		return testDisposables.add(instantiationService.createInstance(ChatSessionStore));
	}

	setup(() => {
		instantiationService = testDisposables.add(new TestInstantiationService(new ServiceCollection()));
		instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, NullLogService);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IFileService, testDisposables.add(new InMemoryTestFileService()));
		instantiationService.stub(IEnvironmentService, { workspaceStorageHome: URI.file('/test/workspaceStorage') });
		instantiationService.stub(ILifecycleService, testDisposables.add(new TestLifecycleService()));
		instantiationService.stub(IUserDataProfilesService, { defaultProfile: toUserDataProfile('default', 'Default', URI.file('/test/userdata'), URI.file('/test/cache')) });
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		mockWorkspaceEditingService = testDisposables.add(new MockWorkspaceEditingService());
		instantiationService.stub(IWorkspaceEditingService, mockWorkspaceEditingService as unknown as IWorkspaceEditingService);
	});

	test('hasSessions returns false when no sessions exist', () => {
		const store = createChatSessionStore();

		assert.strictEqual(store.hasSessions(), false);
	});

	test('getIndex returns empty index initially', async () => {
		const store = createChatSessionStore();

		const index = await store.getIndex();
		assert.deepStrictEqual(index, {});
	});

	test('getChatStorageFolder returns correct path for workspace', () => {
		const store = createChatSessionStore(false);

		const storageFolder = store.getChatStorageFolder();
		assert.ok(storageFolder.path.includes('workspaceStorage'));
		assert.ok(storageFolder.path.includes('chatSessions'));
	});

	test('getChatStorageFolder returns correct path for empty window', () => {
		const store = createChatSessionStore(true);

		const storageFolder = store.getChatStorageFolder();
		assert.ok(storageFolder.path.includes('emptyWindowChatSessions'));
	});

	test('isSessionEmpty returns true for non-existent session', () => {
		const store = createChatSessionStore();

		assert.strictEqual(store.isSessionEmpty('non-existent-session'), true);
	});

	test('readSession returns undefined for non-existent session', async () => {
		const store = createChatSessionStore();

		const session = await store.readSession('non-existent-session');
		assert.strictEqual(session, undefined);
	});

	test('deleteSession handles non-existent session gracefully', async () => {
		const store = createChatSessionStore();

		// Should not throw
		await store.deleteSession('non-existent-session');

		assert.strictEqual(store.hasSessions(), false);
	});

	test('storeSessions persists session to index', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));

		await store.storeSessions([model]);

		assert.strictEqual(store.hasSessions(), true);
		const index = await store.getIndex();
		assert.ok(index['session-1']);
		assert.strictEqual(index['session-1'].sessionId, 'session-1');
	});

	test('storeSessions persists custom title', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1'), { customTitle: 'My Custom Title' }));

		await store.storeSessions([model]);

		const index = await store.getIndex();
		assert.strictEqual(index['session-1'].title, 'My Custom Title');
	});

	test('readSession returns stored session data', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));

		await store.storeSessions([model]);
		const session = await store.readSession('session-1');

		assert.ok(session);
		assert.strictEqual((session.value as ISerializableChatData3).sessionId, 'session-1');
	});

	test('deleteSession removes session from index', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));

		await store.storeSessions([model]);
		assert.strictEqual(store.hasSessions(), true);

		await store.deleteSession('session-1');

		assert.strictEqual(store.hasSessions(), false);
		const index = await store.getIndex();
		assert.strictEqual(index['session-1'], undefined);
	});

	test('clearAllSessions removes all sessions', async () => {
		const store = createChatSessionStore();
		const model1 = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));
		const model2 = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-2')));

		await store.storeSessions([model1, model2]);
		assert.strictEqual(Object.keys(await store.getIndex()).length, 2);

		await store.clearAllSessions();

		const index = await store.getIndex();
		assert.deepStrictEqual(index, {});
	});

	test('setSessionTitle updates existing session title', async () => {
		const store = createChatSessionStore();
		const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1'), { customTitle: 'Original Title' }));

		await store.storeSessions([model]);
		await store.setSessionTitle('session-1', 'New Title');

		const index = await store.getIndex();
		assert.strictEqual(index['session-1'].title, 'New Title');
	});

	test('setSessionTitle does nothing for non-existent session', async () => {
		const store = createChatSessionStore();

		// Should not throw
		await store.setSessionTitle('non-existent', 'Title');

		const index = await store.getIndex();
		assert.strictEqual(index['non-existent'], undefined);
	});

	test('multiple stores can be created with different workspaces', async () => {
		const store1 = createChatSessionStore(false);
		const store2 = createChatSessionStore(true);

		const folder1 = store1.getChatStorageFolder();
		const folder2 = store2.getChatStorageFolder();

		assert.notStrictEqual(folder1.toString(), folder2.toString());
	});

	suite('transferred sessions', () => {
		function createSingleFolderWorkspace(folderUri: URI): Workspace {
			const folder = new WorkspaceFolder({ uri: folderUri, index: 0, name: 'test' });
			return new Workspace('single-folder-id', [folder]);
		}

		function createChatSessionStoreWithSingleFolder(folderUri: URI): ChatSessionStore {
			instantiationService.stub(IWorkspaceContextService, new TestContextService(createSingleFolderWorkspace(folderUri)));
			return testDisposables.add(instantiationService.createInstance(ChatSessionStore));
		}

		function createTransferData(toWorkspace: URI, sessionResource: URI, timestampInMilliseconds?: number): IChatTransfer {
			return {
				toWorkspace,
				sessionResource,
				timestampInMilliseconds: timestampInMilliseconds ?? Date.now(),
			};
		}

		test('getTransferredSessionData returns undefined for empty window', () => {
			const store = createChatSessionStore(true); // empty window

			const result = store.getTransferredSessionData();

			assert.strictEqual(result, undefined);
		});

		test('getTransferredSessionData returns undefined when no transfer exists', () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);

			const result = store.getTransferredSessionData();

			assert.strictEqual(result, undefined);
		});

		test('storeTransferSession stores and retrieves transfer data', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);
			const sessionResource = LocalChatSessionUri.forSession('transfer-session');
			const model = testDisposables.add(createMockChatModel(sessionResource));

			const transferData = createTransferData(folderUri, sessionResource);
			await store.storeTransferSession(transferData, model);

			const result = store.getTransferredSessionData();
			assert.ok(result);
			assert.strictEqual(result.toString(), sessionResource.toString());
		});

		test('readTransferredSession returns session data', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);
			const sessionResource = LocalChatSessionUri.forSession('transfer-session');
			const model = testDisposables.add(createMockChatModel(sessionResource));

			const transferData = createTransferData(folderUri, sessionResource);
			await store.storeTransferSession(transferData, model);

			const sessionData = await store.readTransferredSession(sessionResource);
			assert.ok(sessionData);
			assert.strictEqual((sessionData.value as ISerializableChatData3).sessionId, 'transfer-session');
		});

		test('readTransferredSession cleans up after reading', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);
			const sessionResource = LocalChatSessionUri.forSession('transfer-session');
			const model = testDisposables.add(createMockChatModel(sessionResource));

			const transferData = createTransferData(folderUri, sessionResource);
			await store.storeTransferSession(transferData, model);

			// Read the session
			await store.readTransferredSession(sessionResource);

			// Transfer should be cleaned up
			const result = store.getTransferredSessionData();
			assert.strictEqual(result, undefined);
		});

		test('getTransferredSessionData returns undefined for expired transfer', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);
			const sessionResource = LocalChatSessionUri.forSession('transfer-session');
			const model = testDisposables.add(createMockChatModel(sessionResource));

			// Create transfer with timestamp 10 minutes in the past (expired)
			const expiredTimestamp = Date.now() - (10 * 60 * 1000);
			const transferData = createTransferData(folderUri, sessionResource, expiredTimestamp);
			await store.storeTransferSession(transferData, model);

			const result = store.getTransferredSessionData();
			assert.strictEqual(result, undefined);
		});

		test('expired transfer cleans up index and file', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);
			const sessionResource = LocalChatSessionUri.forSession('transfer-session');
			const model = testDisposables.add(createMockChatModel(sessionResource));

			// Create transfer with timestamp 100 minutes in the past (expired)
			const expiredTimestamp = Date.now() - (100 * 60 * 1000);
			const transferData = createTransferData(folderUri, sessionResource, expiredTimestamp);
			await store.storeTransferSession(transferData, model);

			// Assert cleaned up
			const data = store.getTransferredSessionData();
			assert.strictEqual(data, undefined);
		});

		test('readTransferredSession returns undefined for invalid session resource', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);

			// Use a non-local session URI
			const invalidResource = URI.parse('file:///invalid/session');

			const result = await store.readTransferredSession(invalidResource);
			assert.strictEqual(result, undefined);
		});

		test('storeTransferSession deletes preexisting transferred session file', async () => {
			const folderUri = URI.file('/test/workspace');
			const store = createChatSessionStoreWithSingleFolder(folderUri);
			const fileService = instantiationService.get(IFileService);

			// Store first session
			const session1Resource = LocalChatSessionUri.forSession('transfer-session-1');
			const model1 = testDisposables.add(createMockChatModel(session1Resource));
			const transferData1 = createTransferData(folderUri, session1Resource);
			await store.storeTransferSession(transferData1, model1);

			// Verify first session file exists
			const userDataProfile = instantiationService.get(IUserDataProfilesService).defaultProfile;
			const storageLocation1 = URI.joinPath(
				userDataProfile.globalStorageHome,
				'transferredChatSessions',
				'transfer-session-1.json'
			);
			const exists1 = await fileService.exists(storageLocation1);
			assert.strictEqual(exists1, true, 'First session file should exist');

			// Store second session for the same workspace
			const session2Resource = LocalChatSessionUri.forSession('transfer-session-2');
			const model2 = testDisposables.add(createMockChatModel(session2Resource));
			const transferData2 = createTransferData(folderUri, session2Resource);
			await store.storeTransferSession(transferData2, model2);

			// Verify first session file is deleted
			const exists1After = await fileService.exists(storageLocation1);
			assert.strictEqual(exists1After, false, 'First session file should be deleted');

			// Verify second session file exists
			const storageLocation2 = URI.joinPath(
				userDataProfile.globalStorageHome,
				'transferredChatSessions',
				'transfer-session-2.json'
			);
			const exists2 = await fileService.exists(storageLocation2);
			assert.strictEqual(exists2, true, 'Second session file should exist');

			// Verify only the second session is retrievable
			const result = store.getTransferredSessionData();
			assert.ok(result);
			assert.strictEqual(result.toString(), session2Resource.toString());
		});
	});

	suite('workspace migration', () => {
		test('migration is triggered when onDidEnterWorkspace fires', async () => {
			const fileService = instantiationService.get(IFileService) as InMemoryTestFileService;

			// Create store with empty window
			const store = createChatSessionStore(true);
			const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession('session-1')));

			// Store a session in empty window
			await store.storeSessions([model]);
			assert.strictEqual(store.hasSessions(), true);

			// Get the file path for the session in empty window storage
			const emptyWindowStorageRoot = store.getChatStorageFolder();
			const sessionFile = URI.joinPath(emptyWindowStorageRoot, 'session-1.json');
			const fileExists = await fileService.exists(sessionFile);
			assert.strictEqual(fileExists, true, 'Session file should exist in empty window storage');

			// Simulate workspace transition via the onDidEnterWorkspace event
			const oldWorkspace: IAnyWorkspaceIdentifier = { id: 'empty-window-id' };
			const newWorkspace: IAnyWorkspaceIdentifier = { id: TestWorkspace.id, uri: URI.file('/test/folder') };

			// Fire the workspace transition event - migration happens synchronously via join()
			await mockWorkspaceEditingService.fireWorkspaceTransition(oldWorkspace, newWorkspace);

			// Verify file was copied to new location
			const newStorageRoot = store.getChatStorageFolder();
			const migratedSessionFile = URI.joinPath(newStorageRoot, 'session-1.json');
			const migratedFileExists = await fileService.exists(migratedSessionFile);
			assert.strictEqual(migratedFileExists, true, 'Session file should be migrated to workspace storage');
		});

		test('migration handles non-existent old storage location gracefully', async () => {
			// Create store with a workspace
			const store = createChatSessionStore(false);

			// Simulate workspace transition from a non-existent workspace
			const oldWorkspace: IAnyWorkspaceIdentifier = { id: 'non-existent-workspace-id' };
			const newWorkspace: IAnyWorkspaceIdentifier = { id: 'new-workspace-id' };

			// Fire the workspace transition event - should not crash
			await mockWorkspaceEditingService.fireWorkspaceTransition(oldWorkspace, newWorkspace);

			// Store should work normally
			assert.strictEqual(store.hasSessions(), false);
		});

		test('storage root is updated after workspace transition', async () => {
			// Create store with empty window
			const store = createChatSessionStore(true);

			const initialStorageRoot = store.getChatStorageFolder();
			assert.ok(initialStorageRoot.path.includes('emptyWindowChatSessions'), 'Initial storage should be empty window location');

			// Simulate workspace transition - use proper identifier types
			// Empty workspace only has 'id', single folder has 'uri' property too
			const oldWorkspace: IAnyWorkspaceIdentifier = { id: 'empty-window-id' };
			const newWorkspace: IAnyWorkspaceIdentifier = { id: 'new-workspace-id', uri: URI.file('/test/folder') };

			await mockWorkspaceEditingService.fireWorkspaceTransition(oldWorkspace, newWorkspace);

			const newStorageRoot = store.getChatStorageFolder();
			assert.ok(newStorageRoot.path.includes('new-workspace-id'), 'Storage root should be updated to new workspace location');
		});
	});
});
