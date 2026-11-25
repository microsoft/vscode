/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { findCustomEndpointModelSettings, resolveCustomEndpointRuntimeEndpoint, type ICustomEndpointModelSettings } from '../../common/byokCustomEndpoint.js';
import { getOllamaByokEndpoint, resolveAzureRuntimeEndpoint, resolveCustomOAIRuntimeEndpoint } from '../../common/byokVendorEndpoints.js';

suite('resolveCustomEndpointRuntimeEndpoint', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps each request format to the runtime provider that sends the same request', () => {
		const cases: Record<string, ICustomEndpointModelSettings> = {
			chatCompletionsUrl: { url: 'https://api.example.test/v1/chat/completions' },
			responsesUrl: { url: 'https://api.example.test/v1/responses', thinking: true },
			messagesUrl: { url: 'https://api.anthropic.example.test/v1/messages' },
			baseUrlDefaultsToChatCompletions: { url: 'https://api.example.test' },
			baseUrlWithResponses: { url: 'https://api.example.test/', apiType: 'responses', thinking: true },
			versionedBaseUrlWithMessages: { url: 'https://gateway.example.test/anthropic/v1', apiType: 'messages' },
			httpLocalServer: { url: 'http://127.0.0.1:11434/v1' },
			azureDeployment: { url: 'https://r.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview' },
			azureResponses: { url: 'https://r.openai.azure.com/openai/responses?api-version=2025-04-01-preview', thinking: true },
			azureV1: { url: 'https://r.openai.azure.com/openai/v1/chat/completions' },
			azureMessagesUseAnthropicAuth: { url: 'https://r.openai.azure.com/anthropic/v1/messages' },
			apimWithApiKeyHeader: { url: 'https://apim.azure-api.net/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21', requestHeaders: { 'api-key': '${apiKey}' } },
			apimWithBearerHeader: { url: 'https://apim.azure-api.net/v1/chat/completions', requestHeaders: { Authorization: 'Bearer ${apiKey}' } },
			messagesWithApiKeyHeader: { url: 'https://api.anthropic.example.test/v1/messages', requestHeaders: { 'X-Api-Key': '${apiKey}' } },
			emptyHeaders: { url: 'https://api.example.test/v1/chat/completions', requestHeaders: {} },
			emptyModelOptions: { url: 'https://api.example.test/v1/chat/completions', modelOptions: {} },
			matchingEffortFormat: { url: 'https://api.example.test/v1/chat/completions', reasoningEffortFormat: 'chat-completions' },
			// Each of these would send a different request through the runtime, so it keeps using the bridge.
			unknownApiType: { url: 'https://api.example.test/v1', apiType: 'completions' },
			streamingOff: { url: 'https://api.example.test/v1', streaming: false },
			modelOptions: { url: 'https://api.example.test/v1', modelOptions: { temperature: 0.2 } },
			modelOptionsOmittingParameter: { url: 'https://api.example.test/v1', modelOptions: { top_p: null } },
			extraHeader: { url: 'https://api.example.test/v1', requestHeaders: { 'X-Org': 'acme' } },
			literalKeyHeader: { url: 'https://api.example.test/v1', requestHeaders: { Authorization: 'Bearer sk-literal' } },
			apiKeyHeaderWithOthers: { url: 'https://api.example.test/v1', requestHeaders: { 'api-key': '${apiKey}', 'X-Org': 'acme' } },
			pathDisagreesWithApiType: { url: 'https://api.example.test/v1/chat/completions', apiType: 'responses', thinking: true },
			messagesWithoutV1: { url: 'https://api.example.test/api/messages' },
			versionedBaseUrlNotV1: { url: 'https://api.example.test/v2', apiType: 'messages' },
			queryString: { url: 'https://api.example.test/v1/chat/completions?tenant=a' },
			credentialsInUrl: { url: 'https://user:pass@api.example.test/v1' },
			apimWithoutHeaderKeepsQuery: { url: 'https://apim.azure-api.net/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21' },
			azureWithoutOpenAiPath: { url: 'https://r.openai.azure.com/chat/completions' },
			azureVersionedWithoutDeployment: { url: 'https://r.openai.azure.com/openai/chat/completions?api-version=2024-10-21' },
			azureExtraQuery: { url: 'https://r.openai.azure.com/openai/v1/chat/completions?foo=bar' },
			// The runtime always sends reasoning fields to Responses, and applies its own Claude thinking settings.
			responsesWithoutThinking: { url: 'https://api.example.test/v1/responses' },
			messagesWithThinking: { url: 'https://api.anthropic.example.test/v1/messages', thinking: true },
			messagesWithThinkingBudget: { url: 'https://api.anthropic.example.test/v1/messages', maxThinkingBudget: 8000 },
			otherEffortFormat: { url: 'https://api.example.test/v1/chat/completions', reasoningEffortFormat: 'responses' },
		};

		assert.deepStrictEqual(Object.fromEntries(Object.entries(cases).map(([name, settings]) => [name, resolveCustomEndpointRuntimeEndpoint(settings)])), {
			chatCompletionsUrl: { endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://api.example.test/v1' } },
			responsesUrl: { endpoint: { type: 'openai', wireApi: 'responses', baseUrl: 'https://api.example.test/v1' } },
			messagesUrl: { endpoint: { type: 'anthropic', baseUrl: 'https://api.anthropic.example.test' } },
			baseUrlDefaultsToChatCompletions: { endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://api.example.test/v1' } },
			baseUrlWithResponses: { endpoint: { type: 'openai', wireApi: 'responses', baseUrl: 'https://api.example.test/v1' } },
			versionedBaseUrlWithMessages: { endpoint: { type: 'anthropic', baseUrl: 'https://gateway.example.test/anthropic' } },
			httpLocalServer: { endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'http://127.0.0.1:11434/v1' } },
			azureDeployment: { endpoint: { type: 'azure', wireApi: 'completions', baseUrl: 'https://r.openai.azure.com/openai/deployments/gpt-4o', azureApiVersion: '2025-01-01-preview' } },
			azureResponses: { endpoint: { type: 'azure', wireApi: 'responses', baseUrl: 'https://r.openai.azure.com/openai', azureApiVersion: '2025-04-01-preview' } },
			azureV1: { endpoint: { type: 'azure', wireApi: 'completions', baseUrl: 'https://r.openai.azure.com/openai/v1' } },
			azureMessagesUseAnthropicAuth: { endpoint: { type: 'anthropic', baseUrl: 'https://r.openai.azure.com/anthropic' } },
			apimWithApiKeyHeader: { endpoint: { type: 'azure', wireApi: 'completions', baseUrl: 'https://apim.azure-api.net/openai/deployments/gpt-4o', azureApiVersion: '2024-10-21' } },
			apimWithBearerHeader: { endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://apim.azure-api.net/v1' } },
			messagesWithApiKeyHeader: { endpoint: { type: 'anthropic', baseUrl: 'https://api.anthropic.example.test' } },
			emptyHeaders: { endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://api.example.test/v1' } },
			emptyModelOptions: { endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://api.example.test/v1' } },
			matchingEffortFormat: { endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://api.example.test/v1' } },
			unknownApiType: { bridgeReason: 'apiType' },
			streamingOff: { bridgeReason: 'streaming' },
			modelOptions: { bridgeReason: 'modelOptions' },
			modelOptionsOmittingParameter: { bridgeReason: 'modelOptions' },
			extraHeader: { bridgeReason: 'requestHeaders' },
			literalKeyHeader: { bridgeReason: 'requestHeaders' },
			apiKeyHeaderWithOthers: { bridgeReason: 'requestHeaders' },
			pathDisagreesWithApiType: { bridgeReason: 'apiPath' },
			messagesWithoutV1: { bridgeReason: 'apiPath' },
			versionedBaseUrlNotV1: { bridgeReason: 'apiPath' },
			queryString: { bridgeReason: 'query' },
			credentialsInUrl: { bridgeReason: 'url' },
			apimWithoutHeaderKeepsQuery: { bridgeReason: 'query' },
			azureWithoutOpenAiPath: { bridgeReason: 'apiPath' },
			azureVersionedWithoutDeployment: { bridgeReason: 'apiPath' },
			azureExtraQuery: { bridgeReason: 'query' },
			responsesWithoutThinking: { bridgeReason: 'thinking' },
			messagesWithThinking: { bridgeReason: 'thinking' },
			messagesWithThinkingBudget: { bridgeReason: 'thinking' },
			otherEffortFormat: { bridgeReason: 'reasoningEffortFormat' },
		});
	});

	test('reads a model\'s settings from its provider group, falling back to the group\'s apiType', () => {
		const group = {
			name: 'Work',
			apiType: 'responses',
			models: [
				{ id: 'gpt-x', url: 'https://api.example.test/v1', toolCalling: true, thinking: true, reasoningEffortFormat: 'responses' },
				{ id: 'claude', url: 'https://api.example.test/v1', apiType: 'messages', vision: true, streaming: true, requestHeaders: { 'x-api-key': '${apiKey}' }, modelOptions: { temperature: 0 }, adaptiveThinking: true, minThinkingBudget: 1024, maxThinkingBudget: 4096 },
				{ id: 'no-url' },
			],
		};

		assert.deepStrictEqual({
			inheritsGroupApiType: findCustomEndpointModelSettings(group, 'gpt-x'),
			overridesGroupApiType: findCustomEndpointModelSettings(group, 'claude'),
			withoutUrl: findCustomEndpointModelSettings(group, 'no-url'),
			undeclared: findCustomEndpointModelSettings(group, 'other'),
			discoveredGroup: findCustomEndpointModelSettings({ name: 'Discovered', url: 'https://api.example.test/v1' }, 'gpt-x'),
			// The extension discovers a group's models at its `url` and ignores the URLs in `models`.
			discoveredGroupWithModels: findCustomEndpointModelSettings({ ...group, url: 'https://discovery.example.test/v1' }, 'gpt-x'),
		}, {
			inheritsGroupApiType: { url: 'https://api.example.test/v1', apiType: 'responses', requestHeaders: undefined, streaming: undefined, toolCalling: true, vision: undefined, modelOptions: undefined, thinking: true, adaptiveThinking: undefined, minThinkingBudget: undefined, maxThinkingBudget: undefined, reasoningEffortFormat: 'responses' },
			overridesGroupApiType: { url: 'https://api.example.test/v1', apiType: 'messages', requestHeaders: { 'x-api-key': '${apiKey}' }, streaming: true, toolCalling: undefined, vision: true, modelOptions: { temperature: 0 }, thinking: undefined, adaptiveThinking: true, minThinkingBudget: 1024, maxThinkingBudget: 4096, reasoningEffortFormat: undefined },
			withoutUrl: undefined,
			undeclared: undefined,
			discoveredGroup: undefined,
			discoveredGroupWithModels: undefined,
		});
	});
});

suite('BYOK vendor endpoints', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves Azure and Custom OpenAI Compatible models by their providers\' URL rules', () => {
		assert.deepStrictEqual({
			azureDeployment: resolveAzureRuntimeEndpoint('gpt-4o', { url: 'https://r.openai.azure.com/' }),
			azureInference: resolveAzureRuntimeEndpoint('phi', { url: 'https://phi.models.ai.azure.com/v1' }),
			azureExplicitPath: resolveAzureRuntimeEndpoint('gpt-4o', { url: 'https://r.openai.azure.com/openai/v1/chat/completions' }),
			azureUnknownHost: resolveAzureRuntimeEndpoint('gpt-4o', { url: 'https://example.test/v1' }),
			azureHeaders: resolveAzureRuntimeEndpoint('gpt-4o', { url: 'https://r.openai.azure.com/', requestHeaders: { 'x-ms-tenant': 'a' } }),
			customOAIBase: resolveCustomOAIRuntimeEndpoint({ url: 'https://api.example.test/v2' }),
			customOAIResponses: resolveCustomOAIRuntimeEndpoint({ url: 'https://api.example.test/v1/responses', thinking: true }),
			// The provider sends extra headers and has no `/messages` API path.
			customOAIHeaders: resolveCustomOAIRuntimeEndpoint({ url: 'https://api.example.test/v1', requestHeaders: { Authorization: 'Bearer ${apiKey}' } }),
			customOAIMessages: resolveCustomOAIRuntimeEndpoint({ url: 'https://api.example.test/v1/messages' }),
			ollama: getOllamaByokEndpoint(undefined),
			ollamaConfigured: getOllamaByokEndpoint('http://gpu.example.test:11434'),
		}, {
			azureDeployment: { endpoint: { type: 'azure', wireApi: 'completions', baseUrl: 'https://r.openai.azure.com/openai/deployments/gpt-4o', azureApiVersion: '2025-01-01-preview' } },
			azureInference: { endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://phi.models.ai.azure.com/v1' } },
			azureExplicitPath: { endpoint: { type: 'azure', wireApi: 'completions', baseUrl: 'https://r.openai.azure.com/openai/v1' } },
			azureUnknownHost: { bridgeReason: 'url' },
			azureHeaders: { bridgeReason: 'requestHeaders' },
			customOAIBase: { endpoint: { type: 'openai', wireApi: 'completions', baseUrl: 'https://api.example.test/v2' } },
			customOAIResponses: { endpoint: { type: 'openai', wireApi: 'responses', baseUrl: 'https://api.example.test/v1' } },
			customOAIHeaders: { bridgeReason: 'requestHeaders' },
			customOAIMessages: { bridgeReason: 'apiPath' },
			ollama: { type: 'openai', wireApi: 'completions', baseUrl: 'http://localhost:11434/v1' },
			ollamaConfigured: { type: 'openai', wireApi: 'completions', baseUrl: 'http://gpu.example.test:11434/v1' },
		});
	});
});
