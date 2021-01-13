/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join, sep } from 'vs/base/common/path';
import { generateUuid } from 'vs/base/common/uuid';
import { copy, mkdirp, move, readdir, readDirsInDir, readdirWithFileTypes, renameIgnoreError, rimraf, RimRafMode, rimrafSync, statLink, writeFile, writeFileSync } from 'vs/base/node/pfs';
import { timeout } from 'vs/base/common/async';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { isWindows } from 'vs/base/common/platform';
import { canNormalize } from 'vs/base/common/normalization';
import { VSBuffer } from 'vs/base/common/buffer';
import { flakySuite, getRandomTestPath } from 'vs/base/test/node/testUtils';

flakySuite('PFS', function () {

	test('writeFile', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);
		const testFile = join(newDir, 'writefile.txt');

		await mkdirp(newDir, 493);
		assert.ok(fs.existsSync(newDir));

		await writeFile(testFile, 'Hello World', (null!));
		assert.equal(fs.readFileSync(testFile), 'Hello World');

		await rimraf(parentDir);
	});

	test('writeFile - parallel write on different files works', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);
		const testFile1 = join(newDir, 'writefile1.txt');
		const testFile2 = join(newDir, 'writefile2.txt');
		const testFile3 = join(newDir, 'writefile3.txt');
		const testFile4 = join(newDir, 'writefile4.txt');
		const testFile5 = join(newDir, 'writefile5.txt');

		await mkdirp(newDir, 493);
		assert.ok(fs.existsSync(newDir));

		await Promise.all([
			writeFile(testFile1, 'Hello World 1', (null!)),
			writeFile(testFile2, 'Hello World 2', (null!)),
			writeFile(testFile3, 'Hello World 3', (null!)),
			writeFile(testFile4, 'Hello World 4', (null!)),
			writeFile(testFile5, 'Hello World 5', (null!))
		]);
		assert.equal(fs.readFileSync(testFile1), 'Hello World 1');
		assert.equal(fs.readFileSync(testFile2), 'Hello World 2');
		assert.equal(fs.readFileSync(testFile3), 'Hello World 3');
		assert.equal(fs.readFileSync(testFile4), 'Hello World 4');
		assert.equal(fs.readFileSync(testFile5), 'Hello World 5');

		await rimraf(parentDir);
	});

	test('writeFile - parallel write on same files works and is sequentalized', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);
		const testFile = join(newDir, 'writefile.txt');

		await mkdirp(newDir, 493);
		assert.ok(fs.existsSync(newDir));

		await Promise.all([
			writeFile(testFile, 'Hello World 1', undefined),
			writeFile(testFile, 'Hello World 2', undefined),
			timeout(10).then(() => writeFile(testFile, 'Hello World 3', undefined)),
			writeFile(testFile, 'Hello World 4', undefined),
			timeout(10).then(() => writeFile(testFile, 'Hello World 5', undefined))
		]);
		assert.equal(fs.readFileSync(testFile), 'Hello World 5');

		await rimraf(parentDir);
	});

	test('rimraf - simple - unlink', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);

		await mkdirp(newDir, 493);
		fs.writeFileSync(join(newDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(newDir, 'someOtherFile.txt'), 'Contents');

		await rimraf(newDir);
		assert.ok(!fs.existsSync(newDir));
	});

	test('rimraf - simple - move', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);

		await mkdirp(newDir, 493);
		fs.writeFileSync(join(newDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(newDir, 'someOtherFile.txt'), 'Contents');

		await rimraf(newDir, RimRafMode.MOVE);
		assert.ok(!fs.existsSync(newDir));
	});

	test('rimraf - recursive folder structure - unlink', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);

		await mkdirp(newDir, 493);
		fs.writeFileSync(join(newDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(newDir, 'someOtherFile.txt'), 'Contents');
		fs.mkdirSync(join(newDir, 'somefolder'));
		fs.writeFileSync(join(newDir, 'somefolder', 'somefile.txt'), 'Contents');

		await rimraf(newDir);
		assert.ok(!fs.existsSync(newDir));
	});

	test('rimraf - recursive folder structure - move', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);

		await mkdirp(newDir, 493);
		fs.writeFileSync(join(newDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(newDir, 'someOtherFile.txt'), 'Contents');
		fs.mkdirSync(join(newDir, 'somefolder'));
		fs.writeFileSync(join(newDir, 'somefolder', 'somefile.txt'), 'Contents');

		await rimraf(newDir, RimRafMode.MOVE);
		assert.ok(!fs.existsSync(newDir));
	});

	test('rimraf - simple ends with dot - move', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = `${generateUuid()}.`;
		const newDir = join(parentDir, 'pfs', id);

		await mkdirp(newDir, 493);
		fs.writeFileSync(join(newDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(newDir, 'someOtherFile.txt'), 'Contents');

		await rimraf(newDir, RimRafMode.MOVE);
		assert.ok(!fs.existsSync(newDir));
	});

	test('rimraf - simple ends with dot slash/backslash - move', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = `${generateUuid()}.`;
		const newDir = join(parentDir, 'pfs', id);

		await mkdirp(newDir, 493);
		fs.writeFileSync(join(newDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(newDir, 'someOtherFile.txt'), 'Contents');

		await rimraf(`${newDir}${sep}`, RimRafMode.MOVE);
		assert.ok(!fs.existsSync(newDir));
	});

	test('rimrafSync - swallows file not found error', function () {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);

		rimrafSync(newDir);

		assert.ok(!fs.existsSync(newDir));
	});

	test('rimrafSync - simple', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);

		await mkdirp(newDir, 493);

		fs.writeFileSync(join(newDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(newDir, 'someOtherFile.txt'), 'Contents');

		rimrafSync(newDir);

		assert.ok(!fs.existsSync(newDir));
	});

	test('rimrafSync - recursive folder structure', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);

		await mkdirp(newDir, 493);
		fs.writeFileSync(join(newDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(newDir, 'someOtherFile.txt'), 'Contents');

		fs.mkdirSync(join(newDir, 'somefolder'));
		fs.writeFileSync(join(newDir, 'somefolder', 'somefile.txt'), 'Contents');

		rimrafSync(newDir);

		assert.ok(!fs.existsSync(newDir));
	});

	test('moveIgnoreError', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);

		await mkdirp(newDir, 493);
		try {
			await renameIgnoreError(join(newDir, 'foo'), join(newDir, 'bar'));
			return rimraf(parentDir, RimRafMode.MOVE);
		}
		catch (error) {
			assert.fail(error);
		}
	});

	test('copy, move and delete', async () => {
		const id = generateUuid();
		const id2 = generateUuid();
		const sourceDir = getPathFromAmdModule(require, './fixtures');
		const parentDir = join(tmpdir(), 'vsctests', 'pfs');
		const targetDir = join(parentDir, id);
		const targetDir2 = join(parentDir, id2);

		await copy(sourceDir, targetDir);

		assert.ok(fs.existsSync(targetDir));
		assert.ok(fs.existsSync(join(targetDir, 'index.html')));
		assert.ok(fs.existsSync(join(targetDir, 'site.css')));
		assert.ok(fs.existsSync(join(targetDir, 'examples')));
		assert.ok(fs.statSync(join(targetDir, 'examples')).isDirectory());
		assert.ok(fs.existsSync(join(targetDir, 'examples', 'small.jxs')));

		await move(targetDir, targetDir2);

		assert.ok(!fs.existsSync(targetDir));
		assert.ok(fs.existsSync(targetDir2));
		assert.ok(fs.existsSync(join(targetDir2, 'index.html')));
		assert.ok(fs.existsSync(join(targetDir2, 'site.css')));
		assert.ok(fs.existsSync(join(targetDir2, 'examples')));
		assert.ok(fs.statSync(join(targetDir2, 'examples')).isDirectory());
		assert.ok(fs.existsSync(join(targetDir2, 'examples', 'small.jxs')));

		await move(join(targetDir2, 'index.html'), join(targetDir2, 'index_moved.html'));

		assert.ok(!fs.existsSync(join(targetDir2, 'index.html')));
		assert.ok(fs.existsSync(join(targetDir2, 'index_moved.html')));

		await rimraf(parentDir);

		assert.ok(!fs.existsSync(parentDir));
	});

	test('mkdirp', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);

		await mkdirp(newDir, 493);

		assert.ok(fs.existsSync(newDir));

		return rimraf(parentDir);
	});

	test('readDirsInDir', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);

		await mkdirp(newDir, 493);

		fs.mkdirSync(join(newDir, 'somefolder1'));
		fs.mkdirSync(join(newDir, 'somefolder2'));
		fs.mkdirSync(join(newDir, 'somefolder3'));
		fs.writeFileSync(join(newDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(newDir, 'someOtherFile.txt'), 'Contents');

		const result = await readDirsInDir(newDir);
		assert.equal(result.length, 3);
		assert.ok(result.indexOf('somefolder1') !== -1);
		assert.ok(result.indexOf('somefolder2') !== -1);
		assert.ok(result.indexOf('somefolder3') !== -1);

		await rimraf(newDir);
	});

	(isWindows ? test.skip : test)('stat link', async () => { // Symlinks are not the same on win, and we can not create them programmatically without admin privileges
		const id1 = generateUuid();
		const parentDir = join(tmpdir(), 'vsctests', id1);
		const directory = join(parentDir, 'pfs', id1);

		const id2 = generateUuid();
		const symbolicLink = join(parentDir, 'pfs', id2);

		await mkdirp(directory, 493);

		fs.symlinkSync(directory, symbolicLink);

		let statAndIsLink = await statLink(directory);
		assert.ok(!statAndIsLink?.symbolicLink);

		statAndIsLink = await statLink(symbolicLink);
		assert.ok(statAndIsLink?.symbolicLink);
		assert.ok(!statAndIsLink?.symbolicLink?.dangling);

		rimrafSync(directory);
	});

	(isWindows ? test.skip : test)('stat link (non existing target)', async () => { // Symlinks are not the same on win, and we can not create them programmatically without admin privileges
		const id1 = generateUuid();
		const parentDir = join(tmpdir(), 'vsctests', id1);
		const directory = join(parentDir, 'pfs', id1);

		const id2 = generateUuid();
		const symbolicLink = join(parentDir, 'pfs', id2);

		await mkdirp(directory, 493);

		fs.symlinkSync(directory, symbolicLink);

		rimrafSync(directory);

		const statAndIsLink = await statLink(symbolicLink);
		assert.ok(statAndIsLink?.symbolicLink);
		assert.ok(statAndIsLink?.symbolicLink?.dangling);
	});

	test('readdir', async () => {
		if (canNormalize && typeof process.versions['electron'] !== 'undefined' /* needs electron */) {
			const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
			const id = generateUuid();
			const newDir = join(parentDir, 'pfs', id, 'öäü');

			await mkdirp(newDir, 493);

			assert.ok(fs.existsSync(newDir));

			const children = await readdir(join(parentDir, 'pfs', id));
			assert.equal(children.some(n => n === 'öäü'), true); // Mac always converts to NFD, so

			await rimraf(parentDir);
		}
	});

	test('readdirWithFileTypes', async () => {
		if (canNormalize && typeof process.versions['electron'] !== 'undefined' /* needs electron */) {
			const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
			const id = generateUuid();
			const testDir = join(parentDir, 'pfs', id);

			const newDir = join(testDir, 'öäü');
			await mkdirp(newDir, 493);

			await writeFile(join(testDir, 'somefile.txt'), 'contents');

			assert.ok(fs.existsSync(newDir));

			const children = await readdirWithFileTypes(testDir);

			assert.equal(children.some(n => n.name === 'öäü'), true); // Mac always converts to NFD, so
			assert.equal(children.some(n => n.isDirectory()), true);

			assert.equal(children.some(n => n.name === 'somefile.txt'), true);
			assert.equal(children.some(n => n.isFile()), true);

			await rimraf(parentDir);
		}
	});

	test('writeFile (string)', async () => {
		const smallData = 'Hello World';
		const bigData = (new Array(100 * 1024)).join('Large String\n');

		return testWriteFileAndFlush(smallData, smallData, bigData, bigData);
	});

	test('writeFile (Buffer)', async () => {
		const smallData = 'Hello World';
		const bigData = (new Array(100 * 1024)).join('Large String\n');

		return testWriteFileAndFlush(Buffer.from(smallData), smallData, Buffer.from(bigData), bigData);
	});

	test('writeFile (UInt8Array)', async () => {
		const smallData = 'Hello World';
		const bigData = (new Array(100 * 1024)).join('Large String\n');

		return testWriteFileAndFlush(VSBuffer.fromString(smallData).buffer, smallData, VSBuffer.fromString(bigData).buffer, bigData);
	});

	async function testWriteFileAndFlush(
		smallData: string | Buffer | Uint8Array,
		smallDataValue: string,
		bigData: string | Buffer | Uint8Array,
		bigDataValue: string
	): Promise<void> {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);
		const testFile = join(newDir, 'flushed.txt');

		await mkdirp(newDir, 493);
		assert.ok(fs.existsSync(newDir));

		await writeFile(testFile, smallData);
		assert.equal(fs.readFileSync(testFile), smallDataValue);

		await writeFile(testFile, bigData);
		assert.equal(fs.readFileSync(testFile), bigDataValue);

		await rimraf(parentDir);
	}

	test('writeFile (string, error handling)', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);
		const testFile = join(newDir, 'flushed.txt');

		await mkdirp(newDir, 493);

		assert.ok(fs.existsSync(newDir));

		fs.mkdirSync(testFile); // this will trigger an error because testFile is now a directory!

		let expectedError: Error | undefined;
		try {
			await writeFile(testFile, 'Hello World');
		} catch (error) {
			expectedError = error;
		}

		assert.ok(expectedError);

		await rimraf(parentDir);
	});

	test('writeFileSync', async () => {
		const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');
		const id = generateUuid();
		const newDir = join(parentDir, 'pfs', id);
		const testFile = join(newDir, 'flushed.txt');

		await mkdirp(newDir, 493);

		assert.ok(fs.existsSync(newDir));

		writeFileSync(testFile, 'Hello World');
		assert.equal(fs.readFileSync(testFile), 'Hello World');

		const largeString = (new Array(100 * 1024)).join('Large String\n');

		writeFileSync(testFile, largeString);
		assert.equal(fs.readFileSync(testFile), largeString);

		await rimraf(parentDir);
	});
});
