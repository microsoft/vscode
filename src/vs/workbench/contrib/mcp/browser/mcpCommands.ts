/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { groupBy } from '../../../../base/common/collections.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILocalizedString, localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IMcpConfiguration, IMcpConfigurationSSE } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { spinningLoading } from '../../../../platform/theme/common/iconRegistry.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ActiveEditorContext, ResourceContextKey } from '../../../common/contextkeys.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IJSONEditingService } from '../../../services/configuration/common/jsonEditing.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { ChatMode } from '../../chat/common/constants.js';
import { TEXT_FILE_EDITOR_ID } from '../../files/common/files.js';
import { IMcpConfigurationStdio } from '../common/mcpConfiguration.js';
import { McpContextKeys } from '../common/mcpContextKeys.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { IMcpServer, IMcpService, LazyCollectionState, McpConnectionState, McpServerToolsState } from '../common/mcpTypes.js';

// acroynms do not get localized
const category: ILocalizedString = {
	original: 'MCP',
	value: 'MCP',
};

export class ListMcpServerCommand extends Action2 {
	public static readonly id = 'workbench.mcp.listServer';
	constructor() {
		super({
			id: ListMcpServerCommand.id,
			title: localize2('mcp.list', 'List Servers'),
			icon: Codicon.server,
			category,
			f1: true,
			menu: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.or(McpContextKeys.hasUnknownTools, McpContextKeys.hasServersWithErrors),
					ChatContextKeys.chatMode.isEqualTo(ChatMode.Agent)
				),
				id: MenuId.ChatInputAttachmentToolbar,
				group: 'navigation',
				order: 0
			},
		});
	}

	override async run(accessor: ServicesAccessor) {
		const mcpService = accessor.get(IMcpService);
		const commandService = accessor.get(ICommandService);
		const quickInput = accessor.get(IQuickInputService);

		type ItemType = { id: string } & IQuickPickItem;

		const store = new DisposableStore();
		const pick = quickInput.createQuickPick<ItemType>({ useSeparators: true });
		pick.title = localize('mcp.selectServer', 'Select an MCP Server');

		store.add(pick);
		store.add(autorun(reader => {
			const servers = groupBy(mcpService.servers.read(reader).slice().sort((a, b) => (a.collection.presentation?.order || 0) - (b.collection.presentation?.order || 0)), s => s.collection.id);
			pick.items = Object.values(servers).flatMap(servers => {
				return [
					{ type: 'separator', label: servers[0].collection.label, id: servers[0].collection.id },
					...servers.map(server => ({
						id: server.definition.id,
						label: server.definition.label,
						description: McpConnectionState.toString(server.connectionState.read(reader)),
					})),
				];
			});
		}));


		const picked = await new Promise<ItemType | undefined>(resolve => {
			store.add(pick.onDidAccept(() => {
				resolve(pick.activeItems[0]);
			}));
			store.add(pick.onDidHide(() => {
				resolve(undefined);
			}));
			pick.show();
		});

		store.dispose();

		if (picked) {
			commandService.executeCommand(McpServerOptionsCommand.id, picked.id);
		}
	}
}


export class McpServerOptionsCommand extends Action2 {

	static readonly id = 'workbench.mcp.serverOptions';

