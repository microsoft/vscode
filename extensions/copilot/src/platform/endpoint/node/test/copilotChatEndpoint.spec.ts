/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { beforeEach, describe, expect, it } from 'vitest';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { IChatMLFetcher } from '../../../chat/common/chatMLFetcher';

import { ConfigKey } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { ICAPIClientService } from '../../../endpoint/common/capiClient';
import { IDomainService } from '../../../endpoint/common/domainService';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../../endpoint/common/endpointProvider';
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
			id: 'copilot-utility',
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

	const createImageMessage = (imageCount: number = 1): Raw.ChatMessage => ({
		role: Raw.ChatRole.User,
		content: [
			{ type: Raw.ChatCompletionContentPartKind.Text, text: 'What is in this image?' },
			...Array.from({ length: imageCount }, () => ({
				type: Raw.ChatCompletionContentPartKind.Image as const,
				imageUrl: { url: 'data:image/png;base64,test' }
			}))
		]
	});

	const createAssistantMessage = (): Raw.ChatMessage => ({
		role: Raw.ChatRole.Assistant,
		content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'I see an image.' }]
	});

	const createGeminiModelMetadata = (maxPromptImages?: number): IChatModelInformation => {
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
					...(maxPromptImages !== undefined ? { vision: { max_prompt_images: maxPromptImages } } : {})
				}
			}
		};
	};

	const createAnthropicMessagesModelMetadata = (): IChatModelInformation => {
		const baseMetadata = createNonAnthropicModelMetadata('claude-sonnet-4');
		return {
			...baseMetadata,
			supported_endpoints: [ModelSupportedEndpoint.Messages],
			capabilities: {
				...baseMetadata.capabilities,
				supports: {
					...baseMetadata.capabilities.supports,
					vision: true
				}
			}
		};
	};

	const createEndpoint = (metadata: IChatModelInformation) =>
		new ChatEndpoint(
			metadata,
			mockServices.domainService,
			mockServices.chatMLFetcher,
			mockServices.tokenizerProvider,
			mockServices.instantiationService,
			mockServices.configurationService,
			mockServices.expService,
			mockServices.chatWebSocketService,
			mockServices.logService
		);

	const countImages = (messages: Raw.ChatMessage[]): number => {
		let count = 0;
		for (const msg of messages) {
			if (Array.isArray(msg.content)) {
				for (const part of msg.content) {
					if (part.type === Raw.ChatCompletionContentPartKind.Image) {
						count++;
					}
				}
			}
		}
		return count;
	};

	// Exercises the private `validateAndFilterImages` method directly so we can
	// assert on the filtered messages without being blocked by downstream mocks.
	const filterImages = (endpoint: ChatEndpoint, messages: Raw.ChatMessage[], maxImages: number): Raw.ChatMessage[] => {
		return (endpoint as unknown as { validateAndFilterImages(m: Raw.ChatMessage[], n: number): Raw.ChatMessage[] })
			.validateAndFilterImages(messages, maxImages);
	};

	describe('Gemini image limits', () => {
		it('should allow requests within image limit', () => {
			const endpoint = createEndpoint(createGeminiModelMetadata(5));
			const messages = [createImageMessage(), createImageMessage()];
			const options = createTestOptions(messages);
			expect(() => endpoint.createRequestBody(options)).not.toThrow();
			// Input is within limit — messages should be returned untouched.
			expect(filterImages(endpoint, messages, 5)).toBe(messages);
		});

		it('should silently filter history images when total exceeds limit', () => {
			const endpoint = createEndpoint(createGeminiModelMetadata(3));
			// 2 history user messages with 1 image each + current user message with 2 images = 4 total > 3 limit
			const messages = [
				createImageMessage(),
				createAssistantMessage(),
				createImageMessage(),
				createAssistantMessage(),
				createImageMessage(2),
			];
			expect(() => endpoint.createRequestBody(createTestOptions(messages))).not.toThrow();
			const filtered = filterImages(endpoint, messages, 3);
			// Total image parts in the filtered output must not exceed the limit.
			expect(countImages(filtered)).toBeLessThanOrEqual(3);
			// Current user message (last) must retain all 2 of its images.
			expect(countImages([filtered[filtered.length - 1]])).toBe(2);
			// Original messages must not be mutated.
			expect(countImages(messages)).toBe(4);
		});
	});

	describe('Anthropic Messages API image limits', () => {
		it('should allow requests within image limit', () => {
			const endpoint = createEndpoint(createAnthropicMessagesModelMetadata());
			const messages = [createImageMessage(5)];
			// Within limit — filter must not alter the messages.
			expect(filterImages(endpoint, messages, 20)).toBe(messages);
		});

		it('should silently filter history images when total exceeds limit', () => {
			const endpoint = createEndpoint(createAnthropicMessagesModelMetadata());
			// Build history with 18 images + current message with 5 images = 23 total > 20 limit
			const messages: Raw.ChatMessage[] = [];
			for (let i = 0; i < 18; i++) {
				messages.push(createImageMessage());
				messages.push(createAssistantMessage());
			}
			messages.push(createImageMessage(5));
			const filtered = filterImages(endpoint, messages, 20);
			expect(countImages(filtered)).toBeLessThanOrEqual(20);
			// Current user message must retain all 5 of its images.
			expect(countImages([filtered[filtered.length - 1]])).toBe(5);
			// Original messages must not be mutated.
			expect(countImages(messages)).toBe(23);
		});
	});

	describe('non-limited models', () => {
		it('should not apply image limits to non-Anthropic non-Gemini models', () => {
			const metadata = createNonAnthropicModelMetadata('gpt-4o');
			const endpoint = createEndpoint(metadata);
			// 25 images should not throw for a non-limited model
			const options = createTestOptions([createImageMessage(25)]);
			expect(() => endpoint.createRequestBody(options)).not.toThrow();
		});
	});

	describe('edge cases', () => {
		it('should filter tool-result images in history the same as user images', () => {
			const endpoint = createEndpoint(createGeminiModelMetadata(2));
			const toolResultImage: Raw.ChatMessage = {
				role: Raw.ChatRole.Tool,
				toolCallId: 'tool-1',
				content: [
					{ type: Raw.ChatCompletionContentPartKind.Image, imageUrl: { url: 'https://example.com/tool.png' } }
				]
			};
			// 2 tool-result images in history + 1 current user image = 3 total > 2 limit
			const messages: Raw.ChatMessage[] = [
				toolResultImage,
				createAssistantMessage(),
				toolResultImage,
				createAssistantMessage(),
				createImageMessage(1),
			];
			const filtered = filterImages(endpoint, messages, 2);
			expect(countImages(filtered)).toBeLessThanOrEqual(2);
			// Original messages must not be mutated.
			expect(countImages(messages)).toBe(3);
		});

		it('should ignore an overly-restrictive server-provided maxPromptImages and use the hardcoded Gemini limit of 10', () => {
			// Server reports max_prompt_images: 1 but the true Gemini limit is 10.
			// 2 images in the current turn must not throw.
			const endpoint = createEndpoint(createGeminiModelMetadata(1));
			const options = createTestOptions([createImageMessage(2)]);
			expect(() => endpoint.createRequestBody(options)).not.toThrow();
		});

		it('should throw using the hardcoded Gemini limit of 10 when the current turn exceeds it', () => {
			const endpoint = createEndpoint(createGeminiModelMetadata(1));
			const options = createTestOptions([createImageMessage(11)]);
			expect(() => endpoint.createRequestBody(options)).toThrow(/maximum of 10 images/);
		});

		it('should throw using the hardcoded Anthropic Messages limit of 20 when the current turn exceeds it', () => {
			const endpoint = createEndpoint(createAnthropicMessagesModelMetadata());
			const options = createTestOptions([createImageMessage(21)]);
			expect(() => endpoint.createRequestBody(options)).toThrow(/maximum of 20 images/);
		});

		it('should throw a clear error when the current turn alone exceeds the limit', () => {
			const endpoint = createEndpoint(createGeminiModelMetadata(2));
			// Current user message has 5 images, limit is 2. History has 1 image.
			const messages = [
				createImageMessage(),
				createAssistantMessage(),
				createImageMessage(5),
			];
			expect(() => filterImages(endpoint, messages, 2)).toThrow(/Too many images/);
		});
	});
});

