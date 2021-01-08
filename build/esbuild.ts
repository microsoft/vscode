/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as buildfile from '../src/buildfile';
import * as _ from 'underscore';
import * as pkg from '../package.json';

const dependencies = Object.keys(pkg.dependencies);

const entryPoints = _.flatten([
	buildfile.entrypoint('vs/workbench/workbench.desktop.main'),
	buildfile.base,
	buildfile.workerExtensionHost,
	buildfile.workerNotebook,
	buildfile.workbenchDesktop,
	buildfile.code
]).map(entrypoint => `src/${entrypoint.name}.ts`);

async function main() {
	await esbuild.build({
		entryPoints: [
			...entryPoints,
			'src/main.js',
			'src/vs/base/parts/sandbox/electron-browser/preload.js',
			'src/vs/code/electron-sandbox/workbench/workbench.html'
		],
		outdir: 'out',
		outbase: 'src',
		// format: 'iife',
		platform: 'node',
		target: 'node12.18',
		bundle: true,
		tsconfig: 'src/tsconfig.json',
		logLevel: 'info',
		sourcemap: true,
		// minify: true,
		loader: {
			'.png': 'file',
			'.ttf': 'file',
			'.svg': 'file',
			'.html': 'file'
		},
		inject: [
			'src/vs/dummyloader.js'
		],
		external: [
			...dependencies,
			'vs/css!*',
			// 'vs/nls',
			'*/sqlite',
			'electron*',
			'vscode-windows-registry',
			'windows-process-tree',
			'windows-mutex',
			'windows-foreground-love',
			'vscode-windows-ca-certs',
			'*.node',
			'*keymapping',
			'*pty.node'
		]
	});
}

if (require.main === module) {
	main().catch(err => {
		// console.error(err);
		process.exit(1);
	});
}
