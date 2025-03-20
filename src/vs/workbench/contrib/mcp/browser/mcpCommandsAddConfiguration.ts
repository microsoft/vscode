/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFindFirst } from '../../../../base/common/arraysFind.js';
import { assertNever } from '../../../../base/common/assert.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IMcpConfiguration, IMcpConfigurationSSE, McpConfigurationServer } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EditorsOrder } from '../../../common/editor.js';
import { IJSONEditingService } from '../../../services/configuration/common/jsonEditing.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IMcpConfigurationStdio, mcpConfigurationSection, mcpStdioServerSchema } from '../common/mcpConfiguration.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { McpServerOptionsCommand } from './mcpCommands.js';

const enum AddConfigurationType {
	Stdio,
	SSE,

	NpmPackage,
	PipPackage,
}

const enum AddConfigurationCopilotCommand {
	/** Returns whether MCP enhanced setup is enabled. */
	IsSupported = 'github.copilot.chat.mcp.setup.check',

	/** Takes an npm/pip package name, validates its owner. */
	ValidatePackage = 'github.copilot.chat.mcp.setup.validatePackage',

	/** Returns the resolved MCP configuration. */
	StartFlow = 'github.copilot.chat.mcp.setup.flow',
}

type ValidatePackageResult = { state: 'ok'; publisher: string } | { state: 'error'; error: string };

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
	) { }

	private async getServerType(): Promise<AddConfigurationType | undefined> {
		const items: QuickPickInput<{ kind: AddConfigurationType } & IQuickPickItem>[] = [
			{ kind: AddConfigurationType.Stdio, label: localize('mcp.serverType.command', "Command (stdio)"), description: localize('mcp.serverType.command.description', "Run a local command that implements the MCP protocol") },
			{ kind: AddConfigurationType.SSE, label: localize('mcp.serverType.http', "HTTP (server-sent events)"), description: localize('mcp.serverType.http.description', "Connect to a remote HTTP server that implements the MCP protocol") }
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
				{ kind: AddConfigurationType.NpmPackage, label: localize('mcp.serverType.npm', "NPM Package"), description: localize('mcp.serverType.npm.description', "Install from an NPM package name") },
				{ kind: AddConfigurationType.PipPackage, label: localize('mcp.serverType.pip', "PIP Package"), description: localize('mcp.serverType.pip.description', "Install from a PIP package name") }
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

		// Split command into command and args, handling quotes
		const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g)!;
		return {
			type: 'stdio',
			command: parts[0].replace(/"/g, ''),

			args: parts.slice(1).map(arg => arg.replace(/"/g, ''))
		};
	}

	private async getSSEConfig(): Promise<IMcpConfigurationSSE | undefined> {
		const url = await this._quickInputService.input({
			title: localize('mcp.url.title', "Enter Server URL"),
			placeHolder: localize('mcp.url.placeholder', "URL of the MCP server (e.g., http://localhost:3000)"),
			ignoreFocusLost: true,
		});

		if (!url) {
			return undefined;
		}

		return {
			type: 'sse',
			url
		};
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

	private async getAssistedConfig(type: AddConfigurationType): Promise<{ name: string; config: McpConfigurationServer } | undefined> {
		const packageName = await this._quickInputService.input({
			ignoreFocusLost: true,
			title: type === AddConfigurationType.NpmPackage
				? localize('mcp.npm.title', "Enter NPM Package Name")
				: localize('mcp.pip.title', "Enter Pip Package Name"),
			placeHolder: type === AddConfigurationType.NpmPackage
				? localize('mcp.npm.placeholder', "Package name (e.g., @org/package)")
				: localize('mcp.pip.placeholder', "Package name (e.g., package-name)")
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

		this._commandService.executeCommand<ValidatePackageResult>(
			AddConfigurationCopilotCommand.ValidatePackage,
			{
				type: type === AddConfigurationType.NpmPackage ? 'npm' : 'pip',
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

		const configWithName = await this._commandService.executeCommand<McpConfigurationServer & { name: string }>(
			AddConfigurationCopilotCommand.StartFlow,
			{ name: packageName }
		);

		if (!configWithName) {
			return undefined;
		}

		const { name, ...config } = configWithName;
		return { name, config };
	}

	/** Shows the location of a server config once it's disocovered. */
	private showOnceDiscovered(name: string) {
		const store = new DisposableStore();
		store.add(autorun(reader => {
			const colls = this._mcpRegistry.collections.read(reader);
			const match = mapFindFirst(colls, collection => mapFindFirst(collection.serverDefinitions.read(reader),
				server => server.label === name ? { server, collection } : undefined));
			if (match) {
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

				store.dispose();
			}
		}));

		store.add(disposableTimeout(() => store.dispose(), 5000));
	}

	private writeToUserSetting(name: string, config: McpConfigurationServer, target: ConfigurationTarget) {
		const settings: IMcpConfiguration = { ...getConfigValueInTarget(this._configurationService.inspect<IMcpConfiguration>(mcpConfigurationSection), target) };
		settings.servers = { ...settings.servers, [name]: config };
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
		switch (serverType) {
			case AddConfigurationType.Stdio:
				serverConfig = await this.getStdioConfig();
				break;
			case AddConfigurationType.SSE:
				serverConfig = await this.getSSEConfig();
				break;
			case AddConfigurationType.NpmPackage: {
				const r = await this.getAssistedConfig(AddConfigurationType.NpmPackage);
				serverConfig = r?.config;
				suggestedName = r?.name;
				break;
			}
			case AddConfigurationType.PipPackage: {
				const r = await this.getAssistedConfig(AddConfigurationType.PipPackage);
				serverConfig = r?.config;
				suggestedName = r?.name;
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
			await this._jsonEditingService.write(writeToUriDirect, [{
				path: ['servers', serverId],
				value: serverConfig
			}], true);
		} else {
			await this.writeToUserSetting(serverId, serverConfig, target!);
		}

		this.showOnceDiscovered(serverId);
	}

	public async pickForUrlHandler(resource: URI, config: McpConfigurationServer): Promise<void> {
		const name = decodeURIComponent(basename(resource)).replace(/\.json$/, '');
		const placeHolder = localize('install.title', 'Install MCP server {0}', name);
		const pick = await this._quickInputService.pick([
			{ id: 'show', label: localize('install.show', 'Show Configuration', name) },
			{ id: 'install', label: localize('install.start', 'Install Server'), description: localize('install.description', 'Install in your user settings') },
			{ id: 'rename', label: localize('install.rename', 'Rename "{0}"', name) },
			{ id: 'cancel', label: localize('cancel', 'Cancel') },
		], { placeHolder, ignoreFocusLost: true });
		switch (pick?.id) {
			case 'show': {
				await this._editorService.openEditor({ resource });
				break;
			}
			case 'install': {
				await this.writeToUserSetting(name, config, ConfigurationTarget.USER_LOCAL);
				this._editorService.closeEditors(
					this._editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).filter(e => e.editor.resource?.toString() === resource.toString())
				);
				this.showOnceDiscovered(name);
				break;
			}
			case 'rename': {
				const newName = await this._quickInputService.input({ placeHolder: localize('install.newName', 'Enter new name'), value: name });
				if (newName) {
					return this.pickForUrlHandler(resource.with({ path: `/${encodeURIComponent(newName)}.json` }), config);
				}
				break;
			}
		}
	}
}
