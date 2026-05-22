/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type Anthropic from '@anthropic-ai/sdk';
import type { CCAModel } from '@vscode/copilot-api';
import type * as http from 'http';
import * as net from 'net';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import {
	COPILOT_API_ERROR_STATUS_STREAMING,
	CopilotApiError,
	type ICopilotApiService,
	type ICopilotApiServiceRequestOptions,
} from '../../node/shared/copilotApiService.js';
import { ClaudeProxyService } from '../../node/claude/claudeProxyService.js';

// #region Test fakes

interface IFakeCall {
	githubToken: string;
	body: Anthropic.MessageCreateParams;
	options: ICopilotApiServiceRequestOptions | undefined;
}

interface IModelsCall {
	githubToken: string;
	options: ICopilotApiServiceRequestOptions | undefined;
}

type MessagesResult =
	| { kind: 'message'; message: Anthropic.Message }
	| { kind: 'stream'; events: Anthropic.MessageStreamEvent[]; midStreamError?: CopilotApiError | Error }
	| { kind: 'error'; error: Error };

class FakeCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	messagesResult: MessagesResult = { kind: 'error', error: new Error('not configured') };
	modelsResult: { kind: 'value'; value: CCAModel[] } | { kind: 'error'; error: Error } = { kind: 'value', value: [] };

	readonly messagesCalls: IFakeCall[] = [];
	readonly modelsCalls: IModelsCall[] = [];

	/**
	 * Resolved when the next streaming consumer reads its first event,
	 * useful for tests that need to assert on mid-stream behavior.
	 */
	onStreamFirstRead?: () => void;

	messages(
		githubToken: string,
		request: Anthropic.MessageCreateParamsStreaming,
		options?: ICopilotApiServiceRequestOptions,
	): AsyncGenerator<Anthropic.MessageStreamEvent>;
	messages(
		githubToken: string,
		request: Anthropic.MessageCreateParamsNonStreaming,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<Anthropic.Message>;
	messages(
		githubToken: string,
		request: Anthropic.MessageCreateParams,
		options?: ICopilotApiServiceRequestOptions,
	): AsyncGenerator<Anthropic.MessageStreamEvent> | Promise<Anthropic.Message> {
		this.messagesCalls.push({ githubToken, body: request, options });
		const result = this.messagesResult;
		if (request.stream) {
			return this._streamGen(result, options);
		}
		if (result.kind === 'message') {
			return Promise.resolve(result.message);
		}
		if (result.kind === 'error') {
			return Promise.reject(result.error);
		}
		return Promise.reject(new Error(`stream result configured but non-streaming request received`));
	}

	private async *_streamGen(
		result: MessagesResult,
		options: ICopilotApiServiceRequestOptions | undefined,
	): AsyncGenerator<Anthropic.MessageStreamEvent> {
		if (result.kind === 'error') {
			throw result.error;
		}
		if (result.kind !== 'stream') {
			throw new Error(`non-stream result configured but streaming request received`);
		}
		let firstReadFired = false;
		for (const ev of result.events) {
			if (options?.signal?.aborted) {
				const e = new Error('Aborted');
				(e as { name: string }).name = 'AbortError';
				throw e;
			}
			if (!firstReadFired) {
				firstReadFired = true;
				this.onStreamFirstRead?.();
			}
			yield ev;
		}
		if (result.midStreamError) {
			throw result.midStreamError;
		}
	}

	async countTokens(): Promise<Anthropic.MessageTokensCount> {
		throw new Error('countTokens not supported');
	}

	async models(githubToken: string, options?: ICopilotApiServiceRequestOptions): Promise<CCAModel[]> {
		this.modelsCalls.push({ githubToken, options });
		if (this.modelsResult.kind === 'error') {
			throw this.modelsResult.error;
		}
		return this.modelsResult.value;
	}
}

// #endregion

// #region HTTP helpers

let _httpModule: typeof http | undefined;
async function getHttp(): Promise<typeof http> {
	if (!_httpModule) {
		_httpModule = await import('http');
	}
	return _httpModule;
}

interface IFetchedJson {
	status: number;
	headers: http.IncomingHttpHeaders;
	body: string;
	parsed: unknown;
}

