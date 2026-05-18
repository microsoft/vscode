/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'path';
import esbuild, { type Plugin } from 'esbuild';
import { run } from '../esbuild-webview-common.mts';

const rootDir = import.meta.dirname;
const previewSrcDir = path.join(rootDir, 'preview-src');
const chatSrcDir = path.join(previewSrcDir, 'chat');

const cssTextPlugin: Plugin = {
	name: 'css-text',
	setup(build) {
		build.onLoad({ filter: /diagramStyles\.css$/ }, async args => {
			const result = await esbuild.build({
				entryPoints: [args.path],
				bundle: true,
				minify: true,
				write: false,
				loader: {
					'.ttf': 'dataurl',
					'.woff': 'dataurl',
					'.woff2': 'dataurl',
				},
			});
			const css = result.outputFiles[0].text;
			return {
				contents: `export default ${JSON.stringify(css)};`,
				loader: 'js',
			};
		});
	},
};

const mermaidMarkdownBuildOptions: Partial<esbuild.BuildOptions> = {
	loader: {
		'.ttf': 'dataurl',
	},
	plugins: [cssTextPlugin],
	minify: false,
};

await Promise.all([
	// Chat
	run({
		entryPoints: {
			'index': path.join(chatSrcDir, 'index.ts'),
			'index-editor': path.join(chatSrcDir, 'index-editor.ts'),
			'codicon': path.join(rootDir, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'),
		},
		srcDir: chatSrcDir,
		outdir: path.join(rootDir, 'chat-webview-out'),
		additionalOptions: {
			loader: {
				'.ttf': 'dataurl',
			},
		}
	}, process.argv),
	// Markdown preview
	run({
		entryPoints: {
			'index': path.join(previewSrcDir, 'markdown', 'index.ts'),
		},
		srcDir: rootDir,
		outdir: path.join(rootDir, 'markdown-preview-out'),
		additionalOptions: mermaidMarkdownBuildOptions,
	}, process.argv),
	// Notebook
	run({
		entryPoints: {
			'index': path.join(previewSrcDir, 'notebook', 'index.ts'),
		},
		srcDir: rootDir,
		outdir: path.join(rootDir, 'notebook-out'),
		additionalOptions: {
			...mermaidMarkdownBuildOptions,
		},
	}, process.argv),
]);
