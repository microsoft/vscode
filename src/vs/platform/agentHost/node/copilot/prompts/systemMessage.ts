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

/** Response-formatting contract for workspace links emitted by Agent Host models. */
export const COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS = [
	'<file_folder_and_symbol_links>',
	'Always use Markdown links when referring to existing files, folders, or symbols in the workspace. This is very important for helping the user understand your responses.',
	'- File: use the file name as the link text and the absolute filesystem path as the target, for example [foo.ts](/path/to/foo.ts).',
	'- Folder: links to folders are also supported, with an absolute path to the folder as the target, for example [src/](/path/to/src).',
	'- Symbol: link to symbols by using the containing file path with a 1-based line number as the target, for example [myMethod](/path/to/foo.ts:42).',
	'- Use `/` path separators in link targets, including on Windows (`C:/path/to/foo.ts`).',
	'- If a file path has spaces, wrap the target in angle brackets: [foo bar.ts](</path/to/foo bar.ts>).',
	'- Use absolute filesystem paths rather than `file://` URIs.',
	'- Do not provide line ranges.',
	'- Use a markdown link format every time you refer to a file, folder, or symbol, not just the first time.',
	'</file_folder_and_symbol_links>',
].join('\n');

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
 * Scratch/repoless guidance appended to a workspace-less chat's system message.
 * A workspace-less chat's working directory is a throwaway SCRATCH dir, not a
 * code repository — so this tells the agent not to treat it like a project, to
 * stay read-only on real repos, and to delegate code changes to a dedicated
 * session. Modeled on the GitHub app's `build_general_chat_system_message`.
 */
export const COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS = [
	'<workspaceless_chat>',
	'This is a lightweight workspace-less chat, not tied to any project or workspace. The user opens it for quick questions, navigation, and triage.',
	'',
	'- Your working directory is a SCRATCH directory for running commands and saving throwaway artifacts — it is NOT a code repository. Do not treat it as a project to build, test, or commit.',
	'- If the user points you at a real repository, prefer read-only operations: read files, search code, and inspect git metadata (branch, log, diff, status) to answer questions. Avoid modifying files or running builds, tests, linters, or installs in their working copies.',
	'- When the user wants code changes, test runs, or any work that modifies or executes against a real project, delegate it to a dedicated session rather than doing it here.',
	'</workspaceless_chat>',
].join('\n');

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

/** Appends universal content without changing a full-prompt replacement. */
export function appendSystemMessageContent(config: SystemMessageConfig, content: string): SystemMessageConfig {
	if (config.mode === 'replace') {
		return config;
	}
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
