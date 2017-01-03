/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import URI from 'vs/base/common/uri';
import { StringEditorInput } from 'vs/workbench/common/editor/stringEditorInput';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { TestEditorService } from 'vs/workbench/test/workbenchTestServices';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import WorkbenchEditorService = require('vs/workbench/services/editor/common/editorService');

suite('Workbench - StringEditorInput', () => {
	let instantiationService: TestInstantiationService;
	let editorService: WorkbenchEditorService.IWorkbenchEditorService;
	let modelService: IModelService;
	let modeService: IModeService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		editorService = <WorkbenchEditorService.IWorkbenchEditorService>instantiationService.stub(WorkbenchEditorService.IWorkbenchEditorService, new TestEditorService(function () { }));
		modeService = instantiationService.stub(IModeService, ModeServiceImpl);
		modelService = <IModelService>instantiationService.stub(IModelService, stubModelService(instantiationService));
	});

	test('StringEditorInput', function (done) {
		let input: StringEditorInput = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);
		const otherInput: StringEditorInput = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'othervalue', 'mode', false);
		const otherInputSame: StringEditorInput = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);

		const inputSingleton: StringEditorInput = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', true);
		const otherInputSingleton: StringEditorInput = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'othervalue', 'mode', true);
		assert(inputSingleton.matches(otherInputSingleton));
		(<any>otherInputSingleton).singleton = false;
		assert(!inputSingleton.matches(otherInputSingleton));

		assert(input.matches(input));
		assert(input.matches(otherInputSame));
		assert(!input.matches(otherInput));
		assert(!input.matches(null));
		assert(input.getName());

		input = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);

		input = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);
		input.resolve(true).then(resolved => {
			const resolvedModelA = resolved;
			return input.resolve(true).then(resolved => {
				assert(resolvedModelA === resolved); // assert: Resolved Model cached per instance

				const otherInput: StringEditorInput = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);
				return otherInput.resolve(true).then(resolved => {
					assert(resolvedModelA !== resolved); // NOT assert: Different instance, different model

					input.dispose();

					return input.resolve(true).then(resolved => {
						assert(resolvedModelA !== resolved); // Different instance, because input got disposed

						const model = (<any>resolved).textEditorModel;
						return input.resolve(true).then(againResolved => {
							assert(model === (<any>againResolved).textEditorModel); // Models should not differ because string input is constant

							input.dispose();
						});
					});
				});
			});
		}).done(() => done());
	});

	test('StringEditorInput - setValue, clearValue, append', function () {
		const input: StringEditorInput = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);

		assert.strictEqual(input.getValue(), 'value');
		input.setValue('foo');
		assert.strictEqual(input.getValue(), 'foo');
		input.setValue('');
		assert(!input.getValue());
	});

	test('Input.matches() - StringEditorInput', function () {
		const inst = new TestInstantiationService();

		const stringEditorInput: StringEditorInput = inst.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);
		const promiseEditorInput: StringEditorInput = inst.createInstance(ResourceEditorInput, 'name', 'description', URI.from({ scheme: 'inMemory', authority: null, path: 'thePath' }));

		const stringEditorInput2: StringEditorInput = inst.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);
		const promiseEditorInput2: StringEditorInput = inst.createInstance(ResourceEditorInput, 'name', 'description', URI.from({ scheme: 'inMemory', authority: null, path: 'thePath' }));

		assert.strictEqual(stringEditorInput.matches(null), false);
		assert.strictEqual(promiseEditorInput.matches(null), false);

		assert.strictEqual(promiseEditorInput.matches(promiseEditorInput), true);
		assert.strictEqual(stringEditorInput.matches(stringEditorInput), true);

		assert.strictEqual(promiseEditorInput.matches(promiseEditorInput2), true);
		assert.strictEqual(stringEditorInput.matches(stringEditorInput2), true);
	});

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IConfigurationService, new TestConfigurationService());

		return instantiationService.createInstance(ModelServiceImpl);
	}
});