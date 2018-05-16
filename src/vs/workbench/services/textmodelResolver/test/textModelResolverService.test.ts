/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { ITextModel } from 'vs/editor/common/model';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { workbenchInstantiationService, TestTextFileService } from 'vs/workbench/test/workbenchTestServices';
import { toResource } from 'vs/base/test/common/utils';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { once } from 'vs/base/common/event';
import { snapshotToString } from 'vs/platform/files/common/files';

class ServiceAccessor {
	constructor(
		@ITextModelService public textModelResolverService: ITextModelService,
		@IModelService public modelService: IModelService,
		@IModeService public modeService: IModeService,
		@ITextFileService public textFileService: TestTextFileService,
		@IUntitledEditorService public untitledEditorService: IUntitledEditorService
	) {
	}
}

suite('Workbench - TextModelResolverService', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;
	let model: TextFileEditorModel;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	teardown(() => {
		if (model) {
			model.dispose();
			model = void 0;
		}
		(<TextFileEditorModelManager>accessor.textFileService.models).clear();
		(<TextFileEditorModelManager>accessor.textFileService.models).dispose();
		accessor.untitledEditorService.revertAll();
	});

	test('resolve resource', function () {
		const dispose = accessor.textModelResolverService.registerTextModelContentProvider('test', {
			provideTextContent: function (resource: URI): TPromise<ITextModel> {
				if (resource.scheme === 'test') {
					let modelContent = 'Hello Test';
					let mode = accessor.modeService.getOrCreateMode('json');
					return TPromise.as(accessor.modelService.createModel(modelContent, mode, resource));
				}

				return TPromise.as(null);
			}
		});

		let resource = URI.from({ scheme: 'test', authority: null, path: 'thePath' });
		let input: ResourceEditorInput = instantiationService.createInstance(ResourceEditorInput, 'The Name', 'The Description', resource);

		return input.resolve().then(model => {
			assert.ok(model);
			assert.equal(snapshotToString((model as ResourceEditorModel).createSnapshot()), 'Hello Test');

			let disposed = false;
			once(model.onDispose)(() => {
				disposed = true;
			});

			input.dispose();
			assert.equal(disposed, true);

			dispose.dispose();
		});
	});

	test('resolve file', function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file_resolver.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		return model.load().then(() => {
			return accessor.textModelResolverService.createModelReference(model.getResource()).then(ref => {
				const model = ref.object;
				const editorModel = model.textEditorModel;

				assert.ok(editorModel);
				assert.equal(editorModel.getValue(), 'Hello Html');

				let disposed = false;
				once(model.onDispose)(() => {
					disposed = true;
				});

				ref.dispose();
				assert.equal(disposed, true);
			});
		});
	});

	test('resolve untitled', function () {
		const service = accessor.untitledEditorService;
		const input = service.createOrGet();

		return input.resolve().then(() => {
			return accessor.textModelResolverService.createModelReference(input.getResource()).then(ref => {
				const model = ref.object;
				const editorModel = model.textEditorModel;

				assert.ok(editorModel);
				ref.dispose();

				input.dispose();
			});
		});
	});

	test('even loading documents should be refcounted', async () => {
		let resolveModel: Function;
		let waitForIt = new TPromise(c => resolveModel = c);

		const disposable = accessor.textModelResolverService.registerTextModelContentProvider('test', {
			provideTextContent: async (resource: URI): TPromise<ITextModel> => {
				await waitForIt;

				let modelContent = 'Hello Test';
				let mode = accessor.modeService.getOrCreateMode('json');
				return accessor.modelService.createModel(modelContent, mode, resource);
			}
		});

		const uri = URI.from({ scheme: 'test', authority: null, path: 'thePath' });

		const modelRefPromise1 = accessor.textModelResolverService.createModelReference(uri);
		const modelRefPromise2 = accessor.textModelResolverService.createModelReference(uri);

		resolveModel();

		const modelRef1 = await modelRefPromise1;
		const model1 = modelRef1.object;
		const modelRef2 = await modelRefPromise2;
		const model2 = modelRef2.object;
		const textModel = model1.textEditorModel;

		assert.equal(model1, model2, 'they are the same model');
		assert(!textModel.isDisposed(), 'the text model should not be disposed');

		modelRef1.dispose();
		assert(!textModel.isDisposed(), 'the text model should still not be disposed');

		modelRef2.dispose();
		assert(textModel.isDisposed(), 'the text model should finally be disposed');

		disposable.dispose();
	});
});
