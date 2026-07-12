/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient, RuntimeConnection, type CopilotClientOptions } from '@github/copilot-sdk';
import * as fs from 'fs/promises';
import * as os from 'os';
import { CancelablePromise, createCancelablePromise, Delayer, disposableTimeout, Limiter, SequencerByKey } from '../../../../base/common/async.js';
import { type CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { appendEscapedMarkdownInlineCode } from '../../../../base/common/htmlContent.js';
import { combinedDisposable, Disposable, DisposableMap, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { formatTokenCount } from '../../../../base/common/numbers.js';
import { equals } from '../../../../base/common/objects.js';
import { autorun, observableValue, type ISettableObservable } from '../../../../base/common/observable.js';
import { basename, delimiter, dirname, join } from '../../../../base/common/path.js';
import { basename as resourceBasename, isEqual, isEqualOrParent, joinPath as resourceJoinPath, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { rgDiskPath } from '../../../../base/node/ripgrep.js';
import { localize } from '../../../../nls.js';
import { IParsedAgent, IParsedPlugin, IParsedRule, IParsedSkill, parseAgentFile, parsePlugin, parseRuleFile, parseSkillFile } from '../../../agentPlugins/common/pluginParsers.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService, LogLevel } from '../../../log/common/log.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { workspacelessScratchDir } from '../workspacelessScratchDir.js';
import { IAgentHostCheckpointService } from '../../common/agentHostCheckpointService.js';
import { IAgentHostReviewService } from '../../common/agentHostReviewService.js';
import { createPricingMetaFromBilling, hasLongContextSurcharge, type ICAPIModelBilling } from '../../common/agentModelPricing.js';
import { createAgentModelByokMeta } from '../../common/agentModelByokMeta.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema, toContainerCustomization } from '../../common/agentHostCustomizationConfig.js';
import { CopilotCliConfigKey, copilotCliConfigSchema } from '../../common/copilotCliConfig.js';
import { AgentHostMcpServersConfigKey, AgentHostPreferLongContextEnabledConfigKey, AgentHostSessionSyncEnabledConfigKey, AutoApproveLevel, ISchemaProperty, SessionMode, createSchema, migrateLegacyAutopilotConfig, platformRootSchema, platformSessionSchema, schemaProperty, type AgentHostMcpServers } from '../../common/agentHostSchema.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { AgentSessionEntry, decodeProviderData, encodeProviderData, type IPersistedChat } from '../agentPeerChats.js';
import { AgentSession, AgentSignal, AuthenticateParams, IActiveClient, IAgent, IAgentChatDataChange, IAgentChats, IAgentLegacyChat, IAgentCreateChatForkSource, IAgentCreateChatOptions, IAgentCreateChatResult, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSessionProjectInfo, IAgentSpawnChatEvent, IMcpNotification, IRestoredSubagentSession, SubagentChatSignal } from '../../common/agentService.js';
import { getReasoningEffortDescription, getReasoningEffortLabel } from '../../common/reasoningEffort.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ISessionDataService, SESSION_DB_FILENAME } from '../../common/sessionDataService.js';
import { IAgentHostProxyResolver } from '../agentHostProxyResolver.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { ProtectedResourceMetadata, type AgentSelection, type ChildCustomizationType, type ConfigPropertySchema, type ConfigSchema, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { ActionType, type SessionAction } from '../../common/state/sessionActions.js';
import { AgentCustomization, CustomizationLoadStatus, CustomizationType, ResponsePartKind, RuleCustomization, ChatInputResponseKind, SkillCustomization, customizationId, buildChatUri, buildDefaultChatUri, isDefaultChatUri, parseChatUri, parseRequiredSessionUriFromChatUri, parseSubagentSessionUri, AH_META_WORKSPACELESS_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, type ChildCustomization, type ClientPluginCustomization, type Customization, type DirectoryCustomization, type HookCustomization, type MessageAttachment, type PendingMessage, type PluginCustomization, type PolicyState, type ResponsePart, type ChatInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { ActiveClientToolSet } from '../activeClientState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
import { IAgentHostCompletions } from '../agentHostCompletions.js';
import { IAgentHostGitService, META_DIFF_BASE_BRANCH } from '../../common/agentHostGitService.js';
import { findMcpChildId, type IMcpServerRuntimeState } from '../shared/mcpCustomizationController.js';
import { IByokLmBridgeRegistry } from '../byokLmBridgeRegistry.js';
import { COPILOT_BRANCH_PREFIX, ICopilotBranchNameGenerator } from './copilotBranchNameGenerator.js';
import { buildSessionEventLogFromTurns } from './buildSessionEvents.js';
import { CopilotAgentSession, type CopilotSdkMode } from './copilotAgentSession.js';
import { ICopilotSessionContext, projectFromCopilotContext } from './copilotGitProject.js';
import { parsedPluginsEqual, toChildCustomizations } from './copilotPluginConverters.js';
import { CopilotSessionLauncher, ContextSizeConfigKey, ThinkingLevelConfigKey, getCopilotContextTier, resolveCopilotReasoningEffort, type CopilotSessionLaunchPlan, type IActiveClientSnapshot } from './copilotSessionLauncher.js';
import { ShellManager } from './copilotShellTools.js';
import { isAgentHostTelemetryService } from '../agentHostTelemetryService.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { CopilotSlashCommandCompletionProvider } from './copilotSlashCommandCompletionProvider.js';
import { DiscoveredType, SessionCustomizationDiscovery, areDiscoveredDirectoriesEqual, type IDiscoveredDirectory } from './sessionCustomizationDiscovery.js';
import { COPILOT_INTEGRATION_ID } from '../../../endpoint/common/licenseAgreement.js';
import { getAppNodeModulesPath } from '../appNodeModules.js';

const RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS = 300;
const COPILOT_CAPI_URL = 'https://api.githubcopilot.com';
/**
 * Proxy env vars that indicate the environment already configures a proxy.
 */
const COPILOT_PROXY_ENV_KEYS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'] as const;
/**
 * Proxy env vars we set when injecting the resolved CAPI proxy.
 */
const COPILOT_PROXY_SET_ENV_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY'] as const;

/**
 * Maps a VS Code {@link LogLevel} to the Copilot CLI runtime's `logLevel`
 * option so the spawned CLI logs (written to `~/.copilot/logs/process-*.log`)
 * match the agent host's configured verbosity. `Trace` maps to the CLI's most
 * verbose `'all'` level so renderer-side trace logging surfaces the CLI's
 * internal diagnostics.
 */
function copilotCliLogLevelFor(level: LogLevel): NonNullable<CopilotClientOptions['logLevel']> {
	switch (level) {
		case LogLevel.Off: return 'none';
		case LogLevel.Trace: return 'all';
		case LogLevel.Debug: return 'debug';
		case LogLevel.Info: return 'info';
		case LogLevel.Warning: return 'warning';
		case LogLevel.Error: return 'error';
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function isLinuxMuslRuntime(): boolean {
	if (process.platform !== 'linux') {
		return false;
	}

	const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
	return !report?.header?.glibcVersionRuntime;
}

function getCopilotPlatformPackageCandidates(): string[] {
	const platformArch = `${process.platform}-${process.arch}`;
	if (process.platform !== 'linux') {
		return [platformArch];
	}

	const linuxCandidates = [`linux-${process.arch}`, `linuxmusl-${process.arch}`];
	return isLinuxMuslRuntime() ? linuxCandidates.reverse() : linuxCandidates;
}

async function resolveCopilotCliPath(nodeModulesUri: URI): Promise<string> {
	const tried: string[] = [];
	for (const platformPackage of getCopilotPlatformPackageCandidates()) {
		const cliPath = URI.joinPath(nodeModulesUri, '@github', `copilot-${platformPackage}`, 'index.js').fsPath;
		tried.push(cliPath);
		if (await fileExists(cliPath)) {
			return cliPath;
		}
	}

	const oldTopLevelPath = URI.joinPath(nodeModulesUri, '@github', 'copilot', 'index.js').fsPath;
	tried.push(oldTopLevelPath);
	if (await fileExists(oldTopLevelPath)) {
		return oldTopLevelPath;
	}

	throw new Error(`Unable to resolve @github/copilot CLI path. Tried: ${tried.join(', ')}`);
}

interface ICreatedWorktree {
	readonly repositoryRoot: URI;
	readonly worktree: URI;
}

export type ICopilotPluginInfo = IParsedPlugin & { readonly pluginDir?: URI };

/**
 * A session that has been requested by a client but has not yet been
 * materialized into a real Copilot SDK session, worktree, or persisted
 * metadata. Created by {@link CopilotAgent.createSession} when no fork is
 * requested, and consumed by {@link CopilotAgent._materializeProvisional}
 * on the first {@link CopilotAgent.sendMessage}.
 *
 * Until materialization the session occupies only an in-memory slot and
 * an entry in the state manager. Disposing a provisional session is a
 * cheap no-op compared with tearing down a real session — there is no
 * worktree to remove and no on-disk state to delete.
 *
 * `model` absorbs {@link CopilotAgent.changeModel} updates that arrive
 * before the first message. The latest session config (isolation / branch /
 * etc.) is read straight from the state manager via
 * {@link IAgentConfigurationService.getSessionConfigValues} at
 * materialization time, so no bespoke forwarding is required for it.
 */
interface IProvisionalSession {
	readonly sessionId: string;
	readonly sessionUri: URI;
	/**
	 * Folder the user picked at create time. Used as both the
	 * pre-worktree working directory and the customization directory
	 * (plugin discovery is anchored to the original folder, not to a
	 * worktree path that may not exist yet).
	 */
	readonly workingDirectory: URI;
	/** Most recent model selection. Updated by `changeModel` while provisional. */
	model: ModelSelection | undefined;
	/** Most recent custom agent selection. Updated by `changeAgent` while provisional. */
	agent: AgentSelection | undefined;
	/** Project info eagerly resolved at create time so the summary renders. */
	readonly project: IAgentSessionProjectInfo | undefined;
	/** Whether this session is workspace-less (surfaced in the sessions UI as a "Quick Chat"). */
	readonly workspaceless?: boolean;
}

export { COPILOT_AGENT_HOST_SYSTEM_MESSAGE } from './prompts/systemMessage.js';

type ModelInfo = Awaited<ReturnType<CopilotClient['rpc']['models']['list']>>['models'][number];

interface ISerializedModelSelection {
	id?: unknown;
	config?: unknown;
}

/**
 * Subset of the JSON-RPC `MessageConnection` we reach into via the SDK's private `connection` field to wire plan mode.
 * See {@link CopilotAgent._enablePlanModeOnClient}.
 */
interface IExitPlanModeConnection {
	sendRequest(method: string, params: unknown): Promise<unknown>;
	onRequest(method: string, handler: (params: IExitPlanModeRequestParams) => Promise<IExitPlanModeResponse>): { dispose(): void };
}

/**
 * Payload of the CLI's `exitPlanMode.request` RPC. The CLI dispatches one
 * per `exit_plan_mode` tool invocation when the session was created with
 * `requestExitPlanMode: true`.
 */
export interface IExitPlanModeRequestParams {
	readonly sessionId: string;
	readonly summary: string;
	readonly planContent: string;
	readonly actions: readonly string[];
	readonly recommendedAction: string;
}

/**
 * Response for the CLI's `exitPlanMode.request` RPC. The CLI feeds this
 * directly into `session.respondToExitPlanMode`, which resolves the
 * pending tool call and (when approved) updates the SDK's `currentMode`.
 */
export interface IExitPlanModeResponse {
	readonly approved: boolean;
	readonly selectedAction?: string;
	readonly autoApproveEdits?: boolean;
	readonly feedback?: string;
}

export function getCopilotWorktreesRoot(repositoryRoot: URI): URI {
	return URI.joinPath(repositoryRoot, '..', `${basename(repositoryRoot.fsPath)}.worktrees`);
}

/**
 * Thrown when a session cannot be resumed because its working directory is gone
 * and could not be repaired: the worktree could not be recreated (for a live
 * session), or the repository-root fallback is also missing (for an archived
 * session). The Copilot SDK can only read a session's transcript through a live
 * session bound to an existing directory, so this is unrecoverable. Surfaced
 * (rather than swallowed into an empty transcript) so opening such a session
 * shows a clear error — including the underlying {@link reason} (e.g. the git
 * failure) when one is available — instead of a blank chat.
 */
export class SessionWorkingDirectoryMissingError extends Error {
	constructor(readonly workingDirectory: URI, readonly reason?: string) {
		super(reason
			? localize('sessionWorkingDirectoryMissingWithReason', "This session couldn't be loaded because its worktree is missing and could not be recreated: {0}", reason)
			: localize('sessionWorkingDirectoryMissing', "This session couldn't be loaded because its working directory no longer exists: {0}", workingDirectory.fsPath));
		this.name = 'SessionWorkingDirectoryMissingError';
	}
}

export function getCopilotWorktreeDirectoryName(branchName: string, branchPrefix: string = ''): string {
	// Strip the caller-supplied prefix (e.g. `git.branchPrefix`) and the
	// built-in `agents/` prefix so the worktree directory name stays concise,
	// then flatten any remaining path separators.
	let name = branchName;
	if (branchPrefix && name.startsWith(branchPrefix)) {
		name = name.substring(branchPrefix.length);
	}
	if (name.startsWith(COPILOT_BRANCH_PREFIX)) {
		name = name.substring(COPILOT_BRANCH_PREFIX.length);
	}
	return name.replace(/\//g, '-');
}

/**
 * Rebases `uri` from under `fromDir` onto `toDir`, preserving the relative path.
 * Returns `undefined` when `uri` is not equal to or under `fromDir`.
 */
export function rebaseUnder(uri: URI, fromDir: URI, toDir: URI): URI | undefined {
	if (!isEqualOrParent(uri, fromDir)) {
		return undefined;
	}
	const rel = relativePath(fromDir, uri);
	if (rel === undefined) {
		return undefined;
	}
	return rel.length === 0 ? toDir : resourceJoinPath(toDir, rel);
}

/**
 * Returns a copy of `enablement` with keys that live under `fromDir` rebased
 * onto `toDir`. Keys that aren't rebased are preserved **verbatim** (no
 * `URI.parse(...).toString()` round-trip) so a non-URI-shaped or already-relocated
 * key can't be mutated and lose its toggle.
 */
export function migrateEnablementKeys(enablement: ReadonlyMap<string, boolean>, fromDir: URI, toDir: URI): Map<string, boolean> {
	const migrated = new Map<string, boolean>();
	for (const [uri, enabled] of enablement) {
		const rebased = rebaseUnder(URI.parse(uri), fromDir, toDir);
		migrated.set(rebased ? rebased.toString() : uri, enabled);
	}
	return migrated;
}

/**
 * Builds the localized "Created isolated worktree for branch X" markdown
 * shown at the top of the first response in worktree-isolated sessions.
 * The branch name is wrapped as inline code so the localized template
 * doesn't have to embed markdown punctuation. The trailing blank line
 * keeps the announcement visually separated when it gets merged into the
 * same markdown part as the model's reply.
 */
function buildWorktreeAnnouncementText(branchName: string): string {
	return localize(
		'copilotAgent.worktreeCreated',
		"Created isolated worktree for branch {0}",
		appendEscapedMarkdownInlineCode(branchName)
	) + '\n\n';
}

/**
 * Returns a copy of `turns` where `announcement` has been prepended to the
 * first top-level assistant turn's first markdown response part. Used on
 * session restore so the worktree announcement remains visible after the
 * session is reopened. If no assistant content exists yet, a fresh
 * markdown part is inserted at the top of the first turn.
 */
function prependAnnouncementToFirstTurn(
	turns: readonly Turn[],
	announcement: string,
): readonly Turn[] {
	if (turns.length === 0) {
		return turns;
	}
	const result = turns.slice();
	const first = result[0];
	const part = first.responseParts[0];
	if (part?.kind === ResponsePartKind.Markdown) {
		const responseParts = first.responseParts.slice();
		responseParts[0] = { ...part, content: announcement + part.content };
		result[0] = { ...first, responseParts };
	} else {
		const responseParts: ResponsePart[] = [
			{ kind: ResponsePartKind.Markdown, id: generateUuid(), content: announcement },
			...first.responseParts,
		];
		result[0] = { ...first, responseParts };
	}
	return result;
}

/**
 * Per-session container. Owns the session's default (main) chat and any
 * additional peer chats, keeping all chats of a session together in a single
 * {@link CopilotAgent._sessions} map (no parallel maps). The default chat is
 * optional because a Copilot session can exist as a provisional record (in
 * {@link CopilotAgent._provisionalSessions}) whose SDK-backed default chat has
 * not materialized yet — a peer chat may still be created on it. Disposing the
 * entry disposes the default chat and every peer chat.
 *
 * Exported for tests, which inject fake sessions into the container.
 */
export class CopilotSessionEntry extends AgentSessionEntry<CopilotAgentSession> { }

/**
 * Agent provider backed by the Copilot SDK {@link CopilotClient}.
 */
export class CopilotAgent extends Disposable implements IAgent {
	readonly id = 'copilotcli' as const;
	private static readonly _BRANCH_COMPLETION_LIMIT = 25;

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;
	/**
	 * Membership channel for chats the agent spawns itself — sub-agents
	 * delegated by a tool call (the same fan-out the `subagent_started` /
	 * `subagent_completed` signals drive). The orchestrator routes these into
	 * the chat catalog so harness-spawned and user-driven chats share one path.
	 */
	private readonly _onDidSpawnChat = this._register(new Emitter<IAgentSpawnChatEvent>());
	readonly onDidSpawnChat = this._onDidSpawnChat.event;
	private readonly _onDidMaterializeSession = this._register(new Emitter<IAgentMaterializeSessionEvent>());
	readonly onDidMaterializeSession = this._onDidMaterializeSession.event;
	/**
	 * Per-session MCP notifications, fanned in from every active
	 * {@link CopilotAgentSession}. Each session contributes a single
	 * subscription, disposed alongside the session.
	 */
	private readonly _onMcpNotification = this._register(new Emitter<IMcpNotification>());
	readonly onMcpNotification = this._onMcpNotification.event;
	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models = this._models;
	/**
	 * The two sources merged into {@link _models}: CAPI models from the CLI's
	 * `models.list` and BYOK models from the renderer bridge registry's serving
	 * window. Tracked separately so each can refresh independently without
	 * clobbering the other; {@link _publishModels} concatenates them for the
	 * picker.
	 */
	private _capiModels: readonly IAgentModelInfo[] = [];
	private _byokModels: readonly IAgentModelInfo[] = [];

	/** Model IDs whose long-context tier costs the same as the default tier. */
	private readonly _freeLongContextModels = new Set<string>();

	/**
	 * Bounded exponential-backoff retry for {@link _refreshModels}. The SDK's
	 * `models.list` RPC can fail transiently (e.g. a `429 "too many requests"`
	 * right after startup). Without a retry the model picker would stay empty
	 * until the GitHub token next changes — the only other trigger for a
	 * refresh — so we retry a few times before giving up. Overridable in tests
	 * to avoid real delays.
	 */
	protected readonly _modelRefreshMaxAttempts: number = 5;
	protected readonly _modelRefreshBaseDelayMs: number = 1_000;
	protected readonly _modelRefreshMaxDelayMs: number = 30_000;
	/** Pending model-refresh retry timer; cleared on a fresh refresh, shutdown, or dispose. */
	private readonly _modelRefreshRetry = this._register(new MutableDisposable());

	private _client: CopilotClient | undefined;
	private _clientStarting: Promise<CopilotClient> | undefined;
	/**
	 * Proxy URL injected into the running client's subprocess env (`undefined`
	 * when none was injected). Used to detect when a token change alters the
	 * token-discovered CAPI endpoint's proxy so we can restart the client.
	 */
	private _appliedProxy: string | undefined;
	private _githubToken: string | undefined;
	private _serverToolHost: IAgentServerToolHost | undefined;

	setServerToolHost(host: IAgentServerToolHost): void {
		this._serverToolHost = host;
	}

	/** Reflects the `rt=1` field on the GitHub Copilot bearer token; gates enhanced GH telemetry. */
	private _restrictedTelemetryEnabled = false;
	private readonly _onDidChangeRestrictedTelemetry = this._register(new Emitter<void>());
	readonly onDidChangeRestrictedTelemetry = this._onDidChangeRestrictedTelemetry.event;

	get restrictedTelemetryEnabled(): boolean {
		return this._restrictedTelemetryEnabled;
	}

	private readonly _sessions = this._register(new DisposableMap<string, CopilotSessionEntry>());
	/**
	 * Live `chatUri → backing` map for additional (non-default) peer chats,
	 * keyed by chat channel URI string. Records the SDK chat id (and
	 * optional model override) that backs each peer chat so the agent can
	 * resume it without consulting on-disk persistence. Populated by
	 * {@link createChat} on creation and by {@link materializeChat} on
	 * restore; the orchestrator now owns the durable peer-chat catalog (the
	 * agent no longer writes `copilot.chats`).
	 */
	private readonly _chatBackings = new Map<string, IPersistedChat>();
	/**
	 * Fires when a peer chat's opaque `providerData` blob changes after
	 * creation (e.g. a per-chat model switch), so the orchestrator re-persists
	 * the refreshed token. See {@link IAgent.onDidChangeChatData}.
	 */
	private readonly _onDidChangeChatData = this._register(new Emitter<IAgentChatDataChange>());
	readonly onDidChangeChatData: Event<IAgentChatDataChange> = this._onDidChangeChatData.event;
	/**
	 * Per-session MCP-notification subscriptions, keyed by `sessionId`.
	 * Disposed in lockstep with the matching {@link _sessions} entry so
	 * the fan-in does not leak listeners as sessions come and go.
	 */
	private readonly _mcpNotificationSubs = this._register(new DisposableMap<string>());
	/**
	 * In-flight {@link _resumeSession} promises, keyed by sessionId. Used to
	 * deduplicate concurrent resume requests for the same session so that
	 * we never construct two {@link CopilotAgentSession} entries for the
	 * same id — `_sessions` is a {@link DisposableMap} whose `set()` would
	 * dispose the in-flight first entry mid-{@link CopilotAgentSession.initializeSession},
	 * leaving the second caller with a half-initialised, eventless session.
	 */
	private readonly _resumingSessions = new Map<string, Promise<CopilotAgentSession>>();
	/**
	 * Sessions created by a client but not yet materialized into a Copilot
	 * SDK session + worktree + on-disk metadata. Materialization is deferred
	 * until the first {@link sendMessage}, at which point the entry moves
	 * out of this map and into {@link _sessions}. See {@link IProvisionalSession}.
	 */
	private readonly _provisionalSessions = new Map<string, IProvisionalSession>();
	private readonly _createdWorktrees = new Map<string, ICreatedWorktree>();
	/**
	 * Per-session announcement (markdown string) that should be emitted as
	 * a synthetic streaming `delta` event the first time {@link sendMessage}
	 * is called for the session. Currently used to surface the "Created
	 * isolated worktree for branch X" message live during the first turn.
	 * The same announcement is also injected on restore via
	 * {@link getSessionMessages} by prepending to the first assistant
	 * message's content so it stays visible after the session is reopened.
	 */
	private readonly _pendingFirstTurnAnnouncements = new Map<string, string>();
	private readonly _sessionSequencer = new SequencerByKey<string>();
	private _shutdownPromise: Promise<void> | undefined;
	private readonly _plugins: PluginController;
	private readonly _sessionLauncher: CopilotSessionLauncher;
	readonly onDidCustomizationsChange: Event<void>;
	/** Per-session active client state for tools + plugin snapshot tracking. */
	private readonly _activeClients = new ResourceMap<ActiveClient>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@IAgentHostOTelService private readonly _otelService: IAgentHostOTelService,
		@ICopilotBranchNameGenerator private readonly _branchNameGenerator: ICopilotBranchNameGenerator,
		@IAgentHostCompletions completions: IAgentHostCompletions,
		@IAgentHostCheckpointService private readonly _checkpointService: IAgentHostCheckpointService,
		@IAgentHostReviewService private readonly _reviewService: IAgentHostReviewService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@IByokLmBridgeRegistry private readonly _byokBridgeRegistry: IByokLmBridgeRegistry,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IAgentHostProxyResolver private readonly _proxyResolver: IAgentHostProxyResolver,
	) {
		super();
		this._plugins = this._register(this._instantiationService.createInstance(PluginController));
		this._sessionLauncher = this._instantiationService.createInstance(CopilotSessionLauncher);
		this.onDidCustomizationsChange = this._plugins.onDidChange;
		// Mirror the sub-agent fan-out signals onto the first-class spawned-
		// chat channel so the orchestrator manages sub-agent chats
		// through the same membership path as user-driven chats.
		this._register(this._onDidSessionProgress.event(signal => this._emitSpawnedChatForSubagentSignal(signal)));
		this._register(completions.registerProvider(new CopilotSlashCommandCompletionProvider(this.id,
			{
				isRubberDuckEnabled: () => this._isRubberDuckEnabled(),
				getRuntimeSlashCommands: async (sessionId, options) => this._findAnySession(sessionId)?.getRuntimeSlashCommands(options) ?? [],
				getSessionCustomizations: (sessionId) => this.getSessionCustomizations(AgentSession.uri(this.id, sessionId)),
			},
			RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS,
		)));

		// Restart the CLI client when a setting baked into the client/subprocess at
		// startup changes, disposing any active sessions. Both session sync (a client
		// option) and the rubber duck flag (a subprocess env var) are applied in
		// `_ensureClient`, so they only take effect on the next client start.
		this._register(this._configurationService.onDidRootConfigChange(() => {
			this._restartClientIfStartupConfigChanged().catch(err =>
				this._logService.error('[Copilot] Failed to restart client after config change', err)
			);
		}));

		// Surface renderer BYOK models in the picker: republish them whenever the
		// set of connected renderer bridges, or any renderer's models, change.
		// The registry is only populated when `chat.agentHost.byokModels.enabled`
		// is on, so this stays a no-op (empty list) while the feature is off.
		this._register(this._byokBridgeRegistry.onDidChangeModels(() => {
			this._logService.info('[Copilot] BYOK bridge changed; refreshing models');
			this._refreshByokModels();
		}));

		// `COPILOT_GH_HOST` is a subprocess env var (applied in `_ensureClient`) the
		// CLI reads only at spawn time. When the configured GitHub Enterprise host
		// changes - notably the startup race where the workbench pushes
		// `githubEnterpriseUri` just after the client's initial spawn - restart the
		// client so it comes up pointed at the right host. Driven off the endpoint
		// service's `onDidChange` (which fires after its endpoints are recomputed)
		// rather than the raw config event, so `getEnterpriseHost()` is current here.
		this._register(this._gitHubEndpointService.onDidChange(() => {
			this._restartClientIfStartupConfigChanged().catch(err =>
				this._logService.error('[Copilot] Failed to restart client after endpoint change', err)
			);
		}));
	}

	/**
	 * Translates the sub-agent fan-out signals into the first-class spawned-
	 * chat channel: `subagent_started` -> {@link onDidSpawnChat}
	 * (carrying the spawning tool call as the chat's parent edge). A completed
	 * subagent chat stays live and subscribable (it is removed only on session
	 * teardown), so there is no corresponding end event. The signals themselves
	 * are left untouched so the existing sub-agent behavior is preserved.
	 */
	private _emitSpawnedChatForSubagentSignal(signal: AgentSignal): void {
		const spawn = SubagentChatSignal.toSpawnEvent(signal);
		if (spawn) {
			this._onDidSpawnChat.fire(spawn);
		}
	}

	private _lastSessionSyncEnabled: boolean = this._isSessionSyncEnabled();
	private _lastRubberDuckEnabled: boolean = this._isRubberDuckEnabled();
	private _lastEnterpriseHost: string | undefined = this._getEnterpriseHost();

	private _isSessionSyncEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostSessionSyncEnabledConfigKey) === true;
	}

	private _isRubberDuckEnabled(): boolean {
		return this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.RubberDuck) === true;
	}

	private _getEnterpriseHost(): string | undefined {
		return this._gitHubEndpointService.getEnterpriseHost();
	}

	private _isPreferLongContextEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostPreferLongContextEnabledConfigKey) === true;
	}

	/**
	 * Restarts the CLI client when a config value that is only read at client
	 * startup ({@link _isSessionSyncEnabled} client option, {@link _isRubberDuckEnabled}
	 * subprocess env var, or the `COPILOT_GH_HOST` enterprise host env var) has
	 * changed. Any active sessions are disposed before the client is stopped; the
	 * latest values are picked up the next time {@link _ensureClient} runs. If the
	 * client is still starting up, the in-flight start detects the change against
	 * {@link _lastSessionSyncEnabled} / {@link _lastRubberDuckEnabled} /
	 * {@link _lastEnterpriseHost} and aborts so it never comes up stale.
	 */
	private async _restartClientIfStartupConfigChanged(): Promise<void> {
		const sessionSync = this._isSessionSyncEnabled();
		const rubberDuck = this._isRubberDuckEnabled();
		const enterpriseHost = this._getEnterpriseHost();
		if (this._lastSessionSyncEnabled === sessionSync && this._lastRubberDuckEnabled === rubberDuck && this._lastEnterpriseHost === enterpriseHost) {
			return;
		}
		const changed = [
			this._lastSessionSyncEnabled !== sessionSync ? `sessionSync=${sessionSync}` : undefined,
			this._lastRubberDuckEnabled !== rubberDuck ? `rubberDuck=${rubberDuck}` : undefined,
			this._lastEnterpriseHost !== enterpriseHost ? `enterpriseHost=${enterpriseHost}` : undefined,
		].filter((v): v is string => v !== undefined).join(', ');
		this._lastSessionSyncEnabled = sessionSync;
		this._lastRubberDuckEnabled = rubberDuck;
		this._lastEnterpriseHost = enterpriseHost;
		if (this._client) {
			this._logService.info(`[Copilot] Startup config changed (${changed}), restarting CopilotClient`);
			this._sessions.clearAndDisposeAll();
			this._mcpNotificationSubs.clearAndDisposeAll();
			await this._stopClient();
		}
	}

	protected _createCopilotClient(options: CopilotClientOptions): CopilotClient {
		return new CopilotClient(options);
	}

	// ---- auth ---------------------------------------------------------------

	getDescriptor(): IAgentDescriptor {
		return {
			provider: 'copilotcli',
			displayName: 'Copilot',
			description: localize('copilotAgent.description', "Copilot SDK agent running in the local agent host process"),
			capabilities: { multipleChats: { fork: true } },
		};
	}

	getProtectedResources(): ProtectedResourceMetadata[] {
		return [
			this._gitHubEndpointService.getCopilotResource(),
			this._gitHubEndpointService.getRepoResource()
		];
	}

	getCustomizations(): readonly Customization[] {
		return this._plugins.getConfiguredHostCustomizations();
	}

	async getSessionCustomizations(session: URI): Promise<readonly Customization[]> {
		const directory = await this._getSessionCustomizationDirectory(session);
		const activeClient = this._getOrCreateActiveClient(session, directory);
		const fromPlugins = await activeClient.pluginController.getCustomizationsSettled();
		const sessionId = AgentSession.id(session);
		const entry = this._findAnySession(sessionId);
		const topLevelMcp = entry?.topLevelMcpCustomizations() ?? [];
		if (topLevelMcp.length === 0) {
			return fromPlugins;
		}
		return [...fromPlugins, ...topLevelMcp];
	}

	async handleMcpRequest(session: URI, serverName: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		const sessionId = AgentSession.id(session);
		const entry = this._findAnySession(sessionId);
		if (!entry) {
			throw new Error(`Method not found: no active session ${sessionId}`);
		}
		return entry.handleMcpRequest(serverName, method, params);
	}

	async startMcpServer(session: URI, id: string): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._findAnySession(sessionId)?.startMcpServer(id);
	}

	async stopMcpServer(session: URI, id: string): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._findAnySession(sessionId)?.stopMcpServer(id);
	}

	private async _getSessionCustomizationDirectory(session: URI): Promise<URI | undefined> {
		const sessionId = AgentSession.id(session);
		const provisional = this._provisionalSessions.get(sessionId);
		if (provisional) {
			return provisional.workingDirectory;
		}
		const entry = this._findAnySession(sessionId);
		const metadata = entry ? undefined : await this._readSessionMetadata(session);
		// For non-provisional sessions the anchor follows the working directory
		// (the worktree). Prefer it over a persisted `customizationDirectory`,
		// which older sessions stored as the original user-picked folder.
		return entry?.customizationDirectory ?? metadata?.workingDirectory ?? metadata?.customizationDirectory;
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource === this._gitHubEndpointService.getRepoResource().resource) {
			return true;
		}
		if (resource !== this._gitHubEndpointService.getCopilotResource().resource) {
			return false;
		}
		const tokenChanged = this._githubToken !== token;
		this._githubToken = token;
		this._updateRestrictedTelemetry(token);
		this._logService.info(`[Copilot] Auth token ${tokenChanged ? 'updated' : 'unchanged'}`);
		if (tokenChanged) {
			await this._restartClientIfProxyChanged();
			void this._refreshModels();
		}
		return true;
	}

	async handleAuthenticationToken(params: AuthenticateParams): Promise<boolean> {
		let handled = false;
		for (const [, entry] of this._sessions) {
			for (const session of entry.allChatSessions()) {
				const didHandle = await session.resolveMcpAuthentication(params);
				handled ||= didHandle;
			}
		}
		return handled;
	}

	private _updateRestrictedTelemetry(githubToken: string | undefined): void {
		// Safe default synchronously: keep restricted/enhanced telemetry disabled until the minted
		// CAPI Copilot session token confirms the `rt=1` opt-in. The GitHub token here carries no
		// `rt`/`tid` claims — those live in the Copilot session token, which the API service mints —
		// so the real values are resolved asynchronously below. Mirrors how the Copilot extension
		// reads `rt`/`tid` off its `CopilotToken` rather than the GitHub token.
		this._applyRestrictedTelemetry(false, undefined, undefined);
		if (githubToken) {
			void this._resolveRestrictedTelemetry(githubToken);
		}
	}

	private async _resolveRestrictedTelemetry(githubToken: string): Promise<void> {
		try {
			const ctx = await this._copilotApiService.resolveRestrictedTelemetryContext(githubToken);
			if (this._githubToken !== githubToken) {
				return; // token changed while resolving; a newer call owns the state
			}
			this._applyRestrictedTelemetry(
				ctx.restrictedTelemetryEnabled,
				ctx.trackingId,
				ctx.telemetryEndpoint ? `${ctx.telemetryEndpoint}/telemetry` : undefined,
			);
		} catch (err) {
			this._logService.debug(`[Copilot] Restricted telemetry resolution failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private _applyRestrictedTelemetry(rtEnabled: boolean, trackingId: string | undefined, telemetryEndpoint: string | undefined): void {
		if (rtEnabled !== this._restrictedTelemetryEnabled) {
			this._restrictedTelemetryEnabled = rtEnabled;
			this._logService.info(`[Copilot] Enhanced (restricted) telemetry ${rtEnabled ? 'enabled for this account' : 'disabled'}`);
			this._onDidChangeRestrictedTelemetry.fire();
		}
		// Push the token-derived telemetry policy/identity to the restricted sender: `rt` gates
		// enhanced GH telemetry (kept off for public users), `tid` becomes `copilot_trackingId`, and
		// the endpoint routes at the user's CAPI telemetry host (dotcom, GHE, or proxy).
		if (isAgentHostTelemetryService(this._telemetryService)) {
			this._telemetryService.setRestrictedTelemetryEnabled(rtEnabled);
			this._telemetryService.setCopilotTrackingId(trackingId);
			this._telemetryService.setRestrictedTelemetryEndpoint(telemetryEndpoint);
		}
	}

	private async _refreshModels(attempt = 0): Promise<void> {
		// A fresh refresh (e.g. a token change) supersedes any scheduled retry.
		this._modelRefreshRetry.clear();

		// Once teardown has begun, skip the refresh entirely: a retry timer that
		// fires during the shutdown window would otherwise call `_ensureClient()`
		// and resurrect the SDK subprocess after `shutdown()` tore it down.
		if (this._shutdownPromise) {
			return;
		}

		const tokenAtRefreshStart = this._githubToken;
		if (!tokenAtRefreshStart) {
			this._capiModels = [];
			this._publishModels();
			return;
		}
		try {
			const models = await this._listModels(tokenAtRefreshStart);
			if (this._githubToken === tokenAtRefreshStart) {
				this._capiModels = models;
				this._publishModels();
			}
		} catch (err) {
			// Token rotated mid-flight — a newer refresh owns the result — or
			// teardown began while the request was in flight, in which case a
			// retry would just resurrect the client we are tearing down.
			if (this._githubToken !== tokenAtRefreshStart || this._shutdownPromise) {
				return;
			}
			if (attempt + 1 < this._modelRefreshMaxAttempts) {
				const delay = this._modelRefreshBackoff(attempt);
				this._logService.warn(`[Copilot] Failed to refresh models (attempt ${attempt + 1}), retrying in ${delay}ms`, err);
				this._modelRefreshRetry.value = disposableTimeout(() => {
					void this._refreshModels(attempt + 1);
				}, delay);
				return;
			}
			// Retries exhausted: surface the error but keep the last-known CAPI
			// list so a transient failure never wipes a previously loaded, good
			// model list. Republish so a concurrently-updated BYOK list still
			// shows through.
			this._logService.error(err, '[Copilot] Failed to refresh models');
			this._publishModels();
		}
	}

	/**
	 * Re-emit the merged CAPI + BYOK model list to the picker. A fresh array is
	 * allocated each call so the observable always notifies its consumers.
	 */
	private _publishModels(): void {
		this._models.set([...this._capiModels, ...this._byokModels], undefined);
	}

	/**
	 * (Re)publish the renderer BYOK models from the bridge registry's serving
	 * window. Triggered when any renderer bridge connects, disconnects, or
	 * reports a model change — the registry owns enumeration (with its own
	 * connect-time retry) and caches the serving window's models, so this is a
	 * cheap synchronous read of that cache.
	 *
	 * Each model is surfaced under the provider-qualified id `vendor/id` so a
	 * selection round-trips to the per-session provider config synthesized by
	 * `resolveByokSessionConfig`.
	 */
	private _refreshByokModels(): void {
		if (this._shutdownPromise) {
			return;
		}
		this._byokModels = this._byokBridgeRegistry.getModels().map((m): IAgentModelInfo => {
			const byokMeta = createAgentModelByokMeta(m.modelIdentifier);
			return {
				provider: this.id,
				id: `${m.vendor}/${m.id}`,
				name: m.name ?? m.id,
				maxContextWindow: m.maxContextWindowTokens,
				supportsVision: m.supportsVision ?? false,
				...(byokMeta && { _meta: byokMeta }),
			};
		});
		this._logService.trace(`[Copilot] Found ${this._byokModels.length} BYOK models${this._byokModels.length ? ': ' + this._byokModels.map(m => m.name).join(', ') : ''}`);
		this._publishModels();
	}

	/**
	 * Equal-jitter exponential backoff for model-refresh retries. Doubles the
	 * base delay per attempt (capped at {@link _modelRefreshMaxDelayMs}) and
	 * picks a random point in the upper half of that window, so the returned
	 * delay lands in `[exp/2, exp]`. The jitter avoids synchronized retries
	 * across windows/agents hitting a shared rate limit, while the `exp/2`
	 * floor keeps a minimum spacing between attempts.
	 */
	private _modelRefreshBackoff(attempt: number): number {
		const exp = Math.min(this._modelRefreshMaxDelayMs, this._modelRefreshBaseDelayMs * 2 ** attempt);
		return Math.round(exp / 2 + Math.random() * (exp / 2));
	}

	private async _stopClient(): Promise<void> {
		const client = this._client;
		this._client = undefined;
		this._clientStarting = undefined;
		await client?.stop();
		// The runtime subprocess is now dead, so it is safe to release the BYOK
		// proxy handle: the next session launch mints a fresh nonce. See the
		// ownership invariant on `CopilotSessionLauncher.disposeByokProxyHandle`.
		await this._sessionLauncher.disposeByokProxyHandle();
	}

	/**
	 * Enables plan mode by injecting `requestExitPlanMode: true` into the
	 * payload of every `session.create` / `session.resume` JSON-RPC request,
	 * and registers a connection-level handler for the resulting
	 * `exitPlanMode.request` RPC the CLI sends back.
	 *
	 * The SDK (`@github/copilot-sdk@^0.3.0`) does not expose `onExitPlanMode`
	 * in its public {@link SessionConfig} surface, so both the wire flag and
	 * the response handler are wired through the SDK's private
	 * `MessageConnection`. Once the SDK adds first-class support, this shim
	 * should be removed.
	 */
	protected _enablePlanModeOnClient(client: CopilotClient): void {
		// `connection` is declared private on `CopilotClient` at the type
		// level but is a plain field at runtime — see the SDK's compiled
		// `dist/client.js`.
		const connection = (client as unknown as { connection?: IExitPlanModeConnection }).connection;
		if (!connection) {
			this._logService.warn('[Copilot] Could not enable plan mode: client.connection is null');
			return;
		}
		if (typeof connection.sendRequest !== 'function') {
			this._logService.warn(`[Copilot] Could not enable plan mode: client.connection.sendRequest is ${typeof connection.sendRequest}`);
			return;
		}
		if (typeof connection.onRequest !== 'function') {
			this._logService.warn(`[Copilot] Could not enable plan mode: client.connection.onRequest is ${typeof connection.onRequest}`);
			return;
		}
		const originalSendRequest = connection.sendRequest.bind(connection);
		connection.sendRequest = (method: string, params: unknown) => {
			if ((method === 'session.create' || method === 'session.resume') && params && typeof params === 'object') {
				return originalSendRequest(method, { ...params as Record<string, unknown>, requestExitPlanMode: true });
			}
			return originalSendRequest(method, params);
		};
	}

	// ---- client lifecycle ---------------------------------------------------

	private async _ensureClient(): Promise<CopilotClient> {
		if (this._client) {
			return this._client;
		}
		if (this._clientStarting) {
			return this._clientStarting;
		}
		// Snapshot the startup config so we can detect a change that lands while the
		// client is still starting and abort the stale start (the values are baked
		// into the client options / subprocess env below).
		const sessionSyncAtStartup = this._isSessionSyncEnabled();
		const rubberDuckAtStartup = this._isRubberDuckEnabled();
		const enterpriseHostAtStartup = this._getEnterpriseHost();
		const clientStarting = (async () => {
			this._logService.info('[Copilot] Starting CopilotClient...');

			// Build a clean env for the CLI subprocess, stripping Electron/VS Code vars
			// that can interfere with the Node.js process the SDK spawns.
			const env: Record<string, string | undefined> = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
			delete env['NODE_OPTIONS'];
			delete env['VSCODE_INSPECTOR_OPTIONS'];
			delete env['VSCODE_ESM_ENTRYPOINT'];
			delete env['VSCODE_HANDLES_UNCAUGHT_ERRORS'];
			for (const key of Object.keys(env)) {
				if (key === 'ELECTRON_RUN_AS_NODE') {
					continue;
				}
				if (key === 'VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE') {
					// used for running the CLI in a test harness against a mock CAPI server
					continue;
				}
				if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
					delete env[key];
				}
			}
			env['COPILOT_CLI_RUN_AS_NODE'] = '1';
			env['USE_BUILTIN_RIPGREP'] = 'false';
			env['COPILOT_MCP_APPS'] = 'true';
			await this._configureProxyEnv(env);

			// On Linux the MXC bubblewrap sandbox backend does not forward a PTY into
			// the container, so the CLI's default PTY-backed interactive shell can
			// never start bash under the sandbox: the inner shell sees a non-tty
			// stdin, runs non-interactively, reads EOF and exits immediately, which
			// surfaces as "Failed to start bash process". Force the CLI's pipe-based
			// spawn shell backend (`SHELL_SPAWN_BACKEND`), which runs each command as
			// a one-shot child process and works correctly under bubblewrap. The CLI
			// already force-enables this on Alpine/musl; glibc Linux needs it too for
			// sandboxed shells. This becomes a no-op once the bundled CLI defaults the
			// spawn backend on for all of Linux.
			if (process.platform === 'linux') {
				const enabledFlags = env['COPILOT_CLI_ENABLED_FEATURE_FLAGS'];
				const flags = new Set((enabledFlags ?? '').split(',').map(f => f.trim()).filter(Boolean));
				flags.add('SHELL_SPAWN_BACKEND');
				env['COPILOT_CLI_ENABLED_FEATURE_FLAGS'] = [...flags].join(',');
			}

			// Identify VS Code's agent host traffic in CAPI
			env['GITHUB_COPILOT_INTEGRATION_ID'] = COPILOT_INTEGRATION_ID;
			this._logService.info(`[Copilot] Set CLI env: GITHUB_COPILOT_INTEGRATION_ID=${COPILOT_INTEGRATION_ID}`);

			// Point the Copilot CLI at a configured GitHub Enterprise host for its
			// authentication and CAPI endpoint discovery. `COPILOT_GH_HOST` is
			// Copilot-CLI-specific (it does not affect the `gh` CLI). Unset for
			// github.com so the CLI uses its default host.
			const enterpriseHost = this._getEnterpriseHost();
			if (enterpriseHost) {
				env['COPILOT_GH_HOST'] = enterpriseHost;
				this._logService.info(`[Copilot] Set CLI env: COPILOT_GH_HOST=${enterpriseHost}`);
			}

			// Enable the rubber duck critic subagent in the CLI when the agent host
			// config opts in. `RUBBER_DUCK_AGENT` is the SDK's required interface for
			// gating this experimental feature
			if (this._isRubberDuckEnabled()) {
				env['RUBBER_DUCK_AGENT'] = 'true';
			} else {
				delete env['RUBBER_DUCK_AGENT'];
			}

			// Resolve the CLI entry point and native SDK binaries from node_modules.
			// In the desktop app these live next to the ASAR archive in
			// `node_modules.asar.unpacked` (the `@github/copilot-<platform>` CLI and
			// the `@microsoft/mxc-sdk/bin` executables are unpacked so they can be
			// spawned), while in dev and on the server (which has no ASAR) they live
			// in a plain `node_modules`.
			// We can't use require.resolve() because @github/copilot's exports map
			// blocks direct subpath access.
			const nodeModulesUri = FileAccess.asFileUri(getAppNodeModulesPath());
			const cliPath = await resolveCopilotCliPath(nodeModulesUri);

			// The SDK's sandbox auto-detection looks for `<MXC_BIN_DIR>/<arch>/wxc-exec.exe`
			// (and the Linux/macOS equivalents). VS Code core ships the MXC sandbox binaries
			// at `<nodeModules>/@microsoft/mxc-sdk/bin/<arch>/`, so point `MXC_BIN_DIR` there.
			// The @github/copilot package's own `mxc-bin/` is excluded from the product build
			// (see build/.moduleignore), mirroring `CopilotCLISDK.getPackage` in the extension.
			env['MXC_BIN_DIR'] = URI.joinPath(nodeModulesUri, '@microsoft', 'mxc-sdk', 'bin').fsPath;

			// Add VS Code's built-in ripgrep to PATH so the CLI subprocess can find it.
			const resolvedRgDiskPath = await rgDiskPath();
			const rgDir = dirname(resolvedRgDiskPath);
			// On Windows the env key is typically "Path" (not "PATH"). Since we copied
			// process.env into a plain (case-sensitive) object, we must find the actual key.
			const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') ?? 'PATH';
			const currentPath = env[pathKey];
			env[pathKey] = currentPath ? `${currentPath}${delimiter}${rgDir}` : rgDir;
			this._logService.info(`[Copilot] Resolved CLI path: ${cliPath}`);

			const telemetry = await this._otelService.getSdkTelemetryConfig();

			const clientOptions: CopilotClientOptions = {
				useLoggedInUser: false,
				connection: RuntimeConnection.forStdio({ path: cliPath }),
				env,
				telemetry,
				logLevel: copilotCliLogLevelFor(this._logService.getLevel()),
				enableRemoteSessions: this._isSessionSyncEnabled(),
			};
			const client = this._createCopilotClient(clientOptions);
			await client.start();
			if (this._isSessionSyncEnabled() !== sessionSyncAtStartup || this._isRubberDuckEnabled() !== rubberDuckAtStartup || this._getEnterpriseHost() !== enterpriseHostAtStartup) {
				await client.stop();
				throw new Error('Copilot startup config changed while the client was starting');
			}
			this._logService.info('[Copilot] CopilotClient started successfully');
			this._enablePlanModeOnClient(client);
			this._client = client;
			this._clientStarting = undefined;
			return client;
		})();
		this._clientStarting = clientStarting;
		void clientStarting.catch(() => {
			this._clientStarting = undefined;
		});
		return clientStarting;
	}

	// ---- session management -------------------------------------------------

	private _createThinkingLevelConfigSchemaProperty(supportedReasoningEfforts: readonly string[] | undefined, defaultReasoningEffort: string | undefined): ConfigPropertySchema | undefined {
		if (!supportedReasoningEfforts?.length) {
			return undefined;
		}

		return {
			type: 'string',
			title: localize('copilot.modelThinkingLevel.title', "Thinking Level"),
			description: localize('copilot.modelThinkingLevel.description', "Controls how much reasoning effort the model uses."),
			default: defaultReasoningEffort,
			enum: [...supportedReasoningEfforts],
			enumLabels: supportedReasoningEfforts.map(getReasoningEffortLabel),
			enumDescriptions: supportedReasoningEfforts.map(value => getReasoningEffortDescription(value) ?? ''),
		};
	}

	/**
	 * Synthesize a `contextSize` config property when the model exposes a `long_context` pricing tier with a distinct
	 * context-max. Picker surfaces this as the "Context Size" button. Mirrors `getContextSizeOptions` in
	 * `extensions/copilot/src/extension/chat/vscode-node/languageModelAccess.ts`.
	 *
	 * The `enum` values are the two context-window sizes (in tokens), smallest first, so the numeric token counts
	 * flow to the client. The chosen value comes back in the model's `config` bag and is mapped to the SDK's
	 * two-valued `contextTier` at the SDK boundary by {@link getCopilotContextTier}, using the model's long-context
	 * window from {@link _longContextWindowFor}.
	 *
	 * `billing.tokenPrices` is present on the runtime CAPI `/models` payload but not yet declared on the published SDK
	 * `ModelBilling` type — narrow through {@link ICAPIModelBilling} until the SDK catches up.
	 */
	private _createContextSizeConfigSchemaProperty(billing: ModelInfo['billing'] | undefined): ConfigPropertySchema | undefined {
		const tokenPrices = billing?.tokenPrices;
		const defaultMax = tokenPrices?.contextMax;
		const longContextMax = tokenPrices?.longContext?.contextMax;
		if (!defaultMax || !longContextMax || defaultMax >= longContextMax) {
			return undefined;
		}

		// When both tiers cost the same and the user prefers long context, show only the long-context option as a non-switchable indicator. See microsoft/vscode#322950, microsoft/vscode#323116.
		if (this._isPreferLongContextEnabled() && !hasLongContextSurcharge(billing as ICAPIModelBilling | undefined)) {
			return {
				type: 'number',
				title: localize('copilot.modelContextSize.title', "Context Size"),
				description: localize('copilot.modelContextSize.description', "Selects the context window size for this model."),
				default: longContextMax,
				enum: [longContextMax],
				enumLabels: [formatTokenCount(longContextMax)],
				enumDescriptions: [
					localize('copilot.modelContextSize.longerSessions', "Longer sessions"),
				],
			};
		}

		return {
			type: 'number',
			title: localize('copilot.modelContextSize.title', "Context Size"),
			description: localize('copilot.modelContextSize.description', "Selects the context window size for this model."),
			default: defaultMax,
			enum: [defaultMax, longContextMax],
			enumLabels: [formatTokenCount(defaultMax), formatTokenCount(longContextMax)],
			enumDescriptions: [
				localize('copilot.modelContextSize.default', "Default"),
				localize('copilot.modelContextSize.longerSessions', "Longer sessions"),
			],
		};
	}

	/**
	 * The model's long-context window (in tokens): the largest size offered by its "Context Size" picker
	 * (the max numeric value in the synthesized `contextSize` {@link ConfigPropertySchema.enum}). Used by
	 * {@link getCopilotContextTier} to decide whether a numeric selection opts into `long_context`.
	 * Returns `undefined` when the model exposes no such picker (or the model list isn't loaded yet),
	 * leaving the SDK on its default tier.
	 */
	private _longContextWindowFor(modelId: string | undefined): number | undefined {
		if (!modelId) {
			return undefined;
		}
		const windows = this._models.get().find(m => m.id === modelId)?.configSchema?.properties?.[ContextSizeConfigKey]?.enum;
		const numericWindows = windows?.filter((w): w is number => typeof w === 'number');
		return numericWindows && numericWindows.length > 0 ? Math.max(...numericWindows) : undefined;
	}

	/**
	 * Whether the model has a long-context window available at no additional cost.
	 * When true the model should always run in `long_context` tier without showing
	 * a context-size picker.
	 */
	private _isFreeLongContext(modelId: string | undefined): boolean {
		return !!modelId && this._freeLongContextModels.has(modelId);
	}

	/**
	 * Builds the open `_meta` pricing bag for a model from its billing info so the chat model picker can render its
	 * cost hover. Delegates to the shared {@link createPricingMetaFromBilling} helper.
	 */
	private _createModelPricingMeta(modelInfo: ModelInfo | undefined): Record<string, unknown> | undefined {
		const billing = modelInfo?.billing as ICAPIModelBilling | undefined;
		const priceCategory = typeof modelInfo?.modelPickerPriceCategory === 'string' ? modelInfo.modelPickerPriceCategory : undefined;
		return createPricingMetaFromBilling(billing, priceCategory);
	}

	private _createModelConfigSchema(m: ModelInfo): ConfigSchema | undefined {
		const properties: ConfigSchema['properties'] = {};
		const thinkingLevel = this._createThinkingLevelConfigSchemaProperty(m.supportedReasoningEfforts, m.defaultReasoningEffort);
		if (thinkingLevel) {
			properties[ThinkingLevelConfigKey] = thinkingLevel;
		}
		const contextSize = this._createContextSizeConfigSchemaProperty(m.billing);
		if (contextSize) {
			properties[ContextSizeConfigKey] = contextSize;
		}
		if (Object.keys(properties).length === 0) {
			return undefined;
		}
		return { type: 'object', properties };
	}

	private _serializeModelSelection(model: ModelSelection): string {
		return JSON.stringify(model);
	}

	private _parseModelSelection(raw: string | undefined): ModelSelection | undefined {
		if (!raw) {
			return undefined;
		}

		try {
			const value: ISerializedModelSelection | string | number | boolean | null = JSON.parse(raw);
			if (value && typeof value === 'object' && typeof value.id === 'string') {
				const modelSelection: ModelSelection = { id: value.id };
				if (value.config && typeof value.config === 'object') {
					const config: Record<string, string> = {};
					for (const [key, configValue] of Object.entries(value.config)) {
						if (typeof configValue === 'string') {
							config[key] = configValue;
						}
					}
					if (Object.keys(config).length > 0) {
						modelSelection.config = config;
					}
				}
				return modelSelection;
			}
		} catch {
			// Older session metadata stored the raw model id as a plain string.
		}

		return { id: raw };
	}

	private _serializeAgentSelection(agent: AgentSelection): string {
		return JSON.stringify({ uri: agent.uri });
	}

	private _parseAgentSelection(raw: string | undefined): AgentSelection | undefined {
		if (!raw) {
			return undefined;
		}
		try {
			const value: unknown = JSON.parse(raw);
			if (value && typeof value === 'object' && typeof (value as AgentSelection).uri === 'string') {
				return { uri: (value as AgentSelection).uri };
			}
		} catch {
			// Bad / stale metadata — treat as unset.
		}
		return undefined;
	}

	/**
	 * Resolves an {@link AgentSelection}'s SDK-facing name from the plugin
	 * snapshot that is, or will be, applied to the SDK session.
	 */
	private _resolveAgentName(snapshot: IActiveClientSnapshot, agent: AgentSelection): string | undefined {
		for (const plugin of snapshot.plugins) {
			const found = plugin.agents.find(a => a.uri.toString() === agent.uri);
			if (found) {
				return found.name;
			}
		}
		return undefined;
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		this._logService.info('[Copilot] Listing sessions...');
		const client = await this._ensureClient();
		const sessions = await client.listSessions();
		const projectLimiter = new Limiter<IAgentSessionProjectInfo | undefined>(4);
		const projectByContext = new Map<string, Promise<IAgentSessionProjectInfo | undefined>>();
		const mapped = await Promise.all(sessions.map(async s => {
			const session = AgentSession.uri(this.id, s.sessionId);
			const metadata = await this._readStoredSessionMetadata(session);
			if (!metadata) {
				return undefined;
			}
			let { project, resolved } = metadata;
			if (!resolved) {
				project = await this._resolveSessionProject(s.context, projectLimiter, projectByContext);
				void this._storeSessionProjectResolution(session, project);
			}
			const workingDirectory = metadata.workingDirectory ?? (typeof s.context?.workingDirectory === 'string' ? URI.file(s.context.workingDirectory) : undefined);
			const result: IAgentSessionMetadata = {
				session,
				startTime: s.startTime.getTime(),
				modifiedTime: s.modifiedTime.getTime(),
				project,
				summary: s.summary,
				workingDirectory,
				customizationDirectory: metadata.customizationDirectory,
			};
			return result;
		}));
		const result = mapped.filter((s): s is IAgentSessionMetadata => s !== undefined);
		this._logService.info(`[Copilot] Found ${result.length} sessions`);
		return result;
	}

	async getSessionMetadata(session: URI): Promise<IAgentSessionMetadata | undefined> {
		const sessionId = AgentSession.id(session);
		const storedMetadata = await this._readStoredSessionMetadata(session);
		if (!storedMetadata) {
			return undefined;
		}

		const client = await this._ensureClient();
		const sessionMetadata = await client.getSessionMetadata(sessionId);
		if (!sessionMetadata) {
			return undefined;
		}

		let project = storedMetadata?.project;
		if (storedMetadata && !storedMetadata.resolved) {
			const projectLimiter = new Limiter<IAgentSessionProjectInfo | undefined>(1);
			project = await this._resolveSessionProject(sessionMetadata?.context, projectLimiter, new Map<string, Promise<IAgentSessionProjectInfo | undefined>>());
			void this._storeSessionProjectResolution(session, project);
		}

		const workingDirectory = storedMetadata?.workingDirectory ?? (typeof sessionMetadata?.context?.workingDirectory === 'string' ? URI.file(sessionMetadata.context.workingDirectory) : undefined);
		return {
			session,
			startTime: sessionMetadata?.startTime.getTime() ?? Date.now(),
			modifiedTime: sessionMetadata?.modifiedTime.getTime() ?? Date.now(),
			project,
			summary: sessionMetadata?.summary,
			workingDirectory,
			customizationDirectory: storedMetadata?.customizationDirectory,
		};
	}

	private async _listModels(gitHubToken: string): Promise<IAgentModelInfo[]> {
		this._logService.info('[Copilot] Listing models...');
		const client = await this._ensureClient();
		const { models } = await client.rpc.models.list({ gitHubToken });
		this._freeLongContextModels.clear();
		const preferLongContext = this._isPreferLongContextEnabled();
		const result = models.map((m): IAgentModelInfo => {
			const configSchema = this._createModelConfigSchema(m);
			// A model has free long context (larger window, no surcharge), but only treat it as free when the user prefers long context.
			const tokenPrices = m.billing?.tokenPrices;
			const hasLargerLongContext = !!tokenPrices?.contextMax
				&& !!tokenPrices.longContext?.contextMax
				&& tokenPrices.longContext.contextMax > tokenPrices.contextMax;
			if (preferLongContext && hasLargerLongContext && !hasLongContextSurcharge(m.billing as ICAPIModelBilling | undefined)) {
				this._freeLongContextModels.add(m.id);
			}
			return {
				provider: this.id,
				id: m.id,
				name: m.name,
				// Synthetic SDK entries like `auto` ship with `capabilities: {}` and
				// no fixed context window — surface them with maxContextWindow undefined.
				maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
				maxOutputTokens: m.capabilities?.limits?.max_output_tokens,
				maxPromptTokens: m.capabilities?.limits?.max_prompt_tokens,
				supportsVision: !!m.capabilities?.supports?.vision,
				configSchema,
				policyState: m.policy?.state as PolicyState | undefined,
				_meta: this._createModelPricingMeta(m),
			};
		});
		this._logService.info(`[Copilot] Found ${result.length} models: ${result.map(m => m.name).join(', ')}`);
		return result;
	}

	/**
	 * Resolves the working directory for a {@link createSession} call: the caller-supplied folder, else a
	 * still-provisional session's folder for an idempotent re-create, else — when the session is workspace-less
	 * (no `workingDirectory` supplied) — a stable per-session scratch directory.
	 */
	private async _resolveCreateWorkingDirectory(sessionConfig: IAgentCreateSessionConfig, sessionId: string, isWorkspaceless: boolean): Promise<URI> {
		const existing = sessionConfig.workingDirectory ?? this._provisionalSessions.get(sessionId)?.workingDirectory;
		if (existing) {
			return existing;
		}
		// A workspace-less session (inferred from an absent input
		// `workingDirectory`) gets a STABLE, deterministic per-session scratch
		// dir (mirroring the GitHub app's `<copilotHome>/chats/<id>`) rather than
		// a throwaway `os.tmpdir()` dir, so the cwd survives reloads and isn't
		// lost to OS temp reaping.
		if (isWorkspaceless) {
			const scratchDir = this._workspacelessScratchDir(sessionId);
			await fs.mkdir(scratchDir.fsPath, { recursive: true });
			return scratchDir;
		}
		const tmpPath = await fs.mkdtemp(join(os.tmpdir(), 'agent-host-session-'));
		const workingDirectory = URI.file(tmpPath);
		this._logService.trace(`[Copilot] No workingDirectory provided, defaulting to temp directory: ${workingDirectory.fsPath}`);
		return workingDirectory;
	}

	/**
	 * Stable per-session scratch directory for a workspace-less chat:
	 * `<userHome>/.copilot/chats/<sessionId>`. Deterministic, persistent, and
	 * cleaned up on session delete (see {@link _cleanupWorkspacelessScratchDir}).
	 */
	private _workspacelessScratchDir(sessionId: string): URI {
		return workspacelessScratchDir(this._environmentService.userHome, sessionId);
	}

	/** Ensures a workspace-less chat's scratch dir exists (mkdir -p), recreating it if it was reaped. */
	private async _ensureWorkspacelessScratchDir(scratchDir: URI, sessionId: string): Promise<void> {
		try {
			await fs.mkdir(scratchDir.fsPath, { recursive: true });
			this._logService.trace(`[Copilot:${sessionId}] Workspace-less scratch directory ready: ${scratchDir.fsPath}`);
		} catch (error) {
			this._logService.warn(`[Copilot:${sessionId}] Failed to ensure workspace-less scratch directory '${scratchDir.fsPath}': ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/** Removes a workspace-less chat's stable scratch dir on session delete/dispose. */
	private async _cleanupWorkspacelessScratchDir(scratchDir: URI, sessionId: string): Promise<void> {
		try {
			await fs.rm(scratchDir.fsPath, { recursive: true, force: true });
			this._logService.trace(`[Copilot:${sessionId}] Removed workspace-less scratch directory: ${scratchDir.fsPath}`);
		} catch (error) {
			this._logService.warn(`[Copilot:${sessionId}] Failed to remove workspace-less scratch directory '${scratchDir.fsPath}': ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	// ---- Chat surface ------------------------------------------------------
	//
	// The chat-addressed operation surface (see
	// {@link IAgent.chats}). The orchestrator owns the feature-level
	// `(session, chat)` mapping and hands these methods a single,
	// concrete chat channel URI: the default chat channel or an additional
	// peer chat channel. Each method re-derives the `(session, chat)` pair
	// the agent's internal SDK storage is keyed by via
	// {@link _resolveChatTarget}.

	/**
	 * Maps a resolved chat URI to the `(session, chat)` pair the agent's
	 * internal storage is keyed by. A peer (`ahp-chat`) chat carries its
	 * owning session in its URI. The default chat is addressed by its
	 * deterministic chat channel URI.
	 */
	private _resolveChatTarget(chat: URI): { session: URI; chat: URI } {
		const parsed = parseChatUri(chat);
		if (!parsed) {
			throw new Error(`Copilot chat operation requires an AHP chat URI: ${chat.toString()}`);
		}
		return { session: URI.parse(parsed.session), chat: chat };
	}

	private _getChatContext(chatOrSession: URI): { session: URI; sessionId: string; chatKey: string; target: CopilotAgentSession | undefined; isPeerChat: boolean } {
		// Accept either a chat channel URI or a bare session URI: per the AHP
		// convention the default chat's URI equals the session URI, so callers
		// that address the default chat by the session URI resolve here in one
		// place rather than each operational method re-deriving it.
		const chat = parseChatUri(chatOrSession) ? chatOrSession : URI.parse(buildDefaultChatUri(chatOrSession));
		const session = URI.parse(parseRequiredSessionUriFromChatUri(chat));
		const sessionId = AgentSession.id(session);
		const chatKey = chat.toString();
		const resolved = this._sessions.get(sessionId)?.resolveChat(chatKey);
		return {
			session,
			sessionId,
			chatKey,
			target: resolved?.chatSession,
			isPeerChat: resolved ? !resolved.isDefault : chatKey !== buildDefaultChatUri(session),
		};
	}

	/**
	 * Resolve the session's materialized default (main) chat by raw session id,
	 * or `undefined` when the session is provisional or not in memory. The
	 * default chat is the primary {@link CopilotAgentSession} of the owning
	 * {@link CopilotSessionEntry}.
	 */
	private _findAnySession(sessionId: string): CopilotAgentSession | undefined {
		return this._sessions.get(sessionId)?.defaultChat;
	}

	/**
	 * Resolve a live peer (non-default) chat — its own SDK chat — by
	 * looking it up within the owning session's entry. Returns `undefined` when
	 * the session (or the peer chat) is not in memory.
	 */
	private _findPeerChat(session: URI, chat: URI): CopilotAgentSession | undefined {
		return this._sessions.get(AgentSession.id(session))?.getPeerChat(chat.toString());
	}

	/**
	 * Return the owning session's entry, creating an empty one (no default chat
	 * yet) if needed so a peer chat can be hosted on a still-provisional parent.
	 */
	private _ensureEntry(sessionId: string): CopilotSessionEntry {
		let entry = this._sessions.get(sessionId);
		if (!entry) {
			entry = new CopilotSessionEntry();
			this._sessions.set(sessionId, entry);
		}
		return entry;
	}

	/**
	 * Chat-addressed surface for the chats within a session.
	 */
	readonly chats: IAgentChats = {
		createChat: (chat: URI, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> => {
			return this._createChat(chat, options);
		},
		fork: (chat: URI, source: IAgentCreateChatForkSource, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> => {
			return this._createChat(chat, { ...options, fork: source });
		},
		disposeChat: (chatUri: URI): Promise<void> => {
			const { session, chat } = this._resolveChatTarget(chatUri);
			return this._disposeChat(session, chat);
		},
		sendMessage: (chatUri: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, senderClientId?: string): Promise<void> => {
			return this._sendMessage(chatUri, prompt, attachments, turnId, senderClientId);
		},
		abort: (chatUri: URI): Promise<void> => {
			return this._abortSession(chatUri);
		},
		changeModel: (chatUri: URI, model: ModelSelection): Promise<void> => {
			return this._changeModel(chatUri, model);
		},
		changeAgent: (chatUri: URI, agent: AgentSelection | undefined): Promise<void> => {
			return this._changeAgent(chatUri, agent);
		},
		getMessages: (chat: URI): Promise<readonly Turn[]> => {
			return this.getSessionMessages(chat);
		},
	};

	async createSession(config?: IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult> {
		const sessionConfig = config ?? {};

		this._logService.info(`[Copilot] Creating session... ${sessionConfig.model ? `model=${sessionConfig.model.id}` : ''}`);
		const sessionId = sessionConfig.session ? AgentSession.id(sessionConfig.session) : generateUuid();
		// Workspace-less is inferred at create from an absent input
		// `workingDirectory`: such a session is run in a stable scratch dir. The
		// AH service persists the marker centrally (`agentHost.workspaceless`) and
		// hands it back on restore; the agent only reads it (never persists it) to
		// pick the workspace-less system prompt. Forks always inherit the source
		// session's context, so they are never inferred workspace-less even when no
		// `workingDirectory` is passed.
		const isWorkspaceless = !sessionConfig.fork && !sessionConfig.workingDirectory;
		const workingDirectory = await this._resolveCreateWorkingDirectory(sessionConfig, sessionId, isWorkspaceless);
		const client = await this._ensureClient();
		// When forking, use the SDK's sessions.fork RPC. Forking from a source
		// session that has no turns is equivalent to creating a fresh session;
		// in that case the agent service drops `config.fork` before calling us,
		// so we never enter this branch with a provisional source.
		if (sessionConfig.fork) {
			const sourceSessionId = AgentSession.id(sessionConfig.fork.session);

			// Serialize against the source session to prevent concurrent
			// modifications while we read its state.
			return this._sessionSequencer.queue(sourceSessionId, async () => {
				this._logService.info(`[Copilot] Forking session ${sourceSessionId} at turnId=${sessionConfig.fork!.turnId}`);

				const sourceEntry = this._findAnySession(sourceSessionId) ?? await this._resumeSession(sourceSessionId);

				// Look up the SDK event ID for the turn *after* the fork point.
				// toEventId is exclusive — events before it are included.
				// If there's no next turn, omit toEventId to include all events.
				const toEventId = await sourceEntry.getNextTurnEventId(sessionConfig.fork!.turnId);

				const forkResult = await client.rpc.sessions.fork({
					sessionId: sourceSessionId,
					...(toEventId ? { toEventId } : {}),
				});
				const newSessionId = forkResult.sessionId;

				// Copy the source session's database using VACUUM INTO so the
				// forked session inherits turn event IDs and file-edit snapshots.
				// VACUUM INTO is safe even while the source DB is open.
				const targetDbDir = this._sessionDataService.getSessionDataDirById(newSessionId);
				const targetDbPath = URI.joinPath(targetDbDir, SESSION_DB_FILENAME);
				try {
					const sourceDbRef = await this._sessionDataService.tryOpenDatabase(sessionConfig.fork!.session);
					if (sourceDbRef) {
						try {
							await fs.mkdir(targetDbDir.fsPath, { recursive: true });
							// VACUUM INTO fails if the target already exists; clear
							// any stale DB left by a previous (e.g. crashed) attempt.
							await fs.rm(targetDbPath.fsPath, { force: true });
							await sourceDbRef.object.vacuumInto(targetDbPath.fsPath);
						} finally {
							sourceDbRef.dispose();
						}
					}
				} catch (err) {
					this._logService.warn(`[Copilot] Failed to copy session database for fork: ${err instanceof Error ? err.message : String(err)}`);
				}

				// Resume the forked session so the SDK loads the forked history
				const agentSession = await this._resumeSession(newSessionId);

				// Remap turn IDs to match the new protocol turn IDs
				if (sessionConfig.fork!.turnIdMapping) {
					await agentSession.remapTurnIds(sessionConfig.fork!.turnIdMapping);
				}

				const session = agentSession.sessionUri;
				this._logService.info(`[Copilot] Forked session created: ${session.toString()}`);

				// Copy the source session's reviewed ref so the fork starts with
				// the parent's review progress (best-effort; a failure just means
				// the fork starts unreviewed).
				try {
					await this._reviewService.copyReviewedRef(sessionConfig.fork!.session.toString(), session.toString(), workingDirectory);
				} catch (err) {
					this._logService.warn(`[Copilot] Failed to copy reviewed ref for fork: ${err instanceof Error ? err.message : String(err)}`);
				}

				const project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
				await this._storeSessionMetadata(session, sessionConfig.model, workingDirectory, workingDirectory, project, true);
				if (sessionConfig.agent !== undefined) {
					await this._storeSessionAgentMetadata(session, sessionConfig.agent);
				}
				return { session, workingDirectory, ...(project ? { project } : {}) };
			});
		}

		if (sessionConfig.importConversation) {
			return this._importConversation(sessionConfig, sessionId, workingDirectory);
		}

		// Non-fork path: create a *provisional* session. The Copilot SDK
		// session, the worktree (if any), and the on-disk metadata are all
		// deferred until the first {@link sendMessage} via
		// {@link _materializeProvisional}. Until then this session occupies
		// only an in-memory slot plus a state-manager entry, so a workspace
		// switch (or quick close) costs nothing on disk.
		const sessionUri = AgentSession.uri(this.id, sessionId);

		// Idempotency for already-materialized sessions: a duplicate
		// `createSession` for a URI that has already been promoted to a real
		// SDK session (or restored from disk) is a no-op; we return the
		// non-provisional result so the caller doesn't re-fire `SessionAdded`.
		// This guards against client retries that race a successful first
		// message.
		if (this._findAnySession(sessionId)) {
			this._logService.info(`[Copilot] createSession is a no-op: session already materialized: ${sessionUri.toString()}`);
			const project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
			return { session: sessionUri, workingDirectory, ...(project ? { project } : {}) };
		}

		// Idempotent: a duplicate `createSession` for a still-provisional URI
		// (e.g. a client retried on reconnect with the same URI) keeps the
		// existing record. We deliberately do NOT overwrite `model` or
		// `workingDirectory`: a re-create payload from a fresh connection sends
		// the eager-create defaults (model: undefined, the same workingDirectory),
		// which would clobber the user's selections accumulated since the
		// original create. The active-client / plugin sync below still runs so
		// the new connection's claim takes effect.
		const alreadyProvisional = this._provisionalSessions.has(sessionId);

		// Seed active-client snapshot if the client claimed it eagerly. This
		// runs identically for provisional and real sessions; the SDK side
		// of activeClient state isn't engaged until materialization.
		if (sessionConfig.activeClient) {
			const ac = this._getOrCreateActiveClient(sessionUri, workingDirectory);
			const seeded = sessionConfig.activeClient;
			ac.toolSet.set(seeded.clientId, seeded.tools);
			ac.getOrCreateHandle(seeded.clientId, seeded.displayName);
			if (seeded.customizations !== undefined) {
				// Provisional eager-create: no session-state listener is
				// hooked up yet, so suppress action events. The session
				// reads the final view via its initial snapshot once it
				// materializes.
				await ac.pluginController.sync(seeded.clientId, seeded.customizations, { quiet: true });
			}
		}

		// Compute project metadata cheaply from the original working dir.
		// Worktrees aren't created until materialization, so the project is
		// reported relative to the user's chosen folder.
		const project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);

		if (!alreadyProvisional) {
			this._provisionalSessions.set(sessionId, {
				sessionId,
				sessionUri,
				workingDirectory,
				model: sessionConfig.model,
				agent: sessionConfig.agent,
				project,
				workspaceless: isWorkspaceless,
			});
		}

		this._logService.info(`[Copilot] Session created (provisional): ${sessionUri.toString()}`);
		return { session: sessionUri, workingDirectory, provisional: true, ...(project ? { project } : {}) };
	}

	/**
	 * Root directory the Copilot CLI uses for per-session state. The CLI stores
	 * each session's files under `<root>/session-state/<sessionId>/` and resolves
	 * `<root>` to `$COPILOT_HOME` or `~/.copilot`. The CLI subprocess inherits
	 * `COPILOT_HOME` from this process's environment (see {@link _ensureClient},
	 * which never overrides it), so reading it here matches what the CLI sees.
	 */
	private _copilotConfigRoot(): string {
		return process.env['COPILOT_HOME'] || join(os.homedir(), '.copilot');
	}

	/**
	 * Materializes an imported conversation into a real, editable Copilot
	 * session. Translates the supplied turns into a Copilot event log, seeds it
	 * at the CLI's native per-session store, then resumes the session so the
	 * SDK reconstitutes the turns as genuine backend events (editable / forkable
	 * / truncatable). The turns arrive with fresh UUID ids assigned by the
	 * service layer, so the seeded event ids and the seeded protocol turns stay
	 * aligned. Mirrors the immediate-materialization shape of the fork path.
	 */
	private async _importConversation(sessionConfig: IAgentCreateSessionConfig, sessionId: string, workingDirectory: URI): Promise<IAgentCreateSessionResult> {
		const importConfig = sessionConfig.importConversation!;
		const sessionUri = AgentSession.uri(this.id, sessionId);
		return this._sessionSequencer.queue(sessionId, async () => {
			this._logService.info(`[Copilot] Importing conversation into session ${sessionId} (${importConfig.turns.length} turns)`);
			const model = importConfig.model ?? sessionConfig.model;

			// Translate the conversation and seed it at the CLI's native
			// per-session store so a normal resume reconstitutes editable turns.
			// Detect the project concurrently with the (independent) event-log write
			// so the git probe and file I/O overlap on the session-creation path.
			const projectPromise = projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
			const eventsPath = join(this._copilotConfigRoot(), 'session-state', sessionId, 'events.jsonl');
			const jsonl = buildSessionEventLogFromTurns(importConfig.turns, {
				sessionId,
				workingDirectory: workingDirectory.fsPath,
				model: model?.id,
			});
			await fs.mkdir(dirname(eventsPath), { recursive: true });
			await fs.writeFile(eventsPath, jsonl, 'utf8');

			// Persist metadata before resume so `_resumeSession` can resolve the
			// working directory and model.
			const project = await projectPromise;
			await this._storeSessionMetadata(sessionUri, model, workingDirectory, workingDirectory, project);
			if (sessionConfig.agent !== undefined) {
				await this._storeSessionAgentMetadata(sessionUri, sessionConfig.agent);
			}

			// Resume so the SDK loads the seeded history as editable turns.
			await this._resumeSession(sessionId);
			this._logService.info(`[Copilot] Imported session created: ${sessionUri.toString()}`);
			return { session: sessionUri, workingDirectory, ...(project ? { project } : {}) };
		});
	}

	/**
	 * Promotes a {@link IProvisionalSession} into a real Copilot SDK session
	 * by performing the work that {@link createSession} previously did
	 * eagerly: resolves the working directory (creating a worktree if
	 * `isolation === 'worktree'`), instantiates the {@link CopilotAgentSession},
	 * persists session metadata, and notifies the {@link IAgentService} via
	 * {@link onDidMaterializeSession} so it can fire the deferred
	 * `sessionAdded` protocol notification.
	 *
	 * Called from {@link sendMessage} immediately before a turn is dispatched.
	 * Already runs inside the session sequencer, so concurrent sends serialize
	 * naturally.
	 *
	 * The latest model lives on the provisional record (kept in sync via
	 * {@link changeModel}). The latest session config (isolation / branch /
	 * etc.) is read straight from the state manager via
	 * {@link IAgentConfigurationService.getSessionConfigValues} so any
	 * `SessionConfigChanged` actions that arrived after `createSession` are
	 * honoured without bespoke forwarding.
	 */
	private async _materializeProvisional(sessionId: string, prompt: string): Promise<CopilotAgentSession> {
		const provisional = this._provisionalSessions.get(sessionId);
		if (!provisional) {
			throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
		}
		const client = await this._ensureClient();
		const sessionUri = provisional.sessionUri;
		const liveSessionConfig = this._configurationService.getSessionConfigValues(sessionUri.toString());

		const materializedConfig: IAgentCreateSessionConfig = {
			provider: this.id,
			session: sessionUri,
			workingDirectory: provisional.workingDirectory,
			model: provisional.model,
			config: liveSessionConfig,
		};

		const workingDirectory = await this._resolveSessionWorkingDirectory(materializedConfig, sessionId, prompt);
		// The customization anchor follows the working directory: once a worktree
		// is created the agent must discover skills/instructions/agents from the
		// worktree (not the user-picked folder) so the model reads and edits files
		// in the worktree it actually runs in.
		const customizationDirectory = workingDirectory ?? provisional.workingDirectory;
		// Always create an ActiveClient so the snapshot includes host +
		// session-discovered customizations, even when no client has
		// registered an active-client handle yet.
		const activeClient = this._getOrCreateActiveClient(sessionUri, customizationDirectory);
		// Re-anchor in case the provisional active client was already bound to the
		// user-picked folder before the worktree existed.
		activeClient.pluginController.reanchor(customizationDirectory);
		const snapshot = await activeClient.snapshot();
		const shellManager = this._instantiationService.createInstance(ShellManager, sessionUri, workingDirectory);

		let agentSession: CopilotAgentSession | undefined;
		let agent: AgentSelection | undefined;
		try {
			const resolvedAgent = await this._resolveAgentWhenMaterializing(provisional, snapshot, workingDirectory);
			agent = resolvedAgent?.agent;
			const launchPlan: CopilotSessionLaunchPlan = {
				kind: 'create',
				client,
				sessionId,
				workingDirectory,
				resolvedAgentName: resolvedAgent?.name,
				snapshot,
				activeClientToolSet: activeClient.toolSet,
				shellManager,
				githubToken: this._githubToken,
				model: provisional.model,
				longContextWindow: this._longContextWindowFor(provisional.model?.id),
				freeLongContext: this._isFreeLongContext(provisional.model?.id),
				workspaceless: provisional.workspaceless,
			};
			agentSession = this._createAgentSession(launchPlan, customizationDirectory, activeClient);
			await agentSession.initializeSession();
			this._registerInitializedSession(sessionId, agentSession);
		} catch (error) {
			agentSession?.dispose();
			await this._removeCreatedWorktree(sessionId);
			throw error;
		}

		const project = await projectFromCopilotContext({ cwd: workingDirectory?.fsPath }, this._gitService);

		this._provisionalSessions.delete(sessionId);
		await this._storeSessionMetadata(sessionUri, provisional.model, workingDirectory, customizationDirectory, project, true);
		if (agent !== undefined) {
			await this._storeSessionAgentMetadata(sessionUri, agent);
		}

		// Capture the per-session baseline (turn/0) git checkpoint so
		// per-turn diffs computed on `ChatTurnComplete` can reflect the
		// full working-tree delta — including terminal-tool edits that are
		// invisible to the FileEditTracker pipeline. Best-effort: a
		// non-git folder or capture failure leaves the session running
		// with the legacy `file_edits`-based per-turn diff path.
		this._checkpointService.captureBaseline(sessionUri, workingDirectory).catch(err => {
			this._logService.warn(`[Copilot:${sessionId}] Baseline checkpoint capture failed: ${err instanceof Error ? err.message : String(err)}`);
		});

		this._logService.info(`[Copilot] Session materialized: ${sessionUri.toString()}`);
		this._onDidMaterializeSession.fire({ session: sessionUri, workingDirectory, project });
		return agentSession;
	}

	private async _resolveAgentWhenMaterializing(provisional: IProvisionalSession, snapshot: IActiveClientSnapshot, workingDirectory: URI | undefined): Promise<{ agent: AgentSelection; name: string } | undefined> {
		const agent = provisional.agent;
		if (!agent) {
			return undefined;
		}
		const alternativeAgent = this._getAlternativeAgentForWorktree(provisional, workingDirectory);

		const originalAgentName = this._resolveAgentName(snapshot, agent);
		const alternativeAgentName = alternativeAgent ? this._resolveAgentName(snapshot, alternativeAgent) : undefined;

		if (originalAgentName) {
			return { agent: agent, name: originalAgentName };
		}
		if (alternativeAgentName && alternativeAgent) {
			this._logService.info(`[Copilot] Agent file ${agent.uri} is in the original repo; using worktree agent ${alternativeAgent?.uri}`);
			return { agent: alternativeAgent, name: alternativeAgentName };
		}
		return undefined;
	}
	private _getAlternativeAgentForWorktree(provisional: IProvisionalSession, workingDirectory: URI | undefined): AgentSelection | undefined {
		const agent = provisional.agent;
		if (!agent) {
			return undefined;
		}
		if (!provisional.workingDirectory || !workingDirectory) {
			return undefined;
		}
		if (isEqual(provisional.workingDirectory, workingDirectory)) {
			return undefined;
		}
		const agentUri = URI.parse(agent.uri);
		const alternativeAgentUri = rebaseUnder(agentUri, provisional.workingDirectory, workingDirectory);
		return alternativeAgentUri ? { uri: alternativeAgentUri.toString() } : undefined;
	}

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		const gitInfo = params.workingDirectory ? await this._getGitInfo(params.workingDirectory) : undefined;

		const isolationProperty = schemaProperty<'folder' | 'worktree'>({
			type: 'string',
			title: localize('agentHost.sessionConfig.isolation', "Isolation"),
			description: localize('agentHost.sessionConfig.isolationDescription', "Where the agent should make changes"),
			enum: gitInfo ? ['folder', 'worktree'] : ['folder'],
			enumLabels: gitInfo ? [localize('agentHost.sessionConfig.isolation.folder', "Folder"), localize('agentHost.sessionConfig.isolation.worktree', "Worktree")] : [localize('agentHost.sessionConfig.isolation.folder', "Folder")],
			enumDescriptions: gitInfo ? [localize('agentHost.sessionConfig.isolation.folderDescription', "Work directly in the folder"), localize('agentHost.sessionConfig.isolation.worktreeDescription', "Create a Git worktree for isolation")] : [localize('agentHost.sessionConfig.isolation.folderDescription', "Work directly in the folder")],
			default: gitInfo ? 'worktree' : 'folder',
			readOnly: !gitInfo,
			sessionMutable: false,
		});

		// Resolve isolation first — downstream schema shapes (branch's
		// read-only mode + enum restriction) depend on the effective value.
		const isolationDefault: 'folder' | 'worktree' = gitInfo ? 'worktree' : 'folder';
		const isolationValue = isolationProperty.validate(params.config?.[SessionConfigKey.Isolation])
			? params.config[SessionConfigKey.Isolation] as 'folder' | 'worktree'
			: isolationDefault;

		let branchProperty: ISchemaProperty<string> | undefined;
		let branchDefault: string | undefined;
		let worktreeBranchPrefixProperty: ISchemaProperty<string> | undefined;
		let worktreeIncludeFilesProperty: ISchemaProperty<readonly string[]> | undefined;
		if (gitInfo) {
			const branchReadOnly = isolationValue === 'folder';
			branchDefault = isolationValue === 'worktree' ? gitInfo.defaultBranch : gitInfo.currentBranch;
			branchProperty = schemaProperty<string>({
				type: 'string',
				title: localize('agentHost.sessionConfig.branch', "Branch"),
				description: localize('agentHost.sessionConfig.branchDescription', "Base branch to work from"),
				enum: [branchDefault],
				enumLabels: [branchDefault],
				default: branchDefault,
				enumDynamic: !branchReadOnly,
				readOnly: branchReadOnly,
				sessionMutable: false,
			});

			// Carrier for the client's `git.branchPrefix`: the agent prepends it
			// to the branch it creates for an isolated worktree. Declared for
			// both isolations (like `branch`), so the value rides
			// `_config.values` and survives isolation toggles — a user who flips
			// worktree → folder → worktree keeps the prefix, and it reaches the
			// agent via the send-time config snapshot. It has no
			// `enum`/`enumDynamic`, so the config picker treats it as
			// non-pickable. To keep it from surfacing as a read-only chip in the
			// workbench chat input, its key is also listed in the client-side
			// `WELL_KNOWN_PICKER_PROPERTIES` (see `agentHostChatInputPicker.ts`),
			// which the generic chip lane filters out. The client seeds it
			// (from `git.branchPrefix`), the user never edits it, and the agent
			// only *consumes* it for worktree isolation (see
			// `_resolveSessionWorkingDirectory`).
			worktreeBranchPrefixProperty = schemaProperty<string>({
				type: 'string',
				title: localize('agentHost.sessionConfig.worktreeBranchPrefix', "Worktree Branch Prefix"),
				description: localize('agentHost.sessionConfig.worktreeBranchPrefixDescription', "Prefix applied to the branch created for an isolated worktree."),
				readOnly: true,
				sessionMutable: false,
			});

			worktreeIncludeFilesProperty = schemaProperty<readonly string[]>({
				type: 'array',
				title: localize('agentHost.sessionConfig.worktreeIncludeFiles', "Worktree Include Files"),
				description: localize('agentHost.sessionConfig.worktreeIncludeFilesDescription', "Glob patterns for git-ignored files to copy into the isolated worktree."),
				items: {
					type: 'string',
					title: localize('agentHost.sessionConfig.worktreeIncludeFilesItem', "Pattern"),
				},
				readOnly: true,
				sessionMutable: false,
			});
		}

		const sessionSchema = createSchema({
			[SessionConfigKey.Isolation]: isolationProperty,
			...platformSessionSchema.definition,
			...(branchProperty ? { [SessionConfigKey.Branch]: branchProperty } : {}),
			...(worktreeBranchPrefixProperty ? { [SessionConfigKey.WorktreeBranchPrefix]: worktreeBranchPrefixProperty } : {}),
			...(worktreeIncludeFilesProperty ? { [SessionConfigKey.WorktreeIncludeFiles]: worktreeIncludeFilesProperty } : {}),
		});

		const values = sessionSchema.validateOrDefault(migrateLegacyAutopilotConfig(params.config), {
			[SessionConfigKey.Isolation]: isolationValue,
			[SessionConfigKey.AutoApprove]: 'default' satisfies AutoApproveLevel,
			[SessionConfigKey.Mode]: 'interactive' satisfies SessionMode,
			// Permissions intentionally omitted — leave unset so auto-approval
			// falls through to the host-level `permissions` default, and only
			// materializes on the session once the user hits "Allow in this
			// Session".
			// worktreeBranchPrefix / worktreeIncludeFiles intentionally omitted
			// from defaults — the values originate on the client (`git.*`);
			// when the client doesn't supply them they simply stay unset.
			...(branchDefault !== undefined ? { [SessionConfigKey.Branch]: branchDefault } : {}),
		});

		return {
			schema: sessionSchema.toProtocol(),
			values,
		};
	}

	async sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		if (params.property !== 'branch' || !params.workingDirectory) {
			return { items: [] };
		}

		const branches = await this._getBranches(params.workingDirectory, params.query);
		return { items: branches.map(branch => ({ value: branch, label: branch })) };
	}

	getOrCreateActiveClient(session: URI, client: { readonly clientId: string; readonly displayName?: string }): IActiveClient {
		const activeClient = this._getOrCreateActiveClient(session, undefined);
		// Anchor the customization directory (best-effort, idempotent) so
		// session-discovered customizations surface alongside this client's,
		// mirroring the previous eager resolution in `setClientCustomizations`.
		if (!activeClient.pluginController.directory) {
			this._getSessionCustomizationDirectory(session).then(
				directory => activeClient.pluginController.setDirectory(directory),
				() => { /* best-effort anchoring */ },
			);
		}
		return activeClient.getOrCreateHandle(client.clientId, client.displayName);
	}

	removeActiveClient(session: URI, clientId: string): void {
		const sessionId = AgentSession.id(session);
		this._logService.info(`[Copilot:${sessionId}] removeActiveClient: clientId=${clientId}`);
		this._activeClients.get(session)?.removeClient(clientId);
	}

	onClientToolCallComplete(session: URI, chat: URI, toolCallId: string, result: ToolCallResult): void {
		const sessionId = AgentSession.id(session);
		// Peer (non-default) chats own their SDK chat within the owning
		// session entry, keyed by the chat URI. Mirrors the routing in `sendMessage`.
		if (!isDefaultChatUri(chat)) {
			const peerChat = this._findPeerChat(session, chat);
			if (!peerChat) {
				this._logService.warn(`[Copilot:${sessionId}] Dropping client tool completion for missing peer chat: chat=${chat.toString()}, toolCallId=${toolCallId}, success=${result.success}`);
				return;
			}
			this._logService.info(`[Copilot:${sessionId}] Routing client tool completion to peer chat: chat=${chat.toString()}, toolCallId=${toolCallId}, success=${result.success}`);
			peerChat.handleClientToolCallComplete(toolCallId, result);
		} else {
			const entry = this._findAnySession(sessionId);
			if (!entry) {
				this._logService.warn(`[Copilot:${sessionId}] Dropping client tool completion for missing default chat: chat=${chat.toString()}, toolCallId=${toolCallId}, success=${result.success}`);
				return;
			}
			this._logService.info(`[Copilot:${sessionId}] Routing client tool completion to default chat: chat=${chat.toString()}, toolCallId=${toolCallId}, success=${result.success}`);
			entry.handleClientToolCallComplete(toolCallId, result);
		}
	}

	setCustomizationEnabled(uri: string, enabled: boolean): void {
		// Enablement is per-session: fan out to every existing session
		// controller (provisional + materialized). New sessions start with
		// the default value baked into their customizations.
		for (const activeClient of this._activeClients.values()) {
			activeClient.pluginController.setEnabled(uri, enabled);
		}
	}

	private async _sendMessage(chat: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, senderClientId?: string): Promise<void> {
		const context = this._getChatContext(chat);
		// Additional (non-default) chats are backed by their own SDK
		// chat hosted on the owning session entry, keyed by the chat URI.
		if (context.isPeerChat) {
			const entry = await this._ensureChatSession(context.session, chat);
			if (!entry) {
				throw new Error(`[Copilot] sendMessage for unknown chat: ${chat.toString()}`);
			}
			if (turnId) {
				entry.resetTurnState(turnId, senderClientId);
			}
			await entry.send(prompt, attachments, turnId, this._resolveSdkMode(context.session), senderClientId);
			return;
		}
		await this._sessionSequencer.queue(context.sessionId, async () => {
			await this._activeClients.get(context.session)?.pluginController.retryFailedClientSyncIfNeeded();

			// First message on a provisional session: materialize the SDK
			// session, worktree, and on-disk metadata before continuing. The
			// prompt is forwarded so a worktree-isolated session can derive
			// its branch-name hint from the user's first message.
			let entry: CopilotAgentSession | undefined;
			if (this._provisionalSessions.has(context.sessionId)) {
				entry = await this._materializeProvisional(context.sessionId, prompt);
			} else {
				entry = this._getChatContext(chat).target;
			}

			// If the active client's config changed (tools or plugins),
			// dispose this session so it gets resumed with the updated config.
			const activeClient = this._activeClients.get(context.session);
			const hadCachedEntry = !!entry;
			this._logService.info(`[Copilot:${context.sessionId}] sendMessage: cachedEntry=${hadCachedEntry}, hasActiveClient=${!!activeClient}, activeClientId=${activeClient ? '(set)' : '(none)'}`);
			if (entry && activeClient && await activeClient.requiresRestart(entry.appliedSnapshot)) {
				this._logService.info(`[Copilot:${context.sessionId}] Session config changed (requiresRestart=true), refreshing session. clients=[${[...activeClient.toolSet.clientIds()].join(', ') || '(none)'}]`);
				// Dispose only the default chat so it resumes with the updated
				// config; peer chats on the same entry are left intact.
				this._sessions.get(context.sessionId)?.clearDefaultChat();
				entry = undefined;
			}

			if (!entry) {
				this._logService.info(`[Copilot:${context.sessionId}] No cached entry${hadCachedEntry ? ' (was evicted by requiresRestart)' : ''}, calling _resumeSession`);
			}
			entry ??= await this._resumeSession(context.sessionId);

			// Reset per-turn streaming state on the session so that the
			// next text/reasoning chunk (and any host-emitted announcement)
			// allocates a fresh response part.
			if (turnId) {
				entry.resetTurnState(turnId, senderClientId);
			}

			// Emit any pending first-turn announcement (e.g. worktree
			// created) as a synthetic markdown response part before
			// delegating to the SDK. The SDK's subsequent deltas append to
			// the same markdown part because the session has already
			// allocated `_currentMarkdownPartId`.
			const announcement = this._pendingFirstTurnAnnouncements.get(context.sessionId);
			if (announcement !== undefined) {
				this._pendingFirstTurnAnnouncements.delete(context.sessionId);
				entry.emitInitialMarkdown(announcement);
			}

			try {
				const sdkMode = this._resolveSdkMode(context.session);
				await entry.send(prompt, attachments, turnId, sdkMode, senderClientId);
			} catch (err) {
				const errCode = (err as { code?: number })?.code;
				const errMsg = err instanceof Error ? err.message : String(err);
				this._logService.error(`[Copilot:${context.sessionId}] entry.send() failed: code=${errCode}, message=${errMsg}, hadCachedEntry=${hadCachedEntry}, errorType=${err?.constructor?.name}`);
				throw err;
			}
		});
	}

	/**
	 * Translates the AHP-side `mode` to the Copilot SDK's three-mode space
	 * (`interactive` / `plan` / `autopilot`). With Autopilot living on the
	 * `mode` axis the mapping is now direct:
	 *
	 *  - `mode='plan'` → SDK `plan`.
	 *  - `mode='autopilot'` → SDK `autopilot` (autonomous, continue-until-done).
	 *  - `mode='interactive'` → SDK `interactive`.
	 *
	 * Tool auto-approval is governed independently by the orthogonal
	 * `autoApprove` axis (Default / Bypass), enforced by the agent
	 * host's own permission handler — which the SDK still invokes even under
	 * autopilot mode.
	 *
	 * Returns `undefined` when no mode is configured for the session, so
	 * the SDK's current mode is left untouched.
	 */
	private _resolveSdkMode(session: URI): CopilotSdkMode | undefined {
		const sessionKey = session.toString();
		const mode = this._configurationService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Mode);
		switch (mode) {
			case 'plan':
				return 'plan';
			case 'autopilot':
				return 'autopilot';
			case 'interactive':
				return 'interactive';
			default:
				return undefined;
		}
	}

	setPendingMessages(session: URI, steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
		const sessionId = AgentSession.id(session);
		const entry = this._findAnySession(sessionId);
		if (!entry) {
			this._logService.warn(`[Copilot:${sessionId}] setPendingMessages: session not found`);
			return;
		}

		// Steering: send with mode 'immediate' so the SDK injects it mid-turn
		if (steeringMessage) {
			entry.sendSteering(steeringMessage);
		}

		// Queued messages are consumed by the server (AgentSideEffects)
		// which dispatches ChatTurnStarted and calls sendMessage directly.
		// No SDK-level enqueue is needed.
	}

	async getSessionMessages(session: URI): Promise<readonly Turn[]> {
		// If the URI describes a subagent child session (`<parent>/subagent/<toolCallId>`),
		// load the parent's events once and extract the child's filtered turns.
		const subagentInfo = parseSubagentSessionUri(session);
		if (subagentInfo) {
			// Walk up the subagent chain to find the root SDK session entry;
			// _sessions is keyed by root session IDs only.
			let rootSession = subagentInfo.parentSession;
			let parentParsed;
			while ((parentParsed = parseSubagentSessionUri(rootSession))) {
				rootSession = parentParsed.parentSession;
			}
			const rootSessionId = AgentSession.id(rootSession);
			const parentEntry = this._findAnySession(rootSessionId) ?? await this._resumeSession(rootSessionId).catch(err => {
				this._logService.warn(`[Copilot:${rootSessionId}] Failed to resume root for subagent restore`, err);
				return undefined;
			});
			if (!parentEntry) {
				return [];
			}
			return parentEntry.getSubagentMessages(subagentInfo.toolCallId);
		}

		const chat = parseChatUri(session) ? session : URI.parse(buildDefaultChatUri(session));
		const context = this._getChatContext(chat);
		if (context.isPeerChat) {
			const entry = await this._ensureChatSession(context.session, chat);
			return entry ? entry.getMessages() : [];
		}

		const sessionId = context.sessionId;
		// Provisional sessions have no SDK history yet.
		if (this._provisionalSessions.has(sessionId)) {
			return [];
		}
		const entry = context.target ?? await this._resumeSession(sessionId).catch(err => {
			if (err instanceof SessionWorkingDirectoryMissingError) {
				// Unrecoverable: surface to the restore/subscribe path so the
				// client shows a clear error instead of a silently empty chat.
				throw err;
			}
			this._logService.warn(`[Copilot:${sessionId}] Failed to resume session for message lookup`, err);
			return undefined;
		});
		if (!entry) {
			return [];
		}
		const rawTurns = await entry.getMessages();

		// If a worktree was created for this session at create-time, prepend
		// If a worktree was created for this session at create-time, prepend
		// the announcement to the first turn so it appears at the top of the
		// first response when the session is reopened. The live path
		// (sendMessage) handles the very first turn when the session is fresh;
		// this path takes over on subsequent loads, where
		// _pendingFirstTurnAnnouncements is empty.
		const worktreeMeta = await this._readWorktreeMetadata(context.session).catch(err => {
			this._logService.warn(`[Copilot:${sessionId}] Failed to read worktree branch metadata`, err);
			return undefined;
		});
		if (!worktreeMeta?.branchName) {
			return rawTurns;
		}
		return prependAnnouncementToFirstTurn(rawTurns, buildWorktreeAnnouncementText(worktreeMeta.branchName));
	}

	async getSubagentSessions(session: URI): Promise<readonly IRestoredSubagentSession[]> {
		// Only the root SDK session entry owns the event log; peer-chat and
		// subagent URIs are derived from it and have no subagents of their own.
		const chatInfo = parseChatUri(session);
		if (chatInfo && !isDefaultChatUri(session)) {
			return [];
		}
		if (parseSubagentSessionUri(session)) {
			return [];
		}
		const sessionId = AgentSession.id(session);
		// Provisional sessions have no SDK history (and thus no subagents) yet.
		if (this._provisionalSessions.has(sessionId)) {
			return [];
		}
		const entry = this._findAnySession(sessionId) ?? await this._resumeSession(sessionId).catch(err => {
			this._logService.warn(`[Copilot:${sessionId}] Failed to resume session for subagent lookup`, err);
			return undefined;
		});
		return entry ? entry.getSubagentSessions() : [];
	}

	async disposeSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			// Resolve the workspace-less scratch dir (if any) before deleting, so we
			// can reap it afterwards. A provisional workspace-less chat carries its state
			// in memory; a materialized/restored one persists `workspaceless` metadata.
			const provisional = this._provisionalSessions.get(sessionId);
			const isWorkspaceless = provisional
				? provisional.workspaceless === true
				: (await this._readSessionMetadata(session).catch(() => undefined))?.workspaceless === true;
			// Remove the session from the SDK's on-disk store first so it doesn't reappear in `listSessions()` after a
			// restart, and so that any final persist triggered by in-memory teardown can't recreate it. Provisional
			// sessions were never persisted, so there is nothing to delete on the SDK side.
			if (!this._provisionalSessions.has(sessionId)) {
				const client = await this._ensureClient();
				await client.deleteSession(sessionId);
			}
			await this._destroyAndDisposeSession(sessionId);
			if (isWorkspaceless) {
				await this._cleanupWorkspacelessScratchDir(this._workspacelessScratchDir(sessionId), sessionId);
			}
		});
	}

	/**
	 * Non-destructive counterpart to {@link disposeSession}: releases the
	 * session's in-memory resources (SDK session/connection, cached entry,
	 * active clients, MCP subscriptions) but preserves all durable data — the
	 * SDK session log, session database, and worktree stay on disk. The session
	 * transparently resumes on the next access via {@link _resumeSession}.
	 *
	 * No-ops for sessions that have nothing durable to resume from (provisional
	 * sessions) or that aren't currently held in memory, and for sessions with a
	 * running turn — disconnecting mid-turn would strand the SDK session.
	 */
	async releaseSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			// Provisional sessions were never persisted, so releasing them would
			// lose state with no way to resume. Leave them in memory.
			if (this._provisionalSessions.has(sessionId)) {
				return;
			}
			const entry = this._sessions.get(sessionId);
			if (!entry) {
				return;
			}
			// Defensive active-turn guard: the orchestrator already skips
			// eviction while a turn is active, but a turn could have started
			// between that check and this sequenced callback.
			if (entry.allChatSessions().some(chatSession => chatSession.hasActiveTurn)) {
				return;
			}
			this._logService.info(`[Copilot:${sessionId}] Releasing idle session from memory (durable state preserved)`);
			await this._releaseSessionResources(sessionId);
		});
	}

	async onArchivedChanged(session: URI, isArchived: boolean): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			if (isArchived) {
				await this._cleanupWorktreeOnArchive(session, sessionId);
			} else {
				await this._recreateWorktreeOnUnarchive(session, sessionId);
			}
		});
	}

	private async _cleanupWorktreeOnArchive(session: URI, sessionId: string): Promise<void> {
		const meta = await this._readWorktreeMetadata(session).catch(() => undefined);
		if (!meta?.worktreePath || !meta.repositoryRoot) {
			return;
		}
		const { branchName, worktreePath, repositoryRoot } = meta;

		// Skip if the worktree directory is already gone — nothing to clean.
		try {
			await fs.access(worktreePath.fsPath);
		} catch {
			this._createdWorktrees.delete(sessionId);
			return;
		}

		// Skip if the branch is missing — without it we can't safely recreate
		// the worktree on unarchive, so leave the working tree intact.
		const branchPresent = await this._gitService.branchExists(repositoryRoot, branchName).catch(() => false);
		if (!branchPresent) {
			this._logService.info(`[Copilot:${sessionId}] Skipping worktree cleanup: branch '${branchName}' is missing`);
			return;
		}

		// Skip if there are uncommitted changes — don't silently destroy work.
		const dirty = await this._gitService.hasUncommittedChanges(worktreePath).catch(() => true);
		if (dirty) {
			this._logService.info(`[Copilot:${sessionId}] Skipping worktree cleanup: '${worktreePath.fsPath}' has uncommitted changes`);
			return;
		}

		try {
			await this._gitService.removeWorktree(repositoryRoot, worktreePath);
			this._logService.info(`[Copilot:${sessionId}] Removed worktree '${worktreePath.fsPath}' on archive`);
		} catch (error) {
			this._logService.warn(`[Copilot:${sessionId}] Failed to remove worktree '${worktreePath.fsPath}' on archive: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this._createdWorktrees.delete(sessionId);
		}
	}

	private async _recreateWorktreeOnUnarchive(session: URI, sessionId: string): Promise<void> {
		const meta = await this._readWorktreeMetadata(session).catch(() => undefined);
		if (!meta?.worktreePath || !meta.repositoryRoot) {
			return;
		}

		// Skip if the worktree directory already exists — nothing to do.
		try {
			await fs.access(meta.worktreePath.fsPath);
			return;
		} catch {
			// expected when the worktree was cleaned up on archive
		}

		await this._recreateWorktree(sessionId, { branchName: meta.branchName, worktreePath: meta.worktreePath, repositoryRoot: meta.repositoryRoot });
	}

	private async _abortSession(chat: URI): Promise<void> {
		const context = this._getChatContext(chat);
		if (context.isPeerChat) {
			await context.target?.abort();
			return;
		}
		await this._sessionSequencer.queue(context.sessionId, async () => {
			await this._getChatContext(chat).target?.abort();
		});
	}

	private async _createChat(chat: URI, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> {
		if (isDefaultChatUri(chat)) {
			return;
		}
		const parsed = parseChatUri(chat);
		if (!parsed) {
			throw new Error(`[Copilot] createChat: malformed chat URI ${chat.toString()}`);
		}
		const session = URI.parse(parsed.session);
		const chatKey = chat.toString();
		if (this._sessions.get(AgentSession.id(session))?.hasPeerChat(chatKey)) {
			// Already live: hand back the existing backing so the orchestrator
			// re-persists a consistent blob for an idempotent create.
			const existing = this._chatBackings.get(chatKey);
			return existing ? { providerData: encodeProviderData(existing), backingSession: AgentSession.uri(this.id, existing.sdkSessionId) } : undefined;
		}
		const sessionId = AgentSession.id(session);
		let result: IAgentCreateChatResult | undefined;
		await this._sessionSequencer.queue(sessionId, async () => {
			// Re-check inside the per-session sequencer: the outer `has` check
			// above is only a fast early-out. If two `createChat` calls for the
			// same chat URI race, both can pass that outer check; the sequencer
			// serializes them, so the second task must re-check here to avoid
			// overwriting (and disposing) the chat the first one set.
			if (this._sessions.get(sessionId)?.hasPeerChat(chatKey)) {
				const existing = this._chatBackings.get(chatKey);
				result = existing ? { providerData: encodeProviderData(existing), backingSession: AgentSession.uri(this.id, existing.sdkSessionId) } : undefined;
				return;
			}
			const model = options?.model;
			// Resolve the owning session so the new chat inherits its working
			// directory scope. The parent may be provisional (no SDK session
			// yet); in that case use its provisional working directory.
			const parentEntry = this._findAnySession(sessionId);
			const workingDirectory = parentEntry?.workingDirectory
				?? this._provisionalSessions.get(sessionId)?.workingDirectory;
			const client = await this._ensureClient();
			const chatSdkId = generateUuid();
			// Peer chats share the owning session's ActiveClient so that
			// client tool / customization updates (which are keyed by the
			// session URI via the active-client handles) reach the additional
			// chat's SDK chat. Keying it by the chat URI instead would
			// snapshot empty/stale tools and never see subsequent updates, and
			// would also leak (nothing disposes a chat-keyed ActiveClient).
			const activeClient = this._getOrCreateActiveClient(session, workingDirectory);
			const snapshot = await activeClient.snapshot();
			const shellManager = this._instantiationService.createInstance(ShellManager, chat, workingDirectory);

			// Forking: mint the new chat's backing chat by forking the
			// source chat's SDK session at the requested turn (copying its
			// database into the new chat's data dir), then resume it. Otherwise
			// spin up a fresh empty chat.
			let launchPlan: CopilotSessionLaunchPlan;
			let sdkSessionId: string;
			if (options?.fork) {
				if (!workingDirectory) {
					throw new Error(`[Copilot] createChat fork: missing working directory for session ${session.toString()}`);
				}
				const sourceEntry = await this._resolveChatEntry(session, options.fork.source);
				if (!sourceEntry) {
					throw new Error(`[Copilot] createChat fork: source chat ${options.fork.source.toString()} not found`);
				}
				sdkSessionId = await this._forkSdkChat(client, sourceEntry, options.fork.turnId, this._sessionDataService.getSessionDataDir(chat));
				launchPlan = {
					kind: 'resume',
					client,
					sessionId: sdkSessionId,
					workingDirectory,
					resolvedAgentName: undefined,
					snapshot,
					activeClientToolSet: activeClient.toolSet,
					shellManager,
					githubToken: this._githubToken,
					fallback: { model, longContextWindow: this._longContextWindowFor(model?.id), freeLongContext: this._isFreeLongContext(model?.id) },
				};
			} else {
				sdkSessionId = chatSdkId;
				launchPlan = {
					kind: 'create',
					client,
					sessionId: chatSdkId,
					workingDirectory,
					resolvedAgentName: undefined,
					snapshot,
					activeClientToolSet: activeClient.toolSet,
					shellManager,
					githubToken: this._githubToken,
					model,
					longContextWindow: this._longContextWindowFor(model?.id),
					freeLongContext: this._isFreeLongContext(model?.id),
				};
			}
			let agentSession: CopilotAgentSession | undefined;
			try {
				agentSession = this._createAgentSession(launchPlan, workingDirectory, activeClient, chat);
				await agentSession.initializeSession();
				if (options?.fork?.turnIdMapping) {
					await agentSession.remapTurnIds(options.fork.turnIdMapping);
				}
				this._ensureEntry(sessionId).registerPeerChat(chatKey, new CopilotSessionEntry(agentSession));
				// Record the live backing and hand the opaque blob back to the
				// orchestrator to persist. The agent no longer owns a durable
				// peer-chat catalog (`copilot.chats` is no longer written).
				const backing: IPersistedChat = { sdkSessionId, ...(model ? { model } : {}) };
				this._chatBackings.set(chatKey, backing);
				result = { providerData: encodeProviderData(backing), backingSession: AgentSession.uri(this.id, sdkSessionId) };
				this._logService.info(`[Copilot] Created additional chat ${chatKey} in session ${session.toString()}${options?.fork ? ' (forked)' : ''}`);
			} catch (error) {
				agentSession?.dispose();
				throw error;
			}
		});
		return result;
	}

	/**
	 * Resolves the {@link CopilotAgentSession} backing a chat URI — the
	 * session's default chat (keyed by session id) or an additional peer chat
	 * (keyed by the chat URI) — resuming it from disk if necessary.
	 */
	private async _resolveChatEntry(session: URI, chatUri: URI): Promise<CopilotAgentSession | undefined> {
		const sessionId = AgentSession.id(session);
		if (isDefaultChatUri(chatUri) || isEqual(chatUri, session)) {
			return this._findAnySession(sessionId) ?? await this._resumeSession(sessionId).catch(() => undefined);
		}
		return this._ensureChatSession(session, chatUri);
	}

	/**
	 * Forks {@link sourceEntry}'s SDK chat at {@link turnId} via the
	 * SDK `sessions.fork` RPC and copies its database into {@link targetDbDir}
	 * so the forked chat inherits turn event IDs and file-edit
	 * snapshots. Returns the new SDK session id.
	 */
	private async _forkSdkChat(client: CopilotClient, sourceEntry: CopilotAgentSession, turnId: string, targetDbDir: URI): Promise<string> {
		// toEventId is exclusive — events before it are included. If there's no
		// next turn, omit it to include all events.
		const toEventId = await sourceEntry.getNextTurnEventId(turnId);
		const forkResult = await client.rpc.sessions.fork({
			sessionId: sourceEntry.sessionId,
			...(toEventId ? { toEventId } : {}),
		});
		const newSessionId = forkResult.sessionId;

		// VACUUM INTO is safe even while the source DB is open.
		const targetDbPath = URI.joinPath(targetDbDir, SESSION_DB_FILENAME);
		try {
			const sourceDbRef = await this._sessionDataService.tryOpenDatabase(sourceEntry.sessionUri);
			if (sourceDbRef) {
				try {
					await fs.mkdir(targetDbDir.fsPath, { recursive: true });
					// VACUUM INTO fails if the target already exists; clear any
					// stale DB left by a previous (e.g. crashed) attempt.
					await fs.rm(targetDbPath.fsPath, { force: true });
					await sourceDbRef.object.vacuumInto(targetDbPath.fsPath);
				} finally {
					sourceDbRef.dispose();
				}
			}
		} catch (err) {
			this._logService.warn(`[Copilot] Failed to copy session database for chat fork: ${err instanceof Error ? err.message : String(err)}`);
		}
		return newSessionId;
	}

	private async _disposeChat(session: URI, chat: URI): Promise<void> {
		if (isDefaultChatUri(chat)) {
			return;
		}
		const chatKey = chat.toString();
		// Resolve the chat's backing SDK chat id — from the in-memory
		// session, the live backing map, or (for legacy sessions) a one-time
		// read of the agent's pre-orchestrator catalog — so we can delete it
		// from the SDK's on-disk store. Without this a fresh process could
		// re-resume an orphaned chat. The durable peer-chat catalog is
		// owned by the orchestrator now, so this no longer rewrites
		// `copilot.chats`; it only drops the live backing and SDK chat.
		let sdkSessionId = this._findPeerChat(session, chat)?.sessionId
			?? this._chatBackings.get(chatKey)?.sdkSessionId;
		if (!sdkSessionId) {
			const parsed = parseChatUri(chat);
			if (parsed) {
				const persisted = await this._readPersistedChats(session);
				sdkSessionId = persisted.get(parsed.chatId)?.sdkSessionId;
			}
		}
		this._chatBackings.delete(chatKey);
		this._sessions.get(AgentSession.id(session))?.disposePeerChat(chatKey);
		if (sdkSessionId) {
			try {
				const client = await this._ensureClient();
				await client.deleteSession(sdkSessionId);
			} catch (err) {
				this._logService.warn(`[Copilot] Failed to delete SDK session for chat ${chatKey}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	/**
	 * Re-attaches the in-memory backing for a peer chat on session restore,
	 * decoding the opaque `providerData` the orchestrator persisted at creation
	 * (or the latest {@link onDidChangeChatData}). After this resolves
	 * the chat's backing SDK chat can be resumed lazily via
	 * {@link _ensureChatSession}. When `providerData` is `undefined` (a legacy
	 * session persisted before the orchestrator owned the catalog) the agent
	 * falls back to a one-time read of its own `copilot.chats` blob. Best-effort
	 * — a corrupt/unknown blob is logged and dropped rather than thrown.
	 */
	async materializeChat(chat: URI, providerData: string | undefined): Promise<void> {
		if (isDefaultChatUri(chat)) {
			return;
		}
		const chatInfo = parseChatUri(chat);
		if (!chatInfo) {
			return;
		}
		const chatKey = chat.toString();
		let backing: IPersistedChat | undefined;
		if (providerData !== undefined) {
			backing = decodeProviderData(providerData);
			if (!backing) {
				this._logService.warn(`[Copilot] materializeChat: dropping corrupt providerData for ${chatKey}`);
				return;
			}
		} else {
			// Legacy fallback: consult the agent's own pre-orchestrator catalog
			// once to recover the backing for sessions persisted before
			// `providerData` existed.
			const persisted = await this._readPersistedChats(URI.parse(chatInfo.session));
			backing = persisted.get(chatInfo.chatId);
			if (!backing) {
				return;
			}
		}
		this._chatBackings.set(chatKey, backing);
	}

	/**
	 * Migration-only enumeration of the session's peer chats from the agent's
	 * legacy `copilot.chats` catalog, mapping each entry to its channel URI and
	 * the same opaque `providerData` blob {@link materializeChat}
	 * decodes. The orchestrator calls this once to drain legacy chats into its
	 * own catalog.
	 */
	async listLegacyChats(session: URI): Promise<readonly IAgentLegacyChat[]> {
		const persisted = await this._readPersistedChats(session);
		const result: IAgentLegacyChat[] = [];
		for (const [chatId, info] of persisted) {
			result.push({ uri: URI.parse(buildChatUri(session, chatId)), providerData: encodeProviderData(info) });
		}
		return result;
	}

	/**
	 * Resolves the live backing for a peer chat from the in-memory
	 * {@link _chatBackings} map, falling back once to the agent's legacy
	 * `copilot.chats` catalog (seeding the live map) for sessions that have not
	 * been materialized via {@link materializeChat}.
	 */
	private async _resolveChatBacking(session: URI, chat: URI): Promise<IPersistedChat | undefined> {
		const chatKey = chat.toString();
		const live = this._chatBackings.get(chatKey);
		if (live) {
			return live;
		}
		const parsed = parseChatUri(chat);
		if (!parsed) {
			return undefined;
		}
		const persisted = await this._readPersistedChats(session);
		const info = persisted.get(parsed.chatId);
		if (info) {
			this._chatBackings.set(chatKey, info);
		}
		return info;
	}

	/**
	 * Returns the SDK-backed {@link CopilotAgentSession} for an additional peer
	 * chat, resuming its backing SDK chat if it is not already in
	 * memory (e.g. after a process restart). Returns `undefined` when the chat
	 * has no known backing chat.
	 */
	private async _ensureChatSession(session: URI, chat: URI): Promise<CopilotAgentSession | undefined> {
		const chatKey = chat.toString();
		const existing = this._findPeerChat(session, chat);
		if (existing) {
			return existing;
		}
		const parsed = parseChatUri(chat);
		if (!parsed) {
			return undefined;
		}
		const sessionId = AgentSession.id(session);
		return this._sessionSequencer.queue(sessionId, async () => {
			const again = this._findPeerChat(session, chat);
			if (again) {
				return again;
			}
			const info = await this._resolveChatBacking(session, chat);
			if (!info) {
				return undefined;
			}
			const parentEntry = this._findAnySession(sessionId) ?? await this._resumeSession(sessionId).catch(() => undefined);
			const workingDirectory = parentEntry?.workingDirectory
				?? this._provisionalSessions.get(sessionId)?.workingDirectory;
			if (!workingDirectory) {
				this._logService.warn(`[Copilot] Cannot resume chat ${chatKey}: missing working directory`);
				return undefined;
			}
			const client = await this._ensureClient();
			const activeClient = this._getOrCreateActiveClient(session, workingDirectory);
			const snapshot = await activeClient.snapshot();
			const shellManager = this._instantiationService.createInstance(ShellManager, chat, workingDirectory);
			const launchPlan: CopilotSessionLaunchPlan = {
				kind: 'resume',
				client,
				sessionId: info.sdkSessionId,
				workingDirectory,
				resolvedAgentName: undefined,
				snapshot,
				activeClientToolSet: activeClient.toolSet,
				shellManager,
				githubToken: this._githubToken,
				fallback: { model: info.model, longContextWindow: this._longContextWindowFor(info.model?.id), freeLongContext: this._isFreeLongContext(info.model?.id) },
			};
			let agentSession: CopilotAgentSession | undefined;
			try {
				agentSession = this._createAgentSession(launchPlan, workingDirectory, activeClient, chat);
				await agentSession.initializeSession();
				this._ensureEntry(sessionId).registerPeerChat(chatKey, new CopilotSessionEntry(agentSession));
				this._logService.info(`[Copilot] Resumed additional chat ${chatKey} in session ${session.toString()}`);
				return agentSession;
			} catch (error) {
				agentSession?.dispose();
				this._logService.warn(`[Copilot] Failed to resume additional chat ${chatKey}: ${error instanceof Error ? error.message : String(error)}`);
				return undefined;
			}
		});
	}

	async truncateSession(session: URI, turnId: string | undefined, chat: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		if (this._provisionalSessions.has(sessionId)) {
			return;
		}
		const isPeerChat = !isDefaultChatUri(chat);
		await this._sessionSequencer.queue(sessionId, async () => {
			this._logService.info(`[Copilot:${sessionId}] Truncating ${isPeerChat ? `peer chat ${chat.toString()}` : 'session'}${turnId !== undefined ? ` at turnId=${turnId}` : ' (all turns)'}`);

			// Resolve the entry whose history is being truncated: a peer chat has
			// its own backing SDK session, so route to it rather than the default
			// chat. `_resolveChatEntry` resumes/materializes the chat if needed.
			const entry = isPeerChat
				? await this._resolveChatEntry(session, chat)
				: (this._findAnySession(sessionId) ?? await this._resumeSession(sessionId));
			if (!entry) {
				this._logService.info(`[Copilot:${sessionId}] No chat entry resolved for truncation; nothing to truncate`);
				return;
			}

			// Look up the SDK event ID for the truncation boundary.
			// The protocol semantics: turnId is the last turn to KEEP.
			// The SDK semantics: eventId and all events after it are removed.
			// So we need the event ID of the *next* turn after turnId.
			// For "remove all", we need the first turn's event ID.
			let eventId: string | undefined;
			if (turnId) {
				eventId = await entry.getNextTurnEventId(turnId);
			} else {
				eventId = await entry.getFirstTurnEventId();
			}

			if (eventId) {
				await entry.truncateAtEventId(eventId, turnId);
			} else {
				this._logService.info(`[Copilot:${sessionId}] No event ID found for truncation, nothing to truncate`);
			}

			this._logService.info(`[Copilot:${sessionId}] Session truncated`);
		});
	}

	private async _changeModel(chat: URI, model: ModelSelection): Promise<void> {
		const longContextWindow = this._longContextWindowFor(model.id);
		const freeLongContext = this._isFreeLongContext(model.id);
		const context = this._getChatContext(chat);
		// Same override the launcher applies at create (validated + logged by
		// resolveCopilotReasoningEffort); computed at the point of use so the
		// provisional-session path doesn't resolve or log it prematurely.
		if (context.isPeerChat) {
			await context.target?.setModel(model.id, resolveCopilotReasoningEffort(model, this._configurationService, this._logService, context.sessionId), getCopilotContextTier(model, longContextWindow, freeLongContext));
			const backing = this._chatBackings.get(context.chatKey);
			if (backing) {
				const updated: IPersistedChat = { sdkSessionId: backing.sdkSessionId, model };
				this._chatBackings.set(context.chatKey, updated);
				this._onDidChangeChatData.fire({ chat: chat, providerData: encodeProviderData(updated) });
			}
			return;
		}
		const provisional = this._provisionalSessions.get(context.sessionId);
		if (provisional) {
			provisional.model = model;
			return;
		}
		const entry = context.target;
		if (entry) {
			await entry.setModel(model.id, resolveCopilotReasoningEffort(model, this._configurationService, this._logService, context.sessionId), getCopilotContextTier(model, longContextWindow, freeLongContext));
		}
		await this._storeSessionMetadata(context.session, model, undefined, undefined, undefined);
	}

	private async _changeAgent(chat: URI, agent: AgentSelection | undefined): Promise<void> {
		const context = this._getChatContext(chat);
		if (context.isPeerChat) {
			if (context.target) {
				const resolvedAgentName = agent ? this._resolveAgentName(context.target.appliedSnapshot, agent) : undefined;
				await context.target.setAgent(resolvedAgentName);
			}
			return;
		}
		const provisional = this._provisionalSessions.get(context.sessionId);
		if (provisional) {
			provisional.agent = agent;
			return;
		}
		const entry = context.target;
		if (entry) {
			// Resolve the URI → SDK name from the session's currently-applied
			// plugin snapshot. If the agent is no longer present (plugin
			// removed, never loaded), pass `undefined` so the SDK clears its
			// selection rather than silently keeping the previous one.
			const resolvedAgentName = agent ? this._resolveAgentName(entry.appliedSnapshot, agent) : undefined;
			await entry.setAgent(resolvedAgentName);
		}
		await this._storeSessionAgentMetadata(context.session, agent);
	}

	async shutdown(): Promise<void> {
		this._shutdownPromise ??= (async () => {
			// Cancel any pending model-refresh retry so its timer cannot fire
			// after teardown and resurrect the client.
			this._modelRefreshRetry.clear();
			this._logService.info('[Copilot] Shutting down...');
			const sessionIds = new Set([...this._sessions.keys(), ...this._createdWorktrees.keys()]);
			for (const sessionId of sessionIds) {
				await this._sessionSequencer.queue(sessionId, () => this._destroyAndDisposeSession(sessionId));
			}
			await this._client?.stop();
			this._client = undefined;
			// Release the BYOK proxy handle only after the runtime subprocess is
			// gone, mirroring `_stopClient` and the proxy ownership invariant.
			await this._sessionLauncher.disposeByokProxyHandle();
		})();
		return this._shutdownPromise;
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		for (const entry of this._sessions.values()) {
			for (const chat of entry.allChatSessions()) {
				if (chat.respondToPermissionRequest(requestId, approved)) {
					return;
				}
			}
		}
	}

	respondToUserInputRequest(requestId: string, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>): void {
		for (const entry of this._sessions.values()) {
			for (const chat of entry.allChatSessions()) {
				if (chat.respondToUserInputRequest(requestId, response, answers)) {
					return;
				}
			}
		}
	}

	/**
	 * Returns true if this provider owns the given session ID. Includes
	 * provisional sessions that have not yet been materialized.
	 */
	hasSession(session: URI): boolean {
		const sessionId = AgentSession.id(session);
		return this._sessions.has(sessionId) || this._provisionalSessions.has(sessionId);
	}

	// ---- helpers ------------------------------------------------------------

	private async _configureProxyEnv(env: Record<string, string | undefined>): Promise<void> {
		const proxy = await this._resolveProxyForSdk(env);
		this._appliedProxy = proxy;
		if (proxy) {
			for (const key of COPILOT_PROXY_SET_ENV_KEYS) {
				env[key] = proxy;
			}
			this._logService.info('[Copilot] Resolved CAPI proxy and forwarded HTTP_PROXY/HTTPS_PROXY to Copilot SDK');
		}
	}

	private async _resolveProxyForSdk(env: Record<string, string | undefined> = process.env): Promise<string | undefined> {
		if (COPILOT_PROXY_ENV_KEYS.some(key => env[key])) {
			this._logService.debug('[Copilot] Proxy env var already set; leaving Copilot SDK proxy configuration to the environment');
			return undefined;
		}

		let capiUrl = env['VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE'] || COPILOT_CAPI_URL;
		if (this._githubToken) {
			try {
				const discovered = await this._copilotApiService.resolveApiEndpoint(this._githubToken);
				if (discovered) {
					capiUrl = discovered;
				}
			} catch (error) {
				this._logService.debug(`[Copilot] CAPI endpoint discovery for proxy resolution failed; using ${capiUrl}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		try {
			return await this._proxyResolver.resolveProxy(capiUrl);
		} catch (error) {
			this._logService.warn(`[Copilot] Failed to resolve CAPI proxy for ${capiUrl}: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	/**
	 * When the GitHub token changes, the token-discovered CAPI endpoint (and so
	 * the resolved proxy) can change. The proxy is baked into the SDK subprocess
	 * env at client start, so if it would now differ we stop the running client
	 * here; the next `_ensureClient` re-resolves it against the new token. No-op
	 * when no client is running/starting or the proxy is unchanged.
	 */
	private async _restartClientIfProxyChanged(): Promise<void> {
		if (!this._client && !this._clientStarting) {
			return;
		}
		const oldProxy = this._appliedProxy;
		const newProxy = await this._resolveProxyForSdk();
		if (newProxy === oldProxy) {
			return;
		}
		// Let any in-flight start finish so we stop a live client rather than
		// racing it (the start would otherwise come up with the stale proxy).
		if (this._clientStarting) {
			try {
				await this._clientStarting;
			} catch {
				// Start failed; nothing running to restart.
			}
		}
		if (!this._client) {
			return;
		}
		this._logService.info(`[Copilot] CAPI proxy changed after token update (${oldProxy ?? '(none)'} -> ${newProxy ?? '(none)'}); restarting CopilotClient`);
		this._sessions.clearAndDisposeAll();
		this._mcpNotificationSubs.clearAndDisposeAll();
		await this._stopClient();
	}

	/**
	 * Disposes every peer chat hosted on the owning session's entry and drops
	 * their live backings from {@link _chatBackings}. The chat URI encodes its
	 * parent session, so we recover it via {@link parseChatUri}.
	 */
	private _disposeChildChats(sessionId: string): void {
		const entry = this._sessions.get(sessionId);
		if (entry) {
			for (const chatKey of entry.peerChatKeys()) {
				entry.disposePeerChat(chatKey);
			}
		}
		for (const chatKey of [...this._chatBackings.keys()]) {
			const parsed = parseChatUri(URI.parse(chatKey));
			if (parsed && AgentSession.id(parsed.session) === sessionId) {
				this._chatBackings.delete(chatKey);
			}
		}
	}

	private _getOrCreateActiveClient(session: URI, directory: URI | undefined): ActiveClient {
		let client = this._activeClients.get(session);
		if (!client) {
			const pluginController = this._plugins.createSessionController(directory);
			client = this._instantiationService.createInstance(ActiveClient, session, pluginController, this._onDidSessionProgress);
			this._activeClients.set(session, client);
		} else if (directory) {
			client.pluginController.setDirectory(directory);
		}
		return client;
	}

	/**
	 * Instantiates a {@link CopilotAgentSession} for the given session id.
	 * The caller is responsible for awaiting {@link CopilotAgentSession.initializeSession}
	 * and, on success, registering the entry in {@link _sessions}. The
	 * session is intentionally **not** registered here so a concurrent
	 * {@link _resumeSession} for the same id cannot dispose this entry mid-init
	 * via {@link DisposableMap.set}.
	 */
	private _createAgentSession(launchPlan: CopilotSessionLaunchPlan, customizationDirectory: URI | undefined, activeClient: ActiveClient, channelUri?: URI): CopilotAgentSession {
		const sessionUri = channelUri ?? AgentSession.uri(this.id, launchPlan.sessionId);
		const chatChannelUri = channelUri ?? URI.parse(buildDefaultChatUri(sessionUri));

		const agentSession = this._instantiationService.createInstance(
			CopilotAgentSession,
			{
				sessionUri,
				chatChannelUri,
				rawSessionId: launchPlan.sessionId,
				onDidSessionProgress: this._onDidSessionProgress,
				sessionLauncher: this._sessionLauncher,
				launchPlan,
				shellManager: launchPlan.shellManager,
				workingDirectory: launchPlan.workingDirectory,
				customizationDirectory,
				clientSnapshot: launchPlan.snapshot,
				activeClientToolSet: launchPlan.activeClientToolSet,
				resolveMcpChildId: name => findMcpChildId(activeClient.pluginController.getCustomizations(), name),
				serverToolHost: this._serverToolHost,
			},
		);

		this._mcpNotificationSubs.set(launchPlan.sessionId, combinedDisposable(
			agentSession.onMcpNotification(n => this._onMcpNotification.fire(n)),
			autorun(r => activeClient.pluginController.mcpServerStates.set(agentSession.mcpServerStates.read(r), undefined)),
		));

		return agentSession;
	}

	/**
	 * Register a freshly initialised session in `_sessions`, or — if
	 * shutdown has already started between init beginning and resolving —
	 * dispose the session and throw {@link CancellationError}. Without this
	 * guard an in-flight `_resumeSession` / `_materializeProvisional` whose
	 * `initializeSession()` resolves after `dispose()` has run would call
	 * `_sessions.set(...)` on a disposed `DisposableMap`, leaking the
	 * session and reproducing the very 'Trying to add a disposable to a
	 * DisposableStore that has already been disposed' warning this fix
	 * exists to prevent.
	 */
	private _registerInitializedSession(sessionId: string, agentSession: CopilotAgentSession): void {
		if (this._shutdownPromise) {
			agentSession.dispose();
			throw new CancellationError();
		}
		// Reuse an existing entry (which may already host peer chats created
		// while the default chat was still provisional) rather than replacing
		// it, which would dispose those peers. The default chat is seeded into
		// the entry's uniform chat map keyed by its default-chat URI.
		const defaultChatKey = buildDefaultChatUri(agentSession.sessionUri.toString());
		let entry = this._sessions.get(sessionId);
		if (!entry) {
			entry = new CopilotSessionEntry();
			this._sessions.set(sessionId, entry);
		}
		entry.setDefaultChat(defaultChatKey, new CopilotSessionEntry(agentSession));
	}

	private async _destroyAndDisposeSession(sessionId: string): Promise<void> {
		await this._releaseSessionResources(sessionId);
		// `_releaseSessionResources` tears down everything in memory but leaves
		// the worktree intact (it is reused by non-destructive release). The
		// destructive dispose path additionally reaps the created worktree; this
		// is a no-op for provisional sessions, which never created one.
		await this._removeCreatedWorktree(sessionId);
	}

	/**
	 * Tears down a session's in-memory resources without deleting any durable
	 * data: the SDK session is disconnected, peer chats and MCP subscriptions
	 * are disposed, the `_sessions` entry is dropped, and active clients are
	 * released. The on-disk SDK session log, session database, and worktree are
	 * left untouched, so the session can be resumed later via
	 * {@link _resumeSession}. Shared by the non-destructive {@link releaseSession}
	 * path and the destructive {@link _destroyAndDisposeSession} path (the
	 * latter reaps the worktree afterwards).
	 */
	private async _releaseSessionResources(sessionId: string): Promise<void> {
		// Tear down any peer chats owned by this session first so their SDK
		// chats don't leak when the parent is deleted/disposed
		// without each chat being individually disposed via `disposeChat`.
		this._disposeChildChats(sessionId);
		// Provisional sessions have no SDK session, no worktree, and no
		// on-disk metadata — drop the in-memory record and clean up the
		// active-client snapshot. The state-manager entry is removed by the
		// caller via {@link IAgentService.disposeSession}.
		const provisional = this._provisionalSessions.get(sessionId);
		if (provisional) {
			this._provisionalSessions.delete(sessionId);
			// Drop any peer-host entry created for this still-provisional
			// session (its peers were disposed by `_disposeChildChats` above).
			this._sessions.deleteAndDispose(sessionId);
			this._activeClients.get(provisional.sessionUri)?.dispose();
			this._activeClients.delete(provisional.sessionUri);
			return;
		}
		const entry = this._findAnySession(sessionId);
		const sessionUri = AgentSession.uri(this.id, sessionId);
		if (entry) {
			try {
				await entry.destroySession();
			} catch (error) {
				this._logService.warn(`[Copilot:${sessionId}] Failed to destroy session before cleanup: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		this._sessions.deleteAndDispose(sessionId);
		this._mcpNotificationSubs.deleteAndDispose(sessionId);
		this._activeClients.get(sessionUri)?.dispose();
		this._activeClients.delete(sessionUri);
	}

	protected _resumeSession(sessionId: string): Promise<CopilotAgentSession> {
		const existing = this._resumingSessions.get(sessionId);
		if (existing) {
			return existing;
		}
		const promise = this._doResumeSession(sessionId);
		this._resumingSessions.set(sessionId, promise);
		const cleanup = () => {
			if (this._resumingSessions.get(sessionId) === promise) {
				this._resumingSessions.delete(sessionId);
			}
		};
		promise.then(cleanup, cleanup);
		return promise;
	}

	private async _doResumeSession(sessionId: string): Promise<CopilotAgentSession> {
		this._logService.info(`[Copilot:${sessionId}] _resumeSession called — session not in memory, resuming...`);
		const client = await this._ensureClient();

		const sessionUri = AgentSession.uri(this.id, sessionId);
		const storedMetadata = await this._readSessionMetadata(sessionUri);
		const sessionMetadata = await client.getSessionMetadata(sessionId).catch(err => {
			this._logService.warn(`[Copilot:${sessionId}] getSessionMetadata failed`, err);
			return undefined;
		});
		const workingDirectory = storedMetadata.workingDirectory ?? (typeof sessionMetadata?.context?.workingDirectory === 'string' ? URI.file(sessionMetadata.context.workingDirectory) : undefined);
		if (!workingDirectory) {
			throw new Error(`workingDirectory is required to resume Copilot session '${sessionId}'`);
		}
		// A workspace-less chat's working directory is a stable per-session scratch dir
		// that may have been reaped (OS temp cleanup, reboot) while the session
		// persisted. Recreate it (mkdir -p) so shell/git/scratch ops don't fail.
		let resolvedWorkingDirectory = workingDirectory;
		if (storedMetadata.workspaceless) {
			await this._ensureWorkspacelessScratchDir(workingDirectory, sessionId);
		} else {
			// A worktree-isolated session's working directory may have been removed
			// (archive cleanup deletes the worktree while keeping the branch). The
			// SDK requires an existing directory to bring up the session — the only
			// path to read the transcript. Fall back to the persisted repository
			// root so the session resumes for history. Turns on archived sessions
			// are rejected host-side, so nothing runs in this directory.
			resolvedWorkingDirectory = await this._ensureResumeWorkingDirectory(sessionUri, sessionId, workingDirectory);
		}
		// Anchor customization discovery to the working directory (the worktree for
		// worktree-isolated sessions), matching how the session was materialized.
		// Older sessions persisted `customizationDirectory` as the user-picked
		// folder; preferring the working directory corrects them on resume.
		const customizationDirectory = resolvedWorkingDirectory;
		// Always create an ActiveClient so the snapshot includes host +
		// session-discovered customizations, even when no client has
		// registered an active-client handle yet.
		const activeClient = this._getOrCreateActiveClient(sessionUri, customizationDirectory);
		activeClient.pluginController.reanchor(customizationDirectory);
		const snapshot = await activeClient.snapshot();

		const shellManager = this._instantiationService.createInstance(ShellManager, sessionUri, resolvedWorkingDirectory);
		const resolvedAgentName = storedMetadata.agent ? this._resolveAgentName(snapshot, storedMetadata.agent) : undefined;
		if (storedMetadata.agent && !resolvedAgentName) {
			this._logService.info(`[Copilot:${sessionId}] Stored custom agent is not available in the current plugin snapshot; resuming without a custom agent`);
		}
		const launchPlan: CopilotSessionLaunchPlan = {
			kind: 'resume',
			client,
			sessionId,
			workingDirectory: resolvedWorkingDirectory,
			resolvedAgentName,
			snapshot,
			activeClientToolSet: activeClient.toolSet,
			shellManager,
			githubToken: this._githubToken,
			workspaceless: storedMetadata.workspaceless,
			fallback: {
				model: storedMetadata.model,
				longContextWindow: this._longContextWindowFor(storedMetadata.model?.id),
				freeLongContext: this._isFreeLongContext(storedMetadata.model?.id),
			},
		};

		const agentSession = this._createAgentSession(launchPlan, customizationDirectory, activeClient);
		try {
			await agentSession.initializeSession();
		} catch (err) {
			agentSession.dispose();
			throw err;
		}
		this._registerInitializedSession(sessionId, agentSession);

		return agentSession;
	}

	/**
	 * Resolves the directory to resume a session's SDK bring-up against,
	 * repairing a missing worktree when possible.
	 *
	 * Normally this is the session's persisted `workingDirectory`. But that
	 * directory can be gone:
	 *
	 * - **Archived worktree session**: archiving deliberately removes the
	 *   worktree (keeping the branch). Archived sessions are read-only — turns
	 *   are rejected host-side — so we resume against the persisted repository
	 *   root purely to read the transcript (the SDK needs an existing directory
	 *   to bring the session up).
	 * - **Live (non-archived) worktree session whose worktree vanished** (e.g.
	 *   the user deleted it, or a cleanup tool removed it): the session is still
	 *   interactive, so silently resuming in the source repository would lose
	 *   isolation and risk running the agent against the user's working tree.
	 *   Instead we recreate the worktree from its persisted branch and resume
	 *   there. If recreation is impossible (branch gone / git failure) we surface
	 *   the failure rather than degrade to the source repository.
	 *
	 * Throws {@link SessionWorkingDirectoryMissingError} when the directory
	 * cannot be resolved, so the load failure is surfaced to the client instead
	 * of silently producing an empty (or misdirected) session.
	 *
	 * Uses the persisted `repositoryRoot` rather than deriving it from the
	 * working directory (see the `_readWorktreeMetadata` gotcha).
	 */
	private async _ensureResumeWorkingDirectory(session: URI, sessionId: string, workingDirectory: URI): Promise<URI> {
		if (workingDirectory.scheme !== Schemas.file) {
			return workingDirectory;
		}
		try {
			await fs.access(workingDirectory.fsPath);
			return workingDirectory;
		} catch {
			// Working directory is missing — repair or fall back below.
		}

		const meta = await this._readWorktreeMetadata(session).catch(() => undefined);
		const archived = await this._isSessionArchived(session);

		if (archived) {
			// Read-only: resume against the repository root for history only.
			if (meta?.repositoryRoot) {
				try {
					await fs.access(meta.repositoryRoot.fsPath);
					this._logService.info(`[Copilot:${sessionId}] Archived session working directory '${workingDirectory.fsPath}' is missing; resuming against repository root '${meta.repositoryRoot.fsPath}' for history`);
					return meta.repositoryRoot;
				} catch {
					// Repository root is gone too — fall through to the unrecoverable case.
				}
			}
			this._logService.warn(`[Copilot:${sessionId}] Cannot resume archived session: working directory '${workingDirectory.fsPath}' is missing and no usable repository-root fallback was found`);
			throw new SessionWorkingDirectoryMissingError(workingDirectory);
		}

		// Live worktree session whose worktree vanished: recreate it rather than
		// silently degrading to the source repository (which would lose the
		// session's isolation).
		let recreateFailureReason: string | undefined;
		if (meta?.worktreePath && meta.repositoryRoot) {
			const recreated = await this._recreateWorktree(sessionId, { branchName: meta.branchName, worktreePath: meta.worktreePath, repositoryRoot: meta.repositoryRoot });
			if (recreated.ok) {
				this._logService.info(`[Copilot:${sessionId}] Recreated missing worktree '${meta.worktreePath.fsPath}' for a live session on resume`);
				return meta.worktreePath;
			}
			recreateFailureReason = recreated.reason;
		}

		// Not a worktree session, or the worktree could not be recreated: surface
		// the failure (with the git reason when we have one) instead of running in
		// the wrong place.
		this._logService.warn(`[Copilot:${sessionId}] Cannot resume: working directory '${workingDirectory.fsPath}' is missing and its worktree could not be recreated${recreateFailureReason ? `: ${recreateFailureReason}` : ''}`);
		throw new SessionWorkingDirectoryMissingError(workingDirectory, recreateFailureReason);
	}

	/**
	 * Reads the persisted archived flag for a session from its database. The
	 * flag is written by the orchestrator as the `isArchived` metadata key (with
	 * a legacy `isDone` fallback for sessions persisted before the rename).
	 */
	private async _isSessionArchived(session: URI): Promise<boolean> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return false;
		}
		try {
			const [isArchived, isDone] = await Promise.all([
				ref.object.getMetadata(AH_META_IS_ARCHIVED_DB_KEY),
				ref.object.getMetadata(AH_META_IS_DONE_DB_KEY),
			]);
			return isArchived !== undefined ? isArchived === 'true' : isDone === 'true';
		} finally {
			ref.dispose();
		}
	}

	/**
	 * Recreates a worktree from its persisted branch via `git worktree add`.
	 * Shared by the unarchive path ({@link _recreateWorktreeOnUnarchive}) and the
	 * resume repair path ({@link _ensureResumeWorkingDirectory}). Resolves to
	 * `{ ok: true }` on success, or `{ ok: false, reason }` with a
	 * human-readable reason (branch missing, or the git error) when it cannot
	 * recreate; both cases are logged. Callers decide how to surface the reason.
	 */
	private async _recreateWorktree(sessionId: string, meta: { readonly branchName: string; readonly worktreePath: URI; readonly repositoryRoot: URI }): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
		const { branchName, worktreePath, repositoryRoot } = meta;
		// Skip if the branch is missing — we have no commit to attach the
		// recreated worktree to.
		const branchPresent = await this._gitService.branchExists(repositoryRoot, branchName).catch(() => false);
		if (!branchPresent) {
			const reason = localize('worktreeRecreateBranchMissing', "the branch '{0}' no longer exists", branchName);
			this._logService.info(`[Copilot:${sessionId}] Cannot recreate worktree: branch '${branchName}' is missing`);
			return { ok: false, reason };
		}
		try {
			await fs.mkdir(URI.joinPath(worktreePath, '..').fsPath, { recursive: true });
			await this._gitService.addExistingWorktree(repositoryRoot, worktreePath, branchName);
			this._createdWorktrees.set(sessionId, { repositoryRoot, worktree: worktreePath });
			this._logService.info(`[Copilot:${sessionId}] Recreated worktree '${worktreePath.fsPath}'`);
			return { ok: true };
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			this._logService.warn(`[Copilot:${sessionId}] Failed to recreate worktree '${worktreePath.fsPath}': ${reason}`);
			return { ok: false, reason };
		}
	}

	private async _getGitInfo(workingDirectory: URI): Promise<{ currentBranch: string; defaultBranch: string } | undefined> {
		const repositoryRoot = await this._gitService.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		// Skip worktree isolation for a repo with no commits yet (unborn HEAD); `git worktree add` would fail.
		const headCommit = await this._gitService.revParse(repositoryRoot, 'HEAD').catch(() => undefined);
		if (!headCommit) {
			return undefined;
		}

		const currentBranch = await this._gitService.getCurrentBranch(repositoryRoot) ?? 'HEAD';
		const defaultBranch = await this._gitService.getDefaultBranch(repositoryRoot) ?? currentBranch;
		return { currentBranch, defaultBranch };
	}

	private async _getBranches(workingDirectory: URI, query?: string): Promise<string[]> {
		return this._gitService.getBranches(workingDirectory, { query, limit: CopilotAgent._BRANCH_COMPLETION_LIMIT });
	}

	protected async _resolveSessionWorkingDirectory(config: IAgentCreateSessionConfig | undefined, sessionId: string, prompt?: string): Promise<URI | undefined> {
		if (config?.config?.isolation !== 'worktree' || !config.workingDirectory || typeof config.config.branch !== 'string') {
			return config?.workingDirectory;
		}

		const repositoryRoot = await this._gitService.getRepositoryRoot(config.workingDirectory);
		if (!repositoryRoot) {
			return config.workingDirectory;
		}

		const worktreesRoot = getCopilotWorktreesRoot(repositoryRoot);
		// Prefix (e.g. the user's `git.branchPrefix`) the client forwards for
		// worktree-isolated sessions. Prepended ahead of the built-in `agents/`
		// prefix when naming the branch and stripped from the worktree dir name.
		const worktreeBranchPrefix = typeof config.config[SessionConfigKey.WorktreeBranchPrefix] === 'string'
			? config.config[SessionConfigKey.WorktreeBranchPrefix] as string
			: undefined;
		const branchName = await this._branchNameGenerator.generateBranchName({
			sessionId,
			message: prompt,
			githubToken: this._githubToken,
			branchPrefix: worktreeBranchPrefix,
			// Treat a failed existence check as a collision so we fall back to a
			// suffixed branch name rather than risk `addWorktree` failing because
			// the branch already exists.
			branchExists: branchName => this._gitService.branchExists(repositoryRoot, branchName).catch(() => true),
		});
		const worktree = URI.joinPath(worktreesRoot, getCopilotWorktreeDirectoryName(branchName, worktreeBranchPrefix));
		await fs.mkdir(worktreesRoot.fsPath, { recursive: true });
		const baseBranch = typeof config.config[SessionConfigKey.Branch] === 'string' ? config.config[SessionConfigKey.Branch] as string : undefined;
		// `addWorktree`'s signature requires a startPoint, but historically the
		// runtime accepted undefined when `branch` was not set in config. Preserve
		// that behavior by passing through whatever value (or undefined) was set.
		await this._gitService.addWorktree(repositoryRoot, worktree, branchName, baseBranch as string);

		const worktreeIncludeFiles = Array.isArray(config.config[SessionConfigKey.WorktreeIncludeFiles]) &&
			config.config[SessionConfigKey.WorktreeIncludeFiles].every(pattern => typeof pattern === 'string')
			? config.config[SessionConfigKey.WorktreeIncludeFiles] as string[]
			: undefined;
		if (worktreeIncludeFiles?.length) {
			try {
				await this._gitService.copyWorktreeIncludeFiles(repositoryRoot, worktree, worktreeIncludeFiles);
			} catch (error) {
				this._logService.warn(`[Copilot:${sessionId}] Failed to copy worktree include files: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		this._createdWorktrees.set(sessionId, { repositoryRoot, worktree });
		// Queue the worktree announcement so the first turn (live) and any
		// subsequent restore (history) both surface the message in the chat.
		this._pendingFirstTurnAnnouncements.set(sessionId, buildWorktreeAnnouncementText(branchName));
		const sessionUri = AgentSession.uri(this.id, sessionId);
		try {
			await this._writeWorktreeMetadata(sessionUri, { branchName, baseBranch, worktreePath: worktree, repositoryRoot });
		} catch (error) {
			this._logService.warn(`[Copilot:${sessionId}] Failed to persist worktree branch metadata: ${error instanceof Error ? error.message : String(error)}`);
		}
		return worktree;
	}

	private async _removeCreatedWorktree(sessionId: string): Promise<void> {
		const worktree = this._createdWorktrees.get(sessionId);
		if (!worktree) {
			return;
		}
		try {
			await this._gitService.removeWorktree(worktree.repositoryRoot, worktree.worktree);
		} catch (error) {
			this._logService.warn(`[Copilot:${sessionId}] Failed to remove worktree '${worktree.worktree.fsPath}': ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this._createdWorktrees.delete(sessionId);
		}
	}

	// ---- session metadata persistence --------------------------------------

	private static readonly _META_MODEL = 'copilot.model';
	private static readonly _META_AGENT = 'copilot.agent';
	private static readonly _META_CWD = 'copilot.workingDirectory';
	private static readonly _META_CUSTOMIZATION_DIRECTORY = 'copilot.customizationDirectory';
	private static readonly _META_PROJECT_RESOLVED = 'copilot.project.resolved';
	private static readonly _META_PROJECT_URI = 'copilot.project.uri';
	private static readonly _META_PROJECT_DISPLAY_NAME = 'copilot.project.displayName';
	private static readonly _META_WORKTREE_BRANCH = 'copilot.worktree.branchName';
	private static readonly _META_WORKTREE_PATH = 'copilot.worktree.path';
	private static readonly _META_WORKTREE_REPOSITORY_ROOT = 'copilot.worktree.repositoryRoot';
	/** Persisted catalog of additional (non-default) peer chats, keyed by chatId. */
	private static readonly _META_CHATS = 'copilot.chats';

	/**
	 * Reads the agent's legacy peer-chat catalog (`copilot.chats`) for a
	 * session. Each entry maps a chatId (the `ahp-chat` authority) to the SDK
	 * chat that backs it (and its optional model override). The agent
	 * no longer *writes* this catalog — the orchestrator owns the durable
	 * peer-chat catalog via `providerData` — but the read is retained for one
	 * release to drain sessions persisted before that migration (see
	 * {@link getChats} and {@link materializeChat}).
	 */
	private async _readPersistedChats(session: URI): Promise<Map<string, IPersistedChat>> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return new Map();
		}
		try {
			const raw = await ref.object.getMetadata(CopilotAgent._META_CHATS);
			if (!raw) {
				return new Map();
			}
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			const result = new Map<string, IPersistedChat>();
			for (const [chatId, value] of Object.entries(parsed)) {
				// The metadata blob is client-influenced and may be corrupted or
				// tampered: drop entries that don't carry a usable SDK session id
				// rather than letting an invalid id reach `client.deleteSession`.
				if (!value || typeof value !== 'object') {
					continue;
				}
				const { sdkSessionId, model } = value as { sdkSessionId?: unknown; model?: unknown };
				if (typeof sdkSessionId !== 'string' || !sdkSessionId) {
					continue;
				}
				result.set(chatId, { sdkSessionId, ...(model ? { model: model as ModelSelection } : {}) });
			}
			return result;
		} catch (err) {
			this._logService.warn(`[Copilot] Failed to read persisted chats for ${session.toString()}: ${err instanceof Error ? err.message : String(err)}`);
			return new Map();
		} finally {
			ref.dispose();
		}
	}


	private async _writeWorktreeMetadata(session: URI, metadata: { branchName: string; baseBranch: string | undefined; worktreePath: URI; repositoryRoot: URI }): Promise<void> {
		const dbRef = this._sessionDataService.openDatabase(session);
		try {
			const work: Promise<void>[] = [
				dbRef.object.setMetadata(CopilotAgent._META_WORKTREE_BRANCH, metadata.branchName),
				dbRef.object.setMetadata(CopilotAgent._META_WORKTREE_PATH, metadata.worktreePath.toString()),
				dbRef.object.setMetadata(CopilotAgent._META_WORKTREE_REPOSITORY_ROOT, metadata.repositoryRoot.toString()),
			];
			if (metadata.baseBranch) {
				work.push(dbRef.object.setMetadata(META_DIFF_BASE_BRANCH, metadata.baseBranch));
			}
			await Promise.all(work);
		} finally {
			dbRef.dispose();
		}
	}

	private async _readWorktreeMetadata(session: URI): Promise<{ branchName: string; worktreePath?: URI; repositoryRoot?: URI } | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return undefined;
		}
		try {
			const [branchName, worktreePathRaw, repositoryRootRaw] = await Promise.all([
				ref.object.getMetadata(CopilotAgent._META_WORKTREE_BRANCH),
				ref.object.getMetadata(CopilotAgent._META_WORKTREE_PATH),
				ref.object.getMetadata(CopilotAgent._META_WORKTREE_REPOSITORY_ROOT),
			]);
			if (!branchName) {
				return undefined;
			}
			const worktreePath = worktreePathRaw ? URI.parse(worktreePathRaw) : undefined;
			const repositoryRoot = repositoryRootRaw ? URI.parse(repositoryRootRaw) : undefined;
			return { branchName, worktreePath, repositoryRoot };
		} finally {
			ref.dispose();
		}
	}

	private async _storeSessionMetadata(session: URI, model: ModelSelection | undefined, workingDirectory: URI | undefined, customizationDirectory: URI | undefined, project: IAgentSessionProjectInfo | undefined, projectResolved = project !== undefined): Promise<void> {
		const dbRef = this._sessionDataService.openDatabase(session);
		const db = dbRef.object;
		try {
			const work: Promise<void>[] = [];
			if (model) {
				work.push(db.setMetadata(CopilotAgent._META_MODEL, this._serializeModelSelection(model)));
			}
			if (workingDirectory) {
				work.push(db.setMetadata(CopilotAgent._META_CWD, workingDirectory.toString()));
			}
			if (customizationDirectory) {
				work.push(db.setMetadata(CopilotAgent._META_CUSTOMIZATION_DIRECTORY, customizationDirectory.toString()));
			}
			if (projectResolved) {
				work.push(db.setMetadata(CopilotAgent._META_PROJECT_RESOLVED, 'true'));
			}
			if (project) {
				work.push(db.setMetadata(CopilotAgent._META_PROJECT_URI, project.uri.toString()));
				work.push(db.setMetadata(CopilotAgent._META_PROJECT_DISPLAY_NAME, project.displayName));
			}
			await Promise.all(work);
		} finally {
			dbRef.dispose();
		}
	}

	private async _readSessionMetadata(session: URI): Promise<{ model?: ModelSelection; agent?: AgentSelection; workingDirectory?: URI; customizationDirectory?: URI; workspaceless?: boolean }> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return {};
		}
		try {
			const [model, agent, cwd, customizationDirectory, workspaceless] = await Promise.all([
				ref.object.getMetadata(CopilotAgent._META_MODEL),
				ref.object.getMetadata(CopilotAgent._META_AGENT),
				ref.object.getMetadata(CopilotAgent._META_CWD),
				ref.object.getMetadata(CopilotAgent._META_CUSTOMIZATION_DIRECTORY),
				ref.object.getMetadata(AH_META_WORKSPACELESS_DB_KEY),
			]);
			return {
				model: this._parseModelSelection(model),
				agent: this._parseAgentSelection(agent),
				workingDirectory: cwd ? URI.parse(cwd) : undefined,
				customizationDirectory: customizationDirectory ? URI.parse(customizationDirectory) : undefined,
				workspaceless: workspaceless === 'true',
			};
		} finally {
			ref.dispose();
		}
	}

	private async _readStoredSessionMetadata(session: URI): Promise<{ model?: ModelSelection; agent?: AgentSelection; workingDirectory?: URI; customizationDirectory?: URI; project?: IAgentSessionProjectInfo; resolved: boolean; workspaceless?: boolean } | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return undefined;
		}
		try {
			const [model, agent, cwd, customizationDirectory, resolved, uri, displayName, workspaceless] = await Promise.all([
				ref.object.getMetadata(CopilotAgent._META_MODEL),
				ref.object.getMetadata(CopilotAgent._META_AGENT),
				ref.object.getMetadata(CopilotAgent._META_CWD),
				ref.object.getMetadata(CopilotAgent._META_CUSTOMIZATION_DIRECTORY),
				ref.object.getMetadata(CopilotAgent._META_PROJECT_RESOLVED),
				ref.object.getMetadata(CopilotAgent._META_PROJECT_URI),
				ref.object.getMetadata(CopilotAgent._META_PROJECT_DISPLAY_NAME),
				ref.object.getMetadata(AH_META_WORKSPACELESS_DB_KEY),
			]);
			const workingDirectory = cwd ? URI.parse(cwd) : undefined;
			const project = uri && displayName ? { uri: URI.parse(uri), displayName } : undefined;
			return {
				model: this._parseModelSelection(model),
				agent: this._parseAgentSelection(agent),
				workingDirectory,
				customizationDirectory: customizationDirectory ? URI.parse(customizationDirectory) : undefined,
				project,
				resolved: resolved === 'true' || project !== undefined,
				workspaceless: workspaceless === 'true',
			};
		} finally {
			ref.dispose();
		}
	}

	/**
	 * Persists (or clears) the selected custom agent for a session. Writing
	 * `undefined` clears the stored selection by writing an empty string,
	 * which later cold reads treat as "no custom agent" because
	 * `_parseAgentSelection` short-circuits on falsy metadata values.
	 */
	private async _storeSessionAgentMetadata(session: URI, agent: AgentSelection | undefined): Promise<void> {
		const dbRef = this._sessionDataService.openDatabase(session);
		try {
			// Writing an empty string is treated as "no selection" by
			// `_parseAgentSelection` (it short-circuits on a falsy raw value),
			// so this is the clear path while `setMetadata` lacks a delete.
			await dbRef.object.setMetadata(CopilotAgent._META_AGENT, agent ? this._serializeAgentSelection(agent) : '');
		} finally {
			dbRef.dispose();
		}
	}

	private async _storeSessionProjectResolution(session: URI, project: IAgentSessionProjectInfo | undefined): Promise<void> {
		await this._storeSessionMetadata(session, undefined, undefined, undefined, project, true);
	}

	private _resolveSessionProject(context: ICopilotSessionContext | undefined, limiter: Limiter<IAgentSessionProjectInfo | undefined>, projectByContext: Map<string, Promise<IAgentSessionProjectInfo | undefined>>): Promise<IAgentSessionProjectInfo | undefined> {
		const key = this._projectContextKey(context);
		if (!key) {
			return Promise.resolve(undefined);
		}

		let project = projectByContext.get(key);
		if (!project) {
			project = limiter.queue(() => projectFromCopilotContext(context, this._gitService));
			projectByContext.set(key, project);
		}
		return project;
	}

	private _projectContextKey(context: ICopilotSessionContext | undefined): string | undefined {
		if (context?.cwd) {
			return `cwd:${context.cwd}`;
		}
		if (context?.gitRoot) {
			return `gitRoot:${context.gitRoot}`;
		}
		if (context?.repository) {
			return `repository:${context.repository}`;
		}
		return undefined;
	}

	override dispose(): void {
		for (const ac of this._activeClients.values()) {
			ac.dispose();
		}
		this._activeClients.clear();
		this.shutdown().catch(err => {
			this._logService.warn('[Copilot] Shutdown failed during dispose', err);
		}).finally(() => super.dispose());
	}
}

