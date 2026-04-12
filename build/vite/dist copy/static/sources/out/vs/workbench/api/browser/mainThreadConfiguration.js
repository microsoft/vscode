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
import { URI } from '../../../base/common/uri.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, getScopes } from '../../../platform/configuration/common/configurationRegistry.js';
import { IWorkspaceContextService } from '../../../platform/workspace/common/workspace.js';
import { MainContext, ExtHostContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
let MainThreadConfiguration = class MainThreadConfiguration {
    constructor(extHostContext, _workspaceContextService, configurationService, _environmentService) {
        this._workspaceContextService = _workspaceContextService;
        this.configurationService = configurationService;
        this._environmentService = _environmentService;
        const proxy = extHostContext.getProxy(ExtHostContext.ExtHostConfiguration);
        proxy.$initializeConfiguration(this._getConfigurationData());
        this._configurationListener = configurationService.onDidChangeConfiguration(e => {
            proxy.$acceptConfigurationChanged(this._getConfigurationData(), e.change);
        });
    }
    _getConfigurationData() {
        const configurationData = { ...(this.configurationService.getConfigurationData()), configurationScopes: [] };
        // Send configurations scopes only in development mode.
        if (!this._environmentService.isBuilt || this._environmentService.isExtensionDevelopment) {
            configurationData.configurationScopes = getScopes();
        }
        return configurationData;
    }
    dispose() {
        this._configurationListener.dispose();
    }
    $updateConfigurationOption(target, key, value, overrides, scopeToLanguage) {
        overrides = { resource: overrides?.resource ? URI.revive(overrides.resource) : undefined, overrideIdentifier: overrides?.overrideIdentifier };
        return this.writeConfiguration(target, key, value, overrides, scopeToLanguage);
    }
    $removeConfigurationOption(target, key, overrides, scopeToLanguage) {
        overrides = { resource: overrides?.resource ? URI.revive(overrides.resource) : undefined, overrideIdentifier: overrides?.overrideIdentifier };
        return this.writeConfiguration(target, key, undefined, overrides, scopeToLanguage);
    }
    writeConfiguration(target, key, value, overrides, scopeToLanguage) {
        target = target !== null && target !== undefined ? target : this.deriveConfigurationTarget(key, overrides);
        const configurationValue = this.configurationService.inspect(key, overrides);
        switch (target) {
            case 8 /* ConfigurationTarget.MEMORY */:
                return this._updateValue(key, value, target, configurationValue?.memory?.override, overrides, scopeToLanguage);
            case 6 /* ConfigurationTarget.WORKSPACE_FOLDER */:
                return this._updateValue(key, value, target, configurationValue?.workspaceFolder?.override, overrides, scopeToLanguage);
            case 5 /* ConfigurationTarget.WORKSPACE */:
                return this._updateValue(key, value, target, configurationValue?.workspace?.override, overrides, scopeToLanguage);
            case 4 /* ConfigurationTarget.USER_REMOTE */:
                return this._updateValue(key, value, target, configurationValue?.userRemote?.override, overrides, scopeToLanguage);
            default:
                return this._updateValue(key, value, target, configurationValue?.userLocal?.override, overrides, scopeToLanguage);
        }
    }
    _updateValue(key, value, configurationTarget, overriddenValue, overrides, scopeToLanguage) {
        overrides = scopeToLanguage === true ? overrides
            : scopeToLanguage === false ? { resource: overrides.resource }
                : overrides.overrideIdentifier && overriddenValue !== undefined ? overrides
                    : { resource: overrides.resource };
        return this.configurationService.updateValue(key, value, overrides, configurationTarget, { donotNotifyError: true });
    }
    deriveConfigurationTarget(key, overrides) {
        if (overrides.resource && this._workspaceContextService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */) {
            const configurationProperties = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
            if (configurationProperties[key] && (configurationProperties[key].scope === 5 /* ConfigurationScope.RESOURCE */ || configurationProperties[key].scope === 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */)) {
                return 6 /* ConfigurationTarget.WORKSPACE_FOLDER */;
            }
        }
        return 5 /* ConfigurationTarget.WORKSPACE */;
    }
};
MainThreadConfiguration = __decorate([
    extHostNamedCustomer(MainContext.MainThreadConfiguration),
    __param(1, IWorkspaceContextService),
    __param(2, IConfigurationService),
    __param(3, IEnvironmentService)
], MainThreadConfiguration);
export { MainThreadConfiguration };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENvbmZpZ3VyYXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZENvbmZpZ3VyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRWxELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RSxPQUFPLEVBQTBCLFVBQVUsSUFBSSx1QkFBdUIsRUFBc0IsU0FBUyxFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDL0ssT0FBTyxFQUFFLHdCQUF3QixFQUFrQixNQUFNLGlEQUFpRCxDQUFDO0FBQzNHLE9BQU8sRUFBZ0MsV0FBVyxFQUFFLGNBQWMsRUFBMEIsTUFBTSwrQkFBK0IsQ0FBQztBQUNsSSxPQUFPLEVBQUUsb0JBQW9CLEVBQW1CLE1BQU0sc0RBQXNELENBQUM7QUFDN0csT0FBTyxFQUF1QixxQkFBcUIsRUFBMkIsTUFBTSx5REFBeUQsQ0FBQztBQUM5SSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUduRixJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF1QjtJQUluQyxZQUNDLGNBQStCLEVBQ1ksd0JBQWtELEVBQ3JELG9CQUEyQyxFQUM3QyxtQkFBd0M7UUFGbkMsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEwQjtRQUNyRCx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQzdDLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFFOUUsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUUzRSxLQUFLLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFD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