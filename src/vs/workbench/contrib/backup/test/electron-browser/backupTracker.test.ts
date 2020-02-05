/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as platform from 'vs/base/common/platform';
import * as os from 'os';
import * as path from 'vs/base/common/path';
import * as pfs from 'vs/base/node/pfs';
import { URI } from 'vs/base/common/uri';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { hashPath } from 'vs/workbench/services/backup/node/backupFileService';
import { NativeBackupTracker } from 'vs/workbench/contrib/backup/electron-browser/backupTracker';
import { TestLifecycleService, TestFilesConfigurationService, TestContextService, TestFileService, TestFileDialogService } from 'vs/workbench/test/browser/workbenchTestServices';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorInput } from 'vs/workbench/common/editor';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEditorRegistry, EditorDescriptor, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { TextFileEditor } from 'vs/workbench/contrib/files/browser/editors/textFileEditor';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { NodeTestBackupFileService } from 'vs/workbench/services/backup/test/electron-browser/backupFileService.test';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { toResource } from 'vs/base/test/common/utils';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ILogService } from 'vs/platform/log/common/log';
import { INewUntitledTextEditorOptions } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { HotExitConfiguration, IFileService } from 'vs/platform/files/common/files';
import { ShutdownReason, ILifecycleService, BeforeShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFileDialogService, ConfirmResult, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IWorkspaceContextService, Workspace } from 'vs/platform/workspace/common/workspace';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { BackupTracker } from 'vs/workbench/contrib/backup/common/backupTracker';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IModelService } from 'vs/editor/common/services/modelService';
import { TestTextFileService, TestElectronService, workbenchInstantiationService } from 'vs/workbench/test/electron-browser/workbenchTestServices';

const userdataDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'backuprestorer');
const backupHome = path.join(userdataDir, 'Backups');
const workspacesJsonPath = path.join(backupHome, 'workspaces.json');

const workspaceResource = URI.file(platform.isWindows ? 'c:\\workspace' : '/workspace');
const workspaceBackupPath = path.join(backupHome, hashPath(workspaceResource));

class ServiceAccessor {
	constructor(
		@ILifecycleService public lifecycleService: TestLifecycleService,
		@ITextFileService public textFileService: TestTextFileService,
		@IFilesConfigurationService public filesConfigurationService: TestFilesConfigurationService,
		@IWorkspaceContextService public contextService: TestContextService,
		@IModelService public modelService: ModelServiceImpl,
		@IFileService public fileService: TestFileService,
		@IElectronService public electronService: TestElectronService,
		@IFileDialogService public fileDialogService: TestFileDialogService,
		@IBackupFileService public backupFileService: NodeTestBackupFileService,
		@IWorkingCopyService public workingCopyService: IWorkingCopyService,
		@IEditorService public editorService: IEditorService
	) {
	}
}

class TestBackupTracker extends NativeBackupTracker {

	constructor(
		@IBackupFileService backupFileService: IBackupFileService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IDialogService dialogService: IDialogService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IElectronService electronService: IElectronService,
		@ILogService logService: ILogService,
		@IEditorService editorService: IEditorService
	) {
		super(backupFileService, filesConfigurationService, workingCopyService, lifecycleService, environmentService, fileDialogService, dialogService, contextService, electronService, logService, editorService);

		// Reduce timeout for tests
		BackupTracker.BACKUP_FROM_CONTENT_CHANGE_DELAY = 10;
	}
}

class BeforeShutdownEventImpl implements BeforeShutdownEvent {

	value: boolean | Promise<boolean> | undefined;
	reason = ShutdownReason.CLOSE;

	veto(value: boolean | Promise<boolean>): void {
		this.value = value;
	}
}

