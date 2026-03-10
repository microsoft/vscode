/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConversationMessage } from '../../common/conversation.js';
import { IModelInfo, IModelProvider, IModelRequestConfig, ModelResponseChunk } from '../../common/modelProvider.js';
import { IAgentToolDefinition } from '../../common/tools.js';
import { IModelProviderService, ModelProviderService } from '../../node/modelProviderService.js';
import { NullLogService, ILogService } from '../../../log/common/log.js';
import { CopilotApiService, ICopilotApiService } from '../../node/copilotToken.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';

function createMockProvider(providerId: string): IModelProvider {
	return {
		providerId,
		async *sendRequest(
			_systemPrompt: string,
			_messages: readonly IConversationMessage[],
			_tools: readonly IAgentToolDefinition[],
			_config: IModelRequestConfig,
			_token: CancellationToken,
		): AsyncGenerator<ModelResponseChunk> {
			yield { type: 'text-delta', text: 'mock' };
		},
		async listModels(): Promise<readonly IModelInfo[]> {
			return [];
		},
	};
}

suite('ModelProviderService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(): IModelProviderService {
		const log = new NullLogService();
		const services = new ServiceCollection();
		services.set(ILogService, log);
		services.set(ICopilotApiService, new CopilotApiService(log));
		return store.add(new InstantiationService(services)).createInstance(ModelProviderService);
	}

	test('resolves a model to the correct provider', () => {
		const service = createService();
		service.registerFactory({
			providerId: 'test-anthropic',
			canHandle: (modelId: string) => modelId.startsWith('test-claude-'),
			create: (modelId: string) => createMockProvider(`test-anthropic:${modelId}`),
		});

		const result = service.resolve('test-claude-sonnet');
		assert.strictEqual(result.identity.provider, 'test-anthropic');
		assert.strictEqual(result.identity.modelId, 'test-claude-sonnet');
		assert.ok(result.provider);
	});

	test('built-in factories resolve anthropic and openai models', () => {
		const service = createService();

		const anthropicResult = service.resolve('claude-sonnet-4-20250514');
		assert.strictEqual(anthropicResult.identity.provider, 'anthropic');

		const openaiResult = service.resolve('gpt-4o');
		assert.strictEqual(openaiResult.identity.provider, 'openai');

		const oResult = service.resolve('o3-pro');
		assert.strictEqual(oResult.identity.provider, 'openai');
	});

	test('first matching factory wins', () => {
		const service = createService();
		service.registerFactory({
			providerId: 'first',
			canHandle: () => true,
			create: () => createMockProvider('first'),
		});
		service.registerFactory({
			providerId: 'second',
			canHandle: () => true,
			create: () => createMockProvider('second'),
		});

		// Built-in factories handle claude-* and gpt-*, so test with an unmatched model
		// The first catch-all factory should win
		const result = service.resolve('unknown-model');
		assert.strictEqual(result.identity.provider, 'first');
	});

	test('throws when no factory matches', () => {
		const service = createService();

		assert.throws(
			() => service.resolve('totally-unknown-model-xyz'),
			/No model provider found/,
		);
	});
});
