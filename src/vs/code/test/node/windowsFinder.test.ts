/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as path from 'vs/base/common/path';
import { findBestWindowOrFolderForFile, ISimpleWindow, IBestWindowOrFolderOptions } from 'vs/code/node/windowsFinder';
import { OpenContext } from 'vs/platform/windows/common/windows';
import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { toWorkspaceFolders } from 'vs/platform/workspace/common/workspace';
import { URI } from 'vs/base/common/uri';
import { getPathFromAmdModule } from 'vs/base/common/amd';

const fixturesFolder = getPathFromAmdModule(require, './fixtures');

const testWorkspace: IWorkspaceIdentifier = {
	id: Date.now().toString(),
	configPath: URI.file(path.join(fixturesFolder, 'workspaces.json'))
};

const testWorkspaceFolders = toWorkspaceFolders([{ path: path.join(fixturesFolder, 'vscode_workspace_1_folder') }, { path: path.join(fixturesFolder, 'vscode_workspace_2_folder') }], testWorkspace.configPath);

function options(custom?: Partial<IBestWindowOrFolderOptions<ISimpleWindow>>): IBestWindowOrFolderOptions<ISimpleWindow> {
	return {
		windows: [],
		newWindow: false,
		context: OpenContext.CLI,
		codeSettingsFolder: '_vscode',
		localWorkspaceResolver: workspace => { return workspace === testWorkspace ? { id: testWorkspace.id, configPath: workspace.configPath, folders: testWorkspaceFolders } : null; },
		...custom
	};
}

const vscodeFolderWindow: ISimpleWindow = { lastFocusTime: 1, openedFolderUri: URI.file(path.join(fixturesFolder, 'vscode_folder')) };
const lastActiveWindow: ISimpleWindow = { lastFocusTime: 3, openedFolderUri: undefined };
const noVscodeFolderWindow: ISimpleWindow = { lastFocusTime: 2, openedFolderUri: URI.file(path.join(fixturesFolder, 'no_vscode_folder')) };
const windows: ISimpleWindow[] = [
	vscodeFolderWindow,
	lastActiveWindow,
	noVscodeFolderWindow,
];

suite('WindowsFinder', () => {

	test('New window without folder when no windows exist', () => {
		assert.equal(findBestWindowOrFolderForFile(options()), null);
		assert.equal(findBestWindowOrFolderForFile(options({
			fileUri: URI.file(path.join(fixturesFolder, 'no_vscode_folder', 'file.txt'))
		})), null);
		assert.equal(findBestWindowOrFolderForFile(options({
			fileUri: URI.file(path.join(fixturesFolder, 'vscode_folder', 'file.txt')),
			newWindow: true
		})), null);
		assert.equal(findBestWindowOrFolderForFile(options({
			fileUri: URI.file(path.join(fixturesFolder, 'vscode_folder', 'file.txt')),
		})), null);
		assert.equal(findBestWindowOrFolderForFile(options({
			fileUri: URI.file(path.join(fixturesFolder, 'vscode_folder', 'file.txt')),
			context: OpenContext.API
		})), null);
		assert.equal(findBestWindowOrFolderForFile(options({
			fileUri: URI.file(path.join(fixturesFolder, 'vscode_folder', 'file.txt'))
		})), null);
		assert.equal(findBestWindowOrFolderForFile(options({
			fileUri: URI.file(path.join(fixturesFolder, 'vscode_folder', 'new_folder', 'new_file.txt'))
		})), null);
	});

	test('New window without folder when windows exist', () => {
		assert.equal(findBestWindowOrFolderForFile(options({
			windows,
			fileUri: URI.file(path.join(fixturesFolder, 'no_vscode_folder', 'file.txt')),
			newWindow: true
		})), null);
	});

	test('Last active window', () => {
		assert.equal(findBestWindowOrFolderForFile(options({
			windows
		})), lastActiveWindow);
		assert.equal(findBestWindowOrFolderForFile(options({
			windows,
			fileUri: URI.file(path.join(fixturesFolder, 'no_vscode_folder2', 'file.txt'))
		})), lastActiveWindow);
		assert.equal(findBestWindowOrFolderForFile(options({
			windows: [lastActiveWindow, noVscodeFolderWindow],
			fileUri: URI.file(path.join(fixturesFolder, 'vscode_folder', 'file.txt')),
		})), lastActiveWindow);
		assert.equal(findBestWindowOrFolderForFile(options({
			windows,
			fileUri: URI.file(path.join(fixturesFolder, 'no_vscode_folder', 'file.txt')),
			context: OpenContext.API
		})), lastActiveWindow);
	});

	test('Existing window with folder', () => {
		assert.equal(findBestWindowOrFolderForFile(options({
			windows,
			fileUri: URI.file(path.join(fixturesFolder, 'no_vscode_folder', 'file.txt'))
		})), noVscodeFolderWindow);
		assert.equal(findBestWindowOrFolderForFile(options({
			windows,
			fileUri: URI.file(path.join(fixturesFolder, 'vscode_folder', 'file.txt'))
		})), vscodeFolderWindow);
		const window: ISimpleWindow = { lastFocusTime: 1, openedFolderUri: URI.file(path.join(fixturesFolder, 'vscode_folder', 'nested_folder')) };
		assert.equal(findBestWindowOrFolderForFile(options({
			windows: [window],
			fileUri: URI.file(path.join(fixturesFolder, 'vscode_folder', 'nested_folder', 'subfolder', 'file.txt'))
		})), window);
	});

	test('More specific existing window wins', () => {
		const window: ISimpleWindow = { lastFocusTime: 2, openedFolderUri: URI.file(path.join(fixturesFolder, 'no_vscode_folder')) };
		const nestedFolderWindow: ISimpleWindow = { lastFocusTime: 1, openedFolderUri: URI.file(path.join(fixturesFolder, 'no_vscode_folder', 'nested_folder')) };
		assert.equal(findBestWindowOrFolderForFile(options({
			windows: [window, nestedFolderWindow],
			fileUri: URI.file(path.join(fixturesFolder, 'no_vscode_folder', 'nested_folder', 'subfolder', 'file.txt'))
		})), nestedFolderWindow);
	});

	test('Workspace folder wins', () => {
		const window: ISimpleWindow = { lastFocusTime: 1, openedWorkspace: testWorkspace };
		assert.equal(findBestWindowOrFolderForFile(options({
			windows: [window],
			fileUri: URI.file(path.join(fixturesFolder, 'vscode_workspace_2_folder', 'nested_vscode_folder', 'subfolder', 'file.txt'))
		})), window);
	});
});
