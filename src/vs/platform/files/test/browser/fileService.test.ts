/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { consumeStream, newWriteableStream, ReadableStreamEvents } from 'vs/base/common/stream';
import { URI } from 'vs/base/common/uri';
import { FileChangeType, FileOpenOptions, FileReadStreamOptions, FileSystemProviderCapabilities, FileType, IFileChange, IFileSystemProviderCapabilitiesChangeEvent, IFileSystemProviderRegistrationEvent, IStat } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullFileSystemProvider } from 'vs/platform/files/test/common/nullFileSystemProvider';
import { NullLogService } from 'vs/platform/log/common/log';

suite('File Service', () => {

	test('provider registration', async () => {
		const service = new FileService(new NullLogService());
		const resource = URI.parse('test://foo/bar');
		const provider = new NullFileSystemProvider();

		assert.strictEqual(await service.canHandleResource(resource), false);
		assert.strictEqual(service.hasProvider(resource), false);
		assert.strictEqual(service.getProvider(resource.scheme), undefined);

		const registrations: IFileSystemProviderRegistrationEvent[] = [];
		service.onDidChangeFileSystemProviderRegistrations(e => {
			registrations.push(e);
		});

		const capabilityChanges: IFileSystemProviderCapabilitiesChangeEvent[] = [];
		service.onDidChangeFileSystemProviderCapabilities(e => {
			capabilityChanges.push(e);
		});

		let registrationDisposable: IDisposable | undefined;
		let callCount = 0;
		service.onWillActivateFileSystemProvider(e => {
			callCount++;

			if (e.scheme === 'test' && callCount === 1) {
				e.join(new Promise(resolve => {
					registrationDisposable = service.registerProvider('test', provider);

					resolve();
				}));
			}
		});

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

		service.dispose();
	});

	test('provider change events are throttled', async () => {
		const service = new FileService(new NullLogService());

		const provider = new NullFileSystemProvider();
		service.registerProvider('test', provider);

		await service.activateProvider('test');

		let onDidFilesChangeFired = false;
		service.onDidFilesChange(e => {
			if (e.contains(URI.file('marker'))) {
				onDidFilesChangeFired = true;
			}
		});

		const throttledEvents: IFileChange[] = [];
		for (let i = 0; i < 1000; i++) {
			throttledEvents.push({ resource: URI.file(String(i)), type: FileChangeType.ADDED });
		}
		throttledEvents.push({ resource: URI.file('marker'), type: FileChangeType.ADDED });

		const nonThrottledEvents: IFileChange[] = [];
		for (let i = 0; i < 100; i++) {
			nonThrottledEvents.push({ resource: URI.file(String(i)), type: FileChangeType.ADDED });
		}
		nonThrottledEvents.push({ resource: URI.file('marker'), type: FileChangeType.ADDED });

		// 100 events are not throttled
		provider.emitFileChangeEvents(nonThrottledEvents);
		assert.strictEqual(onDidFilesChangeFired, true);
		onDidFilesChangeFired = false;

		// 1000 events are throttled
		provider.emitFileChangeEvents(throttledEvents);
		assert.strictEqual(onDidFilesChangeFired, false);

		service.dispose();
	});

	test('watch', async () => {
		const service = new FileService(new NullLogService());

		let disposeCounter = 0;
		service.registerProvider('test', new NullFileSystemProvider(() => {
			return toDisposable(() => {
				disposeCounter++;
			});
		}));
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

		await timeout(0); // service.watch() is async
		assert.strictEqual(disposeCounter, 0);
		watcher3Disposable1.dispose();
		assert.strictEqual(disposeCounter, 1);
		watcher3Disposable2.dispose();
		assert.strictEqual(disposeCounter, 2);

		service.dispose();
	});

	test('watch: explicit watched resources have preference over implicit and do not get throttled', async () => {
		const service = new FileService(new NullLogService());

		const provider = new NullFileSystemProvider();
		service.registerProvider('test', provider);

		await service.activateProvider('test');

		let onDidFilesChangeFired = false;
		service.onDidFilesChange(e => {
			if (e.contains(URI.file('marker'))) {
				onDidFilesChangeFired = true;
			}
		});

		const throttledEvents: IFileChange[] = [];
		for (let i = 0; i < 1000; i++) {
			throttledEvents.push({ resource: URI.file(String(i)), type: FileChangeType.ADDED });
		}
		throttledEvents.push({ resource: URI.file('marker'), type: FileChangeType.ADDED });

		// not throttled when explicitly watching
		let disposable1 = service.watch(URI.file('marker'));
		provider.emitFileChangeEvents(throttledEvents);
		assert.strictEqual(onDidFilesChangeFired, true);
		onDidFilesChangeFired = false;

		let disposable2 = service.watch(URI.file('marker'));
		provider.emitFileChangeEvents(throttledEvents);
		assert.strictEqual(onDidFilesChangeFired, true);
		onDidFilesChangeFired = false;

		disposable1.dispose();
		provider.emitFileChangeEvents(throttledEvents);
		assert.strictEqual(onDidFilesChangeFired, true);
		onDidFilesChangeFired = false;

		// throttled again after dispose
		disposable2.dispose();
		provider.emitFileChangeEvents(throttledEvents);
		assert.strictEqual(onDidFilesChangeFired, false);

		// not throttled when watched again
		service.watch(URI.file('marker'));
		provider.emitFileChangeEvents(throttledEvents);
		assert.strictEqual(onDidFilesChangeFired, true);
		onDidFilesChangeFired = false;

		service.dispose();
	});

	test('error from readFile bubbles through (https://github.com/microsoft/vscode/issues/118060) - async', async () => {
		testReadErrorBubbles(true);
	});

	test('error from readFile bubbles through (https://github.com/microsoft/vscode/issues/118060)', async () => {
		testReadErrorBubbles(false);
	});

	async function testReadErrorBubbles(async: boolean) {
		const service = new FileService(new NullLogService());

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
					return timeout(5).then(() => { throw new Error('failed'); });
				}

				throw new Error('failed');
			}

			override open(resource: URI, opts: FileOpenOptions): Promise<number> {
				if (async) {
					return timeout(5).then(() => { throw new Error('failed'); });
				}

				throw new Error('failed');
			}

			readFileStream(resource: URI, opts: FileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
				if (async) {
					const stream = newWriteableStream<Uint8Array>(chunk => chunk[0]);
					timeout(5).then(() => stream.error(new Error('failed')));

					return stream;

				}

				throw new Error('failed');
			}
		};

		const disposable = service.registerProvider('test', provider);

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

		disposable.dispose();
	}
});
