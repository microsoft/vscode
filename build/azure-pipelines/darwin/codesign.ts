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
	const buildSourcesDirectory = e('BUILD_SOURCESDIRECTORY');

	const clientFolder = `${pipelineWorkspace}/vscode_client_darwin_${arch}_archive`;
	const dmgFolder = `${pipelineWorkspace}/vscode_client_darwin_${arch}_dmg`;
	const clientGlob = `VSCode-darwin-${arch}.zip`;
	const dmgGlob = `VSCode-darwin-${arch}.dmg`;

	const serverFolder = `${buildSourcesDirectory}/.build/darwin/server`;
	const serverGlob = `vscode-server-darwin-${arch}.zip`;
	const webGlob = `vscode-server-darwin-${arch}-web.zip`;
	let codeSignServerTask, codeSignWebTask, notarizeServerTask, notarizeWebTask;

	// Start codesign processes in parallel
	const codeSignClientTask = spawnCodesignProcess(esrpCliDLLPath, 'sign-darwin', clientFolder, clientGlob);
	const codeSignDmgTask = spawnCodesignProcess(esrpCliDLLPath, 'sign-darwin', dmgFolder, dmgGlob);
	if (arch !== 'universal') {
		codeSignServerTask = spawnCodesignProcess(esrpCliDLLPath, 'sign-darwin', serverFolder, serverGlob);
		codeSignWebTask = spawnCodesignProcess(esrpCliDLLPath, 'sign-darwin', serverFolder, webGlob);
	}

	// Await codesign results
	printBanner('Codesign client');
	await streamProcessOutputAndCheckResult('Codesign client', codeSignClientTask);

	printBanner('Codesign DMG');
	await streamProcessOutputAndCheckResult('Codesign DMG', codeSignDmgTask);

	if (codeSignServerTask) {
		printBanner('Codesign server');
		await streamProcessOutputAndCheckResult('Codesign server', codeSignServerTask);
	}

	if (codeSignWebTask) {
		printBanner('Codesign web');
		await streamProcessOutputAndCheckResult('Codesign web', codeSignWebTask);
	}

	// Start notarize processes in parallel (after codesigning is complete)
	const notarizeClientTask = spawnCodesignProcess(esrpCliDLLPath, 'notarize-darwin', clientFolder, clientGlob);
	const notarizeDmgTask = spawnCodesignProcess(esrpCliDLLPath, 'notarize-darwin', dmgFolder, dmgGlob);
	if (arch !== 'universal') {
		notarizeServerTask = spawnCodesignProcess(esrpCliDLLPath, 'notarize-darwin', serverFolder, serverGlob);
		notarizeWebTask = spawnCodesignProcess(esrpCliDLLPath, 'notarize-darwin', serverFolder, webGlob);
	}

	// Await notarize results
	printBanner('Notarize client');
	await streamProcessOutputAndCheckResult('Notarize client', notarizeClientTask);

	printBanner('Notarize DMG');
	await streamProcessOutputAndCheckResult('Notarize DMG', notarizeDmgTask);

	if (notarizeServerTask) {
		printBanner('Notarize server');
		await streamProcessOutputAndCheckResult('Notarize server', notarizeServerTask);
	}

	if (notarizeWebTask) {
		printBanner('Notarize web');
		await streamProcessOutputAndCheckResult('Notarize web', notarizeWebTask);
	}
}

main().then(() => {
	process.exit(0);
}, err => {
	console.error(`ERROR: ${err}`);
	process.exit(1);
});
