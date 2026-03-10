/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent loop unit tests.
 *
 * Tests the {@link AgentLoop} in isolation with mock providers, tools, and
 * middleware. Each test verifies a specific loop mechanic: text streaming,
 * tool dispatch, thinking, cancellation, middleware hooks, event ordering, and
 * conversation threading.
 *
 * Uses snapshot-style assertions via {@link assertLoopSnapshot} for clear,
 * readable test output. Helper infrastructure lives in `testHelpers.ts`.
 */

import assert from 'assert';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createUserMessage, IConversationMessage } from '../../common/conversation.js';
import { IMiddleware } from '../../common/middleware.js';
import { IModelProvider, ModelResponseChunk } from '../../common/modelProvider.js';
import { IAgentTool } from '../../common/tools.js';
import {
	assertLoopSnapshot,
	runAgentAndCollectEvents,
	createErrorTool,
	createMockProvider,
	createMockTool,
	defaultConfig,
	findEvents,
} from './testHelpers.js';

suite('Agent Loop', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('text-only responses', () => {
		test('simple text response', async () => {
			const provider = createMockProvider([
				[
					{ type: 'text-delta', text: 'Hello ' },
					{ type: 'text-delta', text: 'world!' },
				],
			]);

			const events = await runAgentAndCollectEvents(
				[createUserMessage('Hi')],
				defaultConfig({ modelProvider: provider }),
			);

			assertLoopSnapshot(events, `
				model-call-start
				delta: "Hello "
				delta: "world!"
				model-call-complete
				assistant-message: [text("Hello world!")]
				turn-boundary
			`);
		});

		test('empty response', async () => {
			const events = await runAgentAndCollectEvents(
				[createUserMessage('Hi')],
				defaultConfig({ modelProvider: createMockProvider([[]]) }),
			);

			assertLoopSnapshot(events, `
				model-call-start
				model-call-complete
				assistant-message: []
				turn-boundary
			`);
		});
	});

	suite('tool calls', () => {
		test('single tool call and re-sample', async () => {
			const tool = createMockTool('readFile', true, args => {
				assert.strictEqual(args['path'], 'test.txt');
				return 'file contents';
			});

			const provider = createMockProvider([
				[
					{ type: 'text-delta', text: 'Let me read that.' },
					{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'readFile', arguments: '{"path":"test.txt"}' },
				],
				[{ type: 'text-delta', text: 'The file contains: file contents' }],
			]);

			const events = await runAgentAndCollectEvents(
				[createUserMessage('Read test.txt')],
				defaultConfig({ modelProvider: provider, tools: [tool] }),
			);

			assertLoopSnapshot(events, `
				model-call-start
				delta: "Let me read that."
				model-call-complete
				assistant-message: [text("Let me read that."), tool-call(readFile)]
				tool-start: readFile
				tool-complete: readFile (ok) "file contents"
				model-call-start
				delta: "The file contains: file contents"
				model-call-complete
				assistant-message: [text("The file contains: file contents")]
				turn-boundary
			`);
		});

		test('multiple tool calls in one response', async () => {
			const tool1 = createMockTool('readFile', true, args => `contents of ${args['path']}`);
			const tool2 = createMockTool('grep', true, () => 'grep results');

			const provider = createMockProvider([
				[
					{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'readFile', arguments: '{"path":"a.txt"}' },
					{ type: 'tool-call-complete', toolCallId: 'c2', toolName: 'grep', arguments: '{"pattern":"hello"}' },
				],
				[{ type: 'text-delta', text: 'Done.' }],
			]);

			const events = await runAgentAndCollectEvents(
				[createUserMessage('Do things')],
				defaultConfig({ modelProvider: provider, tools: [tool1, tool2] }),
			);

			assertLoopSnapshot(events, `
				model-call-start
				model-call-complete
				assistant-message: [tool-call(readFile), tool-call(grep)]
				tool-start: readFile
				tool-complete: readFile (ok) "contents of a.txt"
				tool-start: grep
				tool-complete: grep (ok) "grep results"
				model-call-start
				delta: "Done."
				model-call-complete
				assistant-message: [text("Done.")]
				turn-boundary
			`);
		});

		test('serializes mutating tool calls', async () => {
			const callOrder: string[] = [];
			const tool = createMockTool('bash', false, async args => {
				callOrder.push(`bash:${args['command']}`);
				await new Promise(resolve => setTimeout(resolve, 10));
				return `output of ${args['command']}`;
			});

			const provider = createMockProvider([
				[
					{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'bash', arguments: '{"command":"ls"}' },
					{ type: 'tool-call-complete', toolCallId: 'c2', toolName: 'bash', arguments: '{"command":"pwd"}' },
				],
				[{ type: 'text-delta', text: 'Done.' }],
			]);

			await runAgentAndCollectEvents(
				[createUserMessage('Run commands')],
				defaultConfig({ modelProvider: provider, tools: [tool] }),
			);

			assert.deepStrictEqual(callOrder, ['bash:ls', 'bash:pwd']);
		});

		test('unknown tool returns error result', async () => {
			const provider = createMockProvider([
				[{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'nonexistent', arguments: '{}' }],
				[{ type: 'text-delta', text: 'OK' }],
			]);

			const events = await runAgentAndCollectEvents(
				[createUserMessage('Use a tool')],
				defaultConfig({ modelProvider: provider }),
			);

			const completes = findEvents(events, 'tool-complete');
			assert.strictEqual(completes[0].isError, true);
			assert.ok(completes[0].result.includes('Unknown tool'));
		});

		test('tool execution error is captured', async () => {
			const tool = createErrorTool('failTool', 'Something went wrong');

			const provider = createMockProvider([
				[{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'failTool', arguments: '{}' }],
				[{ type: 'text-delta', text: 'I see there was an error.' }],
			]);

			const events = await runAgentAndCollectEvents(
				[createUserMessage('Use failing tool')],
				defaultConfig({ modelProvider: provider, tools: [tool] }),
			);

			const completes = findEvents(events, 'tool-complete');
			assert.strictEqual(completes[0].isError, true);
			assert.ok(completes[0].result.includes('Something went wrong'));
		});

		test('malformed tool arguments are handled', async () => {
			const tool = createMockTool('readFile', true, () => 'content');

			const provider = createMockProvider([
				[{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'readFile', arguments: 'invalid json{' }],
				[{ type: 'text-delta', text: 'OK' }],
			]);

			const events = await runAgentAndCollectEvents(
				[createUserMessage('Read file')],
				defaultConfig({ modelProvider: provider, tools: [tool] }),
			);

			const completes = findEvents(events, 'tool-complete');
			assert.strictEqual(completes[0].isError, false);
		});

		test('tool result flows back as conversation context', async () => {
			const tool = createMockTool('bash', false, () => 'command output');
			const capturedMessages: IConversationMessage[][] = [];

			const provider: IModelProvider = {
				providerId: 'test',
				async *sendRequest(_sys: string, messages: readonly IConversationMessage[]): AsyncGenerator<ModelResponseChunk> {
					capturedMessages.push([...messages]);
					if (capturedMessages.length === 1) {
						yield { type: 'tool-call-complete', toolCallId: 'toolu_1', toolName: 'bash', arguments: '{"command":"ls"}' };
					} else {
						yield { type: 'text-delta', text: 'Done' };
					}
				},
				async listModels() { return []; },
			};

			await runAgentAndCollectEvents(
				[createUserMessage('Run ls')],
				defaultConfig({ modelProvider: provider, tools: [tool] }),
			);

			// Second call should include: user + assistant(tool_call) + tool_result
			assert.strictEqual(capturedMessages[1].length, 3);
			assert.strictEqual(capturedMessages[1][0].role, 'user');
			assert.strictEqual(capturedMessages[1][1].role, 'assistant');
			assert.strictEqual(capturedMessages[1][2].role, 'tool-result');
		});
	});

	suite('thinking/reasoning', () => {
		test('thinking deltas and signature in assistant message', async () => {
			const provider = createMockProvider([
				[
					{ type: 'thinking-delta', text: 'Let me think' },
					{ type: 'thinking-delta', text: ' about this...' },
					{ type: 'thinking-signature', signature: 'sig_abc' },
					{ type: 'text-delta', text: 'The answer is 42.' },
				],
			]);

			const events = await runAgentAndCollectEvents(
				[createUserMessage('Deep question')],
				defaultConfig({ modelProvider: provider }),
			);

			assertLoopSnapshot(events, `
				model-call-start
				reasoning: "Let me think"
				reasoning: " about this..."
				delta: "The answer is 42."
				model-call-complete
				assistant-message: [thinking("Let me think about this..."), text("The answer is 42.")]
				turn-boundary
			`);

			// Verify signature is preserved
			const msg = findEvents(events, 'assistant-message')[0].message;
			const thinking = msg.content.find(p => p.type === 'thinking');
			assert.strictEqual(thinking?.type === 'thinking' && thinking.signature, 'sig_abc');
		});
	});

	suite('usage tracking', () => {
		test('emits usage events', async () => {
			const provider = createMockProvider([
				[
					{ type: 'text-delta', text: 'Hi' },
					{ type: 'usage', inputTokens: 100, outputTokens: 50, cacheReadTokens: 20 },
				],
			]);

			const events = await runAgentAndCollectEvents(
				[createUserMessage('Hi')],
				defaultConfig({ modelProvider: provider }),
			);

			const usage = findEvents(events, 'usage');
			assert.strictEqual(usage.length, 1);
			assert.deepStrictEqual(
				{ input: usage[0].inputTokens, output: usage[0].outputTokens, cache: usage[0].cacheReadTokens },
				{ input: 100, output: 50, cache: 20 },
			);
		});
	});

	suite('cancellation', () => {
		test('throws CancellationError when token is cancelled', async () => {
			const cts = store.add(new CancellationTokenSource());
			cts.cancel();

			await assert.rejects(
				() => runAgentAndCollectEvents([createUserMessage('Hi')], defaultConfig({ modelProvider: createMockProvider([[]]) }), cts.token),
				CancellationError,
			);
		});

		test('cancels during tool execution', async () => {
			const cts = store.add(new CancellationTokenSource());

			const tool: IAgentTool = {
				name: 'slowTool',
				description: 'A slow tool',
				parametersSchema: {},
				readOnly: false,
				async execute(_args, context) {
					cts.cancel();
					if (context.token.isCancellationRequested) {
						throw new CancellationError();
					}
					return { content: 'should not reach' };
				},
			};

			const provider = createMockProvider([
				[{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'slowTool', arguments: '{}' }],
			]);

			await assert.rejects(
				() => runAgentAndCollectEvents(
					[createUserMessage('Run slow tool')],
					defaultConfig({ modelProvider: provider, tools: [tool] }),
					cts.token,
				),
				CancellationError,
			);
		});
	});

	suite('max iterations', () => {
		test('emits fatal error when max iterations exceeded', async () => {
			const tool = createMockTool('infiniteTool', false, () => 'result');
			let callCount = 0;
			const provider: IModelProvider = {
				providerId: 'test',
				async *sendRequest() {
					callCount++;
					yield { type: 'tool-call-complete' as const, toolCallId: `c${callCount}`, toolName: 'infiniteTool', arguments: '{}' };
				},
				async listModels() { return []; },
			};

			const events = await runAgentAndCollectEvents(
				[createUserMessage('Loop forever')],
				defaultConfig({ modelProvider: provider, tools: [tool], maxIterations: 3 }),
			);

			const errors = findEvents(events, 'error');
			assert.strictEqual(errors.length, 1);
			assert.strictEqual(errors[0].fatal, true);
			assert.ok(errors[0].error.message.includes('maximum iterations'));
		});
	});

	suite('middleware', () => {
		test('pre-request can modify messages', async () => {
			let receivedMessages: readonly IConversationMessage[] | undefined;
			const provider: IModelProvider = {
				providerId: 'test',
				async *sendRequest(_sys: string, messages: readonly IConversationMessage[]) {
					receivedMessages = messages;
					yield { type: 'text-delta' as const, text: 'OK' };
				},
				async listModels() { return []; },
			};

			const mw: IMiddleware = {
				preRequest(ctx) {
					return { systemPrompt: ctx.systemPrompt, messages: [...ctx.messages, createUserMessage('injected')], tools: ctx.tools };
				},
			};

			await runAgentAndCollectEvents(
				[createUserMessage('original')],
				defaultConfig({ modelProvider: provider, middleware: [mw] }),
			);

			assert.strictEqual(receivedMessages!.length, 2);
		});

		test('pre-tool can skip execution', async () => {
			let toolExecuted = false;
			const tool = createMockTool('dangerous', false, () => { toolExecuted = true; return 'executed'; });

			const mw: IMiddleware = {
				preTool() { return { arguments: {}, skip: true, cannedResult: 'Permission denied' }; },
			};

			const provider = createMockProvider([
				[{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'dangerous', arguments: '{}' }],
				[{ type: 'text-delta', text: 'OK' }],
			]);

			const events = await runAgentAndCollectEvents(
				[createUserMessage('Do dangerous thing')],
				defaultConfig({ modelProvider: provider, tools: [tool], middleware: [mw] }),
			);

			assert.strictEqual(toolExecuted, false);
			assert.strictEqual(findEvents(events, 'tool-complete')[0].result, 'Permission denied');
		});

		test('post-tool can modify results', async () => {
			const tool = createMockTool('readFile', true, () => 'secret data here');

			const mw: IMiddleware = {
				postTool(ctx) { return { result: ctx.result.replace('secret', '[REDACTED]'), isError: ctx.isError }; },
			};

			const provider = createMockProvider([
				[{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'readFile', arguments: '{}' }],
				[{ type: 'text-delta', text: 'OK' }],
			]);

			const events = await runAgentAndCollectEvents(
				[createUserMessage('Read file')],
				defaultConfig({ modelProvider: provider, tools: [tool], middleware: [mw] }),
			);

			assert.strictEqual(findEvents(events, 'tool-complete')[0].result, '[REDACTED] data here');
		});

		test('post-response can request retry', async () => {
			let modelCallCount = 0;
			const provider: IModelProvider = {
				providerId: 'test',
				async *sendRequest() { modelCallCount++; yield { type: 'text-delta' as const, text: `response ${modelCallCount}` }; },
				async listModels() { return []; },
			};

			let retryRequested = false;
			const mw: IMiddleware = {
				postResponse() {
					if (!retryRequested) { retryRequested = true; return { retry: true }; }
					return {};
				},
			};

			await runAgentAndCollectEvents(
				[createUserMessage('Hi')],
				defaultConfig({ modelProvider: provider, middleware: [mw] }),
			);

			assert.strictEqual(modelCallCount, 2);
		});
	});
});
