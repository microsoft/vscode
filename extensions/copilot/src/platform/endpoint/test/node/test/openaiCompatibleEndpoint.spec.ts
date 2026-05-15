/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { beforeEach, describe, expect, it } from 'vitest';
import { IAuthenticationService } from '../../../../../platform/authentication/common/authentication';
import { IChatMLFetcher } from '../../../../../platform/chat/common/chatMLFetcher';
import { IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { ICAPIClientService } from '../../../../../platform/endpoint/common/capiClient';
import { IDomainService } from '../../../../../platform/endpoint/common/domainService';
import { ModelSupportedEndpoint } from '../../../../../platform/endpoint/common/endpointProvider';
import { IEnvService } from '../../../../../platform/env/common/envService';
import { ILogService } from '../../../../../platform/log/common/logService';
import { IFetcherService } from '../../../../../platform/networking/common/fetcherService';
import { ICreateEndpointBodyOptions } from '../../../../../platform/networking/common/networking';
import { IChatWebSocketManager } from '../../../../../platform/networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry';
import { ITokenizerProvider } from '../../../../../platform/tokenizer/node/tokenizer';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { IModelConfig, OpenAICompatibleTestEndpoint } from '../openaiCompatibleEndpoint';

// Test fixtures for thinking content
const createThinkingMessage = (thinkingId: string, thinkingText: string): Raw.ChatMessage => ({
	role: Raw.ChatRole.Assistant,
	content: [
		{
			type: Raw.ChatCompletionContentPartKind.Opaque,
			value: {
				type: 'thinking',
				thinking: {
					id: thinkingId,
					text: thinkingText
				}
			}
		}
	]
});

const createTestOptions = (messages: Raw.ChatMessage[]): ICreateEndpointBodyOptions => ({
	debugName: 'test',
	messages,
	requestId: 'test-req-123',
	postOptions: {},
	finishedCb: undefined,
	location: undefined as any
});

// Mock implementations
const createMockServices = () => ({
	fetcherService: {} as IFetcherService,
	domainService: {} as IDomainService,
	capiClientService: {} as ICAPIClientService,
	envService: {} as IEnvService,
	telemetryService: {} as ITelemetryService,
	authService: {} as IAuthenticationService,
	chatMLFetcher: {} as IChatMLFetcher,
	tokenizerProvider: {} as ITokenizerProvider,
	instantiationService: {
		createInstance: (ctor: any, ...args: any[]) => new ctor(...args)
	} as IInstantiationService,
	configurationService: {
		getExperimentBasedConfig: () => false
	} as unknown as IConfigurationService,
	expService: {} as IExperimentationService,
	chatWebSocketService: {} as IChatWebSocketManager,
	logService: {} as ILogService
});

describe('OpenAICompatibleTestEndpoint - Reasoning Properties', () => {
	let mockServices: ReturnType<typeof createMockServices>;
	let modelConfig: IModelConfig;

	beforeEach(() => {
		mockServices = createMockServices();
		modelConfig = {
			id: 'test-openai-compatible',
			name: 'Test OpenAI Compatible Model',
			version: '1.0',
			useDeveloperRole: false,
			type: 'openai',
			url: 'https://api.example.com/v1/chat/completions',
			auth: {
				useBearerHeader: true,
				useApiKeyHeader: false,
				apiKeyEnvName: 'OPENAI_API_KEY'
			},
			overrides: {
				requestHeaders: {}
			},
			capabilities: {
				supports: {
					parallel_tool_calls: true,
					streaming: true,
					tool_calls: true,
					vision: false,
					prediction: false,
					thinking: false
				},
				limits: {
					max_prompt_tokens: 4096,
					max_output_tokens: 2048,
					max_context_window_tokens: 6144
				}
			},
			supported_endpoints: [ModelSupportedEndpoint.ChatCompletions]
		};
	});

	describe('CAPI reasoning properties', () => {
		it('should set cot_id and cot_summary properties when processing thinking content', () => {
			const endpoint = new OpenAICompatibleTestEndpoint(
				modelConfig,
				mockServices.domainService,
				mockServices.capiClientService,
				mockServices.fetcherService,
				mockServices.envService,
				mockServices.telemetryService,
				mockServices.authService,
				mockServices.chatMLFetcher,
				mockServices.tokenizerProvider,
				mockServices.instantiationService,
				mockServices.configurationService,
				mockServices.expService,
				mockServices.chatWebSocketService,
				mockServices.logService
			);

			const thinkingMessage = createThinkingMessage('openai-compat-123', 'openai compatible reasoning');
			const options = createTestOptions([thinkingMessage]);

			const body = endpoint.createRequestBody(options);

			expect(body.messages).toBeDefined();
			const messages = body.messages as any[];
			expect(messages).toHaveLength(1);
			expect(messages[0].cot_id).toBe('openai-compat-123');
			expect(messages[0].cot_summary).toBe('openai compatible reasoning');
		});

		it('should handle multiple messages with thinking content', () => {
			const endpoint = new OpenAICompatibleTestEndpoint(
				modelConfig,
				mockServices.domainService,
				mockServices.capiClientService,
				mockServices.fetcherService,
				mockServices.envService,
				mockServices.telemetryService,
				mockServices.authService,
				mockServices.chatMLFetcher,
				mockServices.tokenizerProvider,
				mockServices.instantiationService,
				mockServices.configurationService,
				mockServices.expService,
				mockServices.chatWebSocketService,
				mockServices.logService
			);

			const userMessage: Raw.ChatMessage = {
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Generate code' }]
			};
			const thinkingMessage = createThinkingMessage('compat-reasoning-456', 'thinking about the code generation');
			const options = createTestOptions([userMessage, thinkingMessage]);

			const body = endpoint.createRequestBody(options);

			expect(body.messages).toBeDefined();
			const messages = body.messages as any[];
			expect(messages).toHaveLength(2);

			// User message should not have reasoning properties
			expect(messages[0].cot_id).toBeUndefined();
			expect(messages[0].cot_summary).toBeUndefined();

			// Assistant message should have reasoning properties
			expect(messages[1].cot_id).toBe('compat-reasoning-456');
			expect(messages[1].cot_summary).toBe('thinking about the code generation');
		});

		it('should handle messages without thinking content', () => {
			const endpoint = new OpenAICompatibleTestEndpoint(
				modelConfig,
				mockServices.domainService,
				mockServices.capiClientService,
				mockServices.fetcherService,
				mockServices.envService,
				mockServices.telemetryService,
				mockServices.authService,
				mockServices.chatMLFetcher,
				mockServices.tokenizerProvider,
				mockServices.instantiationService,
				mockServices.configurationService,
				mockServices.expService,
				mockServices.chatWebSocketService,
				mockServices.logService
			);

			const regularMessage: Raw.ChatMessage = {
				role: Raw.ChatRole.Assistant,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Here is your code' }]
			};
			const options = createTestOptions([regularMessage]);

			const body = endpoint.createRequestBody(options);

			expect(body.messages).toBeDefined();
			const messages = body.messages as any[];
			expect(messages).toHaveLength(1);
			expect(messages[0].cot_id).toBeUndefined();
			expect(messages[0].cot_summary).toBeUndefined();
		});

		it('should work with Azure OpenAI configuration', () => {
			const azureModelConfig: IModelConfig = {
				...modelConfig,
				type: 'azureOpenai',
				url: 'https://myresource.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2023-12-01-preview',
				auth: {
					useBearerHeader: false,
					useApiKeyHeader: true,
					apiKeyEnvName: 'AZURE_OPENAI_API_KEY'
				}
			};

			const endpoint = new OpenAICompatibleTestEndpoint(
				azureModelConfig,
				mockServices.domainService,
				mockServices.capiClientService,
				mockServices.fetcherService,
				mockServices.envService,
				mockServices.telemetryService,
				mockServices.authService,
				mockServices.chatMLFetcher,
				mockServices.tokenizerProvider,
				mockServices.instantiationService,
				mockServices.configurationService,
				mockServices.expService,
				mockServices.chatWebSocketService,
				mockServices.logService
			);

			const thinkingMessage = createThinkingMessage('azure-thinking-789', 'azure reasoning process');
			const options = createTestOptions([thinkingMessage]);

			const body = endpoint.createRequestBody(options);

			expect(body.messages).toBeDefined();
			const messages = body.messages as any[];
			expect(messages).toHaveLength(1);
			expect(messages[0].cot_id).toBe('azure-thinking-789');
			expect(messages[0].cot_summary).toBe('azure reasoning process');
		});
	});
});