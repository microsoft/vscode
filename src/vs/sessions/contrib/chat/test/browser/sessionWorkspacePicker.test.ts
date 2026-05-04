/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
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
import { ISessionWorkspace, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../../services/sessions/common/session.js';
import { WorkspacePicker, IWorkspaceSelection } from '../../browser/sessionWorkspacePicker.js';
import { IWorkspacesService } from '../../../../../platform/workspaces/common/workspaces.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';

// ---- Storage key (must match the one in sessionWorkspacePicker.ts) ----------
const STORAGE_KEY_RECENT_WORKSPACES = 'sessions.recentlyPickedWorkspaces';

// ---- Mock providers ---------------------------------------------------------

function createMockProvider(id: string, opts?: {
	connectionStatus?: ISettableObservable<RemoteAgentHostConnectionStatus>;
	browseActions?: readonly ISessionWorkspaceBrowseAction[];
}): ISessionsProvider {
	const base = {
		id,
		label: `Provider ${id}`,
		icon: Codicon.remote,
		sessionTypes: [],
		onDidChangeSessionTypes: Event.None,
		browseActions: opts?.browseActions ?? [],
		resolveWorkspace: (uri: URI): ISessionWorkspace => ({
			label: uri.path.substring(1) || uri.path,
			icon: Codicon.folder,
			repositories: [{ uri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined }],
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
	instantiationService.stub(IContextViewService, { showContextView: () => ({ close: () => { } }), hideContextView: () => { }, layout: () => { } });
	instantiationService.stub(IStorageService, storage);
	instantiationService.stub(IUriIdentityService, { extUri });
	instantiationService.stub(ISessionsProvidersService, providersService);
	instantiationService.stub(IRemoteAgentHostService, {});
	instantiationService.stub(IQuickInputService, {});
	instantiationService.stub(IClipboardService, {});
	instantiationService.stub(IPreferencesService, {});
	instantiationService.stub(IOutputService, {});
	instantiationService.stub(IConfigurationService, { getValue: () => undefined });
	instantiationService.stub(ICommandService, { executeCommand: async () => { } });
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IContextKeyService, new MockContextKeyService());
	instantiationService.stub(IMenuService, { createMenu: () => ({ onDidChange: Event.None, getActions: () => [], dispose: () => { } }) });
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

	test('restore picks checked entry even when remote is disconnected (before grace period)', () => {
		// Restore is honored synchronously: the picker shows the checked entry
		// while we wait to see if the connection comes up. The grace-period
		// fallback (covered in a separate test) only fires later.
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.disconnected);
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
	});

	test('restored remote that never connects falls back after grace period', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// The provider is registered as Disconnected and never transitions —
		// e.g. SSH host is unreachable and the status was set before the picker
		// could subscribe. The picker should fall back to no selection after
		// the grace period so the view pane drops the stale session.
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.disconnected);
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		assertSelectedProvider(picker, 'agenthost-remote-1', 'Selection is restored synchronously');

		const events: Array<IWorkspaceSelection | undefined> = [];
		disposables.add(picker.onDidSelectWorkspace(e => events.push(e)));

		// Advance past the grace period.
		await timeout(10_000);

		assertSelectedProvider(picker, undefined, 'Selection cleared after grace period');
		assert.deepStrictEqual(events, [undefined], 'onDidSelectWorkspace fired with undefined');
	}));

	test('restored remote that connects within grace period keeps selection', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.disconnected);
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		// Connection succeeds quickly.
		await timeout(100);
		remoteStatus.set(RemoteAgentHostConnectionStatus.connecting, undefined);
		await timeout(500);
		remoteStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);

		// Advance past the grace period — should not fall back since we connected.
		await timeout(10_000);

		assertSelectedProvider(picker, 'agenthost-remote-1', 'Selection preserved after successful connect');
	}));

	test('user pick during connect cancels the fallback', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		// If the user picks a different workspace while the restore-grace-period
		// timer is running, the timer must not later clear the user's selection.
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.disconnected);
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });
		const localProvider = createMockProvider('local-1');

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider, localProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		// User picks a local workspace while the remote is still trying to connect.
		const localPick: IWorkspaceSelection = {
			providerId: 'local-1',
			workspace: localProvider.resolveWorkspace(URI.file('/local/picked'))!,
		};
		picker.setSelectedWorkspace(localPick, false);

		// Grace period elapses; remote still disconnected — must not affect user pick.
		await timeout(10_000);

		assertSelectedProvider(picker, 'local-1', 'User pick preserved across grace-period elapse');
	}));

	test('restore picks checked entry while remote is connecting (no fallback flicker)', () => {
		// SSH remote: provider registers in Disconnected state and immediately
		// starts connecting. We restore the checked entry immediately rather than
		// falling back to a different workspace and swapping later.
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.disconnected);
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

		// Connection attempt starts (no fallback while connecting).
		remoteStatus.set(RemoteAgentHostConnectionStatus.connecting, undefined);
		assertSelectedProvider(picker, 'agenthost-remote-1');

		// After connection completes, selection is unchanged.
		remoteStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		assertSelectedProvider(picker, 'agenthost-remote-1');
	});

	test('connecting provider that fails falls back to no selection', () => {
		// Real SSH remote lifecycle: starts Disconnected, transitions Connecting,
		// then fails back to Disconnected. The picker must clear the selection
		// and fire onDidSelectWorkspace(undefined) so the view pane calls unsetNewSession().
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.disconnected);
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		assertSelectedProvider(picker, 'agenthost-remote-1', 'Selection is restored while connecting');

		const events: Array<IWorkspaceSelection | undefined> = [];
		disposables.add(picker.onDidSelectWorkspace(e => events.push(e)));

		// SSH tunnel begins.
		remoteStatus.set(RemoteAgentHostConnectionStatus.connecting, undefined);
		assertSelectedProvider(picker, 'agenthost-remote-1', 'Selection preserved while connecting');

		// SSH tunnel fails.
		remoteStatus.set(RemoteAgentHostConnectionStatus.disconnected, undefined);

		assertSelectedProvider(picker, undefined, 'Selection cleared after connection failure');
		assert.deepStrictEqual(events, [undefined], 'onDidSelectWorkspace fired with undefined');
	});

	test('restore picks connected remote provider', () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.connected);
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		assertSelectedProvider(picker, 'agenthost-remote-1');
	});

	test('disconnect preserves selection (renders grayed; no auto-clear)', () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.connected);
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, storage);
		assertSelectedProvider(picker, 'agenthost-remote-1');

		// Disconnect — selection is preserved (the user picked it; we keep honoring it).
		remoteStatus.set(RemoteAgentHostConnectionStatus.disconnected, undefined);
		assertSelectedProvider(picker, 'agenthost-remote-1', 'Selection should be preserved on disconnect');
	});

	test('reconnect keeps the selection (no extra event fires)', () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.connected);
		const remoteProvider = createMockProvider('agenthost-remote-1', { connectionStatus: remoteStatus });

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/remote/project'), providerId: 'agenthost-remote-1', checked: true },
		]);

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, storage);
		assertSelectedProvider(picker, 'agenthost-remote-1');

		// Disconnect / reconnect cycle — selection preserved throughout.
		remoteStatus.set(RemoteAgentHostConnectionStatus.disconnected, undefined);
		remoteStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		assertSelectedProvider(picker, 'agenthost-remote-1');
		assert.strictEqual(
			picker.selectedProject?.workspace.repositories[0]?.uri.path,
			'/remote/project',
		);
	});

	test('checked is globally unique after persist', () => {
		const localProvider = createMockProvider('local-1');
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.connected);
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

	test('restore picks the stored workspace when its provider registers after another provider', () => {
		// Regression: previously the picker filtered restore through `activeProviderId`,
		// which auto-locked to whichever provider registered first. If the stored
		// workspace belonged to a provider that registered later than another available
		// provider (for example, local-agent-host registering after default-copilot),
		// the stored entry was filtered out and never restored.
		//
		// Realistic shape: storage holds BOTH a (non-checked) recent for the
		// early-registering provider and a (checked) recent for the late-registering
		// provider. The picker may briefly show the early recent as a fallback, but
		// once the checked entry's provider registers, the picker must upgrade to it.
		const copilotProvider = createMockProvider('default-copilot');

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/copilot/old-project'), providerId: 'default-copilot', checked: false },
			{ uri: URI.file('/agent-host/project'), providerId: 'local-agent-host', checked: true },
		]);

		// Construct picker with only the early-registering provider available.
		providersService.setProviders([copilotProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		// The fallback may be selected initially (early provider's recent),
		// since the user's checked entry's provider isn't ready yet.
		// Now the late provider arrives.
		const agentHostProvider = createMockProvider('local-agent-host');
		providersService.setProviders([copilotProvider, agentHostProvider]);

		assertSelectedProvider(picker, 'local-agent-host', 'Stored workspace should be restored once its provider registers');
	});

	test('late-registering provider does not move selection out from under user', () => {
		// After the user has explicitly picked a workspace, a provider
		// registering later in the session must not switch the selection to its
		// stored "checked" entry. We only do that auto-upgrade during initial
		// startup before the user has acted.
		const copilotProvider = createMockProvider('default-copilot');

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: URI.file('/agent-host/project'), providerId: 'local-agent-host', checked: true },
		]);

		providersService.setProviders([copilotProvider]);
		const picker = createTestPicker(disposables, providersService, storage);

		// Suppression kicked in: no fallback selection while checked entry is pending.
		assertSelectedProvider(picker, undefined, 'No fallback while checked entry pending');

		// User explicitly picks a Copilot workspace.
		const copilotPick: IWorkspaceSelection = {
			providerId: 'default-copilot',
			workspace: copilotProvider.resolveWorkspace(URI.file('/copilot/picked'))!,
		};
		picker.setSelectedWorkspace(copilotPick, false);
		assertSelectedProvider(picker, 'default-copilot', 'User pick is honored');

		// Now the late provider for the (still-stored) checked entry arrives.
		const agentHostProvider = createMockProvider('local-agent-host');
		providersService.setProviders([copilotProvider, agentHostProvider]);

		assertSelectedProvider(picker, 'default-copilot', 'User selection is preserved across late provider registration');
	});
});

