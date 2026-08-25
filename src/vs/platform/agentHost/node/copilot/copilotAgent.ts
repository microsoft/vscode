/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient, RuntimeConnection, type CopilotClientOptions, type GitHubTelemetryNotification, type ManagedSettingsResolvedData, type SessionMode as CopilotSdkMode } from '@github/copilot-sdk';
import * as fs from 'fs/promises';
import * as os from 'os';
import { pathToFileURL } from 'url';
import { CancelablePromise, createCancelablePromise, DeferredPromise, Delayer, disposableTimeout, Limiter, raceTimeout, Sequencer, SequencerByKey, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { CancellationError, getErrorMessage } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, type IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { formatTokenCount } from '../../../../base/common/numbers.js';
import { equals } from '../../../../base/common/objects.js';
import { autorun, observableValue, observableValueOpts, type IObservable, type ISettableObservable } from '../../../../base/common/observable.js';
import { delimiter, dirname, join } from '../../../../base/common/path.js';
import { basename as resourceBasename, isEqual, isEqualOrParent, joinPath as resourceJoinPath, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { rgDiskPath } from '../../../../base/node/ripgrep.js';
import { localize } from '../../../../nls.js';
import { IParsedAgent, IParsedPlugin, IParsedRule, IParsedSkill, parseAgentFile, parsePlugin, parseRuleFile, parseSkillFile, PluginFormat, type IMcpServerDefinition } from '../../../agentPlugins/common/pluginParsers.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService, LogLevel } from '../../../log/common/log.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { workspacelessScratchDir } from '../workspacelessScratchDir.js';
import { IAgentHostCheckpointService } from '../../common/agentHostCheckpointService.js';
import type { IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { IAgentHostReviewService } from '../../common/agentHostReviewService.js';
import { createPricingMetaFromBilling, hasLongContextSurcharge, normalizeCAPIBilling, type ICAPIModelBilling } from '../../common/agentModelPricing.js';
import { createAgentModelByokMeta } from '../../common/agentModelByokMeta.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema, DEFAULT_SESSION_CUSTOMIZATION_DISCOVERY_MODE, toContainerCustomization } from '../../common/agentHostCustomizationConfig.js';
import { CopilotCliConfigKey, CopilotCliVSCodeAssignmentContextKey, copilotCliConfigSchema, DEFAULT_COPILOT_RUBBER_DUCK_ENABLED, type CopilotSdkLogLevelSetting } from '../../common/copilotCliConfig.js';
import { AgentHostAutoApprovePolicyRestrictedConfigKey, AgentHostByokModelsEnabledConfigKey, AgentHostMcpServersConfigKey, AgentHostGitHubMcpServerEnabledConfigKey, AgentHostCopilotMultiRootEnabledConfigKey, AgentHostSessionSyncEnabledConfigKey, AgentHostSystemProxyEnabledConfigKey, AgentHostMigrateLegacyCopilotCliEnabledConfigKey, AgentHostProxyConfigKey, agentHostProxyConfigSchema, AutoApproveLevel, SessionMode, migrateLegacyAutopilotConfig, platformRootSchema, platformSessionSchema, type AgentHostMcpServers } from '../../common/agentHostSchema.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { decodeProviderData, encodeProviderData, type IPersistedChat } from '../agentChatBackings.js';
import { AgentChatOperationContext, AgentSession, AgentSignal, AuthenticateParams, IActiveClient, IAgent, IAgentChatAdoptionResult, type IAgentAdoptedWorktree, IAgentChatConfigCompletionsParams, IAgentChatContext, IAgentChatDataChange, IAgentChatMetadata, IAgentChats, IAgentLegacyChat, IAgentCreateChatOptions, IAgentCreateChatResult, IAgentDescriptor, IAgentDiscoveredChat, IAgentHostManagedSettingsSnapshot, IAgentHostNetworkEndpoint, IAgentKnownSessionsFilter, IAgentMaterializeChatEvent, IAgentModelInfo, IAgentResolveChatConfigParams, IAgentSessionProjectInfo, IAgentSpawnChatEvent, IMcpNotification, SubagentChatSignal, resolveAgentChatContext, resolveAgentHostCustomizations, resolveAgentHostInstructions, resolveSubagentChatParent, type IAgentTurnDiagnosticSnapshot } from '../../common/agent.js';
import { getReasoningEffortDescription, getReasoningEffortLabel, resolveDefaultReasoningEffort } from '../../common/reasoningEffort.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ICopilotConfigSlashCommandState } from '../../common/copilotConfigSlashCommands.js';
import { getCopilotHomePath } from '../../common/copilotHome.js';
import { ISessionDataService, SESSION_DB_FILENAME } from '../../common/sessionDataService.js';
import { IAgentHostProxyResolver } from '../agentHostProxyResolver.js';
import { MODEL_REFRESH_BASE_DELAY_MS, MODEL_REFRESH_MAX_ATTEMPTS, MODEL_REFRESH_MAX_DELAY_MS, modelRefreshBackoff } from '../shared/modelRefreshRetry.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import type { ErrorInfo } from '../../common/state/protocol/common/state.js';
import { ProtectedResourceMetadata, type AgentSelection, type ChildCustomizationType, type ConfigPropertySchema, type ConfigSchema, type CustomizationEnablement, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { ActionType, AuthRequiredReason, type AuthRequiredParams, type SessionAction } from '../../common/state/sessionActions.js';
import { areAdditionalWorkingDirectoriesEqual } from '../../common/state/sessionWorkingDirectories.js';
import { AgentCustomization, CustomizationLoadStatus, CustomizationType, RuleCustomization, ChatInputResponseKind, SkillCustomization, customizationId, buildChatUri, buildDefaultChatUri, AH_META_WORKSPACELESS_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_EHCLI_ADOPTED_DB_KEY, AH_META_IS_READ_DB_KEY, isDefaultChatUri, withSessionEhcliAdoptable, type ChildCustomization, type ClientPluginCustomization, type Customization, type DirectoryCustomization, type HookCustomization, type ISessionFolderPickerDecision, type MessageAttachment, type PendingMessage, type PluginCustomization, type PolicyState, type ChatInputAnswer, type ToolCallResult, type Turn, type UsageInfo } from '../../common/state/sessionState.js';
import { getByokLmAgentModelId, resolveByokLmEnablement } from '../../common/agentHostByokLm.js';
import { isCustomizationEnabled } from '../../common/customizationEnablement.js';
import { ActiveClientToolSet, structuralToolsEqual } from '../activeClientState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostManagedSettingsService } from '../agentHostManagedSettingsService.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
import { IAgentHostCompletions } from '../agentHostCompletions.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { applyMcpServerEnablement, buildMcpTopLevelCustomizationId, type IMcpServerRuntimeState } from '../shared/mcpCustomizationController.js';
import { IAgentHostCustomizationEnablementService } from '../agentHostCustomizationEnablementService.js';
import { getSdkMcpServerEnablement, isCustomizationSdkEligible, resolveCustomizationEnablement } from '../shared/customizationEnablementGate.js';
import { McpServerStatus, type McpServerCustomization } from '../../common/state/protocol/channels-session/state.js';
import { IAgentHostSessionTitleSignal } from '../agentHostSessionTitleSignal.js';
import { IByokLmBridgeRegistry } from '../byokLmBridgeRegistry.js';
import { IAgentHostWorktreeIsolation, type IAgentHostWorktreeResumeService, SessionWorkingDirectoryMissingError } from '../shared/worktreeIsolation.js';
import { buildSessionEventLogFromTurns } from './buildSessionEvents.js';
import { CopilotAgentSession } from './copilotAgentSession.js';
import { createCopilotCliEnvironment } from './copilotCliEnvironment.js';
import { ICopilotSessionContext, projectFromCopilotContext } from './copilotGitProject.js';
import { parsedPluginsEqual, toChildCustomizations } from './copilotPluginConverters.js';
import { CopilotGitHubTelemetryForwarder } from './copilotGitHubTelemetryForwarder.js';
import { CopilotSessionLauncher, ContextSizeConfigKey, ThinkingLevelConfigKey, getCopilotContextTier, isCopilotReasoningEffort, resolveCopilotReasoningEffort, type CopilotSessionLaunchPlan, type IActiveClientSnapshot } from './copilotSessionLauncher.js';
import { CopilotAgentStartupConfig } from './copilotAgentStartupConfig.js';
import { ShellManager } from './copilotShellTools.js';
import { isAgentHostTelemetryService } from '../agentHostTelemetryService.js';
import { ICopilotApiService, type IRestrictedTelemetryContext } from '../shared/copilotApiService.js';
import { AgentHostGitHubTelemetryRouter } from '../agentHostGitHubTelemetryRouter.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { CopilotSlashCommandCompletionProvider, ICopilotRuntimeSlashCommandQueryOptions } from './copilotSlashCommandCompletionProvider.js';
import { GITHUB_MCP_SERVER_NAME } from '../shared/githubMcpServer.js';
import { DiscoveredType, SessionCustomizationDiscovery, areDiscoveredDirectoriesEqual, workspaceDirectoryHasHooks, type IDiscoveredDirectory } from './sessionCustomizationDiscovery.js';
import { computeFolderPickerDecisionForRoots } from '../shared/folderPickerDecision.js';
import { COPILOT_INTEGRATION_ID } from '../../../endpoint/common/licenseAgreement.js';
import { getAppNodeModulesPath } from '../appNodeModules.js';
import { CopilotSlashCommandProvider } from './copilotSlashCommandProvider.js';
import { SessionMcpDiscovery } from '../shared/sessionMcpDiscovery.js';
import { hasClientPluginMcpDefaultCwd, readClientPluginMcpDefaultCwd } from '../../common/meta/clientPluginCustomizationMeta.js';
import { classifyCopilotClientOperationFailure, CopilotClientStartupConfigChangedError, createCopilotFailureCorrelation, isRecognizedCopilotClientStartupFailure, reportCopilotClientOperationFailure, reportCopilotClientRecovery, reportCopilotClientRecoveryTurn, reportCopilotClientStartup, type CopilotClientOperation, type CopilotClientOperationFailureKind, type ICopilotFailureCorrelation } from './copilotFailureTelemetry.js';

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
const COPILOT_ENABLE_BUILTIN_GITHUB_MCP_ENV_VAR = 'COPILOT_ENABLE_BUILTIN_GITHUB_MCP';

function setCopilotBuiltinGitHubMcpEnvironment(env: Record<string, string | undefined>, enabled: boolean): void {
	for (const key of Object.keys(env)) {
		if (key.toUpperCase() === COPILOT_ENABLE_BUILTIN_GITHUB_MCP_ENV_VAR) {
			delete env[key];
		}
	}
	if (enabled) {
		env[COPILOT_ENABLE_BUILTIN_GITHUB_MCP_ENV_VAR] = 'true';
	}
}

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
	proxy: string | undefined = undefined,
): Promise<{ account?: string; resolved: ManagedSettingsResolvedData }> {
	const request = invokeWithProxyEnvironment(proxy, () => runtimeSdk.getManagedSettings({
		...(token ? { authInfo: { type: 'token', host, token } as const, token } : {}),
		signal,
	}));
	const result = await raceTimeout(request, timeoutMs);
	if (!result) {
		throw new Error(`Copilot runtime managed-settings query exceeded ${timeoutMs / 1000} seconds while waiting for native MDM or GitHub policy resolution.`);
	}
	return result;
}

function invokeWithProxyEnvironment<T>(proxy: string | undefined, invoke: () => Promise<T>): Promise<T> {
	if (!proxy) {
		return invoke();
	}
	const previousValues = COPILOT_PROXY_SET_ENV_KEYS.map(key => process.env[key]);
	for (const key of COPILOT_PROXY_SET_ENV_KEYS) {
		process.env[key] = proxy;
	}
	try {
		// The SDK snapshots process.env while constructing the native request.
		return invoke();
	} finally {
		for (let index = 0; index < COPILOT_PROXY_SET_ENV_KEYS.length; index++) {
			const key = COPILOT_PROXY_SET_ENV_KEYS[index];
			const value = previousValues[index];
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}

const RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS = 300;
const COPILOT_CAPI_URL = 'https://api.githubcopilot.com';

interface ICopilotClosedConnectionRecoveryResult {
	readonly failedTurnIds: ReadonlySet<string>;
	readonly stopSucceeded: boolean;
}

function isCopilotConnectionClosedError(error: unknown): boolean {
	return classifyCopilotClientOperationFailure(error) === 'connectionClosed';
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

/**
 * Selects the single Copilot SDK path that owns an MCP server definition. Plugin discovery is for servers declared by a materialized plugin; session config is for definitions Agent Host assembled from workspace or client-synced state.
 */
export type CopilotMcpServerSdkRegistration = 'pluginDiscovery' | 'sessionConfig';

export type ICopilotMcpServerInfo = IMcpServerDefinition & {
	/** The SDK registration path chosen while resolving the session's AHP customizations. */
	readonly sdkRegistration: CopilotMcpServerSdkRegistration;
};

export type ICopilotPluginInfo = Omit<IParsedPlugin, 'mcpServers'> & {
	readonly mcpServers: readonly ICopilotMcpServerInfo[];
	readonly pluginDir?: URI;
	readonly sourceUri?: URI;
	readonly disabledMcpServers?: readonly string[];
};

/**
 * Resolves a parsed MCP child into its Copilot launch contract. Client default-CWD metadata identifies servers synthesized outside the plugin, so they are projected through session config independently of the resolved CWD value.
 */
export function resolveCopilotMcpServerInfo(definition: IMcpServerDefinition, pluginDir: URI | undefined, input?: ClientPluginCustomization, primaryCwd?: URI): ICopilotMcpServerInfo {
	const clientDefaultCwd = input ? readClientPluginMcpDefaultCwd(input, definition.name, primaryCwd) : undefined;
	return {
		...definition,
		defaultCwd: clientDefaultCwd ?? definition.defaultCwd,
		sdkRegistration: input && hasClientPluginMcpDefaultCwd(input, definition.name)
			? 'sessionConfig'
			: pluginDir?.scheme === Schemas.file ? 'pluginDiscovery' : 'sessionConfig',
	};
}

/**
 * In-memory chat reservation created by {@link IAgentChats.createChat} and
 * consumed by {@link CopilotAgent._materializeProvisional} on first send.
 * It retains pre-send model/agent updates without creating on-disk state.
 */
interface IProvisionalSession {
	readonly sessionId: string;
	readonly sdkSessionId: string;
	readonly sessionUri: URI;
	readonly chat: URI;
	readonly isEphemeral: boolean;
	/** Whether the owning chat surface is scoped to editing a single file. */
	readonly hasScopedEditSurface: boolean;
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

/** Stable empty host-customization snapshot used before the host publishes one. */
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

/** Rebase `enablement` keys under `fromDir` onto `toDir`, preserving unmatched keys verbatim. */
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
		onDidRequireAuth: () => void,
	) {
		super();
		this._register(chatSession);
		this._register(chatSession.onMcpNotification(notification => onMcpNotification.fire(notification)));
		this._register(chatSession.onDidRequireAuth(onDidRequireAuth));
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

const COPILOT_EXTERNAL_SESSION_CLIENT_NAMES = new Set(['github/cli', 'github/autopilot']);
const COPILOT_EXTERNAL_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** How many SDK sessions are classified before the batch is published to clients. */
const COPILOT_DISCOVERY_BATCH_SIZE = 250;

/**
 * Backoff between initial chat-discovery attempts. The common failure is the CLI
 * client still starting, which clears in well under a second, so the first retry
 * is short; later ones back off for genuinely slow starts.
 */
const CHAT_DISCOVERY_RETRY_DELAYS_MS = [250, 1_000, 5_000];

/**
 * How many times `_ensureClient` re-acquires the SDK client after a cold-start
 * abort caused by a startup-config change. One extra attempt covers the common
 * one-time startup settle observed in the field; the bound prevents livelock if
 * the config keeps changing on every start.
 */
const MAX_STARTUP_CONFIG_RETRIES = 1;

/** `origin` value written by the VS Code extension-host Copilot CLI feature. */
const EXTENSION_HOST_CLI_MARKER_ORIGIN = 'vscode';

/** File name of the marker written beside a Copilot CLI session's SDK event log. */
const EXTENSION_HOST_CLI_MARKER_FILE = 'vscode.metadata.json';

/**
 * Shape of the `vscode.metadata.json` marker written next to a Copilot CLI
 * session's SDK event log. Other Copilot CLI hosts (e.g. the GitHub Copilot
 * app) write the same file with a non-`vscode` `origin`.
 */
interface IExtensionHostCliMarker {
	readonly origin?: string;
	readonly customTitle?: string;
	/** Whether the user archived the session in the extension host list. */
	readonly archived?: boolean;
	/** Folder-mode repository root recorded by the extension host. */
	readonly repositoryProperties?: { readonly repositoryPath?: string };
	/** Worktree-mode checkout; `worktreePath` is the directory the session ran in. */
	readonly worktreeProperties?: { readonly worktreePath?: string; readonly repositoryPath?: string; readonly branchName?: string; readonly baseBranchName?: string };
	readonly workspaceFolder?: { readonly folderPath?: string };
}

function parseExtensionHostCliMarker(raw: string): IExtensionHostCliMarker | undefined {
	try {
		const parsed = JSON.parse(raw) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as IExtensionHostCliMarker : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Whether a marker identifies a chat created by the VS Code extension host —
 * the only chats migration ever adopts.
 *
 * Mirrors the extension host's `getSessionOrigin`: honor an explicit `origin`
 * (the GitHub Copilot app writes `other`), else guess `vscode` only when older
 * origin-less markers carry VS Code-specific properties.
 */
function isExtensionHostCliMarker(marker: IExtensionHostCliMarker | undefined): boolean {
	if (!marker || Object.keys(marker).length === 0) {
		return false;
	}
	if (marker.origin !== undefined) {
		return marker.origin === EXTENSION_HOST_CLI_MARKER_ORIGIN;
	}
	return marker.repositoryProperties !== undefined
		|| marker.worktreeProperties !== undefined
		|| marker.workspaceFolder !== undefined;
}

/**
 * Working directory candidates the extension host recorded for a chat, in
 * precedence order, used when the SDK reports none. A worktree session ran in
 * its checkout, not the repository root — but that checkout may since have been
 * deleted, so callers fall through to the next candidate that still exists.
 */
function extensionHostCliWorkingDirectoryPaths(marker: IExtensionHostCliMarker | undefined): string[] {
	return [
		marker?.worktreeProperties?.worktreePath,
		marker?.workspaceFolder?.folderPath,
		marker?.repositoryProperties?.repositoryPath,
		marker?.worktreeProperties?.repositoryPath,
	].filter((path): path is string => typeof path === 'string' && path.length > 0);
}

/**
 * The local repository root the extension host recorded for a chat. Survives a
 * deleted worktree checkout, unlike resolving git from the working directory.
 */
function extensionHostCliRepositoryPath(marker: IExtensionHostCliMarker | undefined): string | undefined {
	const path = marker?.worktreeProperties?.repositoryPath ?? marker?.repositoryProperties?.repositoryPath;
	return typeof path === 'string' && path.length > 0 ? path : undefined;
}

/**
 * Shape of the extension-host Copilot CLI `vscode.requests.metadata.json`
 * sidecar written next to a session's SDK event log. Only the fields adoption
 * needs are modelled; `copilotRequestId` is the SDK `user.message` envelope id,
 * which is also the turn id `mapSessionEvents` restores turns under.
 */
interface IExtensionHostCliRequestDetails {
	readonly copilotRequestId?: string;
	readonly responseModelId?: string;
	readonly creditsUsed?: number;
}

/** Copilot bills in nano-AIU; the extension host persists whole credits. */
const NANO_AIU_PER_CREDIT = 1_000_000_000;

/**
 * Agent provider backed by the Copilot SDK {@link CopilotClient}.
 */
export class CopilotAgent extends Disposable implements IAgent {
	readonly id = 'copilotcli' as const;
	protected readonly _now = Date.now;

	private readonly _onDidChatProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidChatProgress = this._onDidChatProgress.event;
	private readonly _authenticationRequired = observableValueOpts<Omit<AuthRequiredParams, 'channel'> | undefined>(
		{ owner: this, equalsFn: structuralEquals },
		undefined,
	);
	readonly authenticationRequired: IObservable<Omit<AuthRequiredParams, 'channel'> | undefined> = this._authenticationRequired;
	/**
	 * Membership channel for chats the agent spawns itself — sub-agents
	 * delegated by a tool call (the same fan-out the `subagent_started` /
	 * `subagent_completed` signals drive). The orchestrator routes these into
	 * the chat catalog so harness-spawned and user-driven chats share one path.
	 */
	private readonly _onDidSpawnChat = this._register(new Emitter<IAgentSpawnChatEvent>());
	readonly onDidSpawnChat = this._onDidSpawnChat.event;
	private readonly _onDidMaterializeChat = this._register(new Emitter<IAgentMaterializeChatEvent>());
	readonly onDidMaterializeChat = this._onDidMaterializeChat.event;
	/**
	 * Fires when the native chat catalog may have changed. The {@link AgentService}
	 * responds with an additive discovery pass.
	 */
	private readonly _onDidDiscoverChats = this._register(new Emitter<readonly IAgentDiscoveredChat[]>({
		onDidAddFirstListener: () => { void this._startCopilotChatDiscovery(); },
	}));
	readonly onDidDiscoverChats = this._onDidDiscoverChats.event;
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

	/** Model IDs whose long-context tier costs the same as the default tier (free long context). */
	private readonly _freeLongContextModels = new Set<string>();

	/**
	 * Bounded exponential-backoff retry for {@link _refreshModels}. The SDK's
	 * `models.list` RPC can fail transiently (e.g. a `429 "too many requests"`
	 * right after startup). Without a retry the model picker would stay empty
	 * until the next external refresh trigger (a GitHub token change, a CLI
	 * client restart, or the host's periodic scheduler), so we retry a few
	 * times before giving up. Overridable in tests to avoid real delays.
	 */
	protected readonly _modelRefreshMaxAttempts: number = MODEL_REFRESH_MAX_ATTEMPTS;
	protected readonly _modelRefreshBaseDelayMs: number = MODEL_REFRESH_BASE_DELAY_MS;
	protected readonly _modelRefreshMaxDelayMs: number = MODEL_REFRESH_MAX_DELAY_MS;
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
	/**
	 * Coalesces the whole acquire-and-self-heal sequence in `_ensureClient` so
	 * that all concurrent callers share a single, global retry budget for
	 * startup-config-changed aborts (rather than each caller getting its own).
	 */
	private _ensureClientHealing: Promise<CopilotClient> | undefined;
	private _clientStopping: Promise<void> | undefined;
	private _clientStartupAttemptCount = 0;
	private _resolvedProxy: string | undefined;
	private _proxyRefresh: Promise<void> | undefined;
	private _proxyResolutionGeneration = 0;
	private _appliedProxy: string | undefined;
	private _appliedProxyKerberosSpn: string | undefined;
	/**
	 * Reasons for a client restart that is parked until every chat is idle. See
	 * {@link _requestClientRestart}; drained by {@link _applyPendingClientRestart}.
	 */
	private readonly _pendingClientRestartReasons = new Set<string>();
	private _closedConnectionRecovery: { readonly clientFailureId: string; readonly promise: Promise<ICopilotClosedConnectionRecoveryResult> } | undefined;
	private readonly _authenticationSequencer = new Sequencer();
	private _updatingGitHubCredentials = false;
	private _githubToken: string | undefined;
	private _serverToolHost: IAgentServerToolHost | undefined;

	setServerToolHost(host: IAgentServerToolHost): void {
		this._serverToolHost = host;
	}

	/** Reflects the restricted-telemetry entitlement from `/copilot_internal/user`. */
	private _restrictedTelemetryEnabled = false;
	private readonly _onDidChangeRestrictedTelemetry = this._register(new Emitter<void>());
	readonly onDidChangeRestrictedTelemetry = this._onDidChangeRestrictedTelemetry.event;

	get restrictedTelemetryEnabled(): boolean {
		return this._restrictedTelemetryEnabled;
	}

	private readonly _chatEntriesBySdkId = this._register(new DisposableMap<string, CopilotChatEntry>());
	/** Exact host chat URI -> persisted provider backing; live SDK sessions are tracked separately. */
	private readonly _chatBackings = new Map<string, IPersistedChat>();

	/** Exact chat -> recorded configuration scope, used for fork/restore paths that only know the chat URI. */
	private readonly _chatScopes = new Map<string, URI>();
	/** Exact chat -> host-selected persistence scope. */
	private readonly _chatStorageScopes = new Map<string, URI>();

	private _rememberChatScope(chat: URI, scope: URI, storageScope: URI): void {
		this._chatScopes.set(chat.toString(), scope);
		this._chatStorageScopes.set(chat.toString(), storageScope);
	}

	/** Returns the recorded configuration scope for a created or materialized chat. */
	private _resolveChatScope(chat: URI): URI {
		const scope = this._chatScopes.get(chat.toString());
		if (!scope) {
			throw new Error(`[Copilot] No recorded scope for chat ${chat.toString()}; it must be created or materialized before it can be forked from`);
		}
		return scope;
	}

	private _resolveChatStorageScope(chat: URI): URI {
		return this._chatStorageScopes.get(chat.toString()) ?? this._resolveChatScope(chat);
	}

	/** Ref count for chats that still share `scope`, used to decide when scope cleanup can run. */
	private _remainingChatsForScope(scope: URI): number {
		let count = 0;
		for (const recorded of this._chatScopes.values()) {
			if (isEqual(recorded, scope)) {
				count++;
			}
		}
		return count;
	}

	/** Formats a chat backing for host persistence; only separately enumerable SDK sessions report `backingSession`. */
	private _chatBackingResult(sessionId: string, backing: IPersistedChat): IAgentCreateChatResult {
		return {
			providerData: encodeProviderData(backing),
			...(backing.sdkSessionId !== sessionId ? { backingSession: AgentSession.uri(this.id, backing.sdkSessionId) } : {}),
		};
	}
	/** Fires when persisted chat backing data changes after creation. */
	private readonly _onDidChangeChatData = this._register(new Emitter<IAgentChatDataChange>());
	readonly onDidChangeChatData: Event<IAgentChatDataChange> = this._onDidChangeChatData.event;
	private readonly _sessionLifetimes = new Map<string, CopilotSessionLifetime>();
	/** Provisional chats that defer SDK/session creation until the first send. */
	private readonly _provisionalSessions = new Map<string, IProvisionalSession>();
	private _shutdownPromise: Promise<void> | undefined;
	private _isShuttingDown = false;
	private readonly _plugins: PluginController;
	private readonly _sessionLauncher: CopilotSessionLauncher;
	private readonly _gitHubTelemetryForwarder: CopilotGitHubTelemetryForwarder;
	private _vscodeAssignmentContext: string | undefined;
	private readonly _githubTelemetryRouter: AgentHostGitHubTelemetryRouter | undefined;
	readonly onDidCustomizationsChange: Event<void>;
	/** Per-session active client state for tools + plugin snapshot tracking. */
	private readonly _activeClients = new ResourceMap<ActiveClient>();
	/**
	 * Last host-published customization snapshot per configuration scope (AGENTS.md section 8b).
	 * Updated only from host call boundaries; absence is distinct from an empty list.
	 */
	private readonly _hostCustomizations = new ResourceMap<readonly Customization[]>();
	private readonly _slashCommandProvider: CopilotSlashCommandProvider;
	private readonly _worktree: IAgentHostWorktreeResumeService;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostSessionTitleSignal sessionTitleSignal: IAgentHostSessionTitleSignal,
		@IAgentHostManagedSettingsService private readonly _managedSettingsService: IAgentHostManagedSettingsService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@IAgentHostOTelService private readonly _otelService: IAgentHostOTelService,
		@IAgentHostCompletions completions: IAgentHostCompletions,
		@IAgentHostCheckpointService private readonly _checkpointService: IAgentHostCheckpointService,
		@IAgentHostReviewService private readonly _reviewService: IAgentHostReviewService,
		@IAgentHostCustomizationEnablementService private readonly _customizationEnablementService: IAgentHostCustomizationEnablementService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@IByokLmBridgeRegistry private readonly _byokBridgeRegistry: IByokLmBridgeRegistry,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IAgentHostProxyResolver private readonly _proxyResolver: IAgentHostProxyResolver,
		@IFileService private readonly _fileService: IFileService,
		@IAgentHostWorktreeIsolation worktree: IAgentHostWorktreeIsolation,
	) {
		super();
		this._worktree = worktree;
		this._lastStartupConfig = this._readClientStartupConfig();
		this._plugins = this._register(this._instantiationService.createInstance(PluginController, () => this._ensureClient()));
		this._sessionLauncher = this._instantiationService.createInstance(CopilotSessionLauncher);
		this._configurationService.publishRootTransientValues?.({ [CopilotCliVSCodeAssignmentContextKey]: undefined });
		this._gitHubTelemetryForwarder = this._instantiationService.createInstance(CopilotGitHubTelemetryForwarder, () => this._restrictedTelemetryEnabled, () => this._vscodeAssignmentContext);
		this._register(this._configurationService.onDidRootConfigChange(() => this._updateVSCodeAssignmentContext()));
		this._updateVSCodeAssignmentContext();
		this._slashCommandProvider = new CopilotSlashCommandProvider(() => this._ensureClient().then(c => c.rpc.commands.list().then(c => c.commands)), this._logService);
		this._githubTelemetryRouter = isAgentHostTelemetryService(this._telemetryService)
			? new AgentHostGitHubTelemetryRouter(this._telemetryService)
			: undefined;
		this._register(this._proxyResolver.onDidRegisterConnection(() => this._refreshProxy()));
		this._register(this._proxyResolver.onDidChangeConfiguration(() => this._refreshProxy()));
		this.onDidCustomizationsChange = this._plugins.onDidChange;
		// Mirror host-owned titles under the SDK conversation id used by the agent's turn spans.
		this._register(sessionTitleSignal.onDidChangeSessionTitle(({ provider, session, title }) => {
			if (provider === this.id) {
				this._otelService.emitSessionTitleChanged(this._sdkConversationId(session), session.toString(), title);
			}
		}));
		// Mirror the sub-agent fan-out signals onto the first-class spawned-
		// chat channel so the orchestrator manages sub-agent chats
		// through the same membership path as user-driven chats.
		this._register(this._onDidChatProgress.event(signal => this._emitSpawnedChatForSubagentSignal(signal)));
		this._register(completions.registerProvider(new CopilotSlashCommandCompletionProvider(this.id,
			{
				isRubberDuckEnabled: () => this._isRubberDuckEnabled(),
				getRuntimeSlashCommands: (sessionId, options) => this._getRuntimeSlashCommands(sessionId, options),
				getSessionCustomizations: (sessionId) => {
					const session = AgentSession.uri(this.id, sessionId);
					const chat = URI.parse(buildDefaultChatUri(session));
					return this.getChatCustomizations(chat, { configurationResource: session, resource: chat });
				},
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
		this._register(this._managedSettingsService.onDidChange(() => {
			this._restartClientIfStartupConfigChanged().catch(err =>
				this._logService.error('[Copilot] Failed to apply managed settings change', err)
			);
		}));
		this._register(this._configurationService.onDidRootConfigChange(() => {
			const enabled = this._isMigrateLegacyCopilotCliEnabled();
			if (enabled !== this._lastMigrateLegacyEnabled) {
				this._lastMigrateLegacyEnabled = enabled;
				if (enabled) {
					// Only the adoptable legacy extension-host half of discovery is
					// gated on this setting, so a fresh pass is needed to surface it.
					void this._runCopilotChatDiscovery();
				} else {
					for (const [chat, discovered] of this._discoveredChats) {
						if (!discovered.external) {
							this._discoveredChats.delete(chat);
						}
					}
				}
			}
			this._refreshByokModels();
		}));

		// Surface renderer BYOK models in the picker: republish them whenever the
		// set of connected renderer bridges, or any renderer's models, change.
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

	private _lastStartupConfig: CopilotAgentStartupConfig;
	private _lastMigrateLegacyEnabled: boolean = this._isMigrateLegacyCopilotCliEnabled();

	private _isSessionSyncEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostSessionSyncEnabledConfigKey) === true;
	}

	private _isRubberDuckEnabled(): boolean {
		return this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.RubberDuck) ?? DEFAULT_COPILOT_RUBBER_DUCK_ENABLED;
	}

	private _isMultiTurnContextRoutingEnabled(): boolean {
		return this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.MultiTurnContextRouting) === true;
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

	private _isSystemProxyEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostSystemProxyEnabledConfigKey) !== false;
	}

	private _isGitHubMcpServerEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostGitHubMcpServerEnabledConfigKey) !== false;
	}

	private _isMigrateLegacyCopilotCliEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostMigrateLegacyCopilotCliEnabledConfigKey) === true;
	}

	private _readClientStartupConfig(): CopilotAgentStartupConfig {
		return new CopilotAgentStartupConfig(
			this._isSessionSyncEnabled(),
			this._isRubberDuckEnabled(),
			this._isMultiTurnContextRoutingEnabled(),
			this._getCopilotSdkLogLevelSetting(),
			this._getEnterpriseHost(),
			this._isSystemProxyEnabled(),
			this._isGitHubMcpServerEnabled(),
			this._managedSettingsService.permissions,
		);
	}

	/**
	 * A key absent from root config (e.g. dropped by a schema-filtered replace)
	 * keeps the last-known context sticky; an explicit empty-string dispatch
	 * from the workbench clears it.
	 */
	private _updateVSCodeAssignmentContext(): void {
		const value = this._configurationService.getRootConfigValues?.()[CopilotCliVSCodeAssignmentContextKey];
		if (typeof value === 'string') {
			this._vscodeAssignmentContext = value || undefined;
		}
	}

	/**
	 * Restart the CLI client when a startup-baked value changes, but defer past any
	 * in-flight turn — see {@link _requestClientRestart} — so the new values are
	 * picked up at the next quiet point rather than by killing live work.
	 * An in-flight start aborts if any startup value changes.
	 */
	private async _restartClientIfStartupConfigChanged(): Promise<void> {
		const previous = this._lastStartupConfig;
		const current = this._readClientStartupConfig();
		if (current.equals(previous)) {
			return;
		}
		const changed = current.describeChangesFrom(previous);
		this._lastStartupConfig = current;
		if (current.proxyTargetChangedFrom(previous)) {
			this._refreshProxy();
		}
		if (this._client) {
			this._logService.info(`[Copilot] Startup config changed (${changed}), restarting CopilotClient`);
		}
		await this._requestClientRestart(`startup config changed: ${changed}`);
	}

	/**
	 * Requests a CLI client restart, running it immediately when every chat is
	 * idle and otherwise parking it until the last in-flight turn ends.
	 *
	 * Restarting tears the SDK sessions down, and a torn-down session stops
	 * producing the events that finalize its protocol turn — the client would be
	 * left with a turn that never completes, cancels, or errors, i.e. a session
	 * that spins forever. Startup-only values (session sync, the SDK log level,
	 * the enterprise host, the system proxy) can also change without any user
	 * action, from an experiment or policy refresh, so this must never be paid
	 * for with a running turn. {@link _ensureClient} reads them fresh on the next
	 * start, so applying the restart late is always correct.
	 */
	private async _requestClientRestart(reason: string): Promise<void> {
		if (this._shutdownPromise || (!this._client && !this._clientStarting)) {
			return;
		}
		this._pendingClientRestartReasons.add(reason);
		if (this._clientStarting) {
			try {
				await this._clientStarting;
			} catch {
				this._pendingClientRestartReasons.delete(reason);
				return;
			}
		}
		if (!this._client) {
			return;
		}
		if (this._updatingGitHubCredentials) {
			this._logService.info(`[Copilot] Deferring CopilotClient restart (${reason}) until GitHub credential updates finish`);
			return;
		}
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
		if (this._pendingClientRestartReasons.size === 0 || this._shutdownPromise || !this._client || this._updatingGitHubCredentials || this._chatsWithActiveTurn() > 0) {
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

	private async _handleClientOperationFailure(error: unknown, operation: CopilotClientOperation, correlation?: ICopilotFailureCorrelation): Promise<ICopilotClosedConnectionRecoveryResult | undefined> {
		const failureKind = classifyCopilotClientOperationFailure(error);
		if (!failureKind) {
			return undefined;
		}

		const clientFailureId = this._closedConnectionRecovery?.clientFailureId ?? generateUuid();
		const recoveryStarted = failureKind === 'connectionClosed' && !this._shutdownPromise && this._closedConnectionRecovery === undefined;
		reportCopilotClientOperationFailure(this._telemetryService, clientFailureId, failureKind, operation, this._chatsWithActiveTurn(), recoveryStarted, error, correlation);
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

	private async _runClosedConnectionRecovery(clientFailureId: string, failureKind: CopilotClientOperationFailureKind): Promise<ICopilotClosedConnectionRecoveryResult> {
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
			message: localize('copilotAgent.connectionClosed', "Copilot stopped unexpectedly. Retry your request."),
		};
		for (const chat of this._allLiveSessions()) {
			const clientContext = chat.currentTurnClientContext;
			const failedTurnId = chat.failActiveTurn(error);
			if (failedTurnId) {
				failedTurnIds.add(failedTurnId);
				reportCopilotClientRecoveryTurn(
					this._telemetryService,
					clientFailureId,
					createCopilotFailureCorrelation(chat.sessionUri, chat.chatUri, failedTurnId, chat.sessionId, clientContext),
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

	private async _retryAfterClosedConnection<T>(operation: CopilotClientOperation, task: (client: CopilotClient) => Promise<T>, correlation?: ICopilotFailureCorrelation): Promise<T> {
		const client = await this._ensureClient();
		try {
			return await task(client);
		} catch (error) {
			if (!await this._handleClientOperationFailure(error, operation, correlation)) {
				throw error;
			}
			return task(await this._ensureClient());
		}
	}

	private _clientFailureCorrelation(chat: URI, turnId?: string, operationContext?: URI | IAgentChatContext): ICopilotFailureCorrelation {
		const context = this._resolveSendChatContext(chat, operationContext);
		const clientTelemetryContext = URI.isUri(operationContext) ? undefined : operationContext?.clientTelemetryContext;
		return createCopilotFailureCorrelation(context.configurationResource, chat, turnId, context.target?.sessionId ?? context.configurationId, clientTelemetryContext);
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
		const allowSignedOutWhenUsable = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.AllowSignedOutWhenUsable) === true;
		const copilotResource = this._gitHubEndpointService.getCopilotResource();
		return [
			allowSignedOutWhenUsable && this._byokModels.length > 0 ? { ...copilotResource, required: false } : copilotResource,
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

			stage = 'resolving the proxy';
			const proxy = await this._resolveProxyForSdk();
			stage = 'querying native MDM and GitHub managed settings';
			return getCopilotManagedSettingsDiagnostics(
				runtimeSdk,
				this._githubToken,
				this._gitHubEndpointService.getEnterpriseUri() ?? 'https://github.com',
				AbortSignal.timeout(COPILOT_MANAGED_SETTINGS_DIAGNOSTICS_TIMEOUT_MS),
				COPILOT_MANAGED_SETTINGS_QUERY_TIMEOUT_MS,
				proxy,
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

	/** Records the latest host snapshot for `session`; `undefined` means "not published yet", not "empty". */
	private _rememberHostCustomizations(session: URI, customizations: readonly Customization[] | undefined): void {
		if (customizations) {
			this._hostCustomizations.set(session, customizations);
		}
	}

	/** Refreshes the retained host snapshot from a chat-addressed operation context. */
	private _noteHostCustomizations(context: URI | IAgentChatContext | undefined): void {
		if (!context || URI.isUri(context)) {
			return;
		}
		this._rememberHostCustomizations(context.configurationResource, resolveAgentHostCustomizations(context));
	}

	/** Returns the retained host snapshot for `session`, or a stable empty singleton if none was published. */
	private _retainedHostCustomizations(session: URI): readonly Customization[] {
		return this._hostCustomizations.get(session) ?? NO_HOST_CUSTOMIZATIONS;
	}

	/** `hostCustomizations` refreshes the retained host snapshot before plugin/MCP resolution. */
	async getChatCustomizations(chat: URI, context: URI | IAgentChatContext, hostCustomizations?: readonly Customization[]): Promise<readonly Customization[]> {
		const session = resolveAgentChatContext(context, chat).configurationResource;
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
		const sessionChat = this._findSessionChat(session);
		const topLevelMcp = activeClient.pluginController.resolveTopLevelMcpCustomizations(
			sessionChat?.topLevelMcpCustomizations() ?? [],
			sessionChat?.mcpServerOwners?.(),
		);
		const customizations = [...fromPlugins, ...topLevelMcp];
		return applyMcpServerEnablement(customizations, this._retainedHostCustomizations(session));
	}

	/**
	 * Copilot applies hooks from the primary working directory only (see
	 * `_hookWorkingDirectories` in sessionCustomizationDiscovery), so in a
	 * multi-root workspace the folder carrying hooks must be the primary. Since
	 * only the primary's hooks run, the picker is only needed to resolve
	 * ambiguity between folders that carry hooks:
	 * - several working directories have hooks under `.github/hooks/` → show the
	 *   Folder picker so the user chooses which folder's hooks lead;
	 * - exactly one does → pin it as the primary and hide the picker;
	 * - none do → hide the picker and leave the current selection as-is (any
	 *   folder is a valid primary when there are no hooks to run).
	 *
	 * The scan is intentionally scoped to `.github/hooks/*.json` only — it does
	 * NOT cover the `settings.json`-based hook sources discovery also recognizes
	 * (`.github/copilot/settings.json`, `.claude/settings.json`) — and never
	 * exposes what it finds as customizations, so what a session exposes is
	 * unchanged.
	 */
	async computeFolderPickerDecision(workingDirectories: readonly URI[], token: CancellationToken = CancellationToken.None): Promise<ISessionFolderPickerDecision | undefined> {
		if (!this._isMultiRootEnabled()) {
			return undefined;
		}
		return computeFolderPickerDecisionForRoots(workingDirectories, (directory, t) => workspaceDirectoryHasHooks(this._fileService, directory, t), token);
	}

	async handleMcpRequest(chat: URI, serverName: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		const entry = this._findChatByUri(chat);
		if (!entry || !isEqual(entry.chatChannelUri, chat)) {
			throw new Error(`Method not found: no active chat ${chat.toString()}`);
		}
		return entry.handleMcpRequest(serverName, method, params);
	}

	getMcpServerOwners(session: URI): ReadonlyMap<string, string> | undefined {
		return this._findSessionChat(session)?.mcpServerOwners();
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
		await this._authenticationSequencer.queue(async () => {
			this._authenticationRequired.set(undefined, undefined);
			await this._applyGitHubToken(token || undefined);
		});
		return true;
	}

	private async _applyGitHubToken(token: string | undefined): Promise<void> {
		if (this._githubToken === token) {
			return;
		}
		this._logService.info(`[Copilot] Auth token ${token ? 'updated' : 'cleared'}`);
		this._githubToken = token;
		this._updateRestrictedTelemetry(token);
		this._refreshProxy();
		if (!token) {
			await this._requestClientRestart('GitHub authentication cleared');
			void this._scheduleModelRefresh();
			return;
		}
		const host = this._gitHubEndpointService.getEnterpriseUri() ?? 'https://github.com';
		let restartRequired = false;
		this._updatingGitHubCredentials = true;
		try {
			for (const session of this._allLiveSessions()) {
				try {
					const result = await session.updateGitHubCredentials(host, token);
					if (!result.success) {
						restartRequired = true;
						this._logService.warn(`[Copilot:${session.sessionId}] GitHub credential update was rejected; scheduling a safe CopilotClient restart`);
					} else if (result.copilotUserResolved === false) {
						this._logService.warn(`[Copilot:${session.sessionId}] GitHub credentials were updated, but Copilot user metadata could not be resolved; plan, quota, and billing metadata may be degraded. Reauthenticate to restore it.`);
					}
				} catch (error) {
					restartRequired = true;
					this._logService.warn(`[Copilot:${session.sessionId}] Failed to update GitHub credentials; scheduling a safe CopilotClient restart: ${getErrorMessage(error)}`);
				}
			}
		} finally {
			this._updatingGitHubCredentials = false;
			await this._applyPendingClientRestart();
		}
		if (restartRequired) {
			await this._requestClientRestart('GitHub credential update failed');
		}
		await this._resolveCopilotSku(token);
		void this._scheduleModelRefresh();
	}

	private _handleCopilotSessionAuthRequired(): void {
		this._authenticationRequired.set({
			resource: this._gitHubEndpointService.getCopilotResource(),
			reason: AuthRequiredReason.Expired,
		}, undefined);
	}

	private async _resolveCopilotSku(githubToken: string): Promise<void> {
		try {
			const copilotSku = await this._copilotApiService.resolveCopilotSku?.(githubToken);
			if (copilotSku && this._githubToken === githubToken) {
				// __GDPR__COMMON__ "copilotSku" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The raw Copilot entitlement SKU of the authenticated GitHub account." }
				this._telemetryService.setCommonProperty('copilotSku', copilotSku);
			}
		} catch (err) {
			this._logService.debug(`[Copilot] SKU resolution failed: ${err instanceof Error ? err.message : String(err)}`);
		}
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
		// Keep restricted telemetry disabled until `/copilot_internal/user` confirms the opt-in.
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
			this._gitHubTelemetryForwarder.forward(notification, this._turnIdForTelemetry(notification.sessionId));
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

	private _turnIdForTelemetry(sdkSessionId: string | undefined): string | undefined {
		return sdkSessionId ? this._findSessionBySdkId(sdkSessionId)?.currentTurnId : undefined;
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
			if (/\b401\b/.test(getErrorMessage(err))) {
				this._handleCopilotSessionAuthRequired();
			}
			await this._handleClientOperationFailure(err, 'modelRefresh');
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
		const rootConfigValue = this._configurationService.getRootValue(platformRootSchema, AgentHostByokModelsEnabledConfigKey);
		const { enabled, trace } = resolveByokLmEnablement(rootConfigValue);
		this._logService.trace(`[Copilot] BYOK model publication ${trace}`);
		if (!enabled) {
			this._byokModels = [];
			this._publishModels();
			return;
		}
		this._byokModels = this._byokBridgeRegistry.getModels().map((m): IAgentModelInfo => {
			const byokMeta = createAgentModelByokMeta(m.modelIdentifier);
			const thinkingLevel = this._createThinkingLevelConfigSchemaProperty(m.supportedReasoningEfforts, m.defaultReasoningEffort, m.id);
			return {
				provider: this.id,
				id: getByokLmAgentModelId(m),
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
		return modelRefreshBackoff(attempt, this._modelRefreshBaseDelayMs, this._modelRefreshMaxDelayMs);
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

	private async _stopClientAfterStartupTermination(client: CopilotClient, terminalError: Error): Promise<never> {
		try {
			await client.stop();
		} catch (error) {
			this._logService.error(error, '[Copilot] Failed to stop client after startup termination');
		}
		throw terminalError;
	}

	/**
	 * Acquires the SDK client, transparently self-healing a single cold-start
	 * abort caused by a startup-config change (`CopilotClientStartupConfigChangedError`).
	 * That abort is transient: the superseded client was built with now-stale
	 * config and the next start uses the current config, so re-acquiring once
	 * returns a healthy client and no caller ever sees the abort.
	 *
	 * The re-acquire is bounded by {@link MAX_STARTUP_CONFIG_RETRIES}. All
	 * concurrent callers share one acquire-and-retry sequence via
	 * `_ensureClientHealing`, so the retry budget is global rather than per
	 * caller (a late caller cannot reset the budget and drive unbounded starts).
	 * The per-attempt coalescing in `_ensureClientOnce` (via `_clientStarting`) is
	 * unchanged.
	 */
	private _ensureClient(): Promise<CopilotClient> {
		if (this._ensureClientHealing) {
			return this._ensureClientHealing;
		}
		const healing = (async () => {
			try {
				for (let retries = 0; ; retries++) {
					try {
						return await this._ensureClientOnce();
					} catch (error) {
						if (retries < MAX_STARTUP_CONFIG_RETRIES
							&& !this._shutdownPromise
							&& error instanceof CopilotClientStartupConfigChangedError) {
							this._logService.info('[Copilot] Startup config changed while the client was starting; re-acquiring the client with the current config');
							continue;
						}
						throw error;
					}
				}
			} finally {
				// Clear the shared handle from inside the sequence so it is gone
				// before this promise settles for any awaiting caller. Clearing it
				// from a trailing `.finally()` on a separate chain would run one
				// microtask too late: a caller resuming on success could re-enter
				// `_ensureClient` (e.g. after `_stopClient()`) and be handed this
				// fulfilled handle for an already-stopped client. Only one healing
				// sequence is ever in flight — `_ensureClient` starts one only when
				// the field is empty, and this is the only site that clears it — so
				// this always owns the field here.
				this._ensureClientHealing = undefined;
			}
		})();
		this._ensureClientHealing = healing;
		return healing;
	}

	private async _ensureClientOnce(): Promise<CopilotClient> {
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
		if (!this._proxyRefresh) {
			this._refreshProxy();
		}
		// Snapshot the startup config so we can detect a change that lands while the
		// client is still starting and abort the stale start (the values are baked
		// into the client options / subprocess env below).
		const startupConfig = this._readClientStartupConfig();
		const attemptNumber = ++this._clientStartupAttemptCount;
		const startupStopWatch = StopWatch.create();
		const startClient = async () => {
			this._logService.info('[Copilot] Starting CopilotClient...');

			// Build a clean env for the CLI subprocess, stripping Electron/VS Code vars
			// that can interfere with the Node.js process the SDK spawns.
			const env = createCopilotCliEnvironment();
			// Family aliases are host-side (prompt and tool-profile routing) and
			// deliberately never reach the runtime; an ambient value here would
			// re-introduce a process-wide alias for every session behind its back.
			delete env['COPILOT_MODEL_FAMILY'];
			this._applyProxyEnv(env);
			setCopilotBuiltinGitHubMcpEnvironment(env, startupConfig.githubMcpServer);

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
			const enterpriseHost = startupConfig.enterpriseHost;
			if (enterpriseHost) {
				env['COPILOT_GH_HOST'] = enterpriseHost;
				this._logService.info(`[Copilot] Set CLI env: COPILOT_GH_HOST=${enterpriseHost}`);
			}

			// Enable the rubber duck critic subagent in the CLI when the agent host
			// config opts in. `RUBBER_DUCK_AGENT` is the SDK's required interface for
			// gating this experimental feature
			if (startupConfig.rubberDuck) {
				env['RUBBER_DUCK_AGENT'] = 'true';
			} else {
				delete env['RUBBER_DUCK_AGENT'];
			}

			// Let the Auto router score prior user messages instead of the latest
			// message alone. `MULTI_TURN_CONTEXT_ROUTING` is the runtime's local
			// override for the matching ExP flag, and only takes effect on top of
			// the single-call Auto endpoint that `createCopilotCliEnvironment`
			// already opts into.
			if (startupConfig.multiTurnContextRouting) {
				env['MULTI_TURN_CONTEXT_ROUTING'] = 'true';
			} else {
				delete env['MULTI_TURN_CONTEXT_ROUTING'];
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
			const copilotSdkLogLevelAtStartup = this._resolveCopilotSdkLogLevel(startupConfig.copilotSdkLogLevel);

			const clientOptions: CopilotClientOptions = {
				useLoggedInUser: false,
				connection: RuntimeConnection.forStdio({ path: cliPath }),
				env,
				telemetry,
				logLevel: copilotSdkLogLevelAtStartup,
				enableRemoteSessions: startupConfig.sessionSync,
				onGetTraceContext: () => this._otelService.getCurrentTraceContext() ?? {},
				onGitHubTelemetry: notification => { void this._routeGitHubTelemetry(notification).catch(err => this._logService.trace(`[Copilot] GitHub telemetry routing failed: ${err instanceof Error ? err.message : String(err)}`)); },
			};
			const client = this._createCopilotClient(clientOptions);
			await client.start();
			if (this._shutdownPromise) {
				return this._stopClientAfterStartupTermination(client, new CancellationError());
			}
			if (!this._readClientStartupConfig().equals(startupConfig)) {
				return this._stopClientAfterStartupTermination(client, new CopilotClientStartupConfigChangedError());
			}
			this._logService.info('[Copilot] CopilotClient started successfully');
			this._client = client;
			this._clientStarting = undefined;
			return client;
		};
		const clientStarting = (async () => {
			let outcome: 'success' | 'failure' | 'cancelled' = 'failure';
			let startupError: unknown;
			try {
				const client = await startClient();
				outcome = 'success';
				return client;
			} catch (error) {
				startupError = error;
				outcome = error instanceof CancellationError ? 'cancelled' : 'failure';
				throw error;
			} finally {
				reportCopilotClientStartup(this._telemetryService, {
					outcome,
					durationMs: startupStopWatch.elapsed(),
					attemptNumber,
				}, startupError);
			}
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

		// Offer both sizes; default to the full window when long context is free, else the smaller tier.
		return {
			type: 'number',
			title: localize('copilot.modelContextSize.title', "Context Size"),
			description: localize('copilot.modelContextSize.description', "Selects the context window size for this model."),
			default: hasLongContextSurcharge(billing) ? defaultMax : longContextMax,
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
	 * Whether the model has a larger long-context window at no additional cost. When true, a session
	 * with no explicit selection defaults to `long_context` while the picker still offers both sizes.
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

	async listChatsToMigrate(): Promise<IAgentChatMetadata[] | undefined> {
		const sessions = await this._listSdkSessions('chats to migrate', client => client.listSessions());
		if (!sessions) {
			return undefined;
		}
		const projectLimiter = new Limiter<IAgentSessionProjectInfo | undefined>(4);
		const metadataLimiter = new Limiter<IAgentChatMetadata | undefined>(4);
		const projectByContext = new Map<string, Promise<IAgentSessionProjectInfo | undefined>>();
		const mapped = await Promise.all(sessions.map(s => metadataLimiter.queue(async () => {
			const session = AgentSession.uri(this.id, s.sessionId);
			const chat = URI.parse(buildDefaultChatUri(session));
			const metadata = await this._readStoredSessionMetadata(session);
			if (!metadata || !(
				metadata.model !== undefined
				|| metadata.agent !== undefined
				|| metadata.workingDirectory !== undefined
				|| metadata.workingDirectories !== undefined
				|| metadata.customizationDirectory !== undefined
				|| metadata.project !== undefined
				|| metadata.resolved
				|| metadata.workspaceless !== undefined
			)) {
				return undefined;
			}
			let { project, resolved } = metadata;
			if (!resolved) {
				project = await this._resolveSessionProject(s.context, projectLimiter, projectByContext);
				void this._storeSessionProjectResolution(session, project);
			}
			const workingDirectories = metadata.workingDirectories ?? (typeof s.context?.workingDirectory === 'string' ? [URI.file(s.context.workingDirectory)] : undefined);
			const result: IAgentChatMetadata = {
				chat,
				startTime: s.startTime.getTime(),
				modifiedTime: s.modifiedTime.getTime(),
				project,
				summary: s.summary,
				workingDirectories,
			};
			return result;
		})));
		const result = mapped.filter((s): s is IAgentChatMetadata => s !== undefined);
		this._logService.info(`[Copilot] Found ${result.length} legacy sessions`);
		return result;
	}

	async collectDebugLogs(session: URI | undefined, outputDirectory: URI, chat?: URI): Promise<boolean> {
		const sessionTarget = chat ? this._findChatByUri(chat) : session ? this._findSessionChat(session) : undefined;
		if (sessionTarget) {
			return sessionTarget.collectDebugLogs(outputDirectory, true);
		}

		// A new/closed UI session can have a URI without a live SDK session. In
		// that case this is a host-wide export: use any live SDK session only as
		// the gateway to collect process logs, without attributing events or shell
		// logs from that unrelated session.
		const processLogsTarget = this._allLiveSessions()[0];
		if (!processLogsTarget) {
			return false;
		}
		return processLogsTarget.collectDebugLogs(outputDirectory, false);
	}

	async getSessionStateFile(session: URI): Promise<URI | undefined> {
		const resource = URI.file(join(getCopilotHomePath(this._environmentService.userHome.fsPath, process.env), 'session-state', this._sdkConversationId(session), 'events.jsonl'));
		return await this._fileService.exists(resource) ? resource : undefined;
	}

	private _copilotChatDiscovery: Promise<void> | undefined;
	private readonly _copilotChatDiscoverySequencer = new Sequencer();
	private readonly _discoveredChats = new Map<string, { readonly signature: string; readonly external: boolean }>();

	private _knownSessionsFilter: IAgentKnownSessionsFilter | undefined;

	setKnownSessionsFilter(filter: IAgentKnownSessionsFilter): void {
		this._knownSessionsFilter = filter;
	}

	/**
	 * One memoized initial discovery attempt, mirroring Claude and Codex. The
	 * CLI client may still be starting when the first discovery listener
	 * attaches, and {@link _listSdkSessions} reports that as "cannot enumerate
	 * yet" rather than an authoritative empty catalog, so the attempt is
	 * retried before giving up until the next explicit trigger.
	 */
	private _startCopilotChatDiscovery(): Promise<void> {
		if (!this._copilotChatDiscovery) {
			this._copilotChatDiscovery = this._runCopilotChatDiscovery();
		}
		return this._copilotChatDiscovery;
	}

	private _runCopilotChatDiscovery(): Promise<void> {
		return this._copilotChatDiscoverySequencer.queue(async () => {
			for (let attempt = 0; ; attempt++) {
				if (this._shutdownPromise || this._store.isDisposed) {
					// Teardown began between attempts; stop rather than sleep on a dead client.
					return;
				}
				if (await this._emitCopilotChats()) {
					return;
				}
				if (attempt >= CHAT_DISCOVERY_RETRY_DELAYS_MS.length) {
					this._logService.warn('[Copilot] Chat discovery failed: catalog never became available');
					return;
				}
				await timeout(CHAT_DISCOVERY_RETRY_DELAYS_MS[attempt]);
			}
		});
	}

	/**
	 * Emits the chats found by one discovery pass. External chats are emitted
	 * unconditionally; adoptable legacy extension-host chats are emitted only
	 * while in-place migration is enabled, because they are surfaced so the
	 * user can adopt them rather than as someone else's session.
	 *
	 * Returns whether the provider catalog could be enumerated at all, which is
	 * what {@link _startCopilotChatDiscovery} retries on.
	 */
	private async _emitCopilotChats(): Promise<boolean> {
		const migrateLegacyAtStart = this._isMigrateLegacyCopilotCliEnabled();
		try {
			const enumerated = await this._discoverCopilotChats(chats => this._publishDiscoveredChats(chats, migrateLegacyAtStart));
			return enumerated;
		} catch (err) {
			this._logService.warn('[Copilot] Failed to emit discovered chats', err);
			return false;
		}
	}

	/**
	 * Publishes one classified batch, filtering out chats that must not surface
	 * and ones whose signature is unchanged since the last pass. Batches are
	 * additive, so a large catalogue converges progressively instead of
	 * withholding every row until the whole scan completes.
	 */
	private _publishDiscoveredChats(chats: readonly IAgentDiscoveredChat[], migrateLegacyAtStart: boolean): void {
		if (this._shutdownPromise || this._store.isDisposed) {
			return;
		}
		const migrateLegacy = migrateLegacyAtStart && this._isMigrateLegacyCopilotCliEnabled();
		const emitted = chats.filter(chat => {
			if (!chat.external && !migrateLegacy) {
				return false;
			}
			const key = chat.chat.toString();
			const signature = JSON.stringify(chat);
			if (this._discoveredChats.get(key)?.signature === signature) {
				return false;
			}
			this._discoveredChats.set(key, { signature, external: chat.external });
			return true;
		});
		this._logService.info(`[Copilot] Chat discovery: emitting ${emitted.length} of ${chats.length} discovered chat(s) (adopt legacy extension-host chats: ${migrateLegacy})`);
		if (emitted.length > 0) {
			this._onDidDiscoverChats.fire(emitted);
		}
	}

	/**
	 * Enumerates the SDK catalog under `~/.copilot` and classifies every chat
	 * Agent Host does not already know about:
	 *
	 * - a legacy extension-host Copilot CLI chat is *internal* and adoptable in
	 *   place (see {@link ensureChatAdopted}), so it keeps `external: false`;
	 * - a non-adoptable chat is external only when its persisted `clientName`
	 *   identifies the standalone CLI or GitHub Copilot app. This value records
	 *   the runtime client that created or last resumed the chat, not immutable
	 *   creator provenance. External chats must also have repository metadata
	 *   and have been modified within the last seven days.
	 *
	 * Registered chats are filtered by the host, with stored metadata as a
	 * fallback when no host filter is installed. A chat the SDK reports
	 * without a working directory is skipped: {@link _doResumeSession} requires
	 * one and a discovered chat has no other source for it (Agent Host writes
	 * no metadata for it beyond the read marker), so it would surface as a row
	 * that throws on open.
	 *
	 * Classification is per-chat fallible — an unreadable session database
	 * would otherwise withhold the whole catalog and fail every retry — so a
	 * failing chat is logged and skipped while its siblings still surface.
	 *
	 * `undefined` means the catalog could not be enumerated yet — not an
	 * authoritative empty result.
	 */
	private async _discoverCopilotChats(publish: (chats: readonly IAgentDiscoveredChat[]) => void): Promise<boolean> {
		const sessions = await this._listSdkSessions('discoverable chats', async client => (await client.rpc.sessions.list({})).sessions);
		if (!sessions) {
			return false;
		}
		// Filter registered candidates with one registry query.
		const knownSessions = this._knownSessionsFilter
			? await this._knownSessionsFilter(sessions.map(s => AgentSession.uri(this.id, s.sessionId)))
			: undefined;
		// Skip project resolution for adoptable chats that will not be emitted.
		const emitAdoptable = this._isMigrateLegacyCopilotCliEnabled();
		const projectLimiter = new Limiter<IAgentSessionProjectInfo | undefined>(4);
		const metadataLimiter = new Limiter<IAgentDiscoveredChat | undefined>(4);
		const projectByContext = new Map<string, Promise<IAgentSessionProjectInfo | undefined>>();
		const earliestExternalModifiedTime = this._now() - COPILOT_EXTERNAL_SESSION_MAX_AGE_MS;
		let known = 0;
		let withoutWorkingDirectory = 0;
		let unsupportedClientName = 0;
		let outsideImportWindow = 0;
		let withoutRepository = 0;
		let suppressedAdoptable = 0;
		let suppressedArchived = 0;
		let failed = 0;
		let discovered = 0;
		let external = 0;
		const classify = (s: typeof sessions[number]) => metadataLimiter.queue(async () => {
			const session = AgentSession.uri(this.id, s.sessionId);
			try {
				if (knownSessions ? knownSessions.has(session.toString()) : !!(await this._readStoredSessionMetadata(session))) {
					known++;
					return undefined;
				}
				const adoptable = await this._isExtensionHostCliSession(s.sessionId);
				if (adoptable && !emitAdoptable) {
					suppressedAdoptable++;
					return undefined;
				}
				// A chat the user archived in the extension host list stays archived:
				// surfacing it here would resurface everything they filed away. It is
				// still adoptable once unarchived there.
				if (adoptable && await this._isExtensionHostCliSessionArchived(s.sessionId)) {
					suppressedArchived++;
					return undefined;
				}
				// A legacy chat the SDK reports without a cwd is still reachable: the
				// extension host records its own directory in the marker, and that is
				// the only source once the extension is retired.
				const workingDirectory = typeof s.context?.cwd === 'string'
					? URI.file(s.context.cwd)
					: adoptable ? await this._extensionHostCliWorkingDirectory(s.sessionId) : undefined;
				if (!workingDirectory) {
					withoutWorkingDirectory++;
					return undefined;
				}
				const modifiedTime = new Date(s.modifiedTime).getTime();
				if (!adoptable) {
					const clientName = s.isRemote ? undefined : s.clientName;
					if (clientName === undefined || !COPILOT_EXTERNAL_SESSION_CLIENT_NAMES.has(clientName)) {
						unsupportedClientName++;
						return undefined;
					}
					if (!Number.isFinite(modifiedTime) || modifiedTime < earliestExternalModifiedTime) {
						outsideImportWindow++;
						return undefined;
					}
					if (typeof s.context?.repository !== 'string' || s.context.repository.trim().length === 0) {
						withoutRepository++;
						return undefined;
					}
				}
				return {
					chat: URI.parse(buildDefaultChatUri(session)),
					startTime: new Date(s.startTime).getTime(),
					modifiedTime,
					// Always key the project off the resolved working directory: a worktree
					// session's context repository/gitRoot would resolve to the repo root.
					project: await this._localProject(
						await this._resolveSessionProject({ ...s.context, cwd: workingDirectory.fsPath }, projectLimiter, projectByContext),
						adoptable ? s.sessionId : undefined,
					),
					summary: s.summary,
					workingDirectories: [workingDirectory],
					_meta: adoptable ? withSessionEhcliAdoptable(undefined) : undefined,
					external: !adoptable,
				} satisfies IAgentDiscoveredChat;
			} catch (err) {
				failed++;
				this._logService.warn(`[Copilot] Failed to classify discovered chat ${session.toString()}; skipping it`, err);
				return undefined;
			}
		});
		for (let i = 0; i < sessions.length; i += COPILOT_DISCOVERY_BATCH_SIZE) {
			if (this._shutdownPromise || this._store.isDisposed) {
				return true;
			}
			const mapped = await Promise.all(sessions.slice(i, i + COPILOT_DISCOVERY_BATCH_SIZE).map(classify));
			const chats = mapped.filter((chat): chat is IAgentDiscoveredChat => chat !== undefined);
			if (chats.length > 0) {
				discovered += chats.length;
				external += chats.filter(chat => chat.external).length;
				publish(chats);
			}
		}
		this._logService.info(`[Copilot] Chat discovery: ${sessions.length} SDK session(s) -> ${external} external, ${discovered - external} adoptable legacy extension-host, ${suppressedAdoptable} suppressed adoptable legacy extension-host, ${suppressedArchived} suppressed archived legacy extension-host, ${known} already known to Agent Host, ${withoutWorkingDirectory} without a working directory, ${unsupportedClientName} with unsupported or missing client name, ${outsideImportWindow} outside the import window, ${withoutRepository} without repository metadata, ${failed} failed to classify (adopt legacy extension-host chats: ${emitAdoptable})`);
		return true;
	}

	private async _listSdkSessions<T>(reason: string, listSessions: (client: CopilotClient) => Promise<readonly T[]>): Promise<readonly T[] | undefined> {
		this._logService.info(`[Copilot] Listing ${reason}...`);
		try {
			const sessions = await this._retryAfterClosedConnection('listSessions', listSessions);
			this._logService.info(`[Copilot] Listed ${sessions.length} SDK session(s) for ${reason}`);
			return sessions;
		} catch (err) {
			if (err instanceof CancellationError || isRecognizedCopilotClientStartupFailure(err) || classifyCopilotClientOperationFailure(err) !== undefined) {
				this._logService.info(`[Copilot] Client unavailable while listing ${reason}: ${err instanceof Error ? err.message : String(err)}`);
				return undefined;
			}
			throw err;
		}
	}

	async getChatMetadata(chat: URI, context: URI | IAgentChatContext, providerData?: string): Promise<IAgentChatMetadata | undefined> {
		const session = resolveAgentChatContext(context, chat).configurationResource;
		const sessionId = providerData ? decodeProviderData(providerData)?.sdkSessionId : AgentSession.id(session);
		if (!sessionId) {
			return undefined;
		}
		const storedMetadata = await this._readStoredSessionMetadata(session);

		const sessionMetadata = await this._retryAfterClosedConnection('getSessionMetadata', client => client.getSessionMetadata(sessionId), createCopilotFailureCorrelation(session, chat, undefined, sessionId));
		if (!sessionMetadata) {
			return undefined;
		}

		let project = storedMetadata?.project;
		if (!storedMetadata?.resolved) {
			const projectLimiter = new Limiter<IAgentSessionProjectInfo | undefined>(1);
			project = await this._resolveSessionProject(sessionMetadata?.context, projectLimiter, new Map<string, Promise<IAgentSessionProjectInfo | undefined>>());
			if (storedMetadata) {
				void this._storeSessionProjectResolution(session, project);
			}
		}

		const workingDirectories = storedMetadata?.workingDirectories ?? (typeof sessionMetadata?.context?.workingDirectory === 'string' ? [URI.file(sessionMetadata.context.workingDirectory)] : undefined);
		const adoptable = !storedMetadata && await this._isExtensionHostCliSession(sessionId);
		return {
			chat,
			startTime: sessionMetadata?.startTime.getTime() ?? Date.now(),
			modifiedTime: sessionMetadata?.modifiedTime.getTime() ?? Date.now(),
			project,
			summary: sessionMetadata?.summary,
			workingDirectories,
			_meta: adoptable ? withSessionEhcliAdoptable(undefined) : undefined,
		};
	}

	private async _listModels(gitHubToken: string): Promise<IAgentModelInfo[]> {
		this._logService.info('[Copilot] Listing models...');
		const client = await this._ensureClient();
		const { models } = await client.rpc.models.list({ gitHubToken });
		this._freeLongContextModels.clear();
		const result = models.map((m): IAgentModelInfo => {
			const billing = normalizeCAPIBilling(m.billing);
			const configSchema = this._createModelConfigSchema(m, billing);
			// Free long context: a larger long-context window at no surcharge. Defaults to the full window; picker keeps both.
			const tokenPrices = billing?.tokenPrices;
			const hasLargerLongContext = !!tokenPrices?.contextMax
				&& !!tokenPrices.longContext?.contextMax
				&& tokenPrices.longContext.contextMax > tokenPrices.contextMax;
			if (hasLargerLongContext && !hasLongContextSurcharge(billing)) {
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

	/** Exact Copilot SDK session-id lookup; use chat-based helpers for routing. */
	private _findSessionBySdkId(sdkSessionId: string): CopilotAgentSession | undefined {
		return this._chatEntriesBySdkId.get(sdkSessionId)?.chatSession;
	}

	/** Returns the live chat whose persistence scope is the session itself. */
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

	/** Resolves the Copilot SDK conversation id backing a session URI, falling back to the AH session id. */
	private _sdkConversationId(session: URI): string {
		const sessionId = AgentSession.id(session);
		return this._findSessionChat(session)?.sessionId
			?? this._provisionalSessions.get(sessionId)?.sdkSessionId
			?? this._chatBackings.get(buildDefaultChatUri(session))?.sdkSessionId
			?? sessionId;
	}

	/** Returns the chat URI bound to the session-backed chat, if any. */
	private _findSessionChatUri(session: URI): URI | undefined {
		return this._findBoundSessionChatUri(this._sdkConversationId(session));
	}

	/** Normalizes an addressed chat operation and refreshes any host snapshot carried in its context. */
	private _resolveChatContext(chat: URI, sessionOrContext: AgentChatOperationContext): IResolvedCopilotChatContext {
		const explicit = resolveAgentChatContext(sessionOrContext, chat);
		this._noteHostCustomizations(sessionOrContext);
		return this._resolveExplicitChatContext(chat, explicit);
	}

	private _resolveSendChatContext(chat: URI, operationContext?: AgentChatOperationContext): IResolvedCopilotChatContext {
		if (operationContext) {
			return this._resolveChatContext(chat, operationContext);
		}
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

	/** Legacy truncation may still omit context for a live chat. */
	private _resolveTruncateChatContext(chat: URI, operationContext?: URI | IAgentChatContext): IResolvedCopilotChatContext {
		if (operationContext) {
			return this._resolveChatContext(chat, operationContext);
		}
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
		disposeChat: (chatUri: URI, context: URI | IAgentChatContext): Promise<void> => this._disposeChat(chatUri, context),
		canReleaseChat: (chatUri: URI, context: URI | IAgentChatContext): Promise<boolean> => this._canReleaseChat(chatUri, context),
		releaseChat: (chatUri: URI, context: URI | IAgentChatContext): Promise<void> => this._releaseChat(chatUri, context),
		sendMessage: (chatUri: URI, prompt: string, workingDirectoriesOrDirectory: readonly URI[] | URI | undefined, attachments?: readonly MessageAttachment[], turnId?: string, senderClientId?: string, clientTypeOrContext?: AgentHostClientType | URI | IAgentChatContext, context?: URI | IAgentChatContext): Promise<void> => {
			const workingDirectories = Array.isArray(workingDirectoriesOrDirectory) ? workingDirectoriesOrDirectory : workingDirectoriesOrDirectory ? [workingDirectoriesOrDirectory] : undefined;
			const clientType = typeof clientTypeOrContext === 'string' ? clientTypeOrContext : AgentHostClientType.Unknown;
			const operationContext = context ?? (typeof clientTypeOrContext === 'string' ? undefined : clientTypeOrContext);
			const clientTelemetryContext = URI.isUri(operationContext) ? undefined : operationContext?.clientTelemetryContext;
			return this._sendMessage(chatUri, prompt, attachments, turnId, senderClientId, clientType, workingDirectories, operationContext, clientTelemetryContext);
		},
		abort: (chatUri: URI, context: URI | IAgentChatContext): Promise<void> => {
			return this._abortSession(chatUri, context);
		},
		getModel: (chatUri: URI): ModelSelection | undefined => this._chatBackings.get(chatUri.toString())?.model,
		changeModel: (chatUri: URI, model: ModelSelection, context: URI | IAgentChatContext): Promise<void> => {
			return this._changeModel(chatUri, model, context);
		},
		changeAgent: (chatUri: URI, agent: AgentSelection | undefined, context: URI | IAgentChatContext): Promise<void> => {
			return this._changeAgent(chatUri, agent, context);
		},
		getMessages: (chat: URI, context: URI | IAgentChatContext): Promise<readonly Turn[]> => this._getChatMessages(chat, context),
	};

	getTurnDiagnosticSnapshot(chat: URI, turnId: string): IAgentTurnDiagnosticSnapshot {
		const session = this._findChatByUri(chat);
		if (!session) {
			return { state: 'missingChat' };
		}
		return session.getTurnDiagnosticSnapshot(turnId) ?? { state: 'missingTurn' };
	}

	/** Creates one exact chat backing: fresh, deferred, imported, or forked. */
	private async _createChat(chat: URI, context: IAgentChatContext, options: IAgentCreateChatOptions = {}): Promise<IAgentCreateChatResult> {
		const scope = context.configurationResource;
		const chatKey = chat.toString();
		// A duplicate/reconnect create call for a chat the agent already binds —
		// live (a real running session), provisional/reserved, or restored via
		// `materializeChat` — must never roll back that preexisting binding just
		// because this particular retry fails; only a brand-new chat's own
		// partial state is ours to unwind. Captured before `_rememberChatScope`
		// runs (which re-records the same scope for an idempotent duplicate) so
		// the check reflects what existed walking in, not what this call added.
		const preexisting = this._chatScopes.has(chatKey) || this._chatBackings.has(chatKey) || !!this._findChatByUri(chat);
		this._rememberChatScope(chat, scope, context.resource);
		try {
			if (options.deferBacking) {
				return await this._reserveChatBacking(chat, context, options);
			}
			if (options.importConversation) {
				return await this._importChatBacking(chat, context, options);
			}
			return await this._mintChatBacking(chat, context, options);
		} catch (error) {
			if (!preexisting) {
				await this._rollbackFailedChatCreate(chat, scope, options.workingDirectories === undefined);
			}
			throw error;
		}
	}

	/**
	 * Undoes the bookkeeping {@link _createChat} recorded for `chat` before a
	 * create attempt throws (client startup, import/resume, or fork/model/mint
	 * failures), so a failed create never permanently pins the configuration
	 * scope's shared runtime. Without this, the scope recorded by
	 * {@link _rememberChatScope} before the failing operation stays in
	 * {@link _chatScopes} forever, so {@link _remainingChatsForScope} never
	 * reaches zero and the scope's ActiveClient/plugin/MCP state, session
	 * lifetime, host customizations, scratch dir, and trace context leak for
	 * the lifetime of the process.
	 *
	 * Only this chat's own membership/partial state is torn down here; the
	 * scope's provider-owned resources are finalized — the same cleanup a
	 * normal `disposeChat` runs once the last chat is gone — only when no
	 * other chat still shares `scope`, so an earlier successful sibling create
	 * keeps the resources it depends on.
	 *
	 * Callers must only invoke this for a chat that had no preexisting
	 * binding when `_createChat` started; {@link _createChat} itself guards
	 * that, so a duplicate/reconnect create attempt that fails never tears
	 * down the live/provisional/restored binding it found already in place.
	 */
	private async _rollbackFailedChatCreate(chat: URI, scope: URI, workspacelessHint: boolean): Promise<void> {
		const chatKey = chat.toString();
		const scopeId = AgentSession.id(scope);
		// The scope was recorded optimistically before the create attempt; it
		// never produced a backing, so it must stop counting as a live chat.
		this._chatScopes.delete(chatKey);
		this._chatStorageScopes.delete(chatKey);
		// A partially-completed reserve/import can record a backing before the
		// operation that follows it fails (e.g. `_resumeSession` records one
		// unconditionally before resuming) — drop any such ghost entry.
		this._chatBackings.delete(chatKey);
		// Drop this chat's membership from the scope's ActiveClient, if any was
		// claimed before the failure (a no-op otherwise).
		this._activeClients.get(scope)?.removeChat(chat);
		try {
			// No other chat still shares this scope: run the same provider-owned
			// cleanup a normal `disposeChat` runs once the last chat is gone.
			if (this._remainingChatsForScope(scope) === 0) {
				await this._finalizeConfigurationScope(scope, scopeId, workspacelessHint);
			}
		} catch (cleanupError) {
			this._logService.warn(`[Copilot] Failed to finalize configuration scope ${scope.toString()} after a failed chat creation: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
		}
	}

	/** Reserves an SDK id now and defers real session creation to the first send. */
	private async _reserveChatBacking(chat: URI, context: IAgentChatContext, options: IAgentCreateChatOptions): Promise<IAgentCreateChatResult> {
		const session = context.configurationResource;
		const sessionId = AgentSession.id(session);
		this._logService.info(`[Copilot] Creating chat ${chat.toString()} with a deferred backing... ${options.model ? `model=${options.model.id}` : ''}`);
		const sdkSessionId = generateUuid();
		// No working directory means a workspace-less chat that runs in a stable scratch dir.
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
			// membership with it. The host's first `getOrCreateActiveClient`
			// fan-out for a peer chat adds to this incrementally.
			this._adoptClientChat(ac, seeded.clientId, chat);
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
				isEphemeral: options.isEphemeral === true,
				hasScopedEditSurface: options.hasScopedEditSurface === true,
				workingDirectory,
				workingDirectories: options.workingDirectories,
				model: options.model,
				agent: options.agent,
				project,
				workspaceless: isWorkspaceless,
			});
			this._chatBackings.set(chat.toString(), { sdkSessionId, ...(options.model ? { model: options.model } : {}) });
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

	/** Seeds an imported conversation into the SDK store, then resumes it as a live editable chat. */
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

	/** Absolute path of an extension-host Copilot CLI sidecar file for `sessionId`. */
	private _extensionHostCliSidecarPath(sessionId: string, fileName: string): string {
		return join(getCopilotHomePath(this._environmentService.userHome.fsPath, process.env), 'session-state', sessionId, fileName);
	}

	/** Memoizes the (stable) marker read so repeated `listSessions` calls don't re-read the disk. */
	private readonly _extensionHostCliMarkerCache = new Map<string, Promise<IExtensionHostCliMarker | undefined>>();

	/**
	 * Reads and parses the `vscode.metadata.json` marker for `sessionId`, or
	 * `undefined` when it is missing/unreadable/malformed.
	 */
	private _readExtensionHostCliMarker(sessionId: string): Promise<IExtensionHostCliMarker | undefined> {
		let cached = this._extensionHostCliMarkerCache.get(sessionId);
		if (!cached) {
			cached = fs.readFile(this._extensionHostCliSidecarPath(sessionId, EXTENSION_HOST_CLI_MARKER_FILE), 'utf8')
				.then(raw => parseExtensionHostCliMarker(raw))
				.catch(() => undefined);
			this._extensionHostCliMarkerCache.set(sessionId, cached);
			// Only a successful read is durable. The extension host may write the
			// marker after this probe (a session created while the host is running),
			// so memoizing the miss would classify it as non-adoptable until restart.
			const pending = cached;
			void pending.then(marker => {
				if (marker === undefined && this._extensionHostCliMarkerCache.get(sessionId) === pending) {
					this._extensionHostCliMarkerCache.delete(sessionId);
				}
			});
		}
		return cached;
	}

	private async _isExtensionHostCliSession(sessionId: string): Promise<boolean> {
		return isExtensionHostCliMarker(await this._readExtensionHostCliMarker(sessionId));
	}

	/** Reads the marker from disk, bypassing the cache, for its mutable fields. */
	private async _readExtensionHostCliMarkerUncached(sessionId: string): Promise<IExtensionHostCliMarker | undefined> {
		try {
			const marker = parseExtensionHostCliMarker(await fs.readFile(this._extensionHostCliSidecarPath(sessionId, EXTENSION_HOST_CLI_MARKER_FILE), 'utf8'));
			if (marker) {
				this._extensionHostCliMarkerCache.set(sessionId, Promise.resolve(marker));
			}
			return marker;
		} catch {
			return undefined;
		}
	}

	/** Reads a legacy extension-host Copilot CLI custom title, if present. */
	private async _readExtensionHostCliCustomTitle(sessionId: string): Promise<string | undefined> {
		const title = (await this._readExtensionHostCliMarker(sessionId))?.customTitle;
		return typeof title === 'string' && title.trim() ? title : undefined;
	}

	/**
	 * Whether the user archived this session in the extension host list, or
	 * `undefined` when the current state cannot be established (unreadable or
	 * malformed marker, or one that no longer identifies a VS Code legacy chat).
	 * Callers that would commit to the state must not treat that as unarchived.
	 */
	private async _isExtensionHostCliSessionArchived(sessionId: string): Promise<boolean | undefined> {
		// Archive state is toggled in the extension host while this agent runs, so it
		// cannot be served from the marker cache, which memoizes successful reads.
		const marker = await this._readExtensionHostCliMarkerUncached(sessionId);
		if (!isExtensionHostCliMarker(marker)) {
			return undefined;
		}
		return marker?.archived === true;
	}

	/** Whether `path` is a directory that still exists on disk. */
	private async _isExistingDirectory(path: string): Promise<boolean> {
		try {
			return (await fs.stat(path)).isDirectory();
		} catch {
			return false;
		}
	}

	/**
	 * Working directory recorded in the extension host's own marker, used when the
	 * SDK reports no `workingDirectory` for a legacy chat. The extension host
	 * resolves such chats from this same file, so without it they would be dropped
	 * here and become unreachable once the extension is retired.
	 */
	private async _extensionHostCliWorkingDirectory(sessionId: string): Promise<URI | undefined> {
		// Adoption is durable and one-way, so never persist a recorded path that no
		// longer exists (a deleted worktree is the common case).
		for (const candidate of extensionHostCliWorkingDirectoryPaths(await this._readExtensionHostCliMarker(sessionId))) {
			if (await this._isExistingDirectory(candidate)) {
				return URI.file(candidate);
			}
		}
		return undefined;
	}

	/**
	 * Worktree identity the extension host recorded, when its checkout is gone but
	 * the repository remains. Resume recreates the worktree from this, matching how
	 * a natively worktree-isolated session recovers.
	 */
	private async _extensionHostCliAdoptedWorktree(sessionId: string): Promise<IAgentAdoptedWorktree | undefined> {
		const worktree = (await this._readExtensionHostCliMarker(sessionId))?.worktreeProperties;
		if (!worktree?.worktreePath || !worktree.repositoryPath || !worktree.branchName) {
			return undefined;
		}
		if (await this._isExistingDirectory(worktree.worktreePath) || !(await this._isExistingDirectory(worktree.repositoryPath))) {
			return undefined;
		}
		return {
			branchName: worktree.branchName,
			baseBranch: worktree.baseBranchName,
			worktreePath: URI.file(worktree.worktreePath),
			repositoryRoot: URI.file(worktree.repositoryPath),
		};
	}

	/**
	 * Records the durable adopted-legacy marker on a session adopted by a build
	 * that predates it. Without this those sessions keep the extension-host marker
	 * but no provenance, so a worktree one stays filtered out of the window opened
	 * on its repository. Keyed off the marker, so it never claims a native session.
	 */
	private async _backfillAdoptedLegacyMarker(session: URI, sessionId: string): Promise<void> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return;
		}
		try {
			if (await ref.object.getMetadata(AH_META_EHCLI_ADOPTED_DB_KEY) !== undefined) {
				return;
			}
			if (!(await this._isExtensionHostCliSession(sessionId))) {
				return;
			}
			await ref.object.setMetadata(AH_META_EHCLI_ADOPTED_DB_KEY, 'true');
			this._logService.info(`[Copilot] Backfilled the adopted-legacy marker for ${sessionId}, migrated before it was recorded`);
		} catch (err) {
			this._logService.warn(`[Copilot] Failed to backfill the adopted-legacy marker for ${sessionId}`, err);
		} finally {
			ref.dispose();
		}
	}

	/** Adopts a legacy extension-host Copilot CLI session in place when it is eligible on disk. */
	async ensureChatAdopted(chat: URI, context: URI | IAgentChatContext): Promise<IAgentChatAdoptionResult> {
		const session = resolveAgentChatContext(context, chat).configurationResource;
		const sessionId = AgentSession.id(session);
		return this._queueSession(sessionId, async () => {
			// A genuine native / already-adopted session always has a persisted
			// working directory. The session DB FILE can also exist without any
			// real metadata (checkpoint / changeset / git services create it via
			// `openDatabase`), so gate on `workingDirectory` — not mere DB
			// existence — to avoid falsely treating an empty DB as migrated.
			const existing = await this._readStoredSessionMetadata(session);
			if (existing?.workingDirectory) {
				await this._backfillAdoptedLegacyMarker(session, sessionId);
				this._logService.trace(`[Copilot] Adoption skipped for ${sessionId}: already has Agent Host metadata (cwd=${existing.workingDirectory.fsPath})`);
				return { adopted: false, eligible: false, native: true, reason: 'alreadyNative' };
			}
			// Only migrate legacy EH Copilot CLI sessions — never other Copilot SDK
			// sessions (standalone CLI, Local agent, …) that share `~/.copilot`.
			if (!(await this._isExtensionHostCliSession(sessionId))) {
				this._logService.info(`[Copilot] Adoption declined for ${sessionId}: not a legacy extension-host Copilot CLI chat (no VS Code marker in its SDK session directory)`);
				return { adopted: false, eligible: false, reason: 'notLegacyChat' };
			}
			const client = await this._ensureClient();
			const sdkMetadata = await client.getSessionMetadata(sessionId).catch(() => undefined);
			// The SDK reports the directory recorded when the session ran, which may since
			// have been deleted (a removed worktree). Adopting it anyway commits the claim
			// and then fails to resume, leaving the session in neither list.
			const sdkWorkingDirectory = typeof sdkMetadata?.context?.workingDirectory === 'string' ? sdkMetadata.context.workingDirectory : undefined;
			// A deleted worktree is recoverable the same way a native session recovers
			// one: keep it as the working directory and let resume recreate it from the
			// recorded branch.
			const adoptedWorktree = await this._extensionHostCliAdoptedWorktree(sessionId);
			const workingDirectory = adoptedWorktree?.worktreePath
				?? (sdkWorkingDirectory && await this._isExistingDirectory(sdkWorkingDirectory) ? URI.file(sdkWorkingDirectory) : undefined)
				?? await this._extensionHostCliWorkingDirectory(sessionId);
			if (!workingDirectory) {
				// An eligible legacy session whose on-disk working directory could not
				// be resolved: a genuine migration candidate that did not migrate.
				this._logService.warn(`[Copilot] Adoption skipped for ${sessionId}: no usable working directory (sdk='${sdkWorkingDirectory ?? '(none)'}' exists=${sdkWorkingDirectory ? await this._isExistingDirectory(sdkWorkingDirectory) : false}, no recorded worktree, no marker fallback). The session stays on the legacy provider.`);
				return { adopted: false, eligible: true, reason: 'workingDirectoryMissing' };
			}
			this._logService.info(`[Copilot] Adopting legacy session ${sessionId} in place (reusing on-disk events.jsonl): cwd=${workingDirectory.fsPath}${adoptedWorktree ? ` worktree=${adoptedWorktree.worktreePath.fsPath} branch=${adoptedWorktree.branchName} base=${adoptedWorktree.baseBranch ?? '(none)'} repo=${adoptedWorktree.repositoryRoot.fsPath} (checkout missing, will be recreated on resume)` : ''}`);
			// Resolve the project from the SDK-derived cwd (authoritative) — the
			// caller may not have supplied a working directory (e.g. the chat
			// editor), so we cannot trust a hint.
			const project = await this._localProject(
				await projectFromCopilotContext({ cwd: (adoptedWorktree?.repositoryRoot ?? workingDirectory).fsPath }, this._gitService),
				sessionId,
			);
			// Carry over the user-chosen session name (EH `customTitle`) so the
			// adopted session keeps its title instead of regenerating one.
			const customTitle = await this._readExtensionHostCliCustomTitle(sessionId);
			const archived = await this._isExtensionHostCliSessionArchived(sessionId);
			if (archived === undefined) {
				// Adoption commits the archived state, and the extension host stops listing
				// the chat once it does. Guessing `false` here would resurface a session the
				// user had filed away, so leave it for the next open instead.
				this._logService.warn(`[Copilot] Adoption skipped for ${sessionId}: its extension-host marker could not be re-read, so the archived state is unknown`);
				return { adopted: false, eligible: true, reason: 'markerUnavailable' };
			}
			// Seed VS Code-layer metadata only — the SDK event log on disk is
			// untouched. Writing `agentSessionData/<sanitizedId>/session.db` here
			// is also what makes the legacy extension-host Copilot CLI list stop
			// showing this session (it dedups against agent-host-owned session ids).
			// `isolation: 'folder'` keeps the session in place in the reused cwd —
			// a git repo would otherwise default to worktree and show a spurious
			// "Creating worktree…".
			await this._storeSessionMetadata(session, undefined, workingDirectory, [workingDirectory], workingDirectory, project, project !== undefined, { [SessionConfigKey.Isolation]: 'folder' }, customTitle, /* markRead */ true, archived, /* ehcliAdopted */ true);
			await this._adoptLegacyTurnUsage(session, sessionId);
			this._logService.info(`[Copilot] Adopted legacy session ${sessionId}: project=${project ? project.uri.fsPath : '(unresolved)'} archived=${archived} customTitle=${customTitle !== undefined} worktreeBridged=${!!adoptedWorktree}`);
			return { adopted: true, eligible: true, reason: 'adopted', ...(adoptedWorktree ? { worktree: adoptedWorktree } : {}) };
		});
	}

	/**
	 * Carries the per-request credit totals the extension host persisted in
	 * `vscode.requests.metadata.json` into the adopted session's `turn_usage`
	 * rows, so restored turns keep their "credits used" gauge. Best-effort: a
	 * missing/malformed sidecar or a write failure must never fail adoption.
	 *
	 * Only ever called from {@link ensureChatAdopted} once a legacy extension-host
	 * Copilot CLI session has passed every eligibility gate and is actually being
	 * migrated — no native or non-VS Code Copilot session's usage is read or written.
	 */
	private async _adoptLegacyTurnUsage(session: URI, sessionId: string): Promise<void> {
		// Absent for sessions predating the extension host's credit tracking, so a
		// missing sidecar is the expected case, not a failure.
		const raw = await fs.readFile(this._extensionHostCliSidecarPath(sessionId, 'vscode.requests.metadata.json'), 'utf8').catch(() => undefined);
		if (raw === undefined) {
			return;
		}
		try {
			const parsed: unknown = JSON.parse(raw);
			if (!Array.isArray(parsed)) {
				return;
			}
			// Each entry is keyed by the SDK `user.message` envelope id, which is
			// also the turn id `mapSessionEvents` restores the turn under.
			const rows: { readonly turnId: string; readonly usage: UsageInfo }[] = [];
			for (const entry of parsed as readonly IExtensionHostCliRequestDetails[]) {
				const turnId = entry?.copilotRequestId;
				const credits = entry?.creditsUsed;
				if (typeof turnId !== 'string' || !turnId || typeof credits !== 'number' || !Number.isFinite(credits) || credits < 0) {
					continue;
				}
				rows.push({
					turnId,
					usage: {
						...(typeof entry.responseModelId === 'string' && entry.responseModelId ? { model: entry.responseModelId } : {}),
						_meta: { copilotUsage: { totalNanoAiu: Math.round(credits * NANO_AIU_PER_CREDIT) } },
					},
				});
			}
			if (rows.length === 0) {
				return;
			}
			const dbRef = this._sessionDataService.openDatabase(session);
			try {
				for (const row of rows) {
					await dbRef.object.setTurnUsage(row.turnId, JSON.stringify(row.usage));
				}
			} finally {
				dbRef.dispose();
			}
			this._logService.info(`[Copilot] Adopted ${rows.length} legacy turn usage records for session ${sessionId}`);
		} catch (err) {
			this._logService.warn(`[Copilot] Failed to adopt legacy turn usage for session ${sessionId}`, err);
		}
	}

	/** Materializes a provisional chat into a real SDK session immediately before first send. */
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
			const resolvedAgent = provisional.isEphemeral ? undefined : await this._resolveAgentWhenMaterializing(provisional, snapshot, workingDirectory);
			agent = resolvedAgent?.agent;
			const launchPlan: CopilotSessionLaunchPlan = {
				kind: 'create',
				client,
				sessionId: sdkSessionId,
				isEphemeral: provisional.isEphemeral,
				hasScopedEditSurface: provisional.hasScopedEditSurface,
				workingDirectory,
				additionalDirectories: this._additionalCustomizationDirectories(resolvedWorkingDirectories),
				resolvedAgentName: resolvedAgent?.name,
				snapshot,
				disabledRootMcpServers: await this._disabledRootMcpServers(sessionUri, sdkSessionId, snapshot),
				activeClientToolSet: activeClient.toolSet,
				shellManager,
				githubToken: this._githubToken,
				model: provisional.model,
				longContextWindow: this._longContextWindowFor(provisional.model?.id),
				freeLongContext: this._isFreeLongContext(provisional.model?.id),
				workspaceless: provisional.workspaceless,
			};
			const chatChannelUri = this._findBoundSessionChatUri(sdkSessionId) ?? URI.parse(buildDefaultChatUri(sessionUri));
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
		this._onDidMaterializeChat.fire({ chat: provisional.chat, project, workingDirectories: materializedWorkingDirectories });
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

	async resolveChatConfig(params: IAgentResolveChatConfigParams): Promise<ResolveSessionConfigResult> {
		// Isolation / branch are contributed by the host (see
		// AgentService._withHostSessionConfigContributions); this agent only owns its platform
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

	getInheritedChatConfig(config: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined {
		const inherited: Record<string, unknown> = {};
		for (const key of [SessionConfigKey.AutoApprove, SessionConfigKey.Permissions]) {
			if (config[key] !== undefined) {
				inherited[key] = config[key];
			}
		}
		return Object.keys(inherited).length > 0 ? inherited : undefined;
	}

	getAutonomousSessionConfig(_config: Readonly<Record<string, unknown>>): Record<string, unknown> {
		return {
			[SessionConfigKey.Mode]: 'autopilot' satisfies SessionMode,
			...(this._configurationService.getRootValue(platformRootSchema, AgentHostAutoApprovePolicyRestrictedConfigKey) !== true
				? { [SessionConfigKey.AutoApprove]: 'assisted' satisfies AutoApproveLevel }
				: {}),
		};
	}

	async chatConfigCompletions(_params: IAgentChatConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		// Branch completions (the only dynamic Copilot property) are owned by the
		// host now; no provider-specific completions remain.
		return { items: [] };
	}

	/** Records that `client` contributes to `chat` within the owning configuration scope. */
	getOrCreateActiveClient(chat: URI, context: URI | IAgentChatContext, client: { readonly clientId: string; readonly displayName?: string }, hostCustomizations?: readonly Customization[]): IActiveClient {
		const configurationResource = resolveAgentChatContext(context, chat).configurationResource;
		this._rememberHostCustomizations(configurationResource, hostCustomizations);
		const activeClient = this._getOrCreateActiveClient(configurationResource, undefined);
		this._adoptClientChat(activeClient, client.clientId, chat);
		// Anchor the customization directory (best-effort, idempotent) so
		// session-discovered customizations surface alongside this client's,
		// mirroring the previous eager resolution in `setClientCustomizations`.
		if (!activeClient.pluginController.directory) {
			this._getSessionCustomizationAnchors(configurationResource).then(
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

	/** Adds `chat` to the host-published membership for `clientId`. */
	private _adoptClientChat(activeClient: ActiveClient, clientId: string, chat: URI): void {
		if (activeClient.addClientChat(clientId, chat)) {
			this._logService.info(`[Copilot] Active client ${clientId} now contributes to chat ${chat.toString()}`);
		}
	}

	/** Removes `clientId` from one exact chat, dropping the client only when no chats remain. */
	removeActiveClient(chat: URI, context: URI | IAgentChatContext, clientId: string): void {
		const configurationResource = resolveAgentChatContext(context, chat).configurationResource;
		const configurationId = AgentSession.id(configurationResource);
		const activeClient = this._activeClients.get(configurationResource);
		if (!activeClient) {
			this._logService.info(`[Copilot:${configurationId}] removeActiveClient: no active client state for clientId=${clientId}, chat=${chat.toString()}`);
			return;
		}
		const wasLastChat = activeClient.removeClientChat(clientId, chat);
		this._logService.info(`[Copilot:${configurationId}] removeActiveClient: clientId=${clientId}, chat=${chat.toString()}, fullyRemoved=${wasLastChat}`);
		if (wasLastChat) {
			activeClient.removeClient(clientId);
		}
	}

	/** Routes a completed client tool call to the runtime that owns it. */
	onClientToolCallComplete(chat: URI, toolCallId: string, result: ToolCallResult, context?: IAgentChatContext): void {
		const spawnedFrom = resolveSubagentChatParent(context);
		const target = this._findChatByUri(chat)
			?? (spawnedFrom ? this._findChatByUri(spawnedFrom.chat) : undefined)
			?? (context ? this._findSessionChat(context.configurationResource) : undefined);
		target?.handleClientToolCallComplete(toolCallId, result);
	}

	private async _sendMessage(chat: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, senderClientId?: string, clientType = AgentHostClientType.Unknown, workingDirectories?: readonly URI[], operationContext?: URI | IAgentChatContext, clientTelemetryContext?: IAgentHostClientTelemetryContext): Promise<void> {
		try {
			await this._sendMessageOnce(chat, prompt, attachments, turnId, senderClientId, clientType, workingDirectories, operationContext, clientTelemetryContext);
		} catch (error) {
			const recovery = await this._handleClientOperationFailure(error, 'sendMessage', this._clientFailureCorrelation(chat, turnId, operationContext));
			if (turnId && recovery?.failedTurnIds.has(turnId)) {
				return;
			}
			throw error;
		}
	}

	private async _sendMessageOnce(chat: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, senderClientId?: string, clientType = AgentHostClientType.Unknown, workingDirectories?: readonly URI[], operationContext?: URI | IAgentChatContext, clientTelemetryContext?: IAgentHostClientTelemetryContext): Promise<void> {
		const context = this._resolveSendChatContext(chat, operationContext);
		await this._queueChat(context.configurationId, context.sequencerKey, async () => {
			const current = this._resolveSendChatContext(chat, operationContext);
			await this._activeClients.get(current.configurationResource)?.pluginController.retryFailedClientSyncIfNeeded();

			let entry: CopilotAgentSession | undefined = current.target;
			if (!entry) {
				entry = await this._ensureResolvedChatSession(current, workingDirectories);
			}

			// If the active client's config changed (tools or plugins),
			// dispose this session so it gets resumed with the updated config.
			const activeClient = this._activeClients.get(current.configurationResource);
			const hadCachedEntry = !!entry;
			this._logService.info(`[Copilot:${current.configurationId}] sendMessage: cachedEntry=${hadCachedEntry}, hasActiveClient=${!!activeClient}, activeClientId=${activeClient ? '(set)' : '(none)'}`);
			const rootsChanged = !!entry && workingDirectories !== undefined && !areAdditionalWorkingDirectoriesEqual(entry.appliedAdditionalDirectories, this._additionalCustomizationDirectories(workingDirectories));
			const currentSnapshot = entry && activeClient ? await activeClient.snapshot(current.chatKey) : undefined;
			const structuralConfigChanged = !!entry && !!activeClient && !!currentSnapshot && await activeClient.requiresRestart(entry.appliedSnapshot, current.chatKey, currentSnapshot);
			const currentDisabledRootMcpServers = entry && currentSnapshot
				? await this._disabledRootMcpServers(current.configurationResource, entry.sessionId, currentSnapshot)
				: undefined;
			const disabledRootMcpServersChanged = !!entry && !!currentDisabledRootMcpServers && !equals(
				[...new Set(entry.appliedDisabledRootMcpServers)].sort(),
				[...new Set(currentDisabledRootMcpServers)].sort(),
			);
			if (entry && (rootsChanged || structuralConfigChanged || disabledRootMcpServersChanged || entry.requiresMcpLaunchConfigurationRefresh)) {
				this._logService.info(`[Copilot:${current.configurationId}] Session configuration changed, refreshing session. clients=[${activeClient ? [...activeClient.toolSet.clientIds()].join(', ') || '(none)' : '(none)'}]`);
				// Finish disconnecting before resuming the SAME SDK session id with
				// the updated config. Routing is preserved so the session identity
				// is recoverable; peer chats keep their own entries and are left
				// intact. Resume explicitly (rather than via the generic re-resolve
				// below) so the refreshed config is re-applied deterministically.
				await this._destroyLiveSession(entry, true);
				if (entry.sessionId === current.configurationId) {
					entry = await this._resumeSession(current.configurationId, current.chat, workingDirectories);
				} else {
					if (workingDirectories) {
						activeClient?.pluginController.setAdditionalDirectories(this._additionalCustomizationDirectories(workingDirectories));
					}
					entry = await this._ensureResolvedChatSession(current, workingDirectories);
				}
			}
			if (!entry) {
				this._logService.info(`[Copilot:${current.configurationId}] No cached entry${hadCachedEntry ? ' (was evicted by requiresRestart)' : ''}, calling _resumeSession`);
			}
			entry ??= await this._ensureResolvedChatSession(current, workingDirectories);
			if (!entry) {
				throw new Error(`[Copilot] sendMessage for unknown chat: ${chat.toString()}`);
			}

			// Reset per-turn streaming state on the session so that the
			// next text/reasoning chunk (and any host-emitted announcement)
			// allocates a fresh response part.
			if (turnId) {
				entry.resetTurnState(turnId, senderClientId, clientType, clientTelemetryContext);
			}

			try {
				const sdkMode = this._resolveSdkMode(current.configurationResource);
				await entry.send(prompt, attachments, turnId, sdkMode, senderClientId, clientType, resolveAgentHostInstructions(operationContext), clientTelemetryContext);
			} catch (err) {
				const errCode = (err as { code?: number })?.code;
				const errMsg = err instanceof Error ? err.message : String(err);
				this._logService.error(`[Copilot:${current.configurationId}] entry.send() failed: code=${errCode}, message=${errMsg}, hadCachedEntry=${hadCachedEntry}, errorType=${err?.constructor?.name}`);
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

	private async _getChatMessages(chat: URI, sessionOrContext: URI | IAgentChatContext): Promise<readonly Turn[]> {
		if (this._isShuttingDown) {
			return [];
		}
		// A subagent transcript is identified by its host-supplied tool spawn
		// edge, never by recognizing a shape in the addressed URI.
		if (resolveSubagentChatParent(sessionOrContext)) {
			return this._getSubagentChatMessages(chat, sessionOrContext);
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
		return entry.getMessages();
	}

	/** Reconstructs a subagent transcript from the parent chat named by the host-supplied tool origin. */
	private async _getSubagentChatMessages(chat: URI, sessionOrContext: URI | IAgentChatContext): Promise<readonly Turn[]> {
		const spawnedFrom = resolveSubagentChatParent(sessionOrContext);
		if (!spawnedFrom) {
			this._logService.warn(`[Copilot] Subagent chat ${chat.toString()} addressed without its host-supplied tool-call origin; no turns to reconstruct`);
			return [];
		}
		const owner = resolveAgentChatContext(sessionOrContext, chat).configurationResource;
		const parentContext = this._resolveChatContext(spawnedFrom.chat, { configurationResource: owner, resource: owner });
		const parentEntry = await this._ensureResolvedChatSession(parentContext).catch(err => {
			this._logService.warn(`[Copilot:${parentContext.sdkSessionId ?? parentContext.configurationId}] Failed to resume exact source chat for subagent restore`, err);
			return undefined;
		});
		return parentEntry?.getSubagentMessages(spawnedFrom.toolCallId) ?? [];
	}

	/** Releases provider-owned resources once the last chat sharing `scope` is gone. */
	private async _finalizeConfigurationScope(scope: URI, scopeId: string, workspacelessHint: boolean): Promise<void> {
		const isWorkspaceless = workspacelessHint
			|| (await this._readSessionMetadata(scope).catch(() => undefined))?.workspaceless === true;
		this._provisionalSessions.delete(scopeId);
		await this._sessionLifetimes.get(scopeId)?.dispose(async () => { });
		this._activeClients.get(scope)?.dispose();
		this._activeClients.delete(scope);
		this._hostCustomizations.delete(scope);
		if (isWorkspaceless) {
			await this._cleanupWorkspacelessScratchDir(this._workspacelessScratchDir(scopeId), scopeId);
		}
		this._otelService.releaseSessionTraceContext(scope.toString());
		await this._applyPendingClientRestart();
	}

	private async _abortSession(chat: URI, operationContext: URI | IAgentChatContext): Promise<void> {
		try {
			await this._abortSessionOnce(chat, operationContext);
		} catch (error) {
			const correlation = this._clientFailureCorrelation(chat, undefined, operationContext);
			if (!isCopilotConnectionClosedError(error)) {
				await this._handleClientOperationFailure(error, 'abort', correlation);
				throw error;
			}
			this._resolveChatContext(chat, operationContext).target?.discardActiveTurn();
			if (!await this._handleClientOperationFailure(error, 'abort', correlation)) {
				throw error;
			}
		}
	}

	private async _abortSessionOnce(chat: URI, operationContext: URI | IAgentChatContext): Promise<void> {
		const context = this._resolveChatContext(chat, operationContext);
		await this._queueChat(context.configurationId, context.sequencerKey, async () => {
			await this._resolveChatContext(chat, operationContext).target?.abort();
		});
	}

	/** Creates a concrete chat backing immediately, optionally by importing history from another chat. */
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
		// session unless it explicitly requests an independent queue.
		const queue = <T>(task: () => Promise<T>) => fork?.independentQueue
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
			let inheritedTurnId: string | undefined;
			let sourceEntry: CopilotAgentSession | undefined;
			if (fork) {
				sourceEntry = await this._ensureResolvedChatSession(this._resolveChatContext(fork.source, { configurationResource: forkSourceScope!, resource: this._resolveChatStorageScope(fork.source) }));
				if (!sourceEntry) {
					throw new Error(`[Copilot] createChat fork: source chat ${fork.source.toString()} not found`);
				}
				const forked = await this._forkSdkChat(client, sourceEntry, fork.turnId, this._sessionDataService.getSessionDataDir(storageScope));
				sdkSessionId = forked.sessionId;
				inheritedTurnId = forked.inheritedTurnId;
				launchPlan = {
					kind: 'resume',
					client,
					sessionId: sdkSessionId,
					workingDirectory,
					resolvedAgentName: undefined,
					snapshot,
					disabledRootMcpServers: await this._disabledRootMcpServers(session, sdkSessionId, snapshot),
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
					disabledRootMcpServers: await this._disabledRootMcpServers(session, chatSdkId, snapshot),
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
				if (fork?.turnIdMapping) {
					await agentSession.remapTurnIds(fork.turnIdMapping);
				}
				this._throwIfClientReplaced(client, agentSession);
				this._registerLiveChat(chat, agentSession, activeClient);
				const backing: IPersistedChat = {
					sdkSessionId,
					...(model ? { model } : {}),
					...(agent ? { agent } : {}),
				};
				this._chatBackings.set(chatKey, backing);
				result = {
					...(inheritsFromOtherSession ? { resolvedWorkingDirectory: workingDirectory, ...(project ? { project } : {}) } : {}),
					...(inheritedTurnId !== undefined ? { inheritedTurnId } : {}),
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

	/** Resolves the live session for an addressed chat from exact recorded backings. */
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
	private async _forkSdkChat(client: CopilotClient, sourceEntry: CopilotAgentSession, turnId: string, targetDbDir: URI): Promise<{ sessionId: string; inheritedTurnId: string | undefined }> {
		const sourceTurns = await sourceEntry.getMessages();
		const sourceTurnIndex = sourceTurns.findIndex(turn => turn.id === turnId);
		if (sourceTurnIndex === -1) {
			this._logService.warn(`[Copilot] fork: turn ${turnId} not found in source session ${sourceEntry.sessionId}; inheriting all ${sourceTurns.length} turns`);
		}
		const inheritedTurnIndex = sourceTurnIndex === -1 ? sourceTurns.length - 1 : sourceTurnIndex;
		const inheritedTurnId = sourceTurns[inheritedTurnIndex]?.id;
		// toEventId is exclusive; omitting it includes all events.
		let toEventId: string | undefined;
		try {
			toEventId = await sourceEntry.getForkBoundaryEventId(turnId);
		} catch (err) {
			throw new Error(`[Copilot] fork: failed to resolve fork boundary for turn ${turnId} in source session ${sourceEntry.sessionId} because ${getErrorMessage(err)}`);
		}
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
		return { sessionId: newSessionId, inheritedTurnId };
	}

	private async _disposeChat(chat: URI, operationContext: URI | IAgentChatContext): Promise<void> {
		const initial = this._resolveChatContext(chat, operationContext);
		const lifetimeId = initial.sdkSessionId ?? initial.configurationId;
		const lifetime = this._getOrCreateSessionLifetime(lifetimeId);
		if (!lifetime) {
			return;
		}
		// Scope finalization can dispose this same lifetime; defer it until `release()` settles to avoid self-deadlock.
		let finalize: { scope: URI; scopeId: string; workspacelessHint: boolean } | undefined;
		await lifetime.release(async () => {
			finalize = await this._disposeChatCoordinated(chat, operationContext);
		});
		if (finalize) {
			await this._finalizeConfigurationScope(finalize.scope, finalize.scopeId, finalize.workspacelessHint);
		}
	}

	private async _disposeChatCoordinated(chat: URI, operationContext: URI | IAgentChatContext): Promise<{ scope: URI; scopeId: string; workspacelessHint: boolean } | undefined> {
		const chatKey = chat.toString();
		const initial = this._resolveChatContext(chat, operationContext);
		const configurationId = initial.configurationId;
		return this._queueChat(configurationId, initial.sequencerKey, async () => {
			const current = this._resolveChatContext(chat, operationContext);
			const target = current.target;
			const backing = this._chatBackings.get(chatKey);
			const provisional = this._provisionalSessions.get(configurationId);
			const isProvisional = provisional?.chat.toString() === chatKey;
			const sdkSessionId = target?.sessionId ?? backing?.sdkSessionId;
			const workspacelessHint = provisional?.workspaceless === true;

			if (sdkSessionId && !isProvisional) {
				await this._deleteSdkSession(sdkSessionId, chatKey);
			}

			if (isProvisional) {
				this._provisionalSessions.delete(configurationId);
			}
			this._chatBackings.delete(chatKey);
			this._chatScopes.delete(chatKey);
			this._chatStorageScopes.delete(chatKey);

			if (target) {
				await this._destroyLiveSession(target, true);
			}

			// This chat's own OTel trace context is keyed by its host-chosen
			// persistence resource — `context.resource`, the chat's own URI for
			// an additional chat, distinct from the shared configuration scope —
			// never by the scope, so it is never released by scope finalization
			// below. Release it here so a destroyed chat's trace context never
			// outlives it; harmless when `resource` coincides with the scope
			// (the default chat), since finalization's own release of that same
			// key is idempotent.
			this._otelService.releaseSessionTraceContext(current.resource.toString());

			// The chat itself is gone: drop it from every active client's
			// membership so a client left with no remaining chats has its
			// tool/customization contributions fully released rather than
			// leaking past the chat's lifetime.
			this._activeClients.get(current.configurationResource)?.removeChat(chat);

			// When no chat still shares this configuration scope (tracked purely
			// via the {@link _chatScopes} ref count, never inferred from `chat`'s
			// URI shape), report back so the caller finalizes the scope's
			// provider-owned resources — the same cleanup the old
			// post-chat finalization hook used to run.
			if (this._remainingChatsForScope(current.configurationResource) === 0) {
				return { scope: current.configurationResource, scopeId: configurationId, workspacelessHint };
			}
			return undefined;
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

	private async _canReleaseChat(chat: URI, operationContext: URI | IAgentChatContext): Promise<boolean> {
		const target = this._resolveChatContext(chat, operationContext).target;
		if (!target) {
			return true;
		}
		if (target.hasActiveTurn) {
			return false;
		}
		if (await target.hasRunningDetachedShells()) {
			this._logService.info(`[Copilot:${target.sessionId}] Deferring idle release while a detached shell is running`);
			return false;
		}
		return true;
	}

	private async _releaseChat(chat: URI, operationContext: URI | IAgentChatContext): Promise<void> {
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
	async materializeChat(chat: URI, context: URI | IAgentChatContext, providerData: string | undefined): Promise<IAgentCreateChatResult | void> {
		this._noteHostCustomizations(context);
		const resolved = resolveAgentChatContext(context, chat);
		this._rememberChatScope(chat, resolved.configurationResource, resolved.resource);
		const chatKey = chat.toString();
		if (providerData === undefined) {
			if (!isDefaultChatUri(chat)) {
				return;
			}
			const backing = { sdkSessionId: AgentSession.id(resolved.configurationResource) };
			this._chatBackings.set(chatKey, backing);
			return { providerData: encodeProviderData(backing) };
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
		this._rememberChatScope(chat, resolved.configurationResource, resolved.resource);
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
	async listLegacyChatBackings(configurationResource: URI): Promise<readonly IAgentLegacyChat[]> {
		const persisted = await this._readLegacyChatBackings(configurationResource);
		const result: IAgentLegacyChat[] = [];
		for (const [chatId, info] of persisted) {
			result.push({ uri: URI.parse(buildChatUri(configurationResource, chatId)), providerData: encodeProviderData(info) });
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

	/** Returns the live session for an exact chat, resuming it if necessary. */
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
				const persistedWorkingDirectory = workingDirectories?.[0] ?? parentEntry?.workingDirectory
					?? this._provisionalSessions.get(configurationId)?.workingDirectory
					?? (await this._readSessionMetadata(configurationResource)).workingDirectory;
				if (!persistedWorkingDirectory) {
					this._logService.warn(`[Copilot] Cannot resume chat ${chatKey}: missing working directory`);
					return undefined;
				}
				const workingDirectory = await this._worktree.resolveWorkingDirectoryForResume(configurationResource, AgentSession.id(configurationResource), persistedWorkingDirectory);
				const launchWorkingDirectories = workingDirectories
					? [workingDirectory, ...workingDirectories.slice(1)]
					: undefined;
				const client = await this._ensureClient();
				const activeClient = this._getOrCreateActiveClient(configurationResource, workingDirectory);
				activeClient.pluginController.reanchor(workingDirectory);
				const snapshot = await activeClient.snapshot(chatKey);
				const shellManager = this._instantiationService.createInstance(ShellManager, chat, workingDirectory);
				const launchPlan: CopilotSessionLaunchPlan = {
					kind: 'resume',
					client,
					sessionId: info.sdkSessionId,
					workingDirectory,
					additionalDirectories: launchWorkingDirectories?.slice(1),
					resolvedAgentName: info.agent ? this._resolveAgentName(snapshot, info.agent) : undefined,
					snapshot,
					disabledRootMcpServers: await this._disabledRootMcpServers(configurationResource, info.sdkSessionId, snapshot),
					activeClientToolSet: activeClient.toolSet,
					shellManager,
					githubToken: this._githubToken,
					fallback: { model: info.model, longContextWindow: this._longContextWindowFor(info.model?.id), freeLongContext: this._isFreeLongContext(info.model?.id) },
				};
				agentSession = this._createAgentSession(launchPlan, workingDirectory, activeClient, { sessionUri: configurationResource, chatChannelUri: chat, resource: context.resource });
				await agentSession.initializeSession();
				this._throwIfClientReplaced(client, agentSession);
				this._registerLiveChat(chat, agentSession, activeClient);
				if (launchWorkingDirectories) {
					await this._storeSessionMetadata(context.resource, info.model, workingDirectory, launchWorkingDirectories, undefined, undefined);
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

	async truncateChat(chat: URI, turnId: string | undefined, context?: URI | IAgentChatContext): Promise<void> {
		const resolved = this._resolveTruncateChatContext(chat, context);
		const sessionId = resolved.configurationId;
		if (this._provisionalSessions.get(sessionId)?.chat.toString() === chat.toString()) {
			return;
		}
		await this._queueChat(resolved.configurationId, resolved.sequencerKey, async () => {
			const current = this._resolveTruncateChatContext(chat, context);
			this._logService.info(`[Copilot:${sessionId}] Truncating chat ${chat.toString()}${turnId !== undefined ? ` at turnId=${turnId}` : ' (all turns)'}`);

			const entry = await this._ensureResolvedChatSession(current);
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

	private async _changeModel(chat: URI, model: ModelSelection, operationContext: URI | IAgentChatContext): Promise<void> {
		try {
			await this._changeModelOnce(chat, model, operationContext);
		} catch (error) {
			if (!await this._handleClientOperationFailure(error, 'changeModel', this._clientFailureCorrelation(chat, undefined, operationContext))) {
				throw error;
			}
			await this._changeModelOnce(chat, model, operationContext);
		}
	}

	private async _changeModelOnce(chat: URI, model: ModelSelection, operationContext: URI | IAgentChatContext): Promise<void> {
		const context = this._resolveChatContext(chat, operationContext);
		await this._queueChat(context.configurationId, context.sequencerKey, async () => {
			const current = this._resolveChatContext(chat, operationContext);
			const longContextWindow = this._longContextWindowFor(model.id);
			const freeLongContext = this._isFreeLongContext(model.id);
			// A `family` alias routes the host's prompt and tool profile only. The
			// selected model's reasoning-effort override is resolved separately.
			const provisional = this._provisionalSessions.get(current.configurationId);
			if (provisional) {
				provisional.model = model;
			} else {
				const entry = current.target ?? await this._ensureResolvedChatSession(current);
				await entry?.setModel(model.id, resolveCopilotReasoningEffort(model, this._configurationService, this._logService, current.configurationId), getCopilotContextTier(model, longContextWindow, freeLongContext));
				// Keep the session-scope metadata in step for resumes that fall back
				// to it; chat leaves persist through their backing instead.
				if (current.resource.toString() === current.configurationResource.toString()) {
					await this._storeSessionMetadata(current.resource, model, undefined, undefined, undefined, undefined);
				}
			}
			const backing = this._chatBackings.get(current.chatKey);
			if (backing) {
				const updated: IPersistedChat = { ...backing, model };
				this._chatBackings.set(current.chatKey, updated);
				this._onDidChangeChatData.fire({ chat, providerData: encodeProviderData(updated) });
			}
		});
	}

	private async _changeAgent(chat: URI, agent: AgentSelection | undefined, operationContext: URI | IAgentChatContext): Promise<void> {
		try {
			await this._changeAgentOnce(chat, agent, operationContext);
		} catch (error) {
			if (!await this._handleClientOperationFailure(error, 'changeAgent', this._clientFailureCorrelation(chat, undefined, operationContext))) {
				throw error;
			}
			await this._changeAgentOnce(chat, agent, operationContext);
		}
	}

	private async _changeAgentOnce(chat: URI, agent: AgentSelection | undefined, operationContext: URI | IAgentChatContext): Promise<void> {
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

	/**
	 * Returns the effective Kerberos proxy SPN, treating an empty setting as absent.
	 */
	private _readKerberosSpn(env: Record<string, string | undefined>): string | undefined {
		const spn = env['COPILOT_PROXY_KERBEROS_SPN'] || this._configurationService.getRootValue(agentHostProxyConfigSchema, AgentHostProxyConfigKey.ProxyKerberosServicePrincipal);
		return spn || undefined;
	}

	private _applyProxyEnv(env: Record<string, string | undefined>): void {
		const proxy = this._isSystemProxyEnabled() ? this._resolvedProxy : undefined;
		this._appliedProxy = proxy;
		if (proxy) {
			for (const key of COPILOT_PROXY_SET_ENV_KEYS) {
				env[key] = proxy;
			}
			this._logService.info('[Copilot] Resolved CAPI proxy and forwarded HTTP_PROXY/HTTPS_PROXY to Copilot SDK');
		}
		const kerberosSpn = this._readKerberosSpn(env);
		this._appliedProxyKerberosSpn = kerberosSpn;
		if (kerberosSpn && !env['COPILOT_PROXY_KERBEROS_SPN']) {
			env['COPILOT_PROXY_KERBEROS_SPN'] = kerberosSpn;
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

	private _refreshProxy(): void {
		const generation = ++this._proxyResolutionGeneration;
		const refresh = this._resolveProxyForSdk().then(async proxy => {
			if (generation !== this._proxyResolutionGeneration) {
				return;
			}
			this._resolvedProxy = proxy;
			const effectiveProxy = this._isSystemProxyEnabled() ? proxy : undefined;
			const effectiveKerberosSpn = this._readKerberosSpn(process.env);
			if (effectiveProxy === this._appliedProxy && effectiveKerberosSpn === this._appliedProxyKerberosSpn) {
				return;
			}
			if (this._clientStarting) {
				try {
					await this._clientStarting;
				} catch {
					return;
				}
				// A newer proxy resolution (or the client start we just awaited)
				// may have already superseded this one; re-check both so we don't
				// restart based on a stale comparison.
				if (generation !== this._proxyResolutionGeneration || (effectiveProxy === this._appliedProxy && effectiveKerberosSpn === this._appliedProxyKerberosSpn)) {
					return;
				}
			}
			const changes: string[] = [];
			if (effectiveProxy !== this._appliedProxy) {
				changes.push(`proxy ${this._appliedProxy ?? '(none)'} -> ${effectiveProxy ?? '(none)'}`);
			}
			if (effectiveKerberosSpn !== this._appliedProxyKerberosSpn) {
				changes.push('Kerberos SPN changed');
			}
			await this._requestClientRestart(`CAPI proxy configuration changed (${changes.join(', ')})`);
		}).catch(error => this._logService.error('[Copilot] Failed to refresh CAPI proxy', error));
		this._proxyRefresh = refresh;
		void refresh.finally(() => {
			if (this._proxyRefresh === refresh) {
				this._proxyRefresh = undefined;
			}
		});
	}

	private _getOrCreateActiveClient(session: URI, directory: URI | undefined): ActiveClient {
		let client = this._activeClients.get(session);
		if (!client) {
			// Read the retained host snapshot lazily so projected enablement stays current.
			const pluginController = this._plugins.createSessionController(session, directory, () => this._retainedHostCustomizations(session));
			client = this._instantiationService.createInstance(ActiveClient, session, pluginController, this._onDidChatProgress);
			this._activeClients.set(session, client);
		} else if (directory) {
			client.pluginController.setDirectory(directory);
		}
		return client;
	}

	/** Instantiates a session; the caller must initialize and register it on success. */
	private _createAgentSession(launchPlan: CopilotSessionLaunchPlan, customizationDirectory: URI | undefined, activeClient: ActiveClient, identity?: ICopilotAgentSessionIdentity): CopilotAgentSession {
		const sessionUri = identity?.sessionUri ?? AgentSession.uri(this.id, launchPlan.sessionId);
		const chatChannelUri = identity?.chatChannelUri ?? this._findBoundSessionChatUri(launchPlan.sessionId) ?? URI.parse(buildDefaultChatUri(sessionUri));

		const agentSession = this._instantiationService.createInstance(
			CopilotAgentSession,
			{
				sessionUri,
				chatChannelUri,
				...(identity?.resource ? { resource: identity.resource } : {}),
				rawSessionId: launchPlan.sessionId,
				onDidSessionProgress: this._onDidChatProgress,
				sessionLauncher: this._sessionLauncher,
				launchPlan,
				shellManager: launchPlan.shellManager,
				workingDirectory: launchPlan.workingDirectory,
				customizationDirectory,
				clientSnapshot: launchPlan.snapshot,
				activeClientToolSet: launchPlan.activeClientToolSet,
				// Evaluate membership against the session's chat channel.
				clientReachesChat: (clientId, chat) => activeClient.contributesTo(clientId, chat.toString()),
				// MCP reconcile has no host call of its own, so read the retained host snapshot lazily.
				hostCustomizations: () => this._retainedHostCustomizations(sessionUri),
				serverToolHost: this._serverToolHost,
				isLaunchTokenCurrent: () => this._githubToken === launchPlan.githubToken,
				onTurnEnded: () => this._onChatTurnEnded(),
			},
		);
		return agentSession;
	}

	/** Resolves root-configured MCP servers that must be disabled when the SDK session starts. */
	private async _disabledRootMcpServers(session: URI, sessionId: string, snapshot: IActiveClientSnapshot): Promise<readonly string[]> {
		await this._customizationEnablementService.initializeSession(session.toString());
		const serverNames = new Set(Object.keys(snapshot.mcpServers));
		if (this._isGitHubMcpServerEnabled()) {
			serverNames.add(GITHUB_MCP_SERVER_NAME);
		}
		const rootServers: McpServerCustomization[] = [...serverNames].map(name => {
			const id = buildMcpTopLevelCustomizationId(this.id, sessionId, name);
			return {
				type: CustomizationType.McpServer,
				id,
				uri: id,
				name,
				state: { kind: McpServerStatus.Stopped },
			};
		});
		const enablement = getSdkMcpServerEnablement(resolveCustomizationEnablement(
			this._customizationEnablementService,
			session,
			rootServers,
		));
		return rootServers.filter(server => enablement.get(server.id) !== true).map(server => server.name);
	}

	private _createChatEntry(session: CopilotAgentSession, activeClient: ActiveClient): CopilotChatEntry {
		return new CopilotChatEntry(session, activeClient, this._onMcpNotification, () => this._handleCopilotSessionAuthRequired());
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
			resolvedWorkingDirectory = await this._worktree.resolveWorkingDirectoryForResume(sessionUri, AgentSession.id(sessionUri), workingDirectory);
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
		// Prefer chat-scoped membership when this SDK session is already bound to a chat.
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
			disabledRootMcpServers: await this._disabledRootMcpServers(sessionUri, sessionId, snapshot),
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

	/** Reads the legacy `copilot.chats` migration codec retained for pre-providerData sessions. */
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


	private async _storeSessionMetadata(session: URI, model: ModelSelection | undefined, workingDirectory: URI | undefined, workingDirectories: readonly URI[] | undefined, customizationDirectory: URI | undefined, project: IAgentSessionProjectInfo | undefined, projectResolved = project !== undefined, configValues?: Record<string, unknown>, customTitle?: string, markRead?: boolean, archived?: boolean, ehcliAdopted?: boolean): Promise<void> {
		const dbRef = this._sessionDataService.openDatabase(session);
		const db = dbRef.object;
		try {
			const work: Promise<void>[] = [];
			if (model) {
				work.push(db.setMetadata(CopilotAgent._META_MODEL, this._serializeModelSelection(model)));
			}
			// Persist read ownership so the adopted session isn't reported unread on open.
			if (markRead) {
				work.push(db.setMetadata(AH_META_IS_READ_DB_KEY, 'true'));
			}
			// Archiving is user-curated state; losing it on adoption would resurface
			// everything the user filed away in the extension host list.
			if (archived) {
				work.push(db.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, 'true'));
			}
			// Outlives the transient `ehcliAdoptable` summary marker so the session
			// keeps being listed like the legacy session it was migrated from.
			if (ehcliAdopted) {
				work.push(db.setMetadata(AH_META_EHCLI_ADOPTED_DB_KEY, 'true'));
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
			const m = await ref.object.getMetadataObject({
				[CopilotAgent._META_MODEL]: true,
				[CopilotAgent._META_AGENT]: true,
				[CopilotAgent._META_CWD]: true,
				[CopilotAgent._META_CWDS]: true,
				[CopilotAgent._META_CUSTOMIZATION_DIRECTORY]: true,
				[AH_META_WORKSPACELESS_DB_KEY]: true,
			});
			const cwd = m[CopilotAgent._META_CWD];
			const customizationDirectory = m[CopilotAgent._META_CUSTOMIZATION_DIRECTORY];
			const workingDirectory = cwd ? URI.parse(cwd) : undefined;
			return {
				model: this._parseModelSelection(m[CopilotAgent._META_MODEL]),
				agent: this._parseAgentSelection(m[CopilotAgent._META_AGENT]),
				workingDirectory,
				workingDirectories: this._parseWorkingDirectories(m[CopilotAgent._META_CWDS], workingDirectory),
				customizationDirectory: customizationDirectory ? URI.parse(customizationDirectory) : undefined,
				workspaceless: m[AH_META_WORKSPACELESS_DB_KEY] === 'true',
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
			const m = await ref.object.getMetadataObject({
				[CopilotAgent._META_MODEL]: true,
				[CopilotAgent._META_AGENT]: true,
				[CopilotAgent._META_CWD]: true,
				[CopilotAgent._META_CWDS]: true,
				[CopilotAgent._META_CUSTOMIZATION_DIRECTORY]: true,
				[CopilotAgent._META_PROJECT_RESOLVED]: true,
				[CopilotAgent._META_PROJECT_URI]: true,
				[CopilotAgent._META_PROJECT_DISPLAY_NAME]: true,
				[AH_META_WORKSPACELESS_DB_KEY]: true,
			});
			const cwd = m[CopilotAgent._META_CWD];
			const customizationDirectory = m[CopilotAgent._META_CUSTOMIZATION_DIRECTORY];
			const resolved = m[CopilotAgent._META_PROJECT_RESOLVED];
			const uri = m[CopilotAgent._META_PROJECT_URI];
			const displayName = m[CopilotAgent._META_PROJECT_DISPLAY_NAME];
			const workspaceless = m[AH_META_WORKSPACELESS_DB_KEY];
			if ([m[CopilotAgent._META_MODEL], m[CopilotAgent._META_AGENT], cwd, m[CopilotAgent._META_CWDS], customizationDirectory, resolved, uri, displayName, workspaceless].every(value => value === undefined)) {
				return { resolved: false };
			}
			const workingDirectory = cwd ? URI.parse(cwd) : undefined;
			const project = uri && displayName ? { uri: URI.parse(uri), displayName } : undefined;
			return {
				model: this._parseModelSelection(m[CopilotAgent._META_MODEL]),
				agent: this._parseAgentSelection(m[CopilotAgent._META_AGENT]),
				workingDirectory,
				workingDirectories: this._parseWorkingDirectories(m[CopilotAgent._META_CWDS], workingDirectory),
				customizationDirectory: customizationDirectory ? URI.parse(customizationDirectory) : undefined,
				project,
				resolved: resolved === 'true' || project !== undefined,
				workspaceless: workspaceless === undefined ? undefined : workspaceless === 'true',
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

	/**
	 * Git resolution runs in the session's working directory, so a legacy session
	 * whose worktree checkout was deleted falls back to the remote (e.g.
	 * `https://github.com/owner/repo`). That is not a location on disk, so the
	 * session could never be matched to the repository folder a window has open.
	 * The extension host recorded the local repository root — prefer it.
	 */
	private async _localProject(project: IAgentSessionProjectInfo | undefined, adoptableSessionId: string | undefined): Promise<IAgentSessionProjectInfo | undefined> {
		if (project?.uri.scheme === Schemas.file || adoptableSessionId === undefined) {
			return project;
		}
		const repositoryPath = extensionHostCliRepositoryPath(await this._readExtensionHostCliMarker(adoptableSessionId));
		if (!repositoryPath) {
			return project;
		}
		const uri = URI.file(repositoryPath);
		return { uri, displayName: resourceBasename(uri) || project?.displayName || uri.toString() };
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

	/** Creates a per-session controller that reads host-customization state lazily. */
	public createSessionController(session: URI, directory: URI | undefined, hostCustomizations: () => readonly Customization[]): SessionPluginController {
		return this._instantiationService.createInstance(SessionPluginController, this, session, directory, hostCustomizations);
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

/** Per-session plugin/customization view that publishes session-scoped actions. */
class SessionPluginController extends Disposable {
	private readonly _onDidPublish = this._register(new Emitter<SessionAction>());
	/** Per-session action stream (reset + per-item updates). */
	readonly onDidPublish = this._onDidPublish.event;
	private readonly _enablementReady: Promise<void>;
	private _isEnablementReady = false;

	private readonly _previousDirectories: URI[] = [];
	private _indexedDesiredCustomizations: readonly Customization[] | undefined;
	private readonly _desiredCustomizationById = new Map<string, Customization | ChildCustomization>();
	/** Live MCP server runtime state overlaid onto published customizations across re-syncs. */
	public readonly mcpServerStates: ISettableObservable<ReadonlyMap<string, IMcpServerRuntimeState>> = observableValue(this, new Map());
	/** Per-client customization state; published customizations are the stable first-wins union of these entries. */
	private readonly _clients = new Map<string, IClientCustomizationState>();

	private readonly _sessionDiscovered: MutableDisposable<SessionDiscoveredEntry> = this._register(new MutableDisposable());
	private readonly _sessionMcpDiscovery = this._register(new MutableDisposable<{ readonly discovery: SessionMcpDiscovery; dispose(): void }>());

	/** Additional multi-root workspace folders (roots 1..N); the primary root is tracked separately. */
	private _additionalDirectories: readonly URI[] = [];

	constructor(
		private readonly _parent: PluginController,
		private readonly _session: URI,
		private _directory: URI | undefined,
		/** Reads the retained host snapshot used to project per-customization enablement. */
		private readonly _hostCustomizations: () => readonly Customization[],
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService,
		@IAgentHostCustomizationEnablementService private readonly _customizationEnablementService: IAgentHostCustomizationEnablementService,
	) {
		super();
		this._enablementReady = this._customizationEnablementService.initializeSession(this._session.toString()).then(() => {
			this._isEnablementReady = true;
		});
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
		this._sessionMcpDiscovery.clear();
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
		this._sessionMcpDiscovery.clear();
		if (previous && !this._previousDirectories.some(candidate => isEqual(candidate, previous))) {
			this._previousDirectories.push(previous);
		}
	}

	public getCustomizations(): readonly Customization[] {
		return this._resolveCustomizationEnablement().customizations;
	}

	public resolveTopLevelMcpCustomizations(customizations: readonly Customization[], mcpServerOwners?: ReadonlyMap<string, string>): readonly Customization[] {
		return resolveCustomizationEnablement(this._customizationEnablementService, this._session, customizations, this._clientChildEnablement(), undefined, mcpServerOwners).customizations;
	}

	private _resolveCustomizationEnablement() {
		const result: Customization[] = [
			...this._parent.hostCustomizations().map(item => this._projectForPublish(item.customization)),
			...this._flattenClientCustomizations().map(item => this._projectForPublish(item.customization)),
		];
		const entry = this._discoveredEntry();
		const discovered = entry?.currentCustomizations() ?? [];
		for (const customization of discovered) {
			result.push(this._projectForPublish(customization));
		}
		for (const definition of this._mcpDiscoveryEntry()?.definitions ?? []) {
			result.push(this._projectForPublish(definition.customization));
		}
		return resolveCustomizationEnablement(this._customizationEnablementService, this._session, result, this._clientChildEnablement(), this._clientPlugins());
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
		await this._enablementReady;
		const entry = this._discoveredEntry();
		await Promise.all([
			this._parent.hostSync().catch(err => this._logService.warn('[Copilot:SessionPluginController] Host customization update failed', err)),
			...[...this._clients.values()].map(client => client.sync.catch(err => this._logService.warn('[Copilot:SessionPluginController] Client customization sync failed', err))),
			entry?.whenSettled(),
			this._mcpDiscoveryEntry()?.refresh(),
		]);
		return this.getCustomizations();
	}

	/** Returns the parsed plugins currently enabled for this session, awaiting any pending sync. */
	public async getAppliedPlugins(): Promise<readonly ICopilotPluginInfo[]> {
		await this._customizationEnablementService.initializeSession(this._session.toString());
		const entry = this._discoveredEntry();
		const mcpDiscovery = this._mcpDiscoveryEntry();
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
			mcpDiscovery?.refresh(),
		]);

		const resolved = this._resolveCustomizationEnablement();
		const desiredByUri = new Map(resolved.customizations.map(customization => [customization.uri, customization]));
		const desiredById = new Map(resolved.customizations.map(customization => [customization.id, customization]));
		const mcpEnablement = getSdkMcpServerEnablement(resolved);
		const isEnabledForSdk = (customization: Customization) => {
			const desired = desiredById.get(customization.id) ?? desiredByUri.get(customization.uri) ?? customization;
			return isCustomizationSdkEligible(resolved, desired) && (desired.type === CustomizationType.Directory ? desired.enabled : isCustomizationEnabled(desired));
		};
		const disabledChildren = (customization: Customization): readonly string[] | undefined => {
			const desired = desiredByUri.get(customization.uri);
			const children = desired && desired.type !== CustomizationType.McpServer
				? desired.children?.filter(child => child.type === CustomizationType.McpServer && !mcpEnablement.get(child.id)).map(child => child.name)
				: undefined;
			return children?.length ? children : undefined;
		};
		const discovered = entry?.currentCustomizations() ?? [];
		const sessionPlugin = discovered.some(isEnabledForSdk) ? mapToParsedPlugin(discovered) : undefined;
		const withSdkRegistration = (plugin: IParsedPlugin, pluginDir: URI | undefined): ICopilotPluginInfo => ({
			...plugin,
			pluginDir,
			mcpServers: plugin.mcpServers.map(definition => resolveCopilotMcpServerInfo(definition, pluginDir)),
		});
		const sessionPlugins: ICopilotPluginInfo[] = sessionPlugin ? [withSdkRegistration(sessionPlugin, undefined)] : [];

		const primaryCwd = this._directory;
		const withClientDefaults = (item: IResolvedCustomization): ICopilotPluginInfo => {
			const plugin = item.plugin!;
			return {
				...plugin,
				pluginDir: item.pluginDir,
				mcpServers: plugin.mcpServers.map(definition => resolveCopilotMcpServerInfo(definition, item.pluginDir, item.input, primaryCwd)),
			};
		};
		const allWorkspaceDefinitions = mcpDiscovery?.definitions ?? [];
		const workspaceDefinitions = allWorkspaceDefinitions.filter(definition => isEnabledForSdk(definition.customization));
		const workspaceMcp = allWorkspaceDefinitions.length ? [{
			format: PluginFormat.Copilot,
			hooks: [],
			mcpServers: workspaceDefinitions.map(definition => resolveCopilotMcpServerInfo(definition, undefined)),
			disabledMcpServers: allWorkspaceDefinitions.filter(definition => !isEnabledForSdk(definition.customization)).map(definition => definition.name),
			skills: [],
			agents: [],
			instructions: [],
		} satisfies ICopilotPluginInfo] : [];
		return [
			...workspaceMcp,
			...host.filter(item => !!item.plugin && isEnabledForSdk(item.customization))
				.map(item => ({ ...withSdkRegistration(item.plugin!, item.pluginDir), sourceUri: URI.parse(item.customization.uri), ...(disabledChildren(item.customization) ? { disabledMcpServers: disabledChildren(item.customization) } : {}) })),
			...this._flattenClientCustomizations().filter(item => !!item.plugin && isEnabledForSdk(item.customization))
				.map(item => ({ ...withClientDefaults(item), sourceUri: URI.parse(item.customization.uri), ...(disabledChildren(item.customization) ? { disabledMcpServers: disabledChildren(item.customization) } : {}) })),
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
	public async sync(clientId: string, customizations: ClientPluginCustomization[], options?: { quiet?: boolean }) {
		if (!this._isEnablementReady) {
			await this._enablementReady;
		}
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
				customization: this._resolveCustomizationForPublish(item.customization),
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
			this._publish(() => ({
				type: ActionType.SessionCustomizationsChanged,
				customizations: [...this.getCustomizations()],
			}));
		}
		const published = new Map<string, Customization>();
		for (const customization of client.customizations) {
			const enabled = this._resolveCustomizationForPublish(customization.customization);
			published.set(enabled.uri, enabled);
		}
		const publishUpdate = (item: IResolvedCustomization) => {
			const customization = this._resolveCustomizationForPublish(item.customization);
			if (equals(published.get(customization.uri), customization)) {
				return;
			}
			published.set(customization.uri, customization);
			if (!quiet) {
				this._publish(() => ({
					type: ActionType.SessionCustomizationUpdated,
					customization,
				}));
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
			customization: this._resolveCustomizationForPublish(item.customization),
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
		this._publish(() => ({
			type: ActionType.SessionCustomizationsChanged,
			customizations: [...this.getCustomizations()],
		}));
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
				() => this._publish(() => ({
					type: ActionType.SessionCustomizationsChanged,
					customizations: [...this.getCustomizations()],
				}))
			);
		}
		return this._sessionDiscovered.value;
	}

	private _mcpDiscoveryEntry(): SessionMcpDiscovery | undefined {
		if (!this._directory) {
			return undefined;
		}
		if (!this._sessionMcpDiscovery.value) {
			const store = new DisposableStore();
			const discovery = store.add(new SessionMcpDiscovery([this._directory, ...this._additionalDirectories], this._fileService));
			store.add(discovery.onDidChange(() => this._publish(() => ({
				type: ActionType.SessionCustomizationsChanged,
				customizations: [...this.getCustomizations()],
			}))));
			this._sessionMcpDiscovery.value = { discovery, dispose: () => store.dispose() };
		}
		return this._sessionMcpDiscovery.value.discovery;
	}

	private _publish(action: () => SessionAction): void {
		const publish = () => {
			if (!this._store.isDisposed) {
				this._onDidPublish.fire(action());
			}
		};
		if (this._isEnablementReady) {
			publish();
		} else {
			void this._enablementReady.then(publish).catch(error => this._logService.error('[Copilot:SessionPluginController] Failed to initialize customization enablement', error));
		}
	}

	private _clientChildEnablement(): ReadonlyMap<string, Readonly<Record<string, readonly CustomizationEnablement[]>>> {
		const result = new Map<string, Readonly<Record<string, readonly CustomizationEnablement[]>>>();
		for (const client of this._clients.values()) {
			for (const customization of client.inputs) {
				if (customization.childEnablement !== undefined) {
					result.set(customization.uri, customization.childEnablement);
				}
			}
		}
		return result;
	}

	private _clientPlugins(): ReadonlyMap<string, ClientPluginCustomization> {
		const result = new Map<string, ClientPluginCustomization>();
		for (const client of this._clients.values()) {
			for (const customization of client.inputs) {
				result.set(customization.uri, customization);
			}
		}
		return result;
	}

	private _isEnabled(customization: Customization): boolean {
		return this._desiredEnabled(customization) ?? (customization.type === CustomizationType.Directory ? customization.enabled : isCustomizationEnabled(customization));
	}

	private _applyEnablement<T extends Customization>(customization: T): T {
		if (customization.type === CustomizationType.McpServer) {
			return this._applyExplicitEnablement(customization, this._getDesiredCustomization(customization.id));
		}
		if (customization.type === CustomizationType.Plugin) {
			const plugin = customization as PluginCustomization;
			const next = this._applyExplicitEnablement(plugin, this._getDesiredCustomization(plugin.id));
			let changed = next !== customization;
			const children = next.children?.map(child => {
				if (child.type === CustomizationType.McpServer) {
					const updated = this._applyExplicitEnablement(child, this._getDesiredCustomization(child.id));
					changed ||= updated !== child;
					return updated;
				}
				const desiredEnabled = this._desiredEnabled(child);
				if (desiredEnabled === undefined || desiredEnabled === child.enabled) {
					return child;
				}
				changed = true;
				return { ...child, enabled: desiredEnabled };
			});
			return (changed ? { ...next, children } : next) as T;
		}
		const enabled = this._isEnabled(customization);
		let changed = customization.enabled !== enabled;
		const children = customization.children?.map(child => {
			if (child.type === CustomizationType.McpServer) {
				const next = this._applyExplicitEnablement(child, this._getDesiredCustomization(child.id));
				changed ||= next !== child;
				return next;
			}
			const desiredEnabled = this._desiredEnabled(child);
			if (desiredEnabled === undefined || desiredEnabled === child.enabled) {
				return child;
			}
			changed = true;
			return { ...child, enabled: desiredEnabled };
		});
		return changed ? { ...customization, enabled, children } : customization;
	}

	private _resolveCustomizationForPublish<T extends Customization>(customization: T): T {
		return resolveCustomizationEnablement(
			this._customizationEnablementService,
			this._session,
			[this._projectForPublish(customization)],
			this._clientChildEnablement(),
			this._clientPlugins(),
		).customizations[0] as T;
	}

	private _desiredEnabled(customization: Customization | ChildCustomization): boolean | undefined {
		const exact = this._getDesiredCustomization(customization.id);
		if (exact) {
			return exact.type === CustomizationType.Plugin || exact.type === CustomizationType.McpServer
				? isCustomizationEnabled(exact)
				: exact.enabled;
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
				return previous.type === CustomizationType.Plugin || previous.type === CustomizationType.McpServer
					? isCustomizationEnabled(previous)
					: previous.enabled;
			}
		}
		return undefined;
	}

	private _applyExplicitEnablement<T extends Customization | ChildCustomization>(customization: T, desired: (Customization | ChildCustomization) | undefined): T {
		if (!desired || (desired.type !== CustomizationType.Plugin && desired.type !== CustomizationType.McpServer)) {
			return customization;
		}
		if (desired.enablement?.length) {
			const next: T & { enablement?: readonly CustomizationEnablement[] } = { ...customization, enablement: [...desired.enablement] };
			return next;
		}
		const next: T & { enablement?: readonly CustomizationEnablement[] } = { ...customization };
		delete next.enablement;
		return next;
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

	/** Host-published per-client chat membership, updated incrementally one exact chat at a time. */
	private readonly _chatsByClient = new Map<string, Set<string>>();

	/** Chats with authoritative membership; unknown chats are treated separately from "no contributors". */
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

	/** Adds `chat` to `clientId`'s membership and reports whether membership grew. */
	addClientChat(clientId: string, chat: URI): boolean {
		const chatKey = chat.toString();
		const chats = this._chatsByClient.get(clientId);
		if (chats?.has(chatKey)) {
			return false;
		}
		if (chats) {
			chats.add(chatKey);
		} else {
			this._chatsByClient.set(clientId, new Set([chatKey]));
		}
		this._knownChats.add(chatKey);
		return true;
	}

	/** Removes `chat` from `clientId` and reports whether that client now has no chats left. */
	removeClientChat(clientId: string, chat: URI): boolean {
		const chatKey = chat.toString();
		const chats = this._chatsByClient.get(clientId);
		if (!chats?.has(chatKey)) {
			return false;
		}
		chats.delete(chatKey);
		if (chats.size === 0) {
			this._chatsByClient.delete(clientId);
		}
		this._reindexKnownChats();
		return !this._chatsByClient.has(clientId);
	}

	/** Removes `chat` from every client, dropping clients left with no remaining chats. */
	removeChat(chat: URI): void {
		for (const clientId of [...this._chatsByClient.keys()]) {
			if (this.removeClientChat(clientId, chat)) {
				this.removeClient(clientId);
			}
		}
	}

	/** The exact chats `clientId` contributes to, as last published by the host. */
	clientChats(clientId: string): readonly string[] {
		return [...(this._chatsByClient.get(clientId) ?? [])];
	}

	/** Unknown chats are temporarily in scope for every client until the host publishes exact membership. */
	contributesTo(clientId: string, chatKey: string): boolean {
		return !this._knownChats.has(chatKey) || this._chatsByClient.get(clientId)?.has(chatKey) === true;
	}

	/** Chat-scoped tool union; duplicate names keep the first contributor's definition. */
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

	/** Builds the client/plugin/MCP snapshot a chat should advertise to its SDK session. */
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

	/** Returns whether plugins or the chat-scoped structural tool set changed enough to require resume. */
	async requiresRestart(snap: IActiveClientSnapshot, chatKey?: string, current?: IActiveClientSnapshot): Promise<boolean> {
		current ??= await this.snapshot(chatKey);
		if (!parsedPluginsEqual(snap.plugins, current.plugins)) {
			return true;
		}
		if (!equals(snap.mcpServers, current.mcpServers)) {
			return true;
		}
		return !structuralToolsEqual(current.tools, snap.tools);
	}
}
