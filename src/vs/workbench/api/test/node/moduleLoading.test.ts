/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { tryRequireSync } from '../../node/moduleLoading.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('tryRequireSync', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let dir: string;

	setup(() => {
		dir = mkdtempSync(join(tmpdir(), 'vscode-module-loading-'));
	});

	teardown(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	function write(name: string, contents: string): string {
		const file = join(dir, name);
		writeFileSync(file, contents);
		return file;
	}

	test('loads an ESM module synchronously', () => {
		const file = write('plain.mjs', 'export const value = 42;\n');

		const loaded = tryRequireSync<{ value: number }>(file);

		assert.strictEqual(loaded?.module.value, 42);
	});

	test('loads a CommonJS module synchronously, even when its exports are undefined', () => {
		const file = write('undef.cjs', 'module.exports = undefined;\n');

		const loaded = tryRequireSync<undefined>(file);

		assert.deepStrictEqual(loaded, { module: undefined });
	});

	test('gives up on a module using top-level await without evaluating anything', async () => {
		write('side-effect.mjs', 'globalThis.__moduleLoadingTestEvaluated = true;\nexport const marker = 1;\n');
		const file = write('tla.mjs', [
			'import "./side-effect.mjs";',
			'await Promise.resolve();',
			'export const value = "loaded";',
		].join('\n'));

		const loaded = tryRequireSync(file);

		assert.strictEqual(loaded, undefined);
		assert.strictEqual((globalThis as Record<string, unknown>).__moduleLoadingTestEvaluated, undefined);

		// nothing was evaluated, so the module still imports cleanly afterwards
		const imported = await import(pathToFileURL(file).href);
		assert.strictEqual(imported.value, 'loaded');
		delete (globalThis as Record<string, unknown>).__moduleLoadingTestEvaluated;
	});

	test('gives up when a dependency uses top-level await', () => {
		write('tla-dep.mjs', 'await Promise.resolve();\nexport const value = 1;\n');
		const file = write('entry.mjs', 'import "./tla-dep.mjs";\nexport const value = 2;\n');

		assert.strictEqual(tryRequireSync(file), undefined);
	});

	test('rethrows errors that are not about needing an async load', () => {
		const file = write('boom.mjs', 'throw new Error("extension blew up during load");\n');

		assert.throws(() => tryRequireSync(file), /extension blew up during load/);
	});
});