suite('BackupTracker', () => {
	let accessor: ServiceAccessor;
	let disposables: IDisposable[] = [];

	setup(async () => {
		const instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);

		disposables.push(Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
			EditorDescriptor.create(
				TextFileEditor,
				TextFileEditor.ID,
				'Text File Editor'
			),
			[new SyncDescriptor<EditorInput>(FileEditorInput)]
		));

		// Delete any existing backups completely and then re-create it.
		await pfs.rimraf(backupHome, pfs.RimRafMode.MOVE);
		await pfs.mkdirp(backupHome);

		return pfs.writeFile(workspacesJsonPath, '');
	});

	teardown(async () => {
		dispose(disposables);
		disposables = [];

		(<TextFileEditorModelManager>accessor.textFileService.files).dispose();

		return pfs.rimraf(backupHome, pfs.RimRafMode.MOVE);
	});

	async function createTracker(): Promise<[ServiceAccessor, EditorPart, BackupTracker]> {
		const backupFileService = new NodeTestBackupFileService(workspaceBackupPath);
		const instantiationService = workbenchInstantiationService();
		instantiationService.stub(IBackupFileService, backupFileService);

		const part = instantiationService.createInstance(EditorPart);
		part.create(document.createElement('div'));
		part.layout(400, 300);

		instantiationService.stub(IEditorGroupsService, part);

		const editorService: EditorService = instantiationService.createInstance(EditorService);
		instantiationService.stub(IEditorService, editorService);

		accessor = instantiationService.createInstance(ServiceAccessor);

		await part.whenRestored;

		const tracker = instantiationService.createInstance(TestBackupTracker);

		return [accessor, part, tracker];
	}

	async function untitledBackupTest(options?: INewUntitledTextEditorOptions): Promise<void> {
		const [accessor, part, tracker] = await createTracker();

		const untitledEditor = accessor.textFileService.untitled.create(options);
		await accessor.editorService.openEditor(untitledEditor, { pinned: true });

		const untitledModel = await untitledEditor.resolve();

		if (!options?.initialValue) {
			untitledModel.textEditorModel.setValue('Super Good');
		}

		await accessor.backupFileService.joinBackupResource();

		assert.equal(accessor.backupFileService.hasBackupSync(untitledEditor.getResource()), true);

		untitledModel.dispose();

		await accessor.backupFileService.joinDiscardBackup();

		assert.equal(accessor.backupFileService.hasBackupSync(untitledEditor.getResource()), false);

		part.dispose();
		tracker.dispose();
	}

	test('Track backups (untitled)', function () {
		this.timeout(20000);

		return untitledBackupTest();
	});

	test('Track backups (untitled with initial contents)', function () {
		this.timeout(20000);

		return untitledBackupTest({ initialValue: 'Foo Bar' });
	});

	test('Track backups (file)', async function () {
		this.timeout(20000);

		const [accessor, part, tracker] = await createTracker();

		const resource = toResource.call(this, '/path/index.txt');
		await accessor.editorService.openEditor({ resource, options: { pinned: true } });

		const fileModel = accessor.textFileService.files.get(resource);
		fileModel?.textEditorModel?.setValue('Super Good');

		await accessor.backupFileService.joinBackupResource();

		assert.equal(accessor.backupFileService.hasBackupSync(resource), true);

		fileModel?.dispose();

		await accessor.backupFileService.joinDiscardBackup();

		assert.equal(accessor.backupFileService.hasBackupSync(resource), false);

		part.dispose();
		tracker.dispose();
	});

	test('confirm onWillShutdown - no veto', async function () {
		const [accessor, part, tracker] = await createTracker();

		const resource = toResource.call(this, '/path/index.txt');
		await accessor.editorService.openEditor({ resource, options: { pinned: true } });

		const event = new BeforeShutdownEventImpl();
		accessor.lifecycleService.fireWillShutdown(event);

		const veto = event.value;
		if (typeof veto === 'boolean') {
			assert.ok(!veto);
		} else {
			assert.ok(!(await veto));
		}

		part.dispose();
		tracker.dispose();
	});

	test('confirm onWillShutdown - veto if user cancels', async function () {
		const [accessor, part, tracker] = await createTracker();

		const resource = toResource.call(this, '/path/index.txt');
		await accessor.editorService.openEditor({ resource, options: { pinned: true } });

		const model = accessor.textFileService.files.get(resource);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);

		await model?.load();
		model?.textEditorModel?.setValue('foo');
		assert.equal(accessor.workingCopyService.dirtyCount, 1);

		const event = new BeforeShutdownEventImpl();
		accessor.lifecycleService.fireWillShutdown(event);
		assert.ok(event.value);

		part.dispose();
		tracker.dispose();
	});

	test('confirm onWillShutdown - no veto and backups cleaned up if user does not want to save (hot.exit: off)', async function () {
		const [accessor, part, tracker] = await createTracker();

		const resource = toResource.call(this, '/path/index.txt');
		await accessor.editorService.openEditor({ resource, options: { pinned: true } });

		const model = accessor.textFileService.files.get(resource);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
		accessor.filesConfigurationService.onFilesConfigurationChange({ files: { hotExit: 'off' } });

		await model?.load();
		model?.textEditorModel?.setValue('foo');
		assert.equal(accessor.workingCopyService.dirtyCount, 1);
		const event = new BeforeShutdownEventImpl();
		accessor.lifecycleService.fireWillShutdown(event);

		let veto = event.value;
		if (typeof veto === 'boolean') {
			assert.ok(accessor.backupFileService.discardedBackups.length > 0);
			assert.ok(!veto);
		} else {
			veto = await veto;
			assert.ok(accessor.backupFileService.discardedBackups.length > 0);
			assert.ok(!veto);
		}

		part.dispose();
		tracker.dispose();
	});

	test('confirm onWillShutdown - save (hot.exit: off)', async function () {
		const [accessor, part, tracker] = await createTracker();

		const resource = toResource.call(this, '/path/index.txt');
		await accessor.editorService.openEditor({ resource, options: { pinned: true } });

		const model = accessor.textFileService.files.get(resource);

		accessor.fileDialogService.setConfirmResult(ConfirmResult.SAVE);
		accessor.filesConfigurationService.onFilesConfigurationChange({ files: { hotExit: 'off' } });

		await model?.load();
		model?.textEditorModel?.setValue('foo');
		assert.equal(accessor.workingCopyService.dirtyCount, 1);
		const event = new BeforeShutdownEventImpl();
		accessor.lifecycleService.fireWillShutdown(event);

		const veto = await (<Promise<boolean>>event.value);
		assert.ok(!veto);
		assert.ok(!model?.isDirty());

		part.dispose();
		tracker.dispose();
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
			const [accessor, part, tracker] = await createTracker();

			const resource = toResource.call(this, '/path/index.txt');
			await accessor.editorService.openEditor({ resource, options: { pinned: true } });

			const model = accessor.textFileService.files.get(resource);

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

			await model?.load();
			model?.textEditorModel?.setValue('foo');
			assert.equal(accessor.workingCopyService.dirtyCount, 1);

			const event = new BeforeShutdownEventImpl();
			event.reason = shutdownReason;
			accessor.lifecycleService.fireWillShutdown(event);

			const veto = await (<Promise<boolean>>event.value);
			assert.equal(accessor.backupFileService.discardedBackups.length, 0); // When hot exit is set, backups should never be cleaned since the confirm result is cancel
			assert.equal(veto, shouldVeto);

			part.dispose();
			tracker.dispose();
		}
	});
});
