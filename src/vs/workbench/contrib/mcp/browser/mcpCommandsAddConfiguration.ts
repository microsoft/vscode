/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IGalleryMcpServerConfiguration, RegistryType } from '../../../../platform/mcp/common/mcpManagement.js';
import { IMcpRemoteServerConfiguration, IMcpServerConfiguration, IMcpServerVariable, IMcpStdioServerConfiguration, McpServerType } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isWorkspaceFolder, IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IWorkbenchMcpManagementService } from '../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { McpCommandIds } from '../common/mcpCommandIds.js';
import { allDiscoverySources, DiscoverySource, mcpDiscoverySection, mcpStdioServerSchema } from '../common/mcpConfiguration.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { IMcpService, McpConnectionState } from '../common/mcpTypes.js';

export const enum AddConfigurationType {
	Stdio,
	HTTP,

	NpmPackage,
	PipPackage,
	NuGetPackage,
	DockerImage,
}

type AssistedConfigurationType = AddConfigurationType.NpmPackage | AddConfigurationType.PipPackage | AddConfigurationType.NuGetPackage | AddConfigurationType.DockerImage;

export const AssistedTypes = {
	[AddConfigurationType.NpmPackage]: {
		title: localize('mcp.npm.title', "Enter NPM Package Name"),
		placeholder: localize('mcp.npm.placeholder', "Package name (e.g., @org/package)"),
		pickLabel: localize('mcp.serverType.npm', "NPM Package"),
		pickDescription: localize('mcp.serverType.npm.description', "Install from an NPM package name"),
		enabledConfigKey: null, // always enabled
	},
	[AddConfigurationType.PipPackage]: {
		title: localize('mcp.pip.title', "Enter Pip Package Name"),
		placeholder: localize('mcp.pip.placeholder', "Package name (e.g., package-name)"),
		pickLabel: localize('mcp.serverType.pip', "Pip Package"),
		pickDescription: localize('mcp.serverType.pip.description', "Install from a Pip package name"),
		enabledConfigKey: null, // always enabled
	},
	[AddConfigurationType.NuGetPackage]: {
		title: localize('mcp.nuget.title', "Enter NuGet Package Name"),
		placeholder: localize('mcp.nuget.placeholder', "Package name (e.g., Package.Name)"),
		pickLabel: localize('mcp.serverType.nuget', "NuGet Package"),
		pickDescription: localize('mcp.serverType.nuget.description', "Install from a NuGet package name"),
		enabledConfigKey: 'chat.mcp.assisted.nuget.enabled',
	},
	[AddConfigurationType.DockerImage]: {
		title: localize('mcp.docker.title', "Enter Docker Image Name"),
		placeholder: localize('mcp.docker.placeholder', "Image name (e.g., mcp/imagename)"),
		pickLabel: localize('mcp.serverType.docker', "Docker Image"),
		pickDescription: localize('mcp.serverType.docker.description', "Install from a Docker image"),
		enabledConfigKey: null, // always enabled
	},
};

const enum AddConfigurationCopilotCommand {
	/** Returns whether MCP enhanced setup is enabled. */
	IsSupported = 'github.copilot.chat.mcp.setup.check',

	/** Takes an npm/pip package name, validates its owner. */
	ValidatePackage = 'github.copilot.chat.mcp.setup.validatePackage',

	/** Returns the resolved MCP configuration. */
	StartFlow = 'github.copilot.chat.mcp.setup.flow',
}

type ValidatePackageResult =
	{ state: 'ok'; publisher: string; name?: string; version?: string }
	| { state: 'error'; error: string; helpUri?: string; helpUriLabel?: string };

type AddServerData = {
	packageType: string;
};
type AddServerClassification = {
	owner: 'digitarald';
	comment: 'Generic details for adding a new MCP server';
	packageType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of MCP server package' };
};
type AddServerCompletedData = {
	packageType: string;
	serverType: string | undefined;
	target: string;
};
type AddServerCompletedClassification = {
	owner: 'digitarald';
	comment: 'Generic details for successfully adding model-assisted MCP server';
	packageType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of MCP server package' };
	serverType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of MCP server' };
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The target of the MCP server configuration' };
};

type AssistedServerConfiguration = {
	type?: 'vscode';
	name?: string;
	server: Omit<IMcpStdioServerConfiguration, 'type'>;
	inputs?: IMcpServerVariable[];
	inputValues?: Record<string, string>;
} | {
	type: 'server.json';
	name?: string;
	server: IGalleryMcpServerConfiguration;
};

export class McpAddConfigurationCommand {
	constructor(
		private readonly workspaceFolder: IWorkspaceFolder | undefined,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IWorkbenchMcpManagementService private readonly _mcpManagementService: IWorkbenchMcpManagementService,
		@IWorkspaceContextService private readonly _workspaceService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ICommandService private readonly _commandService: ICommandService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IEditorService private readonly _editorService: IEditorService,
		@IFileService private readonly _fileService: IFileService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IMcpService private readonly _mcpService: IMcpService,
		@ILabelService private readonly _label: ILabelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) { }

