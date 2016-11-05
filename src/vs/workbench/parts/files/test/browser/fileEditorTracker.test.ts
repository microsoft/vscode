/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { FileEditorTracker } from 'vs/workbench/parts/files/common/editors/fileEditorTracker';
import URI from 'vs/base/common/uri';
import { join, basename } from 'vs/base/common/paths';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { workbenchInstantiationService, TestTextFileService } from 'vs/test/utils/servicesTestUtils';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { EditorStacksModel } from 'vs/workbench/common/editor/editorStacksModel';
import { IEventService } from 'vs/platform/event/common/event';
import { ITextFileService, LocalFileChangeEvent } from 'vs/workbench/services/textfile/common/textfiles';
import { FileChangesEvent, FileChangeType, EventType } from 'vs/platform/files/common/files';

function toResource(path) {
	return URI.file(join('C:\\', new Buffer(this.test.fullTitle()).toString('base64'), path));
}

function toStat(resource: URI) {
	return {
		resource,
		isDirectory: false,
		hasChildren: false,
		name: basename(resource.fsPath),
		mtime: Date.now(),
		etag: 'etag'
	};
}

class ServiceAccessor {
	constructor(
		@IWorkbenchEditorService public editorService: IWorkbenchEditorService,
		@IEditorGroupService public editorGroupService: IEditorGroupService,
		@ITextFileService public textFileService: TestTextFileService,
		@IEventService public eventService: IEventService
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

		accessor.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(toStat(resource)));
		assert.ok(input.isDisposed());
		group.closeEditor(input);

		input = instantiationService.createInstance(FileEditorInput, resource, void 0);
		group.openEditor(input);

		const other = toResource.call(this, '/foo/barfoo');

		accessor.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(toStat(other)));
		assert.ok(!input.isDisposed());

		accessor.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(toStat(parent)));
		assert.ok(input.isDisposed());

		// Move
		const to = toResource.call(this, '/foo/barfoo/change.js');
		accessor.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(toStat(resource), toStat(to)));
		assert.ok(input.isDisposed());
	});

	test('disposes when resource gets deleted - remote file changes', function () {
		const stacks = accessor.editorGroupService.getStacksModel() as EditorStacksModel;
		const group = stacks.openGroup('first', true);

		const tracker = instantiationService.createInstance(FileEditorTracker);
		assert.ok(tracker);

		const parent = toResource.call(this, '/foo/bar');
		const resource = toResource.call(this, '/foo/bar/updatefile.js');
		let input = instantiationService.createInstance(FileEditorInput, resource, void 0);
		group.openEditor(input);

		assert.ok(!input.isDisposed());

		accessor.eventService.emit(EventType.FILE_CHANGES, new FileChangesEvent([{ resource, type: FileChangeType.DELETED }]));
		assert.ok(input.isDisposed());
		group.closeEditor(input);

		input = instantiationService.createInstance(FileEditorInput, resource, void 0);
		group.openEditor(input);

		const other = toResource.call(this, '/foo/barfoo');

		accessor.eventService.emit(EventType.FILE_CHANGES, new FileChangesEvent([{ resource: other, type: FileChangeType.DELETED }]));
		assert.ok(!input.isDisposed());

		accessor.eventService.emit(EventType.FILE_CHANGES, new FileChangesEvent([{ resource: parent, type: FileChangeType.DELETED }]));
		assert.ok(input.isDisposed());
	});
});