/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { RemoteAgentHostConnectionStatus, IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';
import { IOutputService } from '../../../../../workbench/services/output/common/output.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { extUri } from '../../../../../base/common/resources.js';
import { ISessionsProvidersService } from '../../../sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../sessions/browser/sessionsManagementService.js';
import { ISessionChangeEvent, ISessionsProvider } from '../../../sessions/browser/sessionsProvider.js';
import { ISessionWorkspace } from '../../../sessions/common/sessionData.js';
import { WorkspacePicker, IWorkspaceSelection } from '../../browser/sessionWorkspacePicker.js';

// ---- Storage key (must match the one in sessionWorkspacePicker.ts) ----------
const STORAGE_KEY_RECENT_WORKSPACES = 'sessions.recentlyPickedWorkspaces';

// ---- Mock providers ---------------------------------------------------------

function createMockProvider(id: string, opts?: {
	connectionStatus?: ISettableObservable<RemoteAgentHostConnectionStatus>;
}): ISessionsProvider {
	return {
		id,
		label: `Provider ${id}`,
		icon: Codicon.remote,
		sessionTypes: [],
		connectionStatus: opts?.connectionStatus,
		browseActions: [],
		resolveWorkspace: (uri: URI): ISessionWorkspace => ({
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
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeProviders = this._register(new Emitter<void>());
	readonly onDidChangeProviders: Event<void> = this._onDidChangeProviders.event;
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = Event.None;
	readonly onDidReplaceSession = Event.None;

	private _providers: ISessionsProvider[] = [];

	setProviders(providers: ISessionsProvider[]): void {
		this._providers = providers;
		this._onDidChangeProviders.fire();
	}

	getProviders(): ISessionsProvider[] {
		return this._providers;
	}

	resolveWorkspace(providerId: string, repositoryUri: URI): ISessionWorkspace | undefined {
		const provider = this._providers.find(p => p.id === providerId);
		return provider?.resolveWorkspace(repositoryUri);
	}
}

// ---- Test helpers -----------------------------------------------------------

function seedStorage(storageService: IStorageService, entries: { uri: URI; providerId: string; checked: boolean }[]): void {
	const stored = entries.map(e => ({
		uri: e.uri.toJSON(),
		providerId: e.providerId,
		checked: e.checked,
	}));
	storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
}

function createTestPicker(
	disposables: DisposableStore,
	providersService: MockSessionsProvidersService,
	storageService?: IStorageService,
): WorkspacePicker {
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

function assertSelectedProvider(picker: WorkspacePicker, expectedProviderId: string | undefined, message?: string): void {
	assert.strictEqual(picker.selectedProject?.providerId, expectedProviderId, message);
}

// ---- Tests ------------------------------------------------------------------

suite('WorkspacePicker - Connection Status', () => {

	const disposables = new DisposableStore();
	let providersService: MockSessionsProvidersService;

	setup(() => {
		providersService = new MockSessionsProvidersService();
		disposables.add(providersService);
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('restore skips unavailable (disconnected) provider', () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Disconnected);
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
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Connecting);
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
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Connected);
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
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Connected);
		const remoteProvider = createMockProvider('remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, storage);
		assertSelectedProvider(picker, 'remote-1');

		// Disconnect
		remoteStatus.set(RemoteAgentHostConnectionStatus.Disconnected, undefined);
		assertSelectedProvider(picker, undefined, 'Selection should be cleared after disconnect');
	});

	test('reconnect restores the same workspace', () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Connected);
		const remoteProvider = createMockProvider('remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, storage);
		assertSelectedProvider(picker, 'remote-1');

		// Disconnect — clears selection
		remoteStatus.set(RemoteAgentHostConnectionStatus.Disconnected, undefined);
		assertSelectedProvider(picker, undefined, 'Should clear on disconnect');

		// Reconnect — should restore
		remoteStatus.set(RemoteAgentHostConnectionStatus.Connected, undefined);
		assertSelectedProvider(picker, 'remote-1', 'Should restore after reconnect');
		assert.strictEqual(
			picker.selectedProject?.workspace.repositories[0]?.uri.path,
			'/remote/project',
			'Should restore the same workspace URI',
		);
	});

	test('disconnect does not auto-select another provider workspace', () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Connected);
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
		remoteStatus.set(RemoteAgentHostConnectionStatus.Disconnected, undefined);

		// Should NOT auto-select local workspace — should remain empty
		assertSelectedProvider(picker, undefined, 'Should not auto-select another provider on disconnect');
	});

	test('checked is globally unique after persist', () => {
		const localProvider = createMockProvider('local-1');
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Connected);
		const remoteProvider = createMockProvider('remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'remote-1', checked: true },
			{ uri: URI.file('/local/project'), providerId: 'local-1', checked: false },
		]);

		providersService.setProviders([remoteProvider, localProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		// Select the local workspace
		const localWorkspace: IWorkspaceSelection = {
			providerId: 'local-1',
			workspace: localProvider.resolveWorkspace(URI.file('/local/project')),
		};
		picker.setSelectedWorkspace(localWorkspace, false);

		// Verify storage: only the local entry should be checked
		const raw = storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE);
		assert.ok(raw, 'Storage should have recent workspaces');
		const stored = JSON.parse(raw!) as { providerId: string; checked: boolean }[];
		const checkedEntries = stored.filter(e => e.checked);
		assert.strictEqual(checkedEntries.length, 1, 'Only one entry should be checked');
		assert.strictEqual(checkedEntries[0].providerId, 'local-1', 'The local entry should be checked');
	});

	test('onDidSelectWorkspace fires on reconnect restore', () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Connected);
		const remoteProvider = createMockProvider('remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		const selected: IWorkspaceSelection[] = [];
		disposables.add(picker.onDidSelectWorkspace(w => selected.push(w)));

		// Disconnect then reconnect
		remoteStatus.set(RemoteAgentHostConnectionStatus.Disconnected, undefined);
		remoteStatus.set(RemoteAgentHostConnectionStatus.Connected, undefined);

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
