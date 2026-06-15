/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isGpt55, isGpt55EconomicalSearchAndEditExp, isGpt55LargePromptSectionsExp } from '../../../../../platform/endpoint/common/chatModelCapabilities';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { Gpt55CopilotIdentityRule } from '../../base/copilotIdentity';
import { Gpt5SafetyRule } from '../../base/safetyRules';
import { CopilotIdentityRulesConstructor, IAgentPrompt, PromptRegistry, ReminderInstructionsConstructor, SafetyRulesConstructor, SystemPrompt } from '../promptRegistry';
import { Gpt55PromptBase, Gpt55ReminderInstructions } from './gpt55BasePrompt';
import { Gpt55EconomicalSearchAndEditPromptExp } from './gpt55EconomicalPrompt';
import {
	Gpt55LargePromptSectionsExp,
	Gpt55LargePromptSectionsWithEconomicalSearchAndEditExp
} from './gpt55LargePrompt';

export class Gpt55Prompt extends Gpt55PromptBase { }

class Gpt55PromptResolver implements IAgentPrompt {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	static async matchesModel(endpoint: IChatEndpoint): Promise<boolean> {
		return isGpt55(endpoint);
	}

	static readonly familyPrefixes = [];

	resolveSystemPrompt(endpoint: IChatEndpoint): SystemPrompt | undefined {
		const hasLargePromptSectionsExp = this.instantiationService.invokeFunction(isGpt55LargePromptSectionsExp, endpoint);
		const hasEconomicalSearchAndEditExp = this.instantiationService.invokeFunction(isGpt55EconomicalSearchAndEditExp, endpoint);

		if (hasLargePromptSectionsExp && hasEconomicalSearchAndEditExp) {
			return Gpt55LargePromptSectionsWithEconomicalSearchAndEditExp;
		}
		if (hasLargePromptSectionsExp) {
			return Gpt55LargePromptSectionsExp;
		}
		if (hasEconomicalSearchAndEditExp) {
			return Gpt55EconomicalSearchAndEditPromptExp;
		}

		return Gpt55Prompt;
	}

	resolveReminderInstructions(endpoint: IChatEndpoint): ReminderInstructionsConstructor | undefined {
		return Gpt55ReminderInstructions;
	}

	resolveCopilotIdentityRules(endpoint: IChatEndpoint): CopilotIdentityRulesConstructor | undefined {
		return Gpt55CopilotIdentityRule;
	}

	resolveSafetyRules(endpoint: IChatEndpoint): SafetyRulesConstructor | undefined {
		return Gpt5SafetyRule;
	}
}

PromptRegistry.registerPrompt(Gpt55PromptResolver);
