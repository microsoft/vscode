/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { IReference } from '../../../base/common/lifecycle.js';
import { truncate } from '../../../base/common/strings.js';
import { IAuthorizationProtectedResourceMetadata } from '../../../base/common/oauth.js';
import type { IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import type { IConfigurationService } from '../../configuration/common/configuration.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IAgentServerToolHost } from './agentServerTools.js';
import type { IActiveSubscriptionInfo, IAgentSubscription } from './state/agentSubscription.js';
import type { IRemoteWatchHandle } from './agentHostFileSystemProvider.js';
import type { CompletionsParams, CompletionsResult, CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from './state/protocol/commands.js';
import type { InitializeResult } from './state/protocol/common/commands.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from './state/protocol/channels-changeset/commands.js';
import { ProtectedResourceMetadata, type Changeset, type ConfigSchema, type MessageAttachment, type ModelSelection, type AgentSelection, type SessionActiveClient, type ToolCallPendingConfirmationState, type ToolDefinition, ChangesSummary } from './state/protocol/state.js';
import type { ActionEnvelope, AuthRequiredParams, INotification, IRootConfigChangedAction, SessionAction, ChatAction, TerminalAction, ClientAnnotationsAction } from './state/sessionActions.js';
import type { ResourceCopyParams, ResourceCopyResult, ResourceDeleteParams, ResourceDeleteResult, ResourceListResult, ResourceMkdirParams, ResourceMkdirResult, ResourceMoveParams, ResourceMoveResult, ResourceReadResult, ResourceResolveParams, ResourceResolveResult, ResourceWatchState, ResourceWriteParams, ResourceWriteResult, CreateResourceWatchParams, CreateResourceWatchResult, IStateSnapshot } from './state/sessionProtocol.js';
import { ComponentToState, ChatInputResponseKind, SessionStatus, StateComponents, buildSubagentChatUri, parseRequiredSessionUriFromChatUri, type AgentCapabilities, type ClientPluginCustomization, type Customization, type PendingMessage, type RootState, type ChatInputAnswer, type SessionMeta, type ToolCallResult, type Turn, type PolicyState } from './state/sessionState.js';

// IPC contract between the renderer and the agent host utility process.
// Defines all serializable event types, the IAgent provider interface,
// and the IAgentService / IAgentHostService service decorators.

export const enum AgentHostIpcChannels {
	/** Channel for the agent host service on the main-process side */
	AgentHost = 'agentHost',
	/** Channel for log forwarding from the agent host process */
	Logger = 'agentHostLogger',
	/** Channel for WebSocket client connection count (server process management only) */
	ConnectionTracker = 'agentHostConnectionTracker',
	/**
	 * Channel registered by the remote server that proxies AHP JSON-RPC
	 * frames between a renderer and the agent host running on the server.
	 * Pairs with `AgentHostIpcChannelTransport` on the renderer side.
	 */
	RemoteProxy = 'agentHostProxy',
}

/** Configuration key that controls whether AHP JSONL logs are written for agent host transports. */
export const AgentHostAhpJsonlLoggingSettingId = 'chat.agentHost.ahpJsonlLoggingEnabled';

// The Copilot-CLI-specific setting IDs (`customTerminalTool`, `opus48Prompt`,
// `reasoningEffortOverride`, `modelCapabilityOverrides`) live with their
// root-config keys in `copilotCliConfig.ts`.

/**
 * Configuration key controlling whether the Claude provider is registered in
 * the agent host process. When `false`, the agent host skips registering the
 * Claude provider regardless of SDK availability. Defaults to `true`.
 *
 * Independent of {@link ClaudePreferAgentHostAgentsSettingId} /
 * {@link ClaudePreferAgentHostEditorSettingId}, which control whether the
 * workbench surfaces the agent host's Claude provider (vs. the GitHub Copilot
 * Chat extension's). This setting is strictly about whether the agent host
 * advertises Claude at all. The agent host process must be restarted for
 * changes to take effect.
 */
export const AgentHostClaudeAgentEnabledSettingId = 'chat.agentHost.claudeAgent.enabled';

/**
 * Configuration key controlling whether the Codex provider is registered in
 * the agent host process. When `false` (the default), the agent host skips
 * registering the Codex provider regardless of SDK availability. The agent
 * host process must be restarted for changes to take effect.
 */
export const AgentHostCodexAgentEnabledSettingId = 'chat.agentHost.codexAgent.enabled';

/**
 * Configuration key controlling whether the agent host *wires up* the BYOK
 * ("bring your own key") language-model bridge: the renderer LM handler, the
 * reverse-RPC channel, and the per-connection link to the node-side OpenAI
 * proxy + bridge registry. When `true` (the default), the renderer's BYOK
 * server channel and the per-connection bridge are wired so extension-provided
 * BYOK models are reachable from agent-host sessions. When `false`, the proxy
 * and registry are still constructed but stay inert — the BYOK server channel
 * and the per-connection bridge are not wired, so the registry stays empty and
 * extension-provided BYOK models are never reachable from agent-host sessions.
 * The agent host process must be restarted for changes to take effect.
 */
export const AgentHostByokModelsEnabledSettingId = 'chat.agentHost.byokModels.enabled';

/**
 * Optional override that points at an **SDK root directory** containing a
 * `node_modules/@anthropic-ai/claude-agent-sdk` subtree. When set, the agent
 * host loads the Claude SDK from that path instead of the bare import (which
 * resolves via this repo's `node_modules` in dev) or the on-demand download
 * from `product.agentSdks.claude` (built products). Mainly exists for the
 * remote server's `--claude-sdk-root` CLI flag and for one-off developer
 * overrides pointing at an out-of-tree SDK build.
 */
export const AgentHostClaudeSdkRootEnvVar = 'VSCODE_AGENT_HOST_CLAUDE_SDK_ROOT';

/**
 * Environment variable form of {@link AgentHostClaudeAgentEnabledSettingId}.
 * Set by the agent host starters from the setting. Accepts `'true'` /
 * `'false'`; absent means "default" (`true` for Claude, `false` for Codex).
 */
export const AgentHostClaudeAgentEnabledEnvVar = 'VSCODE_AGENT_HOST_CLAUDE_AGENT_ENABLED';

/**
 * Environment variable form of {@link AgentHostCodexAgentEnabledSettingId}.
 * Set by the agent host starters from the setting. Accepts `'true'` /
 * `'false'`; absent means "default" (`false`).
 */
export const AgentHostCodexAgentEnabledEnvVar = 'VSCODE_AGENT_HOST_CODEX_AGENT_ENABLED';

/**
 * Environment variable form of {@link AgentHostByokModelsEnabledSettingId}.
 * Set by the agent host starters from the setting. Accepts `'true'` /
 * `'false'`; absent means "default" (`true`).
 */
export const AgentHostByokModelsEnabledEnvVar = 'VSCODE_AGENT_HOST_BYOK_MODELS_ENABLED';

/**
 * Overrides the grace period (in milliseconds) before an idle, fully
 * unsubscribed session is released from memory. Defaults to 30_000. Primarily a
 * test hook so real-SDK integration tests can force a prompt release without
 * waiting the full production grace; production does not set it.
 */
export const AgentHostSessionReleaseGraceMsEnvVar = 'VSCODE_AGENT_HOST_SESSION_RELEASE_GRACE_MS';

/**
 * Resolves the effective enable state for a Claude/Codex provider from the
 * env-var value forwarded by the starter. Recognized values (case- and
 * whitespace-insensitive):
 *
 *  - `'true'`  / `'1'` → enabled
 *  - `'false'` / `'0'` → disabled
 *  - `undefined`, empty string, or any other value → falls through to
 *    {@link defaultEnabled}
 */
export function isAgentEnabled(envValue: string | undefined, defaultEnabled: boolean): boolean {
	if (envValue === undefined || envValue === '') {
		return defaultEnabled;
	}
	const normalized = envValue.trim().toLowerCase();
	if (normalized === 'false' || normalized === '0') {
		return false;
	}
	if (normalized === 'true' || normalized === '1') {
		return true;
	}
	return defaultEnabled;
}

/**
 * Configuration key that controls the sandbox mode for the Copilot SDK's built-in
 * shell tool (the path taken when `AgentHostCustomTerminalToolEnabledSettingId`
 * is `false`). Values mirror {@link AgentSandboxEnabledValue}:
 *
 *  - `'off'` (the default): no sandbox policy is forwarded for the SDK shell
 *    path \u2014 commands run unsandboxed.
 *  - `'on'`: the Agent Host runs the SDK\u2019s shell tool inside a sandbox
 *    using the user's `chat.agent.sandbox.fileSystem.*` filesystem policy.
 *    Outbound network is enforced via the user's allow/deny host lists.
 *  - `'allowNetwork'`: same as `'on'` but with unrestricted outbound network.
 *
 * Has no effect when `AgentHostCustomTerminalToolEnabledSettingId` is
 * `true` \u2014 the host\u2019s own terminal sandbox engine then handles shell
 * commands and reads `chat.agent.sandbox.enabled` directly.
 */
export const AgentHostSdkSandboxEnabledSettingId = 'chat.agentHost.sdkSandbox.enabled';

/**
 * Selects which Claude integration fulfills Claude sessions opened from the
 * **Agents Window**:
 *  - `true` — Claude is provided by the agent host process.
 *  - `false` (default) — Claude is provided by the GitHub Copilot Chat extension.
 *
 * The agent host always registers Claude when its SDK is reachable; this
 * setting only controls whether the per-window bridge in
 * `AgentHostContribution` actually surfaces the AH provider in the Agents
 * Window. The extension's `chatSessions` contribution mirrors the rule
 * declaratively (its `when` clause hides the EH provider when this is `true`),
 * so flipping the setting takes effect live without a window reload.
 *
 * Paired with {@link ClaudePreferAgentHostEditorSettingId} which governs the
 * regular workbench (sidebar). EXP-backed (`experiment: { mode: 'startup' }`).
 */
export const ClaudePreferAgentHostAgentsSettingId = 'chat.agents.claude.preferAgentHost';

/**
 * Sibling of {@link ClaudePreferAgentHostAgentsSettingId} that selects the
 * Claude implementation for the **regular workbench** (sidebar chat in a
 * non-Agents-Window window). Same shape, same semantics — just a different
 * surface scope.
 */
export const ClaudePreferAgentHostEditorSettingId = 'chat.editor.claude.preferAgentHost';

/**
 * The per-window setting that selects which Claude implementation surfaces:
 * the Agents Window reads {@link ClaudePreferAgentHostAgentsSettingId}, every
 * other window reads {@link ClaudePreferAgentHostEditorSettingId}. Callers that
 * observe the gate (to react to live flips) watch the id returned here; callers
 * that evaluate it use {@link shouldSurfaceLocalAgentHostProvider}.
 */
export function claudePreferAgentHostSettingId(isSessionsWindow: boolean): string {
	return isSessionsWindow
		? ClaudePreferAgentHostAgentsSettingId
		: ClaudePreferAgentHostEditorSettingId;
}

/**
 * Whether this window should surface the agent host's implementation of
 * `provider`, given the per-window AH/EH preference settings. Today only the
 * `claude` provider has dual implementations (the GitHub Copilot Chat
 * extension's extension-host provider vs. the agent host's in-process
 * provider) and a corresponding preference; every other provider is AH-only
 * and unconditionally surfaced.
 *
 * Mirrors the EH-side gate declared in the extension's `chatSessions`
 * contribution `when` clause:
 *   - Agents Window  → {@link ClaudePreferAgentHostAgentsSettingId}
 *   - Editor Window  → {@link ClaudePreferAgentHostEditorSettingId}
 *
 * When the relevant setting is `false`, the extension-host Claude is the one
 * that surfaces in this window, so every agent-host surface (the chat session
 * contribution and the sessions-window picker) suppresses its own Claude to
 * avoid two identical entries.
 *
 * TODO: Remove this gate (and the `claude` special-case below) once the
 * extension-host Claude implementation is retired. With only the agent host
 * providing Claude there is no dual implementation to disambiguate, so this
 * should unconditionally return `true` and callers can drop the gate entirely.
 */
export function shouldSurfaceLocalAgentHostProvider(provider: AgentProvider, configurationService: IConfigurationService, isSessionsWindow: boolean): boolean {
	if (provider !== CLAUDE_AGENT_PROVIDER_ID) {
		return true;
	}
	return configurationService.getValue<boolean>(claudePreferAgentHostSettingId(isSessionsWindow)) === true;
}

// -- Codex agent settings --------------------------------------------------------
//
// Codex is opt-in via `chat.agentHost.codexAgent.sdkRoot`. The setting points
// at an absolute path to a directory containing a `node_modules/@openai/codex`
// subtree (the same shape `npm install @openai/codex` produces, and the same
// shape the agent host downloads on demand from `product.agentSdks.codex`).
// The agent host spawns the native codex binary from inside that tree as a
// long-lived child process and speaks JSON-RPC over stdio. The binary is not
// bundled with VS Code; users either install codex themselves (typically via
// `npm install -g @openai/codex` or a platform package manager) or rely on
// the on-demand download.

/**
 * Absolute path to the **SDK root directory** containing a
 * `node_modules/@openai/codex` subtree. When non-empty, the agent host treats
 * it as a dev override and skips the on-demand download from
 * `product.agentSdks.codex`. Empty (the default) falls through to product
 * config; if neither is present, the provider is not registered.
 */
export const AgentHostCodexAgentSdkRootSettingId = 'chat.agentHost.codexAgent.sdkRoot';

/**
 * Optional override for `$CODEX_HOME`. When set, the codex app-server child
 * process inherits this value, controlling where rollouts and config live.
 */
export const AgentHostCodexAgentCodexHomeSettingId = 'chat.agentHost.codexAgent.codexHome';

/**
 * Additional command-line arguments passed to `codex app-server`. Mainly for
 * debugging (e.g. `--log-level=debug`).
 */
export const AgentHostCodexAgentBinaryArgsSettingId = 'chat.agentHost.codexAgent.binaryArgs';

/**
 * Environment variable form of {@link AgentHostCodexAgentSdkRootSettingId}.
 * Forwarded by the starters from the setting.
 */
export const AgentHostCodexAgentSdkRootEnvVar = 'VSCODE_AGENT_HOST_CODEX_SDK_ROOT';

/** Forwarded `$CODEX_HOME`. */
export const AgentHostCodexAgentCodexHomeEnvVar = 'CODEX_HOME';

/** Forwarded extra args for `codex app-server` (JSON-encoded string[]). */
export const AgentHostCodexAgentBinaryArgsEnvVar = 'VSCODE_AGENT_HOST_CODEX_APP_SERVER_ARGS';

// -- OpenTelemetry settings ------------------------------------------------------
//
// The `chat.agentHost.otel.*` namespace surfaces the same exporter knobs the CLI
// runtime documents in `extensions/copilot/docs/monitoring/agent_monitoring.md`,
// but routes them through the agent host process so the user's settings stay in
// VS Code instead of leaking via shell env.
//
// `chat.agentHost.otel.dbSpanExporter.enabled` switches on the in-process
// loopback receiver + persistent SQLite span store; the other settings still
// apply because the user's external sink (when configured) is then fed by an
// outbound forwarder rather than by the SDK directly.

/** Master toggle for agent-host OTel. Explicit opt-in; other settings imply this when set. */
export const AgentHostOTelEnabledSettingId = 'chat.agentHost.otel.enabled';
/** Exporter type for the SDK's OTel pipeline. One of: `otlp-http`, `otlp-grpc`, `console`, `file`. */
export const AgentHostOTelExporterTypeSettingId = 'chat.agentHost.otel.exporterType';
/**
 * OTLP wire protocol (`http/json`, `http/protobuf`, `grpc`). Policy-only delivery slot (no user UI):
 * carries the enterprise-managed `telemetry.protocol` so it can be threaded into the agent host's
 * `OTEL_EXPORTER_OTLP_PROTOCOL` env, which the runtime needs to distinguish protobuf from json
 * (the `exporterType` setting only models transport, not the HTTP wire encoding).
 */
export const AgentHostOTelOtlpProtocolSettingId = 'chat.agentHost.otel.otlpProtocol';
/** OTLP endpoint URL when `exporterType` is `otlp-http` or `otlp-grpc`. */
export const AgentHostOTelOtlpEndpointSettingId = 'chat.agentHost.otel.otlpEndpoint';
/** Whether to include prompt/response content in span attributes (privacy-sensitive). */
export const AgentHostOTelCaptureContentSettingId = 'chat.agentHost.otel.captureContent';
/** Output path when `exporterType` is `file`. */
export const AgentHostOTelOutfileSettingId = 'chat.agentHost.otel.outfile';
/** Policy-only delivery slot for the enterprise-managed OTel `service.name` (no user UI). */
export const AgentHostOTelServiceNameSettingId = 'chat.agentHost.otel.serviceName';
/** Policy-only delivery slot for enterprise-managed OTel resource attributes (no user UI). */
export const AgentHostOTelResourceAttributesSettingId = 'chat.agentHost.otel.resourceAttributes';
/** When true, ALL spans are persisted to a local SQLite store regardless of `exporterType`. */
export const AgentHostOTelDbSpanExporterEnabledSettingId = 'chat.agentHost.otel.dbSpanExporter.enabled';

/**
 * Path of the local SQLite span database, relative to `INativeEnvironmentService.userDataPath`.
 * Kept here so both the renderer-side export action and the agent-host-side service
 * use the same on-disk location.
 */
export const AgentHostOTelSpansDbSubPath = 'agent-host/otel/agent-host-traces.db';

/**
 * Environment variables consumed by `AgentHostOTelService` inside the agent host
 * process. The workbench-side agent-host starters translate the corresponding
 * `chat.agentHost.otel.*` settings into these variables (settings → env), while
 * any value already present on the parent process's env wins (developer override).
 *
 * These names match the conventions documented in
 * `extensions/copilot/docs/monitoring/agent_monitoring.md` so the same external
 * tooling and `OTEL_EXPORTER_OTLP_*` config recipes work unchanged.
 */
export const AgentHostOTelEnvVars = Object.freeze({
	Enabled: 'COPILOT_OTEL_ENABLED',
	ExporterType: 'COPILOT_OTEL_EXPORTER_TYPE',
	OtlpEndpoint: 'OTEL_EXPORTER_OTLP_ENDPOINT',
	OtlpEndpointAlt: 'COPILOT_OTEL_ENDPOINT',
	OtlpProtocol: 'OTEL_EXPORTER_OTLP_PROTOCOL',
	OtlpTracesProtocol: 'OTEL_EXPORTER_OTLP_TRACES_PROTOCOL',
	OtlpMetricsProtocol: 'OTEL_EXPORTER_OTLP_METRICS_PROTOCOL',
	OtlpHeaders: 'OTEL_EXPORTER_OTLP_HEADERS',
	CaptureContent: 'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT',
	FilePath: 'COPILOT_OTEL_FILE_EXPORTER_PATH',
	SourceName: 'COPILOT_OTEL_SOURCE_NAME',
	ServiceName: 'OTEL_SERVICE_NAME',
	ResourceAttributes: 'OTEL_RESOURCE_ATTRIBUTES',
	DbSpanExporterEnabled: 'COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED',
} as const);

/**
 * Snapshot of the `chat.agentHost.otel.*` settings; produced by the workbench-side
 * starters and merged with the parent process's env (env wins on key collision).
 */
export interface IAgentHostOTelSettings {
	readonly enabled?: boolean;
	readonly exporterType?: string;
	readonly otlpProtocol?: string;
	readonly otlpEndpoint?: string;
	readonly captureContent?: boolean;
	readonly outfile?: string;
	readonly serviceName?: string;
	readonly resourceAttributes?: Record<string, string>;
	readonly dbSpanExporterEnabled?: boolean;
}

/**
 * IPC channel (renderer -> main) the desktop agent-host path uses to hand the
 * enterprise-resolved `chat.agentHost.otel.*` policy to `ElectronAgentHostStarter`.
 *
 * The main-process configuration service does NOT include the renderer-only
 * `AccountPolicyService` (managed settings: server / native-MDM / file channels), so a
 * starter running in the main process sees `policyValue === undefined` for these keys.
 * The renderer — whose policy layer does include managed settings — forwards the resolved
 * values here just before requesting the agent-host connection, so the host is spawned with
 * the managed OTel env. See {@link readAgentHostOTelPolicySettings}.
 */
export const AgentHostOTelPolicyIpcChannel = 'vscode:agentHostOTelPolicy';

/**
 * Resolve the enterprise-policy values for the `chat.agentHost.otel.*` settings from a
 * configuration service whose policy layer includes managed settings (i.e. the renderer's).
 * Each field is `undefined` when no policy is set. Intended as the `policySettings` argument
 * of {@link buildAgentHostOTelEnv}.
 */
export function readAgentHostOTelPolicySettings(configurationService: IConfigurationService): IAgentHostOTelSettings {
	const policyValue = <T>(key: string): T | undefined => configurationService.inspect<T>(key).policyValue;
	return {
		enabled: policyValue<boolean>(AgentHostOTelEnabledSettingId),
		exporterType: policyValue<string>(AgentHostOTelExporterTypeSettingId),
		otlpProtocol: policyValue<string>(AgentHostOTelOtlpProtocolSettingId),
		otlpEndpoint: policyValue<string>(AgentHostOTelOtlpEndpointSettingId),
		captureContent: policyValue<boolean>(AgentHostOTelCaptureContentSettingId),
		outfile: policyValue<string>(AgentHostOTelOutfileSettingId),
		serviceName: policyValue<string>(AgentHostOTelServiceNameSettingId),
		resourceAttributes: policyValue<Record<string, string>>(AgentHostOTelResourceAttributesSettingId),
	};
}

/**
 * Validate/normalize an {@link IAgentHostOTelSettings} received over IPC, keeping only
 * well-typed fields. Defends the main process against a malformed payload before the values
 * are turned into agent-host process env vars.
 */
export function sanitizeAgentHostOTelPolicySettings(raw: unknown): IAgentHostOTelSettings {
	if (!raw || typeof raw !== 'object') {
		return {};
	}
	const record = raw as Record<string, unknown>;
	const asString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
	const asBoolean = (value: unknown): boolean | undefined => typeof value === 'boolean' ? value : undefined;
	const asStringRecord = (value: unknown): Record<string, string> | undefined => {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return undefined;
		}
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
				continue; // defend the IPC boundary against prototype pollution
			}
			if (typeof v === 'string') {
				out[k] = v;
			}
		}
		return out;
	};
	return {
		enabled: asBoolean(record.enabled),
		exporterType: asString(record.exporterType),
		otlpProtocol: asString(record.otlpProtocol),
		otlpEndpoint: asString(record.otlpEndpoint),
		captureContent: asBoolean(record.captureContent),
		outfile: asString(record.outfile),
		serviceName: asString(record.serviceName),
		resourceAttributes: asStringRecord(record.resourceAttributes),
	};
}

