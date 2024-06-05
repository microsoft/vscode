/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from 'vs/base/common/buffer';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { FileWorkingCopyManager, IFileWorkingCopyManager } from 'vs/workbench/services/workingCopy/common/fileWorkingCopyManager';
import { NO_TYPE_ID, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { TestStoredFileWorkingCopyModel, TestStoredFileWorkingCopyModelFactory } from 'vs/workbench/services/workingCopy/test/browser/storedFileWorkingCopy.test';
import { TestUntitledFileWorkingCopyModel, TestUntitledFileWorkingCopyModelFactory } from 'vs/workbench/services/workingCopy/test/browser/untitledFileWorkingCopy.test';
import { TestInMemoryFileSystemProvider, TestServiceAccessor, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

suite('UntitledFileWorkingCopyManager', () => {

	const disposables = new DisposableStore();
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	let manager: IFileWorkingCopyManager<TestStoredFileWorkingCopyModel, TestUntitledFileWorkingCopyModel>;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);

		disposables.add(accessor.fileService.registerProvider(Schemas.file, disposables.add(new TestInMemoryFileSystemProvider())));
		disposables.add(accessor.fileService.registerProvider(Schemas.vscodeRemote, disposables.add(new TestInMemoryFileSystemProvider())));

		manager = disposables.add(new FileWorkingCopyManager(
			'testUntitledFileWorkingCopyType',
			new TestStoredFileWorkingCopyModelFactory(),
			new TestUntitledFileWorkingCopyModelFactory(),
			accessor.fileService, accessor.lifecycleService, accessor.labelService, accessor.logService,
			accessor.workingCopyFileService, accessor.workingCopyBackupService, accessor.uriIdentityService, accessor.fileDialogService,
			accessor.filesConfigurationService, accessor.workingCopyService, accessor.notificationService,
			accessor.workingCopyEditorService, accessor.editorService, accessor.elevatedFileService, accessor.pathService,
			accessor.environmentService, accessor.dialogService, accessor.decorationsService, accessor.progressService
		));
	});

	teardown(() => {
		for (const workingCopy of [...manager.untitled.workingCopies, ...manager.stored.workingCopies]) {
			workingCopy.dispose();
		}

		disposables.clear();
	});

	test('basics', async () => {
		let createCounter = 0;
		disposables.add(manager.untitled.onDidCreate(e => {
			createCounter++;
		}));

		let disposeCounter = 0;
		disposables.add(manager.untitled.onWillDispose(e => {
			disposeCounter++;
		}));

		let dirtyCounter = 0;
		disposables.add(manager.untitled.onDidChangeDirty(e => {
			dirtyCounter++;
		}));

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
		assert.strictEqual(manager.untitled.workingCopies.length, 0);

		assert.strictEqual(manager.untitled.get(URI.file('/some/invalidPath')), undefined);
		assert.strictEqual(manager.untitled.get(URI.file('/some/invalidPath').with({ scheme: Schemas.untitled })), undefined);

		const workingCopy1 = await manager.untitled.resolve();
		const workingCopy2 = await manager.untitled.resolve();

		assert.strictEqual(workingCopy1.typeId, 'testUntitledFileWorkingCopyType');
		assert.strictEqual(workingCopy1.resource.scheme, Schemas.untitled);

		assert.strictEqual(createCounter, 2);

		assert.strictEqual(manager.untitled.get(workingCopy1.resource), workingCopy1);
		assert.strictEqual(manager.untitled.get(workingCopy2.resource), workingCopy2);

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 2);
		assert.strictEqual(manager.untitled.workingCopies.length, 2);

		assert.notStrictEqual(workingCopy1.resource.toString(), workingCopy2.resource.toString());

		for (const workingCopy of [workingCopy1, workingCopy2]) {
			assert.strictEqual(workingCopy.capabilities, WorkingCopyCapabilities.Untitled);
			assert.strictEqual(workingCopy.isDirty(), false);
			assert.strictEqual(workingCopy.isModified(), false);
			assert.ok(workingCopy.model);
		}

		workingCopy1.model?.updateContents('Hello World');

		assert.strictEqual(workingCopy1.isDirty(), true);
		assert.strictEqual(workingCopy1.isModified(), true);
		assert.strictEqual(dirtyCounter, 1);

		workingCopy1.model?.updateContents(''); // change to empty clears dirty/modified flags
		assert.strictEqual(workingCopy1.isDirty(), false);
		assert.strictEqual(workingCopy1.isModified(), false);
		assert.strictEqual(dirtyCounter, 2);

		workingCopy2.model?.fireContentChangeEvent({ isInitial: false });
		assert.strictEqual(workingCopy2.isDirty(), true);
		assert.strictEqual(workingCopy2.isModified(), true);
		assert.strictEqual(dirtyCounter, 3);

		workingCopy1.dispose();

		assert.strictEqual(manager.untitled.workingCopies.length, 1);
		assert.strictEqual(manager.untitled.get(workingCopy1.resource), undefined);

		workingCopy2.dispose();

		assert.strictEqual(manager.untitled.workingCopies.length, 0);
		assert.strictEqual(manager.untitled.get(workingCopy2.resource), undefined);

		assert.strictEqual(disposeCounter, 2);
	});

	test('dirty - scratchpads are never dirty', async () => {
		let dirtyCounter = 0;
		disposables.add(manager.untitled.onDidChangeDirty(e => {
			dirtyCounter++;
		}));

		const workingCopy1 = await manager.resolve({
			untitledResource: URI.from({ scheme: Schemas.untitled, path: `/myscratchpad` }),
			isScratchpad: true
		});

		assert.strictEqual(workingCopy1.resource.scheme, Schemas.untitled);
		assert.strictEqual(manager.untitled.workingCopies.length, 1);

		workingCopy1.model?.updateContents('contents');
		assert.strictEqual(workingCopy1.isDirty(), false);
		assert.strictEqual(workingCopy1.isModified(), true);

		workingCopy1.model?.fireContentChangeEvent({ isInitial: true });
		assert.strictEqual(workingCopy1.isDirty(), false);
		assert.strictEqual(workingCopy1.isModified(), false);

		assert.strictEqual(dirtyCounter, 0);

		workingCopy1.dispose();
	});

	test('resolve - with initial value', async () => {
		let dirtyCounter = 0;
		disposables.add(manager.untitled.onDidChangeDirty(e => {
			dirtyCounter++;
		}));

		const workingCopy1 = await manager.untitled.resolve({ contents: { value: bufferToStream(VSBuffer.fromString('Hello World')) } });

		assert.strictEqual(workingCopy1.isModified(), true);
		assert.strictEqual(workingCopy1.isDirty(), true);
		assert.strictEqual(dirtyCounter, 1);
		assert.strictEqual(workingCopy1.model?.contents, 'Hello World');

		workingCopy1.dispose();

		const workingCopy2 = await manager.untitled.resolve({ contents: { value: bufferToStream(VSBuffer.fromString('Hello World')), markModified: true } });

		assert.strictEqual(workingCopy2.isModified(), true);
		assert.strictEqual(workingCopy2.isDirty(), true);
		assert.strictEqual(dirtyCounter, 2);
		assert.strictEqual(workingCopy2.model?.contents, 'Hello World');

		workingCopy2.dispose();
	});

	test('resolve - with initial value but markDirty: false', async () => {
		let dirtyCounter = 0;
		disposables.add(manager.untitled.onDidChangeDirty(e => {
			dirtyCounter++;
		}));

		const workingCopy = await manager.untitled.resolve({ contents: { value: bufferToStream(VSBuffer.fromString('Hello World')), markModified: false } });

		assert.strictEqual(workingCopy.isModified(), false);
		assert.strictEqual(workingCopy.isDirty(), false);
		assert.strictEqual(dirtyCounter, 0);
		assert.strictEqual(workingCopy.model?.contents, 'Hello World');

		workingCopy.dispose();
	});

	test('resolve begins counter from 1 for disposed untitled', async () => {
		const untitled1 = await manager.untitled.resolve();
		untitled1.dispose();

		const untitled1Again = disposables.add(await manager.untitled.resolve());
		assert.strictEqual(untitled1.resource.toString(), untitled1Again.resource.toString());
	});

	test('resolve - existing', async () => {
		let createCounter = 0;
		disposables.add(manager.untitled.onDidCreate(e => {
			createCounter++;
		}));

		const workingCopy1 = await manager.untitled.resolve();
		assert.strictEqual(createCounter, 1);

		const workingCopy2 = await manager.untitled.resolve({ untitledResource: workingCopy1.resource });
		assert.strictEqual(workingCopy1, workingCopy2);
		assert.strictEqual(createCounter, 1);

		const workingCopy3 = await manager.untitled.resolve({ untitledResource: URI.file('/invalid/untitled') });
		assert.strictEqual(workingCopy3.resource.scheme, Schemas.untitled);

		workingCopy1.dispose();
		workingCopy2.dispose();
		workingCopy3.dispose();
	});

	test('resolve - untitled resource used for new working copy', async () => {
		const invalidUntitledResource = URI.file('my/untitled.txt');
		const validUntitledResource = invalidUntitledResource.with({ scheme: Schemas.untitled });

		const workingCopy1 = await manager.untitled.resolve({ untitledResource: invalidUntitledResource });
		assert.notStrictEqual(workingCopy1.resource.toString(), invalidUntitledResource.toString());

		const workingCopy2 = await manager.untitled.resolve({ untitledResource: validUntitledResource });
		assert.strictEqual(workingCopy2.resource.toString(), validUntitledResource.toString());

		workingCopy1.dispose();
		workingCopy2.dispose();
	});

	test('resolve - with associated resource', async () => {
		const workingCopy = await manager.untitled.resolve({ associatedResource: { path: '/some/associated.txt' } });

		assert.strictEqual(workingCopy.hasAssociatedFilePath, true);
		assert.strictEqual(workingCopy.resource.path, '/some/associated.txt');

		workingCopy.dispose();
	});

	test('save - without associated resource', async () => {
		const workingCopy = await manager.untitled.resolve();
		workingCopy.model?.updateContents('Simple Save');

		accessor.fileDialogService.setPickFileToSave(URI.file('simple/file.txt'));

		const result = await workingCopy.save();
		assert.ok(result);

		assert.strictEqual(manager.untitled.get(workingCopy.resource), undefined);

		workingCopy.dispose();
	});

	test('save - with associated resource', async () => {
		const workingCopy = await manager.untitled.resolve({ associatedResource: { path: '/some/associated.txt' } });
		workingCopy.model?.updateContents('Simple Save with associated resource');

		accessor.fileService.notExistsSet.set(URI.from({ scheme: Schemas.file, path: '/some/associated.txt' }), true);

		const result = await workingCopy.save();
		assert.ok(result);

		assert.strictEqual(manager.untitled.get(workingCopy.resource), undefined);

		workingCopy.dispose();
	});

	test('save - with associated resource (asks to overwrite)', async () => {
		const workingCopy = await manager.untitled.resolve({ associatedResource: { path: '/some/associated.txt' } });
		workingCopy.model?.updateContents('Simple Save with associated resource');

		let result = await workingCopy.save();
		assert.ok(!result); // not confirmed

		assert.strictEqual(manager.untitled.get(workingCopy.resource), workingCopy);

		accessor.dialogService.setConfirmResult({ confirmed: true });

		result = await workingCopy.save();
		assert.ok(result); // confirmed

		assert.strictEqual(manager.untitled.get(workingCopy.resource), undefined);

		workingCopy.dispose();
	});

	test('destroy', async () => {
		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);

		await manager.untitled.resolve();
		await manager.untitled.resolve();
		await manager.untitled.resolve();

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 3);
		assert.strictEqual(manager.untitled.workingCopies.length, 3);

		await manager.untitled.destroy();

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
		assert.strictEqual(manager.untitled.workingCopies.length, 0);
	});

	test('manager with different types produce different URIs', async () => {
		try {
			manager = disposables.add(new FileWorkingCopyManager(
				'someOtherUntitledTypeId',
				new TestStoredFileWorkingCopyModelFactory(),
				new TestUntitledFileWorkingCopyModelFactory(),
				accessor.fileService, accessor.lifecycleService, accessor.labelService, accessor.logService,
				accessor.workingCopyFileService, accessor.workingCopyBackupService, accessor.uriIdentityService, accessor.fileDialogService,
				accessor.filesConfigurationService, accessor.workingCopyService, accessor.notificationService,
				accessor.workingCopyEditorService, accessor.editorService, accessor.elevatedFileService, accessor.pathService,
				accessor.environmentService, accessor.dialogService, accessor.decorationsService, accessor.progressService
			));

			const untitled1OriginalType = disposables.add(await manager.untitled.resolve());
			const untitled1OtherType = disposables.add(await manager.untitled.resolve());

			assert.notStrictEqual(untitled1OriginalType.resource.toString(), untitled1OtherType.resource.toString());
		} finally {
			manager.destroy();
		}
	});

	test('manager without typeId produces backwards compatible URIs', async () => {
		try {
			manager = disposables.add(new FileWorkingCopyManager(
				NO_TYPE_ID,
				new TestStoredFileWorkingCopyModelFactory(),
				new TestUntitledFileWorkingCopyModelFactory(),
				accessor.fileService, accessor.lifecycleService, accessor.labelService, accessor.logService,
				accessor.workingCopyFileService, accessor.workingCopyBackupService, accessor.uriIdentityService, accessor.fileDialogService,
				accessor.filesConfigurationService, accessor.workingCopyService, accessor.notificationService,
				accessor.workingCopyEditorService, accessor.editorService, accessor.elevatedFileService, accessor.pathService,
				accessor.environmentService, accessor.dialogService, accessor.decorationsService, accessor.progressService
			));

			const result = disposables.add(await manager.untitled.resolve());
			assert.strictEqual(result.resource.scheme, Schemas.untitled);
			assert.ok(result.resource.path.length > 0);
			assert.strictEqual(result.resource.query, '');
			assert.strictEqual(result.resource.authority, '');
			assert.strictEqual(result.resource.fragment, '');
		} finally {
			manager.destroy();
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
