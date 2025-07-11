/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { printBanner, spawnCodesignProcess, streamProcessOutputAndCheckResult } from '../common/codesign';
import { e } from '../common/publish';

async function main() {
	const esrpCliDLLPath = e('EsrpCliDllPath');

	// Start the code sign processes in parallel
	// 1. Codesign deb package
	// 2. Codesign rpm package
	const codesignTask1 = spawnCodesignProcess(esrpCliDLLPath, 'sign-pgp', '.build/linux/deb', '*.deb');
	const codesignTask2 = spawnCodesignProcess(esrpCliDLLPath, 'sign-pgp', '.build/linux/rpm', '*.rpm');

	// Additional codesign processes with the newer key
	const codesignTask3 = spawnCodesignProcess(esrpCliDLLPath, 'sign-pgp-500207', '.build/linux/deb-500207', '*.deb');
	const codesignTask4 = spawnCodesignProcess(esrpCliDLLPath, 'sign-pgp-500207', '.build/linux/rpm-500207', '*.rpm');

	// Codesign deb package
	printBanner('Codesign deb package');
	await streamProcessOutputAndCheckResult('Codesign deb package', codesignTask1);

	// Codesign rpm package
	printBanner('Codesign rpm package');
	await streamProcessOutputAndCheckResult('Codesign rpm package', codesignTask2);

	// Codesign deb package with the newer key
	printBanner('Codesign deb package (sign-pgp-500207)');
	await streamProcessOutputAndCheckResult('Codesign deb package (sign-pgp-500207)', codesignTask3);

	// Codesign rpm package with the newer key
	printBanner('Codesign rpm package (sign-pgp-500207)');
	await streamProcessOutputAndCheckResult('Codesign rpm package (sign-pgp-500207)', codesignTask4);
}

main().then(() => {
	process.exit(0);
}, err => {
	console.error(`ERROR: ${err}`);
	process.exit(1);
});
