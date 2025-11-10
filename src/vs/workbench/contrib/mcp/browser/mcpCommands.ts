/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, disposableWindowInterval, EventType } from '../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { IManagedHoverTooltipHTMLElement } from '../../../../base/browser/ui/hover/hover.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { findLast } from '../../../../base/common/arraysFind.js';
import { assertNever } from '../../../../base/common/assert.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { groupBy } from '../../../../base/common/collections.js';
import { Event } from '../../../../base/common/event.js';
import { markdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedObservableWithCache, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { ILocalizedString, localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuId, MenuItemAction, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { mcpAutoStartConfig, McpAutoStartValue } from '../../../../platform/mcp/common/mcpManagement.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { spinningLoading } from '../../../../platform/theme/common/iconRegistry.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from '../../../browser/actions/workspaceCommands.js';
import { ActiveEditorContext, RemoteNameContext, ResourceContextKey, WorkbenchStateContext, WorkspaceFolderCountContext } from '../../../common/contextkeys.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IAccountQuery, IAuthenticationQueryService } from '../../../services/authentication/common/authenticationQuery.js';
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from '../../../services/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IRemoteUserDataProfilesService } from '../../../services/userDataProfile/common/remoteUserDataProfiles.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { CHAT_CONFIG_MENU_ID } from '../../chat/browser/actions/chatActions.js';
import { ChatViewId, IChatWidgetService } from '../../chat/browser/chat.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { IChatElicitationRequest, IChatToolInvocation } from '../../chat/common/chatService.js';
import { ChatModeKind } from '../../chat/common/constants.js';
import { ILanguageModelsService } from '../../chat/common/languageModels.js';
import { ILanguageModelToolsService } from '../../chat/common/languageModelToolsService.js';
import { VIEW_CONTAINER } from '../../extensions/browser/extensions.contribution.js';
import { extensionsFilterSubMenu, IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { TEXT_FILE_EDITOR_ID } from '../../files/common/files.js';
import { McpCommandIds } from '../common/mcpCommandIds.js';
import { McpContextKeys } from '../common/mcpContextKeys.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { HasInstalledMcpServersContext, IMcpSamplingService, IMcpServer, IMcpServerStartOpts, IMcpService, InstalledMcpServersViewId, LazyCollectionState, McpCapability, McpCollectionDefinition, McpConnectionState, McpDefinitionReference, mcpPromptPrefix, McpServerCacheState, McpStartServerInteraction } from '../common/mcpTypes.js';
import { McpAddConfigurationCommand } from './mcpCommandsAddConfiguration.js';
import { McpResourceQuickAccess, McpResourceQuickPick } from './mcpResourceQuickAccess.js';
import './media/mcpServerAction.css';
import { openPanelChatAndGetWidget } from './openPanelChatAndGetWidget.js';

// acroynms do not get localized
const category: ILocalizedString = {
	original: 'MCP',
	value: 'MCP',
};

export class ListMcpServerCommand extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.ListServer,
			title: localize2('mcp.list', 'List Servers'),
			icon: Codicon.server,
			category,
			f1: true,
			precondition: ChatContextKeys.Setup.hidden.negate(),
			menu: [{
				when: ContextKeyExpr.and(
					ContextKeyExpr.or(
						ContextKeyExpr.and(ContextKeyExpr.equals(`config.${mcpAutoStartConfig}`, McpAutoStartValue.Never), McpContextKeys.hasUnknownTools),
						McpContextKeys.hasServersWithErrors,
					),
					ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
					ChatContextKeys.lockedToCodingAgent.negate(),
					ChatContextKeys.Setup.hidden.negate(),
				),
				id: MenuId.ChatInput,
				group: 'navigation',
				order: 101,
			}],
		});
	}

	override async run(accessor: ServicesAccessor) {
		const mcpService = accessor.get(IMcpService);
		const commandService = accessor.get(ICommandService);
		const quickInput = accessor.get(IQuickInputService);

		type ItemType = { id: string } & IQuickPickItem;

		const store = new DisposableStore();
		const pick = quickInput.createQuickPick<ItemType>({ useSeparators: true });
		pick.placeholder = localize('mcp.selectServer', 'Select an MCP Server');

		mcpService.activateCollections();

		store.add(pick);

		store.add(autorun(reader => {
			const servers = groupBy(mcpService.servers.read(reader).slice().sort((a, b) => (a.collection.presentation?.order || 0) - (b.collection.presentation?.order || 0)), s => s.collection.id);
			const firstRun = pick.items.length === 0;
			pick.items = [
				{ id: '$add', label: localize('mcp.addServer', 'Add Server'), description: localize('mcp.addServer.description', 'Add a new server configuration'), alwaysShow: true, iconClass: ThemeIcon.asClassName(Codicon.add) },
				...Object.values(servers).filter(s => s!.length).flatMap((servers): (ItemType | IQuickPickSeparator)[] => [
					{ type: 'separator', label: servers![0].collection.label, id: servers![0].collection.id },
					...servers!.map(server => ({
						id: server.definition.id,
						label: server.definition.label,
						description: McpConnectionState.toString(server.connectionState.read(reader)),
					})),
				]),
			];

			if (firstRun && pick.items.length > 3) {
				pick.activeItems = pick.items.slice(2, 3) as ItemType[]; // select the first server by default
			}
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

		if (!picked) {
			// no-op
		} else if (picked.id === '$add') {
			commandService.executeCommand(McpCommandIds.AddConfiguration);
		} else {
			commandService.executeCommand(McpCommandIds.ServerOptions, picked.id);
		}
	}
}

interface ActionItem extends IQuickPickItem {
	action: 'start' | 'stop' | 'restart' | 'showOutput' | 'config' | 'configSampling' | 'samplingLog' | 'resources';
}

interface AuthActionItem extends IQuickPickItem {
	action: 'disconnect' | 'signout';
	accountQuery: IAccountQuery;
}

export class McpConfirmationServerOptionsCommand extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.ServerOptionsInConfirmation,
			title: localize2('mcp.options', 'Server Options'),
			category,
			icon: Codicon.settingsGear,
			f1: false,
			menu: [{
				id: MenuId.ChatConfirmationMenu,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('chatConfirmationPartSource', 'mcp'),
					ContextKeyExpr.or(
						ContextKeyExpr.equals('chatConfirmationPartType', 'chatToolConfirmation'),
						ContextKeyExpr.equals('chatConfirmationPartType', 'elicitation'),
					),
				),
				group: 'navigation'
			}],
		});
	}

	override async run(accessor: ServicesAccessor, arg: IChatToolInvocation | IChatElicitationRequest): Promise<void> {
		const toolsService = accessor.get(ILanguageModelToolsService);
		if (arg.kind === 'toolInvocation') {
			const tool = toolsService.getTool(arg.toolId);
			if (tool?.source.type === 'mcp') {
				accessor.get(ICommandService).executeCommand(McpCommandIds.ServerOptions, tool.source.definitionId);
			}
		} else if (arg.kind === 'elicitation') {
			if (arg.source?.type === 'mcp') {
				accessor.get(ICommandService).executeCommand(McpCommandIds.ServerOptions, arg.source.definitionId);
			}
		} else {
			assertNever(arg);
		}
	}
}

