/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { autorun } from '../../../../../base/common/observable.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, IMenuService, MenuItemAction, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId, IMissionControlSharingService, isGitHubEnvironmentBackend } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId, ToggleRemoteConnectionsCommandId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TUNNEL_ADDRESS_PREFIX } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionsCategories } from '../../../../common/categories.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { getStatusLabel, removeRemoteHost, showRemoteHostOptions } from './remoteHostOptions.js';
import { RemoteAgentHostCommandIds } from './remoteAgentHostActions.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { IRemoteTunnelService, TunnelStatus } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { getLocalAgentHostConnectionDescription, getLocalAgentHostHover, getLocalAgentHostRouteLabel, LocalAgentHostRegistration } from '../../../../browser/remoteAgentHostPresentation.js';

interface IRemoteHostQuickPickItem extends IQuickPickItem {
	readonly kind: 'remote';
	readonly provider: IAgentHostSessionsProvider;
}

interface IMenuActionQuickPickItem extends IQuickPickItem {
	readonly kind: 'menu-action';
	readonly action: MenuItemAction;
}

interface ILocalHostQuickPickItem extends IQuickPickItem {
	readonly kind: 'local';
}

type ManageHostsPickItem = IRemoteHostQuickPickItem | IMenuActionQuickPickItem | ILocalHostQuickPickItem;

export interface IThisComputerPresentation {
	readonly route: LocalAgentHostRegistration;
	readonly registrationName: string | undefined;
	readonly sharingState: 'off' | 'connecting' | 'on';
}

