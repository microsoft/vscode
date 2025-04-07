/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeSignTask, printTitle, sign } from '../common/codesign.js';

async function main() {
	const esrpDLLPath = `${process.env['AGENT_ROOTDIRECTORY']}/_tasks/EsrpCodeSigning_*/*/net6.0/esrpcli.dll`;

	const codesignTasks = [
		{
			title: 'Codesign Debian package',
			processPromise: sign(esrpDLLPath, 'sign-pgp', '.build/linux/deb', '*.deb')
		},
		{
			title: 'Codesign RPM package',
			processPromise: sign(esrpDLLPath, 'sign-pgp', '.build/linux/rpm', '*.rpm')
		}
	] satisfies CodeSignTask[];

	// Wait for processes to finish and stream their output
	for (const { title, processPromise } of codesignTasks) {
		printTitle(title);
		await processPromise.pipe(process.stdout);
	}
}

main();
