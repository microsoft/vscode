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
import { workbenchInstantiationService } from 'vs/test/utils/servicesTestUtils';
import { ITextModelResolverService } from 'vs/platform/textmodelResolver/common/resolver';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';

class ServiceAccessor {
	constructor(
		@ITextModelResolverService public textModelResolverServie: ITextModelResolverService,
		@IModelService public modelService: IModelService,
		@IModeService public modeService: IModeService
	) {
	}
}

suite('Workbench - TextModelResolverService', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	test('resolve', function (done) {
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
});