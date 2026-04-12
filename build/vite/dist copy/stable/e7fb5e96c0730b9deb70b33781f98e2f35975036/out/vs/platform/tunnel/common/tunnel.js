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
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
export const ITunnelService = createDecorator('tunnelService');
export const ISharedTunnelsService = createDecorator('sharedTunnelsService');
export function isRemoteTunnel(something) {
    const asTunnel = something;
    return !!(asTunnel.tunnelRemotePort && asTunnel.tunnelRemoteHost && asTunnel.localAddress && asTunnel.privacy && asTunnel.dispose);
}
export var TunnelProtocol;
(function (TunnelProtocol) {
    TunnelProtocol["Http"] = "http";
    TunnelProtocol["Https"] = "https";
})(TunnelProtocol || (TunnelProtocol = {}));
export var TunnelPrivacyId;
(function (TunnelPrivacyId) {
    TunnelPrivacyId["ConstantPrivate"] = "constantPrivate";
    TunnelPrivacyId["Private"] = "private";
    TunnelPrivacyId["Public"] = "public";
})(TunnelPrivacyId || (TunnelPrivacyId = {}));
export function isTunnelProvider(addressOrTunnelProvider) {
    return !!addressOrTunnelProvider.forwardPort;
}
export var ProvidedOnAutoForward;
(function (ProvidedOnAutoForward) {
    ProvidedOnAutoForward[ProvidedOnAutoForward["Notify"] = 1] = "Notify";
    ProvidedOnAutoForward[ProvidedOnAutoForward["OpenBrowser"] = 2] = "OpenBrowser";
    ProvidedOnAutoForward[ProvidedOnAutoForward["OpenPreview"] = 3] = "OpenPreview";
    ProvidedOnAutoForward[ProvidedOnAutoForward["Silent"] = 4] = "Silent";
    ProvidedOnAutoForward[ProvidedOnAutoForward["Ignore"] = 5] = "Ignore";
    ProvidedOnAutoForward[ProvidedOnAutoForward["OpenBrowserOnce"] = 6] = "OpenBrowserOnce";
})(ProvidedOnAutoForward || (ProvidedOnAutoForward = {}));
export function extractLocalHostUriMetaDataForPortMapping(uri) {
    if (uri.scheme !== 'http' && uri.scheme !== 'https') {
        return undefined;
    }
    const localhostMatch = /^(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)$/.exec(uri.authority);
    if (!localhostMatch) {
        return undefined;
    }
    return {
        address: localhostMatch[1],
        port: +localhostMatch[2],
    };
}
export function extractQueryLocalHostUriMetaDataForPortMapping(uri) {
    if (uri.scheme !== 'http' && uri.scheme !== 'https' || !uri.query) {
        return undefined;
    }
    const keyvalues = uri.query.split('&');
    for (const keyvalue of keyvalues) {
        const value = keyvalue.split('=')[1];
        if (/^https?:/.exec(value)) {
            const result = extractLocalHostUriMetaDataForPortMapping(URI.parse(value));
            if (result) {
                return result;
            }
        }
    }
    return undefined;
}
export const LOCALHOST_ADDRESSES = ['localhost', '127.0.0.1', '0:0:0:0:0:0:0:1', '::1'];
export function isLocalhost(host) {
    return LOCALHOST_ADDRESSES.indexOf(host) >= 0;
}
export const ALL_INTERFACES_ADDRESSES = ['0.0.0.0', '0:0:0:0:0:0:0:0', '::'];
export function isAllInterfaces(host) {
    return ALL_INTERFACES_ADDRESSES.indexOf(host) >= 0;
}
export function isPortPrivileged(port, host, os, osRelease) {
    if (os === 1 /* OperatingSystem.Windows */) {
        return false;
    }
    if (os === 2 /* OperatingSystem.Macintosh */) {
        if (isAllInterfaces(host)) {
            const osVersion = (/(\d+)\.(\d+)\.(\d+)/g).exec(osRelease);
            if (osVersion?.length === 4) {
                const major = parseInt(osVersion[1]);
                if (major >= 18 /* since macOS Mojave, darwin version 18.0.0 */) {
                    return false;
                }
            }
        }
    }
    return port < 1024;
}
export class DisposableTunnel {
    constructor(remoteAddress, localAddress, _dispose) {
        this.remoteAddress = remoteAddress;
        this.localAddress = localAddress;
        this._dispose = _dispose;
        this._onDispose = new Emitter();
        this.onDidDispose = this._onDispose.event;
    }
    dispose() {
        this._onDispose.fire();
        this._onDispose.dispose();
        return this._dispose();
    }
}
let AbstractTunnelService = class AbstractTunnelService extends Disposable {
    constructor(logService, configurationService) {
        super();
        this.logService = logService;
        this.configurationService = configurationService;
        this._onTunnelOpened = this._register(new Emitter());
        this.onTunnelOpened = this._onTunnelOpened.event;
        this._onTunnelClosed = this._register(new Emitter());
        this.onTunnelClosed = this._onTunnelClosed.event;
        this._onAddedTunnelProvider = this._register(new Emitter());
        this.onAddedTunnelProvider = this._onAddedTunnelProvider.event;
        this._tunnels = new Map();
        this._canElevate = false;
        this._canChangeProtocol = true;
        this._privacyOptions = [];
        this._factoryInProgress = new Set();
    }
    get hasTunnelProvider() {
        return !!this._tunnelProvider;
    }
    get defaultTunnelHost() {
        const settingValue = this.configurationService.getValue('remote.localPortHost');
        return (!settingValue || settingValue === 'localhost') ? '127.0.0.1' : '0.0.0.0';
    }
    setTunnelProvider(provider) {
        this._tunnelProvider = provider;
        if (!provider) {
            // clear features
            this._canElevate = false;
            this._privacyOptions = [];
            this._onAddedTunnelProvider.fire();
            return {
                dispose: () => { }
            };
        }
        this._onAddedTunnelProvider.fire();
        return {
            dispose: () => {
                this._tunnelProvider = undefined;
                this._canElevate = false;
                this._privacyOptions = [];
            }
        };
    }
    setTunnelFeatures(features) {
        this._canElevate = features.elevation;
        this._privacyOptions = features.privacyOptions;
        this._canChangeProtocol = features.protocol;
    }
    get canChangeProtocol() {
        return this._canChangeProtocol;
    }
    get canElevate() {
        return this._canElevate;
    }
    get canChangePrivacy() {
        return this._privacyOptions.length > 0;
    }
    get privacyOptions() {
        return this._privacyOptions;
    }
    get tunnels() {
        return this.getTunnels();
    }
    async getTunnels() {
        const tunnels = [];
        const tunnelArray = Array.from(this._tunnels.values());
        for (const portMap of tunnelArray) {
            const portArray = Array.from(portMap.values());
            for (const x of portArray) {
                const tunnelValue = await x.value;
                if (tunnelValue && (typeof tunnelValue !== 'string')) {
                    tunnels.push(tunnelValue);
                }
            }
        }
        return tunnels;
    }
    async dispose() {
        super.dispose();
        for (const portMap of this._tunnels.values()) {
            for (const { value } of portMap.values()) {
                await value.then(tunnel => typeof tunnel !== 'string' ? tunnel?.dispose() : undefined);
            }
            portMap.clear();
        }
        this._tunnels.clear();
    }
    setEnvironmentTunnel(remoteHost, remotePort, localAddress, privacy, protocol) {
        this.addTunnelToMap(remoteHost, remotePort, Promise.resolve({
            tunnelRemoteHost: remoteHost,
            tunnelRemotePort: remotePort,
            localAddress,
            privacy,
            protocol,
            dispose: () => Promise.resolve()
        }));
    }
    async getExistingTunnel(remoteHost, remotePort) {
        if (isAllInterfaces(remoteHost) || isLocalhost(remoteHost)) {
            remoteHost = LOCALHOST_ADDRESSES[0];
        }
        const existing = this.getTunnelFromMap(remoteHost, remotePort);
        if (existing) {
            ++existing.refcount;
            return existing.value;
        }
        return undefined;
    }
    openTunnel(addressProvider, remoteHost, remotePort, localHost, localPort, elevateIfNeeded = false, privacy, protocol) {
        this.logService.trace(`ForwardedPorts: (TunnelService) openTunnel request for ${remoteHost}:${remotePort} on local port ${localPort}.`);
        const addressOrTunnelProvider = this._tunnelProvider ?? addressProvider;
        if (!addressOrTunnelProvider) {
            return undefined;
        }
        if (!remoteHost) {
            remoteHost = 'localhost';
        }
        if (!localHost) {
            localHost = this.defaultTunnelHost;
        }
        // Prevent tunnel factories from calling openTunnel from within the factory
        if (this._tunnelProvider && this._factoryInProgress.has(remotePort)) {
            this.logService.debug(`ForwardedPorts: (TunnelService) Another call to create a tunnel with the same address has occurred before the last one completed. This call will be ignored.`);
            return;
        }
        const resolvedTunnel = this.retainOrCreateTunnel(addressOrTunnelProvider, remoteHost, remotePort, localHost, localPort, elevateIfNeeded, privacy, protocol);
        if (!resolvedTunnel) {
            this.logService.trace(`ForwardedPorts: (TunnelService) Tunnel was not created.`);
            return resolvedTunnel;
        }
        return resolvedTunnel.then(tunnel => {
            if (!tunnel) {
                this.logService.trace('ForwardedPorts: (TunnelService) New tunnel is undefined.');
                this.removeEmptyOrErrorTunnelFromMap(remoteHost, remotePort);
                return undefined;
            }
            else if (typeof tunnel === 'string') {
                this.logService.trace('ForwardedPorts: (TunnelService) The tunnel provider returned an error when creating the tunnel.');
                this.removeEmptyOrErrorTunnelFromMap(remoteHost, remotePort);
                return tunnel;
            }
            this.logService.trace('ForwardedPorts: (TunnelService) New tunnel established.');
            const newTunnel = this.makeTunnel(tunnel);
            if (tunnel.tunnelRemoteHost !== remoteHost || tunnel.tunnelRemotePort !== remotePort) {
                this.logService.warn('ForwardedPorts: (TunnelService) Created tunnel does not match requirements of requested tunnel. Host or port mismatch.');
            }
            if (privacy && tunnel.privacy !== privacy) {
                this.logService.warn('ForwardedPorts: (TunnelService) Created tunnel does not match requirements of requested tunnel. Privacy mismatch.');
            }
            this._onTunnelOpened.fire(newTunnel);
            return newTunnel;
        });
    }
    makeTunnel(tunnel) {
        return {
            tunnelRemotePort: tunnel.tunnelRemotePort,
            tunnelRemoteHost: tunnel.tunnelRemoteHost,
            tunnelLocalPort: tunnel.tunnelLocalPort,
            localAddress: tunnel.localAddress,
            privacy: tunnel.privacy,
            protocol: tunnel.protocol,
            dispose: async () => {
                this.logService.trace(`ForwardedPorts: (TunnelService) dispose request for ${tunnel.tunnelRemoteHost}:${tunnel.tunnelRemotePort} `);
                const existingHost = this._tunnels.get(tunnel.tunnelRemoteHost);
                if (existingHost) {
                    const existing = existingHost.get(tunnel.tunnelRemotePort);
                    if (existing) {
                        existing.refcount--;
                        await this.tryDisposeTunnel(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort, existing);
                    }
                }
            }
        };
    }
    async tryDisposeTunnel(remoteHost, remotePort, tunnel) {
        if (tunnel.refcount <= 0) {
            this.logService.trace(`ForwardedPorts: (TunnelService) Tunnel is being disposed ${remoteHost}:${remotePort}.`);
            const disposePromise = tunnel.value.then(async (tunnel) => {
                if (tunnel && (typeof tunnel !== 'string')) {
                    await tunnel.dispose(true);
                    this._onTunnelClosed.fire({ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort });
                }
            });
            if (this._tunnels.has(remoteHost)) {
                this._tunnels.get(remoteHost).delete(remotePort);
            }
            return disposePromise;
        }
    }
    async closeTunnel(remoteHost, remotePort) {
        this.logService.trace(`ForwardedPorts: (TunnelService) close request for ${remoteHost}:${remotePort} `);
        const portMap = this._tunnels.get(remoteHost);
        if (portMap && portMap.has(remotePort)) {
            const value = portMap.get(remotePort);
            value.refcount = 0;
            await this.tryDisposeTunnel(remoteHost, remotePort, value);
        }
    }
    addTunnelToMap(remoteHost, remotePort, tunnel) {
        if (!this._tunnels.has(remoteHost)) {
            this._tunnels.set(remoteHost, new Map());
        }
        this._tunnels.get(remoteHost).set(remotePort, { refcount: 1, value: tunnel });
    }
    async removeEmptyOrErrorTunnelFromMap(remoteHost, remotePort) {
        const hostMap = this._tunnels.get(remoteHost);
        if (hostMap) {
            const tunnel = hostMap.get(remotePort);
            const tunnelResult = tunnel ? await tunnel.value : undefined;
            if (!tunnelResult || (typeof tunnelResult === 'string')) {
                hostMap.delete(remotePort);
            }
            if (hostMap.size === 0) {
                this._tunnels.delete(remoteHost);
            }
        }
    }
    getTunnelFromMap(remoteHost, remotePort) {
        const hosts = [remoteHost];
        // Order matters. We want the original host to be first.
        if (isLocalhost(remoteHost)) {
            hosts.push(...LOCALHOST_ADDRESSES);
            // For localhost, we add the all interfaces hosts because if the tunnel is already available at all interfaces,
            // then of course it is available at localhost.
            hosts.push(...ALL_INTERFACES_ADDRESSES);
        }
        else if (isAllInterfaces(remoteHost)) {
            hosts.push(...ALL_INTERFACES_ADDRESSES);
        }
        const existingPortMaps = hosts.map(host => this._tunnels.get(host));
        for (const map of existingPortMaps) {
            const existingTunnel = map?.get(remotePort);
            if (existingTunnel) {
                return existingTunnel;
            }
        }
        return undefined;
    }
    canTunnel(uri) {
        return !!extractLocalHostUriMetaDataForPortMapping(uri);
    }
    createWithProvider(tunnelProvider, remoteHost, remotePort, localPort, elevateIfNeeded, privacy, protocol) {
        this.logService.trace(`ForwardedPorts: (TunnelService) Creating tunnel with provider ${remoteHost}:${remotePort} on local port ${localPort}.`);
        const key = remotePort;
        this._factoryInProgress.add(key);
        const preferredLocalPort = localPort === undefined ? remotePort : localPort;
        const creationInfo = { elevationRequired: elevateIfNeeded ? this.isPortPrivileged(preferredLocalPort) : false };
        const tunnelOptions = { remoteAddress: { host: remoteHost, port: remotePort }, localAddressPort: localPort, privacy, public: privacy ? (privacy !== TunnelPrivacyId.Private) : undefined, protocol };
        const tunnel = tunnelProvider.forwardPort(tunnelOptions, creationInfo);
        if (tunnel) {
            this.addTunnelToMap(remoteHost, remotePort, tunnel);
            tunnel.finally(() => {
                this.logService.trace('ForwardedPorts: (TunnelService) Tunnel created by provider.');
                this._factoryInProgress.delete(key);
            });
        }
        else {
            this._factoryInProgress.delete(key);
        }
        return tunnel;
    }
};
AbstractTunnelService = __decorate([
    __param(0, ILogService),
    __param(1, IConfigurationService)
], AbstractTunnelService);
export { AbstractTunnelService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVubmVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdHVubmVsL2NvbW1vbi90dW5uZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBZSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUU1RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUl0RCxNQUFNLENBQUMsTUFBTSxjQUFjLEdBQUcsZUFBZSxDQUFpQixlQUFlLENBQUMsQ0FBQztBQUMvRSxNQUFNLENBQUMsTUFBTSxxQkFBcUIsR0FBRyxlQUFlLENBQXdCLHNCQUFzQixDQUFDLENBQUM7QUFZcEcsTUFBTSxVQUFVLGNBQWMsQ0FBQyxTQUFrQjtJQUNoRCxNQUFNLFFBQVEsR0FBMEIsU0FBa0MsQ0FBQztJQUMzRSxPQUFPLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsSUFBSSxRQUFRLENBQUMsZ0JBQWdCLElBQUksUUFBUSxDQUFDLFlBQVksSUFBSSxRQUFRLENBQUMsT0FBTyxJQUFJLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUNwSSxDQUFDO0FBV0QsTUFBTSxDQUFOLElBQVksY0FHWDtBQUhELFdBQVksY0FBYztJQUN6QiwrQkFBYSxDQUFBO0lBQ2IsaUNBQWUsQ0FBQTtBQUNoQixDQUFDLEVBSFcsY0FBYyxLQUFkLGNBQWMsUUFHekI7QUFFRCxNQUFNLENBQU4sSUFB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