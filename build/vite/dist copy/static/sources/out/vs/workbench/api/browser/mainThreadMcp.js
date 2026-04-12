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
import { mapFindFirst } from '../../../base/common/arraysFind.js';
import { disposableTimeout, RunOnceScheduler } from '../../../base/common/async.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../base/common/observable.js';
import Severity from '../../../base/common/severity.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import * as nls from '../../../nls.js';
import { ContextKeyExpr, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { LogLevel } from '../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchMcpGatewayService } from '../../contrib/mcp/common/mcpGatewayService.js';
import { IMcpRegistry } from '../../contrib/mcp/common/mcpRegistryTypes.js';
import { extensionPrefixedIdentifier, McpConnectionState, McpServerDefinition, McpServerLaunch, UserInteractionRequiredError } from '../../contrib/mcp/common/mcpTypes.js';
import { IAuthenticationMcpAccessService } from '../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../services/authentication/browser/authenticationMcpService.js';
import { IAuthenticationMcpUsageService } from '../../services/authentication/browser/authenticationMcpUsageService.js';
import { IAuthenticationService } from '../../services/authentication/common/authentication.js';
import { IDynamicAuthenticationProviderStorageService } from '../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { extensionHostKindToString } from '../../services/extensions/common/extensionHostKind.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
let MainThreadMcp = class MainThreadMcp extends Disposable {
    constructor(_extHostContext, _mcpRegistry, dialogService, _authenticationService, authenticationMcpServersService, authenticationMCPServerAccessService, authenticationMCPServerUsageService, _dynamicAuthenticationProviderStorageService, _extensionService, _contextKeyService, _telemetryService, _mcpGatewayService) {
        super();
        this._extHostContext = _extHostContext;
        this._mcpRegistry = _mcpRegistry;
        this.dialogService = dialogService;
        this._authenticationService = _authenticationService;
        this.authenticationMcpServersService = authenticationMcpServersService;
        this.authenticationMCPServerAccessService = authenticationMCPServerAccessService;
        this.authenticationMCPServerUsageService = authenticationMCPServerUsageService;
        this._dynamicAuthenticationProviderStorageService = _dynamicAuthenticationProviderStorageService;
        this._extensionService = _extensionService;
        this._contextKeyService = _contextKeyService;
        this._telemetryService = _telemetryService;
        this._mcpGatewayService = _mcpGatewayService;
        this._serverIdCounter = 0;
        this._servers = new Map();
        this._serverDefinitions = new Map();
        this._serverAuthTracking = new McpServerAuthTracker();
        this._collectionDefinitions = this._register(new DisposableMap());
        this._gateways = this._register(new DisposableMap());
        this._register(_authenticationService.onDidChangeSessions(e => this._onDidChangeAuthSessions(e.providerId, e.label)));
        const proxy = this._proxy = _extHostContext.getProxy(ExtHostContext.ExtHostMcp);
        this._register(this._mcpRegistry.registerDelegate({
            // Prefer Node.js extension hosts when they're available. No CORS issues etc.
            priority: _extHostContext.extensionHostKind === 2 /* ExtensionHostKind.LocalWebWorker */ ? 0 : 1,
            waitForInitialProviderPromises() {
                return proxy.$waitForInitialCollectionProviders();
            },
            canStart(collection, serverDefinition) {
                if (collection.remoteAuthority !== _extHostContext.remoteAuthority) {
                    return false;
                }
                if (serverDefinition.launch.type === 1 /* McpServerTransportType.Stdio */ && _extHostContext.extensionHostKind === 2 /* ExtensionHostKind.LocalWebWorker */) {
                    return false;
                }
                return true;
            },
            async substituteVariables(serverDefinition, launch) {
                const ser = await proxy.$substituteVariables(serverDefinition.variableReplacement?.folder?.uri, McpServerLaunch.toSerialized(launch));
                return McpServerLaunch.fromSerialized(ser);
            },
            start: (_collection, serverDefiniton, resolveLaunch, options) => {
                const id = ++this._serverIdCounter;
                const launch = new ExtHostMcpServerLaunch(_extHostContext.extensionHostKind, () => proxy.$stopMcp(id), msg => proxy.$sendMessage(id, JSON.stringify(msg)));
                this._servers.set(id, launch);
                this._serverDefinitions.set(id, serverDefiniton);
                proxy.$startMcp(id, {
                    launch: resolveLaunch,
                    defaultCwd: serverDefiniton.variableReplacement?.folder?.uri,
                    errorOnUserInteraction: options?.errorOnUserInteraction,
                });
                return launch;
            },
        }));
        // Subscribe to MCP server definition changes and notify ext host
        const onDidChangeMcpServerDefinitionsTrigger = this._register(new RunOnceScheduler(() => this._publishServerDefinitions(), 500));
        this._register(autorun(reader => {
            const collections = this._mcpRegistry.collections.read(reader);
            // Read all server definitions to track changes
            for (const collection of collections) {
                collection.serverDefinitions.read(reader);
            }
            // Notify ext host that definitions changed (it will re-fetch if needed)
            if (!onDidChangeMcpServerDefinitionsTrigger.isScheduled()) {
                onDidChangeMcpServerDefinitionsTrigger.schedule();
            }
        }));
        onDidChangeMcpServerDefinitionsTrigger.schedule();
    }
    _publishServerDefinitions() {
        const collections = this._mcpRegistry.collections.get();
        const allServers = [];
        for (const collection of collections) {
            const servers = collection.serverDefinitions.get();
            for (const server of servers) {
                allServers.push(McpServerDefinition.toSerialized(server));
            }
        }
        this._proxy.$onDidChangeMcpServerDefinitions(allServers);
    }
    $upsertMcpCollection(collection, serversDto) {
        const servers = serversDto.map(McpServerDefinition.fromSerialized);
        const existing = this._collectionDefinitions.get(collection.id);
        if (existing) {
            existing.servers.set(servers, undefined);
        }
        else {
            const serverDefinitions = observableValue('mcpServers', servers);
            const extensionId = new ExtensionIdentifier(collection.extensionId);
            const store = new DisposableStore();
            const handle = store.add(new MutableDisposable());
            const register = () => {
                handle.value ??= this._mcpRegistry.registerCollection({
                    ...collection,
                    source: extensionId,
                    resolveServerLanch: collection.canResolveLaunch ? (async (def) => {
                        const r = await this._proxy.$resolveMcpLaunch(collection.id, def.label);
                        return r ? McpServerLaunch.fromSerialized(r) : undefined;
                    }) : undefined,
                    trustBehavior: collection.isTrustedByDefault ? 0 /* McpServerTrust.Kind.Trusted */ : 1 /* McpServerTrust.Kind.TrustedOnNonce */,
                    remoteAuthority: this._extHostContext.remoteAuthority,
                    serverDefinitions,
                });
            };
            const whenClauseStr = mapFindFirst(this._extensionService.extensions, e => ExtensionIdentifier.equals(extensionId, e.identifier)
                ? e.contributes?.mcpServerDefinitionProviders?.find(p => extensionPrefixedIdentifier(extensionId, p.id) === collection.id)?.when
                : undefined);
            const whenClause = whenClauseStr && ContextKeyExpr.deserialize(whenClauseStr);
            if (!whenClause) {
                register();
            }
            else {
                const evaluate = () => {
                    if (this._contextKeyService.contextMatchesRules(whenClause)) {
                        register();
                    }
                    else {
                        handle.clear();
                    }
                };
                store.add(this._contextKeyService.onDidChangeContext(evaluate));
                evaluate();
            }
            this._collectionDefinitions.set(collection.id, {
                servers: serverDefinitions,
                dispose: () => store.dispose(),
            });
        }
    }
    $deleteMcpCollection(collectionId) {
        this._collectionDefinitions.deleteAndDispose(collectionId);
    }
    $onDidChangeState(id, update) {
        const server = this._servers.get(id);
        if (!server) {
            return;
        }
        server.state.set(update, undefined);
        if (!McpConnectionState.isRunning(update)) {
            server.dispose();
            this._servers.delete(id);
            this._serverDefinitions.delete(id);
            this._serverAuthTracking.untrack(id);
        }
    }
    $onDidPublishLog(id, level, log) {
        if (typeof level === 'string') {
            level = LogLevel.Info;
            log = level;
        }
        this._servers.get(id)?.pushLog(level, log);
    }
    $onDidReceiveMessage(id, message) {
        this._servers.get(id)?.pushMessage(message);
    }
    async $getTokenForProviderId(id, providerId, scopes, options = {}) {
        const server = this._serverDefinitions.get(id);
        if (!server) {
            return undefined;
        }
        return this._getSessionForProvider(id, server, providerId, scopes, undefined, options.errorOnUserInteraction);
    }
    async $getTokenFromServerMetadata(id, authDetails, { errorOnUserInteraction, forceNewRegistration } = {}) {
        const server = this._serverDefinitions.get(id);
        if (!server) {
            return undefined;
        }
        const authorizationServer = URI.revive(authDetails.authorizationServer);
        const resourceServer = authDetails.resourceMetadata?.resource ? URI.parse(authDetails.resourceMetadata.resource) : undefined;
        const resolvedScopes = authDetails.scopes ?? authDetails.resourceMetadata?.scopes_supported ?? authDetails.authorizationServerMetadata.scopes_supported ?? [];
        let providerId = await this._authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceServer);
        if (forceNewRegistration && providerId) {
            if (!this._authenticationService.isDynamicAuthenticationProvider(providerId)) {
                throw new Error('Cannot force new registration for a non-dynamic authentication provider.');
            }
            this._authenticationService.unregisterAuthenticationProvider(providerId);
            // TODO: Encapsulate this and the unregister in one call in the auth service
            await this._dynamicAuthenticationProviderStorageService.removeDynamicProvider(providerId);
            providerId = undefined;
        }
        if (!providerId) {
            const provider = await this._authenticationService.createDynamicAuthenticationProvider(authorizationServer, authDetails.authorizationServerMetadata, authDetails.resourceMetadata);
            if (!provider) {
                return undefined;
            }
            providerId = provider.id;
        }
        return this._getSessionForProvider(id, server, providerId, resolvedScopes, authorizationServer, errorOnUserInteraction);
    }
    async _getSessionForProvider(serverId, server, providerId, scopes, authorizationServer, errorOnUserInteraction = false) {
        const sessions = await this._authenticationService.getSessions(providerId, scopes, { authorizationServer }, true);
        const accountNamePreference = this.authenticationMcpServersService.getAccountPreference(server.id, providerId);
        let matchingAccountPreferenceSession;
        if (accountNamePreference) {
            matchingAccountPreferenceSession = sessions.find(session => session.account.label === accountNamePreference);
        }
        const provider = this._authenticationService.getProvider(providerId);
        let session;
        if (sessions.length) {
            // If we have an existing session preference, use that. If not, we'll return any valid session at the end of this function.
            if (matchingAccountPreferenceSession && this.authenticationMCPServerAccessService.isAccessAllowed(providerId, matchingAccountPreferenceSession.account.label, server.id)) {
                this.authenticationMCPServerUsageService.addAccountUsage(providerId, matchingAccountPreferenceSession.account.label, scopes, server.id, server.label);
                this._serverAuthTracking.track(providerId, serverId, scopes);
                return matchingAccountPreferenceSession.accessToken;
            }
            // If we only have one account for a single auth provider, lets just check if it's allowed and return it if it is.
            if (!provider.supportsMultipleAccounts && this.authenticationMCPServerAccessService.isAccessAllowed(providerId, sessions[0].account.label, server.id)) {
                this.authenticationMCPServerUsageService.addAccountUsage(providerId, sessions[0].account.label, scopes, server.id, server.label);
                this._serverAuthTracking.track(providerId, serverId, scopes);
                return sessions[0].accessToken;
            }
        }
        if (errorOnUserInteraction) {
            throw new UserInteractionRequiredError('authentication');
        }
        const isAllowed = await this.loginPrompt(server.label, provider.label, false);
        if (!isAllowed) {
            throw new Error('User did not consent to login.');
        }
        if (sessions.length) {
            if (provider.supportsMultipleAccounts && errorOnUserInteraction) {
                throw new UserInteractionRequiredError('authentication');
            }
            session = provider.supportsMultipleAccounts
                ? await this.authenticationMcpServersService.selectSession(providerId, server.id, server.label, scopes, sessions)
                : sessions[0];
        }
        else {
            if (errorOnUserInteraction) {
                throw new UserInteractionRequiredError('authentication');
            }
            const accountToCreate = matchingAccountPreferenceSession?.account;
            do {
                session = await this._authenticationService.createSession(providerId, scopes, {
                    activateImmediate: true,
                    account: accountToCreate,
                    authorizationServer
                });
            } while (accountToCreate
                && accountToCreate.label !== session.account.label
                && !await this.continueWithIncorrectAccountPrompt(session.account.label, accountToCreate.label));
        }
        this.authenticationMCPServerAccessService.updateAllowedMcpServers(providerId, session.account.label, [{ id: server.id, name: server.label, allowed: true }]);
        this.authenticationMcpServersService.updateAccountPreference(server.id, providerId, session.account);
        this.authenticationMCPServerUsageService.addAccountUsage(providerId, session.account.label, scopes, server.id, server.label);
        this._serverAuthTracking.track(providerId, serverId, scopes);
        return session.accessToken;
    }
    async continueWithIncorrectAccountPrompt(chosenAccountLabel, requestedAccountLabel) {
        const result = await this.dialogService.prompt({
            message: nls.localize('incorrectAccount', "Incorrect account detected"),
            detail: nls.localize('incorrectAccountDetail', "The chosen account, {0}, does not match the requested account, {1}.", chosenAccountLabel, requestedAccountLabel),
            type: Severity.Warning,
            cancelButton: true,
            buttons: [
                {
                    label: nls.localize('keep', 'Keep {0}', chosenAccountLabel),
                    run: () => chosenAccountLabel
                },
                {
                    label: nls.localize('loginWith', 'Login with {0}', requestedAccountLabel),
                    run: () => requestedAccountLabel
                }
            ],
        });
        if (!result.result) {
            throw new CancellationError();
        }
        return result.result === chosenAccountLabel;
    }
    async _onDidChangeAuthSessions(providerId, providerLabel) {
        const serversUsingProvider = this._serverAuthTracking.get(providerId);
        if (!serversUsingProvider) {
            return;
        }
        for (const { serverId, scopes } of serversUsingProvider) {
            const server = this._servers.get(serverId);
            const serverDefinition = this._serverDefinitions.get(serverId);
            if (!server || !serverDefinition) {
                continue;
            }
            // Only validate servers that are running
            const state = server.state.get();
            if (state.state !== 2 /* McpConnectionState.Kind.Running */) {
                continue;
            }
            // Validate if the session is still available
            try {
                await this._getSessionForProvider(serverId, serverDefinition, providerId, scopes, undefined, true);
            }
            catch (e) {
                if (UserInteractionRequiredError.is(e)) {
                    // Session is no longer valid, stop the server
                    server.pushLog(LogLevel.Warning, nls.localize('mcpAuthSessionRemoved', "Authentication session for {0} removed, stopping server", providerLabel));
                    server.stop();
                }
                // Ignore other errors to avoid disrupting other servers
            }
        }
    }
    $logMcpAuthSetup(data) {
        this._telemetryService.publicLog2('mcp/authSetup', data);
    }
    async $startMcpGateway() {
        const result = await this._mcpGatewayService.createGateway(this._extHostContext.extensionHostKind === 3 /* ExtensionHostKind.Remote */);
        if (!result) {
            return undefined;
        }
        if (this._store.isDisposed) {
            result.dispose();
            return undefined;
        }
        const gatewayId = generateUuid();
        const store = new DisposableStore();
        store.add(result);
        store.add(result.onDidChangeServers(servers => {
            this._proxy.$onDidChangeGatewayServers(gatewayId, servers.map(s => ({ label: s.label, address: s.address })));
        }));
        this._gateways.set(gatewayId, store);
        return {
            servers: result.servers.map(s => ({ label: s.label, address: s.address })),
            gatewayId,
        };
    }
    $disposeMcpGateway(gatewayId) {
        this._gateways.deleteAndDispose(gatewayId);
    }
    async loginPrompt(mcpLabel, providerLabel, recreatingSession) {
        const message = recreatingSession
            ? nls.localize('confirmRelogin', "The MCP Server Definition '{0}' wants you to authenticate to {1}.", mcpLabel, providerLabel)
            : nls.localize('confirmLogin', "The MCP Server Definition '{0}' wants to authenticate to {1}.", mcpLabel, providerLabel);
        const buttons = [
            {
                label: nls.localize({ key: 'allow', comment: ['&& denotes a mnemonic'] }, "&&Allow"),
                run() {
                    return true;
                },
            }
        ];
        const { result } = await this.dialogService.prompt({
            type: Severity.Info,
            message,
            buttons,
            cancelButton: true,
        });
        return result ?? false;
    }
    dispose() {
        for (const server of this._servers.values()) {
            server.extHostDispose();
        }
        this._servers.clear();
        this._serverDefinitions.clear();
        this._serverAuthTracking.clear();
        super.dispose();
    }
};
MainThreadMcp = __decorate([
    extHostNamedCustomer(MainContext.MainThreadMcp),
    __param(1, IMcpRegistry),
    __param(2, IDialogService),
    __param(3, IAuthenticationService),
    __param(4, IAuthenticationMcpService),
    __param(5, IAuthenticationMcpAccessService),
    __param(6, IAuthenticationMcpUsageService),
    __param(7, IDynamicAuthenticationProviderStorageService),
    __param(8, IExtensionService),
    __param(9, IContextKeyService),
    __param(10, ITelemetryService),
    __param(11, IWorkbenchMcpGatewayService)
], MainThreadMcp);
export { MainThreadMcp };
class ExtHostMcpServerLaunch extends Disposable {
    pushLog(level, message) {
        this._onDidLog.fire({ message, level });
    }
    pushMessage(message) {
        let parsed;
        try {
            parsed = JSON.parse(message);
        }
        catch (e) {
            this.pushLog(LogLevel.Warning, `Failed to parse message: ${JSON.stringify(message)}`);
        }
        if (parsed) {
            if (Array.isArray(parsed)) { // streamable HTTP supports batching
                parsed.forEach(p => this._onDidReceiveMessage.fire(p));
            }
            else {
                this._onDidReceiveMessage.fire(parsed);
            }
        }
    }
    constructor(extHostKind, stop, send) {
        super();
        this.stop = stop;
        this.send = send;
        this.state = observableValue('mcpServerState', { state: 1 /* McpConnectionState.Kind.Starting */ });
        this._onDidLog = this._register(new Emitter());
        this.onDidLog = this._onDidLog.event;
        this._onDidReceiveMessage = this._register(new Emitter());
        this.onDidReceiveMessage = this._onDidReceiveMessage.event;
        this._register(disposableTimeout(() => {
            this.pushLog(LogLevel.Info, `Starting server from ${extensionHostKindToString(extHostKind)} extension host`);
        }));
    }
    extHostDispose() {
        if (McpConnectionState.isRunning(this.state.get())) {
            this.pushLog(LogLevel.Warning, 'Extension host shut down, server will stop.');
            this.state.set({ state: 0 /* McpConnectionState.Kind.Stopped */ }, undefined);
        }
        this.dispose();
    }
    dispose() {
        if (McpConnectionState.isRunning(this.state.get())) {
            this.stop();
        }
        super.dispose();
    }
}
/**
 * Tracks which MCP servers are using which authentication providers.
 * Organized by provider ID for efficient lookup when auth sessions change.
 */
