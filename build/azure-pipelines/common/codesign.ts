/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, ProcessPromise } from 'zx';

export type CodeSignTask = {
	readonly title: string;
	readonly processPromise: ProcessPromise;
};

export function printTitle(title: string) {
	console.log('\n');
	console.log('#'.repeat(65));
	console.log(`# ${title.padEnd(61)} #`);
	console.log('#'.repeat(65));
	console.log('\n');
}

export function sign(esrpDLLPath: string, type: 'sign-pgp' | 'sign-windows' | 'sign-windows-appx', folder: string, glob: string): ProcessPromise {
	return $`node build/azure-pipelines/common/sign ${esrpDLLPath} ${type} ${folder} '${glob}'`;
}