export class McpServerOptionsCommand extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.ServerOptions,
			title: localize2('mcp.options', 'Server Options'),
			category,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, id: string): Promise<void> {
		const mcpService = accessor.get(IMcpService);
		const quickInputService = accessor.get(IQuickInputService);
		const mcpRegistry = accessor.get(IMcpRegistry);
		const editorService = accessor.get(IEditorService);
		const commandService = accessor.get(ICommandService);
		const samplingService = accessor.get(IMcpSamplingService);
		const authenticationQueryService = accessor.get(IAuthenticationQueryService);
		const authenticationService = accessor.get(IAuthenticationService);
		const server = mcpService.servers.get().find(s => s.definition.id === id);
		if (!server) {
			return;
		}

		const collection = mcpRegistry.collections.get().find(c => c.id === server.collection.id);
		const serverDefinition = collection?.serverDefinitions.get().find(s => s.id === server.definition.id);

		const items: (ActionItem | AuthActionItem | IQuickPickSeparator)[] = [];
		const serverState = server.connectionState.get();

		items.push({ type: 'separator', label: localize('mcp.actions.status', 'Status') });

		// Only show start when server is stopped or in error state
		if (McpConnectionState.canBeStarted(serverState.state)) {
			items.push({
				label: localize('mcp.start', 'Start Server'),
				action: 'start'
			});
		} else {
			items.push({
				label: localize('mcp.stop', 'Stop Server'),
				action: 'stop'
			});
			items.push({
				label: localize('mcp.restart', 'Restart Server'),
				action: 'restart'
			});
		}

		items.push(...this._getAuthActions(authenticationQueryService, server.definition.id));

		const configTarget = serverDefinition?.presentation?.origin || collection?.presentation?.origin;
		if (configTarget) {
			items.push({
				label: localize('mcp.config', 'Show Configuration'),
				action: 'config',
			});
		}

		items.push({
			label: localize('mcp.showOutput', 'Show Output'),
			action: 'showOutput'
		});

		items.push(
			{ type: 'separator', label: localize('mcp.actions.sampling', 'Sampling') },
			{
				label: localize('mcp.configAccess', 'Configure Model Access'),
				description: localize('mcp.showOutput.description', 'Set the models the server can use via MCP sampling'),
				action: 'configSampling'
			},
		);


		if (samplingService.hasLogs(server)) {
			items.push({
				label: localize('mcp.samplingLog', 'Show Sampling Requests'),
				description: localize('mcp.samplingLog.description', 'Show the sampling requests for this server'),
				action: 'samplingLog',
			});
		}

		const capabilities = server.capabilities.get();
		if (capabilities === undefined || (capabilities & McpCapability.Resources)) {
			items.push({ type: 'separator', label: localize('mcp.actions.resources', 'Resources') });
			items.push({
				label: localize('mcp.resources', 'Browse Resources'),
				action: 'resources',
			});
		}

		const pick = await quickInputService.pick(items, {
			placeHolder: localize('mcp.selectAction', 'Select action for \'{0}\'', server.definition.label),
		});

		if (!pick) {
			return;
		}

		switch (pick.action) {
			case 'start':
				await server.start({ promptType: 'all-untrusted' });
				server.showOutput();
				break;
			case 'stop':
				await server.stop();
				break;
			case 'restart':
				await server.stop();
				await server.start({ promptType: 'all-untrusted' });
				break;
			case 'disconnect':
				await server.stop();
				await this._handleAuth(authenticationService, pick.accountQuery, server.definition, false);
				break;
			case 'signout':
				await server.stop();
				await this._handleAuth(authenticationService, pick.accountQuery, server.definition, true);
				break;
			case 'showOutput':
				server.showOutput();
				break;
			case 'config':
				editorService.openEditor({
					resource: URI.isUri(configTarget) ? configTarget : configTarget!.uri,
					options: { selection: URI.isUri(configTarget) ? undefined : configTarget!.range }
				});
				break;
			case 'configSampling':
				return commandService.executeCommand(McpCommandIds.ConfigureSamplingModels, server);
			case 'resources':
				return commandService.executeCommand(McpCommandIds.BrowseResources, server);
			case 'samplingLog':
				editorService.openEditor({
					resource: undefined,
					contents: samplingService.getLogText(server),
					label: localize('mcp.samplingLog.title', 'MCP Sampling: {0}', server.definition.label),
				});
				break;
			default:
				assertNever(pick);
		}
	}

	private _getAuthActions(
		authenticationQueryService: IAuthenticationQueryService,
		serverId: string
	): AuthActionItem[] {
		const result: AuthActionItem[] = [];
		// Really, this should only ever have one entry.
		for (const [providerId, accountName] of authenticationQueryService.mcpServer(serverId).getAllAccountPreferences()) {

			const accountQuery = authenticationQueryService.provider(providerId).account(accountName);
			if (!accountQuery.mcpServer(serverId).isAccessAllowed()) {
				continue; // skip accounts that are not allowed
			}
			// If there are multiple allowed servers/extensions, other things are using this provider
			// so we show a disconnect action, otherwise we show a sign out action.
			if (accountQuery.entities().getEntityCount().total > 1) {
				result.push({
					action: 'disconnect',
					label: localize('mcp.disconnect', 'Disconnect Account'),
					description: `(${accountName})`,
					accountQuery
				});
			} else {
				result.push({
					action: 'signout',
					label: localize('mcp.signOut', 'Sign Out'),
					description: `(${accountName})`,
					accountQuery
				});
			}
		}
		return result;
	}

	private async _handleAuth(
		authenticationService: IAuthenticationService,
		accountQuery: IAccountQuery,
		definition: McpDefinitionReference,
		signOut: boolean
	) {
		const { providerId, accountName } = accountQuery;
		accountQuery.mcpServer(definition.id).setAccessAllowed(false, definition.label);
		if (signOut) {
			const accounts = await authenticationService.getAccounts(providerId);
			const account = accounts.find(a => a.label === accountName);
			if (account) {
				const sessions = await authenticationService.getSessions(providerId, undefined, { account });
				for (const session of sessions) {
					await authenticationService.removeSession(providerId, session.id);
				}
			}
		}
	}
}

