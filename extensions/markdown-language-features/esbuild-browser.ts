/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'node:fs';
import * as path from 'node:path';
import { run } from '../esbuild-extension-common.ts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist', 'browser');

/**
 * Copy the language server worker main file to the output directory.
 */
async function copyServerWorkerMain(outDir: string): Promise<void> {
	const srcPath = path.join(import.meta.dirname, 'node_modules', 'vscode-markdown-languageserver', 'dist', 'browser', 'workerMain.js');
	const destPath = path.join(outDir, 'serverWorkerMain.js');
	await fs.promises.copyFile(srcPath, destPath);
}

run({
	entryPoints: {
		'extension': path.join(srcDir, 'extension.browser.ts'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		platform: 'browser',
		format: 'cjs',
		alias: {
			'path': 'path-browserify',
		},
		define: {
			'process.platform': JSON.stringify('web'),
			'process.env': JSON.stringify({}),
			'process.env.BROWSER_ENV': JSON.stringify('true'),
		},
		tsconfig: path.join(import.meta.dirname, 'tsconfig.browser.json'),
	},
}, process.argv, copyServerWorkerMain);
