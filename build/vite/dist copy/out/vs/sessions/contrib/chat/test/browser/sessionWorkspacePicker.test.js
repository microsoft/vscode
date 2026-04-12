/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';
import { IOutputService } from '../../../../../workbench/services/output/common/output.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { extUri } from '../../../../../base/common/resources.js';
import { ISessionsProvidersService } from '../../../sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../sessions/browser/sessionsManagementService.js';
import { WorkspacePicker } from '../../browser/sessionWorkspacePicker.js';
// ---- Storage key (must match the one in sessionWorkspacePicker.ts) ----------
const STORAGE_KEY_RECENT_WORKSPACES = 'sessions.recentlyPickedWorkspaces';
// ---- Mock providers ---------------------------------------------------------
function createMockProvider(id, opts) {
    return {
        id,
        label: `Provider ${id}`,
        icon: Codicon.remote,
        sessionTypes: [],
        connectionStatus: opts?.connectionStatus,
        browseActions: [],
        resolveWorkspace: (uri) => ({
            label: uri.path.substring(1) || uri.path,
            icon: Codicon.folder,
            repositories: [{ uri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
            requiresWorkspaceTrust: false,
        }),
        onDidChangeSessions: Event.None,
        getSessions: () => [],
        createNewSession: () => { throw new Error('Not implemented'); },
        setSessionType: () => { throw new Error('Not implemented'); },
        getSessionTypes: () => [],
        renameChat: async () => { },
        setModel: () => { },
        archiveSession: async () => { },
        unarchiveSession: async () => { },
        deleteSession: async () => { },
        deleteChat: async () => { },
        setRead: () => { },
        sendAndCreateChat: async () => { throw new Error('Not implemented'); },
        capabilities: { multipleChatsPerSession: false },
    };
}
class MockSessionsProvidersService extends Disposable {
    constructor() {
        super(...arguments);
        this._onDidChangeProviders = this._register(new Emitter());
        this.onDidChangeProviders = this._onDidChangeProviders.event;
        this.onDidChangeSessions = Event.None;
        this.onDidReplaceSession = Event.None;
        this._providers = [];
    }
    setProviders(providers) {
        this._providers = providers;
        this._onDidChangeProviders.fire();
    }
    getProviders() {
        return this._providers;
    }
    resolveWorkspace(providerId, repositoryUri) {
        const provider = this._providers.find(p => p.id === providerId);
        return provider?.resolveWorkspace(repositoryUri);
    }
}
// ---- Test helpers -----------------------------------------------------------
function seedStorage(storageService, entries) {
    const stored = entries.map(e => ({
        uri: e.uri.toJSON(),
        providerId: e.providerId,
        checked: e.checked,
    }));
    storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(stored), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
}
function createTestPicker(disposables, providersService, storageService) {
    const instantiationService = disposables.add(new TestInstantiationService());
    const storage = storageService ?? disposables.add(new TestStorageService());
    instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => { }, show: () => { } });
    instantiationService.stub(IStorageService, storage);
    instantiationService.stub(IUriIdentityService, { extUri });
    instantiationService.stub(ISessionsProvidersService, providersService);
    instantiationService.stub(ISessionsManagementService, {
        activeProviderId: observableValue('activeProviderId', undefined),
    });
    instantiationService.stub(IRemoteAgentHostService, {});
    instantiationService.stub(IQuickInputService, {});
    instantiationService.stub(IClipboardService, {});
    instantiationService.stub(IPreferencesService, {});
    instantiationService.stub(IOutputService, {});
    return disposables.add(instantiationService.createInstance(WorkspacePicker));
}
// ---- Assertion helpers ------------------------------------------------------
function assertSelectedProvider(picker, expectedProviderId, message) {
    assert.strictEqual(picker.selectedProject?.providerId, expectedProviderId, message);
}
// ---- Tests ------------------------------------------------------------------
suite('WorkspacePicker - Connection Status', () => {
    const disposables = new DisposableStore();
    let providersService;
    setup(() => {
        providersService = new MockSessionsProvidersService();
        disposables.add(providersService);
    });
    teardown(() => {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('restore skips unavailable (disconnected) provider', () => {
        const remoteStatus = observableValue('status', "disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */);
        const remoteProvider = createMockProvider('remote-1', { connectionStatus: remoteStatus });
        const localProvider = createMockProvider('local-1');
        const storage = disposables.add(new TestStorageService());
        seedStorage(storage, [
            { uri: URI.file('/remote/project'), providerId: 'remote-1', checked: true },
            { uri: URI.file('/local/project'), providerId: 'local-1', checked: false },
        ]);
        providersService.setProviders([remoteProvider, localProvider]);
        const picker = createTestPicker(disposables, providersService, storage);
        // The checked entry is from a disconnected provider — should fall back to local
        assertSelectedProvider(picker, 'local-1');
    });
    test('restore skips connecting provider', () => {
        const remoteStatus = observableValue('status', "connecting" /* RemoteAgentHostConnectionStatus.Connecting */);
        const remoteProvider = createMockProvider('remote-1', { connectionStatus: remoteStatus });
        const localProvider = createMockProvider('local-1');
        const storage = disposables.add(new TestStorageService());
        seedStorage(storage, [
            { uri: URI.file('/remote/project'), providerId: 'remote-1', checked: true },
            { uri: URI.file('/local/project'), providerId: 'local-1', checked: false },
        ]);
        providersService.setProviders([remoteProvider, localProvider]);
        const picker = createTestPicker(disposables, providersService, storage);
        assertSelectedProvider(picker, 'local-1');
    });
    test('restore picks connected remote provider', () => {
        const remoteStatus = observableValue('status', "connected" /* RemoteAgentHostConnectionStatus.Connected */);
        const remoteProvider = createMockProvider('remote-1', { connectionStatus: remoteStatus });
        const storage = disposables.add(new TestStorageService());
        seedStorage(storage, [
            { uri: URI.file('/remote/project'), providerId: 'remote-1', checked: true },
        ]);
        providersService.setProviders([remoteProvider]);
        const picker = createTestPicker(disposables, providersService, storage);
        assertSelectedProvider(picker, 'remote-1');
    });
    test('disconnect clears selection from that provider', () => {
        const remoteStatus = observableValue('status', "connected" /* RemoteAgentHostConnectionStatus.Connected */);
        const remoteProvider = createMockProvider('remote-1', { connectionStatus: remoteStatus });
        const storage = disposables.add(new TestStorageService());
        seedStorage(storage, [
            { uri: URI.file('/remote/project'), providerId: 'remote-1', checked: true },
        ]);
        providersService.setProviders([remoteProvider]);
        const picker = createTestPicker(disposables, providersService, storage);
        assertSelectedProvider(picker, 'remote-1');
        // Disconnect
        remoteStatus.set("disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */, undefined);
        assertSelectedProvider(picker, undefined, 'Selection should be cleared after disconnect');
    });
    test('reconnect restores the same workspace', () => {
        const remoteStatus = observableValue('status', "connected" /* RemoteAgentHostConnectionStatus.Connected */);
        const remoteProvider = createMockProvider('remote-1', { connectionStatus: remoteStatus });
        const storage = disposables.add(new TestStorageService());
        seedStorage(storage, [
            { uri: URI.file('/remote/project'), providerId: 'remote-1', checked: true },
        ]);
        providersService.setProviders([remoteProvider]);
        const picker = createTestPicker(disposables, providersService, storage);
        assertSelectedProvider(picker, 'remote-1');
        // Disconnect — clears selection
        remoteStatus.set("disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */, undefined);
        assertSelectedProvider(picker, undefined, 'Should clear on disconnect');
        // Reconnect — should restore
        remoteStatus.set("connected" /* RemoteAgentHostConnectionStatus.Connected */, undefined);
        assertSelectedProvider(picker, 'remote-1', 'Should restore after reconnect');
        assert.strictEqual(picker.selectedProject?.workspace.repositories[0]?.uri.path, '/remote/project', 'Should restore the same workspace URI');
    });
    test('disconnect does not auto-select another provider workspace', () => {
        const remoteStatus = observableValue('status', "connected" /* RemoteAgentHostConnectionStatus.Connected */);
        const remoteProvider = createMockProvider('remote-1', { connectionStatus: remoteStatus });
        const localProvider = createMockProvider('local-1');
        const storage = disposables.add(new TestStorageService());
        seedStorage(storage, [
            { uri: URI.file('/remote/project'), providerId: 'remote-1', checked: true },
            { uri: URI.file('/local/project'), providerId: 'local-1', checked: false },
        ]);
        providersService.setProviders([remoteProvider, localProvider]);
        const picker = createTestPicker(disposables, providersService, storage);
        assertSelectedProvider(picker, 'remote-1');
        // Disconnect remote
        remoteStatus.set("disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */, undefined);
        // Should NOT auto-select local workspace — should remain empty
        assertSelectedProvider(picker, undefined, 'Should not auto-select another provider on disconnect');
    });
    test('checked is globally unique after persist', () => {
        const localProvider = createMockProvider('local-1');
        const remoteStatus = observableValue('status', "connected" /* RemoteAgentHostConnectionStatus.Connected */);
        const remoteProvider = createMockProvider('remote-1', { connectionStatus: remoteStatus });
        const storage = disposables.add(new TestStorageService());
        seedStorage(storage, [
            { uri: URI.file('/remote/project'), providerId: 'remote-1', checked: true },
            { uri: URI.file('/local/project'), providerId: 'local-1', checked: false },
        ]);
        providersService.setProviders([remoteProvider, localProvider]);
        const picker = createTestPicker(disposables, providersService, storage);
        // Select the local workspace
        const localWorkspace = {
            providerId: 'local-1',
            workspace: localProvider.resolveWorkspace(URI.file('/local/project')),
        };
        picker.setSelectedWorkspace(localWorkspace, false);
        // Verify storage: only the local entry should be checked
        const raw = storage.get(STORAGE_KEY_RECENT_WORKSPACES, 0 /* StorageScope.PROFILE */);
        assert.ok(raw, 'Storage should have recent workspaces');
        const stored = JSON.parse(raw);
        const checkedEntries = stored.filter(e => e.checked);
        assert.strictEqual(checkedEntries.length, 1, 'Only one entry should be checked');
        assert.strictEqual(checkedEntries[0].providerId, 'local-1', 'The local entry should be checked');
    });
    test('onDidSelectWorkspace fires on reconnect restore', () => {
        const remoteStatus = observableValue('status', "connected" /* RemoteAgentHostConnectionStatus.Connected */);
        const remoteProvider = createMockProvider('remote-1', { connectionStatus: remoteStatus });
        const storage = disposables.add(new TestStorageService());
        seedStorage(storage, [
            { uri: URI.file('/remote/project'), providerId: 'remote-1', checked: true },
        ]);
        providersService.setProviders([remoteProvider]);
        const picker = createTestPicker(disposables, providersService, storage);
        const selected = [];
        disposables.add(picker.onDidSelectWorkspace(w => selected.push(w)));
        // Disconnect then reconnect
        remoteStatus.set("disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */, undefined);
        remoteStatus.set("connected" /* RemoteAgentHostConnectionStatus.Connected */, undefined);
        assert.strictEqual(selected.length, 1, 'onDidSelectWorkspace should fire once on reconnect');
        assert.strictEqual(selected[0].providerId, 'remote-1');
        assert.strictEqual(selected[0].workspace.repositories[0]?.uri.path, '/remote/project', 'Event should carry the correct workspace URI');
    });
    test('local provider is never treated as unavailable', () => {
        const localProvider = createMockProvider('local-1');
        const storage = disposables.add(new TestStorageService());
        seedStorage(storage, [
            { uri: URI.file('/local/project'), providerId: 'local-1', checked: true },
        ]);
        providersService.setProviders([localProvider]);
        const picker = createTestPicker(disposables, providersService, storage);
        assertSelectedProvider(picker, 'local-1', 'Local provider workspace should always be selectable');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbldvcmtzcGFjZVBpY2tlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9zZXNzaW9uV29ya3NwYWNlUGlja2VyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUF1QixlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDcEcsT0FBTyxFQUFtQyx1QkFBdUIsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQzlJLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sbURBQW1ELENBQUM7QUFDakgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDbkcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scUVBQXFFLENBQUM7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