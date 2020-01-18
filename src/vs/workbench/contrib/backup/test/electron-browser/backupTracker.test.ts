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
import { BackupTracker } from 'vs/workbench/contrib/backup/common/backupTracker';
import { TestTextFileService, workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
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

const userdataDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'backuprestorer');
const backupHome = path.join(userdataDir, 'Backups');
const workspacesJsonPath = path.join(backupHome, 'workspaces.json');

const workspaceResource = URI.file(platform.isWindows ? 'c:\\workspace' : '/workspace');
const workspaceBackupPath = path.join(backupHome, hashPath(workspaceResource));

class ServiceAccessor {
	constructor(
		@ITextFileService public textFileService: TestTextFileService,
		@IEditorService public editorService: IEditorService,
		@IBackupFileService public backupFileService: NodeTestBackupFileService
	) {
	}
}

class TestBackupTracker extends BackupTracker {

	constructor(
		@IBackupFileService backupFileService: IBackupFileService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@ILogService logService: ILogService
	) {
		super(backupFileService, filesConfigurationService, workingCopyService, logService);

		// Reduce timeout for tests
		BackupTracker.BACKUP_FROM_CONTENT_CHANGE_DELAY = 10;
	}
}

suite('BackupTracker', () => {
	let accessor: ServiceAccessor;

	let disposables: IDisposable[] = [];

	setup(async () => {
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
});
