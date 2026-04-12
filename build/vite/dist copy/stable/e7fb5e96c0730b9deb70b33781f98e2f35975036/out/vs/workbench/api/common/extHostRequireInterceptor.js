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
var NodeModuleAliasingModuleFactory_1;
import * as performance from '../../../base/common/performance.js';
import { URI } from '../../../base/common/uri.js';
import { MainContext } from './extHost.protocol.js';
import { IExtHostConfiguration } from './extHostConfiguration.js';
import { nullExtensionDescription } from '../../services/extensions/common/extensions.js';
import { ExtensionIdentifierMap } from '../../../platform/extensions/common/extensions.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostExtensionService } from './extHostExtensionService.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';
let RequireInterceptor = class RequireInterceptor {
    constructor(_apiFactory, _extensionRegistry, _instaService, _extHostConfiguration, _extHostExtensionService, _initData, _logService) {
        this._apiFactory = _apiFactory;
        this._extensionRegistry = _extensionRegistry;
        this._instaService = _instaService;
        this._extHostConfiguration = _extHostConfiguration;
        this._extHostExtensionService = _extHostExtensionService;
        this._initData = _initData;
        this._logService = _logService;
        this._factories = new Map();
        this._alternatives = [];
    }
    async install() {
        this._installInterceptor();
        performance.mark('code/extHost/willWaitForConfig');
        const configProvider = await this._extHostConfiguration.getConfigProvider();
        performance.mark('code/extHost/didWaitForConfig');
        const extensionPaths = await this._extHostExtensionService.getExtensionPathIndex();
        this.register(new VSCodeNodeModuleFactory(this._apiFactory, extensionPaths, this._extensionRegistry, configProvider, this._logService));
        this.register(this._instaService.createInstance(NodeModuleAliasingModuleFactory));
        if (this._initData.remote.isRemote) {
            this.register(this._instaService.createInstance(OpenNodeModuleFactory, extensionPaths, this._initData.environment.appUriScheme));
        }
    }
    register(interceptor) {
        if ('nodeModuleName' in interceptor) {
            if (Array.isArray(interceptor.nodeModuleName)) {
                for (const moduleName of interceptor.nodeModuleName) {
                    this._factories.set(moduleName, interceptor);
                }
            }
            else {
                this._factories.set(interceptor.nodeModuleName, interceptor);
            }
        }
        if (typeof interceptor.alternativeModuleName === 'function') {
            this._alternatives.push((moduleName) => {
                return interceptor.alternativeModuleName(moduleName);
            });
        }
    }
};
RequireInterceptor = __decorate([
    __param(2, IInstantiationService),
    __param(3, IExtHostConfiguration),
    __param(4, IExtHostExtensionService),
    __param(5, IExtHostInitDataService),
    __param(6, ILogService)
], RequireInterceptor);
export { RequireInterceptor };
//#region --- module renames
let NodeModuleAliasingModuleFactory = class NodeModuleAliasingModuleFactory {
    static { NodeModuleAliasingModuleFactory_1 = this; }
    /**
     * Map of aliased internal node_modules, used to allow for modules to be
     * renamed without breaking extensions. In the form "original -> new name".
     */
    static { this.aliased = new Map([
        ['vscode-ripgrep', '@vscode/ripgrep'],
        ['vscode-windows-registry', '@vscode/windows-registry'],
    ]); }
    constructor(initData) {
        if (initData.environment.appRoot && NodeModuleAliasingModuleFactory_1.aliased.size) {
            const root = escapeRegExpCharacters(this.forceForwardSlashes(initData.environment.appRoot.fsPath));
            // decompose ${appRoot}/node_modules/foo/bin to ['${appRoot}/node_modules/', 'foo', '/bin'],
            // and likewise the more complex form ${appRoot}/node_modules.asar.unpacked/@vcode/foo/bin
            // to ['${appRoot}/node_modules.asar.unpacked/',' @vscode/foo', '/bin'].
            const npmIdChrs = `[a-z0-9_.-]`;
            const npmModuleName = `@${npmIdChrs}+\\/${npmIdChrs}+|${npmIdChrs}+`;
            const moduleFolders = 'node_modules|node_modules\\.asar(?:\\.unpacked)?';
            this.re = new RegExp(`^(${root}/${moduleFolders}\\/)(${npmModuleName})(.*)$`, 'i');
        }
    }
    alternativeModuleName(name) {
        if (!this.re) {
            return;
        }
        const result = this.re.exec(this.forceForwardSlashes(name));
        if (!result) {
            return;
        }
        const [, prefix, moduleName, suffix] = result;
        const dealiased = NodeModuleAliasingModuleFactory_1.aliased.get(moduleName);
        if (dealiased === undefined) {
            return;
        }
        console.warn(`${moduleName} as been renamed to ${dealiased}, please update your imports`);
        return prefix + dealiased + suffix;
    }
    forceForwardSlashes(str) {
        return str.replace(/\\/g, '/');
    }
};
NodeModuleAliasingModuleFactory = NodeModuleAliasingModuleFactory_1 = __decorate([
    __param(0, IExtHostInitDataService)
], NodeModuleAliasingModuleFactory);
//#endregion
//#region --- vscode-module
class VSCodeNodeModuleFactory {
    constructor(_apiFactory, _extensionPaths, _extensionRegistry, _configProvider, _logService) {
        this._apiFactory = _apiFactory;
        this._extensionPaths = _extensionPaths;
        this._extensionRegistry = _extensionRegistry;
        this._configProvider = _configProvider;
        this._logService = _logService;
        this.nodeModuleName = 'vscode';
        this._extApiImpl = new ExtensionIdentifierMap();
    }
    load(_request, parent) {
        // get extension id from filename and api for extension
        const ext = this._extensionPaths.findSubstr(parent);
        if (ext) {
            let apiImpl = this._extApiImpl.get(ext.identifier);
            if (!apiImpl) {
                apiImpl = this._apiFactory(ext, this._extensionRegistry, this._configProvider);
                this._extApiImpl.set(ext.identifier, apiImpl);
            }
            return apiImpl;
        }
        // fall back to a default implementation
        if (!this._defaultApiImpl) {
            let extensionPathsPretty = '';
            this._extensionPaths.forEach((value, index) => extensionPathsPretty += `\t${index} -> ${value.identifier.value}\n`);
            this._logService.warn(`Could not identify extension for 'vscode' require call from ${parent}. These are the extension path mappings: \n${extensionPathsPretty}`);
            this._defaultApiImpl = this._apiFactory(nullExtensionDescription, this._extensionRegistry, this._configProvider);
        }
        return this._defaultApiImpl;
    }
}
let OpenNodeModuleFactory = class OpenNodeModuleFactory {
    constructor(_extensionPaths, _appUriScheme, rpcService) {
        this._extensionPaths = _extensionPaths;
        this._appUriScheme = _appUriScheme;
        this.nodeModuleName = ['open', 'opn'];
        this._mainThreadTelemetry = rpcService.getProxy(MainContext.MainThreadTelemetry);
        const mainThreadWindow = rpcService.getProxy(MainContext.MainThreadWindow);
        this._impl = (target, options) => {
            const uri = URI.parse(target);
            // If we have options use the original method.
            if (options) {
                return this.callOriginal(target, options);
            }
            if (uri.scheme === 'http' || uri.scheme === 'https') {
                return mainThreadWindow.$openUri(uri, target, { allowTunneling: true });
            }
            else if (uri.scheme === 'mailto' || uri.scheme === this._appUriScheme) {
                return mainThreadWindow.$openUri(uri, target, {});
            }
            return this.callOriginal(target, options);
        };
    }
    load(request, parent, original) {
        // get extension id from filename and api for extension
        const extension = this._extensionPaths.findSubstr(parent);
        if (extension) {
            this._extensionId = extension.identifier.value;
            this.sendShimmingTelemetry();
        }
        this._original = original(request);
        return this._impl;
    }
    callOriginal(target, options) {
        this.sendNoForwardTelemetry();
        return this._original(target, options);
    }
    sendShimmingTelemetry() {
        if (!this._extensionId) {
            return;
        }
        this._mainThreadTelemetry.$publicLog2('shimming.open', { extension: this._extensionId });
    }
    sendNoForwardTelemetry() {
        if (!this._extensionId) {
            return;
        }
        this._mainThreadTelemetry.$publicLog2('shimming.open.call.noForward', { extension: this._extensionId });
    }
};
OpenNodeModuleFactory = __decorate([
    __param(2, IExtHostRpcService)
], OpenNodeModuleFactory);
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFJlcXVpcmVJbnRlcmNlcHRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RSZXF1aXJlSW50ZXJjZXB0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxXQUFXLE1BQU0scUNBQXFDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBNEIsV0FBVyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDOUUsT0FBTyxFQUF5QixxQkFBcUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3pGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRTNGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzVELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3RFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBa0Isd0JBQXdCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN4RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFnQmxFLElBQWUsa0JBQWtCLEdBQWpDLE1BQWUsa0JBQWtCO0lBS3ZDLFlBQ1MsV0FBaUMsRUFDakMsa0JBQXdDLEVBQ1IsYUFBb0MsRUFDcEMscUJBQTRDLEVBQ3pDLHdCQUFrRCxFQUNuRCxTQUFrQyxFQUM5QyxXQUF3QjtRQU45QyxnQkFBVyxHQUFYLFdBQVcs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