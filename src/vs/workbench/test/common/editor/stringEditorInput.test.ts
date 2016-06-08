/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import {StringEditorInput} from 'vs/workbench/common/editor/stringEditorInput';
import {ResourceEditorInput} from 'vs/workbench/common/editor/resourceEditorInput';
import {ResourceEditorModel} from 'vs/workbench/common/editor/resourceEditorModel';
import {TestEditorService} from 'vs/workbench/test/common/servicesTestUtils';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';

import {createMockModelService, createMockModeService} from 'vs/editor/test/common/servicesTestUtils';

suite('Workbench - StringEditorInput', () => {

	test('StringEditorInput', function (done) {
		let editorService = new TestEditorService(function () { });
		let services = new ServiceCollection();
		services.set(IModeService, createMockModeService());
		services.set(IModelService, createMockModelService());
		let inst = new InstantiationService(services);

		let input = inst.createInstance(StringEditorInput, 'name', 'description', 'value', 'mime', false);
		let otherInput = inst.createInstance(StringEditorInput, 'name', 'description', 'othervalue', 'mime', false);
		let otherInputSame = inst.createInstance(StringEditorInput, 'name', 'description', 'value', 'mime', false);

		let inputSingleton = inst.createInstance(StringEditorInput, 'name', 'description', 'value', 'mime', true);
		let otherInputSingleton = inst.createInstance(StringEditorInput, 'name', 'description', 'othervalue', 'mime', true);
		assert(inputSingleton.matches(otherInputSingleton));
		(<any>otherInputSingleton).singleton = false;
		assert(!inputSingleton.matches(otherInputSingleton));

		assert(input.matches(input));
		assert(input.matches(otherInputSame));
		assert(!input.matches(otherInput));
		assert(!input.matches(null));
		assert(input.getName());

		input = inst.createInstance(StringEditorInput, 'name', 'description', 'value', 'mime', false);

		input = inst.createInstance(StringEditorInput, 'name', 'description', 'value', 'mime', false);
		editorService.resolveEditorModel(input, true).then(function (resolved) {
			let resolvedModelA = resolved;
			return editorService.resolveEditorModel(input, true).then(function (resolved) {
				assert(resolvedModelA === resolved); // assert: Resolved Model cached per instance

				let otherInput = inst.createInstance(StringEditorInput, 'name', 'description', 'value', 'mime', false);
				return editorService.resolveEditorModel(otherInput, true).then(function (resolved) {
					assert(resolvedModelA !== resolved); // NOT assert: Different instance, different model

					input.dispose();

					return editorService.resolveEditorModel(input, true).then(function (resolved) {
						assert(resolvedModelA !== resolved); // Different instance, because input got disposed

						let model = (<any>resolved).textEditorModel;
						return editorService.resolveEditorModel(input, true).then(function (againResolved) {
							assert(model === (<any>againResolved).textEditorModel); // Models should not differ because string input is constant

							input.dispose();
						});
					});
				});
			});
		}).done(() => done());
	});

	test('StringEditorInput - setValue, clearValue, append', function () {
		let services = new ServiceCollection();
		services.set(IModeService, createMockModeService());
		services.set(IModelService, createMockModelService());
		let inst = new InstantiationService(services);
		let input = inst.createInstance(StringEditorInput, 'name', 'description', 'value', 'mime', false);

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
		let inst = new InstantiationService();

		let stringEditorInput = inst.createInstance(StringEditorInput, 'name', 'description', 'value', 'mime', false);
		let promiseEditorInput = inst.createInstance(ResourceEditorInput, 'name', 'description', URI.from({ scheme: 'inMemory', authority: null, path: 'thePath' }));

		let stringEditorInput2 = inst.createInstance(StringEditorInput, 'name', 'description', 'value', 'mime', false);
		let promiseEditorInput2 = inst.createInstance(ResourceEditorInput, 'name', 'description', URI.from({ scheme: 'inMemory', authority: null, path: 'thePath' }));

		assert.strictEqual(stringEditorInput.matches(null), false);
		assert.strictEqual(promiseEditorInput.matches(null), false);

		assert.strictEqual(promiseEditorInput.matches(promiseEditorInput), true);
		assert.strictEqual(stringEditorInput.matches(stringEditorInput), true);

		assert.strictEqual(promiseEditorInput.matches(promiseEditorInput2), true);
		assert.strictEqual(stringEditorInput.matches(stringEditorInput2), true);
	});

	test('ResourceEditorInput', function (done) {
		let modelService = createMockModelService();
		let modeService = createMockModeService();
		let services = new ServiceCollection();
		services.set(IModeService, modeService);
		services.set(IModelService, modelService);
		let inst = new InstantiationService(services);

		let resource = URI.from({ scheme: 'inMemory', authority: null, path: 'thePath' });
		modelService.createModel('function test() {}', modeService.getOrCreateMode('text'), resource);
		let input: ResourceEditorInput = inst.createInstance(ResourceEditorInput, 'The Name', 'The Description', resource);

		input.resolve().then((model: ResourceEditorModel) => {
			assert.ok(model);
			assert.equal(model.getValue(), 'function test() {}');

			done();
		});
	});
});