/**
 * Serialize an OTel resource-attribute map into the `OTEL_RESOURCE_ATTRIBUTES` env-var format
 * (`key1=value1,key2=value2`, W3C Baggage style). Returns `undefined` for an empty/absent map so
 * callers can skip emitting the env var. Empty keys and non-string values are dropped.
 */
function serializeResourceAttributes(attributes: Record<string, string> | undefined): string | undefined {
	if (!attributes) {
		return undefined;
	}
	const parts = Object.entries(attributes)
		.filter(([key, value]) => key !== '' && typeof value === 'string')
		.map(([key, value]) => `${key}=${value}`);
	return parts.length > 0 ? parts.join(',') : undefined;
}

/**
 * Build the env-var overlay for the agent host process from user settings and
 * inherited env. Settings are translated to env vars, but if the same env var is
 * already present on `inheritedEnv` it wins (developer override).
 *
 * Only sets a key when the underlying setting was explicitly configured — empty
 * string / undefined settings are dropped so they don't shadow inherited env.
 */
export function buildAgentHostOTelEnv(
	settings: IAgentHostOTelSettings,
	inheritedEnv: Readonly<Record<string, string | undefined>>,
	policySettings: IAgentHostOTelSettings = {},
): Record<string, string> {
	const out: Record<string, string> = {};
	const setIfMissing = (key: string, value: string | undefined): void => {
		if (value === undefined || value === '' || inheritedEnv[key] !== undefined) {
			return;
		}
		out[key] = value;
	};
	// Enterprise policy wins over inherited env (managed settings cannot be overridden by a
	// user-set env var), unlike user settings which yield to env via `setIfMissing`.
	const setPolicy = (key: string, value: string | undefined): void => {
		if (value !== undefined) {
			out[key] = value;
		}
	};
	if (settings.enabled) {
		setIfMissing(AgentHostOTelEnvVars.Enabled, 'true');
	}
	setIfMissing(AgentHostOTelEnvVars.ExporterType, settings.exporterType);
	setIfMissing(AgentHostOTelEnvVars.OtlpEndpoint, settings.otlpEndpoint);
	setIfMissing(AgentHostOTelEnvVars.ServiceName, settings.serviceName);
	setIfMissing(AgentHostOTelEnvVars.ResourceAttributes, serializeResourceAttributes(settings.resourceAttributes));
	setIfMissing(AgentHostOTelEnvVars.FilePath, settings.outfile);
	if (settings.captureContent !== undefined) {
		setIfMissing(AgentHostOTelEnvVars.CaptureContent, settings.captureContent ? 'true' : 'false');
	}
	if (settings.dbSpanExporterEnabled) {
		setIfMissing(AgentHostOTelEnvVars.DbSpanExporterEnabled, 'true');
	}

	if (policySettings.enabled !== undefined) {
		setPolicy(AgentHostOTelEnvVars.Enabled, policySettings.enabled ? 'true' : 'false');
		if (!policySettings.enabled) {
			setPolicy(AgentHostOTelEnvVars.OtlpEndpoint, '');
			setPolicy(AgentHostOTelEnvVars.OtlpEndpointAlt, '');
			setPolicy(AgentHostOTelEnvVars.FilePath, '');
		}
	}
	if (policySettings.exporterType !== undefined) {
		setPolicy(AgentHostOTelEnvVars.ExporterType, policySettings.exporterType);
		setPolicy(AgentHostOTelEnvVars.FilePath, '');
	}
	if (policySettings.otlpProtocol !== undefined && policySettings.otlpProtocol !== '') {
		// Mirror the CLI: thread the managed protocol into the generic AND per-signal protocol
		// env vars so it wins over any user-provided OTEL_EXPORTER_OTLP_{,TRACES_,METRICS_}PROTOCOL.
		setPolicy(AgentHostOTelEnvVars.OtlpProtocol, policySettings.otlpProtocol);
		setPolicy(AgentHostOTelEnvVars.OtlpTracesProtocol, policySettings.otlpProtocol);
		setPolicy(AgentHostOTelEnvVars.OtlpMetricsProtocol, policySettings.otlpProtocol);
	}
	if (policySettings.otlpEndpoint !== undefined) {
		setPolicy(AgentHostOTelEnvVars.OtlpEndpoint, policySettings.otlpEndpoint);
		setPolicy(AgentHostOTelEnvVars.FilePath, '');
	}
	if (policySettings.outfile !== undefined) {
		setPolicy(AgentHostOTelEnvVars.FilePath, policySettings.outfile);
	}
	if (policySettings.captureContent !== undefined) {
		setPolicy(AgentHostOTelEnvVars.CaptureContent, policySettings.captureContent ? 'true' : 'false');
	}
	if (policySettings.serviceName !== undefined && policySettings.serviceName !== '') {
		setPolicy(AgentHostOTelEnvVars.ServiceName, policySettings.serviceName);
	}
	const policyResourceAttributes = serializeResourceAttributes(policySettings.resourceAttributes);
	if (policyResourceAttributes !== undefined) {
		setPolicy(AgentHostOTelEnvVars.ResourceAttributes, policyResourceAttributes);
	}
	return out;
}

