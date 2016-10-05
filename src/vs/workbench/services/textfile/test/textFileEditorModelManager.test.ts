/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {TextFileEditorModelManager} from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import {EditorModel} from 'vs/workbench/common/editor';
import {join, basename} from 'vs/base/common/paths';
import {workbenchInstantiationService, TestEditorGroupService, createFileInput} from 'vs/test/utils/servicesTestUtils';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {TextFileEditorModel} from 'vs/workbench/services/textfile/common/textFileEditorModel';
import {IEventService} from 'vs/platform/event/common/event';
import {LocalFileChangeEvent} from 'vs/workbench/services/textfile/common/textfiles';
import {FileChangesEvent, EventType as CommonFileEventType, FileChangeType} from 'vs/platform/files/common/files';
import {IModelService} from 'vs/editor/common/services/modelService';

class ServiceAccessor {
	constructor(
		@IEditorGroupService public editorGroupService: TestEditorGroupService,
		@IEventService public eventService: IEventService,
		@IModelService public modelService: IModelService
	) {
	}
}

function toResource(path: string): URI {
	return URI.file(join('C:\\', path));
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

suite('Files - TextFileEditorModelManager', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	test('add, remove, clear, get, getAll', function () {
		const manager: TextFileEditorModelManager = instantiationService.createInstance(TextFileEditorModelManager);

		const model1 = new EditorModel();
		const model2 = new EditorModel();
		const model3 = new EditorModel();

		manager.add(URI.file('/test.html'), <any>model1);
		manager.add(URI.file('/some/other.html'), <any>model2);
		manager.add(URI.file('/some/this.txt'), <any>model3);

		assert(!manager.get(URI.file('foo')));
		assert.strictEqual(manager.get(URI.file('/test.html')), model1);

		let result = manager.getAll();
		assert.strictEqual(3, result.length);

		result = manager.getAll(URI.file('/yes'));
		assert.strictEqual(0, result.length);

		result = manager.getAll(URI.file('/some/other.txt'));
		assert.strictEqual(0, result.length);

		result = manager.getAll(URI.file('/some/other.html'));
		assert.strictEqual(1, result.length);

		manager.remove(URI.file(''));

		result = manager.getAll();
		assert.strictEqual(3, result.length);

		manager.remove(URI.file('/test.html'));

		result = manager.getAll();
		assert.strictEqual(2, result.length);

		manager.clear();
		result = manager.getAll();
		assert.strictEqual(0, result.length);
	});

	test('loadOrCreate', function (done) {
		const manager: TextFileEditorModelManager = instantiationService.createInstance(TextFileEditorModelManager);
		const resource = URI.file('/test.html');
		const encoding = 'utf8';

		manager.loadOrCreate(resource, encoding, true).then(model => {
			assert.ok(model);
			assert.equal(model.getEncoding(), encoding);
			assert.equal(manager.get(resource), model);

			return manager.loadOrCreate(resource, encoding).then(model2 => {
				assert.equal(model2, model);

				model.dispose();

				return manager.loadOrCreate(resource, encoding).then(model3 => {
					assert.notEqual(model3, model2);
					assert.equal(manager.get(resource), model3);

					model3.dispose();

					done();
				});
			});
		});
	});

	test('removed from cache when model disposed', function () {
		const manager: TextFileEditorModelManager = instantiationService.createInstance(TextFileEditorModelManager);

		const model1 = new EditorModel();
		const model2 = new EditorModel();
		const model3 = new EditorModel();

		manager.add(URI.file('/test.html'), <any>model1);
		manager.add(URI.file('/some/other.html'), <any>model2);
		manager.add(URI.file('/some/this.txt'), <any>model3);

		assert.strictEqual(manager.get(URI.file('/test.html')), model1);

		model1.dispose();
		assert(!manager.get(URI.file('/test.html')));
	});

	test('disposes model when not open anymore', function () {
		const manager: TextFileEditorModelManager = instantiationService.createInstance(TextFileEditorModelManager);

		const resource = toResource('/path/index.txt');

		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, resource, 'utf8');
		manager.add(resource, model);

		const input = createFileInput(instantiationService, resource);

		const stacks = accessor.editorGroupService.getStacksModel();
		const group = stacks.openGroup('group', true);
		group.openEditor(input);

		accessor.editorGroupService.fireChange();

		assert.ok(!model.isDisposed());

		group.closeEditor(input);
		accessor.editorGroupService.fireChange();
		assert.ok(model.isDisposed());

		model.dispose();
		assert.ok(!accessor.modelService.getModel(model.getResource()));

		manager.dispose();
	});

	test('local file changes dispose model - delete', function () {
		const manager: TextFileEditorModelManager = instantiationService.createInstance(TextFileEditorModelManager);

		const resource = toResource('/path/index.txt');

		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, resource, 'utf8');
		manager.add(resource, model);

		assert.ok(!model.isDisposed());

		// delete event (local)
		accessor.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(toStat(resource)));

		assert.ok(model.isDisposed());

		model.dispose();
		assert.ok(!accessor.modelService.getModel(model.getResource()));

		manager.dispose();
	});

	test('local file changes dispose model - move', function () {
		const manager: TextFileEditorModelManager = instantiationService.createInstance(TextFileEditorModelManager);

		const resource = toResource('/path/index.txt');

		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, resource, 'utf8');
		manager.add(resource, model);

		assert.ok(!model.isDisposed());

		// move event (local)
		accessor.eventService.emit('files.internal:fileChanged', new LocalFileChangeEvent(toStat(resource), toStat(toResource('/path/index_moved.txt'))));

		assert.ok(model.isDisposed());
		assert.ok(!accessor.modelService.getModel(model.getResource()));

		manager.dispose();
	});

	test('file event delete dispose model', function () {
		const manager: TextFileEditorModelManager = instantiationService.createInstance(TextFileEditorModelManager);

		const resource = toResource('/path/index.txt');

		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, resource, 'utf8');
		manager.add(resource, model);

		assert.ok(!model.isDisposed());

		// delete event (watcher)
		accessor.eventService.emit(CommonFileEventType.FILE_CHANGES, new FileChangesEvent([{ resource, type: FileChangeType.DELETED }]));

		assert.ok(model.isDisposed());
		assert.ok(!accessor.modelService.getModel(model.getResource()));

		manager.dispose();
	});

	test('file change event dispose model if happening > 2 second after last save', function () {
		const manager: TextFileEditorModelManager = instantiationService.createInstance(TextFileEditorModelManager);

		const resource = toResource('/path/index.txt');

		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, resource, 'utf8');
		manager.add(resource, model);

		assert.ok(!model.isDisposed());

		// change event (watcher)
		accessor.eventService.emit(CommonFileEventType.FILE_CHANGES, new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }]));

		assert.ok(model.isDisposed());
		assert.ok(!accessor.modelService.getModel(model.getResource()));

		manager.dispose();
	});

	test('file change event does NOT dispose model if happening < 2 second after last save', function (done) {
		const manager: TextFileEditorModelManager = instantiationService.createInstance(TextFileEditorModelManager);

		const resource = toResource('/path/index.txt');

		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, resource, 'utf8');
		manager.add(resource, model);

		assert.ok(!model.isDisposed());

		model.load().then(resolved => {
			model.textEditorModel.setValue('changed');
			model.save().then(() => {

				// change event (watcher)
				accessor.eventService.emit(CommonFileEventType.FILE_CHANGES, new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }]));

				assert.ok(!model.isDisposed());

				model.dispose();
				assert.ok(!accessor.modelService.getModel(model.getResource()));

				manager.dispose();
				done();
			});
		});
	});

	test('events', function (done) {
		const manager: TextFileEditorModelManager = instantiationService.createInstance(TextFileEditorModelManager);

		const resource1 = toResource('/path/index.txt');
		const resource2 = toResource('/path/other.txt');

		let dirtyCounter = 0;
		let revertedCounter = 0;
		let savedCounter = 0;
		let encodingCounter = 0;

		manager.onModelDirty(e => {
			dirtyCounter++;
			assert.equal(e.resource.toString(), resource1.toString());
		});

		manager.onModelReverted(e => {
			revertedCounter++;
			assert.equal(e.resource.toString(), resource1.toString());
		});

		manager.onModelSaved(e => {
			savedCounter++;
			assert.equal(e.resource.toString(), resource1.toString());
		});

		manager.onModelEncodingChanged(e => {
			encodingCounter++;
			assert.equal(e.resource.toString(), resource1.toString());
		});

		manager.loadOrCreate(resource1, 'utf8').then(model1 => {
			return manager.loadOrCreate(resource2, 'utf8').then(model2 => {
				model1.textEditorModel.setValue('changed');
				model1.updatePreferredEncoding('utf16');

				return model1.revert().then(() => {
					model1.textEditorModel.setValue('changed again');

					return model1.save().then(() => {
						model1.dispose();
						model2.dispose();

						return model1.revert().then(() => { // should not trigger another event if disposed
							assert.equal(dirtyCounter, 2);
							assert.equal(revertedCounter, 1);
							assert.equal(savedCounter, 1);
							assert.equal(encodingCounter, 2);

							model1.dispose();
							model2.dispose();

							assert.ok(!accessor.modelService.getModel(resource1));
							assert.ok(!accessor.modelService.getModel(resource2));

							done();
						});
					});
				});
			});
		});
	});

	test('disposing model takes it out of the manager', function (done) {
		const manager: TextFileEditorModelManager = instantiationService.createInstance(TextFileEditorModelManager);

		const resource = toResource('/path/index_something.txt');

		manager.loadOrCreate(resource, 'utf8').then(model => {
			model.dispose();

			assert.ok(!manager.get(resource));
			assert.ok(!accessor.modelService.getModel(model.getResource()));

			manager.dispose();
			done();
		});
	});
});