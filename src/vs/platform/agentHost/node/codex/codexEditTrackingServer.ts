/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IncomingMessage, ServerResponse } from 'http';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { isObject } from '../../../../base/common/types.js';
import { ILogService } from '../../../log/common/log.js';
import { LoopbackProxyServer, readProxyRequestBody, type ILoopbackProxyHandle, type ILoopbackProxyRuntime } from '../shared/loopbackProxyServer.js';
import type { HookMetadata } from './protocol/generated/v2/HookMetadata.js';
import type { JsonValue } from './protocol/generated/serde_json/JsonValue.js';

export const CODEX_EDIT_TRACKING_SERVER_NAME = 'vscode_edit_tracking';
/** Matches Codex's default `*TOKEN*` shell-environment exclusion so model-run commands do not inherit it. */
const tokenEnvVar = 'VSCODE_CODEX_EDIT_TRACKING_TOKEN';
const snapshotTool = 'snapshot';
const editToolMatcher = '^(apply_patch|Bash)$';

export interface ICodexEditTrackingHook {
	readonly phase: 'pre' | 'post';
	readonly threadId: string;
	readonly turnId: string;
	readonly toolCallId: string;
	readonly cwd: string;
	readonly model: string;
	readonly patch: string;
	readonly toolName: 'apply_patch' | 'Bash';
}

/** Identifies only the host-authored launch hooks, never project or user hook definitions. */
export function isCodexEditTrackingHook(hook: HookMetadata): boolean {
	return hook.source === 'sessionFlags' && hook.sourcePath.replace(/\\/g, '/').endsWith('/<session-flags>/config.toml')
		&& hook.handlerType === 'mcpTool' && hook.server === CODEX_EDIT_TRACKING_SERVER_NAME && hook.tool === snapshotTool
		&& hook.matcher === editToolMatcher
		&& (hook.eventName === 'preToolUse' || hook.eventName === 'postToolUse');
}

function editTrackingServerConfig(handle: ILoopbackProxyHandle) {
	return { url: `${handle.baseUrl}/mcp`, bearer_token_env_var: tokenEnvVar };
}

/**
 * Adds a private, unlisted MCP callback and synchronous tool hooks without changing user files.
 * The credential travels through the environment, like the model proxy's, so it is not visible in argv.
 */
export function codexEditTrackingLaunch(handle: ILoopbackProxyHandle): { readonly args: string[]; readonly env: Record<string, string> } {
	const server = editTrackingServerConfig(handle);
	const hook = (phase: 'pre' | 'post') => {
		const input = {
			phase, threadId: '${session_id}', turnId: '${turn_id}', toolCallId: '${tool_use_id}',
			cwd: '${cwd}', model: '${model}', patch: '${tool_input.command}', toolName: '${tool_name}',
		};
		const fields = Object.entries(input).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join(', ');
		return `[{ matcher = "${editToolMatcher}", hooks = [{ type = "mcp_tool", server = "${CODEX_EDIT_TRACKING_SERVER_NAME}", tool = "${snapshotTool}", timeout = 30, input = { ${fields} } }] }]`;
	};
	return {
		args: [
			'-c', `mcp_servers.${CODEX_EDIT_TRACKING_SERVER_NAME}={ url = ${JSON.stringify(server.url)}, bearer_token_env_var = ${JSON.stringify(server.bearer_token_env_var)} }`,
			'-c', `hooks.PreToolUse=${hook('pre')}`,
			'-c', `hooks.PostToolUse=${hook('post')}`,
		],
		env: { [tokenEnvVar]: handle.nonce },
	};
}

/** Retains the internal callback when a thread replaces its MCP configuration. */
export function applyCodexEditTrackingConfig(config: Record<string, JsonValue | undefined>, handle: ILoopbackProxyHandle | undefined): void {
	if (handle) {
		const server = editTrackingServerConfig(handle);
		const servers = config.mcp_servers;
		if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
			config.mcp_servers = { ...servers, [CODEX_EDIT_TRACKING_SERVER_NAME]: server };
		} else {
			config[`mcp_servers.${CODEX_EDIT_TRACKING_SERVER_NAME}`] = server;
		}
	}
}

function isHookInput(value: unknown): value is ICodexEditTrackingHook {
	return isObject(value) && 'phase' in value && 'threadId' in value && 'turnId' in value
		&& 'toolCallId' in value && 'cwd' in value && 'model' in value && 'patch' in value && 'toolName' in value
		&& (value.phase === 'pre' || value.phase === 'post')
		&& (value.toolName === 'apply_patch' || value.toolName === 'Bash')
		&& [value.threadId, value.turnId, value.toolCallId, value.cwd, value.model, value.patch].every(field => typeof field === 'string' && field.length > 0);
}

function isMcpMessage(value: unknown): value is { method: string; id?: string | number; params?: Record<string, unknown> } {
	return isObject(value) && 'method' in value && typeof value.method === 'string'
		&& (!('id' in value) || typeof value.id === 'string' || typeof value.id === 'number')
		&& (!('params' in value) || isObject(value.params));
}

/** Authenticated loopback transport for awaited Codex snapshots; its tool is not exposed to the model. */
export class CodexEditTrackingServer extends LoopbackProxyServer<void> {
	constructor(
		private readonly _onHook: (input: ICodexEditTrackingHook) => Promise<void>,
		@ILogService logService: ILogService,
	) {
		super('CodexEditTracking', logService);
	}

	protected createState(): void { }

	async start(): Promise<ILoopbackProxyHandle> {
		const { runtime, release } = await this.acquire();
		return { baseUrl: runtime.baseUrl, nonce: runtime.nonce, dispose: release };
	}

	protected async handleRequest(req: IncomingMessage, res: ServerResponse, runtime: ILoopbackProxyRuntime<void>): Promise<void> {
		if (req.headers.origin || req.headers.authorization !== `Bearer ${runtime.nonce}`) {
			res.writeHead(403).end();
			return;
		}
		if (req.method !== 'POST' || req.url !== '/mcp') {
			res.writeHead(405).end();
			return;
		}
		let message: unknown;
		try {
			message = JSON.parse(await readProxyRequestBody(req));
		} catch (error) {
			this._logService.warn('[CodexEditTracking] Invalid request', error);
			res.writeHead(400).end();
			return;
		}
		if (!isMcpMessage(message)) {
			res.writeHead(400).end();
			return;
		}
		if (message.id === undefined) {
			res.writeHead(202).end();
			return;
		}
		const reply = (result: object) => {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
		};
		if (message.method === 'initialize') {
			reply({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: CODEX_EDIT_TRACKING_SERVER_NAME, version: '1.0.0' } });
		} else if (message.method === 'tools/list') {
			reply({ tools: [] });
		} else if (message.method === 'resources/list') {
			reply({ resources: [] });
		} else if (message.method === 'resources/templates/list') {
			reply({ resourceTemplates: [] });
		} else if (message.method === 'tools/call' && message.params?.name === snapshotTool && isHookInput(message.params.arguments)) {
			try {
				await this._onHook(message.params.arguments);
				reply({ content: [{ type: 'text', text: '{}' }] });
			} catch (error) {
				this._logService.warn('[CodexEditTracking] Snapshot hook failed', error);
				reply({ content: [{ type: 'text', text: getErrorMessage(error) }], isError: true });
			}
		} else {
			this._logService.warn(`[CodexEditTracking] Unsupported request: ${message.method}`);
			res.writeHead(400).end();
		}
	}
}
