/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { printBanner, spawnCodesignProcess, streamProcessOutputAndCheckResult } from '../common/codesign.ts';
import { e } from '../common/publish.ts';

const NOTARIZE_ATTEMPTS = 2;
const NOTARIZE_RETRY_DELAY_MS = 3 * 60 * 1000;

/**
 * ESRP intermittently fails a notarization with `MacSignFailed`, while
 * notarizing the same file again a few minutes later succeeds. Notarization
 * submits the already signed file to Apple, so it is safe to repeat, and a file
 * that is not properly signed fails again. Any other failure is final.
 */
async function notarize(esrpCliDLLPath: string, name: string, folder: string, glob: string): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		printBanner(attempt === 1 ? `Notarize ${name}` : `Notarize ${name} (attempt ${attempt})`);

		const notarization = spawnCodesignProcess(esrpCliDLLPath, 'notarize-darwin', folder, glob).nothrow();
		notarization.pipe(process.stdout);
		const result = await notarization;

		if (result.ok) {
			console.log(`\nNotarize ${name} completed successfully. Duration: ${result.duration} ms`);
			return;
		}

		// stdout is streamed above; stderr is only captured, so check and surface both
		if (attempt >= NOTARIZE_ATTEMPTS || !/"code"\s*:\s*"MacSignFailed"/.test(`${result.stdout}\n${result.stderr}`)) {
			throw new Error(`Notarize ${name} failed: ${result.stderr}`);
		}

		console.log(`\nNotarize ${name} failed with MacSignFailed: ${result.stderr}`);
		console.log(`Retrying in ${NOTARIZE_RETRY_DELAY_MS / 1000} seconds...`);
		await new Promise(c => setTimeout(c, NOTARIZE_RETRY_DELAY_MS));
	}
}

async function codesignAndNotarize(esrpCliDLLPath: string, name: string, folder: string, glob: string): Promise<void> {
	printBanner(`Codesign ${name}`);
	await streamProcessOutputAndCheckResult(`Codesign ${name}`, spawnCodesignProcess(esrpCliDLLPath, 'sign-darwin', folder, glob));

	await notarize(esrpCliDLLPath, name, folder, glob);
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
