/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LanguageModelChatInformation, LanguageModelChatProvider, lm } from 'vscode';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { Disposable, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKKnownModels } from '../../byok/common/byokProvider';
import { IExtensionContribution } from '../../common/contributions';
import { AnthropicLMProvider } from './anthropicProvider';
import { AzureBYOKModelProvider } from './azureProvider';
import { BYOKStorageService, IBYOKStorageService } from './byokStorageService';
import { CustomOAIBYOKModelProvider } from './customOAIProvider';
import { GeminiNativeBYOKLMProvider } from './geminiNativeProvider';
import { OllamaLMProvider } from './ollamaProvider';
import { OAIBYOKLMProvider } from './openAIProvider';
import { OpenRouterLMProvider } from './openRouterProvider';
import { XAIBYOKLMProvider } from './xAIProvider';

type BYOKLanguageModelChatProvider = LanguageModelChatProvider<LanguageModelChatInformation> & {
	updateKnownModelsList?(knownModels: BYOKKnownModels | undefined): void;
};

export const byokLanguageModelProviderNames = [
	OllamaLMProvider.providerId,
	AnthropicLMProvider.providerId,
	GeminiNativeBYOKLMProvider.providerId,
	XAIBYOKLMProvider.providerId,
	OAIBYOKLMProvider.providerId,
	OpenRouterLMProvider.providerId,
	AzureBYOKModelProvider.providerId,
	CustomOAIBYOKModelProvider.providerId
] as const;

export class BYOKContrib extends Disposable implements IExtensionContribution {
	public readonly id: string = 'byok-contribution';
	private readonly _byokStorageService: IBYOKStorageService;
	private readonly _providers: Map<string, BYOKLanguageModelChatProvider> = new Map();
	private readonly _byokRegistrations = this._register(new DisposableStore());
	private _byokProvidersRegistered = false;

	constructor(
		@IFetcherService private readonly _fetcherService: IFetcherService,
		@ILogService private readonly _logService: ILogService,
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._byokStorageService = new BYOKStorageService(extensionContext);
		this._registerBYOKProviders();
	}

	private _registerBYOKProviders() {
		if (this._byokProvidersRegistered) {
			return;
		}

		if (this._byokProvidersRegistered) {
			return;
		}

		this._byokProvidersRegistered = true;
		// Update known models list from CDN so all providers have the same list
		const knownModels = await this.fetchKnownModelList(this._fetcherService);
		const knownModels: Record<string, BYOKKnownModels> = {
			[AnthropicLMProvider.providerName]: {},
			[GeminiNativeBYOKLMProvider.providerName]: {},
			[XAIBYOKLMProvider.providerName]: {},
			[OAIBYOKLMProvider.providerName]: {}
		};

		if (this._store.isDisposed) {
			return;
		}
		this._providers.set(OllamaLMProvider.providerId, instantiationService.createInstance(OllamaLMProvider, this._byokStorageService));
		this._providers.set(AnthropicLMProvider.providerId, instantiationService.createInstance(AnthropicLMProvider, knownModels[AnthropicLMProvider.providerName], this._byokStorageService));
		this._providers.set(GeminiNativeBYOKLMProvider.providerId, instantiationService.createInstance(GeminiNativeBYOKLMProvider, knownModels[GeminiNativeBYOKLMProvider.providerName], this._byokStorageService));
		this._providers.set(XAIBYOKLMProvider.providerId, instantiationService.createInstance(XAIBYOKLMProvider, knownModels[XAIBYOKLMProvider.providerName], this._byokStorageService));
		this._providers.set(OAIBYOKLMProvider.providerId, instantiationService.createInstance(OAIBYOKLMProvider, knownModels[OAIBYOKLMProvider.providerName], this._byokStorageService));
		this._providers.set(OpenRouterLMProvider.providerId, instantiationService.createInstance(OpenRouterLMProvider, this._byokStorageService));
		this._providers.set(AzureBYOKModelProvider.providerId, instantiationService.createInstance(AzureBYOKModelProvider, this._byokStorageService));
		this._providers.set(CustomOAIBYOKModelProvider.providerId, instantiationService.createInstance(CustomOAIBYOKModelProvider, this._byokStorageService));

		for (const [providerName, provider] of this._providers) {
			this._byokRegistrations.add(lm.registerLanguageModelChatProvider(providerName, provider));
		}
		this._logService.info(`BYOK: registered ${this._providers.size} provider(s): ${Array.from(this._providers.keys()).join(', ')}`);

		void this.updateKnownModelList();
	}

	private async updateKnownModelList(): Promise<void> {
		const fetchedKnownModels = await this.fetchKnownModelList(this._fetcherService);
		for (const provider of [AnthropicLMProvider, GeminiNativeBYOKLMProvider, XAIBYOKLMProvider, OAIBYOKLMProvider]) {
			this._providers.get(provider.providerId)?.updateKnownModelsList?.(fetchedKnownModels[provider.providerName]);
		}
	}

	private async fetchKnownModelList(fetcherService: IFetcherService): Promise<Record<string, BYOKKnownModels>> {
		try {
			this._logService.info('BYOK: fetching known models list');
			const data = await (await fetcherService.fetch('https://main.vscode-cdn.net/extensions/copilotChat.json', { method: 'GET', callSite: 'byok-known-models' })).json();
			// Use this for testing with changes from a local file. Don't check in
			// const data = JSON.parse((await this._fileSystemService.readFile(URI.file('/Users/roblou/code/vscode-engineering/chat/copilotChat.json'))).toString());
			let knownModels: Record<string, BYOKKnownModels>;
			if (data.version !== 1) {
				this._logService.warn('BYOK: Copilot Chat known models list is not in the expected format. Defaulting to empty list.');
				knownModels = {};
			} else {
				knownModels = data.modelInfo;
			}
			this._logService.info('BYOK: Copilot Chat known models list fetched successfully.');
			return knownModels;
		} catch (error) {
			this._logService.debug(`BYOK: Unable to fetch known models list. Defaulting to empty list. ${error instanceof Error ? error.message : String(error)}`);
			return {};
		}
	}
}
