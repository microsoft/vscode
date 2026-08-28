/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType, type RequestMetadata } from '@vscode/copilot-api';
import { OutputMode, PromptElement, PromptSizing, Raw, UserMessage } from '@vscode/prompt-tsx';
import { describe, expect, test } from 'vitest';
import { IAuthenticationService } from '../../../../../platform/authentication/common/authentication';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../../../platform/authentication/common/copilotToken';
import { setCopilotToken } from '../../../../../platform/authentication/common/staticGitHubAuthenticationService';
import type { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { TestingServiceCollection } from '../../../../../platform/test/node/services';
import { ITokenizer, TokenizerType } from '../../../../../util/common/tokenizer';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { PromptRenderer } from '../../base/promptRenderer';
import { HistoricalImage, HistoricalImageProps, Image } from '../image';

class HistoricalImageTestPrompt extends PromptElement<HistoricalImageProps> {
	override render(_state: void, _sizing: PromptSizing) {
		return (
			<UserMessage>
				<HistoricalImage {...this.props} />
			</UserMessage>
		);
	}
}

function createMockEndpoint(overrides: { supportsVision?: boolean; model?: string; modelProvider?: string; urlOrRequestMetadata?: string | RequestMetadata; isExtensionContributed?: boolean } = {}): IChatEndpoint {
	return {
		family: 'gpt-4.1',
		model: overrides.model ?? 'gpt-4.1',
		supportsVision: overrides.supportsVision ?? true,
		modelMaxPromptTokens: 128000,
		maxOutputTokens: 4096,
		name: 'test-model',
		version: '1.0',
		modelProvider: overrides.modelProvider ?? 'copilot',
		isExtensionContributed: overrides.isExtensionContributed,
		supportsToolCalls: true,
		supportsPrediction: false,
		showInModelPicker: false,
		isFallback: false,
		tokenizer: TokenizerType.O200K,
		urlOrRequestMetadata: overrides.urlOrRequestMetadata ?? { type: RequestType.ChatCompletions },
		acquireTokenizer: (): ITokenizer => ({
			mode: OutputMode.Raw,
			tokenLength: async () => 0,
			countMessageTokens: async () => 0,
			countMessagesTokens: async () => 0,
			countToolTokens: async () => 0,
		}),
	} as IChatEndpoint;
}

function hasImageContentPart(messages: Raw.ChatMessage[]): boolean {
	return messages.some(msg =>
		msg.content.some(part => part.type === Raw.ChatCompletionContentPartKind.Image)
	);
}

async function renderImage(testingServiceCollection: TestingServiceCollection, endpoint: IChatEndpoint): Promise<Raw.ChatMessage[]> {
	const accessor = testingServiceCollection.createTestingAccessor();
	const renderer = PromptRenderer.create(
		accessor.get(IInstantiationService),
		endpoint,
		Image,
		{
			variableName: 'image',
			variableValue: new Uint8Array([1, 2, 3, 4]),
		});
	const { messages } = await renderer.render();
	return messages;
}

async function renderHistoricalImage(testingServiceCollection: TestingServiceCollection, endpoint: IChatEndpoint): Promise<Raw.ChatMessage[]> {
	const accessor = testingServiceCollection.createTestingAccessor();
	const renderer = PromptRenderer.create(
		accessor.get(IInstantiationService),
		endpoint,
		HistoricalImageTestPrompt,
		{
			src: 'data:image/png;base64,AQIDBA==',
			mimeType: 'image/png',
		});
	const { messages } = await renderer.render();
	return messages;
}

describe('Image', () => {
	test('sends image to a vision-capable model when signed out (no Copilot token)', async () => {
		// Signed-out repro: the default test token store has no Copilot token.
		const testingServiceCollection = createExtensionUnitTestingServices();
		const messages = await renderImage(testingServiceCollection, createMockEndpoint({ supportsVision: true }));

		// A BYOK/local vision model must still receive the image even without a GitHub sign-in.
		expect(hasImageContentPart(messages)).toBe(true);
	});

	test('sends image when signed in and editor preview features are enabled', async () => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		const accessor = testingServiceCollection.createTestingAccessor();
		setCopilotToken(accessor.get(IAuthenticationService), new CopilotToken(createTestExtendedTokenInfo({ token: 'tid=abc' })));

		const renderer = PromptRenderer.create(
			accessor.get(IInstantiationService),
			createMockEndpoint({ supportsVision: true }),
			Image,
			{ variableName: 'image', variableValue: new Uint8Array([1, 2, 3, 4]) });
		const { messages } = await renderer.render();

		expect(hasImageContentPart(messages)).toBe(true);
	});

	test('sends image to a vision-capable Copilot model regardless of editor preview policy', async () => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		const accessor = testingServiceCollection.createTestingAccessor();
		setCopilotToken(accessor.get(IAuthenticationService), new CopilotToken(createTestExtendedTokenInfo({ token: 'editor_preview_features=0' })));

		const renderer = PromptRenderer.create(
			accessor.get(IInstantiationService),
			createMockEndpoint({ supportsVision: true }),
			Image,
			{ variableName: 'image', variableValue: new Uint8Array([1, 2, 3, 4]) });
		const { messages } = await renderer.render();

		expect(hasImageContentPart(messages)).toBe(true);
	});

	test.each([
		['custom endpoint model', { modelProvider: 'customendpoint', urlOrRequestMetadata: '' }],
		['custom model provider', { modelProvider: 'custom-provider', urlOrRequestMetadata: '', isExtensionContributed: true }],
	])('sends image to a vision-capable %s regardless of Copilot editor preview policy', async (_name, endpointOverrides) => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		const accessor = testingServiceCollection.createTestingAccessor();
		setCopilotToken(accessor.get(IAuthenticationService), new CopilotToken(createTestExtendedTokenInfo({ token: 'editor_preview_features=0' })));

		const renderer = PromptRenderer.create(
			accessor.get(IInstantiationService),
			createMockEndpoint({ supportsVision: true, ...endpointOverrides }),
			Image,
			{ variableName: 'image', variableValue: new Uint8Array([1, 2, 3, 4]) });
		const { messages } = await renderer.render();

		expect(hasImageContentPart(messages)).toBe(true);
	});

	test('omits image when the model does not support vision', async () => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		const messages = await renderImage(testingServiceCollection, createMockEndpoint({ supportsVision: false }));

		expect(hasImageContentPart(messages)).toBe(false);
	});
});

describe('HistoricalImage', () => {
	test('sends image to a vision-capable model when signed out (no Copilot token)', async () => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		const messages = await renderHistoricalImage(testingServiceCollection, createMockEndpoint({ supportsVision: true }));

		expect(hasImageContentPart(messages)).toBe(true);
	});

	test('sends image to a vision-capable Copilot model regardless of editor preview policy', async () => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		const accessor = testingServiceCollection.createTestingAccessor();
		setCopilotToken(accessor.get(IAuthenticationService), new CopilotToken(createTestExtendedTokenInfo({ token: 'editor_preview_features=0' })));

		const renderer = PromptRenderer.create(
			accessor.get(IInstantiationService),
			createMockEndpoint({ supportsVision: true }),
			HistoricalImageTestPrompt,
			{
				src: 'data:image/png;base64,AQIDBA==',
				mimeType: 'image/png',
			});
		const { messages } = await renderer.render();

		expect(hasImageContentPart(messages)).toBe(true);
	});

	test('omits image when the model does not support vision', async () => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		const messages = await renderHistoricalImage(testingServiceCollection, createMockEndpoint({ supportsVision: false }));

		expect(hasImageContentPart(messages)).toBe(false);
	});
});
