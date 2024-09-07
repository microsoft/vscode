/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { workbenchInstantiationService, TestServiceAccessor, ITestTextFileEditorModelManager } from '../../../../test/browser/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TextFileEditorModel } from '../../common/textFileEditorModel.js';
import { FileOperation } from '../../../../../platform/files/common/files.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

suite('Files - TextFileService', () => {

	const disposables = new DisposableStore();
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
		disposables.add(<ITestTextFileEditorModelManager>accessor.textFileService.files);
	});

	teardown(() => {
		disposables.clear();
	});

	test('isDirty/getDirty - files and untitled', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.resolve();

		assert.ok(!accessor.textFileService.isDirty(model.resource));
		model.textEditorModel!.setValue('foo');

		assert.ok(accessor.textFileService.isDirty(model.resource));

		const untitled = disposables.add(await accessor.textFileService.untitled.resolve());

		assert.ok(!accessor.textFileService.isDirty(untitled.resource));
		untitled.textEditorModel?.setValue('changed');

		assert.ok(accessor.textFileService.isDirty(untitled.resource));
	});

	test('save - file', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.resolve();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		const res = await accessor.textFileService.save(model.resource);
		assert.strictEqual(res?.toString(), model.resource.toString());
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('saveAll - file', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.resolve();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		const res = await accessor.textFileService.save(model.resource);
		assert.strictEqual(res?.toString(), model.resource.toString());
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('saveAs - file', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);
		accessor.fileDialogService.setPickFileToSave(model.resource);

		await model.resolve();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		const res = await accessor.textFileService.saveAs(model.resource);
		assert.strictEqual(res!.toString(), model.resource.toString());
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('revert - file', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);
		accessor.fileDialogService.setPickFileToSave(model.resource);

		await model.resolve();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		await accessor.textFileService.revert(model.resource);
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('create does not overwrite existing model', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.resolve();
		model.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		let eventCounter = 0;

		disposables.add(accessor.workingCopyFileService.addFileOperationParticipant({
			participate: async files => {
				assert.strictEqual(files[0].target.toString(), model.resource.toString());
				eventCounter++;
			}
		}));

		disposables.add(accessor.workingCopyFileService.onDidRunWorkingCopyFileOperation(e => {
			assert.strictEqual(e.operation, FileOperation.CREATE);
			assert.strictEqual(e.files[0].target.toString(), model.resource.toString());
			eventCounter++;
		}));

		await accessor.textFileService.create([{ resource: model.resource, value: 'Foo' }]);
		assert.ok(!accessor.textFileService.isDirty(model.resource));

		assert.strictEqual(eventCounter, 2);
	});

	test('Filename Suggestion - Suggest prefix only when there are no relevant extensions', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus0',
			extensions: ['.one', '.two']
		}));

		const suggested = accessor.textFileService.suggestFilename('shleem', 'Untitled-1');
		assert.strictEqual(suggested, 'Untitled-1');
	});

	test('Filename Suggestion - Suggest prefix with first extension', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus1',
			extensions: ['.shleem', '.gazorpazorp'],
			filenames: ['plumbus']
		}));

		const suggested = accessor.textFileService.suggestFilename('plumbus1', 'Untitled-1');
		assert.strictEqual(suggested, 'Untitled-1.shleem');
	});

	test('Filename Suggestion - Preserve extension if it matchers', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus2',
			extensions: ['.shleem', '.gazorpazorp'],
		}));

		const suggested = accessor.textFileService.suggestFilename('plumbus2', 'Untitled-1.gazorpazorp');
		assert.strictEqual(suggested, 'Untitled-1.gazorpazorp');
	});

	test('Filename Suggestion - Rewrite extension according to language', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus2',
			extensions: ['.shleem', '.gazorpazorp'],
		}));

		const suggested = accessor.textFileService.suggestFilename('plumbus2', 'Untitled-1.foobar');
		assert.strictEqual(suggested, 'Untitled-1.shleem');
	});

	test('Filename Suggestion - Suggest filename if there are no extensions', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus2',
			filenames: ['plumbus', 'shleem', 'gazorpazorp']
		}));

		const suggested = accessor.textFileService.suggestFilename('plumbus2', 'Untitled-1');
		assert.strictEqual(suggested, 'plumbus');
	});

	test('Filename Suggestion - Preserve filename if it matches', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus2',
			filenames: ['plumbus', 'shleem', 'gazorpazorp']
		}));

		const suggested = accessor.textFileService.suggestFilename('plumbus2', 'gazorpazorp');
		assert.strictEqual(suggested, 'gazorpazorp');
	});

	test('Filename Suggestion - Rewrites filename according to language', () => {
		disposables.add(accessor.languageService.registerLanguage({
			id: 'plumbus2',
			filenames: ['plumbus', 'shleem', 'gazorpazorp']
		}));

		const suggested = accessor.textFileService.suggestFilename('plumbus2', 'foobar');
		assert.strictEqual(suggested, 'plumbus');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