describe('ChatEndpoint - Kimi temperature and top_p override', () => {
	let mockServices: ReturnType<typeof createMockServices>;

	beforeEach(() => {
		mockServices = createMockServices();
	});

	const createEndpoint = (metadata: IChatModelInformation) =>
		new ChatEndpoint(
			metadata,
			mockServices.domainService,
			mockServices.chatMLFetcher,
			mockServices.tokenizerProvider,
			mockServices.instantiationService,
			mockServices.configurationService,
			mockServices.expService,
			mockServices.chatWebSocketService,
			mockServices.logService
		);

	const createTextMessage = (): Raw.ChatMessage => ({
		role: Raw.ChatRole.User,
		content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }]
	});

	const createOptionsWithPostOptions = (): ICreateEndpointBodyOptions => ({
		...createTestOptions([createTextMessage()]),
		postOptions: { temperature: 0, top_p: 1 }
	});

	it.each(['kimi-k2.6', 'kimi-k2.7-code'])('should force temperature=1 and top_p=0.95 for %s', (family) => {
		const endpoint = createEndpoint(createNonAnthropicModelMetadata(family));
		const body = endpoint.createRequestBody(createOptionsWithPostOptions());
		expect(body.temperature).toBe(1);
		expect(body.top_p).toBe(0.95);
	});

	it('should not override temperature or top_p for non-Kimi models', () => {
		const endpoint = createEndpoint(createNonAnthropicModelMetadata('gpt-4o'));
		const body = endpoint.createRequestBody(createOptionsWithPostOptions());
		expect(body.temperature).toBe(0);
		expect(body.top_p).toBe(1);
	});
});

