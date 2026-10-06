/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { cloudSandboxAddress } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IMissionControlEnvironmentService, IMissionControlHost } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

export const ConnectMissionControlEnvironmentCommand = 'workbench.action.chat.connectMissionControlEnvironment';

interface IEnvironmentPick extends IQuickPickItem {
	readonly environment: IMissionControlHost;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ConnectMissionControlEnvironmentCommand,
			title: localize2('connectMissionControlEnvironment', "Connect to Mission Control Environment..."),
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.not('config.chat.disableAIFeatures'), ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)),
		});
	}

	override async run(accessor: ServicesAccessor, onBack?: () => void): Promise<string | undefined> {
		const inventory = accessor.get(IMissionControlEnvironmentService);
		if (!inventory.enabled) {
			throw new Error(localize('missionControl.connectionsDisabled', "User-local Mission Control connections require remote agent hosts and AI features to be enabled."));
		}
		const picker = accessor.get(IQuickInputService);
		const notifications = accessor.get(INotificationService);
		const remote = accessor.get(IRemoteAgentHostService);
		const resources = new DisposableStore();
		const cancellation = new CancellationTokenSource();
		resources.add(toDisposable(() => cancellation.dispose(true)));
		try {
			await inventory.initialize();
			const account = inventory.accountKey;
			const quickPick = resources.add(picker.createQuickPick<IEnvironmentPick>({ useSeparators: true }));
			const refreshButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.refresh), tooltip: localize('missionControl.refresh', "Refresh Hosts") };
			const hideButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.close), tooltip: localize('missionControl.hide', "Hide in This Profile") };
			const restoreButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.eye), tooltip: localize('missionControl.restore', "Restore Host") };
			quickPick.title = localize('missionControlEnvironments', "Mission Control Hosts");
			quickPick.placeholder = localize('selectMissionControlEnvironment', "Select a host to connect; its owning application must be running");
			quickPick.matchOnDescription = true;
			quickPick.matchOnDetail = true;
			quickPick.keepScrollPosition = true;
			quickPick.ignoreFocusOut = true;
			quickPick.buttons = onBack ? [picker.backButton, refreshButton] : [refreshButton];
			const restoreHost = (id: string) => {
				inventory.restore(id);
				picker.focus();
			};
			let refreshError: string | undefined;
			const update = () => {
				if (inventory.accountKey !== account || !inventory.enabled) {
					quickPick.hide();
					return;
				}
				const active = new Set(quickPick.activeItems.map(item => item.environment.id));
				const selected = new Set(quickPick.selectedItems.map(item => item.environment.id));
				const hosts = inventory.hosts.get();
				const labels = hosts.map(host => host.displayName ?? host.name);
				const items: (IEnvironmentPick | IQuickPickSeparator)[] = [];
				for (const hidden of [false, true]) {
					const group = hosts.filter(host => !!host.hidden === hidden)
						.sort((a, b) => Number(b.status === 'online') - Number(a.status === 'online') || (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name) || a.id.localeCompare(b.id));
					if (hidden && group.length) {
						items.push({ type: 'separator', label: localize('missionControl.hiddenHosts', "Hidden in This Profile") });
					}
					for (const host of group) {
						const label = host.displayName ?? host.name;
						const status = remote.connections.find(connection => connection.address === cloudSandboxAddress(host.id))?.status.kind;
						const relay = status === 'connected' ? localize('missionControl.connected', "Relay connected")
							: status === 'connecting' || status === 'reconnecting' ? localize('missionControl.connecting', "Relay connecting")
								: localize('missionControl.disconnected', "Relay disconnected");
						const availability = host.status === 'online' ? localize('missionControl.online', "Last reported online")
							: localize('missionControl.offline', "Offline or unavailable; start its owning application");
						items.push({
							label, environment: host, iconClass: ThemeIcon.asClassName(Codicon.remote),
							description: hidden ? localize('missionControl.hidden', "Hidden") : relay,
							detail: labels.filter(name => name === label).length > 1
								? localize('missionControl.duplicateDetail', "Mission Control · {0} · Host {1}", availability, host.id.slice(-8))
								: localize('missionControl.hostDetail', "Mission Control · {0}", availability),
							buttons: [hidden ? restoreButton : hideButton],
						});
					}
				}
				quickPick.items = items;
				const hostItems = items.filter((item): item is IEnvironmentPick => item.type !== 'separator');
				const activeItems = hostItems.filter(item => active.has(item.environment.id));
				if (activeItems.length) {
					quickPick.activeItems = activeItems;
				}
				if (selected.size) {
					quickPick.selectedItems = hostItems.filter(item => selected.has(item.environment.id));
				}
				quickPick.severity = refreshError ? Severity.Warning : Severity.Info;
				quickPick.validationMessage = refreshError ?? (!inventory.accountKey
					? localize('missionControl.signIn', "Sign in with your GitHub account to discover Mission Control hosts.")
					: !hosts.length ? localize('missionControl.empty', "No other user-local hosts found. Start Mission Control in the owning application on another machine, then refresh.") : undefined);
			};
			resources.add(autorun(reader => {
				inventory.hosts.read(reader);
				update();
			}));
			resources.add(remote.onDidChangeConnections(update));
			const refresh = async () => {
				if (quickPick.busy) {
					return;
				}
				quickPick.busy = true;
				try {
					await inventory.refresh(cancellation.token);
					refreshError = undefined;
				} catch (error) {
					if (!cancellation.token.isCancellationRequested && !isCancellationError(error)) {
						refreshError = localize('missionControl.refreshFailed', "Could not refresh hosts. Retained hosts are still available. {0}", toErrorMessage(error));
					}
				} finally {
					if (!cancellation.token.isCancellationRequested) {
						quickPick.busy = false;
						update();
					}
				}
			};
			const selection = await new Promise<IEnvironmentPick | undefined>(resolve => {
				resources.add(quickPick.onDidAccept(() => {
					const selected = quickPick.selectedItems[0] ?? quickPick.activeItems[0];
					if (selected?.environment.hidden) {
						restoreHost(selected.environment.id);
					} else if (selected) {
						resolve(selected);
						quickPick.hide();
					}
				}));
				resources.add(quickPick.onDidTriggerButton(button => {
					if (button === refreshButton) {
						void refresh();
					} else if (button === picker.backButton) {
						quickPick.hide();
						onBack?.();
					}
				}));
				resources.add(quickPick.onDidTriggerItemButton(async event => {
					try {
						if (event.button === restoreButton) {
							restoreHost(event.item.environment.id);
						} else if (event.button === hideButton) {
							await inventory.hide(event.item.environment.id);
						}
					} catch (error) {
						if (!isCancellationError(error)) {
							notifications.error(error);
						}
					}
				}));
				resources.add(quickPick.onDidHide(() => {
					cancellation.cancel();
					resolve(undefined);
				}));
				quickPick.show();
				void refresh();
			});
			if (!selection) {
				return undefined;
			}
			const progress = notifications.notify({
				severity: Severity.Info,
				message: localize('missionControl.connectProgress', "Connecting to {0}...", selection.label),
				progress: { infinite: true },
			});
			try {
				await inventory.connect(selection.environment.id, CancellationToken.None);
				return selection.environment.id;
			} finally {
				progress.close();
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				notifications.error(error);
			}
			return undefined;
		} finally {
			resources.dispose();
		}
	}
});
