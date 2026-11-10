/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { ChatFetchResponseType, ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { ExtensionContributedChatEndpoint } from '../../../../platform/endpoint/vscode-node/extChatEndpoint';
import { AsyncIterableObject } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';

vi.mock('vscode', async importOriginal => ({
	...await importOriginal<typeof import('vscode')>(),
	ChatHookType: undefined,
	ChatRequest: undefined,
	LanguageModelToolInformation: undefined,
	Extension: undefined,
	ChatMcpToolInvocationData: undefined,
	LanguageModelChatApiType: undefined,
}));

describe('BYOK on hosts without the protocol capability API', () => {
	const store = new DisposableStore();
	let instantiationService: IInstantiationService;

	beforeEach(() => {
		const services = store.add(createExtensionUnitTestingServices(store));
		services.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
		instantiationService = store.add(services.createTestingAccessor()).get(IInstantiationService);
	});

	afterEach(() => store.clear());

	it('loads the provider and lists configured models without the new enum', async () => {
		const { CustomEndpointBYOKModelProvider } = await import('../customEndpointProvider');
		const provider = instantiationService.createInstance(CustomEndpointBYOKModelProvider, {
			getAPIKey: async () => undefined,
			storeAPIKey: async () => undefined,
			deleteAPIKey: async () => undefined,
			getStoredModelConfigs: async () => ({}),
			saveModelConfig: async () => undefined,
			removeModelConfig: async () => undefined,
		});
		const models = await provider.provideLanguageModelChatInformation({
			silent: true,
			configuration: {
				models: [{ id: 'deployment', name: 'Deployment', url: 'https://model.example', apiType: 'messages', maxInputTokens: 10000, maxOutputTokens: 1000, toolCalling: true, vision: false }],
			},
		}, CancellationToken.None);

		expect(models.map(model => ({ id: model.id, apiType: model.capabilities.apiType }))).toEqual([{ id: 'deployment', apiType: undefined }]);
	});

	it('sends requests without inferring a protocol from absent capability values', async () => {
		const model: vscode.LanguageModelChat = {
			id: 'kimi-k3',
			name: 'Kimi K3',
			family: 'kimi-k3',
			vendor: 'customendpoint',
			version: '1',
			maxInputTokens: 10000,
			capabilities: { supportsToolCalling: true, supportsImageToText: false },
			countTokens: async () => 0,
			sendRequest: async () => ({
				stream: AsyncIterableObject.fromArray([new vscode.LanguageModelTextPart('legacy reply')]),
				text: AsyncIterableObject.fromArray(['legacy reply']),
			}),
		};
		const endpoint = instantiationService.createInstance(ExtensionContributedChatEndpoint, model);
		const result = await endpoint.makeChatRequest2({
			debugName: 'legacy-host',
			messages: [{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'hello' }] }],
			finishedCb: undefined,
			location: ChatLocation.Panel,
		}, CancellationToken.None);

		expect(endpoint.apiType).toBeUndefined();
		expect(result).toMatchObject({ type: ChatFetchResponseType.Success, value: 'legacy reply' });
	});
});
