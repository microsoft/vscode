/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorCode } from '../../../base/common/errors.js';
import type { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, IReference } from '../../../base/common/lifecycle.js';
import { NKeyMap } from '../../../base/common/map.js';
import { equals } from '../../../base/common/objects.js';
import { autorun, IObservable, IReader } from '../../../base/common/observable.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostChangesetService } from '../common/agentHostChangesetService.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { AgentHostActiveAgentTitleGenerationConfigKey, AgentHostMarkdownPlanRichLinksEnabledConfigKey, platformRootSchema, type SessionMode } from '../common/agentHostSchema.js';
import { AgentHostClientType } from '../common/agentHostClientInfo.js';
import { AgentHostLaunchKind, createUnknownAgentHostClientTelemetryContext, type IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import { readAgentModelByokIdentifier } from '../common/agentModelByokMeta.js';
import { AgentSession, AgentSignal, IAgent, IAgentChatContext, IAgentToolPendingConfirmationSignal, type IAgentModelCallCompletedSignal } from '../common/agent.js';
import { readToolCallMeta, toToolCallMeta } from '../common/meta/agentToolCallMeta.js';

import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { ISessionDatabase, ISessionDataService } from '../common/sessionDataService.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { resolveChatAttachment } from '../common/state/chatAttachmentContext.js';
import { buildOpenSessionLinkForChatResource } from '../common/openSessionLink.js';
import { SessionInputRequestKind, ToolCallContributorKind, type AgentInfo, type SessionActiveClient, type SessionInputRequest } from '../common/state/protocol/state.js';
import type { CustomizationEnablement } from '../common/state/protocol/channels-session/state.js';
import { ActionType, isChatAction, StateAction, type ChatAction, type ChatToolCallCompleteAction } from '../common/state/sessionActions.js';
import {
	buildSubagentChatUri,
	chatStorageUri,
	getToolFileEdits,
	getInlineToolInput,
	isAhpChatChannel,
	isDefaultChatUri,
	buildDefaultChatUri,
	isSubagentChatUri,
	isChatReadOnly,
	AH_META_IS_ARCHIVED_DB_KEY,
	AH_META_IS_READ_DB_KEY,
	MessageAttachmentKind,
	MessageKind,
	parseChatUri,
	parseRequiredSessionUriFromChatUri,
	PendingMessageKind,
	ResponsePartKind,
	readUsageInfoMeta,
	ROOT_STATE_URI,
	SessionLifecycle,
	SessionStatus,
	CustomizationType,
	ToolCallStatus,
	ToolResultContentType,
	type ErrorInfo,
	type ISessionWithDefaultChat,
	type Message,
	type MessageAttachment,
	type URI as ProtocolURI,
	type SessionState,
	type ToolCallState,
	type ToolCallResult,
	type ToolResultContent,
	type Turn,
	type Customization,
	type McpServerCustomization,
	type PluginCustomization
} from '../common/state/sessionState.js';
import { AgentHostLocalTurns } from './agentHostLocalTurns.js';
import { AgentHostInputRequestTracker } from './agentHostInputRequestTracker.js';
import { AgentHostSessionTitleController } from './agentHostSessionTitleController.js';
import { AgentHostStateManager, resolveChatStateForUri } from './agentHostStateManager.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { createAgentChatContext, getSessionChatsForFanOut } from './agentChatContext.js';
import { AgentHostTelemetryReporter, type AgentHostModelTelemetryKind, type AgentHostTurnFailureStage, type AgentHostTurnResult, type IAgentHostTurnFailure } from './agentHostTelemetryReporter.js';
import { AgentHostToolCallTracker } from './agentHostToolCallTracker.js';
import { updateAgentHostTelemetryLevelFromConfig } from './agentHostTelemetryService.js';
import { AgentHostTurnTracker } from './agentHostTurnTracker.js';
import type { IAgentHostCustomizationEnablementService } from './agentHostCustomizationEnablementService.js';
import { AgentHostLocalCommands } from './localCommands/localChatCommand.js';
import './localCommands/localChatCommands.contribution.js';
import { SessionPermissionManager } from './sessionPermissions.js';
import type { IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import type { ICopilotApiService } from './shared/copilotApiService.js';
import { stripProxyErrorMarker, toChatErrorMeta, tryParseForwardedChatError } from './shared/proxyChatError.js';
import { AGENT_HOST_TITLE_SOURCE_USER, customChatTitleMetadataKey, customChatTitleSourceMetadataKey, persistSessionMetadata, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from './shared/persistSessionMetadata.js';
import { targetForMcpServer, targetForPlugin } from './shared/customizationEnablementGate.js';
import type { WorktreeIsolation } from './shared/worktreeIsolation.js';

/**
 * Options for constructing an {@link AgentSideEffects} instance.
 */
export interface IAgentSideEffectsOptions {
	/** Resolve the agent responsible for a given session URI. */
	readonly getAgent: (session: ProtocolURI) => IAgent | undefined;
	/** Observable set of registered agents. Triggers `root/agentsChanged` when it changes. */
	readonly agents: IObservable<readonly IAgent[]>;
	/** Session data service for cleaning up per-session data on disposal. */
	readonly sessionDataService: ISessionDataService;
	/** Registry that persists host-injected `/rename` and `!command` turns. */
	readonly localTurns: AgentHostLocalTurns;
	/** Get the GitHub token used for Copilot utility title generation. */
	readonly getGitHubCopilotToken?: () => string | undefined;
	/** Get the GitHub repository token used to fetch issue and pull request context. */
	readonly getGitHubToken?: () => string | undefined;
	/** Get the configured GitHub host used to validate issue and pull request URLs. */
	readonly getGitHubHost?: () => string | undefined;
	/** GitHub REST client used to fetch issue and pull request context. */
	readonly octoKitService?: IAgentHostOctoKitService;
	/** CAPI service used for Copilot utility title generation. */
	readonly copilotApiService?: ICopilotApiService;
	/**
	 * Host-owned working-directory resolution hook, awaited before the agent's
	 * first send so the session's working directory (an isolated worktree created
	 * on the first send, or the picked folder) is resolved before the agent
	 * materializes and its cwd is locked. Resolves to the working directories to
	 * hand the agent (index 0 = process root), or `undefined` for workspace-less
	 * sessions. Provided by {@link AgentService}.
	 */
	readonly resolveWorkingDirectoryBeforeSend?: (params: { session: ProtocolURI; chat: ProtocolURI; turnId: string; prompt: string }) => Promise<readonly URI[] | undefined>;
	/** Resolves a referenced chat's turns, hydrating its owning session when needed. */
	readonly resolveChatAttachmentTurns?: (resource: ProtocolURI) => Promise<readonly Turn[]>;
	/**
	 * Called after each top-level session turn completes so git state can be
	 * refreshed and published via `SessionMetaChanged`. Subagent turns are
	 * excluded — only the parent session URI is passed.
	 */
	readonly onTurnComplete: (session: ProtocolURI) => void;
	/** Called for user messages so the host can record referenced GitHub work. */
	readonly onUserMessage?: (session: ProtocolURI, text: string) => void;
	/** Process launcher used when client-origin metadata is unavailable. */
	readonly hostLaunchKind?: AgentHostLaunchKind;
}

interface IQueuedMessageSender {
	readonly clientId: string | undefined;
	readonly clientContext: IAgentHostClientTelemetryContext;
}

/** A signal that was deferred because its subagent session does not exist yet. */
interface IPendingSubagentSignal {
	readonly signal: AgentSignal;
	readonly agent: IAgent;
}

interface ISubagentSessionRef {
	readonly parentChatUri: ProtocolURI;
	readonly toolCallId: string;
	readonly sessionUri: ProtocolURI;
	readonly chatUri: ProtocolURI;
	readonly turnStopWatch: StopWatch;
}

interface ICustomizationEnablementCandidate {
	readonly customization: PluginCustomization | McpServerCustomization;
	readonly owningPluginUri?: string;
}

const MAX_SUPERSEDED_CUSTOMIZATION_PUBLISH_RETRIES = 3;

function getCustomizationEnablementCandidates(customizations: readonly Customization[] | undefined, mcpServerOwners?: ReadonlyMap<string, string>): readonly ICustomizationEnablementCandidate[] {
	const candidates: ICustomizationEnablementCandidate[] = [];
	for (const customization of customizations ?? []) {
		if (customization.type === CustomizationType.Plugin) {
			candidates.push({ customization });
			for (const child of customization.children ?? []) {
				if (child.type === CustomizationType.McpServer) {
					candidates.push({ customization: child, owningPluginUri: customization.uri });
				}
			}
		} else if (customization.type === CustomizationType.McpServer) {
			candidates.push({ customization, owningPluginUri: mcpServerOwners?.get(customization.name) });
		} else if (customization.type === CustomizationType.Directory) {
			for (const child of customization.children ?? []) {
				if (child.type === CustomizationType.McpServer) {
					// Directory containers do not own durable plugin keys. Their
					// MCP children therefore use the unowned `mcpServers#<name>` key.
					candidates.push({ customization: child });
				}
			}
		}
	}
	return candidates;
}

function getSessionMode(mode: unknown): SessionMode | undefined {
	switch (mode) {
		case 'interactive':
		case 'plan':
		case 'autopilot':
			return mode;
		default:
			return undefined;
	}
}

function getConfiguredSessionMode(config: SessionState['config']): SessionMode | undefined {
	const value = config?.values[SessionConfigKey.Mode] ?? config?.schema.properties[SessionConfigKey.Mode]?.default;
	return getSessionMode(value);
}

type AgentSignalTurnIdRouting = 'preserve' | 'remap';

function createMarkdownPlanRichLinksInstruction(chat: ProtocolURI): string {
	const currentChatLink = buildOpenSessionLinkForChatResource(chat);
	return [
		'<rich_plan_markdown>',
		'When creating or editing a Markdown plan document, use these formats when the exact target is known:',
		'- Use canonical HTTPS links for GitHub issues and pull requests.',
		'- Use `commit://<sha>` for commits in the current Git repository.',
		'- Preserve exact `agent-host-session://...` links returned by session and chat tools when referring to sessions, chats, or subagents. Do not construct these links yourself.',
		...(currentChatLink ? [`- Link to the current chat as [Current chat](${currentChatLink}).`] : []),
		'- Use `- [ ] :running: Description` for a task that is actively running, `- [ ]` for a pending task, and `- [x]` for a completed task.',
		'- Keep link labels meaningful so the document remains readable without rich rendering.',
		'</rich_plan_markdown>',
	].join('\n');
}

/**
 * Shared implementation of agent side-effect handling.
 *
 * Routes client-dispatched actions to the correct agent backend,
 * restores sessions from previous lifetimes, handles filesystem
 * operations (browse/fetch/write), tracks pending permission requests,
 * and wires up agent progress events to the state manager.
 *
 * Session create/dispose/list and auth are handled by {@link AgentService}.
 */
export class AgentSideEffects extends Disposable {

	/** Maps tool call IDs to the agent that owns them, for routing confirmations. */
	private readonly _toolCallAgents = new Map<string, string>();
	/** Managed confirmations are human-only and must never seed host-side session permissions. */
	private readonly _managedApprovalToolCalls = new Set<string>();
	private _lastAgentInfos: readonly AgentInfo[] = [];

	private readonly _permissionManager: SessionPermissionManager;

	/** Registry-driven dispatcher for host-handled `/rename` / `!command` etc. */
	private readonly _localCommands: AgentHostLocalCommands;

	private readonly _subagentChats = new NKeyMap<ISubagentSessionRef, [ProtocolURI, string]>();
	private readonly _cancelledTurnIds = new Map<ProtocolURI, Set<string>>();
	/** Serializes refreshes per session so state-based deduplication observes the preceding dispatch. */
	private readonly _pendingSessionCustomizationPublishes = new Map<ProtocolURI, Promise<void>>();
	private readonly _pendingCustomizationEnablementRefreshes = new Set<ProtocolURI>();

	/**
	 * Buffers signals whose `parentToolCallId` references a subagent
	 * whose `subagent_started` signal has not yet been processed. The SDK is
	 * not strict about ordering: an inner `tool_start` can arrive before the
	 * `subagent_started` that creates the child session. Without buffering,
	 * those signals would be dispatched against the parent session and the
	 * UI would render the inner tool calls flat at the top level rather than
	 * grouping them under the subagent. Drained by `_handleSubagentStarted`.
	 *
	 */
	private readonly _pendingSubagentSignals = new NKeyMap<IPendingSubagentSignal[], [ProtocolURI, string]>();
	private readonly _queuedMessageSenders = new NKeyMap<IQueuedMessageSender, [ProtocolURI, string]>();
	private readonly _telemetryReporter: AgentHostTelemetryReporter;
	private readonly _turnTracker: AgentHostTurnTracker;
	private readonly _toolCallTracker: AgentHostToolCallTracker;
	private readonly _inputRequestTracker: AgentHostInputRequestTracker;
	private readonly _titleController: AgentHostSessionTitleController;
	/**
	 * Fires with the provider id whenever a turn starts. Surfaced so
	 * process-lifetime background jobs (notably {@link AgentModelRefreshScheduler})
	 * can gate work on real agent usage.
	 */
	readonly onDidStartTurn: Event<string>;
	/** Host-owned worktree isolation controller; injected post-construction. */
	private _worktree: WorktreeIsolation | undefined;
	constructor(
		private readonly _stateManager: AgentHostStateManager,
		private readonly _customizationEnablementService: IAgentHostCustomizationEnablementService,
		private readonly _options: IAgentSideEffectsOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostChangesetService private readonly _changesets: IAgentHostChangesetService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAgentHostCheckpointService private readonly _checkpointService: IAgentHostCheckpointService,
		@IAgentConfigurationService private readonly _agentConfigService: IAgentConfigurationService,
	) {
		super();
		this._telemetryReporter = new AgentHostTelemetryReporter(this._telemetryService);
		this._turnTracker = this._register(new AgentHostTurnTracker(this._telemetryReporter));
		this.onDidStartTurn = this._turnTracker.onDidStartTurn;
		this._toolCallTracker = this._register(new AgentHostToolCallTracker(this._telemetryReporter, (session, turnId) => this._turnTracker.getClientTelemetryContext(session, turnId)));
		this._inputRequestTracker = new AgentHostInputRequestTracker(this._telemetryReporter, undefined, (session, turnId) => this._turnTracker.getClientTelemetryContext(session, turnId));
		this._permissionManager = this._register(instantiationService.createInstance(SessionPermissionManager, this._stateManager, {}));
		this._titleController = this._register(instantiationService.createInstance(AgentHostSessionTitleController, this._stateManager, {
			sessionDataService: this._options.sessionDataService,
			getGitHubCopilotToken: this._options.getGitHubCopilotToken,
			getGitHubToken: this._options.getGitHubToken,
			getGitHubHost: this._options.getGitHubHost,
			octoKitService: this._options.octoKitService,
			copilotApiService: this._options.copilotApiService,
			isActiveAgentTitleGenerationEnabled: () => this._agentConfigService.getRootValue(platformRootSchema, AgentHostActiveAgentTitleGenerationConfigKey) === true,
		}));
		this._localCommands = this._register(instantiationService.createInstance(
			AgentHostLocalCommands,
			this._stateManager,
			this._options.localTurns,
			// Draining the queue re-enters agent lookup / telemetry / sendMessage,
			// which is this class's responsibility, so the dispatcher hands the
			// turn back here once it has completed a host-handled command.
			(turnChannel: ProtocolURI) => this._tryConsumeNextQueuedMessage(turnChannel),
			(session: ProtocolURI, chat?: ProtocolURI) => this._titleController.markTitleRenamed(session, chat),
		));
		this._register(this._stateManager.onDidChangeSessionConfig(e => {
			const previousMode = getConfiguredSessionMode(e.previous);
			const currentMode = getConfiguredSessionMode(e.current);
			if (!previousMode || !currentMode || previousMode === currentMode) {
				return;
			}

			const agent = this._options.getAgent(e.session);
			const sessionState = this._stateManager.getSessionState(e.session);
			if (!agent || !sessionState) {
				return;
			}

			this._telemetryReporter.executionModeChanged(agent.id, e.session, previousMode, currentMode, sessionState.turns.length, e.clientContext);
		}));
		this._register(this._customizationEnablementService.onDidChange(event => {
			for (const session of event.sessions) {
				const agent = this._options.getAgent(session);
				if (agent === undefined) {
					this._pendingCustomizationEnablementRefreshes.add(session);
				} else if (this._stateManager.getSessionState(session)?.customizations !== undefined) {
					this._publishSessionCustomizationsSoon(agent, session);
				}
			}
		}));

		// Whenever the agents observable changes, publish to root state.
		this._register(autorun(reader => {
			const agents = this._options.agents.read(reader);
			this._publishAgentInfos(agents, reader);
			this._publishPendingCustomizationEnablementRefreshes();
		}));

		// Observe envelopes for side effects that must include server-dispatched
		// actions, which bypass handleAction.
		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			const action = envelope.action;
			if (action.type === ActionType.SessionCustomizationToggled) {
				const sessionState = this._stateManager.getSessionState(envelope.channel);
				const mcpServerOwners = this._options.getAgent(envelope.channel)?.getMcpServerOwners?.(URI.parse(envelope.channel));
				const customization = getCustomizationEnablementCandidates(sessionState?.customizations, mcpServerOwners)
					.find(candidate => candidate.customization.id === action.id);
				if (customization === undefined) {
					// Toggle actions target entries from the immediately preceding
					// session snapshot. A removed entry cannot be re-enabled, so
					// this stale action is harmless but should remain diagnosable.
					this._logService.warn(`[AgentSideEffects] Ignoring customization toggle for missing ${action.id} in ${envelope.channel}`);
				} else {
					this._recordCustomizationEnablement(envelope.channel, customization, action.enablement);
				}
			}
			if (isAhpChatChannel(envelope.channel) && isChatAction(envelope.action)) {
				const chatState = this._stateManager.getChatState(envelope.channel);
				const action = envelope.action;
				switch (action.type) {
					case ActionType.ChatInputRequested: {
						const turnId = chatState?.activeTurn?.id;
						const provider = this._options.getAgent(parseRequiredSessionUriFromChatUri(envelope.channel))?.id;
						if (turnId && provider) {
							this._inputRequestTracker.inputRequested(provider, envelope.channel, turnId, action.request);
						}
						break;
					}
					case ActionType.ChatInputCompleted:
						this._inputRequestTracker.inputCompleted(envelope.channel, action, chatState);
						break;
					case ActionType.ChatTurnComplete:
					case ActionType.ChatTurnCancelled:
					case ActionType.ChatError:
						this._inputRequestTracker.clearTurn(envelope.channel, action.turnId);
						break;
					case ActionType.ChatTruncated:
						this._inputRequestTracker.clearChat(envelope.channel);
						break;
				}
				if (envelope.action.type === ActionType.ChatTurnCancelled) {
					let turnIds = this._cancelledTurnIds.get(envelope.channel);
					if (!turnIds) {
						turnIds = new Set();
						this._cancelledTurnIds.set(envelope.channel, turnIds);
					}
					turnIds.add(envelope.action.turnId);
					void this._checkpointService.discardTurnStartCheckpoint(URI.parse(parseRequiredSessionUriFromChatUri(envelope.channel)), URI.parse(envelope.channel), envelope.action.turnId).catch(() => undefined);
				}
				this._syncSessionInputNeededForChatAction(envelope.channel, envelope.action);
				this._trackTurnUsage(envelope.channel, envelope.action);
			}
			if (!envelope.origin && envelope.action.type === ActionType.ChatToolCallComplete) {
				const action = envelope.action;
				// Chat-action envelopes are emitted on the chat channel URI;
				// agents are keyed by session URI, so resolve back to the
				// owning session before notifying the agent. Pass the chat URI
				// alongside so agents that track peer chats can route correctly.
				if (!isAhpChatChannel(envelope.channel)) {
					return; // Not a chat channel; ignore (already logged elsewhere).
				}
				const sessionChannel = parseRequiredSessionUriFromChatUri(envelope.channel);
				this._notifyClientToolCallComplete(sessionChannel, envelope.channel, action.toolCallId, action.result, 'server-envelope');
			}
			if (envelope.action.type === ActionType.ChatDraftChanged) {
				this._persistChatDraft(envelope.channel, envelope.action.draft);
			}
			// A chat joining the catalog changes the session's authoritative
			// membership, so every already-contributing client is re-fanned-out
			// over the new set. Handled here (not `handleAction`) because every
			// chat-membership path (createChat, spawned/restored subagent)
			// funnels through this server-dispatched action.
			if (envelope.action.type === ActionType.SessionChatAdded) {
				for (const activeClient of this._stateManager.getSessionState(envelope.channel)?.activeClients ?? []) {
					this._fanOutActiveClient(envelope.channel, activeClient);
				}
			}
			if (envelope.action.type === ActionType.SessionConfigChanged) {
				const values = this._stateManager.getSessionState(envelope.channel)?.config?.values;
				if (values) {
					this._persistSessionFlag(envelope.channel, 'configValues', JSON.stringify(values));
				}
			}
			// Persisting here rather than in `handleAction` covers client- and
			// server-dispatched changes alike, so no dispatch path can skip it.
			// Rejected actions never reached state and must not be written.
			if (!envelope.rejectionReason) {
				if (envelope.action.type === ActionType.SessionIsReadChanged) {
					this._persistSessionFlag(envelope.channel, AH_META_IS_READ_DB_KEY, envelope.action.isRead ? 'true' : '');
				} else if (envelope.action.type === ActionType.SessionIsArchivedChanged) {
					this._persistSessionFlag(envelope.channel, AH_META_IS_ARCHIVED_DB_KEY, envelope.action.isArchived ? 'true' : '');
				}
			}
		}));
	}

	private _chatContext(session: ProtocolURI, chat: ProtocolURI): IAgentChatContext {
		return createAgentChatContext(this._stateManager, session, chat);
	}

	/**
	 * The owning session's last host-published customization snapshot,
	 * including user enablement toggles. `undefined` means the host has not
	 * published a snapshot yet — distinct from an empty list, since the
	 * provider must reconcile against its own state rather than treat "no
	 * snapshot" as "no customizations".
	 */
	private _hostCustomizations(session: ProtocolURI): readonly Customization[] | undefined {
		return this._stateManager.getSessionState(session)?.customizations;
	}

	/** Hands a client's contribution to each exact chat Agent Host owns. */
	private _fanOutActiveClient(session: ProtocolURI, activeClient: SessionActiveClient): void {
		const agent = this._options.getAgent(session);
		if (!agent) {
			return;
		}
		const chats = getSessionChatsForFanOut(this._stateManager, session);
		if (!chats) {
			this._logService.warn(`[AgentSideEffects] Skipping active-client fan-out for session without host state: session=${session}, clientId=${activeClient.clientId}`);
			return;
		}
		const hostCustomizations = this._hostCustomizations(session);
		for (const chat of chats) {
			const handle = agent.getOrCreateActiveClient(chat, this._chatContext(session, chat.toString()), {
				clientId: activeClient.clientId,
				displayName: activeClient.displayName,
			}, hostCustomizations);
			handle.tools = activeClient.tools;
			handle.customizations = activeClient.customizations ?? [];
		}
	}

	/**
	 * Publishes agent descriptors using the last known model lists.
	 */
	private _publishAgentInfos(agents: readonly IAgent[], reader?: IReader): void {
		const infos: AgentInfo[] = agents.map(a => {
			const d = a.getDescriptor();
			const protectedResources = a.getProtectedResources();
			const models = reader ? a.models.read(reader) : a.models.get();
			const customizations = a.getCustomizations?.();
			return {
				provider: d.provider, displayName: d.displayName, description: d.description, models: models.map(m => ({
					id: m.id,
					provider: m.provider,
					name: m.name,
					maxContextWindow: m.maxContextWindow,
					maxOutputTokens: m.maxOutputTokens,
					maxPromptTokens: m.maxPromptTokens,
					supportsVision: m.supportsVision,
					policyState: m.policyState,
					configSchema: m.configSchema,
					_meta: m._meta,
				})),
				customizations: customizations?.length ? [...customizations] : undefined,
				protectedResources: protectedResources.length > 0 ? protectedResources : undefined,
				capabilities: d.capabilities ? { ...d.capabilities } : undefined,
			};
		});
		if (equals(this._lastAgentInfos, infos)) {
			return;
		}
		this._lastAgentInfos = infos;
		this._stateManager.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootAgentsChanged, agents: infos });
	}

	private async _publishSessionCustomizations(agent: IAgent, session: ProtocolURI, supersededRetries: number): Promise<void> {
		const currentBeforeFetch = this._stateManager.getSessionState(session)?.customizations;
		const chat = URI.parse(this._stateManager.getSessionState(session)?.defaultChat ?? buildDefaultChatUri(session));
		const customizations = await agent.getChatCustomizations(chat, this._chatContext(session, chat.toString()), currentBeforeFetch);

		// Skip the dispatch when the resolved customizations match what the
		// session state already holds. A single edit under a shared `~/.claude`
		// tree fans out to every open session (and, via the agent-level
		// `onDidCustomizationsChange`, is republished once per session), so
		// without this guard a single change emitted O(N^2) identical
		// `SessionCustomizationsChanged` envelopes. Comparing against the
		// authoritative session state (rather than a side cache) keeps this
		// correct across idle-eviction + restore: a restored session's state
		// starts without customizations, so the first successful refresh always
		// dispatches even if the resolved set matches the prior incarnation.
		// It also needs no cleanup on session teardown. `undefined` (never
		// published) never equals a resolved array, so the initial publish
		// always goes through.
		const current = this._stateManager.getSessionState(session)?.customizations;
		// Agent progress received during the fetch is newer than this snapshot.
		if (current !== currentBeforeFetch) {
			if (supersededRetries < MAX_SUPERSEDED_CUSTOMIZATION_PUBLISH_RETRIES) {
				this._publishSessionCustomizationsSoon(agent, session, supersededRetries + 1);
			}
			return;
		}
		if (current && equals(current, customizations)) {
			return;
		}

		this._stateManager.dispatchServerAction(session, {
			type: ActionType.SessionCustomizationsChanged,
			customizations: [...customizations],
		});
	}

	private _publishSessionCustomizationsSoon(agent: IAgent, session: ProtocolURI, supersededRetries = 0): void {
		const previous = this._pendingSessionCustomizationPublishes.get(session) ?? Promise.resolve();
		const publish = previous.then(() => this._publishSessionCustomizations(agent, session, supersededRetries)).catch(err => {
			this._logService.error('[AgentSideEffects] getChatCustomizations failed', err);
		});
		this._pendingSessionCustomizationPublishes.set(session, publish);
		void publish.finally(() => {
			if (this._pendingSessionCustomizationPublishes.get(session) === publish) {
				this._pendingSessionCustomizationPublishes.delete(session);
			}
		});
	}

	private _publishPendingCustomizationEnablementRefreshes(): void {
		for (const session of this._pendingCustomizationEnablementRefreshes) {
			const agent = this._options.getAgent(session);
			if (agent === undefined) {
				continue;
			}
			this._pendingCustomizationEnablementRefreshes.delete(session);
			this._publishSessionCustomizationsSoon(agent, session);
		}
	}

	private _publishSessionCustomizationsForAgent(agent: IAgent): void {
		for (const session of this._stateManager.getSessionUris()) {
			if (this._options.getAgent(session) === agent) {
				this._publishSessionCustomizationsSoon(agent, session);
			}
		}
	}

	private _publishAllSessionCustomizations(): void {
		for (const session of this._stateManager.getSessionUris()) {
			const agent = this._options.getAgent(session);
			if (agent) {
				this._publishSessionCustomizationsSoon(agent, session);
			}
		}
	}

	// ---- Session input-needed aggregation ----------------------------------
	//
	// Mirrors per-chat blockers (user-input elicitations, tool confirmations,
	// client-tool executions, and MCP authentication) into the owning session's
	// `inputNeeded` list so clients subscribed only to the session channel can
	// discover and answer them without subscribing to each chat. This handler
	// only produces the state; it does not consume it.

	private _syncSessionInputNeededForChatAction(chatUri: ProtocolURI, action: ChatAction): void {
		switch (action.type) {
			case ActionType.ChatInputRequested:
				this._syncChatInputNeeded(chatUri, action.request.id);
				break;
			case ActionType.ChatInputAnswerChanged:
				this._syncChatInputNeeded(chatUri, action.requestId);
				break;
			case ActionType.ChatInputCompleted:
				this._removeSessionInputNeeded(chatUri, this._chatInputNeededId(chatUri, action.requestId));
				break;
			case ActionType.ChatToolCallStart:
			case ActionType.ChatToolCallReady:
			case ActionType.ChatToolCallConfirmed:
			case ActionType.ChatToolCallComplete:
			case ActionType.ChatToolCallResultConfirmed:
			case ActionType.ChatToolCallAuthRequired:
			case ActionType.ChatToolCallAuthResolved:
				this._syncToolInputNeeded(chatUri, action.turnId, action.toolCallId);
				break;
			case ActionType.ChatTurnComplete:
			case ActionType.ChatTurnCancelled:
			case ActionType.ChatError:
			case ActionType.ChatTruncated:
				this._removeSessionInputNeededForChat(chatUri);
				break;
		}
	}

	private _syncChatInputNeeded(chatUri: ProtocolURI, requestId: string): void {
		const state = this._stateManager.getSessionState(chatUri);
		const part = state?.activeTurn?.responseParts.find(part =>
			part.kind === ResponsePartKind.InputRequest
			&& part.response === undefined
			&& part.request.id === requestId
		);
		const id = this._chatInputNeededId(chatUri, requestId);
		if (!part || part.kind !== ResponsePartKind.InputRequest) {
			this._removeSessionInputNeeded(chatUri, id);
			return;
		}
		this._setSessionInputNeeded(chatUri, {
			id,
			kind: SessionInputRequestKind.ChatInput,
			chat: chatUri,
			request: part.request,
		});
	}

	private _syncToolInputNeeded(chatUri: ProtocolURI, turnId: string, toolCallId: string): void {
		const confirmationId = this._toolConfirmationNeededId(chatUri, turnId, toolCallId);
		const clientExecutionId = this._toolClientExecutionNeededId(chatUri, turnId, toolCallId);
		const authenticationId = this._toolAuthenticationNeededId(chatUri, turnId, toolCallId);
		const toolCall = this._findToolCall(chatUri, turnId, toolCallId);

		// A parameter gate auto-approved by the session's bypass setting never
		// blocks on the user, so keep it out of the session `inputNeeded` queue
		// (which would flash "input needed" in the sessions list).
		// `autoApproveBySetting` covers only the parameter gate; a
		// `PendingResultConfirmation` is a genuine prompt and is still surfaced.
		const autoApproved = !!toolCall && readToolCallMeta(toolCall).autoApproveBySetting === true;

		const suppressAutoApprovedConfirmation = autoApproved && toolCall?.status === ToolCallStatus.PendingConfirmation;
		const needsConfirmation = !suppressAutoApprovedConfirmation && (toolCall?.status === ToolCallStatus.PendingConfirmation || toolCall?.status === ToolCallStatus.PendingResultConfirmation);
		if (needsConfirmation && toolCall) {
			this._setSessionInputNeeded(chatUri, {
				id: confirmationId,
				kind: SessionInputRequestKind.ToolConfirmation,
				chat: chatUri,
				turnId,
				toolCall,
			});
		} else {
			this._removeSessionInputNeeded(chatUri, confirmationId);
		}

		const contributor = toolCall?.contributor;
		if (toolCall?.status === ToolCallStatus.Running && contributor?.kind === ToolCallContributorKind.Client) {
			this._setSessionInputNeeded(chatUri, {
				id: clientExecutionId,
				kind: SessionInputRequestKind.ToolClientExecution,
				chat: chatUri,
				turnId,
				clientId: contributor.clientId,
				toolCall,
			});
		} else {
			this._removeSessionInputNeeded(chatUri, clientExecutionId);
		}

		if (toolCall?.status === ToolCallStatus.AuthRequired) {
			this._setSessionInputNeeded(chatUri, {
				id: authenticationId,
				kind: SessionInputRequestKind.ToolAuthentication,
				chat: chatUri,
				turnId,
				toolCall,
			});
		} else {
			this._removeSessionInputNeeded(chatUri, authenticationId);
		}
	}

	private _findToolCall(chatUri: ProtocolURI, turnId: string, toolCallId: string): ToolCallState | undefined {
		const state = this._stateManager.getSessionState(chatUri);
		const turn = state?.activeTurn?.id === turnId ? state.activeTurn : state?.turns.find(t => t.id === turnId);
		const part = turn?.responseParts.find(p => p.kind === ResponsePartKind.ToolCall && p.toolCall.toolCallId === toolCallId);
		return part?.kind === ResponsePartKind.ToolCall ? part.toolCall : undefined;
	}

	private _setSessionInputNeeded(chatUri: ProtocolURI, request: SessionInputRequest): void {
		const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
		const existing = this._stateManager.getSessionState(sessionUri)?.inputNeeded?.find(r => r.id === request.id);
		if (existing && equals(existing, request)) {
			return;
		}
		this._stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionInputNeededSet, request });
		// Record the blocker on the turn so a hang reported while the request is
		// outstanding is tagged as an expected wait on the user rather than as
		// an unexplained stall, and so the report can name the tool it gates. A
		// `ChatInput` elicitation carries neither `turnId` nor a tool call, so
		// fall back to the chat's active turn.
		const blockedTurnId = hasKey(request, { turnId: true }) ? request.turnId : this._stateManager.getActiveTurnId(chatUri);
		if (blockedTurnId) {
			const blockedToolCallId = hasKey(request, { toolCall: true }) ? request.toolCall.toolCallId : undefined;
			this._turnTracker.turnBlocked(chatUri, blockedTurnId, request.id, request.kind, blockedToolCallId);
		}
		if (request.kind !== SessionInputRequestKind.ChatInput) {
			const agent = this._options.getAgent(sessionUri);
			if (agent) {
				this._toolCallTracker.toolCallBlocked(agent.id, chatUri, request);
			}
		}
	}

	private _removeSessionInputNeeded(chatUri: ProtocolURI, id: string): void {
		const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
		this._toolCallTracker.toolCallUnblocked(chatUri, id);
		this._turnTracker.turnUnblocked(chatUri, id);
		if (!this._stateManager.getSessionState(sessionUri)?.inputNeeded?.some(r => r.id === id)) {
			return;
		}
		this._stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionInputNeededRemoved, id });
	}

	private _removeSessionInputNeededForChat(chatUri: ProtocolURI): void {
		const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
		for (const request of this._stateManager.getSessionState(sessionUri)?.inputNeeded ?? []) {
			if (request.chat === chatUri) {
				this._removeSessionInputNeeded(chatUri, request.id);
			}
		}
	}

	private _chatInputNeededId(chatUri: ProtocolURI, requestId: string): string {
		return `chatInput:${chatUri}:${requestId}`;
	}

	private _toolConfirmationNeededId(chatUri: ProtocolURI, turnId: string, toolCallId: string): string {
		return `toolConfirmation:${chatUri}:${turnId}:${toolCallId}`;
	}

	private _toolClientExecutionNeededId(chatUri: ProtocolURI, turnId: string, toolCallId: string): string {
		return `toolClientExecution:${chatUri}:${turnId}:${toolCallId}`;
	}

	private _toolAuthenticationNeededId(chatUri: ProtocolURI, turnId: string, toolCallId: string): string {
		return `toolAuthentication:${chatUri}:${turnId}:${toolCallId}`;
	}

	// ---- Initialization ----------------------------------------------------

	/**
	 * Initializes async resources (tree-sitter WASM) used for command
	 * auto-approval. Await this before any session events can arrive to
	 * guarantee that auto-approval checks are fully synchronous.
	 */
	initialize(): Promise<void> {
		return this._permissionManager.initialize();
	}

	// ---- Agent registration -------------------------------------------------

	/**
	 * Registers a progress-signal listener on the given agent so that
	 * {@link AgentSignal}s are routed/dispatched through the state manager.
	 * Returns a disposable that removes the listener.
	 */
	registerProgressListener(agent: IAgent): IDisposable {
		const disposables = new DisposableStore();
		disposables.add(agent.onDidChatProgress(signal => {
			this._handleAgentSignal(agent, signal);
		}));
		if (agent.onDidCustomizationsChange) {
			disposables.add(agent.onDidCustomizationsChange(() => {
				this._publishAgentInfos(this._options.agents.get());
				this._publishSessionCustomizationsForAgent(agent);
			}));
		}
		if (agent.authenticationRequired) {
			disposables.add(autorun(reader => {
				const requirement = agent.authenticationRequired?.read(reader);
				if (requirement) {
					this._stateManager.emitAuthRequired(requirement);
				}
			}));
		}
		return disposables;
	}

	/**
	 * Routes a single signal from `agent` to the correct session.
	 *
	 * Action signals with a `parentToolCallId` are routed to the matching
	 * subagent session. If the subagent session does not exist yet (the SDK
	 * can emit an inner `tool_start` before its `subagent_started`), the
	 * signal is buffered in {@link _pendingSubagentSignals} and replayed
	 * once the `subagent_started` arrives.
	 */
	private _handleAgentSignal(agent: IAgent, signal: AgentSignal): void {
		if (signal.kind === 'subagent_started') {
			this._handleSubagentStarted(signal.chat.toString(), signal.toolCallId, signal.agentName, signal.agentDisplayName, signal.agentDescription, signal.taskPrompt, signal.parentToolCallId);
			this._drainPendingSubagentSignals(signal.chat.toString(), signal.toolCallId);
			return;
		}

		if (signal.kind === 'subagent_resumed') {
			this._resumeSubagentSession(signal.chat.toString(), signal.toolCallId, signal.message);
			return;
		}

		if (signal.kind === 'subagent_completed') {
			this.completeSubagentSession(signal.chat.toString(), signal.toolCallId);
			return;
		}

		if (signal.kind === 'steering_consumed') {
			this._stateManager.dispatchServerAction(signal.chat.toString(), {
				type: ActionType.ChatPendingMessageRemoved,
				kind: PendingMessageKind.Steering,
				id: signal.id,
			});
			return;
		}
		const signalResource = signal.kind === 'action' || signal.kind === 'model_call_completed' ? signal.resource.toString() : signal.chat.toString();
		if (signal.kind === 'action' && !isChatAction(signal.action) && isAhpChatChannel(signalResource)) {
			throw new Error(`Session action ${signal.action.type} must not be dispatched on chat channel ${signalResource}`);
		}
		const sessionKey = signalResource;

		// Route signals with parentToolCallId to the subagent session.
		// Both action signals and pending_confirmation signals can carry
		// a parentToolCallId — for client tools inside a subagent the
		// permission flow fires `pending_confirmation` for an inner tool
		// call, and that signal must be routed to the subagent session
		// (otherwise the resulting ChatToolCallReady would land on the
		// parent session, which has no matching ChatToolCallStart).
		const parentToolCallId = signal.parentToolCallId;
		if (parentToolCallId) {
			const subagentSession = this._subagentChats.get(sessionKey, parentToolCallId);
			if (subagentSession) {
				const subTurnId = this._stateManager.getActiveTurnId(subagentSession.chatUri);
				if (subTurnId) {
					if (signal.kind === 'model_call_completed') {
						this._recordModelCallCompleted(signal, subagentSession.chatUri, subTurnId, 'remap');
					} else {
						this._dispatchActionForSession(signal, subagentSession.chatUri, subTurnId, 'remap', agent);
					}
				} else {
					this._logService.error(`[AgentSideEffects] Dropping ${this._describeSignal(signal)} for inactive subagent ${sessionKey}/${parentToolCallId}`);
					if (signal.kind === 'pending_confirmation') {
						agent.respondToPermissionRequest(signal.state.toolCallId, false);
					}
				}
				return;
			}

			const pendingSignals = this._pendingSubagentSignals.get(sessionKey, parentToolCallId);
			if (signal.kind === 'pending_confirmation' && !pendingSignals) {
				this._logService.error(`[AgentSideEffects] Denying permission for unroutable subagent ${sessionKey}/${parentToolCallId}: toolCallId=${signal.state.toolCallId}`);
				agent.respondToPermissionRequest(signal.state.toolCallId, false);
				return;
			}

			// Subagent session does not exist yet — buffer the signal so we can
			// replay it after `subagent_started` arrives.
			this._logService.trace(`[AgentSideEffects] Buffering ${this._describeSignal(signal)} for pending subagent ${sessionKey}/${parentToolCallId}`);
			let buffer = pendingSignals;
			if (!buffer) {
				buffer = [];
				this._pendingSubagentSignals.set(buffer, sessionKey, parentToolCallId);
			}
			buffer.push({ signal, agent });
			return;
		}

		// Route pending_confirmation signals for tools inside subagent sessions
		// (legacy path for signals without an explicit parentToolCallId — the
		// tool was previously registered under its subagent session key in
		// _toolCallAgents).
		if (signal.kind === 'pending_confirmation') {
			const subagentChatUri = this._findSubagentChatForToolCall(sessionKey, signal.state.toolCallId);
			if (subagentChatUri) {
				const subTurnId = this._stateManager.getActiveTurnId(subagentChatUri) ?? '';
				void this._handleToolReady(signal, subagentChatUri, subTurnId, agent).catch(err => {
					this._logService.error('[AgentSideEffects] _handleToolReady failed', err);
				});
				return;
			}
		}

		const turnId = this._stateManager.getActiveTurnId(sessionKey);
		if (turnId) {
			if (signal.kind === 'model_call_completed') {
				this._recordModelCallCompleted(signal, sessionKey, turnId, 'preserve');
			} else {
				this._dispatchActionForSession(signal, sessionKey, turnId, 'preserve', agent);
			}
			return;
		}

		// No active turn on the session. Non-action signals are silently
		// dropped, but action signals can still target session-level state
		// such as customizations, title, or configuration. A turnComplete
		// action also drives post-turn side effects even when the matching
		// turnStarted was not observed by this side-effects instance.
		//
		// pending_confirmation signals must also be handled here: when a
		// hook-triggered continuation runs after the protocol turn has
		// already completed, tool actions are dispatched (below) with an
		// empty turnId. Without this, the pending_confirmation is silently
		// dropped, the permission deferred never resolves, and the session
		// hangs indefinitely.
		if (signal.kind === 'pending_confirmation') {
			void this._handleToolReady(signal, sessionKey, '', agent).catch(err => {
				this._logService.error('[AgentSideEffects] _handleToolReady failed', err);
			});
			return;
		}
		if (signal.kind === 'action') {
			const action = signal.action;
			if (action.type === ActionType.ChatTurnComplete && this._cancelledTurnIds.get(sessionKey)?.has(action.turnId)) {
				this._logService.trace(`[AgentSideEffects] Dropping completion for cancelled turn ${action.turnId} on ${sessionKey}`);
				return;
			}
			this._stateManager.dispatchServerAction(sessionKey, action);
			if (action.type === ActionType.ChatTurnComplete) {
				this._runTurnCompleteSideEffects(sessionKey, undefined);
			}
		}
	}

	/**
	 * Dispatches a signal to a resolved chat, preserving top-level turn identity or remapping cross-channel subagent actions.
	 */
	private _dispatchActionForSession(signal: AgentSignal, sessionKey: ProtocolURI, turnId: string, turnIdRouting: AgentSignalTurnIdRouting, agent?: IAgent): void {
		if (signal.kind === 'pending_confirmation') {
			if (agent) {
				void this._handleToolReady(signal, sessionKey, turnId, agent).catch(err => {
					this._logService.error('[AgentSideEffects] _handleToolReady failed', err);
				});
			}
			return;
		}
		if (signal.kind !== 'action') {
			return;
		}
		let action = signal.action;
		if (action.type !== ActionType.ChatTruncated && hasKey(action, { turnId: true }) && action.turnId !== turnId) {
			if (turnIdRouting === 'remap') {
				action = { ...action, turnId };
			} else {
				this._logService.trace(`[AgentSideEffects] Dropping stale ${action.type} for ${sessionKey}: producerTurnId=${action.turnId}, activeTurnId=${turnId}`);
				return;
			}
		}

		if (action.type === ActionType.ChatToolCallStart && agent) {
			this._toolCallAgents.set(`${sessionKey}:${action.toolCallId}`, agent.id);
			const modelContext = this._turnTracker.getModelTelemetryContext(sessionKey, action.turnId);
			// Stamp the tool call start for `languageModelToolInvoked` telemetry.
			// Ready may refine the contributor once the complete tool metadata is
			// available, so the tracker updates the source kind below when needed.
			this._toolCallTracker.toolCallStarted(agent.id, sessionKey, action.turnId, action.toolCallId, action.toolName, action.contributor, modelContext?.model, modelContext?.modelTelemetryKind);
		} else if (action.type === ActionType.ChatToolCallReady) {
			this._toolCallTracker.toolCallMetadataUpdated(sessionKey, action.toolCallId, action.contributor);
			if (action.confirmed) {
				this._toolCallTracker.toolCallExecutionStarted(sessionKey, action.toolCallId);
			}
		}
		if (action.type === ActionType.ChatUsage) {
			// Subagent charges are already folded into the parent turn's aggregate.
			if (!isSubagentChatUri(sessionKey)) {
				this._turnTracker.updateBilledNanoAiu(sessionKey, action.turnId, readUsageInfoMeta(action.usage).copilotUsage?.totalNanoAiu);
			}
			if (action.usage.model && agent) {
				const modelContext = this._getModelTelemetryContext(agent, action.usage.model);
				this._turnTracker.updateModel(sessionKey, action.turnId, modelContext.model, modelContext.modelTelemetryKind);
				this._toolCallTracker.updateTurnModel(sessionKey, action.turnId, modelContext.model, modelContext.modelTelemetryKind);
			}
		}

		const sessionUri = isAhpChatChannel(sessionKey) ? parseRequiredSessionUriFromChatUri(sessionKey) : sessionKey;

		// Stamp the subagent chat URI onto the tool call as soon as toolKind
		// is known, so clients get it from the wire instead of deriving it.
		if (
			(action.type === ActionType.ChatToolCallStart || action.type === ActionType.ChatToolCallDelta || action.type === ActionType.ChatToolCallReady)
			&& readToolCallMeta(action).toolKind === 'subagent'
			&& readToolCallMeta(action).subagentChatUri === undefined
		) {
			action = { ...action, _meta: { ...action._meta, subagentChatUri: buildSubagentChatUri(sessionUri, action.toolCallId) } };
		}

		// When a parent tool call has an associated subagent session,
		// preserve the subagent content metadata in the completion result.
		// The SDK's tool_complete provides its own content which would
		// overwrite the ToolResultSubagentContent that was set via
		// ChatToolCallContentChanged while running.
		if (action.type === ActionType.ChatToolCallComplete) {
			const subagent = this._subagentChats.get(sessionKey, action.toolCallId);
			if (subagent) {
				const parentState = this._stateManager.getSessionState(sessionKey);
				const runningContent = this._getRunningToolCallContent(parentState, turnId, action.toolCallId);
				const subagentEntry = runningContent.find(c => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
				if (subagentEntry) {
					const mergedContent = [...(action.result.content ?? []), subagentEntry];
					const merged: ChatToolCallCompleteAction = { ...action, result: { ...action.result, content: mergedContent } };
					action = merged;
				}

			}
		}

		this._stateManager.dispatchServerAction(sessionKey, action);

		// Any turn-scoped action counts as activity for the hang watchdog: it is
		// proof the agent loop is still alive, even when the action produces
		// nothing visible. Session-scoped actions (title, customizations, MCP
		// state, …) are deliberately excluded — they can arrive while a turn is
		// genuinely stuck and would otherwise mask the hang.
		if (hasKey(action, { turnId: true })) {
			this._turnTracker.markActivity(sessionKey, turnId, action.type);
		}

		// Mark first visible progress for TTFT telemetry
		if (action.type === ActionType.ChatDelta
			|| action.type === ActionType.ChatResponsePart
			|| action.type === ActionType.ChatToolCallStart
			|| action.type === ActionType.ChatReasoning) {
			this._turnTracker.markFirstProgress(sessionKey, turnId);
		}

		if (action.type === ActionType.ChatToolCallStart) {
			this._turnTracker.toolCallStarted(sessionKey, turnId, action.toolCallId, action.toolName, action.contributor);
		} else if (action.type === ActionType.ChatToolCallReady) {
			this._turnTracker.toolCallMetadataUpdated(sessionKey, turnId, action.toolCallId, action.contributor);
		}

		// A denied confirmation is a terminal transition to `cancelled`: the
		// reducer ignores any later completion for the call, so drop it from
		// the turn's in-flight set here or a subsequent hang would be reported
		// as `runningTool` for a tool that will never run. Denials reach the
		// host on this path as well as via `handleAction`.
		if (action.type === ActionType.ChatToolCallConfirmed && !action.approved) {
			this._turnTracker.toolCallEnded(sessionKey, turnId, action.toolCallId);
		}

		if (action.type === ActionType.ChatToolCallComplete) {
			this._turnTracker.toolCallEnded(sessionKey, turnId, action.toolCallId);

			// Emit `languageModelToolInvoked` telemetry for the completed tool
			// call. `action.result` carries `success`/`error.code` even after the
			// subagent-content merge above (which only touches `result.content`).
			this._toolCallTracker.toolCallCompleted(sessionKey, action.toolCallId, action.result);

			// Drop any events that were buffered for a subagent whose
			// `subagent_started` never arrived (e.g. the parent tool failed
			// before the subagent was created). A registered child chat remains
			// available across completed turns so it can be steered again.
			this._pendingSubagentSignals.delete(sessionKey, action.toolCallId);
			if (getToolFileEdits(action.result).length > 0) {
				this._changesets.onToolCallEditsApplied(sessionUri, turnId, this._turnTracker.getClientTelemetryContext(sessionKey, turnId));
			}
		}

		if (action.type === ActionType.ChatTurnComplete) {
			const clientContext = this._turnTracker.getClientTelemetryContext(sessionKey, turnId);
			this._completeTurn(sessionKey, turnId, 'success');
			this._toolCallTracker.clearSession(sessionKey);
			this._runTurnCompleteSideEffects(sessionKey, turnId, clientContext);
		}

		if (action.type === ActionType.ChatTurnCancelled) {
			this._completeTurn(sessionKey, turnId, 'cancelled');
			this._toolCallTracker.clearSession(sessionKey);
			this._markSessionUnread(sessionUri);
		}

		if (action.type === ActionType.ChatError) {
			const clientContext = this._turnTracker.getClientTelemetryContext(sessionKey, turnId);
			this._completeTurn(sessionKey, turnId, 'error', { stage: 'provider', error: action.error });
			this._toolCallTracker.clearSession(sessionKey);
			this._captureTurnCheckpointAndRefresh(sessionKey, turnId, clientContext);
			this._markSessionUnread(sessionUri);
		}
	}

	private _recordModelCallCompleted(signal: IAgentModelCallCompletedSignal, sessionKey: ProtocolURI, turnId: string, turnIdRouting: AgentSignalTurnIdRouting): void {
		if (signal.turnId !== turnId && turnIdRouting === 'preserve') {
			this._logService.trace(`[AgentSideEffects] Dropping stale model_call_completed for ${sessionKey}: producerTurnId=${signal.turnId}, activeTurnId=${turnId}`);
			return;
		}
		this._turnTracker.modelCallCompleted(sessionKey, turnId, signal.modelCallId);
	}

	/**
	 * Completes a turn's telemetry, enriching it with the session's working-
	 * directory shape. Normalizes a chat channel to its owning session URI
	 * before reading the effective working directories, so peer-chat / channel
	 * turns report the correct count and multi-root flag.
	 */
	private _captureTurnCheckpointAndRefresh(sessionKey: ProtocolURI, turnId: string, clientContext?: IAgentHostClientTelemetryContext): void {
		const sessionUri = isAhpChatChannel(sessionKey) ? parseRequiredSessionUriFromChatUri(sessionKey) : sessionKey;
		const workingDirectories = this._agentConfigService.getEffectiveWorkingDirectories(sessionUri)?.map(w => URI.parse(w));
		this._checkpointService.captureTurnCheckpoint(URI.parse(sessionUri), URI.parse(sessionKey), turnId, workingDirectories).then(() => this._changesets.onTurnComplete(sessionUri, turnId, clientContext), () => this._changesets.onTurnComplete(sessionUri, turnId, clientContext));
	}

	private _completeTurn(channel: string, turnId: string, result: AgentHostTurnResult, failure?: IAgentHostTurnFailure): void {
		const sessionUri = isAhpChatChannel(channel) ? parseRequiredSessionUriFromChatUri(channel) : channel;
		const folderCount = this._agentConfigService.getEffectiveWorkingDirectories(sessionUri)?.length ?? 0;
		this._turnTracker.turnCompleted(channel, turnId, result, failure, { isMultiRoot: folderCount > 1, folderCount });
	}

	/**
	 * Post-turn side effects: flush any pending debounced diff computation,
	 * compute final diffs immediately, drain the next queued message, and
	 * notify the host so it can refresh git state.
	 */
	private _runTurnCompleteSideEffects(sessionKey: ProtocolURI, turnId: string | undefined, clientContext?: IAgentHostClientTelemetryContext): void {
		// Checkpoints, changesets and the host git-refresh notification are
		// scoped to the owning session's working tree, which peer chats
		// share. Normalize an additional-chat channel to its session for
		// those, while keeping the original channel for per-chat queued
		// message consumption (queues live on the chat state). For the
		// default chat / single-chat case `sessionKey` is already the
		// session URI, so this is a no-op.
		const sessionUri = isAhpChatChannel(sessionKey) ? parseRequiredSessionUriFromChatUri(sessionKey) : sessionKey;
		// Capture the end-of-turn git checkpoint BEFORE notifying the
		// changeset service so the per-turn changeset recompute can take
		// the authoritative git-diff fast path (which includes terminal-tool
		// edits the FileEditTracker misses). The capture is best-effort —
		// any failure logs and the changeset pipeline falls back to the
		// `file_edits`-based path. We don't block subsequent side effects
		// (queued message drain, host notification) on the changeset
		// completion since those have always been fire-and-forget; the
		// ordering guarantee we care about is checkpoint-then-changeset.
		if (turnId !== undefined) {
			// Resolved here rather than inside the checkpoint service so the
			// repositories a checkpoint acts on are always explicit at the
			// call site. Note the changeset service below deliberately keeps
			// its own resolution: `onTurnComplete` only schedules deferred
			// recomputes that are shared with subscription, truncation and
			// mid-turn-debounce entry points, so it has no single point at
			// which a caller-supplied set would apply.
			const workingDirectories = this._agentConfigService.getEffectiveWorkingDirectories(sessionUri)?.map(w => URI.parse(w));
			this._checkpointService.captureTurnCheckpoint(URI.parse(sessionUri), URI.parse(sessionKey), turnId, workingDirectories).then(() => {
				this._changesets.onTurnComplete(sessionUri, turnId, clientContext);
			}, err => {
				this._logService.warn(`[AgentSideEffects] Turn checkpoint capture failed for ${sessionUri}/${turnId}: ${err instanceof Error ? err.message : String(err)}`);
				this._changesets.onTurnComplete(sessionUri, turnId, clientContext);
			});
		} else {
			this._changesets.onTurnComplete(sessionUri, turnId, clientContext);
		}
		this._tryConsumeNextQueuedMessage(sessionKey);
		this._options.onTurnComplete(sessionUri);

		// After the first turn completes, refine the auto-generated title using
		// the full first-turn context (request + response). No-op for later
		// turns or when the title has since been changed. `sessionKey` may be an
		// additional chat channel; route it as `chatChannel` so the refinement
		// targets that chat's title, mirroring `seedTitleFromFirstMessage`.
		const titleChatChannel = isAhpChatChannel(sessionKey) && !isDefaultChatUri(sessionKey) ? sessionKey : undefined;
		this._titleController.refineTitleFromFirstTurn(sessionUri, titleChatChannel);

		// A completed turn produces new output the user may not have seen. Route
		// subagent turns to their owning session too (a background subagent can
		// complete after the parent turn). Each client keeps its active session
		// read; `_markSessionUnread` is idempotent.
		this._markSessionUnread(sessionUri);
	}

	private _markSessionUnread(session: ProtocolURI): void {
		const status = this._stateManager.getSessionSummary(session)?.status ?? 0;
		if (!(status & SessionStatus.IsRead)) {
			return;
		}
		// Persistence rides the envelope observer set up in the constructor.
		this._stateManager.dispatchServerAction(session, { type: ActionType.SessionIsReadChanged, isRead: false });
	}

	private _describeSignal(signal: AgentSignal): string {
		return signal.kind === 'action' ? `action(${signal.action.type})` : signal.kind;
	}

	/**
	 * Replays any signals that were buffered while waiting for
	 * `subagent_started` to create the subagent session. Called immediately
	 * after `_handleSubagentStarted`.
	 */
	private _drainPendingSubagentSignals(parentChatURI: ProtocolURI, parentToolCallId: string): void {
		const buffer = this._pendingSubagentSignals.get(parentChatURI, parentToolCallId);
		if (!buffer) {
			return;
		}
		this._pendingSubagentSignals.delete(parentChatURI, parentToolCallId);
		this._logService.trace(`[AgentSideEffects] Draining ${buffer.length} buffered signal(s) for subagent ${parentChatURI}/${parentToolCallId}`);
		for (const { signal, agent } of buffer) {
			this._handleAgentSignal(agent, signal);
		}
	}

	// ---- Subagent session management ----------------------------------------

	/**
	 * Starts the subagent turn in response to a `subagent_started` event and
	 * wires the parent tool call to the subagent chat. The subagent chat's
	 * catalog membership is owned by the spawn channel
	 * ({@link AgentService._onChatSpawned}), which the orchestrator applies
	 * before this runs, so this only drives the turn/tracking/parent content
	 * — it does not add the chat.
	 *
	 * `chatURI` is always the agent's top-level chat: the subagent is
	 * registered (and inner events routed) under it because inner-tool
	 * signals carry the top-level chat as their resource. `spawningToolParentId`,
	 * when set, is the tool call one level up from the spawning `toolCallId`
	 * — the tool call in whose (subagent) chat the spawning tool lives — and
	 * is used to route the discovery content block to that immediate parent
	 * chat. Since subagent chats are flat (keyed off the root session), this
	 * one-hop reference resolves the parent chat at any nesting depth.
	 */
	private _handleSubagentStarted(
		chatURI: ProtocolURI,
		toolCallId: string,
		agentName: string,
		agentDisplayName: string,
		agentDescription?: string,
		taskPrompt?: string,
		spawningToolParentId?: string,
	): void {
		const parentSessionUri = parseRequiredSessionUriFromChatUri(chatURI);
		const subagentChatUri = buildSubagentChatUri(parentSessionUri, toolCallId);

		const existing = this._subagentChats.get(chatURI, toolCallId);
		if (existing) {
			this._resumeSubagentSession(chatURI, toolCallId, taskPrompt ? { text: taskPrompt, origin: { kind: MessageKind.User } } : undefined);
			return;
		}

		this._logService.info(`[AgentSideEffects] Starting subagent turn: ${subagentChatUri} (parent=${chatURI}, toolCallId=${toolCallId})`);

		// The spawning tool call lives in the immediate parent chat (top-level, or the parent subagent chat when nested).
		const contentChatUri = spawningToolParentId
			? this._subagentChats.get(chatURI, spawningToolParentId)?.chatUri ?? chatURI
			: chatURI;

		// Seed the subagent's opening request with the delegated task prompt,
		// supplied by the provider on the `subagent_started` signal.
		const turnId = generateUuid();
		const parentTurnId = this._stateManager.getActiveTurnId(contentChatUri);
		const parentClientContext = parentTurnId ? this._turnTracker.getClientTelemetryContext(contentChatUri, parentTurnId) : undefined;
		this._stateManager.dispatchServerAction(subagentChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: new Date().toISOString(),
			message: { text: taskPrompt ?? '', origin: { kind: MessageKind.User } },
		});
		const agent = this._options.getAgent(parentSessionUri);
		if (agent) {
			this._turnTracker.turnStarted(agent.id, subagentChatUri, turnId, undefined, undefined, 'default', undefined, undefined, parentClientContext);
			this._turnTracker.setCurrentStage(subagentChatUri, turnId, 'provider');
		}

		this._subagentChats.set({ parentChatUri: chatURI, toolCallId, sessionUri: parentSessionUri, chatUri: subagentChatUri, turnStopWatch: StopWatch.create(false) }, chatURI, toolCallId);

		// Dispatch the discovery content on the spawning tool call's own chat; the top-level chat is a no-op when nested.
		if (parentTurnId) {
			const parentState = this._stateManager.getSessionState(contentChatUri);
			const existingContent = this._getRunningToolCallContent(parentState, parentTurnId, toolCallId);
			this._stateManager.dispatchServerAction(contentChatUri, {
				type: ActionType.ChatToolCallContentChanged,
				turnId: parentTurnId,
				toolCallId,
				content: [
					...existingContent,
					{
						type: ToolResultContentType.Subagent,
						resource: subagentChatUri,
						title: agentDisplayName,
						agentName,
						description: agentDescription,
					},
				],
			});
		}
	}

	/**
	 * Gets the current content array from a running tool call, if any.
	 */
	private _getRunningToolCallContent(
		state: ISessionWithDefaultChat | undefined,
		turnId: string,
		toolCallId: string,
	): ToolResultContent[] {
		if (!state?.activeTurn || state.activeTurn.id !== turnId) {
			return [];
		}
		for (const rp of state.activeTurn.responseParts) {
			if (rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === toolCallId && rp.toolCall.status === ToolCallStatus.Running) {
				return rp.toolCall.content ? [...rp.toolCall.content] : [];
			}
		}
		return [];
	}

	private _turnDuration(stopWatch: StopWatch | undefined): number {
		const elapsed = stopWatch?.elapsed();
		return typeof elapsed === 'number' && Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
	}

	private _resumeSubagentSession(parentChatURI: ProtocolURI, toolCallId: string, message: Message | undefined): void {
		const subagent = this._subagentChats.get(parentChatURI, toolCallId);
		if (!subagent) {
			this._logService.error(`[AgentSideEffects] Cannot resume unknown subagent ${parentChatURI}/${toolCallId}`);
			return;
		}
		if (this._stateManager.getActiveTurnId(subagent.chatUri)) {
			return;
		}

		const turnId = generateUuid();
		const parentTurnId = this._stateManager.getActiveTurnId(parentChatURI);
		const parentClientContext = parentTurnId ? this._turnTracker.getClientTelemetryContext(parentChatURI, parentTurnId) : undefined;
		this._logService.info(`[AgentSideEffects] Resuming subagent turn: ${subagent.chatUri} (parent=${parentChatURI}, toolCallId=${toolCallId})`);
		this._stateManager.dispatchServerAction(subagent.chatUri, {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: new Date().toISOString(),
			message: message ?? { text: '', origin: { kind: MessageKind.User } },
		});
		const agent = this._options.getAgent(subagent.sessionUri);
		if (agent) {
			this._turnTracker.turnStarted(agent.id, subagent.chatUri, turnId, undefined, undefined, 'default', undefined, undefined, parentClientContext);
			this._turnTracker.setCurrentStage(subagent.chatUri, turnId, 'provider');
		}
		this._subagentChats.set({ ...subagent, turnStopWatch: StopWatch.create(false) }, parentChatURI, toolCallId);
	}

	/**
	 * Cancels all active subagent sessions for a given parent session.
	 */
	cancelSubagentSessions(parentChatURI: ProtocolURI): void {
		for (const subagent of this._subagentChats.getAll(parentChatURI)) {
			const turnId = this._stateManager.getActiveTurnId(subagent.chatUri);
			if (turnId) {
				this._stateManager.dispatchServerAction(subagent.chatUri, {
					type: ActionType.ChatTurnCancelled,
					turnId,
					duration: this._turnDuration(subagent.turnStopWatch),
				});
				this._completeTurn(subagent.chatUri, turnId, 'cancelled');
			}
			this._toolCallTracker.clearSession(subagent.chatUri);
			this._turnTracker.clearSession(subagent.chatUri);
		}
		this._subagentChats.deleteAll(parentChatURI);
		// Drop any buffered events targeted at subagents that never started.
		this._pendingSubagentSignals.deleteAll(parentChatURI);
	}

	/**
	 * Completes the active turn for the subagent associated with a parent tool
	 * call. The chat remains registered so a later steered turn can resume it.
	 */
	completeSubagentSession(parentChatURI: ProtocolURI, toolCallId: string): void {
		// Drop any events that were buffered waiting for a `subagent_started`
		// that never arrived (e.g. the parent tool failed before the subagent
		// was created). Without this, the buffer entry would leak until the
		// parent session is disposed.
		this._pendingSubagentSignals.delete(parentChatURI, toolCallId);

		const subagent = this._subagentChats.get(parentChatURI, toolCallId);
		if (!subagent) {
			return;
		}

		const turnId = this._stateManager.getActiveTurnId(subagent.chatUri);
		if (turnId) {
			this._stateManager.dispatchServerAction(subagent.chatUri, {
				type: ActionType.ChatTurnComplete,
				turnId,
				duration: this._turnDuration(subagent.turnStopWatch),
			});
			this._completeTurn(subagent.chatUri, turnId, 'success');
			this._toolCallTracker.clearSession(subagent.chatUri);
		}
	}

	/**
	 * Removes all subagent chats for a given parent session from the state manager.
	 */
	removeSubagentSessions(parentSession: ProtocolURI): void {
		for (const chatUri of this._cancelledTurnIds.keys()) {
			if (parseRequiredSessionUriFromChatUri(chatUri) === parentSession) {
				this._cancelledTurnIds.delete(chatUri);
			}
		}

		const parentChatURIs = new Set<ProtocolURI>();
		for (const subagent of this._subagentChats.values()) {
			if (subagent.sessionUri === parentSession) {
				this._stateManager.removeChat(subagent.sessionUri, subagent.chatUri);
				this._toolCallTracker.clearSession(subagent.chatUri);
				this._turnTracker.clearSession(subagent.chatUri);
				parentChatURIs.add(subagent.parentChatUri);
			}
		}
		for (const parentChatURI of parentChatURIs) {
			this._subagentChats.deleteAll(parentChatURI);
			this._pendingSubagentSignals.deleteAll(parentChatURI);
		}
	}

	/**
	 * Drops per-channel telemetry tracking on teardown. In-flight tool calls
	 * and never-completed turns are discarded without reporting, so neither
	 * their tracking maps nor the turn hang watchdog timers outlive the
	 * channel they describe.
	 */
	clearChannelTelemetry(channel: ProtocolURI): void {
		this._toolCallTracker.clearSession(channel);
		this._turnTracker.clearSession(channel);
	}

	clearInputRequestsForSession(session: ProtocolURI): void {
		this._inputRequestTracker.clearAgentSession(session);
	}

	/**
	 * Finds the subagent session that owns a given tool call by checking
	 * whether the tool call was previously registered under a subagent
	 * session key in `_toolCallAgents`. Scoped to subagent sessions owned
	 * by the given parent to avoid cross-session collisions.
	 */
	private _findSubagentChatForToolCall(parentChatURI: ProtocolURI, toolCallId: string): ProtocolURI | undefined {
		for (const subagent of this._subagentChats.getAll(parentChatURI)) {
			if (this._toolCallAgents.has(`${subagent.chatUri}:${toolCallId}`)) {
				return subagent.chatUri;
			}
		}
		return undefined;
	}

	private _toolCallCompletionChat(chatChannel: ProtocolURI): ProtocolURI {
		if (!isSubagentChatUri(chatChannel)) {
			return chatChannel;
		}

		for (const subagent of this._subagentChats.values()) {
			if (subagent.chatUri === chatChannel) {
				return this._toolCallCompletionChat(subagent.parentChatUri);
			}
		}

		this._logService.warn(`[AgentSideEffects] Missing parent chat for subagent tool completion: chat=${chatChannel}`);
		return chatChannel;
	}

	/**
	 * Forwards a completed client tool call to the provider.
	 *
	 * `chat` is the host-resolved *routing* target: for a subagent chat, the
	 * ancestor chat whose provider runtime owns the tool call (see
	 * {@link _toolCallCompletionChat}). The context carries the chat the tool
	 * call was actually addressed to, so a provider can recover the spawn edge
	 * via `resolveSubagentChatParent(context)` instead of walking host state.
	 * The two differ only when the addressed chat is a subagent.
	 */
	private _notifyClientToolCallComplete(sessionChannel: ProtocolURI, chatChannel: ProtocolURI, toolCallId: string, result: ToolCallResult, source: 'client-dispatch' | 'server-envelope'): void {
		const completionChat = this._toolCallCompletionChat(chatChannel);
		const agent = this._options.getAgent(sessionChannel);
		if (!agent) {
			this._logService.warn(`[AgentSideEffects] No agent for client tool completion: source=${source}, session=${sessionChannel}, chat=${chatChannel}, completionChat=${completionChat}, toolCallId=${toolCallId}`);
			return;
		}
		this._logService.info(`[AgentSideEffects] Forwarding client tool completion: source=${source}, session=${sessionChannel}, chat=${chatChannel}, completionChat=${completionChat}, toolCallId=${toolCallId}, success=${result.success}`);
		agent.onClientToolCallComplete(URI.parse(completionChat), toolCallId, result, this._chatContext(sessionChannel, chatChannel));
	}

	// ---- Side-effect handlers --------------------------------------------------

	/**
	 * Handles a `pending_confirmation` signal end-to-end: checks for
	 * auto-approval via the permission manager, and if not auto-approved,
	 * dispatches the `ChatToolCallReady` action with confirmation options
	 * for the client.
	 */
	private async _handleToolReady(e: IAgentToolPendingConfirmationSignal, sessionKey: ProtocolURI, turnId: string, agent: IAgent): Promise<void> {
		const approvalEvent = {
			toolCallId: e.state.toolCallId,
			session: e.chat,
			permissionKind: e.permissionKind,
			permissionPath: e.permissionPath,
			toolInput: getInlineToolInput(e.state.toolInput),
			requestSandboxBypass: e.requestSandboxBypass,
			shellLanguage: e.shellLanguage,
		};
		const autoApproval = e.managedApprovalRequired
			? undefined
			: await this._permissionManager.getAutoApproval(approvalEvent, sessionKey);
		const part = this._stateManager.getSessionState(sessionKey)?.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === e.state.toolCallId);
		const toolCall = part?.kind === ResponsePartKind.ToolCall ? part.toolCall : undefined;
		if (toolCall
			&& toolCall.status !== ToolCallStatus.Streaming
			&& toolCall.status !== ToolCallStatus.Running
			&& toolCall.status !== ToolCallStatus.PendingConfirmation) {
			const toolCallKey = `${sessionKey}:${e.state.toolCallId}`;
			this._toolCallAgents.delete(toolCallKey);
			this._managedApprovalToolCalls.delete(toolCallKey);
			this._logService.trace(`[AgentSideEffects] Dropping stale tool ready for ${e.state.toolCallId}: status=${toolCall.status}`);
			return;
		}
		const contributor = e.state.contributor ?? toolCall?.contributor;
		let effective = e;
		const toolCallKey = `${sessionKey}:${e.state.toolCallId}`;
		if (e.managedApprovalRequired) {
			this._managedApprovalToolCalls.add(toolCallKey);
		} else {
			this._managedApprovalToolCalls.delete(toolCallKey);
		}
		const clientShouldAutoApprove = autoApproval !== undefined
			&& contributor?.kind === ToolCallContributorKind.Client
			&& !!e.state.confirmationTitle;
		if (clientShouldAutoApprove) {
			this._toolCallAgents.set(toolCallKey, agent.id);
			effective = { ...e, state: { ...e.state, _meta: { ...toolCall?._meta, ...e.state._meta, ...toToolCallMeta({ autoApproveBySetting: true }) } } };
		} else if (autoApproval !== undefined) {
			this._toolCallAgents.delete(toolCallKey);
			agent.respondToPermissionRequest(e.state.toolCallId, true);
			// Strip confirmationTitle so createToolReadyAction emits the
			// auto-approved (no-options) action.
			effective = { ...e, state: { ...e.state, confirmationTitle: undefined } };
		} else if (effective.state.confirmationTitle) {
			// Make sure the agent is registered for the eventual `ChatToolCallConfirmed` response.
			this._toolCallAgents.set(toolCallKey, agent.id);
		}
		if (autoApproval === undefined && !e.managedApprovalRequired && this._permissionManager.isAutoApproveRuleResolvable(approvalEvent, sessionKey)) {
			// Mark confirmations where a persistent allow rule can suppress the next equivalent prompt.
			effective = { ...effective, state: { ...effective.state, _meta: { ...toolCall?._meta, ...effective.state._meta, ...toToolCallMeta({ autoApproveRuleResolvable: true }) } } };
		}
		const readyAction = this._permissionManager.createToolReadyAction(effective, sessionKey, turnId);
		this._toolCallTracker.toolCallMetadataUpdated(sessionKey, readyAction.toolCallId, readyAction.contributor);
		this._turnTracker.toolCallMetadataUpdated(sessionKey, turnId, readyAction.toolCallId, readyAction.contributor);
		if (readyAction.confirmed) {
			this._toolCallTracker.toolCallExecutionStarted(sessionKey, readyAction.toolCallId);
		}
		this._stateManager.dispatchServerAction(sessionKey, readyAction);
		// This action is synthesized here rather than routed through
		// `_dispatchActionForSession`, so feed the hang watchdog explicitly.
		this._turnTracker.markActivity(sessionKey, turnId, readyAction.type);
	}

	handleAction(channel: ProtocolURI, action: StateAction, clientId?: string, clientContextOrType: IAgentHostClientTelemetryContext | AgentHostClientType = AgentHostClientType.Unknown): void {
		let clientContext = typeof clientContextOrType === 'string'
			? createUnknownAgentHostClientTelemetryContext(clientContextOrType)
			: clientContextOrType;
		if (this._options.hostLaunchKind !== undefined) {
			clientContext = { ...clientContext, hostLaunchKind: this._options.hostLaunchKind };
		}
		const chatChannel = isAhpChatChannel(channel) ? channel : undefined;
		const sessionChannel = chatChannel ? parseRequiredSessionUriFromChatUri(chatChannel) : channel;
		switch (action.type) {
			case ActionType.ChatTurnStarted: {
				if (!chatChannel) {
					throw new Error(`ChatTurnStarted must be handled on an AHP chat channel: ${channel}`);
				}
				const turnStopWatch = StopWatch.create(false);
				// Per-turn streaming part tracking is owned by the agent
				// (e.g. CopilotAgentSession) and reset on its `send()` call.

				// Generic, agent-agnostic host commands (`/rename`, `!command`,
				// …) are intercepted here and handled by the local-command
				// dispatcher rather than forwarded to the agent SDK.
				const handled = this._localCommands.tryHandle({ turnChannel: channel, turnId: action.turnId, text: action.message.text });
				if (handled) {
					if (handled.suggestedTitle !== undefined) {
						this._titleController.seedProvisionalTitle(sessionChannel, handled.suggestedTitle, chatChannel);
					}
					break;
				}

				const state = this._stateManager.getSessionState(channel);
				if (!state) {
					this._logService.info(`[AgentSideEffects] Turn started for session not in state manager: ${channel}, turnId=${action.turnId} - status/summary updates may be dropped unless the session is restored`);
				}
				this._titleController.seedTitleFromFirstMessage(sessionChannel, action.message.text, chatChannel);
				this._options.onUserMessage?.(sessionChannel, action.message.text);

				const agent = this._options.getAgent(sessionChannel);
				if (!agent) {
					this._stateManager.dispatchServerAction(channel, {
						type: ActionType.ChatError,
						turnId: action.turnId,
						duration: this._turnDuration(turnStopWatch),
						error: { errorType: 'noAgent', message: 'No agent found for session' },
					});
					return;
				}
				const attachments = action.message.attachments;
				this._telemetryReporter.userMessageSent(agent.id, clientId, clientContext, channel, action.turnId, state, 'direct', attachments);
				const { model, modelTelemetryKind, modelSelectionKind, permissionLevel, interactionMode } = this._getTurnTelemetryContext(agent, channel, this._chatContext(sessionChannel, channel), state, action.message.model?.id);
				this._turnTracker.turnStarted(agent.id, channel, action.turnId, model, modelTelemetryKind, modelSelectionKind, permissionLevel, interactionMode, clientContext);
				void this._sendTurnMessage({
					agent,
					sessionChannel,
					turnChannel: channel,
					chat: channel,
					message: action.message,
					turnId: action.turnId,
					senderClientId: clientId,
					clientContext,
					turnStopWatch,
				});
				break;
			}
			case ActionType.ChatToolCallConfirmed: {
				if (!chatChannel) {
					throw new Error(`ChatToolCallConfirmed must be handled on an AHP chat channel: ${channel}`);
				}
				const toolCallKey = `${channel}:${action.toolCallId}`;
				if (action.approved) {
					this._toolCallTracker.toolCallExecutionStarted(channel, action.toolCallId);
				} else {
					// A denial is terminal: the reducer moves the call to
					// `cancelled` and ignores any later completion for it, so
					// this is the last chance to drop it from the turn's
					// in-flight set. Leaving it would make a subsequent hang
					// report `runningTool` for a tool that will never run.
					this._turnTracker.toolCallEnded(channel, action.turnId, action.toolCallId);
				}
				const managedApprovalRequired = this._managedApprovalToolCalls.delete(toolCallKey);
				const agentId = this._toolCallAgents.get(toolCallKey);
				if (agentId) {
					this._toolCallAgents.delete(toolCallKey);
					const agent = this._options.agents.get().find(a => a.id === agentId);
					agent?.respondToPermissionRequest(action.toolCallId, action.approved);
				} else {
					this._logService.warn(`[AgentSideEffects] No agent for tool call confirmation: ${action.toolCallId}`);
				}

				// When the user chose "Allow in this Session", add the tool
				// to the session's permissions so future calls are auto-approved.
				if (action.approved && !managedApprovalRequired) {
					this._permissionManager.handleToolCallConfirmed(channel, action.toolCallId, action.selectedOptionId);
				}
				break;
			}
			case ActionType.ChatInputCompleted: {
				if (!chatChannel) {
					throw new Error(`ChatInputCompleted must be handled on an AHP chat channel: ${channel}`);
				}
				const agent = this._options.getAgent(sessionChannel);
				agent?.respondToUserInputRequest(action.requestId, action.response, action.answers);
				break;
			}
			case ActionType.ChatTurnCancelled: {
				if (!chatChannel) {
					throw new Error(`ChatTurnCancelled must be handled on an AHP chat channel: ${channel}`);
				}
				this._completeTurn(channel, action.turnId, 'cancelled');
				this._toolCallTracker.clearSession(channel);
				void this._checkpointService.discardTurnStartCheckpoint(URI.parse(sessionChannel), URI.parse(channel), action.turnId).catch(() => undefined);
				// Cancel all subagent sessions for this parent
				this.cancelSubagentSessions(channel);
				const agent = this._options.getAgent(sessionChannel);
				if (agent) {
					const chat = URI.parse(channel);
					const session = parseRequiredSessionUriFromChatUri(channel);
					agent.chats.abort(chat, { ...this._chatContext(session, channel), clientTelemetryContext: clientContext }).catch(err => {
						this._logService.error('[AgentSideEffects] abort failed', err);
					});
				}
				// Intentionally do NOT drain queued messages here: cancelling means
				// "stop", so messages queued behind the turn stay queued for the
				// user to dequeue/run manually. (A message the user sends *after*
				// the abort is still consumed via the ChatPendingMessageSet path
				// once cancellation has cleared the active turn.)
				break;
			}
			case ActionType.SessionTitleChanged: {
				if (chatChannel) {
					// The rename targeted a specific chat (default or additional),
					// not the whole session. Route it to a per-chat title update so
					// the session title stays independent.
					this._stateManager.updateChatTitle(sessionChannel, chatChannel, action.title);
					this._persistSessionFlag(sessionChannel, customChatTitleMetadataKey(chatChannel), action.title);
					this._persistSessionFlag(sessionChannel, customChatTitleSourceMetadataKey(chatChannel), AGENT_HOST_TITLE_SOURCE_USER);
					this._titleController.markTitleRenamed(sessionChannel, chatChannel);
					break;
				}
				this._persistSessionFlag(channel, SESSION_CUSTOM_TITLE_KEY, action.title);
				this._persistSessionFlag(channel, SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_USER);
				this._titleController.markTitleRenamed(channel);
				break;
			}
			case ActionType.ChatPendingMessageSet: {
				if (!chatChannel) {
					throw new Error(`${action.type} must be handled on an AHP chat channel: ${channel}`);
				}
				const queuedMessageExists = this._stateManager.getChatState(channel)?.queuedMessages?.some(message => message.id === action.id) === true;
				if (action.kind === PendingMessageKind.Queued && queuedMessageExists) {
					this._queuedMessageSenders.set({ clientId, clientContext }, channel, action.id);
				}
				this._syncPendingMessages(channel);
				break;
			}
			case ActionType.ChatPendingMessageRemoved: {
				if (!chatChannel) {
					throw new Error(`${action.type} must be handled on an AHP chat channel: ${channel}`);
				}
				if (action.kind === PendingMessageKind.Queued) {
					this._queuedMessageSenders.delete(channel, action.id);
				}
				this._syncPendingMessages(channel);
				break;
			}
			case ActionType.ChatQueuedMessagesReordered: {
				if (!chatChannel) {
					throw new Error(`${action.type} must be handled on an AHP chat channel: ${channel}`);
				}
				this._syncPendingMessages(channel);
				break;
			}
			case ActionType.ChatTruncated: {
				if (!chatChannel) {
					throw new Error(`ChatTruncated must be handled on an AHP chat channel: ${channel}`);
				}
				void this._checkpointService.discardChatTurnStartCheckpoints(URI.parse(sessionChannel), URI.parse(chatChannel)).catch(() => undefined);
				const agent = this._options.getAgent(sessionChannel);
				// When the truncation boundary is a host-injected local turn
				// (`/rename` / `!command`), redirect the SDK truncation to the
				// preceding concrete turn so the agent keeps everything up to
				// the real message before it.
				const sdkTurnId = action.turnId !== undefined
					? this._options.localTurns.resolveConcreteTurnId(chatChannel, action.turnId)
					: action.turnId;
				// Route to the chat being truncated: the default chat (addressed
				// by the session) or a peer chat with its own backing.
				agent?.truncateChat?.(URI.parse(chatChannel), sdkTurnId, this._chatContext(sessionChannel, chatChannel)).catch(err => {
					this._logService.error('[AgentSideEffects] truncateChat failed', err);
				});
				// Drop persisted local turns that no longer survive in the
				// (already-truncated) chat state.
				const survivingIds = new Set((this._stateManager.getChatState(chatChannel)?.turns ?? []).map(t => t.id));
				const removed = this._options.localTurns.getLocalTurnIds(chatChannel).filter(id => !survivingIds.has(id));
				this._options.localTurns.deleteLocals(sessionChannel, removed);
				// Turns removed by the truncation will never complete, so their
				// hang watchdogs must not survive to report a turn that no
				// longer exists. The active turn is tracked separately from
				// `turns` in chat state, so keep it explicitly.
				const trackedTurnIds = new Set(survivingIds);
				const activeTurnId = this._stateManager.getActiveTurnId(chatChannel);
				if (activeTurnId) {
					trackedTurnIds.add(activeTurnId);
				}
				this._turnTracker.clearTurnsExcept(chatChannel, trackedTurnIds);
				this._changesets.onSessionTruncated(sessionChannel);
				break;
			}
			case ActionType.SessionActiveClientSet: {
				this._fanOutActiveClient(channel, action.activeClient);
				break;
			}
			case ActionType.SessionActiveClientRemoved: {
				const agent = this._options.getAgent(channel);
				for (const chat of getSessionChatsForFanOut(this._stateManager, channel) ?? []) {
					agent?.removeActiveClient(chat, this._chatContext(channel, chat.toString()), action.clientId);
				}
				break;
			}
			case ActionType.RootConfigChanged: {
				updateAgentHostTelemetryLevelFromConfig(this._telemetryService, action.config);
				// Host customizations are self-managed by each agent's
				// PluginController via IAgentConfigurationService.onDidRootConfigChange.
				// Republish agent infos for non-customization schema changes
				// (e.g. permissions) and session customizations as a catchall.
				this._publishAgentInfos(this._options.agents.get());
				this._publishAllSessionCustomizations();
				break;
			}
			case ActionType.SessionMcpServerStartRequested: {
				const agent = this._options.getAgent(sessionChannel);
				agent?.startMcpServer?.(URI.parse(sessionChannel), action.id).catch(err => {
					this._logService.warn(`[AgentSideEffects] startMcpServer failed for ${sessionChannel}`, err);
				});
				break;
			}
			case ActionType.SessionMcpServerStopRequested: {
				const agent = this._options.getAgent(sessionChannel);
				agent?.stopMcpServer?.(URI.parse(sessionChannel), action.id).catch(err => {
					this._logService.warn(`[AgentSideEffects] stopMcpServer failed for ${sessionChannel}`, err);
				});
				break;
			}
			case ActionType.SessionIsArchivedChanged: {
				// Persistence rides the envelope observer set up in the constructor.
				// Host-owned worktree lifecycle (agents stay unaware): remove the
				// clean, branch-preserved worktree on archive and recreate it on
				// unarchive. Serialized per session inside the controller so it can't
				// interleave with a first-send worktree resolution.
				if (this._worktree) {
					const sessionUri = URI.parse(channel);
					const sessionId = AgentSession.id(channel);
					const worktreeOp = action.isArchived
						? this._worktree.cleanupWorktreeOnArchive(sessionUri, sessionId)
						: this._worktree.recreateWorktreeOnUnarchive(sessionUri, sessionId);
					worktreeOp.catch(err => this._logService.warn(`[AgentSideEffects] worktree ${action.isArchived ? 'cleanup' : 'recreate'} failed for ${channel}`, err));
				}
				const agent = this._options.getAgent(channel);
				agent?.onArchivedChanged?.(URI.parse(channel), action.isArchived).catch(err => {
					this._logService.warn(`[AgentSideEffects] onArchivedChanged failed for ${channel}`, err);
				});
				break;
			}
			case ActionType.SessionConfigChanged: {
				const sessionState = this._stateManager.getSessionState(channel);
				const values = sessionState?.config?.values;
				if (this._worktree && sessionState?.lifecycle === SessionLifecycle.Creating) {
					const sessionId = AgentSession.id(channel);
					const isolation = values?.[SessionConfigKey.Isolation];
					if (isolation === 'worktree') {
						this._worktree.notePending(sessionId);
					} else if (isolation === 'folder') {
						this._worktree.clearPending(sessionId);
					}
				}
				break;
			}
			case ActionType.ChatToolCallComplete: {
				if (!chatChannel) {
					break; // Not a chat channel; ignore.
				}
				this._notifyClientToolCallComplete(sessionChannel, chatChannel, action.toolCallId, action.result, 'client-dispatch');
				break;
			}
		}
	}

	/** Injects the host-owned worktree isolation controller (see {@link AgentService.setWorktreeIsolation}). */
	setWorktreeIsolation(worktree: WorktreeIsolation): void {
		this._worktree = worktree;
	}

	private _recordCustomizationEnablement(session: ProtocolURI, candidate: ICustomizationEnablementCandidate, enablement: readonly CustomizationEnablement[]): void {
		const target = candidate.customization.type === CustomizationType.Plugin
			? targetForPlugin(candidate.customization)
			: targetForMcpServer(candidate.customization, candidate.owningPluginUri, false);
		this._customizationEnablementService.replaceEnablement(session, target, enablement);
	}

	cancelSessionTitleGeneration(session: ProtocolURI): void {
		this._titleController.cancelTitleGeneration(session);
	}

	clearSessionTitleState(session: ProtocolURI, chats: readonly ProtocolURI[]): void {
		this._titleController.clearSession(session, chats);
	}

	clearQueuedMessageSenders(chat: ProtocolURI): void {
		this._queuedMessageSenders.deleteAll(chat);
	}

	/**
	 * Generates a content-derived title for a freshly forked session
	 * (`chatChannel` undefined) or peer chat from its inherited chat
	 * turns, replacing the placeholder `Forked: …` title once ready.
	 */
	generateForkedTitle(channel: ProtocolURI, chatChannel: ProtocolURI | undefined, turns: readonly Turn[], fallbackTitle: string, sourceTitle?: string): void {
		this._titleController.generateForkedTitle(channel, chatChannel, turns, fallbackTitle, sourceTitle);
	}

	markTitleAuto(channel: ProtocolURI, chatChannel: ProtocolURI | undefined, title: string): void {
		this._titleController.markTitleAuto(channel, chatChannel, title);
	}

	markTitleRenamed(channel: ProtocolURI, chatChannel?: ProtocolURI): void {
		this._titleController.markTitleRenamed(channel, chatChannel);
	}

	/**
	 * Persists a session metadata key/value pair to the session database.
	 * Used for fields the host needs to remember across restarts (custom
	 * title, isRead/isArchived flags, merged config values).
	 */
	private _persistSessionFlag(session: ProtocolURI, key: string, value: string): void {
		persistSessionMetadata(this._options.sessionDataService, this._logService, session, key, value);
	}

	/**
	 * Persists the usage reported for a chat's turn.
	 *
	 * Agent backends do not durably record token/credit usage themselves (the
	 * Copilot SDK's `assistant.usage` event is explicitly ephemeral, and the
	 * Claude transcript replay produces none), so a restored session would
	 * otherwise come back with no context-usage gauge and a session cost of 0.
	 * See `AgentService._applyPersistedTurnUsage` for which providers can
	 * currently match these rows back on restore.
	 *
	 * Written on every report rather than buffered until the turn ends: the row
	 * is keyed by turn id and written with `INSERT OR REPLACE` through a
	 * sequencer, so "last report wins" is already a property of the storage
	 * layer, and persisting eagerly means a turn cut short by a crash or
	 * disconnect keeps the usage it had already accrued.
	 *
	 * Subagent chats are skipped: their cost is already folded into the parent
	 * turn's aggregate, so recording it again would double-count.
	 */
	private _trackTurnUsage(channel: ProtocolURI, action: ChatAction): void {
		if (action.type !== ActionType.ChatUsage || isSubagentChatUri(channel)) {
			return;
		}
		// Usage reported with no active turn carries an empty turn id (see
		// `CopilotAgentSession._turnId`). No turn can ever match it, and no
		// prune path can remove it, so it would be a permanent orphan row.
		if (!action.turnId) {
			return;
		}
		// Agents key their storage by the chat's own URI, which is where the
		// `turns` rows that `getTurnUsages` joins against live.
		const storage = chatStorageUri(channel);
		if (!storage) {
			return;
		}
		let ref: IReference<ISessionDatabase>;
		try {
			ref = this._options.sessionDataService.openDatabase(storage);
		} catch (err) {
			this._logService.warn(`[AgentSideEffects] Failed to open database to persist turn usage for ${channel}`, err);
			return;
		}
		ref.object.setTurnUsage(action.turnId, JSON.stringify(action.usage)).catch(err => {
			this._logService.warn(`[AgentSideEffects] Failed to persist turn usage for ${channel}/${action.turnId}`, err);
		}).finally(() => ref.dispose());
	}

	private _persistChatDraft(channel: ProtocolURI, draft: Message | undefined): void {
		if (!isAhpChatChannel(channel)) {
			return;
		}

		const parsed = parseChatUri(channel);
		if (!parsed) {
			return;
		}

		const session = URI.parse(parsed.session);
		const ref = this._options.sessionDataService.openDatabase(session);
		ref.object.setChatDraft(URI.parse(channel), draft).catch(err => {
			this._logService.warn(`[AgentSideEffects] Failed to persist chat draft for ${channel.toString()}`, err);
		}).finally(() => {
			ref.dispose();
		});
	}

	/**
	 * Pushes the current pending message state from the chat to the agent.
	 * The server controls queued message consumption; only steering messages
	 * are forwarded to the agent for mid-turn injection.
	 */
	private _syncPendingMessages(chatChannel: ProtocolURI): void {
		const sessionChannel = parseRequiredSessionUriFromChatUri(chatChannel);
		const state = this._stateManager.getSessionState(chatChannel);
		if (!state) {
			return;
		}
		const agent = this._options.getAgent(sessionChannel);
		agent?.setPendingMessages?.(
			URI.parse(chatChannel),
			state.steeringMessage,
			[],
		);

		// Steering message removal is now dispatched by the agent
		// via the 'steering_consumed' progress event once the message
		// has actually been sent to the model.

		// If the session is idle, try to consume the next queued message
		this._tryConsumeNextQueuedMessage(chatChannel);
	}

	/**
	 * Consumes the next queued message by dispatching a server-initiated
	 * `ChatTurnStarted` action with `queuedMessageId` set. The reducer
	 * atomically creates the active turn and removes the message from the
	 * queue. Only consumes one message at a time; subsequent messages are
	 * consumed when the next `idle` event fires.
	 */
	private _tryConsumeNextQueuedMessage(session: ProtocolURI): void {
		const sessionChannel = parseRequiredSessionUriFromChatUri(session);
		// Bail if there's already an active turn
		if (this._stateManager.getActiveTurnId(session)) {
			return;
		}
		const state = this._stateManager.getSessionState(session);
		if (!state?.queuedMessages?.length || state.steeringMessage) {
			return;
		}

		const msg = state.queuedMessages[0];
		const sender = this._queuedMessageSenders.get(session, msg.id) ?? {
			clientId: undefined,
			clientContext: {
				...createUnknownAgentHostClientTelemetryContext(AgentHostClientType.Unknown),
				hostLaunchKind: this._options.hostLaunchKind ?? AgentHostLaunchKind.Unknown,
			},
		};
		this._queuedMessageSenders.delete(session, msg.id);
		const turnId = generateUuid();

		// Per-turn streaming part tracking is owned by the agent (reset
		// inside its `send()` call), so no host-side reset is needed.

		// Dispatch server-initiated turn start; the reducer removes the queued message atomically
		this._stateManager.dispatchServerAction(session, {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: new Date().toISOString(),
			message: msg.message,
			queuedMessageId: msg.id,
		});
		const turnStopWatch = StopWatch.create(false);

		// Generic host commands (`/rename`, `!command`, …) are intercepted by
		// the local-command dispatcher (see the ChatTurnStarted handler) and
		// must not reach the agent SDK even when queued.
		const handled = this._localCommands.tryHandle({ turnChannel: session, turnId, text: msg.message.text });
		if (handled) {
			// A local command may suggest a provisional title (e.g. a `!command`
			// dequeued before any real request has titled the session).
			if (handled.suggestedTitle !== undefined) {
				this._titleController.seedProvisionalTitle(sessionChannel, handled.suggestedTitle, session);
			}
			return;
		}

		this._titleController.seedTitleFromFirstMessage(sessionChannel, msg.message.text, session);

		// Send the message to the agent backend. When `session` is an
		// additional chat channel, the SDK chat is owned by the
		// parent session: look up the provider by the parent session URI and
		// pass the chat channel so the harness routes to the right peer chat.
		const agent = this._options.getAgent(sessionChannel);
		if (!agent) {
			this._stateManager.dispatchServerAction(session, {
				type: ActionType.ChatError,
				turnId,
				duration: this._turnDuration(turnStopWatch),
				error: { errorType: 'noAgent', message: 'No agent found for session' },
			});
			return;
		}
		const attachments = msg.message.attachments;
		const queuedState = this._stateManager.getSessionState(session);
		this._telemetryReporter.userMessageSent(agent.id, sender.clientId, sender.clientContext, session, turnId, queuedState, 'queued', attachments);
		const { model, modelTelemetryKind, modelSelectionKind, permissionLevel, interactionMode } = this._getTurnTelemetryContext(agent, session, this._chatContext(sessionChannel, session), queuedState, msg.message.model?.id);
		this._turnTracker.turnStarted(agent.id, session, turnId, model, modelTelemetryKind, modelSelectionKind, permissionLevel, interactionMode, sender.clientContext);
		// Selection travels on the queued message; it is applied before sending.
		void this._sendTurnMessage({
			agent,
			sessionChannel,
			turnChannel: session,
			chat: session,
			message: msg.message,
			turnId,
			senderClientId: sender.clientId,
			clientContext: sender.clientContext,
			turnStopWatch,
		});
	}


	private _getTurnTelemetryContext(agent: IAgent, chat: ProtocolURI, context: IAgentChatContext, state: SessionState | undefined, modelId: string | undefined): { model: string | undefined; modelTelemetryKind: AgentHostModelTelemetryKind | undefined; modelSelectionKind: 'default' | 'auto' | 'explicit'; permissionLevel: string | undefined; interactionMode: SessionMode | undefined } {
		const permissionValue = state?.config?.values[SessionConfigKey.AutoApprove];
		const permissionLevel = typeof permissionValue === 'string' ? permissionValue : undefined;
		const interactionMode = getConfiguredSessionMode(state?.config);
		const modelSelectionKind = modelId === undefined ? 'default' : modelId === 'auto' ? 'auto' : 'explicit';
		const effectiveModelId = modelId ?? agent.chats.getModel?.(URI.parse(chat), context)?.id;
		const modelContext = effectiveModelId === undefined || (modelId === undefined && effectiveModelId === 'auto')
			? { model: undefined, modelTelemetryKind: undefined }
			: this._getModelTelemetryContext(agent, effectiveModelId);
		return { ...modelContext, modelSelectionKind, permissionLevel, interactionMode };
	}

	private _getModelTelemetryContext(agent: IAgent, modelId: string): { model: string; modelTelemetryKind: AgentHostModelTelemetryKind } {
		const model = agent.models.get().find(model => model.id === modelId);
		let modelTelemetryKind: AgentHostModelTelemetryKind;
		if (modelId === 'auto') {
			modelTelemetryKind = 'trusted';
		} else if (model === undefined) {
			modelTelemetryKind = 'unknown';
		} else {
			modelTelemetryKind = readAgentModelByokIdentifier(model) === undefined ? 'trusted' : 'byok';
		}
		return { model: modelId, modelTelemetryKind };
	}

	/**
	 * Applies a turn message's model/agent selection (see
	 * {@link _applyMessageSelection}) and forwards it to the agent's
	 * `sendMessage`. A rejected send is wired to fail the turn: it logs,
	 * dispatches {@link ActionType.ChatError} on the turn channel, and marks the
	 * turn errored.
	 */
	private async _sendTurnMessage(options: {
		agent: IAgent;
		/** The agent/session URI the chat lives on (the send target). */
		sessionChannel: ProtocolURI;
		/** The channel the turn runs on — where `ChatError` / turn completion are reported. */
		turnChannel: ProtocolURI;
		/** Chat channel URI the turn targets. */
		chat: ProtocolURI;
		message: Message;
		turnId: string;
		senderClientId: string | undefined;
		clientContext: IAgentHostClientTelemetryContext;
		turnStopWatch: StopWatch;
	}): Promise<void> {
		const { agent, sessionChannel, turnChannel, chat, message, turnId, senderClientId, clientContext, turnStopWatch } = options;

		// Read-only chats reject user-dispatched turns. `interactivity` is the
		// general signal (e.g. subagent worker chats are `ReadOnly`), and an
		// archived session downgrades its interactive chats to read-only too — so
		// enforce off the chat's effective interactivity rather than special-casing
		// archived. This is the enforcement behind the UI hiding the composer, so a
		// buggy or remote client cannot run work in a read-only or archived session
		// (which may no longer have its isolated worktree on disk).
		const chatState = this._stateManager.getChatState(chat);
		const sessionStatus = this._stateManager.getSessionSummary(options.sessionChannel)?.status ?? 0;
		const sessionArchived = (sessionStatus & SessionStatus.IsArchived) === SessionStatus.IsArchived;
		if (isChatReadOnly(chatState?.interactivity, sessionArchived)) {
			const error = sessionArchived
				? { errorType: 'archived', message: 'This session is archived and read-only. Restore the session to continue the conversation.' }
				: { errorType: 'readOnly', message: 'This chat is read-only.' };
			this._logService.warn(`[AgentSideEffects] Rejecting turn on read-only chat=${chat} (archived=${sessionArchived}), turnId=${turnId}`);
			this._stateManager.dispatchServerAction(turnChannel, {
				type: ActionType.ChatError,
				turnId,
				duration: this._turnDuration(turnStopWatch),
				error,
			});
			this._completeTurn(turnChannel, turnId, 'error', { stage: 'validation', error });
			this._toolCallTracker.clearSession(turnChannel);
			return;
		}

		const chatUri = URI.parse(chat);

		let failureStage: AgentHostTurnFailureStage = 'workingDirectory';
		try {
			this._turnTracker.setCurrentStage(turnChannel, turnId, failureStage);
			// Host-owned working-directory resolution: resolve the session's working
			// directory before the agent materializes, so the agent runs in it
			// without ever knowing how it was derived. Returns the created worktree
			// for worktree sessions (created here on the first send) or the picked
			// folder for folder sessions; undefined for workspace-less sessions.
			const resolvedWorkingDirectories = await this._options.resolveWorkingDirectoryBeforeSend?.({ session: options.sessionChannel, chat, turnId, prompt: message.text });
			const chatContext = this._chatContext(options.sessionChannel, chat);
			const clientOperationContext = { ...chatContext, clientTelemetryContext: clientContext };

			const selectionUpdates: Promise<void>[] = [];
			this._turnTracker.setCurrentStage(turnChannel, turnId, 'modelSelection');
			if (message.model) {
				failureStage = 'modelSelection';
				selectionUpdates.push(agent.chats.changeModel(chatUri, message.model, clientOperationContext));
			}
			selectionUpdates.push(agent.chats.changeAgent(chatUri, message.agent, clientOperationContext).catch(err => {
				this._logService.error('[AgentSideEffects] changeAgent failed', err);
			}));

			await Promise.all(selectionUpdates);

			failureStage = 'sendMessage';
			this._turnTracker.setCurrentStage(turnChannel, turnId, failureStage);
			const resolvedAttachments = await this._resolveChatAttachments(message.attachments);
			const renameInstruction = await this._titleController.prepareInstructionForAgent(sessionChannel, chat);
			const hostInstructions = [
				...(this._agentConfigService.getRootValue(platformRootSchema, AgentHostMarkdownPlanRichLinksEnabledConfigKey)
					? [createMarkdownPlanRichLinksInstruction(chat)]
					: []),
				...(renameInstruction ? [renameInstruction] : []),
			];
			const sendContext = { ...clientOperationContext, ...(hostInstructions.length ? { hostInstructions } : {}) };
			if (this._cancelledTurnIds.get(turnChannel)?.has(turnId)) { return; }
			await this._checkpointService.captureTurnStartCheckpoint(URI.parse(sessionChannel), chatUri, turnId, resolvedWorkingDirectories);
			if (this._cancelledTurnIds.get(turnChannel)?.has(turnId)) {
				await this._checkpointService.discardTurnStartCheckpoint(URI.parse(sessionChannel), chatUri, turnId);
				return;
			}
			this._turnTracker.setCurrentStage(turnChannel, turnId, 'provider');
			await agent.chats.sendMessage(chatUri, message.text, resolvedWorkingDirectories, resolvedAttachments, turnId, senderClientId, clientContext.clientType, sendContext);
		} catch (err) {
			const failure = buildTurnFailure(failureStage, err);
			const error = failure.error;
			this._logService.error(`[AgentSideEffects] ${failureStage} failed for session=${turnChannel}: code=${failure.errorCode}, message=${error.message}, type=${failure.errorName}`, err);
			this._stateManager.dispatchServerAction(turnChannel, {
				type: ActionType.ChatError,
				turnId,
				duration: this._turnDuration(turnStopWatch),
				error,
			});
			this._completeTurn(turnChannel, turnId, 'error', failure);
			this._toolCallTracker.clearSession(turnChannel);
			this._failSessionCreationIfStillCreating(sessionChannel, error);
		}
	}

	private async _resolveChatAttachments(attachments: readonly MessageAttachment[] | undefined): Promise<readonly MessageAttachment[] | undefined> {
		if (!attachments?.some(attachment => attachment.type === MessageAttachmentKind.Chat)) {
			return attachments;
		}
		return Promise.all(attachments.map(async attachment => {
			if (attachment.type !== MessageAttachmentKind.Chat) {
				return attachment;
			}
			// An `agent-host-session://` link that identifies the referenced chat.
			// The default chat is addressed by its session (no chat id); peer chats
			// carry their chat id so the link opens that specific chat. A resource
			// that cannot be mapped to a link yields a pointer that names the chat
			// by its raw resource instead — a bad reference must never fail the
			// user's turn.
			const openLink = buildOpenSessionLinkForChatResource(attachment.resource);
			// A cross-session reference may point at a chat this host never
			// subscribed to; restoring it can throw when no provider owns it or
			// the backend no longer has it. A stale reference must not fail the
			// user's whole turn, so an unresolvable source (`undefined`) degrades
			// to a pointer without an excerpt and drops the `endTurn` pin — the
			// empty transcript would otherwise trip endTurn validation.
			const sourceTurns = await this._resolveChatAttachmentSourceTurns(attachment.resource);
			if (sourceTurns === undefined) {
				return resolveChatAttachment({ ...attachment, endTurn: undefined }, [], openLink);
			}
			const sourceState = resolveChatStateForUri(this._stateManager, attachment.resource);
			if (attachment.endTurn !== undefined && sourceState?.activeTurn?.id === attachment.endTurn) {
				throw new Error(`Chat attachment endTurn must reference a completed turn: ${attachment.resource}#${attachment.endTurn}`);
			}
			return resolveChatAttachment(attachment, sourceTurns, openLink);
		}));
	}

	/**
	 * Resolves the referenced chat's turns, returning `undefined` when the source
	 * is unresolvable — e.g. a cross-session reference to a chat this host never
	 * subscribed to and cannot restore (the resolver throws
	 * `ProtocolError(AHP_SESSION_NOT_FOUND)` when no provider owns it or the
	 * backend no longer has it). Such failures are logged rather than rethrown so
	 * a stale reference degrades gracefully instead of failing the user's turn.
	 */
	private async _resolveChatAttachmentSourceTurns(resource: ProtocolURI): Promise<readonly Turn[] | undefined> {
		try {
			if (this._options.resolveChatAttachmentTurns) {
				return await this._options.resolveChatAttachmentTurns(resource);
			}
			return resolveChatStateForUri(this._stateManager, resource)?.turns ?? [];
		} catch (err) {
			this._logService.warn(`[AgentSideEffects] Unable to resolve chat attachment source ${resource}; degrading to a pointer without an excerpt`, err);
			return undefined;
		}
	}

	/**
	 * Surfaces a failed first turn on a not-yet-materialized session as a
	 * terminal creation failure.
	 *
	 * Provisional sessions defer both their root-catalog `SessionAdded`
	 * notification and their `Creating -> Ready` lifecycle transition until the
	 * agent materializes them (worktree setup, SDK session init, …) on the
	 * first `sendMessage`. When that first send rejects — e.g. worktree/branch
	 * creation throws — the session never entered the catalog and its lifecycle
	 * is stuck at `Creating`, so clients that optimistically rendered it as
	 * in-progress keep spinning forever.
	 *
	 * When the failing session is still `Creating`, dispatch
	 * {@link ActionType.SessionCreationFailed} to move it to a terminal
	 * `CreationFailed` lifecycle, then announce its catalog entry via
	 * {@link AgentHostStateManager.markSessionPersisted}. The summary's status
	 * was already aggregated to `Error` by the preceding `ChatError` dispatch,
	 * so subscribers render the session as failed immediately rather than
	 * waiting on a client-side timeout. The provisional session survives on the
	 * agent, so resending re-attempts materialization.
	 */
	private _failSessionCreationIfStillCreating(sessionChannel: ProtocolURI, error: ErrorInfo): void {
		const state = this._stateManager.getSessionState(sessionChannel);
		if (state?.lifecycle !== SessionLifecycle.Creating) {
			return;
		}
		this._stateManager.dispatchServerAction(sessionChannel, {
			type: ActionType.SessionCreationFailed,
			error,
		});
		const summary = this._stateManager.getSessionSummary(sessionChannel);
		if (summary) {
			this._stateManager.markSessionPersisted(sessionChannel, summary);
		}
	}


	override dispose(): void {
		this._toolCallAgents.clear();
		this._managedApprovalToolCalls.clear();
		this._toolCallTracker.clear();
		this._inputRequestTracker.clear();
		super.dispose();
	}
}