	private async getServerType(): Promise<AddConfigurationType | undefined> {
		type TItem = { kind: AddConfigurationType | 'browse' | 'discovery' } & IQuickPickItem;
		const items: QuickPickInput<TItem>[] = [
			{ kind: AddConfigurationType.Stdio, label: localize('mcp.serverType.command', "Command (stdio)"), description: localize('mcp.serverType.command.description', "Run a local command that implements the MCP protocol") },
			{ kind: AddConfigurationType.HTTP, label: localize('mcp.serverType.http', "HTTP (HTTP or Server-Sent Events)"), description: localize('mcp.serverType.http.description', "Connect to a remote HTTP server that implements the MCP protocol") }
		];

		let aiSupported: boolean | undefined;
		try {
			aiSupported = await this._commandService.executeCommand<boolean>(AddConfigurationCopilotCommand.IsSupported);
		} catch {
			// ignored
		}

		if (aiSupported) {
			items.unshift({ type: 'separator', label: localize('mcp.serverType.manual', "Manual Install") });

			const elligableTypes = Object.entries(AssistedTypes).map(([type, { pickLabel, pickDescription, enabledConfigKey }]) => {
				if (enabledConfigKey) {
					const enabled = this._configurationService.getValue<boolean>(enabledConfigKey) ?? false;
					if (!enabled) {
						return;
					}
				}
				return {
					kind: Number(type) as AddConfigurationType,
					label: pickLabel,
					description: pickDescription,
				};
			}).filter(x => !!x);

			items.push(
				{ type: 'separator', label: localize('mcp.serverType.copilot', "Model-Assisted") },
				...elligableTypes
			);
		}

		items.push({ type: 'separator' });

		const discovery = this._configurationService.getValue<{ [K in DiscoverySource]: boolean }>(mcpDiscoverySection);
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

		const result = await this._quickInputService.pick<TItem>(items, {
			placeHolder: localize('mcp.serverType.placeholder', "Choose the type of MCP server to add"),
		});

		if (result?.kind === 'browse') {
			this._commandService.executeCommand(McpCommandIds.Browse);
			return undefined;
		}

		if (result?.kind === 'discovery') {
			this._commandService.executeCommand('workbench.action.openSettings', mcpDiscoverySection);
			return undefined;
		}

		return result?.kind;
	}

