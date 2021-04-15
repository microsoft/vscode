/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { env } from 'vs/base/common/process';
import { withNullAsUndefined } from 'vs/base/common/types';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IRemoteTerminalService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { BaseTerminalProfileResolverService } from 'vs/workbench/contrib/terminal/common/terminalProfileResolverService';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IHistoryService } from 'vs/workbench/services/history/common/history';

export class BrowserTerminalProfileResolverService extends BaseTerminalProfileResolverService {

	constructor(
		@IConfigurationResolverService configurationResolverService: IConfigurationResolverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHistoryService historyService: IHistoryService,
		@ILogService logService: ILogService,
		@ITerminalService terminalService: ITerminalService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IRemoteTerminalService remoteTerminalService: IRemoteTerminalService
	) {
		super(
			{
				getAvailableProfiles: () => terminalService.getAvailableProfiles(),
				// TODO: How to get the system shell?
				getDefaultSystemShell: async () => remoteTerminalService.getDefaultSystemShell(),
				// TODO: Get the actual shell environment from the server
				getShellEnvironment: async () => env,
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
