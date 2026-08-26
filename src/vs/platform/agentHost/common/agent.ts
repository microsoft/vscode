/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { IChannelClient } from '../../../base/parts/ipc/common/ipc.js';
import { truncate } from '../../../base/common/strings.js';
import { IAuthorizationProtectedResourceMetadata } from '../../../base/common/oauth.js';
import type { IObservable } from '../../../base/common/observable.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import type { IAgentServerToolHost } from './agentServerTools.js';
import type { AgentHostClientType } from './agentHostClientInfo.js';
import type { IAgentHostClientTelemetryContext } from './agentHostTelemetry.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from './state/protocol/commands.js';
import { ProtectedResourceMetadata, type Changeset, type ChatOrigin, type ConfigSchema, type MessageAttachment, type ModelSelection, type AgentSelection, type SessionActiveClient, type ToolCallPendingConfirmationState, type ToolDefinition, ChangesSummary } from './state/protocol/state.js';
import type { AuthRequiredParams, SessionAction, ChatAction } from './state/sessionActions.js';
import { ChatInputResponseKind, ChatOriginKind, SessionStatus, buildSubagentChatUri, parseRequiredSessionUriFromChatUri, type AgentCapabilities, type ClientPluginCustomization, type Customization, type ISessionFolderPickerDecision, type Message, type PendingMessage, type ChatInputAnswer, type SessionMeta, type ToolCallResult, type Turn, type PolicyState } from './state/sessionState.js';

/** Error returned when the Agent Host process cannot be started. */
export class AgentHostStartError extends Error {
	constructor(message: string, readonly fatal = false) {
		super(message);
	}
}

export function isInvalidUtilityProcessConfigurationMessage(message: string): boolean {
	return /^Invalid value for (?:args|env|execArgv)$/.test(message);
}

export function isFatalAgentHostStartError(error: unknown): error is TypeError {
	return error instanceof TypeError && isInvalidUtilityProcessConfigurationMessage(error.message);
}

export function toFatalAgentHostStartError(error: Error): AgentHostStartError {
	const startError = new AgentHostStartError(error.message, true);
	startError.name = error.name;
	startError.stack = error.stack;
	return startError;
}

export interface IAgentHostConnection {
	readonly client: IChannelClient;
	readonly store: DisposableStore;
	readonly onDidProcessExit: Event<{ code: number; signal: string }>;
	/** Gracefully shuts down Agent Host providers before the process is disposed. */
	shutdown(): Promise<void>;
}

/** Allows a connection request to join the shared process startup. */
export interface IAgentHostStartRequest {
	waitUntil(promise: Promise<void>): void;
}

/** Allows the Agent Host process to join application shutdown. */
export interface IAgentHostShutdownRequest {
	join(promise: Promise<void>): void;
}

export interface IAgentHostStarter extends IDisposable {
	readonly onRequestConnection?: Event<IAgentHostStartRequest>;
	readonly onRequestRestart?: Event<void>;
	readonly onWillShutdown?: Event<IAgentHostShutdownRequest>;

	start(): Promise<IAgentHostConnection>;
}

// ---- Provider model -------------------------------------------------------
// This file must not depend on agentService.ts.

// ---- Diagnostics types referenced by the provider surface -------------------

/** A network endpoint the agent host suggests probing, listed on {@link IAgentHostNetworkDiagnosticsInfo.endpoints}. */
export interface IAgentHostNetworkEndpoint {
	readonly name: string;
	readonly url: string;
	/** Substring the response body is expected to contain; when set, the probe reads the body and fails the check if it is absent. */
	readonly expectedContent?: string;
	/** HTTP status code the probe treats as success. Defaults to `200` when omitted. */
	readonly expectedStatus?: number;
}

export interface IAgentHostManagedSettingsSnapshot {
	readonly account?: string;
	readonly source: 'server' | 'device' | 'client' | 'mixed' | 'none';
	readonly serverManaged: boolean;
	readonly deviceManaged: boolean;
	readonly clientManaged?: boolean;
	readonly failClosed: boolean;
	readonly bypassPermissionsDisabled: boolean;
	readonly permissionsAllowIntersected?: boolean;
	readonly managedKeys: readonly string[];
	readonly settings?: unknown;
}

// ---- IPC data types (serializable across MessagePort) -----------------------

export interface IAgentChatMetadata {
	readonly chat: URI;
	readonly startTime: number;
	readonly modifiedTime: number;
	readonly project?: IAgentSessionProjectInfo;
	readonly summary?: string;
	/** Provider model that should be selected when this chat is restored. */
	readonly model?: ModelSelection;
	/** Activity bits plus the session-scoped {@link SessionStatus.IsRead} / {@link SessionStatus.IsArchived} flags. */
	readonly status?: SessionStatus;
	/** Human-readable description of what the session is currently doing. */
	readonly activity?: string;
	/** All working directories available to the session (index 0 = primary). */
	readonly workingDirectories?: readonly URI[];
	/**
	 * Aggregate counts (additions / deletions / files) for this session's
	 * changes. Single-folder sessions derive this from the branch changeset;
	 * multi-folder sessions aggregate it across all folders. Mirrors
	 * `SessionSummary.changes`.
	 */
	readonly changes?: ChangesSummary;
	/**
	 * Catalogue of changesets the agent can produce for this session — the
	 * {@link Changeset | catalogue} that travels on
	 * `SessionSummary.changesets`. Lightweight summary entries (id / label /
	 * URI template / aggregate counts) without per-file detail; clients
	 * subscribe to a specific expanded changeset URI when they need the full
	 * file list.
	 */
	readonly changesets?: readonly Changeset[];
	/**
	 * Side-channel metadata mirroring {@link SessionState._meta}, propagated
	 * to clients via per-session state subscriptions and the root-channel
	 * session summary (the host treats the session-state and session-summary
	 * `_meta` as the same bag). Producers SHOULD use namespaced keys; consumers
	 * MUST ignore unknown keys. Use the typed accessors in `sessionState.ts`
	 * (e.g. `readSessionGitState`, `readSessionGitHubState`) for well-known
	 * slots.
	 */
	readonly _meta?: SessionMeta;
}

/** A provider chat ready to be registered as an Agent Host session. */
export interface IAgentDiscoveredChat extends IAgentChatMetadata {
	readonly external: boolean;
}

/** Returns the candidate session URI keys already present in the host registry. */
export type IAgentKnownSessionsFilter = (sessions: readonly URI[]) => Promise<ReadonlySet<string>>;

export interface IAgentSessionMetadata extends Omit<IAgentChatMetadata, 'chat'> {
	readonly session: URI;
}

export interface IAgentSessionProjectInfo {
	readonly uri: URI;
	readonly displayName: string;
}

