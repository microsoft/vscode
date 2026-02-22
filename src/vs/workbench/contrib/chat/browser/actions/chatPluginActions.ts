/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { dirname } from '../../../../../base/common/resources.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IAgentPlugin, IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IMarketplacePlugin, IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from './chatActions.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';

const enum ManagePluginItemKind {
	Plugin = 'plugin',
	FindMore = 'findMore',
	AddFromFolder = 'addFromFolder',
}

interface IPluginPickItem extends IQuickPickItem {
	readonly kind: ManagePluginItemKind.Plugin;
	plugin: IAgentPlugin;
}

interface IFindMorePickItem extends IQuickPickItem {
	readonly kind: ManagePluginItemKind.FindMore;
}

interface IAddFromFolderPickItem extends IQuickPickItem {
	readonly kind: ManagePluginItemKind.AddFromFolder;
}

interface IMarketplacePluginPickItem extends IQuickPickItem {
	marketplacePlugin: IMarketplacePlugin;
}

interface IManagePluginsPickResult {
	action: 'apply' | 'findMore' | 'addFromFolder';
	selectedPluginItems: IPluginPickItem[];
}

class ManagePluginsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.managePlugins';

	constructor() {
		super({
			id: ManagePluginsAction.ID,
			title: localize2('managePlugins', 'Manage Plugins...'),
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: CHAT_CONFIG_MENU_ID,
			}],
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const agentPluginService = accessor.get(IAgentPluginService);
		const quickInputService = accessor.get(IQuickInputService);
		const labelService = accessor.get(ILabelService);
		const dialogService = accessor.get(IDialogService);
		const fileDialogService = accessor.get(IFileDialogService);
		const openerService = accessor.get(IOpenerService);
		const configurationService = accessor.get(IConfigurationService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const pluginMarketplaceService = accessor.get(IPluginMarketplaceService);

		const allPlugins = agentPluginService.allPlugins.get();
		const hasWorkspace = workspaceContextService.getWorkspace().folders.length > 0;

		// Group plugins by parent directory label
		const groups = new Map<string, IAgentPlugin[]>();
		for (const plugin of allPlugins) {
			const groupLabel = labelService.getUriLabel(dirname(plugin.uri), { relative: true });
			let group = groups.get(groupLabel);
			if (!group) {
				group = [];
				groups.set(groupLabel, group);
			}
			group.push(plugin);
		}

		const items: QuickPickInput<IPluginPickItem | IFindMorePickItem | IAddFromFolderPickItem>[] = [];
		const preselectedPluginItems: IPluginPickItem[] = [];
		for (const [groupLabel, plugins] of groups) {
			items.push({ type: 'separator', label: groupLabel });
			for (const plugin of plugins) {
				const pluginName = plugin.uri.path.split('/').at(-1) ?? '';
				const item: IPluginPickItem = {
					kind: ManagePluginItemKind.Plugin,
					label: pluginName,
					plugin,
					picked: plugin.enabled.get(),
				};
				if (item.picked) {
					preselectedPluginItems.push(item);
				}
				items.push(item);
			}
		}

		if (items.length > 0 || hasWorkspace) {
			items.push({ type: 'separator' });
		}

		if (hasWorkspace) {
			items.push({
				kind: ManagePluginItemKind.FindMore,
				label: localize('findMorePlugins', 'Find More Plugins...'),
				pickable: false,
			} satisfies IFindMorePickItem);
		}

		items.push({
			kind: ManagePluginItemKind.AddFromFolder,
			label: localize('addFromFolder', 'Add from Folder...'),
			pickable: false,
		} satisfies IAddFromFolderPickItem);

		const result = await showManagePluginsQuickPick(quickInputService, items, preselectedPluginItems);

		if (!result) {
			return;
		}

		if (result.action === 'findMore') {
			await showMarketplaceQuickPick(quickInputService, pluginMarketplaceService, dialogService, openerService);
			return;
		}

		if (result.action === 'addFromFolder') {
			const selectedUris = await fileDialogService.showOpenDialog({
				title: localize('pickPluginFolderTitle', 'Pick Plugin Folder'),
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				defaultUri: workspaceContextService.getWorkspace().folders[0]?.uri,
			});

			const folderUri = selectedUris?.[0];
			if (!folderUri) {
				return;
			}

			const currentPaths = configurationService.getValue<Record<string, boolean>>(ChatConfiguration.PluginPaths) ?? {};
			const nextPath = folderUri.fsPath;
			if (!Object.prototype.hasOwnProperty.call(currentPaths, nextPath)) {
				await configurationService.updateValue(ChatConfiguration.PluginPaths, { ...currentPaths, [nextPath]: true }, ConfigurationTarget.USER_LOCAL);
			}
			return;
		}

		if (allPlugins.length === 0) {
			dialogService.info(
				localize('noPlugins', 'No plugins found.'),
				localize('noPluginsDetail', 'There are currently no agent plugins discovered in this workspace.')
			);
			return;
		}

		const enabledUris = new ResourceSet(result.selectedPluginItems.map(i => i.plugin.uri));
		for (const plugin of allPlugins) {
			const wasEnabled = plugin.enabled.get();
			const isNowEnabled = enabledUris.has(plugin.uri);

			if (!wasEnabled && isNowEnabled) {
				plugin.setEnabled(true);
			} else if (wasEnabled && !isNowEnabled) {
				plugin.setEnabled(false);
			}
		}
	}
}

