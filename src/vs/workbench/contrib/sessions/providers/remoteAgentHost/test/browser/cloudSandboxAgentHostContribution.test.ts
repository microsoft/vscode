/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, RunOnceScheduler, timeout } from '../../../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { CancellationError, isCancellationError } from '../../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../../../base/common/platform.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { getSessionApplication } from '../../../../../../services/sessions/common/sessionApplication.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/virtualScheduling/index.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { StorageValue } from '../../../../../../../base/parts/storage/common/storage.js';
import { AgentSession } from '../../../../../../../platform/agentHost/common/agent.js';
import { IAgentConnection, IAgentHostService, IAgentSessionMetadata } from '../../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostConnectionsService } from '../../../../../../../platform/agentHost/browser/agentHostConnectionsService.js';
import { IAgentHostConnectionsService } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IPathService } from '../../../../../../../platform/path/common/pathService.js';
import { agentHostAuthority, toAgentHostUri } from '../../../../../../../platform/agentHost/common/agentHostUri.js';
import { remoteAgentHostSessionTypeId } from '../../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { IReplayedTaskHistory } from '../../../../../../../platform/agentHost/common/taskEventReplay.js';
import {
	CLOUD_SANDBOX_AGENT_PROVIDER,
	CloudSandboxEnabledSettingId,
	CloudSandboxAutoConnectOnOpenSettingId,
	CloudSandboxSessionFeedEnabledSettingId,
	CloudSandboxEarlyPreparationSettingId,
	CloudSandboxRequestError,
	ICloudSandboxAgentHostService,
	ICloudSandboxApiService,
	ICloudSandboxDraftPreparationService,
	cloudSandboxAddress,
	type ICloudSandboxConnectOptions,
	type ICloudSandboxCreateSessionRequest,
	type ICloudSandboxCreatedSession,
	type ICloudSandboxPreparedReservation,
	type ICloudSandboxDiscoveredSession,
	type ICloudSandboxTask,
	type ICloudSandboxDiscoveryResult,
	type ICloudSandboxDiscoveryOptions,
	type CloudSandboxDiscoveryTrigger,
	type ICloudSandboxSessionFeedConnection,
} from '../../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { readSessionWorkspaceless, SessionStatus } from '../../../../../../../platform/agentHost/common/state/sessionState.js';
import { readSessionInitiator } from '../../../../../../../platform/agentHost/common/meta/agentSessionInitiatorMeta.js';
import { RootStateSubscription } from '../../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { RootState } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { autorun, constObservable, IObservable, observableSignalFromEvent, observableValue, waitForState } from '../../../../../../../base/common/observable.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { ChatAIDisabledSettingId } from '../../../../../../../platform/chat/common/chatSettings.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../../../platform/request/common/request.js';
import { Registry } from '../../../../../../../platform/registry/common/platform.js';
import { INotification, INotificationService, NoOpNotification } from '../../../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceTrustManagementService } from '../../../../../../../platform/workspace/common/workspaceTrust.js';
import { TestLifecycleService, TestWorkspaceTrustManagementService } from '../../../../../../test/common/workbenchTestServices.js';
import { IHostService } from '../../../../../../services/host/browser/host.js';
import { IAuthenticationService } from '../../../../../../services/authentication/common/authentication.js';
import { IWorkbenchGitHubService } from '../../../../../../services/github/common/githubService.js';
import { IUserDataProfileService } from '../../../../../../services/userDataProfile/common/userDataProfile.js';
import { IUserDataProfile } from '../../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { ILifecycleService } from '../../../../../../services/lifecycle/common/lifecycle.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { ChatSessionsExtensions, IAsyncChatSessionActivationRegistry, IChatSessionContentProvider, IChatSessionItemArchiveProvider, IChatSessionsService } from '../../../../../chat/common/chatSessionsService.js';
import { IChatService } from '../../../../../chat/common/chatService/chatService.js';
import { CloudSandboxStartupError } from '../../../../../chat/browser/remoteAgentHost/cloudSandboxStartupError.js';
import { CloudSandboxApiService } from '../../../../../chat/browser/remoteAgentHost/cloudSandboxApiService.js';
import { IAgentHostGroup } from '../../../../common/agentHostSessionsProvider.js';
import { IAgentHostFilterService } from '../../../../common/agentHostFilter.js';
import { ISession } from '../../../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../../common/sessionsProvider.js';
import { ISessionsProvidersService, SessionsProvidersService } from '../../../../browser/sessionsProvidersService.js';
import { CloudSandboxAgentHostContribution } from '../../browser/cloudSandboxAgentHostContribution.js';
import { CloudSandboxTaskSessionsProvider, CLOUD_SANDBOX_TASK_PROVIDER_ID, createCloudSandboxTaskSession } from '../../browser/cloudSandboxTaskSessionsProvider.js';
import { CLOUD_SANDBOX_CREATION_PROVIDER_ID, COPILOT_PROVIDER_ID } from '../../../copilotChatSessions/common/copilotChatSessions.js';
import { IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationFactory } from '../../../../../chat/browser/remoteAgentHost/remoteAgentHostConnectionCustomization.js';
import { ReadOnlyChatSession } from '../../../../../chat/browser/remoteAgentHost/cloudSandboxReadOnlySessionHandler.js';
import { createCloudSandboxSessionPreparation } from '../../../../../chat/browser/remoteAgentHost/cloudSandboxLegacySessionPreparation.js';
import { ICloudSandboxSessionEnvironment } from '../../../../../chat/browser/remoteAgentHost/cloudSandboxSessionContribution.js';
import { CloudSandboxSessionFeed } from '../../../../../chat/browser/remoteAgentHost/cloudSandboxSessionFeed.js';
import { ICloudSandboxTelemetryService } from '../../../../../chat/browser/remoteAgentHost/cloudSandboxTelemetry.js';
import { CloudSandboxDraftPreparationService } from '../../../../../chat/browser/remoteAgentHost/cloudSandboxDraftPreparationService.js';
import { IRemoteAgentHostSessionsProviderConfig } from '../../browser/remoteAgentHostSessionsProvider.js';
import { CloudSandboxSessionsProvider } from '../../browser/cloudSandboxSessionsProvider.js';

class StubProvider extends mock<CloudSandboxSessionsProvider>() {
	override reconcileTaskResource(): void { }
	override get order(): number { return 0; }
	readonly seeded: IAgentSessionMetadata[] = [];
	readonly workspaceless = new Map<string, boolean>();
	/** Raw ids seeded as provisional, mirroring the real provider's listing gate. */
	readonly withheld = new Set<string>();
	/** Every connection status pushed onto this provider, in order. */
	readonly statuses: string[] = [];
	private readonly _status = observableValue<RemoteAgentHostConnectionStatus>('stubStatus', RemoteAgentHostConnectionStatus.disconnected);
	override readonly connectionStatus: IObservable<RemoteAgentHostConnectionStatus> = this._status;
	disposed = false;
	taskRenameHandler: { readonly rawId: string; readonly rename: (title: string) => Promise<void> } | undefined;
	taskArchiveHandler: { readonly rawId: string; readonly setArchived: (archived: boolean) => Promise<void> } | undefined;
	readonly taskArchiveHandlers = new Map<string, (archived: boolean) => Promise<void>>();
	readonly taskRenameHandlers = new Map<string, (title: string) => Promise<void>>();
	readonly archiveUpdates: { rawId: string; archived: boolean }[] = [];

	override setTaskArchiveHandler(rawId: string, setArchived: (archived: boolean) => Promise<void>): void {
		this.taskArchiveHandler = { rawId, setArchived };
		this.taskArchiveHandlers.set(rawId, setArchived);
	}

	override setSessionArchived(rawId: string, archived: boolean): void {
		this.archiveUpdates.push({ rawId, archived });
		const index = this.seeded.findIndex(meta => AgentSession.id(meta.session) === rawId);
		if (index !== -1) {
			const meta = this.seeded[index];
			const status = meta.status ?? SessionStatus.Idle;
			this.seeded[index] = { ...meta, status: archived ? status | SessionStatus.IsArchived : status & ~SessionStatus.IsArchived };
		}
	}

	override setTaskRenameHandler(rawId: string, rename: (title: string) => Promise<void>): void {
		this.taskRenameHandler = { rawId, rename };
		this.taskRenameHandlers.set(rawId, rename);
	}

	override removeTaskOwnership(rawId: string): void {
		this.taskRenameHandlers.delete(rawId);
		this.taskArchiveHandlers.delete(rawId);
	}

	override readonly id: string;
	private _displayLabel: string;
	override get label(): string { return this._displayLabel; }

	private readonly _resolutionRegistration: IDisposable;

	constructor(readonly config: IRemoteAgentHostSessionsProviderConfig, @IAgentHostConnectionsService connectionsService: IAgentHostConnectionsService) {
		super();
		this.id = `agenthost-${config.address}`;
		this._displayLabel = config.name;
		this._resolutionRegistration = connectionsService.registerSessionResolutionPolicy(agentHostAuthority(config.address), { connectionAddress: config.address });
	}

	override setLabel(label: string): void {
		this._displayLabel = label;
	}

	/** Records opt-in metadata updates; host-state merging is covered by the real provider's tests. */
	override seedSessions(metas: readonly IAgentSessionMetadata[], options?: { readonly updateExisting?: boolean; readonly workspaceless?: boolean }): void {
		for (const meta of metas) {
			if (options?.workspaceless !== undefined) {
				this.workspaceless.set(meta.session.toString(), options.workspaceless);
			}
			const index = this.seeded.findIndex(seen => seen.session.toString() === meta.session.toString());
			if (index === -1) {
				this.seeded.push(meta);
			} else if (options?.updateExisting) {
				this.seeded[index] = meta;
			}
		}
	}

	override seedProvisionalSession(meta: IAgentSessionMetadata): void {
		if (this.seeded.some(seen => seen.session.toString() === meta.session.toString())) {
			return;
		}
		this.seeded.push(meta);
		this.withheld.add(AgentSession.id(meta.session));
	}

	/** Surfaces each seed under the UI resource scheme, which is what keys the raw session id. */
	override getSessions(): ISession[] {
		return this.seeded
			.filter(meta => !this.withheld.has(AgentSession.id(meta.session)))
			.map(meta => this._toSession(meta));
	}

	/** Reaches withheld seeds too, which is the whole point of the cache accessor. */
	override getCachedSession(rawId: string): ISession | undefined {
		const meta = this.seeded.find(seen => AgentSession.id(seen.session) === rawId);
		return meta ? this._toSession(meta) : undefined;
	}

	override getSessionModifiedTime(rawId: string): number | undefined {
		return this.getCachedSession(rawId)?.updatedAt.get().getTime();
	}

	override publishWithheldSession(rawId: string): void {
		this.withheld.delete(rawId);
	}

	override removeDeletedSession(rawId: string): void {
		const index = this.seeded.findIndex(meta => AgentSession.id(meta.session) === rawId);
		if (index >= 0) {
			this.seeded.splice(index, 1);
		}
		this.withheld.delete(rawId);
	}

	private _toSession(meta: IAgentSessionMetadata): ISession {
		return upcastPartial<ISession>({
			resource: URI.from({ scheme: 'agent-host-copilot', path: `/${AgentSession.id(meta.session)}` }),
			updatedAt: constObservable(new Date(meta.modifiedTime)),
		});
	}

	readonly wiredConnections: IAgentConnection[] = [];

	override setConnection(connection: IAgentConnection): void {
		this.wiredConnections.push(connection);
	}

	override setConnectionStatus(status: RemoteAgentHostConnectionStatus): void {
		this.statuses.push(status.kind);
		this._status.set(status, undefined);
	}

	override dispose(): void {
		this.disposed = true;
		this._resolutionRegistration.dispose();
	}
}

class TestCloudSandboxContribution extends CloudSandboxAgentHostContribution {
	readonly stubProviders = new Map<string, StubProvider>();
	declare catalogTasks: Map<string, ICloudSandboxTask>;
	materializeTasks = true;
	private readonly _materializing = new Set<string>();
	/** Jitter applied to automatic polls; deterministic so timing assertions hold. */
	pollJitter = 0;

	/**
	 * Drives the async activation the chat service performs on open. Called directly rather than
	 * through the global activation registry, which also holds the generic remote-agent-host
	 * activator for the same session type.
	 */
	activate(sessionType: string): Promise<boolean> {
		return this._waitForActivation(sessionType);
	}

	checkForUpdates(): Promise<void> {
		return this._refreshIfStale();
	}

	refreshTasks(taskIds: readonly string[]): Promise<void> {
		return this._refreshFromFeed({ reason: 'change', taskIds });
	}

	refreshFeed(reason: 'renewal' | 'reconnect'): Promise<void> {
		return this._refreshFromFeed({ reason });
	}

	ensureProvider(env: ICloudSandboxSessionEnvironment): void {
		if (env.taskId && env.sessionId) {
			this._tasks.set(env.taskId, { ...env, taskId: env.taskId, sessionId: env.sessionId });
		}
		this._ensureProvider(env);
	}

	protected override _pollJitter(): number {
		return this.pollJitter;
	}

	protected override _instantiateCatalog(): CloudSandboxTaskSessionsProvider {
		const tasks = this.catalogTasks = new Map<string, ICloudSandboxTask>();
		return new class extends mock<CloudSandboxTaskSessionsProvider>() {
			override readonly id = CLOUD_SANDBOX_TASK_PROVIDER_ID;
			override get order() { return 0; }
			override initialize(): void { }
			override attach(): void { }
			override detach(): void { }
			override clear(): void { tasks.clear(); }
			override setTasks(added: readonly ICloudSandboxTask[]): void {
				for (const task of added) {
					tasks.set(task.taskId, task);
				}
			}
			override removeTasks(removed: readonly string[]): void {
				for (const taskId of removed) {
					tasks.delete(taskId);
				}
			}
			override dispose(): void { }
		}();
	}

	protected override _registerTaskRouting(): void { }

	resolveTask(taskId: string): Promise<CloudSandboxSessionsProvider> {
		return this._resolveTask(taskId, CancellationToken.None);
	}

	protected override _onTasksChanged(tasks: readonly ICloudSandboxTask[], removed: readonly string[]): void {
		super._onTasksChanged(tasks, removed);
		if (this.materializeTasks) {
			for (const task of tasks) {
				if (task.environmentId && task.sessionId && !this._materializing.has(task.taskId)
					&& this._providerInstances.get(cloudSandboxAddress(task.environmentId))?.getSessionModifiedTime(task.sessionId) === undefined) {
					this._materializing.add(task.taskId);
					void this._resolveTask(task.taskId, CancellationToken.None).finally(() => this._materializing.delete(task.taskId));
				}
			}
		}
	}

	protected override _instantiateProvider(config: IRemoteAgentHostSessionsProviderConfig): CloudSandboxSessionsProvider {
		const stub = this._instantiationService.createInstance(StubProvider, config);
		this.stubProviders.set(config.address, stub);
		return stub as unknown as CloudSandboxSessionsProvider;
	}
}

class TestLogService extends NullLogService {
	readonly warnings: (string | Error)[] = [];

	override warn(message: string | Error, ..._args: unknown[]): void {
		this.warnings.push(message);
	}
}

/** The single host filter entry every sandbox environment folds into. */
const CLOUD_SANDBOX_GROUP: IAgentHostGroup = {
	id: 'githubsandbox',
	label: 'Cloud',
	icon: Codicon.cloud,
	order: 1,
	connectable: false,
	sessionCreationProviderId: isWeb ? CLOUD_SANDBOX_CREATION_PROVIDER_ID : undefined,
	sessionProviderIds: [CLOUD_SANDBOX_TASK_PROVIDER_ID],
};

interface ITestHarness {
	readonly archiveProvider: IChatSessionItemArchiveProvider | undefined;
	readonly preparation: ICloudSandboxDraftPreparationService;
	readonly contribution: TestCloudSandboxContribution;
	readonly providersService: SessionsProvidersService;
	readonly resolutionService: AgentHostConnectionsService;
	readonly workspaceTrust: TestWorkspaceTrustManagementService;
	readonly configurationService: TestConfigurationService;
	setEnabled(enabled: boolean): Promise<void>;
	setSessionFeedEnabled(enabled: boolean): Promise<void>;
	setChatHidden(hidden: boolean): void;
	/** Discovery's answer, mutable so a test can change what a later pass reports. */
	discovered: readonly ICloudSandboxDiscoveredSession[];
	/** Runs a discovery pass and waits for it to reconcile. */
	runDiscovery(reason?: 'automatic' | 'manual'): Promise<void>;
	/** Runs while a `connect` is in flight, for testing what can race with it. */
	onConnect?: (options: ICloudSandboxConnectOptions, token: CancellationToken) => Promise<void>;
	onDisconnect?: () => Promise<void>;
	/** Session types currently served from replayed history. */
	readonly readOnlySessionTypes: string[];
	readonly contentProviders: Map<string, IChatSessionContentProvider>;
	registerLiveProvider(environmentId: string, provider: IChatSessionContentProvider): IDisposable | undefined;
	/** Drives the async activation the chat service performs when a session is opened. */
	activate(environmentId: string): Promise<boolean>;
	readonly created: ICloudSandboxCreateSessionRequest[];
	readonly connectedTo: string[];
	readonly disconnectedFrom: string[];
	readonly historyRequests: string[];
	readonly resolvedTasks: string[];
	readonly notifications: INotification[];
	readonly deletedTasks: string[];
	readonly renamedTasks: { taskId: string; title: string }[];
	readonly archivedTasks: { taskId: string; archived: boolean }[];
	/** Host groups currently declared to the filter service. */
	readonly hostGroups: IAgentHostGroup[];
	readonly discoveryModes: boolean[];
	setFocused(focused: boolean): void;
	selectSandboxHost(): void;
	changeAccount(accountKey: string | undefined): void;
}

/**
 * Creates the contribution with a discovery result, and resolves once the constructor's eager
 * `_discoverAndSeed()` pass has committed its seeds. `hostGroups` holds the groups currently
 * declared to the host filter, so tests can assert the entry's presence and its teardown.
 */
async function createContribution(store: Pick<DisposableStore, 'add'>, sessions: readonly ICloudSandboxDiscoveredSession[], options?: {
	readonly draftPreparation?: ICloudSandboxDraftPreparationService;
	/** Task Mission Control returns from `createSession`, or a rejection. */
	readonly createSession?: () => Promise<ICloudSandboxCreatedSession>;
	readonly getAccountKey?: (accountKey: string | undefined) => Promise<string | undefined>;
	readonly listSessions?: (token: CancellationToken, options?: ICloudSandboxDiscoveryOptions) => Promise<ICloudSandboxDiscoveryResult>;
	readonly resolveSession?: (taskId: string) => Promise<ICloudSandboxDiscoveredSession>;
	readonly connectSessionFeed?: (token: CancellationToken) => Promise<ICloudSandboxSessionFeedConnection | undefined>;
	readonly sessionFeed?: Partial<CloudSandboxSessionFeed>;
	readonly deleteTask?: (taskId: string, token: CancellationToken) => Promise<void>;
	readonly renameTask?: (taskId: string, title: string, token: CancellationToken) => Promise<void>;
	readonly setTaskArchived?: (taskId: string, archived: boolean, token: CancellationToken) => Promise<void>;
	readonly clearSessionHistory?: (taskId?: string) => void;
	readonly connections?: IRemoteAgentHostService['connections'];
	/** Whether the sandbox feature settings start on. Defaults to `true`. */
	readonly enabled?: boolean;
	readonly earlyPreparation?: boolean;
	readonly autoConnectOnOpen?: boolean;
	readonly sessionFeedEnabled?: boolean;
	readonly aiDisabled?: boolean;
	readonly chatHidden?: boolean;
	readonly logService?: ILogService;
	readonly storageService?: IStorageService;
	readonly accountKey?: string | null;
	readonly waitForDiscovery?: boolean;
	readonly connection?: IAgentConnection;
	readonly materializeTasks?: boolean;
}): Promise<ITestHarness> {
	const discoveryHandlers: ((reason: 'automatic' | 'manual') => Promise<void>)[] = [];
	const hostGroups: IAgentHostGroup[] = [];
	const readOnlySessionTypes: string[] = [];
	const contentProviders = new Map<string, IChatSessionContentProvider>();
	let archiveProvider: IChatSessionItemArchiveProvider | undefined;
	let customizationFactory: RemoteAgentHostConnectionCustomizationFactory | undefined;
	const instantiationService = store.add(new TestInstantiationService());
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(ICloudSandboxTelemetryService, new class extends mock<ICloudSandboxTelemetryService>() {
		override reportSessionFeed() { }
	}());
	instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { }());
	if (options?.sessionFeed) {
		options.sessionFeed.takePendingTaskIds ??= () => [];
		instantiationService.stubInstance(CloudSandboxSessionFeed, options.sessionFeed);
	}
	instantiationService.stub(IChatService, new class extends mock<IChatService>() {
		override readonly onDidSubmitRequest = Event.None;
		override setSessionTitle(): void { }
	}());
	const created: ICloudSandboxCreateSessionRequest[] = [];
	const connectedTo: string[] = [];
	const disconnectedFrom: string[] = [];
	const historyRequests: string[] = [];
	const resolvedTasks: string[] = [];
	const notifications: INotification[] = [];
	const deletedTasks: string[] = [];
	const renamedTasks: { taskId: string; title: string }[] = [];
	const archivedTasks: { taskId: string; archived: boolean }[] = [];
	const onDidChangeSentiment = store.add(new Emitter<void>());
	let chatHidden = options?.chatHidden ?? false;
	const discoveryModes: boolean[] = [];
	const focusChanges = store.add(new Emitter<boolean>());
	const hostSelectionChanges = store.add(new Emitter<void>());
	const accountChanges = store.add(new Emitter<string | undefined>());
	let accountKey = options?.accountKey === null ? undefined : options?.accountKey ?? '["github","account-1"]';
	let focused = true;
	let selectedHostId: string | undefined;
	const workspaceTrust = store.add(new TestWorkspaceTrustManagementService(false));
	instantiationService.stub(IWorkspaceTrustManagementService, workspaceTrust);
	const harness: ITestHarness = {
		get archiveProvider() { return archiveProvider; },
		get preparation() { return preparation; },
		workspaceTrust,
		discovered: sessions,
		readOnlySessionTypes,
		contentProviders,
		registerLiveProvider: (environmentId, provider) => {
			const address = cloudSandboxAddress(environmentId);
			const sessionType = remoteAgentHostSessionTypeId(agentHostAuthority(address), CLOUD_SANDBOX_AGENT_PROVIDER);
			return customizationFactory?.(address).registerChatSessionContentProvider?.(sessionType, provider);
		},
		created,
		connectedTo,
		disconnectedFrom,
		historyRequests,
		resolvedTasks,
		notifications,
		deletedTasks,
		renamedTasks,
		archivedTasks,
		hostGroups,
		discoveryModes,
		changeAccount: value => {
			accountKey = value;
			accountChanges.fire(value);
		},
		setFocused: value => {
			focused = value;
			focusChanges.fire(value);
		},
		selectSandboxHost: () => {
			selectedHostId = CLOUD_SANDBOX_GROUP.id;
			hostSelectionChanges.fire();
		},
		setEnabled: async (enabled: boolean) => {
			await configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === CloudSandboxEnabledSettingId,
				affectedKeys: new Set([CloudSandboxEnabledSettingId]),
				change: { keys: [CloudSandboxEnabledSettingId], overrides: [] },
				source: ConfigurationTarget.USER,
			});
		},
		setSessionFeedEnabled: async enabled => {
			await configurationService.setUserConfiguration(CloudSandboxSessionFeedEnabledSettingId, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === CloudSandboxSessionFeedEnabledSettingId,
				affectedKeys: new Set([CloudSandboxSessionFeedEnabledSettingId]),
				change: { keys: [CloudSandboxSessionFeedEnabledSettingId], overrides: [] },
				source: ConfigurationTarget.USER,
			});
		},
		setChatHidden: hidden => {
			chatHidden = hidden;
			onDidChangeSentiment.fire();
		},
		runDiscovery: async (reason = 'manual') => { await Promise.all(discoveryHandlers.map(handler => handler(reason))); },
		activate: async (environmentId: string) => {
			const sessionType = remoteAgentHostSessionTypeId(agentHostAuthority(cloudSandboxAddress(environmentId)), CLOUD_SANDBOX_AGENT_PROVIDER);
			return harness.contribution.activate(sessionType);
		},
	} as ITestHarness;

	instantiationService.stub(ICloudSandboxApiService, new class extends mock<ICloudSandboxApiService>() {
		override readonly onDidChangeAccount = accountChanges.event;
		override invalidateSessionHistory(): void { }
		override clearSessionHistory(taskId?: string): void { options?.clearSessionHistory?.(taskId); }
		override async getAccountKey(): Promise<string | undefined> {
			return options?.getAccountKey ? options.getAccountKey(accountKey) : accountKey;
		}
		override async resolveSession(taskId: string): Promise<ICloudSandboxDiscoveredSession> {
			resolvedTasks.push(taskId);
			if (options?.resolveSession) {
				return options.resolveSession(taskId);
			}
			const session = harness.discovered.find(session => session.taskId === taskId);
			if (!session) {
				throw new Error('Task not found.');
			}
			return session;
		}
		override async reserveSession() {
			return { taskId: 'task-new', sessionId: 'sess-new', environmentId: 'env-new', reservationExpiresAt: Date.UTC(2100, 0, 1) };
		}
		override async connectSessionFeed(token: CancellationToken) { return options?.connectSessionFeed?.(token); }
		override async listSessions(token: CancellationToken, discoveryOptions?: ICloudSandboxDiscoveryOptions): Promise<ICloudSandboxDiscoveryResult> {
			discoveryModes.push(discoveryOptions?.incremental === true);
			if (options?.listSessions) {
				return options.listSessions(token, discoveryOptions);
			}
			return { kind: 'complete', sessions: harness.discovered };
		}
		override async getSessionHistory(taskId: string): Promise<IReplayedTaskHistory> {
			historyRequests.push(taskId);
			return { sessions: [], truncated: false };
		}
		override async createSession(request: ICloudSandboxCreateSessionRequest, _token: CancellationToken, onRequestDispatched?: () => void): Promise<ICloudSandboxCreatedSession> {
			created.push(request);
			onRequestDispatched?.();
			return options?.createSession
				? options.createSession()
				: { taskId: 'task-new', sessionId: 'sess-new', environmentId: 'env-new' };
		}
		override async deleteTask(taskId: string, token: CancellationToken): Promise<void> {
			deletedTasks.push(taskId);
			await options?.deleteTask?.(taskId, token);
		}
		override async renameTask(taskId: string, title: string, token: CancellationToken): Promise<void> {
			renamedTasks.push({ taskId, title });
			await options?.renameTask?.(taskId, title, token);
		}
		override async setTaskArchived(taskId: string, archived: boolean, token: CancellationToken): Promise<void> {
			archivedTasks.push({ taskId, archived });
			await options?.setTaskArchived?.(taskId, archived, token);
		}
	}());
	instantiationService.stub(ICloudSandboxAgentHostService, new class extends mock<ICloudSandboxAgentHostService>() {
		override async connect(connectOptions: ICloudSandboxConnectOptions, token: CancellationToken): Promise<string> {
			connectedTo.push(connectOptions.environmentId);
			await harness.onConnect?.(connectOptions, token);
			return cloudSandboxAddress(connectOptions.environmentId);
		}
		override async disconnect(address: string): Promise<void> {
			disconnectedFrom.push(address);
			await harness.onDisconnect?.();
		}
	}());
	instantiationService.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
		override readonly onDidChangeConnections = Event.None;
		override readonly connections = options?.connections ?? [];
		override readonly configuredEntries = [];
		// No live protocol client is modelled, so activation stops once the connect has been made
		// rather than going on to wait for the host to advertise its agents.
		override getConnection(address: string) { return address === cloudSandboxAddress('env-new') ? options?.connection : undefined; }
		override async removeRemoteAgentHost(): Promise<void> { }
	}());
	instantiationService.stub(IRemoteAgentHostConnectionCustomizationService, new class extends mock<IRemoteAgentHostConnectionCustomizationService>() {
		override register(_match: (address: string) => boolean, factory: RemoteAgentHostConnectionCustomizationFactory): IDisposable {
			customizationFactory = factory;
			return toDisposable(() => { customizationFactory = undefined; });
		}
		override get() {
			return {
				createSessionPreparation: (connection: IAgentConnection, owner: DisposableStore) => createCloudSandboxSessionPreparation(connection.rootState, async () => {
					throw new Error('Unexpected clone request');
				}, owner),
			};
		}
	}());
	instantiationService.stub(ILifecycleService, store.add(new TestLifecycleService()));
	const providersService = store.add(instantiationService.createInstance(SessionsProvidersService));
	store.add(providersService.registerProvider(upcastPartial<ISessionsProvider>({
		id: isWeb ? CLOUD_SANDBOX_CREATION_PROVIDER_ID : COPILOT_PROVIDER_ID,
		label: 'Cloud',
		order: 0,
	})));
	instantiationService.stub(ISessionsProvidersService, providersService);
	const resolutionService = store.add(new AgentHostConnectionsService(
		upcastPartial<IAgentHostService>({ onAgentHostStart: Event.None, onAgentHostExit: Event.None }),
		instantiationService.get(IRemoteAgentHostService),
		upcastPartial<IPathService>({ registerPathProvider: () => Disposable.None }),
		new NullLogService(),
	));
	instantiationService.stub(IAgentHostConnectionsService, resolutionService);
	instantiationService.stub(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
		override readonly onDidChange = hostSelectionChanges.event;
		override get selectedHostId() { return selectedHostId; }
		override registerDiscoveryHandler(handler: (reason: 'automatic' | 'manual') => Promise<void>): IDisposable {
			discoveryHandlers.push(handler);
			return toDisposable(() => { });
		}
		override registerHostGroup(group: IAgentHostGroup): IDisposable {
			hostGroups.push(group);
			return toDisposable(() => {
				const index = hostGroups.indexOf(group);
				if (index >= 0) {
					hostGroups.splice(index, 1);
				}
			});
		}
	}());
	const configurationService = new TestConfigurationService({
		[CloudSandboxEnabledSettingId]: options?.enabled ?? true,
		[CloudSandboxEarlyPreparationSettingId]: options?.earlyPreparation ?? false,
		[CloudSandboxAutoConnectOnOpenSettingId]: options?.autoConnectOnOpen ?? true,
		[CloudSandboxSessionFeedEnabledSettingId]: options?.sessionFeedEnabled ?? true,
		[RemoteAgentHostsEnabledSettingId]: options?.enabled ?? true,
		[ChatAIDisabledSettingId]: options?.aiDisabled ?? false,
	});
	instantiationService.stub(IConfigurationService, configurationService);
	instantiationService.stub(IStorageService, options?.storageService ?? store.add(new InMemoryStorageService()));
	instantiationService.stub(IHostService, new class extends mock<IHostService>() {
		override readonly onDidChangeFocus = focusChanges.event;
		override get hasFocus() { return focused; }
	}());
	instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
		override readonly onDidChangeSentiment = Event.any(
			onDidChangeSentiment.event,
			Event.map(Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatAIDisabledSettingId)), () => undefined),
		);
		override get sentiment(): IChatSentiment {
			return { hidden: chatHidden || configurationService.getValue<boolean>(ChatAIDisabledSettingId) };
		}
	}());
	instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
		override notify(notification: INotification) {
			notifications.push(notification);
			return new NoOpNotification();
		}
	}());
	instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() {
		override registerChatSessionItemArchiveProvider(provider: IChatSessionItemArchiveProvider): IDisposable {
			archiveProvider = provider;
			return toDisposable(() => {
				provider.setRequested(false);
				archiveProvider = undefined;
			});
		}
		override getContentProviderSchemes(): string[] { return [...readOnlySessionTypes]; }
		override registerChatSessionContentProvider(sessionType: string, provider: IChatSessionContentProvider): IDisposable {
			readOnlySessionTypes.push(sessionType);
			contentProviders.set(sessionType, provider);
			return toDisposable(() => {
				contentProviders.delete(sessionType);
				const index = readOnlySessionTypes.indexOf(sessionType);
				if (index >= 0) {
					readOnlySessionTypes.splice(index, 1);
				}
			});
		}
	}());
	instantiationService.stub(ILogService, options?.logService ?? new NullLogService());
	const preparation = options?.draftPreparation ?? store.add(instantiationService.createInstance(CloudSandboxDraftPreparationService));
	instantiationService.stub(ICloudSandboxDraftPreparationService, preparation);

	const contribution = store.add(instantiationService.createInstance(TestCloudSandboxContribution));
	contribution.materializeTasks = options?.materializeTasks ?? true;
	// The constructor kicks off discovery eagerly; re-running the registered handler awaits it,
	// because `_discoverAndSeed` serializes onto the in-flight pass.
	if (options?.waitForDiscovery !== false) {
		await harness.runDiscovery();
	}
	return Object.assign(harness, { contribution, configurationService, providersService, resolutionService });
}

