/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemotePathService, AbstractRemotePathService } from 'vs/workbench/services/path/common/remotePathService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export class BrowserRemotePathService extends AbstractRemotePathService {

	private static fallbackUserHome(historyService: IHistoryService, environmentService: IWorkbenchEnvironmentService): URI {
		return historyService.getLastActiveWorkspaceRoot() || URI.from({ scheme: Schemas.vscodeRemote, authority: environmentService.configuration.remoteAuthority, path: '/' });
	}

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IHistoryService historyService: IHistoryService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		super(() => BrowserRemotePathService.fallbackUserHome(historyService, environmentService), remoteAgentService);
	}
}

registerSingleton(IRemotePathService, BrowserRemotePathService, true);
