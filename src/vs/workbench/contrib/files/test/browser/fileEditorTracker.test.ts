/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FileEditorTracker } from 'vs/workbench/parts/files/browser/editors/fileEditorTracker';
import { URI } from 'vs/base/common/uri';
import { join } from 'vs/base/common/paths';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { workbenchInstantiationService, TestTextFileService, TestFileService } from 'vs/workbench/test/workbenchTestServices';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { FileChangesEvent, FileChangeType, IFileService, snapshotToString } from 'vs/platform/files/common/files';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { timeout } from 'vs/base/common/async';

function toResource(self: any, path: string) {
	return URI.file(join('C:\\', Buffer.from(self.test.fullTitle()).toString('base64'), path));
}

class ServiceAccessor {
	constructor(
		@IEditorService public editorService: IEditorService,
		@IEditorGroupsService public editorGroupService: IEditorGroupsService,
		@ITextFileService public textFileService: TestTextFileService,
		@IFileService public fileService: TestFileService
	) {
	}
}

suite('Files - FileEditorTracker', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	test('file change event updates model', function () {
		const tracker = instantiationService.createInstance(FileEditorTracker);

		const resource = toResource(this, '/path/index.txt');

		return accessor.textFileService.models.loadOrCreate(resource).then((model: TextFileEditorModel) => {
			model.textEditorModel.setValue('Super Good');
			assert.equal(snapshotToString(model.createSnapshot()), 'Super Good');

			return model.save().then(() => {

				// change event (watcher)
				accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }]));

				return timeout(0).then(() => { // due to event updating model async
					assert.equal(snapshotToString(model.createSnapshot()), 'Hello Html');

					tracker.dispose();
				});
			});
		});
	});
});
