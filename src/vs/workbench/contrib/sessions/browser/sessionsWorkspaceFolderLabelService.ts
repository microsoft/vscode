/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILabelService } from '../../../../platform/label/common/label.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchMode } from '../../../../platform/workspace/common/workspace.js';
import { IFocusedSessionHostService } from '../../../services/sessions/browser/sessionHost.js';
import { ISessionFolder } from '../../../services/sessions/common/session.js';
import { IWorkspaceFolderLabelService } from '../../../services/workspaces/common/workspaceFolderLabelService.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';

/**
 * Labels workspace folders by the sessions they belong to, such as a worktree by its repository's name. Applies in the
 * Agents window, and in an editor window while it is in Agents mode; other editor windows keep the default labels.
 */
export class SessionsWorkspaceFolderLabelService implements IWorkspaceFolderLabelService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IFocusedSessionHostService private readonly _focusedSessionHostService: IFocusedSessionHostService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILabelService private readonly labelService: ILabelService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) { }

	getWorkspaceFolderLabel(workspaceFolder: IWorkspaceFolder, verbose?: boolean): string | undefined {
		if (this.workspaceContextService.getWorkbenchMode() !== WorkbenchMode.Agents) {
			return undefined;
		}

		const workspace = this._focusedSessionHostService.focusedHost.get().chat.get()?.workspace.get();
		const folder = workspace?.folders.find(folder => this.isWorkspaceFolder(folder, workspaceFolder))
			?? this.sessionsManagementService.getSessions()
				.flatMap(session => session.workspace.get()?.folders ?? [])
				.find(folder => this.isWorkspaceFolder(folder, workspaceFolder));
		if (folder) {
			const repositoryName = folder.name;
			if (verbose && !this.uriIdentityService.extUri.isEqual(folder.root, folder.workingDirectory)) {
				const branchName = folder.gitRepository?.branchName ?? this.labelService.getUriBasenameLabel(folder.workingDirectory);
				return `${repositoryName} (${branchName})`;
			}
			return repositoryName;
		}

		return this.labelService.getUriBasenameLabel(workspaceFolder.uri);
	}

	private isWorkspaceFolder(folder: ISessionFolder, workspaceFolder: IWorkspaceFolder): boolean {
		return this.uriIdentityService.extUri.isEqual(folder.workingDirectory, workspaceFolder.uri);
	}
}
