/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, ExitPlanModeRequest, ExitPlanModeResult, PermissionRequestResult, ResumeSessionConfig, SessionConfig, Tool } from '@github/copilot-sdk';
import { coalesce } from '../../../../base/common/arrays.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService, LogLevel } from '../../../log/common/log.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from '../../common/agentHostCustomizationConfig.js';
import { AgentHostSessionSyncEnabledConfigKey, platformRootSchema, type AgentHostMcpServers } from '../../common/agentHostSchema.js';
import { AgentHostSandboxConfigKey, sandboxConfigSchema } from '../../common/sandboxConfigSchema.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostTerminalManager } from '../agentHostTerminalManager.js';
import type { ModelSelection, ToolDefinition } from '../../common/state/protocol/state.js';
import type { ActiveClientToolSet } from '../activeClientState.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import { ShellManager, createShellTools, type IUnsandboxedCommandConfirmationRequest } from './copilotShellTools.js';
import { toSdkHooks, toSdkInstructionDirectories, toSdkMcpServers, toSdkMcpServersFromConfigMap, toSdkSessionCustomAgents, toSdkSkillDirectories } from './copilotPluginConverters.js';
import { buildSandboxConfigForSdk, type ISdkSandboxConfig } from './sandboxConfigForSdk.js';
import type { ITypedPermissionRequest } from './copilotToolDisplay.js';
import type { ICopilotPluginInfo } from './copilotAgent.js';
import { agentHostPromptRegistry, type IAgentHostPromptContext } from './prompts/promptRegistry.js';
import { describeSystemMessageConfig } from './prompts/systemMessage.js';
import './prompts/allPrompts.js';

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

const ReasoningEfforts = ['low', 'medium', 'high', 'xhigh'] as const;
type ReasoningEffort = NonNullable<SessionConfig['reasoningEffort']>;

const ContextTiers = ['default', 'long_context'] as const;
type ContextTier = NonNullable<SessionConfig['contextTier']>;

type UserInputHandler = NonNullable<SessionConfig['onUserInputRequest']>;
type UserInputRequest = Parameters<UserInputHandler>[0];
type UserInputInvocation = Parameters<UserInputHandler>[1];
type UserInputResponse = Awaited<ReturnType<UserInputHandler>>;
type ElicitationHandler = NonNullable<SessionConfig['onElicitationRequest']>;
type ElicitationContext = Parameters<ElicitationHandler>[0];
type ElicitationResult = Awaited<ReturnType<ElicitationHandler>>;
type SessionHooks = NonNullable<SessionConfig['hooks']>;
type PreToolUseHookInput = Parameters<NonNullable<SessionHooks['onPreToolUse']>>[0];
type PostToolUseHookInput = Parameters<NonNullable<SessionHooks['onPostToolUse']>>[0];
type CopilotSessionLaunchConfig = ResumeSessionConfig & {
	readonly pluginDirectories?: string[];
	readonly remoteSession?: 'export';
};

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
 * `ToolDefinition.name` (the camelCase `toolReferenceName`). Used both to gate
 * tool-specific prompt sections at launch and to route client tool calls during
 * the session, so the two stay derived from one definition.
 */
export function clientToolNamesFromSnapshot(snapshot: IActiveClientSnapshot): ReadonlySet<string> {
	return new Set(snapshot.tools.map(tool => tool.name));
}

export interface ICopilotSessionRuntime {
	handlePermissionRequest(request: ITypedPermissionRequest): Promise<PermissionRequestResult>;
	handleExitPlanModeRequest(request: ExitPlanModeRequest, invocation: { sessionId: string }): Promise<ExitPlanModeResult>;
	handleUserInputRequest(request: UserInputRequest, invocation: UserInputInvocation): Promise<UserInputResponse>;
	handleElicitationRequest(context: ElicitationContext): Promise<ElicitationResult>;
	requestUnsandboxedCommandConfirmation(request: IUnsandboxedCommandConfirmationRequest): Promise<boolean>;
	handlePreToolUse(input: PreToolUseHookInput): Promise<void>;
	handlePostToolUse(input: PostToolUseHookInput): Promise<void>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	createClientSdkTools(): Tool<any>[];
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
	readonly workingDirectory: URI | undefined;
	readonly resolvedAgentName: string | undefined;
	readonly snapshot: IActiveClientSnapshot;
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

function isReasoningEffort(value: unknown): value is ReasoningEffort {
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
 * Decide whether a Copilot SDK `resumeSession` failure should fall back to
 * `createSession({ sessionId })`. We want to preserve the original
 * recovery for empty / truncated sessions (e.g. after the user invoked
 * "Start Over", which calls `truncateSession` and leaves the on-disk
 * session with zero events - the SDK then refuses to resume it), but we
 * must NOT silently swallow corruption / schema-validation / parse
 * failures: those should surface so the user sees the real error and the
 * original session contents are not masked by a fresh empty session.
 *
 * Heuristic: any `-32603` Internal Error is treated as the empty-session
 * case UNLESS the message clearly indicates corruption, schema
 * validation, parse failure, or malformed input.
 */
function shouldCreateEmptySessionAfterResumeError(err: unknown): boolean {
	if (getCopilotSdkErrorCode(err) !== -32603) {
		return false;
	}

	const message = getErrorMessage(err);
	return !/\b(corrupt|corrupted|invalid|validation|schema|must be|parse|malformed|unexpected token)\b/i.test(message);
}

export function getCopilotReasoningEffort(model: ModelSelection | undefined): SessionConfig['reasoningEffort'] {
	const thinkingLevel = model?.config?.[ThinkingLevelConfigKey];
	return isReasoningEffort(thinkingLevel) ? thinkingLevel : undefined;
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
		// When the model's long-context tier costs the same as the default tier,
		// always opt into long_context — no picker is shown and the user gets the
		// larger window for free.
		return freeLongContext ? 'long_context' : undefined;
	}
	const selectedWindow = Number(contextSize);
	if (!Number.isFinite(selectedWindow) || typeof longContextWindow !== 'number') {
		return undefined;
	}
	return selectedWindow >= longContextWindow ? 'long_context' : 'default';
}

export class CopilotSessionLauncher implements ICopilotSessionLauncher {

