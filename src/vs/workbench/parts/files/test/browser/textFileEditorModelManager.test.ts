/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import {TestInstantiationService} from 'vs/test/utils/instantiationTestUtils';
import {TextFileEditorModelManager} from 'vs/workbench/parts/files/common/editors/textFileEditorModelManager';
import {EditorModel} from 'vs/workbench/common/editor';
import {join} from 'vs/base/common/paths';
import {workbenchInstantiationService, TestEditorGroupService} from 'vs/test/utils/servicesTestUtils';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {FileEditorInput} from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import {TextFileEditorModel} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';

class ServiceAccessor {
	constructor(@IEditorGroupService public editorGroupService: TestEditorGroupService) {
	}
}

function toResource(path) {
	return URI.file(join('C:\\', path));
}

suite('Files - TextFileEditorModelManager', () => {

	let instantiationService: TestInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	test('add, remove, clear, get, getAll', function () {
		const manager = instantiationService.createInstance(TextFileEditorModelManager);

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

	test('removed from cache when model disposed', function () {
		const manager = instantiationService.createInstance(TextFileEditorModelManager);

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
		const manager:TextFileEditorModelManager = instantiationService.createInstance(TextFileEditorModelManager);

		const resource = toResource('/path/index.txt');

		const model:TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, resource, 'utf8');
		manager.add(resource, model);

		const input = instantiationService.createInstance(FileEditorInput, resource, 'text/plain', void 0);

		const stacks = accessor.editorGroupService.getStacksModel();
		const group = stacks.openGroup('group', true);
		group.openEditor(input);

		accessor.editorGroupService.fireChange();

		assert.ok(!model.isDisposed());

		group.closeEditor(input);
		accessor.editorGroupService.fireChange();
		assert.ok(model.isDisposed());

		manager.dispose();
	});
});