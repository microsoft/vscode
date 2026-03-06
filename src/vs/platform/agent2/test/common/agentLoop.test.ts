/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentLoopConfig, runAgentLoop } from '../../common/agentLoop.js';
import { createUserMessage, IConversationMessage, IModelIdentity } from '../../common/conversation.js';
import { AgentLoopEvent, IAgentLoopEventMap } from '../../common/events.js';
import { IMiddleware } from '../../common/middleware.js';
import { IModelProvider, IModelRequestConfig, ModelResponseChunk } from '../../common/modelProvider.js';
import { IAgentTool, IAgentToolDefinition, IToolContext, IToolResult } from '../../common/tools.js';

// -- Test helpers -------------------------------------------------------------

const testModel: IModelIdentity = { provider: 'test', modelId: 'test-model' };

/**
 * Creates a mock model provider that returns a fixed sequence of responses.
 * Each response is a sequence of chunks.
 */
function createMockProvider(responses: ModelResponseChunk[][]): IModelProvider {
	let callIndex = 0;
	return {
		providerId: 'test',
		async *sendRequest(
			_systemPrompt: string,
			_messages: readonly IConversationMessage[],
			_tools: readonly IAgentToolDefinition[],
			_config: IModelRequestConfig,
			_token: CancellationToken,
		): AsyncGenerator<ModelResponseChunk> {
			const chunks = responses[callIndex++];
			if (!chunks) {
				throw new Error('Mock provider: no more responses');
			}
			for (const chunk of chunks) {
				yield chunk;
			}
		},
		async listModels() { return []; },
	};
}

function createMockTool(
	name: string,
	readOnly: boolean,
	handler: (args: Record<string, unknown>) => string | Promise<string>,
): IAgentTool {
	return {
		name,
		description: `Test tool: ${name}`,
		parametersSchema: { type: 'object', properties: {} },
		readOnly,
		async execute(args: Record<string, unknown>, _context: IToolContext): Promise<IToolResult> {
			const content = await handler(args);
			return { content };
		},
	};
}

function createErrorTool(name: string, error: string): IAgentTool {
	return {
		name,
		description: `Test error tool: ${name}`,
		parametersSchema: { type: 'object', properties: {} },
		readOnly: false,
		async execute(_args: Record<string, unknown>, _context: IToolContext): Promise<IToolResult> {
			throw new Error(error);
		},
	};
}

function defaultConfig(overrides: Partial<IAgentLoopConfig>): IAgentLoopConfig {
	return {
		modelProvider: overrides.modelProvider ?? createMockProvider([]),
		modelIdentity: overrides.modelIdentity ?? testModel,
		systemPrompt: overrides.systemPrompt ?? 'You are a test assistant.',
		tools: overrides.tools ?? [],
		requestConfig: overrides.requestConfig,
		middleware: overrides.middleware,
		maxIterations: overrides.maxIterations,
	};
}

async function collectEvents(
	messages: readonly IConversationMessage[],
	config: IAgentLoopConfig,
	token: CancellationToken = CancellationToken.None,
): Promise<AgentLoopEvent[]> {
	const events: AgentLoopEvent[] = [];
	for await (const event of runAgentLoop(messages, config, token)) {
		events.push(event);
	}
	return events;
}

function findEvents<K extends keyof IAgentLoopEventMap>(events: AgentLoopEvent[], type: K): IAgentLoopEventMap[K][] {
	return events.filter(e => e.type === type) as IAgentLoopEventMap[K][];
}

// -- Tests --------------------------------------------------------------------