export interface IAgentCreateSessionResult extends IAgentCreateChatResult {
	readonly session: URI;
	readonly project?: IAgentSessionProjectInfo;
	/** Opaque provider backing for the session's initial chat, when it has one. */
	readonly chat?: IAgentCreateChatResult;
	/**
	 * The single working directory the provider resolved for this session — its
	 * process root. This may differ from the requested primary (e.g. a
	 * workspace-less session runs in a provider-assigned scratch dir). It is NOT
	 * the full multi-root set: a provider only resolves the one directory its
	 * subprocess launches in. The host assembles the session's set by replacing
	 * the requested primary (index 0) with this value while keeping the requested
	 * tail. Worktree remaps and the fully-resolved set land later, on the first
	 * send, via {@link IAgentMaterializeSessionEvent.workingDirectories}.
	 * `undefined` means the provider did not resolve a directory (the host keeps
	 * the requested set as-is).
	 */
	readonly resolvedWorkingDirectory?: URI;
	/**
	 * `true` when the agent only allocated an in-memory placeholder for this
	 * session (no SDK session, no worktree, no on-disk state). Materialization
	 * happens lazily on the first {@link IAgentChats.sendMessage}, at which point
	 * the agent fires {@link IAgent.onDidMaterializeChat}. The
	 * {@link IAgentService} uses this flag to defer the `sessionAdded` protocol
	 * notification so observers don't see the session in their list until it
	 * has been persisted.
	 */
	readonly provisional?: boolean;
}

/**
 * Payload of {@link IAgent.onDidMaterializeChat}. Fired once a previously
 * {@link IAgentCreateSessionResult.provisional} chat has its SDK session,
 * worktree (if any), and on-disk metadata in place.
 */
export interface IAgentMaterializeChatEvent {
	readonly chat: URI;
	/** Updated opaque backing for the session chat, when materialization minted it. */
	readonly result?: IAgentCreateChatResult;
	/**
	 * The complete resolved working-directory set (index 0 = the resolved process
	 * root, e.g. a worktree). The host replaces index 0 of the current session set
	 * with this set's index 0 while preserving the rest of the current set — the
	 * resume path can only report the single process cwd, so its tail is owned
	 * by the restored session state.
	 */
	readonly workingDirectories: readonly URI[] | undefined;
	readonly project: IAgentSessionProjectInfo | undefined;
}

export type AgentProvider = string;
export type AgentTurnProviderCallState = 'notStarted' | 'pending' | 'resolved' | 'rejected';
export type AgentTurnProviderSessionState = 'active' | 'disconnecting' | 'disconnected' | 'shutdown';

export type IAgentTurnDiagnosticSnapshot = {
	readonly state: 'available';
	readonly providerCallState: AgentTurnProviderCallState;
	readonly providerTurnStarted: boolean;
	readonly providerSessionState: AgentTurnProviderSessionState;
} | {
	readonly state: 'missingChat' | 'missingTurn';
};

/** Well-known agent provider id for the Claude agent-host backend. */
export const CLAUDE_AGENT_PROVIDER_ID = 'claude' as const;

/** Well-known agent provider id for the Codex agent-host backend. */
export const CODEX_AGENT_PROVIDER_ID = 'codex' as const;

/**
 * Static capability facts an agent backend advertises about itself. Each flag
 * is opt-in (absent means unsupported) so single-chat agents (e.g. Codex) can omit
 * the bag entirely. Discovered over IPC alongside the rest of
 * {@link IAgentDescriptor} and surfaced to the sessions UI so features are
 * capability-gated instead of switched on the provider id.
 *
 * This is the IPC contract alias of the protocol-visible {@link AgentCapabilities}
 * type (defined in the root-state protocol); both share a single canonical shape
 * so a new flag added in one place is automatically reflected in the other.
 */
export type IAgentCapabilities = AgentCapabilities;

/** Metadata describing an agent backend, discovered over IPC. */
export interface IAgentDescriptor {
	readonly provider: AgentProvider;
	readonly displayName: string;
	readonly description: string;
	/** Static capability flags the agent advertises (see {@link IAgentCapabilities}). */
	readonly capabilities?: IAgentCapabilities;
}

// ---- Auth types (RFC 9728 / RFC 6750 inspired) -----------------------------

/**
 * Parameters for the `authenticate` command.
 * Analogous to sending `Authorization: Bearer <token>` (RFC 6750 section 2.1).
 */
export interface AuthenticateParams {
	/**
	 * The `resource` identifier from the server's
	 * {@link IAuthorizationProtectedResourceMetadata} that this token targets.
	 */
	readonly resource: string;
	/**
	 * Scopes that were used to acquire the token. Omitted for legacy clients
	 * that can only identify tokens by protected resource.
	 */
	readonly scopes?: readonly string[];

	/** The bearer token value (RFC 6750). */
	readonly token: string;
}

/** Request for a previously accepted bearer token. */
export interface IAgentHostAuthTokenRequest {
	/** Protected resource identifier from {@link ProtectedResourceMetadata.resource}. */
	readonly resource: string;
	/** Required token scopes, when the caller needs a scope-specific token. */
	readonly scopes?: readonly string[];
}

/**
 * Result of the `authenticate` command.
 */
export interface AuthenticateResult {
	/** Whether the token was accepted. */
	readonly authenticated: boolean;
}

/**
 * Canonical {@link ProtectedResourceMetadata} for the GitHub Copilot
 * resource. Shared between every agent provider that consumes a GitHub
 * Copilot bearer token (e.g. Copilot CLI, Claude) so they advertise an
 * identical resource identifier to the auth flow — clients dispatch by
 * `resource`, and divergent metadata would silently route the same
 * token down separate code paths.
 */
export const GITHUB_COPILOT_PROTECTED_RESOURCE: ProtectedResourceMetadata = {
	resource: 'https://api.github.com',
	resource_name: 'GitHub Copilot',
	authorization_servers: ['https://github.com/login/oauth'],
	scopes_supported: ['read:user', 'user:email'],
	required: true,
};

/**
 * Canonical {@link ProtectedResourceMetadata} for GitHub repository write
 * operations (e.g. creating a pull request). Distinct from
 * {@link GITHUB_COPILOT_PROTECTED_RESOURCE} so that the broader `repo`
 * scope is only requested when a session actually needs it (e.g. when a
 * changeset operation handler throws `AHP_AUTH_REQUIRED` with this
 * resource), rather than at session create for every agent.
 *
 * `required: false` reflects that the resource is only needed on demand —
 * agents do not have to advertise it eagerly. The workbench-side auth
 * contributor resolves it lazily in response to operation invocations.
 */
export const GITHUB_REPO_PROTECTED_RESOURCE: ProtectedResourceMetadata = {
	resource: 'https://api.github.com/repos',
	resource_name: 'GitHub Repository',
	authorization_servers: ['https://github.com/login/oauth'],
	scopes_supported: ['repo'],
	required: false,
};

