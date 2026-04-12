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
import { RunOnceScheduler } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { equals } from '../../../base/common/objects.js';
import { isString } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { IMcpGalleryService, IAllowedMcpServersService } from './mcpManagement.js';
import { IMcpResourceScannerService } from './mcpResourceScannerService.js';
let AbstractCommonMcpManagementService = class AbstractCommonMcpManagementService extends Disposable {
    constructor(logService) {
        super();
        this.logService = logService;
    }
    getMcpServerConfigurationFromManifest(manifest, packageType) {
        // remote
        if (packageType === "remote" /* RegistryType.REMOTE */ && manifest.remotes?.length) {
            const url = manifest.remotes[0].url;
            const headers = manifest.remotes[0].headers ?? [];
            const { inputs, variables } = this.processKeyValueInputs(url.startsWith('https://api.githubcopilot.com/mcp') ? headers.filter(h => h.name.toLowerCase() !== 'authorization') : headers);
            return {
                mcpServerConfiguration: {
                    config: {
                        type: "http" /* McpServerType.REMOTE */,
                        url: manifest.remotes[0].url,
                        headers: Object.keys(inputs).length ? inputs : undefined,
                    },
                    inputs: variables.length ? variables : undefined,
                },
                notices: [],
            };
        }
        // local
        const serverPackage = manifest.packages?.find(p => p.registryType === packageType) ?? manifest.packages?.[0];
        if (!serverPackage) {
            throw new Error(`No server package found`);
        }
        const args = [];
        const inputs = [];
        const env = {};
        const notices = [];
        if (serverPackage.registryType === "oci" /* RegistryType.DOCKER */) {
            args.push('run');
            args.push('-i');
            args.push('--rm');
        }
        if (serverPackage.runtimeArguments?.length) {
            const result = this.processArguments(serverPackage.runtimeArguments ?? []);
            args.push(...result.args);
            inputs.push(...result.variables);
            notices.push(...result.notices);
        }
        if (serverPackage.environmentVariables?.length) {
            const { inputs: envInputs, variables: envVariables, notices: envNotices } = this.processKeyValueInputs(serverPackage.environmentVariables ?? []);
            inputs.push(...envVariables);
            notices.push(...envNotices);
            for (const [name, value] of Object.entries(envInputs)) {
                env[name] = value;
                if (serverPackage.registryType === "oci" /* RegistryType.DOCKER */) {
                    args.push('-e');
                    args.push(name);
                }
            }
        }
        switch (serverPackage.registryType) {
            case "npm" /* RegistryType.NODE */:
                if (serverPackage.registryBaseUrl) {
                    args.push('--registry', serverPackage.registryBaseUrl);
                }
                args.push(serverPackage.version ? `${serverPackage.identifier}@${serverPackage.version}` : serverPackage.identifier);
                break;
            case "pypi" /* RegistryType.PYTHON */:
                if (serverPackage.registryBaseUrl) {
                    args.push('--index-url', serverPackage.registryBaseUrl);
                }
                args.push(serverPackage.version ? `${serverPackage.identifier}@${serverPackage.version}` : serverPackage.identifier);
                break;
            case "oci" /* RegistryType.DOCKER */:
                {
                    const dockerIdentifier = serverPackage.registryBaseUrl
                        ? `${serverPackage.registryBaseUrl}/${serverPackage.identifier}`
                        : serverPackage.identifier;
                    args.push(serverPackage.version ? `${dockerIdentifier}:${serverPackage.version}` : dockerIdentifier);
                    break;
                }
            case "nuget" /* RegistryType.NUGET */:
                args.push(serverPackage.version ? `${serverPackage.identifier}@${serverPackage.version}` : serverPackage.identifier);
                args.push('--yes'); // installation is confirmed by the UI, so --yes is appropriate here
                if (serverPackage.registryBaseUrl) {
                    args.push('--source', serverPackage.registryBaseUrl);
                }
                if (serverPackage.packageArguments?.length) {
                    args.push('--');
                }
                break;
        }
        if (serverPackage.packageArguments?.length) {
            const result = this.processArguments(serverPackage.packageArguments);
            args.push(...result.args);
            inputs.push(...result.variables);
            notices.push(...result.notices);
        }
        return {
            notices,
            mcpServerConfiguration: {
                config: {
                    type: "stdio" /* McpServerType.LOCAL */,
                    command: this.getCommandName(serverPackage.registryType),
                    args: args.length ? args : undefined,
                    env: Object.keys(env).length ? env : undefined,
                },
                inputs: inputs.length ? inputs : undefined,
            }
        };
    }
    getCommandName(packageType) {
        switch (packageType) {
            case "npm" /* RegistryType.NODE */: return 'npx';
            case "oci" /* RegistryType.DOCKER */: return 'docker';
            case "pypi" /* RegistryType.PYTHON */: return 'uvx';
            case "nuget" /* RegistryType.NUGET */: return 'dnx';
        }
        return packageType;
    }
    getVariables(variableInputs) {
        const variables = [];
        for (const [key, value] of Object.entries(variableInputs)) {
            variables.push({
                id: key,
                type: value.choices ? "pickString" /* McpServerVariableType.PICK */ : "promptString" /* McpServerVariableType.PROMPT */,
                description: value.description ?? '',
                password: !!value.isSecret,
                default: value.default,
                options: value.choices,
            });
        }
        return variables;
    }
    processKeyValueInputs(keyValueInputs) {
        const notices = [];
        const inputs = {};
        const variables = [];
        for (const input of keyValueInputs) {
            const inputVariables = input.variables ? this.getVariables(input.variables) : [];
            let value = input.value || '';
            // If explicit variables exist, use them regardless of value
            if (inputVariables.length) {
                for (const variable of inputVariables) {
                    value = value.replace(`{${variable.id}}`, `\${input:${variable.id}}`);
                }
                variables.push(...inputVariables);
            }
            else if (!value && (input.description || input.choices || input.default !== undefined)) {
                // Only create auto-generated input variable if no explicit variables and no value
                variables.push({
                    id: input.name,
                    type: input.choices ? "pickString" /* McpServerVariableType.PICK */ : "promptString" /* McpServerVariableType.PROMPT */,
                    description: input.description ?? '',
                    password: !!input.isSecret,
                    default: input.default,
                    options: input.choices,
                });
                value = `\${input:${input.name}}`;
            }
            inputs[input.name] = value;
        }
        return { inputs, variables, notices };
    }
    processArguments(argumentsList) {
        const args = [];
        const variables = [];
        const notices = [];
        for (const arg of argumentsList) {
            const argVariables = arg.variables ? this.getVariables(arg.variables) : [];
            if (arg.type === 'positional') {
                let value = arg.value;
                if (value) {
                    for (const variable of argVariables) {
                        value = value.replace(`{${variable.id}}`, `\${input:${variable.id}}`);
                    }
                    args.push(value);
                    if (argVariables.length) {
                        variables.push(...argVariables);
                    }
                }
                else if (arg.valueHint && (arg.description || arg.default !== undefined)) {
                    // Create input variable for positional argument without value
                    variables.push({
                        id: arg.valueHint,
                        type: "promptString" /* McpServerVariableType.PROMPT */,
                        description: arg.description ?? '',
                        password: false,
                        default: arg.default,
                    });
                    args.push(`\${input:${arg.valueHint}}`);
                }
                else {
                    // Fallback to value_hint as literal
                    args.push(arg.valueHint ?? '');
                }
            }
            else if (arg.type === 'named') {
                if (!arg.name) {
                    notices.push(`Named argument is missing a name. ${JSON.stringify(arg)}`);
                    continue;
                }
                args.push(arg.name);
                if (arg.value) {
                    let value = arg.value;
                    for (const variable of argVariables) {
                        value = value.replace(`{${variable.id}}`, `\${input:${variable.id}}`);
                    }
                    args.push(value);
                    if (argVariables.length) {
                        variables.push(...argVariables);
                    }
                }
                else if (arg.description || arg.default !== undefined) {
                    // Create input variable for named argument without value
                    const variableId = arg.name.replace(/^--?/, '');
                    variables.push({
                        id: variableId,
                        type: "promptString" /* McpServerVariableType.PROMPT */,
                        description: arg.description ?? '',
                        password: false,
                        default: arg.default,
                    });
                    args.push(`\${input:${variableId}}`);
                }
            }
        }
        return { args, variables, notices };
    }
};
AbstractCommonMcpManagementService = __decorate([
    __param(0, ILogService)
], AbstractCommonMcpManagementService);
export { AbstractCommonMcpManagementService };
let AbstractMcpResourceManagementService = class AbstractMcpResourceManagementService extends AbstractCommonMcpManagementService {
    get onDidInstallMcpServers() { return this._onDidInstallMcpServers.event; }
    get onDidUpdateMcpServers() { return this._onDidUpdateMcpServers.event; }
    get onUninstallMcpServer() { return this._onUninstallMcpServer.event; }
    get onDidUninstallMcpServer() { return this._onDidUninstallMcpServer.event; }
    constructor(mcpResource, target, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService) {
        super(logService);
        this.mcpResource = mcpResource;
        this.target = target;
        this.mcpGalleryService = mcpGalleryService;
        this.fileService = fileService;
        this.uriIdentityService = uriIdentityService;
        this.mcpResourceScannerService = mcpResourceScannerService;
        this.local = new Map();
        this._onInstallMcpServer = this._register(new Emitter());
        this.onInstallMcpServer = this._onInstallMcpServer.event;
        this._onDidInstallMcpServers = this._register(new Emitter());
        this._onDidUpdateMcpServers = this._register(new Emitter());
        this._onUninstallMcpServer = this._register(new Emitter());
        this._onDidUninstallMcpServer = this._register(new Emitter());
        this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.updateLocal(), 50));
    }
    initialize() {
        if (!this.initializePromise) {
            this.initializePromise = (async () => {
                try {
                    this.local = await this.populateLocalServers();
                }
                finally {
                    this.startWatching();
                }
            })();
        }
        return this.initializePromise;
    }
    async populateLocalServers() {
        this.logService.trace('AbstractMcpResourceManagementService#populateLocalServers', this.mcpResource.toString());
        const local = new Map();
        try {
            const scannedMcpServers = await this.mcpResourceScannerService.scanMcpServers(this.mcpResource, this.target);
            if (scannedMcpServers.servers) {
                await Promise.allSettled(Object.entries(scannedMcpServers.servers).map(async ([name, scannedServer]) => {
                    const server = await this.scanLocalServer(name, scannedServer, scannedMcpServers.sandbox);
                    local.set(name, server);
                }));
            }
        }
        catch (error) {
            this.logService.debug('Could not read user MCP servers:', error);
            throw error;
        }
        return local;
    }
    startWatching() {
        this._register(this.fileService.watch(this.mcpResource));
        this._register(this.fileService.onDidFilesChange(e => {
            if (e.affects(this.mcpResource)) {
                this.reloadConfigurationScheduler.schedule();
            }
        }));
    }
    async updateLocal() {
        try {
            const current = await this.populateLocalServers();
            const added = [];
            const updated = [];
            const removed = [...this.local.keys()].filter(name => !current.has(name));
            for (const server of removed) {
                this.local.delete(server);
            }
            for (const [name, server] of current) {
                const previous = this.local.get(name);
                if (previous) {
                    if (!equals(previous, server)) {
                        updated.push(server);
                        this.local.set(name, server);
                    }
                }
                else {
                    added.push(server);
                    this.local.set(name, server);
                }
            }
            for (const server of removed) {
                this.local.delete(server);
                this._onDidUninstallMcpServer.fire({ name: server, mcpResource: this.mcpResource });
            }
            if (updated.length) {
                this._onDidUpdateMcpServers.fire(updated.map(server => ({ name: server.name, local: server, mcpResource: this.mcpResource })));
            }
            if (added.length) {
                this._onDidInstallMcpServers.fire(added.map(server => ({ name: server.name, local: server, mcpResource: this.mcpResource })));
            }
        }
        catch (error) {
            this.logService.error('Failed to load installed MCP servers:', error);
        }
    }
    async getInstalled() {
        await this.initialize();
        return Array.from(this.local.values());
    }
    async scanLocalServer(name, config, rootSandbox) {
        let mcpServerInfo = await this.getLocalServerInfo(name, config);
        if (!mcpServerInfo) {
            mcpServerInfo = { name, version: config.version, galleryUrl: isString(config.gallery) ? config.gallery : undefined };
        }
        return {
            name,
            config,
            rootSandbox,
            mcpResource: this.mcpResource,
            version: mcpServerInfo.version,
            location: mcpServerInfo.location,
            displayName: mcpServerInfo.displayName,
            description: mcpServerInfo.description,
            publisher: mcpServerInfo.publisher,
            publisherDisplayName: mcpServerInfo.publisherDisplayName,
            galleryUrl: mcpServerInfo.galleryUrl,
            galleryId: mcpServerInfo.galleryId,
            repositoryUrl: mcpServerInfo.repositoryUrl,
            readmeUrl: mcpServerInfo.readmeUrl,
            icon: mcpServerInfo.icon,
            codicon: mcpServerInfo.codicon,
            manifest: mcpServerInfo.manifest,
            source: config.gallery ? 'gallery' : 'local'
        };
    }
    async install(server, options) {
        this.logService.trace('MCP Management Service: install', server.name);
        this._onInstallMcpServer.fire({ name: server.name, mcpResource: this.mcpResource });
        try {
            await this.mcpResourceScannerService.addMcpServers([server], this.mcpResource, this.target);
            await this.updateLocal();
            const local = this.local.get(server.name);
            if (!local) {
                throw new Error(`Failed to install MCP server: ${server.name}`);
            }
            return local;
        }
        catch (e) {
            this._onDidInstallMcpServers.fire([{ name: server.name, error: e, mcpResource: this.mcpResource }]);
            throw e;
        }
    }
    async uninstall(server, options) {
        this.logService.trace('MCP Management Service: uninstall', server.name);
        this._onUninstallMcpServer.fire({ name: server.name, mcpResource: this.mcpResource });
        try {
            const currentServers = await this.mcpResourceScannerService.scanMcpServers(this.mcpResource, this.target);
            if (!currentServers.servers) {
                return;
            }
            await this.mcpResourceScannerService.removeMcpServers([server.name], this.mcpResource, this.target);
            if (server.location) {
                await this.fileService.del(URI.revive(server.location), { recursive: true });
            }
            await this.updateLocal();
        }
        catch (e) {
            this._onDidUninstallMcpServer.fire({ name: server.name, error: e, mcpResource: this.mcpResource });
            throw e;
        }
    }
};
AbstractMcpResourceManagementService = __decorate([
    __param(2, IMcpGalleryService),
    __param(3, IFileService),
    __param(4, IUriIdentityService),
    __param(5, ILogService),
    __param(6, IMcpResourceScannerService)
], AbstractMcpResourceManagementService);
export { AbstractMcpResourceManagementService };
let McpUserResourceManagementService = class McpUserResourceManagementService extends AbstractMcpResourceManagementService {
    constructor(mcpResource, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, environmentService) {
        super(mcpResource, 2 /* ConfigurationTarget.USER */, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService);
        this.mcpLocation = uriIdentityService.extUri.joinPath(environmentService.userRoamingDataHome, 'mcp');
    }
    async installFromGallery(server, options) {
        throw new Error('Not supported');
    }
    async updateMetadata(local, gallery) {
        await this.updateMetadataFromGallery(gallery);
        await this.updateLocal();
        const updatedLocal = (await this.getInstalled()).find(s => s.name === local.name);
        if (!updatedLocal) {
            throw new Error(`Failed to find MCP server: ${local.name}`);
        }
        return updatedLocal;
    }
    async updateMetadataFromGallery(gallery) {
        const manifest = gallery.configuration;
        const location = this.getLocation(gallery.name, gallery.version);
        const manifestPath = this.uriIdentityService.extUri.joinPath(location, 'manifest.json');
        const local = {
            galleryUrl: gallery.galleryUrl,
            galleryId: gallery.id,
            name: gallery.name,
            displayName: gallery.displayName,
            description: gallery.description,
            version: gallery.version,
            publisher: gallery.publisher,
            publisherDisplayName: gallery.publisherDisplayName,
            repositoryUrl: gallery.repositoryUrl,
            licenseUrl: gallery.license,
            icon: gallery.icon,
            codicon: gallery.codicon,
            manifest,
        };
        await this.fileService.writeFile(manifestPath, VSBuffer.fromString(JSON.stringify(local)));
        if (gallery.readmeUrl || gallery.readme) {
            const readme = gallery.readme ? gallery.readme : await this.mcpGalleryService.getReadme(gallery, CancellationToken.None);
            await this.fileService.writeFile(this.uriIdentityService.extUri.joinPath(location, 'README.md'), VSBuffer.fromString(readme));
        }
        return manifest;
    }
    async getLocalServerInfo(name, mcpServerConfig) {
        let storedMcpServerInfo;
        let location;
        let readmeUrl;
        if (mcpServerConfig.gallery) {
            location = this.getLocation(name, mcpServerConfig.version);
            const manifestLocation = this.uriIdentityService.extUri.joinPath(location, 'manifest.json');
            try {
                const content = await this.fileService.readFile(manifestLocation);
                storedMcpServerInfo = JSON.parse(content.value.toString());
                // migrate
                if (storedMcpServerInfo.galleryUrl?.includes('/v0/')) {
                    storedMcpServerInfo.galleryUrl = storedMcpServerInfo.galleryUrl.substring(0, storedMcpServerInfo.galleryUrl.indexOf('/v0/'));
                    await this.fileService.writeFile(manifestLocation, VSBuffer.fromString(JSON.stringify(storedMcpServerInfo)));
                }
                storedMcpServerInfo.location = location;
                readmeUrl = this.uriIdentityService.extUri.joinPath(location, 'README.md');
                if (!await this.fileService.exists(readmeUrl)) {
                    readmeUrl = undefined;
                }
                storedMcpServerInfo.readmeUrl = readmeUrl;
            }
            catch (e) {
                this.logService.error('MCP Management Service: failed to read manifest', location.toString(), e);
            }
        }
        return storedMcpServerInfo;
    }
    getLocation(name, version) {
        name = name.replace('/', '.');
        return this.uriIdentityService.extUri.joinPath(this.mcpLocation, version ? `${name}-${version}` : name);
    }
    installFromUri(uri, options) {
        throw new Error('Method not supported.');
    }
    canInstall() {
        throw new Error('Not supported');
    }
};
McpUserResourceManagementService = __decorate([
    __param(1, IMcpGalleryService),
    __param(2, IFileService),
    __param(3, IUriIdentityService),
    __param(4, ILogService),
    __param(5, IMcpResourceScannerService),
    __param(6, IEnvironmentService)
], McpUserResourceManagementService);
export { McpUserResourceManagementService };
let AbstractMcpManagementService = class AbstractMcpManagementService extends AbstractCommonMcpManagementService {
    constructor(allowedMcpServersService, logService) {
        super(logService);
        this.allowedMcpServersService = allowedMcpServersService;
    }
    canInstall(server) {
        const allowedToInstall = this.allowedMcpServersService.isAllowed(server);
        if (allowedToInstall !== true) {
            return new MarkdownString(localize('not allowed to install', "This mcp server cannot be installed because {0}", allowedToInstall.value));
        }
        return true;
    }
};
AbstractMcpManagementService = __decorate([
    __param(0, IAllowedMcpServersService),
    __param(1, ILogService)
], AbstractMcpManagementService);
export { AbstractMcpManagementService };
let McpManagementService = class McpManagementService extends AbstractMcpManagementService {
    constructor(allowedMcpServersService, logService, userDataProfilesService, instantiationService) {
        super(allowedMcpServersService, logService);
        this.userDataProfilesService = userDataProfilesService;
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
        this.mcpResourceManagementServices = new ResourceMap();
    }
    getMcpResourceManagementService(mcpResource) {
        let mcpResourceManagementService = this.mcpResourceManagementServices.get(mcpResource);
        if (!mcpResourceManagementService) {
            const disposables = new DisposableStore();
            const service = disposables.add(this.createMcpResourceManagementService(mcpResource));
            disposables.add(service.onInstallMcpServer(e => this._onInstallMcpServer.fire(e)));
            disposables.add(service.onDidInstallMcpServers(e => this._onDidInstallMcpServers.fire(e)));
            disposables.add(service.onDidUpdateMcpServers(e => this._onDidUpdateMcpServers.fire(e)));
            disposables.add(service.onUninstallMcpServer(e => this._onUninstallMcpServer.fire(e)));
            disposables.add(service.onDidUninstallMcpServer(e => this._onDidUninstallMcpServer.fire(e)));
            this.mcpResourceManagementServices.set(mcpResource, mcpResourceManagementService = { service, dispose: () => disposables.dispose() });
        }
        return mcpResourceManagementService.service;
    }
    async getInstalled(mcpResource) {
        const mcpResourceUri = mcpResource || this.userDataProfilesService.defaultProfile.mcpResource;
        return this.getMcpResourceManagementService(mcpResourceUri).getInstalled();
    }
    async install(server, options) {
        const mcpResourceUri = options?.mcpResource || this.userDataProfilesService.defaultProfile.mcpResource;
        return this.getMcpResourceManagementService(mcpResourceUri).install(server, options);
    }
    async uninstall(server, options) {
        const mcpResourceUri = options?.mcpResource || this.userDataProfilesService.defaultProfile.mcpResource;
        return this.getMcpResourceManagementService(mcpResourceUri).uninstall(server, options);
    }
    async installFromGallery(server, options) {
        const mcpResourceUri = options?.mcpResource || this.userDataProfilesService.defaultProfile.mcpResource;
        return this.getMcpResourceManagementService(mcpResourceUri).installFromGallery(server, options);
    }
    async updateMetadata(local, gallery, mcpResource) {
        return this.getMcpResourceManagementService(mcpResource || this.userDataProfilesService.defaultProfile.mcpResource).updateMetadata(local, gallery);
    }
    dispose() {
        this.mcpResourceManagementServices.forEach(service => service.dispose());
        this.mcpResourceManagementServices.clear();
        super.dispose();
    }
    createMcpResourceManagementService(mcpResource) {
        return this.instantiationService.createInstance(McpUserResourceManagementService, mcpResource);
    }
};
McpManagementService = __decorate([
    __param(0, IAllowedMcpServersService),
    __param(1, ILogService),
    __param(2, IUserDataProfilesService),
    __param(3, IInstantiationService)
], McpManagementService);
export { McpManagementService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwTWFuYWdlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcE1hbmFnZW1lbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFtQixjQUFjLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDekQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFFM0MsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzNELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUs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