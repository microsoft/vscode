/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { getFirstFrame } from '../../common/console.js';
import { normalize } from '../../common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
suite('Console', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('getFirstFrame', () => {
        let stack = 'at vscode.commands.registerCommand (/Users/someone/Desktop/test-ts/out/src/extension.js:18:17)';
        let frame = getFirstFrame(stack);
        assert.strictEqual(frame.uri.fsPath, normalize('/Users/someone/Desktop/test-ts/out/src/extension.js'));
        assert.strictEqual(frame.line, 18);
        assert.strictEqual(frame.column, 17);
        stack = 'at /Users/someone/Desktop/test-ts/out/src/extension.js:18:17';
        frame = getFirstFrame(stack);
        assert.strictEqual(frame.uri.fsPath, normalize('/Users/someone/Desktop/test-ts/out/src/extension.js'));
        assert.strictEqual(frame.line, 18);
        assert.strictEqual(frame.column, 17);
        stack = 'at c:\\Users\\someone\\Desktop\\end-js\\extension.js:18:17';
        frame = getFirstFrame(stack);
        assert.strictEqual(frame.uri.fsPath, 'c:\\Users\\someone\\Desktop\\end-js\\extension.js');
        assert.strictEqual(frame.line, 18);
        assert.strictEqual(frame.column, 17);
        stack = 'at e.$executeContributedCommand(c:\\Users\\someone\\Desktop\\end-js\\extension.js:18:17)';
        frame = getFirstFrame(stack);
        assert.strictEqual(frame.uri.fsPath, 'c:\\Users\\someone\\Desktop\\end-js\\extension.js');
        assert.strictEqual(frame.line, 18);
        assert.strictEqual(frame.column, 17);
        stack = 'at /Users/someone/Desktop/test-ts/out/src/extension.js:18:17\nat /Users/someone/Desktop/test-ts/out/src/other.js:28:27\nat /Users/someone/Desktop/test-ts/out/src/more.js:38:37';
        frame = getFirstFrame(stack);
        assert.strictEqual(frame.uri.fsPath, normalize('/Users/someone/Desktop/test-ts/out/src/extension.js'));
        assert.strictEqual(frame.line, 18);
        assert.strictEqual(frame.column, 17);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc29sZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9jb25zb2xlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN4RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDakQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRXJFLEtBQUssQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFO0lBQ3JCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDMUIsSUFBSSxLQUFLLEdBQUcsZ0dBQWdHLENBQUM7UUFDN0csSUFBSSxLQUFLLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBRSxDQUFDO1FBRWxDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLHFEQUFxRCxDQUFDLENBQUMsQ0FBQztRQUN2RyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXJDLEtBQUssR0FBRyw4REFBOEQsQ0FBQztRQUN2RSxLQUFLLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBRSxDQUFDO1FBRTlCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLHFEQUFxRCxDQUFDLENBQUMsQ0FBQztRQUN2RyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXJDLEtBQUssR0FBRyw0REFBNEQsQ0FBQztRQUNyRSxLQUFLLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBRSxDQUFDO1FBRTlCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsbURBQW1ELENBQUMsQ0FBQztRQUMxRixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXJDLEtBQUssR0FBRywwRkFBMEYsQ0FBQztRQUNuRyxLQUFLLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBRSxDQUFDO1FBRTlCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsbURBQW1ELENBQUMsQ0FBQztRQUMxRixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXJDLEtBQUssR0FBRyxpTEFBaUwsQ0FBQztRQUMxTCxLQUFLLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBRSxDQUFDO1FBRTlCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLHFEQUFxRCxDQUFDLENBQUMsQ0FBQztRQUN2RyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3RDLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==