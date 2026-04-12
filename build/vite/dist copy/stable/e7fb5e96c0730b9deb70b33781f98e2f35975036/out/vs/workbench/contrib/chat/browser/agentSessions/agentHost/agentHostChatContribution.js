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
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { isEqualOrParent } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentHostEnabledSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { isSessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionClientState } from '../../../../../../platform/agentHost/common/state/sessionClientState.js';
import { ROOT_STATE_URI } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { AgentCustomizationSyncProvider } from './agentCustomizationSyncProvider.js';
import { resolveTokenForResource } from './agentHostAuth.js';
import { AgentHostLanguageModelProvider } from './agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from './agentHostSessionHandler.js';
import { AgentHostSessionListController } from './agentHostSessionListController.js';
import { LoggingAgentConnection } from './loggingAgentConnection.js';
import { SyncedCustomizationBundler } from './syncedCustomizationBundler.js';
export { AgentHostSessionHandler } from './agentHostSessionHandler.js';
export { AgentHostSessionListController } from './agentHostSessionListController.js';
/**
 * Discovers available agents from the agent host process and dynamically
 * registers each one as a chat session type with its own session handler,
 * list controller, and language model provider.
 *
 * Gated on the `chat.agentHost.enabled` setting.
 */
let AgentHostContribution = class AgentHostContribution extends Disposable {
    static { this.ID = 'workbench.contrib.agentHostContribution'; }
    constructor(_agentHostService, _chatSessionsService, _defaultAccountService, _authenticationService, _logService, _languageModelsService, _instantiationService, _agentHostFileSystemService, configurationService, _customizationHarnessService, _storageService, _agentPluginService) {
        super();
        this._agentHostService = _agentHostService;
        this._chatSessionsService = _chatSessionsService;
        this._defaultAccountService = _defaultAccountService;
        this._authenticationService = _authenticationService;
        this._logService = _logService;
        this._languageModelsService = _languageModelsService;
        this._instantiationService = _instantiationService;
        this._customizationHarnessService = _customizationHarnessService;
        this._storageService = _storageService;
        this._agentPluginService = _agentPluginService;
        this._agentRegistrations = this._register(new DisposableMap());
        /** Model providers keyed by agent provider, for pushing model updates. */
        this._modelProviders = new Map();
        if (!configurationService.getValue(AgentHostEnabledSettingId)) {
            return;
        }
        // Wrap the agent host service with logging to a dedicated output channel
        this._loggedConnection = this._register(this._instantiationService.createInstance(LoggingAgentConnection, this._agentHostService, 'agentHostIpc.local', 'Agent Host (Local)'));
        this._register(_agentHostFileSystemService.registerAuthority('local', this._agentHostService));
        // Shared client state for protocol reconciliation
        this._clientState = this._register(new SessionClientState(this._agentHostService.clientId, this._logService, () => this._agentHostService.nextClientSeq()));
        // Forward action envelopes from the host to client state
        this._register(this._loggedConnection.onDidAction(envelope => {
            // Only root actions are relevant here; session actions are
            // handled by individual session handlers.
            if (!isSessionAction(envelope.action)) {
                this._clientState.receiveEnvelope(envelope);
            }
        }));
        // Forward notifications to client state
        this._register(this._loggedConnection.onDidNotification(n => {
            this._clientState.receiveNotification(n);
        }));
        // React to root state changes (agent discovery / removal)
        this._register(this._clientState.onDidChangeRootState(rootState => {
            this._handleRootStateChange(rootState);
        }));
        this._initializeAndSubscribe();
    }
    async _initializeAndSubscribe() {
        try {
            const snapshot = await this._loggedConnection.subscribe(URI.parse(ROOT_STATE_URI));
            if (this._store.isDisposed) {
                return;
            }
            // Feed snapshot into client state - fires onDidChangeRootState
            this._clientState.handleSnapshot(ROOT_STATE_URI, snapshot.state, snapshot.fromSeq);
        }
        catch (err) {
            this._logService.error('[AgentHost] Failed to subscribe to root state', err);
            this._loggedConnection.logError('subscribe(root)', err);
        }
    }
    _handleRootStateChange(rootState) {
        const incoming = new Set(rootState.agents.map(a => a.provider));
        // Remove agents that are no longer present
        for (const [provider] of this._agentRegistrations) {
            if (!incoming.has(provider)) {
                this._agentRegistrations.deleteAndDispose(provider);
                this._modelProviders.delete(provider);
            }
        }
        // Register new agents and push model updates to existing ones
        for (const agent of rootState.agents) {
            if (!this._agentRegistrations.has(agent.provider)) {
                this._registerAgent(agent);
            }
            else {
                // Push updated models to existing model provider
                const modelProvider = this._modelProviders.get(agent.provider);
                modelProvider?.updateModels(agent.models);
            }
        }
    }
    _registerAgent(agent) {
        const store = new DisposableStore();
        this._agentRegistrations.set(agent.provider, store);
        const sessionType = `agent-host-${agent.provider}`;
        const agentId = sessionType;
        const vendor = sessionType;
        // Chat session contribution
        store.add(this._chatSessionsService.registerChatSessionContribution({
            type: sessionType,
            name: agentId,
            displayName: agent.displayName,
            description: agent.description,
            canDelegate: true,
            requiresCustomModels: true,
            capabilities: {
                supportsCheckpoints: true,
            },
        }));
        // Session list controller
        const listController = store.add(this._instantiationService.createInstance(AgentHostSessionListController, sessionType, agent.provider, this._loggedConnection, undefined));
        store.add(this._chatSessionsService.registerChatSessionItemController(sessionType, listController));
        // Customization sync provider + bundler + observable
        const syncProvider = store.add(new AgentCustomizationSyncProvider(sessionType, this._storageService));
        const bundler = store.add(this._instantiationService.createInstance(SyncedCustomizationBundler, sessionType));
        store.add(this._customizationHarnessService.registerExternalHarness({
            id: sessionType,
            label: agent.displayName,
            icon: ThemeIcon.fromId(Codicon.server.id),
            hiddenSections: [],
            hideGenerateButton: true,
            getStorageSourceFilter: () => ({ sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin] }),
            syncProvider,
        }));
        const customizations = observableValue('agentCustomizations', []);
        const updateCustomizations = async () => {
            const refs = await this._resolveCustomizations(syncProvider, bundler);
            customizations.set(refs, undefined);
        };
        store.add(syncProvider.onDidChange(() => updateCustomizations()));
        updateCustomizations(); // resolve initial state
        // Session handler
        const sessionHandler = store.add(this._instantiationService.createInstance(AgentHostSessionHandler, {
            provider: agent.provider,
            agentId,
            sessionType,
            fullName: agent.displayName,
            description: agent.description,
            connection: this._loggedConnection,
            connectionAuthority: 'local',
            resolveAuthentication: () => this._resolveAuthenticationInteractively(),
            customizations,
        }));
        store.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));
        // Language model provider
        const vendorDescriptor = { vendor, displayName: agent.displayName, configuration: undefined, managementCommand: undefined, when: undefined };
        this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
        store.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
        const modelProvider = store.add(new AgentHostLanguageModelProvider(sessionType, vendor));
        modelProvider.updateModels(agent.models);
        this._modelProviders.set(agent.provider, modelProvider);
        store.add(toDisposable(() => this._modelProviders.delete(agent.provider)));
        store.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));
        // Push auth token and refresh models from server
        this._authenticateWithServer().then(() => this._loggedConnection.refreshModels()).catch(() => { });
        store.add(this._defaultAccountService.onDidChangeDefaultAccount(() => this._authenticateWithServer().then(() => this._loggedConnection.refreshModels()).catch(() => { })));
        store.add(this._authenticationService.onDidChangeSessions(() => this._authenticateWithServer().then(() => this._loggedConnection.refreshModels()).catch(() => { })));
    }
    /**
     * Resolves the customizations to include in the active client set.
     *
     * Classifies sync provider entries as plugins (matched against
     * installed plugins) or individual files (bundled into a synthetic
     * Open Plugin).
     */
    async _resolveCustomizations(syncProvider, bundler) {
        const entries = syncProvider.getSelectedEntries();
        if (entries.length === 0) {
            return [];
        }
        const plugins = this._agentPluginService.plugins.get();
        const refs = [];
        const individualFiles = [];
        for (const entry of entries) {
            const plugin = plugins.find(p => isEqualOrParent(entry.uri, p.uri));
            if (plugin) {
                refs.push({
                    uri: plugin.uri.toString(),
                    displayName: plugin.label,
                });
            }
            else if (entry.type) {
                individualFiles.push({ uri: entry.uri, type: entry.type });
            }
        }
        if (individualFiles.length > 0) {
            const result = await bundler.bundle(individualFiles);
            if (result) {
                refs.push(result.ref);
            }
        }
        return refs;
    }
    /**
     * Discover auth requirements from the server's resource metadata
     * and authenticate using matching tokens resolved via the standard
     * VS Code authentication service (same flow as MCP auth).
     */
    async _authenticateWithServer() {
        try {
            const metadata = await this._loggedConnection.getResourceMetadata();
            this._logService.trace(`[AgentHost] Resource metadata: ${metadata.resources.length} resource(s)`);
            for (const resource of metadata.resources) {
                const resourceUri = URI.parse(resource.resource);
                const token = await this._resolveTokenForResource(resourceUri, resource.authorization_servers ?? [], resource.scopes_supported ?? []);
                if (token) {
                    this._logService.info(`[AgentHost] Authenticating for resource: ${resource.resource}`);
                    await this._loggedConnection.authenticate({ resource: resource.resource, token });
                }
                else {
                    this._logService.info(`[AgentHost] No token resolved for resource: ${resource.resource}`);
                }
            }
        }
        catch (err) {
            this._logService.error('[AgentHost] Failed to authenticate with server', err);
            this._loggedConnection.logError('authenticateWithServer', err);
        }
    }
    /**
     * Resolve a bearer token for a set of authorization servers using the
     * standard VS Code authentication service provider resolution.
     */
    _resolveTokenForResource(resourceServer, authorizationServers, scopes) {
        return resolveTokenForResource(resourceServer, authorizationServers, scopes, this._authenticationService, this._logService, '[AgentHost]');
    }
    /**
     * Interactively prompt the user to authenticate when the server requires it.
     * Fetches resource metadata, resolves the auth provider, creates a session
     * (which triggers the login UI), and pushes the token to the server.
     * Returns true if authentication succeeded.
     */
    async _resolveAuthenticationInteractively() {
        try {
            const metadata = await this._loggedConnection.getResourceMetadata();
            for (const resource of metadata.resources) {
                for (const server of resource.authorization_servers ?? []) {
                    const serverUri = URI.parse(server);
                    const resourceUri = URI.parse(resource.resource);
                    const providerId = await this._authenticationService.getOrActivateProviderIdForServer(serverUri, resourceUri);
                    if (!providerId) {
                        continue;
                    }
                    // createSession will show the login UI if no session exists
                    const scopes = [...(resource.scopes_supported ?? [])];
                    const session = await this._authenticationService.createSession(providerId, scopes, {
                        activateImmediate: true,
                        authorizationServer: serverUri,
                    });
                    await this._loggedConnection.authenticate({
                        resource: resource.resource,
                        token: session.accessToken,
                    });
                    this._logService.info(`[AgentHost] Interactive authentication succeeded for ${resource.resource}`);
                    return true;
                }
            }
        }
        catch (err) {
            this._logService.error('[AgentHost] Interactive authentication failed', err);
            this._loggedConnection.logError('resolveAuthenticationInteractively', err);
        }
        return false;
    }
};
AgentHostContribution = __decorate([
    __param(0, IAgentHostService),
    __param(1, IChatSessionsService),
    __param(2, IDefaultAccountService),
    __param(3, IAuthenticationService),
    __param(4, ILogService),
    __param(5, ILanguageModelsService),
    __param(6, IInstantiationService),
    __param(7, IAgentHostFileSystemService),
    __param(8, IConfigurationService),
    __param(9, ICustomizationHarnessService),
    __param(10, IStorageService),
    __param(11, IAgentPluginService)
], AgentHostContribution);
export { AgentHostContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0Q2hhdENvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RDaGF0Q29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxpQkFBaUIsRUFBc0IsTUFBTSw2REFBNkQsQ0FBQztBQUUvSSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDdEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDN0csT0FBTyxFQUFFLGNBQWMsRUFBNEQsTUFBTSxtRUFBbUUsQ0FBQztBQUM3SixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUM1RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sOENB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