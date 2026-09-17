/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const tests = (await readdir('out/test')).filter(file => file.endsWith('.test.cjs'));
const child = spawn(process.execPath, ['--test', '--test-timeout=30000', ...tests.map(file => `out/test/${file}`)], { stdio: 'inherit' });
child.on('error', error => {
	console.error(error);
	process.exitCode = 1;
});
child.on('exit', code => { process.exitCode = code ?? 1; });
