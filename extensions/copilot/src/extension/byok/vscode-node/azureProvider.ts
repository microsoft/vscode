/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CancellationToken, LanguageModelChatMessage, LanguageModelChatMessage2, LanguageModelResponsePart2, Progress, ProvideLanguageModelChatResponseOptions } from 'vscode';
import { AzureAuthMode, ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { isEndpointEditToolName } from '../../../platform/endpoint/common/endpointProvider';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { resolveModelInfo } from '../common/byokProvider';
import { AzureOpenAIEndpoint } from '../node/azureOpenAIEndpoint';
import { OpenAICompatibleLanguageModelChatInformation } from './abstractLanguageModelChatProvider';
import { IBYOKStorageService } from './byokStorageService';
import { AbstractCustomOAIBYOKModelProvider, CustomOAIModelProviderConfig, hasExplicitApiPath } from './customOAIProvider';

export function resolveAzureUrl(modelId: string, url: string): string {
	// The fully resolved url was already passed in
	if (hasExplicitApiPath(url)) {
		return url;
	}

	// Remove the trailing slash
	if (url.endsWith('/')) {
		url = url.slice(0, -1);
	}
	// if url ends with `/v1` remove it
	if (url.endsWith('/v1')) {
		url = url.slice(0, -3);
	}

	// Default to chat completions for base URLs
	const defaultApiPath = '/chat/completions';

	if (url.includes('models.ai.azure.com') || url.includes('inference.ml.azure.com')) {
		return `${url}/v1${defaultApiPath}`;
	} else if (url.includes('openai.azure.com')) {
		return `${url}/openai/deployments/${modelId}${defaultApiPath}?api-version=2025-01-01-preview`;
	} else {
		throw new Error(`Unrecognized Azure deployment URL: ${url}`);
	}
}

export class AzureBYOKModelProvider extends AbstractCustomOAIBYOKModelProvider {

	static readonly providerName = 'Azure';

	constructor(
		byokStorageService: IBYOKStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
		@IFetcherService fetcherService: IFetcherService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IExperimentationService expService: IExperimentationService,
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext
	) {
		super(
			AzureBYOKModelProvider.providerName.toLowerCase(),
			AzureBYOKModelProvider.providerName,
			byokStorageService,
			logService,
			fetcherService,
			instantiationService,
			configurationService,
			expService,
			extensionContext
		);
		this.migrateExistingConfigs();
	}

	// TODO: Remove this after 6 months
	private async migrateExistingConfigs(): Promise<void> {
		await this.migrateConfig(ConfigKey.Deprecated.AzureModels, AzureBYOKModelProvider.providerName, AzureBYOKModelProvider.providerName);
		await this._configurationService.setConfig(ConfigKey.Deprecated.AzureAuthType, undefined);
	}

	protected override resolveUrl(modelId: string, url: string): string {
		return resolveAzureUrl(modelId, url);
	}

	override async provideLanguageModelChatResponse(
		model: OpenAICompatibleLanguageModelChatInformation<CustomOAIModelProviderConfig>,
		messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2>,
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<LanguageModelResponsePart2>,
		token: CancellationToken
	): Promise<void> {
		if (model.configuration?.apiKey) {
			return super.provideLanguageModelChatResponse(model, messages, options, progress, token);
		}

		const session: vscode.AuthenticationSession = await vscode.authentication.getSession(
			AzureAuthMode.MICROSOFT_AUTH_PROVIDER,
			[AzureAuthMode.COGNITIVE_SERVICES_SCOPE],
			{
				createIfNone: true,
				silent: false
			}
		);

		const url = this.resolveUrl(model.id, model.url);
		const modelConfiguration = model.configuration?.models?.find(m => m.id === model.id);
		const modelCapabilities = {
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			toolCalling: !!model.capabilities?.toolCalling || false,
			vision: !!model.capabilities?.imageInput || false,
			name: model.name,
			url,
			thinking: modelConfiguration?.thinking,
			streaming: modelConfiguration?.streaming,
			requestHeaders: modelConfiguration?.requestHeaders,
			editTools: model.capabilities?.editTools?.filter(isEndpointEditToolName),
			zeroDataRetentionEnabled: modelConfiguration?.zeroDataRetentionEnabled
		};
		const modelInfo = resolveModelInfo(model.id, this._name, undefined, modelCapabilities);

		const openAIChatEndpoint = this._instantiationService.createInstance(
			AzureOpenAIEndpoint,
			modelInfo,
			session.accessToken,  // Pass Entra ID token
			url
		);

		return this._lmWrapper.provideLanguageModelResponse(
			openAIChatEndpoint,
			messages,
			options,
			options.requestInitiator,
			progress,
			token
		);
	}
}
