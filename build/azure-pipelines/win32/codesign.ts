/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, ProcessPromise, usePwsh } from 'zx';

const arch = process.env['VSCODE_ARCH'];
const esrpCliDLLPath = process.env['EsrpCliDllPath'];
const codeSigningFolderPath = process.env['CodeSigningFolderPath'];

function printBanner(title: string) {
	console.log('#'.repeat(65));
	console.log(`# ${title.padEnd(61)} #`);
	console.log('#'.repeat(65));
}

function sign(type: 'sign-windows' | 'sign-windows-appx', glob: string): ProcessPromise {
	return $`node build/azure-pipelines/common/sign ${esrpCliDLLPath} ${type} ${codeSigningFolderPath} '${glob}'`;
}

async function main() {
	usePwsh();

	await $`New-Item -ItemType Directory -Path .build/win32-${arch} -Force`;

	// Codesign executables and shared libraries
	printBanner('Codesign executables and shared libraries');
	await sign('sign-windows', '*.dll,*.exe,*.node').pipe(process.stdout);

	// Codesign Powershell scripts
	printBanner('Codesign Powershell scripts');
	await sign('sign-windows-appx', '*.ps1').pipe(process.stdout);

	// Codesign context menu appx package
	if (process.env['VSCODE_QUALITY'] === 'insider') {
		printBanner('Codesign context menu appx package');
		await sign('sign-windows-appx', '*.appx').pipe(process.stdout);
	}

	// Package client
	if (process.env['BUILT_CLIENT']) {
		// Product version
		const packageJson = await $`Get-Content -Raw -Path ../VSCode-win32-${arch}/resources/app/package.json | ConvertFrom-Json`;
		const version = (packageJson as any).version;

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