export class MCPServerActionRendering extends Disposable implements IWorkbenchContribution {
	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IMcpService mcpService: IMcpService,
		@IInstantiationService instaService: IInstantiationService,
		@ICommandService commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		const hoverIsOpen = observableValue(this, false);
		const config = observableConfigValue(mcpAutoStartConfig, McpAutoStartValue.NewAndOutdated, configurationService);

		const enum DisplayedState {
			None,
			NewTools,
			Error,
			Refreshing,
		}

		type DisplayedStateT = {
			state: DisplayedState;
			servers: (IMcpServer | McpCollectionDefinition)[];
		};

		function isServer(s: IMcpServer | McpCollectionDefinition): s is IMcpServer {
			return typeof (s as IMcpServer).start === 'function';
		}

		const displayedStateCurrent = derived((reader): DisplayedStateT => {
			const servers = mcpService.servers.read(reader);
			const serversPerState: (IMcpServer | McpCollectionDefinition)[][] = [];
			for (const server of servers) {
				let thisState = DisplayedState.None;
				switch (server.cacheState.read(reader)) {
					case McpServerCacheState.Unknown:
					case McpServerCacheState.Outdated:
						thisState = server.connectionState.read(reader).state === McpConnectionState.Kind.Error ? DisplayedState.Error : DisplayedState.NewTools;
						break;
					case McpServerCacheState.RefreshingFromUnknown:
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
			if (unknownServerStates.state === LazyCollectionState.LoadingUnknown) {
				serversPerState[DisplayedState.Refreshing] ??= [];
				serversPerState[DisplayedState.Refreshing].push(...unknownServerStates.collections);
			} else if (unknownServerStates.state === LazyCollectionState.HasUnknown) {
				serversPerState[DisplayedState.NewTools] ??= [];
				serversPerState[DisplayedState.NewTools].push(...unknownServerStates.collections);
			}

			let maxState = (serversPerState.length - 1) as DisplayedState;
			if (maxState === DisplayedState.NewTools && config.read(reader) !== McpAutoStartValue.Never) {
				maxState = DisplayedState.None;
			}

			return { state: maxState, servers: serversPerState[maxState] || [] };
		});

		// avoid hiding the hover if a state changes while it's open:
		const displayedState = derivedObservableWithCache<DisplayedStateT>(this, (reader, last) => {
			if (last && hoverIsOpen.read(reader)) {
				return last;
			} else {
				return displayedStateCurrent.read(reader);
			}
		});

		const actionItemState = displayedState.map(s => s.state);

		this._store.add(actionViewItemService.register(MenuId.ChatInput, McpCommandIds.ListServer, (action, options) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}

			return instaService.createInstance(class extends MenuEntryActionViewItem {

				override render(container: HTMLElement): void {

					super.render(container);
					container.classList.add('chat-mcp');
					container.style.position = 'relative';

					const stateIndicator = container.appendChild($('.chat-mcp-state-indicator'));
					stateIndicator.style.display = 'none';

					this._register(autorun(r => {
						const displayed = displayedState.read(r);
						const { state } = displayed;
						this.updateTooltip();


						stateIndicator.ariaLabel = this.getLabelForState(displayed);
						stateIndicator.className = 'chat-mcp-state-indicator';
						if (state === DisplayedState.NewTools) {
							stateIndicator.style.display = 'block';
							stateIndicator.classList.add('chat-mcp-state-new', ...ThemeIcon.asClassNameArray(Codicon.refresh));
						} else if (state === DisplayedState.Error) {
							stateIndicator.style.display = 'block';
							stateIndicator.classList.add('chat-mcp-state-error', ...ThemeIcon.asClassNameArray(Codicon.warning));
						} else if (state === DisplayedState.Refreshing) {
							stateIndicator.style.display = 'block';
							stateIndicator.classList.add('chat-mcp-state-refreshing', ...ThemeIcon.asClassNameArray(spinningLoading));
						} else {
							stateIndicator.style.display = 'none';
						}
					}));
				}

				override async onClick(e: MouseEvent): Promise<void> {
					e.preventDefault();
					e.stopPropagation();

					const { state, servers } = displayedStateCurrent.get();
					if (state === DisplayedState.NewTools) {
						const interaction = new McpStartServerInteraction();
						servers.filter(isServer).forEach(server => server.stop().then(() => server.start({ interaction })));
						mcpService.activateCollections();
					} else if (state === DisplayedState.Refreshing) {
						findLast(servers, isServer)?.showOutput();
					} else if (state === DisplayedState.Error) {
						const server = findLast(servers, isServer);
						if (server) {
							await server.showOutput(true);
							commandService.executeCommand(McpCommandIds.ServerOptions, server.definition.id);
						}
					} else {
						commandService.executeCommand(McpCommandIds.ListServer);
					}
				}

				protected override getTooltip(): string {
					return this.getLabelForState() || super.getTooltip();
				}

				protected override getHoverContents({ state, servers } = displayedStateCurrent.get()): string | undefined | IManagedHoverTooltipHTMLElement {
					const link = (s: IMcpServer) => markdownCommandLink({
						title: s.definition.label,
						id: McpCommandIds.ServerOptions,
						arguments: [s.definition.id],
					});

					const single = servers.length === 1;
					const names = servers.map(s => isServer(s) ? link(s) : '`' + s.label + '`').map(l => single ? l : `- ${l}`).join('\n');
					let markdown: MarkdownString;
					if (state === DisplayedState.NewTools) {
						markdown = new MarkdownString(single
							? localize('mcp.newTools.md.single', "MCP server {0} has been updated and may have new tools available.", names)
							: localize('mcp.newTools.md.multi', "MCP servers have been updated and may have new tools available:\n\n{0}", names)
						);
					} else if (state === DisplayedState.Error) {
						markdown = new MarkdownString(single
							? localize('mcp.err.md.single', "MCP server {0} was unable to start successfully.", names)
							: localize('mcp.err.md.multi', "Multiple MCP servers were unable to start successfully:\n\n{0}", names)
						);
					} else {
						return this.getLabelForState() || undefined;
					}

					return {
						element: (token): HTMLElement => {
							hoverIsOpen.set(true, undefined);

							const store = new DisposableStore();
							store.add(toDisposable(() => hoverIsOpen.set(false, undefined)));
							store.add(token.onCancellationRequested(() => {
								store.dispose();
							}));

							// todo@connor4312/@benibenj: workaround for #257923
							store.add(disposableWindowInterval(mainWindow, () => {
								if (!container.isConnected) {
									store.dispose();
								}
							}, 2000));

							const container = $('div.mcp-hover-contents');

							// Render markdown content
							markdown.isTrusted = true;
							const markdownResult = store.add(renderMarkdown(markdown));
							container.appendChild(markdownResult.element);

							// Add divider
							const divider = $('hr.mcp-hover-divider');
							container.appendChild(divider);

							// Add checkbox for mcpAutoStartConfig setting
							const checkboxContainer = $('div.mcp-hover-setting');
							const settingLabelStr = localize('mcp.autoStart', "Automatically start MCP servers when sending a chat message");

							const checkbox = store.add(new Checkbox(
								settingLabelStr,
								config.get() !== McpAutoStartValue.Never,
								{ ...defaultCheckboxStyles }
							));

							checkboxContainer.appendChild(checkbox.domNode);

							// Add label next to checkbox
							const settingLabel = $('span.mcp-hover-setting-label', undefined, settingLabelStr);
							checkboxContainer.appendChild(settingLabel);

							const onChange = () => {
								const newValue = checkbox.checked ? McpAutoStartValue.NewAndOutdated : McpAutoStartValue.Never;
								configurationService.updateValue(mcpAutoStartConfig, newValue);
							};

							store.add(checkbox.onChange(onChange));

							store.add(addDisposableListener(settingLabel, EventType.CLICK, () => {
								checkbox.checked = !checkbox.checked;
								onChange();
							}));
							container.appendChild(checkboxContainer);

							return container;
						},
					};
				}

				private getLabelForState({ state, servers } = displayedStateCurrent.get()) {
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

		}, Event.fromObservableLight(actionItemState)));
	}
}

export class ResetMcpTrustCommand extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.ResetTrust,
			title: localize2('mcp.resetTrust', "Reset Trust"),
			category,
			f1: true,
			precondition: ContextKeyExpr.and(McpContextKeys.toolsCount.greater(0), ChatContextKeys.Setup.hidden.negate()),
		});
	}

	run(accessor: ServicesAccessor): void {
		const mcpService = accessor.get(IMcpService);
		mcpService.resetTrust();
	}
}


