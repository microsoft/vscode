/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import assert from 'assert';
import { tmpdir } from 'os';
import { createCancelablePromise } from '../../../common/async.js';
import { FileAccess } from '../../../common/network.js';
import * as path from '../../../common/path.js';
import { Promises } from '../../../node/pfs.js';
import { buffer, extract, zip } from '../../../node/zip.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../common/utils.js';
import { getRandomTestPath } from '../testUtils.js';

suite('Zip', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('extract should handle directories', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		await fs.promises.mkdir(testDir, { recursive: true });

		const fixtures = FileAccess.asFileUri('vs/base/test/node/zip/fixtures').fsPath;
		const fixture = path.join(fixtures, 'extract.zip');

		await createCancelablePromise(token => extract(fixture, testDir, {}, token));
		const doesExist = await Promises.exists(path.join(testDir, 'extension'));
		assert(doesExist);

		await Promises.rm(testDir);
	});

	test('zip should stream a fixed prefix of a local file', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		const sourcePath = path.join(testDir, 'source.txt');
		const zipPath = path.join(testDir, 'logs.zip');
		await fs.promises.mkdir(testDir, { recursive: true });
		await fs.promises.writeFile(sourcePath, 'snapshot-appended');
		await zip(zipPath, [{ path: 'source.txt', localPath: sourcePath, localPathSize: 8 }]);

		assert.strictEqual((await buffer(zipPath, 'source.txt')).toString(), 'snapshot');

		await Promises.rm(testDir);
	});

	test('zip should clamp a prefix larger than the current file size', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		const sourcePath = path.join(testDir, 'source.txt');
		const zipPath = path.join(testDir, 'logs.zip');
		await fs.promises.mkdir(testDir, { recursive: true });
		await fs.promises.writeFile(sourcePath, 'shrunk');
		// Request more bytes than the file holds: the entry contains the whole file.
		await zip(zipPath, [{ path: 'source.txt', localPath: sourcePath, localPathSize: 1024 }]);

		assert.strictEqual((await buffer(zipPath, 'source.txt')).toString(), 'shrunk');

		await Promises.rm(testDir);
	});

	test('zip should write an empty entry for a zero-length prefix', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		const sourcePath = path.join(testDir, 'source.txt');
		const zipPath = path.join(testDir, 'logs.zip');
		await fs.promises.mkdir(testDir, { recursive: true });
		await fs.promises.writeFile(sourcePath, 'ignored');
		await zip(zipPath, [{ path: 'source.txt', localPath: sourcePath, localPathSize: 0 }]);

		assert.strictEqual((await buffer(zipPath, 'source.txt')).toString(), '');

		await Promises.rm(testDir);
	});

	test('zip should skip a vanished streamed source without failing the archive', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		const presentPath = path.join(testDir, 'present.txt');
		const missingPath = path.join(testDir, 'missing.txt');
		const zipPath = path.join(testDir, 'logs.zip');
		await fs.promises.mkdir(testDir, { recursive: true });
		await fs.promises.writeFile(presentPath, 'present-contents');
		await zip(zipPath, [
			{ path: 'missing.txt', localPath: missingPath, localPathSize: 8 },
			{ path: 'present.txt', localPath: presentPath, localPathSize: 7 },
		]);

		assert.strictEqual((await buffer(zipPath, 'present.txt')).toString(), 'present');
		await assert.rejects(buffer(zipPath, 'missing.txt'));

		await Promises.rm(testDir);
	});
});
