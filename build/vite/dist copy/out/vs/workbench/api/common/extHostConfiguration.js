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
import { mixin, deepClone } from '../../../base/common/objects.js';
import { Emitter } from '../../../base/common/event.js';
import { IExtHostWorkspace } from './extHostWorkspace.js';
import { MainContext } from './extHost.protocol.js';
import { ConfigurationTarget as ExtHostConfigurationTarget } from './extHostTypes.js';
import { Configuration, ConfigurationChangeEvent } from '../../../platform/configuration/common/configurationModels.js';
import { OVERRIDE_PROPERTY_REGEX } from '../../../platform/configuration/common/configurationRegistry.js';
import { isObject } from '../../../base/common/types.js';
import { Barrier } from '../../../base/common/async.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { URI } from '../../../base/common/uri.js';
function lookUp(tree, key) {
    if (key) {
        const parts = key.split('.');
        let node = tree;
        for (let i = 0; node && i < parts.length; i++) {
            node = node[parts[i]];
        }
        return node;
    }
    return undefined;
}
function isUri(thing) {
    return thing instanceof URI;
}
function isResourceLanguage(thing) {
    return isObject(thing)
        && thing.uri instanceof URI
        && !!thing.languageId
        && typeof thing.languageId === 'string';
}
function isLanguage(thing) {
    return isObject(thing)
        && !thing.uri
        && !!thing.languageId
        && typeof thing.languageId === 'string';
}
function isWorkspaceFolder(thing) {
    return isObject(thing)
        && thing.uri instanceof URI
        && (!thing.name || typeof thing.name === 'string')
        && (!thing.index || typeof thing.index === 'number');
}
function scopeToOverrides(scope) {
    if (isUri(scope)) {
        return { resource: scope };
    }
    if (isResourceLanguage(scope)) {
        return { resource: scope.uri, overrideIdentifier: scope.languageId };
    }
    if (isLanguage(scope)) {
        return { overrideIdentifier: scope.languageId };
    }
    if (isWorkspaceFolder(scope)) {
        return { resource: scope.uri };
    }
    if (scope === null) {
        return { resource: null };
    }
    return undefined;
}
let ExtHostConfiguration = class ExtHostConfiguration {
    constructor(extHostRpc, extHostWorkspace, logService) {
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadConfiguration);
        this._extHostWorkspace = extHostWorkspace;
        this._logService = logService;
        this._barrier = new Barrier();
        this._actual = null;
    }
    getConfigProvider() {
        return this._barrier.wait().then(_ => this._actual);
    }
    $initializeConfiguration(data) {
        this._actual = new ExtHostConfigProvider(this._proxy, this._extHostWorkspace, data, this._logService);
        this._barrier.open();
    }
    $acceptConfigurationChanged(data, change) {
        this.getConfigProvider().then(provider => provider.$acceptConfigurationChanged(data, change));
    }
};
ExtHostConfiguration = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostWorkspace),
    __param(2, ILogService)
], ExtHostConfiguration);
export { ExtHostConfiguration };
export class ExtHostConfigProvider {
    constructor(proxy, extHostWorkspace, data, logService) {
        this._onDidChangeConfiguration = new Emitter();
        this._proxy = proxy;
        this._logService = logService;
        this._extHostWorkspace = extHostWorkspace;
        this._configuration = Configuration.parse(data, logService);
        this._configurationScopes = this._toMap(data.configurationScopes);
    }
    get onDidChangeConfiguration() {
        return this._onDidChangeConfiguration && this._onDidChangeConfiguration.event;
    }
    $acceptConfigurationChanged(data, change) {
        const previous = { data: this._configuration.toData(), workspace: this._extHostWorkspace.workspace };
        this._configuration = Configuration.parse(data, this._logService);
        this._configurationScopes = this._toMap(data.configurationScopes);
        this._onDidChangeConfiguration.fire(this._toConfigurationChangeEvent(change, previous));
    }
    getConfiguration(section, scope, extensionDescription) {
        const overrides = scopeToOverrides(scope) || {};
        const config = this._toReadonlyValue(this._configuration.getValue(section, overrides, this._extHostWorkspace.workspace));
        if (section) {
            this._validateConfigurationAccess(section, overrides, extensionDescription?.identifier);
        }
        function parseConfigurationTarget(arg) {
            if (arg === undefined || arg === null) {
                return null;
            }
            if (typeof arg === 'boolean') {
                return arg ? 2 /* ConfigurationTarget.USER */ : 5 /* ConfigurationTarget.WORKSPACE */;
            }
            switch (arg) {
                case ExtHostConfigurationTarget.Global: return 2 /* ConfigurationTarget.USER */;
                case ExtHostConfigurationTarget.Workspace: return 5 /* ConfigurationTarget.WORKSPACE */;
                case ExtHostConfigurationTarget.WorkspaceFolder: return 6 /* ConfigurationTarget.WORKSPACE_FOLDER */;
            }
        }
        const result = {
            has(key) {
                return typeof lookUp(config, key) !== 'undefined';
            },
            get: (key, defaultValue) => {
                this._validateConfigurationAccess(section ? `${section}.${key}` : key, overrides, extensionDescription?.identifier);
                let result = lookUp(config, key);
                if (typeof result === 'undefined') {
                    result = defaultValue;
                }
                else {
                    let clonedConfig = undefined;
                    const cloneOnWriteProxy = (target, accessor) => {
                        if (isObject(target)) {
                            let clonedTarget = undefined;
                            const cloneTarget = () => {
                                clonedConfig = clonedConfig ? clonedConfig : deepClone(config);
                                clonedTarget = clonedTarget ? clonedTarget : lookUp(clonedConfig, accessor);
                            };
                            return new Proxy(target, {
                                get: (target, property) => {
                                    if (typeof property === 'string' && property.toLowerCase() === 'tojson') {
                                        cloneTarget();
                                        return () => clonedTarget;
                                    }
                                    if (clonedConfig) {
                                        clonedTarget = clonedTarget ? clonedTarget : lookUp(clonedConfig, accessor);
                                        return clonedTarget[property];
                                    }
                                    const result = target[property];
                                    if (typeof property === 'string') {
                                        return cloneOnWriteProxy(result, `${accessor}.${property}`);
                                    }
                                    return result;
                                },
                                set: (_target, property, value) => {
                                    cloneTarget();
                                    if (clonedTarget) {
                                        clonedTarget[property] = value;
                                    }
                                    return true;
                                },
                                deleteProperty: (_target, property) => {
                                    cloneTarget();
                                    if (clonedTarget) {
                                        delete clonedTarget[property];
                                    }
                                    return true;
                                },
                                defineProperty: (_target, property, descriptor) => {
                                    cloneTarget();
                                    if (clonedTarget) {
                                        Object.defineProperty(clonedTarget, property, descriptor);
                                    }
                                    return true;
                                }
                            });
                        }
                        if (Array.isArray(target)) {
                            return deepClone(target);
                        }
                        return target;
                    };
                    result = cloneOnWriteProxy(result, key);
                }
                return result;
            },
            update: (key, value, extHostConfigurationTarget, scopeToLanguage) => {
                key = section ? `${section}.${key}` : key;
                const target = parseConfigurationTarget(extHostConfigurationTarget);
                if (value !== undefined) {
                    return this._proxy.$updateConfigurationOption(target, key, value, overrides, scopeToLanguage);
                }
                else {
                    return this._proxy.$removeConfigurationOption(target, key, overrides, scopeToLanguage);
                }
            },
            inspect: (key) => {
                key = section ? `${section}.${key}` : key;
                const config = this._configuration.inspect(key, overrides, this._extHostWorkspace.workspace);
                if (config) {
                    return {
                        key,
                        defaultValue: deepClone(config.policy?.value ?? config.default?.value),
                        globalLocalValue: deepClone(config.userLocal?.value),
                        globalRemoteValue: deepClone(config.userRemote?.value),
                        globalValue: deepClone(config.user?.value ?? config.application?.value),
                        workspaceValue: deepClone(config.workspace?.value),
                        workspaceFolderValue: deepClone(config.workspaceFolder?.value),
                        defaultLanguageValue: deepClone(config.default?.override),
                        globalLocalLanguageValue: deepClone(config.userLocal?.override),
                        globalRemoteLanguageValue: deepClone(config.userRemote?.override),
                        globalLanguageValue: deepClone(config.user?.override ?? config.application?.override),
                        workspaceLanguageValue: deepClone(config.workspace?.override),
                        workspaceFolderLanguageValue: deepClone(config.workspaceFolder?.override),
                        languageIds: deepClone(config.overrideIdentifiers)
                    };
                }
                return undefined;
            }
        };
        if (typeof config === 'object') {
            mixin(result, config, false);
        }
        return Object.freeze(result);
    }
    _toReadonlyValue(result) {
        const readonlyProxy = (target) => {
            return isObject(target) ?
                new Proxy(target, {
                    get: (target, property) => readonlyProxy(target[property]),
                    set: (_target, property, _value) => { throw new Error(`TypeError: Cannot assign to read only property '${String(property)}' of object`); },
                    deleteProperty: (_target, property) => { throw new Error(`TypeError: Cannot delete read only property '${String(property)}' of object`); },
                    defineProperty: (_target, property) => { throw new Error(`TypeError: Cannot define property '${String(property)}' for a readonly object`); },
                    setPrototypeOf: (_target) => { throw new Error(`TypeError: Cannot set prototype for a readonly object`); },
                    isExtensible: () => false,
                    preventExtensions: () => true
                }) : target;
        };
        return readonlyProxy(result);
    }
    _validateConfigurationAccess(key, overrides, extensionId) {
        const scope = OVERRIDE_PROPERTY_REGEX.test(key) ? 5 /* ConfigurationScope.RESOURCE */ : this._configurationScopes.get(key);
        const extensionIdText = extensionId ? `[${extensionId.value}] ` : '';
        if (5 /* ConfigurationScope.RESOURCE */ === scope) {
            if (typeof overrides?.resource === 'undefined') {
                this._logService.warn(`${extensionIdText}Accessing a resource scoped configuration without providing a resource is not expected. To get the effective value for '${key}', provide the URI of a resource or 'null' for any resource.`);
            }
            return;
        }
        if (4 /* ConfigurationScope.WINDOW */ === scope) {
            if (overrides?.resource) {
                this._logService.warn(`${extensionIdText}Accessing a window scoped configuration for a resource is not expected. To associate '${key}' to a resource, define its scope to 'resource' in configuration contributions in 'package.json'.`);
            }
            return;
        }
    }
    _toConfigurationChangeEvent(change, previous) {
        const event = new ConfigurationChangeEvent(change, previous, this._configuration, this._extHostWorkspace.workspace, this._logService);
        return Object.freeze({
            affectsConfiguration: (section, scope) => event.affectsConfiguration(section, scopeToOverrides(scope))
        });
    }
    _toMap(scopes) {
        return scopes.reduce((result, scope) => { result.set(scope[0], scope[1]); return result; }, new Map());
    }
}
export const IExtHostConfiguration = createDecorator('IExtHostConfiguration');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdENvbmZpZ3VyYXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0Q29uZmlndXJhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ25FLE9BQU8sRUFBUyxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUUvRCxPQUFPLEVBQW9CLGlCQUFpQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUUsT0FBTyxFQUFtRixXQUFXLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNySSxPQUFPLEVBQUUsbUJBQW1CLElBQUksMEJBQTBCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUV0RixPQUFPLEVBQUUsYUFBYSxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDeEgsT0FBTyxFQUFzQix1QkFBdUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQzlILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzVELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUVsRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFbEQsU0FBUyxNQUFNLENBQUMsSUFBYSxFQUFFLEdBQVc7SUFDekMsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNULE1BQU0sS0FBSyxHQUFHLEdBQUcs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