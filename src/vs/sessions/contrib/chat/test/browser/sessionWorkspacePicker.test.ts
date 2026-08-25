/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind } from '../../../../../platform/actionWidget/browser/actionList.js';
import { RemoteAgentHostConnectionStatus, IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';
import { IOutputService } from '../../../../../workbench/services/output/common/output.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { extUri } from '../../../../../base/common/resources.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISendRequestOptions, ISessionChangeEvent, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISession, ISessionWorkspace, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../../services/sessions/common/session.js';
import { IWorkspacePickerItem, IWorkspacePickerOptions, WorkspacePicker } from '../../browser/sessionWorkspacePicker.js';
import { NewSessionWorkspacePreselectionSource } from '../../browser/newSessionComposerService.js';
import { ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { AutomationsWorkspacePicker } from '../../../automations/browser/automationDialog.js';
import { AutomationIsolationModel } from '../../../automations/common/isolationGroupModel.js';
import { buildMobileWorkspacePickerRows, showMobileWorkspacePickerSheet } from '../../browser/mobile/mobileWorkspacePickerSheet.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IWorkspacesService } from '../../../../../platform/workspaces/common/workspaces.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { INotification, INotificationHandle, INotificationService, NoOpNotification, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { AGENTIC_SIGN_IN_COMMAND_ID } from '../../../../common/sessionCommands.js';

// ---- Storage key (must match the one in sessionWorkspacePicker.ts) ----------
const STORAGE_KEY_RECENT_WORKSPACES = 'sessions.recentlyPickedWorkspaces';

// ---- Mock providers ---------------------------------------------------------

// Maps mock provider id → URI path prefix it resolves. In production, the
// URI's authority/scheme determines which provider can resolve it; the
// tests use file URIs only, so we map provider ids to their conventional
// path roots (e.g. /remote, /local, /copilot, /agent-host).
const MOCK_PROVIDER_PATH_PREFIXES: Record<string, string> = {
	'agenthost-remote-1': '/remote',
	'local-1': '/local',
	'default-copilot': '/copilot',
	'local-agent-host': '/agent-host',
};

function createMockProvider(id: string, opts?: {
	connectionStatus?: ISettableObservable<RemoteAgentHostConnectionStatus>;
	browseActions?: readonly ISessionWorkspaceBrowseAction[];
	canConnectOnDemand?: boolean;
	connect?: () => Promise<void>;
	onDidReportConnectProgress?: Event<{ readonly connectionKey: string; readonly message: string }>;
	remoteAddress?: string;
	getSessions?: () => ISession[];
	onDidChangeSessions?: Event<ISessionChangeEvent>;
}): ISessionsProvider {
	const pathPrefix = MOCK_PROVIDER_PATH_PREFIXES[id];
	const canResolve = (uri: URI) => !pathPrefix || uri.path === pathPrefix || uri.path.startsWith(`${pathPrefix}/`);
	const base = {
		id,
		label: `Provider ${id}`,
		icon: Codicon.remote,
		order: 0,
		sessionTypes: [],
		onDidChangeSessionTypes: Event.None,
		browseActions: opts?.browseActions ?? [],
		resolveWorkspace: (uri: URI): ISessionWorkspace | undefined => {
			if (!canResolve(uri)) {
				return undefined;
			}
			return {
				uri,
				label: uri.path.substring(1) || uri.path,
				icon: Codicon.folder,
				folders: [{
					root: uri,
					workingDirectory: uri,
					name: uri.path.substring(1) || uri.path,
					description: undefined,
					gitRepository: { uri, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
				}],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			};
		},
		onDidChangeSessions: opts?.onDidChangeSessions ?? Event.None,
		getSessions: opts?.getSessions ?? (() => []),
		createNewSession: () => { throw new Error('Not implemented'); },
		createQuickChat: () => { throw new Error('Not implemented'); },
		deleteNewSession: () => { },
		getSessionTypes: () => [],
		renameChat: async () => { },
		renameSession: async () => { },
		getModelsSnapshot: () => ({ models: [], desiredModelResolution: { kind: 'notRequested' as const }, modelTarget: undefined }),
		getModelPickerOptions: () => ({ useGroupedModelPicker: true, showFeatured: true, showUnavailableFeatured: false, showManageModelsAction: false }),
		onDidChangeModels: Event.None,
		setModel: () => { },
		archiveSession: async () => { },
		unarchiveSession: async () => { },
		setSessionReadState: async () => { },
		deleteSession: async () => { },
		deleteSessions: async () => { },
		deleteChat: async () => true,
		createNewChat: async () => { throw new Error('Not implemented'); },
		forkChat: async () => { throw new Error('Not implemented'); },
		createSideChat: async () => { throw new Error('Not implemented'); },
		sendRequest: async (_sessionId: string, _chatResource: URI, _options: ISendRequestOptions) => { throw new Error('Not implemented'); },
	};
	if (opts?.connectionStatus) {
		return {
			...base,
			canConnectOnDemand: opts.canConnectOnDemand,
			connect: opts.connect,
			connectionStatus: opts.connectionStatus,
			onDidReportConnectProgress: opts.onDidReportConnectProgress,
			remoteAddress: opts.remoteAddress,
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

	resolveWorkspace(folderUri: URI, preferredProviderId?: string) {
		if (preferredProviderId) {
			const preferred = this.getProvider(preferredProviderId);
			const workspace = preferred?.resolveWorkspace(folderUri);
			if (workspace) {
				return { providerId: preferredProviderId, workspace };
			}
		}
		for (const provider of this.getProviders()) {
			const workspace = provider.resolveWorkspace(folderUri);
			if (workspace) {
				return { providerId: provider.id, workspace };
			}
		}
		return undefined;
	}
}

class RecordingNotificationHandle extends NoOpNotification {
	closed = false;
	messages: NotificationMessage[] = [];

	constructor(message: NotificationMessage) {
		super();
		this.messages.push(message);
	}

	override updateMessage(message: NotificationMessage): void {
		this.messages.push(message);
	}

	override close(): void {
		this.closed = true;
	}
}

class RecordingNotificationService extends TestNotificationService {
	readonly handles: RecordingNotificationHandle[] = [];
	readonly errors: Array<string | Error> = [];

	override notify(notification: INotification): INotificationHandle {
		const handle = new RecordingNotificationHandle(notification.message);
		this.handles.push(handle);
		return handle;
	}

	override error(error: string | Error): INotificationHandle {
		this.errors.push(error);
		return super.error(error);
	}
}

class DispatchingWorkspacePicker extends WorkspacePicker {
	dispatchFolder(folderUri: URI, providerId: string): Promise<boolean> {
		return this._dispatchPickerItem({ folderUri, providerId });
	}

	dispatchItem(item: IWorkspacePickerItem): Promise<boolean> {
		return this._dispatchPickerItem(item);
	}
}

class TestAutomationsWorkspacePicker extends AutomationsWorkspacePicker {
	getItems() {
		return this._buildItems();
	}

	getItemStates(): Array<{ readonly label: string; readonly checked: boolean }> {
		return this.getItems()
			.filter(entry => entry.item)
			.map(entry => ({ label: entry.label ?? '', checked: entry.item?.checked === true }));
	}

	async select(label: string): Promise<void> {
		const entry = this.getItems().find(candidate => candidate.label === label);
		assert.ok(entry?.item, `Expected picker item '${label}'`);
		await this._dispatchPickerItem(entry.item);
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
	notificationService: INotificationService = new TestNotificationService(),
	pickerCtor: typeof WorkspacePicker = WorkspacePicker,
	fileDialogService: Partial<IFileDialogService> = {},
	workspacesService: IWorkspacesService = { getRecentlyOpened: async () => ({ workspaces: [], files: [] }), onDidChangeRecentlyOpened: Event.None } as unknown as IWorkspacesService,
	recentWorkspacesService?: ISessionsRecentWorkspacesService,
	options?: IWorkspacePickerOptions,
	fileService: IFileService = upcastPartial<IFileService>({
		onDidChangeFileSystemProviderRegistrations: Event.None,
		hasProvider: () => true,
		exists: async () => true,
	}),
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
	instantiationService.stub(IConfigurationService, new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true }));
	instantiationService.stub(ICommandService, { executeCommand: async () => { } });
	instantiationService.stub(IFileDialogService, fileDialogService);
	instantiationService.stub(IFileService, fileService);
	instantiationService.stub(IContextKeyService, new MockContextKeyService());
	instantiationService.stub(IMenuService, {
		createMenu: () => ({ onDidChange: Event.None, getActions: () => [], dispose: () => { } }),
		getMenuActions: () => [],
	});
	instantiationService.stub(INotificationService, notificationService);
	instantiationService.stub(IWorkspacesService, workspacesService);
	instantiationService.stub(ISessionsRecentWorkspacesService, recentWorkspacesService ?? disposables.add(instantiationService.createInstance(SessionsRecentWorkspacesService)));
	instantiationService.stub(ITelemetryService, NullTelemetryService);

	return disposables.add(instantiationService.createInstance(pickerCtor, options ?? {}));
}

function createMockSession(
	provider: ISessionsProvider,
	folderUri: URI,
	updatedAt: number,
	options?: { readonly worktreePending?: boolean; readonly workTreeUri?: URI },
): ISession {
	const workspace = provider.resolveWorkspace(folderUri);
	if (!workspace) {
		throw new Error(`Provider ${provider.id} cannot resolve ${folderUri.toString()}`);
	}
	const firstFolder = workspace.folders[0];
	const sessionWorkspace = options?.workTreeUri && firstFolder?.gitRepository
		? {
			...workspace,
			folders: [
				{ ...firstFolder, gitRepository: { ...firstFolder.gitRepository, workTreeUri: options.workTreeUri } },
				...workspace.folders.slice(1),
			],
		}
		: workspace;
	return upcastPartial<ISession>({
		providerId: provider.id,
		updatedAt: constObservable(new Date(updatedAt)),
		workspace: constObservable(sessionWorkspace),
		isQuickChat: constObservable(false),
		worktreePending: constObservable(options?.worktreePending ?? false),
	});
}

/**
 * Builds a {@link SessionsRecentWorkspacesService} and waits for its initial
 * (asynchronous) VS Code recents fetch to complete, so a picker constructed
 * against it afterwards restores against a fully-populated recents list
 * instead of racing the fetch (as happens when {@link createTestPicker}
 * builds its own service inline).
 */
async function createResolvedRecentWorkspacesService(
	disposables: DisposableStore,
	storageService: IStorageService,
	providersService: MockSessionsProvidersService,
	workspacesService: IWorkspacesService,
): Promise<ISessionsRecentWorkspacesService> {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(IStorageService, storageService);
	instantiationService.stub(IUriIdentityService, { extUri });
	instantiationService.stub(IWorkspacesService, workspacesService);
	instantiationService.stub(ISessionsProvidersService, providersService);
	const recentWorkspacesService = disposables.add(instantiationService.createInstance(SessionsRecentWorkspacesService));
	await new Promise<void>(resolve => {
		const listener = recentWorkspacesService.onDidChangeRecentWorkspaces(() => {
			listener.dispose();
			resolve();
		});
	});
	return recentWorkspacesService;
}

// ---- Assertion helpers ------------------------------------------------------

function assertSelectedProvider(picker: WorkspacePicker, expectedProviderId: string | undefined, message?: string): void {
	assert.strictEqual(picker.selectedResolved?.providerId, expectedProviderId, message);
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

		assert.deepStrictEqual({
			providerId: picker.selectedResolved?.providerId,
			source: picker.preselectionSource,
		}, {
			providerId: 'agenthost-remote-1',
			source: NewSessionWorkspacePreselectionSource.CheckedWorkspace,
		});
	});

	test('restore prioritizes the sessions\' own history over VS Code\'s global recents', async () => {
		const localProvider = createMockProvider('local-1');
		providersService.setProviders([localProvider]);

		const ownUri = URI.file('/local/own-project');
		const globalUri = URI.file('/local/global-only-project');

		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [{ uri: ownUri, providerId: 'local-1', checked: false }]);

		const workspacesService = { getRecentlyOpened: async () => ({ workspaces: [{ folderUri: globalUri }], files: [] }), onDidChangeRecentlyOpened: Event.None } as unknown as IWorkspacesService;
		const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);

		// Sanity: the merged (display) list includes both entries...
		assert.deepStrictEqual(
			recentWorkspacesService.getRecentWorkspaces().map(r => r.workspace.uri.toString()),
			[ownUri.toString(), globalUri.toString()],
		);
		// ...but the own-only query used for restoration excludes the global one.
		assert.deepStrictEqual(
			recentWorkspacesService.getRecentWorkspaces(false).map(r => r.workspace.uri.toString()),
			[ownUri.toString()],
		);

		const picker = createTestPicker(disposables, providersService, storage, undefined, undefined, undefined, workspacesService, recentWorkspacesService);

		assert.deepStrictEqual({
			folderUri: picker.selectedFolderUri?.toString(),
			source: picker.preselectionSource,
		}, {
			folderUri: ownUri.toString(),
			source: NewSessionWorkspacePreselectionSource.RecentWorkspace,
		});
	});

	test('restore selects the most recent VS Code workspace when own history is empty', async () => {
		const localProvider = createMockProvider('local-1');
		providersService.setProviders([localProvider]);

		const mostRecentGlobalUri = URI.file('/local/most-recent-global-project');
		const olderGlobalUri = URI.file('/local/older-global-project');
		const storage = disposables.add(new TestStorageService());

		const workspacesService = {
			getRecentlyOpened: async () => ({
				workspaces: [{ folderUri: mostRecentGlobalUri }, { folderUri: olderGlobalUri }],
				files: [],
			}),
			onDidChangeRecentlyOpened: Event.None,
		} as unknown as IWorkspacesService;
		const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);

		const picker = createTestPicker(disposables, providersService, storage, undefined, undefined, undefined, workspacesService, recentWorkspacesService);

		assert.strictEqual(picker.selectedFolderUri?.toString(), mostRecentGlobalUri.toString());
	});

	test('restore selects a VS Code recent that finishes loading after picker creation', async () => {
		const localProvider = createMockProvider('local-1');
		providersService.setProviders([localProvider]);

		const globalUri = URI.file('/local/global-project');
		const recentlyOpened = new DeferredPromise<Awaited<ReturnType<IWorkspacesService['getRecentlyOpened']>>>();
		const workspacesService = {
			getRecentlyOpened: () => recentlyOpened.p,
			onDidChangeRecentlyOpened: Event.None,
		} as unknown as IWorkspacesService;
		const picker = createTestPicker(disposables, providersService, undefined, undefined, undefined, undefined, workspacesService);

		const initialSelection = picker.selectedFolderUri;
		assert.strictEqual(initialSelection, undefined);
		await recentlyOpened.complete({ workspaces: [{ folderUri: globalUri }], files: [] });

		assert.strictEqual(picker.selectedFolderUri?.toString(), globalUri.toString());
	});

	test('late VS Code recents do not override an explicit workspace selection', async () => {
		const localProvider = createMockProvider('local-1');
		providersService.setProviders([localProvider]);

		const selectedUri = URI.file('/local/selected-project');
		const globalUri = URI.file('/local/global-project');
		const recentlyOpened = new DeferredPromise<Awaited<ReturnType<IWorkspacesService['getRecentlyOpened']>>>();
		const workspacesService = {
			getRecentlyOpened: () => recentlyOpened.p,
			onDidChangeRecentlyOpened: Event.None,
		} as unknown as IWorkspacesService;
		const picker = createTestPicker(disposables, providersService, undefined, undefined, undefined, undefined, workspacesService);
		picker.setSelectedWorkspace(selectedUri, { fireEvent: false });

		await recentlyOpened.complete({ workspaces: [{ folderUri: globalUri }], files: [] });

		assert.strictEqual(picker.selectedFolderUri?.toString(), selectedUri.toString());
	});

	test('restore chooses the most frequent workspace among the 15 most recent sessions', async () => {
		let sessions: ISession[] = [];
		const provider = createMockProvider('local-1', { getSessions: () => sessions });
		providersService.setProviders([provider]);

		const mostFrequentRecent = URI.file('/local/recent-a');
		const mostFrequentOverall = URI.file('/local/older-b');
		const recentFolders = [
			mostFrequentRecent,
			mostFrequentOverall,
			mostFrequentRecent,
			URI.file('/local/recent-c'),
			mostFrequentRecent,
			mostFrequentOverall,
			URI.file('/local/recent-d'),
			URI.file('/local/recent-e'),
			URI.file('/local/recent-f'),
			URI.file('/local/recent-g'),
			URI.file('/local/recent-h'),
			URI.file('/local/recent-i'),
			URI.file('/local/recent-j'),
			URI.file('/local/recent-k'),
			URI.file('/local/recent-l'),
		];
		const recentSessions = recentFolders.map((folderUri, index) => createMockSession(provider, folderUri, 100 - index));
		const olderSessions = Array.from({ length: 10 }, (_, index) => createMockSession(provider, mostFrequentOverall, 50 - index));
		sessions = [...olderSessions, ...recentSessions];

		const picker = createTestPicker(disposables, providersService);
		await timeout(0);

		assert.deepStrictEqual({
			folderUri: picker.selectedFolderUri?.toString(),
			source: picker.preselectionSource,
		}, {
			folderUri: mostFrequentRecent.toString(),
			source: NewSessionWorkspacePreselectionSource.ExistingSessions,
		});
	});

	test('restore skips missing session workspaces in frequency order', async () => {
		let sessions: ISession[] = [];
		const provider = createMockProvider('local-1', { getSessions: () => sessions });
		providersService.setProviders([provider]);
		const missing = URI.file('/local/missing');
		const existing = URI.file('/local/existing');
		sessions = [
			createMockSession(provider, missing, 5),
			createMockSession(provider, existing, 4),
			createMockSession(provider, missing, 3),
			createMockSession(provider, existing, 2),
			createMockSession(provider, missing, 1),
		];
		const checked: string[] = [];
		const fileService = upcastPartial<IFileService>({
			onDidChangeFileSystemProviderRegistrations: Event.None,
			hasProvider: () => true,
			exists: async resource => {
				checked.push(resource.toString());
				return extUri.isEqual(resource, existing);
			},
		});

		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			fileService,
		);
		await timeout(0);

		assert.deepStrictEqual({
			checked: [...new Set(checked)],
			folderUri: picker.selectedFolderUri?.toString(),
			source: picker.preselectionSource,
		}, {
			checked: [missing.toString(), existing.toString()],
			folderUri: existing.toString(),
			source: NewSessionWorkspacePreselectionSource.ExistingSessions,
		});
	});

	test('restore excludes pending and resolved worktree sessions using session metadata', async () => {
		let sessions: ISession[] = [];
		const provider = createMockProvider('local-1', { getSessions: () => sessions });
		providersService.setProviders([provider]);
		const pendingCheckout = URI.file('/local/pending-checkout');
		const resolvedWorktree = URI.file('/local/feature-checkout');
		const regularWorkspace = URI.file('/local/regular');
		sessions = [
			createMockSession(provider, pendingCheckout, 7, { worktreePending: true }),
			createMockSession(provider, pendingCheckout, 6, { worktreePending: true }),
			createMockSession(provider, pendingCheckout, 5, { worktreePending: true }),
			createMockSession(provider, resolvedWorktree, 4, { workTreeUri: resolvedWorktree }),
			createMockSession(provider, resolvedWorktree, 3, { workTreeUri: resolvedWorktree }),
			createMockSession(provider, resolvedWorktree, 2, { workTreeUri: resolvedWorktree }),
			createMockSession(provider, regularWorkspace, 1),
		];

		const picker = createTestPicker(disposables, providersService);
		await timeout(0);

		assert.deepStrictEqual({
			folderUri: picker.selectedFolderUri?.toString(),
			source: picker.preselectionSource,
		}, {
			folderUri: regularWorkspace.toString(),
			source: NewSessionWorkspacePreselectionSource.ExistingSessions,
		});
	});

	test('restore discards a session fallback that completes while restoration is disabled', async () => {
		let sessions: ISession[] = [];
		const provider = createMockProvider('local-1', { getSessions: () => sessions });
		providersService.setProviders([provider]);
		const folderUri = URI.file('/local/project');
		sessions = [createMockSession(provider, folderUri, 1)];
		const firstExists = new DeferredPromise<boolean>();
		let existsCallCount = 0;
		const fileService = upcastPartial<IFileService>({
			hasProvider: () => true,
			exists: async () => ++existsCallCount === 1 ? firstExists.p : true,
		});
		let canRestoreWorkspace = true;
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			{ canRestoreWorkspace: () => canRestoreWorkspace },
			fileService,
		);
		canRestoreWorkspace = false;
		await firstExists.complete(true);
		await timeout(0);
		const disabledSelection = picker.selectedFolderUri;

		canRestoreWorkspace = true;
		picker.refreshAutomaticSelection();
		await timeout(0);

		assert.deepStrictEqual({
			disabledSelection,
			folderUri: picker.selectedFolderUri?.toString(),
			source: picker.preselectionSource,
		}, {
			disabledSelection: undefined,
			folderUri: folderUri.toString(),
			source: NewSessionWorkspacePreselectionSource.ExistingSessions,
		});
	});

	test('restore retries when a provider reports sessions after picker creation', async () => {
		const sessionsChanged = disposables.add(new Emitter<ISessionChangeEvent>());
		let sessions: ISession[] = [];
		const provider = createMockProvider('local-1', {
			getSessions: () => sessions,
			onDidChangeSessions: sessionsChanged.event,
		});
		providersService.setProviders([provider]);
		const folderUri = URI.file('/local/late-session');
		const picker = createTestPicker(disposables, providersService);
		await timeout(0);

		sessions = [createMockSession(provider, folderUri, 1)];
		sessionsChanged.fire({ added: sessions, removed: [], changed: [] });
		await timeout(0);

		assert.deepStrictEqual({
			folderUri: picker.selectedFolderUri?.toString(),
			source: picker.preselectionSource,
		}, {
			folderUri: folderUri.toString(),
			source: NewSessionWorkspacePreselectionSource.ExistingSessions,
		});
	});

	test('shows manually picked worktree folders but filters them from VS Code recents', async () => {
		const provider = createMockProvider('provider');
		providersService.setProviders([provider]);

		const ownWorktreeUri = URI.file('/code/owned.worktrees/feature');
		const ownCopilotWorktreeUri = URI.file('/tmp/copilot-worktrees/owned-feature');
		const ownRegularUri = URI.file('/code/owned-feature');
		const globalWorktreeUri = URI.file('/code/vscode.worktrees/feature');
		const globalUppercaseWorktreeUri = URI.file('/code/VSCode.WORKTREES/other-feature');
		const globalCopilotWorktreeUri = URI.file('/tmp/copilot-worktrees/global-feature');
		const globalUppercaseCopilotWorktreeUri = URI.file('/tmp/COPILOT-WORKTREES/other-global-feature');
		const globalSimilarUri = URI.file('/code/vscode.worktrees-backup/feature');
		const globalRegularUri = URI.file('/code/vscode/feature');
		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: ownWorktreeUri, providerId: 'provider', checked: false },
			{ uri: ownCopilotWorktreeUri, providerId: 'provider', checked: false },
			{ uri: ownRegularUri, providerId: 'provider', checked: false },
		]);

		const workspacesService = {
			getRecentlyOpened: async () => ({
				workspaces: [
					{ folderUri: globalWorktreeUri },
					{ folderUri: globalUppercaseWorktreeUri },
					{ folderUri: globalCopilotWorktreeUri },
					{ folderUri: globalUppercaseCopilotWorktreeUri },
					{ folderUri: globalSimilarUri },
					{ folderUri: globalRegularUri },
				],
				files: [],
			}),
			onDidChangeRecentlyOpened: Event.None,
		} as unknown as IWorkspacesService;
		const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);

		assert.deepStrictEqual(
			recentWorkspacesService.getRecentWorkspaces().map(recent => recent.workspace.uri.toString()),
			[ownWorktreeUri, ownCopilotWorktreeUri, ownRegularUri, globalSimilarUri, globalRegularUri].map(uri => uri.toString()),
		);
	});

	test('restore never preselects a worktree folder', async () => {
		const localProvider = createMockProvider('local-1');
		providersService.setProviders([localProvider]);
		const globalUri = URI.file('/local/global-project');
		const selected: string[] = [];

		for (const excludedUri of [
			URI.file('/local/project.worktrees/feature'),
			URI.file('/local/copilot-worktrees/feature'),
		]) {
			const storage = disposables.add(new TestStorageService());
			seedStorage(storage, [{ uri: excludedUri, providerId: 'local-1', checked: true }]);
			const workspacesService = {
				getRecentlyOpened: async () => ({ workspaces: [{ folderUri: globalUri }], files: [] }),
				onDidChangeRecentlyOpened: Event.None,
			} as unknown as IWorkspacesService;
			const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);
			const picker = createTestPicker(disposables, providersService, storage, undefined, undefined, undefined, workspacesService, recentWorkspacesService);
			selected.push(picker.selectedFolderUri?.toString() ?? '');
		}

		assert.deepStrictEqual(selected, [globalUri.toString(), globalUri.toString()]);
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

		const events: Array<URI | undefined> = [];
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
		picker.setSelectedWorkspace(URI.file('/local/picked'), { fireEvent: false });

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

		const events: Array<URI | undefined> = [];
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

	test('failed on-demand recent connect closes progress notification and reports error', async () => {
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.disconnected);
		const progress = new Emitter<{ readonly connectionKey: string; readonly message: string }>();
		disposables.add(progress);
		let connectCalls = 0;
		const remoteProvider = createMockProvider('agenthost-remote-1', {
			connectionStatus: remoteStatus,
			canConnectOnDemand: true,
			remoteAddress: 'wsl:Ubuntu-24.04',
			onDidReportConnectProgress: progress.event,
			connect: async () => {
				connectCalls++;
				progress.fire({ connectionKey: 'wsl:Ubuntu-24.04', message: 'Opening WSL...' });
				throw new Error('boom');
			},
		});
		const notifications = new RecordingNotificationService();

		providersService.setProviders([remoteProvider]);
		const picker = createTestPicker(disposables, providersService, undefined, notifications, DispatchingWorkspacePicker) as DispatchingWorkspacePicker;

		await picker.dispatchFolder(URI.file('/remote/project'), 'agenthost-remote-1');

		assert.deepStrictEqual({
			connectCalls,
			progressClosed: notifications.handles[0]?.closed,
			progressMessages: notifications.handles[0]?.messages,
			errors: notifications.errors.map(error => String(error)),
			selectedProvider: picker.selectedResolved?.providerId,
		}, {
			connectCalls: 1,
			progressClosed: true,
			progressMessages: ['Connecting to Provider agenthost-remote-1...', 'Opening WSL...'],
			errors: ['Failed to connect to Provider agenthost-remote-1.'],
			selectedProvider: undefined,
		});
	});

	test('preserves the chosen provider when multiple providers resolve the same URI', async () => {
		const folderUri = URI.file('/shared/project');
		const firstProvider = createMockProvider('first');
		const secondBaseProvider = createMockProvider('second');
		const secondProvider = {
			...secondBaseProvider,
			browseActions: [{
				label: 'Select...',
				group: SESSION_WORKSPACE_GROUP_GITHUB,
				icon: Codicon.folderOpened,
				providerId: 'second',
				run: async () => secondBaseProvider.resolveWorkspace(folderUri),
			}],
		} satisfies ISessionsProvider;
		providersService.setProviders([firstProvider, secondProvider]);
		const picker = createTestPicker(disposables, providersService, undefined, undefined, DispatchingWorkspacePicker) as DispatchingWorkspacePicker;

		await picker.dispatchFolder(folderUri, 'second');
		const directProvider = picker.selectedResolved?.providerId;
		await picker.dispatchItem({ browseActionIndex: 0 });

		assert.deepStrictEqual({
			directProvider,
			browseProvider: picker.selectedResolved?.providerId,
		}, {
			directProvider: 'second',
			browseProvider: 'second',
		});
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
			picker.selectedResolved?.workspace.folders[0]?.root.path,
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
		picker.setSelectedWorkspace(URI.file('/local/project'), { fireEvent: false });

		// Verify storage: only the local entry should be checked
		const raw = storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE);
		assert.ok(raw, 'Storage should have recent workspaces');
		const stored = JSON.parse(raw!) as { uri: { path: string }; checked: boolean }[];
		const checkedEntries = stored.filter(e => e.checked);
		assert.strictEqual(checkedEntries.length, 1, 'Only one entry should be checked');
		assert.strictEqual(checkedEntries[0].uri.path, '/local/project', 'The local entry should be checked');
	});

	test('programmatic workspace initialization can avoid persisting recents', () => {
		const localProvider = createMockProvider('local-1');
		const storage = disposables.add(new TestStorageService());
		providersService.setProviders([localProvider]);
		const picker = createTestPicker(disposables, providersService, storage);
		const folder = URI.file('/local/proposed');

		picker.setSelectedWorkspace(folder, { fireEvent: false, persist: false });

		assert.deepStrictEqual({
			selected: picker.selectedFolderUri?.toString(),
			stored: storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE),
		}, {
			selected: folder.toString(),
			stored: undefined,
		});
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
		picker.setSelectedWorkspace(URI.file('/copilot/picked'), { fireEvent: false });
		assertSelectedProvider(picker, 'default-copilot', 'User pick is honored');

		// Now the late provider for the (still-stored) checked entry arrives.
		const agentHostProvider = createMockProvider('local-agent-host');
		providersService.setProviders([copilotProvider, agentHostProvider]);

		assertSelectedProvider(picker, 'default-copilot', 'User selection is preserved across late provider registration');
	});
});

