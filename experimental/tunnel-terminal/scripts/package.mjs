/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const vsce = require.resolve('@vscode/vsce/vsce');
const root = process.cwd();

async function packageExtension(cwd, args) {
	await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [vsce, 'package', ...args], { cwd, stdio: 'inherit' });
		child.once('error', reject);
		child.once('exit', code => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Extension packaging failed (${code ?? 'no exit code'}).`));
			}
		});
	});
}

await packageExtension(root, ['--target', `${process.platform}-${process.arch}`, '--ignore-other-target-folders']);
await packageExtension(join(root, 'local'), ['--no-dependencies']);
