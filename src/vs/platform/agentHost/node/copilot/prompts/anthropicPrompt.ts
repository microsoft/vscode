/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride, SystemMessageSection } from '@github/copilot-sdk';
import { CopilotCliConfigKey } from '../../../common/copilotCliConfig.js';
import type { ModelSelection } from '../../../common/state/protocol/state.js';
import { agentHostPromptRegistry, type IAgentHostPrompt, type IAgentHostPromptContext } from './promptRegistry.js';

type SectionOverrides = Partial<Record<SystemMessageSection, SectionOverride>>;

// #region Copilot Chat alternate prompt

/**
 * Bullets the SDK foundation prompt contributes that the Copilot Chat Claude
 * prompt deliberately does not: verification and thoroughness mandates that
 * measurably drive extra verification turns on Claude (see the
 * `chat.opusAltPrompt.enabled` setting description). Each
 * is a regex source matched as a whole bullet, so a foundation rewording simply
 * leaves the line in place rather than mangling its neighbours.
 */
const CODE_CHANGE_RULE_BULLETS_TO_DROP: readonly string[] = [
	String.raw`\* Validate that your changes preserve existing behavior`,
];

const GUIDELINE_BULLETS_TO_DROP: readonly string[] = [
	String.raw`\* Reflect on command output before proceeding to next step`,
	String.raw`\* Clean up temporary files at end of task`,
	String.raw`\* Ask for guidance if uncertain(?:; use the ask_user tool to ask clarifying questions)?`,
];

/**
 * Removes each bullet (a regex source) from `content` when it occupies a whole
 * line. A bullet that shares its line with a closing tag
 * (`* ...</rules_for_code_changes>`) is removed while the tag is kept.
 */
export function dropFoundationBullets(content: string, bullets: readonly string[]): string {
	let result = content;
	for (const bullet of bullets) {
		result = result
			.replace(new RegExp(`^${bullet}\\r?(?:\\n|$)`, 'm'), '')
			.replace(new RegExp(`^${bullet}(?=\\s*</[a-z_]+>)`, 'm'), '');
	}
	return result;
}

/** Copilot Chat `implementationDiscipline` (Claude46OpusPrompt), verbatim. */
export const OPUS_ALT_PROMPT_IMPLEMENTATION_DISCIPLINE = [
	'<implementation_discipline>',
	'Avoid over-engineering. Only make changes that are directly requested or clearly necessary.',
	'- Don\'t add features, refactor code, or make "improvements" beyond what was asked',
	'- Don\'t add docstrings, comments, or type annotations to code you didn\'t change',
	'- Don\'t add error handling for scenarios that can\'t happen. Only validate at system boundaries',
	'- Don\'t create helpers or abstractions for one-time operations',
	'</implementation_discipline>',
].join('\n');

/** Copilot Chat `<instructions>` exploration guidance (Claude46OpusPrompt). */
const EXPLORATION_GUIDANCE = [
	'Gather sufficient context to act confidently, then proceed to implementation. Avoid redundant searches for information already found. Once you have identified the relevant files and understand the code structure, proceed to implementation. Do not continue searching after you have enough to act. If multiple queries return overlapping results, you have sufficient context.',
	'Persist through genuine blockers, but do not over-explore when you already have enough information to proceed. When you encounter an error, diagnose and fix rather than retrying the same approach.',
].join('\n');

const PARALLELIZATION_STRATEGY = 'You may parallelize independent read-only operations when appropriate.';

/**
 * Copilot Chat `<instructions>`, `<operationalSafety>`, `<parallelizationStrategy>`
 * and `<communicationStyle>` (Claude46OpusPrompt),
 * appended to the SDK `guidelines` section. The identity sentences and
 * `securityRequirements` are omitted: the host already replaces identity, and
 * the SDK `safety` section covers the same ground.
 */
