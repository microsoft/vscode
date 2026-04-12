/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { SendToTerminalTool, SendToTerminalToolData } from '../../browser/tools/sendToTerminalTool.js';
import { RunInTerminalTool } from '../../browser/tools/runInTerminalTool.js';
import { ITerminalChatService } from '../../../../terminal/browser/terminal.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
suite('SendToTerminalTool', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    const UNKNOWN_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174000';
    const KNOWN_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174001';
    let tool;
    let originalGetExecution;
    let instantiationService;
    setup(() => {
        instantiationService = workbenchInstantiationService({}, store);
        instantiationService.stub(IChatService, {
            onDidDisposeSession: Event.None,
            getSession: () => undefined,
        });
        instantiationService.stub(ITerminalChatService, {
            hasChatSessionAutoApproval: () => false,
        });
        tool = store.add(instantiationService.createInstance(SendToTerminalTool));
        originalGetExecution = RunInTerminalTool.getExecution;
    });
    teardown(() => {
        RunInTerminalTool.getExecution = originalGetExecution;
    });
    function createInvocation(id, command) {
        return {
            parameters: { id, command },
            callId: 'test-call',
            context: { sessionId: 'test-session' },
            toolId: 'send_to_terminal',
            tokenBudget: 1000,
            isComplete: () => false,
            isCancellationRequested: false,
        };
    }
    function createMockExecution(output) {
        const sentTexts = [];
        return {
            completionPromise: Promise.resolve({ output }),
            instance: {
                sendText: async (text, shouldExecute) => {
                    sentTexts.push({ text, shouldExecute });
                },
            },
            getOutput: () => output,
            sentTexts,
        };
    }
    test('tool description documents terminal IDs and use cases', () => {
        const idProperty = SendToTerminalToolData.inputSchema?.properties?.id;
        assert.ok(SendToTerminalToolData.modelDescription.includes('existing persistent terminal session'));
        assert.ok(idProperty?.pattern?.includes('[0-9a-fA-F]{8}'));
    });
    test('returns error for unknown terminal id', async () => {
        RunInTerminalTool.getExecution = () => undefined;
        const result = await tool.invoke(createInvocation(UNKNOWN_TERMINAL_ID, 'ls'), async () => 0, { report: () => { } }, CancellationToken.None);
        assert.strictEqual(result.content.length, 1);
        assert.strictEqual(result.content[0].kind, 'text');
        const value = result.content[0].value;
        assert.ok(value.includes('No active terminal execution found'));
        assert.ok(value.includes(UNKNOWN_TERMINAL_ID));
    });
    test('sends command to terminal and returns acknowledgment', async () => {
        const mockExecution = createMockExecution('$ ls\nfile1.txt\nfile2.txt');
        RunInTerminalTool.getExecution = () => mockExecution;
        const result = await tool.invoke(createInvocation(KNOWN_TERMINAL_ID, 'ls'), async () => 0, { report: () => { } }, CancellationToken.None);
        assert.strictEqual(result.content.length, 1);
        assert.strictEqual(result.content[0].kind, 'text');
        const value = result.content[0].value;
        assert.ok(value.includes('Successfully sent command'));
        assert.ok(value.includes(KNOWN_TERMINAL_ID));
        assert.ok(value.includes('get_terminal_output'), 'should direct agent to use get_terminal_output');
        // Verify sendText was called with shouldExecute=true
        assert.strictEqual(mockExecution.sentTexts.length, 1);
        assert.strictEqual(mockExecution.sentTexts[0].text, 'ls');
        assert.strictEqual(mockExecution.sentTexts[0].shouldExecute, true);
    });
    test('sends multi-word command correctly', async () => {
        const mockExecution = createMockExecution('output');
        RunInTerminalTool.getExecution = () => mockExecution;
        await tool.invoke(createInvocation(KNOWN_TERMINAL_ID, 'echo hello world'), async () => 0, { report: () => { } }, CancellationToken.None);
        assert.strictEqual(mockExecution.sentTexts.length, 1);
        assert.strictEqual(mockExecution.sentTexts[0].text, 'echo hello world');
        assert.strictEqual(mockExecution.sentTexts[0].shouldExecute, true);
    });
    function createPreparationContext(id, command) {
        return {
            parameters: { id, command },
            toolCallId: 'test-call',
        };
    }
    test('prepareToolInvocation shows command in messages', async () => {
        const prepared = await tool.prepareToolInvocation(createPreparationContext(KNOWN_TERMINAL_ID, 'ls -la'), CancellationToken.None);
        assert.ok(prepared);
        assert.ok(prepared.invocationMessage);
        assert.ok(prepared.pastTenseMessage);
        assert.ok(prepared.confirmationMessages);
        assert.ok(prepared.confirmationMessages.title);
        assert.ok(prepared.confirmationMessages.message);
    });
    test('prepareToolInvocation truncates long commands', async () => {
        const longCommand = 'a'.repeat(100);
        const prepared = await tool.prepareToolInvocation(createPreparationContext(KNOWN_TERMINAL_ID, longCommand), CancellationToken.None);
        assert.ok(prepared);
        const message = prepared.invocationMessage;
        assert.ok(message.value.includes('...'));
    });
    test('prepareToolInvocation normalizes newlines in command', async () => {
        const prepared = await tool.prepareToolInvocation(createPreparationContext(KNOWN_TERMINAL_ID, 'echo hello\necho world'), CancellationToken.None);
        assert.ok(prepared);
        const message = prepared.invocationMessage;
        assert.ok(!message.value.includes('\n'), 'newlines should be collapsed to spaces');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VuZFRvVGVybWluYWxUb29sLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvdGVzdC9icm93c2VyL3NlbmRUb1Rlcm1pbmFsVG9vbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUUvRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN2RyxPQUFPLEVBQUUsaUJBQWlCLEVBQWlDLE1BQU0sMENBQTBDLENBQUM7QUFHNUcsT0FBTyxFQUFFLG9CQUFvQixFQUEwQixNQUFNLDBDQUEwQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXJHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUVsRixLQUFLLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxFQUFFO0lBQ2hDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFDeEQsTUFBTSxtQkFBbUIsR0FBRyxzQ0FBc0MsQ0FBQztJQUNuRSxNQUFNLGlCQUFpQixHQUFHLHNDQUFzQyxDQUFDO0lBQ2pFLElBQUksSUFBd0IsQ0FBQztJQUM3QixJQUFJLG9CQUEyRCxDQUFDO0lBQ2hFLElBQUksb0JBQThDLENBQUM7SUFFbkQsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLG9C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