/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as fs from 'fs';
import * as platform from 'vs/base/common/platform';
import { enumeratePowerShellInstallations, getFirstAvailablePowerShellInstallation, IPowerShellExeDetails } from 'vs/base/node/powershell';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

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
		ensureNoDisposablesAreLeakedInTestSuite();
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

			const powershellLog = 'Found these PowerShells:\n' + pwshs.map(p => `${p.displayName}: ${p.exePath}`).join('\n');
			assert.strictEqual(pwshs.length >= 1, true, powershellLog);

			for (const pwsh of pwshs) {
				checkPath(pwsh.exePath);
			}

			// The last one should always be Windows PowerShell.
			assert.strictEqual(pwshs[pwshs.length - 1].displayName, 'Windows PowerShell', powershellLog);
		});
	});
}
