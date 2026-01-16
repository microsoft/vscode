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
	const clientGlob = `VSCode-darwin-${arch}.zip`;

	const serverFolder = `${buildSourcesDirectory}/.build/darwin/server`;
	const serverGlob = `vscode-server-darwin-${arch}.zip`;
	const webGlob = `vscode-server-darwin-${arch}-web.zip`;

	// Codesign client
	printBanner('Codesign client');
	const codeSignClientTask = spawnCodesignProcess(esrpCliDLLPath, 'sign-darwin', clientFolder, clientGlob);
	await streamProcessOutputAndCheckResult('Codesign client', codeSignClientTask);

	// Codesign server
	printBanner('Codesign server');
	const codeSignServerTask = spawnCodesignProcess(esrpCliDLLPath, 'sign-darwin', serverFolder, serverGlob);
	await streamProcessOutputAndCheckResult('Codesign server', codeSignServerTask);

	// Codesign web
	printBanner('Codesign web');
	const codeSignWebTask = spawnCodesignProcess(esrpCliDLLPath, 'sign-darwin', serverFolder, webGlob);
	await streamProcessOutputAndCheckResult('Codesign web', codeSignWebTask);

	// Notarize client
	printBanner('Notarize client');
	const notarizeClientTask = spawnCodesignProcess(esrpCliDLLPath, 'notarize-darwin', clientFolder, clientGlob);
	await streamProcessOutputAndCheckResult('Notarize client', notarizeClientTask);

	// Notarize server
	printBanner('Notarize server');
	const notarizeServerTask = spawnCodesignProcess(esrpCliDLLPath, 'notarize-darwin', serverFolder, serverGlob);
	await streamProcessOutputAndCheckResult('Notarize server', notarizeServerTask);

	// Notarize web
	printBanner('Notarize web');
	const notarizeWebTask = spawnCodesignProcess(esrpCliDLLPath, 'notarize-darwin', serverFolder, webGlob);
	await streamProcessOutputAndCheckResult('Notarize web', notarizeWebTask);
}

main().then(() => {
	process.exit(0);
}, err => {
	console.error(`ERROR: ${err}`);
	process.exit(1);
});
