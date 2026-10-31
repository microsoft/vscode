/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { getErrorMessage } from '../../../../../../base/common/errors.js';
import type { ILogService } from '../../../../../../platform/log/common/log.js';
import { ICustomizationHarnessService, type AgentFileToolAvailability } from '../../customizationHarnessService.js';
import { Target } from '../promptTypes.js';
import { knownGithubCopilotTools } from './promptFileAttributes.js';
import { resolveMatchingAgentFileHarnesses } from './promptModelResolver.js';

export interface IAgentFileTool {
	readonly name: string;
	readonly description?: string;
	readonly availability: AgentFileToolAvailability;
	readonly harnessId: string;
}

export interface IAgentFileToolCatalogue {
	readonly tools: readonly IAgentFileTool[];
	readonly isResolved: boolean;
}

export async function resolveAgentFileTools(target: Target, harnessService: ICustomizationHarnessService, logService: ILogService, token: CancellationToken): Promise<IAgentFileToolCatalogue> {
	const descriptors = resolveMatchingAgentFileHarnesses(target, harnessService);
	const inventories = await Promise.all(descriptors.map(async descriptor => {
		const itemProvider = descriptor.itemProvider;
		if (!itemProvider?.provideAgentFileTools) {
			return undefined;
		}
		try {
			return await itemProvider.provideAgentFileTools(harnessService.getSessionResourceForHarness(descriptor.id), token);
		} catch (error) {
			logService.warn(`[AgentFileTools] Failed to resolve tools for harness '${descriptor.id}': ${getErrorMessage(error)}`);
			return undefined;
		}
	}));
	const tools: IAgentFileTool[] = [
		...knownGithubCopilotTools.map(tool => ({ ...tool, availability: 'available' as const, harnessId: 'github-copilot' })),
		{ name: '*', availability: 'available', harnessId: 'github-copilot' },
	];
	tools.push(...inventories.flatMap((inventory, index) => inventory?.map(tool => ({
		...tool,
		harnessId: descriptors[index].id,
	})) ?? []));
	return {
		tools,
		isResolved: descriptors.length > 0 && inventories.every(inventory => inventory !== undefined),
	};
}

export function resolveAgentFileToolIdentifiers(name: string, tools: readonly IAgentFileTool[]): readonly IAgentFileTool[] {
	return tools.filter(tool => tool.name === name);
}

export function getEffectiveAgentFileToolAvailability(tools: readonly IAgentFileTool[]): AgentFileToolAvailability | undefined {
	if (tools.some(tool => tool.availability === 'available')) {
		return 'available';
	}
	if (tools.some(tool => tool.availability === 'unavailable')) {
		return 'unavailable';
	}
	return tools.some(tool => tool.availability === 'disabled') ? 'disabled' : undefined;
}