export function getThisComputerDescription(presentation: IThisComputerPresentation): string {
	const route = getLocalAgentHostRouteLabel(presentation.route);
	if (presentation.sharingState === 'connecting') {
		return presentation.registrationName
			? localize('manageHosts.thisComputer.connectingRegistered', "Starting sharing as {0} via {1}. Select to cancel", presentation.registrationName, route)
			: localize('manageHosts.thisComputer.connecting', "Starting sharing via {0}. Select to cancel", route);
	}
	if (presentation.sharingState === 'on') {
		return presentation.registrationName
			? localize('manageHosts.thisComputer.sharedAs', "Shared as {0} via {1}", presentation.registrationName, route)
			: localize('manageHosts.thisComputer.shared', "Shared via {0}", route);
	}
	return presentation.registrationName
		? localize('manageHosts.thisComputer.offRegistered', "Sharing off. Registered as {0} via {1}", presentation.registrationName, route)
		: localize('manageHosts.thisComputer.off', "Sharing off");
}

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
		const configurationService = accessor.get(IConfigurationService);
		const menuService = accessor.get(IMenuService);
		const contextKeyService = accessor.get(IContextKeyService);
		const commandService = accessor.get(ICommandService);
		const instantiationService = accessor.get(IInstantiationService);
		const hostFilter = accessor.get(IAgentHostFilterService);
		const notifications = accessor.get(INotificationService);
		const remoteTunnelService = accessor.get(IRemoteTunnelService);
		const missionControlSharingService = accessor.get(IMissionControlSharingService);
		let remoteTunnelStatus: TunnelStatus = { type: 'uninitialized' };
		remoteTunnelStatus = await remoteTunnelService.getTunnelStatus();
		let lastFilter = '';
		let lastActive: ManageHostsPickItem | undefined;

		const removeButton: IQuickInputButton = {
			iconClass: ThemeIcon.asClassName(Codicon.close),
			tooltip: localize('manageHosts.removeTooltip', "Remove"),
		};

		const buildItems = (): (ManageHostsPickItem | IQuickPickSeparator)[] => {
			const remoteProviders: IAgentHostSessionsProvider[] = sessionsProvidersService.getProviders()
				.filter(isAgentHostProvider)
				.filter((p: IAgentHostSessionsProvider) => !!p.remoteAddress)
				// Group members are created by discovery, not added by the user.
				.filter((p: IAgentHostSessionsProvider) => !p.hostGroup);

			const remoteItems: IRemoteHostQuickPickItem[] = remoteProviders.map((p: IAgentHostSessionsProvider) => {
				const isTunnel = p.remoteAddress?.startsWith(TUNNEL_ADDRESS_PREFIX);
				const status = p.connectionStatus?.get();
				const localRegistration = p.localRegistration?.get();
				const item: IRemoteHostQuickPickItem = {
					kind: 'remote',
					provider: p,
					label: `$(${isTunnel ? 'cloud' : 'remote'}) ${p.label}`,
					description: status !== undefined
						? localRegistration
							? getLocalAgentHostConnectionDescription(localRegistration, getStatusLabel(status))
							: p.hostDescription
								? localize('manageHosts.connectionStatus', "Connection: {0}", getStatusLabel(status))
								: getStatusLabel(status)
						: undefined,
					detail: localRegistration ? getLocalAgentHostHover(localRegistration) : p.hostDescription?.get() ?? p.remoteAddress,
					buttons: p.canRemove === false ? [] : p.removeLabel ? [{ ...removeButton, tooltip: p.removeLabel }] : [removeButton],
				};
				return item;
			});

			const menuActionItems: IMenuActionQuickPickItem[] = [];
			const menuActions = menuService.getMenuActions(Menus.SessionWorkspaceManage, contextKeyService, { renderShortTitle: true });
			for (const [, actions] of menuActions) {
				for (const action of actions) {
					if (action instanceof MenuItemAction) {
						if (action.id === ToggleRemoteConnectionsCommandId) {
							continue;
						}
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

			const usesGitHubEnvironment = isGitHubEnvironmentBackend(configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId));
			const registration = usesGitHubEnvironment ? 'githubEnvironment' : 'devTunnel';
			const localProvider = remoteProviders.find(provider => provider.localRegistration?.get() === registration);
			const sharingState = usesGitHubEnvironment
				? missionControlSharingService.state.get() === 'enabled' ? 'on' : missionControlSharingService.state.get() === 'connecting' ? 'connecting' : 'off'
				: remoteTunnelStatus.type === 'connected' ? 'on' : remoteTunnelStatus.type === 'connecting' ? 'connecting' : 'off';
			const items: (ManageHostsPickItem | IQuickPickSeparator)[] = [];
			if (!isWeb) {
				items.push(
					{ type: 'separator', label: localize('manageHosts.thisComputerHeader', "This Computer") },
					{
						kind: 'local',
						label: `$(device-desktop) ${localize('manageHosts.thisComputer', "This Computer")}`,
						description: getThisComputerDescription({ route: registration, registrationName: localProvider?.label, sharingState }),
						detail: sharingState === 'connecting'
							? localize('manageHosts.thisComputerConnectingDetail', "Sharing is starting. Select to cancel. Sessions continue to run directly here.")
							: localize('manageHosts.thisComputerDetail', "Sessions run directly here even when sharing is off. Turn sharing on to let other clients connect."),
					}
				);
			}
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

		const showManagePicker = async () => {
			remoteTunnelStatus = await remoteTunnelService.getTunnelStatus();
			const store = new DisposableStore();
			const picker = quickInputService.createQuickPick<ManageHostsPickItem>({ useSeparators: true });
			store.add(picker);
			picker.title = localize('manageHosts.title', "Manage Remote Agent Hosts");
			picker.placeholder = localize('manageHosts.placeholder', "Select a remote to manage or pick an action");
			picker.matchOnDescription = true;
			picker.matchOnDetail = true;
			picker.keepScrollPosition = true;
			picker.buttons = [{ iconClass: ThemeIcon.asClassName(Codicon.refresh), tooltip: localize('manageHosts.refresh', "Refresh Hosts") }];
			const refreshHosts = async () => {
				const success = await hostFilter.rediscover();
				if (!store.isDisposed) {
					picker.validationMessage = success ? undefined : localize('manageHosts.refreshFailed', "Could not refresh all hosts. Retained hosts are still available; use Refresh Hosts to retry.");
				}
			};
			store.add(hostFilter.onDidChangeDiscovering(() => { picker.busy = hostFilter.isDiscovering; }));
			store.add(picker.onDidTriggerButton(() => { void refreshHosts(); }));

			picker.value = lastFilter;
			store.add(picker.onDidChangeValue(value => { lastFilter = value; }));
			const refresh = () => {
				lastFilter = picker.value;
				const active = picker.activeItems[0] ?? lastActive;
				const items = buildItems();
				picker.items = items;
				if (active) {
					picker.activeItems = items.filter((item): item is ManageHostsPickItem => item.type !== 'separator')
						.filter(item => item.kind === active.kind && (item.kind === 'remote' && active.kind === 'remote'
							? item.provider.id === active.provider.id
							: item.kind === 'menu-action' && active.kind === 'menu-action'
								? item.action.id === active.action.id
								: item.kind === 'local' && active.kind === 'local'));
				}
				picker.value = lastFilter;
			};
			refresh();

			// Refresh when providers/connection status change
			store.add(sessionsProvidersService.onDidChangeProviders(() => refresh()));
			const observerStore = store.add(new DisposableStore());
			const subscribeToProviders = () => {
				observerStore.clear();
				for (const p of sessionsProvidersService.getProviders()) {
					if (isAgentHostProvider(p)) {
						if (p.connectionStatus) {
							observerStore.add(autorun(reader => {
								p.connectionStatus!.read(reader);
								p.hostDescription?.read(reader);
								p.localRegistration?.read(reader);
								refresh();
							}));
						}
						if (p.onDidChangeSessionTypes) {
							observerStore.add(p.onDidChangeSessionTypes(() => refresh()));
						}
					}
				}
			};
			subscribeToProviders();
			store.add(sessionsProvidersService.onDidChangeProviders(() => subscribeToProviders()));
			store.add(remoteTunnelService.onDidChangeTunnelStatus(status => {
				remoteTunnelStatus = status;
				refresh();
			}));
			store.add(configurationService.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration(AgentHostRemoteConnectionsSettingId)) {
					refresh();
				}
			}));
			store.add(autorun(reader => {
				missionControlSharingService.state.read(reader);
				refresh();
			}));

			store.add(picker.onDidTriggerItemButton(async e => {
				if (e.item.kind === 'remote') {
					try {
						await removeRemoteHost(e.item.provider, remoteAgentHostService, configurationService);
					} catch (error) {
						if (!isCancellationError(error)) {
							notifications.error(error instanceof Error ? error : String(error));
						}
					}
					// onDidChangeProviders will refresh
				}
			}));

			store.add(picker.onDidAccept(() => {
				const selected = picker.selectedItems[0];
				lastActive = selected;
				picker.hide();
				if (!selected) {
					return;
				}
				if (selected.kind === 'remote') {
					void instantiationService.invokeFunction(a => showRemoteHostOptions(a, selected.provider, { showBackButton: true })).then(result => {
						if (result === 'back') {
							void showManagePicker();
						}
					}).catch(error => notifications.error(error));
				} else if (selected.kind === 'menu-action') {
					void commandService.executeCommand(selected.action.id, () => void showManagePicker()).catch(error => notifications.error(error));
				} else {
					void commandService.executeCommand(ToggleRemoteConnectionsCommandId).then(() => showManagePicker()).catch(error => notifications.error(error));
				}
			}));

			store.add(picker.onDidHide(() => store.dispose()));
			picker.show();
			void refreshHosts();
		};

		await showManagePicker();
	}
});
