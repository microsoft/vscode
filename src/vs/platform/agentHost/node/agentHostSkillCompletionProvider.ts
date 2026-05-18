/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { parseFrontMatter } from '../../../base/common/yaml.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { toAgentClientUri } from '../common/agentClientUri.js';
import type { IAgent } from '../common/agentService.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../common/state/protocol/state.js';
import { CustomizationStatus, type CustomizationRef, type SessionCustomization } from '../common/state/sessionState.js';
import { parsePlugin, type INamedPluginResource } from '../../agentPlugins/common/pluginParsers.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider } from './agentHostCompletions.js';
import { extractLeadingSlashToken } from './agentHostSlashCompletion.js';

interface ISkillCustomizationCandidate {
	readonly customization: CustomizationRef;
	readonly enabled: boolean;
	readonly clientId?: string;
	readonly status?: CustomizationStatus;
}

interface ISkillCompletionMetadata {
	readonly uri: URI;
	readonly slashName: string;
	readonly displayName: string;
	readonly description?: string;
}

interface ISkillCacheEntry {
	readonly agentId: string;
	readonly value: Promise<readonly ISkillCompletionMetadata[]>;
}

/**
 * Generic completion provider that contributes slash completions for skills
 * exposed through an agent's global and session-effective customizations.
 */
export class AgentHostSkillCompletionProvider extends Disposable implements IAgentHostCompletionItemProvider {

	readonly kinds: ReadonlySet<CompletionItemKind> = new Set([CompletionItemKind.UserMessage]);
	readonly triggerCharacters = [CompletionTriggerCharacter.Slash] as const;

	private readonly _skillCache = new Map<string, ISkillCacheEntry>();
	private readonly _watchedAgents = new Set<string>();

	constructor(
		private readonly _getAgent: (session: URI | string) => IAgent | undefined,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
		private readonly _userHome: string = getUserHome(),
	) {
		super();
	}

	async provideCompletionItems(params: CompletionsParams, token: CancellationToken): Promise<readonly CompletionItem[]> {
		const leading = extractLeadingSlashToken(params.text, params.offset);
		if (!leading) {
			return [];
		}

		const agent = this._getAgent(params.session);
		if (!agent) {
			return [];
		}
		this._watchAgent(agent);

		const candidates = await this._getCandidates(agent, typeof params.session === 'string' ? URI.parse(params.session) : params.session);
		if (token.isCancellationRequested || candidates.length === 0) {
			return [];
		}

		const reachableCacheKeys = new Set<string>();
		const skillBySlashName = new Map<string, ISkillCompletionMetadata>();
		for (const candidate of candidates) {
			const pluginRoot = this._resolvePluginRoot(candidate);
			const cacheKey = this._cacheKey(agent.id, pluginRoot, candidate.customization.nonce);
			reachableCacheKeys.add(cacheKey);

			const skills = await this._getCachedSkills(agent.id, cacheKey, pluginRoot);
			if (token.isCancellationRequested) {
				return [];
			}
			for (const skill of skills) {
				if (leading.typed.length > 0 && !skill.slashName.startsWith(leading.typed)) {
					continue;
				}
				if (!skillBySlashName.has(skill.slashName)) {
					skillBySlashName.set(skill.slashName, skill);
				}
			}
		}
		this._pruneUnreachableCacheEntries(agent.id, reachableCacheKeys);

		return [...skillBySlashName.values()].map(skill => ({
			insertText: '/' + skill.slashName + ' ',
			rangeStart: leading.rangeStart,
			rangeEnd: leading.rangeEnd,
			attachment: {
				type: MessageAttachmentKind.Simple,
				label: '/' + skill.slashName,
				_meta: {
					uri: skill.uri.toString(),
					name: skill.slashName,
					displayName: skill.displayName,
					...(skill.description !== undefined ? { description: skill.description } : {}),
				},
			},
		}));
	}

