/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceSet } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../files/common/files.js';
import { ILogService } from '../../../../log/common/log.js';
import { CustomizationType } from '../../../common/state/protocol/channels-session/state.js';
import type { IParsedAgent, IParsedSkill } from '../../../../agentPlugins/common/pluginParsers.js';
import { scanClaudeCustomizationScope, scanClaudeDiskCustomizations } from './scan/claudeAgentSkillScan.js';
import { scanClaudeNativePlugins, scanClaudeNativePluginsForRoots, type IResolvedNativePlugin } from './scan/claudeNativePluginScan.js';
import { selectFirstClaudeCustomizationByKey } from './claudeCustomizationPolicy.js';

export interface IClaudeMultiRootCustomizations {
	readonly workingDirectories: readonly URI[];
	readonly discovered: readonly (IParsedAgent | IParsedSkill)[];
	readonly nativePlugins: readonly IResolvedNativePlugin[];
}

export function distinctClaudeWorkingDirectories(workingDirectories: readonly URI[] | undefined): readonly URI[] {
	const seen = new ResourceSet();
	const result: URI[] = [];
	for (const directory of workingDirectories ?? []) {
		if (!seen.has(directory)) {
			seen.add(directory);
			result.push(directory);
		}
	}
	return result;
}

function isParsedAgent(item: IParsedAgent | IParsedSkill): item is IParsedAgent {
	return item.customization.type === CustomizationType.Agent;
}

function isParsedSkill(item: IParsedAgent | IParsedSkill): item is IParsedSkill {
	return item.customization.type === CustomizationType.Skill;
}

export async function discoverClaudeMultiRootCustomizations(
	workingDirectories: readonly URI[] | undefined,
	userHome: URI,
	fileService: IFileService,
	logService: ILogService,
): Promise<IClaudeMultiRootCustomizations> {
	const roots = distinctClaudeWorkingDirectories(workingDirectories);
	if (roots.length <= 1) {
		const [discovered, nativePlugins] = await Promise.all([
			scanClaudeDiskCustomizations(roots[0], userHome, fileService),
			scanClaudeNativePlugins(roots[0], userHome, fileService, logService),
		]);
		return { workingDirectories: roots, discovered, nativePlugins };
	}
	const [rootScopes, userScope, nativePlugins] = await Promise.all([
		Promise.all(roots.map((root, index) => scanClaudeCustomizationScope(root, fileService, index === 0))),
		scanClaudeCustomizationScope(userHome, fileService),
		scanClaudeNativePluginsForRoots(roots, userHome, fileService, logService),
	]);
	const scopes = [...rootScopes, userScope];
	// User-scope overrides are expected precedence; only warn on cross-workspace-folder collisions.
	const userScopeItems = new Set<IParsedAgent | IParsedSkill>(userScope);
	const logShadowedAcrossRoots = (kind: string) => (shadowed: IParsedAgent | IParsedSkill, winner: IParsedAgent | IParsedSkill): void => {
		if (userScopeItems.has(shadowed)) {
			return;
		}
		logService.warn(`[claudeMultiRootCustomizationDiscovery] ${kind} '${shadowed.name}' at '${shadowed.uri.toString()}' is shadowed by '${winner.uri.toString()}' from another workspace folder and is unreachable by name`);
	};
	const discovered = [
		...selectFirstClaudeCustomizationByKey(scopes.map(items => items.filter(isParsedAgent)), item => item.name, logShadowedAcrossRoots('agent')),
		...selectFirstClaudeCustomizationByKey(scopes.map(items => items.filter(isParsedSkill)), item => item.name, logShadowedAcrossRoots('skill')),
	];
	return {
		workingDirectories: roots,
		discovered,
		nativePlugins,
	};
}