function discoveredSession(overrides?: Partial<ICloudSandboxDiscoveredSession>): ICloudSandboxDiscoveredSession {
	return {
		environmentId: 'env-1',
		sessionId: 'sess-1',
		taskId: 'task-1',
		name: 'Change port to 5555',
		repoName: 'osortega/simple-server',
		updatedAt: '2026-08-05T12:00:00Z',
		...overrides,
	};
}

suite('CloudSandboxAgentHostContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('eagerly subscribes before listing without a Chat view service', async () => {
		const requests: string[] = [];
		const h = await createContribution(store, [], {
			connectSessionFeed: async () => { requests.push('feed'); return undefined; },
			listSessions: async (_token, options) => {
				requests.push(`list:${options?.trigger}:${options?.incremental}`);
				return { kind: 'complete', sessions: [] };
			},
		});
		assert.deepStrictEqual({ requests, groups: h.hostGroups.map(group => group.id) }, {
			requests: ['feed', 'list:startup:false'], groups: ['githubsandbox'],
		});
	});

	test('keeps task identity while summary metadata and runtime state hydrate', () => {
		const task = discoveredSession();
		const entry = createCloudSandboxTaskSession(task);
		const identity = [entry.session.sessionId, entry.session.resource.toString(), entry.session.mainChat.get().resource.toString()];
		entry.summary.set({ ...task, name: 'Updated summary' }, undefined);
		const summaryTitle = entry.session.title.get();
		entry.runtime.set(upcastPartial<ISession>({
			title: constObservable('Host title'),
			mainChat: constObservable({ ...entry.session.mainChat.get(), title: constObservable('Host title') }),
		}), undefined);
		assert.deepStrictEqual({
			before: identity,
			after: [entry.session.sessionId, entry.session.resource.toString(), entry.session.mainChat.get().resource.toString()],
			titles: [summaryTitle, entry.session.title.get()],
		}, {
			before: [`${CLOUD_SANDBOX_TASK_PROVIDER_ID}:cloud-sandbox-task:/task-1`, 'cloud-sandbox-task:/task-1', 'cloud-sandbox-task:/task-1'],
			after: identity,
			titles: ['Updated summary', 'Host title'],
		});
	});

	test('normalizes summary application labels before hydration and preserves creator precedence', () => {
		const cases = [
			{ application: 'copilot-web', eventType: 'vscode-agents-window', expected: { id: 'copilot-web', label: 'GitHub' } },
			{ application: 'copilot-github', expected: { id: 'copilot-web', label: 'GitHub' } },
			{ application: 'copilot-vscode', expected: { id: 'vscode', label: 'VS Code' } },
			{ eventType: 'agents_page', expected: { id: 'copilot-web', label: 'GitHub' } },
			{ eventType: 'unknown', expected: { id: 'unknown', label: 'Unknown' } },
		];
		assert.deepStrictEqual(cases.map(({ application, eventType }) => {
			const entry = createCloudSandboxTaskSession(discoveredSession({ application, eventType }));
			const before = entry.session.application.get();
			entry.runtime.set(upcastPartial<ISession>({ application: constObservable(getSessionApplication(application ?? eventType ?? 'unknown')) }), undefined);
			return [before, entry.session.application.get()];
		}), cases.map(({ expected }) => [expected, expected]));
	});

	test('reconciles provider status when connecting reuses an existing connection without a change event', async () => {
		const session = discoveredSession();
		const address = cloudSandboxAddress(session.environmentId);
		const h = await createContribution(store, [session], {
			connections: [{ address, name: session.name, status: RemoteAgentHostConnectionStatus.connected }],
		});
		const provider = h.contribution.stubProviders.get(address)!;
		await h.contribution.connect({ environmentId: session.environmentId, sessionId: session.sessionId, name: session.name });
		await h.contribution.connect({ environmentId: session.environmentId, sessionId: session.sessionId, name: session.name });
		assert.deepStrictEqual({
			status: provider.connectionStatus.get().kind, connects: h.connectedTo,
		}, { status: 'connected', connects: [session.environmentId, session.environmentId] });
	});

	test('wires a reused live client without briefly downgrading it to connecting', async () => {
		const session = discoveredSession({ environmentId: 'env-new' });
		const address = cloudSandboxAddress(session.environmentId);
		const connection = upcastPartial<IAgentConnection>({});
		const h = await createContribution(store, [session], {
			connection, connections: [{ address, name: session.name, status: RemoteAgentHostConnectionStatus.connected }],
		});
		const provider = h.contribution.stubProviders.get(address)!;
		provider.statuses.length = 0;
		await h.contribution.connect({ environmentId: session.environmentId, sessionId: session.sessionId, name: session.name });
		await h.contribution.connect({ environmentId: session.environmentId, sessionId: session.sessionId, name: session.name });
		assert.deepStrictEqual({
			downgraded: provider.statuses.includes('connecting'),
			wired: provider.wiredConnections.map(value => value === connection),
			status: provider.connectionStatus.get().kind,
		}, { downgraded: false, wired: [true, true], status: 'connected' });
	});

	test('filters stale queued summaries, but permits renamed or freshly updated tasks to reappear', async () => {
		const updatedAt = new Date(Date.now() - 24 * 60 * 60_000 - 1).toISOString();
		const stale = { taskId: 'stale', name: 'New remote session', updatedAt, isQueued: true };
		let result: ICloudSandboxDiscoveryResult = {
			kind: 'complete',
			sessions: [
				stale,
				{ ...stale, taskId: 'named', name: 'Named task' },
				{ ...stale, taskId: 'active', isQueued: false },
				{ ...stale, taskId: 'unknown', isQueued: undefined },
			],
		};
		const h = await createContribution(store, [], { materializeTasks: false, listSessions: async () => result });
		const initial = [...h.contribution.catalogTasks.keys()];
		result = { kind: 'incremental', sessions: [{ ...stale, updatedAt: new Date().toISOString() }], removedTaskIds: [] };
		await h.runDiscovery();
		const refreshed = h.contribution.catalogTasks.has(stale.taskId);
		result = { kind: 'partial', sessions: [stale] };
		await h.runDiscovery();
		const expired = h.contribution.catalogTasks.has(stale.taskId);
		result = { kind: 'incremental', sessions: [{ ...stale, name: 'Renamed task' }], removedTaskIds: [] };
		await h.runDiscovery();
		assert.deepStrictEqual({
			initial, refreshed, expired, renamed: h.contribution.catalogTasks.has(stale.taskId),
			resolved: h.resolvedTasks, backends: h.contribution.stubProviders.size,
		}, { initial: ['named', 'active', 'unknown'], refreshed: true, expired: false, renamed: true, resolved: [], backends: 0 });
	});

	test('expires queued drafts through the existing timer without list requests while the feed is healthy', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const queued = { taskId: 'queued', name: 'New remote session', isQueued: true, updatedAt: new Date(Date.now() - 24 * 60 * 60_000 + 1).toISOString() };
		const h = await createContribution(store, [], {
			materializeTasks: false,
			listSessions: async () => ({ kind: 'complete', sessions: [queued] }),
			sessionFeed: { connected: true, start: async () => { }, dispose: () => { } },
		});
		const initial = [...h.contribution.catalogTasks.keys()];
		await timeout(5 * 60_000 + 1);
		assert.deepStrictEqual({
			initial, remaining: [...h.contribution.catalogTasks.keys()], requests: h.discoveryModes.length,
			resolved: h.resolvedTasks, connected: h.connectedTo,
		}, { initial: ['queued'], remaining: [], requests: 1, resolved: [], connected: [] });
	}));

	test('does not republish stale queued tasks from the offline inventory', async () => {
		const storage = store.add(new InMemoryStorageService());
		const task = discoveredSession({ name: 'New remote session', isQueued: true, updatedAt: new Date(Date.now() - 24 * 60 * 60_000 - 1).toISOString() });
		storage.store(`sessions.cloudSandbox.inventory.["github","account-1"].${JSON.stringify(['task', task.taskId])}`,
			JSON.stringify({ version: 1, sessions: [task] }), StorageScope.PROFILE, StorageTarget.MACHINE);
		const h = await createContribution(store, [], {
			storageService: storage, materializeTasks: false,
			listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		assert.deepStrictEqual({
			tasks: [...h.contribution.catalogTasks.keys()], resolved: h.resolvedTasks, backends: h.contribution.stubProviders.size,
		}, { tasks: [], resolved: [], backends: 0 });
	});

	test('lists 1750 summary rows behind one catalog without acquiring an execution', async () => {
		const sessions = Array.from({ length: 1750 }, (_, index) => discoveredSession({
			taskId: `task-${index}`, sessionId: `session-${index}`, environmentId: `environment-${index}`,
		}));
		const harness = await createContribution(store, sessions, {
			materializeTasks: false,
			listSessions: async () => ({
				kind: 'complete',
				sessions: sessions.map(({ environmentId: _environmentId, sessionId: _sessionId, ...task }) => task),
			}),
		});
		assert.deepStrictEqual({
			rows: harness.contribution.catalogTasks.size,
			backends: harness.contribution.stubProviders.size,
			providers: harness.providersService.getProviders({ includeSessionBackends: true }).length,
			resolved: harness.resolvedTasks,
			connected: harness.connectedTo,
			history: harness.historyRequests,
		}, { rows: 1750, backends: 0, providers: 2, resolved: [], connected: [], history: [] });
	});

	test('resolves only the opened task and reuses its execution on a second open', async () => {
		const first = discoveredSession();
		const second = discoveredSession({ taskId: 'second', sessionId: 'second-session', environmentId: 'second-environment' });
		const sessions = [first, second];
		const harness = await createContribution(store, sessions, {
			materializeTasks: false,
			listSessions: async () => ({
				kind: 'complete',
				sessions: sessions.map(({ environmentId: _environmentId, sessionId: _sessionId, ...task }) => task),
			}),
		});
		await harness.contribution.resolveTask(first.taskId);
		await harness.contribution.resolveTask(first.taskId);
		assert.deepStrictEqual({
			resolved: harness.resolvedTasks,
			backends: [...harness.contribution.stubProviders.keys()],
			rows: harness.contribution.catalogTasks.size,
			connected: harness.connectedTo,
		}, { resolved: [first.taskId], backends: [cloudSandboxAddress(first.environmentId)], rows: 2, connected: [] });
	});

	test('knows every cached binding in a shared environment before constructing its first runtime', async () => {
		const sessions = [discoveredSession(), discoveredSession({ taskId: 'second', sessionId: 'second-session' })];
		const harness = await createContribution(store, sessions, { materializeTasks: false });
		await harness.contribution.resolveTask(sessions[0].taskId);
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress(sessions[0].environmentId))!;
		assert.deepStrictEqual({
			secondResource: provider.config.mapSessionResource?.(AgentSession.uri('ahp-session', sessions[1].sessionId))?.toString(),
			resolved: harness.resolvedTasks,
			backends: harness.contribution.stubProviders.size,
		}, { secondResource: 'cloud-sandbox-task:/second', resolved: [], backends: 1 });
	});

	test('routes mutations for a known sibling task after opening only the first task in its environment', async () => {
		const sessions = [discoveredSession(), discoveredSession({ taskId: 'second', sessionId: 'second-session' })];
		const harness = await createContribution(store, sessions, { materializeTasks: false });
		await harness.contribution.resolveTask(sessions[0].taskId);
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress(sessions[0].environmentId))!;
		await provider.taskRenameHandlers.get(sessions[1].sessionId)!('Renamed sibling');
		await provider.taskArchiveHandlers.get(sessions[1].sessionId)!(true);
		await provider.config.deleteSessionsOnDemand!.deleteSessions([AgentSession.uri('ahp-session', sessions[1].sessionId)]);
		assert.deepStrictEqual({
			renamed: harness.renamedTasks, archived: harness.archivedTasks, deleted: harness.deletedTasks,
			remaining: [...harness.contribution.catalogTasks.keys()], resolved: harness.resolvedTasks,
			connected: harness.connectedTo,
		}, {
			renamed: [{ taskId: sessions[1].taskId, title: 'Renamed sibling' }],
			archived: [{ taskId: sessions[1].taskId, archived: true }],
			deleted: [sessions[1].taskId], remaining: [sessions[0].taskId], resolved: [], connected: [],
		});
	});

	test('preserves task metadata when execution resolution returns only a binding and fallback title', async () => {
		const task = discoveredSession({ isArchived: true, status: SessionStatus.InputNeeded, hasRepository: true });
		const { sessionId: _sessionId, environmentId: _environmentId, ...summary } = task;
		const harness = await createContribution(store, [task], {
			materializeTasks: false,
			listSessions: async () => ({ kind: 'complete', sessions: [summary] }),
			resolveSession: async () => ({ taskId: task.taskId, name: 'Fallback detail title', sessionId: task.sessionId, environmentId: task.environmentId }),
		});
		await harness.contribution.resolveTask(task.taskId);
		assert.deepStrictEqual(harness.contribution.catalogTasks.get(task.taskId), task);
	});

	test('reconciles scoped summary windows without dropping archives or acquiring executions', async () => {
		const active = { taskId: 'active', name: 'Active' };
		const archived = { taskId: 'archived', name: 'Archived', isArchived: true };
		let result: ICloudSandboxDiscoveryResult = { kind: 'complete', sessions: [active, archived] };
		const h = await createContribution(store, [], { materializeTasks: false, listSessions: async () => result });
		result = { kind: 'scoped', sessions: [], removedTaskIds: [] };
		await h.runDiscovery();
		const retained = [...h.contribution.catalogTasks.values()].map(task => [task.taskId, task.isArchived]);
		result = { kind: 'scoped', sessions: [{ taskId: archived.taskId, name: archived.name }], removedTaskIds: [] };
		await h.runDiscovery();
		assert.deepStrictEqual({
			retained, unarchived: [...h.contribution.catalogTasks.values()].map(task => [task.taskId, task.isArchived]),
			backends: h.contribution.stubProviders.size, resolved: h.resolvedTasks,
		}, {
			retained: [[archived.taskId, true]], unarchived: [[archived.taskId, false]],
			backends: 0, resolved: [],
		});
	});

	test('requests archives only on demand, coalesces expansion and reuses the loaded account cache', async () => {
		const requests: (boolean | undefined)[] = [];
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const entered = new DeferredPromise<void>();
		const archived = discoveredSession({ isArchived: true });
		const h = await createContribution(store, [], {
			listSessions: async (_token, options) => {
				requests.push(options?.includeArchived);
				if (options?.includeArchived) {
					void entered.complete();
					return pending.p;
				}
				return { kind: 'scoped', sessions: [], removedTaskIds: [] };
			},
		});

		const before = [...requests];
		h.archiveProvider!.setRequested(true);
		await entered.p;
		h.archiveProvider!.setRequested(false);
		h.archiveProvider!.setRequested(true);
		await pending.complete({ kind: 'complete', sessions: [archived] });
		await h.runDiscovery();
		const afterLoad = requests.length;
		h.archiveProvider!.setRequested(false);
		h.archiveProvider!.setRequested(true);
		assert.deepStrictEqual({
			before, requests, afterLoad, state: h.archiveProvider!.state.get(),
			cached: h.contribution.stubProviders.get(cloudSandboxAddress('env-1'))?.seeded.map(session => session.summary),
		}, {
			before: [false], requests: [false, true], afterLoad: 2, state: 'loaded', cached: [archived.name],
		});
	});

	test('captures archive demand before asynchronous authentication when startup expansion is restored', async () => {
		const authentication = new DeferredPromise<void>();
		const entered = new DeferredPromise<void>();
		const requests: (boolean | undefined)[] = [];
		const h = await createContribution(store, [], {
			waitForDiscovery: false,
			getAccountKey: async account => {
				if (!entered.isSettled) {
					void entered.complete();
					await authentication.p;
				}
				return account;
			},
			listSessions: async (_token, options) => {
				requests.push(options?.includeArchived);
				return options?.includeArchived
					? { kind: 'complete', sessions: [] }
					: { kind: 'scoped', sessions: [], removedTaskIds: [] };
			},
		});
		await entered.p;
		h.archiveProvider!.setRequested(true);
		const finished = h.runDiscovery();
		await authentication.complete();
		await finished;
		assert.deepStrictEqual({ requests, state: h.archiveProvider!.state.get() }, {
			requests: [false, true], state: 'loaded',
		});
	});

	test('retains the in-flight archive demand through authentication and collapse/re-expansion', async () => {
		const authentication = new DeferredPromise<void>();
		const authenticationEntered = new DeferredPromise<void>();
		const inventory = new DeferredPromise<void>();
		const inventoryEntered = new DeferredPromise<void>();
		const requests: (boolean | undefined)[] = [];
		let hold = false;
		const h = await createContribution(store, [], {
			getAccountKey: async account => {
				if (hold) {
					void authenticationEntered.complete();
					await authentication.p;
				}
				return account;
			},
			listSessions: async (_token, options) => {
				requests.push(options?.includeArchived);
				if (hold) {
					void inventoryEntered.complete();
					await inventory.p;
				}
				return options?.includeArchived
					? { kind: 'complete', sessions: [] }
					: { kind: 'scoped', sessions: [], removedTaskIds: [] };
			},
		});
		hold = true;
		h.archiveProvider!.setRequested(true);
		await authenticationEntered.p;
		h.archiveProvider!.setRequested(false);
		await authentication.complete();
		await inventoryEntered.p;
		h.archiveProvider!.setRequested(true);
		const finished = h.runDiscovery();
		await inventory.complete();
		await finished;
		assert.deepStrictEqual({ requests, state: h.archiveProvider!.state.get() }, {
			requests: [false, true], state: 'loaded',
		});
	});

	test('keeps loaded archive state through background refresh success and failure', async () => {
		const archived = discoveredSession({ isArchived: true });
		const warnings: string[] = [];
		let result: ICloudSandboxDiscoveryResult = { kind: 'scoped', sessions: [], removedTaskIds: [] };
		const h = await createContribution(store, [], {
			listSessions: async () => result,
			logService: new class extends NullLogService {
				override warn(message: string): void { warnings.push(message); }
			}(),
		});
		result = { kind: 'complete', sessions: [archived] };
		h.archiveProvider!.setRequested(true);
		await h.runDiscovery();
		const states: string[] = [];
		const archiveState = h.archiveProvider!.state;
		store.add(autorun(reader => states.push(archiveState.read(reader))));
		for (const refresh of [
			{ kind: 'incremental', sessions: [], removedTaskIds: [] },
			{ kind: 'partial', sessions: [], failedTaskIds: ['active-task'] },
			{ kind: 'failed', reason: 'service unavailable' },
		] satisfies ICloudSandboxDiscoveryResult[]) {
			result = refresh;
			await h.contribution.refreshFeed('renewal');
		}
		assert.deepStrictEqual({
			states,
			cached: h.contribution.stubProviders.get(cloudSandboxAddress('env-1'))?.seeded.map(session => session.summary),
			failureLogged: warnings.some(message => message.includes('service unavailable')),
		}, { states: ['loaded'], cached: [archived.name], failureLogged: true });
	});

	test('scoped windows evict absent active rows without scanning beyond the window or dropping cached archives', async () => {
		const active = discoveredSession();
		const archive = discoveredSession({ sessionId: 'old', taskId: 'old-task', isArchived: true });
		let phase = 0;
		const requests: { includeArchived: boolean | undefined; taskIds: readonly string[] | undefined }[] = [];
		const h = await createContribution(store, [], {
			listSessions: async (_token, options) => {
				requests.push({ includeArchived: options?.includeArchived, taskIds: options?.taskIds });
				if (phase === 0) {
					return { kind: 'scoped', sessions: [active], removedTaskIds: [] };
				}
				if (phase === 1) {
					return { kind: 'complete', sessions: [active, archive] };
				}
				return { kind: 'scoped', sessions: [], removedTaskIds: [] };
			},
		});
		phase = 1;
		h.archiveProvider!.setRequested(true);
		await h.runDiscovery();
		h.archiveProvider!.setRequested(false);
		phase = 2;
		await h.runDiscovery();
		const provider = h.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		assert.deepStrictEqual({
			lastRequests: requests.slice(-1),
			sessions: provider.seeded.map(session => ({ id: AgentSession.id(session.session), archived: !!((session.status ?? 0) & SessionStatus.IsArchived) })),
			archivedTaskOwned: provider.taskArchiveHandlers.has(archive.sessionId),
			disposed: provider.disposed,
		}, {
			lastRequests: [{ includeArchived: false, taskIds: undefined }],
			sessions: [{ id: 'old', archived: true }],
			archivedTaskOwned: true,
			disposed: false,
		});
	});

	test('archive errors retry on expansion and an account change invalidates the archive cache', async () => {
		const requests: (boolean | undefined)[] = [];
		let fail = true;
		const h = await createContribution(store, [], {
			listSessions: async (_token, options) => {
				requests.push(options?.includeArchived);
				return options?.includeArchived && fail
					? { kind: 'failed', reason: 'unavailable' }
					: options?.includeArchived ? { kind: 'complete', sessions: [] } : { kind: 'scoped', sessions: [], removedTaskIds: [] };
			},
		});
		h.archiveProvider!.setRequested(true);
		await h.runDiscovery();
		const failed = h.archiveProvider!.state.get();
		h.archiveProvider!.setRequested(false);
		fail = false;
		h.archiveProvider!.setRequested(true);
		await h.runDiscovery();
		h.archiveProvider!.setRequested(false);
		h.changeAccount('other-account');
		await h.runDiscovery();
		const reset = h.archiveProvider!.state.get();
		h.archiveProvider!.setRequested(true);
		await h.runDiscovery();
		assert.deepStrictEqual({ failed, reset, requests }, { failed: 'error', reset: 'idle', requests: [false, true, true, false, true] });
	});

	test('a mutation during scoped discovery cannot overwrite archived UI or persisted state', async () => {
		const storage: IStorageService = store.add(new InMemoryStorageService());
		const first = discoveredSession();
		const missing = discoveredSession({ sessionId: 'missing', taskId: 'missing-task' });
		const entered = new DeferredPromise<void>();
		const inventory = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		let refreshing = false;
		const h = await createContribution(store, [first, missing], {
			storageService: storage,
			listSessions: async () => {
				if (!refreshing) {
					return { kind: 'complete', sessions: [first, missing] };
				}
				void entered.complete();
				return inventory.p;
			},
		});
		refreshing = true;
		const discovering = h.runDiscovery();
		await entered.p;
		const provider = h.contribution.stubProviders.get(cloudSandboxAddress(first.environmentId))!;
		await provider.taskArchiveHandlers.get(first.sessionId)!(true);
		provider.setSessionArchived(first.sessionId, true);
		await inventory.complete({ kind: 'scoped', sessions: [first], removedTaskIds: [] });
		await discovering;
		const key = `sessions.cloudSandbox.inventory.["github","account-1"].${JSON.stringify(['task', first.taskId])}`;
		const persisted = storage.getObject<{ sessions: ICloudSandboxDiscoveredSession[] }>(key, StorageScope.PROFILE);
		assert.deepStrictEqual({
			archived: !!((provider.seeded[0].status ?? 0) & SessionStatus.IsArchived),
			persisted: persisted?.sessions[0].isArchived,
		}, { archived: true, persisted: true });
	});

	test('manual, renewal and reconnect refreshes follow current archive demand', async () => {
		const requests: { trigger: string | undefined; includeArchived: boolean | undefined }[] = [];
		const h = await createContribution(store, [], {
			listSessions: async (_token, options) => {
				requests.push({ trigger: options?.trigger, includeArchived: options?.includeArchived });
				return options?.incremental
					? { kind: 'incremental', sessions: [], removedTaskIds: [] }
					: options?.includeArchived ? { kind: 'complete', sessions: [] } : { kind: 'scoped', sessions: [], removedTaskIds: [] };
			},
		});
		h.archiveProvider!.setRequested(true);
		await h.runDiscovery();
		await h.contribution.refreshFeed('renewal');
		await h.contribution.refreshFeed('reconnect');
		await h.runDiscovery();
		h.archiveProvider!.setRequested(false);
		await h.contribution.refreshFeed('renewal');
		assert.deepStrictEqual(requests, [
			{ trigger: 'startup', includeArchived: false },
			{ trigger: 'manual', includeArchived: true },
			{ trigger: 'feedRenewal', includeArchived: true },
			{ trigger: 'feedReconnect', includeArchived: true },
			{ trigger: 'manual', includeArchived: true },
			{ trigger: 'feedRenewal', includeArchived: false },
		]);
	});

	test('disabling discovery cancels an archive read and prevents late publication', async () => {
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const entered = new DeferredPromise<CancellationToken>();
		const h = await createContribution(store, [], {
			listSessions: async (token, options) => {
				if (options?.includeArchived) {
					void entered.complete(token);
					return pending.p;
				}
				return { kind: 'scoped', sessions: [], removedTaskIds: [] };
			},
		});
		h.archiveProvider!.setRequested(true);
		const finished = h.runDiscovery();
		const token = await entered.p;
		await h.setEnabled(false);
		await pending.complete({ kind: 'complete', sessions: [discoveredSession({ isArchived: true })] });
		await finished;
		assert.deepStrictEqual({
			cancelled: token.isCancellationRequested,
			registered: !!h.archiveProvider,
			providers: h.contribution.stubProviders.size,
		}, { cancelled: true, registered: false, providers: 0 });
	});

	for (const claimed of [true, false]) {
		test(`Agents reuses a confirmed ${claimed ? 'claim' : 'fallback'} after connection failure`, async () => {
			const created = {
				taskId: claimed ? 'task-new' : 'task-fallback', sessionId: claimed ? 'sess-new' : 'sess-fallback',
				environmentId: claimed ? 'env-new' : 'env-fallback', claimed,
			};
			const logs: string[] = [];
			const h = await createContribution(store, [], {
				earlyPreparation: true, createSession: async () => created,
				logService: new class extends NullLogService {
					override info(message: string): void { logs.push(message); }
				}(),
			});
			await h.workspaceTrust.setWorkspaceTrust(true);
			const draft = URI.parse('copilot-cloud-sandbox:/untitled-retry');
			h.preparation.prepare(draft, 'owner/repo');
			const connections: ICloudSandboxConnectOptions[] = [];
			h.onConnect = async options => {
				connections.push(options);
				if (connections.length === 1) {
					throw new Error('relay unavailable');
				}
			};
			await assert.rejects(h.contribution.provisionSession({ repoNwo: 'owner/repo', prompt: 'first prompt' }, CancellationToken.None, undefined, draft), /couldn't connect/);
			const result = await h.contribution.provisionSession({ repoNwo: 'owner/repo', prompt: 'retry prompt' }, CancellationToken.None, undefined, draft);

			assert.deepStrictEqual({
				created: h.created,
				connections: connections.map(options => ({
					environmentId: options.environmentId, sessionId: options.sessionId, source: options.connectionSource, path: options.taskCreationPath,
				})),
				retryTiming: { provisioningStartedAt: connections[1].provisioningStartedAt, reservationWaitMs: connections[1].reservationWaitMs },
				result: { taskId: result.taskId, sessionId: result.sessionId, environmentId: result.environmentId },
				withheld: [...h.contribution.stubProviders.get(cloudSandboxAddress(result.environmentId))!.withheld],
				deleted: h.deletedTasks,
				submissionLogs: logs.filter(message => message.includes('event=taskSubmitted ')).length,
			}, {
				created: [{ repoNwo: 'owner/repo', prompt: 'first prompt', reservedTaskId: 'task-new', expectedAccountKey: '["github","account-1"]' }],
				connections: ['created', 'existing'].map(source => ({
					environmentId: created.environmentId, sessionId: created.sessionId, source, path: claimed ? 'reservationClaimed' : 'reservationFallback',
				})),
				retryTiming: { provisioningStartedAt: undefined, reservationWaitMs: 0 },
				result: { taskId: created.taskId, sessionId: created.sessionId, environmentId: created.environmentId },
				withheld: [], deleted: [], submissionLogs: 1,
			});
		});
	}

	for (const changed of ['account', 'repository', 'environment', 'reservation', 'deleted task'] as const) {
		test(`does not reuse or resubmit a confirmed draft after a changed ${changed}`, async () => {
			const h = await createContribution(store, [], {
				earlyPreparation: true,
				createSession: async () => ({ taskId: 'task-new', sessionId: 'sess-new', environmentId: 'env-new', claimed: true }),
			});
			await h.workspaceTrust.setWorkspaceTrust(true);
			const draft = URI.parse('copilot-cloud-sandbox:/untitled-changed-retry');
			h.preparation.prepare(draft, 'owner/repo');
			h.onConnect = async () => { throw new Error('relay unavailable'); };
			await assert.rejects(h.contribution.provisionSession({ repoNwo: 'owner/repo', prompt: 'first prompt' }, CancellationToken.None, undefined, draft), /couldn't connect/);
			if (changed === 'account') {
				h.changeAccount('other-account');
			} else if (changed === 'deleted task') {
				const provider = h.contribution.stubProviders.get(cloudSandboxAddress('env-new'))!;
				await provider.config.deleteSessionsOnDemand!.deleteSessions([URI.parse('ahp-session:/sess-new')]);
			}
			await assert.rejects(h.contribution.provisionSession({
				prompt: 'retry prompt', repoNwo: changed === 'repository' ? 'another/repo' : 'owner/repo',
				...(changed === 'environment' ? { environmentId: 'other-environment' } : {}),
				...(changed === 'reservation' ? { reservedTaskId: 'other-reservation' } : {}),
			}, CancellationToken.None, undefined, draft), error => changed === 'account' ? isCancellationError(error) : error instanceof CloudSandboxStartupError);

			assert.deepStrictEqual({ tasks: h.created.length, connections: h.connectedTo, deleted: h.deletedTasks }, {
				tasks: 1, connections: ['env-new'], deleted: changed === 'deleted task' ? ['task-new'] : [],
			});
		});
	}

	test('reuses confirmation received just before the caller cancelled without resubmission', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		const h = await createContribution(store, [], {
			earlyPreparation: true,
			createSession: async () => {
				cancellation.cancel();
				return { taskId: 'task-new', sessionId: 'sess-new', environmentId: 'env-new', claimed: true };
			},
		});
		await h.workspaceTrust.setWorkspaceTrust(true);
		const draft = URI.parse('copilot-cloud-sandbox:/untitled-cancelled-retry');
		h.preparation.prepare(draft, 'owner/repo');
		await assert.rejects(h.contribution.provisionSession({ repoNwo: 'owner/repo', prompt: 'first prompt' }, cancellation.token, undefined, draft), isCancellationError);
		const connectionsBeforeRetry = [...h.connectedTo];
		const result = await h.contribution.provisionSession({ repoNwo: 'OWNER/REPO', prompt: 'retry prompt' }, CancellationToken.None, undefined, draft);
		assert.deepStrictEqual({
			tasks: h.created.length, connectionsBeforeRetry, connections: h.connectedTo, result: result.taskId, deleted: h.deletedTasks,
		}, { tasks: 1, connectionsBeforeRetry: [], connections: ['env-new'], result: 'task-new', deleted: [] });
	});

	test('waits for the composing reservation before submitting or seeding an Agents task', () => runWithFakedTimers({}, async () => {
		const receipt = new DeferredPromise<ICloudSandboxPreparedReservation>();
		const entered = new DeferredPromise<void>();
		const claims: string[] = [];
		const preparation = new class extends mock<ICloudSandboxDraftPreparationService>() {
			override getSubmittedDraft() { return undefined; }
			override markSubmitted(): void { }
			override async take(resource: URI) {
				claims.push(resource.toString());
				void entered.complete();
				return receipt.p;
			}
		}();
		const created = { environmentId: 'env-prepared', sessionId: 'session-prepared', taskId: 'task-prepared' };
		const logs: string[] = [];
		const h = await createContribution(store, [], {
			draftPreparation: preparation, createSession: async () => ({ ...created, claimed: true }),
			logService: new class extends NullLogService {
				override info(message: string): void { logs.push(message); }
			}(),
		});
		const taskCreationPaths: (ICloudSandboxConnectOptions['taskCreationPath'])[] = [];
		const reservationWaits: (number | undefined)[] = [];
		h.onConnect = async options => {
			taskCreationPaths.push(options.taskCreationPath);
			reservationWaits.push(options.reservationWaitMs);
		};
		const draft = URI.parse('copilot-cloud-sandbox:/untitled-prepared');
		const sending = h.contribution.provisionSession({ prompt: 'final prompt' }, CancellationToken.None, undefined, draft);
		await entered.p;
		const beforeReady = { tasks: [...h.created], providers: h.contribution.stubProviders.size };
		await timeout(200);
		await receipt.complete({ ...created, reservationExpiresAt: Date.UTC(2100, 0, 1), expectedAccountKey: '["github","account-1"]' });
		const result = await sending;

		assert.deepStrictEqual({
			beforeReady, claims, requests: h.created, environmentId: result.environmentId, sessionId: result.sessionId, taskCreationPaths, reservationWaits,
			submitted: logs.filter(message => message.includes('event=taskSubmitted ')),
		}, {
			beforeReady: { tasks: [], providers: 0 },
			claims: [draft.toString()],
			requests: [{ prompt: 'final prompt', reservedTaskId: created.taskId, expectedAccountKey: '["github","account-1"]' }],
			environmentId: created.environmentId, sessionId: created.sessionId,
			taskCreationPaths: ['reservationClaimed'], reservationWaits: [200],
			submitted: ['[CloudSandboxAgentHost] event=taskSubmitted taskCreationPath=reservationClaimed taskId="task-prepared" environmentId="env-prepared" reservationWaitMs=200 durationMs=200'],
		});
	}));

	test('uses the fallback task without releasing a reservation that another Send may own', async () => {
		const prepared: ICloudSandboxPreparedReservation = {
			taskId: 'task-prepared', sessionId: 'session-prepared', environmentId: 'env-prepared',
			reservationExpiresAt: Date.UTC(2100, 0, 1), expectedAccountKey: '["github","account-1"]',
		};
		let releases = 0;
		const preparation = new class extends mock<ICloudSandboxDraftPreparationService>() {
			override getSubmittedDraft() { return undefined; }
			override markSubmitted(): void { }
			override async take() { return prepared; }
			override async release() { releases++; }
		}();
		const created = { taskId: 'task-fallback', sessionId: 'session-fallback', environmentId: 'env-fallback', claimed: false };
		const h = await createContribution(store, [], { draftPreparation: preparation, createSession: async () => created });
		const paths: (ICloudSandboxConnectOptions['taskCreationPath'])[] = [];
		h.onConnect = async options => { paths.push(options.taskCreationPath); };

		const result = await h.contribution.provisionSession({ prompt: 'final prompt' }, CancellationToken.None, undefined, URI.parse('copilot-cloud-sandbox:/untitled-fallback'));

		assert.deepStrictEqual({
			requests: h.created, connected: h.connectedTo, paths, releases,
			result: { taskId: result.taskId, sessionId: result.sessionId, environmentId: result.environmentId },
		}, {
			requests: [{ prompt: 'final prompt', reservedTaskId: 'task-prepared', expectedAccountKey: prepared.expectedAccountKey }],
			connected: ['env-fallback'], paths: ['reservationFallback'], releases: 0,
			result: { taskId: 'task-fallback', sessionId: 'session-fallback', environmentId: 'env-fallback' },
		});
	});

	for (const mismatch of ['account', 'reservation'] as const) {
		test(`draft handoff refuses a mismatched ${mismatch} before submission`, async () => {
			let takes = 0;
			let releases = 0;
			const preparation = new class extends mock<ICloudSandboxDraftPreparationService>() {
				override getSubmittedDraft() { return undefined; }
				override async take() {
					takes++;
					return {
						taskId: 'task-prepared', sessionId: 'session-prepared', environmentId: 'env-prepared',
						reservationExpiresAt: Date.UTC(2100, 0, 1), expectedAccountKey: '["github","account-1"]',
					};
				}
				override async release() { releases++; }
			}();
			const h = await createContribution(store, [], { draftPreparation: preparation });

			await assert.rejects(h.contribution.provisionSession({
				prompt: 'final prompt',
				...(mismatch === 'account' ? { expectedAccountKey: 'other-account' } : { reservedTaskId: 'other-reservation' }),
			}, CancellationToken.None, undefined, URI.parse('copilot-cloud-sandbox:/untitled-mismatch')), isCancellationError);

			assert.deepStrictEqual({ takes, releases, requests: h.created, connections: h.connectedTo }, {
				takes: mismatch === 'account' ? 0 : 1, releases: mismatch === 'account' ? 0 : 1,
				requests: [], connections: [],
			});
		});
	}

	for (const scenario of [
		{ path: 'newEnvironment', request: {} },
		{ path: 'existingEnvironment', request: { environmentId: 'env-new' } },
		{ path: 'reservationClaimed', request: { reservedTaskId: 'task-new' }, claimed: true },
		{ path: 'reservationFallback', request: { reservedTaskId: 'task-old' }, claimed: false },
	]) {
		test(`forwards ${scenario.path} from task submission to connection timing`, async () => {
			const logs: string[] = [];
			const h = await createContribution(store, [], {
				createSession: async () => ({ environmentId: 'env-new', sessionId: 'sess-new', taskId: 'task-new', claimed: scenario.claimed }),
				logService: new class extends NullLogService {
					override info(message: string): void { logs.push(message); }
				}(),
			});
			const taskCreationPaths: (ICloudSandboxConnectOptions['taskCreationPath'])[] = [];
			h.onConnect = async options => { taskCreationPaths.push(options.taskCreationPath); };

			await h.contribution.provisionSession({
				...scenario.request, repoNwo: 'private-owner/private-repo', prompt: 'private-prompt', expectedAccountKey: '["github","account-1"]',
			}, CancellationToken.None);

			const submitted = logs.filter(message => message.includes('event=taskSubmitted '));
			assert.deepStrictEqual({
				taskCreationPaths,
				loggedPaths: submitted.map(message => message.match(/\btaskCreationPath=(?<path>\w+)/)?.groups?.path),
				privateContent: submitted.some(message => message.includes('private-') || message.includes('account-1')),
			}, { taskCreationPaths: [scenario.path], loggedPaths: [scenario.path], privateContent: false });
		});
	}

	for (const useReservation of [false, true]) {
		test(`failed ${useReservation ? 'reservation claim' : 'task submission'} exposes safe startup details without logging completion or releasing ownership`, async () => {
			const logs: string[] = [];
			let releases = 0;
			const prepared: ICloudSandboxPreparedReservation = {
				taskId: 'task-prepared', sessionId: 'session-prepared', environmentId: 'env-prepared',
				reservationExpiresAt: Date.UTC(2100, 0, 1), expectedAccountKey: '["github","account-1"]',
			};
			const h = await createContribution(store, [], {
				draftPreparation: new class extends mock<ICloudSandboxDraftPreparationService>() {
					override getSubmittedDraft() { return undefined; }
					override async take() { return prepared; }
					override async release() { releases++; }
				}(),
				createSession: async () => {
					throw new CloudSandboxRequestError(503, 'private response', undefined, {
						code: 'unavailable', requestId: 'ABCD:1234:5678:90AB:CDEF',
					});
				},
				logService: new class extends NullLogService {
					override info(message: string): void { logs.push(message); }
				}(),
			});
			let failure: unknown;
			try {
				await h.contribution.provisionSession({ prompt: 'private-prompt' }, CancellationToken.None, undefined,
					useReservation ? URI.parse('copilot-cloud-sandbox:/untitled-failure') : undefined);
			} catch (error) {
				failure = error;
			}
			assert.ok(failure instanceof CloudSandboxStartupError);
			const message = 'Couldn\'t confirm whether the cloud session was created. Check your cloud sessions before starting another.';
			assert.deepStrictEqual({
				message: failure.message,
				details: failure.detailsCommand.command.arguments,
				requests: h.created,
				connected: h.connectedTo,
				releases,
				submitted: logs.filter(message => message.includes('event=taskSubmitted ')),
			}, {
				message,
				details: [message, 'Step: Create cloud session\nHTTP status: 503\nError code: unavailable\nRequest reference: ABCD:1234:5678:90AB:CDEF'],
				requests: [{
					prompt: 'private-prompt',
					...(useReservation ? { expectedAccountKey: prepared.expectedAccountKey, reservedTaskId: prepared.taskId } : {}),
				}],
				connected: [],
				releases: 0,
				submitted: [],
			});
		});
	}

	test('keeps discovered environments behind one logical Cloud provider across restoration', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const sessions = [
			discoveredSession(),
			discoveredSession({ environmentId: 'env-2', sessionId: 'sess-2', taskId: 'task-2', name: 'Second task' }),
		];
		const first = await createContribution(store, sessions, { storageService });
		const snapshot = (harness: ITestHarness) => ({
			providers: harness.providersService.getProviders().map(provider => provider.label),
			backends: [...harness.contribution.stubProviders.values()].map(backend => ({
				address: backend.config.address,
				routable: harness.providersService.getProvider(backend.id) === backend,
				sessions: backend.seeded.map(session => session.session.toString()),
			})),
			registeredCount: harness.providersService.getProviders({ includeSessionBackends: true }).length,
			connections: harness.connectedTo,
		});
		const before = snapshot(first);
		first.contribution.dispose();
		const afterDisposal = first.providersService.getProviders({ includeSessionBackends: true }).map(provider => provider.label);
		const restored = await createContribution(store, [], {
			storageService, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		const expected = {
			providers: ['Cloud'],
			backends: sessions.map(session => ({
				address: cloudSandboxAddress(session.environmentId),
				routable: false,
				sessions: [AgentSession.uri('ahp-session', session.sessionId).toString()],
			})),
			registeredCount: 2,
			connections: [],
		};
		assert.deepStrictEqual({ before, afterDisposal, restored: snapshot(restored) }, {
			before: expected, afterDisposal: ['Cloud'], restored: expected,
		});
	});

	for (const hasRepository of [true, false, undefined]) {
		test(`preserves repository classification through offline inventory restoration: ${hasRepository}`, async () => {
			const storageService = store.add(new InMemoryStorageService());
			const session = discoveredSession({ hasRepository, repoName: undefined });
			const resource = AgentSession.uri('ahp-session', session.sessionId).toString();
			const address = cloudSandboxAddress(session.environmentId);
			const first = await createContribution(store, [session], { storageService });
			const beforeReload = first.contribution.stubProviders.get(address)?.workspaceless.get(resource);
			first.contribution.dispose();
			const restored = await createContribution(store, [], {
				storageService, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
			});

			const expected = hasRepository === undefined ? undefined : !hasRepository;
			assert.deepStrictEqual({
				beforeReload,
				afterReload: restored.contribution.stubProviders.get(address)?.workspaceless.get(resource),
				connected: [...first.connectedTo, ...restored.connectedTo],
			}, { beforeReload: expected, afterReload: expected, connected: [] });
		});
	}

	test('archives the owning task without connecting and persists the flag for offline restoration', async () => {
		const storage = store.add(new InMemoryStorageService());
		const harness = await createContribution(store, [discoveredSession()], { storageService: storage });
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		await provider.taskArchiveHandler!.setArchived(true);
		harness.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService: storage, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		assert.deepStrictEqual({
			rawId: provider.taskArchiveHandler!.rawId,
			archivedTasks: harness.archivedTasks, connectedTo: harness.connectedTo,
			restoredArchived: !!(restored.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!.seeded[0].status! & SessionStatus.IsArchived),
		}, {
			rawId: 'sess-1', archivedTasks: [{ taskId: 'task-1', archived: true }], connectedTo: [], restoredArchived: true,
		});
	});

	test('retains task routing for every session sharing an environment across reloads', async () => {
		const storage = store.add(new InMemoryStorageService());
		const sessions = [discoveredSession(), discoveredSession({ sessionId: 'sess-2', taskId: 'task-2', name: 'New task' })];
		const harness = await createContribution(store, sessions, { storageService: storage, autoConnectOnOpen: false });
		const address = cloudSandboxAddress('env-1');
		const provider = harness.contribution.stubProviders.get(address)!;
		await provider.taskArchiveHandlers.get('sess-1')!(true);
		await provider.taskRenameHandlers.get('sess-1')!('Renamed first task');
		await harness.activate('env-1');
		const sessionType = harness.readOnlySessionTypes[0];
		const handler = harness.contentProviders.get(sessionType)!;
		for (const session of sessions) {
			store.add(await handler.provideChatSessionContent(URI.from({ scheme: sessionType, path: `/${session.sessionId}` }), CancellationToken.None));
		}
		harness.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService: storage, autoConnectOnOpen: false, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		const restoredProvider = restored.contribution.stubProviders.get(address)!;
		await restoredProvider.taskArchiveHandlers.get('sess-2')!(true);

		assert.deepStrictEqual({
			archived: [...harness.archivedTasks, ...restored.archivedTasks],
			renamed: harness.renamedTasks,
			history: harness.historyRequests,
			restored: restoredProvider.seeded.map(meta => ({ id: AgentSession.id(meta.session), title: meta.summary })),
			connected: [...harness.connectedTo, ...restored.connectedTo],
		}, {
			archived: [{ taskId: 'task-1', archived: true }, { taskId: 'task-2', archived: true }],
			renamed: [{ taskId: 'task-1', title: 'Renamed first task' }],
			history: ['task-1', 'task-2'],
			restored: [{ id: 'sess-1', title: 'Renamed first task' }, { id: 'sess-2', title: 'New task' }],
			connected: [],
		});
	});

	test('opens a live-only session alongside multiple task-owned sessions', async () => {
		const harness = await createContribution(store, [discoveredSession(), discoveredSession({ sessionId: 'sess-2', taskId: 'task-2' })], { autoConnectOnOpen: false });
		await harness.activate('env-1');
		const sessionType = harness.readOnlySessionTypes[0];
		const liveResource = URI.from({ scheme: sessionType, path: '/live-only' });
		const live = store.add(new ReadOnlyChatSession(liveResource, [], 'Live conversation', constObservable(false)));
		store.add(harness.registerLiveProvider('env-1', { provideChatSessionContent: async () => live })!);
		const opened = store.add(await harness.contentProviders.get(sessionType)!.provideChatSessionContent(liveResource, CancellationToken.None));
		await waitForState(opened.isReadOnly!, value => !value);
		assert.deepStrictEqual({ readOnly: opened.isReadOnly?.get(), title: opened.title, historyRequests: harness.historyRequests }, {
			readOnly: false, title: 'Live conversation', historyRequests: [],
		});
	});

	for (const removal of ['delete', 'discovery'] as const) {
		test(`keeps sibling tasks available after a task is removed by ${removal}`, async () => {
			const storage = store.add(new InMemoryStorageService());
			const first = discoveredSession();
			const second = discoveredSession({ sessionId: 'sess-2', taskId: 'task-2' });
			const harness = await createContribution(store, [first, second], { storageService: storage });
			const address = cloudSandboxAddress('env-1');
			const provider = harness.contribution.stubProviders.get(address)!;
			if (removal === 'delete') {
				await provider.config.deleteSessionsOnDemand!.deleteSessions([URI.parse('ahp-session:/sess-2')]);
			} else {
				harness.discovered = [first];
				await harness.runDiscovery();
			}
			await provider.taskArchiveHandlers.get('sess-1')!(true);
			const beforeReload = { disposed: provider.disposed, sessions: provider.seeded.map(meta => AgentSession.id(meta.session)) };
			harness.contribution.dispose();
			const restored = await createContribution(store, [], {
				storageService: storage, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
			});
			assert.deepStrictEqual({
				beforeReload,
				restored: restored.contribution.stubProviders.get(address)!.seeded.map(meta => AgentSession.id(meta.session)),
				deleted: harness.deletedTasks, archived: harness.archivedTasks,
			}, {
				beforeReload: { disposed: false, sessions: ['sess-1'] }, restored: ['sess-1'],
				deleted: removal === 'delete' ? ['task-2'] : [], archived: [{ taskId: 'task-1', archived: true }],
			});
		});

		test(`reconnects through the surviving task after the first task is removed by ${removal}`, async () => {
			const first = discoveredSession();
			const second = discoveredSession({ sessionId: 'sess-2', taskId: 'task-2' });
			const harness = await createContribution(store, [first, second], { autoConnectOnOpen: false });
			const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
			if (removal === 'delete') {
				await provider.config.deleteSessionsOnDemand!.deleteSessions([URI.parse('ahp-session:/sess-1')]);
			} else {
				harness.discovered = [second];
				await harness.runDiscovery();
			}
			const reconnectSessions: (string | undefined)[] = [];
			harness.onConnect = async options => {
				reconnectSessions.push(options.sessionId);
				throw new Error('Sandbox unavailable');
			};
			await assert.rejects(provider.config.connectOnDemand!(), /Sandbox unavailable/);
			// An explicit reconnect carrying an old URI must also preserve the surviving history route.
			await assert.rejects(harness.contribution.connect({ environmentId: 'env-1', sessionId: 'sess-1', name: first.name }), /Sandbox unavailable/);
			const activated = await harness.activate('env-1');
			const sessionType = harness.readOnlySessionTypes[0];
			store.add(await harness.contentProviders.get(sessionType)!.provideChatSessionContent(URI.from({ scheme: sessionType, path: '/sess-2' }), CancellationToken.None));
			assert.deepStrictEqual({ reconnectSessions, activated, history: harness.historyRequests, disposed: provider.disposed }, {
				reconnectSessions: ['sess-2', 'sess-1'], activated: true, history: ['task-2'], disposed: false,
			});
		});
	}

	test('reconciles task archive and unarchive updates from another client without removing the provider', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		const address = cloudSandboxAddress('env-1');
		const provider = harness.contribution.stubProviders.get(address)!;
		harness.discovered = [discoveredSession({ isArchived: true })];
		await harness.runDiscovery();
		const archived = !!(provider.seeded[0].status! & SessionStatus.IsArchived);
		harness.discovered = [discoveredSession({ isArchived: false })];
		await harness.runDiscovery();
		assert.deepStrictEqual({
			archived, unarchived: !(provider.seeded[0].status! & SessionStatus.IsArchived),
			sameProvider: harness.contribution.stubProviders.get(address) === provider, disposed: provider.disposed,
		}, { archived: true, unarchived: true, sameProvider: true, disposed: false });
	});

	test('restores explicit unarchived inventory state without network discovery', async () => {
		const storage: IStorageService = store.add(new InMemoryStorageService());
		const session = discoveredSession({ isArchived: true });
		const harness = await createContribution(store, [session], { storageService: storage });
		harness.discovered = [{ ...session, isArchived: false }];
		await harness.runDiscovery();
		harness.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService: storage, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		const key = `sessions.cloudSandbox.inventory.["github","account-1"].${JSON.stringify(['task', session.taskId])}`;
		const inventory = storage.getObject<{ sessions: ICloudSandboxDiscoveredSession[] }>(key, StorageScope.PROFILE);
		assert.deepStrictEqual({
			persisted: inventory?.sessions[0].isArchived,
			restoredUpdates: restored.contribution.stubProviders.get(cloudSandboxAddress(session.environmentId))!.archiveUpdates,
		}, { persisted: false, restoredUpdates: [{ rawId: session.sessionId, archived: false }] });
	});

	test('does not persist rejected task archives', async () => {
		const storage = store.add(new InMemoryStorageService());
		const harness = await createContribution(store, [discoveredSession()], {
			storageService: storage, setTaskArchived: async () => { throw new Error('archive rejected'); },
		});
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		await assert.rejects(provider.taskArchiveHandler!.setArchived(true), /archive rejected/);
		harness.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService: storage, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		assert.strictEqual(!!(restored.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!.seeded[0].status! & SessionStatus.IsArchived), false);
	});

	test('cancels task archive updates when the account changes', async () => {
		const pending = new DeferredPromise<void>();
		const entered = new DeferredPromise<void>();
		const harness = await createContribution(store, [discoveredSession()], {
			setTaskArchived: async () => {
				await entered.complete();
				await pending.p;
			},
		});
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		const archive = provider.taskArchiveHandler!.setArchived(true);
		await entered.p;
		harness.changeAccount(undefined);
		await pending.complete();
		await assert.rejects(archive, CancellationError);
	});

	test('renames the discovered task without connecting and persists its new inventory name', async () => {
		const storage = store.add(new InMemoryStorageService());
		const harness = await createContribution(store, [discoveredSession()], { storageService: storage });
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		await provider.taskRenameHandler!.rename('Renamed task');
		harness.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService: storage,
			listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		assert.deepStrictEqual({
			rawId: provider.taskRenameHandler!.rawId,
			renamedTasks: harness.renamedTasks,
			connectedTo: harness.connectedTo,
			restoredTitle: restored.contribution.stubProviders.get(cloudSandboxAddress('env-1'))?.seeded[0].summary,
		}, {
			rawId: 'sess-1', renamedTasks: [{ taskId: 'task-1', title: 'Renamed task' }],
			connectedTo: [], restoredTitle: 'Renamed task',
		});
	});

	test('preserves the inventory name when task rename fails', async () => {
		const storage = store.add(new InMemoryStorageService());
		const harness = await createContribution(store, [discoveredSession()], {
			storageService: storage,
			renameTask: async () => { throw new Error('rename rejected'); },
		});
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		await assert.rejects(provider.taskRenameHandler!.rename('Renamed task'), /rename rejected/);
		harness.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService: storage,
			listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		assert.strictEqual(restored.contribution.stubProviders.get(cloudSandboxAddress('env-1'))?.seeded[0].summary, discoveredSession().name);
	});

	test('binds task rename when discovery resolves a previously connected environment', async () => {
		const harness = await createContribution(store, []);
		const address = cloudSandboxAddress('env-1');
		harness.contribution.ensureProvider({ environmentId: 'env-1', name: 'Existing environment' });
		const provider = harness.contribution.stubProviders.get(address)!;
		const initiallyBound = provider.taskRenameHandler !== undefined;
		harness.discovered = [discoveredSession()];
		await harness.runDiscovery();
		await provider.taskRenameHandler!.rename('Renamed task');
		assert.deepStrictEqual({
			initiallyBound, sameProvider: harness.contribution.stubProviders.get(address) === provider,
			renamedTasks: harness.renamedTasks,
		}, {
			initiallyBound: false, sameProvider: true, renamedTasks: [{ taskId: 'task-1', title: 'Renamed task' }],
		});
	});

	test('cancels task rename when the account changes before it completes', async () => {
		const pending = new DeferredPromise<void>();
		const entered = new DeferredPromise<void>();
		const harness = await createContribution(store, [discoveredSession()], {
			renameTask: async () => {
				await entered.complete();
				await pending.p;
			},
		});
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		const rename = provider.taskRenameHandler!.rename('Renamed task');
		await entered.p;
		harness.changeAccount(undefined);
		await pending.complete();
		await assert.rejects(rename, CancellationError);
	});

	test('deletes a discovered task without connecting and removes its persisted inventory', async () => {
		const storage = store.add(new InMemoryStorageService());
		const harness = await createContribution(store, [discoveredSession()], { storageService: storage });
		const address = cloudSandboxAddress('env-1');
		const provider = harness.contribution.stubProviders.get(address)!;
		await provider.config.deleteSessionsOnDemand!.deleteSessions([URI.parse('ahp-session:/sess-1')]);
		harness.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService: storage,
			listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		assert.deepStrictEqual({
			deletedTasks: harness.deletedTasks,
			connectedTo: harness.connectedTo,
			disconnectedFrom: harness.disconnectedFrom,
			sessions: provider.getSessions(),
			disposed: provider.disposed,
			restoredProviders: restored.contribution.stubProviders.size,
		}, {
			deletedTasks: ['task-1'], connectedTo: [], disconnectedFrom: [address],
			sessions: [], disposed: true, restoredProviders: 0,
		});
	});

	test('retains the provider and inventory when Mission Control rejects deletion', async () => {
		const storage = store.add(new InMemoryStorageService());
		const harness = await createContribution(store, [discoveredSession()], {
			storageService: storage, deleteTask: async () => { throw new Error('delete rejected'); },
		});
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		await assert.rejects(provider.config.deleteSessionsOnDemand!.deleteSessions([URI.parse('ahp-session:/sess-1')]), /delete rejected/);
		const beforeReload = { sessions: provider.seeded.length, disposed: provider.disposed, disconnected: [...harness.disconnectedFrom] };
		harness.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService: storage, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		assert.deepStrictEqual({ beforeReload, restoredProviders: restored.contribution.stubProviders.size }, {
			beforeReload: { sessions: 1, disposed: false, disconnected: [] }, restoredProviders: 1,
		});
	});

	test('stale discovery cannot recreate a deleted task', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		await provider.config.deleteSessionsOnDemand!.deleteSessions([URI.parse('ahp-session:/sess-1')]);
		await harness.runDiscovery();
		assert.deepStrictEqual({
			sameProvider: harness.contribution.stubProviders.get(cloudSandboxAddress('env-1')) === provider,
			disposed: provider.disposed, sessions: provider.seeded.length, deletedTasks: harness.deletedTasks,
		}, { sameProvider: true, disposed: true, sessions: 0, deletedTasks: ['task-1'] });
	});

	test('does not delete a different session sharing an environment', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		assert.deepStrictEqual({
			ownsInventorySession: provider.config.deleteSessionsOnDemand!.ownsSession(URI.parse('ahp-session:/sess-1')),
			ownsOtherSession: provider.config.deleteSessionsOnDemand!.ownsSession(URI.parse('ahp-session:/not-the-discovered-session')),
			ownsCodexWithSameId: provider.config.deleteSessionsOnDemand!.ownsSession(URI.parse('codex:/sess-1')),
			ownsDifferentAuthority: provider.config.deleteSessionsOnDemand!.ownsSession(URI.parse('ahp-session://other/sess-1')),
			deletedTasks: harness.deletedTasks,
			disposed: provider.disposed,
		}, { ownsInventorySession: true, ownsOtherSession: false, ownsCodexWithSameId: false, ownsDifferentAuthority: false, deletedTasks: [], disposed: false });
	});

	test('seeds the discovered repository so a never-opened session is not workspace-less', async () => {
		// Without a project the workspace is undefined and the session groups under "Unknown".
		// The seeded shape matches what the host reports on connect, so reconciling is a no-op.
		const { contribution } = await createContribution(store, [discoveredSession()]);

		const provider = contribution.stubProviders.get(cloudSandboxAddress('env-1'));
		assert.deepStrictEqual(provider?.seeded.map(m => ({
			session: m.session.toString(),
			summary: m.summary,
			project: m.project && { uri: m.project.uri.toString(), displayName: m.project.displayName },
		})), [{
			session: 'ahp-session:/sess-1',
			summary: 'Change port to 5555',
			project: { uri: 'https://github.com/osortega/simple-server', displayName: 'osortega/simple-server' },
		}]);
	});

	test('omits the project when discovery could not resolve a repository', async () => {
		const { contribution } = await createContribution(store, [discoveredSession({ repoName: undefined })]);

		const provider = contribution.stubProviders.get(cloudSandboxAddress('env-1'));
		assert.strictEqual(provider?.seeded[0]?.project, undefined);
	});

	test('supplies environment connection labels independently of the task name', async () => {
		const { contribution } = await createContribution(store, [discoveredSession({ name: 'hi' })]);
		const labels = contribution.stubProviders.get(cloudSandboxAddress('env-1'))?.config.connectionLabels;

		assert.deepStrictEqual(labels && { ...labels, reconnectingIn: labels.reconnectingIn(5) }, {
			unavailableTitle: 'Environment Offline',
			unavailable: 'Environment offline.',
			connectingTitle: 'Connecting to the Environment',
			connecting: 'Connecting...',
			reconnecting: 'Reconnecting...',
			reconnectingIn: 'Reconnecting in 5s',
			incompatibleTitle: 'Cannot Connect to the Environment',
			incompatible: 'This environment is incompatible with this version of Visual Studio Code.',
		});
	});

	test('opts sandbox providers out of the [host] workspace-label suffix', async () => {
		// Each sandbox is its own provider named after its task, so the suffix would put every
		// session in a workspace group of one.
		const { contribution } = await createContribution(store, [
			discoveredSession(),
			discoveredSession({ environmentId: 'env-2', sessionId: 'sess-2', taskId: 'task-2', name: 'hi' }),
		]);

		assert.deepStrictEqual([...contribution.stubProviders.values()].map(p => ({
			name: p.config.name,
			omitHostFromWorkspaceLabel: p.config.omitHostFromWorkspaceLabel,
		})), [
			{ name: 'Change port to 5555', omitHostFromWorkspaceLabel: true },
			{ name: 'hi', omitHostFromWorkspaceLabel: true },
		]);
	});

	test('folds every sandbox into one non-connectable host filter group', async () => {
		const { contribution } = await createContribution(store, [
			discoveredSession(),
			discoveredSession({ environmentId: 'env-2', sessionId: 'sess-2', taskId: 'task-2', name: 'hi' }),
		]);

		assert.deepStrictEqual([...contribution.stubProviders.values()].map(p => p.config.hostGroup), [
			CLOUD_SANDBOX_GROUP,
			CLOUD_SANDBOX_GROUP,
		]);
	});

	test('declares the host filter group even with no sandbox sessions', async () => {
		const { contribution, hostGroups } = await createContribution(store, []);

		assert.deepStrictEqual([...contribution.stubProviders.keys()], []);
		assert.deepStrictEqual([...hostGroups], [CLOUD_SANDBOX_GROUP]);
	});

	test('declares no host filter group while the feature is disabled', async () => {
		const { hostGroups } = await createContribution(store, [discoveredSession()], { enabled: false });

		assert.deepStrictEqual([...hostGroups], []);
	});

	test('does not advertise or discover sandboxes when AI features are disabled', async () => {
		let discoveries = 0;
		const { contribution, hostGroups } = await createContribution(store, [], {
			aiDisabled: true,
			listSessions: async () => {
				discoveries++;
				return { kind: 'complete', sessions: [discoveredSession()] };
			},
		});

		assert.deepStrictEqual({ discoveries, groups: [...hostGroups], providers: [...contribution.stubProviders.keys()] }, { discoveries: 0, groups: [], providers: [] });
	});

	test('removes sandbox hosts and disposes their providers when AI features are disabled', async () => {
		const { contribution, configurationService, hostGroups } = await createContribution(store, [discoveredSession()]);
		const providers = [...contribution.stubProviders.values()];
		await configurationService.setUserConfiguration(ChatAIDisabledSettingId, true);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === ChatAIDisabledSettingId,
			affectedKeys: new Set([ChatAIDisabledSettingId]),
			change: { keys: [ChatAIDisabledSettingId], overrides: [] },
			source: ConfigurationTarget.USER,
		});

		assert.deepStrictEqual({ disposed: providers.map(provider => provider.disposed), groups: [...hostGroups] }, { disposed: [true], groups: [] });
	});

	test('does not advertise or discover sandboxes when hidden by entitlement policy', async () => {
		let discoveries = 0;
		const { contribution, hostGroups } = await createContribution(store, [], {
			chatHidden: true,
			listSessions: async () => {
				discoveries++;
				return { kind: 'complete', sessions: [discoveredSession()] };
			},
		});

		assert.deepStrictEqual({ discoveries, groups: [...hostGroups], providers: [...contribution.stubProviders.keys()] }, { discoveries: 0, groups: [], providers: [] });
	});

	test('tears down sandbox hosts when entitlement policy hides chat and rediscovers when restored', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		const originalProvider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;

		harness.setChatHidden(true);
		await harness.runDiscovery();
		const hidden = { groups: [...harness.hostGroups], disposed: originalProvider.disposed };

		harness.setChatHidden(false);
		await harness.runDiscovery();
		const restoredProvider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'));

		assert.deepStrictEqual({
			hidden,
			restored: {
				groups: [...harness.hostGroups],
				replaced: restoredProvider !== originalProvider,
				disposed: restoredProvider?.disposed,
			},
		}, {
			hidden: { groups: [], disposed: true },
			restored: { groups: [CLOUD_SANDBOX_GROUP], replaced: true, disposed: false },
		});
	});

	test('does not warn when discovery is cancelled', async () => {
		const logService = new TestLogService();
		const { contribution } = await createContribution(store, [], {
			listSessions: async () => { throw new CancellationError(); },
			logService,
		});

		assert.deepStrictEqual({
			providers: [...contribution.stubProviders.keys()],
			warnings: logService.warnings,
		}, {
			providers: [],
			warnings: [],
		});
	});

	test('opens history immediately while waking the environment in the background', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		const wake = new DeferredPromise<void>();
		harness.onConnect = () => wake.p;

		const opened = await harness.activate('env-1');
		const sessionType = harness.readOnlySessionTypes[0];
		store.add(await harness.contentProviders.get(sessionType)!.provideChatSessionContent(URI.from({ scheme: sessionType, path: '/sess-1' }), CancellationToken.None));
		const duringWake = {
			opened,
			connectedTo: [...harness.connectedTo],
			historyRequests: [...harness.historyRequests],
			servedFromHistory: harness.readOnlySessionTypes.length,
			status: harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))?.connectionStatus.get().kind,
		};
		await wake.complete();

		assert.deepStrictEqual(duringWake, {
			opened: true,
			connectedTo: ['env-1'],
			historyRequests: ['task-1'],
			servedFromHistory: 1,
			status: 'connecting',
		});
	});

	test('concurrent opens share the background wake and history provider', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		const wake = new DeferredPromise<void>();
		harness.onConnect = () => wake.p;
		const opened = await Promise.all([harness.activate('env-1'), harness.activate('env-1')]);
		await wake.complete();

		assert.deepStrictEqual({ opened, connectedTo: harness.connectedTo, servedFromHistory: harness.readOnlySessionTypes.length }, {
			opened: [true, true],
			connectedTo: ['env-1'],
			servedFromHistory: 1,
		});
	});

	for (const hasHistory of [false, true]) {
		test(`does not wake on open when auto-connect is disabled (${hasHistory ? 'with' : 'without'} history)`, async () => {
			const harness = await createContribution(store, [discoveredSession({ taskId: hasHistory ? 'task-1' : undefined })], { autoConnectOnOpen: false });

			const opened = await harness.activate('env-1');

			assert.deepStrictEqual({
				opened,
				connectedTo: harness.connectedTo,
				historyRequests: harness.historyRequests,
				servedFromHistory: harness.readOnlySessionTypes.length,
			}, {
				opened: hasHistory,
				connectedTo: [],
				historyRequests: [],
				servedFromHistory: hasHistory ? 1 : 0,
			});
		});
	}

	test('renders history during automatic resume and promotes without replacing its provider or session', async () => {
		const wake = new DeferredPromise<void>();
		const harness = await createContribution(store, [discoveredSession()]);
		harness.onConnect = () => wake.p;
		const activated = await harness.activate('env-1');
		const sessionType = harness.readOnlySessionTypes[0];
		const provider = harness.contentProviders.get(sessionType)!;
		const resource = URI.from({ scheme: sessionType, path: '/sess-1' });
		const session = store.add(await provider.provideChatSessionContent(resource, CancellationToken.None));
		const before = { readOnly: session.isReadOnly?.get(), blocked: session.isInputBlocked?.get(), connected: [...harness.connectedTo], status: session.historyStatus?.get() };
		const live = store.add(new ReadOnlyChatSession(resource, [{
			id: 'turn', type: 'request', prompt: 'Live history', participant: sessionType,
		}], 'Live title', constObservable(false)));
		store.add(harness.registerLiveProvider('env-1', { provideChatSessionContent: async () => live })!);
		await wake.complete();
		await waitForState(session.isReadOnly!, value => !value);
		const reference = store.add(await provider.provideChatSessionContent(resource, CancellationToken.None));

		assert.deepStrictEqual({
			activated, before, sameProvider: harness.contentProviders.get(sessionType) === provider,
			independentReference: reference !== session,
			sameSession: reference.isReadOnly === session.isReadOnly && reference.history === session.history,
			readOnly: session.isReadOnly?.get(), blocked: session.isInputBlocked?.get(), history: session.history, historyRequests: harness.historyRequests,
		}, {
			activated: true, before: { readOnly: true, blocked: true, connected: ['env-1'], status: undefined }, sameProvider: true,
			independentReference: true, sameSession: true, readOnly: false, blocked: false, history: live.history, historyRequests: ['task-1'],
		});
	});

	test('honors enabling auto-connect for the next open without restarting the provider', async () => {
		const harness = await createContribution(store, [discoveredSession()], { autoConnectOnOpen: false });
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'));
		await harness.activate('env-1');
		const before = [...harness.connectedTo];
		await harness.configurationService.setUserConfiguration(CloudSandboxAutoConnectOnOpenSettingId, true);
		const wake = new DeferredPromise<void>();
		harness.onConnect = () => wake.p;

		const opened = await harness.activate('env-1');
		await wake.complete();

		assert.deepStrictEqual({
			before,
			opened,
			connectedTo: harness.connectedTo,
			sameProvider: harness.contribution.stubProviders.get(cloudSandboxAddress('env-1')) === provider,
		}, { before: [], opened: true, connectedTo: ['env-1'], sameProvider: true });
	});

	test('keeps an explicit connection available with auto-connect disabled', async () => {
		const harness = await createContribution(store, [discoveredSession()], { autoConnectOnOpen: false });
		const wake = new DeferredPromise<void>();
		harness.onConnect = () => wake.p;
		await harness.activate('env-1');
		const connection = harness.contribution.connect({ environmentId: 'env-1', sessionId: 'sess-1', name: 'Sandbox' });
		const opened = await harness.activate('env-1');
		await wake.complete();
		await connection;

		assert.deepStrictEqual({
			opened,
			connectedTo: harness.connectedTo,
			servedFromHistory: harness.readOnlySessionTypes.length,
		}, { opened: true, connectedTo: ['env-1'], servedFromHistory: 1 });
	});

	for (const fails of [false, true]) {
		test(`makes history available during an explicit sandbox wake that ${fails ? 'fails' : 'succeeds'}`, async () => {
			const harness = await createContribution(store, [discoveredSession()]);
			const wake = new DeferredPromise<void>();
			harness.onConnect = () => wake.p;
			const connection = harness.contribution.connect({ environmentId: 'env-1', sessionId: 'sess-1', name: 'Sandbox' });
			const connectionResult = connection.then(() => 'connected', () => 'failed');
			const opened = await harness.activate('env-1');

			const duringWake = { opened, historyRequests: [...harness.historyRequests], servedFromHistory: harness.readOnlySessionTypes.length };
			if (fails) {
				await wake.error(new Error('Expected wake failure'));
			} else {
				await wake.complete();
			}

			assert.deepStrictEqual({
				duringWake,
				connection: await connectionResult,
				connectedTo: harness.connectedTo,
				historyRequests: harness.historyRequests,
				servedFromHistory: harness.readOnlySessionTypes.length,
			}, {
				duringWake: { opened: true, historyRequests: [], servedFromHistory: 1 },
				connection: fails ? 'failed' : 'connected',
				connectedTo: ['env-1'],
				historyRequests: [],
				servedFromHistory: 1,
			});
		});
	}

	test('activation lifetime survives content-provider replacement and ends only for the removed environment', async () => {
		const harness = await createContribution(store, [discoveredSession(), discoveredSession({ environmentId: 'env-2', taskId: 'task-2' })], { autoConnectOnOpen: false });
		const type = (environmentId: string) => remoteAgentHostSessionTypeId(agentHostAuthority(cloudSandboxAddress(environmentId)), CLOUD_SANDBOX_AGENT_PROVIDER);
		const activator = Registry.as<IAsyncChatSessionActivationRegistry>(ChatSessionsExtensions.AsyncActivation).getActivators(type('env-1')).find(activator => activator.getActivationToken);
		assert.ok(activator?.getActivationToken);
		const first = activator.getActivationToken(type('env-1'));
		const second = activator.getActivationToken(type('env-2'));
		await harness.activate('env-1');
		const live = store.add(harness.registerLiveProvider('env-1', {
			provideChatSessionContent: async () => { throw new Error('Content is not requested during activation'); },
		})!);
		live.dispose();
		const afterReplacement = first.isCancellationRequested;
		harness.discovered = [discoveredSession({ environmentId: 'env-2', taskId: 'task-2' })];
		await harness.runDiscovery();
		harness.discovered = [discoveredSession(), ...harness.discovered];
		await harness.runDiscovery();
		const renewed = activator.getActivationToken(type('env-1'));
		assert.deepStrictEqual({
			afterReplacement, firstCancelled: first.isCancellationRequested, secondCancelled: second.isCancellationRequested,
			newLifetime: renewed !== first, renewedCancelled: renewed.isCancellationRequested,
		}, { afterReplacement: false, firstCancelled: true, secondCancelled: false, newLifetime: true, renewedCancelled: false });
	});

	for (const teardown of ['feature disable', 'account change', 'disposal'] as const) {
		test(`ends registered activation lifetimes on ${teardown}`, async () => {
			const harness = await createContribution(store, [discoveredSession()]);
			const sessionType = remoteAgentHostSessionTypeId(agentHostAuthority(cloudSandboxAddress('env-1')), CLOUD_SANDBOX_AGENT_PROVIDER);
			const activator = Registry.as<IAsyncChatSessionActivationRegistry>(ChatSessionsExtensions.AsyncActivation).getActivators(sessionType).find(activator => activator.getActivationToken);
			assert.ok(activator?.getActivationToken);
			const token = activator.getActivationToken(sessionType);
			if (teardown === 'feature disable') {
				await harness.setEnabled(false);
			} else if (teardown === 'account change') {
				harness.changeAccount('["github","another-account"]');
			} else {
				harness.contribution.dispose();
			}
			assert.strictEqual(token.isCancellationRequested, true);
		});
	}

	for (const reenable of [false, true]) {
		test(`cancels background waking and clears history when the feature is ${reenable ? 're-enabled' : 'disabled'}`, async () => {
			const wake = new DeferredPromise<void>();
			const harness = await createContribution(store, [discoveredSession()]);
			let connectToken = CancellationToken.None;
			harness.onConnect = (_options, token) => {
				connectToken = token;
				return wake.p;
			};
			const opened = await harness.activate('env-1');

			await harness.setEnabled(false);
			if (reenable) {
				await harness.setEnabled(true);
				await harness.runDiscovery();
			}
			await wake.error(new CancellationError());
			await timeout(0);

			assert.deepStrictEqual({
				opened,
				cancelled: connectToken.isCancellationRequested,
				connectedTo: harness.connectedTo,
				historyRequests: harness.historyRequests,
				readOnlySessionTypes: harness.readOnlySessionTypes,
			}, { opened: true, cancelled: true, connectedTo: ['env-1'], historyRequests: [], readOnlySessionTypes: [] });
		});
	}

	test('does not restore old history after a removed environment is replaced during background waking', async () => {
		const wake = new DeferredPromise<void>();
		let result: ICloudSandboxDiscoveryResult = { kind: 'complete', sessions: [discoveredSession()] };
		const harness = await createContribution(store, [], { listSessions: async () => result });
		harness.onConnect = () => wake.p;
		const opened = await harness.activate('env-1');
		result = { kind: 'complete', sessions: [], removedTaskIds: ['task-1'] };
		await harness.runDiscovery();
		result = { kind: 'complete', sessions: [discoveredSession({ taskId: 'task-2' })] };
		await harness.runDiscovery();
		await wake.error(new Error('Old connection failed'));
		await timeout(0);

		assert.deepStrictEqual({
			opened,
			historyRequests: harness.historyRequests,
			readOnlySessionTypes: harness.readOnlySessionTypes,
		}, { opened: true, historyRequests: [], readOnlySessionTypes: [] });
	});

	test('keeps history available across a discovery refresh during background waking', async () => {
		const wake = new DeferredPromise<void>();
		const harness = await createContribution(store, [discoveredSession()]);
		harness.onConnect = () => wake.p;
		const opened = await harness.activate('env-1');
		await harness.runDiscovery();
		await wake.complete();

		assert.deepStrictEqual({
			opened,
			connectedTo: harness.connectedTo,
			historyRequests: harness.historyRequests,
			servedFromHistory: harness.readOnlySessionTypes.length,
		}, { opened: true, connectedTo: ['env-1'], historyRequests: [], servedFromHistory: 1 });
	});

	test('does not restore history after an old connect fails across disable and re-enable', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		const settled = new DeferredPromise<void>();
		harness.onConnect = async () => {
			await harness.setEnabled(false);
			await harness.setEnabled(true);
			await harness.runDiscovery();
			settled.complete();
			throw new Error('Expected connection failure after teardown');
		};

		const opened = await harness.activate('env-1');
		await settled.p;
		assert.deepStrictEqual({
			opened,
			historyRequests: harness.historyRequests,
			readOnlySessionTypes: harness.readOnlySessionTypes,
		}, { opened: false, historyRequests: [], readOnlySessionTypes: [] });
	});

	test('connects a dormant environment that has no history to fall back on', async () => {
		// Without a task there is nothing to serve read-only, so refusing to connect would leave
		// the session unopenable rather than merely offline. The harness models no live protocol
		// client, so the dial itself is what this asserts.
		const harness = await createContribution(store, [discoveredSession({ taskId: undefined })]);

		await harness.activate('env-1');

		assert.deepStrictEqual({ connectedTo: harness.connectedTo, servedFromHistory: harness.readOnlySessionTypes.length }, {
			connectedTo: ['env-1'],
			servedFromHistory: 0,
		});
	});

	test('settles the status after a failed connect so the connect action comes back', async () => {
		// A wake that exhausts its retry budget fails before any transport entry exists, so no
		// connections-changed event follows. Left alone the provider would sit at `connecting`
		// forever: a permanent spinner, a permanently hidden composer, and no way to retry.
		const harness = await createContribution(store, [discoveredSession()]);
		harness.onConnect = () => Promise.reject(new Error('Timed out waiting for sandbox environment to wake.'));

		await harness.activate('env-1');
		await timeout(0);

		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		await waitForState(provider.connectionStatus, status => status.kind === 'disconnected' && provider.statuses.length >= 2);
		assert.deepStrictEqual(provider.statuses, ['connecting', 'disconnected']);
	});

	test('logs a background incompatibility without showing a notification', async () => {
		const logService = new TestLogService();
		const harness = await createContribution(store, [discoveredSession()], { logService });
		const wake = new DeferredPromise<void>();
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		harness.onConnect = async () => {
			await wake.p;
			provider.setConnectionStatus(RemoteAgentHostConnectionStatus.incompatible('Unsupported protocol', []));
			throw new Error('Unsupported protocol');
		};

		const opened = await harness.activate('env-1');
		await wake.complete();
		await timeout(0);

		assert.deepStrictEqual({
			opened,
			status: provider.connectionStatus.get().kind,
			notifications: harness.notifications.length,
			servedFromHistory: harness.readOnlySessionTypes.length,
			logged: logService.warnings.some(message => String(message).includes('Unsupported protocol')),
		}, { opened: true, status: 'incompatible', notifications: 0, servedFromHistory: 1, logged: true });
	});

	test('provider disconnect uses sandbox cleanup and retains the discovered provider', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		const address = cloudSandboxAddress('env-1');
		const provider = harness.contribution.stubProviders.get(address)!;
		const disconnect = provider.config.disconnectOnDemand;
		assert.ok(disconnect);
		provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connected);

		await disconnect();

		assert.deepStrictEqual({
			disconnectedFrom: harness.disconnectedFrom,
			status: provider.connectionStatus.get().kind,
			disposed: provider.disposed,
		}, { disconnectedFrom: [address], status: 'disconnected', disposed: false });
	});

	test('provider disconnect cancels only its pending connect and permits a fresh attempt', async () => {
		const harness = await createContribution(store, [
			discoveredSession(),
			discoveredSession({ environmentId: 'env-2', sessionId: 'sess-2', taskId: 'task-2' }),
		]);
		const address = cloudSandboxAddress('env-1');
		const provider = harness.contribution.stubProviders.get(address)!;
		const disconnect = provider.config.disconnectOnDemand;
		assert.ok(disconnect);
		const firstReady = new DeferredPromise<void>();
		const secondReady = new DeferredPromise<void>();
		let firstToken = CancellationToken.None;
		let secondToken = CancellationToken.None;
		harness.onConnect = async (_options, token) => {
			firstToken = token;
			await firstReady.p;
		};
		const first = assert.rejects(harness.contribution.connect({ environmentId: 'env-1', name: 'First' }), CancellationError);
		harness.onConnect = async (_options, token) => {
			secondToken = token;
			await secondReady.p;
		};
		const second = harness.contribution.connect({ environmentId: 'env-2', name: 'Second' });

		await disconnect();
		const disconnectedStatus = provider.connectionStatus.get().kind;
		await firstReady.complete();
		await secondReady.complete();
		await first;
		const secondAddress = await second;
		harness.onConnect = undefined;
		const freshAddress = await harness.contribution.connect({ environmentId: 'env-1', name: 'First' });

		assert.deepStrictEqual({
			firstCancelled: firstToken.isCancellationRequested,
			secondCancelled: secondToken.isCancellationRequested,
			disconnectedFrom: harness.disconnectedFrom,
			disconnectedStatus,
			connectedTo: harness.connectedTo,
			secondAddress,
			freshAddress,
		}, {
			firstCancelled: true, secondCancelled: false, disconnectedFrom: [address], disconnectedStatus: 'disconnected',
			connectedTo: ['env-1', 'env-2', 'env-1'], secondAddress: cloudSandboxAddress('env-2'), freshAddress: address,
		});
	});

	test('late provider disconnect completion does not overwrite a new pending connect', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		const disconnect = provider.config.disconnectOnDemand;
		assert.ok(disconnect);
		const removed = new DeferredPromise<void>();
		const credentials = new DeferredPromise<void>();
		harness.onDisconnect = () => removed.p;
		harness.onConnect = () => credentials.p;

		const removing = disconnect();
		const connecting = harness.contribution.connect({ environmentId: 'env-1', name: 'First' });
		await removed.complete();
		await removing;
		const status = provider.connectionStatus.get().kind;
		await credentials.complete();
		await connecting;

		assert.strictEqual(status, 'connecting');
	});
});

