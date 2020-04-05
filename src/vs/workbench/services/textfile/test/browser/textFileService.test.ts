/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { workbenchInstantiationService, TestServiceAccessor } from 'vs/workbench/test/browser/workbenchTestServices';
import { toResource } from 'vs/base/test/common/utils';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';

suite('Files - TextFileService', () => {

	let instantiationService: IInstantiationService;
	let model: TextFileEditorModel;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(TestServiceAccessor);
	});

	teardown(() => {
		model?.dispose();
		(<TextFileEditorModelManager>accessor.textFileService.files).dispose();
	});

	test('isDirty/getDirty - files and untitled', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.load();

		assert.ok(!accessor.textFileService.isDirty(model.resource));
		model.textEditorModel!.setValue('foo');

		assert.ok(accessor.textFileService.isDirty(model.resource));

		const untitled = await accessor.textFileService.untitled.resolve();

		assert.ok(!accessor.textFileService.isDirty(untitled.resource));
		untitled.textEditorModel.setValue('changed');

		assert.ok(accessor.textFileService.isDirty(untitled.resource));

		untitled.dispose();
		model.dispose();
	});

	test('save - file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.load();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		const res = await accessor.textFileService.save(model.resource);
		assert.equal(res?.toString(), model.resource.toString());
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('saveAll - file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.load();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		const res = await accessor.textFileService.save(model.resource);
		assert.equal(res?.toString(), model.resource.toString());
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('saveAs - file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);
		accessor.fileDialogService.setPickFileToSave(model.resource);

		await model.load();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		const res = await accessor.textFileService.saveAs(model.resource);
		assert.equal(res!.toString(), model.resource.toString());
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('revert - file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);
		accessor.fileDialogService.setPickFileToSave(model.resource);

		await model.load();
		model!.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		await accessor.textFileService.revert(model.resource);
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('create', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.load();
		model!.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		let eventCounter = 0;

		const disposable1 = accessor.workingCopyFileService.addFileOperationParticipant({
			participate: async target => {
				assert.equal(target.toString(), model.resource.toString());
				eventCounter++;
			}
		});

		const disposable2 = accessor.textFileService.onDidCreateTextFile(e => {
			assert.equal(e.resource.toString(), model.resource.toString());
			eventCounter++;
		});

		await accessor.textFileService.create(model.resource, 'Foo');
		assert.ok(!accessor.textFileService.isDirty(model.resource));

		assert.equal(eventCounter, 2);

		disposable1.dispose();
		disposable2.dispose();
	});
});
