/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isEqualOrParent } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { BUILTIN_STORAGE } from '../../chat/common/builtinPromptsStorage.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { IAICustomizationWorkspaceService, applyStorageSourceFilter, IStorageSourceFilter } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { parseHooksFromFile } from '../../../../workbench/contrib/chat/common/promptSyntax/hookCompatibility.js';
import { IAgentPluginService } from '../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { ICustomizationHarnessService, ICustomizationItem, ICustomizationItemProvider, ICustomizationSyncProvider } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { parse as parseJSONC } from '../../../../base/common/jsonc.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export interface ISourceCounts {
	readonly workspace: number;
	readonly user: number;
	readonly extension: number;
	readonly builtin: number;
}

const storageToCountKey: Partial<Record<string, keyof ISourceCounts>> = {
	[PromptsStorage.local]: 'workspace',
	[PromptsStorage.user]: 'user',
	[PromptsStorage.extension]: 'extension',
	[BUILTIN_STORAGE]: 'builtin',
};

export function getSourceCountsTotal(counts: ISourceCounts, filter: IStorageSourceFilter): number {
	let total = 0;
	for (const storage of filter.sources) {
		const key = storageToCountKey[storage];
		if (key) {
			total += counts[key];
		}
	}
	return total;
}

/**
 * Counts individual hook entries in a single hook file.
 * Falls back to 1 when the file can't be parsed.
 */
async function countHooksInFile(uri: URI, activeRoot: URI | undefined, fileService: IFileService): Promise<number> {
	try {
		const content = await fileService.readFile(uri);
		const json = parseJSONC(content.value.toString());
		const { hooks } = parseHooksFromFile(uri, json, activeRoot, '');
		if (hooks.size > 0) {
			let count = 0;
			for (const [, entry] of hooks) {
				count += entry.hooks.length;
			}
			return count;
		}
	} catch {
		// Parse failed — count as single file
	}
	return 1;
}

/**
 * Gets source counts for a prompt type, using the SAME data sources as
 * loadItems() in the list widget to avoid count mismatches.
 */
export async function getSourceCounts(
	promptsService: IPromptsService,
	promptType: PromptsType,
	filter: IStorageSourceFilter,
	workspaceContextService: IWorkspaceContextService,
	workspaceService: IAICustomizationWorkspaceService,
	fileService?: IFileService,
): Promise<ISourceCounts> {
	const items: { storage: PromptsStorage; uri: URI }[] = [];

	if (promptType === PromptsType.agent) {
		// Must match loadItems: uses getCustomAgents()
		const agents = await promptsService.getCustomAgents(CancellationToken.None);
		for (const a of agents) {
			items.push({ storage: a.source.storage, uri: a.uri });
		}
	} else if (promptType === PromptsType.skill) {
		// Must match loadItems: uses findAgentSkills()
		const skills = await promptsService.findAgentSkills(CancellationToken.None);
		for (const s of skills ?? []) {
			items.push({ storage: s.storage, uri: s.uri });
		}
	} else if (promptType === PromptsType.prompt) {
		// Must match loadItems: uses getPromptSlashCommands() filtering out skills
		const commands = await promptsService.getPromptSlashCommands(CancellationToken.None);
		for (const c of commands) {
			if (c.type === PromptsType.skill) {
				continue;
			}
			items.push({ storage: c.storage, uri: c.uri });
		}
	} else if (promptType === PromptsType.instructions) {
		// Must match loadItems: uses listPromptFiles + listAgentInstructions
		const promptFiles = await promptsService.listPromptFiles(promptType, CancellationToken.None);
		for (const f of promptFiles) {
			items.push({ storage: f.storage, uri: f.uri });
		}
		const agentInstructions = await promptsService.listAgentInstructions(CancellationToken.None, undefined);
		const workspaceFolderUris = workspaceContextService.getWorkspace().folders.map(f => f.uri);
		const activeRoot = workspaceService.getActiveProjectRoot();
		if (activeRoot) {
			workspaceFolderUris.push(activeRoot);
		}
		for (const file of agentInstructions) {
			const isWorkspaceFile = workspaceFolderUris.some(root => isEqualOrParent(file.uri, root));
			items.push({
				storage: isWorkspaceFile ? PromptsStorage.local : PromptsStorage.user,
				uri: file.uri,
			});
		}
	} else if (promptType === PromptsType.hook && fileService) {
		// Must match loadItems: parse individual hooks from each file
		const hookFiles = await promptsService.listPromptFiles(PromptsType.hook, CancellationToken.None);
		const activeRoot = workspaceService.getActiveProjectRoot();
		for (const hookFile of hookFiles) {
			const hookCount = await countHooksInFile(hookFile.uri, activeRoot, fileService);
			for (let i = 0; i < hookCount; i++) {
				items.push({ storage: hookFile.storage, uri: hookFile.uri });
			}
		}
	} else {
		// hooks and anything else: uses listPromptFiles
		const files = await promptsService.listPromptFiles(promptType, CancellationToken.None);
		for (const f of files) {
			items.push({ storage: f.storage, uri: f.uri });
		}
	}

	// Apply the same storage source filter as the list widget
	const filtered = applyStorageSourceFilter(items, filter);
	return {
		workspace: filtered.filter(i => i.storage === PromptsStorage.local).length,
		user: filtered.filter(i => i.storage === PromptsStorage.user).length,
		extension: filtered.filter(i => i.storage === PromptsStorage.extension).length,
		builtin: filtered.filter(i => i.storage === BUILTIN_STORAGE).length,
	};
}

