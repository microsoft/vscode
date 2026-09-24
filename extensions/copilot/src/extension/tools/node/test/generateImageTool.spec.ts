/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterEach, beforeEach, expect, suite, test } from 'vitest';
import { ChatFetchResponseType, ChatLocation, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { ICompletionModelInformation, IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import { packageJson } from '../../../../platform/env/common/packagejson';
import { IGeneratedImage } from '../../../../platform/networking/common/fetch';
import { IChatEndpoint, IEmbeddingsEndpoint, IMakeChatRequestOptions } from '../../../../platform/networking/common/networking';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelDataPart } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { ContributedToolName, getContributedToolName, getToolName, ToolName } from '../../common/toolNames';
import { ToolRegistry } from '../../common/toolsRegistry';
import { GenerateImageTool } from '../generateImageTool';

class TestImageGenerationEndpoint extends MockEndpoint {
	apiType = 'responses';
	readonly requests: { options: IMakeChatRequestOptions; token: CancellationToken }[] = [];
	images: IGeneratedImage[] = [];
	onRequest?: () => void;
	response: ChatResponse = {
		type: ChatFetchResponseType.Success,
		value: '',
		requestId: 'image-request',
		serverRequestId: undefined,
		usage: undefined,
		resolvedModel: 'gpt-5.5',
	};

	override async makeChatRequest2(options: IMakeChatRequestOptions, token: CancellationToken): Promise<ChatResponse> {
		this.requests.push({ options, token });
		await options.finishedCb?.('', 0, { text: '', generatedImages: this.images });
		this.onRequest?.();
		return this.response;
	}
}

class TestImageEndpointProvider implements IEndpointProvider {
	declare readonly _serviceBrand: undefined;
	readonly onDidModelsRefresh = Event.None;
	readonly modelsRequested: Parameters<IEndpointProvider['getChatEndpoint']>[0][] = [];
	readonly endpoint: TestImageGenerationEndpoint;

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		this.endpoint = instantiationService.createInstance(TestImageGenerationEndpoint, 'gpt-5.5');
	}

	async getChatEndpoint(model: Parameters<IEndpointProvider['getChatEndpoint']>[0]): Promise<IChatEndpoint> {
		this.modelsRequested.push(model);
		return this.endpoint;
	}

	async getAllChatEndpoints(): Promise<IChatEndpoint[]> {
		return [this.endpoint];
	}

	async getAllCompletionModels(): Promise<ICompletionModelInformation[]> {
		return [];
	}

	async getEmbeddingsEndpoint(): Promise<IEmbeddingsEndpoint> {
		throw new Error('Not used by image generation');
	}
}

