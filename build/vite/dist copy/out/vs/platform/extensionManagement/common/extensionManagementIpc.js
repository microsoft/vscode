/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../base/common/event.js';
import { cloneAndChange } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { DefaultURITransformer, transformAndReviveIncomingURIs } from '../../../base/common/uriIpc.js';
import { CommontExtensionManagementService } from './abstractExtensionManagementService.js';
import { language } from '../../../base/common/platform.js';
function transformIncomingURI(uri, transformer) {
    return uri ? URI.revive(transformer ? transformer.transformIncoming(uri) : uri) : undefined;
}
function transformOutgoingURI(uri, transformer) {
    return transformer ? transformer.transformOutgoingURI(uri) : uri;
}
function transformIncomingExtension(extension, transformer) {
    transformer = transformer ? transformer : DefaultURITransformer;
    const manifest = extension.manifest;
    const transformed = transformAndReviveIncomingURIs({ ...extension, ...{ manifest: undefined } }, transformer);
    return { ...transformed, ...{ manifest } };
}
function transformIncomingOptions(options, transformer) {
    return options?.profileLocation ? transformAndReviveIncomingURIs(options, transformer ?? DefaultURITransformer) : options;
}
function transformOutgoingExtension(extension, transformer) {
    return transformer ? cloneAndChange(extension, value => value instanceof URI ? transformer.transformOutgoingURI(value) : undefined) : extension;
}
export class ExtensionManagementChannel {
    constructor(service, getUriTransformer) {
        this.service = service;
        this.getUriTransformer = getUriTransformer;
        this.onInstallExtension = Event.buffer(service.onInstallExtension, 'onInstallExtension', true);
        this.onDidInstallExtensions = Event.buffer(service.onDidInstallExtensions, 'onDidInstallExtensions', true);
        this.onUninstallExtension = Event.buffer(service.onUninstallExtension, 'onUninstallExtension', true);
        this.onDidUninstallExtension = Event.buffer(service.onDidUninstallExtension, 'onDidUninstallExtension', true);
        this.onDidUpdateExtensionMetadata = Event.buffer(service.onDidUpdateExtensionMetadata, 'onDidUpdateExtensionMetadata', true);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listen(context, event) {
        const uriTransformer = this.getUriTransformer(context);
        switch (event) {
            case 'onInstallExtension': {
                return Event.map(this.onInstallExtension, e => {
                    return {
                        ...e,
                        profileLocation: e.profileLocation ? transformOutgoingURI(e.profileLocation, uriTransformer) : e.profileLocation
                    };
                });
            }
            case 'onDidInstallExtensions': {
                return Event.map(this.onDidInstallExtensions, results => results.map(i => ({
                    ...i,
                    local: i.local ? transformOutgoingExtension(i.local, uriTransformer) : i.local,
                    profileLocation: i.profileLocation ? transformOutgoingURI(i.profileLocation, uriTransformer) : i.profileLocation
                })));
            }
            case 'onUninstallExtension': {
                return Event.map(this.onUninstallExtension, e => {
                    return {
                        ...e,
                        profileLocation: e.profileLocation ? transformOutgoingURI(e.profileLocation, uriTransformer) : e.profileLocation
                    };
                });
            }
            case 'onDidUninstallExtension': {
                return Event.map(this.onDidUninstallExtension, e => {
                    return {
                        ...e,
                        profileLocation: e.profileLocation ? transformOutgoingURI(e.profileLocation, uriTransformer) : e.profileLocation
                    };
                });
            }
            case 'onDidUpdateExtensionMetadata': {
                return Event.map(this.onDidUpdateExtensionMetadata, e => {
                    return {
                        local: transformOutgoingExtension(e.local, uriTransformer),
                        profileLocation: transformOutgoingURI(e.profileLocation, uriTransformer)
                    };
                });
            }
        }
        throw new Error('Invalid listen');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async call(context, command, args) {
        const uriTransformer = this.getUriTransformer(context);
        switch (command) {
            case 'zip': {
                const extension = transformIncomingExtension(args[0], uriTransformer);
                const uri = await this.service.zip(extension);
                return transformOutgoingURI(uri, uriTransformer);
            }
            case 'install': {
                return this.service.install(transformIncomingURI(args[0], uriTransformer), transformIncomingOptions(args[1], uriTransformer));
            }
            case 'installFromLocation': {
                return this.service.installFromLocation(transformIncomingURI(args[0], uriTransformer), transformIncomingURI(args[1], uriTransformer));
            }
            case 'installExtensionsFromProfile': {
                return this.service.installExtensionsFromProfile(args[0], transformIncomingURI(args[1], uriTransformer), transformIncomingURI(args[2], uriTransformer));
            }
            case 'getManifest': {
                return this.service.getManifest(transformIncomingURI(args[0], uriTransformer));
            }
            case 'getTargetPlatform': {
                return this.service.getTargetPlatform();
            }
            case 'installFromGallery': {
                return this.service.installFromGallery(args[0], transformIncomingOptions(args[1], uriTransformer));
            }
            case 'installGalleryExtensions': {
                const arg = args[0];
                return this.service.installGalleryExtensions(arg.map(({ extension, options }) => ({ extension, options: transformIncomingOptions(options, uriTransformer) ?? {} })));
            }
            case 'uninstall': {
                return this.service.uninstall(transformIncomingExtension(args[0], uriTransformer), transformIncomingOptions(args[1], uriTransformer));
            }
            case 'uninstallExtensions': {
                const arg = args[0];
                return this.service.uninstallExtensions(arg.map(({ extension, options }) => ({ extension: transformIncomingExtension(extension, uriTransformer), options: transformIncomingOptions(options, uriTransformer) })));
            }
            case 'getInstalled': {
                const extensions = await this.service.getInstalled(args[0], transformIncomingURI(args[1], uriTransformer), args[2], args[3]);
                return extensions.map(e => transformOutgoingExtension(e, uriTransformer));
            }
            case 'toggleApplicationScope': {
                const extension = await this.service.toggleApplicationScope(transformIncomingExtension(args[0], uriTransformer), transformIncomingURI(args[1], uriTransformer));
                return transformOutgoingExtension(extension, uriTransformer);
            }
            case 'copyExtensions': {
                return this.service.copyExtensions(transformIncomingURI(args[0], uriTransformer), transformIncomingURI(args[1], uriTransformer));
            }
            case 'updateMetadata': {
                const e = await this.service.updateMetadata(transformIncomingExtension(args[0], uriTransformer), args[1], transformIncomingURI(args[2], uriTransformer));
                return transformOutgoingExtension(e, uriTransformer);
            }
            case 'resetPinnedStateForAllUserExtensions': {
                return this.service.resetPinnedStateForAllUserExtensions(args[0]);
            }
            case 'getExtensionsControlManifest': {
                return this.service.getExtensionsControlManifest();
            }
            case 'download': {
                return this.service.download(args[0], args[1], args[2]);
            }
            case 'cleanUp': {
                return this.service.cleanUp();
            }
        }
        throw new Error('Invalid call');
    }
}
export class ExtensionManagementChannelClient extends CommontExtensionManagementService {
    get onInstallExtension() { return this._onInstallExtension.event; }
    get onDidInstallExtensions() { return this._onDidInstallExtensions.event; }
    get onUninstallExtension() { return this._onUninstallExtension.event; }
    get onDidUninstallExtension() { return this._onDidUninstallExtension.event; }
    get onDidUpdateExtensionMetadata() { return this._onDidUpdateExtensionMetadata.event; }
    constructor(channel, productService, allowedExtensionsService) {
        super(productService, allowedExtensionsService);
        this.channel = channel;
        this._onInstallExtension = this._register(new Emitter());
        this._onDidInstallExtensions = this._register(new Emitter());
        this._onUninstallExtension = this._register(new Emitter());
        this._onDidUninstallExtension = this._register(new Emitter());
        this._onDidUpdateExtensionMetadata = this._register(new Emitter());
        this._register(this.channel.listen('onInstallExtension')(e => this.onInstallExtensionEvent({ ...e, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) })));
        this._register(this.channel.listen('onDidInstallExtensions')(results => this.onDidInstallExtensionsEvent(results.map(e => ({ ...e, local: e.local ? transformIncomingExtension(e.local, null) : e.local, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) })))));
        this._register(this.channel.listen('onUninstallExtension')(e => this.onUninstallExtensionEvent({ ...e, profileLocation: URI.revive(e.profileLocation) })));
        this._register(this.channel.listen('onDidUninstallExtension')(e => this.onDidUninstallExtensionEvent({ ...e, profileLocation: URI.revive(e.profileLocation) })));
        this._register(this.channel.listen('onDidUpdateExtensionMetadata')(e => this.onDidUpdateExtensionMetadataEvent({ profileLocation: URI.revive(e.profileLocation), local: transformIncomingExtension(e.local, null) })));
    }
    onInstallExtensionEvent(event) {
        this._onInstallExtension.fire(event);
    }
    onDidInstallExtensionsEvent(results) {
        this._onDidInstallExtensions.fire(results);
    }
    onUninstallExtensionEvent(event) {
        this._onUninstallExtension.fire(event);
    }
    onDidUninstallExtensionEvent(event) {
        this._onDidUninstallExtension.fire(event);
    }
    onDidUpdateExtensionMetadataEvent(event) {
        this._onDidUpdateExtensionMetadata.fire(event);
    }
    isUriComponents(obj) {
        if (!obj) {
            return false;
        }
        const thing = obj;
        return typeof thing?.path === 'string' &&
            typeof thing?.scheme === 'string';
    }
    getTargetPlatform() {
        if (!this._targetPlatformPromise) {
            this._targetPlatformPromise = this.channel.call('getTargetPlatform');
        }
        return this._targetPlatformPromise;
    }
    zip(extension) {
        return Promise.resolve(this.channel.call('zip', [extension]).then(result => URI.revive(result)));
    }
    install(vsix, options) {
        return Promise.resolve(this.channel.call('install', [vsix, options])).then(local => transformIncomingExtension(local, null));
    }
    installFromLocation(location, profileLocation) {
        return Promise.resolve(this.channel.call('installFromLocation', [location, profileLocation])).then(local => transformIncomingExtension(local, null));
    }
    async installExtensionsFromProfile(extensions, fromProfileLocation, toProfileLocation) {
        const result = await this.channel.call('installExtensionsFromProfile', [extensions, fromProfileLocation, toProfileLocation]);
        return result.map(local => transformIncomingExtension(local, null));
    }
    getManifest(vsix) {
        return Promise.resolve(this.channel.call('getManifest', [vsix]));
    }
    installFromGallery(extension, installOptions) {
        return Promise.resolve(this.channel.call('installFromGallery', [extension, installOptions])).then(local => transformIncomingExtension(local, null));
    }
    async installGalleryExtensions(extensions) {
        const results = await this.channel.call('installGalleryExtensions', [extensions]);
        return results.map(e => ({ ...e, local: e.local ? transformIncomingExtension(e.local, null) : e.local, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) }));
    }
    uninstall(extension, options) {
        if (extension.isWorkspaceScoped) {
            throw new Error('Cannot uninstall a workspace extension');
        }
        return Promise.resolve(this.channel.call('uninstall', [extension, options]));
    }
    uninstallExtensions(extensions) {
        if (extensions.some(e => e.extension.isWorkspaceScoped)) {
            throw new Error('Cannot uninstall a workspace extension');
        }
        return Promise.resolve(this.channel.call('uninstallExtensions', [extensions]));
    }
    getInstalled(type = null, extensionsProfileResource, productVersion) {
        return Promise.resolve(this.channel.call('getInstalled', [type, extensionsProfileResource, productVersion, language]))
            .then(extensions => extensions.map(extension => transformIncomingExtension(extension, null)));
    }
    updateMetadata(local, metadata, extensionsProfileResource) {
        return Promise.resolve(this.channel.call('updateMetadata', [local, metadata, extensionsProfileResource]))
            .then(extension => transformIncomingExtension(extension, null));
    }
    resetPinnedStateForAllUserExtensions(pinned) {
        return this.channel.call('resetPinnedStateForAllUserExtensions', [pinned]);
    }
    toggleApplicationScope(local, fromProfileLocation) {
        return this.channel.call('toggleApplicationScope', [local, fromProfileLocation])
            .then(extension => transformIncomingExtension(extension, null));
    }
    copyExtensions(fromProfileLocation, toProfileLocation) {
        return this.channel.call('copyExtensions', [fromProfileLocation, toProfileLocation]);
    }
    getExtensionsControlManifest() {
        return Promise.resolve(this.channel.call('getExtensionsControlManifest'));
    }
    async download(extension, operation, donotVerifySignature) {
        const result = await this.channel.call('download', [extension, operation, donotVerifySignature]);
        return URI.revive(result);
    }
    async cleanUp() {
        return this.channel.call('cleanUp');
    }
    registerParticipant() { throw new Error('Not Supported'); }
}
export class ExtensionTipsChannel {
    constructor(service) {
        this.service = service;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listen(context, event) {
        throw new Error('Invalid listen');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    call(context, command, args) {
        switch (command) {
            case 'getConfigBasedTips': return this.service.getConfigBasedTips(URI.revive(args[0]));
            case 'getImportantExecutableBasedTips': return this.service.getImportantExecutableBasedTips();
            case 'getOtherExecutableBasedTips': return this.service.getOtherExecutableBasedTips();
        }
        throw new Error('Invalid call');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uTWFuYWdlbWVudElwYy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRJcGMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDakUsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUscUJBQXFCLEVBQW1CLDhCQUE4QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFVeEgsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBSzVELFNBQVMsb0JBQW9CLENBQUMsR0FBOEIsRUFBRSxXQUFtQztJQUNoRyxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUM3RixDQUFDO0FBRUQsU0FBUyxvQkFBb0IsQ0FBQyxHQUFRLEVBQUUsV0FBbUM7SUFDMUUsT0FBTyxXQUFXLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO0FBQ2xFLENBQUM7QUFFRCxTQUFTLDBCQUEwQixDQUFDLFNBQTBCLEVBQUUsV0FBbUM7SUFDbEcsV0FBVyxHQUFH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