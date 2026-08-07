/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

async function copyStaticAssets(srcpaths: string[], dst: string): Promise<void> {
	await Promise.all(srcpaths.map(async srcpath => {
		const src = path.join(REPO_ROOT, srcpath);
		const dest = path.join(REPO_ROOT, dst, path.basename(srcpath));
		await fs.promises.mkdir(path.dirname(dest), { recursive: true });
		await fs.promises.copyFile(src, dest);
	}));
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.promises.access(filePath, fs.constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

const treeSitterGrammars: string[] = [
	'tree-sitter-c-sharp',
	'tree-sitter-cpp',
	'tree-sitter-go',
	'tree-sitter-javascript', // Also includes jsx support
	'tree-sitter-python',
	'tree-sitter-ruby',
	'tree-sitter-typescript',
	'tree-sitter-tsx',
	'tree-sitter-java',
	'tree-sitter-rust',
	'tree-sitter-php'
];

const REPO_ROOT = path.join(__dirname, '..');

async function platformDir(): Promise<string> {
	const distPath = 'dist/src/_internal/platform';
	const srcPath = 'src/_internal/platform';
	if (await fileExists(path.join(REPO_ROOT, distPath))) {
		return distPath;
	} else if (await fileExists(path.join(REPO_ROOT, srcPath))) {
		return srcPath;
	} else {
		throw new Error('Could not find the source directory for tokenizer files');
	}
}

function treeSitterWasmDir(): string {
	const modulePath = path.dirname(require.resolve('@vscode/tree-sitter-wasm'));
	return path.relative(REPO_ROOT, modulePath);
}

async function main() {
	const platform = await platformDir();
	const vendoredTiktokenFiles = [`${platform}/tokenizer/node/cl100k_base.tiktoken`, `${platform}/tokenizer/node/o200k_base.tiktoken`];
	const wasm = treeSitterWasmDir();

	// copy static assets to dist
	await copyStaticAssets([
		...vendoredTiktokenFiles,
		...treeSitterGrammars.map(grammar => `${wasm}/${grammar}.wasm`),
		`${wasm}/tree-sitter.wasm`,
	], 'dist');

}

main();
