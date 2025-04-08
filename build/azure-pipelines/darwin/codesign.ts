/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, ProcessPromise } from 'zx';
import { e } from '../common/publish';

function printBanner(title: string) {
	title = `${title} (${new Date().toISOString()})`;

	console.log('\n');
	console.log('#'.repeat(75));
	console.log(`# ${title.padEnd(71)} #`);
	console.log('#'.repeat(75));
	console.log('\n');
}

async function handleProcessPromise(name: string, promise: ProcessPromise): Promise<void> {
	const result = await promise.pipe(process.stdout);
	if (!result.ok) {
		throw new Error(`${name} failed: ${result.stderr}`);
	}
}

function sign(esrpCliDLLPath: string, type: 'sign-darwin' | 'notarize-darwin', folder: string, glob: string): ProcessPromise {
	return $`node build/azure-pipelines/common/sign ${esrpCliDLLPath} ${type} ${folder} '${glob}'`;
}

async function main() {
	const arch = e('VSCODE_ARCH');
	const esrpCliDLLPath = e('EsrpCliDllPath');
	const pipelineWorkspace = e('PIPELINE_WORKSPACE');

	const folder = `${pipelineWorkspace}/unsigned_vscode_client_darwin_${arch}_archive`;
	const glob = `VSCode-darwin-${arch}.zip`;

	// Codesign
	printBanner('Codesign');
	const codeSignTask = sign(esrpCliDLLPath, 'sign-darwin', folder, glob);
	await handleProcessPromise('Codesign', codeSignTask);

	// Notarize
	printBanner('Notarize');
	const notarizeTask = sign(esrpCliDLLPath, 'notarize-darwin', folder, glob);
	await handleProcessPromise('Notarize', notarizeTask);
}

main().then(() => {
	process.exit(0);
}, err => {
	console.error(err);
	process.exit(1);
});