export class ResetMcpCachedTools extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.ResetCachedTools,
			title: localize2('mcp.resetCachedTools', "Reset Cached Tools"),
			category,
			f1: true,
			precondition: ContextKeyExpr.and(McpContextKeys.toolsCount.greater(0), ChatContextKeys.Setup.hidden.negate()),
		});
	}

	run(accessor: ServicesAccessor): void {
		const mcpService = accessor.get(IMcpService);
		mcpService.resetCaches();
	}
}

export class AddConfigurationAction extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.AddConfiguration,
			title: localize2('mcp.addConfiguration', "Add Server..."),
			metadata: {
				description: localize2('mcp.addConfiguration.description', "Installs a new Model Context protocol to the mcp.json settings"),
			},
			category,
			f1: true,
			precondition: ChatContextKeys.Setup.hidden.negate(),
			menu: {
				id: MenuId.EditorContent,
				when: ContextKeyExpr.and(
					ContextKeyExpr.regex(ResourceContextKey.Path.key, /\.vscode[/\\]mcp\.json$/),
					ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID),
					ChatContextKeys.Setup.hidden.negate(),
				)
			}
		});
	}

	async run(accessor: ServicesAccessor, configUri?: string): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const workspaceService = accessor.get(IWorkspaceContextService);
		const target = configUri ? workspaceService.getWorkspaceFolder(URI.parse(configUri)) : undefined;
		return instantiationService.createInstance(McpAddConfigurationCommand, target ?? undefined).run();
	}
}


