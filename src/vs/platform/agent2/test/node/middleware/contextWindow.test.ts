/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createToolResultMessage, createUserMessage } from '../../../common/conversation.js';
import { ContextWindowMiddleware } from '../../../node/middleware/contextWindow.js';

suite('ContextWindowMiddleware', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('passes through when under threshold', () => {
		const mw = new ContextWindowMiddleware({
			maxContextTokens: 100000,
		});
		const messages = [createUserMessage('Hello')];
		const result = mw.preRequest({ messages, tools: [] });
		assert.strictEqual(result.messages, messages);
	});

	test('prunes old tool outputs when over threshold', () => {
		const mw = new ContextWindowMiddleware({
			maxContextTokens: 100,
			compactionThreshold: 0.1, // Very low threshold to trigger
			recentToolResultsToKeep: 1,
			prunedOutputMaxLength: 20,
		});

		const longContent = 'a'.repeat(500);
		const messages = [
			createUserMessage('Do things'),
			createToolResultMessage('c1', 'read_file', longContent),
			createToolResultMessage('c2', 'read_file', longContent),
			createToolResultMessage('c3', 'read_file', 'recent result'), // Most recent
		];

		const result = mw.preRequest({ messages, tools: [] });

		// First two tool results should be pruned
		assert.strictEqual(result.messages.length, 4);

		// Most recent (c3) should be verbatim
		const lastToolResult = result.messages[3];
		assert.strictEqual(lastToolResult.role, 'tool-result');
		assert.strictEqual((lastToolResult as { content: string }).content, 'recent result');

		// Older tool results (c1, c2) should be truncated
		const firstToolResult = result.messages[1];
		assert.strictEqual(firstToolResult.role, 'tool-result');
		assert.ok((firstToolResult as { content: string }).content.length < longContent.length);
		assert.ok((firstToolResult as { content: string }).content.includes('truncated'));
	});

	test('keeps recent results verbatim', () => {
		const mw = new ContextWindowMiddleware({
			maxContextTokens: 100,
			compactionThreshold: 0.1,
			recentToolResultsToKeep: 2,
			prunedOutputMaxLength: 20,
		});

		const longContent = 'b'.repeat(500);
		const messages = [
			createUserMessage('Do things'),
			createToolResultMessage('c1', 'tool', longContent),  // Will be pruned
			createToolResultMessage('c2', 'tool', longContent),  // Recent - kept
			createToolResultMessage('c3', 'tool', longContent),  // Recent - kept
		];

		const result = mw.preRequest({ messages, tools: [] });

		// c1 should be pruned
		const firstToolResult = result.messages[1] as { content: string };
		assert.ok(firstToolResult.content.length < longContent.length);

		// c2 and c3 should be verbatim
		const secondToolResult = result.messages[2] as { content: string };
		assert.strictEqual(secondToolResult.content, longContent);
		const thirdToolResult = result.messages[3] as { content: string };
		assert.strictEqual(thirdToolResult.content, longContent);
	});

	test('does not prune short tool outputs', () => {
		const mw = new ContextWindowMiddleware({
			maxContextTokens: 100,
			compactionThreshold: 0.1,
			recentToolResultsToKeep: 0,
			prunedOutputMaxLength: 200,
		});

		const shortContent = 'short';
		const messages = [
			createUserMessage('Do things'),
			createToolResultMessage('c1', 'tool', shortContent),
		];

		const result = mw.preRequest({ messages, tools: [] });

		// Short content should not be truncated even when marked for pruning
		const toolResult = result.messages[1] as { content: string };
		assert.strictEqual(toolResult.content, shortContent);
	});

	test('preserves tools', () => {
		const mw = new ContextWindowMiddleware({
			maxContextTokens: 100000,
		});
		const tools = [{ name: 'test', description: 'test', parametersSchema: {} }];
		const result = mw.preRequest({
			messages: [createUserMessage('Hello')],
			tools,
		});
		assert.strictEqual(result.tools, tools);
	});
});