suite('AutomationsWorkspacePicker', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('selects No workspace and restores a folder through the same picker', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const provider = createMockProvider('local-1');
		const folderUri = URI.file('/local/project');
		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [{ uri: folderUri, providerId: provider.id, checked: true }]);
		providersService.setProviders([provider]);

		const picker = createTestPicker(
			disposables,
			providersService,
			storage,
			new TestNotificationService(),
			TestAutomationsWorkspacePicker,
		) as TestAutomationsWorkspacePicker;
		const state = {
			isQuickChat: false,
			folderUri,
			isolationMode: 'workspace',
			branch: undefined,
		};
		const model = new AutomationIsolationModel(state);
		picker.setTargetModel(model);
		const container = document.createElement('div');
		picker.render(container);
		const readPresentation = () => ({
			triggerLabel: container.querySelector('.sessions-chat-dropdown-label')?.textContent,
			triggerAriaLabel: container.querySelector('.action-label')?.getAttribute('aria-label'),
			items: picker.getItemStates().filter(item => item.label === 'No workspace' || item.label === 'local/project'),
			isQuickChat: model.isQuickChat,
			folderUri: model.folderUri?.toString(),
		});

		const workspace = readPresentation();
		await picker.select('No workspace');
		const noWorkspace = readPresentation();
		await picker.select('local/project');

		assert.deepStrictEqual({
			workspace,
			noWorkspace,
			restoredWorkspace: readPresentation(),
		}, {
			workspace: {
				triggerLabel: 'local/project',
				triggerAriaLabel: 'Automation target, local/project',
				items: [
					{ label: 'No workspace', checked: false },
					{ label: 'local/project', checked: true },
				],
				isQuickChat: false,
				folderUri: folderUri.toString(),
			},
			noWorkspace: {
				triggerLabel: 'No workspace',
				triggerAriaLabel: 'Automation target, No workspace',
				items: [
					{ label: 'No workspace', checked: true },
					{ label: 'local/project', checked: false },
				],
				isQuickChat: true,
				folderUri: undefined,
			},
			restoredWorkspace: {
				triggerLabel: 'local/project',
				triggerAriaLabel: 'Automation target, local/project',
				items: [
					{ label: 'No workspace', checked: false },
					{ label: 'local/project', checked: true },
				],
				isQuickChat: false,
				folderUri: folderUri.toString(),
			},
		});
	});

	test('user workspace selections do not update recent workspaces', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const provider = createMockProvider('local-1');
		const originalFolder = URI.file('/local/original');
		const proposedFolder = URI.file('/local/proposed');
		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: originalFolder, providerId: provider.id, checked: true },
			{ uri: proposedFolder, providerId: provider.id, checked: false },
		]);
		providersService.setProviders([provider]);
		const before = storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE);
		const picker = createTestPicker(
			disposables,
			providersService,
			storage,
			new TestNotificationService(),
			TestAutomationsWorkspacePicker,
		) as TestAutomationsWorkspacePicker;
		picker.setTargetModel(new AutomationIsolationModel({
			isQuickChat: false,
			folderUri: originalFolder,
			isolationMode: 'workspace',
			branch: undefined,
		}));

		await picker.select('local/proposed');

		assert.deepStrictEqual({
			selected: picker.selectedFolderUri?.toString(),
			storageUnchanged: storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE) === before,
		}, {
			selected: proposedFolder.toString(),
			storageUnchanged: true,
		});
	});

	test('keeps the previous workspace when trust is declined', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const provider = createMockProvider('local-1');
		const selectedFolder = URI.file('/local/selected');
		const candidateFolder = URI.file('/local/candidate');
		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: selectedFolder, providerId: provider.id, checked: true },
			{ uri: candidateFolder, providerId: provider.id, checked: false },
		]);
		providersService.setProviders([provider]);
		const trustRequests: Array<{ folderUri: string; providerId: string | undefined }> = [];
		const picker = createTestPicker(
			disposables,
			providersService,
			storage,
			new TestNotificationService(),
			TestAutomationsWorkspacePicker,
			{},
			undefined,
			undefined,
			{
				canSelectWorkspace: async (folderUri, providerId) => {
					trustRequests.push({ folderUri: folderUri.toString(), providerId });
					return false;
				},
			},
		) as TestAutomationsWorkspacePicker;
		const model = new AutomationIsolationModel({
			isQuickChat: false,
			folderUri: selectedFolder,
			isolationMode: 'workspace',
			branch: undefined,
		});
		picker.setTargetModel(model);

		await picker.select('local/candidate');

		assert.deepStrictEqual({
			trustRequests,
			modelFolderUri: model.folderUri?.toString(),
			pickerFolderUri: picker.selectedFolderUri?.toString(),
		}, {
			trustRequests: [{ folderUri: candidateFolder.toString(), providerId: provider.id }],
			modelFolderUri: selectedFolder.toString(),
			pickerFolderUri: selectedFolder.toString(),
		});
	});

	test('a stale trust grant cannot override a newer No workspace choice', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const provider = createMockProvider('local-1');
		const selectedFolder = URI.file('/local/selected');
		const candidateFolder = URI.file('/local/candidate');
		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: selectedFolder, providerId: provider.id, checked: true },
			{ uri: candidateFolder, providerId: provider.id, checked: false },
		]);
		providersService.setProviders([provider]);
		const trustResult = new DeferredPromise<boolean>();
		const picker = createTestPicker(
			disposables,
			providersService,
			storage,
			new TestNotificationService(),
			TestAutomationsWorkspacePicker,
			{},
			undefined,
			undefined,
			{ canSelectWorkspace: () => trustResult.p },
		) as TestAutomationsWorkspacePicker;
		const model = new AutomationIsolationModel({
			isQuickChat: false,
			folderUri: selectedFolder,
			isolationMode: 'workspace',
			branch: undefined,
		});
		picker.setTargetModel(model);

		const staleSelection = picker.select('local/candidate');
		await picker.select('No workspace');
		await trustResult.complete(true);
		await staleSelection;

		assert.deepStrictEqual({
			isQuickChat: model.isQuickChat,
			folderUri: model.folderUri,
			pickerFolderUri: picker.selectedFolderUri?.toString(),
		}, {
			isQuickChat: true,
			folderUri: undefined,
			pickerFolderUri: selectedFolder.toString(),
		});
	});

	test('a stale remote selection cannot override a newer No workspace choice', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const localProvider = createMockProvider('local-1');
		const remoteStatus = observableValue<RemoteAgentHostConnectionStatus>('remoteStatus', RemoteAgentHostConnectionStatus.disconnected);
		const connectStarted = new DeferredPromise<void>();
		const finishConnect = new DeferredPromise<void>();
		const remoteProvider = createMockProvider('agenthost-remote-1', {
			connectionStatus: remoteStatus,
			canConnectOnDemand: true,
			connect: async () => {
				await connectStarted.complete();
				await finishConnect.p;
				remoteStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
			},
		});
		const localFolder = URI.file('/local/project');
		const remoteFolder = URI.file('/remote/project');
		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: localFolder, providerId: localProvider.id, checked: true },
			{ uri: remoteFolder, providerId: remoteProvider.id, checked: false },
		]);
		providersService.setProviders([localProvider, remoteProvider]);

		const picker = createTestPicker(
			disposables,
			providersService,
			storage,
			new TestNotificationService(),
			TestAutomationsWorkspacePicker,
		) as TestAutomationsWorkspacePicker;
		const model = new AutomationIsolationModel({
			isQuickChat: false,
			folderUri: localFolder,
			isolationMode: 'workspace',
			branch: undefined,
		});
		picker.setTargetModel(model);

		const staleSelection = picker.select('remote/project');
		await connectStarted.p;
		await picker.select('No workspace');
		await finishConnect.complete();
		await staleSelection;

		assert.deepStrictEqual({
			isQuickChat: model.isQuickChat,
			folderUri: model.folderUri,
			pickerFolderUri: picker.selectedFolderUri?.toString(),
		}, {
			isQuickChat: true,
			folderUri: undefined,
			pickerFolderUri: localFolder.toString(),
		});
	});

	test('browsing to a folder exits No workspace mode', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const fallbackProvider = createMockProvider('fallback');
		const localProvider = { ...createMockProvider('local-1'), supportsLocalWorkspaces: true };
		const producingProvider = { ...createMockProvider('local-agent-host'), supportsLocalWorkspaces: true };
		const browsedFolder = URI.file('/agent-host/browsed');
		providersService.setProviders([fallbackProvider, localProvider, producingProvider]);
		const trustRequests: Array<{ folderUri: string; providerId: string | undefined }> = [];
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			TestAutomationsWorkspacePicker,
			{ showOpenDialog: async () => [browsedFolder] },
			undefined,
			undefined,
			{
				canSelectWorkspace: async (folderUri, providerId) => {
					trustRequests.push({ folderUri: folderUri.toString(), providerId });
					return true;
				},
			},
		) as TestAutomationsWorkspacePicker;
		const model = new AutomationIsolationModel({
			isQuickChat: true,
			folderUri: undefined,
			isolationMode: undefined,
			branch: undefined,
		});
		picker.setTargetModel(model);

		await picker.select('Select...');

		assert.deepStrictEqual({
			isQuickChat: model.isQuickChat,
			folderUri: model.folderUri?.toString(),
			pickerFolderUri: picker.selectedFolderUri?.toString(),
			trustRequests,
		}, {
			isQuickChat: false,
			folderUri: browsedFolder.toString(),
			pickerFolderUri: browsedFolder.toString(),
			trustRequests: [{ folderUri: browsedFolder.toString(), providerId: producingProvider.id }],
		});
	});

	test('stays in No workspace mode when trust is declined for a browsed folder', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const provider = { ...createMockProvider('local-1'), supportsLocalWorkspaces: true };
		const browsedFolder = URI.file('/local/browsed');
		providersService.setProviders([provider]);
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			TestAutomationsWorkspacePicker,
			{ showOpenDialog: async () => [browsedFolder] },
			undefined,
			undefined,
			{ canSelectWorkspace: async () => false },
		) as TestAutomationsWorkspacePicker;
		const model = new AutomationIsolationModel({
			isQuickChat: true,
			folderUri: undefined,
			isolationMode: undefined,
			branch: undefined,
		});
		picker.setTargetModel(model);

		await picker.select('Select...');

		assert.deepStrictEqual({
			isQuickChat: model.isQuickChat,
			folderUri: model.folderUri,
			pickerFolderUri: picker.selectedFolderUri,
		}, {
			isQuickChat: true,
			folderUri: undefined,
			pickerFolderUri: undefined,
		});
	});

	test('a stale browse result does not request trust after a newer choice', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const provider = { ...createMockProvider('local-1'), supportsLocalWorkspaces: true };
		const browsedFolder = URI.file('/local/browsed');
		const browseResult = new DeferredPromise<URI[] | undefined>();
		providersService.setProviders([provider]);
		let trustRequestCount = 0;
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			TestAutomationsWorkspacePicker,
			{ showOpenDialog: () => browseResult.p },
			undefined,
			undefined,
			{
				canSelectWorkspace: async () => {
					trustRequestCount++;
					return true;
				},
			},
		) as TestAutomationsWorkspacePicker;
		const model = new AutomationIsolationModel({
			isQuickChat: true,
			folderUri: undefined,
			isolationMode: undefined,
			branch: undefined,
		});
		picker.setTargetModel(model);

		const staleSelection = picker.select('Select...');
		await picker.select('No workspace');
		await browseResult.complete([browsedFolder]);
		await staleSelection;

		assert.deepStrictEqual({
			isQuickChat: model.isQuickChat,
			folderUri: model.folderUri,
			pickerFolderUri: picker.selectedFolderUri,
			trustRequestCount,
		}, {
			isQuickChat: true,
			folderUri: undefined,
			pickerFolderUri: undefined,
			trustRequestCount: 0,
		});
	});

	test('No workspace is represented as a checked mobile sheet row', () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			TestAutomationsWorkspacePicker,
		) as TestAutomationsWorkspacePicker;
		const model = new AutomationIsolationModel({
			isQuickChat: true,
			folderUri: undefined,
			isolationMode: undefined,
			branch: undefined,
		});
		picker.setTargetModel(model);

		const rows = buildMobileWorkspacePickerRows(picker.getItems(), () => { });

		assert.deepStrictEqual(rows.map(row => row.sheetItem), [{
			id: 'item:0',
			label: 'No workspace',
			description: 'Run without a backing workspace',
			icon: Codicon.commentDiscussion,
			checked: true,
			disabled: undefined,
			sectionTitle: undefined,
		}]);
	});

	test('mobile workspace header action dispatches browsing after the sheet closes', async () => {
		const workbench = document.createElement('div');
		document.body.append(workbench);
		disposables.add({ dispose: () => workbench.remove() });
		const trigger = workbench.appendChild(document.createElement('button'));
		const dispatched: IWorkspacePickerItem[] = [];
		const sheet = showMobileWorkspacePickerSheet(
			upcastPartial<IWorkbenchLayoutService>({ mainContainer: workbench }),
			trigger,
			[
				{
					kind: ActionListItemKind.Action,
					label: 'No workspace',
					group: { title: '', icon: Codicon.commentDiscussion },
					item: { run: () => { } },
				},
				{
					kind: ActionListItemKind.Action,
					label: 'Select...',
					group: { title: '', icon: Codicon.folderOpened },
					item: { browseActionIndex: 0 },
				},
			],
			item => dispatched.push(item),
			[makeBrowseAction('local-1', SESSION_WORKSPACE_GROUP_LOCAL, 'Select...')],
		);
		const headerAction = workbench.querySelector<HTMLButtonElement>('.mobile-picker-sheet-header-action');
		assert.ok(headerAction);

		headerAction.click();
		await sheet;

		assert.deepStrictEqual(dispatched, [{ browseActionIndex: 0 }]);
	});
});

