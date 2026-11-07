/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ConfigurationTarget, workspace } from 'vscode';
import { getRunScriptCommand } from '../tasks';

suite('npm tasks', () => {

	test('uses the configured Nub script runner independently of the package manager', async () => {
		const folder = workspace.workspaceFolders?.[0];
		if (!folder) {
			throw new Error('NPM extension tests require a workspace folder');
		}

		const npm = workspace.getConfiguration('npm', folder.uri);
		const previousScriptRunner = npm.inspect<string>('scriptRunner')?.workspaceFolderValue;
		const previousPackageManager = npm.inspect<string>('packageManager')?.workspaceFolderValue;
		const previousRunSilent = npm.inspect<boolean>('runSilent')?.workspaceFolderValue;

		try {
			await npm.update('packageManager', 'pnpm', ConfigurationTarget.WorkspaceFolder);
			await npm.update('scriptRunner', 'nub', ConfigurationTarget.WorkspaceFolder);
			await npm.update('runSilent', true, ConfigurationTarget.WorkspaceFolder);

			assert.deepStrictEqual(
				await getRunScriptCommand('build', folder.uri, undefined, false),
				['nub', 'run', '--silent', 'build']
			);
		} finally {
			await npm.update('packageManager', previousPackageManager, ConfigurationTarget.WorkspaceFolder);
			await npm.update('scriptRunner', previousScriptRunner, ConfigurationTarget.WorkspaceFolder);
			await npm.update('runSilent', previousRunSilent, ConfigurationTarget.WorkspaceFolder);
		}
	});
});
