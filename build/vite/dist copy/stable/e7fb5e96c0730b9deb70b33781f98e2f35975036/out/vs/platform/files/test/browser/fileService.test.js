/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { bufferToReadable, bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { consumeStream, newWriteableStream } from '../../../../base/common/stream.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileType, isFileSystemWatcher } from '../../common/files.js';
import { FileService } from '../../common/fileService.js';
import { NullFileSystemProvider } from '../common/nullFileSystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
suite('File Service', () => {
    const disposables = new DisposableStore();
    teardown(() => {
        disposables.clear();
    });
    test('provider registration', async () => {
        const service = disposables.add(new FileService(new NullLogService()));
        const resource = URI.parse('test://foo/bar');
        const provider = new NullFileSystemProvider();
        assert.strictEqual(await service.canHandleResource(resource), false);
        assert.strictEqual(service.hasProvider(resource), false);
        assert.strictEqual(service.getProvider(resource.scheme), undefined);
        const registrations = [];
        disposables.add(service.onDidChangeFileSystemProviderRegistrations(e => {
            registrations.push(e);
        }));
        const capabilityChanges = [];
        disposables.add(service.onDidChangeFileSystemProviderCapabilities(e => {
            capabilityChanges.push(e);
        }));
        let registrationDisposable;
        let callCount = 0;
        disposables.add(service.onWillActivateFileSystemProvider(e => {
            callCount++;
            if (e.scheme === 'test' && callCount === 1) {
                e.join(new Promise(resolve => {
                    registrationDisposable = service.registerProvider('test', provider);
                    resolve();
                }));
            }
        }));
        assert.strictEqual(await service.canHandleResource(resource), true);
        assert.strictEqual(service.hasProvider(resource), true);
        assert.strictEqual(service.getProvider(resource.scheme), provider);
        assert.strictEqual(registrations.length, 1);
        assert.strictEqual(registrations[0].scheme, 'test');
        assert.strictEqual(registrations[0].added, true);
        assert.ok(registrationDisposable);
        assert.strictEqual(capabilityChanges.length, 0);
        provider.setCapabilities(8 /* FileSystemProviderCapabilities.FileFolderCopy */);
        assert.strictEqual(capabilityChanges.length, 1);
        provider.setCapabilities(2048 /* FileSystemProviderCapabilities.Readonly */);
        assert.strictEqual(capabilityChanges.length, 2);
        await service.activateProvider('test');
        assert.strictEqual(callCount, 2); // activation is called again
        assert.strictEqual(service.hasCapability(resource, 2048 /* FileSystemProviderCapabilities.Readonly */), true);
        assert.strictEqual(service.hasCapability(resource, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */), false);
        registrationDisposable.dispose();
        assert.strictEqual(await service.canHandleResource(resource), false);
        assert.strictEqual(service.hasProvider(resource), false);
        assert.strictEqual(registrations.length, 2);
        assert.strictEqual(registrations[1].scheme, 'test');
        assert.strictEqual(registrations[1].added, false);
    });
    test('watch', async () => {
        const service = disposables.add(new FileService(new NullLogService()));
        let disposeCounter = 0;
        disposables.add(service.registerProvider('test', new NullFileSystemProvider(() => {
            return toDisposable(() => {
                disposeCounter++;
            });
        })));
        await service.activateProvider('test');
        const resource1 = URI.parse('test://foo/bar1');
        const watcher1Disposable = service.watch(resource1);
        await timeout(0); // service.watch() is async
        assert.strictEqual(disposeCounter, 0);
        watcher1Disposable.dispose();
        assert.strictEqual(disposeCounter, 1);
        disposeCounter = 0;
        const resource2 = URI.parse('test://foo/bar2');
        const watcher2Disposable1 = service.watch(resource2);
        const watcher2Disposable2 = service.watch(resource2);
        const watcher2Disposable3 = service.watch(resource2);
        await timeout(0); // service.watch() is async
        assert.strictEqual(disposeCounter, 0);
        watcher2Disposable1.dispose();
        assert.strictEqual(disposeCounter, 0);
        watcher2Disposable2.dispose();
        assert.strictEqual(disposeCounter, 0);
        watcher2Disposable3.dispose();
        assert.strictEqual(disposeCounter, 1);
        disposeCounter = 0;
        const resource3 = URI.parse('test://foo/bar3');
        const watcher3Disposable1 = service.watch(resource3);
        const watcher3Disposable2 = service.watch(resource3, { recursive: true, excludes: [] });
        const watcher3Disposable3 = service.watch(resource3, { recursive: false, excludes: [], includes: [] });
        await timeout(0); // service.watch() is async
        assert.strictEqual(disposeCounter, 0);
        watcher3Disposable1.dispose();
        assert.strictEqual(disposeCounter, 1);
        watcher3Disposable2.dispose();
        assert.strictEqual(disposeCounter, 2);
        watcher3Disposable3.dispose();
        assert.strictEqual(disposeCounter, 3);
        service.dispose();
    });
    test('watch - with corelation', async () => {
        const service = disposables.add(new FileService(new NullLogService()));
        const provider = new class extends NullFileSystemProvider {
            constructor() {
                super(...arguments);
                this._testOnDidChangeFile = new Emitter();
                this.onDidChangeFile = this._testOnDidChangeFile.event;
            }
            fireFileChange(changes) {
                this._testOnDidChangeFile.fire(changes);
            }
        };
        disposables.add(service.registerProvider('test', provider));
        await service.activateProvider('test');
        const globalEvents = [];
        disposables.add(service.onDidFilesChange(e => {
            globalEvents.push(e);
        }));
        const watcher0 = disposables.add(service.watch(URI.parse('test://watch/folder1'), { recursive: true, excludes: [], includes: [] }));
        assert.strictEqual(isFileSystemWatcher(watcher0), false);
        const watcher1 = disposables.add(service.watch(URI.parse('test://watch/folder2'), { recursive: true, excludes: [], includes: [], correlationId: 100 }));
        assert.strictEqual(isFileSystemWatcher(watcher1), true);
        const watcher2 = disposables.add(service.watch(URI.parse('test://watch/folder3'), { recursive: true, excludes: [], includes: [], correlationId: 200 }));
        assert.strictEqual(isFileSystemWatcher(watcher2), true);
        const watcher1Events = [];
        disposables.add(watcher1.onDidChange(e => {
            watcher1Events.push(e);
        }));
        const watcher2Events = [];
        disposables.add(watcher2.onDidChange(e => {
            watcher2Events.push(e);
        }));
        provider.fireFileChange([{ resource: URI.parse('test://watch/folder1'), type: 1 /* FileChangeType.ADDED */ }]);
        provider.fireFileChange([{ resource: URI.parse('test://watch/folder2'), type: 1 /* FileChangeType.ADDED */, cId: 100 }]);
        provider.fireFileChange([{ resource: URI.parse('test://watch/folder2'), type: 1 /* FileChangeType.ADDED */, cId: 100 }]);
        provider.fireFileChange([{ resource: URI.parse('test://watch/folder3/file'), type: 0 /* FileChangeType.UPDATED */, cId: 200 }]);
        provider.fireFileChange([{ resource: URI.parse('test://watch/folder3'), type: 0 /* FileChangeType.UPDATED */, cId: 200 }]);
        provider.fireFileChange([{ resource: URI.parse('test://watch/folder4'), type: 1 /* FileChangeType.ADDED */, cId: 50 }]);
        provider.fireFileChange([{ resource: URI.parse('test://watch/folder4'), type: 1 /* FileChangeType.ADDED */, cId: 60 }]);
        provider.fireFileChange([{ resource: URI.parse('test://watch/folder4'), type: 1 /* FileChangeType.ADDED */, cId: 70 }]);
        assert.strictEqual(globalEvents.length, 1);
        assert.strictEqual(watcher1Events.length, 2);
        assert.strictEqual(watcher2Events.length, 2);
    });
    test('error from readFile bubbles through (https://github.com/microsoft/vscode/issues/118060) - async', async () => {
        testReadErrorBubbles(true);
    });
    test('error from readFile bubbles through (https://github.com/microsoft/vscode/issues/118060)', async () => {
        testReadErrorBubbles(false);
    });
    async function testReadErrorBubbles(async) {
        const service = disposables.add(new FileService(new NullLogService()));
        const provider = new class extends NullFileSystemProvider {
            async stat(resource) {
                return {
                    mtime: Date.now(),
                    ctime: Date.now(),
                    size: 100,
                    type: FileType.File
                };
            }
            readFile(resource) {
                if (async) {
                    return timeout(5, CancellationToken.None).then(() => { throw new Error('failed'); });
                }
                throw new Error('failed');
            }
            open(resource, opts) {
                if (async) {
                    return timeout(5, CancellationToken.None).then(() => { throw new Error('failed'); });
                }
                throw new Error('failed');
            }
            readFileStream(resource, opts, token) {
                if (async) {
                    const stream = newWriteableStream(chunk => chunk[0]);
                    timeout(5, CancellationToken.None).then(() => stream.error(new Error('failed')));
                    return stream;
                }
                throw new Error('failed');
            }
        };
        disposables.add(service.registerProvider('test', provider));
        for (const capabilities of [2 /* FileSystemProviderCapabilities.FileReadWrite */, 16 /* FileSystemProviderCapabilities.FileReadStream */, 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */]) {
            provider.setCapabilities(capabilities);
            let e1;
            try {
                await service.readFile(URI.parse('test://foo/bar'));
            }
            catch (error) {
                e1 = error;
            }
            assert.ok(e1);
            let e2;
            try {
                const stream = await service.readFileStream(URI.parse('test://foo/bar'));
                await consumeStream(stream.value, chunk => chunk[0]);
            }
            catch (error) {
                e2 = error;
            }
            assert.ok(e2);
        }
    }
    test('readFile/readFileStream supports cancellation (https://github.com/microsoft/vscode/issues/138805)', async () => {
        const service = disposables.add(new FileService(new NullLogService()));
        let readFileStreamReady = undefined;
        const provider = new class extends NullFileSystemProvider {
            async stat(resource) {
                return {
                    mtime: Date.now(),
                    ctime: Date.now(),
                    size: 100,
                    type: FileType.File
                };
            }
            readFileStream(resource, opts, token) {
                const stream = newWriteableStream(chunk => chunk[0]);
                disposables.add(token.onCancellationRequested(() => {
                    stream.error(new Error('Expected cancellation'));
                    stream.end();
                }));
                readFileStreamReady.complete();
                return stream;
            }
        };
        disposables.add(service.registerProvider('test', provider));
        provider.setCapabilities(16 /* FileSystemProviderCapabilities.FileReadStream */);
        let e1;
        try {
            const cts = new CancellationTokenSource();
            readFileStreamReady = new DeferredPromise();
            const promise = service.readFile(URI.parse('test://foo/bar'), undefined, cts.token);
            await Promise.all([readFileStreamReady.p.then(() => cts.cancel()), promise]);
        }
        catch (error) {
            e1 = error;
        }
        assert.ok(e1);
        let e2;
        try {
            const cts = new CancellationTokenSource();
            readFileStreamReady = new DeferredPromise();
            const stream = await service.readFileStream(URI.parse('test://foo/bar'), undefined, cts.token);
            await Promise.all([readFileStreamReady.p.then(() => cts.cancel()), consumeStream(stream.value, chunk => chunk[0])]);
        }
        catch (error) {
            e2 = error;
        }
        assert.ok(e2);
    });
    test('enforced atomic read/write/delete', async () => {
        const service = disposables.add(new FileService(new NullLogService()));
        const atomicResource = URI.parse('test://foo/bar/atomic');
        const nonAtomicResource = URI.parse('test://foo/nonatomic');
        let atomicReadCounter = 0;
        let atomicWriteCounter = 0;
        let atomicDeleteCounter = 0;
        const provider = new class extends NullFileSystemProvider {
            async stat(resource) {
                return {
                    type: FileType.File,
                    ctime: Date.now(),
                    mtime: Date.now(),
                    size: 0
                };
            }
            async readFile(resource, opts) {
                if (opts?.atomic) {
                    atomicReadCounter++;
                }
                return new Uint8Array();
            }
            readFileStream(resource, opts, token) {
                return newWriteableStream(chunk => chunk[0]);
            }
            enforceAtomicReadFile(resource) {
                return isEqual(resource, atomicResource);
            }
            async writeFile(resource, content, opts) {
                if (opts.atomic) {
                    atomicWriteCounter++;
                }
            }
            enforceAtomicWriteFile(resource) {
                return isEqual(resource, atomicResource) ? { postfix: '.tmp' } : false;
            }
            async delete(resource, opts) {
                if (opts.atomic) {
                    atomicDeleteCounter++;
                }
            }
            enforceAtomicDelete(resource) {
                return isEqual(resource, atomicResource) ? { postfix: '.tmp' } : false;
            }
        };
        provider.setCapabilities(2 /* FileSystemProviderCapabilities.FileReadWrite */ |
            4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ |
            16 /* FileSystemProviderCapabilities.FileReadStream */ |
            16384 /* FileSystemProviderCapabilities.FileAtomicRead */ |
            32768 /* FileSystemProviderCapabilities.FileAtomicWrite */ |
            65536 /* FileSystemProviderCapabilities.FileAtomicDelete */);
        disposables.add(service.registerProvider('test', provider));
        await service.readFile(atomicResource);
        await service.readFile(nonAtomicResource);
        await service.readFileStream(atomicResource);
        await service.readFileStream(nonAtomicResource);
        await service.writeFile(atomicResource, VSBuffer.fromString(''));
        await service.writeFile(nonAtomicResource, VSBuffer.fromString(''));
        await service.writeFile(atomicResource, bufferToStream(VSBuffer.fromString('')));
        await service.writeFile(nonAtomicResource, bufferToStream(VSBuffer.fromString('')));
        await service.writeFile(atomicResource, bufferToReadable(VSBuffer.fromString('')));
        await service.writeFile(nonAtomicResource, bufferToReadable(VSBuffer.fromString('')));
        await service.del(atomicResource);
        await service.del(nonAtomicResource);
        assert.strictEqual(atomicReadCounter, 2);
        assert.strictEqual(atomicWriteCounter, 3);
        assert.strictEqual(atomicDeleteCounter, 1);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZVNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3QvYnJvd3Nlci9maWxlU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxjQUFjLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxhQUFhLEVBQUUsa0JBQWtCLEVBQXdCLE1BQU0sbUNBQW1DLENBQUM7QUFDNUcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBNEUsUUFBUSxFQUE2VixtQkFBbUIsRUFBb0MsTUFBTSx1QkFBdUIsQ0FBQztBQUM3Z0IsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzFELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUU1RCxLQUFLLENBQUMsY0FBYyxF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