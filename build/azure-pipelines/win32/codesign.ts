/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, usePwsh } from 'zx';

async function main() {
	usePwsh();

	console.log(`
###################################################################
#                                                                 #
#                         CODE SIGNING                            #
#                                                                 #
###################################################################
`);

	const arch = process.env['VSCODE_ARCH'];
	const esrpCliDLLPath = process.env['EsrpCliDllPath'];
	const codesigningFolderPath = process.env['CodeSigningFolderPath'];

	console.log(`
###################################################################
#                                                                 #
#          Codesign executables and shared libraries              #
#                                                                 #
###################################################################
`);
	await $`node build/azure-pipelines/common/sign ${esrpCliDLLPath} sign-windows ${codesigningFolderPath} '*.dll,*.exe,*.node'`.pipe(process.stdout);

	console.log(`
###################################################################
#                                                                 #
#                 Codesign Powershell scripts                     #
#                                                                 #
###################################################################
`);
	await $`node build/azure-pipelines/common/sign ${esrpCliDLLPath} sign-windows-appx ${codesigningFolderPath} '*.ps1'`.pipe(process.stdout);

	if (process.env['VSCODE_QUALITY'] === 'insider') {
		console.log(`
###################################################################
#                                                                 #
#              Codesign context menu appx package                 #
#                                                                 #
###################################################################
`);
		await $`node build/azure-pipelines/common/sign ${esrpCliDLLPath} sign-windows-appx ${codesigningFolderPath} '*.appx'`.pipe(process.stdout);
	}

	const packageJson = await $`Get-Content -Raw -Path ../VSCode-win32-${arch}/resources/app/package.json | ConvertFrom-Json`;
	const version = packageJson.version;

	// Client
	console.log(`
###################################################################
#                                                                 #
#                       Package client                            #
#                                                                 #
###################################################################
`);
	const clientArchivePath = `.build/win32-${arch}/VSCode-win32-${arch}-${version}.zip`;

	await $`New-Item -ItemType Directory -Path .build/win32-${arch} -Force`;
	await $`7z.exe a -tzip ${clientArchivePath} ..\VSCode-win32-${arch}\* "-xr!CodeSignSummary*.md"`.pipe(process.stdout);
	await $`7z.exe l ${clientArchivePath}`.pipe(process.stdout);

	// Server
	console.log(`
###################################################################
#                                                                 #
#                       Package server                            #
#                                                                 #
###################################################################
`);

	const serverArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}.zip`;
	await $`New-Item -ItemType Directory -Path .build/win32-${arch} -Force`;
	await $`7z.exe a -tzip ${serverArchivePath} ..\vscode-server-win32-${arch}`.pipe(process.stdout);
	await $`7z.exe l ${serverArchivePath}`.pipe(process.stdout);

	// Web
	console.log(`
###################################################################
#                                                                 #
#                     Package server (web)                        #
#                                                                 #
###################################################################
`);

	const webArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}-web.zip`;
	await $`New-Item -ItemType Directory -Path .build/win32-${arch} -Force`;
	await $`7z.exe a -tzip ${webArchivePath} ..\vscode-server-win32-${arch}-web`.pipe(process.stdout);
	await $`7z.exe l ${webArchivePath}`.pipe(process.stdout);

	// Sign setup
	console.log(`
###################################################################
#                                                                 #
#             Codesign setup packages (system, user)              #
#                                                                 #
###################################################################
`);
	await $`npm exec -- npm-run-all -lp "gulp vscode-win32-${arch}-system-setup -- --sign" "gulp vscode-win32-${arch}-user-setup -- --sign"`.pipe(process.stdout);
}

main();
