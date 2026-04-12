/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceEditingService } from '../../../../workbench/services/workspaces/common/workspaceEditing.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { autorun } from '../../../../base/common/observable.js';
import { Queue } from '../../../../base/common/async.js';
import { AGENT_HOST_SCHEME } from '../../../../platform/agentHost/common/agentHostUri.js';
let WorkspaceFolderManagementContribution = class WorkspaceFolderManagementContribution extends Disposable {
    static { this.ID = 'workbench.contrib.workspaceFolderManagement'; }
    constructor(sessionManagementService, uriIdentityService, workspaceContextService, workspaceEditingService, workspaceTrustManagementService) {
        super();
        this.sessionManagementService = sessionManagementService;
        this.uriIdentityService = uriIdentityService;
        this.workspaceContextService = workspaceContextService;
        this.workspaceEditingService = workspaceEditingService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.queue = this._register(new Queue());
        this._register(autorun(reader => {
            const activeSession = this.sessionManagementService.activeSession.read(reader);
            activeSession?.workspace.read(reader);
            this.queue.queue(() => this.updateWorkspaceFoldersForSession(activeSession));
        }));
    }
    async updateWorkspaceFoldersForSession(session) {
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
    getActiveSessionFolderData(session) {
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
            return {
                uri: repository,
                name: workspace?.label,
            };
        }
        return undefined;
    }
    async manageTrustWorkspaceForSession(session) {
        const workspace = session?.workspace.get();
        if (!workspace?.requiresWorkspaceTrust) {
            return;
        }
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
    isUriTrusted(uri) {
        return this.workspaceTrustManagementService.getTrustedUris().some(trustedUri => this.uriIdentityService.extUri.isEqual(trustedUri, uri));
    }
};
WorkspaceFolderManagementContribution = __decorate([
    __param(0, ISessionsManagementService),
    __param(1, IUriIdentityService),
    __param(2, IWorkspaceContextService),
    __param(3, IWorkspaceEditingService),
    __param(4, IWorkspaceTrustManagementService)
], WorkspaceFolderManagementContribution);
export { WorkspaceFolderManagementContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlRm9sZGVyTWFuYWdlbWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvd29ya3NwYWNlL2Jyb3dzZXIvd29ya3NwYWNlRm9sZGVyTWFuYWdlbWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDakcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDOUYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDaEgsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDM0csT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFFN0YsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUduRixJQUFNLHFDQUFxQyxHQUEzQyxNQUFNLHFDQUFzQyxTQUFRLFVBQVU7YUFFcEQsT0FBRSxHQUFHLDZDQUE2QyxBQUFoRCxDQUFpRDtJQUduRSxZQUM2Qix3QkFBcUUsRUFDNUUsa0JBQXdELEVBQ25ELHVCQUFrRSxFQUNsRSx1QkFBa0UsRUFDMUQsK0JBQWtGO1FBRXBILEtBQUssRUFBRSxDQUFDO1FBTnFDLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBNEI7UUFDM0QsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFxQjtRQUNsQyw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQTBC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