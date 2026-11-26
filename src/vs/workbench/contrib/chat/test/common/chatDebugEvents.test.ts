/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ChatDebugLogLevel, IChatDebugGenericEvent, IChatDebugModelTurnEvent, IChatDebugSubagentInvocationEvent, IChatDebugToolCallEvent, IChatDebugUserMessageEvent, IChatDebugAgentResponseEvent } from '../../common/chatDebugService.js';
import { debugEventMatchesText, parseTimeToken, stripTimestampTokens } from '../../common/chatDebugEvents.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

const sessionResource = URI.parse('vscode-chat-session://local/test');

function makeGenericEvent(overrides: Partial<IChatDebugGenericEvent> = {}): IChatDebugGenericEvent {
	return {
		kind: 'generic',
		sessionResource,
		created: new Date('2026-03-10T12:00:00Z'),
		name: 'test-event',
		level: ChatDebugLogLevel.Info,
		...overrides,
	};
}

function makeToolCallEvent(overrides: Partial<IChatDebugToolCallEvent> = {}): IChatDebugToolCallEvent {
	return {
		kind: 'toolCall',
		sessionResource,
		created: new Date('2026-03-10T12:01:00Z'),
		toolName: 'readFile',
		...overrides,
	};
}

function makeModelTurnEvent(overrides: Partial<IChatDebugModelTurnEvent> = {}): IChatDebugModelTurnEvent {
	return {
		kind: 'modelTurn',
		sessionResource,
		created: new Date('2026-03-10T12:02:00Z'),
		model: 'gpt-4o',
		requestName: 'chat-request',
		...overrides,
	};
}

function makeSubagentEvent(overrides: Partial<IChatDebugSubagentInvocationEvent> = {}): IChatDebugSubagentInvocationEvent {
	return {
		kind: 'subagentInvocation',
		sessionResource,
		created: new Date('2026-03-10T12:03:00Z'),
		agentName: 'explorer',
		...overrides,
	};
}

function makeUserMessageEvent(overrides: Partial<IChatDebugUserMessageEvent> = {}): IChatDebugUserMessageEvent {
	return {
		kind: 'userMessage',
		sessionResource,
		created: new Date('2026-03-10T12:04:00Z'),
		message: 'hello world',
		sections: [],
		...overrides,
	};
}

function makeAgentResponseEvent(overrides: Partial<IChatDebugAgentResponseEvent> = {}): IChatDebugAgentResponseEvent {
	return {
		kind: 'agentResponse',
		sessionResource,
		created: new Date('2026-03-10T12:05:00Z'),
		message: 'Here is the answer',
		sections: [],
		...overrides,
	};
}

suite('chatDebugEvents', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('debugEventMatchesText', () => {
		test('matches event kind', () => {
			assert.strictEqual(debugEventMatchesText(makeToolCallEvent(), 'toolcall'), true);
			assert.strictEqual(debugEventMatchesText(makeToolCallEvent(), 'generic'), false);
		});

		test('matches toolCall tool name', () => {
			assert.strictEqual(debugEventMatchesText(makeToolCallEvent({ toolName: 'readFile' }), 'readfile'), true);
			assert.strictEqual(debugEventMatchesText(makeToolCallEvent({ toolName: 'readFile' }), 'writefile'), false);
		});

		test('matches toolCall input and output', () => {
			const event = makeToolCallEvent({ input: 'path/to/file.ts', output: 'file contents' });
			assert.strictEqual(debugEventMatchesText(event, 'path/to'), true);
			assert.strictEqual(debugEventMatchesText(event, 'contents'), true);
			assert.strictEqual(debugEventMatchesText(event, 'missing'), false);
		});

		test('matches modelTurn model and requestName', () => {
			assert.strictEqual(debugEventMatchesText(makeModelTurnEvent({ model: 'gpt-4o' }), 'gpt-4o'), true);
			assert.strictEqual(debugEventMatchesText(makeModelTurnEvent({ requestName: 'chat-request' }), 'chat-request'), true);
		});

		test('matches generic event name, details, and category', () => {
			const event = makeGenericEvent({ name: 'discovery', details: 'loaded 5 files', category: 'instructions' });
			assert.strictEqual(debugEventMatchesText(event, 'discovery'), true);
			assert.strictEqual(debugEventMatchesText(event, 'loaded'), true);
			assert.strictEqual(debugEventMatchesText(event, 'instructions'), true);
			assert.strictEqual(debugEventMatchesText(event, 'missing'), false);
		});

		test('matches subagentInvocation agent name and description', () => {
			const event = makeSubagentEvent({ agentName: 'explorer', description: 'search codebase' });
			assert.strictEqual(debugEventMatchesText(event, 'explorer'), true);
			assert.strictEqual(debugEventMatchesText(event, 'codebase'), true);
		});

		test('matches userMessage message and sections', () => {
			const event = makeUserMessageEvent({
				message: 'fix the bug',
				sections: [{ name: 'system', content: 'you are a helpful assistant' }],
			});
			assert.strictEqual(debugEventMatchesText(event, 'fix'), true);
			assert.strictEqual(debugEventMatchesText(event, 'system'), true);
			assert.strictEqual(debugEventMatchesText(event, 'helpful'), true);
		});

		test('matches agentResponse message and sections', () => {
			const event = makeAgentResponseEvent({
				message: 'done',
				sections: [{ name: 'result', content: 'applied 3 edits' }],
			});
			assert.strictEqual(debugEventMatchesText(event, 'done'), true);
			assert.strictEqual(debugEventMatchesText(event, 'result'), true);
			assert.strictEqual(debugEventMatchesText(event, 'edits'), true);
		});
	});

	suite('parseTimeToken', () => {
		test('parses year-only before token', () => {
			const result = parseTimeToken('before:2026', 'before');
			assert.strictEqual(result, new Date(2026, 11, 31, 23, 59, 59, 999).getTime());
		});

		test('parses year-month before token', () => {
			const result = parseTimeToken('before:2026-03', 'before');
			// End of March 2026
			assert.strictEqual(result, new Date(2026, 3, 0, 23, 59, 59, 999).getTime());
		});

		test('parses full date before token', () => {
			const result = parseTimeToken('before:2026-03-10', 'before');
			assert.strictEqual(result, new Date(2026, 2, 10, 23, 59, 59, 999).getTime());
		});

		test('parses year-only after token', () => {
			const result = parseTimeToken('after:2026', 'after');
			assert.strictEqual(result, new Date(2026, 0, 1, 0, 0, 0, 0).getTime());
		});

		test('parses full date after token', () => {
			const result = parseTimeToken('after:2026-03-10', 'after');
			assert.strictEqual(result, new Date(2026, 2, 10, 0, 0, 0, 0).getTime());
		});

		test('returns undefined when token is absent', () => {
			assert.strictEqual(parseTimeToken('some text', 'before'), undefined);
			assert.strictEqual(parseTimeToken('some text', 'after'), undefined);
		});
	});

	suite('stripTimestampTokens', () => {
		test('strips before token', () => {
			assert.strictEqual(stripTimestampTokens('before:2026-03 hello'), 'hello');
		});

		test('strips after token', () => {
			assert.strictEqual(stripTimestampTokens('after:2026-03-10 hello'), 'hello');
		});

		test('strips both tokens', () => {
			assert.strictEqual(stripTimestampTokens('after:2026-03 before:2026-04 hello'), 'hello');
		});

		test('returns text unchanged when no tokens', () => {
			assert.strictEqual(stripTimestampTokens('hello world'), 'hello world');
		});
	});
});
