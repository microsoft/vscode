/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { win32 } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { IProductService } from '../../../product/common/productService.js';
import { getWindowsAppDetails } from '../../electron-main/windowsAppDetails.js';

suite('Windows application details', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const executablePath = 'C:\\Program Files\\Microsoft VS Code\\Code.exe';
	const product = upcastPartial<IProductService>({
		nameLong: 'Visual Studio Code',
		win32AppUserModelId: 'Microsoft.VisualStudioCode',
	});

	function environment(options: Partial<IEnvironmentMainService> = {}): IEnvironmentMainService {
		return upcastPartial<IEnvironmentMainService>({
			isBuilt: true,
			isPortable: false,
			appRoot: 'C:\\Program Files\\Microsoft VS Code\\1234567890\\resources\\app',
			args: { _: [] },
			...options,
		});
	}

	test('Agents has its own identity and a version-independent relaunch icon', () => {
		assert.deepStrictEqual(getWindowsAppDetails(product, environment(), true, executablePath), {
			appId: 'Microsoft.VisualStudioCode.Agents',
			appIconPath: win32.join('C:\\Program Files\\Microsoft VS Code', 'agents.ico'),
			appIconIndex: 0,
			relaunchCommand: `"${executablePath}" "--agents"`,
			relaunchDisplayName: 'Visual Studio Code Agents',
		});
	});

	test('an editor retains its identity even when the process started in Agents mode', () => {
		assert.deepStrictEqual(getWindowsAppDetails(product, environment({ args: { _: [], agents: true } }), false, executablePath), {
			appId: 'Microsoft.VisualStudioCode',
			appIconPath: executablePath,
			appIconIndex: 0,
			relaunchCommand: `"${executablePath}"`,
			relaunchDisplayName: 'Visual Studio Code',
		});
	});

	test('channel and portable identities do not collide with installed Stable', () => {
		const insiders = upcastPartial<IProductService>({
			nameLong: 'Visual Studio Code - Insiders',
			win32AppUserModelId: 'Microsoft.VisualStudioCode.Insiders',
		});
		assert.deepStrictEqual([
			getWindowsAppDetails(insiders, environment(), true, executablePath)?.appId,
			getWindowsAppDetails(product, environment({ isPortable: true }), true, executablePath)?.appId,
			getWindowsAppDetails(product, environment({ isPortable: true }), false, executablePath)?.appId,
			getWindowsAppDetails(insiders, environment(), true, executablePath)?.relaunchDisplayName,
		], [
			'Microsoft.VisualStudioCode.Insiders.Agents',
			'Microsoft.VisualStudioCode.Portable.Agents',
			'Microsoft.VisualStudioCode.Portable',
			'Visual Studio Code - Insiders Agents',
		]);
	});

	test('relaunch preserves explicit data and extension locations, but not a workspace or one-shot launch flags', () => {
		assert.deepStrictEqual(getWindowsAppDetails(product, environment({
			userDataPath: 'C:\\Code Data\\',
			extensionsPath: 'D:\\Code Extensions',
			appSharedDataHome: URI.file('C:\\Shared Code Data'),
			args: { _: ['C:\\project'], 'user-data-dir': 'data', 'extensions-dir': 'extensions', 'shared-data-dir': 'shared', 'new-window': true, 'open-url': true },
		}), true, executablePath)?.relaunchCommand, `"${executablePath}" "--agents" "--user-data-dir" "C:\\Code Data\\\\" "--extensions-dir" "D:\\Code Extensions" "--shared-data-dir" "${URI.file('C:\\Shared Code Data').fsPath}"`);
	});

	test('development windows relaunch the checkout instead of an empty Electron application', () => {
		const appRoot = 'C:\\source\\Code OSS';
		assert.deepStrictEqual(getWindowsAppDetails(product, environment({ isBuilt: false, appRoot }), true, executablePath), {
			appId: 'Microsoft.VisualStudioCode.Agents',
			appIconPath: win32.join(appRoot, 'resources', 'win32', 'sessions.ico'),
			appIconIndex: 0,
			relaunchCommand: `"${executablePath}" "${appRoot}" "--agents"`,
			relaunchDisplayName: 'Visual Studio Code Agents',
		});
	});

	test('products without a Windows application ID do not acquire one', () => {
		assert.strictEqual(getWindowsAppDetails(upcastPartial<IProductService>({ nameLong: 'Code OSS' }), environment(), true, executablePath), undefined);
	});
});