suite('Agent Loop', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('text-only responses', () => {
		test('produces events for a simple text response', async () => {
			const provider = createMockProvider([
				[
					{ type: 'text-delta', text: 'Hello ' },
					{ type: 'text-delta', text: 'world!' },
				],
			]);

			const events = await collectEvents(
				[createUserMessage('Hi')],
				defaultConfig({ modelProvider: provider }),
			);

			// Should have: model-call-start, 2 deltas, model-call-complete, assistant-message, turn-boundary
			const modelStarts = findEvents(events, 'model-call-start');
			const deltas = findEvents(events, 'assistant-delta');
			const messages = findEvents(events, 'assistant-message');
			const boundaries = findEvents(events, 'turn-boundary');

			assert.strictEqual(modelStarts.length, 1);
			assert.strictEqual(deltas.length, 2);
			assert.strictEqual(deltas[0].text, 'Hello ');
			assert.strictEqual(deltas[1].text, 'world!');
			assert.strictEqual(messages.length, 1);
			assert.strictEqual(boundaries.length, 1);

			// Check the assistant message content
			const msg = messages[0].message;
			assert.strictEqual(msg.role, 'assistant');
			assert.strictEqual(msg.content.length, 1);
			assert.strictEqual(msg.content[0].type, 'text');
			if (msg.content[0].type === 'text') {
				assert.strictEqual(msg.content[0].text, 'Hello world!');
			}
			assert.deepStrictEqual(msg.modelIdentity, testModel);
		});

		test('handles empty response', async () => {
			const provider = createMockProvider([[]]);

			const events = await collectEvents(
				[createUserMessage('Hi')],
				defaultConfig({ modelProvider: provider }),
			);

			const messages = findEvents(events, 'assistant-message');
			assert.strictEqual(messages.length, 1);
			assert.strictEqual(messages[0].message.content.length, 0);
		});
	});

	suite('tool calls', () => {
		test('executes a single tool call and re-samples', async () => {
			let toolCalled = false;
			const tool = createMockTool('readFile', true, args => {
				toolCalled = true;
				assert.strictEqual(args['path'], 'test.txt');
				return 'file contents';
			});

			const provider = createMockProvider([
				// First response: tool call
				[
					{ type: 'text-delta', text: 'Let me read that.' },
					{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'readFile', arguments: '{"path":"test.txt"}' },
				],
				// Second response: final text
				[
					{ type: 'text-delta', text: 'The file contains: file contents' },
				],
			]);

			const events = await collectEvents(
				[createUserMessage('Read test.txt')],
				defaultConfig({ modelProvider: provider, tools: [tool] }),
			);

			assert.strictEqual(toolCalled, true);

			const toolStarts = findEvents(events, 'tool-start');
			const toolCompletes = findEvents(events, 'tool-complete');
			assert.strictEqual(toolStarts.length, 1);
			assert.strictEqual(toolStarts[0].toolName, 'readFile');
			assert.strictEqual(toolCompletes.length, 1);
			assert.strictEqual(toolCompletes[0].result, 'file contents');
			assert.strictEqual(toolCompletes[0].isError, false);

			// Should have two model calls
			const modelStarts = findEvents(events, 'model-call-start');
			assert.strictEqual(modelStarts.length, 2);
		});

		test('handles multiple tool calls in one response', async () => {
			const callOrder: string[] = [];
			const tool1 = createMockTool('readFile', true, args => {
				callOrder.push(`readFile:${args['path']}`);
				return `contents of ${args['path']}`;
			});
			const tool2 = createMockTool('grep', true, args => {
				callOrder.push(`grep:${args['pattern']}`);
				return 'grep results';
			});

			const provider = createMockProvider([
				// First response: two tool calls
				[
					{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'readFile', arguments: '{"path":"a.txt"}' },
					{ type: 'tool-call-complete', toolCallId: 'c2', toolName: 'grep', arguments: '{"pattern":"hello"}' },
				],
				// Second response: final
				[
					{ type: 'text-delta', text: 'Done.' },
				],
			]);

			const events = await collectEvents(
				[createUserMessage('Do things')],
				defaultConfig({ modelProvider: provider, tools: [tool1, tool2] }),
			);

			// Both tools should have been called (in parallel since both are readOnly)
			assert.strictEqual(callOrder.length, 2);
			assert.ok(callOrder.includes('readFile:a.txt'));
			assert.ok(callOrder.includes('grep:hello'));

			const toolCompletes = findEvents(events, 'tool-complete');
			assert.strictEqual(toolCompletes.length, 2);
		});

		test('serializes mutating tool calls', async () => {
			const callOrder: string[] = [];
			const tool = createMockTool('bash', false, async args => {
				callOrder.push(`bash:${args['command']}`);
				// Small delay to verify sequential execution
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

			await collectEvents(
				[createUserMessage('Run commands')],
				defaultConfig({ modelProvider: provider, tools: [tool] }),
			);

			assert.deepStrictEqual(callOrder, ['bash:ls', 'bash:pwd']);
		});

		test('handles unknown tool gracefully', async () => {
			const provider = createMockProvider([
				[
					{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'nonexistent', arguments: '{}' },
				],
				[{ type: 'text-delta', text: 'OK' }],
			]);

			const events = await collectEvents(
				[createUserMessage('Use a tool')],
				defaultConfig({ modelProvider: provider }),
			);

			const toolCompletes = findEvents(events, 'tool-complete');
			assert.strictEqual(toolCompletes.length, 1);
			assert.strictEqual(toolCompletes[0].isError, true);
			assert.ok(toolCompletes[0].result.includes('Unknown tool'));
		});

		test('handles tool execution error', async () => {
			const tool = createErrorTool('failTool', 'Something went wrong');

			const provider = createMockProvider([
				[
					{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'failTool', arguments: '{}' },
				],
				[{ type: 'text-delta', text: 'I see there was an error.' }],
			]);

			const events = await collectEvents(
				[createUserMessage('Use failing tool')],
				defaultConfig({ modelProvider: provider, tools: [tool] }),
			);

			const toolCompletes = findEvents(events, 'tool-complete');
			assert.strictEqual(toolCompletes.length, 1);
			assert.strictEqual(toolCompletes[0].isError, true);
			assert.ok(toolCompletes[0].result.includes('Something went wrong'));
		});

		test('handles malformed tool arguments', async () => {
			const tool = createMockTool('readFile', true, () => 'content');

			const provider = createMockProvider([
				[
					{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'readFile', arguments: 'invalid json{' },
				],
				[{ type: 'text-delta', text: 'OK' }],
			]);

			const events = await collectEvents(
				[createUserMessage('Read file')],
				defaultConfig({ modelProvider: provider, tools: [tool] }),
			);

			// Should succeed -- malformed args are parsed as empty object
			const toolCompletes = findEvents(events, 'tool-complete');
			assert.strictEqual(toolCompletes.length, 1);
			assert.strictEqual(toolCompletes[0].isError, false);
		});
	});

	suite('thinking/reasoning', () => {
		test('emits reasoning deltas and includes thinking in message', async () => {
			const provider = createMockProvider([
				[
					{ type: 'thinking-delta', text: 'Let me think' },
					{ type: 'thinking-delta', text: ' about this...' },
					{ type: 'thinking-signature', signature: 'sig_abc' },
					{ type: 'text-delta', text: 'The answer is 42.' },
				],
			]);

			const events = await collectEvents(
				[createUserMessage('Deep question')],
				defaultConfig({ modelProvider: provider }),
			);

			const reasoningDeltas = findEvents(events, 'reasoning-delta');
			assert.strictEqual(reasoningDeltas.length, 2);
			assert.strictEqual(reasoningDeltas[0].text, 'Let me think');
			assert.strictEqual(reasoningDeltas[1].text, ' about this...');

			const messages = findEvents(events, 'assistant-message');
			const msg = messages[0].message;
			// Thinking part should come first in the content
			assert.strictEqual(msg.content[0].type, 'thinking');
			if (msg.content[0].type === 'thinking') {
				assert.strictEqual(msg.content[0].text, 'Let me think about this...');
				assert.strictEqual(msg.content[0].signature, 'sig_abc');
			}
			assert.strictEqual(msg.content[1].type, 'text');
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

			const events = await collectEvents(
				[createUserMessage('Hi')],
				defaultConfig({ modelProvider: provider }),
			);

			const usageEvents = findEvents(events, 'usage');
			assert.strictEqual(usageEvents.length, 1);
			assert.strictEqual(usageEvents[0].inputTokens, 100);
			assert.strictEqual(usageEvents[0].outputTokens, 50);
			assert.strictEqual(usageEvents[0].cacheReadTokens, 20);
		});
	});

	suite('cancellation', () => {
		test('throws CancellationError when token is cancelled', async () => {
			const cts = store.add(new CancellationTokenSource());

			const provider = createMockProvider([
				[
					{ type: 'text-delta', text: 'Starting...' },
					// The cancellation happens during tool execution below
				],
			]);

			// Cancel immediately
			cts.cancel();

			await assert.rejects(
				async () => collectEvents([createUserMessage('Hi')], defaultConfig({ modelProvider: provider }), cts.token),
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
					// Cancel the token during tool execution
					cts.cancel();
					if (context.token.isCancellationRequested) {
						throw new CancellationError();
					}
					return { content: 'should not reach' };
				},
			};

			const provider = createMockProvider([
				[
					{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'slowTool', arguments: '{}' },
				],
			]);

			await assert.rejects(
				async () => collectEvents(
					[createUserMessage('Run slow tool')],
					defaultConfig({ modelProvider: provider, tools: [tool] }),
					cts.token,
				),
				CancellationError,
			);
		});
	});

	suite('max iterations', () => {
		test('emits error when max iterations exceeded', async () => {
			// Provider that always returns a tool call (infinite loop)
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

			const events = await collectEvents(
				[createUserMessage('Loop forever')],
				defaultConfig({ modelProvider: provider, tools: [tool], maxIterations: 3 }),
			);

			const errors = findEvents(events, 'error');
			assert.strictEqual(errors.length, 1);
			assert.strictEqual(errors[0].fatal, true);
			assert.ok(errors[0].error.message.includes('maximum iterations'));
		});
	});

	suite('middleware integration', () => {
		test('pre-request middleware can modify messages', async () => {
			let receivedMessages: readonly IConversationMessage[] | undefined;
			const provider: IModelProvider = {
				providerId: 'test',
				async *sendRequest(_system, messages) {
					receivedMessages = messages;
					yield { type: 'text-delta' as const, text: 'OK' };
				},
				async listModels() { return []; },
			};

			const mw: IMiddleware = {
				preRequest(ctx) {
					return {
						messages: [...ctx.messages, createUserMessage('injected')],
						tools: ctx.tools,
					};
				},
			};

			await collectEvents(
				[createUserMessage('original')],
				defaultConfig({ modelProvider: provider, middleware: [mw] }),
			);

			assert.ok(receivedMessages);
			assert.strictEqual(receivedMessages!.length, 2);
		});

		test('pre-tool middleware can skip tool execution', async () => {
			let toolExecuted = false;
			const tool = createMockTool('dangerous', false, () => {
				toolExecuted = true;
				return 'executed';
			});

			const mw: IMiddleware = {
				preTool() {
					return { arguments: {}, skip: true, cannedResult: 'Permission denied' };
				},
			};

			const provider = createMockProvider([
				[{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'dangerous', arguments: '{}' }],
				[{ type: 'text-delta', text: 'OK' }],
			]);

			const events = await collectEvents(
				[createUserMessage('Do something dangerous')],
				defaultConfig({ modelProvider: provider, tools: [tool], middleware: [mw] }),
			);

			assert.strictEqual(toolExecuted, false);
			const toolCompletes = findEvents(events, 'tool-complete');
			assert.strictEqual(toolCompletes[0].result, 'Permission denied');
		});

		test('post-tool middleware can modify results', async () => {
			const tool = createMockTool('readFile', true, () => 'secret data here');

			const mw: IMiddleware = {
				postTool(ctx) {
					return { result: ctx.result.replace('secret', '[REDACTED]'), isError: ctx.isError };
				},
			};

			const provider = createMockProvider([
				[{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'readFile', arguments: '{}' }],
				[{ type: 'text-delta', text: 'OK' }],
			]);

			const events = await collectEvents(
				[createUserMessage('Read file')],
				defaultConfig({ modelProvider: provider, tools: [tool], middleware: [mw] }),
			);

			const toolCompletes = findEvents(events, 'tool-complete');
			assert.strictEqual(toolCompletes[0].result, '[REDACTED] data here');
		});

		test('post-response middleware can request retry', async () => {
			let modelCallCount = 0;
			const provider: IModelProvider = {
				providerId: 'test',
				async *sendRequest() {
					modelCallCount++;
					yield { type: 'text-delta' as const, text: `response ${modelCallCount}` };
				},
				async listModels() { return []; },
			};

			let retryRequested = false;
			const mw: IMiddleware = {
				postResponse() {
					if (!retryRequested) {
						retryRequested = true;
						return { retry: true };
					}
					return {};
				},
			};

			await collectEvents(
				[createUserMessage('Hi')],
				defaultConfig({ modelProvider: provider, middleware: [mw] }),
			);

			// Should have called the model twice (original + retry)
			assert.strictEqual(modelCallCount, 2);
		});
	});

	suite('event ordering', () => {
		test('events follow correct order for text-only response', async () => {
			const provider = createMockProvider([
				[{ type: 'text-delta', text: 'Hi' }],
			]);

			const events = await collectEvents(
				[createUserMessage('Hello')],
				defaultConfig({ modelProvider: provider }),
			);

			const types = events.map(e => e.type);
			assert.deepStrictEqual(types, [
				'model-call-start',
				'assistant-delta',
				'model-call-complete',
				'assistant-message',
				'turn-boundary',
			]);
		});

		test('events follow correct order for tool call flow', async () => {
			const tool = createMockTool('myTool', true, () => 'result');
			const provider = createMockProvider([
				[{ type: 'tool-call-complete', toolCallId: 'c1', toolName: 'myTool', arguments: '{}' }],
				[{ type: 'text-delta', text: 'Done.' }],
			]);

			const events = await collectEvents(
				[createUserMessage('Do it')],
				defaultConfig({ modelProvider: provider, tools: [tool] }),
			);

			const types = events.map(e => e.type);
			assert.deepStrictEqual(types, [
				'model-call-start',      // First model call
				'model-call-complete',
				'assistant-message',     // Message with tool call
				'tool-start',            // Tool execution
				'tool-complete',
				'model-call-start',      // Re-sample
				'assistant-delta',
				'model-call-complete',
				'assistant-message',     // Final message
				'turn-boundary',
			]);
		});
	});
});