	constructor(
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostTerminalManager private readonly _terminalManager: IAgentHostTerminalManager,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
	) { }

	async launch(plan: CopilotSessionLaunchPlan, runtime: ICopilotSessionRuntime): Promise<CopilotSessionWrapper> {
		const config = await this._buildSessionConfig(plan, runtime);
		const sandboxConfig = this._computeSandboxConfig();
		if (plan.kind === 'create') {
			return this._createSession(plan, config, sandboxConfig);
		}

		try {
			this._logService.info(`[Copilot:${plan.sessionId}] Calling SDK resumeSession...`);
			const raw = await plan.client.resumeSession(plan.sessionId, {
				...config,
				workingDirectory: plan.workingDirectory.fsPath,
				...(plan.resolvedAgentName ? { agent: plan.resolvedAgentName } : {}),
			});
			this._logService.info(`[Copilot:${plan.sessionId}] SDK resumeSession succeeded`);
			await this._applySandboxConfig(raw, sandboxConfig, plan.sessionId);
			return new CopilotSessionWrapper(raw);
		} catch (err) {
			const errCode = getCopilotSdkErrorCode(err);
			const errMsg = getErrorMessage(err);
			this._logService.warn(`[Copilot:${plan.sessionId}] SDK resumeSession failed: code=${errCode}, message=${errMsg}`);
			// The SDK fails to resume sessions that have no messages.
			// Fall back to creating a new session with the same ID,
			// seeding model & working directory from stored metadata.
			if (!shouldCreateEmptySessionAfterResumeError(err)) {
				throw err;
			}

			this._logService.warn(`[Copilot:${plan.sessionId}] Resume failed (code=-32603), falling back to createSession with same ID`);
			const wrapper = await this._createSession({
				...plan,
				kind: 'create',
				model: plan.fallback.model,
				longContextWindow: plan.fallback.longContextWindow,
				freeLongContext: plan.fallback.freeLongContext,
			}, config, sandboxConfig);
			this._logService.info(`[Copilot:${plan.sessionId}] Fallback createSession succeeded`);
			return wrapper;
		}
	}

	private async _createSession(plan: ICopilotCreateSessionLaunchPlan, config: CopilotSessionLaunchConfig, sandboxConfig: ISdkSandboxConfig | undefined): Promise<CopilotSessionWrapper> {
		const raw = await plan.client.createSession({
			...config,
			sessionId: plan.sessionId,
			streaming: true,
			model: plan.model?.id,
			reasoningEffort: getCopilotReasoningEffort(plan.model),
			contextTier: getCopilotContextTier(plan.model, plan.longContextWindow, plan.freeLongContext),
			...(plan.resolvedAgentName ? { agent: plan.resolvedAgentName } : {}),
			workingDirectory: plan.workingDirectory?.fsPath,
		});
		await this._applySandboxConfig(raw, sandboxConfig, plan.sessionId);
		return new CopilotSessionWrapper(raw);
	}

