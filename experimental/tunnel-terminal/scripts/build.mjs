/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';

const license = await readFile('LICENSE.txt', 'utf8');
const wsLicense = await readFile('node_modules/ws/LICENSE', 'utf8');

const options = {
	bundle: true,
	platform: 'node',
	target: 'node20',
	format: 'cjs',
	external: ['vscode', 'node-pty'],
	logLevel: 'info',
	banner: { js: `/*\n${license}\nBundled dependency: ws\n${wsLicense}\n*/` },
};

await build({
	...options,
	entryPoints: { extension: 'src/extension.ts', client: 'src/clientMain.ts', ptyHost: 'src/ptyHost.ts' },
	outdir: 'dist',
	outExtension: { '.js': '.cjs' },
});

const tests = (await readdir('test')).filter(file => file.endsWith('.test.ts'));
await build({
	...options,
	entryPoints: tests.map(file => `test/${file}`),
	outdir: 'out/test',
	outExtension: { '.js': '.cjs' },
});
