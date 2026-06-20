/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceEditingService } from '../../../../workbench/services/workspaces/common/workspaceEditing.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { autorun } from '../../../../base/common/observable.js';
import { IWorkspaceFolderCreationData } from '../../../../platform/workspaces/common/workspaces.js';
import { Queue } from '../../../../base/common/async.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { AgentHostWorkspaceTrust } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostWorkspaceTrust.js';

export class WorkspaceFolderManagementContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.workspaceFolderManagement';
	private queue = this._register(new Queue<void>());
	private readonly workspaceTrust: AgentHostWorkspaceTrust;

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.workspaceTrust = instantiationService.createInstance(AgentHostWorkspaceTrust);
		this._register(autorun(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			activeSession?.workspace.read(reader);
			this.queue.queue(() => this.updateWorkspaceFoldersForSession(activeSession));
		}));
	}

	private async updateWorkspaceFoldersForSession(session: ISession | undefined): Promise<void> {
		if (!await this.manageTrustWorkspaceForSession(session)) {
			return;
		}
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
			name: this.uriIdentityService.extUri.isEqual(folder.root, folder.workingDirectory) ? workspace.label : `${this.uriIdentityService.extUri.basename(folder.root)} (${folder.gitRepository?.branchName ?? this.uriIdentityService.extUri.basename(folder.workingDirectory)})`
		};
	}

	private async manageTrustWorkspaceForSession(session: ISession | undefined): Promise<boolean> {
		const workspace = session?.workspace.get();
		if (!workspace?.requiresWorkspaceTrust) {
			return true;
		}

		const folder = workspace?.folders[0];
		if (!folder) {
			return true;
		}

		return this.workspaceTrust.ensureTrusted(folder.workingDirectory);
	}
}
