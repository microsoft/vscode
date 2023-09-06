/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IPathService, AbstractPathService } from 'vs/workbench/services/path/common/pathService';
import { URI } from 'vs/base/common/uri';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { firstOrDefault } from 'vs/base/common/arrays';
import { dirname } from 'vs/base/common/resources';

export class BrowserPathService extends AbstractPathService {

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(
			guessLocalUserHome(environmentService, contextService),
			remoteAgentService,
			environmentService,
			contextService
		);
	}
}

function guessLocalUserHome(environmentService: IWorkbenchEnvironmentService, contextService: IWorkspaceContextService): URI {

	// In web we do not really have the concept of a "local" user home
	// but we still require it in many places as a fallback. As such,
	// we have to come up with a synthetic location derived from the
	// environment.

	const workspace = contextService.getWorkspace();

	const firstFolder = firstOrDefault(workspace.folders);
	if (firstFolder) {
		return firstFolder.uri;
	}

	if (workspace.configuration) {
		return dirname(workspace.configuration);
	}

	// This is not ideal because with a user home location of `/`, all paths
	// will potentially appear with `~/...`, but at this point we really do
	// not have any other good alternative.

	return URI.from({
		scheme: AbstractPathService.findDefaultUriScheme(environmentService, contextService),
		authority: environmentService.remoteAuthority,
		path: '/'
	});
}

registerSingleton(IPathService, BrowserPathService, InstantiationType.Delayed);
