/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import path = require('path');
import { findBestWindowOrFolder, ISimpleWindow, IBestWindowOrFolderOptions } from 'vs/code/node/windowsUtils';
import { OpenContext } from 'vs/code/common/windows';

const fixturesFolder = require.toUrl('./fixtures');

function options(custom?: Partial<IBestWindowOrFolderOptions<ISimpleWindow>>): IBestWindowOrFolderOptions<ISimpleWindow> {
	return {
		windows: [],
		newWindow: false,
		reuseWindow: false,
		context: OpenContext.CLI,
		vscodeFolder: '_vscode',
		...custom
	};
}

const vscodeFolderWindow = { lastFocusTime: 1, openedWorkspacePath: path.join(fixturesFolder, 'vscode_folder') };
const lastActiveWindow = { lastFocusTime: 3, openedWorkspacePath: null };
const noVscodeFolderWindow = { lastFocusTime: 2, openedWorkspacePath: path.join(fixturesFolder, 'no_vscode_folder') };
const windows = [
	vscodeFolderWindow,
	lastActiveWindow,
	noVscodeFolderWindow,
];

suite('WindowsUtils', () => {

	test('New window without folder when no windows exist', () => {
		assert.equal(findBestWindowOrFolder(options()), null);
		assert.equal(findBestWindowOrFolder(options({
			filePath: path.join(fixturesFolder, 'no_vscode_folder', 'file.txt')
		})), null);
		assert.equal(findBestWindowOrFolder(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt'),
			newWindow: true // We assume this implies 'editor' work mode, might need separate CLI option later.
		})), null);
		assert.equal(findBestWindowOrFolder(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt'),
			reuseWindow: true // We assume this implies 'editor' work mode, might need separate CLI option later.
		})), null);
		assert.equal(findBestWindowOrFolder(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt'),
			context: OpenContext.API
		})), null);
	});

	test('New window with folder when no windows exist', () => {
		assert.equal(findBestWindowOrFolder(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt')
		})), path.join(fixturesFolder, 'vscode_folder'));
		assert.equal(findBestWindowOrFolder(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'new_folder', 'new_file.txt')
		})), path.join(fixturesFolder, 'vscode_folder'));
	});

	test('New window without folder when windows exist', () => {
		assert.equal(findBestWindowOrFolder(options({
			windows,
			filePath: path.join(fixturesFolder, 'no_vscode_folder', 'file.txt'),
			newWindow: true
		})), null);
	});

	test('Last active window', () => {
		assert.equal(findBestWindowOrFolder(options({
			windows
		})), lastActiveWindow);
		assert.equal(findBestWindowOrFolder(options({
			windows,
			filePath: path.join(fixturesFolder, 'no_vscode_folder2', 'file.txt')
		})), lastActiveWindow);
		assert.equal(findBestWindowOrFolder(options({
			windows: [lastActiveWindow, noVscodeFolderWindow],
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt'),
			reuseWindow: true
		})), lastActiveWindow);
		assert.equal(findBestWindowOrFolder(options({
			windows,
			filePath: path.join(fixturesFolder, 'no_vscode_folder', 'file.txt'),
			context: OpenContext.API
		})), lastActiveWindow);
	});

	test('Existing window with folder', () => {
		assert.equal(findBestWindowOrFolder(options({
			windows,
			filePath: path.join(fixturesFolder, 'no_vscode_folder', 'file.txt')
		})), noVscodeFolderWindow);
		assert.equal(findBestWindowOrFolder(options({
			windows,
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt')
		})), vscodeFolderWindow);
	});

	test('Existing window wins over vscode folder if more specific', () => {
		const window = { lastFocusTime: 1, openedWorkspacePath: path.join(fixturesFolder, 'vscode_folder', 'nested_folder') };
		assert.equal(findBestWindowOrFolder(options({
			windows: [window],
			filePath: path.join(fixturesFolder, 'vscode_folder', 'nested_folder', 'subfolder', 'file.txt')
		})), window);
		// check
		assert.equal(findBestWindowOrFolder(options({
			windows: [window],
			filePath: path.join(fixturesFolder, 'vscode_folder', 'nested_folder2', 'subfolder', 'file.txt')
		})), path.join(fixturesFolder, 'vscode_folder'));
	});

	test('More specific existing window wins', () => {
		const window = { lastFocusTime: 2, openedWorkspacePath: path.join(fixturesFolder, 'no_vscode_folder') };
		const nestedFolderWindow = { lastFocusTime: 1, openedWorkspacePath: path.join(fixturesFolder, 'no_vscode_folder', 'nested_folder') };
		assert.equal(findBestWindowOrFolder(options({
			windows: [window, nestedFolderWindow],
			filePath: path.join(fixturesFolder, 'no_vscode_folder', 'nested_folder', 'subfolder', 'file.txt')
		})), nestedFolderWindow);
	});

	test('VSCode folder wins over existing window if more specific', () => {
		const window = { lastFocusTime: 1, openedWorkspacePath: path.join(fixturesFolder, 'vscode_folder') };
		assert.equal(findBestWindowOrFolder(options({
			windows: [window],
			filePath: path.join(fixturesFolder, 'vscode_folder', 'nested_vscode_folder', 'subfolder', 'file.txt')
		})), path.join(fixturesFolder, 'vscode_folder', 'nested_vscode_folder'));
		// check
		assert.equal(findBestWindowOrFolder(options({
			windows: [window],
			filePath: path.join(fixturesFolder, 'vscode_folder', 'nested_folder', 'subfolder', 'file.txt')
		})), window);
	});

	test('More specific VSCode folder wins', () => {
		assert.equal(findBestWindowOrFolder(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'nested_vscode_folder', 'subfolder', 'file.txt')
		})), path.join(fixturesFolder, 'vscode_folder', 'nested_vscode_folder'));
	});

	test('VSCode folder in home folder needs settings.json', () => {
		// Because ~/.vscode/extensions is used for extensions, ~/.vscode is not enough as a hint.
		assert.equal(findBestWindowOrFolder(options({
			filePath: path.join(fixturesFolder, 'vscode_folder', 'file.txt'),
			userHome: path.join(fixturesFolder, 'vscode_folder')
		})), null);
		assert.equal(findBestWindowOrFolder(options({
			filePath: path.join(fixturesFolder, 'vscode_home_folder', 'file.txt'),
			userHome: path.join(fixturesFolder, 'vscode_home_folder')
		})), path.join(fixturesFolder, 'vscode_home_folder'));
	});
});
