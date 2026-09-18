/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import * as path from 'path';
import * as esbuild from 'esbuild';
import ts from 'typescript';
import { SourceMapConsumer } from 'source-map';
import { getBundleOptions } from '../bundle.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');

async function bundle(source: string, minify: boolean, platform: 'neutral' | 'node', loader: 'ts' | 'js' = 'ts') {
	const result = await esbuild.build({
		...getBundleOptions(minify, platform),
		absWorkingDir: repoRoot,
		stdin: { contents: source, sourcefile: `fixture.${loader}`, loader, resolveDir: repoRoot },
		outfile: path.join(repoRoot, 'out-test', 'bundle.js'),
		metafile: true,
	});
	const javascript = result.outputFiles?.find(file => file.path.endsWith('.js'));
	const sourceMap = result.outputFiles?.find(file => file.path.endsWith('.js.map'));
	const output = Object.values(result.metafile.outputs).find(output => output.entryPoint);
	assert.ok(javascript && sourceMap && output);
	return {
		code: javascript.text,
		map: new SourceMapConsumer(JSON.parse(sourceMap.text)),
		output,
	};
}

function positionOf(text: string, token: string): { line: number; column: number } {
	const offset = text.indexOf(token);
	assert.ok(offset >= 0, `Missing token: ${token}`);
	const lines = text.slice(0, offset).split('\n');
	return { line: lines.length, column: lines[lines.length - 1].length };
}

suite('production bundle helpers', () => {
	for (const platform of ['neutral', 'node'] as const) {
		for (const minify of [false, true]) {
			suite(`${platform}, minify: ${minify}`, () => {
				test('helper-free entries keep only their own exports and a small copyright banner', async () => {
					const { code } = await bundle('export const value = 42;', minify, platform);
					const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
					assert.deepStrictEqual({ exports: Object.keys(module), value: module.value }, {
						exports: ['value'],
						value: 42,
					});
					assert.match(code, /^\/\*![\s\S]*Copyright \(C\) Microsoft Corporation/);
					assert.ok(Buffer.byteLength(code) < 512, 'A helper-free entry must not carry the tslib library');
				});

				test('emits scoped helpers for service parameter decorators and field initialization', async () => {
					const source = `
						import { createDecorator, _util } from './src/vs/platform/instantiation/common/instantiation.js';
						const IService = createDecorator<{ value: number }>('fixtureService');
						class Consumer {
							doubled = this.service.value * 2;
							constructor(@IService public readonly service: { value: number }) {}
						}
						export const result = {
							value: new Consumer({ value: 21 }).doubled,
							dependencies: _util.getServiceDependencies(Consumer as _util.DI_TARGET_OBJ)
								.map(dependency => [dependency.id.toString(), dependency.index]),
						};
					`;
					const { code } = await bundle(source, minify, platform);
					const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
					assert.deepStrictEqual({ exports: Object.keys(module), result: module.result }, {
						exports: ['result'],
						result: { value: 42, dependencies: [['fixtureService', 0]] },
					});
				});

				test('keeps disposal, async generators, and private fields self-contained', async () => {
					const source = `
						export const result: string[] = [];
						class Counter {
							#value = 0;
							async *values() {
								yield ++this.#value;
								yield ++this.#value;
							}
						}
						async function collect() {
							using resource = { [Symbol.dispose]() { result.push('sync'); } };
							await using asynchronousResource = { async [Symbol.asyncDispose]() { result.push('async'); } };
							for await (const value of new Counter().values()) {
								result.push(String(value));
							}
						}
						await collect();
					`;
					const { code } = await bundle(source, minify, platform);
					const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
					assert.deepStrictEqual({ exports: Object.keys(module), result: module.result }, {
						exports: ['result'],
						result: ['1', '2', 'async', 'sync'],
					});
				});

				test('preserves explicit helper-like names and default exports without banner collisions', async () => {
					const source = `
						const extendStatics = 17;
						const _SuppressedError = 25;
						export const __assign = (left: object, right: object) => ({ ...left, ...right });
						export default extendStatics + _SuppressedError;
					`;
					const { code } = await bundle(source, minify, platform);
					const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
					assert.deepStrictEqual({
						exports: Object.keys(module),
						merged: module.__assign({ a: 1 }, { b: 2 }),
						value: module.default,
					}, {
						exports: ['__assign', 'default'],
						merged: { a: 1, b: 2 },
						value: 42,
					});
				});

				test('preserves explicit external tslib imports', async () => {
					const { output } = await bundle('import { __assign } from "tslib"; export const merge = __assign;', minify, platform);
					assert.deepStrictEqual({
						exports: output.exports,
						imports: output.imports.map(({ path, kind, external }) => ({ path, kind, external })),
					}, {
						exports: ['merge'],
						imports: [{ path: 'tslib', kind: 'import-statement', external: true }],
					});
				});

				test('tree-shakes explicitly bundled tslib to the required helper', async () => {
					const source = `
						import { __assign } from './node_modules/tslib/tslib.es6.js';
						export const result = __assign({ a: 1 }, { b: 2 });
					`;
					const { code, output } = await bundle(source, minify, platform);
					const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
					assert.deepStrictEqual({ exports: Object.keys(module), result: module.result, imports: output.imports }, {
						exports: ['result'],
						result: { a: 1, b: 2 },
						imports: [],
					});
					assert.ok(Buffer.byteLength(code) < 2048, 'An explicit helper import must not retain unused tslib helpers');
				});

				test('preserves self-contained helpers in compiler-generated JavaScript inputs', async () => {
					const source = `
						const indices: number[] = [];
						function parameter(_target: Function, _key: string | undefined, index: number) { indices.push(index); }
						class Base { value = 1; }
						class Derived extends Base {
							constructor(@parameter readonly increment: number) { super(); }
							total() { return this.value + this.increment; }
						}
						export const result = { indices, total: new Derived(41).total() };
					`;
					const { outputText } = ts.transpileModule(source, {
						compilerOptions: {
							module: ts.ModuleKind.ESNext,
							target: ts.ScriptTarget.ES5,
							experimentalDecorators: true,
							useDefineForClassFields: false,
							importHelpers: false,
							noEmitHelpers: false,
						},
					});
					const { code } = await bundle(outputText, minify, platform, 'js');
					const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
					assert.deepStrictEqual({ exports: Object.keys(module), result: module.result }, {
						exports: ['result'],
						result: { indices: [0], total: 42 },
					});
				});

				test('maps tokens after the banner to the original TypeScript and retains legal comments', async () => {
					const source = '/*! Fixture license */\nexport function marker() {\n\treturn "TSLIB_SOURCE_MAP";\n}\n';
					const { code, map } = await bundle(source, minify, platform);
					const original = positionOf(source, '"TSLIB_SOURCE_MAP"');
					assert.deepStrictEqual({
						position: map.originalPositionFor(positionOf(code, '"TSLIB_SOURCE_MAP"')),
						header: map.originalPositionFor({ line: 1, column: 0 }),
						source: map.sourceContentFor('../fixture.ts'),
					}, {
						position: { source: '../fixture.ts', ...original, name: null },
						header: { source: null, line: null, column: null, name: null },
						source,
					});
					assert.match(code, /\/\*! Fixture license \*\//);
				});
			});
		}
	}
});
