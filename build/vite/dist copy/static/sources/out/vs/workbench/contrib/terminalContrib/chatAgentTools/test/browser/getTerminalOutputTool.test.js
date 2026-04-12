/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GetTerminalOutputTool, GetTerminalOutputToolData } from '../../browser/tools/getTerminalOutputTool.js';
import { RunInTerminalTool } from '../../browser/tools/runInTerminalTool.js';
suite('GetTerminalOutputTool', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    const UNKNOWN_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174000';
    const KNOWN_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174001';
    let tool;
    let originalGetExecution;
    setup(() => {
        tool = store.add(new GetTerminalOutputTool());
        originalGetExecution = RunInTerminalTool.getExecution;
    });
    teardown(() => {
        RunInTerminalTool.getExecution = originalGetExecution;
    });
    function createInvocation(id) {
        return {
            parameters: { id },
            callId: 'test-call',
            context: { sessionId: 'test-session' },
            toolId: 'get_terminal_output',
            tokenBudget: 1000,
            isComplete: () => false,
            isCancellationRequested: false,
        };
    }
    function createMockExecution(output) {
        return {
            completionPromise: Promise.resolve({ output }),
            instance: {},
            getOutput: () => output,
        };
    }
    test('tool description documents opaque terminal ids', () => {
        const idProperty = GetTerminalOutputToolData.inputSchema?.properties?.id;
        assert.ok(GetTerminalOutputToolData.modelDescription.includes('exact opaque value'));
        assert.ok(/exact opaque id returned by that tool/i.test(idProperty?.description ?? ''));
        assert.ok(idProperty?.pattern?.includes('[0-9a-fA-F]{8}'));
    });
    test('returns explicit error for unknown terminal id', async () => {
        RunInTerminalTool.getExecution = () => undefined;
        const result = await tool.invoke(createInvocation(UNKNOWN_TERMINAL_ID), async () => 0, { report: () => { } }, CancellationToken.None);
        assert.strictEqual(result.content.length, 1);
        assert.strictEqual(result.content[0].kind, 'text');
        const value = result.content[0].value;
        assert.ok(value.includes('No active terminal execution found'));
        assert.ok(value.includes('exact value returned by run_in_terminal'));
    });
    test('returns output for active terminal id', async () => {
        RunInTerminalTool.getExecution = () => createMockExecution('line1\nline2');
        const result = await tool.invoke(createInvocation(KNOWN_TERMINAL_ID), async () => 0, { report: () => { } }, CancellationToken.None);
        assert.strictEqual(result.content.length, 1);
        assert.strictEqual(result.content[0].kind, 'text');
        const value = result.content[0].value;
        assert.ok(value.includes(`Output of terminal ${KNOWN_TERMINAL_ID}:`));
        assert.ok(value.includes('line1\nline2'));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0VGVybWluYWxPdXRwdXRUb29sLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvdGVzdC9icm93c2VyL2dldFRlcm1pbmFsT3V0cHV0VG9vbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2hILE9BQU8sRUFBRSxpQkFBaUIsRUFBaUMsTUFBTSwwQ0FBMEMsQ0FBQztBQUs1RyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO0lBQ25DLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFDeEQsTUFBTSxtQkFBbUIsR0FBRyxzQ0FBc0MsQ0FBQztJQUNuRSxNQUFNLGlCQUFpQixHQUFHLHNDQUFzQyxDQUFDO0lBQ2pFLElBQUksSUFBMkIsQ0FBQztJQUNoQyxJQUFJLG9CQUEyRCxDQUFDO0lBRWhFLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHFCQUFxQixFQUFFLENBQUMsQ0FBQztRQUM5QyxvQkFBb0IsR0FBRyxpQkFBaUIsQ0FBQyxZQUFZLENBQUM7SUFDdkQsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2IsaUJBQWlCLENBQUMsWUFBWSxHQUFHLG9CQUFvQixDQUFDO0lBQ3ZELENBQUMsQ0FB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