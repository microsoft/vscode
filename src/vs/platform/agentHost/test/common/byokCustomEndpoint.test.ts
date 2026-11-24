/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { findCustomEndpointModelSettings, getCustomEndpointModelSourceCredentialResource, readCustomEndpointModelSource, resolveCustomEndpointRuntimeEndpoint, toCustomEndpointModelSourceModel, type CustomEndpointModelSourceDefinition, type ICustomEndpointModelSettings } from '../../common/byokCustomEndpoint.js';

suite('resolveCustomEndpointRuntimeEndpoint', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps each request format to the runtime provider that sends the same request', () => {
		const cases: Record<string, ICustomEndpointModelSettings> = {
			chatCompletionsUrl: { url: 'https://api.example.test/v1/chat/completions' },
			responsesUrl: { url: 'https://api.example.test/v1/responses' },
			messagesUrl: { url: 'https://api.anthropic.example.test/v1/messages' },
			baseUrlDefaultsToChatCompletions: { url: 'https://api.example.test' },
			baseUrlWithResponses: { url: 'https://api.example.test/', apiType: 'responses' },
			versionedBaseUrlWithMessages: { url: 'https://gateway.example.test/anthropic/v1', apiType: 'messages' },
			httpLocalServer: { url: 'http://127.0.0.1:11434/v1' },
			azureDeployment: { url: 'https://r.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview' },
			azureResponses: { url: 'https://r.openai.azure.com/openai/responses?api-version=2025-04-01-preview' },
			azureV1: { url: 'https://r.openai.azure.com/openai/v1/chat/completions' },
			azureMessagesUseAnthropicAuth: { url: 'https://r.openai.azure.com/anthropic/v1/messages' },
			apimWithApiKeyHeader: { url: 'https://apim.azure-api.net/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21', requestHeaders: { 'api-key': '${apiKey}' } },
			apimWithBearerHeader: { url: 'https://apim.azure-api.net/v1/chat/completions', requestHeaders: { Authorization: 'Bearer ${apiKey}' } },
			messagesWithApiKeyHeader: { url: 'https://api.anthropic.example.test/v1/messages', requestHeaders: { 'X-Api-Key': '${apiKey}' } },
			emptyHeaders: { url: 'https://api.example.test/v1/chat/completions', requestHeaders: {} },
			emptyModelOptions: { url: 'https://api.example.test/v1/chat/completions', modelOptions: {} },
			// Each of these would send a different request through the runtime, so it keeps using the bridge.
			unknownApiType: { url: 'https://api.example.test/v1', apiType: 'completions' },
			streamingOff: { url: 'https://api.example.test/v1', streaming: false },
			modelOptions: { url: 'https://api.example.test/v1', modelOptions: { temperature: 0.2 } },
			modelOptionsOmittingParameter: { url: 'https://api.example.test/v1', modelOptions: { top_p: null } },
			extraHeader: { url: 'https://api.example.test/v1', requestHeaders: { 'X-Org': 'acme' } },
			literalKeyHeader: { url: 'https://api.example.test/v1', requestHeaders: { Authorization: 'Bearer sk-literal' } },
			apiKeyHeaderWithOthers: { url: 'https://api.example.test/v1', requestHeaders: { 'api-key': '${apiKey}', 'X-Org': 'acme' } },
			pathDisagreesWithApiType: { url: 'https://api.example.test/v1/chat/completions', apiType: 'responses' },
			messagesWithoutV1: { url: 'https://api.example.test/api/messages' },
			versionedBaseUrlNotV1: { url: 'https://api.example.test/v2', apiType: 'messages' },
			queryString: { url: 'https://api.example.test/v1/chat/completions?tenant=a' },
			credentialsInUrl: { url: 'https://user:pass@api.example.test/v1' },
			apimWithoutHeaderKeepsQuery: { url: 'https://apim.azure-api.net/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21' },
			azureWithoutOpenAiPath: { url: 'https://r.openai.azure.com/chat/completions' },
			azureVersionedWithoutDeployment: { url: 'https://r.openai.azure.com/openai/chat/completions?api-version=2024-10-21' },
			azureExtraQuery: { url: 'https://r.openai.azure.com/openai/v1/chat/completions?foo=bar' },
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
		});
	});

	test('reads a model\'s settings from its provider group, falling back to the group\'s apiType', () => {
		const group = {
			name: 'Work',
			apiType: 'responses',
			models: [
				{ id: 'gpt-x', url: 'https://api.example.test/v1', toolCalling: true },
				{ id: 'claude', url: 'https://api.example.test/v1', apiType: 'messages', vision: true, streaming: true, requestHeaders: { 'x-api-key': '${apiKey}' }, modelOptions: { temperature: 0 } },
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
			inheritsGroupApiType: { url: 'https://api.example.test/v1', apiType: 'responses', requestHeaders: undefined, streaming: undefined, toolCalling: true, vision: undefined, modelOptions: undefined },
			overridesGroupApiType: { url: 'https://api.example.test/v1', apiType: 'messages', requestHeaders: { 'x-api-key': '${apiKey}' }, streaming: true, toolCalling: undefined, vision: true, modelOptions: { temperature: 0 } },
			withoutUrl: undefined,
			undeclared: undefined,
			discoveredGroup: undefined,
			discoveredGroupWithModels: undefined,
		});
	});
});

