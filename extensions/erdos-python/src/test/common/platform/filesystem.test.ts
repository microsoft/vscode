// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as fsextra from '../../../client/common/platform/fs-paths';
import * as path from 'path';
import { convertStat, FileSystem, FileSystemUtils, RawFileSystem } from '../../../client/common/platform/fileSystem';
import { FileType, IFileSystem, IFileSystemUtils, IRawFileSystem } from '../../../client/common/platform/types';
import {
    assertDoesNotExist,
    assertExists,
    assertFileText,
    DOES_NOT_EXIST,
    FSFixture,
    SUPPORTS_SOCKETS,
    SUPPORTS_SYMLINKS,
    WINDOWS,
} from './utils';

// Note: all functional tests that do not trigger the VS Code "fs" API
// are found in filesystem.functional.test.ts.

suite('FileSystem - raw', () => {
    let filesystem: IRawFileSystem;
    let fix: FSFixture;
    setup(async () => {
        filesystem = RawFileSystem.withDefaults();
        fix = new FSFixture();

        await assertDoesNotExist(DOES_NOT_EXIST);
    });
    teardown(async () => {
        await fix.cleanUp();
    });

    suite('stat', () => {
        setup(function () {
            // https://github.com/microsoft/vscode-python/issues/10294

            this.skip();
        });
        test('gets the info for an existing file', async () => {
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            const old = await fsextra.stat(filename);
            const expected = convertStat(old, FileType.File);

            const stat = await filesystem.stat(filename);

            expect(stat).to.deep.equal(expected);
        });

        test('gets the info for an existing directory', async () => {
            const dirname = await fix.createDirectory('x/y/z/spam');
            const old = await fsextra.stat(dirname);
            const expected = convertStat(old, FileType.Directory);

            const stat = await filesystem.stat(dirname);

            expect(stat).to.deep.equal(expected);
        });

        test('for symlinks, gets the info for the linked file', async function () {
            if (!SUPPORTS_SYMLINKS) {
                this.skip();
            }
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            const symlink = await fix.createSymlink('x/y/z/eggs.py', filename);
            const old = await fsextra.stat(filename);
            const expected = convertStat(old, FileType.SymbolicLink | FileType.File);

            const stat = await filesystem.stat(symlink);

            expect(stat).to.deep.equal(expected);
        });

        test('gets the info for a socket', async function () {
            if (!SUPPORTS_SOCKETS) {
                return this.skip();
            }
            const sock = await fix.createSocket('x/spam.sock');
            const old = await fsextra.stat(sock);
            const expected = convertStat(old, FileType.Unknown);

            const stat = await filesystem.stat(sock);

            expect(stat).to.deep.equal(expected);
        });

        test('fails if the file does not exist', async () => {
            const promise = filesystem.stat(DOES_NOT_EXIST);

            await expect(promise).to.eventually.be.rejected;
        });
    });

    suite('move', () => {
        test('rename file', async () => {
            const source = await fix.createFile('spam.py', '<text>');
            const target = await fix.resolve('eggs-txt');
            await assertDoesNotExist(target);

            await filesystem.move(source, target);

            await assertExists(target);
            const text = await fsextra.readFile(target, 'utf8');
            expect(text).to.equal('<text>');
            await assertDoesNotExist(source);
        });

        test('rename directory', async () => {
            const source = await fix.createDirectory('spam');
            await fix.createFile('spam/data.json', '<text>');
            const target = await fix.resolve('eggs');
            const filename = await fix.resolve('eggs/data.json', false);
            await assertDoesNotExist(target);

            await filesystem.move(source, target);

            await assertExists(filename);
            const text = await fsextra.readFile(filename, 'utf8');
            expect(text).to.equal('<text>');
            await assertDoesNotExist(source);
        });

        test('rename symlink', async function () {
            if (!SUPPORTS_SYMLINKS) {
                this.skip();
            }
            const filename = await fix.createFile('spam.py');
            const symlink = await fix.createSymlink('spam.lnk', filename);
            const target = await fix.resolve('eggs');
            await assertDoesNotExist(target);

            await filesystem.move(symlink, target);

            await assertExists(target);
            const linked = await fsextra.readlink(target);
            expect(linked).to.equal(filename);
            await assertDoesNotExist(symlink);
        });

        test('move file', async () => {
            const source = await fix.createFile('spam.py', '<text>');
            await fix.createDirectory('eggs');
            const target = await fix.resolve('eggs/spam.py');
            await assertDoesNotExist(target);

            await filesystem.move(source, target);

            await assertExists(target);
            const text = await fsextra.readFile(target, 'utf8');
            expect(text).to.equal('<text>');
            await assertDoesNotExist(source);
        });

        test('move directory', async () => {
            const source = await fix.createDirectory('spam/spam/spam/eggs/spam');
            await fix.createFile('spam/spam/spam/eggs/spam/data.json', '<text>');
            await fix.createDirectory('spam/spam/spam/hash');
            const target = await fix.resolve('spam/spam/spam/hash/spam');
            const filename = await fix.resolve('spam/spam/spam/hash/spam/data.json', false);
            await assertDoesNotExist(target);

            await filesystem.move(source, target);

            await assertExists(filename);
            const text = await fsextra.readFile(filename, 'utf8');
            expect(text).to.equal('<text>');
            await assertDoesNotExist(source);
        });

        test('move symlink', async function () {
            if (!SUPPORTS_SYMLINKS) {
                this.skip();
            }
            const filename = await fix.createFile('spam.py');
            const symlink = await fix.createSymlink('w/spam.lnk', filename);
            const target = await fix.resolve('x/spam.lnk');
            await assertDoesNotExist(target);

            await filesystem.move(symlink, target);

            await assertExists(target);
            const linked = await fsextra.readlink(target);
            expect(linked).to.equal(filename);
            await assertDoesNotExist(symlink);
        });

        test('file target already exists', async () => {
            const source = await fix.createFile('spam.py', '<text>');
            const target = await fix.createFile('eggs-txt', '<other>');

            await filesystem.move(source, target);

            await assertDoesNotExist(source);
            await assertExists(target);
            const text2 = await fsextra.readFile(target, 'utf8');
            expect(text2).to.equal('<text>');
        });

        test('directory target already exists', async () => {
            const source = await fix.createDirectory('spam');
            const file3 = await fix.createFile('spam/data.json', '<text>');
            const target = await fix.createDirectory('eggs');
            const file1 = await fix.createFile('eggs/spam.py', '<code>');
            const file2 = await fix.createFile('eggs/data.json', '<other>');

            const promise = filesystem.move(source, target);

            await expect(promise).to.eventually.be.rejected;
            // Make sure nothing changed.
            const text1 = await fsextra.readFile(file1, 'utf8');
            expect(text1).to.equal('<code>');
            const text2 = await fsextra.readFile(file2, 'utf8');
            expect(text2).to.equal('<other>');
            const text3 = await fsextra.readFile(file3, 'utf8');
            expect(text3).to.equal('<text>');
        });

        test('fails if the file does not exist', async () => {
            const source = await fix.resolve(DOES_NOT_EXIST);
            const target = await fix.resolve('spam.py');

            const promise = filesystem.move(source, target);

            await expect(promise).to.eventually.be.rejected;
            // Make sure nothing changed.
            await assertDoesNotExist(target);
        });

        test('fails if the target directory does not exist', async () => {
            const source = await fix.createFile('x/spam.py', '<text>');
            const target = await fix.resolve('w/spam.py', false);
            await assertDoesNotExist(path.dirname(target));

            const promise = filesystem.move(source, target);

            await expect(promise).to.eventually.be.rejected;
            // Make sure nothing changed.
            await assertExists(source);
            await assertDoesNotExist(target);
        });
    });

    suite('readData', () => {
        test('returns contents of a file', async () => {
            const text = '<some text>';
            const expected = Buffer.from(text, 'utf8');
            const filename = await fix.createFile('x/y/z/spam.py', text);

            const content = await filesystem.readData(filename);

            expect(content).to.deep.equal(expected);
        });

        test('throws an exception if file does not exist', async () => {
            const promise = filesystem.readData(DOES_NOT_EXIST);

            await expect(promise).to.eventually.be.rejected;
        });
    });

    suite('readText', () => {
        test('returns contents of a file', async () => {
            const expected = '<some text>';
            const filename = await fix.createFile('x/y/z/spam.py', expected);

            const content = await filesystem.readText(filename);

            expect(content).to.be.equal(expected);
        });

        test('always UTF-8', async () => {
            const expected = '... 😁 ...';
            const filename = await fix.createFile('x/y/z/spam.py', expected);

            const text = await filesystem.readText(filename);

            expect(text).to.equal(expected);
        });

        test('returns garbage if encoding is UCS-2', async () => {
            const filename = await fix.resolve('spam.py');
            // There are probably cases where this would fail too.
            // However, the extension never has to deal with non-UTF8
            // cases, so it doesn't matter too much.
            const original = '... 😁 ...';
            await fsextra.writeFile(filename, original, { encoding: 'ucs2' });

            const text = await filesystem.readText(filename);

            expect(text).to.equal('.\u0000.\u0000.\u0000 \u0000=�\u0001� \u0000.\u0000.\u0000.\u0000');
        });

        test('throws an exception if file does not exist', async () => {
            const promise = filesystem.readText(DOES_NOT_EXIST);

            await expect(promise).to.eventually.be.rejected;
        });
    });

    suite('writeText', () => {
        test('creates the file if missing', async () => {
            const filename = await fix.resolve('x/y/z/spam.py');
            await assertDoesNotExist(filename);
            const data = 'line1\nline2\n';

            await filesystem.writeText(filename, data);

            await assertFileText(filename, data);
        });

        test('always UTF-8', async () => {
            const filename = await fix.resolve('x/y/z/spam.py');
            const data = '... 😁 ...';

            await filesystem.writeText(filename, data);

            await assertFileText(filename, data);
        });

        test('overwrites existing file', async () => {
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            const data = 'line1\nline2\n';

            await filesystem.writeText(filename, data);

            await assertFileText(filename, data);
        });
    });

    suite('copyFile', () => {
        test('the source file gets copied (same directory)', async () => {
            const data = '<content>';
            const src = await fix.createFile('x/y/z/spam.py', data);
            const dest = await fix.resolve('x/y/z/spam.py.bak');
            await assertDoesNotExist(dest);

            await filesystem.copyFile(src, dest);

            await assertFileText(dest, data);
            await assertFileText(src, data); // Make sure src wasn't changed.
        });

        test('the source file gets copied (different directory)', async () => {
            const data = '<content>';
            const src = await fix.createFile('x/y/z/spam.py', data);
            const dest = await fix.resolve('x/y/eggs.py');
            await assertDoesNotExist(dest);

            await filesystem.copyFile(src, dest);

            await assertFileText(dest, data);
            await assertFileText(src, data); // Make sure src wasn't changed.
        });

        test('fails if the source does not exist', async () => {
            const dest = await fix.resolve('x/spam.py');

            const promise = filesystem.copyFile(DOES_NOT_EXIST, dest);

            await expect(promise).to.eventually.be.rejected;
        });

        test('fails if the target parent directory does not exist', async () => {
            const src = await fix.createFile('x/spam.py', '...');
            const dest = await fix.resolve('y/eggs.py', false);
            await assertDoesNotExist(path.dirname(dest));

            const promise = filesystem.copyFile(src, dest);

            await expect(promise).to.eventually.be.rejected;
        });
    });

    suite('rmfile', () => {
        test('deletes the file', async () => {
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            await assertExists(filename);

            await filesystem.rmfile(filename);

            await assertDoesNotExist(filename);
        });

        test('fails if the file does not exist', async () => {
            const promise = filesystem.rmfile(DOES_NOT_EXIST);

            await expect(promise).to.eventually.be.rejected;
        });
    });

    suite('rmdir', () => {
        test('deletes the directory if empty', async () => {
            const dirname = await fix.createDirectory('x');
            await assertExists(dirname);

            await filesystem.rmdir(dirname);

            await assertDoesNotExist(dirname);
        });

        test('fails if the directory is not empty', async () => {
            const dirname = await fix.createDirectory('x');
            const filename = await fix.createFile('x/y/z/spam.py');
            await assertExists(filename);

            const promise = filesystem.rmdir(dirname);

            await expect(promise).to.eventually.be.rejected;
        });

        test('fails if the directory does not exist', async () => {
            const promise = filesystem.rmdir(DOES_NOT_EXIST);

            await expect(promise).to.eventually.be.rejected;
        });
    });

    suite('rmtree', () => {
        test('deletes the directory if empty', async () => {
            const dirname = await fix.createDirectory('x');
            await assertExists(dirname);

            await filesystem.rmtree(dirname);

            await assertDoesNotExist(dirname);
        });

        test('deletes the directory if not empty', async () => {
            const dirname = await fix.createDirectory('x');
            const filename = await fix.createFile('x/y/z/spam.py');
            await assertExists(filename);

            await filesystem.rmtree(dirname);

            await assertDoesNotExist(dirname);
        });

        test('fails if the directory does not exist', async () => {
            const promise = filesystem.rmtree(DOES_NOT_EXIST);

            await expect(promise).to.eventually.be.rejected;
        });
    });

    suite('mkdirp', () => {
        test('creates the directory and all missing parents', async () => {
            await fix.createDirectory('x');
            // x/y, x/y/z, and x/y/z/spam are all missing.
            const dirname = await fix.resolve('x/y/z/spam', false);
            await assertDoesNotExist(dirname);

            await filesystem.mkdirp(dirname);

            await assertExists(dirname);
        });

        test('works if the directory already exists', async () => {
            const dirname = await fix.createDirectory('spam');
            await assertExists(dirname);

            await filesystem.mkdirp(dirname);

            await assertExists(dirname);
        });
    });

    suite('listdir', () => {
        test('mixed', async function () {
            // https://github.com/microsoft/vscode-python/issues/10240

            return this.skip();
            // Create the target directory and its contents.
            const dirname = await fix.createDirectory('x/y/z');
            const file1 = await fix.createFile('x/y/z/__init__.py', '');
            const script = await fix.createFile('x/y/z/__main__.py', '<script here>');
            const file2 = await fix.createFile('x/y/z/spam.py', '...');
            const file3 = await fix.createFile('x/y/z/eggs.py', '"""..."""');
            const subdir = await fix.createDirectory('x/y/z/w');
            const expected = [
                [file1, FileType.File],
                [script, FileType.File],
                [file3, FileType.File],
                [file2, FileType.File],
                [subdir, FileType.Directory],
            ];
            if (SUPPORTS_SYMLINKS) {
                // a symlink to a file (source not directly in listed dir)
                const symlink1 = await fix.createSymlink(
                    'x/y/z/info.py',
                    // Link to an ignored file.
                    await fix.createFile('x/_info.py', '<info here>'), // source
                );
                expected.push([symlink1, FileType.SymbolicLink | FileType.File]);

                // a symlink to a directory (source not directly in listed dir)
                const symlink4 = await fix.createSymlink(
                    'x/y/z/static_files',
                    await fix.resolve('x/y/z/w/data'), // source
                );
                expected.push([symlink4, FileType.SymbolicLink | FileType.Directory]);

                // a broken symlink
                // TODO (https://github.com/microsoft/vscode/issues/90031):
                //   VS Code ignores broken symlinks currently...
                //const symlink2 = await fix.createSymlink(
                //    'x/y/z/broken',
                //    DOES_NOT_EXIST // source
                //);
                //expected.push([symlink2, FileType.SymbolicLink]);
            }
            if (SUPPORTS_SOCKETS) {
                // a socket
                const sock = await fix.createSocket('x/y/z/ipc.sock');
                expected.push([sock, FileType.Unknown]);

                if (SUPPORTS_SYMLINKS) {
                    // a symlink to a socket
                    const symlink3 = await fix.createSymlink(
                        'x/y/z/ipc.sck',
                        sock, // source
                    );
                    expected.push(
                        // TODO (https://github.com/microsoft/vscode/issues/90032):
                        //   VS Code gets symlinks to "unknown" files wrong:
                        [symlink3, FileType.SymbolicLink | FileType.File],
                        //[symlink3, FileType.SymbolicLink]
                    );
                }
            }
            // Create other files and directories (should be ignored).
            await fix.createFile('x/__init__.py', '');
            await fix.createFile('x/y/__init__.py', '');
            await fix.createDirectory('x/y/z/w/data');
            await fix.createFile('x/y/z/w/data/v1.json');
            if (SUPPORTS_SYMLINKS) {
                // a broken symlink
                // TODO (https://github.com/microsoft/vscode/issues/90031):
                //   VS Code ignores broken symlinks currently...
                await fix.createSymlink(
                    'x/y/z/broken',
                    DOES_NOT_EXIST, // source
                );

                // a symlink outside the listed dir (to a file inside the dir)
                await fix.createSymlink(
                    'my-script.py',
                    // Link to a listed file.
                    script, // source (__main__.py)
                );

                // a symlink in a subdir (to a file outside the dir)
                await fix.createSymlink(
                    'x/y/z/w/__init__.py',
                    await fix.createFile('x/__init__.py', ''), // source
                );
            }

            const entries = await filesystem.listdir(dirname);

            expect(entries.sort()).to.deep.equal(expected.sort());
        });

        test('empty', async () => {
            const dirname = await fix.createDirectory('x/y/z/eggs');

            const entries = await filesystem.listdir(dirname);

            expect(entries).to.deep.equal([]);
        });

        test('fails if the directory does not exist', async () => {
            const promise = filesystem.listdir(DOES_NOT_EXIST);

            await expect(promise).to.eventually.be.rejected;
        });
    });
});