suite('CloudSandboxAgentHostContribution startup inventory', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const account = '["github","account-1"]';
	const storageKey = `sessions.cloudSandbox.inventory.${account}`;

	function entryKey(session: ICloudSandboxDiscoveredSession, accountKey = account): string {
		return `sessions.cloudSandbox.inventory.${accountKey}.${JSON.stringify(['task', session.taskId])}`;
	}

	test('restores archived and active offline inventory with bounded provider and resolution notifications', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const nextAccount = '["github","next-account"]';
		const sessions = Array.from({ length: 150 }, (_, index) => discoveredSession({
			environmentId: `env-${index}`, sessionId: `session-${index}`, taskId: `task-${index}`, isArchived: index >= 30,
		}));
		for (const session of sessions) {
			storageService.store(entryKey(session, nextAccount), JSON.stringify({ version: 1, sessions: [session] }), StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		const harness = await createContribution(store, [], {
			storageService, materializeTasks: false, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		const snapshots: { added: number; removed: number }[] = [];
		let resolutions = 0;
		store.add(harness.providersService.onDidChangeProviders(event => snapshots.push({
			added: event.added.length,
			removed: event.removed.length,
		})));
		store.add(harness.resolutionService.onDidChangeSessionResolution(() => resolutions++));
		const providersChanged = observableSignalFromEvent('providers', harness.providersService.onDidChangeProviders);
		const resolutionChanged = observableSignalFromEvent('resolution', harness.resolutionService.onDidChangeSessionResolution);
		const observedInventories: number[] = [];
		store.add(autorun(reader => {
			providersChanged.read(reader);
			resolutionChanged.read(reader);
			observedInventories.push(harness.providersService.getProviders({ includeSessionBackends: true }).length);
		}));
		harness.changeAccount(nextAccount);
		await harness.runDiscovery();
		const restored = {
			resolutions,
			archived: [...harness.contribution.catalogTasks.values()].filter(task => task.isArchived).length,
			backends: harness.contribution.stubProviders.size,
		};
		harness.contribution.dispose();
		assert.deepStrictEqual({ snapshots, restored, resolutions, observedInventories, connected: harness.connectedTo, cached: readInventory(storageService, nextAccount).length }, {
			snapshots: [
				{ added: 0, removed: 1 },
			],
			restored: { resolutions: 0, archived: 120, backends: 0 }, resolutions: 0, observedInventories: [2, 1], connected: [], cached: 150,
		});
	});

	test('updates a discovered catalog without provider registration or resolution notifications', async () => {
		const harness = await createContribution(store, [], { materializeTasks: false });
		const snapshots: { added: number; removed: number; sessions: number }[] = [];
		let resolutions = 0;
		store.add(harness.providersService.onDidChangeProviders(event => snapshots.push({
			added: event.added.length,
			removed: event.removed.length,
			sessions: event.added.filter(provider => provider instanceof StubProvider).reduce((count, provider) => count + provider.seeded.length, 0),
		})));
		store.add(harness.resolutionService.onDidChangeSessionResolution(() => resolutions++));
		const rows: number[] = [];
		harness.discovered = Array.from({ length: 150 }, (_, index) => discoveredSession({
			environmentId: `env-${index}`, sessionId: `session-${index}`, taskId: `task-${index}`,
		}));
		await harness.runDiscovery();
		rows.push(harness.contribution.catalogTasks.size);
		await harness.runDiscovery();
		rows.push(harness.contribution.catalogTasks.size);
		harness.discovered = [];
		await harness.runDiscovery();
		rows.push(harness.contribution.catalogTasks.size);
		assert.deepStrictEqual({ snapshots, resolutions, rows, backends: harness.contribution.stubProviders.size, connected: harness.connectedTo }, {
			snapshots: [], resolutions: 0, rows: [150, 150, 0], backends: 0, connected: [],
		});
	});

	function readInventory(storageService: IStorageService, accountKey = account): readonly ICloudSandboxDiscoveredSession[] {
		return storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE)
			.filter(key => key.startsWith(`sessions.cloudSandbox.inventory.${accountKey}.`))
			.flatMap(key => {
				const cached = storageService.getObject<{ sessions: ICloudSandboxDiscoveredSession[] }>(key, StorageScope.PROFILE);
				assert.ok(cached);
				return cached.sessions;
			});
	}

	class IsolatedWindowStorageService extends InMemoryStorageService {
		constructor(private readonly shared: IStorageService) {
			super();
			for (const key of shared.keys(StorageScope.PROFILE, StorageTarget.MACHINE)) {
				super.store(key, shared.get(key, StorageScope.PROFILE), StorageScope.PROFILE, StorageTarget.MACHINE, true);
			}
		}

		override store(key: string, value: StorageValue, scope: StorageScope, target: StorageTarget, external = false): void {
			super.store(key, value, scope, target, external);
			if (!external && value !== undefined && value !== null) {
				this.shared.store(key, value, scope, target);
			}
		}

		override remove(key: string, scope: StorageScope, external = false): void {
			super.remove(key, scope, external);
			if (!external) {
				this.shared.remove(key, scope);
			}
		}
	}

	for (const application of ['copilot-cli', undefined]) {
		test(`preserves creating application through offline inventory restoration: ${application}`, async () => {
			const storageService = store.add(new InMemoryStorageService());
			const session = discoveredSession({ application, eventType: 'slack' });
			const first = await createContribution(store, [session], { storageService });
			const before = first.contribution.stubProviders.get(cloudSandboxAddress(session.environmentId))!.seeded.map(meta => readSessionInitiator(meta));
			first.contribution.dispose();
			const restored = await createContribution(store, [], {
				storageService, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
			});
			assert.deepStrictEqual({
				before,
				restored: restored.contribution.stubProviders.get(cloudSandboxAddress(session.environmentId))!.seeded.map(meta => readSessionInitiator(meta)),
				cachedApplication: readInventory(storageService)[0].application,
				connected: [...first.connectedTo, ...restored.connectedTo],
			}, {
				before: [{ name: application ?? 'slack' }],
				restored: [{ name: application ?? 'slack' }],
				cachedApplication: application,
				connected: [],
			});
		});
	}

	test('does not inherit creating application when provisioning another task in the same environment', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = await createContribution(store, [discoveredSession({ application: 'copilot-cli' })], {
			storageService,
			createSession: async () => ({ environmentId: 'env-1', sessionId: 'sess-2', taskId: 'task-2' }),
		});
		await first.contribution.provisionSession({ prompt: 'Metadata test' }, CancellationToken.None);
		first.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		const provider = restored.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		assert.deepStrictEqual({
			cached: readInventory(storageService).map(session => [session.taskId, session.application]),
			initiators: provider.seeded.map(meta => [AgentSession.id(meta.session), readSessionInitiator(meta)?.name]),
		}, {
			cached: [['task-1', 'copilot-cli'], ['task-2', undefined]],
			initiators: [['sess-1', 'copilot-cli'], ['sess-2', undefined]],
		});
	});

	test('restores session rows and repository metadata before discovery finishes without connecting', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const session = discoveredSession();
		const first = await createContribution(store, [session], { storageService });
		first.contribution.dispose();
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const started = new DeferredPromise<void>();
		const restored = await createContribution(store, [], {
			storageService, waitForDiscovery: false,
			listSessions: async () => {
				await started.complete();
				return pending.p;
			},
		});
		await started.p;
		const provider = restored.contribution.stubProviders.get(cloudSandboxAddress(session.environmentId));
		const folder = toAgentHostUri(URI.file('/workspaces/repo'), agentHostAuthority(cloudSandboxAddress(session.environmentId)));

		assert.deepStrictEqual({
			offlineTrusted: (await restored.workspaceTrust.getUriTrustInfo(folder)).trusted,
			previousRegistrationReleased: (await first.workspaceTrust.getUriTrustInfo(folder)).trusted,
			cached: readInventory(storageService),
			machineKeys: storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE),
			seeded: provider?.seeded.map(meta => ({
				id: AgentSession.id(meta.session), title: meta.summary,
				modifiedTime: meta.modifiedTime, repository: meta.project?.displayName,
			})),
			connected: restored.connectedTo,
			history: restored.historyRequests,
		}, {
			offlineTrusted: true,
			previousRegistrationReleased: false,
			cached: [{ ...session, isArchived: false }],
			machineKeys: [entryKey(session)],
			seeded: [{ id: session.sessionId, title: session.name, modifiedTime: Date.parse(session.updatedAt!), repository: session.repoName }],
			connected: [], history: [],
		});
		await pending.complete({ kind: 'complete', sessions: [session] });
		await restored.runDiscovery();
		await restored.activate(session.environmentId);
		const sessionType = restored.readOnlySessionTypes[0];
		store.add(await restored.contentProviders.get(sessionType)!.provideChatSessionContent(
			URI.from({ scheme: sessionType, path: `/${session.sessionId}` }), CancellationToken.None));
		assert.deepStrictEqual(restored.historyRequests, [session.taskId]);
	});

	test('keeps restored rows on failure and persists removals only after authoritative discovery', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = await createContribution(store, [discoveredSession()], { storageService });
		first.contribution.dispose();
		let result: ICloudSandboxDiscoveryResult = { kind: 'failed', reason: 'offline' };
		const restored = await createContribution(store, [], { storageService, listSessions: async () => result });
		const provider = restored.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		const retained = !provider.disposed;
		result = { kind: 'complete', sessions: [] };
		await restored.runDiscovery();
		restored.contribution.dispose();
		const next = await createContribution(store, [], {
			storageService, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});

		assert.deepStrictEqual({
			retained, removed: provider.disposed,
			cached: readInventory(storageService),
			reappeared: next.contribution.stubProviders.size,
		}, { retained: true, removed: true, cached: [], reappeared: 0 });
	});

	test('merges partial discoveries into the saved inventory and persists explicit removals', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = await createContribution(store, [discoveredSession()], { storageService });
		first.contribution.dispose();
		const other = discoveredSession({ environmentId: 'env-2', sessionId: 'sess-2', taskId: 'task-2' });
		let result: ICloudSandboxDiscoveryResult = { kind: 'partial', sessions: [other] };
		const restored = await createContribution(store, [], { storageService, listSessions: async () => result });
		const merged = readInventory(storageService);
		result = { kind: 'incremental', sessions: [], removedTaskIds: ['task-1'] };
		await restored.runDiscovery();

		assert.deepStrictEqual({
			merged, afterRemoval: readInventory(storageService),
		}, {
			merged: [discoveredSession({ isArchived: false }), { ...other, isArchived: false }],
			afterRemoval: [{ ...other, isArchived: false }],
		});
	});

	test('persists filtered stalled sandbox removals so the row does not return on restart', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const session = discoveredSession({ name: 'New remote session', status: SessionStatus.InProgress });
		const first = await createContribution(store, [session], { storageService });
		first.contribution.dispose();
		let result: ICloudSandboxDiscoveryResult = { kind: 'failed', reason: 'offline' };
		const restored = await createContribution(store, [], { storageService, listSessions: async () => result });
		const provider = restored.contribution.stubProviders.get(cloudSandboxAddress(session.environmentId))!;
		result = { kind: 'incremental', sessions: [], removedTaskIds: [session.taskId] };
		await restored.runDiscovery();
		restored.contribution.dispose();
		const next = await createContribution(store, [], {
			storageService, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});

		assert.deepStrictEqual({
			removed: provider.disposed,
			cached: readInventory(storageService),
			restored: next.contribution.stubProviders.size,
			connections: [...restored.connectedTo, ...next.connectedTo],
			history: [...restored.historyRequests, ...next.historyRequests],
		}, { removed: true, cached: [], restored: 0, connections: [], history: [] });
	});

	test('refreshes existing provider metadata and persists repository replacement and removal', async () => {
		const storageService = store.add(new InMemoryStorageService());
		let result: ICloudSandboxDiscoveryResult = { kind: 'complete', sessions: [discoveredSession()] };
		const harness = await createContribution(store, [], { storageService, listSessions: async () => result });
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		const updated = discoveredSession({
			name: 'Renamed task', repoName: 'owner/other', updatedAt: '2026-09-22T11:00:00Z',
		});
		result = { kind: 'incremental', sessions: [updated], removedTaskIds: [] };
		await harness.runDiscovery();
		const replacedRepository = provider.seeded[0].project?.displayName;
		const withoutRepository = { ...updated, repoName: undefined };
		result = { kind: 'incremental', sessions: [withoutRepository], removedTaskIds: [] };
		await harness.runDiscovery();

		assert.deepStrictEqual({
			sameProvider: harness.contribution.stubProviders.get(cloudSandboxAddress('env-1')) === provider,
			disposed: provider.disposed,
			label: provider.label,
			title: provider.seeded[0].summary,
			modifiedTime: provider.seeded[0].modifiedTime,
			replacedRepository,
			project: provider.seeded[0].project,
			cached: readInventory(storageService).map(session => ({ name: session.name, repoName: session.repoName, updatedAt: session.updatedAt })),
		}, {
			sameProvider: true,
			disposed: false,
			label: updated.name,
			title: updated.name,
			modifiedTime: Date.parse(updated.updatedAt!),
			replacedRepository: 'owner/other',
			project: undefined,
			cached: [{ name: updated.name, repoName: undefined, updatedAt: updated.updatedAt }],
		});
	});

	test('never restores another account inventory or displays it while signed out', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = await createContribution(store, [discoveredSession()], { storageService });
		first.contribution.dispose();
		const other = await createContribution(store, [], {
			storageService, accountKey: '["github","account-2"]',
			listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		const otherAccountRows = other.contribution.stubProviders.size;
		other.changeAccount(account);
		const ownCached = other.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		const restoredImmediately = !ownCached.disposed;
		await other.runDiscovery();
		other.changeAccount(undefined);
		await other.runDiscovery();
		const signedOut = await createContribution(store, [], { storageService, accountKey: null });

		assert.deepStrictEqual({
			otherAccountRows, restoredImmediately, hiddenOnSignOut: ownCached.disposed,
			signedOutRows: signedOut.contribution.stubProviders.size,
			signedOutRequests: signedOut.discoveryModes,
			saved: readInventory(storageService),
		}, {
			otherAccountRows: 0, restoredImmediately: true, hiddenOnSignOut: true,
			signedOutRows: 0, signedOutRequests: [],
			saved: [discoveredSession({ isArchived: false })],
		});
	});

	test('does not treat a refresh without a timestamp as new session activity', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const session = discoveredSession({ updatedAt: undefined });
		const harness = await createContribution(store, [session]);
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress(session.environmentId))!;
		const modifiedTime = provider.seeded[0].modifiedTime;
		await timeout(60_000);
		harness.discovered = [{ ...session, name: 'Renamed without a timestamp' }];
		await harness.runDiscovery();

		assert.deepStrictEqual({
			title: provider.seeded[0].summary,
			modifiedTime: provider.seeded[0].modifiedTime,
			elapsed: Date.now() - modifiedTime,
		}, { title: 'Renamed without a timestamp', modifiedTime, elapsed: 60_000 });
	}));

	test('does not dispose providers when credentials change for the same account', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		harness.changeAccount(account);
		await harness.runDiscovery();

		assert.deepStrictEqual({
			disposed: provider.disposed,
			same: harness.contribution.stubProviders.get(cloudSandboxAddress('env-1')) === provider,
		}, { disposed: false, same: true });
	});

	test('ignores an old account discovery result after switching accounts', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const started = new DeferredPromise<void>();
		let block = false;
		let oldToken: CancellationToken | undefined;
		let sessions = [discoveredSession()];
		const harness = await createContribution(store, [], {
			storageService,
			listSessions: async token => {
				if (block) {
					oldToken = token;
					await started.complete();
					return pending.p;
				}
				return { kind: 'complete', sessions };
			},
		});
		block = true;
		const previous = harness.runDiscovery();
		await started.p;
		const otherAccount = '["github","account-2"]';
		harness.changeAccount(otherAccount);
		block = false;
		sessions = [discoveredSession({ environmentId: 'env-2', sessionId: 'sess-2', taskId: 'task-2' })];
		const current = harness.runDiscovery();
		await pending.complete({ kind: 'complete', sessions: [discoveredSession({ environmentId: 'late' })] });
		await Promise.all([previous, current]);

		assert.deepStrictEqual({
			cancelled: oldToken?.isCancellationRequested,
			visible: [...harness.contribution.stubProviders].filter(([, provider]) => !provider.disposed).map(([address]) => address),
			previousAccount: readInventory(storageService),
			currentAccount: readInventory(storageService, otherAccount),
		}, {
			cancelled: true, visible: [cloudSandboxAddress('env-2')],
			previousAccount: [discoveredSession({ isArchived: false })],
			currentAccount: sessions.map(session => ({ ...session, isArchived: false })),
		});
	});

	test('an older scan cannot discard a session provisioned in another window before storage events arrive', async () => {
		const shared = store.add(new InMemoryStorageService());
		const firstStorage = store.add(new IsolatedWindowStorageService(shared));
		const first = await createContribution(store, [discoveredSession()], { storageService: firstStorage });
		const secondStorage = store.add(new IsolatedWindowStorageService(shared));
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const started = new DeferredPromise<void>();
		let block = false;
		const second = await createContribution(store, [], {
			storageService: secondStorage,
			listSessions: async () => {
				if (block) {
					await started.complete();
					return pending.p;
				}
				return { kind: 'complete', sessions: [discoveredSession()] };
			},
		});
		block = true;
		const olderScan = second.runDiscovery();
		await started.p;
		first.onConnect = async () => { throw new Error('offline'); };
		await assert.rejects(first.contribution.provisionSession({ prompt: 'hello' }, CancellationToken.None), /Cloud setup started, but VS Code couldn't connect/);
		await pending.complete({ kind: 'complete', sessions: [discoveredSession()] });
		await olderScan;
		first.contribution.dispose();
		second.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService: store.add(new IsolatedWindowStorageService(shared)),
			listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});

		assert.deepStrictEqual({
			staleWindowInventory: readInventory(secondStorage).map(session => session.sessionId),
			saved: readInventory(shared).map(session => session.sessionId).sort(),
			restored: [...restored.contribution.stubProviders.keys()].sort(),
			connected: restored.connectedTo,
		}, {
			staleWindowInventory: ['sess-1'],
			saved: ['sess-1', 'sess-new'],
			restored: [cloudSandboxAddress('env-1'), cloudSandboxAddress('env-new')],
			connected: [],
		});
	});

	test('does not replay unchanged inventory over another window metadata updates or removals', async () => {
		const shared = store.add(new InMemoryStorageService());
		const first = await createContribution(store, [discoveredSession()], {
			storageService: store.add(new IsolatedWindowStorageService(shared)),
		});
		const second = await createContribution(store, [discoveredSession()], {
			storageService: store.add(new IsolatedWindowStorageService(shared)),
		});
		const updated = discoveredSession({ name: 'Renamed in another window', updatedAt: '2026-09-22T11:00:00Z' });
		first.discovered = [updated];
		await first.runDiscovery();
		await second.runDiscovery();
		const afterUpdate = readInventory(shared);
		first.discovered = [];
		await first.runDiscovery();
		await second.runDiscovery();

		assert.deepStrictEqual({ afterUpdate, afterRemoval: readInventory(shared) }, {
			afterUpdate: [{ ...updated, isArchived: false }],
			afterRemoval: [],
		});
	});

	test('migrates a legacy account snapshot before awaiting network discovery', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const sessions = [discoveredSession(), discoveredSession({ environmentId: 'env-2', sessionId: 'sess-2', taskId: 'task-2' })];
		storageService.store(storageKey, { version: 1, sessions }, StorageScope.PROFILE, StorageTarget.MACHINE);
		const harness = await createContribution(store, [], {
			storageService, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});

		assert.deepStrictEqual({
			saved: readInventory(storageService),
			legacy: storageService.get(storageKey, StorageScope.PROFILE),
			rows: [...harness.contribution.stubProviders.keys()],
		}, {
			saved: sessions,
			legacy: undefined,
			rows: [cloudSandboxAddress('env-1'), cloudSandboxAddress('env-2')],
		});
	});

	test('restores newly provisioned sessions even when connecting failed before the next discovery', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = await createContribution(store, [], { storageService });
		first.onConnect = async () => { throw new Error('offline'); };
		await assert.rejects(first.contribution.provisionSession({ repoNwo: 'owner/repository', prompt: 'hello' }, CancellationToken.None), /Cloud setup started, but VS Code couldn't connect/);
		first.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});

		assert.deepStrictEqual({
			sessions: restored.contribution.stubProviders.get(cloudSandboxAddress('env-new'))?.seeded.map(meta => ({
				id: AgentSession.id(meta.session), repository: meta.project?.displayName,
			})),
			connected: restored.connectedTo,
		}, { sessions: [{ id: 'sess-new', repository: 'owner/repository' }], connected: [] });
	});

	test('does not restore inventory while disabled and restores it on enablement', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = await createContribution(store, [discoveredSession()], { storageService });
		first.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService, enabled: false,
			listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		const disabledRows = restored.contribution.stubProviders.size;
		await restored.configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, true);
		await restored.setEnabled(true);
		await restored.runDiscovery();

		assert.deepStrictEqual({
			disabledRows, restoredRows: [...restored.contribution.stubProviders.keys()],
		}, { disabledRows: 0, restoredRows: [cloudSandboxAddress('env-1')] });
	});

	test('reports invalid cached inventory and continues with discovery', async () => {
		const storageService = store.add(new InMemoryStorageService());
		storageService.store(storageKey, { version: 1, sessions: [{ ...discoveredSession(), taskId: 42 }] }, StorageScope.PROFILE, StorageTarget.MACHINE);
		const logService = new TestLogService();
		const harness = await createContribution(store, [], { storageService, logService });

		assert.deepStrictEqual({
			rows: harness.contribution.stubProviders.size,
			warnings: logService.warnings,
		}, { rows: 0, warnings: ['[CloudSandboxAgentHost] Ignoring invalid cached sandbox inventory.'] });
	});

	test('continues discovery when cached inventory JSON cannot be read', async () => {
		const storageService = store.add(new InMemoryStorageService());
		storageService.store(storageKey, '{invalid', StorageScope.PROFILE, StorageTarget.MACHINE);
		const logService = new TestLogService();
		const harness = await createContribution(store, [discoveredSession()], { storageService, logService });

		assert.deepStrictEqual({
			rows: [...harness.contribution.stubProviders.keys()],
			warnings: logService.warnings,
		}, {
			rows: [cloudSandboxAddress('env-1')],
			warnings: ['[CloudSandboxAgentHost] Reading cached sandbox inventory failed.'],
		});
	});
});