export class RemoveStoredInput extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.RemoveStoredInput,
			title: localize2('mcp.resetCachedTools', "Reset Cached Tools"),
			category,
			f1: false,
		});
	}

	run(accessor: ServicesAccessor, scope: StorageScope, id?: string): void {
		accessor.get(IMcpRegistry).clearSavedInputs(scope, id);
	}
}

export class EditStoredInput extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.EditStoredInput,
			title: localize2('mcp.editStoredInput', "Edit Stored Input"),
			category,
			f1: false,
		});
	}

	run(accessor: ServicesAccessor, inputId: string, uri: URI | undefined, configSection: string, target: ConfigurationTarget): void {
		const workspaceFolder = uri && accessor.get(IWorkspaceContextService).getWorkspaceFolder(uri);
		accessor.get(IMcpRegistry).editSavedInput(inputId, workspaceFolder || undefined, configSection, target);
	}
}

export class ShowConfiguration extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.ShowConfiguration,
			title: localize2('mcp.command.showConfiguration', "Show Configuration"),
			category,
			f1: false,
		});
	}

	run(accessor: ServicesAccessor, collectionId: string, serverId: string): void {
		const collection = accessor.get(IMcpRegistry).collections.get().find(c => c.id === collectionId);
		if (!collection) {
			return;
		}

		const server = collection?.serverDefinitions.get().find(s => s.id === serverId);
		const editorService = accessor.get(IEditorService);
		if (server?.presentation?.origin) {
			editorService.openEditor({
				resource: server.presentation.origin.uri,
				options: { selection: server.presentation.origin.range }
			});
		} else if (collection.presentation?.origin) {
			editorService.openEditor({
				resource: collection.presentation.origin,
			});
		}
	}
}