/**
 * Pure decision: does this set of advertised protected resources require the
 * user to be signed in to GitHub Copilot right now?
 *
 * Returns `true` iff the agent advertises the canonical GitHub Copilot
 * protected resource ({@link GITHUB_COPILOT_PROTECTED_RESOURCE}) with
 * `required !== false`. Provider-agnostic by design: an agent that drops the
 * resource entirely (e.g. Claude in native mode) or advertises it with
 * `required: false` (e.g. Codex on OpenAI) does not require a GitHub sign-in.
 *
 * An absent `required` field is treated the same as `true` (see
 * {@link ProtectedResourceMetadata.required}).
 */
export function protectedResourcesRequireGitHubCopilotSignIn(resources: readonly ProtectedResourceMetadata[]): boolean {
	return resources.some(resource =>
		resource.resource === GITHUB_COPILOT_PROTECTED_RESOURCE.resource && resource.required !== false);
}

export interface IAgentCreateSessionConfig {
	readonly provider?: AgentProvider;
	readonly model?: ModelSelection;
	readonly _meta?: Record<string, unknown>;
	/**
	 * Initial custom agent selection for the new session. Omit to start with
	 * no custom agent selected (provider default behavior).
	 */
	readonly agent?: AgentSelection;
	readonly session?: URI;
	/**
	 * The working directories the session's agent is granted tool access to,
	 * ordered so that index 0 is the intended process root (the "primary").
	 *
	 * Distinct values:
	 * - `undefined` — no directories requested (workspace-less inference applies);
	 * - `[]` — explicitly no directories;
	 * - `[dir, …]` — the ordered set (index 0 = primary/process root).
	 *
	 * A client MUST NOT supply more than one entry unless the agent advertises
	 * the `multipleWorkingDirectories` capability (not advertised yet). During
	 * the compatibility phase callers supply exactly one directory (`[dir]`).
	 */
	readonly workingDirectories?: readonly URI[];
	readonly config?: Record<string, unknown>;
	/**
	 * Eagerly claim the active client role for the new session. When provided,
	 * the server initializes the session with this client as the active
	 * client, equivalent to dispatching a `session/activeClientSet`
	 * action immediately after creation. The `clientId` MUST match the
	 * connection's own `clientId`.
	 */
	readonly activeClient?: SessionActiveClient;
	/**
	 * Import an existing (e.g. local) conversation into a brand-new session as
	 * real, editable turns. The provider translates {@link turns} into a
	 * Copilot event log seeded on disk and resumes the session so the turns are
	 * reconstituted as genuine backend events (editable / forkable / truncatable).
	 *
	 * The service layer assigns fresh UUID turn ids before handing the turns to
	 * the provider so the seeded event ids and the seeded protocol turns stay
	 * aligned. Mutually exclusive with {@link fork}.
	 */
	readonly importConversation?: {
		readonly turns: readonly Turn[];
		readonly model?: ModelSelection;
	};
	/**
	 * MCP-style opt-in progress token from the client's `createSession`. When
	 * set, the service reports any long-running session bring-up work — chiefly
	 * the lazy first-use SDK download — as `progress` notifications carrying
	 * this token, so the client can correlate them to this call.
	 */
	readonly progressToken?: string;
}

/**
 * Host-owned transient context for an addressed chat operation.
 *
 * `resource` is the provider-owned persistence scope for this exact chat.
 * `configurationResource` is the opaque scope for configuration and other
 * resources shared by the host across related chats. Providers must not derive
 * either value from `chat` themselves.
 *
 * Agent Host populates {@link origin} and {@link customizations} on every
 * context it hands to a provider (create, materialize, send, and every other
 * addressed chat operation).
 */
export interface IAgentChatContext {
	readonly resource: URI;
	readonly configurationResource: URI;
	readonly clientTelemetryContext?: IAgentHostClientTelemetryContext;
	/**
	 * The addressed chat's origin, taken verbatim from the host-owned chat
	 * catalog, and exhaustive across every way a chat comes into existence:
	 * a plainly user-created peer chat and the session-backed default chat
	 * carry {@link ChatOriginKind.User}; a fork carries
	 * {@link ChatOriginKind.Fork} with the exact source chat and turn; a side
	 * chat carries {@link ChatOriginKind.SideChat}; and a subagent chat always
	 * carries its {@link ChatOriginKind.Tool} spawn edge, so providers never
	 * have to recover it from state or URI shape. Absent only when the host has
	 * no catalog entry for the chat yet — the narrow window during restore
	 * before the chat is registered, where the caller supplies the origin it is
	 * restoring with.
	 */
	readonly origin?: ChatOrigin;
	/**
	 * The owning session's last host-published customization snapshot — the
	 * same list clients observe on `SessionState.customizations`, including
	 * user enablement toggles. Supplied at the create, materialize, send, and
	 * update boundaries so providers never read them back out of shared host
	 * state, and reconciled against the provider's own view rather than
	 * replacing it. Absent when the host has not published a snapshot for the
	 * session yet, which is deliberately distinct from an empty list.
	 */
	readonly customizations?: readonly Customization[];
	/** Per-operation host instructions that providers add to model context without persisting as user content. */
	readonly hostInstructions?: readonly string[];
}

export type AgentChatOperationContext = URI | IAgentChatContext;

/**
 * Normalize a legacy session-only chat context into the explicit
 * {@link IAgentChatContext} shape by attaching the host-supplied `resource`.
 */
export function resolveAgentChatContext(configurationResourceOrContext: AgentChatOperationContext, resource: URI): IAgentChatContext {
	const context = URI.isUri(configurationResourceOrContext)
		? { configurationResource: configurationResourceOrContext, resource }
		: configurationResourceOrContext;
	if (!isEqual(context.resource, context.configurationResource) && !isEqual(context.resource, resource)) {
		throw new Error(`Chat context resource must be the configuration resource or addressed chat: ${context.resource.toString()}`);
	}
	return context;
}

/**
 * Reads the host-supplied {@link IAgentChatContext.origin} for an addressed
 * chat operation. See {@link IAgentChatContext.origin} for absence semantics.
 */
export function resolveAgentChatOrigin(context?: URI | IAgentChatContext): ChatOrigin | undefined {
	return context && !URI.isUri(context) ? context.origin : undefined;
}

/**
 * Reads the tool-call spawn edge of a subagent chat from its host-supplied
 * origin. Returns `undefined` when the chat was not spawned by a tool call.
 * Providers use this to route inner tool completions and transcript filtering
 * to the spawning chat without consulting shared host state.
 */
export function resolveSubagentChatParent(context?: URI | IAgentChatContext): IAgentSpawnedChatParent | undefined {
	const origin = resolveAgentChatOrigin(context);
	return origin?.kind === ChatOriginKind.Tool ? { chat: URI.parse(origin.chat), toolCallId: origin.toolCallId } : undefined;
}

