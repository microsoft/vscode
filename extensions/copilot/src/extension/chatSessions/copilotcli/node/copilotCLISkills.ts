/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Uri } from 'vscode';
import { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { SKILLS_LOCATION_KEY } from '../../../../platform/customInstructions/common/promptTypes';
import { INativeEnvService } from '../../../../platform/env/common/envService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../../util/common/services';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { ResourceSet } from '../../../../util/vs/base/common/map';
import { Schemas } from '../../../../util/vs/base/common/network';
import { isAbsolute } from '../../../../util/vs/base/common/path';
import {
	dirname
} from '../../../../util/vs/base/common/resources';
import { isObject } from '../../../../util/vs/base/common/types';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IChatPromptFileService } from '../../common/chatPromptFileService';

export interface ICopilotCLISkills {
	readonly _serviceBrand: undefined;
	getSkillsLocations(): Uri[];
}

export const ICopilotCLISkills = createServiceIdentifier<ICopilotCLISkills>('ICopilotCLISkills');

export class CopilotCLISkills extends Disposable implements ICopilotCLISkills {
	declare _serviceBrand: undefined;
	constructor(
		@ILogService protected readonly logService: ILogService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INativeEnvService private readonly envService: INativeEnvService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IChatPromptFileService private readonly chatPromptFileService: IChatPromptFileService,
	) {
		super();
	}

	public getSkillsLocations(): Uri[] {
		// Get additional skill locations from config
		const configSkillLocationUris = new ResourceSet();
		const locations = this.configurationService.getNonExtensionConfig<Record<string, boolean>>(SKILLS_LOCATION_KEY);
		const userHome = this.envService.userHome;
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		if (isObject(locations)) {
			for (const key in locations) {
				const location = key.trim();
				const value = locations[key];
				if (value !== true) {
					continue;
				}
				// Expand ~/ to user home directory
				if (location.startsWith('~/')) {
					configSkillLocationUris.add(URI.joinPath(userHome, location.substring(2)));
				} else if (isAbsolute(location)) {
					configSkillLocationUris.add(URI.file(location));
				} else {
					// Relative path - join to each workspace folder
					for (const workspaceFolder of workspaceFolders) {
						configSkillLocationUris.add(URI.joinPath(workspaceFolder, location));
					}
				}
			}
		}
		this.chatPromptFileService.skills
			.filter(s => s.uri.scheme === Schemas.file)
			.map(s => s.uri)
			.map(uri => dirname(dirname(uri)))
			.forEach(uri => configSkillLocationUris.add(uri));

		return Array.from(configSkillLocationUris);
	}
}
