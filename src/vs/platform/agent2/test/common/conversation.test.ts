/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createAssistantMessage, createSystemMessage, createToolResultMessage, createUserMessage, getAssistantText, getToolCalls, IAssistantMessage, IModelIdentity, ISystemMessage, IToolResultMessage, IUserMessage } from '../../common/conversation.js';

suite('Conversation types', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const testModel: IModelIdentity = { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514' };

	suite('createSystemMessage', () => {
		test('creates a system message', () => {
			const msg = createSystemMessage('You are an assistant.');
			assert.deepStrictEqual(msg, {
				role: 'system',
				content: 'You are an assistant.',
			} satisfies ISystemMessage);
		});
	});

	suite('createUserMessage', () => {
		test('creates a user message without model identity', () => {
			const msg = createUserMessage('Hello');
			assert.deepStrictEqual(msg, {
				role: 'user',
				content: 'Hello',
				modelIdentity: undefined,
			} satisfies IUserMessage);
		});

		test('creates a user message with model identity', () => {
			const msg = createUserMessage('Hello', testModel);
			assert.deepStrictEqual(msg, {
				role: 'user',
				content: 'Hello',
				modelIdentity: testModel,
			} satisfies IUserMessage);
		});
	});

	suite('createAssistantMessage', () => {
		test('creates an assistant message with text content', () => {
			const msg = createAssistantMessage(
				[{ type: 'text', text: 'Hi there!' }],
				testModel,
			);
			assert.deepStrictEqual(msg, {
				role: 'assistant',
				content: [{ type: 'text', text: 'Hi there!' }],
				modelIdentity: testModel,
				providerMetadata: undefined,
			} satisfies IAssistantMessage);
		});

		test('creates an assistant message with tool calls', () => {
			const msg = createAssistantMessage(
				[
					{ type: 'text', text: 'Let me read that file.' },
					{ type: 'tool-call', toolCallId: 'call_1', toolName: 'readFile', arguments: { path: 'foo.ts' } },
				],
				testModel,
			);
			assert.strictEqual(msg.role, 'assistant');
			assert.strictEqual(msg.content.length, 2);
			assert.strictEqual(msg.content[0].type, 'text');
			assert.strictEqual(msg.content[1].type, 'tool-call');
		});

		test('creates an assistant message with thinking parts', () => {
			const msg = createAssistantMessage(
				[
					{ type: 'thinking', text: 'Let me think...', signature: 'sig_abc' },
					{ type: 'text', text: 'The answer is 42.' },
				],
				testModel,
			);
			assert.strictEqual(msg.content.length, 2);
			assert.strictEqual(msg.content[0].type, 'thinking');
			if (msg.content[0].type === 'thinking') {
				assert.strictEqual(msg.content[0].signature, 'sig_abc');
			}
		});

		test('preserves provider metadata', () => {
			const metadata = { encryptedReasoning: 'abc123', cacheControl: 'ephemeral' };
			const msg = createAssistantMessage(
				[{ type: 'text', text: 'Hello' }],
				testModel,
				metadata,
			);
			assert.deepStrictEqual(msg.providerMetadata, metadata);
		});
	});

	suite('createToolResultMessage', () => {
		test('creates a successful tool result', () => {
			const msg = createToolResultMessage('call_1', 'readFile', 'file contents here');
			assert.deepStrictEqual(msg, {
				role: 'tool-result',
				toolCallId: 'call_1',
				toolName: 'readFile',
				content: 'file contents here',
				isError: undefined,
			} satisfies IToolResultMessage);
		});

		test('creates an error tool result', () => {
			const msg = createToolResultMessage('call_1', 'readFile', 'File not found', true);
			assert.strictEqual(msg.isError, true);
			assert.strictEqual(msg.content, 'File not found');
		});
	});

	suite('getAssistantText', () => {
		test('extracts text from a text-only message', () => {
			const msg = createAssistantMessage(
				[{ type: 'text', text: 'Hello world' }],
				testModel,
			);
			assert.strictEqual(getAssistantText(msg), 'Hello world');
		});

		test('concatenates multiple text parts', () => {
			const msg = createAssistantMessage(
				[
					{ type: 'text', text: 'Hello ' },
					{ type: 'text', text: 'world' },
				],
				testModel,
			);
			assert.strictEqual(getAssistantText(msg), 'Hello world');
		});

		test('ignores non-text parts', () => {
			const msg = createAssistantMessage(
				[
					{ type: 'thinking', text: 'thinking...' },
					{ type: 'text', text: 'Answer: 42' },
					{ type: 'tool-call', toolCallId: 'c1', toolName: 'bash', arguments: { command: 'ls' } },
				],
				testModel,
			);
			assert.strictEqual(getAssistantText(msg), 'Answer: 42');
		});

		test('returns empty string for no text parts', () => {
			const msg = createAssistantMessage(
				[{ type: 'tool-call', toolCallId: 'c1', toolName: 'bash', arguments: { command: 'ls' } }],
				testModel,
			);
			assert.strictEqual(getAssistantText(msg), '');
		});
	});

	suite('getToolCalls', () => {
		test('extracts tool calls', () => {
			const msg = createAssistantMessage(
				[
					{ type: 'text', text: 'Let me do that.' },
					{ type: 'tool-call', toolCallId: 'c1', toolName: 'bash', arguments: { command: 'ls' } },
					{ type: 'tool-call', toolCallId: 'c2', toolName: 'readFile', arguments: { path: 'a.txt' } },
				],
				testModel,
			);
			const calls = getToolCalls(msg);
			assert.strictEqual(calls.length, 2);
			assert.strictEqual(calls[0].toolName, 'bash');
			assert.strictEqual(calls[1].toolName, 'readFile');
		});

		test('returns empty for no tool calls', () => {
			const msg = createAssistantMessage(
				[{ type: 'text', text: 'No tools needed.' }],
				testModel,
			);
			assert.strictEqual(getToolCalls(msg).length, 0);
		});
	});
});
