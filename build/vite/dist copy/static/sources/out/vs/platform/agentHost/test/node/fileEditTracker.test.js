/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { FileEditTracker, buildSessionDbUri, parseSessionDbUri } from '../../node/copilot/fileEditTracker.js';
suite('FileEditTracker', () => {
    const disposables = new DisposableStore();
    let fileService;
    let db;
    let tracker;
    setup(async () => {
        fileService = disposables.add(new FileService(new NullLogService()));
        const sourceFs = disposables.add(new InMemoryFileSystemProvider());
        disposables.add(fileService.registerProvider('file', sourceFs));
        db = disposables.add(await SessionDatabase.open(':memory:'));
        await db.createTurn('turn-1');
        tracker = new FileEditTracker('copilot:/test-session', db, fileService, new NullLogService());
    });
    teardown(async () => {
        disposables.clear();
        await db.close();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('tracks edit start and complete for existing file', async () => {
        await fileService.writeFile(URI.file('/workspace/test.txt'), VSBuffer.fromString('original content\nline 2'));
        await tracker.trackEditStart('/workspace/test.txt');
        await fileService.writeFile(URI.file('/workspace/test.txt'), VSBuffer.fromString('modified content\nline 2\nline 3'));
        await tracker.completeEdit('/workspace/test.txt');
        const fileEdit = await tracker.takeCompletedEdit('turn-1', 'tc-1', '/workspace/test.txt');
        assert.ok(fileEdit);
        assert.strictEqual(fileEdit.type, "fileEdit" /* ToolResultContentType.FileEdit */);
        // URIs are parseable session-db: URIs
        const beforeFields = parseSessionDbUri(fileEdit.before.content.uri);
        assert.ok(beforeFields);
        assert.strictEqual(beforeFields.sessionUri, 'copilot:/test-session');
        assert.strictEqual(beforeFields.toolCallId, 'tc-1');
        assert.strictEqual(beforeFields.filePath, '/workspace/test.txt');
        assert.strictEqual(beforeFields.part, 'before');
        const afterFields = parseSessionDbUri(fileEdit.after.content.uri);
        assert.ok(afterFields);
        assert.strictEqual(afterFields.part, 'after');
        // Content is persisted in the database (wait for fire-and-forget write)
        await new Promise(r => setTimeout(r, 50));
        const content = await db.readFileEditContent('tc-1', '/workspace/test.txt');
        assert.ok(content);
        assert.strictEqual(new TextDecoder().decode(content.beforeContent), 'original content\nline 2');
        assert.strictEqual(new TextDecoder().decode(content.afterContent), 'modified content\nline 2\nline 3');
    });
    test('tracks edit for newly created file (no before content)', async () => {
        await tracker.trackEditStart('/workspace/new-file.txt');
        await fileService.writeFile(URI.file('/workspace/new-file.txt'), VSBuffer.fromString('new file\ncontent'));
        await tracker.completeEdit('/workspace/new-file.txt');
        const fileEdit = await tracker.takeCompletedEdit('turn-1', 'tc-2', '/workspace/new-file.txt');
        assert.ok(fileEdit);
        // Wait for the fire-and-forget DB write to complete
        await new Promise(r => setTimeout(r, 50));
        const content = await db.readFileEditContent('tc-2', '/workspace/new-file.txt');
        assert.ok(content);
        assert.strictEqual(new TextDecoder().decode(content.beforeContent), '');
        assert.strictEqual(new TextDecoder().decode(content.afterContent), 'new file\ncontent');
    });
    test('takeCompletedEdit returns undefined for unknown file path', async () => {
        const result = await tracker.takeCompletedEdit('turn-1', 'tc-x', '/nonexistent');
        assert.strictEqual(result, undefined);
    });
    test('before and after content can be read from database', async () => {
        await fileService.writeFile(URI.file('/workspace/file.ts'), VSBuffer.fromString('original'));
        await tracker.trackEditStart('/workspace/file.ts');
        await fileService.writeFile(URI.file('/workspace/file.ts'), VSBuffer.fromString('modified'));
        await tracker.completeEdit('/workspace/file.ts');
        await tracker.takeCompletedEdit('turn-1', 'tc-3', '/workspace/file.ts');
        // Wait for the fire-and-forget DB write to complete
        await new Promise(r => setTimeout(r, 50));
        const content = await db.readFileEditContent('tc-3', '/workspace/file.ts');
        assert.ok(content);
        assert.strictEqual(new TextDecoder().decode(content.beforeContent), 'original');
        assert.strictEqual(new TextDecoder().decode(content.afterContent), 'modified');
    });
});
suite('buildSessionDbUri / parseSessionDbUri', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('round-trips a simple URI', () => {
        const uri = buildSessionDbUri('copilot:/abc-123', 'tc-1', '/workspace/file.ts', 'before');
        const parsed = parseSessionDbUri(uri);
        assert.ok(parsed);
        assert.deepStrictEqual(parsed, {
            sessionUri: 'copilot:/abc-123',
            toolCallId: 'tc-1',
            filePath: '/workspace/file.ts',
            part: 'before',
        });
    });
    test('round-trips with special characters in filePath', () => {
        const uri = buildSessionDbUri('copilot:/s1', 'tc-2', '/work space/file (1).ts', 'after');
        const parsed = parseSessionDbUri(uri);
        assert.ok(parsed);
        assert.strictEqual(parsed.filePath, '/work space/file (1).ts');
        assert.strictEqual(parsed.part, 'after');
    });
    test('round-trips with special characters in toolCallId', () => {
        const uri = buildSessionDbUri('copilot:/s1', 'call_abc=123&x', '/file.ts', 'before');
        const parsed = parseSessionDbUri(uri);
        assert.ok(parsed);
        assert.strictEqual(parsed.toolCallId, 'call_abc=123&x');
    });
    test('parseSessionDbUri returns undefined for non-session-db URIs', () => {
        assert.strictEqual(parseSessionDbUri('file:///foo/bar'), undefined);
        assert.strictEqual(parseSessionDbUri('https://example.com'), undefined);
    });
    test('parseSessionDbUri returns undefined for malformed session-db URIs', () => {
        assert.strictEqual(parseSessionDbUri('session-db:copilot:/s1'), undefined);
        assert.strictEqual(parseSessionDbUri('session-db:copilot:/s1?toolCallId=tc-1'), undefined);
        assert.strictEqual(parseSessionDbUri('session-db:copilot:/s1?toolCallId=tc-1&filePath=/f&part=middle'), undefined);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUVkaXRUcmFja2VyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvdGVzdC9ub2RlL2ZpbGVFZGl0VHJhY2tlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDakcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRTVELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNoRSxPQUFPLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFOUcsS0FBSyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtJQUU3QixNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBQzFDLElBQUksV0FBd0IsQ0FBQztJQUM3QixJQUFJLEVBQW1CLENBQUM7SUFDeEIsSUFBSSxPQUF3QixDQUFDO0lBRTdCLEtBQUssQ0FBQyxLQUFLLElBQUksRUFBRTtRQUNoQixXQUFXLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLFdBQVcsQ0FBQyxJQUFJLGNBQWMsRUFBRSxDQUFD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