const PROMPT_TYPES: PromptsType[] = [PromptsType.agent, PromptsType.skill, PromptsType.instructions, PromptsType.hook];

// #region Provider item counting

/**
 * Caches provider results for the duration of a microtask so multiple
 * count widgets refreshing simultaneously share a single provider call.
 */
const _providerResultCache = new WeakMap<ICustomizationItemProvider, Promise<ICustomizationItem[] | undefined>>();

function getCachedProviderItems(provider: ICustomizationItemProvider): ReturnType<ICustomizationItemProvider['provideChatSessionCustomizations']> {
	const cached = _providerResultCache.get(provider);
	if (cached) {
		return cached;
	}
	const result = provider.provideChatSessionCustomizations(CancellationToken.None);
	_providerResultCache.set(provider, result);
	queueMicrotask(() => _providerResultCache.delete(provider));
	return result;
}

async function getProviderItemCount(
	provider: ICustomizationItemProvider,
	promptType: PromptsType,
	workspaceService: IAICustomizationWorkspaceService,
	fileService?: IFileService,
): Promise<number> {
	const allItems = await getCachedProviderItems(provider);
	if (!allItems) {
		return 0;
	}

	if (promptType === PromptsType.hook && fileService) {
		const hookItems = allItems.filter(item => item.type === PromptsType.hook);
		const activeRoot = workspaceService.getActiveProjectRoot();
		const counts = await Promise.all(hookItems.map(item =>
			item.storage === PromptsStorage.plugin
				? 1
				: countHooksInFile(item.uri, activeRoot, fileService)
		));
		return counts.reduce((sum, n) => sum + n, 0);
	}

	return allItems.filter(item => item.type === promptType).length;
}

async function getLocalSyncableCount(
	promptsService: IPromptsService,
	promptType: PromptsType,
): Promise<number> {
	const files = await promptsService.listPromptFiles(promptType, CancellationToken.None);
	return files.filter(f => f.storage === PromptsStorage.local || f.storage === PromptsStorage.user).length;
}

// #endregion

/**
 * Unified per-type count that handles both provider-backed and local-only
 * harnesses, blending syncable local items when a sync provider is present.
 */
export async function getItemCount(
	promptType: PromptsType,
	promptsService: IPromptsService,
	workspaceService: IAICustomizationWorkspaceService,
	workspaceContextService: IWorkspaceContextService,
	itemProvider?: ICustomizationItemProvider,
	syncProvider?: ICustomizationSyncProvider,
	fileService?: IFileService,
): Promise<number> {
	if (itemProvider) {
		if (syncProvider) {
			const [providerCount, localCount] = await Promise.all([
				getProviderItemCount(itemProvider, promptType, workspaceService, fileService),
				getLocalSyncableCount(promptsService, promptType),
			]);
			return providerCount + localCount;
		}
		return getProviderItemCount(itemProvider, promptType, workspaceService, fileService);
	}
	const filter = workspaceService.getStorageSourceFilter(promptType);
	const counts = await getSourceCounts(promptsService, promptType, filter, workspaceContextService, workspaceService, fileService);
	return getSourceCountsTotal(counts, filter);
}

export async function getCustomizationTotalCount(
	promptsService: IPromptsService,
	mcpService: IMcpService,
	workspaceService: IAICustomizationWorkspaceService,
	workspaceContextService: IWorkspaceContextService,
	agentPluginService?: IAgentPluginService,
	itemProvider?: ICustomizationItemProvider,
	syncProvider?: ICustomizationSyncProvider,
	fileService?: IFileService,
): Promise<number> {
	const results = await Promise.all(PROMPT_TYPES.map(type =>
		getItemCount(type, promptsService, workspaceService, workspaceContextService, itemProvider, syncProvider, fileService)
	));
	const promptTotal = results.reduce((sum, n) => sum + n, 0);
	const pluginCount = agentPluginService?.plugins.get().length ?? 0;
	return promptTotal + mcpService.servers.get().length + pluginCount;
}

export function getActiveHarnessProviders(
	sessionsManagementService: ISessionsManagementService,
	harnessService: ICustomizationHarnessService,
): { itemProvider?: ICustomizationItemProvider; syncProvider?: ICustomizationSyncProvider } {
	const sessionType = sessionsManagementService.activeSession.get()?.sessionType;
	if (sessionType) {
		const harness = harnessService.findHarnessById(sessionType);
		if (harness) {
			return { itemProvider: harness.itemProvider, syncProvider: harness.syncProvider };
		}
	}
	return {};
}
