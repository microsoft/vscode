/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise, timeout } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { consumeStream, newWriteableStream, ReadableStreamEvents } from 'vs/base/common/stream';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IFileOpenOptions, IFileReadStreamOptions, FileSystemProviderCapabilities, FileType, IFileSystemProviderCapabilitiesChangeEvent, IFileSystemProviderRegistrationEvent, IStat } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullFileSystemProvider } from 'vs/platform/files/test/common/nullFileSystemProvider';
import { NullLogService } from 'vs/platform/log/common/log';

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

		registrationDisposable!.dispose();

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

			readFileStream(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
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

			readFileStream(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
				const stream = newWriteableStream<Uint8Array>(chunk => chunk[0]);
				disposables.add(token.onCancellationRequested(() => {
					stream.error(new Error('Expected cancellation'));
					stream.end();
				}));

				readFileStreamReady!.complete();

				return stream;
			}
		};

		const disposable = service.registerProvider('test', provider);

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

		disposable.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
