/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, usePwsh } from 'zx';

async function main() {
	usePwsh();

	const agentRootDirectoryPath = process.env['AGENT_ROOTDIRECTORY'];
	const codesigningFolderPath = process.env['CodeSigningFolderPath'];

	// Find ESRP CLI
	const tasksFolderPath = await $`(gci -directory -filter EsrpCodeSigning_* ${agentRootDirectoryPath}/_tasks | Select-Object -last 1).FullName`;
	const esrpCliPath = await $`(gci -directory ${tasksFolderPath} | Select-Object -last 1).FullName`;
	const esrpCliDLLPath = `${esrpCliPath}/net6.0/esrpcli.dll`;

	// Codesign executables and shared libraries
	await $`node build/azure-pipelines/common/sign ${esrpCliDLLPath} sign-windows ${codesigningFolderPath} '*.dll,*.exe,*.node'`.pipe(process.stdout);

	// Codesign Powershell scripts
	await $`node build/azure-pipelines/common/sign ${esrpCliDLLPath} sign-windows-powershell-scripts ${codesigningFolderPath} '*.ps1'`.pipe(process.stdout);

	// Codesign context menu appx package
	if (process.env['VSCODE_QUALITY'] !== 'oss') {
		await $`node build/azure-pipelines/common/sign ${esrpCliDLLPath} sign-windows-appx ${codesigningFolderPath} '*.appx'`.pipe(process.stdout);
	}
}

main();
