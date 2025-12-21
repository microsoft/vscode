/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { DSpaceAgent } from './dSpaceAgent.js';
import { IDSpaceModelProviderService } from './providers/modelProvider.js';
import { DSpaceModelProviderService } from './providers/modelProviderService.js';
import { DSpaceLanguageModelProvider } from './providers/dSpaceLanguageModelProvider.js';
import { ILocalAIService } from './localInference/localAI.js';
import { LocalAIService } from './localInference/localAIService.js';
import { ILanguageModelsService } from '../../common/languageModels.js';

/**
 * Register the Local AI Service as a singleton (for offline model inference)
 */
registerSingleton(ILocalAIService, LocalAIService, InstantiationType.Delayed);

/**
 * Register the DSpace Model Provider Service as a singleton
 * This must be done before the agent contribution is registered
 */
registerSingleton(IDSpaceModelProviderService, DSpaceModelProviderService, InstantiationType.Delayed);

/**
 * Workbench contribution that registers the DSpace AI agent on startup
 */
export class DSpaceAgentContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.dSpaceAgent';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IDSpaceModelProviderService private readonly modelProviderService: IDSpaceModelProviderService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super();

		this.logService.info('[DSpaceAgentContribution] Registering DSpace AI agent...');

		// Auto-select provider based on connectivity on startup
		this.modelProviderService.autoSelectProvider();

		// Register the agent
		this._register(DSpaceAgent.registerAgent(this.instantiationService));

		// Register models with VS Code's language model service (for the model picker)
		this.registerLanguageModelProvider();

		this.logService.info(
			'[DSpaceAgentContribution] DSpace AI agent registered successfully with provider:',
			this.modelProviderService.getActiveProvider().name
		);
	}

	/**
	 * Register DSpace models with VS Code's language model service
	 * This makes them appear in the model picker dropdown
	 */
	private async registerLanguageModelProvider(): Promise<void> {
		// Wait for extensions to be ready
		await this.extensionService.whenInstalledExtensionsRegistered();

		this.logService.info('[DSpaceAgentContribution] Registering DSpace models with language model service...');

		try {
			const provider = this.instantiationService.createInstance(DSpaceLanguageModelProvider);
			const registration = this.languageModelsService.registerLanguageModelProvider('DSpace', provider);

			this._register(registration);
			this._register(provider);

			this.logService.info('[DSpaceAgentContribution] DSpace models registered successfully');
		} catch (error) {
			this.logService.error('[DSpaceAgentContribution] Failed to register DSpace models:', error);
		}
	}
}

// Register the contribution
registerWorkbenchContribution2(DSpaceAgentContribution.ID, DSpaceAgentContribution, WorkbenchPhase.BlockStartup);
