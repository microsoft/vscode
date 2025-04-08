/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, ProcessPromise, useBash } from 'zx';

const arch = process.env['VSCODE_ARCH'];
const agentRootDirectory = process.env['AGENT_ROOTDIRECTORY'];
const pipelineWorkspace = process.env['PIPELINE_WORKSPACE'];

function printBanner(title: string) {
	title = `${title} (${new Date().toISOString()})`;

	console.log('\n\n');
	console.log('#'.repeat(75));
	console.log(`# ${title.padEnd(71)} #`);
	console.log('#'.repeat(75));
	console.log('\n\n');
}

function sign(esrpCliDLLPath: string, type: 'sign-darwin' | 'notarize-darwin', folder: string, glob: string): ProcessPromise {
	return $`node build/azure-pipelines/common/sign ${esrpCliDLLPath} ${type} ${folder} '${glob}'`;
}

async function main() {
	useBash();

	const esrpCliDLLPath = `${agentRootDirectory}/_tasks/EsrpCodeSigning_*/*/net6.0/esrpcli.dll`;
	const folder = `${pipelineWorkspace}/unsigned_vscode_client_darwin_${arch}_archive`;
	const glob = `VSCode-darwin-${arch}.zip`;

	// Codesign
	const codeSignTask = sign(esrpCliDLLPath, 'sign-darwin', folder, glob);
	printBanner('Codesign');
	await codeSignTask.pipe(process.stdout);

	// Notarize
	const notarizeTask = sign(esrpCliDLLPath, 'notarize-darwin', folder, glob);
	printBanner('Notarize');
	await notarizeTask.pipe(process.stdout);
}

main();
