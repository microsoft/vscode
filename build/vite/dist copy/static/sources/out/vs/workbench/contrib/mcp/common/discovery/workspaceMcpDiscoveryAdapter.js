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
import { DisposableMap } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { FilesystemMcpDiscovery } from './nativeMcpDiscoveryAbstract.js';
import { claudeConfigToServerDefinition } from './nativeMcpDiscoveryAdapters.js';
let CursorWorkspaceMcpDiscoveryAdapter = class CursorWorkspaceMcpDiscoveryAdapter extends FilesystemMcpDiscovery {
    constructor(fileService, _workspaceContextService, mcpRegistry, configurationService, _remoteAgentService) {
        super(configurationService, fileService, mcpRegistry);
        this._workspaceContextService = _workspaceContextService;
        this._remoteAgentService = _remoteAgentService;
        this._collections = this._register(new DisposableMap());
    }
    start() {
        this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(e => {
            for (const removed of e.removed) {
                this._collections.deleteAndDispose(removed.uri.toString());
            }
            for (const added of e.added) {
                this.watchFolder(added);
            }
        }));
        for (const folder of this._workspaceContextService.getWorkspace().folders) {
            this.watchFolder(folder);
        }
    }
    watchFolder(folder) {
        const configFile = joinPath(folder.uri, '.cursor', 'mcp.json');
        const collection = {
            id: `cursor-workspace.${folder.index}`,
            label: `${folder.name}/.cursor/mcp.json`,
            remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority || null,
            scope: 1 /* StorageScope.WORKSPACE */,
            trustBehavior: 1 /* McpServerTrust.Kind.TrustedOnNonce */,
            serverDefinitions: observableValue(this, []),
            configTarget: 6 /* ConfigurationTarget.WORKSPACE_FOLDER */,
            presentation: {
                origin: configFile,
                order: 0 /* McpCollectionSortOrder.WorkspaceFolder */ + 1,
            },
        };
        this._collections.set(folder.uri.toString(), this.watchFile(URI.joinPath(folder.uri, '.cursor', 'mcp.json'), collection, "cursor-workspace" /* DiscoverySource.CursorWorkspace */, async (contents) => {
            const defs = await claudeConfigToServerDefinition(collection.id, contents, folder.uri);
            defs?.forEach(d => d.roots = [folder.uri]);
            return defs;
        }));
    }
};
CursorWorkspaceMcpDiscoveryAdapter = __decorate([
    __param(0, IFileService),
    __param(1, IWorkspaceContextService),
    __param(2, IMcpRegistry),
    __param(3, IConfigurationService),
    __param(4, IRemoteAgentService)
], CursorWorkspaceMcpDiscoveryAdapter);
export { CursorWorkspaceMcpDiscoveryAdapter };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlTWNwRGlzY292ZXJ5QWRhcHRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vZGlzY292ZXJ5L3dvcmtzcGFjZU1jcERpc2NvdmVyeUFkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGFBQWEsRUFBZSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBdUIscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUMzSCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFN0UsT0FBTyxFQUFFLHdCQUF3QixFQUFvQixNQUFNLHVEQUF1RCxDQUFDO0FBQ25ILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRS9GLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUd0RCxPQUFPLEVBQUUsc0JBQXNCLEVBQW1DLE1BQU0saUNBQWlDLENBQUM7QUFDMUcsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFMUUsSUFBTSxrQ0FBa0MsR0FBeEMsTUFBTSxrQ0FBbUMsU0FBUSxzQkFBc0I7SUFHN0UsWUFDZSxXQUF5QixFQUNiLHdCQUFtRSxFQUMvRSxXQUF5QixFQUNoQixvQkFBMkMsRUFDN0MsbUJBQXlEO1FBRTlFLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxXQUFXLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFM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