/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { IChatModelInformation } from '../../../../platform/endpoint/common/endpointProvider';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { applyOpenAIProviderConfig } from '../openAIProvider';

function createModelInfo(zeroDataRetentionEnabled: boolean | undefined): IChatModelInformation {
	return {
		id: 'gpt-4.1',
		name: 'GPT-4.1',
		vendor: 'OpenAI',
		version: '1.0.0',
		is_chat_default: false,
		is_chat_fallback: false,
		model_picker_enabled: true,
		zeroDataRetentionEnabled,
		capabilities: {
			type: 'chat',
			family: 'gpt-4.1',
			supports: {
				streaming: true,
				tool_calls: true,
				vision: false,
				thinking: false,
			},
			tokenizer: TokenizerType.O200K,
			limits: {
				max_context_window_tokens: 128000,
				max_prompt_tokens: 100000,
				max_output_tokens: 8192,
			},
		},
	};
}

describe('applyOpenAIProviderConfig', () => {
	it('uses provider-level zeroDataRetentionEnabled when configured', () => {
		const merged = applyOpenAIProviderConfig(createModelInfo(undefined), {
			apiKey: 'test-key',
			zeroDataRetentionEnabled: true,
		});

		expect(merged.zeroDataRetentionEnabled).toBe(true);
	});

	it('falls back to model metadata zeroDataRetentionEnabled when provider-level value is unset', () => {
		const merged = applyOpenAIProviderConfig(createModelInfo(true), {
			apiKey: 'test-key',
		});

		expect(merged.zeroDataRetentionEnabled).toBe(true);
	});
});