/**
 * Settings -> env-var fan-out for the Claude/Codex SDK overrides that the
 * agent host process consumes. Shared by both starters
 * (`nodeAgentHostStarter.ts`, `electronAgentHostStarter.ts`) so they don't
 * drift the next time someone adds a setting.
 *
 * The shape mirrors {@link buildAgentHostOTelEnv}: only set a key when the
 * underlying setting has a non-empty value AND the inherited env doesn't
 * already define it (developer override wins). Returns a partial env map
 * the caller spreads into the spawned child's environment.
 */
export interface IAgentSdkStarterSettings {
	readonly codexSdkRoot?: string;
	readonly codexHome?: string;
	readonly codexBinaryArgs?: readonly string[];
	readonly claudeAgentEnabled?: boolean;
	readonly codexAgentEnabled?: boolean;
	readonly byokModelsEnabled?: boolean;
}

export function buildAgentSdkEnv(
	settings: IAgentSdkStarterSettings,
	inheritedEnv: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
	const out: Record<string, string> = {};
	const setIfMissing = (key: string, value: string | undefined): void => {
		if (value === undefined || value === '' || inheritedEnv[key] !== undefined) {
			return;
		}
		out[key] = value;
	};
	setIfMissing(AgentHostCodexAgentSdkRootEnvVar, settings.codexSdkRoot);
	setIfMissing(AgentHostCodexAgentCodexHomeEnvVar, settings.codexHome);
	if (Array.isArray(settings.codexBinaryArgs) && settings.codexBinaryArgs.length > 0) {
		setIfMissing(AgentHostCodexAgentBinaryArgsEnvVar, JSON.stringify(settings.codexBinaryArgs));
	}
	if (settings.claudeAgentEnabled !== undefined) {
		setIfMissing(AgentHostClaudeAgentEnabledEnvVar, settings.claudeAgentEnabled ? 'true' : 'false');
	}
	if (settings.codexAgentEnabled !== undefined) {
		setIfMissing(AgentHostCodexAgentEnabledEnvVar, settings.codexAgentEnabled ? 'true' : 'false');
	}
	if (settings.byokModelsEnabled !== undefined) {
		setIfMissing(AgentHostByokModelsEnabledEnvVar, settings.byokModelsEnabled ? 'true' : 'false');
	}
	return out;
}

