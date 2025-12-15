/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { join } from '../../../../base/common/path.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI, UriDto } from '../../../../base/common/uri.js';
import { ICommandAction } from '../../../action/common/action.js';
import { NativeParsedArgs } from '../../../environment/common/argv.js';
import { INativeWindowConfiguration } from '../../../window/common/window.js';
import { ICodeWindow, ILoadEvent, IWindowState } from '../../../window/electron-main/window.js';
import { findWindowOnFile } from '../../electron-main/windowsFinder.js';
import { toWorkspaceFolders } from '../../../workspaces/common/workspaces.js';
import { IWorkspaceIdentifier } from '../../../workspace/common/workspace.js';
import { FileAccess } from '../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FocusMode } from '../../../native/common/native.js';

suite('WindowsFinder', () => {

	const fixturesFolder = FileAccess.asFileUri('vs/platform/windows/test/electron-main/fixtures').fsPath;

	const testWorkspace: IWorkspaceIdentifier = {
		id: Date.now().toString(),
		configPath: URI.file(join(fixturesFolder, 'workspaces.json'))
	};

	const testWorkspaceFolders = toWorkspaceFolders([{ path: join(fixturesFolder, 'vscode_workspace_1_folder') }, { path: join(fixturesFolder, 'vscode_workspace_2_folder') }], testWorkspace.configPath, extUriBiasedIgnorePathCase);
	const localWorkspaceResolver = async (workspace: IWorkspaceIdentifier) => { return workspace === testWorkspace ? { id: testWorkspace.id, configPath: workspace.configPath, folders: testWorkspaceFolders } : undefined; };

	function createTestCodeWindow(options: { lastFocusTime: number; openedFolderUri?: URI; openedWorkspace?: IWorkspaceIdentifier }): ICodeWindow {
		return new class implements ICodeWindow {
			readonly onWillLoad: Event<ILoadEvent> = Event.None;
			onDidMaximize = Event.None;
			onDidUnmaximize = Event.None;
			readonly onDidTriggerSystemContextMenu: Event<{ x: number; y: number }> = Event.None;
			readonly onDidSignalReady: Event<void> = Event.None;
			readonly onDidClose: Event<void> = Event.None;
			readonly onDidDestroy: Event<void> = Event.None;
			readonly onDidEnterFullScreen: Event<void> = Event.None;
			readonly onDidLeaveFullScreen: Event<void> = Event.None;
			whenClosedOrLoaded: Promise<void> = Promise.resolve();
			id: number = -1;
			win: Electron.BrowserWindow = null!;
			config: INativeWindowConfiguration | undefined;
			openedWorkspace = options.openedFolderUri ? { id: '', uri: options.openedFolderUri } : options.openedWorkspace;
			backupPath?: string | undefined;
			remoteAuthority?: string | undefined;
			isExtensionDevelopmentHost = false;
			isExtensionTestHost = false;
			lastFocusTime = options.lastFocusTime;
			isFullScreen = false;
			isReady = true;

			ready(): Promise<ICodeWindow> { throw new Error('Method not implemented.'); }
			setReady(): void { throw new Error('Method not implemented.'); }
			addTabbedWindow(window: ICodeWindow): void { throw new Error('Method not implemented.'); }
			load(config: INativeWindowConfiguration, options: { isReload?: boolean }): void { throw new Error('Method not implemented.'); }
			reload(cli?: NativeParsedArgs): void { throw new Error('Method not implemented.'); }
			focus(options?: { mode: FocusMode }): void { throw new Error('Method not implemented.'); }
			close(): void { throw new Error('Method not implemented.'); }
			getBounds(): Electron.Rectangle { throw new Error('Method not implemented.'); }
			send(channel: string, ...args: unknown[]): void { throw new Error('Method not implemented.'); }
			sendWhenReady(channel: string, token: CancellationToken, ...args: unknown[]): void { throw new Error('Method not implemented.'); }
			toggleFullScreen(): void { throw new Error('Method not implemented.'); }
			setRepresentedFilename(name: string): void { throw new Error('Method not implemented.'); }
			getRepresentedFilename(): string | undefined { throw new Error('Method not implemented.'); }
			setDocumentEdited(edited: boolean): void { throw new Error('Method not implemented.'); }
			isDocumentEdited(): boolean { throw new Error('Method not implemented.'); }
			updateTouchBar(items: UriDto<ICommandAction>[][]): void { throw new Error('Method not implemented.'); }
			serializeWindowState(): IWindowState { throw new Error('Method not implemented'); }
			updateWindowControls(options: { height?: number | undefined; backgroundColor?: string | undefined; foregroundColor?: string | undefined }): void { throw new Error('Method not implemented.'); }
			notifyZoomLevel(level: number): void { throw new Error('Method not implemented.'); }
			matches(webContents: Electron.WebContents): boolean { throw new Error('Method not implemented.'); }
			dispose(): void { }
		};
	}

	const vscodeFolderWindow: ICodeWindow = createTestCodeWindow({ lastFocusTime: 1, openedFolderUri: URI.file(join(fixturesFolder, 'vscode_folder')) });
	const lastActiveWindow: ICodeWindow = createTestCodeWindow({ lastFocusTime: 3, openedFolderUri: undefined });
	const noVscodeFolderWindow: ICodeWindow = createTestCodeWindow({ lastFocusTime: 2, openedFolderUri: URI.file(join(fixturesFolder, 'no_vscode_folder')) });
	const windows: ICodeWindow[] = [
		vscodeFolderWindow,
		lastActiveWindow,
		noVscodeFolderWindow,
	];

	test('New window without folder when no windows exist', async () => {
		assert.strictEqual(await findWindowOnFile([], URI.file('nonexisting'), localWorkspaceResolver), undefined);
		assert.strictEqual(await findWindowOnFile([], URI.file(join(fixturesFolder, 'no_vscode_folder', 'file.txt')), localWorkspaceResolver), undefined);
	});

	test('Existing window with folder', async () => {
		assert.strictEqual(await findWindowOnFile(windows, URI.file(join(fixturesFolder, 'no_vscode_folder', 'file.txt')), localWorkspaceResolver), noVscodeFolderWindow);

		assert.strictEqual(await findWindowOnFile(windows, URI.file(join(fixturesFolder, 'vscode_folder', 'file.txt')), localWorkspaceResolver), vscodeFolderWindow);

		const window: ICodeWindow = createTestCodeWindow({ lastFocusTime: 1, openedFolderUri: URI.file(join(fixturesFolder, 'vscode_folder', 'nested_folder')) });
		assert.strictEqual(await findWindowOnFile([window], URI.file(join(fixturesFolder, 'vscode_folder', 'nested_folder', 'subfolder', 'file.txt')), localWorkspaceResolver), window);
	});

	test('More specific existing window wins', async () => {
		const window: ICodeWindow = createTestCodeWindow({ lastFocusTime: 2, openedFolderUri: URI.file(join(fixturesFolder, 'no_vscode_folder')) });
		const nestedFolderWindow: ICodeWindow = createTestCodeWindow({ lastFocusTime: 1, openedFolderUri: URI.file(join(fixturesFolder, 'no_vscode_folder', 'nested_folder')) });
		assert.strictEqual(await findWindowOnFile([window, nestedFolderWindow], URI.file(join(fixturesFolder, 'no_vscode_folder', 'nested_folder', 'subfolder', 'file.txt')), localWorkspaceResolver), nestedFolderWindow);
	});

	test('Workspace folder wins', async () => {
		const window: ICodeWindow = createTestCodeWindow({ lastFocusTime: 1, openedWorkspace: testWorkspace });
		assert.strictEqual(await findWindowOnFile([window], URI.file(join(fixturesFolder, 'vscode_workspace_2_folder', 'nested_vscode_folder', 'subfolder', 'file.txt')), localWorkspaceResolver), window);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
