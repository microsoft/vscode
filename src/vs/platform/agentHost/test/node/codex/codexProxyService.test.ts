/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { CCAModel } from '@vscode/copilot-api';
import type * as http from 'http';
import { SSEParser, type ISSEEvent } from '../../../../../base/common/sseParser.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import {
	CopilotApiError,
	type ICopilotApiService,
	type ICopilotApiServiceRequestOptions,
} from '../../../node/shared/copilotApiService.js';
import { CodexProxyService, remapCodexReviewerModel } from '../../../node/codex/codexProxyService.js';
import { extractForwardedErrorInfo } from '../../../node/shared/proxyChatError.js';

// #region Test fakes

interface IResponsesCall {
	githubToken: string;
	body: string;
	options: ICopilotApiServiceRequestOptions | undefined;
}

class FakeCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	async resolveRestrictedTelemetryContext() { return { restrictedTelemetryEnabled: false, trackingId: undefined, telemetryEndpoint: undefined }; }
	async resolveApiEndpoint() { return undefined; }

	readonly responsesCalls: IResponsesCall[] = [];
	readonly modelsCalls: { githubToken: string; options: ICopilotApiServiceRequestOptions | undefined }[] = [];
	responsesError: Error | undefined;
	responseChunks = [new TextEncoder().encode('event: response.completed\ndata: {}\n\n')];
	beforeResponseChunk: ((index: number) => void) | undefined;
	responseContentType = 'text/event-stream';
	readonly modelsResult = [
		{ id: 'gpt-5.5', name: 'GPT-5.5', supported_endpoints: ['/responses'] },
		{ id: 'claude-sonnet', name: 'Claude Sonnet', supported_endpoints: ['/v1/messages'] },
	] as CCAModel[];

	messages(): never {
		throw new Error('messages not used by Codex proxy tests');
	}

	async countTokens(): Promise<never> {
		throw new Error('countTokens not used by Codex proxy tests');
	}

	async models(githubToken: string, options?: ICopilotApiServiceRequestOptions): Promise<CCAModel[]> {
		this.modelsCalls.push({ githubToken, options });
		return this.modelsResult;
	}

	async responses(githubToken: string, body: string, options?: ICopilotApiServiceRequestOptions): Promise<Response> {
		this.responsesCalls.push({ githubToken, body, options });
		if (this.responsesError) {
			throw this.responsesError;
		}
		const chunks = this.responseChunks;
		let chunkIndex = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull: controller => {
				if (chunkIndex < chunks.length) {
					this.beforeResponseChunk?.(chunkIndex);
					controller.enqueue(chunks[chunkIndex++]);
				} else {
					controller.close();
				}
			},
		}, { highWaterMark: 0 });
		return new Response(stream, { status: 200, headers: { 'content-type': this.responseContentType } });
	}

	async utilityChatCompletion(): Promise<never> {
		throw new Error('utilityChatCompletion not used by Codex proxy tests');
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

function postResponses(url: string, init: { headers?: Record<string, string>; body?: string }): Promise<{ status: number; body: string }> {
	return getHttp().then(httpMod => new Promise((resolve, reject) => {
		const u = new URL(url);
		const req = httpMod.request({
			hostname: u.hostname,
			port: u.port,
			path: u.pathname + u.search,
			method: 'POST',
			headers: init.headers,
		}, res => {
			const chunks: Buffer[] = [];
			res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
			res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
			res.on('error', reject);
		});
		req.on('error', reject);
		if (init.body !== undefined) {
			req.write(init.body);
		}
		req.end();
	}));
}

function get(url: string, headers?: Record<string, string>): Promise<{ status: number; body: string }> {
	return getHttp().then(httpMod => new Promise((resolve, reject) => {
		const u = new URL(url);
		const req = httpMod.request({
			hostname: u.hostname,
			port: u.port,
			path: u.pathname + u.search,
			method: 'GET',
			headers,
		}, res => {
			const chunks: Buffer[] = [];
			res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
			res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
			res.on('error', reject);
		});
		req.on('error', reject);
		req.end();
	}));
}

// #endregion

const TOKEN = 'gh-test-token';

suite('CodexProxyService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	async function withProxy(fn: (handle: { baseUrl: string; nonce: string }, fake: FakeCopilotApiService) => Promise<void>, now?: () => number): Promise<void> {
		const fake = new FakeCopilotApiService();
		const service = new CodexProxyService(now, new NullLogService(), fake);
		const handle = await service.start(TOKEN);
		try {
			await fn(handle, fake);
		} finally {
			handle.dispose();
			service.dispose();
		}
	}

	test('forwards transformed user-agent to CAPI responses', async () => {
		await withProxy(async (handle, fake) => {
			await postResponses(`${handle.baseUrl}/v1/responses`, {
				headers: { 'Authorization': `Bearer ${handle.nonce}`, 'User-Agent': 'codex/1.2.3' },
				body: JSON.stringify({ model: 'gpt-5', stream: true, input: [] }),
			});
			assert.strictEqual(fake.responsesCalls.at(-1)?.options?.headers?.['User-Agent'], 'vscode_codex/1.2.3');
		});
	});

	suite('portable history', () => {
		const reasoning = { type: 'reasoning', id: 'rs_copilot', summary: [{ type: 'summary_text', text: 'Résumé 🐈' }], encrypted_content: 'copilot-account-ciphertext' };
		const portableReasoning = { type: reasoning.type, id: reasoning.id, summary: reasoning.summary };
		const toolCall = { type: 'function_call', call_id: 'call_1', name: 'read_file', arguments: '{"encrypted_content":"user-data"}' };
		const toolResult = { type: 'function_call_output', call_id: 'call_1', output: '{"encrypted_content":"user-data"}' };
		const message = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'The answer.' }] };
		const usage = { input_tokens: 10, output_tokens: 5, total_tokens: 15 };
		const completed = { type: 'response.completed', response: { output: [reasoning, toolCall, message], usage } };
		const portableCompleted = { ...completed, response: { output: [portableReasoning, toolCall, message], usage } };

		test('omits account-bound reasoning from portable requests without changing tool history', async () => {
			await withProxy(async (handle, fake) => {
				const body = { model: 'gpt-5', stream: true, include: ['reasoning.encrypted_content', 'message.output_text.logprobs'], input: [reasoning, toolCall, toolResult, message] };
				await postResponses(`${handle.baseUrl}/v1/responses`, {
					headers: { 'Authorization': `Bearer ${handle.nonce}`, 'x-vscode-codex-portable-history': 'true' },
					body: JSON.stringify(body),
				});
				assert.deepStrictEqual(JSON.parse(fake.responsesCalls[0].body), { ...body, include: ['message.output_text.logprobs'], input: [portableReasoning, toolCall, toolResult, message] });
			});
		});

		test('keeps ordinary Copilot requests and responses byte-for-byte unchanged', async () => {
			await withProxy(async (handle, fake) => {
				const body = JSON.stringify({ model: 'gpt-5', stream: true, include: ['reasoning.encrypted_content'], input: [reasoning] }, null, 2);
				const stream = `: keep-alive\r\nevent: response.completed\r\ndata: ${JSON.stringify(completed)}\r\n\r\n`;
				fake.responseChunks = [Buffer.from(stream)];
				const response = await postResponses(`${handle.baseUrl}/v1/responses`, { headers: { 'Authorization': `Bearer ${handle.nonce}` }, body });
				assert.deepStrictEqual({ request: fake.responsesCalls[0].body, response: response.body }, { request: body, response: stream });
			});
		});

		for (const chunkSize of [1, 7, 4096]) {
			test(`removes ciphertext from SSE items and completed responses across ${chunkSize}-byte chunks`, async () => {
				await withProxy(async (handle, fake) => {
					const added = { type: 'response.output_item.added', item: reasoning, output_index: 0 };
					const done = { type: 'response.output_item.done', item: reasoning, output_index: 0 };
					const delta = { type: 'response.reasoning_summary_text.delta', delta: reasoning.summary[0].text };
					const events = [added, delta, done, completed];
					const stream = Buffer.from(`: keep-alive\r\n${events.map(event => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join('')}data: [DONE]\r\n\r\n`);
					fake.responseChunks = [];
					for (let offset = 0; offset < stream.length; offset += chunkSize) {
						fake.responseChunks.push(stream.subarray(offset, offset + chunkSize));
					}
					const response = await postResponses(`${handle.baseUrl}/v1/responses`, {
						headers: { 'Authorization': `Bearer ${handle.nonce}`, 'x-vscode-codex-portable-history': 'true' },
						body: JSON.stringify({ model: 'gpt-5', stream: true, input: [] }),
					});
					const received: ISSEEvent[] = [];
					new SSEParser(event => received.push(event)).feed(Buffer.from(response.body));
					assert.deepStrictEqual({ received, heartbeats: response.body.match(/: keep-alive\n\n/g)?.length ?? 0 }, {
						received: [
							{ type: added.type, data: JSON.stringify({ ...added, item: portableReasoning }) },
							{ type: delta.type, data: JSON.stringify(delta) },
							{ type: done.type, data: JSON.stringify({ ...done, item: portableReasoning }) },
							{ type: completed.type, data: JSON.stringify(portableCompleted) },
							{ type: 'message', data: '[DONE]' },
						],
						heartbeats: 0,
					});
				}, () => 0);
			});
		}

		test('throttles portable heartbeats by time since the last downstream write', async () => {
			let now = 0;
			await withProxy(async (handle, fake) => {
				const chunks = [
					{ time: 0, data: 'event: response.output_text.delta\n' },
					{ time: 14_999, data: 'data: {"delta":"' },
					{ time: 15_000, data: 'hel' },
					{ time: 15_001, data: 'l' },
					{ time: 29_999, data: 'o' },
					{ time: 30_000, data: ' ' },
					{ time: 44_999, data: 'world"}\n\n' },
					{ time: 45_000, data: ': upstream heartbeat\n\n' },
					{ time: 59_998, data: ': upstream heartbeat\n\n' },
					{ time: 59_999, data: ': upstream heartbeat\n\n' },
					{ time: 74_999, data: 'event: response.completed\ndata: {}\n\n' },
				];
				fake.responseChunks = chunks.map(chunk => Buffer.from(chunk.data));
				fake.beforeResponseChunk = index => { now = chunks[index].time; };
				const response = await postResponses(`${handle.baseUrl}/v1/responses`, {
					headers: { 'Authorization': `Bearer ${handle.nonce}`, 'x-vscode-codex-portable-history': 'true' },
					body: JSON.stringify({ model: 'gpt-5', stream: true, input: [] }),
				});
				assert.deepStrictEqual(response, {
					status: 200,
					body: [
						': keep-alive\n\n',
						': keep-alive\n\n',
						'event: response.output_text.delta\ndata: {"delta":"hello world"}\n\n',
						': keep-alive\n\n',
						'event: response.completed\ndata: {}\n\n',
					].join(''),
				});
			}, () => now);
		});

		test('also removes ciphertext from non-streaming JSON responses', async () => {
			await withProxy(async (handle, fake) => {
				fake.responseContentType = 'application/json; charset=utf-8';
				fake.responseChunks = [Buffer.from(JSON.stringify(completed.response))];
				const response = await postResponses(`${handle.baseUrl}/v1/responses`, {
					headers: { 'Authorization': `Bearer ${handle.nonce}`, 'x-vscode-codex-portable-history': 'true' },
					body: JSON.stringify({ model: 'gpt-5', stream: false, input: [] }),
				});
				assert.deepStrictEqual(JSON.parse(response.body), portableCompleted.response);
			});
		});
	});

	test('preserves endpoint discovery authentication failures', async () => {
		await withProxy(async (handle, fake) => {
			fake.responsesError = new CopilotApiError(401, {
				type: 'error',
				error: { type: 'api_error', message: '{"message":"Bad credentials"}' },
				request_id: null,
			}, 'Copilot endpoint discovery failed: 401 Unauthorized — {"message":"Bad credentials"}');

			const response = await postResponses(`${handle.baseUrl}/v1/responses`, {
				headers: { 'Authorization': `Bearer ${handle.nonce}` },
				body: JSON.stringify({ model: 'gpt-5', stream: true, input: [] }),
			});
			const error = JSON.parse(response.body).error as { type: string; message: string };

			assert.deepStrictEqual({
				status: response.status,
				type: error.type,
				error: extractForwardedErrorInfo(error.message),
			}, {
				status: 401,
				type: 'api_error',
				error: {
					message: 'Copilot endpoint discovery failed: 401 Unauthorized — {"message":"Bad credentials"}',
					_meta: {
						chatError: {
							fetchError: {
								type: 'agent_unauthorized',
								reason: '{"message":"Bad credentials"}',
								requestId: '',
								capiError: {
									code: 'api_error',
									message: '{"message":"Bad credentials"}',
								},
							},
						},
					},
				},
			});
		});
	});

	test('serves an empty Codex model catalog', async () => {
		await withProxy(async (handle, fake) => {
			const response = await get(`${handle.baseUrl}/v1/models?client_version=0.146.0`, {
				'Authorization': `Bearer ${handle.nonce}`,
				'User-Agent': 'codex/0.146.0',
			});
			assert.strictEqual(response.status, 200);
			assert.deepStrictEqual(JSON.parse(response.body), { models: [] });
			assert.deepStrictEqual(fake.modelsCalls, []);
		});
	});

	test('keeps the suffix when transforming a multi-segment user-agent', async () => {
		await withProxy(async (handle, fake) => {
			await postResponses(`${handle.baseUrl}/v1/responses`, {
				headers: { 'Authorization': `Bearer ${handle.nonce}`, 'User-Agent': 'OpenAI/Python/1.0' },
				body: JSON.stringify({ model: 'gpt-5', stream: true, input: [] }),
			});
			assert.strictEqual(fake.responsesCalls.at(-1)?.options?.headers?.['User-Agent'], 'vscode_codex/Python/1.0');
		});
	});

	test('omits User-Agent when the inbound request has none', async () => {
		await withProxy(async (handle, fake) => {
			await postResponses(`${handle.baseUrl}/v1/responses`, {
				headers: { 'Authorization': `Bearer ${handle.nonce}` },
				body: JSON.stringify({ model: 'gpt-5', stream: true, input: [] }),
			});
			assert.strictEqual(fake.responsesCalls.at(-1)?.options?.headers?.['User-Agent'], undefined);
		});
	});

	test('remaps the unsupported auto-review reviewer model onto the last primary model', async () => {
		await withProxy(async (handle, fake) => {
			const headers = { 'Authorization': `Bearer ${handle.nonce}`, 'User-Agent': 'codex/1.0' };
			// A normal turn establishes the session's primary model...
			await postResponses(`${handle.baseUrl}/v1/responses`, {
				headers,
				body: JSON.stringify({ model: 'gpt-5.5', stream: true, input: [] }),
			});
			// ...then the auto-review reviewer fires with the unsupported model.
			await postResponses(`${handle.baseUrl}/v1/responses`, {
				headers,
				body: JSON.stringify({ model: 'codex-auto-review', stream: true, input: [] }),
			});
			assert.deepStrictEqual(fake.responsesCalls.map(call => JSON.parse(call.body).model), ['gpt-5.5', 'gpt-5.5']);
		});
	});

	test('forwards the auto-review reviewer model unchanged when no primary model has been seen', async () => {
		await withProxy(async (handle, fake) => {
			await postResponses(`${handle.baseUrl}/v1/responses`, {
				headers: { 'Authorization': `Bearer ${handle.nonce}`, 'User-Agent': 'codex/1.0' },
				body: JSON.stringify({ model: 'codex-auto-review', stream: true, input: [] }),
			});
			// Graceful degradation: nothing to remap onto, so the request is
			// forwarded verbatim (and 400s upstream, exactly as before).
			assert.strictEqual(JSON.parse(fake.responsesCalls.at(-1)!.body).model, 'codex-auto-review');
		});
	});

	test('remaps the reviewer model onto the most recent primary model', async () => {
		await withProxy(async (handle, fake) => {
			const headers = { 'Authorization': `Bearer ${handle.nonce}`, 'User-Agent': 'codex/1.0' };
			await postResponses(`${handle.baseUrl}/v1/responses`, { headers, body: JSON.stringify({ model: 'gpt-5.5', input: [] }) });
			await postResponses(`${handle.baseUrl}/v1/responses`, { headers, body: JSON.stringify({ model: 'gpt-5-codex', input: [] }) });
			await postResponses(`${handle.baseUrl}/v1/responses`, { headers, body: JSON.stringify({ model: 'codex-auto-review', input: [] }) });
			assert.strictEqual(JSON.parse(fake.responsesCalls.at(-1)!.body).model, 'gpt-5-codex');
		});
	});

	suite('remapCodexReviewerModel', () => {
		test('records the primary model and leaves the body untouched', () => {
			const state = { lastPrimaryModel: undefined as string | undefined };
			const result = remapCodexReviewerModel(JSON.stringify({ model: 'gpt-5.5', input: [] }), state);
			assert.deepStrictEqual({ remappedFrom: result.remappedFrom, lastPrimaryModel: state.lastPrimaryModel, model: JSON.parse(result.body).model }, { remappedFrom: undefined, lastPrimaryModel: 'gpt-5.5', model: 'gpt-5.5' });
		});

		test('remaps the reviewer model and reports the substitution', () => {
			const state = { lastPrimaryModel: 'gpt-5.5' as string | undefined };
			const result = remapCodexReviewerModel(JSON.stringify({ model: 'codex-auto-review', input: [] }), state);
			assert.deepStrictEqual({ remappedFrom: result.remappedFrom, remappedTo: result.remappedTo, model: JSON.parse(result.body).model }, { remappedFrom: 'codex-auto-review', remappedTo: 'gpt-5.5', model: 'gpt-5.5' });
		});

		test('returns the original body for unparseable or model-less payloads', () => {
			const state = { lastPrimaryModel: 'gpt-5.5' as string | undefined };
			assert.deepStrictEqual({
				unparseable: remapCodexReviewerModel('not json', state).body,
				modelless: remapCodexReviewerModel(JSON.stringify({ input: [] }), state).body,
			}, {
				unparseable: 'not json',
				modelless: JSON.stringify({ input: [] }),
			});
		});
	});
});
