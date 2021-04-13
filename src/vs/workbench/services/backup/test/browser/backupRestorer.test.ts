/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { createTextBufferFactory } from 'vs/editor/common/model/textModel';
import { DefaultEndOfLine } from 'vs/editor/common/model';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { createEditorPart, InMemoryTestBackupFileService, registerTestResourceEditor, TestServiceAccessor, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { BackupRestorer } from 'vs/workbench/services/backup/common/backupRestorer';
import { BrowserBackupTracker } from 'vs/workbench/services/backup/browser/backupTracker';
import { DisposableStore } from 'vs/base/common/lifecycle';

suite('BackupRestorer', () => {

	class TestBackupRestorer extends BackupRestorer {
		async override doRestoreBackups(): Promise<void> {
			return super.doRestoreBackups();
		}
	}

	let accessor: TestServiceAccessor;
	let disposables = new DisposableStore();

	const fooFile = URI.file(isWindows ? 'c:\\Foo' : '/Foo');
	const barFile = URI.file(isWindows ? 'c:\\Bar' : '/Bar');
	const untitledFile1 = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });
	const untitledFile2 = URI.from({ scheme: Schemas.untitled, path: 'Untitled-2' });

	setup(() => {
		disposables.add(registerTestResourceEditor());
	});

	teardown(() => {
		disposables.clear();
	});

	test('Restore backups', async function () {
		const backupFileService = new InMemoryTestBackupFileService();
		const instantiationService = workbenchInstantiationService();
		instantiationService.stub(IBackupFileService, backupFileService);

		const part = await createEditorPart(instantiationService, disposables);

		instantiationService.stub(IEditorGroupsService, part);

		const editorService: EditorService = instantiationService.createInstance(EditorService);
		instantiationService.stub(IEditorService, editorService);

		accessor = instantiationService.createInstance(TestServiceAccessor);

		disposables.add(instantiationService.createInstance(BrowserBackupTracker));
		const restorer = instantiationService.createInstance(TestBackupRestorer);

		// Backup 2 normal files and 2 untitled file
		await backupFileService.backup(untitledFile1, createTextBufferFactory('untitled-1').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
		await backupFileService.backup(untitledFile2, createTextBufferFactory('untitled-2').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
		await backupFileService.backup(fooFile, createTextBufferFactory('fooFile').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
		await backupFileService.backup(barFile, createTextBufferFactory('barFile').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));

		// Verify backups restored and opened as dirty
		await restorer.doRestoreBackups();
		assert.strictEqual(editorService.count, 4);
		assert.ok(editorService.editors.every(editor => editor.isDirty()));

		let counter = 0;
		for (const editor of editorService.editors) {
			const resource = editor.resource;
			if (isEqual(resource, untitledFile1)) {
				const model = await accessor.textFileService.untitled.resolve({ untitledResource: resource });
				if (model.textEditorModel?.getValue() !== 'untitled-1') {
					const backupContents = await backupFileService.getBackupContents(untitledFile1);
					assert.fail(`Unable to restore backup for resource ${untitledFile1.toString()}. Backup contents: ${backupContents}`);
				}
				model.dispose();
				counter++;
			} else if (isEqual(resource, untitledFile2)) {
				const model = await accessor.textFileService.untitled.resolve({ untitledResource: resource });
				if (model.textEditorModel?.getValue() !== 'untitled-2') {
					const backupContents = await backupFileService.getBackupContents(untitledFile2);
					assert.fail(`Unable to restore backup for resource ${untitledFile2.toString()}. Backup contents: ${backupContents}`);
				}
				model.dispose();
				counter++;
			} else if (isEqual(resource, fooFile)) {
				const model = accessor.textFileService.files.get(fooFile);
				await model?.resolve();
				if (model?.textEditorModel?.getValue() !== 'fooFile') {
					const backupContents = await backupFileService.getBackupContents(fooFile);
					assert.fail(`Unable to restore backup for resource ${fooFile.toString()}. Backup contents: ${backupContents}`);
				}
				counter++;
			} else {
				const model = accessor.textFileService.files.get(barFile);
				await model?.resolve();
				if (model?.textEditorModel?.getValue() !== 'barFile') {
					const backupContents = await backupFileService.getBackupContents(barFile);
					assert.fail(`Unable to restore backup for resource ${barFile.toString()}. Backup contents: ${backupContents}`);
				}
				counter++;
			}
		}

		assert.strictEqual(counter, 4);
	});
});
