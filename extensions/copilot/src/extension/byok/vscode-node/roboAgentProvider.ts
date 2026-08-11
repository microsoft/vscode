/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands } from 'vscode';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKModelCapabilities, byokKnownModelToAPIInfo, resolveModelInfo } from '../common/byokProvider';
import { OpenAIEndpoint } from '../node/openAIEndpoint';
import { AbstractOpenAICompatibleLMProvider, LanguageModelChatConfiguration, OpenAICompatibleLanguageModelChatInformation } from './abstractLanguageModelChatProvider';
import { IBYOKStorageService } from './byokStorageService';

/**
 * RoboAgent's own model provider. Models are served by the RoboAgent LLM
 * gateway (an OpenAI-compatible proxy in front of NVIDIA), and requests are
 * authorized with the user's RoboAgent (Supabase) session via the core
 * `roboagent.getAccessToken` command — no API key is ever entered or stored
 * in the IDE. Unlike the BYOK providers this is registered unconditionally:
 * it must work without any GitHub/Copilot sign-in.
 */

const GATEWAY_BASE = 'https://www.roboticscorner.tech/roboagent/api/llm';
// The gateway caps completions at 8192 tokens and rejects prompts above
// ~200k tokens of text; stay inside a 128k window with output headroom.
const MAX_INPUT_TOKENS = 120_000;
const MAX_OUTPUT_TOKENS = 8_192;

interface IGatewayModel {
	id: string;
	label: string;
	note?: string;
}

export class RoboAgentLMProvider extends AbstractOpenAICompatibleLMProvider {
	public static readonly providerName = 'RoboAgent';
	public static readonly providerId = 'roboagent';

	constructor(
		byokStorageService: IBYOKStorageService,
		@ILogService logService: ILogService,
		@IFetcherService fetcherService: IFetcherService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
	) {
		super(RoboAgentLMProvider.providerId, RoboAgentLMProvider.providerName, undefined, byokStorageService, fetcherService, logService, instantiationService, configurationService, expService);
	}

	protected override async configureDefaultGroupWithApiKeyOnly(): Promise<string | undefined> {
		// No stored API key: authorization comes from the RoboAgent session.
		return undefined;
	}

	private async getAccessToken(): Promise<string | undefined> {
		try {
			return await commands.executeCommand<string | undefined>('roboagent.getAccessToken');
		} catch (e) {
			this._logService.warn(`RoboAgent: could not obtain access token: ${e}`);
			return undefined;
		}
	}

	private toCapabilities(model: IGatewayModel): BYOKModelCapabilities {
		return {
			name: model.note ? `${model.label} — ${model.note}` : model.label,
			maxInputTokens: MAX_INPUT_TOKENS,
			maxOutputTokens: MAX_OUTPUT_TOKENS,
			toolCalling: true,
			vision: false,
		};
	}

	protected override async getAllModels(silent: boolean): Promise<OpenAICompatibleLanguageModelChatInformation<LanguageModelChatConfiguration>[]> {
		const token = await this.getAccessToken();
		if (!token) {
			this._logService.info('RoboAgent: not signed in, no gateway models offered');
			return [];
		}
		try {
			const response = await this._fetcherService.fetch(`${GATEWAY_BASE}/models`, {
				method: 'GET',
				headers: { 'Authorization': `Bearer ${token}` },
				callSite: 'roboagent-models',
			});
			const data = await response.json() as { models?: IGatewayModel[] };
			if (!Array.isArray(data.models)) {
				throw new Error('Unexpected response from the RoboAgent gateway');
			}
			this._knownModels = {};
			return data.models.map(model => {
				const capabilities = this.toCapabilities(model);
				this._knownModels![model.id] = capabilities;
				return {
					...byokKnownModelToAPIInfo(this._name, model.id, capabilities),
					url: GATEWAY_BASE,
				};
			});
		} catch (e) {
			this._logService.error(`RoboAgent: fetching gateway models failed: ${e}`);
			throw e;
		}
	}

	protected override async createOpenAIEndPoint(model: OpenAICompatibleLanguageModelChatInformation<LanguageModelChatConfiguration>): Promise<OpenAIEndpoint> {
		// Fetched per request: the Supabase access token is short-lived and the
		// main-process auth service refreshes it as needed.
		const token = await this.getAccessToken();
		if (!token) {
			throw new Error('Sign in to RoboAgent to use AI models (run "RoboAgent: Log In").');
		}
		const capabilities = this._knownModels?.[model.id] ?? {
			name: model.name,
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			toolCalling: true,
			vision: false,
		};
		const modelInfo = resolveModelInfo(model.id, this._name, undefined, capabilities);
		return this._instantiationService.createInstance(OpenAIEndpoint, modelInfo, token, `${GATEWAY_BASE}/chat`);
	}

	protected getModelsBaseUrl(): string | undefined {
		return GATEWAY_BASE;
	}
}
