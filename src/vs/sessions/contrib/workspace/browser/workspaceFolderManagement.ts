/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IActiveSessionItem, ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceEditingService } from '../../../../workbench/services/workspaces/common/workspaceEditing.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { URI } from '../../../../base/common/uri.js';
import { autorun } from '../../../../base/common/observable.js';
import { IWorkspaceFolderCreationData } from '../../../../platform/workspaces/common/workspaces.js';

export class WorkspaceFolderManagementContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.workspaceFolderManagement';

	constructor(
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super();
		this._register(autorun(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			this.updateWorkspaceFoldersForSession(activeSession);
		}));
	}

	private async updateWorkspaceFoldersForSession(session: IActiveSessionItem | undefined): Promise<void> {
		await this.manageTrustWorkspaceForSession(session);
		const activeSessionFolderData = this.getActiveSessionFolderData(session);
		const currentRepo = this.workspaceContextService.getWorkspace().folders[0]?.uri;

		if (!activeSessionFolderData) {
			if (currentRepo) {
				await this.workspaceEditingService.removeFolders([currentRepo], true);
			}
			return;
		}

		if (!currentRepo) {
			await this.workspaceEditingService.addFolders([activeSessionFolderData], true);
			return;
		}

		if (this.uriIdentityService.extUri.isEqual(currentRepo, activeSessionFolderData.uri)) {
			return;
		}

		await this.workspaceEditingService.updateFolders(0, 1, [activeSessionFolderData], true);
	}

	private getActiveSessionFolderData(session: IActiveSessionItem | undefined): IWorkspaceFolderCreationData | undefined {
		if (!session) {
			return undefined;
		}

		if (session.worktree) {
			return {
				uri: session.worktree,
				name: session.repository ? `${this.uriIdentityService.extUri.basename(session.repository)} (worktree)` : undefined
			};
		}

		if (session.repository) {
			if (session.providerType === AgentSessionProviders.Background) {
				return { uri: session.repository };
			}
			// if (session.providerType === AgentSessionProviders.Cloud) {
			// 	return {
			// 		uri: session.repository
			// 	};
			// }
		}

		return undefined;
	}

	private async manageTrustWorkspaceForSession(session: IActiveSessionItem | undefined): Promise<void> {
		if (session?.providerType !== AgentSessionProviders.Background) {
			return;
		}

		if (!session.repository || !session.worktree) {
			return;
		}

		if (!this.isUriTrusted(session.worktree)) {
			await this.workspaceTrustManagementService.setUrisTrust([session.worktree], true);
		}
	}

	private isUriTrusted(uri: URI): boolean {
		return this.workspaceTrustManagementService.getTrustedUris().some(trustedUri => this.uriIdentityService.extUri.isEqual(trustedUri, uri));
	}
}
