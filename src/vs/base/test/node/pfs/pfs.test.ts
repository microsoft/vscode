/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';

import * as path from 'vs/base/common/path';
import * as fs from 'fs';

import * as uuid from 'vs/base/common/uuid';
import * as pfs from 'vs/base/node/pfs';
import { timeout } from 'vs/base/common/async';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { CancellationTokenSource } from 'vs/base/common/cancellation';

suite('PFS', () => {

	test('writeFile', async () => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'pfs', id);
		const testFile = path.join(newDir, 'writefile.txt');

		await pfs.mkdirp(newDir, 493);
		assert.ok(fs.existsSync(newDir));

		await pfs.writeFile(testFile, 'Hello World', (null!));
		assert.equal(fs.readFileSync(testFile), 'Hello World');

		await pfs.del(parentDir, os.tmpdir());
	});

	test('writeFile - parallel write on different files works', async () => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'pfs', id);
		const testFile1 = path.join(newDir, 'writefile1.txt');
		const testFile2 = path.join(newDir, 'writefile2.txt');
		const testFile3 = path.join(newDir, 'writefile3.txt');
		const testFile4 = path.join(newDir, 'writefile4.txt');
		const testFile5 = path.join(newDir, 'writefile5.txt');

		await pfs.mkdirp(newDir, 493);
		assert.ok(fs.existsSync(newDir));

		await Promise.all([
			pfs.writeFile(testFile1, 'Hello World 1', (null!)),
			pfs.writeFile(testFile2, 'Hello World 2', (null!)),
			pfs.writeFile(testFile3, 'Hello World 3', (null!)),
			pfs.writeFile(testFile4, 'Hello World 4', (null!)),
			pfs.writeFile(testFile5, 'Hello World 5', (null!))
		]);
		assert.equal(fs.readFileSync(testFile1), 'Hello World 1');
		assert.equal(fs.readFileSync(testFile2), 'Hello World 2');
		assert.equal(fs.readFileSync(testFile3), 'Hello World 3');
		assert.equal(fs.readFileSync(testFile4), 'Hello World 4');
		assert.equal(fs.readFileSync(testFile5), 'Hello World 5');

		await pfs.del(parentDir, os.tmpdir());
	});

	test('writeFile - parallel write on same files works and is sequentalized', async () => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'pfs', id);
		const testFile = path.join(newDir, 'writefile.txt');

		await pfs.mkdirp(newDir, 493);
		assert.ok(fs.existsSync(newDir));

		await Promise.all([
			pfs.writeFile(testFile, 'Hello World 1', undefined),
			pfs.writeFile(testFile, 'Hello World 2', undefined),
			timeout(10).then(() => pfs.writeFile(testFile, 'Hello World 3', undefined)),
			pfs.writeFile(testFile, 'Hello World 4', undefined),
			timeout(10).then(() => pfs.writeFile(testFile, 'Hello World 5', undefined))
		]);
		assert.equal(fs.readFileSync(testFile), 'Hello World 5');

		await pfs.del(parentDir, os.tmpdir());
	});

	test('rimraf - simple', async () => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		await pfs.mkdirp(newDir, 493);
		fs.writeFileSync(path.join(newDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(path.join(newDir, 'someOtherFile.txt'), 'Contents');

		await pfs.rimraf(newDir);
		assert.ok(!fs.existsSync(newDir));
	});

	test('rimraf - recursive folder structure', async () => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		await pfs.mkdirp(newDir, 493);
		fs.writeFileSync(path.join(newDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(path.join(newDir, 'someOtherFile.txt'), 'Contents');
		fs.mkdirSync(path.join(newDir, 'somefolder'));
		fs.writeFileSync(path.join(newDir, 'somefolder', 'somefile.txt'), 'Contents');

		await pfs.rimraf(newDir);
		assert.ok(!fs.existsSync(newDir));
	});

	test('moveIgnoreError', async () => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		await pfs.mkdirp(newDir, 493);
		try {
			await pfs.renameIgnoreError(path.join(newDir, 'foo'), path.join(newDir, 'bar'));
			return pfs.del(parentDir, os.tmpdir());
		}
		catch (error) {
			assert.fail(error);
			return Promise.reject(error);
		}
	});

	test('copy, move and delete', async () => {
		const id = uuid.generateUuid();
		const id2 = uuid.generateUuid();
		const sourceDir = getPathFromAmdModule(require, './fixtures');
		const parentDir = path.join(os.tmpdir(), 'vsctests', 'extfs');
		const targetDir = path.join(parentDir, id);
		const targetDir2 = path.join(parentDir, id2);

		await pfs.copy(sourceDir, targetDir);

		assert.ok(fs.existsSync(targetDir));
		assert.ok(fs.existsSync(path.join(targetDir, 'index.html')));
		assert.ok(fs.existsSync(path.join(targetDir, 'site.css')));
		assert.ok(fs.existsSync(path.join(targetDir, 'examples')));
		assert.ok(fs.statSync(path.join(targetDir, 'examples')).isDirectory());
		assert.ok(fs.existsSync(path.join(targetDir, 'examples', 'small.jxs')));

		await pfs.move(targetDir, targetDir2);

		assert.ok(!fs.existsSync(targetDir));
		assert.ok(fs.existsSync(targetDir2));
		assert.ok(fs.existsSync(path.join(targetDir2, 'index.html')));
		assert.ok(fs.existsSync(path.join(targetDir2, 'site.css')));
		assert.ok(fs.existsSync(path.join(targetDir2, 'examples')));
		assert.ok(fs.statSync(path.join(targetDir2, 'examples')).isDirectory());
		assert.ok(fs.existsSync(path.join(targetDir2, 'examples', 'small.jxs')));

		await pfs.move(path.join(targetDir2, 'index.html'), path.join(targetDir2, 'index_moved.html'));

		assert.ok(!fs.existsSync(path.join(targetDir2, 'index.html')));
		assert.ok(fs.existsSync(path.join(targetDir2, 'index_moved.html')));

		await pfs.del(parentDir, os.tmpdir());

		assert.ok(!fs.existsSync(parentDir));
	});

	test('mkdirp', async () => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		await pfs.mkdirp(newDir, 493);

		assert.ok(fs.existsSync(newDir));

		return pfs.del(parentDir, os.tmpdir());
	});

	test('mkdirp cancellation', async () => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		const source = new CancellationTokenSource();

		const mkdirpPromise = pfs.mkdirp(newDir, 493, source.token);
		source.cancel();

		await mkdirpPromise;

		assert.ok(!fs.existsSync(newDir));

		return pfs.del(parentDir, os.tmpdir());
	});
});
