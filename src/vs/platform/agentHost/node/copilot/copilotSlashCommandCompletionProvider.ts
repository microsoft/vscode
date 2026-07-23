/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { AgentSession } from '../../common/agentService.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../../common/state/protocol/commands.js';
import { Customization, CustomizationType, DirectoryCustomization, MessageAttachmentKind, PluginCustomization, SkillCustomization } from '../../common/state/protocol/state.js';
import { toCommandCompletionAttachmentMeta } from '../../common/meta/agentCompletionAttachmentMeta.js';
import { getCopilotConfigSlashCommandItems, ICopilotConfigSlashCommandState, isCopilotConfigSlashCommand } from '../../common/copilotConfigSlashCommands.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider } from '../agentHostCompletions.js';
import { extractLeadingSlashToken, extractWhitespaceDelimitedSlashToken } from '../agentHostSlashCompletion.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../common/agentHostFileSystemService.js';
import type { CopilotSession } from '@github/copilot-sdk';

export { parseLeadingSlashCommand } from '../../common/agentHostSlashCommand.js';

const HIDDEN_RUNTIME_COMMANDS = new Set<string>(['agent', 'app', 'changelog', 'context', 'copy', 'exit', 'extensions', 'feedback', 'help', 'ide', 'instructions', 'login', 'logout', 'mcp', 'model', 'new', 'plugin', 'rename', 'restart', 'resume', 'sandbox', 'session', 'settings', 'skills', 'statusline', 'streamer-mode', 'subagents', 'tasks', 'terminal-setup', 'theme', 'undo', 'update', 'user', 'voice', 'worktree', 'autopilot', 'yolo', 'cd', 'cwd', 'after', 'before', 'add-dir', 'allow-all', 'list-dirs', 'reset-allowed-tools']);

export const DEFAULT_RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS = 300;

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
	getSessionCustomizations: (session: string) => Promise<readonly Customization[]>;
	/**
	 * The session's current config state (`mode` / `autoApprove` axes), used to
	 * filter config-action slash command completions so only the state-changing
	 * forms are offered. When omitted, all forms are offered.
	 */
	getSessionConfigState?(sessionId: string): ICopilotConfigSlashCommandState | undefined;
}

export interface ICopilotRuntimeSlashCommandQueryOptions {
	readonly maxWaitMs?: number;
}

/**
 * Completion provider for Copilot CLI slash commands. Only fires for
 * sessions whose URI scheme is `copilotcli` and only when the input begins
 * with `/`.
 *
 * The returned items carry a {@link MessageAttachmentKind.Simple}
 * attachment, which the workbench bridge maps into command/skill completion
 * attachments. Runtime command dispatch is text-side in `CopilotAgentSession.send`;
 * client-side config commands also share the same leading slash parser.
 */
export class CopilotSlashCommandCompletionProvider implements IAgentHostCompletionItemProvider {
	readonly kinds: ReadonlySet<CompletionItemKind> = new Set([CompletionItemKind.UserMessage]);
	readonly triggerCharacters = [CompletionTriggerCharacter.Slash] as const;

	constructor(
		private readonly copilotcliId: string,
		private readonly _sessionInfo: ICopilotSlashCommandSessionInfo,
		private readonly _runtimeSlashCommandCompletionWaitMs: number = DEFAULT_RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS,
	) { }

	async provideCompletionItems(params: CompletionsParams, _token: CancellationToken): Promise<readonly CompletionItem[]> {
		if (AgentSession.provider(params.channel) !== this.copilotcliId) {
			return [];
		}
		const leadingTokenForSkills = extractWhitespaceDelimitedSlashToken(params.text, params.offset);
		const leadingTokenForCommands = extractLeadingSlashToken(params.text, params.offset);
		const leading = leadingTokenForCommands ?? leadingTokenForSkills;
		const returnJustSkills = !leadingTokenForCommands && !!leadingTokenForSkills;
		if (!leading) {
			return [];
		}

		// Raw session id is the URI path without the leading slash.
		const sessionId = AgentSession.id(params.channel);
		// `/abc` → typed = 'abc'; empty after just '/' → typed = ''.
		const typed = leading.typed;
		return await this._getRuntimeSlashCommandCompletionInfo(sessionId, typed, leading, returnJustSkills);
	}

	private async _getKnownSkills(sessionId: string) {
		const knownCommands = new Set<string>();
		const customizations = await this._sessionInfo.getSessionCustomizations(sessionId) ?? [];
		for (const c of customizations) {
			if (c.type === CustomizationType.McpServer || !c.enabled || !c.children) {
				continue;
			}
			for (const child of c.children) {
				if (child.type === CustomizationType.Skill) {
					knownCommands.add(this._toSlashCommandCandidate(c, child));
				}
			}
		}
		return knownCommands;
	}

