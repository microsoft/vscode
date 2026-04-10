/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { beforeEach, describe, expect, it } from 'vitest';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { IChatMLFetcher } from '../../../chat/common/chatMLFetcher';

import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { ICAPIClientService } from '../../../endpoint/common/capiClient';
import { IDomainService } from '../../../endpoint/common/domainService';
import { IChatModelInformation } from '../../../endpoint/common/endpointProvider';
import { IEnvService } from '../../../env/common/envService';
import { ILogService } from '../../../log/common/logService';
import { IFetcherService } from '../../../networking/common/fetcherService';
import { ICreateEndpointBodyOptions } from '../../../networking/common/networking';
import { IChatWebSocketManager } from '../../../networking/node/chatWebSocketManager';
import { NullExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../telemetry/common/telemetry';
import { ITokenizerProvider } from '../../../tokenizer/node/tokenizer';
import { ChatEndpoint } from '../chatEndpoint';
import { CopilotChatEndpoint } from '../copilotChatEndpoint';

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
	instantiationService: {} as IInstantiationService,
	configurationService: new InMemoryConfigurationService(new DefaultsOnlyConfigurationService()),
	expService: new NullExperimentationService(),
	chatWebSocketService: {} as IChatWebSocketManager,
	logService: {} as ILogService
});



const createNonAnthropicModelMetadata = (family: string): IChatModelInformation => ({
	id: `${family}-test`,
	vendor: `${family} Vendor`,
	name: `${family} Test Model`,
	version: '1.0',
	model_picker_enabled: true,
	is_chat_default: false,
	is_chat_fallback: false,
	capabilities: {
		type: 'chat',
		family: family,
		tokenizer: 'o200k_base' as any,
		supports: {
			parallel_tool_calls: true,
			streaming: true,
			tool_calls: true,
			vision: false,
			prediction: false,
			thinking: false
		},
		limits: {
			max_prompt_tokens: 8192,
			max_output_tokens: 4096,
			max_context_window_tokens: 12288
		}
	}
});

describe('CopilotChatEndpoint - Reasoning Properties', () => {
	let mockServices: ReturnType<typeof createMockServices>;
	let modelMetadata: IChatModelInformation;

	beforeEach(() => {
		mockServices = createMockServices();
		modelMetadata = {
			id: 'copilot-base',
			vendor: 'Copilot',
			name: 'Copilot Base',
			version: '1.0',
			model_picker_enabled: true,
			is_chat_default: true,
			is_chat_fallback: false,
			capabilities: {
				type: 'chat',
				family: 'copilot',
				tokenizer: 'o200k_base' as any,
				supports: {
					parallel_tool_calls: true,
					streaming: true,
					tool_calls: true,
					vision: false,
					prediction: false,
					thinking: true
				},
				limits: {
					max_prompt_tokens: 8192,
					max_output_tokens: 4096,
					max_context_window_tokens: 12288
				}
			}
		};
	});

	describe('CAPI reasoning properties', () => {
		it('should set reasoning_opaque and reasoning_text properties when processing thinking content', () => {
			const endpoint = new CopilotChatEndpoint(
				modelMetadata,
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

			const thinkingMessage = createThinkingMessage('copilot-thinking-abc', 'copilot reasoning process');
			const options = createTestOptions([thinkingMessage]);

			const body = endpoint.createRequestBody(options);

			expect(body.messages).toBeDefined();
			const messages = body.messages as any[];
			expect(messages).toHaveLength(1);
			expect(messages[0].reasoning_opaque).toBe('copilot-thinking-abc');
			expect(messages[0].reasoning_text).toBe('copilot reasoning process');
		});

		it('should handle multiple messages with thinking content', () => {
			const endpoint = new CopilotChatEndpoint(
				modelMetadata,
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
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Help me with code' }]
			};
			const thinkingMessage = createThinkingMessage('copilot-reasoning-def', 'analyzing the code request');
			const options = createTestOptions([userMessage, thinkingMessage]);

			const body = endpoint.createRequestBody(options);

			expect(body.messages).toBeDefined();
			const messages = body.messages as any[];
			expect(messages).toHaveLength(2);

			// User message should not have reasoning properties
			expect(messages[0].reasoning_opaque).toBeUndefined();
			expect(messages[0].reasoning_text).toBeUndefined();

			// Assistant message should have reasoning properties
			expect(messages[1].reasoning_opaque).toBe('copilot-reasoning-def');
			expect(messages[1].reasoning_text).toBe('analyzing the code request');
		});

		it('should handle messages without thinking content', () => {
			const endpoint = new CopilotChatEndpoint(
				modelMetadata,
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
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Regular response' }]
			};
			const options = createTestOptions([regularMessage]);

			const body = endpoint.createRequestBody(options);

			expect(body.messages).toBeDefined();
			const messages = body.messages as any[];
			expect(messages).toHaveLength(1);
			expect(messages[0].reasoning_opaque).toBeUndefined();
			expect(messages[0].reasoning_text).toBeUndefined();
		});
	});
});

describe('ChatEndpoint - Image Count Validation', () => {
	let mockServices: ReturnType<typeof createMockServices>;

	beforeEach(() => {
		mockServices = createMockServices();
	});

	const createImageMessage = (): Raw.ChatMessage => ({
		role: Raw.ChatRole.User,
		content: [
			{ type: Raw.ChatCompletionContentPartKind.Text, text: 'What is in this image?' },
			{ type: Raw.ChatCompletionContentPartKind.Image, imageUrl: { url: 'data:image/png;base64,test' } }
		]
	});

	const createGeminiModelMetadata = (maxPromptImages: number): IChatModelInformation => {
		const baseMetadata = createNonAnthropicModelMetadata('gemini-3');
		return {
			...baseMetadata,
			capabilities: {
				...baseMetadata.capabilities,
				supports: {
					...baseMetadata.capabilities.supports,
					vision: true
				},
				limits: {
					...baseMetadata.capabilities.limits,
					vision: {
						max_prompt_images: maxPromptImages
					}
				}
			}
		};
	};

	it('should throw error when image count exceeds maxPromptImages', () => {
		const modelMetadata = createGeminiModelMetadata(2);

		const endpoint = new ChatEndpoint(
			modelMetadata,
			mockServices.domainService,
			mockServices.chatMLFetcher,
			mockServices.tokenizerProvider,
			mockServices.instantiationService,
			mockServices.configurationService,
			mockServices.expService,
			mockServices.chatWebSocketService,
			mockServices.logService
		);

		// Create 3 messages each with 1 image (total 3 images)
		const options = createTestOptions([createImageMessage(), createImageMessage(), createImageMessage()]);

		expect(() => endpoint.createRequestBody(options)).toThrow(/Too many images in request/);
	});

	it('should allow requests within image limit', () => {
		const modelMetadata = createGeminiModelMetadata(5);

		const endpoint = new ChatEndpoint(
			modelMetadata,
			mockServices.domainService,
			mockServices.chatMLFetcher,
			mockServices.tokenizerProvider,
			mockServices.instantiationService,
			mockServices.configurationService,
			mockServices.expService,
			mockServices.chatWebSocketService,
			mockServices.logService
		);

		// Create 2 messages each with 1 image (total 2 images)
		const options = createTestOptions([createImageMessage(), createImageMessage()]);

		expect(() => endpoint.createRequestBody(options)).not.toThrow();
	});
});