/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import path from 'node:path';
import { suite, test } from 'node:test';
import { affectsUniversalApp, packagingFiles } from '../../azure-pipelines/darwin/universalAppChanges.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

suite('universal app changes', () => {
	const packaging = packagingFiles(repositoryRoot);

	test('the packaging, the merge and the dependencies affect the universal app', () => {
		const files = [
			'build/gulpfile.vscode.ts',
			'build/lib/asar.ts',
			// imported by the packaging, transitively
			'build/lib/copilot.ts',
			'build/lib/osProxyResolver.ts',
			'build/lib/extensions.ts',
			'product.json',
			'build/.moduleignore',
			'build/.moduleignore.darwin',
			'build/darwin/create-universal-app.ts',
			'build/azure-pipelines/darwin/product-build-darwin-universal.yml',
			'package.json',
			'pnpm-lock.yaml',
			'pnpm-workspace.yaml',
			'.pnpmfile.mjs',
			'build/.pnpmfile.mjs',
			'.nvmrc',
			'extensions/git/esbuild.mts',
			'extensions/markdown-language-features/esbuild.browser.mts',
			'extensions/copilot/.esbuild.mts',
			'extensions/git/.vscodeignore',
			'extensions/esbuild-extension-common.mts',
			'build/package.json',
			'build/pnpm-lock.yaml',
			'build/.npmrc',
		];
		assert.deepStrictEqual(files.filter(file => !affectsUniversalApp(file, packaging)), []);
	});

	test('other changes do not', () => {
		const files = [
			'src/vs/workbench/browser/workbench.ts',
			'extensions/git/package.json',
			'extensions/git/src/git.ts',
			'extensions/esbuild-common.test.mts',
			'build/lib/test/asar.test.ts',
			'build/azure-pipelines/linux/product-build-linux-ci.yml',
			'remote/package.json',
			'test/unit/browser/index.js',
		];
		assert.deepStrictEqual(files.filter(file => affectsUniversalApp(file, packaging)), []);
	});
});