	private async getStdioConfig(): Promise<IMcpStdioServerConfiguration | undefined> {
		const command = await this._quickInputService.input({
			title: localize('mcp.command.title', "Enter Command"),
			placeHolder: localize('mcp.command.placeholder', "Command to run (with optional arguments)"),
			ignoreFocusLost: true,
		});

		if (!command) {
			return undefined;
		}

		this._telemetryService.publicLog2<AddServerData, AddServerClassification>('mcp.addserver', {
			packageType: 'stdio'
		});

		// Split command into command and args, handling quotes
		const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g)!;
		return {
			type: McpServerType.LOCAL,
			command: parts[0].replace(/"/g, ''),

			args: parts.slice(1).map(arg => arg.replace(/"/g, ''))
		};
	}

	private async getSSEConfig(): Promise<IMcpRemoteServerConfiguration | undefined> {
		const url = await this._quickInputService.input({
			title: localize('mcp.url.title', "Enter Server URL"),
			placeHolder: localize('mcp.url.placeholder', "URL of the MCP server (e.g., http://localhost:3000)"),
			ignoreFocusLost: true,
		});

		if (!url) {
			return undefined;
		}

		this._telemetryService.publicLog2<AddServerData, AddServerClassification>('mcp.addserver', {
			packageType: 'sse'
		});

		return { url, type: McpServerType.REMOTE };
	}

	private async getServerId(suggestion = `my-mcp-server-${generateUuid().split('-')[0]}`): Promise<string | undefined> {
		const id = await this._quickInputService.input({
			title: localize('mcp.serverId.title', "Enter Server ID"),
			placeHolder: localize('mcp.serverId.placeholder', "Unique identifier for this server"),
			value: suggestion,
			ignoreFocusLost: true,
		});

		return id;
	}

	private async getConfigurationTarget(): Promise<ConfigurationTarget | IWorkspaceFolder | undefined> {
		const options: (IQuickPickItem & { target?: ConfigurationTarget | IWorkspaceFolder })[] = [
			{ target: ConfigurationTarget.USER_LOCAL, label: localize('mcp.target.user', "Global"), description: localize('mcp.target.user.description', "Available in all workspaces, runs locally") }
		];

		const raLabel = this._environmentService.remoteAuthority && this._label.getHostLabel(Schemas.vscodeRemote, this._environmentService.remoteAuthority);
		if (raLabel) {
			options.push({ target: ConfigurationTarget.USER_REMOTE, label: localize('mcp.target.remote', "Remote"), description: localize('mcp.target..remote.description', "Available on this remote machine, runs on {0}", raLabel) });
		}

		const workbenchState = this._workspaceService.getWorkbenchState();
		if (workbenchState !== WorkbenchState.EMPTY) {
			const target = workbenchState === WorkbenchState.FOLDER ? this._workspaceService.getWorkspace().folders[0] : ConfigurationTarget.WORKSPACE;
			if (this._environmentService.remoteAuthority) {
				options.push({ target, label: localize('mcp.target.workspace', "Workspace"), description: localize('mcp.target.workspace.description.remote', "Available in this workspace, runs on {0}", raLabel) });
			} else {
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

	private async getAssistedConfig(type: AssistedConfigurationType): Promise<{ name?: string; server: Omit<IMcpStdioServerConfiguration, 'type'>; inputs?: IMcpServerVariable[]; inputValues?: Record<string, string> } | undefined> {
		const packageName = await this._quickInputService.input({
			ignoreFocusLost: true,
			title: AssistedTypes[type].title,
			placeHolder: AssistedTypes[type].placeholder,
		});

		if (!packageName) {
			return undefined;
		}

		const enum LoadAction {
			Retry = 'retry',
			Cancel = 'cancel',
			Allow = 'allow',
			OpenUri = 'openUri',
		}

		const loadingQuickPickStore = new DisposableStore();
		const loadingQuickPick = loadingQuickPickStore.add(this._quickInputService.createQuickPick<IQuickPickItem & { id: LoadAction; helpUri?: URI }>());
		loadingQuickPick.title = localize('mcp.loading.title', "Loading package details...");
		loadingQuickPick.busy = true;
		loadingQuickPick.ignoreFocusOut = true;

		const packageType = this.getPackageType(type);

		this._telemetryService.publicLog2<AddServerData, AddServerClassification>('mcp.addserver', {
			packageType: packageType!
		});

		this._commandService.executeCommand<ValidatePackageResult>(
			AddConfigurationCopilotCommand.ValidatePackage,
			{
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
			}
		).then(result => {
			if (!result || result.state === 'error') {
				loadingQuickPick.title = result?.error || 'Unknown error loading package';

				const items: Array<IQuickPickItem & { id: LoadAction; helpUri?: URI }> = [];

				if (result?.helpUri) {
					items.push({
						id: LoadAction.OpenUri,
						label: result.helpUriLabel ?? localize('mcp.error.openHelpUri', 'Open help URL'),
						helpUri: URI.parse(result.helpUri),
					});
				}

				items.push(
					{ id: LoadAction.Retry, label: localize('mcp.error.retry', 'Try a different package') },
					{ id: LoadAction.Cancel, label: localize('cancel', 'Cancel') },
				);

				loadingQuickPick.items = items;
			} else {
				loadingQuickPick.title = localize(
					'mcp.confirmPublish', 'Install {0}{1} from {2}?',
					result.name ?? packageName,
					result.version ? `@${result.version}` : '',
					result.publisher);
				loadingQuickPick.items = [
					{ id: LoadAction.Allow, label: localize('allow', "Allow") },
					{ id: LoadAction.Cancel, label: localize('cancel', 'Cancel') }
				];
			}
			loadingQuickPick.busy = false;
		});

		const loadingAction = await new Promise<{ id: LoadAction; helpUri?: URI } | undefined>(resolve => {
			loadingQuickPick.onDidAccept(() => resolve(loadingQuickPick.selectedItems[0]));
			loadingQuickPick.onDidHide(() => resolve(undefined));
			loadingQuickPick.show();
		}).finally(() => loadingQuickPick.dispose());

		switch (loadingAction?.id) {
			case LoadAction.Retry:
				return this.getAssistedConfig(type);
			case LoadAction.OpenUri:
				if (loadingAction.helpUri) { this._openerService.open(loadingAction.helpUri); }
				return undefined;
			case LoadAction.Allow:
				break;
			case LoadAction.Cancel:
			default:
				return undefined;
		}

		const config = await this._commandService.executeCommand<AssistedServerConfiguration>(
			AddConfigurationCopilotCommand.StartFlow,
			{
				name: packageName,
				type: packageType
			}
		);

		if (config?.type === 'server.json') {
			const packageType = this.getPackageTypeEnum(type);
			if (!packageType) {
				throw new Error(`Unsupported assisted package type ${type}`);
			}
			const { mcpServerConfiguration } = this._mcpManagementService.getMcpServerConfigurationFromManifest(config.server, packageType);
			if (mcpServerConfiguration.config.type !== McpServerType.LOCAL) {
				throw new Error(`Unexpected server type ${mcpServerConfiguration.config.type} for assisted configuration from server.json.`);
			}
			return {
				name: config.name,
				server: mcpServerConfiguration.config,
				inputs: mcpServerConfiguration.inputs,
			};
		} else if (config?.type === 'vscode' || !config?.type) {
			return config;
		} else {
			assertNever(config?.type);
		}
	}

	/** Shows the location of a server config once it's discovered. */
	private showOnceDiscovered(name: string) {
		const store = new DisposableStore();
		store.add(autorun(reader => {
			const colls = this._mcpRegistry.collections.read(reader);
			const servers = this._mcpService.servers.read(reader);
			const match = mapFindFirst(colls, collection => mapFindFirst(collection.serverDefinitions.read(reader),
				server => server.label === name ? { server, collection } : undefined));
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
				} else {
					this._commandService.executeCommand(McpCommandIds.ServerOptions, name);
				}

				server.start({ promptType: 'all-untrusted' }).then(state => {
					if (state.state === McpConnectionState.Kind.Error) {
						server.showOutput();
					}
				});

				store.dispose();
			}
		}));

		store.add(disposableTimeout(() => store.dispose(), 5000));
	}

	public async run(): Promise<void> {
		// Step 1: Choose server type
		const serverType = await this.getServerType();
		if (serverType === undefined) {
			return;
		}

		// Step 2: Get server details based on type
		let config: IMcpServerConfiguration | undefined;
		let suggestedName: string | undefined;
		let inputs: IMcpServerVariable[] | undefined;
		let inputValues: Record<string, string> | undefined;
		switch (serverType) {
			case AddConfigurationType.Stdio:
				config = await this.getStdioConfig();
				break;
			case AddConfigurationType.HTTP:
				config = await this.getSSEConfig();
				break;
			case AddConfigurationType.NpmPackage:
			case AddConfigurationType.PipPackage:
			case AddConfigurationType.NuGetPackage:
			case AddConfigurationType.DockerImage: {
				const r = await this.getAssistedConfig(serverType);
				config = r?.server ? { ...r.server, type: McpServerType.LOCAL } : undefined;
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
		let target: ConfigurationTarget | IWorkspaceFolder | undefined = this.workspaceFolder;
		if (!target) {
			target = await this.getConfigurationTarget();
			if (!target) {
				return;
			}
		}

		await this._mcpManagementService.install({ name, config, inputs }, { target });

		if (inputValues) {
			for (const [key, value] of Object.entries(inputValues)) {
				await this._mcpRegistry.setSavedInput(key, (isWorkspaceFolder(target) ? ConfigurationTarget.WORKSPACE_FOLDER : target) ?? ConfigurationTarget.WORKSPACE, value);
			}
		}

		const packageType = this.getPackageType(serverType);
		if (packageType) {
			this._telemetryService.publicLog2<AddServerCompletedData, AddServerCompletedClassification>('mcp.addserver.completed', {
				packageType,
				serverType: config.type,
				target: target === ConfigurationTarget.WORKSPACE ? 'workspace' : 'user'
			});
		}

		this.showOnceDiscovered(name);
	}

	public async pickForUrlHandler(resource: URI, showIsPrimary = false): Promise<void> {
		const name = decodeURIComponent(basename(resource)).replace(/\.json$/, '');
		const placeHolder = localize('install.title', 'Install MCP server {0}', name);

		const items: IQuickPickItem[] = [
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
					const { inputs, ...config }: IMcpServerConfiguration & { inputs?: IMcpServerVariable[] } = parseJsonc(contents.value.toString());
					await this._mcpManagementService.install({ name, config, inputs });
					this._editorService.closeEditors(getEditors());
					this.showOnceDiscovered(name);
				} catch (e) {
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

	private getPackageTypeEnum(type: AddConfigurationType): RegistryType | undefined {
		switch (type) {
			case AddConfigurationType.NpmPackage:
				return RegistryType.NODE;
			case AddConfigurationType.PipPackage:
				return RegistryType.PYTHON;
			case AddConfigurationType.NuGetPackage:
				return RegistryType.NUGET;
			case AddConfigurationType.DockerImage:
				return RegistryType.DOCKER;
			default:
				return undefined;
		}
	}

	private getPackageType(serverType: AddConfigurationType): string | undefined {
		switch (serverType) {
			case AddConfigurationType.NpmPackage:
				return 'npm';
			case AddConfigurationType.PipPackage:
				return 'pip';
			case AddConfigurationType.NuGetPackage:
				return 'nuget';
			case AddConfigurationType.DockerImage:
				return 'docker';
			case AddConfigurationType.Stdio:
				return 'stdio';
			case AddConfigurationType.HTTP:
				return 'sse';
			default:
				return undefined;
		}
	}
}