suite('Custom Endpoint model source definition', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('carries the models the runtime can call directly and reads them back with their endpoints', () => {
		const info = { name: 'GPT X', maxInputTokens: 100, maxOutputTokens: 20, maxContextWindowTokens: 120, reasoningEfforts: ['low', 'high'], defaultReasoningEffort: 'low' };
		const direct = toCustomEndpointModelSourceModel('gpt-x', { url: 'https://api.example.test/v1/responses', requestHeaders: { Authorization: 'Bearer ${apiKey}' }, toolCalling: true }, info);
		const bridged = toCustomEndpointModelSourceModel('slow', { url: 'https://api.example.test/v1', streaming: false }, {});
		const definition: CustomEndpointModelSourceDefinition = { models: [direct.model!], requiresApiKey: true };

		assert.deepStrictEqual({
			direct: direct.model,
			bridgeReason: bridged.bridgeReason,
			read: readCustomEndpointModelSource(definition).models.map(entry => entry.endpoint),
			credentialResource: getCustomEndpointModelSourceCredentialResource(definition),
			keylessCredentialResource: getCustomEndpointModelSourceCredentialResource({ ...definition, requiresApiKey: false }),
		}, {
			// Unknown vision stays absent rather than becoming `false`.
			direct: { id: 'gpt-x', name: 'GPT X', url: 'https://api.example.test/v1/responses', requestHeaders: { Authorization: 'Bearer ${apiKey}' }, toolCalling: true, maxInputTokens: 100, maxOutputTokens: 20, maxContextWindowTokens: 120, reasoningEfforts: ['low', 'high'], defaultReasoningEffort: 'low' },
			bridgeReason: 'streaming',
			read: [{ type: 'openai', wireApi: 'responses', baseUrl: 'https://api.example.test/v1' }],
			credentialResource: { resource: 'https://api.example.test/v1/responses' },
			keylessCredentialResource: undefined,
		});
	});

	test('rejects definitions the runtime would send differently', () => {
		const model = { id: 'gpt-x', url: 'https://api.example.test/v1/chat/completions' };
		const invalid: Record<string, unknown> = {
			notAnObject: 'models',
			noModels: { models: [], requiresApiKey: false },
			noKeyDeclaration: { models: [model] },
			duplicateIds: { models: [model, model], requiresApiKey: false },
			unknownModelKey: { models: [{ ...model, modelOptions: { temperature: 0 } }], requiresApiKey: false },
			badTokenCount: { models: [{ ...model, maxInputTokens: -1 }], requiresApiKey: false },
			customHeader: { models: [{ ...model, requestHeaders: { 'x-custom': 'value' } }], requiresApiKey: false },
		};
		const rejected = Object.entries(invalid).filter(([, definition]) => {
			try {
				readCustomEndpointModelSource(definition);
				return false;
			} catch {
				return true;
			}
		}).map(([name]) => name);

		assert.deepStrictEqual(rejected, Object.keys(invalid));
	});
});