interface IResolvedCustomization {
	readonly customization: PluginCustomization;
	readonly pluginDir?: URI;
	readonly plugin?: IParsedPlugin;
	/**
	 * The original client-published input. Retained so a later
	 * {@link SessionPluginController.retryFailedClientSyncIfNeeded} can
	 * re-issue the sync without needing the caller to re-supply it (in
	 * particular, the opaque `nonce` is preserved).
	 */
	readonly input?: ClientPluginCustomization;
}

const REFRESH_DEBOUNCE_MS = 100;

/**
 * A per-working-directory bundle of customizations the agent host
 * discovered itself from disk (workspace + user-home conventions).
 *
 * Owns a {@link SessionCustomizationDiscovery} (filesystem scan +
 * watchers) and maps discovered files into an in-memory
 * {@link IParsedPlugin} while preserving original file URIs.
 *
 * Refreshes itself when the discovery fires `onDidChange`. The owning
 * {@link PluginController} is notified via the supplied `onDidRefresh`
 * callback so it can re-fire its own change event and (indirectly) cause
 * sessions to pick up the new bundle through the existing
 * `isOutdated` snapshot path.
 */
class SessionDiscoveredEntry extends Disposable {


	private readonly _discovery: SessionCustomizationDiscovery;
	private readonly _refreshDelayer = this._register(new Delayer<void>(REFRESH_DEBOUNCE_MS));
	private _refreshPromise: CancelablePromise<void> | null = null;
	private _pendingRefreshNotify = false;

