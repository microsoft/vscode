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

/**
 * One-line, log-friendly summary of a resolved {@link SystemMessageConfig} —
 * the mode plus, for `customize`, which sections are overridden and with what
 * action (e.g. `mode=customize sections=[identity:replace, tool_instructions:append]`).
 *
 * Keeps prompt observability cheap at `info` level without dumping full prompt
 * text on every session launch (log the whole config at `trace` for that).
 */
export function describeSystemMessageConfig(config: SystemMessageConfig): string {
	if (config.mode === 'replace') {
		return `mode=replace (content length ${config.content.length})`;
	}
	if (config.mode === 'customize') {
		const parts = Object.entries(config.sections ?? {}).map(([name, override]) => {
			const action = override?.action;
			return `${name}:${typeof action === 'function' ? 'transform' : action}`;
		});
		// The customize convenience `content` is appended after all sections; note
		// it so the summary doesn't understate what was sent.
		const content = config.content ? ` +content(length ${config.content.length})` : '';
		return `mode=customize sections=[${parts.join(', ')}]${content}`;
	}
	return `mode=append (content length ${config.content?.length ?? 0})`;
}
