/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as platform from 'vs/base/common/platform';
import { enumeratePowerShellInstallations, getFirstAvailablePowerShellInstallation, IPowerShellExeDetails } from 'vs/base/node/powershell';

function checkPath(exePath: string) {
	// Check to see if the path exists
	let pathCheckResult = false;
	try {
		const stat = fs.statSync(exePath);
		pathCheckResult = stat.isFile();
	} catch {
		// fs.exists throws on Windows with SymbolicLinks so we
		// also use lstat to try and see if the file exists.
		try {
			pathCheckResult = fs.statSync(fs.readlinkSync(exePath)).isFile();
		} catch {

		}
	}

	assert.strictEqual(pathCheckResult, true);
}

if (platform.isWindows) {
	suite('PowerShell finder', () => {

		test('Can find first available PowerShell', async () => {
			const pwshExe = await getFirstAvailablePowerShellInstallation();
			const exePath = pwshExe?.exePath;
			assert.notStrictEqual(exePath, null);
			assert.notStrictEqual(pwshExe?.displayName, null);

			checkPath(exePath!);
		});

		test('Can enumerate PowerShells', async () => {
			const pwshs = new Array<IPowerShellExeDetails>();
			for await (const p of enumeratePowerShellInstallations()) {
				pwshs.push(p);
			}

			// In Azure DevOps and GitHub Actions there should be an extra PowerShell since PowerShell 7 comes pre-installed
			const minNumberOfPowerShells = process.env.TF_BUILD || process.env.CI ? 3 : 2;

			assert.strictEqual(pwshs.length >= minNumberOfPowerShells, true, 'Found these PowerShells:\n' + pwshs.map(p => `${p.displayName}: ${p.exePath}`).join('\n'));

			for (const pwsh of pwshs) {
				checkPath(pwsh.exePath);
			}


			const lastIndex = pwshs.length - 1;
			const secondToLastIndex = pwshs.length - 2;

			// 64bit process on 64bit OS
			if (process.arch === 'x64') {
				checkPath(pwshs[secondToLastIndex].exePath);
				assert.strictEqual(pwshs[secondToLastIndex].displayName, 'Windows PowerShell');

				checkPath(pwshs[lastIndex].exePath);
				assert.strictEqual(pwshs[lastIndex].displayName, 'Windows PowerShell (x86)');
			} else if (os.arch() === 'x64') {
				// 32bit process on 64bit OS

				// Windows PowerShell x86 comes first if vscode is 32bit
				checkPath(pwshs[secondToLastIndex].exePath);
				assert.strictEqual(pwshs[secondToLastIndex].displayName, 'Windows PowerShell (x86)');

				checkPath(pwshs[lastIndex].exePath);
				assert.strictEqual(pwshs[lastIndex].displayName, 'Windows PowerShell');
			} else {
				// 32bit or ARM process
				checkPath(pwshs[lastIndex].exePath);
				assert.strictEqual(pwshs[lastIndex].displayName, 'Windows PowerShell (x86)');
			}
		});
	});
}
