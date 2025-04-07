/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, usePwsh } from 'zx';
import { CodeSignTask, printTitle, sign } from '../common/codesign.js';

async function main() {
	usePwsh();

	const arch = process.env['VSCODE_ARCH'];
	const esrpCliDLLPath = process.env['EsrpCliDllPath'];
	const codeSigningFolderPath = process.env['CodeSigningFolderPath'];

	const codesignTasks: CodeSignTask[] = [
		{
			title: 'Codesign executables and shared libraries',
			processPromise: sign(esrpCliDLLPath!, 'sign-windows', codeSigningFolderPath!, '*.dll,*.exe,*.node')
		},
		{
			title: 'Codesign Powershell scripts',
			processPromise: sign(esrpCliDLLPath!, 'sign-windows-appx', codeSigningFolderPath!, '*.ps1')
		}
	] satisfies CodeSignTask[];

	if (process.env['VSCODE_QUALITY'] === 'insider') {
		codesignTasks.push({
			title: 'Codesign context menu appx package',
			processPromise: sign(esrpCliDLLPath!, 'sign-windows-appx', codeSigningFolderPath!, '*.appx')
		} satisfies CodeSignTask);
	}

	// Wait for processes to finish and stream their output
	for (const { title, processPromise } of codesignTasks) {
		printTitle(title);
		await processPromise.pipe(process.stdout);
	}

	await $`New-Item -ItemType Directory -Path .build/win32-${arch} -Force`;

	// Package client
	if (process.env['BUILT_CLIENT']) {
		// Product version
		const packageJson = await $`Get-Content -Raw -Path ../VSCode-win32-${arch}/resources/app/package.json | ConvertFrom-Json`;
		const version = (packageJson as any).version;

		printTitle('Package client');
		const clientArchivePath = `.build/win32-${arch}/VSCode-win32-${arch}-${version}.zip`;
		await $`7z.exe a -tzip ${clientArchivePath} ../VSCode-win32-${arch}/* "-xr!CodeSignSummary*.md"`.pipe(process.stdout);
		await $`7z.exe l ${clientArchivePath}`.pipe(process.stdout);
	}

	// Package server
	if (process.env['BUILT_SERVER']) {
		printTitle('Package server');
		const serverArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}.zip`;
		await $`7z.exe a -tzip ${serverArchivePath} ../vscode-server-win32-${arch}`.pipe(process.stdout);
		await $`7z.exe l ${serverArchivePath}`.pipe(process.stdout);
	}

	// Package server (web)
	if (process.env['BUILT_WEB']) {
		printTitle('Package server (web)');
		const webArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}-web.zip`;
		await $`7z.exe a -tzip ${webArchivePath} ../vscode-server-win32-${arch}-web`.pipe(process.stdout);
		await $`7z.exe l ${webArchivePath}`.pipe(process.stdout);
	}

	// Sign setup
	if (process.env['BUILT_CLIENT']) {
		printTitle('Sign setup packages (system, user)');
		await $`npm exec -- npm-run-all -lp "gulp vscode-win32-${arch}-system-setup -- --sign" "gulp vscode-win32-${arch}-user-setup -- --sign"`.pipe(process.stdout);
	}
}

main();
