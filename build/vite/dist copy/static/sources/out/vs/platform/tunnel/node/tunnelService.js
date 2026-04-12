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
import * as net from 'net';
import * as os from 'os';
import { BROWSER_RESTRICTED_PORTS, findFreePortFaster } from '../../../base/node/ports.js';
import { NodeSocket } from '../../../base/parts/ipc/node/ipc.net.js';
import { Barrier } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { OS } from '../../../base/common/platform.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { connectRemoteAgentTunnel } from '../../remote/common/remoteAgentConnection.js';
import { IRemoteSocketFactoryService } from '../../remote/common/remoteSocketFactoryService.js';
import { ISignService } from '../../sign/common/sign.js';
import { AbstractTunnelService, TunnelPrivacyId, isAllInterfaces, isLocalhost, isPortPrivileged, isTunnelProvider } from '../common/tunnel.js';
import { VSBuffer } from '../../../base/common/buffer.js';
async function createRemoteTunnel(options, defaultTunnelHost, tunnelRemoteHost, tunnelRemotePort, tunnelLocalPort) {
    let readyTunnel;
    for (let attempts = 3; attempts; attempts--) {
        readyTunnel?.dispose();
        const tunnel = new NodeRemoteTunnel(options, defaultTunnelHost, tunnelRemoteHost, tunnelRemotePort, tunnelLocalPort);
        readyTunnel = await tunnel.waitForReady();
        if ((tunnelLocalPort && BROWSER_RESTRICTED_PORTS[tunnelLocalPort]) || !BROWSER_RESTRICTED_PORTS[readyTunnel.tunnelLocalPort]) {
            break;
        }
    }
    return readyTunnel;
}
export class NodeRemoteTunnel extends Disposable {
    constructor(options, defaultTunnelHost, tunnelRemoteHost, tunnelRemotePort, suggestedLocalPort) {
        super();
        this.defaultTunnelHost = defaultTunnelHost;
        this.suggestedLocalPort = suggestedLocalPort;
        this.privacy = TunnelPrivacyId.Private;
        this._socketsDispose = new Map();
        this._options = options;
        this._server = net.createServer();
        this._barrier = new Barrier();
        this._listeningListener = () => this._barrier.open();
        this._server.on('listening', this._listeningListener);
        this._connectionListener = (socket) => this._onConnection(socket);
        this._server.on('connection', this._connectionListener);
        // If there is no error listener and there is an error it will crash the whole window
        this._errorListener = () => { };
        this._server.on('error', this._errorListener);
        this.tunnelRemotePort = tunnelRemotePort;
        this.tunnelRemoteHost = tunnelRemoteHost;
    }
    async dispose() {
        super.dispose();
        this._server.removeListener('listening', this._listeningListener);
        this._server.removeListener('connection', this._connectionListener);
        this._server.removeListener('error', this._errorListener);
        this._server.close();
        const disposers = Array.from(this._socketsDispose.values());
        disposers.forEach(disposer => {
            disposer();
        });
    }
    async waitForReady() {
        const startPort = this.suggestedLocalPort ?? this.tunnelRemotePort;
        const hostname = isAllInterfaces(this.defaultTunnelHost) ? '0.0.0.0' : '127.0.0.1';
        // try to get the same port number as the remote port number...
        let localPort = await findFreePortFaster(startPort, 2, 1000, hostname);
        // if that fails, the method above returns 0, which works out fine below...
        let address = null;
        this._server.listen(localPort, this.defaultTunnelHost);
        await this._barrier.wait();
        address = this._server.address();
        // It is possible for findFreePortFaster to return a port that there is already a server listening on. This causes the previous listen call to error out.
        if (!address) {
            localPort = 0;
            this._server.listen(localPort, this.defaultTunnelHost);
            await this._barrier.wait();
            address = this._server.address();
        }
        this.tunnelLocalPort = address.port;
        this.localAddress = `${this.tunnelRemoteHost === '127.0.0.1' ? '127.0.0.1' : 'localhost'}:${address.port}`;
        return this;
    }
    async _onConnection(localSocket) {
        // pause reading on the socket until we have a chance to forward its data
        localSocket.pause();
        const tunnelRemoteHost = (isLocalhost(this.tunnelRemoteHost) || isAllInterfaces(this.tunnelRemoteHost)) ? 'localhost' : this.tunnelRemoteHost;
        const protocol = await connectRemoteAgentTunnel(this._options, tunnelRemoteHost, this.tunnelRemotePort);
        const remoteSocket = protocol.getSocket();
        const dataChunk = protocol.readEntireBuffer();
        protocol.dispose();
        if (dataChunk.byteLength > 0) {
            localSocket.write(dataChunk.buffer);
        }
        localSocket.on('end', () => {
            if (localSocket.localAddress) {
                this._socketsDispose.delete(localSocket.localAddress);
            }
            remoteSocket.end();
        });
        localSocket.on('close', () => remoteSocket.end());
        localSocket.on('error', () => {
            if (localSocket.localAddress) {
                this._socketsDispose.delete(localSocket.localAddress);
            }
            if (remoteSocket instanceof NodeSocket) {
                remoteSocket.socket.destroy();
            }
            else {
                remoteSocket.end();
            }
        });
        if (remoteSocket instanceof NodeSocket) {
            this._mirrorNodeSocket(localSocket, remoteSocket);
        }
        else {
            this._mirrorGenericSocket(localSocket, remoteSocket);
        }
        if (localSocket.localAddress) {
            this._socketsDispose.set(localSocket.localAddress, () => {
                // Need to end instead of unpipe, otherwise whatever is connected locally could end up "stuck" with whatever state it had until manually exited.
                localSocket.end();
                remoteSocket.end();
            });
        }
    }
    _mirrorGenericSocket(localSocket, remoteSocket) {
        remoteSocket.onClose(() => localSocket.destroy());
        remoteSocket.onEnd(() => localSocket.end());
        remoteSocket.onData(d => localSocket.write(d.buffer));
        localSocket.on('data', d => remoteSocket.write(VSBuffer.wrap(d)));
        localSocket.resume();
    }
    _mirrorNodeSocket(localSocket, remoteNodeSocket) {
        const remoteSocket = remoteNodeSocket.socket;
        remoteSocket.on('end', () => localSocket.end());
        remoteSocket.on('close', () => localSocket.end());
        remoteSocket.on('error', () => {
            localSocket.destroy();
        });
        remoteSocket.pipe(localSocket);
        localSocket.pipe(remoteSocket);
    }
}
let BaseTunnelService = class BaseTunnelService extends AbstractTunnelService {
    constructor(remoteSocketFactoryService, logService, signService, productService, configurationService) {
        super(logService, configurationService);
        this.remoteSocketFactoryService = remoteSocketFactoryService;
        this.signService = signService;
        this.productService = productService;
    }
    isPortPrivileged(port) {
        return isPortPrivileged(port, this.defaultTunnelHost, OS, os.release());
    }
    retainOrCreateTunnel(addressOrTunnelProvider, remoteHost, remotePort, localHost, localPort, elevateIfNeeded, privacy, protocol) {
        const existing = this.getTunnelFromMap(remoteHost, remotePort);
        if (existing) {
            ++existing.refcount;
            return existing.value;
        }
        if (isTunnelProvider(addressOrTunnelProvider)) {
            return this.createWithProvider(addressOrTunnelProvider, remoteHost, remotePort, localPort, elevateIfNeeded, privacy, protocol);
        }
        else {
            this.logService.trace(`ForwardedPorts: (TunnelService) Creating tunnel without provider ${remoteHost}:${remotePort} on local port ${localPort}.`);
            const options = {
                commit: this.productService.commit,
                quality: this.productService.quality,
                addressProvider: addressOrTunnelProvider,
                remoteSocketFactoryService: this.remoteSocketFactoryService,
                signService: this.signService,
                logService: this.logService,
                ipcLogger: null
            };
            const tunnel = createRemoteTunnel(options, localHost, remoteHost, remotePort, localPort);
            this.logService.trace('ForwardedPorts: (TunnelService) Tunnel created without provider.');
            this.addTunnelToMap(remoteHost, remotePort, tunnel);
            return tunnel;
        }
    }
};
BaseTunnelService = __decorate([
    __param(0, IRemoteSocketFactoryService),
    __param(1, ILogService),
    __param(2, ISignService),
    __param(3, IProductService),
    __param(4, IConfigurationService)
], BaseTunnelService);
export { BaseTunnelService };
let TunnelService = class TunnelService extends BaseTunnelService {
    constructor(remoteSocketFactoryService, logService, signService, productService, configurationService) {
        super(remoteSocketFactoryService, logService, signService, productService, configurationService);
    }
};
TunnelService = __decorate([
    __param(0, IRemoteSocketFactoryService),
    __param(1, ILogService),
    __param(2, ISignService),
    __param(3, IProductService),
    __param(4, IConfigurationService)
], TunnelService);
export { TunnelService };
let SharedTunnelsService = class SharedTunnelsService extends Disposable {
    constructor(remoteSocketFactoryService, logService, productService, signService, configurationService) {
        super();
        this.remoteSocketFactoryService = remoteSocketFactoryService;
        this.logService = logService;
        this.productService = productService;
        this.signService = signService;
        this.configurationService = configurationService;
        this._tunnelServices = new Map();
    }
    async openTunnel(authority, addressProvider, remoteHost, remotePort, localHost, localPort, elevateIfNeeded, privacy, protocol) {
        this.logService.trace(`ForwardedPorts: (SharedTunnelService) openTunnel request for ${remoteHost}:${remotePort} on local port ${localPort}.`);
        if (!this._tunnelServices.has(authority)) {
            const tunnelService = new TunnelService(this.remoteSocketFactoryService, this.logService, this.signService, this.productService, this.configurationService);
            this._register(tunnelService);
            this._tunnelServices.set(authority, tunnelService);
            tunnelService.onTunnelClosed(async () => {
                if ((await tunnelService.tunnels).length === 0) {
                    tunnelService.dispose();
                    this._tunnelServices.delete(authority);
                }
            });
        }
        return this._tunnelServices.get(authority).openTunnel(addressProvider, remoteHost, remotePort, localHost, localPort, elevateIfNeeded, privacy, protocol);
    }
};
SharedTunnelsService = __decorate([
    __param(0, IRemoteSocketFactoryService),
    __param(1, ILogService),
    __param(2, IProductService),
    __param(3, ISignService),
    __param(4, IConfigurationService)
], SharedTunnelsService);
export { SharedTunnelsService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVubmVsU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3R1bm5lbC9ub2RlL3R1bm5lbFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxLQUFLLENBQUM7QUFDM0IsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDekIsT0FBTyxFQUFFLHdCQUF3QixFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDM0YsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRXJFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLEVBQUUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXRELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUF3Qyx3QkFBd0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlILE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN6RCxPQUFPLEVBQUUscUJBQXFCLEVBQXdFLGVBQWUsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDck4sT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxD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