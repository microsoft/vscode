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
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
export const IAuthenticationMcpAccessService = createDecorator('IAuthenticationMcpAccessService');
// TODO@TylerLeonhardt: Should this class only keep track of allowed things and throw away disallowed ones?
let AuthenticationMcpAccessService = class AuthenticationMcpAccessService extends Disposable {
    constructor(_storageService, _productService) {
        super();
        this._storageService = _storageService;
        this._productService = _productService;
        this._onDidChangeMcpSessionAccess = this._register(new Emitter());
        this.onDidChangeMcpSessionAccess = this._onDidChangeMcpSessionAccess.event;
    }
    isAccessAllowed(providerId, accountName, mcpServerId) {
        const trustedMCPServerAuthAccess = this._productService.trustedMcpAuthAccess;
        if (Array.isArray(trustedMCPServerAuthAccess)) {
            if (trustedMCPServerAuthAccess.includes(mcpServerId)) {
                return true;
            }
        }
        else if (trustedMCPServerAuthAccess?.[providerId]?.includes(mcpServerId)) {
            return true;
        }
        const allowList = this.readAllowedMcpServers(providerId, accountName);
        const mcpServerData = allowList.find(mcpServer => mcpServer.id === mcpServerId);
        if (!mcpServerData) {
            return undefined;
        }
        // This property didn't exist on this data previously, inclusion in the list at all indicates allowance
        return mcpServerData.allowed !== undefined
            ? mcpServerData.allowed
            : true;
    }
    readAllowedMcpServers(providerId, accountName) {
        let trustedMCPServers = [];
        try {
            const trustedMCPServerSrc = this._storageService.get(`mcpserver-${providerId}-${accountName}`, -1 /* StorageScope.APPLICATION */);
            if (trustedMCPServerSrc) {
                trustedMCPServers = JSON.parse(trustedMCPServerSrc);
            }
        }
        catch (err) { }
        // Add trusted MCP servers from product.json if they're not already in the list
        const trustedMcpServerAuthAccess = this._productService.trustedMcpAuthAccess;
        const trustedMcpServerIds = 
        // Case 1: trustedMcpServerAuthAccess is an array
        Array.isArray(trustedMcpServerAuthAccess)
            ? trustedMcpServerAuthAccess
            // Case 2: trustedMcpServerAuthAccess is an object
            : typeof trustedMcpServerAuthAccess === 'object'
                ? trustedMcpServerAuthAccess[providerId] ?? []
                : [];
        for (const mcpServerId of trustedMcpServerIds) {
            const existingServer = trustedMCPServers.find(server => server.id === mcpServerId);
            if (!existingServer) {
                // Add new trusted server (name will be set by caller if they have server info)
                trustedMCPServers.push({
                    id: mcpServerId,
                    name: mcpServerId, // Default to ID, caller can update with proper name
                    allowed: true,
                    trusted: true
                });
            }
            else {
                // Update existing server to be trusted
                existingServer.allowed = true;
                existingServer.trusted = true;
            }
        }
        return trustedMCPServers;
    }
    updateAllowedMcpServers(providerId, accountName, mcpServers) {
        const allowList = this.readAllowedMcpServers(providerId, accountName);
        for (const mcpServer of mcpServers) {
            const index = allowList.findIndex(e => e.id === mcpServer.id);
            if (index === -1) {
                allowList.push(mcpServer);
            }
            else {
                allowList[index].allowed = mcpServer.allowed;
                // Update name if provided and not already set to a proper name
                if (mcpServer.name && mcpServer.name !== mcpServer.id && allowList[index].name !== mcpServer.name) {
                    allowList[index].name = mcpServer.name;
                }
            }
        }
        // Filter out trusted servers before storing - they should only come from product.json, not user storage
        const userManagedServers = allowList.filter(server => !server.trusted);
        this._storageService.store(`mcpserver-${providerId}-${accountName}`, JSON.stringify(userManagedServers), -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        this._onDidChangeMcpSessionAccess.fire({ providerId, accountName });
    }
    removeAllowedMcpServers(providerId, accountName) {
        this._storageService.remove(`mcpserver-${providerId}-${accountName}`, -1 /* StorageScope.APPLICATION */);
        this._onDidChangeMcpSessionAccess.fire({ providerId, accountName });
    }
};
AuthenticationMcpAccessService = __decorate([
    __param(0, IStorageService),
    __param(1, IProductService)
], AuthenticationMcpAccessService);
export { AuthenticationMcpAccessService };
registerSingleton(IAuthenticationMcpAccessService, AuthenticationMcpAccessService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQWdCOUcsTUFBTSxDQUFDLE1BQU0sK0JBQStCLEdBQUcsZUFBZSxDQUFrQyxpQ0FBaUMsQ0FBQyxDQUFDO0FBb0JuSSwyR0FBMkc7QUFDcEcsSUFBTSw4QkFBOEIsR0FBcEMsTUFBTSw4QkFBK0IsU0FBUSxVQUFVO0lBTTdELFlBQ2tCLGVBQWlELEVBQ2pELGVBQWlEO1FBRWxFLEtBQUssRUFBRSxDQUFDO1FBSDBCLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQUNoQyxvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFMM0QsaUNBQTRCLEdBQXlELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQStDLENBQUMsQ0FBQztRQUMvSixnQ0FBMkIsR0FBdUQsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEtBQUssQ0FBQztJQU9uSSxDQUFDO0lBRUQsZUFBZSxDQUFDLFVBQWtCLEVBQUUsV0FBbUIs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