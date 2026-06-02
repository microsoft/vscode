/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { commands, env } from 'vscode';
import { SyncDescriptor } from '../../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { AvailableModelsManager, ICompletionsModelManagerService } from '../../../lib/src/openai/model';
import { ModelPickerManager } from './../modelPicker';
import { createExtensionTestingContext } from './context';

suite('ModelPickerManager unit tests', function () {
	let accessor: ServicesAccessor;
	let modelPicker: ModelPickerManager;
	let availableModelsManager: ICompletionsModelManagerService;
	let sandbox: sinon.SinonSandbox;
	let getGenericCompletionModelsStub: sinon.SinonStub;

	// Couple of fake models to use in our tests.
	const fakeModels = [
		{
			modelId: 'model-a',
			label: 'Model A',
			type: 'model',
			alwaysShow: true,
			preview: false,
			tokenizer: 'o200k_base',
		},
		{
			modelId: 'model-b',
			label: 'Model B',
			type: 'model',
			alwaysShow: true,
			preview: false,
			tokenizer: 'cl100k_base',
		},
	];

	setup(function () {
		sandbox = sinon.createSandbox();
		// Create our test context, and stub the AvailableModelsManager to return our fake models.
		const serviceCollection = createExtensionTestingContext();
		serviceCollection.define(ICompletionsModelManagerService, new SyncDescriptor(AvailableModelsManager, [true]));
		accessor = serviceCollection.createTestingAccessor();

		availableModelsManager = accessor.get(ICompletionsModelManagerService);
		getGenericCompletionModelsStub = sandbox.stub(availableModelsManager, 'getGenericCompletionModels').returns(fakeModels);
		modelPicker = accessor.get(IInstantiationService).createInstance(ModelPickerManager);
	});

	teardown(async function () {
		// Make sure to close any open quick pick dialogs after each test.
		await commands.executeCommand('workbench.action.closeQuickOpen');
		sandbox.restore();
	});

	test('showModelPicker returns correct items', function () {
		const instantiationService = accessor.get(IInstantiationService);

		modelPicker = instantiationService.createInstance(ModelPickerManager);

		const quickPick = modelPicker.showModelPicker();

		// Check that we have the correct number of items
		// The items should include the two fake models, a separator, and a learn more item.
		assert(quickPick.items.length === 4, quickPick.items.length.toString());
		assert.strictEqual(quickPick.items[0].modelId, 'model-a');
		assert.strictEqual(quickPick.items[1].modelId, 'model-b');
		assert.strictEqual(quickPick.items[2].type, 'separator');
		assert.strictEqual(quickPick.items[3].type, 'learn-more');
	});

	test('hasMultipleModels is true when multiple models are available', function () {
		assert.strictEqual(modelPicker.hasMultipleModels(), true);
	});

	test('hasMultipleModels is false when one model is available', function () {
		getGenericCompletionModelsStub.returns([fakeModels[0]]);
		assert.strictEqual(modelPicker.hasMultipleModels(), false);
	});

	test('selecting a model updates user selection', async function () {
		// Stub out setting model
		const setModelStub = sandbox.stub(modelPicker, 'setUserSelectedCompletionModel').resolves();

		const quickPick = modelPicker.showModelPicker();

		const secondItem = quickPick.items[1];
		assert(secondItem !== undefined, 'model picker should have a model-b second item.');

		// Fake selecting the second item
		quickPick.activeItems = [secondItem];
		await modelPicker.handleModelSelection(quickPick);

		// Test that we updated the user configuration with the selected model
		assert(setModelStub.calledOnce, 'setUserSelectedCompletionModel should be called once');
		assert.strictEqual(setModelStub.firstCall.args[0], secondItem.modelId);
	});

	test('selecting the learn more link tries to open the learn more url', async function () {
		// Stub openExternal
		const openUrlStub = sandbox.stub(env, 'openExternal').resolves();

		const quickPick = modelPicker.showModelPicker();

		const learnMoreItem = quickPick.items[3];
		assert(learnMoreItem !== undefined, 'model picker should have a learn more item.');

		// Fake selecting the learn more item
		quickPick.activeItems = [learnMoreItem];
		await modelPicker.handleModelSelection(quickPick);

		// Test that we opened the learn more URL
		assert(openUrlStub.calledOnce, 'openUrl should be called once');
		assert.strictEqual(
			openUrlStub.firstCall.args[0].toString(),
			'https://aka.ms/CopilotCompletionsModelPickerLearnMore'
		);
	});
});