// ---- Tab discovery ----------------------------------------------------------

/** Minimal subclass that exposes the protected `_getAvailableTabs` for testing. */
class TestablePicker extends WorkspacePicker {
	getAvailableTabs(): string[] {
		return this._getAvailableGroups();
	}
}

function makeBrowseAction(providerId: string, group: string | undefined, label = 'browse'): ISessionWorkspaceBrowseAction {
	return {
		label,
		group,
		icon: Codicon.folder,
		providerId,
		run: async () => undefined,
	};
}

function createTestablePicker(disposables: DisposableStore, providersService: MockSessionsProvidersService): TestablePicker {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => { }, show: () => { } });
	instantiationService.stub(IContextViewService, { showContextView: () => ({ close: () => { } }), hideContextView: () => { }, layout: () => { } });
	instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
	instantiationService.stub(IUriIdentityService, { extUri });
	instantiationService.stub(ISessionsProvidersService, providersService);
	instantiationService.stub(IRemoteAgentHostService, {});
	instantiationService.stub(IQuickInputService, {});
	instantiationService.stub(IClipboardService, {});
	instantiationService.stub(IPreferencesService, {});
	instantiationService.stub(IOutputService, {});
	instantiationService.stub(IConfigurationService, { getValue: () => undefined });
	instantiationService.stub(ICommandService, { executeCommand: async () => { } });
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IContextKeyService, new MockContextKeyService());
	instantiationService.stub(IMenuService, { createMenu: () => ({ onDidChange: Event.None, getActions: () => [], dispose: () => { } }) });
	instantiationService.stub(IWorkspacesService, {
		getRecentlyOpened: async () => ({ workspaces: [], files: [] }),
		onDidChangeRecentlyOpened: Event.None,
	});
	return disposables.add(instantiationService.createInstance(TestablePicker));
}