	private _customizations: readonly DirectoryCustomization[] = [];
	private _directories: readonly IDiscoveredDirectory[] | undefined;
	private _settled: Promise<void>;
	private readonly _fileService: IFileService;

	constructor(
		workingDirectory: URI,
		userHome: URI,
		private readonly _onDidRefresh: () => void,
		private readonly _logService: ILogService,
		instantiationService: IInstantiationService,
	) {
		super();
		this._discovery = this._register(instantiationService.createInstance(SessionCustomizationDiscovery, workingDirectory, userHome));
		this._fileService = instantiationService.invokeFunction(accessor => accessor.get(IFileService));
		this._settled = this._queueRefresh(false, 0);
		this._register(this._discovery.onDidChange(() => {
			this._settled = this._queueRefresh(true);
		}));
	}

	override dispose(): void {
		this._refreshPromise?.cancel();
		this._refreshPromise = null;
		super.dispose();
	}

	whenSettled(): Promise<void> {
		return this._settled;
	}

	currentCustomizations(): readonly DirectoryCustomization[] {
		return this._customizations;
	}

	private _queueRefresh(notify: boolean, delay = REFRESH_DEBOUNCE_MS): Promise<void> {
		this._refreshPromise?.cancel();
		this._refreshPromise = null;
		this._pendingRefreshNotify = this._pendingRefreshNotify || notify;

		return this._refreshDelayer.trigger(() => {
			const shouldNotify = this._pendingRefreshNotify;
			this._pendingRefreshNotify = false;
			const refreshPromise = this._refreshPromise = createCancelablePromise(async token => {
				const didRefresh = await this._refresh(token);
				if (didRefresh && shouldNotify) {
					this._onDidRefresh();
				}
			});

			return refreshPromise.then(() => {
				if (this._refreshPromise === refreshPromise) {
					this._refreshPromise = null;
				}
			}, err => {
				if (this._refreshPromise === refreshPromise) {
					this._refreshPromise = null;
				}
				if (err instanceof CancellationError) {
					return;
				}
				throw err;
			});
		}, delay);
	}

