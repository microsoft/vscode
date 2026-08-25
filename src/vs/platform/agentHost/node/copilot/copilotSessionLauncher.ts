/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ContextTier, CopilotClient, ElicitationContext, ElicitationResult, ExitPlanModeRequest, ExitPlanModeResult, ModelCapabilitiesOverride, NamedProviderConfig, PermissionRequest, PermissionRequestResult, ProviderModelConfig, ReasoningSummary, ResumeSessionConfig, SessionConfig, SessionHooks, Tool, Verbosity } from '@github/copilot-sdk';
import { coalesce } from '../../../../base/common/arrays.js';
import { Schemas } from '../../../../base/common/network.js';
import { isObject, isStringArray } from '../../../../base/common/types.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService, LogLevel } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agent.js';
import { getByokLmSelectionModelId, resolveByokLmEnablement, type IByokLmModelInfo } from '../../common/agentHostByokLm.js';
import { AgentHostByokModelsEnabledConfigKey, AgentHostSessionSyncEnabledConfigKey, platformRootSchema, type AgentHostMcpServers } from '../../common/agentHostSchema.js';
import { CopilotCliConfigKey, copilotCliConfigSchema, normalizeModelFamilyAlias, normalizeToolSearchDeferThreshold, resolveModelCapabilityOverrideField } from '../../common/copilotCliConfig.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { reasoningEffortLevels, type ReasoningEffortLevel } from '../../common/reasoningEffort.js';
import { AgentHostSandboxConfigKey, sandboxConfigSchema } from '../../common/sandboxConfigSchema.js';
import { SEMANTIC_SEARCH_TOOL_NAME } from '../../common/semanticSearchConstants.js';
import type { ModelSelection, ToolDefinition } from '../../common/state/protocol/state.js';
import { RUNTIME_TOOL_SEARCH_TOOL_NAME } from '../../common/toolSearchConstants.js';
import type { ActiveClientToolSet } from '../activeClientState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostManagedSettingsService } from '../agentHostManagedSettingsService.js';
import { IAgentHostTerminalManager } from '../agentHostTerminalManager.js';
import { IByokLmBridgeRegistry } from '../byokLmBridgeRegistry.js';
import { IByokLmProxyService, type IByokLmProxyHandle } from './byokLmProxyService.js';
import type { ICopilotMcpServerInfo, ICopilotPluginInfo } from './copilotAgent.js';
import { toSdkHooks, toSdkInstructionDirectories, toSdkMcpServers, toSdkMcpServersFromConfigMap, toSdkSessionCustomAgents, toSdkSkillDirectories } from './copilotPluginConverters.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import { ShellManager, createShellTools, type IUnsandboxedCommandConfirmationRequest } from './copilotShellTools.js';
import { isGpt56Model } from './modelIdentifiers.js';
import { EPHEMERAL_DISABLED_COPILOT_TOOLS } from './copilotToolDisplay.js';
import './prompts/allPrompts.js';
import { agentHostPromptRegistry, type IAgentHostPromptContext } from './prompts/promptRegistry.js';
import { describeSystemMessageConfig } from './prompts/systemMessage.js';
import { buildSandboxConfigForSdk, type SandboxConfig } from './sandboxConfigForSdk.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, agentHostModelSupportsToolSearch } from './toolSearchDeferral.js';

export const ThinkingLevelConfigKey = 'thinkingLevel';
/**
 * Config key for the numeric "Context Size" selection (a context-window token count). Mapped to the
 * SDK's two-valued {@link SessionConfig.contextTier} by {@link getCopilotContextTier}.
 */
export const ContextSizeConfigKey = 'contextSize';
/**
 * @deprecated Legacy config key that stored the resolved tier string (`'default'` / `'long_context'`)
 * directly. Replaced by the numeric {@link ContextSizeConfigKey}; still read from persisted sessions
 * for backward compatibility.
 */
export const ContextTierConfigKey = 'contextTier';

/**
 * Every reasoning-effort tier that the runtime may advertise via a model's
 * `supportedReasoningEfforts`. This is intentionally broader than the SDK's
 * `SessionConfig['reasoningEffort']` union, which lags behind newly-introduced
 * tiers such as `'max'`; values are passed through to the runtime as-is.
 *
 * Aliased from the canonical list rather than re-declared: a private copy that
 * misses a tier silently drops it from the model picker, which is exactly how
 * `'max'` went missing.
 */
const ReasoningEfforts = reasoningEffortLevels;
type AgentHostReasoningEffort = ReasoningEffortLevel;

function disabledMcpServersSessionOption(plugins: readonly ICopilotPluginInfo[], disabledRootMcpServers: readonly string[] | undefined, additionalDisabledMcpServers: readonly string[] | undefined): Partial<SessionConfig> {
	const disabledMcpServers = [...new Set([
		...plugins.flatMap(plugin => plugin.disabledMcpServers ?? []),
		...(disabledRootMcpServers ?? []),
		...(additionalDisabledMcpServers ?? []),
	])];
	return disabledMcpServers.length > 0 ? { disabledMcpServers } : {};
}

/**
 * Returns whether Agent Host must include the server in `SessionConfig.mcpServers` instead of leaving it to SDK plugin discovery.
 */
export function isMcpServerExplicitlyProjected(server: ICopilotMcpServerInfo): boolean {
	return server.sdkRegistration === 'sessionConfig';
}

/**
 * Narrows a reasoning-effort value to the SDK's declared union. The SDK type is
 * a strict subset of the tiers the runtime accepts, so newer tiers are forwarded
 * unchanged rather than dropped.
 */
export function toSdkReasoningEffort(effort: AgentHostReasoningEffort | undefined): SessionConfig['reasoningEffort'] {
	return effort as SessionConfig['reasoningEffort'];
}

const ContextTiers = ['default', 'long_context'] as const;
const AGENT_HOST_COPILOT_CLIENT_NAME = 'vscode-agent-host';

