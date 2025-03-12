/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reset } from '../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { diffSets, groupBy } from '../../../../base/common/collections.js';
import { Event } from '../../../../base/common/event.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived, transaction } from '../../../../base/common/observable.js';
import { assertType } from '../../../../base/common/types.js';
import { ILocalizedString, localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { CHAT_CATEGORY } from '../../chat/browser/actions/chatActions.js';
import { ChatAgentLocation } from '../../chat/common/chatAgents.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { McpContextKeys } from '../common/mcpContextKeys.js';
import { IMcpServer, IMcpService, IMcpTool, McpConnectionState } from '../common/mcpTypes.js';

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

		store.add(pick);
		store.add(autorun(reader => {
			const servers = groupBy(mcpService.servers.read(reader).slice().sort((a, b) => (a.collection.order || 0) - (b.collection.order || 0)), s => s.collection.id);
			pick.items = Object.values(servers).flatMap(servers => {
				return [
					{ type: 'separator', label: servers[0].collection.label, id: servers[0].collection.id },
					...servers.map(server => ({
						id: server.definition.id,
						label: server.definition.label,
						description: McpConnectionState.toString(server.state.read(reader)),
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
			f1: true,
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
		const serverState = server.state.get();

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
			placeHolder: localize('mcp.selectAction', 'Select Server Action')
		});

		if (!pick) {
			return;
		}

		switch (pick.action) {
			case 'start':
				await server.start();
				server.showOutput();
				break;
			case 'stop':
				await server.stop();
				break;
			case 'restart':
				await server.stop();
				await server.start();
				break;
			case 'showOutput':
				server.showOutput();
				break;
		}
	}
}


export class AttachMCPToolsAction extends Action2 {

	static readonly id = 'workbench.action.chat.mcp.attachMcpTools';

	constructor() {
		super({
			id: AttachMCPToolsAction.id,
			title: localize2('workbench.action.chat.editing.attachContext.shortLabel', "Select Tools..."),
			icon: Codicon.tools,
			f1: false,
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				McpContextKeys.toolsCount.greater(0),
				ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession)
			),
			menu: {
				when: ContextKeyExpr.and(
					McpContextKeys.toolsCount.greater(0),
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession)
				),
				id: MenuId.ChatInputAttachmentToolbar,
				group: 'navigation'
			},
			keybinding: {
				when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession)),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {

		const quickPickService = accessor.get(IQuickInputService);
		const mcpService = accessor.get(IMcpService);

		type ToolPick = IQuickPickItem & { picked: boolean; tool: IMcpTool; parent: ServerPick };
		type ServerPick = IQuickPickItem & { picked: boolean; server: IMcpServer; toolPicks: ToolPick[] };
		type McpPick = ToolPick | ServerPick;

		function isServerPick(obj: any): obj is ServerPick {
			return Boolean((obj as ServerPick).server);
		}
		function isToolPick(obj: any): obj is ToolPick {
			return Boolean((obj as ToolPick).tool);
		}

		const store = new DisposableStore();
		const picker = store.add(quickPickService.createQuickPick<McpPick>({ useSeparators: true }));

		const picks: (McpPick | IQuickPickSeparator)[] = [];

		for (const server of mcpService.servers.get()) {

			const tools = server.tools.get();

			if (tools.length === 0) {
				continue;
			}
			picks.push({
				type: 'separator',
				label: server.collection.label
			});

			const item: ServerPick = {
				server,
				type: 'item',
				label: `$(server) ${server.definition.label}`,
				description: McpConnectionState.toString(server.state.get()),
				picked: tools.some(tool => tool.enabled.get()),
				toolPicks: []
			};

			picks.push(item);

			for (const tool of tools) {
				const toolItem: ToolPick = {
					tool,
					parent: item,
					type: 'item',
					label: `$(tools) ${tool.definition.name}`,
					description: tool.definition.description,
					picked: tool.enabled.get()
				};
				item.toolPicks.push(toolItem);
				picks.push(toolItem);
			}
		}

		picker.placeholder = localize('placeholder', "Select tools that are available to chat");
		picker.canSelectMany = true;

		let lastSelectedItems = new Set<McpPick>();
		let ignoreEvent = false;

		const _update = () => {
			ignoreEvent = true;
			try {
				const items = picks.filter((p): p is McpPick => p.type === 'item' && Boolean(p.picked));
				lastSelectedItems = new Set(items);
				picker.items = picks;
				picker.selectedItems = items;
			} finally {
				ignoreEvent = false;
			}
		};

		_update();
		picker.show();

		store.add(picker.onDidChangeSelection(selectedPicks => {
			if (ignoreEvent) {
				return;
			}

			const { added, removed } = diffSets(lastSelectedItems, new Set(selectedPicks));

			for (const item of added) {
				item.picked = true;

				if (isServerPick(item)) {
					// add server -> add back tools
					for (const toolPick of item.toolPicks) {
						toolPick.picked = true;
					}
				} else if (isToolPick(item)) {
					// add server when tool is picked
					item.parent.picked = true;
				}
			}

			for (const item of removed) {
				item.picked = false;

				if (isServerPick(item)) {
					// removed server -> remove tools
					for (const toolPick of item.toolPicks) {
						toolPick.picked = false;
					}
				} else if (isToolPick(item) && item.parent.toolPicks.every(child => !child.picked)) {
					// remove LAST tool -> remove server
					item.parent.picked = false;
				}
			}

			transaction(tx => {
				for (const item of picks) {
					if (isToolPick(item)) {
						item.tool.updateEnablement(item.picked, tx);
					}
				}
			});

			_update();
		}));


		await Promise.race([Event.toPromise(Event.any(picker.onDidAccept, picker.onDidHide))]);

		store.dispose();

	}
}

export class AttachMCPToolsActionRendering extends Disposable implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.mcp.discovery';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IMcpService mcpService: IMcpService,
		@IInstantiationService instaService: IInstantiationService
	) {
		super();


		const toolsCount = derived(r => {
			let count = 0;
			let enabled = 0;
			const servers = mcpService.servers.read(r);
			for (const server of servers) {
				for (const tool of server.tools.read(r)) {
					count += 1;
					enabled += tool.enabled.read(r) ? 1 : 0;
				}
			}
			return { count, enabled };
		});


		this._store.add(actionViewItemService.register(MenuId.ChatInputAttachmentToolbar, AttachMCPToolsAction.id, (action, options) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}

			return instaService.createInstance(class extends MenuEntryActionViewItem {

				override render(container: HTMLElement): void {
					this.options.icon = false;
					this.options.label = true;
					container.classList.add('chat-mcp');
					super.render(container);
				}

				protected override updateLabel(): void {
					this._store.add(autorun(r => {
						assertType(this.label);

						const { enabled, count } = toolsCount.read(r);

						if (count === 0) {
							super.updateLabel();
							return;
						}

						const message = enabled !== count
							? localize('tool.1', "{0} {1} of {2}", '$(tools)', enabled, count)
							: localize('tool.0', "{0} {1}", '$(tools)', count);
						reset(this.label, ...renderLabelWithIcons(message));
					}));
				}

			}, action, { ...options, keybindingNotRenderedWithLabel: true });

		}, Event.fromObservable(toolsCount)));
	}
}
