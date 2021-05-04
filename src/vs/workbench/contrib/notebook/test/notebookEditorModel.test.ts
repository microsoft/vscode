/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { IFileService } from 'vs/platform/files/common/files';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ILabelService } from 'vs/platform/label/common/label';
import { NullLogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ComplexNotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookEditorModel';
import { INotebookContentProvider, INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopy';

suite('NotebookEditorModel', function () {

	const instaService = new InstantiationService();
	const notebokService = new class extends mock<INotebookService>() { };
	const backupService = new class extends mock<IWorkingCopyBackupService>() { };
	const notificationService = new class extends mock<INotificationService>() { };
	const untitledTextEditorService = new class extends mock<IUntitledTextEditorService>() { };
	const fileService = new class extends mock<IFileService>() {
		override onDidFilesChange = Event.None;
	};
	const labelService = new class extends mock<ILabelService>() {
		override getUriBasenameLabel(uri: URI) { return uri.toString(); }
	};

	const notebookDataProvider = new class extends mock<INotebookContentProvider>() { };

	test('working copy uri', function () {

		const r1 = URI.parse('foo-files:///my.nb');
		const r2 = URI.parse('bar-files:///my.nb');

		const copies: IWorkingCopy[] = [];
		const workingCopyService = new class extends mock<IWorkingCopyService>() {
			override registerWorkingCopy(copy: IWorkingCopy) {
				copies.push(copy);
				return Disposable.None;
			}
		};

		new ComplexNotebookEditorModel(r1, 'fff', notebookDataProvider, instaService, notebokService, workingCopyService, backupService, fileService, notificationService, new NullLogService(), untitledTextEditorService, labelService);
		new ComplexNotebookEditorModel(r2, 'fff', notebookDataProvider, instaService, notebokService, workingCopyService, backupService, fileService, notificationService, new NullLogService(), untitledTextEditorService, labelService);

		assert.strictEqual(copies.length, 2);
		assert.strictEqual(!isEqual(copies[0].resource, copies[1].resource), true);
	});
});
