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
import { Emitter, Event } from '../../../../base/common/event.js';
import { createCommandUri, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMcpGalleryService, mcpAccessConfig, IAllowedMcpServersService } from '../../../../platform/mcp/common/mcpManagement.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IURLService } from '../../../../platform/url/common/url.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from '../../../services/configuration/common/configuration.js';
import { ACTIVE_GROUP, IEditorService, MODAL_GROUP } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IWorkbenchMcpManagementService, REMOTE_USER_CONFIG_ID, USER_CONFIG_ID, WORKSPACE_CONFIG_ID, WORKSPACE_FOLDER_CONFIG_ID_PREFIX } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { mcpConfigurationSection } from '../common/mcpConfiguration.js';
import { HasInstalledMcpServersContext, IMcpService, IMcpWorkbenchService, McpServersGalleryStatusContext } from '../common/mcpTypes.js';
import { McpServerEditorInput } from './mcpServerEditorInput.js';
import { IMcpGalleryManifestService } from '../../../../platform/mcp/common/mcpGalleryManifest.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { autorun, runOnChange } from '../../../../base/common/observable.js';
import Severity from '../../../../base/common/severity.js';
import { Queue } from '../../../../base/common/async.js';
let McpWorkbenchServer = class McpWorkbenchServer {
    constructor(installStateProvider, runtimeStateProvider, local, gallery, installable, mcpGalleryService, fileService) {
        this.installStateProvider = installStateProvider;
        this.runtimeStateProvider = runtimeStateProvider;
        this.local = local;
        this.gallery = gallery;
        this.installable = installable;
        this.mcpGalleryService = mcpGalleryService;
        this.fileService = fileService;
        this.local = local;
    }
    get id() {
        return this.local?.id ?? this.gallery?.name ?? this.installable?.name ?? this.name;
    }
    get name() {
        return this.gallery?.name ?? this.local?.name ?? this.installable?.name ?? '';
    }
    get label() {
        return this.gallery?.displayName ?? this.local?.displayName ?? this.local?.name ?? this.installable?.name ?? '';
    }
    get icon() {
        return this.gallery?.icon ?? this.local?.icon;
    }
    get installState() {
        return this.installStateProvider(this);
    }
    get codicon() {
        return this.gallery?.codicon ?? this.local?.codicon;
    }
    get publisherDisplayName() {
        return this.gallery?.publisherDisplayName ?? this.local?.publisherDisplayName ?? this.gallery?.publisher ?? this.local?.publisher;
    }
    get publisherUrl() {
        return this.gallery?.publisherDomain?.link;
    }
    get description() {
        return this.gallery?.description ?? this.local?.description ?? '';
    }
    get starsCount() {
        return this.gallery?.starsCount ?? 0;
    }
    get license() {
        return this.gallery?.license;
    }
    get repository() {
        return this.gallery?.repositoryUrl;
    }
    get config() {
        return this.local?.config ?? this.installable?.config;
    }
    get runtimeStatus() {
        return this.runtimeStateProvider(this);
    }
    get readmeUrl() {
        return this.local?.readmeUrl ?? (this.gallery?.readmeUrl ? URI.parse(this.gallery.readmeUrl) : undefined);
    }
    async getReadme(token) {
        if (this.local?.readmeUrl) {
            const content = await this.fileService.readFile(this.local.readmeUrl);
            return content.value.toString();
        }
        if (this.gallery?.readme) {
            return this.gallery.readme;
        }
        if (this.gallery?.readmeUrl) {
            return this.mcpGalleryService.getReadme(this.gallery, token);
        }
        return Promise.reject(new Error('not available'));
    }
    async getManifest(token) {
        if (this.local?.manifest) {
            return this.local.manifest;
        }
        if (this.gallery) {
            return this.gallery.configuration;
        }
        throw new Error('No manifest available');
    }
};
McpWorkbenchServer = __decorate([
    __param(5, IMcpGalleryService),
    __param(6, IFileService)
], McpWorkbenchServer);
let McpWorkbenchService = class McpWorkbenchService extends Disposable {
    get local() { return [...this._local]; }
    constructor(mcpGalleryManifestService, mcpGalleryService, mcpManagementService, editorService, userDataProfilesService, uriIdentityService, workspaceService, environmentService, labelService, productService, remoteAgentService, configurationService, instantiationService, telemetryService, logService, extensionsWorkbenchService, allowedMcpServersService, mcpService, urlService) {
        super();
        this.mcpGalleryService = mcpGalleryService;
        this.mcpManagementService = mcpManagementService;
        this.editorService = editorService;
        this.userDataProfilesService = userDataProfilesService;
        this.uriIdentityService = uriIdentityService;
        this.workspaceService = workspaceService;
        this.environmentService = environmentService;
        this.labelService = labelService;
        this.productService = productService;
        this.remoteAgentService = remoteAgentService;
        this.configurationService = configurationService;
        this.instantiationService = instantiationService;
        this.telemetryService = telemetryService;
        this.logService = logService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.allowedMcpServersService = allowedMcpServersService;
        this.mcpService = mcpService;
        this.installing = [];
        this.uninstalling = [];
        this._local = [];
        this._onChange = this._register(new Emitter());
        this.onChange = this._onChange.event;
        this._onReset = this._register(new Emitter());
        this.onReset = this._onReset.event;
        this._register(this.mcpManagementService.onDidInstallMcpServersInCurrentProfile(e => this.onDidInstallMcpServers(e)));
        this._register(this.mcpManagementService.onDidUpdateMcpServersInCurrentProfile(e => this.onDidUpdateMcpServers(e)));
        this._register(this.mcpManagementService.onDidUninstallMcpServerInCurrentProfile(e => this.onDidUninstallMcpServer(e)));
        this._register(this.mcpManagementService.onDidChangeProfile(e => this.onDidChangeProfile()));
        this.queryLocal().then(() => {
            if (this._store.isDisposed) {
                return;
            }
            const queue = this._register(new Queue());
            this._register(mcpGalleryManifestService.onDidChangeMcpGalleryManifest(e => queue.queue(() => this.syncInstalledMcpServers())));
            queue.queue(() => this.syncInstalledMcpServers());
        });
        urlService.registerHandler(this);
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(mcpAccessConfig)) {
                this._onChange.fire(undefined);
            }
        }));
        this._register(this.allowedMcpServersService.onDidChangeAllowedMcpServers(() => {
            this._local = this.sort(this._local);
            this._onChange.fire(undefined);
        }));
        this._register(runOnChange(mcpService.servers, () => {
            this._local = this.sort(this._local);
            this._onChange.fire(undefined);
        }));
        // React to enablement changes on individual servers
        this._register(autorun(reader => {
            for (const server of mcpService.servers.read(reader)) {
                server.enablement.read(reader);
            }
            this._onChange.fire(undefined);
        }));
    }
    async onDidChangeProfile() {
        await this.queryLocal();
        this._onChange.fire(undefined);
        this._onReset.fire();
    }
    areSameMcpServers(a, b) {
        if (a === b) {
            return true;
        }
        if (!a || !b) {
            return false;
        }
        return a.name === b.name && a.scope === b.scope;
    }
    onDidUninstallMcpServer(e) {
        if (e.error) {
            return;
        }
        const uninstalled = this._local.find(server => this.areSameMcpServers(server.local, e));
        if (uninstalled) {
            this._local = this._local.filter(server => server !== uninstalled);
            this._onChange.fire(uninstalled);
        }
    }
    onDidInstallMcpServers(e) {
        const servers = [];
        for (const { local, source, name } of e) {
            let server = this.installing.find(server => server.local && local ? this.areSameMcpServers(server.local, local) : server.name === name);
            this.installing = server ? this.installing.filter(e => e !== server) : this.installing;
            if (local) {
                if (server) {
                    server.local = local;
                }
                else {
                    server = this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), local, source, undefined);
                }
                if (!local.galleryUrl) {
                    server.gallery = undefined;
                }
                this._local = this._local.filter(server => !this.areSameMcpServers(server.local, local));
                this.addServer(server);
            }
            this._onChange.fire(server);
        }
        if (servers.some(server => server.local?.galleryUrl && !server.gallery)) {
            this.syncInstalledMcpServers();
        }
    }
    onDidUpdateMcpServers(e) {
        for (const result of e) {
            if (!result.local) {
                continue;
            }
            const serverIndex = this._local.findIndex(server => this.areSameMcpServers(server.local, result.local));
            let server;
            if (serverIndex !== -1) {
                this._local[serverIndex].local = result.local;
                server = this._local[serverIndex];
            }
            else {
                server = this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), result.local, result.source, undefined);
                this.addServer(server);
            }
            this._onChange.fire(server);
        }
    }
    fromGallery(gallery) {
        for (const local of this._local) {
            if (local.name === gallery.name) {
                local.gallery = gallery;
                return local;
            }
        }
        return undefined;
    }
    async syncInstalledMcpServers() {
        const infos = [];
        for (const installed of this.local) {
            if (installed.local?.source !== 'gallery') {
                continue;
            }
            if (installed.local.galleryUrl) {
                infos.push({ name: installed.local.name, id: installed.local.galleryId });
            }
        }
        if (infos.length) {
            const galleryServers = await this.mcpGalleryService.getMcpServersFromGallery(infos);
            await this.syncInstalledMcpServersWithGallery(galleryServers);
        }
    }
    async syncInstalledMcpServersWithGallery(gallery) {
        const galleryMap = new Map(gallery.map(server => [server.name, server]));
        for (const mcpServer of this.local) {
            if (!mcpServer.local) {
                continue;
            }
            const key = mcpServer.local.name;
            const gallery = key ? galleryMap.get(key) : undefined;
            if (!gallery || gallery.galleryUrl !== mcpServer.local.galleryUrl) {
                if (mcpServer.gallery) {
                    mcpServer.gallery = undefined;
                    this._onChange.fire(mcpServer);
                }
                continue;
            }
            mcpServer.gallery = gallery;
            if (!mcpServer.local.manifest) {
                mcpServer.local = await this.mcpManagementService.updateMetadata(mcpServer.local, gallery);
            }
            this._onChange.fire(mcpServer);
        }
    }
    async queryGallery(options, token) {
        if (!this.mcpGalleryService.isEnabled()) {
            return {
                firstPage: { items: [], hasMore: false },
                getNextPage: async () => ({ items: [], hasMore: false })
            };
        }
        const pager = await this.mcpGalleryService.query(options, token);
        const mapPage = (page) => ({
            items: page.items.map(gallery => this.fromGallery(gallery) ?? this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), undefined, gallery, undefined)),
            hasMore: page.hasMore
        });
        return {
            firstPage: mapPage(pager.firstPage),
            getNextPage: async (ct) => {
                const nextPage = await pager.getNextPage(ct);
                return mapPage(nextPage);
            }
        };
    }
    async queryLocal() {
        const installed = await this.mcpManagementService.getInstalled();
        this._local = this.sort(installed.map(i => {
            const existing = this._local.find(local => local.id === i.id);
            const local = existing ?? this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), undefined, undefined, undefined);
            local.local = i;
            return local;
        }));
        this._onChange.fire(undefined);
        return [...this.local];
    }
    addServer(server) {
        this._local.push(server);
        this._local = this.sort(this._local);
    }
    sort(local) {
        return local.sort((a, b) => {
            if (a.name === b.name) {
                if (!a.runtimeStatus || a.runtimeStatus.state === 4 /* McpServerEnablementState.Enabled */) {
                    return -1;
                }
                if (!b.runtimeStatus || b.runtimeStatus.state === 4 /* McpServerEnablementState.Enabled */) {
                    return 1;
                }
                return 0;
            }
            return a.name.localeCompare(b.name);
        });
    }
    getEnabledLocalMcpServers() {
        const result = new Map();
        const userRemote = [];
        const workspace = [];
        for (const server of this.local) {
            const enablementStatus = this.getEnablementStatus(server);
            if (enablementStatus && enablementStatus.state !== 4 /* McpServerEnablementState.Enabled */) {
                continue;
            }
            if (server.local?.scope === "user" /* LocalMcpServerScope.User */) {
                result.set(server.name, server.local);
            }
            else if (server.local?.scope === "remoteUser" /* LocalMcpServerScope.RemoteUser */) {
                userRemote.push(server.local);
            }
            else if (server.local?.scope === "workspace" /* LocalMcpServerScope.Workspace */) {
                workspace.push(server.local);
            }
        }
        for (const server of userRemote) {
            const existing = result.get(server.name);
            if (existing) {
                this.logService.warn(localize('overwriting', "Overwriting mcp server '{0}' from {1} with {2}.", server.name, server.mcpResource.path, existing.mcpResource.path));
            }
            result.set(server.name, server);
        }
        for (const server of workspace) {
            const existing = result.get(server.name);
            if (existing) {
                this.logService.warn(localize('overwriting', "Overwriting mcp server '{0}' from {1} with {2}.", server.name, server.mcpResource.path, existing.mcpResource.path));
            }
            result.set(server.name, server);
        }
        return [...result.values()];
    }
    canInstall(mcpServer) {
        if (!(mcpServer instanceof McpWorkbenchServer)) {
            return new MarkdownString().appendText(localize('not an extension', "The provided object is not an mcp server."));
        }
        if (mcpServer.gallery) {
            const result = this.mcpManagementService.canInstall(mcpServer.gallery);
            if (result === true) {
                return true;
            }
            return result;
        }
        if (mcpServer.installable) {
            const result = this.mcpManagementService.canInstall(mcpServer.installable);
            if (result === true) {
                return true;
            }
            return result;
        }
        return new MarkdownString().appendText(localize('cannot be installed', "Cannot install the '{0}' MCP Server because it is not available in this setup.", mcpServer.label));
    }
    async install(server, installOptions) {
        if (!(server instanceof McpWorkbenchServer)) {
            throw new Error('Invalid server instance');
        }
        if (server.installable) {
            const installable = server.installable;
            return this.doInstall(server, () => this.mcpManagementService.install(installable, installOptions));
        }
        if (server.gallery) {
            const gallery = server.gallery;
            return this.doInstall(server, () => this.mcpManagementService.installFromGallery(gallery, installOptions));
        }
        throw new Error('No installable server found');
    }
    async uninstall(server) {
        if (!server.local) {
            throw new Error('Local server is missing');
        }
        await this.mcpManagementService.uninstall(server.local);
    }
    async doInstall(server, installTask) {
        const source = server.gallery ? 'gallery' : 'local';
        const serverName = server.name;
        // Check for inputs in installable config or if it comes from handleURL with inputs
        const hasInputs = !!(server.installable?.inputs && server.installable.inputs.length > 0);
        this.installing.push(server);
        this._onChange.fire(server);
        try {
            await installTask();
            const result = await this.waitAndGetInstalledMcpServer(server);
            // Track successful installation
            this.telemetryService.publicLog2('mcp/serverInstall', {
                serverName,
                source,
                scope: result.local?.scope ?? 'unknown',
                success: true,
                hasInputs
            });
            return result;
        }
        catch (error) {
            // Track failed installation
            this.telemetryService.publicLog2('mcp/serverInstall', {
                serverName,
                source,
                scope: 'unknown',
                success: false,
                error: error instanceof Error ? error.message : String(error),
                hasInputs
            });
            throw error;
        }
        finally {
            if (this.installing.includes(server)) {
                this.installing.splice(this.installing.indexOf(server), 1);
                this._onChange.fire(server);
            }
        }
    }
    async waitAndGetInstalledMcpServer(server) {
        let installed = this.local.find(local => local.name === server.name);
        if (!installed) {
            await Event.toPromise(Event.filter(this.onChange, e => !!e && this.local.some(local => local.name === server.name)));
        }
        installed = this.local.find(local => local.name === server.name);
        if (!installed) {
            // This should not happen
            throw new Error('Extension should have been installed');
        }
        return installed;
    }
    getMcpConfigPath(arg) {
        if (arg instanceof URI) {
            const mcpResource = arg;
            for (const profile of this.userDataProfilesService.profiles) {
                if (this.uriIdentityService.extUri.isEqual(profile.mcpResource, mcpResource)) {
                    return this.getUserMcpConfigPath(mcpResource);
                }
            }
            return this.remoteAgentService.getEnvironment().then(remoteEnvironment => {
                if (remoteEnvironment && this.uriIdentityService.extUri.isEqual(remoteEnvironment.mcpResource, mcpResource)) {
                    return this.getRemoteMcpConfigPath(mcpResource);
                }
                return this.getWorkspaceMcpConfigPath(mcpResource);
            });
        }
        if (arg.scope === "user" /* LocalMcpServerScope.User */) {
            return this.getUserMcpConfigPath(arg.mcpResource);
        }
        if (arg.scope === "workspace" /* LocalMcpServerScope.Workspace */) {
            return this.getWorkspaceMcpConfigPath(arg.mcpResource);
        }
        if (arg.scope === "remoteUser" /* LocalMcpServerScope.RemoteUser */) {
            return this.getRemoteMcpConfigPath(arg.mcpResource);
        }
        return undefined;
    }
    getUserMcpConfigPath(mcpResource) {
        return {
            id: USER_CONFIG_ID,
            key: 'userLocalValue',
            target: 3 /* ConfigurationTarget.USER_LOCAL */,
            label: localize('mcp.configuration.userLocalValue', 'Global in {0}', this.productService.nameShort),
            scope: 0 /* StorageScope.PROFILE */,
            order: 200 /* McpCollectionSortOrder.User */,
            uri: mcpResource,
            section: [],
        };
    }
    getRemoteMcpConfigPath(mcpResource) {
        return {
            id: REMOTE_USER_CONFIG_ID,
            key: 'userRemoteValue',
            target: 4 /* ConfigurationTarget.USER_REMOTE */,
            label: this.environmentService.remoteAuthority ? this.labelService.getHostLabel(Schemas.vscodeRemote, this.environmentService.remoteAuthority) : 'Remote',
            scope: 0 /* StorageScope.PROFILE */,
            order: 200 /* McpCollectionSortOrder.User */ + -50 /* McpCollectionSortOrder.RemoteBoost */,
            remoteAuthority: this.environmentService.remoteAuthority,
            uri: mcpResource,
            section: [],
        };
    }
    getWorkspaceMcpConfigPath(mcpResource) {
        const workspace = this.workspaceService.getWorkspace();
        if (workspace.configuration && this.uriIdentityService.extUri.isEqual(workspace.configuration, mcpResource)) {
            return {
                id: WORKSPACE_CONFIG_ID,
                key: 'workspaceValue',
                target: 5 /* ConfigurationTarget.WORKSPACE */,
                label: basename(mcpResource),
                scope: 1 /* StorageScope.WORKSPACE */,
                order: 100 /* McpCollectionSortOrder.Workspace */,
                remoteAuthority: this.environmentService.remoteAuthority,
                uri: mcpResource,
                section: ['settings', mcpConfigurationSection],
            };
        }
        const workspaceFolders = workspace.folders;
        for (let index = 0; index < workspaceFolders.length; index++) {
            const workspaceFolder = workspaceFolders[index];
            if (this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.joinPath(workspaceFolder.uri, WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]), mcpResource)) {
                return {
                    id: `${WORKSPACE_FOLDER_CONFIG_ID_PREFIX}${index}`,
                    key: 'workspaceFolderValue',
                    target: 6 /* ConfigurationTarget.WORKSPACE_FOLDER */,
                    label: `${workspaceFolder.name}/.vscode/mcp.json`,
                    scope: 1 /* StorageScope.WORKSPACE */,
                    remoteAuthority: this.environmentService.remoteAuthority,
                    order: 0 /* McpCollectionSortOrder.WorkspaceFolder */,
                    uri: mcpResource,
                    workspaceFolder,
                };
            }
        }
        return undefined;
    }
    async handleURL(uri) {
        if (uri.path === 'mcp/install') {
            return this.handleMcpInstallUri(uri);
        }
        if (uri.path.startsWith('mcp/by-name/')) {
            const mcpServerName = uri.path.substring('mcp/by-name/'.length);
            if (mcpServerName) {
                return this.handleMcpServerByName(mcpServerName);
            }
        }
        if (uri.path.startsWith('mcp/')) {
            const mcpServerUrl = uri.path.substring(4);
            if (mcpServerUrl) {
                return this.handleMcpServerUrl(`${Schemas.https}://${mcpServerUrl}`);
            }
        }
        return false;
    }
    async handleMcpInstallUri(uri) {
        let parsed;
        try {
            parsed = JSON.parse(decodeURIComponent(uri.query));
        }
        catch (e) {
            return false;
        }
        try {
            const { name, inputs, gallery, ...config } = parsed;
            if (config.type === undefined) {
                config.type = parsed.command ? "stdio" /* McpServerType.LOCAL */ : "http" /* McpServerType.REMOTE */;
            }
            this.open(this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), undefined, undefined, { name, config, inputs }));
        }
        catch (e) {
            // ignore
        }
        return true;
    }
    async handleMcpServerUrl(url) {
        try {
            const gallery = await this.mcpGalleryService.getMcpServer(url);
            if (!gallery) {
                this.logService.info(`MCP server '${url}' not found`);
                return true;
            }
            const local = this.local.find(e => e.name === gallery.name) ?? this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), undefined, gallery, undefined);
            this.open(local);
        }
        catch (e) {
            // ignore
            this.logService.error(e);
        }
        return true;
    }
    async handleMcpServerByName(name) {
        try {
            const [gallery] = await this.mcpGalleryService.getMcpServersFromGallery([{ name }]);
            if (!gallery) {
                this.logService.info(`MCP server '${name}' not found`);
                return true;
            }
            const local = this.local.find(e => e.name === gallery.name) ?? this.instantiationService.createInstance(McpWorkbenchServer, e => this.getInstallState(e), e => this.getRuntimeStatus(e), undefined, gallery, undefined);
            this.open(local);
        }
        catch (e) {
            // ignore
            this.logService.error(e);
        }
        return true;
    }
    async openSearch(searchValue, preserveFoucs) {
        await this.extensionsWorkbenchService.openSearch(`@mcp ${searchValue}`, preserveFoucs);
    }
    async open(extension, options) {
        const useModal = this.configurationService.getValue('extensions.allowOpenInModalEditor');
        await this.editorService.openEditor(this.instantiationService.createInstance(McpServerEditorInput, extension), options, useModal ? MODAL_GROUP : ACTIVE_GROUP);
    }
    getInstallState(extension) {
        if (this.installing.some(i => i.name === extension.name)) {
            return 0 /* McpServerInstallState.Installing */;
        }
        if (this.uninstalling.some(e => e.name === extension.name)) {
            return 2 /* McpServerInstallState.Uninstalling */;
        }
        const local = this.local.find(e => e === extension);
        return local ? 1 /* McpServerInstallState.Installed */ : 3 /* McpServerInstallState.Uninstalled */;
    }
    getRuntimeStatus(mcpServer) {
        const enablementStatus = this.getEnablementStatus(mcpServer);
        if (enablementStatus) {
            return enablementStatus;
        }
        const server = this.mcpService.servers.get().find(s => s.definition.id === mcpServer.id);
        if (!server) {
            return { state: 0 /* McpServerEnablementState.Disabled */ };
        }
        const enablement = server.enablement.get();
        if (enablement === 0 /* ContributionEnablementState.DisabledProfile */) {
            return {
                state: 2 /* McpServerEnablementState.DisabledProfile */,
                message: {
                    severity: Severity.Info,
                    text: new MarkdownString(localize('disabled globally', "This MCP server is disabled."))
                }
            };
        }
        if (enablement === 1 /* ContributionEnablementState.DisabledWorkspace */) {
            return {
                state: 3 /* McpServerEnablementState.DisabledWorkspace */,
                message: {
                    severity: Severity.Info,
                    text: new MarkdownString(localize('disabled in workspace', "This MCP server is disabled for this workspace."))
                }
            };
        }
        return undefined;
    }
    getEnablementStatus(mcpServer) {
        if (!mcpServer.local) {
            return undefined;
        }
        const settingsCommandLink = createCommandUri('workbench.action.openSettings', { query: `@id:${mcpAccessConfig}` }).toString();
        const accessValue = this.configurationService.getValue(mcpAccessConfig);
        if (accessValue === "none" /* McpAccessValue.None */) {
            return {
                state: 1 /* McpServerEnablementState.DisabledByAccess */,
                message: {
                    severity: Severity.Warning,
                    text: new MarkdownString(localize('disabled - all not allowed', "This MCP Server is disabled because MCP servers are configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink))
                }
            };
        }
        if (accessValue === "registry" /* McpAccessValue.Registry */) {
            if (!mcpServer.gallery) {
                return {
                    state: 1 /* McpServerEnablementState.DisabledByAccess */,
                    message: {
                        severity: Severity.Warning,
                        text: new MarkdownString(localize('disabled - some not allowed', "This MCP Server is disabled because it is configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink))
                    }
                };
            }
            const remoteUrl = mcpServer.local.config.type === "http" /* McpServerType.REMOTE */ && mcpServer.local.config.url;
            if (remoteUrl && !mcpServer.gallery.configuration.remotes?.some(remote => remote.url === remoteUrl)) {
                return {
                    state: 1 /* McpServerEnablementState.DisabledByAccess */,
                    message: {
                        severity: Severity.Warning,
                        text: new MarkdownString(localize('disabled - some not allowed', "This MCP Server is disabled because it is configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink))
                    }
                };
            }
        }
        return undefined;
    }
};
McpWorkbenchService = __decorate([
    __param(0, IMcpGalleryManifestService),
    __param(1, IMcpGalleryService),
    __param(2, IWorkbenchMcpManagementService),
    __param(3, IEditorService),
    __param(4, IUserDataProfilesService),
    __param(5, IUriIdentityService),
    __param(6, IWorkspaceContextService),
    __param(7, IWorkbenchEnvironmentService),
    __param(8, ILabelService),
    __param(9, IProductService),
    __param(10, IRemoteAgentService),
    __param(11, IConfigurationService),
    __param(12, IInstantiationService),
    __param(13, ITelemetryService),
    __param(14, ILogService),
    __param(15, IExtensionsWorkbenchService),
    __param(16, IAllowedMcpServersService),
    __param(17, IMcpService),
    __param(18, IURLService)
], McpWorkbenchService);
export { McpWorkbenchService };
let MCPContextsInitialisation = class MCPContextsInitialisation extends Disposable {
    static { this.ID = 'workbench.mcp.contexts.initialisation'; }
    constructor(mcpWorkbenchService, mcpGalleryManifestService, contextKeyService) {
        super();
        const mcpServersGalleryStatus = McpServersGalleryStatusContext.bindTo(contextKeyService);
        mcpServersGalleryStatus.set(mcpGalleryManifestService.mcpGalleryManifestStatus);
        this._register(mcpGalleryManifestService.onDidChangeMcpGalleryManifestStatus(status => mcpServersGalleryStatus.set(status)));
        const hasInstalledMcpServersContextKey = HasInstalledMcpServersContext.bindTo(contextKeyService);
        mcpWorkbenchService.queryLocal().finally(() => {
            hasInstalledMcpServersContextKey.set(mcpWorkbenchService.local.length > 0);
            this._register(mcpWorkbenchService.onChange(() => hasInstalledMcpServersContextKey.set(mcpWorkbenchService.local.length > 0)));
        });
    }
};
MCPContextsInitialisation = __decorate([
    __param(0, IMcpWorkbenchService),
    __param(1, IMcpGalleryManifestService),
    __param(2, IContextKeyService)
], MCPContextsInitialisation);
export { MCPContextsInitialisation };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwV29ya2JlbmNoU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcFdvcmtiZW5jaFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQW1CLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUF1QixxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3hILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBcUIsa0JBQWtCLEVBQXdFLGVBQWUsRUFBa0IseUJBQXlCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUMzTyxPQUFPLEVBQUUsaUJBQWlCLEVB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