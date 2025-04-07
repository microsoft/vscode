/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, ProcessPromise, usePwsh } from 'zx';

const arch = process.env['VSCODE_ARCH'];
const esrpCliDLLPath = process.env['EsrpCliDllPath'];
const codeSigningFolderPath = process.env['CodeSigningFolderPath'];

function printBanner(title: string) {
	title = `${title} (${new Date().toISOString()})`;

	console.log('\n\n');
	console.log('#'.repeat(75));
	console.log(`# ${title.padEnd(71)} #`);
	console.log('#'.repeat(75));
	console.log('\n\n');
}

function sign(type: 'sign-windows' | 'sign-windows-appx', glob: string): ProcessPromise {
	return $`node build/azure-pipelines/common/sign ${esrpCliDLLPath} ${type} ${codeSigningFolderPath} '${glob}'`;
}

async function main() {
	usePwsh();

	// Start the code sign processes in parallel
	// 1. Codesign executables and shared libraries
	// 2. Codesign Powershell scripts
	// 3. Codesign context menu appx package (insiders only)
	const codesignTask1 = sign('sign-windows', '*.dll,*.exe,*.node');
	const codesignTask2 = sign('sign-windows-appx', '*.ps1');
	const codesignTask3 = process.env['VSCODE_QUALITY'] === 'insider'
		? sign('sign-windows-appx', '*.appx')
		: undefined;

	// Codesign executables and shared libraries
	printBanner('Codesign executables and shared libraries');
	await codesignTask1.pipe(process.stdout);

	// Codesign Powershell scripts
	printBanner('Codesign Powershell scripts');
	await codesignTask2.pipe(process.stdout);

	if (codesignTask3) {
		// Codesign context menu appx package
		printBanner('Codesign context menu appx package');
		await codesignTask3.pipe(process.stdout);
	}

	// Create build artifact directory
	await $`New-Item -ItemType Directory -Path .build/win32-${arch} -Force`;

	// Package client
	if (process.env['BUILT_CLIENT']) {
		// Product version
		const version = await $`node -p "require('../VSCode-win32-${arch}/resources/app/package.json').version"`;

		printBanner('Package client');
		const clientArchivePath = `.build/win32-${arch}/VSCode-win32-${arch}-${version}.zip`;
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

	// Sign setup
	if (process.env['BUILT_CLIENT']) {
		printBanner('Sign setup packages (system, user)');
		await $`npm exec -- npm-run-all -lp "gulp vscode-win32-${arch}-system-setup -- --sign" "gulp vscode-win32-${arch}-user-setup -- --sign"`.pipe(process.stdout);
	}
}

main();