type UserInputHandler = NonNullable<SessionConfig['onUserInputRequest']>;
type UserInputRequest = Parameters<UserInputHandler>[0];
type UserInputInvocation = Parameters<UserInputHandler>[1];
type UserInputResponse = Awaited<ReturnType<UserInputHandler>>;
type McpAuthHandler = NonNullable<SessionConfig['onMcpAuthRequest']>;
type McpAuthRequest = Parameters<McpAuthHandler>[0];
type McpAuthContext = Parameters<McpAuthHandler>[1];
type McpAuthResponse = Awaited<ReturnType<McpAuthHandler>>;
type PreToolUseHookInput = Parameters<NonNullable<SessionHooks['onPreToolUse']>>[0];
type PostToolUseHookInput = Parameters<NonNullable<SessionHooks['onPostToolUse']>>[0];
/**
 * Immutable snapshot of the active client's structural contributions at
 * session creation time. Used to detect when the session needs to be
 * refreshed. Root MCP servers participate in restart detection because they
 * are merged into the SDK session config. The owning `clientId`s are
 * deliberately NOT part of this snapshot: client identity is tracked live via
 * {@link ActiveClientToolSet} so a window
 * reload (new `clientId`, identical tools/plugins) does not force a restart.
 */
export interface IActiveClientSnapshot {
	readonly tools: readonly ToolDefinition[];
	readonly plugins: readonly ICopilotPluginInfo[];
	readonly mcpServers: AgentHostMcpServers;
}

/**
 * The set of client-tool names the agent sees for a snapshot — each tool's
 * `ToolDefinition.name` (the camelCase `toolReferenceName`). Gates prompt
 * sections at launch and routes client tool calls, so the two stay derived from
 * one definition.
 */
export function clientToolNamesFromSnapshot(snapshot: IActiveClientSnapshot): ReadonlySet<string> {
	return new Set(snapshot.tools.map(tool => tool.name));
}

/**
 * Narrows the names that gate prompt content so the system message never
 * advertises a tool the filters disabled. Client tools are `custom:`-source even
 * when they override a built-in, so bare-name and `custom:` forms match (the
 * tool-search tool under either of its names). Routing keeps the unfiltered
 * set — the runtime is the enforcement point.
 */
export function filterClientToolNames(names: ReadonlySet<string>, availableTools: readonly string[] | undefined, excludedTools: readonly string[] | undefined): ReadonlySet<string> {
	if (!availableTools && !excludedTools) {
		return names;
	}
	const matches = (patterns: readonly string[], name: string) => {
		const sdkName = toSdkClientToolName(name);
		return patterns.some(pattern =>
			pattern === name ||
			pattern === sdkName ||
			pattern === `custom:${name}` ||
			pattern === `custom:${sdkName}` ||
			pattern === 'custom:*'
		);
	};
	const result = new Set<string>();
	for (const name of names) {
		const allowed = !availableTools || matches(availableTools, name);
		if (allowed && !(excludedTools && matches(excludedTools, name))) {
			result.add(name);
		}
	}
	return result;
}

/** The SDK-registered name for a client tool; only the tool-search tool differs. */
function toSdkClientToolName(name: string): string {
	return name === CLIENT_TOOL_SEARCH_REFERENCE_NAME ? RUNTIME_TOOL_SEARCH_TOOL_NAME : name;
}

/** Maps Agent Host reference names to the names registered with the SDK. */
export function toSdkToolFilterPatterns(patterns: readonly string[] | undefined): string[] | undefined {
	if (!patterns) {
		return undefined;
	}
	return [...new Set(patterns.map(pattern => {
		if (pattern === CLIENT_TOOL_SEARCH_REFERENCE_NAME) {
			return toSdkClientToolName(pattern);
		}
		if (pattern === `custom:${CLIENT_TOOL_SEARCH_REFERENCE_NAME}`) {
			return `custom:${toSdkClientToolName(CLIENT_TOOL_SEARCH_REFERENCE_NAME)}`;
		}
		return pattern;
	}))];
}

export interface ICopilotSessionRuntime {
	/** Chat channel that owns this session's turns, used to attribute terminal claims. */
	readonly chatUri: URI;
	handlePermissionRequest(request: PermissionRequest): Promise<PermissionRequestResult>;
	handleExitPlanModeRequest(request: ExitPlanModeRequest, invocation: { sessionId: string }): Promise<ExitPlanModeResult>;
	handleUserInputRequest(request: UserInputRequest, invocation: UserInputInvocation): Promise<UserInputResponse>;
	handleElicitationRequest(context: ElicitationContext): Promise<ElicitationResult>;
	handleMcpAuthRequest(request: McpAuthRequest, context: McpAuthContext): Promise<McpAuthResponse>;
	requestUnsandboxedCommandConfirmation(request: IUnsandboxedCommandConfirmationRequest): Promise<boolean>;
	handlePreToolUse(input: PreToolUseHookInput): Promise<void>;
	handlePostToolUse(input: PostToolUseHookInput): Promise<void>;
	handleUserPromptSubmitted(): { readonly additionalContext: string } | undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	createClientSdkTools(toolSearchActive: boolean): Tool<any>[];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	createServerSdkTools(): Tool<any>[];
}

export interface ICopilotSessionLauncher {
	/**
	 * Creates an unowned SDK session wrapper. The caller is responsible for
	 * registering or disposing the returned wrapper.
	 */
	launch(plan: CopilotSessionLaunchPlan, runtime: ICopilotSessionRuntime): Promise<CopilotSessionWrapper>;
}

type CopilotSessionClient = Pick<CopilotClient, 'createSession' | 'resumeSession'>;

interface ICopilotSessionLaunchBase {
	readonly client: CopilotSessionClient;
	readonly sessionId: string;
	/** Whether this launch is for a transient session that skips durable-only provider work. */
	readonly isEphemeral?: boolean;
	/**
	 * Whether the owning chat surface is scoped to editing a single file, so
	 * blanket shell auto-approvals must not apply. See
	 * {@link IAgentCreateChatOptions.hasScopedEditSurface}.
	 */
	readonly hasScopedEditSurface?: boolean;
	readonly workingDirectory: URI | undefined;
	/**
	 * The additional working directories beyond the primary process root
	 * ({@link workingDirectory} = index 0). These are the peer roots of a
	 * multi-root session's ordered set — the directories the agent should be
	 * granted tool access to in addition to its process cwd. Empty (or absent)
	 * for a single-root session. Passed through so the SDK can register them as
	 * extra accessible roots once that surface is available; the process still
	 * launches in {@link workingDirectory}.
	 */
	readonly additionalDirectories?: readonly URI[];
	readonly resolvedAgentName: string | undefined;
	readonly snapshot: IActiveClientSnapshot;
	/** Root-configured MCP servers disabled by the owning session's resolved customization state. */
	readonly disabledRootMcpServers?: readonly string[];
	/**
	 * Live, long-lived registry of every active client's tool contributions.
	 * Read at tool-call stamp time so a window reload (new `clientId`,
	 * identical tools) stamps subsequent client tool calls with the current
	 * owning id rather than the one frozen into {@link snapshot} at creation,
	 * and so a tool call is attributed to whichever client contributed it.
	 */
	readonly activeClientToolSet: ActiveClientToolSet;
	readonly shellManager: ShellManager | undefined;
	readonly githubToken: string | undefined;