	private async _refresh(token: CancellationToken): Promise<boolean> {
		try {
			const directories = await this._discovery.scan(token);
			if (token.isCancellationRequested) {
				return false;
			}

			if (this._directories && areDiscoveredDirectoriesEqual(this._directories, directories)) {
				return false;
			}

			const customizations = await toDiscoveredDirectoryCustomizations(directories, this._fileService);
			if (token.isCancellationRequested) {
				return false;
			}

			// Don't update `_customizations` / `_directories` when cancelled.
			// Otherwise a cancelled refresh could temporarily clear them and cause callers to see empty customizations.
			this._customizations = customizations;
			this._directories = directories;
			return true;
		} catch (err) {
			// Don't update `_customizations` / `_directories` when cancelled.
			// Otherwise a cancelled refresh could temporarily clear them and cause callers to see empty customizations.
			if (token.isCancellationRequested) {
				return false;
			}
			this._logService.warn(`[Copilot:SessionDiscoveredEntry] Discovery/bundle failed: ${err instanceof Error ? err.message : String(err)}`);
			const hadState = this._customizations.length > 0 || this._directories !== undefined;
			this._customizations = [];
			this._directories = undefined;
			return hadState;
		}
	}
}

export function toDiscoveredDirectoryCustomizations(directories: readonly IDiscoveredDirectory[], fileService: IFileService): Promise<DirectoryCustomization[]> {
	return Promise.all(directories.map(async directory => {
		const protocolUri = directory.uri.toString();
		return {
			type: CustomizationType.Directory,
			id: customizationId(protocolUri),
			uri: protocolUri,
			name: directory.name,
			enabled: true,
			contents: toDirectoryContentsType(directory.type),
			writable: directory.writable, // whether the new customization can be created in this directory
			load: { kind: CustomizationLoadStatus.Loaded },
			children: await Promise.all(directory.files.map(file => toDiscoveredChildCustomization(file.uri, directory.type, fileService))),
		};
	}));
}

