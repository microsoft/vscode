/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Protocol client for communicating with an agent host process.

import { DeferredPromise, TimeoutTimer } from '../../../base/common/async.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, IReference } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from '../../files/common/files.js';
import { ConfigurationTarget, ConfigurationTargetToString, IConfigurationService } from '../../configuration/common/configuration.js';
import { AgentSession, IAgentCreateChatRequestOptions, IAgentCreateSessionConfig, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, AuthenticateParams, AuthenticateResult, IMcpNotification } from '../common/agent.js';
import { AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES, AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES, IAgentConnection, IAgentHostManagedSettingsDiagnostics, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult, type AgentHostDebugLogsArtifactKind, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk } from '../common/agentService.js';
import { CollectAgentHostDebugLogsExtensionMethod, GetAgentHostSessionStateFileExtensionMethod, ReadAgentHostDebugLogsChunkExtensionMethod, supportsAgentHostChatStateFile, type IAgentHostExtensionCommandMap, type IAgentHostExtensionInitializeResult } from '../common/agentHostExtensionProtocol.js';
import { AMBIENT_AGENT_HOST_AUTHORITY } from '../common/agentHostConnectionsService.js';
import { createRemoteWatchHandle, type IRemoteWatchHandle } from '../common/agentHostFileSystemProvider.js';
import { AgentSubscriptionManager, type IActiveSubscriptionInfo, type IAgentSubscription } from '../common/state/agentSubscription.js';
import { agentHostAuthority, createAgentHostResourceUriMapper, fromAgentHostUri, identityAgentHostResourceUriMapper, type IAgentHostResourceUriMapper, toAgentHostUri } from '../common/agentHostUri.js';
import { AgentHostResourceIdentity, AgentHostResourcePermissionError, IAgentHostResourceService, LOCAL_AGENT_HOST_RESOURCE_IDENTITY } from '../common/agentHostResourceService.js';
import type { ClientNotificationMap, CommandMap, JsonRpcErrorResponse, JsonRpcRequest } from '../common/state/protocol/messages.js';
import { ActionType, type ActionEnvelope, type ChatAction, type ClientAnnotationsAction, type ClientAutomationAction, type ClientAutomationRunAction, type ClientChangesetAction, type INotification, type IRootConfigChangedAction, type SessionAction, type TerminalAction } from '../common/state/sessionActions.js';
import { MessageAttachmentKind, SessionSummary, ROOT_STATE_URI, StateComponents, isAhpRootChannel, isDefaultChatUri, type ClientPluginCustomization, type Message, type RootState } from '../common/state/sessionState.js';
import { normalizeLegacyActionEnvelope } from '../common/state/legacyProtocolCompatibility.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '../common/state/protocol/version/registry.js';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, ProtocolError, ReconnectResultType, type ProtocolMessage, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { type IVscodeUpgradeResult } from '../common/state/protocolUpgrade.js';
import { isClientTransport, NonReconnectableTransportError, type IProtocolTransport } from '../common/state/sessionTransport.js';
import { AhpErrorCodes, JsonRpcErrorCodes } from '../common/state/protocol/errors.js';
import { ChatSourceKind, ContentEncoding, ResourceRequestParams, type CompletionsParams, type CompletionsResult, type CreateTerminalParams, type ResolveSessionConfigResult, type SessionConfigCompletionsResult } from '../common/state/protocol/commands.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { decodeBase64, encodeBase64 } from '../../../base/common/buffer.js';
import type { FetchAutomationRunsParams, FetchAutomationRunsResult, ListAutomationTriggerDefinitionsParams, ListAutomationTriggerDefinitionsResult, RunAutomationParams, RunAutomationResult } from '../common/state/protocol/channels-automation/commands.js';
import { ILoadEstimator, LoadEstimator } from '../../../base/parts/ipc/common/ipc.net.js';
import { ITelemetryService, TelemetryLevel, TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from '../../telemetry/common/telemetry.js';
import { getTelemetryLevel } from '../../telemetry/common/telemetryUtils.js';
import { AgentHostAutoApprovePolicyRestrictedConfigKey, AgentHostTelemetryLevelConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, AgentHostDisableRepoInfoTelemetryConfigKey, getAgentHostTerminalAutoApproveRulesConfig, GLOBAL_AUTO_APPROVE_SETTING_ID, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, TERMINAL_AUTO_APPROVE_SETTING_ID, TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID, DISABLE_REPO_INFO_TELEMETRY_SETTING_ID, telemetryLevelToAgentHostConfigValue } from '../common/agentHostSchema.js';
import { formatAgentHostConfigurationSyncValueForLog, getAgentHostConfigurationSyncEntries, getAgentHostConfigurationSyncTarget, resolveAgentHostConfigurationSyncPatch, resolveAgentHostConfigurationSyncValue } from '../common/agentHostConfigurationSync.js';
import { managedPermissionsConfigurationIds, resolveManagedSettingsPermissions, type IAgentHostManagedSettingsPermissions } from '../common/agentHostManagedSettings.js';
import { AgentHostClientConnectionKind, toAgentHostClientMeta } from '../common/agentHostTelemetry.js';
import type { OtlpExportLogsParams } from '../common/state/protocol/channels-otlp/notifications.js';
import type { TelemetryCapabilities } from '../common/state/protocol/channels-otlp/state.js';
import type { Implementation, InitializeResult } from '../common/state/protocol/common/commands.js';
import { observableValue, type IObservable } from '../../../base/common/observable.js';
import { isFileResourceRead } from '../common/resourceReadLogging.js';
import { ResourceSet } from '../../../base/common/map.js';
import { computeReconnectDelay, DEFAULT_RECONNECT_POLICY, hasExhaustedReconnectAttempts, type IRemoteAgentHostReconnectPolicy } from '../common/reconnectPolicy.js';
import type { IRemoteAgentHostProtocolClient } from '../common/remoteAgentHostService.js';

const AHP_CLIENT_CONNECTION_CLOSED = -32000;
// AHP 0.9 changed the automation catalog wire shape, so VS Code cannot safely negotiate 0.8.
const CLIENT_SUPPORTED_PROTOCOL_VERSIONS = SUPPORTED_PROTOCOL_VERSIONS.filter(version => version !== '0.8.0');

/**
 * After this much inbound silence, send an application-level `ping` to
 * the remote so we have something to time out on. Reset on every received
 * message — busy connections don't generate ping traffic.
 *
 * Mirrors {@link ProtocolConstants.KeepAliveSendTime} from the regular
 * remote extension host stack.
 */
const PING_INTERVAL_MS = 5_000;

/**
 * Total inbound silence (ping interval + this) before a non-local connection
 * is declared dead and force-closed so the renderer's reconnect logic kicks
 * in. Reset on every received message; the only way to reach this is for the
 * ping to itself go unanswered.
 *
 * Matches {@link ProtocolConstants.TimeoutTime} from the regular remote
 * extension host stack.
 */
const LIVENESS_TIMEOUT_MS = 20_000;

function connectionTimeoutError(address: string, silenceMs: number): ProtocolError {
	return new ProtocolError(
		AHP_CLIENT_CONNECTION_CLOSED,
		`Connection appears dead: ${address}; no message received for ${silenceMs}ms.`,
	);
}

function connectionClosedError(address: string): ProtocolError {
	return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Connection closed: ${address}`);
}

function connectionDisposedError(address: string): ProtocolError {
	return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Connection disposed: ${address}`);
}

