/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OutputMode, Raw } from '@vscode/prompt-tsx';
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
import { Image } from '../image';

function createMockEndpoint(overrides: { supportsVision?: boolean; model?: string } = {}): IChatEndpoint {
	return {
		family: 'gpt-4.1',
		model: overrides.model ?? 'gpt-4.1',
		supportsVision: overrides.supportsVision ?? true,
		modelMaxPromptTokens: 128000,
		maxOutputTokens: 4096,
		name: 'test-model',
		version: '1.0',
		modelProvider: 'test',
		supportsToolCalls: true,
		supportsPrediction: false,
		showInModelPicker: false,
		isFallback: false,
		tokenizer: TokenizerType.O200K,
		urlOrRequestMetadata: '',
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

	test('omits image when organization policy disables editor preview features', async () => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		const accessor = testingServiceCollection.createTestingAccessor();
		// editor_preview_features=0 => org policy explicitly disabled preview features.
		setCopilotToken(accessor.get(IAuthenticationService), new CopilotToken(createTestExtendedTokenInfo({ token: 'editor_preview_features=0' })));

		const renderer = PromptRenderer.create(
			accessor.get(IInstantiationService),
			createMockEndpoint({ supportsVision: true }),
			Image,
			{ variableName: 'image', variableValue: new Uint8Array([1, 2, 3, 4]) });
		const { messages } = await renderer.render();

		expect(hasImageContentPart(messages)).toBe(false);
	});

	test('omits image when the model does not support vision', async () => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		const messages = await renderImage(testingServiceCollection, createMockEndpoint({ supportsVision: false }));

		expect(hasImageContentPart(messages)).toBe(false);
	});
});
