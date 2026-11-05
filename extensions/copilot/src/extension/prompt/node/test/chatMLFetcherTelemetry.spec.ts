/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterEach, describe, expect, it } from 'vitest';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import type { IChatModelInformation } from '../../../../platform/endpoint/common/endpointProvider';
import { AutoChatEndpoint } from '../../../../platform/endpoint/node/autoChatEndpoint';
import { ChatEndpoint } from '../../../../platform/endpoint/node/chatEndpoint';
import { getImageTelemetryMeasurementsFromMessages } from '../../../../platform/image/common/imageTelemetry';
import { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { ChatCompletion, FinishedCompletionReason } from '../../../../platform/networking/common/openai';
import { TelemetryData } from '../../../../platform/telemetry/common/telemetryData';
import { SpyingTelemetryService } from '../../../../platform/telemetry/node/spyingTelemetryService';
import { createPlatformServices } from '../../../../platform/test/node/services';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatMLFetcherTelemetrySender } from '../chatMLFetcherTelemetry';

describe('ChatMLFetcherTelemetrySender', () => {
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
		capabilities: {
			type: 'chat',
			family: 'gpt-test',
			tokenizer: TokenizerType.O200K,
			limits: { max_prompt_tokens: 128000, max_output_tokens: 4096 },
			supports: { streaming: true, tool_calls: true },
		},
	};

	function sendSuccess(endpoint: IChatEndpoint) {
		const telemetryService = new SpyingTelemetryService();
		const baseTelemetry = TelemetryData.createAndMarkAsIssued();
		const chatCompletion: ChatCompletion = {
			message: { role: Raw.ChatRole.Assistant, content: [] },
			choiceIndex: 0,
			requestId: { headerRequestId: 'request', gitHubRequestId: '', copilotServiceRequestId: '', completionId: '', created: 0, serverExperiments: '', deploymentId: '' },
			tokens: [],
			usage: undefined,
			model: endpoint.model,
			blockFinished: true,
			finishReason: FinishedCompletionReason.Stop,
			telemetryData: baseTelemetry,
		};
		ChatMLFetcherTelemetrySender.sendSuccessTelemetry(telemetryService, {
			chatCompletion,
			baseTelemetry,
			userInitiatedRequest: true,
			interactionType: 'conversation-panel',
			chatEndpointInfo: endpoint,
			requestBody: {},
			maxResponseTokens: 4096,
			promptTokenCount: 0,
			timeToFirstToken: 0,
			timeToFirstTokenEmitted: 0,
			hasImageMessages: false,
			imageTelemetryMeasurements: getImageTelemetryMeasurementsFromMessages(undefined),
			transport: 'http',
			fetcher: undefined,
			bytesReceived: undefined,
			suspendEventSeen: undefined,
			resumeEventSeen: undefined,
			modelCallId: 'call',
		});
		const event = telemetryService.getEvents().telemetryServiceEvents.find(e => e.eventName === 'response.success');
		return {
			autoTier: (event?.properties as Record<string, string> | undefined)?.autoTier,
			isAuto: (event?.measurements as Record<string, number> | undefined)?.isAuto,
		};
	}

	it('reports the tier an Auto request was routed under on response.success', () => {
		const instantiationService = createInstantiationService();
		const routed = instantiationService.createInstance(ChatEndpoint, modelInfo);
		const auto = instantiationService.createInstance(AutoChatEndpoint, routed, 'session-token', 0, { low: 0, high: 0 }, 'efficiency');

		expect([sendSuccess(auto), sendSuccess(auto.cloneWithTokenOverride(64000)), sendSuccess(routed)]).toEqual([
			{ autoTier: 'efficiency', isAuto: 1 },
			{ autoTier: 'efficiency', isAuto: 1 },
			{ autoTier: undefined, isAuto: -1 },
		]);
	});
});