	/**
	 * Compute the SDK-shaped sandbox policy to push to the runtime for the
	 * SDK's built-in shell tool.
	 *
	 * Returns `undefined` when {@link AgentHostConfigKey.EnableCustomTerminalTool}
	 * is ON — in that case the AgentHost provides its own shell tools, which
	 * wrap commands via the host terminal sandbox engine, so no SDK-side
	 * sandbox policy is needed. Otherwise the policy is derived from the
	 * host's `sandbox` config bag (forwarded from the workbench's
	 * `chat.agent.sandbox.*` settings), mirroring what
	 * `buildSandboxConfigForCLI` does for the Copilot extension's CLI path.
	 */
	private _computeSandboxConfig(): ISdkSandboxConfig | undefined {
		const enableCustomTerminalTool = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.EnableCustomTerminalTool) === true;
		if (enableCustomTerminalTool) {
			return undefined;
		}
		return buildSandboxConfigForSdk(process.platform, this._configurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox));
	}

	/**
	 * Forward the SDK-shaped sandbox policy to the runtime via
	 * `session.options.update`, immediately after the session is created or
	 * resumed. `SessionUpdateOptionsParams.sandboxConfig` is now typed by the
	 * SDK (as `SandboxConfig`), and our {@link ISdkSandboxConfig} shape is
	 * structurally assignable to it, so we forward it directly.
	 *
	 * No-op when {@link _computeSandboxConfig} returned `undefined` (custom
	 * terminal tool enabled, or the host sandbox config evaluates to disabled).
	 */
	private async _applySandboxConfig(session: CopilotSessionWrapper['session'], sandboxConfig: ISdkSandboxConfig | undefined, sessionId: string): Promise<void> {
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

	private async _buildSessionConfig(plan: CopilotSessionLaunchPlan, runtime: ICopilotSessionRuntime): Promise<CopilotSessionLaunchConfig> {
		const plugins = plan.snapshot.plugins;
		const enableCustomTerminalTool = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.EnableCustomTerminalTool) === true;
		let shellTools: Awaited<ReturnType<typeof createShellTools>> = [];
		if (enableCustomTerminalTool) {
			if (!plan.shellManager) {
				throw new Error(`ShellManager is required to launch Copilot session '${plan.sessionId}'`);
			}
			shellTools = await createShellTools(plan.shellManager, this._terminalManager, this._logService, request => runtime.requestUnsandboxedCommandConfirmation(request));
		}
		// Rely on the SDK to discover most agents/skills/etc. from `pluginDirectories`
		// instead of feeding them explicitly, to avoid duplicates. Custom agents are the
		// exception: the SDK validates the session-start `agent:` against `customAgents`
		// by name, so the selected agent is force-included (see `toSdkSessionCustomAgents`).
		const pluginsWithoutDirs = plugins.filter(p => !p.pluginDir || p.pluginDir.scheme !== Schemas.file);
		const customAgents = await toSdkSessionCustomAgents(plugins, plan.resolvedAgentName, this._fileService);
		const skillDirectories = toSdkSkillDirectories(pluginsWithoutDirs.flatMap(p => p.skills));
		const instructionDirectories = toSdkInstructionDirectories(plugins.flatMap(p => p.instructions));
		const model = plan.kind === 'create' ? plan.model : plan.fallback.model;
		// Client tools (browser tools, tasks, etc.) are addressed by the name the
		// agent sees them under; used to gate tool-specific prompt sections.
		const clientToolNames = clientToolNamesFromSnapshot(plan.snapshot);
		const promptContext: IAgentHostPromptContext = {
			getSetting: key => this._configurationService.getRootValue(agentHostCustomizationConfigSchema, key),
			hasClientTool: name => clientToolNames.has(name),
		};
		// Resolved once per (re)launch — the SDK has no mid-session system-message
		// update, so this reflects the model/tools/settings at launch time. Log a
		// summary at info for prompt observability; the full config at trace.
		const systemMessage = agentHostPromptRegistry.resolveSystemMessageConfig(model, promptContext);
		this._logService.info(`[Copilot:${plan.sessionId}] Resolved system message: ${describeSystemMessageConfig(systemMessage)}`);
		if (this._logService.getLevel() <= LogLevel.Trace) {
			// Guarded: a `replace`-mode prompt's content can be multiple KB, so only
			// serialize it when trace output is actually emitted.
			this._logService.trace(`[Copilot:${plan.sessionId}] System message config: ${JSON.stringify(systemMessage, (_key, value) => typeof value === 'function' ? '[transform fn]' : value)}`);
		}
		return {
			clientName: 'vscode',
			enableMcpApps: true,
			onPermissionRequest: request => runtime.handlePermissionRequest(request),
			onUserInputRequest: (request, invocation) => runtime.handleUserInputRequest(request, invocation),
			onElicitationRequest: context => runtime.handleElicitationRequest(context),
			hooks: toSdkHooks(pluginsWithoutDirs.flatMap(p => p.hooks), {
				onPreToolUse: input => runtime.handlePreToolUse(input),
				onPostToolUse: input => runtime.handlePostToolUse(input),
			}),
			mcpServers: { ...toSdkMcpServersFromConfigMap(plan.snapshot.mcpServers), ...toSdkMcpServers(pluginsWithoutDirs.flatMap(p => p.mcpServers)) },
			onExitPlanModeRequest: (request, invocation) => runtime.handleExitPlanModeRequest(request, invocation),
			workingDirectory: plan.workingDirectory?.fsPath,
			customAgents,
			skillDirectories,
			instructionDirectories,
			systemMessage,
			pluginDirectories: coalesce(plugins.map(p => p.pluginDir))
				.filter(d => d.scheme === Schemas.file).map(d => d.fsPath),
			tools: [...shellTools, ...runtime.createClientSdkTools(), ...runtime.createServerSdkTools()],
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
		};
	}
}
