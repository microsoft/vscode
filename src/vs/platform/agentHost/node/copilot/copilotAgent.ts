/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient, RuntimeConnection, type CopilotClientOptions, type GitHubTelemetryNotification, type ManagedSettingsResolvedData, type SessionMode as CopilotSdkMode } from '@github/copilot-sdk';
import * as fs from 'fs/promises';
import * as os from 'os';
import { pathToFileURL } from 'url';
import { CancelablePromise, createCancelablePromise, DeferredPromise, Delayer, disposableTimeout, Limiter, raceTimeout, Sequencer, SequencerByKey } from '../../../../base/common/async.js';
import { type CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, type IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { FileAccess } from '../../../../base/common/network.js';
import { formatTokenCount } from '../../../../base/common/numbers.js';
import { equals } from '../../../../base/common/objects.js';
import { autorun, observableValue, type ISettableObservable } from '../../../../base/common/observable.js';
import { delimiter, dirname, join } from '../../../../base/common/path.js';
import { basename as resourceBasename, isEqual, isEqualOrParent, joinPath as resourceJoinPath, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { rgDiskPath } from '../../../../base/node/ripgrep.js';
import { localize } from '../../../../nls.js';
import { IParsedAgent, IParsedPlugin, IParsedRule, IParsedSkill, parseAgentFile, parsePlugin, parseRuleFile, parseSkillFile, PluginFormat } from '../../../agentPlugins/common/pluginParsers.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService, LogLevel } from '../../../log/common/log.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { workspacelessScratchDir } from '../workspacelessScratchDir.js';
import { IAgentHostCheckpointService } from '../../common/agentHostCheckpointService.js';
import { IAgentHostReviewService } from '../../common/agentHostReviewService.js';
import { createPricingMetaFromBilling, hasLongContextSurcharge, normalizeCAPIBilling, type ICAPIModelBilling } from '../../common/agentModelPricing.js';
import { createAgentModelByokMeta } from '../../common/agentModelByokMeta.js';
import { getByokLmSelectionModelId } from '../../common/agentHostByokLm.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema, DEFAULT_SESSION_CUSTOMIZATION_DISCOVERY_MODE, toContainerCustomization } from '../../common/agentHostCustomizationConfig.js';
import { CopilotCliConfigKey, copilotCliConfigSchema, type CopilotSdkLogLevelSetting } from '../../common/copilotCliConfig.js';
import { AgentHostMcpServersConfigKey, AgentHostCopilotMultiRootEnabledConfigKey, AgentHostPreferLongContextEnabledConfigKey, AgentHostSessionSyncEnabledConfigKey, AgentHostSystemProxyEnabledConfigKey, AgentHostMigrateLegacyCopilotCliEnabledConfigKey, AutoApproveLevel, SessionMode, migrateLegacyAutopilotConfig, platformRootSchema, platformSessionSchema, type AgentHostMcpServers } from '../../common/agentHostSchema.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { decodeProviderData, encodeProviderData, type IPersistedChat } from '../agentChatBackings.js';
import { prepareSideChatPrompt, stripSideChatContext } from '../agentPeerChats.js';
import { AgentSession, AgentSignal, AuthenticateParams, IActiveClient, IAgent, IAgentChatContext, IAgentChatDataChange, IAgentChats, IAgentLegacyChat, IAgentCreateChatOptions, IAgentCreateChatResult, IAgentDescriptor, IAgentHostManagedSettingsSnapshot, IAgentHostNetworkEndpoint, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionAdoptionResult, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSessionProjectInfo, IAgentSpawnChatEvent, IMcpNotification, SubagentChatSignal, resolveAgentChatContext, resolveAgentHostCustomizations, resolveSubagentChatParent } from '../../common/agentService.js';
import { getReasoningEffortDescription, getReasoningEffortLabel, resolveDefaultReasoningEffort } from '../../common/reasoningEffort.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ICopilotConfigSlashCommandState } from '../../common/copilotConfigSlashCommands.js';
import { getCopilotHomePath } from '../../common/copilotHome.js';
import { ISessionDataService, SESSION_DB_FILENAME } from '../../common/sessionDataService.js';
import { IAgentHostProxyResolver } from '../agentHostProxyResolver.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import type { ErrorInfo } from '../../common/state/protocol/common/state.js';
import { ProtectedResourceMetadata, type AgentSelection, type ChildCustomizationType, type ConfigPropertySchema, type ConfigSchema, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { ActionType, type SessionAction } from '../../common/state/sessionActions.js';
import { areAdditionalWorkingDirectoriesEqual } from '../../common/state/sessionWorkingDirectories.js';
import { AgentCustomization, CustomizationLoadStatus, CustomizationType, RuleCustomization, ChatInputResponseKind, SkillCustomization, customizationId, buildChatUri, AH_META_WORKSPACELESS_DB_KEY, withSessionEhcliAdoptable, type ChildCustomization, type ClientPluginCustomization, type Customization, type DirectoryCustomization, type HookCustomization, type MessageAttachment, type PendingMessage, type PluginCustomization, type PolicyState, type ChatInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { ActiveClientToolSet, structuralToolsEqual } from '../activeClientState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
import { IAgentHostCompletions } from '../agentHostCompletions.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { applyMcpServerEnablement, findMcpChildId, type IMcpServerRuntimeState } from '../shared/mcpCustomizationController.js';
import { IAgentHostSessionTitleSignal } from '../agentHostSessionTitleSignal.js';
import { IByokLmBridgeRegistry } from '../byokLmBridgeRegistry.js';
import { SessionWorkingDirectoryMissingError } from '../shared/worktreeIsolation.js';
import { buildSessionEventLogFromTurns } from './buildSessionEvents.js';
import { CopilotAgentSession } from './copilotAgentSession.js';
import { createCopilotCliEnvironment } from './copilotCliEnvironment.js';
import { ICopilotSessionContext, projectFromCopilotContext } from './copilotGitProject.js';
import { parsedPluginsEqual, toChildCustomizations } from './copilotPluginConverters.js';
import { CopilotGitHubTelemetryForwarder } from './copilotGitHubTelemetryForwarder.js';
import { CopilotSessionLauncher, ContextSizeConfigKey, ThinkingLevelConfigKey, getCopilotContextTier, isCopilotReasoningEffort, resolveCopilotReasoningEffort, type CopilotSessionLaunchPlan, type IActiveClientSnapshot } from './copilotSessionLauncher.js';
import { ShellManager } from './copilotShellTools.js';
import { isAgentHostTelemetryService } from '../agentHostTelemetryService.js';
import { ICopilotApiService, type IRestrictedTelemetryContext } from '../shared/copilotApiService.js';
import { AgentHostGitHubTelemetryRouter } from '../agentHostGitHubTelemetryRouter.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { CopilotSlashCommandCompletionProvider, ICopilotRuntimeSlashCommandQueryOptions } from './copilotSlashCommandCompletionProvider.js';
import { DiscoveredType, SessionCustomizationDiscovery, areDiscoveredDirectoriesEqual, type IDiscoveredDirectory } from './sessionCustomizationDiscovery.js';
import { COPILOT_INTEGRATION_ID } from '../../../endpoint/common/licenseAgreement.js';
import { getAppNodeModulesPath } from '../appNodeModules.js';
import { CopilotSlashCommandProvider } from './copilotSlashCommandProvider.js';
import { classifyCopilotClientFailure, createCopilotFailureCorrelation, reportCopilotClientFailure, reportCopilotClientRecovery, reportCopilotClientRecoveryTurn, type CopilotClientFailureKind, type CopilotClientFailureOperation, type ICopilotFailureCorrelation } from './copilotFailureTelemetry.js';

interface ICopilotRuntimeManagedSettingsInput {
	authInfo?: { type: 'token'; host: string; token: string };
	token?: string;
	signal?: AbortSignal;
}

interface ICopilotRuntimeManagedSettingsSdk {
	getManagedSettings(input?: ICopilotRuntimeManagedSettingsInput): Promise<{ account?: string; resolved: ManagedSettingsResolvedData }>;
}

const COPILOT_MANAGED_SETTINGS_QUERY_TIMEOUT_MS = 3500;
const COPILOT_MANAGED_SETTINGS_DIAGNOSTICS_TIMEOUT_MS = 4500;

function isCopilotRuntimeManagedSettingsSdk(value: unknown): value is ICopilotRuntimeManagedSettingsSdk {
	return typeof value === 'object' && value !== null && 'getManagedSettings' in value
		&& typeof (value as { getManagedSettings?: unknown }).getManagedSettings === 'function';
}

export async function getCopilotManagedSettingsDiagnostics(
	runtimeSdk: ICopilotRuntimeManagedSettingsSdk,
	token: string | undefined,
	host: string,
	signal: AbortSignal,
	timeoutMs = COPILOT_MANAGED_SETTINGS_QUERY_TIMEOUT_MS,
): Promise<{ account?: string; resolved: ManagedSettingsResolvedData }> {
	const result = await raceTimeout(runtimeSdk.getManagedSettings({
		...(token ? { authInfo: { type: 'token', host, token } as const, token } : {}),
		signal,
	}), timeoutMs);
	if (!result) {
		throw new Error(`Copilot runtime managed-settings query exceeded ${timeoutMs / 1000} seconds while waiting for native MDM or GitHub policy resolution.`);
	}
	return result;
}

const RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS = 300;
const COPILOT_CAPI_URL = 'https://api.githubcopilot.com';

interface ICopilotClosedConnectionRecoveryResult {
	readonly failedTurnIds: ReadonlySet<string>;
	readonly stopSucceeded: boolean;
}

function isCopilotConnectionClosedError(error: unknown): boolean {
	return classifyCopilotClientFailure(error) === 'connectionClosed';
}

/**
 * Proxy env vars that indicate the environment already configures a proxy.
 */
const COPILOT_PROXY_ENV_KEYS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'] as const;
/**
 * Proxy env vars we set when injecting the resolved CAPI proxy.
 */
const COPILOT_PROXY_SET_ENV_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY'] as const;

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

export type ICopilotPluginInfo = IParsedPlugin & { readonly pluginDir?: URI };

/**
 * A session that has been requested by a client but has not yet been
 * materialized into a real Copilot SDK session, worktree, or persisted
 * metadata. Created by a {@link IAgentChats.createChat} call that stands the
 * owning session up with no fork and no imported conversation, and consumed by
 * {@link CopilotAgent._materializeProvisional} on the first
 * {@link CopilotAgent.sendMessage}.
 *
 * Until materialization the session occupies only an in-memory slot and
 * an entry in the state manager. Disposing a provisional session is a
 * cheap no-op compared with tearing down a real session — there is no
 * worktree to remove and no on-disk state to delete.
 *
 * `model` absorbs {@link CopilotAgent.changeModel} updates that arrive
 * before the first message. The latest provider-owned session config is read
 * straight from the state manager via
 * {@link IAgentConfigurationService.getSessionConfigValues} at
 * materialization time, so no bespoke forwarding is required for it.
 */
interface IProvisionalSession {
	readonly sessionId: string;
	readonly sdkSessionId: string;
	readonly sessionUri: URI;
	readonly chat: URI;
	/**
	 * Folder the user picked at create time. Used as both the
	 * pre-worktree working directory and the customization directory
	 * (plugin discovery is anchored to the original folder, not to a
	 * worktree path that may not exist yet).
	 */
	readonly workingDirectory: URI;
	/**
	 * The full ordered working-directory set as sent by the client at create
	 * time (index 0 = primary === {@link workingDirectory}), for a multi-root
	 * workspace. Undefined for single-folder / legacy clients. The non-primary
	 * roots are attached to customization discovery immediately (they are stable
	 * workspace folders, unlike the worktree that resolves only at send).
	 */
	readonly workingDirectories?: readonly URI[];
	/** Most recent model selection. Updated by `changeModel` while provisional. */
	model: ModelSelection | undefined;
	/** Most recent custom agent selection. Updated by `changeAgent` while provisional. */
	agent: AgentSelection | undefined;
	/** Project info eagerly resolved at create time so the summary renders. */
	readonly project: IAgentSessionProjectInfo | undefined;
	/** Whether this session is workspace-less (surfaced in the sessions UI as a "Quick Chat"). */
	readonly workspaceless?: boolean;
}

interface IResolvedCopilotChatContext {
	readonly configurationResource: URI;
	readonly configurationId: string;
	readonly resource: URI;
	readonly chat: URI;
	readonly chatKey: string;
	readonly sdkSessionId: string | undefined;
	readonly sequencerKey: string;
	readonly target: CopilotAgentSession | undefined;
}

interface ICopilotAgentSessionIdentity {
	readonly sessionUri: URI;
	readonly chatChannelUri: URI;
	/** Host-chosen persistence/config scope (the {@link IAgentChatContext.resource}). */
	readonly resource: URI;
}

/**
 * Stand-in for "Agent Host has published no customization snapshot for this
 * session yet". A stable singleton so identity-based caches over the retained
 * snapshot stay valid across reads.
 */
const NO_HOST_CUSTOMIZATIONS: readonly Customization[] = Object.freeze([]);

/** Coordinates all per-session work, resumption, and teardown. */
class CopilotSessionLifetime {
	private _activeLeases = 0;
	private _pendingReleases = 0;
	private _drained: DeferredPromise<void> | undefined;
	private _reopened: DeferredPromise<void> | undefined;
	private _exclusiveTail: Promise<void> = Promise.resolve();
	private _disposePromise: Promise<void> | undefined;
	private _isDisposing = false;
	private _isPermanentlyClosed = false;
	private _defaultResume: Promise<CopilotAgentSession> | undefined;
	private readonly _peerResumes = new Map<string, Promise<CopilotAgentSession | undefined>>();
	private readonly _sessionSequencer = new Sequencer();
	private readonly _chatSequencer = new SequencerByKey<string>();
	private readonly _queuedWork = new Set<Promise<void>>();

	get isPermanentlyClosed(): boolean {
		return this._isPermanentlyClosed;
	}

	queueSession<T>(task: () => Promise<T>): Promise<T> {
		return this._track(this._sessionSequencer.queue(task));
	}

	queueChat<T>(chatKey: string, task: () => Promise<T>): Promise<T> {
		return this._track(this._chatSequencer.queue(chatKey, task));
	}

	resumeDefault(factory: () => Promise<CopilotAgentSession>): Promise<CopilotAgentSession> {
		const existing = this._defaultResume;
		if (existing) {
			return existing;
		}
		const resume = factory();
		this._defaultResume = resume;
		const cleanup = () => {
			if (this._defaultResume === resume) {
				this._defaultResume = undefined;
			}
		};
		resume.then(cleanup, cleanup);
		return resume;
	}

	resumePeer(chatKey: string, factory: () => Promise<CopilotAgentSession | undefined>): Promise<CopilotAgentSession | undefined> {
		const existing = this._peerResumes.get(chatKey);
		if (existing) {
			return existing;
		}
		const resume = factory();
		this._peerResumes.set(chatKey, resume);
		const cleanup = () => {
			if (this._peerResumes.get(chatKey) === resume) {
				this._peerResumes.delete(chatKey);
			}
		};
		resume.then(cleanup, cleanup);
		return resume;
	}

	async acquire(): Promise<IDisposable | undefined> {
		while (!this._isDisposing && !this._isPermanentlyClosed) {
			const reopened = this._reopened;
			if (reopened) {
				await reopened.p;
				continue;
			}

			this._activeLeases++;
			let disposed = false;
			return toDisposable(() => {
				if (disposed) {
					return;
				}
				disposed = true;
				this._activeLeases--;
				if (this._activeLeases === 0) {
					this._drained?.complete();
				}
			});
		}
		return undefined;
	}

	release(task: () => Promise<void>): Promise<void> {
		if (this._isDisposing || this._isPermanentlyClosed) {
			return Promise.resolve();
		}

		this._pendingReleases++;
		this._reopened ??= new DeferredPromise<void>();
		const previous = this._exclusiveTail;
		const release = (async () => {
			await previous;
			await this._waitForLeases();
			await task();
		})();
		const completed = release.finally(() => {
			this._pendingReleases--;
			if (this._pendingReleases === 0 && !this._isDisposing && !this._isPermanentlyClosed) {
				this._reopened?.complete();
				this._reopened = undefined;
			}
		});
		this._exclusiveTail = completed.catch(() => undefined);
		return completed;
	}

	async dispose(task: () => Promise<void>): Promise<void> {
		if (this._disposePromise) {
			return this._disposePromise;
		}
		if (this._isPermanentlyClosed) {
			return;
		}

		this._isDisposing = true;
		this._reopened?.complete();
		this._reopened = undefined;
		const previous = this._exclusiveTail;
		const dispose = (async () => {
			try {
				await previous;
				await this._waitForLeases();
				await task();
				this._isPermanentlyClosed = true;
			} catch (error) {
				if (!this._isPermanentlyClosed) {
					this._isDisposing = false;
					this._reopened?.complete();
					this._reopened = undefined;
				}
				throw error;
			}
		})();
		this._disposePromise = dispose;
		this._exclusiveTail = dispose.catch(() => undefined);
		try {
			await dispose;
		} finally {
			if (!this._isPermanentlyClosed && this._disposePromise === dispose) {
				this._disposePromise = undefined;
			}
		}
	}

	async close(): Promise<void> {
		this._isPermanentlyClosed = true;
		this._reopened?.complete();
		this._reopened = undefined;
		await this._waitForQueuedWork();
		await this._exclusiveTail;
		await this._waitForLeases();
	}

	private _track<T>(work: Promise<T>): Promise<T> {
		const completion = work.then(() => undefined, () => undefined);
		this._queuedWork.add(completion);
		completion.then(() => this._queuedWork.delete(completion));
		return work;
	}

	private async _waitForQueuedWork(): Promise<void> {
		while (this._queuedWork.size > 0) {
			await Promise.all(this._queuedWork);
		}
	}

	private async _waitForLeases(): Promise<void> {
		if (this._activeLeases === 0) {
			return;
		}
		const drained = this._drained ??= new DeferredPromise<void>();
		await drained.p;
		if (this._drained === drained) {
			this._drained = undefined;
		}
	}
}

function toRestrictedTelemetryEndpoint(endpoint: string | undefined): string | undefined {
	return endpoint ? `${endpoint.replace(/\/+$/, '')}/telemetry` : undefined;
}

export { COPILOT_AGENT_HOST_SYSTEM_MESSAGE } from './prompts/systemMessage.js';

type CopilotModelInfo = Awaited<ReturnType<CopilotClient['rpc']['models']['list']>>['models'][number];

interface ISerializedModelSelection {
	id?: unknown;
	config?: unknown;
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

class CopilotChatEntry extends Disposable {
	constructor(
		readonly chatSession: CopilotAgentSession,
		activeClient: ActiveClient,
		onMcpNotification: Emitter<IMcpNotification>,
	) {
		super();
		this._register(chatSession);
		this._register(chatSession.onMcpNotification(notification => onMcpNotification.fire(notification)));
		this._register(autorun(reader => activeClient.pluginController.mcpServerStates.set(chatSession.mcpServerStates.read(reader), undefined)));
	}
}

export function resolveCopilotOtlpMetricsEndpoint(endpoint: string, protocol: 'http/json' | 'http/protobuf' | 'grpc'): string {
	if (protocol === 'grpc') {
		return endpoint;
	}
	try {
		const url = new URL(endpoint);
		if (url.pathname === '' || url.pathname === '/') {
			url.pathname = '/v1/metrics';
		} else if (url.pathname.endsWith('/v1/traces')) {
			url.pathname = `${url.pathname.slice(0, -'/v1/traces'.length)}/v1/metrics`;
		}
		return url.toString().replace(/\/$/, '');
	} catch {
		return endpoint;
	}
}

/**
 * Agent provider backed by the Copilot SDK {@link CopilotClient}.
 */
export class CopilotAgent extends Disposable implements IAgent {
	readonly id = 'copilotcli' as const;

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
	 * Fires when the set of adoptable-legacy sessions the host should surface may
	 * have changed — today only when the renderer's migrate-legacy flag flips on
	 * (which can arrive after the first `listSessions`). The {@link AgentService}
	 * responds by re-listing and announcing any newly adoptable sessions.
	 */
	private readonly _onDidChangeSessionList = this._register(new Emitter<void>());
	readonly onDidChangeSessionList = this._onDidChangeSessionList.event;
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
	 * until the next external refresh trigger (a GitHub token change, a CLI
	 * client restart, or the host's periodic scheduler), so we retry a few
	 * times before giving up. Overridable in tests to avoid real delays.
	 */
	protected readonly _modelRefreshMaxAttempts: number = 5;
	protected readonly _modelRefreshBaseDelayMs: number = 1_000;
	protected readonly _modelRefreshMaxDelayMs: number = 30_000;
	/** Pending model-refresh retry timer; cleared on a fresh refresh, shutdown, or dispose. */
	private readonly _modelRefreshRetry = this._register(new MutableDisposable());
	/**
	 * Invalidates model requests bound to a superseded token/client/catalog
	 * source. Token identity alone is insufficient: restarting the client for
	 * a `COPILOT_GH_HOST` change keeps the same token while changing the CAPI
	 * endpoint whose catalog is authoritative.
	 */
	private _modelCatalogGeneration = 0;
	/**
	 * Forced refreshes are deferred to the next task so related lifecycle
	 * changes (for example an auth update arriving with a startup-config
	 * change) collapse into one enumeration of the final token/client source.
	 */
	private _scheduledModelRefresh: { readonly deferred: DeferredPromise<void>; generation: number } | undefined;
	private readonly _modelRefreshSchedule = this._register(new MutableDisposable());
	/**
	 * In-flight {@link refreshModels} call, so overlapping triggers (an auth
	 * token change landing on top of a periodic tick) collapse into a single
	 * `models.list` request. Only covers the request itself: {@link _refreshModels}
	 * returns as soon as it *schedules* a backoff retry, so a pending retry
	 * never suppresses a later tick — which is what lets the scheduler act as
	 * the long-term retry path once the bounded attempts are exhausted.
	 */
	private _modelRefreshInFlight: Promise<void> | undefined;

	private _client: CopilotClient | undefined;
	private _clientStarting: Promise<CopilotClient> | undefined;
	private _clientStopping: Promise<void> | undefined;
	/**
	 * Proxy URL injected into the running client's subprocess env (`undefined`
	 * when none was injected). Used to detect when a token change alters the
	 * token-discovered CAPI endpoint's proxy so we can restart the client.
	 */
	private _appliedProxy: string | undefined;
	/**
	 * Reasons for a client restart that is parked until every chat is idle. See
	 * {@link _requestClientRestart}; drained by {@link _applyPendingClientRestart}.
	 */
	private readonly _pendingClientRestartReasons = new Set<string>();
	private _closedConnectionRecovery: { readonly clientFailureId: string; readonly promise: Promise<ICopilotClosedConnectionRecoveryResult> } | undefined;
	private readonly _reportedClientFailures = new WeakSet<Error>();
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

	private readonly _chatEntriesBySdkId = this._register(new DisposableMap<string, CopilotChatEntry>());
	/**
	 * Maps each exact host chat URI to its provider-owned SDK backing data.
	 * Live SDK conversations remain separately owned by {@link _chatEntriesBySdkId}.
	 */
	private readonly _chatBackings = new Map<string, IPersistedChat>();
	/** Backings restored without provider data retain the historical AH-id-equals-SDK-id contract. */

	/**
	 * Exact chat -> host-supplied {@link IAgentChatContext.configurationResource}
	 * scope, recorded whenever this provider creates or materializes a chat.
	 * A fork/side-chat/review-copy source no longer carries its owning scope
	 * from the host (removed from {@link IAgentCreateChatForkSource}), so this
	 * is the only way the agent resolves it — from the exact chat it already
	 * knows, never by parsing the chat URI's shape.
	 */
	private readonly _chatScopes = new Map<string, URI>();

	private _rememberChatScope(chat: URI, scope: URI): void {
		this._chatScopes.set(chat.toString(), scope);
	}

	/** Resolves the recorded scope for an exact chat this provider created or materialized. */
	private _resolveChatScope(chat: URI): URI {
		const scope = this._chatScopes.get(chat.toString());
		if (!scope) {
			throw new Error(`[Copilot] No recorded scope for chat ${chat.toString()}; it must be created or materialized before it can be forked from`);
		}
		return scope;
	}

	/**
	 * The exact backing a creation recorded for a chat, in the shape the host
	 * persists. {@link IAgentCreateChatResult.backingSession} is reported only
	 * when the backing is a *separately enumerable* SDK session: an imported or
	 * forked session seeds the session's own SDK id, which the host already
	 * enumerates as the session itself and must not suppress.
	 */
	private _chatBackingResult(sessionId: string, backing: IPersistedChat): IAgentCreateChatResult {
		return {
			providerData: encodeProviderData(backing),
			...(backing.sdkSessionId !== sessionId ? { backingSession: AgentSession.uri(this.id, backing.sdkSessionId) } : {}),
		};
	}
	/**
	 * Fires when a concrete chat backing's opaque `providerData` blob changes
	 * after creation (for example a chat-scoped model switch), so the
	 * orchestrator re-persists the refreshed token. See
	 * {@link IAgent.onDidChangeChatData}.
	 */
	private readonly _onDidChangeChatData = this._register(new Emitter<IAgentChatDataChange>());
	readonly onDidChangeChatData: Event<IAgentChatDataChange> = this._onDidChangeChatData.event;
	private readonly _sessionLifetimes = new Map<string, CopilotSessionLifetime>();
	/**
	 * Sessions created by a client but not yet materialized into a Copilot
	 * SDK session + worktree + on-disk metadata. Materialization is deferred
	 * until the first {@link sendMessage}, at which point the entry becomes a
	 * live leaf in {@link _chatEntriesBySdkId}. See {@link IProvisionalSession}.
	 */
	private readonly _provisionalSessions = new Map<string, IProvisionalSession>();
	private _shutdownPromise: Promise<void> | undefined;
	private _isShuttingDown = false;
	private readonly _plugins: PluginController;
	private readonly _sessionLauncher: CopilotSessionLauncher;
	private readonly _gitHubTelemetryForwarder: CopilotGitHubTelemetryForwarder;
	private readonly _githubTelemetryRouter: AgentHostGitHubTelemetryRouter | undefined;
	readonly onDidCustomizationsChange: Event<void>;
	/** Per-session active client state for tools + plugin snapshot tracking. */
	private readonly _activeClients = new ResourceMap<ActiveClient>();
	/**
	 * The last customization snapshot Agent Host published for each session
	 * (Section 8b of `MULTI_CHAT_ARCHITECTURE.md`), keyed by owning session URI.
	 *
	 * This is the provider's *only* view of host-owned customization state:
	 * every value here arrived on a host call boundary — an addressed chat
	 * operation's {@link IAgentChatContext.customizations}, the
	 * `hostCustomizations` argument of {@link getSessionCustomizations} /
	 * {@link getOrCreateActiveClient} — never from shared host state. The
	 * contract is "retain the last supplied value and refresh it at the next
	 * boundary", so provider-internal work that has no host call of its own
	 * (the session's MCP enablement reconcile, a plugin re-publish) reads the
	 * retained snapshot rather than reaching back into the state manager.
	 *
	 * A session is absent until the host publishes its first snapshot, which
	 * is deliberately distinct from an empty list: readers that need a list
	 * fall back to `[]`, but writers never record `undefined` over a snapshot
	 * the host already supplied.
	 */
	private readonly _hostCustomizations = new ResourceMap<readonly Customization[]>();
	private readonly _slashCommandProvider: CopilotSlashCommandProvider;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostSessionTitleSignal sessionTitleSignal: IAgentHostSessionTitleSignal,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@IAgentHostOTelService private readonly _otelService: IAgentHostOTelService,
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
		this._plugins = this._register(this._instantiationService.createInstance(PluginController, () => this._ensureClient()));
		this._sessionLauncher = this._instantiationService.createInstance(CopilotSessionLauncher);
		this._gitHubTelemetryForwarder = this._instantiationService.createInstance(CopilotGitHubTelemetryForwarder, () => this._restrictedTelemetryEnabled);
		this._slashCommandProvider = new CopilotSlashCommandProvider(() => this._ensureClient().then(c => c.rpc.commands.list().then(c => c.commands)), this._logService);
		this._githubTelemetryRouter = isAgentHostTelemetryService(this._telemetryService)
			? new AgentHostGitHubTelemetryRouter(this._telemetryService)
			: undefined;
		this.onDidCustomizationsChange = this._plugins.onDidChange;
		// Session titles are host-owned; the narrow signal already filters by
		// provider and derives the conversation id, so nothing here reads
		// shared host state.
		this._register(sessionTitleSignal.onDidChangeSessionTitle(({ provider, session, conversationId, title }) => {
			if (provider === this.id) {
				this._otelService.emitSessionTitleChanged(conversationId, session.toString(), title);
			}
		}));
		// Mirror the sub-agent fan-out signals onto the first-class spawned-
		// chat channel so the orchestrator manages sub-agent chats
		// through the same membership path as user-driven chats.
		this._register(this._onDidSessionProgress.event(signal => this._emitSpawnedChatForSubagentSignal(signal)));
		this._register(completions.registerProvider(new CopilotSlashCommandCompletionProvider(this.id,
			{
				isRubberDuckEnabled: () => this._isRubberDuckEnabled(),
				getRuntimeSlashCommands: (sessionId, options) => this._getRuntimeSlashCommands(sessionId, options),
				getSessionCustomizations: (sessionId) => this.getSessionCustomizations(AgentSession.uri(this.id, sessionId)),
				getSessionConfigState: (sessionId) => this._getSessionConfigState(sessionId),
			},
			RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS,
		)));

		// Restart the CLI client when a setting baked into the client/subprocess at
		// startup changes, disposing any active sessions. These values are applied in
		// `_ensureClient`, so they only take effect on the next client start.
		this._register(this._configurationService.onDidRootConfigChange(() => {
			this._restartClientIfStartupConfigChanged().catch(err =>
				this._logService.error('[Copilot] Failed to apply root config change', err)
			);
		}));

		// The migrate-legacy flag is pushed from the renderer after connect, which
		// can land AFTER the first `listSessions` (so it surfaced nothing). When it
		// flips on, re-list so adoptable legacy sessions surface without a reload.
		this._register(this._configurationService.onDidRootConfigChange(() => {
			const enabled = this._isMigrateLegacyCopilotCliEnabled();
			if (enabled !== this._lastMigrateLegacyEnabled) {
				this._lastMigrateLegacyEnabled = enabled;
				if (enabled) {
					this._onDidChangeSessionList.fire();
				}
			}
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
	private _lastCopilotSdkLogLevelSetting: CopilotSdkLogLevelSetting = this._getCopilotSdkLogLevelSetting();
	private _lastEnterpriseHost: string | undefined = this._getEnterpriseHost();
	private _lastSystemProxyEnabled: boolean = this._isSystemProxyEnabled();
	private _lastMigrateLegacyEnabled: boolean = this._isMigrateLegacyCopilotCliEnabled();

	private _isSessionSyncEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostSessionSyncEnabledConfigKey) === true;
	}

	private _isRubberDuckEnabled(): boolean {
		return this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.RubberDuck) === true;
	}

	private _getCopilotSdkLogLevelSetting(): CopilotSdkLogLevelSetting {
		return this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.CopilotSdkLogLevel) ?? 'info';
	}

	private _resolveCopilotSdkLogLevel(configured: CopilotSdkLogLevelSetting): NonNullable<CopilotClientOptions['logLevel']> {
		return configured === 'trace' || this._logService.getLevel() === LogLevel.Trace ? 'all' : 'info';
	}

	private _getEnterpriseHost(): string | undefined {
		return this._gitHubEndpointService.getEnterpriseHost();
	}

	private _isPreferLongContextEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostPreferLongContextEnabledConfigKey) === true;
	}

	private _isSystemProxyEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostSystemProxyEnabledConfigKey) !== false;
	}

	private _isMigrateLegacyCopilotCliEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostMigrateLegacyCopilotCliEnabledConfigKey) === true;
	}

	/**
	 * Restart the CLI client when a startup-baked value changes, but defer past any
	 * in-flight turn — see {@link _requestClientRestart} — so the new values are
	 * picked up at the next quiet point rather than by killing live work.
	 * An in-flight start aborts if any startup value changes.
	 */
	private async _restartClientIfStartupConfigChanged(): Promise<void> {
		const sessionSync = this._isSessionSyncEnabled();
		const rubberDuck = this._isRubberDuckEnabled();
		const copilotSdkLogLevelSetting = this._getCopilotSdkLogLevelSetting();
		const enterpriseHost = this._getEnterpriseHost();
		const systemProxyEnabled = this._isSystemProxyEnabled();
		if (this._lastSessionSyncEnabled === sessionSync && this._lastRubberDuckEnabled === rubberDuck && this._lastCopilotSdkLogLevelSetting === copilotSdkLogLevelSetting && this._lastEnterpriseHost === enterpriseHost && this._lastSystemProxyEnabled === systemProxyEnabled) {
			return;
		}
		const changed = [
			this._lastSessionSyncEnabled !== sessionSync ? `sessionSync=${sessionSync}` : undefined,
			this._lastRubberDuckEnabled !== rubberDuck ? `rubberDuck=${rubberDuck}` : undefined,
			this._lastCopilotSdkLogLevelSetting !== copilotSdkLogLevelSetting ? `copilotSdkLogLevel=${copilotSdkLogLevelSetting}` : undefined,
			this._lastEnterpriseHost !== enterpriseHost ? `enterpriseHost=${enterpriseHost}` : undefined,
			this._lastSystemProxyEnabled !== systemProxyEnabled ? `systemProxy=${systemProxyEnabled}` : undefined,
		].filter((v): v is string => v !== undefined).join(', ');
		this._lastSessionSyncEnabled = sessionSync;
		this._lastRubberDuckEnabled = rubberDuck;
		this._lastCopilotSdkLogLevelSetting = copilotSdkLogLevelSetting;
		this._lastEnterpriseHost = enterpriseHost;
		this._lastSystemProxyEnabled = systemProxyEnabled;
		if (this._client) {
			this._logService.info(`[Copilot] Startup config changed (${changed}), restarting CopilotClient`);
		}
		await this._requestClientRestart(`startup config changed: ${changed}`);
	}

	private async _requestClientRestart(reason: string): Promise<void> {
		if (this._shutdownPromise || !this._client) {
			return;
		}
		this._pendingClientRestartReasons.add(reason);
		const busyChats = this._chatsWithActiveTurn();
		if (busyChats > 0) {
			this._logService.info(`[Copilot] Deferring CopilotClient restart (${reason}) until ${busyChats} in-flight turn(s) finish`);
			return;
		}
		await this._applyPendingClientRestart();
	}

	/**
	 * Runs a restart parked by {@link _requestClientRestart} once no chat has
	 * an in-flight turn. No-op while any turn is still running; the next chat
	 * to go idle drives this again.
	 */
	private async _applyPendingClientRestart(): Promise<void> {
		if (this._pendingClientRestartReasons.size === 0 || this._shutdownPromise || !this._client || this._chatsWithActiveTurn() > 0) {
			return;
		}
		const reason = [...this._pendingClientRestartReasons].join('; ');
		this._logService.info(`[Copilot] Restarting CopilotClient (${reason})`);
		this._chatEntriesBySdkId.clearAndDisposeAll();
		await this._stopClient();
		// The model list came from the subprocess we just tore down, and the
		// replacement may be pointed at a different CAPI endpoint entirely
		// (`COPILOT_GH_HOST` routes through this same helper). Re-enumerate
		// rather than serving the old client's catalog until the next token
		// change. Not hooked in `_ensureClient`, since `_listModels` calls
		// it and would recurse.
		this._capiModels = [];
		this._publishModels();
		void this._scheduleModelRefresh();
	}

	/**
	 * Called by a {@link CopilotAgentSession} when its turn ends. Scheduled off
	 * the current stack because the callback fires from inside that session's
	 * SDK event handling and the restart disposes the session making the call.
	 */
	private _onChatTurnEnded(): void {
		if (this._pendingClientRestartReasons.size === 0) {
			return;
		}
		queueMicrotask(() => {
			this._applyPendingClientRestart().catch(err =>
				this._logService.error('[Copilot] Failed to apply deferred client restart', err)
			);
		});
	}

	private async _recoverFromClosedConnection(error: unknown, operation: CopilotClientFailureOperation, correlation?: ICopilotFailureCorrelation): Promise<ICopilotClosedConnectionRecoveryResult | undefined> {
		const failureKind = classifyCopilotClientFailure(error);
		if (!failureKind) {
			return undefined;
		}
		if (error instanceof Error && this._reportedClientFailures.has(error)) {
			return undefined;
		}

		const clientFailureId = this._closedConnectionRecovery?.clientFailureId ?? generateUuid();
		const recoveryStarted = failureKind === 'connectionClosed' && !this._shutdownPromise && this._closedConnectionRecovery === undefined;
		reportCopilotClientFailure(this._telemetryService, clientFailureId, failureKind, operation, this._chatsWithActiveTurn(), recoveryStarted, error, correlation);
		if (failureKind !== 'connectionClosed' || this._shutdownPromise) {
			return undefined;
		}

		if (!this._closedConnectionRecovery) {
			const recovery = this._runClosedConnectionRecovery(clientFailureId, failureKind);
			this._closedConnectionRecovery = { clientFailureId, promise: recovery };
			const cleanup = () => {
				if (this._closedConnectionRecovery?.promise === recovery) {
					this._closedConnectionRecovery = undefined;
				}
			};
			recovery.then(cleanup, cleanup);
		}

		return this._closedConnectionRecovery.promise;
	}

	private async _runClosedConnectionRecovery(clientFailureId: string, failureKind: CopilotClientFailureKind): Promise<ICopilotClosedConnectionRecoveryResult> {
		const stopWatch = StopWatch.create();
		const result = await this._doRecoverFromClosedConnection(clientFailureId);
		reportCopilotClientRecovery(this._telemetryService, {
			clientFailureId,
			failureKind,
			durationMs: stopWatch.elapsed(),
			failedTurnCount: result.failedTurnIds.size,
			stopSucceeded: result.stopSucceeded,
		});
		return result;
	}

	private async _doRecoverFromClosedConnection(clientFailureId: string): Promise<ICopilotClosedConnectionRecoveryResult> {
		this._logService.error('[Copilot] Recovering from closed SDK connection');
		const failedTurnIds = new Set<string>();
		const error: ErrorInfo = {
			errorType: 'providerConnectionClosed',
			message: localize('copilotAgent.connectionClosed', "The Copilot CLI stopped unexpectedly. Retry your request."),
		};
		for (const chat of this._allLiveSessions()) {
			const failedTurnId = chat.failActiveTurn(error);
			if (failedTurnId) {
				failedTurnIds.add(failedTurnId);
				reportCopilotClientRecoveryTurn(
					this._telemetryService,
					clientFailureId,
					createCopilotFailureCorrelation(chat.sessionUri, chat.chatUri, failedTurnId, chat.sessionId),
				);
			}
		}

		this._chatEntriesBySdkId.clearAndDisposeAll();
		let stopSucceeded = true;
		try {
			await this._stopClient();
		} catch (error) {
			stopSucceeded = false;
			this._logService.error(error, '[Copilot] Failed to stop closed SDK client');
		}
		this._capiModels = [];
		this._publishModels();
		return { failedTurnIds, stopSucceeded };
	}

	private async _retryAfterClosedConnection<T>(operation: CopilotClientFailureOperation, task: () => Promise<T>, correlation?: ICopilotFailureCorrelation): Promise<T> {
		try {
			return await task();
		} catch (error) {
			if (!await this._recoverFromClosedConnection(error, operation, correlation)) {
				throw error;
			}
			return task();
		}
	}

	private _clientFailureCorrelation(chat: URI, turnId?: string, operationContext?: URI | IAgentChatContext): ICopilotFailureCorrelation {
		const context = this._resolveChatContext(chat, operationContext);
		return createCopilotFailureCorrelation(context.configurationResource, chat, turnId, context.target?.sessionId ?? context.configurationId);
	}

	/** Number of live chats (default or peer, across all sessions) with an in-flight turn. */
	private _chatsWithActiveTurn(): number {
		return this._allLiveSessions().filter(session => session.hasActiveTurn).length;
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
			capabilities: {
				multipleChats: { fork: true, sideChat: true },
				...(this._isMultiRootEnabled() ? { multipleWorkingDirectories: { immutablePrimary: true } } : {}),
			},
		};
	}

	private _isMultiRootEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostCopilotMultiRootEnabledConfigKey) === true;
	}

	getProtectedResources(): ProtectedResourceMetadata[] {
		return [
			this._gitHubEndpointService.getCopilotResource(),
			this._gitHubEndpointService.getRepoResource(),
		];
	}

	async getNetworkDiagnosticsEndpoints(): Promise<readonly IAgentHostNetworkEndpoint[]> {
		let capiUrl = process.env['VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE'] || COPILOT_CAPI_URL;
		if (this._githubToken) {
			try {
				capiUrl = await this._copilotApiService.resolveApiEndpoint(this._githubToken) || capiUrl;
			} catch (error) {
				this._logService.debug(`[Copilot] CAPI endpoint discovery for network diagnostics failed; using ${capiUrl}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		const capiPingUrl = new URL(capiUrl);
		capiPingUrl.pathname = `${capiPingUrl.pathname.replace(/\/$/, '')}/_ping`;
		return [
			{ name: 'GitHub API', url: this._gitHubEndpointService.getApiBaseUri() },
			{ name: 'Copilot API (CAPI)', url: capiPingUrl.toString() },
		];
	}

	async getNetworkDiagnosticsAccount(): Promise<string | undefined> {
		return this._githubToken ? this._copilotApiService.resolveUserLogin?.(this._githubToken) : undefined;
	}

	async getManagedSettingsDiagnostics(): Promise<IAgentHostManagedSettingsSnapshot> {
		this._logService.debug('[Copilot] Collecting runtime managed-settings diagnostics');
		let stage = 'resolving the Copilot CLI path';
		const diagnostics = (async () => {
			const nodeModulesUri = FileAccess.asFileUri(getAppNodeModulesPath());
			const cliPath = await resolveCopilotCliPath(nodeModulesUri);
			const runtimeSdkPath = join(dirname(cliPath), 'sdk', 'index.js');
			stage = 'checking the Copilot runtime SDK';
			if (!await fileExists(runtimeSdkPath)) {
				throw new Error(`Copilot runtime SDK not found at ${runtimeSdkPath}`);
			}
			stage = 'loading the Copilot runtime SDK';
			const runtimeSdk: unknown = await import(pathToFileURL(runtimeSdkPath).href);
			if (!isCopilotRuntimeManagedSettingsSdk(runtimeSdk)) {
				throw new Error('Copilot runtime SDK does not expose getManagedSettings()');
			}

			stage = 'querying native MDM and GitHub managed settings';
			return getCopilotManagedSettingsDiagnostics(
				runtimeSdk,
				this._githubToken,
				this._gitHubEndpointService.getEnterpriseUri() ?? 'https://github.com',
				AbortSignal.timeout(COPILOT_MANAGED_SETTINGS_DIAGNOSTICS_TIMEOUT_MS),
			);
		})();
		const result = await raceTimeout(diagnostics, COPILOT_MANAGED_SETTINGS_DIAGNOSTICS_TIMEOUT_MS);
		if (!result) {
			this._logService.warn(`[Copilot] Runtime managed-settings diagnostics timed out while ${stage}`);
			throw new Error(`Copilot runtime diagnostics exceeded 4.5 seconds while ${stage}.`);
		}
		this._logService.debug('[Copilot] Runtime managed-settings diagnostics collected');
		return {
			...result.resolved,
			...(result.account ? { account: result.account } : {}),
		};
	}

	getCustomizations(): readonly Customization[] {
		return this._plugins.getConfiguredHostCustomizations();
	}

	/**
	 * Records the host's latest customization snapshot for `session` (Section 8b).
	 *
	 * Called at every host boundary that carries one. `undefined` means "the
	 * host has published no snapshot yet", which is deliberately distinct from
	 * an empty list, so it never overwrites a snapshot already retained.
	 */
	private _rememberHostCustomizations(session: URI, customizations: readonly Customization[] | undefined): void {
		if (customizations) {
			this._hostCustomizations.set(session, customizations);
		}
	}

	/**
	 * Records the host customization snapshot carried by an addressed chat
	 * operation's context, so every chat call (create, send, model/agent
	 * change, history read, dispose, release) refreshes the retained value.
	 * A session-only (legacy) or provider-internal context carries none and is
	 * ignored.
	 */
	private _noteHostCustomizations(context: URI | IAgentChatContext | undefined): void {
		if (!context || URI.isUri(context)) {
			return;
		}
		this._rememberHostCustomizations(context.configurationResource, resolveAgentHostCustomizations(context));
	}

	/**
	 * The last host-published customization snapshot retained for `session`,
	 * or the shared empty list when the host has published none yet. Callers
	 * that need to distinguish the two read {@link _hostCustomizations}
	 * directly. The empty case is a stable singleton so identity-based caches
	 * downstream (see `SessionPluginController._getDesiredCustomization`) do
	 * not rebuild on every read.
	 */
	private _retainedHostCustomizations(session: URI): readonly Customization[] {
		return this._hostCustomizations.get(session) ?? NO_HOST_CUSTOMIZATIONS;
	}

	/**
	 * @param hostCustomizations The owning session's last host-published
	 * customization snapshot (Section 8b). Recorded as the session's retained
	 * snapshot and used to reapply the host's MCP enablement decisions on top
	 * of the provider's own authoritative view. `undefined` means the host has
	 * published none yet — distinct from an empty list, so the previously
	 * retained snapshot is kept rather than cleared.
	 */
	async getSessionCustomizations(session: URI, hostCustomizations?: readonly Customization[]): Promise<readonly Customization[]> {
		this._rememberHostCustomizations(session, hostCustomizations);
		const anchors = await this._getSessionCustomizationAnchors(session);
		const activeClient = this._getOrCreateActiveClient(session, anchors.directory);
		if (anchors.applyAdditional) {
			// Provisional (pre-send) or pre-resume: the anchors carry the full ordered
			// root set, so anchor discovery to every root instead of caching a
			// primary-only entry. Skipped for a live session (its tail is already set
			// by materialize/resume — do not clobber it).
			activeClient.pluginController.setAdditionalDirectories(anchors.additionalDirectories);
		}
		const fromPlugins = await activeClient.pluginController.getCustomizationsSettled();
		const topLevelMcp = this._findSessionChat(session)?.topLevelMcpCustomizations() ?? [];
		const customizations = [...fromPlugins, ...topLevelMcp];
		return applyMcpServerEnablement(customizations, this._retainedHostCustomizations(session));
	}

	async handleMcpRequest(session: URI, serverName: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		const entry = this._findSessionChat(session);
		if (!entry) {
			throw new Error(`Method not found: no active session ${AgentSession.id(session)}`);
		}
		return entry.handleMcpRequest(serverName, method, params);
	}

	async startMcpServer(session: URI, id: string): Promise<void> {
		await this._findSessionChat(session)?.startMcpServer(id);
	}

	async stopMcpServer(session: URI, id: string): Promise<void> {
		await this._findSessionChat(session)?.stopMcpServer(id);
	}

	/**
	 * The gated additional (non-primary) roots for a session: the tail of the
	 * ordered working-directory set when multi-root is enabled, else empty (so
	 * single-root / flag-off is byte-identical). Used both to anchor
	 * customization discovery and to populate the launch plan's
	 * `additionalDirectories`, keeping the SDK's granted roots and discovery in
	 * lockstep — so a session created while multi-root was enabled falls back to
	 * a single root when resumed after the flag is turned off.
	 */
	private _additionalCustomizationDirectories(workingDirectories: readonly URI[] | undefined): readonly URI[] {
		if (!this._isMultiRootEnabled() || !workingDirectories || workingDirectories.length <= 1) {
			return [];
		}
		return workingDirectories.slice(1);
	}

	/**
	 * Resolves the customization anchor(s) for a session. `directory` is the
	 * primary (index 0) anchor — the worktree for worktree-isolated sessions.
	 * `additionalDirectories` are the non-primary roots to attach to discovery,
	 * and are applied only when `applyAdditional` is true:
	 * - **provisional** (pre-send) sessions carry the client-supplied set, whose
	 *   non-primary folders are stable workspace folders that can be discovered
	 *   immediately (the worktree, if any, only affects index 0 at send);
	 * - **not-yet-live** sessions carry the persisted set from metadata;
	 * - **live** (active) sessions manage their own tail via materialize/resume,
	 *   so `applyAdditional` is false to avoid clobbering it.
	 */
	private async _getSessionCustomizationAnchors(session: URI): Promise<{ readonly directory: URI | undefined; readonly additionalDirectories: readonly URI[]; readonly applyAdditional: boolean }> {
		const sessionId = AgentSession.id(session);
		const provisional = this._provisionalSessions.get(sessionId);
		if (provisional) {
			return {
				directory: provisional.workingDirectory,
				additionalDirectories: this._additionalCustomizationDirectories(provisional.workingDirectories),
				applyAdditional: true,
			};
		}
		const entry = this._findSessionChat(session);
		if (entry) {
			// For non-provisional sessions the anchor follows the working directory
			// (the worktree). Prefer it over a persisted `customizationDirectory`,
			// which older sessions stored as the original user-picked folder.
			return { directory: entry.customizationDirectory, additionalDirectories: [], applyAdditional: false };
		}
		const metadata = await this._readSessionMetadata(session);
		return {
			directory: metadata.workingDirectory ?? metadata.customizationDirectory,
			additionalDirectories: this._additionalCustomizationDirectories(metadata.workingDirectories),
			applyAdditional: true,
		};
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
			void this._scheduleModelRefresh();
		}
		return true;
	}

	async handleAuthenticationToken(params: AuthenticateParams): Promise<boolean> {
		let handled = false;
		for (const session of this._allLiveSessions()) {
			const didHandle = await session.resolveMcpAuthentication(params);
			handled ||= didHandle;
		}
		return handled;
	}

	private _updateRestrictedTelemetry(githubToken: string | undefined): void {
		// Safe default synchronously: keep restricted/enhanced telemetry disabled until the minted
		// CAPI Copilot session token confirms the `rt=1` opt-in. The GitHub token here carries no
		// `rt`/`tid` claims — those live in the Copilot session token, which the API service mints —
		// so the real values are resolved asynchronously below. Mirrors how the Copilot extension
		// reads `rt`/`tid` off its `CopilotToken` rather than the GitHub token.
		this._applyRestrictedTelemetry(undefined);
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
			this._applyRestrictedTelemetry({
				...ctx,
				telemetryEndpoint: toRestrictedTelemetryEndpoint(ctx.telemetryEndpoint),
			});
		} catch (err) {
			this._logService.debug(`[Copilot] Restricted telemetry resolution failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private _applyRestrictedTelemetry(context: IRestrictedTelemetryContext | undefined): void {
		const rtEnabled = context?.restrictedTelemetryEnabled === true;
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
			this._telemetryService.setCopilotTrackingId(context?.trackingId);
			this._telemetryService.setRestrictedTelemetryEndpoint(context?.telemetryEndpoint);
		}
	}

	private async _routeGitHubTelemetry(notification: GitHubTelemetryNotification): Promise<void> {
		const additionalProperties = { initiatorClientType: this._clientTypeForTelemetry(notification.sessionId) };
		const router = this._githubTelemetryRouter;
		if (!router?.isTarget(notification)) {
			this._gitHubTelemetryForwarder.forward(notification);
			return;
		}
		if (!notification.restricted) {
			await router.route(notification, undefined, additionalProperties);
			return;
		}

		const sessionId = notification.sessionId;
		const githubToken = this._githubToken;
		if (!githubToken) {
			await router.route(notification, undefined, additionalProperties);
			return;
		}

		try {
			const context = await this._copilotApiService.resolveRestrictedTelemetryContext(githubToken);
			if (this._githubToken !== githubToken) {
				return;
			}
			await router.route(notification, {
				restrictedTelemetryEnabled: context.restrictedTelemetryEnabled,
				trackingId: context.trackingId,
				telemetryEndpoint: toRestrictedTelemetryEndpoint(context.telemetryEndpoint),
				isInternal: context.isInternal === true,
				userName: context.userName,
				isVscodeTeamMember: context.isVscodeTeamMember === true,
			}, additionalProperties);
		} catch (error) {
			this._logService.debug(`[Copilot:${sessionId}] Restricted telemetry context resolution failed; dropping ${notification.event.kind}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private _clientTypeForTelemetry(sdkSessionId: string | undefined): AgentHostClientType {
		return sdkSessionId
			? this._findSessionBySdkId(sdkSessionId)?.currentTurnClientType ?? AgentHostClientType.Unknown
			: AgentHostClientType.Unknown;
	}

	/**
	 * {@link IAgent.refreshModels}. Coalesces onto an in-flight refresh and
	 * never rejects — {@link _refreshModels} already logs and retains the last
	 * known-good list on failure.
	 *
	 * Only safe for callers with no new input to apply (the host's periodic
	 * scheduler). Triggers that invalidate the in-flight request — a rotated
	 * token, a restarted client — must call {@link _scheduleModelRefresh} so they
	 * are not answered by a refresh bound to the superseded input.
	 */
	refreshModels(): Promise<void> {
		return this._scheduledModelRefresh?.deferred.p ?? this._modelRefreshInFlight ?? this._startModelRefresh(++this._modelCatalogGeneration);
	}

	/**
	 * Invalidates an in-flight refresh immediately, then starts one refresh on
	 * the next task. Repeated lifecycle triggers before that task
	 * share the same deferred and enumerate only the final token/client source.
	 */
	private _scheduleModelRefresh(): Promise<void> {
		const generation = ++this._modelCatalogGeneration;
		if (this._scheduledModelRefresh) {
			this._scheduledModelRefresh.generation = generation;
			return this._scheduledModelRefresh.deferred.p;
		}

		const scheduled = { deferred: new DeferredPromise<void>(), generation };
		this._scheduledModelRefresh = scheduled;
		this._modelRefreshSchedule.value = disposableTimeout(() => {
			void (async () => {
				try {
					// A config-triggered restart clears `_client` before its
					// asynchronous `stop()` completes. Wait for that stop so this
					// refresh cannot resurrect the client midway through teardown.
					await this._clientStopping;
					if (this._scheduledModelRefresh !== scheduled) {
						return;
					}
					this._scheduledModelRefresh = undefined;
					this._modelRefreshSchedule.clear();
					await this._startModelRefresh(scheduled.generation);
				} catch (err) {
					this._logService.error(err, '[Copilot] Failed to schedule model refresh');
				} finally {
					if (this._scheduledModelRefresh === scheduled) {
						this._scheduledModelRefresh = undefined;
						this._modelRefreshSchedule.clear();
					}
					scheduled.deferred.complete();
				}
			})();
		}, 0);
		return scheduled.deferred.p;
	}

	private _startModelRefresh(generation: number): Promise<void> {
		const refresh = this._refreshModels(0, generation).finally(() => {
			if (this._modelRefreshInFlight === refresh) {
				this._modelRefreshInFlight = undefined;
			}
		});
		this._modelRefreshInFlight = refresh;
		return refresh;
	}
	private async _refreshModels(attempt = 0, generation = this._modelCatalogGeneration): Promise<void> {
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
			if (this._githubToken === tokenAtRefreshStart && this._modelCatalogGeneration === generation) {
				this._capiModels = models;
				this._publishModels();
			}
		} catch (err) {
			// Token rotated mid-flight — a newer refresh owns the result — or
			// teardown began while the request was in flight, in which case a
			// retry would just resurrect the client we are tearing down.
			if (this._githubToken !== tokenAtRefreshStart || this._modelCatalogGeneration !== generation || this._shutdownPromise) {
				return;
			}
			await this._recoverFromClosedConnection(err, 'modelRefresh');
			if (attempt + 1 < this._modelRefreshMaxAttempts) {
				const delay = this._modelRefreshBackoff(attempt);
				this._logService.warn(`[Copilot] Failed to refresh models (attempt ${attempt + 1}), retrying in ${delay}ms`, err);
				this._modelRefreshRetry.value = disposableTimeout(() => {
					void this._refreshModels(attempt + 1, generation);
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
	 * Each model is surfaced under the provider-qualified id `vendor/[group/]id` so a
	 * selection round-trips to the per-session provider config synthesized by
	 * `resolveByokSessionConfig`.
	 */
	private _refreshByokModels(): void {
		if (this._shutdownPromise) {
			return;
		}
		this._byokModels = this._byokBridgeRegistry.getModels().map((m): IAgentModelInfo => {
			const byokMeta = createAgentModelByokMeta(m.modelIdentifier);
			const thinkingLevel = this._createThinkingLevelConfigSchemaProperty(m.supportedReasoningEfforts, m.defaultReasoningEffort, m.id);
			return {
				provider: this.id,
				id: `${m.vendor}/${getByokLmSelectionModelId(m)}`,
				name: m.name ?? m.id,
				maxContextWindow: m.maxContextWindowTokens,
				supportsVision: m.supportsVision ?? false,
				...(thinkingLevel ? { configSchema: { type: 'object', properties: { [ThinkingLevelConfigKey]: thinkingLevel } } satisfies ConfigSchema } : {}),
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

	private _stopClient(): Promise<void> {
		// Any parked restart is satisfied by this stop: the next `_ensureClient`
		// starts from the current config, so nothing is left to re-apply. Cleared
		// synchronously so a concurrent `_applyPendingClientRestart` bails rather
		// than stopping a client this call is already tearing down.
		this._pendingClientRestartReasons.clear();
		if (this._clientStopping) {
			return this._clientStopping;
		}
		const stopping = (async () => {
			const clientStarting = this._clientStarting;
			if (clientStarting) {
				try {
					await clientStarting;
				} catch {
					// A failed/stale start owns its own cleanup. Continue so
					// any client it managed to publish is still stopped below.
				}
			}
			const client = this._client;
			this._client = undefined;
			this._clientStarting = undefined;
			await client?.stop();
			// The runtime subprocess is now dead, so it is safe to release the BYOK
			// proxy handle: the next session launch mints a fresh nonce. See the
			// ownership invariant on `CopilotSessionLauncher.disposeByokProxyHandle`.
			await this._sessionLauncher.disposeByokProxyHandle();
		})().finally(() => {
			if (this._clientStopping === stopping) {
				this._clientStopping = undefined;
			}
		});
		this._clientStopping = stopping;
		return stopping;
	}

	// ---- client lifecycle ---------------------------------------------------

	private async _ensureClient(): Promise<CopilotClient> {
		if (this._shutdownPromise) {
			throw new CancellationError();
		}
		while (this._clientStopping) {
			await this._clientStopping;
			if (this._shutdownPromise) {
				throw new CancellationError();
			}
		}
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
		const copilotSdkLogLevelSettingAtStartup = this._getCopilotSdkLogLevelSetting();
		const enterpriseHostAtStartup = this._getEnterpriseHost();
		const systemProxyEnabledAtStartup = this._isSystemProxyEnabled();
		const clientStarting = (async () => {
			this._logService.info('[Copilot] Starting CopilotClient...');

			// Build a clean env for the CLI subprocess, stripping Electron/VS Code vars
			// that can interfere with the Node.js process the SDK spawns.
			const env = createCopilotCliEnvironment();
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
			const nativeTelemetry = await this._otelService.getNativeSdkTelemetryConfig();
			if (nativeTelemetry) {
				env['OTEL_SERVICE_NAME'] = 'github-copilot';
				env['OTEL_RESOURCE_ATTRIBUTES'] = Object.entries(nativeTelemetry.resourceAttributes).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join(',');
			}
			if (nativeTelemetry?.traces) {
				env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'] = nativeTelemetry.traces.endpoint;
				env['OTEL_EXPORTER_OTLP_TRACES_PROTOCOL'] = nativeTelemetry.traces.protocol;
			}
			if (nativeTelemetry?.external) {
				env['OTEL_EXPORTER_OTLP_METRICS_ENDPOINT'] = resolveCopilotOtlpMetricsEndpoint(nativeTelemetry.external.endpoint, nativeTelemetry.external.protocol);
				env['OTEL_EXPORTER_OTLP_METRICS_PROTOCOL'] = nativeTelemetry.external.protocol;
			} else if (nativeTelemetry) {
				env['OTEL_METRICS_EXPORTER'] = 'none';
			}
			const copilotSdkLogLevelAtStartup = this._resolveCopilotSdkLogLevel(copilotSdkLogLevelSettingAtStartup);

			const clientOptions: CopilotClientOptions = {
				useLoggedInUser: false,
				connection: RuntimeConnection.forStdio({ path: cliPath }),
				env,
				telemetry,
				logLevel: copilotSdkLogLevelAtStartup,
				enableRemoteSessions: sessionSyncAtStartup,
				onGetTraceContext: () => this._otelService.getCurrentTraceContext() ?? {},
				onGitHubTelemetry: notification => { void this._routeGitHubTelemetry(notification).catch(err => this._logService.trace(`[Copilot] GitHub telemetry routing failed: ${err instanceof Error ? err.message : String(err)}`)); },
			};
			const client = this._createCopilotClient(clientOptions);
			try {
				await client.start();
			} catch (error) {
				const failureKind = classifyCopilotClientFailure(error);
				if (failureKind && error instanceof Error) {
					reportCopilotClientFailure(this._telemetryService, generateUuid(), failureKind, 'startClient', this._chatsWithActiveTurn(), false, error);
					this._reportedClientFailures.add(error);
				}
				throw error;
			}
			if (this._shutdownPromise) {
				await client.stop();
				throw new CancellationError();
			}
			if (this._isSessionSyncEnabled() !== sessionSyncAtStartup || this._isRubberDuckEnabled() !== rubberDuckAtStartup || this._getCopilotSdkLogLevelSetting() !== copilotSdkLogLevelSettingAtStartup || this._getEnterpriseHost() !== enterpriseHostAtStartup || this._isSystemProxyEnabled() !== systemProxyEnabledAtStartup) {
				await client.stop();
				throw new Error('Copilot startup config changed while the client was starting');
			}
			this._logService.info('[Copilot] CopilotClient started successfully');
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

	private _createThinkingLevelConfigSchemaProperty(reasoningEfforts: readonly string[] | undefined, defaultReasoningEffort: string | undefined, modelId: string | undefined): ConfigPropertySchema | undefined {
		// Only advertise efforts the Copilot launcher actually accepts, otherwise the picker would
		// surface a level that is silently dropped when the session is launched.
		const supportedReasoningEfforts = reasoningEfforts?.filter(isCopilotReasoningEffort);
		if (!supportedReasoningEfforts?.length) {
			return undefined;
		}

		return {
			type: 'string',
			title: localize('copilot.modelThinkingLevel.title', "Thinking Level"),
			description: localize('copilot.modelThinkingLevel.description', "Controls how much reasoning effort the model uses."),
			default: resolveDefaultReasoningEffort(supportedReasoningEfforts, defaultReasoningEffort, modelId),
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
	 */
	private _createContextSizeConfigSchemaProperty(billing: ICAPIModelBilling | undefined): ConfigPropertySchema | undefined {
		const tokenPrices = billing?.tokenPrices;
		const defaultMax = tokenPrices?.contextMax;
		const longContextMax = tokenPrices?.longContext?.contextMax;
		if (!defaultMax || !longContextMax || defaultMax >= longContextMax) {
			return undefined;
		}

		// When both tiers cost the same and the user prefers long context, show only the long-context option as a non-switchable indicator. See microsoft/vscode#322950, microsoft/vscode#323116.
		if (this._isPreferLongContextEnabled() && !hasLongContextSurcharge(billing)) {
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
	 * Builds the open `_meta` model picker bag from the SDK's billing and picker metadata.
	 */
	private _createModelPickerMeta(modelInfo: CopilotModelInfo, billing: ICAPIModelBilling | undefined): Record<string, unknown> | undefined {
		return createPricingMetaFromBilling(billing, modelInfo.modelPickerPriceCategory, modelInfo.modelPickerCategory);
	}

	private _createModelConfigSchema(m: CopilotModelInfo, billing: ICAPIModelBilling | undefined): ConfigSchema | undefined {
		const properties: ConfigSchema['properties'] = {};
		const thinkingLevel = this._createThinkingLevelConfigSchemaProperty(m.supportedReasoningEfforts, undefined, m.id);
		if (thinkingLevel) {
			properties[ThinkingLevelConfigKey] = thinkingLevel;
		}
		const contextSize = this._createContextSizeConfigSchemaProperty(billing);
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
		return [];
	}

	async listLegacySessions(): Promise<IAgentSessionMetadata[]> {
		this._logService.info('[Copilot] Listing sessions...');
		const sessions = await this._retryAfterClosedConnection('listSessions', async () => {
			const client = await this._ensureClient();
			return client.listSessions();
		});
		const migrateLegacy = this._isMigrateLegacyCopilotCliEnabled();
		const projectLimiter = new Limiter<IAgentSessionProjectInfo | undefined>(4);
		const projectByContext = new Map<string, Promise<IAgentSessionProjectInfo | undefined>>();
		const mapped = await Promise.all(sessions.map(async s => {
			const session = AgentSession.uri(this.id, s.sessionId);
			const metadata = await this._readStoredSessionMetadata(session);
			// Only list sessions the agent host actually owns: a genuine native /
			// already-migrated session has a persisted working directory.
			if (!metadata?.workingDirectory) {
				// No stored working directory. When migration is enabled, surface a
				// genuinely un-adopted extension-host Copilot CLI session as adoptable
				// so the agent host owns the list without the extension host; opening
				// it adopts in place. `metadata === undefined` means there is no
				// session database at all (i.e. not agent-host-owned), which excludes
				// ghost DBs created empty by checkpoint / changeset / git services; the
				// `vscode.metadata.json` marker excludes standalone CLI and provisional
				// agent-host sessions. When disabled, nothing here is surfaced.
				if (migrateLegacy
					&& metadata === undefined
					&& typeof s.context?.workingDirectory === 'string'
					&& await this._isExtensionHostCliSession(s.sessionId)) {
					return {
						session,
						startTime: s.startTime.getTime(),
						modifiedTime: s.modifiedTime.getTime(),
						project: await this._resolveSessionProject(s.context, projectLimiter, projectByContext),
						summary: s.summary,
						workingDirectories: [URI.file(s.context.workingDirectory)],
						_meta: withSessionEhcliAdoptable(undefined),
					} satisfies IAgentSessionMetadata;
				}
				return undefined;
			}
			let { project, resolved } = metadata;
			if (!resolved) {
				project = await this._resolveSessionProject(s.context, projectLimiter, projectByContext);
				void this._storeSessionProjectResolution(session, project);
			}
			const workingDirectories = metadata.workingDirectories ?? (typeof s.context?.workingDirectory === 'string' ? [URI.file(s.context.workingDirectory)] : undefined);
			const result: IAgentSessionMetadata = {
				session,
				startTime: s.startTime.getTime(),
				modifiedTime: s.modifiedTime.getTime(),
				project,
				summary: s.summary,
				workingDirectories,
			};
			return result;
		}));
		const result = mapped.filter((s): s is IAgentSessionMetadata => s !== undefined);
		this._logService.info(`[Copilot] Found ${result.length} sessions`);
		return result;
	}

	async getSessionMetadata(session: URI, providerData?: string): Promise<IAgentSessionMetadata | undefined> {
		const sessionId = providerData ? decodeProviderData(providerData)?.sdkSessionId : AgentSession.id(session);
		if (!sessionId) {
			return undefined;
		}
		const storedMetadata = await this._readStoredSessionMetadata(session);
		if (!storedMetadata) {
			return undefined;
		}

		const sessionMetadata = await this._retryAfterClosedConnection('getSessionMetadata', async () => {
			const client = await this._ensureClient();
			return client.getSessionMetadata(sessionId);
			// This lookup is session-addressed, so the correlation names the
			// session's own chat: the exact URI the host bound it to, else the
			// session itself (which correlates as the default chat, identically to
			// the URI this used to rebuild by shape).
		}, createCopilotFailureCorrelation(session, this._findSessionChatUri(session) ?? session, undefined, sessionId));
		if (!sessionMetadata) {
			return undefined;
		}

		let project = storedMetadata?.project;
		if (storedMetadata && !storedMetadata.resolved) {
			const projectLimiter = new Limiter<IAgentSessionProjectInfo | undefined>(1);
			project = await this._resolveSessionProject(sessionMetadata?.context, projectLimiter, new Map<string, Promise<IAgentSessionProjectInfo | undefined>>());
			void this._storeSessionProjectResolution(session, project);
		}

		const workingDirectories = storedMetadata?.workingDirectories ?? (typeof sessionMetadata?.context?.workingDirectory === 'string' ? [URI.file(sessionMetadata.context.workingDirectory)] : undefined);
		return {
			session,
			startTime: sessionMetadata?.startTime.getTime() ?? Date.now(),
			modifiedTime: sessionMetadata?.modifiedTime.getTime() ?? Date.now(),
			project,
			summary: sessionMetadata?.summary,
			workingDirectories,
		};
	}

	private async _listModels(gitHubToken: string): Promise<IAgentModelInfo[]> {
		this._logService.info('[Copilot] Listing models...');
		const client = await this._ensureClient();
		const { models } = await client.rpc.models.list({ gitHubToken });
		this._freeLongContextModels.clear();
		const preferLongContext = this._isPreferLongContextEnabled();
		const result = models.map((m): IAgentModelInfo => {
			const billing = normalizeCAPIBilling(m.billing);
			const configSchema = this._createModelConfigSchema(m, billing);
			// A model has free long context (larger window, no surcharge), but only treat it as free when the user prefers long context.
			const tokenPrices = billing?.tokenPrices;
			const hasLargerLongContext = !!tokenPrices?.contextMax
				&& !!tokenPrices.longContext?.contextMax
				&& tokenPrices.longContext.contextMax > tokenPrices.contextMax;
			if (preferLongContext && hasLargerLongContext && !hasLongContextSurcharge(billing)) {
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
				_meta: this._createModelPickerMeta(m, billing),
			};
		});
		this._logService.info(`[Copilot] Found ${result.length} models: ${result.map(m => m.name).join(', ')}`);
		return result;
	}

	/**
	 * Resolves the process root for a chat that carries its session's runtime:
	 * the host-supplied primary folder, else a still-provisional session's
	 * folder for an idempotent re-create, else — when the session is
	 * workspace-less (no working directories supplied) — a stable per-session
	 * scratch directory.
	 */
	private async _resolveCreateWorkingDirectory(options: IAgentCreateChatOptions, sessionId: string, isWorkspaceless: boolean): Promise<URI> {
		if (options.fork) {
			const sourceScope = this._resolveChatScope(options.fork.source);
			const sourceSessionId = AgentSession.id(sourceScope);
			const liveWorkingDirectory = this._findSessionBySdkId(sourceSessionId)?.workingDirectory;
			if (liveWorkingDirectory) {
				return liveWorkingDirectory;
			}
			const storedWorkingDirectory = (await this._readSessionMetadata(sourceScope)).workingDirectory;
			if (storedWorkingDirectory) {
				return storedWorkingDirectory;
			}
		}
		const existing = options.workingDirectories?.[0] ?? this._provisionalSessions.get(sessionId)?.workingDirectory;
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
	// `(session, chat)` mapping and hands these methods a single, concrete chat
	// channel URI plus transient context when the operation needs the owning
	// session or storage scope. Routing reads only the exact chat backing map
	// and never recovers ownership by parsing the chat URI.

	/**
	 * The live runtime for the SDK conversation with this *exact* id.
	 *
	 * {@link _chatEntriesBySdkId} is keyed strictly by Copilot SDK session id,
	 * so this is an exact-id lookup and nothing more: it does not search by AH
	 * session URI, chat channel, or persistence scope, and it matches a
	 * host-minted AH session id only for the legacy identity where the two
	 * coincide. Use {@link _findChatByUri} to route an addressed chat and
	 * {@link _findSessionChat} to reach a session's session-backed chat.
	 */
	private _findSessionBySdkId(sdkSessionId: string): CopilotAgentSession | undefined {
		return this._chatEntriesBySdkId.get(sdkSessionId)?.chatSession;
	}

	/**
	 * The live runtime backing a session's session-backed (default) chat: the
	 * one whose host-chosen persistence scope ({@link IAgentChatContext.resource})
	 * *is* the session itself. Every additional chat is scoped to its own chat
	 * URI, so this identifies the session-backed chat exactly — and it does so
	 * from a fact the host supplied, replacing the old
	 * `_findChatByUri(buildDefaultChatUri(session))` probe. The provider never
	 * re-derives a default-chat URI from a session URI's shape.
	 */
	private _findSessionChat(session: URI): CopilotAgentSession | undefined {
		for (const entry of this._chatEntriesBySdkId.values()) {
			if (isEqual(entry.chatSession.resourceUri, session)) {
				return entry.chatSession;
			}
		}
		return undefined;
	}

	private _findChatByUri(chat: URI | string): CopilotAgentSession | undefined {
		const chatKey = typeof chat === 'string' ? chat : chat.toString();
		const backing = this._chatBackings.get(chatKey);
		return backing ? this._findSessionBySdkId(backing.sdkSessionId) : undefined;
	}

	private _findBoundSessionChatUri(sessionId: string): URI | undefined {
		for (const [chatKey, backing] of this._chatBackings) {
			if (backing.sdkSessionId === sessionId) {
				return URI.parse(chatKey);
			}
		}
		return undefined;
	}

	/**
	 * The exact chat URI Agent Host bound a session's session-backed (default)
	 * chat to, recovered from the provider's own routing table: the live
	 * runtime's SDK id when the session is materialized, else the SDK id
	 * reserved for it while it is still provisional, else the legacy identity
	 * where the SDK id equals the AH session id. `undefined` when the session
	 * has no chat backing at all (an unbound legacy runtime).
	 */
	private _findSessionChatUri(session: URI): URI | undefined {
		const sessionId = AgentSession.id(session);
		const sdkSessionId = this._findSessionChat(session)?.sessionId
			?? this._provisionalSessions.get(sessionId)?.sdkSessionId
			?? sessionId;
		return this._findBoundSessionChatUri(sdkSessionId);
	}

	/**
	 * Normalizes an addressed chat operation onto the provider's routing view.
	 *
	 * Every addressed operation funnels through here, so this is also where the
	 * session's retained host-customization snapshot (Section 8b) is refreshed from
	 * the context the host just supplied — that is what keeps the retained
	 * value at most one host round-trip stale for provider-internal work that
	 * has no host call of its own.
	 */
	private _resolveChatContext(chat: URI, sessionOrContext: URI | IAgentChatContext | undefined): IResolvedCopilotChatContext {
		if (!sessionOrContext) {
			const chatKey = chat.toString();
			const backing = this._chatBackings.get(chatKey);
			const target = backing ? this._findSessionBySdkId(backing.sdkSessionId) : undefined;
			if (!backing || !target) {
				throw new Error(`Cold Copilot chat operation requires explicit host context: ${chatKey}`);
			}
			const ownerSession = target.ownerSessionUri ?? target.sessionUri;
			return {
				configurationResource: ownerSession,
				configurationId: AgentSession.id(ownerSession),
				resource: target.resourceUri,
				chat,
				chatKey,
				sdkSessionId: backing.sdkSessionId,
				sequencerKey: backing.sdkSessionId,
				target,
			};
		}
		const explicit = resolveAgentChatContext(sessionOrContext, chat);
		this._noteHostCustomizations(sessionOrContext);
		return this._resolveExplicitChatContext(chat, explicit);
	}

	private _resolveExplicitChatContext(chat: URI, context: IAgentChatContext): IResolvedCopilotChatContext {
		const chatKey = chat.toString();
		const backing = this._chatBackings.get(chatKey);
		const boundTarget = backing ? this._findSessionBySdkId(backing.sdkSessionId) : undefined;
		const configurationId = AgentSession.id(context.configurationResource);
		const target = boundTarget;
		const sdkSessionId = backing?.sdkSessionId;
		return {
			configurationResource: context.configurationResource,
			configurationId,
			resource: context.resource,
			chat,
			chatKey,
			sdkSessionId,
			sequencerKey: sdkSessionId ?? chatKey,
			target,
		};
	}

	private _getRuntimeSlashCommands(sessionId: string, options?: ICopilotRuntimeSlashCommandQueryOptions) {
		const session = this._findSessionBySdkId(sessionId);
		if (session) {
			return session.getRuntimeSlashCommands(options) ?? [];
		}
		return this._slashCommandProvider.getSlashCommands(options);
	}

	/**
	 * Chat-addressed surface for the chats within a session.
	 */
	readonly chats: IAgentChats = {
		createChat: (chat: URI, context: URI | IAgentChatContext, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult> => {
			this._noteHostCustomizations(context);
			return this._createChat(chat, resolveAgentChatContext(context, chat), options);
		},
		disposeChat: (chatUri: URI, context?: URI | IAgentChatContext): Promise<void> => this._disposeChat(chatUri, context),
		releaseChat: (chatUri: URI, context?: URI | IAgentChatContext): Promise<void> => this._releaseChat(chatUri, context),
		sendMessage: (chatUri: URI, prompt: string, workingDirectoriesOrDirectory: readonly URI[] | URI | undefined, attachments?: readonly MessageAttachment[], turnId?: string, senderClientId?: string, clientTypeOrContext?: AgentHostClientType | URI | IAgentChatContext, context?: URI | IAgentChatContext): Promise<void> => {
			const workingDirectories = Array.isArray(workingDirectoriesOrDirectory) ? workingDirectoriesOrDirectory : workingDirectoriesOrDirectory ? [workingDirectoriesOrDirectory] : undefined;
			const clientType = typeof clientTypeOrContext === 'string' ? clientTypeOrContext : AgentHostClientType.Unknown;
			const operationContext = context ?? (typeof clientTypeOrContext === 'string' ? undefined : clientTypeOrContext);
			return this._sendMessage(chatUri, prompt, attachments, turnId, senderClientId, clientType, workingDirectories, operationContext);
		},
		abort: (chatUri: URI, context?: URI | IAgentChatContext): Promise<void> => {
			return this._abortSession(chatUri, context);
		},
		changeModel: (chatUri: URI, model: ModelSelection, context?: URI | IAgentChatContext): Promise<void> => {
			return this._changeModel(chatUri, model, context);
		},
		changeAgent: (chatUri: URI, agent: AgentSelection | undefined, context?: URI | IAgentChatContext): Promise<void> => {
			return this._changeAgent(chatUri, agent, context);
		},
		getMessages: (chat: URI, context?: URI | IAgentChatContext): Promise<readonly Turn[]> => this._getChatMessages(chat, context),
	};

	/**
	 * Creates one chat. This is the only creation path the agent has: fresh,
	 * forked, imported, and side chats all mint their exact provider backing
	 * here, record it against `chat`, and report it as
	 * {@link IAgentCreateChatResult}.
	 *
	 * Agent Host hands in fully resolved inputs — the ordered working-directory
	 * set, model, custom agent, provider config, an eagerly claimed active
	 * client, whether the SDK backing may be deferred to the first send, and
	 * any fork / import / side-chat source. Creation branches on those inputs
	 * and on what the agent already backs, never on the chat's URI shape or on
	 * a session-versus-peer role the agent assigns itself.
	 *
	 * A creation that brings a session into existence — a deferred first
	 * backing, an imported conversation, or a fork whose source lives in
	 * another session — also resolves that session's process root and project,
	 * persists what must survive a restart, and reports `project`,
	 * `resolvedWorkingDirectory` and `provisional` on the same chat result. The
	 * host already knows `chat`'s scope from the `context` it supplied, so the
	 * result never echoes it back.
	 */
	private _createChat(chat: URI, context: IAgentChatContext, options: IAgentCreateChatOptions = {}): Promise<IAgentCreateChatResult> {
		this._rememberChatScope(chat, context.configurationResource);
		if (options.deferBacking) {
			return this._reserveChatBacking(chat, context, options);
		}
		if (options.importConversation) {
			return this._importChatBacking(chat, context, options);
		}
		return this._mintChatBacking(chat, context, options);
	}

	/**
	 * Reserves the chat's SDK id without contacting the SDK: the Copilot
	 * session, the worktree (if any), and the on-disk metadata are all deferred
	 * to the first {@link sendMessage} via {@link _materializeProvisional}.
	 * Until then the chat occupies only an in-memory slot, so a workspace
	 * switch (or quick close) costs nothing on disk.
	 */
	private async _reserveChatBacking(chat: URI, context: IAgentChatContext, options: IAgentCreateChatOptions): Promise<IAgentCreateChatResult> {
		const session = context.configurationResource;
		const sessionId = AgentSession.id(session);
		this._logService.info(`[Copilot] Creating chat ${chat.toString()} with a deferred backing... ${options.model ? `model=${options.model.id}` : ''}`);
		const sdkSessionId = generateUuid();
		// Workspace-less is inferred at create from an absent input
		// `workingDirectory`: such a session is run in a stable scratch dir. The
		// AH service persists the marker centrally (`agentHost.workspaceless`) and
		// hands it back on restore; the agent only reads it (never persists it) to
		// pick the workspace-less system prompt.
		const isWorkspaceless = options.workingDirectories === undefined;
		const workingDirectory = await this._resolveCreateWorkingDirectory(options, sessionId, isWorkspaceless);
		await this._ensureClient();

		// Idempotency: a duplicate creation for a chat that has already been
		// promoted to a real SDK session (or restored from disk) is a no-op; we
		// return the non-provisional result so the caller doesn't re-fire
		// `SessionAdded`. This guards against client retries that race a
		// successful first message.
		const existing = this._findChatByUri(chat);
		if (existing) {
			this._logService.info(`[Copilot] createChat is a no-op: chat ${chat.toString()} is already backed by a live runtime`);
			const project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
			return {
				resolvedWorkingDirectory: workingDirectory,
				...(project ? { project } : {}),
				...this._chatBackingResult(sessionId, { sdkSessionId: existing.sessionId }),
			};
		}

		// Idempotent: a duplicate creation for a chat whose backing is still
		// reserved (e.g. a client retried on reconnect with the same URI) keeps
		// the existing record. We deliberately do NOT overwrite `model` or
		// `workingDirectory`: a re-create payload from a fresh connection sends
		// the eager-create defaults (model: undefined, the same workingDirectory),
		// which would clobber the user's selections accumulated since the
		// original create. The active-client / plugin sync below still runs so
		// the new connection's claim takes effect.
		const reserved = this._provisionalSessions.get(sessionId);

		// Seed active-client snapshot if the client claimed it eagerly. This
		// runs identically for reserved and real backings; the SDK side of
		// activeClient state isn't engaged until materialization.
		if (options.activeClient) {
			const ac = this._getOrCreateActiveClient(session, workingDirectory);
			// Multi-root: anchor discovery to the additional (non-primary) roots too, so a
			// still-provisional (pre-send) chat surfaces customizations from every folder — not
			// just the primary. Empty when single-root / gated off (byte-identical).
			ac.pluginController.setAdditionalDirectories(this._additionalCustomizationDirectories(options.workingDirectories));
			const seeded = options.activeClient;
			ac.toolSet.set(seeded.clientId, seeded.tools);
			ac.getOrCreateHandle(seeded.clientId, seeded.displayName);
			// A freshly-created session has exactly one chat — the exact target
			// the host provisioned it with — so seed the eager claimant's
			// membership with it. The host's first `session/activeClientSet`
			// fan-out replaces this with the authoritative catalog.
			this._adoptClientChats(ac, seeded.clientId, [chat]);
			if (seeded.customizations !== undefined) {
				// Eager pre-send claim: no session-state listener is hooked up
				// yet, so suppress action events. The session reads the final
				// view via its initial snapshot once it materializes.
				await ac.pluginController.sync(seeded.clientId, seeded.customizations, { quiet: true });
			}
		}

		// Compute project metadata cheaply from the original working dir.
		// Worktrees aren't created until materialization, so the project is
		// reported relative to the user's chosen folder.
		const project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);

		if (!reserved) {
			this._resetSessionLifetime(sessionId);
			this._provisionalSessions.set(sessionId, {
				sessionId,
				sdkSessionId,
				sessionUri: session,
				chat,
				workingDirectory,
				workingDirectories: options.workingDirectories,
				model: options.model,
				agent: options.agent,
				project,
				workspaceless: isWorkspaceless,
			});
			this._chatBackings.set(chat.toString(), { sdkSessionId });
		}

		this._logService.info(`[Copilot] Chat created; its backing stays deferred until the first send: ${session.toString()}`);
		return {
			resolvedWorkingDirectory: workingDirectory,
			provisional: true,
			...(project ? { project } : {}),
			...this._chatBackingResult(sessionId, { sdkSessionId: reserved?.sdkSessionId ?? sdkSessionId }),
		};
	}

	/** Mints the chat's backing from an imported conversation supplied by Agent Host. */
	private async _importChatBacking(chat: URI, context: IAgentChatContext, options: IAgentCreateChatOptions): Promise<IAgentCreateChatResult> {
		const session = context.configurationResource;
		const sessionId = AgentSession.id(session);
		const workingDirectory = await this._resolveCreateWorkingDirectory(options, sessionId, options.workingDirectories === undefined);
		await this._ensureClient();
		if (!this._findSessionBySdkId(sessionId) && !this._provisionalSessions.has(sessionId)) {
			this._resetSessionLifetime(sessionId);
		}
		// Thread the exact target `chat` through so the creation binds the
		// imported conversation directly during resume.
		return this._importConversation(options, sessionId, workingDirectory, chat);
	}

	/**
	 * Materializes an imported conversation into a real, editable Copilot
	 * session. Translates the supplied turns into a Copilot event log, seeds it
	 * at the CLI's native per-session store, then resumes the session so the
	 * SDK reconstitutes the turns as genuine backend events (editable / forkable
	 * / truncatable). The turns arrive with fresh UUID ids assigned by the
	 * service layer, so the seeded event ids and the seeded protocol turns stay
	 * aligned. The backing is minted immediately, so the chat is live when the
	 * creation resolves.
	 */
	private async _importConversation(options: IAgentCreateChatOptions, sessionId: string, workingDirectory: URI, chat: URI): Promise<IAgentCreateChatResult> {
		const importConfig = options.importConversation!;
		const sessionUri = AgentSession.uri(this.id, sessionId);
		return this._queueSession(sessionId, async () => {
			this._logService.info(`[Copilot] Importing conversation into session ${sessionId} (${importConfig.turns.length} turns)`);
			const model = importConfig.model ?? options.model;

			// Translate the conversation and seed it at the CLI's native
			// per-session store so a normal resume reconstitutes editable turns.
			// Detect the project concurrently with the (independent) event-log write
			// so the git probe and file I/O overlap on the session-creation path.
			const projectPromise = projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
			const eventsPath = join(getCopilotHomePath(this._environmentService.userHome.fsPath, process.env), 'session-state', sessionId, 'events.jsonl');
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
			await this._storeSessionMetadata(sessionUri, model, workingDirectory, options.workingDirectories ?? ([workingDirectory]), workingDirectory, project);
			if (options.agent !== undefined) {
				await this._storeSessionAgentMetadata(sessionUri, options.agent);
			}

			// Resume so the SDK loads the seeded history as editable turns. The
			// seeded event log lives at the session's own SDK id, so the resume
			// records that exact backing for the target chat.
			const imported = await this._resumeSession(sessionId, chat);
			this._logService.info(`[Copilot] Imported session created: ${sessionUri.toString()}`);
			return {
				resolvedWorkingDirectory: workingDirectory,
				...(project ? { project } : {}),
				...this._chatBackingResult(sessionId, { sdkSessionId: imported.sessionId }),
			};
		});
	}

	/**
	 * Whether an on-disk Copilot session was created by the VS Code extension-host
	 * Copilot CLI feature — identified by its `vscode.metadata.json` marker under
	 * `~/.copilot/session-state/<id>/`. Distinguishes EH CLI sessions (the only
	 * ones we migrate) from other Copilot SDK sessions that share the same store
	 * (standalone `copilot` CLI runs, Local agent sessions, …).
	 */
	/** Absolute path of the extension-host Copilot CLI `vscode.metadata.json` marker for `sessionId`. */
	private _extensionHostCliMarkerPath(sessionId: string): string {
		return join(getCopilotHomePath(this._environmentService.userHome.fsPath, process.env), 'session-state', sessionId, 'vscode.metadata.json');
	}

	/** Memoizes the (stable) marker check so repeated `listSessions` calls don't re-stat the disk. */
	private readonly _isExtensionHostCliSessionCache = new Map<string, Promise<boolean>>();

	private _isExtensionHostCliSession(sessionId: string): Promise<boolean> {
		let cached = this._isExtensionHostCliSessionCache.get(sessionId);
		if (!cached) {
			cached = fs.access(this._extensionHostCliMarkerPath(sessionId)).then(() => true, () => false);
			this._isExtensionHostCliSessionCache.set(sessionId, cached);
		}
		return cached;
	}

	/**
	 * Reads the VS Code-layer custom title the extension-host Copilot CLI feature
	 * persisted for `sessionId` in its `vscode.metadata.json` marker, so adoption
	 * can carry the user-chosen session name over to the agent host. Returns
	 * `undefined` when the marker is absent/unreadable or has no custom title.
	 */
	private async _readExtensionHostCliCustomTitle(sessionId: string): Promise<string | undefined> {
		try {
			const raw = await fs.readFile(this._extensionHostCliMarkerPath(sessionId), 'utf8');
			const title = (JSON.parse(raw) as { customTitle?: unknown }).customTitle;
			return typeof title === 'string' && title.trim() ? title : undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * Adopt-on-open for legacy extension-host Copilot CLI sessions. If `session`
	 * has an on-disk SDK event log (`~/.copilot/session-state/<id>/`) but no
	 * agent-host VS Code-layer metadata yet, seed that metadata in place — reusing
	 * the event log verbatim — so the normal restore flow can resume it as editable
	 * turns. Reports `adopted: true` iff it newly adopted the session (so the caller
	 * can run the one-time checkpoint bridge), and `eligible` whether the session
	 * was a genuine legacy candidate at all (vs already migrated / native / not an
	 * adoptable on-disk session).
	 */
	async ensureSessionAdopted(session: URI): Promise<IAgentSessionAdoptionResult> {
		const sessionId = AgentSession.id(session);
		return this._queueSession(sessionId, async () => {
			// A genuine native / already-adopted session always has a persisted
			// working directory. The session DB FILE can also exist without any
			// real metadata (checkpoint / changeset / git services create it via
			// `openDatabase`), so gate on `workingDirectory` — not mere DB
			// existence — to avoid falsely treating an empty DB as migrated.
			const existing = await this._readStoredSessionMetadata(session);
			if (existing?.workingDirectory) {
				return { adopted: false, eligible: false }; // already native / adopted
			}
			// Only migrate legacy EH Copilot CLI sessions — never other Copilot SDK
			// sessions (standalone CLI, Local agent, …) that share `~/.copilot`.
			if (!(await this._isExtensionHostCliSession(sessionId))) {
				return { adopted: false, eligible: false };
			}
			const client = await this._ensureClient();
			const sdkMetadata = await client.getSessionMetadata(sessionId).catch(() => undefined);
			const workingDirectory = typeof sdkMetadata?.context?.workingDirectory === 'string' ? URI.file(sdkMetadata.context.workingDirectory) : undefined;
			if (!workingDirectory) {
				// An eligible legacy session whose on-disk working directory could not
				// be resolved: a genuine migration candidate that did not migrate.
				return { adopted: false, eligible: true };
			}
			this._logService.info(`[Copilot] Adopting legacy session ${sessionId} in place (reusing on-disk events.jsonl)`);
			// Resolve the project from the SDK-derived cwd (authoritative) — the
			// caller may not have supplied a working directory (e.g. the chat
			// editor), so we cannot trust a hint.
			const project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
			// Carry over the user-chosen session name (EH `customTitle`) so the
			// adopted session keeps its title instead of regenerating one.
			const customTitle = await this._readExtensionHostCliCustomTitle(sessionId);
			// Seed VS Code-layer metadata only — the SDK event log on disk is
			// untouched. Writing `agentSessionData/<sanitizedId>/session.db` here
			// is also what makes the legacy extension-host Copilot CLI list stop
			// showing this session (it dedups against agent-host-owned session ids).
			// `isolation: 'folder'` keeps the session in place in the reused cwd —
			// a git repo would otherwise default to worktree and show a spurious
			// "Creating worktree…".
			await this._storeSessionMetadata(session, undefined, workingDirectory, [workingDirectory], workingDirectory, project, project !== undefined, { [SessionConfigKey.Isolation]: 'folder' }, customTitle);
			return { adopted: true, eligible: true };
		});
	}

	/**
	 * Promotes a {@link IProvisionalSession} into a real Copilot SDK session
	 * by performing the work {@link IAgentChats.createChat} defers when it stands
	 * a fresh session up: resolves the working directory (creating a worktree if
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
	 * {@link changeModel}). The latest provider-owned session config is read
	 * straight from the state manager via
	 * {@link IAgentConfigurationService.getSessionConfigValues} so any
	 * `SessionConfigChanged` actions that arrived after the creation are
	 * honoured without bespoke forwarding.
	 */
	private async _materializeProvisional(sessionId: string, resolvedWorkingDirectories?: readonly URI[]): Promise<CopilotAgentSession> {
		const provisional = this._provisionalSessions.get(sessionId);
		if (!provisional) {
			throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
		}
		const client = await this._ensureClient();
		const sessionUri = provisional.sessionUri;
		const sdkSessionId = provisional.sdkSessionId;

		// The host hands us the resolved working directories (an isolated worktree for
		// worktree isolation) on the first send; use index 0 (the process root) so the
		// SDK subprocess spawns in it. Falls back to the folder / scratch dir captured
		// at create time for folder / workspace-less sessions.
		const workingDirectory = resolvedWorkingDirectories?.[0] ?? provisional.workingDirectory;
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
		// Multi-root: anchor customization discovery to the additional workspace
		// roots (index 1..N of the resolved set). Empty when single-root / gated off.
		activeClient.pluginController.setAdditionalDirectories(this._additionalCustomizationDirectories(resolvedWorkingDirectories));
		// Advertise exactly the clients Agent Host fanned this chat out to.
		const snapshot = await activeClient.snapshot((this._findSessionChatUri(sessionUri) ?? sessionUri).toString());
		const shellManager = this._instantiationService.createInstance(ShellManager, sessionUri, workingDirectory);

		let agentSession: CopilotAgentSession | undefined;
		let agent: AgentSelection | undefined;
		try {
			const resolvedAgent = await this._resolveAgentWhenMaterializing(provisional, snapshot, workingDirectory);
			agent = resolvedAgent?.agent;
			const launchPlan: CopilotSessionLaunchPlan = {
				kind: 'create',
				client,
				sessionId: sdkSessionId,
				workingDirectory,
				additionalDirectories: this._additionalCustomizationDirectories(resolvedWorkingDirectories),
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
			const chatChannelUri = this._findBoundSessionChatUri(sdkSessionId) ?? sessionUri;
			agentSession = this._createAgentSession(launchPlan, customizationDirectory, activeClient, {
				sessionUri,
				chatChannelUri,
				resource: sessionUri,
			});
			await agentSession.initializeSession();
			this._registerInitializedSession(sdkSessionId, agentSession, activeClient, launchPlan.client);
		} catch (error) {
			agentSession?.dispose();
			throw error;
		}

		const project = await projectFromCopilotContext({ cwd: workingDirectory?.fsPath }, this._gitService);

		// The resolved root set (index 0 = process root, e.g. a worktree).
		// Shared by the persisted metadata, the baseline checkpoint and the
		// materialize receipt so all three agree on the same directories.
		const materializedWorkingDirectories = resolvedWorkingDirectories ?? ([workingDirectory]);

		this._provisionalSessions.delete(sessionId);
		await this._storeSessionMetadata(sessionUri, provisional.model, workingDirectory, materializedWorkingDirectories, customizationDirectory, project, true);
		if (agent !== undefined) {
			await this._storeSessionAgentMetadata(sessionUri, agent);
		}

		// Capture the per-session baseline (turn/0) git checkpoint so
		// per-turn diffs computed on `ChatTurnComplete` can reflect the
		// full working-tree delta — including terminal-tool edits that are
		// invisible to the FileEditTracker pipeline. Best-effort: a
		// non-git folder or capture failure leaves the session running
		// with the legacy `file_edits`-based per-turn diff path.
		//
		// The resolved directories are passed explicitly: the state manager
		// does not learn about them until it observes the materialize event
		// fired below, so a lookup here would still see the pre-worktree set.
		this._checkpointService.captureBaselineCheckpoint(sessionUri, materializedWorkingDirectories).catch(err => {
			this._logService.warn(`[Copilot:${sessionId}] Baseline checkpoint capture failed: ${err instanceof Error ? err.message : String(err)}`);
		});

		this._logService.info(`[Copilot] Session materialized: ${sessionUri.toString()}`);
		// Emit the resolved working-directory set (index 0 = process root). The host
		// replaces index 0 of the session set with it, preserving the tail.
		this._onDidMaterializeSession.fire({ session: sessionUri, resource: provisional.chat, project, workingDirectories: materializedWorkingDirectories });
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
		// Isolation / branch are contributed by the host (see
		// AgentService._withIsolationSchema); this agent only owns its platform
		// session config (auto-approve / mode / permissions).
		const values = platformSessionSchema.validateOrDefault(migrateLegacyAutopilotConfig(params.config), {
			[SessionConfigKey.AutoApprove]: 'default' satisfies AutoApproveLevel,
			[SessionConfigKey.Mode]: 'interactive' satisfies SessionMode,
			// Permissions intentionally omitted — leave unset so auto-approval
			// falls through to the host-level `permissions` default, and only
			// materializes on the session once the user hits "Allow in this
			// Session".
		});

		return {
			schema: platformSessionSchema.toProtocol(),
			values,
		};
	}

	getInheritedSessionConfig(config: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined {
		const inherited: Record<string, unknown> = {};
		for (const key of [SessionConfigKey.AutoApprove, SessionConfigKey.Permissions]) {
			if (config[key] !== undefined) {
				inherited[key] = config[key];
			}
		}
		return Object.keys(inherited).length > 0 ? inherited : undefined;
	}

	async sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		// Branch completions (the only dynamic Copilot property) are owned by the
		// host now; no provider-specific completions remain.
		return { items: [] };
	}

	/**
	 * @param chats The exact chats this client contributes to, owned and fanned
	 * out by Agent Host and never empty. It is the authoritative *replacement*
	 * for this client's membership, recorded on the session's
	 * {@link ActiveClient} and consumed in two places: it scopes the tools a
	 * chat advertises to its SDK session ({@link ActiveClient.toolsForChat},
	 * applied at launch and reconciled by {@link ActiveClient.requiresRestart}),
	 * and it filters client-tool ownership at stamp time
	 * ({@link ActiveClient.contributesTo}) so a tool call issued by one chat is
	 * never attributed to — and therefore dispatched to — a client the host did
	 * not fan that chat out to. The provider neither synthesizes a default-chat
	 * URI nor discovers sibling chats to extend the set; when the catalog grows
	 * the host re-invokes this with the complete new set.
	 * @param hostCustomizations The owning session's last host-published
	 * customization snapshot (Section 8b), retained so provider-internal work reads
	 * it instead of shared host state. Copilot's customization state is
	 * session-scoped (one {@link SessionPluginController} shared by every chat
	 * in the session), so it reaches exactly the chats `chats` enumerates.
	 */
	getOrCreateActiveClient(session: URI, client: { readonly clientId: string; readonly displayName?: string }, chats: readonly URI[], hostCustomizations?: readonly Customization[]): IActiveClient {
		this._rememberHostCustomizations(session, hostCustomizations);
		const activeClient = this._getOrCreateActiveClient(session, undefined);
		this._adoptClientChats(activeClient, client.clientId, chats);
		// Anchor the customization directory (best-effort, idempotent) so
		// session-discovered customizations surface alongside this client's,
		// mirroring the previous eager resolution in `setClientCustomizations`.
		if (!activeClient.pluginController.directory) {
			this._getSessionCustomizationAnchors(session).then(
				anchors => {
					activeClient.pluginController.setDirectory(anchors.directory);
					if (anchors.applyAdditional) {
						activeClient.pluginController.setAdditionalDirectories(anchors.additionalDirectories);
					}
				},
				() => { /* best-effort anchoring */ },
			);
		}
		return activeClient.getOrCreateHandle(client.clientId, client.displayName);
	}

	/**
	 * Records the host's authoritative chat membership for `clientId`.
	 *
	 * An empty set would mean "this client contributes to nothing", which the
	 * host never publishes — it withholds the fan-out entirely while it has no
	 * membership to hand over. Treat it as a protocol violation and keep the
	 * last authoritative set rather than silently dropping the client's
	 * contributions from every chat.
	 *
	 * Chats that newly enter the membership need no eager push: their live
	 * runtimes advertise a chat-scoped snapshot and reconcile it against the
	 * new membership on their next interaction (see
	 * {@link ActiveClient.requiresRestart}), while client-tool ownership is
	 * resolved against the membership at stamp time.
	 */
	private _adoptClientChats(activeClient: ActiveClient, clientId: string, chats: readonly URI[]): void {
		if (chats.length === 0) {
			this._logService.warn(`[Copilot] Ignoring empty active-client chat membership for client ${clientId}; keeping the last host-published set`);
			return;
		}
		const added = activeClient.setClientChats(clientId, chats);
		if (added.length > 0) {
			this._logService.info(`[Copilot] Active client ${clientId} now contributes to ${chats.length} chat(s); newly reachable: [${added.map(chat => chat.toString()).join(', ')}]`);
		}
	}

	removeActiveClient(session: URI, clientId: string): void {
		const sessionId = AgentSession.id(session);
		this._logService.info(`[Copilot:${sessionId}] removeActiveClient: clientId=${clientId}`);
		this._activeClients.get(session)?.removeClient(clientId);
	}

	/**
	 * Resolves a completed client tool call onto the runtime that owns it.
	 *
	 * `chat` is the host-resolved *routing* target — for a tool call addressed
	 * to a subagent chat the host already resolved it to the ancestor chat
	 * whose runtime owns the call — so the exact chat backing answers almost
	 * every case. `context` describes the chat the call was *addressed* to,
	 * and carries the subagent's `Tool` origin, so the spawning chat is
	 * recovered from that explicit host fact rather than by parsing the
	 * addressed URI. The last resort is the owning session's session-backed
	 * chat, taken from the same context.
	 */
	onClientToolCallComplete(session: URI, chat: URI, toolCallId: string, result: ToolCallResult, context?: IAgentChatContext): void {
		const spawnedFrom = resolveSubagentChatParent(context);
		const owner = context?.configurationResource ?? session;
		const target = this._findChatByUri(chat)
			?? (spawnedFrom ? this._findChatByUri(spawnedFrom.chat) : undefined)
			?? this._findSessionChat(owner);
		target?.handleClientToolCallComplete(toolCallId, result);
	}

	private async _sendMessage(chat: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, senderClientId?: string, clientType = AgentHostClientType.Unknown, workingDirectories?: readonly URI[], operationContext?: URI | IAgentChatContext): Promise<void> {
		try {
			await this._sendMessageOnce(chat, prompt, attachments, turnId, senderClientId, clientType, workingDirectories, operationContext);
		} catch (error) {
			const recovery = await this._recoverFromClosedConnection(error, 'sendMessage', this._clientFailureCorrelation(chat, turnId, operationContext));
			if (turnId && recovery?.failedTurnIds.has(turnId)) {
				return;
			}
			throw error;
		}
	}

	private async _sendMessageOnce(chat: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, senderClientId?: string, clientType = AgentHostClientType.Unknown, workingDirectories?: readonly URI[], operationContext?: URI | IAgentChatContext): Promise<void> {
		const context = this._resolveChatContext(chat, operationContext);
		await this._queueChat(context.configurationId, context.sequencerKey, async () => {
			await this._activeClients.get(context.configurationResource)?.pluginController.retryFailedClientSyncIfNeeded();

			let entry: CopilotAgentSession | undefined = this._resolveChatContext(chat, operationContext).target;
			if (!entry) {
				entry = await this._ensureResolvedChatSession(this._resolveChatContext(chat, operationContext), workingDirectories);
			}

			// If the active client's config changed (tools or plugins),
			// dispose this session so it gets resumed with the updated config.
			const activeClient = this._activeClients.get(context.configurationResource);
			const hadCachedEntry = !!entry;
			this._logService.info(`[Copilot:${context.configurationId}] sendMessage: cachedEntry=${hadCachedEntry}, hasActiveClient=${!!activeClient}, activeClientId=${activeClient ? '(set)' : '(none)'}`);
			const rootsChanged = !!entry && workingDirectories !== undefined && !areAdditionalWorkingDirectoriesEqual(entry.appliedAdditionalDirectories, this._additionalCustomizationDirectories(workingDirectories));
			const structuralConfigChanged = !!entry && !!activeClient && await activeClient.requiresRestart(entry.appliedSnapshot, context.chatKey);
			if (entry && (rootsChanged || structuralConfigChanged)) {
				this._logService.info(`[Copilot:${context.configurationId}] Session configuration changed, refreshing session. clients=[${activeClient ? [...activeClient.toolSet.clientIds()].join(', ') || '(none)' : '(none)'}]`);
				// Finish disconnecting before resuming the SAME SDK session id with
				// the updated config. Routing is preserved so the session identity
				// is recoverable; peer chats keep their own entries and are left
				// intact. Resume explicitly (rather than via the generic re-resolve
				// below) so the refreshed config is re-applied deterministically.
				await this._destroyLiveSession(entry, true);
				if (entry.sessionId === context.configurationId) {
					entry = await this._resumeSession(context.configurationId, context.chat, workingDirectories);
				} else {
					if (workingDirectories) {
						activeClient?.pluginController.setAdditionalDirectories(this._additionalCustomizationDirectories(workingDirectories));
					}
					entry = await this._ensureResolvedChatSession(this._resolveChatContext(chat, operationContext), workingDirectories);
				}
			}
			if (!entry) {
				this._logService.info(`[Copilot:${context.configurationId}] No cached entry${hadCachedEntry ? ' (was evicted by requiresRestart)' : ''}, calling _resumeSession`);
			}
			entry ??= await this._ensureResolvedChatSession(this._resolveChatContext(chat, operationContext), workingDirectories);
			if (!entry) {
				throw new Error(`[Copilot] sendMessage for unknown chat: ${chat.toString()}`);
			}

			// Reset per-turn streaming state on the session so that the
			// next text/reasoning chunk (and any host-emitted announcement)
			// allocates a fresh response part.
			if (turnId) {
				entry.resetTurnState(turnId, senderClientId, clientType);
			}

			try {
				const sdkMode = this._resolveSdkMode(context.configurationResource);
				const sideChat = this._chatBackings.get(context.chatKey)?.sideChat;
				const turns = sideChat ? await entry.getMessages() : [];
				const sdkPrompt = prepareSideChatPrompt(prompt, turns, sideChat);
				await entry.send(sdkPrompt, attachments, turnId, sdkMode, senderClientId, clientType);
			} catch (err) {
				const errCode = (err as { code?: number })?.code;
				const errMsg = err instanceof Error ? err.message : String(err);
				this._logService.error(`[Copilot:${context.configurationId}] entry.send() failed: code=${errCode}, message=${errMsg}, hadCachedEntry=${hadCachedEntry}, errorType=${err?.constructor?.name}`);
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

	/**
	 * Reads the session's current `mode` and `autoApprove` axis values so the
	 * slash-command completion provider can hide config-action toggles that would
	 * be a no-op (e.g. `/autopilot on` while already in autopilot).
	 */
	private _getSessionConfigState(sessionId: string): ICopilotConfigSlashCommandState {
		const sessionKey = AgentSession.uri(this.id, sessionId).toString();
		return {
			mode: this._configurationService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Mode),
			autoApprove: this._configurationService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.AutoApprove),
		};
	}

	setPendingMessages(chat: URI, steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
		const backing = this._chatBackings.get(chat.toString());
		const target = backing ? this._findSessionBySdkId(backing.sdkSessionId) : undefined;
		if (!target) {
			this._logService.warn(`[Copilot] setPendingMessages: chat not found for ${chat.toString()}`);
			return;
		}

		// Steering: send with mode 'immediate' so the SDK injects it mid-turn
		if (steeringMessage) {
			target.sendSteering(steeringMessage);
		}

		// Queued messages are consumed by the server (AgentSideEffects)
		// which dispatches ChatTurnStarted and calls sendMessage directly.
		// No SDK-level enqueue is needed.
	}

	private async _getChatMessages(chat: URI, sessionOrContext?: URI | IAgentChatContext): Promise<readonly Turn[]> {
		if (this._isShuttingDown) {
			return [];
		}
		// A subagent transcript is identified by its host-supplied tool spawn
		// edge, never by recognizing a shape in the addressed URI.
		if (resolveSubagentChatParent(sessionOrContext)) {
			return this._getSubagentChatMessages(chat, sessionOrContext);
		}
		if (!sessionOrContext && !this._chatBackings.has(chat.toString()) && !this._findChatByUri(chat)) {
			return [];
		}
		const context = this._resolveChatContext(chat, sessionOrContext);
		if (this._provisionalSessions.get(context.configurationId)?.sdkSessionId === context.sdkSessionId) {
			return [];
		}
		const entry = await this._queueChat(context.configurationId, context.sequencerKey, async () => {
			return this._ensureResolvedChatSession(this._resolveChatContext(chat, sessionOrContext)).catch(err => {
				if (err instanceof SessionWorkingDirectoryMissingError) {
					throw err;
				}
				if (context.sdkSessionId) {
					throw err;
				}
				this._logService.warn(`[Copilot:${context.configurationId}] Failed to resolve chat for message lookup`, err);
				return undefined;
			});
		});
		if (!entry) {
			return [];
		}
		const turns = await entry.getMessages();
		const sideChat = this._chatBackings.get(context.chatKey)?.sideChat;
		return stripSideChatContext(turns.slice(sideChat?.inheritedTurnCount ?? 0), sideChat);
	}

	/**
	 * Reconstructs a subagent chat's turns by filtering the spawning chat's
	 * SDK event log by the tool call that started it.
	 *
	 * The spawn edge is *required* and comes only from the host-supplied
	 * {@link IAgentChatContext.origin}: Agent Host stamps a `Tool` origin on
	 * every subagent chat it addresses, including the legacy restore path that
	 * still addresses a subagent *session* URI. Without it the provider has no
	 * host fact naming the spawning chat, and it will not go looking for one in
	 * the URI's shape, so the read resolves to no turns.
	 */
	private async _getSubagentChatMessages(chat: URI, sessionOrContext?: URI | IAgentChatContext): Promise<readonly Turn[]> {
		const spawnedFrom = resolveSubagentChatParent(sessionOrContext);
		if (!spawnedFrom) {
			this._logService.warn(`[Copilot] Subagent chat ${chat.toString()} addressed without its host-supplied tool-call origin; no turns to reconstruct`);
			return [];
		}
		const owner = resolveAgentChatContext(sessionOrContext ?? chat, chat).configurationResource;
		const parentContext = this._resolveChatContext(spawnedFrom.chat, { configurationResource: owner, resource: owner });
		const parentEntry = await this._ensureResolvedChatSession(parentContext).catch(err => {
			this._logService.warn(`[Copilot:${parentContext.sdkSessionId ?? parentContext.configurationId}] Failed to resume exact source chat for subagent restore`, err);
			return undefined;
		});
		return parentEntry?.getSubagentMessages(spawnedFrom.toolCallId) ?? [];
	}

	/**
	 * Finalizes session-scoped resources after Agent Host has disposed every
	 * chat in the session through {@link IAgentChats.disposeChat}. Destructive
	 * per-session teardown is not a provider entry point: the host owns the
	 * session's chat catalog, so nothing here has to rebuild a default-chat URI
	 * to reach the session's own chat.
	 */
	async finalizeSession(session: URI, context?: { readonly workspaceless?: boolean }): Promise<void> {
		await this._finalizeSession(session, context?.workspaceless === true);
	}

	private async _finalizeSession(session: URI, workspacelessHint: boolean): Promise<void> {
		const sessionId = AgentSession.id(session);
		const isWorkspaceless = workspacelessHint
			|| this._provisionalSessions.get(sessionId)?.workspaceless === true
			|| (await this._readSessionMetadata(session).catch(() => undefined))?.workspaceless === true;
		this._provisionalSessions.delete(sessionId);
		await this._sessionLifetimes.get(sessionId)?.dispose(async () => { });
		this._activeClients.get(session)?.dispose();
		this._activeClients.delete(session);
		this._hostCustomizations.delete(session);
		if (isWorkspaceless) {
			await this._cleanupWorkspacelessScratchDir(this._workspacelessScratchDir(sessionId), sessionId);
		}
		this._otelService.releaseSessionTraceContext(session.toString());
		await this._applyPendingClientRestart();
	}

	private async _abortSession(chat: URI, operationContext?: URI | IAgentChatContext): Promise<void> {
		if (!operationContext) {
			const backing = this._chatBackings.get(chat.toString());
			if (!backing || !this._findSessionBySdkId(backing.sdkSessionId)) {
				return;
			}
		}
		try {
			await this._abortSessionOnce(chat, operationContext);
		} catch (error) {
			const correlation = this._clientFailureCorrelation(chat, undefined, operationContext);
			if (!isCopilotConnectionClosedError(error)) {
				await this._recoverFromClosedConnection(error, 'abort', correlation);
				throw error;
			}
			this._resolveChatContext(chat, operationContext).target?.discardActiveTurn();
			if (!await this._recoverFromClosedConnection(error, 'abort', correlation)) {
				throw error;
			}
		}
	}

	private async _abortSessionOnce(chat: URI, operationContext?: URI | IAgentChatContext): Promise<void> {
		const context = this._resolveChatContext(chat, operationContext);
		await this._queueChat(context.configurationId, context.sequencerKey, async () => {
			await this._resolveChatContext(chat, operationContext).target?.abort();
		});
	}

	/**
	 * Mints the chat's exact SDK backing now and records it against the chat's
	 * URI: forked from a source chat, branched as a side chat, or created
	 * empty. Every input (working directories, model, agent, fork / side-chat
	 * source) arrives fully resolved from Agent Host.
	 *
	 * One fork algorithm serves every fork: the source chat's SDK conversation
	 * is forked at the requested turn and its database copied into this chat's
	 * storage scope. A fork whose source lives in another session is the
	 * creation that brings that history into a session the agent does not back
	 * yet, so it additionally inherits the source's process root, model and
	 * custom agent, persists the new session's metadata, carries the reviewed
	 * ref over, and reports the session facts it resolved.
	 */
	private async _mintChatBacking(chat: URI, context: IAgentChatContext, options: IAgentCreateChatOptions): Promise<IAgentCreateChatResult> {
		const chatKey = chat.toString();
		const session = context.configurationResource;
		const sessionId = AgentSession.id(session);
		const fork = options.fork;
		// A fork's source may live in another session; its scope was recorded
		// when that source chat was created or materialized (never derived
		// from the chat URI's shape).
		const forkSourceScope = fork ? this._resolveChatScope(fork.source) : undefined;
		const forkSourceSessionId = forkSourceScope ? AgentSession.id(forkSourceScope) : undefined;
		const inheritsFromOtherSession = !!fork && forkSourceSessionId !== sessionId;
		const existingBacking = this._chatBackings.get(chatKey);
		if (existingBacking) {
			return this._existingMintedChatResult(session, sessionId, existingBacking, inheritsFromOtherSession);
		}
		if (fork && isEqual(fork.source, chat)) {
			throw new Error(`Cannot fork Copilot chat ${chatKey} onto itself`);
		}
		let result: IAgentCreateChatResult | undefined;
		// A fork reads the source's state, so it serializes against the source's
		// session; a side chat runs on its own chat sequencer so it never blocks
		// the chat it branches from.
		const queue = <T>(task: () => Promise<T>) => options.sideChat
			? this._queueChat(sessionId, chatKey, task)
			: this._queueSession(forkSourceSessionId ?? sessionId, task);
		await queue(async () => {
			const existing = this._chatBackings.get(chatKey);
			if (existing) {
				result = await this._existingMintedChatResult(session, sessionId, existing, inheritsFromOtherSession);
				return;
			}
			// A fork runs where its source runs, so it resolves the source's
			// process root; every other chat consumes index 0 of the host's
			// resolved set without reading any session state back.
			const workingDirectory = inheritsFromOtherSession
				? await this._resolveCreateWorkingDirectory(options, sessionId, false)
				: options.workingDirectories?.[0];
			if (!workingDirectory) {
				throw new Error(`[Copilot] createChat: missing resolved working directory for session ${session.toString()}`);
			}
			const sourceMetadata = inheritsFromOtherSession ? await this._readSessionMetadata(forkSourceScope!) : undefined;
			const model = options.model ?? sourceMetadata?.model;
			const agent = options.agent ?? sourceMetadata?.agent;
			const client = await this._ensureClient();
			const chatSdkId = generateUuid();
			// Chat backings share the owning session's ActiveClient so that
			// client tool / customization updates (which are keyed by the
			// session URI via the active-client handles) reach the addressed
			// SDK chat. Keying it by the chat URI instead would
			// snapshot empty/stale tools and never see subsequent updates, and
			// would also leak (nothing disposes a chat-keyed ActiveClient).
			const activeClient = this._getOrCreateActiveClient(session, workingDirectory);
			const snapshot = await activeClient.snapshot(chatKey);
			const shellManager = this._instantiationService.createInstance(ShellManager, chat, workingDirectory);
			// The database copy lands in the storage scope Agent Host chose for
			// this chat, which is also the scope its runtime reads and writes.
			const storageScope = context.resource;

			// Forking: mint the new chat's backing by forking the source chat's
			// SDK conversation at the requested turn (copying its database into
			// this chat's storage scope), then resume it. Otherwise spin up a
			// fresh empty chat.
			let launchPlan: CopilotSessionLaunchPlan;
			let sdkSessionId: string;
			let sideChat: IPersistedChat['sideChat'];
			let sourceEntry: CopilotAgentSession | undefined;
			if (fork) {
				sourceEntry = await this._ensureResolvedChatSession(this._resolveChatContext(fork.source, { configurationResource: forkSourceScope!, resource: forkSourceScope! }));
				if (!sourceEntry) {
					throw new Error(`[Copilot] createChat fork: source chat ${fork.source.toString()} not found`);
				}
				const forked = await this._forkSdkChat(client, sourceEntry, fork.turnId, this._sessionDataService.getSessionDataDir(storageScope));
				sdkSessionId = forked.sessionId;
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
			} else if (options.sideChat) {
				const sideChatSource = await this._ensureResolvedChatSession(this._resolveChatContext(options.sideChat.source, { configurationResource: session, resource: session }));
				if (!sideChatSource) {
					throw new Error(`[Copilot] createChat side chat: source chat ${options.sideChat.source.toString()} not found`);
				}
				const forked = await this._forkSdkChat(client, sideChatSource, options.sideChat.providerAnchorTurnId ?? options.sideChat.turnId, this._sessionDataService.getSessionDataDir(storageScope));
				sdkSessionId = forked.sessionId;
				sideChat = {
					source: options.sideChat.source.toString(),
					turnId: options.sideChat.turnId,
					...(options.sideChat.selection ? { selection: options.sideChat.selection } : {}),
					...(options.sideChat.providerAnchorTurnId ? { providerAnchorTurnId: options.sideChat.providerAnchorTurnId } : {}),
					inheritedTurnCount: forked.inheritedTurnCount,
					...(options.sideChat.sourceContext ? { context: options.sideChat.sourceContext } : {}),
					...(options.sideChat.partialResponse ? { partialResponse: options.sideChat.partialResponse } : {}),
				};
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

			// The inherited history now lives in a session the agent has no
			// metadata for, so persist what a later resume needs before the
			// runtime starts.
			let project: IAgentSessionProjectInfo | undefined;
			if (inheritsFromOtherSession) {
				project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
				const inheritedWorkingDirectories = sourceMetadata?.workingDirectories
					?? (sourceEntry?.workingDirectory ? [sourceEntry.workingDirectory] : [workingDirectory]);
				await this._storeSessionMetadata(session, model, workingDirectory, inheritedWorkingDirectories, workingDirectory, project);
				if (agent !== undefined) {
					await this._storeSessionAgentMetadata(session, agent);
				}
			}

			let agentSession: CopilotAgentSession | undefined;
			try {
				agentSession = this._createAgentSession(launchPlan, workingDirectory, activeClient, { sessionUri: session, chatChannelUri: chat, resource: storageScope });
				await agentSession.initializeSession();
				if (sideChat) {
					sideChat = { ...sideChat, inheritedTurnCount: (await agentSession.getMessages()).length };
				}
				if (fork?.turnIdMapping) {
					await agentSession.remapTurnIds(fork.turnIdMapping);
				}
				this._throwIfClientReplaced(client, agentSession);
				this._registerLiveChat(chat, agentSession, activeClient);
				const backing: IPersistedChat = { sdkSessionId, ...(model ? { model } : {}), ...(agent ? { agent } : {}), ...(sideChat ? { sideChat } : {}) };
				this._chatBackings.set(chatKey, backing);
				result = {
					...(inheritsFromOtherSession ? { resolvedWorkingDirectory: workingDirectory, ...(project ? { project } : {}) } : {}),
					...this._chatBackingResult(sessionId, backing),
				};
				this._logService.info(`[Copilot] Created chat backing ${chatKey} for context ${session.toString()}${fork ? ' (forked)' : ''}`);
			} catch (error) {
				agentSession?.dispose();
				throw error;
			}

			if (inheritsFromOtherSession) {
				// Copy the source session's reviewed ref so the fork starts with
				// the parent's review progress (best-effort; a failure just means
				// the fork starts unreviewed).
				try {
					await this._reviewService.copyReviewedRef(forkSourceScope!.toString(), session.toString(), workingDirectory);
				} catch (err) {
					this._logService.warn(`[Copilot] Failed to copy reviewed ref for fork: ${err instanceof Error ? err.message : String(err)}`);
				}
			}
		});
		if (!result) {
			throw new Error(`[Copilot] createChat: no backing was recorded for ${chatKey}`);
		}
		return result;
	}

	private async _existingMintedChatResult(session: URI, sessionId: string, backing: IPersistedChat, includeSessionMetadata: boolean): Promise<IAgentCreateChatResult> {
		const result = this._chatBackingResult(sessionId, backing);
		if (!includeSessionMetadata) {
			return result;
		}
		const metadata = await this._readStoredSessionMetadata(session);
		return {
			...(metadata?.workingDirectory ? { resolvedWorkingDirectory: metadata.workingDirectory } : {}),
			...(metadata?.project ? { project: metadata.project } : {}),
			...result,
		};
	}

	/**
	 * Resolves the live SDK session for the addressed chat from the exact
	 * chat backing or from a live direct-create leaf. Never recovers ownership
	 * by parsing the chat URI.
	 */
	private async _ensureResolvedChatSession(context: IResolvedCopilotChatContext, workingDirectories?: readonly URI[]): Promise<CopilotAgentSession | undefined> {
		const provisional = this._provisionalSessions.get(context.configurationId);
		if (provisional && provisional.sdkSessionId === context.sdkSessionId) {
			return this._materializeProvisional(context.configurationId, workingDirectories);
		}
		if (context.sdkSessionId === context.configurationId) {
			return context.target ?? this._resumeSession(context.configurationId, context.chat, workingDirectories);
		}
		if (context.sdkSessionId) {
			const lifetime = this._getOrCreateSessionLifetime(context.sdkSessionId);
			const lease = await lifetime?.acquire();
			if (!lease) {
				return undefined;
			}
			try {
				const target = this._findChatByUri(context.chat);
				if (target) {
					return target;
				}
				return this._resolveOrResumeChatSession(context, workingDirectories);
			} finally {
				lease.dispose();
			}
		}
		return context.target;
	}

	/**
	 * Forks {@link sourceEntry}'s SDK chat at {@link turnId} via the
	 * SDK `sessions.fork` RPC and copies its database into {@link targetDbDir}
	 * so the forked chat inherits turn event IDs and file-edit
	 * snapshots. Returns the new SDK session id.
	 */
	private async _forkSdkChat(client: CopilotClient, sourceEntry: CopilotAgentSession, turnId: string, targetDbDir: URI): Promise<{ sessionId: string; inheritedTurnCount: number }> {
		const sourceTurns = await sourceEntry.getMessages();
		const sourceTurnIndex = sourceTurns.findIndex(turn => turn.id === turnId);
		const inheritedTurnCount = sourceTurnIndex === -1 ? sourceTurns.length : sourceTurnIndex + 1;
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
		return { sessionId: newSessionId, inheritedTurnCount };
	}

	private async _disposeChat(chat: URI, operationContext?: URI | IAgentChatContext, coordinated = false): Promise<void> {
		const initial = this._resolveChatContext(chat, operationContext);
		const configurationId = initial.configurationId;
		const lifetimeId = initial.sdkSessionId ?? configurationId;
		const chatKey = chat.toString();
		if (!coordinated) {
			const lifetime = this._getOrCreateSessionLifetime(lifetimeId);
			if (!lifetime) {
				return;
			}
			return lifetime.release(() => this._disposeChat(chat, operationContext, true));
		}
		await this._queueChat(configurationId, initial.sequencerKey, async () => {
			const current = this._resolveChatContext(chat, operationContext);
			const target = current.target;
			const backing = this._chatBackings.get(chatKey);
			const provisional = this._provisionalSessions.get(configurationId);
			const isProvisional = provisional?.chat.toString() === chatKey;
			const sdkSessionId = target?.sessionId ?? backing?.sdkSessionId;

			if (sdkSessionId && !isProvisional) {
				await this._deleteSdkSession(sdkSessionId, chatKey);
			}

			if (isProvisional) {
				this._provisionalSessions.delete(configurationId);
			}
			this._chatBackings.delete(chatKey);
			this._chatScopes.delete(chatKey);

			if (target) {
				await this._destroyLiveSession(target, true);
			}

		});
	}

	/**
	 * Deletes an SDK session, tolerating one that was already removed. The SDK's
	 * `deleteSession` throws for both a genuine failure and a missing session, so
	 * a real failure is propagated (preserving routing/state for a retry) while a
	 * confirmed-gone session is swallowed to keep a partially-completed multi-chat
	 * teardown retry-safe.
	 */
	private async _deleteSdkSession(sdkSessionId: string, chatKey: string): Promise<void> {
		const client = await this._ensureClient();
		try {
			await client.deleteSession(sdkSessionId);
		} catch (err) {
			// Only a session the SDK confirms is gone is safe to swallow; if we can't confirm, propagate.
			if (await client.getSessionMetadata(sdkSessionId).then(metadata => !!metadata, () => true)) {
				throw err;
			}
			this._logService.info(`[Copilot] SDK session ${sdkSessionId} already deleted; chat ${chatKey} disposal is idempotent`);
		}
	}

	private async _releaseChat(chat: URI, operationContext?: URI | IAgentChatContext): Promise<void> {
		const initial = this._resolveChatContext(chat, operationContext);
		const lifetime = this._getOrCreateSessionLifetime(initial.sdkSessionId ?? initial.configurationId);
		if (!lifetime) {
			return;
		}
		await lifetime.release(async () => {
			const target = this._resolveChatContext(chat, operationContext).target;
			if (!target || target.hasActiveTurn) {
				return;
			}
			await this._destroyLiveSession(target, true);
		});
	}

	/**
	 * Re-attaches a concrete chat backing on session
	 * restore, decoding the opaque `providerData` the orchestrator persisted
	 * at creation (or the latest {@link onDidChangeChatData}). After this
	 * resolves the chat's backing SDK session can be resumed lazily on its first
	 * send. Best-effort — a corrupt/unknown blob is logged and dropped rather
	 * than thrown.
	 */
	async materializeChat(chat: URI, context: URI | IAgentChatContext, providerData: string | undefined): Promise<void> {
		this._noteHostCustomizations(context);
		this._rememberChatScope(chat, resolveAgentChatContext(context, chat).configurationResource);
		const chatKey = chat.toString();
		if (providerData === undefined) {
			return;
		}
		const backing = decodeProviderData(providerData);
		if (!backing) {
			this._logService.warn(`[Copilot] materializeChat: dropping corrupt providerData for ${chatKey}`);
			return;
		}
		this._chatBackings.set(chatKey, backing);
	}

	async recoverLegacyChat(chat: URI, context: URI | IAgentChatContext): Promise<IAgentCreateChatResult> {
		const resolved = resolveAgentChatContext(context, chat);
		this._rememberChatScope(chat, resolved.configurationResource);
		const backing = { sdkSessionId: AgentSession.id(resolved.configurationResource) };
		this._chatBackings.set(chat.toString(), backing);
		return { providerData: encodeProviderData(backing) };
	}

	/**
	 * Migration-only enumeration of the session's legacy chat backings from
	 * `copilot.chats`, mapping each entry to its channel URI and the same opaque
	 * `providerData` blob {@link materializeChat} decodes. The orchestrator
	 * calls this once to drain the legacy codec into its own catalog.
	 */
	async listLegacyChats(session: URI): Promise<readonly IAgentLegacyChat[]> {
		const persisted = await this._readLegacyChatBackings(session);
		const result: IAgentLegacyChat[] = [];
		for (const [chatId, info] of persisted) {
			result.push({ uri: URI.parse(buildChatUri(session, chatId)), providerData: encodeProviderData(info) });
		}
		return result;
	}

	private _getOrCreateSessionLifetime(sessionId: string): CopilotSessionLifetime | undefined {
		if (this._isShuttingDown) {
			return undefined;
		}
		let lifetime = this._sessionLifetimes.get(sessionId);
		if (!lifetime) {
			lifetime = new CopilotSessionLifetime();
			this._sessionLifetimes.set(sessionId, lifetime);
		}
		return lifetime;
	}

	private _resetSessionLifetime(sessionId: string): void {
		if (!this._isShuttingDown && this._sessionLifetimes.get(sessionId)?.isPermanentlyClosed) {
			this._sessionLifetimes.set(sessionId, new CopilotSessionLifetime());
		}
	}

	private _queueSession<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
		const lifetime = this._getOrCreateSessionLifetime(sessionId);
		return lifetime ? lifetime.queueSession(task) : Promise.reject(new CancellationError());
	}

	private _queueChat<T>(sessionId: string, chatKey: string, task: () => Promise<T>): Promise<T> {
		const lifetime = this._getOrCreateSessionLifetime(sessionId);
		return lifetime ? lifetime.queueChat(chatKey, task) : Promise.reject(new CancellationError());
	}

	/**
	 * Returns the live {@link CopilotAgentSession} for an exact chat, resuming
	 * its provider backing when necessary.
	 * Returns `undefined` when the chat has no known backing.
	 */
	private async _resolveOrResumeChatSession(context: IResolvedCopilotChatContext, workingDirectories?: readonly URI[]): Promise<CopilotAgentSession | undefined> {
		const { configurationResource, configurationId, chat, chatKey } = context;
		const existing = this._findChatByUri(chat);
		if (existing) {
			return existing;
		}
		const lifetime = this._getOrCreateSessionLifetime(context.sdkSessionId ?? configurationId);
		if (!lifetime) {
			return undefined;
		}
		return lifetime.resumePeer(chatKey, async () => {
			const lease = await lifetime.acquire();
			if (!lease) {
				return undefined;
			}
			let agentSession: CopilotAgentSession | undefined;
			try {
				const again = this._findChatByUri(chat);
				if (again) {
					return again;
				}
				const info = this._chatBackings.get(chatKey);
				if (!info) {
					return undefined;
				}
				const parentEntry = this._findSessionBySdkId(configurationId);
				const workingDirectory = workingDirectories?.[0] ?? parentEntry?.workingDirectory
					?? this._provisionalSessions.get(configurationId)?.workingDirectory
					?? (await this._readSessionMetadata(configurationResource)).workingDirectory;
				if (!workingDirectory) {
					this._logService.warn(`[Copilot] Cannot resume chat ${chatKey}: missing working directory`);
					return undefined;
				}
				const client = await this._ensureClient();
				const activeClient = this._getOrCreateActiveClient(configurationResource, workingDirectory);
				const snapshot = await activeClient.snapshot(chatKey);
				const shellManager = this._instantiationService.createInstance(ShellManager, chat, workingDirectory);
				const launchPlan: CopilotSessionLaunchPlan = {
					kind: 'resume',
					client,
					sessionId: info.sdkSessionId,
					workingDirectory,
					additionalDirectories: workingDirectories?.slice(1),
					resolvedAgentName: info.agent ? this._resolveAgentName(snapshot, info.agent) : undefined,
					snapshot,
					activeClientToolSet: activeClient.toolSet,
					shellManager,
					githubToken: this._githubToken,
					fallback: { model: info.model, longContextWindow: this._longContextWindowFor(info.model?.id), freeLongContext: this._isFreeLongContext(info.model?.id) },
				};
				agentSession = this._createAgentSession(launchPlan, workingDirectory, activeClient, { sessionUri: configurationResource, chatChannelUri: chat, resource: context.resource });
				await agentSession.initializeSession();
				this._throwIfClientReplaced(client, agentSession);
				this._registerLiveChat(chat, agentSession, activeClient);
				if (workingDirectories) {
					await this._storeSessionMetadata(context.resource, info.model, workingDirectory, workingDirectories, undefined, undefined);
				}
				this._logService.info(`[Copilot] Resumed chat backing ${chatKey} for configuration ${configurationResource.toString()}`);
				return agentSession;
			} catch (error) {
				agentSession?.dispose();
				this._logService.warn(`[Copilot] Failed to resume chat backing ${chatKey}: ${error instanceof Error ? error.message : String(error)}`);
				throw error;
			} finally {
				lease.dispose();
			}
		});
	}

	async truncateSession(session: URI, turnId: string | undefined, chat: URI, contextOrSession?: URI | IAgentChatContext): Promise<void> {
		const sessionId = AgentSession.id(session);
		const resolved = this._resolveChatContext(chat, contextOrSession ?? { configurationResource: session, resource: session });
		if (this._provisionalSessions.get(sessionId)?.chat.toString() === chat.toString()) {
			return;
		}
		await this._queueChat(resolved.configurationId, resolved.sequencerKey, async () => {
			this._logService.info(`[Copilot:${sessionId}] Truncating chat ${chat.toString()}${turnId !== undefined ? ` at turnId=${turnId}` : ' (all turns)'}`);

			const entry = await this._ensureResolvedChatSession(this._resolveChatContext(chat, contextOrSession ?? { configurationResource: session, resource: session }));
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

	private async _changeModel(chat: URI, model: ModelSelection, operationContext?: URI | IAgentChatContext): Promise<void> {
		try {
			await this._changeModelOnce(chat, model, operationContext);
		} catch (error) {
			if (!await this._recoverFromClosedConnection(error, 'changeModel', this._clientFailureCorrelation(chat, undefined, operationContext))) {
				throw error;
			}
			await this._changeModelOnce(chat, model, operationContext);
		}
	}

	private async _changeModelOnce(chat: URI, model: ModelSelection, operationContext?: URI | IAgentChatContext): Promise<void> {
		const context = this._resolveChatContext(chat, operationContext);
		await this._queueChat(context.configurationId, context.sequencerKey, async () => {
			const current = this._resolveChatContext(chat, operationContext);
			const longContextWindow = this._longContextWindowFor(model.id);
			const freeLongContext = this._isFreeLongContext(model.id);
			// Same override the launcher applies at create (validated + logged by
			// resolveCopilotReasoningEffort); computed at the point of use so the
			// provisional-session path doesn't resolve or log it prematurely.
			const provisional = this._provisionalSessions.get(current.configurationId);
			if (provisional) {
				provisional.model = model;
			} else {
				const entry = current.target ?? await this._ensureResolvedChatSession(current);
				await entry?.setModel(model.id, resolveCopilotReasoningEffort(model, this._configurationService, this._logService, current.configurationId), getCopilotContextTier(model, longContextWindow, freeLongContext));
			}
			const backing = this._chatBackings.get(current.chatKey);
			if (backing) {
				const updated: IPersistedChat = { ...backing, model };
				this._chatBackings.set(current.chatKey, updated);
				this._onDidChangeChatData.fire({ chat, providerData: encodeProviderData(updated) });
			}
		});
	}

	private async _changeAgent(chat: URI, agent: AgentSelection | undefined, operationContext?: URI | IAgentChatContext): Promise<void> {
		try {
			await this._changeAgentOnce(chat, agent, operationContext);
		} catch (error) {
			if (!await this._recoverFromClosedConnection(error, 'changeAgent', this._clientFailureCorrelation(chat, undefined, operationContext))) {
				throw error;
			}
			await this._changeAgentOnce(chat, agent, operationContext);
		}
	}

	private async _changeAgentOnce(chat: URI, agent: AgentSelection | undefined, operationContext?: URI | IAgentChatContext): Promise<void> {
		const context = this._resolveChatContext(chat, operationContext);
		await this._queueChat(context.configurationId, context.sequencerKey, async () => {
			const current = this._resolveChatContext(chat, operationContext);
			const provisional = this._provisionalSessions.get(current.configurationId);
			if (provisional) {
				provisional.agent = agent;
			} else {
				const entry = current.target ?? await this._ensureResolvedChatSession(current);
				if (entry) {
					const resolvedAgentName = agent ? this._resolveAgentName(entry.appliedSnapshot, agent) : undefined;
					await entry.setAgent(resolvedAgentName);
				}
			}
			const backing = this._chatBackings.get(current.chatKey);
			if (backing) {
				const updated: IPersistedChat = { ...backing, ...(agent ? { agent } : { agent: undefined }) };
				this._chatBackings.set(current.chatKey, updated);
				this._onDidChangeChatData.fire({ chat, providerData: encodeProviderData(updated) });
			}
		});
	}

	async shutdown(): Promise<void> {
		if (!this._shutdownPromise) {
			this._isShuttingDown = true;
			for (const lifetime of this._sessionLifetimes.values()) {
				void lifetime.close();
			}
			this._shutdownPromise = (async () => {
				// Invalidate any request that started before teardown. Token
				// identity alone does not change during shutdown, so without this
				// guard a late success could republish after the host stopped.
				this._modelCatalogGeneration++;
				this._modelRefreshSchedule.clear();
				this._scheduledModelRefresh?.deferred.complete();
				this._scheduledModelRefresh = undefined;
				// Cancel any pending model-refresh retry so its timer cannot fire
				// after teardown and resurrect the client.
				this._modelRefreshRetry.clear();
				this._logService.info('[Copilot] Shutting down...');
				await Promise.all([...this._sessionLifetimes.values()].map(lifetime => lifetime.close()));
				for (const session of this._allLiveSessions()) {
					await this._destroyLiveSession(session);
				}
				await this._stopClient();
				this._sessionLifetimes.clear();
			})();
		}
		return this._shutdownPromise;
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		for (const chat of this._allLiveSessions()) {
			if (chat.respondToPermissionRequest(requestId, approved)) {
				return;
			}
		}
	}

	respondToUserInputRequest(requestId: string, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>): void {
		for (const chat of this._allLiveSessions()) {
			if (chat.respondToUserInputRequest(requestId, response, answers)) {
				return;
			}
		}
	}

	/**
	 * Returns true if this provider owns the given session ID. Includes
	 * provisional sessions that have not yet been materialized.
	 */
	hasSession(session: URI): boolean {
		const sessionId = AgentSession.id(session);
		return this._chatEntriesBySdkId.has(sessionId) || this._provisionalSessions.has(sessionId);
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
		if (!this._isSystemProxyEnabled()) {
			return undefined;
		}
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
	 * env at client start, so if it would now differ we restart the running
	 * client here (deferred while a turn is in flight, see
	 * {@link _requestClientRestart}); the next `_ensureClient` re-resolves it
	 * against the new token. No-op when no client is running/starting or the
	 * proxy is unchanged.
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
		this._chatEntriesBySdkId.clearAndDisposeAll();
		await this._stopClient();
	}

	private _getOrCreateActiveClient(session: URI, directory: URI | undefined): ActiveClient {
		let client = this._activeClients.get(session);
		if (!client) {
			// The controller reads the session's retained host-customization
			// snapshot through this accessor rather than holding a copy, so the
			// enablement it projects always reflects the latest snapshot the
			// host supplied at a call boundary (Section 8b).
			const pluginController = this._plugins.createSessionController(directory, () => this._retainedHostCustomizations(session));
			client = this._instantiationService.createInstance(ActiveClient, session, pluginController, this._onDidSessionProgress);
			this._activeClients.set(session, client);
		} else if (directory) {
			client.pluginController.setDirectory(directory);
		}
		return client;
	}

	/**
	 * Instantiates a {@link CopilotAgentSession} for the given session id.
	 * The caller is responsible for awaiting
	 * {@link CopilotAgentSession.initializeSession} and, on success,
	 * registering the live leaf.
	 */
	private _createAgentSession(launchPlan: CopilotSessionLaunchPlan, customizationDirectory: URI | undefined, activeClient: ActiveClient, identity?: ICopilotAgentSessionIdentity): CopilotAgentSession {
		const sessionUri = identity?.sessionUri ?? AgentSession.uri(this.id, launchPlan.sessionId);
		const chatChannelUri = identity?.chatChannelUri ?? this._findBoundSessionChatUri(launchPlan.sessionId) ?? sessionUri;

		const agentSession = this._instantiationService.createInstance(
			CopilotAgentSession,
			{
				sessionUri,
				chatChannelUri,
				...(identity?.resource ? { resource: identity.resource } : {}),
				rawSessionId: launchPlan.sessionId,
				onDidSessionProgress: this._onDidSessionProgress,
				sessionLauncher: this._sessionLauncher,
				launchPlan,
				shellManager: launchPlan.shellManager,
				workingDirectory: launchPlan.workingDirectory,
				customizationDirectory,
				clientSnapshot: launchPlan.snapshot,
				activeClientToolSet: launchPlan.activeClientToolSet,
				// Client-tool ownership is filtered by the host-owned membership
				// for the chat the call was issued on, so a tool call is never
				// attributed to (and therefore dispatched to) a client Agent
				// Host did not fan this chat out to. The session passes its
				// current channel because `bindChatChannel` can move it after
				// construction.
				clientReachesChat: (clientId, chat) => activeClient.contributesTo(clientId, chat.toString()),
				resolveMcpChildId: name => findMcpChildId(activeClient.pluginController.getCustomizations(), name),
				// The session's MCP enablement reconcile has no host call of its
				// own, so it reads the owning session's retained
				// host-customization snapshot (Section 8b) through this accessor
				// instead of shared host state. `sessionUri` is the owning
				// session for every chat, including additional ones, so a peer
				// chat reconciles against the same snapshot as its session.
				hostCustomizations: () => this._retainedHostCustomizations(sessionUri),
				serverToolHost: this._serverToolHost,
				isLaunchTokenCurrent: () => this._githubToken === launchPlan.githubToken,
				onTurnEnded: () => this._onChatTurnEnded(),
			},
		);
		return agentSession;
	}

	private _createChatEntry(session: CopilotAgentSession, activeClient: ActiveClient): CopilotChatEntry {
		return new CopilotChatEntry(session, activeClient, this._onMcpNotification);
	}

	private _registerLiveChat(chat: URI, session: CopilotAgentSession, activeClient: ActiveClient): void {
		const current = this._chatBackings.get(chat.toString());
		this._chatEntriesBySdkId.deleteAndDispose(session.sessionId);
		this._chatEntriesBySdkId.set(session.sessionId, this._createChatEntry(session, activeClient));
		this._chatBackings.set(chat.toString(), { ...current, sdkSessionId: session.sessionId });
	}

	private _registerUnboundSession(session: CopilotAgentSession, activeClient: ActiveClient): void {
		this._chatEntriesBySdkId.deleteAndDispose(session.sessionId);
		this._chatEntriesBySdkId.set(session.sessionId, this._createChatEntry(session, activeClient));
	}

	/** Rejects a session initialized by a client that was stopped or replaced during launch. */
	private _throwIfClientReplaced(client: CopilotSessionLaunchPlan['client'], agentSession: CopilotAgentSession): void {
		if (this._shutdownPromise || this._client !== client) {
			agentSession.dispose();
			throw new CancellationError();
		}
	}

	private _registerInitializedSession(sessionId: string, agentSession: CopilotAgentSession, activeClient: ActiveClient, client: CopilotSessionLaunchPlan['client']): void {
		this._throwIfClientReplaced(client, agentSession);
		const boundChat = this._findBoundSessionChatUri(sessionId);
		if (boundChat) {
			agentSession.bindChatChannel?.(boundChat);
			this._registerLiveChat(boundChat, agentSession, activeClient);
			return;
		}
		this._registerUnboundSession(agentSession, activeClient);
	}

	private async _destroyLiveSession(chatSession: CopilotAgentSession, preserveRouting = false): Promise<void> {
		try {
			await chatSession.destroySession();
		} catch (error) {
			this._logService.warn(`[Copilot:${chatSession.sessionId}] Failed to destroy session before cleanup: ${error instanceof Error ? error.message : String(error)}`);
		}
		const chatChannelUri = chatSession.chatChannelUri;
		if (!preserveRouting && chatChannelUri && this._chatBackings.get(chatChannelUri.toString())?.sdkSessionId === chatSession.sessionId) {
			this._chatBackings.delete(chatChannelUri.toString());
		}
		this._chatEntriesBySdkId.deleteAndDispose(chatSession.sessionId);
	}

	private _allLiveSessions(): CopilotAgentSession[] {
		return [...this._chatEntriesBySdkId.values()].map(entry => entry.chatSession);
	}

	protected _resumeSession(sessionId: string, chatChannelUri?: URI, workingDirectories?: readonly URI[]): Promise<CopilotAgentSession> {
		if (chatChannelUri) {
			this._chatBackings.set(chatChannelUri.toString(), { sdkSessionId: sessionId });
		}
		const lifetime = this._getOrCreateSessionLifetime(sessionId);
		if (!lifetime) {
			return Promise.reject(new CancellationError());
		}
		return lifetime.resumeDefault(async () => {
			const lease = await lifetime.acquire();
			if (!lease) {
				throw new CancellationError();
			}
			try {
				return await this._doResumeSession(sessionId, workingDirectories);
			} finally {
				lease.dispose();
			}
		});
	}

	private async _doResumeSession(sessionId: string, workingDirectories?: readonly URI[]): Promise<CopilotAgentSession> {
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
			resolvedWorkingDirectory = await this._configurationService.resolveWorkingDirectoryForResume(sessionUri.toString(), workingDirectory);
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
		// Multi-root: re-attach the non-primary roots so discovery spans every
		// root on resume. Empty when single-root / gated off. A send-time
		// snapshot supersedes the persisted restoration seed.
		const launchWorkingDirectories = workingDirectories ?? storedMetadata.workingDirectories;
		activeClient.pluginController.setAdditionalDirectories(this._additionalCustomizationDirectories(launchWorkingDirectories));
		// Advertise exactly the clients Agent Host fanned this session's own
		// chat out to. `_findBoundSessionChatUri` is the chat this SDK id is
		// bound to, if any; an unbound legacy runtime has no chat address the
		// host could have fanned out, so the session-wide union applies.
		const snapshot = await activeClient.snapshot(this._findBoundSessionChatUri(sessionId)?.toString());

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
			additionalDirectories: this._additionalCustomizationDirectories(launchWorkingDirectories),
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
			await this._storeSessionMetadata(sessionUri, undefined, undefined, launchWorkingDirectories, undefined, undefined);
			this._registerInitializedSession(sessionId, agentSession, activeClient, launchPlan.client);
		} catch (err) {
			agentSession.dispose();
			throw err;
		}

		return agentSession;
	}

	// ---- session metadata persistence --------------------------------------

	private static readonly _META_MODEL = 'copilot.model';
	private static readonly _META_AGENT = 'copilot.agent';
	private static readonly _META_CWD = 'copilot.workingDirectory';
	/** Persisted ordered working-directory set (JSON array of URI strings; index 0 = primary). */
	private static readonly _META_CWDS = 'copilot.workingDirectories';
	private static readonly _META_CUSTOMIZATION_DIRECTORY = 'copilot.customizationDirectory';
	private static readonly _META_PROJECT_RESOLVED = 'copilot.project.resolved';
	private static readonly _META_PROJECT_URI = 'copilot.project.uri';
	private static readonly _META_PROJECT_DISPLAY_NAME = 'copilot.project.displayName';
	/** Legacy persisted catalog of concrete chat backings, keyed by chatId. */
	private static readonly _META_CHATS = 'copilot.chats';

	/**
	 * Reads the agent's legacy `copilot.chats` migration codec for a session.
	 * Each entry maps a chatId (the `ahp-chat` authority) to the SDK session it
	 * addressed (and its optional model override). The agent no longer *writes*
	 * this catalog — the orchestrator owns the durable chat catalog via
	 * `providerData` — but the read is retained for one release to drain
	 * sessions persisted before that migration (see {@link listLegacyChats} and
	 * {@link materializeChat}).
	 */
	private async _readLegacyChatBackings(session: URI): Promise<Map<string, IPersistedChat>> {
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


	private async _storeSessionMetadata(session: URI, model: ModelSelection | undefined, workingDirectory: URI | undefined, workingDirectories: readonly URI[] | undefined, customizationDirectory: URI | undefined, project: IAgentSessionProjectInfo | undefined, projectResolved = project !== undefined, configValues?: Record<string, unknown>, customTitle?: string): Promise<void> {
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
			// Persist the ordered set alongside the legacy single cwd so a
			// multi-root session restores every directory on reload. Reads prefer
			// this key; `_META_CWD` remains the fallback for sessions persisted
			// before this key existed. Written together with `_META_CWD` from the
			// same source so index 0 stays consistent across both keys.
			if (workingDirectories) {
				work.push(db.setMetadata(CopilotAgent._META_CWDS, JSON.stringify(workingDirectories.map(d => d.toString()))));
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
			// Persisted the same way `AgentService._persistConfigValues` writes them,
			// so restore's config resolution overlays them (used by adopt to force
			// folder isolation) — folded into this write to avoid a second DB open.
			if (configValues) {
				work.push(db.setMetadata('configValues', JSON.stringify(configValues)));
			}
			// Overlaid as the session's display title on restore (see the
			// `customTitle` overlay in `AgentService`); used by adopt to carry
			// over the legacy extension-host session name.
			if (customTitle) {
				work.push(db.setMetadata('customTitle', customTitle));
			}
			await Promise.all(work);
		} finally {
			dbRef.dispose();
		}
	}

	/**
	 * Parses the persisted ordered working-directory set. Prefers the JSON
	 * `_META_CWDS` array when present and valid, otherwise falls back to the
	 * single legacy `_META_CWD` value. A malformed blob (the metadata store is
	 * client-influenced and may be corrupt) is ignored in favour of the legacy
	 * fallback so it can never reject the caller.
	 */
	private _parseWorkingDirectories(rawSet: string | undefined, fallback: URI | undefined): readonly URI[] | undefined {
		if (rawSet) {
			try {
				const parsed = JSON.parse(rawSet);
				if (Array.isArray(parsed)) {
					const dirs = parsed.filter((d): d is string => typeof d === 'string' && d.length > 0).map(d => URI.parse(d));
					if (dirs.length > 0) {
						return dirs;
					}
				}
			} catch {
				// Malformed metadata blob: fall through to the legacy fallback.
			}
		}
		return fallback ? [fallback] : undefined;
	}

	private async _readSessionMetadata(session: URI): Promise<{ model?: ModelSelection; agent?: AgentSelection; workingDirectory?: URI; workingDirectories?: readonly URI[]; customizationDirectory?: URI; workspaceless?: boolean }> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return {};
		}
		try {
			const [model, agent, cwd, cwds, customizationDirectory, workspaceless] = await Promise.all([
				ref.object.getMetadata(CopilotAgent._META_MODEL),
				ref.object.getMetadata(CopilotAgent._META_AGENT),
				ref.object.getMetadata(CopilotAgent._META_CWD),
				ref.object.getMetadata(CopilotAgent._META_CWDS),
				ref.object.getMetadata(CopilotAgent._META_CUSTOMIZATION_DIRECTORY),
				ref.object.getMetadata(AH_META_WORKSPACELESS_DB_KEY),
			]);
			const workingDirectory = cwd ? URI.parse(cwd) : undefined;
			return {
				model: this._parseModelSelection(model),
				agent: this._parseAgentSelection(agent),
				workingDirectory,
				workingDirectories: this._parseWorkingDirectories(cwds, workingDirectory),
				customizationDirectory: customizationDirectory ? URI.parse(customizationDirectory) : undefined,
				workspaceless: workspaceless === 'true',
			};
		} finally {
			ref.dispose();
		}
	}

	private async _readStoredSessionMetadata(session: URI): Promise<{ model?: ModelSelection; agent?: AgentSelection; workingDirectory?: URI; workingDirectories?: readonly URI[]; customizationDirectory?: URI; project?: IAgentSessionProjectInfo; resolved: boolean; workspaceless?: boolean } | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return undefined;
		}
		try {
			const [model, agent, cwd, cwds, customizationDirectory, resolved, uri, displayName, workspaceless] = await Promise.all([
				ref.object.getMetadata(CopilotAgent._META_MODEL),
				ref.object.getMetadata(CopilotAgent._META_AGENT),
				ref.object.getMetadata(CopilotAgent._META_CWD),
				ref.object.getMetadata(CopilotAgent._META_CWDS),
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
				workingDirectories: this._parseWorkingDirectories(cwds, workingDirectory),
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
		await this._storeSessionMetadata(session, undefined, undefined, undefined, undefined, project, true);
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

export const REFRESH_DEBOUNCE_MS = 100;

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

	constructor(
		workingDirectories: readonly URI[],
		userHome: URI,
		private readonly _getClient: () => Promise<CopilotClient>,
		private readonly _onDidRefresh: () => void,
		@IFileService private readonly _fileService: IFileService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._discovery = this._register(instantiationService.createInstance(SessionCustomizationDiscovery, workingDirectories, userHome, URI.file));
		this._settled = this._queueRefresh(false, 0);
		this._register(this._discovery.onDidChange(() => {
			this._settled = this._queueRefresh(true);
		}));
		this._register(this._configurationService.onDidRootConfigChange(() => {
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
		}, delay).catch(err => {
			// The delayer rejects a pending trigger with `CancellationError` when
			// cancelled or disposed (session teardown). Swallow it so the stored
			// `_settled` promise never surfaces an unhandled rejection.
			if (err instanceof CancellationError) {
				return;
			}
			throw err;
		});
	}

	private async _refresh(token: CancellationToken): Promise<boolean> {
		try {
			const mode = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.SessionCustomizationDiscoveryMode)
				?? DEFAULT_SESSION_CUSTOMIZATION_DISCOVERY_MODE;
			if (mode === 'discover') {
				const customizations = await this._discovery.discover(await this._getClient(), token);
				if (token.isCancellationRequested) {
					return false;
				}

				if (equals(this._customizations, customizations)) {
					return false;
				}

				this._customizations = customizations;
				this._directories = undefined;
				return true;
			}

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
		format: PluginFormat.Copilot,
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
 * Per-session state (client-published customizations and on-disk
 * customization discovery for the session's working directory) lives on {@link SessionPluginController},
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
		private readonly _getClient: () => Promise<CopilotClient>,
		@IAgentPluginManager public readonly pluginManager: IAgentPluginManager,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
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

	public get configurationService(): IAgentConfigurationService {
		return this._configurationService;
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

	public async getClient(): Promise<CopilotClient> {
		return this._getClient();
	}

	/**
	 * Construct a per-session controller bound to the given customization
	 * directory. The returned controller is a {@link Disposable} owned by
	 * the caller; disposing it releases the session's disk-discovery
	 * watchers and detaches from this controller's change event.
	 *
	 * `hostCustomizations` reads the session's retained host-published
	 * customization snapshot (Section 8b of `MULTI_CHAT_ARCHITECTURE.md`) — the
	 * source of the per-session enablement the controller projects. It is an
	 * accessor rather than a value so the controller always sees the newest
	 * snapshot Agent Host supplied, without holding host state itself.
	 */
	public createSessionController(directory: URI | undefined, hostCustomizations: () => readonly Customization[]): SessionPluginController {
		return this._instantiationService.createInstance(SessionPluginController, this, directory, hostCustomizations);
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
			return await parsePlugin(pluginDir, this._fileService, undefined, this.getUserHome(), pluginDir);
		} catch (error) {
			this._logService.warn(`[Copilot:PluginController] Error parsing plugin '${pluginDir.toString()}': ${error instanceof Error ? error.message : String(error)}`);
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
 * customizations and on-disk-discovered customizations under the session's
 * customization directory — and exposes a {@link onDidPublish} stream of
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

	private readonly _previousDirectories: URI[] = [];
	private _indexedDesiredCustomizations: readonly Customization[] | undefined;
	private readonly _desiredCustomizationById = new Map<string, Customization | ChildCustomization>();
	/**
	 * Live runtime state (`state`/`channel`) per MCP server customization id,
	 * kept up to date by the owning session from its MCP controller. Overlaid
	 * onto published customizations by {@link _overlayMcpState} so a re-sync
	 * preserves the live state of otherwise-unchanged MCP servers instead of
	 * resetting them to the `Stopped` default baked into
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

	/**
	 * The additional (non-primary) workspace roots for a multi-root session.
	 * Index 0 (the process root / worktree) is tracked separately by
	 * {@link _directory}; this holds roots 1..N, which are stable workspace
	 * folders that are never worktree-remapped. Empty for single-root sessions.
	 */
	private _additionalDirectories: readonly URI[] = [];

	constructor(
		private readonly _parent: PluginController,
		private _directory: URI | undefined,
		/**
		 * Reads the owning session's last host-published customization
		 * snapshot (Section 8b). The controller projects the host's per-customization
		 * enablement from it and holds no host state of its own.
		 */
		private readonly _hostCustomizations: () => readonly Customization[],
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
	}

	public get directory(): URI | undefined {
		return this._directory;
	}

	/** The additional (non-primary) roots attached to customization discovery. */
	public get additionalDirectories(): readonly URI[] {
		return this._additionalDirectories;
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
	 * Set the additional (non-primary) workspace roots. Recreates the discovered
	 * entry when the set actually changes so discovery re-scans every root —
	 * important when this is set after a primary-only entry was already created
	 * (e.g. on resume). A no-op for the single-root case (empty tail).
	 */
	public setAdditionalDirectories(directories: readonly URI[]): void {
		if (this._additionalDirectories.length === directories.length
			&& this._additionalDirectories.every((d, i) => isEqual(d, directories[i]))) {
			return;
		}
		this._additionalDirectories = directories;
		this._sessionDiscovered.clear();
	}

	/**
	 * Move the session's customization anchor to a new directory (e.g. from the
	 * user-picked folder to the worktree at materialization). Recreates the
	 * discovered entry so discovery/watchers re-scan the new directory.
	 */
	public reanchor(directory: URI): void {
		if (this._directory && isEqual(this._directory, directory)) {
			return;
		}
		const previous = this._directory;
		this._directory = directory;
		this._sessionDiscovered.clear();
		if (previous && !this._previousDirectories.some(candidate => isEqual(candidate, previous))) {
			this._previousDirectories.push(previous);
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
			this._parent.hostSync().catch(err => this._logService.warn('[Copilot:SessionPluginController] Host customization update failed', err)),
			...[...this._clients.values()].map(client => client.sync.catch(err => this._logService.warn('[Copilot:SessionPluginController] Client customization sync failed', err))),
			entry?.whenSettled(),
		]);
		return this.getCustomizations();
	}

	/** Returns the parsed plugins currently enabled for this session, awaiting any pending sync. */
	public async getAppliedPlugins(): Promise<readonly ICopilotPluginInfo[]> {
		const entry = this._discoveredEntry();
		const [host] = await Promise.all([
			this._parent.hostSync().catch(err => {
				this._logService.warn('[Copilot:SessionPluginController] Host customization update failed', err);
				return this._parent.hostCustomizations();
			}),
			...[...this._clients.values()].map(client => client.sync.catch(err => {
				this._logService.warn('[Copilot:SessionPluginController] Client customization sync failed', err);
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
			this._logService.warn('[Copilot:SessionPluginController] Previous customization sync failed', err);
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
			this._logService.info(`[Copilot:SessionPluginController] Retrying ${inputs.length} previously-failed client customization(s) for ${clientId}`);
			await this.sync(clientId, inputs).catch(err => {
				this._logService.warn('[Copilot:SessionPluginController] Retried client customization sync failed', err);
			});
		}
	}

	private _discoveredEntry(): SessionDiscoveredEntry | undefined {
		if (!this._directory) {
			return undefined;
		}
		if (!this._sessionDiscovered.value) {
			this._sessionDiscovered.value = this._instantiationService.createInstance(SessionDiscoveredEntry,
				[this._directory, ...this._additionalDirectories],
				this._parent.getUserHome(),
				() => this._parent.getClient(),
				() => this._onDidPublish.fire({
					type: ActionType.SessionCustomizationsChanged,
					customizations: [...this.getCustomizations()],
				})
			);
		}
		return this._sessionDiscovered.value;
	}

	private _isEnabled(customization: Customization): boolean {
		return this._desiredEnabled(customization) ?? customization.enabled !== false;
	}

	private _applyEnablement<T extends Customization>(customization: T): T {
		const enabled = this._isEnabled(customization);
		if (customization.type === CustomizationType.McpServer) {
			return customization.enabled === enabled ? customization : { ...customization, enabled };
		}
		let changed = customization.enabled !== enabled;
		const children = customization.children?.map(child => {
			const desiredEnabled = this._desiredEnabled(child);
			if (desiredEnabled === undefined || desiredEnabled === child.enabled) {
				return child;
			}
			changed = true;
			return { ...child, enabled: desiredEnabled };
		});
		return changed ? { ...customization, enabled, children } : customization;
	}

	private _desiredEnabled(customization: Customization | ChildCustomization): boolean | undefined {
		const exact = this._getDesiredCustomization(customization.id);
		if (exact) {
			return exact.enabled;
		}
		if (!this._directory) {
			return undefined;
		}
		for (const previousDirectory of this._previousDirectories) {
			const previousUri = rebaseUnder(URI.parse(customization.uri), this._directory, previousDirectory);
			if (!previousUri) {
				continue;
			}
			const previousId = customizationId(previousUri.toString(), customization.range);
			const previous = this._getDesiredCustomization(previousId);
			if (previous) {
				return previous.enabled;
			}
		}
		return undefined;
	}

	private _getDesiredCustomization(id: string): Customization | ChildCustomization | undefined {
		const customizations = this._hostCustomizations();
		if (customizations !== this._indexedDesiredCustomizations) {
			this._indexedDesiredCustomizations = customizations;
			this._desiredCustomizationById.clear();
			for (const customization of customizations ?? []) {
				this._desiredCustomizationById.set(customization.id, customization);
				if (customization.type !== CustomizationType.McpServer) {
					for (const child of customization.children ?? []) {
						this._desiredCustomizationById.set(child.id, child);
					}
				}
			}
		}
		return this._desiredCustomizationById.get(id);
	}

	/**
	 * Projects a raw customization into its published form: applies reducer-backed
	 * per-session enablement, then overlays the latest
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

	/**
	 * Host-owned membership: each client's exact chat set, keyed by `clientId`
	 * and holding chat-URI strings.
	 *
	 * Agent Host owns session→chat membership end to end and republishes the
	 * complete set through {@link CopilotAgent.getOrCreateActiveClient}
	 * whenever the session's catalog grows, so every entry here is an
	 * authoritative *replacement*, never a union with what the provider
	 * previously believed. Nothing in this class discovers sibling chats or
	 * extends a set of its own.
	 */
	private readonly _chatsByClient = new Map<string, ReadonlySet<string>>();

	/**
	 * Every chat the host has published membership for, across all clients.
	 * A chat outside this set has no authoritative membership *yet* — the
	 * window between a peer chat being provisioned and the host's follow-up
	 * fan-out — which is deliberately distinct from "no client contributes to
	 * it". See {@link contributesTo}.
	 */
	private readonly _knownChats = new Set<string>();

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

	/**
	 * Adopt the host's authoritative chat set for `clientId`, replacing any
	 * previously published membership wholesale. Returns the chats this client
	 * newly reaches, so the caller can refresh their live runtimes.
	 */
	setClientChats(clientId: string, chats: readonly URI[]): readonly URI[] {
		const previous = this._chatsByClient.get(clientId);
		const next = new Set(chats.map(chat => chat.toString()));
		this._chatsByClient.set(clientId, next);
		this._reindexKnownChats();
		return chats.filter(chat => !previous?.has(chat.toString()));
	}

	/** The exact chats `clientId` contributes to, as last published by the host. */
	clientChats(clientId: string): readonly string[] {
		return [...(this._chatsByClient.get(clientId) ?? [])];
	}

	/**
	 * Whether `clientId`'s contributions reach `chatKey`.
	 *
	 * A chat the host has not published membership for yet is treated as
	 * in-scope for every client: a peer chat's SDK runtime is provisioned
	 * before the host's follow-up fan-out reaches this provider, and a client
	 * tool call issued in that window must still resolve an owning client
	 * rather than being dropped. Once any fan-out names the chat, membership is
	 * exact.
	 */
	contributesTo(clientId: string, chatKey: string): boolean {
		return !this._knownChats.has(chatKey) || this._chatsByClient.get(clientId)?.has(chatKey) === true;
	}

	/**
	 * The tools visible to the addressed chat: the union contributed by the
	 * clients the host fanned that chat out to, deduplicated by name with the
	 * first-inserted contributor winning (matching
	 * {@link ActiveClientToolSet.merged}).
	 */
	toolsForChat(chatKey: string): readonly ToolDefinition[] {
		const seen = new Set<string>();
		const result: ToolDefinition[] = [];
		for (const clientId of this.toolSet.clientIds()) {
			if (!this.contributesTo(clientId, chatKey)) {
				continue;
			}
			for (const tool of this.toolSet.get(clientId)) {
				if (!seen.has(tool.name)) {
					seen.add(tool.name);
					result.push(tool);
				}
			}
		}
		return result;
	}

	private _reindexKnownChats(): void {
		this._knownChats.clear();
		for (const chats of this._chatsByClient.values()) {
			for (const chatKey of chats) {
				this._knownChats.add(chatKey);
			}
		}
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

	/** Drop a client's tool, customization, and membership state from this session. */
	removeClient(clientId: string): void {
		this._handles.delete(clientId);
		this.toolSet.delete(clientId);
		this._chatsByClient.delete(clientId);
		this._reindexKnownChats();
		this.pluginController.removeClient(clientId);
	}

	/**
	 * The client contributions a chat should advertise to its SDK session: the
	 * tools of the clients Agent Host fanned *that* chat out to, plus the
	 * session-scoped plugin and MCP configuration (which Copilot shares across
	 * every chat in the session). `chatKey` is omitted only where no chat is
	 * addressed yet.
	 */
	async snapshot(chatKey?: string): Promise<IActiveClientSnapshot> {
		return {
			tools: chatKey === undefined ? this.toolSet.merged() : this.toolsForChat(chatKey),
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
	 * (chat-scoped) tool set (name + description + inputSchema). The owning
	 * `clientId`s are deliberately excluded — a clientId-only change is
	 * reflected live via {@link toolSet} and never requires a restart.
	 *
	 * `chatKey` scopes the comparison to the chats the host fanned each client
	 * out to, so a chat whose membership changed converges on its next
	 * interaction instead of running indefinitely on the advertisement it was
	 * launched with.
	 */
	async requiresRestart(snap: IActiveClientSnapshot, chatKey?: string): Promise<boolean> {
		const plugins = await this.pluginController.getAppliedPlugins();
		if (!parsedPluginsEqual(snap.plugins, plugins)) {
			return true;
		}
		if (!equals(snap.mcpServers, this._getMcpServers())) {
			return true;
		}
		return chatKey === undefined
			? !this.toolSet.structuralEquals(snap.tools)
			: !structuralToolsEqual(this.toolsForChat(chatKey), snap.tools);
	}
}
