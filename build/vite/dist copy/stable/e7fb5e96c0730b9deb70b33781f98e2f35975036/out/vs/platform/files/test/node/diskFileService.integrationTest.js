/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync, promises } from 'fs';
import { tmpdir } from 'os';
import { timeout } from '../../../../base/common/async.js';
import { bufferToReadable, bufferToStream, streamToBuffer, streamToBufferReadableStream, VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { basename, dirname, join, posix } from '../../../../base/common/path.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { Promises } from '../../../../base/node/pfs.js';
import { flakySuite, getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { etag, FileOperationError, FilePermission, hasFileAtomicReadCapability, hasOpenReadWriteCloseCapability, NotModifiedSinceFileOperationError, TooLargeFileOperationError } from '../../common/files.js';
import { FileService } from '../../common/fileService.js';
import { DiskFileSystemProvider } from '../../node/diskFileSystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
function getByName(root, name) {
    if (root.children === undefined) {
        return undefined;
    }
    return root.children.find(child => child.name === name);
}
function toLineByLineReadable(content) {
    let chunks = content.split('\n');
    chunks = chunks.map((chunk, index) => {
        if (index === 0) {
            return chunk;
        }
        return '\n' + chunk;
    });
    return {
        read() {
            const chunk = chunks.shift();
            if (typeof chunk === 'string') {
                return VSBuffer.fromString(chunk);
            }
            return null;
        }
    };
}
export class TestDiskFileSystemProvider extends DiskFileSystemProvider {
    constructor() {
        super(...arguments);
        this.totalBytesRead = 0;
        this.invalidStatSize = false;
        this.smallStatSize = false;
        this.readonly = false;
    }
    get capabilities() {
        if (!this._testCapabilities) {
            this._testCapabilities =
                2 /* FileSystemProviderCapabilities.FileReadWrite */ |
                    4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ |
                    16 /* FileSystemProviderCapabilities.FileReadStream */ |
                    4096 /* FileSystemProviderCapabilities.Trash */ |
                    8 /* FileSystemProviderCapabilities.FileFolderCopy */ |
                    8192 /* FileSystemProviderCapabilities.FileWriteUnlock */ |
                    16384 /* FileSystemProviderCapabilities.FileAtomicRead */ |
                    32768 /* FileSystemProviderCapabilities.FileAtomicWrite */ |
                    65536 /* FileSystemProviderCapabilities.FileAtomicDelete */ |
                    131072 /* FileSystemProviderCapabilities.FileClone */ |
                    524288 /* FileSystemProviderCapabilities.FileAppend */ |
                    262144 /* FileSystemProviderCapabilities.FileRealpath */;
            if (isLinux) {
                this._testCapabilities |= 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */;
            }
        }
        return this._testCapabilities;
    }
    set capabilities(capabilities) {
        this._testCapabilities = capabilities;
    }
    setInvalidStatSize(enabled) {
        this.invalidStatSize = enabled;
    }
    setSmallStatSize(enabled) {
        this.smallStatSize = enabled;
    }
    setReadonly(readonly) {
        this.readonly = readonly;
    }
    async stat(resource) {
        const res = await super.stat(resource);
        if (this.invalidStatSize) {
            // eslint-disable-next-line local/code-no-any-casts
            res.size = String(res.size); // for https://github.com/microsoft/vscode/issues/72909
        }
        else if (this.smallStatSize) {
            // eslint-disable-next-line local/code-no-any-casts
            res.size = 1;
        }
        else if (this.readonly) {
            // eslint-disable-next-line local/code-no-any-casts
            res.permissions = FilePermission.Readonly;
        }
        return res;
    }
    async read(fd, pos, data, offset, length) {
        const bytesRead = await super.read(fd, pos, data, offset, length);
        this.totalBytesRead += bytesRead;
        return bytesRead;
    }
    async readFile(resource, options) {
        const res = await super.readFile(resource, options);
        this.totalBytesRead += res.byteLength;
        return res;
    }
}
DiskFileSystemProvider.configureFlushOnWrite(false); // speed up all unit tests by disabling flush on write
flakySuite('Disk File Service', function () {
    const testSchema = 'test';
    let service;
    let fileProvider;
    let testProvider;
    let testDir;
    const disposables = new DisposableStore();
    setup(async () => {
        const logService = new NullLogService();
        service = disposables.add(new FileService(logService));
        fileProvider = disposables.add(new TestDiskFileSystemProvider(logService));
        disposables.add(service.registerProvider(Schemas.file, fileProvider));
        testProvider = disposables.add(new TestDiskFileSystemProvider(logService));
        disposables.add(service.registerProvider(testSchema, testProvider));
        testDir = getRandomTestPath(tmpdir(), 'vsctests', 'diskfileservice');
        const sourceDir = FileAccess.asFileUri('vs/platform/files/test/node/fixtures/service').fsPath;
        await Promises.copy(sourceDir, testDir, { preserveSymlinks: false });
    });
    teardown(() => {
        disposables.clear();
        return Promises.rm(testDir);
    });
    test('createFolder', async () => {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const parent = await service.resolve(URI.file(testDir));
        const newFolderResource = URI.file(join(parent.resource.fsPath, 'newFolder'));
        const newFolder = await service.createFolder(newFolderResource);
        assert.strictEqual(newFolder.name, 'newFolder');
        assert.strictEqual(existsSync(newFolder.resource.fsPath), true);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, newFolderResource.fsPath);
        assert.strictEqual(event.operation, 0 /* FileOperation.CREATE */);
        assert.strictEqual(event.target.resource.fsPath, newFolderResource.fsPath);
        assert.strictEqual(event.target.isDirectory, true);
    });
    test('createFolder: creating multiple folders at once', async () => {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const multiFolderPaths = ['a', 'couple', 'of', 'folders'];
        const parent = await service.resolve(URI.file(testDir));
        const newFolderResource = URI.file(join(parent.resource.fsPath, ...multiFolderPaths));
        const newFolder = await service.createFolder(newFolderResource);
        const lastFolderName = multiFolderPaths[multiFolderPaths.length - 1];
        assert.strictEqual(newFolder.name, lastFolderName);
        assert.strictEqual(existsSync(newFolder.resource.fsPath), true);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, newFolderResource.fsPath);
        assert.strictEqual(event.operation, 0 /* FileOperation.CREATE */);
        assert.strictEqual(event.target.resource.fsPath, newFolderResource.fsPath);
        assert.strictEqual(event.target.isDirectory, true);
    });
    test('exists', async () => {
        let exists = await service.exists(URI.file(testDir));
        assert.strictEqual(exists, true);
        exists = await service.exists(URI.file(testDir + 'something'));
        assert.strictEqual(exists, false);
    });
    test('resolve - file', async () => {
        const resource = FileAccess.asFileUri('vs/platform/files/test/node/fixtures/resolver/index.html');
        const resolved = await service.resolve(resource);
        assert.strictEqual(resolved.name, 'index.html');
        assert.strictEqual(resolved.isFile, true);
        assert.strictEqual(resolved.isDirectory, false);
        assert.strictEqual(resolved.readonly, false);
        assert.strictEqual(resolved.isSymbolicLink, false);
        assert.strictEqual(resolved.resource.toString(), resource.toString());
        assert.strictEqual(resolved.children, undefined);
        assert.ok(resolved.mtime > 0);
        assert.ok(resolved.ctime > 0);
        assert.ok(resolved.size > 0);
    });
    test('resolve - directory', async () => {
        const testsElements = ['examples', 'other', 'index.html', 'site.css'];
        const resource = FileAccess.asFileUri('vs/platform/files/test/node/fixtures/resolver');
        const result = await service.resolve(resource);
        assert.ok(result);
        assert.strictEqual(result.resource.toString(), resource.toString());
        assert.strictEqual(result.name, 'resolver');
        assert.ok(result.children);
        assert.ok(result.children.length > 0);
        assert.ok(result.isDirectory);
        assert.strictEqual(result.readonly, false);
        assert.ok(result.mtime > 0);
        assert.ok(result.ctime > 0);
        assert.strictEqual(result.children.length, testsElements.length);
        assert.ok(result.children.every(entry => {
            return testsElements.some(name => {
                return basename(entry.resource.fsPath) === name;
            });
        }));
        result.children.forEach(value => {
            assert.ok(basename(value.resource.fsPath));
            if (['examples', 'other'].indexOf(basename(value.resource.fsPath)) >= 0) {
                assert.ok(value.isDirectory);
                assert.strictEqual(value.mtime, undefined);
                assert.strictEqual(value.ctime, undefined);
            }
            else if (basename(value.resource.fsPath) === 'index.html') {
                assert.ok(!value.isDirectory);
                assert.ok(!value.children);
                assert.strictEqual(value.mtime, undefined);
                assert.strictEqual(value.ctime, undefined);
            }
            else if (basename(value.resource.fsPath) === 'site.css') {
                assert.ok(!value.isDirectory);
                assert.ok(!value.children);
                assert.strictEqual(value.mtime, undefined);
                assert.strictEqual(value.ctime, undefined);
            }
            else {
                assert.fail('Unexpected value ' + basename(value.resource.fsPath));
            }
        });
    });
    test('resolve - directory - with metadata', async () => {
        const testsElements = ['examples', 'other', 'index.html', 'site.css'];
        const result = await service.resolve(FileAccess.asFileUri('vs/platform/files/test/node/fixtures/resolver'), { resolveMetadata: true });
        assert.ok(result);
        assert.strictEqual(result.name, 'resolver');
        assert.ok(result.children);
        assert.ok(result.children.length > 0);
        assert.ok(result.isDirectory);
        assert.ok(result.mtime > 0);
        assert.ok(result.ctime > 0);
        assert.strictEqual(result.children.length, testsElements.length);
        assert.ok(result.children.every(entry => {
            return testsElements.some(name => {
                return basename(entry.resource.fsPath) === name;
            });
        }));
        assert.ok(result.children.every(entry => entry.etag.length > 0));
        result.children.forEach(value => {
            assert.ok(basename(value.resource.fsPath));
            if (['examples', 'other'].indexOf(basename(value.resource.fsPath)) >= 0) {
                assert.ok(value.isDirectory);
                assert.ok(value.mtime > 0);
                assert.ok(value.ctime > 0);
            }
            else if (basename(value.resource.fsPath) === 'index.html') {
                assert.ok(!value.isDirectory);
                assert.ok(!value.children);
                assert.ok(value.mtime > 0);
                assert.ok(value.ctime > 0);
            }
            else if (basename(value.resource.fsPath) === 'site.css') {
                assert.ok(!value.isDirectory);
                assert.ok(!value.children);
                assert.ok(value.mtime > 0);
                assert.ok(value.ctime > 0);
            }
            else {
                assert.fail('Unexpected value ' + basename(value.resource.fsPath));
            }
        });
    });
    test('resolve - directory with resolveTo', async () => {
        const resolved = await service.resolve(URI.file(testDir), { resolveTo: [URI.file(join(testDir, 'deep'))] });
        assert.strictEqual(resolved.children.length, 8);
        const deep = (getByName(resolved, 'deep'));
        assert.strictEqual(deep.children.length, 4);
    });
    test('resolve - directory - resolveTo single directory', async () => {
        const resolverFixturesPath = FileAccess.asFileUri('vs/platform/files/test/node/fixtures/resolver').fsPath;
        const result = await service.resolve(URI.file(resolverFixturesPath), { resolveTo: [URI.file(join(resolverFixturesPath, 'other/deep'))] });
        assert.ok(result);
        assert.ok(result.children);
        assert.ok(result.children.length > 0);
        assert.ok(result.isDirectory);
        const children = result.children;
        assert.strictEqual(children.length, 4);
        const other = getByName(result, 'other');
        assert.ok(other);
        assert.ok(other.children.length > 0);
        const deep = getByName(other, 'deep');
        assert.ok(deep);
        assert.ok(deep.children.length > 0);
        assert.strictEqual(deep.children.length, 4);
    });
    test('resolve directory - resolveTo multiple directories', () => {
        return testResolveDirectoryWithTarget(false);
    });
    test('resolve directory - resolveTo with a URI that has query parameter (https://github.com/microsoft/vscode/issues/128151)', () => {
        return testResolveDirectoryWithTarget(true);
    });
    async function testResolveDirectoryWithTarget(withQueryParam) {
        const resolverFixturesPath = FileAccess.asFileUri('vs/platform/files/test/node/fixtures/resolver').fsPath;
        const result = await service.resolve(URI.file(resolverFixturesPath).with({ query: withQueryParam ? 'test' : undefined }), {
            resolveTo: [
                URI.file(join(resolverFixturesPath, 'other/deep')).with({ query: withQueryParam ? 'test' : undefined }),
                URI.file(join(resolverFixturesPath, 'examples')).with({ query: withQueryParam ? 'test' : undefined })
            ]
        });
        assert.ok(result);
        assert.ok(result.children);
        assert.ok(result.children.length > 0);
        assert.ok(result.isDirectory);
        const children = result.children;
        assert.strictEqual(children.length, 4);
        const other = getByName(result, 'other');
        assert.ok(other);
        assert.ok(other.children.length > 0);
        const deep = getByName(other, 'deep');
        assert.ok(deep);
        assert.ok(deep.children.length > 0);
        assert.strictEqual(deep.children.length, 4);
        const examples = getByName(result, 'examples');
        assert.ok(examples);
        assert.ok(examples.children.length > 0);
        assert.strictEqual(examples.children.length, 4);
    }
    test('resolve directory - resolveSingleChildFolders', async () => {
        const resolverFixturesPath = FileAccess.asFileUri('vs/platform/files/test/node/fixtures/resolver/other').fsPath;
        const result = await service.resolve(URI.file(resolverFixturesPath), { resolveSingleChildDescendants: true });
        assert.ok(result);
        assert.ok(result.children);
        assert.ok(result.children.length > 0);
        assert.ok(result.isDirectory);
        const children = result.children;
        assert.strictEqual(children.length, 1);
        const deep = getByName(result, 'deep');
        assert.ok(deep);
        assert.ok(deep.children.length > 0);
        assert.strictEqual(deep.children.length, 4);
    });
    test('resolves', async () => {
        const res = await service.resolveAll([
            { resource: URI.file(testDir), options: { resolveTo: [URI.file(join(testDir, 'deep'))] } },
            { resource: URI.file(join(testDir, 'deep')) }
        ]);
        const r1 = (res[0].stat);
        assert.strictEqual(r1.children.length, 8);
        const deep = (getByName(r1, 'deep'));
        assert.strictEqual(deep.children.length, 4);
        const r2 = (res[1].stat);
        assert.strictEqual(r2.children.length, 4);
        assert.strictEqual(r2.name, 'deep');
    });
    test('resolve / realpath - folder symbolic link', async () => {
        const link = URI.file(join(testDir, 'deep-link'));
        await promises.symlink(join(testDir, 'deep'), link.fsPath, 'junction');
        const resolved = await service.resolve(link);
        assert.strictEqual(resolved.children.length, 4);
        assert.strictEqual(resolved.isDirectory, true);
        assert.strictEqual(resolved.isSymbolicLink, true);
        const realpath = await service.realpath(link);
        assert.ok(realpath);
        assert.strictEqual(basename(realpath.fsPath), 'deep');
    });
    (isWindows ? test.skip /* windows: cannot create file symbolic link without elevated context */ : test)('resolve - file symbolic link', async () => {
        const link = URI.file(join(testDir, 'lorem.txt-linked'));
        await promises.symlink(join(testDir, 'lorem.txt'), link.fsPath);
        const resolved = await service.resolve(link);
        assert.strictEqual(resolved.isDirectory, false);
        assert.strictEqual(resolved.isSymbolicLink, true);
    });
    test('resolve - symbolic link pointing to nonexistent file does not break', async () => {
        await promises.symlink(join(testDir, 'foo'), join(testDir, 'bar'), 'junction');
        const resolved = await service.resolve(URI.file(testDir));
        assert.strictEqual(resolved.isDirectory, true);
        assert.strictEqual(resolved.children.length, 9);
        const resolvedLink = resolved.children?.find(child => child.name === 'bar' && child.isSymbolicLink);
        assert.ok(resolvedLink);
        assert.ok(!resolvedLink?.isDirectory);
        assert.ok(!resolvedLink?.isFile);
    });
    test('stat - file', async () => {
        const resource = FileAccess.asFileUri('vs/platform/files/test/node/fixtures/resolver/index.html');
        const resolved = await service.stat(resource);
        assert.strictEqual(resolved.name, 'index.html');
        assert.strictEqual(resolved.isFile, true);
        assert.strictEqual(resolved.isDirectory, false);
        assert.strictEqual(resolved.readonly, false);
        assert.strictEqual(resolved.isSymbolicLink, false);
        assert.strictEqual(resolved.resource.toString(), resource.toString());
        assert.ok(resolved.mtime > 0);
        assert.ok(resolved.ctime > 0);
        assert.ok(resolved.size > 0);
    });
    test('stat - directory', async () => {
        const resource = FileAccess.asFileUri('vs/platform/files/test/node/fixtures/resolver');
        const result = await service.stat(resource);
        assert.ok(result);
        assert.strictEqual(result.resource.toString(), resource.toString());
        assert.strictEqual(result.name, 'resolver');
        assert.ok(result.isDirectory);
        assert.strictEqual(result.readonly, false);
        assert.ok(result.mtime > 0);
        assert.ok(result.ctime > 0);
    });
    // The executable bit does not exist on Windows so use a condition not skip
    if (!isWindows) {
        test('stat - executable', async () => {
            const nonExecutable = FileAccess.asFileUri('vs/platform/files/test/node/fixtures/executable/non_executable');
            let resolved = await service.stat(nonExecutable);
            assert.strictEqual(resolved.isFile, true);
            assert.strictEqual(resolved.executable, false);
            const executable = FileAccess.asFileUri('vs/platform/files/test/node/fixtures/executable/executable');
            resolved = await service.stat(executable);
            assert.strictEqual(resolved.isFile, true);
            assert.strictEqual(resolved.executable, true);
        });
    }
    test('deleteFile (non recursive)', async () => {
        return testDeleteFile(false, false);
    });
    test('deleteFile (recursive)', async () => {
        return testDeleteFile(false, true);
    });
    (isLinux /* trash is unreliable on Linux */ ? test.skip : test)('deleteFile (useTrash)', async () => {
        return testDeleteFile(true, false);
    });
    async function testDeleteFile(useTrash, recursive) {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const resource = URI.file(join(testDir, 'deep', 'conway.js'));
        const source = await service.resolve(resource);
        assert.strictEqual(await service.canDelete(source.resource, { useTrash, recursive }), true);
        await service.del(source.resource, { useTrash, recursive });
        assert.strictEqual(existsSync(source.resource.fsPath), false);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, resource.fsPath);
        assert.strictEqual(event.operation, 1 /* FileOperation.DELETE */);
        let error = undefined;
        try {
            await service.del(source.resource, { useTrash, recursive });
        }
        catch (e) {
            error = e;
        }
        assert.ok(error);
        assert.strictEqual(error.fileOperationResult, 1 /* FileOperationResult.FILE_NOT_FOUND */);
    }
    (isWindows ? test.skip /* windows: cannot create file symbolic link without elevated context */ : test)('deleteFile - symbolic link (exists)', async () => {
        const target = URI.file(join(testDir, 'lorem.txt'));
        const link = URI.file(join(testDir, 'lorem.txt-linked'));
        await promises.symlink(target.fsPath, link.fsPath);
        const source = await service.resolve(link);
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        assert.strictEqual(await service.canDelete(source.resource), true);
        await service.del(source.resource);
        assert.strictEqual(existsSync(source.resource.fsPath), false);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, link.fsPath);
        assert.strictEqual(event.operation, 1 /* FileOperation.DELETE */);
        assert.strictEqual(existsSync(target.fsPath), true); // target the link pointed to is never deleted
    });
    (isWindows ? test.skip /* windows: cannot create file symbolic link without elevated context */ : test)('deleteFile - symbolic link (pointing to nonexistent file)', async () => {
        const target = URI.file(join(testDir, 'foo'));
        const link = URI.file(join(testDir, 'bar'));
        await promises.symlink(target.fsPath, link.fsPath);
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        assert.strictEqual(await service.canDelete(link), true);
        await service.del(link);
        assert.strictEqual(existsSync(link.fsPath), false);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, link.fsPath);
        assert.strictEqual(event.operation, 1 /* FileOperation.DELETE */);
    });
    test('deleteFolder (recursive)', async () => {
        return testDeleteFolderRecursive(false, false);
    });
    test('deleteFolder (recursive, atomic)', async () => {
        return testDeleteFolderRecursive(false, { postfix: '.vsctmp' });
    });
    (isLinux /* trash is unreliable on Linux */ ? test.skip : test)('deleteFolder (recursive, useTrash)', async () => {
        return testDeleteFolderRecursive(true, false);
    });
    async function testDeleteFolderRecursive(useTrash, atomic) {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const resource = URI.file(join(testDir, 'deep'));
        const source = await service.resolve(resource);
        assert.strictEqual(await service.canDelete(source.resource, { recursive: true, useTrash, atomic }), true);
        await service.del(source.resource, { recursive: true, useTrash, atomic });
        assert.strictEqual(existsSync(source.resource.fsPath), false);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, resource.fsPath);
        assert.strictEqual(event.operation, 1 /* FileOperation.DELETE */);
    }
    test('deleteFolder (non recursive)', async () => {
        const resource = URI.file(join(testDir, 'deep'));
        const source = await service.resolve(resource);
        assert.ok((await service.canDelete(source.resource)) instanceof Error);
        let error;
        try {
            await service.del(source.resource);
        }
        catch (e) {
            error = e;
        }
        assert.ok(error);
    });
    test('deleteFolder empty folder (recursive)', () => {
        return testDeleteEmptyFolder(true);
    });
    test('deleteFolder empty folder (non recursive)', () => {
        return testDeleteEmptyFolder(false);
    });
    async function testDeleteEmptyFolder(recursive) {
        const { resource } = await service.createFolder(URI.file(join(testDir, 'deep', 'empty')));
        await service.del(resource, { recursive });
        assert.strictEqual(await service.exists(resource), false);
    }
    test('move', async () => {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const source = URI.file(join(testDir, 'index.html'));
        const sourceContents = readFileSync(source.fsPath);
        const target = URI.file(join(dirname(source.fsPath), 'other.html'));
        assert.strictEqual(await service.canMove(source, target), true);
        const renamed = await service.move(source, target);
        assert.strictEqual(existsSync(renamed.resource.fsPath), true);
        assert.strictEqual(existsSync(source.fsPath), false);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, source.fsPath);
        assert.strictEqual(event.operation, 2 /* FileOperation.MOVE */);
        assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
        const targetContents = readFileSync(target.fsPath);
        assert.strictEqual(sourceContents.byteLength, targetContents.byteLength);
        assert.strictEqual(sourceContents.toString(), targetContents.toString());
    });
    test('move - across providers (buffered => buffered)', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        setCapabilities(testProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testMoveAcrossProviders();
    });
    test('move - across providers (unbuffered => unbuffered)', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        setCapabilities(testProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testMoveAcrossProviders();
    });
    test('move - across providers (buffered => unbuffered)', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        setCapabilities(testProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testMoveAcrossProviders();
    });
    test('move - across providers (unbuffered => buffered)', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        setCapabilities(testProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testMoveAcrossProviders();
    });
    test('move - across providers - large (buffered => buffered)', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        setCapabilities(testProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testMoveAcrossProviders('lorem.txt');
    });
    test('move - across providers - large (unbuffered => unbuffered)', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        setCapabilities(testProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testMoveAcrossProviders('lorem.txt');
    });
    test('move - across providers - large (buffered => unbuffered)', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        setCapabilities(testProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testMoveAcrossProviders('lorem.txt');
    });
    test('move - across providers - large (unbuffered => buffered)', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        setCapabilities(testProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testMoveAcrossProviders('lorem.txt');
    });
    async function testMoveAcrossProviders(sourceFile = 'index.html') {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const source = URI.file(join(testDir, sourceFile));
        const sourceContents = readFileSync(source.fsPath);
        const target = URI.file(join(dirname(source.fsPath), 'other.html')).with({ scheme: testSchema });
        assert.strictEqual(await service.canMove(source, target), true);
        const renamed = await service.move(source, target);
        assert.strictEqual(existsSync(renamed.resource.fsPath), true);
        assert.strictEqual(existsSync(source.fsPath), false);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, source.fsPath);
        assert.strictEqual(event.operation, 3 /* FileOperation.COPY */);
        assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
        const targetContents = readFileSync(target.fsPath);
        assert.strictEqual(sourceContents.byteLength, targetContents.byteLength);
        assert.strictEqual(sourceContents.toString(), targetContents.toString());
    }
    test('move - multi folder', async () => {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const multiFolderPaths = ['a', 'couple', 'of', 'folders'];
        const renameToPath = join(...multiFolderPaths, 'other.html');
        const source = URI.file(join(testDir, 'index.html'));
        assert.strictEqual(await service.canMove(source, URI.file(join(dirname(source.fsPath), renameToPath))), true);
        const renamed = await service.move(source, URI.file(join(dirname(source.fsPath), renameToPath)));
        assert.strictEqual(existsSync(renamed.resource.fsPath), true);
        assert.strictEqual(existsSync(source.fsPath), false);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, source.fsPath);
        assert.strictEqual(event.operation, 2 /* FileOperation.MOVE */);
        assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
    });
    test('move - directory', async () => {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const source = URI.file(join(testDir, 'deep'));
        assert.strictEqual(await service.canMove(source, URI.file(join(dirname(source.fsPath), 'deeper'))), true);
        const renamed = await service.move(source, URI.file(join(dirname(source.fsPath), 'deeper')));
        assert.strictEqual(existsSync(renamed.resource.fsPath), true);
        assert.strictEqual(existsSync(source.fsPath), false);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, source.fsPath);
        assert.strictEqual(event.operation, 2 /* FileOperation.MOVE */);
        assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
    });
    test('move - directory - across providers (buffered => buffered)', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        setCapabilities(testProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testMoveFolderAcrossProviders();
    });
    test('move - directory - across providers (unbuffered => unbuffered)', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        setCapabilities(testProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testMoveFolderAcrossProviders();
    });
    test('move - directory - across providers (buffered => unbuffered)', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        setCapabilities(testProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testMoveFolderAcrossProviders();
    });
    test('move - directory - across providers (unbuffered => buffered)', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        setCapabilities(testProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testMoveFolderAcrossProviders();
    });
    async function testMoveFolderAcrossProviders() {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const source = URI.file(join(testDir, 'deep'));
        const sourceChildren = readdirSync(source.fsPath);
        const target = URI.file(join(dirname(source.fsPath), 'deeper')).with({ scheme: testSchema });
        assert.strictEqual(await service.canMove(source, target), true);
        const renamed = await service.move(source, target);
        assert.strictEqual(existsSync(renamed.resource.fsPath), true);
        assert.strictEqual(existsSync(source.fsPath), false);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, source.fsPath);
        assert.strictEqual(event.operation, 3 /* FileOperation.COPY */);
        assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
        const targetChildren = readdirSync(target.fsPath);
        assert.strictEqual(sourceChildren.length, targetChildren.length);
        for (let i = 0; i < sourceChildren.length; i++) {
            assert.strictEqual(sourceChildren[i], targetChildren[i]);
        }
    }
    test('move - MIX CASE', async () => {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const source = await service.resolve(URI.file(join(testDir, 'index.html')), { resolveMetadata: true });
        assert.ok(source.size > 0);
        const renamedResource = URI.file(join(dirname(source.resource.fsPath), 'INDEX.html'));
        assert.strictEqual(await service.canMove(source.resource, renamedResource), true);
        let renamed = await service.move(source.resource, renamedResource);
        assert.strictEqual(existsSync(renamedResource.fsPath), true);
        assert.strictEqual(basename(renamedResource.fsPath), 'INDEX.html');
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
        assert.strictEqual(event.operation, 2 /* FileOperation.MOVE */);
        assert.strictEqual(event.target.resource.fsPath, renamedResource.fsPath);
        renamed = await service.resolve(renamedResource, { resolveMetadata: true });
        assert.strictEqual(source.size, renamed.size);
    });
    test('move - same file', async () => {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const source = await service.resolve(URI.file(join(testDir, 'index.html')), { resolveMetadata: true });
        assert.ok(source.size > 0);
        assert.strictEqual(await service.canMove(source.resource, URI.file(source.resource.fsPath)), true);
        let renamed = await service.move(source.resource, URI.file(source.resource.fsPath));
        assert.strictEqual(existsSync(renamed.resource.fsPath), true);
        assert.strictEqual(basename(renamed.resource.fsPath), 'index.html');
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
        assert.strictEqual(event.operation, 2 /* FileOperation.MOVE */);
        assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
        renamed = await service.resolve(renamed.resource, { resolveMetadata: true });
        assert.strictEqual(source.size, renamed.size);
    });
    test('move - same file #2', async () => {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const source = await service.resolve(URI.file(join(testDir, 'index.html')), { resolveMetadata: true });
        assert.ok(source.size > 0);
        const targetParent = URI.file(testDir);
        const target = targetParent.with({ path: posix.join(targetParent.path, posix.basename(source.resource.path)) });
        assert.strictEqual(await service.canMove(source.resource, target), true);
        let renamed = await service.move(source.resource, target);
        assert.strictEqual(existsSync(renamed.resource.fsPath), true);
        assert.strictEqual(basename(renamed.resource.fsPath), 'index.html');
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
        assert.strictEqual(event.operation, 2 /* FileOperation.MOVE */);
        assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
        renamed = await service.resolve(renamed.resource, { resolveMetadata: true });
        assert.strictEqual(source.size, renamed.size);
    });
    test('move - source parent of target', async () => {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        let source = await service.resolve(URI.file(join(testDir, 'index.html')), { resolveMetadata: true });
        const originalSize = source.size;
        assert.ok(originalSize > 0);
        assert.ok((await service.canMove(URI.file(testDir), URI.file(join(testDir, 'binary.txt'))) instanceof Error));
        let error;
        try {
            await service.move(URI.file(testDir), URI.file(join(testDir, 'binary.txt')));
        }
        catch (e) {
            error = e;
        }
        assert.ok(error);
        assert.ok(!event);
        source = await service.resolve(source.resource, { resolveMetadata: true });
        assert.strictEqual(originalSize, source.size);
    });
    test('move - FILE_MOVE_CONFLICT', async () => {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        let source = await service.resolve(URI.file(join(testDir, 'index.html')), { resolveMetadata: true });
        const originalSize = source.size;
        assert.ok(originalSize > 0);
        assert.ok((await service.canMove(source.resource, URI.file(join(testDir, 'binary.txt'))) instanceof Error));
        let error;
        try {
            await service.move(source.resource, URI.file(join(testDir, 'binary.txt')));
        }
        catch (e) {
            error = e;
        }
        assert.strictEqual(error.fileOperationResult, 4 /* FileOperationResult.FILE_MOVE_CONFLICT */);
        assert.ok(!event);
        source = await service.resolve(source.resource, { resolveMetadata: true });
        assert.strictEqual(originalSize, source.size);
    });
    test('move - overwrite folder with file', async () => {
        let createEvent;
        let moveEvent;
        let deleteEvent;
        disposables.add(service.onDidRunOperation(e => {
            if (e.operation === 0 /* FileOperation.CREATE */) {
                createEvent = e;
            }
            else if (e.operation === 1 /* FileOperation.DELETE */) {
                deleteEvent = e;
            }
            else if (e.operation === 2 /* FileOperation.MOVE */) {
                moveEvent = e;
            }
        }));
        const parent = await service.resolve(URI.file(testDir));
        const folderResource = URI.file(join(parent.resource.fsPath, 'conway.js'));
        const f = await service.createFolder(folderResource);
        const source = URI.file(join(testDir, 'deep', 'conway.js'));
        assert.strictEqual(await service.canMove(source, f.resource, true), true);
        const moved = await service.move(source, f.resource, true);
        assert.strictEqual(existsSync(moved.resource.fsPath), true);
        assert.ok(statSync(moved.resource.fsPath).isFile);
        assert.ok(createEvent);
        assert.ok(deleteEvent);
        assert.ok(moveEvent);
        assert.strictEqual(moveEvent.resource.fsPath, source.fsPath);
        assert.strictEqual(moveEvent.target.resource.fsPath, moved.resource.fsPath);
        assert.strictEqual(deleteEvent.resource.fsPath, folderResource.fsPath);
    });
    test('copy', async () => {
        await doTestCopy();
    });
    test('copy - unbuffered (FileSystemProviderCapabilities.FileReadWrite)', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        await doTestCopy();
    });
    test('copy - unbuffered large (FileSystemProviderCapabilities.FileReadWrite)', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        await doTestCopy('lorem.txt');
    });
    test('copy - buffered (FileSystemProviderCapabilities.FileOpenReadWriteClose)', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        await doTestCopy();
    });
    test('copy - buffered large (FileSystemProviderCapabilities.FileOpenReadWriteClose)', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        await doTestCopy('lorem.txt');
    });
    function setCapabilities(provider, capabilities) {
        provider.capabilities = capabilities;
        if (isLinux) {
            provider.capabilities |= 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */;
        }
    }
    async function doTestCopy(sourceName = 'index.html') {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const source = await service.resolve(URI.file(join(testDir, sourceName)));
        const target = URI.file(join(testDir, 'other.html'));
        assert.strictEqual(await service.canCopy(source.resource, target), true);
        const copied = await service.copy(source.resource, target);
        assert.strictEqual(existsSync(copied.resource.fsPath), true);
        assert.strictEqual(existsSync(source.resource.fsPath), true);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
        assert.strictEqual(event.operation, 3 /* FileOperation.COPY */);
        assert.strictEqual(event.target.resource.fsPath, copied.resource.fsPath);
        const sourceContents = readFileSync(source.resource.fsPath);
        const targetContents = readFileSync(target.fsPath);
        assert.strictEqual(sourceContents.byteLength, targetContents.byteLength);
        assert.strictEqual(sourceContents.toString(), targetContents.toString());
    }
    test('copy - overwrite folder with file', async () => {
        let createEvent;
        let copyEvent;
        let deleteEvent;
        disposables.add(service.onDidRunOperation(e => {
            if (e.operation === 0 /* FileOperation.CREATE */) {
                createEvent = e;
            }
            else if (e.operation === 1 /* FileOperation.DELETE */) {
                deleteEvent = e;
            }
            else if (e.operation === 3 /* FileOperation.COPY */) {
                copyEvent = e;
            }
        }));
        const parent = await service.resolve(URI.file(testDir));
        const folderResource = URI.file(join(parent.resource.fsPath, 'conway.js'));
        const f = await service.createFolder(folderResource);
        const source = URI.file(join(testDir, 'deep', 'conway.js'));
        assert.strictEqual(await service.canCopy(source, f.resource, true), true);
        const copied = await service.copy(source, f.resource, true);
        assert.strictEqual(existsSync(copied.resource.fsPath), true);
        assert.ok(statSync(copied.resource.fsPath).isFile);
        assert.ok(createEvent);
        assert.ok(deleteEvent);
        assert.ok(copyEvent);
        assert.strictEqual(copyEvent.resource.fsPath, source.fsPath);
        assert.strictEqual(copyEvent.target.resource.fsPath, copied.resource.fsPath);
        assert.strictEqual(deleteEvent.resource.fsPath, folderResource.fsPath);
    });
    test('copy - MIX CASE same target - no overwrite', async () => {
        let source = await service.resolve(URI.file(join(testDir, 'index.html')), { resolveMetadata: true });
        const originalSize = source.size;
        assert.ok(originalSize > 0);
        const target = URI.file(join(dirname(source.resource.fsPath), 'INDEX.html'));
        const canCopy = await service.canCopy(source.resource, target);
        let error;
        let copied;
        try {
            copied = await service.copy(source.resource, target);
        }
        catch (e) {
            error = e;
        }
        if (isLinux) {
            assert.ok(!error);
            assert.strictEqual(canCopy, true);
            assert.strictEqual(existsSync(copied.resource.fsPath), true);
            assert.ok(readdirSync(testDir).some(f => f === 'INDEX.html'));
            assert.strictEqual(source.size, copied.size);
        }
        else {
            assert.ok(error);
            assert.ok(canCopy instanceof Error);
            source = await service.resolve(source.resource, { resolveMetadata: true });
            assert.strictEqual(originalSize, source.size);
        }
    });
    test('copy - MIX CASE same target - overwrite', async () => {
        let source = await service.resolve(URI.file(join(testDir, 'index.html')), { resolveMetadata: true });
        const originalSize = source.size;
        assert.ok(originalSize > 0);
        const target = URI.file(join(dirname(source.resource.fsPath), 'INDEX.html'));
        const canCopy = await service.canCopy(source.resource, target, true);
        let error;
        let copied;
        try {
            copied = await service.copy(source.resource, target, true);
        }
        catch (e) {
            error = e;
        }
        if (isLinux) {
            assert.ok(!error);
            assert.strictEqual(canCopy, true);
            assert.strictEqual(existsSync(copied.resource.fsPath), true);
            assert.ok(readdirSync(testDir).some(f => f === 'INDEX.html'));
            assert.strictEqual(source.size, copied.size);
        }
        else {
            assert.ok(error);
            assert.ok(canCopy instanceof Error);
            source = await service.resolve(source.resource, { resolveMetadata: true });
            assert.strictEqual(originalSize, source.size);
        }
    });
    test('copy - MIX CASE different target - overwrite', async () => {
        const source1 = await service.resolve(URI.file(join(testDir, 'index.html')), { resolveMetadata: true });
        assert.ok(source1.size > 0);
        const renamed = await service.move(source1.resource, URI.file(join(dirname(source1.resource.fsPath), 'CONWAY.js')));
        assert.strictEqual(existsSync(renamed.resource.fsPath), true);
        assert.ok(readdirSync(testDir).some(f => f === 'CONWAY.js'));
        assert.strictEqual(source1.size, renamed.size);
        const source2 = await service.resolve(URI.file(join(testDir, 'deep', 'conway.js')), { resolveMetadata: true });
        const target = URI.file(join(testDir, basename(source2.resource.path)));
        assert.strictEqual(await service.canCopy(source2.resource, target, true), true);
        const res = await service.copy(source2.resource, target, true);
        assert.strictEqual(existsSync(res.resource.fsPath), true);
        assert.ok(readdirSync(testDir).some(f => f === 'conway.js'));
        assert.strictEqual(source2.size, res.size);
    });
    test('copy - same file', async () => {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const source = await service.resolve(URI.file(join(testDir, 'index.html')), { resolveMetadata: true });
        assert.ok(source.size > 0);
        assert.strictEqual(await service.canCopy(source.resource, URI.file(source.resource.fsPath)), true);
        let copied = await service.copy(source.resource, URI.file(source.resource.fsPath));
        assert.strictEqual(existsSync(copied.resource.fsPath), true);
        assert.strictEqual(basename(copied.resource.fsPath), 'index.html');
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
        assert.strictEqual(event.operation, 3 /* FileOperation.COPY */);
        assert.strictEqual(event.target.resource.fsPath, copied.resource.fsPath);
        copied = await service.resolve(source.resource, { resolveMetadata: true });
        assert.strictEqual(source.size, copied.size);
    });
    test('copy - same file #2', async () => {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const source = await service.resolve(URI.file(join(testDir, 'index.html')), { resolveMetadata: true });
        assert.ok(source.size > 0);
        const targetParent = URI.file(testDir);
        const target = targetParent.with({ path: posix.join(targetParent.path, posix.basename(source.resource.path)) });
        assert.strictEqual(await service.canCopy(source.resource, URI.file(target.fsPath)), true);
        let copied = await service.copy(source.resource, URI.file(target.fsPath));
        assert.strictEqual(existsSync(copied.resource.fsPath), true);
        assert.strictEqual(basename(copied.resource.fsPath), 'index.html');
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
        assert.strictEqual(event.operation, 3 /* FileOperation.COPY */);
        assert.strictEqual(event.target.resource.fsPath, copied.resource.fsPath);
        copied = await service.resolve(source.resource, { resolveMetadata: true });
        assert.strictEqual(source.size, copied.size);
    });
    test('cloneFile - basics', () => {
        return testCloneFile();
    });
    test('cloneFile - via copy capability', () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ | 8 /* FileSystemProviderCapabilities.FileFolderCopy */);
        return testCloneFile();
    });
    test('cloneFile - via pipe', () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testCloneFile();
    });
    async function testCloneFile() {
        const source1 = URI.file(join(testDir, 'index.html'));
        const source1Size = (await service.resolve(source1, { resolveMetadata: true })).size;
        const source2 = URI.file(join(testDir, 'lorem.txt'));
        const source2Size = (await service.resolve(source2, { resolveMetadata: true })).size;
        const targetParent = URI.file(testDir);
        // same path is a no-op
        await service.cloneFile(source1, source1);
        // simple clone to existing parent folder path
        const target1 = targetParent.with({ path: posix.join(targetParent.path, `${posix.basename(source1.path)}-clone`) });
        await service.cloneFile(source1, URI.file(target1.fsPath));
        assert.strictEqual(existsSync(target1.fsPath), true);
        assert.strictEqual(basename(target1.fsPath), 'index.html-clone');
        let target1Size = (await service.resolve(target1, { resolveMetadata: true })).size;
        assert.strictEqual(source1Size, target1Size);
        // clone to same path overwrites
        await service.cloneFile(source2, URI.file(target1.fsPath));
        target1Size = (await service.resolve(target1, { resolveMetadata: true })).size;
        assert.strictEqual(source2Size, target1Size);
        assert.notStrictEqual(source1Size, target1Size);
        // clone creates missing folders ad-hoc
        const target2 = targetParent.with({ path: posix.join(targetParent.path, 'foo', 'bar', `${posix.basename(source1.path)}-clone`) });
        await service.cloneFile(source1, URI.file(target2.fsPath));
        assert.strictEqual(existsSync(target2.fsPath), true);
        assert.strictEqual(basename(target2.fsPath), 'index.html-clone');
        const target2Size = (await service.resolve(target2, { resolveMetadata: true })).size;
        assert.strictEqual(source1Size, target2Size);
    }
    test('readFile - small file - default', () => {
        return testReadFile(URI.file(join(testDir, 'small.txt')));
    });
    test('readFile - small file - buffered', () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testReadFile(URI.file(join(testDir, 'small.txt')));
    });
    test('readFile - small file - buffered / readonly', () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ | 2048 /* FileSystemProviderCapabilities.Readonly */);
        return testReadFile(URI.file(join(testDir, 'small.txt')));
    });
    test('readFile - small file - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testReadFile(URI.file(join(testDir, 'small.txt')));
    });
    test('readFile - small file - unbuffered / readonly', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 2048 /* FileSystemProviderCapabilities.Readonly */);
        return testReadFile(URI.file(join(testDir, 'small.txt')));
    });
    test('readFile - small file - streamed', async () => {
        setCapabilities(fileProvider, 16 /* FileSystemProviderCapabilities.FileReadStream */);
        return testReadFile(URI.file(join(testDir, 'small.txt')));
    });
    test('readFile - small file - streamed / readonly', async () => {
        setCapabilities(fileProvider, 16 /* FileSystemProviderCapabilities.FileReadStream */ | 2048 /* FileSystemProviderCapabilities.Readonly */);
        return testReadFile(URI.file(join(testDir, 'small.txt')));
    });
    test('readFile - large file - default', async () => {
        return testReadFile(URI.file(join(testDir, 'lorem.txt')));
    });
    test('readFile - large file - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testReadFile(URI.file(join(testDir, 'lorem.txt')));
    });
    test('readFile - large file - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testReadFile(URI.file(join(testDir, 'lorem.txt')));
    });
    test('readFile - large file - streamed', async () => {
        setCapabilities(fileProvider, 16 /* FileSystemProviderCapabilities.FileReadStream */);
        return testReadFile(URI.file(join(testDir, 'lorem.txt')));
    });
    test('readFile - atomic (emulated on service level)', async () => {
        setCapabilities(fileProvider, 16 /* FileSystemProviderCapabilities.FileReadStream */);
        return testReadFile(URI.file(join(testDir, 'lorem.txt')), { atomic: true });
    });
    test('readFile - atomic (natively supported)', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */ & 16384 /* FileSystemProviderCapabilities.FileAtomicRead */);
        return testReadFile(URI.file(join(testDir, 'lorem.txt')), { atomic: true });
    });
    async function testReadFile(resource, options) {
        const content = await service.readFile(resource, options);
        assert.strictEqual(content.value.toString(), readFileSync(resource.fsPath).toString());
    }
    test('readFileStream - small file - default', () => {
        return testReadFileStream(URI.file(join(testDir, 'small.txt')));
    });
    test('readFileStream - small file - buffered', () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testReadFileStream(URI.file(join(testDir, 'small.txt')));
    });
    test('readFileStream - small file - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testReadFileStream(URI.file(join(testDir, 'small.txt')));
    });
    test('readFileStream - small file - streamed', async () => {
        setCapabilities(fileProvider, 16 /* FileSystemProviderCapabilities.FileReadStream */);
        return testReadFileStream(URI.file(join(testDir, 'small.txt')));
    });
    async function testReadFileStream(resource) {
        const content = await service.readFileStream(resource);
        assert.strictEqual((await streamToBuffer(content.value)).toString(), readFileSync(resource.fsPath).toString());
    }
    test('readFile - Files are intermingled #38331 - default', async () => {
        return testFilesNotIntermingled();
    });
    test('readFile - Files are intermingled #38331 - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testFilesNotIntermingled();
    });
    test('readFile - Files are intermingled #38331 - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testFilesNotIntermingled();
    });
    test('readFile - Files are intermingled #38331 - streamed', async () => {
        setCapabilities(fileProvider, 16 /* FileSystemProviderCapabilities.FileReadStream */);
        return testFilesNotIntermingled();
    });
    async function testFilesNotIntermingled() {
        const resource1 = URI.file(join(testDir, 'lorem.txt'));
        const resource2 = URI.file(join(testDir, 'some_utf16le.css'));
        // load in sequence and keep data
        const value1 = await service.readFile(resource1);
        const value2 = await service.readFile(resource2);
        // load in parallel in expect the same result
        const result = await Promise.all([
            service.readFile(resource1),
            service.readFile(resource2)
        ]);
        assert.strictEqual(result[0].value.toString(), value1.value.toString());
        assert.strictEqual(result[1].value.toString(), value2.value.toString());
    }
    test('readFile - from position (ASCII) - default', async () => {
        return testReadFileFromPositionAscii();
    });
    test('readFile - from position (ASCII) - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testReadFileFromPositionAscii();
    });
    test('readFile - from position (ASCII) - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testReadFileFromPositionAscii();
    });
    test('readFile - from position (ASCII) - streamed', async () => {
        setCapabilities(fileProvider, 16 /* FileSystemProviderCapabilities.FileReadStream */);
        return testReadFileFromPositionAscii();
    });
    async function testReadFileFromPositionAscii() {
        const resource = URI.file(join(testDir, 'small.txt'));
        const contents = await service.readFile(resource, { position: 6 });
        assert.strictEqual(contents.value.toString(), 'File');
    }
    test('readFile - from position (with umlaut) - default', async () => {
        return testReadFileFromPositionUmlaut();
    });
    test('readFile - from position (with umlaut) - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testReadFileFromPositionUmlaut();
    });
    test('readFile - from position (with umlaut) - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testReadFileFromPositionUmlaut();
    });
    test('readFile - from position (with umlaut) - streamed', async () => {
        setCapabilities(fileProvider, 16 /* FileSystemProviderCapabilities.FileReadStream */);
        return testReadFileFromPositionUmlaut();
    });
    async function testReadFileFromPositionUmlaut() {
        const resource = URI.file(join(testDir, 'small_umlaut.txt'));
        const contents = await service.readFile(resource, { position: Buffer.from('Small File with Ü').length });
        assert.strictEqual(contents.value.toString(), 'mlaut');
    }
    test('readFile - 3 bytes (ASCII) - default', async () => {
        return testReadThreeBytesFromFile();
    });
    test('readFile - 3 bytes (ASCII) - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testReadThreeBytesFromFile();
    });
    test('readFile - 3 bytes (ASCII) - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testReadThreeBytesFromFile();
    });
    test('readFile - 3 bytes (ASCII) - streamed', async () => {
        setCapabilities(fileProvider, 16 /* FileSystemProviderCapabilities.FileReadStream */);
        return testReadThreeBytesFromFile();
    });
    async function testReadThreeBytesFromFile() {
        const resource = URI.file(join(testDir, 'small.txt'));
        const contents = await service.readFile(resource, { length: 3 });
        assert.strictEqual(contents.value.toString(), 'Sma');
    }
    test('readFile - 20000 bytes (large) - default', async () => {
        return readLargeFileWithLength(20000);
    });
    test('readFile - 20000 bytes (large) - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return readLargeFileWithLength(20000);
    });
    test('readFile - 20000 bytes (large) - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return readLargeFileWithLength(20000);
    });
    test('readFile - 20000 bytes (large) - streamed', async () => {
        setCapabilities(fileProvider, 16 /* FileSystemProviderCapabilities.FileReadStream */);
        return readLargeFileWithLength(20000);
    });
    test('readFile - 80000 bytes (large) - default', async () => {
        return readLargeFileWithLength(80000);
    });
    test('readFile - 80000 bytes (large) - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return readLargeFileWithLength(80000);
    });
    test('readFile - 80000 bytes (large) - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return readLargeFileWithLength(80000);
    });
    test('readFile - 80000 bytes (large) - streamed', async () => {
        setCapabilities(fileProvider, 16 /* FileSystemProviderCapabilities.FileReadStream */);
        return readLargeFileWithLength(80000);
    });
    async function readLargeFileWithLength(length) {
        const resource = URI.file(join(testDir, 'lorem.txt'));
        const contents = await service.readFile(resource, { length });
        assert.strictEqual(contents.value.byteLength, length);
    }
    test('readFile - FILE_IS_DIRECTORY', async () => {
        const resource = URI.file(join(testDir, 'deep'));
        let error = undefined;
        try {
            await service.readFile(resource);
        }
        catch (err) {
            error = err;
        }
        assert.ok(error);
        assert.strictEqual(error.fileOperationResult, 0 /* FileOperationResult.FILE_IS_DIRECTORY */);
    });
    (isWindows /* error code does not seem to be supported on windows */ ? test.skip : test)('readFile - FILE_NOT_DIRECTORY', async () => {
        const resource = URI.file(join(testDir, 'lorem.txt', 'file.txt'));
        let error = undefined;
        try {
            await service.readFile(resource);
        }
        catch (err) {
            error = err;
        }
        assert.ok(error);
        assert.strictEqual(error.fileOperationResult, 9 /* FileOperationResult.FILE_NOT_DIRECTORY */);
    });
    test('readFile - FILE_NOT_FOUND', async () => {
        const resource = URI.file(join(testDir, '404.html'));
        let error = undefined;
        try {
            await service.readFile(resource);
        }
        catch (err) {
            error = err;
        }
        assert.ok(error);
        assert.strictEqual(error.fileOperationResult, 1 /* FileOperationResult.FILE_NOT_FOUND */);
    });
    test('readFile - FILE_NOT_MODIFIED_SINCE - default', async () => {
        return testNotModifiedSince();
    });
    test('readFile - FILE_NOT_MODIFIED_SINCE - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testNotModifiedSince();
    });
    test('readFile - FILE_NOT_MODIFIED_SINCE - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testNotModifiedSince();
    });
    test('readFile - FILE_NOT_MODIFIED_SINCE - streamed', async () => {
        setCapabilities(fileProvider, 16 /* FileSystemProviderCapabilities.FileReadStream */);
        return testNotModifiedSince();
    });
    async function testNotModifiedSince() {
        const resource = URI.file(join(testDir, 'index.html'));
        const contents = await service.readFile(resource);
        fileProvider.totalBytesRead = 0;
        let error = undefined;
        try {
            await service.readFile(resource, { etag: contents.etag });
        }
        catch (err) {
            error = err;
        }
        assert.ok(error);
        assert.strictEqual(error.fileOperationResult, 2 /* FileOperationResult.FILE_NOT_MODIFIED_SINCE */);
        assert.ok(error instanceof NotModifiedSinceFileOperationError && error.stat);
        assert.strictEqual(fileProvider.totalBytesRead, 0);
    }
    test('readFile - FILE_NOT_MODIFIED_SINCE does not fire wrongly - https://github.com/microsoft/vscode/issues/72909', async () => {
        fileProvider.setInvalidStatSize(true);
        const resource = URI.file(join(testDir, 'index.html'));
        await service.readFile(resource);
        let error = undefined;
        try {
            await service.readFile(resource, { etag: undefined });
        }
        catch (err) {
            error = err;
        }
        assert.ok(!error);
    });
    test('readFile - FILE_TOO_LARGE - default', async () => {
        return testFileTooLarge();
    });
    test('readFile - FILE_TOO_LARGE - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testFileTooLarge();
    });
    test('readFile - FILE_TOO_LARGE - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testFileTooLarge();
    });
    test('readFile - FILE_TOO_LARGE - streamed', async () => {
        setCapabilities(fileProvider, 16 /* FileSystemProviderCapabilities.FileReadStream */);
        return testFileTooLarge();
    });
    async function testFileTooLarge() {
        await doTestFileTooLarge(false);
        // Also test when the stat size is wrong
        fileProvider.setSmallStatSize(true);
        return doTestFileTooLarge(true);
    }
    async function doTestFileTooLarge(statSizeWrong) {
        const resource = URI.file(join(testDir, 'index.html'));
        let error = undefined;
        try {
            await service.readFile(resource, { limits: { size: 10 } });
        }
        catch (err) {
            error = err;
        }
        if (!statSizeWrong) {
            assert.ok(error instanceof TooLargeFileOperationError);
            assert.ok(typeof error.size === 'number');
        }
        assert.strictEqual(error.fileOperationResult, 7 /* FileOperationResult.FILE_TOO_LARGE */);
    }
    (isWindows ? test.skip /* windows: cannot create file symbolic link without elevated context */ : test)('readFile - dangling symbolic link - https://github.com/microsoft/vscode/issues/116049', async () => {
        const link = URI.file(join(testDir, 'small.js-link'));
        await promises.symlink(join(testDir, 'small.js'), link.fsPath);
        let error = undefined;
        try {
            await service.readFile(link);
        }
        catch (err) {
            error = err;
        }
        assert.ok(error);
    });
    test('createFile', async () => {
        return assertCreateFile(contents => VSBuffer.fromString(contents));
    });
    test('createFile (readable)', async () => {
        return assertCreateFile(contents => bufferToReadable(VSBuffer.fromString(contents)));
    });
    test('createFile (stream)', async () => {
        return assertCreateFile(contents => bufferToStream(VSBuffer.fromString(contents)));
    });
    async function assertCreateFile(converter) {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const contents = 'Hello World';
        const resource = URI.file(join(testDir, 'test.txt'));
        assert.strictEqual(await service.canCreateFile(resource), true);
        const fileStat = await service.createFile(resource, converter(contents));
        assert.strictEqual(fileStat.name, 'test.txt');
        assert.strictEqual(existsSync(fileStat.resource.fsPath), true);
        assert.strictEqual(readFileSync(fileStat.resource.fsPath).toString(), contents);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, resource.fsPath);
        assert.strictEqual(event.operation, 0 /* FileOperation.CREATE */);
        assert.strictEqual(event.target.resource.fsPath, resource.fsPath);
    }
    test('createFile (does not overwrite by default)', async () => {
        const contents = 'Hello World';
        const resource = URI.file(join(testDir, 'test.txt'));
        writeFileSync(resource.fsPath, ''); // create file
        assert.ok((await service.canCreateFile(resource)) instanceof Error);
        let error;
        try {
            await service.createFile(resource, VSBuffer.fromString(contents));
        }
        catch (err) {
            error = err;
        }
        assert.ok(error);
    });
    test('createFile (allows to overwrite existing)', async () => {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const contents = 'Hello World';
        const resource = URI.file(join(testDir, 'test.txt'));
        writeFileSync(resource.fsPath, ''); // create file
        assert.strictEqual(await service.canCreateFile(resource, { overwrite: true }), true);
        const fileStat = await service.createFile(resource, VSBuffer.fromString(contents), { overwrite: true });
        assert.strictEqual(fileStat.name, 'test.txt');
        assert.strictEqual(existsSync(fileStat.resource.fsPath), true);
        assert.strictEqual(readFileSync(fileStat.resource.fsPath).toString(), contents);
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, resource.fsPath);
        assert.strictEqual(event.operation, 0 /* FileOperation.CREATE */);
        assert.strictEqual(event.target.resource.fsPath, resource.fsPath);
    });
    test('writeFile - default', async () => {
        return testWriteFile(false);
    });
    test('writeFile - flush on write', async () => {
        DiskFileSystemProvider.configureFlushOnWrite(true);
        try {
            return await testWriteFile(false);
        }
        finally {
            DiskFileSystemProvider.configureFlushOnWrite(false);
        }
    });
    test('writeFile - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testWriteFile(false);
    });
    test('writeFile - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testWriteFile(false);
    });
    test('writeFile - default (atomic)', async () => {
        return testWriteFile(true);
    });
    test('writeFile - flush on write (atomic)', async () => {
        DiskFileSystemProvider.configureFlushOnWrite(true);
        try {
            return await testWriteFile(true);
        }
        finally {
            DiskFileSystemProvider.configureFlushOnWrite(false);
        }
    });
    test('writeFile - buffered (atomic)', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ | 32768 /* FileSystemProviderCapabilities.FileAtomicWrite */);
        let e;
        try {
            await testWriteFile(true);
        }
        catch (error) {
            e = error;
        }
        assert.ok(e);
    });
    test('writeFile - unbuffered (atomic)', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 32768 /* FileSystemProviderCapabilities.FileAtomicWrite */);
        return testWriteFile(true);
    });
    (isWindows ? test.skip /* windows: cannot create file symbolic link without elevated context */ : test)('writeFile - atomic writing does not break symlinks', async () => {
        const link = URI.file(join(testDir, 'lorem.txt-linked'));
        await promises.symlink(join(testDir, 'lorem.txt'), link.fsPath);
        const content = 'Updates to the lorem file';
        await service.writeFile(link, VSBuffer.fromString(content), { atomic: { postfix: '.vsctmp' } });
        assert.strictEqual(readFileSync(link.fsPath).toString(), content);
        const resolved = await service.resolve(link);
        assert.strictEqual(resolved.isSymbolicLink, true);
    });
    async function testWriteFile(atomic) {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const resource = URI.file(join(testDir, 'small.txt'));
        const content = readFileSync(resource.fsPath).toString();
        assert.strictEqual(content, 'Small File');
        const newContent = 'Updates to the small file';
        await service.writeFile(resource, VSBuffer.fromString(newContent), { atomic: atomic ? { postfix: '.vsctmp' } : false });
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, resource.fsPath);
        assert.strictEqual(event.operation, 4 /* FileOperation.WRITE */);
        assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
    }
    test('writeFile (large file) - default', async () => {
        return testWriteFileLarge(false);
    });
    test('writeFile (large file) - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testWriteFileLarge(false);
    });
    test('writeFile (large file) - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testWriteFileLarge(false);
    });
    test('writeFile (large file) - default (atomic)', async () => {
        return testWriteFileLarge(true);
    });
    test('writeFile (large file) - buffered (atomic)', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ | 32768 /* FileSystemProviderCapabilities.FileAtomicWrite */);
        let e;
        try {
            await testWriteFileLarge(true);
        }
        catch (error) {
            e = error;
        }
        assert.ok(e);
    });
    test('writeFile (large file) - unbuffered (atomic)', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 32768 /* FileSystemProviderCapabilities.FileAtomicWrite */);
        return testWriteFileLarge(true);
    });
    async function testWriteFileLarge(atomic) {
        const resource = URI.file(join(testDir, 'lorem.txt'));
        const content = readFileSync(resource.fsPath);
        const newContent = content.toString() + content.toString();
        const fileStat = await service.writeFile(resource, VSBuffer.fromString(newContent), { atomic: atomic ? { postfix: '.vsctmp' } : false });
        assert.strictEqual(fileStat.name, 'lorem.txt');
        assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
    }
    test('writeFile (large file) - unbuffered (atomic) - concurrent writes with multiple services', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 32768 /* FileSystemProviderCapabilities.FileAtomicWrite */);
        const resource = URI.file(join(testDir, 'lorem.txt'));
        const content = readFileSync(resource.fsPath);
        const newContent = content.toString() + content.toString();
        const promises = [];
        let suffix = 0;
        for (let i = 0; i < 10; i++) {
            const service = disposables.add(new FileService(new NullLogService()));
            disposables.add(service.registerProvider(Schemas.file, fileProvider));
            promises.push(service.writeFile(resource, VSBuffer.fromString(`${newContent}${++suffix}`), { atomic: { postfix: '.vsctmp' } }));
            await timeout(0);
        }
        await Promise.allSettled(promises);
        assert.strictEqual(readFileSync(resource.fsPath).toString(), `${newContent}${suffix}`);
    });
    test('writeFile - buffered - readonly throws', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ | 2048 /* FileSystemProviderCapabilities.Readonly */);
        return testWriteFileReadonlyThrows();
    });
    test('writeFile - unbuffered - readonly throws', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 2048 /* FileSystemProviderCapabilities.Readonly */);
        return testWriteFileReadonlyThrows();
    });
    async function testWriteFileReadonlyThrows() {
        const resource = URI.file(join(testDir, 'small.txt'));
        const content = readFileSync(resource.fsPath).toString();
        assert.strictEqual(content, 'Small File');
        const newContent = 'Updates to the small file';
        let error;
        try {
            await service.writeFile(resource, VSBuffer.fromString(newContent));
        }
        catch (err) {
            error = err;
        }
        assert.ok(error);
    }
    test('writeFile (large file) - multiple parallel writes queue up and atomic read support (via file service)', async () => {
        const resource = URI.file(join(testDir, 'lorem.txt'));
        const content = readFileSync(resource.fsPath);
        const newContent = content.toString() + content.toString();
        const writePromises = Promise.all(['0', '00', '000', '0000', '00000'].map(async (offset) => {
            const fileStat = await service.writeFile(resource, VSBuffer.fromString(offset + newContent));
            assert.strictEqual(fileStat.name, 'lorem.txt');
        }));
        const readPromises = Promise.all(['0', '00', '000', '0000', '00000'].map(async () => {
            const fileContent = await service.readFile(resource, { atomic: true });
            assert.ok(fileContent.value.byteLength > 0); // `atomic: true` ensures we never read a truncated file
        }));
        await Promise.all([writePromises, readPromises]);
    });
    test('provider - write barrier prevents dirty writes', async () => {
        const resource = URI.file(join(testDir, 'lorem.txt'));
        const content = readFileSync(resource.fsPath);
        const newContent = content.toString() + content.toString();
        const provider = service.getProvider(resource.scheme);
        assert.ok(provider);
        assert.ok(hasOpenReadWriteCloseCapability(provider));
        const writePromises = Promise.all(['0', '00', '000', '0000', '00000'].map(async (offset) => {
            const content = offset + newContent;
            const contentBuffer = VSBuffer.fromString(content).buffer;
            const fd = await provider.open(resource, { create: true, unlock: false });
            try {
                await provider.write(fd, 0, VSBuffer.fromString(content).buffer, 0, contentBuffer.byteLength);
                // Here since `close` is not called, all other writes are
                // waiting on the barrier to release, so doing a readFile
                // should give us a consistent view of the file contents
                assert.strictEqual((await promises.readFile(resource.fsPath)).toString(), content);
            }
            finally {
                await provider.close(fd);
            }
        }));
        await Promise.all([writePromises]);
    });
    test('provider - write barrier is partitioned per resource', async () => {
        const resource1 = URI.file(join(testDir, 'lorem.txt'));
        const resource2 = URI.file(join(testDir, 'test.txt'));
        const provider = service.getProvider(resource1.scheme);
        assert.ok(provider);
        assert.ok(hasOpenReadWriteCloseCapability(provider));
        const fd1 = await provider.open(resource1, { create: true, unlock: false });
        const fd2 = await provider.open(resource2, { create: true, unlock: false });
        const newContent = 'Hello World';
        try {
            await provider.write(fd1, 0, VSBuffer.fromString(newContent).buffer, 0, VSBuffer.fromString(newContent).buffer.byteLength);
            assert.strictEqual((await promises.readFile(resource1.fsPath)).toString(), newContent);
            await provider.write(fd2, 0, VSBuffer.fromString(newContent).buffer, 0, VSBuffer.fromString(newContent).buffer.byteLength);
            assert.strictEqual((await promises.readFile(resource2.fsPath)).toString(), newContent);
        }
        finally {
            await Promise.allSettled([
                await provider.close(fd1),
                await provider.close(fd2)
            ]);
        }
    });
    test('provider - write barrier not becoming stale', async () => {
        const newFolder = join(testDir, 'new-folder');
        const newResource = URI.file(join(newFolder, 'lorem.txt'));
        const provider = service.getProvider(newResource.scheme);
        assert.ok(provider);
        assert.ok(hasOpenReadWriteCloseCapability(provider));
        let error = undefined;
        try {
            await provider.open(newResource, { create: true, unlock: false });
        }
        catch (e) {
            error = e;
        }
        assert.ok(error); // expected because `new-folder` does not exist
        await promises.mkdir(newFolder);
        const content = readFileSync(URI.file(join(testDir, 'lorem.txt')).fsPath);
        const newContent = content.toString() + content.toString();
        const newContentBuffer = VSBuffer.fromString(newContent).buffer;
        const fd = await provider.open(newResource, { create: true, unlock: false });
        try {
            await provider.write(fd, 0, newContentBuffer, 0, newContentBuffer.byteLength);
            assert.strictEqual((await promises.readFile(newResource.fsPath)).toString(), newContent);
        }
        finally {
            await provider.close(fd);
        }
    });
    test('provider - atomic reads (write pending when read starts)', async () => {
        const resource = URI.file(join(testDir, 'lorem.txt'));
        const content = readFileSync(resource.fsPath);
        const newContent = content.toString() + content.toString();
        const newContentBuffer = VSBuffer.fromString(newContent).buffer;
        const provider = service.getProvider(resource.scheme);
        assert.ok(provider);
        assert.ok(hasOpenReadWriteCloseCapability(provider));
        assert.ok(hasFileAtomicReadCapability(provider));
        let atomicReadPromise = undefined;
        const fd = await provider.open(resource, { create: true, unlock: false });
        try {
            // Start reading while write is pending
            atomicReadPromise = provider.readFile(resource, { atomic: true });
            // Simulate a slow write, giving the read
            // a chance to succeed if it were not atomic
            await timeout(20);
            await provider.write(fd, 0, newContentBuffer, 0, newContentBuffer.byteLength);
        }
        finally {
            await provider.close(fd);
        }
        assert.ok(atomicReadPromise);
        const atomicReadResult = await atomicReadPromise;
        assert.strictEqual(atomicReadResult.byteLength, newContentBuffer.byteLength);
    });
    test('provider - atomic reads (read pending when write starts)', async () => {
        const resource = URI.file(join(testDir, 'lorem.txt'));
        const content = readFileSync(resource.fsPath);
        const newContent = content.toString() + content.toString();
        const newContentBuffer = VSBuffer.fromString(newContent).buffer;
        const provider = service.getProvider(resource.scheme);
        assert.ok(provider);
        assert.ok(hasOpenReadWriteCloseCapability(provider));
        assert.ok(hasFileAtomicReadCapability(provider));
        let atomicReadPromise = provider.readFile(resource, { atomic: true });
        const fdPromise = provider.open(resource, { create: true, unlock: false }).then(async (fd) => {
            try {
                return await provider.write(fd, 0, newContentBuffer, 0, newContentBuffer.byteLength);
            }
            finally {
                await provider.close(fd);
            }
        });
        let atomicReadResult = await atomicReadPromise;
        assert.strictEqual(atomicReadResult.byteLength, content.byteLength);
        await fdPromise;
        atomicReadPromise = provider.readFile(resource, { atomic: true });
        atomicReadResult = await atomicReadPromise;
        assert.strictEqual(atomicReadResult.byteLength, newContentBuffer.byteLength);
    });
    test('writeFile (readable) - default', async () => {
        return testWriteFileReadable();
    });
    test('writeFile (readable) - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testWriteFileReadable();
    });
    test('writeFile (readable) - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testWriteFileReadable();
    });
    async function testWriteFileReadable() {
        const resource = URI.file(join(testDir, 'small.txt'));
        const content = readFileSync(resource.fsPath).toString();
        assert.strictEqual(content, 'Small File');
        const newContent = 'Updates to the small file';
        await service.writeFile(resource, toLineByLineReadable(newContent));
        assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
    }
    test('writeFile (large file - readable) - default', async () => {
        return testWriteFileLargeReadable();
    });
    test('writeFile (large file - readable) - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testWriteFileLargeReadable();
    });
    test('writeFile (large file - readable) - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testWriteFileLargeReadable();
    });
    async function testWriteFileLargeReadable() {
        const resource = URI.file(join(testDir, 'lorem.txt'));
        const content = readFileSync(resource.fsPath);
        const newContent = content.toString() + content.toString();
        const fileStat = await service.writeFile(resource, toLineByLineReadable(newContent));
        assert.strictEqual(fileStat.name, 'lorem.txt');
        assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
    }
    test('writeFile (stream) - default', async () => {
        return testWriteFileStream();
    });
    test('writeFile (stream) - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testWriteFileStream();
    });
    test('writeFile (stream) - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testWriteFileStream();
    });
    async function testWriteFileStream() {
        const source = URI.file(join(testDir, 'small.txt'));
        const target = URI.file(join(testDir, 'small-copy.txt'));
        const fileStat = await service.writeFile(target, streamToBufferReadableStream(createReadStream(source.fsPath)));
        assert.strictEqual(fileStat.name, 'small-copy.txt');
        const targetContents = readFileSync(target.fsPath).toString();
        assert.strictEqual(readFileSync(source.fsPath).toString(), targetContents);
    }
    test('writeFile (large file - stream) - default', async () => {
        return testWriteFileLargeStream();
    });
    test('writeFile (large file - stream) - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testWriteFileLargeStream();
    });
    test('writeFile (large file - stream) - unbuffered', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testWriteFileLargeStream();
    });
    async function testWriteFileLargeStream() {
        const source = URI.file(join(testDir, 'lorem.txt'));
        const target = URI.file(join(testDir, 'lorem-copy.txt'));
        const fileStat = await service.writeFile(target, streamToBufferReadableStream(createReadStream(source.fsPath)));
        assert.strictEqual(fileStat.name, 'lorem-copy.txt');
        const targetContents = readFileSync(target.fsPath).toString();
        assert.strictEqual(readFileSync(source.fsPath).toString(), targetContents);
    }
    test('writeFile (file is created including parents)', async () => {
        const resource = URI.file(join(testDir, 'other', 'newfile.txt'));
        const content = 'File is created including parent';
        const fileStat = await service.writeFile(resource, VSBuffer.fromString(content));
        assert.strictEqual(fileStat.name, 'newfile.txt');
        assert.strictEqual(readFileSync(resource.fsPath).toString(), content);
    });
    test('writeFile - locked files and unlocking', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 8192 /* FileSystemProviderCapabilities.FileWriteUnlock */);
        return testLockedFiles(false);
    });
    test('writeFile (stream) - locked files and unlocking', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ | 8192 /* FileSystemProviderCapabilities.FileWriteUnlock */);
        return testLockedFiles(false);
    });
    test('writeFile - locked files and unlocking throws error when missing capability', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */);
        return testLockedFiles(true);
    });
    test('writeFile (stream) - locked files and unlocking throws error when missing capability', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        return testLockedFiles(true);
    });
    async function testLockedFiles(expectError) {
        const lockedFile = URI.file(join(testDir, 'my-locked-file'));
        const content = await service.writeFile(lockedFile, VSBuffer.fromString('Locked File'));
        assert.strictEqual(content.locked, false);
        const stats = await promises.stat(lockedFile.fsPath);
        await promises.chmod(lockedFile.fsPath, stats.mode & ~0o200);
        let stat = await service.stat(lockedFile);
        assert.strictEqual(stat.locked, true);
        let error;
        const newContent = 'Updates to locked file';
        try {
            await service.writeFile(lockedFile, VSBuffer.fromString(newContent));
        }
        catch (e) {
            error = e;
        }
        assert.ok(error);
        error = undefined;
        if (expectError) {
            try {
                await service.writeFile(lockedFile, VSBuffer.fromString(newContent), { unlock: true });
            }
            catch (e) {
                error = e;
            }
            assert.ok(error);
        }
        else {
            await service.writeFile(lockedFile, VSBuffer.fromString(newContent), { unlock: true });
            assert.strictEqual(readFileSync(lockedFile.fsPath).toString(), newContent);
            stat = await service.stat(lockedFile);
            assert.strictEqual(stat.locked, false);
        }
    }
    test('writeFile (error when folder is encountered)', async () => {
        const resource = URI.file(testDir);
        let error = undefined;
        try {
            await service.writeFile(resource, VSBuffer.fromString('File is created including parent'));
        }
        catch (err) {
            error = err;
        }
        assert.ok(error);
    });
    test('writeFile (no error when providing up to date etag)', async () => {
        const resource = URI.file(join(testDir, 'small.txt'));
        const stat = await service.resolve(resource);
        const content = readFileSync(resource.fsPath).toString();
        assert.strictEqual(content, 'Small File');
        const newContent = 'Updates to the small file';
        await service.writeFile(resource, VSBuffer.fromString(newContent), { etag: stat.etag, mtime: stat.mtime });
        assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
    });
    test('writeFile - error when writing to file that has been updated meanwhile', async () => {
        const resource = URI.file(join(testDir, 'small.txt'));
        const stat = await service.resolve(resource);
        const content = readFileSync(resource.fsPath).toString();
        assert.strictEqual(content, 'Small File');
        const newContent = 'Updates to the small file';
        await service.writeFile(resource, VSBuffer.fromString(newContent), { etag: stat.etag, mtime: stat.mtime });
        const newContentLeadingToError = newContent + newContent;
        const fakeMtime = 1000;
        const fakeSize = 1000;
        let error = undefined;
        try {
            await service.writeFile(resource, VSBuffer.fromString(newContentLeadingToError), { etag: etag({ mtime: fakeMtime, size: fakeSize }), mtime: fakeMtime });
        }
        catch (err) {
            error = err;
        }
        assert.ok(error);
        assert.ok(error instanceof FileOperationError);
        assert.strictEqual(error.fileOperationResult, 3 /* FileOperationResult.FILE_MODIFIED_SINCE */);
    });
    test('writeFile - no error when writing to file where size is the same', async () => {
        const resource = URI.file(join(testDir, 'small.txt'));
        const stat = await service.resolve(resource);
        const content = readFileSync(resource.fsPath).toString();
        assert.strictEqual(content, 'Small File');
        const newContent = content; // same content
        await service.writeFile(resource, VSBuffer.fromString(newContent), { etag: stat.etag, mtime: stat.mtime });
        const newContentLeadingToNoError = newContent; // writing the same content should be OK
        const fakeMtime = 1000;
        const actualSize = newContent.length;
        let error = undefined;
        try {
            await service.writeFile(resource, VSBuffer.fromString(newContentLeadingToNoError), { etag: etag({ mtime: fakeMtime, size: actualSize }), mtime: fakeMtime });
        }
        catch (err) {
            error = err;
        }
        assert.ok(!error);
    });
    test('writeFile - no error when writing to file where content is the same', async () => {
        const resource = URI.file(join(testDir, 'small.txt'));
        await service.resolve(resource);
        const content = readFileSync(resource.fsPath).toString();
        assert.strictEqual(content, 'Small File');
        const newContent = content; // same content
        let error = undefined;
        try {
            await service.writeFile(resource, VSBuffer.fromString(newContent), { etag: 'anything', mtime: 0 } /* fake it */);
        }
        catch (err) {
            error = err;
        }
        assert.ok(!error);
    });
    test('writeFile - error when writing to file where content is the same length but different', async () => {
        const resource = URI.file(join(testDir, 'small.txt'));
        await service.resolve(resource);
        const content = readFileSync(resource.fsPath).toString();
        assert.strictEqual(content, 'Small File');
        const newContent = content.split('').reverse().join(''); // reverse content
        let error = undefined;
        try {
            await service.writeFile(resource, VSBuffer.fromString(newContent), { etag: 'anything', mtime: 0 } /* fake it */);
        }
        catch (err) {
            error = err;
        }
        assert.ok(error);
        assert.ok(error instanceof FileOperationError);
        assert.strictEqual(error.fileOperationResult, 3 /* FileOperationResult.FILE_MODIFIED_SINCE */);
    });
    test('writeFile - no error when writing to same nonexistent folder multiple times different new files', async () => {
        const newFolder = URI.file(join(testDir, 'some', 'new', 'folder'));
        const file1 = joinPath(newFolder, 'file-1');
        const file2 = joinPath(newFolder, 'file-2');
        const file3 = joinPath(newFolder, 'file-3');
        // this essentially verifies that the mkdirp logic implemented
        // in the file service is able to receive multiple requests for
        // the same folder and will not throw errors if another racing
        // call succeeded first.
        const newContent = 'Updates to the small file';
        await Promise.all([
            service.writeFile(file1, VSBuffer.fromString(newContent)),
            service.writeFile(file2, VSBuffer.fromString(newContent)),
            service.writeFile(file3, VSBuffer.fromString(newContent))
        ]);
        assert.ok(service.exists(file1));
        assert.ok(service.exists(file2));
        assert.ok(service.exists(file3));
    });
    test('writeFile - error when writing to folder that is a file', async () => {
        const existingFile = URI.file(join(testDir, 'my-file'));
        await service.createFile(existingFile);
        const newFile = joinPath(existingFile, 'file-1');
        let error;
        const newContent = 'Updates to the small file';
        try {
            await service.writeFile(newFile, VSBuffer.fromString(newContent));
        }
        catch (e) {
            error = e;
        }
        assert.ok(error);
    });
    test('appendFile', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 524288 /* FileSystemProviderCapabilities.FileAppend */);
        return testAppendFile();
    });
    test('appendFile - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ | 524288 /* FileSystemProviderCapabilities.FileAppend */);
        return testAppendFile();
    });
    async function testAppendFile() {
        let event;
        disposables.add(service.onDidRunOperation(e => event = e));
        const resource = URI.file(join(testDir, 'small.txt'));
        const content = readFileSync(resource.fsPath).toString();
        assert.strictEqual(content, 'Small File');
        const appendContent = ' - Appended!';
        await service.writeFile(resource, VSBuffer.fromString(appendContent), { append: true });
        assert.ok(event);
        assert.strictEqual(event.resource.fsPath, resource.fsPath);
        assert.strictEqual(event.operation, 4 /* FileOperation.WRITE */);
        assert.strictEqual(readFileSync(resource.fsPath).toString(), 'Small File - Appended!');
    }
    test('appendFile (readable)', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 524288 /* FileSystemProviderCapabilities.FileAppend */);
        return testAppendFileReadable();
    });
    test('appendFile (readable) - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ | 524288 /* FileSystemProviderCapabilities.FileAppend */);
        return testAppendFileReadable();
    });
    async function testAppendFileReadable() {
        const resource = URI.file(join(testDir, 'small.txt'));
        const content = readFileSync(resource.fsPath).toString();
        assert.strictEqual(content, 'Small File');
        const appendContent = ' - Appended via readable!';
        await service.writeFile(resource, bufferToReadable(VSBuffer.fromString(appendContent)), { append: true });
        assert.strictEqual(readFileSync(resource.fsPath).toString(), 'Small File - Appended via readable!');
    }
    test('appendFile (stream)', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 524288 /* FileSystemProviderCapabilities.FileAppend */);
        return testAppendFileStream();
    });
    test('appendFile (stream) - buffered', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ | 524288 /* FileSystemProviderCapabilities.FileAppend */);
        return testAppendFileStream();
    });
    async function testAppendFileStream() {
        const resource = URI.file(join(testDir, 'small.txt'));
        const content = readFileSync(resource.fsPath).toString();
        assert.strictEqual(content, 'Small File');
        const appendContent = ' - Appended via stream!';
        await service.writeFile(resource, bufferToStream(VSBuffer.fromString(appendContent)), { append: true });
        assert.strictEqual(readFileSync(resource.fsPath).toString(), 'Small File - Appended via stream!');
    }
    test('appendFile - creates file if not exists', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 524288 /* FileSystemProviderCapabilities.FileAppend */);
        return testAppendFileCreatesFile();
    });
    test('appendFile - creates file if not exists (buffered)', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ | 524288 /* FileSystemProviderCapabilities.FileAppend */);
        return testAppendFileCreatesFile();
    });
    async function testAppendFileCreatesFile() {
        const resource = URI.file(join(testDir, 'appendfile-new.txt'));
        assert.strictEqual(existsSync(resource.fsPath), false);
        const content = 'Initial content via append';
        await service.writeFile(resource, VSBuffer.fromString(content), { append: true });
        assert.strictEqual(existsSync(resource.fsPath), true);
        assert.strictEqual(readFileSync(resource.fsPath).toString(), content);
    }
    test('appendFile - multiple appends', async () => {
        setCapabilities(fileProvider, 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 524288 /* FileSystemProviderCapabilities.FileAppend */);
        return testAppendFileMultiple();
    });
    test('appendFile - multiple appends (buffered)', async () => {
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ | 524288 /* FileSystemProviderCapabilities.FileAppend */);
        return testAppendFileMultiple();
    });
    async function testAppendFileMultiple() {
        const resource = URI.file(join(testDir, 'appendfile-multiple.txt'));
        await service.writeFile(resource, VSBuffer.fromString('Line 1\n'), { append: true });
        await service.writeFile(resource, VSBuffer.fromString('Line 2\n'), { append: true });
        await service.writeFile(resource, VSBuffer.fromString('Line 3\n'), { append: true });
        assert.strictEqual(readFileSync(resource.fsPath).toString(), 'Line 1\nLine 2\nLine 3\n');
    }
    test('appendFile - throws when provider does not support append', async () => {
        // Remove FileAppend capability - should throw error
        setCapabilities(fileProvider, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */);
        const resource = URI.file(join(testDir, 'small.txt'));
        const appendContent = ' - Appended via fallback!';
        let error;
        try {
            await service.writeFile(resource, VSBuffer.fromString(appendContent), { append: true });
        }
        catch (e) {
            error = e;
        }
        assert.ok(error);
        assert.ok(error.message.includes('does not support append'));
    });
    test('read - mixed positions', async () => {
        const resource = URI.file(join(testDir, 'lorem.txt'));
        // read multiple times from position 0
        let buffer = VSBuffer.alloc(1024);
        let fd = await fileProvider.open(resource, { create: false });
        for (let i = 0; i < 3; i++) {
            await fileProvider.read(fd, 0, buffer.buffer, 0, 26);
            assert.strictEqual(buffer.slice(0, 26).toString(), 'Lorem ipsum dolor sit amet');
        }
        await fileProvider.close(fd);
        // read multiple times at various locations
        buffer = VSBuffer.alloc(1024);
        fd = await fileProvider.open(resource, { create: false });
        let posInFile = 0;
        await fileProvider.read(fd, posInFile, buffer.buffer, 0, 26);
        assert.strictEqual(buffer.slice(0, 26).toString(), 'Lorem ipsum dolor sit amet');
        posInFile += 26;
        await fileProvider.read(fd, posInFile, buffer.buffer, 0, 1);
        assert.strictEqual(buffer.slice(0, 1).toString(), ',');
        posInFile += 1;
        await fileProvider.read(fd, posInFile, buffer.buffer, 0, 12);
        assert.strictEqual(buffer.slice(0, 12).toString(), ' consectetur');
        posInFile += 12;
        await fileProvider.read(fd, 98 /* no longer in sequence of posInFile */, buffer.buffer, 0, 9);
        assert.strictEqual(buffer.slice(0, 9).toString(), 'fermentum');
        await fileProvider.read(fd, 27, buffer.buffer, 0, 12);
        assert.strictEqual(buffer.slice(0, 12).toString(), ' consectetur');
        await fileProvider.read(fd, 26, buffer.buffer, 0, 1);
        assert.strictEqual(buffer.slice(0, 1).toString(), ',');
        await fileProvider.read(fd, 0, buffer.buffer, 0, 26);
        assert.strictEqual(buffer.slice(0, 26).toString(), 'Lorem ipsum dolor sit amet');
        await fileProvider.read(fd, posInFile /* back in sequence */, buffer.buffer, 0, 11);
        assert.strictEqual(buffer.slice(0, 11).toString(), ' adipiscing');
        await fileProvider.close(fd);
    });
    test('write - mixed positions', async () => {
        const resource = URI.file(join(testDir, 'lorem.txt'));
        const buffer = VSBuffer.alloc(1024);
        const fdWrite = await fileProvider.open(resource, { create: true, unlock: false });
        const fdRead = await fileProvider.open(resource, { create: false });
        let posInFileWrite = 0;
        let posInFileRead = 0;
        const initialContents = VSBuffer.fromString('Lorem ipsum dolor sit amet');
        await fileProvider.write(fdWrite, posInFileWrite, initialContents.buffer, 0, initialContents.byteLength);
        posInFileWrite += initialContents.byteLength;
        await fileProvider.read(fdRead, posInFileRead, buffer.buffer, 0, 26);
        assert.strictEqual(buffer.slice(0, 26).toString(), 'Lorem ipsum dolor sit amet');
        posInFileRead += 26;
        const contents = VSBuffer.fromString('Hello World');
        await fileProvider.write(fdWrite, posInFileWrite, contents.buffer, 0, contents.byteLength);
        posInFileWrite += contents.byteLength;
        await fileProvider.read(fdRead, posInFileRead, buffer.buffer, 0, contents.byteLength);
        assert.strictEqual(buffer.slice(0, contents.byteLength).toString(), 'Hello World');
        posInFileRead += contents.byteLength;
        await fileProvider.write(fdWrite, 6, contents.buffer, 0, contents.byteLength);
        await fileProvider.read(fdRead, 0, buffer.buffer, 0, 11);
        assert.strictEqual(buffer.slice(0, 11).toString(), 'Lorem Hello');
        await fileProvider.write(fdWrite, posInFileWrite, contents.buffer, 0, contents.byteLength);
        posInFileWrite += contents.byteLength;
        await fileProvider.read(fdRead, posInFileWrite - contents.byteLength, buffer.buffer, 0, contents.byteLength);
        assert.strictEqual(buffer.slice(0, contents.byteLength).toString(), 'Hello World');
        await fileProvider.close(fdWrite);
        await fileProvider.close(fdRead);
    });
    test('readonly - is handled properly for a single resource', async () => {
        fileProvider.setReadonly(true);
        const resource = URI.file(join(testDir, 'index.html'));
        const resolveResult = await service.resolve(resource);
        assert.strictEqual(resolveResult.readonly, true);
        const readResult = await service.readFile(resource);
        assert.strictEqual(readResult.readonly, true);
        let writeFileError = undefined;
        try {
            await service.writeFile(resource, VSBuffer.fromString('Hello Test'));
        }
        catch (error) {
            writeFileError = error;
        }
        assert.ok(writeFileError);
        let deleteFileError = undefined;
        try {
            await service.del(resource);
        }
        catch (error) {
            deleteFileError = error;
        }
        assert.ok(deleteFileError);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlza0ZpbGVTZXJ2aWNlLmludGVncmF0aW9uVGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3Qvbm9kZS9kaXNrRmlsZVNlcnZpY2UuaW50ZWdyYXRpb25UZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDaEgsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxjQUFjLEVBQUUsNEJBQTRCLEVBQUUsUUFBUSxFQUE0QyxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZMLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNqRixPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3hELE9BQU8sRUFBRSxV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RixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw4Q0FBOEMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMvRCxNQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxDQUFDLEVBQUUsRUFBRSxlQUFlLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN4RyxNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFNUIsTUFBTSxPQUFPLEdBQUcsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BILE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDOUQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFDN0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUUvQyxNQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQyxFQUFFLEVBQUUsZUFBZSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDL0csTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FB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