/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupBy } from '../../../../base/common/collections.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ILocalizedString, localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IMcpService, McpConnectionState } from '../common/mcpTypes.js';

// acroynms do not get localized
const category: ILocalizedString = {
	original: 'MCP',
	value: 'MCP',
};

class ListMcpServerCommand extends Action2 {
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
registerAction2(ListMcpServerCommand);


class McpServerOptionsCommand extends Action2 {
	public static readonly id = 'workbench.mcp.serverOptions';

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
registerAction2(McpServerOptionsCommand);
