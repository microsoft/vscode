/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { suite, test } from 'node:test';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import ts from 'typescript';
import Vinyl from 'vinyl';
import { ESBuildTranspiler } from './transpiler.ts';
import { getCompilerOptionsFromTsConfig } from '../tsconfigUtils.ts';
import { create } from './index.ts';

suite('extension transpilation module formats', () => {
	for (const { module, type, suffix, commonJS } of [
		{ module: 'commonjs', type: 'commonjs', suffix: '.ts', commonJS: true },
		{ module: 'esnext', type: 'module', suffix: '.ts', commonJS: false },
		{ module: 'nodenext', type: 'module', suffix: '.ts', commonJS: false },
		{ module: 'nodenext', type: 'commonjs', suffix: '.ts', commonJS: true },
		{ module: 'nodenext', type: 'module', suffix: '.cts', commonJS: true },
		{ module: 'nodenext', type: 'commonjs', suffix: '.mts', commonJS: false },
	]) {
		test(`${module} ${type} ${suffix} produces loadable ${commonJS ? 'CommonJS' : 'ESM'}`, async () => {
			const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-extension-transpile-'));
			try {
				const extension = path.join(root, 'extensions', 'sample');
				const sourceDir = path.join(extension, 'src');
				await fs.mkdir(sourceDir, { recursive: true });
				await fs.writeFile(path.join(extension, 'package.json'), JSON.stringify({ type }));
				const configPath = path.join(extension, 'tsconfig.json');
				await fs.writeFile(configPath, JSON.stringify({
					compilerOptions: { module, target: 'es2024', rootDir: './src', outDir: './out' },
					include: ['src/**/*'],
				}));
				const source = path.join(sourceDir, `extension${suffix}`);
				await fs.writeFile(source, 'export const value: number = 42;\nexport const load = () => import("./dependency.js");\n');
				const config = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, extension);
				const errors: string[] = [];
				const transpiler = new ESBuildTranspiler(() => { }, error => errors.push(String(error)), configPath, config);
				let output: Vinyl | undefined;
				transpiler.onOutfile = file => output = file;
				transpiler.transpile(new Vinyl({ path: source, base: sourceDir, contents: await fs.readFile(source) }));
				await transpiler.join();
				assert(output);
				await fs.mkdir(path.dirname(output.path), { recursive: true });
				await fs.writeFile(output.path, output.contents as Buffer);
				await fs.writeFile(path.join(extension, 'out', 'dependency.js'), type === 'module' ? 'export const dependency = true;' : 'exports.dependency = true;');
				const loaded = commonJS
					? createRequire(path.join(extension, 'package.json'))(output.path)
					: await import(pathToFileURL(output.path).href);
				assert.deepStrictEqual({
					errors,
					value: loaded.value,
					dependency: (await loaded.load()).dependency,
					preservesDynamicImport: String(output.contents).includes('import("./dependency.js")'),
				}, { errors: [], value: 42, dependency: true, preservesDynamicImport: !commonJS || module === 'nodenext' });
			} finally {
				await fs.rm(root, { recursive: true, force: true });
			}
		});
	}

	test('resolves inherited output directories and skips declaration-only inputs', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-extension-transpile-'));
		try {
			const project = path.join(root, 'extensions', 'sample', 'web');
			const sourceDir = path.join(project, 'src');
			await fs.mkdir(sourceDir, { recursive: true });
			await fs.writeFile(path.join(root, 'extensions', 'tsconfig.json'), JSON.stringify({
				compilerOptions: { module: 'commonjs', target: 'es2024', outDir: './out' },
			}));
			const configPath = path.join(project, 'tsconfig.json');
			await fs.writeFile(configPath, JSON.stringify({ extends: '../../tsconfig.json', compilerOptions: { rootDir: './src' }, include: ['src/**/*'] }));
			await fs.writeFile(path.join(sourceDir, 'main.ts'), 'export const value = 1;');
			await fs.writeFile(path.join(sourceDir, 'types.d.ts'), 'export interface Value { value: number; }');
			const compiler = create(configPath, {}, { transpileOnly: true, transpileWithEsbuild: true }, error => {
				throw new Error(error);
			});
			const emitted: string[] = [];
			await pipeline(compiler.src({ base: sourceDir }), compiler(), new Writable({
				objectMode: true,
				write: (file: Vinyl, _encoding, callback) => {
					emitted.push(path.relative(root, file.path));
					callback();
				},
			}));
			assert.deepStrictEqual({
				outDir: path.relative(root, getCompilerOptionsFromTsConfig(configPath).outDir!),
				emitted,
			}, { outDir: path.join('extensions', 'out'), emitted: [path.join('extensions', 'out', 'main.js')] });
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
