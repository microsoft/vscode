var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { areWorkspaceFoldersEmpty } from '../../../../services/workspaces/common/workspaceUtils.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
export const IChatTransferService = createDecorator('chatTransferService');
const transferredWorkspacesKey = 'chat.transferedWorkspaces';
let ChatTransferService = class ChatTransferService {
    constructor(workspaceService, storageService, fileService, workspaceTrustManagementService) {
        this.workspaceService = workspaceService;
        this.storageService = storageService;
        this.fileService = fileService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
    }
    deleteWorkspaceFromTransferredList(workspace) {
        const transferredWorkspaces = this.storageService.getObject(transferredWorkspacesKey, 0 /* StorageScope.PROFILE */, []);
        const updatedWorkspaces = transferredWorkspaces.filter(uri => uri !== workspace.toString());
        this.storageService.store(transferredWorkspacesKey, updatedWorkspaces, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
    addWorkspaceToTransferred(workspace) {
        const transferredWorkspaces = this.storageService.getObject(transferredWorkspacesKey, 0 /* StorageScope.PROFILE */, []);
        transferredWorkspaces.push(workspace.toString());
        this.storageService.store(transferredWorkspacesKey, transferredWorkspaces, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
    async checkAndSetTransferredWorkspaceTrust() {
        const workspace = this.workspaceService.getWorkspace();
        const currentWorkspaceUri = workspace.folders[0]?.uri;
        if (!currentWorkspaceUri) {
            return;
        }
        if (this.isChatTransferredWorkspace(currentWorkspaceUri, this.storageService) && await areWorkspaceFoldersEmpty(workspace, this.fileService)) {
            await this.workspaceTrustManagementService.setWorkspaceTrust(true);
            this.deleteWorkspaceFromTransferredList(currentWorkspaceUri);
        }
    }
    isChatTransferredWorkspace(workspace, storageService) {
        if (!workspace) {
            return false;
        }
        const chatWorkspaceTransfer = storageService.getObject(transferredWorkspacesKey, 0 /* StorageScope.PROFILE */, []);
        return chatWorkspaceTransfer.some(item => item.toString() === workspace.toString());
    }
};
ChatTransferService = __decorate([
    __param(0, IWorkspaceContextService),
    __param(1, IStorageService),
    __param(2, IFileService),
    __param(3, IWorkspaceTrustManagementService)
], ChatTransferService);
export { ChatTransferService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRyYW5zZmVyU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRUcmFuc2ZlclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDakcsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxtREFBbUQsQ0FBQztBQUNqSCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDOUcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDcEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBR2hHLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHLGVBQWUsQ0FBdUIscUJBQXFCLENBQUMsQ0FBQztBQUNqRyxNQUFNLHdCQUF3QixHQUFHLDJCQUEyQixDQUFDO0FBU3RELElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW1CO0lBRy9CLFlBQzRDLGdCQUEwQyxFQUNuRCxjQUErQixFQUNsQyxXQUF5QixFQUNMLCtCQUFpRTtRQUh6RSxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQTBCO1FBQ25ELG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQUNsQyxnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQUNMLG9DQUErQixHQUEvQiwrQkFBK0IsQ0FBa0M7SUFDakgsQ0FBQztJQUVHLGtDQUFrQyxDQUFDLFNBQWM7UUFDeEQsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBVyx3QkFBd0IsZ0NBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBQzFILE1BQU0saUJBQWlCLEdBQUcscUJBQXFCLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQzVGLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLHdCQUF3QixFQUFFLGlCQUFpQiw4REFBOEMsQ0FBQztJQUNySCxDQUFDO0lBRUQseUJBQXlCLENBQUMsU0FBYztRQUN2QyxNQUFNLHFCQUFxQixHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFXLHdCQUF3QixnQ0FBd0IsRUFBRSxDQUFDLENBQUM7UUFDMUgscUJBQXFCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ2pELElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLHdCQUF3QixFQUFFLHFCQUFxQiw4REFBOEMsQ0FBQztJQUN6SCxDQUFDO0lBRUQsS0FBSyxDQUFDLG9DQUFvQztRQUN6QyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDdkQsTUFBTSxtQkFBbUIsR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQztRQUN0RCxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUMxQixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLDBCQUEwQixDQUFDLG1CQUFtQixFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxNQUFNLHdCQUF3QixDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztZQUM5SSxNQUFNLElBQUksQ0FBQywrQkFBK0IsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuRSxJQUFJLENBQUMsa0NBQWtDLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUM5RCxDQUFDO0lBQ0YsQ0FBQztJQUVPLDBCQUEwQixDQUFDLFNBQWMsRUFBRSxjQUErQjtRQUNqRixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsTUFBTSxxQkFBcUIsR0FBVSxjQUFjLENBQUMsU0FBUyxDQUFDLHdCQUF3QixnQ0FBd0IsRUFBRSxDQUFDLENBQUM7UUFDbEgsT0FBTyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEtBQUssU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDckYsQ0FBQztDQUNELENBQUE7QUF6Q1ksbUJBQW1CO0lBSTdCLFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsZ0NBQWdDLENBQUE7R0FQdEIsbUJBQW1CLENBeUMvQiJ9