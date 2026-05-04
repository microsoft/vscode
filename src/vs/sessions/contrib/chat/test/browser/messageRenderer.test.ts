/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MessageRenderer, RetryContext } from '../../browser/messageRenderer.js';
import { AgentEvent } from '../../../../common/agentEvents.js';

async function* makeStream(events: AgentEvent[]): AsyncIterable<AgentEvent> {
	for (const e of events) {
		yield e;
	}
}

suite('MessageRenderer', () => {

	const store = new DisposableStore();
	let container: HTMLElement;
	let retryCount: number;
	let cancelCount: number;
	let lastRetryContext: RetryContext | undefined;

	setup(() => {
		container = document.createElement('div');
		retryCount = 0;
		cancelCount = 0;
		lastRetryContext = undefined;
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function makeRenderer(): MessageRenderer {
		return store.add(new MessageRenderer(
			container,
			(ctx) => { retryCount++; lastRetryContext = ctx; },
			() => { cancelCount++; },
		));
	}

	/** Wait for the renderer to finish consuming a stream. */
	async function renderStream(renderer: MessageRenderer, events: AgentEvent[]): Promise<void> {
		const ctrl = new AbortController();
		renderer.render(makeStream(events), ctrl.signal);
		// Let microtasks flush so the async generator runs to completion
		await new Promise(r => setTimeout(r, 0));
	}

	test('renders text deltas into a single text node', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'text_delta', text: 'Hello' },
			{ type: 'text_delta', text: ', ' },
			{ type: 'text_delta', text: 'world' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		const textEl = container.querySelector('.message-renderer-text');
		assert.ok(textEl, 'text container present');
		assert.strictEqual(textEl!.textContent, 'Hello, world');
		// Only one child text node — O(1) appends, not new nodes per delta
		assert.strictEqual(textEl!.childNodes.length, 1);
	});

	test('adds done class when stream ends', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'text_delta', text: 'done' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		assert.ok(container.classList.contains('done'));
		assert.ok(!container.classList.contains('streaming'));
	});

	test('shows usage chip with correct counts', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'usage', inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 30 },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		const chip = container.querySelector('.message-renderer-usage');
		assert.ok(chip, 'usage chip present');
		assert.ok(!chip!.classList.contains('hidden'), 'usage chip visible');
		const text = chip!.textContent ?? '';
		assert.ok(text.includes('100'), 'input tokens shown');
		assert.ok(text.includes('50'), 'output tokens shown');
		assert.ok(text.includes('30'), 'cache read tokens shown');
	});

	test('accumulates multiple usage events', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'usage', inputTokens: 100, outputTokens: 50 },
			{ type: 'usage', inputTokens: 10, outputTokens: 5 },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		const chip = container.querySelector('.message-renderer-usage');
		const text = chip!.textContent ?? '';
		assert.ok(text.includes('110'), 'accumulated input tokens');
		assert.ok(text.includes('55'), 'accumulated output tokens');
	});

	test('creates tool card on tool_use_start', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'tool_use_start', toolUseId: 't1', name: 'semantic_search' },
			{ type: 'tool_use_stop', toolUseId: 't1' },
			{ type: 'message_stop', stopReason: 'tool_use' },
		]);

		const card = container.querySelector('.message-renderer-tool-card');
		assert.ok(card, 'tool card present');
		const name = card!.querySelector('.message-renderer-tool-name');
		assert.strictEqual(name!.textContent, 'semantic_search');
		assert.ok(card!.classList.contains('done'), 'card marked done after stop');
	});

	test('streams tool arguments into card', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'tool_use_start', toolUseId: 't1', name: 'find_refs' },
			{ type: 'tool_use_delta', toolUseId: 't1', partialInput: '{"query":' },
			{ type: 'tool_use_delta', toolUseId: 't1', partialInput: '"foo"}' },
			{ type: 'tool_use_stop', toolUseId: 't1' },
			{ type: 'message_stop', stopReason: 'tool_use' },
		]);

		const argsEl = container.querySelector('.message-renderer-tool-args');
		assert.ok(argsEl, 'args element present');
		assert.strictEqual(argsEl!.textContent, '{"query":"foo"}');
	});

	test('shows thinking section on thinking_delta', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'thinking_delta', text: 'Let me think...' },
			{ type: 'thinking_delta', text: ' More thought.' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		const thinkingSection = container.querySelector('.message-renderer-thinking');
		assert.ok(thinkingSection, 'thinking section present');
		assert.ok(!thinkingSection!.classList.contains('hidden'), 'thinking section visible');
		// collapsed by default
		assert.ok(thinkingSection!.classList.contains('collapsed'), 'thinking collapsed by default');

		const content = container.querySelector('.message-renderer-thinking-content');
		assert.strictEqual(content!.textContent, 'Let me think... More thought.');
	});

	test('shows error section on error event', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'error', code: 'rate_limit', message: 'Rate limit exceeded', retryable: true },
		]);

		const errorSection = container.querySelector('.message-renderer-error');
		assert.ok(errorSection, 'error section present');
		assert.ok(!errorSection!.classList.contains('hidden'), 'error section visible');
		const msg = errorSection!.querySelector('.message-renderer-error-message');
		assert.strictEqual(msg!.textContent, 'Rate limit exceeded');
	});

	test('hides retry button for non-retryable errors', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'error', code: 'auth_failed', message: 'Unauthorized', retryable: false },
		]);

		const retryBtn = container.querySelector('.message-renderer-retry-button');
		assert.ok(retryBtn!.classList.contains('hidden'), 'retry button hidden for non-retryable');
	});

	test('retry callback fires when retry button clicked', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'error', code: 'server_error', message: 'Server error', retryable: true },
		]);

		const retryBtn = container.querySelector<HTMLButtonElement>('.message-renderer-retry-button');
		retryBtn!.click();
		assert.strictEqual(retryCount, 1);
	});

	test('cancel aborts stream and fires callback', async () => {
		const renderer = makeRenderer();
		let textBeforeCancel = '';

		async function* slowStream(): AsyncIterable<AgentEvent> {
			yield { type: 'text_delta', text: 'Before' };
			await new Promise(r => setTimeout(r, 50));
			yield { type: 'text_delta', text: 'After' };
			yield { type: 'message_stop', stopReason: 'end_turn' };
		}

		const ctrl = new AbortController();
		renderer.render(slowStream(), ctrl.signal);
		// Let the first delta arrive
		await new Promise(r => setTimeout(r, 5));
		textBeforeCancel = container.querySelector('.message-renderer-text')?.textContent ?? '';

		renderer.cancel();
		// Let cleanup run
		await new Promise(r => setTimeout(r, 60));

		assert.strictEqual(textBeforeCancel, 'Before', 'text before cancel present');
		assert.ok(container.classList.contains('done'), 'done class after cancel');
		assert.strictEqual(cancelCount, 1, 'cancel callback fired');
	});

	test('cancel button hidden after stream ends', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'text_delta', text: 'hi' },
			{ type: 'message_stop', stopReason: 'end_turn' },
		]);

		const cancelBtn = container.querySelector('.message-renderer-cancel');
		assert.ok(cancelBtn!.classList.contains('hidden'), 'cancel button hidden after stream');
	});

	test('handles empty stream gracefully', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, []);

		assert.ok(container.classList.contains('done'), 'done class on empty stream');
		assert.ok(!container.classList.contains('streaming'), 'not streaming');
	});

	test('multiple tool cards tracked independently', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'tool_use_start', toolUseId: 'a', name: 'search' },
			{ type: 'tool_use_start', toolUseId: 'b', name: 'read_file' },
			{ type: 'tool_use_delta', toolUseId: 'a', partialInput: '{"q":"x"}' },
			{ type: 'tool_use_delta', toolUseId: 'b', partialInput: '{"path":"/f"}' },
			{ type: 'tool_use_stop', toolUseId: 'a' },
			{ type: 'tool_use_stop', toolUseId: 'b' },
			{ type: 'message_stop', stopReason: 'tool_use' },
		]);

		const cards = container.querySelectorAll('.message-renderer-tool-card');
		assert.strictEqual(cards.length, 2, 'two tool cards');

		assert.deepStrictEqual(
			[...cards].map(c => ({
				name: c.querySelector('.message-renderer-tool-name')?.textContent,
				args: c.querySelector('.message-renderer-tool-args')?.textContent,
				done: c.classList.contains('done'),
			})),
			[
				{ name: 'search', args: '{"q":"x"}', done: true },
				{ name: 'read_file', args: '{"path":"/f"}', done: true },
			],
		);
	});

	test('retry callback receives failedProvider from message_start', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'message_start', requestId: 'r1', provider: 'copilot', model: 'claude-sonnet' },
			{ type: 'error', code: 'rate_limit', message: 'Rate limit exceeded', retryable: true },
		]);

		const retryBtn = container.querySelector<HTMLButtonElement>('.message-renderer-retry-button');
		retryBtn!.click();

		assert.deepStrictEqual(lastRetryContext, { failedProvider: 'copilot' });
	});

	test('retry context uses provider field on error event when present', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'message_start', requestId: 'r1', provider: 'anthropic-oauth', model: 'claude-opus-4-7' },
			// Error carries its own provider (e.g. adapter surfacing a different provider ID)
			{ type: 'error', code: 'auth_failed', message: 'Token expired', retryable: true, provider: 'copilot' },
		]);

		const retryBtn = container.querySelector<HTMLButtonElement>('.message-renderer-retry-button');
		retryBtn!.click();

		assert.deepStrictEqual(lastRetryContext, { failedProvider: 'copilot' });
	});

	test('retry context has undefined failedProvider when no message_start preceded the error', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'error', code: 'send_failed', message: 'Connection refused', retryable: true },
		]);

		const retryBtn = container.querySelector<HTMLButtonElement>('.message-renderer-retry-button');
		retryBtn!.click();

		assert.deepStrictEqual(lastRetryContext, { failedProvider: undefined });
	});

	test('error section shows provider-less message when no provider known', async () => {
		const renderer = makeRenderer();
		await renderStream(renderer, [
			{ type: 'error', code: 'send_failed', message: 'Network error', retryable: true },
		]);

		const errorSection = container.querySelector('.message-renderer-error');
		const msg = errorSection!.querySelector('.message-renderer-error-message');
		assert.strictEqual(msg!.textContent, 'Network error');
		assert.ok(!errorSection!.classList.contains('hidden'), 'error section visible');
	});
});