suite('FileSystem - utils', () => {
    let utils: IFileSystemUtils;
    let fix: FSFixture;
    setup(async () => {
        utils = FileSystemUtils.withDefaults();
        fix = new FSFixture();

        await assertDoesNotExist(DOES_NOT_EXIST);
    });
    teardown(async () => {
        await fix.cleanUp();
    });

    suite('createDirectory', () => {
        test('wraps the low-level impl', async () => {
            await fix.createDirectory('x');
            // x/y, x/y/z, and x/y/z/spam are all missing.
            const dirname = await fix.resolve('x/spam', false);
            await assertDoesNotExist(dirname);

            await utils.createDirectory(dirname);

            await assertExists(dirname);
        });
    });

    suite('deleteDirectory', () => {
        test('wraps the low-level impl', async () => {
            const dirname = await fix.createDirectory('x');
            await assertExists(dirname);

            await utils.deleteDirectory(dirname);

            await assertDoesNotExist(dirname);
        });
    });

    suite('deleteFile', () => {
        test('wraps the low-level impl', async () => {
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            await assertExists(filename);

            await utils.deleteFile(filename);

            await assertDoesNotExist(filename);
        });
    });

    suite('pathExists', () => {
        test('exists (without type)', async () => {
            const filename = await fix.createFile('x/y/z/spam.py');

            const exists = await utils.pathExists(filename);

            expect(exists).to.equal(true);
        });

        test('does not exist (without type)', async () => {
            const exists = await utils.pathExists(DOES_NOT_EXIST);

            expect(exists).to.equal(false);
        });

        test('matches (type: file)', async () => {
            const filename = await fix.createFile('x/y/z/spam.py');

            const exists = await utils.pathExists(filename, FileType.File);

            expect(exists).to.equal(true);
        });

        test('mismatch (type: file)', async () => {
            const filename = await fix.createDirectory('x/y/z/spam.py');

            const exists = await utils.pathExists(filename, FileType.File);

            expect(exists).to.equal(false);
        });

        test('matches (type: directory)', async () => {
            const dirname = await fix.createDirectory('x/y/z/spam');

            const exists = await utils.pathExists(dirname, FileType.Directory);

            expect(exists).to.equal(true);
        });

        test('mismatch (type: directory)', async () => {
            const dirname = await fix.createFile('x/y/z/spam');

            const exists = await utils.pathExists(dirname, FileType.Directory);

            expect(exists).to.equal(false);
        });

        test('symlinks are followed', async function () {
            if (!SUPPORTS_SYMLINKS) {
                this.skip();
            }
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            const symlink = await fix.createSymlink('x/y/z/eggs.py', filename);

            const exists = await utils.pathExists(symlink, FileType.SymbolicLink);
            const destIsFile = await utils.pathExists(symlink, FileType.File);
            const destIsDir = await utils.pathExists(symlink, FileType.Directory);

            expect(exists).to.equal(true);
            expect(destIsFile).to.equal(true);
            expect(destIsDir).to.equal(false);
        });

        test('mismatch (type: symlink)', async () => {
            const filename = await fix.createFile('x/y/z/spam.py');

            const exists = await utils.pathExists(filename, FileType.SymbolicLink);

            expect(exists).to.equal(false);
        });

        test('matches (type: unknown)', async function () {
            if (!SUPPORTS_SOCKETS) {
                this.skip();
            }
            const sockFile = await fix.createSocket('x/y/z/ipc.sock');

            const exists = await utils.pathExists(sockFile, FileType.Unknown);

            expect(exists).to.equal(true);
        });

        test('mismatch (type: unknown)', async () => {
            const filename = await fix.createFile('x/y/z/spam.py');

            const exists = await utils.pathExists(filename, FileType.Unknown);

            expect(exists).to.equal(false);
        });
    });

    suite('fileExists', () => {
        test('want file, got file', async () => {
            const filename = await fix.createFile('x/y/z/spam.py');

            const exists = await utils.fileExists(filename);

            expect(exists).to.equal(true);
        });

        test('want file, not file', async () => {
            const filename = await fix.createDirectory('x/y/z/spam.py');

            const exists = await utils.fileExists(filename);

            expect(exists).to.equal(false);
        });

        test('symlink', async function () {
            if (!SUPPORTS_SYMLINKS) {
                this.skip();
            }
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            const symlink = await fix.createSymlink('x/y/z/eggs.py', filename);

            const exists = await utils.fileExists(symlink);

            // This is because we currently use stat() and not lstat().
            expect(exists).to.equal(true);
        });

        test('unknown', async function () {
            if (!SUPPORTS_SOCKETS) {
                this.skip();
            }
            const sockFile = await fix.createSocket('x/y/z/ipc.sock');

            const exists = await utils.fileExists(sockFile);

            expect(exists).to.equal(false);
        });

        test('failure in stat()', async function () {
            if (WINDOWS) {
                this.skip();
            }
            const dirname = await fix.createDirectory('x/y/z');
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            await fsextra.chmod(dirname, 0o400);

            let exists: boolean;
            try {
                exists = await utils.fileExists(filename);
            } finally {
                await fsextra.chmod(dirname, 0o755);
            }

            expect(exists).to.equal(false);
        });
    });

    suite('directoryExists', () => {
        test('want directory, got directory', async () => {
            const dirname = await fix.createDirectory('x/y/z/spam');

            const exists = await utils.directoryExists(dirname);

            expect(exists).to.equal(true);
        });

        test('want directory, not directory', async () => {
            const dirname = await fix.createFile('x/y/z/spam');

            const exists = await utils.directoryExists(dirname);

            expect(exists).to.equal(false);
        });

        test('symlink', async function () {
            if (!SUPPORTS_SYMLINKS) {
                this.skip();
            }
            const dirname = await fix.createDirectory('x/y/z/spam');
            const symlink = await fix.createSymlink('x/y/z/eggs', dirname);

            const exists = await utils.directoryExists(symlink);

            // This is because we currently use stat() and not lstat().
            expect(exists).to.equal(true);
        });

        test('unknown', async function () {
            if (!SUPPORTS_SOCKETS) {
                this.skip();
            }
            const sockFile = await fix.createSocket('x/y/z/ipc.sock');

            const exists = await utils.directoryExists(sockFile);

            expect(exists).to.equal(false);
        });

        test('failure in stat()', async function () {
            if (WINDOWS) {
                this.skip();
            }
            const parentdir = await fix.createDirectory('x/y/z');
            const dirname = await fix.createDirectory('x/y/z/spam');
            await fsextra.chmod(parentdir, 0o400);

            let exists: boolean;
            try {
                exists = await utils.fileExists(dirname);
            } finally {
                await fsextra.chmod(parentdir, 0o755);
            }

            expect(exists).to.equal(false);
        });
    });

    suite('listdir', () => {
        test('wraps the low-level impl', async () => {
            test('mixed', async () => {
                // Create the target directory and its contents.
                const dirname = await fix.createDirectory('x/y/z');
                const file = await fix.createFile('x/y/z/__init__.py', '');
                const subdir = await fix.createDirectory('x/y/z/w');

                const entries = await utils.listdir(dirname);

                expect(entries.sort()).to.deep.equal([
                    [file, FileType.File],
                    [subdir, FileType.Directory],
                ]);
            });
        });
    });

    suite('getSubDirectories', () => {
        test('empty if the directory does not exist', async () => {
            const entries = await utils.getSubDirectories(DOES_NOT_EXIST);

            expect(entries).to.deep.equal([]);
        });
    });

    suite('getFiles', () => {
        test('empty if the directory does not exist', async () => {
            const entries = await utils.getFiles(DOES_NOT_EXIST);

            expect(entries).to.deep.equal([]);
        });
    });

    suite('isDirReadonly', () => {
        suite('non-Windows', () => {
            suiteSetup(function () {
                if (WINDOWS) {
                    this.skip();
                }
            });

            // On Windows, chmod won't have any effect on the file itself.
            test('is readonly', async () => {
                const dirname = await fix.createDirectory('x/y/z/spam');
                await fsextra.chmod(dirname, 0o444);

                const isReadonly = await utils.isDirReadonly(dirname);

                expect(isReadonly).to.equal(true);
            });
        });

        test('is not readonly', async () => {
            const dirname = await fix.createDirectory('x/y/z/spam');

            const isReadonly = await utils.isDirReadonly(dirname);

            expect(isReadonly).to.equal(false);
        });

        test('fail if the directory does not exist', async () => {
            const promise = utils.isDirReadonly(DOES_NOT_EXIST);

            await expect(promise).to.eventually.be.rejected;
        });
    });
});

