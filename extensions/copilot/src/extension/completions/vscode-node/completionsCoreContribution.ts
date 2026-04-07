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
import { ICopilotInlineCompletionItemProviderService } from '../common/copilotInlineCompletionItemProviderService';
import { unificationStateObservable } from './completionsUnificationContribution';

export class CompletionsCoreContribution extends Disposable {

	private readonly _copilotToken = observableFromEvent(this, this.authenticationService.onDidAuthenticationChange, () => this.authenticationService.copilotToken);

	constructor(
		@ICopilotInlineCompletionItemProviderService _copilotInlineCompletionItemProviderService: ICopilotInlineCompletionItemProviderService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService experimentationService: IExperimentationService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService
	) {
		super();

		const unificationState = unificationStateObservable(this);

		this._register(autorun(reader => {
			const unificationStateValue = unificationState.read(reader);
			const configEnabled = configurationService.getExperimentBasedConfigObservable<boolean>(ConfigKey.TeamInternal.InlineEditsEnableGhCompletionsProvider, experimentationService).read(reader);
			const extensionUnification = unificationStateValue?.extensionUnification ?? false;

			let hasInstantiatedProvider = false;
			if (unificationStateValue?.codeUnification || extensionUnification || configEnabled || this._copilotToken.read(reader)?.isNoAuthUser) {
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
			void commands.executeCommand('setContext', 'github.copilot.activated', token !== undefined);
		}));
	}
}
