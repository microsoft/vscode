/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { EditorModel } from 'vs/workbench/common/editor';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { TextDiffEditorModel } from 'vs/workbench/common/editor/textDiffEditorModel';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import URI from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { TestTextFileService, workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { TPromise } from 'vs/base/common/winjs.base';
import { IModel } from 'vs/editor/common/editorCommon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

class MyEditorModel extends EditorModel { }
class MyTextEditorModel extends BaseTextEditorModel { }

class ServiceAccessor {
	constructor(
		@ITextModelService public textModelResolverService: ITextModelService,
		@IModelService public modelService: IModelService,
		@IModeService public modeService: IModeService,
		@ITextFileService public textFileService: TestTextFileService
	) {
	}
}

suite('Workbench - EditorModel', () => {
	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	test('TextDiffEditorModel', function (done) {
		const dispose = accessor.textModelResolverService.registerTextModelContentProvider('test', {
			provideTextContent: function (resource: URI): TPromise<IModel> {
				if (resource.scheme === 'test') {
					let modelContent = 'Hello Test';
					let mode = accessor.modeService.getOrCreateMode('json');
					return TPromise.as(accessor.modelService.createModel(modelContent, mode, resource));
				}

				return TPromise.as(null);
			}
		});

		let input = instantiationService.createInstance(ResourceEditorInput, 'name', 'description', URI.from({ scheme: 'test', authority: null, path: 'thePath' }));
		let otherInput = instantiationService.createInstance(ResourceEditorInput, 'name2', 'description', URI.from({ scheme: 'test', authority: null, path: 'thePath' }));
		let diffInput = new DiffEditorInput('name', 'description', input, otherInput);

		diffInput.resolve(true).then((model: any) => {
			assert(model);
			assert(model instanceof TextDiffEditorModel);

			let diffEditorModel = model.textDiffEditorModel;
			assert(diffEditorModel.original);
			assert(diffEditorModel.modified);

			return diffInput.resolve(true).then((model: any) => {
				assert(model.isResolved());

				assert(diffEditorModel !== model.textDiffEditorModel);
				diffInput.dispose();
				assert(!model.textDiffEditorModel);

				dispose.dispose();
			});
		}).done(() => {
			done();
		});
	});
});
