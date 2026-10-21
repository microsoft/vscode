/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createChatUriError } from '../common/agentHostChatMinting.js';
import { sandboxCertificateInstallationCapability, sandboxCertificateRemovalCapability, sandboxCertificateRotationCapability } from '../common/meta/agentSandboxCertificate.js';
import { InstallSandboxCertificateExtensionMethod, RemoveSandboxCertificateExtensionMethod, RotateSandboxCertificateExtensionMethod, sandboxCertificateParamsValidator } from '../common/sandboxCertificateProtocol.js';
import { disposableTimeout, raceCancellationError, raceTimeout, SequencerByKey } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { lstat, realpath, stat } from 'fs/promises';
import { parseSessionDbUri } from '../common/sessionDbUri.js';
import { parsePendingEditContentUri } from '../common/pendingEditContentUri.js';
import { parseGitBlobUri } from './gitDiffContent.js';
import { basename, dirname, relative, isAbsolute, resolve, sep } from '../../../base/common/path.js';
import { Schemas } from '../../../base/common/network.js';
import { deepClone, equals, mixin } from '../../../base/common/objects.js';
import { encodeBase64 } from '../../../base/common/buffer.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { isJsonRpcResponse } from '../../../base/common/jsonRpcProtocol.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { hasKey, isDefined } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AHPFileSystemProvider } from '../common/agentHostFileSystemProvider.js';
import { AgentHostClientType, getAgentHostClientType } from '../common/agentHostClientInfo.js';
import { AgentHostChatUrisCapabilityMetaKey, AgentHostNativeImplementationMetaKey, AgentHostSessionUrisCapabilityMetaKey, supportsAgentHostChatUris, supportsAgentHostSessionUris } from '../common/meta/agentHostSessionUrisMeta.js';
import { withSessionInitiator } from '../common/meta/agentSessionInitiatorMeta.js';
import { readChatWorkspaceValue, readCreateChatWorkspaceMeta } from '../common/meta/agentHostCreateChatWorkspaceMeta.js';
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind, readClientConnectionKind, readClientDevDeviceId, readClientMachineId, readClientTelemetryLevel, type IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import { AgentSession, COPILOT_CLI_AGENT_PROVIDER_ID, type IAgentCreateChatRequestOptions, type IAgentCreateChatWorkspace, type IAgentSessionMetadata, type IMcpNotification } from '../common/agent.js';
import type { IAgentHostAuthenticationScope, IAgentHostCredentialPrincipal, IAgentHostCredentialSource } from '../common/agentHostCredentials.js';
import { AgentHostAuthenticationScope } from './agentHostAuthenticationScope.js';
import { isManagedSettingsPermissions } from '../common/agentHostManagedSettings.js';
import { isAnnotationsUri } from '../common/annotationsUri.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { type IAgentService } from '../common/agentService.js';
import { CancelWorktreeDiskUsageExtensionMethod, cancelWorktreeDiskUsageParamsValidator, MeasureWorktreeDiskUsageExtensionMethod, measureWorktreeDiskUsageParamsValidator, MoveAgentHostSessionExtensionMethod, moveSessionParamsValidator, SetChatWorkspaceExtensionMethod, setChatWorkspaceParamsValidator, CompleteSavedChatContinuationExtensionMethod, completeSavedChatContinuationParamsValidator, CancelAgentHostDebugLogsExtensionMethod, ClaimAgentHostDetachedWorktreeExtensionMethod, collectAgentHostDebugLogsParamsValidator, CollectAgentHostDebugLogsExtensionMethod, CreateAgentHostDetachedWorktreeExtensionMethod, DeleteAgentHostDetachedWorktreeExtensionMethod, getAgentHostExtensionInitializeResultMeta, GetAgentHostSessionStateFileExtensionMethod, ImportSessionExtensionMethod, importSessionParamsValidator, ReadAgentHostDebugLogsChunkExtensionMethod, ReconcileAgentHostDetachedWorktreesExtensionMethod, RemoveSessionArtifactExtensionMethod, removeSessionArtifactParamsValidator, ReportAgentHostFirstResponseExtensionMethod, ReportChatUserInteractionExtensionMethod, RequestAgentHostMcpAuthenticationExtensionMethod, RequestAgentHostWorkspaceTrustExtensionMethod, SetAgentHostDetachedWorktreeArchivedExtensionMethod, StopBackgroundWorkExtensionMethod, stopBackgroundWorkParamsValidator, type IAgentHostExtensionInitializeResult, type IAgentHostExtensionServerCommandMap, type IAgentHostMcpAuthenticationRequest, type IAgentHostWorkspaceTrustRequest, ReadSavedChatExtensionMethod, readSavedChatParamsValidator } from '../common/agentHostExtensionProtocol.js';
import { savedChatToDto } from '../common/agentHostSavedChat.js';
import { IAgentHostOTelService } from '../common/otel/agentHostOTelService.js';
import { agentHostFirstResponseValidator } from '../common/otel/agentHostTiming.js';
import { chatUserInteractionAttributes, chatUserInteractionValidator } from '../../otel/common/chatUserInteraction.js';
import { isAgentDevContainerWorktreeHandle } from '../common/meta/agentDevContainerWorktreeMeta.js';
import { isActionEnvelopeRelevantToSubscriptionUris } from '../common/state/agentSubscription.js';
import { IS_CLIENT_DISPATCHABLE } from '../common/state/protocol/action-origin.generated.js';
import { ChatMoveDestinationKind, ChatSourceKind } from '../common/state/protocol/channels-chat/commands.js';
import { AgentChatMoveRefusedError, type AgentChatMoveDestination } from '../common/agentHostChatMove.js';
import type { CommandMap } from '../common/state/protocol/messages.js';
import type { ChatConfigChangedAction, SessionConfigChangedAction } from '../common/state/protocol/actions.js';
import type { AutomationEntry, RootConfigState } from '../common/state/protocol/state.js';
import { ActionEnvelope, ActionType, INotification, isAnnotationsAction, isAutomationAction, isAutomationRunAction, isChangesetAction, isChatAction, isSessionAction, isTerminalAction } from '../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../common/state/protocol/version/registry.js';
import { getAgentHostSupportedProtocolVersions, negotiateAgentHostProtocolVersion } from '../common/agentHostProtocolCompatibility.js';
import { VSCODE_UPGRADE_METHOD, type UnsupportedProtocolVersionErrorDataEx } from '../common/state/protocolUpgrade.js';
import { getAgentHostManagementSocketPath, requestAgentHostUpgrade } from './agentHostUpgradeChannel.js';
import {
	AHP_AUTH_REQUIRED,
	AhpErrorCodes,
	AHP_PROVIDER_NOT_FOUND,
	AHP_SESSION_NOT_FOUND,
	AHP_UNSUPPORTED_PROTOCOL_VERSION,
	JsonRpcRequest,
	isJsonRpcNotification,
	isJsonRpcRequest,
	JSON_RPC_INTERNAL_ERROR,
	JsonRpcErrorCodes,
	ProtocolError,
	type AhpServerNotification,
	type InitializeParams,
	type JsonRpcResponse,
	type ReconnectParams,
	type ReconnectResult,
	ReconnectResultType,
	type IStateSnapshot,
	type SubscribeResult,
	type ListSessionsResult,
	type DispatchActionParams,
} from '../common/state/sessionProtocol.js';
import { isShapedChatUri } from '../common/agentHostChatIdentity.js';
import { isAhpRootChannel, isAhpAutomationCatalogChannel, isAhpResourceWatchChannel, ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, isAhpChatChannel, withSessionStatusFlag, type ISessionWithDefaultChat, type Message, type ModelSelection, type RootState, type SessionState, type SessionConfigState, type SessionSummary } from '../common/state/sessionState.js';
import type { IProtocolServer, IProtocolTransport } from '../common/state/sessionTransport.js';
import { IAgentHostManagedSettingsService } from './agentHostManagedSettingsService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { AgentHostWorktreeDiskUsageCapabilityMetaKey } from '../common/meta/agentHostWorktreeDiskUsageMeta.js';
import {
	buildOtlpLogsChannelUri,
	extractLevelFromOtlpLogsUri,
	levelToSeverityNumber,
	OTLP_CHANNEL_SCHEME,
	OTLP_LOGS_CHANNEL_TEMPLATE,
	OtlpLogEmitter,
	toResourceLogsPayload,
	type IOtlpLogRecord,
	type OtlpLogLevelName,
} from '../common/otlp/otlpLogEmitter.js';
import { isFileResourceRead } from '../common/resourceReadLogging.js';
import { getAgentHostAhpLogDirectoryMeta } from '../common/meta/agentHostDebugLogsMeta.js';
import type { Implementation } from '../common/state/protocol/common/commands.js';
import { AGENT_HOST_CLIENT_CONNECTION_HISTORY_RETENTION, IAgentHostClientConnectionService, type IAgentHostClientConnectionSource } from './agentHostClientConnectionService.js';
import { AgentHostTelemetryReporter } from './agentHostTelemetryReporter.js';
import { isAgentHostTelemetryService } from './agentHostTelemetryService.js';
import { IDevContainerAgentHostMainService } from '../common/devContainerAgentHost.js';
import { DevContainerAgentHostProtocol } from './devContainerAgentHostProtocol.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { getErrorCode } from '../../../base/common/errors.js';
import { toPolicyResolutionErrorData } from '../common/meta/errorMeta.js';
import type { AuthRequiredErrorData } from '../common/state/protocol/common/errors.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { isChatInputRequestWithPlanReview } from '../common/agentHostPlanReview.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';

/** Default capacity of the server-side action replay buffer. */
const REPLAY_BUFFER_CAPACITY = 1000;

const CLIENT_TOOL_CALL_DISCONNECT_TIMEOUT = 30_000;

const CLIENT_ACTION_ACKNOWLEDGEMENT_TIMEOUT = 30_000;

const readOnlyConnectionMessage = localize('agentHost.readOnlyConnection', "This connection is read-only. You can view sessions, but you cannot create sessions, send messages, or make changes.");

/** Client actions whose state transition has no corresponding host-side behavior. */
const UNSUPPORTED_CLIENT_ACTION_TYPES: ReadonlySet<ActionType> = new Set([
	ActionType.ChatWorkingDirectorySet,
	ActionType.ChatWorkingDirectoryRemoved,
]);

/** Projects an agent session listing entry into the root-channel {@link SessionSummary} a `listSessions` reply carries. */
export function toListedSessionSummary(s: IAgentSessionMetadata): ListSessionsResult['items'][number] {
	const provider = s.provider ?? AgentSession.provider(s.session);
	if (!provider) {
		throw new Error(`Agent session URI has no provider scheme: ${s.session.toString()}`);
	}
	return {
		resource: s.session.toString(),
		provider,
		title: s.summary ?? 'Session',
		status: s.status ?? SessionStatus.Idle,
		activity: s.activity,
		createdAt: new Date(s.startTime).toISOString(),
		modifiedAt: new Date(s.modifiedTime).toISOString(),
		...(s.project ? { project: { uri: s.project.uri.toString(), displayName: s.project.displayName } } : {}),
		workingDirectories: s.workingDirectories?.map(d => d.toString()),
		changes: s.changes,
		chats: s.chats?.map(chat => ({
			resource: chat.chat.toString(),
			title: chat.summary ?? '',
			origin: chat.origin,
			...(chat.interactivity !== undefined ? { interactivity: chat.interactivity } : {}),
			// Forward the chat's activity bits so clients can present them without subscribing.
			...(chat.status !== undefined || chat.isRead !== undefined ? {
				status: withSessionStatusFlag(
					withSessionStatusFlag(chat.status ?? SessionStatus.Idle, SessionStatus.IsArchived, chat.archived === true),
					SessionStatus.IsRead,
					chat.isRead ?? (chat.status !== undefined && (chat.status & SessionStatus.IsRead) === SessionStatus.IsRead),
				),
			} : {}),
			...(chat.archived === true ? { archived: true } : {}),
			...(chat.changes !== undefined ? { changes: chat.changes } : {}),
		})),
		defaultChat: s.chats?.find(chat => chat.kind === 'default')?.chat.toString(),
		// `_meta` carries durable host provenance, including session kind
		// and provider-native discovery provenance.
		...(s._meta !== undefined ? { _meta: s._meta } : {}),
	};
}

/** A client tool call in any of these statuses is still awaiting its result. */
function isPendingToolCallStatus(status: ToolCallStatus): boolean {
	return status === ToolCallStatus.Streaming
		|| status === ToolCallStatus.Running
		|| status === ToolCallStatus.PendingConfirmation;
}

/** Build a JSON-RPC success response suitable for transport.send(). */
function jsonRpcSuccess(id: number, result: unknown): JsonRpcResponse {
	return { jsonrpc: '2.0', id, result };
}

/** Build a JSON-RPC error response suitable for transport.send(). */
function jsonRpcError(id: number, code: number, message: string, data?: unknown): JsonRpcResponse {
	return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

/** Build a JSON-RPC error response from an unknown thrown value, preserving {@link ProtocolError} fields. */
function jsonRpcErrorFrom(id: number, err: unknown): JsonRpcResponse {
	if (err instanceof ProtocolError) {
		return jsonRpcError(id, err.code, err.message, err.data);
	}
	if (err instanceof Error && getErrorCode(err) === 'policyResolutionFailed') {
		return jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, err.message, toPolicyResolutionErrorData());
	}
	const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
	return jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, message);
}

/** AHP has no cancellation-specific code, but a cancelled request still needs an error response. */
class SubscriptionCancelledError extends ProtocolError {
	constructor(channel: string) {
		super(JSON_RPC_INTERNAL_ERROR, `Subscription cancelled: ${channel}`);
	}
}

/**
 * A chat or session move the host refused (Block 4): an expected outcome, not a failure. Clients read `reason` from
 * `data`; the request is logged at info, without a stack.
 */
class ChatMoveRefusedProtocolError extends ProtocolError {
	constructor(readonly refusal: AgentChatMoveRefusedError) {
		super(JsonRpcErrorCodes.InvalidParams, refusal.message, { reason: refusal.reason });
	}
}

/** Logs a failed request: an expected move refusal at info, anything else at error. */
/**
 * A chat workspace the host refused or failed to apply: the client gets the message only, never the stack. The request
 * is logged with the original error and its stack.
 */
class ChatWorkspaceProtocolError extends ProtocolError {
	constructor(readonly original: Error) {
		super(JSON_RPC_INTERNAL_ERROR, original.message);
	}
}

/** Runs a request that applies a chat workspace, so a failure reaches the client as a {@link ChatWorkspaceProtocolError}. */
async function withChatWorkspaceErrors<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch (error) {
		if (error instanceof Error && !(error instanceof ProtocolError) && getErrorCode(error) !== 'policyResolutionFailed') {
			throw new ChatWorkspaceProtocolError(error);
		}
		throw error;
	}
}

function logFailedRequest(logService: ILogService, message: string, error: unknown): void {
	if (error instanceof ChatMoveRefusedProtocolError) {
		logService.info(`${message}: refused (${error.refusal.reason}): ${error.message}`);
	} else if (error instanceof ChatWorkspaceProtocolError) {
		logService.error(message, error.original);
	} else {
		logService.error(message, error);
	}
}

function shouldLogFailedRequest(method: string, params: unknown, err: unknown): boolean {
	if (!(err instanceof ProtocolError) || err.code !== AhpErrorCodes.NotFound || !isFileResourceRead(method, params)) {
		return true;
	}
	return false;
}

/** True when `value` is a non-null params object (as opposed to an array or primitive). */
function isParamsObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withoutConfigOverlay(values: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
	const result = { ...values };
	for (const [key, owned] of Object.entries(overlay)) {
		const value = result[key];
		if (isParamsObject(owned) && isParamsObject(value)) {
			const remaining = withoutConfigOverlay(value, owned);
			if (Object.keys(remaining).length > 0) {
				result[key] = remaining;
				continue;
			}
		}
		delete result[key];
	}
	return result;
}

function isDispatchActionParams(value: unknown): value is DispatchActionParams {
	return isParamsObject(value) && typeof value.channel === 'string' && Number.isSafeInteger(value.clientSeq)
		&& isParamsObject(value.action) && typeof value.action.type === 'string';
}

function isHandledClientAction(action: DispatchActionParams['action']): action is Parameters<IAgentService['dispatchAction']>[1] {
	return IS_CLIENT_DISPATCHABLE[action.type] === true
		&& (isSessionAction(action) || isChatAction(action) || isTerminalAction(action) || isChangesetAction(action) || isAnnotationsAction(action) || isAutomationAction(action) || isAutomationRunAction(action) || action.type === ActionType.RootConfigChanged);
}

/**
 * Returns the `channel` URI carried on a request's params when it is an
 * `mcp://` channel — the AHP routing envelope for raw MCP requests
 * tunnelled over the JSON-RPC connection. Returns `undefined` for any
 * other params shape.
 */
function readMcpChannel(params: unknown): string | undefined {
	if (!isParamsObject(params)) {
		return undefined;
	}
	const channel = params['channel'];
	if (typeof channel !== 'string' || !channel.startsWith('mcp://')) {
		return undefined;
	}
	return channel;
}

function requiresRelayAuthentication(method: string, params: unknown): boolean {
	switch (method) {
		case 'authenticate':
		case 'listSessions':
		case 'resolveSessionConfig':
		case 'sessionConfigCompletions':
		case 'extensions/listProjects':
		case 'unsubscribe':
			return false;
		case 'subscribe':
			return !isParamsObject(params) || typeof params.channel !== 'string' || !isAhpRootChannel(params.channel);
		default:
			return true;
	}
}

function withholdSessionSummaryDetails<T extends { [K in '_meta' | 'chats' | 'defaultChat']?: SessionSummary[K] | null }>(summary: T): Omit<T, '_meta' | 'chats' | 'defaultChat'> {
	const { _meta, chats, defaultChat, ...basic } = summary;
	return basic;
}

function projectDiscoveryAgents(agents: RootState['agents']): RootState['agents'] {
	return agents.map(agent => ({
		provider: agent.provider,
		displayName: agent.displayName,
		description: agent.description,
		models: agent.models,
		protectedResources: agent.protectedResources,
		capabilities: agent.capabilities,
	}));
}

/**
 * Methods handled by the request dispatcher. Excludes `initialize`,
 * `reconnect`, and `ping`, which are handled directly during message
 * dispatch without requiring an established client context.
 */
type RequestMethod = Exclude<keyof CommandMap, 'initialize' | 'reconnect' | 'ping'>;

/**
 * Typed handler map: each key is a request method, each value is a handler
 * that receives the correctly-typed params and must return the correctly-typed
 * result. The compiler will error if a handler returns the wrong shape.
 */
type RequestHandlerMap = {
	[M in RequestMethod]: (client: IConnectedClient, params: CommandMap[M]['params']) => Promise<CommandMap[M]['result']>;
};

type RequestResultProjectorMap = {
	[M in RequestMethod]?: (client: IConnectedClient, result: CommandMap[M]['result']) => CommandMap[M]['result'];
};

/**
 * Discriminant for {@link ChannelSubscription}. Distinguishes a regular
 * state-bearing channel (root, session, terminal, changeset) from the
 * stateless OTLP signal channels so each subscribe/unsubscribe path can
 * dispatch through a single typed lookup.
 */
const enum ChannelKind {
	/**
	 * Subscribed via {@link IAgentService.subscribe} and tracked by the
	 * server-side refcount. Carries replayable state, participates in
	 * action broadcasts ({@link _broadcastAction}) and reconnect
	 * snapshot/replay.
	 */
	State = 'state',
	/**
	 * Resource-watch channels (`ahp-resource-watch:/<id>`). Tracked
	 * separately so subscribe/unsubscribe routes through the agent
	 * service's per-watch refcount + grace timer rather than the
	 * session-shaped {@link IAgentService.subscribe} path.
	 */
	ResourceWatch = 'resource-watch',
	/**
	 * Subscribed against the OTLP logs channel template advertised in
	 * {@link InitializeResult.telemetry}. Stateless — no snapshot, no
	 * agent-service refcount. The `level` field records the minimum
	 * severity the client asked to receive.
	 */
	OtlpLogs = 'otlp-logs',
}

/**
 * Per-channel server-side subscription record. Stored on every
 * {@link IConnectedClient} so each subscribed channel can be routed by
 * its `kind` without re-deriving it from the URI on every dispatch.
 *
 * `uri` is the canonical channel URI string used everywhere a subscription
 * is referenced — the same string is broadcast on outbound notifications
 * and persists across reconnects. State subscriptions remain inactive while
 * their baseline snapshot is resolving so disconnect can cancel them without
 * exposing pre-snapshot actions to the client.
 */
type ChannelSubscription =
	| { readonly kind: ChannelKind.State; readonly uri: string; readonly active: boolean }
	| { readonly kind: ChannelKind.ResourceWatch; readonly uri: string; readonly active: boolean }
	| { readonly kind: ChannelKind.OtlpLogs; readonly uri: string; readonly level: OtlpLogLevelName };

function projectCopilotModel(model: ModelSelection, vscode: boolean): ModelSelection {
	if (!model.config) {
		return model;
	}
	const config = { ...model.config };
	for (const [key, alias] of [['thinkingLevel', 'reasoningEffort'], ['tier', 'autoTier']]) {
		const source = vscode ? alias : key;
		const target = vscode ? key : alias;
		if (Object.hasOwn(config, source)) {
			// Match the runtime's legacy-key precedence, including persisted selections with both spellings.
			config[target] = config[key] ?? config[alias] ?? config[source];
			delete config[source];
		}
	}
	return { ...model, config };
}

function projectCopilotMessage(message: Message, vscode: boolean): Message {
	return message?.model ? { ...message, model: projectCopilotModel(message.model, vscode) } : message;
}

function projectCopilotTurn<T extends { message: Message }>(turn: T, vscode: boolean): T {
	return { ...turn, message: projectCopilotMessage(turn.message, vscode) };
}

function projectCopilotAutomation(automation: AutomationEntry, vscode: boolean): AutomationEntry {
	const { definition } = automation;
	if (definition.session.provider !== COPILOT_CLI_AGENT_PROVIDER_ID) {
		return automation;
	}
	return {
		...automation,
		definition: {
			...definition,
			message: projectCopilotMessage(definition.message, vscode),
			session: {
				...definition.session,
				...(definition.session.model ? { model: projectCopilotModel(definition.session.model, vscode) } : {}),
			},
		},
	};
}