describe('ChatEndpoint - CAPI reasoning effort', () => {
	let mockServices: ReturnType<typeof createMockServices>;

	beforeEach(() => {
		mockServices = createMockServices();
	});

	const createEndpoint = (metadata: IChatModelInformation) =>
		new ChatEndpoint(
			metadata,
			mockServices.domainService,
			mockServices.chatMLFetcher,
			mockServices.tokenizerProvider,
			mockServices.instantiationService,
			mockServices.configurationService,
			mockServices.expService,
			mockServices.chatWebSocketService,
			mockServices.logService
		);

	// A CAPI chat-completions model (no supported_endpoints) that optionally
	// declares the reasoning effort levels it accepts, mirroring how Gemini
	// models are hydrated from the CAPI `/models` response.
	const createReasoningModelMetadata = (family: string, reasoningEffort?: string[]): IChatModelInformation => {
		const base = createNonAnthropicModelMetadata(family);
		return {
			...base,
			capabilities: {
				...base.capabilities,
				supports: {
					...base.capabilities.supports,
					...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {})
				}
			}
		};
	};

	const createTextMessage = (): Raw.ChatMessage => ({
		role: Raw.ChatRole.User,
		content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }]
	});

	const createOptions = (reasoningEffort?: string): ICreateEndpointBodyOptions => ({
		...createTestOptions([createTextMessage()]),
		modelCapabilities: reasoningEffort ? { reasoningEffort } : undefined
	});

	it('applies the UI-selected reasoning effort for a CAPI model that declares support', () => {
		const endpoint = createEndpoint(createReasoningModelMetadata('gemini-2.5-pro', ['low', 'medium', 'high']));
		const body = endpoint.createRequestBody(createOptions('high'));
		expect(body.reasoning_effort).toBe('high');
	});

	it('lets the ReasoningEffortOverride setting win over the UI selection', () => {
		mockServices.configurationService.setConfig(ConfigKey.Advanced.ReasoningEffortOverride, 'low');
		const endpoint = createEndpoint(createReasoningModelMetadata('gemini-2.5-pro', ['low', 'medium', 'high']));
		const body = endpoint.createRequestBody(createOptions('high'));
		expect(body.reasoning_effort).toBe('low');
	});

	it('ignores a selection the model does not declare', () => {
		const endpoint = createEndpoint(createReasoningModelMetadata('gemini-2.5-pro', ['low', 'medium', 'high']));
		const body = endpoint.createRequestBody(createOptions('xhigh'));
		expect(body.reasoning_effort).toBeUndefined();
	});

	it('does not set reasoning_effort when the model declares no levels', () => {
		const endpoint = createEndpoint(createReasoningModelMetadata('gemini-2.5-pro'));
		const body = endpoint.createRequestBody(createOptions('high'));
		expect(body.reasoning_effort).toBeUndefined();
	});
});
