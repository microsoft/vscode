/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as platform from 'vs/base/common/platform';
import { ILifecycleService, BeforeShutdownEvent, ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';
import { workbenchInstantiationService, TestLifecycleService, TestTextFileService, TestContextService, TestFileService, TestElectronService, TestFilesConfigurationService, TestFileDialogService, TestBackupFileService } from 'vs/workbench/test/workbenchTestServices';
import { toResource } from 'vs/base/test/common/utils';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { HotExitConfiguration, IFileService } from 'vs/platform/files/common/files';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { IWorkspaceContextService, Workspace } from 'vs/platform/workspace/common/workspace';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IFileDialogService, ConfirmResult } from 'vs/platform/dialogs/common/dialogs';
import { BackupOnShutdown } from 'vs/workbench/contrib/backup/electron-browser/backupOnShutdown';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';

class ServiceAccessor {
	constructor(
		@ILifecycleService public lifecycleService: TestLifecycleService,
		@ITextFileService public textFileService: TestTextFileService,
		@IFilesConfigurationService public filesConfigurationService: TestFilesConfigurationService,
		@IUntitledTextEditorService public untitledTextEditorService: IUntitledTextEditorService,
		@IWorkspaceContextService public contextService: TestContextService,
		@IModelService public modelService: ModelServiceImpl,
		@IFileService public fileService: TestFileService,
		@IElectronService public electronService: TestElectronService,
		@IFileDialogService public fileDialogService: TestFileDialogService,
		@IBackupFileService public backupFileService: TestBackupFileService,
		@IWorkingCopyService public workingCopyService: IWorkingCopyService
	) {
	}
}

class BeforeShutdownEventImpl implements BeforeShutdownEvent {

	value: boolean | Promise<boolean> | undefined;
	reason = ShutdownReason.CLOSE;

	veto(value: boolean | Promise<boolean>): void {
		this.value = value;
	}
}

