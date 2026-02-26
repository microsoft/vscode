/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
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

export async function getPromptSourceCounts(promptsService: IPromptsService, promptType: PromptsType, filter: IStorageSourceFilter): Promise<ISourceCounts> {
	const [workspaceItems, userItems, extensionItems] = await Promise.all([
		promptsService.listPromptFilesForStorage(promptType, PromptsStorage.local, CancellationToken.None),
		promptsService.listPromptFilesForStorage(promptType, PromptsStorage.user, CancellationToken.None),
		promptsService.listPromptFilesForStorage(promptType, PromptsStorage.extension, CancellationToken.None),
	]);
	const filteredUserItems = applyStorageSourceFilter(userItems, filter);
	return {
		workspace: workspaceItems.length,
		user: filteredUserItems.length,
		extension: extensionItems.length,
	};
}

export async function getSkillSourceCounts(promptsService: IPromptsService, filter: IStorageSourceFilter): Promise<ISourceCounts> {
	const skills = await promptsService.findAgentSkills(CancellationToken.None);
	if (!skills || skills.length === 0) {
		return { workspace: 0, user: 0, extension: 0 };
	}
	const filteredSkills = applyStorageSourceFilter(skills, filter);
	return {
		workspace: filteredSkills.filter(s => s.storage === PromptsStorage.local).length,
		user: filteredSkills.filter(s => s.storage === PromptsStorage.user).length,
		extension: filteredSkills.filter(s => s.storage === PromptsStorage.extension).length,
	};
}

export async function getCustomizationTotalCount(promptsService: IPromptsService, mcpService: IMcpService, workspaceService: IAICustomizationWorkspaceService): Promise<number> {
	const agentFilter = workspaceService.getStorageSourceFilter(PromptsType.agent);
	const skillFilter = workspaceService.getStorageSourceFilter(PromptsType.skill);
	const instructionFilter = workspaceService.getStorageSourceFilter(PromptsType.instructions);
	const promptFilter = workspaceService.getStorageSourceFilter(PromptsType.prompt);
	const hookFilter = workspaceService.getStorageSourceFilter(PromptsType.hook);

	const [agentCounts, skillCounts, instructionCounts, promptCounts, hookCounts] = await Promise.all([
		getPromptSourceCounts(promptsService, PromptsType.agent, agentFilter),
		getSkillSourceCounts(promptsService, skillFilter),
		getPromptSourceCounts(promptsService, PromptsType.instructions, instructionFilter),
		getPromptSourceCounts(promptsService, PromptsType.prompt, promptFilter),
		getPromptSourceCounts(promptsService, PromptsType.hook, hookFilter),
	]);

	return getSourceCountsTotal(agentCounts, agentFilter)
		+ getSourceCountsTotal(skillCounts, skillFilter)
		+ getSourceCountsTotal(instructionCounts, instructionFilter)
		+ getSourceCountsTotal(promptCounts, promptFilter)
		+ getSourceCountsTotal(hookCounts, hookFilter)
		+ mcpService.servers.get().length;
}
