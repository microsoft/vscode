/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { isRecentFolder, restoreRecentlyOpened, toStoreData } from '../../common/workspaces.js';
suite('History Storage', () => {
    function toWorkspace(uri) {
        return {
            id: '1234',
            configPath: uri
        };
    }
    function assertEqualURI(u1, u2, message) {
        assert.strictEqual(u1 && u1.toString(), u2 && u2.toString(), message);
    }
    function assertEqualWorkspace(w1, w2, message) {
        if (!w1 || !w2) {
            assert.strictEqual(w1, w2, message);
            return;
        }
        assert.strictEqual(w1.id, w2.id, message);
        assertEqualURI(w1.configPath, w2.configPath, message);
    }
    function assertEqualRecentlyOpened(actual, expected, message) {
        assert.strictEqual(actual.files.length, expected.files.length, message);
        for (let i = 0; i < actual.files.length; i++) {
            assertEqualURI(actual.files[i].fileUri, expected.files[i].fileUri, message);
            assert.strictEqual(actual.files[i].label, expected.files[i].label);
            assert.strictEqual(actual.files[i].remoteAuthority, expected.files[i].remoteAuthority);
        }
        assert.strictEqual(actual.workspaces.length, expected.workspaces.length, message);
        for (let i = 0; i < actual.workspaces.length; i++) {
            const expectedRecent = expected.workspaces[i];
            const actualRecent = actual.workspaces[i];
            if (isRecentFolder(actualRecent)) {
                assertEqualURI(actualRecent.folderUri, expectedRecent.folderUri, message);
            }
            else {
                assertEqualWorkspace(actualRecent.workspace, expectedRecent.workspace, message);
            }
            assert.strictEqual(actualRecent.label, expectedRecent.label);
            assert.strictEqual(actualRecent.remoteAuthority, actualRecent.remoteAuthority);
        }
    }
    function assertRestoring(state, message) {
        const stored = toStoreData(state);
        const restored = restoreRecentlyOpened(stored, new NullLogService());
        assertEqualRecentlyOpened(state, restored, message);
    }
    const testWSPath = URI.file(join(tmpdir(), 'windowStateTest', 'test.code-workspace'));
    const testFileURI = URI.file(join(tmpdir(), 'windowStateTest', 'testFile.txt'));
    const testFolderURI = URI.file(join(tmpdir(), 'windowStateTest', 'testFolder'));
    const testRemoteFolderURI = URI.parse('foo://bar/c/e');
    const testRemoteFileURI = URI.parse('foo://bar/c/d.txt');
    const testRemoteWSURI = URI.parse('foo://bar/c/test.code-workspace');
    test('storing and restoring', () => {
        let ro;
        ro = {
            files: [],
            workspaces: []
        };
        assertRestoring(ro, 'empty');
        ro = {
            files: [{ fileUri: testFileURI }],
            workspaces: []
        };
        assertRestoring(ro, 'file');
        ro = {
            files: [],
            workspaces: [{ folderUri: testFolderURI }]
        };
        assertRestoring(ro, 'folder');
        ro = {
            files: [],
            workspaces: [{ workspace: toWorkspace(testWSPath) }, { folderUri: testFolderURI }]
        };
        assertRestoring(ro, 'workspaces and folders');
        ro = {
            files: [{ fileUri: testRemoteFileURI }],
            workspaces: [{ workspace: toWorkspace(testRemoteWSURI) }, { folderUri: testRemoteFolderURI }]
        };
        assertRestoring(ro, 'remote workspaces and folders');
        ro = {
            files: [{ label: 'abc', fileUri: testFileURI }],
            workspaces: [{ label: 'def', workspace: toWorkspace(testWSPath) }, { folderUri: testRemoteFolderURI }]
        };
        assertRestoring(ro, 'labels');
        ro = {
            files: [{ label: 'abc', remoteAuthority: 'test', fileUri: testRemoteFileURI }],
            workspaces: [{ label: 'def', remoteAuthority: 'test', workspace: toWorkspace(testWSPath) }, { folderUri: testRemoteFolderURI, remoteAuthority: 'test' }]
        };
        assertRestoring(ro, 'authority');
    });
    test('open 1_55', () => {
        const v1_55 = `{
			"entries": [
				{
					"folderUri": "foo://bar/23/43",
					"remoteAuthority": "test+test"
				},
				{
					"workspace": {
						"id": "53b714b46ef1a2d4346568b4f591028c",
						"configPath": "file:///home/user/workspaces/testing/custom.code-workspace"
					}
				},
				{
					"folderUri": "file:///home/user/workspaces/testing/folding",
					"label": "abc"
				},
				{
					"fileUri": "file:///home/user/.config/code-oss-dev/storage.json",
					"label": "def"
				}
			]
		}`;
        const windowsState = restoreRecentlyOpened(JSON.parse(v1_55), new NullLogService());
        const expected = {
            files: [{ label: 'def', fileUri: URI.parse('file:///home/user/.config/code-oss-dev/storage.json') }],
            workspaces: [
                { folderUri: URI.parse('foo://bar/23/43'), remoteAuthority: 'test+test' },
                { workspace: { id: '53b714b46ef1a2d4346568b4f591028c', configPath: URI.parse('file:///home/user/workspaces/testing/custom.code-workspace') } },
                { label: 'abc', folderUri: URI.parse('file:///home/user/workspaces/testing/folding') }
            ]
        };
        assertEqualRecentlyOpened(windowsState, expected, 'v1_33');
    });
    test('toStoreData drops label if it matches path', () => {
        const actual = toStoreData({
            workspaces: [],
            files: [{
                    fileUri: URI.parse('file:///foo/bar/test.txt'),
                    label: '/foo/bar/test.txt',
                    remoteAuthority: undefined
                }]
        });
        assert.deepStrictEqual(actual, {
            entries: [{
                    fileUri: 'file:///foo/bar/test.txt',
                    label: undefined,
                    remoteAuthority: undefined
                }]
        });
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlc0hpc3RvcnlTdG9yYWdlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS93b3Jrc3BhY2VzL3Rlc3Qvbm9kZS93b3Jrc3BhY2VzSGlzdG9yeVN0b3JhZ2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUM1QixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUU1RCxPQUFPLEVBQW9ELGNBQWMsRUFBRSxxQkFBcUIsRUFBRSxXQUFXLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUVsSixLQUFLLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFO0lBRTdCLFNBQVMsV0FBVyxDQUFDLEdBQVE7UUFDNUIsT0FBTztZQUNOLEVBQUUsRUFBRSxNQUFNO1lBQ1YsVUFBVSxFQUFFLEdBQUc7U0FDZixDQUFDO0lBQ0gsQ0FBQztJQUNELFNBQVMsY0FBYyxDQUFDLEVBQW1CLEVBQUUsRUFBbUIsRUFBRSxPQUFnQjtRQUNqRixNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBRUQsU0FBUyxvQkFBb0IsQ0FBQyxFQUFvQyxFQUFFLEVBQW9DLEVBQUUsT0FBZ0I7UUFDekgsSUFBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ2hCLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNwQyxPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDdkQsQ0FBQztJQUVELFNBQVMseUJBQXlCLENBQUMsTUFBdUIsRUFBRSxRQUF5QixFQUFFLE9BQWdCO1FBQ3RHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDeEUsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDOUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzVFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNuRSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDeEYsQ0FBQztRQUNELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDbEYsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDbkQsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM5QyxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFDLElBQUksY0FBYyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7Z0JBQ2xDLGNBQWMsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFrQixjQUFlLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzVGLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxvQkFBb0IsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFxQixjQUFlLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3JHLENBQUM7WUFDRCxNQUFNLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzdELE1BQU0sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLGVBQWUsRUFBRSxZQUFZLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDaEYsQ0FBQztJQUNGLENBQUM7SUFFRCxTQUFTLGVBQWUsQ0FBQyxLQUFzQixFQUFFLE9BQWdCO1FBQ2hFLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsQyxNQUFNLFFBQVEsR0FBRyxxQkFBcUIsQ0FBQyxNQUFNLEVBQUUsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBQ3JFLHlCQUF5QixDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDckQsQ0FBQztJQUVELE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLGlCQUFpQixFQUFFLHFCQUFxQixDQUFDLENBQUMsQ0FBQztJQUN0RixNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO0lBQ2hGLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLGlCQUFpQixFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUM7SUFFaEYsTUFBTSxtQkFBbUIsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ3ZELE1BQU0saUJBQWlCLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBQ3pELE1BQU0sZUFBZSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsaUNBQWlDLENBQUMsQ0FBQztJQUVyRSxJQUFJLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO1FBQ2xDLElBQUksRUFBbUIsQ0FBQztRQUN4QixFQUFFLEdBQUc7WUFDSixLQUFLLEVBQUUsRUFBRTtZQUNULFVBQVUsRUFBRSxFQUFFO1NBQ2QsQ0FBQztRQUNGLGVBQWUsQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDN0IsRUFBRSxHQUFHO1lBQ0osS0FBSyxFQUFFLENBQUMsRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLEVBQUU7U0FDZCxDQUFDO1FBQ0YsZUFBZSxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM1QixFQUFFLEdBQUc7WUFDSixLQUFLLEVBQUUsRUFBRTtZQUNULFVBQVUsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxDQUFDO1NBQzFDLENBQUM7UUFDRixlQUFlLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzlCLEVBQUUsR0FBRztZQUNKLEtBQUssRUFBRSxFQUFFO1lBQ1QsVUFBVSxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsV0FBVyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLENBQUM7U0FDbEYsQ0FBQztRQUNGLGVBQWUsQ0FBQyxFQUFFLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztRQUU5QyxFQUFFLEdBQUc7WUFDSixLQUFLLEVBQUUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxDQUFDO1lBQ3ZDLFVBQVUsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLFdBQVcsQ0FBQyxlQUFlLENBQUMsRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLG1CQUFtQixFQUFFLENBQUM7U0FDN0YsQ0FBQztRQUNGLGVBQWUsQ0FBQyxFQUFFLEVBQUUsK0JBQStCLENBQUMsQ0FBQztRQUNyRCxFQUFFLEdBQUc7WUFDSixLQUFLLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxDQUFDO1lBQy9DLFVBQVUsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsV0FBVyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQztTQUN0RyxDQUFDO1FBQ0YsZUFBZSxDQUFDLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUM5QixFQUFFLEdBQUc7WUFDSixLQUFLLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztZQUM5RSxVQUFVLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsV0FBVyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsbUJBQW1CLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxDQUFDO1NBQ3hKLENBQUM7UUFDRixlQUFlLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ2xDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUU7UUFDdEIsTUFBTSxLQUFLLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztJQXFCWixDQUFDO1FBRUgsTUFBTSxZQUFZLEdBQUcscUJBQXFCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDcEYsTUFBTSxRQUFRLEdBQW9CO1lBQ2pDLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxxREFBcUQsQ0FBQyxFQUFFLENBQUM7WUFDcEcsVUFBVSxFQUFFO2dCQUNYLEVBQUUsU0FBUyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFO2dCQUN6RSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsRUFBRSxrQ0FBa0MsRUFBRSxVQUFVLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyw0REFBNEQsQ0FBQyxFQUFFLEVBQUU7Z0JBQzlJLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyw4Q0FBOEMsQ0FBQyxFQUFFO2FBQ3RGO1NBQ0QsQ0FBQztRQUVGLHlCQUF5QixDQUFDLFlBQVksRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDNUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNENBQTRDLEVBQUUsR0FBRyxFQUFFO1FBQ3ZELE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQztZQUMxQixVQUFVLEVBQUUsRUFBRTtZQUNkLEtBQUssRUFBRSxDQUFDO29CQUNQLE9BQU8sRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDO29CQUM5QyxLQUFLLEVBQUUsbUJBQW1CO29CQUMxQixlQUFlLEVBQUUsU0FBUztpQkFDMUIsQ0FBQztTQUNGLENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFO1lBQzlCLE9BQU8sRUFBRSxDQUFDO29CQUNULE9BQU8sRUFBRSwwQkFBMEI7b0JBQ25DLEtBQUssRUFBRSxTQUFTO29CQUNoQixlQUFlLEVBQUUsU0FBUztpQkFDMUIsQ0FBQztTQUNGLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztBQUMzQyxDQUFDLENBQUMsQ0FBQyJ9