async function showManagePluginsQuickPick(
	quickInputService: IQuickInputService,
	items: QuickPickInput<IPluginPickItem | IFindMorePickItem | IAddFromFolderPickItem>[],
	preselectedPluginItems: IPluginPickItem[]
): Promise<IManagePluginsPickResult | undefined> {
	const quickPick = quickInputService.createQuickPick<IPluginPickItem | IFindMorePickItem | IAddFromFolderPickItem>({ useSeparators: true });
	const disposables = new DisposableStore();
	disposables.add(quickPick);

	quickPick.canSelectMany = true;
	quickPick.title = localize('managePluginsTitle', 'Manage Plugins');
	quickPick.placeholder = localize('managePluginsPlaceholder', 'Choose which plugins are enabled');
	quickPick.items = items;
	quickPick.selectedItems = preselectedPluginItems;

	const result = await new Promise<IManagePluginsPickResult | undefined>(resolve => {
		let resolved = false;

		const complete = (value: IManagePluginsPickResult | undefined) => {
			if (resolved) {
				return;
			}
			resolved = true;
			resolve(value);
		};

		disposables.add(quickPick.onDidAccept(() => {
			const activeItem = quickPick.activeItems[0];
			if (activeItem?.kind === ManagePluginItemKind.FindMore) {
				complete({
					action: 'findMore',
					selectedPluginItems: [],
				});
				quickPick.hide();
				return;
			}

			if (activeItem?.kind === ManagePluginItemKind.AddFromFolder) {
				complete({
					action: 'addFromFolder',
					selectedPluginItems: [],
				});
				quickPick.hide();
				return;
			}

			complete({
				action: 'apply',
				selectedPluginItems: quickPick.selectedItems.filter((item): item is IPluginPickItem => item.kind === ManagePluginItemKind.Plugin),
			});
			quickPick.hide();
		}));

		disposables.add(quickPick.onDidHide(() => {
			complete(undefined);
			disposables.dispose();
		}));

		quickPick.show();
	});
	return result;
}

async function showMarketplaceQuickPick(
	quickInputService: IQuickInputService,
	pluginMarketplaceService: IPluginMarketplaceService,
	dialogService: IDialogService,
	openerService: IOpenerService,
): Promise<void> {
	const quickPick = quickInputService.createQuickPick<IMarketplacePluginPickItem>({ useSeparators: true });
	const disposables = new DisposableStore();
	disposables.add(quickPick);
	const openReadmeButton: IQuickInputButton = {
		iconClass: ThemeIcon.asClassName(Codicon.book),
		tooltip: localize('openPluginReadme', 'Open README on GitHub'),
	};
	quickPick.title = localize('marketplaceTitle', 'Plugin Marketplace');
	quickPick.placeholder = localize('marketplacePlaceholder', 'Select a plugin to install');
	quickPick.busy = true;
	quickPick.show();

	const cts = new CancellationTokenSource();
	disposables.add(cts);

	try {
		const plugins = await pluginMarketplaceService.fetchMarketplacePlugins(cts.token);

		if (cts.token.isCancellationRequested) {
			return;
		}

		if (plugins.length === 0) {
			quickPick.items = [];
			quickPick.busy = false;
			quickPick.placeholder = localize('noMarketplacePlugins', 'No plugins found in configured marketplaces');
			return;
		}

		// Group by marketplace
		const groups = new Map<string, IMarketplacePlugin[]>();
		for (const plugin of plugins) {
			let group = groups.get(plugin.marketplace);
			if (!group) {
				group = [];
				groups.set(plugin.marketplace, group);
			}
			group.push(plugin);
		}

		const items: QuickPickInput<IMarketplacePluginPickItem>[] = [];
		for (const [marketplace, marketplacePlugins] of groups) {
			items.push({ type: 'separator', label: marketplace });
			for (const plugin of marketplacePlugins) {
				items.push({
					label: plugin.name,
					detail: plugin.description,
					description: plugin.version,
					marketplacePlugin: plugin,
					buttons: plugin.readmeUri ? [openReadmeButton] : undefined,
				});
			}
		}

		quickPick.items = items;
		quickPick.busy = false;
	} catch {
		quickPick.busy = false;
		quickPick.placeholder = localize('marketplaceError', 'Failed to fetch plugins from marketplaces');
		return;
	}

	disposables.add(quickPick.onDidTriggerItemButton(e => {
		if (e.button !== openReadmeButton || !e.item.marketplacePlugin.readmeUri) {
			return;
		}
		void openerService.open(e.item.marketplacePlugin.readmeUri);
	}));

	const selection = await new Promise<IMarketplacePluginPickItem | undefined>(resolve => {
		disposables.add(quickPick.onDidAccept(() => {
			resolve(quickPick.selectedItems[0]);
			quickPick.hide();
		}));
		disposables.add(quickPick.onDidHide(() => {
			resolve(undefined);
			disposables.dispose();
		}));
	});

	if (selection) {
		// TODO: Implement plugin installation
		dialogService.info(
			localize('installNotSupported', 'Plugin Installation'),
			localize('installNotSupportedDetail', "Installing '{0}' from '{1}' is not yet supported.", selection.marketplacePlugin.name, selection.marketplacePlugin.marketplace)
		);
	}
}

export function registerChatPluginActions() {
	registerAction2(ManagePluginsAction);
}
