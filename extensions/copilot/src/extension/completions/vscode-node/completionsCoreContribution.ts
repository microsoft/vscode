/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, languages } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, observableFromEvent } from '../../../util/vs/base/common/observableInternal';
import { registerUnificationCommands } from '../../completions-core/vscode-node/completionsServiceBridges';
import { ICompletionsModelManagerService } from '../../completions-core/vscode-node/lib/src/openai/model';
import { ICopilotInlineCompletionItemProviderService } from '../common/copilotInlineCompletionItemProviderService';
import { unificationStateObservable } from './completionsUnificationContribution';

export class CompletionsCoreContribution extends Disposable {

	private readonly _copilotToken = observableFromEvent(this, this.authenticationService.onDidCopilotTokenChange, () => this.authenticationService.copilotToken);

	constructor(
		@ICopilotInlineCompletionItemProviderService _copilotInlineCompletionItemProviderService: ICopilotInlineCompletionItemProviderService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService experimentationService: IExperimentationService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
	) {
		super();

		const modelManagerService = _copilotInlineCompletionItemProviderService.getOrCreateInstantiationService()
			.invokeFunction(accessor => accessor.get(ICompletionsModelManagerService));
		const unificationState = unificationStateObservable(this);
		const customCompletionModels = configurationService.getConfigObservable(ConfigKey.customCompletionModels);
		const selectedCompletionsModel = configurationService.getConfigObservable(ConfigKey.selectedCompletionsModel);
		const completionModelsChanged = observableFromEvent(this, modelManagerService.onDidChangeModels, () => undefined);

		this._register(autorun(reader => {
			const unificationStateValue = unificationState.read(reader);
			const configEnabled = configurationService.getExperimentBasedConfigObservable<boolean>(ConfigKey.TeamInternal.InlineEditsEnableGhCompletionsProvider, experimentationService).read(reader);
			const extensionUnification = unificationStateValue?.extensionUnification ?? false;
			const copilotToken = this._copilotToken.read(reader);
			customCompletionModels.read(reader);
			completionModelsChanged.read(reader);
			const hasSelectedCustomCompletionModel = isSelectedCustomCompletionModel(
				selectedCompletionsModel.read(reader),
				modelManagerService.getGenericCompletionModels()
			);

			let hasInstantiatedProvider = false;
			// GitHub-hosted completions require a Copilot token. Custom completion endpoints
			// can be used independently, so allow the provider when a custom model is selected.
			const wantsProvider = unificationStateValue?.codeUnification || extensionUnification || configEnabled || copilotToken?.isNoAuthUser || hasSelectedCustomCompletionModel;
			if (wantsProvider && (copilotToken || hasSelectedCustomCompletionModel)) {
				const provider = _copilotInlineCompletionItemProviderService.getOrCreateProvider();
				reader.store.add(
					languages.registerInlineCompletionItemProvider(
						{ pattern: '**' },
						provider,
						{
							debounceDelayMs: 0,
							excludes: ['github.copilot'],
							groupId: 'completions'
						}
					)
				);
				hasInstantiatedProvider = true;
			}

			void commands.executeCommand('setContext', 'github.copilot.extensionUnification.activated', extensionUnification);

			if (extensionUnification && hasInstantiatedProvider) {
				const completionsInstaService = _copilotInlineCompletionItemProviderService.getOrCreateInstantiationService();
				reader.store.add(completionsInstaService.invokeFunction(registerUnificationCommands));
			}
		}));

		this._register(autorun(reader => {
			const token = this._copilotToken.read(reader);
			customCompletionModels.read(reader);
			completionModelsChanged.read(reader);
			const hasSelectedCustomCompletionModel = isSelectedCustomCompletionModel(
				selectedCompletionsModel.read(reader),
				modelManagerService.getGenericCompletionModels()
			);
			void commands.executeCommand('setContext', 'github.copilot.activated', token !== undefined || hasSelectedCustomCompletionModel);
		}));
	}
}

function isSelectedCustomCompletionModel(selectedCompletionsModel: string, completionModels: readonly { modelId: string; custom?: boolean }[]): boolean {
	if (!selectedCompletionsModel) {
		return false;
	}
	return completionModels.find(model => model.modelId === selectedCompletionsModel)?.custom === true;
}
