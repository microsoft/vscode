/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILabelService } from '../../../../platform/label/common/label.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceFolderLabelService } from '../../../../workbench/services/workspaces/common/workspaceFolderLabelService.js';
import { IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { IFocusedSessionHostService } from '../../../services/sessions/browser/sessionHost.js';
import { ISessionsManagementService } from '../../sessions/common/sessionsManagement.js';
import { ISessionFolder } from '../../sessions/common/session.js';

export class SessionsWorkspaceFolderLabelService implements IWorkspaceFolderLabelService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IFocusedSessionHostService private readonly _focusedSessionHostService: IFocusedSessionHostService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILabelService private readonly labelService: ILabelService,
	) { }

	getWorkspaceFolderLabel(workspaceFolder: IWorkspaceFolder, verbose?: boolean): string {
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

registerSingleton(IWorkspaceFolderLabelService, SessionsWorkspaceFolderLabelService, InstantiationType.Delayed);
