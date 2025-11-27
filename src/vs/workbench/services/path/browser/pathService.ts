/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IPathService, AbstractPathService } from '../common/pathService.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { dirname } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { WebFileSystemAccess } from '../../../../platform/files/browser/webFileSystemAccess.js';
import { mainWindow } from '../../../../base/browser/window.js';

export class BrowserPathService extends AbstractPathService {

	// DSpace: Store references to services for use in defaultUriScheme override
	// These are needed because the base class properties are private
	private readonly _environmentService: IWorkbenchEnvironmentService;
	private readonly _contextService: IWorkspaceContextService;

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
		// DSpace: Store references for use in defaultUriScheme override
		this._environmentService = environmentService;
		this._contextService = contextService;
	}

	// DSpace: Override defaultUriScheme to prefer local when File System Access API is supported
	// This ensures that when the browser supports local file access, the editor defaults to local scheme
	// even when remoteAuthority is set (for extension loading). This enables local-first behavior.
	// This is a DSpace-specific modification - preserve during upstream merges.
	override get defaultUriScheme(): string {
		if (WebFileSystemAccess.supported(mainWindow)) {
			return Schemas.file;
		}
		return AbstractPathService.findDefaultUriScheme(this._environmentService, this._contextService);
	}
	// End DSpace modification
}

function guessLocalUserHome(environmentService: IWorkbenchEnvironmentService, contextService: IWorkspaceContextService): URI {

	// In web we do not really have the concept of a "local" user home
	// but we still require it in many places as a fallback. As such,
	// we have to come up with a synthetic location derived from the
	// environment.

	const workspace = contextService.getWorkspace();

	const firstFolder = workspace.folders.at(0);
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
