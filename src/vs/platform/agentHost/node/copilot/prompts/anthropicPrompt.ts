/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride, SystemMessageSection } from '@github/copilot-sdk';
import { CopilotCliConfigKey } from '../../../common/copilotCliConfig.js';
import type { ModelSelection } from '../../../common/state/protocol/state.js';
import { isClaudeOpusModelId, narrowSubagentHarnessDefaultsRule, omitCodeChangeVerification, omitLastInstructionsVerification } from './promptExperiments.js';
import { agentHostPromptRegistry, type IAgentHostPrompt, type IAgentHostPromptContext } from './promptRegistry.js';

type SectionOverrides = Partial<Record<SystemMessageSection, SectionOverride>>;

/**
 * Claude Opus agent prompt: the opt-in prompt experiments in
 * `promptExperiments.ts`, each behind its own setting and each editing sections
 * the other does not touch. With both off it contributes nothing and the
 * session gets the default system message.
 *
 * `customize` mode with transforms, so the SDK foundation prompt, its
 * guardrails and its per-session content all stay as they are; only the named
 * sentences change.
 */
class ClaudeOpusPromptResolver implements IAgentHostPrompt {
	static readonly familyPrefixes: readonly string[] = [];

	static matchesModel(model: ModelSelection): boolean {
		return isClaudeOpusModelId(model.id);
	}

	resolveSectionOverrides(_model: ModelSelection, context: IAgentHostPromptContext): SectionOverrides | undefined {
		const overrides: SectionOverrides = {};
		const subagentModelGuidance = context.getSetting(CopilotCliConfigKey.SubagentModelGuidance);
		if (subagentModelGuidance !== undefined && subagentModelGuidance !== 'off') {
			// The registry appends the host's tool lines, including the model
			// guidance itself, after this transform's output.
			overrides.tool_instructions = { action: narrowSubagentHarnessDefaultsRule };
		}
		if (context.getSetting(CopilotCliConfigKey.OmitVerificationInstructions) === true) {
			// The runtime wraps a transformed XML section's output in its tags as is,
			// where the untransformed section has a newline inside each tag. Put
			// them back so the edit removes its sentence and changes nothing else.
			overrides.code_change_rules = { action: content => `\n${omitCodeChangeVerification(content)}\n` };
			overrides.last_instructions = { action: omitLastInstructionsVerification };
		}
		return Object.keys(overrides).length > 0 ? overrides : undefined;
	}
}

agentHostPromptRegistry.registerPrompt(ClaudeOpusPromptResolver);
