/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { workbenchInstantiationService, TestFileService } from 'vs/workbench/test/workbenchTestServices';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { IFileService, FileChangesEvent, FileChangeType } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/modelService';
import { timeout } from 'vs/base/common/async';
import { toResource } from 'vs/base/test/common/utils';
import { ModesRegistry, PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';

export class TestTextFileEditorModelManager extends TextFileEditorModelManager {

	protected debounceDelay(): number {
		return 10;
	}
}

class ServiceAccessor {
	constructor(
		@IFileService public fileService: TestFileService,
		@IModelService public modelService: IModelService
	) {
	}
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

		const model1: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/random1.txt'), 'utf8', undefined);
		const model2: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/random2.txt'), 'utf8', undefined);
		const model3: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/random3.txt'), 'utf8', undefined);

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

	test('loadOrCreate', async () => {
		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);
		const resource = URI.file('/test.html');
		const encoding = 'utf8';

		const model = await manager.loadOrCreate(resource, { encoding });
		assert.ok(model);
		assert.equal(model.getEncoding(), encoding);
		assert.equal(manager.get(resource), model);

		const model2 = await manager.loadOrCreate(resource, { encoding });
		assert.equal(model2, model);
		model.dispose();

		const model3 = await manager.loadOrCreate(resource, { encoding });
		assert.notEqual(model3, model2);
		assert.equal(manager.get(resource), model3);
		model3.dispose();
	});

	test('removed from cache when model disposed', function () {
		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);

		const model1: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/random1.txt'), 'utf8', undefined);
		const model2: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/random2.txt'), 'utf8', undefined);
		const model3: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/random3.txt'), 'utf8', undefined);

		manager.add(URI.file('/test.html'), model1);
		manager.add(URI.file('/some/other.html'), model2);
		manager.add(URI.file('/some/this.txt'), model3);

		assert.strictEqual(manager.get(URI.file('/test.html')), model1);

		model1.dispose();
		assert(!manager.get(URI.file('/test.html')));

		model2.dispose();
		model3.dispose();
	});

	test('events', async function () {
		TextFileEditorModel.DEFAULT_CONTENT_CHANGE_BUFFER_DELAY = 0;
		TextFileEditorModel.DEFAULT_ORPHANED_CHANGE_BUFFER_DELAY = 0;

		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);

		const resource1 = toResource.call(this, '/path/index.txt');
		const resource2 = toResource.call(this, '/path/other.txt');

		let dirtyCounter = 0;
		let revertedCounter = 0;
		let savedCounter = 0;
		let encodingCounter = 0;
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

		manager.onModelContentChanged(e => {
			if (e.resource.toString() === resource1.toString()) {
				contentCounter++;
			}
		});

		manager.onModelDisposed(e => {
			disposeCounter++;
		});

		const model1 = await manager.loadOrCreate(resource1, { encoding: 'utf8' });
		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.DELETED }]));
		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.ADDED }]));

		const model2 = await manager.loadOrCreate(resource2, { encoding: 'utf8' });
		model1.textEditorModel!.setValue('changed');
		model1.updatePreferredEncoding('utf16');

		await model1.revert();
		model1.textEditorModel!.setValue('changed again');

		await model1.save();
		model1.dispose();
		model2.dispose();
		assert.equal(disposeCounter, 2);

		await model1.revert();
		assert.equal(dirtyCounter, 2);
		assert.equal(revertedCounter, 1);
		assert.equal(savedCounter, 1);
		assert.equal(encodingCounter, 2);

		await timeout(10);
		assert.equal(contentCounter, 2);
		model1.dispose();
		model2.dispose();
		assert.ok(!accessor.modelService.getModel(resource1));
		assert.ok(!accessor.modelService.getModel(resource2));
	});

	test('events debounced', async function () {
		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);

		const resource1 = toResource.call(this, '/path/index.txt');
		const resource2 = toResource.call(this, '/path/other.txt');

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

		const model1 = await manager.loadOrCreate(resource1, { encoding: 'utf8' });
		const model2 = await manager.loadOrCreate(resource2, { encoding: 'utf8' });
		model1.textEditorModel!.setValue('changed');
		model1.updatePreferredEncoding('utf16');

		await model1.revert();
		model1.textEditorModel!.setValue('changed again');

		await model1.save();
		model1.dispose();
		model2.dispose();

		await model1.revert();
		await timeout(20);
		assert.equal(dirtyCounter, 2);
		assert.equal(revertedCounter, 1);
		assert.equal(savedCounter, 1);
		model1.dispose();
		model2.dispose();
		assert.ok(!accessor.modelService.getModel(resource1));
		assert.ok(!accessor.modelService.getModel(resource2));
	});

	test('disposing model takes it out of the manager', async function () {
		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);

		const resource = toResource.call(this, '/path/index_something.txt');

		const model = await manager.loadOrCreate(resource, { encoding: 'utf8' });
		model.dispose();
		assert.ok(!manager.get(resource));
		assert.ok(!accessor.modelService.getModel(model.getResource()));
		manager.dispose();
	});

	test('dispose prevents dirty model from getting disposed', async function () {
		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);

		const resource = toResource.call(this, '/path/index_something.txt');

		const model = await manager.loadOrCreate(resource, { encoding: 'utf8' });
		model.textEditorModel!.setValue('make dirty');
		manager.disposeModel((model as TextFileEditorModel));
		assert.ok(!model.isDisposed());
		model.revert(true);
		manager.disposeModel((model as TextFileEditorModel));
		assert.ok(model.isDisposed());
		manager.dispose();
	});

	test('mode', async function () {
		const mode = 'text-file-model-manager-test';
		ModesRegistry.registerLanguage({
			id: mode,
		});

		const manager: TestTextFileEditorModelManager = instantiationService.createInstance(TestTextFileEditorModelManager);

		const resource = toResource.call(this, '/path/index_something.txt');

		let model = await manager.loadOrCreate(resource, { mode });
		assert.equal(model.textEditorModel!.getModeId(), mode);

		model = await manager.loadOrCreate(resource, { mode: 'text' });
		assert.equal(model.textEditorModel!.getModeId(), PLAINTEXT_MODE_ID);

		manager.disposeModel((model as TextFileEditorModel));
		manager.dispose();
	});
});