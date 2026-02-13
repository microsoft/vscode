/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'node:fs';
import * as path from 'node:path';
import { run } from '../esbuild-extension-common.mts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist');

/**
 * Copy the language server worker main file to the output directory.
 */
async function copyServerWorkerMain(outDir: string): Promise<void> {
	const srcPath = path.join(import.meta.dirname, 'node_modules', 'vscode-markdown-languageserver', 'dist', 'node', 'workerMain.js');
	const destPath = path.join(outDir, 'serverWorkerMain.js');
	await fs.promises.copyFile(srcPath, destPath);
}

run({
	platform: 'node',
	entryPoints: {
		'extension': path.join(srcDir, 'extension.ts'),
	},
	srcDir,
	outdir: outDir,
}, process.argv, copyServerWorkerMain);
