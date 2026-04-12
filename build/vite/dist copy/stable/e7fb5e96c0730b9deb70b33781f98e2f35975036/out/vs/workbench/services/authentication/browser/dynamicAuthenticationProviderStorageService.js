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
var DynamicAuthenticationProviderStorageService_1;
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IDynamicAuthenticationProviderStorageService } from '../common/dynamicAuthenticationProviderStorage.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { isAuthorizationTokenResponse } from '../../../../base/common/oauth.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Queue } from '../../../../base/common/async.js';
let DynamicAuthenticationProviderStorageService = class DynamicAuthenticationProviderStorageService extends Disposable {
    static { DynamicAuthenticationProviderStorageService_1 = this; }
    static { this.PROVIDERS_STORAGE_KEY = 'dynamicAuthProviders'; }
    constructor(storageService, secretStorageService, logService) {
        super();
        this.storageService = storageService;
        this.secretStorageService = secretStorageService;
        this.logService = logService;
        this._onDidChangeTokens = this._register(new Emitter());
        this.onDidChangeTokens = this._onDidChangeTokens.event;
        // Listen for secret storage changes and emit events for dynamic auth provider token changes
        const queue = new Queue();
        this._register(this.secretStorageService.onDidChangeSecret(async (key) => {
            let payload;
            try {
                payload = JSON.parse(key);
            }
            catch (error) {
                // Ignore errors... must not be a dynamic auth provider
            }
            if (payload?.isDynamicAuthProvider) {
                void queue.queue(async () => {
                    const tokens = await this.getSessionsForDynamicAuthProvider(payload.authProviderId, payload.clientId);
                    this._onDidChangeTokens.fire({
                        authProviderId: payload.authProviderId,
                        clientId: payload.clientId,
                        tokens
                    });
                });
            }
        }));
    }
    async getClientRegistration(providerId) {
        // First try new combined SecretStorage format
        const key = `dynamicAuthProvider:clientRegistration:${providerId}`;
        const credentialsValue = await this.secretStorageService.get(key);
        if (credentialsValue) {
            try {
                const credentials = JSON.parse(credentialsValue);
                if (credentials && (credentials.clientId || credentials.clientSecret)) {
                    return credentials;
                }
            }
            catch {
                await this.secretStorageService.delete(key);
            }
        }
        // Just grab the client id from the provider
        const providers = this._getStoredProviders();
        const provider = providers.find(p => p.providerId === providerId);
        return provider?.clientId ? { clientId: provider.clientId } : undefined;
    }
    getClientId(providerId) {
        // For backward compatibility, try old storage format first
        const providers = this._getStoredProviders();
        const provider = providers.find(p => p.providerId === providerId);
        return provider?.clientId;
    }
    async storeClientRegistration(providerId, authorizationServer, clientId, clientSecret, label) {
        // Store provider information for backward compatibility and UI display
        this._trackProvider(providerId, authorizationServer, clientId, label);
        // Store both client ID and secret together in SecretStorage
        const key = `dynamicAuthProvider:clientRegistration:${providerId}`;
        const credentials = { clientId, clientSecret };
        await this.secretStorageService.set(key, JSON.stringify(credentials));
    }
    _trackProvider(providerId, authorizationServer, clientId, label) {
        const providers = this._getStoredProviders();
        // Check if provider already exists
        const existingProviderIndex = providers.findIndex(p => p.providerId === providerId);
        if (existingProviderIndex === -1) {
            // Add new provider with provided or default info
            const newProvider = {
                providerId,
                label: label || providerId, // Use provided label or providerId as default
                authorizationServer,
                clientId
            };
            providers.push(newProvider);
            this._storeProviders(providers);
        }
        else {
            const existingProvider = providers[existingProviderIndex];
            // Create new provider object with updated info
            const updatedProvider = {
                providerId,
                label: label || existingProvider.label,
                authorizationServer,
                clientId
            };
            providers[existingProviderIndex] = updatedProvider;
            this._storeProviders(providers);
        }
    }
    _getStoredProviders() {
        const stored = this.storageService.get(DynamicAuthenticationProviderStorageService_1.PROVIDERS_STORAGE_KEY, -1 /* StorageScope.APPLICATION */, '[]');
        try {
            const providerInfos = JSON.parse(stored);
            // MIGRATION: remove after an iteration or 2
            for (const providerInfo of providerInfos) {
                if (!providerInfo.authorizationServer) {
                    providerInfo.authorizationServer = providerInfo.issuer;
                }
            }
            return providerInfos;
        }
        catch {
            return [];
        }
    }
    _storeProviders(providers) {
        this.storageService.store(DynamicAuthenticationProviderStorageService_1.PROVIDERS_STORAGE_KEY, JSON.stringify(providers), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    }
    getInteractedProviders() {
        return this._getStoredProviders();
    }
    async removeDynamicProvider(providerId) {
        // Get provider info before removal for secret cleanup
        const providers = this._getStoredProviders();
        const providerInfo = providers.find(p => p.providerId === providerId);
        // Remove from stored providers
        const filteredProviders = providers.filter(p => p.providerId !== providerId);
        this._storeProviders(filteredProviders);
        // Remove sessions from secret storage if we have the provider info
        if (providerInfo) {
            const secretKey = JSON.stringify({ isDynamicAuthProvider: true, authProviderId: providerId, clientId: providerInfo.clientId });
            await this.secretStorageService.delete(secretKey);
        }
        // Remove client credentials from new SecretStorage format
        const credentialsKey = `dynamicAuthProvider:clientRegistration:${providerId}`;
        await this.secretStorageService.delete(credentialsKey);
    }
    async getSessionsForDynamicAuthProvider(authProviderId, clientId) {
        const key = JSON.stringify({ isDynamicAuthProvider: true, authProviderId, clientId });
        const value = await this.secretStorageService.get(key);
        if (value) {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed) || !parsed.every((t) => typeof t.created_at === 'number' && isAuthorizationTokenResponse(t))) {
                this.logService.error(`Invalid session data for ${authProviderId} (${clientId}) in secret storage:`, parsed);
                await this.secretStorageService.delete(key);
                return undefined;
            }
            return parsed;
        }
        return undefined;
    }
    async setSessionsForDynamicAuthProvider(authProviderId, clientId, sessions) {
        const key = JSON.stringify({ isDynamicAuthProvider: true, authProviderId, clientId });
        const value = JSON.stringify(sessions);
        await this.secretStorageService.set(key, value);
        this.logService.trace(`Set session data for ${authProviderId} (${clientId}) in secret storage:`, sessions);
    }
};
DynamicAuthenticationProviderStorageService = DynamicAuthenticationProviderStorageService_1 = __decorate([
    __param(0, IStorageService),
    __param(1, ISecretStorageService),
    __param(2, ILogService)
], DynamicAuthenticationProviderStorageService);
export { DynamicAuthenticationProviderStorageService };
registerSingleton(IDynamicAuthenticationProviderStorageService, DynamicAuthenticationProviderStorageService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSw0Q0FBNEMsRUFBcUYsTUFBTSxtREFBbUQsQ0FBQztBQUNwTSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN2RixPQUFPLEVBQStCLDRCQUE0QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDN0csT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRWxELElBQU0sMkNBQTJDLEdBQWpELE1BQU0sMkNBQTRDLFNBQVEsVUFBVTs7YUFHbEQsMEJBQXFCLEdBQUcsc0JBQXNCLEFBQXpCLENBQTBCO0lBS3ZFLFlBQ2tCLGNBQWdELEVBQzFDLG9CQUE0RCxFQUN0RSxVQUF3QztRQUVyRCxLQUFLLEVBQUUsQ0FBQztRQUowQixtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFDekIseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUNyRCxlQUFVLEdBQVYs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