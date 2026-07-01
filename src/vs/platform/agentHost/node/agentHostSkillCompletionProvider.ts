/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../common/agentHostFileSystemService.js';
import type { IAgent } from '../common/agentService.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../common/state/protocol/state.js';
import { toSkillCompletionAttachmentMeta } from '../common/meta/agentCompletionAttachmentMeta.js';
import { CustomizationType, DirectoryCustomization, PluginCustomization, SkillCustomization } from '../common/state/sessionState.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider } from './agentHostCompletions.js';
import { extractWhitespaceDelimitedSlashToken } from './agentHostSlashCompletion.js';


/**
 * Generic completion provider that contributes slash completions for skills
 * exposed through an agent's global and session-effective customizations.
 */
export class AgentHostSkillCompletionProvider extends Disposable implements IAgentHostCompletionItemProvider {

	readonly kinds: ReadonlySet<CompletionItemKind> = new Set([CompletionItemKind.UserMessage]);
	readonly triggerCharacters = [CompletionTriggerCharacter.Slash] as const;

	constructor(
		private readonly _getAgent: (session: URI | string) => IAgent | undefined,
	) {
		super();
	}

	async provideCompletionItems(params: CompletionsParams, token: CancellationToken): Promise<readonly CompletionItem[]> {
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
		const skillsSeen = new Set<string>();
		return candidates
			.filter(skill => {
				const uri = skill.uri;
				if ((!typed.length || skill.slashCommandName.startsWith(typed)) && !skillsSeen.has(uri)) {
					skillsSeen.add(uri);
					return true;
				}
				return false;
			})
			.map(skill => ({
				insertText: '/' + skill.slashCommandName + ' ',
				rangeStart: leading.rangeStart,
				rangeEnd: leading.rangeEnd,
				attachment: {
					type: MessageAttachmentKind.Simple,
					label: '/' + skill.slashCommandName,
					_meta: toSkillCompletionAttachmentMeta({
						uri: skill.uri,
						name: skill.name,
						displayName: skill.slashCommandName,
						description: skill.description,
					}),
				},
			}));
	}

	private async _getCandidates(agent: IAgent, session: URI): Promise<readonly SlashCommmandCandidate[]> {
		if (!agent.getSessionCustomizations) {
			return [];
		}
		const customizations = await agent.getSessionCustomizations(session);
		const result: SlashCommmandCandidate[] = [];
		for (const c of customizations) {
			if (c.type === CustomizationType.McpServer || !c.enabled || !c.children) {
				continue;
			}
			for (const child of c.children) {
				if (child.type === CustomizationType.Skill) {
					result.push(this._toSlashCommandCandidate(c, child));
				}
			}
		}
		return result;
	}

	private _toSlashCommandCandidate(container: PluginCustomization | DirectoryCustomization, skill: SkillCustomization): SlashCommmandCandidate {
		// see getCanonicalPluginCommandId
		let slashCommandName = skill.name;
		if (container.type === CustomizationType.Plugin && !isSyncedCustomization(container) && skill.name !== container.name) {
			slashCommandName = `${container.name}:${skill.name}`;
		}
		return {
			slashCommandName: slashCommandName,
			name: skill.name,
			description: skill.description,
			uri: skill.uri,
		};
	}
}

function isSyncedCustomization(container: PluginCustomization): boolean {
	return container.uri.startsWith(SYNCED_CUSTOMIZATION_SCHEME + ':');
}

interface SlashCommmandCandidate {
	readonly slashCommandName: string;
	readonly name: string;
	readonly description: string | undefined;
	readonly uri: string;
}
