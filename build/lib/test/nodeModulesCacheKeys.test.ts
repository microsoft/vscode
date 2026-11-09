/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { computeNodeModulesBaseCacheKey, computeNodeModulesCacheKey, computePnpmStoreBaseCacheKey, computePnpmStoreCacheKey, type ReadRepositoryFile } from '../../azure-pipelines/common/cacheKeys.ts';

/** Reads the given repository files, every other `package.json` as one that only pins pnpm, and other files as empty. */
function reader(files: Record<string, string> = {}): ReadRepositoryFile {
	return file => Buffer.from(files[file] ?? (file.endsWith('package.json') ? '{"packageManager":"pnpm@12.0.0"}' : ''));
}

suite('node_modules cache keys', () => {
	test('the base key covers what a node_modules folder needs for pnpm install to update its dependencies', () => {
		const args = ['linux', 'x64', 'x64'];
		const base = computeNodeModulesBaseCacheKey(args, reader());
		const key = computeNodeModulesCacheKey(args, reader());
		const changes = (files: Record<string, string>, changedArgs = args) => ({
			base: computeNodeModulesBaseCacheKey(changedArgs, reader(files)) !== base,
			key: computeNodeModulesCacheKey(changedArgs, reader(files)) !== key,
		});
		assert.deepStrictEqual({
			lockfile: changes({ 'pnpm-lock.yaml': 'lockfileVersion: \'9.0\'' }),
			dependencies: changes({ 'package.json': '{"packageManager":"pnpm@12.0.0","dependencies":{"a":"1.0.0"}}' }),
			nativeBuildTarget: changes({ 'remote/package.json': '{"packageManager":"pnpm@12.0.0","nativeBuild":{"runtime":"node","target":"24.0.0","disturl":"https://nodejs.org/dist"}}' }),
			nativeBuildHooks: changes({ '.pnpmfile.mjs': 'export const hooks = {};' }),
			salt: changes({ 'build/.cachesalt': 'salt' }),
			nodeVersion: changes({ '.nvmrc': '24.0.0' }),
			pnpmVersion: changes({ 'package.json': '{"packageManager":"pnpm@13.0.0"}' }),
			pnpmSettings: changes({ 'pnpm-workspace.yaml': 'nodeLinker: isolated' }),
			platform: changes({}, ['win32', 'x64', 'x64']),
		}, {
			lockfile: { base: false, key: true },
			dependencies: { base: false, key: true },
			nativeBuildTarget: { base: true, key: true },
			nativeBuildHooks: { base: true, key: true },
			salt: { base: true, key: true },
			nodeVersion: { base: true, key: false },
			pnpmVersion: { base: true, key: true },
			pnpmSettings: { base: true, key: true },
			platform: { base: true, key: true },
		});
	});

	test('a pnpm store can start from the store of other lockfiles, but not of another pnpm version or platform', () => {
		const args = ['linux', 'x64'];
		const base = computePnpmStoreBaseCacheKey(args, reader());
		const key = computePnpmStoreCacheKey(reader());
		const changes = (files: Record<string, string>, changedArgs = args) => ({
			base: computePnpmStoreBaseCacheKey(changedArgs, reader(files)) !== base,
			key: computePnpmStoreCacheKey(reader(files)) !== key,
		});
		assert.deepStrictEqual({
			lockfile: changes({ 'extensions/pnpm-lock.yaml': 'lockfileVersion: \'9.0\'' }),
			nativeBuildHooks: changes({ '.pnpmfile.mjs': 'export const hooks = {};' }),
			salt: changes({ 'build/.cachesalt': 'salt' }),
			pnpmVersion: changes({ 'package.json': '{"packageManager":"pnpm@13.0.0"}' }),
			platform: changes({}, ['win32', 'x64']),
		}, {
			lockfile: { base: false, key: true },
			nativeBuildHooks: { base: false, key: false },
			salt: { base: true, key: false },
			pnpmVersion: { base: true, key: false },
			platform: { base: true, key: false },
		});
	});
});
