/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { dirname } from '../../../../../base/common/resources.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IAgentPlugin, IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from './chatActions.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
import { IExtensionsViewPaneContainer, VIEWLET_ID } from '../../../extensions/common/extensions.js';
import { ViewContainerLocation } from '../../../../common/views.js';

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
		const configurationService = accessor.get(IConfigurationService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const paneCompositeService = accessor.get(IPaneCompositePartService);

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
			const viewlet = await paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true);
			const view = viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer | undefined;
			view?.search('@agentPlugins ');
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

export function registerChatPluginActions() {
	registerAction2(ManagePluginsAction);
}
