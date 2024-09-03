/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { timeout } from '../../../common/async.js';
import { VSBuffer } from '../../../common/buffer.js';
import { randomPath } from '../../../common/extpath.js';
import { FileAccess } from '../../../common/network.js';
import { basename, dirname, join, sep } from '../../../common/path.js';
import { isWindows } from '../../../common/platform.js';
import { configureFlushOnWrite, Promises, RimRafMode, rimrafSync, SymlinkSupport, writeFileSync } from '../../../node/pfs.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../common/utils.js';
import { flakySuite, getRandomTestPath } from '../testUtils.js';
import { isESM } from '../../../common/amd.js';

configureFlushOnWrite(false); // speed up all unit tests by disabling flush on write

flakySuite('PFS', function () {

	let testDir: string;

	setup(() => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'pfs');

		return fs.promises.mkdir(testDir, { recursive: true });
	});

	teardown(() => {
		return Promises.rm(testDir);
	});

	test('writeFile', async () => {
		const testFile = join(testDir, 'writefile.txt');

		assert.ok(!(await Promises.exists(testFile)));

		await Promises.writeFile(testFile, 'Hello World', (null!));

		assert.strictEqual((await fs.promises.readFile(testFile)).toString(), 'Hello World');
	});

	test('writeFile - parallel write on different files works', async () => {
		const testFile1 = join(testDir, 'writefile1.txt');
		const testFile2 = join(testDir, 'writefile2.txt');
		const testFile3 = join(testDir, 'writefile3.txt');
		const testFile4 = join(testDir, 'writefile4.txt');
		const testFile5 = join(testDir, 'writefile5.txt');

		await Promise.all([
			Promises.writeFile(testFile1, 'Hello World 1', (null!)),
			Promises.writeFile(testFile2, 'Hello World 2', (null!)),
			Promises.writeFile(testFile3, 'Hello World 3', (null!)),
			Promises.writeFile(testFile4, 'Hello World 4', (null!)),
			Promises.writeFile(testFile5, 'Hello World 5', (null!))
		]);
		assert.strictEqual(fs.readFileSync(testFile1).toString(), 'Hello World 1');
		assert.strictEqual(fs.readFileSync(testFile2).toString(), 'Hello World 2');
		assert.strictEqual(fs.readFileSync(testFile3).toString(), 'Hello World 3');
		assert.strictEqual(fs.readFileSync(testFile4).toString(), 'Hello World 4');
		assert.strictEqual(fs.readFileSync(testFile5).toString(), 'Hello World 5');
	});

	test('writeFile - parallel write on same files works and is sequentalized', async () => {
		const testFile = join(testDir, 'writefile.txt');

		await Promise.all([
			Promises.writeFile(testFile, 'Hello World 1', undefined),
			Promises.writeFile(testFile, 'Hello World 2', undefined),
			timeout(10).then(() => Promises.writeFile(testFile, 'Hello World 3', undefined)),
			Promises.writeFile(testFile, 'Hello World 4', undefined),
			timeout(10).then(() => Promises.writeFile(testFile, 'Hello World 5', undefined))
		]);
		assert.strictEqual(fs.readFileSync(testFile).toString(), 'Hello World 5');
	});

	test('rimraf - simple - unlink', async () => {
		fs.writeFileSync(join(testDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(testDir, 'someOtherFile.txt'), 'Contents');

		await Promises.rm(testDir);
		assert.ok(!fs.existsSync(testDir));
	});

	test('rimraf - simple - move', async () => {
		fs.writeFileSync(join(testDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(testDir, 'someOtherFile.txt'), 'Contents');

		await Promises.rm(testDir, RimRafMode.MOVE);
		assert.ok(!fs.existsSync(testDir));
	});

	test('rimraf - simple - move (with moveToPath)', async () => {
		fs.writeFileSync(join(testDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(testDir, 'someOtherFile.txt'), 'Contents');

		await Promises.rm(testDir, RimRafMode.MOVE, join(dirname(testDir), `${basename(testDir)}.vsctmp`));
		assert.ok(!fs.existsSync(testDir));
	});

	test('rimraf - path does not exist - move', async () => {
		const nonExistingDir = join(testDir, 'unknown-move');
		await Promises.rm(nonExistingDir, RimRafMode.MOVE);
	});

	test('rimraf - path does not exist - unlink', async () => {
		const nonExistingDir = join(testDir, 'unknown-unlink');
		await Promises.rm(nonExistingDir, RimRafMode.UNLINK);
	});

	test('rimraf - recursive folder structure - unlink', async () => {
		fs.writeFileSync(join(testDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(testDir, 'someOtherFile.txt'), 'Contents');
		fs.mkdirSync(join(testDir, 'somefolder'));
		fs.writeFileSync(join(testDir, 'somefolder', 'somefile.txt'), 'Contents');

		await Promises.rm(testDir);
		assert.ok(!fs.existsSync(testDir));
	});

	test('rimraf - recursive folder structure - move', async () => {
		fs.writeFileSync(join(testDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(testDir, 'someOtherFile.txt'), 'Contents');
		fs.mkdirSync(join(testDir, 'somefolder'));
		fs.writeFileSync(join(testDir, 'somefolder', 'somefile.txt'), 'Contents');

		await Promises.rm(testDir, RimRafMode.MOVE);
		assert.ok(!fs.existsSync(testDir));
	});

	test('rimraf - simple ends with dot - move', async () => {
		fs.writeFileSync(join(testDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(testDir, 'someOtherFile.txt'), 'Contents');

		await Promises.rm(testDir, RimRafMode.MOVE);
		assert.ok(!fs.existsSync(testDir));
	});

	test('rimraf - simple ends with dot slash/backslash - move', async () => {
		fs.writeFileSync(join(testDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(testDir, 'someOtherFile.txt'), 'Contents');

		await Promises.rm(`${testDir}${sep}`, RimRafMode.MOVE);
		assert.ok(!fs.existsSync(testDir));
	});

	test('rimrafSync - swallows file not found error', function () {
		const nonExistingDir = join(testDir, 'not-existing');
		rimrafSync(nonExistingDir);

		assert.ok(!fs.existsSync(nonExistingDir));
	});

	test('rimrafSync - simple', async () => {
		fs.writeFileSync(join(testDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(testDir, 'someOtherFile.txt'), 'Contents');

		rimrafSync(testDir);

		assert.ok(!fs.existsSync(testDir));
	});

	test('rimrafSync - recursive folder structure', async () => {
		fs.writeFileSync(join(testDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(testDir, 'someOtherFile.txt'), 'Contents');

		fs.mkdirSync(join(testDir, 'somefolder'));
		fs.writeFileSync(join(testDir, 'somefolder', 'somefile.txt'), 'Contents');

		rimrafSync(testDir);

		assert.ok(!fs.existsSync(testDir));
	});

	(!isESM ? test.skip : test /* somehow fails in AMD with ENOENT for fixtures dir */)('copy, rename and delete', async () => {
		const sourceDir = FileAccess.asFileUri('vs/base/test/node/pfs/fixtures').fsPath;
		const parentDir = join(tmpdir(), 'vsctests', 'pfs');
		const targetDir = randomPath(parentDir);
		const targetDir2 = randomPath(parentDir);

		await Promises.copy(sourceDir, targetDir, { preserveSymlinks: true });

		assert.ok(fs.existsSync(targetDir));
		assert.ok(fs.existsSync(join(targetDir, 'index.html')));
		assert.ok(fs.existsSync(join(targetDir, 'site.css')));
		assert.ok(fs.existsSync(join(targetDir, 'examples')));
		assert.ok(fs.statSync(join(targetDir, 'examples')).isDirectory());
		assert.ok(fs.existsSync(join(targetDir, 'examples', 'small.jxs')));

		await Promises.rename(targetDir, targetDir2);

		assert.ok(!fs.existsSync(targetDir));
		assert.ok(fs.existsSync(targetDir2));
		assert.ok(fs.existsSync(join(targetDir2, 'index.html')));
		assert.ok(fs.existsSync(join(targetDir2, 'site.css')));
		assert.ok(fs.existsSync(join(targetDir2, 'examples')));
		assert.ok(fs.statSync(join(targetDir2, 'examples')).isDirectory());
		assert.ok(fs.existsSync(join(targetDir2, 'examples', 'small.jxs')));

		await Promises.rename(join(targetDir2, 'index.html'), join(targetDir2, 'index_moved.html'));

		assert.ok(!fs.existsSync(join(targetDir2, 'index.html')));
		assert.ok(fs.existsSync(join(targetDir2, 'index_moved.html')));

		await Promises.rm(parentDir);

		assert.ok(!fs.existsSync(parentDir));
	});

	(!isESM ? test.skip : test /* somehow fails in AMD with ENOENT for fixtures dir */)('rename without retry', async () => {
		const sourceDir = FileAccess.asFileUri('vs/base/test/node/pfs/fixtures').fsPath;
		const parentDir = join(tmpdir(), 'vsctests', 'pfs');
		const targetDir = randomPath(parentDir);
		const targetDir2 = randomPath(parentDir);

		await Promises.copy(sourceDir, targetDir, { preserveSymlinks: true });
		await Promises.rename(targetDir, targetDir2, false);

		assert.ok(!fs.existsSync(targetDir));
		assert.ok(fs.existsSync(targetDir2));
		assert.ok(fs.existsSync(join(targetDir2, 'index.html')));
		assert.ok(fs.existsSync(join(targetDir2, 'site.css')));
		assert.ok(fs.existsSync(join(targetDir2, 'examples')));
		assert.ok(fs.statSync(join(targetDir2, 'examples')).isDirectory());
		assert.ok(fs.existsSync(join(targetDir2, 'examples', 'small.jxs')));

		await Promises.rename(join(targetDir2, 'index.html'), join(targetDir2, 'index_moved.html'), false);

		assert.ok(!fs.existsSync(join(targetDir2, 'index.html')));
		assert.ok(fs.existsSync(join(targetDir2, 'index_moved.html')));

		await Promises.rm(parentDir);

		assert.ok(!fs.existsSync(parentDir));
	});

	test('copy handles symbolic links', async () => {
		const symbolicLinkTarget = randomPath(testDir);
		const symLink = randomPath(testDir);
		const copyTarget = randomPath(testDir);

		await fs.promises.mkdir(symbolicLinkTarget, { recursive: true });

		fs.symlinkSync(symbolicLinkTarget, symLink, 'junction');

		// Copy preserves symlinks if configured as such
		//
		// Windows: this test does not work because creating symlinks
		// requires priviledged permissions (admin).
		if (!isWindows) {
			await Promises.copy(symLink, copyTarget, { preserveSymlinks: true });

			assert.ok(fs.existsSync(copyTarget));

			const { symbolicLink } = await SymlinkSupport.stat(copyTarget);
			assert.ok(symbolicLink);
			assert.ok(!symbolicLink.dangling);

			const target = await fs.promises.readlink(copyTarget);
			assert.strictEqual(target, symbolicLinkTarget);

			// Copy does not preserve symlinks if configured as such

			await Promises.rm(copyTarget);
			await Promises.copy(symLink, copyTarget, { preserveSymlinks: false });

			assert.ok(fs.existsSync(copyTarget));

			const { symbolicLink: symbolicLink2 } = await SymlinkSupport.stat(copyTarget);
			assert.ok(!symbolicLink2);
		}

		// Copy does not fail over dangling symlinks

		await Promises.rm(copyTarget);
		await Promises.rm(symbolicLinkTarget);

		await Promises.copy(symLink, copyTarget, { preserveSymlinks: true }); // this should not throw

		if (!isWindows) {
			const { symbolicLink } = await SymlinkSupport.stat(copyTarget);
			assert.ok(symbolicLink?.dangling);
		} else {
			assert.ok(!fs.existsSync(copyTarget));
		}
	});

	test('copy handles symbolic links when the reference is inside source', async () => {

		// Source Folder
		const sourceFolder = join(randomPath(testDir), 'copy-test'); 		// copy-test
		const sourceLinkTestFolder = join(sourceFolder, 'link-test');		// copy-test/link-test
		const sourceLinkMD5JSFolder = join(sourceLinkTestFolder, 'md5');	// copy-test/link-test/md5
		const sourceLinkMD5JSFile = join(sourceLinkMD5JSFolder, 'md5.js');	// copy-test/link-test/md5/md5.js
		await fs.promises.mkdir(sourceLinkMD5JSFolder, { recursive: true });
		await Promises.writeFile(sourceLinkMD5JSFile, 'Hello from MD5');

		const sourceLinkMD5JSFolderLinked = join(sourceLinkTestFolder, 'md5-linked');	// copy-test/link-test/md5-linked
		fs.symlinkSync(sourceLinkMD5JSFolder, sourceLinkMD5JSFolderLinked, 'junction');

		// Target Folder
		const targetLinkTestFolder = join(sourceFolder, 'link-test copy');				// copy-test/link-test copy
		const targetLinkMD5JSFolder = join(targetLinkTestFolder, 'md5');				// copy-test/link-test copy/md5
		const targetLinkMD5JSFile = join(targetLinkMD5JSFolder, 'md5.js');				// copy-test/link-test copy/md5/md5.js
		const targetLinkMD5JSFolderLinked = join(targetLinkTestFolder, 'md5-linked');	// copy-test/link-test copy/md5-linked

		// Copy with `preserveSymlinks: true` and verify result
		//
		// Windows: this test does not work because creating symlinks
		// requires priviledged permissions (admin).
		if (!isWindows) {
			await Promises.copy(sourceLinkTestFolder, targetLinkTestFolder, { preserveSymlinks: true });

			assert.ok(fs.existsSync(targetLinkTestFolder));
			assert.ok(fs.existsSync(targetLinkMD5JSFolder));
			assert.ok(fs.existsSync(targetLinkMD5JSFile));
			assert.ok(fs.existsSync(targetLinkMD5JSFolderLinked));
			assert.ok(fs.lstatSync(targetLinkMD5JSFolderLinked).isSymbolicLink());

			const linkTarget = await fs.promises.readlink(targetLinkMD5JSFolderLinked);
			assert.strictEqual(linkTarget, targetLinkMD5JSFolder);

			await Promises.rm(targetLinkTestFolder);
		}

		// Copy with `preserveSymlinks: false` and verify result
		await Promises.copy(sourceLinkTestFolder, targetLinkTestFolder, { preserveSymlinks: false });

		assert.ok(fs.existsSync(targetLinkTestFolder));
		assert.ok(fs.existsSync(targetLinkMD5JSFolder));
		assert.ok(fs.existsSync(targetLinkMD5JSFile));
		assert.ok(fs.existsSync(targetLinkMD5JSFolderLinked));
		assert.ok(fs.lstatSync(targetLinkMD5JSFolderLinked).isDirectory());
	});

	test('readDirsInDir', async () => {
		fs.mkdirSync(join(testDir, 'somefolder1'));
		fs.mkdirSync(join(testDir, 'somefolder2'));
		fs.mkdirSync(join(testDir, 'somefolder3'));
		fs.writeFileSync(join(testDir, 'somefile.txt'), 'Contents');
		fs.writeFileSync(join(testDir, 'someOtherFile.txt'), 'Contents');

		const result = await Promises.readDirsInDir(testDir);
		assert.strictEqual(result.length, 3);
		assert.ok(result.indexOf('somefolder1') !== -1);
		assert.ok(result.indexOf('somefolder2') !== -1);
		assert.ok(result.indexOf('somefolder3') !== -1);
	});

	test('stat link', async () => {
		const directory = randomPath(testDir);
		const symbolicLink = randomPath(testDir);

		await fs.promises.mkdir(directory, { recursive: true });

		fs.symlinkSync(directory, symbolicLink, 'junction');

		let statAndIsLink = await SymlinkSupport.stat(directory);
		assert.ok(!statAndIsLink?.symbolicLink);

		statAndIsLink = await SymlinkSupport.stat(symbolicLink);
		assert.ok(statAndIsLink?.symbolicLink);
		assert.ok(!statAndIsLink?.symbolicLink?.dangling);
	});

	test('stat link (non existing target)', async () => {
		const directory = randomPath(testDir);
		const symbolicLink = randomPath(testDir);

		await fs.promises.mkdir(directory, { recursive: true });

		fs.symlinkSync(directory, symbolicLink, 'junction');

		await Promises.rm(directory);

		const statAndIsLink = await SymlinkSupport.stat(symbolicLink);
		assert.ok(statAndIsLink?.symbolicLink);
		assert.ok(statAndIsLink?.symbolicLink?.dangling);
	});

	test('readdir', async () => {
		if (typeof process.versions['electron'] !== 'undefined' /* needs electron */) {
			const parent = randomPath(join(testDir, 'pfs'));
			const newDir = join(parent, 'öäü');

			await fs.promises.mkdir(newDir, { recursive: true });

			assert.ok(fs.existsSync(newDir));

			const children = await Promises.readdir(parent);
			assert.strictEqual(children.some(n => n === 'öäü'), true); // Mac always converts to NFD, so
		}
	});

	test('readdir (with file types)', async () => {
		if (typeof process.versions['electron'] !== 'undefined' /* needs electron */) {
			const newDir = join(testDir, 'öäü');
			await fs.promises.mkdir(newDir, { recursive: true });

			await Promises.writeFile(join(testDir, 'somefile.txt'), 'contents');

			assert.ok(fs.existsSync(newDir));

			const children = await Promises.readdir(testDir, { withFileTypes: true });

			assert.strictEqual(children.some(n => n.name === 'öäü'), true); // Mac always converts to NFD, so
			assert.strictEqual(children.some(n => n.isDirectory()), true);

			assert.strictEqual(children.some(n => n.name === 'somefile.txt'), true);
			assert.strictEqual(children.some(n => n.isFile()), true);
		}
	});

	test('writeFile (string)', async () => {
		const smallData = 'Hello World';
		const bigData = (new Array(100 * 1024)).join('Large String\n');

		return testWriteFile(smallData, smallData, bigData, bigData);
	});

	test('writeFile (string) - flush on write', async () => {
		configureFlushOnWrite(true);
		try {
			const smallData = 'Hello World';
			const bigData = (new Array(100 * 1024)).join('Large String\n');

			return await testWriteFile(smallData, smallData, bigData, bigData);
		} finally {
			configureFlushOnWrite(false);
		}
	});

	test('writeFile (Buffer)', async () => {
		const smallData = 'Hello World';
		const bigData = (new Array(100 * 1024)).join('Large String\n');

		return testWriteFile(Buffer.from(smallData), smallData, Buffer.from(bigData), bigData);
	});

	test('writeFile (UInt8Array)', async () => {
		const smallData = 'Hello World';
		const bigData = (new Array(100 * 1024)).join('Large String\n');

		return testWriteFile(VSBuffer.fromString(smallData).buffer, smallData, VSBuffer.fromString(bigData).buffer, bigData);
	});

	async function testWriteFile(
		smallData: string | Buffer | Uint8Array,
		smallDataValue: string,
		bigData: string | Buffer | Uint8Array,
		bigDataValue: string
	): Promise<void> {
		const testFile = join(testDir, 'flushed.txt');

		assert.ok(fs.existsSync(testDir));

		await Promises.writeFile(testFile, smallData);
		assert.strictEqual(fs.readFileSync(testFile).toString(), smallDataValue);

		await Promises.writeFile(testFile, bigData);
		assert.strictEqual(fs.readFileSync(testFile).toString(), bigDataValue);
	}

	test('writeFile (string, error handling)', async () => {
		const testFile = join(testDir, 'flushed.txt');

		fs.mkdirSync(testFile); // this will trigger an error later because testFile is now a directory!

		let expectedError: Error | undefined;
		try {
			await Promises.writeFile(testFile, 'Hello World');
		} catch (error) {
			expectedError = error;
		}

		assert.ok(expectedError);
	});

	test('writeFileSync', async () => {
		const testFile = join(testDir, 'flushed.txt');

		writeFileSync(testFile, 'Hello World');
		assert.strictEqual(fs.readFileSync(testFile).toString(), 'Hello World');

		const largeString = (new Array(100 * 1024)).join('Large String\n');

		writeFileSync(testFile, largeString);
		assert.strictEqual(fs.readFileSync(testFile).toString(), largeString);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
