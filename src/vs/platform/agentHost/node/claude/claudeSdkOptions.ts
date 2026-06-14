/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpSdkServerConfigWithInstance, Options } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { delimiter, dirname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { rgDiskPath } from '../../../../base/node/ripgrep.js';
import { ClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { resolveClaudeEffort } from '../../common/claudeModelConfig.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';
import { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { buildClientToolMcpServer } from './clientTools/claudeClientToolMcpServer.js';
import { IClaudeProxyHandle } from './claudeProxyService.js';
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
	readonly model: ModelSelection | undefined;
	readonly abortController: AbortController;
	readonly permissionMode: ClaudePermissionMode;
	readonly canUseTool: NonNullable<Options['canUseTool']>;
	readonly isResume: boolean;
	readonly mcpServers: Record<string, McpSdkServerConfigWithInstance> | undefined;
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
	proxyHandle: IClaudeProxyHandle,
	logStderr: (data: string) => void,
	logElicitation: (msg: string) => void,
): Promise<Options> {
	const subprocessEnv = buildSubprocessEnv();
	const resolvedRgDiskPath = await rgDiskPath();
	const settingsEnv: Record<string, string> = {
		ANTHROPIC_BASE_URL: proxyHandle.baseUrl,
		ANTHROPIC_AUTH_TOKEN: `${proxyHandle.nonce}.${input.sessionId}`,
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
		USE_BUILTIN_RIPGREP: '0',
		PATH: `${dirname(resolvedRgDiskPath)}${delimiter}${process.env.PATH ?? ''}`,
	};

	return {
		cwd: input.workingDirectory.fsPath,
		executable: process.execPath as 'node',
		env: subprocessEnv,
		abortController: input.abortController,
		allowDangerouslySkipPermissions: true,
		canUseTool: input.canUseTool,
		onElicitation: async req => {
			logElicitation(req.message ?? '');
			return { action: 'cancel' };
		},
		disallowedTools: ['WebSearch'],
		includePartialMessages: true,
		forwardSubagentText: true,
		enableFileCheckpointing: true,
		model: input.model?.id,
		effort: resolveClaudeEffort(input.model),
		permissionMode: input.permissionMode,
		...(input.isResume
			? { resume: input.sessionId }
			: { sessionId: input.sessionId }),
		...(input.mcpServers ? { mcpServers: input.mcpServers } : {}),
		...(input.plugins && input.plugins.length > 0
			? { plugins: input.plugins.map(p => ({ type: 'local' as const, path: p.fsPath })) }
			: {}),
		...(input.agent ? { agent: input.agent } : {}),
		settingSources: ['user', 'project', 'local'],
		settings: { env: settingsEnv },
		systemPrompt: { type: 'preset', preset: 'claude_code' },
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
	const { tools } = toolDiff.consume();
	if (!tools || tools.length === 0) {
		return undefined;
	}
	const server = await buildClientToolMcpServer(tools, id => registry.register(id), sdkService);
	return { client: server };
}

/**
 * Build the {@link Options.env} payload for the Claude subprocess.
 *
 * The agent host runs in an Electron utility process; the spawn env
 * inherits the parent's env which contains `NODE_OPTIONS`,
 * `ELECTRON_*`, and `VSCODE_*` variables that break the Claude
 * subprocess (it's a plain Node script driven by Electron's
 * `process.execPath` + `ELECTRON_RUN_AS_NODE`). Strip them via
 * {@link Options.env} `undefined` semantics (sdk.d.ts:1075-1078:
 * "Set a key to `undefined` to remove an inherited variable").
 *
 * Mirror of CopilotAgent's strip pattern at copilotAgent.ts:434-450.
 *
 * Exported for unit testing as a pure function over `process.env`.
 */
export function buildSubprocessEnv(): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = {
		ELECTRON_RUN_AS_NODE: '1',
		NODE_OPTIONS: undefined,
		ANTHROPIC_API_KEY: undefined,
	};
	for (const key of Object.keys(process.env)) {
		if (key === 'ELECTRON_RUN_AS_NODE') { continue; }
		if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
			env[key] = undefined;
		}
	}
	return env;
}
