/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
/**
 * Helper function to create a mock authentication provider
 */
export function createProvider(overrides = {}) {
    return {
        id: 'test-provider',
        label: 'Test Provider',
        supportsMultipleAccounts: true,
        createSession: () => Promise.resolve(createSession()),
        removeSession: () => Promise.resolve(),
        getSessions: () => Promise.resolve([]),
        onDidChangeSessions: new Emitter().event,
        ...overrides
    };
}
/**
 * Helper function to create a mock authentication session
 */
export function createSession() {
    return {
        id: 'test-session',
        accessToken: 'test-token',
        account: { id: 'test-account', label: 'Test Account' },
        scopes: ['read', 'write'],
        idToken: undefined
    };
}
/**
 * Base class for test services with common functionality and call tracking
 */
export class BaseTestService extends Disposable {
    constructor() {
        super(...arguments);
        this.data = new Map();
        this._methodCalls = [];
    }
    getKey(...parts) {
        return parts.join('::');
    }
    /**
     * Track a method call for verification in tests
     */
    trackCall(method, ...args) {
        this._methodCalls.push({
            method,
            args: [...args],
            timestamp: Date.now()
        });
    }
    /**
     * Get all method calls for verification
     */
    getMethodCalls() {
        return [...this._methodCalls];
    }
    /**
     * Get calls for a specific method
     */
    getCallsFor(method) {
        return this._methodCalls.filter(call => call.method === method);
    }
    /**
     * Clear method call history
     */
    clearCallHistory() {
        this._methodCalls.length = 0;
    }
    /**
     * Get the last call for a specific method
     */
    getLastCallFor(method) {
        const calls = this.getCallsFor(method);
        return calls[calls.length - 1];
    }
}
/**
 * Test implementation that actually stores and retrieves data
 */
