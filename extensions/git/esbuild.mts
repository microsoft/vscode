/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { run } from '../esbuild-extension-common.mts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist');

async function copyNonTsFiles(outDir: string): Promise<void> {
	const entries = await fs.readdir(srcDir, { withFileTypes: true, recursive: true });
	for (const entry of entries) {
		if (!entry.isFile() || entry.name.endsWith('.ts')) {
			continue;
		}
		const srcPath = path.join(entry.parentPath, entry.name);
		const relativePath = path.relative(srcDir, srcPath);
		const destPath = path.join(outDir, relativePath);
		await fs.mkdir(path.dirname(destPath), { recursive: true });
		await fs.copyFile(srcPath, destPath);
	}
}

run({
	platform: 'node',
	entryPoints: {
		'main': path.join(srcDir, 'main.ts'),
		'askpass-main': path.join(srcDir, 'askpass-main.ts'),
		'git-editor-main': path.join(srcDir, 'git-editor-main.ts'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		external: ['vscode', '@vscode/fs-copyfile'],
	},
}, process.argv, copyNonTsFiles);
