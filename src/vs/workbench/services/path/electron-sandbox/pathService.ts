/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IPathService, AbstractPathService } from 'vs/workbench/services/path/common/pathService';
import { Schemas } from 'vs/base/common/network';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { getVirtualWorkspaceScheme } from 'vs/platform/remote/common/remoteHosts';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export class NativePathService extends AbstractPathService {

	readonly defaultUriScheme = defaultUriScheme(this.environmentService, this.contextService);

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
	) {
		super(environmentService.userHome, remoteAgentService);
	}
}

function defaultUriScheme(environmentService: IWorkbenchEnvironmentService, contextService: IWorkspaceContextService): string {
	if (environmentService.remoteAuthority) {
		return Schemas.vscodeRemote;
	}

	const virtualWorkspace = getVirtualWorkspaceScheme(contextService.getWorkspace());
	if (virtualWorkspace) {
		return virtualWorkspace;
	}

	return Schemas.file;
}


registerSingleton(IPathService, NativePathService, true);
