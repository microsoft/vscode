/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { SKILLS_LOCATION_KEY } from '../../../platform/customInstructions/common/promptTypes';
import { INativeEnvService } from '../../../platform/env/common/envService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { isObject } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';

/**
 * Resolves skill directory locations from the `chat.agentSkillsLocations` config setting.
 * Handles `~/` expansion, absolute paths, and relative paths (joined to each workspace folder).
 */
export function resolveSkillConfigLocations(
	configurationService: IConfigurationService,
	envService: INativeEnvService,
	workspaceService: IWorkspaceService,
): URI[] {
	const results: URI[] = [];
	const locations = configurationService.getNonExtensionConfig<Record<string, boolean>>(SKILLS_LOCATION_KEY);
	if (!isObject(locations)) {
		return results;
	}

	const userHome = envService.userHome;
	const workspaceFolders = workspaceService.getWorkspaceFolders();
	for (const key in locations) {
		const location = key.trim();
		if (locations[key] !== true) {
			continue;
		}
		if (location.startsWith('~/')) {
			results.push(URI.joinPath(userHome, location.substring(2)));
		} else if (isAbsolute(location)) {
			results.push(URI.file(location));
		} else {
			for (const workspaceFolder of workspaceFolders) {
				results.push(URI.joinPath(workspaceFolder, location));
			}
		}
	}

	return results;
}
