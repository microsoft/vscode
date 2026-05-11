/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { JsonRpcMessage } from '../../../../../base/common/jsonRpcProtocol.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogger } from '../../../../log/common/log.js';
import { McpServerType, type IMcpRemoteServerConfiguration } from '../../../../mcp/common/mcpPlatformTypes.js';
import { McpAuthRequiredReason, McpServerStatusKind } from '../../../common/state/protocol/state.js';
import { McpHttpUpstream, type HttpFetch, type IHttpResponse } from '../../../node/mcpHost/mcpHttpUpstream.js';

interface IFetchCall {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
}

interface IFetchResponseSpec {
	status: number;
	headers?: Record<string, string>;
	body?: string;
	throw?: Error;
}

function makeResponse(spec: IFetchResponseSpec): IHttpResponse {
	const headers = spec.headers ?? {};
	return {
		status: spec.status,
		headers: {
			get(name: string): string | null {
				const lower = name.toLowerCase();
				for (const [k, v] of Object.entries(headers)) {
					if (k.toLowerCase() === lower) {
						return v;
					}
				}
				return null;
			},
		},
		text: async () => spec.body ?? '',
	};
}

function makeFetch(responses: (IFetchResponseSpec | ((url: string) => IFetchResponseSpec))[]): { fetch: HttpFetch; calls: IFetchCall[] } {
	const calls: IFetchCall[] = [];
	let i = 0;
	const fetch: HttpFetch = async (url, init) => {
		calls.push({ url, method: init.method, headers: { ...init.headers }, body: init.body });
		const next = responses[i++];
		if (!next) {
			throw new Error(`unexpected fetch call to ${url}`);
		}
		const spec = typeof next === 'function' ? next(url) : next;
		if (spec.throw) {
			throw spec.throw;
		}
		return makeResponse(spec);
	};
	return { fetch, calls };
}

interface IRecordedLog {
	level: 'info' | 'warn' | 'error';
	message: string;
}

class RecordingLogger extends NullLogger {
	public readonly records: IRecordedLog[] = [];
	override info(message: string): void { this.records.push({ level: 'info', message }); }
	override warn(message: string): void { this.records.push({ level: 'warn', message }); }
	override error(message: string | Error): void {
		this.records.push({ level: 'error', message: message instanceof Error ? message.message : message });
	}
}

const baseConfig: IMcpRemoteServerConfiguration = {
	type: McpServerType.REMOTE,
	url: 'https://mcp.example.com/v1',
};

