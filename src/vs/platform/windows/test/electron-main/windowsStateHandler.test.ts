/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { tmpdir } from 'os';
import { join } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IWindowState as IWindowUIState, WindowMode } from 'vs/platform/window/electron-main/window';
import { getWindowsStateStoreData, IWindowsState, IWindowState, restoreWindowsState } from 'vs/platform/windows/electron-main/windowsStateHandler';
import { IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

suite('Windows State Storing', () => {

	function getUIState(): IWindowUIState {
		return {
			x: 0,
			y: 10,
			width: 100,
			height: 200,
			mode: 0
		};
	}

	function toWorkspace(uri: URI): IWorkspaceIdentifier {
		return {
			id: '1234',
			configPath: uri
		};
	}
	function assertEqualURI(u1: URI | undefined, u2: URI | undefined, message?: string): void {
		assert.strictEqual(u1 && u1.toString(), u2 && u2.toString(), message);
	}

	function assertEqualWorkspace(w1: IWorkspaceIdentifier | undefined, w2: IWorkspaceIdentifier | undefined, message?: string): void {
		if (!w1 || !w2) {
			assert.strictEqual(w1, w2, message);
			return;
		}
		assert.strictEqual(w1.id, w2.id, message);
		assertEqualURI(w1.configPath, w2.configPath, message);
	}

	function assertEqualWindowState(expected: IWindowState | undefined, actual: IWindowState | undefined, message?: string) {
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

	function assertEqualWindowsState(expected: IWindowsState, actual: IWindowsState, message?: string) {
		assertEqualWindowState(expected.lastPluginDevelopmentHostWindow, actual.lastPluginDevelopmentHostWindow, message);
		assertEqualWindowState(expected.lastActiveWindow, actual.lastActiveWindow, message);
		assert.strictEqual(expected.openedWindows.length, actual.openedWindows.length, message);
		for (let i = 0; i < expected.openedWindows.length; i++) {
			assertEqualWindowState(expected.openedWindows[i], actual.openedWindows[i], message);
		}
	}

	function assertRestoring(state: IWindowsState, message?: string) {
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
		let windowState: IWindowsState;
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
		let expected: IWindowsState = {
			openedWindows: [],
			lastActiveWindow: {
				backupPath: '/home/user/.config/code-oss-dev/Backups/53b714b46ef1a2d4346568b4f591028c',
				uiState: { mode: WindowMode.Maximized, x: 0, y: 27, width: 2560, height: 1364 },
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
				uiState: { mode: WindowMode.Normal, x: 625, y: 263, width: 1718, height: 953 },
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
					"width": 1024,
					"height": 768
				}
			}
		}`;

		windowsState = restoreWindowsState(JSON.parse(v1_32_empty_window));
		expected = {
			openedWindows: [],
			lastActiveWindow: {
				backupPath: '/home/user/.config/code-oss-dev/Backups/1549539668998',
				uiState: { mode: WindowMode.Normal, x: 768, y: 336, width: 1024, height: 768 }
			}
		};
		assertEqualWindowsState(expected, windowsState, 'v1_32_empty_window');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
