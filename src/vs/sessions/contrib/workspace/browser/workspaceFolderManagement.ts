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
import { ISession } from '../../../services/sessions/common/session.js';
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
			activeSession?.workspace.read(reader);
			this.queue.queue(() => this.updateWorkspaceFoldersForSession(activeSession));
		}));
	}

	private async updateWorkspaceFoldersForSession(session: ISession | undefined): Promise<void> {
		// Auto-trust an isolated worktree VS Code created off a trusted repo, so a
		// worktree session mounts without tripping the untrusted-folder backstop.
		await ensureSessionWorktreesTrusted(session?.workspace.get(), this.workspaceTrustManagementService);
		const activeSessionFolderData = this.getActiveSessionFolderData(session);
		const currentRepo = this.workspaceContextService.getWorkspace().folders[0]?.uri;

		// Never mount an untrusted folder: mounting it would flip the whole Agents
		// Window into Restricted Mode. Sessions opened from the list are already
		// gated on trust (see `ISessionsService.canOpenSession`); this backstop
		// keeps paths that bypass that gate (e.g. startup restore) safe too by
		// leaving the folder unmounted rather than mounting it untrusted.
		if (activeSessionFolderData && !await this.isFolderMountable(session, activeSessionFolderData.uri)) {
			if (currentRepo) {
				await this.workspaceEditingService.removeFolders([currentRepo], true);
			}
			return;
		}

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

	private getActiveSessionFolderData(session: ISession | undefined): IWorkspaceFolderCreationData | undefined {
		if (!session) {
			return undefined;
		}

		const workspace = session.workspace.get();
		const folder = workspace?.folders[0];

		if (!folder) {
			return undefined;
		}

		return {
			uri: folder.workingDirectory,
			name: this.workspaceFolderLabelService.getWorkspaceFolderLabel(
				new WorkspaceFolder({ uri: folder.workingDirectory, name: workspace.label, index: 0 }),
				true
			) ?? workspace.label
		};
	}

	/**
	 * Whether `uri` may be mounted as the workspace folder. A session that
	 * requires workspace trust may only mount a trusted folder; anything else is
	 * left unmounted so the window never enters Restricted Mode behind the user's
	 * back. Sessions that don't require trust (e.g. virtual/cloud) always mount.
	 */
	private async isFolderMountable(session: ISession | undefined, uri: URI): Promise<boolean> {
		const workspace = session?.workspace.get();
		if (!workspace?.requiresWorkspaceTrust) {
			return true;
		}
		return (await this.workspaceTrustManagementService.getUriTrustInfo(uri)).trusted;
	}
}
