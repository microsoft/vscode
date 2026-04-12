/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatDebugLogLevel } from '../../common/chatDebugService.js';
import { formatEventDetail } from '../../browser/chatDebug/chatDebugEventDetailRenderer.js';
suite('formatEventDetail', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('toolCall - minimal', () => {
        const event = {
            kind: 'toolCall',
            sessionResource: URI.parse('test://s1'),
            created: new Date(),
            toolName: 'readFile',
        };
        const result = formatEventDetail(event);
        assert.ok(result.includes('readFile'));
    });
    test('toolCall - with all fields', () => {
        const event = {
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
        const event = {
            kind: 'modelTurn',
            sessionResource: URI.parse('test://s1'),
            created: new Date(),
        };
        const result = formatEventDetail(event);
        assert.ok(result.length > 0);
    });
    test('modelTurn - with all fields', () => {
        const event = {
            kind: 'modelTurn',
            sessionResource: URI.parse('test://s1'),
            created: new Date(),
            model: 'gpt-4o',
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            durationInMillis: 320,
        };
        const result = formatEventDetail(event);
        assert.ok(result.includes('gpt-4o'));
        assert.ok(result.includes('100'));
        assert.ok(result.includes('50'));
        assert.ok(result.includes('150'));
        assert.ok(result.includes('320'));
    });
    test('generic event', () => {
        const event = {
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
        const event = {
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
        const event = {
            kind: 'subagentInvocation',
            sessionResource: URI.parse('test://s1'),
            created: new Date(),
            agentName: 'Explore',
        };
        const result = formatEventDetail(event);
        assert.ok(result.includes('Explore'));
    });
    test('subagentInvocation - with all fields', () => {
        const event = {
            kind: 'subagentInvocation',
            sessionResource: URI.parse('test://s1'),
            created: new Date(),
            agentName: 'Data',
            description: 'Querying KQL',
            status: 'completed',
            durationInMillis: 500,
            toolCallCount: 3,
            modelTurnCount: 2,
        };
        const result = formatEventDetail(event);
        assert.ok(result.includes('Data'));
        assert.ok(result.includes('Querying KQL'));
        assert.ok(result.includes('completed'));
        assert.ok(result.includes('500'));
        assert.ok(result.includes('3'));
        assert.ok(result.includes('2'));
    });
    test('userMessage', () => {
        const event = {
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
        const event = {
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
        const event = {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnRXZlbnREZXRhaWxSZW5kZXJlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvY2hhdERlYnVnRXZlbnREZXRhaWxSZW5kZXJlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLGlCQUFpQixFQUEwSyxNQUFNLGtDQUFrQyxDQUFDO0FBQzdPLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRTVGLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLEVBQUU7SUFDL0IsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxFQUFFO1FBQy9CLE1BQU0sS0FBSyxHQUE0QjtZQUN0QyxJQUFJLEVBQUUsVUFBVTtZQUNoQixlQUFlLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUM7WUFDdkMsT0FBTyxFQUFFLElBQUksSUFBSSxFQUFFO1lBQ25CLFFBQVEsRUFBRSxVQUFVO1NBQ3BCLENBQUM7UUFDRixNQUFNLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUN4QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0QkFBNEIsRUFBRSxHQUFHLEVBQUU7UUFDdkMsTUFBTSxLQUFLLEdBQTRCO1lBQ3RD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