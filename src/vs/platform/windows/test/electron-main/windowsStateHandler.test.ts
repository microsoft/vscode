/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IWindowState as IWindowUIState, WindowMode, ICodeWindow } from '../../../window/electron-main/window.js';
import { INativeWindowConfiguration } from '../../../window/common/window.js';
import { getWindowsStateStoreData, IWindowsState, IWindowState, restoreWindowsState, WindowsStateHandler } from '../../electron-main/windowsStateHandler.js';
import { IWindowsMainService } from '../../electron-main/windows.js';
import { IWorkspaceIdentifier } from '../../../workspace/common/workspace.js';
import { IStateService } from '../../../state/node/state.js';
import { ILifecycleMainService } from '../../../lifecycle/electron-main/lifecycleMainService.js';
import { NullLogService } from '../../../log/common/log.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';

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

		// A folder location carried by state of an older version is ignored
		const stored = getWindowsStateStoreData({ openedWindows: [{ backupPath: testBackupPath2, uiState: getUIState(), folderUri: testFolderURI }] });
		const restored = restoreWindowsState({ ...stored, openedWindows: stored.openedWindows.map(window => ({ ...window, folderLocation: { uri: 'file:///alt', label: 'Alt', providerId: 'p' } })) });
		assert.deepStrictEqual(Object.keys(restored.openedWindows[0]).includes('folderLocation'), false);

		windowState = {
			openedWindows: [{ backupPath: testBackupPath1, uiState: getUIState(), folderUri: testFolderURI }, { backupPath: testBackupPath1, uiState: getUIState(), folderUri: testRemoteFolderURI, remoteAuthority: 'bar' }]
		};
		assertRestoring(windowState, 'multiple windows');

		windowState = {
			openedWindows: [{ backupPath: testBackupPath1, uiState: { ...getUIState(), minimized: true }, folderUri: testFolderURI }]
		};
		assertRestoring(windowState, 'minimized window');

		windowState = {
			openedWindows: [
				{ backupPath: testBackupPath1, uiState: { ...getUIState(), alwaysOnTop: true }, folderUri: testFolderURI },
				{ backupPath: testBackupPath2, uiState: { ...getUIState(), alwaysOnTop: false }, folderUri: testRemoteFolderURI, remoteAuthority: 'bar' }
			]
		};
		assertRestoring(windowState, 'independent always-on-top states');

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
				uiState: { mode: WindowMode.Normal, x: 768, y: 336, width: 1200, height: 800 }
			}
		};
		assertEqualWindowsState(expected, windowsState, 'v1_32_empty_window');
	});

	suite('sessions window behavior', () => {
		const disposables = new DisposableStore();

		teardown(() => {
			disposables.clear();
		});

		function createMockWindow(id: number, options?: { isSessionsWindow?: boolean; folderUri?: URI; workspace?: IWorkspaceIdentifier; backupPath?: string }): ICodeWindow {
			return {
				id,
				config: options?.isSessionsWindow ? { isSessionsWindow: true } as INativeWindowConfiguration : {} as INativeWindowConfiguration,
				openedWorkspace: options?.folderUri ? { id: 'folder-' + id, uri: options.folderUri } : options?.workspace,
				backupPath: options?.backupPath,
				remoteAuthority: undefined,
				isExtensionDevelopmentHost: false,
				isExtensionTestHost: false,
				serializeWindowState: () => ({ mode: WindowMode.Normal, x: 10 * id, y: 10 * id, width: 800, height: 600 }),
			} as unknown as ICodeWindow;
		}

		test('closing regular window saves lastClosedState when sessions window remains open', () => {
			const onBeforeCloseWindow = new Emitter<ICodeWindow>();
			const onBeforeShutdown = new Emitter<void>();
			const onWillShutdown = new Emitter<void>();
			const onDidChangeWindowsCount = new Emitter<{ oldCount: number; newCount: number }>();
			const onDidDestroyWindow = new Emitter<ICodeWindow>();

			const storage = new Map<string, unknown>();
			const stateService: IStateService = {
				_serviceBrand: undefined,
				getItem: (key: string) => storage.get(key),
				setItem: (key: string, data: unknown) => storage.set(key, data),
				removeItem: (key: string) => storage.delete(key),
			} as unknown as IStateService;

			let openWindows: ICodeWindow[] = [];
			const windowsMainService: IWindowsMainService = {
				getWindows: () => openWindows,
				getWindowCount: () => openWindows.length,
				getLastActiveWindow: () => openWindows[openWindows.length - 1],
				onDidChangeWindowsCount: onDidChangeWindowsCount.event,
				onDidDestroyWindow: onDidDestroyWindow.event,
			} as unknown as IWindowsMainService;

			const lifecycleMainService: ILifecycleMainService = {
				onBeforeCloseWindow: onBeforeCloseWindow.event,
				onBeforeShutdown: onBeforeShutdown.event,
				onWillShutdown: onWillShutdown.event,
				quitRequested: false,
			} as unknown as ILifecycleMainService;

			disposables.add(new WindowsStateHandler(
				windowsMainService,
				stateService,
				lifecycleMainService,
				new NullLogService(),
				new TestConfigurationService()
			));

			const regularWindow = createMockWindow(1, { folderUri: URI.file('/test/folder') });
			const sessionsWindow = createMockWindow(2, { isSessionsWindow: true });
			openWindows = [regularWindow, sessionsWindow];

			// 1. Regular window closes while sessions window is still open
			onBeforeCloseWindow.fire(regularWindow);
			openWindows = [sessionsWindow];

			// 2. Sessions window closes last, followed by shutdown
			onBeforeCloseWindow.fire(sessionsWindow);
			openWindows = [];
			onBeforeShutdown.fire();

			// Verify: lastActiveWindow saved to state is the regular window, NOT the sessions window!
			const savedState = stateService.getItem<any>(WindowsStateHandler.windowsStateStorageKey);
			assert.ok(savedState);
			const restoredState = restoreWindowsState(savedState);
			assert.ok(restoredState.lastActiveWindow);
			assertEqualURI(restoredState.lastActiveWindow.folderUri, URI.file('/test/folder'));
		});

		test('onBeforeShutdown ignores sessions window when selecting lastActiveWindow', () => {
			const onBeforeCloseWindow = new Emitter<ICodeWindow>();
			const onBeforeShutdown = new Emitter<void>();
			const onWillShutdown = new Emitter<void>();
			const onDidChangeWindowsCount = new Emitter<{ oldCount: number; newCount: number }>();
			const onDidDestroyWindow = new Emitter<ICodeWindow>();

			const storage = new Map<string, unknown>();
			const stateService: IStateService = {
				_serviceBrand: undefined,
				getItem: (key: string) => storage.get(key),
				setItem: (key: string, data: unknown) => storage.set(key, data),
				removeItem: (key: string) => storage.delete(key),
			} as unknown as IStateService;

			const regularWindow = createMockWindow(1, { folderUri: URI.file('/test/workspace') });
			const sessionsWindow = createMockWindow(2, { isSessionsWindow: true });
			const openWindows = [regularWindow, sessionsWindow];

			const windowsMainService: IWindowsMainService = {
				getWindows: () => openWindows,
				getWindowCount: () => openWindows.length,
				getLastActiveWindow: () => sessionsWindow, // sessions window was focused when user quit
				onDidChangeWindowsCount: onDidChangeWindowsCount.event,
				onDidDestroyWindow: onDidDestroyWindow.event,
			} as unknown as IWindowsMainService;

			const lifecycleMainService: ILifecycleMainService = {
				onBeforeCloseWindow: onBeforeCloseWindow.event,
				onBeforeShutdown: onBeforeShutdown.event,
				onWillShutdown: onWillShutdown.event,
				quitRequested: false,
			} as unknown as ILifecycleMainService;

			disposables.add(new WindowsStateHandler(
				windowsMainService,
				stateService,
				lifecycleMainService,
				new NullLogService(),
				new TestConfigurationService()
			));

			// User quits with both windows open and sessions window active
			onBeforeShutdown.fire();

			const savedState = stateService.getItem<any>(WindowsStateHandler.windowsStateStorageKey);
			assert.ok(savedState);
			const restoredState = restoreWindowsState(savedState);
			// lastActiveWindow must be the regular window, not the sessions window
			assert.ok(restoredState.lastActiveWindow);
			assertEqualURI(restoredState.lastActiveWindow.folderUri, URI.file('/test/workspace'));
			// openedWindows preserves both
			assert.strictEqual(restoredState.openedWindows.length, 2);
		});

		test('closing only a sessions window does not save it as lastClosedState', () => {
			const onBeforeCloseWindow = new Emitter<ICodeWindow>();
			const onBeforeShutdown = new Emitter<void>();
			const onWillShutdown = new Emitter<void>();
			const onDidChangeWindowsCount = new Emitter<{ oldCount: number; newCount: number }>();
			const onDidDestroyWindow = new Emitter<ICodeWindow>();

			const storage = new Map<string, unknown>();
			const stateService: IStateService = {
				_serviceBrand: undefined,
				getItem: (key: string) => storage.get(key),
				setItem: (key: string, data: unknown) => storage.set(key, data),
				removeItem: (key: string) => storage.delete(key),
			} as unknown as IStateService;

			const sessionsWindow = createMockWindow(1, { isSessionsWindow: true });
			let openWindows = [sessionsWindow];

			const windowsMainService: IWindowsMainService = {
				getWindows: () => openWindows,
				getWindowCount: () => openWindows.length,
				getLastActiveWindow: () => sessionsWindow,
				onDidChangeWindowsCount: onDidChangeWindowsCount.event,
				onDidDestroyWindow: onDidDestroyWindow.event,
			} as unknown as IWindowsMainService;

			const lifecycleMainService: ILifecycleMainService = {
				onBeforeCloseWindow: onBeforeCloseWindow.event,
				onBeforeShutdown: onBeforeShutdown.event,
				onWillShutdown: onWillShutdown.event,
				quitRequested: false,
			} as unknown as ILifecycleMainService;

			disposables.add(new WindowsStateHandler(
				windowsMainService,
				stateService,
				lifecycleMainService,
				new NullLogService(),
				new TestConfigurationService()
			));

			onBeforeCloseWindow.fire(sessionsWindow);
			openWindows = [];
			onBeforeShutdown.fire();

			const savedState = stateService.getItem<IWindowsState>(WindowsStateHandler.windowsStateStorageKey);
			assert.ok(savedState);
			assert.strictEqual(savedState.lastActiveWindow, undefined);
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
