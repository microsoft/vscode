/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { bufferToReadable, bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { consumeStream, newWriteableStream, ReadableStreamEvents } from '../../../../base/common/stream.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IFileOpenOptions, IFileReadStreamOptions, FileSystemProviderCapabilities, FileType, IFileSystemProviderCapabilitiesChangeEvent, IFileSystemProviderRegistrationEvent, IStat, IFileAtomicReadOptions, IFileAtomicWriteOptions, IFileAtomicDeleteOptions, IFileSystemProviderWithFileAtomicReadCapability, IFileSystemProviderWithFileAtomicDeleteCapability, IFileSystemProviderWithFileAtomicWriteCapability, IFileAtomicOptions, IFileChange, isFileSystemWatcher, FileChangesEvent, FileChangeType } from '../../common/files.js';
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

		const registrations: IFileSystemProviderRegistrationEvent[] = [];
		disposables.add(service.onDidChangeFileSystemProviderRegistrations(e => {
			registrations.push(e);
		}));

		const capabilityChanges: IFileSystemProviderCapabilitiesChangeEvent[] = [];
		disposables.add(service.onDidChangeFileSystemProviderCapabilities(e => {
			capabilityChanges.push(e);
		}));

		let registrationDisposable: IDisposable | undefined;
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

		provider.setCapabilities(FileSystemProviderCapabilities.FileFolderCopy);
		assert.strictEqual(capabilityChanges.length, 1);
		provider.setCapabilities(FileSystemProviderCapabilities.Readonly);
		assert.strictEqual(capabilityChanges.length, 2);

		await service.activateProvider('test');
		assert.strictEqual(callCount, 2); // activation is called again

		assert.strictEqual(service.hasCapability(resource, FileSystemProviderCapabilities.Readonly), true);
		assert.strictEqual(service.hasCapability(resource, FileSystemProviderCapabilities.FileOpenReadWriteClose), false);

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
			private readonly _testOnDidChangeFile = new Emitter<readonly IFileChange[]>();
			override readonly onDidChangeFile: Event<readonly IFileChange[]> = this._testOnDidChangeFile.event;

			fireFileChange(changes: readonly IFileChange[]) {
				this._testOnDidChangeFile.fire(changes);
			}
		};

		disposables.add(service.registerProvider('test', provider));
		await service.activateProvider('test');

		const globalEvents: FileChangesEvent[] = [];
		disposables.add(service.onDidFilesChange(e => {
			globalEvents.push(e);
		}));

		const watcher0 = disposables.add(service.watch(URI.parse('test://watch/folder1'), { recursive: true, excludes: [], includes: [] }));
		assert.strictEqual(isFileSystemWatcher(watcher0), false);
		const watcher1 = disposables.add(service.watch(URI.parse('test://watch/folder2'), { recursive: true, excludes: [], includes: [], correlationId: 100 }));
		assert.strictEqual(isFileSystemWatcher(watcher1), true);
		const watcher2 = disposables.add(service.watch(URI.parse('test://watch/folder3'), { recursive: true, excludes: [], includes: [], correlationId: 200 }));
		assert.strictEqual(isFileSystemWatcher(watcher2), true);

		const watcher1Events: FileChangesEvent[] = [];
		disposables.add(watcher1.onDidChange(e => {
			watcher1Events.push(e);
		}));

		const watcher2Events: FileChangesEvent[] = [];
		disposables.add(watcher2.onDidChange(e => {
			watcher2Events.push(e);
		}));

		provider.fireFileChange([{ resource: URI.parse('test://watch/folder1'), type: FileChangeType.ADDED }]);
		provider.fireFileChange([{ resource: URI.parse('test://watch/folder2'), type: FileChangeType.ADDED, cId: 100 }]);
		provider.fireFileChange([{ resource: URI.parse('test://watch/folder2'), type: FileChangeType.ADDED, cId: 100 }]);
		provider.fireFileChange([{ resource: URI.parse('test://watch/folder3/file'), type: FileChangeType.UPDATED, cId: 200 }]);
		provider.fireFileChange([{ resource: URI.parse('test://watch/folder3'), type: FileChangeType.UPDATED, cId: 200 }]);

		provider.fireFileChange([{ resource: URI.parse('test://watch/folder4'), type: FileChangeType.ADDED, cId: 50 }]);
		provider.fireFileChange([{ resource: URI.parse('test://watch/folder4'), type: FileChangeType.ADDED, cId: 60 }]);
		provider.fireFileChange([{ resource: URI.parse('test://watch/folder4'), type: FileChangeType.ADDED, cId: 70 }]);

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

	async function testReadErrorBubbles(async: boolean) {
		const service = disposables.add(new FileService(new NullLogService()));

		const provider = new class extends NullFileSystemProvider {
			override async stat(resource: URI): Promise<IStat> {
				return {
					mtime: Date.now(),
					ctime: Date.now(),
					size: 100,
					type: FileType.File
				};
			}

			override readFile(resource: URI): Promise<Uint8Array> {
				if (async) {
					return timeout(5, CancellationToken.None).then(() => { throw new Error('failed'); });
				}

				throw new Error('failed');
			}

			override open(resource: URI, opts: IFileOpenOptions): Promise<number> {
				if (async) {
					return timeout(5, CancellationToken.None).then(() => { throw new Error('failed'); });
				}

				throw new Error('failed');
			}

			override readFileStream(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
				if (async) {
					const stream = newWriteableStream<Uint8Array>(chunk => chunk[0]);
					timeout(5, CancellationToken.None).then(() => stream.error(new Error('failed')));

					return stream;

				}

				throw new Error('failed');
			}
		};

		disposables.add(service.registerProvider('test', provider));

		for (const capabilities of [FileSystemProviderCapabilities.FileReadWrite, FileSystemProviderCapabilities.FileReadStream, FileSystemProviderCapabilities.FileOpenReadWriteClose]) {
			provider.setCapabilities(capabilities);

			let e1;
			try {
				await service.readFile(URI.parse('test://foo/bar'));
			} catch (error) {
				e1 = error;
			}

			assert.ok(e1);

			let e2;
			try {
				const stream = await service.readFileStream(URI.parse('test://foo/bar'));
				await consumeStream(stream.value, chunk => chunk[0]);
			} catch (error) {
				e2 = error;
			}

			assert.ok(e2);
		}
	}

	test('readFile/readFileStream supports cancellation (https://github.com/microsoft/vscode/issues/138805)', async () => {
		const service = disposables.add(new FileService(new NullLogService()));

		let readFileStreamReady: DeferredPromise<void> | undefined = undefined;

		const provider = new class extends NullFileSystemProvider {

			override async stat(resource: URI): Promise<IStat> {
				return {
					mtime: Date.now(),
					ctime: Date.now(),
					size: 100,
					type: FileType.File
				};
			}

			override readFileStream(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
				const stream = newWriteableStream<Uint8Array>(chunk => chunk[0]);
				disposables.add(token.onCancellationRequested(() => {
					stream.error(new Error('Expected cancellation'));
					stream.end();
				}));

				readFileStreamReady!.complete();

				return stream;
			}
		};

		disposables.add(service.registerProvider('test', provider));

		provider.setCapabilities(FileSystemProviderCapabilities.FileReadStream);

		let e1;
		try {
			const cts = new CancellationTokenSource();
			readFileStreamReady = new DeferredPromise();
			const promise = service.readFile(URI.parse('test://foo/bar'), undefined, cts.token);
			await Promise.all([readFileStreamReady.p.then(() => cts.cancel()), promise]);
		} catch (error) {
			e1 = error;
		}

		assert.ok(e1);

		let e2;
		try {
			const cts = new CancellationTokenSource();
			readFileStreamReady = new DeferredPromise();
			const stream = await service.readFileStream(URI.parse('test://foo/bar'), undefined, cts.token);
			await Promise.all([readFileStreamReady.p.then(() => cts.cancel()), consumeStream(stream.value, chunk => chunk[0])]);
		} catch (error) {
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

		const provider = new class extends NullFileSystemProvider implements IFileSystemProviderWithFileAtomicReadCapability, IFileSystemProviderWithFileAtomicWriteCapability, IFileSystemProviderWithFileAtomicDeleteCapability {

			override async stat(resource: URI): Promise<IStat> {
				return {
					type: FileType.File,
					ctime: Date.now(),
					mtime: Date.now(),
					size: 0
				};
			}

			override async readFile(resource: URI, opts?: IFileAtomicReadOptions): Promise<Uint8Array> {
				if (opts?.atomic) {
					atomicReadCounter++;
				}
				return new Uint8Array();
			}

			override readFileStream(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
				return newWriteableStream<Uint8Array>(chunk => chunk[0]);
			}

			enforceAtomicReadFile(resource: URI): boolean {
				return isEqual(resource, atomicResource);
			}

			override async writeFile(resource: URI, content: Uint8Array, opts: IFileAtomicWriteOptions): Promise<void> {
				if (opts.atomic) {
					atomicWriteCounter++;
				}
			}

			enforceAtomicWriteFile(resource: URI): IFileAtomicOptions | false {
				return isEqual(resource, atomicResource) ? { postfix: '.tmp' } : false;
			}

			override async delete(resource: URI, opts: IFileAtomicDeleteOptions): Promise<void> {
				if (opts.atomic) {
					atomicDeleteCounter++;
				}
			}

			enforceAtomicDelete(resource: URI): IFileAtomicOptions | false {
				return isEqual(resource, atomicResource) ? { postfix: '.tmp' } : false;
			}
		};

		provider.setCapabilities(
			FileSystemProviderCapabilities.FileReadWrite |
			FileSystemProviderCapabilities.FileOpenReadWriteClose |
			FileSystemProviderCapabilities.FileReadStream |
			FileSystemProviderCapabilities.FileAtomicRead |
			FileSystemProviderCapabilities.FileAtomicWrite |
			FileSystemProviderCapabilities.FileAtomicDelete
		);

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
