/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ILanguageModelsService } from '../../../contrib/chat/common/languageModels.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { OpenAIModelProvider } from './openAIModelProvider.js';
import { ClaudeModelProvider } from './claudeModelProvider.js';

/**
 * Workbench contribution that registers remote LLM providers (OpenAI, Claude)
 */
class RemoteLLMProviderContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.remoteLLMProvider';

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super();

		// Wait for extensions to be ready before registering the providers
		this.initializeProviders();
	}

	private async initializeProviders(): Promise<void> {
		console.log('[RemoteLLM] Waiting for extension service to be ready...');

		// Wait for the extension service to finish activating extensions
		await this.extensionService.whenInstalledExtensionsRegistered();

		console.log('[RemoteLLM] Extension service ready, registering providers...');

		// Register all remote providers
		this.registerProviders();
	}

	private registerProviders(): void {
		// Register OpenAI provider
		try {
			const openaiProvider = this.instantiationService.createInstance(OpenAIModelProvider);
			const openaiRegistration = this.languageModelsService.registerLanguageModelProvider('OpenAI', openaiProvider);
			console.log('[RemoteLLM] Successfully registered OpenAI provider');
			this._register(openaiRegistration);
			this._register(openaiProvider);
		} catch (error) {
			console.error('[RemoteLLM] Failed to register OpenAI provider:', error);
		}

		// Register Claude provider
		try {
			const claudeProvider = this.instantiationService.createInstance(ClaudeModelProvider);
			const claudeRegistration = this.languageModelsService.registerLanguageModelProvider('Anthropic', claudeProvider);
			console.log('[RemoteLLM] Successfully registered Claude provider');
			this._register(claudeRegistration);
			this._register(claudeProvider);
		} catch (error) {
			console.error('[RemoteLLM] Failed to register Claude provider:', error);
		}
	}
}

/**
 * Register the contribution to run during workbench initialization
 */
registerWorkbenchContribution2(
	RemoteLLMProviderContribution.ID,
	RemoteLLMProviderContribution,
	WorkbenchPhase.AfterRestored
);
