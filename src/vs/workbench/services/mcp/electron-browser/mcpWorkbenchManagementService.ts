/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { McpManagementChannelClient } from '../../../../platform/mcp/common/mcpManagementIpc.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IRemoteUserDataProfilesService } from '../../userDataProfile/common/remoteUserDataProfiles.js';
import { WorkbenchMcpManagementService as BaseWorkbenchMcpManagementService, IWorkbenchMcpManagementService } from '../common/mcpWorkbenchManagementService.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { IAllowedMcpServersService } from '../../../../platform/mcp/common/mcpManagement.js';

export class WorkbenchMcpManagementService extends BaseWorkbenchMcpManagementService {

	constructor(
		@IAllowedMcpServersService allowedMcpServersService: IAllowedMcpServersService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IRemoteUserDataProfilesService remoteUserDataProfilesService: IRemoteUserDataProfilesService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
	) {
		const mcpManagementService = new McpManagementChannelClient(sharedProcessService.getChannel('mcpManagement'), allowedMcpServersService);
		super(mcpManagementService, allowedMcpServersService, userDataProfileService, uriIdentityService, workspaceContextService, remoteAgentService, userDataProfilesService, remoteUserDataProfilesService, instantiationService);
		this._register(mcpManagementService);
	}
}

registerSingleton(IWorkbenchMcpManagementService, WorkbenchMcpManagementService, InstantiationType.Delayed);
