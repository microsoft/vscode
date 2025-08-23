// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect, use } from 'chai';
import { convertStat, FileSystem, FileSystemUtils, RawFileSystem } from '../../../client/common/platform/fileSystem';
import * as fs from '../../../client/common/platform/fs-paths';
import { FileType } from '../../../client/common/platform/types';
import { createDeferred, sleep } from '../../../client/common/utils/async';
import { noop } from '../../../client/common/utils/misc';
import {
    assertDoesNotExist,
    assertFileText,
    DOES_NOT_EXIST,
    fixPath,
    FSFixture,
    SUPPORTS_SOCKETS,
    SUPPORTS_SYMLINKS,
    WINDOWS,
} from './utils';

const assertArrays = require('chai-arrays');
use(require('chai-as-promised'));
use(assertArrays);

suite('FileSystem - raw', () => {
    let fileSystem: RawFileSystem;
    let fix: FSFixture;
    setup(async () => {
        fileSystem = RawFileSystem.withDefaults();
        fix = new FSFixture();

        await assertDoesNotExist(DOES_NOT_EXIST);
    });
    teardown(async () => {
        await fix.cleanUp();
        await fix.ensureDeleted(DOES_NOT_EXIST);
    });

    suite('lstat', () => {
        test('for symlinks, gives the link info', async function () {
            if (!SUPPORTS_SYMLINKS) {
                this.skip();
            }
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            const symlink = await fix.createSymlink('x/y/z/eggs.py', filename);
            const rawStat = await fs.lstat(symlink);
            const expected = convertStat(rawStat, FileType.SymbolicLink);

            const stat = await fileSystem.lstat(symlink);

            expect(stat).to.deep.equal(expected);
        });

        test('for normal files, gives the file info', async () => {
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            // Ideally we would compare to the result of
            // fileSystem.stat().  However, we do not have access
            // to the VS Code API here.
            const rawStat = await fs.lstat(filename);
            const expected = convertStat(rawStat, FileType.File);

            const stat = await fileSystem.lstat(filename);

            expect(stat).to.deep.equal(expected);
        });

        test('fails if the file does not exist', async () => {
            const promise = fileSystem.lstat(DOES_NOT_EXIST);

            await expect(promise).to.eventually.be.rejected;
        });
    });

    suite('chmod (non-Windows)', () => {
        suiteSetup(function () {
            // On Windows, chmod won't have any effect on the file itself.
            if (WINDOWS) {
                this.skip();
            }
        });

        async function checkMode(filename: string, expected: number) {
            const stat = await fs.stat(filename);
            expect(stat.mode & 0o777).to.equal(expected);
        }

        test('the file mode gets updated (string)', async () => {
            const filename = await fix.createFile('spam.py', '...');
            await fs.chmod(filename, 0o644);

            await fileSystem.chmod(filename, '755');

            await checkMode(filename, 0o755);
        });

        test('the file mode gets updated (number)', async () => {
            const filename = await fix.createFile('spam.py', '...');
            await fs.chmod(filename, 0o644);

            await fileSystem.chmod(filename, 0o755);

            await checkMode(filename, 0o755);
        });

        test('the file mode gets updated for a directory', async () => {
            const dirname = await fix.createDirectory('spam');
            await fs.chmod(dirname, 0o755);

            await fileSystem.chmod(dirname, 0o700);

            await checkMode(dirname, 0o700);
        });

        test('nothing happens if the file mode already matches', async () => {
            const filename = await fix.createFile('spam.py', '...');
            await fs.chmod(filename, 0o644);

            await fileSystem.chmod(filename, 0o644);

            await checkMode(filename, 0o644);
        });

        test('fails if the file does not exist', async () => {
            const promise = fileSystem.chmod(DOES_NOT_EXIST, 0o755);

            await expect(promise).to.eventually.be.rejected;
        });
    });

    suite('appendText', () => {
        test('existing file', async () => {
            const orig = 'spamspamspam\n\n';
            const dataToAppend = `Some Data\n${new Date().toString()}\nAnd another line`;
            const filename = await fix.createFile('spam.txt', orig);
            const expected = `${orig}${dataToAppend}`;

            await fileSystem.appendText(filename, dataToAppend);

            const actual = await fs.readFile(filename, { encoding: 'utf8' });
            expect(actual).to.be.equal(expected);
        });

        test('existing empty file', async () => {
            const filename = await fix.createFile('spam.txt');
            const dataToAppend = `Some Data\n${new Date().toString()}\nAnd another line`;
            const expected = dataToAppend;

            await fileSystem.appendText(filename, dataToAppend);

            const actual = await fs.readFile(filename, { encoding: 'utf8' });
            expect(actual).to.be.equal(expected);
        });

        test('creates the file if it does not already exist', async () => {
            await fileSystem.appendText(DOES_NOT_EXIST, 'spam');

            const actual = await fs.readFile(DOES_NOT_EXIST, { encoding: 'utf8' });
            expect(actual).to.be.equal('spam');
        });

        test('fails if not a file', async () => {
            const dirname = await fix.createDirectory('spam');

            const promise = fileSystem.appendText(dirname, 'spam');

            await expect(promise).to.eventually.be.rejected;
        });
    });

    // non-async

    suite('statSync', () => {
        test('for normal files, gives the file info', async () => {
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            // Ideally we would compare to the result of
            // fileSystem.stat().  However, we do not have access
            // to the VS Code API here.
            const rawStat = await fs.stat(filename);
            const expected = convertStat(rawStat, FileType.File);

            const stat = fileSystem.statSync(filename);

            expect(stat).to.deep.equal(expected);
        });

        test('for symlinks, gives the linked info', async function () {
            if (!SUPPORTS_SYMLINKS) {
                this.skip();
            }
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            const symlink = await fix.createSymlink('x/y/z/eggs.py', filename);
            const rawStat = await fs.stat(filename);
            const expected = convertStat(rawStat, FileType.SymbolicLink | FileType.File);

            const stat = fileSystem.statSync(symlink);

            expect(stat).to.deep.equal(expected);
        });

        test('fails if the file does not exist', async () => {
            expect(() => {
                fileSystem.statSync(DOES_NOT_EXIST);
            }).to.throw();
        });
    });

    suite('readTextSync', () => {
        test('returns contents of a file', async () => {
            const expected = '<some text>';
            const filename = await fix.createFile('x/y/z/spam.py', expected);

            const text = fileSystem.readTextSync(filename);

            expect(text).to.be.equal(expected);
        });

        test('always UTF-8', async () => {
            const expected = '... 😁 ...';
            const filename = await fix.createFile('x/y/z/spam.py', expected);

            const text = fileSystem.readTextSync(filename);

            expect(text).to.equal(expected);
        });

        test('throws an exception if file does not exist', () => {
            expect(() => {
                fileSystem.readTextSync(DOES_NOT_EXIST);
            }).to.throw(Error);
        });
    });

    suite('createReadStream', () => {
        setup(function () {
            // TODO: This appears to be producing
            // false negative test results, so we're skipping
            // it for now.
            // See https://github.com/microsoft/vscode-python/issues/10031.

            this.skip();
        });

        test('returns the correct ReadStream', async () => {
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            const expected = fs.createReadStream(filename);
            expected.destroy();

            const stream = fileSystem.createReadStream(filename);
            stream.destroy();

            expect(stream.path).to.deep.equal(expected.path);
        });

        // Missing tests:
        // * creation fails if the file does not exist
        // * .read() works as expected
        // * .pipe() works as expected
    });

    suite('createWriteStream', () => {
        setup(function () {
            // TODO This appears to be producing
            // false negative test results, so we're skipping
            // it for now.
            // See https://github.com/microsoft/vscode-python/issues/10031.

            this.skip();
        });

        async function writeToStream(filename: string, write: (str: fs.WriteStream) => void) {
            const closeDeferred = createDeferred();
            const stream = fileSystem.createWriteStream(filename);
            stream.on('close', () => closeDeferred.resolve());
            write(stream);
            stream.end();
            stream.close();
            stream.destroy();
            await closeDeferred.promise;
            return stream;
        }

        test('returns the correct WriteStream', async () => {
            const filename = await fix.resolve('x/y/z/spam.py');
            const expected = fs.createWriteStream(filename);
            expected.destroy();

            const stream = await writeToStream(filename, noop);

            expect(stream.path).to.deep.equal(expected.path);
        });

        test('creates the file if missing', async () => {
            const filename = await fix.resolve('x/y/z/spam.py');
            await assertDoesNotExist(filename);
            const data = 'line1\nline2\n';

            await writeToStream(filename, (s) => s.write(data));

            await assertFileText(filename, data);
        });

        test('always UTF-8', async () => {
            const filename = await fix.resolve('x/y/z/spam.py');
            const data = '... 😁 ...';

            await writeToStream(filename, (s) => s.write(data));

            await assertFileText(filename, data);
        });

        test('overwrites existing file', async () => {
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            const data = 'line1\nline2\n';

            await writeToStream(filename, (s) => s.write(data));

            await assertFileText(filename, data);
        });
    });
});