/**
 * Represents a connected protocol client with its subscription state.
 */
interface IConnectedClient {
	authenticationScope?: IAgentHostAuthenticationScope;
	readonly legacySessionUris: boolean;
	/** A positively identified VS Code client without `vscode.ahpChatUris`: it sees shaped chats only. */
	readonly legacyChatUris: boolean;
	devContainers?: DevContainerAgentHostProtocol;
	readonly clientId: string;
	readonly clientInfo: Implementation | undefined;
	readonly telemetryContext: IAgentHostClientTelemetryContext;
	readonly protocolVersion: string;
	readonly transport: IProtocolTransport;
	readonly connectionStopWatch: StopWatch;
	readonly isReconnect: boolean;
	telemetryConnectionActive: boolean;
	/**
	 * Every channel the client is currently subscribed to, keyed by the
	 * canonical channel URI. OTLP channel URIs are canonicalised to
	 * `buildOtlpLogsChannelUri(level)` so URI variants that resolve to
	 * the same logical channel collapse to one entry.
	 */
	readonly subscriptions: Map<string, ChannelSubscription>;
	readonly knownSessionSummaries: Set<string>;
	readonly pendingAuthenticationSubscriptions: Set<string>;
	readonly disposables: DisposableStore;
	readonly initializationDisposables: DisposableStore;
}

/**
 * Per-client server-side record, keyed by clientId in
 * {@link ProtocolServerHandler._clients}. Unlike {@link IConnectedClient},
 * the record OUTLIVES individual transports: multiple overlapping transports
 * for the same logical client are held oldest-first, with the active transport
 * at the end. When the last transport disconnects, the record is retained
 * (until pruned) so the tool-call disconnect-grace machinery can compute the
 * remaining window and hold any armed timeouts.
 *
 * A client is in exactly one of two states, which makes the core invariant
 * unrepresentable in the wrong shape: a client either has one or more live
 * transports ({@link IActiveClientRecord}, never any disconnect-grace timers)
 * or has no transport and is within its disconnect-grace window
 * ({@link IGraceClientRecord}, never any connections). Transitions happen only
 * in {@link ProtocolServerHandler._attachConnection} (→ active, which disposes
 * any grace timers) and the transport `onClose` handler (→ grace, once the last
 * transport is gone).
 */
type IClientRecord = IActiveClientRecord | IGraceClientRecord;

interface IActiveClientRecord {
	readonly state: 'active';
	clientInfo: Implementation | undefined;
	/**
	 * Live transports for this client, oldest first. The active connection is
	 * the last entry (most recent wins). Older entries are kept so that if a
	 * reconnecting client registers `A`, then `B`, then `B` closes first, we can
	 * fall back to `A` instead of treating the client as disconnected. Never
	 * empty: removing the last transport promotes the record to a grace record.
	 */
	readonly connections: IConnectedClient[];
}

interface IGraceClientRecord {
	readonly legacySessionUris?: boolean;
	readonly legacyChatUris?: boolean;
	readonly state: 'grace';
	readonly seenConnection: boolean;
	readonly clientInfo: Implementation | undefined;
	readonly telemetryContext: IAgentHostClientTelemetryContext | undefined;
	readonly protocolVersion: string | undefined;
	/**
	 * Epoch ms when the client last had a live transport, or when this record
	 * was created for a never-connected orphan tool-call stamp. Pins the grace
	 * clock so re-arms triggered by later orphaned tool calls shrink the
	 * remaining window instead of resetting it. Drives the disconnect-timeout
	 * delay (residual window from this instant).
	 */
	lastSeenAt: number;
	/**
	 * Pending tool-call disconnect timeouts owned by this client, keyed by
	 * session URI. Armed when the client owns a pending client tool call but is
	 * not connected; fires a failing completion if it does not (re)connect
	 * within the grace window. Reconnecting promotes the record to active and
	 * disposes these timers (the grace window no longer applies once a transport
	 * is live). Disposing an entry (or the whole map) clears the timer.
	 */
	readonly disconnectTimeouts: DisposableMap<string>;
}

/**
 * Classifies a raw channel URI string into its {@link ChannelKind} and
 * returns the canonical URI to key subscriptions by. Returns `undefined`
 * when the channel is OTLP-flavoured but the URI does not parse into a
 * supported shape (unknown level, missing path) so the caller can
 * silently drop the subscribe rather than installing a broken entry.
 *
 * For state channels the canonical URI is just the input verbatim — the
 * agent service is the authoritative deduplication point and tolerates
 * whatever URI form the client sent.
 */
function classifyChannel(channel: string): ChannelSubscription | undefined {
	if (channel.toLowerCase().startsWith(`${OTLP_CHANNEL_SCHEME}:`)) {
		const level = extractLevelFromOtlpLogsUri(channel);
		if (!level) {
			return undefined;
		}
		return { kind: ChannelKind.OtlpLogs, uri: buildOtlpLogsChannelUri(level), level };
	}
	if (isAhpResourceWatchChannel(channel)) {
		return { kind: ChannelKind.ResourceWatch, uri: channel, active: true };
	}
	return { kind: ChannelKind.State, uri: channel, active: true };
}

/**
 * Listener-specific session configuration vocabulary; authoritative state remains host-native.
 */
export interface ISessionConfigAdapter {
	fromClientValues(values: Record<string, unknown>): Record<string, unknown>;
	fromClientValues(values: Record<string, unknown> | undefined): Record<string, unknown> | undefined;
	fromClientProperty(property: string): string;
	toClientConfig(config: SessionConfigState): SessionConfigState;
	/** Translates config values without a schema, such as a chat's own values. */
	toClientValues(values: Record<string, unknown>): Record<string, unknown>;
	/** Rejections may need to retain the client's original values for optimistic reconciliation. */
	toClientAction<T extends SessionConfigChangedAction | ChatConfigChangedAction>(action: T, rejected: boolean): T;
}

export interface IProtocolServerExtensionRequest {
	readonly readOnly: boolean;
	readonly requiresChannel?: boolean;
	handle(params: unknown, checkAuthorization: () => void, credentials?: IAgentHostCredentialSource): Promise<unknown>;
}

/** Listener-owned extensions exposed to authenticated relay clients. */
export interface IProtocolServerExtension {
	readonly requests: ReadonlyMap<string, IProtocolServerExtensionRequest>;
	/** Public capability metadata, also advertised before authentication. */
	readonly rootMeta: Record<string, unknown>;
	/** Listener-owned configuration overlaid onto the relay's host configuration, including before authentication. */
	readonly rootConfig: RootConfigState;
	/** Already-sequenced, listener-owned actions that do not update shared host configuration. */
	readonly onDidEmitAction: Event<ActionEnvelope>;
	initialize(): Promise<void>;
}

/**
 * Configuration for protocol-level concerns outside of IAgentService.
 */
export interface IProtocolServerConfig {
	readonly scopedRelayCredentials?: boolean;
	/** Trusted listener-owned delegation, applied only after validating the relay credential. */
	readonly resolveRelayCredentials?: (principal: IAgentHostCredentialPrincipal, resource: string) => Promise<IAgentHostCredentialSource | undefined>;
	/** Process launcher that owns this agent host. */
	readonly hostLaunchKind?: AgentHostLaunchKind;

	/** Default directory advertised to clients and used for relay sessions when no working directory is supplied. */
	readonly defaultDirectory?: string;
	/**
	 * Whether to expose VS Code host-control methods outside the Agent Host
	 * Protocol. Defaults to `true` for existing remote listeners. Session-data
	 * methods such as `vscode/removeSessionArtifact` are always available.
	 */
	readonly allowExtensionMethods?: boolean;
	/** Restricts experimental relay clients to explicitly granted local roots. */
	readonly relayRoots?: readonly string[];
	readonly relayRootMeta?: Record<string, unknown>;
	/** Host-owned Mission Control wire logs, readable through the normal resource authorization checks. */
	readonly ahpLogDirectory?: URI;
	/** When set, only these providers' model lists are advertised on this server's ingress. */
	readonly advertisedModelProviders?: readonly string[];
	readonly sessionConfigAdapter?: ISessionConfigAdapter;
	/** Filters session summaries in discovery responses and catalogue notifications for this listener. */
	readonly sessionSummaryFilter?: (summary: SessionSummary) => boolean;
	/** Projects visible, current session summaries for this listener's listSessions responses. */
	readonly sessionListAdapter?: (sessions: readonly SessionSummary[]) => SessionSummary[];
	/** Locally known workspace/content roots exposed to relay clients. */
	readonly relayResourceRoots?: (readOnly: boolean) => readonly string[];
	readonly extension?: IProtocolServerExtension;
	/**
	 * Characters that, when typed in a {@link UserMessage} input, SHOULD
	 * cause the client to issue a `completions` request. Announced to
	 * clients in the `initialize` response.
	 */
	readonly completionTriggerCharacters?: readonly string[];
	/**
	 * Prefix that marks a user message as a host terminal command.
	 */
	readonly terminalCommandPrefix?: string;
	/**
	 * Optional emitter to use as the source for the OTLP logs channel
	 * advertised via `InitializeResult.telemetry.logs`. When present, this
	 * handler will route `subscribe`/`unsubscribe` requests on
	 * `ahp-otlp:` channels to its internal OTLP subscription registry and
	 * broadcast every record fed into the emitter as an
	 * `otlp/exportLogs` notification. When absent, the OTLP channel is
	 * not advertised and any inbound `ahp-otlp:` subscribe request is
	 * rejected.
	 */
	readonly otlpLogEmitter?: OtlpLogEmitter;
}

/**
 * Server-side handler that manages protocol connections, routes JSON-RPC
 * messages to the agent service, and broadcasts actions/notifications
 * to subscribed clients.
 */
export class ProtocolServerHandler extends Disposable implements IAgentHostClientConnectionSource {

	/**
	 * Per-client records keyed by clientId. Holds both connected clients
	 * (`connections` non-empty) and recently-disconnected ones retained for the
	 * tool-call disconnect-grace window (`connections.length === 0`). See
	 * {@link IClientRecord}.
	 */
	private readonly _clients = new Map<string, IClientRecord>();
	private readonly _relayClientDispatchSequencer = new SequencerByKey<string>();
	/**
	 * State channels a client is subscribed to but has never been given a
	 * baseline snapshot for by THIS server process, keyed by clientId.
	 *
	 * `initialize` registers a state channel even when its snapshot has not
	 * materialized yet (see {@link _addInitialSubscription}), so a client can
	 * hold a live subscription with no state behind it. Replaying deltas onto
	 * that void silently strands the channel on whatever the client last saw —
	 * across a host restart that is pre-restart state, which is how an
	 * already-finished turn can render as perpetually running. Reconnect
	 * consults this to force a snapshot response for such channels.
	 */
	private readonly _baselineDebt = new Map<string, Set<string>>();
	private readonly _replayBuffer: ActionEnvelope[] = [];
	private readonly _extensionEnvelopes = new WeakSet<ActionEnvelope>();
	private readonly _relayRootConfigEnvelopes = new WeakMap<ActionEnvelope, ActionEnvelope>();
	private readonly _telemetryReporter: AgentHostTelemetryReporter;
	private readonly _managedSettingsOwnerId = generateUuid();
	private readonly _connectionDisposables = this._register(new DisposableMap<IProtocolTransport, DisposableStore>());

	private readonly _onDidChangeConnectionCount = this._register(new Emitter<number>());

	/** Fires with the current client count whenever a client connects or disconnects. */
	readonly onDidChangeConnectionCount = this._onDidChangeConnectionCount.event;

