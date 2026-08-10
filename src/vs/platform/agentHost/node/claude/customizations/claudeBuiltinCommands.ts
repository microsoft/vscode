/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CustomizationType } from '../../../common/state/protocol/channels-session/state.js';
import { CustomizationLoadStatus, customizationId, type DirectoryCustomization, type SkillCustomization } from '../../../common/state/sessionState.js';

/**
 * URI scheme for synthetic "built-in" customizations that have no editable
 * file on disk. These entries appear in the customization list purely for
 * discovery (their name and description); they carry no openable content.
 */
const AGENT_BUILTIN_SCHEME = 'agent-builtin';

/**
 * A Claude built-in slash command backed by the Skill tool, used to seed the
 * **pre-materialize** built-in list. These ship compiled into the Claude
 * CLI/SDK — they have no editable file on disk and, before a live session
 * exists, the SDK can't tell us its real command set, so we show a curated
 * best-guess list for discoverability.
 *
 * Once a session materializes, {@link buildSdkBuiltinSkillsContainer} replaces
 * this list with the runtime's actual built-ins (the SDK commands we don't
 * discover on disk), so this list only matters pre-session and may safely
 * drift from the CLI over time.
 *
 * This list covers the Skill-tool built-ins only. The CLI-level built-ins
 * typed directly in the terminal (`/help`, `/clear`, `/compact`, `/config`,
 * `/fast`, `/model`, `/tasks`, `/workflows`) are intentionally excluded —
 * they are not skills and would be mislabeled in a Skills container.
 */
interface IClaudeBuiltinCommand {
	readonly name: string;
	/**
	 * User-facing description, resolved lazily so `localize()` runs at call
	 * time rather than module-init (which would freeze the bundle locale).
	 */
	readonly description: () => string;
}

const CLAUDE_BUILTIN_COMMANDS: readonly IClaudeBuiltinCommand[] = [
	{ name: 'init', description: () => localize('claude.builtin.init', "(Built-In) Scan the codebase and generate a `CLAUDE.md` file with project structure, conventions, and instructions for future sessions.") },
	{ name: 'review', description: () => localize('claude.builtin.review', "(Built-In) Review a pull request or set of changes.") },
	{ name: 'security-review', description: () => localize('claude.builtin.securityReview', "(Built-In) Complete a security review of the pending changes on the current branch.") },
	{ name: 'code-review', description: () => localize('claude.builtin.codeReview', "(Built-In) Review the current diff for correctness bugs and reuse/simplification/efficiency cleanups at a chosen effort level (low→max). Pass `--comment` to post findings as inline PR comments, or `--fix` to apply them to the working tree.") },
	{ name: 'simplify', description: () => localize('claude.builtin.simplify', "(Built-In) Review changed code for reuse, simplification, efficiency, and altitude cleanups, then apply the fixes. Quality only — it doesn't hunt for bugs (use `/code-review` for that).") },
	{ name: 'verify', description: () => localize('claude.builtin.verify', "(Built-In) Run the app and observe behavior to confirm a code change actually does what it's supposed to. Use to verify a PR, confirm a fix, or validate local changes before pushing.") },
	{ name: 'run', description: () => localize('claude.builtin.run', "(Built-In) Launch and drive the project's app to see a change working — run, start, or screenshot the app, or confirm a change works in the real app (not just tests).") },
	{ name: 'loop', description: () => localize('claude.builtin.loop', "(Built-In) Run a prompt or slash command on a recurring interval (e.g. `/loop 5m /foo`, defaults to 10m). For recurring tasks or polling status — not one-off work.") },
	{ name: 'claude-api', description: () => localize('claude.builtin.claudeApi', "(Built-In) Reference for the Claude API / Anthropic SDK: model IDs, pricing, params, streaming, tool use, MCP, agents, caching, token counting, migration.") },
	{ name: 'fewer-permission-prompts', description: () => localize('claude.builtin.fewerPermissionPrompts', "(Built-In) Scan transcripts for common read-only Bash/MCP calls and add a prioritized allowlist to project `.claude/settings.json` to reduce permission prompts.") },
	{ name: 'update-config', description: () => localize('claude.builtin.updateConfig', "(Built-In) Configure the Claude Code harness via `settings.json`: hooks for automated behaviors, permissions, env vars, and hook troubleshooting.") },
	{ name: 'keybindings-help', description: () => localize('claude.builtin.keybindingsHelp', "(Built-In) Customize keyboard shortcuts, rebind keys, add chord bindings, or modify `~/.claude/keybindings.json`.") },
	{ name: 'write-a-skill', description: () => localize('claude.builtin.writeASkill', "(Built-In) Author a new skill.") },
];

/**
 * A Claude built-in subagent, used to seed the **pre-materialize** agent list.
 * These ship compiled into the Claude CLI/SDK (no editable file on disk), so
 * before a live session exists we surface a curated best-guess set for
 * discovery and selection. Once a session materializes, the live
 * `supportedAgents()` set supersedes this (see the SDK fallback in
 * `buildDiscoveredCustomizations`), so the list may safely drift over time.
 *
 * Includes the SDK default (`general-purpose`) for completeness; the discovery
 * layer hides it (selecting it is equivalent to "no selection"). The model
 * each agent runs on is folded into the description since the customization
 * surface has no model field.
 */
