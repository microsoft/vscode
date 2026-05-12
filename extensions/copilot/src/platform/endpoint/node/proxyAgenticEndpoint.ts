/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestMetadata, RequestType } from '@vscode/copilot-api';
import { TokenizerType } from '../../../util/common/tokenizer';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { IChatMLFetcher } from '../../chat/common/chatMLFetcher';
import { IConfigurationService } from '../../configuration/common/configurationService';
import { ILogService } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { IChatWebSocketManager } from '../../networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { ITokenizerProvider } from '../../tokenizer/node/tokenizer';
import { ICAPIClientService } from '../common/capiClient';
import { IDomainService } from '../common/domainService';
import { IChatModelInformation } from '../common/endpointProvider';
import { IChatEndpoint } from '../../networking/common/networking';
import { ChatEndpoint } from './chatEndpoint';

const DEFAULT_MAX_PROMPT_TOKENS = 260000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16000;

export class ProxyAgenticEndpoint extends ChatEndpoint {

	constructor(
		modelName: string,
		maxPromptTokensOverride: number | undefined,
		@IDomainService domainService: IDomainService,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@IFetcherService fetcherService: IFetcherService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IAuthenticationService authService: IAuthenticationService,
		@IChatMLFetcher chatMLFetcher: IChatMLFetcher,
		@ITokenizerProvider tokenizerProvider: ITokenizerProvider,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService experimentationService: IExperimentationService,
		@IChatWebSocketManager chatWebSocketService: IChatWebSocketManager,
		@ILogService logService: ILogService,
	) {
		const model = modelName;
		const modelInfo: IChatModelInformation = {
			id: model,
			name: model,
			vendor: model,
			version: 'unknown',
			model_picker_enabled: false,
			is_chat_default: false,
			is_chat_fallback: false,
			capabilities: {
				type: 'chat',
				family: model,
				tokenizer: TokenizerType.O200K,
				supports: { streaming: true, parallel_tool_calls: true, tool_calls: true, vision: false },
				limits: {
					max_prompt_tokens: maxPromptTokensOverride ?? DEFAULT_MAX_PROMPT_TOKENS,
					max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
				}
			}
		};
		super(
			modelInfo,
			domainService,
			chatMLFetcher,
			tokenizerProvider,
			instantiationService,
			configurationService,
			experimentationService,
			chatWebSocketService,
			logService
		);
	}

	override get urlOrRequestMetadata(): RequestMetadata {
		return { type: RequestType.ProxyChatCompletions };
	}

	// Preserve proxy routing when prompt-tsx callers ask for a tighter token
	// budget (e.g. trajectory compaction reserving space for tools). The base
	// `ChatEndpoint.cloneWithTokenOverride` constructs a plain `ChatEndpoint`,
	// which drops our `urlOrRequestMetadata` override and would route the
	// cloned endpoint through standard chat completions instead of the proxy.
	public override cloneWithTokenOverride(modelMaxPromptTokens: number): IChatEndpoint {
		return this._instantiationService.createInstance(ProxyAgenticEndpoint, this.model, modelMaxPromptTokens);
	}
}
