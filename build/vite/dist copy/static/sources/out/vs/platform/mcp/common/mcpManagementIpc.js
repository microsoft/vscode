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
import { Emitter, Event } from '../../../base/common/event.js';
import { cloneAndChange } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { DefaultURITransformer, transformAndReviveIncomingURIs } from '../../../base/common/uriIpc.js';
import { ILogService } from '../../log/common/log.js';
import { IAllowedMcpServersService } from './mcpManagement.js';
import { AbstractMcpManagementService } from './mcpManagementService.js';
function transformIncomingURI(uri, transformer) {
    return uri ? URI.revive(transformer ? transformer.transformIncoming(uri) : uri) : undefined;
}
function transformIncomingServer(mcpServer, transformer) {
    transformer = transformer ? transformer : DefaultURITransformer;
    const manifest = mcpServer.manifest;
    const transformed = transformAndReviveIncomingURIs({ ...mcpServer, ...{ manifest: undefined } }, transformer);
    return { ...transformed, ...{ manifest } };
}
function transformIncomingOptions(options, transformer) {
    return options?.mcpResource ? transformAndReviveIncomingURIs(options, transformer ?? DefaultURITransformer) : options;
}
function transformOutgoingExtension(extension, transformer) {
    return transformer ? cloneAndChange(extension, value => value instanceof URI ? transformer.transformOutgoingURI(value) : undefined) : extension;
}
function transformOutgoingURI(uri, transformer) {
    return transformer ? transformer.transformOutgoingURI(uri) : uri;
}
export class McpManagementChannel {
    constructor(service, getUriTransformer) {
        this.service = service;
        this.getUriTransformer = getUriTransformer;
        this.onInstallMcpServer = Event.buffer(service.onInstallMcpServer, 'onInstallMcpServer', true);
        this.onDidInstallMcpServers = Event.buffer(service.onDidInstallMcpServers, 'onDidInstallMcpServers', true);
        this.onDidUpdateMcpServers = Event.buffer(service.onDidUpdateMcpServers, 'onDidUpdateMcpServers', true);
        this.onUninstallMcpServer = Event.buffer(service.onUninstallMcpServer, 'onUninstallMcpServer', true);
        this.onDidUninstallMcpServer = Event.buffer(service.onDidUninstallMcpServer, 'onDidUninstallMcpServer', true);
    }
    listen(context, event) {
        const uriTransformer = this.getUriTransformer(context);
        switch (event) {
            case 'onInstallMcpServer': {
                return Event.map(this.onInstallMcpServer, event => {
                    return { ...event, mcpResource: transformOutgoingURI(event.mcpResource, uriTransformer) };
                });
            }
            case 'onDidInstallMcpServers': {
                return Event.map(this.onDidInstallMcpServers, results => results.map(i => ({
                    ...i,
                    local: i.local ? transformOutgoingExtension(i.local, uriTransformer) : i.local,
                    mcpResource: transformOutgoingURI(i.mcpResource, uriTransformer)
                })));
            }
            case 'onDidUpdateMcpServers': {
                return Event.map(this.onDidUpdateMcpServers, results => results.map(i => ({
                    ...i,
                    local: i.local ? transformOutgoingExtension(i.local, uriTransformer) : i.local,
                    mcpResource: transformOutgoingURI(i.mcpResource, uriTransformer)
                })));
            }
            case 'onUninstallMcpServer': {
                return Event.map(this.onUninstallMcpServer, event => {
                    return { ...event, mcpResource: transformOutgoingURI(event.mcpResource, uriTransformer) };
                });
            }
            case 'onDidUninstallMcpServer': {
                return Event.map(this.onDidUninstallMcpServer, event => {
                    return { ...event, mcpResource: transformOutgoingURI(event.mcpResource, uriTransformer) };
                });
            }
        }
        throw new Error('Invalid listen');
    }
    async call(context, command, args) {
        const uriTransformer = this.getUriTransformer(context);
        const argsArray = Array.isArray(args) ? args : [];
        switch (command) {
            case 'getInstalled': {
                const mcpServers = await this.service.getInstalled(transformIncomingURI(argsArray[0], uriTransformer));
                return mcpServers.map(e => transformOutgoingExtension(e, uriTransformer));
            }
            case 'install': {
                return this.service.install(argsArray[0], transformIncomingOptions(argsArray[1], uriTransformer));
            }
            case 'installFromGallery': {
                return this.service.installFromGallery(argsArray[0], transformIncomingOptions(argsArray[1], uriTransformer));
            }
            case 'uninstall': {
                return this.service.uninstall(transformIncomingServer(argsArray[0], uriTransformer), transformIncomingOptions(argsArray[1], uriTransformer));
            }
            case 'updateMetadata': {
                return this.service.updateMetadata(transformIncomingServer(argsArray[0], uriTransformer), argsArray[1], transformIncomingURI(argsArray[2], uriTransformer));
            }
        }
        throw new Error('Invalid call');
    }
}
let McpManagementChannelClient = class McpManagementChannelClient extends AbstractMcpManagementService {
    get onInstallMcpServer() { return this._onInstallMcpServer.event; }
    get onDidInstallMcpServers() { return this._onDidInstallMcpServers.event; }
    get onUninstallMcpServer() { return this._onUninstallMcpServer.event; }
    get onDidUninstallMcpServer() { return this._onDidUninstallMcpServer.event; }
    get onDidUpdateMcpServers() { return this._onDidUpdateMcpServers.event; }
    constructor(channel, allowedMcpServersService, logService) {
        super(allowedMcpServersService, logService);
        this.channel = channel;
        this._onInstallMcpServer = this._register(new Emitter());
        this._onDidInstallMcpServers = this._register(new Emitter());
        this._onUninstallMcpServer = this._register(new Emitter());
        this._onDidUninstallMcpServer = this._register(new Emitter());
        this._onDidUpdateMcpServers = this._register(new Emitter());
        this._register(this.channel.listen('onInstallMcpServer')(e => this._onInstallMcpServer.fire(({ ...e, mcpResource: transformIncomingURI(e.mcpResource, null) }))));
        this._register(this.channel.listen('onDidInstallMcpServers')(results => this._onDidInstallMcpServers.fire(results.map(e => ({ ...e, local: e.local ? transformIncomingServer(e.local, null) : e.local, mcpResource: transformIncomingURI(e.mcpResource, null) })))));
        this._register(this.channel.listen('onDidUpdateMcpServers')(results => this._onDidUpdateMcpServers.fire(results.map(e => ({ ...e, local: e.local ? transformIncomingServer(e.local, null) : e.local, mcpResource: transformIncomingURI(e.mcpResource, null) })))));
        this._register(this.channel.listen('onUninstallMcpServer')(e => this._onUninstallMcpServer.fire(({ ...e, mcpResource: transformIncomingURI(e.mcpResource, null) }))));
        this._register(this.channel.listen('onDidUninstallMcpServer')(e => this._onDidUninstallMcpServer.fire(({ ...e, mcpResource: transformIncomingURI(e.mcpResource, null) }))));
    }
    install(server, options) {
        return Promise.resolve(this.channel.call('install', [server, options])).then(local => transformIncomingServer(local, null));
    }
    installFromGallery(extension, installOptions) {
        return Promise.resolve(this.channel.call('installFromGallery', [extension, installOptions])).then(local => transformIncomingServer(local, null));
    }
    uninstall(extension, options) {
        return Promise.resolve(this.channel.call('uninstall', [extension, options]));
    }
    getInstalled(mcpResource) {
        return Promise.resolve(this.channel.call('getInstalled', [mcpResource]))
            .then(servers => servers.map(server => transformIncomingServer(server, null)));
    }
    updateMetadata(local, gallery, mcpResource) {
        return Promise.resolve(this.channel.call('updateMetadata', [local, gallery, mcpResource])).then(local => transformIncomingServer(local, null));
    }
};
McpManagementChannelClient = __decorate([
    __param(1, IAllowedMcpServersService),
    __param(2, ILogService)
], McpManagementChannelClient);
export { McpManagementChannelClient };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwTWFuYWdlbWVudElwYy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudElwYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxxQkFBcUIsRUFBbUIsOEJBQThCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUV4SCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFdEQsT0FBTyxFQUEwTix5QkFBeUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3ZSLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBSXpFLFNBQVMsb0JBQW9CLENBQUMsR0FBOEIsRUFBRSxXQUFtQztJQUNoRyxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUM3RixDQUFDO0FBRUQsU0FBUyx1QkFBdUIsQ0FBQyxTQUEwQixFQUFFLFdBQW1DO0lBQy9GLFdBQVcsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMscUJBQXFCLENBQUM7SUFDaEUsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQztJQUNwQyxNQUFNLFdBQVcsR0FBRyw4QkFBOEIsQ0FBQyxFQUFFLEdBQUcsU0FBUyxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUM5RyxPQUFPLEVBQUUsR0FBRyxXQUFXLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUM7QUFDNUMsQ0FBQztBQUVELFNBQVMsd0JBQXdCLENBQTRDLE9BQXNCLEVBQUUsV0FBbUM7SUFDdkksT0FBTyxPQUFPLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyw4QkFBOEIsQ0FBQyxPQUFPLEVBQUUsV0FBVyxJQUFJLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUN2SCxDQUFDO0FBRUQsU0FBUywwQkFBMEIsQ0FBQyxTQUEwQixFQUFFLFdBQW1DO0lBQ2xHLE9BQU8sV0FBVyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxZQUFZLEdBQUcsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0FBQ2pKLENBQUM7QUFFRCxTQUFTLG9CQUFvQixDQUFDLEdBQVEsRUFBRSxXQUFtQztJQUMxRSxPQUFPLFdBQVcsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7QUFDbEUsQ0FBQztBQUVELE1BQU0sT0FBTyxvQkFBb0I7SUFPaEMsWUFBb0IsT0FBOEIsRUFBVSxpQkFBdUU7UUFBL0csWUFBTyxHQUFQLE9BQU8sQ0FBdUI7UUFBVSxzQkFBaUIsR0FBakIsaUJBQWlCLENBQXNEO1FBQ2xJLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMvRixJQUFJLENBQUMsc0JBQXNCLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsc0JBQXNCLEVBQUUsd0JBQXdCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDM0csSUFBSSxDQUFDLHFCQUFxQixHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLHFCQUFxQixFQUFFLHVCQUF1QixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3hHLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxvQkFBb0IsRUFBRSxzQkFBc0IsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNyRyxJQUFJLENBQUMsdUJBQXVCLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsdUJBQXVCLEVBQUUseUJBQXlCLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDL0csQ0FBQztJQUVELE1BQU0sQ0FBSSxPQUFpQixFQUFFLEtBQWE7UUFDekMsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZELFFBQVEsS0FBSyxFQUFFLENBQUM7WUFDZixLQUFLLG9CQUFvQixDQUFDLENBQUMsQ0FBQztnQkFDM0IsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUErQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLEVBQUU7b0JBQy9GLE9BQU8sRUFBRSxHQUFHLEtBQUssRUFBRSxXQUFXLEVBQUUsb0JBQW9CLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsRUFBRSxDQUFDO2dCQUMzRixDQUFDLENBQWEsQ0FBQztZQUNoQixDQUFDO1lBQ0QsS0FBSyx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7Z0JBQy9CLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBdUUsSUFBSSxDQUFDLHNCQUFzQixFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQzdILE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUNqQixHQUFHLENBQUM7b0JBQ0osS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLO29CQUM5RSxXQUFXLEVBQUUsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUM7aUJBQ2hFLENBQUMsQ0FBQyxDQUFhLENBQUM7WUFDbkIsQ0FBQztZQUNELEtBQUssdUJBQXVCLENBQUMsQ0FBQyxDQUFDO2dCQUM5QixPQUFPLEtBQUssQ0FBQyxHQUFHLENBQXVFLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxPQUFPLENBQUMsRUFBRSxDQUM1SCxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDakIsR0FBRyxDQUFDO29CQUNKLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSztvQkFDOUUsV0FBVyxFQUFFLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDO2lCQUNoRSxDQUFDLENBQUMsQ0FBYSxDQUFDO1lBQ25CLENBQUM7WUFDRCxLQUFLLHNCQUFzQixDQUFDLENBQUMsQ0FBQztnQkFDN0IsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFtRCxJQUFJLENBQUMsb0JBQW9CLEVBQUUsS0FBSyxDQUFDLEVBQUU7b0JBQ3JHLE9BQU8sRUFBRSxHQUFHLEtBQUssRUFBRSxXQUFXLEVBQUUsb0JBQW9CLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsRUFBRSxDQUFDO2dCQUMzRixDQUFDLENBQWEsQ0FBQztZQUNoQixDQUFDO1lBQ0QsS0FBSyx5QkFBeUIsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hDLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBeUQsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEtBQUssQ0FBQyxFQUFFO29CQUM5RyxPQUFPLEVBQUUsR0FBRyxLQUFLLEVBQUUsV0FBVyxFQUFFLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQztnQkFDM0YsQ0FBQyxDQUFhLENBQUM7WUFDaEIsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLElBQUksS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELEtBQUssQ0FBQyxJQUFJLENBQUksT0FBaUIsRUFBRSxPQUFlLEVBQUUsSUFBYztRQUMvRCxNQUFNLGNBQWMsR0FBMkIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQy9FLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ2xELFFBQVEsT0FBTyxFQUFFLENBQUM7WUFDakIsS0FBSyxjQUFjLENBQUMsQ0FBQyxDQUFDO2dCQUNyQixNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO2dCQUN2RyxPQUFPLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLEVBQUUsY0FBYyxDQUFDLENBQU0sQ0FBQztZQUNoRixDQUFDO1lBQ0QsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUNoQixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsY0FBYyxDQUFDLENBQU0sQ0FBQztZQUN4RyxDQUFDO1lBQ0QsS0FBSyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7Z0JBQzNCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsd0JBQXdCLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFNLENBQUM7WUFDbkgsQ0FBQztZQUNELEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQztnQkFDbEIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsY0FBYyxDQUFDLEVBQUUsd0JBQXdCLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFNLENBQUM7WUFDbkosQ0FBQztZQUNELEtBQUssZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLHVCQUF1QixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxjQUFjLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFNLENBQUM7WUFDbEssQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLElBQUksS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7Q0FDRDtBQUVNLElBQU0sMEJBQTBCLEdBQWhDLE1BQU0sMEJBQTJCLFNBQVEsNEJBQTRCO0lBSzNFLElBQUksa0JBQWtCLEtBQUssT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUduRSxJQUFJLHNCQUFzQixLQUFLLE9BQU8sSUFBSSxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFHM0UsSUFBSSxvQkFBb0IsS0FBSyxPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBR3ZFLElBQUksdUJBQXVCLEtBQUssT0FBTyxJQUFJLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUc3RSxJQUFJLHFCQUFxQixLQUFLLE9BQU8sSUFBSSxDQUFDLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFFekUsWUFDa0IsT0FBaUIsRUFDUCx3QkFBbUQsRUFDakUsVUFBdUI7UUFFcEMsS0FBSyxDQUFDLHdCQUF3QixFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBSjNCLFlBQU8sR0FBUCxPQUFPLENBQVU7UUFoQmxCLHdCQUFtQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXlCLENBQUMsQ0FBQztRQUczRSw0QkFBdUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFxQyxDQUFDLENBQUM7UUFHM0YsMEJBQXFCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBMkIsQ0FBQyxDQUFDO1FBRy9FLDZCQUF3QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQThCLENBQUMsQ0FBQztRQUdyRiwyQkFBc0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUE0QixDQUFDLENBQUM7UUFTakcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBd0Isb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLFdBQVcsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6TCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFvQyx3QkFBd0IsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hTLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQW9DLHVCQUF1QixDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdFMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBMEIsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLFdBQVcsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvTCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUE2Qix5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsV0FBVyxFQUFFLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3pNLENBQUM7SUFFRCxPQUFPLENBQUMsTUFBNkIsRUFBRSxPQUF3QjtRQUM5RCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQWtCLFNBQVMsRUFBRSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsdUJBQXVCLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDOUksQ0FBQztJQUVELGtCQUFrQixDQUFDLFNBQTRCLEVBQUUsY0FBK0I7UUFDL0UsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFrQixvQkFBb0IsRUFBRSxDQUFDLFNBQVMsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsdUJBQXVCLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDbkssQ0FBQztJQUVELFNBQVMsQ0FBQyxTQUEwQixFQUFFLE9BQTBCO1FBQy9ELE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBTyxXQUFXLEVBQUUsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BGLENBQUM7SUFFRCxZQUFZLENBQUMsV0FBaUI7UUFDN0IsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFvQixjQUFjLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO2FBQ3pGLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pGLENBQUM7SUFFRCxjQUFjLENBQUMsS0FBc0IsRUFBRSxPQUEwQixFQUFFLFdBQWlCO1FBQ25GLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBa0IsZ0JBQWdCLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUNqSyxDQUFDO0NBQ0QsQ0FBQTtBQXBEWSwwQkFBMEI7SUFxQnBDLFdBQUEseUJBQXlCLENBQUE7SUFDekIsV0FBQSxXQUFXLENBQUE7R0F0QkQsMEJBQTBCLENBb0R0QyJ9