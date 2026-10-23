/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { getErrorMessage } from '../../../../../../base/common/errors.js';
import { localize } from '../../../../../../nls.js';
import type { ILogService } from '../../../../../../platform/log/common/log.js';
import { AICustomizationSource, AICustomizationSources } from '../../aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../customizationHarnessService.js';
import { PromptsType, Target } from '../promptTypes.js';
import { resolveMatchingAgentFileHarnesses } from './promptModelResolver.js';

export type AgentFileSkillAvailability = 'available' | 'unavailable' | 'disabled';

export interface IAgentFileSkill {
	readonly name: string;
	readonly description?: string;
	readonly availability: AgentFileSkillAvailability;
	readonly statusMessage?: string;
	readonly source: AICustomizationSource;
	readonly harnessId: string;
}

export interface IAgentFileSkillCatalogue {
	readonly skills: readonly IAgentFileSkill[];
	readonly isResolved: boolean;
}

export async function resolveAgentFileSkills(target: Target, harnessService: ICustomizationHarnessService, logService: ILogService, token: CancellationToken): Promise<IAgentFileSkillCatalogue> {
	const descriptors = resolveMatchingAgentFileHarnesses(target, harnessService);
	const inventories = await Promise.all(descriptors.map(async descriptor => {
		const itemProvider = descriptor.itemProvider;
		if (!itemProvider) {
			return undefined;
		}
		try {
			return await itemProvider.provideChatSessionCustomizations(harnessService.getSessionResourceForHarness(descriptor.id), token);
		} catch (error) {
			logService.warn(`[AgentFileSkills] Failed to resolve skills for harness '${descriptor.id}': ${getErrorMessage(error)}`);
			return undefined;
		}
	}));
	const skills = inventories.flatMap((inventory, index) => inventory
		?.filter(item => item.type === PromptsType.skill)
		.map(item => ({
			name: item.name,
			description: item.description,
			availability: getSkillAvailability(item.enabled, item.status),
			statusMessage: item.statusMessage,
			source: item.source,
			harnessId: descriptors[index].id,
		})) ?? []);
	return {
		skills,
		isResolved: descriptors.length > 0 && inventories.every(inventory => inventory !== undefined),
	};
}

export function resolveAgentFileSkillIdentifiers(name: string, skills: readonly IAgentFileSkill[]): readonly IAgentFileSkill[] {
	return skills.filter(skill => skill.name === name);
}

export function getEffectiveAgentFileSkillAvailability(skills: readonly IAgentFileSkill[]): AgentFileSkillAvailability | undefined {
	if (skills.some(skill => skill.availability === 'available')) {
		return 'available';
	}
	if (skills.some(skill => skill.availability === 'unavailable')) {
		return 'unavailable';
	}
	return skills.some(skill => skill.availability === 'disabled') ? 'disabled' : undefined;
}

export function getAgentFileSkillDetails(skills: readonly IAgentFileSkill[]): readonly string[] {
	const details = new Set(skills.map(skill => skill.description).filter((description): description is string => !!description));
	const sources = new Set(skills.map(skill => getSkillSourceLabel(skill.source)));
	if (sources.size > 0) {
		details.add(localize('promptHeader.githubCopilot.skillSources', 'Source: {0}', [...sources].join(', ')));
	}
	for (const statusMessage of skills.map(skill => skill.statusMessage).filter((message): message is string => !!message)) {
		details.add(statusMessage);
	}
	return [...details];
}

function getSkillAvailability(enabled: boolean | undefined, status: 'loading' | 'loaded' | 'degraded' | 'error' | undefined): AgentFileSkillAvailability {
	if (enabled === false) {
		return 'disabled';
	}
	return status === 'loading' || status === 'error' ? 'unavailable' : 'available';
}

function getSkillSourceLabel(source: AICustomizationSource): string {
	switch (source) {
		case AICustomizationSources.local:
			return localize('promptHeader.githubCopilot.skillSource.workspace', 'Workspace');
		case AICustomizationSources.user:
			return localize('promptHeader.githubCopilot.skillSource.user', 'User');
		case AICustomizationSources.extension:
			return localize('promptHeader.githubCopilot.skillSource.extension', 'Extension');
		case AICustomizationSources.plugin:
			return localize('promptHeader.githubCopilot.skillSource.plugin', 'Plugin');
		case AICustomizationSources.builtin:
			return localize('promptHeader.githubCopilot.skillSource.builtin', 'Built-in');
		default:
			return localize('promptHeader.githubCopilot.skillSource.unknown', 'Unknown');
	}
}
