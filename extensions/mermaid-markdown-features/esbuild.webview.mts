/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'path';
import esbuild, { type Plugin } from 'esbuild';
import { resolvePackageDirectory } from '../esbuild-common.mts';
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
	splitting: true,
};

await run({
	// All webviews, built together into one folder so that they share their chunks and the extension contains Mermaid once.
	// The entry modules stay in the folder of the chunks: a notebook only loads a renderer's files from the folder of its entry module.
	entryPoints: {
		'markdown-preview': path.join(previewSrcDir, 'markdown', 'index.ts'),
		'notebook': path.join(previewSrcDir, 'notebook', 'index.ts'),
		'markdown-editor': path.join(previewSrcDir, 'markdownEditor', 'index.ts'),
		'chat': path.join(chatSrcDir, 'index.ts'),
		'diagram-editor': path.join(chatSrcDir, 'index-editor.ts'),
		'codicon': path.join(resolvePackageDirectory(rootDir, '@vscode/codicons'), 'dist', 'codicon.css'),
	},
	srcDir: previewSrcDir,
	outdir: path.join(rootDir, 'webview-out'),
	additionalOptions: mermaidMarkdownBuildOptions,
}, process.argv);
