/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { IChatMLFetcher } from '../../chat/common/chatMLFetcher';
import { IConfigurationService } from '../../configuration/common/configurationService';
import { IEnvService } from '../../env/common/envService';
import { ILogService } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { IChatEndpoint } from '../../networking/common/networking';
import { IChatWebSocketManager } from '../../networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { ITokenizerProvider } from '../../tokenizer/node/tokenizer';
import { ICAPIClientService } from '../common/capiClient';
import { IDomainService } from '../common/domainService';
import { IChatModelInformation } from '../common/endpointProvider';
import { ChatEndpoint } from './chatEndpoint';
import { CopilotChatEndpoint } from './copilotChatEndpoint';

/**
 * This endpoint represents the "Auto" model in the model picker.
 * It just effectively wraps a different endpoint and adds the auto stuff on top
 */
export class AutoChatEndpoint extends CopilotChatEndpoint {
	public static readonly pseudoModelId = 'auto';

	constructor(
		_wrappedEndpoint: IChatEndpoint,
		_sessionToken: string,
		_discountPercent: number,
		public readonly discountRange: { low: number; high: number },
		@IDomainService _domainService: IDomainService,
		@ICAPIClientService _capiClientService: ICAPIClientService,
		@IFetcherService _fetcherService: IFetcherService,
		@IEnvService _envService: IEnvService,
		@ITelemetryService _telemetryService: ITelemetryService,
		@IAuthenticationService _authService: IAuthenticationService,
		@IChatMLFetcher _chatMLFetcher: IChatMLFetcher,
		@ITokenizerProvider _tokenizerProvider: ITokenizerProvider,
		@IInstantiationService _instantiationService: IInstantiationService,
		@IConfigurationService _configurationService: IConfigurationService,
		@IExperimentationService _expService: IExperimentationService,
		@IChatWebSocketManager _chatWebSocketService: IChatWebSocketManager,
		@ILogService _logService: ILogService,
	) {
		super(
			calculateAutoModelInfo(_wrappedEndpoint, _sessionToken, _discountPercent),
			_domainService,
			_capiClientService,
			_fetcherService,
			_envService,
			_telemetryService,
			_authService,
			_chatMLFetcher,
			_tokenizerProvider,
			_instantiationService,
			_configurationService,
			_expService,
			_chatWebSocketService,
			_logService
		);
	}
}

function calculateAutoModelInfo(endpoint: IChatEndpoint, sessionToken: string, discountPercent: number): IChatModelInformation {
	let originalModelInfo: IChatModelInformation;
	if (endpoint instanceof ChatEndpoint) {
		originalModelInfo = endpoint.modelMetadata;
	} else {
		originalModelInfo = {
			id: endpoint.model,
			vendor: endpoint.modelProvider,
			name: endpoint.name,
			version: endpoint.version,
			model_picker_enabled: endpoint.showInModelPicker,
			is_chat_default: true,
			is_chat_fallback: endpoint.isFallback,
			capabilities: {
				type: 'chat',
				family: endpoint.family,
				tokenizer: endpoint.tokenizer,
				limits: {
					max_prompt_tokens: endpoint.modelMaxPromptTokens,
					max_output_tokens: endpoint.maxOutputTokens,
				},
				supports: {
					tool_calls: endpoint.supportsToolCalls,
					vision: endpoint.supportsVision,
					prediction: endpoint.supportsPrediction,
					streaming: true, // Assume streaming support for non-ChatEndpoint instances
				},
			},
			billing: endpoint.isPremium !== undefined || endpoint.multiplier !== undefined || endpoint.restrictedToSkus !== undefined
				? {
					is_premium: endpoint.isPremium ?? false,
					multiplier: endpoint.multiplier ?? 0,
					restricted_to: endpoint.restrictedToSkus,
				}
				: undefined,
			custom_model: endpoint.customModel,
		};
	}
	// Calculate the multiplier including the discount percent, rounding to two decimal places
	const newMultiplier = Math.round((endpoint.multiplier ?? 0) * (1 - discountPercent) * 100) / 100;
	const newModelInfo: IChatModelInformation = {
		...originalModelInfo,
		warning_messages: undefined,
		model_picker_enabled: true,
		info_messages: undefined,
		billing: {
			is_premium: originalModelInfo.billing?.is_premium ?? false,
			multiplier: newMultiplier,
			restricted_to: originalModelInfo.billing?.restricted_to
		},
		requestHeaders: {
			...(originalModelInfo.requestHeaders || {}),
			'Copilot-Session-Token': sessionToken
		}
	};
	return newModelInfo;
}

export function isAutoModel(endpoint: IChatEndpoint | undefined): number {
	if (!endpoint) {
		return -1;
	}
	return (endpoint.model === AutoChatEndpoint.pseudoModelId || endpoint instanceof AutoChatEndpoint) ? 1 : -1;
}