/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ChatDebugLogLevel, IChatDebugEvent, IChatDebugGenericEvent, IChatDebugModelTurnEvent, IChatDebugSubagentInvocationEvent, IChatDebugToolCallEvent, IChatDebugUserMessageEvent, IChatDebugAgentResponseEvent } from '../../common/chatDebugService.js';
import { debugEventMatchesText, filterDebugEvents, filterDebugEventsByText, parseTimeToken, stripTimestampTokens } from '../../common/chatDebugEvents.js';
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

	suite('filterDebugEventsByText', () => {
		// parseTimeToken uses local-time Date constructors, so event timestamps
		// must also be in local time to produce predictable comparisons.
		const events: readonly IChatDebugEvent[] = [
			makeGenericEvent({ name: 'discovery', category: 'instructions', created: new Date(2026, 2, 10, 10, 0, 0) }),
			makeToolCallEvent({ toolName: 'readFile', created: new Date(2026, 2, 10, 11, 0, 0) }),
			makeToolCallEvent({ toolName: 'writeFile', created: new Date(2026, 2, 10, 12, 0, 0) }),
			makeModelTurnEvent({ model: 'gpt-4o', created: new Date(2026, 2, 10, 13, 0, 0) }),
		];

		test('filters by inclusion term', () => {
			const result = filterDebugEventsByText(events, 'readfile');
			assert.strictEqual(result.length, 1);
			assert.strictEqual((result[0] as IChatDebugToolCallEvent).toolName, 'readFile');
		});

		test('filters by exclusion term', () => {
			const result = filterDebugEventsByText(events, '!readfile');
			assert.strictEqual(result.length, 3);
		});

		test('handles comma-separated terms as OR', () => {
			const result = filterDebugEventsByText(events, 'readfile, writefile');
			assert.strictEqual(result.length, 2);
		});

		test('combines inclusion and exclusion', () => {
			const result = filterDebugEventsByText(events, 'toolcall, !readfile');
			assert.strictEqual(result.length, 1);
			assert.strictEqual((result[0] as IChatDebugToolCallEvent).toolName, 'writeFile');
		});

		test('filters by before timestamp', () => {
			const result = filterDebugEventsByText(events, 'before:2026-03-10t11');
			assert.strictEqual(result.length, 2); // 10:00 and 11:00 (before rounds up to 11:59:59)
		});

		test('filters by after timestamp', () => {
			const result = filterDebugEventsByText(events, 'after:2026-03-10t12');
			assert.strictEqual(result.length, 2); // 12:00 and 13:00
		});

		test('combines timestamp and text filters', () => {
			const result = filterDebugEventsByText(events, 'after:2026-03-10t11 toolcall');
			assert.strictEqual(result.length, 2); // writeFile at 12:00 and readFile at 11:00
		});

		test('returns all events with empty filter', () => {
			const result = filterDebugEventsByText(events, '');
			assert.strictEqual(result.length, 4);
		});
	});

	suite('filterDebugEvents', () => {
		const events: readonly IChatDebugEvent[] = [
			makeGenericEvent({ name: 'event-1', created: new Date('2026-03-10T10:00:00Z') }),
			makeToolCallEvent({ toolName: 'readFile', created: new Date('2026-03-10T11:00:00Z') }),
			makeToolCallEvent({ toolName: 'writeFile', created: new Date('2026-03-10T12:00:00Z') }),
			makeModelTurnEvent({ model: 'gpt-4o', created: new Date('2026-03-10T13:00:00Z') }),
			makeSubagentEvent({ agentName: 'explorer', created: new Date('2026-03-10T14:00:00Z') }),
		];

		test('returns all events with empty options', () => {
			assert.deepStrictEqual(filterDebugEvents(events, {}), events);
		});

		test('filters by kind', () => {
			const result = filterDebugEvents(events, { kind: 'toolCall' });
			assert.strictEqual(result.length, 2);
			assert.ok(result.every(e => e.kind === 'toolCall'));
		});

		test('filters by kind with no matches', () => {
			const result = filterDebugEvents(events, { kind: 'userMessage' });
			assert.strictEqual(result.length, 0);
		});

		test('filters by text', () => {
			const result = filterDebugEvents(events, { filter: 'readfile' });
			assert.strictEqual(result.length, 1);
			assert.strictEqual((result[0] as IChatDebugToolCallEvent).toolName, 'readFile');
		});

		test('limits to N most recent', () => {
			const result = filterDebugEvents(events, { limit: 2 });
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].kind, 'modelTurn');
			assert.strictEqual(result[1].kind, 'subagentInvocation');
		});

		test('limit larger than event count returns all', () => {
			const result = filterDebugEvents(events, { limit: 100 });
			assert.strictEqual(result.length, 5);
		});

		test('limit of 0 returns all', () => {
			const result = filterDebugEvents(events, { limit: 0 });
			assert.strictEqual(result.length, 5);
		});

		test('limit of negative returns all', () => {
			const result = filterDebugEvents(events, { limit: -1 });
			assert.strictEqual(result.length, 5);
		});

		test('combines kind and text filters', () => {
			const result = filterDebugEvents(events, { kind: 'toolCall', filter: 'readfile' });
			assert.strictEqual(result.length, 1);
			assert.strictEqual((result[0] as IChatDebugToolCallEvent).toolName, 'readFile');
		});

		test('combines kind and limit', () => {
			const result = filterDebugEvents(events, { kind: 'toolCall', limit: 1 });
			assert.strictEqual(result.length, 1);
			assert.strictEqual((result[0] as IChatDebugToolCallEvent).toolName, 'writeFile');
		});

		test('combines text filter and limit', () => {
			const result = filterDebugEvents(events, { filter: 'toolcall', limit: 1 });
			assert.strictEqual(result.length, 1);
			assert.strictEqual((result[0] as IChatDebugToolCallEvent).toolName, 'writeFile');
		});

		test('combines all three filters', () => {
			const allToolCalls: readonly IChatDebugEvent[] = [
				makeToolCallEvent({ toolName: 'readFile', created: new Date('2026-03-10T10:00:00Z') }),
				makeToolCallEvent({ toolName: 'writeFile', created: new Date('2026-03-10T11:00:00Z') }),
				makeToolCallEvent({ toolName: 'listDir', created: new Date('2026-03-10T12:00:00Z') }),
				makeGenericEvent({ name: 'unrelated', created: new Date('2026-03-10T13:00:00Z') }),
			];
			// kind=toolCall, exclude readFile, limit=1 → should get the most recent non-readFile toolCall (listDir)
			const result = filterDebugEvents(allToolCalls, { kind: 'toolCall', filter: '!readfile', limit: 1 });
			assert.strictEqual(result.length, 1);
			assert.strictEqual((result[0] as IChatDebugToolCallEvent).toolName, 'listDir');
		});
	});
});
