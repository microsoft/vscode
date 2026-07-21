/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { AgentSession } from '../../common/agentService.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../../common/state/protocol/commands.js';
import { Customization, CustomizationType, DirectoryCustomization, MessageAttachmentKind, PluginCustomization, SkillCustomization } from '../../common/state/protocol/state.js';
import { toCommandCompletionAttachmentMeta } from '../../common/meta/agentCompletionAttachmentMeta.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider } from '../agentHostCompletions.js';
import { extractLeadingSlashToken, extractWhitespaceDelimitedSlashToken } from '../agentHostSlashCompletion.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../common/agentHostFileSystemService.js';
import type { IBuiltinSkill } from './copilotBuiltinSkills.js';
import type { CopilotSession } from '@github/copilot-sdk';

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
	 * The harness's built-in skills (e.g. `/troubleshoot`), surfaced as slash
	 * completions directly from the manifest so they appear immediately - even
	 * for a brand-new session, before the SDK lists them as runtime commands.
	 * Omitted in contexts (such as tests) that don't exercise built-ins.
	 */
	getBuiltinSkills?(): readonly IBuiltinSkill[];
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
		// The harness's built-in skills (e.g. `/troubleshoot`) are surfaced
		// directly by this provider (see below), so treat them as known: this
		// dedupes the runtime `skill` copy the SDK reports once a session has
		// materialized, keeping a single entry across the session lifetime.
		for (const skill of this._sessionInfo.getBuiltinSkills?.() ?? []) {
			knownCommands.add(skill.name);
		}
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

		// Surface the harness's built-in skills (e.g. `/troubleshoot`) as slash
		// completions directly from the manifest, so they appear immediately -
		// even for a brand-new session, before the SDK lists them as runtime
		// commands. These are plain completion items (not customizations), so
		// they are not claimed by the workbench prompt-file machinery; dispatch
		// remains text-side via `parseLeadingSlashCommand`, whose regex requires
		// the `/` at offset 0 - so only advertise built-ins for a leading token,
		// never a mid-message `use /...` token that could not be dispatched.
		if (!returnJustSkills) {
			for (const skill of this._sessionInfo.getBuiltinSkills?.() ?? []) {
				if (addedAliases.has(skill.name)) {
					continue;
				}
				if (typed.length > 0 && !skill.name.toLowerCase().startsWith(typedLower)) {
					continue;
				}
				const insertText = `/${skill.name} `;
				const description = skill.description();
				addedAliases.add(skill.name);
				completionItems.push({
					insertText,
					rangeStart,
					rangeEnd,
					attachment: {
						type: MessageAttachmentKind.Simple,
						label: insertText,
						_meta: toCommandCompletionAttachmentMeta({
							command: skill.name,
							description,
						}),
					},
				});
			}
		}

		return completionItems.sort((a, b) => a.insertText.localeCompare(b.insertText));
	}
}

export type ICopilotRuntimeSlashCommandInfo = Awaited<ReturnType<CopilotSession['rpc']['commands']['list']>>['commands'][number];

function isSyncedCustomization(container: PluginCustomization): boolean {
	return container.uri.startsWith(SYNCED_CUSTOMIZATION_SCHEME + ':');
}
