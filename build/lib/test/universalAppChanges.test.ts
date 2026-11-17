/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { affectsUniversalApp } from '../../azure-pipelines/darwin/universalAppChanges.ts';

suite('universal app changes', () => {
	test('the packaging, the merge and the dependencies affect the universal app', () => {
		const files = [
			'build/gulpfile.vscode.ts',
			'build/lib/asar.ts',
			'build/darwin/create-universal-app.ts',
			'build/azure-pipelines/darwin/product-build-darwin-universal.yml',
			'package.json',
			'pnpm-lock.yaml',
			'pnpm-workspace.yaml',
			'.pnpmfile.mjs',
			'build/package.json',
			'build/pnpm-lock.yaml',
			'build/.npmrc',
		];
		assert.deepStrictEqual(files.filter(file => !affectsUniversalApp(file)), []);
	});

	test('other changes do not', () => {
		const files = [
			'src/vs/workbench/browser/workbench.ts',
			'extensions/git/package.json',
			'build/lib/compilation.ts',
			'build/azure-pipelines/linux/product-build-linux-ci.yml',
			'remote/package.json',
			'test/unit/browser/index.js',
		];
		assert.deepStrictEqual(files.filter(affectsUniversalApp), []);
	});
});