function toDirectoryContentsType(type: DiscoveredType): ChildCustomizationType {
	switch (type) {
		case DiscoveredType.Agent:
			return CustomizationType.Agent;
		case DiscoveredType.Skill:
			return CustomizationType.Skill;
		case DiscoveredType.Instruction:
		case DiscoveredType.AgentInstruction:
			return CustomizationType.Rule;
		case DiscoveredType.Hook:
			return CustomizationType.Hook;
	}
}

async function toDiscoveredChildCustomization(file: URI, type: DiscoveredType, fileService: IFileService): Promise<ChildCustomization> {
	const uri = file.toString();
	const id = customizationId(uri);
	if (type === DiscoveredType.Agent) {
		const agentInfo = await parseAgentFile(file, fileService);
		const agentCustomization: AgentCustomization = {
			type: CustomizationType.Agent,
			id,
			uri,
			name: agentInfo.name,
			description: agentInfo.description,
		} satisfies AgentCustomization;
		if (agentInfo.userInvocable !== undefined) {
			agentCustomization._meta = { userInvocable: agentInfo.userInvocable };
		}
		return agentCustomization;
	}
	if (type === DiscoveredType.Skill) {
		const skillInfo = await parseSkillFile(file, fileService);
		const skillCustomization: SkillCustomization = {
			type: CustomizationType.Skill,
			id,
			uri,
			name: skillInfo.name,
			description: skillInfo.description,
		};
		return skillCustomization;
	}
	if (type === DiscoveredType.Instruction) {
		const ruleInfo = await parseRuleFile(file, fileService);
		const ruleCustomization: RuleCustomization = {
			type: CustomizationType.Rule,
			id,
			uri,
			name: ruleInfo.name,
			description: ruleInfo.description,
			globs: ruleInfo.globs,
			alwaysApply: ruleInfo.alwaysApply,
		};
		return ruleCustomization;
	}
	if (type === DiscoveredType.Hook) {
		const hookCustomization: HookCustomization = {
			type: CustomizationType.Hook,
			id,
			uri,
			name: resourceBasename(file),
		};
		return hookCustomization;
	}
	// agent instruction
	return {
		type: CustomizationType.Rule,
		alwaysApply: true,
		id,
		uri,
		name: resourceBasename(file),
	};
}