suite('FileSystem - utils', () => {
    let utils: FileSystemUtils;
    let fix: FSFixture;
    setup(async () => {
        utils = FileSystemUtils.withDefaults();
        fix = new FSFixture();

        await assertDoesNotExist(DOES_NOT_EXIST);
    });
    teardown(async () => {
        await fix.cleanUp();
        await fix.ensureDeleted(DOES_NOT_EXIST);
    });

    suite('getFileHash', () => {
        // Since getFileHash() relies on timestamps, we have to take
        // into account filesystem timestamp resolution.  For instance
        // on FAT and HFS it is 1 second.
        // See: https://nodejs.org/api/fs.html#fs_stat_time_values

        test('Getting hash for a file should return non-empty string', async () => {
            const filename = await fix.createFile('x/y/z/spam.py');

            const hash = await utils.getFileHash(filename);

            expect(hash).to.not.equal('');
        });

        test('the returned hash is stable', async () => {
            const filename = await fix.createFile('x/y/z/spam.py');

            const hash1 = await utils.getFileHash(filename);
            const hash2 = await utils.getFileHash(filename);
            await sleep(2_000); // just in case
            const hash3 = await utils.getFileHash(filename);

            expect(hash1).to.equal(hash2);
            expect(hash1).to.equal(hash3);
            expect(hash2).to.equal(hash3);
        });

        test('the returned hash changes with modification', async () => {
            const filename = await fix.createFile('x/y/z/spam.py', 'original text');

            const hash1 = await utils.getFileHash(filename);
            await sleep(2_000); // for filesystems with 1s resolution
            await fs.writeFile(filename, 'new text');
            const hash2 = await utils.getFileHash(filename);

            expect(hash1).to.not.equal(hash2);
        });

        test('the returned hash is unique', async () => {
            const file1 = await fix.createFile('spam.py');
            await sleep(2_000); // for filesystems with 1s resolution
            const file2 = await fix.createFile('x/y/z/spam.py');
            await sleep(2_000); // for filesystems with 1s resolution
            const file3 = await fix.createFile('eggs.py');

            const hash1 = await utils.getFileHash(file1);
            const hash2 = await utils.getFileHash(file2);
            const hash3 = await utils.getFileHash(file3);

            expect(hash1).to.not.equal(hash2);
            expect(hash1).to.not.equal(hash3);
            expect(hash2).to.not.equal(hash3);
        });

        test('Getting hash for non existent file should throw error', async () => {
            const promise = utils.getFileHash(DOES_NOT_EXIST);

            await expect(promise).to.eventually.be.rejected;
        });
    });

    suite('search', () => {
        test('found matches', async () => {
            const pattern = await fix.resolve(`x/y/z/spam.*`);
            const expected: string[] = [
                await fix.createFile('x/y/z/spam.py'),
                await fix.createFile('x/y/z/spam.pyc'),
                await fix.createFile('x/y/z/spam.so'),
                await fix.createDirectory('x/y/z/spam.data'),
            ];
            // non-matches
            await fix.createFile('x/spam.py');
            await fix.createFile('x/y/z/eggs.py');
            await fix.createFile('x/y/z/spam-all.py');
            await fix.createFile('x/y/z/spam');
            await fix.createFile('x/spam.py');

            let files = await utils.search(pattern);

            // For whatever reason, on Windows "search()" is
            // returning filenames with forward slasshes...
            files = files.map(fixPath);
            expect(files.sort()).to.deep.equal(expected.sort());
        });

        test('no matches', async () => {
            const pattern = await fix.resolve(`x/y/z/spam.*`);

            const files = await utils.search(pattern);

            expect(files).to.deep.equal([]);
        });
    });

    suite('fileExistsSync', () => {
        test('want file, got file', async () => {
            const filename = await fix.createFile('x/y/z/spam.py');

            const exists = utils.fileExistsSync(filename);

            expect(exists).to.equal(true);
        });

        test('want file, not file', async () => {
            const filename = await fix.createDirectory('x/y/z/spam.py');

            const exists = utils.fileExistsSync(filename);

            // Note that currently the "file" can be *anything*.  It
            // doesn't have to be just a regular file.  This is the
            // way it already worked, so we're keeping it that way
            // for now.
            expect(exists).to.equal(true);
        });

        test('symlink', async function () {
            if (!SUPPORTS_SYMLINKS) {
                this.skip();
            }
            const filename = await fix.createFile('x/y/z/spam.py', '...');
            const symlink = await fix.createSymlink('x/y/z/eggs.py', filename);

            const exists = utils.fileExistsSync(symlink);

            // Note that currently the "file" can be *anything*.  It
            // doesn't have to be just a regular file.  This is the
            // way it already worked, so we're keeping it that way
            // for now.
            expect(exists).to.equal(true);
        });

        test('unknown', async function () {
            if (!SUPPORTS_SOCKETS) {
                this.skip();
            }
            const sockFile = await fix.createSocket('x/y/z/ipc.sock');

            const exists = utils.fileExistsSync(sockFile);

            // Note that currently the "file" can be *anything*.  It
            // doesn't have to be just a regular file.  This is the
            // way it already worked, so we're keeping it that way
            // for now.
            expect(exists).to.equal(true);
        });
    });
});