/**
 * Reads the last host-published customization snapshot carried by an
 * addressed chat operation's context. See {@link IAgentChatContext.customizations}
 * for absence semantics.
 */
export function resolveAgentHostCustomizations(context?: URI | IAgentChatContext): readonly Customization[] | undefined {
	return context && !URI.isUri(context) ? context.customizations : undefined;
}

export function resolveAgentHostInstructions(context?: URI | IAgentChatContext): readonly string[] | undefined {
	return context && !URI.isUri(context) ? context.hostInstructions : undefined;
}

/** Fully resolved options for creating one chat. */
export interface IAgentCreateChatOptions {
	/** Whether the owning session is transient and should skip durable-only provider work. */
	readonly isEphemeral?: boolean;
	/**
	 * Whether the owning chat surface is scoped to editing a single file (editor
	 * inline chat). Blanket shell auto-approvals must not apply to such a
	 * session, because a shell command can write anywhere the sandbox allows and
	 * carries no destination the permission layer can check against the scope.
	 */
	readonly hasScopedEditSurface?: boolean;
	/** Optional display title for the new chat. */
	readonly title?: string;
	/** Optional model override; defaults to the session's model. */
	readonly model?: ModelSelection;
	/** Optional custom agent selection. */
	readonly agent?: AgentSelection;
	/** Complete ordered working-directory set resolved by Agent Host. */
	readonly workingDirectories?: readonly URI[];
	/** Project metadata resolved by Agent Host. */
	readonly project?: IAgentSessionProjectInfo;
	/** Provider-specific configuration resolved by Agent Host. */
	readonly config?: Record<string, unknown>;
	/** Active client to seed before the first turn. */
	readonly activeClient?: SessionActiveClient;
	/** Defer creating the provider SDK backing until the chat's first send. */
	readonly deferBacking?: boolean;
	/** Existing conversation turns to import into this chat. */
	readonly importConversation?: IAgentCreateSessionConfig['importConversation'];
	/**
	 * Fork an existing chat into this new chat. The new chat starts
	 * pre-populated with the source chat's turns up to and including
	 * {@link IAgentCreateChatForkSource.turnId}, and its backing chat
	 * is forked from the source so it can continue independently.
	 */
	readonly fork?: IAgentCreateChatForkSource;
}

/**
 * Host-facing chat creation options. Providers receive the resolved
 * {@link IAgentCreateChatOptions} and never receive side-chat provenance.
 */
export interface IAgentCreateChatRequestOptions extends IAgentCreateChatOptions {
	/**
	 * Create this new chat as a side chat branching from a turn in an existing
	 * chat (via `/btw`). The host resolves this into {@link fork} before calling
	 * the provider, while retaining the side-chat provenance itself.
	 */
	readonly sideChat?: IAgentCreateChatSideChatSource;
}

/** Identifies the exact source chat and turn to fork from. */
export interface IAgentCreateChatForkSource {
	readonly source: URI;
	/** Turn ID in the source chat; content up to and including this turn is copied. */
	readonly turnId: string;
	/**
	 * Allows a fork to start without waiting for the source chat's queue.
	 * Side chats branch from potentially active source turns and use this to
	 * avoid blocking their own creation behind that turn.
	 */
	readonly independentQueue?: boolean;
	/** Zero-based source turn index, when the provider needs it for import/fork mapping. */
	readonly turnIndex?: number;
	/**
	 * Maps old source turn IDs to fresh turn IDs for the forked chat. Populated
	 * by the agent service so the agent can remap per-turn data (e.g. SDK event
	 * ID mappings) in the forked chat's database.
	 */
	readonly turnIdMapping?: ReadonlyMap<string, string>;
}

/** Immutable selected-text snapshot captured when a side chat is created. */
export interface IAgentCreateChatSideChatSelection {
	readonly text: string;
	/** Optional provenance for the response part that contained {@link text}. */
	readonly responsePartId?: string;
}

/** Identifies a source chat and turn a side chat (`/btw`) branches from. */
export interface IAgentCreateChatSideChatSource {
	readonly source: URI;
	/** Turn ID in the source chat the side chat records as its provenance. */
	readonly turnId: string;
	/** Optional selected-text snapshot captured from the source chat transcript. */
	readonly selection?: IAgentCreateChatSideChatSelection;
}

/** Result of {@link IAgentChats.createChat}: the opaque blob to persist for restore. */
export interface IAgentCreateChatResult {
	readonly project?: IAgentSessionProjectInfo;
	readonly resolvedWorkingDirectory?: URI;
	readonly provisional?: boolean;
	/** Id of the last provider turn copied into a newly created fork, when known. */
	readonly inheritedTurnId?: string;
	/**
	 * Opaque, agent-owned token the orchestrator persists verbatim in the chat
	 * catalog and hands back to {@link IAgent.materializeChat} on
	 * restore. The orchestrator never parses it. `undefined` means nothing to
	 * persist (e.g. the agent keeps no resumable backing).
	 */
	readonly providerData?: string;
	/**
	 * The SDK-level session URI that backs this chat, when the agent mints one in
	 * the same session store its own {@link IAgent.listSessions} enumerates
	 * (e.g. Claude). First-class and non-opaque — unlike {@link providerData} the
	 * orchestrator reads it to correlate and suppress the backing session so it
	 * never surfaces as a top-level session. `undefined` when the agent keeps no
	 * separately-enumerable backing session.
	 */
	readonly backingSession?: URI;
}

/** Payload of {@link IAgent.onDidChangeChatData}. */
export interface IAgentChatDataChange {
	readonly chat: URI;
	/** The new opaque blob to persist (replaces any previously stored value). */
	readonly providerData: string;
}

/** A legacy concrete chat backing enumerated by {@link IAgent.listLegacyChatBackings} for migration. */
export interface IAgentLegacyChat {
	/** The concrete chat's channel URI (see {@link buildChatUri}). */
	readonly uri: URI;
	/** The opaque, agent-owned backing blob, encoded as {@link materializeChat} expects. */
	readonly providerData?: string;
}

/**
 * Identifies the parent that spawned a chat. The orchestrator records
 * it as the spawned chat's {@link ChatOriginKind.Tool} origin so clients can
 * render the parent/child relationship (e.g. a sub-agent "team" member spawned
 * by a tool call in the parent chat).
 */
export interface IAgentSpawnedChatParent {
	/** The parent chat URI whose tool call performed the spawn. */
	readonly chat: URI;
	/** The id of the tool call in the parent that spawned this chat. */
	readonly toolCallId: string;
}

/**
 * Payload of {@link IAgent.onDidSpawnChat}: a new chat the
 * agent spawned itself (e.g. a sub-agent delegated by a tool call), as opposed
 * to a user-driven chat created via
 * {@link IAgentChats.createChat}.
 */
