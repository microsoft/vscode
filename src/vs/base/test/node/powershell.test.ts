/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as platform from 'vs/base/common/platform';
import * as powershell from 'vs/base/node/powershell';
import * as fs from 'fs';

function checkPath(exePath: string) {
	// Check to see if the path exists
	let pathCheckResult = false;
	try {
		const stat = fs.statSync(exePath);
		pathCheckResult = stat.isFile() || stat.isSymbolicLink();
	} catch {
		// fs.exists throws on Windows with SymbolicLinks so we
		// also use lstat to try and see if the file exists.
		pathCheckResult = fs.lstatSync(exePath).isSymbolicLink();
	}

	assert.strictEqual(pathCheckResult, true);
}

if (platform.isWindows) {
	suite('PowerShell finder', () => {

		test('Can find first available PowerShell', () => {
			const pwshExe = powershell.getFirstAvailablePowerShellInstallation();
			const exePath = pwshExe?.exePath;
			assert.notStrictEqual(exePath, null);
			assert.notStrictEqual(pwshExe?.displayName, null);

			checkPath(exePath!);
		});

		// In Azure DevOps or GitHub Actions, they have 3 PowerShell's available
		// on Windows:
		// 1. PowerShell stable
		// 2. Windows PowerShell (x64)
		// 3. Windows PowerShell (x86)
		// Only run this test in CI where the result is predictable.
		if (process.env.TF_BUILD || process.env.CI) {
			test('Can enumerate PowerShells', () => {
				const pwshs = Array.from(powershell.enumeratePowerShellInstallations());
				assert.strictEqual(pwshs.length, 3);

				checkPath(pwshs[0].exePath);
				assert.strictEqual(pwshs[0].displayName, 'PowerShell (x64)');

				checkPath(pwshs[1].exePath);
				assert.strictEqual(pwshs[1].displayName, 'Windows PowerShell (x64)');

				checkPath(pwshs[2].exePath);
				assert.strictEqual(pwshs[2].displayName, 'Windows PowerShell (x86)');
			});
		}
	});
}
