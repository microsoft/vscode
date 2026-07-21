/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { SessionConfigKey } from './sessionConfigKeys.js';

/**
 * Copilot agent-host "config action" slash commands: workbench-defined slash
 * commands that toggle a well-known session-config property (the `autoApprove`
 * permissions axis and/or the `mode` axis) instead of driving a chat turn.
 *
 * The Copilot agent owns the `autoApprove`/`mode` schema, so these commands are
 * produced server-side (see the Copilot slash-command completion provider) and
 * carry an `action` bag on their completion `_meta`. The workbench interprets
 * that bag on accept — applying the config via the active session's provider so
 * the permission/mode pickers update reactively — while the send path
 * (`CopilotAgentSession.send`) re-applies the change and strips the leading
 * token so it is not dispatched to the runtime as a runtime command.
 *
 * Values below are the well-known enum members of the Copilot platform session
 * schema (`autoApprove`: `default` | `autoApprove`; `mode`: `interactive` |
 * `plan` | `autopilot`).
 */

const AUTO_APPROVE_BYPASS = 'autoApprove';
const AUTO_APPROVE_DEFAULT = 'default';
const MODE_INTERACTIVE = 'interactive';
const MODE_PLAN = 'plan';
const MODE_AUTOPILOT = 'autopilot';

/**
 * A single flattened completion form of a config-action slash command (the bare
 * command or one of its named sub-arguments), ready to be emitted as a
 * completion item.
 */
export interface ICopilotConfigSlashCommandItem {
	/**
	 * The text inserted when accepted. Empty for a pure toggle (nothing is left
	 * in the input); `/command ` (trailing space) for an item that keeps the text
	 * so an argument can be typed.
	 */
	readonly insertText: string;
	/** The display label shown in the picker (e.g. `/autopilot on`). */
	readonly label: string;
	/** The command name (without the leading `/`). */
	readonly command: string;
	/** Human-readable description shown in completion detail. */
	readonly description: string;
	/** Argument hint (ghost text) shown after acceptance for keep-text items. */
	readonly argumentHint?: string;
	/** The session-config change applied when accepted. */
	readonly applyConfig: Readonly<Record<string, string>>;
	/** Sort key used to order completions. */
	readonly sortText: string;
}

/** Internal catalog descriptor for one form of a config-action command. */
interface IConfigSlashOption {
	/** Named sub-argument (e.g. `on`/`off`), or `undefined` for the bare command. */
	readonly arg?: string;
	readonly detail: string;
	readonly config: Readonly<Record<string, string>>;
	/**
	 * When set, the option is a keep-text form: it inserts `/command ` and shows
	 * this hint as ghost text so an argument can be typed. When omitted, the
	 * option is a pure toggle that inserts nothing.
	 */
	readonly argumentHint?: string;
}

interface IConfigSlashCommand {
	readonly command: string;
	readonly sortText: string;
	readonly options: readonly IConfigSlashOption[];
}

function setBypassDetail(): string { return localize('copilotConfigSlash.yolo', "Set permissions to bypass approvals"); }
function setDefaultDetail(): string { return localize('copilotConfigSlash.default', "Set permissions back to default"); }
function autopilotOnDetail(): string { return localize('copilotConfigSlash.autopilot.on', "Switch to autopilot mode"); }
function exitAutopilotDetail(): string { return localize('copilotConfigSlash.exitAutopilot', "Switch to interactive mode"); }
function autopilotPromptDetail(): string { return localize('copilotConfigSlash.autopilot.prompt', "Switch to autopilot mode with an objective"); }
function planPromptDetail(): string { return localize('copilotConfigSlash.plan.prompt', "Create an implementation plan before coding"); }
function autopilotArgumentHint(): string { return localize('copilotConfigSlash.autopilotHint', "objective"); }
function promptArgumentHint(): string { return localize('copilotConfigSlash.promptHint', "Describe what you want to plan or research"); }

function getConfigSlashCommands(): readonly IConfigSlashCommand[] {
	return [
		{
			command: 'yolo', sortText: 'z1_yolo',
			options: [
				{ arg: 'on', detail: setBypassDetail(), config: { [SessionConfigKey.AutoApprove]: AUTO_APPROVE_BYPASS } },
				{ arg: 'off', detail: setDefaultDetail(), config: { [SessionConfigKey.AutoApprove]: AUTO_APPROVE_DEFAULT } }
			],
		},
		{
			command: 'allow-all', sortText: 'z1_allow-all',
			options: [
				{ arg: 'on', detail: setBypassDetail(), config: { [SessionConfigKey.AutoApprove]: AUTO_APPROVE_BYPASS } },
				{ arg: 'off', detail: setDefaultDetail(), config: { [SessionConfigKey.AutoApprove]: AUTO_APPROVE_DEFAULT } }
			],
		},
		{
			command: 'autopilot', sortText: 'z1_autopilot',
			options: [
				{ arg: 'on', detail: autopilotOnDetail(), config: { [SessionConfigKey.Mode]: MODE_AUTOPILOT } },
				{ arg: 'off', detail: exitAutopilotDetail(), config: { [SessionConfigKey.Mode]: MODE_INTERACTIVE } },
				{ detail: autopilotPromptDetail(), config: { [SessionConfigKey.Mode]: MODE_AUTOPILOT }, argumentHint: autopilotArgumentHint() },
			],
		},
		{
			command: 'plan', sortText: 'z1_plan',
			options: [
				{ detail: planPromptDetail(), config: { [SessionConfigKey.Mode]: MODE_PLAN }, argumentHint: promptArgumentHint() },
			],
		},
		{
			command: 'goal', sortText: 'z1_goal',
			options: [
				{ detail: planPromptDetail(), config: { [SessionConfigKey.Mode]: MODE_PLAN }, argumentHint: promptArgumentHint() },
			],
		},
	];
}

