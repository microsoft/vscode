/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, usePwsh } from 'zx';

async function main() {
	usePwsh();

	const foo = await $`(gci -directory -filter EsrpCodeSigning_* $(Agent.RootDirectory)\_tasks | Select-Object -last 1).FullName`;
	console.log(foo);

	const bar = await $`(gci -directory $foo | Select-Object -last 1).FullName`;
	console.log(bar);
}

main();
