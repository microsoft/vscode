/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SubmenuAction } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { RemoteAgentHostConnectionStatus, IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TUNNEL_ADDRESS_PREFIX } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
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
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISession, ISessionWorkspace, ISessionWorkspaceBrowseAction, SessionStatus, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../../services/sessions/common/session.js';
import { IWorkspacePickerItem, IWorkspacePickerOptions, WorkspacePicker } from '../../browser/sessionWorkspacePicker.js';
import { UNIFIED_WORKSPACE_PICKER_SETTING } from '../../common/constants.js';
import { WebWorkspacePicker } from '../../browser/webWorkspacePicker.js';
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
import { IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { INotification, INotificationHandle, INotificationService, NoOpNotification, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { AGENTIC_SIGN_IN_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { IChatRequestVariableEntry, toPasteVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { getAdditionalFolderContextId, getAdditionalRepositoryContextId } from '../../common/newChatContextIds.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';

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

	registerProvider(provider: ISessionsProvider): IDisposable {
		this.setProviders([...this._providers, provider]);
		return toDisposable(() => this.setProviders(this._providers.filter(p => p !== provider)));
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

	setDirectFilter(group: string | undefined, attachesContext?: boolean): void {
		this._setDirectPickerFilter(group, attachesContext);
	}

	selectTab(group: string): void {
		this._selectWorkspaceGroup(group);
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
	actionWidgetService?: IActionWidgetService,
	dialogService: IDialogService = new TestDialogService(),
): WorkspacePicker {
	const instantiationService = disposables.add(new TestInstantiationService());
	const storage = storageService ?? disposables.add(new TestStorageService());

	instantiationService.stub(IActionWidgetService, actionWidgetService ?? upcastPartial<IActionWidgetService>({ isVisible: false, hide: () => { }, show: () => { } }));
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
	instantiationService.stub(IDialogService, dialogService);
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
	instantiationService.stub(IHoverService, NullHoverService);

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

	test('shows active session counts for remote providers', () => {
		const createSession = (status: SessionStatus, isArchived = false): ISession => upcastPartial<ISession>({
			status: constObservable(status),
			isArchived: constObservable(isArchived),
		});
		const connected = () => observableValue<RemoteAgentHostConnectionStatus>('status', RemoteAgentHostConnectionStatus.connected);
		const tunnelWithOneSession = createMockProvider('agenthost-tunnel-one', {
			connectionStatus: connected(),
			remoteAddress: `${TUNNEL_ADDRESS_PREFIX}one`,
			getSessions: () => [createSession(SessionStatus.InProgress)],
		});
		const tunnelWithTwoSessions = createMockProvider('agenthost-tunnel-two', {
			connectionStatus: connected(),
			remoteAddress: `${TUNNEL_ADDRESS_PREFIX}two`,
			getSessions: () => [
				createSession(SessionStatus.InProgress),
				createSession(SessionStatus.NeedsInput),
				createSession(SessionStatus.Completed),
				createSession(SessionStatus.InProgress, true),
			],
		});
		const tunnelWithoutActiveSessions = createMockProvider('agenthost-tunnel-idle', {
			connectionStatus: connected(),
			remoteAddress: `${TUNNEL_ADDRESS_PREFIX}idle`,
			getSessions: () => [createSession(SessionStatus.Completed)],
		});
		const sshWithActiveSession = createMockProvider('agenthost-ssh', {
			connectionStatus: connected(),
			remoteAddress: 'ssh:host',
			getSessions: () => [createSession(SessionStatus.InProgress)],
		});
		const wslWithActiveSessions = createMockProvider('agenthost-wsl', {
			connectionStatus: connected(),
			remoteAddress: 'wsl:Ubuntu',
			getSessions: () => [
				createSession(SessionStatus.InProgress),
				createSession(SessionStatus.NeedsInput),
			],
		});
		providersService.setProviders([tunnelWithOneSession, tunnelWithTwoSessions, tunnelWithoutActiveSessions, sshWithActiveSession, wslWithActiveSessions]);
		const tabbedPicker = createTestablePicker(disposables, providersService, true, { restoreFromSessions: false });
		tabbedPicker.selectTab(SESSION_WORKSPACE_GROUP_REMOTE);
		const unifiedPicker = createTestablePicker(disposables, providersService, true, { restoreFromSessions: false }, undefined, undefined, true);
		const getRemoteItems = (picker: TestablePicker) => picker.getItems()
			.filter(item => item.label?.startsWith('Provider agenthost-'))
			.map(item => ({ label: item.label, description: item.description, ariaLabel: item.item?.ariaLabel }));
		const unifiedRemoteItem = unifiedPicker.getItems().find(item => item.label === 'Remote');
		const unifiedRemoteActions = unifiedRemoteItem?.submenuActions?.[0];

		assert.deepStrictEqual({
			tabbed: getRemoteItems(tabbedPicker),
			unifiedTopLevel: getRemoteItems(unifiedPicker),
			unifiedSubmenu: unifiedRemoteActions instanceof SubmenuAction
				? unifiedRemoteActions.actions.map(action => ({
					label: action.label,
					icon: (action as { icon?: ThemeIcon }).icon?.id,
				}))
				: undefined,
		}, {
			tabbed: [
				{ label: 'Provider agenthost-tunnel-one', description: 'Online · 1 active session', ariaLabel: 'Provider agenthost-tunnel-one, Online · 1 active session' },
				{ label: 'Provider agenthost-tunnel-two', description: 'Online · 2 active sessions', ariaLabel: 'Provider agenthost-tunnel-two, Online · 2 active sessions' },
				{ label: 'Provider agenthost-tunnel-idle', description: 'Online', ariaLabel: 'Provider agenthost-tunnel-idle, Online' },
				{ label: 'Provider agenthost-ssh', description: 'Online · 1 active session', ariaLabel: 'Provider agenthost-ssh, Online · 1 active session' },
				{ label: 'Provider agenthost-wsl', description: 'Online · 2 active sessions', ariaLabel: 'Provider agenthost-wsl, Online · 2 active sessions' },
			],
			unifiedTopLevel: [],
			unifiedSubmenu: [
				{ label: 'Provider agenthost-tunnel-one', icon: Codicon.cloud.id },
				{ label: 'Provider agenthost-tunnel-two', icon: Codicon.cloud.id },
				{ label: 'Provider agenthost-tunnel-idle', icon: Codicon.cloud.id },
				{ label: 'Provider agenthost-ssh', icon: Codicon.remote.id },
				{ label: 'Provider agenthost-wsl', icon: Codicon.remote.id },
			],
		});
	});

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

	test('collapses a worktree recent onto its existing parent repository', async () => {
		const provider = createMockProvider('provider');
		providersService.setProviders([provider]);
		const worktreeUri = URI.file('/code/vscode.worktrees/feature');
		const repositoryUri = URI.file('/code/vscode');
		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: worktreeUri, providerId: 'provider', checked: false },
			{ uri: repositoryUri, providerId: 'provider', checked: false },
		]);
		const workspacesService = {
			getRecentlyOpened: async () => ({ workspaces: [], files: [] }),
			onDidChangeRecentlyOpened: Event.None,
		} as unknown as IWorkspacesService;
		const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);

		assert.deepStrictEqual({
			legacy: recentWorkspacesService.getRecentWorkspaces().map(recent => recent.workspace.uri.toString()),
			unified: recentWorkspacesService.getRecentWorkspaces(true, true).map(recent => recent.workspace.uri.toString()),
		}, {
			legacy: [worktreeUri, repositoryUri].map(uri => uri.toString()),
			unified: [repositoryUri.toString()],
		});
	});

	test('removing a collapsed repository recent also removes its worktree aliases', async () => {
		const provider = createMockProvider('provider');
		providersService.setProviders([provider]);
		const worktreeUri = URI.file('/code/vscode.worktrees/feature');
		const repositoryUri = URI.file('/code/vscode');
		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [
			{ uri: worktreeUri, providerId: 'provider', checked: false },
			{ uri: repositoryUri, providerId: 'provider', checked: false },
		]);
		const removed: string[] = [];
		const workspacesService = {
			getRecentlyOpened: async () => ({ workspaces: [], files: [] }),
			onDidChangeRecentlyOpened: Event.None,
			removeRecentlyOpened: (uris: URI[]) => removed.push(...uris.map(uri => uri.toString())),
		} as unknown as IWorkspacesService;
		const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);

		recentWorkspacesService.removeRecentWorkspace(repositoryUri, true);

		assert.deepStrictEqual({
			recents: recentWorkspacesService.getRecentWorkspaces(true, true).map(recent => recent.workspace.uri.toString()),
			removed,
		}, {
			recents: [],
			removed: [repositoryUri.toString()],
		});
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

suite('WorkspacePicker - Path validation', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const alreadySelected of [false, true]) {
		test(`rejects and removes a missing local directory ${alreadySelected ? 'that is already selected' : 'before changing selection'}`, async () => {
			const providersService = disposables.add(new MockSessionsProvidersService());
			const provider = createMockProvider('local-1');
			providersService.setProviders([provider]);
			const existingFolder = URI.file('/local/existing');
			const missingFolder = URI.file('/local/missing');
			const storage = disposables.add(new TestStorageService());
			seedStorage(storage, [
				{ uri: existingFolder, providerId: provider.id, checked: true },
				{ uri: missingFolder, providerId: provider.id, checked: false },
			]);
			const removed: string[] = [];
			const workspacesService = upcastPartial<IWorkspacesService>({
				getRecentlyOpened: async () => ({ workspaces: [], files: [] }),
				onDidChangeRecentlyOpened: Event.None,
				removeRecentlyOpened: async folders => { removed.push(...folders.map(folder => folder.toString())); },
			});
			const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);
			const dialogs: { message: string; detail?: string }[] = [];
			const trustRequests: string[] = [];
			const picker = createTestPicker(
				disposables, providersService, storage, undefined, DispatchingWorkspacePicker, {}, workspacesService, recentWorkspacesService,
				{ canSelectWorkspace: async folder => { trustRequests.push(folder.toString()); return true; } },
				upcastPartial<IFileService>({
					onDidChangeFileSystemProviderRegistrations: Event.None,
					hasProvider: () => true,
					exists: async folder => !extUri.isEqual(folder, missingFolder),
				}),
				undefined,
				upcastPartial<IDialogService>({ info: async (message, detail) => { dialogs.push({ message, detail }); } }),
			) as DispatchingWorkspacePicker;
			picker.setSelectedWorkspace(alreadySelected ? missingFolder : existingFolder);

			const selected = await picker.dispatchFolder(missingFolder, provider.id);

			assert.deepStrictEqual({
				selected,
				selectedFolder: picker.selectedFolderUri?.toString(),
				recents: recentWorkspacesService.getRecentWorkspaces().map(recent => recent.workspace.uri.toString()),
				removed,
				dialogs,
				trustRequests,
			}, {
				selected: false,
				selectedFolder: alreadySelected ? undefined : existingFolder.toString(),
				recents: [existingFolder.toString()],
				removed: [missingFolder.toString()],
				dialogs: [{ message: 'Path does not exist', detail: `The path '${missingFolder.fsPath}' does not exist on this computer.` }],
				trustRequests: [],
			});
		});
	}

	test('does not check remote or virtual workspaces against the local filesystem', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const provider = createMockProvider('provider');
		providersService.setProviders([provider]);
		const checkedFolders: string[] = [];
		const picker = createTestPicker(
			disposables, providersService, undefined, undefined, DispatchingWorkspacePicker, {}, undefined, undefined,
			{ restoreFromSessions: false },
			upcastPartial<IFileService>({
				onDidChangeFileSystemProviderRegistrations: Event.None,
				hasProvider: () => true,
				exists: async folder => { checkedFolders.push(folder.toString()); return false; },
			}),
		) as DispatchingWorkspacePicker;
		const folders = [URI.parse('vscode-remote://ssh-remote+host/project'), URI.parse('github-remote://owner/repository')];
		const selections: boolean[] = [];
		for (const folder of folders) {
			selections.push(await picker.dispatchFolder(folder, provider.id));
		}

		assert.deepStrictEqual({ selections, checkedFolders, selectedFolder: picker.selectedFolderUri?.toString() }, {
			selections: [true, true],
			checkedFolders: [],
			selectedFolder: folders[1].toString(),
		});
	});

	test('ignores a missing directory result after a newer workspace selection', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const provider = createMockProvider('local-1');
		providersService.setProviders([provider]);
		const missingFolder = URI.file('/local/missing');
		const existingFolder = URI.file('/local/existing');
		const exists = new DeferredPromise<boolean>();
		const checking = new DeferredPromise<void>();
		const dialogs: string[] = [];
		const trustRequests: string[] = [];
		const picker = createTestPicker(
			disposables, providersService, undefined, undefined, DispatchingWorkspacePicker, {}, undefined, undefined,
			{ restoreFromSessions: false, canSelectWorkspace: async folder => { trustRequests.push(folder.toString()); return true; } },
			upcastPartial<IFileService>({
				onDidChangeFileSystemProviderRegistrations: Event.None,
				hasProvider: () => true,
				exists: async folder => {
					if (extUri.isEqual(folder, missingFolder)) {
						void checking.complete();
						return exists.p;
					}
					return true;
				},
			}),
			undefined,
			upcastPartial<IDialogService>({ info: async message => { dialogs.push(message); } }),
		) as DispatchingWorkspacePicker;

		const staleSelection = picker.dispatchFolder(missingFolder, provider.id);
		await checking.p;
		const selected = await picker.dispatchFolder(existingFolder, provider.id);
		await exists.complete(false);

		assert.deepStrictEqual({
			staleSelected: await staleSelection,
			selected,
			selectedFolder: picker.selectedFolderUri?.toString(),
			dialogs,
			trustRequests,
		}, {
			staleSelected: false,
			selected: true,
			selectedFolder: existingFolder.toString(),
			dialogs: [],
			trustRequests: [existingFolder.toString()],
		});
	});
});