suite('GenerateImageTool', () => {
	let store: DisposableStore;
	let tool: GenerateImageTool;
	let provider: TestImageEndpointProvider;
	let configuration: IConfigurationService;
	const options = { input: { prompt: 'Draw a happy puppy' }, toolInvocationToken: undefined, chatRequestId: 'parent-request' };

	beforeEach(async () => {
		store = new DisposableStore();
		const services = store.add(createExtensionUnitTestingServices());
		services.define(IEndpointProvider, new SyncDescriptor(TestImageEndpointProvider));
		const accessor = store.add(services.createTestingAccessor());
		provider = accessor.get(IEndpointProvider) as TestImageEndpointProvider;
		configuration = accessor.get(IConfigurationService);
		await configuration.setConfig(ConfigKey.GenerateImageToolEnabled, true);
		tool = accessor.get(IInstantiationService).createInstance(GenerateImageTool);
	});

	afterEach(() => store.dispose());

	test('registers a prompt-referenceable tool and matching tool names', () => {
		const contributed = packageJson.contributes.languageModelTools.find(candidate => candidate.name === ContributedToolName.GenerateImage);
		expect({
			referenceName: contributed?.toolReferenceName,
			canBeReferencedInPrompt: contributed?.canBeReferencedInPrompt,
			implementationRegistered: ToolRegistry.getTools().includes(GenerateImageTool),
			contributedName: getContributedToolName(ToolName.GenerateImage),
			modelName: getToolName(ContributedToolName.GenerateImage),
		}).toEqual({
			referenceName: 'generateImage',
			canBeReferencedInPrompt: true,
			implementationRegistered: true,
			contributedName: ContributedToolName.GenerateImage,
			modelName: ToolName.GenerateImage,
		});
	});

	test('requests hosted image generation with the existing endpoint and returns every image', async () => {
		provider.endpoint.images = [
			{ data: 'Zmlyc3Q=', mimeType: 'image/png' },
			{ data: 'c2Vjb25k', mimeType: 'image/webp' },
		];
		const result = await tool.invoke(options, CancellationToken.None);
		const request = provider.endpoint.requests[0];
		expect({
			models: provider.modelsRequested,
			options: { ...request.options, finishedCb: typeof request.options.finishedCb },
			token: request.token,
			images: result.content.map(part => part instanceof LanguageModelDataPart ? { data: Array.from(part.data), mimeType: part.mimeType } : part),
		}).toEqual({
			models: ['gpt-5.5'],
			options: {
				debugName: 'generateImageTool',
				messages: [{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Draw a happy puppy' }] }],
				finishedCb: 'function',
				location: ChatLocation.Agent,
				userInitiatedRequest: false,
				isConversationRequest: true,
				topLevelTurnId: 'parent-request',
				enableRetryOnError: false,
				enableRetryOnFilter: false,
				canRetryOnceWithoutRollback: false,
				modelCapabilities: { enableImageGeneration: true },
			},
			token: CancellationToken.None,
			images: [
				{ data: [102, 105, 114, 115, 116], mimeType: 'image/png' },
				{ data: [115, 101, 99, 111, 110, 100], mimeType: 'image/webp' },
			],
		});
	});

	test('does not contact the model when the tool is disabled', async () => {
		await configuration.setConfig(ConfigKey.GenerateImageToolEnabled, false);
		await expect(tool.invoke(options, CancellationToken.None)).rejects.toThrow('Enable github.copilot.chat.tools.generateImage.enabled');
		expect(provider.modelsRequested).toEqual([]);
	});

	test('rejects an empty prompt before contacting the model', async () => {
		await expect(tool.invoke({ ...options, input: { prompt: ' \n ' } }, CancellationToken.None)).rejects.toThrow('Provide a description');
		expect(provider.modelsRequested).toEqual([]);
	});

	test('does not silently fall back to a non-Responses endpoint', async () => {
		provider.endpoint.apiType = 'chatCompletions';
		await expect(tool.invoke(options, CancellationToken.None)).rejects.toThrow('supports the Responses API');
		expect(provider.endpoint.requests).toEqual([]);
	});

	test('surfaces backend access failures without returning previously streamed images', async () => {
		provider.endpoint.images = [{ data: 'cG5n', mimeType: 'image/png' }];
		provider.endpoint.response = {
			type: ChatFetchResponseType.BadRequest,
			reason: 'Image generation is not enabled for this account.',
			requestId: 'image-request',
			serverRequestId: undefined,
		};
		await expect(tool.invoke(options, CancellationToken.None)).rejects.toThrow('Image generation is not enabled for this account.');
		expect(provider.endpoint.requests).toHaveLength(1);
	});

	test.each(['', 'I cannot generate that image.'])('rejects successful responses with no images (%s)', value => {
		provider.endpoint.response = {
			type: ChatFetchResponseType.Success,
			value,
			requestId: 'image-request',
			serverRequestId: undefined,
			usage: undefined,
			resolvedModel: 'gpt-5.5',
		};
		return expect(tool.invoke(options, CancellationToken.None)).rejects.toThrow(value || 'without returning an image');
	});

	test('does not contact the endpoint after cancellation', async () => {
		const source = store.add(new CancellationTokenSource());
		source.cancel();
		await expect(tool.invoke(options, source.token)).rejects.toThrow('Canceled');
		expect(provider.modelsRequested).toEqual([]);
	});

	test('forwards cancellation and discards results when canceled during generation', async () => {
		const source = store.add(new CancellationTokenSource());
		provider.endpoint.images = [{ data: 'cG5n', mimeType: 'image/png' }];
		provider.endpoint.onRequest = () => source.cancel();
		await expect(tool.invoke(options, source.token)).rejects.toThrow('Canceled');
		expect(provider.endpoint.requests[0].token).toBe(source.token);
	});

	test('handles an endpoint cancellation response', async () => {
		provider.endpoint.response = {
			type: ChatFetchResponseType.Canceled,
			reason: 'Canceled',
			requestId: 'image-request',
			serverRequestId: undefined,
		};
		await expect(tool.invoke(options, CancellationToken.None)).rejects.toThrow('Canceled');
	});
});
