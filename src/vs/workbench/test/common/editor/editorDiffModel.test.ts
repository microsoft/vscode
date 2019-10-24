/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TextDiffEditorModel } from 'vs/workbench/common/editor/textDiffEditorModel';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { URI } from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { TestTextFileService, workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { ITextModel } from 'vs/editor/common/model';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

class ServiceAccessor {
	constructor(
		@ITextModelService public textModelResolverService: ITextModelService,
		@IModelService public modelService: IModelService,
		@IModeService public modeService: IModeService,
		@ITextFileService public textFileService: TestTextFileService
	) {
	}
}

suite('Workbench editor model', () => {
	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	test('TextDiffEditorModel', async () => {
		const dispose = accessor.textModelResolverService.registerTextModelContentProvider('test', {
			provideTextContent: function (resource: URI): Promise<ITextModel> {
				if (resource.scheme === 'test') {
					let modelContent = 'Hello Test';
					let languageSelection = accessor.modeService.create('json');
					return Promise.resolve(accessor.modelService.createModel(modelContent, languageSelection, resource));
				}

				return Promise.resolve(null!);
			}
		});

		let input = instantiationService.createInstance(ResourceEditorInput, 'name', 'description', URI.from({ scheme: 'test', authority: null!, path: 'thePath' }), undefined);
		let otherInput = instantiationService.createInstance(ResourceEditorInput, 'name2', 'description', URI.from({ scheme: 'test', authority: null!, path: 'thePath' }), undefined);
		let diffInput = new DiffEditorInput('name', 'description', input, otherInput);

		let model = await diffInput.resolve() as TextDiffEditorModel;

		assert(model);
		assert(model instanceof TextDiffEditorModel);

		let diffEditorModel = model.textDiffEditorModel!;
		assert(diffEditorModel.original);
		assert(diffEditorModel.modified);

		model = await diffInput.resolve() as TextDiffEditorModel;
		assert(model.isResolved());

		assert(diffEditorModel !== model.textDiffEditorModel);
		diffInput.dispose();
		assert(!model.textDiffEditorModel);

		dispose.dispose();
	});
});