	private _toSlashCommandCandidate(container: PluginCustomization | DirectoryCustomization, skill: SkillCustomization): string {
		// see getCanonicalPluginCommandId
		let slashCommandName = skill.name;
		if (container.type === CustomizationType.Plugin && !isSyncedCustomization(container) && skill.name !== container.name) {
			slashCommandName = `${container.name}:${skill.name}`;
		}
		return slashCommandName;
	}

	private async _getRuntimeSlashCommandCompletionInfo(sessionId: string, typed: string, { rangeStart, rangeEnd }: { rangeStart: number; rangeEnd: number }, returnJustSkills: boolean): Promise<CompletionItem[]> {
		const [runtimeCommands, knownSkills] = await Promise.all([
			this._sessionInfo.getRuntimeSlashCommands?.(sessionId, { maxWaitMs: this._runtimeSlashCommandCompletionWaitMs }) ?? [],
			this._getKnownSkills(sessionId)
		]);
		const typedLower = typed.toLowerCase();
		const rubberDuckEnabled = this._sessionInfo?.isRubberDuckEnabled?.() ?? true;
		const completionItems: CompletionItem[] = [];
		const addedAliases = new Set<string>();

		for (const command of runtimeCommands) {
			if (!command.name) {
				continue;
			}
			if (returnJustSkills && command.kind !== 'skill') {
				continue;
			}
			if (command.kind === 'skill' && knownSkills.has(command.name)) {
				// This is a known skill, so we don't want to show it in the runtime command completion list.
				continue;
			}
			if (HIDDEN_RUNTIME_COMMANDS.has(command.name) || command.aliases?.some(alias => HIDDEN_RUNTIME_COMMANDS.has(alias))) {
				continue;
			}
			// Config-action commands (permission/mode toggles) are surfaced below
			// as workbench-defined items; skip any runtime command that collides
			// with them (e.g. a runtime `plan`) to avoid duplicate suggestions.
			if (isCopilotConfigSlashCommand(command.name) || command.aliases?.some(alias => isCopilotConfigSlashCommand(alias))) {
				continue;
			}
			if (!rubberDuckEnabled && command.name === 'rubber-duck') {
				continue;
			}
			if (typed.length > 0 && !command.name.toLowerCase().startsWith(typedLower) && !command.aliases?.some(alias => alias.toLowerCase().startsWith(typedLower))) {
				continue;
			}
			// Use structured input choices as options; if there are none, emit a single item for the command and surface any free-text hint as a prompt.
			const options: (NonNullable<NonNullable<ICopilotRuntimeSlashCommandInfo['input']>['choices']>[number] & { argumentHint?: string })[] = [];

			// If we have a hint, then this means we have a structured command with sub commands or options.
			// I.e. the standalone command is also valie.
			if (command.input?.hint || !command.input?.choices?.length) {
				options.push({ name: '', description: command.description, argumentHint: command.input?.hint });
			}
			if (command.input?.choices?.length) {
				options.push(...command.input.choices);
			}

			// Generate completion items for each alias and option combination.
			// If there are no options, generate a single completion item for the alias.
			const aliases = Array.from(new Set([command.name].concat(command.aliases ?? [])));
			aliases
				.filter(alias => !addedAliases.has(alias))
				.forEach(alias => {
					options
						.forEach(option => {
							// Add a trailing space after the command (and sub command/option if present).
							// This is so user can continue to type additional arguments after the command and option.
							const insertText = `/${alias}${option.name ? ' ' + option.name : ''} `;
							const description = option.description ?? command.description;
							const argumentHint = option.argumentHint;
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
										...(description !== undefined ? { description } : {}),
										...(argumentHint !== undefined ? { argumentHint } : {})
									}),
								},
							});
						});
				});
		}

		// Prepend workbench-defined config-action commands (permission/mode
		// toggles). These are not runtime SDK commands; they carry an `action`
		// bag on their `_meta` that the workbench interprets on accept. Only
		// offered for leading `/command` tokens (not the whitespace-delimited
		// skill form).
		if (!returnJustSkills) {
			const configState = this._sessionInfo.getSessionConfigState?.(sessionId);
			for (const item of getCopilotConfigSlashCommandItems(typed, configState)) {
				completionItems.push({
					insertText: item.insertText,
					label: item.label,
					rangeStart,
					rangeEnd,
					attachment: {
						type: MessageAttachmentKind.Simple,
						label: item.label,
						_meta: toCommandCompletionAttachmentMeta({
							command: item.command,
							description: item.description,
							...(item.argumentHint !== undefined ? { argumentHint: item.argumentHint } : {}),
							action: { applyConfig: item.applyConfig },
						}),
					},
				});
			}
		}

		return completionItems.sort((a, b) => (a.label ?? a.insertText).localeCompare(b.label ?? b.insertText));
	}
}

export type ICopilotRuntimeSlashCommandInfo = Awaited<ReturnType<CopilotSession['rpc']['commands']['list']>>['commands'][number];

function isSyncedCustomization(container: PluginCustomization): boolean {
	return container.uri.startsWith(SYNCED_CUSTOMIZATION_SCHEME + ':');
}