class McpServerAuthTracker {
    constructor() {
        // Provider ID -> Array of serverId and scopes used
        this._tracking = new Map();
    }
    /**
     * Track authentication for a server with a specific provider.
     * Replaces any existing tracking for this server/provider combination.
     */
    track(providerId, serverId, scopes) {
        const servers = this._tracking.get(providerId) || [];
        const filtered = servers.filter(s => s.serverId !== serverId);
        filtered.push({ serverId, scopes });
        this._tracking.set(providerId, filtered);
    }
    /**
     * Remove all authentication tracking for a server across all providers.
     */
    untrack(serverId) {
        for (const [providerId, servers] of this._tracking.entries()) {
            const filtered = servers.filter(s => s.serverId !== serverId);
            if (filtered.length === 0) {
                this._tracking.delete(providerId);
            }
            else {
                this._tracking.set(providerId, filtered);
            }
        }
    }
    /**
     * Get all servers using a specific authentication provider.
     */
    get(providerId) {
        return this._tracking.get(providerId);
    }
    /**
     * Clear all tracking data.
     */
    clear() {
        this._tracking.clear();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZE1jcC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkTWNwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNwRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbEgsT0FBTyxFQUFFLE9BQU8sRUFBdUIsZUFBZSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbkcsT0FBTyxRQUFRLE1BQU0sa0NBQWtDLENBQUM7QUFDeEQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RCxPQUFPLEtBQUssR0FBRyxNQUFNLGlCQUFpQixDQUFDO0FBQ3ZDLE9BQU8sRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN2RyxPQUFPLEVBQUUsY0FBYyxFQUFpQixNQUFNLDZDQUE2QyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpREFBaUQsQ0FB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