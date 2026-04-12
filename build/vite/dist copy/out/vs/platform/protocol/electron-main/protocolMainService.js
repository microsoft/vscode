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
import { session } from 'electron';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { COI, FileAccess, Schemas, CacheControlheaders, DocumentPolicyheaders } from '../../../base/common/network.js';
import { basename, extname, normalize } from '../../../base/common/path.js';
import { isLinux } from '../../../base/common/platform.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { validatedIpcMain } from '../../../base/parts/ipc/electron-main/ipcMain.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
let ProtocolMainService = class ProtocolMainService extends Disposable {
    constructor(environmentService, userDataProfilesService, logService) {
        super();
        this.environmentService = environmentService;
        this.logService = logService;
        this.validRoots = TernarySearchTree.forPaths(!isLinux);
        this.validExtensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.mp4', '.otf', '.ttf']); // https://github.com/microsoft/vscode/issues/119384
        // Define an initial set of roots we allow loading from
        // - appRoot	: all files installed as part of the app
        // - extensions : all files shipped from extensions
        // - storage    : all files in global and workspace storage (https://github.com/microsoft/vscode/issues/116735)
        this.addValidFileRoot(environmentService.appRoot);
        this.addValidFileRoot(environmentService.extensionsPath);
        this.addValidFileRoot(userDataProfilesService.defaultProfile.globalStorageHome.with({ scheme: Schemas.file }).fsPath);
        this.addValidFileRoot(environmentService.workspaceStorageHome.with({ scheme: Schemas.file }).fsPath);
        // Handle protocols
        this.handleProtocols();
    }
    handleProtocols() {
        const { defaultSession } = session;
        // Register vscode-file:// handler
        defaultSession.protocol.registerFileProtocol(Schemas.vscodeFileResource, (request, callback) => this.handleResourceRequest(request, callback));
        // Block any file:// access
        defaultSession.protocol.interceptFileProtocol(Schemas.file, (request, callback) => this.handleFileRequest(request, callback));
        // Cleanup
        this._register(toDisposable(() => {
            defaultSession.protocol.unregisterProtocol(Schemas.vscodeFileResource);
            defaultSession.protocol.uninterceptProtocol(Schemas.file);
        }));
    }
    addValidFileRoot(root) {
        // Pass to `normalize` because we later also do the
        // same for all paths to check against.
        const normalizedRoot = normalize(root);
        if (!this.validRoots.get(normalizedRoot)) {
            this.validRoots.set(normalizedRoot, true);
            return toDisposable(() => this.validRoots.delete(normalizedRoot));
        }
        return Disposable.None;
    }
    //#region file://
    handleFileRequest(request, callback) {
        const uri = URI.parse(request.url);
        this.logService.error(`Refused to load resource ${uri.fsPath} from ${Schemas.file}: protocol (original URL: ${request.url})`);
        return callback({ error: -3 /* ABORTED */ });
    }
    //#endregion
    //#region vscode-file://
    handleResourceRequest(request, callback) {
        const path = this.requestToNormalizedFilePath(request);
        const pathBasename = basename(path);
        let headers;
        if (this.environmentService.crossOriginIsolated) {
            if (pathBasename === 'workbench.html' || pathBasename === 'workbench-dev.html') {
                headers = COI.CoopAndCoep;
            }
            else {
                headers = COI.getHeadersFromQuery(request.url);
            }
        }
        // In OSS, evict resources from the memory cache in the renderer process
        // Refs https://github.com/microsoft/vscode/issues/148541#issuecomment-2670891511
        if (!this.environmentService.isBuilt) {
            headers = {
                ...headers,
                ...CacheControlheaders
            };
        }
        // Document-policy header is needed for collecting
        // JavaScript callstacks via https://www.electronjs.org/docs/latest/api/web-frame-main#framecollectjavascriptcallstack-experimental
        // until https://github.com/electron/electron/issues/45356 is resolved.
        if (pathBasename === 'workbench.html' || pathBasename === 'workbench-dev.html') {
            headers = {
                ...headers,
                ...DocumentPolicyheaders
            };
        }
        // first check by validRoots
        if (this.validRoots.findSubstr(path)) {
            return callback({ path, headers });
        }
        // then check by validExtensions
        if (this.validExtensions.has(extname(path).toLowerCase())) {
            return callback({ path, headers });
        }
        // finally block to load the resource
        this.logService.error(`${Schemas.vscodeFileResource}: Refused to load resource ${path} from ${Schemas.vscodeFileResource}: protocol (original URL: ${request.url})`);
        return callback({ error: -3 /* ABORTED */ });
    }
    requestToNormalizedFilePath(request) {
        // 1.) Use `URI.parse()` util from us to convert the raw
        //     URL into our URI.
        const requestUri = URI.parse(request.url);
        // 2.) Use `FileAccess.asFileUri` to convert back from a
        //     `vscode-file:` URI to a `file:` URI.
        const unnormalizedFileUri = FileAccess.uriToFileUri(requestUri);
        // 3.) Strip anything from the URI that could result in
        //     relative paths (such as "..") by using `normalize`
        return normalize(unnormalizedFileUri.fsPath);
    }
    //#endregion
    //#region IPC Object URLs
    createIPCObjectUrl() {
        let obj = undefined;
        // Create unique URI
        const resource = URI.from({
            scheme: 'vscode', // used for all our IPC communication (vscode:<channel>)
            path: generateUuid()
        });
        // Install IPC handler
        const channel = resource.toString();
        const handler = async () => obj;
        validatedIpcMain.handle(channel, handler);
        this.logService.trace(`IPC Object URL: Registered new channel ${channel}.`);
        return {
            resource,
            update: updatedObj => obj = updatedObj,
            dispose: () => {
                this.logService.trace(`IPC Object URL: Removed channel ${channel}.`);
                validatedIpcMain.removeHandler(channel);
            }
        };
    }
};
ProtocolMainService = __decorate([
    __param(0, INativeEnvironmentService),
    __param(1, IUserDataProfilesService),
    __param(2, ILogService)
], ProtocolMainService);
export { ProtocolMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdG9jb2xNYWluU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3Byb3RvY29sL2VsZWN0cm9uLW1haW4vcHJvdG9jb2xNYWluU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQ25DLE9BQU8sRUFBRSxVQUFVLEVBQWUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUYsT0FBTyxFQUFFLEdBQUcsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkgsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDNUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDNUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDcEYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRXRELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBSXBGLElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW9CLFNBQVEsVUFBVTtJQU9sRCxZQUM0QixrQkFBOEQsRUFDL0QsdUJBQWlELEVBQzlELFVB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