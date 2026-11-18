/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { readMcpServerDisplayName } from '../common/meta/mcpCustomizationMeta.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../common/agentHostCustomizationUri.js';
import type { IAgent, IAgentChatContext } from '../common/agent.js';
import { getSkillCustomizations, isCustomizationEnabled, isSkillEligibleForUserInvocation } from '../common/customizationEnablement.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../common/state/protocol/state.js';
import { readSkillArgumentHint } from '../common/meta/skillCustomizationMeta.js';
import { CustomizationType, PluginCustomization, SkillCustomization, type Customization } from '../common/state/sessionState.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider, type IAgentHostCompletionContext } from './agentHostCompletions.js';
import { readMcpSkillCache } from './shared/mcpSkillCache.js';
import { extractWhitespaceDelimitedSlashToken, matchesSlashCompletion } from './agentHostSlashCompletion.js';


/**
 * Generic completion provider that contributes slash completions for skills
 * exposed through an agent's global and session-effective customizations.
 */
export class AgentHostSkillCompletionProvider extends Disposable implements IAgentHostCompletionItemProvider {

	readonly kinds: ReadonlySet<CompletionItemKind> = new Set([CompletionItemKind.UserMessage]);
	readonly triggerCharacters = [CompletionTriggerCharacter.Slash] as const;

	constructor(
		private readonly _getAgent: (session: URI | string) => IAgent | undefined,
		/** The session's recorded default chat, whose customizations the completions offer, with the host-built context for it. */
		private readonly _getDefaultChat: (session: URI) => Promise<{ readonly chat: URI; readonly context: IAgentChatContext } | undefined>,
		/**
		 * The owning session's last host-published customization snapshot.
		 * Supplied by Agent Host so the provider hands it to
		 * `getChatCustomizations` explicitly instead of the agent reading it
		 * from shared host state. `undefined` when the host has published no
		 * snapshot for the session yet.
		 */
		private readonly _getHostCustomizations: (session: URI | string) => readonly Customization[] | undefined = () => undefined,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) {
		super();
	}

	async provideCompletionItems(params: CompletionsParams, _context: IAgentHostCompletionContext, token: CancellationToken): Promise<readonly CompletionItem[]> {
		const leading = extractWhitespaceDelimitedSlashToken(params.text, params.offset);
		if (!leading) {
			return [];
		}

		const sessionUri = typeof params.channel === 'string' ? URI.parse(params.channel) : params.channel;
		const agent = this._getAgent(sessionUri);
		if (!agent) {
			return [];
		}
		const candidates = await this._getCandidates(agent, sessionUri);
		if (token.isCancellationRequested || candidates.length === 0) {
			return [];
		}

		// `/abc` → typed = 'abc'; empty after just '/' → typed = ''.
		const typed = leading.typed;
		// A skill's synced-bundle copy has a different URI than its on-disk file, so dedupe by name + description, not URI.
		const skillsSeen = new Set<string>();
		return candidates
			.filter(skill => {
				const identity = `${skill.slashCommandName}\0${skill.description ?? ''}`;
				if (matchesSlashCompletion(typed, skill.slashCommandName) && !skillsSeen.has(identity)) {
					skillsSeen.add(identity);
					return true;
				}
				return false;
			})
			.map(skill => ({
				insertText: '/' + skill.slashCommandName + ' ',
				rangeStart: leading.rangeStart,
				rangeEnd: leading.rangeEnd,
				attachment: {
					type: MessageAttachmentKind.Resource,
					uri: skill.uri,
					label: '/' + skill.slashCommandName,
					displayKind: 'skill',
					...(skill.description !== undefined || skill.argumentHint !== undefined ? {
						_meta: {
							...(skill.description !== undefined ? { description: skill.description } : {}),
							...(skill.argumentHint !== undefined ? { argumentHint: skill.argumentHint } : {}),
						},
					} : {}),
				},
			}));
	}

	private async _getCandidates(agent: IAgent, session: URI): Promise<readonly SlashCommmandCandidate[]> {
		const defaultChat = await this._getDefaultChat(session);
		if (!defaultChat) {
			return [];
		}
		const customizations = await agent.getChatCustomizations(defaultChat.chat, defaultChat.context, this._getHostCustomizations(session));
		const result: SlashCommmandCandidate[] = [];
		for (const { skill, container, containerEnabled } of getSkillCustomizations(customizations)) {
			if (containerEnabled && isSkillEligibleForUserInvocation(skill)) {
				result.push(this._toSlashCommandCandidate(container, skill, readSkillArgumentHint(skill)));
			}
		}
		const undiscoveredServers = customizations.flatMap(customization => {
			const containerEnabled = customization.type === CustomizationType.Directory ? customization.enabled : isCustomizationEnabled(customization);
			if (!containerEnabled) {
				return [];
			}
			const servers = customization.type === CustomizationType.McpServer ? [customization]
				: (customization.children ?? []).filter(child => child.type === CustomizationType.McpServer);
			return servers.filter(server => server.children === undefined && isCustomizationEnabled(server));
		});
		if (undiscoveredServers.length) {
			const cached = await readMcpSkillCache(defaultChat.context.resource, this._sessionDataService);
			for (const server of undiscoveredServers) {
				for (const skill of cached.get(server.name) ?? []) {
					if (skill.enabled && skill.userInvocable) {
						result.push(this._toSlashCommandCandidate(server, skill));
					}
				}
			}
		}
		return result;
	}

	private _toSlashCommandCandidate(container: Customization, skill: Pick<SkillCustomization, 'name' | 'description' | 'uri'>, argumentHint?: string): SlashCommmandCandidate {
		// see getCanonicalPluginCommandId
		let slashCommandName = skill.name;
		if (container.type === CustomizationType.Plugin && !isSyncedCustomization(container) && skill.name !== container.name) {
			slashCommandName = `${container.name}:${skill.name}`;
		}
		const isMcpSkill = container.type === CustomizationType.McpServer;
		return {
			slashCommandName: slashCommandName,
			description: isMcpSkill
				? localize('mcpSkillDescription', "{0} (MCP: {1})", skill.description ?? skill.name, readMcpServerDisplayName(container) ?? container.name)
				: skill.description,
			argumentHint,
			uri: skill.uri,
		};
	}
}

function isSyncedCustomization(container: PluginCustomization): boolean {
	return container.uri.startsWith(SYNCED_CUSTOMIZATION_SCHEME + ':');
}

interface SlashCommmandCandidate {
	readonly slashCommandName: string;
	readonly description: string | undefined;
	readonly argumentHint: string | undefined;
	readonly uri: string;
}
