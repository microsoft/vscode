/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { localize } from '../../../../nls.js';
import { AgentSession } from '../../common/agent.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../../common/state/protocol/commands.js';
import { Customization, CustomizationType, DirectoryCustomization, MessageAttachmentKind, PluginCustomization, SkillCustomization } from '../../common/state/protocol/state.js';
import { getCompletionAction, toCommandCompletionAttachmentMeta } from '../../common/meta/agentCompletionAttachmentMeta.js';
import { getCopilotConfigSlashCommandItems, ICopilotConfigSlashCommandState, isCopilotConfigSlashCommand } from '../../common/copilotConfigSlashCommands.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider } from '../agentHostCompletions.js';
import { extractLeadingSlashToken, extractWhitespaceDelimitedSlashToken, matchesSlashCompletion } from '../agentHostSlashCompletion.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../common/agentHostFileSystemService.js';
import { isCustomizationEnabled, isSkillEligibleForUserInvocation } from '../../common/customizationEnablement.js';
import type { RuntimeSlashCommandInfo } from './copilotSlashCommand.js';

export { parseLeadingSlashCommand } from '../../common/agentHostSlashCommand.js';

const HIDDEN_RUNTIME_COMMANDS = new Set<string>(['agent', 'app', 'changelog', 'context', 'copy', 'exit', 'extensions', 'feedback', 'help', 'ide', 'instructions', 'login', 'logout', 'model', 'new', 'rename', 'restart', 'resume', 'sandbox', 'session', 'settings', 'statusline', 'streamer-mode', 'subagents', 'tasks', 'terminal-setup', 'theme', 'undo', 'update', 'user', 'voice', 'worktree', 'autopilot', 'yolo', 'cd', 'cwd', 'after', 'before', 'add-dir', 'allow-all', 'list-dirs', 'reset-allowed-tools']);

export const DEFAULT_RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS = 300;
const PLUGIN_MARKETPLACE_COMPLETION_CACHE_TTL_MS = 30_000;

/**
 * Lookup hooks used by {@link CopilotSlashCommandCompletionProvider} to
 * retrieve runtime slash command metadata and apply feature gating.
 */
export interface ICopilotSlashCommandSessionInfo {
	ownsSession?(session: string): boolean;
	/**
	 * Whether the experimental rubber duck critic subagent is enabled via
	 * the agent host config. When provided and `false`, `/rubber-duck` is hidden.
	 */
	isRubberDuckEnabled?(): boolean;
	/** Whether local session indexing and Chronicle commands are enabled. */
	isLocalIndexEnabled?(): boolean;
	/** Runtime slash commands discovered from the SDK session. */
	getRuntimeSlashCommands?(sessionId: string, options?: ICopilotRuntimeSlashCommandQueryOptions): Promise<readonly ICopilotRuntimeSlashCommandInfo[]>;
	getSessionCustomizations: (session: string) => Promise<readonly Customization[]>;
	getPluginMarketplaces?(sessionId: string): Promise<readonly { readonly name: string; readonly isDefault?: boolean; readonly managed?: boolean }[]>;
	getPluginMarketplacePlugins?(sessionId: string): Promise<readonly { readonly name: string; readonly marketplace: string }[]>;
	getInstalledPlugins?(sessionId: string): Promise<readonly { readonly name: string; readonly marketplace: string; readonly enabled: boolean; readonly source?: string; readonly managed?: boolean; readonly installed?: boolean }[]>;
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
	readonly triggerCharacters = [CompletionTriggerCharacter.Slash, CompletionTriggerCharacter.Space] as const;
	private readonly _pluginMarketplaceCompletionCache = new Map<string, { readonly expiresAt: number; readonly value: Promise<readonly { readonly name: string; readonly marketplace: string }[]> }>();

	constructor(
		private readonly copilotcliId: string,
		private readonly _sessionInfo: ICopilotSlashCommandSessionInfo,
		private readonly _runtimeSlashCommandCompletionWaitMs: number = DEFAULT_RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS,
	) { }

