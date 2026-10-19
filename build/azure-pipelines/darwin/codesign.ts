/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { printBanner, spawnCodesignProcess, streamProcessOutputAndCheckResult } from '../common/codesign.ts';
import { e } from '../common/publish.ts';

async function codesignAndNotarize(esrpCliDLLPath: string, name: string, folder: string, glob: string): Promise<void> {
	printBanner(`Codesign ${name}`);
	await streamProcessOutputAndCheckResult(`Codesign ${name}`, spawnCodesignProcess(esrpCliDLLPath, 'sign-darwin', folder, glob));

	printBanner(`Notarize ${name}`);
	await streamProcessOutputAndCheckResult(`Notarize ${name}`, spawnCodesignProcess(esrpCliDLLPath, 'notarize-darwin', folder, glob));
}

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

	const tasks = [
		codesignAndNotarize(esrpCliDLLPath, 'client', clientFolder, clientGlob),
		codesignAndNotarize(esrpCliDLLPath, 'DMG', dmgFolder, dmgGlob),
	];
	if (arch !== 'universal') {
		tasks.push(
			codesignAndNotarize(esrpCliDLLPath, 'server', serverFolder, serverGlob),
			codesignAndNotarize(esrpCliDLLPath, 'web', serverFolder, webGlob),
		);
	}

	await Promise.all(tasks);
}

main().then(() => {
	process.exit(0);
}, err => {
	console.error(`ERROR: ${err}`);
	process.exit(1);
});