export function opusAltPromptGuidelines(): string {
	return [
		'<instructions>',
		'By default, implement changes rather than only suggesting them. If the user\'s intent is unclear, infer the most useful likely action and proceed with using tools to discover missing details instead of guessing.',
		EXPLORATION_GUIDANCE,
		'If your approach is blocked, do not attempt to brute force your way to the outcome. Consider alternative approaches or other ways you might unblock yourself.',
		'Avoid giving time estimates.',
		'</instructions>',
		'<operational_safety>',
		'Take local, reversible actions freely (editing files, running tests). For actions that are hard to reverse, affect shared systems, or could be destructive, ask the user before proceeding.',
		'Actions that warrant confirmation: deleting files/branches, dropping tables, rm -rf, git push --force, git reset --hard, amending published commits, pushing code, commenting on PRs/issues, sending messages, modifying shared infrastructure.',
		'Do not use destructive actions as shortcuts. Do not bypass safety checks (e.g. --no-verify) or discard unfamiliar files that may be in-progress work.',
		'</operational_safety>',
		'<parallelization_strategy>',
		PARALLELIZATION_STRATEGY,
		'</parallelization_strategy>',
		'<communication_style>',
		'Be brief. Target 1-3 sentences for simple answers. Expand only for complex work or when requested.',
		'Skip unnecessary introductions, conclusions, and framing. After completing file operations, confirm briefly rather than explaining what was done.',
		'Do not say "Here\'s the answer:", "The result is:", or "I will now...".',
		'When executing non-trivial commands, explain their purpose and impact.',
		'Do NOT use emojis unless explicitly requested.',
		'<communication_examples>',
		'User: what\'s the square root of 144?',
		'Assistant: 12',
		'User: which directory has the server code?',
		'Assistant: [searches workspace and finds backend/]',
		'backend/',
		'</communication_examples>',
		'</communication_style>',
	].join('\n');
}

/**
 * Copilot Chat `<toolUseInstructions>` with the extension's tool names mapped
 * to the SDK's: `read_file`/`list_dir`/`grep_search`/`file_search` → `view` and
 * the search tools, `run_in_terminal` → `bash`, `create_file`/`replace_string_in_file`
 * → `create`/`edit`. Lines that only make sense with extension-only tools
 * (`semantic_search`, the explore/execution subagents, `manage_todo_list`) are
 * left out rather than pointed at tools the SDK session does not have.
 */
export const OPUS_ALT_PROMPT_TOOL_INSTRUCTIONS = [
	'Read files before modifying them. Understand existing code before suggesting changes.',
	'Do not create files unless absolutely necessary. Prefer editing existing files.',
	'NEVER say the name of a tool to a user. Say "I\'ll run the command in a terminal" instead of "I\'ll use bash".',
	'Call independent tools in parallel. Call dependent tools sequentially.',
	'NEVER edit or create a file by running shell commands (heredocs, `sed -i`, `echo` redirection) unless the user specifically asks for it; use the edit and create tools.',
	'The dedicated file and search tools (view and the search tools) are faster and lead to a more elegant user experience than their shell equivalents. Default to them over lower level shell commands (grep, find, rg, cat, head, tail) and only opt for bash when a dedicated tool is clearly insufficient for the intended action.',
	'When reading files, prefer reading a large section at once over many small reads. Read multiple files in parallel when possible.',
	'When invoking a tool that takes a file path, always use the absolute file path.',
].join('\n');

/**
 * Trims the SDK foundation `tool_instructions` group (~17k chars) of prose that
 * duplicates what the tool schemas already say, mirroring Copilot Chat, whose
 * system prompt carries no per-tool walkthroughs:
 *  - every `<example>` block (the `bash` async/sync and `edit` batching
 *    walkthroughs — ~1.6k chars);
 *  - the `<ask_user>` section (~2.3k chars): interactive-UX guidance for a tool
 *    the schema describes adequately.
 * Everything else is kept: `<bash>` mode/`read_bash` guidance encodes runtime
 * behavior the schema does not express, `<task>` is delegation policy, and
 * `<sql>` carries the todo-table contract.
 *
 * Whole-block regexes, so an SDK rewording leaves the text in place rather than
 * mangling it. The registry appends the host's universal tool lines after this
 * transform's output.
 */