	async provideCompletionItems(params: CompletionsParams, _token: CancellationToken): Promise<readonly CompletionItem[]> {
		if (!(this._sessionInfo.ownsSession?.(params.channel) ?? (AgentSession.provider(params.channel) === this.copilotcliId))) {
			return [];
		}
		const sessionId = AgentSession.id(params.channel);
		const customizationCompletions = await this._getCustomizationCompletions(params.text, params.offset, sessionId);
		if (customizationCompletions) {
			return customizationCompletions;
		}
		const commandArgument = extractSlashCommandArgument(params.text, params.offset);
		if (commandArgument) {
			return this._getRuntimeSlashCommandCompletionInfo(sessionId, commandArgument.command, commandArgument, false, commandArgument.typed);
		}
		const leadingTokenForSkills = extractWhitespaceDelimitedSlashToken(params.text, params.offset);
		const leadingTokenForCommands = extractLeadingSlashToken(params.text, params.offset);
		const leading = leadingTokenForCommands ?? leadingTokenForSkills;
		const returnJustSkills = !leadingTokenForCommands && !!leadingTokenForSkills;
		if (!leading) {
			return [];
		}

		// Raw session id is the URI path without the leading slash.
		// `/abc` → typed = 'abc'; empty after just '/' → typed = ''.
		const typed = leading.typed;
		return await this._getRuntimeSlashCommandCompletionInfo(sessionId, typed, leading, returnJustSkills);
	}

