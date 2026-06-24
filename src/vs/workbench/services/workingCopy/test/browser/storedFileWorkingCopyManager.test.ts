/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { workbenchInstantiationService, TestServiceAccessor, TestWillShutdownEvent } from '../../../../test/browser/workbenchTestServices.js';
import { StoredFileWorkingCopyManager, IStoredFileWorkingCopyManager, IStoredFileWorkingCopySaveEvent } from '../../common/storedFileWorkingCopyManager.js';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel } from '../../common/storedFileWorkingCopy.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { FileChangesEvent, FileChangeType, FileOperationError, FileOperationResult } from '../../../../../platform/files/common/files.js';
import { timeout } from '../../../../../base/common/async.js';
import { TestStoredFileWorkingCopyModel, TestStoredFileWorkingCopyModelFactory } from './storedFileWorkingCopy.test.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('StoredFileWorkingCopyManager', () => {

	const disposables = new DisposableStore();
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	let manager: IStoredFileWorkingCopyManager<TestStoredFileWorkingCopyModel>;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);

		manager = disposables.add(new StoredFileWorkingCopyManager<TestStoredFileWorkingCopyModel>(
			'testStoredFileWorkingCopyType',
			new TestStoredFileWorkingCopyModelFactory(),
			accessor.fileService, accessor.lifecycleService, accessor.labelService, accessor.logService,
			accessor.workingCopyFileService, accessor.workingCopyBackupService, accessor.uriIdentityService,
			accessor.filesConfigurationService, accessor.workingCopyService, accessor.notificationService,
			accessor.workingCopyEditorService, accessor.editorService, accessor.elevatedFileService,
			accessor.progressService
		));
	});

	teardown(() => {
		for (const workingCopy of manager.workingCopies) {
			workingCopy.dispose();
		}

		disposables.clear();
	});

	test('resolve', async () => {
		const resource = URI.file('/test.html');

		const events: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>[] = [];
		const listener = manager.onDidCreate(workingCopy => {
			events.push(workingCopy);
		});

		const resolvePromise = manager.resolve(resource);
		assert.ok(manager.get(resource)); // working copy known even before resolved()
		assert.strictEqual(manager.workingCopies.length, 1);

		const workingCopy1 = await resolvePromise;
		assert.ok(workingCopy1);
		assert.ok(workingCopy1.model);
		assert.strictEqual(workingCopy1.typeId, 'testStoredFileWorkingCopyType');
		assert.strictEqual(workingCopy1.resource.toString(), resource.toString());
		assert.strictEqual(manager.get(resource), workingCopy1);

		const workingCopy2 = await manager.resolve(resource);
		assert.strictEqual(workingCopy2, workingCopy1);
		assert.strictEqual(manager.workingCopies.length, 1);
		workingCopy1.dispose();

		const workingCopy3 = await manager.resolve(resource);
		assert.notStrictEqual(workingCopy3, workingCopy2);
		assert.strictEqual(manager.workingCopies.length, 1);
		assert.strictEqual(manager.get(resource), workingCopy3);
		workingCopy3.dispose();

		assert.strictEqual(manager.workingCopies.length, 0);

		assert.strictEqual(events.length, 2);
		assert.strictEqual(events[0].resource.toString(), workingCopy1.resource.toString());
		assert.strictEqual(events[1].resource.toString(), workingCopy2.resource.toString());

		listener.dispose();

		workingCopy1.dispose();
		workingCopy2.dispose();
		workingCopy3.dispose();
	});

	test('resolve (async)', async () => {
		const resource = URI.file('/path/index.txt');

		disposables.add(await manager.resolve(resource));

		let didResolve = false;
		let onDidResolve = new Promise<void>(resolve => {
			disposables.add(manager.onDidResolve(({ model }) => {
				if (model?.resource.toString() === resource.toString()) {
					didResolve = true;
					resolve();
				}
			}));
		});

		const resolve = manager.resolve(resource, { reload: { async: true } });

		await onDidResolve;

		assert.strictEqual(didResolve, true);

		didResolve = false;

		onDidResolve = new Promise<void>(resolve => {
			disposables.add(manager.onDidResolve(({ model }) => {
				if (model?.resource.toString() === resource.toString()) {
					didResolve = true;
					resolve();
				}
			}));
		});

		manager.resolve(resource, { reload: { async: true, force: true } });

		await onDidResolve;

		assert.strictEqual(didResolve, true);

		disposables.add(await resolve);
	});

	test('resolve (sync)', async () => {
		const resource = URI.file('/path/index.txt');

		await manager.resolve(resource);

		let didResolve = false;
		disposables.add(manager.onDidResolve(({ model }) => {
			if (model?.resource.toString() === resource.toString()) {
				didResolve = true;
			}
		}));

		disposables.add(await manager.resolve(resource, { reload: { async: false } }));
		assert.strictEqual(didResolve, true);

		didResolve = false;

		disposables.add(await manager.resolve(resource, { reload: { async: false, force: true } }));
		assert.strictEqual(didResolve, true);
	});

	test('resolve (sync) - model disposed when error and first call to resolve', async () => {
		const resource = URI.file('/path/index.txt');

		accessor.fileService.readShouldThrowError = new FileOperationError('fail', FileOperationResult.FILE_OTHER_ERROR);

		try {
			let error: Error | undefined = undefined;
			try {
				await manager.resolve(resource);
			} catch (e) {
				error = e;
			}

			assert.ok(error);
			assert.strictEqual(manager.workingCopies.length, 0);
		} finally {
			accessor.fileService.readShouldThrowError = undefined;
		}
	});

	test('resolve (sync) - model not disposed when error and model existed before', async () => {
		const resource = URI.file('/path/index.txt');

		disposables.add(await manager.resolve(resource));

		accessor.fileService.readShouldThrowError = new FileOperationError('fail', FileOperationResult.FILE_OTHER_ERROR);

		try {
			let error: Error | undefined = undefined;
			try {
				await manager.resolve(resource, { reload: { async: false } });
			} catch (e) {
				error = e;
			}

			assert.ok(error);
			assert.strictEqual(manager.workingCopies.length, 1);
		} finally {
			accessor.fileService.readShouldThrowError = undefined;
		}
	});

	test('resolve with initial contents', async () => {
		const resource = URI.file('/test.html');

		const workingCopy = await manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString('Hello World')) });
		assert.strictEqual(workingCopy.model?.contents, 'Hello World');
		assert.strictEqual(workingCopy.isDirty(), true);

		await manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString('More Changes')) });
		assert.strictEqual(workingCopy.model?.contents, 'More Changes');
		assert.strictEqual(workingCopy.isDirty(), true);

		workingCopy.dispose();
	});

	test('multiple resolves execute in sequence (same resources)', async () => {
		const resource = URI.file('/test.html');

		const firstPromise = manager.resolve(resource);
		const secondPromise = manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString('Hello World')) });
		const thirdPromise = manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString('More Changes')) });

		await firstPromise;
		await secondPromise;
		const workingCopy = await thirdPromise;

		assert.strictEqual(workingCopy.model?.contents, 'More Changes');
		assert.strictEqual(workingCopy.isDirty(), true);

		workingCopy.dispose();
	});

	test('multiple resolves execute in parallel (different resources)', async () => {
		const resource1 = URI.file('/test1.html');
		const resource2 = URI.file('/test2.html');
		const resource3 = URI.file('/test3.html');

		const firstPromise = manager.resolve(resource1);
		const secondPromise = manager.resolve(resource2);
		const thirdPromise = manager.resolve(resource3);

		const [workingCopy1, workingCopy2, workingCopy3] = await Promise.all([firstPromise, secondPromise, thirdPromise]);

		assert.strictEqual(manager.workingCopies.length, 3);
		assert.strictEqual(workingCopy1.resource.toString(), resource1.toString());
		assert.strictEqual(workingCopy2.resource.toString(), resource2.toString());
		assert.strictEqual(workingCopy3.resource.toString(), resource3.toString());

		workingCopy1.dispose();
		workingCopy2.dispose();
		workingCopy3.dispose();
	});

	test('removed from cache when working copy or model gets disposed', async () => {
		const resource = URI.file('/test.html');

		let workingCopy = await manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString('Hello World')) });

		assert.strictEqual(manager.get(URI.file('/test.html')), workingCopy);

		workingCopy.dispose();
		assert(!manager.get(URI.file('/test.html')));

		workingCopy = await manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString('Hello World')) });

		assert.strictEqual(manager.get(URI.file('/test.html')), workingCopy);

		workingCopy.model?.dispose();
		assert(!manager.get(URI.file('/test.html')));
	});

	test('events', async () => {
		const resource1 = URI.file('/path/index.txt');
		const resource2 = URI.file('/path/other.txt');

		let createdCounter = 0;
		let resolvedCounter = 0;
		let removedCounter = 0;
		let gotDirtyCounter = 0;
		let gotNonDirtyCounter = 0;
		let revertedCounter = 0;
		let savedCounter = 0;
		let saveErrorCounter = 0;

		disposables.add(manager.onDidCreate(() => {
			createdCounter++;
		}));

		disposables.add(manager.onDidRemove(resource => {
			if (resource.toString() === resource1.toString() || resource.toString() === resource2.toString()) {
				removedCounter++;
			}
		}));

		disposables.add(manager.onDidResolve(workingCopy => {
			if (workingCopy.resource.toString() === resource1.toString()) {
				resolvedCounter++;
			}
		}));

		disposables.add(manager.onDidChangeDirty(workingCopy => {
			if (workingCopy.resource.toString() === resource1.toString()) {
				if (workingCopy.isDirty()) {
					gotDirtyCounter++;
				} else {
					gotNonDirtyCounter++;
				}
			}
		}));

		disposables.add(manager.onDidRevert(workingCopy => {
			if (workingCopy.resource.toString() === resource1.toString()) {
				revertedCounter++;
			}
		}));

		let lastSaveEvent: IStoredFileWorkingCopySaveEvent<TestStoredFileWorkingCopyModel> | undefined = undefined;
		disposables.add(manager.onDidSave((e) => {
			if (e.workingCopy.resource.toString() === resource1.toString()) {
				lastSaveEvent = e;
				savedCounter++;
			}
		}));

		disposables.add(manager.onDidSaveError(workingCopy => {
			if (workingCopy.resource.toString() === resource1.toString()) {
				saveErrorCounter++;
			}
		}));

		const workingCopy1 = disposables.add(await manager.resolve(resource1));
		assert.strictEqual(resolvedCounter, 1);
		assert.strictEqual(createdCounter, 1);

		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.DELETED }], false));
		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.ADDED }], false));

		const workingCopy2 = disposables.add(await manager.resolve(resource2));
		assert.strictEqual(resolvedCounter, 2);
		assert.strictEqual(createdCounter, 2);

		workingCopy1.model?.updateContents('changed');

		await workingCopy1.revert();
		workingCopy1.model?.updateContents('changed again');

		await workingCopy1.save();

		try {
			accessor.fileService.writeShouldThrowError = new FileOperationError('write error', FileOperationResult.FILE_PERMISSION_DENIED);

			await workingCopy1.save({ force: true });
		} finally {
			accessor.fileService.writeShouldThrowError = undefined;
		}

		workingCopy1.dispose();
		workingCopy2.dispose();

		await workingCopy1.revert();
		assert.strictEqual(removedCounter, 2);
		assert.strictEqual(gotDirtyCounter, 3);
		assert.strictEqual(gotNonDirtyCounter, 2);
		assert.strictEqual(revertedCounter, 1);
		assert.strictEqual(savedCounter, 1);
		assert.strictEqual(lastSaveEvent!.workingCopy, workingCopy1);
		assert.ok(lastSaveEvent!.stat);
		assert.strictEqual(saveErrorCounter, 1);
		assert.strictEqual(createdCounter, 2);

		workingCopy1.dispose();
		workingCopy2.dispose();
	});

	test('resolve registers as working copy and dispose clears', async () => {
		const resource1 = URI.file('/test1.html');
		const resource2 = URI.file('/test2.html');
		const resource3 = URI.file('/test3.html');

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);

		const firstPromise = manager.resolve(resource1);
		const secondPromise = manager.resolve(resource2);
		const thirdPromise = manager.resolve(resource3);

		await Promise.all([firstPromise, secondPromise, thirdPromise]);

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 3);
		assert.strictEqual(manager.workingCopies.length, 3);

		manager.dispose();

		assert.strictEqual(manager.workingCopies.length, 0);

		// dispose does not remove from working copy service, only `destroy` should
		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 3);

		disposables.add(await firstPromise);
		disposables.add(await secondPromise);
		disposables.add(await thirdPromise);
	});

	test('destroy', async () => {
		const resource1 = URI.file('/test1.html');
		const resource2 = URI.file('/test2.html');
		const resource3 = URI.file('/test3.html');

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);

		const firstPromise = manager.resolve(resource1);
		const secondPromise = manager.resolve(resource2);
		const thirdPromise = manager.resolve(resource3);

		await Promise.all([firstPromise, secondPromise, thirdPromise]);

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 3);
		assert.strictEqual(manager.workingCopies.length, 3);

		await manager.destroy();

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
		assert.strictEqual(manager.workingCopies.length, 0);
	});

	test('destroy saves dirty working copies', async () => {
		const resource = URI.file('/path/source.txt');

		const workingCopy = await manager.resolve(resource);

		let saved = false;
		disposables.add(workingCopy.onDidSave(() => {
			saved = true;
		}));

		workingCopy.model?.updateContents('hello create');
		assert.strictEqual(workingCopy.isDirty(), true);

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 1);
		assert.strictEqual(manager.workingCopies.length, 1);

		await manager.destroy();

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
		assert.strictEqual(manager.workingCopies.length, 0);

		assert.strictEqual(saved, true);
	});

	test('destroy falls back to using backup when save fails', async () => {
		const resource = URI.file('/path/source.txt');

		const workingCopy = await manager.resolve(resource);
		workingCopy.model?.setThrowOnSnapshot();

		let unexpectedSave = false;
		disposables.add(workingCopy.onDidSave(() => {
			unexpectedSave = true;
		}));

		workingCopy.model?.updateContents('hello create');
		assert.strictEqual(workingCopy.isDirty(), true);

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 1);
		assert.strictEqual(manager.workingCopies.length, 1);

		assert.strictEqual(accessor.workingCopyBackupService.resolved.has(workingCopy), true);

		await manager.destroy();

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
		assert.strictEqual(manager.workingCopies.length, 0);

		assert.strictEqual(unexpectedSave, false);
	});

	test('file change event triggers working copy resolve', async () => {
		const resource = URI.file('/path/index.txt');

		await manager.resolve(resource);

		let didResolve = false;
		const onDidResolve = new Promise<void>(resolve => {
			disposables.add(manager.onDidResolve(({ model }) => {
				if (model?.resource.toString() === resource.toString()) {
					didResolve = true;
					resolve();
				}
			}));
		});

		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }], false));

		await onDidResolve;

		assert.strictEqual(didResolve, true);
	});

	test('file change event triggers working copy resolve (when working copy is pending to resolve)', async () => {
		const resource = URI.file('/path/index.txt');

		manager.resolve(resource);

		let didResolve = false;
		let resolvedCounter = 0;
		const onDidResolve = new Promise<void>(resolve => {
			disposables.add(manager.onDidResolve(({ model }) => {
				if (model?.resource.toString() === resource.toString()) {
					resolvedCounter++;
					if (resolvedCounter === 2) {
						didResolve = true;
						resolve();
					}
				}
			}));
		});

		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }], false));

		await onDidResolve;

		assert.strictEqual(didResolve, true);
	});

	test('file system provider change triggers working copy resolve', async () => {
		const resource = URI.file('/path/index.txt');

		disposables.add(await manager.resolve(resource));

		let didResolve = false;
		const onDidResolve = new Promise<void>(resolve => {
			disposables.add(manager.onDidResolve(({ model }) => {
				if (model?.resource.toString() === resource.toString()) {
					didResolve = true;
					resolve();
				}
			}));
		});

		accessor.fileService.fireFileSystemProviderCapabilitiesChangeEvent({ provider: disposables.add(new InMemoryFileSystemProvider()), scheme: resource.scheme });

		await onDidResolve;

		assert.strictEqual(didResolve, true);
	});

	test('working copy file event handling: create', async () => {
		const resource = URI.file('/path/source.txt');

		const workingCopy = await manager.resolve(resource);
		workingCopy.model?.updateContents('hello create');
		assert.strictEqual(workingCopy.isDirty(), true);

		await accessor.workingCopyFileService.create([{ resource }], CancellationToken.None);
		assert.strictEqual(workingCopy.isDirty(), false);
	});

	test('working copy file event handling: move', () => {
		return testMoveCopyFileWorkingCopy(true);
	});

	test('working copy file event handling: copy', () => {
		return testMoveCopyFileWorkingCopy(false);
	});

	async function testMoveCopyFileWorkingCopy(move: boolean) {
		const source = URI.file('/path/source.txt');
		const target = URI.file('/path/other.txt');

		const sourceWorkingCopy = await manager.resolve(source);
		sourceWorkingCopy.model?.updateContents('hello move or copy');
		assert.strictEqual(sourceWorkingCopy.isDirty(), true);

		if (move) {
			await accessor.workingCopyFileService.move([{ file: { source, target } }], CancellationToken.None);
		} else {
			await accessor.workingCopyFileService.copy([{ file: { source, target } }], CancellationToken.None);
		}

		const targetWorkingCopy = await manager.resolve(target);
		assert.strictEqual(targetWorkingCopy.isDirty(), true);
		assert.strictEqual(targetWorkingCopy.model?.contents, 'hello move or copy');
	}

	test('working copy file event handling: delete', async () => {
		const resource = URI.file('/path/source.txt');

		const workingCopy = await manager.resolve(resource);
		workingCopy.model?.updateContents('hello delete');
		assert.strictEqual(workingCopy.isDirty(), true);

		await accessor.workingCopyFileService.delete([{ resource }], CancellationToken.None);
		assert.strictEqual(workingCopy.isDirty(), false);
	});

	test('working copy file event handling: move to same resource', async () => {
		const source = URI.file('/path/source.txt');

		const sourceWorkingCopy = await manager.resolve(source);
		sourceWorkingCopy.model?.updateContents('hello move');
		assert.strictEqual(sourceWorkingCopy.isDirty(), true);

		await accessor.workingCopyFileService.move([{ file: { source, target: source } }], CancellationToken.None);

		assert.strictEqual(sourceWorkingCopy.isDirty(), true);
		assert.strictEqual(sourceWorkingCopy.model?.contents, 'hello move');
	});

	test('canDispose with dirty working copy', async () => {
		const resource = URI.file('/path/index_something.txt');

		const workingCopy = await manager.resolve(resource);
		workingCopy.model?.updateContents('make dirty');

		const canDisposePromise = manager.canDispose(workingCopy);
		assert.ok(canDisposePromise instanceof Promise);

		let canDispose = false;
		(async () => {
			canDispose = await canDisposePromise;
		})();

		assert.strictEqual(canDispose, false);
		workingCopy.revert({ soft: true });

		await timeout(0);

		assert.strictEqual(canDispose, true);

		const canDispose2 = manager.canDispose(workingCopy);
		assert.strictEqual(canDispose2, true);
	});

	(isWeb ? test.skip : test)('pending saves join on shutdown', async () => {
		const resource1 = URI.file('/path/index_something1.txt');
		const resource2 = URI.file('/path/index_something2.txt');

		const workingCopy1 = disposables.add(await manager.resolve(resource1));
		workingCopy1.model?.updateContents('make dirty');

		const workingCopy2 = disposables.add(await manager.resolve(resource2));
		workingCopy2.model?.updateContents('make dirty');

		let saved1 = false;
		workingCopy1.save().then(() => {
			saved1 = true;
		});

		let saved2 = false;
		workingCopy2.save().then(() => {
			saved2 = true;
		});

		const event = new TestWillShutdownEvent();
		accessor.lifecycleService.fireWillShutdown(event);

		assert.ok(event.value.length > 0);
		await Promise.all(event.value);

		assert.strictEqual(saved1, true);
		assert.strictEqual(saved2, true);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
