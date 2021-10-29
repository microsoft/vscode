/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IRemoteTerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { BaseTerminalProfileResolverService } from 'vs/workbench/contrib/terminal/browser/terminalProfileResolverService';
import { ILocalTerminalService, ITerminalProfileService } from 'vs/workbench/contrib/terminal/common/terminal';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

export class ElectronTerminalProfileResolverService extends BaseTerminalProfileResolverService {

	constructor(
		@IConfigurationResolverService configurationResolverService: IConfigurationResolverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHistoryService historyService: IHistoryService,
		@ILogService logService: ILogService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@ILocalTerminalService localTerminalService: ILocalTerminalService,
		@IRemoteTerminalService remoteTerminalService: IRemoteTerminalService,
		@ITerminalProfileService terminalProfileService: ITerminalProfileService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService
	) {
		super(
			{
				getDefaultSystemShell: async (remoteAuthority, platform) => {
					const service = remoteAuthority ? remoteTerminalService : localTerminalService;
					return service.getDefaultSystemShell(platform);
				},
				getEnvironment: (remoteAuthority) => {
					if (remoteAuthority) {
						return remoteTerminalService.getEnvironment();
					} else {
						return localTerminalService.getEnvironment();
					}
				}
			},
			configurationService,
			configurationResolverService,
			historyService,
			logService,
			terminalProfileService,
			workspaceContextService,
			remoteAgentService,
			storageService,
			notificationService
		);
	}
}