export interface IAgentSpawnChatEvent {
	/** The session URI the spawned chat belongs to. */
	readonly session: URI;
	readonly chat: URI;
	/**
	 * The parent that spawned it, when the spawn was delegated by a tool call.
	 * Recorded as the chat's tool origin in the catalog. Absent for a
	 * top-level, agent-initiated chat with no spawning tool call.
	 */
	readonly parent?: IAgentSpawnedChatParent;
	readonly title?: string;
}

/** Max characters for a subagent tab title before it is ellipsized. */
const SUBAGENT_CHAT_TITLE_MAX_LENGTH = 60;

/**
 * Builds the tab title for a subagent peer chat. Prefers the concise
 * per-task description (so two subagents of the same type still get
 * distinct, meaningful names), truncating it so an over-long value never
 * blows out the tab strip or the Subagents dropdown; falls back to the
 * agent type's display name, then a generic label. Shared by the live
 * spawn path and the restore path so both name subagent tabs identically.
 */
export function subagentChatTitle(taskDescription: string | undefined, agentDisplayName: string | undefined): string {
	const task = taskDescription?.trim();
	if (task) {
		return truncate(task, SUBAGENT_CHAT_TITLE_MAX_LENGTH);
	}
	return agentDisplayName?.trim() || 'Subagent';
}

/**
 * Maps agent `subagent_started` signals to the unified chat catalog's spawn
 * events. Shared by the agents' spawn bridges and the orchestrator so subagent
 * membership has one derivation.
 */
export namespace SubagentChatSignal {

	/**
	 * Derives the {@link IAgentSpawnChatEvent} for a `subagent_started` signal,
	 * addressing the subagent by the stable {@link buildSubagentChatUri} and
	 * recording the spawning tool call as its parent edge. Returns `undefined`
	 * for any other signal (or an unmappable chat URI).
	 */
	export function toSpawnEvent(signal: AgentSignal): IAgentSpawnChatEvent | undefined {
		if (signal.kind !== 'subagent_started') {
			return undefined;
		}
		let session: string;
		try {
			session = parseRequiredSessionUriFromChatUri(signal.chat);
		} catch {
			return undefined;
		}
		return {
			session: URI.parse(session),
			chat: URI.parse(buildSubagentChatUri(session, signal.toolCallId)),
			parent: { chat: signal.chat, toolCallId: signal.toolCallId },
			title: subagentChatTitle(signal.taskDescription, signal.agentDisplayName),
		};
	}
}

// ---- Chat surface --------------------------------------------------

/**
 * The chat-addressed operation surface an agent exposes for the chats
 * within a session.
 *
 * Every operation method addresses a chat by a concrete chat channel URI; the
 * orchestrator ({@link IAgentService}) owns the `(session, chat)` mapping and
 * calls these operations with a concrete chat URI plus transient context when
 * the provider needs the owning session or storage scope.
 */
