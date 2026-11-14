/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as esbuild from 'esbuild';
import { suite, test } from 'node:test';
import * as path from 'path';
import { rewriteSourceMappingURL } from '../source-map-url.ts';

suite('rewriteSourceMappingURL', () => {
	const sourceMapBaseUrl = 'https://main.vscode-cdn.net/sourcemaps/commit/core';
	const content = {
		js: 'console.log("test");\n//# sourceMappingURL=main.js.map\n',
		css: 'body { color: red; }\n/*# sourceMappingURL=main.css.map */\n',
	};

	for (const { name, paths, outDir } of [
		{ name: 'Windows', paths: path.win32, outDir: 'C:\\repo\\out' },
		{ name: 'POSIX', paths: path.posix, outDir: '/repo/out' },
	]) {
		for (const directories of [[], ['vs', 'workbench', 'api', 'node']]) {
			const location = directories.length > 0 ? 'nested' : 'root-level';
			const relativeJsPath = paths.relative(outDir, paths.join(outDir, ...directories, 'main.js'));
			const relativeCssPath = paths.relative(outDir, paths.join(outDir, ...directories, 'main.css'));
			const urlPath = [...directories, 'main'].join('/');

			test(`${name} ${location} source-map URLs use forward slashes`, () => {
				assert.deepStrictEqual({
					js: rewriteSourceMappingURL(content.js, relativeJsPath, sourceMapBaseUrl),
					css: rewriteSourceMappingURL(content.css, relativeCssPath, sourceMapBaseUrl),
				}, {
					js: `console.log("test");\n//# sourceMappingURL=${sourceMapBaseUrl}/${urlPath}.js.map\n`,
					css: `body { color: red; }\n/*# sourceMappingURL=${sourceMapBaseUrl}/${urlPath}.css.map*/\n`,
				});
			});

			for (const baseUrl of [undefined, '']) {
				test(`${name} ${location} comments are unchanged with an ${baseUrl === undefined ? 'omitted' : 'empty'} CDN URL`, () => {
					assert.deepStrictEqual({
						js: rewriteSourceMappingURL(content.js, relativeJsPath, baseUrl),
						css: rewriteSourceMappingURL(content.css, relativeCssPath, baseUrl),
					}, content);
				});
			}
		}
	}

	for (const { loader, input, expected } of [
		{
			loader: 'js',
			input: 'console.log("test");',
			expected: `console.log("test");\n//# sourceMappingURL=${sourceMapBaseUrl}/nested/main.js.map\n`,
		},
		{
			loader: 'css',
			input: 'body { color: red; }',
			expected: `body{color:red}\n/*# sourceMappingURL=${sourceMapBaseUrl}/nested/main.css.map*/\n`,
		},
	] as const) {
		test(`rewrites linked comments emitted by esbuild for minified ${loader}`, async () => {
			const outDir = path.join(import.meta.dirname, 'source-map-url-output');
			const result = await esbuild.build({
				stdin: { contents: input, loader },
				outfile: path.join(outDir, 'nested', `main.${loader}`),
				bundle: true,
				format: 'esm',
				minify: true,
				sourcemap: 'linked',
				write: false,
			});

			assert.deepStrictEqual(
				result.outputFiles.filter(file => file.path.endsWith(`.${loader}`)).map(file =>
					rewriteSourceMappingURL(file.text, path.relative(outDir, file.path), sourceMapBaseUrl)
				),
				[expected],
			);
		});
	}

	test('does not add missing source-map comments', () => {
		assert.deepStrictEqual({
			js: rewriteSourceMappingURL('console.log("test");\n', 'main.js', sourceMapBaseUrl),
			css: rewriteSourceMappingURL('body { color: red; }\n', 'main.css', sourceMapBaseUrl),
		}, {
			js: 'console.log("test");\n',
			css: 'body { color: red; }\n',
		});
	});
});
