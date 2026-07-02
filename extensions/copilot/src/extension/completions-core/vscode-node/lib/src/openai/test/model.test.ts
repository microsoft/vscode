/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ICompletionModelInformation } from '../../../../../../../platform/endpoint/common/endpointProvider';
import { TokenizerType } from '../../../../../../../util/common/tokenizer';
import { ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { TokenizerName } from '../../../../prompt/src/tokenization';
import { ConfigKey, ICompletionsConfigProvider, InMemoryConfigProvider } from '../../config';
import { ICompletionsLogTargetService, LogLevel } from '../../logger';
import { createLibTestingContext } from '../../test/context';
import { getCustomCompletionModelHeaders, resolveCustomCompletionModelUrl } from '../customCompletionModels';
import { AvailableModelsManager, ICompletionsModelManagerService } from '../model';

suite('AvailableModelsManager', function () {
	let accessor: ServicesAccessor;
	let manager: AvailableModelsManager;
	let configProvider: InMemoryConfigProvider;

	setup(function () {
		const serviceCollection = createLibTestingContext();
		accessor = serviceCollection.createTestingAccessor();
		manager = accessor.get(ICompletionsModelManagerService) as AvailableModelsManager;
		manager.fetchedModelData = [hostedCompletionModel()];
		configProvider = accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider;
	});

	test('includes custom completion models in generic completion models', function () {
		configProvider.setConfig(ConfigKey.CustomCompletionModels, [{
			id: 'local-gemma',
			name: 'Local Gemma',
			url: 'http://127.0.0.1:8080',
			tokenizer: TokenizerName.cl100k,
		}]);

		const models = manager.getGenericCompletionModels();

		assert.deepStrictEqual(models.map(model => ({
			modelId: model.modelId,
			label: model.label,
			tokenizer: model.tokenizer,
			custom: model.custom,
		})), [
			{
				modelId: 'gpt-41-copilot',
				label: 'GPT 4.1 Copilot',
				tokenizer: TokenizerName.o200k,
				custom: undefined,
			},
			{
				modelId: 'local-gemma',
				label: 'Local Gemma',
				tokenizer: TokenizerName.cl100k,
				custom: true,
			},
		]);
		assert.strictEqual(manager.getTokenizerForModel('local-gemma'), TokenizerName.cl100k);
	});

	test('preserves a selected custom completion model', function () {
		configProvider.setConfig(ConfigKey.CustomCompletionModels, [{
			id: 'local-gemma',
			url: 'http://127.0.0.1:8080',
		}]);
		configProvider.setConfig(ConfigKey.UserSelectedCompletionModel, 'local-gemma');

		const requestInfo = manager.getCurrentModelRequestInfo();

		assert.strictEqual(requestInfo.modelId, 'local-gemma');
		assert.strictEqual(requestInfo.modelChoiceSource, 'custommodel');
	});

	test('ignores custom completion models that collide with hosted model IDs', function () {
		manager.fetchedModelData = [
			hostedCompletionModel('gpt-41-copilot', 'GPT 4.1 Copilot'),
			hostedCompletionModel('gpt-5-copilot', 'GPT 5 Copilot'),
		];
		configProvider.setConfig(ConfigKey.CustomCompletionModels, [{
			id: 'gpt-5-copilot',
			name: 'Shadowed Custom Model',
			url: 'http://127.0.0.1:8080',
		}]);
		configProvider.setConfig(ConfigKey.UserSelectedCompletionModel, 'gpt-5-copilot');

		const models = manager.getGenericCompletionModels();
		const requestInfo = manager.getCurrentModelRequestInfo();

		assert.deepStrictEqual(models.map(model => ({
			modelId: model.modelId,
			custom: model.custom,
		})), [
			{
				modelId: 'gpt-41-copilot',
				custom: undefined,
			},
			{
				modelId: 'gpt-5-copilot',
				custom: undefined,
			},
		]);
		assert.strictEqual(requestInfo.modelId, 'gpt-5-copilot');
		assert.strictEqual(requestInfo.modelChoiceSource, 'modelpicker');
	});

	test('ignores duplicate custom completion model IDs', function () {
		configProvider.setConfig(ConfigKey.CustomCompletionModels, [
			{
				id: 'local-gemma',
				name: 'Local Gemma',
				url: 'http://127.0.0.1:8080',
				tokenizer: TokenizerName.cl100k,
			},
			{
				id: 'local-gemma',
				name: 'Shadowed Local Gemma',
				url: 'http://127.0.0.1:9090',
			},
		]);

		const models = manager.getGenericCompletionModels();

		assert.deepStrictEqual(models.map(model => ({
			modelId: model.modelId,
			label: model.label,
			tokenizer: model.tokenizer,
			custom: model.custom,
		})), [
			{
				modelId: 'gpt-41-copilot',
				label: 'GPT 4.1 Copilot',
				tokenizer: TokenizerName.o200k,
				custom: undefined,
			},
			{
				modelId: 'local-gemma',
				label: 'Local Gemma',
				tokenizer: TokenizerName.cl100k,
				custom: true,
			},
		]);
	});

	test('logs ignored custom completion model ID collisions once', function () {
		const serviceCollection = createLibTestingContext();
		const logService = new TestLogService();
		serviceCollection.define(ICompletionsLogTargetService, logService);
		const accessor = serviceCollection.createTestingAccessor();
		const manager = accessor.get(ICompletionsModelManagerService) as AvailableModelsManager;
		manager.fetchedModelData = [hostedCompletionModel()];
		const configProvider = accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider;
		configProvider.setConfig(ConfigKey.CustomCompletionModels, [{
			id: 'gpt-41-copilot',
			url: 'http://127.0.0.1:8080',
		}]);

		manager.getGenericCompletionModels();
		manager.getGenericCompletionModels();

		const ignoredCollisionLogs = logService.entries.filter(entry =>
			entry.level === LogLevel.INFO &&
			entry.category.includes('Ignoring custom completion model gpt-41-copilot')
		);
		assert.strictEqual(ignoredCollisionLogs.length, 1);
	});
});

suite('Custom completion model helpers', function () {
	test('resolves custom completion model URLs', function () {
		assert.strictEqual(resolveCustomCompletionModelUrl({
			id: 'base',
			url: 'http://127.0.0.1:8080',
		}), 'http://127.0.0.1:8080/v1/completions');
		assert.strictEqual(resolveCustomCompletionModelUrl({
			id: 'versioned',
			url: 'http://127.0.0.1:8080/v1',
		}), 'http://127.0.0.1:8080/v1/completions');
		assert.strictEqual(resolveCustomCompletionModelUrl({
			id: 'explicit',
			url: 'http://127.0.0.1:8080/v1/completions',
		}), 'http://127.0.0.1:8080/v1/completions');
		assert.strictEqual(resolveCustomCompletionModelUrl({
			id: 'trailing',
			url: 'http://127.0.0.1:8080/',
		}), 'http://127.0.0.1:8080/v1/completions');
		assert.strictEqual(resolveCustomCompletionModelUrl({
			id: 'path',
			url: 'http://127.0.0.1:8080/api',
		}), 'http://127.0.0.1:8080/api/v1/completions');
		assert.strictEqual(resolveCustomCompletionModelUrl({
			id: 'query',
			url: 'http://127.0.0.1:8080/v1/completions?api-version=1',
		}), 'http://127.0.0.1:8080/v1/completions?api-version=1');
	});

	test('sanitizes custom completion model headers', function () {
		const headers = getCustomCompletionModelHeaders({
			id: 'local-gemma',
			url: 'http://127.0.0.1:8080',
			apiKey: 'secret-key',
			requestHeaders: {
				'Authorization': 'Token existing',
				'X-Good': '  value  ',
				'Bad Header': 'bad',
				'X-Control': 'line\nbreak',
				'X-Empty': '   ',
			},
		});

		assert.deepStrictEqual(headers, {
			Authorization: 'Token existing',
			'X-Good': 'value',
		});
	});

	test('uses custom completion model api key when no auth header is configured', function () {
		const headers = getCustomCompletionModelHeaders({
			id: 'local-gemma',
			url: 'http://127.0.0.1:8080',
			apiKey: 'secret-key',
			requestHeaders: {
				'X-Good': 'value',
			},
		});

		assert.deepStrictEqual(headers, {
			'X-Good': 'value',
			Authorization: 'Bearer secret-key',
		});
	});

	test('does not add custom completion model api key with invalid header characters', function () {
		const headers = getCustomCompletionModelHeaders({
			id: 'local-gemma',
			url: 'http://127.0.0.1:8080',
			apiKey: 'secret\nkey',
			requestHeaders: {
				'X-Good': 'value',
			},
		});

		assert.deepStrictEqual(headers, {
			'X-Good': 'value',
		});
	});

	test('does not add custom completion model api key when lowercase auth header is configured', function () {
		const headers = getCustomCompletionModelHeaders({
			id: 'local-gemma',
			url: 'http://127.0.0.1:8080',
			apiKey: 'secret-key',
			requestHeaders: {
				authorization: 'Token existing',
			},
		});

		assert.deepStrictEqual(headers, {
			authorization: 'Token existing',
		});
	});
});

function hostedCompletionModel(id = 'gpt-41-copilot', name = 'GPT 4.1 Copilot'): ICompletionModelInformation {
	return {
		id,
		vendor: 'github',
		name,
		model_picker_enabled: true,
		preview: false,
		is_chat_default: false,
		is_chat_fallback: false,
		version: '1',
		capabilities: {
			type: 'completion',
			family: 'gpt-41-copilot',
			tokenizer: TokenizerType.O200K,
		},
	};
}

class TestLogService implements ICompletionsLogTargetService {
	declare _serviceBrand: undefined;
	readonly entries: { level: LogLevel; category: string; extra: unknown[] }[] = [];

	logIt(level: LogLevel, category: string, ...extra: unknown[]): void {
		this.entries.push({ level, category, extra });
	}
}
