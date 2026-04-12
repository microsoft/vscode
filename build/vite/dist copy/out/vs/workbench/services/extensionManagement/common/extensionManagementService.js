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
var WorkspaceExtensionsManagementService_1;
import { Emitter, Event, EventMultiplexer } from '../../../../base/common/event.js';
import { IExtensionGalleryService, ExtensionManagementError, EXTENSION_INSTALL_SOURCE_CONTEXT, IAllowedExtensionsService, EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT, } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionManagementServerService } from './extensionManagement.js';
import { isLanguagePackExtension, getWorkspaceSupportTypeMessage } from '../../../../platform/extensions/common/extensions.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { areSameExtensions, computeTargetPlatform } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { localize } from '../../../../nls.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Schemas } from '../../../../base/common/network.js';
import { IDownloadService } from '../../../../platform/download/common/download.js';
import { coalesce, distinct, isNonEmptyArray } from '../../../../base/common/arrays.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import Severity from '../../../../base/common/severity.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { Promises } from '../../../../base/common/async.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IExtensionManifestPropertiesService } from '../../extensions/common/extensionManifestPropertiesService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { isString, isUndefined } from '../../../../base/common/types.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CancellationError, getErrorMessage } from '../../../../base/common/errors.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IExtensionsScannerService } from '../../../../platform/extensionManagement/common/extensionsScannerService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { createCommandUri, MarkdownString } from '../../../../base/common/htmlContent.js';
import { verifiedPublisherIcon } from './extensionsIcons.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CommontExtensionManagementService } from '../../../../platform/extensionManagement/common/abstractExtensionManagementService.js';
const TrustedPublishersStorageKey = 'extensions.trustedPublishers';
function isGalleryExtension(extension) {
    return extension.type === 'gallery';
}
let ExtensionManagementService = class ExtensionManagementService extends CommontExtensionManagementService {
    constructor(extensionManagementServerService, extensionGalleryService, userDataProfileService, userDataProfilesService, configurationService, productService, downloadService, userDataSyncEnablementService, dialogService, workspaceTrustRequestService, extensionManifestPropertiesService, fileService, logService, instantiationService, extensionsScannerService, allowedExtensionsService, storageService, telemetryService) {
        super(productService, allowedExtensionsService);
        this.extensionManagementServerService = extensionManagementServerService;
        this.extensionGalleryService = extensionGalleryService;
        this.userDataProfileService = userDataProfileService;
        this.userDataProfilesService = userDataProfilesService;
        this.configurationService = configurationService;
        this.downloadService = downloadService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.dialogService = dialogService;
        this.workspaceTrustRequestService = workspaceTrustRequestService;
        this.extensionManifestPropertiesService = extensionManifestPropertiesService;
        this.fileService = fileService;
        this.logService = logService;
        this.instantiationService = instantiationService;
        this.extensionsScannerService = extensionsScannerService;
        this.storageService = storageService;
        this.telemetryService = telemetryService;
        this._onInstallExtension = this._register(new Emitter());
        this._onDidInstallExtensions = this._register(new Emitter());
        this._onUninstallExtension = this._register(new Emitter());
        this._onDidUninstallExtension = this._register(new Emitter());
        this._onDidProfileAwareInstallExtensions = this._register(new Emitter());
        this._onDidProfileAwareUninstallExtension = this._register(new Emitter());
        this.servers = [];
        this.defaultTrustedPublishers = productService.trustedExtensionPublishers ?? [];
        this.workspaceExtensionManagementService = this._register(this.instantiationService.createInstance(WorkspaceExtensionsManagementService));
        this.onDidEnableExtensions = this.workspaceExtensionManagementService.onDidChangeInvalidExtensions;
        if (this.extensionManagementServerService.localExtensionManagementServer) {
            this.servers.push(this.extensionManagementServerService.localExtensionManagementServer);
        }
        if (this.extensionManagementServerService.remoteExtensionManagementServer) {
            this.servers.push(this.extensionManagementServerService.remoteExtensionManagementServer);
        }
        if (this.extensionManagementServerService.webExtensionManagementServer) {
            this.servers.push(this.extensionManagementServerService.webExtensionManagementServer);
        }
        const onInstallExtensionEventMultiplexer = this._register(new EventMultiplexer());
        this._register(onInstallExtensionEventMultiplexer.add(this._onInstallExtension.event));
        this.onInstallExtension = onInstallExtensionEventMultiplexer.event;
        const onDidInstallExtensionsEventMultiplexer = this._register(new EventMultiplexer());
        this._register(onDidInstallExtensionsEventMultiplexer.add(this._onDidInstallExtensions.event));
        this.onDidInstallExtensions = onDidInstallExtensionsEventMultiplexer.event;
        const onDidProfileAwareInstallExtensionsEventMultiplexer = this._register(new EventMultiplexer());
        this._register(onDidProfileAwareInstallExtensionsEventMultiplexer.add(this._onDidProfileAwareInstallExtensions.event));
        this.onProfileAwareDidInstallExtensions = onDidProfileAwareInstallExtensionsEventMultiplexer.event;
        const onUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer());
        this._register(onUninstallExtensionEventMultiplexer.add(this._onUninstallExtension.event));
        this.onUninstallExtension = onUninstallExtensionEventMultiplexer.event;
        const onDidUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer());
        this._register(onDidUninstallExtensionEventMultiplexer.add(this._onDidUninstallExtension.event));
        this.onDidUninstallExtension = onDidUninstallExtensionEventMultiplexer.event;
        const onDidProfileAwareUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer());
        this._register(onDidProfileAwareUninstallExtensionEventMultiplexer.add(this._onDidProfileAwareUninstallExtension.event));
        this.onProfileAwareDidUninstallExtension = onDidProfileAwareUninstallExtensionEventMultiplexer.event;
        const onDidUpdateExtensionMetadaEventMultiplexer = this._register(new EventMultiplexer());
        this.onDidUpdateExtensionMetadata = onDidUpdateExtensionMetadaEventMultiplexer.event;
        const onDidProfileAwareUpdateExtensionMetadaEventMultiplexer = this._register(new EventMultiplexer());
        this.onProfileAwareDidUpdateExtensionMetadata = onDidProfileAwareUpdateExtensionMetadaEventMultiplexer.event;
        const onDidChangeProfileEventMultiplexer = this._register(new EventMultiplexer());
        this.onDidChangeProfile = onDidChangeProfileEventMultiplexer.event;
        for (const server of this.servers) {
            this._register(onInstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onInstallExtension, e => ({ ...e, server }))));
            this._register(onDidInstallExtensionsEventMultiplexer.add(server.extensionManagementService.onDidInstallExtensions));
            this._register(onDidProfileAwareInstallExtensionsEventMultiplexer.add(server.extensionManagementService.onProfileAwareDidInstallExtensions));
            this._register(onUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onUninstallExtension, e => ({ ...e, server }))));
            this._register(onDidUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onDidUninstallExtension, e => ({ ...e, server }))));
            this._register(onDidProfileAwareUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onProfileAwareDidUninstallExtension, e => ({ ...e, server }))));
            this._register(onDidUpdateExtensionMetadaEventMultiplexer.add(server.extensionManagementService.onDidUpdateExtensionMetadata));
            this._register(onDidProfileAwareUpdateExtensionMetadaEventMultiplexer.add(server.extensionManagementService.onProfileAwareDidUpdateExtensionMetadata));
            this._register(onDidChangeProfileEventMultiplexer.add(Event.map(server.extensionManagementService.onDidChangeProfile, e => ({ ...e, server }))));
        }
        this._register(this.onProfileAwareDidInstallExtensions(results => {
            const untrustedPublishers = new Map();
            for (const result of results) {
                if (result.local && result.source && !URI.isUri(result.source) && !this.isPublisherTrusted(result.source)) {
                    untrustedPublishers.set(result.source.publisher, { publisher: result.source.publisher, publisherDisplayName: result.source.publisherDisplayName });
                }
            }
            if (untrustedPublishers.size) {
                this.trustPublishers(...untrustedPublishers.values());
            }
        }));
    }
    async getInstalled(type, profileLocation, productVersion) {
        const result = [];
        await Promise.all(this.servers.map(async (server) => {
            const installed = await server.extensionManagementService.getInstalled(type, profileLocation, productVersion);
            if (server === this.getWorkspaceExtensionsServer()) {
                const workspaceExtensions = await this.getInstalledWorkspaceExtensions(true);
                installed.push(...workspaceExtensions);
            }
            result.push(...installed);
        }));
        return result;
    }
    uninstall(extension, options) {
        return this.uninstallExtensions([{ extension, options }]);
    }
    async uninstallExtensions(extensions) {
        const workspaceExtensions = [];
        const groupedExtensions = new Map();
        const addExtensionToServer = (server, extension, options) => {
            let extensions = groupedExtensions.get(server);
            if (!extensions) {
                groupedExtensions.set(server, extensions = []);
            }
            extensions.push({ extension, options });
        };
        for (const { extension, options } of extensions) {
            if (extension.isWorkspaceScoped) {
                workspaceExtensions.push(extension);
                continue;
            }
            const server = this.getServer(extension);
            if (!server) {
                throw new Error(`Invalid location ${extension.location.toString()}`);
            }
            addExtensionToServer(server, extension, options);
            if (this.servers.length > 1 && isLanguagePackExtension(extension.manifest)) {
                const otherServers = this.servers.filter(s => s !== server);
                for (const otherServer of otherServers) {
                    const installed = await otherServer.extensionManagementService.getInstalled();
                    const extensionInOtherServer = installed.find(i => !i.isBuiltin && areSameExtensions(i.identifier, extension.identifier));
                    if (extensionInOtherServer) {
                        addExtensionToServer(otherServer, extensionInOtherServer, options);
                    }
                }
            }
        }
        const promises = [];
        for (const workspaceExtension of workspaceExtensions) {
            promises.push(this.uninstallExtensionFromWorkspace(workspaceExtension));
        }
        for (const [server, extensions] of groupedExtensions.entries()) {
            promises.push(this.uninstallInServer(server, extensions));
        }
        const result = await Promise.allSettled(promises);
        const errors = result.filter(r => r.status === 'rejected').map(r => r.reason);
        if (errors.length) {
            throw new Error(errors.map(e => e.message).join('\n'));
        }
    }
    async uninstallInServer(server, extensions) {
        if (server === this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
            for (const { extension } of extensions) {
                const installedExtensions = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getInstalled(1 /* ExtensionType.User */);
                const dependentNonUIExtensions = installedExtensions.filter(i => !this.extensionManifestPropertiesService.prefersExecuteOnUI(i.manifest)
                    && i.manifest.extensionDependencies && i.manifest.extensionDependencies.some(id => areSameExtensions({ id }, extension.identifier)));
                if (dependentNonUIExtensions.length) {
                    throw (new Error(this.getDependentsErrorMessage(extension, dependentNonUIExtensions)));
                }
            }
        }
        return server.extensionManagementService.uninstallExtensions(extensions);
    }
    getDependentsErrorMessage(extension, dependents) {
        if (dependents.length === 1) {
            return localize('singleDependentError', "Cannot uninstall extension '{0}'. Extension '{1}' depends on this.", extension.manifest.displayName || extension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name);
        }
        if (dependents.length === 2) {
            return localize('twoDependentsError', "Cannot uninstall extension '{0}'. Extensions '{1}' and '{2}' depend on this.", extension.manifest.displayName || extension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
        }
        return localize('multipleDependentsError', "Cannot uninstall extension '{0}'. Extensions '{1}', '{2}' and others depend on this.", extension.manifest.displayName || extension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
    }
    updateMetadata(extension, metadata) {
        const server = this.getServer(extension);
        if (server) {
            const profile = extension.isApplicationScoped ? this.userDataProfilesService.defaultProfile : this.userDataProfileService.currentProfile;
            return server.extensionManagementService.updateMetadata(extension, metadata, profile.extensionsResource);
        }
        return Promise.reject(`Invalid location ${extension.location.toString()}`);
    }
    async resetPinnedStateForAllUserExtensions(pinned) {
        await Promise.allSettled(this.servers.map(server => server.extensionManagementService.resetPinnedStateForAllUserExtensions(pinned)));
    }
    zip(extension) {
        const server = this.getServer(extension);
        if (server) {
            return server.extensionManagementService.zip(extension);
        }
        return Promise.reject(`Invalid location ${extension.location.toString()}`);
    }
    download(extension, operation, donotVerifySignature) {
        if (this.extensionManagementServerService.localExtensionManagementServer) {
            return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.download(extension, operation, donotVerifySignature);
        }
        throw new Error('Cannot download extension');
    }
    async install(vsix, options) {
        const manifest = await this.getManifest(vsix);
        return this.installVSIX(vsix, manifest, options);
    }
    async installVSIX(vsix, manifest, options) {
        const serversToInstall = this.getServersToInstall(manifest);
        if (serversToInstall?.length) {
            await this.checkForWorkspaceTrust(manifest, false);
            const [local] = await Promises.settled(serversToInstall.map(server => this.installVSIXInServer(vsix, server, options)));
            return local;
        }
        return Promise.reject('No Servers to Install');
    }
    getServersToInstall(manifest) {
        if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
            if (isLanguagePackExtension(manifest)) {
                // Install on both servers
                return [this.extensionManagementServerService.localExtensionManagementServer, this.extensionManagementServerService.remoteExtensionManagementServer];
            }
            if (this.extensionManifestPropertiesService.prefersExecuteOnUI(manifest)) {
                // Install only on local server
                return [this.extensionManagementServerService.localExtensionManagementServer];
            }
            // Install only on remote server
            return [this.extensionManagementServerService.remoteExtensionManagementServer];
        }
        if (this.extensionManagementServerService.localExtensionManagementServer) {
            return [this.extensionManagementServerService.localExtensionManagementServer];
        }
        if (this.extensionManagementServerService.remoteExtensionManagementServer) {
            return [this.extensionManagementServerService.remoteExtensionManagementServer];
        }
        return undefined;
    }
    async installFromLocation(location) {
        if (location.scheme === Schemas.file) {
            if (this.extensionManagementServerService.localExtensionManagementServer) {
                return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromLocation(location, this.userDataProfileService.currentProfile.extensionsResource);
            }
            throw new Error('Local extension management server is not found');
        }
        if (location.scheme === Schemas.vscodeRemote) {
            if (this.extensionManagementServerService.remoteExtensionManagementServer) {
                return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.installFromLocation(location, this.userDataProfileService.currentProfile.extensionsResource);
            }
            throw new Error('Remote extension management server is not found');
        }
        if (!this.extensionManagementServerService.webExtensionManagementServer) {
            throw new Error('Web extension management server is not found');
        }
        return this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.installFromLocation(location, this.userDataProfileService.currentProfile.extensionsResource);
    }
    installVSIXInServer(vsix, server, options) {
        return server.extensionManagementService.install(vsix, options);
    }
    getManifest(vsix) {
        if (vsix.scheme === Schemas.file && this.extensionManagementServerService.localExtensionManagementServer) {
            return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getManifest(vsix);
        }
        if (vsix.scheme === Schemas.file && this.extensionManagementServerService.remoteExtensionManagementServer) {
            return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getManifest(vsix);
        }
        if (vsix.scheme === Schemas.vscodeRemote && this.extensionManagementServerService.remoteExtensionManagementServer) {
            return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getManifest(vsix);
        }
        return Promise.reject('No Servers');
    }
    async canInstall(extension) {
        if (isGalleryExtension(extension)) {
            return this.canInstallGalleryExtension(extension);
        }
        return this.canInstallResourceExtension(extension);
    }
    async canInstallGalleryExtension(gallery) {
        if (this.extensionManagementServerService.localExtensionManagementServer
            && await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(gallery) === true) {
            return true;
        }
        const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
        if (!manifest) {
            return new MarkdownString().appendText(localize('manifest is not found', "Manifest is not found"));
        }
        if (this.extensionManagementServerService.remoteExtensionManagementServer
            && await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.canInstall(gallery) === true
            && this.extensionManifestPropertiesService.canExecuteOnWorkspace(manifest)) {
            return true;
        }
        if (this.extensionManagementServerService.webExtensionManagementServer
            && await this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.canInstall(gallery) === true
            && this.extensionManifestPropertiesService.canExecuteOnWeb(manifest)) {
            return true;
        }
        return new MarkdownString().appendText(localize('cannot be installed', "Cannot install the '{0}' extension because it is not available in this setup.", gallery.displayName || gallery.name));
    }
    async canInstallResourceExtension(extension) {
        if (this.extensionManagementServerService.localExtensionManagementServer) {
            return true;
        }
        if (this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWorkspace(extension.manifest)) {
            return true;
        }
        if (this.extensionManagementServerService.webExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWeb(extension.manifest)) {
            return true;
        }
        return new MarkdownString().appendText(localize('cannot be installed', "Cannot install the '{0}' extension because it is not available in this setup.", extension.manifest.displayName ?? extension.identifier.id));
    }
    async updateFromGallery(gallery, extension, installOptions) {
        const server = this.getServer(extension);
        if (!server) {
            return Promise.reject(`Invalid location ${extension.location.toString()}`);
        }
        const servers = [];
        // Update Language pack on local and remote servers
        if (isLanguagePackExtension(extension.manifest)) {
            servers.push(...this.servers.filter(server => server !== this.extensionManagementServerService.webExtensionManagementServer));
        }
        else {
            servers.push(server);
        }
        installOptions = { ...(installOptions || {}), isApplicationScoped: extension.isApplicationScoped };
        return Promises.settled(servers.map(server => server.extensionManagementService.installFromGallery(gallery, installOptions))).then(([local]) => local);
    }
    async installGalleryExtensions(extensions) {
        const results = new Map();
        const extensionsByServer = new Map();
        const manifests = await Promise.all(extensions.map(async ({ extension }) => {
            const manifest = await this.extensionGalleryService.getManifest(extension, CancellationToken.None);
            if (!manifest) {
                throw new Error(localize('Manifest is not found', "Installing Extension {0} failed: Manifest is not found.", extension.displayName || extension.name));
            }
            return manifest;
        }));
        if (extensions.some(e => e.options?.context?.[EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT] !== true)) {
            await this.checkForTrustedPublishers(extensions.map((e, index) => ({ extension: e.extension, manifest: manifests[index], checkForPackAndDependencies: !e.options?.donotIncludePackAndDependencies })));
        }
        await Promise.all(extensions.map(async ({ extension, options }) => {
            try {
                const manifest = await this.extensionGalleryService.getManifest(extension, CancellationToken.None);
                if (!manifest) {
                    throw new Error(localize('Manifest is not found', "Installing Extension {0} failed: Manifest is not found.", extension.displayName || extension.name));
                }
                if (options?.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT] !== "settingsSync" /* ExtensionInstallSource.SETTINGS_SYNC */) {
                    await this.checkForWorkspaceTrust(manifest, false);
                    if (!options?.donotIncludePackAndDependencies) {
                        await this.checkInstallingExtensionOnWeb(extension, manifest);
                    }
                }
                const servers = await this.getExtensionManagementServersToInstall(extension, manifest);
                if (!options.isMachineScoped && this.isExtensionsSyncEnabled()) {
                    if (this.extensionManagementServerService.localExtensionManagementServer
                        && !servers.includes(this.extensionManagementServerService.localExtensionManagementServer)
                        && await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(extension) === true) {
                        servers.push(this.extensionManagementServerService.localExtensionManagementServer);
                    }
                }
                for (const server of servers) {
                    let exensions = extensionsByServer.get(server);
                    if (!exensions) {
                        extensionsByServer.set(server, exensions = []);
                    }
                    exensions.push({ extension, options });
                }
            }
            catch (error) {
                results.set(extension.identifier.id.toLowerCase(), {
                    identifier: extension.identifier,
                    source: extension, error,
                    operation: 2 /* InstallOperation.Install */,
                    profileLocation: options.profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource
                });
            }
        }));
        await Promise.all([...extensionsByServer.entries()].map(async ([server, extensions]) => {
            const serverResults = await server.extensionManagementService.installGalleryExtensions(extensions);
            for (const result of serverResults) {
                results.set(result.identifier.id.toLowerCase(), result);
            }
        }));
        return [...results.values()];
    }
    async installFromGallery(gallery, installOptions, servers) {
        const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
        if (!manifest) {
            throw new Error(localize('Manifest is not found', "Installing Extension {0} failed: Manifest is not found.", gallery.displayName || gallery.name));
        }
        if (installOptions?.context?.[EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT] !== true) {
            await this.checkForTrustedPublishers([{ extension: gallery, manifest, checkForPackAndDependencies: !installOptions?.donotIncludePackAndDependencies }]);
        }
        if (installOptions?.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT] !== "settingsSync" /* ExtensionInstallSource.SETTINGS_SYNC */) {
            await this.checkForWorkspaceTrust(manifest, false);
            if (!installOptions?.donotIncludePackAndDependencies) {
                await this.checkInstallingExtensionOnWeb(gallery, manifest);
            }
        }
        servers = servers?.length ? this.validServers(gallery, manifest, servers) : await this.getExtensionManagementServersToInstall(gallery, manifest);
        if (!installOptions || isUndefined(installOptions.isMachineScoped)) {
            const isMachineScoped = await this.hasToFlagExtensionsMachineScoped([gallery]);
            installOptions = { ...(installOptions || {}), isMachineScoped };
        }
        if (!installOptions.isMachineScoped && this.isExtensionsSyncEnabled()) {
            if (this.extensionManagementServerService.localExtensionManagementServer
                && !servers.includes(this.extensionManagementServerService.localExtensionManagementServer)
                && await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(gallery) === true) {
                servers.push(this.extensionManagementServerService.localExtensionManagementServer);
            }
        }
        return Promises.settled(servers.map(server => server.extensionManagementService.installFromGallery(gallery, installOptions))).then(([local]) => local);
    }
    async getExtensions(locations) {
        const scannedExtensions = await this.extensionsScannerService.scanMultipleExtensions(locations, 1 /* ExtensionType.User */, { includeInvalid: true });
        const result = [];
        await Promise.all(scannedExtensions.map(async (scannedExtension) => {
            const workspaceExtension = await this.workspaceExtensionManagementService.toLocalWorkspaceExtension(scannedExtension);
            if (workspaceExtension) {
                result.push({
                    type: 'resource',
                    identifier: workspaceExtension.identifier,
                    location: workspaceExtension.location,
                    manifest: workspaceExtension.manifest,
                    changelogUri: workspaceExtension.changelogUrl,
                    readmeUri: workspaceExtension.readmeUrl,
                });
            }
        }));
        return result;
    }
    getInstalledWorkspaceExtensionLocations() {
        return this.workspaceExtensionManagementService.getInstalledWorkspaceExtensionsLocations();
    }
    async getInstalledWorkspaceExtensions(includeInvalid) {
        return this.workspaceExtensionManagementService.getInstalled(includeInvalid);
    }
    async installResourceExtension(extension, installOptions) {
        if (!this.canInstallResourceExtension(extension)) {
            throw new Error('This extension cannot be installed in the current workspace.');
        }
        if (!installOptions.isWorkspaceScoped) {
            return this.installFromLocation(extension.location);
        }
        this.logService.info(`Installing the extension ${extension.identifier.id} from ${extension.location.toString()} in workspace`);
        const server = this.getWorkspaceExtensionsServer();
        this._onInstallExtension.fire({
            identifier: extension.identifier,
            source: extension.location,
            server,
            applicationScoped: false,
            profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
            workspaceScoped: true
        });
        try {
            await this.checkForWorkspaceTrust(extension.manifest, true);
            const workspaceExtension = await this.workspaceExtensionManagementService.install(extension);
            this.logService.info(`Successfully installed the extension ${workspaceExtension.identifier.id} from ${extension.location.toString()} in the workspace`);
            this._onDidInstallExtensions.fire([{
                    identifier: workspaceExtension.identifier,
                    source: extension.location,
                    operation: 2 /* InstallOperation.Install */,
                    applicationScoped: false,
                    profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
                    local: workspaceExtension,
                    workspaceScoped: true
                }]);
            return workspaceExtension;
        }
        catch (error) {
            this.logService.error(`Failed to install the extension ${extension.identifier.id} from ${extension.location.toString()} in the workspace`, getErrorMessage(error));
            this._onDidInstallExtensions.fire([{
                    identifier: extension.identifier,
                    source: extension.location,
                    operation: 2 /* InstallOperation.Install */,
                    applicationScoped: false,
                    profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
                    error,
                    workspaceScoped: true
                }]);
            throw error;
        }
    }
    async getInstallableServers(gallery) {
        const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
        if (!manifest) {
            return Promise.reject(localize('Manifest is not found', "Installing Extension {0} failed: Manifest is not found.", gallery.displayName || gallery.name));
        }
        return this.getInstallableExtensionManagementServers(manifest);
    }
    async uninstallExtensionFromWorkspace(extension) {
        if (!extension.isWorkspaceScoped) {
            throw new Error('The extension is not a workspace extension');
        }
        this.logService.info(`Uninstalling the workspace extension ${extension.identifier.id} from ${extension.location.toString()}`);
        const server = this.getWorkspaceExtensionsServer();
        this._onUninstallExtension.fire({
            identifier: extension.identifier,
            server,
            applicationScoped: false,
            workspaceScoped: true,
            profileLocation: this.userDataProfileService.currentProfile.extensionsResource
        });
        try {
            await this.workspaceExtensionManagementService.uninstall(extension);
            this.logService.info(`Successfully uninstalled the workspace extension ${extension.identifier.id} from ${extension.location.toString()}`);
            this.telemetryService.publicLog2('workspaceextension:uninstall');
            this._onDidUninstallExtension.fire({
                identifier: extension.identifier,
                server,
                applicationScoped: false,
                workspaceScoped: true,
                profileLocation: this.userDataProfileService.currentProfile.extensionsResource
            });
        }
        catch (error) {
            this.logService.error(`Failed to uninstall the workspace extension ${extension.identifier.id} from ${extension.location.toString()}`, getErrorMessage(error));
            this._onDidUninstallExtension.fire({
                identifier: extension.identifier,
                server,
                error,
                applicationScoped: false,
                workspaceScoped: true,
                profileLocation: this.userDataProfileService.currentProfile.extensionsResource
            });
            throw error;
        }
    }
    validServers(gallery, manifest, servers) {
        const installableServers = this.getInstallableExtensionManagementServers(manifest);
        for (const server of servers) {
            if (!installableServers.includes(server)) {
                const error = new Error(localize('cannot be installed in server', "Cannot install the '{0}' extension because it is not available in the '{1}' setup.", gallery.displayName || gallery.name, server.label));
                error.name = "Unsupported" /* ExtensionManagementErrorCode.Unsupported */;
                throw error;
            }
        }
        return servers;
    }
    async getExtensionManagementServersToInstall(gallery, manifest) {
        const servers = [];
        // Language packs should be installed on both local and remote servers
        if (isLanguagePackExtension(manifest)) {
            servers.push(...this.servers.filter(server => server !== this.extensionManagementServerService.webExtensionManagementServer));
        }
        else {
            const [server] = this.getInstallableExtensionManagementServers(manifest);
            if (server) {
                servers.push(server);
            }
        }
        if (!servers.length) {
            const error = new Error(localize('cannot be installed', "Cannot install the '{0}' extension because it is not available in this setup.", gallery.displayName || gallery.name));
            error.name = "Unsupported" /* ExtensionManagementErrorCode.Unsupported */;
            throw error;
        }
        return servers;
    }
    getInstallableExtensionManagementServers(manifest) {
        // Only local server
        if (this.servers.length === 1 && this.extensionManagementServerService.localExtensionManagementServer) {
            return [this.extensionManagementServerService.localExtensionManagementServer];
        }
        const servers = [];
        const extensionKind = this.extensionManifestPropertiesService.getExtensionKind(manifest);
        for (const kind of extensionKind) {
            if (kind === 'ui' && this.extensionManagementServerService.localExtensionManagementServer) {
                servers.push(this.extensionManagementServerService.localExtensionManagementServer);
            }
            if (kind === 'workspace' && this.extensionManagementServerService.remoteExtensionManagementServer) {
                servers.push(this.extensionManagementServerService.remoteExtensionManagementServer);
            }
            if (kind === 'web' && this.extensionManagementServerService.webExtensionManagementServer) {
                servers.push(this.extensionManagementServerService.webExtensionManagementServer);
            }
        }
        // Local server can accept any extension.
        if (this.extensionManagementServerService.localExtensionManagementServer && !servers.includes(this.extensionManagementServerService.localExtensionManagementServer)) {
            servers.push(this.extensionManagementServerService.localExtensionManagementServer);
        }
        return servers;
    }
    isExtensionsSyncEnabled() {
        return this.userDataSyncEnablementService.isEnabled() && this.userDataSyncEnablementService.isResourceEnabled("extensions" /* SyncResource.Extensions */);
    }
    async hasToFlagExtensionsMachineScoped(extensions) {
        if (this.isExtensionsSyncEnabled()) {
            const { result } = await this.dialogService.prompt({
                type: Severity.Info,
                message: extensions.length === 1 ? localize('install extension', "Install Extension") : localize('install extensions', "Install Extensions"),
                detail: extensions.length === 1
                    ? localize('install single extension', "Would you like to install and synchronize '{0}' extension across your devices?", extensions[0].displayName)
                    : localize('install multiple extensions', "Would you like to install and synchronize extensions across your devices?"),
                buttons: [
                    {
                        label: localize({ key: 'install', comment: ['&& denotes a mnemonic'] }, "&&Install"),
                        run: () => false
                    },
                    {
                        label: localize({ key: 'install and do no sync', comment: ['&& denotes a mnemonic'] }, "Install (Do &&not sync)"),
                        run: () => true
                    }
                ],
                cancelButton: {
                    run: () => {
                        throw new CancellationError();
                    }
                }
            });
            return result;
        }
        return false;
    }
    getExtensionsControlManifest() {
        if (this.extensionManagementServerService.localExtensionManagementServer) {
            return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getExtensionsControlManifest();
        }
        if (this.extensionManagementServerService.remoteExtensionManagementServer) {
            return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getExtensionsControlManifest();
        }
        if (this.extensionManagementServerService.webExtensionManagementServer) {
            return this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.getExtensionsControlManifest();
        }
        return this.extensionGalleryService.getExtensionsControlManifest();
    }
    getServer(extension) {
        if (extension.isWorkspaceScoped) {
            return this.getWorkspaceExtensionsServer();
        }
        return this.extensionManagementServerService.getExtensionManagementServer(extension);
    }
    getWorkspaceExtensionsServer() {
        if (this.extensionManagementServerService.remoteExtensionManagementServer) {
            return this.extensionManagementServerService.remoteExtensionManagementServer;
        }
        if (this.extensionManagementServerService.localExtensionManagementServer) {
            return this.extensionManagementServerService.localExtensionManagementServer;
        }
        if (this.extensionManagementServerService.webExtensionManagementServer) {
            return this.extensionManagementServerService.webExtensionManagementServer;
        }
        throw new Error('No extension server found');
    }
    async requestPublisherTrust(extensions) {
        const manifests = await Promise.all(extensions.map(async ({ extension }) => {
            const manifest = await this.extensionGalleryService.getManifest(extension, CancellationToken.None);
            if (!manifest) {
                throw new Error(localize('Manifest is not found', "Installing Extension {0} failed: Manifest is not found.", extension.displayName || extension.name));
            }
            return manifest;
        }));
        await this.checkForTrustedPublishers(extensions.map((e, index) => ({ extension: e.extension, manifest: manifests[index], checkForPackAndDependencies: !e.options?.donotIncludePackAndDependencies })));
    }
    async checkForTrustedPublishers(extensions) {
        const untrustedExtensions = [];
        const untrustedExtensionManifests = [];
        const manifestsToGetOtherUntrustedPublishers = [];
        for (const { extension, manifest, checkForPackAndDependencies } of extensions) {
            if (!extension.private && !this.isPublisherTrusted(extension)) {
                untrustedExtensions.push(extension);
                untrustedExtensionManifests.push(manifest);
                if (checkForPackAndDependencies) {
                    manifestsToGetOtherUntrustedPublishers.push(manifest);
                }
            }
        }
        if (!untrustedExtensions.length) {
            return;
        }
        const otherUntrustedPublishers = manifestsToGetOtherUntrustedPublishers.length ? await this.getOtherUntrustedPublishers(manifestsToGetOtherUntrustedPublishers) : [];
        const allPublishers = [...distinct(untrustedExtensions, e => e.publisher), ...otherUntrustedPublishers];
        const unverfiiedPublishers = allPublishers.filter(p => !p.publisherDomain?.verified);
        const verifiedPublishers = allPublishers.filter(p => p.publisherDomain?.verified);
        const installButton = {
            label: allPublishers.length > 1 ? localize({ key: 'trust publishers and install', comment: ['&& denotes a mnemonic'] }, "Trust Publishers & &&Install") : localize({ key: 'trust and install', comment: ['&& denotes a mnemonic'] }, "Trust Publisher & &&Install"),
            run: () => {
                this.telemetryService.publicLog2('extensions:trustPublisher', { action: 'trust', extensionId: untrustedExtensions.map(e => e.identifier.id).join(',') });
                this.trustPublishers(...allPublishers.map(p => ({ publisher: p.publisher, publisherDisplayName: p.publisherDisplayName })));
            }
        };
        const learnMoreButton = {
            label: localize({ key: 'learnMore', comment: ['&& denotes a mnemonic'] }, "&&Learn More"),
            run: () => {
                this.telemetryService.publicLog2('extensions:trustPublisher', { action: 'learn', extensionId: untrustedExtensions.map(e => e.identifier.id).join(',') });
                this.instantiationService.invokeFunction(accessor => accessor.get(ICommandService).executeCommand('vscode.open', URI.parse('https://aka.ms/vscode-extension-security')));
                throw new CancellationError();
            }
        };
        const getPublisherLink = ({ publisherDisplayName, publisherLink }) => {
            return publisherLink ? `[${publisherDisplayName}](${publisherLink})` : publisherDisplayName;
        };
        const unverifiedLink = 'https://aka.ms/vscode-verify-publisher';
        const title = allPublishers.length === 1
            ? localize('checkTrustedPublisherTitle', "Do you trust the publisher \"{0}\"?", allPublishers[0].publisherDisplayName)
            : allPublishers.length === 2
                ? localize('checkTwoTrustedPublishersTitle', "Do you trust publishers \"{0}\" and \"{1}\"?", allPublishers[0].publisherDisplayName, allPublishers[1].publisherDisplayName)
                : localize('checkAllTrustedPublishersTitle', "Do you trust the publisher \"{0}\" and {1} others?", allPublishers[0].publisherDisplayName, allPublishers.length - 1);
        const customMessage = new MarkdownString('', { supportThemeIcons: true, isTrusted: true });
        if (untrustedExtensions.length === 1) {
            const extension = untrustedExtensions[0];
            const manifest = untrustedExtensionManifests[0];
            if (otherUntrustedPublishers.length) {
                customMessage.appendMarkdown(localize('extension published by message', "The extension {0} is published by {1}.", `[${extension.displayName}](${extension.detailsLink})`, getPublisherLink(extension)));
                customMessage.appendMarkdown('&nbsp;');
                const commandUri = createCommandUri('extension.open', extension.identifier.id, manifest.extensionPack?.length ? 'extensionPack' : 'dependencies').toString();
                if (otherUntrustedPublishers.length === 1) {
                    customMessage.appendMarkdown(localize('singleUntrustedPublisher', "Installing this extension will also install [extensions]({0}) published by {1}.", commandUri, getPublisherLink(otherUntrustedPublishers[0])));
                }
                else {
                    customMessage.appendMarkdown(localize('message3', "Installing this extension will also install [extensions]({0}) published by {1} and {2}.", commandUri, otherUntrustedPublishers.slice(0, otherUntrustedPublishers.length - 1).map(p => getPublisherLink(p)).join(', '), getPublisherLink(otherUntrustedPublishers[otherUntrustedPublishers.length - 1])));
                }
                customMessage.appendMarkdown('&nbsp;');
                customMessage.appendMarkdown(localize('firstTimeInstallingMessage', "This is the first time you're installing extensions from these publishers."));
            }
            else {
                customMessage.appendMarkdown(localize('message1', "The extension {0} is published by {1}. This is the first extension you're installing from this publisher.", `[${extension.displayName}](${extension.detailsLink})`, getPublisherLink(extension)));
            }
        }
        else {
            customMessage.appendMarkdown(localize('multiInstallMessage', "This is the first time you're installing extensions from publishers {0} and {1}.", getPublisherLink(allPublishers[0]), getPublisherLink(allPublishers[allPublishers.length - 1])));
        }
        if (verifiedPublishers.length || unverfiiedPublishers.length === 1) {
            for (const publisher of verifiedPublishers) {
                customMessage.appendText('\n');
                const publisherVerifiedMessage = localize('verifiedPublisherWithName', "{0} has verified ownership of {1}.", getPublisherLink(publisher), `[$(link-external) ${URI.parse(publisher.publisherDomain.link).authority}](${publisher.publisherDomain.link})`);
                customMessage.appendMarkdown(`$(${verifiedPublisherIcon.id})&nbsp;${publisherVerifiedMessage}`);
            }
            if (unverfiiedPublishers.length) {
                customMessage.appendText('\n');
                if (unverfiiedPublishers.length === 1) {
                    customMessage.appendMarkdown(`$(${Codicon.unverified.id})&nbsp;${localize('unverifiedPublisherWithName', "{0} is [**not** verified]({1}).", getPublisherLink(unverfiiedPublishers[0]), unverifiedLink)}`);
                }
                else {
                    customMessage.appendMarkdown(`$(${Codicon.unverified.id})&nbsp;${localize('unverifiedPublishers', "{0} and {1} are [**not** verified]({2}).", unverfiiedPublishers.slice(0, unverfiiedPublishers.length - 1).map(p => getPublisherLink(p)).join(', '), getPublisherLink(unverfiiedPublishers[unverfiiedPublishers.length - 1]), unverifiedLink)}`);
                }
            }
        }
        else {
            customMessage.appendText('\n');
            customMessage.appendMarkdown(`$(${Codicon.unverified.id})&nbsp;${localize('allUnverifed', "All publishers are [**not** verified]({0}).", unverifiedLink)}`);
        }
        customMessage.appendText('\n');
        if (allPublishers.length > 1) {
            customMessage.appendMarkdown(localize('message4', "{0} has no control over the behavior of third-party extensions, including how they manage your personal data. Proceed only if you trust the publishers.", this.productService.nameLong));
        }
        else {
            customMessage.appendMarkdown(localize('message2', "{0} has no control over the behavior of third-party extensions, including how they manage your personal data. Proceed only if you trust the publisher.", this.productService.nameLong));
        }
        await this.dialogService.prompt({
            message: title,
            type: Severity.Warning,
            buttons: [installButton, learnMoreButton],
            cancelButton: {
                run: () => {
                    this.telemetryService.publicLog2('extensions:trustPublisher', { action: 'cancel', extensionId: untrustedExtensions.map(e => e.identifier.id).join(',') });
                    throw new CancellationError();
                }
            },
            custom: {
                markdownDetails: [{ markdown: customMessage, classes: ['extensions-management-publisher-trust-dialog'] }],
            }
        });
    }
    async getOtherUntrustedPublishers(manifests) {
        const extensionIds = new Set();
        for (const manifest of manifests) {
            for (const id of [...(manifest.extensionPack ?? []), ...(manifest.extensionDependencies ?? [])]) {
                const [publisherId] = id.split('.');
                if (publisherId.toLowerCase() === manifest.publisher.toLowerCase()) {
                    continue;
                }
                if (this.isPublisherUserTrusted(publisherId.toLowerCase())) {
                    continue;
                }
                extensionIds.add(id.toLowerCase());
            }
        }
        if (!extensionIds.size) {
            return [];
        }
        const extensions = new Map();
        await this.getDependenciesAndPackedExtensionsRecursively([...extensionIds], extensions, CancellationToken.None);
        const publishers = new Map();
        for (const [, extension] of extensions) {
            if (extension.private || this.isPublisherTrusted(extension)) {
                continue;
            }
            publishers.set(extension.publisherDisplayName, extension);
        }
        return [...publishers.values()];
    }
    async getDependenciesAndPackedExtensionsRecursively(toGet, result, token) {
        if (toGet.length === 0) {
            return;
        }
        const extensions = await this.extensionGalleryService.getExtensions(toGet.map(id => ({ id })), token);
        for (let idx = 0; idx < extensions.length; idx++) {
            const extension = extensions[idx];
            result.set(extension.identifier.id.toLowerCase(), extension);
        }
        toGet = [];
        for (const extension of extensions) {
            if (isNonEmptyArray(extension.properties.dependencies)) {
                for (const id of extension.properties.dependencies) {
                    if (!result.has(id.toLowerCase())) {
                        toGet.push(id);
                    }
                }
            }
            if (isNonEmptyArray(extension.properties.extensionPack)) {
                for (const id of extension.properties.extensionPack) {
                    if (!result.has(id.toLowerCase())) {
                        toGet.push(id);
                    }
                }
            }
        }
        return this.getDependenciesAndPackedExtensionsRecursively(toGet, result, token);
    }
    async checkForWorkspaceTrust(manifest, requireTrust) {
        if (requireTrust || this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(manifest) === false) {
            const buttons = [];
            buttons.push({ label: localize('extensionInstallWorkspaceTrustButton', "Trust Workspace & Install"), type: 'ContinueWithTrust' });
            if (!requireTrust) {
                buttons.push({ label: localize('extensionInstallWorkspaceTrustContinueButton', "Install"), type: 'ContinueWithoutTrust' });
            }
            buttons.push({ label: localize('extensionInstallWorkspaceTrustManageButton', "Learn More"), type: 'Manage' });
            const trustState = await this.workspaceTrustRequestService.requestWorkspaceTrust({
                message: localize('extensionInstallWorkspaceTrustMessage', "Enabling this extension requires a trusted workspace."),
                buttons
            });
            if (trustState === undefined) {
                throw new CancellationError();
            }
        }
    }
    async checkInstallingExtensionOnWeb(extension, manifest) {
        if (this.servers.length !== 1 || this.servers[0] !== this.extensionManagementServerService.webExtensionManagementServer) {
            return;
        }
        const nonWebExtensions = [];
        if (manifest.extensionPack?.length) {
            const extensions = await this.extensionGalleryService.getExtensions(manifest.extensionPack.map(id => ({ id })), CancellationToken.None);
            for (const extension of extensions) {
                if (await this.servers[0].extensionManagementService.canInstall(extension) !== true) {
                    nonWebExtensions.push(extension);
                }
            }
            if (nonWebExtensions.length && nonWebExtensions.length === extensions.length) {
                throw new ExtensionManagementError('Not supported in Web', "Unsupported" /* ExtensionManagementErrorCode.Unsupported */);
            }
        }
        const productName = localize('VS Code for Web', "{0} for the Web", this.productService.nameLong);
        const virtualWorkspaceSupport = this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(manifest);
        const virtualWorkspaceSupportReason = getWorkspaceSupportTypeMessage(manifest.capabilities?.virtualWorkspaces);
        const hasLimitedSupport = virtualWorkspaceSupport === 'limited' || !!virtualWorkspaceSupportReason;
        if (!nonWebExtensions.length && !hasLimitedSupport) {
            return;
        }
        const limitedSupportMessage = localize('limited support', "'{0}' has limited functionality in {1}.", extension.displayName || extension.identifier.id, productName);
        let message;
        let buttons = [];
        let detail;
        const installAnywayButton = {
            label: localize({ key: 'install anyways', comment: ['&& denotes a mnemonic'] }, "&&Install Anyway"),
            run: () => { }
        };
        const showExtensionsButton = {
            label: localize({ key: 'showExtensions', comment: ['&& denotes a mnemonic'] }, "&&Show Extensions"),
            run: () => this.instantiationService.invokeFunction(accessor => accessor.get(ICommandService).executeCommand('extension.open', extension.identifier.id, 'extensionPack'))
        };
        if (nonWebExtensions.length && hasLimitedSupport) {
            message = limitedSupportMessage;
            detail = `${virtualWorkspaceSupportReason ? `${virtualWorkspaceSupportReason}\n` : ''}${localize('non web extensions detail', "Contains extensions which are not supported.")}`;
            buttons = [
                installAnywayButton,
                showExtensionsButton
            ];
        }
        else if (hasLimitedSupport) {
            message = limitedSupportMessage;
            detail = virtualWorkspaceSupportReason || undefined;
            buttons = [installAnywayButton];
        }
        else {
            message = localize('non web extensions', "'{0}' contains extensions which are not supported in {1}.", extension.displayName || extension.identifier.id, productName);
            buttons = [
                installAnywayButton,
                showExtensionsButton
            ];
        }
        await this.dialogService.prompt({
            type: Severity.Info,
            message,
            detail,
            buttons,
            cancelButton: {
                run: () => { throw new CancellationError(); }
            }
        });
    }
    getTargetPlatform() {
        if (!this._targetPlatformPromise) {
            this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
        }
        return this._targetPlatformPromise;
    }
    async cleanUp() {
        await Promise.allSettled(this.servers.map(server => server.extensionManagementService.cleanUp()));
    }
    toggleApplicationScope(extension, fromProfileLocation) {
        const server = this.getServer(extension);
        if (server) {
            return server.extensionManagementService.toggleApplicationScope(extension, fromProfileLocation);
        }
        throw new Error('Not Supported');
    }
    copyExtensions(from, to) {
        if (this.extensionManagementServerService.remoteExtensionManagementServer) {
            throw new Error('Not Supported');
        }
        if (this.extensionManagementServerService.localExtensionManagementServer) {
            return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.copyExtensions(from, to);
        }
        if (this.extensionManagementServerService.webExtensionManagementServer) {
            return this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.copyExtensions(from, to);
        }
        return Promise.resolve();
    }
    registerParticipant() { throw new Error('Not Supported'); }
    installExtensionsFromProfile(extensions, fromProfileLocation, toProfileLocation) { throw new Error('Not Supported'); }
    isPublisherTrusted(extension) {
        const publisher = extension.publisher.toLowerCase();
        if (this.defaultTrustedPublishers.includes(publisher) || this.defaultTrustedPublishers.includes(extension.publisherDisplayName.toLowerCase())) {
            return true;
        }
        // Check if the extension is allowed by publisher or extension id
        if (this.allowedExtensionsService.allowedExtensionsConfigValue && this.allowedExtensionsService.isAllowed(extension)) {
            return true;
        }
        return this.isPublisherUserTrusted(publisher);
    }
    isPublisherUserTrusted(publisher) {
        const trustedPublishers = this.getTrustedPublishersFromStorage();
        return !!trustedPublishers[publisher];
    }
    getTrustedPublishers() {
        const trustedPublishers = this.getTrustedPublishersFromStorage();
        return Object.keys(trustedPublishers).map(publisher => trustedPublishers[publisher]);
    }
    trustPublishers(...publishers) {
        const trustedPublishers = this.getTrustedPublishersFromStorage();
        for (const publisher of publishers) {
            trustedPublishers[publisher.publisher.toLowerCase()] = publisher;
        }
        this.storageService.store(TrustedPublishersStorageKey, JSON.stringify(trustedPublishers), -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
    }
    untrustPublishers(...publishers) {
        const trustedPublishers = this.getTrustedPublishersFromStorage();
        for (const publisher of publishers) {
            delete trustedPublishers[publisher.toLowerCase()];
        }
        this.storageService.store(TrustedPublishersStorageKey, JSON.stringify(trustedPublishers), -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
    }
    getTrustedPublishersFromStorage() {
        const trustedPublishers = this.storageService.getObject(TrustedPublishersStorageKey, -1 /* StorageScope.APPLICATION */, {});
        if (Array.isArray(trustedPublishers)) {
            this.storageService.remove(TrustedPublishersStorageKey, -1 /* StorageScope.APPLICATION */);
            return Object.create(null);
        }
        return Object.keys(trustedPublishers).reduce((result, publisher) => {
            result[publisher.toLowerCase()] = trustedPublishers[publisher];
            return result;
        }, Object.create(null));
    }
};
ExtensionManagementService = __decorate([
    __param(0, IExtensionManagementServerService),
    __param(1, IExtensionGalleryService),
    __param(2, IUserDataProfileService),
    __param(3, IUserDataProfilesService),
    __param(4, IConfigurationService),
    __param(5, IProductService),
    __param(6, IDownloadService),
    __param(7, IUserDataSyncEnablementService),
    __param(8, IDialogService),
    __param(9, IWorkspaceTrustRequestService),
    __param(10, IExtensionManifestPropertiesService),
    __param(11, IFileService),
    __param(12, ILogService),
    __param(13, IInstantiationService),
    __param(14, IExtensionsScannerService),
    __param(15, IAllowedExtensionsService),
    __param(16, IStorageService),
    __param(17, ITelemetryService)
], ExtensionManagementService);
export { ExtensionManagementService };
let WorkspaceExtensionsManagementService = class WorkspaceExtensionsManagementService extends Disposable {
    static { WorkspaceExtensionsManagementService_1 = this; }
    static { this.WORKSPACE_EXTENSIONS_KEY = 'workspaceExtensions.locations'; }
    constructor(fileService, logService, workspaceService, extensionsScannerService, storageService, uriIdentityService, telemetryService) {
        super();
        this.fileService = fileService;
        this.logService = logService;
        this.workspaceService = workspaceService;
        this.extensionsScannerService = extensionsScannerService;
        this.storageService = storageService;
        this.uriIdentityService = uriIdentityService;
        this.telemetryService = telemetryService;
        this._onDidChangeInvalidExtensions = this._register(new Emitter());
        this.onDidChangeInvalidExtensions = this._onDidChangeInvalidExtensions.event;
        this.extensions = [];
        this.invalidExtensionWatchers = this._register(new DisposableStore());
        this._register(Event.throttle(this.fileService.onDidFilesChange, (last, e) => {
            (last = last ?? []).push(e);
            return last;
        }, 1000, false)(events => {
            const changedInvalidExtensions = this.extensions.filter(extension => !extension.isValid && events.some(e => e.affects(extension.location)));
            if (changedInvalidExtensions.length) {
                this.checkExtensionsValidity(changedInvalidExtensions);
            }
        }));
        this.initializePromise = this.initialize();
    }
    async initialize() {
        const existingLocations = this.getInstalledWorkspaceExtensionsLocations();
        if (!existingLocations.length) {
            return;
        }
        await Promise.allSettled(existingLocations.map(async (location) => {
            if (!this.workspaceService.isInsideWorkspace(location)) {
                this.logService.info(`Removing the workspace extension ${location.toString()} as it is not inside the workspace`);
                return;
            }
            if (!(await this.fileService.exists(location))) {
                this.logService.info(`Removing the workspace extension ${location.toString()} as it does not exist`);
                return;
            }
            try {
                const extension = await this.scanWorkspaceExtension(location);
                if (extension) {
                    this.extensions.push(extension);
                }
                else {
                    this.logService.info(`Skipping workspace extension ${location.toString()} as it does not exist`);
                }
            }
            catch (error) {
                this.logService.error('Skipping the workspace extension', location.toString(), error);
            }
        }));
        this.saveWorkspaceExtensions();
    }
    watchInvalidExtensions() {
        this.invalidExtensionWatchers.clear();
        for (const extension of this.extensions) {
            if (!extension.isValid) {
                this.invalidExtensionWatchers.add(this.fileService.watch(extension.location));
            }
        }
    }
    async checkExtensionsValidity(extensions) {
        const validExtensions = [];
        await Promise.all(extensions.map(async (extension) => {
            const newExtension = await this.scanWorkspaceExtension(extension.location);
            if (newExtension?.isValid) {
                validExtensions.push(newExtension);
            }
        }));
        let changed = false;
        for (const extension of validExtensions) {
            const index = this.extensions.findIndex(e => this.uriIdentityService.extUri.isEqual(e.location, extension.location));
            if (index !== -1) {
                changed = true;
                this.extensions.splice(index, 1, extension);
            }
        }
        if (changed) {
            this.saveWorkspaceExtensions();
            this._onDidChangeInvalidExtensions.fire(validExtensions);
        }
    }
    async getInstalled(includeInvalid) {
        await this.initializePromise;
        return this.extensions.filter(e => includeInvalid || e.isValid);
    }
    async install(extension) {
        await this.initializePromise;
        const workspaceExtension = await this.scanWorkspaceExtension(extension.location);
        if (!workspaceExtension) {
            throw new Error('Cannot install the extension as it does not exist.');
        }
        const existingExtensionIndex = this.extensions.findIndex(e => areSameExtensions(e.identifier, extension.identifier));
        if (existingExtensionIndex === -1) {
            this.extensions.push(workspaceExtension);
        }
        else {
            this.extensions.splice(existingExtensionIndex, 1, workspaceExtension);
        }
        this.saveWorkspaceExtensions();
        this.telemetryService.publicLog2('workspaceextension:install');
        return workspaceExtension;
    }
    async uninstall(extension) {
        await this.initializePromise;
        const existingExtensionIndex = this.extensions.findIndex(e => areSameExtensions(e.identifier, extension.identifier));
        if (existingExtensionIndex !== -1) {
            this.extensions.splice(existingExtensionIndex, 1);
            this.saveWorkspaceExtensions();
        }
        this.telemetryService.publicLog2('workspaceextension:uninstall');
    }
    getInstalledWorkspaceExtensionsLocations() {
        const locations = [];
        try {
            const parsed = JSON.parse(this.storageService.get(WorkspaceExtensionsManagementService_1.WORKSPACE_EXTENSIONS_KEY, 1 /* StorageScope.WORKSPACE */, '[]'));
            if (Array.isArray(locations)) {
                for (const location of parsed) {
                    if (isString(location)) {
                        if (this.workspaceService.getWorkbenchState() === 2 /* WorkbenchState.FOLDER */) {
                            locations.push(this.workspaceService.getWorkspace().folders[0].toResource(location));
                        }
                        else {
                            this.logService.warn(`Invalid value for 'extensions' in workspace storage: ${location}`);
                        }
                    }
                    else {
                        locations.push(URI.revive(location));
                    }
                }
            }
            else {
                this.logService.warn(`Invalid value for 'extensions' in workspace storage: ${locations}`);
            }
        }
        catch (error) {
            this.logService.warn(`Error parsing workspace extensions locations: ${getErrorMessage(error)}`);
        }
        return locations;
    }
    saveWorkspaceExtensions() {
        const locations = this.extensions.map(extension => extension.location);
        if (this.workspaceService.getWorkbenchState() === 2 /* WorkbenchState.FOLDER */) {
            this.storageService.store(WorkspaceExtensionsManagementService_1.WORKSPACE_EXTENSIONS_KEY, JSON.stringify(coalesce(locations
                .map(location => this.uriIdentityService.extUri.relativePath(this.workspaceService.getWorkspace().folders[0].uri, location)))), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.store(WorkspaceExtensionsManagementService_1.WORKSPACE_EXTENSIONS_KEY, JSON.stringify(locations), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        this.watchInvalidExtensions();
    }
    async scanWorkspaceExtension(location) {
        const scannedExtension = await this.extensionsScannerService.scanExistingExtension(location, 1 /* ExtensionType.User */, { includeInvalid: true });
        return scannedExtension ? this.toLocalWorkspaceExtension(scannedExtension) : null;
    }
    async toLocalWorkspaceExtension(extension) {
        const stat = await this.fileService.resolve(extension.location);
        let readmeUrl;
        let changelogUrl;
        if (stat.children) {
            readmeUrl = stat.children.find(({ name }) => /^readme(\.txt|\.md|)$/i.test(name))?.resource;
            changelogUrl = stat.children.find(({ name }) => /^changelog(\.txt|\.md|)$/i.test(name))?.resource;
        }
        const validations = [...extension.validations];
        let isValid = extension.isValid;
        if (extension.manifest.main) {
            if (!(await this.fileService.exists(this.uriIdentityService.extUri.joinPath(extension.location, extension.manifest.main)))) {
                isValid = false;
                validations.push([Severity.Error, localize('main.notFound', "Cannot activate because {0} not found", extension.manifest.main)]);
            }
        }
        return {
            identifier: extension.identifier,
            type: extension.type,
            isBuiltin: extension.isBuiltin || !!extension.metadata?.isBuiltin,
            location: extension.location,
            manifest: extension.manifest,
            targetPlatform: extension.targetPlatform,
            validations,
            isValid,
            readmeUrl,
            changelogUrl,
            publisherDisplayName: extension.metadata?.publisherDisplayName,
            publisherId: extension.metadata?.publisherId || null,
            isApplicationScoped: !!extension.metadata?.isApplicationScoped,
            isMachineScoped: !!extension.metadata?.isMachineScoped,
            isPreReleaseVersion: !!extension.metadata?.isPreReleaseVersion,
            hasPreReleaseVersion: !!extension.metadata?.hasPreReleaseVersion,
            preRelease: !!extension.metadata?.preRelease,
            installedTimestamp: extension.metadata?.installedTimestamp,
            updated: !!extension.metadata?.updated,
            pinned: !!extension.metadata?.pinned,
            isWorkspaceScoped: true,
            private: false,
            source: 'resource',
            size: extension.metadata?.size ?? 0,
        };
    }
};
WorkspaceExtensionsManagementService = WorkspaceExtensionsManagementService_1 = __decorate([
    __param(0, IFileService),
    __param(1, ILogService),
    __param(2, IWorkspaceContextService),
    __param(3, IExtensionsScannerService),
    __param(4, IStorageService),
    __param(5, IUriIdentityService),
    __param(6, ITelemetryService)
], WorkspaceExtensionsManagementService);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDcEYsT0FBTyxFQUNnRix3QkFBd0IsRUFBNEQsd0JBQXdCLEVBQTRELGdDQUFnQyxFQUs5Uix5QkFBeUIsRUFDekIsOENBQThDLEdBQzlDLE1BQU0sd0VBQXdFLENBQUM7QUFDaEYsT0FBTyxFQUFrRyxpQ0FBaUMsRUFBNEksTUFBTSwwQkFBMEIsQ0FBQztBQUN2VCxPQUFPLEVBQWlCLHVCQUF1QixFQUFzQiw4QkFBOEIsRUFBa0IsTUFBTSxzREFBc0QsQ0FBQztBQUNsTCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0RUFBNEUsQ0FBQztBQUN0SSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFP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