/**
 * Projects already-parsed discovered customizations into an in-memory
 * {@link IParsedPlugin} while preserving original source URIs.
 */
export function mapToParsedPlugin(customizations: readonly DirectoryCustomization[]): IParsedPlugin | undefined {
	if (customizations.length === 0) {
		return undefined;
	}

	const agents: IParsedAgent[] = [];
	const skills: IParsedSkill[] = [];
	const instructions: IParsedRule[] = [];

	for (const directory of customizations) {
		for (const child of directory.children ?? []) {
			if (child.type === CustomizationType.Agent) {
				agents.push({
					uri: URI.parse(child.uri),
					name: child.name,
					description: child.description,
					customization: child,
				});
				continue;
			}

			if (child.type === CustomizationType.Skill) {
				skills.push({
					uri: URI.parse(child.uri),
					name: child.name,
					description: child.description,
					customization: child,
				});
				continue;
			}

			if (child.type === CustomizationType.Rule) {
				if (child.alwaysApply && child.name.match(/\.md$/i)) {
					continue; // agent instruction
				}
				instructions.push({
					uri: URI.parse(child.uri),
					name: child.name,
					description: child.description,
					customization: child,
				});
			}
		}
	}

	if (agents.length === 0 && skills.length === 0 && instructions.length === 0) {
		return undefined;
	}

	return {
		hooks: [],
		mcpServers: [],
		skills: skills,
		agents: agents,
		instructions: instructions,
	};
}