/** Result of starting the agent host WebSocket server on-demand. */
export interface IAgentHostSocketInfo {
	readonly socketPath: string;
}

/** Inspector listener information for the agent host process. */
export interface IAgentHostInspectInfo {
	readonly host: string;
	readonly port: number;
	/** A `devtools://` URL that can be opened with `INativeHostService.openDevToolsWindow`. */
	readonly devtoolsUrl: string;
}

/**
 * IPC service exposed on the {@link AgentHostIpcChannels.ConnectionTracker}
 * channel. Used by the server process for lifetime management and by the
 * shared process to request a local WebSocket listener on-demand.
 */
export interface IConnectionTrackerService {
	readonly onDidChangeConnectionCount: Event<number>;

	/**
	 * Request the agent host to start a WebSocket server on a local
	 * pipe/socket. Returns the socket path.
	 * If a server is already running, returns the existing info.
	 */
	startWebSocketServer(): Promise<IAgentHostSocketInfo>;

	/**
	 * Get inspector listener info for the agent host process. If the inspector
	 * is not currently active and `tryEnable` is true, opens the inspector on
	 * a random local port. Returns `undefined` if the inspector cannot be
	 * enabled (e.g. running in an environment without `node:inspector`).
	 */
	getInspectInfo(tryEnable: boolean): Promise<IAgentHostInspectInfo | undefined>;
}

// ---- IPC data types (serializable across MessagePort) -----------------------

export interface IAgentSessionMetadata {
	readonly session: URI;
	readonly startTime: number;
	readonly modifiedTime: number;
	readonly project?: IAgentSessionProjectInfo;
	readonly summary?: string;
	readonly status?: SessionStatus;
	/** Human-readable description of what the session is currently doing. */
	readonly activity?: string;
	readonly workingDirectory?: URI;
	readonly customizationDirectory?: URI;
	readonly isRead?: boolean;
	readonly isArchived?: boolean;
	/**
	 * Aggregate counts (additions / deletions / files) describing the
	 * `changeKind: 'session'` changeset for this session — the chip
	 * aggregate previously embedded in the catalogue entry. Mirrors
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

export interface IAgentSessionProjectInfo {
	readonly uri: URI;
	readonly displayName: string;
}

export interface IAgentCreateSessionResult {
	readonly session: URI;
	readonly project?: IAgentSessionProjectInfo;
	/** The resolved working directory, which may differ from the requested one (e.g. worktree). */
	readonly workingDirectory?: URI;
	/**
	 * `true` when the agent only allocated an in-memory placeholder for this
	 * session (no SDK session, no worktree, no on-disk state). Materialization
	 * happens lazily on the first {@link IAgentChats.sendMessage}, at which point
	 * the agent fires {@link IAgent.onDidMaterializeSession}. The
	 * {@link IAgentService} uses this flag to defer the `sessionAdded` protocol
	 * notification so observers don't see the session in their list until it
	 * has been persisted.
	 */
	readonly provisional?: boolean;
}

/**
 * Payload of {@link IAgent.onDidMaterializeSession}. Fired once per session
 * when a previously {@link IAgentCreateSessionResult.provisional} session has
 * its SDK session, worktree (if any), and on-disk metadata in place.
 */
export interface IAgentMaterializeSessionEvent {
	readonly session: URI;
	readonly workingDirectory: URI | undefined;
	readonly project: IAgentSessionProjectInfo | undefined;
}

export type AgentProvider = string;

/** Well-known agent provider id for the Claude agent-host backend. */
export const CLAUDE_AGENT_PROVIDER_ID = 'claude' as const;

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

export interface IAgentCreateSessionConfig {
	readonly provider?: AgentProvider;
	readonly model?: ModelSelection;
	/**
	 * Initial custom agent selection for the new session. Omit to start with
	 * no custom agent selected (provider default behavior).
	 */
	readonly agent?: AgentSelection;
	readonly session?: URI;
	readonly workingDirectory?: URI;
	readonly config?: Record<string, unknown>;
	/**
	 * Eagerly claim the active client role for the new session. When provided,
	 * the server initializes the session with this client as the active
	 * client, equivalent to dispatching a `session/activeClientSet`
	 * action immediately after creation. The `clientId` MUST match the
	 * connection's own `clientId`.
	 */
	readonly activeClient?: SessionActiveClient;
	/** Fork from an existing session at a specific turn. */
	readonly fork?: {
		readonly session: URI;
		readonly turnIndex: number;
		readonly turnId: string;
		/**
		 * Maps old protocol turn IDs to new protocol turn IDs.
		 * Populated by the service layer after generating fresh UUIDs
		 * for the forked session's turns. Used by the agent to remap
		 * per-turn data (e.g. SDK event ID mappings) in the session database.
		 */
		readonly turnIdMapping?: ReadonlyMap<string, string>;
	};
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

/** Options for creating an additional chat within a session. */
export interface IAgentCreateChatOptions {
	/** Optional display title for the new chat. */
	readonly title?: string;
	/** Optional model override; defaults to the session's model. */
	readonly model?: ModelSelection;
	/**
	 * Fork an existing chat into this new chat. The new chat starts
	 * pre-populated with the source chat's turns up to and including
	 * {@link IAgentCreateChatForkSource.turnId}, and its backing chat
	 * is forked from the source so it can continue independently.
	 */
	readonly fork?: IAgentCreateChatForkSource;
}

/** Identifies a source chat and turn to fork a new chat from. */
export interface IAgentCreateChatForkSource {
	/** URI of the existing chat to fork from. */
	readonly source: URI;
	/** Turn ID in the source chat; content up to and including this turn is copied. */
	readonly turnId: string;
	/**
	 * Maps old source turn IDs to fresh turn IDs for the forked chat. Populated
	 * by the agent service so the agent can remap per-turn data (e.g. SDK event
	 * ID mappings) in the forked chat's database.
	 */
	readonly turnIdMapping?: ReadonlyMap<string, string>;
}

/** Result of {@link IAgentChats.createChat}: the opaque blob to persist for restore. */
export interface IAgentCreateChatResult {
	/**
	 * Opaque, agent-owned token the orchestrator persists verbatim in the chat
	 * catalog and hands back to {@link IAgent.materializeChat} on
	 * restore. The orchestrator never parses it. `undefined` means nothing to
	 * persist (e.g. the agent keeps no resumable backing).
	 */
	readonly providerData?: string;
	/**
	 * The SDK-level session URI that backs this peer chat, when the agent mints
	 * one in the same session store its own {@link IAgent.listSessions} enumerates
	 * (e.g. Claude). First-class and non-opaque — unlike {@link providerData} the
	 * orchestrator reads it to correlate and suppress the backing session so it
	 * never surfaces as a top-level session. `undefined` when the agent keeps no
	 * separately-enumerable backing session.
	 */
	readonly backingSession?: URI;
}

/** Payload of {@link IAgent.onDidChangeChatData}. */
export interface IAgentChatDataChange {
	/** The peer chat whose backing chat's blob changed. */
	readonly chat: URI;
	/** The new opaque blob to persist (replaces any previously stored value). */
	readonly providerData: string;
}

/** A legacy peer chat enumerated by {@link IAgent.listLegacyChats} for one-time migration. */
export interface IAgentLegacyChat {
	/** The peer chat's channel URI (see {@link buildChatUri}). */
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
	/** The parent chat (chat) URI whose tool call performed the spawn. */
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
	/** The spawned chat's channel URI (the new chat). */
	readonly chat: URI;
	/**
	 * The parent that spawned it, when the spawn was delegated by a tool call.
	 * Recorded as the chat's tool origin in the catalog. Absent for a
	 * top-level, agent-initiated chat with no spawning tool call.
	 */
	readonly parent?: IAgentSpawnedChatParent;
	/** Optional display title for the spawned chat. */
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
 * Maps agent `subagent_*` signals to the unified chat catalog's
 * spawn/end events. Shared by the agents' spawn bridges and the orchestrator so
 * subagent membership has one derivation.
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
			// Prefer the concise per-task description so two subagents of the same
			// type still get distinct, meaningful tab names; fall back to the agent
			// type's display name. Truncate so an over-long description never blows
			// out the tab strip or the Subagents dropdown.
			title: subagentChatTitle(signal.taskDescription, signal.agentDisplayName),
		};
	}
}

