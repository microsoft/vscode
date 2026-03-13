/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatDebugLogLevel, IChatDebugAgentResponseEvent, IChatDebugGenericEvent, IChatDebugModelTurnEvent, IChatDebugSubagentInvocationEvent, IChatDebugToolCallEvent, IChatDebugUserMessageEvent } from '../../common/chatDebugService.js';
import { formatEventDetail } from '../../browser/chatDebug/chatDebugEventDetailRenderer.js';

suite('formatEventDetail', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('toolCall - minimal', () => {
		const event: IChatDebugToolCallEvent = {
			kind: 'toolCall',
			sessionResource: URI.parse('test://s1'),
			created: new Date(),
			toolName: 'readFile',
		};
		const result = formatEventDetail(event);
		assert.ok(result.includes('readFile'));
	});

	test('toolCall - with all fields', () => {
		const event: IChatDebugToolCallEvent = {
			kind: 'toolCall',
			sessionResource: URI.parse('test://s1'),
			created: new Date(),
			toolName: 'grep_search',
			toolCallId: 'tc-123',
			input: '{"query": "test"}',
			output: '5 results',
			result: 'success',
			durationInMillis: 250,
		};
		const result = formatEventDetail(event);
		assert.ok(result.includes('grep_search'));
		assert.ok(result.includes('tc-123'));
		assert.ok(result.includes('success'));
		assert.ok(result.includes('250'));
		assert.ok(result.includes('{"query": "test"}'));
		assert.ok(result.includes('5 results'));
	});

	test('modelTurn - minimal', () => {
		const event: IChatDebugModelTurnEvent = {
			kind: 'modelTurn',
			sessionResource: URI.parse('test://s1'),
			created: new Date(),
		};
		const result = formatEventDetail(event);
		assert.ok(result.length > 0);
	});

	test('modelTurn - with all fields', () => {
		const event: IChatDebugModelTurnEvent = {
			kind: 'modelTurn',
			sessionResource: URI.parse('test://s1'),
			created: new Date(),
			model: 'gpt-4o',
			inputTokens: 1000,
			outputTokens: 500,
			totalTokens: 1500,
			durationInMillis: 3200,
		};
		const result = formatEventDetail(event);
		assert.ok(result.includes('gpt-4o'));
		assert.ok(result.includes('1000'));
		assert.ok(result.includes('500'));
		assert.ok(result.includes('1500'));
		assert.ok(result.includes('3200'));
	});

	test('generic event', () => {
		const event: IChatDebugGenericEvent = {
			kind: 'generic',
			sessionResource: URI.parse('test://s1'),
			created: new Date(),
			name: 'Discovery Start',
			details: 'Loading instructions',
			level: ChatDebugLogLevel.Info,
		};
		const result = formatEventDetail(event);
		assert.ok(result.includes('Discovery Start'));
		assert.ok(result.includes('Loading instructions'));
	});

	test('generic event without details', () => {
		const event: IChatDebugGenericEvent = {
			kind: 'generic',
			sessionResource: URI.parse('test://s1'),
			created: new Date(),
			name: 'Something',
			level: ChatDebugLogLevel.Trace,
		};
		const result = formatEventDetail(event);
		assert.ok(result.includes('Something'));
	});

	test('subagentInvocation - minimal', () => {
		const event: IChatDebugSubagentInvocationEvent = {
			kind: 'subagentInvocation',
			sessionResource: URI.parse('test://s1'),
			created: new Date(),
			agentName: 'Explore',
		};
		const result = formatEventDetail(event);
		assert.ok(result.includes('Explore'));
	});

	test('subagentInvocation - with all fields', () => {
		const event: IChatDebugSubagentInvocationEvent = {
			kind: 'subagentInvocation',
			sessionResource: URI.parse('test://s1'),
			created: new Date(),
			agentName: 'Data',
			description: 'Querying KQL',
			status: 'completed',
			durationInMillis: 5000,
			toolCallCount: 3,
			modelTurnCount: 2,
		};
		const result = formatEventDetail(event);
		assert.ok(result.includes('Data'));
		assert.ok(result.includes('Querying KQL'));
		assert.ok(result.includes('completed'));
		assert.ok(result.includes('5000'));
		assert.ok(result.includes('3'));
		assert.ok(result.includes('2'));
	});

	test('userMessage', () => {
		const event: IChatDebugUserMessageEvent = {
			kind: 'userMessage',
			sessionResource: URI.parse('test://s1'),
			created: new Date(),
			message: 'Help me fix this bug',
			sections: [
				{ name: 'System Prompt', content: 'You are a helpful assistant.' },
				{ name: 'Context', content: 'file.ts attached' },
			],
		};
		const result = formatEventDetail(event);
		assert.ok(result.includes('Help me fix this bug'));
		assert.ok(result.includes('System Prompt'));
		assert.ok(result.includes('You are a helpful assistant.'));
		assert.ok(result.includes('Context'));
		assert.ok(result.includes('file.ts attached'));
	});

	test('userMessage with empty sections', () => {
		const event: IChatDebugUserMessageEvent = {
			kind: 'userMessage',
			sessionResource: URI.parse('test://s1'),
			created: new Date(),
			message: 'Simple prompt',
			sections: [],
		};
		const result = formatEventDetail(event);
		assert.ok(result.includes('Simple prompt'));
	});

	test('agentResponse', () => {
		const event: IChatDebugAgentResponseEvent = {
			kind: 'agentResponse',
			sessionResource: URI.parse('test://s1'),
			created: new Date(),
			message: 'Here is the fix',
			sections: [
				{ name: 'Code', content: 'const x = 1;' },
			],
		};
		const result = formatEventDetail(event);
		assert.ok(result.includes('Here is the fix'));
		assert.ok(result.includes('Code'));
		assert.ok(result.includes('const x = 1;'));
	});
});