suite('WorkspacePicker - Tab discovery', () => {

	const disposables = new DisposableStore();
	let providersService: MockSessionsProvidersService;

	setup(() => {
		providersService = new MockSessionsProvidersService();
		disposables.add(providersService);
	});

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns Remote group even when no providers contribute groups', () => {
		providersService.setProviders([createMockProvider('p1')]);
		const picker = createTestablePicker(disposables, providersService);
		assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_REMOTE]);
	});

	test('orders well-known groups Local first, then alphabetical', () => {
		providersService.setProviders([
			createMockProvider('remote', { browseActions: [makeBrowseAction('remote', SESSION_WORKSPACE_GROUP_REMOTE)] }),
			createMockProvider('cloud', { browseActions: [makeBrowseAction('cloud', 'Cloud')] }),
			createMockProvider('local', { browseActions: [makeBrowseAction('local', SESSION_WORKSPACE_GROUP_LOCAL)] }),
		]);
		const picker = createTestablePicker(disposables, providersService);
		assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_LOCAL, 'Cloud', SESSION_WORKSPACE_GROUP_REMOTE]);
	});

	test('deduplicates groups contributed by multiple providers / actions', () => {
		providersService.setProviders([
			createMockProvider('p1', { browseActions: [makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_LOCAL)] }),
			createMockProvider('p2', { browseActions: [makeBrowseAction('p2', SESSION_WORKSPACE_GROUP_LOCAL), makeBrowseAction('p2', SESSION_WORKSPACE_GROUP_LOCAL)] }),
		]);
		const picker = createTestablePicker(disposables, providersService);
		assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE]);
	});

	test('appends custom group labels after Local', () => {
		providersService.setProviders([
			createMockProvider('p1', { browseActions: [makeBrowseAction('p1', 'Custom A'), makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_LOCAL)] }),
			createMockProvider('p2', { browseActions: [makeBrowseAction('p2', 'Custom B'), makeBrowseAction('p2', SESSION_WORKSPACE_GROUP_REMOTE)] }),
		]);
		const picker = createTestablePicker(disposables, providersService);
		const tabs = picker.getAvailableTabs();
		assert.strictEqual(tabs[0], SESSION_WORKSPACE_GROUP_LOCAL);
		assert.deepStrictEqual(tabs.slice(1).sort(), ['Custom A', 'Custom B', SESSION_WORKSPACE_GROUP_REMOTE]);
	});

	test('ignores browse actions without a group', () => {
		providersService.setProviders([
			createMockProvider('p1', { browseActions: [makeBrowseAction('p1', undefined), makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_LOCAL)] }),
		]);
		const picker = createTestablePicker(disposables, providersService);
		assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE]);
	});

	test('discovers groups from recent workspaces does not add extra tabs', () => {
		const provider: ISessionsProvider = {
			...createMockProvider('p1'),
			resolveWorkspace: (uri: URI): ISessionWorkspace => ({
				label: uri.path,
				icon: Codicon.folder,
				group: 'Cloud',
				repositories: [{ uri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined }],
				requiresWorkspaceTrust: false,
			}),
		};
		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [{ uri: URI.file('/repo'), providerId: 'p1', checked: false }]);
		providersService.setProviders([provider]);

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => { }, show: () => { } });
		instantiationService.stub(IContextViewService, { showContextView: () => ({ close: () => { } }), hideContextView: () => { }, layout: () => { } });
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(IUriIdentityService, { extUri });
		instantiationService.stub(ISessionsProvidersService, providersService);
		instantiationService.stub(IRemoteAgentHostService, {});
		instantiationService.stub(IQuickInputService, {});
		instantiationService.stub(IClipboardService, {});
		instantiationService.stub(IPreferencesService, {});
		instantiationService.stub(IOutputService, {});
		instantiationService.stub(IConfigurationService, { getValue: () => undefined });
		instantiationService.stub(ICommandService, { executeCommand: async () => { } });
		instantiationService.stub(IFileDialogService, {});
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IMenuService, { createMenu: () => ({ onDidChange: Event.None, getActions: () => [], dispose: () => { } }) });
		instantiationService.stub(IWorkspacesService, {
			getRecentlyOpened: async () => ({ workspaces: [], files: [] }),
			onDidChangeRecentlyOpened: Event.None,
		});
		const picker = disposables.add(instantiationService.createInstance(TestablePicker));
		// Recent workspace group ('Cloud') is not added as a tab — only
		// browse actions and the always-present Remote group contribute tabs.
		assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_REMOTE]);
	});
});