suite('WorkspacePicker - Category Triggers', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('renders the selected workspace in its category and hides only configured setup categories', () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const baseProvider = createMockProvider('local-1', {
			browseActions: [{
				label: 'GitHub',
				group: SESSION_WORKSPACE_GROUP_GITHUB,
				icon: Codicon.github,
				providerId: 'local-1',
				run: async () => undefined,
			}],
		});
		const provider: ISessionsProvider = {
			...baseProvider,
			resolveWorkspace: uri => {
				const workspace = baseProvider.resolveWorkspace(uri);
				return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_LOCAL } : undefined;
			},
		};
		providersService.setProviders([provider]);
		const folderUri = URI.file('/local/project');
		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [{ uri: folderUri, providerId: provider.id, checked: true }]);
		const picker = createTestPicker(disposables, providersService, storage);
		const container = document.createElement('div');

		picker.renderCategoryTriggers(container, [
			{ label: 'Folder', ariaLabel: 'Choose a folder', icon: Codicon.folder, group: SESSION_WORKSPACE_GROUP_LOCAL },
			{ label: 'Repo, Issue, or PR', ariaLabel: 'Choose a GitHub target', icon: Codicon.github, group: SESSION_WORKSPACE_GROUP_GITHUB },
			{ label: 'Remote Setup', ariaLabel: 'Choose a remote setup', icon: Codicon.radioTower, group: SESSION_WORKSPACE_GROUP_REMOTE, hideWhenWorkspaceSelected: true },
			{ ariaLabel: 'More workspace options', icon: Codicon.ellipsis },
		]);

		assert.deepStrictEqual({
			selectedFolderUri: picker.selectedFolderUri?.toString(),
			triggers: Array.from(container.querySelectorAll<HTMLElement>('.action-label')).map(trigger => ({
				label: trigger.querySelector('.sessions-chat-dropdown-label')?.textContent,
				ariaLabel: trigger.getAttribute('aria-label'),
				hidden: trigger.parentElement?.hidden,
				hasPopup: trigger.getAttribute('aria-haspopup'),
				expanded: trigger.getAttribute('aria-expanded'),
				role: trigger.getAttribute('role'),
				tabIndex: trigger.tabIndex,
				icons: Array.from(trigger.querySelectorAll<HTMLElement>('.codicon'), icon => icon.classList.item(1)),
			})),
		}, {
			selectedFolderUri: folderUri.toString(),
			triggers: [
				{ label: 'local/project', ariaLabel: 'Folder: local/project', hidden: false, hasPopup: 'listbox', expanded: 'false', role: 'button', tabIndex: 0, icons: ['codicon-folder', 'codicon-chevron-down-compact'] },
				{ label: 'Repo, Issue, or PR', ariaLabel: 'Choose a GitHub target', hidden: false, hasPopup: 'listbox', expanded: 'false', role: 'button', tabIndex: 0, icons: ['codicon-github', 'codicon-chevron-down-compact'] },
				{ label: 'Remote Setup', ariaLabel: 'Choose a remote setup', hidden: true, hasPopup: 'listbox', expanded: 'false', role: 'button', tabIndex: 0, icons: ['codicon-radio-tower', 'codicon-chevron-down-compact'] },
				{ label: undefined, ariaLabel: 'More workspace options', hidden: false, hasPopup: 'listbox', expanded: 'false', role: 'button', tabIndex: 0, icons: ['codicon-ellipsis', 'codicon-chevron-down-compact'] },
			],
		});
	});

	test('updates category icon and label nodes in place when a workspace is selected', () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const baseProvider = createMockProvider('local-1');
		const gitHubInfo = observableValue<{ owner: string; repo: string } | undefined>('gitHubInfo', undefined);
		providersService.setProviders([{
			...baseProvider,
			supportsLocalWorkspaces: true,
			resolveWorkspace: uri => {
				const workspace = baseProvider.resolveWorkspace(uri);
				return workspace ? {
					...workspace,
					group: SESSION_WORKSPACE_GROUP_LOCAL,
					folders: workspace.folders.map(folder => ({
						...folder,
						gitRepository: {
							uri,
							workTreeUri: uri,
							baseBranchName: 'main',
							gitHubInfo,
						},
					})),
				} : undefined;
			},
		}]);
		const picker = createTestPicker(disposables, providersService);
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [
			{ label: 'Folder', ariaLabel: 'Choose a folder', icon: Codicon.add, group: SESSION_WORKSPACE_GROUP_LOCAL },
			{ label: 'Repository', ariaLabel: 'Choose a repository', icon: Codicon.add, group: SESSION_WORKSPACE_GROUP_GITHUB, attachesContext: false },
			{ label: 'Issue/PR', ariaLabel: 'Choose an issue or pull request', icon: Codicon.add, group: SESSION_WORKSPACE_GROUP_GITHUB, attachesContext: true, hideWhenNoGitHubRepository: true },
			{ label: 'Remote Setup', ariaLabel: 'Choose a remote setup', icon: Codicon.add, group: SESSION_WORKSPACE_GROUP_REMOTE, hideWhenWorkspaceSelected: true },
		]);
		const folderTrigger = container.querySelector<HTMLElement>('[aria-label="Choose a folder"]');
		const repositoryTrigger = container.querySelector<HTMLElement>('[aria-label="Choose a repository"]');
		const iconBefore = folderTrigger?.querySelector('.codicon');
		const labelBefore = folderTrigger?.querySelector('.sessions-chat-dropdown-label');

		picker.setSelectedWorkspace(URI.file('/local/project'), { fireEvent: false, persist: false });
		const repositoryLabelBeforeMetadata = container.querySelector<HTMLElement>('[aria-label="Choose a repository"] .sessions-chat-dropdown-label')?.textContent;
		gitHubInfo.set({ owner: 'microsoft', repo: 'vscode' }, undefined);

		assert.deepStrictEqual({
			sameIconNode: folderTrigger?.querySelector('.codicon') === iconBefore,
			sameLabelNode: folderTrigger?.querySelector('.sessions-chat-dropdown-label') === labelBefore,
			iconClass: iconBefore?.className,
			label: labelBefore?.textContent,
			repositoryLabelBeforeMetadata,
			repositoryLabel: repositoryTrigger?.querySelector<HTMLElement>('.sessions-chat-dropdown-label')?.textContent,
			repositoryAriaLabel: repositoryTrigger?.getAttribute('aria-label'),
			contextLabel: container.querySelector<HTMLElement>('[aria-label="Choose an issue or pull request"] .sessions-chat-dropdown-label')?.textContent,
			contextHidden: container.querySelector<HTMLElement>('[aria-label="Choose an issue or pull request"]')?.parentElement?.hidden,
			remoteHidden: container.querySelector<HTMLElement>('[aria-label="Choose a remote setup"]')?.parentElement?.hidden,
		}, {
			sameIconNode: true,
			sameLabelNode: true,
			iconClass: 'codicon codicon-folder',
			label: 'local/project',
			repositoryLabelBeforeMetadata: 'Repository',
			repositoryLabel: 'microsoft/vscode',
			repositoryAriaLabel: 'Repository: microsoft/vscode',
			contextLabel: 'Issue/PR',
			contextHidden: false,
			remoteHidden: true,
		});
	});

	test('unified workspace trigger reflects the selected local or remote workspace', () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const localProvider = createMockProvider('local-1');
		const remoteProvider = createMockProvider('remote-1');
		providersService.setProviders([
			{
				...localProvider,
				resolveWorkspace: uri => uri.scheme === 'file'
					? { ...localProvider.resolveWorkspace(uri)!, group: SESSION_WORKSPACE_GROUP_LOCAL, icon: Codicon.folder }
					: undefined,
			},
			{
				...remoteProvider,
				resolveWorkspace: uri => uri.scheme === 'vscode-remote'
					? { ...remoteProvider.resolveWorkspace(uri)!, group: SESSION_WORKSPACE_GROUP_REMOTE, icon: Codicon.remote }
					: undefined,
			},
		]);
		const picker = createTestPicker(disposables, providersService);
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [{
			label: 'Workspace',
			ariaLabel: 'Choose a workspace',
			icon: Codicon.project,
			reflectsWorkspace: true,
		}]);
		const trigger = container.querySelector<HTMLElement>('.action-label');
		const icon = trigger?.querySelector<HTMLElement>('.codicon');
		const label = trigger?.querySelector<HTMLElement>('.sessions-chat-dropdown-label');

		const snapshots = [{
			icon: icon?.className,
			label: label?.textContent,
			ariaLabel: trigger?.getAttribute('aria-label'),
		}];
		picker.setSelectedWorkspace(URI.file('/local/project'), { fireEvent: false, persist: false });
		snapshots.push({
			icon: icon?.className,
			label: label?.textContent,
			ariaLabel: trigger?.getAttribute('aria-label'),
		});
		picker.setSelectedWorkspace(URI.parse('vscode-remote://ssh-remote+host/home/project'), { fireEvent: false, persist: false });
		snapshots.push({
			icon: icon?.className,
			label: label?.textContent,
			ariaLabel: trigger?.getAttribute('aria-label'),
		});

		assert.deepStrictEqual(snapshots, [
			{ icon: 'codicon codicon-project', label: 'Workspace', ariaLabel: 'Choose a workspace' },
			{ icon: 'codicon codicon-folder', label: 'local/project', ariaLabel: 'Workspace: local/project' },
			{ icon: 'codicon codicon-remote', label: 'home/project', ariaLabel: 'Workspace: home/project' },
		]);
	});

	test('keeps the selected remote workspace visible in the remote trigger', () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const baseProvider = createMockProvider('agenthost-remote-1', {
			connectionStatus: observableValue('status', RemoteAgentHostConnectionStatus.connected),
		});
		providersService.setProviders([{
			...baseProvider,
			resolveWorkspace: uri => {
				const workspace = baseProvider.resolveWorkspace(uri);
				return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_REMOTE } : undefined;
			},
		}]);
		const picker = createTestPicker(disposables, providersService);
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [
			{ label: 'Folder', ariaLabel: 'Choose a folder', icon: Codicon.folder, group: SESSION_WORKSPACE_GROUP_LOCAL },
			{ label: 'Remote Setup', ariaLabel: 'Choose a remote setup', icon: Codicon.radioTower, group: SESSION_WORKSPACE_GROUP_REMOTE, hideWhenWorkspaceSelected: true },
		]);

		picker.setSelectedWorkspace(URI.file('/remote/project'), { fireEvent: false, persist: false });

		assert.deepStrictEqual(Array.from(container.querySelectorAll<HTMLElement>('.action-label')).map(trigger => ({
			label: trigger.querySelector('.sessions-chat-dropdown-label')?.textContent,
			hidden: trigger.parentElement?.hidden,
		})), [
			{ label: 'Folder', hidden: false },
			{ label: 'remote/project', hidden: false },
		]);
	});

	test('uses repository metadata from another provider for the selected execution folder', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const executionProvider = createMockProvider('local-agent-host');
		const metadataProvider = createMockProvider('metadata-provider');
		const repositoryProvider = createMockProvider('repository-provider', {
			browseActions: [{
				label: 'Repository...',
				group: SESSION_WORKSPACE_GROUP_GITHUB,
				icon: Codicon.repo,
				providerId: 'repository-provider',
				attachesContext: false,
				run: async () => {
					const root = URI.parse('vscode-vfs://github/microsoft/vscode/HEAD');
					return {
						uri: root,
						label: 'microsoft/vscode',
						icon: Codicon.repo,
						group: SESSION_WORKSPACE_GROUP_GITHUB,
						folders: [{
							root,
							workingDirectory: root,
							name: 'vscode',
							description: undefined,
							gitRepository: undefined,
						}],
						requiresWorkspaceTrust: false,
						isVirtualWorkspace: true,
					};
				},
			}],
		});
		const gitHubInfo = observableValue<{ owner: string; repo: string } | undefined>('gitHubInfo', undefined);
		providersService.setProviders([
			{
				...executionProvider,
				resolveWorkspace: uri => {
					const workspace = executionProvider.resolveWorkspace(uri);
					return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_LOCAL } : undefined;
				},
			},
			{
				...metadataProvider,
				resolveWorkspace: uri => {
					const workspace = metadataProvider.resolveWorkspace(uri);
					return workspace ? {
						...workspace,
						group: SESSION_WORKSPACE_GROUP_LOCAL,
						folders: workspace.folders.map(folder => ({
							...folder,
							gitRepository: {
								uri,
								workTreeUri: uri,
								baseBranchName: 'main',
								gitHubInfo,
							},
						})),
					} : undefined;
				},
			},
			repositoryProvider,
		]);
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			DispatchingWorkspacePicker,
		) as DispatchingWorkspacePicker;
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [
			{ label: 'Folder', ariaLabel: 'Choose a folder', icon: Codicon.add, group: SESSION_WORKSPACE_GROUP_LOCAL },
			{ label: 'Repository', ariaLabel: 'Choose a repository', icon: Codicon.add, group: SESSION_WORKSPACE_GROUP_GITHUB, attachesContext: false },
			{ label: 'Issue/PR', ariaLabel: 'Choose an issue or pull request', icon: Codicon.add, group: SESSION_WORKSPACE_GROUP_GITHUB, attachesContext: true, hideWhenNoGitHubRepository: true },
		]);
		const repositoryTrigger = container.querySelector<HTMLElement>('[aria-label="Choose a repository"]');

		picker.setSelectedWorkspace(URI.file('/agent-host/vscode'), { fireEvent: false, providerId: executionProvider.id, persist: false });
		gitHubInfo.set({ owner: 'microsoft', repo: 'vscode' }, undefined);
		picker.setDirectFilter(SESSION_WORKSPACE_GROUP_GITHUB, false);
		await picker.dispatchItem({ browseActionIndex: 0 });
		picker.setDirectFilter(undefined);

		assert.deepStrictEqual({
			selectedFolder: picker.selectedFolderUri?.toString(),
			repositoryLabel: repositoryTrigger?.querySelector<HTMLElement>('.sessions-chat-dropdown-label')?.textContent,
			contextHidden: container.querySelector<HTMLElement>('[aria-label="Choose an issue or pull request"]')?.parentElement?.hidden,
		}, {
			selectedFolder: URI.file('/agent-host/vscode').toString(),
			repositoryLabel: 'microsoft/vscode',
			contextHidden: false,
		});
	});

	test('hides issue and pull request context until a folder with a GitHub remote is selected', () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const baseProvider = createMockProvider('local-1');
		providersService.setProviders([{
			...baseProvider,
			supportsLocalWorkspaces: true,
			resolveWorkspace: uri => {
				const workspace = baseProvider.resolveWorkspace(uri);
				return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_LOCAL } : undefined;
			},
		}]);
		const picker = createTestPicker(disposables, providersService);
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [{
			label: 'Issue/PR',
			ariaLabel: 'Choose an issue or pull request',
			icon: Codicon.add,
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			attachesContext: true,
			hideWhenNoGitHubRepository: true,
		}]);
		const triggerSlot = container.querySelector<HTMLElement>('[aria-label="Choose an issue or pull request"]')?.parentElement;
		const hiddenStates = [triggerSlot?.hidden];

		picker.setSelectedWorkspace(URI.file('/local/project'), { fireEvent: false, persist: false });
		hiddenStates.push(triggerSlot?.hidden);

		assert.deepStrictEqual(hiddenStates, [true, true]);
	});

	test('selects the first browsed folder as the primary workspace without attaching it', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const baseProvider = createMockProvider('local-1');
		providersService.setProviders([{
			...baseProvider,
			supportsLocalWorkspaces: true,
			resolveWorkspace: uri => {
				const workspace = baseProvider.resolveWorkspace(uri);
				return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_LOCAL } : undefined;
			},
		}]);
		const folder = URI.file('/local/project');
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			DispatchingWorkspacePicker,
			{ showOpenDialog: async () => [folder] },
		) as DispatchingWorkspacePicker;
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [
			{ label: 'Folder', ariaLabel: 'Choose a folder', icon: Codicon.add, group: SESSION_WORKSPACE_GROUP_LOCAL },
			{ label: 'Repository', ariaLabel: 'Choose a repository', icon: Codicon.add, group: SESSION_WORKSPACE_GROUP_GITHUB, attachesContext: false },
		]);
		const workspaceSelections: URI[] = [];
		const folderContexts: URI[] = [];
		disposables.add(picker.onDidSelectWorkspace(uri => uri && workspaceSelections.push(uri)));
		disposables.add(picker.onDidSelectFolderContext(uri => folderContexts.push(uri)));

		picker.setDirectFilter(undefined, false);
		picker.selectTab(SESSION_WORKSPACE_GROUP_LOCAL);
		await picker.dispatchItem({ browseActionIndex: 0 });

		assert.deepStrictEqual({
			selectedFolder: picker.selectedFolderUri?.toString(),
			pills: Array.from(container.querySelectorAll<HTMLElement>('.sessions-chat-dropdown-label')).map(element => element.textContent),
			workspaceSelections: workspaceSelections.map(uri => uri.toString()),
			folderContexts: folderContexts.map(uri => uri.toString()),
		}, {
			selectedFolder: folder.toString(),
			pills: ['local/project', 'Repository'],
			workspaceSelections: [folder.toString()],
			folderContexts: [],
		});
	});

	test('keeps the primary folder and counts later folders attached as context', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const baseProvider = createMockProvider('local-1');
		providersService.setProviders([{
			...baseProvider,
			supportsLocalWorkspaces: true,
			resolveWorkspace: uri => {
				const workspace = baseProvider.resolveWorkspace(uri);
				return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_LOCAL } : undefined;
			},
		}]);
		const primaryFolder = URI.file('/local/primary');
		const additionalFolder = URI.file('/local/additional');
		const otherFolder = URI.file('/local/other');
		let folderToAttach = additionalFolder;
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			DispatchingWorkspacePicker,
			{ showOpenDialog: async () => [folderToAttach] },
		) as DispatchingWorkspacePicker;
		picker.setSelectedWorkspace(primaryFolder, { fireEvent: false, persist: false });
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [{
			label: 'Workspace',
			ariaLabel: 'Choose a workspace',
			icon: Codicon.project,
			reflectsWorkspace: true,
			attachesContext: false,
		}]);
		const folderContexts: URI[] = [];
		const removedContextIds: string[] = [];
		disposables.add(picker.onDidSelectFolderContext(uri => folderContexts.push(uri)));
		disposables.add(picker.onDidRemoveAttachedContext(id => removedContextIds.push(id)));

		picker.setDirectFilter(undefined, false);
		picker.selectTab(SESSION_WORKSPACE_GROUP_LOCAL);
		await picker.dispatchItem({ browseActionIndex: 0, attachAsContext: true });
		folderToAttach = otherFolder;
		picker.setDirectFilter(undefined, false);
		picker.selectTab(SESSION_WORKSPACE_GROUP_LOCAL);
		await picker.dispatchItem({ browseActionIndex: 0, attachAsContext: true });
		const labelsBeforeRemove = Array.from(container.querySelectorAll<HTMLElement>('.sessions-chat-dropdown-label')).map(element => element.textContent);
		const badgeBeforeRemove = container.querySelector<HTMLElement>('.monaco-count-badge')?.textContent;
		const otherAttachment: IChatRequestVariableEntry = {
			kind: 'directory',
			id: getAdditionalFolderContextId(otherFolder),
			name: 'other',
			value: otherFolder,
		};
		picker.syncAttachedContext([otherAttachment]);
		const badgeAfterRemove = container.querySelector<HTMLElement>('.monaco-count-badge')?.textContent;
		const restoredAttachment: IChatRequestVariableEntry = {
			kind: 'directory',
			id: getAdditionalFolderContextId(additionalFolder),
			name: 'additional',
			value: additionalFolder,
		};
		picker.syncAttachedContext([otherAttachment, restoredAttachment]);
		const badgeAfterRestore = container.querySelector<HTMLElement>('.monaco-count-badge')?.textContent;
		picker.setSelectedWorkspace(additionalFolder, { fireEvent: false, persist: false });

		assert.deepStrictEqual({
			selectedFolder: picker.selectedFolderUri?.toString(),
			labelsBeforeRemove,
			labels: Array.from(container.querySelectorAll<HTMLElement>('.sessions-chat-dropdown-label')).map(element => element.textContent),
			badgeBeforeRemove,
			badgeAfterRemove,
			badgeAfterRestore,
			badgeAfterSelectingAttachedFolder: container.querySelector<HTMLElement>('.monaco-count-badge')?.textContent,
			folderContexts: folderContexts.map(uri => uri.toString()),
			additionalFolderUris: picker.additionalFolderUris.map(uri => uri.toString()),
			removedContextIds,
		}, {
			selectedFolder: additionalFolder.toString(),
			labelsBeforeRemove: ['local/primary'],
			labels: ['local/additional'],
			badgeBeforeRemove: '2',
			badgeAfterRemove: '1',
			badgeAfterRestore: '2',
			badgeAfterSelectingAttachedFolder: '1',
			folderContexts: [additionalFolder.toString(), otherFolder.toString()],
			additionalFolderUris: [otherFolder.toString()],
			removedContextIds: [
				getAdditionalFolderContextId(additionalFolder),
			],
		});
	});

	test('restores additional folder context when its provider registers later', () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const picker = createTestPicker(disposables, providersService);
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [
			{ label: 'Folder', ariaLabel: 'Choose a folder', icon: Codicon.add, group: SESSION_WORKSPACE_GROUP_LOCAL },
		]);
		const folder = URI.file('/local/delayed');
		picker.syncAttachedContext([{
			kind: 'directory',
			id: getAdditionalFolderContextId(folder),
			name: 'delayed',
			value: folder,
		}]);
		const beforeProvider = picker.additionalFolderUris.map(uri => uri.toString());
		const baseProvider = createMockProvider('local-1');

		providersService.setProviders([{
			...baseProvider,
			supportsLocalWorkspaces: true,
			resolveWorkspace: uri => {
				const workspace = baseProvider.resolveWorkspace(uri);
				return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_LOCAL } : undefined;
			},
		}]);

		assert.deepStrictEqual({
			beforeProvider,
			afterProvider: picker.additionalFolderUris.map(uri => uri.toString()),
			pills: Array.from(container.querySelectorAll<HTMLElement>('.sessions-chat-dropdown-label')).map(element => element.textContent),
			badge: container.querySelector<HTMLElement>('.monaco-count-badge')?.textContent,
		}, {
			beforeProvider: [],
			afterProvider: [folder.toString()],
			pills: ['Folder'],
			badge: undefined,
		});
	});

	test('routes each category trigger to its workspace group', () => {
		class CapturingWorkspacePicker extends WorkspacePicker {
			readonly opens: Array<{ anchor: HTMLElement | undefined; preferredGroup: string | undefined; attachesContext: boolean | undefined }> = [];

			override showPicker(_force = false, anchor?: HTMLElement, preferredGroup?: string, attachesContext?: boolean): void {
				this.opens.push({ anchor, preferredGroup, attachesContext });
			}
		}

		const providersService = disposables.add(new MockSessionsProvidersService());
		const localProvider = createMockProvider('local-1');
		providersService.setProviders([{
			...localProvider,
			resolveWorkspace: uri => {
				const workspace = localProvider.resolveWorkspace(uri);
				return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_LOCAL } : undefined;
			},
		}]);
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			CapturingWorkspacePicker,
		) as CapturingWorkspacePicker;
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [
			{ label: 'Folder', ariaLabel: 'Choose a folder', icon: Codicon.folder, group: SESSION_WORKSPACE_GROUP_LOCAL },
			{ label: 'Repository', ariaLabel: 'Choose a GitHub repository', icon: Codicon.github, group: SESSION_WORKSPACE_GROUP_GITHUB, attachesContext: false },
			{ label: 'Issue or PR', ariaLabel: 'Choose a GitHub issue or pull request', icon: Codicon.github, group: SESSION_WORKSPACE_GROUP_GITHUB, attachesContext: true },
			{ label: 'Remote Setup', ariaLabel: 'Choose a remote setup', icon: Codicon.radioTower, group: SESSION_WORKSPACE_GROUP_REMOTE },
			{ ariaLabel: 'More workspace options', icon: Codicon.ellipsis },
		]);
		const triggers = Array.from(container.querySelectorAll<HTMLElement>('.action-label'));

		for (const trigger of triggers) {
			trigger.click();
		}
		picker.setSelectedWorkspace(URI.file('/local/project'), { fireEvent: false, persist: false });
		triggers[0].click();

		assert.deepStrictEqual(picker.opens.map(open => ({
			ariaLabel: open.anchor?.getAttribute('aria-label'),
			preferredGroup: open.preferredGroup,
			attachesContext: open.attachesContext,
		})), [
			{ ariaLabel: 'Folder: local/project', preferredGroup: SESSION_WORKSPACE_GROUP_LOCAL, attachesContext: undefined },
			{ ariaLabel: 'Choose a GitHub repository', preferredGroup: SESSION_WORKSPACE_GROUP_GITHUB, attachesContext: false },
			{ ariaLabel: 'Choose a GitHub issue or pull request', preferredGroup: SESSION_WORKSPACE_GROUP_GITHUB, attachesContext: true },
			{ ariaLabel: 'Choose a remote setup', preferredGroup: SESSION_WORKSPACE_GROUP_REMOTE, attachesContext: undefined },
			{ ariaLabel: 'More workspace options', preferredGroup: undefined, attachesContext: undefined },
			{ ariaLabel: 'Folder: local/project', preferredGroup: SESSION_WORKSPACE_GROUP_LOCAL, attachesContext: undefined },
		]);
	});

	test('opens category menus directly, switches between pills, and toggles the active pill', () => {
		class CapturingActionWidgetService extends mock<IActionWidgetService>() {
			override isVisible = false;
			readonly shownLabels: string[][] = [];
			private onHide: (() => void) | undefined;

			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
				this.onHide?.();
				this.onHide = delegate.onHide;
				this.shownLabels.push(items.flatMap(item => item.label ? [item.label] : []));
				this.isVisible = true;
			}

			override hide(): void {
				this.isVisible = false;
				this.onHide?.();
				this.onHide = undefined;
			}
		}

		const actionWidgetService = new CapturingActionWidgetService();
		const providersService = disposables.add(new MockSessionsProvidersService());
		providersService.setProviders([{
			...createMockProvider('local-1', {
				browseActions: [makeBrowseAction('local-1', SESSION_WORKSPACE_GROUP_GITHUB, 'Select GitHub target')],
			}),
			supportsLocalWorkspaces: true,
		}]);
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			WorkspacePicker,
			{},
			undefined,
			undefined,
			{},
			upcastPartial<IFileService>({
				onDidChangeFileSystemProviderRegistrations: Event.None,
				hasProvider: () => true,
				exists: async () => true,
			}),
			actionWidgetService,
		);
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [
			{ label: 'Folder', ariaLabel: 'Choose a folder', icon: Codicon.folder, group: SESSION_WORKSPACE_GROUP_LOCAL },
			{ label: 'Repo, Issue, or PR', ariaLabel: 'Choose a GitHub target', icon: Codicon.github, group: SESSION_WORKSPACE_GROUP_GITHUB },
			{ ariaLabel: 'More workspace options', icon: Codicon.ellipsis },
		]);
		const [folder, github, more] = Array.from(container.querySelectorAll<HTMLElement>('.action-label'));

		folder.click();
		github.click();
		github.click();
		more.click();
		more.click();

		assert.deepStrictEqual({
			shownLabels: actionWidgetService.shownLabels,
			expanded: [folder, github, more].map(trigger => trigger.getAttribute('aria-expanded')),
			visible: actionWidgetService.isVisible,
		}, {
			shownLabels: [['Select...'], ['Select GitHub target']],
			expanded: ['false', 'false', 'false'],
			visible: false,
		});
	});

	test('hides the category menu before opening an issue or pull request picker', async () => {
		class SelectingActionWidgetService extends mock<IActionWidgetService>() {
			override isVisible = false;
			private readonly selections = new Map<string, () => void>();
			private onHide: (() => void) | undefined;

			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
				this.selections.clear();
				for (const item of items) {
					const actionItem = item.item;
					if (item.label && actionItem) {
						this.selections.set(item.label, () => delegate.onSelect(actionItem));
					}
				}
				this.onHide = delegate.onHide;
				this.isVisible = true;
			}

			override hide(): void {
				this.isVisible = false;
				this.onHide?.();
				this.onHide = undefined;
			}

			select(label: string): void {
				const select = this.selections.get(label);
				assert.ok(select);
				select();
			}
		}

		const actionWidgetService = new SelectingActionWidgetService();
		const pickerVisibilityWhenBrowseRuns: boolean[] = [];
		const providersService = disposables.add(new MockSessionsProvidersService());
		providersService.setProviders([createMockProvider('p1', {
			browseActions: [{
				...makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_GITHUB, 'Issue...'),
				attachesContext: true,
				run: async () => {
					pickerVisibilityWhenBrowseRuns.push(actionWidgetService.isVisible);
					return undefined;
				},
			}],
		})]);
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			WorkspacePicker,
			{},
			undefined,
			undefined,
			{},
			upcastPartial<IFileService>({
				onDidChangeFileSystemProviderRegistrations: Event.None,
				hasProvider: () => true,
				exists: async () => true,
			}),
			actionWidgetService,
		);
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [{
			label: 'Issue/PR',
			ariaLabel: 'Attach an issue or pull request',
			icon: Codicon.add,
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			attachesContext: true,
		}]);

		container.querySelector<HTMLElement>('.action-label')?.click();
		actionWidgetService.select('Issue...');
		await Promise.resolve();

		assert.deepStrictEqual({
			pickerVisibilityWhenBrowseRuns,
			categoryMenuVisible: actionWidgetService.isVisible,
		}, {
			pickerVisibilityWhenBrowseRuns: [false],
			categoryMenuVisible: false,
		});
	});

	test('repository trigger respects the GitHub sign-in action before direct browsing', () => {
		class CapturingActionWidgetService extends mock<IActionWidgetService>() {
			override isVisible = false;
			readonly shownLabels: string[][] = [];

			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[]): void {
				this.shownLabels.push(items.flatMap(item => item.label ? [item.label] : []));
				this.isVisible = true;
			}

			override hide(): void {
				this.isVisible = false;
			}
		}

		let browseCalls = 0;
		const actionWidgetService = new CapturingActionWidgetService();
		const providersService = disposables.add(new MockSessionsProvidersService());
		providersService.setProviders([createMockProvider('default-copilot', {
			browseActions: [{
				...makeBrowseAction('default-copilot', SESSION_WORKSPACE_GROUP_GITHUB, 'Repository...'),
				attachesContext: false,
				run: async () => {
					browseCalls++;
					return undefined;
				},
			}],
		})]);
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			WorkspacePicker,
			{},
			undefined,
			undefined,
			{
				getWorkspaceGroupAction: group => group === SESSION_WORKSPACE_GROUP_GITHUB ? {
					label: 'Sign in to GitHub',
					icon: Codicon.signIn,
					commandId: AGENTIC_SIGN_IN_COMMAND_ID,
					hideWorkspaceItems: true,
				} : undefined,
			},
			undefined,
			actionWidgetService,
		);
		const trigger = document.createElement('button');

		picker.showPicker(false, trigger, SESSION_WORKSPACE_GROUP_GITHUB, false);

		assert.deepStrictEqual({
			browseCalls,
			shownLabels: actionWidgetService.shownLabels,
		}, {
			browseCalls: 0,
			shownLabels: [['Sign in to GitHub']],
		});
	});

	test('shows a GitHub loading state and refreshes when its provider registers', () => {
		class CapturingActionWidgetService extends mock<IActionWidgetService>() {
			override isVisible = false;
			readonly shownLabels: string[][] = [];
			private onHide: (() => void) | undefined;

			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
				this.onHide = delegate.onHide;
				this.shownLabels.push(items.flatMap(item => item.label ? [item.label] : []));
				this.isVisible = true;
			}

			override hide(): void {
				this.isVisible = false;
				this.onHide?.();
				this.onHide = undefined;
			}
		}

		const actionWidgetService = new CapturingActionWidgetService();
		const providersService = disposables.add(new MockSessionsProvidersService());
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			WorkspacePicker,
			{},
			undefined,
			undefined,
			{},
			upcastPartial<IFileService>({
				onDidChangeFileSystemProviderRegistrations: Event.None,
				hasProvider: () => true,
				exists: async () => true,
			}),
			actionWidgetService,
		);
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [{
			label: 'Repo, Issue, or PR',
			ariaLabel: 'Choose a GitHub target',
			icon: Codicon.github,
			group: SESSION_WORKSPACE_GROUP_GITHUB,
		}]);

		container.querySelector<HTMLElement>('.action-label')?.click();
		providersService.setProviders([
			createMockProvider('local-1', {
				browseActions: [makeBrowseAction('local-1', SESSION_WORKSPACE_GROUP_GITHUB, 'Select GitHub target')],
			}),
		]);

		assert.deepStrictEqual(actionWidgetService.shownLabels, [
			['GitHub repositories are still loading'],
			['Select GitHub target'],
		]);
	});

	test('keeps a folder selected and counts multiple GitHub context attachments', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const localBaseProvider = createMockProvider('local-1');
		const localProvider: ISessionsProvider = {
			...localBaseProvider,
			resolveWorkspace: uri => {
				const workspace = localBaseProvider.resolveWorkspace(uri);
				return workspace ? {
					...workspace,
					group: SESSION_WORKSPACE_GROUP_LOCAL,
					folders: workspace.folders.map(folder => ({
						...folder,
						gitRepository: {
							uri,
							workTreeUri: uri,
							baseBranchName: 'main',
							gitHubInfo: constObservable({ owner: 'microsoft', repo: 'vscode' }),
						},
					})),
				} : undefined;
			},
		};
		let currentWorkspace: ISessionWorkspace | undefined;
		const createGitHubContext = (path: string, label: string, icon: ThemeIcon): ISessionWorkspace => ({
			uri: URI.parse(`https://github.com/microsoft/vscode/${path}`),
			label,
			icon,
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			folders: [{
				root: URI.parse('vscode-vfs://github/microsoft/vscode/HEAD'),
				workingDirectory: URI.parse('vscode-vfs://github/microsoft/vscode/HEAD'),
				name: 'vscode',
				description: undefined,
				gitRepository: undefined,
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: true,
		});
		const githubProvider = createMockProvider('default-copilot', {
			browseActions: [
				{
					label: 'Repository...',
					group: SESSION_WORKSPACE_GROUP_GITHUB,
					icon: Codicon.repo,
					providerId: 'default-copilot',
					attachesContext: false,
					run: async () => undefined,
				},
				{
					label: 'Issue...',
					group: SESSION_WORKSPACE_GROUP_GITHUB,
					icon: Codicon.issues,
					providerId: 'default-copilot',
					attachesContext: true,
					run: async workspace => {
						currentWorkspace = workspace;
						return createGitHubContext('issues/332805', 'microsoft/vscode#332805', Codicon.issues);
					},
				},
				{
					label: 'Pull Request...',
					group: SESSION_WORKSPACE_GROUP_GITHUB,
					icon: Codicon.gitPullRequest,
					providerId: 'default-copilot',
					attachesContext: true,
					run: async workspace => {
						currentWorkspace = workspace;
						return createGitHubContext('pull/1', 'microsoft/vscode#1', Codicon.gitPullRequest);
					},
				},
			],
		});
		providersService.setProviders([localProvider, githubProvider]);
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			DispatchingWorkspacePicker,
		) as DispatchingWorkspacePicker;
		const contexts: ISessionWorkspace[] = [];
		disposables.add(picker.onDidSelectContext(context => contexts.push(context)));
		picker.setSelectedWorkspace(URI.file('/local/project'), { fireEvent: false, persist: false });
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [{
			label: 'Issue/PR',
			ariaLabel: 'Choose an issue or pull request',
			icon: Codicon.add,
			hideIconWhenAttached: true,
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			attachesContext: true,
			hideWhenNoGitHubRepository: true,
		}]);

		picker.setDirectFilter(SESSION_WORKSPACE_GROUP_GITHUB, true);
		const pullRequestSelection = picker.dispatchItem({ browseActionIndex: 1 });
		picker.setDirectFilter(undefined);
		await pullRequestSelection;
		const contextTrigger = container.querySelector<HTMLElement>('.action-label');
		const getContextTriggerSnapshot = () => ({
			label: contextTrigger?.querySelector('.sessions-chat-dropdown-label')?.textContent,
			icon: contextTrigger?.querySelector('.codicon:not(.sessions-chat-dropdown-chevron)')?.className,
			badge: contextTrigger?.querySelector('.monaco-count-badge')?.textContent,
			ariaLabel: contextTrigger?.getAttribute('aria-label'),
		});
		const triggerSnapshots = [getContextTriggerSnapshot()];
		picker.setDirectFilter(SESSION_WORKSPACE_GROUP_GITHUB, true);
		const issueSelection = picker.dispatchItem({ browseActionIndex: 0 });
		picker.setDirectFilter(undefined);
		await issueSelection;
		triggerSnapshots.push(getContextTriggerSnapshot());
		const attachments = contexts
			.filter(context => context.uri.path !== '/microsoft/vscode/pull/1')
			.map(context => toPasteVariableEntry(context.label, `GitHub context: ${context.uri.toString()}`, {
				id: `github-context:${context.uri.toString()}`,
			}));
		picker.syncAttachedContext(attachments);
		triggerSnapshots.push(getContextTriggerSnapshot());
		picker.syncAttachedContext([]);
		triggerSnapshots.push(getContextTriggerSnapshot());

		assert.deepStrictEqual({
			selectedFolder: picker.selectedFolderUri?.path,
			currentWorkspace: currentWorkspace?.folders[0]?.root.path,
			contexts: contexts.map(context => context.uri.toString()),
			triggerSnapshots,
			petPlatforms: picker.getChatPetPlatformElements().map(element => element.getAttribute('aria-label')),
		}, {
			selectedFolder: '/local/project',
			currentWorkspace: '/local/project',
			contexts: [
				'https://github.com/microsoft/vscode/pull/1',
				'https://github.com/microsoft/vscode/issues/332805',
			],
			triggerSnapshots: [
				{ label: 'Issue/PR', icon: undefined, badge: '1', ariaLabel: 'Choose an issue or pull request, 1 attached' },
				{ label: 'Issue/PR', icon: undefined, badge: '2', ariaLabel: 'Choose an issue or pull request, 2 attached' },
				{ label: 'Issue/PR', icon: undefined, badge: '1', ariaLabel: 'Choose an issue or pull request, 1 attached' },
				{ label: 'Issue/PR', icon: 'codicon codicon-add', badge: undefined, ariaLabel: 'Choose an issue or pull request' },
			],
			petPlatforms: ['Choose an issue or pull request'],
		});
	});

	test('updates the issue and pull request trigger when attached context is synchronized directly', () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const picker = createTestPicker(disposables, providersService);
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [{
			label: 'Issue/PR',
			ariaLabel: 'Choose an issue or pull request',
			icon: Codicon.add,
			hideIconWhenAttached: true,
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			attachesContext: true,
		}]);
		const contextTrigger = container.querySelector<HTMLElement>('.action-label');
		const getContextTriggerSnapshot = () => ({
			icon: contextTrigger?.querySelector('.codicon:not(.sessions-chat-dropdown-chevron)')?.className,
			badge: contextTrigger?.querySelector('.monaco-count-badge')?.textContent,
			ariaLabel: contextTrigger?.getAttribute('aria-label'),
		});
		const triggerSnapshots = [getContextTriggerSnapshot()];

		picker.syncAttachedContext([toPasteVariableEntry('microsoft/vscode#1', 'GitHub context', {
			id: 'github-context:https://github.com/microsoft/vscode/pull/1',
		})]);
		triggerSnapshots.push(getContextTriggerSnapshot());
		picker.syncAttachedContext([]);
		triggerSnapshots.push(getContextTriggerSnapshot());

		assert.deepStrictEqual(triggerSnapshots, [
			{ icon: 'codicon codicon-add', badge: undefined, ariaLabel: 'Choose an issue or pull request' },
			{ icon: undefined, badge: '1', ariaLabel: 'Choose an issue or pull request, 1 attached' },
			{ icon: 'codicon codicon-add', badge: undefined, ariaLabel: 'Choose an issue or pull request' },
		]);
	});

	test('selects the first repository as the primary virtual workspace', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const repositoryUri = URI.parse('vscode-vfs://github/microsoft/vscode/HEAD');
		const repositoryWorkspace: ISessionWorkspace = {
			uri: URI.parse('https://github.com/microsoft/vscode'),
			label: 'microsoft/vscode',
			icon: Codicon.repo,
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			folders: [{
				root: repositoryUri,
				workingDirectory: repositoryUri,
				name: 'vscode',
				description: undefined,
				gitRepository: undefined,
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: true,
		};
		const baseProvider = createMockProvider('default-copilot', {
			browseActions: [{
				label: 'Repository...',
				group: SESSION_WORKSPACE_GROUP_GITHUB,
				icon: Codicon.repo,
				providerId: 'default-copilot',
				attachesContext: false,
				run: async () => repositoryWorkspace,
			}],
		});
		const provider: ISessionsProvider = {
			...baseProvider,
			resolveWorkspace: uri => uri.toString() === repositoryUri.toString()
				? repositoryWorkspace
				: baseProvider.resolveWorkspace(uri),
		};
		providersService.setProviders([provider]);
		const picker = createTestPicker(
			disposables,
			providersService,
			undefined,
			new TestNotificationService(),
			DispatchingWorkspacePicker,
		) as DispatchingWorkspacePicker;
		picker.setDirectFilter(SESSION_WORKSPACE_GROUP_GITHUB, false);

		await picker.dispatchItem({ browseActionIndex: 0 });
		const firstSelection = {
			selectedFolder: picker.selectedFolderUri?.toString(),
			selectedProvider: picker.selectedResolved?.providerId,
			attachedContextWorkspaces: picker.attachedContextWorkspaces,
		};

		picker.setSelectedWorkspace(URI.file('/copilot/current'), { fireEvent: false, persist: false });
		picker.setDirectFilter(undefined);
		await picker.dispatchItem({ browseActionIndex: 0 });

		assert.deepStrictEqual({
			firstSelection,
			replacementSelection: {
				selectedFolder: picker.selectedFolderUri?.toString(),
				selectedProvider: picker.selectedResolved?.providerId,
				attachedContextWorkspaces: picker.attachedContextWorkspaces,
			},
		}, {
			firstSelection: {
				selectedFolder: repositoryUri.toString(),
				selectedProvider: provider.id,
				attachedContextWorkspaces: [],
			},
			replacementSelection: {
				selectedFolder: repositoryUri.toString(),
				selectedProvider: provider.id,
				attachedContextWorkspaces: [],
			},
		});
	});

	test('selecting repositories preserves a matching folder and adds later repositories as pills', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const localUri = URI.file('/local/vscode');
		const localBaseProvider = createMockProvider('local-1');
		const localProvider: ISessionsProvider = {
			...localBaseProvider,
			resolveWorkspace: uri => {
				const workspace = localBaseProvider.resolveWorkspace(uri);
				return workspace ? {
					...workspace,
					group: SESSION_WORKSPACE_GROUP_LOCAL,
					folders: workspace.folders.map(folder => ({
						...folder,
						gitRepository: {
							uri,
							workTreeUri: uri,
							baseBranchName: 'main',
							gitHubInfo: constObservable({ owner: 'microsoft', repo: 'vscode' }),
						},
					})),
				} : undefined;
			},
		};
		let repositoryId = 'microsoft/vscode';
		const browseHook: { onBrowse?: () => void } = {};
		const createRepositoryWorkspace = (id: string): ISessionWorkspace => {
			const repositoryUri = URI.parse(`vscode-vfs://github/${id}/HEAD`);
			return {
				uri: URI.parse(`https://github.com/${id}`),
				label: id,
				icon: Codicon.repo,
				group: SESSION_WORKSPACE_GROUP_GITHUB,
				folders: [{
					root: repositoryUri,
					workingDirectory: repositoryUri,
					name: id.split('/')[1],
					description: undefined,
					gitRepository: undefined,
				}],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: true,
			};
		};
		const githubBaseProvider = createMockProvider('default-copilot', {
			browseActions: [{
				label: 'Repository...',
				group: SESSION_WORKSPACE_GROUP_GITHUB,
				icon: Codicon.repo,
				providerId: 'default-copilot',
				attachesContext: false,
				supportsContextAttachment: true,
				run: async () => {
					// Mirrors the real popup: the action widget hides while the
					// repository quick pick is open, resetting the direct filter.
					browseHook.onBrowse?.();
					return createRepositoryWorkspace(repositoryId);
				},
			}],
		});
		const githubProvider: ISessionsProvider = {
			...githubBaseProvider,
			resolveWorkspace: uri => {
				if (uri.scheme !== 'vscode-vfs') {
					return githubBaseProvider.resolveWorkspace(uri);
				}
				const [, owner, repository] = uri.path.split('/');
				return owner && repository ? createRepositoryWorkspace(`${owner}/${repository}`) : undefined;
			},
		};
		providersService.setProviders([localProvider, githubProvider]);
		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [{ uri: localUri, providerId: localProvider.id, checked: false }]);
		const picker = createTestPicker(
			disposables,
			providersService,
			storage,
			new TestNotificationService(),
			DispatchingWorkspacePicker,
		) as DispatchingWorkspacePicker;
		picker.setSelectedWorkspace(localUri, { fireEvent: false, persist: false });
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [
			{ label: 'Workspace', ariaLabel: 'Choose a workspace', icon: Codicon.project, reflectsWorkspace: true, attachesContext: false },
			{ label: 'Issue/PR', ariaLabel: 'Choose an issue or pull request', icon: Codicon.add, group: SESSION_WORKSPACE_GROUP_GITHUB, attachesContext: true },
		]);
		const contexts: ISessionWorkspace[] = [];
		const repositoryContexts: Array<{ workspace: ISessionWorkspace; providerId: string }> = [];
		const removedContextIds: string[] = [];
		disposables.add(picker.onDidSelectContext(context => contexts.push(context)));
		disposables.add(picker.onDidSelectRepositoryContext(context => repositoryContexts.push(context)));
		disposables.add(picker.onDidRemoveAttachedContext(id => removedContextIds.push(id)));
		browseHook.onBrowse = () => picker.setDirectFilter(undefined);

		picker.setDirectFilter(undefined, false);
		picker.selectTab(SESSION_WORKSPACE_GROUP_GITHUB);
		await picker.dispatchItem({ browseActionIndex: 0, attachAsContext: true });
		repositoryId = 'microsoft/other';
		picker.setDirectFilter(undefined, false);
		picker.selectTab(SESSION_WORKSPACE_GROUP_GITHUB);
		await picker.dispatchItem({ browseActionIndex: 0, attachAsContext: true });
		const labels = Array.from(container.querySelectorAll<HTMLElement>('.sessions-chat-dropdown-label')).map(element => element.textContent);
		const badgeBeforeRemove = container.querySelector<HTMLElement>('.sessions-workspace-picker-trigger .monaco-count-badge')?.textContent;
		const firstRepository = repositoryContexts[0];
		const secondRepository = repositoryContexts[1];
		assert.ok(firstRepository);
		assert.ok(secondRepository);
		const firstAttachment: IChatRequestVariableEntry = {
			kind: 'generic',
			id: getAdditionalRepositoryContextId(firstRepository.workspace.uri),
			name: firstRepository.workspace.label,
			value: firstRepository.workspace.folders[0].root,
		};
		const secondAttachment: IChatRequestVariableEntry = {
			kind: 'generic',
			id: getAdditionalRepositoryContextId(secondRepository.workspace.uri),
			name: secondRepository.workspace.label,
			value: secondRepository.workspace.folders[0].root,
		};
		picker.syncAttachedContext([firstAttachment]);
		const badgeAfterRemove = container.querySelector<HTMLElement>('.sessions-workspace-picker-trigger .monaco-count-badge')?.textContent;
		picker.syncAttachedContext([secondAttachment]);
		const badgeAfterRestore = container.querySelector<HTMLElement>('.sessions-workspace-picker-trigger .monaco-count-badge')?.textContent;
		picker.syncAttachedContext([]);

		assert.deepStrictEqual({
			selectedFolder: picker.selectedFolderUri?.toString(),
			selectedProvider: picker.selectedResolved?.providerId,
			labels,
			badgeBeforeRemove,
			badgeAfterRemove,
			badgeAfterRestore,
			badgeAfterClear: container.querySelector<HTMLElement>('.sessions-workspace-picker-trigger .monaco-count-badge')?.textContent,
			contexts: contexts.map(context => context.uri.toString()),
			attachedContextWorkspaces: picker.attachedContextWorkspaces.map(context => context.uri.toString()),
			removedContextIds,
		}, {
			selectedFolder: localUri.toString(),
			selectedProvider: localProvider.id,
			labels: ['local/vscode', 'Issue/PR'],
			badgeBeforeRemove: '2',
			badgeAfterRemove: '1',
			badgeAfterRestore: '1',
			badgeAfterClear: undefined,
			contexts: [],
			attachedContextWorkspaces: [],
			removedContextIds: [],
		});
	});
});