suite('McpHttpUpstream', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('start() posts initialize probe with content-type and config headers, transitions to Ready on 2xx', async () => {
		const { fetch, calls } = makeFetch([{ status: 200 }]);
		const config: IMcpRemoteServerConfiguration = { ...baseConfig, headers: { 'X-Custom': 'val' } };
		const upstream = new McpHttpUpstream({ config, logger: new NullLogger(), fetch });
		try {
			const status = await upstream.start();
			const body = calls[0].body ? JSON.parse(calls[0].body) : undefined;
			assert.deepStrictEqual({
				status,
				callCount: calls.length,
				url: calls[0].url,
				method: calls[0].method,
				contentType: calls[0].headers['Content-Type'],
				custom: calls[0].headers['X-Custom'],
				bodyMethod: body?.method,
				bodyId: body?.id,
				hasAuth: calls[0].headers.hasOwnProperty('Authorization'),
			}, {
				status: { kind: McpServerStatusKind.Ready },
				callCount: 1,
				url: 'https://mcp.example.com/v1',
				method: 'POST',
				contentType: 'application/json',
				custom: 'val',
				bodyMethod: 'initialize',
				bodyId: 0,
				hasAuth: false,
			});
		} finally {
			upstream.dispose();
		}
	});

	test('401 with resource_metadata fetches it and emits AuthRequired (Required, no prior token)', async () => {
		const metadata = { resource: 'https://mcp.example.com/v1', authorization_servers: ['https://auth.example.com'] };
		const { fetch, calls } = makeFetch([
			{
				status: 401,
				headers: { 'WWW-Authenticate': 'Bearer error="invalid_token", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"' },
			},
			{
				status: 200,
				body: JSON.stringify(metadata),
			},
		]);
		const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
		try {
			const status = await upstream.start();
			assert.deepStrictEqual({
				status,
				secondCallUrl: calls[1]?.url,
				secondCallMethod: calls[1]?.method,
			}, {
				status: {
					kind: McpServerStatusKind.AuthRequired,
					reason: McpAuthRequiredReason.Required,
					resource: metadata,
				},
				secondCallUrl: 'https://mcp.example.com/.well-known/oauth-protected-resource',
				secondCallMethod: 'GET',
			});
		} finally {
			upstream.dispose();
		}
	});

	test('401 after a prior setBearerToken yields AuthRequired (Expired)', async () => {
		const metadata = { resource: 'https://mcp.example.com/v1', authorization_servers: ['https://auth.example.com'] };
		const { fetch } = makeFetch([
			{
				status: 401,
				headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.example.com/.well-known/m"' },
			},
			{ status: 200, body: JSON.stringify(metadata) },
		]);
		const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
		try {
			upstream.setBearerToken('prior-token');
			const status = await upstream.start();
			assert.strictEqual(status.kind, McpServerStatusKind.AuthRequired);
			assert.strictEqual(status.kind === McpServerStatusKind.AuthRequired && status.reason, McpAuthRequiredReason.Expired);
		} finally {
			upstream.dispose();
		}
	});

	test('reclassifies as Required after token is cleared', async () => {
		const metadata = { resource: 'https://mcp.example.com/v1', authorization_servers: ['https://auth.example.com'] };
		const { fetch } = makeFetch([
			// First start: token 't1' present, server replies 401 → Expired
			{
				status: 401,
				headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.example.com/.well-known/m"' },
			},
			{ status: 200, body: JSON.stringify(metadata) },
			// Second start (after token cleared): another 401 → Required
			{
				status: 401,
				headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.example.com/.well-known/m"' },
			},
			{ status: 200, body: JSON.stringify(metadata) },
		]);
		const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
		try {
			upstream.setBearerToken('t1');
			const first = await upstream.start();
			assert.strictEqual(first.kind === McpServerStatusKind.AuthRequired && first.reason, McpAuthRequiredReason.Expired);

			upstream.setBearerToken(undefined);
			const second = await upstream.start();
			assert.strictEqual(second.kind === McpServerStatusKind.AuthRequired && second.reason, McpAuthRequiredReason.Required);
		} finally {
			upstream.dispose();
		}
	});

	test('rejects resource_metadata with a different origin', async () => {
		const { fetch, calls } = makeFetch([
			{
				status: 401,
				headers: { 'WWW-Authenticate': 'Bearer resource_metadata="http://169.254.169.254/latest/meta-data/"' },
			},
		]);
		const logger = new RecordingLogger();
		const upstream = new McpHttpUpstream({ config: baseConfig, logger, fetch });
		try {
			const status = await upstream.start();
			assert.deepStrictEqual({
				status,
				callCount: calls.length,
				warned: logger.records.some(r => r.level === 'warn' && /resource_metadata/i.test(r.message)),
			}, {
				status: {
					kind: McpServerStatusKind.AuthRequired,
					reason: McpAuthRequiredReason.Required,
					resource: { resource: 'https://mcp.example.com/v1' },
				},
				callCount: 1,
				warned: true,
			});
		} finally {
			upstream.dispose();
		}
	});

	test('rejects resource_metadata with a different scheme', async () => {
		const { fetch, calls } = makeFetch([
			{
				status: 401,
				headers: { 'WWW-Authenticate': 'Bearer resource_metadata="http://mcp.example.com/.well-known/oauth-protected-resource"' },
			},
		]);
		const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
		try {
			const status = await upstream.start();
			assert.deepStrictEqual({
				status,
				callCount: calls.length,
			}, {
				status: {
					kind: McpServerStatusKind.AuthRequired,
					reason: McpAuthRequiredReason.Required,
					resource: { resource: 'https://mcp.example.com/v1' },
				},
				callCount: 1,
			});
		} finally {
			upstream.dispose();
		}
	});

	test('rejects file:/javascript:/data: schemes outright', async () => {
		for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:application/json,{}']) {
			const { fetch, calls } = makeFetch([
				{
					status: 401,
					headers: { 'WWW-Authenticate': `Bearer resource_metadata="${url}"` },
				},
			]);
			const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
			try {
				const status = await upstream.start();
				assert.deepStrictEqual({
					url,
					kind: status.kind,
					resource: status.kind === McpServerStatusKind.AuthRequired ? status.resource : undefined,
					callCount: calls.length,
				}, {
					url,
					kind: McpServerStatusKind.AuthRequired,
					resource: { resource: 'https://mcp.example.com/v1' },
					callCount: 1,
				});
			} finally {
				upstream.dispose();
			}
		}
	});

	test('accepts resource_metadata at the same origin', async () => {
		const metadata = { resource: 'https://mcp.example.com/v1', authorization_servers: ['https://auth.example.com'] };
		const { fetch, calls } = makeFetch([
			{
				status: 401,
				headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"' },
			},
			{ status: 200, body: JSON.stringify(metadata) },
		]);
		const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
		try {
			const status = await upstream.start();
			assert.deepStrictEqual({
				kind: status.kind,
				resource: status.kind === McpServerStatusKind.AuthRequired ? status.resource : undefined,
				secondCallUrl: calls[1]?.url,
			}, {
				kind: McpServerStatusKind.AuthRequired,
				resource: metadata,
				secondCallUrl: 'https://mcp.example.com/.well-known/oauth-protected-resource',
			});
		} finally {
			upstream.dispose();
		}
	});

	test('403 with insufficient_scope yields AuthRequired (InsufficientScope)', async () => {
		const metadata = { resource: 'https://mcp.example.com/v1' };
		const { fetch } = makeFetch([
			{
				status: 403,
				headers: { 'WWW-Authenticate': 'Bearer error="insufficient_scope", scope="admin", resource_metadata="https://mcp.example.com/.well-known/m"' },
			},
			{ status: 200, body: JSON.stringify(metadata) },
		]);
		const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
		try {
			const status = await upstream.start();
			assert.strictEqual(status.kind, McpServerStatusKind.AuthRequired);
			if (status.kind === McpServerStatusKind.AuthRequired) {
				assert.strictEqual(status.reason, McpAuthRequiredReason.InsufficientScope);
				assert.deepStrictEqual(status.requiredScopes, ['admin']);
			}
		} finally {
			upstream.dispose();
		}
	});

	test('after setBearerToken, retried start() sends Authorization header', async () => {
		const { fetch, calls } = makeFetch([
			{ status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
			{ status: 200 },
		]);
		const logger = new RecordingLogger();
		const upstream = new McpHttpUpstream({ config: baseConfig, logger, fetch });
		try {
			await upstream.start();
			upstream.setBearerToken('shiny-token');
			const status = await upstream.start();
			assert.deepStrictEqual({
				firstAuth: calls[0].headers.hasOwnProperty('Authorization'),
				secondAuth: calls[1].headers['Authorization'],
				status,
			}, {
				firstAuth: false,
				secondAuth: 'Bearer shiny-token',
				status: { kind: McpServerStatusKind.Ready },
			});
		} finally {
			upstream.dispose();
		}
	});

	test('send() rejects when not Ready', async () => {
		const { fetch } = makeFetch([]);
		const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
		try {
			await assert.rejects(
				upstream.send({ jsonrpc: '2.0', id: 1, method: 'ping' }),
				/cannot send while in state 'stopped'/,
			);
		} finally {
			upstream.dispose();
		}
	});

	test('send() consumes text/event-stream responses and emits one onMessage per JSON-RPC event', async () => {
		// Encode two SSE `message` events whose data fields are JSON-RPC payloads.
		const sseBytes = new TextEncoder().encode([
			'event: message',
			`data: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } })}`,
			'',
			'event: message',
			`data: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { value: 42 } })}`,
			'',
			'',
		].join('\n'));

		// Probe response: one-shot JSON, transitions to Ready.
		// Send response: SSE stream with the two events above.
		const responses: ((url: string) => IFetchResponseSpec)[] = [
			() => ({ status: 200 }),
			() => ({ status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
		];
		let i = 0;
		const calls: IFetchCall[] = [];
		const fetch: HttpFetch = async (url, init) => {
			calls.push({ url, method: init.method, headers: { ...init.headers }, body: init.body });
			const spec = responses[i++](url);
			const base = makeResponse(spec);
			if (i === 2) {
				// Attach a real ReadableStream as the response body for the SSE branch.
				return {
					...base,
					body: new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(sseBytes);
							controller.close();
						},
					}),
				};
			}
			return base;
		};

		const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
		const received: JsonRpcMessage[] = [];
		const sub = upstream.onMessage(m => received.push(m));
		try {
			const startStatus = await upstream.start();
			assert.strictEqual(startStatus.kind, McpServerStatusKind.Ready);
			await upstream.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
			assert.deepStrictEqual(received, [
				{ jsonrpc: '2.0', id: 1, result: { ok: true } },
				{ jsonrpc: '2.0', method: 'notifications/progress', params: { value: 42 } },
			]);
		} finally {
			sub.dispose();
			upstream.dispose();
		}
	});

	test('network error transitions to Error', async () => {
		const { fetch } = makeFetch([{ status: 0, throw: new Error('ECONNREFUSED') }]);
		const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
		try {
			const status = await upstream.start();
			assert.strictEqual(status.kind, McpServerStatusKind.Error);
			if (status.kind === McpServerStatusKind.Error) {
				assert.strictEqual(status.error.errorType, 'httpError');
				assert.match(status.error.message, /ECONNREFUSED/);
			}
		} finally {
			upstream.dispose();
		}
	});

	test('401 without resource_metadata synthesizes minimal metadata and warns', async () => {
		const { fetch, calls } = makeFetch([
			{ status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } },
		]);
		const logger = new RecordingLogger();
		const upstream = new McpHttpUpstream({ config: baseConfig, logger, fetch });
		try {
			const status = await upstream.start();
			assert.deepStrictEqual({
				status,
				callCount: calls.length,
				warned: logger.records.some(r => r.level === 'warn' && /resource_metadata/.test(r.message)),
			}, {
				status: {
					kind: McpServerStatusKind.AuthRequired,
					reason: McpAuthRequiredReason.Required,
					resource: { resource: 'https://mcp.example.com/v1' },
				},
				callCount: 1,
				warned: true,
			});
		} finally {
			upstream.dispose();
		}
	});

	test('send() on 401 mid-session transitions to AuthRequired and throws', async () => {
		const metadata = { resource: 'https://mcp.example.com/v1', authorization_servers: ['https://auth.example.com'] };
		const { fetch } = makeFetch([
			{ status: 200 },
			{
				status: 401,
				headers: { 'WWW-Authenticate': 'Bearer error="invalid_token", resource_metadata="https://mcp.example.com/.well-known/m"' },
			},
			{ status: 200, body: JSON.stringify(metadata) },
		]);
		const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
		try {
			await upstream.start();
			await assert.rejects(
				upstream.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
				/AuthRequired/,
			);
			assert.deepStrictEqual(upstream.status.get(), {
				kind: McpServerStatusKind.AuthRequired,
				reason: McpAuthRequiredReason.Required,
				resource: metadata,
			});
		} finally {
			upstream.dispose();
		}
	});

	test('send() on 401 after a prior token transitions to AuthRequired (Expired)', async () => {
		const metadata = { resource: 'https://mcp.example.com/v1', authorization_servers: ['https://auth.example.com'] };
		const { fetch } = makeFetch([
			{ status: 200 },
			{
				status: 401,
				headers: { 'WWW-Authenticate': 'Bearer error="invalid_token", resource_metadata="https://mcp.example.com/.well-known/m"' },
			},
			{ status: 200, body: JSON.stringify(metadata) },
		]);
		const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
		try {
			await upstream.start();
			upstream.setBearerToken('tok');
			await assert.rejects(upstream.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
			const status = upstream.status.get();
			assert.strictEqual(status.kind, McpServerStatusKind.AuthRequired);
			if (status.kind === McpServerStatusKind.AuthRequired) {
				assert.strictEqual(status.reason, McpAuthRequiredReason.Expired);
			}
		} finally {
			upstream.dispose();
		}
	});

	test('send() on 403 insufficient_scope transitions to AuthRequired (InsufficientScope)', async () => {
		const { fetch } = makeFetch([
			{ status: 200 },
			{
				status: 403,
				headers: { 'WWW-Authenticate': 'Bearer error="insufficient_scope", scope="admin"' },
			},
		]);
		const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
		try {
			await upstream.start();
			await assert.rejects(upstream.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
			const status = upstream.status.get();
			assert.strictEqual(status.kind, McpServerStatusKind.AuthRequired);
			if (status.kind === McpServerStatusKind.AuthRequired) {
				assert.strictEqual(status.reason, McpAuthRequiredReason.InsufficientScope);
				assert.deepStrictEqual(status.requiredScopes, ['admin']);
			}
		} finally {
			upstream.dispose();
		}
	});

	test('dispose aborts all in-flight requests, not just the most recent', async () => {
		// First fetch resolves immediately to bring us to Ready; subsequent
		// send() fetches are deferred and never resolve until released.
		const signals: AbortSignal[] = [];
		let pendingResolve: (() => void) | undefined;
		const fetch: HttpFetch = async (url, init) => {
			if (init.method === 'POST' && init.body && JSON.parse(init.body).method === 'initialize') {
				return makeResponse({ status: 200 });
			}
			if (init.signal) {
				signals.push(init.signal);
			}
			// Never resolve; the AbortController abort will reject via abort listener.
			return new Promise<IHttpResponse>((_, reject) => {
				const onAbort = () => reject(new Error('aborted'));
				if (init.signal?.aborted) {
					onAbort();
				} else {
					init.signal?.addEventListener('abort', onAbort, { once: true });
				}
				pendingResolve = () => reject(new Error('test cleanup'));
			});
		};
		const upstream = new McpHttpUpstream({ config: baseConfig, logger: new NullLogger(), fetch });
		try {
			await upstream.start();
			const sends = [
				upstream.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).catch(() => 'rejected'),
				upstream.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).catch(() => 'rejected'),
				upstream.send({ jsonrpc: '2.0', id: 3, method: 'tools/list' }).catch(() => 'rejected'),
			];
			// Yield so the fetches register their AbortSignals.
			await new Promise(resolve => setTimeout(resolve, 0));
			upstream.dispose();
			await Promise.all(sends);
			assert.deepStrictEqual({
				count: signals.length,
				aborted: signals.map(s => s.aborted),
			}, {
				count: 3,
				aborted: [true, true, true],
			});
		} finally {
			pendingResolve?.();
			upstream.dispose();
		}
	});
});
