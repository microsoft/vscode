/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from '../../../../base/common/async.js';
import { cancelOnDispose } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService, WorkbenchMode, WorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkspaceFolderCreationData } from '../../../../platform/workspaces/common/workspaces.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { IFocusedSessionHostService } from '../../../services/sessions/browser/sessionHost.js';
import { ensureSessionWorktreesTrusted } from '../../../services/sessions/browser/worktreeTrust.js';
import { ISessionWorkspace } from '../../../services/sessions/common/session.js';
import { IWorkspaceEditingService } from '../../../services/workspaces/common/workspaceEditing.js';
import { IWorkspaceFolderLabelService } from '../../../services/workspaces/common/workspaceFolderLabelService.js';

export class WorkspaceFolderManagementContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.workspaceFolderManagement';

	constructor(
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IHistoryService historyService: IHistoryService,
	) {
		super();
		// The window's folders follow the focused session only in the Agents mode, as in the Agents window and in Agents mode
		const isActive = () => workspaceContextService.getWorkbenchMode() === WorkbenchMode.Agents;
		// Switching sessions in Agents mode clears the history of recently opened editors, so an editor window keeps its own
		// history from before the mode and gets it back when it leaves the mode. Only switching modes saves and restores it:
		// a window that restores in the mode keeps what it saved when it entered.
		this._register(workspaceContextService.onDidChangeWorkbenchMode(mode => {
			if (mode === WorkbenchMode.Agents) {
				historyService.saveRecentlyOpened();
			} else {
				historyService.restoreRecentlyOpened();
			}
		}));
		const active = observableFromEvent(this, workspaceContextService.onDidChangeWorkbenchMode, isActive);
		this._register(autorun(reader => {
			if (active.read(reader)) {
				reader.store.add(instantiationService.createInstance(SessionWorkspaceFolderMount, isActive));
			}
		}));
	}
}

class SessionWorkspaceFolderMount extends Disposable {

	private readonly queue = this._register(new Queue<void>());

	/** Whether this mount is replacing or removing the window's folders because the focused session changed. */
	private switchingFolders = false;

	constructor(
		isActive: () => boolean,
		@IFocusedSessionHostService focusedSessionHostService: IFocusedSessionHostService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceFolderLabelService private readonly workspaceFolderLabelService: IWorkspaceFolderLabelService,
		@IHistoryService historyService: IHistoryService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(event => {
			// Only a switch to another session's folders clears the history: entering or leaving Agents mode also changes the
			// window's folders
			if (event.removed.length > 0 && isActive() && this.switchingFolders) {
				historyService.clearRecentlyOpened();
			}
		}));
		this._register(autorun(reader => {
			const activeChat = focusedSessionHostService.focusedHost.read(reader).chat.read(reader);
			const workspace = activeChat?.workspace.read(reader);
			const token = cancelOnDispose(reader.store);
			this.queue.queue(() => this.updateWorkspaceFolders(workspace, () => !token.isCancellationRequested && isActive())).catch(onUnexpectedError);
		}));
	}

	private async updateWorkspaceFolders(workspace: ISessionWorkspace | undefined, isCurrent: () => boolean): Promise<void> {
		if (!isCurrent()) {
			return;
		}
		// Auto-trust an isolated worktree VS Code created off a trusted repo, so a
		// worktree session mounts without tripping the untrusted-folder backstop.
		await ensureSessionWorktreesTrusted(workspace, this.workspaceTrustManagementService);
		const sessionFolders = this.getWorkspaceFolderData(workspace);
		// A folder this window can't read, such as the web address of a session's repository, is no folder to mount.
		const readable = await Promise.all(sessionFolders.map(folder => this.fileService.canHandleResource(folder.uri)));
		const activeSessionFolders = sessionFolders.filter((_, index) => readable[index]);

		// Never mount untrusted folders: mounting one would flip the whole Agents
		// Window into Restricted Mode. Sessions opened from the list are already
		// gated on trust (see `ISessionsService.canOpenSession`); this backstop
		// keeps paths that bypass that gate (e.g. startup restore) safe too.
		const mountable = await Promise.all(activeSessionFolders.map(folder => this.isFolderMountable(workspace, folder.uri)));
		if (!isCurrent()) {
			return;
		}

		const currentFolders = this.workspaceContextService.getWorkspace().folders;
		if (activeSessionFolders.length === 0 || mountable.some(isMountable => !isMountable)) {
			if (currentFolders.length > 0) {
				await this.switchFolders(() => this.workspaceEditingService.removeFolders(currentFolders.map(folder => folder.uri), { donotNotifyError: true, force: true }));
			}
			return;
		}

		if (currentFolders.length === 0) {
			await this.workspaceEditingService.addFolders(activeSessionFolders, true);
			return;
		}

		const foldersMatch = currentFolders.length === activeSessionFolders.length
			&& currentFolders.every((folder, index) =>
				this.uriIdentityService.extUri.isEqual(folder.uri, activeSessionFolders[index].uri)
				&& folder.name === activeSessionFolders[index].name);
		if (foldersMatch) {
			return;
		}

		await this.switchFolders(() => this.workspaceEditingService.updateFolders(0, currentFolders.length, activeSessionFolders, { donotNotifyError: true, force: true }));
	}

	private async switchFolders(update: () => Promise<void>): Promise<void> {
		this.switchingFolders = true;
		try {
			await update();
		} finally {
			this.switchingFolders = false;
		}
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
					new WorkspaceFolder({ uri: folder.workingDirectory, name, index })
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
