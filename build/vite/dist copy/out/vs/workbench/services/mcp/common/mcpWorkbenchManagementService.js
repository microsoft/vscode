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
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IMcpManagementService, IMcpGalleryService, IAllowedMcpServersService } from '../../../../platform/mcp/common/mcpManagement.js';
import { IInstantiationService, refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { Emitter } from '../../../../base/common/event.js';
import { IMcpResourceScannerService } from '../../../../platform/mcp/common/mcpResourceScannerService.js';
import { isWorkspaceFolder, IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from '../../configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { McpManagementChannelClient } from '../../../../platform/mcp/common/mcpManagementIpc.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IRemoteUserDataProfilesService } from '../../userDataProfile/common/remoteUserDataProfiles.js';
import { AbstractMcpManagementService, AbstractMcpResourceManagementService } from '../../../../platform/mcp/common/mcpManagementService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ResourceMap } from '../../../../base/common/map.js';
export const USER_CONFIG_ID = 'usrlocal';
export const REMOTE_USER_CONFIG_ID = 'usrremote';
export const WORKSPACE_CONFIG_ID = 'workspace';
export const WORKSPACE_FOLDER_CONFIG_ID_PREFIX = 'ws';
export var LocalMcpServerScope;
(function (LocalMcpServerScope) {
    LocalMcpServerScope["User"] = "user";
    LocalMcpServerScope["RemoteUser"] = "remoteUser";
    LocalMcpServerScope["Workspace"] = "workspace";
})(LocalMcpServerScope || (LocalMcpServerScope = {}));
export const IWorkbenchMcpManagementService = refineServiceDecorator(IMcpManagementService);
let WorkbenchMcpManagementService = class WorkbenchMcpManagementService extends AbstractMcpManagementService {
    constructor(mcpManagementService, allowedMcpServersService, logService, userDataProfileService, uriIdentityService, workspaceContextService, remoteAgentService, userDataProfilesService, remoteUserDataProfilesService, instantiationService) {
        super(allowedMcpServersService, logService);
        this.mcpManagementService = mcpManagementService;
        this.userDataProfileService = userDataProfileService;
        this.uriIdentityService = uriIdentityService;
        this.workspaceContextService = workspaceContextService;
        this.userDataProfilesService = userDataProfilesService;
        this.remoteUserDataProfilesService = remoteUserDataProfilesService;
        this._onInstallMcpServer = this._register(new Emitter());
        this.onInstallMcpServer = this._onInstallMcpServer.event;
        this._onDidInstallMcpServers = this._register(new Emitter());
        this.onDidInstallMcpServers = this._onDidInstallMcpServers.event;
        this._onDidUpdateMcpServers = this._register(new Emitter());
        this.onDidUpdateMcpServers = this._onDidUpdateMcpServers.event;
        this._onUninstallMcpServer = this._register(new Emitter());
        this.onUninstallMcpServer = this._onUninstallMcpServer.event;
        this._onDidUninstallMcpServer = this._register(new Emitter());
        this.onDidUninstallMcpServer = this._onDidUninstallMcpServer.event;
        this._onInstallMcpServerInCurrentProfile = this._register(new Emitter());
        this.onInstallMcpServerInCurrentProfile = this._onInstallMcpServerInCurrentProfile.event;
        this._onDidInstallMcpServersInCurrentProfile = this._register(new Emitter());
        this.onDidInstallMcpServersInCurrentProfile = this._onDidInstallMcpServersInCurrentProfile.event;
        this._onDidUpdateMcpServersInCurrentProfile = this._register(new Emitter());
        this.onDidUpdateMcpServersInCurrentProfile = this._onDidUpdateMcpServersInCurrentProfile.event;
        this._onUninstallMcpServerInCurrentProfile = this._register(new Emitter());
        this.onUninstallMcpServerInCurrentProfile = this._onUninstallMcpServerInCurrentProfile.event;
        this._onDidUninstallMcpServerInCurrentProfile = this._register(new Emitter());
        this.onDidUninstallMcpServerInCurrentProfile = this._onDidUninstallMcpServerInCurrentProfile.event;
        this._onDidChangeProfile = this._register(new Emitter());
        this.onDidChangeProfile = this._onDidChangeProfile.event;
        this.workspaceMcpManagementService = this._register(instantiationService.createInstance(WorkspaceMcpManagementService));
        const remoteAgentConnection = remoteAgentService.getConnection();
        if (remoteAgentConnection) {
            this.remoteMcpManagementService = this._register(instantiationService.createInstance(McpManagementChannelClient, remoteAgentConnection.getChannel('mcpManagement')));
        }
        this._register(this.mcpManagementService.onInstallMcpServer(e => {
            this._onInstallMcpServer.fire(e);
            if (uriIdentityService.extUri.isEqual(e.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
                this._onInstallMcpServerInCurrentProfile.fire({ ...e, scope: "user" /* LocalMcpServerScope.User */ });
            }
        }));
        this._register(this.mcpManagementService.onDidInstallMcpServers(e => {
            const { mcpServerInstallResult, mcpServerInstallResultInCurrentProfile } = this.createInstallMcpServerResultsFromEvent(e, "user" /* LocalMcpServerScope.User */);
            this._onDidInstallMcpServers.fire(mcpServerInstallResult);
            if (mcpServerInstallResultInCurrentProfile.length) {
                this._onDidInstallMcpServersInCurrentProfile.fire(mcpServerInstallResultInCurrentProfile);
            }
        }));
        this._register(this.mcpManagementService.onDidUpdateMcpServers(e => {
            const { mcpServerInstallResult, mcpServerInstallResultInCurrentProfile } = this.createInstallMcpServerResultsFromEvent(e, "user" /* LocalMcpServerScope.User */);
            this._onDidUpdateMcpServers.fire(mcpServerInstallResult);
            if (mcpServerInstallResultInCurrentProfile.length) {
                this._onDidUpdateMcpServersInCurrentProfile.fire(mcpServerInstallResultInCurrentProfile);
            }
        }));
        this._register(this.mcpManagementService.onUninstallMcpServer(e => {
            this._onUninstallMcpServer.fire(e);
            if (uriIdentityService.extUri.isEqual(e.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
                this._onUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "user" /* LocalMcpServerScope.User */ });
            }
        }));
        this._register(this.mcpManagementService.onDidUninstallMcpServer(e => {
            this._onDidUninstallMcpServer.fire(e);
            if (uriIdentityService.extUri.isEqual(e.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
                this._onDidUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "user" /* LocalMcpServerScope.User */ });
            }
        }));
        this._register(this.workspaceMcpManagementService.onInstallMcpServer(async (e) => {
            this._onInstallMcpServer.fire(e);
            this._onInstallMcpServerInCurrentProfile.fire({ ...e, scope: "workspace" /* LocalMcpServerScope.Workspace */ });
        }));
        this._register(this.workspaceMcpManagementService.onDidInstallMcpServers(async (e) => {
            const { mcpServerInstallResult } = this.createInstallMcpServerResultsFromEvent(e, "workspace" /* LocalMcpServerScope.Workspace */);
            this._onDidInstallMcpServers.fire(mcpServerInstallResult);
            this._onDidInstallMcpServersInCurrentProfile.fire(mcpServerInstallResult);
        }));
        this._register(this.workspaceMcpManagementService.onUninstallMcpServer(async (e) => {
            this._onUninstallMcpServer.fire(e);
            this._onUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "workspace" /* LocalMcpServerScope.Workspace */ });
        }));
        this._register(this.workspaceMcpManagementService.onDidUninstallMcpServer(async (e) => {
            this._onDidUninstallMcpServer.fire(e);
            this._onDidUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "workspace" /* LocalMcpServerScope.Workspace */ });
        }));
        this._register(this.workspaceMcpManagementService.onDidUpdateMcpServers(e => {
            const { mcpServerInstallResult } = this.createInstallMcpServerResultsFromEvent(e, "workspace" /* LocalMcpServerScope.Workspace */);
            this._onDidUpdateMcpServers.fire(mcpServerInstallResult);
            this._onDidUpdateMcpServersInCurrentProfile.fire(mcpServerInstallResult);
        }));
        if (this.remoteMcpManagementService) {
            this._register(this.remoteMcpManagementService.onInstallMcpServer(async (e) => {
                this._onInstallMcpServer.fire(e);
                const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
                if (remoteMcpResource ? uriIdentityService.extUri.isEqual(e.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
                    this._onInstallMcpServerInCurrentProfile.fire({ ...e, scope: "remoteUser" /* LocalMcpServerScope.RemoteUser */ });
                }
            }));
            this._register(this.remoteMcpManagementService.onDidInstallMcpServers(e => this.handleRemoteInstallMcpServerResultsFromEvent(e, this._onDidInstallMcpServers, this._onDidInstallMcpServersInCurrentProfile)));
            this._register(this.remoteMcpManagementService.onDidUpdateMcpServers(e => this.handleRemoteInstallMcpServerResultsFromEvent(e, this._onDidInstallMcpServers, this._onDidInstallMcpServersInCurrentProfile)));
            this._register(this.remoteMcpManagementService.onUninstallMcpServer(async (e) => {
                this._onUninstallMcpServer.fire(e);
                const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
                if (remoteMcpResource ? uriIdentityService.extUri.isEqual(e.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
                    this._onUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "remoteUser" /* LocalMcpServerScope.RemoteUser */ });
                }
            }));
            this._register(this.remoteMcpManagementService.onDidUninstallMcpServer(async (e) => {
                this._onDidUninstallMcpServer.fire(e);
                const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
                if (remoteMcpResource ? uriIdentityService.extUri.isEqual(e.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
                    this._onDidUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "remoteUser" /* LocalMcpServerScope.RemoteUser */ });
                }
            }));
        }
        this._register(userDataProfileService.onDidChangeCurrentProfile(e => {
            if (!this.uriIdentityService.extUri.isEqual(e.previous.mcpResource, e.profile.mcpResource)) {
                this._onDidChangeProfile.fire();
            }
        }));
    }
    createInstallMcpServerResultsFromEvent(e, scope) {
        const mcpServerInstallResult = [];
        const mcpServerInstallResultInCurrentProfile = [];
        for (const result of e) {
            const workbenchResult = {
                ...result,
                local: result.local ? this.toWorkspaceMcpServer(result.local, scope) : undefined
            };
            mcpServerInstallResult.push(workbenchResult);
            if (this.uriIdentityService.extUri.isEqual(result.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
                mcpServerInstallResultInCurrentProfile.push(workbenchResult);
            }
        }
        return { mcpServerInstallResult, mcpServerInstallResultInCurrentProfile };
    }
    async handleRemoteInstallMcpServerResultsFromEvent(e, emitter, currentProfileEmitter) {
        const mcpServerInstallResult = [];
        const mcpServerInstallResultInCurrentProfile = [];
        const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
        for (const result of e) {
            const workbenchResult = {
                ...result,
                local: result.local ? this.toWorkspaceMcpServer(result.local, "remoteUser" /* LocalMcpServerScope.RemoteUser */) : undefined
            };
            mcpServerInstallResult.push(workbenchResult);
            if (remoteMcpResource ? this.uriIdentityService.extUri.isEqual(result.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
                mcpServerInstallResultInCurrentProfile.push(workbenchResult);
            }
        }
        emitter.fire(mcpServerInstallResult);
        if (mcpServerInstallResultInCurrentProfile.length) {
            currentProfileEmitter.fire(mcpServerInstallResultInCurrentProfile);
        }
    }
    async getInstalled() {
        const installed = [];
        const [userServers, remoteServers, workspaceServers] = await Promise.all([
            this.mcpManagementService.getInstalled(this.userDataProfileService.currentProfile.mcpResource),
            this.remoteMcpManagementService?.getInstalled(await this.getRemoteMcpResource()) ?? Promise.resolve([]),
            this.workspaceMcpManagementService?.getInstalled() ?? Promise.resolve([]),
        ]);
        for (const server of userServers) {
            installed.push(this.toWorkspaceMcpServer(server, "user" /* LocalMcpServerScope.User */));
        }
        for (const server of remoteServers) {
            installed.push(this.toWorkspaceMcpServer(server, "remoteUser" /* LocalMcpServerScope.RemoteUser */));
        }
        for (const server of workspaceServers) {
            installed.push(this.toWorkspaceMcpServer(server, "workspace" /* LocalMcpServerScope.Workspace */));
        }
        return installed;
    }
    toWorkspaceMcpServer(server, scope) {
        return { ...server, id: `mcp.config.${this.getConfigId(server, scope)}.${server.name}`, scope };
    }
    getConfigId(server, scope) {
        if (scope === "user" /* LocalMcpServerScope.User */) {
            return USER_CONFIG_ID;
        }
        if (scope === "remoteUser" /* LocalMcpServerScope.RemoteUser */) {
            return REMOTE_USER_CONFIG_ID;
        }
        if (scope === "workspace" /* LocalMcpServerScope.Workspace */) {
            const workspace = this.workspaceContextService.getWorkspace();
            if (workspace.configuration && this.uriIdentityService.extUri.isEqual(workspace.configuration, server.mcpResource)) {
                return WORKSPACE_CONFIG_ID;
            }
            const workspaceFolders = workspace.folders;
            for (let index = 0; index < workspaceFolders.length; index++) {
                const workspaceFolder = workspaceFolders[index];
                if (this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.joinPath(workspaceFolder.uri, WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]), server.mcpResource)) {
                    return `${WORKSPACE_FOLDER_CONFIG_ID_PREFIX}${index}`;
                }
            }
        }
        return 'unknown';
    }
    async install(server, options) {
        options = options ?? {};
        if (options.target === 5 /* ConfigurationTarget.WORKSPACE */ || isWorkspaceFolder(options.target)) {
            const mcpResource = options.target === 5 /* ConfigurationTarget.WORKSPACE */ ? this.workspaceContextService.getWorkspace().configuration : options.target.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]);
            if (!mcpResource) {
                throw new Error(`Illegal target: ${options.target}`);
            }
            options.mcpResource = mcpResource;
            const result = await this.workspaceMcpManagementService.install(server, options);
            return this.toWorkspaceMcpServer(result, "workspace" /* LocalMcpServerScope.Workspace */);
        }
        if (options.target === 4 /* ConfigurationTarget.USER_REMOTE */) {
            if (!this.remoteMcpManagementService) {
                throw new Error(`Illegal target: ${options.target}`);
            }
            options.mcpResource = await this.getRemoteMcpResource(options.mcpResource);
            const result = await this.remoteMcpManagementService.install(server, options);
            return this.toWorkspaceMcpServer(result, "remoteUser" /* LocalMcpServerScope.RemoteUser */);
        }
        if (options.target && options.target !== 2 /* ConfigurationTarget.USER */ && options.target !== 3 /* ConfigurationTarget.USER_LOCAL */) {
            throw new Error(`Illegal target: ${options.target}`);
        }
        options.mcpResource = this.userDataProfileService.currentProfile.mcpResource;
        const result = await this.mcpManagementService.install(server, options);
        return this.toWorkspaceMcpServer(result, "user" /* LocalMcpServerScope.User */);
    }
    async installFromGallery(server, options) {
        options = options ?? {};
        if (options.target === 5 /* ConfigurationTarget.WORKSPACE */ || isWorkspaceFolder(options.target)) {
            const mcpResource = options.target === 5 /* ConfigurationTarget.WORKSPACE */ ? this.workspaceContextService.getWorkspace().configuration : options.target.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]);
            if (!mcpResource) {
                throw new Error(`Illegal target: ${options.target}`);
            }
            options.mcpResource = mcpResource;
            const result = await this.workspaceMcpManagementService.installFromGallery(server, options);
            return this.toWorkspaceMcpServer(result, "workspace" /* LocalMcpServerScope.Workspace */);
        }
        if (options.target === 4 /* ConfigurationTarget.USER_REMOTE */) {
            if (!this.remoteMcpManagementService) {
                throw new Error(`Illegal target: ${options.target}`);
            }
            options.mcpResource = await this.getRemoteMcpResource(options.mcpResource);
            const result = await this.remoteMcpManagementService.installFromGallery(server, options);
            return this.toWorkspaceMcpServer(result, "remoteUser" /* LocalMcpServerScope.RemoteUser */);
        }
        if (options.target && options.target !== 2 /* ConfigurationTarget.USER */ && options.target !== 3 /* ConfigurationTarget.USER_LOCAL */) {
            throw new Error(`Illegal target: ${options.target}`);
        }
        if (!options.mcpResource) {
            options.mcpResource = this.userDataProfileService.currentProfile.mcpResource;
        }
        const result = await this.mcpManagementService.installFromGallery(server, options);
        return this.toWorkspaceMcpServer(result, "user" /* LocalMcpServerScope.User */);
    }
    async updateMetadata(local, server, profileLocation) {
        if (local.scope === "workspace" /* LocalMcpServerScope.Workspace */) {
            const result = await this.workspaceMcpManagementService.updateMetadata(local, server, profileLocation);
            return this.toWorkspaceMcpServer(result, "workspace" /* LocalMcpServerScope.Workspace */);
        }
        if (local.scope === "remoteUser" /* LocalMcpServerScope.RemoteUser */) {
            if (!this.remoteMcpManagementService) {
                throw new Error(`Illegal target: ${local.scope}`);
            }
            const result = await this.remoteMcpManagementService.updateMetadata(local, server, profileLocation);
            return this.toWorkspaceMcpServer(result, "remoteUser" /* LocalMcpServerScope.RemoteUser */);
        }
        const result = await this.mcpManagementService.updateMetadata(local, server, profileLocation);
        return this.toWorkspaceMcpServer(result, "user" /* LocalMcpServerScope.User */);
    }
    async uninstall(server) {
        if (server.scope === "workspace" /* LocalMcpServerScope.Workspace */) {
            return this.workspaceMcpManagementService.uninstall(server);
        }
        if (server.scope === "remoteUser" /* LocalMcpServerScope.RemoteUser */) {
            if (!this.remoteMcpManagementService) {
                throw new Error(`Illegal target: ${server.scope}`);
            }
            return this.remoteMcpManagementService.uninstall(server);
        }
        return this.mcpManagementService.uninstall(server, { mcpResource: this.userDataProfileService.currentProfile.mcpResource });
    }
    async getRemoteMcpResource(mcpResource) {
        if (!mcpResource && this.userDataProfileService.currentProfile.isDefault) {
            return undefined;
        }
        mcpResource = mcpResource ?? this.userDataProfileService.currentProfile.mcpResource;
        let profile = this.userDataProfilesService.profiles.find(p => this.uriIdentityService.extUri.isEqual(p.mcpResource, mcpResource));
        if (profile) {
            profile = await this.remoteUserDataProfilesService.getRemoteProfile(profile);
        }
        else {
            profile = (await this.remoteUserDataProfilesService.getRemoteProfiles()).find(p => this.uriIdentityService.extUri.isEqual(p.mcpResource, mcpResource));
        }
        return profile?.mcpResource;
    }
};
WorkbenchMcpManagementService = __decorate([
    __param(1, IAllowedMcpServersService),
    __param(2, ILogService),
    __param(3, IUserDataProfileService),
    __param(4, IUriIdentityService),
    __param(5, IWorkspaceContextService),
    __param(6, IRemoteAgentService),
    __param(7, IUserDataProfilesService),
    __param(8, IRemoteUserDataProfilesService),
    __param(9, IInstantiationService)
], WorkbenchMcpManagementService);
export { WorkbenchMcpManagementService };
let WorkspaceMcpResourceManagementService = class WorkspaceMcpResourceManagementService extends AbstractMcpResourceManagementService {
    constructor(mcpResource, target, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService) {
        super(mcpResource, target, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService);
    }
    async installFromGallery(server, options) {
        this.logService.trace('MCP Management Service: installGallery', server.name, server.galleryUrl);
        this._onInstallMcpServer.fire({ name: server.name, mcpResource: this.mcpResource });
        try {
            const packageType = options?.packageType ?? server.configuration.packages?.[0]?.registryType ?? "remote" /* RegistryType.REMOTE */;
            const { mcpServerConfiguration, notices } = this.getMcpServerConfigurationFromManifest(server.configuration, packageType);
            if (notices.length > 0) {
                this.logService.warn(`MCP Management Service: Warnings while installing ${server.name}`, notices);
            }
            const installable = {
                name: server.name,
                config: {
                    ...mcpServerConfiguration.config,
                    gallery: server.galleryUrl ?? true,
                    version: server.version
                },
                inputs: mcpServerConfiguration.inputs
            };
            await this.mcpResourceScannerService.addMcpServers([installable], this.mcpResource, this.target);
            await this.updateLocal();
            const local = (await this.getInstalled()).find(s => s.name === server.name);
            if (!local) {
                throw new Error(`Failed to install MCP server: ${server.name}`);
            }
            return local;
        }
        catch (e) {
            this._onDidInstallMcpServers.fire([{ name: server.name, source: server, error: e, mcpResource: this.mcpResource }]);
            throw e;
        }
    }
    updateMetadata() {
        throw new Error('Not supported');
    }
    installFromUri() {
        throw new Error('Not supported');
    }
    async getLocalServerInfo(name, mcpServerConfig) {
        if (!mcpServerConfig.gallery) {
            return undefined;
        }
        const [mcpServer] = await this.mcpGalleryService.getMcpServersFromGallery([{ name }]);
        if (!mcpServer) {
            return undefined;
        }
        return {
            name: mcpServer.name,
            version: mcpServerConfig.version,
            displayName: mcpServer.displayName,
            description: mcpServer.description,
            galleryUrl: mcpServer.galleryUrl,
            manifest: mcpServer.configuration,
            publisher: mcpServer.publisher,
            publisherDisplayName: mcpServer.publisherDisplayName,
            repositoryUrl: mcpServer.repositoryUrl,
            icon: mcpServer.icon,
        };
    }
    canInstall(server) {
        throw new Error('Not supported');
    }
};
WorkspaceMcpResourceManagementService = __decorate([
    __param(2, IMcpGalleryService),
    __param(3, IFileService),
    __param(4, IUriIdentityService),
    __param(5, ILogService),
    __param(6, IMcpResourceScannerService)
], WorkspaceMcpResourceManagementService);
let WorkspaceMcpManagementService = class WorkspaceMcpManagementService extends AbstractMcpManagementService {
    constructor(allowedMcpServersService, uriIdentityService, logService, workspaceContextService, instantiationService) {
        super(allowedMcpServersService, logService);
        this.uriIdentityService = uriIdentityService;
        this.workspaceContextService = workspaceContextService;
        this.instantiationService = instantiationService;
        this._onInstallMcpServer = this._register(new Emitter());
        this.onInstallMcpServer = this._onInstallMcpServer.event;
        this._onDidInstallMcpServers = this._register(new Emitter());
        this.onDidInstallMcpServers = this._onDidInstallMcpServers.event;
        this._onDidUpdateMcpServers = this._register(new Emitter());
        this.onDidUpdateMcpServers = this._onDidUpdateMcpServers.event;
        this._onUninstallMcpServer = this._register(new Emitter());
        this.onUninstallMcpServer = this._onUninstallMcpServer.event;
        this._onDidUninstallMcpServer = this._register(new Emitter());
        this.onDidUninstallMcpServer = this._onDidUninstallMcpServer.event;
        this.allMcpServers = [];
        this.workspaceMcpManagementServices = new ResourceMap();
        this.initialize();
    }
    async initialize() {
        try {
            await this.onDidChangeWorkbenchState();
            await this.onDidChangeWorkspaceFolders({ added: this.workspaceContextService.getWorkspace().folders, removed: [], changed: [] });
            this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(e => this.onDidChangeWorkspaceFolders(e)));
            this._register(this.workspaceContextService.onDidChangeWorkbenchState(e => this.onDidChangeWorkbenchState()));
        }
        catch (error) {
            this.logService.error('Failed to initialize workspace folders', error);
        }
    }
    async onDidChangeWorkbenchState() {
        if (this.workspaceConfiguration) {
            await this.removeWorkspaceService(this.workspaceConfiguration);
        }
        this.workspaceConfiguration = this.workspaceContextService.getWorkspace().configuration;
        if (this.workspaceConfiguration) {
            await this.addWorkspaceService(this.workspaceConfiguration, 5 /* ConfigurationTarget.WORKSPACE */);
        }
    }
    async onDidChangeWorkspaceFolders(e) {
        try {
            await Promise.allSettled(e.removed.map(folder => this.removeWorkspaceService(folder.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]))));
        }
        catch (error) {
            this.logService.error(error);
        }
        try {
            await Promise.allSettled(e.added.map(folder => this.addWorkspaceService(folder.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]), 6 /* ConfigurationTarget.WORKSPACE_FOLDER */)));
        }
        catch (error) {
            this.logService.error(error);
        }
    }
    async addWorkspaceService(mcpResource, target) {
        if (this.workspaceMcpManagementServices.has(mcpResource)) {
            return;
        }
        const disposables = new DisposableStore();
        const service = disposables.add(this.instantiationService.createInstance(WorkspaceMcpResourceManagementService, mcpResource, target));
        try {
            const installedServers = await service.getInstalled();
            this.allMcpServers.push(...installedServers);
            if (installedServers.length > 0) {
                const installResults = installedServers.map(server => ({
                    name: server.name,
                    local: server,
                    mcpResource: server.mcpResource
                }));
                this._onDidInstallMcpServers.fire(installResults);
            }
        }
        catch (error) {
            this.logService.warn('Failed to get installed servers from', mcpResource.toString(), error);
        }
        disposables.add(service.onInstallMcpServer(e => this._onInstallMcpServer.fire(e)));
        disposables.add(service.onDidInstallMcpServers(e => {
            for (const { local } of e) {
                if (local) {
                    this.allMcpServers.push(local);
                }
            }
            this._onDidInstallMcpServers.fire(e);
        }));
        disposables.add(service.onDidUpdateMcpServers(e => {
            for (const { local, mcpResource } of e) {
                if (local) {
                    const index = this.allMcpServers.findIndex(server => this.uriIdentityService.extUri.isEqual(server.mcpResource, mcpResource) && server.name === local.name);
                    if (index !== -1) {
                        this.allMcpServers.splice(index, 1, local);
                    }
                }
            }
            this._onDidUpdateMcpServers.fire(e);
        }));
        disposables.add(service.onUninstallMcpServer(e => this._onUninstallMcpServer.fire(e)));
        disposables.add(service.onDidUninstallMcpServer(e => {
            const index = this.allMcpServers.findIndex(server => this.uriIdentityService.extUri.isEqual(server.mcpResource, e.mcpResource) && server.name === e.name);
            if (index !== -1) {
                this.allMcpServers.splice(index, 1);
                this._onDidUninstallMcpServer.fire(e);
            }
        }));
        this.workspaceMcpManagementServices.set(mcpResource, { service, dispose: () => disposables.dispose() });
    }
    async removeWorkspaceService(mcpResource) {
        const serviceItem = this.workspaceMcpManagementServices.get(mcpResource);
        if (serviceItem) {
            try {
                const installedServers = await serviceItem.service.getInstalled();
                this.allMcpServers = this.allMcpServers.filter(server => !installedServers.some(uninstalled => this.uriIdentityService.extUri.isEqual(uninstalled.mcpResource, server.mcpResource)));
                for (const server of installedServers) {
                    this._onDidUninstallMcpServer.fire({
                        name: server.name,
                        mcpResource: server.mcpResource
                    });
                }
            }
            catch (error) {
                this.logService.warn('Failed to get installed servers from', mcpResource.toString(), error);
            }
            this.workspaceMcpManagementServices.delete(mcpResource);
            serviceItem.dispose();
        }
    }
    async getInstalled() {
        return this.allMcpServers;
    }
    async install(server, options) {
        if (!options?.mcpResource) {
            throw new Error('MCP resource is required');
        }
        const mcpManagementServiceItem = this.workspaceMcpManagementServices.get(options?.mcpResource);
        if (!mcpManagementServiceItem) {
            throw new Error(`No MCP management service found for resource: ${options?.mcpResource.toString()}`);
        }
        return mcpManagementServiceItem.service.install(server, options);
    }
    async uninstall(server, options) {
        const mcpResource = server.mcpResource;
        const mcpManagementServiceItem = this.workspaceMcpManagementServices.get(mcpResource);
        if (!mcpManagementServiceItem) {
            throw new Error(`No MCP management service found for resource: ${mcpResource.toString()}`);
        }
        return mcpManagementServiceItem.service.uninstall(server, options);
    }
    installFromGallery(gallery, options) {
        if (!options?.mcpResource) {
            throw new Error('MCP resource is required');
        }
        const mcpManagementServiceItem = this.workspaceMcpManagementServices.get(options?.mcpResource);
        if (!mcpManagementServiceItem) {
            throw new Error(`No MCP management service found for resource: ${options?.mcpResource.toString()}`);
        }
        return mcpManagementServiceItem.service.installFromGallery(gallery, options);
    }
    updateMetadata() {
        throw new Error('Not supported');
    }
    dispose() {
        this.workspaceMcpManagementServices.forEach(service => service.dispose());
        this.workspaceMcpManagementServices.clear();
        super.dispose();
    }
};
WorkspaceMcpManagementService = __decorate([
    __param(0, IAllowedMcpServersService),
    __param(1, IUriIdentityService),
    __param(2, ILogService),
    __param(3, IWorkspaceContextService),
    __param(4, IInstantiationService)
], WorkspaceMcpManagementService);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwV29ya2JlbmNoTWFuYWdlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvbWNwL2NvbW1vbi9tY3BXb3JrYmVuY2hNYW5hZ2VtZW50U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDcEYsT0FBTyxFQUFtQixxQkFBcUIsRUFBZ0ssa0JBQWtCLEVBQW9CLHlCQUF5QixFQUFnQixNQUFNLGtEQUFrRCxDQUFDO0FBQ3ZWLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzNILE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsMEJBQTBCLEVBQXFCLE1BQU0sOERBQThELENBQUM7QUFDN0gsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHdCQUF3QixFQUFrRCxNQUFNLG9EQUFvRCxDQUFDO0FBQ2pLLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3pILE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUloRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUMxRyxPQUFPLEVBQUUsOEJB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