export class TestUsageService extends BaseTestService {
    readAccountUsages(providerId, accountName) {
        this.trackCall('readAccountUsages', providerId, accountName);
        return this.data.get(this.getKey(providerId, accountName)) || [];
    }
    addAccountUsage(providerId, accountName, scopes, extensionId, extensionName) {
        this.trackCall('addAccountUsage', providerId, accountName, scopes, extensionId, extensionName);
        const key = this.getKey(providerId, accountName);
        const usages = this.data.get(key) || [];
        usages.push({ extensionId, extensionName, scopes: [...scopes], lastUsed: Date.now() });
        this.data.set(key, usages);
    }
    removeAccountUsage(providerId, accountName) {
        this.trackCall('removeAccountUsage', providerId, accountName);
        this.data.delete(this.getKey(providerId, accountName));
    }
    // Stub implementations for missing methods
    async initializeExtensionUsageCache() { }
    async extensionUsesAuth(extensionId) { return false; }
}
export class TestMcpUsageService extends BaseTestService {
    readAccountUsages(providerId, accountName) {
        this.trackCall('readAccountUsages', providerId, accountName);
        return this.data.get(this.getKey(providerId, accountName)) || [];
    }
    addAccountUsage(providerId, accountName, scopes, mcpServerId, mcpServerName) {
        this.trackCall('addAccountUsage', providerId, accountName, scopes, mcpServerId, mcpServerName);
        const key = this.getKey(providerId, accountName);
        const usages = this.data.get(key) || [];
        usages.push({ mcpServerId, mcpServerName, scopes: [...scopes], lastUsed: Date.now() });
        this.data.set(key, usages);
    }
    removeAccountUsage(providerId, accountName) {
        this.trackCall('removeAccountUsage', providerId, accountName);
        this.data.delete(this.getKey(providerId, accountName));
    }
    // Stub implementations for missing methods
    async initializeUsageCache() { }
    async hasUsedAuth(mcpServerId) { return false; }
}
export class TestAccessService extends BaseTestService {
    constructor() {
        super(...arguments);
        this._onDidChangeExtensionSessionAccess = this._register(new Emitter());
        this.onDidChangeExtensionSessionAccess = this._onDidChangeExtensionSessionAccess.event;
    }
    isAccessAllowed(providerId, accountName, extensionId) {
        this.trackCall('isAccessAllowed', providerId, accountName, extensionId);
        const extensions = this.data.get(this.getKey(providerId, accountName)) || [];
        const extension = extensions.find((e) => e.id === extensionId);
        return extension?.allowed;
    }
    readAllowedExtensions(providerId, accountName) {
        this.trackCall('readAllowedExtensions', providerId, accountName);
        return this.data.get(this.getKey(providerId, accountName)) || [];
    }
    updateAllowedExtensions(providerId, accountName, extensions) {
        this.trackCall('updateAllowedExtensions', providerId, accountName, extensions);
        const key = this.getKey(providerId, accountName);
        const existing = this.data.get(key) || [];
        // Merge with existing data, updating or adding extensions
        const merged = [...existing];
        for (const ext of extensions) {
            const existingIndex = merged.findIndex(e => e.id === ext.id);
            if (existingIndex >= 0) {
                merged[existingIndex] = ext;
            }
            else {
                merged.push(ext);
            }
        }
        this.data.set(key, merged);
        this._onDidChangeExtensionSessionAccess.fire({ providerId, accountName });
    }
    removeAllowedExtensions(providerId, accountName) {
        this.trackCall('removeAllowedExtensions', providerId, accountName);
        this.data.delete(this.getKey(providerId, accountName));
    }
}
export class TestMcpAccessService extends BaseTestService {
    constructor() {
        super(...arguments);
        this._onDidChangeMcpSessionAccess = this._register(new Emitter());
        this.onDidChangeMcpSessionAccess = this._onDidChangeMcpSessionAccess.event;
    }
    isAccessAllowed(providerId, accountName, mcpServerId) {
        this.trackCall('isAccessAllowed', providerId, accountName, mcpServerId);
        const servers = this.data.get(this.getKey(providerId, accountName)) || [];
        const server = servers.find((s) => s.id === mcpServerId);
        return server?.allowed;
    }
    readAllowedMcpServers(providerId, accountName) {
        this.trackCall('readAllowedMcpServers', providerId, accountName);
        return this.data.get(this.getKey(providerId, accountName)) || [];
    }
    updateAllowedMcpServers(providerId, accountName, mcpServers) {
        this.trackCall('updateAllowedMcpServers', providerId, accountName, mcpServers);
        const key = this.getKey(providerId, accountName);
        const existing = this.data.get(key) || [];
        // Merge with existing data, updating or adding MCP servers
        const merged = [...existing];
        for (const server of mcpServers) {
            const existingIndex = merged.findIndex(s => s.id === server.id);
            if (existingIndex >= 0) {
                merged[existingIndex] = server;
            }
            else {
                merged.push(server);
            }
        }
        this.data.set(key, merged);
        this._onDidChangeMcpSessionAccess.fire({ providerId, accountName });
    }
    removeAllowedMcpServers(providerId, accountName) {
        this.trackCall('removeAllowedMcpServers', providerId, accountName);
        this.data.delete(this.getKey(providerId, accountName));
        this._onDidChangeMcpSessionAccess.fire({ providerId, accountName });
    }
}
export class TestPreferencesService extends BaseTestService {
    constructor() {
        super(...arguments);
        this._onDidChangeAccountPreference = this._register(new Emitter());
        this.onDidChangeAccountPreference = this._onDidChangeAccountPreference.event;
    }
    getAccountPreference(clientId, providerId) {
        return this.data.get(this.getKey(clientId, providerId));
    }
    updateAccountPreference(clientId, providerId, account) {
        this.data.set(this.getKey(clientId, providerId), account.label);
    }
    removeAccountPreference(clientId, providerId) {
        this.data.delete(this.getKey(clientId, providerId));
    }
}
export class TestExtensionsService extends TestPreferencesService {
    // Stub implementations for methods we don't test
    updateSessionPreference() { }
    getSessionPreference() { return undefined; }
    removeSessionPreference() { }
    selectSession() { return Promise.resolve(createSession()); }
    requestSessionAccess() { }
    requestNewSession() { return Promise.resolve(); }
    updateNewSessionRequests() { }
}
export class TestMcpService extends TestPreferencesService {
    // Stub implementations for methods we don't test
    updateSessionPreference() { }
    getSessionPreference() { return undefined; }
    removeSessionPreference() { }
    selectSession() { return Promise.resolve(createSession()); }
    requestSessionAccess() { }
    requestNewSession() { return Promise.resolve(); }
}
/**
 * Minimal authentication service mock that only implements what we need
 */