	constructor(
		private readonly _agentService: IAgentService,
		private readonly _stateManager: AgentHostStateManager,
		private readonly _server: IProtocolServer,
		private readonly _config: IProtocolServerConfig,
		private readonly _clientFileSystemProvider: AHPFileSystemProvider,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAgentHostManagedSettingsService private readonly _managedSettingsService: IAgentHostManagedSettingsService,
		@IAgentHostClientConnectionService private readonly _clientConnections: IAgentHostClientConnectionService,
		@IDevContainerAgentHostMainService private readonly _devContainerService: IDevContainerAgentHostMainService,
		@IAgentHostOTelService private readonly _otelService: IAgentHostOTelService,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
	) {
		super();
		this._telemetryReporter = new AgentHostTelemetryReporter(this._telemetryService);
		this._register(this._clientConnections.registerSource(this));

		this._register(this._server.onConnection(transport => {
			this._handleNewConnection(transport);
		}));

		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			this._recordAndBroadcastAction(envelope);
			// A client tool call may be issued for a client that is no longer
			// connected — e.g. a stale stamp from a window that reloaded. The
			// live-disconnect path (`_handleClientDisconnected`) does not cover
			// these because no disconnect event fires for an already-gone
			// client. Detect the orphan at issuance time and arm the same
			// grace-period timeout so the call cannot hang forever. Calls
			// stamped while no client is connected are failed immediately by
			// the provider, so they never reach this path.
			if (envelope.action.type === ActionType.ChatToolCallStart || envelope.action.type === ActionType.ChatToolCallReady) {
				if (!isAhpChatChannel(envelope.channel)) {
					throw new Error(`[ProtocolServer] Chat tool-call action emitted on non-chat channel: ${envelope.channel}`);
				}
				const owner = this._chatOwnership.getChatOwner(envelope.channel);
				if (owner !== undefined) {
					this._checkOrphanedClientToolCalls(owner, envelope.channel);
				}
			}
		}));
		this._register(this._stateManager.onDidRejectClientAction(envelope => this._recordAndBroadcastAction(envelope)));
		if (this._config.extension) {
			this._register(this._config.extension.onDidEmitAction(envelope => {
				this._recordAndBroadcastAction(envelope, true);
			}));
		}

		this._register(this._stateManager.onDidEmitNotification(notification => {
			this._broadcastNotification(notification);
		}));

		this._register(this._agentService.onMcpNotification(notification => {
			this._broadcastMcpNotification(notification);
		}));

		if (this._config.otlpLogEmitter) {
			this._register(this._config.otlpLogEmitter.onDidLog(record => this._broadcastOtlpLog(record)));
		}
	}

	// ---- Connection handling -------------------------------------------------

	private _handleNewConnection(transport: IProtocolTransport): void {
		const disposables = new DisposableStore();
		this._connectionDisposables.set(transport, disposables);
		let client: IConnectedClient | undefined;

		if (transport.onDidRelayAuthenticationExpire) {
			disposables.add(transport.onDidRelayAuthenticationExpire(() => {
				const record = client ? this._clients.get(client.clientId) : undefined;
				if (client && record?.state === 'active') {
					this._releaseClientSubscriptions(client, record, true);
					this._reconcileActiveClientSubscriptions(client);
					this._rejectPendingReverseRequestsForConnection(client, new ProtocolError(AHP_AUTH_REQUIRED, 'Relay identity authentication expired'));
				}
			}));
		}

		disposables.add(transport.onMessage(msg => {
			if (isJsonRpcRequest(msg)) {
				this._logService.trace(`[ProtocolServer] request: method=${msg.method} id=${msg.id}`);

				// Ping is stateless and MUST be answerable regardless of whether
				// the connection has been initialized. Carries no payload — the
				// round-trip itself is the liveness signal.
				if (msg.method === 'ping') {
					transport.send(jsonRpcSuccess(msg.id, null));
					return;
				}

				// Handle initialize/reconnect as requests that set up the client
				if (!client && msg.method === 'initialize') {
					try {
						const result = this._handleInitialize(msg.params, transport, disposables);
						client = result.client;
						const sendInitializeResult = (response: IAgentHostExtensionInitializeResult) => {
							if (!disposables.isDisposed) {
								transport.send(jsonRpcSuccess(msg.id, { ...response, snapshots: this._projectRelaySnapshots(result.client, response.snapshots) }));
							}
						};
						if (result.response instanceof Promise) {
							this._trackRequest(result.response).then(
								sendInitializeResult,
								err => {
									if (client === result.client) {
										client = undefined;
									}
									if (!disposables.isDisposed) {
										transport.send(jsonRpcErrorFrom(msg.id, err));
									}
								},
							);
						} else {
							sendInitializeResult(result.response);
						}
					} catch (err) {
						transport.send(jsonRpcErrorFrom(msg.id, err));
					}
					return;
				}
				if (!client && msg.method === 'reconnect') {
					let responsePromise: Promise<ReconnectResult>;
					let reconnectingClient: IConnectedClient;
					try {
						const result = this._handleReconnect(msg.params, transport, disposables);
						client = result.client;
						reconnectingClient = result.client;
						responsePromise = this._trackRequest(result.responsePromise);
						responsePromise.then(
							response => {
								if (!disposables.isDisposed) {
									transport.send(jsonRpcSuccess(msg.id, this._projectRelayReconnectResult(reconnectingClient, response, msg.params.subscriptions)));
								}
							},
							err => {
								if (client === reconnectingClient) {
									client = undefined;
								}
								if (!disposables.isDisposed) {
									transport.send(jsonRpcErrorFrom(msg.id, err));
								}
							},
						);
					} catch (err) {
						transport.send(jsonRpcErrorFrom(msg.id, err));
					}
					return;
				}

				// The VS Code upgrade request rides on the same transport but
				// is callable pre-`initialize`: by definition we get here when
				// the client's protocol version was rejected, so the client
				// never managed to complete the handshake.
				if ((msg.method as string) === VSCODE_UPGRADE_METHOD) {
					if (transport.relayClientId !== undefined) {
						transport.send(jsonRpcError(msg.id, JsonRpcErrorCodes.MethodNotFound, 'Host management is unavailable to relay clients'));
						return;
					}
					this._handleVscodeUpgrade(msg.id, transport);
					return;
				}

				if (!client) {
					transport.send(jsonRpcError(msg.id, JsonRpcErrorCodes.MethodNotFound, `Method not found: ${msg.method}`));
					return;
				}
				this._handleRequest(client, msg.method, msg.params, msg.id);
			} else if (isJsonRpcNotification(msg)) {
				this._logService.trace(`[ProtocolServer] notification: method=${msg.method}`);
				if (this._config.relayRoots && msg.method !== 'unsubscribe') {
					return;
				}
				if ((msg as { method: string }).method === 'setClientManagedSettingsPermissions') {
					if (transport.relayClientId !== undefined) {
						this._logService.warn('[ProtocolServer] Relay clients cannot change host managed permissions');
						return;
					}
					if (client) {
						const permissions = ((msg as { params?: { permissions?: unknown } }).params)?.permissions;
						if (isManagedSettingsPermissions(permissions)) {
							this._managedSettingsService.setClientPermissions(this._managedSettingsContributionId(client.clientId), permissions);
						} else {
							this._logService.warn('[ProtocolServer] Ignoring invalid managed settings permissions contribution.');
						}
					}
					return;
				}
				// Notification — fire-and-forget
				switch (msg.method) {
					case 'unsubscribe':
						if (client) {
							this._removeSubscription(client, msg.params.channel);
						}
						break;
					case 'dispatchAction':
						if (client) {
							const pending = this._dispatchClientAction(client, msg.params);
							if (pending) {
								this._trackRequest(pending).catch(error => this._logService.error('[ProtocolServer] Notification dispatch failed', error));
							}
						}
						break;
				}
			} else if (isJsonRpcResponse(msg)) {
				const pending = this._pendingReverseRequests.get(msg.id);
				if (pending && pending.client === client) {
					this._pendingReverseRequests.delete(msg.id);
					if (hasKey(msg, { error: true })) {
						pending.reject(new ProtocolError(
							msg.error?.code ?? -32000,
							msg.error?.message ?? 'Reverse RPC error',
							msg.error?.data,
						));
					} else {
						pending.resolve(msg.result);
					}
				}
			}
		}));

		disposables.add(transport.onClose(() => {
			const record = client ? this._clients.get(client.clientId) : undefined;
			if (client && record?.state === 'active') {
				const connectionIndex = record.connections.indexOf(client);
				if (connectionIndex !== -1) {
					const subscriptionCount = client.subscriptions.size;
					record.connections.splice(connectionIndex, 1);
					this._releaseClientSubscriptions(client, record);
					this._rejectPendingReverseRequestsForConnection(client);
					if (record.connections.length === 0) {
						this._logService.info(`[ProtocolServer] Client disconnected: ${client.clientId}, subscriptions=${subscriptionCount}`);
						this._clients.set(client.clientId, {
							state: 'grace',
							seenConnection: true,
							legacySessionUris: client.legacySessionUris,
							legacyChatUris: client.legacyChatUris,
							clientInfo: record.clientInfo,
							telemetryContext: client.telemetryContext,
							protocolVersion: client.protocolVersion,
							lastSeenAt: Date.now(),
							disconnectTimeouts: new DisposableMap(),
						});
						this._handleClientDisconnected(client.clientId);
						this._onDidChangeConnectionCount.fire(this._connectedClientCount);
					}
					this._reportClientDisconnected(client, subscriptionCount);
				}
			}
			this._connectionDisposables.deleteAndDispose(transport);
		}));

		disposables.add(transport);
	}

	// ---- Handshake handlers ----------------------------------------------------

	private _handleInitialize(
		params: InitializeParams,
		transport: IProtocolTransport,
		disposables: DisposableStore,
	): { client: IConnectedClient; response: IAgentHostExtensionInitializeResult | Promise<IAgentHostExtensionInitializeResult> } {
		this._verifyRelayClient(transport, params.clientId);
		if (this._config.relayRoots && params.initialSubscriptions?.some(channel => !isAhpRootChannel(channel))) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Relay subscriptions are not available in this prototype');
		}
		const offered = Array.isArray(params.protocolVersions) ? params.protocolVersions : [];
		this._logService.info(`[ProtocolServer] Initialize: clientId=${params.clientId}, protocolVersions=[${offered.join(', ')}]`);

		const negotiated = negotiateAgentHostProtocolVersion(offered);
		if (!negotiated) {
			const supportedVersions = getAgentHostSupportedProtocolVersions();
			const data: UnsupportedProtocolVersionErrorDataEx = {
				supportedVersions,
				// Only advertise the in-band upgrade method when the agent
				// host was spawned by a VS Code CLI that is listening for
				// management requests (presence of the env var). Otherwise
				// there is no supervisor to actually act on it, so don't
				// lie to the client.
				_meta: getAgentHostManagementSocketPath()
					? { vscodeUpgradeMethod: VSCODE_UPGRADE_METHOD }
					: undefined,
			};
			throw new ProtocolError(
				AHP_UNSUPPORTED_PROTOCOL_VERSION,
				`Client offered protocol versions [${offered.join(', ')}], none of which are compatible with this server's version ${PROTOCOL_VERSION} (server accepts ${supportedVersions.join(', ')}).`,
				data,
			);
		}

		const previousRecord = this._clients.get(params.clientId);
		this._applyClientTelemetryLevel(params._meta);
		const initializationDisposables = disposables.add(new DisposableStore());
		const telemetryContext = this._createClientTelemetryContext(params.clientInfo, params._meta, transport);
		const client: IConnectedClient = {
			legacySessionUris: getAgentHostClientType(params.clientInfo) !== AgentHostClientType.Unknown && !supportsAgentHostSessionUris(params),
			legacyChatUris: getAgentHostClientType(params.clientInfo) !== AgentHostClientType.Unknown && !supportsAgentHostChatUris(params),
			clientId: params.clientId,
			clientInfo: params.clientInfo,
			telemetryContext,
			protocolVersion: negotiated,
			transport,
			connectionStopWatch: StopWatch.create(true),
			isReconnect: this._clientConnections.hasSeenClient(params.clientId),
			telemetryConnectionActive: false,
			subscriptions: new Map(),
			knownSessionSummaries: new Set(),
			pendingAuthenticationSubscriptions: new Set(),
			disposables,
			initializationDisposables,
		};
		this._attachConnection(params.clientId, client);
		try {
			this._initializeDevContainers(client);
			this._registerClientFileSystemAuthority(params.clientId, initializationDisposables);

			const snapshots: IStateSnapshot[] = [];
			const pendingSnapshots: Promise<void>[] = [];
			if (params.initialSubscriptions) {
				for (const uri of params.initialSubscriptions) {
					if (transport.relayAuthentication?.authenticated === false && !isAhpRootChannel(uri)) {
						continue;
					}
					const snapshot = this._addInitialSubscription(client, uri.toString());
					if (snapshot instanceof Promise) {
						pendingSnapshots.push(snapshot.then(value => {
							if (value) {
								snapshots.push(value);
							}
						}));
					} else if (snapshot) {
						snapshots.push(snapshot);
					}
				}
			}

			client.telemetryConnectionActive = true;
			const counts = this._clientConnections.getConnectionCounts(params.clientId);
			this._telemetryReporter.clientConnection({
				action: 'connected',
				context: telemetryContext,
				clientId: client.clientId,
				clientImplementationName: client.clientInfo?.name,
				clientImplementationVersion: client.clientInfo?.version,
				protocolVersion: client.protocolVersion,
				isReconnect: client.isReconnect,
				...counts,
			});
			if (previousRecord?.state === 'grace') {
				previousRecord.disconnectTimeouts.dispose();
			}
			this._onDidChangeConnectionCount.fire(this._connectedClientCount);

			const response: IAgentHostExtensionInitializeResult = {
				protocolVersion: negotiated,
				serverSeq: this._stateManager.serverSeq,
				_meta: {
					...(this._config.relayRoots || this._config.relayRootMeta ? {
						[AgentHostNativeImplementationMetaKey]: true,
						[AgentHostSessionUrisCapabilityMetaKey]: true,
						[AgentHostChatUrisCapabilityMetaKey]: true,
						...transport.relayHandshakeMeta,
					} : {
						...getAgentHostExtensionInitializeResultMeta(!!this._agentService.removeSessionArtifact, !!client.devContainers, this._otelService?.diagnosticsEnabled, !!this._agentService.importSession, !!this._agentService.readSavedChat && transport.relayClientId === undefined && !transport.relayPassive, !!this._agentService.completeSavedChatContinuation && transport.relayClientId === undefined && !transport.relayPassive, true),
						...(transport.relayClientId === undefined && !transport.relayPassive ? { [AgentHostWorktreeDiskUsageCapabilityMetaKey]: true } : {}),
						...(this._config.allowExtensionMethods !== false && this._agentService.installSandboxCertificate && transport.relayClientId === undefined && !transport.relayPassive
							? { [sandboxCertificateInstallationCapability]: true } : {}),
						...(this._config.allowExtensionMethods !== false && this._agentService.rotateSandboxCertificate && transport.relayClientId === undefined && !transport.relayPassive
							? { [sandboxCertificateRotationCapability]: true } : {}),
						...(this._config.allowExtensionMethods !== false && this._agentService.removeSandboxCertificate && transport.relayClientId === undefined && !transport.relayPassive
							? { [sandboxCertificateRemovalCapability]: true } : {}),
						...transport.relayHandshakeMeta,
					}),
					...getAgentHostAhpLogDirectoryMeta(this._config.ahpLogDirectory)
				},
				snapshots: snapshots.map(snapshot => this._projectRelayRootSnapshot(client, snapshot)),
				defaultDirectory: this._config.defaultDirectory,
				completionTriggerCharacters: this._config.completionTriggerCharacters ? [...this._config.completionTriggerCharacters] : undefined,
				terminalCommandPrefix: this._config.terminalCommandPrefix,
				telemetry: this._config.otlpLogEmitter ? { logs: OTLP_LOGS_CHANNEL_TEMPLATE } : undefined,
				automations: this._config.relayRoots || this._config.scopedRelayCredentials ? undefined : this._agentService.automationCapabilities,
			};
			return {
				client,
				response: pendingSnapshots.length === 0 ? response : Promise.all(pendingSnapshots).then(() => ({
					...response,
					serverSeq: this._stateManager.serverSeq,
					snapshots: snapshots.map(snapshot => this._projectRelayRootSnapshot(client, this._getSnapshot(snapshot.resource) ?? snapshot)),
				})).catch(error => {
					this._rollbackFailedInitialization(client, previousRecord);
					throw error;
				}),
			};
		} catch (error) {
			this._rollbackFailedInitialization(client, previousRecord);
			throw error;
		}
	}

	/**
	 * Helper for `initialize` and `reconnect` initial-subscription
	 * processing: classify `channel`, install the matching subscription
	 * on the client, and return the snapshot to include in the handshake
	 * response (or `undefined` for stateless channels and missing state).
	 *
	 * Side effects:
	 * - State channels: register with the agent service and clear any
	 *   pending tool-call disconnect timeout.
	 * - OTLP channels: install the canonical entry on the client's
	 *   {@link IConnectedClient.subscriptions} map.
	 *
	 * Channels with unsupported shapes (e.g. `ahp-otlp://logs/verbose`
	 * with no recognised level) are silently dropped. Valid state channels
	 * remain subscribed even when their snapshot has not materialized yet.
	 */
	private _addInitialSubscription(client: IConnectedClient, channel: string): IStateSnapshot | undefined | Promise<IStateSnapshot | undefined> {
		if (!this._isChannelVisible(client, channel)) {
			this._logService.info(`[ProtocolServer] Legacy VS Code client cannot subscribe to ${channel}`);
			return undefined;
		}
		const sub = classifyChannel(channel);
		if (!sub) {
			return undefined;
		}
		if (sub.kind === ChannelKind.OtlpLogs) {
			if (!this._config.otlpLogEmitter) {
				this._logService.warn(`[ProtocolServer] Ignoring OTLP initialSubscription ${channel}: no OTLP emitter configured.`);
				return undefined;
			}
			client.subscriptions.set(sub.uri, sub);
			return undefined;
		}
		// Annotations need persisted data, changesets need their first-subscriber
		// refresh, and chats need their input-availability check before snapshotting.
		// Keep missing chat baselines on the normal debt/restore path: a fresh
		// host may need authentication before it can materialize those chats.
		if (isAnnotationsUri(channel) || parseChangesetUri(channel) || (isAhpChatChannel(channel) && this._stateManager.getSnapshot(channel))) {
			return this._requestHandlers.subscribe(client, { channel }).then(result => result.snapshot).catch(error => {
				this._logService.info(`[ProtocolServer] Initialize: failed to restore subscription ${channel}: ${error instanceof Error ? error.message : String(error)}`);
				return undefined;
			});
		}
		const snapshot = this._getSnapshot(channel);
		client.subscriptions.set(sub.uri, sub);
		this._agentService.addSubscriber(URI.parse(sub.uri), client.clientId);
		this._clearClientToolCallDisconnectTimeout(client.clientId, sub.uri);
		if (snapshot) {
			this._clearBaselineDebt(client.clientId, sub.uri);
		} else {
			this._recordBaselineDebt(client.clientId, sub.uri);
		}
		return snapshot;
	}

	/**
	 * Note that `clientId` holds a subscription to `uri` with no baseline from
	 * this process. See {@link _baselineDebt}.
	 */
	private _recordBaselineDebt(clientId: string, uri: string): void {
		let debt = this._baselineDebt.get(clientId);
		if (!debt) {
			debt = new Set();
			this._baselineDebt.set(clientId, debt);
		}
		debt.add(uri);
	}

	/** Record that `clientId` has now been given a baseline for `uri`. */
	private _clearBaselineDebt(clientId: string, uri: string): void {
		const debt = this._baselineDebt.get(clientId);
		if (debt?.delete(uri) && debt.size === 0) {
			this._baselineDebt.delete(clientId);
		}
	}

	/** Whether any of `subscriptions` still owes `clientId` a baseline. */
	private _hasBaselineDebt(clientId: string, subscriptions: readonly string[]): boolean {
		const debt = this._baselineDebt.get(clientId);
		if (!debt || debt.size === 0) {
			return false;
		}
		return subscriptions.some(subscription => {
			const classified = classifyChannel(subscription.toString());
			return classified !== undefined && debt.has(classified.uri);
		});
	}

	private async _subscribeStateChannel(channel: string, client: IConnectedClient, isActive?: () => boolean): Promise<IStateSnapshot> {
		const clientId = client.clientId;
		if (!this._isChannelVisible(client, channel)) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Resource not available to this client: ${channel}`);
		}
		if (!isAhpAutomationCatalogChannel(channel)) {
			return this._agentService.subscribe(URI.parse(channel), clientId,
				() => (isAhpRootChannel(channel) || client.transport.relayAuthentication?.authenticated !== false) && (isActive?.() ?? true),
				this._config.scopedRelayCredentials ? this._getScopedAuthentication(client) : undefined,
				client.telemetryContext.connectionKind === AgentHostClientConnectionKind.MissionControl
					? { ...client.telemetryContext, clientId, isReconnect: client.isReconnect }
					: undefined);
		}
		if (isActive && !isActive()) {
			throw new Error(`Subscription cancelled: ${channel}`);
		}
		const snapshot = this._getSnapshot(channel);
		if (!snapshot) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Automation catalogue is unavailable: ${channel}`);
		}
		this._agentService.addSubscriber(URI.parse(channel), clientId);
		return snapshot;
	}

	/**
	 * Forwards a client's upgrade request to the hosting VS Code CLI's
	 * HTTP management API (advertised via the {@link VSCODE_AGENT_HOST_MANAGEMENT_SOCKET_ENV}).
	 * Returns the CLI's parsed response verbatim so the client can render
	 * a meaningful status (already up-to-date, restart scheduled, etc.).
	 *
	 * When the server was not spawned by a managing CLI, responds with
	 * `MethodNotFound` — the upgrade method is only meaningfully callable
	 * on CLI-hosted servers.
	 */
	private _handleVscodeUpgrade(id: number, transport: IProtocolTransport): void {
		const socketPath = getAgentHostManagementSocketPath();
		if (!socketPath) {
			transport.send(jsonRpcError(
				id,
				JsonRpcErrorCodes.MethodNotFound,
				`No upgrade supervisor is available for this agent host.`,
			));
			return;
		}
		this._trackRequest(requestAgentHostUpgrade(socketPath)).then(
			(result) => transport.send(jsonRpcSuccess(id, result)),
			(err: unknown) => {
				this._logService.warn(`[ProtocolServer] vscodeUpgrade signal failed: ${err instanceof Error ? err.message : String(err)}`);
				transport.send(jsonRpcErrorFrom(id, err));
			},
		);
	}

	private _handleReconnect(
		params: ReconnectParams,
		transport: IProtocolTransport,
		disposables: DisposableStore,
	): { client: IConnectedClient; responsePromise: Promise<ReconnectResult> } {
		this._verifyRelayClient(transport, params.clientId);
		if (this._config.relayRoots && params.subscriptions?.some(channel => !isAhpRootChannel(channel))) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Relay subscriptions are not available in this prototype');
		}
		this._logService.info(`[ProtocolServer] Reconnect: clientId=${params.clientId}, lastSeenSeq=${params.lastSeenServerSeq}`);
		const existingRecord = this._clients.get(params.clientId);
		if (!existingRecord) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Reconnect client not found: ${params.clientId}`);
		}
		this._applyClientTelemetryLevel(params._meta);

		// Synchronously install the client so messages arriving on this transport
		// while we restore subscriptions can find a valid client object. The
		// reconnect response is only sent once `responsePromise` resolves below.
		const priorTelemetryContext = existingRecord.state === 'active'
			? existingRecord.connections.at(-1)?.telemetryContext
			: existingRecord.telemetryContext;
		const priorProtocolVersion = existingRecord.state === 'active'
			? existingRecord.connections.at(-1)?.protocolVersion
			: existingRecord.protocolVersion;
		const isReconnect = this._clientConnections.hasSeenClient(params.clientId);
		const initializationDisposables = disposables.add(new DisposableStore());
		const client: IConnectedClient = {
			legacySessionUris: getAgentHostClientType(existingRecord.clientInfo) !== AgentHostClientType.Unknown && !supportsAgentHostSessionUris(params),
			legacyChatUris: getAgentHostClientType(existingRecord.clientInfo) !== AgentHostClientType.Unknown && !supportsAgentHostChatUris(params),
			clientId: params.clientId,
			clientInfo: existingRecord.clientInfo,
			telemetryContext: this._createClientTelemetryContext(existingRecord.clientInfo, params._meta, transport, priorTelemetryContext?.connectionKind),
			protocolVersion: priorProtocolVersion ?? PROTOCOL_VERSION,
			transport,
			connectionStopWatch: StopWatch.create(true),
			isReconnect,
			telemetryConnectionActive: false,
			subscriptions: new Map(),
			knownSessionSummaries: new Set(),
			pendingAuthenticationSubscriptions: new Set(),
			disposables,
			initializationDisposables,
		};
		this._attachConnection(params.clientId, client);
		try {
			this._initializeDevContainers(client);
			// Re-establish the reverse-RPC filesystem authority for this client.
			// The prior transport's `onClose` disposed the previous registration,
			// so without this step any subsequent `resourceRead` / `resourceWrite`
			// / etc. from the agent host would fail with "no connection registered
			// for authority" until the client disconnected and re-initialized.
			this._registerClientFileSystemAuthority(params.clientId, initializationDisposables);

			const oldestBuffered = this._replayBuffer.length > 0 ? this._replayBuffer[0].serverSeq : this._stateManager.serverSeq;
			// A global cursor only proves the client saw every ACTION; it says
			// nothing about whether a given channel ever received state from this
			// process to apply them to. Force snapshots while any requested
			// channel still owes a baseline.
			const canReplay = params.lastSeenServerSeq >= oldestBuffered
				&& !this._hasBaselineDebt(params.clientId, params.subscriptions);
			const responsePromise = this._restoreReconnectSubscriptions(client, params, canReplay).then(result => (
				transport.relayHandshakeMeta && typeof result === 'object' && result !== null
					? { ...result, _meta: transport.relayHandshakeMeta }
					: result
			)).catch(error => {
				this._rollbackFailedInitialization(client, existingRecord);
				throw error;
			});

			client.telemetryConnectionActive = true;
			const counts = this._clientConnections.getConnectionCounts(params.clientId);
			this._telemetryReporter.clientConnection({
				action: 'connected',
				context: client.telemetryContext,
				clientId: client.clientId,
				clientImplementationName: client.clientInfo?.name,
				clientImplementationVersion: client.clientInfo?.version,
				protocolVersion: client.protocolVersion,
				isReconnect: client.isReconnect,
				...counts,
			});
			if (existingRecord.state === 'grace') {
				existingRecord.disconnectTimeouts.dispose();
			}
			this._onDidChangeConnectionCount.fire(this._connectedClientCount);

			return { client, responsePromise };
		} catch (error) {
			this._rollbackFailedInitialization(client, existingRecord);
			throw error;
		}
	}

	/**
	 * Wires the reverse-RPC filesystem callbacks for `clientId` and binds
	 * the unregister to `disposables` (the transport's per-connection
	 * store). The callbacks dispatch through {@link _sendReverseRequest},
	 * which looks up the *current* connected client by id — so re-binding
	 * after a reconnect picks up the new transport without rebuilding the
	 * closures.
	 */
	private _registerClientFileSystemAuthority(clientId: string, disposables: DisposableStore): void {
		disposables.add(this._clientFileSystemProvider.registerAuthority(clientId, {
			resourceList: (uri) => this._sendReverseRequest(clientId, 'resourceList', { uri: uri.toString() }),
			resourceRead: (uri) => this._sendReverseRequest(clientId, 'resourceRead', { uri: uri.toString() }),
			resourceWrite: (params_) => this._sendReverseRequest(clientId, 'resourceWrite', params_),
			resourceCopy: (params_) => this._sendReverseRequest(clientId, 'resourceCopy', params_),
			resourceDelete: (params_) => this._sendReverseRequest(clientId, 'resourceDelete', params_),
			resourceMove: (params_) => this._sendReverseRequest(clientId, 'resourceMove', params_),
			resourceRequest: (params_) => this._sendReverseRequest(clientId, 'resourceRequest', params_),
			resourceResolve: (params_) => this._sendReverseRequest(clientId, 'resourceResolve', params_),
			resourceMkdir: (params_) => this._sendReverseRequest(clientId, 'resourceMkdir', params_),
		}));
	}

	/**
	 * Re-establish each of the client's prior subscriptions on the server side.
	 * Uses {@link IAgentService.subscribe} (rather than a bare `addSubscriber`
	 * + `getSnapshot`) so any session state that was evicted while the client
	 * was disconnected is restored. Returns the appropriate reconnect response
	 * payload — `replay` actions when the client's last-seen seq is still in
	 * the buffer, otherwise fresh `snapshot`s.
	 */
	private async _restoreReconnectSubscriptions(
		client: IConnectedClient,
		params: ReconnectParams,
		canReplay: boolean,
	): Promise<ReconnectResult> {
		const missing: string[] = [];
		const restoredUris = new Set<string>();
		const pendingSubscriptions: { readonly pending: ChannelSubscription; readonly active: ChannelSubscription }[] = [];
		const snapshots = await Promise.all(params.subscriptions.map(async sub => {
			const key = sub.toString();
			const classified = classifyChannel(key);
			if (!classified) {
				return undefined;
			}
			if (restoredUris.has(classified.uri)) {
				return undefined;
			}
			restoredUris.add(classified.uri);
			if (client.transport.relayAuthentication?.authenticated === false && !isAhpRootChannel(key)) {
				client.pendingAuthenticationSubscriptions.add(key);
				missing.push(sub);
				return undefined;
			}
			if (classified.kind === ChannelKind.OtlpLogs) {
				if (!this._config.otlpLogEmitter) {
					this._logService.warn(`[ProtocolServer] Reconnect: dropping OTLP subscription ${key}: no OTLP emitter configured.`);
					return undefined;
				}
				// Stateless: re-install without going through the agent service.
				client.subscriptions.set(classified.uri, classified);
				return undefined;
			}
			if (classified.kind === ChannelKind.ResourceWatch) {
				const descriptor = this._agentService.onResourceWatchSubscribed(classified.uri);
				if (!descriptor) {
					this._logService.info(`[ProtocolServer] Reconnect: resource watch ${key} no longer parses`);
					missing.push(sub);
					this._clearBaselineDebt(client.clientId, classified.uri);
					return undefined;
				}
				if (canReplay) {
					const pendingSubscription: ChannelSubscription = { ...classified, active: false };
					pendingSubscriptions.push({ pending: pendingSubscription, active: classified });
					client.subscriptions.set(classified.uri, pendingSubscription);
				} else {
					client.subscriptions.set(classified.uri, classified);
				}
				return {
					resource: classified.uri,
					state: descriptor,
					fromSeq: this._stateManager.serverSeq,
				};
			}
			const pendingSubscription: ChannelSubscription = { ...classified, active: false };
			pendingSubscriptions.push({ pending: pendingSubscription, active: classified });
			client.subscriptions.set(classified.uri, pendingSubscription);
			try {
				const snapshot = await this._subscribeStateChannel(
					key,
					client,
					() => client.subscriptions.get(classified.uri) === pendingSubscription,
				);
				if (client.subscriptions.get(classified.uri) !== pendingSubscription) {
					throw new Error(`Subscription cancelled: ${key}`);
				}
				this._clearClientToolCallDisconnectTimeout(client.clientId, classified.uri);
				return snapshot;
			} catch (err) {
				if (client.subscriptions.get(classified.uri) === pendingSubscription) {
					client.subscriptions.delete(classified.uri);
				}
				this._logService.info(`[ProtocolServer] Reconnect: failed to restore subscription ${key}: ${err instanceof Error ? err.message : String(err)}`);
				missing.push(sub);
				// Reported as missing, so it can never be baselined. Leaving the
				// debt would deny `canReplay` for this client's healthy channels
				// on every future reconnect, since `missing` is not repeated on
				// the snapshot branch and nothing else would ever clear it.
				this._clearBaselineDebt(client.clientId, classified.uri);
				return undefined;
			}
		}));

		// Activate the batch only after every restore settles so no channel can
		// receive an action both live and through the reconnect replay.
		for (const { pending, active } of pendingSubscriptions) {
			if (client.subscriptions.get(pending.uri) === pending) {
				client.subscriptions.set(active.uri, active);
			}
		}
		this._reconcileActiveClientSubscriptions(client);

		if (canReplay) {
			const actions: ActionEnvelope[] = [];
			for (const envelope of this._replayBuffer) {
				if (envelope.serverSeq > params.lastSeenServerSeq) {
					const projected = this._isRelevantToClient(client, envelope) ? this._projectActionForClient(client, envelope) : undefined;
					if (projected) {
						actions.push(projected);
					}
				}
			}
			return { type: ReconnectResultType.Replay, actions, missing };
		}
		const refreshedSnapshots = snapshots.map(snapshot => {
			if (!snapshot) {
				return undefined;
			}
			const subscription = client.subscriptions.get(snapshot.resource.toString());
			if (subscription?.kind !== ChannelKind.State) {
				return snapshot;
			}
			const refreshed = this._getSnapshot(subscription.uri);
			if (refreshed) {
				// Key off the subscription, not the snapshot's echoed resource,
				// so the debt entry recorded under the same key is really cleared.
				this._clearBaselineDebt(client.clientId, subscription.uri);
			}
			return refreshed;
		});
		return { type: ReconnectResultType.Snapshot, snapshots: refreshedSnapshots.filter((s): s is IStateSnapshot => s !== undefined) };
	}

	/** Releases active-client and tool ownership not retained by another live connection's subscriptions. */
	private _reconcileActiveClientSubscriptions(client: IConnectedClient): void {
		for (const session of this._stateManager.getSessionUris()) {
			const state = this._stateManager.getSessionState(session);
			if (!state) {
				continue;
			}
			if (this._hasActiveSubscriptionToSession(client, session)) {
				continue;
			}
			const ownsPendingToolCall = state.chats.some(chat =>
				this._hasPendingClientToolCall(this._stateManager.getSessionState(chat.resource), client.clientId));
			const requiresRelease = this._isActiveClient(state, client.clientId) || ownsPendingToolCall;
			if (!requiresRelease) {
				continue;
			}
			for (const chat of state.chats) {
				this._releaseActiveClientForSession(session, client.clientId, chat.resource);
			}
		}
	}

	private _handleClientDisconnected(clientId: string): void {
		const record = this._clients.get(clientId);
		if (record?.state === 'grace') {
			record.disconnectTimeouts.set('managed-settings', disposableTimeout(() => {
				record.disconnectTimeouts.deleteAndDispose('managed-settings');
				this._managedSettingsService.removeClient(this._managedSettingsContributionId(clientId));
			}, Math.max(0, CLIENT_TOOL_CALL_DISCONNECT_TIMEOUT - (Date.now() - record.lastSeenAt))));
		}
		for (const session of this._stateManager.getSessionUris()) {
			const state = this._stateManager.getSessionState(session);
			const isActive = state ? this._isActiveClient(state, clientId) : false;
			const ownsPendingToolCall = state ? this._hasPendingClientToolCall(state, clientId) : false;
			// Keep the client marked active during the grace window so a quick
			// reconnect that resubscribes can retain its slot. The disconnect
			// timeout removes the active client (and fails its pending tool
			// calls) if it never returns; an explicit unsubscribe or a
			// reconnect without resubscription removes it sooner.
			if (isActive || ownsPendingToolCall) {
				for (const chat of state?.chats ?? []) {
					this._startClientToolCallDisconnectTimeout(clientId, session, chat.resource);
				}
			}
		}
	}

	/** Whether `clientId` is one of the session's active clients. */
	private _isActiveClient(state: SessionState, clientId: string): boolean {
		return state.activeClients.some(c => c.clientId === clientId);
	}

	/**
	 * Remove `clientId` from a session's active clients, if present. Dispatched
	 * as a server action so the removal is reflected in state and broadcast to
	 * the remaining subscribers.
	 */
	private _removeActiveClient(session: string, clientId: string): void {
		const state = this._stateManager.getSessionState(session);
		if (state && this._isActiveClient(state, clientId)) {
			this._stateManager.dispatchServerAction(session, {
				type: ActionType.SessionActiveClientRemoved,
				clientId,
			});
		}
	}

	/**
	 * Release a client from a session: clear its pending disconnect timeout,
	 * fail any client tool calls it still owns, and remove it from the active
	 * clients. Used by the explicit-unsubscribe and reconnect-reconciliation
	 * paths to drop a client that has left a session.
	 */
	private _releaseActiveClientForSession(session: string, clientId: string, chatChannel: string): void {
		this._clearClientToolCallDisconnectTimeout(clientId, chatChannel);
		this._completeDisconnectedClientToolCalls(clientId, session, chatChannel);
		this._removeActiveClient(session, clientId);
	}

	/**
	 * Yields every still-pending client-contributed tool call in `state`'s
	 * active turn, paired with its owning `clientId`. Single source of truth
	 * for the disconnect-grace machinery: detect ownership
	 * ({@link _hasPendingClientToolCall}), arm timeouts
	 * ({@link _checkOrphanedClientToolCalls}), and fail orphaned calls
	 * ({@link _completeDisconnectedClientToolCalls}).
	 */
	private *_pendingClientToolCalls(state: ISessionWithDefaultChat | undefined) {
		const activeTurn = state?.activeTurn;
		if (!activeTurn) {
			return;
		}
		for (const part of activeTurn.responseParts) {
			if (part.kind !== ResponsePartKind.ToolCall) {
				continue;
			}
			const toolCall = part.toolCall;
			const contributor = toolCall.contributor;
			if (contributor?.kind === ToolCallContributorKind.Client && isPendingToolCallStatus(toolCall.status)) {
				yield { toolCall, clientId: contributor.clientId };
			}
		}
	}

	private _hasPendingClientToolCall(state: ISessionWithDefaultChat | undefined, clientId: string): boolean {
		for (const pending of this._pendingClientToolCalls(state)) {
			if (pending.clientId === clientId) {
				return true;
			}
		}
		return false;
	}

	private _hasReplacementActiveClientTool(state: SessionState, clientId: string, toolName: string): boolean {
		return state.activeClients.some(client =>
			client.clientId !== clientId
			&& client.tools.some(tool => tool.name === toolName));
	}

	/**
	 * Arm (or re-arm) the per-(clientId, session) timeout that fails pending
	 * client tool calls owned by `clientId` if it does not reconnect before the
	 * grace window elapses. Only meaningful for a client with no live transport:
	 * a connected client is handled by {@link _attachConnection}, which disposes
	 * any armed timers, so this is a no-op when the client is active. The delay
	 * is the remaining grace measured from when the client disconnected — so a
	 * client that disconnected a while before the call was issued gets the
	 * residual window rather than a fresh one, and a stamp from a long-disconnected
	 * client fails promptly. Re-arms triggered by later orphaned tool calls in the
	 * same session shrink the remaining window instead of resetting it.
	 */
	private _startClientToolCallDisconnectTimeout(clientId: string, session: string, chatChannel: string): void {
		const record = this._ensureGraceRecord(clientId);
		if (!record) {
			// Client is connected; the grace machinery does not apply.
			return;
		}
		record.disconnectTimeouts.deleteAndDispose(chatChannel);
		const elapsed = Date.now() - record.lastSeenAt;
		const delay = Math.max(0, CLIENT_TOOL_CALL_DISCONNECT_TIMEOUT - elapsed);
		record.disconnectTimeouts.set(chatChannel, disposableTimeout(() => {
			this._releaseActiveClientForSession(session, clientId, chatChannel);
		}, delay));
	}

	/**
	 * Scan a chat for pending client tool calls owned by a disconnected client
	 * of this protocol server, and arm the disconnect timeout for each owner.
	 * Called when a `ChatToolCallStart` / `ChatToolCallReady` envelope is
	 * observed — covering calls issued for an already-gone client, which the
	 * live disconnect path never sees. Ownerless client tool calls (no client
	 * connected at stamp time) are failed immediately by the provider, so they
	 * never reach a pending state here. Unknown client ids are ignored because
	 * they may belong to another transport such as local IPC.
	 */
	private _checkOrphanedClientToolCalls(session: string, chatChannel: string): void {
		const state = this._stateManager.getSessionState(chatChannel);
		const orphanOwners = new Set<string>();
		for (const { clientId } of this._pendingClientToolCalls(state)) {
			const ownerRecord = this._clients.get(clientId);
			if (ownerRecord?.state === 'grace') {
				orphanOwners.add(clientId);
			}
		}
		for (const ownerId of orphanOwners) {
			this._startClientToolCallDisconnectTimeout(ownerId, session, chatChannel);
		}
	}

	/**
	 * Register a freshly connected (or reconnected) transport for `clientId`,
	 * promoting the record to {@link IActiveClientRecord}. Promoting a grace
	 * record back to active disposes its pending disconnect timers: the
	 * disconnect-grace window only applies while the client has no live
	 * transport. This is the single place that maintains the "active records
	 * hold no grace timers" invariant.
	 */
	private _attachConnection(clientId: string, client: IConnectedClient): void {
		const existing = this._clients.get(clientId);
		if (existing?.state === 'active') {
			existing.connections.push(client);
			existing.clientInfo = client.clientInfo ?? existing.clientInfo;
		} else {
			this._clients.set(clientId, { state: 'active', clientInfo: client.clientInfo ?? existing?.clientInfo, connections: [client] });
		}
		this._pruneClientRecords();
	}

	private _rollbackFailedInitialization(client: IConnectedClient, previousRecord: IClientRecord | undefined): void {
		client.telemetryConnectionActive = false;
		const record = this._clients.get(client.clientId);
		if (record?.state === 'active') {
			const connectionIndex = record.connections.indexOf(client);
			if (connectionIndex !== -1) {
				record.connections.splice(connectionIndex, 1);
				this._releaseClientSubscriptions(client, record);
				this._rejectPendingReverseRequestsForConnection(client);
			}
			if (record.connections.length === 0) {
				if (previousRecord?.state === 'grace') {
					previousRecord.disconnectTimeouts.dispose();
					this._clients.set(client.clientId, { ...previousRecord, disconnectTimeouts: new DisposableMap() });
					this._handleClientDisconnected(client.clientId);
				} else {
					this._clients.delete(client.clientId);
					this._baselineDebt.delete(client.clientId);
				}
			}
		}
		client.initializationDisposables.dispose();
	}

	/**
	 * Return the existing grace record for `clientId`, creating one for a
	 * never-connected client (an orphan tool-call stamp). Returns `undefined`
	 * when the client is currently active — the grace machinery does not apply
	 * to a connected client. A newly created record pins its grace clock to now.
	 */
	private _ensureGraceRecord(clientId: string): IGraceClientRecord | undefined {
		const record = this._clients.get(clientId);
		if (record?.state === 'active') {
			return undefined;
		}
		if (record) {
			return record;
		}
		const created: IGraceClientRecord = {
			state: 'grace',
			seenConnection: false,
			clientInfo: undefined,
			telemetryContext: undefined,
			protocolVersion: undefined,
			lastSeenAt: Date.now(),
			disconnectTimeouts: new DisposableMap(),
		};
		this._clients.set(clientId, created);
		return created;
	}

	private _getActiveClient(clientId: string): IConnectedClient | undefined {
		return this._getActiveClientFromRecord(this._clients.get(clientId));
	}

	private _getActiveClientFromRecord(record: IClientRecord | undefined): IConnectedClient | undefined {
		if (record?.state !== 'active') {
			return undefined;
		}
		return record.connections[record.connections.length - 1];
	}

	private _releaseClientSubscriptions(client: IConnectedClient, record: IActiveClientRecord, retainRoot = false): void {
		for (const sub of client.subscriptions.values()) {
			if (retainRoot && sub.kind === ChannelKind.State && isAhpRootChannel(sub.uri)) {
				continue;
			}
			client.subscriptions.delete(sub.uri);
			if (sub.kind === ChannelKind.State) {
				if (this._hasSubscriptionInOtherConnection(record, client, sub.uri)) {
					continue;
				}
				this._agentService.unsubscribe(URI.parse(sub.uri), client.clientId);
			} else if (sub.kind === ChannelKind.ResourceWatch) {
				this._agentService.onResourceWatchUnsubscribed(sub.uri);
			}
		}
		client.pendingAuthenticationSubscriptions.clear();
	}

	private _hasSubscriptionInOtherConnection(record: IClientRecord, client: IConnectedClient, uri: string): boolean {
		if (record.state !== 'active') {
			return false;
		}
		for (const other of record.connections) {
			if (other !== client && other.subscriptions.has(uri)) {
				return true;
			}
		}
		return false;
	}

	private _hasActiveSubscriptionToSession(client: IConnectedClient, session: string): boolean {
		const record = this._clients.get(client.clientId);
		for (const connection of record?.state === 'active' ? record.connections : [client]) {
			for (const channel of connection.pendingAuthenticationSubscriptions) {
				if (channel === session || this._chatOwnership.getChatOwner(channel) === session) {
					return true;
				}
			}
			for (const subscription of connection.subscriptions.values()) {
				if (subscription.kind === ChannelKind.State
					&& subscription.active
					&& (subscription.uri === session
						|| this._chatOwnership.getChatOwner(subscription.uri) === session)) {
					return true;
				}
			}
		}
		return false;
	}

	hasSeenClient(clientId: string): boolean {
		const record = this._clients.get(clientId);
		return record?.state === 'active'
			? record.connections.some(connection => connection.telemetryConnectionActive)
			: record?.seenConnection === true
			&& record.lastSeenAt >= Date.now() - AGENT_HOST_CLIENT_CONNECTION_HISTORY_RETENTION;
	}

	isClientConnected(clientId: string): boolean {
		const record = this._clients.get(clientId);
		return record?.state === 'active'
			&& record.connections.some(connection => connection.telemetryConnectionActive);
	}

	isLocalClient(clientId: string): boolean {
		const record = this._clients.get(clientId);
		return record?.state === 'active'
			&& record.connections.some(connection => connection.telemetryConnectionActive && this._isLocalClientConnection(connection));
	}

	usesLegacySessionUris(clientId: string): boolean {
		const record = this._clients.get(clientId);
		return record?.state === 'active'
			? this._getActiveClientFromRecord(record)?.legacySessionUris === true
			: record?.legacySessionUris === true;
	}

	usesLegacyChatUris(clientId: string): boolean {
		const record = this._clients.get(clientId);
		return record?.state === 'active'
			? this._getActiveClientFromRecord(record)?.legacyChatUris === true
			: record?.legacyChatUris === true;
	}

	getConnectedClientTransportCounts(): ReadonlyMap<string, number> {
		const result = new Map<string, number>();
		for (const [clientId, record] of this._clients) {
			if (record.state !== 'active') {
				continue;
			}
			const count = record.connections.filter(connection => connection.telemetryConnectionActive).length;
			if (count > 0) {
				result.set(clientId, count);
			}
		}
		return result;
	}

	async requestMcpAuthentication(request: IAgentHostMcpAuthenticationRequest): Promise<boolean> {
		for (const record of this._clients.values()) {
			if (record.state !== 'active') {
				continue;
			}
			for (const client of record.connections) {
				if (!client.telemetryConnectionActive) {
					continue;
				}
				try {
					const result = await this._sendReverseRequestToConnection<IAgentHostExtensionServerCommandMap[typeof RequestAgentHostMcpAuthenticationExtensionMethod]['result']>(
						client, RequestAgentHostMcpAuthenticationExtensionMethod, request,
					);
					if (result.authenticated === true) {
						return true;
					}
				} catch (error) {
					this._logService.debug(`[ProtocolServerHandler] MCP authentication request rejected by client ${client.clientId}: ${toErrorMessage(error)}`);
				}
			}
		}
		return false;
	}

	async requestWorkspaceTrust(clientId: string, request: IAgentHostWorkspaceTrustRequest): Promise<boolean> {
		const result = await this._sendReverseRequest<IAgentHostExtensionServerCommandMap[typeof RequestAgentHostWorkspaceTrustExtensionMethod]['result']>(
			clientId,
			RequestAgentHostWorkspaceTrustExtensionMethod,
			request,
		);
		return result.trusted === true;
	}

	/** Number of clients that currently have a live connection. */
	private get _connectedClientCount(): number {
		let count = 0;
		for (const record of this._clients.values()) {
			if (record.state === 'active') {
				count++;
			}
		}
		return count;
	}

	private _isLocalClientConnection(client: IConnectedClient): boolean {
		return client.telemetryContext.connectionKind === AgentHostClientConnectionKind.Local
			&& client.telemetryContext.transportKind === AgentHostTransportKind.MessagePort;
	}

	private _createClientTelemetryContext(clientInfo: Implementation | undefined, meta: Record<string, unknown> | undefined, transport: IProtocolTransport, fallbackConnectionKind = AgentHostClientConnectionKind.Unknown): IAgentHostClientTelemetryContext {
		const connectionKind = transport.clientConnectionKind ?? readClientConnectionKind(meta);
		const machineId = readClientMachineId(meta);
		const devDeviceId = readClientDevDeviceId(meta);
		return {
			clientType: getAgentHostClientType(clientInfo),
			connectionKind: connectionKind === AgentHostClientConnectionKind.Unknown ? fallbackConnectionKind : connectionKind,
			transportKind: transport.transportKind ?? AgentHostTransportKind.Unknown,
			hostLaunchKind: this._config.hostLaunchKind ?? AgentHostLaunchKind.Unknown,
			...(machineId ? { machineId } : {}),
			...(devDeviceId ? { devDeviceId } : {}),
		};
	}

	private _applyClientTelemetryLevel(meta: Record<string, unknown> | undefined): void {
		const telemetryLevel = readClientTelemetryLevel(meta);
		if (telemetryLevel !== undefined && isAgentHostTelemetryService(this._telemetryService)) {
			this._telemetryService.updateTelemetryLevel(telemetryLevel);
		}
	}

	private _reportClientDisconnected(client: IConnectedClient, subscriptionCount: number): void {
		if (!client.telemetryConnectionActive) {
			return;
		}
		client.telemetryConnectionActive = false;
		const counts = this._clientConnections.getConnectionCounts(client.clientId);
		this._telemetryReporter.clientConnection({
			action: 'disconnected',
			context: client.telemetryContext,
			clientId: client.clientId,
			clientImplementationName: client.clientInfo?.name,
			clientImplementationVersion: client.clientInfo?.version,
			protocolVersion: client.protocolVersion,
			isReconnect: client.isReconnect,
			...counts,
			connectionDurationMs: client.connectionStopWatch.elapsed(),
			subscriptionCount,
		});
	}

	/**
	 * Drop grace records whose timers have all fired and whose last-seen time is
	 * stale beyond the retention window (10× the disconnect timeout). This
	 * covers both genuinely-disconnected clients and never-connected orphan
	 * stamps. Bounds {@link _clients} without tracking liveness precisely — a
	 * pruned-then-resurfacing stamp simply falls back to the full grace window.
	 * Active records are never pruned; they persist until their last transport
	 * closes.
	 */
	private _pruneClientRecords(): void {
		const cutoff = Date.now() - AGENT_HOST_CLIENT_CONNECTION_HISTORY_RETENTION;
		for (const [clientId, record] of this._clients) {
			if (record.state === 'grace'
				&& record.disconnectTimeouts.size === 0
				&& record.lastSeenAt < cutoff) {
				record.disconnectTimeouts.dispose();
				this._clients.delete(clientId);
				this._baselineDebt.delete(clientId);
			}
		}
	}

	private _clearClientToolCallDisconnectTimeout(clientId: string, channel: string): void {
		const record = this._clients.get(clientId);
		if (record?.state === 'grace') {
			record.disconnectTimeouts.deleteAndDispose(channel);
		}
	}

	private _completeDisconnectedClientToolCalls(clientId: string, session: string, chatChannel: string): void {
		const state = this._stateManager.getSessionState(chatChannel);
		const activeTurn = state?.activeTurn;
		if (!state || !activeTurn) {
			return;
		}
		for (const { toolCall, clientId: ownerId } of this._pendingClientToolCalls(state)) {
			if (ownerId !== clientId) {
				continue;
			}
			const mayRetryWithReplacementClient = this._hasReplacementActiveClientTool(state, clientId, toolCall.toolName);
			if (toolCall.status === ToolCallStatus.Streaming) {
				this._stateManager.dispatchServerAction(chatChannel, {
					type: ActionType.ChatToolCallReady,
					turnId: activeTurn.id,
					toolCallId: toolCall.toolCallId,
					invocationMessage: toolCall.invocationMessage ?? toolCall.displayName,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				});
			}
			this._stateManager.dispatchServerAction(chatChannel, {
				type: ActionType.ChatToolCallComplete,
				turnId: activeTurn.id,
				toolCallId: toolCall.toolCallId,
				result: {
					success: false,
					pastTenseMessage: `${toolCall.displayName} failed`,
					...(mayRetryWithReplacementClient ? { content: [{ type: ToolResultContentType.Text, text: `The client that was running ${toolCall.displayName} disconnected, but another active client now provides ${toolCall.displayName}. You may try calling the tool again.` }] } : {}),
					error: { message: `Client ${clientId} disconnected before completing ${toolCall.displayName}` },
				},
			});
		}
	}

	// ---- Requests (expect a response) ---------------------------------------

	/**
	 * Methods handled by the request dispatcher (excludes initialize/reconnect
	 * which are handled during the handshake phase).
	 */
	private readonly _requestHandlers: RequestHandlerMap = {
		subscribe: async (client, params) => {
			const classified = classifyChannel(params.channel);
			if (!classified) {
				// OTLP-flavoured URI we don't understand (e.g. unknown
				// level). Acknowledge as stateless so the client doesn't
				// hang, but install nothing.
				return {};
			}
			if (classified.kind === ChannelKind.OtlpLogs) {
				if (!this._config.otlpLogEmitter) {
					this._logService.warn(`[ProtocolServer] Ignoring OTLP subscribe for ${params.channel}: no OTLP emitter configured.`);
					return {};
				}
				client.subscriptions.set(classified.uri, classified);
				client.pendingAuthenticationSubscriptions.delete(classified.uri);
				return {};
			}
			if (classified.kind === ChannelKind.ResourceWatch) {
				const descriptor = this._agentService.onResourceWatchSubscribed(classified.uri);
				if (!descriptor) {
					throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Resource watch not found: ${params.channel}`);
				}
				client.subscriptions.set(classified.uri, classified);
				return {
					snapshot: {
						resource: classified.uri,
						state: descriptor,
						fromSeq: this._stateManager.serverSeq,
					},
				};
			}
			const existingSubscription = client.subscriptions.get(classified.uri);
			const pendingSubscription = existingSubscription?.kind === ChannelKind.State && existingSubscription.active
				? existingSubscription
				: { ...classified, active: false };
			client.subscriptions.set(classified.uri, pendingSubscription);
			try {
				const snapshot = await this._subscribeStateChannel(
					params.channel,
					client,
					() => client.subscriptions.get(classified.uri) === pendingSubscription,
				);
				if (client.subscriptions.get(classified.uri) !== pendingSubscription) {
					throw new Error(`Subscription cancelled: ${params.channel}`);
				}
				client.subscriptions.set(classified.uri, classified);
				client.pendingAuthenticationSubscriptions.delete(classified.uri);
				this._clearClientToolCallDisconnectTimeout(client.clientId, classified.uri);
				this._clearBaselineDebt(client.clientId, classified.uri);
				// `IStateSnapshot` is widened with `ChatState` (see sessionProtocol.ts);
				// the generated wire `Snapshot` union does not list it yet. The value
				// is JSON over the wire, so narrowing at this boundary is safe.
				return { snapshot: snapshot as SubscribeResult['snapshot'] };
			} catch (err) {
				// Losing request ownership cancels the subscription, not the resource.
				if (client.subscriptions.get(classified.uri) !== pendingSubscription) {
					throw new SubscriptionCancelledError(params.channel);
				}
				if (!pendingSubscription.active) {
					client.subscriptions.delete(classified.uri);
				}
				if (err instanceof ProtocolError) {
					throw err;
				}
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Resource not found: ${params.channel}`);
			}
		},
		createSession: async (_client, params) => {
			const checkAuthorization = this._captureRelayAuthorization(_client);
			this._requireRelayMutation(_client);
			let workingDirectories = params.workingDirectories;
			if (_client.transport.relayClientId !== undefined && !workingDirectories?.length && this._config.defaultDirectory) {
				workingDirectories = [this._config.defaultDirectory];
			}
			if (_client.transport.relayClientId !== undefined && this._config.relayResourceRoots && (!workingDirectories?.length || !(await Promise.all(workingDirectories.map(directory => this._isGrantedRelayResource(directory, false)))).every(Boolean))) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Session creation requires a host workspace grant');
			}
			if (this._config.relayRoots && (!workingDirectories?.length || !(await Promise.all(workingDirectories.map(directory => this._isGrantedRelayDirectory(directory)))).every(Boolean))) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Working directory is not an explicitly granted project root');
			}
			checkAuthorization();
			let createdSession: URI;
			// If the client eagerly claimed the active client role, validate
			// the clientId matches the connection before forwarding.
			if (params.activeClient && params.activeClient.clientId !== _client.clientId) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `createSession.activeClient.clientId must match the connection's clientId`);
			}
			try {
				createdSession = await this._agentService.createSession({
					legacyChatUris: _client.legacyChatUris,
					provider: params.provider,
					_meta: _client.clientInfo ? withSessionInitiator(params._meta, _client.clientInfo) : params._meta,
					workingDirectories: workingDirectories?.map(d => URI.parse(d)),
					session: URI.parse(params.channel),
					config: this._config.sessionConfigAdapter ? this._config.sessionConfigAdapter.fromClientValues(params.config) : params.config,
					activeClient: params.activeClient,
					progressToken: params.progressToken,
					...(this._config.scopedRelayCredentials ? { credentials: this._getScopedAuthentication(_client) } : {}),
				});
			} catch (err) {
				if (err instanceof ProtocolError || getErrorCode(err) === 'policyResolutionFailed') {
					throw err;
				}
				throw new ProtocolError(AHP_PROVIDER_NOT_FOUND, err instanceof Error ? err.message : String(err));
			}
			// Verify the provider honored the client-chosen session URI per the protocol contract
			if (createdSession.toString() !== URI.parse(params.channel).toString()) {
				this._logService.warn(`[ProtocolServer] createSession: provider returned URI ${createdSession.toString()} but client requested ${params.channel}`);
			}
			this._telemetryReporter.sessionCreated(this._stateManager.getSessionSummary(createdSession.toString())?.provider ?? params.provider, _client.telemetryContext);
			return null;
		},
		disposeSession: async (_client, params) => {
			await this._agentService.disposeSession(URI.parse(params.channel));
			return null;
		},
		createChat: async (_client, params) => {
			const state = this._stateManager.getSessionState(params.channel);
			if (!state) {
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${params.channel}`);
			}
			const workspace = readCreateChatWorkspaceMeta(params._meta);
			if (workspace === 'invalid') {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid createChat workspace metadata');
			}
			if (workspace && (params.source !== undefined || params.workingDirectories !== undefined)) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'A createChat workspace cannot be combined with a source or working directories');
			}
			// The default chat is created alongside its session; creating it
			// again is a no-op. Any other chat URI spins up an additional chat.
			const defaultChat = state.defaultChat ?? this._chatOwnership.getDefaultChat(params.channel);
			if (defaultChat !== undefined && URI.parse(params.chat).toString() === URI.parse(defaultChat).toString()) {
				if (workspace) {
					throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'The default chat cannot get a workspace of its own');
				}
				if (params.initialMessage === undefined) {
					return null;
				}
			}
			const chatUriError = createChatUriError(defaultChat, state.chats.map(existing => existing.resource), params.chat);
			if (chatUriError !== undefined) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, chatUriError);
			}
			if (workspace) {
				await this._requireChatWorkspaceGrants(_client, workspace);
			}
			const source = params.source;
			let options: IAgentCreateChatRequestOptions | undefined = params.title !== undefined || params.workingDirectories !== undefined || params.initialMessage !== undefined || workspace !== undefined
				? {
					...(params.title !== undefined ? { title: params.title } : {}),
					...(params.workingDirectories !== undefined ? { workingDirectories: params.workingDirectories.map(directory => URI.parse(directory)) } : {}),
					...(params.initialMessage !== undefined ? { initialMessage: params.initialMessage } : {}),
					...(workspace !== undefined ? { workspace } : {}),
				}
				: undefined;
			if (source) {
				switch (source.kind) {
					case ChatSourceKind.Fork:
						options = {
							...(params.title !== undefined ? { title: params.title } : {}),
							...(params.initialMessage !== undefined ? { initialMessage: params.initialMessage } : {}),
							fork: { source: URI.parse(source.chat), turnId: source.turnId },
						};
						break;
					case ChatSourceKind.SideChat:
						options = {
							...options,
							sideChat: {
								source: URI.parse(source.chat),
								turnId: source.turnId,
								...(source.selection ? { selection: source.selection } : {}),
							},
						};
						break;
					default:
						throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Unsupported createChat source kind: ${String((source as { kind?: unknown }).kind)}`);
				}
			}
			const create = () => this._agentService.createChat(
				URI.parse(params.channel),
				URI.parse(params.chat),
				options,
				this._config.scopedRelayCredentials ? this._getScopedAuthentication(_client) : undefined,
				params.initialMessage === undefined
					? undefined
					: {
						clientId: _client.clientId,
						telemetryContext: _client.telemetryContext,
					},
			);
			await (workspace !== undefined ? withChatWorkspaceErrors(create) : create());
			return null;
		},
		moveChat: async (client, params) => {
			if (!isAhpChatChannel(params.channel) || !this._isChannelVisible(client, params.channel)) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a chat: ${params.channel}`);
			}
			const owner = await this._resolveChatOwner(params.channel);
			if (!owner) {
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Chat not found: ${params.channel}`);
			}
			const destination = params.destination;
			let resolved: AgentChatMoveDestination;
			switch (destination?.kind) {
				case ChatMoveDestinationKind.Session:
					if (typeof destination.session !== 'string' || (destination.after !== undefined && typeof destination.after !== 'string')) {
						throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'A session destination needs a session URI and an optional chat URI to place after');
					}
					if (!this._isSessionVisible(client, destination.session)) {
						throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${destination.session}`);
					}
					resolved = { kind: 'session', session: URI.parse(destination.session), after: destination.after === undefined ? undefined : URI.parse(destination.after) };
					break;
				case ChatMoveDestinationKind.NewSession:
					resolved = { kind: 'newSession' };
					break;
				default:
					throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Unsupported moveChat destination kind: ${String((destination as { kind?: unknown } | undefined)?.kind)}`);
			}
			try {
				const session = await this._agentService.moveChat(owner, URI.parse(params.channel), resolved);
				return { session: session.toString() };
			} catch (error) {
				if (error instanceof AgentChatMoveRefusedError) {
					// A refusal changes nothing; `reason` lets clients explain it.
					throw new ChatMoveRefusedProtocolError(error);
				}
				throw error;
			}
		},
		createTcpConnection: async () => {
			throw new ProtocolError(JsonRpcErrorCodes.MethodNotFound, 'Method not found: createTcpConnection');
		},
		disposeChat: async (_client, params) => {
			const chat = URI.parse(params.channel);
			const owner = isAhpChatChannel(params.channel) ? await this._resolveChatOwner(params.channel) : undefined;
			if (!owner) {
				this._logService.trace(`[ProtocolServer] disposeChat: no owner recorded for ${params.channel}`);
				return null;
			}
			await this._agentService.disposeChat(owner, chat);
			return null;
		},
		resourceWrite: async (_client, params) => {
			return this._agentService.resourceWrite(params);
		},
		listSessions: async (client) => {
			// Only a client that places a chat by its URI needs to know which chats moved; it sees none of them until then.
			const [sessions] = await Promise.all([this._agentService.listSessions(), client.legacyChatUris ? this._stateManager.whenMovedChatOriginsSettled() : undefined]);
			const visible = await Promise.all(sessions.map(async s => this._isSessionVisible(client, s.session.toString(), s.chats?.find(chat => chat.kind === 'default')?.chat.toString() ?? this._chatOwnership.getDefaultChat(s.session.toString()))
				&& (!this._config.relayRoots || (s.workingDirectories?.length && (await Promise.all(s.workingDirectories.map(directory => this._isGrantedRelayDirectory(directory.toString())))).every(Boolean)))));
			const items = sessions.filter((_, index) => visible[index]).map(toListedSessionSummary);
			let prepared = this._stateManager.prepareSessionSummariesForListing(items)
				.filter(item => this._isSessionVisible(client, item.resource, item.defaultChat))
				.filter(summary => !this._config.sessionSummaryFilter || this._config.sessionSummaryFilter(summary))
				.map(item => item.chats ? { ...item, chats: [...this._filterVisibleChats(client, item.resource, item.chats, chat => chat.resource)] } : item);
			if (this._config.relayRoots) {
				const granted = await Promise.all(prepared.map(async item => {
					if (!item.workingDirectories?.length || !(await Promise.all(item.workingDirectories.map(directory => this._isGrantedRelayDirectory(directory)))).every(Boolean)) {
						return undefined;
					}
					return {
						...item,
						...(item.project && !await this._isGrantedRelayDirectory(item.project.uri) ? { project: undefined } : {}),
					};
				}));
				prepared = granted.filter(isDefined);
			}
			const listed = this._config.sessionListAdapter ? this._config.sessionListAdapter(prepared) : prepared;
			if (this._config.sessionSummaryFilter) {
				for (const summary of listed) {
					client.knownSessionSummaries.add(summary.resource);
				}
			}
			return { items: listed };
		},
		listAutomationTriggerDefinitions: async (_client, params) => {
			return this._agentService.listAutomationTriggerDefinitions(params);
		},
		runAutomation: async (_client, params) => {
			if (this._config.scopedRelayCredentials) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Automations do not support client-owned credentials');
			}
			return this._agentService.runAutomation(params);
		},
		fetchAutomationRuns: async (_client, params) => {
			return this._agentService.fetchAutomationRuns(params);
		},
		resolveSessionConfig: async (_client, params) => {
			const result = await this._agentService.resolveSessionConfig({
				provider: params.provider,
				workingDirectory: params.workingDirectory ? URI.parse(params.workingDirectory) : undefined,
				config: this._config.sessionConfigAdapter ? this._config.sessionConfigAdapter.fromClientValues(params.config) : params.config,
			});
			return this._config.sessionConfigAdapter ? this._config.sessionConfigAdapter.toClientConfig(result) : result;
		},
		sessionConfigCompletions: async (_client, params) => {
			return this._agentService.sessionConfigCompletions({
				provider: params.provider,
				workingDirectory: params.workingDirectory ? URI.parse(params.workingDirectory) : undefined,
				config: this._config.sessionConfigAdapter ? this._config.sessionConfigAdapter.fromClientValues(params.config) : params.config,
				property: this._config.sessionConfigAdapter ? this._config.sessionConfigAdapter.fromClientProperty(params.property) : params.property,
				query: params.query,
			});
		},
		completions: async (_client, params) => {
			return this._agentService.completions(params);
		},
		fetchTurns: async (_client, params) => {
			const state = this._stateManager.getChatState(params.channel);
			if (!state) {
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${params.channel}`);
			}
			if (params.cursor && params.cursor !== state.turnsNextCursor) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Unrecognized fetchTurns cursor`);
			}
			this._stateManager.dispatchServerAction(params.channel, {
				type: ActionType.ChatTurnsLoaded,
				turns: [],
			});
			return {};
		},
		resourceList: async (_client, params) => {
			return this._agentService.resourceList(URI.parse(params.uri));
		},
		resourceRead: async (_client, params) => {
			return this._agentService.resourceRead(URI.parse(params.uri), params.encoding);
		},
		resourceCopy: async (_client, params) => {
			return this._agentService.resourceCopy(params);
		},
		resourceDelete: async (_client, params) => {
			return this._agentService.resourceDelete(params);
		},
		resourceMove: async (_client, params) => {
			return this._agentService.resourceMove(params);
		},
		resourceResolve: async (_client, params) => {
			return this._agentService.resourceResolve(params);
		},
		resourceMkdir: async (_client, params) => {
			return this._agentService.resourceMkdir(params);
		},
		createResourceWatch: async (_client, params) => {
			return this._agentService.createResourceWatch(params);
		},
		resourceRequest: async (_client, _params) => {
			// The local agent host does not yet enforce per-resource grants
			// for client → server access. Always grant; receivers MAY rescind
			// access by returning `PermissionDenied` on subsequent operations.
			return {};
		},
		authenticate: async (_client, params) => {
			if (this._config.scopedRelayCredentials) {
				if (_client.transport.relayPassive && params.resource !== _client.transport.relayAuthentication?.resource) {
					throw new ProtocolError(AhpErrorCodes.PermissionDenied, readOnlyConnectionMessage);
				}
				const result = await this._agentService.authenticate(params, this._getScopedAuthentication(_client));
				const identity = _client.transport.relayAuthentication;
				if (!result.authenticated && !(identity?.authenticated === true && params.resource === identity.resource)) {
					throw new ProtocolError(AHP_AUTH_REQUIRED, `Authentication failed for resource: ${params.resource}`);
				}
				await this._config.extension?.initialize();
				this._captureRelayAuthorization(_client)();
				return {};
			}
			const authentication = _client.transport.relayAuthenticate ? await _client.transport.relayAuthenticate(params) : params;
			const checkAuthorization = this._captureRelayAuthorization(_client);
			if (_client.disposables.isDisposed) {
				throw new ProtocolError(AHP_AUTH_REQUIRED, 'Relay connection ended during authentication');
			}
			if (_client.transport.relayPassive) {
				await this._config.extension?.initialize();
				checkAuthorization();
				return {};
			}
			const result = await this._agentService.authenticate(authentication);
			checkAuthorization();
			const relayAuthentication = _client.transport.relayAuthentication;
			const relayIdentityAuthenticated = relayAuthentication?.authenticated === true && params.resource === relayAuthentication.resource;
			if (!result.authenticated && !relayIdentityAuthenticated) {
				throw new ProtocolError(AHP_AUTH_REQUIRED, `Authentication failed for resource: ${params.resource}`);
			}
			await this._config.extension?.initialize();
			checkAuthorization();
			return {};
		},
		createTerminal: async (client, params) => {
			await this._agentService.createTerminal(params, client.telemetryContext.clientType);
			return null;
		},
		disposeTerminal: async (_client, params) => {
			await this._agentService.disposeTerminal(URI.parse(params.channel));
			return null;
		},
		invokeChangesetOperation: async (_client, params) => {
			return this._agentService.invokeChangesetOperation(params, this._config.scopedRelayCredentials ? this._getScopedAuthentication(_client) : undefined);
		},
	};

	private readonly _requestResultProjectors: RequestResultProjectorMap = {
		listSessions: (client, result) => client.transport.relayAuthentication?.authenticated === false
			? { ...result, items: result.items.map(summary => withholdSessionSummaryDetails(summary)) }
			: result,
		subscribe: (client, result) => result.snapshot
			? { ...result, snapshot: this._projectRelayRootSnapshot(client, result.snapshot) as SubscribeResult['snapshot'] }
			: result,
	};


	// ---- Reverse RPC (server → client requests) ----------------------------

	private _reverseRequestId = 0;
	private readonly _pendingReverseRequests = new Map<number, { client: IConnectedClient; resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();
	private readonly _inflightRequests = new Set<Promise<unknown>>();

	/**
	 * Sends a JSON-RPC request to a connected client and waits for the response.
	 * Used for reverse-RPC operations like reading client-side files.
	 * Rejects if the client disconnects or the server is disposed.
	 */
	private _sendReverseRequest<T>(clientId: string, method: string, params: unknown): Promise<T> {
		const client = this._getActiveClient(clientId);
		if (!client) {
			return Promise.reject(new Error(`Client ${clientId} is not connected`));
		}
		return this._sendReverseRequestToConnection(client, method, params);
	}

	private _sendReverseRequestToConnection<T>(client: IConnectedClient, method: string, params: unknown): Promise<T> {
		const checkAuthorization = this._captureRelayAuthorization(client);
		const id = ++this._reverseRequestId;
		return new Promise<T>((resolve, reject) => {
			this._pendingReverseRequests.set(id, { client, resolve: resolve as (value: unknown) => void, reject });
			const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
			client.transport.send(request);
		}).then(result => {
			checkAuthorization();
			return result;
		});
	}

	/**
	 * Rejects and clears all pending reverse-RPC requests sent over a given
	 * connection.
	 */
	private _rejectPendingReverseRequestsForConnection(client: IConnectedClient, error?: ProtocolError): void {
		for (const [id, pending] of this._pendingReverseRequests) {
			if (pending.client === client) {
				this._pendingReverseRequests.delete(id);
				pending.reject(error ?? new Error(`Client ${client.clientId} disconnected`));
			}
		}
	}

	private _handleRequest(client: IConnectedClient, method: string, params: unknown, id: number): void {
		const authentication = client.transport.relayAuthentication;
		if (authentication?.authenticated === false && requiresRelayAuthentication(method, params)) {
			const error = new ProtocolError(AHP_AUTH_REQUIRED, 'Relay identity authentication is required', {
				resources: [{ resource: authentication.resource, required: true }],
			} satisfies AuthRequiredErrorData);
			this._logRelayAuthorizationFailure(client, error, 'admission');
			client.transport.send(jsonRpcErrorFrom(id, error));
			return;
		}
		if (client.transport.relayClientId !== undefined && this._config.relayResourceRoots && method !== 'dispatchAction') {
			const authorize = async () => {
				const checkAuthorization = this._captureRelayRequestAuthorization(client, method, params);
				await this._requireRelayResourceAccess(client, method, params);
				checkAuthorization?.();
			};
			this._trackRequest(authorize()).then(() => {
				if (!client.disposables.isDisposed) {
					this._handleAuthorizedRequest(client, method, params, id);
				}
			}).catch(error => {
				this._logService.warn('[ProtocolServer] Relay resource access denied', error);
				if (!client.disposables.isDisposed) {
					client.transport.send(jsonRpcErrorFrom(id, error));
				}
			});
			return;
		}
		this._handleAuthorizedRequest(client, method, params, id);
	}

	private _handleAuthorizedRequest(client: IConnectedClient, method: string, params: unknown, id: number): void {
		let checkAuthorization: (() => void) | undefined;
		try {
			checkAuthorization = this._captureRelayRequestAuthorization(client, method, params);
		} catch (error) {
			client.transport.send(jsonRpcErrorFrom(id, error));
			return;
		}
		if (method === 'dispatchAction' || method === 'unsubscribe') {
			this._trackRequest(this._handleLegacyNotificationRequest(client, method, params)).then(
				result => {
					if (!client.disposables.isDisposed) {
						try {
							checkAuthorization?.();
							client.transport.send(jsonRpcSuccess(id, result));
						} catch (error) {
							client.transport.send(jsonRpcErrorFrom(id, error));
						}
					}
				},
				error => {
					if (client.disposables.isDisposed) {
						return;
					}
					this._logService.error(`[ProtocolServer] Request '${method}' failed`, error);
					client.transport.send(jsonRpcErrorFrom(id, error));
				},
			);
			return;
		}
		const handler = this._requestHandlers.hasOwnProperty(method) ? this._requestHandlers[method as RequestMethod] : undefined;
		if (client.transport.relayPassive && !new Set([
			'authenticate', 'subscribe', 'listSessions', 'listChats', 'listModels', 'listAgents',
			'resolveSessionConfig', 'sessionConfigCompletions', 'completions', 'fetchTurns',
			'resourceList', 'resourceRead', 'resourceResolve',
		]).has(method) && (handler || client.transport.relayClientId === undefined || !this._config.extension?.requests.get(method)?.readOnly)) {
			client.transport.send(jsonRpcError(id, JsonRpcErrorCodes.InvalidRequest, readOnlyConnectionMessage));
			return;
		}
		if (this._config.relayRoots && method !== 'createSession' && requiresRelayAuthentication(method, params)) {
			client.transport.send(jsonRpcError(id, JsonRpcErrorCodes.MethodNotFound, `Method not available to relay clients: ${method}`));
			return;
		}
		if (handler) {
			this._handleRequestWithHandler(client, method as RequestMethod, params, id, checkAuthorization);
			return;
		}

		// VS Code extension methods (not in the typed protocol maps yet)
		const extensionResult = client.devContainers?.handleRequest(method, params) ?? this._handleExtensionRequest(client, method, params);
		if (extensionResult) {
			this._trackRequest(extensionResult).then(result => {
				if (client.disposables.isDisposed) {
					return;
				}
				checkAuthorization?.();
				client.transport.send(jsonRpcSuccess(id, result ?? null));
			}).catch(err => {
				if (client.disposables.isDisposed) {
					return;
				}
				logFailedRequest(this._logService, `[ProtocolServer] Extension request '${method}' failed`, err);
				client.transport.send(jsonRpcErrorFrom(id, err));
			});
			return;
		}

		// MCP side-channel: requests targeting an `mcp://` channel carry the
		// channel URI in `params.channel`. We forward them through the
		// agent service, which routes by `<providerId>/<sessionId>/<serverName>`
		// to the owning agent's MCP App implementation. Unknown channels and
		// unknown methods are rejected with `-32601`.
		const mcpChannel = readMcpChannel(params);
		if (mcpChannel !== undefined) {
			const paramsObj = isParamsObject(params) ? params : undefined;
			this._trackRequest(this._agentService.handleMcpRequest(mcpChannel, method, paramsObj)).then(result => {
				if (client.disposables.isDisposed) {
					return;
				}
				checkAuthorization?.();
				client.transport.send(jsonRpcSuccess(id, result ?? null));
			}).catch(err => {
				if (client.disposables.isDisposed) {
					return;
				}
				if (err instanceof Error && err.message.startsWith('Method not found')) {
					client.transport.send(jsonRpcError(id, JsonRpcErrorCodes.MethodNotFound, err.message));
					return;
				}
				this._logService.error(`[ProtocolServer] mcp:// request '${method}' on ${mcpChannel} failed`, err);
				client.transport.send(jsonRpcErrorFrom(id, err));
			});
			return;
		}

		client.transport.send(jsonRpcError(id, JsonRpcErrorCodes.MethodNotFound, `Method not found: ${method}`));
	}

	private _handleRequestWithHandler<M extends RequestMethod>(client: IConnectedClient, method: M, params: unknown, id: number, checkAuthorization: () => void): void {
		const handler = this._requestHandlers[method] as (client: IConnectedClient, params: unknown) => Promise<CommandMap[M]['result']>;
		this._trackRequest(handler(client, params)).then(result => {
			if (client.disposables.isDisposed) {
				return;
			}
			this._logService.trace(`[ProtocolServer] Request '${method}' id=${id} succeeded`);
			checkAuthorization();
			const projected = this._requestResultProjectors[method]?.(client, result) ?? result;
			client.transport.send(jsonRpcSuccess(id, projected ?? null));
		}).catch(error => {
			if (client.disposables.isDisposed) {
				return;
			}
			if (error instanceof SubscriptionCancelledError) {
				this._logService.trace(`[ProtocolServer] Request '${method}' id=${id} cancelled`, error.message);
			} else if (shouldLogFailedRequest(method, params, error)) {
				logFailedRequest(this._logService, `[ProtocolServer] Request '${method}' id=${id} failed`, error);
			}
			client.transport.send(jsonRpcErrorFrom(id, error));
		});
	}

	private async _dispatchClientAction(client: IConnectedClient, params: DispatchActionParams): Promise<void> {
		const checkAuthorization = this._captureRelayAuthorization(client);
		if (client.transport.relayClientId !== undefined && this._config.relayResourceRoots) {
			return this._relayClientDispatchSequencer.queue(client.clientId, () => this._dispatchClientActionNow(client, params, checkAuthorization));
		}
		return this._dispatchClientActionNow(client, params, checkAuthorization);
	}

	private async _dispatchClientActionNow(client: IConnectedClient, params: DispatchActionParams, checkAuthorization: () => void): Promise<void> {
		checkAuthorization();
		this._logService.trace(`[ProtocolServer] dispatchAction: ${JSON.stringify(params.action.type)}`);
		let action = params.action;
		const origin = { clientId: client.clientId, clientSeq: params.clientSeq };
		let rejection: string | undefined;
		if (client.transport.relayAuthentication?.authenticated === false
			|| (client.transport.relayClientId !== undefined && action.type === ActionType.RootConfigChanged && client.transport.relayAuthentication?.authenticated !== true)) {
			rejection = 'Relay identity authentication is required';
		} else if (client.transport.relayPassive) {
			rejection = readOnlyConnectionMessage;
		} else if (IS_CLIENT_DISPATCHABLE[action.type] !== true) {
			rejection = `Server-only action: ${action.type}`;
		} else if (UNSUPPORTED_CLIENT_ACTION_TYPES.has(action.type)) {
			rejection = `Unsupported action: ${action.type}`;
		}
		if (!rejection && client.transport.relayClientId !== undefined && this._config.relayResourceRoots && action.type === ActionType.SessionWorkingDirectorySet) {
			try {
				if (!await this._isGrantedRelayResource(action.directory, false)) {
					rejection = 'Working directory is outside the host workspace grants';
				}
			} catch (error) {
				this._logService.warn('[ProtocolServer] Invalid relay working-directory resource', error);
				rejection = 'Working-directory resource could not be authorized';
			}
		}
		if (client.disposables.isDisposed) {
			return;
		}
		checkAuthorization();
		if (!rejection && client.transport.relayClientId !== undefined && action.type === ActionType.RootConfigChanged) {
			const current = this._stateManager.rootState.config;
			const values = this._config.extension ? withoutConfigOverlay(action.config, this._config.extension.rootConfig.values) : { ...action.config };
			for (const [key, schema] of Object.entries(current?.schema.properties ?? {})) {
				if (!schema.readOnly) {
					continue;
				}
				if (Object.hasOwn(values, key) && !equals(values[key], current?.values[key])) {
					rejection = `Host configuration property is read-only: ${key}`;
					break;
				}
				if (action.replace && current && Object.hasOwn(current.values, key)) {
					values[key] = current.values[key];
				}
			}
			if (!rejection) {
				action = { ...action, config: values };
			}
		}
		if (!rejection && this._config.sessionConfigAdapter && (action.type === ActionType.SessionConfigChanged || action.type === ActionType.ChatConfigChanged)) {
			try {
				action = { ...action, config: this._config.sessionConfigAdapter.fromClientValues(action.config) };
			} catch (error) {
				if (!(error instanceof ProtocolError)) {
					throw error;
				}
				rejection = error.message;
			}
		}
		if (rejection) {
			this._logService.warn(`[ProtocolServer] rejecting client action: ${rejection}`);
			this._stateManager.rejectClientAction(params.channel, action, origin, rejection);
		} else if (isHandledClientAction(action)) {
			return this._agentService.dispatchAction(params.channel, action, client.clientId, params.clientSeq, client.telemetryContext,
				this._config.scopedRelayCredentials ? this._getScopedAuthentication(client) : undefined);
		}
	}

	/**
	 * Compatibility workaround for clients that send AHP's dispatchAction and unsubscribe notifications as requests.
	 * Dispatch replies acknowledge the authoritative echo, not a separate application path.
	 */
	private async _handleLegacyNotificationRequest(client: IConnectedClient, method: 'dispatchAction' | 'unsubscribe', params: unknown): Promise<{ serverSeq: number } | null> {
		if (!isParamsObject(params) || typeof params.channel !== 'string') {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'A channel is required');
		}
		if (method === 'unsubscribe') {
			this._removeSubscription(client, params.channel);
			return null;
		}
		if (this._config.relayRoots) {
			throw new ProtocolError(JsonRpcErrorCodes.MethodNotFound, 'Action dispatch is unavailable to restricted relay clients');
		}
		if (!isDispatchActionParams(params)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'A client sequence and action type are required');
		}
		return this._handleDispatchActionRequest(client, params);
	}

	private async _handleDispatchActionRequest(client: IConnectedClient, params: DispatchActionParams): Promise<{ serverSeq: number }> {
		if (!this._stateManager.getSnapshot(params.channel)) {
			return { serverSeq: -1 };
		}
		const listeners = new DisposableStore();
		let serverSeq: number | undefined;
		const cancellation = listeners.add(new CancellationTokenSource());
		const cancelOnDisconnect = client.disposables.add(toDisposable(() => cancellation.cancel()));
		try {
			const envelopes = Event.any(this._stateManager.onDidEmitEnvelope, this._stateManager.onDidRejectClientAction);
			listeners.add(Event.once(Event.filter(envelopes, envelope =>
				envelope.channel === params.channel && envelope.origin?.clientId === client.clientId && envelope.origin.clientSeq === params.clientSeq,
			))(envelope => { serverSeq = envelope.serverSeq; }));
			const acknowledgement = Promise.resolve(this._dispatchClientAction(client, params)).then(() => {
				if (serverSeq === undefined) {
					throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, 'Action completed without an authoritative acknowledgement');
				}
				return { serverSeq };
			});
			const result = await raceTimeout(raceCancellationError(acknowledgement, cancellation.token), CLIENT_ACTION_ACKNOWLEDGEMENT_TIMEOUT);
			if (result === undefined) {
				throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, 'Action acknowledgement timed out; outcome is unknown');
			}
			return result;
		} finally {
			client.disposables.delete(cancelOnDisconnect);
			listeners.dispose();
		}
	}

	private _verifyRelayClient(transport: IProtocolTransport, clientId: string): void {
		if (transport.relayClientId !== undefined && transport.relayClientId !== clientId) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Client ID does not match relay lane');
		}
		if (transport.relayClientId !== undefined && !this._clients.has(clientId) && this._clientConnections.hasSeenClient(clientId)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Relay client ID collides with another host connection');
		}
	}

	private async _requireRelayResourceAccess(client: IConnectedClient, method: string, params: unknown): Promise<void> {
		if (client.transport.relayClientId === undefined || !this._config.relayResourceRoots) {
			return;
		}
		// MCP resources/* methods use provider-owned app authorization, not filesystem grants.
		const configProbe = method === 'resolveSessionConfig' || method === 'sessionConfigCompletions';
		const fields = method === 'resourceCopy' || method === 'resourceMove' ? ['source', 'destination']
			: ['resourceList', 'resourceRead', 'resourceWrite', 'resourceDelete', 'resourceResolve', 'resourceMkdir', 'resourceRequest', 'createResourceWatch'].includes(method) ? ['uri']
				: method === 'createTerminal' ? ['cwd']
					: configProbe && isParamsObject(params) && params.workingDirectory !== undefined ? ['workingDirectory'] : [];
		for (const field of fields) {
			const value = isParamsObject(params) ? params[field] ?? (field === 'cwd' ? this._config.defaultDirectory : undefined) : undefined;
			const readOnly = configProbe || ['resourceRead', 'resourceList', 'resourceResolve', 'createResourceWatch'].includes(method) || (method === 'resourceCopy' && field === 'source') || (method === 'resourceRequest' && isParamsObject(params) && params.write !== true);
			if (typeof value !== 'string' || (!await this._isGrantedRelayResource(value, readOnly) && !await this._isPublishedPlanResource(value, method, readOnly))) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Resource is outside the host workspace grants');
			}
			if (field === 'cwd') {
				let directory = false;
				try {
					directory = (await stat(URI.parse(value).fsPath)).isDirectory();
				} catch (error) {
					if (!isParamsObject(error) || (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')) {
						throw error;
					}
				}
				if (!directory) {
					throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Terminal cwd must be an existing granted directory');
				}
			}
		}
	}

	private async _isPublishedPlanResource(resource: string, method: string, readOnly: boolean): Promise<boolean> {
		if (!['resourceRead', 'resourceResolve', 'createResourceWatch', 'resourceWrite', 'resourceRequest'].includes(method)) {
			return false;
		}
		const uri = URI.parse(resource, true);
		if (uri.scheme !== Schemas.file || uri.authority || uri.query || uri.fragment) {
			return false;
		}
		for (const session of this._stateManager.getExposedSessionKeys()) {
			for (const chat of this._stateManager.getSessionState(session)?.chats ?? []) {
				const state = this._stateManager.getChatState(chat.resource);
				const turns = state ? [...state.turns, ...(state.activeTurn ? [state.activeTurn] : [])] : [];
				const published = turns.some(turn => turn.responseParts.some(part =>
					part.kind === ResponsePartKind.InputRequest
					&& isChatInputRequestWithPlanReview(part.request)
					&& part.request.planReview?.planUri !== undefined
					&& (readOnly || (turn === state?.activeTurn && part.response === undefined && part.request.planReview.canProvideFeedback))
					&& extUriBiasedIgnorePathCase.isEqual(uri, URI.parse(part.request.planReview.planUri))
				));
				if (!published) {
					continue;
				}
				const owned = this._agentService.getSessionPlanFile?.(URI.parse(session), URI.parse(chat.resource));
				if (!owned || !extUriBiasedIgnorePathCase.isEqual(uri, owned)) {
					continue;
				}
				// Neither the session directory nor its plan may redirect to a different artifact.
				try {
					const directory = dirname(owned.fsPath);
					const expectedDirectory = resolve(await realpath(dirname(directory)), basename(directory));
					return relative(expectedDirectory, await realpath(directory)) === ''
						&& relative(resolve(expectedDirectory, basename(owned.fsPath)), await realpath(owned.fsPath)) === ''
						&& relative(resolve(expectedDirectory, basename(owned.fsPath)), await realpath(uri.fsPath)) === ''
						&& (await stat(uri.fsPath)).isFile();
				} catch (error) {
					if (isParamsObject(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
						return false;
					}
					throw error;
				}
			}
		}
		return false;
	}

	/**
	 * The live session that owns the data at `storage`, which content URIs embed: a chat's owner, a session itself,
	 * else the owner of the chat recorded as storing there (storage → chat → owner, never derived from the address).
	 */
	private _ownerOfStorage(storage: string): string | undefined {
		const isLive = (session: string | undefined) => session !== undefined && (!!this._stateManager.getSessionSummary(session) || !!this._stateManager.getSurfacedSessionSummary(session));
		if (isAhpChatChannel(storage)) {
			const owner = this._chatOwnership.getChatOwner(storage);
			return isLive(owner) ? owner : undefined;
		}
		if (isLive(storage)) {
			return storage;
		}
		const owner = this._stateManager.getChatOwnerByStorage(storage);
		return isLive(owner) ? owner : undefined;
	}

	private async _isGrantedRelayResource(resource: string, readOnly: boolean): Promise<boolean> {
		const uri = URI.parse(resource, true);
		if (uri.scheme !== Schemas.file) {
			const gitContent = readOnly ? parseGitBlobUri(resource) : undefined;
			if (gitContent && (!gitContent.sha || gitContent.sha.startsWith('-'))) {
				return false;
			}
			const pendingContent = readOnly ? parsePendingEditContentUri(resource) : undefined;
			const content = readOnly ? parseSessionDbUri(resource) ?? gitContent ?? pendingContent : undefined;
			if (!content) {
				return false;
			}
			const session = this._ownerOfStorage(content.sessionUri);
			if (!session) {
				return false;
			}
			if (pendingContent) {
				// The memory provider keys by path, not authority. Require the exact
				// reference published by an owning chat's pending tool, not just its owner.
				// Worker previews retain their parent's storage URI.
				return this._stateManager.getSessionState(session)?.chats.some(chat =>
					this._stateManager.getChatState(chat.resource)?.activeTurn?.responseParts.some(part =>
						part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.PendingConfirmation
						&& part.toolCall.edits?.items.some(edit =>
							(edit.before?.content.uri && URI.parse(edit.before.content.uri).toString() === uri.toString())
							|| (edit.after?.content.uri && URI.parse(edit.after.content.uri).toString() === uri.toString())
						)
					)
				) === true;
			}
			return true;
		}
		if (uri.authority && !this._config.relayResourceRoots?.(readOnly).some(root => URI.file(root).authority.toLowerCase() === uri.authority.toLowerCase())) {
			return false;
		}
		let ancestor = uri.fsPath;
		let canonical: string;
		while (true) {
			try {
				const resolvedAncestor = await realpath(ancestor);
				if (ancestor !== uri.fsPath && !(await stat(resolvedAncestor)).isDirectory()) {
					return false;
				}
				canonical = resolve(resolvedAncestor, relative(ancestor, uri.fsPath));
				break;
			} catch (error) {
				if (isParamsObject(error) && error.code === 'ENOTDIR') {
					return false;
				}
				if (!isParamsObject(error) || error.code !== 'ENOENT' || dirname(ancestor) === ancestor) {
					throw error;
				}
				try {
					if ((await lstat(ancestor)).isSymbolicLink()) {
						return false;
					}
				} catch (statError) {
					if (!isParamsObject(statError) || statError.code !== 'ENOENT') {
						throw statError;
					}
				}
				ancestor = dirname(ancestor);
			}
		}
		for (const root of this._config.relayResourceRoots?.(readOnly) ?? []) {
			try {
				const relativePath = relative(await realpath(root), canonical);
				if (!isAbsolute(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${sep}`)) {
					return true;
				}
			} catch (error) {
				if (isParamsObject(error) && error.code === 'ENOENT') {
					continue;
				}
				throw error;
			}
		}
		return false;
	}

	private _projectRelayRootSnapshot(client: IConnectedClient, snapshot: IStateSnapshot): IStateSnapshot {
		snapshot = this._projectModelSelections(client, this._projectSnapshotChats(client, this._projectSnapshot(snapshot)));
		if (isAhpRootChannel(snapshot.resource) && hasKey(snapshot.state, { agents: true })) {
			snapshot = { ...snapshot, state: { ...snapshot.state, agents: this._projectModelConfigAliases(client, snapshot.state.agents) } };
		}
		if (client.transport.relayClientId === undefined || !isAhpRootChannel(snapshot.resource) || !hasKey(snapshot.state, { agents: true })) {
			return snapshot;
		}
		const config = this._config.extension
			? deepClone(snapshot.state.config ?? this._config.extension.rootConfig)
			: snapshot.state.config;
		if (this._config.extension) {
			mixin(config, this._config.extension.rootConfig);
		}
		if (client.transport.relayAuthentication?.authenticated === true) {
			return this._config.extension ? { ...snapshot, state: { ...snapshot.state, config } } : snapshot;
		}
		return {
			...snapshot,
			state: {
				agents: projectDiscoveryAgents(snapshot.state.agents),
				config,
				_meta: {
					...this._config.relayRootMeta,
					...this._config.extension?.rootMeta,
				},
			},
		};
	}

	private _projectRelaySnapshots(client: IConnectedClient, snapshots: readonly IStateSnapshot[]): IStateSnapshot[] {
		return snapshots
			.filter(snapshot => client.transport.relayAuthentication?.authenticated !== false || isAhpRootChannel(snapshot.resource))
			.map(snapshot => this._projectRelayRootSnapshot(client, snapshot));
	}

	private _projectRelayReconnectResult(client: IConnectedClient, result: ReconnectResult, requestedSubscriptions: readonly string[]): ReconnectResult {
		if (result.type === ReconnectResultType.Snapshot) {
			return { ...result, snapshots: this._projectRelaySnapshots(client, result.snapshots) };
		}
		const actions = result.actions.filter(envelope => this._isRelevantToClient(client, envelope)).map(envelope => this._projectRelayRootAction(client, envelope));
		const missing = client.transport.relayAuthentication?.authenticated === false
			? [...new Set([...result.missing, ...requestedSubscriptions.filter(channel => !isAhpRootChannel(channel))])]
			: result.missing;
		return { ...result, actions, missing };
	}

	private _captureRelayRequestAuthorization(client: IConnectedClient, method: string, params: unknown): () => void {
		return requiresRelayAuthentication(method, params) ? this._captureRelayAuthorization(client) : () => { };
	}

	private _captureRelayAuthorization(client: IConnectedClient): () => void {
		if (client.transport.relayCaptureAuthorization) {
			let checkAuthorization: () => void;
			try {
				checkAuthorization = client.transport.relayCaptureAuthorization();
			} catch (error) {
				this._logRelayAuthorizationFailure(client, error, 'admission');
				throw error;
			}

			return () => {
				try {
					checkAuthorization();
				} catch (error) {
					this._logRelayAuthorizationFailure(client, error, 'recheck');
					throw error;
				}
			};
		}
		const check = (phase: 'admission' | 'recheck' = 'recheck') => {
			const authentication = client.transport.relayAuthentication;
			if (authentication?.authenticated === false) {
				const error = new ProtocolError(AHP_AUTH_REQUIRED, 'Relay identity authentication is required', {
					resources: [{ resource: authentication.resource, required: true }],
				} satisfies AuthRequiredErrorData);
				this._logRelayAuthorizationFailure(client, error, phase);
				throw error;
			}
		};
		check('admission');
		return check;
	}

	private _getScopedAuthentication(client: IConnectedClient): IAgentHostAuthenticationScope {
		if (client.authenticationScope) {
			return client.authenticationScope;
		}
		const authentication = client.transport.relayAuthentication;
		if (!authentication?.owner || !client.transport.relayAuthenticate) {
			throw new ProtocolError(AHP_AUTH_REQUIRED, 'Client-owned credentials require a validated relay owner');
		}
		const principal = { apiOrigin: authentication.resource, userId: authentication.owner };
		const resolveCredentials = this._config.resolveRelayCredentials;
		client.authenticationScope = client.disposables.add(new AgentHostAuthenticationScope(
			params => {
				if (!client.transport.relayAuthenticate) {
					throw new ProtocolError(AHP_AUTH_REQUIRED, 'Relay authentication is unavailable');
				}
				return client.transport.relayAuthenticate(params);
			},
			() => this._captureRelayAuthorization(client)(),
			principal,
			resolveCredentials ? resource => resolveCredentials(principal, resource) : undefined,
		));
		return client.authenticationScope;
	}

	private _logRelayAuthorizationFailure(client: IConnectedClient, error: unknown, phase: 'admission' | 'recheck'): void {
		if (error instanceof ProtocolError && error.code === AHP_AUTH_REQUIRED) {
			const identityAuthenticated = client.transport.relayAuthentication?.authenticated === true;
			const reason = client.disposables.isDisposed ? 'connectionClosed'
				: identityAuthenticated ? 'authorizationInvalidated' : 'identityUnauthenticated';
			this._logService.warn(`[ProtocolServer] Relay authorization rejected: clientId=${client.clientId} phase=${phase} reason=${reason} identityAuthenticated=${identityAuthenticated}`);
		}
	}

	private _getSnapshot(channel: string): IStateSnapshot | undefined {
		const source = this._stateManager.getSnapshot(channel);
		const snapshot = source && this._projectSnapshot(source);
		if (snapshot && (this._config.relayRootMeta || this._config.extension) && isAhpRootChannel(channel) && hasKey(snapshot.state, { agents: true })) {
			return {
				...snapshot, state: {
					...snapshot.state, _meta: {
						...snapshot.state._meta, ...this._config.relayRootMeta,
						...this._config.extension?.rootMeta,
					}
				}
			};
		}
		return snapshot;
	}

	private _projectSnapshot(snapshot: IStateSnapshot): IStateSnapshot {
		if (this._config.sessionConfigAdapter && hasKey(snapshot.state, { chats: true }) && snapshot.state.config) {
			snapshot = { ...snapshot, state: { ...snapshot.state, config: this._config.sessionConfigAdapter.toClientConfig(snapshot.state.config) } };
		} else if (this._config.sessionConfigAdapter && isAhpChatChannel(snapshot.resource) && hasKey(snapshot.state, { turns: true }) && snapshot.state.config) {
			snapshot = { ...snapshot, state: { ...snapshot.state, config: { ...snapshot.state.config, values: this._config.sessionConfigAdapter.toClientValues(snapshot.state.config.values) } } };
		}
		if (!this._config.advertisedModelProviders || !isAhpRootChannel(snapshot.resource) || !hasKey(snapshot.state, { agents: true })) {
			return snapshot;
		}
		return { ...snapshot, state: { ...snapshot.state, agents: this._projectAgentModels(snapshot.state.agents) } };
	}

	private _projectAgentModels(agents: RootState['agents']): RootState['agents'] {
		const providers = this._config.advertisedModelProviders;
		return providers ? agents.map(agent => providers.includes(agent.provider) ? agent : { ...agent, models: [] }) : agents;
	}

	private _projectModelConfigAliases(client: IConnectedClient, agents: RootState['agents']): RootState['agents'] {
		if (getAgentHostClientType(client.clientInfo) === AgentHostClientType.Unknown) {
			return agents;
		}
		return agents.map(agent => agent.provider !== COPILOT_CLI_AGENT_PROVIDER_ID ? agent : {
			...agent,
			models: agent.models.map(model => {
				if (!model.configSchema) {
					return model;
				}
				const properties = { ...model.configSchema.properties };
				// VS Code receives one spelling before generic configuration code applies schema defaults.
				if (properties.thinkingLevel) {
					delete properties.reasoningEffort;
				}
				if (properties.tier) {
					delete properties.autoTier;
				}
				return { ...model, configSchema: { ...model.configSchema, properties } };
			}),
		});
	}

	private _usesCopilotModelConfig(channel: string): boolean {
		const session = this._chatOwnership.getChatOwner(channel) ?? channel;
		return this._stateManager.getSessionSummary(session)?.provider === COPILOT_CLI_AGENT_PROVIDER_ID;
	}

	private _projectModelSelections(client: IConnectedClient, snapshot: IStateSnapshot): IStateSnapshot {
		const vscode = getAgentHostClientType(client.clientInfo) !== AgentHostClientType.Unknown;
		if (isAhpAutomationCatalogChannel(snapshot.resource) && hasKey(snapshot.state, { entries: true })) {
			return { ...snapshot, state: { ...snapshot.state, entries: snapshot.state.entries.map(entry => projectCopilotAutomation(entry, vscode)) } };
		}
		if (!this._usesCopilotModelConfig(snapshot.resource) || !hasKey(snapshot.state, { turns: true })) {
			return snapshot;
		}
		const state = snapshot.state;
		return {
			...snapshot, state: {
				...state,
				turns: state.turns.map(turn => projectCopilotTurn(turn, vscode)),
				...(state.activeTurn ? { activeTurn: projectCopilotTurn(state.activeTurn, vscode) } : {}),
				...(state.draft ? { draft: projectCopilotMessage(state.draft, vscode) } : {}),
				...(state.steeringMessage ? { steeringMessage: { ...state.steeringMessage, message: projectCopilotMessage(state.steeringMessage.message, vscode) } } : {}),
				...(state.queuedMessages ? { queuedMessages: state.queuedMessages.map(pending => ({ ...pending, message: projectCopilotMessage(pending.message, vscode) })) } : {}),
			}
		};
	}

	/** A requested chat folder joins the session's workspace, so it needs the same grants as a session's folders. */
	private async _requireChatWorkspaceGrants(client: IConnectedClient, workspace: IAgentCreateChatWorkspace): Promise<void> {
		if (workspace.kind !== 'folder') {
			return;
		}
		const checkAuthorization = this._captureRelayAuthorization(client);
		const folder = workspace.folder.toString();
		if (client.transport.relayClientId !== undefined && this._config.relayResourceRoots && !await this._isGrantedRelayResource(folder, false)) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Chat workspace is outside the host workspace grants');
		}
		if (this._config.relayRoots && !await this._isGrantedRelayDirectory(folder)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Working directory is not an explicitly granted project root');
		}
		checkAuthorization();
	}

	private _requireRelayMutation(client: IConnectedClient): void {
		if (this._config.relayRoots && client.transport.relayPassive !== false) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidRequest, readOnlyConnectionMessage);
		}
	}

	private async _isGrantedRelayDirectory(directory: string): Promise<boolean> {
		if (!this._config.relayRoots) {
			return true;
		}
		try {
			const uri = URI.parse(directory, true);
			if (uri.scheme !== 'file') {
				return false;
			}
			const path = await realpath(uri.fsPath);
			return this._config.relayRoots.some(root => {
				const pathFromRoot = relative(root, path);
				return !pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot);
			});
		} catch {
			return false;
		}
	}

	async whenIdle(): Promise<void> {
		while (this._inflightRequests.size > 0) {
			await Promise.all([...this._inflightRequests].map(promise => promise.then(() => { }, () => { })));
		}
	}

	private _trackRequest<T>(promise: Promise<T>): Promise<T> {
		this._inflightRequests.add(promise);
		const remove = () => this._inflightRequests.delete(promise);
		void promise.then(remove, remove);
		return promise;
	}

	/**
	 * Handle the `vscode/removeSessionArtifact` session-data method. Returns a
	 * Promise when the underlying service supports removal, undefined otherwise.
	 */
	private _handleRemoveSessionArtifactRequest(params: unknown): Promise<unknown> | undefined {
		if (!this._agentService.removeSessionArtifact) {
			return undefined;
		}
		const validated = removeSessionArtifactParamsValidator.validate(params);
		if (validated.error) {
			return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, validated.error.message));
		}
		const { session: sessionParam, artifactId } = validated.content;
		if (!artifactId.trim()) {
			return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'artifactId must be a non-empty string'));
		}
		try {
			return this._agentService.removeSessionArtifact(this._parseSessionUri(sessionParam), artifactId);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	 * Handle the `vscode/stopBackgroundWork` session-data method. Returns a
	 * Promise when the underlying service supports stopping, undefined otherwise.
	 */
	private _handleStopBackgroundWorkRequest(params: unknown): Promise<unknown> | undefined {
		if (!this._agentService.stopBackgroundWork) {
			return undefined;
		}
		const validated = stopBackgroundWorkParamsValidator.validate(params);
		if (validated.error) {
			return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, validated.error.message));
		}
		const { chat: chatParam, id } = validated.content;
		if (!id.trim()) {
			return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'id must be a non-empty string'));
		}
		let chat: URI;
		try {
			chat = URI.parse(chatParam, true);
		} catch {
			return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'chat must be a valid URI string'));
		}
		if (!isAhpChatChannel(chat.toString())) {
			return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'chat must be an Agent Host chat URI'));
		}
		return this._agentService.stopBackgroundWork(chat, id).then(stopped => ({ stopped }));
	}

	private _handleReadSavedChatRequest(client: IConnectedClient, params: unknown): Promise<unknown> | undefined {
		if (client.transport.relayClientId !== undefined || client.transport.relayPassive || this._config.relayRoots || this._config.relayRootMeta || !this._agentService.readSavedChat) {
			return undefined;
		}
		const validated = readSavedChatParamsValidator.validate(params);
		if (validated.error) {
			return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, validated.error.message));
		}
		try {
			const session = this._parseSessionUri(validated.content.session);
			let chat: URI | undefined;
			if (validated.content.chat !== undefined) {
				try {
					chat = URI.parse(validated.content.chat, true);
				} catch {
					throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'chat must be a valid URI string');
				}
				if (!isAhpChatChannel(chat.toString()) || chat.fragment) {
					throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'chat must be an Agent Host chat URI');
				}
			}
			return this._agentService.readSavedChat(session, chat).then(savedChatToDto);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	private _handleCompleteSavedChatContinuationRequest(client: IConnectedClient, params: unknown): Promise<unknown> | undefined {
		if (client.transport.relayClientId !== undefined || client.transport.relayPassive || this._config.relayRoots || this._config.relayRootMeta || !this._agentService.completeSavedChatContinuation) {
			return undefined;
		}
		const validated = completeSavedChatContinuationParamsValidator.validate(params);
		if (validated.error) {
			return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, validated.error.message));
		}
		try {
			const session = this._parseSessionUri(validated.content.session);
			const destination = this._parseSessionUri(validated.content.destination);
			let chat: URI;
			try {
				chat = URI.parse(validated.content.chat, true);
			} catch {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'chat must be a valid URI string');
			}
			if (!isAhpChatChannel(chat.toString()) || chat.fragment || !validated.content.identity.trim()) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'An exact Agent Host chat and saved identity are required');
			}
			return this._agentService.completeSavedChatContinuation({ session, chat, identity: validated.content.identity, destination });
		} catch (error) {
			return Promise.reject(error);
		}
	}

	private async _handleMoveSessionRequest(client: IConnectedClient, params: unknown): Promise<{ session: string }> {
		const validated = moveSessionParamsValidator.validate(params);
		if (validated.error) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, validated.error.message);
		}
		const { session, destination, after } = validated.content;
		for (const resource of [session, destination]) {
			if (!this._isSessionVisible(client, resource)) {
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${resource}`);
			}
		}
		try {
			const moved = await this._agentService.moveSession(this._parseSessionUri(session), this._parseSessionUri(destination), after === null ? undefined : URI.parse(after));
			return { session: moved.toString() };
		} catch (error) {
			if (error instanceof AgentChatMoveRefusedError) {
				// A refusal changes nothing; `reason` lets clients explain it.
				throw new ChatMoveRefusedProtocolError(error);
			}
			throw error;
		}
	}

	private async _handleSetChatWorkspaceRequest(client: IConnectedClient, params: unknown): Promise<void> {
		const validated = setChatWorkspaceParamsValidator.validate(params);
		if (validated.error) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, validated.error.message);
		}
		const workspace = readChatWorkspaceValue(validated.content.workspace);
		if (workspace === 'invalid') {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid chat workspace');
		}
		const chat = validated.content.chat;
		if (!isAhpChatChannel(chat) || !this._isChannelVisible(client, chat)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a chat: ${chat}`);
		}
		// The recorded ownership is authoritative: a moved chat's URI can name another session.
		const owner = await this._resolveChatOwner(chat);
		if (!owner) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Chat not found: ${chat}`);
		}
		await this._requireChatWorkspaceGrants(client, workspace);
		await withChatWorkspaceErrors(() => this._agentService.setChatWorkspace(owner, URI.parse(chat), workspace, this._config.scopedRelayCredentials ? this._getScopedAuthentication(client) : undefined));
	}

	private _handleImportSessionRequest(params: unknown): Promise<void> | undefined {
		if (!this._agentService.importSession) {
			return undefined;
		}
		const validated = importSessionParamsValidator.validate(params);
		if (validated.error) {
			return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, validated.error.message));
		}
		try {
			return this._agentService.importSession(this._parseSessionUri(validated.content.session));
		} catch (error) {
			return Promise.reject(error);
		}
	}

	private _parseSessionUri(sessionParam: string): URI {
		let session: URI;
		try {
			session = URI.parse(sessionParam, true);
		} catch {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'session must be a valid URI string');
		}
		if (!session.scheme || !session.path.startsWith('/') || session.path.length < 2
			|| session.authority || session.query || session.fragment || isAhpChatChannel(session.toString())) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'session must be an Agent Session URI');
		}
		return session;
	}

	/**
	 * Handle VS Code extension methods that are not yet part of the typed
	 * protocol. Returns a Promise if the method was recognized, undefined
	 * otherwise.
	 */
	private readonly _debugLogCollectionOwners = new Map<string, string>();
	private readonly _worktreeMeasurements = new Map<IConnectedClient, Map<string, CancellationTokenSource>>();

	private async _handleWorktreeDiskUsageRequest(client: IConnectedClient, params: unknown): Promise<{ sizeBytes?: number }> {
		const validated = measureWorktreeDiskUsageParamsValidator.validate(params);
		if (validated.error) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, validated.error.message);
		}
		const { uri, requestId } = validated.content;
		let root: URI;
		try {
			root = URI.parse(uri, true);
		} catch {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'uri must be a file URI');
		}
		if (root.scheme !== Schemas.file || !uri.startsWith(`${Schemas.file}:/`) || root.query || root.fragment || !isAbsolute(root.fsPath)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'uri must be an absolute file URI');
		}
		let measurements = this._worktreeMeasurements.get(client);
		if (!measurements) {
			measurements = new Map();
			this._worktreeMeasurements.set(client, measurements);
		}
		if (measurements.has(requestId)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'requestId is already in use');
		}
		const disposables = new DisposableStore();
		const cancellation = disposables.add(new CancellationTokenSource());
		measurements.set(requestId, cancellation);
		const cancelOnDisconnect = client.disposables.add(toDisposable(() => cancellation.cancel()));
		disposables.add(disposableTimeout(() => cancellation.cancel(), 10_000));
		try {
			const sizeBytes = await raceCancellationError(
				this._agentService.measureWorktreeDiskUsage(root, cancellation.token),
				cancellation.token,
			);
			return { sizeBytes };
		} finally {
			client.disposables.delete(cancelOnDisconnect);
			disposables.dispose();
			measurements.delete(requestId);
			if (measurements.size === 0) {
				this._worktreeMeasurements.delete(client);
			}
		}
	}

	private _handleExtensionRequest(client: IConnectedClient, method: string, params: unknown): Promise<unknown> | undefined {
		if ((method === MeasureWorktreeDiskUsageExtensionMethod || method === CancelWorktreeDiskUsageExtensionMethod)
			&& !this._config.relayRoots && !this._config.relayRootMeta && client.transport.relayClientId === undefined && !client.transport.relayPassive) {
			if (method === MeasureWorktreeDiskUsageExtensionMethod) {
				return this._handleWorktreeDiskUsageRequest(client, params);
			}
			const validated = cancelWorktreeDiskUsageParamsValidator.validate(params);
			if (validated.error) {
				return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, validated.error.message));
			}
			this._worktreeMeasurements.get(client)?.get(validated.content.requestId)?.cancel();
			return Promise.resolve();
		}
		if (client.transport.relayClientId !== undefined) {
			const request = this._config.extension?.requests.get(method);
			if (request?.requiresChannel) {
				if (!isParamsObject(params) || typeof params.channel !== 'string') {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'channel must be a session URI'));
				}
				if (!this._isChannelVisible(client, params.channel)) {
					return Promise.reject(new ProtocolError(AhpErrorCodes.PermissionDenied, 'Session is outside the host workspace grants'));
				}
			}
			if (request) {
				return request.handle(params, this._captureRelayRequestAuthorization(client, method, params), this._config.scopedRelayCredentials ? this._getScopedAuthentication(client) : undefined);
			}
		}
		if (method === ReportChatUserInteractionExtensionMethod) {
			if (!this._otelService?.diagnosticsEnabled) {
				return Promise.resolve();
			}
			const validated = chatUserInteractionValidator.validate(params);
			try {
				chatUserInteractionAttributes(params);
			} catch {
				return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid user interaction timing'));
			}
			if (validated.error) {
				return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid user interaction timing'));
			}
			this._otelService.emitUserInteraction(validated.content);
			return this._otelService.flush();
		}
		if (method === ImportSessionExtensionMethod) {
			return this._handleImportSessionRequest(params);
		}
		if (method === SetChatWorkspaceExtensionMethod) {
			return this._handleSetChatWorkspaceRequest(client, params);
		}
		// Session data, so it works over the renderer's data plane too; relay transports are never offered it. Offered and
		// routed whether or not moving chats is enabled, which a client may turn on after connecting: a move while it is
		// off is refused with `disabled`.
		if (method === MoveAgentHostSessionExtensionMethod && !this._config.relayRoots && !this._config.relayRootMeta) {
			return this._handleMoveSessionRequest(client, params);
		}
		if (method === ReportAgentHostFirstResponseExtensionMethod) {
			if (!this._otelService?.diagnosticsEnabled) {
				return Promise.resolve();
			}
			const validated = agentHostFirstResponseValidator.validate(params);
			if (validated.error) {
				return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid first-response diagnostic'));
			}
			this._otelService.emitFirstResponse(validated.content);
			return Promise.resolve();
		}
		// Session-data methods do not require host-control access. Only the
		// host-control methods below are gated by `allowExtensionMethods`.
		if (method === RemoveSessionArtifactExtensionMethod) {
			return this._handleRemoveSessionArtifactRequest(params);
		}
		if (method === StopBackgroundWorkExtensionMethod) {
			return this._handleStopBackgroundWorkRequest(params);
		}
		if (method === ReadSavedChatExtensionMethod) {
			return this._handleReadSavedChatRequest(client, params);
		}
		if (method === CompleteSavedChatContinuationExtensionMethod) {
			return this._handleCompleteSavedChatContinuationRequest(client, params);
		}
		if (this._config.allowExtensionMethods === false) {
			return undefined;
		}

		switch (method) {
			case InstallSandboxCertificateExtensionMethod:
			case RotateSandboxCertificateExtensionMethod:
			case RemoveSandboxCertificateExtensionMethod: {
				const operation = method === InstallSandboxCertificateExtensionMethod
					? 'installSandboxCertificate'
					: method === RotateSandboxCertificateExtensionMethod
						? 'rotateSandboxCertificate'
						: 'removeSandboxCertificate';
				if (!this._agentService[operation] || client.transport.relayClientId !== undefined || client.transport.relayPassive) {
					return undefined;
				}
				const validated = sandboxCertificateParamsValidator.validate(params);
				if (validated.error) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, validated.error.message));
				}
				const { chat, scopeId } = validated.content;
				let resource: URI;
				try {
					resource = URI.parse(chat, true);
				} catch {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'chat must be a valid URI'));
				}
				if (!resource.scheme || !scopeId.trim()) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'chat and scopeId must be non-empty'));
				}
				return this._agentService[operation]!(chat, scopeId);
			}
			case 'shutdown':
				return this._agentService.shutdown();
			case 'getNetworkDiagnosticsInfo':
				return this._agentService.getNetworkDiagnosticsInfo();
			case 'getManagedSettingsDiagnostics':
				return this._agentService.getManagedSettingsDiagnostics();
			case 'diagnosticsFetch':
				return this._agentService.diagnosticsFetch((params as { url: string }).url);
			case GetAgentHostSessionStateFileExtensionMethod: {
				if (!this._agentService.getSessionStateFile) {
					return undefined;
				}
				if (!isParamsObject(params)) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'params must be an object'));
				}
				const sessionParam = params['session'];
				if (typeof sessionParam !== 'string') {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'session must be a URI string'));
				}
				let session: URI;
				try {
					session = URI.parse(sessionParam, true);
				} catch {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'session must be a valid URI string'));
				}
				if (!session.scheme) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'session must be an Agent Session URI'));
				}
				const chatParam = params['chat'];
				let chat: URI | undefined;
				if (chatParam !== undefined) {
					if (typeof chatParam !== 'string') {
						return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'chat must be a URI string'));
					}
					try {
						chat = URI.parse(chatParam, true);
					} catch {
						return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'chat must be a valid URI string'));
					}
				}
				const ownership = chat ? this._assertChatBelongsToSession(chat, session) : Promise.resolve();
				return ownership.then(() => this._agentService.getSessionStateFile!(session, chat)).then(resource => ({ resource: resource?.toString() }));
			}
			case CreateAgentHostDetachedWorktreeExtensionMethod: {
				if (!this._agentService.createDetachedWorktree) {
					return undefined;
				}
				if (!isParamsObject(params)) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'params must be an object'));
				}
				const sessionParam = params['session'];
				const prompt = params['prompt'];
				if (typeof sessionParam !== 'string') {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'session must be a URI string'));
				}
				if (typeof prompt !== 'string') {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'prompt must be a string'));
				}
				let session: URI;
				try {
					session = URI.parse(sessionParam, true);
				} catch {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'session must be a valid URI string'));
				}
				if (!session.scheme) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'session must be a valid Agent Session URI'));
				}
				return this._agentService.createDetachedWorktree(session, prompt).then(result => ({
					handle: result.handle,
					resource: result.worktree.toString(),
				}));
			}
			case SetAgentHostDetachedWorktreeArchivedExtensionMethod: {
				if (!this._agentService.setDetachedWorktreeArchived) {
					return undefined;
				}
				if (!isParamsObject(params)) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'params must be an object'));
				}
				const handle = params['handle'];
				const archived = params['archived'];
				if (!isAgentDevContainerWorktreeHandle(handle)) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'handle must be a valid worktree handle'));
				}
				if (typeof archived !== 'boolean') {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'archived must be a boolean'));
				}
				return this._agentService.setDetachedWorktreeArchived(handle, archived);
			}
			case ClaimAgentHostDetachedWorktreeExtensionMethod: {
				if (!this._agentService.claimDetachedWorktree) {
					return undefined;
				}
				if (!isParamsObject(params)) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'params must be an object'));
				}
				const handle = params['handle'];
				if (!isAgentDevContainerWorktreeHandle(handle)) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'handle must be a valid worktree handle'));
				}
				return this._agentService.claimDetachedWorktree(handle);
			}
			case DeleteAgentHostDetachedWorktreeExtensionMethod: {
				if (!this._agentService.deleteDetachedWorktree) {
					return undefined;
				}
				if (!isParamsObject(params)) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'params must be an object'));
				}
				const handle = params['handle'];
				if (!isAgentDevContainerWorktreeHandle(handle)) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'handle must be a valid worktree handle'));
				}
				return this._agentService.deleteDetachedWorktree(handle);
			}
			case ReconcileAgentHostDetachedWorktreesExtensionMethod: {
				if (!this._agentService.reconcileDetachedWorktrees) {
					return undefined;
				}
				if (!isParamsObject(params)) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'params must be an object'));
				}
				const scope = params['scope'];
				const activeHandles = params['activeHandles'];
				if (typeof scope !== 'string' || !scope) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'scope must be a non-empty string'));
				}
				if (!Array.isArray(activeHandles) || !activeHandles.every(isAgentDevContainerWorktreeHandle)) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'activeHandles must contain valid worktree handles'));
				}
				return this._agentService.reconcileDetachedWorktrees(scope, activeHandles);
			}
			case CollectAgentHostDebugLogsExtensionMethod: {
				if (!this._agentService.collectDebugLogs) {
					return undefined;
				}
				const validated = collectAgentHostDebugLogsParamsValidator.validate(params);
				if (validated.error) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, validated.error.message));
				}
				const { session: sessionParam, chat: chatParam, kind, progressToken } = validated.content;
				let session: URI | undefined;
				if (sessionParam !== undefined) {
					try {
						session = URI.parse(sessionParam, true);
					} catch {
						return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'session must be a valid URI string'));
					}
					if (!session.scheme) {
						return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'session must be an Agent Session URI'));
					}
				}
				let chat: URI | undefined;
				if (chatParam !== undefined) {
					try {
						chat = URI.parse(chatParam, true);
					} catch {
						return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'chat must be a valid URI string'));
					}
					if (!session) {
						return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'chat must belong to the requested Agent Session'));
					}
				}
				const collect = () => {
					if (progressToken && this._debugLogCollectionOwners.has(progressToken)) {
						return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'progressToken is already in use'));
					}
					if (progressToken) {
						this._debugLogCollectionOwners.set(progressToken, client.clientId);
					}
					let completed = false;
					const cancelOnDisconnect = client.disposables.add(toDisposable(() => {
						if (progressToken && !completed) {
							void this._agentService.cancelDebugLogs?.(progressToken).catch(error => this._logService.warn('[ExportAgentHostDebugLogs] Failed to cancel disconnected collection', error));
						}
					}));
					return this._agentService.collectDebugLogs!(session, kind, chat, progressToken).then(result => ({
						kind: result.kind,
						resource: result.resource.toString(),
						providerLogsIncluded: result.providerLogsIncluded,
						size: result.size,
						uncompressedSize: result.uncompressedSize,
						entries: result.entries,
					})).finally(() => {
						completed = true;
						cancelOnDisconnect.dispose();
						client.disposables.delete(cancelOnDisconnect);
						if (progressToken) {
							this._debugLogCollectionOwners.delete(progressToken);
						}
					});
				};
				return chat && session ? this._assertChatBelongsToSession(chat, session).then(collect) : collect();
			}
			case CancelAgentHostDebugLogsExtensionMethod: {
				if (!this._agentService.cancelDebugLogs) {
					return undefined;
				}
				if (!isParamsObject(params) || typeof params['progressToken'] !== 'string') {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'progressToken must be a string'));
				}
				if (this._debugLogCollectionOwners.get(params['progressToken']) !== client.clientId) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Unknown debug-log collection'));
				}
				return this._agentService.cancelDebugLogs(params['progressToken']);
			}
			case ReadAgentHostDebugLogsChunkExtensionMethod: {
				if (!this._agentService.readDebugLogsChunk) {
					return undefined;
				}
				if (!isParamsObject(params)) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'params must be an object'));
				}
				const resourceParam = params['resource'];
				if (typeof resourceParam !== 'string') {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'resource must be a URI string'));
				}
				let resource: URI;
				try {
					resource = URI.parse(resourceParam, true);
				} catch {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'resource must be a valid URI string'));
				}
				const position = params['position'];
				if (typeof position !== 'number' || !Number.isSafeInteger(position) || position < 0) {
					return Promise.reject(new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'position must be a non-negative integer'));
				}
				return this._agentService.readDebugLogsChunk(resource, position).then(chunk => ({
					data: encodeBase64(chunk.data),
					eof: chunk.eof,
				}));
			}
			default:
				return undefined;
		}
	}

	private _initializeDevContainers(client: IConnectedClient): void {
		if (this._config.allowExtensionMethods !== false && this._devContainerService) {
			client.devContainers = client.initializationDisposables.add(new DevContainerAgentHostProtocol(
				async workspace => {
					const result = await this._sendReverseRequestToConnection<IAgentHostExtensionServerCommandMap[typeof RequestAgentHostWorkspaceTrustExtensionMethod]['result']>(
						client,
						RequestAgentHostWorkspaceTrustExtensionMethod,
						{ workspace: URI.file(workspace).toString() },
					);
					return result?.trusted === true;
				},
				(method, params) => client.transport.send({ jsonrpc: '2.0', method, params }),
				this._devContainerService,
				this._logService,
			));
		}
	}

	// ---- Broadcasting -------------------------------------------------------

	private _recordAndBroadcastAction(envelope: ActionEnvelope, listenerOwned = false): void {
		if (this._config.sessionConfigAdapter && (envelope.action.type === ActionType.SessionConfigChanged || envelope.action.type === ActionType.ChatConfigChanged)) {
			envelope = { ...envelope, action: this._config.sessionConfigAdapter.toClientAction(envelope.action, !!envelope.rejectionReason) };
		}
		if (this._config.advertisedModelProviders && envelope.action.type === ActionType.RootAgentsChanged) {
			envelope = { ...envelope, action: { ...envelope.action, agents: this._projectAgentModels(envelope.action.agents) } };
		}
		if (listenerOwned) {
			this._extensionEnvelopes.add(envelope);
		}
		if (this._config.extension && envelope.action.type === ActionType.RootConfigChanged && !envelope.rejectionReason) {
			const values = deepClone(this._stateManager.rootState.config?.values ?? {});
			mixin(values, listenerOwned ? envelope.action.config : this._config.extension.rootConfig.values);
			// Capture the overlay at this sequence so reconnect replay preserves catalogue/configuration ordering.
			this._relayRootConfigEnvelopes.set(envelope, {
				...envelope,
				action: { ...envelope.action, config: values, replace: true },
			});
		}
		this._replayBuffer.push(envelope);
		if (this._replayBuffer.length > REPLAY_BUFFER_CAPACITY) {
			this._replayBuffer.shift();
		}
		this._broadcastAction(envelope);
	}

	private _broadcastAction(envelope: ActionEnvelope): void {
		this._logService.trace(`[ProtocolServer] Broadcasting action: ${envelope.action.type}`);
		for (const record of this._clients.values()) {
			const client = this._getActiveClientFromRecord(record);
			if (client && this._isRelevantToClient(client, envelope)) {
				const projected = this._projectActionForClient(client, envelope);
				if (projected) {
					const msg: AhpServerNotification<'action'> = { jsonrpc: '2.0', method: 'action', params: this._projectRelayRootAction(client, projected) };
					client.transport.send(msg);
				}
			}
		}
	}

	private _broadcastNotification(notification: INotification): void {
		if (this._config.relayRoots) {
			return;
		}
		// Each protocol notification ships as its own top-level method. The
		// `type` discriminant on our local notification union is the wire-level method name.
		for (const record of this._clients.values()) {
			const client = this._getActiveClientFromRecord(record);
			if (!client) {
				continue;
			}
			const visible = this._projectNotificationForClient(client, notification);
			const projected = visible && this._projectRelayNotification(client, visible);
			if (projected) {
				const { type, ...params } = projected;
				// eslint-disable-next-line local/code-no-dangerous-type-assertions
				client.transport.send({ jsonrpc: '2.0', method: type, params } as AhpServerNotification);
			}
		}
	}

	private _projectRelayNotification(client: IConnectedClient, notification: INotification): INotification | undefined {
		if (client.transport.relayAuthentication?.authenticated !== false) {
			return notification;
		}
		switch (notification.type) {
			case 'root/sessionAdded':
				return { ...notification, summary: withholdSessionSummaryDetails(notification.summary) };
			case 'root/sessionSummaryChanged': {
				const changes = withholdSessionSummaryDetails(notification.changes);
				return Object.keys(changes).length > 0 ? { ...notification, changes } : undefined;
			}
			case 'root/sessionRemoved':
				return notification;
			default:
				return undefined;
		}
	}

	private _projectRelayRootAction(client: IConnectedClient, envelope: ActionEnvelope): ActionEnvelope {
		if (envelope.action.type === ActionType.RootAgentsChanged) {
			envelope = { ...envelope, action: { ...envelope.action, agents: this._projectModelConfigAliases(client, envelope.action.agents) } };
		}
		const configEnvelope = client.transport.relayClientId !== undefined ? this._relayRootConfigEnvelopes.get(envelope) : undefined;
		if (configEnvelope) {
			return configEnvelope;
		}
		return client.transport.relayAuthentication?.authenticated === false && envelope.action.type === ActionType.RootAgentsChanged
			? { ...envelope, action: { ...envelope.action, agents: projectDiscoveryAgents(envelope.action.agents) } }
			: envelope;
	}

	private async _resolveChatOwner(chat: string): Promise<URI | undefined> {
		const owner = (await this._chatOwnership.resolveChatOwner(chat))?.owner;
		return owner === undefined ? undefined : URI.parse(owner);
	}

	/** Rejects unless `chat` is a chat whose recorded owner is `session`. */
	private async _assertChatBelongsToSession(chat: URI, session: URI): Promise<void> {
		const owner = isAhpChatChannel(chat.toString()) ? await this._resolveChatOwner(chat.toString()) : undefined;
		if (owner?.toString() !== session.toString()) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'chat must belong to the requested Agent Session');
		}
	}

	/**
	 * Whether `client` may see `session`. A VS Code client without `vscode.ahpChatUris`
	 * cannot address opaque chats, so a session whose recorded default chat is opaque is
	 * hidden from it. `defaultChat` overrides the recorded default for sessions the host
	 * has not made resident.
	 */
	private _isSessionVisible(client: IConnectedClient, session: string, defaultChat: string | undefined = this._chatOwnership.getDefaultChat(session)): boolean {
		if (client.legacySessionUris && URI.parse(session).scheme === 'ahp-session') {
			return false;
		}
		// A promoted session's default chat came from another session (Block 4), which such a client derives from its URI.
		return !(client.legacyChatUris && defaultChat !== undefined && !this._isChatShownToLegacyClient(defaultChat, session));
	}

	private _isChannelVisible(client: IConnectedClient, channel: string): boolean {
		const owner = isAhpChatChannel(channel) ? this._chatOwnership.getChatOwner(channel) : undefined;
		if (client.legacyChatUris && isAhpChatChannel(channel) && (!isShapedChatUri(channel) || (owner !== undefined && !this._isChatShownToLegacyClient(channel, owner)))) {
			return false;
		}
		return this._isSessionVisible(client, owner ?? channel);
	}

	/**
	 * Whether a client without `vscode.ahpChatUris` may see `chat` in `session`. Such a client derives a chat's session
	 * from its URI, so it sees only shaped chats, and only in the session they were created in: a chat moved to another
	 * session (Block 4) disappears from it (its removal from the session it came from is still delivered). While the
	 * origins of moved chats are unknown, any chat may have moved, so such a client sees none.
	 */
	private _isChatShownToLegacyClient(chat: string, session: string): boolean {
		return isShapedChatUri(chat) && this._stateManager.movedChatOriginsKnown && (this._stateManager.getMovedChatOrigin(chat) ?? session) === session;
	}

	/** Drops the chats of `session` that `client` cannot address (see {@link _isChatShownToLegacyClient}). */
	private _filterVisibleChats<T>(client: IConnectedClient, session: string, chats: readonly T[], getResource: (chat: T) => string): readonly T[] {
		return client.legacyChatUris ? chats.filter(chat => this._isChatShownToLegacyClient(getResource(chat), session)) : chats;
	}

	/**
	 * Projects an action for `client`, or returns `undefined` when the client
	 * must not receive it. Chat list actions about opaque chats are dropped, and a
	 * reorder is filtered, since a reorder that does not list every known chat is ignored.
	 */
	private _projectActionForClient(client: IConnectedClient, envelope: ActionEnvelope): ActionEnvelope | undefined {
		const vscode = getAgentHostClientType(client.clientInfo) !== AgentHostClientType.Unknown;
		if (envelope.action.type === ActionType.AutomationSet) {
			envelope = { ...envelope, action: { ...envelope.action, automation: projectCopilotAutomation(envelope.action.automation, vscode) } };
		}
		if (this._usesCopilotModelConfig(envelope.channel)) {
			const action = envelope.action;
			switch (action.type) {
				case ActionType.ChatTurnStarted:
				case ActionType.ChatPendingMessageSet:
					envelope = { ...envelope, action: { ...action, message: projectCopilotMessage(action.message, vscode) } };
					break;
				case ActionType.ChatDraftChanged:
					envelope = { ...envelope, action: { ...action, ...(action.draft ? { draft: projectCopilotMessage(action.draft, vscode) } : {}) } };
					break;
				case ActionType.ChatTurnsLoaded:
					envelope = { ...envelope, action: { ...action, turns: action.turns.map(turn => projectCopilotTurn(turn, vscode)) } };
					break;
			}
		}
		if (!client.legacyChatUris) {
			return envelope;
		}
		const action = envelope.action;
		switch (action.type) {
			case ActionType.SessionChatAdded:
				return this._isChatShownToLegacyClient(action.summary.resource, envelope.channel) ? envelope : undefined;
			case ActionType.SessionChatUpdated:
			case ActionType.SessionChatRemoved:
				return this._isChatShownToLegacyClient(action.chat, envelope.channel) ? envelope : undefined;
			case ActionType.SessionChatsReordered:
				return { ...envelope, action: { ...action, chats: action.chats.filter(chat => this._isChatShownToLegacyClient(chat, envelope.channel)) } };
			default:
				return envelope;
		}
	}

	private _projectSnapshotChats(client: IConnectedClient, snapshot: IStateSnapshot): IStateSnapshot {
		if (!client.legacyChatUris || !hasKey(snapshot.state, { chats: true }) || !Array.isArray(snapshot.state.chats)) {
			return snapshot;
		}
		const chats = this._filterVisibleChats(client, snapshot.resource, snapshot.state.chats, chat => chat.resource);
		return chats.length === snapshot.state.chats.length ? snapshot : { ...snapshot, state: { ...snapshot.state, chats: [...chats] } };
	}

	/** Projects a root notification for `client`, or returns `undefined` when the session is hidden from it. */
	private _projectNotificationForClient(client: IConnectedClient, notification: INotification): INotification | undefined {
		switch (notification.type) {
			case 'root/sessionAdded': {
				const summary = notification.summary;
				if (!this._isSessionVisible(client, summary.resource, summary.defaultChat ?? this._chatOwnership.getDefaultChat(summary.resource))
					|| (this._config.sessionSummaryFilter && !this._config.sessionSummaryFilter(summary))) {
					return undefined;
				}
				if (this._config.sessionSummaryFilter) {
					client.knownSessionSummaries.add(summary.resource);
				}
				return summary.chats ? { ...notification, summary: { ...summary, chats: [...this._filterVisibleChats(client, summary.resource, summary.chats, chat => chat.resource)] } } : notification;
			}
			case 'root/sessionSummaryChanged': {
				if (!this._isSessionVisible(client, notification.session)) {
					return undefined;
				}
				const summary = this._stateManager.getSessionSummary(notification.session) ?? this._stateManager.getSurfacedSessionSummary(notification.session);
				if (summary && this._config.sessionSummaryFilter) {
					if (!this._config.sessionSummaryFilter(summary)) {
						return undefined;
					}
					if (!client.knownSessionSummaries.has(notification.session)) {
						return this._projectNotificationForClient(client, { type: 'root/sessionAdded', channel: notification.channel, summary });
					}
				}
				const chats = notification.changes.chats;
				return chats ? { ...notification, changes: { ...notification.changes, chats: [...this._filterVisibleChats(client, notification.session, chats, chat => chat.resource)] } } : notification;
			}
			case 'root/sessionRemoved':
				client.knownSessionSummaries.delete(notification.session);
				return this._isSessionVisible(client, notification.session) ? notification : undefined;
			default:
				return notification;
		}
	}

	/**
	 * Forward an MCP server-originated notification (e.g.
	 * `notifications/tools/list_changed`) over the AHP transport. The
	 * `channel` field on `params` is the AHP routing envelope; the
	 * receiving client demultiplexes by it. Notifications are broadcast
	 * to every connected client — per-channel subscription filtering is
	 * left to the client, since MCP notifications are cheap and the
	 * client already knows which channels it cares about.
	 */
	private _broadcastMcpNotification(notification: IMcpNotification): void {
		if (this._config.relayRoots) {
			return;
		}
		const params: Record<string, unknown> = { ...(notification.params ?? {}), channel: notification.channel };
		// MCP notifications don't share a discriminated `method` literal
		// with the known {@link AhpServerNotification} union, so cast
		// through `unknown` to satisfy the transport contract.
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		const msg = { jsonrpc: '2.0' as const, method: notification.method, params } as unknown as AhpServerNotification;
		for (const record of this._clients.values()) {
			const client = this._getActiveClientFromRecord(record);
			if (client && client.transport.relayAuthentication?.authenticated !== false) {
				client.transport.send(msg);
			}
		}
	}

	/**
	 * Drop a subscription identified by `channel` from `client`. Handles
	 * canonicalisation for OTLP URIs (so an `unsubscribe` with a URI
	 * variant collapses to the same entry as the original `subscribe`)
	 * and tears down the agent-service refcount for state channels.
	 */
	private _removeSubscription(client: IConnectedClient, channel: string): void {
		const classified = classifyChannel(channel);
		if (!classified) {
			// OTLP-flavoured URI with an unknown level — there can never
			// have been a matching subscription. Silently ignore.
			return;
		}
		const awaitingAuthentication = client.pendingAuthenticationSubscriptions.delete(classified.uri);
		const sub = client.subscriptions.get(classified.uri);
		if (!sub) {
			if (awaitingAuthentication) {
				this._reconcileActiveClientSubscriptions(client);
			}
			return;
		}
		client.subscriptions.delete(classified.uri);
		// An unsubscribed channel owes this client nothing; a later subscribe
		// records its own debt if it again lands without a baseline.
		this._clearBaselineDebt(client.clientId, classified.uri);
		if (sub.kind === ChannelKind.State) {
			const record = this._clients.get(client.clientId);
			if (record && this._hasSubscriptionInOtherConnection(record, client, sub.uri)) {
				return;
			}
			this._agentService.unsubscribe(URI.parse(sub.uri), client.clientId);
			if (!sub.active) {
				return;
			}
			this._reconcileActiveClientSubscriptions(client);
		} else if (sub.kind === ChannelKind.ResourceWatch) {
			this._agentService.onResourceWatchUnsubscribed(sub.uri);
		}
	}

	/**
	 * Fan out an OTLP log record to every connected client that has
	 * subscribed to a logs channel whose `{level}` band includes the
	 * record's `severityNumber`. The notification's `channel` field is
	 * the canonical URI the client subscribed against — clients can
	 * route by URI without re-deriving the level.
	 */
	private _broadcastOtlpLog(record: IOtlpLogRecord): void {
		const payload = toResourceLogsPayload(record);
		for (const clientRecord of this._clients.values()) {
			const client = this._getActiveClientFromRecord(clientRecord);
			if (!client) {
				continue;
			}
			for (const sub of client.subscriptions.values()) {
				if (sub.kind !== ChannelKind.OtlpLogs) {
					continue;
				}
				if (record.severityNumber < levelToSeverityNumber(sub.level)) {
					continue;
				}
				const msg: AhpServerNotification<'otlp/exportLogs'> = {
					jsonrpc: '2.0',
					method: 'otlp/exportLogs',
					params: { channel: sub.uri, payload },
				};
				client.transport.send(msg);
			}
		}
	}

	private _isRelevantToClient(client: IConnectedClient, envelope: ActionEnvelope): boolean {
		if (client.transport.relayAuthentication?.authenticated === false
			&& (!isAhpRootChannel(envelope.channel) || envelope.rejectionReason
				|| (envelope.action.type !== ActionType.RootAgentsChanged && envelope.action.type !== ActionType.RootActiveSessionsChanged && envelope.action.type !== ActionType.RootConfigChanged))) {
			return false;
		}
		if (!this._isChannelVisible(client, envelope.channel)) {
			return false;
		}
		if (this._extensionEnvelopes.has(envelope)) {
			if (client.transport.relayClientId === undefined) {
				return false;
			}
		} else if (client.transport.relayClientId !== undefined && envelope.action.type === ActionType.RootConfigChanged
			&& envelope.rejectionReason && envelope.origin?.clientId !== client.clientId) {
			return false;
		}
		const sub = client.subscriptions.get(envelope.channel);
		if ((sub?.kind === ChannelKind.State || sub?.kind === ChannelKind.ResourceWatch) && sub.active) {
			return true;
		}
		return isActionEnvelopeRelevantToSubscriptionUris(envelope, this._stateAndResourceWatchUris(client));
	}

	private *_stateAndResourceWatchUris(client: IConnectedClient): Iterable<string> {
		for (const sub of client.subscriptions.values()) {
			if ((sub.kind === ChannelKind.State || sub.kind === ChannelKind.ResourceWatch) && sub.active) {
				yield sub.uri;
			}
		}
	}

	private _managedSettingsContributionId(clientId: string): string {
		return `${this._managedSettingsOwnerId}:${clientId}`;
	}

	override dispose(): void {
		for (const [clientId, record] of this._clients) {
			this._managedSettingsService.removeClient(this._managedSettingsContributionId(clientId));
			if (record.state === 'active') {
				for (const connection of [...record.connections]) {
					const subscriptionCount = connection.subscriptions.size;
					const connectionIndex = record.connections.indexOf(connection);
					if (connectionIndex !== -1) {
						record.connections.splice(connectionIndex, 1);
					}
					this._releaseClientSubscriptions(connection, record);
					this._rejectPendingReverseRequestsForConnection(connection);
					this._reportClientDisconnected(connection, subscriptionCount);
					connection.disposables.dispose();
				}
			} else {
				record.disconnectTimeouts.dispose();
			}
		}
		this._clients.clear();
		for (const [, pending] of this._pendingReverseRequests) {
			pending.reject(new Error('ProtocolServerHandler disposed'));
		}
		this._pendingReverseRequests.clear();
		this._replayBuffer.length = 0;
		super.dispose();
	}
}