// ---- Chat surface --------------------------------------------------

/**
 * The chat-addressed operation surface an agent exposes for the chats
 * within a session.
 *
 * Every operation method addresses a chat by a concrete chat channel URI:
 * the default chat channel for a session's DEFAULT chat, or an additional
 * chat's own channel URI. The orchestrator ({@link IAgentService}) owns the
 * feature-level `(session, chat)` to chat-channel mapping and only ever calls
 * these operations with a concrete chat URI. This replaces the legacy
 * `(session, chat?)` parameter pairs and the per-agent default-chat handling on
 * {@link IAgent}.
 *
 * Optional on {@link IAgent}: agents implement this incrementally (waves
 * C2/C3/C4). Until an agent exposes it, {@link IAgentService} falls back to the
 * agent's legacy `(session, chat?)` methods via a thin adapter.
 */
export interface IAgentChats {
	/**
	 * Create a fresh additional chat within the session the `chat` URI belongs
	 * to, sharing the session's working directory, model, agent, and
	 * customizations. `chat` is the client-chosen channel URI the new chat is
	 * addressed by; its parent session is derived from it.
	 * Returns the opaque {@link IAgentCreateChatResult} blob to persist for
	 * restore (or `void` when the agent keeps no resumable backing).
	 */
	createChat(chat: URI, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void>;

	/**
	 * Fork a new chat from an existing one. The new `chat`
	 * inherits `source`'s backing up to and including
	 * {@link IAgentCreateChatForkSource.turnId} and then continues
	 * independently. The new chat's parent session is derived from its URI.
	 */
	fork(chat: URI, source: IAgentCreateChatForkSource, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void>;

	/**
	 * Dispose an additional chat created via
	 * {@link createChat}/{@link fork}, freeing its backing. A session's
	 * default chat cannot be disposed in isolation; it lives and dies
	 * with the session.
	 */
	disposeChat(chat: URI): Promise<void>;

	/** Send a user message into `chat`. */
	sendMessage(chat: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, senderClientId?: string): Promise<void>;

	/** Abort the in-flight turn for `chat`. */
	abort(chat: URI): Promise<void>;

	/** Change the model for `chat`. */
	changeModel(chat: URI, model: ModelSelection): Promise<void>;

	/**
	 * Change (or clear) the selected custom agent for `chat`. Passing
	 * `undefined` clears the selection (provider default behavior).
	 */
	changeAgent(chat: URI, agent: AgentSelection | undefined): Promise<void>;

	/** Reconstruct the turns for `chat` (used on restore). */
	getMessages(chat: URI): Promise<readonly Turn[]>;
}

export interface IAgentResolveSessionConfigParams {
	readonly provider?: AgentProvider;
	readonly workingDirectory?: URI;
	readonly config?: Record<string, unknown>;
}

export interface IAgentSessionConfigCompletionsParams extends IAgentResolveSessionConfigParams {
	readonly property: string;
	readonly query?: string;
}

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

// ---- Agent signals (sent via IAgent.onDidSessionProgress) -------------------

/**
 * A signal emitted by an agent during session execution.
 *
 * Most signals carry a protocol {@link SessionAction} directly via the
 * `kind: 'action'` shape, eliminating a parallel event ontology. A small
 * number of cases that have no clean protocol action (permission
 * auto-approval, subagent session creation, steering message
 * acknowledgment) remain as discriminated non-action signals so the host
 * can perform side effects before — or instead of — dispatching an action.
 */
export type AgentSignal =
	| IAgentActionSignal
	| IAgentToolPendingConfirmationSignal
	| IAgentSubagentStartedSignal
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
	readonly permissionKind?: 'shell' | 'write' | 'mcp' | 'read' | 'url' | 'custom-tool' | 'hook' | 'memory' | 'extension-management' | 'extension-permission-access';
	/** Host-only auto-approval path target (not part of the dispatched action). */
	readonly permissionPath?: string;
	/**
	 * Host-only flag (not part of the dispatched action): the model requested
	 * this shell command run OUTSIDE the sandbox (and the host opted in via
	 * `sandbox.allowBypass`).
	 */
	readonly requestSandboxBypass?: boolean;
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
 * A subagent has finished — either successfully or with an error. The host
 * uses this to tear down the child session after all of its events have been
 * routed. The parent tool call completing is not a reliable signal for this
 * because background subagents (e.g. Copilot's `mode: background` task) keep
 * emitting events after their parent tool call returns immediately.
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
 * A subagent child session discovered in a parent session's event log,
 * returned by {@link IAgent.getSubagentSessions} so a parent restore can
 * register the child's state up-front.
 */
export interface IRestoredSubagentSession {
	/** Child subagent session URI (subscribable by clients). */
	readonly resource: URI;
	/** Parent tool call id that spawned the subagent. */
	readonly toolCallId: string;
	/** Display title for the subagent session. */
	readonly title: string;
	/** Reconstructed turns for the subagent's transcript. */
	readonly turns: readonly Turn[];
}

/**
 * A per-session handle for one active client's contributions (tools and
 * plugin customizations) to an agent session, obtained via
 * {@link IAgent.getOrCreateActiveClient}.
 *
 * `tools` and `customizations` are mutable accessor properties: assigning a
 * new array replaces this client's contribution wholesale and triggers the
 * agent's internal reaction (refreshing the merged tool set exposed to the
 * model, or kicking off an asynchronous customization sync). The arrays are
 * `readonly` so callers cannot mutate them in place and silently bypass the
 * setter. The agent merges the contributions of all active clients on a
 * session, deduplicating as needed.
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

/**
 * Implemented by each agent backend (e.g. Copilot SDK).
 * The {@link IAgentService} dispatches to the appropriate agent based on
 * the agent id.
 */
export interface IAgent {
	/** Unique identifier for this provider (e.g. `'copilot'`). */
	readonly id: AgentProvider;

	/** Fires when the provider streams progress for a session. */
	readonly onDidSessionProgress: Event<AgentSignal>;

	/**
	 * Fires once when a previously
	 * {@link IAgentCreateSessionResult.provisional} session has been
	 * materialized — i.e. its SDK session, worktree (if any), and on-disk
	 * metadata are all in place. The {@link IAgentService} uses this event
	 * to fire the deferred `sessionAdded` notification with the now-final
	 * summary.
	 */
	readonly onDidMaterializeSession?: Event<IAgentMaterializeSessionEvent>;

	/**
	 * Provides the agent host's server-tool host so the provider can advertise
	 * and execute the agent host's server tools (feedback "comments" today, more
	 * in the future) against a session's state. Optional: providers that do not
	 * support server-side tools simply omit it. Called once during registration
	 * with the {@link IAgentService}.
	 */
	setServerToolHost?(host: IAgentServerToolHost): void;

	// ---- Chat surface ------------------------------------------------------
	//
	// `chats` is the chat-addressed operation surface. Its chats are addressed
	// by concrete chat channel URIs. The orchestrator ({@link IAgentService})
	// owns the feature-level `(session, chat)` to chat-channel mapping.

	/**
	 * Chat-addressed surface for the chats within a session (send/abort/
	 * change model/agent, create/fork/dispose chats, read history).
	 */
	readonly chats: IAgentChats;

	// ---- Session lifecycle / configuration ---------------------------------

	/** Create a new session. Returns server-owned session metadata. */
	createSession(config?: IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult>;

	/** Resolve the dynamic configuration schema for creating a session. */
	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult>;

	/** Return dynamic completions for a session configuration property. */
	sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult>;

	/**
	 * Re-attach an agent's in-memory backing for a peer chat on session
	 * restore, decoding the opaque `providerData` produced earlier by
	 * {@link IAgentChats.createChat} (or the latest
	 * {@link onDidChangeChatData}). After this resolves the agent MUST
	 * be able to serve {@link getSessionMessages}/
	 * {@link IAgentChats.sendMessage} for `chat`.
	 * Best-effort: implementations SHOULD NOT throw on a corrupt/unknown blob —
	 * log and no-op so the orchestrator restores the chat with history but no
	 * live backing. `providerData` is `undefined` only for legacy entries with
	 * no stored blob, in which case the agent MAY consult its own legacy
	 * persistence once to recover the backing.
	 */
	materializeChat?(chat: URI, providerData: string | undefined): Promise<void>;

	/**
	 * Migration-only enumeration of a session's peer chats persisted in the
	 * agent's OWN legacy format (predating the orchestrator-owned catalog). The
	 * orchestrator calls this once, when its own catalog is absent, to drain the
	 * legacy chats into {@link PEER_CHATS_METADATA_KEY}; subsequent restores read
	 * the orchestrator catalog and never consult this again. Each entry's
	 * `providerData` uses the same encoding {@link IAgentChats.createChat}
	 * produces and {@link materializeChat} decodes. Agents with no legacy
	 * format (e.g. Codex) omit this method.
	 */
	listLegacyChats?(session: URI): Promise<readonly IAgentLegacyChat[]>;

	/**
	 * Fires when a peer chat's opaque `providerData` changes after creation
	 * (e.g. per-chat model switch, fork remap). The orchestrator re-persists the
	 * blob. Agents whose blob is immutable never fire this.
	 */
	readonly onDidChangeChatData?: Event<IAgentChatDataChange>;

	// ---- Spawned chat (membership) channel -------------------------
	//
	// First-class membership channel for chats the agent spawns itself
	// (e.g. sub-agent / "team" member chats delegated by a tool call),
	// as opposed to user-driven chats created via
	// {@link IAgentChats.createChat}. The orchestrator
	// ({@link IAgentService}) routes these straight into the chat catalog
	// (addChat/removeChat) so harness-spawned and user-driven chats share ONE
	// membership path. Agents that never spawn chats omit both events.

	/**
	 * Fires when the agent spawns a new chat within a session (e.g. a
	 * sub-agent delegated by a tool call). The orchestrator records it in the
	 * chat catalog, preserving the {@link IAgentSpawnChatEvent.parent}
	 * spawn edge as the chat's {@link ChatOriginKind.Tool} origin.
	 */
	readonly onDidSpawnChat?: Event<IAgentSpawnChatEvent>;

	/**
	 * Called when the session's pending (steering) message changes.
	 * The agent harness decides how to react — e.g. inject steering
	 * mid-turn via `mode: 'immediate'`. When `chat` is provided (an additional
	 * peer chat's URI), the steering targets that chat's chat rather
	 * than the session's default chat.
	 *
	 * Queued messages are consumed on the server side and are not
	 * forwarded to the agent; `queuedMessages` will always be empty.
	 */
	setPendingMessages?(session: URI, steeringMessage: PendingMessage | undefined, queuedMessages: readonly PendingMessage[], chat?: URI): void;

	/**
	 * Retrieve the reconstructed turns for a session, used when restoring
	 * sessions from persistent storage. Each agent owns the conversion from
	 * its SDK-specific event log to protocol {@link Turn}s, including
	 * subagent sessions (callers pass the subagent URI to retrieve the
	 * child session's turns).
	 */
	getSessionMessages(session: URI): Promise<readonly Turn[]>;

	/**
	 * Returns the subagent child sessions discoverable in a session's event
	 * log so a parent restore can eagerly register them in a single pass.
	 * Without this, every child is restored separately by re-fetching and
	 * re-reconstructing the full parent event log (one pass per subagent).
	 * Agents that serve this from the same reconstruction they already
	 * produced for the parent turns avoid that redundant work entirely.
	 * Optional; agents without subagents omit it.
	 */
	getSubagentSessions?(session: URI): Promise<readonly IRestoredSubagentSession[]>;

	/** Dispose a session, freeing resources. */
	disposeSession(session: URI): Promise<void>;

	/**
	 * Release a session's in-memory resources (SDK session/connection, cached
	 * per-session state) without deleting any durable data. Unlike
	 * {@link disposeSession}, this is non-destructive: the on-disk session log,
	 * session database, and worktree are all preserved so the session can be
	 * transparently resumed later. Used by idle-session eviction to bound
	 * memory in long-lived host processes. Optional; providers that hold no
	 * releasable in-memory state simply omit it.
	 */
	releaseSession?(session: URI): Promise<void>;

	/** Respond to a pending permission request from the SDK. */
	respondToPermissionRequest(requestId: string, approved: boolean): void;

	/** Respond to a pending user input request from the SDK's ask_user tool. */
	respondToUserInputRequest(requestId: string, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>): void;

	/** Return the descriptor for this agent. */
	getDescriptor(): IAgentDescriptor;

	/** Available models from this provider. */
	readonly models: IObservable<readonly IAgentModelInfo[]>;

	/** List persisted sessions from this provider. */
	listSessions(): Promise<IAgentSessionMetadata[]>;

	/** Retrieve metadata for a single persisted session, without enumerating the provider catalog. */
	getSessionMetadata?(session: URI): Promise<IAgentSessionMetadata | undefined>;

	/** Declare protected resources this agent requires auth for (RFC 9728). */
	getProtectedResources(): ProtectedResourceMetadata[];

	/**
	 * Fires when the agent's host-owned customizations change
	 * (loading state, resolution results, etc.), so infrastructure
	 * can republish {@link AgentInfo} and session customization state.
	 */
	readonly onDidCustomizationsChange?: Event<void>;

	/**
	 * Fires when this agent needs the client to (re-)authenticate a
	 * protected resource — for example after a runtime transport-mode flip
	 * makes a previously-unneeded credential required. The host stamps the
	 * root channel and forwards it verbatim as an `auth/required`
	 * notification; clients respond via {@link authenticate}.
	 */
	readonly onDidRequireAuth?: Event<Omit<AuthRequiredParams, 'channel'>>;

	/**
	 * Returns the host-owned customizations this agent currently exposes.
	 *
	 * Used to publish baseline customization metadata on {@link AgentInfo}.
	 * Always container customizations ({@link PluginCustomization} or
	 * {@link DirectoryCustomization}).
	 */
	getCustomizations?(): readonly Customization[];

	/**
	 * Returns the effective customization list for a session, including
	 * source, enablement, and loading/error status.
	 */
	getSessionCustomizations?(session: URI): Promise<readonly Customization[]>;

	/**
	 * Authenticate for a specific resource. Returns true if accepted.
	 * The `resource` matches {@link IAuthorizationProtectedResourceMetadata.resource}.
	 */
	authenticate(resource: string, token: string): Promise<boolean>;

	/**
	 * Optional hook for provider-owned session resources that are not advertised
	 * as root agent protected resources, such as MCP server OAuth challenges.
	 */
	handleAuthenticationToken?(params: AuthenticateParams): Promise<boolean>;

	/**
	 * Truncate a chat's history. If `turnId` is provided, keeps turns up to
	 * and including that turn. If omitted, all turns are removed.
	 *
	 * `chat` identifies which chat to truncate: the session's default chat
	 * (addressed by the session's default chat URI) or a peer (non-default)
	 * chat, which has its own backing.
	 *
	 * Optional — not all providers support truncation.
	 */
	truncateSession?(session: URI, turnId: string | undefined, chat: URI): Promise<void>;

	/**
	 * Notifies the provider that a session's archived state has changed.
	 * Providers may use this to clean up or restore per-session resources
	 * (for example, removing a session-owned worktree on archive and
	 * recreating it on unarchive). Optional.
	 */
	onArchivedChanged?(session: URI, isArchived: boolean): Promise<void>;

	/**
	 * Get (or lazily create) the per-session handle for an active client,
	 * identified by `clientId`. Mutating the returned {@link IActiveClient}'s
	 * `tools` / `customizations` updates only that client's contribution; the
	 * agent merges the contributions of all active clients when exposing them
	 * to the model. A session MAY have several active clients at once.
	 *
	 * @param session The session URI this client contributes to.
	 * @param client The client's `clientId` and optional human-readable name.
	 */
	getOrCreateActiveClient(session: URI, client: { readonly clientId: string; readonly displayName?: string }): IActiveClient;

	/**
	 * Remove an active client from a session, clearing its tool and
	 * customization contributions. No-op when no active client matches
	 * `clientId`.
	 *
	 * @param session The session the client is leaving.
	 * @param clientId The client to remove.
	 */
	removeActiveClient(session: URI, clientId: string): void;

	/**
	 * Called when a client completes a client-provided tool call.
	 * Resolves the tool handler's deferred promise so the SDK can continue.
	 *
	 * @param session The session the tool call belongs to.
	 * @param chat The chat channel the tool call was issued on, when known.
	 * Agents that track peer chats separately from the default chat (e.g.
	 * copilot) use this to route the completion to the right chat;
	 * agents without peer chats ignore it and resolve by `session`.
	 * @param toolCallId The id of the tool call being completed.
	 * @param result The result of the tool call.
	 */
	onClientToolCallComplete(session: URI, chat: URI, toolCallId: string, result: ToolCallResult): void;

	/**
	 * Notifies the agent that a customization has been toggled on or off.
	 * The agent MAY restart its client before the next message is sent.
	 *
	 * @param id The opaque session-unique customization id.
	 */
	setCustomizationEnabled(id: string, enabled: boolean): void;

	/** Request a session MCP server start/restart by customization id. */
	startMcpServer?(session: URI, id: string): Promise<void>;

	/** Request a session MCP server stop by customization id. */
	stopMcpServer?(session: URI, id: string): Promise<void>;

	/** Gracefully shut down all sessions. */
	shutdown(): Promise<void>;

	/**
	 * Routes a request received on an `mcp://` side channel to the agent's
	 * MCP server implementation. The channel carries raw MCP JSON-RPC
	 * methods (e.g. `tools/list`, `tools/call`, `resources/read`) tagged
	 * with the routing envelope; the protocol server decodes the envelope
	 * and forwards `(session, serverName, method, params)` here.
	 *
	 * The agent MUST reject unknown methods with an error whose message
	 * begins with `Method not found` so the protocol server can map it to
	 * a JSON-RPC `-32601`.
	 *
	 * Optional — agents that don't surface any MCP servers (or don't
	 * advertise `mcpApp` capabilities) can omit this.
	 */
	handleMcpRequest?(session: URI, serverName: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown>;

	/**
	 * Fires when an MCP server owned by this agent emits a notification
	 * that should be forwarded to AHP clients over the `mcp://` side
	 * channel. Today this is exclusively
	 * `notifications/tools/list_changed` and
	 * `notifications/resources/list_changed`. The protocol server
	 * fans the notification out to every connected client.
	 *
	 * Optional — agents that don't expose MCP servers can omit this.
	 */
	readonly onMcpNotification?: Event<IMcpNotification>;

	/** Dispose this provider and all its resources. */
	dispose(): void;
}

// ---- Service interfaces -----------------------------------------------------

export const IAgentService = createDecorator<IAgentService>('agentService');

/**
 * Service contract for communicating with the agent host process. Methods here
 * are proxied across MessagePort via `ProxyChannel`.
 *
 * State is synchronized via the subscribe/unsubscribe/dispatchAction protocol.
 * Clients observe root state (agents, models) and session state via subscriptions,
 * and mutate state by dispatching actions (e.g. session/turnStarted, session/turnCancelled).
 */
export interface IAgentService {
	readonly _serviceBrand: undefined;

	/**
	 * Authenticate for a protected resource on the server.
	 * The {@link AuthenticateParams.resource} must match a resource from
	 * the agent's protectedResources in root state. Analogous to RFC 6750
	 * bearer token delivery.
	 */
	authenticate(params: AuthenticateParams): Promise<AuthenticateResult>;

	/** Return a bearer token previously supplied via {@link authenticate}. */
	getAuthToken(request: IAgentHostAuthTokenRequest): string | undefined;

	/** List all available sessions from the Copilot CLI. */
	listSessions(): Promise<IAgentSessionMetadata[]>;

	/** Create a new session. Returns the session URI. */
	createSession(config?: IAgentCreateSessionConfig): Promise<URI>;

	/**
	 * Create an additional chat within an existing session. Spins up the
	 * backing chat in the harness (sharing the session's session) and
	 * registers the chat in the session's catalog so subscribers observe a
	 * `session/chatAdded` action. The `chat` URI is the client-chosen channel.
	 */
	createChat(session: URI, chat: URI, options?: IAgentCreateChatOptions): Promise<void>;

	/** Dispose an additional chat created via {@link createChat}. */
	disposeChat(session: URI, chat: URI): Promise<void>;

	/** Resolve the dynamic configuration schema for creating a session. */
	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult>;

	/** Return dynamic completions for a session configuration property. */
	sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult>;

	/**
	 * Return completion items for a partially-typed input (e.g. an `@`-mention
	 * inside a user message the user is composing). Delegates to a pluggable
	 * set of {@link IAgentHostCompletionItemProvider}s registered with the
	 * agent host.
	 *
	 * Note: this method does not accept a {@link CancellationToken} because
	 * `CancellationToken`s do not round-trip through the IPC boundary today
	 * (the deserialised value lacks the prototype methods used by
	 * subscribers). Callers that need cancellation should race the returned
	 * promise on their own side.
	 */
	completions(params: CompletionsParams): Promise<CompletionsResult>;

	/**
	 * Returns the set of characters that, when typed in a {@link UserMessage}
	 * input, SHOULD cause the client to issue a `completions` request.
	 * Aggregated from every registered {@link IAgentHostCompletionItemProvider}.
	 */
	getCompletionTriggerCharacters(): Promise<readonly string[]>;

	/** Dispose a session in the agent host, freeing SDK resources. */
	disposeSession(session: URI): Promise<void>;

	/** Create a new terminal on the agent host. */
	createTerminal(params: CreateTerminalParams): Promise<void>;

	/** Dispose a terminal and kill its process if still running. */
	disposeTerminal(terminal: URI): Promise<void>;

	/** Invoke a server-defined changeset operation. */
	invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult>;

	/**
	 * Routes a request received on an `mcp://` AHP side channel to the
	 * MCP server implementation owned by the appropriate agent. The
	 * channel URI shape is `mcp://<providerId>/<sessionId>/<serverName>`
	 * (the latter two segments URL-encoded), matching the
	 * {@link McpServerCustomization.channel | channel} the agent host
	 * advertises while the server is in
	 * {@link McpServerStatus.Ready | `Ready`}.
	 *
	 * `method` is the raw MCP JSON-RPC method (e.g. `tools/list`,
	 * `tools/call`, `resources/read`); `params` are the JSON-RPC params
	 * (still carrying the routing envelope's `channel` field, which the
	 * agent may ignore). Rejects with an `Error` whose message begins
	 * with `Method not found` when the channel is unknown or the agent
	 * doesn't recognise the method — the protocol server translates that
	 * into a JSON-RPC `-32601`.
	 */
	handleMcpRequest(channel: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown>;

	/**
	 * Aggregated stream of MCP notifications across every agent. The
	 * protocol server subscribes once and broadcasts each notification as
	 * a JSON-RPC notification to all connected clients (the routing
	 * envelope's `channel` field is sufficient for client-side dispatch,
	 * so no per-subscription fanout is required).
	 */
	readonly onMcpNotification: Event<IMcpNotification>;

	/** Gracefully shut down all sessions and the underlying client. */
	shutdown(): Promise<void>;

	// ---- Protocol methods (sessions process protocol) ----------------------

	/**
	 * Subscribe to state at the given URI. Returns a snapshot of the current
	 * state and the serverSeq at snapshot time. Subsequent actions for this
	 * resource arrive via {@link onDidAction}. Registers `clientId` against
	 * the resource so the server-side refcount knows who is watching, so the
	 * caller does not need to invoke {@link addSubscriber} separately. Pair
	 * with {@link unsubscribe} when the subscription is released.
	 */
	subscribe(resource: URI, clientId: string): Promise<IStateSnapshot>;

	/**
	 * Counterpart to {@link subscribe}. Drops `clientId` from the refcount
	 * for `resource`; when the last subscriber is removed, idle session state
	 * for `resource` may be evicted from the server.
	 */
	unsubscribe(resource: URI, clientId: string): void;

	/**
	 * Register `clientId` against `resource` without going through
	 * {@link subscribe}. Only needed by callers that hand out snapshots
	 * synchronously (e.g. the JSON-RPC handshake serving `initialSubscriptions`
	 * out of the in-memory state cache); regular subscribers should call
	 * {@link subscribe} instead. Counterpart cleanup is {@link unsubscribe}.
	 */
	addSubscriber(resource: URI, clientId: string): void;

	/**
	 * Fires when the server applies an action to subscribable state.
	 * Clients use this alongside {@link subscribe} to keep their local
	 * state in sync.
	 */
	readonly onDidAction: Event<ActionEnvelope>;

	/**
	 * Fires when the server broadcasts an ephemeral notification
	 * (e.g. sessionAdded, sessionRemoved).
	 */
	readonly onDidNotification: Event<INotification>;

	/**
	 * Dispatch a client-originated action to the server. The server applies
	 * it to state, triggers side effects, and echoes it back via
	 * {@link onDidAction} with the client's origin for reconciliation.
	 *
	 * `channel` is the protocol URI string identifying the channel the action
	 * targets (a session URI for session actions, terminal URI for terminal
	 * actions, or {@link ROOT_STATE_URI} for root actions). Strings are used
	 * rather than {@link URI} objects so that authority-less scheme URIs
	 * like `ahp-root://` survive the wire format without normalization.
	 */
	dispatchAction(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void;

	/**
	 * List the contents of a directory on the agent host's filesystem.
	 * Used by the client to drive a remote folder picker before session creation.
	 */
	resourceList(uri: URI): Promise<ResourceListResult>;

	/**
	 * Read stored content by URI from the agent host (e.g. file edit snapshots,
	 * or reading files from the remote filesystem).
	 */
	resourceRead(uri: URI): Promise<ResourceReadResult>;

	/**
	 * Write content to a file on the agent host's filesystem.
	 * Used for undo/redo operations on file edits.
	 */
	resourceWrite(params: ResourceWriteParams): Promise<ResourceWriteResult>;

	/**
	 * Copy a resource from one URI to another on the agent host's filesystem.
	 */
	resourceCopy(params: ResourceCopyParams): Promise<ResourceCopyResult>;

	/**
	 * Delete a resource at a URI on the agent host's filesystem.
	 */
	resourceDelete(params: ResourceDeleteParams): Promise<ResourceDeleteResult>;

	/**
	 * Move (rename) a resource from one URI to another on the agent host's filesystem.
	 */
	resourceMove(params: ResourceMoveParams): Promise<ResourceMoveResult>;

	/**
	 * Resolve a resource (stat + realpath) on the agent host's filesystem.
	 */
	resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult>;

	/**
	 * Create a directory (mkdir -p semantics) on the agent host's filesystem.
	 */
	resourceMkdir(params: ResourceMkdirParams): Promise<ResourceMkdirResult>;

	/**
	 * Create a resource watcher on the agent host's filesystem. Returns the
	 * `ahp-resource-watch:/<id>` channel URI the caller subscribes to in
	 * order to receive `resourceWatch/changed` events. The watcher is
	 * tied to the subscriber refcount on that channel — the implementation
	 * MUST hold the underlying file-system watcher for a short grace
	 * period after the last unsubscribe so reconnects don't drop events.
	 */
	createResourceWatch(params: CreateResourceWatchParams): Promise<CreateResourceWatchResult>;

	/**
	 * Notify the agent service that a client subscribed to the given
	 * `ahp-resource-watch:` channel so the per-watch refcount is bumped
	 * (and the underlying {@link IFileService} watcher attached on the
	 * first subscriber). Returns the decoded watch descriptor when the
	 * channel parses successfully and the watcher is live; returns
	 * `undefined` for unknown channels so the caller can surface a
	 * not-found error.
	 */
	onResourceWatchSubscribed(channel: string): ResourceWatchState | undefined;

	/**
	 * Counterpart to {@link onResourceWatchSubscribed}. Decrements the
	 * per-watch refcount; on the last drop the watcher is held for a
	 * short grace period before disposal.
	 */
	onResourceWatchUnsubscribed(channel: string): boolean;
}

/**
 * Consumer-facing connection to an agent host. Session handlers, terminal
 * contributions, and other features program against this interface.
 *
 * Implementations wrap an {@link IAgentService} and layer subscription
 * management and optimistic write-ahead on top.
 */
export interface IAgentConnection {

	readonly clientId: string;

	// ---- State subscriptions ------------------------------------------------
	readonly rootState: IAgentSubscription<RootState>;
	/**
	 * Acquire a refcounted subscription to `resource`. `owner` names the
	 * caller holding the reference so inspection surfaces can attribute who
	 * is retaining a subscription; use a stable identifier such as the
	 * acquiring class name.
	 */
	getSubscription<T extends StateComponents>(kind: T, resource: URI, owner: string): IReference<IAgentSubscription<ComponentToState[T]>>;
	getSubscriptionUnmanaged<T extends StateComponents>(kind: T, resource: URI): IAgentSubscription<ComponentToState[T]> | undefined;

	/**
	 * Returns the in-flight `createSession` Promise for `resource`, or `undefined` if no create is pending. Callers
	 * that need to gate work on a racing eager `createSession` (e.g. before deciding whether to fall through to a
	 * duplicate create) should await this first.
	 */
	getInflightSessionCreate(resource: URI): Promise<unknown> | undefined;

	/**
	 * Read-only descriptors of every active resource subscription on this
	 * connection, for inspection/debug surfaces. Excludes the always-live
	 * {@link rootState}.
	 */
	getActiveSubscriptions(): readonly IActiveSubscriptionInfo[];

	// ---- Action dispatch ----------------------------------------------------
	/**
	 * Dispatch a client-originated action. `channel` is the protocol URI
	 * string identifying the channel the action targets (a session URI for
	 * session actions, terminal URI for terminal actions, or
	 * `ROOT_STATE_URI` for root-config actions). Strings are used rather
	 * than {@link URI} objects so authority-less scheme URIs like
	 * `ahp-root://` survive the wire format without normalization.
	 */
	dispatch(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction): void;

	// ---- Events (connection-level) ------------------------------------------
	readonly onDidNotification: Event<INotification>;
	readonly onDidAction: Event<ActionEnvelope>;
	/**
	 * Fires when the host forwards an MCP server notification (e.g.
	 * `notifications/tools/list_changed`) over the `mcp://` side channel.
	 * The `channel` field on the notification routes the payload to the
	 * matching {@link McpServerCustomization}.
	 */
	readonly onMcpNotification: Event<IMcpNotification>;

	// ---- MCP side-channel ---------------------------------------------------
	/**
	 * Send a request on an `mcp://` AHP side channel. `channel` is the
	 * `mcp://` URI advertised by the matching {@link McpServerCustomization}
	 * (only available while the server is `ready`). `method` is the raw MCP
	 * JSON-RPC method (e.g. `tools/call`, `resources/read`,
	 * `sampling/createMessage`); `params` are the JSON-RPC params (the
	 * connection adds the routing envelope's `channel` field automatically).
	 *
	 * Rejects with an `Error` whose message begins with `Method not found`
	 * when the channel is unknown or the host doesn't recognise the method.
	 */
	handleMcpRequest(channel: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown>;

	// ---- Session lifecycle --------------------------------------------------
	authenticate(params: AuthenticateParams): Promise<AuthenticateResult>;
	listSessions(): Promise<IAgentSessionMetadata[]>;
	createSession(config?: IAgentCreateSessionConfig): Promise<URI>;
	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult>;
	sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult>;
	completions(params: CompletionsParams): Promise<CompletionsResult>;

	/**
	 * Trigger characters announced by the connected agent host that should
	 * cause the client to issue a `completions` request when typed in a
	 * user-message input. Resolves once on first request and is cached.
	 */
	getCompletionTriggerCharacters(): Promise<readonly string[]>;

	/**
	 * The host's `initialize` handshake result, exposed observably so callers
	 * can derive advertised capabilities (e.g. {@link InitializeResult.terminalCommandPrefix},
	 * {@link InitializeResult.completionTriggerCharacters}). `undefined` until
	 * the handshake completes; local (in-process) connections synthesize a
	 * minimal result carrying only the fields meaningful to that transport.
	 */
	readonly initializeResult: IObservable<InitializeResult | undefined>;
	disposeSession(session: URI): Promise<void>;

	/**
	 * Create an additional peer chat inside an existing session. `chat` is a
	 * client-chosen chat URI (see {@link buildChatUri}). The host adds the
	 * chat to the session's catalog and publishes `session/chatAdded`.
	 */
	createChat(session: URI, chat: URI, options?: IAgentCreateChatOptions): Promise<void>;
	/** Dispose an additional chat created via {@link createChat}. */
	disposeChat(chat: URI): Promise<void>;

	// ---- Terminal lifecycle -------------------------------------------------
	createTerminal(params: CreateTerminalParams): Promise<void>;
	disposeTerminal(terminal: URI): Promise<void>;

	// ---- Changeset operations -----------------------------------------------
	invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult>;

	// ---- Filesystem operations ----------------------------------------------
	resourceList(uri: URI): Promise<ResourceListResult>;
	resourceRead(uri: URI): Promise<ResourceReadResult>;
	resourceWrite(params: ResourceWriteParams): Promise<ResourceWriteResult>;
	resourceCopy(params: ResourceCopyParams): Promise<ResourceCopyResult>;
	resourceDelete(params: ResourceDeleteParams): Promise<ResourceDeleteResult>;
	resourceMove(params: ResourceMoveParams): Promise<ResourceMoveResult>;
	resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult>;
	resourceMkdir(params: ResourceMkdirParams): Promise<ResourceMkdirResult>;
	createResourceWatch(params: CreateResourceWatchParams): Promise<CreateResourceWatchResult>;
	/**
	 * Convenience method that bundles
	 * {@link createResourceWatch} + {@link subscribe} + a typed
	 * {@link IFileChange}[] event stream, so consumers (notably
	 * `AHPFileSystemProvider.watch`) can drive a watcher without
	 * understanding the underlying channel protocol. Disposing the
	 * returned handle unsubscribes.
	 */
	watchResource(params: CreateResourceWatchParams): Promise<IRemoteWatchHandle>;
}

export const IAgentHostService = createDecorator<IAgentHostService>('agentHostService');

/**
 * The local wrapper around the agent host process (manages lifecycle, restart,
 * exposes the proxied service). Consumed by the main process and workbench.
 */
export interface IAgentHostService extends IAgentConnection {

	readonly _serviceBrand: undefined;

	readonly onAgentHostExit: Event<number>;
	readonly onAgentHostStart: Event<void>;

	/**
	 * `true` while we are in the middle of authenticating against the local
	 * agent host (resolving tokens for any advertised `protectedResources` and
	 * pushing them via {@link authenticate}). Defaults to `true` at startup so
	 * that the period before the first auth pass is also covered.
	 *
	 * Producers (the workbench `AgentHostContribution`) flip this around their
	 * auth pass; consumers (e.g. the local sessions provider) read it to mark
	 * sessions as still loading.
	 */
	readonly authenticationPending: IObservable<boolean>;

	/** Update {@link authenticationPending}. Internal — only the auth driver should call this. */
	setAuthenticationPending(pending: boolean): void;

	restartAgentHost(): Promise<void>;

	startWebSocketServer(): Promise<IAgentHostSocketInfo>;

	/**
	 * Get inspector listener info for the agent host process. If the inspector
	 * is not currently active and `tryEnable` is true, opens the inspector on
	 * a random local port. Returns `undefined` if the inspector cannot be
	 * enabled.
	 */
	getInspectInfo(tryEnable: boolean): Promise<IAgentHostInspectInfo | undefined>;
}