suite('AutomationsWorkspacePicker', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	for (const checked of [true, false]) {
		test(`does not inherit a ${checked ? 'checked' : 'recent'} cloud workspace when restoration is disabled`, async () => {
			const providersService = disposables.add(new MockSessionsProvidersService());
			const provider = createMockProvider('github');
			const cloudUri = URI.parse('vscode-vfs://github/microsoft/vscode/HEAD');
			const storage = disposables.add(new TestStorageService());
			seedStorage(storage, [{ uri: cloudUri, providerId: provider.id, checked }]);
			providersService.setProviders([provider]);
			const originalRecents = storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE);
			const picker = createTestPicker(
				disposables, providersService, storage, undefined, TestAutomationsWorkspacePicker,
				undefined, undefined, undefined, { restoreFromSessions: false, canRestoreWorkspace: () => false },
			);
			assert.ok(picker instanceof TestAutomationsWorkspacePicker);
			picker.setTargetModel(new AutomationIsolationModel({
				isQuickChat: false, folderUri: undefined, isolationMode: undefined, branch: undefined,
			}));
			const container = document.createElement('div');
			picker.render(container);
			const initialUri = picker.selectedFolderUri;
			providersService.setProviders([provider]);
			await timeout(0);
			picker.refreshAutomaticSelection();

			assert.deepStrictEqual({
				initialUri,
				afterRefresh: picker.selectedFolderUri,
				label: container.querySelector('.sessions-chat-dropdown-label')?.textContent,
				ariaLabel: container.querySelector('.action-label')?.getAttribute('aria-label'),
				recentsUnchanged: originalRecents === storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE),
				noWorkspaceAvailable: picker.getItems().some(item => item.label === 'No workspace'),
			}, {
				initialUri: undefined,
				afterRefresh: undefined,
				label: 'Select workspace',
				ariaLabel: 'Pick a workspace for this automation',
				recentsUnchanged: true,
				noWorkspaceAvailable: true,
			});
		});
	}

	test('preserves an explicitly seeded target and allows changing it without restoring another workspace', async () => {
		const providersService = disposables.add(new MockSessionsProvidersService());
		const provider = createMockProvider('github');
		const cloudUri = URI.parse('vscode-vfs://github/microsoft/vscode/HEAD');
		const localUri = URI.file('/local/project');
		const storage = disposables.add(new TestStorageService());
		seedStorage(storage, [{ uri: localUri, providerId: provider.id, checked: true }]);
		providersService.setProviders([provider]);
		const originalRecents = storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE);
		const picker = createTestPicker(
			disposables, providersService, storage, undefined, TestAutomationsWorkspacePicker,
			undefined, undefined, undefined, { restoreFromSessions: false, canRestoreWorkspace: () => false },
		);
		assert.ok(picker instanceof TestAutomationsWorkspacePicker);
		const model = new AutomationIsolationModel({
			isQuickChat: false, folderUri: cloudUri, isolationMode: undefined, branch: undefined,
		});
		picker.setTargetModel(model);
		picker.setSelectedWorkspace(cloudUri, { fireEvent: false, persist: false });
		const container = document.createElement('div');
		picker.render(container);
		providersService.setProviders([provider]);
		await timeout(0);
		const seededTarget = picker.selectedFolderUri?.toString();
		await picker.select('No workspace');
		const quickChat = model.isQuickChat;
		await picker.select('local/project');

		assert.deepStrictEqual({
			seededTarget,
			quickChat,
			selectedFolder: model.folderUri?.toString(),
			isQuickChat: model.isQuickChat,
			recentsUnchanged: originalRecents === storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE),
		}, {
			seededTarget: cloudUri.toString(),
			quickChat: true,
			selectedFolder: localUri.toString(),
			isQuickChat: false,
			recentsUnchanged: true,
		});
	});

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

	test('mobile workspace sheet shows search when requested without folder enumeration', async () => {
		const workbench = document.createElement('div');
		document.body.append(workbench);
		disposables.add({ dispose: () => workbench.remove() });
		const trigger = workbench.appendChild(document.createElement('button'));
		const sheet = showMobileWorkspacePickerSheet(
			upcastPartial<IWorkbenchLayoutService>({ mainContainer: workbench }),
			trigger,
			[{
				kind: ActionListItemKind.Action,
				label: 'microsoft/vscode',
				group: { title: '', icon: Codicon.repo },
				item: { folderUri: URI.file('/microsoft/vscode'), providerId: 'github' },
			}],
			() => { },
			[],
			true,
		);

		const searchInput = workbench.querySelector<HTMLInputElement>('.mobile-picker-sheet-search-input');
		assert.strictEqual(searchInput?.placeholder, 'Search Workspaces...');

		workbench.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')?.click();
		await sheet;
	});
});