suite('FileSystem', () => {
    let filesystem: IFileSystem;
    let fix: FSFixture;
    setup(async () => {
        filesystem = new FileSystem();
        fix = new FSFixture();

        await assertDoesNotExist(DOES_NOT_EXIST);
    });
    teardown(async () => {
        await fix.cleanUp();
    });

    suite('raw', () => {
        suite('stat', () => {
            setup(function () {
                // https://github.com/microsoft/vscode-python/issues/10294

                this.skip();
            });
            test('gets the info for an existing file', async () => {
                const filename = await fix.createFile('x/y/z/spam.py', '...');
                const old = await fsextra.stat(filename);
                const expected = convertStat(old, FileType.File);

                const stat = await filesystem.stat(filename);

                expect(stat).to.deep.equal(expected);
            });

            test('gets the info for an existing directory', async () => {
                const dirname = await fix.createDirectory('x/y/z/spam');
                const old = await fsextra.stat(dirname);
                const expected = convertStat(old, FileType.Directory);

                const stat = await filesystem.stat(dirname);

                expect(stat).to.deep.equal(expected);
            });

            test('for symlinks, gets the info for the linked file', async function () {
                // https://github.com/microsoft/vscode-python/issues/10294

                this.skip();
                if (!SUPPORTS_SYMLINKS) {
                    this.skip();
                }
                const filename = await fix.createFile('x/y/z/spam.py', '...');
                const symlink = await fix.createSymlink('x/y/z/eggs.py', filename);
                const old = await fsextra.stat(filename);
                const expected = convertStat(old, FileType.SymbolicLink | FileType.File);

                const stat = await filesystem.stat(symlink);

                expect(stat).to.deep.equal(expected);
            });

            test('gets the info for a socket', async function () {
                if (!SUPPORTS_SOCKETS) {
                    return this.skip();
                }
                const sock = await fix.createSocket('x/spam.sock');
                const old = await fsextra.stat(sock);
                const expected = convertStat(old, FileType.Unknown);

                const stat = await filesystem.stat(sock);

                expect(stat).to.deep.equal(expected);
            });

            test('fails if the file does not exist', async () => {
                const promise = filesystem.stat(DOES_NOT_EXIST);

                await expect(promise).to.eventually.be.rejected;
            });
        });

        suite('createDirectory', () => {
            test('wraps the low-level impl', async () => {
                await fix.createDirectory('x');
                // x/y, x/y/z, and x/y/z/spam are all missing.
                const dirname = await fix.resolve('x/spam', false);
                await assertDoesNotExist(dirname);

                await filesystem.createDirectory(dirname);

                await assertExists(dirname);
            });
        });

        suite('deleteDirectory', () => {
            test('wraps the low-level impl', async () => {
                const dirname = await fix.createDirectory('x');
                await assertExists(dirname);

                await filesystem.deleteDirectory(dirname);

                await assertDoesNotExist(dirname);
            });
        });

        suite('listdir', () => {
            test('wraps the low-level impl', async () => {
                test('mixed', async () => {
                    // Create the target directory and its contents.
                    const dirname = await fix.createDirectory('x/y/z');
                    const file = await fix.createFile('x/y/z/__init__.py', '');
                    const subdir = await fix.createDirectory('x/y/z/w');

                    const entries = await filesystem.listdir(dirname);

                    expect(entries.sort()).to.deep.equal([
                        [file, FileType.File],
                        [subdir, FileType.Directory],
                    ]);
                });
            });
        });

        suite('readFile', () => {
            test('wraps the low-level impl', async () => {
                const expected = '<some text>';
                const filename = await fix.createFile('x/y/z/spam.py', expected);

                const content = await filesystem.readFile(filename);

                expect(content).to.be.equal(expected);
            });
        });

        suite('readData', () => {
            test('wraps the low-level impl', async () => {
                const text = '<some text>';
                const expected = Buffer.from(text, 'utf8');
                const filename = await fix.createFile('x/y/z/spam.py', text);

                const content = await filesystem.readData(filename);

                expect(content).to.deep.equal(expected);
            });
        });

        suite('writeFile', () => {
            test('wraps the low-level impl', async () => {
                const filename = await fix.createFile('x/y/z/spam.py', '...');
                const data = 'line1\nline2\n';

                await filesystem.writeFile(filename, data);

                await assertFileText(filename, data);
            });
        });

        suite('copyFile', () => {
            test('wraps the low-level impl', async () => {
                const data = '<content>';
                const src = await fix.createFile('x/y/z/spam.py', data);
                const dest = await fix.resolve('x/y/z/spam.py.bak');
                await assertDoesNotExist(dest);

                await filesystem.copyFile(src, dest);

                await assertFileText(dest, data);
                await assertFileText(src, data); // Make sure src wasn't changed.
            });
        });

        suite('move', () => {
            test('wraps the low-level impl', async () => {
                const source = await fix.createFile('spam.py', '<text>');
                const target = await fix.resolve('eggs-txt');
                await assertDoesNotExist(target);

                await filesystem.move(source, target);

                await assertExists(target);
                const text = await fsextra.readFile(target, 'utf8');
                expect(text).to.equal('<text>');
                await assertDoesNotExist(source);
            });
        });
    });

    suite('utils', () => {
        suite('fileExists', () => {
            test('want file, got file', async () => {
                const filename = await fix.createFile('x/y/z/spam.py');

                const exists = await filesystem.fileExists(filename);

                expect(exists).to.equal(true);
            });

            test('want file, not file', async () => {
                const filename = await fix.createDirectory('x/y/z/spam.py');

                const exists = await filesystem.fileExists(filename);

                expect(exists).to.equal(false);
            });

            test('symlink', async function () {
                if (!SUPPORTS_SYMLINKS) {
                    this.skip();
                }
                const filename = await fix.createFile('x/y/z/spam.py', '...');
                const symlink = await fix.createSymlink('x/y/z/eggs.py', filename);

                const exists = await filesystem.fileExists(symlink);

                // This is because we currently use stat() and not lstat().
                expect(exists).to.equal(true);
            });

            test('unknown', async function () {
                if (!SUPPORTS_SOCKETS) {
                    this.skip();
                }
                const sockFile = await fix.createSocket('x/y/z/ipc.sock');

                const exists = await filesystem.fileExists(sockFile);

                expect(exists).to.equal(false);
            });
        });

        suite('directoryExists', () => {
            test('want directory, got directory', async () => {
                const dirname = await fix.createDirectory('x/y/z/spam');

                const exists = await filesystem.directoryExists(dirname);

                expect(exists).to.equal(true);
            });

            test('want directory, not directory', async () => {
                const dirname = await fix.createFile('x/y/z/spam');

                const exists = await filesystem.directoryExists(dirname);

                expect(exists).to.equal(false);
            });

            test('symlink', async function () {
                if (!SUPPORTS_SYMLINKS) {
                    this.skip();
                }
                const dirname = await fix.createDirectory('x/y/z/spam');
                const symlink = await fix.createSymlink('x/y/z/eggs', dirname);

                const exists = await filesystem.directoryExists(symlink);

                // This is because we currently use stat() and not lstat().
                expect(exists).to.equal(true);
            });

            test('unknown', async function () {
                if (!SUPPORTS_SOCKETS) {
                    this.skip();
                }
                const sockFile = await fix.createSocket('x/y/z/ipc.sock');

                const exists = await filesystem.directoryExists(sockFile);

                expect(exists).to.equal(false);
            });
        });

        suite('getSubDirectories', () => {
            test('mixed types', async () => {
                // Create the target directory and its subdirs.
                const dirname = await fix.createDirectory('x/y/z/scripts');
                const expected = [
                    await fix.createDirectory('x/y/z/scripts/w'), // subdir1
                    await fix.createDirectory('x/y/z/scripts/v'), // subdir2
                ];
                if (SUPPORTS_SYMLINKS) {
                    // a symlink to a directory (source is outside listed dir)
                    const symlinkDirSource = await fix.createDirectory('x/data');
                    const symlink = await fix.createSymlink('x/y/z/scripts/datadir', symlinkDirSource);
                    expected.push(symlink);
                }
                // Create files in the directory (should be ignored).
                await fix.createFile('x/y/z/scripts/spam.py');
                await fix.createFile('x/y/z/scripts/eggs.py');
                await fix.createFile('x/y/z/scripts/data.json');
                if (SUPPORTS_SYMLINKS) {
                    // a symlink to a file (source outside listed dir)
                    const symlinkFileSource = await fix.createFile('x/info.py');
                    await fix.createSymlink('x/y/z/scripts/other', symlinkFileSource);
                }
                if (SUPPORTS_SOCKETS) {
                    // a plain socket
                    await fix.createSocket('x/y/z/scripts/spam.sock');
                }

                const results = await filesystem.getSubDirectories(dirname);

                expect(results.sort()).to.deep.equal(expected.sort());
            });

            test('empty if the directory does not exist', async () => {
                const entries = await filesystem.getSubDirectories(DOES_NOT_EXIST);

                expect(entries).to.deep.equal([]);
            });
        });

        suite('getFiles', () => {
            test('mixed types', async () => {
                // Create the target directory and its files.
                const dirname = await fix.createDirectory('x/y/z/scripts');
                const expected = [
                    await fix.createFile('x/y/z/scripts/spam.py'), // file1
                    await fix.createFile('x/y/z/scripts/eggs.py'), // file2
                    await fix.createFile('x/y/z/scripts/data.json'), // file3
                ];
                if (SUPPORTS_SYMLINKS) {
                    const symlinkFileSource = await fix.createFile('x/info.py');
                    const symlink = await fix.createSymlink('x/y/z/scripts/other', symlinkFileSource);
                    expected.push(symlink);
                }
                // Create subdirs, sockets, etc. in the directory (should be ignored).
                await fix.createDirectory('x/y/z/scripts/w');
                await fix.createDirectory('x/y/z/scripts/v');
                if (SUPPORTS_SYMLINKS) {
                    const symlinkDirSource = await fix.createDirectory('x/data');
                    await fix.createSymlink('x/y/z/scripts/datadir', symlinkDirSource);
                }
                if (SUPPORTS_SOCKETS) {
                    await fix.createSocket('x/y/z/scripts/spam.sock');
                }

                const results = await filesystem.getFiles(dirname);

                expect(results.sort()).to.deep.equal(expected.sort());
            });

            test('empty if the directory does not exist', async () => {
                const entries = await filesystem.getFiles(DOES_NOT_EXIST);

                expect(entries).to.deep.equal([]);
            });
        });

        suite('isDirReadonly', () => {
            suite('non-Windows', () => {
                suiteSetup(function () {
                    if (WINDOWS) {
                        this.skip();
                    }
                });

                // On Windows, chmod won't have any effect on the file itself.
                test('is readonly', async () => {
                    const dirname = await fix.createDirectory('x/y/z/spam');
                    await fsextra.chmod(dirname, 0o444);

                    const isReadonly = await filesystem.isDirReadonly(dirname);

                    expect(isReadonly).to.equal(true);
                });
            });

            test('is not readonly', async () => {
                const dirname = await fix.createDirectory('x/y/z/spam');

                const isReadonly = await filesystem.isDirReadonly(dirname);

                expect(isReadonly).to.equal(false);
            });

            test('fail if the directory does not exist', async () => {
                const promise = filesystem.isDirReadonly(DOES_NOT_EXIST);

                await expect(promise).to.eventually.be.rejected;
            });
        });
    });
});
