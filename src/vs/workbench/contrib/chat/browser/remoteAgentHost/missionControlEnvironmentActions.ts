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
import { IQuickInputButton, IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

export const ConnectMissionControlEnvironmentCommand = 'workbench.action.chat.connectMissionControlEnvironment';

interface IEnvironmentPick extends IQuickPickItem {
	readonly environment: IMissionControlHost;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ConnectMissionControlEnvironmentCommand,
			title: localize2('connectMissionControlEnvironment', "Connect to Environment..."),
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.not('config.chat.disableAIFeatures'), ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)),
		});
	}

	override async run(accessor: ServicesAccessor, onBack?: () => void): Promise<string | undefined> {
		const inventory = accessor.get(IMissionControlEnvironmentService);
		if (!inventory.enabled) {
			throw new Error(localize('missionControl.connectionsDisabled', "Environment connections require remote agent hosts and AI features to be enabled."));
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
			const refreshButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.refresh), tooltip: localize('missionControl.refresh', "Refresh Environments") };
			quickPick.title = localize('missionControlEnvironments', "Environments");
			quickPick.placeholder = localize('selectMissionControlEnvironment', "Select an environment to connect");
			quickPick.matchOnDescription = true;
			quickPick.matchOnDetail = true;
			quickPick.keepScrollPosition = true;
			quickPick.ignoreFocusOut = true;
			quickPick.buttons = onBack ? [picker.backButton, refreshButton] : [refreshButton];
			let refreshError: string | undefined;
			const update = () => {
				if (inventory.accountKey !== account || !inventory.enabled) {
					quickPick.hide();
					return;
				}
				const active = new Set(quickPick.activeItems.map(item => item.environment.id));
				const selected = new Set(quickPick.selectedItems.map(item => item.environment.id));
				const hosts = inventory.hosts.get();
				const items: IEnvironmentPick[] = [...hosts]
					.sort((a, b) => Number(b.status === 'online') - Number(a.status === 'online') || (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name) || a.id.localeCompare(b.id))
					.map(host => {
						const status = remote.connections.find(connection => connection.address === cloudSandboxAddress(host.id))?.status.kind;
						const connection = status === 'connected' ? localize('missionControl.connected', "Connected")
							: status === 'connecting' ? localize('missionControl.connecting', "Connecting")
								: status === 'reconnecting' ? localize('missionControl.reconnecting', "Reconnecting") : undefined;
						const availability = host.status === 'online' ? localize('missionControl.online', "Online")
							: localize('missionControl.offline', "Offline");
						return {
							label: host.displayName ?? host.name, environment: host, iconClass: ThemeIcon.asClassName(Codicon.remote),
							description: connection ? localize('missionControl.hostStatus', "{0} · {1}", availability, connection) : availability,
						};
					});
				quickPick.items = items;
				const hostItems = items;
				const activeItems = hostItems.filter(item => active.has(item.environment.id));
				if (activeItems.length) {
					quickPick.activeItems = activeItems;
				}
				if (selected.size) {
					quickPick.selectedItems = hostItems.filter(item => selected.has(item.environment.id));
				}
				quickPick.severity = refreshError ? Severity.Warning : Severity.Info;
				quickPick.validationMessage = refreshError ?? (!inventory.accountKey
					? localize('missionControl.signIn', "Sign in with your GitHub account to discover environments.")
					: !hosts.length ? localize('missionControl.empty', "No environments found.") : undefined);
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
						refreshError = localize('missionControl.refreshFailed', "Could not refresh environments. Showing the last known environments. {0}", toErrorMessage(error));
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
					if (selected) {
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