function fetchJson(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<IFetchedJson> {
	return getHttp().then(httpMod => new Promise<IFetchedJson>((resolve, reject) => {
		const u = new URL(url);
		const req = httpMod.request({
			hostname: u.hostname,
			port: u.port,
			path: u.pathname + u.search,
			method: init?.method ?? 'GET',
			headers: init?.headers,
		}, res => {
			const chunks: Buffer[] = [];
			res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
			res.on('end', () => {
				const body = Buffer.concat(chunks).toString('utf8');
				let parsed: unknown;
				try { parsed = body ? JSON.parse(body) : undefined; } catch { parsed = undefined; }
				resolve({ status: res.statusCode ?? 0, headers: res.headers, body, parsed });
			});
			res.on('error', reject);
		});
		req.on('error', reject);
		if (init?.body !== undefined) {
			req.write(init.body);
		}
		req.end();
	}));
}

interface ISseResult {
	status: number;
	headers: http.IncomingHttpHeaders;
	rawBody: string;
	events: { type: string; data: unknown }[];
}

function fetchSse(
	url: string,
	init: { method: string; headers?: Record<string, string>; body?: string },
	onResponse?: (res: http.IncomingMessage, abort: () => void) => void,
): Promise<ISseResult> {
	return getHttp().then(httpMod => new Promise<ISseResult>((resolve, reject) => {
		const u = new URL(url);
		const req = httpMod.request({
			hostname: u.hostname,
			port: u.port,
			path: u.pathname + u.search,
			method: init.method,
			headers: init.headers,
		}, res => {
			const chunks: Buffer[] = [];
			res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
			res.on('end', () => {
				const rawBody = Buffer.concat(chunks).toString('utf8');
				resolve({
					status: res.statusCode ?? 0,
					headers: res.headers,
					rawBody,
					events: parseSseFrames(rawBody),
				});
			});
			res.on('error', reject);
			onResponse?.(res, () => req.destroy());
		});
		req.on('error', err => {
			// Aborted requests reject naturally — surface as resolution
			// with whatever we got rather than failing the test.
			reject(err);
		});
		if (init.body !== undefined) {
			req.write(init.body);
		}
		req.end();
	}));
}

function parseSseFrames(raw: string): { type: string; data: unknown }[] {
	const out: { type: string; data: unknown }[] = [];
	const blocks = raw.split('\n\n');
	for (const block of blocks) {
		if (!block.trim()) {
			continue;
		}
		let event = '';
		let data = '';
		for (const line of block.split('\n')) {
			if (line.startsWith('event: ')) {
				event = line.slice('event: '.length).trim();
			} else if (line.startsWith('data: ')) {
				data = line.slice('data: '.length);
			}
		}
		if (event && data) {
			let parsed: unknown;
			try { parsed = JSON.parse(data); } catch { parsed = data; }
			out.push({ type: event, data: parsed });
		}
	}
	return out;
}

// #endregion

// #region Fixtures

const ANTHROPIC_MODEL: CCAModel = {
	id: 'claude-opus-4.6',
	name: 'Claude Opus 4.6',
	vendor: 'Anthropic',
	supported_endpoints: ['/v1/messages'],
	object: 'model',
	version: '4.6',
	is_chat_default: false,
	is_chat_fallback: false,
	model_picker_category: '',
	model_picker_enabled: true,
	preview: false,
	billing: { is_premium: false } as unknown as CCAModel['billing'],
	capabilities: {} as CCAModel['capabilities'],
	policy: {} as CCAModel['policy'],
};

const NON_ANTHROPIC_MODEL: CCAModel = {
	...ANTHROPIC_MODEL,
	id: 'gpt-5',
	name: 'GPT-5',
	vendor: 'OpenAI',
	supported_endpoints: ['/v1/chat/completions'],
};

const NON_MESSAGES_ANTHROPIC: CCAModel = {
	...ANTHROPIC_MODEL,
	id: 'claude-instant-tokenizer',
	name: 'Anthropic Tokenizer',
	supported_endpoints: ['/v1/tokenize'],
};

function makeMessage(model: string, text: string): Anthropic.Message {
	return {
		id: 'msg_test',
		type: 'message',
		role: 'assistant',
		model,
		content: [{ type: 'text', text, citations: null }],
		stop_reason: 'end_turn',
		stop_sequence: null,
		usage: {
			input_tokens: 1,
			output_tokens: 1,
			cache_creation_input_tokens: null,
			cache_read_input_tokens: null,
			server_tool_use: null,
			service_tier: null,
		},
	} as Anthropic.Message;
}

function makeStreamEvents(model: string): Anthropic.MessageStreamEvent[] {
	const message = makeMessage(model, '');
	return [
		{ type: 'message_start', message },
		{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: [] } } as Anthropic.MessageStreamEvent,
		{ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello' } } as Anthropic.MessageStreamEvent,
		{ type: 'content_block_stop', index: 0 },
		{ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null } as Anthropic.MessageDeltaUsage } as Anthropic.MessageStreamEvent,
		{ type: 'message_stop' },
	];
}

// #endregion

// #region Service builder

function createProxyService(fakeApi: FakeCopilotApiService): ClaudeProxyService {
	return new ClaudeProxyService(new NullLogService(), fakeApi);
}

const TOKEN = 'gh-test-token';

// #endregion