export class ShowOutput extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.ShowOutput,
			title: localize2('mcp.command.showOutput', "Show Output"),
			category,
			f1: false,
		});
	}

	run(accessor: ServicesAccessor, serverId: string): void {
		accessor.get(IMcpService).servers.get().find(s => s.definition.id === serverId)?.showOutput();
	}
}

export class RestartServer extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.RestartServer,
			title: localize2('mcp.command.restartServer', "Restart Server"),
			category,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, serverId: string, opts?: IMcpServerStartOpts) {
		const s = accessor.get(IMcpService).servers.get().find(s => s.definition.id === serverId);
		s?.showOutput();
		await s?.stop();
		await s?.start({ promptType: 'all-untrusted', ...opts });
	}
}

export class StartServer extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.StartServer,
			title: localize2('mcp.command.startServer', "Start Server"),
			category,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, serverId: string, opts?: IMcpServerStartOpts) {
		const s = accessor.get(IMcpService).servers.get().find(s => s.definition.id === serverId);
		await s?.start({ promptType: 'all-untrusted', ...opts });
	}
}

export class StopServer extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.StopServer,
			title: localize2('mcp.command.stopServer', "Stop Server"),
			category,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, serverId: string) {
		const s = accessor.get(IMcpService).servers.get().find(s => s.definition.id === serverId);
		await s?.stop();
	}
}