suite('CloudSandboxAgentHostContribution discovery refresh', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('successive short-gap reconnects send since from the last successful list until full repair is due', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const requests: { since: string | null; environment: string | null; repository: string | null; archived: string | null; limit: string | null; page: string | null }[][] = [];
		let currentRequests: typeof requests[number] = [];
		const api = store.add(new CloudSandboxApiService(
			new class extends mock<IRequestService>() {
				override async request(options: { url?: string }) {
					const query = new URL(options.url!).searchParams;
					currentRequests.push({
						since: query.get('since'), environment: query.get('include_environment_kinds'),
						repository: query.get('with_repo'), archived: query.get('is_archived'), limit: query.get('per_page'), page: query.get('page'),
					});
					return { res: { statusCode: 200, headers: { date: new Date().toUTCString() } }, stream: bufferToStream(VSBuffer.fromString('{"tasks":[]}')) };
				}
			}(),
			new class extends mock<IAuthenticationService>() {
				override readonly onDidChangeSessions = Event.None;
				override readonly onDidRegisterAuthenticationProvider = Event.None;
				override readonly onDidUnregisterAuthenticationProvider = Event.None;
				override async getSessions() { return [{ id: 'auth', accessToken: 'token', account: { id: 'account-1', label: 'Account' }, scopes: [] }]; }
			}(),
			upcastPartial<IProductService>({}), new NullLogService(),
			new class extends mock<ICloudSandboxTelemetryService>() {
				override reportDiscovery() { }
				override reportRequest() { }
			}(),
			new class extends mock<IWorkbenchGitHubService>() { }(),
			new class extends mock<IUserDataProfileService>() {
				override readonly currentProfile = upcastPartial<IUserDataProfile>({ id: 'test-profile' });
				override readonly onDidChangeCurrentProfile = Event.None;
			}(),
		));
		const checkpoints: (string | null)[] = [null];
		const checkpoint = () => new Date(Date.parse(new Date().toUTCString()) - 60_000).toISOString();
		const h = await createContribution(store, [], {
			sessionFeed: { connected: true, start: async () => { }, dispose: () => { } },
			listSessions: async (token, options) => {
				currentRequests = [];
				const result = await api.listSessions(token, options);
				requests.push(currentRequests);
				return result;
			},
		});
		h.setFocused(false);
		let lastCheckpoint = checkpoint();
		for (const elapsed of [2, 2, 4, 6, 2]) {
			await timeout(elapsed * 60_000);
			checkpoints.push(checkpoints.length === 5 ? null : lastCheckpoint);
			await h.contribution.refreshFeed('reconnect');
			lastCheckpoint = checkpoint();
		}
		await h.runDiscovery();
		checkpoints.push(null);
		assert.deepStrictEqual(requests, checkpoints.map(since => ['true', 'false'].map(repository => ({
			since, environment: since ? 'managed-sandbox' : null, repository, archived: 'false', limit: '100', page: '1',
		}))));
	}));

	for (const inventoryComplete of [false, true]) {
		test(`renewals retry details incrementally only after the inventory was enumerated (inventoryComplete=${inventoryComplete})`, async () => {
			const requests: (ICloudSandboxDiscoveryOptions | undefined)[] = [];
			const session = discoveredSession();
			const harness = await createContribution(store, [session], {
				listSessions: async (_token, options) => {
					requests.push(options);
					return { kind: 'partial', sessions: requests.length === 1 ? [session] : [], inventoryComplete };
				},
			});
			const provider = harness.contribution.stubProviders.get(cloudSandboxAddress(session.environmentId))!;
			await harness.contribution.refreshFeed('renewal');
			await harness.contribution.refreshFeed('renewal');
			assert.deepStrictEqual({
				requests: requests.map(({ diagnostics, ...options }: ICloudSandboxDiscoveryOptions = {}) => options),
				reasons: requests.map(options => options?.diagnostics?.fullScanReason),
				retained: !provider.disposed, rows: provider.seeded.map(session => session.summary),
			}, {
				requests: [
					{ incremental: false, includeArchived: false, trigger: 'startup' },
					{ incremental: inventoryComplete, includeArchived: false, trigger: 'feedRenewal' },
					{ incremental: inventoryComplete, includeArchived: false, trigger: 'feedRenewal' },
				],
				reasons: ['initial', inventoryComplete ? 'notFull' : 'initial', inventoryComplete ? 'notFull' : 'initial'],
				retained: true, rows: [session.name],
			});
		});
	}

	test('enumerated archives with unresolved details are retained across collapse and expansion without another full scan', async () => {
		const requests: (ICloudSandboxDiscoveryOptions | undefined)[] = [];
		const completed = new DeferredPromise<void>();
		const harness = await createContribution(store, [], {
			listSessions: async (_token, options) => {
				requests.push(options);
				if (options?.includeArchived) {
					return { kind: 'partial', sessions: [], inventoryComplete: true };
				}
				return { kind: 'scoped', sessions: [], removedTaskIds: [] };
			},
		});
		store.add(autorun(reader => {
			if (harness.archiveProvider!.state.read(reader) === 'loaded') {
				void completed.complete();
			}
		}));
		harness.archiveProvider!.setRequested(true);
		await completed.p;
		harness.archiveProvider!.setRequested(false);
		harness.archiveProvider!.setRequested(true);
		await harness.contribution.refreshFeed('renewal');
		assert.deepStrictEqual(requests.map(({ diagnostics, ...options }: ICloudSandboxDiscoveryOptions = {}) => options), [
			{ incremental: false, includeArchived: false, trigger: 'startup' },
			{ incremental: false, includeArchived: true, trigger: 'manual' },
			{ incremental: true, includeArchived: true, trigger: 'feedRenewal' },
		]);
	});

	test('a connected feed still processes task hints and renewal and reconnect catch-up', async () => {
		const requests: (ICloudSandboxDiscoveryOptions | undefined)[] = [];
		const harness = await createContribution(store, [discoveredSession()], {
			sessionFeed: { connected: true, start: async () => { }, dispose: () => { } },
			listSessions: async (_token, options) => {
				requests.push(options);
				return options?.incremental
					? { kind: 'incremental', sessions: [], removedTaskIds: [] }
					: { kind: 'complete', sessions: [discoveredSession()] };
			},
		});
		await harness.contribution.refreshTasks(['changed-task']);
		await harness.contribution.refreshFeed('renewal');
		await harness.contribution.refreshFeed('reconnect');

		assert.deepStrictEqual(requests.map(({ diagnostics, ...options }: ICloudSandboxDiscoveryOptions = {}) => options), [
			{ incremental: false, includeArchived: false, trigger: 'startup' },
			{ incremental: true, includeArchived: false, trigger: 'feedChange', taskIds: ['changed-task'] },
			{ incremental: true, includeArchived: false, trigger: 'feedRenewal' },
			{ incremental: true, includeArchived: false, trigger: 'feedReconnect' },
		]);
	});

	test('feed catch-up stays incremental without postponing periodic full reconciliation', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const requests: (ICloudSandboxDiscoveryOptions | undefined)[] = [];
		let sessions = [discoveredSession()];
		const harness = await createContribution(store, sessions, {
			sessionFeed: { connected: true, start: async () => { }, dispose: () => { } },
			listSessions: async (_token, options) => {
				requests.push(options);
				return options?.incremental
					? { kind: 'incremental', sessions: [], removedTaskIds: [] }
					: { kind: 'complete', sessions };
			},
		});
		harness.setFocused(false);
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		sessions = [];
		await timeout(8 * 60_000);
		await harness.contribution.refreshFeed('renewal');
		const retainedAfterRenewal = !provider.disposed;
		await timeout(8 * 60_000);
		await harness.contribution.refreshFeed('renewal');
		const removedAfterPeriodicFullScan = provider.disposed;
		await harness.contribution.refreshFeed('reconnect');
		assert.deepStrictEqual({
			requests: requests.map(({ diagnostics, ...options }: ICloudSandboxDiscoveryOptions = {}) => options), retainedAfterRenewal, removedAfterPeriodicFullScan,
			diagnostics: requests.map(options => options?.diagnostics),
		}, {
			requests: [
				{ incremental: false, includeArchived: false, trigger: 'startup' },
				{ incremental: true, includeArchived: false, trigger: 'feedRenewal' },
				{ incremental: false, includeArchived: false, trigger: 'feedRenewal' },
				{ incremental: true, includeArchived: false, trigger: 'feedReconnect' },
			],
			retainedAfterRenewal: true,
			removedAfterPeriodicFullScan: true,
			diagnostics: [
				{ intentMode: 'full', fullScanReason: 'initial', previousInventoryAgeMs: undefined, lastFullAgeMs: undefined, queued: false, coalescedRequestCount: 1, coalescedTrigger: 'manual' },
				{ intentMode: 'incremental', fullScanReason: 'notFull', previousInventoryAgeMs: 480_000, lastFullAgeMs: 480_000, queued: false, coalescedRequestCount: 0, coalescedTrigger: undefined },
				{ intentMode: 'incremental', fullScanReason: 'reconciliationDue', previousInventoryAgeMs: 480_000, lastFullAgeMs: 960_000, queued: false, coalescedRequestCount: 0, coalescedTrigger: undefined },
				{ intentMode: 'incremental', fullScanReason: 'notFull', previousInventoryAgeMs: 0, lastFullAgeMs: 0, queued: false, coalescedRequestCount: 0, coalescedTrigger: undefined },
			],
		});
	}));

	for (const manual of [false, true]) {
		test(`coalesced reconnects and config restarts preserve incremental intent unless repair is queued (manual=${manual})`, async () => {
			const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
			const entered = new DeferredPromise<void>();
			let hold = false;
			const requests: (ICloudSandboxDiscoveryOptions | undefined)[] = [];
			const harness = await createContribution(store, [], {
				listSessions: async (_token, options) => {
					requests.push(options);
					if (hold) {
						await entered.complete();
						return pending.p;
					}
					return options?.incremental
						? { kind: 'incremental', sessions: [], removedTaskIds: [] }
						: { kind: 'complete', sessions: [] };
				},
			});
			hold = true;
			const first = harness.contribution.refreshFeed('reconnect');
			await entered.p;
			await harness.setSessionFeedEnabled(false);
			await harness.setSessionFeedEnabled(true);
			const queued = harness.contribution.refreshFeed('reconnect');
			const queuedAgain = harness.contribution.refreshFeed('reconnect');
			const full = manual ? harness.runDiscovery() : Promise.resolve();
			hold = false;
			await pending.complete({ kind: 'incremental', sessions: [], removedTaskIds: [] });
			await Promise.all([first, queued, queuedAgain, full]);
			assert.deepStrictEqual({
				requests: requests.map(({ diagnostics, ...options }: ICloudSandboxDiscoveryOptions = {}) => options),
				queue: requests.map(options => [options?.diagnostics?.queued, options?.diagnostics?.coalescedRequestCount, options?.diagnostics?.coalescedTrigger]),
			}, {
				requests: [
					{ incremental: false, includeArchived: false, trigger: 'startup' },
					{ incremental: true, includeArchived: false, trigger: 'feedReconnect' },
					{ incremental: !manual, includeArchived: false, trigger: manual ? 'manual' : 'configurationChange' },
				],
				queue: [[false, 1, 'manual'], [false, 0, undefined], [true, manual ? 4 : 3, 'multiple']],
			});
		});
	}

	for (const connected of [false, true]) {
		test(`automatic rediscovery honors freshness and feed availability; explicit rediscovery repairs (connected=${connected})`, () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const requests: (ICloudSandboxDiscoveryOptions | undefined)[] = [];
			const h = await createContribution(store, [discoveredSession()], {
				sessionFeed: { connected, start: async () => { }, dispose: () => { } },
				listSessions: async (_token, options) => {
					requests.push(options);
					return options?.incremental ? { kind: 'incremental', sessions: [], removedTaskIds: [] } : { kind: 'complete', sessions: [discoveredSession()] };
				},
			});
			await h.runDiscovery('automatic');
			h.setFocused(false);
			await timeout(5 * 60_000);
			h.setFocused(true);
			await h.runDiscovery('automatic');
			await h.runDiscovery();
			assert.deepStrictEqual(requests.map(({ diagnostics, ...options }: ICloudSandboxDiscoveryOptions = {}) => options), [
				{ incremental: false, includeArchived: false, trigger: 'startup' },
				...connected ? [] : [{ incremental: true, includeArchived: false, trigger: 'focus' }],
				{ incremental: false, includeArchived: false, trigger: 'manual' },
			]);
		}));
	}

	test('equivalent account refresh and feed configuration restarts retain the baseline and provider', async () => {
		const requests: (ICloudSandboxDiscoveryOptions | undefined)[] = [];
		const listed = new DeferredPromise<void>();
		let negotiations = 0;
		const h = await createContribution(store, [discoveredSession()], {
			connectSessionFeed: async () => { negotiations++; return undefined; },
			listSessions: async (_token, options) => {
				requests.push(options);
				if (options?.trigger === 'accountChange') {
					void listed.complete();
				}
				return options?.incremental ? { kind: 'incremental', sessions: [], removedTaskIds: [] } : { kind: 'complete', sessions: [discoveredSession()] };
			},
		});
		const provider = h.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		await h.setSessionFeedEnabled(false);
		await h.contribution.checkForUpdates();
		await h.setSessionFeedEnabled(true);
		await h.contribution.checkForUpdates();
		h.changeAccount('["github","account-1"]');
		await listed.p;
		await h.contribution.checkForUpdates();
		assert.deepStrictEqual({ requests: requests.map(({ diagnostics, ...options }: ICloudSandboxDiscoveryOptions = {}) => options), disposed: provider.disposed, disconnects: h.disconnectedFrom, negotiations }, {
			requests: [
				{ incremental: false, includeArchived: false, trigger: 'startup' },
				{ incremental: true, includeArchived: false, trigger: 'configurationChange' },
				{ incremental: true, includeArchived: false, trigger: 'configurationChange' },
				{ incremental: true, includeArchived: false, trigger: 'accountChange' },
			],
			disposed: false, disconnects: [], negotiations: 2,
		});
	});

	for (const pendingHint of ['debounced', 'queued'] as const) {
		test(`same-account refresh preserves ${pendingHint} task removal checks without restarting the feed`, () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
			const entered = new DeferredPromise<void>();
			const session = discoveredSession();
			const batches: (readonly string[])[] = [];
			let removal = Promise.resolve();
			let starts = 0;
			let started = false;
			let disposals = 0;
			const debounce = store.add(new RunOnceScheduler(() => {
				removal = harness.contribution.refreshTasks([session.taskId]);
			}, 500));
			const harness = await createContribution(store, [session], {
				sessionFeed: {
					connected: true,
					start: async () => { if (!started) { started = true; starts++; } },
					dispose: () => { started = false; disposals++; debounce.cancel(); },
				},
				listSessions: async (_token, options) => {
					if (options?.taskIds) {
						batches.push(options.taskIds);
						if (options.taskIds.includes('blocked')) {
							void entered.complete();
							return pending.p;
						}
						return { kind: 'incremental', sessions: [], removedTaskIds: [session.taskId] };
					}
					return options?.incremental
						? { kind: 'incremental', sessions: [], removedTaskIds: [] }
						: { kind: 'complete', sessions: [session] };
				},
			});
			const provider = harness.contribution.stubProviders.get(cloudSandboxAddress(session.environmentId))!;
			let blocking = Promise.resolve();
			if (pendingHint === 'queued') {
				blocking = harness.contribution.refreshTasks(['blocked']);
				await entered.p;
				removal = harness.contribution.refreshTasks([session.taskId]);
			} else {
				debounce.schedule();
			}
			harness.changeAccount('["github","account-1"]');
			await pending.complete({ kind: 'incremental', sessions: [], removedTaskIds: [] });
			await timeout(501);
			await Promise.all([blocking, removal, harness.contribution.checkForUpdates()]);
			assert.deepStrictEqual({ batches, removed: provider.disposed, starts, disposals }, {
				batches: pendingHint === 'queued' ? [['blocked'], [session.taskId]] : [[session.taskId]],
				removed: true, starts: 1, disposals: 0,
			});
		}));
	}

	for (const pendingHint of ['debounced', 'queued'] as const) {
		test(`disabling the feed drains ${pendingHint} removal hints for connected sessions but rejects new hints`, () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
			const entered = new DeferredPromise<void>();
			const session = discoveredSession();
			const batches: (readonly string[])[] = [];
			let buffered = false;
			let removal = Promise.resolve();
			const debounce = store.add(new RunOnceScheduler(() => {
				buffered = false;
				removal = harness.contribution.refreshTasks([session.taskId]);
			}, 500));
			const harness = await createContribution(store, [session], {
				connections: [{ address: cloudSandboxAddress(session.environmentId), name: session.name, status: RemoteAgentHostConnectionStatus.connected }],
				sessionFeed: {
					connected: true,
					start: async () => { },
					dispose: () => debounce.cancel(),
					takePendingTaskIds: () => {
						const taskIds = buffered ? [session.taskId] : [];
						buffered = false;
						return taskIds;
					},
				},
				listSessions: async (_token, options) => {
					if (options?.taskIds) {
						batches.push(options.taskIds);
						if (options.taskIds.includes('blocked')) {
							void entered.complete();
							return pending.p;
						}
						return { kind: 'incremental', sessions: [], removedTaskIds: [session.taskId] };
					}
					return options?.incremental
						? { kind: 'incremental', sessions: [], removedTaskIds: [] }
						: { kind: 'complete', sessions: [session] };
				},
			});
			const provider = harness.contribution.stubProviders.get(cloudSandboxAddress(session.environmentId))!;
			let blocking = Promise.resolve();
			if (pendingHint === 'queued') {
				blocking = harness.contribution.refreshTasks(['blocked']);
				await entered.p;
				removal = harness.contribution.refreshTasks([session.taskId]);
			} else {
				buffered = true;
				debounce.schedule();
			}
			await harness.setSessionFeedEnabled(false);
			await harness.contribution.refreshTasks(['ignored-after-disable']);
			await pending.complete({ kind: 'incremental', sessions: [], removedTaskIds: [] });
			await timeout(501);
			await Promise.all([blocking, removal, harness.contribution.checkForUpdates()]);
			assert.deepStrictEqual({ batches, taskOwned: provider.taskArchiveHandlers.has(session.sessionId), disposed: provider.disposed }, {
				batches: pendingHint === 'queued' ? [['blocked'], [session.taskId]] : [[session.taskId]],
				taskOwned: false, disposed: false,
			});
		}));
	}

	test('draining accepted hints retains the bounded retry after feed disable', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const session = discoveredSession();
		let attempts = 0;
		const harness = await createContribution(store, [session], {
			sessionFeed: { connected: true, start: async () => { }, dispose: () => { }, takePendingTaskIds: () => [session.taskId] },
			listSessions: async (_token, options) => {
				if (options?.taskIds) {
					return ++attempts === 1
						? { kind: 'failed', reason: 'Discovery invalidated' }
						: { kind: 'incremental', sessions: [], removedTaskIds: [session.taskId] };
				}
				return options?.incremental
					? { kind: 'incremental', sessions: [], removedTaskIds: [] }
					: { kind: 'complete', sessions: [session] };
			},
		});
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress(session.environmentId))!;
		await harness.setSessionFeedEnabled(false);
		await timeout(1);
		await harness.contribution.checkForUpdates();
		assert.deepStrictEqual({ attempts, removed: provider.disposed }, { attempts: 2, removed: true });
	}));

	test('a real account change cancels accepted hints being drained after feed disable', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const entered = new DeferredPromise<CancellationToken>();
		let initial = true;
		const session = discoveredSession();
		const stale = discoveredSession({ taskId: 'stale-task', environmentId: 'stale-environment', sessionId: 'stale-session' });
		const harness = await createContribution(store, [session], {
			sessionFeed: { connected: true, start: async () => { }, dispose: () => { }, takePendingTaskIds: () => [session.taskId] },
			listSessions: async (token, options) => {
				if (options?.taskIds) {
					void entered.complete(token);
					return pending.p;
				}
				if (initial) {
					initial = false;
					return { kind: 'complete', sessions: [session] };
				}
				return { kind: 'incremental', sessions: [], removedTaskIds: [] };
			},
		});
		await harness.setSessionFeedEnabled(false);
		const token = await entered.p;
		harness.changeAccount('other-account');
		await pending.complete({ kind: 'incremental', sessions: [stale], removedTaskIds: [] });
		await timeout(1);
		await harness.contribution.checkForUpdates();
		assert.deepStrictEqual({
			cancelled: token.isCancellationRequested,
			stalePublished: harness.contribution.stubProviders.has(cloudSandboxAddress(stale.environmentId)),
		}, { cancelled: true, stalePublished: false });
	}));

	for (const firstLane of ['inventory', 'targeted'] as const) {
		test(`configuration catch-up and accepted hints await the shared feed start (${firstLane} creates the feed)`, () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const ready = new DeferredPromise<void>();
			const starting = new DeferredPromise<void>();
			const inventoryAccount = new DeferredPromise<string | undefined>();
			const requests: (ICloudSandboxDiscoveryOptions | undefined)[] = [];
			let holdStart = false;
			let holdInventoryAccount = false;
			const harness = await createContribution(store, [], {
				getAccountKey: async account => {
					if (holdInventoryAccount) {
						holdInventoryAccount = false;
						return inventoryAccount.p;
					}
					return account;
				},
				sessionFeed: {
					connected: true,
					start: async () => {
						if (holdStart) {
							if (!starting.isSettled) {
								void starting.complete();
							}
							await ready.p;
						}
					},
					dispose: () => { },
					takePendingTaskIds: () => ['accepted-task'],
				},
				listSessions: async (_token, options) => {
					requests.push(options);
					return options?.incremental
						? { kind: 'incremental', sessions: [], removedTaskIds: [] }
						: { kind: 'complete', sessions: [] };
				},
			});
			holdStart = true;
			holdInventoryAccount = firstLane === 'targeted';
			await harness.setSessionFeedEnabled(true);
			await starting.p;
			await inventoryAccount.complete('["github","account-1"]');
			await timeout(0);
			const beforeReady = requests.map(request => request?.trigger);
			await ready.complete();
			await timeout(0);
			await harness.contribution.checkForUpdates();
			assert.deepStrictEqual({ beforeReady, afterReady: requests.slice(1).map(request => request?.trigger).sort() }, {
				beforeReady: ['startup'], afterReady: ['configurationChange', 'feedChange'],
			});
		}));
	}

	for (const failure of ['invalidated', 'partial', 'persistent'] as const) {
		test(`retries a ${failure} task refresh once without losing successful tasks`, async () => {
			const batches: (readonly string[] | undefined)[] = [];
			const found = discoveredSession({ taskId: 'retry-task' });
			const alreadyRead = discoveredSession({ taskId: 'already-read', sessionId: 'second', environmentId: 'second-env' });
			let attempts = 0;
			const harness = await createContribution(store, [], {
				listSessions: async (_token, options) => {
					batches.push(options?.taskIds);
					if (!options?.taskIds) {
						return { kind: 'complete', sessions: [] };
					}
					if (++attempts === 1 || failure === 'persistent') {
						return failure === 'partial'
							? { kind: 'partial', sessions: [alreadyRead], failedTaskIds: [found.taskId] }
							: { kind: 'failed', reason: 'Discovery invalidated' };
					}
					return { kind: 'incremental', sessions: [found], removedTaskIds: [] };
				},
			});
			await harness.contribution.refreshTasks([found.taskId, alreadyRead.taskId]);
			assert.deepStrictEqual({
				batches,
				found: harness.contribution.stubProviders.get(cloudSandboxAddress(found.environmentId))?.seeded.map(session => session.summary),
				retained: harness.contribution.stubProviders.has(cloudSandboxAddress(alreadyRead.environmentId)),
			}, {
				batches: [undefined, ['retry-task', 'already-read'], failure === 'partial' ? ['retry-task'] : ['retry-task', 'already-read']],
				found: failure === 'persistent' ? undefined : [found.name],
				retained: failure === 'partial',
			});
		});
	}

	test('publishes feed-discovered sessions without waiting for an unrelated inventory scan', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const entered = new DeferredPromise<void>();
		const found = discoveredSession({ taskId: 'fast-task' });
		let hold = false;
		const harness = await createContribution(store, [], {
			listSessions: async (_token, options) => {
				if (options?.taskIds) {
					return { kind: 'incremental', sessions: [found], removedTaskIds: [] };
				}
				if (hold) {
					void entered.complete();
					return pending.p;
				}
				return { kind: 'complete', sessions: [] };
			},
		});
		hold = true;
		const scan = harness.runDiscovery();
		await entered.p;
		const refresh = harness.contribution.refreshTasks([found.taskId]);
		await Promise.race([refresh, timeout(100)]);
		const publishedBeforeScanCompleted = harness.contribution.stubProviders.get(cloudSandboxAddress(found.environmentId))?.seeded.map(session => session.summary);
		await pending.complete({ kind: 'partial', sessions: [] });
		await Promise.all([scan, refresh]);
		assert.deepStrictEqual(publishedBeforeScanCompleted, [found.name]);
	}));

	for (const stop of ['account change', 'feed disable', 'feature disable'] as const) {
		test(`${stop} ${stop === 'feed disable' ? 'drains' : 'drops'} queued feed task IDs without publishing stale results`, async () => {
			const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
			const entered = new DeferredPromise<CancellationToken>();
			const batches: (readonly string[] | undefined)[] = [];
			const harness = await createContribution(store, [], {
				listSessions: async (token, options) => {
					batches.push(options?.taskIds);
					if (options?.taskIds?.includes('first')) {
						void entered.complete(token);
						return pending.p;
					}
					return { kind: 'complete', sessions: [] };
				},
			});
			const first = harness.contribution.refreshTasks(['first']);
			const token = await entered.p;
			const second = harness.contribution.refreshTasks(['queued']);
			if (stop === 'account change') {
				harness.changeAccount('another-account');
			} else if (stop === 'feed disable') {
				await harness.setSessionFeedEnabled(false);
			} else {
				await harness.setEnabled(false);
			}
			await pending.complete({ kind: 'incremental', sessions: [], removedTaskIds: [] });
			await Promise.all([first, second, harness.runDiscovery()]);
			assert.deepStrictEqual({
				queuedRead: batches.some(batch => batch?.includes('queued')),
				oldAccountCancelled: token.isCancellationRequested,
			}, { queuedRead: stop === 'feed disable', oldAccountCancelled: stop !== 'feed disable' });
		});
	}

	for (const fullFirst of [false, true]) {
		test(`retains task hints ${fullFirst ? 'after' : 'before'} a queued full refresh`, async () => {
			const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
			const entered = new DeferredPromise<void>();
			const batches: (readonly string[] | undefined)[] = [];
			const found = discoveredSession({ taskId: 'new-task' });
			const harness = await createContribution(store, [], {
				listSessions: async (_token, options) => {
					batches.push(options?.taskIds);
					if (options?.taskIds?.includes('in-flight')) {
						void entered.complete();
						return pending.p;
					}
					return options?.taskIds?.includes(found.taskId)
						? { kind: 'incremental', sessions: [found], removedTaskIds: [] }
						: { kind: 'complete', sessions: [] };
				},
			});
			const first = harness.contribution.refreshTasks(['in-flight']);
			await entered.p;
			const queueFull = () => harness.runDiscovery();
			const queueTask = () => harness.contribution.refreshTasks([found.taskId]);
			const second = fullFirst ? queueFull() : queueTask();
			const third = fullFirst ? queueTask() : queueFull();
			await pending.complete({ kind: 'incremental', sessions: [], removedTaskIds: [] });
			await Promise.all([first, second, third]);
			assert.deepStrictEqual({
				batches,
				found: harness.contribution.stubProviders.get(cloudSandboxAddress(found.environmentId))?.seeded.map(session => session.summary),
			}, {
				batches: [undefined, ['in-flight'], undefined, ['new-task']],
				found: [found.name],
			});
		});
	}

	test('merges task hints arriving during discovery without escalating to a full inventory scan', async () => {
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const entered = new DeferredPromise<void>();
		const batches: (readonly string[] | undefined)[] = [];
		let hold = false;
		const harness = await createContribution(store, [], {
			listSessions: async (_token, options) => {
				batches.push(options?.taskIds);
				if (hold && !options?.taskIds) {
					void entered.complete();
					return pending.p;
				}
				return { kind: 'incremental', sessions: [], removedTaskIds: [] };
			},
		});
		hold = true;
		const full = harness.runDiscovery();
		await entered.p;
		const first = harness.contribution.refreshTasks(['one']);
		const second = harness.contribution.refreshTasks(['two', 'one']);
		await pending.complete({ kind: 'complete', sessions: [] });
		await Promise.all([full, first, second]);
		assert.deepStrictEqual(batches, [undefined, undefined, ['one', 'two']]);
	});

	for (const connected of [false, true]) {
		test(`task hints never postpone the inventory poll and a connected feed replaces it (connected=${connected})`, () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const batches: (readonly string[] | undefined)[] = [];
			const harness = await createContribution(store, [], {
				sessionFeed: { connected, start: async () => { }, dispose: () => { } },
				listSessions: async (_token, options) => {
					batches.push(options?.taskIds);
					return options?.incremental
						? { kind: 'incremental', sessions: [], removedTaskIds: [] }
						: { kind: 'complete', sessions: [discoveredSession()] };
				},
			});
			for (let i = 0; i < 4; i++) {
				await timeout(60_000);
				await harness.contribution.refreshTasks(['one']);
			}
			await timeout(60_001);
			await harness.contribution.checkForUpdates();
			assert.deepStrictEqual(batches, [undefined, ['one'], ['one'], ['one'], ['one'], ...connected ? [] : [undefined]]);
		}));
	}

	test('shares overlapping full refreshes without an unnecessary follow-up scan', async () => {
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		let hold = false;
		const harness = await createContribution(store, [], {
			listSessions: async () => hold ? pending.p : { kind: 'complete', sessions: [] },
		});
		hold = true;
		const first = harness.runDiscovery();
		const second = harness.runDiscovery();
		await pending.complete({ kind: 'complete', sessions: [] });
		await Promise.all([first, second]);

		assert.deepStrictEqual(harness.discoveryModes, [false, false]);
	});

	for (const connected of [false, true]) {
		test(`stale focus and host selection refresh only without a connected feed (connected=${connected})`, () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const triggers: (CloudSandboxDiscoveryTrigger | undefined)[] = [];
			const harness = await createContribution(store, [], {
				sessionFeed: { connected, start: async () => { }, dispose: () => { } },
				listSessions: async (_token, options) => {
					triggers.push(options?.trigger);
					return options?.incremental
						? { kind: 'incremental', sessions: [], removedTaskIds: [] }
						: { kind: 'complete', sessions: [discoveredSession()] };
				},
			});
			// The inventory goes stale exactly one interval after a pass; keep the poll due later so focus and selection do the refreshing.
			harness.contribution.pollJitter = 30_000;
			harness.setFocused(false);
			harness.setFocused(true);
			await harness.contribution.checkForUpdates();
			const fresh = harness.discoveryModes.length;

			harness.setFocused(false);
			await timeout(5 * 60_000);
			harness.selectSandboxHost();
			await harness.contribution.checkForUpdates();
			const blurred = harness.discoveryModes.length;

			harness.setFocused(true);
			await harness.contribution.checkForUpdates();
			harness.selectSandboxHost();
			await harness.contribution.checkForUpdates();
			await timeout(5 * 60_000);
			harness.selectSandboxHost();
			await harness.contribution.checkForUpdates();

			assert.deepStrictEqual({ fresh, blurred, modes: harness.discoveryModes, triggers }, {
				fresh: 1, blurred: 1,
				modes: connected ? [false] : [false, true, true],
				triggers: connected ? ['startup'] : ['startup', 'focus', 'selection'],
			});
		}));
	}

	test('stale focus resumes discovery when the feed disconnects', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let connected = true;
		const triggers: (CloudSandboxDiscoveryTrigger | undefined)[] = [];
		const harness = await createContribution(store, [discoveredSession()], {
			sessionFeed: { get connected() { return connected; }, start: async () => { }, dispose: () => { } },
			listSessions: async (_token, options) => {
				triggers.push(options?.trigger);
				return { kind: 'complete', sessions: [discoveredSession()] };
			},
		});
		harness.setFocused(false);
		await timeout(5 * 60_000 + 1);
		harness.setFocused(true);
		await harness.contribution.checkForUpdates();
		const whileConnected = [...triggers];

		connected = false;
		harness.setFocused(false);
		harness.setFocused(true);
		await harness.contribution.checkForUpdates();

		assert.deepStrictEqual({ whileConnected, afterDisconnect: triggers }, {
			whileConnected: ['startup'], afterDisconnect: ['startup', 'focus'],
		});
	}));

	test('automatically reconciles the full inventory after the full-scan interval', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let sessions = [discoveredSession()];
		const harness = await createContribution(store, sessions, {
			listSessions: async (_token, options) => options?.incremental
				? { kind: 'incremental', sessions: [], removedTaskIds: [] }
				: { kind: 'complete', sessions },
		});
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		await timeout(5 * 60_000);
		await harness.contribution.checkForUpdates();
		const retainedAfterIncremental = !provider.disposed;
		sessions = [];
		await timeout(10 * 60_000);
		await harness.contribution.checkForUpdates();

		assert.deepStrictEqual({
			modes: harness.discoveryModes, retainedAfterIncremental, removedAfterFull: provider.disposed,
		}, { modes: [false, true, true, false], retainedAfterIncremental: true, removedAfterFull: true });
	}));

	test('subscribes before the initial task read, without connecting a sandbox', async () => {
		const order: string[] = [];
		const harness = await createContribution(store, [], {
			connectSessionFeed: async () => { order.push('subscribe'); return undefined; },
			listSessions: async () => { order.push('list'); return { kind: 'complete', sessions: [] }; },
		});
		assert.deepStrictEqual({ order, connected: harness.connectedTo }, { order: ['subscribe', 'list'], connected: [] });
	});

	for (const failure of ['flag disabled', 'waiting on a Retry-After'] as const) {
		test(`normal polling finds new sessions without reprobing when the feed is ${failure}`, () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			let negotiations = 0;
			const harness = await createContribution(store, [], {
				connectSessionFeed: async () => {
					negotiations++;
					if (failure === 'waiting on a Retry-After') {
						throw new CloudSandboxRequestError(503, 'Unavailable', 3600);
					}
					return undefined;
				},
			});
			harness.discovered = [discoveredSession()];
			await timeout(15 * 60_000 + 1);
			await harness.contribution.checkForUpdates();
			const afterPoll = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))?.seeded.map(session => session.summary);
			await timeout(10 * 60_000);
			await harness.runDiscovery();
			const beforeToggle = negotiations;
			await harness.setSessionFeedEnabled(false);
			await harness.runDiscovery();
			await harness.setSessionFeedEnabled(true);
			await harness.runDiscovery();
			assert.deepStrictEqual({ afterPoll, beforeToggle, afterToggle: negotiations }, {
				afterPoll: [discoveredSession().name], beforeToggle: 1, afterToggle: 2,
			});
		}));
	}

	test('polling-only discovery never negotiates a feed and polls on the normal interval', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let negotiations = 0;
		const harness = await createContribution(store, [discoveredSession()], {
			sessionFeedEnabled: false,
			connectSessionFeed: async () => { negotiations++; return undefined; },
		});
		await timeout(5 * 60_000 + 1);
		await harness.contribution.checkForUpdates();
		assert.deepStrictEqual({ negotiations, modes: harness.discoveryModes }, { negotiations: 0, modes: [false, true] });
	}));

	test('disabled feed is never started or requested across polling, manual refreshes and account changes', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let feedStarts = 0;
		let negotiations = 0;
		const taskBatches: (readonly string[] | undefined)[] = [];
		const harness = await createContribution(store, [discoveredSession()], {
			sessionFeedEnabled: false,
			sessionFeed: {
				connected: false,
				start: async () => { feedStarts++; },
				dispose: () => { },
			},
			connectSessionFeed: async () => { negotiations++; return undefined; },
			listSessions: async (_token, options) => {
				taskBatches.push(options?.taskIds);
				return { kind: 'complete', sessions: [discoveredSession()] };
			},
		});
		await timeout(10 * 60_000);
		await harness.runDiscovery();
		harness.changeAccount('another-account');
		await harness.runDiscovery();
		const scans = taskBatches.length;
		await harness.contribution.refreshTasks(['ignored-feed-task']);
		assert.deepStrictEqual({
			feedStarts, negotiations,
			pollingAndManualReadsContinue: scans > 1,
			feedTaskReads: taskBatches.filter(batch => batch !== undefined),
			scansAfterHint: taskBatches.length,
		}, {
			feedStarts: 0, negotiations: 0,
			pollingAndManualReadsContinue: true,
			feedTaskReads: [],
			scansAfterHint: scans,
		});
	}));

	test('switches between feed and polling without recreating session providers or disconnecting hosts', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let starts = 0;
		let started = false;
		let disposals = 0;
		const harness = await createContribution(store, [discoveredSession()], {
			sessionFeed: {
				connected: true,
				start: async () => { if (!started) { started = true; starts++; } },
				dispose: () => { started = false; disposals++; },
			},
		});
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		await harness.setSessionFeedEnabled(false);
		await harness.runDiscovery();
		await timeout(5 * 60_000 + 1);
		await harness.contribution.checkForUpdates();
		const polling = { starts, disposals, modes: [...harness.discoveryModes] };
		await harness.setSessionFeedEnabled(true);
		await harness.runDiscovery();
		await timeout(5 * 60_000 + 1);
		await harness.contribution.checkForUpdates();
		assert.deepStrictEqual({
			polling,
			starts, disposals, modes: harness.discoveryModes,
			sameProvider: harness.contribution.stubProviders.get(cloudSandboxAddress('env-1')) === provider,
			providerDisposed: provider.disposed,
			disconnected: harness.disconnectedFrom,
		}, {
			polling: { starts: 1, disposals: 1, modes: [false, true, false, true] },
			starts: 2, disposals: 1, modes: [false, true, false, true, true, false],
			sameProvider: true, providerDisposed: false, disconnected: [],
		});
	}));

	test('disabling the feed cancels pending negotiation and continues polling', async () => {
		const pending = new DeferredPromise<ICloudSandboxSessionFeedConnection | undefined>();
		const requested = new DeferredPromise<CancellationToken>();
		let negotiations = 0;
		const harness = await createContribution(store, [], {
			waitForDiscovery: false,
			connectSessionFeed: async token => {
				negotiations++;
				void requested.complete(token);
				return pending.p;
			},
		});
		const token = await requested.p;
		await harness.setSessionFeedEnabled(false);
		await pending.complete(undefined);
		await harness.runDiscovery();
		assert.deepStrictEqual({ cancelled: token.isCancellationRequested, negotiations, modes: harness.discoveryModes }, {
			cancelled: true, negotiations: 1, modes: [false, true],
		});
	});

	test('enabling the feed cannot enable disabled sandbox discovery', async () => {
		let negotiations = 0;
		const harness = await createContribution(store, [], {
			enabled: false, sessionFeedEnabled: false,
			connectSessionFeed: async () => { negotiations++; return undefined; },
		});
		await harness.setSessionFeedEnabled(true);
		await harness.runDiscovery();
		assert.deepStrictEqual({ negotiations, modes: harness.discoveryModes }, { negotiations: 0, modes: [] });
	});

	test('does not poll while the feed is connected and resumes jittered polling once it drops', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let connected = true;
		let disposed = false;
		const harness = await createContribution(store, [discoveredSession()], {
			sessionFeed: {
				get connected() { return connected; },
				start: async () => { },
				dispose: () => { disposed = true; },
			},
		});
		harness.contribution.pollJitter = 30_000;
		await timeout(5 * 60_000 + 1);
		const whileConnected = harness.discoveryModes.length;
		connected = false;
		await timeout(5 * 60_000 + 30_000 - 2);
		const beforeJitteredPoll = harness.discoveryModes.length;
		await timeout(2);
		const afterJitteredPoll = harness.discoveryModes.length;
		await harness.setEnabled(false);
		await timeout(10 * 60_000);
		assert.deepStrictEqual({ whileConnected, beforeJitteredPoll, afterJitteredPoll, afterDisable: harness.discoveryModes.length, disposed }, {
			whileConnected: 1, beforeJitteredPoll: 1, afterJitteredPoll: 2, afterDisable: 2, disposed: true,
		});
	}));

	test('polls at the full-scan interval until the account has a sandbox', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const harness = await createContribution(store, []);
		await timeout(10 * 60_000 + 1);
		const whileEmpty = harness.discoveryModes.length;
		harness.discovered = [discoveredSession()];
		await timeout(5 * 60_000);
		const afterReconciliation = harness.discoveryModes.length;
		await timeout(5 * 60_000 + 1);
		assert.deepStrictEqual({ whileEmpty, afterReconciliation, modes: harness.discoveryModes }, {
			whileEmpty: 1, afterReconciliation: 2, modes: [false, false, true],
		});
	}));

	for (const path of ['provisioning', 'feed task read'] as const) {
		test(`resumes the normal interval once the first sandbox arrives through ${path}`, () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
			const found = discoveredSession();
			const harness = await createContribution(store, [], {
				listSessions: async (_token, options) => options?.taskIds
					? { kind: 'incremental', sessions: [found], removedTaskIds: [] }
					: options?.incremental ? { kind: 'incremental', sessions: [], removedTaskIds: [] } : { kind: 'complete', sessions: [] },
			});
			await timeout(60_000);
			if (path === 'provisioning') {
				harness.contribution.ensureProvider(found);
			} else {
				await harness.contribution.refreshTasks([found.taskId]);
			}
			const afterFirstSandbox = harness.discoveryModes.length;
			await timeout(4 * 60_000 + 1);
			assert.deepStrictEqual({ afterFirstSandbox, modes: harness.discoveryModes }, {
				afterFirstSandbox: path === 'provisioning' ? 1 : 2, modes: path === 'provisioning' ? [false, true] : [false, true, true],
			});
		}));
	}

	test('replaces account-scoped discovery subscriptions on account changes and cancels them on disablement', async () => {
		const subscriptions: { disposed: boolean }[] = [];
		const harness = await createContribution(store, [discoveredSession()], {
			sessionFeed: {
				connected: false,
				start: async () => { subscriptions.push({ disposed: false }); },
				dispose: () => { subscriptions[subscriptions.length - 1].disposed = true; },
			},
		});
		harness.changeAccount('second-account');
		await harness.runDiscovery();
		const onAccountChange = subscriptions.map(subscription => subscription.disposed);
		await harness.setEnabled(false);
		assert.deepStrictEqual({ onAccountChange, onDisable: subscriptions.map(subscription => subscription.disposed) }, {
			onAccountChange: [true, false], onDisable: [true, true],
		});
	});

	test('backs off unsuccessful automatic refreshes while manual refresh bypasses staleness', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const harness = await createContribution(store, [], {
			listSessions: async (_token, options) => options?.incremental
				? { kind: 'failed', reason: 'temporarily unavailable' }
				: { kind: 'complete', sessions: [discoveredSession()] },
		});
		await timeout(5 * 60_000);
		await harness.contribution.checkForUpdates();
		await timeout(5 * 60_000);
		await harness.contribution.checkForUpdates();
		const duringBackoff = harness.discoveryModes.length;
		await timeout(5 * 60_000);
		await harness.contribution.checkForUpdates();
		await harness.runDiscovery();

		assert.deepStrictEqual({ duringBackoff, modes: harness.discoveryModes }, {
			duringBackoff: 2, modes: [false, true, false, false],
		});
	}));

	test('queues one full refresh when manual requests overlap an incremental scan', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const harness = await createContribution(store, [], {
			listSessions: async (_token, options) => options?.incremental ? pending.p : { kind: 'complete', sessions: [discoveredSession()] },
		});
		await timeout(5 * 60_000);
		const automatic = harness.contribution.checkForUpdates();
		const manual = harness.runDiscovery();
		const anotherManual = harness.runDiscovery();
		await pending.complete({ kind: 'incremental', sessions: [], removedTaskIds: [] });
		await Promise.all([automatic, manual, anotherManual]);

		assert.deepStrictEqual(harness.discoveryModes, [false, true, false]);
	}));

	test('preserves connected task ownership and history outside the recent window until explicitly removed', async () => {
		const session = discoveredSession();
		const address = cloudSandboxAddress(session.environmentId);
		const cleared: (string | undefined)[] = [];
		let result: ICloudSandboxDiscoveryResult = { kind: 'complete', sessions: [session] };
		const harness = await createContribution(store, [], {
			listSessions: async () => result,
			clearSessionHistory: taskId => cleared.push(taskId),
			connections: [{ address, name: session.name, status: RemoteAgentHostConnectionStatus.connected }],
		});
		const provider = harness.contribution.stubProviders.get(address)!;
		cleared.length = 0;
		result = { kind: 'complete', sessions: [] };
		await harness.runDiscovery();
		await provider.taskRenameHandlers.get(session.sessionId)!('Renamed connected task');
		await provider.taskArchiveHandlers.get(session.sessionId)!(true);
		const afterWindowRefresh = {
			renamed: [...harness.renamedTasks],
			archived: [...harness.archivedTasks],
			cleared: [...cleared],
			disposed: provider.disposed,
		};
		result = { kind: 'complete', sessions: [], removedTaskIds: [session.taskId] };
		await harness.runDiscovery();

		assert.deepStrictEqual({
			afterWindowRefresh,
			afterRemoval: {
				renameHandlers: provider.taskRenameHandlers.size,
				archiveHandlers: provider.taskArchiveHandlers.size,
				cleared,
				disposed: provider.disposed,
			},
		}, {
			afterWindowRefresh: {
				renamed: [{ taskId: session.taskId, title: 'Renamed connected task' }],
				archived: [{ taskId: session.taskId, archived: true }],
				cleared: [],
				disposed: false,
			},
			afterRemoval: { renameHandlers: 0, archiveHandlers: 0, cleared: [session.taskId], disposed: false },
		});
	});

	for (const state of ['connecting', 'reconnecting'] as const) {
		test(`retains ${state} environments on window eviction but reconciles explicit removals`, async () => {
			const session = discoveredSession();
			const address = cloudSandboxAddress(session.environmentId);
			const cleared: (string | undefined)[] = [];
			let result: ICloudSandboxDiscoveryResult = { kind: 'complete', sessions: [session] };
			const harness = await createContribution(store, [], {
				listSessions: async () => result,
				clearSessionHistory: taskId => cleared.push(taskId),
				connections: [{ address, name: session.name, status: RemoteAgentHostConnectionStatus[state] }],
			});
			const provider = harness.contribution.stubProviders.get(address)!;
			cleared.length = 0;
			result = { kind: 'complete', sessions: [] };
			await harness.runDiscovery();
			const afterWindowRefresh = {
				disposed: provider.disposed,
				renameHandlers: provider.taskRenameHandlers.size,
				archiveHandlers: provider.taskArchiveHandlers.size,
				cleared: [...cleared],
				disconnected: [...harness.disconnectedFrom],
			};
			result = { kind: 'complete', sessions: [], removedTaskIds: [session.taskId] };
			await harness.runDiscovery();

			assert.deepStrictEqual({
				afterWindowRefresh,
				afterRemoval: { disposed: provider.disposed, cleared, disconnected: harness.disconnectedFrom },
			}, {
				afterWindowRefresh: { disposed: false, renameHandlers: 1, archiveHandlers: 1, cleared: [], disconnected: [] },
				afterRemoval: { disposed: true, cleared: [session.taskId], disconnected: [address] },
			});
		});
	}

	test('a pending wake survives window eviction without a connection entry until explicitly removed', async () => {
		const session = discoveredSession();
		const address = cloudSandboxAddress(session.environmentId);
		const cleared: (string | undefined)[] = [];
		let result: ICloudSandboxDiscoveryResult = { kind: 'complete', sessions: [session] };
		const harness = await createContribution(store, [], {
			listSessions: async () => result,
			clearSessionHistory: taskId => cleared.push(taskId),
		});
		const provider = harness.contribution.stubProviders.get(address)!;
		const wake = new DeferredPromise<void>();
		let wakeToken = CancellationToken.None;
		harness.onConnect = async (_options, token) => {
			wakeToken = token;
			await wake.p;
		};
		const connecting = harness.contribution.connect({
			environmentId: session.environmentId, sessionId: session.sessionId, name: session.name,
		});
		const cancelled = assert.rejects(connecting, CancellationError);
		cleared.length = 0;
		result = { kind: 'complete', sessions: [] };
		await harness.runDiscovery();
		const afterWindowRefresh = {
			cancelled: wakeToken.isCancellationRequested,
			disposed: provider.disposed,
			renameHandlers: provider.taskRenameHandlers.size,
			archiveHandlers: provider.taskArchiveHandlers.size,
			cleared: [...cleared],
			disconnected: [...harness.disconnectedFrom],
		};
		result = { kind: 'complete', sessions: [], removedTaskIds: [session.taskId] };
		await harness.runDiscovery();
		await wake.complete();
		await cancelled;

		assert.deepStrictEqual({
			afterWindowRefresh,
			afterRemoval: { cancelled: wakeToken.isCancellationRequested, disposed: provider.disposed, cleared, disconnected: harness.disconnectedFrom },
		}, {
			afterWindowRefresh: { cancelled: false, disposed: false, renameHandlers: 1, archiveHandlers: 1, cleared: [], disconnected: [] },
			afterRemoval: { cancelled: true, disposed: true, cleared: [session.taskId], disconnected: [address] },
		});
	});

	test('keeps absent sessions but reconciles explicit removals from incremental and partial scans', async () => {
		let result: ICloudSandboxDiscoveryResult = {
			kind: 'complete',
			sessions: [
				discoveredSession(),
				discoveredSession({ environmentId: 'env-2', taskId: 'task-2', sessionId: 'sess-2' }),
			],
		};
		const harness = await createContribution(store, [], { listSessions: async () => result });
		const first = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		const second = harness.contribution.stubProviders.get(cloudSandboxAddress('env-2'))!;
		result = { kind: 'incremental', sessions: [], removedTaskIds: [] };
		await harness.runDiscovery();
		const retained = [!first.disposed, !second.disposed];
		result = { kind: 'partial', sessions: [], removedTaskIds: ['task-1'] };
		await harness.runDiscovery();

		assert.deepStrictEqual({ retained, disposed: [first.disposed, second.disposed] }, {
			retained: [true, true], disposed: [true, false],
		});
	});

	test('replaces a disconnected environment when an incremental update moves its task', async () => {
		let result: ICloudSandboxDiscoveryResult = { kind: 'complete', sessions: [discoveredSession()] };
		const harness = await createContribution(store, [], { listSessions: async () => result });
		const previous = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		result = {
			kind: 'incremental',
			sessions: [discoveredSession({ environmentId: 'env-replacement', sessionId: 'replacement' })],
			removedTaskIds: [],
		};
		await harness.runDiscovery();

		assert.deepStrictEqual({
			previousDisposed: previous.disposed,
			current: [...harness.contribution.stubProviders].filter(([, provider]) => !provider.disposed).map(([address]) => address),
		}, { previousDisposed: true, current: [cloudSandboxAddress('env-replacement')] });
	});

	test('re-enabling queues fresh discovery and ignores a cancelled in-flight result', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const started = new DeferredPromise<void>();
		let incrementalToken: CancellationToken | undefined;
		const harness = await createContribution(store, [], {
			listSessions: async (token, options) => {
				if (options?.incremental) {
					incrementalToken = token;
					await started.complete();
					return pending.p;
				}
				return { kind: 'complete', sessions: [discoveredSession()] };
			},
		});
		await timeout(60_000);
		const automatic = harness.contribution.checkForUpdates();
		await started.p;
		await harness.setEnabled(false);
		await harness.setEnabled(true);
		const manual = harness.runDiscovery();
		await pending.complete({
			kind: 'incremental',
			sessions: [discoveredSession({ environmentId: 'cancelled' })],
			removedTaskIds: [],
		});
		await Promise.all([automatic, manual]);

		assert.deepStrictEqual({
			cancelled: incrementalToken?.isCancellationRequested,
			modes: harness.discoveryModes,
			current: [...harness.contribution.stubProviders].filter(([, provider]) => !provider.disposed).map(([address]) => address),
		}, { cancelled: true, modes: [false, true, false], current: [cloudSandboxAddress('env-1')] });
	}));

	test('does not automatically refresh a disabled or disposed contribution', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const harness = await createContribution(store, []);
		await harness.setEnabled(false);
		await timeout(60_000);
		harness.setFocused(true);
		harness.selectSandboxHost();
		await harness.contribution.checkForUpdates();
		await harness.setEnabled(true);
		await harness.runDiscovery();
		harness.contribution.dispose();
		await timeout(60_000);
		harness.setFocused(true);
		harness.selectSandboxHost();
		await harness.contribution.checkForUpdates();

		assert.deepStrictEqual(harness.discoveryModes, [false, false]);
	}));
});

