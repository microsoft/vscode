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
var AbstractPathService_1;
import { isValidBasename } from '../../../../base/common/extpath.js';
import { Schemas } from '../../../../base/common/network.js';
import { win32, posix } from '../../../../base/common/path.js';
import { OS } from '../../../../base/common/platform.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { getVirtualWorkspaceScheme } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
export const IPathService = createDecorator('pathService');
let AbstractPathService = AbstractPathService_1 = class AbstractPathService {
    constructor(localUserHome, remoteAgentService, environmentService, contextService) {
        this.localUserHome = localUserHome;
        this.remoteAgentService = remoteAgentService;
        this.environmentService = environmentService;
        this.contextService = contextService;
        // OS
        this.resolveOS = (async () => {
            const env = await this.remoteAgentService.getEnvironment();
            return env?.os || OS;
        })();
        // User Home
        this.resolveUserHome = (async () => {
            const env = await this.remoteAgentService.getEnvironment();
            const userHome = this.maybeUnresolvedUserHome = env?.userHome ?? localUserHome;
            return userHome;
        })();
    }
    hasValidBasename(resource, arg2, basename) {
        // async version
        if (typeof arg2 === 'string' || typeof arg2 === 'undefined') {
            return this.resolveOS.then(os => this.doHasValidBasename(resource, os, arg2));
        }
        // sync version
        return this.doHasValidBasename(resource, arg2, basename);
    }
    doHasValidBasename(resource, os, name) {
        // Our `isValidBasename` method only works with our
        // standard schemes for files on disk, either locally
        // or remote.
        if (resource.scheme === Schemas.file || resource.scheme === Schemas.vscodeRemote) {
            return isValidBasename(name ?? basename(resource), os === 1 /* OperatingSystem.Windows */);
        }
        return true;
    }
    get defaultUriScheme() {
        return AbstractPathService_1.findDefaultUriScheme(this.environmentService, this.contextService);
    }
    static findDefaultUriScheme(environmentService, contextService) {
        if (environmentService.remoteAuthority) {
            return Schemas.vscodeRemote;
        }
        const virtualWorkspace = getVirtualWorkspaceScheme(contextService.getWorkspace());
        if (virtualWorkspace) {
            return virtualWorkspace;
        }
        const firstFolder = contextService.getWorkspace().folders[0];
        if (firstFolder) {
            return firstFolder.uri.scheme;
        }
        const configuration = contextService.getWorkspace().configuration;
        if (configuration) {
            return configuration.scheme;
        }
        return Schemas.file;
    }
    userHome(options) {
        return options?.preferLocal ? this.localUserHome : this.resolveUserHome;
    }
    get resolvedUserHome() {
        return this.maybeUnresolvedUserHome;
    }
    get path() {
        return this.resolveOS.then(os => {
            return os === 1 /* OperatingSystem.Windows */ ?
                win32 :
                posix;
        });
    }
    async fileURI(_path) {
        let authority = '';
        // normalize to fwd-slashes on windows,
        // on other systems bwd-slashes are valid
        // filename character, eg /f\oo/ba\r.txt
        const os = await this.resolveOS;
        if (os === 1 /* OperatingSystem.Windows */) {
            _path = _path.replace(/\\/g, '/');
        }
        // check for authority as used in UNC shares
        // or use the path as given
        if (_path[0] === '/' && _path[1] === '/') {
            const idx = _path.indexOf('/', 2);
            if (idx === -1) {
                authority = _path.substring(2);
                _path = '/';
            }
            else {
                authority = _path.substring(2, idx);
                _path = _path.substring(idx) || '/';
            }
        }
        return URI.from({
            scheme: Schemas.file,
            authority,
            path: _path,
            query: '',
            fragment: ''
        });
    }
};
AbstractPathService = AbstractPathService_1 = __decorate([
    __param(1, IRemoteAgentService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, IWorkspaceContextService)
], AbstractPathService);
export { AbstractPathService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF0aFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFTLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN0RSxPQUFPLEVBQW1CLEVBQUUsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRWhGLE1BQU0sQ0FBQyxNQUFNLFlBQVksR0FBRyxlQUFlLENBQWUsYUFBYSxDQUFDLENBQUM7QUErRGxFLElBQWUsbUJBQW1CLDJCQUFsQyxNQUFlLG1CQUFtQjtJQVN4QyxZQUNTLGFBQWtCLEVBQ1ksa0JBQXVDLEVBQzlCLGtCQUFnRCxFQUM3RCxjQUF3QztRQUhsRSxrQkFBYSxHQUFiLGFBQWEsQ0FBSztRQUNZLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7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