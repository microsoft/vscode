/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IChatMLFetcher } from '../../../platform/chat/common/chatMLFetcher';
import { CHAT_MODEL, ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { IChatModelInformation } from '../../../platform/endpoint/common/endpointProvider';
import { ChatEndpoint } from '../../../platform/endpoint/node/chatEndpoint';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IChatWebSocketManager } from '../../../platform/networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { ITokenizerProvider } from '../../../platform/tokenizer/node/tokenizer';
import { TokenizerType } from '../../../util/common/tokenizer';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';


export class XtabEndpoint extends ChatEndpoint {

	private static chatModelInfo: IChatModelInformation = {
		id: CHAT_MODEL.XTAB_4O_MINI_FINETUNED,
		name: 'xtab-4o-mini-finetuned',
		vendor: 'xtab',
		model_picker_enabled: false,
		is_chat_default: false,
		is_chat_fallback: false,
		version: 'unknown',
		capabilities: {
			type: 'chat',
			family: 'xtab-4o-mini-finetuned',
			tokenizer: TokenizerType.O200K,
			limits: {
				max_prompt_tokens: 12285,
				max_output_tokens: 4096,
			},
			supports: {
				streaming: true,
				parallel_tool_calls: false,
				tool_calls: false,
				vision: false,
				prediction: true,
			}
		}
	};

	constructor(
		private readonly _url: string,
		private readonly _apiKey: string,
		_configuredModelName: string | undefined,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IDomainService _domainService: IDomainService,
		@IFetcherService _fetcherService: IFetcherService,
		@ICAPIClientService _capiClientService: ICAPIClientService,
		@ITelemetryService _telemetryService: ITelemetryService,
		@IAuthenticationService _authService: IAuthenticationService,
		@IChatMLFetcher _chatMLFetcher: IChatMLFetcher,
		@ITokenizerProvider _tokenizerProvider: ITokenizerProvider,
		@IInstantiationService _instantiationService: IInstantiationService,
		@IExperimentationService _experimentationService: IExperimentationService,
		@IChatWebSocketManager _chatWebSocketService: IChatWebSocketManager,
		@ILogService _logService: ILogService
	) {
		const chatModelInfo = _configuredModelName ? { ...XtabEndpoint.chatModelInfo, id: _configuredModelName } : XtabEndpoint.chatModelInfo;
		super(
			chatModelInfo,
			_domainService,
			_chatMLFetcher,
			_tokenizerProvider,
			_instantiationService,
			_configService,
			_experimentationService,
			_chatWebSocketService,
			_logService
		);
	}

	override get urlOrRequestMetadata(): string {
		return this._configService.getConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderUrl) || this._url;
	}


	public override getExtraHeaders(): Record<string, string> {
		const apiKey = this._configService.getConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderApiKey) || this._apiKey;
		if (!apiKey) {
			const message = `Missing API key for custom URL (${this.urlOrRequestMetadata}). Provide the API key using vscode setting \`github.copilot.chat.advanced.inlineEdits.xtabProvider.apiKey\` or, if in simulations using \`--nes-api-key\` or \`--config-file\``;
			console.error(message);
			throw new Error(message);
		}
		return {
			'Authorization': `Bearer ${apiKey}`,
			'api-key': apiKey,
		};
	}
}
