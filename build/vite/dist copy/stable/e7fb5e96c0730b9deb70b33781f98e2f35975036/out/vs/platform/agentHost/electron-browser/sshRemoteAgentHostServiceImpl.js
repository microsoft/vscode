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
import { Emitter } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ISharedProcessService } from '../../ipc/electron-browser/services.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IRemoteAgentHostService } from '../common/remoteAgentHostService.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { SSHRelayTransport } from './sshRelayTransport.js';
import { RemoteAgentHostProtocolClient } from './remoteAgentHostProtocolClient.js';
import { SSH_REMOTE_AGENT_HOST_CHANNEL, } from '../common/sshRemoteAgentHost.js';
/**
 * Renderer-side implementation of {@link ISSHRemoteAgentHostService} that
 * delegates the actual SSH work to the main process via IPC, then registers
 * the resulting connection with the renderer-local {@link IRemoteAgentHostService}.
 */
let SSHRemoteAgentHostService = class SSHRemoteAgentHostService extends Disposable {
    constructor(sharedProcessService, _remoteAgentHostService, _logService, _instantiationService, _configurationService) {
        super();
        this._remoteAgentHostService = _remoteAgentHostService;
        this._logService = _logService;
        this._instantiationService = _instantiationService;
        this._configurationService = _configurationService;
        this._onDidChangeConnections = this._register(new Emitter());
        this.onDidChangeConnections = this._onDidChangeConnections.event;
        this._connections = new Map();
        this._mainService = ProxyChannel.toService(sharedProcessService.getChannel(SSH_REMOTE_AGENT_HOST_CHANNEL));
        this.onDidReportConnectProgress = this._mainService.onDidReportConnectProgress;
        // When shared process fires onDidCloseConnection, clean up the renderer-side handle.
        // Do NOT remove the configured entry — it stays in settings so startup reconnect
        // can re-establish the SSH tunnel on next launch.
        this._register(this._mainService.onDidCloseConnection(connectionId => {
            const handle = this._connections.get(connectionId);
            if (handle) {
                this._connections.delete(connectionId);
                handle.fireClose();
                handle.dispose();
                this._onDidChangeConnections.fire();
            }
        }));
    }
    get connections() {
        return [...this._connections.values()];
    }
    async connect(config) {
        this._logService.info('[SSHRemoteAgentHost] Connecting to ' + config.host);
        const augmentedConfig = this._augmentConfig(config);
        const result = await this._mainService.connect(augmentedConfig);
        this._logService.trace('[SSHRemoteAgentHost] SSH tunnel established, connectionId=' + result.connectionId);
        const existing = this._connections.get(result.connectionId);
        if (existing) {
            this._logService.trace('[SSHRemoteAgentHost] Returning existing connection handle');
            return existing;
        }
        // Create relay transport + protocol client, then register with RemoteAgentHostService
        try {
            const protocolClient = this._createRelayClient(result);
            await protocolClient.connect();
            this._logService.trace('[SSHRemoteAgentHost] Protocol handshake completed');
            await this._remoteAgentHostService.addSSHConnection({
                address: result.address,
                name: result.name,
                connectionToken: result.connectionToken,
                sshConfigHost: result.sshConfigHost,
            }, protocolClient);
        }
        catch (err) {
            this._logService.error('[SSHRemoteAgentHost] Connection setup failed', err);
            this._mainService.disconnect(result.connectionId).catch(() => { });
            throw err;
        }
        const handle = new SSHAgentHostConnectionHandle(result.config, result.address, result.name, () => this._mainService.disconnect(result.connectionId));
        this._connections.set(result.connectionId, handle);
        this._onDidChangeConnections.fire();
        return handle;
    }
    async disconnect(host) {
        await this._mainService.disconnect(host);
    }
    async listSSHConfigHosts() {
        return this._mainService.listSSHConfigHosts();
    }
    async resolveSSHConfig(host) {
        return this._mainService.resolveSSHConfig(host);
    }
    async reconnect(sshConfigHost, name) {
        const commandOverride = this._getRemoteAgentHostCommand();
        const result = await this._mainService.reconnect(sshConfigHost, name, commandOverride);
        const existing = this._connections.get(result.connectionId);
        if (existing) {
            return existing;
        }
        const protocolClient = this._createRelayClient(result);
        await protocolClient.connect();
        await this._remoteAgentHostService.addSSHConnection({
            address: result.address,
            name: result.name,
            connectionToken: result.connectionToken,
            sshConfigHost: result.sshConfigHost,
        }, protocolClient);
        const handle = new SSHAgentHostConnectionHandle(result.config, result.address, result.name, () => this._mainService.disconnect(result.connectionId));
        this._connections.set(result.connectionId, handle);
        this._onDidChangeConnections.fire();
        return handle;
    }
    _createRelayClient(result) {
        const transport = new SSHRelayTransport(result.connectionId, this._mainService);
        return this._instantiationService.createInstance(RemoteAgentHostProtocolClient, result.address, transport);
    }
    _augmentConfig(config) {
        const commandOverride = this._getRemoteAgentHostCommand();
        if (commandOverride) {
            return { ...config, remoteAgentHostCommand: commandOverride };
        }
        return config;
    }
    _getRemoteAgentHostCommand() {
        return this._configurationService.getValue('chat.sshRemoteAgentHostCommand') || undefined;
    }
};
SSHRemoteAgentHostService = __decorate([
    __param(0, ISharedProcessService),
    __param(1, IRemoteAgentHostService),
    __param(2, ILogService),
    __param(3, IInstantiationService),
    __param(4, IConfigurationService)
], SSHRemoteAgentHostService);
export { SSHRemoteAgentHostService };
/**
 * Lightweight renderer-side handle that represents a connection
 * managed by the main process.
 */
class SSHAgentHostConnectionHandle extends Disposable {
    constructor(config, localAddress, name, disconnectFn) {
        super();
        this.config = config;
        this.localAddress = localAddress;
        this.name = name;
        this._onDidClose = this._register(new Emitter());
        this.onDidClose = this._onDidClose.event;
        this._closedByMain = false;
        // When this handle is disposed, tear down the main-process tunnel
        // (skip if already closed from the main process side)
        this._register(toDisposable(() => {
            if (!this._closedByMain) {
                disconnectFn().catch(() => { });
            }
        }));
    }
    /** Called by the service when the main process signals connection closure. */
    fireClose() {
        this._closedByMain = true;
        this._onDidClose.fire();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3NoUmVtb3RlQWdlbnRIb3N0U2VydmljZUltcGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvZWxlY3Ryb24tYnJvd3Nlci9zc2hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlSW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0UsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzNELE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ25GLE9BQU8sRUFFTiw2QkFBNkIsR0FNN0IsTUFBTSxpQ0FBaUMsQ0FBQztBQUV6Qzs7OztHQUlHO0FBQ0ksSUFBTSx5QkFBeUIsR0FBL0IsTUFBTSx5QkFBMEIsU0FBUSxVQUFVO0lBWXhELFlBQ3dCLG9CQUEyQyxFQUN6Qyx1QkFBaUUsRUFDN0UsV0FBeUMsRUFDL0IscUJBQTZELEVBQzdELHFCQUE2RDtRQUVwRixLQUFLLEVBQUUsQ0FBQztRQUxrQyw0QkFB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