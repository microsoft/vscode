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
import { IWorkspaceContextService, WorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { TestWorkspace, Workspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IWorkspaceEditingService } from '../../../../../services/workspaces/common/workspaceEditing.js';
import { InMemoryTestFileService, TestContextService, TestLifecycleService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatSessionStore } from '../../../common/model/chatSessionStore.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { MockChatModel } from './mockChatModel.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
function createMockChatModel(sessionResource, options) {
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
    return model;
}
class MockWorkspaceEditingService extends Disposable {
    constructor() {
        super(...arguments);
        this._onDidEnterWorkspace = this._register(new Emitter());
        this.onDidEnterWorkspace = this._onDidEnterWorkspace.event;
    }
    fireWorkspaceTransition(oldWorkspace, newWorkspace) {
        const promises = [];
        const event = {
            oldWorkspace,
            newWorkspace,
            join: (promise) => promises.push(promise)
        };
        this._onDidEnterWorkspace.fire(event);
        return Promise.all(promises).then(() => { });
    }
}
suite('ChatSessionStore', () => {
    const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let mockWorkspaceEditingService;
    function createChatSessionStore(isEmptyWindow = false) {
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
        instantiationService.stub(IWorkspaceEditingService, mockWorkspaceEditingService);
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
        assert.strictEqual(session.value.sessionId, 'session-1');
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
        function createSingleFolderWorkspace(folderUri) {
            const folder = new WorkspaceFolder({ uri: folderUri, index: 0, name: 'test' });
            return new Workspace('single-folder-id', [folder]);
        }
        function createChatSessionStoreWithSingleFolder(folderUri) {
            instantiationService.stub(IWorkspaceContextService, new TestContextService(createSingleFolderWorkspace(folderUri)));
            return testDisposables.add(instantiationService.createInstance(ChatSessionStore));
        }
        function createTransferData(toWorkspace, sessionResource, timestampInMilliseconds) {
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
            assert.strictEqual(sessionData.value.sessionId, 'transfer-session');
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
            const storageLocation1 = URI.joinPath(userDataProfile.globalStorageHome, 'transferredChatSessions', 'transfer-session-1.json');
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
            const storageLocation2 = URI.joinPath(userDataProfile.globalStorageHome, 'transferredChatSessions', 'transfer-session-2.json');
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
            const fileService = instantiationService.get(IFileService);
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
            const oldWorkspace = { id: 'empty-window-id' };
            const newWorkspace = { id: TestWorkspace.id, uri: URI.file('/test/folder') };
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
            const oldWorkspace = { id: 'non-existent-workspace-id' };
            const newWorkspace = { id: 'new-workspace-id' };
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
            const oldWorkspace = { id: 'empty-window-id' };
            const newWorkspace = { id: 'new-workspace-id', uri: URI.file('/test/folder') };
            await mockWorkspaceEditingService.fireWorkspaceTransition(oldWorkspace, newWorkspace);
            const newStorageRoot = store.getChatStorageFolder();
            assert.ok(newStorageRoot.path.includes('new-workspace-id'), 'Storage root should be updated to new workspace location');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlc3Npb25TdG9yZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9tb2RlbC9jaGF0U2Vzc2lvblN0b3JlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzNGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUNuSSxPQUFPLEVBQTJCLHdCQUF3QixFQUFFLGVBQWUsRUFBRSxNQUFNLDBEQUEwRCxD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