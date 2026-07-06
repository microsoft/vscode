/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileType } from '../fileSystem';
import { LocalFileSystem } from '../localFileSystem';
import { makeFsUri } from '../util/uri';

suite('LocalFileSystem', function () {
	let testDir: string;
	const defaultFileSystem = new LocalFileSystem();

	// only do all the file system work once for the suite
	suiteSetup(async function () {
		testDir = await mkdtemp(join(tmpdir(), 'copilot-unit-test-'));
		await mkdir(join(testDir, 'folder'));
		await symlink(join(testDir, 'folder'), join(testDir, 'folder-link'), 'dir');

		await writeFile(join(testDir, 'file'), '\n');
		await symlink(join(testDir, 'file'), join(testDir, 'file-link'));

		await writeFile(join(testDir, 'tempfile'), '');
		await symlink(join(testDir, 'tempfile'), join(testDir, 'dangling-link'));
		await rm(join(testDir, 'tempfile')); // leave the link dangling
	});

	suiteTeardown(async function () {
		await rm(testDir, { recursive: true });
	});

	test('.readDirectory returns correct entries', async function () {
		const result = await defaultFileSystem.readDirectory(makeFsUri(testDir));
		assert.strictEqual(result.length, 5);
		const target = [
			['folder', FileType.Directory],
			['folder-link', FileType.Directory | FileType.SymbolicLink],
			['file', FileType.File],
			['file-link', FileType.File | FileType.SymbolicLink],
			['dangling-link', FileType.Unknown],
		];
		for (const entry of target) {
			assert.ok(
				result.some(([name, type]) => name === entry[0] && type === entry[1]),
				`Expected entry ${entry[0]} with type ${entry[1]} not found in result`
			);
		}
	});

	test('.stat returns correct stats for a normal file', async function () {
		const fsStats = await stat(join(testDir, 'file'));
		const result = await defaultFileSystem.stat(makeFsUri(join(testDir, 'file')));

		assert.strictEqual(result.ctime, fsStats.ctimeMs);
		assert.strictEqual(result.mtime, fsStats.mtimeMs);
		assert.strictEqual(result.size, fsStats.size);
		assert.strictEqual(result.type, FileType.File);
	});

	test('.stat returns correct stats for a directory', async function () {
		const fsStats = await stat(join(testDir, 'folder'));
		const result = await defaultFileSystem.stat(makeFsUri(join(testDir, 'folder')));

		assert.strictEqual(result.ctime, fsStats.ctimeMs);
		assert.strictEqual(result.mtime, fsStats.mtimeMs);
		assert.strictEqual(result.size, fsStats.size);
		assert.strictEqual(result.type, FileType.Directory);
	});

	test('.stat returns target stats and combined type for link to file', async function () {
		const fsStats = await stat(join(testDir, 'file'));
		const result = await defaultFileSystem.stat(makeFsUri(join(testDir, 'file-link')));

		assert.strictEqual(result.ctime, fsStats.ctimeMs);
		assert.strictEqual(result.mtime, fsStats.mtimeMs);
		assert.strictEqual(result.size, fsStats.size);
		assert.strictEqual(result.type, FileType.File | FileType.SymbolicLink);
	});

	test('.stat returns target stats and combined type for link to directory', async function () {
		const fsStats = await stat(join(testDir, 'folder'));
		const result = await defaultFileSystem.stat(makeFsUri(join(testDir, 'folder-link')));

		assert.strictEqual(result.ctime, fsStats.ctimeMs);
		assert.strictEqual(result.mtime, fsStats.mtimeMs);
		assert.strictEqual(result.size, fsStats.size);
		assert.strictEqual(result.type, FileType.Directory | FileType.SymbolicLink);
	});

	test('.stat returns Unknown type for a dangling link', async function () {
		const result = await defaultFileSystem.stat(makeFsUri(join(testDir, 'dangling-link')));

		assert.strictEqual(result.type, FileType.Unknown);
	});
});
