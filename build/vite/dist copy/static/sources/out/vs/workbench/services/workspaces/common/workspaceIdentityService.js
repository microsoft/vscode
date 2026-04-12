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
import { VSBuffer } from '../../../../base/common/buffer.js';
import { isEqualOrParent, joinPath, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { EditSessionIdentityMatch, IEditSessionIdentityService } from '../../../../platform/workspace/common/editSessions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
export const IWorkspaceIdentityService = createDecorator('IWorkspaceIdentityService');
let WorkspaceIdentityService = class WorkspaceIdentityService {
    constructor(workspaceContextService, editSessionIdentityService) {
        this.workspaceContextService = workspaceContextService;
        this.editSessionIdentityService = editSessionIdentityService;
    }
    async getWorkspaceStateFolders(cancellationToken) {
        const workspaceStateFolders = [];
        for (const workspaceFolder of this.workspaceContextService.getWorkspace().folders) {
            const workspaceFolderIdentity = await this.editSessionIdentityService.getEditSessionIdentifier(workspaceFolder, cancellationToken);
            if (!workspaceFolderIdentity) {
                continue;
            }
            workspaceStateFolders.push({ resourceUri: workspaceFolder.uri.toString(), workspaceFolderIdentity });
        }
        return workspaceStateFolders;
    }
    async matches(incomingWorkspaceFolders, cancellationToken) {
        const incomingToCurrentWorkspaceFolderUris = {};
        const incomingIdentitiesToIncomingWorkspaceFolders = {};
        for (const workspaceFolder of incomingWorkspaceFolders) {
            incomingIdentitiesToIncomingWorkspaceFolders[workspaceFolder.workspaceFolderIdentity] = workspaceFolder.resourceUri;
        }
        // Precompute the identities of the current workspace folders
        const currentWorkspaceFoldersToIdentities = new Map();
        for (const workspaceFolder of this.workspaceContextService.getWorkspace().folders) {
            const workspaceFolderIdentity = await this.editSessionIdentityService.getEditSessionIdentifier(workspaceFolder, cancellationToken);
            if (!workspaceFolderIdentity) {
                continue;
            }
            currentWorkspaceFoldersToIdentities.set(workspaceFolder, workspaceFolderIdentity);
        }
        // Match the current workspace folders to the incoming workspace folders
        for (const [currentWorkspaceFolder, currentWorkspaceFolderIdentity] of currentWorkspaceFoldersToIdentities.entries()) {
            // Happy case: identities do not need further disambiguation
            const incomingWorkspaceFolder = incomingIdentitiesToIncomingWorkspaceFolders[currentWorkspaceFolderIdentity];
            if (incomingWorkspaceFolder) {
                // There is an incoming workspace folder with the exact same identity as the current workspace folder
                incomingToCurrentWorkspaceFolderUris[incomingWorkspaceFolder] = currentWorkspaceFolder.uri.toString();
                continue;
            }
            // Unhappy case: compare the identity of the current workspace folder to all incoming workspace folder identities
            let hasCompleteMatch = false;
            for (const [incomingIdentity, incomingFolder] of Object.entries(incomingIdentitiesToIncomingWorkspaceFolders)) {
                if (await this.editSessionIdentityService.provideEditSessionIdentityMatch(currentWorkspaceFolder, currentWorkspaceFolderIdentity, incomingIdentity, cancellationToken) === EditSessionIdentityMatch.Complete) {
                    incomingToCurrentWorkspaceFolderUris[incomingFolder] = currentWorkspaceFolder.uri.toString();
                    hasCompleteMatch = true;
                    break;
                }
            }
            if (hasCompleteMatch) {
                continue;
            }
            return false;
        }
        const convertUri = (uriToConvert) => {
            // Figure out which current folder the incoming URI is a child of
            for (const incomingFolderUriKey of Object.keys(incomingToCurrentWorkspaceFolderUris)) {
                const incomingFolderUri = URI.parse(incomingFolderUriKey);
                if (isEqualOrParent(incomingFolderUri, uriToConvert)) {
                    const currentWorkspaceFolderUri = incomingToCurrentWorkspaceFolderUris[incomingFolderUriKey];
                    // Compute the relative file path section of the uri to convert relative to the folder it came from
                    const relativeFilePath = relativePath(incomingFolderUri, uriToConvert);
                    // Reparent the relative file path under the current workspace folder it belongs to
                    if (relativeFilePath) {
                        return joinPath(URI.parse(currentWorkspaceFolderUri), relativeFilePath);
                    }
                }
            }
            // No conversion was possible; return the original URI
            return uriToConvert;
        };
        // Recursively look for any URIs in the provided object and
        // replace them with the URIs of the current workspace folders
        const uriReplacer = (obj, depth = 0) => {
            if (!obj || depth > 200) {
                return obj;
            }
            if (obj instanceof VSBuffer || obj instanceof Uint8Array) {
                return obj;
            }
            if (URI.isUri(obj)) {
                return convertUri(obj);
            }
            if (Array.isArray(obj)) {
                for (let i = 0; i < obj.length; ++i) {
                    obj[i] = uriReplacer(obj[i], depth + 1);
                }
            }
            else {
                // walk object
                for (const key in obj) {
                    if (Object.hasOwnProperty.call(obj, key)) {
                        obj[key] = uriReplacer(obj[key], depth + 1);
                    }
                }
            }
            return obj;
        };
        return uriReplacer;
    }
};
WorkspaceIdentityService = __decorate([
    __param(0, IWorkspaceContextService),
    __param(1, IEditSessionIdentityService)
], WorkspaceIdentityService);
export { WorkspaceIdentityService };
registerSingleton(IWorkspaceIdentityService, WorkspaceIdentityService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlSWRlbnRpdHlTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZUlkZW50aXR5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFN0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0YsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFN0YsT0FBTyxFQUFFLHdCQUF3QixFQUFFLDJCQUEyQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDOUgsT0FBTyxFQUFFLHdCQUF3QixFQUFvQixNQUFNLG9EQUFvRCxDQUFDO0FBRWhILE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFHLGVBQWUsQ0FBNEIsMkJBQTJCLENBQUMsQ0FBQztBQU8xRyxJQUFNLHdCQUF3QixHQUE5QixNQUFNLHdCQUF3QjtJQUdwQyxZQUM0Qyx1QkFBaUQsRUFDOUMsMEJBQXVEO1FBRDFELDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBMEI7UUFDOUMsK0JBQTBCLEdBQTFCLDBCQUEwQixDQUE2QjtJQUNsRyxDQUFDO0lBRUwsS0FBSyxDQUFDLHdCQUF3QixDQUFDLGlCQUFvQztRQUNsRSxNQUFNLHFCQUFxQixHQUE0QixFQUFFLENBQUM7UUFFMUQsS0FBSyxNQUFNLGVBQWUsSUFBSSxJQUFJLENBQUMsdUJBQXVCLENBQUMsWUFBWSxF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