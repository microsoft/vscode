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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getDelayedChannel, IPCLogger } from '../../../../base/parts/ipc/common/ipc.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { connectRemoteAgentManagement } from '../../../../platform/remote/common/remoteAgentConnection.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { RemoteExtensionEnvironmentChannelClient } from './remoteAgentEnvironmentChannel.js';
import { Emitter } from '../../../../base/common/event.js';
import { ISignService } from '../../../../platform/sign/common/sign.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IRemoteSocketFactoryService } from '../../../../platform/remote/common/remoteSocketFactoryService.js';
let AbstractRemoteAgentService = class AbstractRemoteAgentService extends Disposable {
    constructor(remoteSocketFactoryService, userDataProfileService, _environmentService, productService, _remoteAuthorityResolverService, signService, _logService) {
        super();
        this.remoteSocketFactoryService = remoteSocketFactoryService;
        this.userDataProfileService = userDataProfileService;
        this._environmentService = _environmentService;
        this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
        this._logService = _logService;
        if (this._environmentService.remoteAuthority) {
            this._connection = this._register(new RemoteAgentConnection(this._environmentService.remoteAuthority, productService.commit, productService.quality, this.remoteSocketFactoryService, this._remoteAuthorityResolverService, signService, this._logService));
        }
        else {
            this._connection = null;
        }
        this._environment = null;
    }
    getConnection() {
        return this._connection;
    }
    getEnvironment() {
        return this.getRawEnvironment().then(undefined, () => null);
    }
    getRawEnvironment() {
        if (!this._environment) {
            this._environment = this._withChannel(async (channel, connection) => {
                const env = await RemoteExtensionEnvironmentChannelClient.getEnvironmentData(channel, connection.remoteAuthority, this.userDataProfileService.currentProfile.isDefault ? undefined : this.userDataProfileService.currentProfile.id);
                this._remoteAuthorityResolverService._setAuthorityConnectionToken(connection.remoteAuthority, env.connectionToken);
                if (typeof env.reconnectionGraceTime === 'number') {
                    this._logService.info(`[reconnection-grace-time] Client received grace time from server: ${env.reconnectionGraceTime}ms (${Math.floor(env.reconnectionGraceTime / 1000)}s)`);
                    connection.updateGraceTime(env.reconnectionGraceTime);
                }
                else {
                    this._logService.info(`[reconnection-grace-time] Server did not provide grace time, using default`);
                }
                return env;
            }, null);
        }
        return this._environment;
    }
    getExtensionHostExitInfo(reconnectionToken) {
        return this._withChannel((channel, connection) => RemoteExtensionEnvironmentChannelClient.getExtensionHostExitInfo(channel, connection.remoteAuthority, reconnectionToken), null);
    }
    getDiagnosticInfo(options) {
        return this._withChannel(channel => RemoteExtensionEnvironmentChannelClient.getDiagnosticInfo(channel, options), undefined);
    }
    updateTelemetryLevel(telemetryLevel) {
        return this._withTelemetryChannel(channel => RemoteExtensionEnvironmentChannelClient.updateTelemetryLevel(channel, telemetryLevel), undefined);
    }
    logTelemetry(eventName, data) {
        return this._withTelemetryChannel(channel => RemoteExtensionEnvironmentChannelClient.logTelemetry(channel, eventName, data), undefined);
    }
    flushTelemetry() {
        return this._withTelemetryChannel(channel => RemoteExtensionEnvironmentChannelClient.flushTelemetry(channel), undefined);
    }
    getRoundTripTime() {
        return this._withTelemetryChannel(async (channel) => {
            const start = Date.now();
            await RemoteExtensionEnvironmentChannelClient.ping(channel);
            return Date.now() - start;
        }, undefined);
    }
    async endConnection() {
        if (this._connection) {
            await this._connection.end();
            this._connection.dispose();
        }
    }
    _withChannel(callback, fallback) {
        const connection = this.getConnection();
        if (!connection) {
            return Promise.resolve(fallback);
        }
        return connection.withChannel('remoteextensionsenvironment', (channel) => callback(channel, connection));
    }
    _withTelemetryChannel(callback, fallback) {
        const connection = this.getConnection();
        if (!connection) {
            return Promise.resolve(fallback);
        }
        return connection.withChannel('telemetry', (channel) => callback(channel, connection));
    }
};
AbstractRemoteAgentService = __decorate([
    __param(0, IRemoteSocketFactoryService),
    __param(1, IUserDataProfileService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, IProductService),
    __param(4, IRemoteAuthorityResolverService),
    __param(5, ISignService),
    __param(6, ILogService)
], AbstractRemoteAgentService);
export { AbstractRemoteAgentService };
class RemoteAgentConnection extends Disposable {
    constructor(remoteAuthority, _commit, _quality, _remoteSocketFactoryService, _remoteAuthorityResolverService, _signService, _logService) {
        super();
        this._commit = _commit;
        this._quality = _quality;
        this._remoteSocketFactoryService = _remoteSocketFactoryService;
        this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
        this._signService = _signService;
        this._logService = _logService;
        this._onReconnecting = this._register(new Emitter());
        this.onReconnecting = this._onReconnecting.event;
        this._onDidStateChange = this._register(new Emitter());
        this.onDidStateChange = this._onDidStateChange.event;
        this._managementConnection = null;
        this.end = () => Promise.resolve();
        this.remoteAuthority = remoteAuthority;
        this._connection = null;
    }
    getChannel(channelName) {
        return getDelayedChannel(this._getOrCreateConnection().then(c => c.getChannel(channelName)));
    }
    withChannel(channelName, callback) {
        const channel = this.getChannel(channelName);
        const result = callback(channel);
        return result;
    }
    registerChannel(channelName, channel) {
        this._getOrCreateConnection().then(client => client.registerChannel(channelName, channel));
    }
    async getInitialConnectionTimeMs() {
        try {
            await this._getOrCreateConnection();
        }
        catch {
            // ignored -- time is measured even if connection fails
        }
        return this._initialConnectionMs;
    }
    getManagementConnection() {
        return this._managementConnection;
    }
    updateGraceTime(graceTime) {
        if (this._managementConnection) {
            this._managementConnection.updateGraceTime(graceTime);
        }
    }
    _getOrCreateConnection() {
        if (!this._connection) {
            this._connection = this._createConnection();
        }
        return this._connection;
    }
    async _createConnection() {
        let firstCall = true;
        const options = {
            commit: this._commit,
            quality: this._quality,
            addressProvider: {
                getAddress: async () => {
                    if (firstCall) {
                        firstCall = false;
                    }
                    else {
                        this._onReconnecting.fire(undefined);
                    }
                    const { authority } = await this._remoteAuthorityResolverService.resolveAuthority(this.remoteAuthority);
                    return { connectTo: authority.connectTo, connectionToken: authority.connectionToken };
                }
            },
            remoteSocketFactoryService: this._remoteSocketFactoryService,
            signService: this._signService,
            logService: this._logService,
            ipcLogger: false ? new IPCLogger(`Local \u2192 Remote`, `Remote \u2192 Local`) : null
        };
        let connection;
        const start = Date.now();
        try {
            connection = this._register(await connectRemoteAgentManagement(options, this.remoteAuthority, `renderer`));
            this._managementConnection = connection;
        }
        finally {
            this._initialConnectionMs = Date.now() - start;
        }
        this._register(connection.protocol.onDidDispose(() => {
            connection.dispose();
        }));
        this.end = () => {
            connection.protocol.sendDisconnect();
            return connection.protocol.drain();
        };
        this._register(connection.onDidStateChange(e => this._onDidStateChange.fire(e)));
        return connection.client;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RSZW1vdGVBZ2VudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvcmVtb3RlL2NvbW1vbi9hYnN0cmFjdFJlbW90ZUFnZW50U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUE0QixpQkFBaUIsRUFBRSxTQUFTLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVsSCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsNEJBQTRCLEVBQWlGLE1BQU0sNkRBQTZELENBQUM7QUFFMUwsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFaEgsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFN0YsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBRXhHLElBQWUsMEJBQTBCLEdBQXpDLE1BQWUsMEJBQTJCLFNBQVEsVUFBVTtJQU9sRSxZQUMrQywwQkFBdUQsRUFDM0Qsc0JBQStDLEVBQ3hDLG1CQUFpRCxFQUNqRixjQUErQixFQUNFLCtCQUFnRSxFQUNwRyxXQUF5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