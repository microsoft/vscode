/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentEventMapper } from '../../node/agentEventMapper.js';
/** Helper: flatten the result of mapProgressEventToActions into an array. */
function mapToArray(result) {
    if (!result) {
        return [];
    }
    return Array.isArray(result) ? result : [result];
}
suite('AgentEventMapper', () => {
    const session = URI.from({ scheme: 'copilot', path: '/test-session' });
    const turnId = 'turn-1';
    let mapper;
    setup(() => {
        mapper = new AgentEventMapper();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('first delta event creates a responsePart with content', () => {
        const event = {
            session,
            type: 'delta',
            messageId: 'msg-1',
            content: 'hello world',
        };
        const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
        assert.strictEqual(actions.length, 1);
        assert.strictEqual(actions[0].type, 'session/responsePart');
        const part = actions[0].part;
        assert.strictEqual(part.kind, 'markdown');
        assert.strictEqual(part.content, 'hello world');
        assert.ok(part.id);
    });
    test('subsequent delta event maps to session/delta action', () => {
        const first = { session, type: 'delta', messageId: 'msg-1', content: 'hello ' };
        const second = { session, type: 'delta', messageId: 'msg-1', content: 'world' };
        const firstActions = mapToArray(mapper.mapProgressEventToActions(first, session.toString(), turnId));
        const partId = firstActions[0].part.id;
        const secondActions = mapToArray(mapper.mapProgressEventToActions(second, session.toString(), turnId));
        assert.strictEqual(secondActions.length, 1);
        const delta = secondActions[0];
        assert.strictEqual(delta.type, 'session/delta');
        assert.strictEqual(delta.content, 'world');
        assert.strictEqual(delta.partId, partId);
    });
    test('tool_start event maps to toolCallStart + toolCallReady actions', () => {
        const event = {
            session,
            type: 'tool_start',
            toolCallId: 'tc-1',
            toolName: 'readFile',
            displayName: 'Read File',
            invocationMessage: 'Reading file...',
            toolInput: '/src/foo.ts',
            toolKind: 'terminal',
            language: 'shellscript',
        };
        const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
        assert.strictEqual(actions.length, 2);
        const startAction = actions[0];
        assert.strictEqual(startAction.type, 'session/toolCallStart');
        assert.strictEqual(startAction.toolCallId, 'tc-1');
        assert.strictEqual(startAction.toolName, 'readFile');
        assert.strictEqual(startAction.displayName, 'Read File');
        assert.strictEqual(startAction._meta?.toolKind, 'terminal');
        assert.strictEqual(startAction._meta?.language, 'shellscript');
        const readyAction = actions[1];
        assert.strictEqual(readyAction.type, 'session/toolCallReady');
        assert.strictEqual(readyAction.toolCallId, 'tc-1');
        assert.strictEqual(readyAction.invocationMessage, 'Reading file...');
        assert.strictEqual(readyAction.toolInput, '/src/foo.ts');
        assert.strictEqual(readyAction.confirmed, 'not-needed');
    });
    test('tool_complete event maps to session/toolCallComplete action', () => {
        const event = {
            session,
            type: 'tool_complete',
            toolCallId: 'tc-1',
            result: {
                success: true,
                pastTenseMessage: 'Read file successfully',
                content: [{ type: "text" /* ToolResultContentType.Text */, text: 'file contents here' }],
            },
        };
        const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
        assert.strictEqual(actions.length, 1);
        const complete = actions[0];
        assert.strictEqual(complete.type, 'session/toolCallComplete');
        assert.strictEqual(complete.toolCallId, 'tc-1');
        assert.strictEqual(complete.result.success, true);
        assert.strictEqual(complete.result.pastTenseMessage, 'Read file successfully');
        assert.deepStrictEqual(complete.result.content, [{ type: 'text', text: 'file contents here' }]);
    });
    test('idle event maps to session/turnComplete action', () => {
        const event = {
            session,
            type: 'idle',
        };
        const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
        assert.strictEqual(actions.length, 1);
        const turnComplete = actions[0];
        assert.strictEqual(turnComplete.type, 'session/turnComplete');
        assert.strictEqual(turnComplete.session.toString(), session.toString());
        assert.strictEqual(turnComplete.turnId, turnId);
    });
    test('error event maps to session/error action', () => {
        const event = {
            session,
            type: 'error',
            errorType: 'runtime',
            message: 'Something went wrong',
            stack: 'Error: Something went wrong\n    at foo.ts:1',
        };
        const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
        assert.strictEqual(actions.length, 1);
        const errorAction = actions[0];
        assert.strictEqual(errorAction.type, 'session/error');
        assert.strictEqual(errorAction.error.errorType, 'runtime');
        assert.strictEqual(errorAction.error.message, 'Something went wrong');
        assert.strictEqual(errorAction.error.stack, 'Error: Something went wrong\n    at foo.ts:1');
    });
    test('usage event maps to session/usage action', () => {
        const event = {
            session,
            type: 'usage',
            inputTokens: 100,
            outputTokens: 50,
            model: 'gpt-4',
            cacheReadTokens: 25,
        };
        const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
        assert.strictEqual(actions.length, 1);
        const usageAction = actions[0];
        assert.strictEqual(usageAction.type, 'session/usage');
        assert.strictEqual(usageAction.usage.inputTokens, 100);
        assert.strictEqual(usageAction.usage.outputTokens, 50);
        assert.strictEqual(usageAction.usage.model, 'gpt-4');
        assert.strictEqual(usageAction.usage.cacheReadTokens, 25);
    });
    test('title_changed event maps to session/titleChanged action', () => {
        const event = {
            session,
            type: 'title_changed',
            title: 'New Title',
        };
        const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
        assert.strictEqual(actions.length, 1);
        assert.strictEqual(actions[0].type, 'session/titleChanged');
        assert.strictEqual(actions[0].title, 'New Title');
    });
    test('first reasoning event creates a responsePart with content', () => {
        const event = {
            session,
            type: 'reasoning',
            content: 'Let me think about this...',
        };
        const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
        assert.strictEqual(actions.length, 1);
        assert.strictEqual(actions[0].type, 'session/responsePart');
        const part = actions[0].part;
        assert.strictEqual(part.kind, 'reasoning');
        assert.strictEqual(part.content, 'Let me think about this...');
        assert.ok(part.id);
    });
    test('subsequent reasoning event maps to session/reasoning action', () => {
        const first = { session, type: 'reasoning', content: 'Let me think...' };
        const second = { session, type: 'reasoning', content: ' more thoughts' };
        const firstActions = mapToArray(mapper.mapProgressEventToActions(first, session.toString(), turnId));
        const partId = firstActions[0].part.id;
        const secondActions = mapToArray(mapper.mapProgressEventToActions(second, session.toString(), turnId));
        assert.strictEqual(secondActions.length, 1);
        const reasoning = secondActions[0];
        assert.strictEqual(reasoning.type, 'session/reasoning');
        assert.strictEqual(reasoning.content, ' more thoughts');
        assert.strictEqual(reasoning.partId, partId);
    });
    test('message event with no prior deltas creates responsePart', () => {
        const event = {
            session,
            type: 'message',
            role: 'assistant',
            messageId: 'msg-1',
            content: 'Some full message',
        };
        const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
        assert.strictEqual(actions.length, 1);
        assert.strictEqual(actions[0].type, 'session/responsePart');
        const part = actions[0].part;
        assert.strictEqual(part.kind, 'markdown');
        assert.strictEqual(part.content, 'Some full message');
    });
    test('message event after deltas returns undefined', () => {
        // First send a delta so the mapper tracks a current markdown part
        const delta = { session, type: 'delta', messageId: 'msg-1', content: 'hello' };
        mapper.mapProgressEventToActions(delta, session.toString(), turnId);
        const event = {
            session,
            type: 'message',
            role: 'assistant',
            messageId: 'msg-1',
            content: 'hello',
        };
        const result = mapper.mapProgressEventToActions(event, session.toString(), turnId);
        assert.strictEqual(result, undefined);
    });
    test('message event after tool_start creates responsePart for post-tool text', () => {
        // Delta before tool call
        const delta = { session, type: 'delta', messageId: 'msg-1', content: 'before' };
        mapper.mapProgressEventToActions(delta, session.toString(), turnId);
        // Tool call clears the current markdown part
        const toolStart = {
            session, type: 'tool_start',
            toolCallId: 'tc-1', toolName: 'bash', displayName: 'Bash',
            invocationMessage: 'Running', toolInput: 'ls',
        };
        mapper.mapProgressEventToActions(toolStart, session.toString(), turnId);
        // Message event with text that came after the tool call
        const msg = {
            session, type: 'message', role: 'assistant',
            messageId: 'msg-2', content: 'after tool',
        };
        const actions = mapToArray(mapper.mapProgressEventToActions(msg, session.toString(), turnId));
        assert.strictEqual(actions.length, 1);
        assert.strictEqual(actions[0].type, 'session/responsePart');
        const part = actions[0].part;
        assert.strictEqual(part.kind, 'markdown');
        assert.strictEqual(part.content, 'after tool');
    });
    test('message event with user role returns undefined', () => {
        const event = {
            session, type: 'message', role: 'user',
            messageId: 'msg-1', content: 'user text',
        };
        const result = mapper.mapProgressEventToActions(event, session.toString(), turnId);
        assert.strictEqual(result, undefined);
    });
    test('message event with empty content returns undefined', () => {
        const event = {
            session, type: 'message', role: 'assistant',
            messageId: 'msg-1', content: '',
        };
        const result = mapper.mapProgressEventToActions(event, session.toString(), turnId);
        assert.strictEqual(result, undefined);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRFdmVudE1hcHBlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3Qvbm9kZS9hZ2VudEV2ZW50TWFwcGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQTBCaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFbEUsNkVBQTZFO0FBQzdFLFNBQVMsVUFBVSxDQUFDLE1BQXFEO0lBQ3hFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNiLE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ2xELENBQUM7QUFFRCxLQUFLLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO0lBRTlCLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZFLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQztJQUN4QixJQUFJLE1BQXdCLENBQUM7SUFFN0IsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUM7SUFDakMsQ0FBQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyx1REFBdUQsRUFB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