export interface IAgentChats {
	/**
	 * Create a fresh additional chat within an already-provisioned `session`,
	 * using the complete working directory and config supplied in
	 * {@link IAgentCreateChatOptions}. `chat` is the client-chosen channel URI.
	 * The orchestrator supplies provider-owned persistence and configuration
	 * scopes via `context`, so the agent never has to recover either by parsing
	 * `chat`.
	 */
	createChat(chat: URI, context: AgentChatOperationContext, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void>;

	/** Dispose the addressed chat and free its backing. */
	disposeChat(chat: URI, context: AgentChatOperationContext): Promise<void>;

	/** Return whether the addressed chat can currently release its in-memory backing. */
	canReleaseChat?(chat: URI, context: AgentChatOperationContext): Promise<boolean>;

	/** Release the addressed chat's in-memory backing without deleting durable data. */
	releaseChat(chat: URI, context: AgentChatOperationContext): Promise<void>;

	/**
	 * Send a user message into `chat`. On every send, the host passes the complete
	 * resolved, ordered working-directory snapshot (index 0 = the process root /
	 * resolved worktree, followed by any additional roots), or `undefined` for
	 * workspace-less sessions. Providers must make that snapshot effective before
	 * the prompt enters their runtime. `context` is transient operation context;
	 * providers must not retain it as chat membership state.
	 */
	sendMessage(chat: URI, prompt: string, workingDirectoriesOrDirectory: readonly URI[] | URI | undefined, attachments?: readonly MessageAttachment[], turnId?: string, senderClientId?: string, clientTypeOrContext?: AgentHostClientType | URI | IAgentChatContext, context?: URI | IAgentChatContext): Promise<void>;

	/** Abort the in-flight turn for `chat`. */
	abort(chat: URI, context: AgentChatOperationContext): Promise<void>;

	/** Return the model currently bound to `chat`, when the provider knows it. */
	getModel?(chat: URI, context: AgentChatOperationContext): ModelSelection | undefined;

	changeModel(chat: URI, model: ModelSelection, context: AgentChatOperationContext): Promise<void>;

	/**
	 * Change (or clear) the selected custom agent for `chat`. Passing
	 * `undefined` clears the selection (provider default behavior).
	 */
	changeAgent(chat: URI, agent: AgentSelection | undefined, context: AgentChatOperationContext): Promise<void>;

	/** Reconstruct the turns for `chat` (used on restore). */
	getMessages(chat: URI, context: AgentChatOperationContext): Promise<readonly Turn[]>;
}

export interface IAgentResolveChatConfigParams {
	readonly provider?: AgentProvider;
	readonly workingDirectory?: URI;
	readonly config?: Record<string, unknown>;
}

export interface IAgentChatConfigCompletionsParams extends IAgentResolveChatConfigParams {
	readonly property: string;
	readonly query?: string;
}

export type IAgentResolveSessionConfigParams = IAgentResolveChatConfigParams;
export type IAgentSessionConfigCompletionsParams = IAgentChatConfigCompletionsParams;

/** Serializable model information from the agent host. */
export interface IAgentModelInfo {
	readonly provider: AgentProvider;
	readonly id: string;
	readonly name: string;
	readonly maxContextWindow?: number;
	readonly maxOutputTokens?: number;
	readonly maxPromptTokens?: number;
	readonly supportsVision: boolean;
	readonly configSchema?: ConfigSchema;
	readonly policyState?: PolicyState;
	readonly _meta?: Record<string, unknown>;
}

// ---- Agent signals (sent via IAgent.onDidChatProgress) ----------------------

/**
 * A signal emitted by an agent during session execution.
 *
 * Most signals carry a protocol {@link SessionAction} directly via the
 * `kind: 'action'` shape, eliminating a parallel event ontology. A small
 * number of cases that have no clean protocol action (permission
 * auto-approval, subagent session creation, steering acknowledgment, and
 * host-owned model-call telemetry) remain as discriminated non-action signals.
 */
export type AgentSignal =
	| IAgentActionSignal
	| IAgentModelCallCompletedSignal
	| IAgentToolPendingConfirmationSignal
	| IAgentSubagentStartedSignal
	| IAgentSubagentResumedSignal
	| IAgentSubagentCompletedSignal
	| IAgentSteeringConsumedSignal;

/**
 * Carries a protocol {@link SessionAction} produced by an agent. The host
 * dispatches the action through the state manager after routing via
 * {@link IAgentActionSignal.parentToolCallId} (if set).
 *
 * Agents are responsible for populating the target channel and any `turnId` /
 * `partId` fields on the action.
 */
export interface IAgentActionSignal {
	readonly kind: 'action';
	/** Target session or chat channel URI. For inner subagent events this is the parent session — see {@link parentToolCallId}. */
	readonly resource: URI;
	/** Protocol action to dispatch. */
	readonly action: SessionAction | ChatAction;
	/** If set, route the action to the subagent session belonging to this tool call. */
	readonly parentToolCallId?: string;
}

/** Reports one completed upstream model response for host-owned turn telemetry. */
export interface IAgentModelCallCompletedSignal {
	readonly kind: 'model_call_completed';
	/** Target chat channel URI. For inner subagent calls this is the parent chat channel. */
	readonly resource: URI;
	/** Provider-reported turn identifier. The host remaps it when routing to a subagent chat. */
	readonly turnId: string;
	/** Stable provider message or response identifier used to suppress duplicate notifications. */
	readonly modelCallId: string;
	/** If set, route the model call to the subagent session belonging to this tool call. */
	readonly parentToolCallId?: string;
}

/**
 * A tool has finished collecting parameters and needs the host to decide
 * whether it should run (or, mid-execution, re-confirm). The host applies
 * auto-approval logic over {@link permissionKind} / {@link permissionPath}
 * (see `SessionPermissionManager.getAutoApproval`) and then dispatches the
 * appropriate `ChatToolCallReady` action — with confirmation options
 * baked in when the user must approve, or with `confirmed: NotNeeded` when
 * the host auto-approved.
 *
 * Kept as a non-action signal because the host owns this approval policy;
 * the agent only describes the tool call and the kind of permission being
 * requested. The {@link state} field carries the protocol-shaped tool-call
 * state and is dispatched verbatim into the action.
 */
export interface IAgentToolPendingConfirmationSignal {
	readonly kind: 'pending_confirmation';
	/** Target chat channel URI containing the tool call. */
	readonly chat: URI;
	/** Protocol-shaped pending-confirmation state, dispatched verbatim into `ChatToolCallReady`. */
	readonly state: ToolCallPendingConfirmationState;
	/** Host-only auto-approval kind (not part of the dispatched action). */
	readonly permissionKind?: 'shell' | 'write' | 'mcp' | 'read' | 'url' | 'skill' | 'custom-tool' | 'hook' | 'memory' | 'factory' | 'extension-management' | 'extension-permission-access';
	/** Host-only auto-approval path target (not part of the dispatched action). */
	readonly permissionPath?: string;
	/**
	 * Host-only flag requiring the client to show a confirmation instead of applying host auto-approval.
	 * The runtime currently sets it for managed Shell, Read, Edit, and Domain selector asks.
	 */
	readonly managedApprovalRequired?: boolean;
	/**
	 * Host-only flag (not part of the dispatched action): the model requested
	 * this shell command run OUTSIDE the sandbox (and the host opted in via
	 * `sandbox.allowBypass`).
	 */
	readonly requestSandboxBypass?: boolean;
	/**
	 * Host-only shell language for terminal auto-approval.
	 * Only `bash` and `powershell` are eligible for terminal-rule analysis;
	 * missing requires explicit confirmation.
	 */
	readonly shellLanguage?: 'bash' | 'powershell';
	/**
	 * If set, the tool call belongs to the subagent rooted at this
	 * parent tool call. Used by the host to route the resulting
	 * `ChatToolCallReady` to the subagent session — otherwise the
	 * action would land on the parent session, where there is no
	 * matching `ChatToolCallStart`.
	 */
	readonly parentToolCallId?: string;
}

/**
 * A subagent was spawned by a tool call. The host creates a child session
 * silently and routes subsequent inner-tool events to it.
 *
 * Kept as a non-action signal because subagent session creation has no
 * protocol action — it's a host-side composition primitive.
 */
export interface IAgentSubagentStartedSignal {
	readonly kind: 'subagent_started';
	readonly chat: URI;
	readonly toolCallId: string;
	readonly agentName: string;
	readonly agentDisplayName: string;
	readonly agentDescription?: string;
	/**
	 * The spawning Task tool's short (typically 3-5 word) `description`
	 * input, e.g. "Review package.json structure". Distinct from
	 * {@link agentDescription} (the agent *type*'s long role blurb) and
	 * {@link agentDisplayName} (the agent type's name). Preferred as the
	 * peer chat's tab title because it is concise and per-task, so two
	 * subagents of the same type still get distinct, meaningful names.
	 * Absent when the harness does not surface a task description.
	 */
	readonly taskDescription?: string;
	/**
	 * The full delegated instruction the parent handed the subagent (the
	 * spawning tool's `prompt` input). Populated by each provider at emit
	 * time from its own native source, so the shared orchestrator never
	 * parses a provider-specific tool-input shape. Seeds the subagent peer
	 * chat's opening request. Distinct from {@link taskDescription} (a short
	 * tab-title label). Absent when the harness does not surface a prompt.
	 */
	readonly taskPrompt?: string;
	/**
	 * If set, the spawning tool call ({@link toolCallId}) itself lives
	 * inside another subagent's chat — this is the tool call **one level up**
	 * from the spawning tool (its parent), i.e. the tool that spawned the
	 * immediate parent chat. The host uses it to route the
	 * subagent-discovery side effect (the `ChatToolCallContentChanged`
	 * block that lets clients find the child chat) to that immediate parent
	 * chat rather than the top-level {@link chat}. Because subagent chats
	 * are flat (all keyed off the root session + the spawning tool id),
	 * this single one-hop reference resolves the correct parent chat at
	 * ANY nesting depth — no per-level chain is needed. Absent for a
	 * top-level subagent, whose spawning tool call lives directly in
	 * {@link chat}.
	 */
	readonly parentToolCallId?: string;
}

/**
 * A previously completed subagent started another turn after being steered.
 */
export interface IAgentSubagentResumedSignal {
	readonly kind: 'subagent_resumed';
	readonly chat: URI;
	readonly toolCallId: string;
	readonly message?: Message;
}

/**
 * A subagent turn has finished — either successfully or with an error. The
 * child chat and its routing remain live because the same subagent can be
 * steered into another turn.
 */
export interface IAgentSubagentCompletedSignal {
	readonly kind: 'subagent_completed';
	readonly chat: URI;
	readonly toolCallId: string;
}

/** A steering message was consumed (sent to the model). */
export interface IAgentSteeringConsumedSignal {
	readonly kind: 'steering_consumed';
	readonly chat: URI;
	readonly id: string;
}

// ---- Session URI helpers ----------------------------------------------------

export namespace AgentSession {

