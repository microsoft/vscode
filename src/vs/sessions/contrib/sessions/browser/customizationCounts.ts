/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isEqualOrParent } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { IAICustomizationWorkspaceService, applyStorageSourceFilter, IStorageSourceFilter } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';

export interface ISourceCounts {
	readonly workspace: number;
	readonly user: number;
	readonly extension: number;
}

const storageToCountKey: Partial<Record<PromptsStorage, keyof ISourceCounts>> = {
	[PromptsStorage.local]: 'workspace',
	[PromptsStorage.user]: 'user',
	[PromptsStorage.extension]: 'extension',
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
 * Gets source counts for a prompt type, using the SAME data sources as
 * loadItems() in the list widget to avoid count mismatches.
 */
export async function getSourceCounts(
	promptsService: IPromptsService,
	promptType: PromptsType,
	filter: IStorageSourceFilter,
	workspaceContextService: IWorkspaceContextService,
	workspaceService: IAICustomizationWorkspaceService,
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
			if (c.promptPath.type === PromptsType.skill) {
				continue;
			}
			items.push({ storage: c.promptPath.storage, uri: c.promptPath.uri });
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
	};
}

export async function getCustomizationTotalCount(
	promptsService: IPromptsService,
	mcpService: IMcpService,
	workspaceService: IAICustomizationWorkspaceService,
	workspaceContextService: IWorkspaceContextService,
): Promise<number> {
	const types: PromptsType[] = [PromptsType.agent, PromptsType.skill, PromptsType.instructions, PromptsType.prompt, PromptsType.hook];
	const results = await Promise.all(types.map(type => {
		const filter = workspaceService.getStorageSourceFilter(type);
		return getSourceCounts(promptsService, type, filter, workspaceContextService, workspaceService)
			.then(counts => getSourceCountsTotal(counts, filter));
	}));
	return results.reduce((sum, n) => sum + n, 0) + mcpService.servers.get().length;
}
