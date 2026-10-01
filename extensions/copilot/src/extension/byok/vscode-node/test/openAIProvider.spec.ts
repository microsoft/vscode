/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { IChatModelInformation } from '../../../../platform/endpoint/common/endpointProvider';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { createFakeResponse } from '../../../../platform/test/node/fetcher';
import { mock } from '../../../../util/common/test/simpleMock';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { OpenAICompatibleLanguageModelChatInformation } from '../abstractLanguageModelChatProvider';
import { IBYOKStorageService } from '../byokStorageService';
import { applyOpenAIProviderConfig, OAIBYOKLMProvider, OpenAIProviderConfig } from '../openAIProvider';

class TestOpenAIProvider extends OAIBYOKLMProvider {
	discover(apiKey: string | undefined): Promise<OpenAICompatibleLanguageModelChatInformation<OpenAIProviderConfig>[]> {
		return this.getAllModels(true, apiKey, undefined);
	}
}

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

describe('OpenAI voice credential lifecycle', () => {
	it('forgets a removed key instead of retaining its live-session authority', async () => {
		const store = new DisposableStore();
		try {
			const services = store.add(createExtensionUnitTestingServices());
			services.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
			services.set(IFetcherService, new class extends mock<IFetcherService>() {
				override async fetch() { return createFakeResponse(200, { data: [] }); }
			}());
			const accessor = store.add(services.createTestingAccessor());
			const provider = accessor.get(IInstantiationService).createInstance(TestOpenAIProvider, {}, new class extends mock<IBYOKStorageService>() {
				override async getAPIKey(): Promise<undefined> { return undefined; }
			}());
			await provider.discover('old-key');
			const configured = provider.apiKey;
			await provider.discover(undefined);
			expect({ configured, removed: provider.apiKey }).toEqual({ configured: 'old-key', removed: undefined });
		} finally {
			store.dispose();
		}
	});
});