	/**
	 * Creates a session URI from a provider name and raw session ID.
	 * The URI scheme is the provider name (e.g., `copilot:/<rawId>`).
	 */
	export function uri(provider: AgentProvider, rawSessionId: string): URI {
		return URI.from({ scheme: provider, path: `/${rawSessionId}` });
	}

	/**
	 * Extracts the raw session ID from a session URI (the path without leading slash).
	 * Accepts both a URI object and a URI string.
	 */
	export function id(session: URI | string): string {
		const parsed = typeof session === 'string' ? URI.parse(session) : session;
		return parsed.path.substring(1);
	}

	/**
	 * Extracts the provider name from a session URI scheme.
	 * Accepts both a URI object and a URI string.
	 */
	export function provider(session: URI | string): AgentProvider | undefined {
		const parsed = typeof session === 'string' ? URI.parse(session) : session;
		return parsed.scheme || undefined;
	}
}

// ---- Agent provider interface -----------------------------------------------

/**
 * A notification originating from an MCP server, routed back to the AHP
 * client through the `mcp://` side channel. `channel` is the channel
 * URI advertised on the owning
 * {@link McpServerCustomization.channel | McpServerCustomization}; the
 * client uses it to fan the notification out to the appropriate App.
 * `method` and `params` follow the underlying MCP notification spec
 * (e.g. `notifications/tools/list_changed`).
 */
export interface IMcpNotification {
	readonly channel: string;
	readonly method: string;
	readonly params?: Record<string, unknown>;
}

/**
 * A per-chat handle for one active client's contributions (tools and
 * plugin customizations), obtained via
 * {@link IAgent.getOrCreateActiveClient}.
 *
 * `tools` and `customizations` are mutable accessor properties: assigning a
 * new array replaces this client's contribution wholesale and triggers the
 * agent's internal reaction (refreshing the merged tool set exposed to the
 * model, or kicking off an asynchronous customization sync). The arrays are
 * `readonly` so callers cannot mutate them in place and silently bypass the
 * setter. The agent merges the contributions of all active clients on a
 * exact chat, deduplicating as needed.
 */
export interface IActiveClient {
	/** Client identifier (matches `clientId` from `initialize`). */
	readonly clientId: string;
	/** Human-readable client name (e.g. `"VS Code"`), if provided. */
	readonly displayName: string | undefined;
	/** This client's tools. Assigning replaces the set (full replacement). */
	tools: readonly ToolDefinition[];
	/** This client's plugin customizations. Assigning replaces the set and starts an internal sync. */
	customizations: readonly ClientPluginCustomization[];
}

/** Worktree identity a predecessor recorded for a chat, so a missing checkout can be recreated on resume. */
export interface IAgentAdoptedWorktree {
	readonly branchName: string;
	readonly baseBranch: string | undefined;
	readonly worktreePath: URI;
	readonly repositoryRoot: URI;
}

/**
 * Why an adoption attempt ended the way it did. Reported in logs and telemetry so
 * a session that did not migrate can be diagnosed without reproducing it.
 */
export type AgentChatAdoptionReason =
	/** Already has Agent Host metadata — native or previously adopted. */
	| 'alreadyNative'
	/** Not a legacy extension-host Copilot CLI chat (e.g. standalone CLI, Local agent). */
	| 'notLegacyChat'
	/** A legacy chat whose recorded working directory no longer exists and could not be resolved. */
	| 'workingDirectoryMissing'
	/** A legacy chat whose extension-host marker could not be re-read, leaving its archived state unknown. */
	| 'markerUnavailable'
	/** Newly adopted. */
	| 'adopted';

/** Outcome of attempting to adopt a legacy provider-native chat. */
export interface IAgentChatAdoptionResult {
	/** Whether this call newly seeded Agent Host metadata. */
	readonly adopted: boolean;
	/** Whether the chat was a genuine legacy adoption candidate. */
	readonly eligible: boolean;
	/** Whether the chat already has Agent Host metadata, i.e. it is ours regardless of adoption. */
	readonly native?: boolean;
	/** Set when the adopted chat ran in a worktree that no longer exists and can be recreated. */
	readonly worktree?: IAgentAdoptedWorktree;
	/** Diagnostic reason behind {@link adopted}. */
	readonly reason?: AgentChatAdoptionReason;
}

/**
 * Implemented by each agent backend (e.g. Copilot SDK).
 * The {@link IAgentService} dispatches to the appropriate agent based on
 * the agent id.
 */
export interface IAgent {
	// ---- Identity and catalog -----------------------------------------------

	/** Unique provider identifier. */
	readonly id: AgentProvider;

	/** Provider descriptor and capabilities. */
	getDescriptor(): IAgentDescriptor;

	/** Available provider models. */
	readonly models: IObservable<readonly IAgentModelInfo[]>;

	/** Optional refresh for providers whose model catalog can change at runtime. */
	refreshModels?(): Promise<void>;

	// ---- Chat lifecycle and progress ----------------------------------------

	/** Streamed progress for an exact chat. */
	readonly onDidChatProgress: Event<AgentSignal>;

	/** Fires when a provisional chat acquires its SDK backing and durable metadata. */
	readonly onDidMaterializeChat: Event<IAgentMaterializeChatEvent>;

	/** Fires when an opaque chat backing changes and must be persisted again. */
	readonly onDidChangeChatData: Event<IAgentChatDataChange>;

	/** Fires when the provider creates a chat, such as a delegated subagent. */
	readonly onDidSpawnChat: Event<IAgentSpawnChatEvent>;

	/** Exact-chat operations: create, send, abort, mutate, restore history, release, and dispose. */
	readonly chats: IAgentChats;

	/** Re-attach an exact chat from opaque provider data without inferring its role. */
	materializeChat(chat: URI, context: URI | IAgentChatContext, providerData: string | undefined): Promise<IAgentCreateChatResult | void>;

	/** Optional steering hook for providers that can accept messages during an active turn. */
	setPendingMessages?(chat: URI, steeringMessage: PendingMessage | undefined, queuedMessages: readonly PendingMessage[]): void;

	/** Optional history mutation for providers with a native truncation operation. */
	truncateChat?(chat: URI, turnId: string | undefined, context?: URI | IAgentChatContext): Promise<void>;

	/** Return bounded diagnostics for an in-flight turn when supported. */
	getTurnDiagnosticSnapshot?(chat: URI, turnId: string): IAgentTurnDiagnosticSnapshot | undefined;

