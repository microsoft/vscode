/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getWindowsStateStoreData, restoreWindowsState } from '../../electron-main/windowsStateHandler.js';
suite('Windows State Storing', () => {
    function getUIState() {
        return {
            x: 0,
            y: 10,
            width: 100,
            height: 200,
            mode: 0
        };
    }
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
    function assertEqualWindowState(expected, actual, message) {
        if (!expected || !actual) {
            assert.deepStrictEqual(expected, actual, message);
            return;
        }
        assert.strictEqual(expected.backupPath, actual.backupPath, message);
        assertEqualURI(expected.folderUri, actual.folderUri, message);
        assert.strictEqual(expected.remoteAuthority, actual.remoteAuthority, message);
        assertEqualWorkspace(expected.workspace, actual.workspace, message);
        assert.deepStrictEqual(expected.uiState, actual.uiState, message);
    }
    function assertEqualWindowsState(expected, actual, message) {
        assertEqualWindowState(expected.lastPluginDevelopmentHostWindow, actual.lastPluginDevelopmentHostWindow, message);
        assertEqualWindowState(expected.lastActiveWindow, actual.lastActiveWindow, message);
        assert.strictEqual(expected.openedWindows.length, actual.openedWindows.length, message);
        for (let i = 0; i < expected.openedWindows.length; i++) {
            assertEqualWindowState(expected.openedWindows[i], actual.openedWindows[i], message);
        }
    }
    function assertRestoring(state, message) {
        const stored = getWindowsStateStoreData(state);
        const restored = restoreWindowsState(stored);
        assertEqualWindowsState(state, restored, message);
    }
    const testBackupPath1 = join(tmpdir(), 'windowStateTest', 'backupFolder1');
    const testBackupPath2 = join(tmpdir(), 'windowStateTest', 'backupFolder2');
    const testWSPath = URI.file(join(tmpdir(), 'windowStateTest', 'test.code-workspace'));
    const testFolderURI = URI.file(join(tmpdir(), 'windowStateTest', 'testFolder'));
    const testRemoteFolderURI = URI.parse('foo://bar/c/d');
    test('storing and restoring', () => {
        let windowState;
        windowState = {
            openedWindows: []
        };
        assertRestoring(windowState, 'no windows');
        windowState = {
            openedWindows: [{ backupPath: testBackupPath1, uiState: getUIState() }]
        };
        assertRestoring(windowState, 'empty workspace');
        windowState = {
            openedWindows: [{ backupPath: testBackupPath1, uiState: getUIState(), workspace: toWorkspace(testWSPath) }]
        };
        assertRestoring(windowState, 'workspace');
        windowState = {
            openedWindows: [{ backupPath: testBackupPath2, uiState: getUIState(), folderUri: testFolderURI }]
        };
        assertRestoring(windowState, 'folder');
        windowState = {
            openedWindows: [{ backupPath: testBackupPath1, uiState: getUIState(), folderUri: testFolderURI }, { backupPath: testBackupPath1, uiState: getUIState(), folderUri: testRemoteFolderURI, remoteAuthority: 'bar' }]
        };
        assertRestoring(windowState, 'multiple windows');
        windowState = {
            lastActiveWindow: { backupPath: testBackupPath2, uiState: getUIState(), folderUri: testFolderURI },
            openedWindows: []
        };
        assertRestoring(windowState, 'lastActiveWindow');
        windowState = {
            lastPluginDevelopmentHostWindow: { backupPath: testBackupPath2, uiState: getUIState(), folderUri: testFolderURI },
            openedWindows: []
        };
        assertRestoring(windowState, 'lastPluginDevelopmentHostWindow');
    });
    test('open 1_32', () => {
        const v1_32_workspace = `{
			"openedWindows": [],
			"lastActiveWindow": {
				"workspaceIdentifier": {
					"id": "53b714b46ef1a2d4346568b4f591028c",
					"configURIPath": "file:///home/user/workspaces/testing/custom.code-workspace"
				},
				"backupPath": "/home/user/.config/code-oss-dev/Backups/53b714b46ef1a2d4346568b4f591028c",
				"uiState": {
					"mode": 0,
					"x": 0,
					"y": 27,
					"width": 2560,
					"height": 1364
				}
			}
		}`;
        let windowsState = restoreWindowsState(JSON.parse(v1_32_workspace));
        let expected = {
            openedWindows: [],
            lastActiveWindow: {
                backupPath: '/home/user/.config/code-oss-dev/Backups/53b714b46ef1a2d4346568b4f591028c',
                uiState: { mode: 0 /* WindowMode.Maximized */, x: 0, y: 27, width: 2560, height: 1364 },
                workspace: { id: '53b714b46ef1a2d4346568b4f591028c', configPath: URI.parse('file:///home/user/workspaces/testing/custom.code-workspace') }
            }
        };
        assertEqualWindowsState(expected, windowsState, 'v1_32_workspace');
        const v1_32_folder = `{
			"openedWindows": [],
			"lastActiveWindow": {
				"folder": "file:///home/user/workspaces/testing/folding",
				"backupPath": "/home/user/.config/code-oss-dev/Backups/1daac1621c6c06f9e916ac8062e5a1b5",
				"uiState": {
					"mode": 1,
					"x": 625,
					"y": 263,
					"width": 1718,
					"height": 953
				}
			}
		}`;
        windowsState = restoreWindowsState(JSON.parse(v1_32_folder));
        expected = {
            openedWindows: [],
            lastActiveWindow: {
                backupPath: '/home/user/.config/code-oss-dev/Backups/1daac1621c6c06f9e916ac8062e5a1b5',
                uiState: { mode: 1 /* WindowMode.Normal */, x: 625, y: 263, width: 1718, height: 953 },
                folderUri: URI.parse('file:///home/user/workspaces/testing/folding')
            }
        };
        assertEqualWindowsState(expected, windowsState, 'v1_32_folder');
        const v1_32_empty_window = ` {
			"openedWindows": [
			],
			"lastActiveWindow": {
				"backupPath": "/home/user/.config/code-oss-dev/Backups/1549539668998",
				"uiState": {
					"mode": 1,
					"x": 768,
					"y": 336,
					"width": 1200,
					"height": 800
				}
			}
		}`;
        windowsState = restoreWindowsState(JSON.parse(v1_32_empty_window));
        expected = {
            openedWindows: [],
            lastActiveWindow: {
                backupPath: '/home/user/.config/code-oss-dev/Backups/1549539668998',
                uiState: { mode: 1 /* WindowMode.Normal */, x: 768, y: 336, width: 1200, height: 800 }
            }
        };
        assertEqualWindowsState(expected, windowsState, 'v1_32_empty_window');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93c1N0YXRlSGFuZGxlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd2luZG93cy90ZXN0L2VsZWN0cm9uLW1haW4vd2luZG93c1N0YXRlSGFuZGxlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEcsT0FBTyxFQUFFLHdCQUF3QixFQUErQixtQkFBbUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBR3hJLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLEVBQUU7SUFFbkMsU0FBUyxVQUFVO1FBQ2xCLE9BQU87WUFDTixDQUFDLEVBQUUsQ0FBQztZQUNKLENBQUMsRUFBRSxFQUFFO1lBQ0wsS0FBSyxFQUFFLEdBQUc7WUFDVixNQUFNLEVBQUUsR0FBRztZQUNYLElBQUksRUFBRSxDQUFDO1NBQ1AsQ0FBQztJQUNILENBQUM7SUFFRCxTQUFTLFdBQVcsQ0FBQyxHQUFRO1FBQzVCLE9BQU87WUFDTixFQUFFLEVBQUUsTUFBTTtZQUNWLFVBQVUsRUFBRSxHQUFHO1NBQ2YsQ0FBQztJQUNILENBQUM7SUFDRCxTQUFTLGNBQWMsQ0FBQyxFQUFtQixFQUFFLEVBQW1CLEVBQUUsT0FBZ0I7UUFDakYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsUUFBUSxF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