function transportLostError(address: string): ProtocolError {
	return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Transport lost (reconnecting): ${address}`);
}

interface IRemoteAgentHostExtensionNotificationMap {
	'setClientManagedSettingsPermissions': { params: { permissions: IAgentHostManagedSettingsPermissions } };
}

interface IPendingRequest {
	readonly deferred: DeferredPromise<unknown>;
	readonly suppressNotFoundWarning: boolean;
	readonly sentAt: number;
}

/**
 * High-level connection state of an {@link AgentHostProtocolClient}.
 * Exposed via {@link AgentHostProtocolClient.onDidChangeConnectionState}
 * so consumers can surface transient reconnect activity in the UI.
 */
export const enum AgentHostClientState {
	/** Initial handshake in progress. */
	Connecting = 'connecting',
	/** The host rejected the initial protocol version; upgrade remains available. */
	Incompatible = 'incompatible',
	/** Transport is open and handshake/reconnect has completed. */
	Connected = 'connected',
	/** Transport closed unexpectedly; an automatic reconnect is in flight or scheduled. */
	Reconnecting = 'reconnecting',
	/** Client has been disposed or has given up reconnecting. Terminal state. */
	Closed = 'closed',
}

/**
 * Reconnect-only bookkeeping. Lives exclusively inside the `Reconnecting`
 * variant of {@link ClientState} so the fields can't be read or mutated when
 * they're not meaningful.
 */
interface IReconnectState {
	/**
	 * Resolves when the current attempt's handshake succeeds; rejected and
	 * replaced (via {@link _newReconnectGate}) on a failed attempt so awaiting
	 * callers see the failure while new callers gate on the next attempt.
	 */
	gate: DeferredPromise<void>;
	/**
	 * Wire messages buffered while the gate is engaged. Drained onto the new
	 * transport by {@link _drainAfterReconnect} once the handshake completes;
	 * survives across failed attempts so messages ride through retry cycles.
	 */
	readonly outbox: ProtocolMessage[];
	/** Number of reconnect attempts performed in this reconnect cycle. */
	attempt: number;
	/** Timer for the next scheduled attempt, if any. */
	timeoutHandle: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Internal connection state, discriminated by {@link AgentHostClientState}.
 * Mutually-exclusive fields (close error, reconnect bookkeeping) live inside
 * the variant where they're meaningful so callers can't accidentally read or
 * write them in the wrong state.
 */
type ClientState =
	| { readonly kind: AgentHostClientState.Connecting; readonly outbox: ProtocolMessage[] }
	| { readonly kind: AgentHostClientState.Incompatible; readonly error: ProtocolError }
	| { readonly kind: AgentHostClientState.Connected }
	| { readonly kind: AgentHostClientState.Reconnecting; readonly reconnect: IReconnectState }
	| { readonly kind: AgentHostClientState.Closed; readonly error: ProtocolError };

/** Optional configuration for an {@link AgentHostProtocolClient}. */
export interface IAgentHostProtocolClientOptions {
	/** Estimator used to suppress watchdog closes while the local event loop is saturated. Defaults to the shared instance. */
	readonly loadEstimator?: ILoadEstimator;
	/** Stable client identity. Generated when omitted. */
	readonly clientId?: string;
	/** Client implementation metadata advertised during the handshake. */
	readonly clientInfo?: Implementation;
	/** How a dropped transport is restored. Defaults to {@link DEFAULT_RECONNECT_POLICY}. */
	readonly reconnectPolicy?: IRemoteAgentHostReconnectPolicy;
}

/**
 * A protocol-level client for a single agent host connection.
 * Manages the transport, handshake, subscriptions, action dispatch,
 * and command/response correlation.
 *
 * Implements {@link IAgentConnection} so consumers can program against
 * a single interface regardless of whether the agent host is local or remote.
 */
export class AgentHostProtocolClient extends Disposable implements IAgentConnection, IRemoteAgentHostProtocolClient {

	declare readonly _serviceBrand: undefined;

	private readonly _clientId: string;
	private readonly _address: string;
	private readonly _resourceIdentity: AgentHostResourceIdentity;
	private readonly _transportFactory: (() => IProtocolTransport) | undefined;
	private _transport!: IProtocolTransport;
	/** Disposable holding the listeners attached to the current transport. */
	private readonly _transportListeners = this._register(new MutableDisposable<DisposableStore>());
	private readonly _connectionAuthority: string;
	readonly resourceUris: IAgentHostResourceUriMapper;
	private _serverSeq = 0;
	private _nextClientSeq = 1;
	private _defaultDirectory: string | undefined;
	/**
	 * Latest `initialize` response from the host. Captured at the end of
	 * {@link connect} and re-captured after a soft-reconnect that pulled
	 * a fresh snapshot. `undefined` before the handshake completes.
	 */
	private readonly _initializeResult = observableValue<IAgentHostExtensionInitializeResult | undefined>('agentHostInitializeResult', undefined);
	private readonly _subscriptionManager: AgentSubscriptionManager;

	private readonly _onDidAction = this._register(new Emitter<ActionEnvelope>());
	readonly onDidAction = this._onDidAction.event;

	private readonly _onDidNotification = this._register(new Emitter<INotification>());
	readonly onDidNotification = this._onDidNotification.event;

	private readonly _onMcpNotification = this._register(new Emitter<IMcpNotification>());
	readonly onMcpNotification = this._onMcpNotification.event;

	/**
	 * Fires for every `otlp/exportLogs` notification the host sends on a
	 * channel this client has subscribed to. Each payload is an
	 * OTLP/JSON `ExportLogsServiceRequest` value verbatim; consumers
	 * decode it (see `iterateOtlpLogRecords`) and route the records to a
	 * registered logger or sink.
	 *
	 * Channel URIs are kept opaque on the wire so the same event covers
	 * every {@link TelemetryCapabilities.logs} URI the host advertises —
	 * subscribers should filter by `channel` if they care.
	 */
	private readonly _onDidReceiveOtlpLogs = this._register(new Emitter<OtlpExportLogsParams>());
	readonly onDidReceiveOtlpLogs = this._onDidReceiveOtlpLogs.event;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	private readonly _onDidFatalClose = this._register(new Emitter<ProtocolError>());
	readonly onDidFatalClose = this._onDidFatalClose.event;

	private readonly _onDidChangeConnectionState = this._register(new Emitter<AgentHostClientState>());
	readonly onDidChangeConnectionState = this._onDidChangeConnectionState.event;

	/**
	 * Discriminated state union. Read via narrowing (`_state.kind === ...`);
	 * reconnect-only fields like the gate/outbox/attempt counter are only
	 * accessible while {@link _state.kind} is {@link AgentHostClientState.Reconnecting},
	 * and protocol errors are only accessible while the state is
	 * {@link AgentHostClientState.Incompatible} or {@link AgentHostClientState.Closed}.
	 */
	private _state: ClientState = { kind: AgentHostClientState.Connecting, outbox: [] };

	/** Pending JSON-RPC requests keyed by request id. */
	private readonly _pendingRequests = new Map<number, IPendingRequest>();
	private readonly _authentication = new Map<string, AuthenticateParams>();
	private _nextRequestId = 1;

	/**
	 * Timestamp of the most recent message of any kind received from the
	 * server. Used only for diagnostic logging when the close timer fires.
	 */
	private _lastReadTime = Date.now();

	/**
	 * Liveness watchdog — see {@link _resetLivenessTimers}.
	 *
	 * {@link _pingTimer} fires after {@link PING_INTERVAL_MS} of inbound
	 * silence and sends an application-level `ping` so we have something
	 * to time out on. {@link _closeTimer} fires after another
	 * {@link LIVENESS_TIMEOUT_MS} of continued silence and force-closes
	 * the transport so the renderer's reconnect logic kicks in. Both are
	 * reset on every received message, so busy connections generate no
	 * ping traffic at all.
	 *
	 * Detects silently-dead transports (e.g. SSH/tunnel after laptop
	 * sleep + network change) that don't produce a socket close event of
	 * their own.
	 */
	private readonly _pingTimer = this._register(new TimeoutTimer());
	private readonly _closeTimer = this._register(new TimeoutTimer());

	/**
	 * Used to suppress watchdog-triggered closes when our own JS event loop
	 * has been pegged — in that case the silence is on our side, not the
	 * remote's, and tearing down the transport would just generate a useless
	 * reconnect cycle that aborts in-flight requests.
	 */
	private readonly _loadEstimator: ILoadEstimator;
	private readonly _clientInfo: Implementation | undefined;
	private readonly _reconnectPolicy: IRemoteAgentHostReconnectPolicy;

	/**
	 * URIs we have already granted implicit read access for on this connection.
	 * Uses URI-aware comparison to dedupe repeat sends and is cleared with the connection.
	 */
	private readonly _grantedImplicitReadUris = new ResourceSet();
	private readonly _implicitReadGrants = this._register(new DisposableStore());

	get clientId(): string {
		return this._clientId;
	}

	get address(): string {
		return this._address;
	}

	get defaultDirectory(): string | undefined {
		return this._defaultDirectory;
	}

	get connectionState(): AgentHostClientState {
		return this._state.kind;
	}

	/**
	 * The latest `initialize` response from the host, or `undefined` if
	 * the handshake has not completed yet. Exposed observably so callers can
	 * react as advertised capabilities (telemetry, `completionTriggerCharacters`,
	 * `terminalCommandPrefix`, ...) arrive.
	 */
	get initializeResult(): IObservable<InitializeResult | undefined> {
		return this._initializeResult;
	}

	constructor(
		identity: AgentHostResourceIdentity,
		transportOrFactory: IProtocolTransport | (() => IProtocolTransport),
		options: IAgentHostProtocolClientOptions | undefined,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostResourceService private readonly _resourceService: IAgentHostResourceService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._resourceIdentity = identity;
		this._address = identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY ? AMBIENT_AGENT_HOST_AUTHORITY : identity;
		this._clientId = options?.clientId ?? generateUuid();
		this._connectionAuthority = identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY ? AMBIENT_AGENT_HOST_AUTHORITY : agentHostAuthority(identity);
		this.resourceUris = identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY
			? identityAgentHostResourceUriMapper
			: createAgentHostResourceUriMapper(this._connectionAuthority);
		this._loadEstimator = options?.loadEstimator ?? LoadEstimator.getInstance();
		this._clientInfo = options?.clientInfo;
		this._reconnectPolicy = options?.reconnectPolicy ?? DEFAULT_RECONNECT_POLICY;

		if (typeof transportOrFactory === 'function') {
			this._transportFactory = transportOrFactory;
			this._installTransport(transportOrFactory());
		} else {
			this._transportFactory = undefined;
			this._installTransport(transportOrFactory);
		}

		this._subscriptionManager = this._register(new AgentSubscriptionManager(
			this._clientId,
			() => this.nextClientSeq(),
			msg => this._logService.warn(`[AgentHostProtocolClient] ${msg}`),
			resource => this.subscribe(resource),
			resource => this.unsubscribe(resource),
		));

		// Forward action envelopes from the transport to the subscription manager
		this._register(this.onDidAction(envelope => {
			this._subscriptionManager.receiveEnvelope(envelope);
		}));

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (this._state.kind !== AgentHostClientState.Connected) {
				return;
			}
			const patch: Record<string, unknown> = {};
			// These keys are host-level and last-writer-wins across windows.
			const mirrored: string[] = [];
			// Mirrored values exclude workspace, folder, and memory layers, so changes from those layers cannot affect them.
			if (e.source !== ConfigurationTarget.WORKSPACE && e.source !== ConfigurationTarget.WORKSPACE_FOLDER && e.source !== ConfigurationTarget.MEMORY) {
				for (const entry of getAgentHostConfigurationSyncEntries(getAgentHostConfigurationSyncTarget(this._resourceIdentity))) {
					if (!e.affectsConfiguration(entry.settingId)) {
						continue;
					}
					const value = resolveAgentHostConfigurationSyncValue(this._configurationService, entry);
					if (value !== undefined) {
						patch[entry.sync.key] = value;
						mirrored.push(`${entry.sync.key}=${formatAgentHostConfigurationSyncValueForLog(entry.settingId, value)} (${entry.settingId})`);
					}
				}
			}
			if (Object.keys(patch).length) {
				this._logService.info(`[RemoteAgentHostProtocol] Mirroring configuration to host root config from ${ConfigurationTargetToString(e.source)}: ${mirrored.join(', ')}`);
				this._dispatchRootConfig(patch);
			}
			if (e.affectsConfiguration(GLOBAL_AUTO_APPROVE_SETTING_ID)) {
				this._updateAutoApprovePolicyRestriction();
			}
			if (e.affectsConfiguration(TELEMETRY_SETTING_ID) || e.affectsConfiguration(TELEMETRY_OLD_SETTING_ID) || e.affectsConfiguration(TELEMETRY_CRASH_REPORTER_SETTING_ID)) {
				this._updateTelemetryLevel();
			}
			if (e.affectsConfiguration(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID)) {
				this._updateTerminalAutoApproveEnabled();
			}
			if (e.affectsConfiguration(TERMINAL_AUTO_APPROVE_SETTING_ID) || e.affectsConfiguration(TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID)) {
				this._updateTerminalAutoApproveRules();
			}
			if (e.affectsConfiguration(DISABLE_REPO_INFO_TELEMETRY_SETTING_ID)) {
				this._updateDisableRepoInfoTelemetry();
			}
			if (managedPermissionsConfigurationIds.some(settingId => e.affectsConfiguration(settingId))) {
				void this._updateManagedSettingsPermissions();
			}
		}));

		if (!isClientTransport(this._transport)) {
			// Passive transports are already connected when constructed.
			this._resetLivenessTimers();
		}
	}

	/**
	 * Install a transport and wire listeners. Used both for the initial
	 * transport and for replacements created by the factory during a
	 * transport-level reconnect.
	 */
	private _installTransport(transport: IProtocolTransport): void {
		const listeners = new DisposableStore();
		listeners.add(transport);
		listeners.add(transport.onMessage(msg => this._handleMessage(msg)));
		listeners.add(transport.onClose(() => this._handleTransportClose()));
		this._transport = transport;
		this._transportListeners.value = listeners;
	}

	/**
	 * Transition to a new {@link ClientState}. Fires {@link onDidChangeConnectionState}
	 * only when the variant kind actually changes; in-place mutation of
	 * reconnect-state fields (e.g. swapping the gate on a failed retry) does
	 * NOT count as a transition and produces no event.
	 */
	private _transitionTo(next: ClientState): void {
		if (this._state.kind === next.kind) {
			return;
		}
		this._state = next;
		this._onDidChangeConnectionState.fire(next.kind);
	}

	private _newReconnectGate(): DeferredPromise<void> {
		const deferred = new DeferredPromise<void>();
		// Always-attached handler so a rejection without an awaiter (e.g. a
		// retry-fail during the reconnect RPC bypass window) doesn't get
		// flagged as unhandled. Actual consumers attach their own `.then`/`await`.
		deferred.p.then(undefined, () => { /* swallow — each real consumer handles its own await */ });
		return deferred;
	}

	private _newReconnectState(): IReconnectState {
		return { gate: this._newReconnectGate(), outbox: [], attempt: 0, timeoutHandle: undefined };
	}

	override dispose(): void {
		this._handleClose(connectionDisposedError(this._address));
		super.dispose();
	}

	/**
	 * Connect to the remote agent host and perform the protocol handshake.
	 */
	async connect(): Promise<void> {
		try {
			if (isClientTransport(this._transport)) {
				await this._raceClose(this._transport.connect());
			}
			if (this._state.kind !== AgentHostClientState.Connecting) {
				throw transportLostError(this._address);
			}

			const result = await this._dispatchRequest<IAgentHostExtensionInitializeResult>('initialize', {
				channel: ROOT_STATE_URI,
				// Advertise every compatible version, most-preferred first, so an
				// older host (a cloud sandbox running a 0.5.x `copilotd`) can negotiate down
				// instead of rejecting the connection. A current host still picks the newest.
				protocolVersions: [...CLIENT_SUPPORTED_PROTOCOL_VERSIONS],
				clientId: this._clientId,
				clientInfo: this._clientInfo,
				_meta: this._clientMeta(),
				initialSubscriptions: [ROOT_STATE_URI],
			}, { bypassInitializeQueue: true });
			this._applyInitializeResult(result);

			// Hydrate root state from the initial snapshot
			for (const snapshot of result.snapshots ?? []) {
				if (isAhpRootChannel(snapshot.resource)) {
					this._subscriptionManager.handleRootSnapshot(snapshot.state as RootState, snapshot.fromSeq);
				}
			}

			if (isClientTransport(this._transport) && this._state.kind === AgentHostClientState.Connecting) {
				for (const message of this._state.outbox) {
					this._transport.send(message);
				}
				this._state.outbox.length = 0;
			}
			this._transitionTo({ kind: AgentHostClientState.Connected });
			this._resetLivenessTimers();
		} catch (error) {
			const protocolError = error instanceof ProtocolError
				? error
				: new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, error instanceof Error ? error.message : String(error));
			if (protocolError.code === AhpErrorCodes.UnsupportedProtocolVersion) {
				this._cancelLivenessTimers();
				if (this._state.kind === AgentHostClientState.Connecting) {
					this._state.outbox.length = 0;
				}
				this._rejectPendingRequests(protocolError);
				this._transitionTo({ kind: AgentHostClientState.Incompatible, error: protocolError });
				throw error;
			}
			if (error instanceof NonReconnectableTransportError) {
				this._handleFatalClose(protocolError);
				throw error;
			}
			if (this._state.kind === AgentHostClientState.Reconnecting) {
				throw error;
			}
			if (protocolError.code === AHP_CLIENT_CONNECTION_CLOSED && this._beginReconnectFromConnecting(protocolError)) {
				throw error;
			}
			this._handleClose(protocolError);
			throw error;
		}
	}

	/**
	 * Externally signal that the transport has closed. Used by services
	 * managing a passive transport (SSH / dev-tunnels) when they observe
	 * a connection-loss IPC event independent of the transport's own
	 * onClose — without this, a single dropped IPC delivery on the
	 * transport's close channel leaves the client stranded in
	 * `Connected` until its watchdog fires (which can take hours when
	 * the renderer is backgrounded and `setTimeout` is throttled).
	 *
	 * Idempotent — no-op if already closed or mid-reconnect.
	 */
	notifyTransportClosed(): void {
		this._handleTransportClose();
	}

	/**
	 * Called from the transport's `onClose` event. When a {@link _transportFactory}
	 * is configured we attempt to soft-reconnect rather than fire `onDidClose` —
	 * the protocol-level `reconnect` request lets the server replay missed
	 * actions and preserves the `clientId` so pending tool calls etc. are not
	 * cancelled by the host-side disconnect timeout. Without a factory
	 * (passive-transport SSH/relay path) we fall back to "close means closed"
	 * and let the service decide whether to spin up a fresh client.
	 */
	private _handleTransportClose(): void {
		switch (this._state.kind) {
			case AgentHostClientState.Closed:
				return;
			case AgentHostClientState.Connecting:
				if (!this._beginReconnectFromConnecting(connectionClosedError(this._address))) {
					this._handleClose(connectionClosedError(this._address));
				}
				return;
			case AgentHostClientState.Incompatible:
				this._handleClose(connectionClosedError(this._address));
				return;
			case AgentHostClientState.Connected: {
				if (!this._transportFactory) {
					// Passive-transport path (SSH/tunnel): the transport
					// can't be reconstructed from here, so we surface the
					// close and let the service decide whether to spin up
					// a fresh client.
					this._handleClose(connectionClosedError(this._address));
					return;
				}
				if (!this._reconnectPolicy.autoRestore) {
					const error = connectionClosedError(this._address);
					this._logService.info(`[RemoteAgentHostProtocol] Transport lost for ${this._address}; automatic reconnect is disabled.`);
					this._handleFatalClose(error);
					return;
				}
				this._logService.info(`[RemoteAgentHostProtocol] Transport lost for ${this._address}; scheduling reconnect.`);
				this._transitionTo({ kind: AgentHostClientState.Reconnecting, reconnect: this._newReconnectState() });
				this._cancelLivenessTimers();
				// In-flight requests can't be answered — the new transport has a
				// separate request-id space. Reject them so callers can retry.
				this._rejectPendingRequests(transportLostError(this._address));
				this._scheduleReconnect();
				return;
			}
			case AgentHostClientState.Reconnecting:
				// A second transport drop while a reconnect was already in flight.
				// Reject the in-flight `reconnect` RPC so `_attemptReconnect`'s
				// catch path runs and schedules the next attempt — returning early
				// would leave the await pending forever (#agent-host-deadlock).
				// Scheduling lives in the catch so we don't end up with two
				// concurrent setTimeouts racing to install new transports.
				this._logService.info(`[RemoteAgentHostProtocol] Transport lost for ${this._address} mid-reconnect; aborting the current attempt.`);
				this._cancelLivenessTimers();
				this._rejectPendingRequests(transportLostError(this._address));
				return;
		}
	}

	private _beginReconnectFromConnecting(error: ProtocolError): boolean {
		if (this._state.kind !== AgentHostClientState.Connecting || !this._transportFactory) {
			return false;
		}
		if (!this._reconnectPolicy.autoRestore) {
			this._logService.info(`[RemoteAgentHostProtocol] Transport lost while connecting to ${this._address}; automatic reconnect is disabled.`);
			this._handleFatalClose(error);
			return true;
		}
		this._logService.info(`[RemoteAgentHostProtocol] Transport lost while connecting to ${this._address}; scheduling a fresh initialize.`);
		// Carry the pre-handshake outbox into the reconnect state so queued
		// messages are replayed once the fresh initialize succeeds.
		const outbox = this._state.outbox;
		this._rejectPendingRequests(error);
		this._grantedImplicitReadUris.clear();
		this._implicitReadGrants.clear();
		this._transitionTo({
			kind: AgentHostClientState.Reconnecting,
			reconnect: { ...this._newReconnectState(), outbox },
		});
		this._cancelLivenessTimers();
		this._scheduleReconnect();
		return true;
	}

	/**
	 * Reopens a terminal connection after its host has been explicitly restarted.
	 */
	reconnectFromClosed(): boolean {
		if (this._state.kind !== AgentHostClientState.Closed || !this._transportFactory || this._store.isDisposed) {
			return false;
		}
		this._transitionTo({ kind: AgentHostClientState.Reconnecting, reconnect: this._newReconnectState() });
		this._scheduleReconnect(true);
		return true;
	}

	private _scheduleReconnect(userInitiated = false): void {
		if (this._state.kind !== AgentHostClientState.Reconnecting || !this._transportFactory) {
			return;
		}
		const reconnect = this._state.reconnect;
		if (reconnect.timeoutHandle !== undefined) {
			return;
		}
		if (!userInitiated && !this._reconnectPolicy.autoRestore) {
			const error = connectionClosedError(this._address);
			this._logService.info(`[RemoteAgentHostProtocol] Automatic reconnect to ${this._address} is disabled.`);
			this._handleFatalClose(error);
			return;
		}
		if (!userInitiated && hasExhaustedReconnectAttempts(this._reconnectPolicy, reconnect.attempt)) {
			const error = new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Automatic reconnect gave up after ${reconnect.attempt} attempts.`);
			this._logService.warn(`[RemoteAgentHostProtocol] Automatic reconnect to ${this._address} gave up after ${reconnect.attempt} attempts.`);
			this._handleFatalClose(error);
			return;
		}
		const attempt = reconnect.attempt + 1;
		const delay = computeReconnectDelay(this._reconnectPolicy, attempt);
		this._logService.info(`[RemoteAgentHostProtocol] Reconnecting to ${this._address} in ${delay}ms (attempt ${attempt}).`);
		reconnect.timeoutHandle = setTimeout(() => {
			if (this._state.kind === AgentHostClientState.Reconnecting) {
				this._state.reconnect.timeoutHandle = undefined;
			}
			void this._attemptReconnect();
		}, delay);
	}

	private async _attemptReconnect(): Promise<void> {
		if (this._state.kind !== AgentHostClientState.Reconnecting || !this._transportFactory) {
			return;
		}
		const reconnect = this._state.reconnect;
		reconnect.attempt++;
		let transport: IProtocolTransport | undefined;
		try {
			transport = this._transportFactory();
			this._installTransport(transport);
			if (isClientTransport(transport)) {
				await transport.connect();
			}
			if (this._state.kind !== AgentHostClientState.Reconnecting) {
				return;
			}

			const subscriptions = this._subscriptionManager.currentSubscriptionUris().map(u => u.toString());
			// Always include the always-live root state alongside getSubscription-managed entries.
			if (!subscriptions.includes(ROOT_STATE_URI)) {
				subscriptions.unshift(ROOT_STATE_URI);
			}
			const lastSeenServerSeq = this._serverSeq;
			const { result, freshInitialize } = await this._reconnectOrInitialize(lastSeenServerSeq, subscriptions);

			if (this._state.kind !== AgentHostClientState.Reconnecting) {
				return;
			}

			this._applyReconnectResult(result, freshInitialize);
			this._updateManagedSettingsPermissions(true);
			if (freshInitialize && result.type === ReconnectResultType.Snapshot) {
				await this._restoreAuthenticationAfterFreshInitialize();
				await this._restoreSubscriptionsAfterFreshInitialize(result.snapshots);
			}
			if (this._state.kind !== AgentHostClientState.Reconnecting) {
				return;
			}

			// Re-push renderer-owned config on reconnect too: a reconnected host may
			// be a freshly restarted process that never received these values (the
			// reconnect result itself carries none), which would otherwise leave
			// early-read config like the migrate flag at its host-side default.
			this._forwardClientConfig(false);

			// Drain the outbox BEFORE the transition so listeners reacting to
			// {@link onDidChangeConnectionState} that synchronously dispatch see
			// state=Connected and go direct, landing after the drained outbox
			// in wire order.
			const { gate } = reconnect;
			this._drainAfterReconnect(reconnect.outbox);

			this._lastReadTime = Date.now();
			this._resetLivenessTimers();
			this._transitionTo({ kind: AgentHostClientState.Connected });
			gate.complete();
			this._logService.info(`[RemoteAgentHostProtocol] Reconnected to ${this._address}.`);
		} catch (err) {
			this._logService.warn(`[RemoteAgentHostProtocol] Reconnect attempt failed for ${this._address}: ${err instanceof Error ? err.message : String(err)}`);
			transport?.dispose();
			if (this._state.kind !== AgentHostClientState.Reconnecting) {
				return;
			}
			if (err instanceof NonReconnectableTransportError) {
				const protocolError = new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, err.message);
				this._handleFatalClose(protocolError);
				return;
			}
			// Replace the gate so awaiting callers see the failure but new
			// callers gate on the next attempt instead of slipping through onto
			// the dead transport. Outbox carries forward to the next attempt.
			const oldGate = this._state.reconnect.gate;
			this._state.reconnect.gate = this._newReconnectGate();
			oldGate.error(err);
			this._scheduleReconnect();
		}
	}

	private async _reconnectOrInitialize(lastSeenServerSeq: number, subscriptions: string[]): Promise<{ result: CommandMap['reconnect']['result']; freshInitialize: boolean }> {
		try {
			const result = await this._dispatchRequest<CommandMap['reconnect']['result']>('reconnect', {
				clientId: this._clientId,
				lastSeenServerSeq,
				subscriptions,
				_meta: this._clientMeta(),
			}, { bypassReconnectGate: true });
			return { result, freshInitialize: false };
		} catch (error) {
			if (!(error instanceof ProtocolError) || error.code !== AhpErrorCodes.NotFound) {
				throw error;
			}
		}

		this._logService.info(`[RemoteAgentHostProtocol] Server forgot client ${this._clientId}; initializing a fresh connection.`);
		const initializeResult = await this._dispatchRequest<IAgentHostExtensionInitializeResult>('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [...CLIENT_SUPPORTED_PROTOCOL_VERSIONS],
			clientId: this._clientId,
			clientInfo: this._clientInfo,
			_meta: this._clientMeta(),
			initialSubscriptions: subscriptions,
		}, { bypassReconnectGate: true });
		this._applyInitializeResult(initializeResult, false);
		return {
			result: { type: ReconnectResultType.Snapshot, snapshots: initializeResult.snapshots ?? [] },
			freshInitialize: true,
		};
	}

	private async _restoreSubscriptionsAfterFreshInitialize(initialSnapshots: readonly IStateSnapshot[]): Promise<void> {
		const restored = new Set(initialSnapshots.map(snapshot => snapshot.resource));
		const active = this._subscriptionManager.getActiveSubscriptions()
			.filter(subscription => !restored.has(subscription.resource.toString()));
		const restoreGroup = async (subscriptions: typeof active) => {
			await Promise.all(subscriptions.map(async subscription => {
				try {
					const result = await this._dispatchRequest<CommandMap['subscribe']['result']>('subscribe', {
						channel: subscription.resource.toString(),
					}, { bypassReconnectGate: true });
					if (result.snapshot) {
						this._subscriptionManager.applyReconnectSnapshot(
							result.snapshot.resource,
							result.snapshot.state,
							result.snapshot.fromSeq,
							true,
						);
						this._serverSeq = Math.max(this._serverSeq, result.snapshot.fromSeq);
					}
				} catch (error) {
					if (error instanceof ProtocolError && error.code === AHP_CLIENT_CONNECTION_CLOSED) {
						throw error;
					}
					this._logService.warn(`[AgentHostProtocolClient] Failed to restore subscription ${subscription.resource.toString()} after host restart: ${error instanceof Error ? error.message : String(error)}`);
					this._subscriptionManager.markSubscriptionsMissing([subscription.resource]);
				}
			}));
		};

		await restoreGroup(active.filter(subscription => subscription.kind === StateComponents.Session));
		await Promise.all([
			restoreGroup(active.filter(subscription => subscription.kind === StateComponents.Chat)),
			restoreGroup(active.filter(subscription => subscription.kind !== StateComponents.Session && subscription.kind !== StateComponents.Chat)),
		]);
	}

	private async _restoreAuthenticationAfterFreshInitialize(): Promise<void> {
		await Promise.all([...this._authentication.values()].map(params => this._dispatchRequest<CommandMap['authenticate']['result']>('authenticate', {
			channel: ROOT_STATE_URI,
			...params,
			scopes: params.scopes ? [...params.scopes] : undefined,
		}, { bypassReconnectGate: true })));
	}

	private _clientMeta(): Record<string, unknown> {
		const telemetryLevel = this._effectiveTelemetryLevel();
		const sendIdentity = telemetryLevel >= TelemetryLevel.USAGE;
		return toAgentHostClientMeta(
			this._transport.clientConnectionKind,
			telemetryLevel,
			sendIdentity ? this._telemetryService.machineId : undefined,
			sendIdentity ? this._telemetryService.devDeviceId : undefined,
		);
	}

	private _applyInitializeResult(result: IAgentHostExtensionInitializeResult, forwardClientConfig = true): void {
		this._initializeResult.set(result, undefined);
		this._serverSeq = result.serverSeq;
		if (result.defaultDirectory) {
			const directory = result.defaultDirectory;
			this._defaultDirectory = typeof directory === 'string' ? URI.parse(directory).path : URI.revive(directory).path;
		}
		if (forwardClientConfig) {
			this._forwardClientConfig();
		}
	}

	/**
	 * Push the renderer-owned config values the host mirrors (telemetry level,
	 * proxy discovery, migrate flag, …) as `RootConfigChanged` actions. Called on
	 * initial connect AND on reconnect: a reconnected host may be a freshly
	 * restarted process (or one that lost these values), and re-pushing is a cheap
	 * no-op when nothing changed. Without this, a value read early — like the
	 * migrate flag in `listSessions` — can be missing after a window reload.
	 *
	 * Most settings arrive here declaratively, via `agentHost` on their
	 * configuration schema. The explicit calls below cover the cases a single
	 * key-plus-transform can't express: values derived from several settings, and
	 * settings contributed by an extension rather than by core.
	 */
	private _forwardClientConfig(includeManagedSettings = true): void {
		this._dispatchRootConfig(resolveAgentHostConfigurationSyncPatch(this._configurationService, getAgentHostConfigurationSyncTarget(this._resourceIdentity)));
		this._updateTelemetryLevel();
		this._updateTerminalAutoApproveEnabled();
		this._updateTerminalAutoApproveRules();
		this._updateAutoApprovePolicyRestriction();
		this._updateDisableRepoInfoTelemetry();
		if (includeManagedSettings) {
			void this._updateManagedSettingsPermissions();
		}
	}

	private _updateAutoApprovePolicyRestriction(): void {
		const policyRestricted = this._configurationService.inspect<boolean>(GLOBAL_AUTO_APPROVE_SETTING_ID)?.policyValue === false;
		this._dispatchRootConfig({ [AgentHostAutoApprovePolicyRestrictedConfigKey]: policyRestricted });
	}

	/**
	 * Apply a `reconnect` RPC result to the subscription manager. On `replay`
	 * we feed each missed envelope through the normal action path; on
	 * `snapshot` we reseat each named subscription with the fresh state and
	 * advance the server seq cursor accordingly.
	 */
	private _applyReconnectResult(result: CommandMap['reconnect']['result'], preservePending = false): void {
		if (result.type === ReconnectResultType.Replay) {
			let maxSeq = this._serverSeq;
			for (const envelope of result.actions) {
				// For own non-rejected actions, drop the matching pending entry up
				// front so we don't resend it via {@link _replayPendingActions}.
				// For rejected actions we MUST leave the entry in place so the
				// subscription's reconcile path sees `idx !== -1` and discards
				// the action instead of applying it to confirmed state.
				if (envelope.origin?.clientId === this._clientId
					&& envelope.origin.clientSeq !== undefined
					&& !envelope.rejectionReason) {
					this._subscriptionManager.dropPendingAction(envelope.channel, envelope.origin.clientSeq);
				}
				if (envelope.serverSeq > maxSeq) {
					maxSeq = envelope.serverSeq;
				}
				this._onDidAction.fire(normalizeLegacyActionEnvelope(envelope));
			}
			this._serverSeq = maxSeq;
			if (result.missing.length > 0) {
				this._logService.info(`[RemoteAgentHostProtocol] Server cannot resume ${result.missing.length} subscription(s) after reconnect.`);
				this._subscriptionManager.markSubscriptionsMissing(result.missing.map(u => URI.parse(u)));
			}
		} else {
			let maxSeq = this._serverSeq;
			for (const snapshot of result.snapshots) {
				this._subscriptionManager.applyReconnectSnapshot(snapshot.resource, snapshot.state, snapshot.fromSeq, preservePending);
				if (snapshot.fromSeq > maxSeq) {
					maxSeq = snapshot.fromSeq;
				}
			}
			this._serverSeq = maxSeq;
		}
	}

	/**
	 * Drain queued outgoing wire traffic after a successful soft reconnect:
	 *
	 * 1. Resend pending optimistic session actions that the server did NOT
	 *    echo back in the replay buffer (i.e. anything still on
	 *    {@link AgentSubscriptionManager.getPendingActions}).
	 * 2. Flush every message that {@link _sendNotification} queued onto the
	 *    outbox while the gate was engaged.
	 *
	 * Replays are deduped against the outbox by `clientSeq` so a session
	 * action that was both optimistic-tracked AND queued during the
	 * reconnect window only goes out once.
	 */
	private _drainAfterReconnect(outbox: readonly ProtocolMessage[]): void {
		// Build the set of clientSeqs already represented in the outbox so we
		// don't replay a duplicate. Only `dispatchAction` notifications carry
		// a clientSeq; nothing else is independently re-emitted by the replay
		// path, so other queued message kinds need no dedup.
		const queuedSeqs = new Set<number>();
		for (const msg of outbox) {
			if (hasKey(msg, { method: true }) && msg.method === 'dispatchAction') {
				queuedSeqs.add(msg.params.clientSeq);
			}
		}

		const replays: ProtocolMessage[] = [];
		for (const entry of this._subscriptionManager.getPendingActions()) {
			if (queuedSeqs.has(entry.clientSeq)) {
				continue;
			}
			this._grantImplicitReadsForOutgoingAction(entry.action);
			replays.push({
				jsonrpc: '2.0',
				method: 'dispatchAction',
				params: { channel: entry.channel, clientSeq: entry.clientSeq, action: entry.action },
			});
		}

		if (replays.length > 0) {
			this._logService.info(`[RemoteAgentHostProtocol] Replaying ${replays.length} pending action(s) after reconnect to ${this._address}.`);
		}

		// Replays first (dispatched before the reconnect window), then the
		// outbox (dispatched during it) so wire order roughly tracks
		// dispatch order.
		for (const msg of replays) {
			this._transport.send(msg);
		}
		for (const msg of outbox) {
			this._transport.send(msg);
		}
	}

	// ---- IAgentConnection subscription API ----------------------------------

	get rootState(): IAgentSubscription<RootState> {
		return this._subscriptionManager.rootState;
	}

	getSubscription<T>(kind: StateComponents, resource: URI, owner: string): IReference<IAgentSubscription<T>> {
		return this._subscriptionManager.getSubscription<T>(kind, resource, owner);
	}

	getSubscriptionUnmanaged<T>(_kind: StateComponents, resource: URI): IAgentSubscription<T> | undefined {
		return this._subscriptionManager.getSubscriptionUnmanaged<T>(resource);
	}

	getInflightSessionCreate(resource: URI): Promise<unknown> | undefined {
		return this._subscriptionManager.getInflightSessionCreate(resource);
	}

	trackSessionCreate(resource: URI, promise: Promise<unknown>): void {
		this._subscriptionManager.trackSessionCreate(resource, promise);
	}

	getActiveSubscriptions(): readonly IActiveSubscriptionInfo[] {
		return this._subscriptionManager.getActiveSubscriptions();
	}

	dispatch(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | ClientAutomationAction | ClientAutomationRunAction | IRootConfigChangedAction): void {
		const seq = this._subscriptionManager.dispatchOptimistic(channel, action);
		this.dispatchAction(channel, action, this._clientId, seq);
	}

	/**
	 * Subscribe to state at a URI. Returns the current state snapshot.
	 *
	 * For stateless channels (e.g. `ahp-otlp:` telemetry channels) use
	 * {@link subscribeStateless} — calling this method on a stateless
	 * channel rejects because the server omits `snapshot` on the
	 * response.
	 */
	async subscribe(resource: URI): Promise<IStateSnapshot> {
		this._logService.trace(`[RemoteAgentHostProtocol] subscribe start: ${resource.toString()}`);
		const result = await this._sendRequest('subscribe', { channel: resource.toString() });
		if (!result.snapshot) {
			throw new Error(`subscribe to ${resource.toString()} returned no snapshot`);
		}
		this._logService.trace(`[RemoteAgentHostProtocol] subscribe done: ${resource.toString()}`);
		return result.snapshot;
	}

	/**
	 * Subscribe to a stateless channel — one for which the server does
	 * not maintain replayable state and therefore omits `snapshot` from
	 * the `subscribe` response. Used today for the host's OTLP telemetry
	 * channels (`ahp-otlp:`).
	 *
	 * Returns once the subscription is confirmed by the server.
	 * Subsequent notifications on the channel arrive via the relevant
	 * dispatch event (e.g. {@link onDidReceiveOtlpLogs} for log records).
	 */
	async subscribeStateless(resource: URI): Promise<void> {
		await this._sendRequest('subscribe', { channel: resource.toString() });
	}

	/**
	 * Unsubscribe from state at a URI.
	 */
	unsubscribe(resource: URI): void {
		this._sendNotification('unsubscribe', { channel: resource.toString() });
	}

	/**
	 * Dispatch a client action to the server. Returns the clientSeq used.
	 */
	private dispatchAction(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | ClientAutomationAction | ClientAutomationRunAction | IRootConfigChangedAction, _clientId: string, clientSeq: number): void {
		this._grantImplicitReadsForOutgoingAction(action);
		this._sendNotification('dispatchAction', { channel, clientSeq, action });
	}

	/**
	 * Create a new session on the remote agent host.
	 */
	createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const provider = config?.provider;
		if (!provider) {
			throw new Error('Cannot create remote agent host session without a provider.');
		}
		const session = config?.session ?? AgentSession.uri(provider, generateUuid());
		if (config?.activeClient?.customizations) {
			this._grantImplicitReadsForCustomizations(config.activeClient.customizations);
		}
		// Use `.then` (not `async`) so the tracked promise and the returned promise are the same object — callers
		// awaiting via `getInflightSessionCreate` resume on the same microtask queue as direct `createSession()` awaiters.
		const promise = this._sendRequest('createSession', {
			channel: session.toString(),
			_meta: config?._meta,
			provider,
			workingDirectories: config?.workingDirectories?.map(d => fromAgentHostUri(d).toString()),
			config: config?.config,
			activeClient: config?.activeClient,
			progressToken: config?.progressToken,
		}).then(() => session);
		this._subscriptionManager.trackSessionCreate(session, promise);
		return promise;
	}

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		return this._sendRequest('resolveSessionConfig', {
			channel: ROOT_STATE_URI,
			provider: params.provider,
			workingDirectory: params.workingDirectory ? fromAgentHostUri(params.workingDirectory).toString() : undefined,
			config: params.config,
		});
	}

	async sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		return this._sendRequest('sessionConfigCompletions', {
			channel: ROOT_STATE_URI,
			provider: params.provider,
			workingDirectory: params.workingDirectory ? fromAgentHostUri(params.workingDirectory).toString() : undefined,
			config: params.config,
			property: params.property,
			query: params.query,
		});
	}

	async completions(params: CompletionsParams): Promise<CompletionsResult> {
		return this._sendRequest('completions', params);
	}

	async listAutomationTriggerDefinitions(params: ListAutomationTriggerDefinitionsParams): Promise<ListAutomationTriggerDefinitionsResult> {
		return this._sendRequest('listAutomationTriggerDefinitions', params);
	}

	async runAutomation(params: RunAutomationParams): Promise<RunAutomationResult> {
		return this._sendRequest('runAutomation', params);
	}

	async fetchAutomationRuns(params: FetchAutomationRunsParams): Promise<FetchAutomationRunsResult> {
		return this._sendRequest('fetchAutomationRuns', params);
	}

	/**
	 * Send an application-level ping and wait for the server's response.
	 * Used by {@link _watchdogTick} to keep idle connections under
	 * watchdog supervision; safe to call from external code as well.
	 *
	 * The returned promise rejects with a {@link ProtocolError} if the
	 * connection closes before a response arrives.
	 */
	async ping(): Promise<void> {
		await this._sendRequest('ping', { channel: ROOT_STATE_URI });
	}

	/**
	 * Returns the trigger characters captured from the `initialize` handshake.
	 * Empty when the remote host did not announce any.
	 */
	async getCompletionTriggerCharacters(): Promise<readonly string[]> {
		while (this._state.kind === AgentHostClientState.Connecting) {
			await Event.toPromise(this.onDidChangeConnectionState);
		}
		switch (this._state.kind) {
			case AgentHostClientState.Incompatible:
			case AgentHostClientState.Closed:
				throw this._state.error;
			case AgentHostClientState.Connected:
			case AgentHostClientState.Reconnecting:
				return this._initializeResult.get()?.completionTriggerCharacters ?? [];
		}
	}

	/**
	 * Authenticate with the remote agent host using a specific scheme.
	 */
	async authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		const normalizedParams: AuthenticateParams = {
			...params,
			scopes: params.scopes ? [...new Set(params.scopes)].sort() : undefined,
		};
		await this._sendRequest('authenticate', {
			channel: ROOT_STATE_URI,
			...normalizedParams,
			scopes: normalizedParams.scopes ? [...normalizedParams.scopes] : undefined,
		});
		const key = `${normalizedParams.resource}\0${JSON.stringify(normalizedParams.scopes ?? [])}`;
		if (params.token) {
			this._authentication.set(key, normalizedParams);
		} else {
			this._authentication.delete(key);
		}
		return { authenticated: true };
	}

	/**
	 * Gracefully shut down all sessions on the remote host.
	 */
	async shutdown(): Promise<void> {
		await this._sendExtensionRequest('shutdown');
	}

	/**
	 * List the endpoints the remote agent host suggests probing for connectivity.
	 */
	async getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
		return this._sendExtensionRequest('getNetworkDiagnosticsInfo');
	}

	async getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]> {
		return this._sendExtensionRequest('getManagedSettingsDiagnostics');
	}

	async getSessionStateFile(session: URI, chat?: URI): Promise<URI | undefined> {
		const targetChat = chat && !isDefaultChatUri(chat) ? chat : undefined;
		if (targetChat && !supportsAgentHostChatStateFile(this._initializeResult.get())) {
			return undefined;
		}
		const result = await this._sendExtensionRequest(GetAgentHostSessionStateFileExtensionMethod, {
			session: session.toString(),
			chat: targetChat?.toString(),
		});
		if (!result.resource) {
			return undefined;
		}
		const resource = URI.parse(result.resource, true);
		if (resource.scheme !== Schemas.file) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Agent Host returned a non-file session state resource: ${resource.toString()}`);
		}
		return toAgentHostUri(resource, this._connectionAuthority);
	}

	async collectDebugLogs(session: URI | undefined, kind: AgentHostDebugLogsArtifactKind, chat?: URI): Promise<IAgentHostDebugLogsArtifact> {
		const result = await this._sendExtensionRequest(CollectAgentHostDebugLogsExtensionMethod, {
			session: session?.toString(),
			chat: chat?.toString(),
			kind,
		});
		if (result.kind !== kind) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Agent Host returned ${result.kind} debug logs for a ${kind} request`);
		}
		const resource = URI.parse(result.resource, true);
		if (resource.scheme !== Schemas.file) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Agent Host returned a non-file debug log resource: ${resource.toString()}`);
		}
		if (!Number.isSafeInteger(result.size) || result.size < 0
			|| !Number.isSafeInteger(result.uncompressedSize) || result.uncompressedSize < 0) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Agent Host returned invalid debug log artifact sizes');
		}
		if (!Array.isArray(result.entries) || result.entries.length > AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Agent Host returned an invalid debug log artifact manifest');
		}
		const entryPaths = new Set<string>();
		let manifestSize = 0;
		for (const entry of result.entries) {
			const segments = entry.path.split('/');
			if (!entry.path || entry.path.includes('\\') || segments.some((segment: string) => !segment || segment === '.' || segment === '..')
				|| !Number.isSafeInteger(entry.size) || entry.size < 0
				|| entryPaths.has(entry.path)) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Agent Host returned an invalid debug log artifact manifest entry');
			}
			entryPaths.add(entry.path);
			manifestSize += entry.size;
		}
		if (!Number.isSafeInteger(manifestSize) || manifestSize !== result.uncompressedSize) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Agent Host debug log artifact manifest size does not match its declared size');
		}
		return {
			kind: result.kind,
			resource: toAgentHostUri(resource, this._connectionAuthority),
			providerLogsIncluded: result.providerLogsIncluded,
			size: result.size,
			uncompressedSize: result.uncompressedSize,
			entries: result.entries,
		};
	}

	/**
	 * Read one bounded slice of a debug-log artifact previously returned by
	 * {@link collectDebugLogs}. `resource` is the agent-host URI handed out by
	 * that call; it is unwrapped back to the host-local path here.
	 */
	async readDebugLogsChunk(resource: URI, position: number): Promise<IAgentHostDebugLogsChunk> {
		const result = await this._sendExtensionRequest(ReadAgentHostDebugLogsChunkExtensionMethod, {
			resource: fromAgentHostUri(resource).toString(),
			position,
		});
		const data = decodeBase64(result.data);
		if (data.byteLength > AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Agent Host returned an oversized debug log chunk');
		}
		return { data, eof: result.eof === true };
	}

	/**
	 * Probe connectivity from the remote agent host to a single `url`.
	 */
	async diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult> {
		return this._sendExtensionRequest('diagnosticsFetch', { url });
	}

	/**
	 * Dispose a session on the remote agent host.
	 */
	async disposeSession(session: URI): Promise<void> {
		await this._sendRequest('disposeSession', { channel: session.toString() });
	}

	async createChat(session: URI, chat: URI, options?: IAgentCreateChatRequestOptions): Promise<void> {
		await this._sendRequest('createChat', {
			channel: session.toString(),
			chat: chat.toString(),
			...(options?.fork ? {
				source: { kind: ChatSourceKind.Fork, chat: options.fork.source.toString(), turnId: options.fork.turnId }
			} : {}),
			...(options?.sideChat ? {
				source: {
					kind: ChatSourceKind.SideChat,
					chat: options.sideChat.source.toString(),
					turnId: options.sideChat.turnId,
					...(options.sideChat.selection ? { selection: options.sideChat.selection } : {}),
				}
			} : {}),
		});
	}

	async disposeChat(chat: URI): Promise<void> {
		await this._sendRequest('disposeChat', { channel: chat.toString() });
	}

	/**
	 * Create a new terminal on the remote agent host.
	 */
	async createTerminal(params: CreateTerminalParams): Promise<void> {
		await this._sendRequest('createTerminal', params);
	}

	/**
	 * Dispose a terminal on the remote agent host.
	 */
	async disposeTerminal(terminal: URI): Promise<void> {
		await this._sendRequest('disposeTerminal', { channel: terminal.toString() });
	}

	async invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult> {
		return await this._sendRequest('invokeChangesetOperation', params);
	}

	/**
	 * Send a request on an `mcp://` AHP side channel. The agent-host
	 * routes by `params.channel` so we inject it automatically.
	 */
	async handleMcpRequest(channel: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		return await this._dispatchRequest<unknown>(method, { ...(params ?? {}), channel });
	}

	/**
	 * List all sessions from the remote agent host.
	 */
	async listSessions(): Promise<(IAgentSessionMetadata & { readonly workingDirectory?: URI })[]> {
		const result = await this._sendRequest('listSessions', { channel: ROOT_STATE_URI });
		return result.items.map((s: SessionSummary) => ({
			session: URI.parse(s.resource),
			startTime: Date.parse(s.createdAt),
			modifiedTime: Date.parse(s.modifiedAt),
			...(s.project ? {
				project: {
					uri: this._toLocalProjectUri(URI.parse(s.project.uri)),
					displayName: s.project.displayName,
				}
			} : {}),
			summary: s.title,
			status: s.status,
			activity: s.activity,
			workingDirectory: typeof s.workingDirectories?.[0] === 'string' ? toAgentHostUri(URI.parse(s.workingDirectories?.[0]), this._connectionAuthority) : undefined,
			workingDirectories: s.workingDirectories?.map(d => toAgentHostUri(URI.parse(d), this._connectionAuthority)),
			changes: s.changes,
			// Carry durable host provenance for sessions first materialized from a listing.
			...(s._meta !== undefined ? { _meta: s._meta } : {}),
		}));
	}

	private _toLocalProjectUri(uri: URI): URI {
		return uri.scheme === Schemas.file ? toAgentHostUri(uri, this._connectionAuthority) : uri;
	}

	/**
	 * Inspect an outgoing client-dispatched action and grant implicit reads for
	 * resources that the host will need to read after receiving the action.
	 */
	private _grantImplicitReadsForOutgoingAction(action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | ClientAutomationAction | ClientAutomationRunAction | IRootConfigChangedAction): void {
		switch (action.type) {
			case ActionType.SessionActiveClientSet:
				if (action.activeClient.customizations) {
					this._grantImplicitReadsForCustomizations(action.activeClient.customizations);
				}
				break;
			case ActionType.ChatTurnStarted:
			case ActionType.ChatPendingMessageSet:
				this._grantImplicitReadsForMessage(action.message);
				break;
		}
	}

	private _grantImplicitReadsForMessage(message: Message): void {
		for (const attachment of message.attachments ?? []) {
			if (attachment.type !== MessageAttachmentKind.Resource) {
				continue;
			}
			try {
				this._grantImplicitRead(URI.parse(attachment.uri));
			} catch {
				continue;
			}
		}
	}

	/**
	 * Register implicit read grants for each customization URI that we are
	 * about to send to the host. The host needs to read these to materialize
	 * the customization, but should not need to write them. Grants are
	 * deduped per connection and revoked when the connection closes.
	 */
	private _grantImplicitReadsForCustomizations(refs: readonly ClientPluginCustomization[]): void {
		for (const ref of refs) {
			let uri: URI;
			try {
				uri = URI.parse(ref.uri);
			} catch {
				continue;
			}
			this._grantImplicitRead(uri);
		}
	}

	private _grantImplicitRead(uri: URI): void {
		if (this._grantedImplicitReadUris.has(uri)) {
			return;
		}
		this._grantedImplicitReadUris.add(uri);
		this._implicitReadGrants.add(this._resourceService.grantImplicitRead(this._resourceIdentity, uri));
	}

	/**
	 * List the contents of a directory on the remote host's filesystem.
	 */
	async resourceList(uri: URI): Promise<CommandMap['resourceList']['result']> {
		return await this._sendRequest('resourceList', { channel: ROOT_STATE_URI, uri: uri.toString() });
	}

	/**
	 * Read the content of a resource on the remote host.
	 */
	async resourceRead(uri: URI, encoding?: ContentEncoding): Promise<CommandMap['resourceRead']['result']> {
		return this._sendRequest('resourceRead', { channel: ROOT_STATE_URI, uri: uri.toString(), encoding });
	}

	async resourceWrite(params: CommandMap['resourceWrite']['params']): Promise<CommandMap['resourceWrite']['result']> {
		return this._sendRequest('resourceWrite', params);
	}

	async resourceCopy(params: CommandMap['resourceCopy']['params']): Promise<CommandMap['resourceCopy']['result']> {
		return this._sendRequest('resourceCopy', params);
	}

	async resourceDelete(params: CommandMap['resourceDelete']['params']): Promise<CommandMap['resourceDelete']['result']> {
		return this._sendRequest('resourceDelete', params);
	}

	async resourceMove(params: CommandMap['resourceMove']['params']): Promise<CommandMap['resourceMove']['result']> {
		return this._sendRequest('resourceMove', params);
	}

	async resourceResolve(params: CommandMap['resourceResolve']['params']): Promise<CommandMap['resourceResolve']['result']> {
		return this._sendRequest('resourceResolve', params);
	}

	async resourceMkdir(params: CommandMap['resourceMkdir']['params']): Promise<CommandMap['resourceMkdir']['result']> {
		return this._sendRequest('resourceMkdir', params);
	}

	async createResourceWatch(params: CommandMap['createResourceWatch']['params']): Promise<CommandMap['createResourceWatch']['result']> {
		return this._sendRequest('createResourceWatch', params);
	}

	/**
	 * Convenience wrapper used by {@link AHPFileSystemProvider.watch}:
	 * runs `createResourceWatch` + `subscribe` and returns a handle that
	 * surfaces `resourceWatch/changed` envelopes as
	 * {@link IFileChange}[] events. Disposing the handle unsubscribes
	 * the watch channel.
	 */
	watchResource(params: CommandMap['createResourceWatch']['params']): Promise<IRemoteWatchHandle> {
		return createRemoteWatchHandle({
			createResourceWatch: p => this.createResourceWatch(p),
			subscribe: uri => this.subscribe(uri),
			unsubscribe: uri => this.unsubscribe(uri),
			onDidAction: this.onDidAction,
		}, params);
	}

	/**
	 * Trigger the CLI-managed upgrade flow for this agent host using the
	 * method name advertised by the server (typically
	 * {@link VSCODE_UPGRADE_METHOD}). Callable before {@link connect} has
	 * completed — typically used when the host has just rejected our
	 * `initialize` with an `UnsupportedProtocolVersion` error. The
	 * transport stays open after the rejection, so the extension request
	 * rides over it without a special out-of-band path.
	 *
	 * The result mirrors the CLI's HTTP response: ok flag, whether the
	 * upgrade is needed / started, running/latest commits.
	 */
	triggerVscodeUpgrade(method: string): Promise<IVscodeUpgradeResult> {
		return this._dispatchRequest<IVscodeUpgradeResult>(method, {}, { allowIncompatibleUpgrade: true });
	}

	private _handleMessage(msg: ProtocolMessage): void {
		if (this._state.kind === AgentHostClientState.Closed) {
			// After close, the transport may still emit late messages (e.g.
			// because the same shared event source is also feeding a newer
			// transport for the same connectionId). Drop them so they can't
			// trigger any side effects.
			return;
		}

		// Any inbound traffic — including this message — is evidence the
		// transport is still alive. Reset the liveness timers before
		// dispatch so they're consistent even if a handler synchronously
		// schedules work.
		this._lastReadTime = Date.now();
		this._resetLivenessTimers();

		if (isJsonRpcRequest(msg)) {
			this._handleReverseRequest(msg.id, msg.method, msg.params);
		} else if (isJsonRpcResponse(msg)) {
			const pending = this._pendingRequests.get(msg.id);
			if (pending) {
				this._pendingRequests.delete(msg.id);
				if (hasKey(msg, { error: true })) {
					if (this._shouldLogFailedRequest(pending, msg.error)) {
						this._logService.warn(`[RemoteAgentHostProtocol] Request ${msg.id} failed:`, msg.error);
					}
					pending.deferred.error(this._toProtocolError(msg.error));
				} else {
					pending.deferred.complete(msg.result);
				}
			} else {
				this._logService.warn(`[RemoteAgentHostProtocol] Received response for unknown request id ${msg.id}`);
			}
		} else if (isJsonRpcNotification(msg)) {
			switch (msg.method) {
				case 'action': {
					// Protocol envelope → VS Code envelope (superset of action types)
					const envelope = msg.params;
					this._serverSeq = Math.max(this._serverSeq, envelope.serverSeq);
					this._onDidAction.fire(normalizeLegacyActionEnvelope(envelope));
					break;
				}
				case 'root/sessionAdded':
				case 'root/sessionRemoved':
				case 'root/sessionSummaryChanged':
				case 'root/progress':
				case 'auth/required': {
					this._logService.trace(`[RemoteAgentHostProtocol] Notification: ${msg.method}`);
					// The case narrows `msg.method` to a single literal; the matching params
					// shape is paired with that literal by the {@link ServerNotificationMap}
					// definition, so spreading is safe.
					// eslint-disable-next-line local/code-no-dangerous-type-assertions
					this._onDidNotification.fire({ type: msg.method, ...msg.params } as INotification);
					break;
				}
				case 'otlp/exportLogs':
					this._onDidReceiveOtlpLogs.fire(msg.params);
					break;
				case 'otlp/exportTraces':
				case 'otlp/exportMetrics':
					// Not recorded, yet
					break;
				default: {
					const rawChannel = msg.params && typeof msg.params === 'object'
						? (msg.params as { channel?: unknown }).channel
						: undefined;
					if (typeof rawChannel === 'string' && rawChannel.toLowerCase().startsWith('mcp:/')) {
						const { channel: _channel, ...rest } = msg.params as { channel: string;[k: string]: unknown };
						this._onMcpNotification.fire({ channel: rawChannel, method: msg.method, params: rest });
						break;
					}
					this._logService.trace(`[RemoteAgentHostProtocol] Unhandled method: ${msg.method}`);
					break;
				}
			}
		} else {
			this._logService.warn(`[RemoteAgentHostProtocol] Unrecognized message:`, JSON.stringify(msg));
		}
	}

	private _handleFatalClose(error: ProtocolError): void {
		this._onDidFatalClose.fire(error);
		this._handleClose(error);
	}

	private _handleClose(error: ProtocolError): void {
		if (this._state.kind === AgentHostClientState.Closed) {
			return;
		}
		// Stop the liveness timers so they don't keep ticking on a dead
		// connection (the client may outlive the close, waiting to be replaced).
		this._cancelLivenessTimers();
		if (this._state.kind === AgentHostClientState.Reconnecting) {
			const reconnect = this._state.reconnect;
			if (reconnect.timeoutHandle !== undefined) {
				clearTimeout(reconnect.timeoutHandle);
			}
			if (!reconnect.gate.isSettled) {
				reconnect.gate.error(error);
			}
			// Outbox is dropped when the reconnect state is discarded by the
			// transition below.
		}
		if (this._state.kind === AgentHostClientState.Connecting) {
			this._state.outbox.length = 0;
		}
		this._rejectPendingRequests(error);
		this._grantedImplicitReadUris.clear();
		this._implicitReadGrants.clear();
		this._resourceService.connectionClosed(this._resourceIdentity);
		this._transitionTo({ kind: AgentHostClientState.Closed, error });
		this._onDidClose.fire();
	}

	private async _raceClose<T>(promise: Promise<T>): Promise<T> {
		if (this._state.kind === AgentHostClientState.Closed) {
			return Promise.reject(this._state.error);
		}

		let closeListener = Disposable.None;
		const closePromise = new Promise<never>((_resolve, reject) => {
			closeListener = this.onDidClose(() => reject(this._state.kind === AgentHostClientState.Closed ? this._state.error : connectionClosedError(this._address)));
		});

		try {
			return await Promise.race([promise, closePromise]);
		} finally {
			closeListener.dispose();
		}
	}

	/**
	 * Handles reverse RPC requests from the server (e.g. resourceList,
	 * resourceRead). Thin wire adapter — dispatches each frame to
	 * {@link IAgentHostResourceService} (which owns gating, virtual reads,
	 * and the user-prompt flow) and translates results / errors back into
	 * JSON-RPC frames.
	 */
	private _handleReverseRequest(id: number, method: string, params: unknown): void {
		// Capture the transport at request-entry so async handlers (permission
		// checks, file ops) reply on the same transport the request arrived on.
		// Without this, a soft reconnect mid-handler would route the response
		// onto a new transport with a stale id — stray response at best, id
		// collision with a new server-issued reverse RPC at worst.
		const transport = this._transport;
		const sendResult = (result: unknown) => {
			transport.send({ jsonrpc: '2.0', id, result });
		};
		const sendError = (err: unknown) => {
			if (err instanceof AgentHostResourcePermissionError) {
				transport.send({
					jsonrpc: '2.0',
					id,
					error: {
						code: AhpErrorCodes.PermissionDenied,
						message: err.message,
						data: err.request ? { request: err.request } : undefined,
					},
				});
				return;
			}
			const fsCode = toFileSystemProviderErrorCode(err instanceof Error ? err : undefined);
			let code = -32000;
			switch (fsCode) {
				case FileSystemProviderErrorCode.FileNotFound: code = AhpErrorCodes.NotFound; break;
				case FileSystemProviderErrorCode.NoPermissions: code = AhpErrorCodes.PermissionDenied; break;
				case FileSystemProviderErrorCode.FileExists: code = AhpErrorCodes.AlreadyExists; break;
			}
			transport.send({ jsonrpc: '2.0', id, error: { code, message: err instanceof Error ? err.message : String(err) } });
		};

		const p = (params ?? {}) as Record<string, unknown>;
		const identity = this._resourceIdentity;
		void (async () => {
			try {
				switch (method) {
					case 'resourceList': {
						if (!p.uri) { throw new Error('Missing uri'); }
						const result = await this._resourceService.list(identity, URI.parse(p.uri as string));
						sendResult({ entries: result.entries });
						return;
					}
					case 'resourceRead': {
						if (!p.uri) { throw new Error('Missing uri'); }
						const result = await this._resourceService.read(identity, URI.parse(p.uri as string));
						sendResult({ data: encodeBase64(result.bytes), encoding: ContentEncoding.Base64 });
						return;
					}
					case 'resourceWrite': {
						if (!p.uri || p.data === undefined) { throw new Error('Missing uri or data'); }
						await this._resourceService.write(identity, p as unknown as Parameters<typeof this._resourceService.write>[1]);
						sendResult({});
						return;
					}
					case 'resourceDelete': {
						if (!p.uri) { throw new Error('Missing uri'); }
						await this._resourceService.del(identity, p as unknown as Parameters<typeof this._resourceService.del>[1]);
						sendResult({});
						return;
					}
					case 'resourceMove': {
						if (!p.source || !p.destination) { throw new Error('Missing source or destination'); }
						await this._resourceService.move(identity, p as unknown as Parameters<typeof this._resourceService.move>[1]);
						sendResult({});
						return;
					}
					case 'resourceCopy': {
						if (!p.source || !p.destination) { throw new Error('Missing source or destination'); }
						await this._resourceService.copy(identity, p as unknown as Parameters<typeof this._resourceService.copy>[1]);
						sendResult({});
						return;
					}
					case 'resourceResolve': {
						if (!p.uri) { throw new Error('Missing uri'); }
						const result = await this._resourceService.resolve(identity, p as unknown as Parameters<typeof this._resourceService.resolve>[1]);
						sendResult(result);
						return;
					}
					case 'resourceMkdir': {
						if (!p.uri) { throw new Error('Missing uri'); }
						await this._resourceService.mkdir(identity, p as unknown as Parameters<typeof this._resourceService.mkdir>[1]);
						sendResult({});
						return;
					}
					case 'resourceRequest': {
						try {
							await this._resourceService.request(identity, p as unknown as ResourceRequestParams);
							sendResult({});
						} catch (err) {
							if (err instanceof CancellationError) {
								throw new AgentHostResourcePermissionError(undefined);
							}
							throw err;
						}
						return;
					}
					default:
						this._logService.warn(`[RemoteAgentHostProtocol] Unhandled reverse request: ${method}`);
						throw new Error(`Unknown method: ${method}`);
				}
			} catch (err) {
				sendError(err);
			}
		})();
	}

	/** Send a typed JSON-RPC notification for a protocol-defined method. */
	private _sendNotification<M extends keyof ClientNotificationMap>(method: M, params: ClientNotificationMap[M]['params']): void {
		this._sendNotificationMessage(method, params);
	}

	private _sendExtensionNotification<M extends keyof IRemoteAgentHostExtensionNotificationMap>(method: M, params: IRemoteAgentHostExtensionNotificationMap[M]['params'], sendDuringReconnect = false): void {
		this._sendNotificationMessage(method, params, sendDuringReconnect);
	}

	private _sendNotificationMessage(method: string, params: unknown, sendDuringReconnect = false): void {
		if (this._state.kind === AgentHostClientState.Closed || this._state.kind === AgentHostClientState.Incompatible) {
			return;
		}
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		const message = { jsonrpc: '2.0' as const, method, params } as ProtocolMessage;
		if (isClientTransport(this._transport) && this._state.kind === AgentHostClientState.Connecting) {
			this._state.outbox.push(message);
			return;
		}
		if (this._state.kind === AgentHostClientState.Reconnecting && !sendDuringReconnect) {
			// Queue for the new transport — drained by {@link _drainAfterReconnect}
			// once the soft-reconnect handshake completes. The outbox persists
			// across failed attempts so a message rides through retry cycles
			// rather than being silently dropped.
			this._state.reconnect.outbox.push(message);
			return;
		}
		this._transport.send(message);
	}

	/** Send a typed JSON-RPC request for a protocol-defined method. */
	private _sendRequest<M extends keyof CommandMap>(method: M, params: CommandMap[M]['params']): Promise<CommandMap[M]['result']> {
		return this._dispatchRequest<CommandMap[M]['result']>(method, params);
	}

	/** Send a JSON-RPC request for a VS Code extension method (not in the protocol spec). */
	private _sendExtensionRequest<M extends keyof IAgentHostExtensionCommandMap>(method: M, params?: IAgentHostExtensionCommandMap[M]['params']): Promise<IAgentHostExtensionCommandMap[M]['result']> {
		return this._dispatchRequest<IAgentHostExtensionCommandMap[M]['result']>(method, params);
	}

	private _updateTelemetryLevel(): void {
		this._dispatchRootConfig({ [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(this._effectiveTelemetryLevel()) });
	}

	private _effectiveTelemetryLevel(): TelemetryLevel {
		return Math.min(getTelemetryLevel(this._configurationService), this._telemetryService.telemetryLevel);
	}

	/** Merge a patch into the agent host's root configuration. */
	private _dispatchRootConfig(config: Record<string, unknown>): void {
		this.dispatchAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config,
		}, this._clientId, 0);
	}

	private _updateDisableRepoInfoTelemetry(): void {
		const disabled = this._configurationService.getValue<boolean>(DISABLE_REPO_INFO_TELEMETRY_SETTING_ID) === true;
		this._dispatchRootConfig({ [AgentHostDisableRepoInfoTelemetryConfigKey]: disabled });
	}

	private _updateTerminalAutoApproveEnabled(): void {
		// Deliberately on the manual, workspace-aware path rather than declaring
		// `agentHost` on its schema: the setting is `restricted` and settable per
		// workspace, and its companion rule set (`terminalAutoApproveRules`) is
		// workspace-aware too. Resolving only the global value here would let a
		// workspace that turned auto-approval off still have it applied.
		const enabled = this._configurationService.getValue<boolean>(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID) !== false;
		this._dispatchRootConfig({ [AgentHostTerminalAutoApproveEnabledConfigKey]: enabled });
	}

	private _updateTerminalAutoApproveRules(): void {
		this._dispatchRootConfig({ [AgentHostTerminalAutoApproveRulesConfigKey]: getAgentHostTerminalAutoApproveRulesConfig(this._configurationService) });
	}

	private _updateManagedSettingsPermissions(sendDuringReconnect = false): void {
		const permissions = this._resourceIdentity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY
			? resolveManagedSettingsPermissions(this._configurationService)
			: {};
		this._sendExtensionNotification('setClientManagedSettingsPermissions', { permissions }, sendDuringReconnect);
	}

	/**
	 * Common path for outgoing JSON-RPC requests: queue pre-initialize traffic,
	 * gate on any in-flight reconnect (unless explicitly bypassed for the
	 * `reconnect` RPC itself), assign an id, register the pending deferred, and
	 * write to the wire.
	 *
	 * The reconnect-gate bypass exists because the `reconnect` request is sent
	 * from inside `_attemptReconnect` while the gate is engaged, so it can't
	 * wait on its own resolution.
	 */
	private async _dispatchRequest<TResult>(
		method: string,
		params: unknown,
		options: { readonly bypassInitializeQueue?: boolean; readonly allowIncompatibleUpgrade?: boolean; readonly bypassReconnectGate?: boolean } = {},
	): Promise<TResult> {
		if (this._state.kind === AgentHostClientState.Closed) {
			throw this._state.error;
		}
		if (this._state.kind === AgentHostClientState.Incompatible) {
			if (!options.allowIncompatibleUpgrade) {
				throw this._state.error;
			}
			const { request, result } = this._createRequest<TResult>(method, params);
			this._transport.send(request);
			return result;
		}
		if (!options.bypassInitializeQueue && isClientTransport(this._transport) && this._state.kind === AgentHostClientState.Connecting) {
			const { request, result } = this._createRequest<TResult>(method, params);
			this._state.outbox.push(request as ProtocolMessage);
			return result;
		}
		// Ride through any number of reconnect cycles until the client is
		// either Connected (proceed) or Closed (throw). A transient failed
		// attempt does NOT surface to the caller — the request stays gated
		// until the connection eventually resumes, matching how the
		// notification outbox rides across retries. A subsequent transport
		// drop that bounces us back into Reconnecting after the gate already
		// resolved is also handled here: the loop re-checks state on each
		// iteration so we never send on a dead/reconnecting transport.
		while (!options.bypassReconnectGate && this._state.kind === AgentHostClientState.Reconnecting) {
			const current = this._state as ClientState;
			if (current.kind !== AgentHostClientState.Reconnecting) {
				break;
			}
			try {
				await current.reconnect.gate.p;
			} catch {
				// Transient attempt failure — swallow and re-check state on the
				// next loop iteration. If we transitioned to Closed the check
				// after the loop surfaces the error; if we're still Reconnecting
				// with a fresh gate we'll await that one.
			}
		}
		const current = this._state as ClientState;
		if (current.kind === AgentHostClientState.Closed || current.kind === AgentHostClientState.Incompatible) {
			throw current.error;
		}

		const { request, result } = this._createRequest<TResult>(method, params);
		this._transport.send(request);
		return result;
	}

	private _createRequest<TResult>(method: string, params: unknown): { request: JsonRpcRequest; result: Promise<TResult> } {
		const id = this._nextRequestId++;
		const deferred = new DeferredPromise<unknown>();
		this._pendingRequests.set(id, { deferred, suppressNotFoundWarning: isFileResourceRead(method, params), sentAt: Date.now() });
		return {
			request: { jsonrpc: '2.0', id, method, params },
			result: deferred.p as Promise<TResult>,
		};
	}

	private _shouldLogFailedRequest(request: IPendingRequest, error: JsonRpcErrorResponse['error']): boolean {
		if (error.code === AhpErrorCodes.NotFound && request.suppressNotFoundWarning) {
			return false;
		}
		return true;
	}

	private _toProtocolError(error: JsonRpcErrorResponse['error']): ProtocolError {
		return new ProtocolError(error.code, error.message, error.data);
	}

	private _rejectPendingRequests(error: ProtocolError): void {
		for (const pending of this._pendingRequests.values()) {
			pending.deferred.error(error);
		}
		this._pendingRequests.clear();
	}

	/**
	 * Reset the liveness timers. Called at construction for an already-open
	 * passive transport, after a successful client-transport initialization,
	 * once on every received message (which is itself proof the remote is
	 * alive), and once after a successful soft reconnect.
	 *
	 * Two timers cooperate:
	 *
	 * 1. {@link _pingTimer} fires after {@link PING_INTERVAL_MS} of silence
	 *    and sends an application-level `ping` so the close timer has
	 *    something to time out on. Tolerates servers that don't implement
	 *    `ping` — the error response still resets both timers.
	 *
	 * 2. {@link _closeTimer} fires after {@link PING_INTERVAL_MS}+
	 *    {@link LIVENESS_TIMEOUT_MS} of continued silence and force-closes
	 *    the transport so the renderer's reconnect logic kicks in. Catches
	 *    silently-dead transports (e.g. SSH/tunnel after laptop sleep +
	 *    network change) that don't emit a socket close event of their own.
	 *
	 * After laptop sleep + wake the JS event loop is paused, so a timer
	 * armed before sleep fires immediately after wake. That's fine —
	 * any inbound message processed during the wake catch-up resets it
	 * before the close handler runs.
	 *
	 * No-op while {@link _state.kind} is {@link AgentHostClientState.Incompatible},
	 * {@link AgentHostClientState.Reconnecting}, or {@link AgentHostClientState.Closed}:
	 * the transport is not available for normal liveness traffic in those states.
	 */
	private _resetLivenessTimers(): void {
		this._cancelLivenessTimers();
		if (this._state.kind === AgentHostClientState.Incompatible
			|| this._state.kind === AgentHostClientState.Reconnecting
			|| this._state.kind === AgentHostClientState.Closed) {
			return;
		}
		this._pingTimer.cancelAndSet(() => this._onPingTimer(), PING_INTERVAL_MS);
		this._closeTimer.cancelAndSet(() => this._onCloseTimer(), PING_INTERVAL_MS + LIVENESS_TIMEOUT_MS);
	}

	private _cancelLivenessTimers(): void {
		this._pingTimer.cancel();
		this._closeTimer.cancel();
	}

	private _onPingTimer(): void {
		if (this._state.kind === AgentHostClientState.Incompatible
			|| this._state.kind === AgentHostClientState.Closed
			|| this._state.kind === AgentHostClientState.Reconnecting) {
			return;
		}
		// Fire-and-forget. The reply (or any other inbound message that
		// happens to arrive first) will reset both timers; if nothing
		// arrives, {@link _onCloseTimer} fires.
		void this.ping().catch(() => undefined);
	}

	private _onCloseTimer(): void {
		if (this._state.kind === AgentHostClientState.Incompatible
			|| this._state.kind === AgentHostClientState.Closed
			|| this._state.kind === AgentHostClientState.Reconnecting) {
			return;
		}
		if (this._transport.clientConnectionKind === AgentHostClientConnectionKind.Local) {
			// The main process reports actual child-process exits explicitly.
			return;
		}
		// {@link ILoadEstimator} guards against the *local* side of the
		// confusion: if our own JS event loop has been pegged we suppress
		// the close — the silence is on our end, not the remote's, and
		// tearing down the transport would just abort in-flight requests.
		// Re-arm only the close timer at {@link PING_INTERVAL_MS} so we
		// re-evaluate promptly once load normalizes (rather than waiting a
		// full PING_INTERVAL + LIVENESS_TIMEOUT window).
		if (this._loadEstimator.hasHighLoad()) {
			this._closeTimer.cancelAndSet(() => this._onCloseTimer(), PING_INTERVAL_MS);
			return;
		}
		const silence = Date.now() - this._lastReadTime;
		this._logService.info(
			`[RemoteAgentHostProtocol] Liveness: no message from ${this._address} for ${silence}ms; forcing close to trigger reconnect.`,
		);
		// Tear down the dead transport so it can't keep delivering messages
		// to a Reconnecting/Closed client (and, on the non-factory path,
		// so we don't leak a half-open socket waiting for client disposal).
		// WebSocketClientTransport.dispose() disposes its emitters
		// synchronously before the native close event arrives, so this
		// won't re-enter {@link _handleTransportClose}.
		this._transportListeners.clear();
		if (this._transportFactory) {
			// In factory mode, route directly through the soft-reconnect path.
			this._rejectPendingRequests(connectionTimeoutError(this._address, silence));
			this._handleTransportClose();
			return;
		}
		this._handleClose(connectionTimeoutError(this._address, silence));
	}

	/**
	 * Get the next client sequence number for optimistic dispatch.
	 */
	nextClientSeq(): number {
		return this._nextClientSeq++;
	}
}
