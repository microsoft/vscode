/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride, SystemMessageConfig, SystemMessageSection } from '@github/copilot-sdk';

/**
 * Identity section content shared by the default agent-host system message and
 * any per-model override that wants to keep the same self-description. Kept as
 * a single constant so the identity text is defined in exactly one place.
 */
export const COPILOT_AGENT_HOST_IDENTITY = 'You are an AI assistant using Copilot CLI runtime in VS Code. You help users with software engineering tasks. When asked about your identity, you must state that you are an AI assistant using Copilot CLI runtime in VS Code.';

/**
 * Default system-message customization applied to every Copilot CLI agent-host
 * session that has no per-model override registered in the
 * {@link AgentHostPromptRegistry}.
 *
 * Uses `customize` mode so the CLI/SDK foundation prompt (and its built-in
 * guardrails) stay intact — only the `identity` section is replaced.
 */
export const COPILOT_AGENT_HOST_SYSTEM_MESSAGE = {
	mode: 'customize',
	sections: {
		identity: {
			action: 'replace',
			content: COPILOT_AGENT_HOST_IDENTITY,
		},
	},
} satisfies SystemMessageConfig;

/**
 * Builds a {@link SystemMessageConfig} that fully replaces the CLI/SDK system
 * prompt with `content`.
 *
 * ⚠️ `replace` mode drops ALL SDK guardrails (including security restrictions);
 * prefer {@link sectionOverrides} unless the caller intends to own the entire
 * prompt.
 */
export function fullSystemPrompt(content: string): SystemMessageConfig {
	return { mode: 'replace', content };
}

/**
 * Builds a `customize`-mode {@link SystemMessageConfig} that overrides only the
 * given sections, leaving the rest of the CLI/SDK foundation prompt intact.
 */
export function sectionOverrides(sections: Partial<Record<SystemMessageSection, SectionOverride>>): SystemMessageConfig {
	return { mode: 'customize', sections };
}
