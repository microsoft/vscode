/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { AgentSession } from '../../common/agentService.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../../common/state/protocol/state.js';
import { toCommandCompletionAttachmentMeta } from '../../common/meta/agentCompletionAttachmentMeta.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider } from '../agentHostCompletions.js';
import { extractLeadingSlashToken } from '../agentHostSlashCompletion.js';
import { localize } from '../../../../nls.js';

const HIDDEN_RUNTIME_COMMANDS = new Set<string>(['agent', 'app', 'changelog', 'context', 'copy', 'cwd', 'exit', 'extensions', 'feedback', 'help', 'ide', 'instructions', 'login', 'logout', 'mcp', 'model', 'new', 'plugin', 'rename', 'restart', 'resume', 'sandbox', 'session', 'settings', 'skills', 'statusline', 'streamer-mode', 'subagents', 'tasks', 'terminal-setup', 'theme', 'undo', 'update', 'user', 'voice', 'worktree', 'autopilot', 'yolo']);

export const DEFAULT_RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS = 300;

const CommandOptionDescriptions: Record<string, string> = {
	'chronicle:cost-tips': localize('copilot.command.chronicle.cost.tips', "Get personalized tips to reduce token usage and Copilot cost"),
	'chronicle:improve': localize('copilot.command.chronicle.improve', "Get personalized tips to improve your chat session usage"),
	'chronicle:reindex': localize('copilot.command.chronicle.reindex', "Rebuild the local session index and sync to cloud"),
	'chronicle:search': localize('copilot.command.chronicle.search', "Search recent chat sessions by keyword, file path, or PR/issue ref"),
	'chronicle:standup': localize('copilot.command.chronicle.standup', "Generate a standup report from recent chat sessions"),
	'chronicle:tips': localize('copilot.command.chronicle.tips', "Get personalized tips based on your chat session usage patterns"),
};

// Some hints like `prompt` or `directory` are not useful to show in the completion list, so we ignore them.
// They are not useful as completion items.
const CommandOptionsToIgnore = new Set([
	'add-dir:directory',
	'after:<delay> <prompt>',
	'compact:focus instructions',
	'directory',
	'every:<interval> <prompt>',
	'fleet:prompt',
	'loop:<interval> <prompt>',
	'plan:prompt',
	'research:topic',
	'review:additional instructions',
	'security-review:additional instructions'
]);

/**
 * Lookup hooks used by {@link CopilotSlashCommandCompletionProvider} to
 * retrieve runtime slash command metadata and apply feature gating.
 */
export interface ICopilotSlashCommandSessionInfo {
	/**
	 * Whether the experimental rubber duck critic subagent is enabled via
	 * the agent host config. When provided and `false`, `/rubber-duck` is hidden.
	 */
	isRubberDuckEnabled?(): boolean;
	/** Runtime slash commands discovered from the SDK session. */
	getRuntimeSlashCommands?(sessionId: string, options?: ICopilotRuntimeSlashCommandQueryOptions): Promise<readonly ICopilotRuntimeSlashCommandInfo[]>;
}

export interface ICopilotRuntimeSlashCommandQueryOptions {
	readonly maxWaitMs?: number;
}

/**
 * Result of {@link parseLeadingSlashCommand}.
 */
export interface IParsedLeadingSlashCommand {
	readonly command: string;
	/** Trimmed text following the command (empty if none). */
	readonly rest: string;
	/** Raw text after the command delimiter (preserves multiline text). */
	readonly rawRest: string;
}

/**
 * Parses a Copilot CLI slash command at the very start of `prompt`.
 *
 * Accepts any `/command` token where `command` is a single non-whitespace
 * segment (no leading/trailing spaces, no embedded slash), followed either
 * by end-of-input or by at least one whitespace character.
 */
export function parseLeadingSlashCommand(prompt: string): IParsedLeadingSlashCommand | undefined {
	const match = /^\/([^\s/]+)(?:$|\s+([\s\S]*))/.exec(prompt);
	if (!match) {
		return undefined;
	}
	const rawRest = match[2] ?? '';
	return {
		command: match[1],
		rest: rawRest.trim(),
		rawRest,
	};
}

/**
 * Completion provider for Copilot CLI slash commands. Only fires for
 * sessions whose URI scheme is `copilotcli` and only when the input begins
 * with `/`.
 *
 * The returned items carry a {@link MessageAttachmentKind.Simple}
 * attachment, which the workbench bridge maps into command/skill completion
 * attachments. Command dispatch happens text-side in
 * `CopilotAgentSession.send` via {@link parseLeadingSlashCommand}, so the
 * feature works whether the user picks the item or types it manually.
 */
