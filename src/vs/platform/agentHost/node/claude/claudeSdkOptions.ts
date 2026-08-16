/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpSdkServerConfigWithInstance, OnElicitation, Options } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { tmpdir } from 'os';
import { delimiter, dirname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { rgDiskPath } from '../../../../base/node/ripgrep.js';
import { AiAgentEnvValue, AiAgentEnvVar } from '../../../chat/common/aiAgentEnv.js';
import { ClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { resolveClaudeEffort } from '../../common/claudeModelConfig.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';
import { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { buildClientToolMcpServer } from './clientTools/claudeClientToolMcpServer.js';
import { toClaudeSdkModelId } from './claudeModelSelection.js';
import type { IAgentHostNativeOTelConfig, IAgentHostTraceContext } from '../../common/otel/agentHostOTelService.js';
import type { ClaudeTransport } from './claudeProxyService.js';
import { SessionClientToolsDiff } from './clientTools/claudeSessionClientToolsModel.js';

/**
 * Inputs to {@link buildOptions} that vary per startup. Pure-data: no
 * services, no live event subscribers. The function is a deterministic
 * projection from this bag plus a {@link IClaudeProxyHandle} onto the
 * SDK's {@link Options} discriminated union.
 */
export interface IBuildOptionsInput {
	readonly sessionId: string;
	readonly workingDirectory: URI;
	/**
	 * Additional directories (index 1..N of the session's ordered set) the agent
	 * is granted tool access to beyond the primary {@link workingDirectory}
	 * (index 0 → `Options.cwd`). Projected onto `Options.additionalDirectories`
	 * as absolute paths. Omitted from the returned options entirely when empty so
	 * a single-root session keeps the SDK default (no additional directories).
	 */
	readonly additionalDirectories?: readonly URI[];
	readonly model: ModelSelection | undefined;
	readonly abortController: AbortController;
	readonly permissionMode: ClaudePermissionMode;
	readonly canUseTool: NonNullable<Options['canUseTool']>;
	readonly onElicitation: OnElicitation;
	readonly isResume: boolean;
	/**
	 * One-shot SDK assistant-message uuid to resume *up to and including*
	 * (the SDK's `Options.resumeSessionAt`). Only meaningful with
	 * {@link isResume}; truncates the loaded transcript to this anchor so
	 * the next turn continues from the restored point on the same session
	 * id. Omitted in the non-resume (`sessionId`) branch and on ordinary
	 * resumes. Set by `truncateChat` for the rebuild that immediately
	 * precedes the post-restore turn.
	 */
	readonly resumeSessionAt?: string;
	readonly mcpServers: Record<string, McpSdkServerConfigWithInstance> | undefined;
	/**
	 * SDK-prefixed tool names to auto-approve without prompting (projected
	 * onto `Options.allowedTools`). Used for the agent host's feedback server
	 * tools, which only touch the session's annotations channel and are always
	 * safe. Omitted from the returned options when empty so the SDK keeps its
	 * default.
	 */
	readonly allowedTools?: readonly string[];
	/**
	 * Local plugin directories to load at SDK startup. Projected onto
	 * `Options.plugins` as `{ type: 'local', path }`. Omitted from the
	 * returned options entirely when empty so the SDK keeps its default
	 * (no plugins). Built per-session from
	 * {@link SessionClientCustomizationsDiff.consume}.
	 */
	readonly plugins?: readonly URI[];
	/**
	 * Resolved SDK agent name (matches a key in `Options.agents`, or an
	 * agent loaded from `~/.claude/agents/**`). Projected onto
	 * `Options.agent` — the SDK's `--agent` flag. The plugin URI captured
	 * at startup is the only path the SDK consults, so any `changeAgent`
	 * after materialize triggers a yield-restart through the rematerializer.
	 * Omit when no custom agent is selected (SDK default behavior).
	 */
	readonly agent?: string;
	readonly telemetry?: IAgentHostNativeOTelConfig;
	readonly traceContext?: IAgentHostTraceContext;
	readonly getUserPromptAdditionalContext?: () => string | undefined;
}

/**
 * Build the SDK {@link Options} bag for a Claude session startup.
 * Deterministic over its declared inputs plus three ambient reads:
 *   1. `process.env.PATH` (composed into `Options.settings.env.PATH`
 *      so ripgrep wins over any system install),
 *   2. `process.env` keys via {@link buildSubprocessEnv} (used to
 *      strip `VSCODE_*` / `ELECTRON_*` / `NODE_OPTIONS` /
 *      `ANTHROPIC_API_KEY` from the spawn env),
 *   3. the memoized `rgDiskPath()` lookup.
 * The returned options carry the caller-supplied `abortController` so a
 * racing dispose unwinds `sdk.startup()` cleanly.
 *
 * Used by both the initial materialize and the yield-restart rematerialize
 * — both call sites pass a freshly-built `mcpServers` snapshot consumed
 * from the session's {@link SessionClientToolsDiff}.
 */
export async function buildOptions(
	input: IBuildOptionsInput,
	transport: ClaudeTransport,
	logStderr: (data: string) => void,
): Promise<Options> {
	const isProxy = transport.kind === 'proxy';
	const subprocessEnv = buildSubprocessEnv(isProxy);
	const telemetryEnv = buildClaudeTelemetryEnv(input.telemetry, input.traceContext);
	Object.assign(subprocessEnv, telemetryEnv);
	const resolvedRgDiskPath = await rgDiskPath();
	const settingsEnv: Record<string, string> = {
		...telemetryEnv,
		// Proxied (Copilot-routed) mode points the SDK at the local proxy on a
		// per-session bearer. Native (BYO-Anthropic) mode omits both so the SDK
		// uses its own credential resolution from the subprocess env
		// (`ANTHROPIC_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN` from `claude
		// setup-token` — both forwarded by `buildSubprocessEnv`).
		...(transport.kind === 'proxy'
			? {
				ANTHROPIC_BASE_URL: transport.handle.baseUrl,
				ANTHROPIC_AUTH_TOKEN: `${transport.handle.nonce}.${input.sessionId}`,
			}
			: {}),
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
		USE_BUILTIN_RIPGREP: '0',
		// Attribute the CLI's tool subprocesses (`gh`, …) to VS Code.
		// `settings.env` is what the CLI layers onto the commands it runs, so it
		// needs the marker in addition to the spawn env below. Note the CLI
		// re-stamps `AI_AGENT` as `claude-code_<version>_agent` for its own Bash
		// tool, so commands from that tool are not attributed to VS Code.
		[AiAgentEnvVar]: AiAgentEnvValue,
		PATH: `${dirname(resolvedRgDiskPath)}${delimiter}${process.env.PATH ?? ''}`,
	};

	return {
		cwd: input.workingDirectory.fsPath,
		...(input.additionalDirectories && input.additionalDirectories.length > 0
			? { additionalDirectories: input.additionalDirectories.map(d => d.fsPath) }
			: {}),
		executable: process.execPath as 'node',
		env: subprocessEnv,
		abortController: input.abortController,
		allowDangerouslySkipPermissions: true,
		canUseTool: input.canUseTool,
		onElicitation: input.onElicitation,
		disallowedTools: ['WebSearch'],
		includePartialMessages: true,
		forwardSubagentText: true,
		enableFileCheckpointing: true,
		model: toClaudeSdkModelId(input.model),
		effort: resolveClaudeEffort(input.model),
		permissionMode: input.permissionMode,
		...(input.isResume
			? { resume: input.sessionId, ...(input.resumeSessionAt ? { resumeSessionAt: input.resumeSessionAt } : {}) }
			: { sessionId: input.sessionId }),
		...(input.mcpServers ? { mcpServers: input.mcpServers } : {}),
		...(input.allowedTools && input.allowedTools.length > 0 ? { allowedTools: [...input.allowedTools] } : {}),
		...(input.plugins && input.plugins.length > 0
			? { plugins: input.plugins.map(p => ({ type: 'local' as const, path: p.fsPath })) }
			: {}),
		...(input.agent ? { agent: input.agent } : {}),
		settingSources: ['user', 'project', 'local'],
		settings: { env: settingsEnv },
		systemPrompt: { type: 'preset', preset: 'claude_code' },
		...(input.getUserPromptAdditionalContext ? {
			hooks: {
				UserPromptSubmit: [{
					hooks: [async () => ({
						hookSpecificOutput: {
							hookEventName: 'UserPromptSubmit' as const,
							additionalContext: input.getUserPromptAdditionalContext?.(),
						},
					})],
				}],
			},
		} : {}),
		stderr: logStderr,
	};
}

/**
 * Consume the diff (clears its dirty bit) and build the in-process MCP
 * server config from the resulting tool snapshot. Resolves to
 * `undefined` when the snapshot is empty so `Options.mcpServers` is
 * omitted entirely and the SDK keeps its default.
 *
 * On builder throw the caller is responsible for re-marking the diff
 * dirty (the diff has already been consumed). See
 * {@link SessionClientToolsDiff.markDirty}.
 */
export async function buildClientMcpServers(
	toolDiff: SessionClientToolsDiff,
	registry: PendingRequestRegistry<CallToolResult>,
	sdkService: IClaudeAgentSdkService,
): Promise<Record<string, McpSdkServerConfigWithInstance> | undefined> {
	const tools = toolDiff.consume();
	if (tools.length === 0) {
		return undefined;
	}
	const server = await buildClientToolMcpServer(tools, id => registry.register(id), sdkService);
	return { client: server };
}

/**
 * Build a minimal {@link Options} bag for an ephemeral model-enumeration
 * query (Phase 19, native transport). No workspace (`cwd = os.tmpdir()`), no
 * proxy env, and the user's `ANTHROPIC_API_KEY` preserved so the SDK can
 * authenticate. Reads the user's real `~/.claude` config so subscription
 * models (e.g. Opus) surface; verified not to write any session transcript
 * because the enumeration never iterates a turn. The caller (`_fetchNativeModels`)
 * aborts the returned `abortController` during teardown, alongside `query.close()`.
 */
export function buildModelEnumerationOptions(): Options {
	return {
		cwd: tmpdir(),
		executable: process.execPath as 'node',
		env: buildSubprocessEnv(false),
		abortController: new AbortController(),
		systemPrompt: { type: 'preset', preset: 'claude_code' },
		settings: {
			env: {
				CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
			},
		},
	};
}

/**
 * Build the {@link Options.env} payload for the Claude subprocess.
 *
 * SDK >= 0.3 **replaces** the subprocess environment with `Options.env` — it is
 * NOT merged with `process.env` (sdk.d.ts:1402-1405: "this value REPLACES the
 * subprocess environment entirely … Spread `process.env` yourself"). Keys whose
 * value is `undefined` are dropped from the spawned env.
 *
 * Two modes, gated by `proxied`:
 *
 * - **Proxied (Copilot-routed), `true` (default):** a *sparse* env. Credentials
 *   reach the CLI via `settings.env` (the per-session proxy bearer), so the
 *   subprocess env stays minimal and the user's personal `ANTHROPIC_API_KEY`
 *   must not leak to the Copilot proxy (stripped). `PATH` for ripgrep is
 *   supplied through `settings.env`, not here.
 *
 * - **Native (BYO-Anthropic), `false`:** inherit the real `process.env` so the
 *   user's own credentials (`CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`,
 *   or `ANTHROPIC_API_KEY`) and `PATH` actually reach the `claude` subprocess.
 *   Without this spread, replace semantics wipe the inherited token and the CLI
 *   reports "Not logged in".
 *
 * In both modes the agent host's own `NODE_OPTIONS`, `ELECTRON_*`, and
 * `VSCODE_*` variables are stripped (they break the Electron-node subprocess),
 * `ELECTRON_RUN_AS_NODE=1` is set, and `AI_AGENT` is pinned so the sparse
 * proxied env still announces the originating VS Code surface. Mirror of the
 * strip pattern in `CopilotAgent._ensureClient()`.
 *
 * Exported for unit testing as a pure function over `process.env`.
 */
export function buildClaudeTelemetryEnv(config: IAgentHostNativeOTelConfig | undefined, traceContext?: IAgentHostTraceContext): Record<string, string> {
	if (!config) {
		return {};
	}
	const env: Record<string, string> = {
		CLAUDE_CODE_ENABLE_TELEMETRY: '1',
		OTEL_SERVICE_NAME: 'claude-code',
		OTEL_RESOURCE_ATTRIBUTES: serializeResourceAttributes(config.resourceAttributes),
		CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: config.traces ? '1' : '0',
		OTEL_TRACES_EXPORTER: config.traces ? 'otlp' : 'none',
		OTEL_LOGS_EXPORTER: config.external ? 'otlp' : 'none',
		OTEL_METRICS_EXPORTER: config.external ? 'otlp' : 'none',
		OTEL_LOG_USER_PROMPTS: config.captureContent ? '1' : '0',
		OTEL_LOG_ASSISTANT_RESPONSES: config.captureContent ? '1' : '0',
		OTEL_LOG_TOOL_DETAILS: config.captureContent ? '1' : '0',
		OTEL_LOG_TOOL_CONTENT: config.captureContent ? '1' : '0',
	};
	if (config.traces) {
		env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = config.traces.endpoint;
		env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL = config.traces.protocol;
	}
	if (config.external) {
		env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT = resolveSignalEndpoint(config.external.endpoint, 'logs', config.external.protocol);
		env.OTEL_EXPORTER_OTLP_LOGS_PROTOCOL = config.external.protocol;
		env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = resolveSignalEndpoint(config.external.endpoint, 'metrics', config.external.protocol);
		env.OTEL_EXPORTER_OTLP_METRICS_PROTOCOL = config.external.protocol;
		if (config.external.headers && Object.keys(config.external.headers).length > 0) {
			env.OTEL_EXPORTER_OTLP_HEADERS = Object.entries(config.external.headers).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join(',');
		}
	}
	if (traceContext) {
		env.TRACEPARENT = traceContext.traceparent;
		if (traceContext.tracestate) {
			env.TRACESTATE = traceContext.tracestate;
		}
	}
	return env;
}

function serializeResourceAttributes(attributes: Readonly<Record<string, string>>): string {
	return Object.entries(attributes).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join(',');
}

function resolveSignalEndpoint(endpoint: string, signal: 'logs' | 'metrics', protocol: 'http/json' | 'http/protobuf' | 'grpc'): string {
	if (protocol === 'grpc') {
		return endpoint;
	}
	try {
		const url = new URL(endpoint);
		if (url.pathname === '' || url.pathname === '/') {
			url.pathname = `/v1/${signal}`;
		} else if (url.pathname.endsWith('/v1/traces')) {
			url.pathname = `${url.pathname.slice(0, -'/v1/traces'.length)}/v1/${signal}`;
		}
		return url.toString().replace(/\/$/, '');
	} catch {
		return endpoint;
	}
}

export function buildSubprocessEnv(proxied: boolean = true): Record<string, string | undefined> {
	// Proxy mode: a sparse env (creds arrive via settings.env), and the user's
	// personal ANTHROPIC_API_KEY must not leak to the Copilot proxy.
	// Native mode: inherit the real env so the user's own credentials + PATH
	// reach the subprocess (replace semantics wipe anything not present here).
	const env: Record<string, string | undefined> = proxied
		? {
			ELECTRON_RUN_AS_NODE: '1',
			NODE_OPTIONS: undefined,
			ANTHROPIC_API_KEY: undefined,
			HOME: process.env['HOME'],
			USERPROFILE: process.env['USERPROFILE'],
			// Load rules from additional directories https://code.claude.com/docs/en/memory#load-from-additional-directories
			CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1'
		}
		: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: undefined };
	// Replace semantics mean the sparse (proxied) env would otherwise drop the
	// agent host's own marker, so set it in both modes. See `AiAgentEnvVar`.
	env[AiAgentEnvVar] = AiAgentEnvValue;
	for (const key of Object.keys(process.env)) {
		if (key === 'ELECTRON_RUN_AS_NODE') { continue; }
		if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
			env[key] = undefined;
		}
	}
	return env;
}
