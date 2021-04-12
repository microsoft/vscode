/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IUntitledTextResourceEditorInput } from 'vs/workbench/common/editor';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { toResource } from 'vs/base/test/common/utils';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IWorkingCopyBackup, IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ILogService } from 'vs/platform/log/common/log';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { BackupTracker } from 'vs/workbench/services/backup/common/backupTracker';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { UntitledTextEditorInput } from 'vs/workbench/services/untitled/common/untitledTextEditorInput';
import { createEditorPart, InMemoryTestBackupFileService, registerTestResourceEditor, TestServiceAccessor, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestWorkingCopy } from 'vs/workbench/test/common/workbenchTestServices';
import { CancellationToken } from 'vs/base/common/cancellation';
import { timeout } from 'vs/base/common/async';
import { BrowserBackupTracker } from 'vs/workbench/services/backup/browser/backupTracker';
import { DisposableStore } from 'vs/base/common/lifecycle';

suite('BackupTracker (browser)', function () {
	let accessor: TestServiceAccessor;

	class TestBackupTracker extends BrowserBackupTracker {

		constructor(
			@IBackupFileService backupFileService: IBackupFileService,
			@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
			@IWorkingCopyService workingCopyService: IWorkingCopyService,
			@ILifecycleService lifecycleService: ILifecycleService,
			@ILogService logService: ILogService,
		) {
			super(backupFileService, filesConfigurationService, workingCopyService, lifecycleService, logService);
		}

		protected override getBackupScheduleDelay(): number {
			return 10; // Reduce timeout for tests
		}
	}

	async function createTracker(): Promise<{ accessor: TestServiceAccessor, part: EditorPart, tracker: BackupTracker, backupFileService: InMemoryTestBackupFileService, instantiationService: IInstantiationService, cleanup: () => void }> {
		const disposables = new DisposableStore();

		const backupFileService = new InMemoryTestBackupFileService();
		const instantiationService = workbenchInstantiationService();
		instantiationService.stub(IBackupFileService, backupFileService);

		const part = await createEditorPart(instantiationService, disposables);

		disposables.add(registerTestResourceEditor());

		instantiationService.stub(IEditorGroupsService, part);

		const editorService: EditorService = instantiationService.createInstance(EditorService);
		instantiationService.stub(IEditorService, editorService);

		accessor = instantiationService.createInstance(TestServiceAccessor);

		const tracker = disposables.add(instantiationService.createInstance(TestBackupTracker));

		return { accessor, part, tracker, backupFileService, instantiationService, cleanup: () => disposables.dispose() };
	}

	async function untitledBackupTest(untitled: IUntitledTextResourceEditorInput = {}): Promise<void> {
		const { accessor, cleanup, backupFileService } = await createTracker();

		const untitledEditor = (await accessor.editorService.openEditor(untitled))?.input as UntitledTextEditorInput;

		const untitledModel = await untitledEditor.resolve();

		if (!untitled?.contents) {
			untitledModel.textEditorModel?.setValue('Super Good');
		}

		await backupFileService.joinBackupResource();

		assert.strictEqual(backupFileService.hasBackupSync(untitledEditor.resource), true);

		untitledModel.dispose();

		await backupFileService.joinDiscardBackup();

		assert.strictEqual(backupFileService.hasBackupSync(untitledEditor.resource), false);

		cleanup();
	}

	test('Track backups (untitled)', function () {
		return untitledBackupTest();
	});

	test('Track backups (untitled with initial contents)', function () {
		return untitledBackupTest({ contents: 'Foo Bar' });
	});

	test('Track backups (custom)', async function () {
		const { accessor, cleanup, backupFileService } = await createTracker();

		class TestBackupWorkingCopy extends TestWorkingCopy {

			backupDelay = 0;

			constructor(resource: URI) {
				super(resource);

				accessor.workingCopyService.registerWorkingCopy(this);
			}

			async override backup(token: CancellationToken): Promise<IWorkingCopyBackup> {
				await timeout(this.backupDelay);

				return {};
			}
		}

		const resource = toResource.call(this, '/path/custom.txt');
		const customWorkingCopy = new TestBackupWorkingCopy(resource);

		// Normal
		customWorkingCopy.setDirty(true);
		await backupFileService.joinBackupResource();
		assert.strictEqual(backupFileService.hasBackupSync(resource), true);

		customWorkingCopy.setDirty(false);
		customWorkingCopy.setDirty(true);
		await backupFileService.joinBackupResource();
		assert.strictEqual(backupFileService.hasBackupSync(resource), true);

		customWorkingCopy.setDirty(false);
		await backupFileService.joinDiscardBackup();
		assert.strictEqual(backupFileService.hasBackupSync(resource), false);

		// Cancellation
		customWorkingCopy.setDirty(true);
		await timeout(0);
		customWorkingCopy.setDirty(false);
		await backupFileService.joinDiscardBackup();
		assert.strictEqual(backupFileService.hasBackupSync(resource), false);

		customWorkingCopy.dispose();
		cleanup();
	});
});
