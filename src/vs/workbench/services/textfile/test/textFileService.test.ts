/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import { URI } from 'vs/base/common/uri';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { workbenchInstantiationService, TestLifecycleService, TestTextFileService, TestContextService, TestFileService, TestElectronService, TestFilesConfigurationService, TestFileDialogService } from 'vs/workbench/test/workbenchTestServices';
import { toResource } from 'vs/base/test/common/utils';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { IFileService } from 'vs/platform/files/common/files';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { Schemas } from 'vs/base/common/network';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';

class ServiceAccessor {
	constructor(
		@ILifecycleService public lifecycleService: TestLifecycleService,
		@ITextFileService public textFileService: TestTextFileService,
		@IFilesConfigurationService public filesConfigurationService: TestFilesConfigurationService,
		@IUntitledTextEditorService public untitledTextEditorService: IUntitledTextEditorService,
		@IWorkspaceContextService public contextService: TestContextService,
		@IModelService public modelService: ModelServiceImpl,
		@IFileService public fileService: TestFileService,
		@IElectronService public electronService: TestElectronService,
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
		(<TextFileEditorModelManager>accessor.textFileService.models).dispose();
		accessor.untitledTextEditorService.revertAll();
	});

	test('isDirty/getDirty - files and untitled', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.resource, model);

		const service = accessor.textFileService;

		await model.load();

		assert.ok(!service.isDirty(model.resource));
		model.textEditorModel!.setValue('foo');

		assert.ok(service.isDirty(model.resource));
		assert.equal(service.getDirty().length, 1);
		assert.equal(service.getDirty([model.resource])[0].toString(), model.resource.toString());

		const untitled = accessor.untitledTextEditorService.createOrGet();
		const untitledModel = await untitled.resolve();

		assert.ok(!service.isDirty(untitled.getResource()));
		assert.equal(service.getDirty().length, 1);
		untitledModel.textEditorModel!.setValue('changed');

		assert.ok(service.isDirty(untitled.getResource()));
		assert.equal(service.getDirty().length, 2);
		assert.equal(service.getDirty([untitled.getResource()])[0].toString(), untitled.getResource().toString());
	});

	test('save - file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.resource, model);

		const service = accessor.textFileService;

		await model.load();
		model.textEditorModel!.setValue('foo');
		assert.ok(service.isDirty(model.resource));

		const res = await service.save(model.resource);
		assert.ok(res);
		assert.ok(!service.isDirty(model.resource));
	});

	test('save - UNC path', async function () {
		const untitledUncUri = URI.from({ scheme: 'untitled', authority: 'server', path: '/share/path/file.txt' });
		model = instantiationService.createInstance(TextFileEditorModel, untitledUncUri, 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.resource, model);

		const mockedFileUri = untitledUncUri.with({ scheme: Schemas.file });
		const mockedEditorInput = instantiationService.createInstance(TextFileEditorModel, mockedFileUri, 'utf8', undefined);
		const loadOrCreateStub = sinon.stub(accessor.textFileService.models, 'loadOrCreate', () => Promise.resolve(mockedEditorInput));

		sinon.stub(accessor.untitledTextEditorService, 'exists', () => true);
		sinon.stub(accessor.untitledTextEditorService, 'hasAssociatedFilePath', () => true);
		sinon.stub(accessor.modelService, 'updateModel', () => { });

		await model.load();
		model.textEditorModel!.setValue('foo');

		const res = await accessor.textFileService.saveAll(true);
		assert.ok(loadOrCreateStub.calledOnce);
		assert.equal(res.results.length, 1);
		assert.ok(!res.results[0].error);
		assert.equal(res.results[0].target!.scheme, Schemas.file);
		assert.equal(res.results[0].target!.authority, untitledUncUri.authority);
		assert.equal(res.results[0].target!.path, untitledUncUri.path);
	});

	test('saveAll - file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.resource, model);

		const service = accessor.textFileService;

		await model.load();
		model.textEditorModel!.setValue('foo');
		assert.ok(service.isDirty(model.resource));

		const res = await service.saveAll([model.resource]);
		assert.ok(res);
		assert.ok(!service.isDirty(model.resource));
		assert.equal(res.results.length, 1);
		assert.equal(res.results[0].source.toString(), model.resource.toString());
	});

	test('saveAs - file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.resource, model);

		const service = accessor.textFileService;
		service.setPromptPath(model.resource);

		await model.load();
		model.textEditorModel!.setValue('foo');
		assert.ok(service.isDirty(model.resource));

		const res = await service.saveAs(model.resource);
		assert.equal(res!.toString(), model.resource.toString());
		assert.ok(!service.isDirty(model.resource));
	});

	test('revert - file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.resource, model);

		const service = accessor.textFileService;
		service.setPromptPath(model.resource);

		await model.load();
		model!.textEditorModel!.setValue('foo');
		assert.ok(service.isDirty(model.resource));

		const res = await service.revert(model.resource);
		assert.ok(res);
		assert.ok(!service.isDirty(model.resource));
	});

	test('delete - dirty file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.resource, model);

		const service = accessor.textFileService;

		await model.load();
		model!.textEditorModel!.setValue('foo');
		assert.ok(service.isDirty(model.resource));

		await service.delete(model.resource);
		assert.ok(!service.isDirty(model.resource));
	});

	test('move - dirty file', async function () {
		await testMove(toResource.call(this, '/path/file.txt'), toResource.call(this, '/path/file_target.txt'));
	});

	test('move - dirty file (target exists and is dirty)', async function () {
		await testMove(toResource.call(this, '/path/file.txt'), toResource.call(this, '/path/file_target.txt'), true);
	});

	async function testMove(source: URI, target: URI, targetDirty?: boolean): Promise<void> {
		let sourceModel: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, source, 'utf8', undefined);
		let targetModel: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, target, 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(sourceModel.resource, sourceModel);
		(<TextFileEditorModelManager>accessor.textFileService.models).add(targetModel.resource, targetModel);

		const service = accessor.textFileService;

		await sourceModel.load();
		sourceModel.textEditorModel!.setValue('foo');
		assert.ok(service.isDirty(sourceModel.resource));

		if (targetDirty) {
			await targetModel.load();
			targetModel.textEditorModel!.setValue('bar');
			assert.ok(service.isDirty(targetModel.resource));
		}

		await service.move(sourceModel.resource, targetModel.resource, true);

		assert.equal(targetModel.textEditorModel!.getValue(), 'foo');

		assert.ok(!service.isDirty(sourceModel.resource));
		assert.ok(service.isDirty(targetModel.resource));

		sourceModel.dispose();
		targetModel.dispose();
	}
});
