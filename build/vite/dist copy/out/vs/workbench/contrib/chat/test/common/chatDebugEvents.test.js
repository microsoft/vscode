/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ChatDebugLogLevel } from '../../common/chatDebugService.js';
import { debugEventMatchesText, filterDebugEvents, filterDebugEventsByText, parseTimeToken, stripTimestampTokens } from '../../common/chatDebugEvents.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
const sessionResource = URI.parse('vscode-chat-session://local/test');
function makeGenericEvent(overrides = {}) {
    return {
        kind: 'generic',
        sessionResource,
        created: new Date('2026-03-10T12:00:00Z'),
        name: 'test-event',
        level: ChatDebugLogLevel.Info,
        ...overrides,
    };
}
function makeToolCallEvent(overrides = {}) {
    return {
        kind: 'toolCall',
        sessionResource,
        created: new Date('2026-03-10T12:01:00Z'),
        toolName: 'readFile',
        ...overrides,
    };
}
function makeModelTurnEvent(overrides = {}) {
    return {
        kind: 'modelTurn',
        sessionResource,
        created: new Date('2026-03-10T12:02:00Z'),
        model: 'gpt-4o',
        requestName: 'chat-request',
        ...overrides,
    };
}
function makeSubagentEvent(overrides = {}) {
    return {
        kind: 'subagentInvocation',
        sessionResource,
        created: new Date('2026-03-10T12:03:00Z'),
        agentName: 'explorer',
        ...overrides,
    };
}
function makeUserMessageEvent(overrides = {}) {
    return {
        kind: 'userMessage',
        sessionResource,
        created: new Date('2026-03-10T12:04:00Z'),
        message: 'hello world',
        sections: [],
        ...overrides,
    };
}
function makeAgentResponseEvent(overrides = {}) {
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
        const events = [
            makeGenericEvent({ name: 'discovery', category: 'instructions', created: new Date(2026, 2, 10, 10, 0, 0) }),
            makeToolCallEvent({ toolName: 'readFile', created: new Date(2026, 2, 10, 11, 0, 0) }),
            makeToolCallEvent({ toolName: 'writeFile', created: new Date(2026, 2, 10, 12, 0, 0) }),
            makeModelTurnEvent({ model: 'gpt-4o', created: new Date(2026, 2, 10, 13, 0, 0) }),
        ];
        test('filters by inclusion term', () => {
            const result = filterDebugEventsByText(events, 'readfile');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].toolName, 'readFile');
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
            assert.strictEqual(result[0].toolName, 'writeFile');
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
        const events = [
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
            assert.strictEqual(result[0].toolName, 'readFile');
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
            assert.strictEqual(result[0].toolName, 'readFile');
        });
        test('combines kind and limit', () => {
            const result = filterDebugEvents(events, { kind: 'toolCall', limit: 1 });
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].toolName, 'writeFile');
        });
        test('combines text filter and limit', () => {
            const result = filterDebugEvents(events, { filter: 'toolcall', limit: 1 });
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].toolName, 'writeFile');
        });
        test('combines all three filters', () => {
            const allToolCalls = [
                makeToolCallEvent({ toolName: 'readFile', created: new Date('2026-03-10T10:00:00Z') }),
                makeToolCallEvent({ toolName: 'writeFile', created: new Date('2026-03-10T11:00:00Z') }),
                makeToolCallEvent({ toolName: 'listDir', created: new Date('2026-03-10T12:00:00Z') }),
                makeGenericEvent({ name: 'unrelated', created: new Date('2026-03-10T13:00:00Z') }),
            ];
            // kind=toolCall, exclude readFile, limit=1 → should get the most recent non-readFile toolCall (listDir)
            const result = filterDebugEvents(allToolCalls, { kind: 'toolCall', filter: '!readfile', limit: 1 });
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].toolName, 'listDir');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnRXZlbnRzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL2NoYXREZWJ1Z0V2ZW50cy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLGlCQUFpQixFQUEyTCxNQUFNLGtDQUFrQyxDQUFDO0FBQzlQLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxjQUFjLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxSixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxNQUFNLGVBQWUsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7QUFFdEUsU0FBUyxnQkFBZ0IsQ0FBQyxZQUE2QyxFQUFFO0lBQ3hFLE9BQU87UUFDTixJQUFJLEVBQUUsU0FBUztRQUNmLGVBQWU7UUFDZixPQUFPLEVBQUUsSUFBSSxJQUFJLENBQUMsc0JBQXNCLENBQUM7UUFDekMsSUFBSSxFQUFFLFlBQVk7UUFDbEIsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUk7UUFDN0IsR0FBRyxTQUFTO0tBQ1osQ0FBQztBQUNILENBQUM7QUFFRCxTQUFTLGlCQUFpQixDQUFDLFlBQThDLEVBQUU7SUFDMUUsT0FBTztRQUNOLElBQUksRUFBRSxVQUFVO1FBQ2hCLGVBQWU7UUFDZixPQUFPLEVBQUUsSUFBSSxJQUFJLENBQUMsc0JBQXNCLENBQUM7UUFDekMsUUFBUSxFQUFFLFVBQVU7UUFDcEIsR0FBRyxTQUFTO0tBQ1osQ0FBQztB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