	/**
	 * Whether this is a workspace-less session. Threaded into the
	 * prompt context so the resolved system message gets the scratch/repoless
	 * variant. Named to match the `workspaceless` marker used throughout the AH
	 * layer (session `_meta`, stored metadata) that this value flows from.
	 */
	readonly workspaceless?: boolean;
}

export interface ICopilotCreateSessionLaunchPlan extends ICopilotSessionLaunchBase {
	readonly kind: 'create';
	readonly model: ModelSelection | undefined;
	readonly longContextWindow?: number;
	readonly freeLongContext?: boolean;
}

export interface ICopilotResumeSessionLaunchPlan extends ICopilotSessionLaunchBase {
	readonly kind: 'resume';
	readonly workingDirectory: URI;
	readonly fallback: {
		readonly model: ModelSelection | undefined;
		readonly longContextWindow?: number;
		readonly freeLongContext?: boolean;
	};
}

export type CopilotSessionLaunchPlan = ICopilotCreateSessionLaunchPlan | ICopilotResumeSessionLaunchPlan;

export function isCopilotReasoningEffort(value: unknown): value is AgentHostReasoningEffort {
	return ReasoningEfforts.some(reasoningEffort => reasoningEffort === value);
}

function isContextTier(value: unknown): value is ContextTier {
	return ContextTiers.some(contextTier => contextTier === value);
}

function getCopilotSdkErrorCode(err: unknown): number | undefined {
	if (typeof err !== 'object' || err === null) {
		return undefined;
	}
	const code = Object.getOwnPropertyDescriptor(err, 'code')?.value;
	return typeof code === 'number' ? code : undefined;
}

function getErrorMessage(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	if (typeof err === 'object' && err !== null) {
		const message = Object.getOwnPropertyDescriptor(err, 'message')?.value;
		if (typeof message === 'string') {
			return message;
		}
	}
	return String(err);
}

/**
 * Messages from a failed Copilot SDK `session.resume` that positively indicate
 * the session has no events on disk, so there is no history to lose. Includes
 * the post-"Start Over" case, where `truncateChat` leaves zero events.
 */
const RESUMABLE_HISTORY_ABSENT_PATTERNS = [
	/\bSession not found\b/i,
	/\bno events\b/i,
	/\bempty session\b/i,
];

/**
 * Decide whether a Copilot SDK `resumeSession` failure should fall back to
 * `createSession({ sessionId })`, which presents the session as having no
 * history. Deliberately an allowlist: a fallback on an unrelated failure (a
 * transient `network fetch failed` is also `-32603`) discards a live session's
 * history and leaves it exposed to empty-session GC.
 */
function shouldCreateEmptySessionAfterResumeError(err: unknown): boolean {
	if (getCopilotSdkErrorCode(err) !== -32603) {
		return false;
	}

	const message = getErrorMessage(err);
	return RESUMABLE_HISTORY_ABSENT_PATTERNS.some(pattern => pattern.test(message));
}

function isCustomAgentNotFoundError(err: unknown): boolean {
	return getCopilotSdkErrorCode(err) === -32603 && /\bCustom agent '.+' not found\b/i.test(getErrorMessage(err));
}

/**
 * Resolves the reasoning effort: a recognized override level wins over the
 * model picker's thinking level; an unrecognized override is ignored (degrades
 * to the picker). Validation is against the known effort levels only — the
 * caller/operator is responsible for choosing a level the model supports.
 */
export function getCopilotReasoningEffort(model: ModelSelection | undefined, effortOverride?: string): SessionConfig['reasoningEffort'] {
	if (isCopilotReasoningEffort(effortOverride)) {
		return toSdkReasoningEffort(effortOverride);
	}
	const thinkingLevel = model?.config?.[ThinkingLevelConfigKey];
	return isCopilotReasoningEffort(thinkingLevel) ? toSdkReasoningEffort(thinkingLevel) : undefined;
}

/** Log label for a session's model; a session may have none (server-side "Auto"). */
function describeModelId(model: ModelSelection | undefined): string {
	return model?.id ?? '(no model)';
}

/**
 * The configured reasoning-effort override alone, with no picker fallback.
 * Keyed by the un-aliased model id, falling back to the `*` entry; `undefined`
 * means no override is configured.
 */
export function resolveConfiguredReasoningEffortOverride(model: ModelSelection | undefined, configurationService: Pick<IAgentConfigurationService, 'getRootValue'>, logService: ILogService, sessionId: string): SessionConfig['reasoningEffort'] {
	const overrides = configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ModelCapabilityOverrides);
	const effort = resolveModelCapabilityOverrideField(overrides, model?.id, 'reasoningEffort', isCopilotReasoningEffort, value => {
		logService.warn(`[Copilot:${sessionId}] Ignoring invalid reasoning-effort override '${value}' for '${describeModelId(model)}'; expected one of [${ReasoningEfforts.join(', ')}]`);
	});
	if (effort !== undefined) {
		logService.info(`[Copilot:${sessionId}] Applying reasoning-effort override '${effort}' for '${describeModelId(model)}'`);
		return toSdkReasoningEffort(effort);
	}
	return undefined;
}

/**
 * The configured override over the picker's thinking level. Shared by the
 * launcher and `CopilotAgent._changeModel` so both resolve it the same way.
 */
export function resolveCopilotReasoningEffort(model: ModelSelection | undefined, configurationService: Pick<IAgentConfigurationService, 'getRootValue'>, logService: ILogService, sessionId: string): SessionConfig['reasoningEffort'] {
	return resolveConfiguredReasoningEffortOverride(model, configurationService, logService, sessionId) ?? getCopilotReasoningEffort(model);
}