/**
 * Process-wide plugin state shared across all sessions.
 *
 * Owns:
 *  - host-configured customizations (read from root config, watched, parsed)
 *  - the {@link IAgentPluginManager} that materializes plugin source URIs
 *    into a nonce-deduped on-disk cache (one shared directory for all
 *    sessions and clients)
 *  - parsing + resolution helpers used by both host- and client-side
 *    customizations
 *
 * Per-session state (client-published customizations, on-disk
 * customization discovery for the session's working directory,
 * enablement overrides) lives on {@link SessionPluginController},
 * one per {@link CopilotAgentSession}. Each session controller holds
 * a reference back to this shared controller for the resolve/sync
 * helpers it needs.
 */
class PluginController extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires when host customizations change. Session controllers forward this. */
	readonly onDidChange = this._onDidChange.event;

	private _hostCustomizations: readonly IResolvedCustomization[] = [];
	private _hostSync: Promise<readonly IResolvedCustomization[]> = Promise.resolve([]);
	private _hostRevision = 0;
	private _lastAppliedRefs: readonly Customization[] = [];

	constructor(
		@IAgentPluginManager public readonly pluginManager: IAgentPluginManager,
		@ILogService public readonly logService: ILogService,
		@IFileService public readonly fileService: IFileService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IInstantiationService public readonly instantiationService: IInstantiationService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
	) {
		super();

		// Seed from current root config and subscribe to future changes.
		this._applyHostCustomizations();
		this._register(this._configurationService.onDidRootConfigChange(() => {
			this._applyHostCustomizations();
		}));
	}

	public getConfiguredHostCustomizations(): readonly Customization[] {
		return this._hostCustomizations.map(item => item.customization);
	}

	/**
	 * Snapshot the resolved host customizations (loading or loaded). Used by
	 * {@link SessionPluginController} to compose its per-session view.
	 */
	public hostCustomizations(): readonly IResolvedCustomization[] {
		return this._hostCustomizations;
	}

	/** In-flight host sync; awaited by `getCustomizationsSettled` consumers. */
	public hostSync(): Promise<readonly IResolvedCustomization[]> {
		return this._hostSync;
	}

	public getUserHome(): URI {
		return this._environmentService.userHome;
	}

	/**
	 * Construct a per-session controller bound to the given customization
	 * directory. The returned controller is a {@link Disposable} owned by
	 * the caller; disposing it releases the session's disk-discovery
	 * watchers and detaches from this controller's change event.
	 */
	public createSessionController(directory: URI | undefined): SessionPluginController {
		return new SessionPluginController(this, directory);
	}

	/**
	 * Reads the current host customizations from the root config and
	 * resolves them. Skips the update when the configured refs have not
	 * changed since the last application.
	 */
	private _applyHostCustomizations(): void {
		const entries = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.Customizations) ?? [];
		const customizations = entries.map(toContainerCustomization);
		if (equals(customizations, this._lastAppliedRefs)) {
			return;
		}
		this._lastAppliedRefs = customizations;

		const revision = ++this._hostRevision;
		this._hostCustomizations = customizations.map(customization => ({
			customization: {
				...customization,
				load: { kind: CustomizationLoadStatus.Loading },
			},
		}));
		this._onDidChange.fire();
		this._hostSync = Promise.all(customizations.map(customization => this.resolveConfiguredCustomization(customization))).then(resolved => {
			if (revision === this._hostRevision) {
				this._hostCustomizations = resolved;
			}
			return resolved;
		}).finally(() => {
			if (revision === this._hostRevision) {
				this._onDidChange.fire();
			}
		});
	}

	public async resolveConfiguredCustomization(customization: PluginCustomization): Promise<IResolvedCustomization> {
		const pluginDir = URI.parse(customization.uri);
		const parsed = await this.tryParsePlugin(pluginDir);
		if (!parsed) {
			return {
				customization: {
					...customization,
					load: { kind: CustomizationLoadStatus.Error, message: localize('copilotAgent.pluginParseError', "Error parsing plugin.") },
				},
			};
		}

		return {
			customization: {
				...customization,
				load: { kind: CustomizationLoadStatus.Loaded },
				children: toChildCustomizations([parsed]),
			},
			pluginDir,
			plugin: parsed,
		};
	}

	public async resolveSyncedCustomization(item: ISyncedCustomization, clientId: string, input: ClientPluginCustomization | undefined): Promise<IResolvedCustomization> {
		const baseCustomization: PluginCustomization = { ...item.customization, clientId };
		if (!item.pluginDir) {
			return { customization: baseCustomization, input };
		}

		const parsed = await this.tryParsePlugin(item.pluginDir);
		if (!parsed) {
			return {
				customization: {
					...baseCustomization,
					load: { kind: CustomizationLoadStatus.Error, message: localize('copilotAgent.pluginParseError', "Error parsing plugin.") },
				},
				input,
			};
		}

		return {
			customization: {
				...baseCustomization,
				children: toChildCustomizations([parsed]),
			},
			pluginDir: item.pluginDir,
			plugin: parsed,
			input,
		};
	}

	public async tryParsePlugin(pluginDir: URI): Promise<IParsedPlugin | undefined> {
		try {
			return await parsePlugin(pluginDir, this.fileService, undefined, this.getUserHome());
		} catch (error) {
			this.logService.warn(`[Copilot:PluginController] Error parsing plugin '${pluginDir.toString()}': ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}
}

/**
 * Per-client slice of {@link SessionPluginController} customization state.
 * One entry exists per active client that has contributed customizations to
 * the session.
 */
interface IClientCustomizationState {
	/** Monotonic revision used to detect and ignore stale in-flight syncs for this client. */
	revision: number;
	/** This client's resolved customizations (Loading/Loaded/Error per item). */
	customizations: readonly IResolvedCustomization[];
	/** This client's in-flight (or settled) sync promise. */
	sync: Promise<readonly IResolvedCustomization[]>;
	/** The raw inputs last passed to {@link SessionPluginController.sync} for this client. */
	inputs: readonly ClientPluginCustomization[];
}

/**
 * Per-session view over {@link PluginController}.
 *
 * Owns the session-scoped slice of plugin state — published client
 * customizations, on-disk-discovered customizations under the session's
 * customization directory, and the user's per-session enablement
 * overrides — and exposes a {@link onDidPublish} stream of
 * {@link SessionAction}s targeted at *this* session (no cross-session
 * routing).
 *
 * Created via {@link PluginController.createSessionController}. The
 * caller owns the returned disposable and disposes it when the session
 * (provisional or materialized) is torn down.
 */
class SessionPluginController extends Disposable {
	private readonly _onDidPublish = this._register(new Emitter<SessionAction>());
	/** Per-session action stream (reset + per-item updates). */
	readonly onDidPublish = this._onDidPublish.event;

	private readonly _enablement = new Map<string, boolean>();
	/**
	 * Live runtime state (`state`/`channel`) per MCP server customization id,
	 * kept up to date by the owning session from its MCP controller. Overlaid
	 * onto published customizations by {@link _overlayMcpState} so a re-sync
	 * preserves the live state of otherwise-unchanged MCP servers instead of
	 * resetting them to the `Starting` default baked into
	 * `makeMcpServerCustomization`. Exposed (not injected) so the session can
	 * write to it once it holds this controller.
	 */
	public readonly mcpServerStates: ISettableObservable<ReadonlyMap<string, IMcpServerRuntimeState>> = observableValue(this, new Map());
	/**
	 * Per-client customization state, keyed by `clientId`. Each active client
	 * contributing customizations to this session has one entry; the published
	 * customization list is the union across all entries (deduplicated by URI,
	 * first-inserted client wins). Insertion order is preserved so the merged
	 * order stays stable across updates.
	 */
	private readonly _clients = new Map<string, IClientCustomizationState>();

	private readonly _sessionDiscovered: MutableDisposable<SessionDiscoveredEntry> = this._register(new MutableDisposable());

	constructor(
		private readonly _parent: PluginController,
		private _directory: URI | undefined,
	) {
		super();
	}

	public get directory(): URI | undefined {
		return this._directory;
	}

	/**
	 * Anchor (or re-anchor) the session's customization directory.
	 * Only ever transitions from `undefined` → set; once a directory has
	 * been bound the discovered entry is pinned to it for the remainder
	 * of the session.
	 */
	public setDirectory(directory: URI | undefined): void {
		if (this._directory || !directory) {
			return;
		}
		this._directory = directory;
	}

	/**
	 * Move the session's customization anchor to a new directory (e.g. from the
	 * user-picked folder to the worktree at materialization). Recreates the
	 * discovered entry so discovery/watchers re-scan the new directory, and
	 * rebases per-session enablement overrides whose URI lived under the old
	 * directory so the user's toggles survive the move.
	 */
	public reanchor(directory: URI): void {
		if (this._directory && isEqual(this._directory, directory)) {
			return;
		}
		const previous = this._directory;
		this._directory = directory;
		this._sessionDiscovered.clear();
		if (previous) {
			this._migrateEnablement(previous, directory);
		}
	}

	private _migrateEnablement(fromDir: URI, toDir: URI): void {
		const migrated = migrateEnablementKeys(this._enablement, fromDir, toDir);
		this._enablement.clear();
		for (const [uri, enabled] of migrated) {
			this._enablement.set(uri, enabled);
		}
	}

	public getCustomizations(): readonly Customization[] {
		const result: Customization[] = [
			...this._parent.hostCustomizations().map(item => this._projectForPublish(item.customization)),
			...this._flattenClientCustomizations().map(item => this._projectForPublish(item.customization)),
		];
		const entry = this._discoveredEntry();
		const discovered = entry?.currentCustomizations() ?? [];
		for (const customization of discovered) {
			result.push(this._projectForPublish(customization));
		}
		return result;
	}

	/**
	 * The union of every active client's resolved customizations,
	 * deduplicated by URI with the first-inserted client winning. Order
	 * follows client insertion order, then per-client order.
	 */
	private _flattenClientCustomizations(): readonly IResolvedCustomization[] {
		const seen = new Set<string>();
		const result: IResolvedCustomization[] = [];
		for (const client of this._clients.values()) {
			for (const item of client.customizations) {
				if (seen.has(item.customization.uri)) {
					continue;
				}
				seen.add(item.customization.uri);
				result.push(item);
			}
		}
		return result;
	}

	/**
	 * Settled variant of {@link getCustomizations}: awaits the in-flight
	 * host sync, every in-flight client sync, and the discovered entry's
	 * initial scan + parse before snapshotting the list. Callers that
	 * publish customizations into session state at session creation time
	 * MUST use this — the synchronous variant can return an empty list
	 * for a brand-new working directory because {@link SessionDiscoveredEntry}
	 * kicks off its `_refresh()` without anyone awaiting it.
	 */
	public async getCustomizationsSettled(): Promise<readonly Customization[]> {
		const entry = this._discoveredEntry();
		await Promise.all([
			this._parent.hostSync().catch(err => this._parent.logService.warn('[Copilot:SessionPluginController] Host customization update failed', err)),
			...[...this._clients.values()].map(client => client.sync.catch(err => this._parent.logService.warn('[Copilot:SessionPluginController] Client customization sync failed', err))),
			entry?.whenSettled(),
		]);
		return this.getCustomizations();
	}

	/** Returns the parsed plugins currently enabled for this session, awaiting any pending sync. */
	public async getAppliedPlugins(): Promise<readonly ICopilotPluginInfo[]> {
		const entry = this._discoveredEntry();
		const [host] = await Promise.all([
			this._parent.hostSync().catch(err => {
				this._parent.logService.warn('[Copilot:SessionPluginController] Host customization update failed', err);
				return this._parent.hostCustomizations();
			}),
			...[...this._clients.values()].map(client => client.sync.catch(err => {
				this._parent.logService.warn('[Copilot:SessionPluginController] Client customization sync failed', err);
				return client.customizations;
			})),
			entry?.whenSettled(),
		]);

		const discovered = entry?.currentCustomizations() ?? [];
		const sessionPlugin = discovered.some(customization => this._isEnabled(customization)) ? mapToParsedPlugin(discovered) : undefined;
		const sessionPlugins: IParsedPlugin[] = sessionPlugin ? [sessionPlugin] : [];

		return [
			...host.filter(item => !!item.plugin && this._isEnabled(item.customization))
				.map(item => ({ ...item.plugin!, pluginDir: item.pluginDir })),
			...this._flattenClientCustomizations().filter(item => !!item.plugin && this._isEnabled(item.customization))
				.map(item => ({ ...item.plugin!, pluginDir: item.pluginDir })),
			...sessionPlugins,
		];
	}

	/**
	 * Set per-session enablement for a customization (by protocol URI).
	 */
	public setEnabled(pluginProtocolUri: string, enabled: boolean): void {
		const prev = this._enablement.get(pluginProtocolUri);
		if (prev === enabled) {
			return;
		}
		this._enablement.set(pluginProtocolUri, enabled);
	}

	/**
	 * Sync the published customizations for a single client of this session,
	 * keyed by `clientId`. Replaces only that client's slice; other clients'
	 * customizations are untouched. The published session-state list is the
	 * union across all clients.
	 *
	 * @param quiet when `true`, suppress {@link onDidPublish} events for
	 *   this sync. Used during eager-create paths where there is no
	 *   session listener yet; the session-state snapshot picks up the
	 *   final view directly when the session materializes.
	 */
	public sync(clientId: string, customizations: ClientPluginCustomization[], options?: { quiet?: boolean }) {
		const quiet = options?.quiet === true;
		let client = this._clients.get(clientId);
		if (!client) {
			client = { revision: 0, customizations: [], sync: Promise.resolve([]), inputs: [] };
			this._clients.set(clientId, client);
		} else if (equals(client.inputs, customizations)) {
			// No-op re-sync: a window re-subscribing (e.g. navigating away from
			// and back to a session) re-publishes the same customizations. Skip
			// the revision bump, the `SessionCustomizationsChanged` emit, and the
			// redundant plugin-manager re-sync (which otherwise re-parses plugins
			// from disk on every navigation). Genuine changes still publish, and
			// `_projectForPublish` keeps live MCP state intact across those.
			return client.sync.then(results => results.map(item => ({
				customization: this._projectForPublish(item.customization),
				...(item.pluginDir ? { pluginDir: item.pluginDir } : {}),
			})));
		}
		const revision = ++client.revision;
		client.inputs = customizations;
		client.customizations = customizations.map(customization => ({
			customization: {
				...customization,
				clientId,
				load: { kind: CustomizationLoadStatus.Loading },
			},
			input: customization,
		}));
		if (!quiet) {
			this._onDidPublish.fire({
				type: ActionType.SessionCustomizationsChanged,
				customizations: [...this.getCustomizations()],
			});
		}
		const published = new Map<string, Customization>();
		for (const customization of client.customizations) {
			const enabled = this._projectForPublish(customization.customization);
			published.set(enabled.uri, enabled);
		}
		const publishUpdate = (item: IResolvedCustomization) => {
			const customization = this._projectForPublish(item.customization);
			if (equals(published.get(customization.uri), customization)) {
				return;
			}
			published.set(customization.uri, customization);
			if (!quiet) {
				this._onDidPublish.fire({
					type: ActionType.SessionCustomizationUpdated,
					customization,
				});
			}
		};

		const prev = client.sync;
		const promise = client.sync = prev.catch(err => {
			this._parent.logService.warn('[Copilot:SessionPluginController] Previous customization sync failed', err);
		}).then(async () => {
			const inputByUri = new Map(customizations.map(c => [c.uri, c]));
			const result = await this._parent.pluginManager.syncCustomizations(clientId, customizations, status => {
				if (revision !== client.revision) {
					return;
				}
				publishUpdate({
					customization: { ...status, clientId },
					input: inputByUri.get(status.uri),
				});
			});

			const resolved = await Promise.all(result.map(item => this._parent.resolveSyncedCustomization(item, clientId, inputByUri.get(item.customization.uri))));
			if (revision === client.revision) {
				client.customizations = resolved;
				for (const item of resolved) {
					publishUpdate(item);
				}
			}
			return resolved;
		});

		return promise.then(results => results.map(item => ({
			customization: this._overlayMcpState(this._applyEnablement(item.customization)),
			...(item.pluginDir ? { pluginDir: item.pluginDir } : {}),
		})));
	}

	/**
	 * Remove a client's customization contribution from this session,
	 * publishing the updated (union) customization list so the removed
	 * client's plugins disappear from session state.
	 */
	public removeClient(clientId: string): void {
		const client = this._clients.get(clientId);
		if (!client) {
			return;
		}
		// Invalidate any in-flight sync for this client by bumping its
		// revision so the late continuation's `revision === client.revision`
		// guards fail and it does not re-publish the removed client's
		// customizations.
		client.revision++;
		this._clients.delete(clientId);
		this._onDidPublish.fire({
			type: ActionType.SessionCustomizationsChanged,
			customizations: [...this.getCustomizations()],
		});
	}

	/** The raw input customizations last synced for `clientId` (empty when absent). */
	public clientInputs(clientId: string): readonly ClientPluginCustomization[] {
		return this._clients.get(clientId)?.inputs ?? [];
	}

	/**
	 * Re-issue each client's last sync if any of its previously-synced
	 * customizations is currently in an error state. Used to recover from
	 * transient sync failures (e.g. a `vscode-agent-host://` connection drop
	 * during reconnection) at message boundaries. Re-syncs **only** the
	 * errored items and always non-quiet so listeners observe recovery.
	 */
	public async retryFailedClientSyncIfNeeded(): Promise<void> {
		await Promise.all([...this._clients.values()].map(client => client.sync.catch(() => { })));
		for (const [clientId, client] of [...this._clients]) {
			const errored = client.customizations.filter(item =>
				item.customization.load?.kind === CustomizationLoadStatus.Error
				&& item.input !== undefined
			);
			if (errored.length === 0) {
				continue;
			}
			const inputs = errored.map(item => item.input!);
			this._parent.logService.info(`[Copilot:SessionPluginController] Retrying ${inputs.length} previously-failed client customization(s) for ${clientId}`);
			await this.sync(clientId, inputs).catch(err => {
				this._parent.logService.warn('[Copilot:SessionPluginController] Retried client customization sync failed', err);
			});
		}
	}

	private _discoveredEntry(): SessionDiscoveredEntry | undefined {
		if (!this._directory) {
			return undefined;
		}
		if (!this._sessionDiscovered.value) {
			this._sessionDiscovered.value = new SessionDiscoveredEntry(
				this._directory,
				this._parent.getUserHome(),
				() => this._onDidPublish.fire({
					type: ActionType.SessionCustomizationsChanged,
					customizations: [...this.getCustomizations()],
				}),
				this._parent.logService,
				this._parent.instantiationService,
			);
		}
		return this._sessionDiscovered.value;
	}

	private _isEnabled(customization: Customization): boolean {
		return this._enablement.get(customization.uri) ?? customization.enabled !== false;
	}

	private _applyEnablement<T extends Customization>(customization: T): T {
		const enabled = this._isEnabled(customization);
		return customization.enabled === enabled ? customization : { ...customization, enabled };
	}

	/**
	 * Projects a raw customization into its published form: applies the
	 * user's per-session enablement override, then overlays the latest
	 * known MCP runtime `state`/`channel` (see {@link mcpServerStates}).
	 * Every publish path runs customizations through this so enablement and
	 * live MCP state stay consistent. Object identity is preserved when
	 * neither step changes anything, keeping downstream equality checks
	 * stable.
	 */
	private _projectForPublish<T extends Customization>(customization: T): T {
		return this._overlayMcpState(this._applyEnablement(customization));
	}

	/**
	 * Overlays the latest known MCP runtime `state`/`channel` (see
	 * {@link mcpServerStates}) onto a customization and its children,
	 * preserving object identity when nothing is overlaid so downstream
	 * equality checks stay stable.
	 */
	private _overlayMcpState<T extends Customization>(customization: T): T {
		const overlays = this.mcpServerStates.get();
		if (overlays.size === 0) {
			return customization;
		}
		if (customization.type === CustomizationType.McpServer) {
			const overlay = overlays.get(customization.id);
			return overlay ? { ...customization, state: overlay.state, channel: overlay.channel } : customization;
		}
		const children = customization.children;
		if (!children || children.length === 0) {
			return customization;
		}
		let changed = false;
		const overlaidChildren = children.map(child => {
			if (child.type !== CustomizationType.McpServer) {
				return child;
			}
			const overlay = overlays.get(child.id);
			if (!overlay) {
				return child;
			}
			changed = true;
			return { ...child, state: overlay.state, channel: overlay.channel };
		});
		return changed ? { ...customization, children: overlaidChildren } : customization;
	}
}

/**
 * A per-(session, clientId) handle returned by
 * {@link CopilotAgent.getOrCreateActiveClient}. Reads/writes flow straight
 * through to the owning session's {@link ActiveClient} (the multi-client
 * container), so assigning `tools` / `customizations` updates only this
 * client's slice.
 */
class CopilotActiveClientHandle implements IActiveClient {
	constructor(
		private readonly _owner: ActiveClient,
		readonly clientId: string,
		readonly displayName: string | undefined,
	) { }

	get tools(): readonly ToolDefinition[] {
		return this._owner.toolSet.get(this.clientId);
	}
	set tools(tools: readonly ToolDefinition[]) {
		this._owner.toolSet.set(this.clientId, tools);
	}

	get customizations(): readonly ClientPluginCustomization[] {
		return this._owner.pluginController.clientInputs(this.clientId);
	}
	set customizations(customizations: readonly ClientPluginCustomization[]) {
		// Fire-and-forget: progress and the settled result flow out via the
		// controller's `onDidPublish` session actions, not the setter.
		this._owner.pluginController.sync(this.clientId, [...customizations]).catch(() => { /* logged inside sync */ });
	}
}

/**
 * Tracks per-session active client contributions (tools and plugins) across
 * potentially several active clients. Owns the session's
 * {@link SessionPluginController}, which is the authoritative source for both
 * the plugin snapshot (host + all clients + session-discovered) and
 * per-session action events, and the {@link ActiveClientToolSet} that merges
 * every client's tools. Disposing this tears down the controller and any disk
 * watchers it created.
 */
class ActiveClient extends Disposable {
	/**
	 * Live, multi-client registry of contributed tools. Shared by reference
	 * with the session's {@link CopilotAgentSession} so a window reload (new
	 * `clientId`, identical tools) is reflected at tool-call stamp time without
	 * restarting the SDK session, and so tool calls are attributed to the
	 * contributing client.
	 */
	readonly toolSet = new ActiveClientToolSet();

	public readonly pluginController: SessionPluginController;

	private readonly _handles = new Map<string, CopilotActiveClientHandle>();

	constructor(
		private readonly _sessionUri: URI,
		pluginController: SessionPluginController,
		onDidSessionProgress: Emitter<AgentSignal>,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
	) {
		super();
		this.pluginController = this._register(pluginController);
		// Forward per-session publish events into the agent's progress
		// stream. This replaces the previous clientId-based routing.
		this._register(this.pluginController.onDidPublish(action => {
			onDidSessionProgress.fire({ kind: 'action', resource: this._sessionUri, action });
		}));
	}

	/** Get (or lazily create) the stable handle for `clientId`. */
	getOrCreateHandle(clientId: string, displayName: string | undefined): CopilotActiveClientHandle {
		let handle = this._handles.get(clientId);
		if (!handle) {
			handle = new CopilotActiveClientHandle(this, clientId, displayName);
			this._handles.set(clientId, handle);
		}
		return handle;
	}

	/** Drop a client's tool and customization contributions from this session. */
	removeClient(clientId: string): void {
		this._handles.delete(clientId);
		this.toolSet.delete(clientId);
		this.pluginController.removeClient(clientId);
	}

	async snapshot(): Promise<IActiveClientSnapshot> {
		return {
			tools: this.toolSet.merged(),
			plugins: await this.pluginController.getAppliedPlugins(),
			mcpServers: this._getMcpServers(),
		};
	}

	private _getMcpServers(): AgentHostMcpServers {
		const servers = this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey) ?? {};

		return structuredClone(servers);
	}

	/**
	 * Returns `true` when the SDK session must be disposed and resumed to
	 * pick up a changed config. Compares ONLY plugins and the structural
	 * (merged) tool set (name + description + inputSchema). The owning
	 * `clientId`s are deliberately excluded — a clientId-only change is
	 * reflected live via {@link toolSet} and never requires a restart.
	 */
	async requiresRestart(snap: IActiveClientSnapshot): Promise<boolean> {
		const plugins = await this.pluginController.getAppliedPlugins();
		if (!parsedPluginsEqual(snap.plugins, plugins)) {
			return true;
		}
		if (!equals(snap.mcpServers, this._getMcpServers())) {
			return true;
		}
		return !this.toolSet.structuralEquals(snap.tools);
	}
}
