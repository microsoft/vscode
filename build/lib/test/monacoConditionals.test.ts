/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { applyMonacoConditionals } from '../monacoConditionals.ts';

suite('applyMonacoConditionals', () => {
	test('swaps the commented branches and keeps the line count', () => {
		const source = [
			'a();',
			'\t// #if MONACO',
			'\t// monaco(1);',
			'',
			'\t//\tmonaco(2);',
			'\t// #else',
			'\tvscode(1);',
			'\t// #endif',
			'b();',
		].join('\r\n');
		assert.deepStrictEqual(applyMonacoConditionals(source, 'f.ts').split('\r\n'), [
			'a();',
			'\t// #if MONACO',
			'\tmonaco(1);',
			'',
			'\t\tmonaco(2);',
			'\t// #else',
			'\t// vscode(1);',
			'\t// #endif',
			'b();',
		]);
	});

	test('rejects malformed blocks', () => {
		assert.throws(() => applyMonacoConditionals('// #if MONACO\nmonaco();\n// #endif', 'f.ts'), /f\.ts:2: every line/);
		assert.throws(() => applyMonacoConditionals('// #if MONACO\n// a();', 'f.ts'), /f\.ts:1: `#if MONACO` without `#endif`/);
		assert.throws(() => applyMonacoConditionals('// #if MONACO\n// #if MONACO\n// #endif', 'f.ts'), /cannot be nested/);
		assert.throws(() => applyMonacoConditionals('// #if MONACO\n// #endif\n// #endif', 'f.ts'), /without `#if MONACO`/);
	});
});
