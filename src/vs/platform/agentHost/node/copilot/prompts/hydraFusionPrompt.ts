/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride, SystemMessageSection } from '@github/copilot-sdk';
import { COPILOT_HYDRA_FUSION_MODEL_ID } from '../../../common/copilotCliConfig.js';
import type { ModelSelection } from '../../../common/state/protocol/state.js';
import { agentHostPromptRegistry, type IAgentHostPrompt } from './promptRegistry.js';

const HYDRAFUSION_TONE = [
	'# Tone and style',
	'* When providing output or explanation to the user, limit your response to 100 words or less.',
	'* Be concise in routine responses. For complex tasks, briefly explain your approach before implementing.',
	'* Prioritize brevity. Default to the shortest possible response that satisfies the request. Cut filler, recap, and process narration.',
].join('\n');

const HYDRAFUSION_TOOL_EFFICIENCY = [
	'# Search and delegation',
	'* Give sub-agents comprehensive context; response-brevity rules do not apply to their prompts.',
	'* Search files/text only in the cwd or its descendants unless absolutely necessary. For code, prefer: available code intelligence > available LSP > glob > grep with a glob > bash.',
	'* For broad unfamiliar-code exploration, prefer `search_code_subagent`; use direct search tools for narrow lookups you can resolve in a couple of calls.',
	'',
	'# Tool usage efficiency',
	'CRITICAL: Maximize tool efficiency:',
	'* For simple searches, reads, or edits requiring only 2-5 direct calls, use grep, glob, view, edit yourself; delegate only complex/long work that benefits from separate context, since sub-agents add latency.',
	'* **USE PARALLEL TOOL CALLING** - when you need to perform multiple independent operations, make ALL tool calls in a SINGLE response. For example, if you need to read 3 files, make 3 view tool calls in one response, NOT 3 sequential responses.',
	'* Chain related bash commands with && instead of separate calls',
	'* Suppress verbose output (use --quiet, --no-pager, pipe to grep/head when appropriate)',
	'* Batching does not replace investigation; take as many turns as needed to understand before acting.',
	'* Default task agents to sync; use background only while doing independent work, not to poll while idle.',
].join('\n');

/**
 * HydraFusion prompt: replaces the `tone` and `tool_efficiency` sections with
 * the Copilot CLI's guidance so HydraFusion makes as few, as concise requests
 * in the agent host as it does in the standalone CLI. Pairs with the lean
 * default tool set (`HYDRAFUSION_DEFAULT_EXCLUDED_TOOLS`).
 */
class HydraFusionPromptResolver implements IAgentHostPrompt {
	static readonly familyPrefixes: readonly string[] = [];

	static matchesModel(model: ModelSelection): boolean {
		return model.id === COPILOT_HYDRA_FUSION_MODEL_ID;
	}

	resolveSectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
		return {
			tone: { action: 'replace', content: HYDRAFUSION_TONE },
			tool_efficiency: { action: 'replace', content: HYDRAFUSION_TOOL_EFFICIENCY },
		};
	}
}

agentHostPromptRegistry.registerPrompt(HydraFusionPromptResolver);
