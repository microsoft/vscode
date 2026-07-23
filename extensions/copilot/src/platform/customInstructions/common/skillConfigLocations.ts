/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configurationService';
import { INativeEnvService } from '../../env/common/envService';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { untildify } from '../../../util/vs/base/common/labels';
import { Schemas } from '../../../util/vs/base/common/network';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { isObject } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { SKILLS_LOCATION_KEY } from './promptTypes';

/**
 * Resolves skill directory locations from the `chat.agentSkillsLocations` config setting.
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
	const locationRoot = userHome.scheme === Schemas.file
		? workspaceFolders.find(folder => folder.scheme === Schemas.vscodeRemote) ?? userHome
		: userHome;

	for (const key in locations) {
		const location = key.trim();
		if (locations[key] !== true) {
			continue;
		}

		if (/^~($|\/|\\)/.test(location)) {
			results.push(toLocationUri(URI.file(untildify(location, userHome.path)), locationRoot));
		} else if (isAbsolute(location)) {
			results.push(toLocationUri(URI.file(location), locationRoot));
		} else {
			for (const workspaceFolder of workspaceFolders) {
				results.push(URI.joinPath(workspaceFolder, location));
			}
		}
	}

	return results;
}

function toLocationUri(uri: URI, locationRoot: URI): URI {
	if (locationRoot.scheme === Schemas.file) {
		return uri;
	}

	const path = uri.authority ? `//${uri.authority}${uri.path}` : uri.path;
	return locationRoot.with({ path: path.startsWith('/') ? path : `/${path}` });
}
