/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ICompletionModelInformation } from '../../../../../../../platform/endpoint/common/endpointProvider';
import { clearByokCompletionModelConfigs, updateByokCompletionModelConfig } from '../../../../../../byok/common/byokCompletionModels';
import { ConfigKey, ICompletionsConfigProvider, InMemoryConfigProvider } from '../../config';
import { createLibTestingContext } from '../../test/context';
import { AvailableModelsManager, ICompletionsModelManagerService } from '../model';

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

	test('a cloud model with the same id takes precedence over the custom model', function () {
		const serviceCollection = createLibTestingContext();
		const accessor = serviceCollection.createTestingAccessor();
		(accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider).setConfig(ConfigKey.UserSelectedCompletionModel, 'colliding-model');

		updateByokCompletionModelConfig('customendpoint', 'Custom', {
			apiKey: 'sk-test',
			models: [
				{
					id: 'colliding-model',
					name: 'Custom Model',
					url: 'https://custom.example.com/v1/chat/completions',
					completionsUrl: 'https://custom.example.com/v1/completions',
				},
			],
		});

		const manager = accessor.get(ICompletionsModelManagerService) as AvailableModelsManager;
		manager.fetchedModelData = [{
			id: 'colliding-model',
			vendor: 'copilot',
			name: 'Cloud Model',
			model_picker_enabled: true,
			is_chat_default: false,
			is_chat_fallback: false,
			version: '1',
			capabilities: { type: 'completion', family: 'cloud', tokenizer: 'o200k' },
		} as unknown as ICompletionModelInformation];

		const info = manager.getCurrentModelRequestInfo();

		// The cloud entry wins: the request goes to the Copilot proxy, not the
		// custom endpoint, so no customModel (and no API key) is attached.
		assert.strictEqual(info.modelId, 'colliding-model');
		assert.strictEqual(info.customModel, undefined);

		// The picker surfaces the custom entry under a qualified id instead of a
		// duplicate bare id.
		const customModels = manager.getCustomCompletionModels();
		assert.strictEqual(customModels.length, 1);
		assert.strictEqual(customModels[0].modelId, 'Custom/colliding-model');
	});
});
