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

async function streamTaskOutputAndCheckResult(name: string, promise: ProcessPromise): Promise<void> {
	const result = await promise.pipe(process.stdout);
	if (result.ok) {
		console.log(`\n${name} completed successfully. Duration: ${result.duration} ms`);
		return;
	}

	throw new Error(`${name} failed: ${result.stderr}`);
}

function sign(esrpCliDLLPath: string, type: 'sign-pgp', folder: string, glob: string): ProcessPromise {
	return $`node build/azure-pipelines/common/sign ${esrpCliDLLPath} ${type} ${folder} ${glob}`;
}

async function main() {
	const esrpCliDLLPath = e('EsrpCliDllPath');

	// Start the code sign processes in parallel
	// 1. Codesign deb package
	// 2. Codesign rpm package
	const codesignTask1 = sign(esrpCliDLLPath, 'sign-pgp', '.build/linux/deb', '*.deb');
	const codesignTask2 = sign(esrpCliDLLPath, 'sign-pgp', '.build/linux/rpm', '*.rpm');

	// Codesign deb package
	printBanner('Codesign deb package');
	await streamTaskOutputAndCheckResult('Codesign deb package', codesignTask1);

	// Codesign rpm package
	printBanner('Codesign rpm package');
	await streamTaskOutputAndCheckResult('Codesign rpm package', codesignTask2);
}

main().then(() => {
	process.exit(0);
}, err => {
	console.error(`ERROR: ${err}`);
	process.exit(1);
});
