/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: node --test scripts/code-oss-launcher/lib/profileCopy.test.ts

import assert from 'node:assert/strict';
import { mkdtempSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { isExcludedFromProfileCopy, syncExtensions, syncTree, UnknownExtensionsError } from './profileCopy.ts';

suite('isExcludedFromProfileCopy', () => {
	test('matches top-level, nested and name patterns', () => {
		const paths = [
			'extensions', 'User/extensions',
			'workspaceStorage', 'User/workspaceStorage', 'Other/User/workspaceStorage',
			'User/History', 'User/globalStorage/state.vscdb',
			'logs', 'User/logs',
			'Cache', 'Partitions/vscode-browser/Cache', 'Partitions/other/Cache',
			'DawnGraphiteCache', 'DawnWebGPUCache', 'Partitions/vscode-browser/DawnWebGPUCache',
			'SingletonLock', 'User/SingletonLock',
			'code.lock', 'User/globalStorage/x.lock', 'main.sock',
			'Local State', 'Network/Cookies', 'machineid',
		];
		assert.deepStrictEqual(Object.fromEntries(paths.map(relative => [relative, isExcludedFromProfileCopy(relative.split('/'))])), {
			'extensions': true, 'User/extensions': false,
			'workspaceStorage': true, 'User/workspaceStorage': true, 'Other/User/workspaceStorage': true,
			'User/History': true, 'User/globalStorage/state.vscdb': false,
			'logs': true, 'User/logs': false,
			'Cache': true, 'Partitions/vscode-browser/Cache': true, 'Partitions/other/Cache': false,
			'DawnGraphiteCache': true, 'DawnWebGPUCache': true, 'Partitions/vscode-browser/DawnWebGPUCache': true,
			'SingletonLock': true, 'User/SingletonLock': false,
			'code.lock': true, 'User/globalStorage/x.lock': true, 'main.sock': true,
			'Local State': false, 'Network/Cookies': false, 'machineid': false,
		});
	});
});

suite('sync', () => {
	let root: string;
	beforeEach(() => { root = mkdtempSync(path.join(import.meta.dirname, '.profile-copy-test-')); });
	afterEach(() => fs.rm(root, { recursive: true, force: true }));

	async function write(relative: string, content: string, mtime = new Date(2026, 0, 1)): Promise<void> {
		const file = path.join(root, relative);
		await fs.mkdir(path.dirname(file), { recursive: true });
		await fs.writeFile(file, content);
		await fs.utimes(file, mtime, mtime);
	}

	async function readTree(directory: string): Promise<Record<string, string>> {
		const entries = await fs.readdir(path.join(root, directory), { recursive: true, withFileTypes: true });
		const files = entries.filter(entry => entry.isFile()).map(entry => path.join(entry.parentPath, entry.name));
		return Object.fromEntries(await Promise.all(files.sort().map(async file => [path.relative(path.join(root, directory), file).replaceAll('\\', '/'), await fs.readFile(file, 'utf8')])));
	}

	test('copies, then syncs only changes and keeps files created in the copy', async () => {
		await write('source/User/settings.json', 'settings');
		await write('source/User/globalStorage/state.vscdb', 'state');
		await write('source/logs/main.log', 'excluded');
		await write('source/removed.txt', 'removed later');
		const copy = await syncTree(path.join(root, 'source'), path.join(root, 'copy'), undefined, isExcludedFromProfileCopy);
		const afterCopy = await readTree('copy');

		await write('source/User/settings.json', 'changed in source', new Date(2026, 0, 2));
		await write('copy/User/globalStorage/state.vscdb', 'changed by Code', new Date(2026, 0, 3));
		await write('copy/Cache/data', 'created by Code');
		await fs.rm(path.join(root, 'source/removed.txt'));
		const sync = await syncTree(path.join(root, 'source'), path.join(root, 'copy'), copy.manifest, isExcludedFromProfileCopy);

		assert.deepStrictEqual({ copied: copy.copiedFiles, afterCopy, synced: { copied: sync.copiedFiles, deleted: sync.deletedFiles }, afterSync: await readTree('copy') }, {
			copied: 3,
			afterCopy: { 'User/globalStorage/state.vscdb': 'state', 'User/settings.json': 'settings', 'removed.txt': 'removed later' },
			synced: { copied: 2, deleted: 1 },
			afterSync: { 'Cache/data': 'created by Code', 'User/globalStorage/state.vscdb': 'state', 'User/settings.json': 'changed in source' },
		});
	});

	test('copies selected extensions with a filtered manifest and replaces unselected ones', async () => {
		const manifest = [
			{ identifier: { id: 'pub.a' }, relativeLocation: 'pub.a-1.0.0' },
			{ identifier: { id: 'pub.big' }, relativeLocation: 'pub.big-2.0.0' },
			{ identifier: { id: 'pub.linked' }, location: { fsPath: '/dev/linked' } },
		];
		await write('source/extensions.json', JSON.stringify(manifest));
		await write('source/.obsolete', '{}');
		await write('source/pub.a-1.0.0/package.json', 'a');
		await write('source/pub.big-2.0.0/node_modules/x/index.js', 'big');
		const source = path.join(root, 'source');
		const destination = path.join(root, 'destination');

		const all = await syncExtensions(source, destination, { kind: 'all' }, undefined);
		const selected = await syncExtensions(source, destination, { kind: 'ids', ids: ['PUB.A', 'pub.linked'] }, all);
		const destinationFiles = await readTree('destination');
		const unknown = await syncExtensions(source, destination, { kind: 'ids', ids: ['pub.a', 'pub.missing'] }, selected).catch(error => error);

		assert.deepStrictEqual({
			all,
			selected,
			files: Object.keys(destinationFiles),
			manifest: JSON.parse(destinationFiles['extensions.json']).map((entry: { identifier: { id: string } }) => entry.identifier.id),
			unknown: unknown instanceof UnknownExtensionsError ? { unknownIds: unknown.unknownIds, installedIds: unknown.installedIds } : unknown,
		}, {
			all: ['pub.a-1.0.0', 'pub.big-2.0.0'],
			selected: ['pub.a-1.0.0'],
			files: ['.obsolete', 'extensions.json', 'pub.a-1.0.0/package.json'],
			manifest: ['pub.a', 'pub.linked'],
			unknown: { unknownIds: ['pub.missing'], installedIds: ['pub.a', 'pub.big', 'pub.linked'] },
		});
	});
});
