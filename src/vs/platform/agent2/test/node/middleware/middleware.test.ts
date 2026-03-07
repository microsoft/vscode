/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createUserMessage } from '../../../common/conversation.js';
import { CustomInstructionsMiddleware } from '../../../node/middleware/customInstructions.js';
import { ToolOutputTruncationMiddleware } from '../../../node/middleware/toolOutputTruncation.js';
import {
	AllowAllPolicy,
	DefaultPermissionPolicy,
	IPermissionHandler,
	IPermissionRequest,
	PermissionDecision,
	PermissionMiddleware,
} from '../../../node/middleware/permissionMiddleware.js';

suite('ToolOutputTruncationMiddleware', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('passes through short output', () => {
		const mw = new ToolOutputTruncationMiddleware(100);
		const result = mw.postTool({
			toolCallId: 'c1',
			toolName: 'test',
			arguments: {},
			result: 'short output',
			isError: false,
		});
		assert.strictEqual(result.result, 'short output');
		assert.strictEqual(result.isError, false);
	});

	test('truncates long output', () => {
		const mw = new ToolOutputTruncationMiddleware(50);
		const longOutput = 'a'.repeat(200);
		const result = mw.postTool({
			toolCallId: 'c1',
			toolName: 'test',
			arguments: {},
			result: longOutput,
			isError: false,
		});
		assert.ok(result.result.startsWith('a'.repeat(50)));
		assert.ok(result.result.includes('[Output truncated'));
		assert.ok(result.result.length < longOutput.length);
	});

	test('preserves error state', () => {
		const mw = new ToolOutputTruncationMiddleware(10);
		const result = mw.postTool({
			toolCallId: 'c1',
			toolName: 'test',
			arguments: {},
			result: 'a'.repeat(100),
			isError: true,
		});
		assert.strictEqual(result.isError, true);
	});

	test('handles exactly max length', () => {
		const mw = new ToolOutputTruncationMiddleware(10);
		const result = mw.postTool({
			toolCallId: 'c1',
			toolName: 'test',
			arguments: {},
			result: 'a'.repeat(10),
			isError: false,
		});
		assert.strictEqual(result.result, 'a'.repeat(10)); // Not truncated
	});
});

suite('PermissionMiddleware', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const neverHandler: IPermissionHandler = () => Promise.resolve(false);

	suite('AllowAllPolicy', () => {
		test('allows all tools', async () => {
			const mw = new PermissionMiddleware(new AllowAllPolicy(), neverHandler);
			const result = await mw.preTool({
				toolCallId: 'c1',
				toolName: 'bash',
				arguments: { command: 'rm -rf /' },
			});
			assert.strictEqual(result.skip, undefined);
			assert.deepStrictEqual(result.arguments, { command: 'rm -rf /' });
		});
	});

	suite('DefaultPermissionPolicy', () => {
		test('allows read-only tools automatically', async () => {
			const policy = new DefaultPermissionPolicy(['read_file', 'grep']);
			const mw = new PermissionMiddleware(policy, neverHandler);

			const result = await mw.preTool({
				toolCallId: 'c1',
				toolName: 'read_file',
				arguments: { path: 'test.txt' },
			});
			assert.strictEqual(result.skip, undefined);
		});

		test('asks for non-read-only tools', async () => {
			let asked = false;
			const handler: IPermissionHandler = async (req: IPermissionRequest) => {
				asked = true;
				assert.strictEqual(req.toolName, 'bash');
				return true;
			};

			const policy = new DefaultPermissionPolicy(['read_file']);
			const mw = new PermissionMiddleware(policy, handler);

			const result = await mw.preTool({
				toolCallId: 'c1',
				toolName: 'bash',
				arguments: { command: 'ls' },
			});
			assert.strictEqual(asked, true);
			assert.strictEqual(result.skip, undefined);
		});

		test('skips when user denies', async () => {
			const policy = new DefaultPermissionPolicy(['read_file']);
			const mw = new PermissionMiddleware(policy, () => Promise.resolve(false));

			const result = await mw.preTool({
				toolCallId: 'c1',
				toolName: 'bash',
				arguments: { command: 'danger' },
			});
			assert.strictEqual(result.skip, true);
			assert.ok(result.cannedResult?.includes('not approved'));
		});
	});

	suite('custom policy', () => {
		test('deny policy blocks everything', async () => {
			const policy = {
				evaluate() { return PermissionDecision.Deny; },
			};
			const mw = new PermissionMiddleware(policy, neverHandler);

			const result = await mw.preTool({
				toolCallId: 'c1',
				toolName: 'read_file',
				arguments: {},
			});
			assert.strictEqual(result.skip, true);
			assert.ok(result.cannedResult?.includes('not allowed'));
		});
	});
});

suite('CustomInstructionsMiddleware', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('appends instructions to system prompt', () => {
		const mw = new CustomInstructionsMiddleware({
			getInstructions: () => 'Always use TypeScript.',
		});

		const result = mw.preRequest({
			systemPrompt: 'You are a coding assistant.',
			messages: [createUserMessage('Hello')],
			tools: [],
		});

		assert.strictEqual(result.messages.length, 1);
		assert.ok(result.systemPrompt.includes('Always use TypeScript'));
		assert.ok(result.systemPrompt.includes('custom_instructions'));
		assert.ok(result.systemPrompt.includes('You are a coding assistant'));
	});

	test('passes through when no instructions', () => {
		const mw = new CustomInstructionsMiddleware({
			getInstructions: () => undefined,
		});

		const messages = [createUserMessage('Hello')];
		const result = mw.preRequest({ systemPrompt: 'base', messages, tools: [] });
		assert.strictEqual(result.messages.length, 1);
		assert.strictEqual(result.messages, messages);
		assert.strictEqual(result.systemPrompt, 'base');
	});

	test('preserves tools', () => {
		const mw = new CustomInstructionsMiddleware({
			getInstructions: () => 'Use these rules.',
		});

		const tools = [{ name: 'test', description: 'test', parametersSchema: {} }];
		const result = mw.preRequest({
			systemPrompt: 'base',
			messages: [createUserMessage('Hello')],
			tools,
		});
		assert.strictEqual(result.tools, tools);
	});
});
