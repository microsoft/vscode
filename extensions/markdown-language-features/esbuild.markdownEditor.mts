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
const taskProgressBuildModuleUrl = new URL('./scripts/buildTaskProgressHtml.mts', import.meta.url);
const taskProgressBuildModulePath = fileURLToPath(taskProgressBuildModuleUrl);

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
		path.dirname(fileURLToPath(import.meta.resolve('@vscode/web-editors'))),
		path.dirname(fileURLToPath(import.meta.resolve('@vscode/hubrpc'))),
		updatePackageJsonModulePath,
		taskProgressBuildModulePath,
	],
	beforeBuild: updateMarkdownEditorPackageJsonFile,
	additionalOptions: {
		plugins: [{
			name: 'task-progress-html',
			setup(build) {
				build.onLoad({ filter: /taskProgress\.html$/ }, async ({ path: htmlPath }) => {
					const version = (await stat(taskProgressBuildModulePath)).mtimeMs;
					const module = await import(`${taskProgressBuildModuleUrl.href}?version=${version}`) as typeof import('./scripts/buildTaskProgressHtml.mts');
					const html = await module.buildTaskProgressHtml(path.dirname(htmlPath));
					return { contents: `export default ${JSON.stringify(html)};`, loader: 'js' };
				});
			},
		}],
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
