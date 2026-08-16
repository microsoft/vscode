/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpSdkServerConfigWithInstance, OnElicitation, Options, PermissionMode, SDKUserMessage, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Sequencer } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { ISyncedCustomization } from '../../common/agentPluginManager.js';
import { ClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { ClaudeRuntimeEffortLevel, toRuntimeEffortLevel, resolveClaudeEffort } from '../../common/claudeModelConfig.js';
import { AgentSignal, IAgentSessionProjectInfo } from '../../common/agent.js';
import type { IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { areAdditionalWorkingDirectoriesEqual, areSessionWorkingDirectoriesEqual } from '../../common/state/sessionWorkingDirectories.js';
import { PendingMessage, ChatInputAnswer, ChatInputRequest, ChatInputResponseKind, ToolCallContributorKind, ToolCallPendingConfirmationState, type AgentSelection, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import type { ClientPluginCustomization, CustomizationEnablement } from '../../common/state/protocol/channels-session/state.js';
import { CustomizationType, parseRequiredSessionUriFromChatUri, type Customization, type ToolCallResult } from '../../common/state/sessionState.js';
import { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { buildClientMcpServers, buildOptions } from './claudeSdkOptions.js';
import { claudeTransportForProvider, parseClaudeModelSelection, toClaudeSdkModelId } from './claudeModelSelection.js';
import { buildServerToolMcpServer, CLAUDE_SERVER_TOOL_MCP_SERVER_NAME, serverToolAllowList } from './claudeServerToolMcpServer.js';
import { convertToolCallResult } from './clientTools/claudeClientToolResult.js';
import { readClaudePermissionMode } from './claudeSessionPermissionMode.js';
import { SessionClientToolsDiff } from './clientTools/claudeSessionClientToolsModel.js';
import { SessionClientCustomizationsDiff } from './customizations/claudeSessionClientCustomizationsModel.js';
import { ClaudeCustomizationWatcher, buildDiscoveredCustomizations, resolveClaudeAgentName } from './customizations/claudeSessionCustomizationDiscovery.js';
import { applyMcpServerEnablement, findMcpChildId, findMcpServerName } from '../shared/mcpCustomizationController.js';
import { scanClaudeHooks } from './customizations/scan/claudeHookScan.js';
import { scanClaudeMcpServers } from './customizations/scan/claudeMcpScan.js';
import { IAgentHostCustomizationEnablementService } from '../agentHostCustomizationEnablementService.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { isCustomizationEnabled } from '../../common/customizationEnablement.js';
import { scanClaudeRules } from './customizations/scan/claudeRuleScan.js';
import { discoverClaudeMultiRootCustomizations } from './customizations/claudeMultiRootCustomizationDiscovery.js';
import { resolvePromptToContentBlocks } from './claudePromptResolver.js';
import type { ClaudeTransport } from './claudeProxyService.js';
import { ClaudeSdkPipeline, IRematerializer, type ISdkResolvedCustomizations } from './claudeSdkPipeline.js';
import { SubagentRegistry } from './claudeSubagentRegistry.js';
import { ClaudePermissionKind } from './claudeToolDisplay.js';
import { getSdkMcpServerEnablement, isCustomizationSdkEligible, resolveCustomizationEnablement } from '../shared/customizationEnablementGate.js';

// Re-export for callers that import IRematerializer from the session.
export type { IRematerializer } from './claudeSdkPipeline.js';

/**
 * Inputs to {@link ClaudeAgentSession.materialize}. Carries the
 * agent-supplied dependencies that the session itself does not own
 * (proxy auth, the `canUseTool` closure that bridges back to the
 * agent's per-session lookup, and the resume-vs-fresh discriminator).
 */
export interface IMaterializeContext {
	/**
	 * Transport (proxy vs native) the agent resolved for this session's
	 * provisional model, pinned here at materialize. The agent owns transport
	 * resolution (it holds the live proxy handle and the host default mode); the
	 * session only consumes the value and never calls back to re-resolve. A later
	 * per-session provider switch is pushed in separately through
	 * {@link ClaudeAgentSession.send}'s `switchTransport`.
	 */
	readonly transport: ClaudeTransport;
	readonly canUseTool: NonNullable<Options['canUseTool']>;
	readonly onElicitation: OnElicitation;
	readonly isResume: boolean;
	/**
	 * Host-supplied concrete persistence/config resource for this materialize
	 * operation. Used transiently; the session never derives it from URI shape.
	 */
	readonly resource: URI;
	readonly configResource: URI;
	readonly customizations?: readonly Customization[];
	/**
	 * Working directory the host resolved for this session's first send (e.g. an
	 * isolated worktree). When present it becomes the session's
	 * {@link ClaudeAgentSession.workingDirectory}, overriding the
	 * {@link ClaudeAgentSession.workspace} the session was based on. Omitted when
	 * the session works directly in its `workspace` (folder / workspace-less).
	 */
	readonly workingDirectory?: URI;
	/**
	 * The full ordered working-directory set the host resolved for this session's
	 * first send (index 0 = the resolved process root, e.g. a worktree; 1..N =
	 * additional directories). When present it replaces both the primary
	 * ({@link workingDirectory}) and the session's additional-directory tail.
	 * Takes precedence over {@link workingDirectory}; the latter is kept for
	 * single-root callers that only resolve the primary. Omitted when the host
	 * did not resolve a set (folder / workspace-less single-root sessions).
	 */
	readonly workingDirectories?: readonly URI[];
	/**
	 * Agent host's server-tool host. When present, the session exposes the
	 * agent host's server tools (feedback "comments" today, more in the future)
	 * as an in-process MCP server and advertises them as server tools. Omitted
	 * by providers that don't support server-side tools.
	 */
	readonly serverToolHost?: IAgentServerToolHost;
}

function resolveCurrentPermissionMode(
	configurationService: IAgentConfigurationService,
	resource: URI,
	inheritedPermissionMode: ClaudePermissionMode | undefined,
	permissionModeFallback: ClaudePermissionMode,
): ClaudePermissionMode {
	return readClaudePermissionMode(configurationService, resource) ?? inheritedPermissionMode ?? permissionModeFallback;
}

/**
 * Per-SDK-conversation coordinator. Owns:
 *   • SDK identity, exact chat channel, workspace, and working directories.
 *   • The {@link ClaudeSdkPipeline} that drives the SDK Query lifecycle
 *     and emits every {@link AgentSignal} for this session (router-
 *     mapped per-message signals plus `ChatTurnComplete` and
 *     `steering_consumed`).
 *   • Pending-permission and pending-user-input registries (Phase 7),
 *     surfaced via `requestPermission` / `requestUserInput`.
 */
export class ClaudeAgentSession extends Disposable {
	private _hostInstructions: readonly string[] | undefined;

	private _pipeline: ClaudeSdkPipeline | undefined;
	private _chatChannelUri: URI;
	private readonly _mcpEnablementSequencer = new Sequencer();
	private _lastReconciledMcpEnablement: ReadonlyMap<string, boolean> | undefined;

	get chatChannelUri(): URI {
		return this._chatChannelUri;
	}

	private get _configurationResource(): URI {
		return URI.parse(parseRequiredSessionUriFromChatUri(this._chatChannelUri.toString()));
	}

	bindChatChannel(chatChannelUri: URI): void {
		if (this.isPipelineReady && this._chatChannelUri.toString() !== chatChannelUri.toString()) {
			throw new Error(`Cannot rebind materialized Claude session ${this.sessionId}`);
		}
		this._chatChannelUri = chatChannelUri;
	}

	private _hostCustomizations: readonly Customization[] = [];

	/** Pre-materialize model selection. Mutable; flows into `Options.model` on first installPipeline. */
	private _provisionalModel: ModelSelection | undefined;
	/**
	 * Pre-materialize custom-agent selection. Mutable; flows into
	 * `Options.agent` (resolved to the SDK agent name) on materialize
	 * and on every rematerializer call. Mid-session changes via
	 * {@link setAgent} flip {@link clientCustomizationsDiff} dirty so the
	 * next `send()` rebinds and the new agent reaches the SDK on the
	 * rebuilt `Query`. The SDK's `Options.agent` is captured at startup
	 * — there is no runtime control-plane equivalent.
	 */
	private _provisionalAgent: AgentSelection | undefined;
	/** Pre-materialize `IAgentCreateChatOptions.config` bag. Read at materialize time. */
	readonly provisionalConfig: Record<string, unknown> | undefined;
	/** Resolved project metadata captured at create time (if any). */
	readonly project: IAgentSessionProjectInfo | undefined;
	/** Always-present abort controller; wired into `Options.abortController` at materialize time. */
	readonly abortController: AbortController;

	/**
	 * The actual directory work is done in. Defaults to {@link workspace} until
	 * the host hands the session a resolved working directory (e.g. an isolated
	 * worktree) at {@link materialize} time. `undefined` only when the session is
	 * workspace-less and has no resolved directory yet.
	 */
	get workingDirectory(): URI | undefined {
		return this._workingDirectory ?? this.workspace;
	}
	private _workingDirectory: URI | undefined;

	/**
	 * The additional (non-primary) working directories this session's agent is
	 * granted tool access to, in order (they follow index 0 = the primary
	 * {@link workingDirectory}). Workspace-folder reconciliation can replace
	 * this tail; the applied snapshot advances only after the rebuilt query and
	 * its cold-resume metadata both succeed.
	 */
	private _desiredAdditionalDirectories: readonly URI[];
	private _appliedAdditionalDirectories: readonly URI[];

	/**
	 * The full ordered working-directory set (index 0 = primary, 1..N =
	 * desired additional roots). `undefined` only when the session has no
	 * resolved primary yet (workspace-less, pre-materialize).
	 */
	get workingDirectories(): readonly URI[] | undefined {
		const primary = this.workingDirectory;
		return primary ? [primary, ...this._desiredAdditionalDirectories] : undefined;
	}
	private readonly _customizationWatcher = this._register(new MutableDisposable<DisposableStore>());

	/** Exposed for the materializer's MCP-server build closure. */
	get pendingClientToolCalls(): PendingRequestRegistry<CallToolResult> { return this._pendingClientToolCalls; }
	/** Snapshot of permission-mode fallback used when live read is undefined. */
	get permissionModeFallback(): ClaudePermissionMode { return this._permissionModeFallback; }
	private _inheritedPermissionMode: ClaudePermissionMode | undefined;

	static createProvisional(
		sessionId: string,
		chatChannelUri: URI,
		workspace: URI | undefined,
		project: IAgentSessionProjectInfo | undefined,
		model: ModelSelection | undefined,
		agent: AgentSelection | undefined,
		config: Record<string, unknown> | undefined,
		pendingClientToolCalls: PendingRequestRegistry<CallToolResult>,
		permissionModeFallback: ClaudePermissionMode,
		instantiationService: IInstantiationService,
		additionalDirectories: readonly URI[] = [],
	): ClaudeAgentSession {
		return instantiationService.createInstance(
			ClaudeAgentSession,
			sessionId,
			chatChannelUri,
			workspace,
			project,
			model,
			agent,
			config,
			new AbortController(),
			pendingClientToolCalls,
			new SessionClientToolsDiff(),
			permissionModeFallback,
			additionalDirectories,
		);
	}

	/**
	 * Phase 12 — per-session registry of Task tool calls that spawn
	 * subagents (`SubagentSpawn` records keyed by `tool_use_id`, plus a
	 * reverse index from inner `tool_use_id` to its parent Task). Owned
	 * here so the registry dies with the session; consumers in the live
	 * mapper (`ClaudeSdkMessageRouter` / `claudeMapSessionEvents` /
	 * `claudeSubagentSignals`) and the `canUseTool` bridge read from
	 * the same instance via the session.
	 */
	readonly subagents: SubagentRegistry = this._register(new SubagentRegistry());

	/**
	 * Phase 7 / S3.2. Tool-permission deferreds parked inside
	 * {@link Options.canUseTool}. Keyed by SDK `tool_use_id`.
	 */
	private readonly _pendingPermissions = new PendingRequestRegistry<boolean>();

	/**
	 * Phase 7 / S3.2. User-input deferreds parked for interactive tools
	 * (`AskUserQuestion`, `ExitPlanMode`). Keyed by `ChatInputRequest.id`.
	 */
	private readonly _pendingUserInputs = new PendingRequestRegistry<{ response: ChatInputResponseKind; answers?: Record<string, ChatInputAnswer> }>();

	/**
	 * Phase 10 — owns the workbench-registered client-tool snapshot
	 * (via {@link SessionClientToolsDiff.model}) plus the
	 * "changed since last successful build" dirty bit. Read by the
	 * agent's sendMessage diff check; used by the materialize /
	 * rematerializer flow to pin the SDK build against a specific
	 * snapshot. See {@link SessionClientToolsDiff} for the C6 race
	 * semantics this collaborator enforces.
	 */
	readonly toolDiff: SessionClientToolsDiff;

	/**
	 * Phase 11 — per-session **client-pushed** synced customization
	 * snapshot + enablement map. Owns the workbench-supplied
	 * {@link ISyncedCustomization} list, the per-URI enablement bits,
	 * and the dirty flag drained at the next {@link send} pre-flight.
	 * Exists from `createProvisional` onward so client-side reads /
	 * toggles work uniformly before and after materialize.
	 *
	 * Server-side (SDK-discovered) customizations are NOT stored here
	 * — they're fetched on demand from the live `Query` in
	 * {@link getSessionCustomizations}.
	 *
	 * See {@link SessionClientCustomizationsDiff}.
	 */
	readonly clientCustomizationsDiff: SessionClientCustomizationsDiff = this._register(new SessionClientCustomizationsDiff());

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidSessionProgress: Event<AgentSignal> = this._onDidSessionProgress.event;

	/**
	 * Real Copilot credits (in nano-AIU) billed by CAPI for the current
	 * turn, summed across every `/v1/messages` request the SDK made
	 * (including subagents). Fed by {@link recordTurnCredits} from the
	 * proxy's `onDidReportCredits`, reset at the start of each {@link send},
	 * and attached to the turn's `ChatUsage` signal by
	 * {@link _enrichSignalWithCredits}. Unlike the SDK's `total_cost_usd`
	 * (an Anthropic-list-price estimate), this is what CAPI actually bills.
	 */
	private _currentTurnNanoAiu = 0;

	/**
	 * Transport the session materialized under (Phase 19). Defaults to `proxy`
	 * until {@link materialize} resolves it from {@link IMaterializeContext}.
	 * Gates {@link _enrichSignalWithCredits} so native turns never carry a
	 * Copilot credits overlay (the proxy is the only credit source).
	 */
	private _transportKind: ClaudeTransport['kind'] = 'proxy';

	/**
	 * Set by {@link setModel} when a model change crosses transports (Copilot ↔
	 * native) on an already-materialized session. Rather than hot-swapping the
	 * live subprocess (which stays on the old transport), the switch is deferred:
	 * the flag makes the next {@link send} pre-flight rebind. The agent resolves
	 * the new transport at send time and hands it in via `switchTransport` (kept
	 * in {@link _pendingSwitchTransport}); the rematerializer rebuilds onto it and
	 * clears both on success. A failed rebuild leaves them set so the following
	 * send retries. Exposed via {@link hasPendingTransportSwitch} so the agent
	 * resolves a transport only when one is actually pending.
	 */
	private _pendingTransportSwitch = false;

	/**
	 * The transport the agent resolved for a pending {@link _pendingTransportSwitch},
	 * pushed in through {@link send}'s `switchTransport` at send time (when the
	 * live proxy handle is current and a signed-out proxy switch throws). Consumed
	 * by the next rebuild in preference to {@link _materializedTransport}, then
	 * cleared once the new subprocess is live. `undefined` between the deferring
	 * {@link setModel} and the send that supplies it.
	 */
	private _pendingSwitchTransport: ClaudeTransport | undefined;

	/**
	 * The full transport (kind + any live proxy handle) that backs the current
	 * {@link _transportKind}, captured the last time {@link materialize} or the
	 * rematerializer actually built the subprocess. Ordinary rebuilds (a tool /
	 * customization diff, a resume) reuse it verbatim so a runtime flip of the
	 * host default transport — e.g. a config change or a Copilot sign-in mutating
	 * the agent's live transport mode — never reroutes the live conversation. Only
	 * a deliberate {@link _pendingSwitchTransport} rebuilds onto a freshly
	 * resolved transport; this pin keeps ordinary rebuilds on the transport fixed
	 * at materialize, never re-derived.
	 */
	private _materializedTransport: ClaudeTransport | undefined;

	/**
	 * Accumulate proxy-reported billed credits for the in-flight turn.
	 * Called from {@link ClaudeAgent} for every proxy `onDidReportCredits`
	 * routed to this session. Ignores non-positive / non-finite values.
	 */
	recordTurnCredits(totalNanoAiu: number): void {
		if (Number.isFinite(totalNanoAiu) && totalNanoAiu > 0) {
			this._currentTurnNanoAiu += totalNanoAiu;
		}
	}

	/**
	 * Inject the turn's accumulated Copilot credits into its `ChatUsage`
	 * signal as `_meta.copilotUsage.totalNanoAiu` — the well-known key the
	 * workbench prefers over `_meta.cost` when rendering per-turn credits.
	 * All other signals pass through untouched.
	 */
	private _enrichSignalWithCredits(signal: AgentSignal): AgentSignal {
		if (this._transportKind !== 'proxy' || signal.kind !== 'action' || signal.action.type !== ActionType.ChatUsage || this._currentTurnNanoAiu <= 0) {
			return signal;
		}
		const usage = signal.action.usage;
		return {
			...signal,
			action: {
				...signal.action,
				usage: {
					...usage,
					_meta: {
						...usage._meta,
						copilotUsage: { totalNanoAiu: this._currentTurnNanoAiu },
					},
				},
			},
		};
	}

	/**
	 * Stamps the MCP {@link ToolCallContributor} onto a `ChatToolCallStart` for
	 * an external `mcp__<server>__<tool>` call, resolved from this session's
	 * cached customization snapshot. Owned here because the session owns the
	 * customization data; the stream mapper stays free of it. (The in-process
	 * `mcp__client__` server already carries a Client contributor from the mapper.)
	 */
	private _enrichSignalWithMcpContributor(signal: AgentSignal): AgentSignal {
		if (signal.kind !== 'action' || signal.action.type !== ActionType.ChatToolCallStart || signal.action.contributor !== undefined) {
			return signal;
		}
		const toolName = signal.action.toolName;
		if (!toolName.startsWith('mcp__')) {
			return signal;
		}
		const serverName = toolName.split('__')[1];
		const customizationId = serverName ? findMcpChildId(this._lastCustomizations, serverName) : undefined;
		if (customizationId === undefined) {
			return signal;
		}
		return { ...signal, action: { ...signal.action, contributor: { kind: ToolCallContributorKind.MCP, customizationId } } };
	}

	constructor(
		readonly sessionId: string,
		chatChannelUri: URI,
		readonly workspace: URI | undefined,
		project: IAgentSessionProjectInfo | undefined,
		model: ModelSelection | undefined,
		agent: AgentSelection | undefined,
		config: Record<string, unknown> | undefined,
		abortController: AbortController,
		private readonly _pendingClientToolCalls: PendingRequestRegistry<CallToolResult>,
		toolDiff: SessionClientToolsDiff,
		private readonly _permissionModeFallback: ClaudePermissionMode,
		additionalDirectories: readonly URI[],
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostOTelService private readonly _otelService: IAgentHostOTelService,
		@IClaudeAgentSdkService private readonly _sdkService: IClaudeAgentSdkService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@IAgentHostCustomizationEnablementService private readonly _customizationEnablementService: IAgentHostCustomizationEnablementService,
	) {
		super();
		this._chatChannelUri = chatChannelUri;
		this.project = project;
		this._provisionalModel = model;
		this._provisionalAgent = agent;
		this.provisionalConfig = config;
		this.abortController = abortController;
		this._desiredAdditionalDirectories = additionalDirectories;
		this._appliedAdditionalDirectories = additionalDirectories;
		this._hostCustomizations = [];
		this.toolDiff = this._register(toolDiff);
		this._register(this.clientCustomizationsDiff.onDidChange(() => this._onDidCustomizationsChange.fire()));
		this._register(this._customizationEnablementService.onDidChange(event => {
			if (!event.sessions.includes(this._configurationResource.toString())) {
				return;
			}
			this._onDidCustomizationsChange.fire();
			if (this._pipeline) {
				this._reconcileMcpServerEnablement(true).catch(error => this._logService.error(error, `[Claude:${this.sessionId}] Failed to reconcile MCP enablement after customizations changed`));
			}
		}));

		this._watchCustomizations(this.workingDirectories);
	}

	setHostCustomizations(customizations: readonly Customization[]): void {
		this._hostCustomizations = customizations;
	}

	private _watchCustomizations(directories: readonly URI[] | undefined): void {
		const store = new DisposableStore();
		const watcher = store.add(new ClaudeCustomizationWatcher(
			directories,
			this._environmentService.userHome,
			this._fileService,
			this._logService,
		));
		store.add(watcher.onDidChange(() => this._onDidCustomizationsChange.fire()));
		this._customizationWatcher.value = store;
	}

	/**
	 * One-shot SDK assistant-message uuid that the next materialize / rebuild
	 * resumes *up to and including* (the SDK's `Options.resumeSessionAt`).
	 * Staged by {@link truncateToTurn}; read by the next build and cleared
	 * only once that build *succeeds* (so a thrown / cancelled rebuild keeps
	 * the anchor staged and the next send retries the truncation rather than
	 * silently proceeding without it and undoing the checkpoint restore).
	 */
	private _pendingResumeSessionAt: string | undefined;

	/**
	 * In-place truncation to `turnId` ("Restore Checkpoint"): prune the
	 * per-turn DB rows (file edits, checkpoint refs) past the boundary AND
	 * stage the SDK resume anchor that the next rebuild applies via
	 * `Options.resumeSessionAt`. These two halves are one invariant — pruning
	 * without staging the anchor would drop DB rows while the SDK still
	 * replays the truncated turns; staging without pruning would leave stale
	 * rows — so they live behind a single call rather than two the caller
	 * could half-invoke. The prune runs first because it is the fallible half:
	 * a DB failure then rejects without leaving an anchor staged for the next
	 * turn. `turnId` is the protocol turn id (DB key); `resumeAnchorUuid` is
	 * the SDK assistant-message uuid the agent resolved for it.
	 */
	async truncateToTurn(turnId: string, resumeAnchorUuid: string, resource: URI): Promise<void> {
		await this._withDatabase(resource, db => db.deleteTurnsAfter(turnId));
		this._pendingResumeSessionAt = resumeAnchorUuid;
	}

	/** Prunes all per-turn DB rows (remove-all truncation). */
	async pruneAllTurns(resource: URI): Promise<void> {
		await this._withDatabase(resource, db => db.deleteAllTurns());
	}

	/**
	 * Runs `fn` against a short-lived, ref-counted session DB handle so the
	 * write is safe regardless of the pipeline's own dbRef lifecycle (the
	 * ref-count keeps the shared DB alive; disposing only decrements).
	 */
	private async _withDatabase(resource: URI, fn: (db: ISessionDatabase) => Promise<void>): Promise<void> {
		const ref = this._sessionDataService.openDatabase(resource);
		try {
			await fn(ref.object);
		} finally {
			ref.dispose();
		}
	}

	/**
	 * Bring the session up: build SDK `Options`, start the SDK, open the
	 * session-scoped DB ref, construct the pipeline, and attach the
	 * rematerializer used for yield-restart (e.g. after a client-tool
	 * snapshot change). Idempotent on re-call: extra calls throw rather
	 * than silently re-materialize.
	 *
	 * If the supplied {@link IMaterializeContext.proxyHandle}'s underlying
	 * `abortController` fires while `sdk.startup()` is in flight, the SDK
	 * unwinds via the controller; if `startup` resolves anyway, the
	 * `WarmQuery` is asyncDisposed and a {@link CancellationError} is
	 * thrown (Q8 belt-and-suspenders).
	 */
	async materialize(ctx: IMaterializeContext): Promise<void> {
		if (this._pipeline) {
			throw new Error('ClaudeAgentSession is already materialized');
		}
		await this._customizationEnablementService.initializeSession(this._configurationResource.toString());
		// `ctx.customizations` is the host's last published snapshot for the
		// owning session. Absent means "the host has published none yet", which
		// is not the same as an empty list — keep whatever was already
		// reconciled rather than clearing it.
		if (ctx.customizations) {
			this._hostCustomizations = ctx.customizations;
		}
		// Adopt the host-resolved working directory (e.g. an isolated worktree)
		// before it's read below; falls back to the session's `workspace` when the
		// host didn't resolve a dedicated directory. The plural
		// `workingDirectories` (index 0 = resolved primary, 1..N = additional
		// roots) takes precedence and also refreshes the additional-directory
		// tail; the singular `workingDirectory` stays supported for single-root
		// callers that only resolve the primary.
		const previousWorkingDirectories = this.workingDirectories;
		const resolvedPrimary = ctx.workingDirectories?.[0] ?? ctx.workingDirectory;
		if (resolvedPrimary && !isEqual(resolvedPrimary, this.workingDirectory)) {
			this._workingDirectory = resolvedPrimary;
		}
		if (ctx.workingDirectories && ctx.workingDirectories.length > 0) {
			this._desiredAdditionalDirectories = ctx.workingDirectories.slice(1);
			this._appliedAdditionalDirectories = this._desiredAdditionalDirectories;
		}
		const currentWorkingDirectories = this.workingDirectories;
		// Claude advertises `multipleWorkingDirectories.immutablePrimary`, so its
		// process root is pinned at index 0.
		if (!areSessionWorkingDirectoriesEqual(previousWorkingDirectories, currentWorkingDirectories, true)) {
			this._watchCustomizations(currentWorkingDirectories);
		}
		if (!this.workingDirectory) {
			throw new Error(`Cannot materialize Claude session ${this.sessionId}: workingDirectory is required`);
		}
		this._transportKind = ctx.transport.kind;
		this._materializedTransport = ctx.transport;

		const permissionMode = resolveCurrentPermissionMode(this._configurationService, ctx.configResource, this._inheritedPermissionMode, this._permissionModeFallback);
		const { mcpServers, allowedTools } = await this._buildStartupToolWiring(ctx.resource, ctx.serverToolHost);
		const agentName = await resolveClaudeAgentName(this._provisionalAgent, this._fileService, this._logService, this.sessionId);
		const telemetry = await this._otelService.getNativeSdkTelemetryConfig();
		const traceContext = this._otelService.getSessionTraceContext(this.sessionId, ctx.resource.toString());

		const options = await buildOptions(
			{
				sessionId: this.sessionId,
				workingDirectory: this.workingDirectory,
				additionalDirectories: this._appliedAdditionalDirectories,
				model: this._provisionalModel,
				abortController: this.abortController,
				permissionMode,
				canUseTool: ctx.canUseTool,
				onElicitation: ctx.onElicitation,
				isResume: ctx.isResume,
				resumeSessionAt: this._pendingResumeSessionAt,
				mcpServers,
				allowedTools,
				plugins: this.clientCustomizationsDiff.consume(this._desiredClientPluginPaths()),
				agent: agentName,
				telemetry,
				traceContext,
				getUserPromptAdditionalContext: () => this._hostInstructions?.join('\n\n'),
			},
			ctx.transport,
			data => this._logService.error(`[Claude SDK stderr] ${data}`),
		);

		this._logService.info(`[Claude] session ${this.sessionId}: enableFileCheckpointing=${options.enableFileCheckpointing} isResume=${ctx.isResume}`);

		const warm = await this._sdkService.startup({ options });

		if (this.abortController.signal.aborted) {
			await warm[Symbol.asyncDispose]();
			throw new CancellationError();
		}

		const dbRef = this._sessionDataService.openDatabase(ctx.resource);
		let pipeline: ClaudeSdkPipeline;
		try {
			pipeline = this._register(this._instantiationService.createInstance(
				ClaudeSdkPipeline,
				this.sessionId,
				this._chatChannelUri,
				ctx.resource,
				warm,
				this.abortController,
				dbRef,
				this.subagents,
				(toolName: string) => this.toolDiff.model.ownerOf(toolName),
			));
		} catch (err) {
			dbRef.dispose();
			await warm[Symbol.asyncDispose]();
			throw err;
		}
		this._register(pipeline.onDidProduceSignal(s => this._onDidSessionProgress.fire(this._enrichSignalWithMcpContributor(this._enrichSignalWithCredits(s)))));
		this._pipeline = pipeline;
		this._register(this._configurationService.onDidSessionConfigChange(event => {
			if (!event.origin || event.session !== ctx.configResource.toString()) {
				return;
			}
			const inheritedMode = readClaudePermissionMode(this._configurationService, ctx.configResource);
			const mode = inheritedMode ?? this.permissionModeFallback;
			this.setInheritedPermissionMode(inheritedMode).catch(err => {
				this._logService.warn(`[Claude:${this.sessionId}] mid-turn setPermissionMode(${mode}) failed`, err);
			});
		}));
		// The materialize succeeded with the staged anchor applied to `Options`
		// — clear it now so it isn't re-applied. A throw before this point (e.g.
		// `startup` / pipeline-create) leaves it staged for the next retry.
		this._pendingResumeSessionAt = undefined;

		// Seed the pipeline's bijective config cache so a rebuild re-applies
		// the user's last-chosen model / effort without losing the picker
		// config. Read provisional state directly off the session.
		pipeline.seedCurrentConfig(
			toClaudeSdkModelId(this._provisionalModel),
			toRuntimeEffortLevel(resolveClaudeEffort(this._provisionalModel)),
			permissionMode,
		);

		// Final pre-commit abort gate. The first gate above caught aborts
		// that landed while `sdk.startup()` was in flight; this one catches
		// aborts that landed during the metadata write (a separate async
		// boundary). Without it, a racing teardown could complete
		// before this method returns and leave the pipeline live.
		if (this.abortController.signal.aborted) {
			throw new CancellationError();
		}

		pipeline.attachRematerializer(async (_reason) => {
			const liveMode = resolveCurrentPermissionMode(this._configurationService, ctx.configResource, this._inheritedPermissionMode, this._permissionModeFallback);
			const rebuildAbort = new AbortController();
			let rebuildWarm: WarmQuery | undefined;
			try {
				// Pin the transport: prefer the one the agent staged for a deliberate
				// per-session switch (`_pendingSwitchTransport`, already resolved and
				// validated at `send` — the session only consumes it, never re-resolves),
				// else reuse the transport captured at materialize. Reusing it keeps a
				// runtime host-default flip (config change / Copilot sign-in) from
				// rerouting a live conversation; an SDK-driven recover with nothing staged
				// stays put and re-tries the switch on the next send.
				const rebuildTransport = this._pendingSwitchTransport ?? this._materializedTransport;
				if (!rebuildTransport) {
					// Always set once `materialize` has run; a throwing guard (never a
					// non-null assertion) keeps a rebuild honest rather than crashing on
					// an impossible null.
					throw new Error(`Cannot rebuild Claude session ${this.sessionId}: no transport resolved`);
				}
				const { mcpServers: rebuildMcp, allowedTools: rebuildAllowedTools } = await this._buildStartupToolWiring(ctx.resource, ctx.serverToolHost);
				const rebuildAgentName = await resolveClaudeAgentName(this._provisionalAgent, this._fileService, this._logService, this.sessionId);
				const rebuildOptions = await buildOptions(
					{
						sessionId: this.sessionId,
						workingDirectory: this.workingDirectory!,
						additionalDirectories: this._desiredAdditionalDirectories,
						model: this._provisionalModel,
						abortController: rebuildAbort,
						permissionMode: liveMode,
						canUseTool: ctx.canUseTool,
						onElicitation: ctx.onElicitation,
						isResume: true,
						resumeSessionAt: this._pendingResumeSessionAt,
						mcpServers: rebuildMcp,
						allowedTools: rebuildAllowedTools,
						plugins: this.clientCustomizationsDiff.consume(this._desiredClientPluginPaths()),
						agent: rebuildAgentName,
						telemetry,
						traceContext,
						getUserPromptAdditionalContext: () => this._hostInstructions?.join('\n\n'),
					},
					rebuildTransport,
					data => this._logService.error(`[Claude SDK stderr] ${data}`),
				);
				this._logService.info(`[Claude] session ${this.sessionId}: resume rebuild agent=${rebuildOptions.agent ?? '(none)'}`);
				rebuildWarm = await this._sdkService.startup({ options: rebuildOptions });
				// Rebuild succeeded with the anchor applied — clear it so it
				// isn't re-applied. A throw above keeps it staged (handled in the
				// catch alongside the tool/customization diffs) so the next send
				// retries the truncation instead of dropping the restore.
				this._pendingResumeSessionAt = undefined;
				this._appliedAdditionalDirectories = this._desiredAdditionalDirectories;
				this._watchCustomizations(this.workingDirectories);
				// Commit the (possibly switched) transport now that the new
				// subprocess is live, so credit enrichment tracks the running
				// transport. A throw above leaves everything untouched so the next
				// send retries.
				this._transportKind = rebuildTransport.kind;
				this._materializedTransport = rebuildTransport;
				if (this._pendingSwitchTransport) {
					// Only a rebuild that actually consumed a pushed switch transport
					// resolves the pending switch. An ordinary/SDK-recover rebuild that
					// reused the materialized transport leaves the flag set so the next
					// send still performs the deferred switch.
					this._pendingTransportSwitch = false;
					this._pendingSwitchTransport = undefined;
				}
				return { warm: rebuildWarm, abortController: rebuildAbort };
			} catch (err) {
				rebuildAbort.abort();
				await rebuildWarm?.[Symbol.asyncDispose]();
				this.toolDiff.markDirty();
				this.clientCustomizationsDiff.markDirty();
				throw err;
			}
		});
		await this._reconcileMcpServerEnablement();

		// Advertise the agent host's server tools on this session so the client
		// sees them as server-provided. Execution happens in-process via the
		// server-tool MCP server built in `_buildStartupToolWiring`.
		ctx.serverToolHost?.advertise(ctx.resource.toString());

		// Surface the SDK-resolved customization tier to the workbench.
		// Pre-materialize, getSessionCustomizations returns only the
		// client-pushed slice; firing here prompts the workbench to refetch
		// and pick up the bundled `Discovered in Claude` entry.
		this._onDidCustomizationsChange.fire();
	}

	/**
	 * Build the SDK tool wiring shared by the initial materialize and every
	 * yield-restart rematerialize: the in-process MCP servers plus the
	 * auto-approve allow-list.
	 *
	 * The MCP servers are the workbench client tools (which round-trip to the
	 * workbench) plus, when a server-tool host is wired, the agent host's own
	 * server tools (executed in-process). `mcpServers` is `undefined` when
	 * neither is present so `Options.mcpServers` is omitted entirely and the
	 * SDK keeps its default; `allowedTools` carries the SDK-prefixed server tool
	 * names (so they auto-approve without prompting) and is `undefined` when no
	 * server-tool host is wired.
	 *
	 * Keeping both in one place ensures the two startup paths can never drift,
	 * and that a newly registered server tool is wired everywhere at once.
	 */
	private async _buildStartupToolWiring(
		resource: URI,
		serverToolHost: IAgentServerToolHost | undefined,
	): Promise<{ mcpServers: Record<string, McpSdkServerConfigWithInstance> | undefined; allowedTools: readonly string[] | undefined }> {
		const clientServers = await buildClientMcpServers(this.toolDiff, this._pendingClientToolCalls, this._sdkService);
		const serverToolServer = serverToolHost
			? await buildServerToolMcpServer(serverToolHost, resource.toString(), this._sdkService)
			: undefined;
		const mcpServers = (!clientServers && !serverToolServer)
			? undefined
			: {
				...(clientServers ?? {}),
				...(serverToolServer ? { [CLAUDE_SERVER_TOOL_MCP_SERVER_NAME]: serverToolServer } : {}),
			};
		// Exclude server tools that can require user confirmation from the
		// auto-approve allow-list so the SDK surfaces them via `canUseTool`
		// (the host then decides per call whether to render a confirmation)
		// instead of running them silently. This must use the session-independent
		// answer: the allow-list is baked into the SDK options here and would go
		// stale if a tool were allow-listed while it happened to have nothing to
		// confirm.
		const autoApproveToolNames = serverToolHost
			? serverToolHost.toolNames.filter(name => !serverToolHost.canRequireConfirmation(name))
			: undefined;
		return { mcpServers, allowedTools: autoApproveToolNames ? serverToolAllowList(autoApproveToolNames) : undefined };
	}

	/** True once {@link materialize} has installed the SDK pipeline. */
	get isPipelineReady(): boolean { return this._pipeline !== undefined; }

	/**
	 * Whether this chat currently has a turn in flight or queued. False when
	 * provisional (no pipeline) or idle between turns. Used by non-destructive
	 * idle release to avoid disconnecting mid-turn.
	 */
	get hasActiveTurn(): boolean { return this._pipeline?.hasActiveTurn ?? false; }

	/** Pre-materialize model selection accessor (read by materializer to build Options). */
	get provisionalModel(): ModelSelection | undefined { return this._provisionalModel; }

	/**
	 * Whether a per-session provider switch is staged and awaiting the next
	 * {@link send}. The agent reads this to decide whether to resolve a fresh
	 * transport (it owns the live proxy handle) and push it in via `switchTransport`
	 * — resolving one only when a switch is actually pending, so ordinary sends
	 * never trip the signed-out proxy throw.
	 */
	get hasPendingTransportSwitch(): boolean { return this._pendingTransportSwitch; }

	private _requirePipeline(): ClaudeSdkPipeline {
		if (!this._pipeline) {
			throw new Error('ClaudeAgentSession is not materialized');
		}
		return this._pipeline;
	}

	get isResumed(): boolean { return this._requirePipeline().isResumed; }

	/**
	 * Abort the live SDK subprocess and await its full teardown so the
	 * session id is released. No-op when the session was never materialized
	 * (no subprocess to stop). Used by remove-all truncation before it
	 * recreates a fresh session under the same id — the CLI keeps the id
	 * locked until the old subprocess exits.
	 */
	async shutdownLiveQuery(): Promise<void> {
		await this._pipeline?.shutdownAndWait();
	}

	/**
	 * Seed the pipeline's current + applied config cache from
	 * materialize-time `Options`. The SDK already starts with these
	 * values, so the cache prevents a redundant first `setModel` /
	 * `applyFlagSettings` call.
	 */
	seedBijectiveState(state: { model?: string; effort?: ClaudeRuntimeEffortLevel; permissionMode?: PermissionMode }): void {
		this._requirePipeline().seedCurrentConfig(state.model, state.effort, state.permissionMode);
	}

	attachRematerializer(rematerializer: IRematerializer): void {
		this._requirePipeline().attachRematerializer(rematerializer);
	}

	/**
	 * Send a user prompt. Performs the per-turn pre-flight before
	 * yielding to the pipeline:
	 *
	 * - If {@link toolDiff} or {@link clientCustomizationsDiff} reports the
	 *   live `Query` is out of sync with the workbench's view, yield-restart
	 *   so the SDK picks up the new `Options.mcpServers` / `Options.plugins`.
	 *   `Query.reloadPlugins()` cannot help here — the SDK's plugin URI set
	 *   is captured at startup, so any add / remove / nonce-bump must go
	 *   through a full rebuild. The rebind itself re-applies the live
	 *   `permissionMode` via the rematerializer.
	 * - Otherwise forward the live `permissionMode` to the bound `Query` so
	 *   a `SessionConfigChanged` action that arrived between turns wins.
	 *   The pipeline's bijective cache dedupes a no-op `setPermissionMode`,
	 *   so this is free when nothing changed.
	 *
	 * When {@link hasPendingTransportSwitch} is set, the agent resolves the new
	 * transport (it owns the live proxy handle) and passes it as `switchTransport`.
	 * It is staged for the pre-flight rebuild below, which rebinds the subprocess
	 * onto it. The agent resolves one only when a switch is pending, so ordinary
	 * sends never carry a transport and the session never calls back to re-resolve.
	 *
	 * Model / effort are not threaded through here — the pipeline's current
	 * model / effort (set eagerly via {@link setModel}) is whatever
	 * the SDK has been told.
	 */
	async send(prompt: SDKUserMessage, turnId: string, resource: URI, workingDirectories?: readonly URI[], switchTransport?: ClaudeTransport, hostInstructions?: readonly string[], clientContext?: IAgentHostClientTelemetryContext): Promise<void> {
		const pipeline = this._requirePipeline();
		if (workingDirectories) {
			this._replaceDesiredWorkingDirectories(workingDirectories);
		}
		if (switchTransport) {
			// Stage the agent-resolved transport for the pending switch; the
			// pre-flight rebuild below consumes it (see the rematerializer).
			this._pendingSwitchTransport = switchTransport;
		}
		// New turn: reset the per-turn credit accumulator so proxy reports
		// for this turn's `/v1/messages` calls sum from zero.
		this._currentTurnNanoAiu = 0;
		if (this.toolDiff.hasDifference
			|| this.clientCustomizationsDiff.hasDifferenceFrom(this._desiredClientPluginPaths())
			|| this._pendingResumeSessionAt !== undefined
			|| !areAdditionalWorkingDirectoriesEqual(this._appliedAdditionalDirectories, this._desiredAdditionalDirectories)
			|| this._pendingTransportSwitch) {
			await this._rebindForSyncedState();
		} else {
			await pipeline.setPermissionMode(resolveCurrentPermissionMode(this._configurationService, resource, this._inheritedPermissionMode, this._permissionModeFallback));
		}
		await this._reconcileMcpServerEnablement();
		this._hostInstructions = hostInstructions;
		try {
			await pipeline.send(prompt, turnId, clientContext);
		} finally {
			this._hostInstructions = undefined;
		}
	}

	private _replaceDesiredWorkingDirectories(workingDirectories: readonly URI[]): void {
		const primary = this.workingDirectory;
		if (!primary || !isEqual(primary, workingDirectories[0])) {
			throw new Error(`Cannot change Claude session primary working directory: ${this.sessionId}`);
		}
		const desiredAdditionalDirectories = workingDirectories.slice(1);
		if (areAdditionalWorkingDirectoriesEqual(this._desiredAdditionalDirectories, desiredAdditionalDirectories)) {
			return;
		}
		this._desiredAdditionalDirectories = desiredAdditionalDirectories;
	}

	/**
	 * Single yield-restart that covers both client-tool and
	 * customization divergence in one trip. Drains the parked
	 * client-tool MCP handlers (same as the original tool-only
	 * rebind), then triggers the pipeline rebind — the rematerializer
	 * reads `toolDiff` and reducer-backed client plugin paths while
	 * building the new `Options`, so the bit on each diff clears in
	 * lockstep with the SDK actually receiving the new values. Fires
	 * `_onDidCustomizationsChange` afterwards so the workbench
	 * refetches `getSessionCustomizations` and picks up any newly
	 * resolved server-side entries from the rebuilt `Query`.
	 */
	private async _rebindForSyncedState(): Promise<void> {
		this._pendingClientToolCalls.rejectAll(new CancellationError());
		await this._requirePipeline().rebindForRestart();
		this._onDidCustomizationsChange.fire();
	}

	/**
	 * Cancel the in-flight SDK turn. Mirrors the production reference;
	 * see {@link ClaudeSdkPipeline.abort}. Also denies any parked
	 * permission / user-input requests so the SDK's `canUseTool`
	 * callback (and any interactive tool waiting on user input) unwinds
	 * with a deny / cancel result instead of leaving stale UI behind.
	 */
	abort(): void {
		this._pendingPermissions.denyAll(false);
		this._pendingUserInputs.denyAll({ response: ChatInputResponseKind.Cancel });
		this._requirePipeline().abort();
	}

	/**
	 * Eagerly apply a model change and persist the new selection. Safe to
	 * call before or after materialize:
	 *
	 * - Pre-materialize: stash the model on the session so the first SDK
	 *   startup picks it up via `Options.model` / `Options.effort`.
	 * - Post-materialize: queue the change on the pipeline; the SDK
	 *   applies it on the NEXT user request via
	 *   `Query.setModel` / `Query.applyFlagSettings`. `'max'` flows through
	 *   unchanged — see {@link toRuntimeEffortLevel}.
	 *
	 * Persistence is host-owned; callers update the overlay separately.
	 *
	 * A change that crosses transports (Copilot ↔ native) on a live session
	 * defers to a rebuild on the next {@link send} rather than hot-swapping.
	 */
	async setModel(model: ModelSelection): Promise<void> {
		this._provisionalModel = model;
		// A model change that crosses transports (Copilot ↔ native) on a live
		// session can't hot-swap — the running subprocess is pinned to the old
		// transport. Detect that here and defer to a rebuild on the next `send`.
		// A still-provisional session or a same-transport change resolves to
		// `false`, preserving today's hot-swap exactly.
		// Guard on `explicitProvider`: a bare/legacy id carries no provider of its
		// own and the parser reports the `copilot` fallback, which must NOT
		// masquerade as a native→proxy switch on a native session (mirrors the same
		// guard in `resolveClaudeSessionTransport`). Only a genuinely
		// provider-qualified id can move a live session across transports.
		const parsed = parseClaudeModelSelection(model);
		const crossesTransport =
			this.isPipelineReady &&
			parsed.explicitProvider &&
			claudeTransportForProvider(parsed.provider) !== this._transportKind;
		if (crossesTransport) {
			// Cross-transport switch on a live session: the running subprocess is
			// pinned to the old transport/credential, and pushing the new model onto
			// it may 400 on a model that transport doesn't serve. Flag the switch and
			// skip the hot-swap — the next `send` pre-flight rebuilds on the new
			// transport (conversation preserved via the resume rebuild), and the
			// rematerializer clears the flag once the new subprocess is live.
			this._pendingTransportSwitch = true;
			// Advance the pipeline's DESIRED model/effort (without touching the
			// doomed old-transport Query) so the rebuild's config replay re-asserts
			// THIS selection on the new subprocess. The resume replays the pre-switch
			// `/model`, so skipping this lets the rebuilt subprocess silently revert
			// to the old model on the new transport (→ `model_not_supported`).
			this._pipeline?.bufferConfigForRebind(toClaudeSdkModelId(model), toRuntimeEffortLevel(resolveClaudeEffort(model)));
		} else if (this._pipeline) {
			// A same-transport hot-swap supersedes any still-pending cross-transport
			// switch: the user has now landed on a model the live subprocess can serve,
			// so clear the flag to spare the next `send` a needless full rebuild. The
			// `setModel`/`setEffort` calls below re-assert this selection as the
			// pipeline's desired config, overwriting whatever the deferred path buffered.
			this._pendingTransportSwitch = false;
			// Drop any transport a superseded switch's `send` had already staged, so a
			// later ordinary rebuild can't pick it up and reroute this live session.
			this._pendingSwitchTransport = undefined;
			await this._pipeline.setModel(toClaudeSdkModelId(model));
			// Always push the resolved effort, including `undefined`. Switching
			// to a model that does not support reasoning effort (e.g. Haiku)
			// resolves to `undefined`, which must actively CLEAR any effort the
			// SDK is still applying from a prior effort-capable model — otherwise
			// the next turn replays e.g. `'high'` onto Haiku and the API 400s
			// (`output_config.effort ... does not support reasoning effort`).
			await this._pipeline.setEffort(toRuntimeEffortLevel(resolveClaudeEffort(model)));
		}
	}

	/**
	 * Pre-materialize custom-agent selection accessor.
	 */
	get provisionalAgent(): AgentSelection | undefined { return this._provisionalAgent; }

	/**
	 * Change (or clear with `undefined`) the selected custom agent for this
	 * session. The SDK captures `Options.agent` at startup with no
	 * working runtime control (`applyFlagSettings({ agent })` exists on
	 * the SDK surface but doesn't actually swap the live agent), so
	 * post-materialize calls flip {@link clientCustomizationsDiff}
	 * dirty and the next `send()` pre-flight rebinds with the new agent
	 * baked into the rebuilt `Query`. Persistence is host-owned; callers update
	 * the overlay separately.
	 */
	async setAgent(agent: AgentSelection | undefined): Promise<void> {
		if (this._provisionalAgent === agent) {
			return;
		}
		this._provisionalAgent = agent;
		if (this._pipeline) {
			// Force a rebind on the next send(); the SDK has no working
			// runtime hook to swap the agent in place.
			this.clientCustomizationsDiff.markDirty();
		}
	}

	/**
	 * Inject a steering message. Builds the `priority: 'now'`
	 * {@link SDKUserMessage} and hands it to the pipeline; the pipeline
	 * inherits the parent's turnId (CONTEXT.md M10) and fires
	 * `steering_consumed` when the SDK accepts it. No-op if the pipeline
	 * is aborted.
	 */
	injectSteering(steeringMessage: PendingMessage): void {
		const pipeline = this._requirePipeline();
		if (pipeline.isAborted) {
			return;
		}
		const contentBlocks = resolvePromptToContentBlocks(
			steeringMessage.message.text,
			steeringMessage.message.attachments,
		);
		const sdkMessage: SDKUserMessage = {
			type: 'user',
			message: { role: 'user', content: contentBlocks },
			session_id: this.sessionId,
			parent_tool_use_id: null,
			priority: 'now',
			// Reuse the protocol PendingMessage.id as the SDK uuid — same
			// pattern as `ClaudeAgent.sendMessage` reusing turnId. The SDK's
			// `uuid` field is typed as a branded UUID, but the cast at the
			// boundary is the convention for both code paths.
			uuid: steeringMessage.id as `${string}-${string}-${string}-${string}-${string}`,
		};
		pipeline.injectSteering(sdkMessage, steeringMessage.id);
	}

	/** Live permission-mode change. Forwards to the pipeline; the pipeline remembers it for re-application after a rebind. */
	setPermissionMode(mode: PermissionMode): Promise<void> {
		return this._requirePipeline().setPermissionMode(mode);
	}

	setInheritedPermissionMode(mode: ClaudePermissionMode | undefined): Promise<void> {
		this._inheritedPermissionMode = mode;
		if (!this._pipeline) {
			return Promise.resolve();
		}
		return this._pipeline.setPermissionMode(mode ?? this._permissionModeFallback);
	}

	// #region Phase 7 / S3.2 — pending state

	/**
	 * Atomically register a pending-permission deferred and fire the
	 * `pending_confirmation` signal. The SDK is blocked on the returned
	 * promise inside its `canUseTool` callback until
	 * {@link respondToPermissionRequest} resolves it. Resolves with
	 * `false` if the pipeline is aborted.
	 */
	requestPermission(args: {
		readonly toolUseID: string;
		readonly state: ToolCallPendingConfirmationState;
		readonly permissionKind: ClaudePermissionKind;
		readonly permissionPath?: string;
		/** Phase 12 step 5 — when the confirmation belongs to a subagent context, route it to the subagent session. */
		readonly parentToolCallId?: string;
	}): Promise<boolean> {
		if (!this._pipeline || this._pipeline.isAborted) {
			return Promise.resolve(false);
		}
		return this._pendingPermissions.registerAndFire(args.toolUseID, () => {
			this._onDidSessionProgress.fire({
				kind: 'pending_confirmation',
				chat: this._chatChannelUri,
				state: args.state,
				permissionKind: args.permissionKind,
				...(args.permissionPath !== undefined ? { permissionPath: args.permissionPath } : {}),
				...(args.parentToolCallId !== undefined ? { parentToolCallId: args.parentToolCallId } : {}),
			});
		});
	}

	respondToPermissionRequest(requestId: string, approved: boolean): boolean {
		return this._pendingPermissions.respond(requestId, approved);
	}

	/**
	 * Fire a {@link ActionType.ChatInputRequested} action and park on
	 * a deferred until {@link respondToUserInputRequest} resolves it.
	 * Resolves with `{ response: Cancel }` if the pipeline is aborted.
	 */
	requestUserInput(request: ChatInputRequest, parentToolCallId?: string): Promise<{ response: ChatInputResponseKind; answers?: Record<string, ChatInputAnswer> }> {
		if (!this._pipeline || this._pipeline.isAborted || !this._pipeline.hasActiveTurn) {
			return Promise.resolve({ response: ChatInputResponseKind.Cancel });
		}
		return this._pendingUserInputs.registerAndFire(request.id, () => {
			this._onDidSessionProgress.fire({
				kind: 'action',
				resource: this._chatChannelUri,
				action: {
					type: ActionType.ChatInputRequested,
					request,
				},
				...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
			});
		});
	}

	respondToUserInputRequest(
		requestId: string,
		response: ChatInputResponseKind,
		answers?: Record<string, ChatInputAnswer>,
	): boolean {
		return this._pendingUserInputs.respond(requestId, { response, answers });
	}

	// #endregion

	// #region Phase 10 — client tools

	/** Replace a client's registered tools (full replacement). */
	setClientTools(clientId: string, tools: readonly ToolDefinition[]): void {
		this.toolDiff.model.setTools(clientId, tools);
	}

	/** This client's registered tools (empty when absent). */
	getClientTools(clientId: string): readonly ToolDefinition[] {
		return this.toolDiff.model.getTools(clientId);
	}

	/** Remove a client's tool contribution from this session. */
	removeClientTools(clientId: string): void {
		this.toolDiff.model.removeClient(clientId);
	}

	/** Remove a client's customization contribution from this session. */
	removeClientCustomizations(clientId: string): void {
		this.clientCustomizationsDiff.model.removeClient(clientId);
		if (this._clientCustomizationEnablement.delete(clientId)) {
			this._rebuildClientCustomizationEnablement();
		}
	}

	/**
	 * Resolve a parked client-tool MCP handler with the workbench-supplied
	 * result. Returns `true` if a matching deferred was found and settled.
	 * Unknown ids are a benign no-op — `agentSideEffects.ts` forwards every
	 * `ChatToolCallComplete` envelope, so SDK-owned tool completions land
	 * here too and must NOT throw.
	 */
	completeClientToolCall(toolCallId: string, result: ToolCallResult): boolean {
		const converted = convertToolCallResult(result, toolCallId);
		return this._pendingClientToolCalls.respond(toolCallId, converted);
	}

	/**
	 * Drive a yield-restart so the SDK picks up the new client-tool set
	 * on its next user request. Public entry point for callers that need
	 * to force a tool-only rebind; internal pre-flight goes through
	 * {@link _rebindForSyncedState}.
	 */
	async rebindForClientTools(): Promise<void> {
		await this._rebindForSyncedState();
	}

	// #endregion

	// #region Phase 11 — customizations / plugins

	/**
	 * Merged fire-and-forget signal that this session's customization
	 * surface changed. Fires from three sources:
	 *
	 * 1. Client-side writes (`adoptClientCustomizations`) — via the
	 *    {@link SessionClientCustomizationsDiff} observable wired up in the
	 *    constructor.
	 * 2. Materialize completes — surfaces the server-side
	 *    (SDK-discovered) tier to the workbench for the first time.
	 * 3. The send() pre-flight rebind completes — the rebuilt SDK's
	 *    resolved set may have changed.
	 *
	 * Drives a workbench refetch of {@link getSessionCustomizations}.
	 * Does NOT itself trigger any SDK action — the dirty bit on
	 * {@link SessionClientCustomizationsDiff} drives plugin rebinds,
	 * and only flips on client-side writes.
	 */
	private readonly _onDidCustomizationsChange = this._register(new Emitter<void>());
	readonly onDidCustomizationsChange: Event<void> = this._onDidCustomizationsChange.event;

	/**
	 * Adopt the result of a global {@link IAgentPluginManager.syncCustomizations}
	 * pass (**client-pushed** path). The agent owns the manager (it's
	 * a process-wide singleton with a shared on-disk cache) and pushes
	 * the resulting snapshot down here. Flips the client-side dirty bit
	 * so the next {@link send} pre-flight reloads SDK plugins.
	 */
	adoptClientCustomizations(clientId: string, synced: readonly ISyncedCustomization[], customizations: readonly ClientPluginCustomization[]): void {
		this.clientCustomizationsDiff.model.setSyncedCustomizations(clientId, synced);
		const pluginEnablement = new Map<string, ClientPluginCustomization>();
		const childEnablement = new Map<string, Readonly<Record<string, readonly CustomizationEnablement[]>>>();
		for (const customization of customizations) {
			pluginEnablement.set(customization.uri.toString(), customization);
			if (customization.childEnablement !== undefined) {
				childEnablement.set(customization.uri.toString(), customization.childEnablement);
			}
		}
		// Re-inserting moves the latest client snapshot to the end, preserving
		// the previous last-write-wins merge precedence across clients.
		this._clientCustomizationEnablement.delete(clientId);
		this._clientCustomizationEnablement.set(clientId, { pluginEnablement, childEnablement });
		this._rebuildClientCustomizationEnablement();
	}

	/**
	 * Snapshot of the **client-pushed** customizations on this session.
	 * Does NOT include server-side (SDK-discovered) entries — use
	 * {@link getSessionCustomizations} for the merged view.
	 */
	getClientCustomizations(): readonly ISyncedCustomization[] {
		return this.clientCustomizationsDiff.model.state.get().synced;
	}

	/** Snapshot of the last {@link getSessionCustomizations} result, read by {@link _enrichSignalWithMcpContributor}. */
	private _lastCustomizations: readonly Customization[] = [];
	private readonly _clientChildEnablement = new Map<string, Readonly<Record<string, readonly CustomizationEnablement[]>>>();
	private readonly _clientPluginEnablement = new Map<string, ClientPluginCustomization>();
	private readonly _clientCustomizationEnablement = new Map<string, {
		readonly pluginEnablement: ReadonlyMap<string, ClientPluginCustomization>;
		readonly childEnablement: ReadonlyMap<string, Readonly<Record<string, readonly CustomizationEnablement[]>>>;
	}>();

	private _rebuildClientCustomizationEnablement(): void {
		this._clientChildEnablement.clear();
		this._clientPluginEnablement.clear();
		for (const enablement of this._clientCustomizationEnablement.values()) {
			for (const [uri, plugin] of enablement.pluginEnablement) {
				this._clientPluginEnablement.set(uri, plugin);
			}
			for (const [uri, children] of enablement.childEnablement) {
				this._clientChildEnablement.set(uri, children);
			}
		}
	}

	/**
	 * Project the union of (a) **client-pushed** customizations and
	 * (b) the **server-side** (SDK-discovered) view (commands / agents
	 * / MCP servers, including those the SDK discovered on its own
	 * from `~/.claude/**`) onto the protocol's
	 * {@link Customization} surface, with reducer-backed enablement
	 * applied to client-pushed entries.
	 *
	 * Pre-materialize sessions return only the client-pushed projection
	 * — the SDK side has no Query to query yet. A failure to read the
	 * SDK snapshot is warn-logged and the client-pushed projection is
	 * still returned, so a transient SDK hiccup doesn't blank the UI.
	 */
	async getSessionCustomizations(): Promise<readonly Customization[]> {
		const { synced } = this.clientCustomizationsDiff.model.state.get();
		const userHome = this._environmentService.userHome;
		const [multiRoot, rules, mcpServers, hooks] = await Promise.all([
			discoverClaudeMultiRootCustomizations(this.workingDirectories, userHome, this._fileService, this._logService),
			scanClaudeRules(this.workingDirectory, userHome, this._fileService),
			scanClaudeMcpServers(this.workingDirectory, userHome, this._fileService),
			scanClaudeHooks(this.workingDirectory, userHome, this._fileService),
		]);

		// Post-materialize, the live SDK snapshot filters the disk set down to
		// what the session actually loaded (and surfaces SDK-only items as
		// non-editable). Pre-materialize there is no Query, so the full disk
		// set is shown. A transient SDK read failure leaves `sdk` undefined,
		// falling back to the unfiltered disk set rather than blanking the UI.
		let sdk: ISdkResolvedCustomizations | undefined;
		if (this._pipeline) {
			try {
				sdk = await this._pipeline.snapshotResolvedCustomizations();
			} catch (err) {
				this._logService.warn(`[Claude:${this.sessionId}] snapshotResolvedCustomizations failed`, err);
			}
		}

		// `buildDiscoveredCustomizations` also folds in the read-only "Built-in"
		// surfacing (curated pre-materialize, SDK-derived post-materialize) for
		// both agents and skills, so the SDK-vs-curated decision lives in one place.
		const discoveredCustomizations = buildDiscoveredCustomizations([...multiRoot.discovered, ...rules], mcpServers, hooks, multiRoot.nativePlugins, multiRoot.workingDirectories, userHome, sdk);

		// Final projection: the client-pushed tier first, then the discovered
		// tier, with session MCP enablement applied to both.
		const state = this._hostCustomizations;
		const result: Customization[] = synced.map(item => {
			const desired = state.find(customization => customization.id === item.customization.id);
			if (desired?.type !== CustomizationType.Plugin) {
				return item.customization;
			}
			if (desired.enablement?.length) {
				return { ...item.customization, enablement: [...desired.enablement] };
			}
			const { enablement: _enablement, ...withoutEnablement } = item.customization;
			return withoutEnablement;
		});
		result.push(...discoveredCustomizations);
		// Cache for the MCP-contributor signal enrichment (see
		// {@link _enrichSignalWithMcpContributor}).
		const projected = applyMcpServerEnablement(result, state);
		const enabled = resolveCustomizationEnablement(this._customizationEnablementService, this._configurationResource, projected, this._clientChildEnablement, this._clientPluginEnablement);
		this._lastCustomizations = enabled.customizations;
		return enabled.customizations;
	}

	private _reconcileMcpServerEnablement(fromCustomizationChange = false): Promise<void> {
		const desired = this._getDesiredMcpServerEnablement();
		if (desired.size === 0) {
			this._lastReconciledMcpEnablement = desired;
			return Promise.resolve();
		}
		if (fromCustomizationChange && this._isMcpEnablementUnchanged(desired)) {
			return Promise.resolve();
		}
		return this._mcpEnablementSequencer.queue(() => this._doReconcileMcpServerEnablement());
	}

	private async _doReconcileMcpServerEnablement(): Promise<void> {
		const pipeline = this._requirePipeline();
		const desired = this._getDesiredMcpServerEnablement();
		if (desired.size === 0) {
			this._lastReconciledMcpEnablement = desired;
			return;
		}

		if (!await pipeline.reconcileMcpServerEnablement(desired)) {
			throw new Error(`Claude SDK cannot reconcile MCP server enablement`);
		}
		this._lastReconciledMcpEnablement = desired;
	}

	private _getDesiredMcpServerEnablement(): Map<string, boolean> {
		const resolved = resolveCustomizationEnablement(
			this._customizationEnablementService,
			this._configurationResource,
			this._hostCustomizations,
			this._clientChildEnablement,
			this._clientPluginEnablement,
		);
		const enabledById = getSdkMcpServerEnablement(resolved);
		return new Map(resolved.customizations.flatMap(customization => {
			if (customization.type === CustomizationType.McpServer) {
				return [[customization.name, enabledById.get(customization.id) ?? false] as const];
			}
			return (customization.children ?? []).flatMap(child =>
				child.type === CustomizationType.McpServer
					? [[child.name, enabledById.get(child.id) ?? false] as const]
					: []);
		}));
	}

	private _isMcpEnablementUnchanged(desired: ReadonlyMap<string, boolean>): boolean {
		if (!this._lastReconciledMcpEnablement || desired.size !== this._lastReconciledMcpEnablement.size) {
			return false;
		}
		return [...desired].every(([name, enabled]) => this._lastReconciledMcpEnablement!.get(name) === enabled);
	}

	private _desiredClientPluginPaths(): readonly URI[] {
		const resolved = resolveCustomizationEnablement(this._customizationEnablementService, this._configurationResource, this.clientCustomizationsDiff.model.state.get().synced.map(item => item.customization), this._clientChildEnablement, this._clientPluginEnablement);
		const desiredById = new Map(resolved.customizations
			.filter(customization => isCustomizationSdkEligible(resolved, customization))
			.map(customization => [customization.id, customization.type === CustomizationType.Directory ? customization.enabled : isCustomizationEnabled(customization)]));
		const paths: URI[] = [];
		for (const synced of this.clientCustomizationsDiff.model.state.get().synced) {
			if (synced.pluginDir && (desiredById.get(synced.customization.id) ?? isCustomizationEnabled(synced.customization)) !== false) {
				paths.push(synced.pluginDir);
			}
		}
		return paths;
	}

	async startMcpServer(id: string): Promise<void> {
		const serverName = await this._resolveMcpServerName(id);
		if (!serverName) {
			this._logService.warn(`[Claude:${this.sessionId}] Cannot start unknown MCP server customization ${id}`);
			return;
		}
		const handled = await this._requirePipeline().startMcpServer(serverName);
		if (!handled) {
			await this._rebindForSyncedState();
		}
		this._onDidCustomizationsChange.fire();
	}

	async stopMcpServer(id: string): Promise<void> {
		const serverName = await this._resolveMcpServerName(id);
		if (!serverName) {
			this._logService.warn(`[Claude:${this.sessionId}] Cannot stop unknown MCP server customization ${id}`);
			return;
		}
		const handled = await this._requirePipeline().stopMcpServer(serverName);
		if (!handled) {
			this._logService.warn(`[Claude:${this.sessionId}] MCP server stop is not supported by the current SDK`);
			return;
		}
		this._onDidCustomizationsChange.fire();
	}

	private async _resolveMcpServerName(id: string): Promise<string | undefined> {
		return findMcpServerName(this._lastCustomizations, id) ?? findMcpServerName(await this.getSessionCustomizations(), id);
	}

	// #endregion

	override dispose(): void {
		// Resolve parked deferreds before tearing the pipeline down so the
		// SDK's canUseTool callback unwinds with a deny and the loop exits.
		this._pendingPermissions.denyAll(false);
		this._pendingUserInputs.denyAll({ response: ChatInputResponseKind.Cancel });
		this._pendingClientToolCalls.rejectAll(new CancellationError());
		super.dispose();
	}
}
