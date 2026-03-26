/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceEditingService } from '../../../../workbench/services/workspaces/common/workspaceEditing.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { URI } from '../../../../base/common/uri.js';
import { autorun } from '../../../../base/common/observable.js';
import { IWorkspaceFolderCreationData } from '../../../../platform/workspaces/common/workspaces.js';
import { getGitHubRemoteFileDisplayName } from '../../fileTreeView/browser/githubFileSystemProvider.js';
import { Queue } from '../../../../base/common/async.js';
import { AGENT_HOST_SCHEME } from '../../../../platform/agentHost/common/agentHostUri.js';
import { ISessionData } from '../../sessions/common/sessionData.js';

export class WorkspaceFolderManagementContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.workspaceFolderManagement';
	private queue = this._register(new Queue<void>());

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
			activeSession?.workspace.read(reader);
			this.queue.queue(() => this.updateWorkspaceFoldersForSession(activeSession));
		}));
	}

	private async updateWorkspaceFoldersForSession(session: ISessionData | undefined): Promise<void> {
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

	private getActiveSessionFolderData(session: ISessionData | undefined): IWorkspaceFolderCreationData | undefined {
		if (!session) {
			return undefined;
		}

		const workspace = session.workspace.get();
		const repo = workspace?.repositories[0];
		const repository = repo?.uri;
		const worktree = repo?.workingDirectory;
		const branchName = repo?.detail;

		if (worktree) {
			return {
				uri: worktree,
				name: repository ? `${this.uriIdentityService.extUri.basename(repository)} (${branchName ?? this.uriIdentityService.extUri.basename(worktree)})` : this.uriIdentityService.extUri.basename(worktree)
			};
		}

		if (repository) {
			// Remote agent host sessions use a read-only FS provider that
			// should not be added as a workspace folder.
			if (repository.scheme === AGENT_HOST_SCHEME) {
				return undefined;
			}

			if (session.sessionType === AgentSessionProviders.Background) {
				return { uri: repository };
			}
			if (session.sessionType === AgentSessionProviders.Cloud) {
				return {
					uri: repository,
					name: getGitHubRemoteFileDisplayName(repository),
				};
			}
		}

		return undefined;
	}

	private async manageTrustWorkspaceForSession(session: ISessionData | undefined): Promise<void> {
		if (session?.sessionType !== AgentSessionProviders.Background) {
			return;
		}

		const workspace = session.workspace.get();
		const repo = workspace?.repositories[0];
		const repository = repo?.uri;
		const worktree = repo?.workingDirectory;

		if (!repository || !worktree) {
			return;
		}

		if (!this.isUriTrusted(worktree)) {
			await this.workspaceTrustManagementService.setUrisTrust([worktree], true);
		}
	}

	private isUriTrusted(uri: URI): boolean {
		return this.workspaceTrustManagementService.getTrustedUris().some(trustedUri => this.uriIdentityService.extUri.isEqual(trustedUri, uri));
	}
}
