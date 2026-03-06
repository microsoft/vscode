/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration test for the local agent loop with real CAPI model calls.
 *
 * This test is gated on the `GITHUB_TOKEN` environment variable. When set,
 * it makes a real HTTP request to the GitHub Copilot API, exchanges the token
 * for a Copilot JWT, and sends a simple prompt to verify the full stack works.
 *
 * Run with: GITHUB_TOKEN=<token> ./scripts/test.sh --run src/vs/platform/agent2/test/node/agentLoop.integrationTest.ts
 */

import assert from 'assert';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { runAgentLoop } from '../../common/agentLoop.js';
import { createUserMessage, IConversationMessage } from '../../common/conversation.js';
import { AgentLoopEvent, IAgentLoopEventMap } from '../../common/events.js';
import { AnthropicModelProvider } from '../../node/anthropicProvider.js';
import { CopilotApiService } from '../../node/copilotToken.js';

function findEvents<K extends keyof IAgentLoopEventMap>(events: AgentLoopEvent[], type: K): IAgentLoopEventMap[K][] {
	return events.filter(e => e.type === type) as IAgentLoopEventMap[K][];
}

// Only run this suite when GITHUB_TOKEN is set
const GITHUB_TOKEN = process.env['GITHUB_TOKEN'];
const describer = GITHUB_TOKEN ? suite : suite.skip;

describer('Agent Loop Integration (real CAPI)', function () {
	// Allow enough time for real HTTP calls
	this.timeout(60_000);

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const log = new NullLogService();

	let tokenService: CopilotApiService;
	let provider: AnthropicModelProvider;

	setup(() => {
		tokenService = new CopilotApiService(log);
		tokenService.setGitHubToken(GITHUB_TOKEN!);
		provider = new AnthropicModelProvider('claude-sonnet-4-20250514', tokenService, log);
	});

	test('sends a simple message and gets a response', async () => {
		const cts = store.add(new CancellationTokenSource());
		const messages: IConversationMessage[] = [
			createUserMessage('What is 2+2? Reply with just the number.'),
		];

		const events: AgentLoopEvent[] = [];
		for await (const event of runAgentLoop(messages, {
			modelProvider: provider,
			modelIdentity: { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514' },
			systemPrompt: 'You are a helpful assistant. Be concise.',
			tools: [],
		}, cts.token)) {
			events.push(event);
		}

		// Should have model call start/complete, assistant deltas, assistant message, turn boundary
		const modelStarts = findEvents(events, 'model-call-start');
		const modelCompletes = findEvents(events, 'model-call-complete');
		const assistantMessages = findEvents(events, 'assistant-message');
		const boundaries = findEvents(events, 'turn-boundary');
		const usages = findEvents(events, 'usage');

		assert.strictEqual(modelStarts.length, 1, 'Should have exactly one model call start');
		assert.strictEqual(modelCompletes.length, 1, 'Should have exactly one model call complete');
		assert.strictEqual(assistantMessages.length, 1, 'Should have exactly one assistant message');
		assert.strictEqual(boundaries.length, 1, 'Should have exactly one turn boundary');
		assert.ok(usages.length > 0, 'Should have at least one usage event');

		// The response should contain "4"
		const msg = assistantMessages[0].message;
		const text = msg.content
			.filter(p => p.type === 'text')
			.map(p => p.text)
			.join('');
		assert.ok(text.includes('4'), `Response should contain "4", got: "${text}"`);

		// Model call should be from anthropic
		assert.strictEqual(modelStarts[0].modelIdentity.provider, 'anthropic');
		assert.strictEqual(modelStarts[0].modelIdentity.modelId, 'claude-sonnet-4-20250514');

		// Duration should be positive
		assert.ok(modelCompletes[0].durationMs > 0, 'Duration should be positive');
	});

	test('handles tool calls end-to-end', async () => {
		const cts = store.add(new CancellationTokenSource());
		const messages: IConversationMessage[] = [
			createUserMessage('Use the get_time tool to tell me what time it is.'),
		];

		const events: AgentLoopEvent[] = [];
		for await (const event of runAgentLoop(messages, {
			modelProvider: provider,
			modelIdentity: { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514' },
			systemPrompt: 'You are a helpful assistant. Always use the get_time tool when asked about the time.',
			tools: [{
				name: 'get_time',
				description: 'Returns the current time.',
				parametersSchema: { type: 'object', properties: {} },
				readOnly: true,
				async execute() {
					return { content: new Date().toISOString() };
				},
			}],
		}, cts.token)) {
			events.push(event);
		}

		// Should have tool start/complete events
		const toolStarts = findEvents(events, 'tool-start');
		const toolCompletes = findEvents(events, 'tool-complete');
		assert.ok(toolStarts.length > 0, 'Should have at least one tool start');
		assert.ok(toolCompletes.length > 0, 'Should have at least one tool complete');
		assert.strictEqual(toolStarts[0].toolName, 'get_time');

		// Should have had 2 model calls (initial + re-sample after tool)
		const modelStarts = findEvents(events, 'model-call-start');
		assert.ok(modelStarts.length >= 2, 'Should have at least 2 model calls (initial + after tool)');
	});

	test('streams text deltas', async () => {
		const cts = store.add(new CancellationTokenSource());
		const messages: IConversationMessage[] = [
			createUserMessage('Count from 1 to 5, one number per line.'),
		];

		const events: AgentLoopEvent[] = [];
		for await (const event of runAgentLoop(messages, {
			modelProvider: provider,
			modelIdentity: { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514' },
			systemPrompt: 'Be concise.',
			tools: [],
		}, cts.token)) {
			events.push(event);
		}

		const deltas = findEvents(events, 'assistant-delta');
		assert.ok(deltas.length >= 1, `Should have at least one streaming delta, got ${deltas.length}`);

		// All deltas should have text
		for (const delta of deltas) {
			assert.ok(delta.text.length > 0, 'Delta text should not be empty');
		}
	});

	test('reports token usage', async () => {
		const cts = store.add(new CancellationTokenSource());
		const messages: IConversationMessage[] = [
			createUserMessage('Say "hello".'),
		];

		const events: AgentLoopEvent[] = [];
		for await (const event of runAgentLoop(messages, {
			modelProvider: provider,
			modelIdentity: { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514' },
			systemPrompt: 'Be concise.',
			tools: [],
		}, cts.token)) {
			events.push(event);
		}

		const usages = findEvents(events, 'usage');
		assert.ok(usages.length > 0, 'Should have usage events');

		// At least one usage event should have non-zero tokens
		const totalInput = usages.reduce((sum, u) => sum + u.inputTokens, 0);
		const totalOutput = usages.reduce((sum, u) => sum + u.outputTokens, 0);
		assert.ok(totalInput > 0 || totalOutput > 0, 'Should report non-zero token usage');
	});
});
