/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { IEditorService } from '../../../editor/common/editorService.js';
import { EditorPart } from '../../../../browser/parts/editor/editorPart.js';
import { IEditorGroupsService } from '../../../editor/common/editorGroupsService.js';
import { EditorService } from '../../../editor/browser/editorService.js';
import { IUntitledTextResourceEditorInput } from '../../../../common/editor.js';
import { IWorkingCopyBackupService } from '../../common/workingCopyBackup.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { IFilesConfigurationService } from '../../../filesConfiguration/common/filesConfigurationService.js';
import { IWorkingCopyService } from '../../common/workingCopyService.js';
import { IWorkingCopyBackup } from '../../common/workingCopy.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ILifecycleService, LifecyclePhase } from '../../../lifecycle/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { UntitledTextEditorInput } from '../../../untitled/common/untitledTextEditorInput.js';
import { createEditorPart, InMemoryTestWorkingCopyBackupService, registerTestResourceEditor, TestServiceAccessor, toTypedWorkingCopyId, toUntypedWorkingCopyId, workbenchInstantiationService, workbenchTeardown } from '../../../../test/browser/workbenchTestServices.js';
import { TestWorkingCopy } from '../../../../test/common/workbenchTestServices.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { timeout } from '../../../../../base/common/async.js';
import { BrowserWorkingCopyBackupTracker } from '../../browser/workingCopyBackupTracker.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IWorkingCopyEditorHandler, IWorkingCopyEditorService } from '../../common/workingCopyEditorService.js';
import { bufferToReadable, VSBuffer } from '../../../../../base/common/buffer.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { Schemas } from '../../../../../base/common/network.js';

