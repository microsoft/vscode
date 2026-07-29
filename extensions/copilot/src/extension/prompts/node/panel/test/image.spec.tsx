/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, OutputMode, PromptElement, Raw, UserMessage } from '@vscode/prompt-tsx';
import { expect, test } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import type { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { ITokenizer, TokenizerType } from '../../../../../util/common/tokenizer';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelDataPart } from '../../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { PromptRenderer } from '../../base/promptRenderer';
import { Image } from '../image';
import { imageDataPartToTSX } from '../toolCalling';

interface ToolResultImagePromptProps extends BasePromptElementProps {
	readonly part: LanguageModelDataPart;
}

class ToolResultImagePrompt extends PromptElement<ToolResultImagePromptProps> {
	override async render() {
		const image = await imageDataPartToTSX(this.props.part);
		return <UserMessage>{image}</UserMessage>;
	}
}

function createMockEndpoint(family = 'gpt-4.1'): IChatEndpoint {
	return {
		family,
		model: family,
		supportsVision: true,
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

test('Image uses the configured image detail', async () => {
	const testingServiceCollection = createExtensionUnitTestingServices();
	const accessor = testingServiceCollection.createTestingAccessor();
	const endpoint = createMockEndpoint('gpt-5.4');
	await accessor.get(IConfigurationService).setConfig(ConfigKey.ChatImageDetail, 'original');
	const renderer = PromptRenderer.create(
		accessor.get(IInstantiationService),
		endpoint,
		Image,
		{
			variableName: 'image',
			variableValue: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
		});
	const { messages } = await renderer.render();
	const image = messages.flatMap(message => message.content).find(part => part.type === Raw.ChatCompletionContentPartKind.Image);

	expect(image?.imageUrl.detail).toBe('original');
});

test('Image falls back to high when original detail is unsupported', async () => {
	const testingServiceCollection = createExtensionUnitTestingServices();
	const accessor = testingServiceCollection.createTestingAccessor();
	const endpoint = createMockEndpoint();
	await accessor.get(IConfigurationService).setConfig(ConfigKey.ChatImageDetail, 'original');
	const renderer = PromptRenderer.create(
		accessor.get(IInstantiationService),
		endpoint,
		Image,
		{
			variableName: 'image',
			variableValue: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
		});
	const { messages } = await renderer.render();
	const image = messages.flatMap(message => message.content).find(part => part.type === Raw.ChatCompletionContentPartKind.Image);

	expect(image?.imageUrl.detail).toBe('high');
});

test('tool result image uses the configured image detail', async () => {
	const testingServiceCollection = createExtensionUnitTestingServices();
	const accessor = testingServiceCollection.createTestingAccessor();
	const endpoint = createMockEndpoint();
	await accessor.get(IConfigurationService).setConfig(ConfigKey.ChatImageDetail, 'low');
	const renderer = PromptRenderer.create(
		accessor.get(IInstantiationService),
		endpoint,
		ToolResultImagePrompt,
		{
			part: LanguageModelDataPart.image(new Uint8Array(1024), 'image/png'),
		});
	const { messages } = await renderer.render();
	const image = messages.flatMap(message => message.content).find(part => part.type === Raw.ChatCompletionContentPartKind.Image);

	expect(image?.imageUrl.detail).toBe('low');
});