export interface IClaudeBuiltinAgent {
	readonly name: string;
	/** User-facing description, resolved lazily (see {@link IClaudeBuiltinCommand.description}). */
	readonly description: () => string;
}

export const CLAUDE_BUILTIN_AGENTS: readonly IClaudeBuiltinAgent[] = [
	{ name: 'claude', description: () => localize('claude.builtinAgent.claude', "(Built-In) Catch-all for any task that doesn't fit a more specific agent — the default when no agent name is typed.") },
	{ name: 'claude-code-guide', description: () => localize('claude.builtinAgent.claudeCodeGuide', "(Built-In) Answers questions about the Claude Agent SDK, and the Claude/Anthropic API — features, hooks, slash commands, MCP servers, settings, IDE integrations, SDK agent-building, and API usage. Model: Haiku.") },
	{ name: 'Explore', description: () => localize('claude.builtinAgent.explore', "(Built-In) Read-only search agent for broad fan-out searches across many files when you only need the conclusion; it locates code rather than reviewing it. Model: Haiku.") },
	{ name: 'general-purpose', description: () => localize('claude.builtinAgent.generalPurpose', "(Built-In) General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks.") },
	{ name: 'Plan', description: () => localize('claude.builtinAgent.plan', "(Built-In) Software architect agent for designing implementation plans — step-by-step plans, critical files, and architectural trade-offs.") },
];

/**
 * A resolved built-in skill entry ready to become a read-only customization.
 * Structurally matches the SDK's `SlashCommand` (`{ name, description }`), so
 * the live command set can be passed straight through.
 */
interface IBuiltinSkillEntry {
	readonly name: string;
	readonly description: string;
}

/**
 * Builds the read-only "Built-in" skills container from resolved
 * `{ name, description }` entries. Each child is a {@link CustomizationType.Skill}
 * on the {@link AGENT_BUILTIN_SCHEME}; the name and description shown in the
 * list are the discovery information it carries (the entries have no openable
 * content). Returns `undefined` when there are no entries.
 */
function buildBuiltinSkillsContainer(entries: readonly IBuiltinSkillEntry[]): DirectoryCustomization | undefined {
	if (entries.length === 0) {
		return undefined;
	}

	const children: SkillCustomization[] = entries.map(entry => {
		const uri = URI.from({ scheme: AGENT_BUILTIN_SCHEME, path: `/skill/${encodeURIComponent(entry.name)}` }).toString();
		return {
			type: CustomizationType.Skill,
			id: customizationId(uri),
			uri,
			name: entry.name,
			description: entry.description,
		};
	});

	const containerUri = URI.from({ scheme: AGENT_BUILTIN_SCHEME, path: '/skills' }).toString();
	return {
		type: CustomizationType.Directory,
		id: customizationId(containerUri),
		uri: containerUri,
		name: 'builtin',
		enabled: true,
		contents: CustomizationType.Skill,
		writable: false,
		load: { kind: CustomizationLoadStatus.Loaded },
		children,
	};
}

/**
 * The curated, hardcoded built-in container. Used ONLY pre-materialize —
 * before a live SDK snapshot exists, this is our best guess at the runtime's
 * built-in slash commands so the user can still discover them. Once a session
 * materializes, {@link buildSdkBuiltinSkillsContainer} supersedes it with the
 * runtime's real command set.
 *
 * Curated commands that collide with a discovered disk skill are excluded so
 * a user's editable `/<name>` is never duplicated by a read-only built-in
 * (mirrors {@link buildSdkBuiltinSkillsContainer} and the built-in-agent path).
 * Returns `undefined` when nothing remains.
 *
 * @param diskSkillNames Names of skills discovered on disk, to exclude.
 */
export function buildClaudeBuiltinSkillsContainer(diskSkillNames: ReadonlySet<string>): DirectoryCustomization | undefined {
	return buildBuiltinSkillsContainer(
		CLAUDE_BUILTIN_COMMANDS
			.filter(cmd => !diskSkillNames.has(cmd.name))
			.map(cmd => ({ name: cmd.name, description: cmd.description() }))
	);
}

/**
 * The post-materialize built-in container, derived from the live SDK command
 * set. A command the SDK reports but that we do NOT discover on disk as an
 * editable skill is a genuine runtime built-in (it has no editable file), so
 * it is surfaced read-only via {@link AGENT_BUILTIN_SCHEME} using the SDK's
 * own description. Commands backed by a discovered disk skill are excluded —
 * they are already shown as their editable selves. This auto-includes runtime
 * built-ins we never hardcoded and self-heals as the CLI evolves.
 *
 * @param commands The live SDK command set (`supportedCommands()`).
 * @param diskSkillNames Names of skills discovered on disk, to exclude.
 */
export function buildSdkBuiltinSkillsContainer(
	commands: readonly IBuiltinSkillEntry[],
	diskSkillNames: ReadonlySet<string>,
): DirectoryCustomization | undefined {
	const seen = new Set<string>();
	const entries: IBuiltinSkillEntry[] = [];
	for (const command of commands) {
		if (diskSkillNames.has(command.name) || seen.has(command.name)) {
			continue;
		}
		seen.add(command.name);
		entries.push({ name: command.name, description: command.description });
	}
	return buildBuiltinSkillsContainer(entries);
}
