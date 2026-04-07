/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IChatModelInformation } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ErrorUtils } from '../../../util/common/errors';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { byokKnownModelsToAPIInfo, resolveModelInfo } from '../common/byokProvider';
import { OpenAIEndpoint } from '../node/openAIEndpoint';
import { AbstractOpenAICompatibleLMProvider, LanguageModelChatConfiguration, OpenAICompatibleLanguageModelChatInformation } from './abstractLanguageModelChatProvider';
import { IBYOKStorageService } from './byokStorageService';

interface OllamaModelInfoAPIResponse {
	template: string;
	capabilities: string[];
	details: { family: string };
	remote_model?: string;
	model_info?: {
		'general.basename': string;
		'general.architecture': string;
		[other: string]: any;
	};
}

interface OllamaVersionResponse {
	version: string;
}

// Minimum supported Ollama version - versions below this may have compatibility issues
const MINIMUM_OLLAMA_VERSION = '0.6.4';

export interface OllamaConfig extends LanguageModelChatConfiguration {
	url: string;
}

export class OllamaLMProvider extends AbstractOpenAICompatibleLMProvider<OllamaConfig> {
	public static readonly providerName = 'Ollama';
	private _modelCache = new Map<string, IChatModelInformation>();

	constructor(
		byokStorageService: IBYOKStorageService,
		@IFetcherService fetcherService: IFetcherService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IExperimentationService expService: IExperimentationService
	) {
		super(
			OllamaLMProvider.providerName.toLowerCase(),
			OllamaLMProvider.providerName,
			undefined,
			byokStorageService,
			fetcherService,
			logService,
			instantiationService,
			configurationService,
			expService
		);

		this.migrateConfig();
	}

	private async migrateConfig(): Promise<void> {
		const baseUrl = this.getBaseUrlFromSettings();
		if (!baseUrl) {
			return;
		}
		await this.configureDefaultGroupIfExists(this._name, { url: baseUrl });
		await this._configurationService.setConfig(ConfigKey.Deprecated.OllamaEndpoint, undefined);
	}

	private getBaseUrlFromSettings(): string | undefined {
		if (this._configurationService.isConfigured(ConfigKey.Deprecated.OllamaEndpoint)) {
			return this._configurationService.getConfig(ConfigKey.Deprecated.OllamaEndpoint);
		}
		return undefined;
	}

	protected override async getAllModels(silent: boolean, apiKey: string | undefined, config: OllamaConfig | undefined): Promise<OpenAICompatibleLanguageModelChatInformation<OllamaConfig>[]> {
		if (!config) {
			return [];
		}

		const ollamaBaseUrl = config.url;

		try {
			// Check Ollama server version before proceeding with model operations
			await this._checkOllamaVersion(ollamaBaseUrl);

			const response = await this._fetcherService.fetch(`${ollamaBaseUrl}/api/tags`, { method: 'GET', callSite: 'ollama-tags' });
			const models = (await response.json()).models;
			this._knownModels = {};
			for (const model of models) {
				let modelInfo = this._modelCache.get(`${ollamaBaseUrl}/${model.model}`);
				if (!modelInfo) {
					try {
						modelInfo = await this._getOllamaModelInfo(ollamaBaseUrl, model.model);
					} catch (e) {
						const error = ErrorUtils.fromUnknown(e);
						this._logService.error(error, 'ollamaProvider: failed to fetch Ollama model info');
						this._logService.debug(`[ollamaProvider] Failed model info fetch for model=${model.model}`);
						continue; // Skip this model but continue processing others
					}
					this._modelCache.set(`${ollamaBaseUrl}/${model.model}`, modelInfo);
				}
				this._knownModels[modelInfo.id] = {
					maxInputTokens: modelInfo.capabilities.limits?.max_prompt_tokens ?? 4096,
					maxOutputTokens: modelInfo.capabilities.limits?.max_output_tokens ?? 4096,
					name: modelInfo.name,
					toolCalling: !!modelInfo.capabilities.supports.tool_calls,
					vision: !!modelInfo.capabilities.supports.vision
				};
			}

			return byokKnownModelsToAPIInfo(this._name, this._knownModels).map(model => ({
				...model,
				url: ollamaBaseUrl
			}));

		} catch (e) {
			// Check if this is our version check error and preserve it
			if (e instanceof Error && e.message.includes('Ollama server version')) {
				throw e;
			}
			throw new Error('Failed to fetch models from Ollama. Please ensure Ollama is running. If ollama is on another host, please configure the `"github.copilot.chat.byok.ollamaEndpoint"` setting.');
		}
	}