export class McpBrowseCommand extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.Browse,
			title: localize2('mcp.command.browse', "MCP Servers"),
			tooltip: localize2('mcp.command.browse.tooltip', "Browse MCP Servers"),
			category,
			icon: Codicon.search,
			precondition: ChatContextKeys.Setup.hidden.negate(),
			menu: [{
				id: extensionsFilterSubMenu,
				group: '1_predefined',
				order: 1,
				when: ChatContextKeys.Setup.hidden.negate(),
			}, {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', InstalledMcpServersViewId), ChatContextKeys.Setup.hidden.negate()),
				group: 'navigation',
			}],
		});
	}

	async run(accessor: ServicesAccessor) {
		accessor.get(IExtensionsWorkbenchService).openSearch('@mcp ');
	}
}

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: McpCommandIds.Browse,
		title: localize2('mcp.command.browse.mcp', "Browse MCP Servers"),
		category,
		precondition: ChatContextKeys.Setup.hidden.negate(),
	},
});

export class ShowInstalledMcpServersCommand extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.ShowInstalled,
			title: localize2('mcp.command.show.installed', "Show Installed Servers"),
			category,
			precondition: ContextKeyExpr.and(HasInstalledMcpServersContext, ChatContextKeys.Setup.hidden.negate()),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = await viewsService.openView(InstalledMcpServersViewId, true);
		if (!view) {
			await viewsService.openViewContainer(VIEW_CONTAINER.id);
			await viewsService.openView(InstalledMcpServersViewId, true);
		}
	}
}

MenuRegistry.appendMenuItem(CHAT_CONFIG_MENU_ID, {
	command: {
		id: McpCommandIds.ShowInstalled,
		title: localize2('mcp.servers', "MCP Servers")
	},
	when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
	order: 10,
	group: '2_level'
});

abstract class OpenMcpResourceCommand extends Action2 {
	protected abstract getURI(accessor: ServicesAccessor): Promise<URI>;

	async run(accessor: ServicesAccessor) {
		const fileService = accessor.get(IFileService);
		const editorService = accessor.get(IEditorService);
		const resource = await this.getURI(accessor);
		if (!(await fileService.exists(resource))) {
			await fileService.createFile(resource, VSBuffer.fromString(JSON.stringify({ servers: {} }, null, '\t')));
		}
		await editorService.openEditor({ resource });
	}
}

export class OpenUserMcpResourceCommand extends OpenMcpResourceCommand {
	constructor() {
		super({
			id: McpCommandIds.OpenUserMcp,
			title: localize2('mcp.command.openUserMcp', "Open User Configuration"),
			category,
			f1: true,
			precondition: ChatContextKeys.Setup.hidden.negate(),
		});
	}

	protected override getURI(accessor: ServicesAccessor): Promise<URI> {
		const userDataProfileService = accessor.get(IUserDataProfileService);
		return Promise.resolve(userDataProfileService.currentProfile.mcpResource);
	}
}

export class OpenRemoteUserMcpResourceCommand extends OpenMcpResourceCommand {
	constructor() {
		super({
			id: McpCommandIds.OpenRemoteUserMcp,
			title: localize2('mcp.command.openRemoteUserMcp', "Open Remote User Configuration"),
			category,
			f1: true,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.Setup.hidden.negate(),
				RemoteNameContext.notEqualsTo('')
			)
		});
	}

	protected override async getURI(accessor: ServicesAccessor): Promise<URI> {
		const userDataProfileService = accessor.get(IUserDataProfileService);
		const remoteUserDataProfileService = accessor.get(IRemoteUserDataProfilesService);
		const remoteProfile = await remoteUserDataProfileService.getRemoteProfile(userDataProfileService.currentProfile);
		return remoteProfile.mcpResource;
	}
}

