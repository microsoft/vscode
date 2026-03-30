/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatMessageRole, IChatMessage } from '../../../chat/common/languageModels.js';
import { ApiFormatTranslator } from '../../common/apiFormatTranslator.js';

suite('ApiFormatTranslator', () => {

	let translator: ApiFormatTranslator;

	const messages: IChatMessage[] = [
		{ role: ChatMessageRole.System, content: [{ type: 'text', value: 'You are a helpful assistant.' }] },
		{ role: ChatMessageRole.User, content: [{ type: 'text', value: 'Hello!' }] },
		{ role: ChatMessageRole.Assistant, content: [{ type: 'text', value: 'Hi there!' }] },
	];

	setup(() => {
		translator = new ApiFormatTranslator();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// --- Anthropic format ---

	test('converts to Anthropic format — system as top-level field', () => {
		const req = translator.toProviderRequest(messages, 'claude-sonnet-4', 'sk-test', 'anthropic', 'https://api.anthropic.com');
		const body = JSON.parse(req.body);
		assert.strictEqual(body.system, 'You are a helpful assistant.');
		assert.strictEqual(body.messages.length, 2); // no system message in array
		assert.strictEqual(body.messages[0].role, 'user');
		assert.strictEqual(body.messages[1].role, 'assistant');
		assert.ok(req.headers['x-api-key']);
		assert.ok(req.url.includes('/v1/messages'));
	});

	// --- OpenAI format ---

	test('converts to OpenAI format — system as message', () => {
		const req = translator.toProviderRequest(messages, 'gpt-4o', 'sk-test', 'openai', 'https://api.openai.com/v1');
		const body = JSON.parse(req.body);
		assert.strictEqual(body.messages.length, 3); // system included as message
		assert.strictEqual(body.messages[0].role, 'system');
		assert.strictEqual(body.messages[1].role, 'user');
		assert.ok(req.headers['Authorization'].startsWith('Bearer '));
		assert.ok(req.url.includes('/chat/completions'));
	});

	// --- Google format ---

	test('converts to Google format — systemInstruction field', () => {
		const req = translator.toProviderRequest(messages, 'gemini-2.5-pro', 'key-test', 'google', 'https://generativelanguage.googleapis.com');
		const body = JSON.parse(req.body);
		assert.ok(body.systemInstruction);
		assert.strictEqual(body.systemInstruction.parts[0].text, 'You are a helpful assistant.');
		assert.strictEqual(body.contents.length, 2); // no system in contents
		assert.strictEqual(body.contents[0].role, 'user');
		assert.strictEqual(body.contents[1].role, 'model'); // Google uses 'model' not 'assistant'
		assert.ok(req.url.includes('key=key-test'));
	});

	// --- SSE chunk parsing ---

	test('parses Anthropic content_block_delta', () => {
		const chunk = translator.parseStreamChunk('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}', 'anthropic');
		assert.strictEqual(chunk.text, 'Hello');
		assert.strictEqual(chunk.done, false);
	});

	test('parses Anthropic message_stop', () => {
		const chunk = translator.parseStreamChunk('{"type":"message_stop"}', 'anthropic');
		assert.strictEqual(chunk.done, true);
	});

	test('parses OpenAI delta content', () => {
		const chunk = translator.parseStreamChunk('{"choices":[{"delta":{"content":"World"}}]}', 'openai');
		assert.strictEqual(chunk.text, 'World');
		assert.strictEqual(chunk.done, false);
	});

	test('parses OpenAI [DONE]', () => {
		const chunk = translator.parseStreamChunk('[DONE]', 'openai');
		assert.strictEqual(chunk.done, true);
	});

	test('parses Google candidate text', () => {
		const chunk = translator.parseStreamChunk('{"candidates":[{"content":{"parts":[{"text":"Gemini says hi"}]}}]}', 'google');
		assert.strictEqual(chunk.text, 'Gemini says hi');
		assert.strictEqual(chunk.done, false);
	});

	test('handles malformed chunk gracefully', () => {
		const chunk = translator.parseStreamChunk('not json at all', 'openai');
		assert.strictEqual(chunk.text, '');
		assert.strictEqual(chunk.done, false);
	});

	// --- Quota extraction ---

	test('extracts Anthropic quota headers', () => {
		const quota = translator.extractQuota({
			'anthropic-ratelimit-tokens-remaining': '45000',
			'anthropic-ratelimit-tokens-limit': '100000',
			'anthropic-ratelimit-tokens-reset': '2026-03-30T15:00:00Z',
		}, 'anthropic');
		assert.strictEqual(quota.remaining, 45000);
		assert.strictEqual(quota.limit, 100000);
		assert.ok(quota.resetAt);
	});

	test('extracts OpenAI quota headers', () => {
		const quota = translator.extractQuota({
			'x-ratelimit-remaining-tokens': '8000',
			'x-ratelimit-limit-tokens': '10000',
			'x-ratelimit-reset-tokens': '60',
		}, 'openai');
		assert.strictEqual(quota.remaining, 8000);
		assert.strictEqual(quota.limit, 10000);
		assert.ok(quota.resetAt);
	});

	test('returns empty for Google quota (no headers)', () => {
		const quota = translator.extractQuota({}, 'google');
		assert.strictEqual(Object.keys(quota).length, 0);
	});
});