	// ---- Active clients and interaction ------------------------------------

	/** Get or create one client's contribution handle for an exact chat. */
	getOrCreateActiveClient(chat: URI, context: URI | IAgentChatContext, client: { readonly clientId: string; readonly displayName?: string }, hostCustomizations?: readonly Customization[]): IActiveClient;

	/** Remove one client's contributions from an exact chat. */
	removeActiveClient(chat: URI, context: URI | IAgentChatContext, clientId: string): void;

	/** Complete a client tool call on its host-resolved provider chat. */
	onClientToolCallComplete(chat: URI, toolCallId: string, result: ToolCallResult, context?: IAgentChatContext): void;

	/** Respond to a pending permission request from the SDK. */
	respondToPermissionRequest(requestId: string, approved: boolean): void;

	/** Respond to a pending user input request from the SDK's ask_user tool. */
	respondToUserInputRequest(requestId: string, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>): void;

	// ---- Configuration and customizations ----------------------------------

	/** Resolve provider-owned chat configuration; host-owned worktree fields are omitted. */
	resolveChatConfig(params: IAgentResolveChatConfigParams): Promise<ResolveSessionConfigResult>;

	/** Select provider-owned configuration inherited by a newly created chat. */
	getInheritedChatConfig(config: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined;

	/** Select provider-owned configuration for an unattended autonomous turn. */
	getAutonomousSessionConfig?(config: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined;

	/** Return dynamic completions for a provider-owned chat configuration property. */
	chatConfigCompletions(params: IAgentChatConfigCompletionsParams): Promise<SessionConfigCompletionsResult>;

	/** Optional push signal; providers with pull-only customization discovery omit it. */
	readonly onDidCustomizationsChange?: Event<void>;

	/** Optional provider-wide catalog; providers with only per-chat discovery omit it. */
	getCustomizations?(): readonly Customization[];

	/** Return the effective customization projection for an exact chat. */
	getChatCustomizations(chat: URI, context: URI | IAgentChatContext, hostCustomizations?: readonly Customization[]): Promise<readonly Customization[]>;

	/** Returns host-internal plugin owners for MCP servers temporarily published top-level. */
	getMcpServerOwners?(session: URI): ReadonlyMap<string, string> | undefined;

	/**
	 * Optional provider-owned decision about the multi-root new-session Folder
	 * picker, computed from the ordered working-directory set (index 0 = the
	 * current primary) and seeded into the session's `_meta` at creation for the
	 * client. Returns `undefined` when the provider has no opinion: nothing is
	 * seeded and the client keeps the picker hidden by default, so a provider
	 * that wants it shown must say so with `{ hidden: false }`. The optional
	 * {@link token} aborts the (possibly filesystem-bound) computation.
	 */
	computeFolderPickerDecision?(workingDirectories: readonly URI[], token?: CancellationToken): Promise<ISessionFolderPickerDecision | undefined>;

	// ---- External chat discovery -------------------------------------------

	/** Provides chats that are ready to be registered as Agent Host sessions. */
	readonly onDidDiscoverChats: Event<readonly IAgentDiscoveredChat[]>;

	/** Lets discovery drop registered candidates before per-session I/O. */
	setKnownSessionsFilter?(filter: IAgentKnownSessionsFilter): void;

	// ---- Legacy migration ---------------------------------------------------

	/** Optional adoption hook for providers with a predecessor-owned on-disk format. */
	ensureChatAdopted?(chat: URI, context: URI | IAgentChatContext): Promise<IAgentChatAdoptionResult>;

	/** Optional recovery hook for providers with historical backings but no persisted provider data. */
	recoverLegacyChat?(chat: URI, context: URI | IAgentChatContext): Promise<IAgentCreateChatResult | void>;

	/** Enumerate provider-native chats for registry migration; `undefined` means the catalog is unavailable. */
	listChatsToMigrate(): Promise<readonly IAgentChatMetadata[] | undefined>;

	/** Optional migration codec for providers that persisted peer backings before the host catalog. */
	listLegacyChatBackings?(configurationResource: URI): Promise<readonly IAgentLegacyChat[]>;

	// ---- Metadata -----------------------------------------------------------

	/** Retrieve metadata for an exact registered chat. */
	getChatMetadata(chat: URI, context: URI | IAgentChatContext, providerData?: string): Promise<IAgentChatMetadata | undefined>;

	// ---- Authentication and diagnostics ------------------------------------

	getProtectedResources(): ProtectedResourceMetadata[];

	/** An empty token revokes the credential previously forwarded for this resource. */
	authenticate(resource: string, token: string): Promise<boolean>;

	/** Optional token consumer for provider-owned resources such as MCP servers. */
	handleAuthenticationToken?(params: AuthenticateParams): Promise<boolean>;

	/** Optional current authentication requirement for providers that can require re-authentication after startup. */
	readonly authenticationRequired?: IObservable<Omit<AuthRequiredParams, 'channel'> | undefined>;

	/** Optional endpoint list when the provider owns probeable network traffic. */
	getNetworkDiagnosticsEndpoints?(): Promise<readonly IAgentHostNetworkEndpoint[]>;

	/** Optional account label when the provider can resolve one. */
	getNetworkDiagnosticsAccount?(): Promise<string | undefined>;

	/** Optional managed-settings snapshot for providers with an enterprise policy surface. */
	getManagedSettingsDiagnostics?(): Promise<IAgentHostManagedSettingsSnapshot>;

	/** Return the provider-owned state file for a session, when one exists. */
	getSessionStateFile?(session: URI): Promise<URI | undefined>;

	/** Add provider-owned diagnostics to an Agent Host debug-log staging directory. */
	collectDebugLogs?(session: URI | undefined, outputDirectory: URI, chat?: URI): Promise<boolean>;

	// ---- MCP and server tools -----------------------------------------------

	/** Optional host wiring for providers that advertise Agent Host server tools. */
	setServerToolHost?(host: IAgentServerToolHost): void;

	/** Optional lifecycle operation for providers exposing controllable MCP servers. */
	startMcpServer?(session: URI, id: string): Promise<void>;

	/** Optional lifecycle operation paired with {@link startMcpServer}. */
	stopMcpServer?(session: URI, id: string): Promise<void>;

	/** Optional `mcp://` router for providers that advertise chat-scoped MCP side-channel resources. */
	handleMcpRequest?(chat: URI, serverName: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown>;

	/** Optional notification stream paired with {@link handleMcpRequest}. */
	readonly onMcpNotification?: Event<IMcpNotification>;

	// ---- Provider lifecycle -------------------------------------------------

	/** Optional lifecycle hook for providers whose resources react to archived state. */
	onArchivedChanged?(session: URI, isArchived: boolean): Promise<void>;

	shutdown(): Promise<void>;

	dispose(): void;
}
