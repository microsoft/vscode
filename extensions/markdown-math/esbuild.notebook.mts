/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fse from 'fs-extra';
import path from 'path';
import { resolvePackageDirectory } from '../esbuild-common.mts';
import { run } from '../esbuild-webview-common.mts';

const srcDir = path.join(import.meta.dirname, 'notebook');
const outDir = path.join(import.meta.dirname, 'notebook-out');

function postBuild(outDir: string) {
	const katexDir = resolvePackageDirectory(import.meta.dirname, 'katex');
	fse.copySync(
		path.join(katexDir, 'dist', 'katex.min.css'),
		path.join(outDir, 'katex.min.css'));

	const fontsDir = path.join(katexDir, 'dist', 'fonts');
	const fontsOutDir = path.join(outDir, 'fonts/');

	fse.mkdirSync(fontsOutDir, { recursive: true });

	for (const file of fse.readdirSync(fontsDir)) {
		if (file.endsWith('.woff2')) {
			fse.copyFileSync(path.join(fontsDir, file), path.join(fontsOutDir, file));
		}
	}
}

run({
	entryPoints: [
		path.join(srcDir, 'katex.ts'),
	],
	srcDir,
	outdir: outDir,
}, process.argv, postBuild);
