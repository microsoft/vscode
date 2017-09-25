/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { FileEditorTracker } from 'vs/workbench/parts/files/common/editors/fileEditorTracker';
import URI from 'vs/base/common/uri';
import { join } from 'vs/base/common/paths';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { workbenchInstantiationService, TestTextFileService, TestFileService } from 'vs/workbench/test/workbenchTestServices';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { EditorStacksModel } from 'vs/workbench/common/editor/editorStacksModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { FileOperation, FileOperationEvent, FileChangesEvent, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { once } from 'vs/base/common/event';

class TestFileEditorTracker extends FileEditorTracker {

	setCloseOnFileDelete(value: boolean): void {
		this.closeOnFileDelete = value;
	}
}

function toResource(path) {
	return URI.file(join('C:\\', new Buffer(this.test.fullTitle()).toString('base64'), path));
}

class ServiceAccessor {
	constructor(
		@IWorkbenchEditorService public editorService: IWorkbenchEditorService,
		@IEditorGroupService public editorGroupService: IEditorGroupService,
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

	test('disposes input when resource gets deleted - local file changes', function () {
		const stacks = accessor.editorGroupService.getStacksModel() as EditorStacksModel;
		const group = stacks.openGroup('first', true);

		const tracker = instantiationService.createInstance(FileEditorTracker);
		assert.ok(tracker);

		const parent = toResource.call(this, '/foo/bar');
		const resource = toResource.call(this, '/foo/bar/updatefile.js');
		let input = instantiationService.createInstance(FileEditorInput, resource, void 0);
		group.openEditor(input);

		assert.ok(!input.isDisposed());

		accessor.fileService.fireAfterOperation(new FileOperationEvent(resource, FileOperation.DELETE));
		assert.ok(input.isDisposed());
		group.closeEditor(input);

		input = instantiationService.createInstance(FileEditorInput, resource, void 0);
		group.openEditor(input);

		const other = toResource.call(this, '/foo/barfoo');

		accessor.fileService.fireAfterOperation(new FileOperationEvent(other, FileOperation.DELETE));
		assert.ok(!input.isDisposed());

		accessor.fileService.fireAfterOperation(new FileOperationEvent(parent, FileOperation.DELETE));
		assert.ok(input.isDisposed());

		// Move
		const to = toResource.call(this, '/foo/barfoo/change.js');
		accessor.fileService.fireAfterOperation(new FileOperationEvent(resource, FileOperation.MOVE, to));
		assert.ok(input.isDisposed());

		tracker.dispose();
	});

	test('disposes input when resource gets deleted - local file changes - even when closeOnFileDelete = false', function () {
		const stacks = accessor.editorGroupService.getStacksModel() as EditorStacksModel;
		const group = stacks.openGroup('first', true);

		const tracker = instantiationService.createInstance(TestFileEditorTracker);
		tracker.setCloseOnFileDelete(false);
		assert.ok(tracker);

		const parent = toResource.call(this, '/foo/bar');
		const resource = toResource.call(this, '/foo/bar/updatefile.js');
		let input = instantiationService.createInstance(FileEditorInput, resource, void 0);
		group.openEditor(input);

		assert.ok(!input.isDisposed());

		accessor.fileService.fireAfterOperation(new FileOperationEvent(resource, FileOperation.DELETE));
		assert.ok(input.isDisposed());
		group.closeEditor(input);

		input = instantiationService.createInstance(FileEditorInput, resource, void 0);
		group.openEditor(input);

		const other = toResource.call(this, '/foo/barfoo');

		accessor.fileService.fireAfterOperation(new FileOperationEvent(other, FileOperation.DELETE));
		assert.ok(!input.isDisposed());

		accessor.fileService.fireAfterOperation(new FileOperationEvent(parent, FileOperation.DELETE));
		assert.ok(input.isDisposed());

		// Move
		const to = toResource.call(this, '/foo/barfoo/change.js');
		accessor.fileService.fireAfterOperation(new FileOperationEvent(resource, FileOperation.MOVE, to));
		assert.ok(input.isDisposed());

		tracker.dispose();
	});

	test('disposes when resource gets deleted - remote file changes', function (done) {
		const stacks = accessor.editorGroupService.getStacksModel() as EditorStacksModel;
		const group = stacks.openGroup('first', true);

		const tracker = instantiationService.createInstance(FileEditorTracker);
		assert.ok(tracker);

		const parent = toResource.call(this, '/foo/bar');
		const resource = toResource.call(this, '/foo/bar/updatefile.js');
		let input = instantiationService.createInstance(FileEditorInput, resource, void 0);
		group.openEditor(input);

		assert.ok(!input.isDisposed());

		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.DELETED }]));

		once(input.onDispose)(() => {
			assert.ok(input.isDisposed());
			group.closeEditor(input);

			input = instantiationService.createInstance(FileEditorInput, resource, void 0);
			group.openEditor(input);

			const other = toResource.call(this, '/foo/barfoo');

			accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: other, type: FileChangeType.DELETED }]));
			assert.ok(!input.isDisposed());

			accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: parent, type: FileChangeType.DELETED }]));

			once(input.onDispose)(() => {
				assert.ok(input.isDisposed());

				tracker.dispose();
				done();
			});
		});
	});

	test('keeps open when resource gets deleted - remote file changes - closeOnFileDelete = false', function () {
		const stacks = accessor.editorGroupService.getStacksModel() as EditorStacksModel;
		const group = stacks.openGroup('first', true);

		const tracker = instantiationService.createInstance(TestFileEditorTracker);
		tracker.setCloseOnFileDelete(false);
		assert.ok(tracker);

		const resource = toResource.call(this, '/foo/bar/updatefile.js');
		let input = instantiationService.createInstance(FileEditorInput, resource, void 0);
		group.openEditor(input);

		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.DELETED }]));

		assert.ok(!input.isDisposed());

		tracker.dispose();
	});

	test('file change event updates model', function (done) {
		const tracker = instantiationService.createInstance(FileEditorTracker);

		const resource = toResource.call(this, '/path/index.txt');

		accessor.textFileService.models.loadOrCreate(resource).then((model: TextFileEditorModel) => {
			model.textEditorModel.setValue('Super Good');
			assert.equal(model.getValue(), 'Super Good');

			model.save().then(() => {

				// change event (watcher)
				accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }]));

				assert.equal(model.getValue(), 'Hello Html');

				tracker.dispose();

				done();
			});
		});
	});
});