	protected override getModelsBaseUrl(configuration: OllamaConfig | undefined): string {
		return configuration?.url ?? 'http://localhost:11434';
	}

	protected override async createOpenAIEndPoint(model: OpenAICompatibleLanguageModelChatInformation<OllamaConfig>): Promise<OpenAIEndpoint> {
		const modelInfo = this.getModelInfo(model.id, model.url);
		const url = `${model.url}/v1/chat/completions`;
		return this._instantiationService.createInstance(OpenAIEndpoint, modelInfo, model.configuration?.apiKey ?? '', url);
	}

	private async _getOllamaModelInfo(ollamaBaseUrl: string, modelId: string): Promise<IChatModelInformation> {
		const modelInfo = await this._fetchOllamaModelInformation(ollamaBaseUrl, modelId);
		const contextWindow = modelInfo?.model_info?.[`${modelInfo.model_info['general.architecture']}.context_length`] ?? 32768;
		const outputTokens = contextWindow < 4096 ? Math.floor(contextWindow / 2) : 4096;
		const modelCapabilities = {
			name: modelInfo?.model_info?.['general.basename'] ?? modelInfo.remote_model ?? modelId,
			maxOutputTokens: outputTokens,
			maxInputTokens: contextWindow - outputTokens,
			vision: modelInfo.capabilities.includes('vision'),
			toolCalling: modelInfo.capabilities.includes('tools')
		};

		return resolveModelInfo(modelId, this._name, this._knownModels, modelCapabilities);
	}

	/**
	 * Compare version strings to check if current version meets minimum requirements
	 * @param currentVersion Current Ollama server version
	 * @returns true if version is supported, false otherwise
	 */
	private _isVersionSupported(currentVersion: string): boolean {
		if (currentVersion === '0.0.0') {
			// allow all dev versions through
			return true;
		}

		// Simple version comparison: split by dots and compare numerically
		const currentParts = currentVersion.split('.').map(n => parseInt(n, 10));
		const minimumParts = MINIMUM_OLLAMA_VERSION.split('.').map(n => parseInt(n, 10));

		for (let i = 0; i < Math.max(currentParts.length, minimumParts.length); i++) {
			const current = currentParts[i] || 0;
			const minimum = minimumParts[i] || 0;

			if (current > minimum) {
				return true;
			}
			if (current < minimum) {
				return false;
			}
		}

		return true; // versions are equal
	}

	private async _fetchOllamaModelInformation(ollamaBaseUrl: string, modelId: string): Promise<OllamaModelInfoAPIResponse> {
		const response = await this._fetcherService.fetch(`${ollamaBaseUrl}/api/show`, {
			method: 'POST',
			callSite: 'ollama-show',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ model: modelId })
		});
		return response.json() as unknown as OllamaModelInfoAPIResponse;
	}
	/**
	 * Check if the connected Ollama server version meets the minimum requirements
	 * @throws Error if version is below minimum or version check fails
	 */
	private async _checkOllamaVersion(ollamaBaseUrl: string): Promise<void> {
		try {
			const response = await this._fetcherService.fetch(`${ollamaBaseUrl}/api/version`, { method: 'GET', callSite: 'ollama-version' });
			const versionInfo = await response.json() as OllamaVersionResponse;

			if (!this._isVersionSupported(versionInfo.version)) {
				throw new Error(
					`Ollama server version ${versionInfo.version} is not supported. ` +
					`Please upgrade to version ${MINIMUM_OLLAMA_VERSION} or higher. ` +
					`Visit https://ollama.ai for upgrade instructions.`
				);
			}
		} catch (e) {
			if (e instanceof Error && e.message.includes('Ollama server version')) {
				// Re-throw our custom version error
				throw e;
			}
			// If version endpoint fails
			throw new Error(
				`Unable to verify Ollama server version. Please ensure you have Ollama version ${MINIMUM_OLLAMA_VERSION} or higher installed. ` +
				`If you're running an older version, please upgrade from https://ollama.ai`
			);
		}
	}
}