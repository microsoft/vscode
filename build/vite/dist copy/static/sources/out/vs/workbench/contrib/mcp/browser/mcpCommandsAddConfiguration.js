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
import { mapFindFirst } from '../../../../base/common/arraysFind.js';
import { assertNever } from '../../../../base/common/assert.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { parse as parseJsonc } from '../../../../base/common/jsonc.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isWorkspaceFolder, IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IWorkbenchMcpManagementService } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { allDiscoverySources, mcpDiscoverySection, mcpStdioServerSchema } from '../common/mcpConfiguration.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { IMcpService } from '../common/mcpTypes.js';
import { ILogService } from '../../../../platform/log/common/log.js';
export var AddConfigurationType;
(function (AddConfigurationType) {
    AddConfigurationType[AddConfigurationType["Stdio"] = 0] = "Stdio";
    AddConfigurationType[AddConfigurationType["HTTP"] = 1] = "HTTP";
    AddConfigurationType[AddConfigurationType["NpmPackage"] = 2] = "NpmPackage";
    AddConfigurationType[AddConfigurationType["PipPackage"] = 3] = "PipPackage";
    AddConfigurationType[AddConfigurationType["NuGetPackage"] = 4] = "NuGetPackage";
    AddConfigurationType[AddConfigurationType["DockerImage"] = 5] = "DockerImage";
})(AddConfigurationType || (AddConfigurationType = {}));
export const AssistedTypes = {
    [2 /* AddConfigurationType.NpmPackage */]: {
        title: localize('mcp.npm.title', "Enter NPM Package Name"),
        placeholder: localize('mcp.npm.placeholder', "Package name (e.g., @org/package)"),
        pickLabel: localize('mcp.serverType.npm', "NPM Package"),
        pickDescription: localize('mcp.serverType.npm.description', "Install from an NPM package name"),
        enabledConfigKey: null, // always enabled
    },
    [3 /* AddConfigurationType.PipPackage */]: {
        title: localize('mcp.pip.title', "Enter Pip Package Name"),
        placeholder: localize('mcp.pip.placeholder', "Package name (e.g., package-name)"),
        pickLabel: localize('mcp.serverType.pip', "Pip Package"),
        pickDescription: localize('mcp.serverType.pip.description', "Install from a Pip package name"),
        enabledConfigKey: null, // always enabled
    },
    [4 /* AddConfigurationType.NuGetPackage */]: {
        title: localize('mcp.nuget.title', "Enter NuGet Package Name"),
        placeholder: localize('mcp.nuget.placeholder', "Package name (e.g., Package.Name)"),
        pickLabel: localize('mcp.serverType.nuget', "NuGet Package"),
        pickDescription: localize('mcp.serverType.nuget.description', "Install from a NuGet package name"),
        enabledConfigKey: 'chat.mcp.assisted.nuget.enabled',
    },
    [5 /* AddConfigurationType.DockerImage */]: {
        title: localize('mcp.docker.title', "Enter Docker Image Name"),
        placeholder: localize('mcp.docker.placeholder', "Image name (e.g., mcp/imagename)"),
        pickLabel: localize('mcp.serverType.docker', "Docker Image"),
        pickDescription: localize('mcp.serverType.docker.description', "Install from a Docker image"),
        enabledConfigKey: null, // always enabled
    },
};
var AddConfigurationCopilotCommand;
(function (AddConfigurationCopilotCommand) {
    /** Returns whether MCP enhanced setup is enabled. */
    AddConfigurationCopilotCommand["IsSupported"] = "github.copilot.chat.mcp.setup.check";
    /** Takes an npm/pip package name, validates its owner. */
    AddConfigurationCopilotCommand["ValidatePackage"] = "github.copilot.chat.mcp.setup.validatePackage";
    /** Returns the resolved MCP configuration. */
    AddConfigurationCopilotCommand["StartFlow"] = "github.copilot.chat.mcp.setup.flow";
})(AddConfigurationCopilotCommand || (AddConfigurationCopilotCommand = {}));
let McpAddConfigurationCommand = class McpAddConfigurationCommand {
    constructor(workspaceFolder, _quickInputService, _mcpManagementService, _workspaceService, _environmentService, _commandService, _mcpRegistry, _openerService, _editorService, _fileService, _notificationService, _telemetryService, _mcpService, _label, _configurationService) {
        this.workspaceFolder = workspaceFolder;
        this._quickInputService = _quickInputService;
        this._mcpManagementService = _mcpManagementService;
        this._workspaceService = _workspaceService;
        this._environmentService = _environmentService;
        this._commandService = _commandService;
        this._mcpRegistry = _mcpRegistry;
        this._openerService = _openerService;
        this._editorService = _editorService;
        this._fileService = _fileService;
        this._notificationService = _notificationService;
        this._telemetryService = _telemetryService;
        this._mcpService = _mcpService;
        this._label = _label;
        this._configurationService = _configurationService;
    }
    async getServerType() {
        const items = [
            { kind: 0 /* AddConfigurationType.Stdio */, label: localize('mcp.serverType.command', "Command (stdio)"), description: localize('mcp.serverType.command.description', "Run a local command that implements the MCP protocol") },
            { kind: 1 /* AddConfigurationType.HTTP */, label: localize('mcp.serverType.http', "HTTP (HTTP or Server-Sent Events)"), description: localize('mcp.serverType.http.description', "Connect to a remote HTTP server that implements the MCP protocol") }
        ];
        let aiSupported;
        try {
            aiSupported = await this._commandService.executeCommand("github.copilot.chat.mcp.setup.check" /* AddConfigurationCopilotCommand.IsSupported */);
        }
        catch {
            // ignored
        }
        if (aiSupported) {
            items.unshift({ type: 'separator', label: localize('mcp.serverType.manual', "Manual Install") });
            const elligableTypes = Object.entries(AssistedTypes).map(([type, { pickLabel, pickDescription, enabledConfigKey }]) => {
                if (enabledConfigKey) {
                    const enabled = this._configurationService.getValue(enabledConfigKey) ?? false;
                    if (!enabled) {
                        return;
                    }
                }
                return {
                    kind: Number(type),
                    label: pickLabel,
                    description: pickDescription,
                };
            }).filter(x => !!x);
            items.push({ type: 'separator', label: localize('mcp.serverType.copilot', "Model-Assisted") }, ...elligableTypes);
        }
        items.push({ type: 'separator' });
        const discovery = this._configurationService.getValue(mcpDiscoverySection);
        if (discovery && typeof discovery === 'object' && allDiscoverySources.some(d => !discovery[d])) {
            items.push({
                kind: 'discovery',
                label: localize('mcp.servers.discovery', "Add from another application..."),
            });
        }
        items.push({
            kind: 'browse',
            label: localize('mcp.servers.browse', "Browse MCP Servers..."),
        });
        const result = await this._quickInputService.pick(items, {
            placeHolder: localize('mcp.serverType.placeholder', "Choose the type of MCP server to add"),
        });
        if (result?.kind === 'browse') {
            this._commandService.executeCommand("workbench.mcp.browseServers" /* McpCommandIds.Browse */);
            return undefined;
        }
        if (result?.kind === 'discovery') {
            this._commandService.executeCommand('workbench.action.openSettings', mcpDiscoverySection);
            return undefined;
        }
        return result?.kind;
    }
    async getStdioConfig() {
        const command = await this._quickInputService.input({
            title: localize('mcp.command.title', "Enter Command"),
            placeHolder: localize('mcp.command.placeholder', "Command to run (with optional arguments)"),
            ignoreFocusLost: true,
        });
        if (!command) {
            return undefined;
        }
        this._telemetryService.publicLog2('mcp.addserver', {
            packageType: 'stdio'
        });
        // Split command into command and args, handling quotes
        const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g);
        return {
            type: "stdio" /* McpServerType.LOCAL */,
            command: parts[0].replace(/"/g, ''),
            args: parts.slice(1).map(arg => arg.replace(/"/g, ''))
        };
    }
    async getSSEConfig() {
        const url = await this._quickInputService.input({
            title: localize('mcp.url.title', "Enter Server URL"),
            placeHolder: localize('mcp.url.placeholder', "URL of the MCP server (e.g., http://localhost:3000)"),
            ignoreFocusLost: true,
        });
        if (!url) {
            return undefined;
        }
        this._telemetryService.publicLog2('mcp.addserver', {
            packageType: 'sse'
        });
        return { url, type: "http" /* McpServerType.REMOTE */ };
    }
    async getServerId(suggestion = `my-mcp-server-${generateUuid().split('-')[0]}`) {
        const id = await this._quickInputService.input({
            title: localize('mcp.serverId.title', "Enter Server ID"),
            placeHolder: localize('mcp.serverId.placeholder', "Unique identifier for this server"),
            value: suggestion,
            ignoreFocusLost: true,
        });
        return id;
    }
    async getConfigurationTarget() {
        const options = [
            { target: 3 /* ConfigurationTarget.USER_LOCAL */, label: localize('mcp.target.user', "Global"), description: localize('mcp.target.user.description', "Available in all workspaces, runs locally") }
        ];
        const raLabel = this._environmentService.remoteAuthority && this._label.getHostLabel(Schemas.vscodeRemote, this._environmentService.remoteAuthority);
        if (raLabel) {
            options.push({ target: 4 /* ConfigurationTarget.USER_REMOTE */, label: localize('mcp.target.remote', "Remote"), description: localize('mcp.target..remote.description', "Available on this remote machine, runs on {0}", raLabel) });
        }
        const workbenchState = this._workspaceService.getWorkbenchState();
        if (workbenchState !== 1 /* WorkbenchState.EMPTY */) {
            const target = workbenchState === 2 /* WorkbenchState.FOLDER */ ? this._workspaceService.getWorkspace().folders[0] : 5 /* ConfigurationTarget.WORKSPACE */;
            if (this._environmentService.remoteAuthority) {
                options.push({ target, label: localize('mcp.target.workspace', "Workspace"), description: localize('mcp.target.workspace.description.remote', "Available in this workspace, runs on {0}", raLabel) });
            }
            else {
                options.push({ target, label: localize('mcp.target.workspace', "Workspace"), description: localize('mcp.target.workspace.description', "Available in this workspace, runs locally") });
            }
        }
        if (options.length === 1) {
            return options[0].target;
        }
        const targetPick = await this._quickInputService.pick(options, {
            title: localize('mcp.target.title', "Add MCP Server"),
            placeHolder: localize('mcp.target.placeholder', "Select the configuration target")
        });
        return targetPick?.target;
    }
    async getAssistedConfig(type) {
        const packageName = await this._quickInputService.input({
            ignoreFocusLost: true,
            title: AssistedTypes[type].title,
            placeHolder: AssistedTypes[type].placeholder,
        });
        if (!packageName) {
            return undefined;
        }
        let LoadAction;
        (function (LoadAction) {
            LoadAction["Retry"] = "retry";
            LoadAction["Cancel"] = "cancel";
            LoadAction["Allow"] = "allow";
            LoadAction["OpenUri"] = "openUri";
        })(LoadAction || (LoadAction = {}));
        const loadingQuickPickStore = new DisposableStore();
        const loadingQuickPick = loadingQuickPickStore.add(this._quickInputService.createQuickPick());
        loadingQuickPick.title = localize('mcp.loading.title', "Loading package details...");
        loadingQuickPick.busy = true;
        loadingQuickPick.ignoreFocusOut = true;
        const packageType = this.getPackageType(type);
        this._telemetryService.publicLog2('mcp.addserver', {
            packageType: packageType
        });
        this._commandService.executeCommand("github.copilot.chat.mcp.setup.validatePackage" /* AddConfigurationCopilotCommand.ValidatePackage */, {
            type: packageType,
            name: packageName,
            targetConfig: {
                ...mcpStdioServerSchema,
                properties: {
                    ...mcpStdioServerSchema.properties,
                    name: {
                        type: 'string',
                        description: 'Suggested name of the server, alphanumeric and hyphen only',
                    }
                },
                required: [...(mcpStdioServerSchema.required || []), 'name'],
            },
        }).then(result => {
            if (!result || result.state === 'error') {
                loadingQuickPick.title = result?.error || 'Unknown error loading package';
                const items = [];
                if (result?.helpUri) {
                    items.push({
                        id: "openUri" /* LoadAction.OpenUri */,
                        label: result.helpUriLabel ?? localize('mcp.error.openHelpUri', 'Open help URL'),
                        helpUri: URI.parse(result.helpUri),
                    });
                }
                items.push({ id: "retry" /* LoadAction.Retry */, label: localize('mcp.error.retry', 'Try a different package') }, { id: "cancel" /* LoadAction.Cancel */, label: localize('cancel', 'Cancel') });
                loadingQuickPick.items = items;
            }
            else {
                loadingQuickPick.title = localize('mcp.confirmPublish', 'Install {0}{1} from {2}?', result.name ?? packageName, result.version ? `@${result.version}` : '', result.publisher);
                loadingQuickPick.items = [
                    { id: "allow" /* LoadAction.Allow */, label: localize('allow', "Allow") },
                    { id: "cancel" /* LoadAction.Cancel */, label: localize('cancel', 'Cancel') }
                ];
            }
            loadingQuickPick.busy = false;
        });
        const loadingAction = await new Promise(resolve => {
            loadingQuickPickStore.add(loadingQuickPick.onDidAccept(() => resolve(loadingQuickPick.selectedItems[0])));
            loadingQuickPickStore.add(loadingQuickPick.onDidHide(() => resolve(undefined)));
            loadingQuickPick.show();
        }).finally(() => loadingQuickPickStore.dispose());
        switch (loadingAction?.id) {
            case "retry" /* LoadAction.Retry */:
                return this.getAssistedConfig(type);
            case "openUri" /* LoadAction.OpenUri */:
                if (loadingAction.helpUri) {
                    this._openerService.open(loadingAction.helpUri);
                }
                return undefined;
            case "allow" /* LoadAction.Allow */:
                break;
            case "cancel" /* LoadAction.Cancel */:
            default:
                return undefined;
        }
        const config = await this._commandService.executeCommand("github.copilot.chat.mcp.setup.flow" /* AddConfigurationCopilotCommand.StartFlow */, {
            name: packageName,
            type: packageType
        });
        if (config?.type === 'mapped') {
            return {
                name: config.name,
                server: config.server,
                inputs: config.inputs,
            };
        }
        else if (config?.type === 'assisted' || !config?.type) {
            return config;
        }
        else {
            assertNever(config?.type);
        }
    }
    /** Shows the location of a server config once it's discovered. */
    showOnceDiscovered(name) {
        const store = new DisposableStore();
        store.add(autorun(reader => {
            const colls = this._mcpRegistry.collections.read(reader);
            const servers = this._mcpService.servers.read(reader);
            const match = mapFindFirst(colls, collection => mapFindFirst(collection.serverDefinitions.read(reader), server => server.label === name ? { server, collection } : undefined));
            const server = match && servers.find(s => s.definition.id === match.server.id);
            if (match && server) {
                if (match.collection.presentation?.origin) {
                    this._editorService.openEditor({
                        resource: match.collection.presentation.origin,
                        options: {
                            selection: match.server.presentation?.origin?.range,
                            preserveFocus: true,
                        }
                    });
                }
                else {
                    this._commandService.executeCommand("workbench.mcp.serverOptions" /* McpCommandIds.ServerOptions */, name);
                }
                server.start({ promptType: 'all-untrusted' }).then(state => {
                    if (state.state === 3 /* McpConnectionState.Kind.Error */) {
                        server.showOutput();
                    }
                });
                store.dispose();
            }
        }));
        store.add(disposableTimeout(() => store.dispose(), 5000));
    }
    async run() {
        // Step 1: Choose server type
        const serverType = await this.getServerType();
        if (serverType === undefined) {
            return;
        }
        // Step 2: Get server details based on type
        let config;
        let suggestedName;
        let inputs;
        let inputValues;
        switch (serverType) {
            case 0 /* AddConfigurationType.Stdio */:
                config = await this.getStdioConfig();
                break;
            case 1 /* AddConfigurationType.HTTP */:
                config = await this.getSSEConfig();
                break;
            case 2 /* AddConfigurationType.NpmPackage */:
            case 3 /* AddConfigurationType.PipPackage */:
            case 4 /* AddConfigurationType.NuGetPackage */:
            case 5 /* AddConfigurationType.DockerImage */: {
                const r = await this.getAssistedConfig(serverType);
                config = r?.server ? { ...r.server, type: "stdio" /* McpServerType.LOCAL */ } : undefined;
                suggestedName = r?.name;
                inputs = r?.inputs;
                inputValues = r?.inputValues;
                break;
            }
            default:
                assertNever(serverType);
        }
        if (!config) {
            return;
        }
        // Step 3: Get server ID
        const name = await this.getServerId(suggestedName);
        if (!name) {
            return;
        }
        // Step 4: Choose configuration target if no configUri provided
        let target = this.workspaceFolder;
        if (!target) {
            target = await this.getConfigurationTarget();
            if (!target) {
                return;
            }
        }
        await this._mcpManagementService.install({ name, config, inputs }, { target });
        if (inputValues) {
            for (const [key, value] of Object.entries(inputValues)) {
                await this._mcpRegistry.setSavedInput(key, (isWorkspaceFolder(target) ? 6 /* ConfigurationTarget.WORKSPACE_FOLDER */ : target) ?? 5 /* ConfigurationTarget.WORKSPACE */, value);
            }
        }
        const packageType = this.getPackageType(serverType);
        if (packageType) {
            this._telemetryService.publicLog2('mcp.addserver.completed', {
                packageType,
                serverType: config.type,
                target: target === 5 /* ConfigurationTarget.WORKSPACE */ ? 'workspace' : 'user'
            });
        }
        this.showOnceDiscovered(name);
    }
    async pickForUrlHandler(resource, showIsPrimary = false) {
        const name = decodeURIComponent(basename(resource)).replace(/\.json$/, '');
        const placeHolder = localize('install.title', 'Install MCP server {0}', name);
        const items = [
            { id: 'install', label: localize('install.start', 'Install Server') },
            { id: 'show', label: localize('install.show', 'Show Configuration', name) },
            { id: 'rename', label: localize('install.rename', 'Rename "{0}"', name) },
            { id: 'cancel', label: localize('cancel', 'Cancel') },
        ];
        if (showIsPrimary) {
            [items[0], items[1]] = [items[1], items[0]];
        }
        const pick = await this._quickInputService.pick(items, { placeHolder, ignoreFocusLost: true });
        const getEditors = () => this._editorService.findEditors(resource);
        switch (pick?.id) {
            case 'show':
                await this._editorService.openEditor({ resource });
                break;
            case 'install':
                await this._editorService.save(getEditors());
                try {
                    const contents = await this._fileService.readFile(resource);
                    const { inputs, ...config } = parseJsonc(contents.value.toString());
                    await this._mcpManagementService.install({ name, config, inputs });
                    this._editorService.closeEditors(getEditors());
                    this.showOnceDiscovered(name);
                }
                catch (e) {
                    this._notificationService.error(localize('install.error', 'Error installing MCP server {0}: {1}', name, e.message));
                    await this._editorService.openEditor({ resource });
                }
                break;
            case 'rename': {
                const newName = await this._quickInputService.input({ placeHolder: localize('install.newName', 'Enter new name'), value: name });
                if (newName) {
                    const newURI = resource.with({ path: `/${encodeURIComponent(newName)}.json` });
                    await this._editorService.save(getEditors());
                    await this._fileService.move(resource, newURI);
                    return this.pickForUrlHandler(newURI, showIsPrimary);
                }
                break;
            }
        }
    }
    getPackageType(serverType) {
        switch (serverType) {
            case 2 /* AddConfigurationType.NpmPackage */:
                return 'npm';
            case 3 /* AddConfigurationType.PipPackage */:
                return 'pip';
            case 4 /* AddConfigurationType.NuGetPackage */:
                return 'nuget';
            case 5 /* AddConfigurationType.DockerImage */:
                return 'docker';
            case 0 /* AddConfigurationType.Stdio */:
                return 'stdio';
            case 1 /* AddConfigurationType.HTTP */:
                return 'sse';
            default:
                return undefined;
        }
    }
};
McpAddConfigurationCommand = __decorate([
    __param(1, IQuickInputService),
    __param(2, IWorkbenchMcpManagementService),
    __param(3, IWorkspaceContextService),
    __param(4, IWorkbenchEnvironmentService),
    __param(5, ICommandService),
    __param(6, IMcpRegistry),
    __param(7, IOpenerService),
    __param(8, IEditorService),
    __param(9, IFileService),
    __param(10, INotificationService),
    __param(11, ITelemetryService),
    __param(12, IMcpService),
    __param(13, ILabelService),
    __param(14, IConfigurationService)
], McpAddConfigurationCommand);
export { McpAddConfigurationCommand };
let McpInstallFromManifestCommand = class McpInstallFromManifestCommand {
    constructor(_fileDialogService, _fileService, _quickInputService, _notificationService, _mcpManagementService, _logService) {
        this._fileDialogService = _fileDialogService;
        this._fileService = _fileService;
        this._quickInputService = _quickInputService;
        this._notificationService = _notificationService;
        this._mcpManagementService = _mcpManagementService;
        this._logService = _logService;
    }
    async run() {
        // Step 1: Open file dialog to select the manifest file
        const result = await this._fileDialogService.showOpenDialog({
            title: localize('mcp.installFromManifest.title', "Select MCP Server Manifest"),
            filters: [{ name: localize('mcp.installFromManifest.filter', "MCP Manifest"), extensions: ['json'] }],
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: localize({ key: 'mcp.installFromManifest.openLabel', comment: ['&& denotes a mnemonic'] }, "&&Install")
        });
        if (!result?.[0]) {
            return;
        }
        const manifestUri = result[0];
        // Step 2: Read and parse the manifest file
        let manifest;
        try {
            const contents = await this._fileService.readFile(manifestUri);
            manifest = parseJsonc(contents.value.toString());
        }
        catch (e) {
            this._notificationService.error(localize('mcp.installFromManifest.readError', "Failed to read manifest file: {0}", e.message));
            return;
        }
        if (!manifest || typeof manifest !== 'object') {
            this._notificationService.error(localize('mcp.installFromManifest.invalidJson', "Invalid manifest file: expected a JSON object"));
            return;
        }
        // Step 3: Validate and extract configuration from gallery manifest
        const galleryManifest = manifest;
        // Determine package type from manifest
        let packageType;
        if (Array.isArray(galleryManifest.packages) && galleryManifest.packages.length > 0) {
            packageType = galleryManifest.packages[0].registryType;
        }
        else if (Array.isArray(galleryManifest.remotes) && galleryManifest.remotes.length > 0) {
            packageType = "remote" /* RegistryType.REMOTE */;
        }
        else {
            this._notificationService.error(localize('mcp.installFromManifest.invalidManifest', "Invalid manifest: expected 'packages' or 'remotes' with at least one entry"));
            return;
        }
        let config;
        let inputs;
        try {
            const { mcpServerConfiguration, notices } = this._mcpManagementService.getMcpServerConfigurationFromManifest(galleryManifest, packageType);
            config = mcpServerConfiguration.config;
            inputs = mcpServerConfiguration.inputs;
            if (notices.length > 0) {
                this._logService.warn(`MCP Management Service: Warnings while installing the MCP server from ${manifestUri.path}`, notices);
            }
        }
        catch (e) {
            this._notificationService.error(localize('mcp.installFromManifest.parseError', "Failed to parse manifest: {0}", e.message));
            return;
        }
        // Step 4: Get server name from manifest or prompt user
        let name = galleryManifest.name;
        if (!name) {
            name = await this._quickInputService.input({
                title: localize('mcp.installFromManifest.serverId.title', "Enter Server ID"),
                placeHolder: localize('mcp.installFromManifest.serverId.placeholder', "Unique identifier for this server"),
                value: basename(manifestUri).replace(/\.json$/i, ''),
                ignoreFocusLost: true,
            });
            if (!name) {
                return;
            }
        }
        // Step 5: Install to user settings
        try {
            await this._mcpManagementService.install({ name, config, inputs });
            this._notificationService.info(localize('mcp.installFromManifest.success', "MCP server '{0}' installed successfully", name));
        }
        catch (e) {
            this._notificationService.error(localize('mcp.installFromManifest.installError', "Failed to install MCP server: {0}", e.message));
        }
    }
};
McpInstallFromManifestCommand = __decorate([
    __param(0, IFileDialogService),
    __param(1, IFileService),
    __param(2, IQuickInputService),
    __param(3, INotificationService),
    __param(4, IWorkbenchMcpManagementService),
    __param(5, ILogService)
], McpInstallFromManifestCommand);
export { McpInstallFromManifestCommand };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwQ29tbWFuZHNBZGRDb25maWd1cmF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2Jyb3dzZXIvbWNwQ29tbWFuZHNBZGRDb25maWd1cmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDckUsT0FBTyxFQUFFLEtBQUssSUFBSSxVQUFVLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBdUIscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUN4SCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRzNFLE9B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