// ---- Tab discovery ----------------------------------------------------------

/** Minimal subclass that exposes the protected `_getAvailableTabs` for testing. */
class TestablePicker extends WorkspacePicker {
	usesTabs(): boolean {
		return this._showTabs();
	}

	getAvailableTabs(): string[] {
		return this._getAvailableTabs().map(t => t.id);
	}

	selectWorkspaceGroup(group: string, attachesContext?: boolean): void {
		this._setDirectPickerFilter(group, attachesContext);
	}

	selectWorkspaceActions(): void {
		this._setDirectPickerFilter(undefined, false);
	}

	selectTab(group: string): void {
		this._selectWorkspaceGroup(group);
	}

	getItems() {
		return this._buildItems();
	}

	getItemLabels(): string[] {
		return this.getItems().flatMap(entry => entry.label ? [entry.label] : []);
	}

	showsFilter(): boolean {
		return this._buildListOptions(this.getItems(), undefined).showFilter === true;
	}

	focusesFilter(): boolean {
		return this._buildListOptions(this.getItems(), undefined).focusFilterOnOpen === true;
	}

	filterPlaceholder(): string | undefined {
		return this._buildListOptions(this.getItems(), undefined).filterPlaceholder;
	}

	async select(label: string): Promise<void> {
		const entry = this.getItems().find(candidate => candidate.label === label);
		assert.ok(entry?.item, `Expected picker item '${label}'`);
		await this._dispatchPickerItem(entry.item);
	}

