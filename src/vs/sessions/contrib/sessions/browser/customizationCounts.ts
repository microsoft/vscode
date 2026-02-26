/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqualOrParent } from '../../../../base/common/resources.js';
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

export function getSourceCountsTotal(counts: ISourceCounts, workspaceService: IAICustomizationWorkspaceService, type: PromptsType): number {
	let total = 0;
	for (const storage of workspaceService.getVisibleStorageSources(type)) {
		const key = storageToCountKey[storage];
		if (key) {
			total += counts[key];
		}
	}
	return total;
}

/**
 * Returns true if the URI should be excluded based on excluded user file roots.
 */
function isExcludedUserFile(uri: URI, excludedRoots: readonly URI[]): boolean {
	return excludedRoots.some(root => isEqualOrParent(uri, root));
}

export async function getPromptSourceCounts(promptsService: IPromptsService, promptType: PromptsType, excludedUserFileRoots: readonly URI[] = []): Promise<ISourceCounts> {
	const [workspaceItems, userItems, extensionItems] = await Promise.all([
		promptsService.listPromptFilesForStorage(promptType, PromptsStorage.local, CancellationToken.None),
		promptsService.listPromptFilesForStorage(promptType, PromptsStorage.user, CancellationToken.None),
		promptsService.listPromptFilesForStorage(promptType, PromptsStorage.extension, CancellationToken.None),
	]);
	const filteredUserItems = excludedUserFileRoots.length > 0
		? userItems.filter(item => !isExcludedUserFile(item.uri, excludedUserFileRoots))
		: userItems;
	return {
		workspace: workspaceItems.length,
		user: filteredUserItems.length,
		extension: extensionItems.length,
	};
}

export async function getSkillSourceCounts(promptsService: IPromptsService, excludedUserFileRoots: readonly URI[] = []): Promise<ISourceCounts> {
	const skills = await promptsService.findAgentSkills(CancellationToken.None);
	if (!skills || skills.length === 0) {
		return { workspace: 0, user: 0, extension: 0 };
	}
	const userSkills = skills.filter(s => s.storage === PromptsStorage.user);
	const filteredUserSkills = excludedUserFileRoots.length > 0
		? userSkills.filter(s => !isExcludedUserFile(s.uri, excludedUserFileRoots))
		: userSkills;
	return {
		workspace: skills.filter(s => s.storage === PromptsStorage.local).length,
		user: filteredUserSkills.length,
		extension: skills.filter(s => s.storage === PromptsStorage.extension).length,
	};
}

export async function getCustomizationTotalCount(promptsService: IPromptsService, mcpService: IMcpService, workspaceService: IAICustomizationWorkspaceService): Promise<number> {
	const excluded = workspaceService.excludedUserFileRoots;
	const [agentCounts, skillCounts, instructionCounts, promptCounts, hookCounts] = await Promise.all([
		getPromptSourceCounts(promptsService, PromptsType.agent, excluded),
		getSkillSourceCounts(promptsService, excluded),
		getPromptSourceCounts(promptsService, PromptsType.instructions, excluded),
		getPromptSourceCounts(promptsService, PromptsType.prompt, excluded),
		getPromptSourceCounts(promptsService, PromptsType.hook, excluded),
	]);

	return getSourceCountsTotal(agentCounts, workspaceService, PromptsType.agent)
		+ getSourceCountsTotal(skillCounts, workspaceService, PromptsType.skill)
		+ getSourceCountsTotal(instructionCounts, workspaceService, PromptsType.instructions)
		+ getSourceCountsTotal(promptCounts, workspaceService, PromptsType.prompt)
		+ getSourceCountsTotal(hookCounts, workspaceService, PromptsType.hook)
		+ mcpService.servers.get().length;
}