suite('WorkingCopyBackupTracker (browser)', function () {
	let accessor: TestServiceAccessor;
	const disposables = new DisposableStore();

	setup(() => {
		disposables.add(registerTestResourceEditor());
	});

	teardown(async () => {
		await workbenchTeardown(accessor.instantiationService);

		disposables.clear();
	});

	class TestWorkingCopyBackupTracker extends BrowserWorkingCopyBackupTracker {

		constructor(
			@IWorkingCopyBackupService workingCopyBackupService: IWorkingCopyBackupService,
			@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
			@IWorkingCopyService workingCopyService: IWorkingCopyService,
			@ILifecycleService lifecycleService: ILifecycleService,
			@ILogService logService: ILogService,
			@IWorkingCopyEditorService workingCopyEditorService: IWorkingCopyEditorService,
			@IEditorService editorService: IEditorService,
			@IEditorGroupsService editorGroupService: IEditorGroupsService
		) {
			super(workingCopyBackupService, filesConfigurationService, workingCopyService, lifecycleService, logService, workingCopyEditorService, editorService, editorGroupService);
		}

		protected override getBackupScheduleDelay(): number {
			return 10; // Reduce timeout for tests
		}

		get pendingBackupOperationCount(): number { return this.pendingBackupOperations.size; }

		getUnrestoredBackups() {
			return this.unrestoredBackups;
		}

		async testRestoreBackups(handler: IWorkingCopyEditorHandler): Promise<void> {
			return super.restoreBackups(handler);
		}
	}

	class TestUntitledTextEditorInput extends UntitledTextEditorInput {

		resolved = false;

		override resolve() {
			this.resolved = true;

			return super.resolve();
		}
	}

	async function createTracker(): Promise<{ accessor: TestServiceAccessor; part: EditorPart; tracker: TestWorkingCopyBackupTracker; workingCopyBackupService: InMemoryTestWorkingCopyBackupService; instantiationService: IInstantiationService }> {
		const workingCopyBackupService = disposables.add(new InMemoryTestWorkingCopyBackupService());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IWorkingCopyBackupService, workingCopyBackupService);

		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		disposables.add(registerTestResourceEditor());

		const editorService: EditorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		accessor = instantiationService.createInstance(TestServiceAccessor);

		const tracker = disposables.add(instantiationService.createInstance(TestWorkingCopyBackupTracker));

		return { accessor, part, tracker, workingCopyBackupService: workingCopyBackupService, instantiationService };
	}

	async function untitledBackupTest(untitled: IUntitledTextResourceEditorInput = { resource: undefined }): Promise<void> {
		const { accessor, workingCopyBackupService } = await createTracker();

		const untitledTextEditor = disposables.add((await accessor.editorService.openEditor(untitled))?.input as UntitledTextEditorInput);
		const untitledTextModel = disposables.add(await untitledTextEditor.resolve());

		if (!untitled?.contents) {
			untitledTextModel.textEditorModel?.setValue('Super Good');
		}

		await workingCopyBackupService.joinBackupResource();

		assert.strictEqual(workingCopyBackupService.hasBackupSync(untitledTextModel), true);

		untitledTextModel.dispose();

		await workingCopyBackupService.joinDiscardBackup();

		assert.strictEqual(workingCopyBackupService.hasBackupSync(untitledTextModel), false);
	}

	test('Track backups (untitled)', function () {
		return untitledBackupTest();
	});

	test('Track backups (untitled with initial contents)', function () {
		return untitledBackupTest({ resource: undefined, contents: 'Foo Bar' });
	});

	test('Track backups (custom)', async function () {
		const { accessor, tracker, workingCopyBackupService } = await createTracker();

		class TestBackupWorkingCopy extends TestWorkingCopy {

			constructor(resource: URI) {
				super(resource);

				disposables.add(accessor.workingCopyService.registerWorkingCopy(this));
			}

			readonly backupDelay = 10;

			override async backup(token: CancellationToken): Promise<IWorkingCopyBackup> {
				await timeout(0);

				return {};
			}
		}

		const resource: URI = toResource.call(this, '/path/custom.txt');
		const customWorkingCopy = disposables.add(new TestBackupWorkingCopy(resource));

		// Normal
		customWorkingCopy.setDirty(true);
		assert.strictEqual(tracker.pendingBackupOperationCount, 1);
		await workingCopyBackupService.joinBackupResource();
		assert.strictEqual(workingCopyBackupService.hasBackupSync(customWorkingCopy), true);

		customWorkingCopy.setDirty(false);
		customWorkingCopy.setDirty(true);
		assert.strictEqual(tracker.pendingBackupOperationCount, 1);
		await workingCopyBackupService.joinBackupResource();
		assert.strictEqual(workingCopyBackupService.hasBackupSync(customWorkingCopy), true);

		customWorkingCopy.setDirty(false);
		assert.strictEqual(tracker.pendingBackupOperationCount, 1);
		await workingCopyBackupService.joinDiscardBackup();
		assert.strictEqual(workingCopyBackupService.hasBackupSync(customWorkingCopy), false);

		// Cancellation
		customWorkingCopy.setDirty(true);
		await timeout(0);
		customWorkingCopy.setDirty(false);
		assert.strictEqual(tracker.pendingBackupOperationCount, 1);
		await workingCopyBackupService.joinDiscardBackup();
		assert.strictEqual(workingCopyBackupService.hasBackupSync(customWorkingCopy), false);
	});

	async function restoreBackupsInit(): Promise<[TestWorkingCopyBackupTracker, TestServiceAccessor]> {
		const fooFile = URI.file(isWindows ? 'c:\\Foo' : '/Foo');
		const barFile = URI.file(isWindows ? 'c:\\Bar' : '/Bar');
		const untitledFile1 = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });
		const untitledFile2 = URI.from({ scheme: Schemas.untitled, path: 'Untitled-2' });

		const workingCopyBackupService = disposables.add(new InMemoryTestWorkingCopyBackupService());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IWorkingCopyBackupService, workingCopyBackupService);

		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		const editorService: EditorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		accessor = instantiationService.createInstance(TestServiceAccessor);

		// Backup 2 normal files and 2 untitled files
		const untitledFile1WorkingCopyId = toUntypedWorkingCopyId(untitledFile1);
		const untitledFile2WorkingCopyId = toTypedWorkingCopyId(untitledFile2);
		await workingCopyBackupService.backup(untitledFile1WorkingCopyId, bufferToReadable(VSBuffer.fromString('untitled-1')));
		await workingCopyBackupService.backup(untitledFile2WorkingCopyId, bufferToReadable(VSBuffer.fromString('untitled-2')));

		const fooFileWorkingCopyId = toUntypedWorkingCopyId(fooFile);
		const barFileWorkingCopyId = toTypedWorkingCopyId(barFile);
		await workingCopyBackupService.backup(fooFileWorkingCopyId, bufferToReadable(VSBuffer.fromString('fooFile')));
		await workingCopyBackupService.backup(barFileWorkingCopyId, bufferToReadable(VSBuffer.fromString('barFile')));

		const tracker = disposables.add(instantiationService.createInstance(TestWorkingCopyBackupTracker));

		accessor.lifecycleService.phase = LifecyclePhase.Restored;

		return [tracker, accessor];
	}

	test('Restore backups (basics, some handled)', async function () {
		const [tracker, accessor] = await restoreBackupsInit();

		assert.strictEqual(tracker.getUnrestoredBackups().size, 0);

		let handlesCounter = 0;
		let isOpenCounter = 0;
		let createEditorCounter = 0;

		await tracker.testRestoreBackups({
			handles: workingCopy => {
				handlesCounter++;

				return workingCopy.typeId === 'testBackupTypeId';
			},
			isOpen: (workingCopy, editor) => {
				isOpenCounter++;

				return false;
			},
			createEditor: workingCopy => {
				createEditorCounter++;

				return disposables.add(accessor.instantiationService.createInstance(TestUntitledTextEditorInput, accessor.untitledTextEditorService.create({ initialValue: 'foo' })));
			}
		});

		assert.strictEqual(handlesCounter, 4);
		assert.strictEqual(isOpenCounter, 0);
		assert.strictEqual(createEditorCounter, 2);

		assert.strictEqual(accessor.editorService.count, 2);
		assert.ok(accessor.editorService.editors.every(editor => editor.isDirty()));
		assert.strictEqual(tracker.getUnrestoredBackups().size, 2);

		for (const editor of accessor.editorService.editors) {
			assert.ok(editor instanceof TestUntitledTextEditorInput);
			assert.strictEqual(editor.resolved, true);
		}
	});

	test('Restore backups (basics, none handled)', async function () {
		const [tracker, accessor] = await restoreBackupsInit();

		await tracker.testRestoreBackups({
			handles: workingCopy => false,
			isOpen: (workingCopy, editor) => { throw new Error('unexpected'); },
			createEditor: workingCopy => { throw new Error('unexpected'); }
		});

		assert.strictEqual(accessor.editorService.count, 0);
		assert.strictEqual(tracker.getUnrestoredBackups().size, 4);
	});

	test('Restore backups (basics, error case)', async function () {
		const [tracker] = await restoreBackupsInit();

		try {
			await tracker.testRestoreBackups({
				handles: workingCopy => true,
				isOpen: (workingCopy, editor) => { throw new Error('unexpected'); },
				createEditor: workingCopy => { throw new Error('unexpected'); }
			});
		} catch (error) {
			// ignore
		}

		assert.strictEqual(tracker.getUnrestoredBackups().size, 4);
	});

	test('Restore backups (multiple handlers)', async function () {
		const [tracker, accessor] = await restoreBackupsInit();

		const firstHandler = tracker.testRestoreBackups({
			handles: workingCopy => {
				return workingCopy.typeId === 'testBackupTypeId';
			},
			isOpen: (workingCopy, editor) => {
				return false;
			},
			createEditor: workingCopy => {
				return disposables.add(accessor.instantiationService.createInstance(TestUntitledTextEditorInput, accessor.untitledTextEditorService.create({ initialValue: 'foo' })));
			}
		});

		const secondHandler = tracker.testRestoreBackups({
			handles: workingCopy => {
				return workingCopy.typeId.length === 0;
			},
			isOpen: (workingCopy, editor) => {
				return false;
			},
			createEditor: workingCopy => {
				return disposables.add(accessor.instantiationService.createInstance(TestUntitledTextEditorInput, accessor.untitledTextEditorService.create({ initialValue: 'foo' })));
			}
		});

		await Promise.all([firstHandler, secondHandler]);

		assert.strictEqual(accessor.editorService.count, 4);
		assert.ok(accessor.editorService.editors.every(editor => editor.isDirty()));
		assert.strictEqual(tracker.getUnrestoredBackups().size, 0);

		for (const editor of accessor.editorService.editors) {
			assert.ok(editor instanceof TestUntitledTextEditorInput);
			assert.strictEqual(editor.resolved, true);
		}
	});

	test('Restore backups (editors already opened)', async function () {
		const [tracker, accessor] = await restoreBackupsInit();

		assert.strictEqual(tracker.getUnrestoredBackups().size, 0);

		let handlesCounter = 0;
		let isOpenCounter = 0;

		const editor1 = disposables.add(accessor.instantiationService.createInstance(TestUntitledTextEditorInput, accessor.untitledTextEditorService.create({ initialValue: 'foo' })));
		const editor2 = disposables.add(accessor.instantiationService.createInstance(TestUntitledTextEditorInput, accessor.untitledTextEditorService.create({ initialValue: 'foo' })));

		await accessor.editorService.openEditors([{ editor: editor1 }, { editor: editor2 }]);

		editor1.resolved = false;
		editor2.resolved = false;

		await tracker.testRestoreBackups({
			handles: workingCopy => {
				handlesCounter++;

				return workingCopy.typeId === 'testBackupTypeId';
			},
			isOpen: (workingCopy, editor) => {
				isOpenCounter++;

				return true;
			},
			createEditor: workingCopy => { throw new Error('unexpected'); }
		});

		assert.strictEqual(handlesCounter, 4);
		assert.strictEqual(isOpenCounter, 4);

		assert.strictEqual(accessor.editorService.count, 2);
		assert.strictEqual(tracker.getUnrestoredBackups().size, 2);

		for (const editor of accessor.editorService.editors) {
			assert.ok(editor instanceof TestUntitledTextEditorInput);

			// assert that we only call `resolve` on inactive editors
			if (accessor.editorService.isVisible(editor)) {
				assert.strictEqual(editor.resolved, false);
			} else {
				assert.strictEqual(editor.resolved, true);
			}
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
