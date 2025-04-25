/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFindFirst } from '../../../../base/common/arraysFind.js';
import { assertNever } from '../../../../base/common/assert.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { parse as parseJsonc } from '../../../../base/common/jsonc.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IMcpConfiguration, IMcpConfigurationHTTP, McpConfigurationServer } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EditorsOrder } from '../../../common/editor.js';
import { IJSONEditingService } from '../../../services/configuration/common/jsonEditing.js';
import { ConfiguredInput } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IMcpConfigurationStdio, mcpConfigurationSection, mcpStdioServerSchema } from '../common/mcpConfiguration.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { IMcpService, McpConnectionState } from '../common/mcpTypes.js';
import { McpServerOptionsCommand } from './mcpCommands.js';

const enum AddConfigurationType {
	Stdio,
	HTTP,

	NpmPackage,
	PipPackage,
	DockerImage,
}

type AssistedConfigurationType = AddConfigurationType.NpmPackage | AddConfigurationType.PipPackage | AddConfigurationType.DockerImage;

const assistedTypes = {
	[AddConfigurationType.NpmPackage]: {
		title: localize('mcp.npm.title', "Enter NPM Package Name"),
		placeholder: localize('mcp.npm.placeholder', "Package name (e.g., @org/package)"), pickLabel: localize('mcp.serverType.npm', "NPM Package"),
		pickDescription: localize('mcp.serverType.npm.description', "Install from an NPM package name")
	},
	[AddConfigurationType.PipPackage]: {
		title: localize('mcp.pip.title', "Enter Pip Package Name"),
		placeholder: localize('mcp.pip.placeholder', "Package name (e.g., package-name)"),
		pickLabel: localize('mcp.serverType.pip', "Pip Package"),
		pickDescription: localize('mcp.serverType.pip.description', "Install from a Pip package name")
	},
	[AddConfigurationType.DockerImage]: {
		title: localize('mcp.docker.title', "Enter Docker Image Name"),
		placeholder: localize('mcp.docker.placeholder', "Image name (e.g., mcp/imagename)"),
		pickLabel: localize('mcp.serverType.docker', "Docker Image"),
		pickDescription: localize('mcp.serverType.docker.description', "Install from a Docker image")
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

type ValidatePackageResult = { state: 'ok'; publisher: string } | { state: 'error'; error: string };

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

export class McpAddConfigurationCommand {
	constructor(
		private readonly _explicitConfigUri: string | undefined,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IJSONEditingService private readonly _jsonEditingService: IJSONEditingService,
		@IWorkspaceContextService private readonly _workspaceService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ICommandService private readonly _commandService: ICommandService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IEditorService private readonly _openerService: IEditorService,
		@IEditorService private readonly _editorService: IEditorService,
		@IFileService private readonly _fileService: IFileService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IMcpService private readonly _mcpService: IMcpService,
	) { }

	private async getServerType(): Promise<AddConfigurationType | undefined> {
		const items: QuickPickInput<{ kind: AddConfigurationType } & IQuickPickItem>[] = [
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
			items.push(
				{ type: 'separator', label: localize('mcp.serverType.copilot', "Model-Assisted") },
				...Object.entries(assistedTypes).map(([type, { pickLabel, pickDescription }]) => ({
					kind: Number(type) as AddConfigurationType,
					label: pickLabel,
					description: pickDescription,
				}))
			);
		}

		const result = await this._quickInputService.pick<{ kind: AddConfigurationType } & IQuickPickItem>(items, {
			placeHolder: localize('mcp.serverType.placeholder', "Choose the type of MCP server to add"),
		});

		return result?.kind;
	}

	private async getStdioConfig(): Promise<IMcpConfigurationStdio | undefined> {
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
			type: 'stdio',
			command: parts[0].replace(/"/g, ''),

			args: parts.slice(1).map(arg => arg.replace(/"/g, ''))
		};
	}

	private async getSSEConfig(): Promise<IMcpConfigurationHTTP | undefined> {
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

		return { url };
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

	private async getConfigurationTarget(): Promise<ConfigurationTarget | undefined> {
		const options: (IQuickPickItem & { target: ConfigurationTarget })[] = [
			{ target: ConfigurationTarget.USER, label: localize('mcp.target.user', "User Settings"), description: localize('mcp.target.user.description', "Available in all workspaces") }
		];

		if (!!this._environmentService.remoteAuthority) {
			options.push({ target: ConfigurationTarget.USER_REMOTE, label: localize('mcp.target.remote', "Remote Settings"), description: localize('mcp.target..remote.description', "Available on this remote machine") });
		}

		if (this._workspaceService.getWorkspace().folders.length > 0) {
			options.push({ target: ConfigurationTarget.WORKSPACE, label: localize('mcp.target.workspace', "Workspace Settings"), description: localize('mcp.target.workspace.description', "Available in this workspace") });
		}

		if (options.length === 1) {
			return options[0].target;
		}


		const targetPick = await this._quickInputService.pick(options, {
			title: localize('mcp.target.title', "Choose where to save the configuration"),
		});

		return targetPick?.target;
	}

	private async getAssistedConfig(type: AssistedConfigurationType): Promise<{ name: string; server: McpConfigurationServer; inputs?: ConfiguredInput[]; inputValues?: Record<string, string> } | undefined> {
		const packageName = await this._quickInputService.input({
			ignoreFocusLost: true,
			title: assistedTypes[type].title,
			placeHolder: assistedTypes[type].placeholder,
		});

		if (!packageName) {
			return undefined;
		}

		const enum LoadAction {
			Retry = 'retry',
			Cancel = 'cancel',
			Allow = 'allow'
		}

		const loadingQuickPickStore = new DisposableStore();
		const loadingQuickPick = loadingQuickPickStore.add(this._quickInputService.createQuickPick<IQuickPickItem & { id: LoadAction }>());
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
				loadingQuickPick.items = [{ id: LoadAction.Retry, label: localize('mcp.error.retry', 'Try a different package') }, { id: LoadAction.Cancel, label: localize('cancel', 'Cancel') }];
			} else {
				loadingQuickPick.title = localize('mcp.confirmPublish', 'Install {0} from {1}?', packageName, result.publisher);
				loadingQuickPick.items = [
					{ id: LoadAction.Allow, label: localize('allow', "Allow") },
					{ id: LoadAction.Cancel, label: localize('cancel', 'Cancel') }
				];
			}
			loadingQuickPick.busy = false;
		});

		const loadingAction = await new Promise<LoadAction | undefined>(resolve => {
			loadingQuickPick.onDidAccept(() => resolve(loadingQuickPick.selectedItems[0]?.id));
			loadingQuickPick.onDidHide(() => resolve(undefined));
			loadingQuickPick.show();
		}).finally(() => loadingQuickPick.dispose());

		switch (loadingAction) {
			case LoadAction.Retry:
				return this.getAssistedConfig(type);
			case LoadAction.Allow:
				break;
			case LoadAction.Cancel:
			default:
				return undefined;
		}

		return await this._commandService.executeCommand<{ name: string; server: McpConfigurationServer; inputs?: ConfiguredInput[]; inputValues?: Record<string, string> }>(
			AddConfigurationCopilotCommand.StartFlow,
			{
				name: packageName,
				type: packageType
			}
		);
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
					this._openerService.openEditor({
						resource: match.collection.presentation.origin,
						options: {
							selection: match.server.presentation?.origin?.range,
							preserveFocus: true,
						}
					});
				} else {
					this._commandService.executeCommand(McpServerOptionsCommand.id, name);
				}

				server.start(true).then(state => {
					if (state.state === McpConnectionState.Kind.Error) {
						server.showOutput();
					}
				});

				store.dispose();
			}
		}));

		store.add(disposableTimeout(() => store.dispose(), 5000));
	}

	private writeToUserSetting(name: string, config: McpConfigurationServer, target: ConfigurationTarget, inputs?: ConfiguredInput[]) {
		const settings: IMcpConfiguration = { ...getConfigValueInTarget(this._configurationService.inspect<IMcpConfiguration>(mcpConfigurationSection), target) };
		settings.servers = { ...settings.servers, [name]: config };
		if (inputs) {
			settings.inputs = [...(settings.inputs || []), ...inputs];
		}
		return this._configurationService.updateValue(mcpConfigurationSection, settings, target);
	}

	public async run(): Promise<void> {
		// Step 1: Choose server type
		const serverType = await this.getServerType();
		if (serverType === undefined) {
			return;
		}

		// Step 2: Get server details based on type
		let serverConfig: McpConfigurationServer | undefined;
		let suggestedName: string | undefined;
		let inputs: ConfiguredInput[] | undefined;
		let inputValues: Record<string, string> | undefined;
		switch (serverType) {
			case AddConfigurationType.Stdio:
				serverConfig = await this.getStdioConfig();
				break;
			case AddConfigurationType.HTTP:
				serverConfig = await this.getSSEConfig();
				break;
			case AddConfigurationType.NpmPackage:
			case AddConfigurationType.PipPackage:
			case AddConfigurationType.DockerImage: {
				const r = await this.getAssistedConfig(serverType);
				serverConfig = r?.server;
				suggestedName = r?.name;
				inputs = r?.inputs;
				inputValues = r?.inputValues;
				break;
			}
			default:
				assertNever(serverType);
		}

		if (!serverConfig) {
			return;
		}

		// Step 3: Get server ID
		const serverId = await this.getServerId(suggestedName);
		if (!serverId) {
			return;
		}

		// Step 4: Choose configuration target if no configUri provided
		let target: ConfigurationTarget | undefined;
		const workspace = this._workspaceService.getWorkspace();
		if (!this._explicitConfigUri) {
			target = await this.getConfigurationTarget();
			if (!target) {
				return;
			}
		}

		// Step 5: Update configuration
		const writeToUriDirect = this._explicitConfigUri
			? URI.parse(this._explicitConfigUri)
			: target === ConfigurationTarget.WORKSPACE && workspace.folders.length === 1
				? URI.joinPath(workspace.folders[0].uri, '.vscode', 'mcp.json')
				: undefined;

		if (writeToUriDirect) {
			await this._jsonEditingService.write(writeToUriDirect, [
				{
					path: ['servers', serverId],
					value: serverConfig
				},
				...(inputs || []).map(i => ({
					path: ['inputs', -1],
					value: i,
				})),
			], true);
		} else {
			await this.writeToUserSetting(serverId, serverConfig, target!, inputs);
		}

		if (inputValues) {
			for (const [key, value] of Object.entries(inputValues)) {
				await this._mcpRegistry.setSavedInput(key, target ?? ConfigurationTarget.WORKSPACE, value);
			}
		}

		const packageType = this.getPackageType(serverType);
		if (packageType) {
			this._telemetryService.publicLog2<AddServerCompletedData, AddServerCompletedClassification>('mcp.addserver.completed', {
				packageType,
				serverType: serverConfig.type,
				target: target === ConfigurationTarget.WORKSPACE ? 'workspace' : 'user'
			});
		}

		this.showOnceDiscovered(serverId);
	}

	public async pickForUrlHandler(resource: URI, showIsPrimary = false): Promise<void> {
		const name = decodeURIComponent(basename(resource)).replace(/\.json$/, '');
		const placeHolder = localize('install.title', 'Install MCP server {0}', name);

		const items: IQuickPickItem[] = [
			{ id: 'install', label: localize('install.start', 'Install Server'), description: localize('install.description', 'Install in your user settings') },
			{ id: 'show', label: localize('install.show', 'Show Configuration', name) },
			{ id: 'rename', label: localize('install.rename', 'Rename "{0}"', name) },
			{ id: 'cancel', label: localize('cancel', 'Cancel') },
		];
		if (showIsPrimary) {
			[items[0], items[1]] = [items[1], items[0]];
		}

		const pick = await this._quickInputService.pick(items, { placeHolder, ignoreFocusLost: true });
		const getEditors = () => this._editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)
			.filter(e => e.editor.resource?.toString() === resource.toString());

		switch (pick?.id) {
			case 'show':
				await this._editorService.openEditor({ resource });
				break;
			case 'install':
				await this._editorService.save(getEditors());
				try {
					const contents = await this._fileService.readFile(resource);
					const { inputs, ...config }: McpConfigurationServer & { inputs?: ConfiguredInput[] } = parseJsonc(contents.value.toString());
					await this.writeToUserSetting(name, config, ConfigurationTarget.USER_LOCAL, inputs);
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

	private getPackageType(serverType: AddConfigurationType): string | undefined {
		switch (serverType) {
			case AddConfigurationType.NpmPackage:
				return 'npm';
			case AddConfigurationType.PipPackage:
				return 'pip';
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