/**
 * Shape-checked only: the SDK deep-merges this over its own defaults and ignores
 * unrecognized keys, so field-level validation belongs at that boundary.
 */
function getModelCapabilitiesOverride(value: Record<string, unknown> | undefined, modelId: string, logService: ILogService, sessionId: string): ModelCapabilitiesOverride | undefined {
	if (value === undefined) {
		return undefined;
	}
	logService.info(`[Copilot:${sessionId}] Applying 'modelCapabilities' capability override for '${modelId}'`);
	return value as ModelCapabilitiesOverride;
}

/** The sources a bare `'*'` means; the SDK only accepts source-qualified wildcards. */
const TOOL_FILTER_SOURCE_WILDCARDS = ['builtin:*', 'mcp:*', 'custom:*'];

/**
 * The patterns in a tool-filter override, or `undefined` when the value is not a
 * list (a lone string reads as one entry). A bare `'*'` expands to the source
 * wildcards: the SDK throws on the bare form, and dropping it would turn
 * "exclude everything" into "exclude nothing". Pure, so the launcher and
 * {@link CopilotAgentSession} gate on the same set without duplicate logging.
 */
export function normalizeToolFilterPatterns(value: unknown): string[] | undefined {
	const list = typeof value === 'string' ? [value] : value;
	if (!isStringArray(list)) {
		return undefined;
	}
	// `[]` is preserved, not collapsed to "unset": an empty allowlist means "no
	// tools", and dropping it would enable every tool instead.
	return [...new Set(list.flatMap(pattern => pattern === '*' ? TOOL_FILTER_SOURCE_WILDCARDS : [pattern]))];
}

/**
 * {@link normalizeToolFilterPatterns} plus the launch-time log line. The field
 * resolver already rejected unusable values, so the input normalizes cleanly.
 */
function getToolFilterOverride(value: string | readonly string[] | undefined, field: string, modelId: string, logService: ILogService, sessionId: string): string[] | undefined {
	const patterns = value !== undefined ? normalizeToolFilterPatterns(value) : undefined;
	if (patterns !== undefined) {
		logService.info(`[Copilot:${sessionId}] Applying '${field}' capability override for '${modelId}': ${patterns.join(', ')}`);
	}
	return patterns;
}

export function getCopilotContextTier(model: ModelSelection | undefined, longContextWindow?: number, freeLongContext?: boolean): SessionConfig['contextTier'] {
	// Legacy persisted selections stored the resolved tier string directly under the deprecated key.
	const legacyTier = model?.config?.[ContextTierConfigKey];
	if (isContextTier(legacyTier)) {
		return legacyTier;
	}
	// The "Context Size" picker exposes numeric token-count enum values, so a current selection arrives
	// under `contextSize` as a token count. Map it to the SDK's two-valued tier using the model's
	// long-context window: only a selection that reaches that window opts into `long_context`. Without
	// the window (model exposes no picker, or the model list isn't loaded) leave the SDK on its default
	// tier.
	const contextSize = model?.config?.[ContextSizeConfigKey];
	if (contextSize === undefined) {
		// No selection: free long context defaults to the full window; other models stay on the SDK default tier.
		return freeLongContext ? 'long_context' : undefined;
	}
	const selectedWindow = Number(contextSize);
	if (!Number.isFinite(selectedWindow) || typeof longContextWindow !== 'number') {
		return undefined;
	}
	return selectedWindow >= longContextWindow ? 'long_context' : 'default';
}

/**
 * Resolve the BYOK provider/model session config for `sessionId` from the
 * renderer's active bridge. Returns empty — the session launches without BYOK
 * models — when BYOK is gated off (no active bridge), when the renderer reports
 * no BYOK models, or when enumeration fails; `startProxy` is invoked only once
 * at least one model is present.
 *
 * Each vendor maps to one `type: 'openai'` / `wireApi: 'responses'` provider
 * whose `baseUrl` points at the proxy and authenticates with the session-scoped
 * `Bearer <nonce>.<sessionId>`; each model is surfaced under the
 * provider-qualified selection id `vendor/[group/]id`, matching what the renderer's
 * `AgentHostByokLmHandler` resolves.
 *
 * Extracted from {@link CopilotSessionLauncher} so the synthesis and gating are
 * unit-testable without instantiating the launcher; the launcher passes a
 * `startProxy` thunk that memoizes the single shared proxy handle.
 */
export async function resolveByokSessionConfig(
	sessionId: string,
	bridgeRegistry: IByokLmBridgeRegistry,
	startProxy: () => Promise<IByokLmProxyHandle>,
	logService: ILogService,
): Promise<{ providers?: NamedProviderConfig[]; models?: ProviderModelConfig[] }> {
	// Surface the serving window's BYOK models. The registry does not union
	// windows' model sets — all serving windows expose the same set, so it picks
	// one (see `IByokLmBridgeRegistry`) and the proxy routes inference there.
	let byokModels: IByokLmModelInfo[];
	try {
		byokModels = [...bridgeRegistry.getModels()];
	} catch (err) {
		logService.warn(`[Copilot:${sessionId}] Failed to enumerate BYOK models from renderer bridges`, err);
		return {};
	}
	if (byokModels.length === 0) {
		return {};
	}
	// Deduplicate by group-qualified selection id (`vendor/[group/]id`). The same BYOK model can be
	// reported more than once — e.g. when two renderer bridges are transiently
	// serving during a window hand-off (continuing a chat into a new session) —
	// and the runtime rejects a session config with duplicate BYOK model
	// selection ids ("Duplicate BYOK model selection id ...").
	const seenSelectionIds = new Set<string>();
	byokModels = byokModels.filter(m => {
		const selectionId = `${m.vendor}/${getByokLmSelectionModelId(m)}`;
		if (seenSelectionIds.has(selectionId)) {
			return false;
		}
		seenSelectionIds.add(selectionId);
		return true;
	});
	// `startProxy` binds a local loopback listener — unlikely to fail, but it
	// must never break session materialization (which fires the cross-window
	// `sessionAdded` broadcast). Degrade to no BYOK config on failure.
	let handle: IByokLmProxyHandle;
	try {
		handle = await startProxy();
	} catch (err) {
		logService.warn(`[Copilot:${sessionId}] Failed to start BYOK loopback proxy`, err);
		return {};
	}
	const providers: NamedProviderConfig[] = [...new Set(byokModels.map(m => m.vendor))].map(vendor => ({
		name: vendor,
		type: 'openai',
		wireApi: 'responses',
		baseUrl: handle.providerBaseUrl(vendor),
		bearerToken: `${handle.nonce}.${sessionId}`,
	}));
	const models: ProviderModelConfig[] = byokModels.map(m => ({
		id: getByokLmSelectionModelId(m),
		provider: m.vendor,
		...(m.name !== undefined ? { name: m.name } : {}),
		...(m.maxContextWindowTokens !== undefined ? { maxContextWindowTokens: m.maxContextWindowTokens } : {}),
	}));
	logService.info(`[Copilot:${sessionId}] Wired ${models.length} BYOK model(s) across ${providers.length} provider(s) via loopback proxy ${handle.baseUrl}`);
	return { providers, models };
}

