/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride, SystemMessageSection } from '@github/copilot-sdk';
import type { ModelSelection } from '../../../common/state/protocol/state.js';
import { agentHostPromptRegistry, type IAgentHostPrompt } from './promptRegistry.js';

class OpenAIPromptResolver implements IAgentHostPrompt {
	static readonly familyPrefixes: readonly string[] = [];

	static matchesModel(model: ModelSelection): boolean {
		// Like Copilot Chat's OpenAI routing, match GPT families and the OpenAI alias; include legacy o-series IDs.
		const family = model.id.toLowerCase();
		return family.startsWith('gpt-') || family === 'openai' || /^o[134](?:-|$)/.test(family);
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

agentHostPromptRegistry.registerPrompt(OpenAIPromptResolver);
