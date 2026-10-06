/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride, SystemMessageSection } from '@github/copilot-sdk';
import type { ModelSelection } from '../../../common/state/protocol/state.js';
import { isClaudeOpusModelId, narrowSubagentHarnessDefaultsRule } from './promptExperiments.js';
import { agentHostPromptRegistry, type IAgentHostPrompt, type IAgentHostPromptContext } from './promptRegistry.js';

type SectionOverrides = Partial<Record<SystemMessageSection, SectionOverride>>;

/**
 * Claude Opus agent prompt: the opt-in subagent model guidance experiment in
 * `promptExperiments.ts`. When it does not apply to the session this
 * contributes nothing and the session gets the default system message.
 *
 * `customize` mode with a transform, so the SDK foundation prompt, its
 * guardrails and its per-session content all stay as they are; only the named
 * sentence changes.
 */
class ClaudeOpusPromptResolver implements IAgentHostPrompt {
	static readonly familyPrefixes: readonly string[] = [];

	static matchesModel(model: ModelSelection): boolean {
		return isClaudeOpusModelId(model.id);
	}

	resolveSectionOverrides(_model: ModelSelection, context: IAgentHostPromptContext): SectionOverrides | undefined {
		const overrides: SectionOverrides = {};
		if (context.subagentModelMix) {
			// The registry appends the host's tool lines, including the model
			// guidance itself, after this transform's output.
			overrides.tool_instructions = { action: narrowSubagentHarnessDefaultsRule };
		}
		return Object.keys(overrides).length > 0 ? overrides : undefined;
	}
}

agentHostPromptRegistry.registerPrompt(ClaudeOpusPromptResolver);
