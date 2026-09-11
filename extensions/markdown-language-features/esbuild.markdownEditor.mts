/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { stat } from 'node:fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { run } from '../esbuild-webview-common.mts';

const srcDir = path.join(import.meta.dirname, 'markdown-editor-src');
const outDir = path.join(import.meta.dirname, 'markdown-editor-out');
const updatePackageJsonModuleUrl = new URL('./scripts/updateMarkdownEditorPackageJson.mts', import.meta.url);
const updatePackageJsonModulePath = fileURLToPath(updatePackageJsonModuleUrl);

async function updateMarkdownEditorPackageJsonFile(): Promise<unknown> {
	const version = (await stat(updatePackageJsonModulePath)).mtimeMs;
	const module = await import(`${updatePackageJsonModuleUrl.href}?version=${version}`) as typeof import('./scripts/updateMarkdownEditorPackageJson.mts');
	return module.updateMarkdownEditorManifestFiles('write');
}

run({
	entryPoints: [
		path.join(srcDir, 'editor.ts'),
	],
	srcDir,
	outdir: outDir,
	additionalWatchPaths: [
		path.dirname(fileURLToPath(import.meta.resolve('@vscode/markdown-editor/commands'))),
		updatePackageJsonModulePath,
	],
	beforeBuild: updateMarkdownEditorPackageJsonFile,
	additionalOptions: {
		splitting: true,
		chunkNames: '[name]-[hash]',
		// `@vscode/diff` has a Node-only code path that dynamically imports
		// `node:fs/promises` (guarded by a `process.versions.node` check). It is
		// dead code in the webview, so mark it external to avoid a resolve error.
		external: ['node:fs/promises'],
		loader: {
			'.woff': 'file',
			'.woff2': 'file',
			'.ttf': 'file',
			'.eot': 'file',
			'.svg': 'file',
		},
		assetNames: '[name]-[hash]',
	},
}, process.argv);
