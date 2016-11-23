/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TestInstantiationService } from 'vs/test/utils/instantiationTestUtils';
import URI from 'vs/base/common/uri';
import { StringEditorInput } from 'vs/workbench/common/editor/stringEditorInput';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { createMockModelService, TestEditorService } from 'vs/test/utils/servicesTestUtils';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import WorkbenchEditorService = require('vs/workbench/services/editor/common/editorService');

suite('Workbench - StringEditorInput', () => {

	let instantiationService: TestInstantiationService;
	let editorService: WorkbenchEditorService.IWorkbenchEditorService;
	let modelService: IModelService;
	let modeService: IModeService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		editorService = <WorkbenchEditorService.IWorkbenchEditorService>instantiationService.stub(WorkbenchEditorService.IWorkbenchEditorService, new TestEditorService(function () { }));
		modeService = instantiationService.stub(IModeService);
		modelService = <IModelService>instantiationService.stub(IModelService, createMockModelService(instantiationService));
	});

	test('StringEditorInput', function (done) {

		let input = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);
		let otherInput = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'othervalue', 'mode', false);
		let otherInputSame = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);

		let inputSingleton = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', true);
		let otherInputSingleton = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'othervalue', 'mode', true);
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
			let resolvedModelA = resolved;
			return input.resolve(true).then(resolved => {
				assert(resolvedModelA === resolved); // assert: Resolved Model cached per instance

				let otherInput = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);
				return otherInput.resolve(true).then(resolved => {
					assert(resolvedModelA !== resolved); // NOT assert: Different instance, different model

					input.dispose();

					return input.resolve(true).then(resolved => {
						assert(resolvedModelA !== resolved); // Different instance, because input got disposed

						let model = (<any>resolved).textEditorModel;
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
		let input = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);

		assert.strictEqual(input.getValue(), 'value');
		input.setValue('foo');
		assert.strictEqual(input.getValue(), 'foo');
		input.clearValue();
		assert(!input.getValue());
		input.append('1');
		assert.strictEqual(input.getValue(), '1');
		input.append('2');
		assert.strictEqual(input.getValue(), '12');
	});

	test('Input.matches() - StringEditorInput', function () {
		let inst = new TestInstantiationService();

		let stringEditorInput = inst.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);
		let promiseEditorInput = inst.createInstance(ResourceEditorInput, 'name', 'description', URI.from({ scheme: 'inMemory', authority: null, path: 'thePath' }));

		let stringEditorInput2 = inst.createInstance(StringEditorInput, 'name', 'description', 'value', 'mode', false);
		let promiseEditorInput2 = inst.createInstance(ResourceEditorInput, 'name', 'description', URI.from({ scheme: 'inMemory', authority: null, path: 'thePath' }));

		assert.strictEqual(stringEditorInput.matches(null), false);
		assert.strictEqual(promiseEditorInput.matches(null), false);

		assert.strictEqual(promiseEditorInput.matches(promiseEditorInput), true);
		assert.strictEqual(stringEditorInput.matches(stringEditorInput), true);

		assert.strictEqual(promiseEditorInput.matches(promiseEditorInput2), true);
		assert.strictEqual(stringEditorInput.matches(stringEditorInput2), true);
	});
});