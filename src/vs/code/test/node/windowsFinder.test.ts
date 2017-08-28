/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import path = require('path');
import { findBestWindowOrFolderForFile, ISimpleWindow, IBestWindowOrFolderOptions } from 'vs/code/node/windowsFinder';
import { OpenContext } from 'vs/platform/windows/common/windows';
import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

const fixturesFolder = require.toUrl('./fixtures');

const testWorkspace: IWorkspaceIdentifier = {
	id: Date.now().toString(),
	configPath: path.join(fixturesFolder, 'workspaces.json')
};

function options(custom?: Partial<IBestWindowOrFolderOptions<ISimpleWindow>>): IBestWindowOrFolderOptions<ISimpleWindow> {
	return {
		windows: [],
		newWindow: false,
		reuseWindow: false,
		context: OpenContext.CLI,
		codeSettingsFolder: '_vscode',
		workspaceResolver: workspace => { return workspace === testWorkspace ? { id: testWorkspace.id, configPath: workspace.configPath, folders: [{ path: path.join(fixturesFolder, 'vscode_workspace_1_folder') }, { path: path.join(fixturesFolder, 'vscode_workspace_2_folder') }] } : null; },
		...custom
	};
}

const vscodeFolderWindow = { lastFocusTime: 1, openedFolderPath: path.join(fixturesFolder, 'vscode_folder') };
const lastActiveWindow = { lastFocusTime: 3, openedFolderPath: null };
const noVscodeFolderWindow = { lastFocusTime: 2, openedFolderPath: path.join(fixturesFolder, 'no_vscode_folder') };
const windows = [
	vscodeFolderWindow,
	lastActiveWindow,
	noVscodeFolderWindow,
];

suite('WindowsFinder', () => {

	test('New window without folder when no windows exist', () => {
		assert.equal(findBestWindowOrFolderForFile(options()), null);
		assert.equal(findBestWindowOrFolderForFile(options({
			filePath: path.join(fixturesFolder, 'no_vscode_folder', 'file.txt')
		})), null);
		assert.equal(findBestWindowOrFolderForFile(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt'),
			newWindow: true // We assume this implies 'editor' work mode, might need separate CLI option later.
		})), null);
		assert.equal(findBestWindowOrFolderForFile(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt'),
			reuseWindow: true // We assume this implies 'editor' work mode, might need separate CLI option later.
		})), null);
		assert.equal(findBestWindowOrFolderForFile(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt'),
			context: OpenContext.API
		})), null);
	});

	test('New window with folder when no windows exist', () => {
		assert.equal(findBestWindowOrFolderForFile(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt')
		})), path.join(fixturesFolder, 'vscode_folder'));
		assert.equal(findBestWindowOrFolderForFile(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'new_folder', 'new_file.txt')
		})), path.join(fixturesFolder, 'vscode_folder'));
	});

	test('New window without folder when windows exist', () => {
		assert.equal(findBestWindowOrFolderForFile(options({
			windows,
			filePath: path.join(fixturesFolder, 'no_vscode_folder', 'file.txt'),
			newWindow: true
		})), null);
	});

	test('Last active window', () => {
		assert.equal(findBestWindowOrFolderForFile(options({
			windows
		})), lastActiveWindow);
		assert.equal(findBestWindowOrFolderForFile(options({
			windows,
			filePath: path.join(fixturesFolder, 'no_vscode_folder2', 'file.txt')
		})), lastActiveWindow);
		assert.equal(findBestWindowOrFolderForFile(options({
			windows: [lastActiveWindow, noVscodeFolderWindow],
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt'),
			reuseWindow: true
		})), lastActiveWindow);
		assert.equal(findBestWindowOrFolderForFile(options({
			windows,
			filePath: path.join(fixturesFolder, 'no_vscode_folder', 'file.txt'),
			context: OpenContext.API
		})), lastActiveWindow);
	});

	test('Existing window with folder', () => {
		assert.equal(findBestWindowOrFolderForFile(options({
			windows,
			filePath: path.join(fixturesFolder, 'no_vscode_folder', 'file.txt')
		})), noVscodeFolderWindow);
		assert.equal(findBestWindowOrFolderForFile(options({
			windows,
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt')
		})), vscodeFolderWindow);
	});

	test('Existing window wins over vscode folder if more specific', () => {
		const window = { lastFocusTime: 1, openedFolderPath: path.join(fixturesFolder, 'vscode_folder', 'nested_folder') };
		assert.equal(findBestWindowOrFolderForFile(options({
			windows: [window],
			filePath: path.join(fixturesFolder, 'vscode_folder', 'nested_folder', 'subfolder', 'file.txt')
		})), window);
		// check
		assert.equal(findBestWindowOrFolderForFile(options({
			windows: [window],
			filePath: path.join(fixturesFolder, 'vscode_folder', 'nested_folder2', 'subfolder', 'file.txt')
		})), path.join(fixturesFolder, 'vscode_folder'));
	});

	test('More specific existing window wins', () => {
		const window = { lastFocusTime: 2, openedFolderPath: path.join(fixturesFolder, 'no_vscode_folder') };
		const nestedFolderWindow = { lastFocusTime: 1, openedFolderPath: path.join(fixturesFolder, 'no_vscode_folder', 'nested_folder') };
		assert.equal(findBestWindowOrFolderForFile(options({
			windows: [window, nestedFolderWindow],
			filePath: path.join(fixturesFolder, 'no_vscode_folder', 'nested_folder', 'subfolder', 'file.txt')
		})), nestedFolderWindow);
	});

	test('VSCode folder wins over existing window if more specific', () => {
		const window = { lastFocusTime: 1, openedFolderPath: path.join(fixturesFolder, 'vscode_folder') };
		assert.equal(findBestWindowOrFolderForFile(options({
			windows: [window],
			filePath: path.join(fixturesFolder, 'vscode_folder', 'nested_vscode_folder', 'subfolder', 'file.txt')
		})), path.join(fixturesFolder, 'vscode_folder', 'nested_vscode_folder'));
		// check
		assert.equal(findBestWindowOrFolderForFile(options({
			windows: [window],
			filePath: path.join(fixturesFolder, 'vscode_folder', 'nested_folder', 'subfolder', 'file.txt')
		})), window);
	});

	test('More specific VSCode folder wins', () => {
		assert.equal(findBestWindowOrFolderForFile(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'nested_vscode_folder', 'subfolder', 'file.txt')
		})), path.join(fixturesFolder, 'vscode_folder', 'nested_vscode_folder'));
	});

	test('VSCode folder in home folder needs settings.json', () => {
		// Because ~/.vscode/extensions is used for extensions, ~/.vscode is not enough as a hint.
		assert.equal(findBestWindowOrFolderForFile(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt'),
			userHome: path.join(fixturesFolder, 'vscode_folder')
		})), null);
		assert.equal(findBestWindowOrFolderForFile(options({
			filePath: path.join(fixturesFolder, 'vscode_home_folder', 'file.txt'),
			userHome: path.join(fixturesFolder, 'vscode_home_folder')
		})), path.join(fixturesFolder, 'vscode_home_folder'));
	});

	test('Workspace folder wins', () => {
		const window = { lastFocusTime: 1, openedWorkspace: testWorkspace };
		assert.equal(findBestWindowOrFolderForFile(options({
			windows: [window],
			filePath: path.join(fixturesFolder, 'vscode_workspace_2_folder', 'nested_vscode_folder', 'subfolder', 'file.txt')
		})), window);
	});
});