export class TestAuthenticationService extends BaseTestService {
    constructor() {
        super(...arguments);
        this._onDidChangeSessions = this._register(new Emitter());
        this._onDidRegisterAuthenticationProvider = this._register(new Emitter());
        this._onDidUnregisterAuthenticationProvider = this._register(new Emitter());
        this._onDidChangeDeclaredProviders = this._register(new Emitter());
        this.onDidChangeSessions = this._onDidChangeSessions.event;
        this.onDidRegisterAuthenticationProvider = this._onDidRegisterAuthenticationProvider.event;
        this.onDidUnregisterAuthenticationProvider = this._onDidUnregisterAuthenticationProvider.event;
        this.onDidChangeDeclaredProviders = this._onDidChangeDeclaredProviders.event;
        this.accountsMap = new Map();
    }
    registerAuthenticationProvider(id, provider) {
        this.data.set(id, provider);
        this._onDidRegisterAuthenticationProvider.fire({ id, label: provider.label });
    }
    getProviderIds() {
        return Array.from(this.data.keys());
    }
    isAuthenticationProviderRegistered(id) {
        return this.data.has(id);
    }
    getProvider(id) {
        return this.data.get(id);
    }
    addAccounts(providerId, accounts) {
        this.accountsMap.set(providerId, accounts);
    }
    async getAccounts(providerId) {
        return this.accountsMap.get(providerId) || [];
    }
    // All other methods are stubs since we don't test them
    get declaredProviders() { return []; }
    isDynamicAuthenticationProvider() { return false; }
    async getSessions() { return []; }
    async createSession() { return createSession(); }
    async removeSession() { }
    manageTrustedExtensionsForAccount() { }
    async removeAccountSessions() { }
    registerDeclaredAuthenticationProvider() { }
    unregisterDeclaredAuthenticationProvider() { }
    unregisterAuthenticationProvider() { }
    registerAuthenticationProviderHostDelegate() { return { dispose: () => { } }; }
    createDynamicAuthenticationProvider() { return Promise.resolve(undefined); }
    async requestNewSession() { return createSession(); }
    async getSession() { return createSession(); }
    getOrActivateProviderIdForServer() { return Promise.resolve(undefined); }
    supportsHeimdallConnection() { return false; }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2VNb2Nrcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi90ZXN0L2Jyb3dzZXIvYXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2VNb2Nrcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLHlDQUF5QyxDQUFDO0FBUWxGOztHQUVHO0FBQ0gsTUFBTSxVQUFVLGNBQWMsQ0FBQyxZQUE4QyxFQUFFO0lBQzlFLE9BQU87UUFDTixFQUFFLEVBQUUsZUFBZTtRQUNuQixLQUFLLEVBQUUsZUFBZTtRQUN0Qix3QkFBd0IsRUFBRSxJQUFJO1FBQzlCLGFBQWEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3JELGFBQWEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFO1FBQ3RDLFdBQVcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUN0QyxtQkFBbUIsRUFBRSxJQUFJLE9BQU8sRUFBTyxDQUFDLEtBQUs7UUFDN0MsR0FBRyxTQUFTO0tBQ1osQ0FBQztBQUNILENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sVUFBVSxhQUFhO0lBQzVCLE9BQU87UUFDTixFQUFFLEVBQUUsY0FBYztRQUNsQixXQUFXLEVBQUUsWUFBWTtRQUN6QixPQUFPLEVBQUUsRUFBRSxFQUFFLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUU7UUFDdEQsTUFBTSxFQUFFLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQztRQUN6QixPQUFPLEVBQUUsU0FBUztLQUNsQixDQUFDO0FBQ0gsQ0FBQztBQVdEOztHQUVHO0FBQ0gsTUFBTSxPQUFnQixlQUFnQixTQUFRLFVBQVU7SUFBeEQ7O1FBQ29CLFNBQUksR0FBRyxJQUFJLEdBQUcsRUFBZSxDQUFDO1FBQ2hDLGlCQUFZLEdBQWlCLEVBQUUsQ0FBQztJQTZDbEQsQ0FBQztJQTNDVSxNQUFNLENBQUMsR0FBRyxLQUFlO1FBQ2xDLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN6QixDQUFDO0lBRUQ7O09BRUc7SUFDTyxTQUFTLENBQUMsTUFBYyxFQUFFLEdBQUcsSUFBZTtRQUNyRCxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQztZQUN0QixNQUFNO1lBQ04sSUFBSSxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDZixTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtTQUNyQixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQ7O09BRUc7SUFDSCxjQUFjO1FBQ2IsT0FBTyxDQUFDLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFRDs7T0FFRztJQUNILFdBQVcsQ0FBQyxNQUFjO1FBQ3pCLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLE1BQU0sQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFFRDs7T0FFRztJQUNILGdCQUFnQjtRQUNmLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztJQUM5QixDQUFDO0lBRUQ7O09BRUc7SUFDSCxjQUFjLENBQUMsTUFBYztRQUM1QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZDLE9BQU8sS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDaEMsQ0FBQztDQUNEO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLE9BQU8sZ0JBQWlCLFNBQVEsZUFBZTtJQUdwRCxpQkFBaUIsQ0FBQyxVQUFrQixFQUFFLFdBQW1CO1FBQ3hELElBQUksQ0FBQyxTQUFTLENBQUMsbUJBQW1CLEVBQUUsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQzdELE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDbEUsQ0FBQztJQUVELGVBQWUsQ0FBQyxVQUFrQixFQUFFLFdBQW1CLEVBQUUsTUFBeUIsRUFBRSxXQUFtQixFQUFFLGFBQXFCO1FBQzdILElBQUksQ0FBQyxTQUFTLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBQy9GLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN4QyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZGLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBRUQsa0JBQWtCLENBQUMsVUFBa0IsRUFBRSxXQUFtQjtRQUN6RCxJQUFJLENBQUMsU0FBUyxDQUFDLG9CQUFvQixFQUFFLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUM5RCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBQ3hELENBQUM7SUFFRCwyQ0FBMkM7SUFDM0MsS0FBSyxDQUFDLDZCQUE2QixLQUFvQixDQUFDO0lBQ3hELEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxXQUFtQixJQUFzQixPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7Q0FDaEY7QUFFRCxNQUFNLE9BQU8sbUJBQW9CLFNBQVEsZUFBZTtJQUd2RCxpQkFBaUIsQ0FBQyxVQUFrQixFQUFFLFdBQW1CO1FBQ3hELElBQUksQ0FBQyxTQUFTLENBQUMsbUJBQW1CLEVBQUUsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQzdELE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDbEUsQ0FBQztJQUVELGVBQWUsQ0FBQyxVQUFrQixFQUFFLFdBQW1CLEVBQUUsTUFBeUIsRUFBRSxXQUFtQixFQUFFLGFBQXFCO1FBQzdILElBQUksQ0FBQyxTQUFTLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBQy9GLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN4QyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZGLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBRUQsa0JBQWtCLENBQUMsVUFBa0IsRUFBRSxXQUFtQjtRQUN6RCxJQUFJLENBQUMsU0FBUyxDQUFDLG9CQUFvQixFQUFFLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUM5RCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBQ3hELENBQUM7SUFFRCwyQ0FBMkM7SUFDM0MsS0FBSyxDQUFDLG9CQUFvQixLQUFvQixDQUFDO0lBQy9DLEtBQUssQ0FBQyxXQUFXLENBQUMsV0FBbUIsSUFBc0IsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0NBQzFFO0FBRUQsTUFBTSxPQUFPLGlCQUFrQixTQUFRLGVBQWU7SUFBdEQ7O1FBRWtCLHVDQUFrQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQU8sQ0FBQyxDQUFDO1FBQ3pGLHNDQUFpQyxHQUFHLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxLQUFLLENBQUM7SUFzQ25GLENBQUM7SUFwQ0EsZUFBZSxDQUFDLFVBQWtCLEVBQUUsV0FBbUIsRUFBRSxXQUFtQjtRQUMzRSxJQUFJLENBQUMsU0FBUyxDQUFDLGlCQUFpQixFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDeEUsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDN0UsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxXQUFXLENBQUMsQ0FBQztRQUNwRSxPQUFPLFNBQVMsRUFBRSxPQUFPLENBQUM7SUFDM0IsQ0FBQztJQUVELHFCQUFxQixDQUFDLFVBQWtCLEVBQUUsV0FBbUI7UUFDNUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDakUsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNsRSxDQUFDO0lBRUQsdUJBQXVCLENBQUMsVUFBa0IsRUFBRSxXQUFtQixFQUFFLFVBQWlCO1FBQ2pGLElBQUksQ0FBQyxTQUFTLENBQUMseUJBQXlCLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUMvRSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNqRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFMUMsMERBQTBEO1FBQzFELE1BQU0sTUFBTSxHQUFHLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQztRQUM3QixLQUFLLE1BQU0sR0FBRyxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQzlCLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUM3RCxJQUFJLGFBQWEsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDeEIsTUFBTSxDQUFDLGFBQWEsQ0FBQyxHQUFHLEdBQUcsQ0FBQztZQUM3QixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNsQixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMzQixJQUFJLENBQUMsa0NBQWtDLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7SUFDM0UsQ0FBQztJQUVELHVCQUF1QixDQUFDLFVBQWtCLEVBQUUsV0FBbUI7UUFDOUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyx5QkFBeUIsRUFBRSxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDbkUsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUN4RCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sb0JBQXFCLFNBQVEsZUFBZTtJQUF6RDs7UUFFa0IsaUNBQTRCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBTyxDQUFDLENBQUM7UUFDbkYsZ0NBQTJCLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEtBQUssQ0FBQztJQXVDdkUsQ0FBQztJQXJDQSxlQUFlLENBQUMsVUFBa0IsRUFBRSxXQUFtQixFQUFFLFdBQW1CO1FBQzNFLElBQUksQ0FBQyxTQUFTLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUN4RSxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUMxRSxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLFdBQVcsQ0FBQyxDQUFDO1FBQzlELE9BQU8sTUFBTSxFQUFFLE9BQU8sQ0FBQztJQUN4QixDQUFDO0lBRUQscUJBQXFCLENBQUMsVUFBa0IsRUFBRSxXQUFtQjtRQUM1RCxJQUFJLENBQUMsU0FBUyxDQUFDLHVCQUF1QixFQUFFLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNqRSxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2xFLENBQUM7SUFFRCx1QkFBdUIsQ0FBQyxVQUFrQixFQUFFLFdBQW1CLEVBQUUsVUFBaUI7UUFDakYsSUFBSSxDQUFDLFNBQVMsQ0FBQyx5QkFBeUIsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQy9FLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUUxQywyREFBMkQ7UUFDM0QsTUFBTSxNQUFNLEdBQUcsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFDO1FBQzdCLEtBQUssTUFBTSxNQUFNLElBQUksVUFBVSxFQUFFLENBQUM7WUFDakMsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2hFLElBQUksYUFBYSxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUN4QixNQUFNLENBQUMsYUFBYSxDQUFDLEdBQUcsTUFBTSxDQUFDO1lBQ2hDLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3JCLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzNCLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztJQUNyRSxDQUFDO0lBRUQsdUJBQXVCLENBQUMsVUFBa0IsRUFBRSxXQUFtQjtRQUM5RCxJQUFJLENBQUMsU0FBUyxDQUFDLHlCQUF5QixFQUFFLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNuRSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztJQUNyRSxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsZUFBZTtJQUEzRDs7UUFDa0Isa0NBQTZCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBTyxDQUFDLENBQUM7UUFDcEYsaUNBQTRCLEdBQUcsSUFBSSxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQztJQWF6RSxDQUFDO0lBWEEsb0JBQW9CLENBQUMsUUFBZ0IsRUFBRSxVQUFrQjtRQUN4RCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDekQsQ0FBQztJQUVELHVCQUF1QixDQUFDLFFBQWdCLEVBQUUsVUFBa0IsRUFBRSxPQUFZO1FBQ3pFLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQsdUJBQXVCLENBQUMsUUFBZ0IsRUFBRSxVQUFrQjtRQUMzRCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBQ3JELENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxxQkFBc0IsU0FBUSxzQkFBc0I7SUFHaEUsaURBQWlEO0lBQ2pELHVCQUF1QixLQUFXLENBQUM7SUFDbkMsb0JBQW9CLEtBQXlCLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUNoRSx1QkFBdUIsS0FBVyxDQUFDO0lBQ25DLGFBQWEsS0FBbUIsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFFLG9CQUFvQixLQUFXLENBQUM7SUFDaEMsaUJBQWlCLEtBQW9CLE9BQU8sT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNoRSx3QkFBd0IsS0FBVyxDQUFDO0NBQ3BDO0FBRUQsTUFBTSxPQUFPLGNBQWUsU0FBUSxzQkFBc0I7SUFHekQsaURBQWlEO0lBQ2pELHVCQUF1QixLQUFXLENBQUM7SUFDbkMsb0JBQW9CLEtBQXlCLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUNoRSx1QkFBdUIsS0FBVyxDQUFDO0lBQ25DLGFBQWEsS0FBbUIsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFFLG9CQUFvQixLQUFXLENBQUM7SUFDaEMsaUJBQWlCLEtBQW9CLE9BQU8sT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztDQUNoRTtBQUVEOztHQUVHO0FBQ0gsTUFBTSxPQUFPLHlCQUEwQixTQUFRLGVBQWU7SUFBOUQ7O1FBR2tCLHlCQUFvQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQU8sQ0FBQyxDQUFDO1FBQzFELHlDQUFvQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQU8sQ0FBQyxDQUFDO1FBQzFFLDJDQUFzQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQU8sQ0FBQyxDQUFDO1FBQzVFLGtDQUE2QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBRXJGLHdCQUFtQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUM7UUFDdEQsd0NBQW1DLEdBQUcsSUFBSSxDQUFDLG9DQUFvQyxDQUFDLEtBQUssQ0FBQztRQUN0RiwwQ0FBcUMsR0FBRyxJQUFJLENBQUMsc0NBQXNDLENBQUMsS0FBSyxDQUFDO1FBQzFGLGlDQUE0QixHQUFHLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUM7UUFFdkQsZ0JBQVcsR0FBRyxJQUFJLEdBQUcsRUFBMEMsQ0FBQztJQTRDbEYsQ0FBQztJQTFDQSw4QkFBOEIsQ0FBQyxFQUFVLEVBQUUsUUFBaUM7UUFDM0UsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzVCLElBQUksQ0FBQyxvQ0FBb0MsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQy9FLENBQUM7SUFFRCxjQUFjO1FBQ2IsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRUQsa0NBQWtDLENBQUMsRUFBVTtRQUM1QyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzFCLENBQUM7SUFFRCxXQUFXLENBQUMsRUFBVTtRQUNyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBRSxDQUFDO0lBQzNCLENBQUM7SUFFRCxXQUFXLENBQUMsVUFBa0IsRUFBRSxRQUF3QztRQUN2RSxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVELEtBQUssQ0FBQyxXQUFXLENBQUMsVUFBa0I7UUFDbkMsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDL0MsQ0FBQztJQUVELHVEQUF1RDtJQUN2RCxJQUFJLGlCQUFpQixLQUFZLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3QywrQkFBK0IsS0FBYyxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDNUQsS0FBSyxDQUFDLFdBQVcsS0FBZ0QsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdFLEtBQUssQ0FBQyxhQUFhLEtBQXFDLE9BQU8sYUFBYSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2pGLEtBQUssQ0FBQyxhQUFhLEtBQW9CLENBQUM7SUFDeEMsaUNBQWlDLEtBQVcsQ0FBQztJQUM3QyxLQUFLLENBQUMscUJBQXFCLEtBQW9CLENBQUM7SUFDaEQsc0NBQXNDLEtBQVcsQ0FBQztJQUNsRCx3Q0FBd0MsS0FBVyxDQUFDO0lBQ3BELGdDQUFnQyxLQUFXLENBQUM7SUFDNUMsMENBQTBDLEtBQWtCLE9BQU8sRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzVGLG1DQUFtQyxLQUFtQixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFGLEtBQUssQ0FBQyxpQkFBaUIsS0FBcUMsT0FBTyxhQUFhLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDckYsS0FBSyxDQUFDLFVBQVUsS0FBaUQsT0FBTyxhQUFhLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDMUYsZ0NBQWdDLEtBQWtDLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdEcsMEJBQTBCLEtBQWMsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0NBQ3ZEIn0=