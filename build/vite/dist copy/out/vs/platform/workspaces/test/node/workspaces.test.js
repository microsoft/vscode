/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import * as pfs from '../../../../base/node/pfs.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { flakySuite, getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { getSingleFolderWorkspaceIdentifier, getWorkspaceIdentifier } from '../../node/workspaces.js';
flakySuite('Workspaces', () => {
    let testDir;
    const tmpDir = os.tmpdir();
    setup(async () => {
        testDir = getRandomTestPath(tmpDir, 'vsctests', 'workspacesmanagementmainservice');
        return fs.promises.mkdir(testDir, { recursive: true });
    });
    teardown(() => {
        return pfs.Promises.rm(testDir);
    });
    test('getSingleWorkspaceIdentifier', async function () {
        const nonLocalUri = URI.parse('myscheme://server/work/p/f1');
        const nonLocalUriId = getSingleFolderWorkspaceIdentifier(nonLocalUri);
        assert.ok(nonLocalUriId?.id);
        const localNonExistingUri = URI.file(path.join(testDir, 'f1'));
        const localNonExistingUriId = getSingleFolderWorkspaceIdentifier(localNonExistingUri);
        assert.ok(!localNonExistingUriId);
        fs.mkdirSync(path.join(testDir, 'f1'));
        const localExistingUri = URI.file(path.join(testDir, 'f1'));
        const localExistingUriId = getSingleFolderWorkspaceIdentifier(localExistingUri, fs.statSync(localExistingUri.fsPath));
        assert.ok(localExistingUriId?.id);
    });
    test('workspace identifiers are stable', function () {
        // workspace identifier (local)
        assert.strictEqual(getWorkspaceIdentifier(URI.file('/hello/test')).id, isWindows /* slash vs backslash */ ? '9f3efb614e2cd7924e4b8076e6c72233' : 'e36736311be12ff6d695feefe415b3e8');
        // single folder identifier (local)
        const fakeStat = {
            ino: 1611312115129,
            birthtimeMs: 1611312115129,
            birthtime: new Date(1611312115129)
        };
        assert.strictEqual(getSingleFolderWorkspaceIdentifier(URI.file('/hello/test'), fakeStat)?.id, isWindows /* slash vs backslash */ ? '9a8441e897e5174fa388bc7ef8f7a710' : '1d726b3d516dc2a6d343abf4797eaaef');
        // workspace identifier (remote)
        assert.strictEqual(getWorkspaceIdentifier(URI.parse('vscode-remote:/hello/test')).id, '786de4f224d57691f218dc7f31ee2ee3');
        // single folder identifier (remote)
        assert.strictEqual(getSingleFolderWorkspaceIdentifier(URI.parse('vscode-remote:/hello/test'))?.id, '786de4f224d57691f218dc7f31ee2ee3');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlcy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd29ya3NwYWNlcy90ZXN0L25vZGUvd29ya3NwYWNlcy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEtBQUssSUFBSSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxLQUFLLEdBQUcsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDeEYsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFdEcsVUFBVSxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7SUFFN0IsSUFBSSxPQUFlLENBQUM7SUFFcEIsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBRTNCLEtBQUssQ0FBQyxLQUFLLElBQUksRUFBRTtRQUNoQixPQUFPLEdBQUcsaUJBQWlCLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDO1FBRW5GLE9BQU8sRUFBRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFD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