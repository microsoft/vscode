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
import { ModelProviderService } from '../../node/modelProviderService.js';

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
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves a model to the correct provider', () => {
		const service = new ModelProviderService();
		service.registerFactory({
			providerId: 'anthropic',
			canHandle: (modelId: string) => modelId.startsWith('claude-'),
			create: (modelId: string) => createMockProvider(`anthropic:${modelId}`),
		});

		const result = service.resolve('claude-sonnet-4-20250514');
		assert.strictEqual(result.identity.provider, 'anthropic');
		assert.strictEqual(result.identity.modelId, 'claude-sonnet-4-20250514');
		assert.ok(result.provider);
	});

	test('first matching factory wins', () => {
		const service = new ModelProviderService();
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

		const result = service.resolve('any-model');
		assert.strictEqual(result.identity.provider, 'first');
	});

	test('throws when no factory matches', () => {
		const service = new ModelProviderService();
		service.registerFactory({
			providerId: 'anthropic',
			canHandle: (modelId: string) => modelId.startsWith('claude-'),
			create: () => createMockProvider('anthropic'),
		});

		assert.throws(
			() => service.resolve('gpt-4o'),
			/No model provider found/,
		);
	});

	test('multiple providers for different model families', () => {
		const service = new ModelProviderService();
		service.registerFactory({
			providerId: 'anthropic',
			canHandle: (modelId: string) => modelId.startsWith('claude-'),
			create: () => createMockProvider('anthropic'),
		});
		service.registerFactory({
			providerId: 'openai',
			canHandle: (modelId: string) => modelId.startsWith('gpt-') || modelId.startsWith('o'),
			create: () => createMockProvider('openai'),
		});

		const anthropicResult = service.resolve('claude-sonnet-4-20250514');
		assert.strictEqual(anthropicResult.identity.provider, 'anthropic');

		const openaiResult = service.resolve('gpt-4o');
		assert.strictEqual(openaiResult.identity.provider, 'openai');

		const oResult = service.resolve('o3-pro');
		assert.strictEqual(oResult.identity.provider, 'openai');
	});
});
