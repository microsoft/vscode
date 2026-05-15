/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LanguageModelChatInformation, LanguageModelChatProvider, lm } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { Disposable, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKKnownModels, isClientBYOKAllowed } from '../../byok/common/byokProvider';
import { IExtensionContribution } from '../../common/contributions';
import { AbstractLanguageModelChatProvider } from './abstractLanguageModelChatProvider';
import { AnthropicLMProvider } from './anthropicProvider';
import { AzureBYOKModelProvider } from './azureProvider';
import { BYOKStorageService, IBYOKStorageService } from './byokStorageService';
import { CustomEndpointBYOKModelProvider } from './customEndpointProvider';
import { CustomOAIBYOKModelProvider } from './customOAIProvider';
import { GeminiNativeBYOKLMProvider } from './geminiNativeProvider';
import { OllamaLMProvider } from './ollamaProvider';
import { OAIBYOKLMProvider } from './openAIProvider';
import { OpenRouterLMProvider } from './openRouterProvider';
import { XAIBYOKLMProvider } from './xAIProvider';

export class BYOKContrib extends Disposable implements IExtensionContribution {
	public readonly id: string = 'byok-contribution';
	private readonly _byokStorageService: IBYOKStorageService;
	private readonly _providers: Map<string, LanguageModelChatProvider<LanguageModelChatInformation>> = new Map();
	private readonly _providerRegistrations = this._register(new DisposableStore());
	private _providersRegistered = false;
	private _knownModelsRefreshed = false;
	private _knownModelsRefreshTargets: ReadonlyArray<readonly [string, AbstractLanguageModelChatProvider]> = [];

	constructor(
		@IFetcherService private readonly _fetcherService: IFetcherService,
		@ILogService private readonly _logService: ILogService,
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext,
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._byokStorageService = new BYOKStorageService(extensionContext);
		this._applyPolicy();
		this._register(this._authService.onDidAuthenticationChange(() => this._applyPolicy()));
	}

	private _buildProviders(): void {
		const instantiationService = this._instantiationService;

		const anthropic = instantiationService.createInstance(AnthropicLMProvider, undefined, this._byokStorageService);
		const gemini = instantiationService.createInstance(GeminiNativeBYOKLMProvider, undefined, this._byokStorageService);
		const xai = instantiationService.createInstance(XAIBYOKLMProvider, {}, this._byokStorageService);
		const openai = instantiationService.createInstance(OAIBYOKLMProvider, {}, this._byokStorageService);

		this._providers.set(OllamaLMProvider.providerId, instantiationService.createInstance(OllamaLMProvider, this._byokStorageService));
		this._providers.set(AnthropicLMProvider.providerId, anthropic);
		this._providers.set(GeminiNativeBYOKLMProvider.providerId, gemini);
		this._providers.set(XAIBYOKLMProvider.providerId, xai);
		this._providers.set(OAIBYOKLMProvider.providerId, openai);
		this._providers.set(OpenRouterLMProvider.providerId, instantiationService.createInstance(OpenRouterLMProvider, this._byokStorageService));
		this._providers.set(AzureBYOKModelProvider.providerId, instantiationService.createInstance(AzureBYOKModelProvider, this._byokStorageService));
		this._providers.set(CustomOAIBYOKModelProvider.providerId, instantiationService.createInstance(CustomOAIBYOKModelProvider, this._byokStorageService));
		this._providers.set(CustomEndpointBYOKModelProvider.providerId, instantiationService.createInstance(CustomEndpointBYOKModelProvider, this._byokStorageService));

		this._knownModelsRefreshTargets = [
			[AnthropicLMProvider.providerName, anthropic],
			[GeminiNativeBYOKLMProvider.providerName, gemini],
			[XAIBYOKLMProvider.providerName, xai],
			[OAIBYOKLMProvider.providerName, openai],
		];
	}

	private _applyPolicy(): void {
		const allowed = isClientBYOKAllowed(!!this._authService.anyGitHubSession, this._authService.copilotToken);
		if (allowed && !this._providersRegistered) {
			if (this._providers.size === 0) {
				this._buildProviders();
			}
			for (const [providerId, provider] of this._providers) {
				this._providerRegistrations.add(lm.registerLanguageModelChatProvider(providerId, provider));
			}
			this._providersRegistered = true;
			this._logService.info(`BYOK: registered ${this._providers.size} provider(s): ${Array.from(this._providers.keys()).join(', ')}`);
			if (!this._knownModelsRefreshed) {
				this._knownModelsRefreshed = true;
				void this._refreshKnownModels().catch(err => {
					this._knownModelsRefreshed = false;
					this._logService.warn(`BYOK: failed to refresh known models, will retry on next allowed transition: ${err instanceof Error ? err.message : String(err)}`);
				});
			}
		} else if (!allowed && this._providersRegistered) {
			this._providerRegistrations.clear();
			this._providersRegistered = false;
			this._logService.info('BYOK: unregistered providers due to enterprise policy.');
		}
	}

	private async _refreshKnownModels(): Promise<void> {
		const knownModels = await this._fetchKnownModelList(this._fetcherService);
		if (this._store.isDisposed) {
			return;
		}
		for (const [providerName, provider] of this._knownModelsRefreshTargets) {
			provider.updateKnownModels(knownModels[providerName]);
		}
	}

	private async _fetchKnownModelList(fetcherService: IFetcherService): Promise<Record<string, BYOKKnownModels>> {
		this._logService.info('BYOK: fetching known models list');
		const data = await (await fetcherService.fetch('https://main.vscode-cdn.net/extensions/copilotChat.json', { method: 'GET', callSite: 'byok-known-models' })).json();
		// Use this for testing with changes from a local file. Don't check in
		// const data = JSON.parse((await this._fileSystemService.readFile(URI.file('/Users/roblou/code/vscode-engineering/chat/copilotChat.json'))).toString());
		if (data.version !== 1) {
			this._logService.warn('BYOK: Copilot Chat known models list is not in the expected format. Defaulting to empty list.');
			return {};
		}
		this._logService.info('BYOK: Copilot Chat known models list fetched successfully.');
		return data.modelInfo;
	}
}
