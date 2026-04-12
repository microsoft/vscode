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
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ALL_EXTENSION_KINDS, ExtensionIdentifierMap } from '../../../../platform/extensions/common/extensions.js';
import { ExtensionsRegistry } from './extensionsRegistry.js';
import { getGalleryExtensionId } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { WORKSPACE_TRUST_EXTENSION_SUPPORT } from '../../workspaces/common/workspaceTrust.js';
import { isBoolean } from '../../../../base/common/types.js';
import { IWorkspaceTrustEnablementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { isWeb } from '../../../../base/common/platform.js';
export const IExtensionManifestPropertiesService = createDecorator('extensionManifestPropertiesService');
let ExtensionManifestPropertiesService = class ExtensionManifestPropertiesService extends Disposable {
    constructor(productService, configurationService, workspaceTrustEnablementService, logService) {
        super();
        this.productService = productService;
        this.configurationService = configurationService;
        this.workspaceTrustEnablementService = workspaceTrustEnablementService;
        this.logService = logService;
        this._extensionPointExtensionKindsMap = null;
        this._productExtensionKindsMap = null;
        this._configuredExtensionKindsMap = null;
        this._productVirtualWorkspaceSupportMap = null;
        this._configuredVirtualWorkspaceSupportMap = null;
        // Workspace trust request type (settings.json)
        this._configuredExtensionWorkspaceTrustRequestMap = new ExtensionIdentifierMap();
        const configuredExtensionWorkspaceTrustRequests = configurationService.inspect(WORKSPACE_TRUST_EXTENSION_SUPPORT).userValue || {};
        for (const id of Object.keys(configuredExtensionWorkspaceTrustRequests)) {
            this._configuredExtensionWorkspaceTrustRequestMap.set(id, configuredExtensionWorkspaceTrustRequests[id]);
        }
        // Workspace trust request type (product.json)
        this._productExtensionWorkspaceTrustRequestMap = new Map();
        if (productService.extensionUntrustedWorkspaceSupport) {
            for (const id of Object.keys(productService.extensionUntrustedWorkspaceSupport)) {
                this._productExtensionWorkspaceTrustRequestMap.set(id, productService.extensionUntrustedWorkspaceSupport[id]);
            }
        }
    }
    prefersExecuteOnUI(manifest) {
        const extensionKind = this.getExtensionKind(manifest);
        return (extensionKind.length > 0 && extensionKind[0] === 'ui');
    }
    prefersExecuteOnWorkspace(manifest) {
        const extensionKind = this.getExtensionKind(manifest);
        return (extensionKind.length > 0 && extensionKind[0] === 'workspace');
    }
    prefersExecuteOnWeb(manifest) {
        const extensionKind = this.getExtensionKind(manifest);
        return (extensionKind.length > 0 && extensionKind[0] === 'web');
    }
    canExecuteOnUI(manifest) {
        const extensionKind = this.getExtensionKind(manifest);
        return extensionKind.some(kind => kind === 'ui');
    }
    canExecuteOnWorkspace(manifest) {
        const extensionKind = this.getExtensionKind(manifest);
        return extensionKind.some(kind => kind === 'workspace');
    }
    canExecuteOnWeb(manifest) {
        const extensionKind = this.getExtensionKind(manifest);
        return extensionKind.some(kind => kind === 'web');
    }
    getExtensionKind(manifest) {
        const deducedExtensionKind = this.deduceExtensionKind(manifest);
        const configuredExtensionKind = this.getConfiguredExtensionKind(manifest);
        if (configuredExtensionKind && configuredExtensionKind.length > 0) {
            const result = [];
            for (const extensionKind of configuredExtensionKind) {
                if (extensionKind !== '-web') {
                    result.push(extensionKind);
                }
            }
            // If opted out from web without specifying other extension kinds then default to ui, workspace
            if (configuredExtensionKind.includes('-web') && !result.length) {
                result.push('ui');
                result.push('workspace');
            }
            // Add web kind if not opted out from web and can run in web
            if (isWeb && !configuredExtensionKind.includes('-web') && !configuredExtensionKind.includes('web') && deducedExtensionKind.includes('web')) {
                result.push('web');
            }
            return result;
        }
        return deducedExtensionKind;
    }
    getUserConfiguredExtensionKind(extensionIdentifier) {
        if (this._configuredExtensionKindsMap === null) {
            const configuredExtensionKindsMap = new ExtensionIdentifierMap();
            const configuredExtensionKinds = this.configurationService.getValue('remote.extensionKind') || {};
            for (const id of Object.keys(configuredExtensionKinds)) {
                configuredExtensionKindsMap.set(id, configuredExtensionKinds[id]);
            }
            this._configuredExtensionKindsMap = configuredExtensionKindsMap;
        }
        const userConfiguredExtensionKind = this._configuredExtensionKindsMap.get(extensionIdentifier.id);
        return userConfiguredExtensionKind ? this.toArray(userConfiguredExtensionKind) : undefined;
    }
    getExtensionUntrustedWorkspaceSupportType(manifest) {
        // Workspace trust feature is disabled, or extension has no entry point
        if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled() || !manifest.main) {
            return true;
        }
        // Get extension workspace trust requirements from settings.json
        const configuredWorkspaceTrustRequest = this.getConfiguredExtensionWorkspaceTrustRequest(manifest);
        // Get extension workspace trust requirements from product.json
        const productWorkspaceTrustRequest = this.getProductExtensionWorkspaceTrustRequest(manifest);
        // Use settings.json override value if it exists
        if (configuredWorkspaceTrustRequest !== undefined) {
            return configuredWorkspaceTrustRequest;
        }
        // Use product.json override value if it exists
        if (productWorkspaceTrustRequest?.override !== undefined) {
            return productWorkspaceTrustRequest.override;
        }
        // Use extension manifest value if it exists
        if (manifest.capabilities?.untrustedWorkspaces?.supported !== undefined) {
            return manifest.capabilities.untrustedWorkspaces.supported;
        }
        // Use product.json default value if it exists
        if (productWorkspaceTrustRequest?.default !== undefined) {
            return productWorkspaceTrustRequest.default;
        }
        return false;
    }
    getExtensionVirtualWorkspaceSupportType(manifest) {
        // check user configured
        const userConfiguredVirtualWorkspaceSupport = this.getConfiguredVirtualWorkspaceSupport(manifest);
        if (userConfiguredVirtualWorkspaceSupport !== undefined) {
            return userConfiguredVirtualWorkspaceSupport;
        }
        const productConfiguredWorkspaceSchemes = this.getProductVirtualWorkspaceSupport(manifest);
        // check override from product
        if (productConfiguredWorkspaceSchemes?.override !== undefined) {
            return productConfiguredWorkspaceSchemes.override;
        }
        // check the manifest
        const virtualWorkspaces = manifest.capabilities?.virtualWorkspaces;
        if (isBoolean(virtualWorkspaces)) {
            return virtualWorkspaces;
        }
        else if (virtualWorkspaces) {
            const supported = virtualWorkspaces.supported;
            if (isBoolean(supported) || supported === 'limited') {
                return supported;
            }
        }
        // check default from product
        if (productConfiguredWorkspaceSchemes?.default !== undefined) {
            return productConfiguredWorkspaceSchemes.default;
        }
        // Default - supports virtual workspace
        return true;
    }
    deduceExtensionKind(manifest) {
        // Not an UI extension if it has main
        if (manifest.main) {
            if (manifest.browser) {
                return isWeb ? ['workspace', 'web'] : ['workspace'];
            }
            return ['workspace'];
        }
        if (manifest.browser) {
            return ['web'];
        }
        let result = [...ALL_EXTENSION_KINDS];
        if (isNonEmptyArray(manifest.extensionPack) || isNonEmptyArray(manifest.extensionDependencies)) {
            // Extension pack defaults to [workspace, web] in web and only [workspace] in desktop
            result = isWeb ? ['workspace', 'web'] : ['workspace'];
        }
        if (manifest.contributes) {
            for (const contribution of Object.keys(manifest.contributes)) {
                const supportedExtensionKinds = this.getSupportedExtensionKindsForExtensionPoint(contribution);
                if (supportedExtensionKinds.length) {
                    result = result.filter(extensionKind => supportedExtensionKinds.includes(extensionKind));
                }
            }
        }
        if (!result.length) {
            this.logService.warn('Cannot deduce extensionKind for extension', getGalleryExtensionId(manifest.publisher, manifest.name));
        }
        return result;
    }
    getSupportedExtensionKindsForExtensionPoint(extensionPoint) {
        if (this._extensionPointExtensionKindsMap === null) {
            const extensionPointExtensionKindsMap = new Map();
            ExtensionsRegistry.getExtensionPoints().forEach(e => extensionPointExtensionKindsMap.set(e.name, e.defaultExtensionKind || [] /* supports all */));
            this._extensionPointExtensionKindsMap = extensionPointExtensionKindsMap;
        }
        let extensionPointExtensionKind = this._extensionPointExtensionKindsMap.get(extensionPoint);
        if (extensionPointExtensionKind) {
            return extensionPointExtensionKind;
        }
        extensionPointExtensionKind = this.productService.extensionPointExtensionKind ? this.productService.extensionPointExtensionKind[extensionPoint] : undefined;
        if (extensionPointExtensionKind) {
            return extensionPointExtensionKind;
        }
        /* Unknown extension point */
        return isWeb ? ['workspace', 'web'] : ['workspace'];
    }
    getConfiguredExtensionKind(manifest) {
        const extensionIdentifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };
        // check in config
        let result = this.getUserConfiguredExtensionKind(extensionIdentifier);
        if (typeof result !== 'undefined') {
            return this.toArray(result);
        }
        // check product.json
        result = this.getProductExtensionKind(manifest);
        if (typeof result !== 'undefined') {
            return result;
        }
        // check the manifest itself
        result = manifest.extensionKind;
        if (typeof result !== 'undefined') {
            result = this.toArray(result);
            return result.filter(r => ['ui', 'workspace'].includes(r));
        }
        return null;
    }
    getProductExtensionKind(manifest) {
        if (this._productExtensionKindsMap === null) {
            const productExtensionKindsMap = new ExtensionIdentifierMap();
            if (this.productService.extensionKind) {
                for (const id of Object.keys(this.productService.extensionKind)) {
                    productExtensionKindsMap.set(id, this.productService.extensionKind[id]);
                }
            }
            this._productExtensionKindsMap = productExtensionKindsMap;
        }
        const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
        return this._productExtensionKindsMap.get(extensionId);
    }
    getProductVirtualWorkspaceSupport(manifest) {
        if (this._productVirtualWorkspaceSupportMap === null) {
            const productWorkspaceSchemesMap = new ExtensionIdentifierMap();
            if (this.productService.extensionVirtualWorkspacesSupport) {
                for (const id of Object.keys(this.productService.extensionVirtualWorkspacesSupport)) {
                    productWorkspaceSchemesMap.set(id, this.productService.extensionVirtualWorkspacesSupport[id]);
                }
            }
            this._productVirtualWorkspaceSupportMap = productWorkspaceSchemesMap;
        }
        const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
        return this._productVirtualWorkspaceSupportMap.get(extensionId);
    }
    getConfiguredVirtualWorkspaceSupport(manifest) {
        if (this._configuredVirtualWorkspaceSupportMap === null) {
            const configuredWorkspaceSchemesMap = new ExtensionIdentifierMap();
            const configuredWorkspaceSchemes = this.configurationService.getValue('extensions.supportVirtualWorkspaces') || {};
            for (const id of Object.keys(configuredWorkspaceSchemes)) {
                if (configuredWorkspaceSchemes[id] !== undefined) {
                    configuredWorkspaceSchemesMap.set(id, configuredWorkspaceSchemes[id]);
                }
            }
            this._configuredVirtualWorkspaceSupportMap = configuredWorkspaceSchemesMap;
        }
        const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
        return this._configuredVirtualWorkspaceSupportMap.get(extensionId);
    }
    getConfiguredExtensionWorkspaceTrustRequest(manifest) {
        const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
        const extensionWorkspaceTrustRequest = this._configuredExtensionWorkspaceTrustRequestMap.get(extensionId);
        if (extensionWorkspaceTrustRequest && (extensionWorkspaceTrustRequest.version === undefined || extensionWorkspaceTrustRequest.version === manifest.version)) {
            return extensionWorkspaceTrustRequest.supported;
        }
        return undefined;
    }
    getProductExtensionWorkspaceTrustRequest(manifest) {
        const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
        return this._productExtensionWorkspaceTrustRequestMap.get(extensionId);
    }
    toArray(extensionKind) {
        if (Array.isArray(extensionKind)) {
            return extensionKind;
        }
        return extensionKind === 'ui' ? ['ui', 'workspace'] : [extensionKind];
    }
};
ExtensionManifestPropertiesService = __decorate([
    __param(0, IProductService),
    __param(1, IConfigurationService),
    __param(2, IWorkspaceTrustEnablementService),
    __param(3, ILogService)
], ExtensionManifestPropertiesService);
export { ExtensionManifestPropertiesService };
registerSingleton(IExtensionManifestPropertiesService, ExtensionManifestPropertiesService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBMEgsbUJBQW1CLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUUzTyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0RUFBNEUsQ0FBQztBQUNuSCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFL0csT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzlGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMzRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTVELE1BQU0sQ0FBQyxN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