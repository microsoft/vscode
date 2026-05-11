/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../base/common/resources.js';
import { onUnexpectedError } from '../../base/common/errors.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IRemoteAuthorityResolverService } from '../../platform/remote/common/remoteAuthorityResolver.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity.js';
import { IAnyWorkspaceIdentifier, IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../platform/workspace/common/workspaceTrust.js';
import { IBrowserWorkbenchEnvironmentService } from '../../workbench/services/environment/browser/environmentService.js';
import { IWorkbenchConfigurationService } from '../../workbench/services/configuration/common/configuration.js';
import { IUserDataProfileService } from '../../workbench/services/userDataProfile/common/userDataProfile.js';
import { BrowserUserDataProfilesService } from '../../platform/userDataProfile/browser/userDataProfile.js';
import { FileService } from '../../platform/files/common/fileService.js';
import { IPolicyService } from '../../platform/policy/common/policy.js';
import { IRemoteAgentService } from '../../workbench/services/remote/common/remoteAgentService.js';
import { IWorkspaceEditingService } from '../../workbench/services/workspaces/common/workspaceEditing.js';
import { WorkspaceTrustEnablementService, WorkspaceTrustManagementService } from '../../workbench/services/workspaces/common/workspaceTrust.js';
import { BrowserMain, IBrowserMainWorkbench } from '../../workbench/browser/web.main.js';
import { getWorkspaceIdentifier } from '../../workbench/services/workspaces/browser/workspaces.js';
import { SessionsWorkspaceContextService } from '../services/workspace/browser/workspaceContextService.js';
import { ConfigurationService } from '../services/configuration/browser/configurationService.js';
import { Workbench as SessionsWorkbench } from './workbench.js';

export class SessionsBrowserMain extends BrowserMain {

	protected override createWorkbench(domElement: HTMLElement, serviceCollection: ServiceCollection, logService: ILogService): IBrowserMainWorkbench {
		return new SessionsWorkbench(domElement, undefined, serviceCollection, logService);
	}

	protected override async createWorkspaceConfigAndStorageServices(
		serviceCollection: ServiceCollection,
		_workspace: IAnyWorkspaceIdentifier,
		environmentService: IBrowserWorkbenchEnvironmentService,
		userDataProfileService: IUserDataProfileService,
		_userDataProfilesService: BrowserUserDataProfilesService,
		fileService: FileService,
		_remoteAgentService: IRemoteAgentService,
		uriIdentityService: IUriIdentityService,
		policyService: IPolicyService,
		logService: ILogService,
		remoteAuthorityResolverService: IRemoteAuthorityResolverService,
	): Promise<{ configurationService: IWorkbenchConfigurationService; storageService: IStorageService }> {
		// Use sessions workspace/configuration services instead of the standard
		// WorkspaceService. This mirrors what SessionsMain does on desktop:
		// the agents window manages workspace folders in-memory without creating
		// workspace file watchers or other resources.

		// Workspace — use a stable synthetic workspace identifier for agents
		const sessionsWorkspaceUri = joinPath(environmentService.userRoamingDataHome, 'agent-sessions.code-workspace');
		const workspaceIdentifier = getWorkspaceIdentifier(sessionsWorkspaceUri);
		const workspaceContextService = new SessionsWorkspaceContextService(workspaceIdentifier, uriIdentityService);

		serviceCollection.set(IWorkspaceContextService, workspaceContextService);
		serviceCollection.set(IWorkspaceEditingService, workspaceContextService);

		// Configuration — the sessions ConfigurationService works against the
		// in-memory workspace model rather than a real .code-workspace file on disk.
		const configurationService = new ConfigurationService(
			userDataProfileService,
			workspaceContextService,
			uriIdentityService,
			fileService,
			policyService,
			logService
		);

		try {
			await configurationService.initialize();
		} catch (error) {
			onUnexpectedError(error);
		}

		serviceCollection.set(IWorkbenchConfigurationService, configurationService);

		// Storage
		const storageService = await this.createStorageService(workspaceIdentifier, logService, userDataProfileService);
		serviceCollection.set(IStorageService, storageService);

		// Workspace Trust Service
		const workspaceTrustEnablementService = new WorkspaceTrustEnablementService(configurationService, environmentService);
		serviceCollection.set(IWorkspaceTrustEnablementService, workspaceTrustEnablementService);

		const workspaceTrustManagementService = new WorkspaceTrustManagementService(configurationService, remoteAuthorityResolverService, storageService, uriIdentityService, environmentService, workspaceContextService, workspaceTrustEnablementService, fileService);
		serviceCollection.set(IWorkspaceTrustManagementService, workspaceTrustManagementService);

		return { configurationService, storageService };
	}
}
