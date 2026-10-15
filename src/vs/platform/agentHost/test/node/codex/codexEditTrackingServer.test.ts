/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { CodexEditTrackingServer, applyCodexEditTrackingConfig, codexEditTrackingLaunch, isCodexEditTrackingHook } from '../../../node/codex/codexEditTrackingServer.js';
import type { JsonValue } from '../../../node/codex/protocol/generated/serde_json/JsonValue.js';
import type { HookMetadata } from '../../../node/codex/protocol/generated/v2/HookMetadata.js';

suite('CodexEditTrackingServer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function post(url: string, token: string, body: object, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
		const { request } = await import('http');
		return new Promise((resolve, reject) => {
			const req = request(`${url}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers } }, res => {
				let body = '';
				res.setEncoding('utf8');
				res.on('data', chunk => { body += chunk; });
				res.on('end', () => resolve({ status: res.statusCode!, body }));
			});
			req.on('error', reject);
			req.end(JSON.stringify(body));
		});
	}

	test('requires the per-process credential and rejects browser origins', async () => {
		const server = store.add(new CodexEditTrackingServer(async () => { throw new Error('must not run'); }, new NullLogService()));
		const handle = store.add(await server.start());
		const body = { id: 1, method: 'tools/list' };
		const responses = await Promise.all([
			post(handle.baseUrl, 'wrong', body),
			post(handle.baseUrl, handle.nonce, body, { Origin: 'http://example.com' }),
			post(handle.baseUrl, handle.nonce, body),
		]);
		assert.deepStrictEqual(responses.map(response => response.status), [403, 403, 200]);
		assert.deepStrictEqual(JSON.parse(responses[2].body), { jsonrpc: '2.0', id: 1, result: { tools: [] } });
	});

	test('awaits the snapshot callback before acknowledging the hook', async () => {
		const entered = new DeferredPromise<void>();
		const barrier = new DeferredPromise<void>();
		const server = store.add(new CodexEditTrackingServer(async () => { await entered.complete(); await barrier.p; }, new NullLogService()));
		const handle = store.add(await server.start());
		let acknowledged = false;
		const response = post(handle.baseUrl, handle.nonce, {
			id: 1, method: 'tools/call',
			params: { name: 'snapshot', arguments: { phase: 'pre', toolName: 'apply_patch', threadId: 'thread', turnId: 'turn', toolCallId: 'tool', cwd: '/repo', model: 'model', patch: 'patch' } },
		}).then(result => { acknowledged = true; return result; });
		await entered.p;
		assert.strictEqual(acknowledged, false);
		await barrier.complete();
		assert.deepStrictEqual(JSON.parse((await response).body), { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{}' }] } });
	});

	test('rejects malformed tool arguments and exposes snapshot failures', async () => {
		const server = store.add(new CodexEditTrackingServer(async () => { throw new Error('snapshot failed'); }, new NullLogService()));
		const handle = store.add(await server.start());
		const invalid = await post(handle.baseUrl, handle.nonce, { id: 1, method: 'tools/call', params: { name: 'snapshot', arguments: { phase: 'pre' } } });
		const failed = await post(handle.baseUrl, handle.nonce, {
			id: 2, method: 'tools/call',
			params: { name: 'snapshot', arguments: { phase: 'post', toolName: 'apply_patch', threadId: 'thread', turnId: 'turn', toolCallId: 'tool', cwd: '/repo', model: 'model', patch: 'patch' } },
		});
		assert.deepStrictEqual({ invalid: invalid.status, failed: JSON.parse(failed.body).result }, {
			invalid: 400, failed: { content: [{ type: 'text', text: 'snapshot failed' }], isError: true },
		});
	});

	test('retains the snapshot callback alongside per-thread user MCP servers', () => {
		const config: Record<string, JsonValue> = { mcp_servers: { user: { command: 'user-server' } } };
		applyCodexEditTrackingConfig(config, { baseUrl: 'http://127.0.0.1:1234', nonce: 'nonce', dispose: () => { } });
		assert.deepStrictEqual(config, {
			mcp_servers: {
				user: { command: 'user-server' },
				vscode_edit_tracking: { url: 'http://127.0.0.1:1234/mcp', bearer_token_env_var: 'VSCODE_CODEX_EDIT_TRACKING_TOKEN' },
			},
		});
	});

	test('grants only host-authored hooks and supplies scoped launch arguments', () => {
		const hook: HookMetadata = {
			key: 'internal', eventName: 'preToolUse', handlerType: 'mcpTool', server: 'vscode_edit_tracking', tool: 'snapshot',
			matcher: '^(apply_patch|Bash)$', sourcePath: '/<session-flags>/config.toml', source: 'sessionFlags', pluginId: null,
			timeoutSec: 30n, statusMessage: null, additionalContextLimit: null, displayOrder: 0n,
			enabled: true, isManaged: false, currentHash: 'hash', trustStatus: 'untrusted',
		};
		assert.deepStrictEqual([
			isCodexEditTrackingHook(hook),
			isCodexEditTrackingHook({ ...hook, sourcePath: '/repo/.codex/hooks.json', source: 'project' }),
			isCodexEditTrackingHook({ ...hook, source: 'user' }),
			isCodexEditTrackingHook({ ...hook, tool: 'other' }),
		], [true, false, false, false]);
		const launch = codexEditTrackingLaunch({ baseUrl: 'http://127.0.0.1:1234', nonce: 'secret-nonce', dispose: () => { } });
		assert.deepStrictEqual({
			env: launch.env,
			credentialInArgs: launch.args.some(arg => arg.includes('secret-nonce')),
			server: launch.args.some(arg => arg.includes('bearer_token_env_var = "VSCODE_CODEX_EDIT_TRACKING_TOKEN"')),
			preHook: launch.args.some(arg => arg.includes('hooks.PreToolUse=') && arg.includes('${tool_input.command}')),
			postHook: launch.args.some(arg => arg.includes('hooks.PostToolUse=')),
		}, { env: { VSCODE_CODEX_EDIT_TRACKING_TOKEN: 'secret-nonce' }, credentialInArgs: false, server: true, preHook: true, postHook: true });
	});
});
