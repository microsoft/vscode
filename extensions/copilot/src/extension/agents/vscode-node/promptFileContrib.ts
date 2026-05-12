/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { combinedDisposable, Disposable, MutableDisposable } from '../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IExtensionContribution } from '../../common/contributions';
import { AskAgentProvider } from './askAgentProvider';
import { EditModeAgentProvider } from './editModeAgentProvider';
import { ExploreAgentProvider } from './exploreAgentProvider';
import { GitHubOrgCustomAgentProvider } from './githubOrgCustomAgentProvider';
import { GitHubOrgInstructionsProvider } from './githubOrgInstructionsProvider';
import { PlanAgentProvider } from './planAgentProvider';

export class PromptFileContribution extends Disposable implements IExtensionContribution {
	readonly id = 'PromptFiles';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService experimentationService: IExperimentationService,
	) {
		super();

		// Register custom agent provider
		if ('registerCustomAgentProvider' in vscode.chat) {
			const editModeProviderRegistration = this._register(new MutableDisposable<vscode.Disposable>());
			const editModeHiddenSetting = 'chat.editMode.hidden';
			const updateEditModeProvider = () => {
				const isEditModeHidden = configurationService.getNonExtensionConfig<boolean>(editModeHiddenSetting);
				if (!isEditModeHidden) {
					if (!editModeProviderRegistration.value) {
						editModeProviderRegistration.value = vscode.chat.registerCustomAgentProvider(instantiationService.createInstance(EditModeAgentProvider));
					}
				} else {
					editModeProviderRegistration.clear();
				}
			};

			updateEditModeProvider();
			this._register(configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(editModeHiddenSetting)) {
					updateEditModeProvider();
				}
			}));

			// Only register the provider if the setting is enabled
			if (configurationService.getConfig(ConfigKey.EnableOrganizationCustomAgents)) {
				const githubOrgAgentProvider: vscode.ChatCustomAgentProvider = instantiationService.createInstance(new SyncDescriptor(GitHubOrgCustomAgentProvider));
				this._register(vscode.chat.registerCustomAgentProvider(githubOrgAgentProvider));
			}

			// Register Plan agent provider for dynamic settings-based customization
			const planProvider = instantiationService.createInstance(PlanAgentProvider);
			this._register(vscode.chat.registerCustomAgentProvider(planProvider));

			// Register Ask agent provider for read-only Q&A mode
			const askProvider = instantiationService.createInstance(AskAgentProvider);
			this._register(vscode.chat.registerCustomAgentProvider(askProvider));

			// Register Explore agent provider for code research subagent
			const exploreProviderRegistration = this._register(new MutableDisposable<vscode.Disposable>());
			const updateExploreProvider = () => {
				const isEnabled = configurationService.getExperimentBasedConfig(ConfigKey.ExploreAgentEnabled, experimentationService);
				if (isEnabled) {
					if (!exploreProviderRegistration.value) {
						const provider = instantiationService.createInstance(ExploreAgentProvider);
						const registration = vscode.chat.registerCustomAgentProvider(provider);
						exploreProviderRegistration.value = combinedDisposable(registration, provider);
					}
				} else {
					exploreProviderRegistration.clear();
				}
			};
			updateExploreProvider();
			this._register(configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(ConfigKey.ExploreAgentEnabled.fullyQualifiedId)) {
					updateExploreProvider();
				}
			}));
		}

		// Register instructions provider
		if ('registerInstructionsProvider' in vscode.chat) {
			// Only register the provider if the setting is enabled
			if (configurationService.getConfig(ConfigKey.EnableOrganizationInstructions)) {
				const githubOrgInstructionsProvider: vscode.ChatInstructionsProvider = instantiationService.createInstance(new SyncDescriptor(GitHubOrgInstructionsProvider));
				this._register(vscode.chat.registerInstructionsProvider(githubOrgInstructionsProvider));
			}
		}
	}
}
