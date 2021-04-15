/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { withNullAsUndefined } from 'vs/base/common/types';
import { getSystemShell } from 'vs/base/node/shell';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { BaseTerminalProfileResolverService, ITerminalProfileResolverService } from 'vs/workbench/contrib/terminal/common/terminalProfileResolverService';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IShellEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/shellEnvironmentService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';

export class ElectronTerminalProfileResolverService
	extends BaseTerminalProfileResolverService
	implements ITerminalProfileResolverService {

	constructor(
		@IConfigurationResolverService configurationResolverService: IConfigurationResolverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHistoryService historyService: IHistoryService,
		@ILogService logService: ILogService,
		@IShellEnvironmentService shellEnvironmentService: IShellEnvironmentService,
		@ITerminalService terminalService: ITerminalService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService
	) {
		super(
			{
				getAvailableProfiles: () => terminalService.getAvailableProfiles(),
				getDefaultSystemShell: async (platform) => getSystemShell(platform, await shellEnvironmentService.getShellEnv()),
				getShellEnvironment: () => shellEnvironmentService.getShellEnv(),
				getLastActiveWorkspace: () => {
					const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot(Schemas.file);
					return activeWorkspaceRootUri ? withNullAsUndefined(workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri)) : undefined;
				}
			},
			configurationService,
			configurationResolverService,
			logService
		);
	}
}
