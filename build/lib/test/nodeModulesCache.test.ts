/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { computeNodeModulesCacheKey, type NodeModulesCachePart } from '../../azure-pipelines/common/cacheKeys.ts';
import { computeManifest, staleDirs } from '../../azure-pipelines/common/nodeModulesCacheManifest.ts';
import { dirs, isNativeDir } from '../../npm/dirs.ts';

const DIRS = ['', 'build', 'remote', 'remote/web', 'extensions', 'extensions/git', 'test/smoke', '.build/distro/npm', '.build/distro/npm/remote'];

function repository(overrides: Record<string, string> = {}): (file: string) => Buffer {
	return file => {
		const override = overrides[file];
		if (override !== undefined) {
			return Buffer.from(override);
		}
		if (file.endsWith('package.json')) {
			return Buffer.from(file === 'package.json' ? '{"distro":"d1"}' : '{}');
		}
		return Buffer.from(`content of ${file}`);
	};
}

function key(part: NodeModulesCachePart, overrides: Record<string, string> = {}): string {
	return computeNodeModulesCacheKey(['win32', 'x64'], repository(overrides), part, DIRS);
}

suite('node_modules cache split', () => {
	test('splits the native directories from the JS-only ones', () => {
		assert.deepStrictEqual(DIRS.filter(isNativeDir), ['', 'build', 'remote', '.build/distro/npm', '.build/distro/npm/remote']);
		assert.ok(dirs.includes('') && dirs.includes('build') && dirs.includes('remote'));
		assert.ok(dirs.filter(dir => !isNativeDir(dir)).every(dir => !dir.startsWith('.build/')));
	});

	test('keeps the combined key independent of the Node.js version', () => {
		assert.strictEqual(key('all', { '.nvmrc': '24.1.0' }), key('all', { '.nvmrc': '24.2.0' }));
	});

	test('changes only the JS key when a JS-only lockfile changes', () => {
		const changed = { 'extensions/git/package-lock.json': 'new lock' };
		assert.strictEqual(key('native', changed), key('native'));
		assert.notStrictEqual(key('js', changed), key('js'));
	});

	test('changes only the native key when a native lockfile or the distro commit changes', () => {
		const nativeChanges: Record<string, string>[] = [{ 'remote/package-lock.json': 'new lock' }, { 'package.json': '{"distro":"d2"}' }, { '.build/distro/npm/remote/package-lock.json': 'new lock' }];
		for (const changed of nativeChanges) {
			assert.notStrictEqual(key('native', changed), key('native'));
			assert.strictEqual(key('js', changed), key('js'));
		}
	});

	test('changes both keys with the Node.js version, the npm configuration or the salt', () => {
		const sharedChanges: Record<string, string>[] = [{ '.nvmrc': 'new' }, { '.npmrc': 'target="99.0.0"' }, { 'build/.cachesalt': 'new' }];
		for (const changed of sharedChanges) {
			assert.notStrictEqual(key('native', changed), key('native'));
			assert.notStrictEqual(key('js', changed), key('js'));
		}
	});

	test('keeps the two halves and the combined key distinct', () => {
		assert.strictEqual(new Set([key('all'), key('native'), key('js')]).size, 3);
	});

	test('names the JS directories whose lockfile no longer matches a restored cache', () => {
		const cached = computeManifest(repository(), DIRS);
		assert.deepStrictEqual(Object.keys(cached), ['remote/web', 'extensions', 'extensions/git', 'test/smoke']);
		assert.deepStrictEqual(staleDirs(cached, computeManifest(repository(), DIRS)), []);
		assert.deepStrictEqual(staleDirs(cached, computeManifest(repository({ 'extensions/git/package-lock.json': 'new lock' }), DIRS)), ['extensions/git']);
		assert.deepStrictEqual(staleDirs(cached, computeManifest(repository(), [...DIRS, 'extensions/new'])), ['extensions/new']);
	});
});
