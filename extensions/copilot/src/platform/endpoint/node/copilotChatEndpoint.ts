/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { IChatMLFetcher } from '../../chat/common/chatMLFetcher';
import { CHAT_MODEL, IConfigurationService } from '../../configuration/common/configurationService';
import { IEnvService } from '../../env/common/envService';
import { ILogService } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { IChatEndpoint } from '../../networking/common/networking';
import { RawMessageConversionCallback } from '../../networking/common/openai';
import { IChatWebSocketManager } from '../../networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { ITokenizerProvider } from '../../tokenizer/node/tokenizer';
import { ICAPIClientService } from '../common/capiClient';
import { IDomainService } from '../common/domainService';
import { IChatModelInformation } from '../common/endpointProvider';
import { ChatEndpoint } from './chatEndpoint';
import { IModelMetadataFetcher } from './modelMetadataFetcher';

export class CopilotChatEndpoint extends ChatEndpoint {
	constructor(
		modelMetadata: IChatModelInformation,
		@IDomainService domainService: IDomainService,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@IFetcherService fetcherService: IFetcherService,
		@IEnvService envService: IEnvService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IAuthenticationService authService: IAuthenticationService,
		@IChatMLFetcher chatMLFetcher: IChatMLFetcher,
		@ITokenizerProvider tokenizerProvider: ITokenizerProvider,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService experimentService: IExperimentationService,
		@IChatWebSocketManager chatWebSocketService: IChatWebSocketManager,
		@ILogService logService: ILogService
	) {
		super(
			modelMetadata,
			domainService,
			chatMLFetcher,
			tokenizerProvider,
			instantiationService,
			configurationService,
			experimentService,
			chatWebSocketService,
			logService
		);
	}

	protected override getCompletionsCallback(): RawMessageConversionCallback | undefined {
		return (out, data) => {
			if (data && data.id) {
				out.reasoning_opaque = data.id;
				out.reasoning_text = Array.isArray(data.text) ? data.text.join('') : data.text;
			}
		};
	}
}

/**
 * Resolves the built-in Copilot model used for the `copilot-utility-small`
 * internal family (formerly `copilot-fast`). This is the small/fast model
 * that powers background utility flows like commit message generation,
 * prompt categorization, inline-chat progress messages, etc.
 *
 * The CAPI `/models` response does not flag a model as "fast" / "small",
 * so the family is selected client-side. Today that's `gpt-4o-mini`.
 */
export class CopilotUtilitySmallChatEndpoint {
	static readonly capiFamily: string = CHAT_MODEL.GPT4OMINI;

	static async resolve(modelFetcher: IModelMetadataFetcher, instantiationService: IInstantiationService): Promise<IChatEndpoint> {
		const modelMetadata = await modelFetcher.getChatModelFromCapiFamily(CopilotUtilitySmallChatEndpoint.capiFamily);
		return instantiationService.createInstance(CopilotChatEndpoint, modelMetadata);
	}
}

/**
 * Resolves the built-in Copilot model used for the `copilot-utility`
 * internal family (formerly `copilot-base`). This is the API-marked
 * default base model — whichever model the CAPI `/models` response
 * flags with `is_chat_fallback === true`.
 */
export class CopilotUtilityChatEndpoint {
	static async resolve(modelFetcher: IModelMetadataFetcher, instantiationService: IInstantiationService): Promise<IChatEndpoint> {
		const modelMetadata = await modelFetcher.getCopilotUtilityModel();
		return instantiationService.createInstance(CopilotChatEndpoint, modelMetadata);
	}
}