suite('CloudSandboxAgentHostContribution provisioning', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const signedOut of [false, true]) {
		test(`distinguishes failure before cloud creation when ${signedOut ? 'signed out' : 'local preparation fails'}`, async () => {
			const harness = await createContribution(store, [], { accountKey: signedOut ? null : undefined });
			let failure: unknown;
			try {
				await harness.contribution.provisionSession({ prompt: 'private prompt' }, CancellationToken.None, {
					report: () => { throw new Error('private preparation error'); },
				});
			} catch (error) {
				failure = error;
			}
			assert.ok(failure instanceof CloudSandboxStartupError);
			assert.deepStrictEqual({
				message: failure.message,
				step: failure.detailsCommand.command.arguments?.[1],
				created: harness.created,
				connected: harness.connectedTo,
			}, {
				message: signedOut
					? 'Couldn\'t prepare the cloud session. Sign in to GitHub to continue.'
					: 'Couldn\'t prepare the cloud session. Check your session settings and GitHub sign-in before trying again.',
				step: 'Step: Prepare cloud session',
				created: [],
				connected: [],
			});
		});
	}

	test('surfaces an unexplained creation 404 with safe details and no connection attempt', async () => {
		const harness = await createContribution(store, [], {
			createSession: async () => {
				throw new CloudSandboxRequestError(404, 'private response', undefined, {
					code: 'not_found', requestId: 'ABCD:1234:5678:90AB:CDEF',
				});
			},
		});
		let failure: unknown;
		try {
			await harness.contribution.provisionSession({ prompt: 'private prompt' }, CancellationToken.None);
		} catch (error) {
			failure = error;
		}
		assert.ok(failure instanceof CloudSandboxStartupError);
		assert.deepStrictEqual({
			message: failure.message,
			actions: failure.actions.map(action => action.label),
			details: failure.detailsCommand.command.arguments,
			created: harness.created.length,
			connected: harness.connectedTo,
		}, {
			message: 'Couldn\'t start the cloud session. GitHub couldn\'t find or allow access to a required resource.',
			actions: ['Show Details'],
			details: [
				'Couldn\'t start the cloud session. GitHub couldn\'t find or allow access to a required resource.',
				'Step: Create cloud session\nHTTP status: 404\nError code: not_found\nRequest reference: ABCD:1234:5678:90AB:CDEF',
			],
			created: 1,
			connected: [],
		});
	});

	test('passes task creation start to the first connection but not to subsequent resumes', () => runWithFakedTimers({}, async () => {
		const harness = await createContribution(store, [], {
			createSession: async () => {
				await timeout(200);
				return { taskId: 'task-new', sessionId: 'sess-new', environmentId: 'env-new' };
			},
		});
		const connectionTimings: { source: ICloudSandboxConnectOptions['connectionSource']; provisioningElapsed: number | undefined }[] = [];
		harness.onConnect = async options => {
			connectionTimings.push({
				source: options.connectionSource,
				provisioningElapsed: options.provisioningStartedAt === undefined ? undefined : Date.now() - options.provisioningStartedAt,
			});
			await timeout(50);
		};
		await timeout(1000);
		await harness.contribution.provisionSession({ prompt: 'hello' }, CancellationToken.None);
		await timeout(1000);
		await harness.contribution.connect({ environmentId: 'env-new', name: 'Sandbox' });
		harness.contribution.dispose();
		assert.deepStrictEqual(connectionTimings, [
			{ source: 'created', provisioningElapsed: 200 },
			{ source: undefined, provisioningElapsed: undefined },
		]);
	}));

	test('creates the task, seeds it like a discovered one, and connects to the bound environment', async () => {
		const harness = await createContribution(store, []);
		let connectionSource: ICloudSandboxConnectOptions['connectionSource'];
		harness.onConnect = async options => { connectionSource = options.connectionSource; };
		const progress: string[] = [];

		const provisioned = await harness.contribution.provisionSession({ repoNwo: 'osortega/simple-server', prompt: 'fix it' }, CancellationToken.None, { report: message => progress.push(message) });

		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-new'));
		assert.deepStrictEqual({
			ids: { taskId: provisioned.taskId, sessionId: provisioned.sessionId, environmentId: provisioned.environmentId },
			// The seed must match discovery's shape, or a later pass would duplicate the session.
			seeded: provider?.seeded.map(m => ({ session: m.session.toString(), summary: m.summary, project: m.project?.displayName })),
			// The relay must target the bound VM, never the `github-sandbox` sentinel.
			connectedTo: harness.connectedTo,
			connectionSource,
			resolvedSession: provisioned.session.resource.path,
			progress,
		}, {
			ids: { taskId: 'task-new', sessionId: 'sess-new', environmentId: 'env-new' },
			seeded: [{ session: 'ahp-session:/sess-new', summary: 'fix it', project: 'osortega/simple-server' }],
			connectedTo: ['env-new'],
			connectionSource: 'created',
			resolvedSession: '/sess-new',
			progress: ['Setting up cloud container', 'Connecting to cloud container'],
		});
	});

	test('provisions a repo-less sandbox with workspace-less session metadata', async () => {
		const harness = await createContribution(store, []);

		const provisioned = await harness.contribution.provisionSession({ prompt: 'hello' }, CancellationToken.None);

		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress(provisioned.environmentId));
		assert.deepStrictEqual({
			seeded: provider?.seeded.map(meta => ({
				session: meta.session.toString(),
				workspaceless: readSessionWorkspaceless(meta._meta),
				project: meta.project,
				workingDirectories: meta.workingDirectories,
			})),
			connectedTo: harness.connectedTo,
		}, {
			seeded: [{ session: 'ahp-session:/sess-new', workspaceless: true, project: undefined, workingDirectories: undefined }],
			connectedTo: ['env-new'],
		});
	});

	test('tracks initial and live clone percentages only for the selected repository', async () => {
		const root = store.add(new RootStateSubscription('test', () => { }));
		let sequence = 0;
		const update = (status: string, progress?: number) => root.handleSnapshot({
			agents: [],
			_meta: { 'copilot.projectManagement': { available: true } },
			config: {
				schema: { type: 'object', properties: {} },
				values: {
					copilot: {
						projects: [
							{ id: 'other', path: '/other', git: true, status: 'ready', remoteUrl: 'https://github.com/other/repo' },
							{ id: 'checkout', path: '/checkout', git: true, status, progress, remoteUrl: 'git@github.com:Microsoft/VSCode.git' },
						]
					}
				},
			},
		}, sequence++);
		update('cloning', 0);
		const harness = await createContribution(store, [], { connection: upcastPartial<IAgentConnection>({ rootState: root }) });
		const messages: string[] = [];
		store.add(harness.contribution.trackSessionCreationProgress('env-new', 'microsoft/vscode', { report: message => messages.push(message) }));
		update('cloning', 58);
		update('ready');
		update('cloning', 1);

		assert.deepStrictEqual(messages, ['Cloning repository (0%)', 'Cloning repository (58%)', 'Starting Copilot agent']);
	});

	test('reuses repository preparation and waits for the host to report the clone ready', async () => {
		const root = store.add(new RootStateSubscription('test', () => { }));
		const state = (status: 'cloning' | 'ready'): RootState => ({
			agents: [],
			_meta: { 'copilot.projectManagement': { available: true } },
			config: {
				schema: { type: 'object', properties: {} },
				values: { copilot: { projects: [{ id: 'checkout', path: '/checkout', git: true, status, remoteUrl: 'https://github.com/microsoft/vscode' }] } },
			},
		});
		root.handleSnapshot(state('cloning'), 0);
		const harness = await createContribution(store, [], { connection: upcastPartial<IAgentConnection>({ rootState: root }) });
		let ready = false;
		const preparation = harness.contribution.prepareSession('env-new', 'microsoft/vscode', CancellationToken.None).then(() => ready = true);
		await timeout(0);
		const beforeReady = ready;
		root.handleSnapshot(state('ready'), 1);
		await preparation;
		assert.deepStrictEqual({ beforeReady, afterReady: ready }, { beforeReady: false, afterReady: true });
	});

	test('continues tracking a retry after an initially failed checkout', async () => {
		const results: string[][] = [];
		for (const outcome of ['ready', 'failed'] as const) {
			const root = store.add(new RootStateSubscription('test', () => { }));
			const state = (status: string, progress?: number): RootState => ({
				agents: [],
				_meta: { 'copilot.projectManagement': { available: true } },
				config: {
					schema: { type: 'object', properties: {} },
					values: { copilot: { projects: [{ id: 'checkout', path: '/checkout', git: true, status, progress, remoteUrl: 'https://github.com/microsoft/vscode' }] } },
				},
			});
			root.handleSnapshot(state('failed'), 0);
			const harness = await createContribution(store, [], { connection: upcastPartial<IAgentConnection>({ rootState: root }) });
			const messages: string[] = [];
			store.add(harness.contribution.trackSessionCreationProgress('env-new', 'microsoft/vscode', { report: message => messages.push(message) }));
			root.handleSnapshot(state('failed'), 1);
			root.handleSnapshot(state('cloning', 0), 2);
			root.handleSnapshot(state('cloning', 58), 3);
			root.handleSnapshot(state(outcome), 4);
			root.handleSnapshot(state('cloning', 1), 5);
			results.push(messages);
		}
		assert.deepStrictEqual(results, [
			['Cloning repository (0%)', 'Cloning repository (58%)', 'Starting Copilot agent'],
			['Cloning repository (0%)', 'Cloning repository (58%)', 'Repository cloning failed'],
		]);
	});

	test('keeps unknown clone percentages indeterminate and releases the observer on failure or disposal', async () => {
		const results: string[][] = [];
		for (const failed of [false, true]) {
			const root = store.add(new RootStateSubscription('test', () => { }));
			const state = (status: string): RootState => ({
				agents: [],
				_meta: { 'copilot.projectManagement': { available: true } },
				config: {
					schema: { type: 'object', properties: {} },
					values: { copilot: { projects: [{ id: 'checkout', path: '/checkout', git: true, status, remoteUrl: 'https://github.com/microsoft/vscode' }] } },
				},
			});
			root.handleSnapshot(state('cloning'), 0);
			const harness = await createContribution(store, [], { connection: upcastPartial<IAgentConnection>({ rootState: root }) });
			const messages: string[] = [];
			const tracker = store.add(harness.contribution.trackSessionCreationProgress('env-new', 'microsoft/vscode', { report: message => messages.push(message) }));
			if (failed) {
				root.handleSnapshot(state('failed'), 1);
			} else {
				tracker.dispose();
			}
			root.handleSnapshot(state('ready'), 2);
			results.push(messages);
		}
		assert.deepStrictEqual(results, [['Cloning repository'], ['Cloning repository', 'Repository cloning failed']]);
	});

	test('does not invent clone progress for missing capabilities, projects, or connections', async () => {
		const messages: string[] = [];
		const root = store.add(new RootStateSubscription('test', () => { }));
		root.handleSnapshot({ agents: [] }, 0);
		const harness = await createContribution(store, [], { connection: upcastPartial<IAgentConnection>({ rootState: root }) });
		store.add(harness.contribution.trackSessionCreationProgress('env-new', 'microsoft/vscode', { report: message => messages.push(message) }));
		store.add(harness.contribution.trackSessionCreationProgress('missing', 'microsoft/vscode', { report: message => messages.push(message) }));
		root.handleSnapshot({
			agents: [],
			_meta: { 'copilot.projectManagement': { available: true } },
			config: { schema: { type: 'object', properties: {} }, values: { copilot: { projects: [] } } },
		}, 1);
		assert.deepStrictEqual(messages, []);
	});

	test('a discovery pass that cannot see the new task yet does not tear it down mid-provision', async () => {
		// The scan was issued before the task existed, so it reports the environment as absent.
		// Without the in-flight guard, reconciliation disposes the provider we are connecting to.
		const harness = await createContribution(store, []);
		harness.onConnect = () => harness.runDiscovery();

		const provisioned = await harness.contribution.provisionSession({ repoNwo: 'osortega/simple-server', prompt: 'fix it' }, CancellationToken.None);

		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-new'));
		assert.deepStrictEqual({
			disposed: provider?.disposed,
			returnedLiveProvider: provisioned.provider === provider,
		}, {
			disposed: false,
			returnedLiveProvider: true,
		});
	});

	test('publishes the seeded session when connecting fails, so it is not withheld forever', async () => {
		// The task exists remotely once `createSession` returns, and nothing else clears a
		// withheld seed.
		const harness = await createContribution(store, []);
		harness.onConnect = async () => {
			throw new Error('relay unavailable');
		};

		await assert.rejects(() => harness.contribution.provisionSession({ prompt: 'fix it' }, CancellationToken.None));

		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-new'));
		assert.deepStrictEqual({
			withheld: [...(provider?.withheld ?? [])],
			listed: provider?.getSessions().map(s => AgentSession.id(s.resource)),
		}, {
			withheld: [],
			listed: ['sess-new'],
		});
	});

	test('keeps cancelled provisioning protected from discovery until connection success or failure', async () => {
		const results = [];
		for (const success of [true, false]) {
			const harness = await createContribution(store, []);
			const connecting = new DeferredPromise<void>();
			const connected = new DeferredPromise<void>();
			let connectToken: CancellationToken | undefined;
			harness.onConnect = async (_options, token) => {
				connectToken = token;
				await connecting.complete();
				await connected.p;
			};
			const source = store.add(new CancellationTokenSource());
			const request = harness.contribution.provisionSession({ prompt: 'fix it' }, source.token);
			const rejected = assert.rejects(request, isCancellationError);
			await connecting.p;
			source.cancel();
			await rejected;
			await harness.runDiscovery();
			const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-new'));
			const beforeSettled = {
				disposed: provider?.disposed,
				connectCancelled: connectToken?.isCancellationRequested,
				withheld: [...(provider?.withheld ?? [])],
				listed: provider?.getSessions().map(session => AgentSession.id(session.resource)),
			};
			const completion = harness.contribution.connect({ environmentId: 'env-new', name: 'Sandbox' });
			if (success) {
				await connected.complete();
				await completion;
			} else {
				const failed = assert.rejects(completion, /connection failed/);
				await connected.error(new Error('connection failed'));
				await failed;
			}
			await harness.runDiscovery();
			results.push({ beforeSettled, afterSettled: provider?.disposed });
		}
		assert.deepStrictEqual(results, [true, false].map(() => ({
			beforeSettled: { disposed: false, connectCancelled: false, withheld: [], listed: ['sess-new'] },
			afterSettled: true,
		})));
	});

	test('rejects when the feature is disabled while the sandbox is waking', async () => {
		// Connecting waits out the VM boot, which is long enough for the setting to change.
		// Returning a provider that teardown has already disposed would send into nothing.
		const harness = await createContribution(store, []);
		harness.onConnect = async () => {
			harness.configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, false);
		};

		await assert.rejects(() => harness.contribution.provisionSession({ prompt: 'fix it' }, CancellationToken.None));
	});

	test('registers nothing when the feature is disabled while the task is being created', async () => {
		// `_teardownAll` snapshots the environments it knows about, so a provider registered after
		// it runs is never reconciled — it would outlive the feature being turned off.
		let disable = () => { };
		const harness = await createContribution(store, [], {
			createSession: async () => {
				disable();
				return { taskId: 'task-new', sessionId: 'sess-new', environmentId: 'env-new' };
			},
		});
		disable = () => harness.configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, false);

		await assert.rejects(() => harness.contribution.provisionSession({ prompt: 'fix it' }, CancellationToken.None));

		assert.deepStrictEqual({
			providers: [...harness.contribution.stubProviders.keys()],
			connectedTo: harness.connectedTo,
		}, {
			providers: [],
			connectedTo: [],
		});
	});

	test('rejects without provisioning anything when the feature is already disabled', async () => {
		const harness = await createContribution(store, []);
		harness.configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);

		await assert.rejects(() => harness.contribution.provisionSession({ prompt: 'fix it' }, CancellationToken.None));

		assert.deepStrictEqual({ created: harness.created, connectedTo: harness.connectedTo }, { created: [], connectedTo: [] });
	});

	test('a later discovery pass reconciles with the provisioned session instead of duplicating it', async () => {
		const harness = await createContribution(store, []);
		await harness.contribution.provisionSession({ repoNwo: 'osortega/simple-server', prompt: 'fix it' }, CancellationToken.None);

		// The task is now visible to discovery, under the same session id it was created with.
		harness.discovered = [discoveredSession({ environmentId: 'env-new', sessionId: 'sess-new', taskId: 'task-new', name: 'fix it' })];
		await harness.runDiscovery();

		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-new'));
		assert.deepStrictEqual(provider?.seeded.map(m => m.session.toString()), ['ahp-session:/sess-new']);
	});
});