	constructor() {
		super({
			id: McpServerOptionsCommand.id,
			title: localize2('mcp.options', 'Server Options'),
			category,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, id: string): Promise<void> {
		const mcpService = accessor.get(IMcpService);
		const quickInputService = accessor.get(IQuickInputService);
		const server = mcpService.servers.get().find(s => s.definition.id === id);
		if (!server) {
			return;
		}

		interface ActionItem extends IQuickPickItem {
			action: 'start' | 'stop' | 'restart' | 'showOutput';
		}

		const items: ActionItem[] = [];
		const serverState = server.connectionState.get();

		// Only show start when server is stopped or in error state
		if (McpConnectionState.canBeStarted(serverState.state)) {
			items.push({
				label: localize2('mcp.start', 'Start Server').value,
				action: 'start'
			});
		} else {
			items.push({
				label: localize2('mcp.stop', 'Stop Server').value,
				action: 'stop'
			});
			items.push({
				label: localize2('mcp.restart', 'Restart Server').value,
				action: 'restart'
			});
		}

		items.push({
			label: localize2('mcp.showOutput', 'Show Output').value,
			action: 'showOutput'
		});

		const pick = await quickInputService.pick(items, {
			title: server.definition.label,
			placeHolder: localize('mcp.selectAction', 'Select Server Action')
		});

		if (!pick) {
			return;
		}

		switch (pick.action) {
			case 'start':
				await server.start(true);
				server.showOutput();
				break;
			case 'stop':
				await server.stop();
				break;
			case 'restart':
				await server.stop();
				await server.start(true);
				break;
			case 'showOutput':
				server.showOutput();
				break;
		}
	}
}


export class MCPServerActionRendering extends Disposable implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.mcp.discovery';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IMcpService mcpService: IMcpService,
		@IInstantiationService instaService: IInstantiationService,
		@ICommandService commandService: ICommandService,
	) {
		super();

		const enum DisplayedState {
			None,
			NewTools,
			Error,
			Refreshing,
		}



		const displayedState = derived((reader) => {
			const servers = mcpService.servers.read(reader);
			const serversPerState: IMcpServer[][] = [];
			for (const server of servers) {
				let thisState = DisplayedState.None;
				switch (server.toolsState.read(reader)) {
					case McpServerToolsState.Unknown:
						if (server.trusted.read(reader) === false) {
							thisState = DisplayedState.None;
						} else {
							thisState = server.connectionState.read(reader).state === McpConnectionState.Kind.Error ? DisplayedState.Error : DisplayedState.NewTools;
						}
						break;
					case McpServerToolsState.RefreshingFromUnknown:
						thisState = DisplayedState.Refreshing;
						break;
					default:
						thisState = server.connectionState.read(reader).state === McpConnectionState.Kind.Error ? DisplayedState.Error : DisplayedState.None;
						break;
				}

				serversPerState[thisState] ??= [];
				serversPerState[thisState].push(server);
			}

			const unknownServerStates = mcpService.lazyCollectionState.read(reader);
			if (unknownServerStates === LazyCollectionState.LoadingUnknown) {
				serversPerState[DisplayedState.Refreshing] ??= [];
			} else if (unknownServerStates === LazyCollectionState.HasUnknown) {
				serversPerState[DisplayedState.NewTools] ??= [];
			}

			const maxState = (serversPerState.length - 1) as DisplayedState;
			return { state: maxState, servers: serversPerState[maxState] || [] };
		});

		this._store.add(actionViewItemService.register(MenuId.ChatInputAttachmentToolbar, ListMcpServerCommand.id, (action, options) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}

			return instaService.createInstance(class extends MenuEntryActionViewItem {

				override render(container: HTMLElement): void {

					super.render(container);
					container.classList.add('chat-mcp');

					const action = h('button.chat-mcp-action', [h('span@icon')]);

					this._register(autorun(r => {
						const { state } = displayedState.read(r);
						const { root, icon } = action;
						this.updateTooltip();
						container.classList.toggle('chat-mcp-has-action', state !== DisplayedState.None);

						if (!root.parentElement) {
							container.appendChild(root);
						}

						root.ariaLabel = this.getLabelForState(displayedState.read(r));
						root.className = 'chat-mcp-action';
						icon.className = '';
						if (state === DisplayedState.NewTools) {
							root.classList.add('chat-mcp-action-new');
							icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.refresh));
						} else if (state === DisplayedState.Error) {
							root.classList.add('chat-mcp-action-error');
							icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
						} else if (state === DisplayedState.Refreshing) {
							root.classList.add('chat-mcp-action-refreshing');
							icon.classList.add(...ThemeIcon.asClassNameArray(spinningLoading));
						} else {
							root.remove();
						}
					}));
				}

				override async onClick(e: MouseEvent): Promise<void> {
					e.preventDefault();
					e.stopPropagation();

					const { state, servers } = displayedState.get();
					if (state === DisplayedState.NewTools) {
						servers.forEach(server => server.start());
						mcpService.activateCollections();
					} else if (state === DisplayedState.Refreshing) {
						servers.at(-1)?.showOutput();
					} else if (state === DisplayedState.Error) {
						const server = servers.at(-1);
						if (server) {
							commandService.executeCommand(McpServerOptionsCommand.id, server.definition.id);
						}
					} else {
						commandService.executeCommand(ListMcpServerCommand.id);
					}
				}

				protected override getTooltip(): string {
					return this.getLabelForState() || super.getTooltip();
				}

				private getLabelForState({ state, servers } = displayedState.get()) {
					if (state === DisplayedState.NewTools) {
						return localize('mcp.newTools', "New tools available ({0})", servers.length || 1);
					} else if (state === DisplayedState.Error) {
						return localize('mcp.toolError', "Error loading {0} tool(s)", servers.length || 1);
					} else if (state === DisplayedState.Refreshing) {
						return localize('mcp.toolRefresh', "Discovering tools...");
					} else {
						return null;
					}
				}


			}, action, { ...options, keybindingNotRenderedWithLabel: true });

		}, Event.fromObservable(displayedState)));
	}
}

