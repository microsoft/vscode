/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { IModel } from 'vs/editor/common/editorCommon';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { workbenchInstantiationService, TestTextFileService } from 'vs/workbench/test/workbenchTestServices';
import { toResource } from 'vs/base/test/common/utils';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';

class ServiceAccessor {
	constructor(
		@ITextModelResolverService public textModelResolverServie: ITextModelResolverService,
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

	test('resolve resource', function (done) {
		const dispose = accessor.textModelResolverServie.registerTextModelContentProvider('test', {
			provideTextContent: function (resource: URI): TPromise<IModel> {
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

		input.resolve().then((model: ResourceEditorModel) => {
			assert.ok(model);
			assert.equal(model.getValue(), 'Hello Test');

			dispose.dispose();
			done();
		});
	});

	test('resolve file', function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file_resolver.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		return model.load().then(() => {
			return accessor.textModelResolverServie.createModelReference(model.getResource()).then(ref => {
				const model = ref.object;
				const editorModel = model.textEditorModel;

				assert.ok(editorModel);
				assert.equal(editorModel.getValue(), 'Hello Html');
				ref.dispose();
			});
		});
	});

	test('resolve untitled', function () {
		const service = accessor.untitledEditorService;
		const input = service.createOrGet();

		return input.resolve().then(() => {
			return accessor.textModelResolverServie.createModelReference(input.getResource()).then(ref => {
				const model = ref.object;
				const editorModel = model.textEditorModel;

				assert.ok(editorModel);
				ref.dispose();

				input.dispose();
			});
		});
	});

	// TODO: add reference tests!
});