export class CopilotSlashCommandCompletionProvider implements IAgentHostCompletionItemProvider {
	readonly kinds: ReadonlySet<CompletionItemKind> = new Set([CompletionItemKind.UserMessage]);
	readonly triggerCharacters = [CompletionTriggerCharacter.Slash] as const;

	constructor(
		private readonly copilotcliId: string,
		private readonly _sessionInfo?: ICopilotSlashCommandSessionInfo,
		private readonly _runtimeSlashCommandCompletionWaitMs: number = DEFAULT_RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS,
	) { }

	async provideCompletionItems(params: CompletionsParams, _token: CancellationToken): Promise<readonly CompletionItem[]> {
		if (AgentSession.provider(params.channel) !== this.copilotcliId) {
			return [];
		}
		const leading = extractLeadingSlashToken(params.text, params.offset);
		if (!leading) {
			return [];
		}

		// Raw session id is the URI path without the leading slash.
		const sessionId = AgentSession.id(params.channel);
		// `/abc` → typed = 'abc'; empty after just '/' → typed = ''.
		const typed = leading.typed;
		return await this._getRuntimeSlashCommandCompletionInfo(sessionId, typed, leading);
	}

	private async _getRuntimeSlashCommandCompletionInfo(sessionId: string, typed: string, { rangeStart, rangeEnd }: { rangeStart: number; rangeEnd: number }): Promise<CompletionItem[]> {
		const runtimeCommands = await this._sessionInfo?.getRuntimeSlashCommands?.(sessionId, { maxWaitMs: this._runtimeSlashCommandCompletionWaitMs }) ?? [];
		const typedLower = typed.toLowerCase();
		const rubberDuckEnabled = this._sessionInfo?.isRubberDuckEnabled?.() ?? true;
		const completionItems: CompletionItem[] = [];
		const addedAliases = new Set<string>();

		for (const command of runtimeCommands) {
			if (!command.name) {
				continue;
			}
			if (command.kind === 'skill') {
				// we have a separate completion provider for skills.
				continue;
			}
			if (HIDDEN_RUNTIME_COMMANDS.has(command.name) || command.aliases?.some(alias => HIDDEN_RUNTIME_COMMANDS.has(alias))) {
				continue;
			}
			if (!rubberDuckEnabled && command.name === 'rubber-duck') {
				continue;
			}
			if (typed.length > 0 && !command.name.toLowerCase().startsWith(typedLower) && !command.aliases?.some(alias => alias.toLowerCase().startsWith(typedLower))) {
				continue;
			}
			// Hints contain sub commands like [on|off] or `on|off`
			// First remove the brackets and then split by pipe to get the options
			const options = (command.input?.hint ?? '').replace(/[\[\]]/g, '').split('|');
			if (options.length && !command.input?.required) {
				// If we have options but they are optional,
				// then make sure we add an empty option so that the user can select just the command without any options.
				options.unshift('');
			}


			// Generate completion items for each alias and option combination.
			// If there are no options, generate a single completion item for the alias.
			const aliases = Array.from(new Set([command.name].concat(command.aliases ?? [])));
			aliases
				.filter(alias => !addedAliases.has(alias))
				.forEach(alias => {
					(Array.from(new Set(options.length ? options : [''])))
						.filter(option => !CommandOptionsToIgnore.has(`${command.name}:${option}`))
						.forEach(option => {
							// Add a trailing space after the command (and sub command/option if present).
							// This is so user can continue to type additional arguments after the command and option.
							const insertText = `/${alias}${option ? ' ' + option : ''} `;
							const optionDescription = option ? CommandOptionDescriptions[`${command.name}:${option}`] : command.description;
							const description = optionDescription ?? command.description;

							addedAliases.add(alias);

							completionItems.push({
								insertText,
								rangeStart: rangeStart,
								rangeEnd: rangeEnd,
								attachment: {
									type: MessageAttachmentKind.Simple,
									label: insertText,
									_meta: toCommandCompletionAttachmentMeta({
										command: command.name,
										...(description !== undefined ? { description } : {})
									}),
								},
							});
						});
				});
		}

		return completionItems.sort((a, b) => a.insertText.localeCompare(b.insertText));
	}
}

export interface ICopilotRuntimeSlashCommandInfo {
	readonly name: string;
	readonly aliases?: readonly string[];
	readonly description: string;
	readonly kind: 'builtin' | 'skill' | 'client';
	readonly input?: {
		readonly hint: string;
		readonly required?: boolean;
		readonly preserveMultilineInput?: boolean;
	};
	readonly allowDuringAgentExecution: boolean;
	readonly experimental?: boolean;
	readonly schedulable?: boolean;
}
