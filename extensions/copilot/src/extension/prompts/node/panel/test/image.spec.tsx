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
import { ITokenizer, TokenizerType } from '../../../../../util/common/tokenizer';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { PromptRenderer } from '../../base/promptRenderer';
import { Image } from '../image';

function hasImageContentPart(messages: Raw.ChatMessage[]): boolean {
	return messages.some(msg =>
		msg.content.some(part => part.type === Raw.ChatCompletionContentPartKind.Image)
	);
}

function createMockEndpoint(overrides: { supportsVision?: boolean; isExtensionContributed?: boolean } = {}): IChatEndpoint {
	return {
		family: 'test-vision-model',
		model: 'test-vision-model',
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
		isExtensionContributed: overrides.isExtensionContributed,
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

function createCopilotToken(previewFeaturesEnabled: boolean): CopilotToken {
	const previewFlag = previewFeaturesEnabled ? '1' : '0';
	return new CopilotToken(createTestExtendedTokenInfo({ token: `editor_preview_features=${previewFlag}:test-token` }));
}

async function renderImage(endpoint: IChatEndpoint, previewFeaturesEnabled: boolean): Promise<Raw.ChatMessage[]> {
	const testingServiceCollection = createExtensionUnitTestingServices();
	const accessor = testingServiceCollection.createTestingAccessor();
	setCopilotToken(accessor.get(IAuthenticationService), createCopilotToken(previewFeaturesEnabled));
	const renderer = PromptRenderer.create(
		accessor.get(IInstantiationService),
		endpoint,
		Image,
		{
			variableName: 'image',
			variableValue: new Uint8Array([0x89, 0x50, 0x4E, 0x47]),
		});

	const { messages } = await renderer.render();
	return messages;
}

describe('Image', () => {
	test('renders image input for extension-contributed BYOK models without Copilot preview features', async () => {
		const messages = await renderImage(createMockEndpoint({ isExtensionContributed: true }), false);

		expect(hasImageContentPart(messages)).toBe(true);
	});

	test('omits image input for Copilot-hosted models without Copilot preview features', async () => {
		const messages = await renderImage(createMockEndpoint(), false);

		expect(hasImageContentPart(messages)).toBe(false);
	});

	test('omits image input when an extension-contributed model does not support vision', async () => {
		const messages = await renderImage(createMockEndpoint({ isExtensionContributed: true, supportsVision: false }), false);

		expect(hasImageContentPart(messages)).toBe(false);
	});
});
