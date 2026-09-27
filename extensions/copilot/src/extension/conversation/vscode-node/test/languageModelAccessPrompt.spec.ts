/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { describe, expect, test } from 'vitest';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { StaticChatMLFetcher } from '../../../../platform/chat/test/common/staticChatMLFetcher';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import { thinkingOriginToMetadata } from '../../../../platform/thinking/common/thinking';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelChatMessageRole, LanguageModelTextPart, LanguageModelThinkingPart } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { renderPromptElement } from '../../../prompts/node/base/promptRenderer';
import { LanguageModelAccessPrompt } from '../languageModelAccessPrompt';

describe('LanguageModelAccessPrompt', () => {
	test('preserves all assistant text and groups thinking by id', async () => {
		const services = createExtensionUnitTestingServices();
		services.define(IChatMLFetcher, new StaticChatMLFetcher([]));
		const accessor = services.createTestingAccessor();
		const endpoint = accessor.get(IInstantiationService).createInstance(MockEndpoint, 'gpt-5');
		const message = {
			role: LanguageModelChatMessageRole.Assistant,
			content: [
				new LanguageModelTextPart('first'),
				new LanguageModelThinkingPart('a1', 'rs_a', { encrypted_content: 'opaque-a' }),
				new LanguageModelThinkingPart('b', 'rs_b', { encrypted_content: 'opaque-b' }),
				new LanguageModelThinkingPart('a2', 'rs_a'),
				new LanguageModelTextPart('second'),
			],
			name: undefined,
		};

		const { messages } = await renderPromptElement(
			accessor.get(IInstantiationService),
			endpoint,
			LanguageModelAccessPrompt,
			{ noSafety: true, messages: [message] },
		);
		const assistant = messages.find(candidate => candidate.role === Raw.ChatRole.Assistant);
		const text = assistant?.content
			.filter(part => part.type === Raw.ChatCompletionContentPartKind.Text)
			.map(part => part.text)
			.join('');
		const thinking = assistant?.content
			.filter(part => part.type === Raw.ChatCompletionContentPartKind.Opaque)
			.map(part => part.value);

		expect({ text, thinking }).toEqual({
			text: 'firstsecond',
			thinking: [
				{
					type: 'thinking',
					thinking: {
						id: 'rs_a',
						text: ['a1', 'a2'],
						metadata: { encrypted_content: 'opaque-a' },
						encrypted: 'opaque-a',
					},
				},
				{
					type: 'thinking',
					thinking: {
						id: 'rs_b',
						text: ['b'],
						metadata: { encrypted_content: 'opaque-b' },
						encrypted: 'opaque-b',
					},
				},
			],
		});
	});

	test('reads vscode.lm provenance metadata back onto the envelope', async () => {
		// `vscode.lm` transports thinking as flat parts with no envelope, so provenance rides
		// per-part metadata. Losing it here is what forced the request builder to guess from the
		// payload's id, which silently dropped reasoning whose id had no `rs` prefix.
		const services = createExtensionUnitTestingServices();
		services.define(IChatMLFetcher, new StaticChatMLFetcher([]));
		const accessor = services.createTestingAccessor();
		const endpoint = accessor.get(IInstantiationService).createInstance(MockEndpoint, 'gpt-5');
		const message = {
			role: LanguageModelChatMessageRole.Assistant,
			content: [
				new LanguageModelThinkingPart('a1', 'CzDhIBSZ31', { encrypted_content: 'opaque-a', ...thinkingOriginToMetadata('responses') }),
			],
			name: undefined,
		};

		const { messages } = await renderPromptElement(
			accessor.get(IInstantiationService),
			endpoint,
			LanguageModelAccessPrompt,
			{ noSafety: true, messages: [message] },
		);
		const assistant = messages.find(candidate => candidate.role === Raw.ChatRole.Assistant);
		const thinking = assistant?.content
			.filter(part => part.type === Raw.ChatCompletionContentPartKind.Opaque)
			.map(part => part.value);

		expect(thinking).toEqual([{
			type: 'thinking',
			thinking: {
				id: 'CzDhIBSZ31',
				text: ['a1'],
				metadata: {
					encrypted_content: 'opaque-a',
					vscode_thinking_origin_api: 'responses',
				},
				encrypted: 'opaque-a',
			},
			originApi: 'responses',
		}]);
	});
});
