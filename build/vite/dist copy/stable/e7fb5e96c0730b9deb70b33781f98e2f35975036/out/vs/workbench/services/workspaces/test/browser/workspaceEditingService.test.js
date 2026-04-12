/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DidEnterWorkspaceEvent } from '../../browser/abstractWorkspaceEditingService.js';
import { UNKNOWN_EMPTY_WINDOW_WORKSPACE } from '../../../../../platform/workspace/common/workspace.js';
suite('WorkspaceEditingService', () => {
    suite('DidEnterWorkspaceEvent', () => {
        test('event captures old workspace and new workspace URI', () => {
            const oldWorkspace = { id: 'old-folder', uri: URI.file('/old/folder') };
            const newWorkspace = { id: 'new-workspace', configPath: URI.file('/test/workspace.code-workspace') };
            const event = new DidEnterWorkspaceEvent(oldWorkspace, newWorkspace);
            assert.strictEqual(event.oldWorkspace, oldWorkspace);
            assert.strictEqual(event.newWorkspace, newWorkspace);
        });
        test('join collects promises', async () => {
            const newWorkspace = { id: 'new-workspace', configPath: URI.file('/test/workspace.code-workspace') };
            const event = new DidEnterWorkspaceEvent(UNKNOWN_EMPTY_WINDOW_WORKSPACE, newWorkspace);
            let executed1 = false;
            let executed2 = false;
            event.join((async () => { executed1 = true; })());
            event.join((async () => { executed2 = true; })());
            await event.wait();
            assert.strictEqual(executed1, true, 'First promise should have executed');
            assert.strictEqual(executed2, true, 'Second promise should have executed');
        });
        test('wait resolves when all promises complete', async () => {
            const newWorkspace = { id: 'new-workspace', configPath: URI.file('/test/workspace.code-workspace') };
            const event = new DidEnterWorkspaceEvent(UNKNOWN_EMPTY_WINDOW_WORKSPACE, newWorkspace);
            let resolve1;
            let resolve2;
            const promise1 = new Promise(r => { resolve1 = r; });
            const promise2 = new Promise(r => { resolve2 = r; });
            event.join(promise1);
            event.join(promise2);
            let waitCompleted = false;
            const waitPromise = event.wait().then(() => { waitCompleted = true; });
            // Should not be completed yet
            await Promise.resolve();
            assert.strictEqual(waitCompleted, false);
            // Resolve first promise
            resolve1();
            await Promise.resolve();
            assert.strictEqual(waitCompleted, false);
            // Resolve second promise
            resolve2();
            await waitPromise;
            assert.strictEqual(waitCompleted, true);
        });
        test('wait resolves immediately when no promises are joined', async () => {
            const newWorkspace = { id: 'new-workspace', configPath: URI.file('/test/workspace.code-workspace') };
            const event = new DidEnterWorkspaceEvent(UNKNOWN_EMPTY_WINDOW_WORKSPACE, newWorkspace);
            await event.wait();
            // Should complete without error
        });
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlRWRpdGluZ1NlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3Jrc3BhY2VzL3Rlc3QvYnJvd3Nlci93b3Jrc3BhY2VFZGl0aW5nU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDMUYsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFdkcsS0FBSyxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtJQUVyQyxLQUFLLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO1FBRXBDLElBQUksQ0FBQyxvREFBb0QsRUFBRSxHQUFHLEVBQUU7WUFDL0QsTUFBTSxZQUFZLEdBQUcsRUFBRSxFQUFFLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7WUFDeEUsTUFBTSxZQUFZLEdBQUcsRUFBRSxFQUFFLEVBQUUsZUFBZSxFQUFFLFVBQVUsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLEVBQUUsQ0FBQztZQUNyRyxNQUFNLEtBQUssR0FBRyxJQUFJLHNCQUFzQixDQUFDLFlBQVksRUFBRSxZQUFZLENBQUMsQ0FBQztZQUVyRSxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFDckQsTUFBTSxDQUFDLFdBQVcs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