/**
 * The set of command names that are config-action commands. Used by the send
 * path to decide whether a leading slash command should be intercepted (applied
 * + stripped) rather than dispatched to the runtime.
 */
export function isCopilotConfigSlashCommand(command: string): boolean {
	return getConfigSlashCommands().some(c => c.command.toLowerCase() === command.toLowerCase());
}

/**
 * The current session-config state used to filter config-action slash command
 * completions so only the state-changing forms are offered (e.g. `/autopilot on`
 * is hidden while already in autopilot mode).
 */
export interface ICopilotConfigSlashCommandState {
	/** The session's current `mode` axis value (e.g. `interactive` / `plan` / `autopilot`). */
	readonly mode?: string;
	/** The session's current `autoApprove` axis value (e.g. `default` / `autoApprove`). */
	readonly autoApprove?: string;
}

/**
 * Returns whether the option should be offered for the current session state.
 * Unknown state and keep-text options are always offered.
 */
function shouldOfferOption(option: IConfigSlashOption, state: ICopilotConfigSlashCommandState | undefined): boolean {
	// Keep-text forms carry a typed prompt/objective and are always relevant.
	if (option.argumentHint !== undefined || !state) {
		return true;
	}
	const autoApproveTarget = option.config[SessionConfigKey.AutoApprove];
	if (autoApproveTarget !== undefined) {
		const isBypass = state.autoApprove === AUTO_APPROVE_BYPASS;
		return autoApproveTarget === AUTO_APPROVE_BYPASS ? !isBypass : isBypass;
	}
	const modeTarget = option.config[SessionConfigKey.Mode];
	if (modeTarget === MODE_AUTOPILOT) {
		return state.mode !== MODE_AUTOPILOT;
	}
	if (modeTarget === MODE_INTERACTIVE) {
		return state.mode === MODE_AUTOPILOT;
	}
	return true;
}

/**
 * Returns the flattened completion items (one per command form) whose command
 * name matches `typed` (the text after the leading `/`, case-insensitive prefix).
 * When `typed` is empty, all items are returned.
 *
 * When `state` (the session's current config values) is provided, pure toggle
 * forms that would be a no-op are filtered out so only the state-changing forms
 * are offered (see {@link shouldOfferOption}).
 */
export function getCopilotConfigSlashCommandItems(typed: string, state?: ICopilotConfigSlashCommandState): ICopilotConfigSlashCommandItem[] {
	const typedLower = typed.trim().toLowerCase();
	const items: ICopilotConfigSlashCommandItem[] = [];
	for (const command of getConfigSlashCommands()) {
		if (typedLower && !command.command.toLowerCase().startsWith(typedLower)) {
			continue;
		}
		for (const option of command.options) {
			if (!shouldOfferOption(option, state)) {
				continue;
			}
			// Keep-text items (those expecting a typed argument) insert `/command `
			// and show the argument hint; pure toggles insert nothing (the display
			// comes from `label`).
			const keep = option.argumentHint !== undefined;
			const insertText = keep ? `/${command.command} ` : '';
			const label = keep
				? `/${command.command}`
				: (option.arg ? `/${command.command} ${option.arg}` : `/${command.command}`);
			items.push({
				insertText,
				label,
				command: command.command,
				description: option.detail,
				...(option.argumentHint !== undefined ? { argumentHint: option.argumentHint } : {}),
				applyConfig: option.config,
				sortText: option.arg ? `${command.sortText}_${option.arg}` : command.sortText,
			});
		}
	}
	return items;
}

/**
 * Result of resolving a config-action slash command on send.
 */
export interface ICopilotConfigSlashCommandSendResult {
	/** The session-config change to (re-)apply. */
	readonly applyConfig: Readonly<Record<string, string>>;
	/**
	 * The prompt text that should be forwarded to the runtime after stripping the
	 * command token (and any recognized sub-argument). Empty when the command is a
	 * pure toggle with no trailing prompt.
	 */
	readonly strippedPrompt: string;
}

/**
 * Resolves a leading config-action slash command for the send path: maps the
 * command (and any recognized `on`/`off` sub-argument) to the session-config
 * change to apply, and returns the remaining prompt text to forward with the
 * command token stripped. Returns `undefined` for non-config-action commands so
 * callers fall through to their normal (runtime) handling.
 */
export function resolveCopilotConfigSlashCommandOnSend(command: string, rest: string): ICopilotConfigSlashCommandSendResult | undefined {
	const descriptor = getConfigSlashCommands().find(c => c.command.toLowerCase() === command.toLowerCase());
	if (!descriptor) {
		return undefined;
	}
	const trimmedRest = rest.trim();
	const namedOptions = descriptor.options.filter(o => o.arg !== undefined);
	if (namedOptions.length > 0 && trimmedRest.length > 0) {
		const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmedRest);
		const firstToken = match?.[1]?.toLowerCase();
		const matched = namedOptions.find(o => o.arg?.toLowerCase() === firstToken);
		if (matched) {
			return { applyConfig: matched.config, strippedPrompt: (match?.[2] ?? '').trim() };
		}
	}
	// Fall back to the bare command form (the base/prompt option or the sole option).
	const baseOption = descriptor.options.find(o => o.arg === undefined) ?? descriptor.options[0];
	return { applyConfig: baseOption.config, strippedPrompt: trimmedRest };
}
