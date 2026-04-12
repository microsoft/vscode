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
var BrowserExtensionHostDebugService_1;
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IExtensionHostDebugService } from '../../../../platform/debug/common/extensionHostDebug.js';
import { ExtensionHostDebugBroadcastChannel, ExtensionHostDebugChannelClient } from '../../../../platform/debug/common/extensionHostDebugIpc.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { isFolderToOpen, isWorkspaceToOpen } from '../../../../platform/window/common/window.js';
import { IWorkspaceContextService, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, toWorkspaceIdentifier, hasWorkspaceFileExtension } from '../../../../platform/workspace/common/workspace.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
let BrowserExtensionHostDebugService = class BrowserExtensionHostDebugService extends ExtensionHostDebugChannelClient {
    static { BrowserExtensionHostDebugService_1 = this; }
    static { this.LAST_EXTENSION_DEVELOPMENT_WORKSPACE_KEY = 'debug.lastExtensionDevelopmentWorkspace'; }
    constructor(remoteAgentService, environmentService, logService, hostService, contextService, storageService, fileService) {
        const connection = remoteAgentService.getConnection();
        let channel;
        if (connection) {
            channel = connection.getChannel(ExtensionHostDebugBroadcastChannel.ChannelName);
        }
        else {
            // Extension host debugging not supported in serverless.
            channel = { call: async () => Promise.resolve(undefined), listen: () => Event.None };
        }
        super(channel);
        this.storageService = storageService;
        this.fileService = fileService;
        if (environmentService.options && environmentService.options.workspaceProvider) {
            this.workspaceProvider = environmentService.options.workspaceProvider;
        }
        else {
            this.workspaceProvider = { open: async () => true, workspace: undefined, trusted: undefined };
            logService.warn('Extension Host Debugging not available due to missing workspace provider.');
        }
        // Reload window on reload request
        this._register(this.onReload(event => {
            if (environmentService.isExtensionDevelopment && environmentService.debugExtensionHost.debugId === event.sessionId) {
                hostService.reload();
            }
        }));
        // Close window on close request
        this._register(this.onClose(event => {
            if (environmentService.isExtensionDevelopment && environmentService.debugExtensionHost.debugId === event.sessionId) {
                hostService.close();
            }
        }));
        // Remember workspace as last used for extension development
        // (unless this is API tests) to restore for a future session
        if (environmentService.isExtensionDevelopment && !environmentService.extensionTestsLocationURI) {
            const workspaceId = toWorkspaceIdentifier(contextService.getWorkspace());
            if (isSingleFolderWorkspaceIdentifier(workspaceId) || isWorkspaceIdentifier(workspaceId)) {
                const serializedWorkspace = isSingleFolderWorkspaceIdentifier(workspaceId) ? { folderUri: workspaceId.uri.toJSON() } : { workspaceUri: workspaceId.configPath.toJSON() };
                storageService.store(BrowserExtensionHostDebugService_1.LAST_EXTENSION_DEVELOPMENT_WORKSPACE_KEY, JSON.stringify(serializedWorkspace), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
            }
            else {
                storageService.remove(BrowserExtensionHostDebugService_1.LAST_EXTENSION_DEVELOPMENT_WORKSPACE_KEY, 0 /* StorageScope.PROFILE */);
            }
        }
    }
    async openExtensionDevelopmentHostWindow(args, _debugRenderer) {
        // Add environment parameters required for debug to work
        const environment = new Map();
        const fileUriArg = this.findArgument('file-uri', args);
        if (fileUriArg && !hasWorkspaceFileExtension(fileUriArg)) {
            environment.set('openFile', fileUriArg);
        }
        const copyArgs = [
            'extensionDevelopmentPath',
            'extensionTestsPath',
            'extensionEnvironment',
            'debugId',
            'inspect-brk-extensions',
            'inspect-extensions',
        ];
        for (const argName of copyArgs) {
            const value = this.findArgument(argName, args);
            if (value) {
                environment.set(argName, value);
            }
        }
        // Find out which workspace to open debug window on
        let debugWorkspace = undefined;
        const folderUriArg = this.findArgument('folder-uri', args);
        if (folderUriArg) {
            debugWorkspace = { folderUri: URI.parse(folderUriArg) };
        }
        else {
            const fileUriArg = this.findArgument('file-uri', args);
            if (fileUriArg && hasWorkspaceFileExtension(fileUriArg)) {
                debugWorkspace = { workspaceUri: URI.parse(fileUriArg) };
            }
        }
        const extensionTestsPath = this.findArgument('extensionTestsPath', args);
        if (!debugWorkspace && !extensionTestsPath) {
            const lastExtensionDevelopmentWorkspace = this.storageService.get(BrowserExtensionHostDebugService_1.LAST_EXTENSION_DEVELOPMENT_WORKSPACE_KEY, 0 /* StorageScope.PROFILE */);
            if (lastExtensionDevelopmentWorkspace) {
                try {
                    const serializedWorkspace = JSON.parse(lastExtensionDevelopmentWorkspace);
                    if (serializedWorkspace.workspaceUri) {
                        debugWorkspace = { workspaceUri: URI.revive(serializedWorkspace.workspaceUri) };
                    }
                    else if (serializedWorkspace.folderUri) {
                        debugWorkspace = { folderUri: URI.revive(serializedWorkspace.folderUri) };
                    }
                }
                catch (error) {
                    // ignore
                }
            }
        }
        // Validate workspace exists
        if (debugWorkspace) {
            const debugWorkspaceResource = isFolderToOpen(debugWorkspace) ? debugWorkspace.folderUri : isWorkspaceToOpen(debugWorkspace) ? debugWorkspace.workspaceUri : undefined;
            if (debugWorkspaceResource) {
                const workspaceExists = await this.fileService.exists(debugWorkspaceResource);
                if (!workspaceExists) {
                    debugWorkspace = undefined;
                }
            }
        }
        // Open debug window as new window. Pass arguments over.
        const success = await this.workspaceProvider.open(debugWorkspace, {
            reuse: false, // debugging always requires a new window
            payload: Array.from(environment.entries()) // mandatory properties to enable debugging
        });
        return { success };
    }
    findArgument(key, args) {
        for (const a of args) {
            const k = `--${key}=`;
            if (a.indexOf(k) === 0) {
                return a.substring(k.length);
            }
        }
        return undefined;
    }
};
BrowserExtensionHostDebugService = BrowserExtensionHostDebugService_1 = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, IBrowserWorkbenchEnvironmentService),
    __param(2, ILogService),
    __param(3, IHostService),
    __param(4, IWorkspaceContextService),
    __param(5, IStorageService),
    __param(6, IFileService)
], BrowserExtensionHostDebugService);
registerSingleton(IExtensionHostDebugService, BrowserExtensionHostDebugService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sZ0NBQWdDLENBQUM7QUFFcEUsT0FBTyxFQUFFLDBCQUEwQixFQUE4QixNQUFNLHlEQUF5RCxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSwrQkFBK0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2pKLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLGNBQWMsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxpQ0FBaUMsRUFBRSxxQkFBcUIsRUFBRSxxQkFBcUIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRTFNLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUU1RixJQUFNLGdDQUFnQyxHQUF0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