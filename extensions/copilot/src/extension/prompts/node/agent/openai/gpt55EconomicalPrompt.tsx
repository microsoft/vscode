/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptSizing } from '@vscode/prompt-tsx';
import { ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { IExperimentationService } from '../../../../../platform/telemetry/common/nullExperimentationService';
import { DefaultAgentPromptProps } from '../defaultAgentInstructions';
import { Gpt55PromptBase, Gpt55ReminderInstructions } from './gpt55BasePrompt';

export class Gpt55EconomicalSearchAndEditPromptExp extends Gpt55PromptBase {
	private static isEnabled: boolean | undefined = undefined;

	constructor(
		props: DefaultAgentPromptProps,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
	) {
		super(props);
		Gpt55EconomicalSearchAndEditPromptExp.isEnabled = this.configurationService.getExperimentBasedConfig(ConfigKey.EnableGpt55EconomicalSearchAndEdit, this.experimentationService);
	}

	protected override get includeEconomicalSearchAndEdit(): boolean {
		return true;
	}

	override async render(state: void, sizing: PromptSizing) {
		const isEnabled = Gpt55EconomicalSearchAndEditPromptExp.isEnabled;
		if (!isEnabled) {
			return undefined;
		}

		return super.render(state, sizing);
	}
}

export class Gpt55EconomicalSearchAndEditPromptExpReminderInstructions extends Gpt55ReminderInstructions { }
