/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-sandbox/environmentService';
import { IPathService, AbstractPathService } from '../common/pathService';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace';

export class NativePathService extends AbstractPathService {

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(environmentService.userHome, remoteAgentService, environmentService, contextService);
	}
}

registerSingleton(IPathService, NativePathService, InstantiationType.Delayed);
