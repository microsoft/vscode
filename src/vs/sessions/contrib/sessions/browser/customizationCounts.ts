/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';

import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';

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

export function getSourceCountsTotal(counts: ISourceCounts, workspaceService: IAICustomizationWorkspaceService): number {
	let total = 0;
	for (const storage of workspaceService.visibleStorageSources) {
		const key = storageToCountKey[storage];
		if (key) {
			total += counts[key];
		}
	}
	return total;
}

export async function getPromptSourceCounts(promptsService: IPromptsService, promptType: PromptsType): Promise<ISourceCounts> {
	const [workspaceItems, userItems, extensionItems] = await Promise.all([
		promptsService.listPromptFilesForStorage(promptType, PromptsStorage.local, CancellationToken.None),
		promptsService.listPromptFilesForStorage(promptType, PromptsStorage.user, CancellationToken.None),
		promptsService.listPromptFilesForStorage(promptType, PromptsStorage.extension, CancellationToken.None),
	]);
	return {
		workspace: workspaceItems.length,
		user: userItems.length,
		extension: extensionItems.length,
	};
}

export async function getSkillSourceCounts(promptsService: IPromptsService): Promise<ISourceCounts> {
	const skills = await promptsService.findAgentSkills(CancellationToken.None);
	if (!skills || skills.length === 0) {
		return { workspace: 0, user: 0, extension: 0 };
	}
	return {
		workspace: skills.filter(s => s.storage === PromptsStorage.local).length,
		user: skills.filter(s => s.storage === PromptsStorage.user).length,
		extension: skills.filter(s => s.storage === PromptsStorage.extension).length,
	};
}

export async function getCustomizationTotalCount(promptsService: IPromptsService, mcpService: IMcpService, workspaceService: IAICustomizationWorkspaceService): Promise<number> {
	const [agentCounts, skillCounts, instructionCounts, promptCounts, hookCounts] = await Promise.all([
		getPromptSourceCounts(promptsService, PromptsType.agent),
		getSkillSourceCounts(promptsService),
		getPromptSourceCounts(promptsService, PromptsType.instructions),
		getPromptSourceCounts(promptsService, PromptsType.prompt),
		getPromptSourceCounts(promptsService, PromptsType.hook),
	]);

	return getSourceCountsTotal(agentCounts, workspaceService)
		+ getSourceCountsTotal(skillCounts, workspaceService)
		+ getSourceCountsTotal(instructionCounts, workspaceService)
		+ getSourceCountsTotal(promptCounts, workspaceService)
		+ getSourceCountsTotal(hookCounts, workspaceService)
		+ mcpService.servers.get().length;
}
