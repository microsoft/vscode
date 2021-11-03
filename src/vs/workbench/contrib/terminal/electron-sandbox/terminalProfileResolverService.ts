/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IRemoteTerminalService, ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { BaseTerminalProfileResolverService } from 'vs/workbench/contrib/terminal/browser/terminalProfileResolverService';
import { ITerminalProfileService } from 'vs/workbench/contrib/terminal/common/terminal';
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
		@IRemoteTerminalService remoteTerminalService: IRemoteTerminalService,
		@ITerminalProfileService terminalProfileService: ITerminalProfileService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@ITerminalInstanceService terminalInstanceService: ITerminalInstanceService
	) {
		super(
			{
				getDefaultSystemShell: async (remoteAuthority, platform) => {
					const backend = remoteAuthority ? remoteTerminalService : (terminalInstanceService.getBackend() || remoteTerminalService);
					return backend.getDefaultSystemShell(platform);
				},
				getEnvironment: (remoteAuthority) => {
					if (!remoteAuthority) {
						const localBackend = terminalInstanceService.getBackend();
						if (localBackend) {
							return localBackend.getEnvironment();
						}
					}
					return remoteTerminalService.getEnvironment();
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
