/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { stat } from 'node:fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { run } from '../esbuild-webview-common.mts';
import { markdownEditorOverridePlugin, resolveMarkdownEditorPackage } from './scripts/markdownEditorPackage.mts';

const editorPackage = await resolveMarkdownEditorPackage();
if (editorPackage.directory) {
	console.log(`Markdown editor package override: ${editorPackage.directory}`);
}
const srcDir = path.join(import.meta.dirname, 'markdown-editor-src');
const outDir = path.join(import.meta.dirname, 'markdown-editor-out');
const updatePackageJsonModuleUrl = new URL('./scripts/updateMarkdownEditorPackageJson.mts', import.meta.url);
const updatePackageJsonModulePath = fileURLToPath(updatePackageJsonModuleUrl);
const taskProgressBuildModuleUrl = new URL('./scripts/buildTaskProgressHtml.mts', import.meta.url);
const taskProgressBuildModulePath = fileURLToPath(taskProgressBuildModuleUrl);
const mermaidBuildModuleUrl = new URL('./scripts/buildMermaidHtml.mts', import.meta.url);
const mermaidBuildModulePath = fileURLToPath(mermaidBuildModuleUrl);

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
		editorPackage.directory ?? path.dirname(fileURLToPath(editorPackage.commandsUrl)),
		path.dirname(fileURLToPath(import.meta.resolve('@vscode/web-editors'))),
		path.dirname(fileURLToPath(import.meta.resolve('@vscode/hubrpc'))),
		updatePackageJsonModulePath,
		fileURLToPath(new URL('./scripts/markdownEditorPackage.mts', import.meta.url)),
		taskProgressBuildModulePath,
		mermaidBuildModulePath,
	],
	beforeBuild: updateMarkdownEditorPackageJsonFile,
	additionalOptions: {
		plugins: [...(editorPackage.directory ? [markdownEditorOverridePlugin(editorPackage.directory)] : []), {
			name: 'mermaid-html',
			setup(build) {
				build.onLoad({ filter: /mermaid\.html$/ }, async ({ path: htmlPath }) => {
					const version = (await stat(mermaidBuildModulePath)).mtimeMs;
					const module = await import(`${mermaidBuildModuleUrl.href}?version=${version}`) as typeof import('./scripts/buildMermaidHtml.mts');
					const html = await module.buildMermaidHtml(path.dirname(htmlPath));
					return { contents: `export default ${JSON.stringify(html)};`, loader: 'js' };
				});
			},
		}, {
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
