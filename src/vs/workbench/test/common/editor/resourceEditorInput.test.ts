/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';

class ServiceAccessor {
	constructor(
		@IModelService public modelService: IModelService,
		@IModeService public modeService: IModeService
	) {
	}
}

suite('Workbench - ResourceEditorInput', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	test('simple', function () {
		let resource = URI.from({ scheme: 'inmemory', authority: null, path: 'thePath' });
		accessor.modelService.createModel('function test() {}', accessor.modeService.getOrCreateMode('text'), resource);
		let input: ResourceEditorInput = instantiationService.createInstance(ResourceEditorInput, 'The Name', 'The Description', resource);

		return input.resolve().then((model: ResourceEditorModel) => {
			assert.ok(model);
			assert.equal(model.getValue(), 'function test() {}');
		});
	});
});