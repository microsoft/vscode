/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createUserMessage } from '../../common/conversation.js';
import { IMiddleware, runPostResponseMiddleware, runPostToolMiddleware, runPreRequestMiddleware, runPreToolMiddleware } from '../../common/middleware.js';

suite('Middleware runners', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('runPreRequestMiddleware', () => {
		test('passes through with no middleware', async () => {
			const messages = [createUserMessage('hello')];
			const tools = [{ name: 'test', description: 'test tool', parametersSchema: {} }];
			const result = await runPreRequestMiddleware([], { systemPrompt: 'prompt', messages, tools });
			assert.strictEqual(result.messages, messages);
			assert.strictEqual(result.tools, tools);
			assert.strictEqual(result.systemPrompt, 'prompt');
		});

		test('applies middleware transforms in order', async () => {
			const mw1: IMiddleware = {
				preRequest(ctx) {
					return {
						systemPrompt: ctx.systemPrompt,
						messages: [...ctx.messages, createUserMessage('injected by mw1')],
						tools: ctx.tools,
					};
				},
			};
			const mw2: IMiddleware = {
				preRequest(ctx) {
					return {
						systemPrompt: ctx.systemPrompt,
						messages: [...ctx.messages, createUserMessage('injected by mw2')],
						tools: ctx.tools,
					};
				},
			};

			const result = await runPreRequestMiddleware([mw1, mw2], {
				systemPrompt: 'prompt',
				messages: [createUserMessage('original')],
				tools: [],
			});

			assert.strictEqual(result.messages.length, 3);
			assert.strictEqual(result.messages[0].role, 'user');
			assert.strictEqual((result.messages[1] as { content: string }).content, 'injected by mw1');
			assert.strictEqual((result.messages[2] as { content: string }).content, 'injected by mw2');
		});

		test('skips middleware without preRequest', async () => {
			const mw: IMiddleware = {
				postResponse() { return {}; },
			};
			const messages = [createUserMessage('hello')];
			const result = await runPreRequestMiddleware([mw], { systemPrompt: 'prompt', messages, tools: [] });
			assert.strictEqual(result.messages, messages);
		});
	});

	suite('runPostResponseMiddleware', () => {
		test('returns no retry with no middleware', async () => {
			const result = await runPostResponseMiddleware([], {
				responseText: 'hello',
				hasToolCalls: false,
			});
			assert.strictEqual(result.retry, undefined);
		});

		test('signals retry when middleware requests it', async () => {
			const mw: IMiddleware = {
				postResponse() { return { retry: true }; },
			};
			const result = await runPostResponseMiddleware([mw], {
				responseText: 'hello',
				hasToolCalls: false,
			});
			assert.strictEqual(result.retry, true);
		});
	});

	suite('runPreToolMiddleware', () => {
		test('passes through arguments with no middleware', async () => {
			const args = { command: 'ls' };
			const result = await runPreToolMiddleware([], {
				toolCallId: 'c1',
				toolName: 'bash',
				arguments: args,
			});
			assert.deepStrictEqual(result.arguments, args);
			assert.strictEqual(result.skip, undefined);
		});

		test('allows middleware to modify arguments', async () => {
			const mw: IMiddleware = {
				preTool(ctx) {
					return { arguments: { ...ctx.arguments, timeout: 5000 } };
				},
			};
			const result = await runPreToolMiddleware([mw], {
				toolCallId: 'c1',
				toolName: 'bash',
				arguments: { command: 'ls' },
			});
			assert.deepStrictEqual(result.arguments, { command: 'ls', timeout: 5000 });
		});

		test('allows middleware to skip execution', async () => {
			const mw: IMiddleware = {
				preTool() {
					return { arguments: {}, skip: true, cannedResult: 'Permission denied' };
				},
			};
			const result = await runPreToolMiddleware([mw], {
				toolCallId: 'c1',
				toolName: 'bash',
				arguments: { command: 'rm -rf /' },
			});
			assert.strictEqual(result.skip, true);
			assert.strictEqual(result.cannedResult, 'Permission denied');
		});

		test('stops chain when middleware skips', async () => {
			let mw2Called = false;
			const mw1: IMiddleware = {
				preTool() {
					return { arguments: {}, skip: true, cannedResult: 'blocked' };
				},
			};
			const mw2: IMiddleware = {
				preTool(ctx) {
					mw2Called = true;
					return { arguments: ctx.arguments };
				},
			};
			await runPreToolMiddleware([mw1, mw2], {
				toolCallId: 'c1',
				toolName: 'bash',
				arguments: {},
			});
			assert.strictEqual(mw2Called, false);
		});
	});

	suite('runPostToolMiddleware', () => {
		test('passes through result with no middleware', async () => {
			const result = await runPostToolMiddleware([], {
				toolCallId: 'c1',
				toolName: 'bash',
				arguments: { command: 'ls' },
				result: 'output',
				isError: false,
			});
			assert.strictEqual(result.result, 'output');
			assert.strictEqual(result.isError, false);
		});

		test('allows middleware to modify result', async () => {
			const mw: IMiddleware = {
				postTool(ctx) {
					return { result: ctx.result + ' (modified)', isError: ctx.isError };
				},
			};
			const result = await runPostToolMiddleware([mw], {
				toolCallId: 'c1',
				toolName: 'bash',
				arguments: {},
				result: 'output',
				isError: false,
			});
			assert.strictEqual(result.result, 'output (modified)');
		});
	});
});