// ---- Tab discovery ----------------------------------------------------------

/** Minimal subclass that exposes the protected `_getAvailableTabs` for testing. */
class TestablePicker extends WorkspacePicker {
	getAvailableTabs(): string[] {
		return this._getAvailableTabs().map(t => t.id);
	}

	selectWorkspaceGroup(group: string): void {
		this._selectWorkspaceGroup(group);
	}

	getItems() {
		return this._buildItems();
	}

	getItemLabels(): string[] {
		return this.getItems().flatMap(entry => entry.label ? [entry.label] : []);
	}

	async select(label: string): Promise<void> {
		const entry = this.getItems().find(candidate => candidate.label === label);
		assert.ok(entry?.item, `Expected picker item '${label}'`);
		await this._dispatchPickerItem(entry.item);
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

function createTestablePicker(
	disposables: DisposableStore,
	providersService: MockSessionsProvidersService,
	remoteAgentHostsEnabled = true,
	options: IWorkspacePickerOptions = {},
	commandService: Partial<ICommandService> = { executeCommand: async () => { } },
	storageService: IStorageService = disposables.add(new TestStorageService()),
): TestablePicker {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => { }, show: () => { } });
	instantiationService.stub(IContextViewService, { showContextView: () => ({ close: () => { } }), hideContextView: () => { }, layout: () => { } });
	instantiationService.stub(IStorageService, storageService);
	instantiationService.stub(IUriIdentityService, { extUri });
	instantiationService.stub(ISessionsProvidersService, providersService);
	instantiationService.stub(IRemoteAgentHostService, {});
	instantiationService.stub(IQuickInputService, {});
	instantiationService.stub(IClipboardService, {});
	instantiationService.stub(IPreferencesService, {});
	instantiationService.stub(IOutputService, {});
	instantiationService.stub(IConfigurationService, new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: remoteAgentHostsEnabled }));
	instantiationService.stub(ICommandService, commandService);
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IFileService, upcastPartial<IFileService>({
		onDidChangeFileSystemProviderRegistrations: Event.None,
		hasProvider: () => true,
		exists: async () => true,
	}));
	instantiationService.stub(IContextKeyService, new MockContextKeyService());
	instantiationService.stub(IMenuService, {
		createMenu: () => ({ onDidChange: Event.None, getActions: () => [], dispose: () => { } }),
		getMenuActions: () => [],
	});
	instantiationService.stub(INotificationService, new TestNotificationService());
	instantiationService.stub(IWorkspacesService, {
		getRecentlyOpened: async () => ({ workspaces: [], files: [] }),
		onDidChangeRecentlyOpened: Event.None,
	});
	instantiationService.stub(ISessionsRecentWorkspacesService, disposables.add(instantiationService.createInstance(SessionsRecentWorkspacesService)));
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	return disposables.add(instantiationService.createInstance(TestablePicker, options));
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

	test('hides Remote group when remote agent hosts are disabled', () => {
		providersService.setProviders([
			createMockProvider('p1', { browseActions: [makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_REMOTE)] }),
		]);
		const picker = createTestablePicker(disposables, providersService, false);
		assert.deepStrictEqual(picker.getAvailableTabs(), []);
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

	test('shows a sign-in action in the GitHub group', async () => {
		const executedCommands: string[] = [];
		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [{ uri: URI.file('/recent-repository'), providerId: 'p1', checked: true }]);
		const baseProvider = createMockProvider('p1', { browseActions: [makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_GITHUB)] });
		providersService.setProviders([
			{
				...baseProvider,
				resolveWorkspace: uri => {
					const workspace = baseProvider.resolveWorkspace(uri);
					return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_GITHUB } : undefined;
				},
			},
		]);
		const picker = createTestablePicker(disposables, providersService, false, {
			restoreFromSessions: false,
			getWorkspaceGroupAction: group => group === SESSION_WORKSPACE_GROUP_GITHUB ? {
				label: 'Sign in to GitHub',
				icon: Codicon.signIn,
				commandId: AGENTIC_SIGN_IN_COMMAND_ID,
				hideWorkspaceItems: true,
			} : undefined,
		}, {
			executeCommand: async commandId => {
				executedCommands.push(commandId);
			},
		}, storage);
		picker.selectWorkspaceGroup(SESSION_WORKSPACE_GROUP_GITHUB);
		await picker.select('Sign in to GitHub');
		assert.deepStrictEqual({
			tabs: picker.getAvailableTabs(),
			itemLabels: picker.getItemLabels(),
			executedCommands,
		}, {
			tabs: [SESSION_WORKSPACE_GROUP_GITHUB],
			itemLabels: ['Sign in to GitHub'],
			executedCommands: [AGENTIC_SIGN_IN_COMMAND_ID],
		});
	});

	test('discovers groups from recent workspaces does not add extra tabs', () => {
		const provider: ISessionsProvider = {
			...createMockProvider('p1'),
			resolveWorkspace: (uri: URI): ISessionWorkspace => ({
				uri,
				label: uri.path,
				icon: Codicon.folder,
				group: 'Cloud',
				folders: [{
					root: uri,
					workingDirectory: uri,
					name: uri.path,
					description: undefined,
					gitRepository: { uri, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
				}],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
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
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true }));
		instantiationService.stub(ICommandService, { executeCommand: async () => { } });
		instantiationService.stub(IFileDialogService, {});
		instantiationService.stub(IFileService, upcastPartial<IFileService>({
			onDidChangeFileSystemProviderRegistrations: Event.None,
			hasProvider: () => true,
			exists: async () => true,
		}));
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IMenuService, { createMenu: () => ({ onDidChange: Event.None, getActions: () => [], dispose: () => { } }) });
		instantiationService.stub(IWorkspacesService, {
			getRecentlyOpened: async () => ({ workspaces: [], files: [] }),
			onDidChangeRecentlyOpened: Event.None,
		});
		instantiationService.stub(ISessionsRecentWorkspacesService, disposables.add(instantiationService.createInstance(SessionsRecentWorkspacesService)));
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		const picker = disposables.add(instantiationService.createInstance(TestablePicker, {}));
		// Recent workspace group ('Cloud') is not added as a tab — only
		// browse actions and the always-present Remote group contribute tabs.
		assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_REMOTE]);
	});
});