export class ResetMcpTrustCommand extends Action2 {
	static readonly ID = 'workbench.mcp.resetTrust';

	constructor() {
		super({
			id: ResetMcpTrustCommand.ID,
			title: localize2('mcp.resetTrust', "Reset Trust"),
			category,
			f1: true,
			precondition: McpContextKeys.toolsCount.greater(0),
		});
	}

	run(accessor: ServicesAccessor): void {
		const mcpService = accessor.get(IMcpRegistry);
		mcpService.resetTrust();
	}
}


export class ResetMcpCachedTools extends Action2 {
	static readonly ID = 'workbench.mcp.resetCachedTools';

	constructor() {
		super({
			id: ResetMcpCachedTools.ID,
			title: localize2('mcp.resetCachedTools', "Reset Cached Tools"),
			category,
			f1: true,
			precondition: McpContextKeys.toolsCount.greater(0),
		});
	}

	run(accessor: ServicesAccessor): void {
		const mcpService = accessor.get(IMcpService);
		mcpService.resetCaches();
	}
}

export class AddConfigurationAction extends Action2 {
	static readonly ID = 'workbench.mcp.addConfiguration';

	constructor() {
		super({
			id: AddConfigurationAction.ID,
			title: localize2('mcp.addConfiguration', "Add Server..."),
			metadata: {
				description: localize2('mcp.addConfiguration.description', "Installs a new Model Context protocol to the mcp.json settings"),
			},
			category,
			f1: true,
			menu: {
				id: MenuId.EditorContent,
				when: ContextKeyExpr.and(
					ContextKeyExpr.regex(ResourceContextKey.Path.key, /\.vscode[/\\]mcp\.json$/),
					ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID)
				)
			}
		});
	}

	private async getServerType(quickInputService: IQuickInputService): Promise<{ id: 'stdio' | 'sse' } | undefined> {
		return quickInputService.pick([
			{ id: 'stdio', label: localize('mcp.serverType.command', "Command (stdio)"), description: localize('mcp.serverType.command.description', "Run a local command that implements the MCP protocol") },
			{ id: 'sse', label: localize('mcp.serverType.http', "HTTP (server-sent events)"), description: localize('mcp.serverType.http.description', "Connect to a remote HTTP server that implements the MCP protocol") }
		], {
			title: localize('mcp.serverType.title', "Select Server Type"),
			placeHolder: localize('mcp.serverType.placeholder', "Choose the type of MCP server to add")
		}) as Promise<{ id: 'stdio' | 'sse' } | undefined>;
	}

	private async getStdioConfig(quickInputService: IQuickInputService): Promise<IMcpConfigurationStdio | undefined> {
		const command = await quickInputService.input({
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

	private async getSSEConfig(quickInputService: IQuickInputService): Promise<IMcpConfigurationSSE | undefined> {
		const url = await quickInputService.input({
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

	private async getServerId(quickInputService: IQuickInputService): Promise<string | undefined> {
		const suggestedId = `my-mcp-server-${generateUuid().split('-')[0]}`;
		const id = await quickInputService.input({
			title: localize('mcp.serverId.title', "Enter Server ID"),
			placeHolder: localize('mcp.serverId.placeholder', "Unique identifier for this server"),
			value: suggestedId,
			ignoreFocusLost: true,
		});

		return id;
	}

	private async getConfigurationTarget(quickInputService: IQuickInputService, workspace: IWorkspace, isInRemote: boolean): Promise<ConfigurationTarget | undefined> {
		const options: (IQuickPickItem & { target: ConfigurationTarget })[] = [
			{ target: ConfigurationTarget.USER, label: localize('mcp.target.user', "User Settings"), description: localize('mcp.target.user.description', "Available in all workspaces") }
		];

		if (isInRemote) {
			options.push({ target: ConfigurationTarget.USER_REMOTE, label: localize('mcp.target.remote', "Remote Settings"), description: localize('mcp.target..remote.description', "Available on this remote machine") });
		}

		if (workspace.folders.length > 0) {
			options.push({ target: ConfigurationTarget.WORKSPACE, label: localize('mcp.target.workspace', "Workspace Settings"), description: localize('mcp.target.workspace.description', "Available in this workspace") });
		}

		if (options.length === 1) {
			return options[0].target;
		}


		const targetPick = await quickInputService.pick(options, {
			title: localize('mcp.target.title', "Choose where to save the configuration"),
		});

		return targetPick?.target;
	}

	async run(accessor: ServicesAccessor, configUri?: string): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const configurationService = accessor.get(IConfigurationService);
		const jsonEditingService = accessor.get(IJSONEditingService);
		const workspaceService = accessor.get(IWorkspaceContextService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);

		// Step 1: Choose server type
		const serverType = await this.getServerType(quickInputService);
		if (!serverType) {
			return;
		}

		// Step 2: Get server details based on type
		const serverConfig = await (serverType.id === 'stdio'
			? this.getStdioConfig(quickInputService)
			: this.getSSEConfig(quickInputService));

		if (!serverConfig) {
			return;
		}

		// Step 3: Get server ID
		const serverId = await this.getServerId(quickInputService);
		if (!serverId) {
			return;
		}

		// Step 4: Choose configuration target if no configUri provided
		let target: ConfigurationTarget | undefined;
		const workspace = workspaceService.getWorkspace();
		if (!configUri) {
			target = await this.getConfigurationTarget(quickInputService, workspace, !!environmentService.remoteAuthority);
			if (!target) {
				return;
			}
		}

		// Step 5: Update configuration
		const writeToUriDirect = configUri
			? URI.parse(configUri)
			: target === ConfigurationTarget.WORKSPACE && workspace.folders.length === 1
				? URI.joinPath(workspace.folders[0].uri, '.vscode', 'mcp.json')
				: undefined;

		if (writeToUriDirect) {
			await jsonEditingService.write(writeToUriDirect, [{
				path: ['servers', serverId],
				value: serverConfig
			}], true);
		} else {
			const settings: IMcpConfiguration = { ...getConfigValueInTarget(configurationService.inspect<IMcpConfiguration>('mcp'), target!) };
			settings.servers ??= {};
			settings.servers[serverId] = serverConfig;
			await configurationService.updateValue('mcp', settings, target!);
		}
	}
}
