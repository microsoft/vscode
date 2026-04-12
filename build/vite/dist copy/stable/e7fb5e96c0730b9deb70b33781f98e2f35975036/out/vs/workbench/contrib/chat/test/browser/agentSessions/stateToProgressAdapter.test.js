/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { turnsToHistory, activeTurnToProgress, toolCallStateToInvocation, finalizeToolInvocation } from '../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';
// ---- Helper factories -------------------------------------------------------
function createToolCallState(overrides) {
    return {
        toolCallId: 'tc-1',
        toolName: 'test_tool',
        displayName: 'Test Tool',
        invocationMessage: 'Running test tool...',
        status: "running" /* ToolCallStatus.Running */,
        confirmed: "not-needed" /* ToolCallConfirmationReason.NotNeeded */,
        ...overrides,
    };
}
function createCompletedToolCall(overrides) {
    return {
        status: "completed" /* ToolCallStatus.Completed */,
        toolCallId: 'tc-1',
        toolName: 'test_tool',
        displayName: 'Test Tool',
        invocationMessage: 'Running test tool...',
        success: true,
        confirmed: "not-needed" /* ToolCallConfirmationReason.NotNeeded */,
        pastTenseMessage: 'Ran test tool',
        ...overrides,
    };
}
function createTurn(overrides) {
    return {
        id: 'turn-1',
        userMessage: { text: 'Hello' },
        responseParts: [],
        usage: undefined,
        state: "complete" /* TurnState.Complete */,
        ...overrides,
    };
}
// ---- Tests ------------------------------------------------------------------
suite('stateToProgressAdapter', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('turnsToHistory', () => {
        test('empty turns produces empty history', () => {
            const result = turnsToHistory([], 'p');
            assert.deepStrictEqual(result, []);
        });
        test('single turn produces request + response pair', () => {
            const turn = createTurn({
                userMessage: { text: 'Do something' },
                responseParts: [{ kind: "toolCall" /* ResponsePartKind.ToolCall */, toolCall: createCompletedToolCall() }],
            });
            const history = turnsToHistory([turn], 'participant-1');
            assert.strictEqual(history.length, 2);
            // Request
            assert.strictEqual(history[0].type, 'request');
            assert.strictEqual(history[0].prompt, 'Do something');
            assert.strictEqual(history[0].participant, 'participant-1');
            // Response
            assert.strictEqual(history[1].type, 'response');
            assert.strictEqual(history[1].participant, 'participant-1');
            assert.strictEqual(history[1].parts.length, 1);
            const serialized = history[1].parts[0];
            assert.strictEqual(serialized.kind, 'toolInvocationSerialized');
            assert.strictEqual(serialized.toolCallId, 'tc-1');
            assert.strictEqual(serialized.toolId, 'test_tool');
            assert.strictEqual(serialized.isComplete, true);
        });
        test('terminal tool call in history has correct terminal data', () => {
            const turn = createTurn({
                responseParts: [{
                        kind: "toolCall" /* ResponsePartKind.ToolCall */, toolCall: createCompletedToolCall({
                            _meta: { toolKind: 'terminal', language: 'shellscript' },
                            toolInput: 'echo hello',
                            content: [{ type: "text" /* ToolResultContentType.Text */, text: 'hello' }],
                            success: true,
                        })
                    }],
            });
            const history = turnsToHistory([turn], 'p');
            const response = history[1];
            assert.strictEqual(response.type, 'response');
            if (response.type !== 'response') {
                return;
            }
            const serialized = response.parts[0];
            assert.ok(serialized.toolSpecificData);
            assert.strictEqual(serialized.toolSpecificData.kind, 'terminal');
            const termData = serialized.toolSpecificData;
            assert.strictEqual(termData.commandLine.original, 'echo hello');
            assert.strictEqual(termData.terminalCommandOutput.text, 'hello');
            assert.strictEqual(termData.terminalCommandState.exitCode, 0);
        });
        test('turn with responseText produces markdown content in history', () => {
            const turn = createTurn({
                responseParts: [{ kind: "markdown" /* ResponsePartKind.Markdown */, id: 'md-1', content: 'Hello world' }],
            });
            const history = turnsToHistory([turn], 'p');
            assert.strictEqual(history.length, 2);
            const response = history[1];
            assert.strictEqual(response.type, 'response');
            if (response.type !== 'response') {
                return;
            }
            assert.strictEqual(response.parts.length, 1);
            assert.strictEqual(response.parts[0].kind, 'markdownContent');
            assert.strictEqual(response.parts[0].content.value, 'Hello world');
        });
        test('error turn produces error message in history', () => {
            const turn = createTurn({
                state: "error" /* TurnState.Error */,
                error: { errorType: 'test', message: 'boom' },
            });
            const history = turnsToHistory([turn], 'p');
            const response = history[1];
            assert.strictEqual(response.type, 'response');
            if (response.type !== 'response') {
                return;
            }
            const errorPart = response.parts.find(p => p.kind === 'markdownContent' && p.content.value.includes('boom'));
            assert.ok(errorPart, 'Should have a markdownContent part containing the error message');
        });
        test('failed tool in history has exitCode 1', () => {
            const turn = createTurn({
                responseParts: [{
                        kind: "toolCall" /* ResponsePartKind.ToolCall */, toolCall: createCompletedToolCall({
                            _meta: { toolKind: 'terminal' },
                            toolInput: 'bad-command',
                            content: [{ type: "text" /* ToolResultContentType.Text */, text: 'error' }],
                            success: false,
                        })
                    }],
            });
            const history = turnsToHistory([turn], 'p');
            const response = history[1];
            assert.strictEqual(response.type, 'response');
            if (response.type !== 'response') {
                return;
            }
            const serialized = response.parts[0];
            assert.ok(serialized.toolSpecificData);
            assert.strictEqual(serialized.toolSpecificData.kind, 'terminal');
            const termData = serialized.toolSpecificData;
            assert.strictEqual(termData.terminalCommandState.exitCode, 1);
        });
    });
    suite('toolCallStateToInvocation', () => {
        test('creates ChatToolInvocation for running tool', () => {
            const tc = createToolCallState({
                toolCallId: 'tc-42',
                toolName: 'my_tool',
                displayName: 'My Tool',
                invocationMessage: 'Doing stuff',
                status: "running" /* ToolCallStatus.Running */,
            });
            const invocation = toolCallStateToInvocation(tc);
            assert.strictEqual(invocation.toolCallId, 'tc-42');
            assert.strictEqual(invocation.toolId, 'my_tool');
            assert.strictEqual(invocation.source, ToolDataSource.Internal);
        });
        test('sets terminal toolSpecificData', () => {
            const tc = createToolCallState({
                _meta: { toolKind: 'terminal' },
                toolInput: 'ls -la',
            });
            const invocation = toolCallStateToInvocation(tc);
            assert.ok(invocation.toolSpecificData);
            assert.strictEqual(invocation.toolSpecificData.kind, 'terminal');
            const termData = invocation.toolSpecificData;
            assert.strictEqual(termData.commandLine.original, 'ls -la');
        });
        test('creates invocation without toolArguments', () => {
            const tc = createToolCallState({});
            const invocation = toolCallStateToInvocation(tc);
            assert.strictEqual(invocation.toolCallId, 'tc-1');
        });
    });
    suite('finalizeToolInvocation', () => {
        test('finalizes terminal tool with output and exit code', () => {
            const tc = createToolCallState({
                _meta: { toolKind: 'terminal' },
                toolInput: 'echo hi',
                status: "running" /* ToolCallStatus.Running */,
            });
            const invocation = toolCallStateToInvocation(tc);
            finalizeToolInvocation(invocation, {
                status: "completed" /* ToolCallStatus.Completed */,
                toolCallId: 'tc-1',
                toolName: 'test_tool',
                displayName: 'Test Tool',
                invocationMessage: 'Running test tool...',
                _meta: { toolKind: 'terminal' },
                toolInput: 'echo hi',
                confirmed: "not-needed" /* ToolCallConfirmationReason.NotNeeded */,
                success: true,
                pastTenseMessage: 'Ran echo hi',
                content: [{ type: "text" /* ToolResultContentType.Text */, text: 'output text' }],
            });
            assert.ok(invocation.toolSpecificData);
            assert.strictEqual(invocation.toolSpecificData.kind, 'terminal');
            const termData = invocation.toolSpecificData;
            assert.strictEqual(termData.terminalCommandOutput.text, 'output text');
            assert.strictEqual(termData.terminalCommandState.exitCode, 0);
        });
        test('finalizes failed tool with error message', () => {
            const tc = createToolCallState({
                status: "running" /* ToolCallStatus.Running */,
            });
            const invocation = toolCallStateToInvocation(tc);
            finalizeToolInvocation(invocation, {
                status: "completed" /* ToolCallStatus.Completed */,
                toolCallId: 'tc-1',
                toolName: 'test_tool',
                displayName: 'Test Tool',
                invocationMessage: 'Running test tool...',
                confirmed: "not-needed" /* ToolCallConfirmationReason.NotNeeded */,
                success: false,
                pastTenseMessage: 'Failed',
                error: { message: 'timeout' },
            });
            // Should not throw
        });
        test('returns file edits from completed tool call with FileEdit content', () => {
            const tc = createToolCallState({ status: "running" /* ToolCallStatus.Running */ });
            const invocation = toolCallStateToInvocation(tc);
            const fileEdits = finalizeToolInvocation(invocation, {
                status: "completed" /* ToolCallStatus.Completed */,
                toolCallId: 'tc-1',
                toolName: 'edit_file',
                displayName: 'Edit File',
                invocationMessage: 'Editing file...',
                confirmed: "not-needed" /* ToolCallConfirmationReason.NotNeeded */,
                success: true,
                pastTenseMessage: 'Edited file',
                toolInput: JSON.stringify({ path: '/home/user/file.ts' }),
                content: [{
                        type: "fileEdit" /* ToolResultContentType.FileEdit */,
                        before: {
                            uri: URI.file('/home/user/file.ts').toString(),
                            content: { uri: 'agenthost-content:///session/snap/before' },
                        },
                        after: {
                            uri: URI.file('/home/user/file.ts').toString(),
                            content: { uri: 'agenthost-content:///session/snap/after' },
                        },
                    }],
            });
            assert.strictEqual(fileEdits.length, 1);
            assert.strictEqual(fileEdits[0].resource.fsPath.replace(/\\/g, '/'), '/home/user/file.ts');
            assert.strictEqual(fileEdits[0].beforeContentUri?.toString(), URI.parse('agenthost-content:///session/snap/before').toString());
            assert.strictEqual(fileEdits[0].afterContentUri?.toString(), URI.parse('agenthost-content:///session/snap/after').toString());
            assert.ok(fileEdits[0].undoStopId);
        });
        test('returns empty file edits for cancelled tool call', () => {
            const tc = createToolCallState({ status: "running" /* ToolCallStatus.Running */ });
            const invocation = toolCallStateToInvocation(tc);
            const fileEdits = finalizeToolInvocation(invocation, {
                status: "cancelled" /* ToolCallStatus.Cancelled */,
                toolCallId: 'tc-1',
                toolName: 'edit_file',
                displayName: 'Edit File',
                invocationMessage: 'Editing file...',
                reason: "denied" /* ToolCallCancellationReason.Denied */,
                reasonMessage: 'User cancelled',
            });
            assert.strictEqual(fileEdits.length, 0);
        });
        test('returns empty file edits when tool has no FileEdit content', () => {
            const tc = createToolCallState({ status: "running" /* ToolCallStatus.Running */ });
            const invocation = toolCallStateToInvocation(tc);
            const fileEdits = finalizeToolInvocation(invocation, {
                status: "completed" /* ToolCallStatus.Completed */,
                toolCallId: 'tc-1',
                toolName: 'test_tool',
                displayName: 'Test Tool',
                invocationMessage: 'Running test tool...',
                confirmed: "not-needed" /* ToolCallConfirmationReason.NotNeeded */,
                success: true,
                pastTenseMessage: 'Ran test tool',
                content: [{ type: "text" /* ToolResultContentType.Text */, text: 'output' }],
            });
            assert.strictEqual(fileEdits.length, 0);
        });
        test('returns empty file edits when FileEdit has no before or after', () => {
            const tc = createToolCallState({ status: "running" /* ToolCallStatus.Running */ });
            const invocation = toolCallStateToInvocation(tc);
            const fileEdits = finalizeToolInvocation(invocation, {
                status: "completed" /* ToolCallStatus.Completed */,
                toolCallId: 'tc-1',
                toolName: 'edit_file',
                displayName: 'Edit File',
                invocationMessage: 'Editing file...',
                confirmed: "not-needed" /* ToolCallConfirmationReason.NotNeeded */,
                success: true,
                pastTenseMessage: 'Edited',
                toolInput: JSON.stringify({ content: 'no path field' }),
                content: [{
                        type: "fileEdit" /* ToolResultContentType.FileEdit */,
                    }],
            });
            assert.strictEqual(fileEdits.length, 0);
        });
        test('returns file edit for create (only after present)', () => {
            const tc = createToolCallState({ status: "running" /* ToolCallStatus.Running */ });
            const invocation = toolCallStateToInvocation(tc);
            const fileEdits = finalizeToolInvocation(invocation, {
                status: "completed" /* ToolCallStatus.Completed */,
                toolCallId: 'tc-1',
                toolName: 'create_file',
                displayName: 'Create File',
                invocationMessage: 'Creating file...',
                confirmed: "not-needed" /* ToolCallConfirmationReason.NotNeeded */,
                success: true,
                pastTenseMessage: 'Created file',
                content: [{
                        type: "fileEdit" /* ToolResultContentType.FileEdit */,
                        after: {
                            uri: URI.file('/home/user/new-file.ts').toString(),
                            content: { uri: 'agenthost-content:///snap/after' },
                        },
                    }],
            });
            assert.strictEqual(fileEdits.length, 1);
            assert.strictEqual(fileEdits[0].kind, 'create');
            assert.strictEqual(fileEdits[0].resource.fsPath.replace(/\\/g, '/'), '/home/user/new-file.ts');
            assert.strictEqual(fileEdits[0].beforeContentUri, undefined);
            assert.ok(fileEdits[0].afterContentUri);
        });
    });
    suite('activeTurnToProgress', () => {
        function createActiveTurnState(responseParts) {
            return {
                id: 'turn-active',
                userMessage: { text: 'Do things' },
                responseParts: responseParts ?? [],
                usage: undefined,
            };
        }
        test('empty active turn produces empty progress', () => {
            const result = activeTurnToProgress(createActiveTurnState());
            assert.deepStrictEqual(result, []);
        });
        test('produces markdown content for streamed text', () => {
            const result = activeTurnToProgress(createActiveTurnState([
                { kind: "markdown" /* ResponsePartKind.Markdown */, id: 'md-1', content: 'Hello world' },
            ]));
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].kind, 'markdownContent');
            assert.strictEqual(result[0].content.value, 'Hello world');
        });
        test('produces thinking progress for reasoning', () => {
            const result = activeTurnToProgress(createActiveTurnState([
                { kind: "reasoning" /* ResponsePartKind.Reasoning */, id: 'r-1', content: 'Let me think about this...' },
            ]));
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].kind, 'thinking');
        });
        test('reasoning comes before streamed text when ordered that way', () => {
            const result = activeTurnToProgress(createActiveTurnState([
                { kind: "reasoning" /* ResponsePartKind.Reasoning */, id: 'r-1', content: 'Hmm...' },
                { kind: "markdown" /* ResponsePartKind.Markdown */, id: 'md-1', content: 'Result text' },
            ]));
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].kind, 'thinking');
            assert.strictEqual(result[1].kind, 'markdownContent');
        });
        test('serializes completed tool calls', () => {
            const result = activeTurnToProgress(createActiveTurnState([
                {
                    kind: "toolCall" /* ResponsePartKind.ToolCall */,
                    toolCall: {
                        status: "completed" /* ToolCallStatus.Completed */,
                        toolCallId: 'tc-done',
                        toolName: 'test_tool',
                        displayName: 'Test Tool',
                        invocationMessage: 'Ran test',
                        confirmed: "not-needed" /* ToolCallConfirmationReason.NotNeeded */,
                        success: true,
                        pastTenseMessage: 'Ran test tool',
                    },
                },
            ]));
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].kind, 'toolInvocationSerialized');
        });
        test('creates live invocations for running tool calls', () => {
            const result = activeTurnToProgress(createActiveTurnState([
                {
                    kind: "toolCall" /* ResponsePartKind.ToolCall */,
                    toolCall: createToolCallState({
                        toolCallId: 'tc-running',
                        status: "running" /* ToolCallStatus.Running */,
                    }),
                },
            ]));
            assert.strictEqual(result.length, 1);
            // Live ChatToolInvocation - check it has the right toolCallId
            const invocation = result[0];
            assert.strictEqual(invocation.toolCallId, 'tc-running');
        });
        test('creates confirmation invocations for pending tool confirmations', () => {
            const result = activeTurnToProgress(createActiveTurnState([
                {
                    kind: "toolCall" /* ResponsePartKind.ToolCall */,
                    toolCall: {
                        toolCallId: 'tc-pending',
                        toolName: 'bash',
                        displayName: 'Bash',
                        invocationMessage: 'Run command',
                        status: "pending-confirmation" /* ToolCallStatus.PendingConfirmation */,
                        confirmationTitle: 'Run command',
                        toolInput: 'echo hello',
                        _meta: { toolKind: 'terminal' },
                    },
                },
            ]));
            assert.strictEqual(result.length, 1);
            // PendingConfirmation invocations have terminal toolSpecificData for shell tools
            const invocation = result[0];
            assert.ok(invocation.toolSpecificData);
            assert.strictEqual(invocation.toolSpecificData.kind, 'terminal');
        });
        test('includes all parts in correct order', () => {
            const result = activeTurnToProgress(createActiveTurnState([
                { kind: "reasoning" /* ResponsePartKind.Reasoning */, id: 'r-1', content: 'Thinking...' },
                { kind: "markdown" /* ResponsePartKind.Markdown */, id: 'md-1', content: 'Output so far' },
                {
                    kind: "toolCall" /* ResponsePartKind.ToolCall */,
                    toolCall: createToolCallState({
                        toolCallId: 'tc-1',
                        status: "running" /* ToolCallStatus.Running */,
                    }),
                },
                {
                    kind: "toolCall" /* ResponsePartKind.ToolCall */,
                    toolCall: {
                        toolCallId: 'tc-2',
                        toolName: 'test_tool',
                        displayName: 'Test Tool',
                        invocationMessage: 'Confirm',
                        status: "pending-confirmation" /* ToolCallStatus.PendingConfirmation */,
                        confirmationTitle: 'Confirm',
                    },
                },
            ]));
            // reasoning + text + tool call + pending confirmation = 4 items
            assert.strictEqual(result.length, 4);
            assert.strictEqual(result[0].kind, 'thinking');
            assert.strictEqual(result[1].kind, 'markdownContent');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdGVUb1Byb2dyZXNzQWRhcHRlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9zdGF0ZVRvUHJvZ3Jlc3NBZGFwdGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUd0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDcEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxvQkFBb0IsRUFBRSx5QkFBeUIsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBRTdLLGdGQUFnRjtBQUVoRixTQUFTLG1CQUFtQixDQUFDLFNBQTBDO0lBQ3RFLE9BQU87UUFDTixVQUFVLEVBQUUsTUFBTTtRQUNsQixRQUFRLEVBQUUsV0FBVztRQUNyQixXQUFXLEVBQUUsV0FBVztRQUN4QixpQkFBaUIsRUFBRSxzQkFBc0I7UUFDekMsTUFBTSx3Q0FBd0I7UUFDOUIsU0FBUyx5REFBc0M7UUFDL0MsR0FBRyxTQUFTO0tBQ1osQ0FBQztBQUNILENBQUM7QUFFRCxTQUFTLHVCQUF1QixDQUFDLFNBQXVDO0lBQ3ZFLE9BQU87UUFDTixNQUFNLDRDQUEwQjtRQUNoQyxVQUFVLEVBQUUsTUFBTTtRQUNsQixRQUFRLEVBQUUsV0FBVztRQUNyQixXQUFXLEVBQUUsV0FBVztRQUN4QixpQkFBaUIsRUFBRSxzQkFBc0I7UUFDekMsT0FBTyxFQUFFLElBQUk7UUFDYixTQUFTLHlEQUFzQztRQUMvQyxnQkFBZ0IsRUFBRSxlQUFl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