export class CopilotSessionLauncher implements ICopilotSessionLauncher {

	/**
	 * Memoized handle for the single shared BYOK loopback proxy, started lazily
	 * on the first session launch that surfaces BYOK models (see
	 * {@link _resolveByokSessionConfig}). Held as a promise so concurrent
	 * launches share one bind. Released and cleared by
	 * {@link disposeByokProxyHandle} when the owning Copilot client/runtime is
	 * stopped, so the next start mints a fresh nonce.
	 */
	private _byokProxyHandle: Promise<IByokLmProxyHandle> | undefined;

	constructor(
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostManagedSettingsService private readonly _managedSettingsService: IAgentHostManagedSettingsService,
		@IAgentHostTerminalManager private readonly _terminalManager: IAgentHostTerminalManager,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
		@IByokLmProxyService private readonly _byokLmProxyService: IByokLmProxyService,
		@IByokLmBridgeRegistry private readonly _byokLmBridgeRegistry: IByokLmBridgeRegistry,
		@IAgentHostOTelService private readonly _otelService: IAgentHostOTelService,
	) { }

	async launch(plan: CopilotSessionLaunchPlan, runtime: ICopilotSessionRuntime): Promise<CopilotSessionWrapper> {
		const config = await this._buildSessionConfig(plan, runtime);
		const sandboxConfig = this._computeSandboxConfig();
		if (plan.kind === 'create') {
			return this._createSession(plan, config, sandboxConfig);
		}

		let fallbackPlan = plan;
		let fallbackConfig = config;
		try {
			const stopWatch = new StopWatch();
			this._logService.trace(`[Copilot:${plan.sessionId}] Calling SDK resumeSession...`);
			const raw = await this._withTraceContext(plan.sessionId, () => plan.client.resumeSession(plan.sessionId, config));
			this._logService.trace(`[Copilot:${plan.sessionId}] SDK resumeSession succeeded after ${stopWatch.elapsed()}ms`);
			return this._finalizeSession(raw, sandboxConfig, plan.sessionId, plan.fallback.model?.id);
		} catch (err) {
			let resumeError = err;
			const errCode = getCopilotSdkErrorCode(resumeError);
			const errMsg = getErrorMessage(resumeError);
			this._logService.warn(`[Copilot:${plan.sessionId}] SDK resumeSession failed: code=${errCode}, message=${errMsg}`);
			if (plan.resolvedAgentName && isCustomAgentNotFoundError(resumeError)) {
				fallbackPlan = { ...plan, resolvedAgentName: undefined };
				fallbackConfig = { ...config, agent: undefined };
				this._logService.warn(`[Copilot:${plan.sessionId}] Stored custom agent '${plan.resolvedAgentName}' was not found; retrying resume without a custom agent`);
				try {
					const raw = await this._withTraceContext(fallbackPlan.sessionId, () => fallbackPlan.client.resumeSession(fallbackPlan.sessionId, fallbackConfig));
					return this._finalizeSession(raw, sandboxConfig, plan.sessionId, fallbackPlan.fallback.model?.id);
				} catch (retryErr) {
					resumeError = retryErr;
					this._logService.warn(`[Copilot:${plan.sessionId}] SDK resumeSession without custom agent failed: code=${getCopilotSdkErrorCode(retryErr)}, message=${getErrorMessage(retryErr)}`);
				}
			}
			// Only a session with no events on disk may fall back to creating a
			// fresh one under the same ID (seeding model & working directory
			// from stored metadata); every other failure propagates.
			if (!shouldCreateEmptySessionAfterResumeError(resumeError)) {
				this._logService.warn(`[Copilot:${plan.sessionId}] Resume failure does not indicate an empty session; surfacing it instead of replacing the session with an empty one`);
				throw resumeError;
			}

			this._logService.warn(`[Copilot:${plan.sessionId}] Resume reported no session history; falling back to createSession with same ID`);
			const wrapper = await this._createSession({
				...fallbackPlan,
				kind: 'create',
				model: fallbackPlan.fallback.model,
				longContextWindow: fallbackPlan.fallback.longContextWindow,
				freeLongContext: fallbackPlan.fallback.freeLongContext,
			}, fallbackConfig, sandboxConfig);
			this._logService.info(`[Copilot:${plan.sessionId}] Fallback createSession succeeded`);
			return wrapper;
		}
	}

	private _withTraceContext<T>(sessionId: string, fn: () => T): T {
		const sessionUri = AgentSession.uri('copilotcli', sessionId).toString();
		return this._otelService.withTraceContext(this._otelService.getSessionTraceContext(sessionId, sessionUri), fn);
	}

	private async _createSession(plan: ICopilotCreateSessionLaunchPlan, config: ResumeSessionConfig, sandboxConfig: SandboxConfig | undefined): Promise<CopilotSessionWrapper> {
		const raw = await this._withTraceContext(plan.sessionId, () => plan.client.createSession({
			...config,
			sessionId: plan.sessionId,
			streaming: true,
			model: plan.model?.id,
			reasoningEffort: resolveCopilotReasoningEffort(plan.model, this._configurationService, this._logService, plan.sessionId),
			contextTier: getCopilotContextTier(plan.model, plan.longContextWindow, plan.freeLongContext),
			...(plan.resolvedAgentName ? { agent: plan.resolvedAgentName } : {}),
			workingDirectory: plan.workingDirectory?.fsPath,
		}));
		return this._finalizeSession(raw, sandboxConfig, plan.sessionId, plan.model?.id);
	}

