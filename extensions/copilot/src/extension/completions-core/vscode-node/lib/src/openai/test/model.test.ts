/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { clearByokCompletionModelConfigs, updateByokCompletionModelConfig } from '../../../../../../byok/common/byokCompletionModels';
import { ConfigKey, ICompletionsConfigProvider, InMemoryConfigProvider } from '../../config';
import { createLibTestingContext } from '../../test/context';
import { ICompletionsModelManagerService } from '../model';

suite('AvailableModelsManager BYOK models', function () {

	teardown(function () {
		clearByokCompletionModelConfigs();
	});

	test('honors a user selected custom BYOK model even when no CAPI models are available', function () {
		const serviceCollection = createLibTestingContext();
		const accessor = serviceCollection.createTestingAccessor();
		(accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider).setConfig(ConfigKey.UserSelectedCompletionModel, 'custom-model');

		updateByokCompletionModelConfig('customendpoint', 'Custom', {
			apiKey: 'sk-test',
			models: [
				{
					id: 'custom-model',
					name: 'Custom Model',
					url: 'https://custom.example.com/v1/chat/completions',
					completionsUrl: 'https://custom.example.com/v1/completions',
				},
			],
		});

		const manager = accessor.get(ICompletionsModelManagerService);
		const info = manager.getCurrentModelRequestInfo();

		assert.strictEqual(info.modelId, 'custom-model');
		assert.strictEqual(info.modelChoiceSource, 'modelpicker');
		assert.ok(info.customModel, 'customModel should be set');
		assert.strictEqual(info.customModel!.completionsUrl, 'https://custom.example.com/v1/completions');
		assert.strictEqual(info.customModel!.apiKey, 'sk-test');
	});

	test('surfaces custom BYOK models in the model picker list', function () {
		const serviceCollection = createLibTestingContext();
		const accessor = serviceCollection.createTestingAccessor();

		updateByokCompletionModelConfig('customendpoint', 'Custom', {
			models: [
				{
					id: 'custom-model',
					name: 'Custom Model',
					url: 'https://custom.example.com/v1/chat/completions',
					completionsUrl: 'https://custom.example.com/v1/completions',
				},
			],
		});

		const manager = accessor.get(ICompletionsModelManagerService);
		const customModels = manager.getCustomCompletionModels();

		assert.strictEqual(customModels.length, 1);
		assert.strictEqual(customModels[0].modelId, 'custom-model');
		assert.strictEqual(customModels[0].custom, true);
		assert.strictEqual(customModels[0].customGroup, 'Custom');
	});

	test('still falls back to the default model for unknown model ids', function () {
		const serviceCollection = createLibTestingContext();
		const accessor = serviceCollection.createTestingAccessor();
		(accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider).setConfig(ConfigKey.UserSelectedCompletionModel, 'not-a-real-model');

		const manager = accessor.get(ICompletionsModelManagerService);
		const info = manager.getCurrentModelRequestInfo();

		assert.strictEqual(info.customModel, undefined);
	});
});
