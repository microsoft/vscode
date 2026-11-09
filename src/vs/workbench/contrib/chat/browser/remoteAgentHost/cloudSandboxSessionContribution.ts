/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, raceCancellation, raceCancellationError } from '../../../../../base/common/async.js';
import { cancelOnDispose, CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { isObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import {
	CLOUD_SANDBOX_AGENT_PROVIDER,
	CLOUD_SANDBOX_SESSION_SCHEME,
	CloudSandboxEnabledSettingId,
	CloudSandboxAutoConnectOnOpenSettingId,
	CloudSandboxSessionFeedEnabledSettingId,
	CloudSandboxAuthenticationRequiredError,
	CloudSandboxRequestError,
	cloudSandboxAddress,
	type CloudSandboxDiscoveryTrigger,
	type CloudSandboxTaskCreationPath,
	ICloudSandboxAgentHostService,
	ICloudSandboxApiService,
	ICloudSandboxDraftPreparationService,
	isCloudSandboxEnabled,
	isCloudSandboxPlaceholderTitle,
	isStaleQueuedCloudSandboxTask,
	type ICloudSandboxConnectOptions,
	type ICloudSandboxCreatedSession,
	type ICloudSandboxCreateSessionRequest,
	type ICloudSandboxPreparedReservation,
	type ICloudSandboxDiscoveryResult,
	type ICloudSandboxDiscoveryOptions,
	type ICloudSandboxDiscoveryDiagnostics,
	type ICloudSandboxDiscoveredSession,
	type ICloudSandboxTask,
	CLOUD_SANDBOX_TASK_SCHEME,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { AgentSession, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agent.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { findRemoteAgentHostSessionTypeAuthority, remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { getEntryAddress, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProgress } from '../../../../../platform/progress/common/progress.js';
import { IStorageEntry, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ChatSessionArchiveDiscoveryState, ChatSessionsExtensions, IAsyncChatSessionActivationRegistry, IChatSessionContentProvider, IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { CloudSandboxSessionHandler } from './cloudSandboxSessionHandler.js';
import { IRemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';
import { createCloudSandboxConnectionCustomization, isCloudSandboxConnectionAddress } from './cloudSandboxConnectionCustomization.js';
import { withSessionInitiator } from '../../../../../platform/agentHost/common/meta/agentSessionInitiatorMeta.js';
import { readCloudSandboxProjects } from '../../../../../platform/agentHost/common/meta/cloudSandboxProjectMeta.js';
import { getGitHubRepositoryFromRemoteUrl } from '../../../git/common/utils.js';
import { withSessionWorkspaceless } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { getAgentHostSessionResource } from '../../../../../platform/agentHost/common/agentHostSessionIdentity.js';
import { getCloudSandboxTaskCreationPath } from './cloudSandboxTelemetry.js';
import { CloudSandboxSessionFeed, type CloudSandboxSessionFeedRefresh } from './cloudSandboxSessionFeed.js';
import { CloudSandboxStartupError } from './cloudSandboxStartupError.js';

const LOG_PREFIX = '[CloudSandboxAgentHost]';
const DISCOVERY_POLL_INTERVAL_MS = 5 * 60_000;
const DISCOVERY_POLL_JITTER_MS = 60_000;
const FULL_DISCOVERY_INTERVAL_MS = 15 * 60_000;
const MAX_DISCOVERY_RETRY_INTERVAL_MS = 15 * 60_000;
const INVENTORY_STORAGE_PREFIX = 'sessions.cloudSandbox.inventory.';

interface ICloudSandboxDiscoveryRequest extends ICloudSandboxDiscoveryOptions {
	readonly retry?: boolean;
}

/** A discovered sandbox environment we can create a provider for. */
export interface ICloudSandboxSessionEnvironment {
	readonly environmentId: string;
	readonly eventType?: string;
	readonly application?: string;
	readonly sessionId?: string;
	/**
	 * Mission Control task owning the session. Persisted AHP history is addressed per task, so this
	 * is what makes the conversation readable once the environment is unreachable.
	 */
	readonly taskId?: string;
	readonly name: string;
	readonly repoName?: string;
	readonly hasRepository?: boolean;
	readonly updatedAt?: string;
	readonly isArchived?: boolean;
}

function isDiscoveredSandboxSession(value: unknown): value is ICloudSandboxTask {
	const candidate = value as Partial<ICloudSandboxTask> | undefined;
	return isObject(candidate)
		&& (candidate.environmentId === undefined || typeof candidate.environmentId === 'string' && candidate.environmentId.length > 0)
		&& (candidate.sessionId === undefined || typeof candidate.sessionId === 'string' && candidate.sessionId.length > 0)
		&& typeof candidate.taskId === 'string' && candidate.taskId.length > 0
		&& typeof candidate.name === 'string'
		&& (candidate.eventType === undefined || typeof candidate.eventType === 'string')
		&& (candidate.application === undefined || typeof candidate.application === 'string')
		&& (candidate.repoName === undefined || typeof candidate.repoName === 'string')
		&& (candidate.hasRepository === undefined || typeof candidate.hasRepository === 'boolean')
		&& (candidate.updatedAt === undefined || typeof candidate.updatedAt === 'string')
		&& (candidate.isQueued === undefined || typeof candidate.isQueued === 'boolean')
		&& (candidate.isArchived === undefined || typeof candidate.isArchived === 'boolean');
}

/**
 * The repository a discovered session belongs to, matching the shape the sandbox host reports once
 * connected so reconnecting does not visibly regroup the session.
 *
 * The `https` URI identifies the repository but is not backed by a file system provider, so a
 * session discovered this way cannot browse its files until it connects. The Agents window reads
 * a folder of this form, `https://github.com/<owner>/<repo>`, as naming the session's repository
 * (see `getSessionFolderGitHubRepository`), so it groups with its repository before it connects.
 */
export function discoveredSessionProject(repoName: string | undefined): IAgentSessionMetadata['project'] {
	if (!repoName) {
		return undefined;
	}
	return { uri: URI.parse(`https://github.com/${repoName}`), displayName: repoName };
}

/** The window-specific list maintained by shared sandbox discovery and activation. */
export interface ICloudSandboxSessionList extends IDisposable {
	readonly connectionStatus: IObservable<RemoteAgentHostConnectionStatus>;
	seedSessions(sessions: readonly IAgentSessionMetadata[], options?: { readonly updateExisting?: boolean; readonly workspaceless?: boolean }): void;
	/** Timestamp of a listed or provisional session, or undefined when it is absent. */
	getSessionModifiedTime(sessionId: string): number | undefined;
	/** Whether creation is still publishing this exact session. */
	hasProvisionalSession?(session: URI): boolean;
	setLabel?(label: string): void;
	setConnection(connection: IAgentConnection, defaultDirectory: string | undefined): void;
	setConnectionStatus(status: RemoteAgentHostConnectionStatus): void;
	setSessionArchived(rawId: string, archived: boolean): void;
	removeDeletedSession?(rawId: string): void;
	removeTaskOwnership?(rawId: string): void;
	/**
	 * Record a session this window just provisioned, before the host announces it. Implementations
	 * may withhold it from listings until {@link publishWithheldSession} or the host lists it.
	 */
	seedProvisionalSession?(metadata: IAgentSessionMetadata): void;
	/** Reveal a session seeded by {@link seedProvisionalSession} whose first turn did not dispatch. */
	publishWithheldSession?(rawId: string): void;
	/** Configuration recorded for a provisioned session whose draft had no backend to hold it. */
	getProvisionalSessionConfig?(sessionResource: URI): Record<string, unknown> | undefined;
}

/** A sandbox environment this window provisioned and connected to. */
export interface ICloudSandboxProvisionedEnvironment<T extends ICloudSandboxSessionList> extends ICloudSandboxCreatedSession {
	readonly address: string;
	readonly name: string;
	/** How the session is listed until it is titled: the first line of its prompt. */
	readonly title: string;
	readonly repoNwo: string | undefined;
	readonly provider: T;
}

/** The Agents window titles a new session's placeholder the same way. */
function newSessionTitle(prompt: string, fallback: string): string {
	return prompt.split('\n')[0].trim().substring(0, 100) || fallback;
}

export abstract class CloudSandboxSessionContribution<T extends ICloudSandboxSessionList> extends Disposable implements IWorkbenchContribution {

	/** Provider instances keyed by connection address (`cloudsandbox:<envId>`). */
	protected readonly _providerInstances = new Map<string, T>();
	protected readonly _tasks = new Map<string, ICloudSandboxTask>();
	private readonly _taskIdsByEnvironment = new Map<string, Map<string, string>>();
	private readonly _providerStores = this._register(new DisposableMap<string, IDisposable & { readonly token: CancellationToken }>());
	private _persistedInventory = new Map<string, string>();
	/** Environment metadata keyed by connection address, for on-demand reconnect. */
	private readonly _environments = new Map<string, ICloudSandboxSessionEnvironment>();
	/** Tasks are session-owned: several discovered tasks can share one environment. */
	private readonly _sessionEnvironments = new Map<string, Map<string, ICloudSandboxSessionEnvironment>>();
	/** In-flight connects keyed by address, so concurrent opens share one attempt. */
	private readonly _pendingConnects = new Map<string, { readonly source: CancellationTokenSource; readonly promise: Promise<string> }>();
	/**
	 * Addresses being provisioned right now. A task we just created is not yet visible to a
	 * discovery pass that started before it existed, so reconciliation would see a brand-new
	 * environment as one that has vanished and tear it down mid-provision.
	 */
	protected readonly _provisioning = new Set<string>();
	/** History-backed providers retained through their first live connection. */
	private readonly _historyHandlers = this._register(new DisposableMap<string, { readonly handler: CloudSandboxSessionHandler; dispose(): void }>());
	protected readonly _onDidChangeTaskCompletionTriggerCharacters = this._register(new Emitter<void>());

	/**
	 * Cancelled when the feature is disabled (or the contribution is disposed), so in-flight
	 * discovery and connects abort instead of committing state after teardown has run.
	 */
	protected _enabledCts = new CancellationTokenSource();
	/** Serializes discovery so overlapping triggers can't interleave reconciliation. */
	private _discoveryInFlight: Promise<void> | undefined;
	private _discoveryQueued: Promise<void> | undefined;
	private _discoveryDiagnostics: { coalescedRequestCount: number; coalescedTrigger?: CloudSandboxDiscoveryTrigger | 'multiple' } | undefined;
	private _queuedDiscoveryRequest: ICloudSandboxDiscoveryRequest | undefined;
	private _taskRefreshInFlight: Promise<void> | undefined;
	private _taskRefreshQueued: Promise<void> | undefined;
	private readonly _pendingTaskIds = new Set<string>();
	private _discoveryToken: CancellationToken | undefined;
	private _discoveryTrigger: CloudSandboxDiscoveryTrigger | undefined;
	private _lastDiscoveryFailed = false;
	private _discoveryIncremental = false;
	private _lastDiscoveryAttempt: number | undefined;
	private _lastFullDiscovery: number | undefined;
	private _discoveryRetryInterval = DISCOVERY_POLL_INTERVAL_MS;
	private _accountKey: string | undefined;
	protected get accountKey(): string | undefined { return this._accountKey; }
	private readonly _deletedTaskIds = new Set<string>();
	private readonly _sessionFeed = this._register(new MutableDisposable<CloudSandboxSessionFeed>());
	private readonly _archiveRegistration = this._register(new MutableDisposable());
	private readonly _archiveState = observableValue<ChatSessionArchiveDiscoveryState>(this, 'idle');
	private _archivesRequested = false;
	private _archivesLoaded = false;
	private _discoveryIncludesArchived = false;
	private _sessionMutationVersion = 0;
	private readonly _discoveryPoll = this._register(new RunOnceScheduler(() => {
		this._pruneStaleQueuedTasks();
		void this._refreshIfStale();
		this._discoveryPoll.schedule(this._nextPollDelay());
	}, DISCOVERY_POLL_INTERVAL_MS));

	constructor(
		@ICloudSandboxAgentHostService private readonly _cloudSandboxService: ICloudSandboxAgentHostService,
		@ICloudSandboxApiService protected readonly _apiService: ICloudSandboxApiService,
		@ICloudSandboxDraftPreparationService protected readonly _draftPreparationService: ICloudSandboxDraftPreparationService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IRemoteAgentHostConnectionCustomizationService private readonly _connectionCustomizations: IRemoteAgentHostConnectionCustomizationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@ILogService private readonly _logService: ILogService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IHostService private readonly _hostService: IHostService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super();
		this._updateArchiveRegistration();

		// Supply the generic remote-agent-host contribution with the sandbox host's per-connection
		// deviations (sealed-token auth + `ahp-session` backend scheme) without leaking sandbox
		// specifics into that shared code path.
		this._register(this._connectionCustomizations.register(
			isCloudSandboxConnectionAddress,
			address => {
				const connection = this._remoteAgentHostService.configuredEntries.find(entry => getEntryAddress(entry) === address)?.connection;
				const userLocal = connection?.type === RemoteAgentHostEntryType.CloudSandbox && connection.environmentKind === 'user-local';
				const customization = createCloudSandboxConnectionCustomization(address, this._cloudSandboxService, userLocal)!;
				return {
					...customization,
					registerChatSessionContentProvider: (sessionType, provider) => this._registerLiveSessionProvider(sessionType, provider),
					resolveInitialSessionConfig: sessionResource => this._providerInstances.get(address)?.getProvisionalSessionConfig?.(
						sessionResource.scheme === CLOUD_SANDBOX_TASK_SCHEME ? this._taskRuntimeResource(sessionResource) ?? sessionResource : sessionResource),
					// Sessions drafted under the creation type carry its model identifiers into the environment.
					modelIdentifierAliases: [SessionType.CloudSandbox],
					isSessionTitlePlaceholder: (title, resource) => isCloudSandboxPlaceholderTitle(title, resource.scheme === CLOUD_SANDBOX_TASK_SCHEME ? this._taskRuntimeResource(resource) ?? resource : resource),
					useSessionTitleForDefaultChat: true,
				};
			},
		));

		// Keep providers wired to their live connections and their status fresh.
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
			this._wireConnections();
			this._updateConnectionStatuses();
		}));

		// React to the feature toggles at runtime: (re)discover when enabled, tear everything down
		// when disabled, so enabling the setting doesn't require a reload and disabling it doesn't
		// leave stale providers, connections, or credential refreshers behind.
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CloudSandboxEnabledSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
				this._updateEnablement();
			}
			if (e.affectsConfiguration(CloudSandboxSessionFeedEnabledSettingId)) {
				for (const taskId of this._sessionFeed.value?.takePendingTaskIds() ?? []) {
					this._pendingTaskIds.add(taskId);
				}
				this._sessionFeed.clear();
				void this._refreshPendingTasks();
				void this._discoverAndSeed({ incremental: true, trigger: 'configurationChange', retry: true });
			}
		}));

		this._register(this._chatEntitlementService.onDidChangeSentiment(() => this._updateEnablement()));

		this._register(this._hostService.onDidChangeFocus(focused => {
			if (focused) {
				void this._refreshIfStale('focus');
			}
		}));
		this._register(this._apiService.onDidChangeAccount(accountKey => {
			if (!this._isEnabled()) {
				return;
			}
			const changedAccount = this._restoreAccount(accountKey);
			void this._discoverAndSeed({ incremental: !changedAccount, trigger: 'accountChange', retry: true });
		}));

		// Connect-on-open: resolves a seeded session by establishing the relay and waiting for the
		// host to advertise its agent. Scoped to our authorities so it never intercepts other
		// remote-agent-host types.
		// The source is swapped out by `_teardownAll`, so cancel whichever one is current on dispose.
		this._register(toDisposable(() => {
			this._enabledCts.cancel();
			this._enabledCts.dispose();
			for (const address of [...this._environments.keys()]) {
				this._teardownEnvironment(address);
			}
		}));

		this._register(Registry.as<IAsyncChatSessionActivationRegistry>(ChatSessionsExtensions.AsyncActivation).register({
			// Serve recorded history before the generic activator waits for a live host.
			priority: 1,
			matchSessionType: sessionType => this._findAddressForSessionType(sessionType) !== undefined,
			getActivationToken: sessionType => {
				const address = this._findAddressForSessionType(sessionType);
				return address ? this._providerStores.get(address)?.token ?? this._enabledCts.token : CancellationToken.Cancelled;
			},
			waitForActivation: (_accessor, sessionType) => this._waitForActivation(sessionType),
		}));
	}

	protected async _refreshIfStale(trigger: 'poll' | 'focus' | 'selection' | 'automatic' = 'poll'): Promise<void> {
		if (this._discoveryInFlight) {
			await (this._discoveryQueued ?? this._discoveryInFlight);
			return;
		}
		// A connected feed supplies updates; explicit refreshes and feed catch-up use discovery directly.
		if (this._sessionFeed.value?.connected) {
			return;
		}
		if (!this._hostService.hasFocus || (this._lastDiscoveryAttempt !== undefined && Date.now() - this._lastDiscoveryAttempt < this._pollInterval())) {
			return;
		}
		await this._discoverAndSeed({ incremental: true, trigger });
	}

	/** An account without any known sandbox only needs the periodic full reconciliation. */
	private _pollInterval(): number {
		return this._tasks.size === 0 && this._lastFullDiscovery !== undefined
			? Math.max(this._discoveryRetryInterval, FULL_DISCOVERY_INTERVAL_MS)
			: this._discoveryRetryInterval;
	}

	/** Time until the current interval elapses since the latest inventory pass, spread so windows do not poll in lockstep. */
	private _nextPollDelay(): number {
		const interval = this._pollInterval();
		const due = this._lastDiscoveryAttempt === undefined ? 0 : this._lastDiscoveryAttempt + interval - Date.now();
		return (due > 0 ? due : interval) + this._pollJitter();
	}

	protected _pollJitter(): number {
		return Math.floor(Math.random() * DISCOVERY_POLL_JITTER_MS);
	}

	/** Window adapters may defer catalog network work until first use. */
	protected get discoveryEnabled(): boolean { return true; }

	/** Inventory scans are serialized; feed task reads use an independent coalescing lane. */
	protected _discoverAndSeed(request: ICloudSandboxDiscoveryRequest = {}): Promise<void> {
		const { incremental = false, retry = false, taskIds, trigger = 'manual' } = request;
		if (!this._isEnabled() || this._store.isDisposed) {
			return Promise.resolve();
		}
		if (taskIds) {
			return this._refreshTasks(taskIds);
		}
		if (this._discoveryInFlight) {
			if (!retry && this._discoveryToken === this._enabledCts.token && (incremental || !this._discoveryIncremental)
				&& (!this._archivesRequested || this._discoveryIncludesArchived)) {
				if (this._discoveryDiagnostics) {
					this._discoveryDiagnostics.coalescedRequestCount++;
					const previous = this._discoveryDiagnostics.coalescedTrigger;
					this._discoveryDiagnostics.coalescedTrigger = previous === undefined || previous === trigger ? trigger : 'multiple';
				}
				const pending = this._discoveryQueued ?? this._discoveryInFlight;
				return trigger === 'manual' && this._discoveryTrigger !== 'manual'
					? pending.then(() => this._lastDiscoveryFailed ? this._discoverAndSeed(request) : undefined)
					: pending;
			}
			const coalescedRequestCount = this._queuedDiscoveryRequest ? (this._queuedDiscoveryRequest.diagnostics?.coalescedRequestCount ?? 0) + 1 : 0;
			const previousTrigger = this._queuedDiscoveryRequest?.diagnostics?.coalescedTrigger;
			const mergedTrigger = this._queuedDiscoveryRequest ? incremental ? trigger : this._queuedDiscoveryRequest.trigger ?? 'manual' : undefined;
			const coalescedTrigger = previousTrigger === undefined || previousTrigger === mergedTrigger ? mergedTrigger : 'multiple';
			if (!this._queuedDiscoveryRequest || !incremental) {
				this._queuedDiscoveryRequest = request;
			}
			this._queuedDiscoveryRequest = {
				...this._queuedDiscoveryRequest,
				diagnostics: { queued: true, coalescedRequestCount, coalescedTrigger },
			};
			this._discoveryQueued ??= this._discoveryInFlight.then(() => {
				const queued = this._queuedDiscoveryRequest;
				this._discoveryQueued = undefined;
				this._queuedDiscoveryRequest = undefined;
				return this._discoverAndSeed(queued);
			});
			return this._discoveryQueued;
		}
		const now = Date.now();
		const previousInventoryAgeMs = this._lastDiscoveryAttempt === undefined ? undefined : Math.max(0, now - this._lastDiscoveryAttempt);
		const lastFullAgeMs = this._lastFullDiscovery === undefined ? undefined : Math.max(0, now - this._lastFullDiscovery);
		if (this.discoveryEnabled) {
			this._lastDiscoveryAttempt = now;
		}
		this._discoveryIncremental = incremental && this._lastFullDiscovery !== undefined
			&& now - this._lastFullDiscovery < FULL_DISCOVERY_INTERVAL_MS;
		this._discoveryToken = this._enabledCts.token;
		this._discoveryTrigger = trigger;
		this._lastDiscoveryFailed = false;
		this._discoveryIncludesArchived = this._archivesRequested;
		const diagnostics = {
			intentMode: incremental ? 'incremental' : 'full',
			fullScanReason: this._discoveryIncremental ? 'notFull'
				: incremental ? this._lastFullDiscovery === undefined ? 'initial' : 'reconciliationDue'
					: trigger === 'startup' ? 'initial' : trigger === 'feedReconnect' ? 'reconnectPolicy'
						: trigger === 'accountChange' || trigger === 'configurationChange' ? trigger : 'requestedFull',
			previousInventoryAgeMs, lastFullAgeMs,
			queued: request.diagnostics?.queued ?? false,
			coalescedRequestCount: request.diagnostics?.coalescedRequestCount ?? 0,
			coalescedTrigger: request.diagnostics?.coalescedTrigger,
		} satisfies ICloudSandboxDiscoveryDiagnostics;
		this._discoveryDiagnostics = diagnostics;
		this._discoveryInFlight = this._doDiscoverAndSeed(this._discoveryToken, this._discoveryIncremental, trigger, taskIds, diagnostics).finally(() => {
			this._discoveryInFlight = undefined;
			this._discoveryDiagnostics = undefined;
			this._discoveryToken = undefined;
			this._discoveryTrigger = undefined;
			this._rearmDiscoveryPoll();
		});
		return this._discoveryInFlight;
	}

	/** Reschedules an armed poll from the current interval, which a finished pass or a first sandbox may have changed. */
	private _rearmDiscoveryPoll(): void {
		if (this._discoveryPoll.isScheduled()) {
			this._discoveryPoll.schedule(this._nextPollDelay());
		}
	}

	protected _refreshFromFeed(refresh: CloudSandboxSessionFeedRefresh): Promise<void> {
		if (this._configurationService.getValue<boolean>(CloudSandboxSessionFeedEnabledSettingId) !== true) {
			return Promise.resolve();
		}
		if (refresh.reason === 'change') {
			return this._refreshTasks(refresh.taskIds);
		}
		return this._discoverAndSeed({
			incremental: true,
			retry: true,
			trigger: refresh.reason === 'renewal' ? 'feedRenewal' : 'feedReconnect',
		});
	}

	private _refreshTasks(taskIds: readonly string[]): Promise<void> {
		if (!this.discoveryEnabled || !this._isEnabled() || this._store.isDisposed || this._configurationService.getValue<boolean>(CloudSandboxSessionFeedEnabledSettingId) !== true) {
			return Promise.resolve();
		}
		for (const id of taskIds) {
			this._pendingTaskIds.add(id);
		}
		return this._refreshPendingTasks();
	}

	/** Accepted task hints retain their access checks after the subscription stops. */
	private _refreshPendingTasks(): Promise<void> {
		if (!this._isEnabled() || this._store.isDisposed) {
			return Promise.resolve();
		}
		if (this._taskRefreshInFlight) {
			this._taskRefreshQueued ??= this._taskRefreshInFlight.then(() => {
				this._taskRefreshQueued = undefined;
				return this._refreshPendingTasks();
			});
			return this._taskRefreshQueued;
		}
		if (!this._pendingTaskIds.size) {
			return Promise.resolve();
		}
		const token = this._enabledCts.token;
		this._taskRefreshInFlight = Promise.resolve().then(() => {
			if (token.isCancellationRequested) {
				return;
			}
			const pending = [...this._pendingTaskIds];
			this._pendingTaskIds.clear();
			return pending.length ? this._doDiscoverAndSeed(token, true, 'feedChange', pending) : undefined;
		}).finally(() => {
			this._taskRefreshInFlight = undefined;
		});
		return this._taskRefreshInFlight;
	}

	private async _doDiscoverAndSeed(token: CancellationToken, incremental: boolean, trigger: CloudSandboxDiscoveryTrigger, taskIds?: readonly string[], diagnostics?: ICloudSandboxDiscoveryDiagnostics): Promise<void> {
		let result: ICloudSandboxDiscoveryResult;
		// Keep the scope fixed across authentication so it matches the in-flight coalescing flag.
		const includeArchived = this._archivesRequested;
		try {
			const accountKey = await this._apiService.getAccountKey();
			if (token.isCancellationRequested || !this._isEnabled()) {
				return;
			}
			if (this._restoreAccount(accountKey)) {
				if (taskIds) {
					void this._discoverAndSeed({ trigger: 'accountChange', retry: true });
					return;
				}
				token = this._enabledCts.token;
				this._discoveryToken = token;
				this._discoveryIncremental = incremental = false;
				if (diagnostics && trigger !== 'startup') {
					Object.assign(diagnostics, { fullScanReason: 'accountChange' });
				}
				taskIds = undefined;
			}
			if (!this.discoveryEnabled) {
				// First use must not coalesce into this completed local-only pass.
				this._discoveryToken = undefined;
				return;
			}
			if (!taskIds && this._lastDiscoveryAttempt === undefined) {
				this._lastDiscoveryAttempt = Date.now();
			}
			if (includeArchived && !taskIds && !this._archivesLoaded) {
				this._archiveState.set('loading', undefined);
			}
			if (!accountKey) {
				throw new CloudSandboxAuthenticationRequiredError();
			}
			while (!token.isCancellationRequested && this._isEnabled() && this._configurationService.getValue<boolean>(CloudSandboxSessionFeedEnabledSettingId) === true) {
				const feed = this._sessionFeed.value ??= this._instantiationService.createInstance(CloudSandboxSessionFeed,
					refresh => void this._refreshFromFeed(refresh), undefined, undefined);
				await feed.start();
				if (this._sessionFeed.value === feed) {
					break;
				}
			}
			if (token.isCancellationRequested || !this._isEnabled()) {
				return;
			}
			if (!this._discoveryPoll.isScheduled()) {
				this._discoveryPoll.schedule(this._nextPollDelay());
			}
			const mutationVersion = this._sessionMutationVersion;
			result = await this._apiService.listSessions(token, { incremental, includeArchived, trigger, ...(taskIds ? { taskIds } : {}), ...(diagnostics ? { diagnostics } : {}) });
			const retryTaskIds = taskIds && (result.kind === 'failed' ? taskIds : result.kind === 'partial' ? result.failedTaskIds : undefined);
			if (retryTaskIds?.length && !token.isCancellationRequested && this._isEnabled()) {
				const retried = await this._apiService.listSessions(token, { incremental: true, trigger, taskIds: retryTaskIds });
				if (result.kind === 'failed') {
					result = retried;
				} else if (result.kind === 'partial' && retried.kind !== 'failed') {
					result = {
						kind: retried.kind === 'partial' ? 'partial' : 'incremental',
						sessions: [...result.sessions, ...retried.sessions],
						removedTaskIds: [...result.removedTaskIds ?? [], ...retried.removedTaskIds ?? []],
						...(retried.kind === 'partial' ? { failedTaskIds: retried.failedTaskIds } : {}),
					};
				}
			}
			if (mutationVersion !== this._sessionMutationVersion) {
				result = { kind: 'failed', reason: 'Sandbox discovery was invalidated by a session mutation' };
			}
		} catch (error) {
			if (token.isCancellationRequested || isCancellationError(error) || !this._isEnabled()) {
				return;
			}
			result = { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
		}
		if (token.isCancellationRequested || !this._isEnabled()) {
			return;
		}
		if (!taskIds) {
			this._lastDiscoveryFailed = result.kind === 'failed';
		}
		if (includeArchived && !taskIds) {
			const succeeded = result.kind === 'complete' || result.kind === 'incremental' || result.kind === 'partial' && result.inventoryComplete === true;
			this._archivesLoaded ||= succeeded;
			this._archiveState.set(this._archivesLoaded ? 'loaded' : 'error', undefined);
		}
		this._discoveryRetryInterval = result.kind === 'failed' || result.kind === 'partial'
			? Math.min(this._discoveryRetryInterval * 2, MAX_DISCOVERY_RETRY_INTERVAL_MS)
			: DISCOVERY_POLL_INTERVAL_MS;
		if (result.kind === 'failed') {
			this._logService.warn(`${LOG_PREFIX} Discovery failed: ${result.reason}`);
			return;
		}
		if (result.kind === 'complete' || result.kind === 'scoped'
			|| result.kind === 'partial' && result.inventoryComplete && !incremental && !taskIds) {
			this._lastFullDiscovery = Date.now();
		}

		this._batchProviderChanges(() => this._reconcileDiscoveredSessions(result));
	}

	private _reconcileDiscoveredSessions(result: Exclude<ICloudSandboxDiscoveryResult, { kind: 'failed' }>): void {
		const hadTasks = this._tasks.size > 0;
		const previousTasks = new Set(this._tasks.keys());
		const removedTaskIds = new Set(result.removedTaskIds);
		const visibleTasks = result.sessions.filter(task => {
			if (isStaleQueuedCloudSandboxTask(task)) {
				removedTaskIds.add(task.taskId);
				return false;
			}
			return true;
		});
		for (const task of visibleTasks) {
			previousTasks.delete(task.taskId);
			if (!this._deletedTaskIds.has(task.taskId)) {
				const known = this._tasks.get(task.taskId);
				const updated = {
					...known, ...task,
					isArchived: task.isArchived === true,
					environmentId: task.environmentId ?? known?.environmentId,
					sessionId: task.sessionId ?? known?.sessionId,
				};
				if (!task.isQueued) {
					delete updated.isQueued;
				}
				this._storeTask(updated);
			}
		}
		if (result.kind === 'complete' || result.kind === 'scoped') {
			for (const taskId of previousTasks) {
				const task = this._tasks.get(taskId)!;
				if ((result.kind === 'complete' || !task.isArchived) && (!task.environmentId || !this._hasActiveConnection(cloudSandboxAddress(task.environmentId)))) {
					removedTaskIds.add(taskId);
				}
			}
		}
		for (const taskId of removedTaskIds) {
			const task = this._tasks.get(taskId);
			const address = task?.environmentId && cloudSandboxAddress(task.environmentId);
			if (address && (this._provisioning.has(address) || task?.sessionId && this._providerInstances.get(address)?.hasProvisionalSession?.(AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, task.sessionId)))) {
				removedTaskIds.delete(taskId);
			} else {
				this._forgetTask(taskId);
			}
		}
		this._onTasksChanged(visibleTasks.flatMap(task => {
			const current = this._tasks.get(task.taskId);
			return current ? [current] : [];
		}), [...removedTaskIds]);
		if (!hadTasks && this._tasks.size) {
			this._rearmDiscoveryPoll();
		}

		const present = new Set<string>();
		const presentSessions = new Set<string>();
		const updatedTasks = new Set<string>();
		for (const task of visibleTasks) {
			const session = this._tasks.get(task.taskId) ?? task;
			if (!session.environmentId || !session.sessionId || this._deletedTaskIds.has(session.taskId)) {
				continue;
			}
			const address = cloudSandboxAddress(session.environmentId);
			present.add(address);
			presentSessions.add(JSON.stringify([address, session.sessionId]));
			updatedTasks.add(session.taskId);
			if (this._providerInstances.has(address)) {
				this._seedDiscoveredSession({ ...session, environmentId: session.environmentId, sessionId: session.sessionId, isArchived: session.isArchived === true });
			}
		}

		const removedTasks = removedTaskIds;
		for (const [address, sessions] of this._sessionEnvironments) {
			if (this._provisioning.has(address)) {
				continue;
			}
			const connected = this._remoteAgentHostService.connections.some(
				c => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status));
			for (const [rawId, session] of sessions) {
				if (!presentSessions.has(JSON.stringify([address, rawId]))
					&& ((result.kind === 'complete' || result.kind === 'scoped' && !session.isArchived) && !this._hasActiveConnection(address)
						|| !!session.taskId && (removedTasks.has(session.taskId) || updatedTasks.has(session.taskId)))) {
					sessions.delete(rawId);
					this._providerInstances.get(address)?.removeTaskOwnership?.(rawId);
					if (!connected) {
						this._providerInstances.get(address)?.removeDeletedSession?.(rawId);
					}
					if (session.taskId) {
						this._apiService.clearSessionHistory(session.taskId);
					}
				}
			}
			const remaining = sessions.values().next().value;
			if (remaining && !sessions.has(this._environments.get(address)?.sessionId ?? '')) {
				this._environments.set(address, remaining);
			}
		}
		for (const [address, environment] of this._environments) {
			if (present.has(address) || this._provisioning.has(address)) {
				continue;
			}
			const refreshesWindow = result.kind === 'complete' || result.kind === 'scoped' && !environment.isArchived;
			if (!refreshesWindow && (!environment.taskId || (!removedTasks.has(environment.taskId) && !updatedTasks.has(environment.taskId)))) {
				continue;
			}
			const connected = this._remoteAgentHostService.connections.some(
				c => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status));
			const explicitlyChanged = !!environment.taskId && (removedTasks.has(environment.taskId) || updatedTasks.has(environment.taskId));
			if (!connected && (explicitlyChanged || !this._hasActiveConnection(address))) {
				this._teardownEnvironment(address);
			}
		}

		this._persistInventory();
		this._logService.info(`${LOG_PREFIX} Seeded ${present.size} discovered sandbox environment(s)${result.kind === 'partial' ? ' (partial scan; kept existing entries)' : ''}.`);
	}

	private _pruneStaleQueuedTasks(): void {
		const removedTaskIds = [...this._tasks.values()].filter(task => isStaleQueuedCloudSandboxTask(task)).map(task => task.taskId);
		if (removedTaskIds.length) {
			this._batchProviderChanges(() => this._reconcileDiscoveredSessions({ kind: 'incremental', sessions: [], removedTaskIds }));
		}
	}

	private _hasActiveConnection(address: string): boolean {
		return this._pendingConnects.has(address) || this._remoteAgentHostService.connections.some(c => c.address === address && (
			RemoteAgentHostConnectionStatus.isConnected(c.status)
			|| RemoteAgentHostConnectionStatus.isConnecting(c.status)
			|| RemoteAgentHostConnectionStatus.isReconnecting(c.status)
		));
	}

	private _seedDiscoveredSession(session: ICloudSandboxDiscoveredSession): void {
		this._ensureProvider(session);
		const address = cloudSandboxAddress(session.environmentId);
		this._updateSandboxSession(address, session);
		const provider = this._providerInstances.get(address);
		provider?.setLabel?.(session.name);
		const parsed = session.updatedAt ? Date.parse(session.updatedAt) : Number.NaN;
		const modifiedTime = Number.isNaN(parsed) ? provider?.getSessionModifiedTime(session.sessionId) ?? Date.now() : parsed;
		const project = discoveredSessionProject(session.repoName);
		const application = session.application || session.eventType;
		provider?.seedSessions([{
			session: AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, session.sessionId),
			provider: CLOUD_SANDBOX_AGENT_PROVIDER,
			...(application ? { _meta: withSessionInitiator(undefined, { name: application }) } : {}),
			startTime: modifiedTime,
			modifiedTime,
			summary: session.name,
			...(session.status !== undefined ? { status: session.status } : {}),
			...(project ? { project } : {}),
		}], { updateExisting: true, workspaceless: session.hasRepository === undefined ? undefined : !session.hasRepository });
		if (session.isArchived !== undefined) {
			provider?.setSessionArchived(session.sessionId, session.isArchived);
		}
	}

	protected abstract _onTasksChanged(tasks: readonly ICloudSandboxTask[], removedTaskIds: readonly string[]): void;
	protected abstract _resetTaskCatalog(): void;

	protected async _resolveTask(taskId: string, token: CancellationToken): Promise<T> {
		const task = this._tasks.get(taskId);
		if (!task || !this._isEnabled()) {
			throw new Error(localize('cloudSandbox.taskNotFound', "The cloud task is no longer available."));
		}
		const generation = this._enabledCts.token;
		const binding = task.environmentId && task.sessionId
			? { ...task, environmentId: task.environmentId, sessionId: task.sessionId }
			: await this._apiService.resolveSession(taskId, token);
		if (token.isCancellationRequested || generation.isCancellationRequested || !this._tasks.has(taskId)) {
			throw new CancellationError();
		}
		const session: ICloudSandboxDiscoveredSession = {
			...this._tasks.get(taskId)!,
			environmentId: binding.environmentId,
			sessionId: binding.sessionId,
		};
		this._storeTask(session);
		this._seedDiscoveredSession(session);
		this._persistInventory();
		const provider = this._providerInstances.get(cloudSandboxAddress(session.environmentId));
		if (!provider) {
			throw new Error('Cloud session backend was not created.');
		}
		return provider;
	}

	protected async _taskSessionType(taskId: string, token: CancellationToken, connect = false): Promise<string> {
		await this._resolveTask(taskId, token);
		const task = this._tasks.get(taskId);
		if (!task?.environmentId) {
			throw new CancellationError();
		}
		const sessionType = remoteAgentHostSessionTypeId(agentHostAuthority(cloudSandboxAddress(task.environmentId)), CLOUD_SANDBOX_AGENT_PROVIDER);
		if (connect) {
			await raceCancellationError(this._connectEnvironment(task.environmentId), token);
			const handler = this._historyHandlers.get(sessionType)?.handler;
			if (!handler) {
				throw new Error(localize('cloudSandbox.liveUnavailable', "The live cloud conversation is unavailable."));
			}
			await handler.whenLiveProviderReady(token);
		}
		return sessionType;
	}

	protected async _openTask(resource: URI, token: CancellationToken) {
		const sessionType = await this._taskSessionType(resource.path.slice(1), token);
		await this._waitForActivation(sessionType);
		const handler = this._historyHandlers.get(sessionType)?.handler;
		if (!handler) {
			throw new Error(localize('cloudSandbox.historyUnavailable', "The cloud conversation is unavailable."));
		}
		return handler.provideChatSessionContent(resource, token);
	}

	protected async _prepareTaskRequest(resource: URI, token: CancellationToken) {
		const sessionType = await this._taskSessionType(resource.path.slice(1), token, true);
		const handler = this._historyHandlers.get(sessionType)?.handler;
		if (!handler) {
			throw new CancellationError();
		}
		return { sessionType, reference: await handler.acquireLiveChat(resource, token) };
	}

	protected async _taskCompletionTriggerCharacters(): Promise<readonly string[]> {
		const characters = await Promise.all([...this._historyHandlers.values()].filter(({ handler }) => handler.hasLiveProvider).map(({ handler }) => handler.provideChatInputCompletionTriggerCharacters()));
		return [...new Set(characters.flat())];
	}

	protected _taskHandler(resource: URI): CloudSandboxSessionHandler | undefined {
		const task = this._tasks.get(resource.path.slice(1));
		const sessionType = task?.environmentId && remoteAgentHostSessionTypeId(agentHostAuthority(cloudSandboxAddress(task.environmentId)), CLOUD_SANDBOX_AGENT_PROVIDER);
		return sessionType ? this._historyHandlers.get(sessionType)?.handler : undefined;
	}

	protected _taskRuntimeResource(resource: URI): URI | undefined {
		const task = this._tasks.get(resource.path.slice(1));
		return task?.environmentId && task.sessionId
			? resource.with({
				scheme: remoteAgentHostSessionTypeId(agentHostAuthority(cloudSandboxAddress(task.environmentId)), CLOUD_SANDBOX_AGENT_PROVIDER),
				path: `/${task.sessionId}`,
			})
			: undefined;
	}

	protected async _renameTask(taskId: string, title: string): Promise<void> {
		if (!this._tasks.has(taskId) || !this._isEnabled()) {
			throw new CancellationError();
		}
		const token = this._enabledCts.token;
		await this._apiService.renameTask(taskId, title, token);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const task = this._tasks.get(taskId);
		if (task) {
			this._sessionMutationVersion++;
			const updated = { ...task, name: title };
			this._storeTask(updated);
			this._onTasksChanged([updated], []);
			this._persistInventory();
		}
	}

	protected async _archiveTask(taskId: string, archived: boolean): Promise<void> {
		if (!this._tasks.has(taskId) || !this._isEnabled()) {
			throw new CancellationError();
		}
		const token = this._enabledCts.token;
		await this._apiService.setTaskArchived(taskId, archived, token);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const task = this._tasks.get(taskId);
		if (task) {
			this._sessionMutationVersion++;
			const updated = { ...task, isArchived: archived };
			this._storeTask(updated);
			this._onTasksChanged([updated], []);
			this._persistInventory();
		}
	}

	protected async _deleteTask(taskId: string): Promise<void> {
		if (!this._tasks.has(taskId) || !this._isEnabled()) {
			throw new CancellationError();
		}
		const token = this._enabledCts.token;
		await this._apiService.deleteTask(taskId, token);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		this._sessionMutationVersion++;
		this._deletedTaskIds.add(taskId);
		this._forgetTask(taskId);
		for (const [address, sessions] of this._sessionEnvironments) {
			for (const [rawId, session] of sessions) {
				if (session.taskId === taskId) {
					sessions.delete(rawId);
					this._providerInstances.get(address)?.removeDeletedSession?.(rawId);
				}
			}
			if (!sessions.size) {
				this._teardownEnvironment(address);
			}
		}
		this._onTasksChanged([], [taskId]);
		this._apiService.clearSessionHistory(taskId);
		this._persistInventory();
	}

	protected _restoreAccount(accountKey: string | undefined): boolean {
		return this._batchProviderChanges(() => this._restoreAccountInventory(accountKey));
	}

	private _restoreAccountInventory(accountKey: string | undefined): boolean {
		if (accountKey === this._accountKey) {
			return false;
		}
		this._teardownAll();
		this._accountKey = accountKey;
		if (accountKey) {
			const storageKey = INVENTORY_STORAGE_PREFIX + accountKey;
			const keys = this._storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE).filter(key => key.startsWith(`${storageKey}.`));
			const tasks: ICloudSandboxTask[] = [];
			let restored = 0;
			for (const key of keys) {
				const sessions = this._readInventory(key);
				this._persistedInventory.set(key, JSON.stringify({ version: 1, sessions }));
				for (const session of sessions) {
					this._storeTask(session);
					tasks.push(session);
					restored++;
				}
			}
			if (keys.length === 0 && this._storageService.get(storageKey, StorageScope.PROFILE) !== undefined) {
				for (const session of this._readInventory(storageKey)) {
					this._storeTask(session);
					tasks.push(session);
					restored++;
				}
				this._persistInventory();
			}
			this._onTasksChanged(tasks, []);
			if (restored) {
				this._logService.info(`${LOG_PREFIX} Restored ${restored} cached sandbox environment(s).`);
			}
		}
		return true;
	}

	private _readInventory(storageKey: string): readonly ICloudSandboxTask[] {
		let cached: { readonly version?: number; readonly sessions?: unknown } | undefined;
		try {
			cached = this._storageService.getObject(storageKey, StorageScope.PROFILE);
		} catch (error) {
			this._logService.warn(`${LOG_PREFIX} Reading cached sandbox inventory failed.`, error);
			return [];
		}
		if (cached !== undefined) {
			if (isObject(cached) && cached.version === 1 && Array.isArray(cached.sessions) && cached.sessions.every(isDiscoveredSandboxSession)) {
				return cached.sessions.filter(session => !isStaleQueuedCloudSandboxTask(session));
			}
			this._logService.warn(`${LOG_PREFIX} Ignoring invalid cached sandbox inventory.`);
		}
		return [];
	}

	protected _persistInventory(): void {
		if (!this._accountKey) {
			return;
		}
		const storageKey = INVENTORY_STORAGE_PREFIX + this._accountKey;
		const inventory = new Map<string, string>();
		const entries: IStorageEntry[] = [];
		for (const session of this._tasks.values()) {
			const key = `${storageKey}.${JSON.stringify(['task', session.taskId])}`;
			const { status: _status, ...cached } = session;
			const value = JSON.stringify({ version: 1, sessions: [cached] });
			inventory.set(key, value);
			if (this._persistedInventory.get(key) !== value) {
				entries.push({ key, value, scope: StorageScope.PROFILE, target: StorageTarget.MACHINE });
			}
		}
		// Only remove this window's known entries, never a concurrent window's newly stored sessions.
		for (const key of this._persistedInventory.keys()) {
			if (!inventory.has(key)) {
				entries.push({ key, value: undefined, scope: StorageScope.PROFILE, target: StorageTarget.MACHINE });
			}
		}
		if (this._storageService.get(storageKey, StorageScope.PROFILE) !== undefined) {
			entries.push({ key: storageKey, value: undefined, scope: StorageScope.PROFILE, target: StorageTarget.MACHINE });
		}
		this._persistedInventory = inventory;
		this._storageService.storeAll(entries, false);
	}

	protected _ownsSandboxSession(address: string, rawId: string): boolean {
		return this._getTaskId(address, AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, rawId)) !== undefined;
	}

	protected _environmentTasks(environmentId: string): readonly ICloudSandboxDiscoveredSession[] {
		const tasks: ICloudSandboxDiscoveredSession[] = [];
		for (const [sessionId, taskId] of this._taskIdsByEnvironment.get(cloudSandboxAddress(environmentId)) ?? []) {
			const task = this._tasks.get(taskId);
			if (task) {
				tasks.push({ ...task, environmentId, sessionId });
			}
		}
		return tasks;
	}

	private _storeTask(task: ICloudSandboxTask): void {
		this._removeTaskBinding(task.taskId);
		this._tasks.set(task.taskId, task);
		if (task.environmentId && task.sessionId) {
			const address = cloudSandboxAddress(task.environmentId);
			let bindings = this._taskIdsByEnvironment.get(address);
			if (!bindings) {
				bindings = new Map();
				this._taskIdsByEnvironment.set(address, bindings);
			}
			bindings.set(task.sessionId, task.taskId);
		}
	}

	private _forgetTask(taskId: string): void {
		this._removeTaskBinding(taskId);
		this._tasks.delete(taskId);
	}

	private _removeTaskBinding(taskId: string): void {
		const task = this._tasks.get(taskId);
		if (task?.environmentId && task.sessionId) {
			const address = cloudSandboxAddress(task.environmentId);
			const bindings = this._taskIdsByEnvironment.get(address);
			if (bindings?.get(task.sessionId) === taskId) {
				bindings.delete(task.sessionId);
				if (!bindings.size) {
					this._taskIdsByEnvironment.delete(address);
				}
			}
		}
	}

	protected _getTaskId(address: string, resource: URI): string | undefined {
		if (resource.scheme === CLOUD_SANDBOX_TASK_SCHEME) {
			const taskId = resource.path.slice(1);
			const task = this._tasks.get(taskId);
			return task?.environmentId && cloudSandboxAddress(task.environmentId) === address ? taskId : undefined;
		}
		if (resource.scheme !== CLOUD_SANDBOX_SESSION_SCHEME && resource.scheme !== remoteAgentHostSessionTypeId(agentHostAuthority(address), CLOUD_SANDBOX_AGENT_PROVIDER)) {
			return undefined;
		}
		const rawId = AgentSession.id(resource);
		const backend = (resource.scheme === CLOUD_SANDBOX_SESSION_SCHEME ? resource : getAgentHostSessionResource(resource)).with({ scheme: CLOUD_SANDBOX_SESSION_SCHEME });
		return isEqual(backend, AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, rawId)) ? this._taskIdsByEnvironment.get(address)?.get(rawId) : undefined;
	}

	private _updateSandboxSession(address: string, session: ICloudSandboxSessionEnvironment): void {
		if (session.taskId) {
			const current = this._tasks.get(session.taskId);
			if (current) {
				const task = { ...current, ...session };
				this._storeTask(task);
				this._onTasksChanged([task], []);
			}
		}
		if (session.sessionId) {
			this._sessionEnvironments.get(address)?.set(session.sessionId, session);
			if (this._environments.get(address)?.sessionId === session.sessionId) {
				this._environments.set(address, session);
			}
		}
	}

	protected async _renameSandboxSession(address: string, rawId: string, title: string): Promise<void> {
		const environment = this._sessionEnvironments.get(address)?.get(rawId);
		if (!environment?.taskId) {
			throw new Error(localize('cloudSandbox.renameSessionNotFound', "Mission Control sandbox session not found."));
		}
		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource(this._enabledCts.token));
		try {
			await this._apiService.renameTask(environment.taskId, title, source.token);
			if (source.token.isCancellationRequested) {
				throw new CancellationError();
			}
		} finally {
			store.dispose();
		}
		const current = this._sessionEnvironments.get(address)?.get(rawId);
		if (current?.taskId !== environment.taskId || current.sessionId !== rawId) {
			throw new CancellationError();
		}
		this._sessionMutationVersion++;
		this._updateSandboxSession(address, { ...current, name: title });
		this._persistInventory();
	}

	protected async _setSandboxSessionArchived(address: string, rawId: string, archived: boolean, token: CancellationToken = CancellationToken.None): Promise<void> {
		const environment = this._sessionEnvironments.get(address)?.get(rawId);
		if (!environment?.taskId) {
			throw new Error(localize('cloudSandbox.archiveSessionNotFound', "Mission Control sandbox session not found."));
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource(this._enabledCts.token));
		store.add(token.onCancellationRequested(() => source.cancel()));
		try {
			await this._apiService.setTaskArchived(environment.taskId, archived, source.token);
			if (source.token.isCancellationRequested) {
				throw new CancellationError();
			}
		} finally {
			store.dispose();
		}
		const current = this._sessionEnvironments.get(address)?.get(rawId);
		if (current?.taskId !== environment.taskId || current.sessionId !== rawId) {
			throw new CancellationError();
		}
		this._sessionMutationVersion++;
		this._updateSandboxSession(address, { ...current, isArchived: archived });
		this._persistInventory();
	}

	protected async _deleteSandboxSession(address: string, sessionIds: readonly string[], removeSession: (rawId: string) => void, token: CancellationToken = CancellationToken.None): Promise<void> {
		const sessions = this._sessionEnvironments.get(address);
		const targets: { sessionId: string; taskId: string }[] = [];
		for (const sessionId of sessionIds) {
			const taskId = sessions?.get(sessionId)?.taskId;
			if (!taskId) {
				throw new Error(localize('cloudSandbox.deleteSessionNotFound', "Mission Control sandbox session not found."));
			}
			targets.push({ sessionId, taskId });
		}
		if (sessionIds.length === 0) {
			return;
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource(this._enabledCts.token));
		store.add(token.onCancellationRequested(() => source.cancel()));
		try {
			for (const target of targets) {
				await this._apiService.deleteTask(target.taskId, source.token);
				if (source.token.isCancellationRequested) {
					throw new CancellationError();
				}
				this._sessionMutationVersion++;
				this._deletedTaskIds.add(target.taskId);
				this._forgetTask(target.taskId);
				this._onTasksChanged([], [target.taskId]);
				this._apiService.clearSessionHistory(target.taskId);
				sessions?.delete(target.sessionId);
				removeSession(target.sessionId);
			}
		} finally {
			store.dispose();
			if (this._sessionEnvironments.get(address) === sessions) {
				const remaining = sessions?.values().next().value;
				if (!remaining) {
					this._teardownEnvironment(address);
				} else if (!sessions?.has(this._environments.get(address)?.sessionId ?? '')) {
					this._environments.set(address, remaining);
				}
				this._persistInventory();
			}
		}
	}

	/**
	 * Cancel pending work and remove the connection while retaining the provider and its cached sessions.
	 */
	protected async _disconnectEnvironment(address: string): Promise<void> {
		this._cancelPendingConnect(address);
		try {
			await this._cloudSandboxService.disconnect(address);
		} catch (error) {
			this._logService.warn(`${LOG_PREFIX} Failed to disconnect ${address}: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			if (!this._pendingConnects.has(address)) {
				this._settleFailedConnect(address);
			}
		}
	}

	private _cancelPendingConnect(address: string): void {
		const pending = this._pendingConnects.get(address);
		this._pendingConnects.delete(address);
		pending?.source.dispose(true);
	}

	/**
	 * Fully tear down an environment: dispose its provider (unregistering it and its sessions) and
	 * remove its connection + credential refresher. Used when an environment vanishes from discovery
	 * or the feature is disabled.
	 */
	private _teardownEnvironment(address: string): void {
		for (const session of this._sessionEnvironments.get(address)?.values() ?? []) {
			if (session.taskId) {
				this._apiService.clearSessionHistory(session.taskId);
			}
		}
		this._sessionEnvironments.delete(address);
		this._environments.delete(address);
		this._cancelPendingConnect(address);
		this._providerStores.deleteAndDispose(address);
		this._clearSessionHandlers(address);
		void this._disconnectEnvironment(address);
	}

	/** Tear down every known sandbox environment (feature disabled). */
	private _teardownAll(): void {
		this._batchProviderChanges(() => this._teardownInventory());
	}

	private _teardownInventory(): void {
		this._resetTaskCatalog();
		this._tasks.clear();
		this._taskIdsByEnvironment.clear();
		this._sessionFeed.clear();
		this._discoveryPoll.cancel();
		this._pendingTaskIds.clear();
		this._apiService.clearSessionHistory();
		// Abort in-flight discovery/connects first so nothing commits state after this runs.
		this._enabledCts.cancel();
		this._enabledCts.dispose();
		this._enabledCts = new CancellationTokenSource();
		this._lastDiscoveryAttempt = undefined;
		this._lastFullDiscovery = undefined;
		this._archivesLoaded = false;
		this._archiveState.set('idle', undefined);
		this._discoveryRetryInterval = DISCOVERY_POLL_INTERVAL_MS;
		this._accountKey = undefined;
		this._deletedTaskIds.clear();
		this._persistedInventory.clear();
		for (const address of [...this._environments.keys()]) {
			this._teardownEnvironment(address);
		}
	}

	/** Map each known sandbox connection authority to its address (`cloudsandbox:<envId>`). */
	private _authoritiesByAddress(): Map<string, string> {
		const byAuthority = new Map<string, string>();
		for (const address of this._environments.keys()) {
			byAuthority.set(agentHostAuthority(address), address);
		}
		for (const task of this._tasks.values()) {
			if (task.environmentId) {
				const address = cloudSandboxAddress(task.environmentId);
				byAuthority.set(agentHostAuthority(address), address);
			}
		}
		return byAuthority;
	}

	/** Resolve the sandbox address owning a remote-agent-host session type, if any. */
	private _findAddressForSessionType(sessionType: string): string | undefined {
		const byAuthority = this._authoritiesByAddress();
		const authority = findRemoteAgentHostSessionTypeAuthority(sessionType, byAuthority.keys());
		return authority ? byAuthority.get(authority) : undefined;
	}

	/** Whether the chat surface can hand off persisted history and offline drafts to a live connection. */
	protected get supportsBackgroundConnection(): boolean { return false; }

	/** Makes recorded history available independently of the surface's connection-on-open policy. */
	protected async _waitForActivation(sessionType: string): Promise<boolean> {
		const address = this._findAddressForSessionType(sessionType);
		if (address && !this._providerInstances.has(address)) {
			for (const task of this._tasks.values()) {
				if (task.environmentId && task.sessionId && cloudSandboxAddress(task.environmentId) === address) {
					await this._resolveTask(task.taskId, this._enabledCts.token);
					break;
				}
			}
		}
		const env = address ? this._environments.get(address) : undefined;
		const provider = address ? this._providerInstances.get(address) : undefined;
		if (!address || !env || !provider) {
			return false;
		}
		const token = this._providerStores.get(address)?.token ?? CancellationToken.Cancelled;
		const isCurrentActivation = () => {
			const current = !token.isCancellationRequested
				&& this._isEnabled()
				&& this._environments.has(address)
				&& this._providerInstances.get(address) === provider;
			if (!current) {
				this._logService.trace(`${LOG_PREFIX} Abandoning activation for ${address} after teardown.`);
			}
			return current;
		};

		if (env.taskId) {
			const activated = this._activateHistory(sessionType, address, env);
			if (activated) {
				void this._connectOnOpen(sessionType, address, env, token, isCurrentActivation).catch(error => {
					if (!isCancellationError(error)) {
						this._logService.warn(`${LOG_PREFIX} Background activation failed for ${address}`, error);
					}
				});
			}
			return activated && isCurrentActivation() && this._chatSessionsService.getContentProviderSchemes().includes(sessionType);
		}

		return this._connectOnOpen(sessionType, address, env, token, isCurrentActivation);
	}

	private async _connectOnOpen(sessionType: string, address: string, env: ICloudSandboxSessionEnvironment, token: CancellationToken, isCurrentActivation: () => boolean): Promise<boolean> {
		const shouldConnect = this.supportsBackgroundConnection
			? this._configurationService.getValue<boolean>(CloudSandboxAutoConnectOnOpenSettingId) === true
			: !env.taskId || this._pendingConnects.has(address) || await this._isEnvironmentOnline(env, token);
		if (!isCurrentActivation()) {
			return false;
		}
		if (!shouldConnect && !this._pendingConnects.has(address)) {
			this._logService.info(`${LOG_PREFIX} Not connecting automatically to ${address}; serving history and leaving the connect to the user.`);
			return !!env.taskId;
		}
		const connecting = this.connect({ environmentId: env.environmentId, sessionId: env.sessionId, name: env.name }).then(
			() => undefined,
			(error: unknown) => {
				this._logService.warn(`${LOG_PREFIX} connect-on-open failed for ${address}: ${error instanceof Error ? error.message : String(error)}`);
				return error ?? new Error('connect failed');
			},
		);
		const connectError = await connecting;
		if (!isCurrentActivation()) {
			return false;
		}
		if (connectError !== undefined) {
			return !!env.taskId;
		}
		if (env.taskId) {
			return true;
		}
		const authority = agentHostAuthority(address);
		while (isCurrentActivation()) {
			const connection = this._remoteAgentHostService.getConnection(address);
			if (!connection) {
				return false;
			}
			const rootState = connection.rootState.value;
			if (rootState instanceof Error) {
				return false;
			}
			if (rootState) {
				return rootState.agents.some(agent => remoteAgentHostSessionTypeId(authority, agent.provider) === sessionType);
			}
			const changed = Event.toPromise(connection.rootState.onDidChange);
			try {
				await raceCancellation(changed, token);
			} finally {
				changed.cancel();
			}
		}
		return false;
	}

	/** An unreadable record must not trigger an automatic resume in surfaces without background connection support. */
	private async _isEnvironmentOnline(env: ICloudSandboxSessionEnvironment, token: CancellationToken): Promise<boolean> {
		try {
			const record = await this._apiService.getEnvironment(env.environmentId, token);
			return record.status === 'online';
		} catch (error) {
			this._logService.trace(`${LOG_PREFIX} Could not read the state of ${env.environmentId}; treating it as not online: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
	}

	/** Registers one provider that can promote its recorded conversations in place. */
	private _activateHistory(sessionType: string, address: string, env: ICloudSandboxSessionEnvironment): boolean {
		if (this._historyHandlers.has(sessionType)) {
			return true;
		}
		// Registering a second content provider for a session type throws. This check and the
		// registration below are synchronous, so the connect cannot interleave between them.
		if (this._chatSessionsService.getContentProviderSchemes().includes(sessionType)) {
			this._logService.trace(`${LOG_PREFIX} ${sessionType} already has a content provider; leaving it to serve the session.`);
			return true;
		}
		if (!env.taskId) {
			this._logService.warn(`${LOG_PREFIX} No task id for ${address}; cannot serve history read-only.`);
			return false;
		}
		const store = new DisposableStore();
		const handler = store.add(this._instantiationService.createInstance(CloudSandboxSessionHandler, {
			taskId: env.taskId,
			getTaskId: (resource: URI) => this._getTaskId(address, resource),
			getSessionId: (resource: URI) => resource.scheme === CLOUD_SANDBOX_TASK_SCHEME ? this._tasks.get(resource.path.slice(1))?.sessionId : AgentSession.id(resource),
			// The live handler registers `agentId === sessionType`; matching it keeps replayed
			// history attributed to the same participant.
			agentId: sessionType,
			connectionAuthority: agentHostAuthority(address),
			connectionStatus: this._providerInstances.get(address)!.connectionStatus,
		}));
		store.add(handler.onDidChangeChatInputCompletionTriggerCharacters(() => this._onDidChangeTaskCompletionTriggerCharacters.fire()));
		store.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, handler));
		this._historyHandlers.set(sessionType, { handler, dispose: () => store.dispose() });
		this._logService.info(`${LOG_PREFIX} Serving ${sessionType} from Mission Control history.`);
		return true;
	}

	private _registerLiveSessionProvider(sessionType: string, provider: IChatSessionContentProvider): IDisposable | undefined {
		const entry = this._historyHandlers.get(sessionType);
		if (!entry) {
			return undefined;
		}
		entry.handler.setLiveProvider(provider);
		return toDisposable(() => {
			if (this._historyHandlers.get(sessionType) === entry) {
				entry.handler.clearLiveProvider();
			}
		});
	}

	private _clearSessionHandlers(address: string): void {
		const authority = agentHostAuthority(address);
		let removed = false;
		for (const sessionType of [...this._historyHandlers.keys()]) {
			if (findRemoteAgentHostSessionTypeAuthority(sessionType, [authority]) === authority) {
				this._historyHandlers.deleteAndDispose(sessionType);
				removed = true;
			}
		}
		if (removed) {
			this._onDidChangeTaskCompletionTriggerCharacters.fire();
		}
	}

	/** Reconnect using a surviving session rather than the provider's original discovery seed. */
	protected _connectEnvironment(environmentId: string): Promise<string> {
		const env = this._environments.get(cloudSandboxAddress(environmentId));
		if (!env) {
			throw new Error(localize('cloudSandbox.environmentNotFound', "The sandbox environment is no longer available."));
		}
		return this.connect({ environmentId, sessionId: env.sessionId, name: env.name });
	}

	/** Establish or reuse the environment connection, returning its display address. */
	async connect(options: ICloudSandboxConnectOptions): Promise<string> {
		if (!this._isEnabled()) {
			throw new Error('Copilot cloud sandbox connections are not enabled.');
		}
		const address = cloudSandboxAddress(options.environmentId);
		this._ensureProvider({ environmentId: options.environmentId, sessionId: options.sessionId, name: options.name });
		const environment = this._environments.get(address);
		if (environment?.taskId) {
			this._activateHistory(remoteAgentHostSessionTypeId(agentHostAuthority(address), CLOUD_SANDBOX_AGENT_PROVIDER), address, environment);
		}

		const pending = this._pendingConnects.get(address);
		if (pending) {
			return pending.promise;
		}
		const source = new CancellationTokenSource(this._enabledCts.token);
		const token = source.token;
		const attempt = (async () => {
			if (!this._remoteAgentHostService.getConnection(address)) {
				this._providerInstances.get(address)?.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
			}
			const result = await raceCancellationError(this._cloudSandboxService.connect(options, token), token);
			if (token.isCancellationRequested || !this._isEnabled()) {
				throw new CancellationError();
			}
			this._wireConnections();
			this._updateConnectionStatuses();
			for (const [sessionType, entry] of this._historyHandlers) {
				if (this._findAddressForSessionType(sessionType) === address) {
					entry.handler.retryLiveSessions();
				}
			}
			return result;
		})();
		this._pendingConnects.set(address, { source, promise: attempt });
		try {
			return await attempt;
		} catch (error) {
			if (this._pendingConnects.get(address)?.source === source) {
				// Credential acquisition can fail before a connection status event exists.
				this._settleFailedConnect(address);
			}
			throw error;
		} finally {
			if (this._pendingConnects.get(address)?.source === source) {
				this._pendingConnects.delete(address);
			}
			source.dispose();
		}
	}

	/**
	 * Return a provider to a state the user can act on after its connect failed. Defers to the
	 * service when it has something live to report, so a failure that raced a successful dial does
	 * not overwrite a good status, and leaves `incompatible` alone since redialing cannot fix it.
	 */
	private _settleFailedConnect(address: string): void {
		const provider = this._providerInstances.get(address);
		if (!provider) {
			return;
		}
		const connectionInfo = this._remoteAgentHostService.connections.find(c => c.address === address);
		if (connectionInfo) {
			provider.setConnectionStatus(connectionInfo.status);
		} else if (!RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
			provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
		}
	}

	protected _isEnabled(): boolean {
		return !this._store.isDisposed && isCloudSandboxEnabled(this._configurationService) && !this._chatEntitlementService.sentiment.hidden;
	}

	/**
	 * Create a Mission Control task for a brand-new sandbox, seed its session on the provider and
	 * connect to the environment. Provisioning runs the same `_ensureProvider → seed → connect`
	 * path discovery does, so a later discovery pass reconciles the task rather than duplicating it.
	 *
	 * The seeded session stays withheld on providers that support it until the caller publishes
	 * it (or this method fails, in which case the remote task is published so it is not lost).
	 */
	protected async _provisionSandbox(request: ICloudSandboxCreateSessionRequest, token: CancellationToken, progress?: IProgress<string>, draftResource?: URI): Promise<ICloudSandboxProvisionedEnvironment<T>> {
		if (!this._isEnabled()) {
			throw new Error('Copilot cloud sandbox connections are not enabled.');
		}
		let created: ICloudSandboxCreatedSession;
		let taskCreationPath: CloudSandboxTaskCreationPath;
		let reservationWaitMs: number;
		let reused: boolean;
		let enabledToken: CancellationToken;
		let provisioningStartedAt: number;
		let phase: 'preparation' | 'creation' = 'preparation';
		try {
			const accountKey = await this._apiService.getAccountKey();
			if (!this._isEnabled() || token.isCancellationRequested) {
				throw new CancellationError();
			}
			if (!accountKey) {
				throw new CloudSandboxAuthenticationRequiredError();
			}
			this._restoreAccount(accountKey);
			enabledToken = this._enabledCts.token;
			progress?.report(localize('sandbox.provisioningContainer', "Setting up cloud container"));
			provisioningStartedAt = Date.now();
			phase = 'creation';
			({ created, taskCreationPath, reservationWaitMs, reused } = await this._createTaskForDraft(request, draftResource, accountKey, token));
		} catch (error) {
			if (isCancellationError(error) || token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._logService.error(`${LOG_PREFIX} Cloud session ${phase} failed.`, error);
			throw this._instantiationService.createInstance(CloudSandboxStartupError, error, phase);
		}
		this._logService.info(`${LOG_PREFIX} event=${reused ? 'taskReused' : 'taskSubmitted'} taskCreationPath=${taskCreationPath} taskId=${JSON.stringify(created.taskId)} environmentId=${JSON.stringify(created.environmentId)} reservationWaitMs=${reservationWaitMs} durationMs=${Math.max(0, Date.now() - provisioningStartedAt)}`);
		const name = request.repoNwo ?? created.taskId;
		const title = newSessionTitle(request.prompt, name);
		const address = cloudSandboxAddress(created.environmentId);
		if (!this._isEnabled() || token.isCancellationRequested || enabledToken.isCancellationRequested) {
			throw new CancellationError();
		}
		this._provisioning.add(address);
		let seededProvider: T | undefined;
		let connectionAttempt: Promise<string> | undefined;
		try {
			const now = Date.now();
			const task = { ...created, name: title, repoName: request.repoNwo, hasRepository: request.repoNwo !== undefined, updatedAt: new Date(now).toISOString() };
			this._storeTask(task);
			this._ensureProvider(task);
			const provider = this._providerInstances.get(address);
			if (!provider) {
				throw new Error(`No sessions provider was registered for sandbox environment ${created.environmentId}`);
			}
			if (!reused || provider.getSessionModifiedTime(created.sessionId) === undefined) {
				const project = discoveredSessionProject(request.repoNwo);
				provider.seedProvisionalSession?.({
					session: AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, created.sessionId),
					provider: CLOUD_SANDBOX_AGENT_PROVIDER,
					_meta: withSessionWorkspaceless(undefined, request.repoNwo === undefined),
					startTime: now,
					modifiedTime: now,
					summary: title,
					...(project ? { project } : {}),
				});
			}
			seededProvider = provider;
			this._persistInventory();
			progress?.report(localize('sandbox.connectingContainer', "Connecting to cloud container"));
			connectionAttempt = this.connect({
				environmentId: created.environmentId, sessionId: created.sessionId, name, taskCreationPath, reservationWaitMs,
				connectionSource: reused ? 'existing' : 'created',
				provisioningStartedAt: reused ? undefined : provisioningStartedAt,
			});
			await raceCancellationError(connectionAttempt, token);
			if (token.isCancellationRequested || !this._isEnabled() || this._providerInstances.get(address) !== provider) {
				throw new CancellationError();
			}
			return { ...created, address, name, title, repoNwo: request.repoNwo, provider };
		} catch (error) {
			// The remote task exists even if connecting or publishing it failed.
			if (seededProvider && this._providerInstances.get(address) === seededProvider) {
				seededProvider.publishWithheldSession?.(created.sessionId);
			}
			if (isCancellationError(error) || token.isCancellationRequested) {
				throw new CancellationError();
			}
			throw this._instantiationService.createInstance(CloudSandboxStartupError, error, 'connection');
		} finally {
			const releaseProvisioning = () => { this._provisioning.delete(address); };
			if (connectionAttempt) {
				// A canceled caller must not let discovery tear down a connection that is still waking.
				void connectionAttempt.then(releaseProvisioning, releaseProvisioning);
			} else {
				releaseProvisioning();
			}
		}
	}

	private async _createTaskForDraft(request: ICloudSandboxCreateSessionRequest, draftResource: URI | undefined, accountKey: string, token: CancellationToken): Promise<{ readonly created: ICloudSandboxCreatedSession; readonly taskCreationPath: CloudSandboxTaskCreationPath; readonly reservationWaitMs: number; readonly reused: boolean }> {
		if (!draftResource) {
			const created = await this._apiService.createSession(request, token);
			return { created, taskCreationPath: getCloudSandboxTaskCreationPath(request, created), reservationWaitMs: 0, reused: false };
		}
		const store = new DisposableStore();
		const source = store.add(new CancellationTokenSource(token));
		store.add(this._enabledCts.token.onCancellationRequested(() => source.cancel()));
		let prepared: ICloudSandboxPreparedReservation | undefined;
		let reservationWaitMs = 0;
		let taskRequestStarted = false;
		try {
			if (request.expectedAccountKey !== undefined && request.expectedAccountKey !== accountKey) {
				throw new CancellationError();
			}
			const submitted = this._draftPreparationService.getSubmittedDraft(draftResource);
			if (submitted) {
				if (source.token.isCancellationRequested || submitted.reservation.expectedAccountKey !== accountKey) {
					throw new CancellationError();
				}
				if (request.environmentId !== undefined
					|| (request.reservedTaskId !== undefined && request.reservedTaskId.trim() !== submitted.reservation.taskId)
					|| !equalsIgnoreCase(request.repoNwo ?? '', submitted.repoNwo ?? '')) {
					throw new CloudSandboxRequestError(undefined, localize('cloudSandbox.submittedDraftChanged', "This draft already started a cloud session with different settings. Open that session or start a new chat."), undefined, { code: 'invalid_request' });
				}
				if (this._deletedTaskIds.has(submitted.created.taskId)) {
					throw new CloudSandboxRequestError(404, localize('cloudSandbox.submittedTaskDeleted', "The cloud task created for this draft has been deleted. Start a new chat."), undefined, { code: 'task_not_found' });
				}
				return {
					created: submitted.created,
					taskCreationPath: getCloudSandboxTaskCreationPath({ ...request, reservedTaskId: submitted.reservation.taskId }, submitted.created),
					reservationWaitMs: 0,
					reused: true,
				};
			}
			if (request.environmentId === undefined) {
				const startedAt = Date.now();
				prepared = await this._draftPreparationService.take(draftResource, source.token);
				reservationWaitMs = Math.max(0, Date.now() - startedAt);
				if (request.reservedTaskId !== undefined && request.reservedTaskId.trim() !== prepared?.taskId) {
					throw new CancellationError();
				}
			} else {
				void this._draftPreparationService.discard(draftResource);
			}
			if (source.token.isCancellationRequested || !this._isEnabled() || (prepared && prepared.expectedAccountKey !== accountKey)) {
				throw new CancellationError();
			}
			const taskRequest = {
				...request,
				expectedAccountKey: request.expectedAccountKey ?? accountKey,
				...(prepared ? { reservedTaskId: prepared.taskId } : {}),
			};
			const created = await this._apiService.createSession(taskRequest, source.token, () => {
				taskRequestStarted = true;
			});
			if (prepared) {
				this._draftPreparationService.markSubmitted(prepared, created, request.repoNwo);
			}
			// A fallback may mean another Send claimed the reservation; do not release it here.
			return { created, taskCreationPath: getCloudSandboxTaskCreationPath(taskRequest, created), reservationWaitMs, reused: false };
		} catch (error) {
			if (prepared && !taskRequestStarted) {
				try {
					await this._draftPreparationService.release(prepared);
				} catch (cleanupError) {
					this._logService.warn(`${LOG_PREFIX} Could not release task reservation ${prepared.taskId} before submission.`, cleanupError);
				}
			} else if (prepared) {
				this._logService.warn(`${LOG_PREFIX} Retaining task reservation ${prepared.taskId} after a failed submission; its outcome must be reconciled.`);
			}
			throw error;
		} finally {
			store.dispose();
		}
	}

	/**
	 * Observe repository setup on a freshly provisioned environment. The returned store disposes
	 * itself once the repository is ready or its clone failed.
	 */
	trackSessionCreationProgress(environmentId: string, repoNwo: string, progress: IProgress<string>): IDisposable {
		const store = new DisposableStore();
		const connection = this._remoteAgentHostService.getConnection(cloudSandboxAddress(environmentId));
		if (!connection) {
			return store;
		}
		let cloningProjectId: string | undefined;
		const update = () => {
			const state = connection.rootState.value;
			if (!state || state instanceof Error) {
				return;
			}
			const projects = readCloudSandboxProjects(state)?.filter(project => {
				const remote = project.remoteUrl && getGitHubRepositoryFromRemoteUrl(project.remoteUrl, ['github.com']);
				return remote && equalsIgnoreCase(`${remote.owner}/${remote.repo}`, repoNwo);
			});
			const project = projects?.find(project => project.status === 'ready') ?? projects?.find(project => project.status === 'cloning') ?? projects?.[0];
			if (project?.status === 'cloning') {
				cloningProjectId = project.id;
				progress.report(project.progress === undefined
					? localize('sandbox.cloningRepository', "Cloning repository")
					: localize('sandbox.cloningRepositoryProgress', "Cloning repository ({0}%)", Math.round(project.progress)));
			} else if (project?.status === 'ready') {
				progress.report(localize('sandbox.startingAgent', "Starting Copilot agent"));
				store.dispose();
			} else if (project?.status === 'failed' && project.id === cloningProjectId) {
				progress.report(localize('sandbox.cloningFailed', "Repository cloning failed"));
				store.dispose();
			}
		};
		store.add(connection.rootState.onDidChange(update));
		update();
		return store;
	}

	private _updateEnablement(): void {
		this._updateArchiveRegistration();
		this._updateRegistration();
		if (!this._isEnabled()) {
			this._teardownAll();
		}
	}

	private _updateArchiveRegistration(): void {
		if (!this._isEnabled()) {
			this._archiveRegistration.clear();
		} else if (!this._archiveRegistration.value) {
			this._archiveRegistration.value = this._chatSessionsService.registerChatSessionItemArchiveProvider({
				state: this._archiveState,
				setRequested: requested => {
					this._archivesRequested = requested;
					if (requested && (!this._archivesLoaded || this._archiveState.get() === 'error')) {
						void this._discoverAndSeed();
					}
				},
			});
		}
	}

	protected abstract _updateRegistration(): void;

	/** Allows the window's adapter to publish a coherent provider inventory. */
	protected _batchProviderChanges<R>(fn: () => R): R {
		return fn();
	}

	override dispose(): void {
		this._batchProviderChanges(() => super.dispose());
	}

	/** Create the sessions provider for an environment if it doesn't exist yet. */
	protected _ensureProvider(env: ICloudSandboxSessionEnvironment): void {
		if (env.taskId) {
			this._storeTask({ ...this._tasks.get(env.taskId), ...env, taskId: env.taskId });
		}
		const address = cloudSandboxAddress(env.environmentId);
		const hadEnvironments = this._environments.size > 0;
		// `connect()` reaches here with only the fields its caller had, so preserve anything
		// discovery already resolved — notably the task id that makes history readable offline.
		const known = (env.sessionId ? this._sessionEnvironments.get(address)?.get(env.sessionId) : undefined) ?? this._environments.get(address);
		const current = {
			...known, ...env,
			taskId: env.taskId ?? (!env.sessionId || env.sessionId === known?.sessionId ? known?.taskId : undefined),
			eventType: env.eventType ?? known?.eventType,
			application: env.application ?? (!env.sessionId || env.sessionId === known?.sessionId ? known?.application : undefined),
			repoName: env.repoName ?? known?.repoName,
			hasRepository: env.hasRepository ?? known?.hasRepository,
			updatedAt: env.updatedAt ?? known?.updatedAt,
		};
		// A stale reconnect must not displace a surviving task's recorded-history route.
		if (current.taskId || !this._environments.get(address)?.taskId) {
			this._environments.set(address, current);
		}
		if (!hadEnvironments && this._environments.size > 0) {
			this._rearmDiscoveryPoll();
		}
		if (current.sessionId && current.taskId) {
			let sessions = this._sessionEnvironments.get(address);
			if (!sessions) {
				sessions = new Map();
				this._sessionEnvironments.set(address, sessions);
			}
			sessions.set(current.sessionId, current);
		}
		if (this._providerStores.has(address)) {
			return;
		}
		let sessions = this._sessionEnvironments.get(address);
		if (!sessions) {
			sessions = new Map();
			this._sessionEnvironments.set(address, sessions);
		}
		for (const task of this._environmentTasks(env.environmentId)) {
			sessions.set(task.sessionId, task);
		}
		const store = new DisposableStore();
		const token = cancelOnDispose(store);
		this._providerStores.set(address, { token, dispose: () => store.dispose() });
		store.add(this._workspaceTrustManagementService.registerTrustedAuthority(AGENT_HOST_SCHEME, agentHostAuthority(address)));
		const provider = this._createProvider(env, store);
		this._providerInstances.set(address, provider);
		store.add(toDisposable(() => this._providerInstances.delete(address)));
		this._logService.info(`${LOG_PREFIX} Registered sessions provider for ${address}`);
	}

	protected abstract _createProvider(env: ICloudSandboxSessionEnvironment, store: DisposableStore): T;

	/** Wire each live connection to its provider so session enumeration runs. */
	private _wireConnections(): void {
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(
				c => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status),
			);
			if (connectionInfo) {
				const connection = this._remoteAgentHostService.getConnection(address);
				if (connection) {
					provider.setConnection(connection, connectionInfo.defaultDirectory);
				}
			}
		}
	}

	/** Push the service's authoritative connection status onto each provider. */
	private _updateConnectionStatuses(): void {
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(c => c.address === address);
			if (connectionInfo) {
				provider.setConnectionStatus(connectionInfo.status);
			} else if (this._pendingConnects.has(address)) {
				// A connect is in flight but has not reached `reconnect()` yet, so the service has
				// no entry to report: waking an environment can spend minutes minting credentials
				// beforehand. Any unrelated connection change would otherwise land here and reset
				// the wake to `disconnected`, flipping the chat to a failure it has not had.
				continue;
			} else if (!RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
				provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
			}
		}
	}
}