	async selectSubmenu(parentLabel: string, childLabel: string): Promise<void> {
		const parent = this.getItems().find(candidate => candidate.label === parentLabel);
		const submenu = parent?.submenuActions?.[0];
		const child = submenu instanceof SubmenuAction
			? submenu.actions.find(candidate => candidate.label === childLabel)
			: parent?.submenuActions?.find(candidate => candidate.label === childLabel);
		assert.ok(parent?.item, `Expected picker item '${parentLabel}'`);
		assert.ok(child, `Expected submenu item '${childLabel}'`);
		await child.run();
		await this._dispatchPickerItem(parent.item);
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
	consolidatedRemoteWorkspaces = false,
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
	instantiationService.stub(IConfigurationService, new TestConfigurationService({
		[RemoteAgentHostsEnabledSettingId]: remoteAgentHostsEnabled,
		[UNIFIED_WORKSPACE_PICKER_SETTING]: consolidatedRemoteWorkspaces,
	}));
	instantiationService.stub(ICommandService, commandService);
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IDialogService, new TestDialogService());
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

const buildWebWorkspacePickerItems = Reflect.get(WebWorkspacePicker.prototype, '_buildItems') as (this: {
	readonly _agentHostFilterService: { readonly selectedHost: IAgentHostFilterEntry | undefined };
	readonly sessionsProvidersService: ISessionsProvidersService;
	readonly _directPickerAttachesContext: boolean | undefined;
	readonly _directPickerGroup: string | undefined;
	readonly options: IWorkspacePickerOptions;
	_useConsolidatedRemoteWorkspaces(): boolean;
	_getRecentWorkspaces(): Array<{ readonly workspace: ISessionWorkspace; readonly providerId: string }>;
	_getAllBrowseActions(): ISessionWorkspaceBrowseAction[];
	_isSelectedFolder(folderUri: URI): boolean;
	_isProviderUnavailable(providerId: string): boolean;
	_removeRecentWorkspace(folderUri: URI): void;
}) => IActionListItem<IWorkspacePickerItem>[];

/** An ungrouped host filter entry scoping to a single provider. */
function hostEntry(providerId: string): IAgentHostFilterEntry {
	return {
		id: providerId,
		providerIds: [providerId],
		label: providerId,
		grouped: false,
		address: undefined,
		icon: Codicon.remote,
		status: AgentHostFilterConnectionStatus.Connected,
		connectable: true,
	};
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
		assert.deepStrictEqual({
			usesTabs: picker.usesTabs(),
			tabs: picker.getAvailableTabs(),
		}, {
			usesTabs: true,
			tabs: [SESSION_WORKSPACE_GROUP_LOCAL, 'Cloud', SESSION_WORKSPACE_GROUP_REMOTE],
		});
	});

	test('shows local, GitHub, and Remote actions together with search when enabled', () => {
		providersService.setProviders([
			createMockProvider('remote', { browseActions: [makeBrowseAction('remote', SESSION_WORKSPACE_GROUP_REMOTE, 'Select Remote...')] }),
			createMockProvider('github', { browseActions: [{ ...makeBrowseAction('github', SESSION_WORKSPACE_GROUP_GITHUB, 'Repository...'), attachesContext: false }] }),
			{ ...createMockProvider('local'), supportsLocalWorkspaces: true },
		]);
		const picker = createTestablePicker(disposables, providersService, true, {}, undefined, undefined, true);

		picker.selectWorkspaceActions();

		assert.deepStrictEqual({
			usesTabs: picker.usesTabs(),
			tabs: picker.getAvailableTabs(),
			items: picker.getItemLabels(),
			itemIcons: picker.getItems()
				.filter(item => item.kind === ActionListItemKind.Action)
				.map(item => item.group?.icon?.id),
			showsFilter: picker.showsFilter(),
			focusesFilter: picker.focusesFilter(),
			filterPlaceholder: picker.filterPlaceholder(),
		}, {
			usesTabs: false,
			tabs: [SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE],
			items: ['Open Folder', 'Repository', 'Remote'],
			itemIcons: ['folder', 'folder', 'remote'],
			showsFilter: true,
			focusesFilter: true,
			filterPlaceholder: 'Search',
		});
	});

	test('keeps unified action dispatch stable when GitHub actions are hidden', async () => {
		const selectedActions: string[] = [];
		const providers = [
			createMockProvider('remote', {
				browseActions: [{
					...makeBrowseAction('remote', SESSION_WORKSPACE_GROUP_REMOTE, 'Select Remote...'),
					run: async () => {
						selectedActions.push('remote');
						return undefined;
					},
				}],
			}),
			{
				...createMockProvider('local', {
					browseActions: [makeBrowseAction('local', SESSION_WORKSPACE_GROUP_GITHUB, 'Repository...')],
				}),
				supportsLocalWorkspaces: true,
			},
		];
		providersService.setProviders(providers);
		const options: IWorkspacePickerOptions = {
			getWorkspaceGroupAction: group => group === SESSION_WORKSPACE_GROUP_GITHUB ? {
				label: 'Sign in to GitHub',
				icon: Codicon.signIn,
				commandId: AGENTIC_SIGN_IN_COMMAND_ID,
				hideWorkspaceItems: true,
			} : undefined,
		};
		const picker = createTestablePicker(disposables, providersService, true, options, undefined, undefined, true);

		await picker.selectSubmenu('Remote', 'Select Remote');

		assert.deepStrictEqual({
			items: picker.getItemLabels(),
			selectedActions,
		}, {
			items: ['Sign in to GitHub', 'Open Folder', 'Remote'],
			selectedActions: ['remote'],
		});
	});

	test('hides Remote actions in the unified picker when remote hosts are disabled', () => {
		providersService.setProviders([
			createMockProvider('remote', { browseActions: [makeBrowseAction('remote', SESSION_WORKSPACE_GROUP_REMOTE, 'Select Remote...')] }),
			{ ...createMockProvider('local'), supportsLocalWorkspaces: true },
		]);
		const picker = createTestablePicker(disposables, providersService, false, {}, undefined, undefined, true);

		assert.deepStrictEqual(picker.getItemLabels(), ['Open Folder']);
	});

	test('does not offer Attach Folder in the consolidated execution workspace picker', () => {
		providersService.setProviders([
			{ ...createMockProvider('local'), supportsLocalWorkspaces: true },
		]);
		const picker = createTestablePicker(disposables, providersService, true, {}, undefined, undefined, true);
		picker.setSelectedWorkspace(URI.file('/local/project'), { fireEvent: false, persist: false });

		picker.selectWorkspaceActions();

		assert.deepStrictEqual(picker.getItemLabels(), ['Open Folder']);
	});

	test('selects Start from Scratch through the consolidated picker', async () => {
		let noWorkspaceSelected = false;
		const picker = createTestablePicker(disposables, providersService, true, {
			getNoWorkspaceOption: () => ({
				description: 'Start without a backing workspace',
				isSelected: noWorkspaceSelected,
				select: () => noWorkspaceSelected = true,
			}),
		}, undefined, undefined, true);
		const container = document.createElement('div');
		picker.renderCategoryTriggers(container, [{
			label: 'Workspace',
			ariaLabel: 'Choose a workspace for the new session',
			icon: Codicon.project,
			reflectsWorkspace: true,
		}]);

		const before = {
			items: picker.getItems().filter(item => item.kind === ActionListItemKind.Action).map(item => ({
				label: item.label,
				description: item.description,
				icon: item.group?.icon?.id,
				checked: item.item?.checked,
			})),
			triggerLabel: container.querySelector('.sessions-chat-dropdown-label')?.textContent,
		};
		await picker.select('Start from Scratch');

		assert.deepStrictEqual({
			before,
			after: {
				items: picker.getItems().filter(item => item.kind === ActionListItemKind.Action).map(item => ({
					label: item.label,
					description: item.description,
					icon: item.group?.icon?.id,
					checked: item.item?.checked,
				})),
				triggerLabel: container.querySelector('.sessions-chat-dropdown-label')?.textContent,
				triggerAriaLabel: container.querySelector('.action-label')?.getAttribute('aria-label'),
			},
		}, {
			before: {
				items: [{
					label: 'Start from Scratch',
					description: undefined,
					icon: 'comment',
					checked: undefined,
				}],
				triggerLabel: 'Workspace',
			},
			after: {
				items: [{
					label: 'Start from Scratch',
					description: undefined,
					icon: 'comment',
					checked: true,
				}],
				triggerLabel: 'Start from Scratch',
				triggerAriaLabel: 'Workspace: Start from Scratch',
			},
		});
	});

	test('persists Start from Scratch as the checked selection until a workspace is selected', () => {
		const storage = disposables.add(new TestStorageService());
		const localProvider = createMockProvider('local-1');
		providersService.setProviders([localProvider]);
		let noWorkspaceAvailable = true;
		const options: IWorkspacePickerOptions = {
			getNoWorkspaceOption: () => noWorkspaceAvailable ? ({
				description: 'Start without a backing workspace',
				isSelected: false,
				select: () => { },
			}) : undefined,
		};
		const firstPicker = createTestablePicker(disposables, providersService, true, options, undefined, storage, true);
		firstPicker.selectNoWorkspace();
		const firstPickerNoWorkspace = firstPicker.isNoWorkspaceSelected();
		noWorkspaceAvailable = false;
		const restoredPicker = createTestablePicker(disposables, providersService, true, options, undefined, storage, true);
		const restoredNoWorkspace = restoredPicker.isNoWorkspaceSelected();

		restoredPicker.setSelectedWorkspace(URI.file('/local/project'), { fireEvent: false });

		assert.deepStrictEqual({
			firstPickerNoWorkspace,
			restoredNoWorkspace,
			afterWorkspaceSelection: restoredPicker.isNoWorkspaceSelected(),
			selectedFolder: restoredPicker.selectedFolderUri?.path,
		}, {
			firstPickerNoWorkspace: true,
			restoredNoWorkspace: true,
			afterWorkspaceSelection: false,
			selectedFolder: '/local/project',
		});
	});

	test('keeps GitHub context actions separate when groups are combined', () => {
		providersService.setProviders([
			createMockProvider('github', {
				browseActions: [
					{ ...makeBrowseAction('github', SESSION_WORKSPACE_GROUP_GITHUB, 'Repository...'), attachesContext: false },
					{ ...makeBrowseAction('github', SESSION_WORKSPACE_GROUP_GITHUB, 'Issue...'), attachesContext: true },
				],
			}),
		]);
		const picker = createTestablePicker(disposables, providersService, true, {}, undefined, undefined, true);

		picker.selectWorkspaceGroup(SESSION_WORKSPACE_GROUP_GITHUB, true);

		assert.deepStrictEqual({
			items: picker.getItemLabels(),
			showsFilter: picker.showsFilter(),
		}, {
			items: ['Issue'],
			showsFilter: false,
		});
	});

	test('exposes GitHub context actions through Add Context', async () => {
		const localProvider = createMockProvider('local');
		const provider = createMockProvider('github');
		const issueUri = URI.parse('https://github.com/microsoft/vscode/issues/1');
		const issueWorkspace = {
			...provider.resolveWorkspace(URI.file('/github/issue'))!,
			uri: issueUri,
			group: SESSION_WORKSPACE_GROUP_GITHUB,
		};
		let contextActionWorkspace: ISessionWorkspace | undefined;
		providersService.setProviders([localProvider, {
			...provider,
			resolveWorkspace: uri => {
				const workspace = provider.resolveWorkspace(uri);
				return workspace ? { ...workspace, label: 'GitHub-resolved selection', group: SESSION_WORKSPACE_GROUP_GITHUB } : undefined;
			},
			browseActions: [{
				...makeBrowseAction('github', SESSION_WORKSPACE_GROUP_GITHUB, 'Issue...'),
				attachesContext: true,
				run: async workspace => {
					contextActionWorkspace = workspace;
					return issueWorkspace;
				},
			}],
		}]);
		const picker = createTestablePicker(disposables, providersService);
		const selectedContexts: string[] = [];
		disposables.add(picker.onDidSelectContext(context => selectedContexts.push(context.uri.toString())));

		const actionsWithoutRepository = picker.getContextPickerActions();
		picker.setSelectedWorkspace(URI.file('/microsoft/vscode'), { fireEvent: false, persist: false });
		const actions = picker.getContextPickerActions();
		await actions[0].run();

		assert.deepStrictEqual({
			actionsWithoutRepository: actionsWithoutRepository.map(action => action.label),
			actions: actions.map(action => action.label),
			contextActionWorkspace: contextActionWorkspace && {
				uri: contextActionWorkspace.uri.toString(),
				label: contextActionWorkspace.label,
			},
			selectedContexts,
		}, {
			actionsWithoutRepository: ['Issue...'],
			actions: ['Issue...'],
			contextActionWorkspace: {
				uri: URI.file('/microsoft/vscode').toString(),
				label: 'GitHub-resolved selection',
			},
			selectedContexts: [issueUri.toString()],
		});
	});

	test('filters context actions and allows repository attachment with a sole consolidated tab', () => {
		const baseProvider = createMockProvider('github', {
			browseActions: [
				{ ...makeBrowseAction('github', SESSION_WORKSPACE_GROUP_GITHUB, 'Repository...'), attachesContext: false, supportsContextAttachment: true },
				{ ...makeBrowseAction('github', SESSION_WORKSPACE_GROUP_GITHUB, 'Issue...'), attachesContext: true },
			],
		});
		providersService.setProviders([{
			...baseProvider,
			resolveWorkspace: uri => {
				const workspace = baseProvider.resolveWorkspace(uri);
				return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_GITHUB } : undefined;
			},
		}]);
		const picker = createTestablePicker(disposables, providersService, true, {}, undefined, undefined, true);
		picker.setSelectedWorkspace(URI.file('/microsoft/vscode'), { fireEvent: false, persist: false });

		picker.selectWorkspaceActions();

		assert.deepStrictEqual({
			tabs: picker.getAvailableTabs(),
			items: picker.getItemLabels(),
		}, {
			tabs: [SESSION_WORKSPACE_GROUP_REMOTE],
			items: ['Repository', 'Attach Repository'],
		});
	});

	test('uses the attachable repository action for repository context', async () => {
		const actionRuns: string[] = [];
		const provider = createMockProvider('github', {
			browseActions: [
				{
					...makeBrowseAction('github', SESSION_WORKSPACE_GROUP_GITHUB, 'Add GitHub Repository...'),
					attachesContext: false,
					run: async () => {
						actionRuns.push('add');
						return { ...provider.resolveWorkspace(URI.file('/github/local'))!, group: SESSION_WORKSPACE_GROUP_LOCAL };
					},
				},
				{ ...makeBrowseAction('github', SESSION_WORKSPACE_GROUP_GITHUB, 'Clone Repository...'), attachesContext: false },
				{
					...makeBrowseAction('github', SESSION_WORKSPACE_GROUP_GITHUB, 'Use Repository in Cloud...'),
					attachesContext: false,
					supportsContextAttachment: true,
					run: async () => {
						actionRuns.push('cloud');
						return { ...provider.resolveWorkspace(URI.file('/github/cloud'))!, group: SESSION_WORKSPACE_GROUP_GITHUB };
					},
				},
			],
		});
		providersService.setProviders([provider]);
		const picker = createTestablePicker(disposables, providersService, true, {}, undefined, undefined, true);
		picker.setSelectedWorkspace(URI.file('/microsoft/vscode'), { fireEvent: false, persist: false });

		picker.selectWorkspaceActions();

		const items = picker.getItemLabels();
		await picker.select('Attach Repository');

		assert.deepStrictEqual({ items, actionRuns }, {
			items: [
				'Add GitHub Repository',
				'Clone Repository',
				'Use Repository in Cloud',
				'Attach Repository',
			],
			actionRuns: ['cloud'],
		});
	});

	test('shows GitHub sign-in with remote and GitHub workspaces when groups are combined', () => {
		const storage = disposables.add(new TestStorageService());
		const remoteUri = URI.parse('vscode-remote://host/remote-project');
		const gitHubUri = URI.parse('vscode-vfs://github/microsoft/vscode/HEAD');
		seedStorage(storage, [
			{ uri: remoteUri, providerId: 'agenthost-menu', checked: false },
			{ uri: gitHubUri, providerId: 'github', checked: false },
		]);
		const remoteProvider = createMockProvider('agenthost-menu', {
			connectionStatus: observableValue('remoteStatus', RemoteAgentHostConnectionStatus.disconnected),
			browseActions: [makeBrowseAction('agenthost-menu', SESSION_WORKSPACE_GROUP_REMOTE, 'Select Remote...')],
		});
		const gitHubProvider = createMockProvider('github', {
			browseActions: [{ ...makeBrowseAction('github', SESSION_WORKSPACE_GROUP_GITHUB, 'Repository...'), attachesContext: false, supportsContextAttachment: true }],
		});
		providersService.setProviders([
			{
				...remoteProvider,
				resolveWorkspace: uri => {
					const workspace = remoteProvider.resolveWorkspace(uri);
					return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_REMOTE } : undefined;
				},
			},
			{
				...gitHubProvider,
				resolveWorkspace: uri => {
					const workspace = gitHubProvider.resolveWorkspace(uri);
					return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_GITHUB } : undefined;
				},
			},
		]);
		const picker = createTestablePicker(disposables, providersService, true, {
			restoreFromSessions: false,
			getWorkspaceGroupAction: group => group === SESSION_WORKSPACE_GROUP_GITHUB ? {
				label: 'Sign in to GitHub',
				icon: Codicon.signIn,
				commandId: AGENTIC_SIGN_IN_COMMAND_ID,
				hideWorkspaceItems: true,
			} : undefined,
		}, undefined, storage, true);

		picker.selectWorkspaceActions();
		picker.selectTab(SESSION_WORKSPACE_GROUP_REMOTE);
		const remoteItem = picker.getItems().find(item => item.label === 'Remote');
		const remoteActions = remoteItem?.submenuActions?.[0];

		assert.deepStrictEqual({
			items: picker.getItemLabels(),
			remoteItems: remoteActions instanceof SubmenuAction ? remoteActions.actions.map(action => ({
				label: action.label,
				enabled: action.enabled,
				removable: typeof (action as { onRemove?: () => void }).onRemove === 'function',
			})) : undefined,
		}, {
			items: [
				'microsoft/vscode/HEAD',
				'Sign in to GitHub',
				'Repository',
				'Attach Repository',
				'Remote',
			],
			remoteItems: [
				{ label: 'remote-project', enabled: false, removable: true },
				{ label: 'Select Remote', enabled: false, removable: false },
				{ label: 'Provider agenthost-menu', enabled: true, removable: false },
			],
		});
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

	test('web GitHub picker includes entries owned outside the selected execution host', () => {
		const remoteProvider = createMockProvider('agenthost-remote-1');
		const githubProvider = createMockProvider('default-copilot');
		providersService.setProviders([remoteProvider, githubProvider]);
		const repositoryUri = URI.parse('vscode-vfs://github/microsoft/vscode/HEAD');
		const baseWorkspace = githubProvider.resolveWorkspace(URI.file('/copilot/repository'))!;
		const repositoryWorkspace: ISessionWorkspace = {
			...baseWorkspace,
			uri: repositoryUri,
			label: 'microsoft/vscode/HEAD',
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			folders: baseWorkspace.folders.map(folder => ({ ...folder, root: repositoryUri, workingDirectory: repositoryUri })),
		};
		const repositoryAction = makeBrowseAction('default-copilot', SESSION_WORKSPACE_GROUP_GITHUB, 'Repository...');

		const items = buildWebWorkspacePickerItems.call({
			_agentHostFilterService: { selectedHost: hostEntry(remoteProvider.id) },
			sessionsProvidersService: providersService,
			_directPickerAttachesContext: false,
			_directPickerGroup: SESSION_WORKSPACE_GROUP_GITHUB,
			options: {},
			_useConsolidatedRemoteWorkspaces: () => false,
			_getRecentWorkspaces: () => [{ workspace: { ...repositoryWorkspace, group: SESSION_WORKSPACE_GROUP_GITHUB }, providerId: githubProvider.id }],
			_getAllBrowseActions: () => [repositoryAction],
			_isSelectedFolder: () => false,
			_isProviderUnavailable: () => false,
			_removeRecentWorkspace: () => { },
		});

		assert.deepStrictEqual(items.map(item => ({
			label: item.label,
			providerId: item.item?.providerId,
			browseActionIndex: item.item?.browseActionIndex,
		})), [
			{ label: 'microsoft/vscode/HEAD', providerId: 'default-copilot', browseActionIndex: undefined },
			{ label: '', providerId: undefined, browseActionIndex: undefined },
			{ label: 'Repository...', providerId: undefined, browseActionIndex: 0 },
		]);
	});

	test('web consolidated workspace picker includes GitHub entries outside the selected host', () => {
		const remoteProvider = createMockProvider('agenthost-remote-1');
		const gitHubProvider = createMockProvider('default-copilot');
		providersService.setProviders([remoteProvider, gitHubProvider]);
		const remoteWorkspace = { ...remoteProvider.resolveWorkspace(URI.file('/remote/project'))!, group: SESSION_WORKSPACE_GROUP_REMOTE };
		const gitHubWorkspaceUri = URI.parse('vscode-vfs://github/microsoft/vscode/HEAD');
		const baseGitHubWorkspace = gitHubProvider.resolveWorkspace(URI.file('/copilot/repository'))!;
		const gitHubWorkspace: ISessionWorkspace = {
			...baseGitHubWorkspace,
			uri: gitHubWorkspaceUri,
			label: 'microsoft/vscode/HEAD',
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			folders: baseGitHubWorkspace.folders.map(folder => ({ ...folder, root: gitHubWorkspaceUri, workingDirectory: gitHubWorkspaceUri })),
		};
		const remoteAction = makeBrowseAction(remoteProvider.id, SESSION_WORKSPACE_GROUP_REMOTE, 'Select Remote...');
		const repositoryAction = { ...makeBrowseAction(gitHubProvider.id, SESSION_WORKSPACE_GROUP_GITHUB, 'Repository...'), attachesContext: false };

		const items = buildWebWorkspacePickerItems.call({
			_agentHostFilterService: { selectedHost: hostEntry(remoteProvider.id) },
			sessionsProvidersService: providersService,
			_directPickerAttachesContext: false,
			_directPickerGroup: undefined,
			options: {
				getWorkspaceGroupAction: group => group === SESSION_WORKSPACE_GROUP_GITHUB ? {
					label: 'Sign in to GitHub',
					icon: Codicon.signIn,
					commandId: AGENTIC_SIGN_IN_COMMAND_ID,
					hideWorkspaceItems: true,
				} : undefined,
			},
			_useConsolidatedRemoteWorkspaces: () => true,
			_getRecentWorkspaces: () => [
				{ workspace: remoteWorkspace, providerId: remoteProvider.id },
				{ workspace: gitHubWorkspace, providerId: gitHubProvider.id },
			],
			_getAllBrowseActions: () => [remoteAction, repositoryAction],
			_isSelectedFolder: () => false,
			_isProviderUnavailable: () => false,
			_removeRecentWorkspace: () => { },
		});

		assert.deepStrictEqual(items.map(item => item.label), [
			'remote/project',
			'microsoft/vscode/HEAD',
			'',
			'Sign in to GitHub',
			'Select Remote...',
			'Repository...',
		]);
	});

	test('separates repository actions and recents from issue and pull request context', () => {
		const storage = disposables.add(new TestStorageService());
		const recentUri = URI.parse('vscode-vfs://github/microsoft/vscode/HEAD');
		seedStorage(storage, [{ uri: recentUri, providerId: 'p1', checked: false }]);
		const baseProvider = createMockProvider('p1', {
			browseActions: [
				{ ...makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_GITHUB, 'Repository...'), attachesContext: false, supportsContextAttachment: true },
				{ ...makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_GITHUB, 'Issue...'), attachesContext: true },
				{ ...makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_GITHUB, 'Pull Request...'), attachesContext: true },
			],
		});
		providersService.setProviders([{
			...baseProvider,
			resolveWorkspace: uri => {
				const workspace = baseProvider.resolveWorkspace(uri);
				return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_GITHUB } : undefined;
			},
		}]);
		const picker = createTestablePicker(disposables, providersService, true, {}, undefined, storage);

		picker.selectWorkspaceGroup(SESSION_WORKSPACE_GROUP_GITHUB, false);
		const repositoryItems = picker.getItemLabels();
		picker.selectWorkspaceGroup(SESSION_WORKSPACE_GROUP_GITHUB, true);
		const contextItems = picker.getItemLabels();

		assert.deepStrictEqual({
			repositoryItems,
			contextItems,
		}, {
			repositoryItems: ['microsoft/vscode/HEAD', 'Repository...', 'Attach Repository...'],
			contextItems: ['Issue...', 'Pull Request...'],
		});
	});

	test('excludes issue and pull request actions from the execution workspace picker', () => {
		providersService.setProviders([createMockProvider('p1', {
			browseActions: [
				{ ...makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_GITHUB, 'Repository...'), attachesContext: false },
				{ ...makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_GITHUB, 'Issue...'), attachesContext: true },
				{ ...makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_GITHUB, 'Pull Request...'), attachesContext: true },
			],
		})]);
		const picker = createTestablePicker(disposables, providersService);

		picker.selectWorkspaceActions();
		picker.selectTab(SESSION_WORKSPACE_GROUP_GITHUB);

		assert.deepStrictEqual(picker.getItemLabels(), ['Repository...']);
	});

	test('does not offer clear actions in workspace pickers', () => {
		providersService.setProviders([{
			...createMockProvider('p1', {
				browseActions: [
					{ ...makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_GITHUB, 'Repository...'), attachesContext: false, supportsContextAttachment: true },
					{ ...makeBrowseAction('p1', SESSION_WORKSPACE_GROUP_GITHUB, 'Issue...'), attachesContext: true },
				],
			}),
			supportsLocalWorkspaces: true,
		}]);
		const picker = createTestablePicker(disposables, providersService);
		picker.setSelectedWorkspace(URI.file('/local/project'), { fireEvent: false, persist: false });

		picker.selectWorkspaceGroup(SESSION_WORKSPACE_GROUP_LOCAL, false);
		const folderItems = picker.getItemLabels();
		picker.selectWorkspaceGroup(SESSION_WORKSPACE_GROUP_GITHUB, false);
		const repositoryItems = picker.getItemLabels();
		picker.selectWorkspaceGroup(SESSION_WORKSPACE_GROUP_GITHUB, true);
		const contextItems = picker.getItemLabels();

		assert.deepStrictEqual({
			folderItems,
			repositoryItems,
			contextItems,
		}, {
			folderItems: ['Select...', 'Attach Folder...'],
			repositoryItems: ['Repository...', 'Attach Repository...'],
			contextItems: ['Issue...'],
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
		instantiationService.stub(IDialogService, new TestDialogService());
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
