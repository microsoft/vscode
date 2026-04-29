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
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IRemoteUserDataProfilesService } from '../../userDataProfile/common/remoteUserDataProfiles.js';
import { WorkbenchMcpManagementService as BaseWorkbenchMcpManagementService, IWorkbenchMcpManagementService } from '../common/mcpWorkbenchManagementService.js';
import { McpManagementService } from '../../../../platform/mcp/common/mcpManagementService.js';
import { IAllowedMcpServersService } from '../../../../platform/mcp/common/mcpManagement.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class WorkbenchMcpManagementService extends BaseWorkbenchMcpManagementService {

	constructor(
		@IAllowedMcpServersService allowedMcpServersService: IAllowedMcpServersService,
		@ILogService logService: ILogService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IRemoteUserDataProfilesService remoteUserDataProfilesService: IRemoteUserDataProfilesService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const mMcpManagementService = instantiationService.createInstance(McpManagementService);
		super(mMcpManagementService, allowedMcpServersService, logService, userDataProfileService, uriIdentityService, workspaceContextService, remoteAgentService, userDataProfilesService, remoteUserDataProfilesService, instantiationService);
		this._register(mMcpManagementService);
	}
}

registerSingleton(IWorkbenchMcpManagementService, WorkbenchMcpManagementService, InstantiationType.Delayed);
