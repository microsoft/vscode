/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModelClient, ModelRegistry, ModelRouterError, testConnection, type ModelConfig } from '../src/index.ts';
import { jsonResponse, mockFetch, sseResponse } from './helpers.ts';

const base: ModelConfig = { id: 'm', displayName: 'M', apiFormat: 'openai', baseUrl: 'https://example.com/v1', model: 'x' };

const isInvalidConfig = (error: unknown) => error instanceof ModelRouterError && error.kind === 'invalid_config';

test('requires HTTPS except for localhost', () => {
	assert.throws(() => createModelClient({ ...base, baseUrl: 'http://example.com/v1' }), isInvalidConfig);
	assert.throws(() => createModelClient({ ...base, baseUrl: 'not a url' }), isInvalidConfig);
	for (const baseUrl of ['http://localhost:11434/v1', 'http://127.0.0.1:1234/v1', 'http://[::1]:8000/v1']) {
		assert.doesNotThrow(() => createModelClient({ ...base, baseUrl }), baseUrl);
	}
});

test('rejects a missing model name or unknown format', () => {
	assert.throws(() => createModelClient({ ...base, model: ' ' }), isInvalidConfig);
	assert.throws(() => createModelClient({ ...base, apiFormat: 'cohere' as never }), isInvalidConfig);
});

test('local models work without an API key', async () => {
	const { fetch, calls } = mockFetch(() => sseResponse([{ choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] }, '[DONE]']));
	const result = await createModelClient({ ...base, baseUrl: 'http://localhost:11434/v1', model: 'llama3.1:8b' }, { fetch }).complete({ messages: [{ role: 'user', content: 'hi' }] });
	assert.equal(result.text, 'OK');
	assert.equal(calls[0].headers.authorization, undefined);
});

test('connection test reports streaming and tool calling', async () => {
	const { fetch, calls } = mockFetch(call => call.body?.tools
		? sseResponse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 't', function: { name: 'report_status', arguments: '{"status":"ok"}' } }] }, finish_reason: 'tool_calls' }] }, '[DONE]'])
		: sseResponse([{ choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] }, '[DONE]']));
	const report = await testConnection(base, { fetch });
	assert.equal(calls.length, 2);
	assert.deepEqual({ ...report, firstTokenMs: undefined }, { reachable: true, authenticated: true, streaming: true, toolCalling: true, firstTokenMs: undefined, sampleText: 'OK' });
});

test('connection test marks tool calling unsupported when the provider rejects tools', async () => {
	const { fetch } = mockFetch(call => call.body?.tools
		? jsonResponse(400, { error: { message: 'tools are not supported for this model' } })
		: sseResponse([{ choices: [{ delta: { content: 'OK' } }] }, '[DONE]']));
	assert.equal((await testConnection(base, { fetch })).toolCalling, false);
});

test('connection test separates a bad key from an unreachable host', async () => {
	const badKey = mockFetch(() => jsonResponse(401, { error: { message: 'bad key' } }));
	const authReport = await testConnection(base, { fetch: badKey.fetch });
	assert.equal(authReport.reachable, true);
	assert.equal(authReport.authenticated, false);
	assert.equal(authReport.error?.kind, 'auth');

	const down = mockFetch(() => { throw new TypeError('fetch failed'); });
	const downReport = await testConnection(base, { fetch: down.fetch });
	assert.equal(downReport.reachable, false);
	assert.equal(downReport.error?.kind, 'network');
	assert.match(downReport.error?.message ?? '', /example\.com/);
});

test('connection test explains a timeout', async () => {
	// A host that never answers: the request only ends when the timeout aborts it.
	const silentFetch = (_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
		init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
	});
	// AbortSignal.timeout does not keep Node alive on its own; the editor's event loop always is.
	const keepAlive = setInterval(() => { /* hold the event loop open */ }, 1000);
	const report = await testConnection(base, { fetch: silentFetch, timeoutMs: 20 }).finally(() => clearInterval(keepAlive));
	assert.equal(report.reachable, false);
	assert.equal(report.error?.kind, 'aborted');
	assert.match(report.error?.message ?? '', /No answer within/);
});

test('registry assigns roles with fallbacks', () => {
	const registry = new ModelRegistry();
	assert.throws(() => registry.clientFor('chat'), /Add one in Settings > Models/);
	registry.add({ ...base, id: 'big' });
	registry.add({ ...base, id: 'fast', baseUrl: 'http://localhost:11434/v1' });
	assert.equal(registry.modelFor('agent')?.id, 'big', 'falls back to the first model');
	registry.assign('chat', 'fast');
	assert.equal(registry.modelFor('edit')?.id, 'fast', 'falls back to the chat model');
	assert.equal(registry.modelFor('completion'), undefined, 'tab completion never falls back');
	registry.assign('completion', 'fast');
	registry.remove('fast');
	assert.equal(registry.modelFor('completion'), undefined);
	assert.equal(registry.modelFor('chat')?.id, 'big');
	assert.throws(() => registry.assign('agent', 'missing'), isInvalidConfig);
});
