/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, IMenuService, MenuItemAction, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TUNNEL_ADDRESS_PREFIX } from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { getStatusLabel, removeRemoteHost, showRemoteHostOptions } from './remoteHostOptions.js';
import { RemoteAgentHostCommandIds } from './remoteAgentHostActions.js';

interface IRemoteHostQuickPickItem extends IQuickPickItem {
	readonly kind: 'remote';
	readonly provider: IAgentHostSessionsProvider;
}

interface IMenuActionQuickPickItem extends IQuickPickItem {
	readonly kind: 'menu-action';
	readonly action: MenuItemAction;
}

type ManageHostsPickItem = IRemoteHostQuickPickItem | IMenuActionQuickPickItem;

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RemoteAgentHostCommandIds.manageRemoteAgentHosts,
			title: localize2('manageRemoteAgentHosts', "Manage Remote Agent Hosts..."),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const sessionsProvidersService = accessor.get(ISessionsProvidersService);
		const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
		const menuService = accessor.get(IMenuService);
		const contextKeyService = accessor.get(IContextKeyService);
		const commandService = accessor.get(ICommandService);
		const instantiationService = accessor.get(IInstantiationService);

		const removeButton: IQuickInputButton = {
			iconClass: ThemeIcon.asClassName(Codicon.close),
			tooltip: localize('manageHosts.removeTooltip', "Remove"),
		};

		const buildItems = (): (ManageHostsPickItem | IQuickPickSeparator)[] => {
			const remoteProviders: IAgentHostSessionsProvider[] = sessionsProvidersService.getProviders()
				.filter(isAgentHostProvider)
				.filter((p: IAgentHostSessionsProvider) => !!p.remoteAddress);

			const remoteItems: IRemoteHostQuickPickItem[] = remoteProviders.map((p: IAgentHostSessionsProvider) => {
				const isTunnel = p.remoteAddress?.startsWith(TUNNEL_ADDRESS_PREFIX);
				const status = p.connectionStatus?.get();
				const item: IRemoteHostQuickPickItem = {
					kind: 'remote',
					provider: p,
					label: `$(${isTunnel ? 'cloud' : 'remote'}) ${p.label}`,
					description: status !== undefined ? getStatusLabel(status) : undefined,
					detail: p.remoteAddress,
				};
				(item as IRemoteHostQuickPickItem & { buttons?: IQuickInputButton[] }).buttons = [removeButton];
				return item;
			});

			const menuActionItems: IMenuActionQuickPickItem[] = [];
			const menuActions = menuService.getMenuActions(Menus.SessionWorkspaceManage, contextKeyService, { renderShortTitle: true });
			for (const [, actions] of menuActions) {
				for (const action of actions) {
					if (action instanceof MenuItemAction) {
						const icon = ThemeIcon.isThemeIcon(action.item.icon) ? action.item.icon : undefined;
						menuActionItems.push({
							kind: 'menu-action',
							action,
							label: icon ? `$(${icon.id}) ${action.label}` : action.label,
							description: action.tooltip || undefined,
						});
					}
				}
			}

			const items: (ManageHostsPickItem | IQuickPickSeparator)[] = [];
			if (remoteItems.length > 0) {
				items.push({ type: 'separator', label: localize('manageHosts.remoteHostsHeader', "Remote Agent Hosts") });
				items.push(...remoteItems);
			}
			if (menuActionItems.length > 0) {
				items.push({ type: 'separator', label: localize('manageHosts.actionsHeader', "Add or Manage") });
				items.push(...menuActionItems);
			}
			return items;
		};

		const showManagePicker = () => {
			const store = new DisposableStore();
			const picker = quickInputService.createQuickPick<ManageHostsPickItem>({ useSeparators: true });
			store.add(picker);
			picker.title = localize('manageHosts.title', "Manage Remote Agent Hosts");
			picker.placeholder = localize('manageHosts.placeholder', "Select a remote to manage or pick an action");
			picker.matchOnDescription = true;
			picker.matchOnDetail = true;

			let lastFilter = '';
			const refresh = () => {
				lastFilter = picker.value;
				picker.items = buildItems();
				picker.value = lastFilter;
			};
			refresh();

			// Refresh when providers/connection status change
			store.add(sessionsProvidersService.onDidChangeProviders(() => refresh()));
			const observerStore = store.add(new DisposableStore());
			const subscribeToProviders = () => {
				observerStore.clear();
				for (const p of sessionsProvidersService.getProviders()) {
					if (isAgentHostProvider(p) && p.connectionStatus) {
						observerStore.add(autorun(reader => {
							p.connectionStatus!.read(reader);
							refresh();
						}));
					}
				}
			};
			subscribeToProviders();
			store.add(sessionsProvidersService.onDidChangeProviders(() => subscribeToProviders()));

			store.add(picker.onDidTriggerItemButton(async e => {
				if (e.item.kind === 'remote' && e.button === removeButton) {
					await removeRemoteHost(e.item.provider, remoteAgentHostService);
					// onDidChangeProviders will refresh
				}
			}));

			store.add(picker.onDidAccept(() => {
				const selected = picker.selectedItems[0];
				picker.hide();
				if (!selected) {
					return;
				}
				if (selected.kind === 'remote') {
					void instantiationService.invokeFunction(a => showRemoteHostOptions(a, selected.provider, { showBackButton: true })).then(result => {
						if (result === 'back') {
							showManagePicker();
						}
					});
				} else if (selected.kind === 'menu-action') {
					commandService.executeCommand(selected.action.id, () => showManagePicker());
				}
			}));

			store.add(picker.onDidHide(() => store.dispose()));
			picker.show();
		};

		showManagePicker();
	}
});