export class OpenWorkspaceFolderMcpResourceCommand extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.OpenWorkspaceFolderMcp,
			title: localize2('mcp.command.openWorkspaceFolderMcp', "Open Workspace Folder MCP Configuration"),
			category,
			f1: true,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.Setup.hidden.negate(),
				WorkspaceFolderCountContext.notEqualsTo(0)
			)
		});
	}

	async run(accessor: ServicesAccessor) {
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const commandService = accessor.get(ICommandService);
		const editorService = accessor.get(IEditorService);
		const workspaceFolders = workspaceContextService.getWorkspace().folders;
		const workspaceFolder = workspaceFolders.length === 1 ? workspaceFolders[0] : await commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID);
		if (workspaceFolder) {
			await editorService.openEditor({ resource: workspaceFolder.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]) });
		}
	}
}

export class OpenWorkspaceMcpResourceCommand extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.OpenWorkspaceMcp,
			title: localize2('mcp.command.openWorkspaceMcp', "Open Workspace MCP Configuration"),
			category,
			f1: true,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.Setup.hidden.negate(),
				WorkbenchStateContext.isEqualTo('workspace')
			)
		});
	}

	async run(accessor: ServicesAccessor) {
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const editorService = accessor.get(IEditorService);
		const workspaceConfiguration = workspaceContextService.getWorkspace().configuration;
		if (workspaceConfiguration) {
			await editorService.openEditor({ resource: workspaceConfiguration });
		}
	}
}

export class McpBrowseResourcesCommand extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.BrowseResources,
			title: localize2('mcp.browseResources', "Browse Resources..."),
			category,
			precondition: ContextKeyExpr.and(McpContextKeys.serverCount.greater(0), ChatContextKeys.Setup.hidden.negate()),
			f1: true,
		});
	}

	run(accessor: ServicesAccessor, server?: IMcpServer): void {
		if (server) {
			accessor.get(IInstantiationService).createInstance(McpResourceQuickPick, server).pick();
		} else {
			accessor.get(IQuickInputService).quickAccess.show(McpResourceQuickAccess.PREFIX);
		}
	}
}

export class McpConfigureSamplingModels extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.ConfigureSamplingModels,
			title: localize2('mcp.configureSamplingModels', "Configure SamplingModel"),
			category,
		});
	}

	async run(accessor: ServicesAccessor, server: IMcpServer): Promise<number> {
		const quickInputService = accessor.get(IQuickInputService);
		const lmService = accessor.get(ILanguageModelsService);
		const mcpSampling = accessor.get(IMcpSamplingService);

		const existingIds = new Set(mcpSampling.getConfig(server).allowedModels);
		const allItems: IQuickPickItem[] = lmService.getLanguageModelIds().map(id => {
			const model = lmService.lookupLanguageModel(id)!;
			if (!model.isUserSelectable) {
				return undefined;
			}
			return {
				label: model.name,
				description: model.tooltip,
				id,
				picked: existingIds.size ? existingIds.has(id) : model.isDefault,
			};
		}).filter(isDefined);

		allItems.sort((a, b) => (b.picked ? 1 : 0) - (a.picked ? 1 : 0) || a.label.localeCompare(b.label));

		// do the quickpick selection
		const picked = await quickInputService.pick(allItems, {
			placeHolder: localize('mcp.configureSamplingModels.ph', 'Pick the models {0} can access via MCP sampling', server.definition.label),
			canPickMany: true,
		});

		if (picked) {
			await mcpSampling.updateConfig(server, c => c.allowedModels = picked.map(p => p.id!));
		}

		return picked?.length || 0;
	}
}

export class McpStartPromptingServerCommand extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.StartPromptForServer,
			title: localize2('mcp.startPromptingServer', "Start Prompting Server"),
			category,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, server: IMcpServer): Promise<void> {
		const widget = await openPanelChatAndGetWidget(accessor.get(IViewsService), accessor.get(IChatWidgetService));
		if (!widget) {
			return;
		}

		const editor = widget.inputEditor;
		const model = editor.getModel();
		if (!model) {
			return;
		}

		const range = (editor.getSelection() || model.getFullModelRange()).collapseToEnd();
		const text = mcpPromptPrefix(server.definition) + '.';

		model.applyEdits([{ range, text }]);
		editor.setSelection(Range.fromPositions(range.getEndPosition().delta(0, text.length)));
		widget.focusInput();
		SuggestController.get(editor)?.triggerSuggest();
	}
}

export class McpSkipCurrentAutostartCommand extends Action2 {
	constructor() {
		super({
			id: McpCommandIds.SkipCurrentAutostart,
			title: localize2('mcp.skipCurrentAutostart', "Skip Current Autostart"),
			category,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IMcpService).cancelAutostart();
	}
}
