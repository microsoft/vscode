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
import { ILocalizedString, localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { spinningLoading } from '../../../../platform/theme/common/iconRegistry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { ChatMode } from '../../chat/common/constants.js';
import { McpContextKeys } from '../common/mcpContextKeys.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { LazyCollectionState, IMcpServer, IMcpService, McpConnectionState, McpServerToolsState } from '../common/mcpTypes.js';

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
			icon: Codicon.server,
			f1: true,
			menu: {
				when: ContextKeyExpr.and(
					McpContextKeys.hasUnknownTools,
					ChatContextKeys.chatMode.isEqualTo(ChatMode.Agent)
				),
				id: MenuId.ChatInputAttachmentToolbar,
				group: 'navigation',
				order: 0
			},
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
					case McpServerToolsState.Cached:
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

		this._store.add(actionViewItemService.register(MenuId.ChatInputAttachmentToolbar, McpServerOptionsCommand.id, (action, options) => {
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
