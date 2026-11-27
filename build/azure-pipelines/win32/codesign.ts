/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, usePwsh } from 'zx';
import { printBanner, spawnCodesignProcess, streamProcessOutputAndCheckResult } from '../common/codesign.ts';
import { e } from '../common/publish.ts';

async function main() {
	usePwsh();

	const arch = e('VSCODE_ARCH');
	// Builds without the privileged connections can't reach ESRP, so they package the builds unsigned
	const sign = !!process.env['VSCODE_SIGN'];

	if (sign) {
		const esrpCliDLLPath = e('EsrpCliDllPath');
		const codeSigningFolderPath = e('CodeSigningFolderPath');

		// Start the code sign processes in parallel
		// 1. Codesign executables and shared libraries
		// 2. Codesign Powershell scripts
		// 3. Codesign context menu appx package (insiders only)
		const codesignTask1 = spawnCodesignProcess(esrpCliDLLPath, 'sign-windows', codeSigningFolderPath, '*.dll,*.exe,*.node');
		const codesignTask2 = spawnCodesignProcess(esrpCliDLLPath, 'sign-windows-appx', codeSigningFolderPath, '*.ps1,*.psm1,*.psd1,*.ps1xml');
		const codesignTask3 = process.env['VSCODE_QUALITY'] !== 'exploration'
			? spawnCodesignProcess(esrpCliDLLPath, 'sign-windows-appx', codeSigningFolderPath, '*.appx')
			: undefined;

		// Codesign executables and shared libraries
		printBanner('Codesign executables and shared libraries');
		await streamProcessOutputAndCheckResult('Codesign executables and shared libraries', codesignTask1);

		// Codesign Powershell scripts
		printBanner('Codesign Powershell scripts');
		await streamProcessOutputAndCheckResult('Codesign Powershell scripts', codesignTask2);

		if (codesignTask3) {
			// Codesign context menu appx package
			printBanner('Codesign context menu appx package');
			await streamProcessOutputAndCheckResult('Codesign context menu appx package', codesignTask3);
		}
	}

	// Create build artifact directory
	await $`New-Item -ItemType Directory -Path .build/win32-${arch} -Force`;

	// Package client
	if (process.env['BUILT_CLIENT']) {
		printBanner('Package client');
		const clientArchivePath = `.build/win32-${arch}/VSCode-win32-${arch}.zip`;
		await $`7z.exe a -tzip ${clientArchivePath} ../VSCode-win32-${arch}/* "-xr!CodeSignSummary*.md"`.pipe(process.stdout);
		await $`7z.exe l ${clientArchivePath}`.pipe(process.stdout);
	}

	// Package server
	if (process.env['BUILT_SERVER']) {
		printBanner('Package server');
		const serverArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}.zip`;
		await $`7z.exe a -tzip ${serverArchivePath} ../vscode-server-win32-${arch}`.pipe(process.stdout);
		await $`7z.exe l ${serverArchivePath}`.pipe(process.stdout);
	}

	// Package server (web)
	if (process.env['BUILT_WEB']) {
		printBanner('Package server (web)');
		const webArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}-web.zip`;
		await $`7z.exe a -tzip ${webArchivePath} ../vscode-server-win32-${arch}-web`.pipe(process.stdout);
		await $`7z.exe l ${webArchivePath}`.pipe(process.stdout);
	}

	// Create the setup packages, which Inno Setup signs with --sign
	if (process.env['BUILT_CLIENT']) {
		const title = sign ? 'Sign setup packages (system, user)' : 'Create setup packages (system, user)';
		printBanner(title);
		const task = sign
			? $`npm exec -- npm-run-all2 -lp "gulp vscode-win32-${arch}-system-setup -- --sign" "gulp vscode-win32-${arch}-user-setup -- --sign"`
			: $`npm exec -- npm-run-all2 -lp "gulp vscode-win32-${arch}-system-setup" "gulp vscode-win32-${arch}-user-setup"`;
		await streamProcessOutputAndCheckResult(title, task);
	}
}

main().then(() => {
	process.exit(0);
}, err => {
	console.error(`ERROR: ${err}`);
	process.exit(1);
});