	private async _getCustomizationCompletions(text: string, offset: number, sessionId: string): Promise<CompletionItem[] | undefined> {
		const range = getWordRangeAtOffset(text, offset);
		if (!range) {
			return undefined;
		}
		const prefix = text.slice(0, range.start);
		if (/^\/plugin\s+marketplace\s+$/i.test(prefix)) {
			return pluginMarketplaceChoices()
				.filter(choice => matchesSlashCompletion(text.slice(range.start, offset), choice.name))
				.map((choice): CompletionItem => ({
					insertText: `${choice.name} `,
					rangeStart: range.start,
					rangeEnd: range.end,
					attachment: {
						type: MessageAttachmentKind.Simple,
						label: choice.name,
						_meta: toCommandCompletionAttachmentMeta({
							command: 'plugin',
							description: choice.description,
							...(choice.name !== 'list' ? { retriggerSuggestions: true } : {}),
							...(choice.name === 'list' ? { submitOnAccept: true } : {}),
						}),
					},
				}))
				.sort((a, b) => a.insertText.localeCompare(b.insertText));
		}

		const marketplaceCommand = /^\/plugin\s+marketplace\s+(?<subcommand>browse|update|remove)\s+$/i.exec(prefix);
		if (marketplaceCommand?.groups?.subcommand) {
			const subcommand = marketplaceCommand.groups.subcommand.toLowerCase();
			const marketplaces = await this._sessionInfo.getPluginMarketplaces?.(sessionId) ?? [];
			return marketplaces
				.filter(marketplace => subcommand !== 'remove' || (!marketplace.isDefault && !marketplace.managed))
				.map(marketplace => marketplace.name)
				.filter((name, index, names) => names.indexOf(name) === index)
				.filter(name => matchesSlashCompletion(text.slice(range.start, offset), name))
				.map((name): CompletionItem => ({
					insertText: name,
					rangeStart: range.start,
					rangeEnd: range.end,
					attachment: {
						type: MessageAttachmentKind.Simple,
						label: name,
					},
				}))
				.sort((a, b) => a.insertText.localeCompare(b.insertText));
		}

		if (/^\/plugin\s+install\s+$/i.test(prefix)) {
			const plugins = await this._getPluginMarketplacePlugins(sessionId);
			return plugins
				.map(plugin => `${plugin.name}@${plugin.marketplace}`)
				.filter((spec, index, specs) => specs.indexOf(spec) === index)
				.filter(spec => matchesSlashCompletion(text.slice(range.start, offset), spec))
				.map((spec): CompletionItem => ({
					insertText: spec,
					rangeStart: range.start,
					rangeEnd: range.end,
					attachment: {
						type: MessageAttachmentKind.Simple,
						label: spec,
					},
				}))
				.sort((a, b) => a.insertText.localeCompare(b.insertText));
		}

		const command = /^\/(?<command>mcp|skills|plugin)\s+(?<subcommand>enable|disable|show|info|uninstall|remove|update)\s*$/i.exec(prefix);
		if (!command?.groups) {
			return undefined;
		}

		const { command: commandName, subcommand } = command.groups;
		if ((commandName.toLowerCase() === 'mcp' && !['enable', 'disable', 'show'].includes(subcommand.toLowerCase()))
			|| (commandName.toLowerCase() === 'skills' && subcommand.toLowerCase() !== 'info')
			|| (commandName.toLowerCase() === 'plugin' && !['enable', 'disable', 'uninstall', 'remove', 'update'].includes(subcommand.toLowerCase()))) {
			return undefined;
		}

		if (commandName.toLowerCase() === 'plugin') {
			const plugins = await this._sessionInfo.getInstalledPlugins?.(sessionId) ?? [];
			const directPluginNameCounts = new Map<string, number>();
			for (const plugin of plugins) {
				if (!plugin.marketplace) {
					directPluginNameCounts.set(plugin.name, (directPluginNameCounts.get(plugin.name) ?? 0) + 1);
				}
			}
			const candidates = plugins
				.filter(plugin => plugin.installed !== false && !plugin.managed)
				.filter(plugin => {
					switch (subcommand.toLowerCase()) {
						case 'enable':
							return !!plugin.marketplace && !plugin.enabled;
						case 'disable':
							return !!plugin.marketplace && plugin.enabled;
						case 'uninstall':
						case 'remove':
						case 'update':
							return plugin.source !== 'builtin' && (!!plugin.marketplace || directPluginNameCounts.get(plugin.name) === 1);
					}
					return false;
				})
				.map(plugin => plugin.marketplace ? `${plugin.name}@${plugin.marketplace}` : plugin.name);
			return Array.from(new Set(candidates))
				.filter(name => matchesSlashCompletion(text.slice(range.start, offset), name))
				.map((name): CompletionItem => ({
					insertText: name,
					rangeStart: range.start,
					rangeEnd: range.end,
					attachment: {
						type: MessageAttachmentKind.Simple,
						label: name,
					},
				}))
				.sort((a, b) => a.insertText.localeCompare(b.insertText));
		}

		const customizations = await this._sessionInfo.getSessionCustomizations(sessionId) ?? [];
		const candidates = new Set<string>();
		for (const customization of customizations) {
			if (commandName.toLowerCase() === 'mcp' && customization.type === CustomizationType.McpServer) {
				candidates.add(customization.name);
			}
			for (const child of customization.type === CustomizationType.McpServer ? [] : customization.children ?? []) {
				if ((commandName.toLowerCase() === 'mcp' && child.type === CustomizationType.McpServer)
					|| (commandName.toLowerCase() === 'skills' && child.type === CustomizationType.Skill)) {
					candidates.add(child.name);
				}
			}
		}

		return Array.from(candidates)
			.filter(name => matchesSlashCompletion(text.slice(range.start, offset), name))
			.map((name): CompletionItem => ({
				insertText: name,
				rangeStart: range.start,
				rangeEnd: range.end,
				attachment: {
					type: MessageAttachmentKind.Simple,
					label: name,
				},
			}))
			.sort((a, b) => a.insertText.localeCompare(b.insertText));
	}

