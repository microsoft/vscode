/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { resolvePackageJsonExports } from '../../utils/packageExports';

suite('package.json exports', () => {
	test('resolves exports sugar string for main subpath', () => {
		assert.strictEqual(resolvePackageJsonExports('./index.js', '.', ['node', 'import']), './index.js');
		assert.strictEqual(resolvePackageJsonExports('./index.js', './x', ['node', 'import']), undefined);
	});

	test('rejects invalid exports sugar string target', () => {
		assert.strictEqual(resolvePackageJsonExports('index.js', '.', ['node', 'import']), undefined);
	});

	test('treats `null` as an explicit exclusion that blocks broader patterns', () => {
		const exportsField = {
			'./*': './dist/*.js',
			'./private/*': null,
		};

		assert.strictEqual(resolvePackageJsonExports(exportsField, './public/x', ['node', 'import']), './dist/public/x.js');
		assert.strictEqual(resolvePackageJsonExports(exportsField, './private/secret', ['node', 'import']), undefined);
	});

	test('resolves exact subpath export', () => {
		const exportsField = {
			'./config.json': './configs/tsconfig.json'
		};

		assert.strictEqual(
			resolvePackageJsonExports(exportsField, './config.json', ['default']),
			'./configs/tsconfig.json');
	});

	test('resolves subpath pattern exports', () => {
		const exportsField = {
			'./*/tsconfig.json': './lib/*/tsconfig.json'
		};

		assert.strictEqual(
			resolvePackageJsonExports(exportsField, './base/tsconfig.json', ['default']),
			'./lib/base/tsconfig.json');
	});

	test('selects most specific wildcard key', () => {
		const exportsField = {
			'./foo/*.js': './out/foo/*.js',
			'./foo/bar/*.js': './out/foo/bar/*.js'
		};

		assert.strictEqual(
			resolvePackageJsonExports(exportsField, './foo/bar/x.js', ['default']),
			'./out/foo/bar/x.js');
	});

	test('conditional exports are matched in object insertion order', () => {
		const exportsField = {
			'.': {
				default: './default.js',
				import: './import.js'
			}
		};

		assert.strictEqual(
			resolvePackageJsonExports(exportsField, '.', ['import']),
			'./default.js');
	});

	test('conditional exports resolve a matching condition when ordered first', () => {
		const exportsField = {
			'.': {
				import: './import.js',
				default: './default.js'
			}
		};

		assert.strictEqual(
			resolvePackageJsonExports(exportsField, '.', ['import']),
			'./import.js');
	});

	test('conditional exports ignore invalid targets and continue', () => {
		const exportsField = {
			'.': {
				import: 'import.js',
				default: './default.js'
			}
		};

		assert.strictEqual(
			resolvePackageJsonExports(exportsField, '.', ['import']),
			'./default.js');
	});

	test('resolves array export by first resolvable entry', () => {
		const exportsField = {
			'./x': ['x.js', './x.js']
		};

		assert.strictEqual(
			resolvePackageJsonExports(exportsField, './x', ['default']),
			'./x.js');
	});

	test('returns undefined for unknown subpath', () => {
		const exportsField = {
			'./a': './a.js'
		};

		assert.strictEqual(resolvePackageJsonExports(exportsField, './b', ['default']), undefined);
	});

	test('rejects wildcard matches that include path traversal segments', () => {
		const exportsField = {
			'./*/x': './out/*/x'
		};

		assert.strictEqual(resolvePackageJsonExports(exportsField, './../x', ['default']), undefined);
	});
});
