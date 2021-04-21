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
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { toResource } from 'vs/base/test/common/utils';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IWorkingCopyBackup } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { ILogService } from 'vs/platform/log/common/log';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { WorkingCopyBackupTracker } from 'vs/workbench/services/workingCopy/common/workingCopyBackupTracker';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { UntitledTextEditorInput } from 'vs/workbench/services/untitled/common/untitledTextEditorInput';
import { createEditorPart, InMemoryTestWorkingCopyBackupService, registerTestResourceEditor, TestServiceAccessor, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestWorkingCopy } from 'vs/workbench/test/common/workbenchTestServices';
import { CancellationToken } from 'vs/base/common/cancellation';
import { timeout } from 'vs/base/common/async';
import { BrowserWorkingCopyBackupTracker } from 'vs/workbench/services/workingCopy/browser/workingCopyBackupTracker';
import { DisposableStore } from 'vs/base/common/lifecycle';

suite('WorkingCopyBackupTracker (browser)', function () {
	let accessor: TestServiceAccessor;

	class TestBackupTracker extends BrowserWorkingCopyBackupTracker {

		constructor(
			@IWorkingCopyBackupService workingCopyBackupService: IWorkingCopyBackupService,
			@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
			@IWorkingCopyService workingCopyService: IWorkingCopyService,
			@ILifecycleService lifecycleService: ILifecycleService,
			@ILogService logService: ILogService,
		) {
			super(workingCopyBackupService, filesConfigurationService, workingCopyService, lifecycleService, logService);
		}

		protected override getBackupScheduleDelay(): number {
			return 10; // Reduce timeout for tests
		}
	}

	async function createTracker(): Promise<{ accessor: TestServiceAccessor, part: EditorPart, tracker: WorkingCopyBackupTracker, workingCopyBackupService: InMemoryTestWorkingCopyBackupService, instantiationService: IInstantiationService, cleanup: () => void }> {
		const disposables = new DisposableStore();

		const workingCopyBackupService = new InMemoryTestWorkingCopyBackupService();
		const instantiationService = workbenchInstantiationService();
		instantiationService.stub(IWorkingCopyBackupService, workingCopyBackupService);

		const part = await createEditorPart(instantiationService, disposables);

		disposables.add(registerTestResourceEditor());

		instantiationService.stub(IEditorGroupsService, part);

		const editorService: EditorService = instantiationService.createInstance(EditorService);
		instantiationService.stub(IEditorService, editorService);

		accessor = instantiationService.createInstance(TestServiceAccessor);

		const tracker = disposables.add(instantiationService.createInstance(TestBackupTracker));

		return { accessor, part, tracker, workingCopyBackupService: workingCopyBackupService, instantiationService, cleanup: () => disposables.dispose() };
	}

	async function untitledBackupTest(untitled: IUntitledTextResourceEditorInput = {}): Promise<void> {
		const { accessor, cleanup, workingCopyBackupService } = await createTracker();

		const untitledEditor = (await accessor.editorService.openEditor(untitled))?.input as UntitledTextEditorInput;

		const untitledModel = await untitledEditor.resolve();

		if (!untitled?.contents) {
			untitledModel.textEditorModel?.setValue('Super Good');
		}

		await workingCopyBackupService.joinBackupResource();

		assert.strictEqual(workingCopyBackupService.hasBackupSync(untitledModel), true);

		untitledModel.dispose();

		await workingCopyBackupService.joinDiscardBackup();

		assert.strictEqual(workingCopyBackupService.hasBackupSync(untitledModel), false);

		cleanup();
	}

	test('Track backups (untitled)', function () {
		return untitledBackupTest();
	});

	test('Track backups (untitled with initial contents)', function () {
		return untitledBackupTest({ contents: 'Foo Bar' });
	});

	test('Track backups (custom)', async function () {
		const { accessor, cleanup, workingCopyBackupService } = await createTracker();

		class TestBackupWorkingCopy extends TestWorkingCopy {

			backupDelay = 0;

			constructor(resource: URI) {
				super(resource);

				accessor.workingCopyService.registerWorkingCopy(this);
			}

			override async backup(token: CancellationToken): Promise<IWorkingCopyBackup> {
				await timeout(this.backupDelay);

				return {};
			}
		}

		const resource = toResource.call(this, '/path/custom.txt');
		const customWorkingCopy = new TestBackupWorkingCopy(resource);

		// Normal
		customWorkingCopy.setDirty(true);
		await workingCopyBackupService.joinBackupResource();
		assert.strictEqual(workingCopyBackupService.hasBackupSync(customWorkingCopy), true);

		customWorkingCopy.setDirty(false);
		customWorkingCopy.setDirty(true);
		await workingCopyBackupService.joinBackupResource();
		assert.strictEqual(workingCopyBackupService.hasBackupSync(customWorkingCopy), true);

		customWorkingCopy.setDirty(false);
		await workingCopyBackupService.joinDiscardBackup();
		assert.strictEqual(workingCopyBackupService.hasBackupSync(customWorkingCopy), false);

		// Cancellation
		customWorkingCopy.setDirty(true);
		await timeout(0);
		customWorkingCopy.setDirty(false);
		await workingCopyBackupService.joinDiscardBackup();
		assert.strictEqual(workingCopyBackupService.hasBackupSync(customWorkingCopy), false);

		customWorkingCopy.dispose();
		cleanup();
	});
});
