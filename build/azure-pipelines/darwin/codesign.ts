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
	const glob = `VSCode-darwin-${arch}.zip`;

	// Codesign
	printBanner('Codesign');
	const codeSignTask = spawnCodesignProcess(esrpCliDLLPath, 'sign-darwin', folder, glob);
	await streamProcessOutputAndCheckResult('Codesign', codeSignTask);

	// Notarize
	printBanner('Notarize');
	const notarizeTask = spawnCodesignProcess(esrpCliDLLPath, 'notarize-darwin', folder, glob);
	await streamProcessOutputAndCheckResult('Notarize', notarizeTask);
}

main().then(() => {
	process.exit(0);
}, err => {
	console.error(`ERROR: ${err}`);
	process.exit(1);
});
