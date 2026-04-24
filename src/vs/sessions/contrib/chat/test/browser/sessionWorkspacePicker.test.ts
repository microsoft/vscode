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
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { WorkspacePicker, IWorkspaceSelection } from '../../browser/sessionWorkspacePicker.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IWorkspacesService } from '../../../../../platform/workspaces/common/workspaces.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';

// ---- Storage key (must match the one in sessionWorkspacePicker.ts) ----------
const STORAGE_KEY_RECENT_WORKSPACES = 'sessions.recentlyPickedWorkspaces';

// ---- Mock providers ---------------------------------------------------------

function createMockProvider(id: string, opts?: {
	connectionStatus?: ISettableObservable<RemoteAgentHostConnectionStatus>;
}): ISessionsProvider {
	const base = {
		id,
		label: `Provider ${id}`,
		icon: Codicon.remote,
		sessionTypes: [],
		onDidChangeSessionTypes: Event.None,
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
		getSessionTypes: () => [],
		renameChat: async () => { },
		setModel: () => { },
		archiveSession: async () => { },
		unarchiveSession: async () => { },
		deleteSession: async () => { },
		deleteChat: async () => { },
		sendAndCreateChat: async () => { throw new Error('Not implemented'); },
		addChat: () => { throw new Error('Not implemented'); },
		sendRequest: async () => { throw new Error('Not implemented'); },
	};
	if (opts?.connectionStatus) {
		return {
			...base,
			connectionStatus: opts.connectionStatus,
			onDidChangeSessionConfig: Event.None,
			getSessionConfig: () => undefined,
			setSessionConfigValue: async () => { },
			replaceSessionConfig: async () => { },
			getSessionConfigCompletions: async () => [],
			getCreateSessionConfig: () => undefined,
			clearSessionConfig: () => { },
			onDidChangeRootConfig: Event.None,
			getRootConfig: () => undefined,
			setRootConfigValue: async () => { },
			replaceRootConfig: async () => { },
		} as unknown as IAgentHostSessionsProvider;
	}
	return base;
}

class MockSessionsProvidersService extends Disposable {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeProviders = this._register(new Emitter<ISessionsProvidersChangeEvent>());
	readonly onDidChangeProviders: Event<ISessionsProvidersChangeEvent> = this._onDidChangeProviders.event;

	private _providers: ISessionsProvider[] = [];

	setProviders(providers: ISessionsProvider[]): void {
		const oldProviders = this._providers;
		this._providers = providers;
		const oldIds = new Set(oldProviders.map(p => p.id));
		const newIds = new Set(providers.map(p => p.id));
		this._onDidChangeProviders.fire({
			added: providers.filter(p => !oldIds.has(p.id)),
			removed: oldProviders.filter(p => !newIds.has(p.id)),
		});
	}

	getProviders(): ISessionsProvider[] {
		return this._providers;
	}

	getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
		return this._providers.find(p => p.id === providerId) as T | undefined;
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
	instantiationService.stub(IConfigurationService, { getValue: () => undefined });
	instantiationService.stub(ICommandService, { executeCommand: async () => { } });
	instantiationService.stub(IWorkspacesService, {
		getRecentlyOpened: async () => ({ workspaces: [], files: [] }),
		onDidChangeRecentlyOpened: Event.None,
	});

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
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });
		const localProvider = createMockProvider('local-1');

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
			{ uri: URI.file('/local/project'), providerId: 'local-1', checked: false },
		]);

		providersService.setProviders([remoteProvider, localProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		// The checked entry is from a disconnected provider — should fall back to local
		assertSelectedProvider(picker, 'local-1');
	});

	test('restore skips connecting provider', () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Connecting);
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });
		const localProvider = createMockProvider('local-1');

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
			{ uri: URI.file('/local/project'), providerId: 'local-1', checked: false },
		]);

		providersService.setProviders([remoteProvider, localProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		assertSelectedProvider(picker, 'local-1');
	});

	test('restore picks connected remote provider', () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Connected);
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		assertSelectedProvider(picker, 'agenthost-remote-1');
	});

	test('disconnect clears selection from that provider', () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Connected);
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, storage);
		assertSelectedProvider(picker, 'agenthost-remote-1');

		// Disconnect
		remoteStatus.set(RemoteAgentHostConnectionStatus.Disconnected, undefined);
		assertSelectedProvider(picker, undefined, 'Selection should be cleared after disconnect');
	});

	test('reconnect restores the same workspace', () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Connected);
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, storage);
		assertSelectedProvider(picker, 'agenthost-remote-1');

		// Disconnect — clears selection
		remoteStatus.set(RemoteAgentHostConnectionStatus.Disconnected, undefined);
		assertSelectedProvider(picker, undefined, 'Should clear on disconnect');

		// Reconnect — should restore
		remoteStatus.set(RemoteAgentHostConnectionStatus.Connected, undefined);
		assertSelectedProvider(picker, 'agenthost-remote-1', 'Should restore after reconnect');
		assert.strictEqual(
			picker.selectedProject?.workspace.repositories[0]?.uri.path,
			'/remote/project',
			'Should restore the same workspace URI',
		);
	});

	test('disconnect does not auto-select another provider workspace', () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Connected);
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });
		const localProvider = createMockProvider('local-1');

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
			{ uri: URI.file('/local/project'), providerId: 'local-1', checked: false },
		]);

		providersService.setProviders([remoteProvider, localProvider]);
		const picker = createTestPicker(disposables, providersService, storage);
		assertSelectedProvider(picker, 'agenthost-remote-1');

		// Disconnect remote
		remoteStatus.set(RemoteAgentHostConnectionStatus.Disconnected, undefined);

		// Should NOT auto-select local workspace — should remain empty
		assertSelectedProvider(picker, undefined, 'Should not auto-select another provider on disconnect');
	});

	test('checked is globally unique after persist', () => {
		const localProvider = createMockProvider('local-1');
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.Connected);
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
			{ uri: URI.file('/local/project'), providerId: 'local-1', checked: false },
		]);

		providersService.setProviders([remoteProvider, localProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		// Select the local workspace
		const resolvedWorkspace = localProvider.resolveWorkspace(URI.file('/local/project'));
		assert.ok(resolvedWorkspace, 'resolveWorkspace should resolve file:// URIs');
		const localWorkspace: IWorkspaceSelection = {
			providerId: 'local-1',
			workspace: resolvedWorkspace,
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
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		const selected: IWorkspaceSelection[] = [];
		disposables.add(picker.onDidSelectWorkspace(w => {
			if (w) {
				selected.push(w);
			}
		}));

		// Disconnect then reconnect
		remoteStatus.set(RemoteAgentHostConnectionStatus.Disconnected, undefined);
		remoteStatus.set(RemoteAgentHostConnectionStatus.Connected, undefined);

		assert.strictEqual(selected.length, 1, 'onDidSelectWorkspace should fire once on reconnect');
		assert.strictEqual(selected[0].providerId, 'agenthost-remote-1');
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
