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
import { configureFlushOnWrite, Promises, realcase, realpathSync, RimRafMode, SymlinkSupport, writeFileSync } from '../../../node/pfs.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../common/utils.js';
import { flakySuite, getRandomTestPath } from '../testUtils.js';
configureFlushOnWrite(false); // speed up all unit tests by disabling flush on write
flakySuite('PFS', function () {
    let testDir;
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
        await Promises.writeFile(testFile, 'Hello World', (null));
        assert.strictEqual((await fs.promises.readFile(testFile)).toString(), 'Hello World');
    });
    test('writeFile - parallel write on different files works', async () => {
        const testFile1 = join(testDir, 'writefile1.txt');
        const testFile2 = join(testDir, 'writefile2.txt');
        const testFile3 = join(testDir, 'writefile3.txt');
        const testFile4 = join(testDir, 'writefile4.txt');
        const testFile5 = join(testDir, 'writefile5.txt');
        await Promise.all([
            Promises.writeFile(testFile1, 'Hello World 1', (null)),
            Promises.writeFile(testFile2, 'Hello World 2', (null)),
            Promises.writeFile(testFile3, 'Hello World 3', (null)),
            Promises.writeFile(testFile4, 'Hello World 4', (null)),
            Promises.writeFile(testFile5, 'Hello World 5', (null))
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
    test('copy, rename and delete', async () => {
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
    test('rename without retry', async () => {
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
        }
        else {
            assert.ok(!fs.existsSync(copyTarget));
        }
    });
    test('copy handles symbolic links when the reference is inside source', async () => {
        // Source Folder
        const sourceFolder = join(randomPath(testDir), 'copy-test'); // copy-test
        const sourceLinkTestFolder = join(sourceFolder, 'link-test'); // copy-test/link-test
        const sourceLinkMD5JSFolder = join(sourceLinkTestFolder, 'md5'); // copy-test/link-test/md5
        const sourceLinkMD5JSFile = join(sourceLinkMD5JSFolder, 'md5.js'); // copy-test/link-test/md5/md5.js
        await fs.promises.mkdir(sourceLinkMD5JSFolder, { recursive: true });
        await Promises.writeFile(sourceLinkMD5JSFile, 'Hello from MD5');
        const sourceLinkMD5JSFolderLinked = join(sourceLinkTestFolder, 'md5-linked'); // copy-test/link-test/md5-linked
        fs.symlinkSync(sourceLinkMD5JSFolder, sourceLinkMD5JSFolderLinked, 'junction');
        // Target Folder
        const targetLinkTestFolder = join(sourceFolder, 'link-test copy'); // copy-test/link-test copy
        const targetLinkMD5JSFolder = join(targetLinkTestFolder, 'md5'); // copy-test/link-test copy/md5
        const targetLinkMD5JSFile = join(targetLinkMD5JSFolder, 'md5.js'); // copy-test/link-test copy/md5/md5.js
        const targetLinkMD5JSFolderLinked = join(targetLinkTestFolder, 'md5-linked'); // copy-test/link-test copy/md5-linked
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
        const parent = randomPath(join(testDir, 'pfs'));
        const newDir = join(parent, 'öäü');
        await fs.promises.mkdir(newDir, { recursive: true });
        assert.ok(fs.existsSync(newDir));
        const children = await Promises.readdir(parent);
        assert.strictEqual(children.some(n => n === 'öäü'), true); // Mac always converts to NFD, so
    });
    test('readdir (with file types)', async () => {
        const newDir = join(testDir, 'öäü');
        await fs.promises.mkdir(newDir, { recursive: true });
        await Promises.writeFile(join(testDir, 'somefile.txt'), 'contents');
        assert.ok(fs.existsSync(newDir));
        const children = await Promises.readdir(testDir, { withFileTypes: true });
        assert.strictEqual(children.some(n => n.name === 'öäü'), true); // Mac always converts to NFD, so
        assert.strictEqual(children.some(n => n.isDirectory()), true);
        assert.strictEqual(children.some(n => n.name === 'somefile.txt'), true);
        assert.strictEqual(children.some(n => n.isFile()), true);
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
        }
        finally {
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
    async function testWriteFile(smallData, smallDataValue, bigData, bigDataValue) {
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
        let expectedError;
        try {
            await Promises.writeFile(testFile, 'Hello World');
        }
        catch (error) {
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
    test('realcase', async () => {
        // assume case insensitive file system
        if (process.platform === 'win32' || process.platform === 'darwin') {
            const upper = testDir.toUpperCase();
            const real = await realcase(upper);
            if (real) { // can be null in case of permission errors
                assert.notStrictEqual(real, upper);
                assert.strictEqual(real.toUpperCase(), upper);
                assert.strictEqual(real, testDir);
            }
        }
        // linux, unix, etc. -> assume case sensitive file system
        else {
            let real = await realcase(testDir);
            assert.strictEqual(real, testDir);
            real = await realcase(testDir.toUpperCase());
            assert.strictEqual(real, testDir.toUpperCase());
        }
    });
    test('realpath', async () => {
        const realpathVal = await Promises.realpath(testDir);
        assert.ok(realpathVal);
    });
    test('realpathSync', () => {
        const realpath = realpathSync(testDir);
        assert.ok(realpath);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGZzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3Qvbm9kZS9wZnMvcGZzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ25ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3hELE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN2RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDeEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDMUksT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDaEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRWhFLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsc0RBQXNEO0FBRXBGLFVBQVUsQ0FBQyxLQUFLLEVBQUU7SUFFakIsSUFBSSxPQUFlLENBQUM7SUFFcEIsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLE9B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O1FBQ3RELE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0RCxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFDbEUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVuRSxNQUFNLFFBQVEsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRTdDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDckMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDckMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2RCxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFcEUsTUFBTSxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsWUFBWSxDQUFDLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7UUFFNUYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFL0QsTUFBTSxRQUFRLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTdCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDdEMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0JBQXNCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDdkMsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUNoRixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BELE1BQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN4QyxNQUFNLFVBQVUsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFekMsTUFBTSxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUUsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sUUFBUSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXBELE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDckMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDckMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2RCxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFcEUsTUFBTSxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsWUFBWSxDQUFDLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxrQkFBa0IsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRW5HLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFD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