	private async _finalizeSession(raw: CopilotSessionWrapper['session'], sandboxConfig: SandboxConfig | undefined, sessionId: string, modelId: string | undefined): Promise<CopilotSessionWrapper> {
		await this._applySandboxConfig(raw, sandboxConfig, sessionId);
		// TODO: Remove these post-launch updates once the SDK exposes verbosity and
		// reasoningSummary in SessionConfig, alongside launch options such as reasoningEffort.
		if (isGpt56Model(modelId)) {
			await this._applyGpt56Customizations(raw, sessionId);
		}
		return new CopilotSessionWrapper(raw);
	}

	/** Applies the post-launch session options used by GPT-5.6 models. */
	private async _applyGpt56Customizations(session: CopilotSessionWrapper['session'], sessionId: string): Promise<void> {
		await this._applyVerbosity(session, 'medium', sessionId);
		const reasoningSummaryEnabled = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ReasoningSummary) === true;
		if (reasoningSummaryEnabled) {
			await this._applyReasoningSummary(session, 'concise', sessionId);
		}
	}

	/** Sets output verbosity after session creation. */
	private async _applyVerbosity(session: CopilotSessionWrapper['session'], verbosity: Verbosity, sessionId: string): Promise<void> {
		try {
			await session.rpc.options.update({ verbosity });
			this._logService.info(`[Copilot:${sessionId}] Applied '${verbosity}' verbosity`);
		} catch (err) {
			this._logService.warn(`[Copilot:${sessionId}] Failed to apply '${verbosity}' verbosity`, err);
		}
	}

	/** Sets reasoning summary detail after session creation. */
	private async _applyReasoningSummary(session: CopilotSessionWrapper['session'], reasoningSummary: ReasoningSummary, sessionId: string): Promise<void> {
		try {
			await session.rpc.options.update({ reasoningSummary });
			this._logService.info(`[Copilot:${sessionId}] Applied '${reasoningSummary}' reasoning summary`);
		} catch (err) {
			this._logService.warn(`[Copilot:${sessionId}] Failed to apply '${reasoningSummary}' reasoning summary`, err);
		}
	}

	/**
	 * Compute the SDK-shaped sandbox policy to push to the runtime for the
	 * SDK's built-in shell tool.
	 *
	 * Returns `undefined` when {@link CopilotCliConfigKey.EnableCustomTerminalTool}
	 * is ON — in that case the AgentHost provides its own shell tools, which
	 * wrap commands via the host terminal sandbox engine, so no SDK-side
	 * sandbox policy is needed. Otherwise the policy is derived from the
	 * host's `sandbox` config bag (forwarded from the workbench's
	 * `chat.agent.sandbox.*` settings), mirroring what
	 * `buildSandboxConfigForCLI` does for the Copilot extension's CLI path.
	 */
	private _computeSandboxConfig(): SandboxConfig | undefined {
		const enableCustomTerminalTool = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.EnableCustomTerminalTool) === true;
		if (enableCustomTerminalTool) {
			return undefined;
		}
		return buildSandboxConfigForSdk(process.platform, this._configurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox));
	}

	/**
	 * Forward the SDK-shaped sandbox policy to the runtime via
	 * `session.options.update`, immediately after the session is created or
	 * resumed.
	 *
	 * No-op when {@link _computeSandboxConfig} returned `undefined` (custom
	 * terminal tool enabled, or the host sandbox config evaluates to disabled).
	 */
	private async _applySandboxConfig(session: CopilotSessionWrapper['session'], sandboxConfig: SandboxConfig | undefined, sessionId: string): Promise<void> {
		if (!sandboxConfig) {
			return;
		}
		try {
			await session.rpc.options.update({ sandboxConfig });
			this._logService.info(`[Copilot:${sessionId}] Applied SDK sandboxConfig via session.options.update`);
		} catch (err) {
			this._logService.warn(`[Copilot:${sessionId}] Failed to apply SDK sandboxConfig`, err);
		}
	}

	/**
	 * Launcher-bound wrapper over {@link resolveByokSessionConfig}: supplies the
	 * active bridge registry and a `startProxy` thunk that memoizes the single
	 * shared proxy handle for this launcher (started lazily on first use).
	 */
	private _resolveByokSessionConfig(sessionId: string): Promise<{ providers?: NamedProviderConfig[]; models?: ProviderModelConfig[] }> {
		const rootConfigValue = this._configurationService.getRootValue(platformRootSchema, AgentHostByokModelsEnabledConfigKey);
		const { enabled, trace } = resolveByokLmEnablement(rootConfigValue);
		this._logService.trace(`[Copilot:${sessionId}] BYOK session configuration ${trace}`);
		if (!enabled) {
			return Promise.resolve({});
		}
		return resolveByokSessionConfig(sessionId, this._byokLmBridgeRegistry, () => {
			if (!this._byokProxyHandle) {
				this._byokProxyHandle = this._byokLmProxyService.start();
			}
			return this._byokProxyHandle;
		}, this._logService);
	}

	/**
	 * Release the memoized BYOK loopback proxy handle (if any) and clear it so
	 * the next session launch mints a fresh nonce. Idempotent.
	 *
	 * **Ownership invariant.** The caller MUST stop the Copilot client/runtime
	 * subprocess before invoking this: disposing the handle drops the proxy's
	 * refcount and may rebind it on a different port/nonce, so a still-running
	 * subprocess would silently lose its endpoint — see {@link IByokLmProxyHandle}.
	 * Invoked from `CopilotAgent._stopClient` / `CopilotAgent.shutdown` after the
	 * client has stopped.
	 */
	async disposeByokProxyHandle(): Promise<void> {
		const handle = this._byokProxyHandle;
		this._byokProxyHandle = undefined;
		if (!handle) {
			return;
		}
		try {
			(await handle).dispose();
		} catch {
			// The lazy `start()` rejected; there is nothing to release.
		}
	}

	private async _buildSessionConfig(plan: CopilotSessionLaunchPlan, runtime: ICopilotSessionRuntime): Promise<ResumeSessionConfig> {
		const plugins = plan.snapshot.plugins;
		// Synthesize BYOK provider/model config (empty when BYOK is gated off or the
		// renderer reports no BYOK models), merged into the returned config so both
		// createSession and resumeSession advertise the models to the runtime.
		const byok = await this._resolveByokSessionConfig(plan.sessionId);
		const enableCustomTerminalTool = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.EnableCustomTerminalTool) === true;
		let shellTools: Awaited<ReturnType<typeof createShellTools>> = [];
		if (enableCustomTerminalTool) {
			if (!plan.shellManager) {
				throw new Error(`ShellManager is required to launch Copilot session '${plan.sessionId}'`);
			}
			shellTools = await createShellTools(plan.shellManager, runtime.chatUri, this._terminalManager, this._logService, request => runtime.requestUnsandboxedCommandConfirmation(request));
		}
		// Rely on the SDK to discover most agents/skills/etc. from `pluginDirectories`
		// instead of feeding them explicitly, to avoid duplicates. Custom agents are the
		// exception: the SDK validates the session-start `agent:` against `customAgents`
		// by name, so the selected agent is force-included (see `toSdkSessionCustomAgents`).
		const pluginsWithoutDirs = plugins.filter(p => !p.pluginDir || p.pluginDir.scheme !== Schemas.file);
		const explicitMcpServers = plan.isEphemeral ? [] : plugins.flatMap(plugin => plugin.mcpServers.filter(server =>
			!plugin.disabledMcpServers?.includes(server.name)
			&& isMcpServerExplicitlyProjected(server)
		));
		// An ephemeral session skips the explicit enumeration (and its file I/O). The SDK can
		// still discover agents from `pluginDirectories`; suppressing that too would also drop
		// skills and instructions, so it is left alone.
		const customAgents = plan.isEphemeral ? [] : await toSdkSessionCustomAgents(plugins, plan.resolvedAgentName, this._fileService);
		const skillDirectories = toSdkSkillDirectories(pluginsWithoutDirs.flatMap(p => p.skills));
		const instructionDirectories = toSdkInstructionDirectories(plugins.flatMap(p => p.instructions));
		const model = plan.kind === 'create' ? plan.model : plan.fallback.model;
		// Keyed by the real, un-aliased model id; a model-less "Auto" session
		// matches the `*` entry only.
		const capabilityOverrides = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ModelCapabilityOverrides);
		const modelId = describeModelId(model);
		const modelFamily = resolveModelCapabilityOverrideField(capabilityOverrides, model?.id, 'family', (value): value is string => normalizeModelFamilyAlias(value) !== undefined, value => {
			const description = typeof value === 'string' ? JSON.stringify(value.slice(0, 40)) : typeof value;
			this._logService.warn(`[Copilot:${plan.sessionId}] Ignoring invalid 'family' capability override ${description} for '${modelId}'; expected a model id of at most 128 characters`);
		});
		// Re-applied on every launch and resume, but NOT on a mid-session model
		// change: a session keeps the filters of the model it launched with.
		const availableToolsOverride = resolveModelCapabilityOverrideField(capabilityOverrides, model?.id, 'availableTools', (value): value is string | readonly string[] => normalizeToolFilterPatterns(value) !== undefined, () => {
			this._logService.warn(`[Copilot:${plan.sessionId}] Ignoring unusable 'availableTools' capability override for '${modelId}'; expected an array of tool patterns`);
		});
		const excludedToolsOverride = resolveModelCapabilityOverrideField(capabilityOverrides, model?.id, 'excludedTools', (value): value is string | readonly string[] => normalizeToolFilterPatterns(value) !== undefined, () => {
			this._logService.warn(`[Copilot:${plan.sessionId}] Ignoring unusable 'excludedTools' capability override for '${modelId}'; expected an array of tool patterns`);
		});
		const availableTools = getToolFilterOverride(availableToolsOverride, 'availableTools', modelId, this._logService, plan.sessionId);
		const excludedTools = getToolFilterOverride(excludedToolsOverride, 'excludedTools', modelId, this._logService, plan.sessionId);
		const sdkAvailableTools = toSdkToolFilterPatterns(availableTools);
		const configuredSdkExcludedTools = plan.isEphemeral
			? [...(toSdkToolFilterPatterns(excludedTools) ?? []), ...EPHEMERAL_DISABLED_COPILOT_TOOLS]
			: toSdkToolFilterPatterns(excludedTools);
		const clientToolNames = filterClientToolNames(clientToolNamesFromSnapshot(plan.snapshot), availableTools, excludedTools);
		const sdkExcludedTools = clientToolNames.has(SEMANTIC_SEARCH_TOOL_NAME)
			? configuredSdkExcludedTools
			: [...new Set([...(configuredSdkExcludedTools ?? []), `builtin:${SEMANTIC_SEARCH_TOOL_NAME}`])];
		const modelCapabilitiesOverride = resolveModelCapabilityOverrideField(capabilityOverrides, model?.id, 'modelCapabilities', (value): value is Record<string, unknown> => isObject(value), () => {
			this._logService.warn(`[Copilot:${plan.sessionId}] Ignoring invalid 'modelCapabilities' capability override for '${modelId}'; expected an object`);
		});
		const modelCapabilities = getModelCapabilitiesOverride(modelCapabilitiesOverride, modelId, this._logService, plan.sessionId);
		// Host-side routing only — the prompt contributor and the tool-search gate
		// below. The wire model stays the selected one, so the session still runs
		// on the real model with the aliased family's prompt and tool profile.
		const effectiveModel = modelFamily ? { ...model, id: modelFamily } : model;
		if (modelFamily) {
			this._logService.info(`[Copilot:${plan.sessionId}] Model capability override: routing prompt for '${describeModelId(model)}' as family '${modelFamily}'`);
		}
		const toolSearchActive = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ToolSearchEnabled) === true
			&& agentHostModelSupportsToolSearch(effectiveModel?.id)
			&& clientToolNames.has(CLIENT_TOOL_SEARCH_REFERENCE_NAME);
		const toolSearchDeferThreshold = normalizeToolSearchDeferThreshold(this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ToolSearchDeferThreshold));
		const managedSettingsPermissions = this._managedSettingsService.permissions;
		const promptContext: IAgentHostPromptContext = {
			getSetting: key => this._configurationService.getRootValue(copilotCliConfigSchema, key),
			hasClientTool: name => clientToolNames.has(name),
			workspaceless: plan.workspaceless === true,
			toolSearchActive,
		};
		const additionalDirectories = plan.additionalDirectories?.map(d => d.fsPath);
		// Resolved once per (re)launch — the SDK has no mid-session system-message
		// update, so this reflects the model/tools/settings at launch time. Log a
		// summary at info for prompt observability; the full config at trace.
		const systemMessage = agentHostPromptRegistry.resolveSystemMessageConfig(effectiveModel, promptContext);
		this._logService.info(`[Copilot:${plan.sessionId}] Resolved system message: ${describeSystemMessageConfig(systemMessage)}`);
		const additionalDisabledMcpServers = plan.isEphemeral ? [
			...plugins.flatMap(plugin => plugin.mcpServers.map(server => server.name)),
			...Object.keys(plan.snapshot.mcpServers),
		] : undefined;
		const disabledMcpServers = disabledMcpServersSessionOption(plugins, plan.disabledRootMcpServers, additionalDisabledMcpServers);
		const mcpServers = plan.isEphemeral ? {} : { ...toSdkMcpServersFromConfigMap(plan.snapshot.mcpServers), ...toSdkMcpServers(explicitMcpServers) };
		if (this._logService.getLevel() <= LogLevel.Trace) {
			// Guarded: a `replace`-mode prompt's content can be multiple KB, so only
			// serialize it when trace output is actually emitted.
			this._logService.trace(`[Copilot:${plan.sessionId}] System message config: ${JSON.stringify(systemMessage, (_key, value) => typeof value === 'function' ? '[transform fn]' : value)}`);
			const sortedUnique = (names: readonly string[]) => [...new Set(names)].sort();
			this._logService.trace(`[Copilot:${plan.sessionId}] MCP launch projection: ${JSON.stringify({
				ephemeral: plan.isEphemeral === true,
				pluginDiscovery: sortedUnique(plugins.flatMap(plugin => plugin.mcpServers.filter(server => server.sdkRegistration === 'pluginDiscovery').map(server => server.name))),
				sessionConfig: sortedUnique(plugins.flatMap(plugin => plugin.mcpServers.filter(server => server.sdkRegistration === 'sessionConfig').map(server => server.name))),
				rootConfig: Object.keys(plan.snapshot.mcpServers).sort(),
				disabled: [...(disabledMcpServers.disabledMcpServers ?? [])].sort(),
				finalSessionConfig: Object.keys(mcpServers).sort(),
			})}`);
		}
		return {
			...byok,
			...disabledMcpServers,
			clientName: AGENT_HOST_COPILOT_CLIENT_NAME,
			// Resume only: `_createSession` re-resolves the full effort for a create,
			// while a resumed session keeps the effort the runtime journaled unless
			// an override is configured.
			...(plan.kind === 'resume' ? { reasoningEffort: resolveConfiguredReasoningEffortOverride(model, this._configurationService, this._logService, plan.sessionId) } : {}),
			modelCapabilities,
			enableMcpApps: true,
			githubMcpToolConfig: { disableFormDeferral: true },
			enableFileHooks: true,
			enableConfigDiscovery: true,
			requestExtensions: false, // force-disable copilot extension management tools (otherwise enabled in experimental mode)
			onPermissionRequest: request => runtime.handlePermissionRequest(request),
			onUserInputRequest: (request, invocation) => runtime.handleUserInputRequest(request, invocation),
			onElicitationRequest: context => runtime.handleElicitationRequest(context),
			onMcpAuthRequest: (request, context) => runtime.handleMcpAuthRequest(request, context),
			hooks: toSdkHooks(pluginsWithoutDirs.flatMap(p => p.hooks), {
				onPreToolUse: input => runtime.handlePreToolUse(input),
				onPostToolUse: input => runtime.handlePostToolUse(input),
				onUserPromptSubmitted: () => runtime.handleUserPromptSubmitted(),
			}),
			mcpServers,
			onExitPlanModeRequest: (request, invocation) => runtime.handleExitPlanModeRequest(request, invocation),
			workingDirectory: plan.workingDirectory?.fsPath,
			customAgents,
			agent: plan.resolvedAgentName,
			skillDirectories,
			instructionDirectories,
			additionalDirectories,
			systemMessage,
			toolSearch: toolSearchActive ? { enabled: true, deferThreshold: toolSearchDeferThreshold } : { enabled: false },
			largeOutput: {
				maxSizeBytes: 8 * 1024,
			},
			managedSettings: {
				permissions: managedSettingsPermissions,
			},
			availableTools: sdkAvailableTools,
			excludedTools: sdkExcludedTools,
			pluginDirectories: coalesce(plugins.map(p => p.pluginDir))
				.filter(d => d.scheme === Schemas.file).map(d => d.fsPath),
			tools: [...shellTools, ...runtime.createClientSdkTools(toolSearchActive), ...runtime.createServerSdkTools()],
			// Pass the GitHub token at the session level. The SDK's
			// client-level `gitHubToken` authenticates the CLI process,
			// but each session also needs its own token resolved into a
			// GitHub identity (login, Copilot plan, endpoints) to drive
			// model routing and quota — without this the session
			// errors with "Session was not created with authentication
			// info or custom provider" on first send. See #318693.
			gitHubToken: plan.githubToken,
			// Enable infinite sessions so the SDK provisions a workspace
			// directory (containing `plan.md`, `checkpoints/`, `files/`).
			// The workspace is required for plan mode to work — without
			// it, `rpc.plan.read()` returns `path: null` and the SDK
			// never emits `exit_plan_mode.requested`.
			infiniteSessions: { enabled: true },
			// Per-session remote export: the client-level `--remote` flag
			// (enableRemoteSessions) enables the CLI capability, but each
			// session must opt in via `remoteSession` to actually export
			// events. Without this, sessions default to "off".
			remoteSession: this._configurationService.getRootValue(platformRootSchema, AgentHostSessionSyncEnabledConfigKey) === true ? 'export' : undefined,
			enableManagedSettings: true,
		};
	}
}
