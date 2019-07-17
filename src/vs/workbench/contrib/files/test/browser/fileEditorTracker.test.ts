/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FileEditorTracker } from 'vs/workbench/contrib/files/browser/editors/fileEditorTracker';
import { toResource } from 'vs/base/test/common/utils';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { workbenchInstantiationService, TestTextFileService, TestFileService } from 'vs/workbench/test/workbenchTestServices';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITextFileService, IResolvedTextFileEditorModel, snapshotToString } from 'vs/workbench/services/textfile/common/textfiles';
import { FileChangesEvent, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { timeout } from 'vs/base/common/async';

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

	test('file change event updates model', async function () {
		const tracker = instantiationService.createInstance(FileEditorTracker);

		const resource = toResource.call(this, '/path/index.txt');

		const model = await accessor.textFileService.models.loadOrCreate(resource) as IResolvedTextFileEditorModel;

		model.textEditorModel.setValue('Super Good');
		assert.equal(snapshotToString(model.createSnapshot()!), 'Super Good');

		await model.save();

		// change event (watcher)
		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }]));

		await timeout(0); // due to event updating model async

		assert.equal(snapshotToString(model.createSnapshot()!), 'Hello Html');

		tracker.dispose();
	});
});