	private async _getCandidates(agent: IAgent, session: URI): Promise<readonly ISkillCustomizationCandidate[]> {
		let sessionCustomizations: readonly SessionCustomization[] = [];
		if (agent.getSessionCustomizations) {
			try {
				sessionCustomizations = await agent.getSessionCustomizations(session);
			} catch (error) {
				this._logService.warn(`[AgentHostSkillCompletionProvider] Error reading session customizations for '${session.toString()}': ${toErrorMessage(error)}`);
			}
		}

		const seen = new Set<string>();
		const candidates: ISkillCustomizationCandidate[] = [];
		for (const item of sessionCustomizations) {
			seen.add(item.customization.uri);
			candidates.push({
				customization: item.customization,
				enabled: item.enabled,
				...(item.clientId !== undefined ? { clientId: item.clientId } : {}),
				...(item.status !== undefined ? { status: item.status } : {}),
			});
		}

		const globalCustomizations = agent.getCustomizations?.() ?? [];
		for (const customization of globalCustomizations) {
			if (seen.has(customization.uri)) {
				continue;
			}
			candidates.push({ customization, enabled: true });
		}

		return candidates.filter(candidate => candidate.enabled && candidate.status !== CustomizationStatus.Loading && candidate.status !== CustomizationStatus.Error);
	}

	private _watchAgent(agent: IAgent): void {
		if (!agent.onDidCustomizationsChange || this._watchedAgents.has(agent.id)) {
			return;
		}
		this._watchedAgents.add(agent.id);
		this._register(agent.onDidCustomizationsChange(() => this._clearCache(agent.id)));
	}

	private _resolvePluginRoot(candidate: ISkillCustomizationCandidate): URI {
		const uri = URI.parse(candidate.customization.uri);
		return candidate.clientId ? toAgentClientUri(uri, candidate.clientId) : uri;
	}

	private _cacheKey(agentId: string, pluginRoot: URI, nonce: string | undefined): string {
		return nonce ? `${agentId}::${pluginRoot.toString()}::${nonce}` : `${agentId}::${pluginRoot.toString()}`;
	}

	private _getCachedSkills(agentId: string, cacheKey: string, pluginRoot: URI): Promise<readonly ISkillCompletionMetadata[]> {
		let entry = this._skillCache.get(cacheKey);
		if (!entry) {
			entry = {
				agentId,
				value: this._readSkills(pluginRoot),
			};
			this._skillCache.set(cacheKey, entry);
		}
		return entry.value;
	}

	private async _readSkills(pluginRoot: URI): Promise<readonly ISkillCompletionMetadata[]> {
		try {
			const plugin = await parsePlugin(pluginRoot, this._fileService, undefined, this._userHome);
			return await Promise.all(plugin.skills.map(skill => this._readSkillMetadata(skill)));
		} catch (error) {
			this._logService.warn(`[AgentHostSkillCompletionProvider] Error parsing customization '${pluginRoot.toString()}': ${toErrorMessage(error)}`);
			return [];
		}
	}

	private async _readSkillMetadata(skill: INamedPluginResource): Promise<ISkillCompletionMetadata> {
		let displayName = skill.name;
		let description: string | undefined;
		try {
			const content = await this._fileService.readFile(skill.uri);
			const frontmatter = parseFrontMatter(content.value.toString());
			displayName = frontmatter?.getStringValue('name')?.trim() || skill.name;
			const parsedDescription = frontmatter?.getStringValue('description')?.trim();
			description = parsedDescription || undefined;
		} catch (error) {
			this._logService.trace(`[AgentHostSkillCompletionProvider] Error reading skill metadata '${skill.uri.toString()}': ${toErrorMessage(error)}`);
		}
		return { uri: skill.uri, slashName: skill.name, displayName, ...(description !== undefined ? { description } : {}) };
	}

	private _clearCache(agentId: string): void {
		for (const [cacheKey, entry] of this._skillCache) {
			if (entry.agentId === agentId) {
				this._skillCache.delete(cacheKey);
			}
		}
	}

	private _pruneUnreachableCacheEntries(agentId: string, reachableCacheKeys: ReadonlySet<string>): void {
		for (const [cacheKey, entry] of this._skillCache) {
			if (entry.agentId === agentId && !reachableCacheKeys.has(cacheKey)) {
				this._skillCache.delete(cacheKey);
			}
		}
	}
}

function getUserHome(): string {
	return process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
}
