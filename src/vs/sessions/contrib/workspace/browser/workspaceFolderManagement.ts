/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ensureSessionWorktreesTrusted } from '../../../services/sessions/browser/worktreeTrust.js';
import { IWorkspaceContextService, WorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceEditingService } from '../../../../workbench/services/workspaces/common/workspaceEditing.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { URI } from '../../../../base/common/uri.js';
import { autorun } from '../../../../base/common/observable.js';
import { IWorkspaceFolderCreationData } from '../../../../platform/workspaces/common/workspaces.js';
import { Queue } from '../../../../base/common/async.js';
import { ISessionWorkspace } from '../../../services/sessions/common/session.js';
import { IWorkspaceFolderLabelService } from '../../../../workbench/services/workspaces/common/workspaceFolderLabelService.js';

export class WorkspaceFolderManagementContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.workspaceFolderManagement';
	private queue = this._register(new Queue<void>());

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceFolderLabelService private readonly workspaceFolderLabelService: IWorkspaceFolderLabelService,
	) {
		super();
		this._register(autorun(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			const activeChat = activeSession?.activeChat.read(reader);
			const workspace = activeChat?.workspace.read(reader);
			this.queue.queue(() => this.updateWorkspaceFolders(workspace));
		}));
	}

	private async updateWorkspaceFolders(workspace: ISessionWorkspace | undefined): Promise<void> {
		// Auto-trust an isolated worktree VS Code created off a trusted repo, so a
		// worktree session mounts without tripping the untrusted-folder backstop.
		await ensureSessionWorktreesTrusted(workspace, this.workspaceTrustManagementService);
		const activeSessionFolders = this.getWorkspaceFolderData(workspace);
		const currentFolders = this.workspaceContextService.getWorkspace().folders;

		// Never mount untrusted folders: mounting one would flip the whole Agents
		// Window into Restricted Mode. Sessions opened from the list are already
		// gated on trust (see `ISessionsService.canOpenSession`); this backstop
		// keeps paths that bypass that gate (e.g. startup restore) safe too.
		const mountable = await Promise.all(activeSessionFolders.map(folder => this.isFolderMountable(workspace, folder.uri)));
		if (mountable.some(isMountable => !isMountable)) {
			if (currentFolders.length > 0) {
				await this.workspaceEditingService.removeFolders(currentFolders.map(folder => folder.uri), true);
			}
			return;
		}

		if (activeSessionFolders.length === 0) {
			if (currentFolders.length > 0) {
				await this.workspaceEditingService.removeFolders(currentFolders.map(folder => folder.uri), true);
			}
			return;
		}

		if (currentFolders.length === 0) {
			await this.workspaceEditingService.addFolders(activeSessionFolders, true);
			return;
		}

		const foldersMatch = currentFolders.length === activeSessionFolders.length
			&& currentFolders.every((folder, index) => this.uriIdentityService.extUri.isEqual(folder.uri, activeSessionFolders[index].uri));
		if (foldersMatch) {
			return;
		}

		await this.workspaceEditingService.updateFolders(0, currentFolders.length, activeSessionFolders, true);
	}

	private getWorkspaceFolderData(workspace: ISessionWorkspace | undefined): IWorkspaceFolderCreationData[] {
		if (!workspace) {
			return [];
		}

		return workspace.folders.map((folder, index) => {
			const name = index === 0 ? workspace.label : folder.name;
			return {
				uri: folder.workingDirectory,
				name: this.workspaceFolderLabelService.getWorkspaceFolderLabel(
					new WorkspaceFolder({ uri: folder.workingDirectory, name, index }),
					true
				) ?? name
			};
		});
	}

	/**
	 * Whether `uri` may be mounted as the workspace folder. A session that
	 * requires workspace trust may only mount a trusted folder; anything else is
	 * left unmounted so the window never enters Restricted Mode behind the user's
	 * back. Sessions that don't require trust (e.g. virtual/cloud) always mount.
	 */
	private async isFolderMountable(workspace: ISessionWorkspace | undefined, uri: URI): Promise<boolean> {
		if (!workspace?.requiresWorkspaceTrust) {
			return true;
		}
		return (await this.workspaceTrustManagementService.getUriTrustInfo(uri)).trusted;
	}
}
