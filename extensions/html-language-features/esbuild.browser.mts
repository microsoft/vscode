/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as esbuild from 'esbuild';
import { run } from '../esbuild-extension-common.mts';

const extensionRoot = import.meta.dirname;

/**
 * An esbuild plugin that replaces the `javascriptLibs` module with inlined TypeScript
 * library definitions for the browser build. This is the esbuild equivalent of the
 * webpack `javaScriptLibraryLoader.js`.
 */
function javaScriptLibsPlugin(): esbuild.Plugin {
	return {
		name: 'javascript-libs',
		setup(build) {
			build.onLoad({ filter: /javascriptLibs\.ts$/ }, () => {
				const TYPESCRIPT_LIB_SOURCE = path.dirname(import.meta.resolve('typescript').replace('file://', ''));
				const JQUERY_DTS = path.join(extensionRoot, 'server', 'lib', 'jquery.d.ts');

				function getFileName(name: string): string {
					return name === '' ? 'lib.d.ts' : `lib.${name}.d.ts`;
				}

				function readLibFile(name: string): string {
					return fs.readFileSync(path.join(TYPESCRIPT_LIB_SOURCE, getFileName(name)), 'utf8');
				}

				const queue: string[] = [];
				const inQueue: Record<string, boolean> = {};

				function enqueue(name: string): void {
					if (inQueue[name]) {
						return;
					}
					inQueue[name] = true;
					queue.push(name);
				}

				enqueue('es2020.full');

				const result: { name: string; content: string }[] = [];
				while (queue.length > 0) {
					const name = queue.shift()!;
					const contents = readLibFile(name);
					const lines = contents.split(/\r\n|\r|\n/);

					const outputLines: string[] = [];
					for (const line of lines) {
						const m = line.match(/\/\/\/\s*<reference\s*lib="([^"]+)"/);
						if (m) {
							enqueue(m[1]);
						}
						outputLines.push(line);
					}

					result.push({
						name: getFileName(name),
						content: outputLines.join('\n'),
					});
				}

				const jquerySource = fs.readFileSync(JQUERY_DTS, 'utf8');
				result.push({
					name: 'jquery',
					content: jquerySource,
				});

				let code = `const libs = {};\n`;
				for (const entry of result) {
					code += `libs[${JSON.stringify(entry.name)}] = ${JSON.stringify(entry.content)};\n`;
				}
				code += `export function loadLibrary(name) { return libs[name] || ''; }\n`;

				return { contents: code, loader: 'js' };
			});
		},
	};
}

await Promise.all([
	// Build client
	run({
		platform: 'browser',
		entryPoints: {
			'htmlClientMain': path.join(extensionRoot, 'client', 'src', 'browser', 'htmlClientMain.ts'),
		},
		srcDir: path.join(extensionRoot, 'client', 'src'),
		outdir: path.join(extensionRoot, 'client', 'dist', 'browser'),
		additionalOptions: {
			tsconfig: path.join(extensionRoot, 'client', 'tsconfig.browser.json'),
		},
	}, process.argv),

	// Build server
	run({
		platform: 'browser',
		entryPoints: {
			'htmlServerMain': path.join(extensionRoot, 'server', 'src', 'browser', 'htmlServerWorkerMain.ts'),
		},
		srcDir: path.join(extensionRoot, 'server', 'src'),
		outdir: path.join(extensionRoot, 'server', 'dist', 'browser'),
		additionalOptions: {
			tsconfig: path.join(extensionRoot, 'server', 'tsconfig.browser.json'),
			plugins: [javaScriptLibsPlugin()],
		},
	}, process.argv),
]);
