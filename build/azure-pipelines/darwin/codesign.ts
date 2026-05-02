/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { $ } from 'zx';
import { printBanner, spawnCodesignProcess, streamProcessOutputAndCheckResult } from '../common/codesign.ts';
import { e } from '../common/publish.ts';

/**
 * Staple the notarization ticket into the artifact so that Gatekeeper
 * can verify it offline on first launch. Without a stapled ticket, macOS
 * has to perform an online lookup against Apple's notarization service
 * which can intermittently fail and surface to users as
 * "<App> is damaged and can't be opened" — see #313109.
 */
async function stapleZippedApp(folder: string, glob: string): Promise<void> {
	const zipPath = path.join(folder, glob);
	if (!fs.existsSync(zipPath)) {
		throw new Error(`Cannot staple: archive not found at ${zipPath}`);
	}

	const stagingDir = path.join(folder, '.staple');
	fs.rmSync(stagingDir, { recursive: true, force: true });
	fs.mkdirSync(stagingDir, { recursive: true });

	await $`unzip -q ${zipPath} -d ${stagingDir}`;

	const appName = fs.readdirSync(stagingDir).find(name => name.endsWith('.app'));
	if (!appName) {
		throw new Error(`Cannot staple: no .app bundle found inside ${zipPath}`);
	}
	const appPath = path.join(stagingDir, appName);

	await $`xcrun stapler staple ${appPath}`;
	await $`xcrun stapler validate ${appPath}`;

	fs.rmSync(zipPath);
	await $({ cwd: stagingDir })`zip -r -X -y ${zipPath} ${appName}`;

	fs.rmSync(stagingDir, { recursive: true, force: true });
}

async function stapleArtifact(filePath: string): Promise<void> {
	if (!fs.existsSync(filePath)) {
		throw new Error(`Cannot staple: artifact not found at ${filePath}`);
	}
	await $`xcrun stapler staple ${filePath}`;
	await $`xcrun stapler validate ${filePath}`;
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

	// Staple the notarization ticket onto the client artifacts so that
	// Gatekeeper can verify them offline at first launch. See #313109.
	printBanner('Staple client');
	await stapleZippedApp(clientFolder, clientGlob);

	printBanner('Staple DMG');
	await stapleArtifact(path.join(dmgFolder, dmgGlob));
}

main().then(() => {
	process.exit(0);
}, err => {
	console.error(`ERROR: ${err}`);
	process.exit(1);
});
