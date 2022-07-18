/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { workbenchInstantiationService, TestServiceAccessor, TestTextFileEditorModelManager } from 'vs/workbench/test/browser/workbenchTestServices';
import { toResource } from 'vs/base/test/common/utils';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { FileOperation } from 'vs/platform/files/common/files';
import { DisposableStore } from 'vs/base/common/lifecycle';

suite('Files - TextFileService', () => {

	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;
	let model: TextFileEditorModel;
	let accessor: TestServiceAccessor;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
	});

	teardown(() => {
		model?.dispose();
		(<TestTextFileEditorModelManager>accessor.textFileService.files).dispose();
		disposables.dispose();
	});

	test('isDirty/getDirty - files and untitled', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.resolve();

		assert.ok(!accessor.textFileService.isDirty(model.resource));
		model.textEditorModel!.setValue('foo');

		assert.ok(accessor.textFileService.isDirty(model.resource));

		const untitled = await accessor.textFileService.untitled.resolve();

		assert.ok(!accessor.textFileService.isDirty(untitled.resource));
		untitled.textEditorModel?.setValue('changed');

		assert.ok(accessor.textFileService.isDirty(untitled.resource));

		untitled.dispose();
		model.dispose();
	});

	test('save - file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.resolve();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		const res = await accessor.textFileService.save(model.resource);
		assert.strictEqual(res?.toString(), model.resource.toString());
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('saveAll - file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.resolve();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		const res = await accessor.textFileService.save(model.resource);
		assert.strictEqual(res?.toString(), model.resource.toString());
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('saveAs - file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);
		accessor.fileDialogService.setPickFileToSave(model.resource);

		await model.resolve();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		const res = await accessor.textFileService.saveAs(model.resource);
		assert.strictEqual(res!.toString(), model.resource.toString());
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('revert - file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);
		accessor.fileDialogService.setPickFileToSave(model.resource);

		await model.resolve();
		model!.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		await accessor.textFileService.revert(model.resource);
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('create does not overwrite existing model', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.resolve();
		model!.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		let eventCounter = 0;

		const disposable1 = accessor.workingCopyFileService.addFileOperationParticipant({
			participate: async files => {
				assert.strictEqual(files[0].target.toString(), model.resource.toString());
				eventCounter++;
			}
		});

		const disposable2 = accessor.workingCopyFileService.onDidRunWorkingCopyFileOperation(e => {
			assert.strictEqual(e.operation, FileOperation.CREATE);
			assert.strictEqual(e.files[0].target.toString(), model.resource.toString());
			eventCounter++;
		});

		await accessor.textFileService.create([{ resource: model.resource, value: 'Foo' }]);
		assert.ok(!accessor.textFileService.isDirty(model.resource));

		assert.strictEqual(eventCounter, 2);

		disposable1.dispose();
		disposable2.dispose();
	});

	test('Filename Suggestion - Suggest prefix only when there are no relevant extensions', () => {
		const registration = accessor.languageService.registerLanguage({
			id: 'plumbus0',
			extensions: ['.one', '.two']
		});

		const suggested = accessor.textFileService.suggestFilename('shleem', 'Untitled-1');
		assert.strictEqual(suggested, 'Untitled-1');
		registration.dispose();
	});

	test('Filename Suggestion - Suggest prefix with first extension', () => {
		const registration = accessor.languageService.registerLanguage({
			id: 'plumbus1',
			extensions: ['.shleem', '.gazorpazorp'],
			filenames: ['plumbus']
		});

		const suggested = accessor.textFileService.suggestFilename('plumbus1', 'Untitled-1');
		assert.strictEqual(suggested, 'Untitled-1.shleem');
		registration.dispose();
	});

	test('Filename Suggestion - Suggest filename if there are no extensions', () => {
		const registration = accessor.languageService.registerLanguage({
			id: 'plumbus2',
			filenames: ['plumbus', 'shleem', 'gazorpazorp']
		});

		const suggested = accessor.textFileService.suggestFilename('plumbus2', 'Untitled-1');
		assert.strictEqual(suggested, 'plumbus');
		registration.dispose();
	});
});
