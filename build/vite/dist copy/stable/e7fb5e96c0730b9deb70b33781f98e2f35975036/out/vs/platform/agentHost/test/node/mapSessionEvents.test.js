/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agentService.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { parseSessionDbUri } from '../../node/copilot/fileEditTracker.js';
import { mapSessionEvents } from '../../node/copilot/mapSessionEvents.js';
suite('mapSessionEvents', () => {
    const disposables = new DisposableStore();
    let db;
    const session = AgentSession.uri('copilot', 'test-session');
    teardown(async () => {
        disposables.clear();
        await db?.close();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    // ---- Basic event mapping --------------------------------------------
    test('maps user and assistant messages', async () => {
        const events = [
            { type: 'user.message', data: { messageId: 'msg-1', content: 'hello' } },
            { type: 'assistant.message', data: { messageId: 'msg-2', content: 'world' } },
        ];
        const result = await mapSessionEvents(session, undefined, events);
        assert.strictEqual(result.length, 2);
        assert.deepStrictEqual(result[0], {
            session,
            type: 'message',
            role: 'user',
            messageId: 'msg-1',
            content: 'hello',
            toolRequests: undefined,
            reasoningOpaque: undefined,
            reasoningText: undefined,
            encryptedContent: undefined,
            parentToolCallId: undefined,
        });
        assert.strictEqual(result[1].type, 'message');
        assert.strictEqual(result[1].role, 'assistant');
    });
    test('maps tool start and complete events', async () => {
        const events = [
            {
                type: 'tool.execution_start',
                data: { toolCallId: 'tc-1', toolName: 'shell', arguments: { command: 'echo hi' } },
            },
            {
                type: 'tool.execution_complete',
                data: { toolCallId: 'tc-1', success: true, result: { content: 'hi\n' } },
            },
        ];
        const result = await mapSessionEvents(session, undefined, events);
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].type, 'tool_start');
        assert.strictEqual(result[1].type, 'tool_complete');
        const complete = result[1];
        assert.ok(complete.result.content);
        assert.strictEqual(complete.result.content[0].type, "text" /* ToolResultContentType.Text */);
    });
    test('skips tool_complete without matching tool_start', async () => {
        const events = [
            { type: 'tool.execution_complete', data: { toolCallId: 'orphan', success: true } },
        ];
        const result = await mapSessionEvents(session, undefined, events);
        assert.strictEqual(result.length, 0);
    });
    test('ignores unknown event types', async () => {
        const events = [
            { type: 'some.unknown.event', data: {} },
            { type: 'user.message', data: { messageId: 'msg-1', content: 'test' } },
        ];
        const result = await mapSessionEvents(session, undefined, events);
        assert.strictEqual(result.length, 1);
    });
    // ---- File edit restoration ------------------------------------------
    suite('file edit restoration', () => {
        test('restores file edits from database for edit tools', async () => {
            db = disposables.add(await SessionDatabase.open(':memory:'));
            await db.createTurn('turn-1');
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-edit',
                filePath: '/workspace/file.ts',
                kind: "edit" /* FileEditKind.Edit */,
                beforeContent: new TextEncoder().encode('before'),
                afterContent: new TextEncoder().encode('after'),
                addedLines: 3,
                removedLines: 1,
            });
            const events = [
                {
                    type: 'tool.execution_start',
                    data: { toolCallId: 'tc-edit', toolName: 'edit', arguments: { filePath: '/workspace/file.ts' } },
                },
                {
                    type: 'tool.execution_complete',
                    data: { toolCallId: 'tc-edit', success: true, result: { content: 'Edited file.ts' } },
                },
            ];
            const result = await mapSessionEvents(session, db, events);
            const complete = result[1];
            assert.strictEqual(complete.type, 'tool_complete');
            const content = complete.result.content;
            assert.ok(content);
            // Should have text content + file edit
            assert.strictEqual(content.length, 2);
            assert.strictEqual(content[0].type, "text" /* ToolResultContentType.Text */);
            assert.strictEqual(content[1].type, "fileEdit" /* ToolResultContentType.FileEdit */);
            // File edit URIs should be parseable
            const fileEdit = content[1];
            const beforeFields = parseSessionDbUri(fileEdit.before.content.uri);
            assert.ok(beforeFields);
            assert.strictEqual(beforeFields.toolCallId, 'tc-edit');
            assert.strictEqual(beforeFields.filePath, '/workspace/file.ts');
            assert.strictEqual(beforeFields.part, 'before');
            assert.deepStrictEqual(fileEdit.diff, { added: 3, removed: 1 });
        });
        test('handles multiple file edits for one tool call', async () => {
            db = disposables.add(await SessionDatabase.open(':memory:'));
            await db.createTurn('turn-1');
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-multi',
                filePath: '/workspace/a.ts',
                kind: "edit" /* FileEditKind.Edit */,
                beforeContent: new Uint8Array(0),
                afterContent: new TextEncoder().encode('a'),
                addedLines: undefined,
                removedLines: undefined,
            });
            await db.storeFileEdit({
                turnId: 'turn-1',
                toolCallId: 'tc-multi',
                filePath: '/workspace/b.ts',
                kind: "edit" /* FileEditKind.Edit */,
                beforeContent: new Uint8Array(0),
                afterContent: new TextEncoder().encode('b'),
                addedLines: undefined,
                removedLines: undefined,
            });
            const events = [
                {
                    type: 'tool.execution_start',
                    data: { toolCallId: 'tc-multi', toolName: 'write' },
                },
                {
                    type: 'tool.execution_complete',
                    data: { toolCallId: 'tc-multi', success: true },
                },
            ];
            const result = await mapSessionEvents(session, db, events);
            const content = result[1].result.content;
            assert.ok(content);
            // Two file edits (no text since result had no content)
            const fileEdits = content.filter(c => c.type === "fileEdit" /* ToolResultContentType.FileEdit */);
            assert.strictEqual(fileEdits.length, 2);
        });
        test('works without database (no file edits restored)', async () => {
            const events = [
                {
                    type: 'tool.execution_start',
                    data: { toolCallId: 'tc-1', toolName: 'edit', arguments: { filePath: '/workspace/file.ts' } },
                },
                {
                    type: 'tool.execution_complete',
                    data: { toolCallId: 'tc-1', success: true, result: { content: 'done' } },
                },
            ];
            const result = await mapSessionEvents(session, undefined, events);
            const content = result[1].result.content;
            assert.ok(content);
            // Only text content, no file edits
            assert.strictEqual(content.length, 1);
            assert.strictEqual(content[0].type, "text" /* ToolResultContentType.Text */);
        });
        test('non-edit tools do not get file edits even if db has data', async () => {
            db = disposables.add(await SessionDatabase.open(':memory:'));
            const events = [
                {
                    type: 'tool.execution_start',
                    data: { toolCallId: 'tc-1', toolName: 'shell', arguments: { command: 'ls' } },
                },
                {
                    type: 'tool.execution_complete',
                    data: { toolCallId: 'tc-1', success: true, result: { content: 'files' } },
                },
            ];
            const result = await mapSessionEvents(session, db, events);
            const content = result[1].result.content;
            assert.ok(content);
            assert.strictEqual(content.length, 1);
            assert.strictEqual(content[0].type, "text" /* ToolResultContentType.Text */);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFwU2Vzc2lvbkV2ZW50cy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3Qvbm9kZS9tYXBTZXNzaW9uRXZlbnRzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFNUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBc0IsTUFBTSx3Q0FBd0MsQ0FBQztBQUU5RixLQUFLLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO0lBRTlCLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFDMUMsSUFBSSxFQUErQixDQUFDO0lBQ3BDLE1BQU0sT0FBTyxHQUFHLFlBQVksQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBRTVELFFBQVEsQ0FBQyxLQUFLLElBQUksRUFBRTtRQUNuQixXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDcEIsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDbkIsQ0FBQyxDQUFDLENBQUM7SUFDSCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLHdFQUF3RTtJQUV4RSxJQUFJLENBQUMsa0NBQWtDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDbkQsTUFBTSxNQUFNLEdBQW9CO1lBQy9CLEVB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