suite('BackupOnShutdown', () => {

	let instantiationService: IInstantiationService;
	let model: TextFileEditorModel;
	let accessor: ServiceAccessor;
	let backupOnShutdown: BackupOnShutdown;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
		backupOnShutdown = instantiationService.createInstance(BackupOnShutdown);
	});

	teardown(() => {
		if (model) {
			model.dispose();
		}
		(<TextFileEditorModelManager>accessor.textFileService.models).dispose();
		accessor.untitledTextEditorService.revertAll();
		backupOnShutdown.dispose();
	});

	test('confirm onWillShutdown - no veto', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.resource, model);

		const event = new BeforeShutdownEventImpl();
		accessor.lifecycleService.fireWillShutdown(event);

		const veto = event.value;
		if (typeof veto === 'boolean') {
			assert.ok(!veto);
		} else {
			assert.ok(!(await veto));
		}
	});

	test('confirm onWillShutdown - veto if user cancels', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.resource, model);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);

		await model.load();
		model.textEditorModel!.setValue('foo');
		assert.equal(accessor.workingCopyService.dirtyCount, 1);

		const event = new BeforeShutdownEventImpl();
		accessor.lifecycleService.fireWillShutdown(event);
		assert.ok(event.value);
	});

	test('confirm onWillShutdown - no veto and backups cleaned up if user does not want to save (hot.exit: off)', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.resource, model);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
		accessor.filesConfigurationService.onFilesConfigurationChange({ files: { hotExit: 'off' } });

		await model.load();
		model.textEditorModel!.setValue('foo');
		assert.equal(accessor.workingCopyService.dirtyCount, 1);
		const event = new BeforeShutdownEventImpl();
		accessor.lifecycleService.fireWillShutdown(event);

		let veto = event.value;
		if (typeof veto === 'boolean') {
			assert.ok(accessor.backupFileService.didDiscardAllWorkspaceBackups);
			assert.ok(!veto);
			return;
		}

		veto = await veto;
		assert.ok(accessor.backupFileService.didDiscardAllWorkspaceBackups);
		assert.ok(!veto);
	});

	test('confirm onWillShutdown - save (hot.exit: off)', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.resource, model);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.SAVE);
		accessor.filesConfigurationService.onFilesConfigurationChange({ files: { hotExit: 'off' } });

		await model.load();
		model.textEditorModel!.setValue('foo');
		assert.equal(accessor.workingCopyService.dirtyCount, 1);
		const event = new BeforeShutdownEventImpl();
		accessor.lifecycleService.fireWillShutdown(event);

		const veto = await (<Promise<boolean>>event.value);
		assert.ok(!veto);
		assert.ok(!model.isDirty());
	});

	suite('Hot Exit', () => {
		suite('"onExit" setting', () => {
			test('should hot exit on non-Mac (reason: CLOSE, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, false, true, !!platform.isMacintosh);
			});
			test('should hot exit on non-Mac (reason: CLOSE, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, false, false, !!platform.isMacintosh);
			});
			test('should NOT hot exit (reason: CLOSE, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, true, true, true);
			});
			test('should NOT hot exit (reason: CLOSE, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, true, false, true);
			});
			test('should hot exit (reason: QUIT, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, false, true, false);
			});
			test('should hot exit (reason: QUIT, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, false, false, false);
			});
			test('should hot exit (reason: QUIT, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, true, true, false);
			});
			test('should hot exit (reason: QUIT, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, true, false, false);
			});
			test('should hot exit (reason: RELOAD, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, false, true, false);
			});
			test('should hot exit (reason: RELOAD, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, false, false, false);
			});
			test('should hot exit (reason: RELOAD, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, true, true, false);
			});
			test('should hot exit (reason: RELOAD, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, true, false, false);
			});
			test('should NOT hot exit (reason: LOAD, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, false, true, true);
			});
			test('should NOT hot exit (reason: LOAD, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, false, false, true);
			});
			test('should NOT hot exit (reason: LOAD, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, true, true, true);
			});
			test('should NOT hot exit (reason: LOAD, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, true, false, true);
			});
		});

		suite('"onExitAndWindowClose" setting', () => {
			test('should hot exit (reason: CLOSE, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, false, true, false);
			});
			test('should hot exit (reason: CLOSE, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, false, false, !!platform.isMacintosh);
			});
			test('should hot exit (reason: CLOSE, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, true, true, false);
			});
			test('should NOT hot exit (reason: CLOSE, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, true, false, true);
			});
			test('should hot exit (reason: QUIT, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, false, true, false);
			});
			test('should hot exit (reason: QUIT, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, false, false, false);
			});
			test('should hot exit (reason: QUIT, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, true, true, false);
			});
			test('should hot exit (reason: QUIT, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, true, false, false);
			});
			test('should hot exit (reason: RELOAD, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, false, true, false);
			});
			test('should hot exit (reason: RELOAD, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, false, false, false);
			});
			test('should hot exit (reason: RELOAD, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, true, true, false);
			});
			test('should hot exit (reason: RELOAD, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, true, false, false);
			});
			test('should hot exit (reason: LOAD, windows: single, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, false, true, false);
			});
			test('should NOT hot exit (reason: LOAD, windows: single, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, false, false, true);
			});
			test('should hot exit (reason: LOAD, windows: multiple, workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, true, true, false);
			});
			test('should NOT hot exit (reason: LOAD, windows: multiple, empty workspace)', function () {
				return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, true, false, true);
			});
		});

		async function hotExitTest(this: any, setting: string, shutdownReason: ShutdownReason, multipleWindows: boolean, workspace: boolean, shouldVeto: boolean): Promise<void> {
			model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
			(<TextFileEditorModelManager>accessor.textFileService.models).add(model.resource, model);

			// Set hot exit config
			accessor.filesConfigurationService.onFilesConfigurationChange({ files: { hotExit: setting } });

			// Set empty workspace if required
			if (!workspace) {
				accessor.contextService.setWorkspace(new Workspace('empty:1508317022751'));
			}

			// Set multiple windows if required
			if (multipleWindows) {
				accessor.electronService.windowCount = Promise.resolve(2);
			}

			// Set cancel to force a veto if hot exit does not trigger
			accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);

			await model.load();
			model.textEditorModel!.setValue('foo');
			assert.equal(accessor.workingCopyService.dirtyCount, 1);

			const event = new BeforeShutdownEventImpl();
			event.reason = shutdownReason;
			accessor.lifecycleService.fireWillShutdown(event);

			const veto = await (<Promise<boolean>>event.value);
			assert.ok(!accessor.backupFileService.didDiscardAllWorkspaceBackups); // When hot exit is set, backups should never be cleaned since the confirm result is cancel
			assert.equal(veto, shouldVeto);
		}
	});
});