/**
 * Builds the {@link ErrorInfo} for a failed `sendMessage` rejection. When the
 * rejection text carries a `VSCODE_PROXY_ERROR` marker (embedded by a model
 * proxy and echoed back through the agent SDK), the decoded structured chat
 * error is attached to `_meta.chatError` so core can render a rich, localized
 * message. Otherwise the raw error message is used as-is.
 */
function buildTurnFailure(stage: AgentHostTurnFailureStage, err: unknown): IAgentHostTurnFailure {
	const error = buildTurnFailureError(stage, err);
	return {
		stage,
		error,
		errorName: err instanceof Error ? err.name : typeof err,
		errorCode: getErrorCode(err),
		errorStack: err instanceof Error ? err.stack : undefined,
	};
}

function buildTurnFailureError(stage: AgentHostTurnFailureStage, err: unknown): ErrorInfo {
	const message = String(err);
	const forwarded = tryParseForwardedChatError(err instanceof Error ? err.message : message);
	const errorType = stage === 'modelSelection' ? 'modelSelectionFailed'
		: stage === 'workingDirectory' ? 'workingDirectoryFailed' : 'sendFailed';
	if (forwarded) {
		return { errorType, message: stripProxyErrorMarker(message), _meta: toChatErrorMeta(forwarded) };
	}
	return { errorType, message };
}
