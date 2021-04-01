/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IPathService, AbstractPathService } from 'vs/workbench/services/path/common/pathService';
import { Schemas } from 'vs/base/common/network';

export class NativePathService extends AbstractPathService {

	readonly defaultUriScheme = this.environmentService.remoteAuthority ? Schemas.vscodeRemote : Schemas.file;

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService
	) {
		super(environmentService.userHome, remoteAgentService);
	}
}

registerSingleton(IPathService, NativePathService, true);
