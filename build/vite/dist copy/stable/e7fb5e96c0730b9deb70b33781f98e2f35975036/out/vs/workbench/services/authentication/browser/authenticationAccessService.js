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
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
export const IAuthenticationAccessService = createDecorator('IAuthenticationAccessService');
// TODO@TylerLeonhardt: Move this class to MainThreadAuthentication
// TODO@TylerLeonhardt: Should this class only keep track of allowed things and throw away disallowed ones?
let AuthenticationAccessService = class AuthenticationAccessService extends Disposable {
    constructor(_storageService, _productService) {
        super();
        this._storageService = _storageService;
        this._productService = _productService;
        this._onDidChangeExtensionSessionAccess = this._register(new Emitter());
        this.onDidChangeExtensionSessionAccess = this._onDidChangeExtensionSessionAccess.event;
    }
    isAccessAllowed(providerId, accountName, extensionId) {
        const trustedExtensionAuthAccess = this._productService.trustedExtensionAuthAccess;
        const extensionKey = ExtensionIdentifier.toKey(extensionId);
        if (Array.isArray(trustedExtensionAuthAccess)) {
            if (trustedExtensionAuthAccess.includes(extensionKey)) {
                return true;
            }
        }
        else if (trustedExtensionAuthAccess?.[providerId]?.includes(extensionKey)) {
            return true;
        }
        const allowList = this.readAllowedExtensions(providerId, accountName);
        const extensionData = allowList.find(extension => extension.id === extensionKey);
        if (!extensionData) {
            return undefined;
        }
        // This property didn't exist on this data previously, inclusion in the list at all indicates allowance
        return extensionData.allowed !== undefined
            ? extensionData.allowed
            : true;
    }
    readAllowedExtensions(providerId, accountName) {
        let trustedExtensions = [];
        try {
            const trustedExtensionSrc = this._storageService.get(`${providerId}-${accountName}`, -1 /* StorageScope.APPLICATION */);
            if (trustedExtensionSrc) {
                trustedExtensions = JSON.parse(trustedExtensionSrc);
            }
        }
        catch (err) { }
        // Add trusted extensions from product.json if they're not already in the list
        const trustedExtensionAuthAccess = this._productService.trustedExtensionAuthAccess;
        const trustedExtensionIds = 
        // Case 1: trustedExtensionAuthAccess is an array
        Array.isArray(trustedExtensionAuthAccess)
            ? trustedExtensionAuthAccess
            // Case 2: trustedExtensionAuthAccess is an object
            : typeof trustedExtensionAuthAccess === 'object'
                ? trustedExtensionAuthAccess[providerId] ?? []
                : [];
        for (const extensionId of trustedExtensionIds) {
            const extensionKey = ExtensionIdentifier.toKey(extensionId);
            const existingExtension = trustedExtensions.find(extension => extension.id === extensionKey);
            if (!existingExtension) {
                // Add new trusted extension (name will be set by caller if they have extension info)
                trustedExtensions.push({
                    id: extensionKey,
                    name: extensionId, // Use original casing for display name
                    allowed: true,
                    trusted: true
                });
            }
            else {
                // Update existing extension to be trusted
                existingExtension.allowed = true;
                existingExtension.trusted = true;
            }
        }
        return trustedExtensions;
    }
    updateAllowedExtensions(providerId, accountName, extensions) {
        const allowList = this.readAllowedExtensions(providerId, accountName);
        for (const extension of extensions) {
            const extensionKey = ExtensionIdentifier.toKey(extension.id);
            const index = allowList.findIndex(e => e.id === extensionKey);
            if (index === -1) {
                allowList.push({
                    ...extension,
                    id: extensionKey
                });
            }
            else {
                allowList[index].allowed = extension.allowed;
                // Update name if provided and not already set to a proper name
                if (extension.name && extension.name !== extensionKey && allowList[index].name !== extension.name) {
                    allowList[index].name = extension.name;
                }
            }
        }
        // Filter out trusted extensions before storing - they should only come from product.json, not user storage
        const userManagedExtensions = allowList.filter(extension => !extension.trusted);
        this._storageService.store(`${providerId}-${accountName}`, JSON.stringify(userManagedExtensions), -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        this._onDidChangeExtensionSessionAccess.fire({ providerId, accountName });
    }
    removeAllowedExtensions(providerId, accountName) {
        this._storageService.remove(`${providerId}-${accountName}`, -1 /* StorageScope.APPLICATION */);
        this._onDidChangeExtensionSessionAccess.fire({ providerId, accountName });
    }
};
AuthenticationAccessService = __decorate([
    __param(0, IStorageService),
    __param(1, IProductService)
], AuthenticationAccessService);
export { AuthenticationAccessService };
registerSingleton(IAuthenticationAccessService, AuthenticationAccessService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDM0YsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUc5RyxNQUFNLENBQUMsTUFBTSw0QkFBNEIsR0FBRyxlQUFlLENBQStCLDhCQUE4QixDQUFDLENBQUM7QUFvQjFILG1FQUFtRTtBQUNuRSwyR0FBMkc7QUFDcEcsSUFBTSwyQkFBMkIsR0FBakMsTUFBTSwyQkFBNEIsU0FBUSxVQUFVO0lBTTFELFlBQ2tCLGVBQWlELEVBQ2pELGVBQWlEO1FBRWxFLEtBQUssRUFBRSxDQUFDO1FBSDBCLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQUNoQyxvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFMM0QsdUNBQWtDLEdBQXlELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQStDLENBQUMsQ0FBQztRQUNySyxzQ0FBaUMsR0FBdUQsSUFBSSxDQUFDLGtDQUFrQyxDQUFDLEtB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