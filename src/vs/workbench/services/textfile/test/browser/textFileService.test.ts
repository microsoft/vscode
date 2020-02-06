/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { TestLifecycleService, TestContextService, TestFileService, TestFilesConfigurationService, TestFileDialogService, TestTextFileService, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { toResource } from 'vs/base/test/common/utils';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService } from 'vs/platform/files/common/files';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';

class ServiceAccessor {
	constructor(
		@ILifecycleService public lifecycleService: TestLifecycleService,
		@ITextFileService public textFileService: TestTextFileService,
		@IFilesConfigurationService public filesConfigurationService: TestFilesConfigurationService,
		@IWorkspaceContextService public contextService: TestContextService,
		@IModelService public modelService: ModelServiceImpl,
		@IFileService public fileService: TestFileService,
		@IFileDialogService public fileDialogService: TestFileDialogService
	) {
	}
}

suite('Files - TextFileService', () => {

	let instantiationService: IInstantiationService;
	let model: TextFileEditorModel;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	teardown(() => {
		if (model) {
			model.dispose();
		}
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

		const res = await accessor.textFileService.revert(model.resource);
		assert.ok(res);
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('create', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.load();
		model!.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));


		await accessor.textFileService.create(model.resource, 'Foo');
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('delete - dirty file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.load();
		model!.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(model.resource));

		await accessor.textFileService.delete(model.resource);
		assert.ok(!accessor.textFileService.isDirty(model.resource));
	});

	test('move - dirty file', async function () {
		await testMoveOrCopy(toResource.call(this, '/path/file.txt'), toResource.call(this, '/path/file_target.txt'), true);
	});

	test('move - dirty file (target exists and is dirty)', async function () {
		await testMoveOrCopy(toResource.call(this, '/path/file.txt'), toResource.call(this, '/path/file_target.txt'), true, true);
	});

	test('copy - dirty file', async function () {
		await testMoveOrCopy(toResource.call(this, '/path/file.txt'), toResource.call(this, '/path/file_target.txt'), false);
	});

	test('copy - dirty file (target exists and is dirty)', async function () {
		await testMoveOrCopy(toResource.call(this, '/path/file.txt'), toResource.call(this, '/path/file_target.txt'), false, true);
	});

	async function testMoveOrCopy(source: URI, target: URI, move: boolean, targetDirty?: boolean): Promise<void> {
		let sourceModel: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, source, 'utf8', undefined);
		let targetModel: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, target, 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.files).add(sourceModel.resource, sourceModel);
		(<TextFileEditorModelManager>accessor.textFileService.files).add(targetModel.resource, targetModel);

		await sourceModel.load();
		sourceModel.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(sourceModel.resource));

		if (targetDirty) {
			await targetModel.load();
			targetModel.textEditorModel!.setValue('bar');
			assert.ok(accessor.textFileService.isDirty(targetModel.resource));
		}

		if (move) {
			await accessor.textFileService.move(sourceModel.resource, targetModel.resource, true);
		} else {
			await accessor.textFileService.copy(sourceModel.resource, targetModel.resource, true);
		}

		assert.equal(targetModel.textEditorModel!.getValue(), 'foo');

		if (move) {
			assert.ok(!accessor.textFileService.isDirty(sourceModel.resource));
		} else {
			assert.ok(accessor.textFileService.isDirty(sourceModel.resource));
		}
		assert.ok(accessor.textFileService.isDirty(targetModel.resource));

		sourceModel.dispose();
		targetModel.dispose();
	}
});
