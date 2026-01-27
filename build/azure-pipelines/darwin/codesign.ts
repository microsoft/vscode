/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { printBanner, spawnCodesignProcess, streamProcessOutputAndCheckResult } from '../common/codesign.ts';
import { e } from '../common/publish.ts';

async function main() {
	const arch = e('VSCODE_ARCH');
	const esrpCliDLLPath = e('EsrpCliDllPath');
	const pipelineWorkspace = e('PIPELINE_WORKSPACE');

	const folder = `${pipelineWorkspace}/vscode_client_darwin_${arch}_archive`;
	const dmgFolder = `${pipelineWorkspace}/vscode_client_darwin_${arch}_dmg`;
	const glob = `VSCode-darwin-${arch}.zip`;
	const dmgGlob = `VSCode-darwin-${arch}.dmg`;

	// Codesign
	const archiveCodeSignTask = spawnCodesignProcess(esrpCliDLLPath, 'sign-darwin', folder, glob);
	const dmgCodeSignTask = spawnCodesignProcess(esrpCliDLLPath, 'sign-darwin', dmgFolder, dmgGlob);
	printBanner('Codesign Archive');
	await streamProcessOutputAndCheckResult('Codesign Archive', archiveCodeSignTask);
	printBanner('Codesign DMG');
	await streamProcessOutputAndCheckResult('Codesign DMG', dmgCodeSignTask);

	// Notarize
	const archiveNotarizeTask = spawnCodesignProcess(esrpCliDLLPath, 'notarize-darwin', folder, glob);
	const dmgNotarizeTask = spawnCodesignProcess(esrpCliDLLPath, 'notarize-darwin', dmgFolder, dmgGlob);
	printBanner('Notarize Archive');
	await streamProcessOutputAndCheckResult('Notarize Archive', archiveNotarizeTask);
	printBanner('Notarize DMG');
	await streamProcessOutputAndCheckResult('Notarize DMG', dmgNotarizeTask);
}

main().then(() => {
	process.exit(0);
}, err => {
	console.error(`ERROR: ${err}`);
	process.exit(1);
});
