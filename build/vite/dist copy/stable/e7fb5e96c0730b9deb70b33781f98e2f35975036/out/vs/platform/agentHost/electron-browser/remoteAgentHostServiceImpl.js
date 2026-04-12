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
var RemoteAgentHostService_1;
// Service implementation that manages WebSocket connections to remote agent
// host processes. Reads addresses from the `chat.remoteAgentHosts` setting
// and maintains connections, reconnecting as the setting changes.
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { DeferredPromise, raceTimeout } from '../../../base/common/async.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId, } from '../common/remoteAgentHostService.js';
import { RemoteAgentHostProtocolClient } from './remoteAgentHostProtocolClient.js';
import { WebSocketClientTransport } from './webSocketClientTransport.js';
import { normalizeRemoteAgentHostAddress } from '../common/agentHostUri.js';
let RemoteAgentHostService = class RemoteAgentHostService extends Disposable {
    static { RemoteAgentHostService_1 = this; }
    static { this.ConnectionWaitTimeout = 10000; }
    /** Initial reconnect delay in milliseconds. */
    static { this.ReconnectInitialDelay = 1000; }
    /** Maximum reconnect delay in milliseconds. */
    static { this.ReconnectMaxDelay = 30000; }
    constructor(_configurationService, _instantiationService, _logService) {
        super();
        this._configurationService = _configurationService;
        this._instantiationService = _instantiationService;
        this._logService = _logService;
        this._onDidChangeConnections = this._register(new Emitter());
        this.onDidChangeConnections = this._onDidChangeConnections.event;
        this._entries = new Map();
        this._names = new Map();
        this._tokens = new Map();
        this._pendingConnectionWaits = new Map();
        /** Pending reconnect timeouts, keyed by normalized address. */
        this._reconnectTimeouts = new Map();
        /** Current reconnect attempt count per address for exponential backoff. */
        this._reconnectAttempts = new Map();
        // React to setting changes
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(RemoteAgentHostsSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
                this._reconcileConnections();
            }
        }));
        // Initial connection
        this._reconcileConnections();
    }
    get connections() {
        const result = [];
        for (const [address, entry] of this._entries) {
            result.push({
                address,
                name: this._names.get(address) ?? address,
                clientId: entry.client.clientId,
                defaultDirectory: entry.client.defaultDirectory,
                status: entry.status,
            });
        }
        return result;
    }
    get configuredEntries() {
        return this._getConfiguredEntries().map(e => ({ ...e, address: normalizeRemoteAgentHostAddress(e.address) }));
    }
    getConnection(address) {
        const normalized = normalizeRemoteAgentHostAddress(address);
        const entry = this._entries.get(normalized);
        return entry?.connected ? entry.client : undefined;
    }
    reconnect(address) {
        const normalized = normalizeRemoteAgentHostAddress(address);
        // SSH entries are reconnected by the SSH service, not via WebSocket
        const configuredEntry = this._getConfiguredEntries().find(e => normalizeRemoteAgentHostAddress(e.address) === normalized);
        if (configuredEntry?.sshConfigHost) {
            return;
        }
        const token = this._tokens.get(normalized);
        // Cancel any pending reconnect
        this._cancelReconnect(normalized);
        this._reconnectAttempts.delete(normalized);
        // Tear down existing connection if present
        const entry = this._entries.get(normalized);
        if (entry) {
            this._entries.delete(normalized);
            entry.store.dispose();
        }
        // Start fresh connection attempt
        this._connectTo(normalized, token);
    }
    async addRemoteAgentHost(input) {
        if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
            throw new Error('Remote agent host connections are not enabled.');
        }
        const entry = { ...input, address: normalizeRemoteAgentHostAddress(input.address) };
        const existingConnection = this._getConnectionInfo(entry.address);
        await this._storeConfiguredEntries(this._upsertConfiguredEntry(entry));
        if (existingConnection) {
            return {
                ...existingConnection,
                name: entry.name,
            };
        }
        const connectedConnection = this._getConnectionInfo(entry.address);
        if (connectedConnection) {
            return connectedConnection;
        }
        const wait = this._getOrCreateConnectionWait(entry.address);
        const connection = await raceTimeout(wait.p, RemoteAgentHostService_1.ConnectionWaitTimeout, () => {
            this._pendingConnectionWaits.delete(entry.address);
        });
        if (!connection) {
            throw new Error(`Timed out connecting to ${entry.address}`);
        }
        return connection;
    }
    async addSSHConnection(entry, connection) {
        const address = entry.address;
        // Dispose any existing entry for this address to avoid leaking
        // old protocol clients and relay transports on reconnect.
        const existingEntry = this._entries.get(address);
        if (existingEntry) {
            this._entries.delete(address);
            existingEntry.store.dispose();
        }
        const store = new DisposableStore();
        // Create a connection entry wrapping the pre-connected client
        const protocolClient = connection;
        store.add(protocolClient);
        const connEntry = { store, client: protocolClient, connected: true, status: "connected" /* RemoteAgentHostConnectionStatus.Connected */ };
        this._entries.set(address, connEntry);
        this._names.set(address, entry.name);
        if (entry.connectionToken) {
            this._tokens.set(address, entry.connectionToken);
        }
        store.add(protocolClient.onDidClose(() => {
            if (this._entries.get(address) === connEntry) {
                connEntry.connected = false;
                connEntry.status = "disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */;
                this._onDidChangeConnections.fire();
            }
        }));
        // Persist SSH entries — await so that the config is written before
        // onDidChangeConnections fires, ensuring _reconcile creates the provider.
        await this._storeConfiguredEntries(this._upsertConfiguredEntry(entry));
        this._onDidChangeConnections.fire();
        return {
            address,
            name: entry.name,
            clientId: protocolClient.clientId,
            defaultDirectory: protocolClient.defaultDirectory,
            status: "connected" /* RemoteAgentHostConnectionStatus.Connected */,
        };
    }
    async removeRemoteAgentHost(address) {
        const normalized = normalizeRemoteAgentHostAddress(address);
        // This setting is only used in the sessions app (user scope), so we
        // don't need to inspect per-scope values like _upsertConfiguredEntry does.
        const entries = this._getConfiguredEntries().filter(e => normalizeRemoteAgentHostAddress(e.address) !== normalized);
        await this._storeConfiguredEntries(entries);
        // Eagerly clear in-memory state so the UI updates immediately
        // (the config change listener will reconcile, but this is instant).
        this._names.delete(normalized);
        this._tokens.delete(normalized);
        this._cancelReconnect(normalized);
        this._reconnectAttempts.delete(normalized);
        this._removeConnection(normalized);
    }
    _removeConnection(address) {
        const entry = this._entries.get(address);
        if (entry) {
            this._entries.delete(address);
            entry.store.dispose();
            this._rejectPendingConnectionWait(address, new Error(`Connection closed: ${address}`));
            this._onDidChangeConnections.fire();
        }
    }
    _reconcileConnections() {
        if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
            // Disconnect all when disabled
            for (const address of [...this._entries.keys()]) {
                this._cancelReconnect(address);
                this._removeConnection(address);
            }
            this._names.clear();
            this._tokens.clear();
            this._reconnectAttempts.clear();
            return;
        }
        const rawEntries = this._configurationService.getValue(RemoteAgentHostsSettingId) ?? [];
        const entries = rawEntries.map(e => ({ ...e, address: normalizeRemoteAgentHostAddress(e.address) }));
        const desired = new Set(entries.map(e => e.address));
        this._logService.info(`[RemoteAgentHost] Reconciling: desired=[${[...desired].join(', ')}], current=[${[...this._entries.keys()].map(a => `${a}(${this._entries.get(a).connected ? 'connected' : 'pending'})`).join(', ')}]`);
        // Update name map and detect name changes for existing connections
        let namesChanged = false;
        const oldNames = new Map(this._names);
        this._names.clear();
        this._tokens.clear();
        for (const entry of entries) {
            this._names.set(entry.address, entry.name);
            this._tokens.set(entry.address, entry.connectionToken);
            if (this._entries.has(entry.address) && oldNames.get(entry.address) !== entry.name) {
                namesChanged = true;
            }
        }
        // Remove connections no longer in the setting
        for (const address of [...this._entries.keys()]) {
            if (!desired.has(address)) {
                this._logService.info(`[RemoteAgentHost] Disconnecting from ${address}`);
                this._cancelReconnect(address);
                this._reconnectAttempts.delete(address);
                this._removeConnection(address);
            }
        }
        // Add new connections (skip SSH entries — those are handled by ISSHRemoteAgentHostService)
        for (const entry of entries) {
            if (!this._entries.has(entry.address) && !entry.sshConfigHost) {
                this._connectTo(entry.address, entry.connectionToken);
            }
        }
        // If only names changed (no add/remove), notify so the UI updates
        if (namesChanged) {
            this._onDidChangeConnections.fire();
        }
    }
    _connectTo(address, connectionToken) {
        // Dispose any existing entry for this address before creating a new one
        // to avoid leaking disposables on reconnect.
        const existingEntry = this._entries.get(address);
        if (existingEntry) {
            this._entries.delete(address);
            existingEntry.store.dispose();
        }
        const store = new DisposableStore();
        const transport = store.add(new WebSocketClientTransport(address, connectionToken));
        const client = store.add(this._instantiationService.createInstance(RemoteAgentHostProtocolClient, address, transport));
        const entry = { store, client, connected: false, status: "connecting" /* RemoteAgentHostConnectionStatus.Connecting */ };
        this._entries.set(address, entry);
        // Guard against stale callbacks: only act if the
        // current entry for this address is still the one we created.
        const isCurrentEntry = () => this._entries.get(address) === entry;
        store.add(client.onDidClose(() => {
            if (!isCurrentEntry()) {
                return;
            }
            this._logService.warn(`[RemoteAgentHost] Connection closed: ${address}`);
            entry.connected = false;
            entry.status = "disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */;
            this._onDidChangeConnections.fire();
            // Schedule reconnect if the address is still configured
            this._scheduleReconnect(address, connectionToken);
        }));
        this._logService.info(`[RemoteAgentHost] Connecting to ${address}`);
        this._onDidChangeConnections.fire();
        client.connect().then(() => {
            if (store.isDisposed) {
                return; // removed before connect resolved
            }
            this._logService.info(`[RemoteAgentHost] Connected to ${address}`);
            entry.connected = true;
            entry.status = "connected" /* RemoteAgentHostConnectionStatus.Connected */;
            this._reconnectAttempts.delete(address);
            this._resolvePendingConnectionWait(address);
            this._onDidChangeConnections.fire();
        }).catch(err => {
            if (!isCurrentEntry()) {
                return;
            }
            this._logService.error(`[RemoteAgentHost] Failed to connect to ${address}. Verify address and connectionToken`, err);
            entry.status = "disconnected" /* RemoteAgentHostConnectionStatus.Disconnected */;
            // Clean up the failed entry
            this._entries.delete(address);
            entry.store.dispose();
            this._rejectPendingConnectionWait(address, err);
            this._onDidChangeConnections.fire();
            // Schedule reconnect if the address is still configured
            this._scheduleReconnect(address, connectionToken);
        });
    }
    /**
     * Schedule a reconnect attempt with exponential backoff.
     * Only reconnects if the address is still in the configured entries.
     */
    _scheduleReconnect(address, connectionToken) {
        // Don't reconnect if the address was removed from settings
        if (!this._isAddressConfigured(address)) {
            this._logService.info(`[RemoteAgentHost] Not reconnecting to ${address}: no longer configured`);
            return;
        }
        const attempt = (this._reconnectAttempts.get(address) ?? 0) + 1;
        this._reconnectAttempts.set(address, attempt);
        const delay = Math.min(RemoteAgentHostService_1.ReconnectInitialDelay * Math.pow(2, attempt - 1), RemoteAgentHostService_1.ReconnectMaxDelay);
        this._logService.info(`[RemoteAgentHost] Scheduling reconnect to ${address} in ${delay}ms (attempt ${attempt})`);
        this._cancelReconnect(address);
        const timeout = setTimeout(() => {
            this._reconnectTimeouts.delete(address);
            if (this._isAddressConfigured(address)) {
                this._connectTo(address, connectionToken ?? this._tokens.get(address));
            }
        }, delay);
        this._reconnectTimeouts.set(address, timeout);
    }
    /** Cancel a pending reconnect timeout for the given address. */
    _cancelReconnect(address) {
        const timeout = this._reconnectTimeouts.get(address);
        if (timeout !== undefined) {
            clearTimeout(timeout);
            this._reconnectTimeouts.delete(address);
        }
    }
    /** Check whether the given normalized address is still in the configured entries. */
    _isAddressConfigured(address) {
        const entries = this._getConfiguredEntries();
        return entries.some(e => normalizeRemoteAgentHostAddress(e.address) === address);
    }
    _getConnectionInfo(address) {
        return this.connections.find(connection => connection.address === address && connection.status === "connected" /* RemoteAgentHostConnectionStatus.Connected */);
    }
    _getConfiguredEntries() {
        return this._configurationService.getValue(RemoteAgentHostsSettingId) ?? [];
    }
    _upsertConfiguredEntry(entry) {
        // Read from the same scope we'll write to, so we don't accidentally
        // merge entries from an overriding scope (e.g. workspace) into the
        // user scope and then lose them on the next read.
        const target = this._getConfigurationTarget();
        const inspected = this._configurationService.inspect(RemoteAgentHostsSettingId);
        let configuredEntries;
        switch (target) {
            case 3 /* ConfigurationTarget.USER_LOCAL */:
                configuredEntries = inspected.userLocalValue ?? [];
                break;
            case 4 /* ConfigurationTarget.USER_REMOTE */:
                configuredEntries = inspected.userRemoteValue ?? [];
                break;
            default:
                configuredEntries = inspected.userValue ?? [];
                break;
        }
        const normalizedAddress = normalizeRemoteAgentHostAddress(entry.address);
        const existingIndex = configuredEntries.findIndex(configuredEntry => normalizeRemoteAgentHostAddress(configuredEntry.address) === normalizedAddress);
        if (existingIndex === -1) {
            return [...configuredEntries, entry];
        }
        return configuredEntries.map((configuredEntry, index) => index === existingIndex ? entry : configuredEntry);
    }
    _getConfigurationTarget() {
        const inspected = this._configurationService.inspect(RemoteAgentHostsSettingId);
        if (inspected.userLocalValue !== undefined) {
            return 3 /* ConfigurationTarget.USER_LOCAL */;
        }
        if (inspected.userRemoteValue !== undefined) {
            return 4 /* ConfigurationTarget.USER_REMOTE */;
        }
        if (inspected.userValue !== undefined) {
            return 2 /* ConfigurationTarget.USER */;
        }
        return 2 /* ConfigurationTarget.USER */;
    }
    async _storeConfiguredEntries(entries) {
        await this._configurationService.updateValue(RemoteAgentHostsSettingId, entries, this._getConfigurationTarget());
    }
    _getOrCreateConnectionWait(address) {
        let wait = this._pendingConnectionWaits.get(address);
        if (wait) {
            return wait;
        }
        // If the connection is already available (fast connect resolved before
        // the caller called us), return an immediately-completed wait.
        const existingConnection = this._getConnectionInfo(address);
        if (existingConnection) {
            const immediateWait = new DeferredPromise();
            immediateWait.complete(existingConnection);
            return immediateWait;
        }
        wait = new DeferredPromise();
        this._pendingConnectionWaits.set(address, wait);
        return wait;
    }
    _resolvePendingConnectionWait(address) {
        const wait = this._pendingConnectionWaits.get(address);
        const connection = this._getConnectionInfo(address);
        if (!wait || !connection) {
            return;
        }
        this._pendingConnectionWaits.delete(address);
        void wait.complete(connection);
    }
    _rejectPendingConnectionWait(address, err) {
        const wait = this._pendingConnectionWaits.get(address);
        if (!wait) {
            return;
        }
        this._pendingConnectionWaits.delete(address);
        void wait.error(err);
    }
    dispose() {
        for (const timeout of this._reconnectTimeouts.values()) {
            clearTimeout(timeout);
        }
        this._reconnectTimeouts.clear();
        this._reconnectAttempts.clear();
        for (const [address, wait] of this._pendingConnectionWaits) {
            void wait.error(new Error(`Remote agent host service disposed before connecting to ${address}`));
        }
        this._pendingConnectionWaits.clear();
        for (const entry of this._entries.values()) {
            entry.store.dispose();
        }
        this._entries.clear();
        super.dispose();
    }
};
RemoteAgentHostService = RemoteAgentHostService_1 = __decorate([
    __param(0, IConfigurationService),
    __param(1, IInstantiationService),
    __param(2, ILogService)
], RemoteAgentHostService);
export { RemoteAgentHostService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRIb3N0U2VydmljZUltcGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvZWxlY3Ryb24tYnJvd3Nlci9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlSW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsNEVBQTRFO0FBQzVFLDJFQUEyRTtBQUMzRSxrRUFBa0U7QUFFbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUM3RSxPQUFPLEVBQXVCLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDekcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBR3RELE9BQU8sRUFHTixnQ0FBZ0MsRUFDaEMseUJBQXlCLEdBR3pCLE1BQU0scUNBQXFDLENBQUM7QUFDN0MsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbkYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekUsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFXckUsSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBdUIsU0FBUSxVQUFVOzthQUM3QiwwQkFBcUIsR0FBRyxLQUFLLEFBQVIsQ0FBUztJQUN0RCwrQ0FBK0M7YUFDdkIsMEJBQXFCLEdBQUcsSUFBSSxBQUFQLENBQVE7SUFDckQsK0NBQStDO2FBQ3ZCLHNC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LEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckcsTUFBTSxPQUFPLEdBQUcsSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBRXJELElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLDJDQUEyQyxDQUFDLEdBQUcsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFFLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUUvTixtRUFBbUU7UUFDbkUsSUFBSSxZQUFZLEdBQUcsS0FBSyxDQUFDO1FBQ3pCLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN0QyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3BCLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDckIsS0FBSyxNQUFNLEtBQUssSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMzQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN2RCxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFP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