/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { join } from 'vs/base/common/paths';
import { workbenchInstantiationService, TestEditorGroupService, createFileInput, TestFileService } from 'vs/workbench/test/workbenchTestServices';
import { onError } from 'vs/base/test/common/utils';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { IFileService, FileChangesEvent, FileChangeType } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/modelService';

export class TestTextFileEditorModelManager extends TextFileEditorModelManager {

	protected debounceDelay(): number {
		return 10;
	}
}

class ServiceAccessor {
	constructor(
		@IEditorGroupService public editorGroupService: TestEditorGroupService,
		@IFileService public fileService: TestFileService,
		@IModelService public modelService: IModelService
	) {
	}
}

function toResource(path: string): URI {
	return URI.file(join('C:\\', path));
}

suite('Files - TextFileEditorModelManager', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	test('add, remove, clear, get, getAll', function () {
		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);

		const model1: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource('/path/random1.txt'), 'utf8');
		const model2: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource('/path/random2.txt'), 'utf8');
		const model3: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource('/path/random3.txt'), 'utf8');

		manager.add(URI.file('/test.html'), model1);
		manager.add(URI.file('/some/other.html'), model2);
		manager.add(URI.file('/some/this.txt'), model3);

		const fileUpper = URI.file('/TEST.html');

		assert(!manager.get(URI.file('foo')));
		assert.strictEqual(manager.get(URI.file('/test.html')), model1);

		assert.ok(!manager.get(fileUpper));

		let result = manager.getAll();
		assert.strictEqual(3, result.length);

		result = manager.getAll(URI.file('/yes'));
		assert.strictEqual(0, result.length);

		result = manager.getAll(URI.file('/some/other.txt'));
		assert.strictEqual(0, result.length);

		result = manager.getAll(URI.file('/some/other.html'));
		assert.strictEqual(1, result.length);

		result = manager.getAll(fileUpper);
		assert.strictEqual(0, result.length);

		manager.remove(URI.file(''));

		result = manager.getAll();
		assert.strictEqual(3, result.length);

		manager.remove(URI.file('/some/other.html'));
		result = manager.getAll();
		assert.strictEqual(2, result.length);

		manager.remove(fileUpper);
		result = manager.getAll();
		assert.strictEqual(2, result.length);

		manager.clear();
		result = manager.getAll();
		assert.strictEqual(0, result.length);

		model1.dispose();
		model2.dispose();
		model3.dispose();
	});

	test('loadOrCreate', function (done) {
		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);
		const resource = URI.file('/test.html');
		const encoding = 'utf8';

		manager.loadOrCreate(resource, encoding, true).done(model => {
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
		}, error => onError(error, done));
	});

	test('removed from cache when model disposed', function () {
		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);

		const model1: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource('/path/random1.txt'), 'utf8');
		const model2: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource('/path/random2.txt'), 'utf8');
		const model3: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource('/path/random3.txt'), 'utf8');

		manager.add(URI.file('/test.html'), model1);
		manager.add(URI.file('/some/other.html'), model2);
		manager.add(URI.file('/some/this.txt'), model3);

		assert.strictEqual(manager.get(URI.file('/test.html')), model1);

		model1.dispose();
		assert(!manager.get(URI.file('/test.html')));

		model2.dispose();
		model3.dispose();
	});

	test('disposes model when not open anymore', function () {
		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);

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

	test('events', function (done) {
		TextFileEditorModel.DEFAULT_CONTENT_CHANGE_BUFFER_DELAY = 0;
		TextFileEditorModel.DEFAULT_ORPHANED_CHANGE_BUFFER_DELAY = 0;

		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);

		const resource1 = toResource('/path/index.txt');
		const resource2 = toResource('/path/other.txt');

		let dirtyCounter = 0;
		let revertedCounter = 0;
		let savedCounter = 0;
		let encodingCounter = 0;
		let orphanedCounter = 0;
		let disposeCounter = 0;
		let contentCounter = 0;

		manager.onModelDirty(e => {
			if (e.resource.toString() === resource1.toString()) {
				dirtyCounter++;
			}
		});

		manager.onModelReverted(e => {
			if (e.resource.toString() === resource1.toString()) {
				revertedCounter++;
			}
		});

		manager.onModelSaved(e => {
			if (e.resource.toString() === resource1.toString()) {
				savedCounter++;
			}
		});

		manager.onModelEncodingChanged(e => {
			if (e.resource.toString() === resource1.toString()) {
				encodingCounter++;
			}
		});

		manager.onModelOrphanedChanged(e => {
			if (e.resource.toString() === resource1.toString()) {
				orphanedCounter++;
			}
		});

		manager.onModelContentChanged(e => {
			if (e.resource.toString() === resource1.toString()) {
				contentCounter++;
			}
		});

		manager.onModelDisposed(e => {
			disposeCounter++;
		});

		manager.loadOrCreate(resource1, 'utf8').done(model1 => {
			accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.DELETED }]));
			accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.ADDED }]));

			return manager.loadOrCreate(resource2, 'utf8').then(model2 => {
				model1.textEditorModel.setValue('changed');
				model1.updatePreferredEncoding('utf16');

				return model1.revert().then(() => {
					model1.textEditorModel.setValue('changed again');

					return model1.save().then(() => {
						model1.dispose();
						model2.dispose();
						assert.equal(disposeCounter, 2);

						return model1.revert().then(() => { // should not trigger another event if disposed
							assert.equal(dirtyCounter, 2);
							assert.equal(revertedCounter, 1);
							assert.equal(savedCounter, 1);
							assert.equal(encodingCounter, 2);

							// content change event if done async
							TPromise.timeout(10).then(() => {
								assert.equal(contentCounter, 2);
								assert.equal(orphanedCounter, 1);

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
		}, error => onError(error, done));
	});

	test('events debounced', function (done) {
		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);

		const resource1 = toResource('/path/index.txt');
		const resource2 = toResource('/path/other.txt');

		let dirtyCounter = 0;
		let revertedCounter = 0;
		let savedCounter = 0;

		TextFileEditorModel.DEFAULT_CONTENT_CHANGE_BUFFER_DELAY = 0;

		manager.onModelsDirty(e => {
			dirtyCounter += e.length;
			assert.equal(e[0].resource.toString(), resource1.toString());
		});

		manager.onModelsReverted(e => {
			revertedCounter += e.length;
			assert.equal(e[0].resource.toString(), resource1.toString());
		});

		manager.onModelsSaved(e => {
			savedCounter += e.length;
			assert.equal(e[0].resource.toString(), resource1.toString());
		});

		manager.loadOrCreate(resource1, 'utf8').done(model1 => {
			return manager.loadOrCreate(resource2, 'utf8').then(model2 => {
				model1.textEditorModel.setValue('changed');
				model1.updatePreferredEncoding('utf16');

				return model1.revert().then(() => {
					model1.textEditorModel.setValue('changed again');

					return model1.save().then(() => {
						model1.dispose();
						model2.dispose();

						return model1.revert().then(() => { // should not trigger another event if disposed
							return TPromise.timeout(20).then(() => {
								assert.equal(dirtyCounter, 2);
								assert.equal(revertedCounter, 1);
								assert.equal(savedCounter, 1);

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
		}, error => onError(error, done));
	});

	test('disposing model takes it out of the manager', function (done) {
		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);

		const resource = toResource('/path/index_something.txt');

		manager.loadOrCreate(resource, 'utf8').done(model => {
			model.dispose();

			assert.ok(!manager.get(resource));
			assert.ok(!accessor.modelService.getModel(model.getResource()));

			manager.dispose();
			done();
		}, error => onError(error, done));
	});
});