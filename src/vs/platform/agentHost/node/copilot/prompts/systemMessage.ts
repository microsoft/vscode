/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride, SystemMessageConfig, SystemMessageSection } from '@github/copilot-sdk';

/**
 * Identity section of the default agent-host system message. Per-model overrides
 * inherit it via {@link withDefaultSections}, so it is defined in one place and
 * only a contributor that names `identity` replaces it.
 */
export const COPILOT_AGENT_HOST_IDENTITY = 'You are an AI assistant using Copilot SDK in VS Code. You help users with software engineering tasks. When asked about your identity, you must state that you are an AI assistant using Copilot SDK in VS Code.';

/**
 * Used as-is when no per-model override matches, and composed UNDER a matching
 * override's sections. `customize` mode keeps the CLI/SDK foundation prompt and
 * its guardrails intact.
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
 * Scratch/repoless guidance appended to a workspace-less chat's system message.
 * A workspace-less chat's working directory is a throwaway SCRATCH dir, not a
 * code repository — so this tells the agent not to treat it like a project, to
 * stay read-only on real repos, and to attach a workspace before project work.
 * Modeled on the GitHub app's `build_general_chat_system_message`.
 */
export const COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS = [
	'<workspaceless_chat>',
	'This is a lightweight workspace-less chat, not tied to any project or workspace. The user opens it for quick questions, navigation, and triage.',
	'',
	'- Your working directory is a SCRATCH directory for running commands and saving throwaway artifacts — it is NOT a code repository. Do not treat it as a project to build, test, or commit.',
	'- If the user points you at a real repository, prefer read-only operations: read files, search code, and inspect git metadata (branch, log, diff, status) to answer questions. Avoid modifying files or running builds, tests, linters, or installs in their working copies.',
	'- When the task should continue in a real workspace and `set_workspace` is available, prefer attaching that workspace and continuing this same conversation. Do not create another session solely to move the work. Use `list_sessions` to discover a known workspace when needed, and never guess a path.',
	'- Immediately before every `set_workspace` call, always use `ask_user` to confirm both the workspace and whether the work should be isolated, even if the user previously mentioned or requested those choices. Tool approval is separate and does not replace this confirmation.',
	'</workspaceless_chat>',
].join('\n');

/**
 * Builds a {@link SystemMessageConfig} that fully replaces the CLI/SDK system
 * prompt with `content`.
 *
 * ⚠️ `replace` mode drops ALL SDK guardrails (including security restrictions).
 * The prompt registry appends its universal layers when this config passes
 * through it; direct SDK callers receive only this replacement.
 */
export function fullSystemPrompt(content: string): SystemMessageConfig {
	return { mode: 'replace', content };
}

/**
 * Composes the default sections UNDER `config`'s own, so a section the config
 * does not name inherits the default and contributors need not re-state it.
 */
export function withDefaultSections(config: SystemMessageConfig): SystemMessageConfig {
	if (config.mode !== 'customize') {
		return config;
	}
	return { ...config, sections: { ...COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections, ...config.sections } };
}

/**
 * Builds a `customize`-mode {@link SystemMessageConfig} that overrides only the
 * given sections, leaving the rest of the CLI/SDK foundation prompt intact.
 */
export function sectionOverrides(sections: Partial<Record<SystemMessageSection, SectionOverride>>): SystemMessageConfig {
	return { mode: 'customize', sections };
}

/**
 * Appends to the config's trailing `content`, including after a `replace`
 * prompt's text — so host plumbing survives a full replacement.
 */
export function appendSystemMessageContent(config: SystemMessageConfig, content: string): SystemMessageConfig {
	const existing = config.content;
	return { ...config, content: existing ? `${existing}\n\n${content}` : content };
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