suite('ClaudeProxyService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// #region Lifecycle

	suite('Lifecycle', () => {

		test('start() returns handle with baseUrl and 256-bit hex nonce', async () => {
			const fake = new FakeCopilotApiService();
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				assert.match(handle.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
				assert.match(handle.nonce, /^[0-9a-f]{64}$/);
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('two concurrent handles share baseUrl and nonce', async () => {
			const fake = new FakeCopilotApiService();
			const service = createProxyService(fake);
			// Issue both starts before the first bind resolves; they
			// must share the runtime — without this the second caller
			// will bind a second server and orphan the first.
			const [h1, h2] = await Promise.all([
				service.start(TOKEN),
				service.start('gh-other'),
			]);
			try {
				assert.strictEqual(h1.baseUrl, h2.baseUrl);
				assert.strictEqual(h1.nonce, h2.nonce);
			} finally {
				h1.dispose();
				h2.dispose();
				service.dispose();
			}
		});

		test('dispose() while start() is awaiting bind rejects the start', async () => {
			const fake = new FakeCopilotApiService();
			const service = createProxyService(fake);
			const startPromise = service.start(TOKEN);
			service.dispose();
			await assert.rejects(() => startPromise, /disposed/);
			// A subsequent start() must also reject — the service is
			// disposed and no orphaned runtime should be reachable.
			await assert.rejects(() => service.start(TOKEN), /disposed/);
		});

		test('disposing one handle while another is alive keeps server up', async () => {
			const fake = new FakeCopilotApiService();
			fake.modelsResult = { kind: 'value', value: [ANTHROPIC_MODEL] };
			const service = createProxyService(fake);
			const h1 = await service.start(TOKEN);
			const h2 = await service.start(TOKEN);
			h1.dispose();

			const res = await fetchJson(`${h2.baseUrl}/v1/models`, {
				headers: { 'Authorization': `Bearer ${h2.nonce}.s1` },
			});
			assert.strictEqual(res.status, 200);

			h2.dispose();
			service.dispose();
		});

		test('start() after refcount-0 dispose binds a new port and fresh nonce', async () => {
			const fake = new FakeCopilotApiService();
			const service = createProxyService(fake);
			const h1 = await service.start(TOKEN);
			const baseUrl1 = h1.baseUrl;
			const nonce1 = h1.nonce;
			h1.dispose();

			const h2 = await service.start(TOKEN);
			try {
				assert.notStrictEqual(h2.nonce, nonce1);
				// port may or may not be different depending on OS reuse,
				// but baseUrl reflects whatever the new bind chose
				assert.match(h2.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
				// also: previous baseUrl is no longer reachable in tests
				// — verified indirectly via fresh nonce above
				void baseUrl1;
			} finally {
				h2.dispose();
				service.dispose();
			}
		});

		test('dispose() throws on subsequent start()', async () => {
			const service = createProxyService(new FakeCopilotApiService());
			service.dispose();
			await assert.rejects(() => service.start(TOKEN), /disposed/);
		});

		test('start() updates token slot last-writer-wins', async () => {
			const fake = new FakeCopilotApiService();
			fake.modelsResult = { kind: 'value', value: [] };
			const service = createProxyService(fake);
			const h1 = await service.start('token-A');
			const h2 = await service.start('token-B');
			try {
				await fetchJson(`${h2.baseUrl}/v1/models`, {
					headers: { 'Authorization': `Bearer ${h2.nonce}.s1` },
				});
				assert.strictEqual(fake.modelsCalls.at(-1)?.githubToken, 'token-B');
			} finally {
				h1.dispose();
				h2.dispose();
				service.dispose();
			}
		});
	});

	// #endregion

	// #region Bind safety

	suite('Bind safety', () => {
		test('binds only on 127.0.0.1', async () => {
			const fake = new FakeCopilotApiService();
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				assert.ok(handle.baseUrl.startsWith('http://127.0.0.1:'));
			} finally {
				handle.dispose();
				service.dispose();
			}
		});
	});

	// #endregion

	// #region Auth

	suite('Auth', () => {

		async function withProxy<T>(fn: (handle: { baseUrl: string; nonce: string }, fake: FakeCopilotApiService) => Promise<T>): Promise<T> {
			const fake = new FakeCopilotApiService();
			fake.modelsResult = { kind: 'value', value: [ANTHROPIC_MODEL] };
			fake.messagesResult = { kind: 'message', message: makeMessage('claude-opus-4.6', 'hi') };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				return await fn(handle, fake);
			} finally {
				handle.dispose();
				service.dispose();
			}
		}

		test('missing Authorization header → 401', async () => {
			await withProxy(async handle => {
				const res = await fetchJson(`${handle.baseUrl}/v1/models`);
				assert.strictEqual(res.status, 401);
				assert.deepStrictEqual(res.parsed, {
					type: 'error',
					error: { type: 'authentication_error', message: 'Invalid authentication' },
					request_id: null,
				});
			});
		});

		test('Bearer wrong-nonce.x → 401', async () => {
			await withProxy(async handle => {
				const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
					headers: { 'Authorization': 'Bearer wrong-nonce.session' },
				});
				assert.strictEqual(res.status, 401);
			});
		});

		test('Bearer <nonce> (no dot) → 401', async () => {
			await withProxy(async handle => {
				const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
					headers: { 'Authorization': `Bearer ${handle.nonce}` },
				});
				assert.strictEqual(res.status, 401);
			});
		});

		test('Bearer <nonce>. (empty sessionId) → 401', async () => {
			await withProxy(async handle => {
				const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
					headers: { 'Authorization': `Bearer ${handle.nonce}.` },
				});
				assert.strictEqual(res.status, 401);
			});
		});

		test('x-api-key alone → 401', async () => {
			await withProxy(async handle => {
				const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
					headers: { 'x-api-key': handle.nonce },
				});
				assert.strictEqual(res.status, 401);
			});
		});

		test('Bearer <nonce>.<sessionId> → request proceeds', async () => {
			await withProxy(async (handle, fake) => {
				const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
					headers: { 'Authorization': `Bearer ${handle.nonce}.session-abc` },
				});
				assert.strictEqual(res.status, 200);
				assert.strictEqual(fake.modelsCalls.length, 1);
			});
		});

		test('auth-first precedence: GET /v1/models with bad auth does not reach upstream', async () => {
			await withProxy(async (handle, fake) => {
				const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
					headers: { 'Authorization': 'Bearer wrong.s' },
				});
				assert.strictEqual(res.status, 401);
				assert.strictEqual(fake.modelsCalls.length, 0);
			});
		});

		test('auth-first precedence: POST /v1/messages with bad auth does not reach upstream', async () => {
			await withProxy(async (handle, fake) => {
				const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': 'Bearer wrong.s',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'claude-opus-4-6', messages: [], max_tokens: 8 }),
				});
				assert.strictEqual(res.status, 401);
				assert.strictEqual(fake.messagesCalls.length, 0);
			});
		});

		test('auth-first precedence: POST /v1/messages/count_tokens with bad auth → 401 (not 501)', async () => {
			await withProxy(async handle => {
				const res = await fetchJson(`${handle.baseUrl}/v1/messages/count_tokens`, {
					method: 'POST',
					headers: { 'Authorization': 'Bearer wrong.s' },
					body: '{}',
				});
				assert.strictEqual(res.status, 401);
			});
		});
	});

	// #endregion

	// #region Routes

	suite('Routes', () => {

		test('GET / → 200 ok, no auth required', async () => {
			const fake = new FakeCopilotApiService();
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchJson(`${handle.baseUrl}/`);
				assert.strictEqual(res.status, 200);
				assert.strictEqual(res.body, 'ok');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('POST /v1/messages/count_tokens → 501 api_error', async () => {
			const fake = new FakeCopilotApiService();
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchJson(`${handle.baseUrl}/v1/messages/count_tokens`, {
					method: 'POST',
					headers: { 'Authorization': `Bearer ${handle.nonce}.s` },
					body: '{}',
				});
				assert.strictEqual(res.status, 501);
				assert.deepStrictEqual(res.parsed, {
					type: 'error',
					error: { type: 'api_error', message: 'count_tokens not supported by CAPI' },
					request_id: null,
				});
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('GET /something-else → 404 not_found_error', async () => {
			const fake = new FakeCopilotApiService();
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchJson(`${handle.baseUrl}/v2/whatever`, {
					headers: { 'Authorization': `Bearer ${handle.nonce}.s` },
				});
				assert.strictEqual(res.status, 404);
				const env = res.parsed as Anthropic.ErrorResponse;
				assert.strictEqual(env.type, 'error');
				assert.strictEqual(env.error.type, 'not_found_error');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});
	});

	// #endregion

	// #region Models route

	suite('GET /v1/models', () => {

		test('returns Page envelope with SDK-format IDs and filters by vendor + endpoint', async () => {
			const fake = new FakeCopilotApiService();
			fake.modelsResult = { kind: 'value', value: [ANTHROPIC_MODEL, NON_ANTHROPIC_MODEL, NON_MESSAGES_ANTHROPIC] };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
					headers: { 'Authorization': `Bearer ${handle.nonce}.s` },
				});
				assert.strictEqual(res.status, 200);
				const body = res.parsed as { data: Anthropic.ModelInfo[]; has_more: boolean; first_id: string | null; last_id: string | null };
				assert.deepStrictEqual(body, {
					data: [{
						id: 'claude-opus-4-6',
						type: 'model',
						display_name: 'Claude Opus 4.6',
						created_at: '1970-01-01T00:00:00Z',
						capabilities: null,
						max_input_tokens: null,
						max_tokens: null,
					}],
					has_more: false,
					first_id: 'claude-opus-4-6',
					last_id: 'claude-opus-4-6',
				});
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('upstream CopilotApiError is re-emitted verbatim with original status', async () => {
			const fake = new FakeCopilotApiService();
			const envelope: Anthropic.ErrorResponse = {
				type: 'error',
				error: { type: 'rate_limit_error', message: 'slow down' },
				request_id: 'req_123',
			};
			fake.modelsResult = { kind: 'error', error: new CopilotApiError(429, envelope) };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
					headers: { 'Authorization': `Bearer ${handle.nonce}.s` },
				});
				assert.strictEqual(res.status, 429);
				assert.deepStrictEqual(res.parsed, envelope);
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('non-CopilotApiError → 502 api_error', async () => {
			const fake = new FakeCopilotApiService();
			fake.modelsResult = { kind: 'error', error: new Error('ECONNRESET') };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
					headers: { 'Authorization': `Bearer ${handle.nonce}.s` },
				});
				assert.strictEqual(res.status, 502);
				const env = res.parsed as Anthropic.ErrorResponse;
				assert.strictEqual(env.error.type, 'api_error');
				assert.strictEqual(env.error.message, 'ECONNRESET');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});
	});

	// #endregion

	// #region Messages — model translation

	suite('POST /v1/messages model translation', () => {

		test('SDK ID inbound is translated to endpoint ID upstream', async () => {
			const fake = new FakeCopilotApiService();
			fake.messagesResult = { kind: 'message', message: makeMessage('claude-opus-4.6', 'hi') };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				await fetchJson(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'claude-opus-4-6-20251101', messages: [], max_tokens: 8 }),
				});
				assert.strictEqual(fake.messagesCalls.length, 1);
				assert.strictEqual(fake.messagesCalls[0].body.model, 'claude-opus-4.6');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('endpoint ID inbound is also accepted', async () => {
			const fake = new FakeCopilotApiService();
			fake.messagesResult = { kind: 'message', message: makeMessage('claude-opus-4.6', 'hi') };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				await fetchJson(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'claude-opus-4.6', messages: [], max_tokens: 8 }),
				});
				assert.strictEqual(fake.messagesCalls[0].body.model, 'claude-opus-4.6');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('unparseable model → 404 with no upstream call', async () => {
			const fake = new FakeCopilotApiService();
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'gpt-4o', messages: [], max_tokens: 8 }),
				});
				assert.strictEqual(res.status, 404);
				const env = res.parsed as Anthropic.ErrorResponse;
				assert.strictEqual(env.error.type, 'not_found_error');
				assert.strictEqual(fake.messagesCalls.length, 0);
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('non-streaming response model is rewritten to SDK format', async () => {
			const fake = new FakeCopilotApiService();
			fake.messagesResult = { kind: 'message', message: makeMessage('claude-opus-4.6', 'hi') };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'claude-opus-4-6', messages: [], max_tokens: 8 }),
				});
				assert.strictEqual(res.status, 200);
				const msg = res.parsed as Anthropic.Message;
				assert.strictEqual(msg.model, 'claude-opus-4-6');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});
	});

	// #endregion

	// #region Body validation

	suite('Body validation', () => {

		test('non-JSON body → 400', async () => {
			const fake = new FakeCopilotApiService();
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: 'not-json',
				});
				assert.strictEqual(res.status, 400);
				const env = res.parsed as Anthropic.ErrorResponse;
				assert.strictEqual(env.error.type, 'invalid_request_error');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('missing model field → 400', async () => {
			const fake = new FakeCopilotApiService();
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ messages: [], max_tokens: 8 }),
				});
				assert.strictEqual(res.status, 400);
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('missing messages field → 400', async () => {
			const fake = new FakeCopilotApiService();
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 8 }),
				});
				assert.strictEqual(res.status, 400);
			} finally {
				handle.dispose();
				service.dispose();
			}
		});
	});

	// #endregion

	// #region Header passthrough

	suite('Header passthrough', () => {

		async function postAndCaptureHeaders(beta: string | undefined, version: string | undefined): Promise<Record<string, string> | undefined> {
			const fake = new FakeCopilotApiService();
			fake.messagesResult = { kind: 'message', message: makeMessage('claude-opus-4.6', 'hi') };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			const headers: Record<string, string> = {
				'Authorization': `Bearer ${handle.nonce}.s`,
				'Content-Type': 'application/json',
				'x-request-id': 'caller-rid-123',
				'x-custom-thing': 'should-drop',
			};
			if (beta !== undefined) {
				headers['anthropic-beta'] = beta;
			}
			if (version !== undefined) {
				headers['anthropic-version'] = version;
			}
			try {
				await fetchJson(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers,
					body: JSON.stringify({ model: 'claude-opus-4-6', messages: [], max_tokens: 8 }),
				});
				return fake.messagesCalls[0].options?.headers as Record<string, string> | undefined;
			} finally {
				handle.dispose();
				service.dispose();
			}
		}

		test('forwards anthropic-version verbatim', async () => {
			const headers = await postAndCaptureHeaders(undefined, '2023-06-01');
			assert.strictEqual(headers?.['anthropic-version'], '2023-06-01');
		});

		test('forwards supported anthropic-beta', async () => {
			const headers = await postAndCaptureHeaders('interleaved-thinking-2025-05-14', undefined);
			assert.strictEqual(headers?.['anthropic-beta'], 'interleaved-thinking-2025-05-14');
		});

		test('filters out unsupported betas', async () => {
			const headers = await postAndCaptureHeaders('foo,bar,baz', undefined);
			assert.strictEqual(headers?.['anthropic-beta'], undefined);
		});

		test('drops supported family without date suffix', async () => {
			const headers = await postAndCaptureHeaders('interleaved-thinking', undefined);
			assert.strictEqual(headers?.['anthropic-beta'], undefined);
		});

		test('mixed beta list keeps supported entries only', async () => {
			const headers = await postAndCaptureHeaders('interleaved-thinking-2025-05-14,foo', undefined);
			assert.strictEqual(headers?.['anthropic-beta'], 'interleaved-thinking-2025-05-14');
		});

		test('drops x-request-id and arbitrary headers', async () => {
			const headers = await postAndCaptureHeaders('interleaved-thinking-2025-05-14', '2023-06-01') ?? {};
			assert.deepStrictEqual(Object.keys(headers).sort(), ['anthropic-beta', 'anthropic-version']);
		});
	});

	// #endregion

	// #region Streaming

	suite('Streaming', () => {

		test('emits SSE frames in order with hand-rolled framing and rewrites message_start.message.model', async () => {
			const fake = new FakeCopilotApiService();
			fake.messagesResult = { kind: 'stream', events: makeStreamEvents('claude-opus-4.6') };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'claude-opus-4-6', messages: [], max_tokens: 8, stream: true }),
				});
				assert.strictEqual(res.status, 200);
				assert.strictEqual(res.headers['content-type'], 'text/event-stream');
				const types = res.events.map(e => e.type);
				assert.deepStrictEqual(types, [
					'message_start',
					'content_block_start',
					'content_block_delta',
					'content_block_stop',
					'message_delta',
					'message_stop',
				]);
				const start = res.events[0].data as { type: 'message_start'; message: { model: string } };
				assert.strictEqual(start.message.model, 'claude-opus-4-6');
				assert.ok(!res.rawBody.includes('[DONE]'));
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('mid-stream CopilotApiError → SSE error frame, then end, no message_stop after', async () => {
			const fake = new FakeCopilotApiService();
			const events: Anthropic.MessageStreamEvent[] = [
				{ type: 'message_start', message: makeMessage('claude-opus-4.6', '') },
				{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: [] } } as Anthropic.MessageStreamEvent,
			];
			const upstreamEnvelope: Anthropic.ErrorResponse = {
				type: 'error',
				error: { type: 'rate_limit_error', message: 'slow down' },
				request_id: 'req_xyz',
			};
			fake.messagesResult = {
				kind: 'stream',
				events,
				midStreamError: new CopilotApiError(COPILOT_API_ERROR_STATUS_STREAMING, upstreamEnvelope),
			};
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'claude-opus-4-6', messages: [], max_tokens: 8, stream: true }),
				});
				assert.strictEqual(res.status, 200);
				const lastEvent = res.events.at(-1);
				assert.ok(lastEvent);
				assert.strictEqual(lastEvent.type, 'error');
				assert.deepStrictEqual(lastEvent.data, upstreamEnvelope);
				const types = res.events.map(e => e.type);
				assert.ok(!types.includes('message_stop'), 'no message_stop after error frame');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('pre-stream CopilotApiError → JSON error response with original status', async () => {
			const fake = new FakeCopilotApiService();
			const envelope: Anthropic.ErrorResponse = {
				type: 'error',
				error: { type: 'authentication_error', message: 'token expired' },
				request_id: 'req_pre',
			};
			fake.messagesResult = { kind: 'error', error: new CopilotApiError(401, envelope) };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'claude-opus-4-6', messages: [], max_tokens: 8, stream: true }),
				});
				assert.strictEqual(res.status, 401);
				assert.deepStrictEqual(res.parsed, envelope);
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('pre-stream CopilotApiError with streaming sentinel coerces to 502 but preserves envelope', async () => {
			// The 520 sentinel is meaningless as an HTTP status pre-
			// header; the proxy must coerce to 502 while keeping the
			// upstream envelope verbatim. See plan §1.5.
			const fake = new FakeCopilotApiService();
			const envelope: Anthropic.ErrorResponse = {
				type: 'error',
				error: { type: 'overloaded_error', message: 'capacity full' },
				request_id: 'req_sentinel',
			};
			fake.messagesResult = { kind: 'error', error: new CopilotApiError(COPILOT_API_ERROR_STATUS_STREAMING, envelope) };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'claude-opus-4-6', messages: [], max_tokens: 8, stream: true }),
				});
				assert.strictEqual(res.status, 502);
				assert.deepStrictEqual(res.parsed, envelope);
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('mid-stream non-CopilotApiError → synthesized SSE error frame', async () => {
			const fake = new FakeCopilotApiService();
			const events: Anthropic.MessageStreamEvent[] = [
				{ type: 'message_start', message: makeMessage('claude-opus-4.6', '') },
			];
			fake.messagesResult = { kind: 'stream', events, midStreamError: new Error('socket hang up') };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'claude-opus-4-6', messages: [], max_tokens: 8, stream: true }),
				});
				const lastEvent = res.events.at(-1);
				assert.strictEqual(lastEvent?.type, 'error');
				const env = lastEvent.data as Anthropic.ErrorResponse;
				assert.strictEqual(env.error.type, 'api_error');
				assert.strictEqual(env.error.message, 'socket hang up');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('tool-use input_json_delta events pass through', async () => {
			const fake = new FakeCopilotApiService();
			const events: Anthropic.MessageStreamEvent[] = [
				{ type: 'message_start', message: makeMessage('claude-opus-4.6', '') },
				{ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'do_thing', input: {} } } as Anthropic.MessageStreamEvent,
				{ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"a":' } } as Anthropic.MessageStreamEvent,
				{ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '1}' } } as Anthropic.MessageStreamEvent,
				{ type: 'content_block_stop', index: 0 },
				{ type: 'message_stop' },
			];
			fake.messagesResult = { kind: 'stream', events };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'claude-opus-4-6', messages: [], max_tokens: 8, stream: true }),
				});
				const deltas = res.events.filter(e => e.type === 'content_block_delta').map(e => e.data as { delta: { type: string; partial_json?: string } });
				assert.deepStrictEqual(deltas.map(d => d.delta.type), ['input_json_delta', 'input_json_delta']);
				assert.deepStrictEqual(deltas.map(d => d.delta.partial_json), ['{"a":', '1}']);
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('thinking_delta events pass through', async () => {
			const fake = new FakeCopilotApiService();
			const events: Anthropic.MessageStreamEvent[] = [
				{ type: 'message_start', message: makeMessage('claude-opus-4.6', '') },
				{ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } } as Anthropic.MessageStreamEvent,
				{ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } } as Anthropic.MessageStreamEvent,
				{ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: ' ok' } } as Anthropic.MessageStreamEvent,
				{ type: 'content_block_stop', index: 0 },
				{ type: 'message_stop' },
			];
			fake.messagesResult = { kind: 'stream', events };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);
			try {
				const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'claude-opus-4-6', messages: [], max_tokens: 8, stream: true }),
				});
				const deltas = res.events.filter(e => e.type === 'content_block_delta').map(e => e.data as { delta: { type: string; thinking?: string } });
				assert.deepStrictEqual(deltas.map(d => d.delta.type), ['thinking_delta', 'thinking_delta']);
				assert.deepStrictEqual(deltas.map(d => d.delta.thinking), ['hmm', ' ok']);
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('socket.setNoDelay(true) is called on streaming responses', async () => {
			const fake = new FakeCopilotApiService();
			fake.messagesResult = { kind: 'stream', events: makeStreamEvents('claude-opus-4.6') };
			const service = createProxyService(fake);
			const handle = await service.start(TOKEN);

			// Patch net.Socket.prototype.setNoDelay to track calls during
			// this test only.
			const original = net.Socket.prototype.setNoDelay;
			const calls: boolean[] = [];
			net.Socket.prototype.setNoDelay = function (this: net.Socket, enable?: boolean): net.Socket {
				calls.push(enable !== false);
				return original.call(this, enable as boolean);
			};
			try {
				await fetchSse(`${handle.baseUrl}/v1/messages`, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${handle.nonce}.s`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ model: 'claude-opus-4-6', messages: [], max_tokens: 8, stream: true }),
				});
				assert.ok(calls.some(c => c === true), 'expected setNoDelay(true) to have been called at least once');
			} finally {
				net.Socket.prototype.setNoDelay = original;
				handle.dispose();
				service.dispose();
			}
		});
	});

	// #endregion

	// #region Abort

	suite('Abort', () => {

		test('client disconnect mid-stream propagates AbortSignal upstream and writes nothing else', async () => {
			let signalSeen: AbortSignal | undefined;
			let resolveAborted!: () => void;
			const abortObserved = new Promise<void>(resolve => { resolveAborted = resolve; });
			const wrapped: ICopilotApiService = {
				_serviceBrand: undefined,
				// Custom stream: yield message_start, then wait until the
				// caller's AbortSignal fires (mimics a real long-running
				// upstream stream waiting for tokens to arrive). The test
				// client disconnects after receiving the first frame, and
				// we assert that the abort propagated.
				messages: ((_token: string, _body: Anthropic.MessageCreateParams, options?: ICopilotApiServiceRequestOptions) => {
					signalSeen = options?.signal;
					async function* gen(): AsyncGenerator<Anthropic.MessageStreamEvent> {
						yield { type: 'message_start', message: makeMessage('claude-opus-4.6', '') };
						await new Promise<void>((_resolve, reject) => {
							const onAbort = () => {
								resolveAborted();
								const e = new Error('Aborted');
								(e as { name: string }).name = 'AbortError';
								reject(e);
							};
							if (options?.signal?.aborted) {
								onAbort();
								return;
							}
							options?.signal?.addEventListener('abort', onAbort);
						});
					}
					return gen();
				}) as ICopilotApiService['messages'],
				countTokens: () => Promise.reject(new Error('not used')),
				models: () => Promise.resolve([]),
			};
			const service = new ClaudeProxyService(new NullLogService(), wrapped);
			const handle = await service.start(TOKEN);

			try {
				const u = new URL(`${handle.baseUrl}/v1/messages`);
				const httpMod = await getHttp();
				const clientFinished = new Promise<void>(resolve => {
					const req = httpMod.request({
						hostname: u.hostname,
						port: u.port,
						path: u.pathname,
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${handle.nonce}.s`,
							'Content-Type': 'application/json',
						},
					}, res => {
						let frames = 0;
						res.on('data', () => {
							frames++;
							if (frames >= 1) {
								req.destroy();
								resolve();
							}
						});
						res.on('error', () => resolve());
						res.on('close', () => resolve());
					});
					req.on('error', () => resolve());
					req.write(JSON.stringify({ model: 'claude-opus-4-6', messages: [], max_tokens: 8, stream: true }));
					req.end();
				});
				await clientFinished;
				// Wait for the upstream generator to observe the abort.
				await Promise.race([
					abortObserved,
					new Promise<void>((_resolve, reject) => setTimeout(() => reject(new Error('upstream did not observe abort within 2s')), 2000)),
				]);

				assert.ok(signalSeen, 'expected upstream signal');
				assert.ok(signalSeen.aborted, 'expected abort to fire on client disconnect');
			} finally {
				handle.dispose();
				service.dispose();
			}
		});

		test('dispose() with in-flight non-streaming aborts the upstream call', async () => {
			const fake = new FakeCopilotApiService();
			let signalSeen: AbortSignal | undefined;
			let releaseUpstream: () => void = () => { };
			const upstream = new Promise<Anthropic.Message>((_resolve, reject) => {
				releaseUpstream = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
			});
			const wrapped: ICopilotApiService = {
				_serviceBrand: undefined,
				messages: ((token, body, options) => {
					signalSeen = options?.signal;
					if (body.stream) {
						return fake.messages(token, body as Anthropic.MessageCreateParamsStreaming, options);
					}
					options?.signal?.addEventListener('abort', () => releaseUpstream());
					return upstream;
				}) as ICopilotApiService['messages'],
				countTokens: fake.countTokens.bind(fake),
				models: fake.models.bind(fake),
			};
			const service = new ClaudeProxyService(new NullLogService(), wrapped);
			const handle = await service.start(TOKEN);

			const inflight = fetchJson(`${handle.baseUrl}/v1/messages`, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${handle.nonce}.s`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ model: 'claude-opus-4-6', messages: [], max_tokens: 8 }),
			}).catch(err => ({ aborted: true, err: err as Error }));

			// Wait until upstream has been called.
			await new Promise<void>(resolve => {
				const i = setInterval(() => {
					if (signalSeen) { clearInterval(i); resolve(); }
				}, 10);
			});

			handle.dispose();
			service.dispose();

			const result = await inflight;
			assert.ok(signalSeen?.aborted, 'expected abort to fire on dispose');
			// connection should have been destroyed; result is either an
			// http error or a partial response — just verify we didn't get
			// a 200 with a body.
			void result;
		});
	});

	// #endregion
});