	private async _getPluginMarketplacePlugins(sessionId: string): Promise<readonly { readonly name: string; readonly marketplace: string }[]> {
		const cached = this._pluginMarketplaceCompletionCache.get(sessionId);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.value;
		}
		const value = this._sessionInfo.getPluginMarketplacePlugins?.(sessionId) ?? Promise.resolve([]);
		this._pluginMarketplaceCompletionCache.set(sessionId, {
			expiresAt: Date.now() + PLUGIN_MARKETPLACE_COMPLETION_CACHE_TTL_MS,
			value,
		});
		try {
			return await value;
		} catch (error) {
			if (this._pluginMarketplaceCompletionCache.get(sessionId)?.value === value) {
				this._pluginMarketplaceCompletionCache.delete(sessionId);
			}
			throw error;
		}
	}

	private async _getKnownSkills(sessionId: string): Promise<{ readonly known: ReadonlySet<string>; readonly syncedContainerNames: ReadonlySet<string> }> {
		const known = new Set<string>();
		const syncedContainerNames = new Set<string>();
		const customizations = await this._sessionInfo.getSessionCustomizations(sessionId) ?? [];
		for (const c of customizations) {
			if (c.type === CustomizationType.McpServer || (c.type === CustomizationType.Plugin ? !isCustomizationEnabled(c) : !c.enabled) || !c.children) {
				continue;
			}
			if (c.type === CustomizationType.Plugin && isSyncedCustomization(c)) {
				syncedContainerNames.add(c.name.toLowerCase());
			}
			for (const child of c.children) {
				if (child.type === CustomizationType.Skill && isSkillEligibleForUserInvocation(child)) {
					known.add(this._toSlashCommandCandidate(c, child).toLowerCase());
				}
			}
		}
		return { known, syncedContainerNames };
	}

	/**
	 * Whether a runtime skill command duplicates one the generic skill-completion
	 * provider already surfaces, including the synced bundle's namespaced
	 * `<bundleName>:<skill>` form (kept when its bare name is reserved).
	 */
	private _isKnownSkillDuplicate(name: string, knownSkills: ReadonlySet<string>, syncedContainerNames: ReadonlySet<string>, runtimeCommands: readonly ICopilotRuntimeSlashCommandInfo[]): boolean {
		const lower = name.toLowerCase();
		if (knownSkills.has(lower)) {
			return true;
		}
		for (const syncedName of syncedContainerNames) {
			const prefix = `${syncedName}:`;
			if (lower.startsWith(prefix)) {
				const stripped = lower.slice(prefix.length);
				return knownSkills.has(stripped) && !this._isReservedBareName(stripped, runtimeCommands);
			}
		}
		return false;
	}

	/**
	 * Whether a bare slash name would be intercepted by something other than a
	 * bundled skill on send: a Copilot config action, the client-handled
	 * `compact` / `rubber-duck` commands, or a non-skill runtime command (by name
	 * or alias).
	 */
	private _isReservedBareName(name: string, runtimeCommands: readonly ICopilotRuntimeSlashCommandInfo[]): boolean {
		if (isCopilotConfigSlashCommand(name) || name === 'compact' || name === 'rubber-duck') {
			return true;
		}
		return runtimeCommands.some(command =>
			command.kind !== 'skill'
			&& (command.name?.toLowerCase() === name || !!command.aliases?.some(alias => alias.toLowerCase() === name)));
	}

	private _toSlashCommandCandidate(container: PluginCustomization | DirectoryCustomization, skill: SkillCustomization): string {
		// see getCanonicalPluginCommandId
		let slashCommandName = skill.name;
		if (container.type === CustomizationType.Plugin && !isSyncedCustomization(container) && skill.name !== container.name) {
			slashCommandName = `${container.name}:${skill.name}`;
		}
		return slashCommandName;
	}

	private async _getRuntimeSlashCommandCompletionInfo(sessionId: string, typed: string, { rangeStart, rangeEnd }: { rangeStart: number; rangeEnd: number }, returnJustSkills: boolean, argumentTyped?: string): Promise<CompletionItem[]> {
		const [runtimeCommands, { known: knownSkills, syncedContainerNames }] = await Promise.all([
			this._sessionInfo.getRuntimeSlashCommands?.(sessionId, { maxWaitMs: this._runtimeSlashCommandCompletionWaitMs }) ?? [],
			this._getKnownSkills(sessionId)
		]);
		const typedLower = typed.toLowerCase();
		const rubberDuckEnabled = this._sessionInfo?.isRubberDuckEnabled?.() ?? true;
		const localIndexEnabled = this._sessionInfo.isLocalIndexEnabled?.() ?? true;
		const completionItems: CompletionItem[] = [];
		const addedAliases = new Set<string>();

		for (const command of runtimeCommands) {
			if (!command.name) {
				continue;
			}
			if (returnJustSkills && command.kind !== 'skill') {
				continue;
			}
			if (command.kind === 'skill' && this._isKnownSkillDuplicate(command.name, knownSkills, syncedContainerNames, runtimeCommands)) {
				// Already surfaced by the generic skill-completion provider.
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
			if (!localIndexEnabled && command.kind === 'builtin' && command.name === 'chronicle') {
				continue;
			}
			const aliases = Array.from(new Set([command.name].concat(command.aliases ?? [])));
			const commandMatches = argumentTyped === undefined
				? aliases.some(alias => matchesSlashCompletion(typedLower, alias))
				: aliases.some(alias => alias.toLowerCase() === typedLower);
			if (!commandMatches) {
				continue;
			}
			// Use structured input choices as options; if there are none, emit a single item for the command and surface any free-text hint as a prompt.
			const options: (NonNullable<NonNullable<ICopilotRuntimeSlashCommandInfo['input']>['choices']>[number] & { argumentHint?: string })[] = [];
			const choices = command.name === 'plugin'
				? mergePluginCommandChoices(command.input?.choices ?? [])
				: command.input?.choices ?? [];

			// If we have a hint, then this means we have a structured command with sub commands or options.
			// I.e. the standalone command is also valie.
			if (command.input?.hint || !choices.length) {
				options.push({ name: '', description: command.description, argumentHint: command.input?.hint });
			}
			if (choices.length) {
				options.push(...choices);
			}

			// Generate completion items for each alias and option combination.
			// If there are no options, generate a single completion item for the alias.
			aliases
				.filter(alias => !addedAliases.has(alias))
				.forEach(alias => {
					options
						.filter(option => argumentTyped === undefined
							|| (!!option.name && matchesSlashCompletion(argumentTyped, option.name)))
						.forEach(option => {
							// Add a trailing space after the command (and sub command/option if present).
							// This is so user can continue to type additional arguments after the command and option.
							const insertText = argumentTyped === undefined
								? `/${alias}${option.name ? ' ' + option.name : ''} `
								: `${option.name} `;
							const description = option.description ?? command.description;
							const argumentHint = option.argumentHint;
							const retriggerSuggestions = !option.name
								? ['mcp', 'plugin', 'skills'].includes(command.name)
								: command.name === 'mcp'
									? ['enable', 'disable', 'show'].includes(option.name)
									: command.name === 'skills'
										? option.name === 'info'
										: command.name === 'plugin' && ['marketplace', 'install', 'enable', 'disable', 'uninstall', 'remove', 'update'].includes(option.name);
							const submitOnAccept = ['mcp', 'plugin', 'skills'].includes(command.name) && ['list', 'reload'].includes(option.name);
							addedAliases.add(alias);

							completionItems.push({
								insertText,
								rangeStart: rangeStart,
								rangeEnd: rangeEnd,
								attachment: {
									type: MessageAttachmentKind.Simple,
									label: argumentTyped === undefined
										? `${alias}${option.name ? ' ' + option.name : ''}`
										: option.name,
									_meta: toCommandCompletionAttachmentMeta({
										command: command.name,
										...(command.kind === 'skill' ? { isSkill: true } : {}),
										...(description !== undefined ? { description } : {}),
										...(argumentHint !== undefined ? { argumentHint } : {}),
										...(retriggerSuggestions ? { retriggerSuggestions: true } : {}),
										...(submitOnAccept ? { submitOnAccept: true } : {}),
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
		if (!returnJustSkills && argumentTyped === undefined) {
			const configState = this._sessionInfo.getSessionConfigState?.(sessionId);
			for (const item of getCopilotConfigSlashCommandItems(typed, configState)) {
				completionItems.push({
					insertText: item.insertText,
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

		const getSortText = (item: CompletionItem): string => {
			return getCompletionAction(item.attachment._meta) ? item.attachment.label : item.insertText;
		};
		return completionItems.sort((a, b) => getSortText(a).localeCompare(getSortText(b)));
	}
}

function mergePluginCommandChoices(runtimeChoices: readonly { readonly name: string; readonly description: string }[]): { name: string; description: string }[] {
	const choices = new Map(runtimeChoices.map(choice => [choice.name, { ...choice }]));
	for (const choice of pluginCommandChoices()) {
		choices.set(choice.name, choice);
	}
	return [...choices.values()];
}

function pluginCommandChoices(): { name: string; description: string }[] {
	return [
		{ name: 'list', description: localize('copilotPlugin.completion.list', "List installed plugins") },
		{ name: 'install', description: localize('copilotPlugin.completion.install', "Install a plugin") },
		{ name: 'uninstall', description: localize('copilotPlugin.completion.uninstall', "Uninstall a plugin") },
		{ name: 'update', description: localize('copilotPlugin.completion.update', "Update a plugin") },
		{ name: 'enable', description: localize('copilotPlugin.completion.enable', "Enable a plugin") },
		{ name: 'disable', description: localize('copilotPlugin.completion.disable', "Disable a plugin") },
		{ name: 'marketplace', description: localize('copilotPlugin.completion.marketplace', "Manage plugin marketplaces") },
	];
}

function pluginMarketplaceChoices(): { name: string; description: string }[] {
	return [
		{ name: 'add', description: localize('copilotPlugin.completion.marketplaceAdd', "Add a plugin marketplace") },
		{ name: 'remove', description: localize('copilotPlugin.completion.marketplaceRemove', "Remove a plugin marketplace") },
		{ name: 'list', description: localize('copilotPlugin.completion.marketplaceList', "List plugin marketplaces") },
		{ name: 'browse', description: localize('copilotPlugin.completion.marketplaceBrowse', "Browse a plugin marketplace") },
		{ name: 'update', description: localize('copilotPlugin.completion.marketplaceUpdate', "Update plugin marketplaces") },
	];
}

export type ICopilotRuntimeSlashCommandInfo = RuntimeSlashCommandInfo;

function isSyncedCustomization(container: PluginCustomization): boolean {
	return container.uri.startsWith(SYNCED_CUSTOMIZATION_SCHEME + ':');
}

function getWordRangeAtOffset(text: string, offset: number): { start: number; end: number } | undefined {
	if (offset < 0 || offset > text.length) {
		return undefined;
	}

	let start = offset;
	while (start > 0 && !/\s/.test(text[start - 1])) {
		start--;
	}
	let end = offset;
	while (end < text.length && !/\s/.test(text[end])) {
		end++;
	}
	return { start, end };
}

function extractSlashCommandArgument(text: string, offset: number): { command: string; typed: string; rangeStart: number; rangeEnd: number } | undefined {
	const range = getWordRangeAtOffset(text, offset);
	if (!range) {
		return undefined;
	}
	const match = /^\/(?<command>\S+)\s+$/i.exec(text.slice(0, range.start));
	if (!match?.groups) {
		return undefined;
	}
	return {
		command: match.groups.command,
		typed: text.slice(range.start, offset),
		rangeStart: range.start,
		rangeEnd: range.end,
	};
}
