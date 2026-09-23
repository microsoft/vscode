/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride, SystemMessageSection } from '@github/copilot-sdk';
import type { ModelSelection } from '../../../common/state/protocol/state.js';
import { agentHostPromptRegistry, type IAgentHostPrompt } from './promptRegistry.js';

class SolAstraPromptResolver implements IAgentHostPrompt {
	static readonly familyPrefixes: readonly string[] = [];

	static matchesModel(model: ModelSelection): boolean {
		return ['gpt-5.6-sol', 'gpt-6-astra'].some(id => model.id === id || model.id.startsWith(`${id}-`));
	}

	resolveSectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
		return {
			code_change_rules: {
				action: 'append',
				content: '\n' + [
					'Do not automatically reread edited files or review the full diff after a successful edit.',
					'When a check fails, tool output is ambiguous, or a concrete correctness question remains, inspect only the relevant code or diff hunks.',
					'Still perform required validation, and honor explicit requests for a broader review.',
				].join('\n'),
			},
		};
	}
}

agentHostPromptRegistry.registerPrompt(SolAstraPromptResolver);
