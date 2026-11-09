/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it } from 'vitest';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { IChatMLFetcher } from '../../../chat/common/chatMLFetcher';
import { IFetcherService } from '../../../networking/common/fetcherService';
import { IChatEndpoint } from '../../../networking/common/networking';
import { createPlatformServices } from '../../../test/node/services';
import type { IChatModelInformation } from '../../common/endpointProvider';
import { AutoChatEndpoint, getAutoModeTier, isAutoModel } from '../autoChatEndpoint';
import { ChatEndpoint } from '../chatEndpoint';

describe('AutoChatEndpoint', () => {
	const disposables = new DisposableStore();

	afterEach(() => disposables.clear());

	function createInstantiationService(): IInstantiationService {
		const services = createPlatformServices(disposables);
		services.define(IChatMLFetcher, {} as IChatMLFetcher);
		services.define(IAuthenticationService, {} as IAuthenticationService);
		services.define(IFetcherService, {} as IFetcherService);
		return services.createTestingAccessor().get(IInstantiationService);
	}

	const modelInfo: IChatModelInformation = {
		id: 'gpt-test',
		name: 'GPT Test',
		vendor: 'test',
		version: '1',
		model_picker_enabled: true,
		is_chat_default: false,
		is_chat_fallback: false,
		billing: { is_premium: true, multiplier: 1 },
		capabilities: {
			type: 'chat',
			family: 'gpt-test',
			tokenizer: TokenizerType.O200K,
			limits: { max_prompt_tokens: 128000, max_output_tokens: 4096 },
			supports: { streaming: true, tool_calls: true },
		},
	};

	function describeEndpoint(endpoint: IChatEndpoint) {
		return {
			isAuto: isAutoModel(endpoint),
			autoTier: getAutoModeTier(endpoint),
			model: endpoint.model,
			maxPromptTokens: endpoint.modelMaxPromptTokens,
			multiplier: endpoint.multiplier,
			sessionToken: endpoint.getExtraHeaders?.()['Copilot-Session-Token'],
		};
	}

	it('keeps its Auto attribution and tier when cloned with a clamped context window', () => {
		const instantiationService = createInstantiationService();
		const routed = instantiationService.createInstance(ChatEndpoint, modelInfo);
		const auto = instantiationService.createInstance(AutoChatEndpoint, routed, 'session-token', 0.1, { low: 0.1, high: 0.1 }, 'intelligence');

		expect([describeEndpoint(auto), describeEndpoint(auto.cloneWithTokenOverride(64000))]).toEqual([
			{ isAuto: 1, autoTier: 'intelligence', model: 'gpt-test', maxPromptTokens: 128000, multiplier: 0.9, sessionToken: 'session-token' },
			{ isAuto: 1, autoTier: 'intelligence', model: 'gpt-test', maxPromptTokens: 64000, multiplier: 0.9, sessionToken: 'session-token' },
		]);
	});

	it('reports no tier for endpoints that did not route through Auto', () => {
		const instantiationService = createInstantiationService();
		const routed = instantiationService.createInstance(ChatEndpoint, modelInfo);
		const picker = instantiationService.createInstance(AutoChatEndpoint, routed, '', 0, { low: 0, high: 0 }, undefined);

		expect([getAutoModeTier(routed), getAutoModeTier(picker), getAutoModeTier(undefined)]).toEqual([undefined, undefined, undefined]);
	});
});
