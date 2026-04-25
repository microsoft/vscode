/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeEnvService } from '../../../../platform/env/common/envService';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { URI } from '../../../../util/vs/base/common/uri';
import { SessionSettingsLocationDescriptor } from '../../common/sessionSettingsService';
import { SessionSettingsService } from '../../common/baseSessionSettingsService';
import { CopilotCLISettings, CopilotCLISettingsLocationType, ICopilotCLISettingsService } from '../common/copilotCLISettingsService';

const COPILOT_CLI_LOCATIONS: readonly SessionSettingsLocationDescriptor<CopilotCLISettingsLocationType>[] = [
	{
		type: CopilotCLISettingsLocationType.User,
		priority: 0,
		getUris: (_workspaceFolders, userHome) => [URI.joinPath(userHome, '.copilot', 'settings.json')],
	},
];

export class CopilotCLISettingsService extends SessionSettingsService<CopilotCLISettingsLocationType, CopilotCLISettings> implements ICopilotCLISettingsService {

	constructor(
		@IWorkspaceService workspaceService: IWorkspaceService,
		@IFileSystemService fileSystemService: IFileSystemService,
		@INativeEnvService envService: INativeEnvService,
	) {
		super(COPILOT_CLI_LOCATIONS, workspaceService, fileSystemService, envService);
	}

	protected getDefaultSettings(): CopilotCLISettings {
		return {};
	}
}
