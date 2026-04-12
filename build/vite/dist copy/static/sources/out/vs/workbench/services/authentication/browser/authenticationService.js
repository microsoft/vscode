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
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, isDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { equalsIgnoreCase, isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { isString } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAuthenticationAccessService } from './authenticationAccessService.js';
import { IAuthenticationService, isAuthenticationWwwAuthenticateRequest } from '../common/authentication.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { match } from '../../../../base/common/glob.js';
import { parseWWWAuthenticateHeader } from '../../../../base/common/oauth.js';
import { raceCancellation, raceTimeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
export function getAuthenticationProviderActivationEvent(id) { return `onAuthenticationRequest:${id}`; }
export async function getCurrentAuthenticationSessionInfo(secretStorageService, productService) {
    const authenticationSessionValue = await secretStorageService.get(`${productService.urlProtocol}.loginAccount`);
    if (authenticationSessionValue) {
        try {
            const authenticationSessionInfo = JSON.parse(authenticationSessionValue);
            if (authenticationSessionInfo
                && isString(authenticationSessionInfo.id)
                && isString(authenticationSessionInfo.accessToken)
                && isString(authenticationSessionInfo.providerId)) {
                return authenticationSessionInfo;
            }
        }
        catch (e) {
            // This is a best effort operation.
            console.error(`Failed parsing current auth session value: ${e}`);
        }
    }
    return undefined;
}
const authenticationDefinitionSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        id: {
            type: 'string',
            description: localize('authentication.id', 'The id of the authentication provider.')
        },
        label: {
            type: 'string',
            description: localize('authentication.label', 'The human readable name of the authentication provider.'),
        },
        authorizationServerGlobs: {
            type: 'array',
            items: {
                type: 'string',
                description: localize('authentication.authorizationServerGlobs', 'A list of globs that match the authorization servers that this provider supports.'),
            },
            description: localize('authentication.authorizationServerGlobsDescription', 'A list of globs that match the authorization servers that this provider supports.')
        }
    }
};
const authenticationExtPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'authentication',
    jsonSchema: {
        description: localize({ key: 'authenticationExtensionPoint', comment: [`'Contributes' means adds here`] }, 'Contributes authentication'),
        type: 'array',
        items: authenticationDefinitionSchema
    },
    activationEventsGenerator: function* (authenticationProviders) {
        for (const authenticationProvider of authenticationProviders) {
            if (authenticationProvider.id) {
                yield `onAuthenticationRequest:${authenticationProvider.id}`;
            }
        }
    }
});
let AuthenticationService = class AuthenticationService extends Disposable {
    constructor(_extensionService, authenticationAccessService, _environmentService, _logService) {
        super();
        this._extensionService = _extensionService;
        this._environmentService = _environmentService;
        this._logService = _logService;
        this._onDidRegisterAuthenticationProvider = this._register(new Emitter());
        this.onDidRegisterAuthenticationProvider = this._onDidRegisterAuthenticationProvider.event;
        this._onDidUnregisterAuthenticationProvider = this._register(new Emitter());
        this.onDidUnregisterAuthenticationProvider = this._onDidUnregisterAuthenticationProvider.event;
        this._onDidChangeSessions = this._register(new Emitter());
        this.onDidChangeSessions = this._onDidChangeSessions.event;
        this._onDidChangeDeclaredProviders = this._register(new Emitter());
        this.onDidChangeDeclaredProviders = this._onDidChangeDeclaredProviders.event;
        this._authenticationProviders = new Map();
        this._authenticationProviderDisposables = this._register(new DisposableMap());
        this._dynamicAuthenticationProviderIds = new Set();
        this._delegates = [];
        this._disposedSource = new CancellationTokenSource();
        this._declaredProviders = [];
        this._register(toDisposable(() => this._disposedSource.dispose(true)));
        this._register(authenticationAccessService.onDidChangeExtensionSessionAccess(e => {
            // The access has changed, not the actual session itself but extensions depend on this event firing
            // when they have gained access to an account so this fires that event.
            this._onDidChangeSessions.fire({
                providerId: e.providerId,
                label: e.accountName,
                event: {
                    added: [],
                    changed: [],
                    removed: []
                }
            });
        }));
        this._registerEnvContributedAuthenticationProviders();
        this._registerAuthenticationExtensionPointHandler();
    }
    get declaredProviders() {
        return this._declaredProviders;
    }
    _registerEnvContributedAuthenticationProviders() {
        if (!this._environmentService.options?.authenticationProviders?.length) {
            return;
        }
        for (const provider of this._environmentService.options.authenticationProviders) {
            this.registerDeclaredAuthenticationProvider(provider);
            this.registerAuthenticationProvider(provider.id, provider);
        }
    }
    _registerAuthenticationExtensionPointHandler() {
        this._register(authenticationExtPoint.setHandler((_extensions, { added, removed }) => {
            this._logService.debug(`Found authentication providers. added: ${added.length}, removed: ${removed.length}`);
            added.forEach(point => {
                for (const provider of point.value) {
                    if (isFalsyOrWhitespace(provider.id)) {
                        point.collector.error(localize('authentication.missingId', 'An authentication contribution must specify an id.'));
                        continue;
                    }
                    if (isFalsyOrWhitespace(provider.label)) {
                        point.collector.error(localize('authentication.missingLabel', 'An authentication contribution must specify a label.'));
                        continue;
                    }
                    if (!this.declaredProviders.some(p => p.id === provider.id)) {
                        this.registerDeclaredAuthenticationProvider(provider);
                        this._logService.debug(`Declared authentication provider: ${provider.id}`);
                    }
                    else {
                        point.collector.error(localize('authentication.idConflict', "This authentication id '{0}' has already been registered", provider.id));
                    }
                }
            });
            const removedExtPoints = removed.flatMap(r => r.value);
            removedExtPoints.forEach(point => {
                const provider = this.declaredProviders.find(provider => provider.id === point.id);
                if (provider) {
                    this.unregisterDeclaredAuthenticationProvider(provider.id);
                    this._logService.debug(`Undeclared authentication provider: ${provider.id}`);
                }
            });
        }));
    }
    registerDeclaredAuthenticationProvider(provider) {
        if (isFalsyOrWhitespace(provider.id)) {
            throw new Error(localize('authentication.missingId', 'An authentication contribution must specify an id.'));
        }
        if (isFalsyOrWhitespace(provider.label)) {
            throw new Error(localize('authentication.missingLabel', 'An authentication contribution must specify a label.'));
        }
        if (this.declaredProviders.some(p => p.id === provider.id)) {
            throw new Error(localize('authentication.idConflict', "This authentication id '{0}' has already been registered", provider.id));
        }
        this._declaredProviders.push(provider);
        this._onDidChangeDeclaredProviders.fire();
    }
    unregisterDeclaredAuthenticationProvider(id) {
        const index = this.declaredProviders.findIndex(provider => provider.id === id);
        if (index > -1) {
            this.declaredProviders.splice(index, 1);
        }
        this._onDidChangeDeclaredProviders.fire();
    }
    isAuthenticationProviderRegistered(id) {
        return this._authenticationProviders.has(id);
    }
    isDynamicAuthenticationProvider(id) {
        return this._dynamicAuthenticationProviderIds.has(id);
    }
    registerAuthenticationProvider(id, authenticationProvider) {
        this._authenticationProviders.set(id, authenticationProvider);
        const disposableStore = new DisposableStore();
        disposableStore.add(authenticationProvider.onDidChangeSessions(e => this._onDidChangeSessions.fire({
            providerId: id,
            label: authenticationProvider.label,
            event: e
        })));
        if (isDisposable(authenticationProvider)) {
            disposableStore.add(authenticationProvider);
        }
        this._authenticationProviderDisposables.set(id, disposableStore);
        this._onDidRegisterAuthenticationProvider.fire({ id, label: authenticationProvider.label });
    }
    unregisterAuthenticationProvider(id) {
        const provider = this._authenticationProviders.get(id);
        if (provider) {
            this._authenticationProviders.delete(id);
            // If this is a dynamic provider, remove it from the set of dynamic providers
            this._dynamicAuthenticationProviderIds.delete(id);
            this._onDidUnregisterAuthenticationProvider.fire({ id, label: provider.label });
        }
        this._authenticationProviderDisposables.deleteAndDispose(id);
    }
    getProviderIds() {
        const providerIds = [];
        this._authenticationProviders.forEach(provider => {
            providerIds.push(provider.id);
        });
        return providerIds;
    }
    getProvider(id) {
        if (this._authenticationProviders.has(id)) {
            return this._authenticationProviders.get(id);
        }
        throw new Error(`No authentication provider '${id}' is currently registered.`);
    }
    async getAccounts(id) {
        // TODO: Cache this
        const sessions = await this.getSessions(id);
        const accounts = new Array();
        const seenAccounts = new Set();
        for (const session of sessions) {
            if (!seenAccounts.has(session.account.label)) {
                seenAccounts.add(session.account.label);
                accounts.push(session.account);
            }
        }
        return accounts;
    }
    async getSessions(id, scopeListOrRequest, options, activateImmediate = false) {
        if (this._disposedSource.token.isCancellationRequested) {
            return [];
        }
        const authProvider = this._authenticationProviders.get(id) || await this.tryActivateProvider(id, activateImmediate);
        if (authProvider) {
            // Check if the authorization server is in the list of supported authorization servers
            const server = options?.authorizationServer;
            if (server) {
                // Skip the resource server check since the auth provider id contains a specific resource server
                // TODO@TylerLeonhardt: this can change when we have providers that support multiple resource servers
                if (!this.matchesProvider(authProvider, server)) {
                    throw new Error(`The authentication provider '${id}' does not support the authorization server '${server.toString(true)}'.`);
                }
            }
            if (isAuthenticationWwwAuthenticateRequest(scopeListOrRequest)) {
                if (!authProvider.getSessionsFromChallenges) {
                    throw new Error(`The authentication provider '${id}' does not support getting sessions from challenges.`);
                }
                return await authProvider.getSessionsFromChallenges({ challenges: parseWWWAuthenticateHeader(scopeListOrRequest.wwwAuthenticate), fallbackScopes: scopeListOrRequest.fallbackScopes }, { ...options });
            }
            return await authProvider.getSessions(scopeListOrRequest ? [...scopeListOrRequest] : undefined, { ...options });
        }
        else {
            throw new Error(`No authentication provider '${id}' is currently registered.`);
        }
    }
    async createSession(id, scopeListOrRequest, options) {
        if (this._disposedSource.token.isCancellationRequested) {
            throw new Error('Authentication service is disposed.');
        }
        const authProvider = this._authenticationProviders.get(id) || await this.tryActivateProvider(id, !!options?.activateImmediate);
        if (authProvider) {
            if (isAuthenticationWwwAuthenticateRequest(scopeListOrRequest)) {
                if (!authProvider.createSessionFromChallenges) {
                    throw new Error(`The authentication provider '${id}' does not support creating sessions from challenges.`);
                }
                return await authProvider.createSessionFromChallenges({ challenges: parseWWWAuthenticateHeader(scopeListOrRequest.wwwAuthenticate), fallbackScopes: scopeListOrRequest.fallbackScopes }, { ...options });
            }
            return await authProvider.createSession([...scopeListOrRequest], { ...options });
        }
        else {
            throw new Error(`No authentication provider '${id}' is currently registered.`);
        }
    }
    async removeSession(id, sessionId) {
        if (this._disposedSource.token.isCancellationRequested) {
            throw new Error('Authentication service is disposed.');
        }
        const authProvider = this._authenticationProviders.get(id);
        if (authProvider) {
            return authProvider.removeSession(sessionId);
        }
        else {
            throw new Error(`No authentication provider '${id}' is currently registered.`);
        }
    }
    async getOrActivateProviderIdForServer(authorizationServer, resourceServer) {
        for (const provider of this._authenticationProviders.values()) {
            if (this.matchesProvider(provider, authorizationServer, resourceServer)) {
                return provider.id;
            }
        }
        const authServerStr = authorizationServer.toString(true);
        const providers = this._declaredProviders
            // Only consider providers that are not already registered since we already checked them
            .filter(p => !this._authenticationProviders.has(p.id))
            .filter(p => !!p.authorizationServerGlobs?.some(i => match(i, authServerStr, { ignoreCase: true })));
        // TODO:@TylerLeonhardt fan out?
        for (const provider of providers) {
            const activeProvider = await this.tryActivateProvider(provider.id, true);
            // Check the resolved authorization servers
            if (this.matchesProvider(activeProvider, authorizationServer, resourceServer)) {
                return activeProvider.id;
            }
        }
        return undefined;
    }
    async createDynamicAuthenticationProvider(authorizationServer, serverMetadata, resource) {
        const delegate = this._delegates[0];
        if (!delegate) {
            this._logService.error('No authentication provider host delegate found');
            return undefined;
        }
        const providerId = await delegate.create(authorizationServer, serverMetadata, resource);
        const provider = this._authenticationProviders.get(providerId);
        if (provider) {
            this._logService.debug(`Created dynamic authentication provider: ${providerId}`);
            this._dynamicAuthenticationProviderIds.add(providerId);
            return provider;
        }
        this._logService.error(`Failed to create dynamic authentication provider: ${providerId}`);
        return undefined;
    }
    registerAuthenticationProviderHostDelegate(delegate) {
        this._delegates.push(delegate);
        this._delegates.sort((a, b) => b.priority - a.priority);
        return {
            dispose: () => {
                const index = this._delegates.indexOf(delegate);
                if (index !== -1) {
                    this._delegates.splice(index, 1);
                }
            }
        };
    }
    matchesProvider(provider, authorizationServer, resourceServer) {
        // If a resourceServer is provided and the provider has a resourceServer defined, they must match
        if (resourceServer && provider.resourceServer) {
            const resourceServerStr = resourceServer.toString(true);
            const providerResourceServerStr = provider.resourceServer.toString(true);
            if (!equalsIgnoreCase(providerResourceServerStr, resourceServerStr)) {
                return false;
            }
        }
        if (provider.authorizationServers) {
            const authServerStr = authorizationServer.toString(true);
            for (const server of provider.authorizationServers) {
                const str = server.toString(true);
                if (equalsIgnoreCase(str, authServerStr) || match(str, authServerStr, { ignoreCase: true })) {
                    return true;
                }
            }
        }
        return false;
    }
    async tryActivateProvider(providerId, activateImmediate) {
        await this._extensionService.activateByEvent(getAuthenticationProviderActivationEvent(providerId), activateImmediate ? 1 /* ActivationKind.Immediate */ : 0 /* ActivationKind.Normal */);
        let provider = this._authenticationProviders.get(providerId);
        if (provider) {
            return provider;
        }
        if (this._disposedSource.token.isCancellationRequested) {
            throw new Error('Authentication service is disposed.');
        }
        const store = new DisposableStore();
        try {
            // TODO: Remove this timeout and figure out a better way to ensure auth providers
            // are registered _during_ extension activation.
            const result = await raceTimeout(raceCancellation(Event.toPromise(Event.filter(this.onDidRegisterAuthenticationProvider, e => e.id === providerId, store), store), this._disposedSource.token), 5000);
            provider = this._authenticationProviders.get(providerId);
            if (provider) {
                return provider;
            }
            if (!result) {
                throw new Error(`Timed out waiting for authentication provider '${providerId}' to register.`);
            }
            throw new Error(`No authentication provider '${providerId}' is currently registered.`);
        }
        finally {
            store.dispose();
        }
    }
};
AuthenticationService = __decorate([
    __param(0, IExtensionService),
    __param(1, IAuthenticationAccessService),
    __param(2, IBrowserWorkbenchEnvironmentService),
    __param(3, ILogService)
], AuthenticationService);
export { AuthenticationService };
registerSingleton(IAuthenticationService, AuthenticationService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGljYXRpb25TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzSSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMzRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUcvRyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNoRixPQUFPLEVBQW1RLHNCQUFzQixFQUF5QyxzQ0FBc0MsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3JaLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3RHLE9BQU8sRUFBa0IsaUJBQWlCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMxRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFckUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbkYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRXhELE9BQU8sRUFBeUUs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