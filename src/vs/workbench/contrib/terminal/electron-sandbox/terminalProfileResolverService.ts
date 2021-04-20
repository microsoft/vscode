/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { ILocalTerminalService } from 'vs/platform/terminal/common/terminal';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IRemoteTerminalService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { BaseTerminalProfileResolverService } from 'vs/workbench/contrib/terminal/browser/terminalProfileResolverService';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IShellEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/shellEnvironmentService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';

export class ElectronTerminalProfileResolverService extends BaseTerminalProfileResolverService {

	constructor(
		@IConfigurationResolverService configurationResolverService: IConfigurationResolverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHistoryService historyService: IHistoryService,
		@ILogService logService: ILogService,
		@IShellEnvironmentService shellEnvironmentService: IShellEnvironmentService,
		@ITerminalService terminalService: ITerminalService,
		@ILocalTerminalService localTerminalService: ILocalTerminalService,
		@IRemoteTerminalService remoteTerminalService: IRemoteTerminalService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService
	) {
		super(
			{
				getDefaultSystemShell: async (remoteAuthority, platform) => {
					const service = remoteAuthority ? remoteTerminalService : localTerminalService;
					return service.getDefaultSystemShell(platform);
				},
				getShellEnvironment: (remoteAuthority) => {
					if (remoteAuthority) {
						remoteTerminalService.getShellEnvironment();
					}
					return shellEnvironmentService.getShellEnv();
				}
			},
			configurationService,
			configurationResolverService,
			historyService,
			logService,
			terminalService,
			workspaceContextService
		);
	}
}
