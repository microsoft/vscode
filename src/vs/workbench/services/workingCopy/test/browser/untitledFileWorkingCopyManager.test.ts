/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { bufferToStream, VSBuffer } from 'vs/base/common/buffer';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { FileWorkingCopyManager, IFileWorkingCopyManager } from 'vs/workbench/services/workingCopy/common/fileWorkingCopyManager';
import { IUntitledFileWorkingCopyManager, UntitledFileWorkingCopyManager } from 'vs/workbench/services/workingCopy/common/untitledFileWorkingCopyManager';
import { WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { TestFileWorkingCopyModel, TestFileWorkingCopyModelFactory } from 'vs/workbench/services/workingCopy/test/browser/fileWorkingCopy.test';
import { TestUntitledFileWorkingCopyModel, TestUntitledFileWorkingCopyModelFactory } from 'vs/workbench/services/workingCopy/test/browser/untitledFileWorkingCopy.test';
import { TestInMemoryFileSystemProvider, TestServiceAccessor, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

suite('UntitledFileWorkingCopyManager', () => {

	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	let manager: IUntitledFileWorkingCopyManager<TestUntitledFileWorkingCopyModel>;
	let fileManager: IFileWorkingCopyManager<TestFileWorkingCopyModel>;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(TestServiceAccessor);

		accessor.fileService.registerProvider(Schemas.file, new TestInMemoryFileSystemProvider());
		accessor.fileService.registerProvider(Schemas.vscodeRemote, new TestInMemoryFileSystemProvider());

		fileManager = new FileWorkingCopyManager<TestFileWorkingCopyModel>(
			'testFileWorkingCopyType',
			new TestFileWorkingCopyModelFactory(),
			accessor.fileService,
			accessor.lifecycleService,
			accessor.labelService,
			instantiationService,
			accessor.logService,
			accessor.fileDialogService,
			accessor.workingCopyFileService,
			accessor.workingCopyBackupService,
			accessor.uriIdentityService,
			accessor.dialogService,
			accessor.workingCopyService,
			accessor.environmentService,
			accessor.pathService
		);

		manager = new UntitledFileWorkingCopyManager<TestUntitledFileWorkingCopyModel>(
			'testUntitledWorkingCopyType',
			new TestUntitledFileWorkingCopyModelFactory(),
			resource => fileManager.resolve(resource),
			accessor.fileService,
			accessor.labelService,
			instantiationService,
			accessor.logService,
			accessor.fileDialogService,
			accessor.workingCopyFileService,
			accessor.workingCopyBackupService,
			accessor.uriIdentityService,
			accessor.dialogService,
			accessor.workingCopyService,
			accessor.environmentService,
			accessor.pathService
		);
	});

	teardown(() => {
		manager.dispose();
	});

	test('basics', async () => {
		let disposeCounter = 0;
		manager.onWillDispose(e => {
			disposeCounter++;
		});

		let dirtyCounter = 0;
		manager.onDidChangeDirty(e => {
			dirtyCounter++;
		});

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
		assert.strictEqual(manager.workingCopies.length, 0);

		assert.strictEqual(manager.get(URI.file('/some/invalidPath')), undefined);
		assert.strictEqual(manager.get(URI.file('/some/invalidPath').with({ scheme: Schemas.untitled })), undefined);

		const workingCopy1 = await manager.resolve();
		const workingCopy2 = await manager.resolve();

		assert.strictEqual(manager.get(workingCopy1.resource), workingCopy1);
		assert.strictEqual(manager.get(workingCopy2.resource), workingCopy2);

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 2);
		assert.strictEqual(manager.workingCopies.length, 2);

		assert.notStrictEqual(workingCopy1.resource.toString(), workingCopy2.resource.toString());

		for (const workingCopy of [workingCopy1, workingCopy2]) {
			assert.strictEqual(workingCopy.capabilities, WorkingCopyCapabilities.Untitled);
			assert.strictEqual(workingCopy.isDirty(), false);
			assert.ok(workingCopy.model);
		}

		workingCopy1.model?.updateContents('Hello World');

		assert.strictEqual(workingCopy1.isDirty(), true);
		assert.strictEqual(dirtyCounter, 1);

		workingCopy1.model?.updateContents(''); // change to empty clears dirty flag
		assert.strictEqual(workingCopy1.isDirty(), false);
		assert.strictEqual(dirtyCounter, 2);

		workingCopy2.model?.fireContentChangeEvent({ isEmpty: false });
		assert.strictEqual(workingCopy2.isDirty(), true);
		assert.strictEqual(dirtyCounter, 3);

		workingCopy1.dispose();

		assert.strictEqual(manager.workingCopies.length, 1);
		assert.strictEqual(manager.get(workingCopy1.resource), undefined);

		workingCopy2.dispose();

		assert.strictEqual(manager.workingCopies.length, 0);
		assert.strictEqual(manager.get(workingCopy2.resource), undefined);

		assert.strictEqual(disposeCounter, 2);
	});

	test('resolve - with initial value', async () => {
		let dirtyCounter = 0;
		manager.onDidChangeDirty(e => {
			dirtyCounter++;
		});

		const workingCopy = await manager.resolve({ initialValue: bufferToStream(VSBuffer.fromString('Hello World')) });

		assert.strictEqual(workingCopy.isDirty(), true);
		assert.strictEqual(dirtyCounter, 1);
		assert.strictEqual(workingCopy.model?.contents, 'Hello World');

		workingCopy.dispose();
	});

	test('resolve - existing', async () => {
		const workingCopy1 = await manager.resolve();

		const workingCopy2 = await manager.resolve({ untitledResource: workingCopy1.resource });
		assert.strictEqual(workingCopy1, workingCopy2);

		const workingCopy3 = await manager.resolve({ untitledResource: URI.file('/invalid/untitled') });
		assert.strictEqual(workingCopy3.resource.scheme, Schemas.untitled);

		workingCopy1.dispose();
		workingCopy2.dispose();
		workingCopy3.dispose();
	});

	test('resolve - with associated resource', async () => {
		const workingCopy = await manager.resolve({ associatedResource: { path: '/some/associated.txt' } });

		assert.strictEqual(workingCopy.hasAssociatedFilePath, true);
		assert.strictEqual(workingCopy.resource.path, '/some/associated.txt');

		workingCopy.dispose();
	});

	test('save - without associated resource', async () => {
		const workingCopy = await manager.resolve();
		workingCopy.model?.updateContents('Simple Save');

		accessor.fileDialogService.setPickFileToSave(URI.file('simple/file.txt'));

		const result = await workingCopy.save();
		assert.ok(result);

		assert.strictEqual(manager.get(workingCopy.resource), undefined);

		workingCopy.dispose();
	});

	test('save - with associated resource', async () => {
		const workingCopy = await manager.resolve({ associatedResource: { path: '/some/associated.txt' } });
		workingCopy.model?.updateContents('Simple Save with associated resource');

		accessor.fileService.notExistsSet.set(URI.from({ scheme: Schemas.vscodeRemote, path: '/some/associated.txt' }), true);

		const result = await workingCopy.save();
		assert.ok(result);

		assert.strictEqual(manager.get(workingCopy.resource), undefined);

		workingCopy.dispose();
	});

	test('save - with associated resource (asks to overwrite)', async () => {
		const workingCopy = await manager.resolve({ associatedResource: { path: '/some/associated.txt' } });
		workingCopy.model?.updateContents('Simple Save with associated resource');

		let result = await workingCopy.save();
		assert.ok(!result); // not confirmed

		assert.strictEqual(manager.get(workingCopy.resource), workingCopy);

		accessor.dialogService.setConfirmResult({ confirmed: true });

		result = await workingCopy.save();
		assert.ok(result); // confirmed

		assert.strictEqual(manager.get(workingCopy.resource), undefined);

		workingCopy.dispose();
	});

	test('saveAs - without associated resource', async () => {
		const workingCopy = await manager.resolve();
		workingCopy.model?.updateContents('Simple Save As');

		const target = URI.file('simple/file.txt');
		accessor.fileDialogService.setPickFileToSave(target);

		const result = await manager.saveAs(workingCopy.resource, undefined);
		assert.strictEqual(result?.resource.toString(), target.toString());

		assert.strictEqual((result?.model as TestFileWorkingCopyModel).contents, 'Simple Save As');

		assert.strictEqual(manager.get(workingCopy.resource), undefined);

		workingCopy.dispose();
	});

	test('saveAs - with associated resource', async () => {
		const workingCopy = await manager.resolve({ associatedResource: { path: '/some/associated.txt' } });
		workingCopy.model?.updateContents('Simple Save As with associated resource');

		const target = URI.from({ scheme: Schemas.vscodeRemote, path: '/some/associated.txt' });

		accessor.fileService.notExistsSet.set(target, true);

		const result = await manager.saveAs(workingCopy.resource, undefined);
		assert.strictEqual(result?.resource.toString(), target.toString());

		assert.strictEqual((result?.model as TestFileWorkingCopyModel).contents, 'Simple Save As with associated resource');

		assert.strictEqual(manager.get(workingCopy.resource), undefined);

		workingCopy.dispose();
	});

	test('saveAs - target exists and is resolved', async () => {
		const workingCopy = await manager.resolve();
		workingCopy.model?.updateContents('Simple Save As');

		const target = URI.file('simple/file.txt');
		const targetFileWorkingCopy = await fileManager.resolve(target);
		accessor.fileDialogService.setPickFileToSave(target);

		const result = await manager.saveAs(workingCopy.resource, undefined);
		assert.strictEqual(result, targetFileWorkingCopy);

		assert.strictEqual((result?.model as TestFileWorkingCopyModel).contents, 'Simple Save As');

		assert.strictEqual(manager.get(workingCopy.resource), undefined);

		workingCopy.dispose();
	});

	test('destroy', async () => {
		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);

		await manager.resolve();
		await manager.resolve();
		await manager.resolve();

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 3);
		assert.strictEqual(manager.workingCopies.length, 3);

		await manager.destroy();

		assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
		assert.strictEqual(manager.workingCopies.length, 0);
	});
});
