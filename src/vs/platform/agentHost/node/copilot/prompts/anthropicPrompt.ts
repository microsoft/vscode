/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride, SystemMessageSection } from '@github/copilot-sdk';
import { CopilotCliConfigKey } from '../../../common/copilotCliConfig.js';
import type { ModelSelection } from '../../../common/state/protocol/state.js';
import { agentHostPromptRegistry, type IAgentHostPrompt, type IAgentHostPromptContext } from './promptRegistry.js';
import { COPILOT_AGENT_HOST_IDENTITY } from './systemMessage.js';

/**
 * `customize`-mode section overrides for Claude Opus 4.8, tuned per Anthropic's
 * "Prompting Claude Opus 4.8" guide:
 * https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8
 *
 * Opus 4.8 performs well out of the box, so this stays intentionally minimal:
 * it keeps the SDK foundation prompt (and its tool/safety sections) intact and
 * only nudges the two behaviors the guide calls out for tuning —
 *  - verbosity/tone: the model calibrates length to task complexity, so steer
 *    it toward concision when a consistent style is wanted; and
 *  - subagents: the model spawns fewer by default, so give explicit fan-out
 *    guidance.
 * The guide warns against forcing interim-progress scaffolding ("summarize
 * after every N tool calls"), so none is added here. The identity is re-stated
 * to keep the agent-host self-description that the default message applies.
 */
function opus48SectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
	return {
		identity: {
			action: 'replace',
			content: COPILOT_AGENT_HOST_IDENTITY,
		},
		tone: {
			action: 'append',
			// Leading newline so the appended text starts on its own line rather
			// than running on from the SDK foundation tone section's last sentence.
			content: '\nProvide concise, focused responses. Skip non-essential context, and keep examples minimal. Use a direct style and use emojis sparingly.',
		},
		guidelines: {
			action: 'append',
			content: [
				'Do not spawn a subagent for work you can complete directly in a single response (e.g. refactoring a function you can already see).',
				'Spawn multiple subagents in the same turn when fanning out across items or reading multiple files.',
			].join('\n'),
		},
	};
}

/** Whether `model` is Claude Opus 4.8 — matches the SDK dashed id and the CAPI dotted id. */
function isOpus48(model: ModelSelection): boolean {
	return model.id.startsWith('claude-opus-4-8') || model.id.startsWith('claude-opus-4.8');
}

/**
 * Opus 4.8 agent prompt for Claude Opus 4.8 sessions: matches only Opus 4.8 and
 * is opt-in via {@link CopilotCliConfigKey.Opus48Prompt}. Off → falls back to the
 * default system message.
 */
class Claude48OpusPromptResolver implements IAgentHostPrompt {
	static readonly familyPrefixes: readonly string[] = [];

	static matchesModel(model: ModelSelection): boolean {
		return isOpus48(model);
	}

	resolveSectionOverrides(_model: ModelSelection, context: IAgentHostPromptContext): Partial<Record<SystemMessageSection, SectionOverride>> | undefined {
		return context.getSetting(CopilotCliConfigKey.Opus48Prompt) === true ? opus48SectionOverrides() : undefined;
	}
}

agentHostPromptRegistry.registerPrompt(Claude48OpusPromptResolver);