suite('FileSystem', () => {
    let fileSystem: FileSystem;
    let fix: FSFixture;
    setup(async () => {
        fileSystem = new FileSystem();
        fix = new FSFixture();

        await assertDoesNotExist(DOES_NOT_EXIST);
    });
    teardown(async () => {
        await fix.cleanUp();
        await fix.ensureDeleted(DOES_NOT_EXIST);
    });

    suite('path-related', () => {
        const paths = fs.FileSystemPaths.withDefaults();
        const pathUtils = fs.FileSystemPathUtils.withDefaults(paths);

        suite('directorySeparatorChar', () => {
            // tested fully in the FileSystemPaths tests.

            test('matches wrapped object', () => {
                const expected = paths.sep;

                const sep = fileSystem.directorySeparatorChar;

                expect(sep).to.equal(expected);
            });
        });

        suite('arePathsSame', () => {
            // tested fully in the FileSystemPathUtils tests.

            test('matches wrapped object', () => {
                const file1 = fixPath('a/b/c/spam.py');
                const file2 = fixPath('a/b/c/Spam.py');
                const expected = pathUtils.arePathsSame(file1, file2);

                const areSame = fileSystem.arePathsSame(file1, file2);

                expect(areSame).to.equal(expected);
            });
        });
    });

    suite('raw', () => {
        suite('appendFile', () => {
            test('wraps the low-level impl', async () => {
                const filename = await fix.createFile('spam.txt');
                const dataToAppend = `Some Data\n${new Date().toString()}\nAnd another line`;
                const expected = dataToAppend;

                await fileSystem.appendFile(filename, dataToAppend);

                const actual = await fs.readFile(filename, { encoding: 'utf8' });
                expect(actual).to.be.equal(expected);
            });
        });

        suite('chmod (non-Windows)', () => {
            suiteSetup(function () {
                // On Windows, chmod won't have any effect on the file itself.
                if (WINDOWS) {
                    this.skip();
                }
            });

            test('wraps the low-level impl', async () => {
                const filename = await fix.createFile('spam.py', '...');
                await fs.chmod(filename, 0o644);

                await fileSystem.chmod(filename, '755');

                const stat = await fs.stat(filename);
                expect(stat.mode & 0o777).to.equal(0o755);
            });
        });

        //=============================
        // sync methods

        suite('readFileSync', () => {
            test('wraps the low-level impl', async () => {
                const expected = '<some text>';
                const filename = await fix.createFile('x/y/z/spam.py', expected);

                const text = fileSystem.readFileSync(filename);

                expect(text).to.be.equal(expected);
            });
        });

        suite('createReadStream', () => {
            test('wraps the low-level impl', async function () {
                // This test seems to randomly fail.

                this.skip();

                const filename = await fix.createFile('x/y/z/spam.py', '...');
                const expected = fs.createReadStream(filename);
                expected.destroy();

                const stream = fileSystem.createReadStream(filename);
                stream.destroy();

                expect(stream.path).to.deep.equal(expected.path);
            });
        });

        suite('createWriteStream', () => {
            test('wraps the low-level impl', async function () {
                // This test seems to randomly fail.

                this.skip();

                const filename = await fix.resolve('x/y/z/spam.py');
                const expected = fs.createWriteStream(filename);
                expected.destroy();

                const stream = fileSystem.createWriteStream(filename);
                stream.destroy();

                expect(stream.path).to.deep.equal(expected.path);
            });
        });
    });

    suite('utils', () => {
        suite('getFileHash', () => {
            // Since getFileHash() relies on timestamps, we have to take
            // into account filesystem timestamp resolution.  For instance
            // on FAT and HFS it is 1 second.
            // See: https://nodejs.org/api/fs.html#fs_stat_time_values

            test('Getting hash for a file should return non-empty string', async () => {
                const filename = await fix.createFile('x/y/z/spam.py');

                const hash = await fileSystem.getFileHash(filename);

                expect(hash).to.not.equal('');
            });

            test('the returned hash is stable', async () => {
                const filename = await fix.createFile('x/y/z/spam.py');

                const hash1 = await fileSystem.getFileHash(filename);
                const hash2 = await fileSystem.getFileHash(filename);
                await sleep(2_000); // just in case
                const hash3 = await fileSystem.getFileHash(filename);

                expect(hash1).to.equal(hash2);
                expect(hash1).to.equal(hash3);
                expect(hash2).to.equal(hash3);
            });

            test('the returned hash changes with modification', async () => {
                const filename = await fix.createFile('x/y/z/spam.py', 'original text');

                const hash1 = await fileSystem.getFileHash(filename);
                await sleep(2_000); // for filesystems with 1s resolution
                await fs.writeFile(filename, 'new text');
                const hash2 = await fileSystem.getFileHash(filename);

                expect(hash1).to.not.equal(hash2);
            });

            test('the returned hash is unique', async () => {
                const file1 = await fix.createFile('spam.py');
                await sleep(2_000); // for filesystems with 1s resolution
                const file2 = await fix.createFile('x/y/z/spam.py');
                await sleep(2_000); // for filesystems with 1s resolution
                const file3 = await fix.createFile('eggs.py');

                const hash1 = await fileSystem.getFileHash(file1);
                const hash2 = await fileSystem.getFileHash(file2);
                const hash3 = await fileSystem.getFileHash(file3);

                expect(hash1).to.not.equal(hash2);
                expect(hash1).to.not.equal(hash3);
                expect(hash2).to.not.equal(hash3);
            });

            test('Getting hash for non existent file should throw error', async () => {
                const promise = fileSystem.getFileHash(DOES_NOT_EXIST);

                await expect(promise).to.eventually.be.rejected;
            });
        });

        suite('search', () => {
            test('found matches', async () => {
                const pattern = await fix.resolve(`x/y/z/spam.*`);
                const expected: string[] = [
                    await fix.createFile('x/y/z/spam.py'),
                    await fix.createFile('x/y/z/spam.pyc'),
                    await fix.createFile('x/y/z/spam.so'),
                    await fix.createDirectory('x/y/z/spam.data'),
                ];
                // non-matches
                await fix.createFile('x/spam.py');
                await fix.createFile('x/y/z/eggs.py');
                await fix.createFile('x/y/z/spam-all.py');
                await fix.createFile('x/y/z/spam');
                await fix.createFile('x/spam.py');
                await fix.createFile('x/y/z/.net.py');
                let files = await fileSystem.search(pattern);

                // For whatever reason, on Windows "search()" is
                // returning filenames with forward slasshes...
                files = files.map(fixPath);
                expect(files.sort()).to.deep.equal(expected.sort());
            });
            test('found dot matches', async () => {
                const dir = await fix.resolve(`x/y/z`);
                const expected: string[] = [
                    await fix.createFile('x/y/z/spam.py'),
                    await fix.createFile('x/y/z/.net.py'),
                ];
                // non-matches
                await fix.createFile('x/spam.py');
                await fix.createFile('x/y/z/spam');
                await fix.createFile('x/spam.py');
                let files = await fileSystem.search(`${dir}/**/*.py`, undefined, true);

                // For whatever reason, on Windows "search()" is
                // returning filenames with forward slasshes...
                files = files.map(fixPath);
                expect(files.sort()).to.deep.equal(expected.sort());
            });

            test('no matches', async () => {
                const pattern = await fix.resolve(`x/y/z/spam.*`);

                const files = await fileSystem.search(pattern);

                expect(files).to.deep.equal([]);
            });
        });

        //=============================
        // sync methods

        suite('fileExistsSync', () => {
            test('want file, got file', async () => {
                const filename = await fix.createFile('x/y/z/spam.py');

                const exists = fileSystem.fileExistsSync(filename);

                expect(exists).to.equal(true);
            });

            test('want file, not file', async () => {
                const filename = await fix.createDirectory('x/y/z/spam.py');

                const exists = fileSystem.fileExistsSync(filename);

                // Note that currently the "file" can be *anything*.  It
                // doesn't have to be just a regular file.  This is the
                // way it already worked, so we're keeping it that way
                // for now.
                expect(exists).to.equal(true);
            });

            test('symlink', async function () {
                if (!SUPPORTS_SYMLINKS) {
                    this.skip();
                }
                const filename = await fix.createFile('x/y/z/spam.py', '...');
                const symlink = await fix.createSymlink('x/y/z/eggs.py', filename);

                const exists = fileSystem.fileExistsSync(symlink);

                // Note that currently the "file" can be *anything*.  It
                // doesn't have to be just a regular file.  This is the
                // way it already worked, so we're keeping it that way
                // for now.
                expect(exists).to.equal(true);
            });

            test('unknown', async function () {
                if (!SUPPORTS_SOCKETS) {
                    this.skip();
                }
                const sockFile = await fix.createSocket('x/y/z/ipc.sock');

                const exists = fileSystem.fileExistsSync(sockFile);

                // Note that currently the "file" can be *anything*.  It
                // doesn't have to be just a regular file.  This is the
                // way it already worked, so we're keeping it that way
                // for now.
                expect(exists).to.equal(true);
            });
        });
    });
});
