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
	const [scopes, nativePlugins] = await Promise.all([
		Promise.all([
			...roots.map((root, index) => scanClaudeCustomizationScope(root, fileService, index === 0)),
			scanClaudeCustomizationScope(userHome, fileService),
		]),
		scanClaudeNativePluginsForRoots(roots, userHome, fileService, logService),
	]);
	const discovered = [
		...selectFirstClaudeCustomizationByKey(scopes.map(items => items.filter(isParsedAgent)), item => item.name),
		...selectFirstClaudeCustomizationByKey(scopes.map(items => items.filter(isParsedSkill)), item => item.name),
	];
	return {
		workingDirectories: roots,
		discovered,
		nativePlugins,
	};
}