export function trimFoundationToolInstructions(content: string): string {
	return content
		.replace(/\n?<example>[\s\S]*?<\/example>/g, '')
		.replace(/\n?<ask_user>[\s\S]*?<\/ask_user>/g, '');
}

/**
 * Trims the SDK's `last_instructions` of its closing verification and
 * thoroughness mandates, which Copilot Chat does not have:
 *  - the "Your goal is to deliver complete, working solutions … Verify your
 *    changes actually work before considering the task done." paragraph;
 *  - the `<task_completion>` block, except its dependency-install bullet, which
 *    is operational rather than about verification and is kept as a plain line;
 *  - "Respond concisely to the user, but be thorough in your work."
 * Anything else in the section (today, `<tool_calling>` background-agent
 * guidance) is left in place. Whole-paragraph/whole-block regexes, so an SDK
 * rewording leaves the text alone rather than mangling it.
 */
export function trimFoundationLastInstructions(content: string): string {
	return content
		.replace(/\n?Your goal is to deliver complete, working solutions\.[^\n]*Verify your changes actually work before considering the task done\.\n?/, '\n')
		.replace(/\n?<task_completion>\n([\s\S]*?)<\/task_completion>\n?/, (_match, body: string) => {
			const kept = body.split('\n').filter(line => /^\* Install or restore dependencies only after/.test(line)).map(line => line.replace(/^\* /, ''));
			return kept.length > 0 ? `\n${kept.join('\n')}\n` : '\n';
		})
		.replace(/\n?Respond concisely to the user, but be thorough in your work\.\s*$/, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * `customize`-mode section overrides that port the Copilot Chat Claude agent
 * prompt (extensions/copilot/.../anthropicPrompts.tsx, Claude46OpusPrompt) onto
 * the SDK foundation prompt, for Claude Opus models.
 *
 * Motivation: on matched clippy-bench tasks, Claude under the SDK prompt spent
 * ~2.5x the verification turns and ~2.3x the output tokens of the same model
 * under Copilot Chat at equal resolution. The SDK prompt states "verify before
 * done" in six places and has no restraint guidance; the Copilot Chat prompt has
 * no verification mandate and five restraint instructions. This override swaps
 * the former for the latter while keeping the SDK's tool docs and safety
 * sections intact:
 *
 * - `code_change_rules` (transform): drop the "validate that your changes
 *   preserve existing behavior" bullet; add `implementationDiscipline`.
 * - `guidelines` (transform): drop the "reflect on command output", "clean up
 *   temporary files" and "ask for guidance" tips; add Copilot Chat's
 *   exploration restraint, operational safety and communication style.
 *   A transform (not `replace`) so dynamic foundation content in this section
 *   (e.g. rubber-duck guidance) survives.
 * - `tool_instructions` (transform): drop the foundation's `<example>` blocks and
 *   `<ask_user>` walkthrough (see {@link trimFoundationToolInstructions}); add
 *   Copilot Chat's tool-use rules with SDK tool names. The registry appends the
 *   host's universal tool lines after the transform.
 * - `last_instructions` (transform): drop the closing verification/thoroughness
 *   paragraph, `<task_completion>` (keeping its dependency-install bullet) and
 *   "be thorough" (see {@link trimFoundationLastInstructions}); `<tool_calling>`
 *   and any future foundation content survive.
 *
 * `tone` is intentionally not touched: the host's `identity` group replacement
 * already removes the foundation tone sub-section, so the communication style
 * lives in `guidelines` instead.
 */
export function opusAltPromptSectionOverrides(): SectionOverrides {
	return {
		code_change_rules: {
			action: content => `${dropFoundationBullets(content, CODE_CHANGE_RULE_BULLETS_TO_DROP)}\n${OPUS_ALT_PROMPT_IMPLEMENTATION_DISCIPLINE}`,
		},
		guidelines: {
			action: content => `${dropFoundationBullets(content, GUIDELINE_BULLETS_TO_DROP)}\n${opusAltPromptGuidelines()}`,
		},
		tool_instructions: {
			// Trim the foundation prose, then add Copilot Chat's tool-use rules. The
			// registry appends the host's universal lines after this transform.
			action: content => `${trimFoundationToolInstructions(content)}\n${OPUS_ALT_PROMPT_TOOL_INSTRUCTIONS}`,
		},
		last_instructions: {
			action: trimFoundationLastInstructions,
		},
	};
}

// #endregion

// #region Opus 4.8 prompt

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
 * after every N tool calls"), so none is added here.
 */
export function opus48SectionOverrides(): SectionOverrides {
	return {
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

// #endregion

/** Whether `model` is Claude Opus 4.8 — matches the SDK dashed id and the CAPI dotted id. */
function isOpus48(model: ModelSelection): boolean {
	return model.id.startsWith('claude-opus-4-8') || model.id.startsWith('claude-opus-4.8');
}

/** Whether `model` is any Claude model (SDK dashed ids and CAPI dotted ids both start with `claude`). */
function isClaude(model: ModelSelection): boolean {
	return model.id.startsWith('claude');
}

/** Whether `model` is a Claude Opus model (any version; SDK dashed ids and CAPI dotted ids both start with `claude-opus`). */
function isOpus(model: ModelSelection): boolean {
	return model.id.startsWith('claude-opus');
}

/**
 * Merges two section-override sets. Where both name the same section, the
 * second's `append` content is folded after the first's when the first is also
 * an `append`; a first-set transform absorbs a second-set `append` by running
 * the transform and then appending. Anything else lets the second win.
 */
export function mergeSectionOverrides(first: SectionOverrides, second: SectionOverrides): SectionOverrides {
	const merged: SectionOverrides = { ...first };
	for (const [section, override] of Object.entries(second) as [SystemMessageSection, SectionOverride][]) {
		const existing = merged[section];
		if (!existing) {
			merged[section] = override;
			continue;
		}
		if (existing.action === 'append' && override.action === 'append') {
			merged[section] = { action: 'append', content: `${existing.content ?? ''}${override.content ?? ''}` };
			continue;
		}
		if (typeof existing.action === 'function' && override.action === 'append') {
			const transform = existing.action;
			const appended = override.content ?? '';
			merged[section] = { action: async content => `${await transform(content)}${appended}` };
			continue;
		}
		merged[section] = override;
	}
	return merged;
}

/**
 * Claude-family agent prompt. Layers, each behind its own opt-in setting:
 *  1. the Copilot Chat prompt port ({@link opusAltPromptSectionOverrides}),
 *     for Claude Opus models only, via {@link CopilotCliConfigKey.OpusAltPrompt}
 *     (Sonnet/Haiku keep the SDK foundation prompt);
 *  2. the Opus 4.8 tuning ({@link opus48SectionOverrides}), for Opus 4.8 only,
 *     via {@link CopilotCliConfigKey.Opus48Prompt}.
 * Both off → falls back to the default system message. A single contributor
 * because the registry resolves exactly one per model and does not fall
 * through when a contributor opts out.
 */
class ClaudePromptResolver implements IAgentHostPrompt {
	static readonly familyPrefixes: readonly string[] = [];

	static matchesModel(model: ModelSelection): boolean {
		return isClaude(model);
	}

	resolveSectionOverrides(model: ModelSelection, context: IAgentHostPromptContext): SectionOverrides | undefined {
		let overrides: SectionOverrides = {};
		if (isOpus(model) && context.getSetting(CopilotCliConfigKey.OpusAltPrompt) === true) {
			overrides = opusAltPromptSectionOverrides();
		}
		if (isOpus48(model) && context.getSetting(CopilotCliConfigKey.Opus48Prompt) === true) {
			overrides = mergeSectionOverrides(overrides, opus48SectionOverrides());
		}
		return Object.keys(overrides).length > 0 ? overrides : undefined;
	}
}

agentHostPromptRegistry.registerPrompt(ClaudePromptResolver);
