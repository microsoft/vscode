/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../base/common/cancellation.js';
import type { VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { IReference } from '../../../base/common/lifecycle.js';
import type { IObservable } from '../../../base/common/observable.js';
import { isWindows } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import type { IConfigurationChangeEvent, IConfigurationService } from '../../configuration/common/configuration.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AgentSandboxSettingId } from '../../sandbox/common/settings.js';
import type { IActiveSubscriptionInfo, IAgentSubscription } from './state/agentSubscription.js';
import type { IRemoteWatchHandle } from './agentHostFileSystemProvider.js';
import type { IAgentHostResourceUriMapper } from './agentHostUri.js';
import type { IAgentHostClientTelemetryContext } from './agentHostTelemetry.js';
import type { CompletionsParams, CompletionsResult, CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from './state/protocol/commands.js';
import type { InitializeResult } from './state/protocol/common/commands.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from './state/protocol/channels-changeset/commands.js';
import type { ActionEnvelope, INotification, IRootConfigChangedAction, SessionAction, ChatAction, TerminalAction, ClientAnnotationsAction, ClientChangesetAction } from './state/sessionActions.js';
import type { ContentEncoding, ResourceCopyParams, ResourceCopyResult, ResourceDeleteParams, ResourceDeleteResult, ResourceListResult, ResourceMkdirParams, ResourceMkdirResult, ResourceMoveParams, ResourceMoveResult, ResourceReadResult, ResourceResolveParams, ResourceResolveResult, ResourceWatchState, ResourceWriteParams, ResourceWriteResult, CreateResourceWatchParams, CreateResourceWatchResult, IStateSnapshot } from './state/sessionProtocol.js';
import { ComponentToState, StateComponents, type RootState } from './state/sessionState.js';
import { type AgentProvider, CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID, type AuthenticateParams, type AuthenticateResult, type IAgentCreateChatOptions, type IAgentCreateSessionConfig, type IAgentSessionMetadata, type IAgentResolveSessionConfigParams, type IAgentSessionConfigCompletionsParams, type IMcpNotification, type IAgentHostNetworkEndpoint, type IAgentHostManagedSettingsSnapshot } from './agent.js';

// ---- Provider-model re-exports (compatibility) ------------------------------
// New provider code imports these from agent.ts.
export type {
	IAgent, IAgentChats, IAgentChatContext, IAgentCreateChatOptions, IAgentCreateChatForkSource,
	IAgentCreateChatSideChatSelection, IAgentCreateChatSideChatSource, IAgentCreateChatResult,
	IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentChatMetadata, IAgentSessionMetadata,
	IAgentSessionProjectInfo, IAgentLegacyChat, IAgentChatAdoptionResult, IAgentSpawnedChatParent,
	IAgentSpawnChatEvent, IAgentMaterializeChatEvent, IAgentChatDataChange, IAgentResolveChatConfigParams,
	IAgentChatConfigCompletionsParams, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams,
	IAgentModelInfo, AgentSignal, IAgentActionSignal, IAgentToolPendingConfirmationSignal,
	IAgentSubagentStartedSignal, IAgentSubagentResumedSignal, IAgentSubagentCompletedSignal,
	IAgentSteeringConsumedSignal, IMcpNotification, IActiveClient, AgentProvider, IAgentCapabilities,
	IAgentDescriptor, AuthenticateParams, IAgentHostAuthTokenRequest, AuthenticateResult,
	IAgentHostNetworkEndpoint, IAgentHostManagedSettingsSnapshot,
} from './agent.js';
export {
	AgentSession, CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID, GITHUB_COPILOT_PROTECTED_RESOURCE,
	GITHUB_REPO_PROTECTED_RESOURCE, protectedResourcesRequireGitHubCopilotSignIn, resolveAgentChatContext,
	resolveAgentChatOrigin, resolveSubagentChatParent, resolveAgentHostCustomizations, subagentChatTitle,
	SubagentChatSignal,
} from './agent.js';

// IPC contract between clients and the agent host process.

export const enum AgentHostIpcChannels {
	/** Channel for the agent host service on the main-process side */
	AgentHost = 'agentHost',
	/** Channel for log forwarding from the agent host process */
	Logger = 'agentHostLogger',
	/** Channel for WebSocket client connection count (server process management only) */
	ConnectionTracker = 'agentHostConnectionTracker',
	/** Channel carrying raw Agent Host Protocol frames over a MessagePort. */
	Protocol = 'agentHostProtocol',
	/** Narrow local management channel that remains outside of the AHP data plane. */
	Management = 'agentHostManagement',
	/**
	 * Channel registered by the remote server that proxies AHP JSON-RPC
	 * frames between a renderer and the agent host running on the server.
	 * Pairs with `AgentHostIpcChannelTransport` on the renderer side.
	 */
	RemoteProxy = 'agentHostProxy',
}

/** Configuration key that controls whether AHP JSONL logs are written for agent host transports. */
export const AgentHostAhpJsonlLoggingSettingId = 'chat.agentHost.ahpJsonlLoggingEnabled';

export type AgentHostDebugLogsArtifactKind = 'archive' | 'directory';
/** Maximum number of files in one Agent Host debug-log artifact. */
export const AGENT_HOST_DEBUG_LOGS_MAX_ENTRIES = 1000;
/**
 * Maximum payload of a single {@link IAgentHostDebugLogsChunk}. Debug-log
 * artifacts are streamed in chunks of at most this size so a remote agent host
 * never has to encode a whole archive into one JSON-RPC message.
 */
export const AGENT_HOST_DEBUG_LOGS_CHUNK_BYTES = 1024 * 1024;

export interface IAgentHostDebugLogsArtifactEntry {
	readonly path: string;
	readonly size: number;
}

export interface IAgentHostDebugLogsArtifact {
	readonly kind: AgentHostDebugLogsArtifactKind;
	readonly resource: URI;
	readonly providerLogsIncluded: boolean;
	readonly size: number;
	readonly uncompressedSize: number;
	/** Exact regular files staged in the artifact. Paths are relative, normalized, and unique. */
	readonly entries: readonly IAgentHostDebugLogsArtifactEntry[];
}

/** One bounded slice of a debug-log artifact, read via `readDebugLogsChunk`. */
export interface IAgentHostDebugLogsChunk {
	/** Raw bytes for this slice. Empty once `position` is at or past the end. */
	readonly data: VSBuffer;
	/** `true` when this slice reaches the end of the artifact. */
	readonly eof: boolean;
}

/** Configuration key controlling automatic OS system proxy discovery for agent-host Copilot sessions. */
export const AgentHostSystemProxyEnabledSettingId = 'chat.agentHost.systemProxy.enabled';

/** Configuration key controlling the GitHub MCP server in agent-host sessions. */
export const AgentHostGitHubMcpServerEnabledSettingId = 'chat.agentHost.githubMcpServer.enabled';

/** Configuration key gating active-agent session and chat title generation. */
export const AgentHostActiveAgentTitleGenerationSettingId = 'chat.agentHost.experimental.activeAgentTitleGeneration';

/** Configuration key enabling rich-link guidance for Markdown plan documents. */
export const AgentHostMarkdownPlanRichLinksEnabledSettingId = 'chat.agentHost.experimental.markdownPlanRichLinks';

/** Configuration key gating the artifact tools and their agent instruction. */
export const ArtifactToolsSettingId = 'chat.artifactTools.enabled';

/**
 * Configuration key gating multiple-working-directory support for the Copilot
 * agent-host provider. When `true`, the Copilot provider advertises the
 * `multipleWorkingDirectories` capability, so a session created in a multi-root
 * workspace can span every workspace folder. Hidden from the Settings UI and
 * off by default while the feature is dogfooded; the agent host re-advertises
 * on change, so newly created sessions pick it up without a restart.
 */
export const AgentHostCopilotMultiRootEnabledSettingId = 'chat.agentHost.copilotAgent.multiRootEnabled';

/**
 * Configuration key gating multiple-working-directory support for the Claude
 * agent-host provider. When `true`, the Claude provider advertises the
 * `multipleWorkingDirectories` capability, so a session created in a multi-root
 * workspace can span every workspace folder. Independent of
 * {@link AgentHostCopilotMultiRootEnabledSettingId} because the Claude Agent SDK
 * already supports additional directories while the Copilot SDK does not. Hidden
 * from the Settings UI and off by default while the feature is dogfooded; the
 * agent host re-advertises on change, so newly created sessions pick it up
 * without a restart.
 */
export const AgentHostClaudeMultiRootEnabledSettingId = 'chat.agentHost.claudeAgent.multiRootEnabled';

/**
 * Configuration key gating multiple-working-directory support for the Codex
 * agent-host provider. Hidden from the Settings UI and off by default while the
 * feature is dogfooded.
 */
export const AgentHostCodexMultiRootEnabledSettingId = 'chat.agentHost.codexAgent.multiRootEnabled';

/**
 * Experimentation setting id gating the conditional agent-window auth feature.
 * When `true`, the agent window opens for a signed-out user instead of forcing
 * GitHub sign-in; each session type then gates on its own GitHub requirement, so
 * a type usable without GitHub (e.g. Claude in native mode with an existing local
 * setup) works signed out while types that need GitHub prompt for it on demand.
 *
 * This is the **workbench** VS Code setting id. The workbench registers the
 * configuration schema and forwards the value into the agent-host root config
 * under the short key `AgentHostConfigKey.AllowSignedOutWhenUsable`, which the
 * Claude provider reads node-side via `getRootValue`. Until it is wired and
 * enabled the root key is absent, so it reads `false` and behavior is identical
 * to today.
 */
export const AgentHostAllowSignedOutWhenUsableSettingId = 'chat.agentHost.allowSignedOutWhenUsable';

// The Copilot-CLI-specific setting IDs (`customTerminalTool`, `opus48Prompt`,
// `modelCapabilityOverrides`) live with their root-config keys in
// `copilotCliConfig.ts`.

/**
 * Configuration key controlling whether the Claude provider is registered in
 * the agent host process. When `false`, the agent host skips registering the
 * Claude provider regardless of SDK availability. Defaults to `true`.
 *
 * The agent host process must be restarted for changes to take effect.
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
 * Configuration key controlling whether extension-provided BYOK ("bring your
 * own key") models are published and included in new agent-host sessions.
 * Changes are synchronized to the running agent host.
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
 * is `false`). Supported values are:
 *
 *  - `'off'` (the default): no sandbox policy is forwarded for the SDK shell
 *    path \u2014 commands run unsandboxed.
 *  - `'on'`: the Agent Host runs the SDK\u2019s shell tool inside a sandbox
 *    using the user's `chat.agent.sandbox.fileSystem.*` filesystem policy.
 *    Outbound network is blocked.
 *
 * Unrestricted outbound network is controlled separately by
 * `chat.agent.sandbox.allowNetwork`.
 *
 * Has no effect when `AgentHostCustomTerminalToolEnabledSettingId` is
 * `true` \u2014 the host\u2019s own terminal sandbox engine then handles shell
 * commands and reads `chat.agent.sandbox.enabled` directly.
 */
export const AgentHostSdkSandboxEnabledSettingId = 'chat.agentHost.sdkSandbox.enabled';

/**
 * Configuration key that controls the sandbox mode for the Copilot SDK's
 * built-in shell tool on Windows. This is independent of
 * {@link AgentHostSdkSandboxEnabledSettingId} so Windows support can be rolled
 * out separately. Supported values are `'off'` and `'on'`; the default is
 * `'off'`.
 */
export const AgentHostSdkSandboxWindowsEnabledSettingId = 'chat.agentHost.sdkSandbox.enabledWindows';

export type AgentHostCopilotSandboxSettingId =
	| AgentSandboxSettingId.AgentSandboxEnabled
	| AgentSandboxSettingId.AgentSandboxWindowsEnabled
	| typeof AgentHostSdkSandboxEnabledSettingId
	| typeof AgentHostSdkSandboxWindowsEnabledSettingId;

export function getAgentHostCopilotSandboxSettingId(customTerminalToolEnabled: boolean, windows = isWindows): AgentHostCopilotSandboxSettingId {
	if (customTerminalToolEnabled) {
		return windows ? AgentSandboxSettingId.AgentSandboxWindowsEnabled : AgentSandboxSettingId.AgentSandboxEnabled;
	}
	return windows ? AgentHostSdkSandboxWindowsEnabledSettingId : AgentHostSdkSandboxEnabledSettingId;
}

/**
 * Selects whether the regular workbench surfaces Codex from the agent host
 * instead of the OpenAI extension.
 */
export const CodexPreferAgentHostEditorSettingId = 'chat.editor.codex.preferAgentHost';

export function affectsAgentHostProviderPreference(event: IConfigurationChangeEvent, isSessionsWindow: boolean): boolean {
	return event.affectsConfiguration(isSessionsWindow ? AgentHostCodexAgentEnabledSettingId : CodexPreferAgentHostEditorSettingId);
}

export function shouldSurfaceLocalAgentHostProvider(provider: AgentProvider, configurationService: IConfigurationService, isSessionsWindow: boolean): boolean {
	switch (provider) {
		case CLAUDE_AGENT_PROVIDER_ID:
			return true;
		case CODEX_AGENT_PROVIDER_ID:
			return configurationService.getValue<boolean>(isSessionsWindow ? AgentHostCodexAgentEnabledSettingId : CodexPreferAgentHostEditorSettingId) === true;
		default:
			return true;
	}
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

/** Renderer-to-main request to replace the shared local Agent Host process. */
export const AgentHostRestartIpcChannel = 'vscode:restartAgentHost';

/** Main-to-renderer notification sent before replacement so each local client reconnects immediately. */
export const AgentHostWillRestartIpcChannel = 'vscode:agentHostWillRestart';

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

/** Host-level network context for diagnostics, produced by {@link IAgentConnection.getNetworkDiagnosticsInfo}. */
export interface IAgentHostNetworkDiagnosticsInfo {
	/** Agent host product version. */
	readonly version: string;
	/** Operating system platform of the agent host process (`process.platform`). */
	readonly os: string;
	/** CPU architecture of the agent host process (`process.arch`). */
	readonly arch: string;
	/** Authenticated GitHub account login, when known. */
	readonly account?: string;
	/** VS Code `http.*` proxy settings observed by the agent host, keyed by setting id (only those that are set). */
	readonly proxySettings: Readonly<Record<string, string>>;
	/** Proxy-related environment variables observed by the agent host process, keyed by name (only those that are set). */
	readonly proxyEnv: Readonly<Record<string, string>>;
	/** Endpoints the agent host suggests probing via {@link IAgentConnection.diagnosticsFetch}. */
	readonly endpoints: readonly IAgentHostNetworkEndpoint[];
}

export interface IAgentHostManagedSettingsDiagnostics {
	readonly provider: AgentProvider;
	readonly snapshot?: IAgentHostManagedSettingsSnapshot;
	readonly error?: string;
}

/** Result of a DNS lookup for a single address family, part of {@link IAgentHostNetworkFetchResult}. */
export interface IAgentHostDnsResult {
	/** The resolved address, when the lookup succeeded. */
	readonly address?: string;
	/** Time taken by the lookup, in milliseconds. */
	readonly durationMs?: number;
	/** Lookup error message, when it failed. */
	readonly error?: string;
}

/** Result of a single connectivity probe, produced by {@link IAgentConnection.diagnosticsFetch}. */
export interface IAgentHostNetworkFetchResult {
	/** The URL that was probed. */
	readonly url: string;
	/** The resolved proxy URL for this endpoint, or `undefined` for a direct connection. */
	readonly proxyUrl?: string;
	/** IPv4 DNS lookup result for the host. */
	readonly dnsIpv4?: IAgentHostDnsResult;
	/** IPv6 DNS lookup result for the host. */
	readonly dnsIpv6?: IAgentHostDnsResult;
	/** HTTP status code from the probe, when a response arrived. */
	readonly statusCode?: number;
	/** HTTP status message from the probe, when a response arrived. */
	readonly statusMessage?: string;
	/** Response body text (possibly truncated), when a response arrived. Callers use it to check expected content. */
	readonly body?: string;
	/** Time taken by the reachability probe, in milliseconds. */
	readonly durationMs?: number;
	/** Probe error message, when the connection failed. */
	readonly error?: string;
}

/**
 * IPC service exposed on the {@link AgentHostIpcChannels.ConnectionTracker}
 * channel. Used by the server process for lifetime management and by the
 * shared process to request a local WebSocket listener on-demand.
 */
export interface IConnectionTrackerService {
	readonly onDidChangeConnectionCount: Event<number>;

	/** Resolves after the WebSocket listener configured at process startup is bound. */
	waitForConfiguredWebSocketServer(): Promise<void>;

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

/**
 * Narrow renderer-to-local-agent-host control surface. All stateful agent
 * operations travel over {@link AgentHostIpcChannels.Protocol}.
 */
export interface IAgentHostManagementService {
	readonly _serviceBrand: undefined;

	/**
	 * Local-only compatibility path for session fields not yet represented by
	 * AHP `createSession` (`model`, `agent`, and `importConversation`).
	 */
	createSessionWithExtensions(config: IAgentCreateSessionConfig): Promise<URI>;
	/**
	 * Local-only compatibility path for chat fields not yet represented by AHP
	 * `createChat` (`title` and `model`).
	 */
	createChatWithExtensions(session: URI, chat: URI, options: IAgentCreateChatOptions): Promise<void>;
	shutdown(): Promise<void>;
	getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo>;
	getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]>;
	diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult>;
	getSessionStateFile(session: URI): Promise<URI | undefined>;
	collectDebugLogs(session: URI | undefined, kind: AgentHostDebugLogsArtifactKind, chat?: URI): Promise<IAgentHostDebugLogsArtifact>;
	readDebugLogsChunk(resource: URI, position: number): Promise<IAgentHostDebugLogsChunk>;
	startWebSocketServer(): Promise<IAgentHostSocketInfo>;
	getInspectInfo(tryEnable: boolean): Promise<IAgentHostInspectInfo | undefined>;
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

	/** List all available sessions from the Copilot CLI. */
	listSessions(): Promise<IAgentSessionMetadata[]>;

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

	createTerminal(params: CreateTerminalParams): Promise<void>;

	/** Dispose a terminal and kill its process if still running. */
	disposeTerminal(terminal: URI): Promise<void>;

	invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult>;

	/**
	 * Routes a request received on an `mcp://` AHP side channel to the
	 * MCP server implementation owned by the appropriate agent. The
	 * channel URI shape is `mcp://<providerId>/<chatUri>/<serverName>`
	 * (the latter two segments URL-encoded), where `chatUri` is the concrete
	 * `ahp-chat://` URI, matching the
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

	/**
	 * Host-level network context for diagnostics — agent host version, OS/arch,
	 * account, proxy settings/env, and the endpoints worth probing (which
	 * callers probe via {@link diagnosticsFetch}, plus any additional URLs).
	 */
	getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo>;

	/** Resolve managed settings through each provider's native SDK/runtime implementation. */
	getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]>;

	/**
	 * Probe connectivity from the agent host process to a single `url`,
	 * resolving the proxy and timing DNS + reachability. Used by the "Network
	 * Diagnostics" developer command.
	 */
	diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult>;

	getSessionStateFile?(session: URI): Promise<URI | undefined>;

	collectDebugLogs?(session: URI | undefined, kind: AgentHostDebugLogsArtifactKind, chat?: URI): Promise<IAgentHostDebugLogsArtifact>;

	readDebugLogsChunk?(resource: URI, position: number): Promise<IAgentHostDebugLogsChunk>;

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
	dispatchAction(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction, clientId: string, clientSeq: number, clientContext?: IAgentHostClientTelemetryContext): void;

	/**
	 * List the contents of a directory on the agent host's filesystem.
	 * Used by the client to drive a remote folder picker before session creation.
	 */
	resourceList(uri: URI): Promise<ResourceListResult>;

	/**
	 * Read stored content by URI from the agent host (e.g. file edit snapshots,
	 * or reading files from the remote filesystem).
	 */
	resourceRead(uri: URI, encoding?: ContentEncoding): Promise<ResourceReadResult>;

	/**
	 * Write content to a file on the agent host's filesystem.
	 * Used for undo/redo operations on file edits.
	 */
	resourceWrite(params: ResourceWriteParams): Promise<ResourceWriteResult>;

	resourceCopy(params: ResourceCopyParams): Promise<ResourceCopyResult>;

	resourceDelete(params: ResourceDeleteParams): Promise<ResourceDeleteResult>;

	resourceMove(params: ResourceMoveParams): Promise<ResourceMoveResult>;

	/** Resolve a resource (stat + realpath). */
	resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult>;

	/** Create a directory (`mkdir -p` semantics). */
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
	readonly resourceUris: IAgentHostResourceUriMapper;

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
	dispatch(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction): void;

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
	 * the handshake completes.
	 */
	readonly initializeResult: IObservable<InitializeResult | undefined>;
	disposeSession(session: URI): Promise<void>;

	/**
	 * Host-level network context for diagnostics (version, OS/arch, account,
	 * proxy settings/env, endpoints). Runs on the agent host process (local or
	 * remote), so the result reflects the environment the Copilot SDK actually
	 * runs in.
	 */
	getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo>;

	/** Resolve managed settings through each provider's native SDK/runtime implementation. */
	getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]>;

	/**
	 * Probe connectivity from the agent host to a single `url`. Runs on the
	 * agent host process (local or remote), so the result reflects the
	 * environment the Copilot SDK actually runs in.
	 */
	diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult>;

	getSessionStateFile(session: URI): Promise<URI | undefined>;

	collectDebugLogs(session: URI | undefined, kind: AgentHostDebugLogsArtifactKind, chat?: URI): Promise<IAgentHostDebugLogsArtifact>;

	/**
	 * Read one bounded slice of an artifact previously returned by
	 * {@link collectDebugLogs}. Only artifacts this host produced are readable.
	 */
	readDebugLogsChunk(resource: URI, position: number): Promise<IAgentHostDebugLogsChunk>;

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
	resourceRead(uri: URI, encoding?: ContentEncoding): Promise<ResourceReadResult>;
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
 * The ambient Agent Host connection used by workbench surfaces.
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

	/** Start connecting to the agent host if it has not already started. */
	startAgentHost(): void;

	/** Restart the agent host process, if this connection owns its lifecycle. */
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
