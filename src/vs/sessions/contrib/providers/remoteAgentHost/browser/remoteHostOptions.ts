/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { timeout } from '../../../../../base/common/async.js';
import { autorun } from '../../../../../base/common/observable.js';
import { toAction } from '../../../../../base/common/actions.js';
import Severity from '../../../../../base/common/severity.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IOutputService } from '../../../../../workbench/services/output/common/output.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { INotificationService, Severity as NotificationSeverity } from '../../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';

export async function reconnectRemoteHost(provider: IAgentHostSessionsProvider, remoteAgentHostService: IRemoteAgentHostService): Promise<void> {
	if (provider.connect) {
		await provider.connect();
	} else if (provider.remoteAddress) {
		remoteAgentHostService.reconnect(provider.remoteAddress);
	}
}

export async function removeRemoteHost(provider: IAgentHostSessionsProvider, remoteAgentHostService: IRemoteAgentHostService): Promise<void> {
	if (provider.disconnect) {
		await provider.disconnect();
	} else if (provider.remoteAddress) {
		await remoteAgentHostService.removeRemoteAgentHost(provider.remoteAddress);
	}
}

/**
 * Run the CLI-managed server upgrade flow for `provider`. Used by both
 * the per-host quickpick and the proactive `incompatible` notification.
 *
 * Shows progress in a notification, counts down through the CLI's
 * deliberately-staggered restart delay, and either reconnects when the
 * countdown completes or steps aside if some other code path beat it.
 *
 * Returns when the flow finishes (success, "already up to date", or
 * surfaced error). All user-facing errors are reported via the
 * notification service.
 */
export async function runServerUpgrade(
	accessor: ServicesAccessor,
	provider: IAgentHostSessionsProvider,
	upgradeMethod: string,
): Promise<void> {
	const address = provider.remoteAddress;
	if (!address) {
		return;
	}
	const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
	const notificationService = accessor.get(INotificationService);
	const progressService = accessor.get(IProgressService);

	await progressService.withProgress(
		{
			location: ProgressLocation.Notification,
			title: localize('workspacePicker.upgradingServer', "Updating {0}...", provider.label),
		},
		async (progress) => {
			try {
				const upgradeResult = await remoteAgentHostService.triggerServerUpgrade(address, upgradeMethod);
				if (upgradeResult.upgradeStarted) {
					// The CLI deliberately delays the kill+restart by
					// `restartDelayMs` so this very RPC response can drain
					// back through the proxy. If we reconnect before that
					// delay we land on the still-running pre-upgrade
					// server and the connect path latches us into
					// `incompatible` with no further retries. Wait a
					// small buffer past the CLI's own delay so the new
					// server has time to start accepting, and observe
					// the connection status during the wait: if some
					// other code path (e.g. the entry's own
					// transport-close handler) has already kicked off a
					// reconnect, don't trample on it.
					const waitMs = (upgradeResult.restartDelayMs ?? 3000) + 2000;
					const totalSeconds = Math.max(1, Math.ceil(waitMs / 1000));
					const watchStore = new DisposableStore();
					let reconnectAlreadyInFlight = false;
					if (provider.connectionStatus) {
						const initialStatus = provider.connectionStatus.get();
						watchStore.add(autorun(reader => {
							const next = provider.connectionStatus!.read(reader);
							if (next !== initialStatus && !RemoteAgentHostConnectionStatus.isIncompatible(next)) {
								reconnectAlreadyInFlight = true;
							}
						}));
					}
					try {
						for (let secondsLeft = totalSeconds; secondsLeft > 0; secondsLeft--) {
							if (reconnectAlreadyInFlight) {
								break;
							}
							progress.report({
								message: localize(
									'workspacePicker.upgradeCountdown',
									"Restarting in {0}s...",
									secondsLeft,
								),
							});
							await timeout(1000);
						}
					} finally {
						watchStore.dispose();
					}
					if (!reconnectAlreadyInFlight) {
						progress.report({
							message: localize('workspacePicker.upgradeReconnecting', "Reconnecting..."),
						});
						await reconnectRemoteHost(provider, remoteAgentHostService);
					}
				} else if (upgradeResult.upgradeNeeded === false) {
					notificationService.notify({
						severity: NotificationSeverity.Info,
						message: localize('workspacePicker.upgradeNotNeeded', "{0} is already on the latest version.", provider.label),
					});
				} else {
					notificationService.notify({
						severity: NotificationSeverity.Warning,
						message: upgradeResult.error
							? localize('workspacePicker.upgradeFailedWithReason', "Failed to update {0}: {1}", provider.label, upgradeResult.error)
							: localize('workspacePicker.upgradeNotStarted', "{0} did not start an update.", provider.label),
					});
				}
			} catch (err) {
				notificationService.notify({
					severity: NotificationSeverity.Error,
					message: localize('workspacePicker.upgradeFailed', "Failed to update {0}: {1}", provider.label, err instanceof Error ? err.message : String(err)),
				});
			}
		},
	);
}

/**
 * Surface a transient notification each time a provider transitions into
 * the `incompatible` state. Fires once per transition (not on every
 * status update while incompatible). When the host advertises an upgrade
 * method, the notification's primary action runs the upgrade flow
 * directly; otherwise it just opens the same picker that the manage flow
 * uses so the user can read the full message and pick a recovery action.
 *
 * Returns a disposable that stops the watcher.
 */
export function watchForIncompatibleNotifications(
	provider: IAgentHostSessionsProvider,
	instantiationService: IInstantiationService,
	notificationService: INotificationService,
): IDisposable {
	if (!provider.connectionStatus) {
		return Disposable.None;
	}
	let lastWasIncompatible = RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get());
	return autorun(reader => {
		const status = provider.connectionStatus!.read(reader);
		const isIncompatible = RemoteAgentHostConnectionStatus.isIncompatible(status);
		if (isIncompatible && !lastWasIncompatible) {
			const upgradeMethod = status.vscodeUpgradeMethod;
			const primaryActions = [];
			if (upgradeMethod) {
				primaryActions.push(toAction({
					id: 'agentHost.upgradeFromIncompatible',
					label: localize('agentHostIncompatibleUpdate', "Update Server"),
					run: () => instantiationService.invokeFunction(accessor => runServerUpgrade(accessor, provider, upgradeMethod)),
				}));
			}
			primaryActions.push(toAction({
				id: 'agentHost.showRemoteHostOptions',
				label: localize('agentHostIncompatibleShowOptions', "Show Options"),
				run: () => instantiationService.invokeFunction(accessor => showRemoteHostOptions(accessor, provider)),
			}));
			notificationService.notify({
				severity: NotificationSeverity.Warning,
				message: localize(
					'agentHostIncompatibleNotification',
					"Cannot connect to {0}: {1}",
					provider.label,
					status.message,
				),
				actions: { primary: primaryActions },
			});
		}
		lastWasIncompatible = isIncompatible;
	});
}

export function getStatusLabel(status: RemoteAgentHostConnectionStatus): string {
	switch (status.kind) {
		case 'connected':
			return localize('workspacePicker.statusOnline', "Online");
		case 'connecting':
			return localize('workspacePicker.statusConnecting', "Connecting");
		case 'disconnected':
			return localize('workspacePicker.statusOffline', "Offline");
		case 'incompatible':
			return localize('workspacePicker.statusIncompatible', "Incompatible");
	}
}

export function getStatusHover(status: RemoteAgentHostConnectionStatus, address?: string): string {
	switch (status.kind) {
		case 'connected':
			return address
				? localize('workspacePicker.hoverConnectedAddr', "Remote agent host is connected and ready.\n\nAddress: {0}", address)
				: localize('workspacePicker.hoverConnected', "Remote agent host is connected and ready.");
		case 'connecting':
			return address
				? localize('workspacePicker.hoverConnectingAddr', "Attempting to connect to remote agent host...\n\nAddress: {0}", address)
				: localize('workspacePicker.hoverConnecting', "Attempting to connect to remote agent host...");
		case 'disconnected':
			return address
				? localize('workspacePicker.hoverDisconnectedAddr', "Remote agent host is disconnected.\n\nAddress: {0}", address)
				: localize('workspacePicker.hoverDisconnected', "Remote agent host is disconnected.");
		case 'incompatible': {
			const offered = status.supportedByClient.join(', ');
			return address
				? localize('workspacePicker.hoverIncompatibleAddr', "Cannot connect to remote agent host: {0}\n\nThis client speaks protocol version {1}.\n\nAddress: {2}", status.message, offered, address)
				: localize('workspacePicker.hoverIncompatible', "Cannot connect to remote agent host: {0}\n\nThis client speaks protocol version {1}.", status.message, offered);
		}
	}
}

export interface IShowRemoteHostOptionsOptions {
	/** When true, show a Back button in the picker title bar. The promise resolves to `'back'` if pressed. */
	readonly showBackButton?: boolean;
}

/**
 * Show the per-remote management options quickpick (Reconnect / Remove /
 * Copy Address / Open Settings / Show Output) for the given provider.
 *
 * Used by both the Workspace Picker's Manage submenu and the F1
 * "Manage Remote Agent Hosts..." command, so both surfaces drive the
 * same actions. Callers that don't have a {@link ServicesAccessor} should
 * use `instantiationService.invokeFunction(accessor => showRemoteHostOptions(accessor, provider))`.
 *
 * Returns `'back'` if the user clicked the back button (only possible when
 * `options.showBackButton` is true), otherwise `undefined`.
 */
export async function showRemoteHostOptions(accessor: ServicesAccessor, provider: IAgentHostSessionsProvider, options: IShowRemoteHostOptionsOptions = {}): Promise<'back' | undefined> {
	const address = provider.remoteAddress;
	if (!address) {
		return undefined;
	}

	const quickInputService = accessor.get(IQuickInputService);
	const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
	const clipboardService = accessor.get(IClipboardService);
	const preferencesService = accessor.get(IPreferencesService);
	const outputService = accessor.get(IOutputService);
	const productService = accessor.get(IProductService);
	const instantiationService = accessor.get(IInstantiationService);

	const status = provider.connectionStatus?.get();
	const isConnected = RemoteAgentHostConnectionStatus.isConnected(status);
	const upgradeMethod = RemoteAgentHostConnectionStatus.isIncompatible(status) ? status.vscodeUpgradeMethod : undefined;

	type RemoteOptionPickItem = IQuickPickItem & { id: string };
	const items: RemoteOptionPickItem[] = [];
	if (upgradeMethod) {
		items.push({ label: '$(cloud-download) ' + localize('workspacePicker.updateServer', "Update Server"), id: 'upgrade' });
	}
	if (!isConnected) {
		items.push({ label: '$(debug-restart) ' + localize('workspacePicker.reconnect', "Reconnect"), id: 'reconnect' });
	}
	items.push(
		{ label: '$(trash) ' + localize('workspacePicker.removeRemote', "Remove Remote"), id: 'remove' },
		{ label: '$(copy) ' + localize('workspacePicker.copyAddress', "Copy Address"), id: 'copy' },
		{ label: '$(settings-gear) ' + localize('workspacePicker.openSettings', "Open Settings"), id: 'settings' },
	);
	if (provider.outputChannelId) {
		items.push({ label: '$(output) ' + localize('workspacePicker.showOutput', "Show Output"), id: 'output' });
	}

	const result = await new Promise<'back' | RemoteOptionPickItem | undefined>((resolve) => {
		const store = new DisposableStore();
		const picker = store.add(quickInputService.createQuickPick<RemoteOptionPickItem>());
		picker.placeholder = localize('workspacePicker.remoteOptionsTitle', "Options for {0}", provider.label);
		picker.items = items;

		if (RemoteAgentHostConnectionStatus.isIncompatible(status)) {
			const offered = status.supportedByClient.join(', ');
			const served = status.offeredByServer?.length
				? status.offeredByServer.join(', ')
				: undefined;
			picker.severity = Severity.Warning;
			picker.validationMessage = served
				? localize('workspacePicker.incompatibleValidationServer', "Incompatible protocol version. We speak {0}, but {1} speaks {2}. Ensure {3} and {1} are both up to date.", offered, provider.label, served, productService.nameShort)
				: localize('workspacePicker.incompatibleValidationClient', "Incompatible protocol version. We speak {0}. Error from {1}: {2}\n\n Ensure {3} and {1} are both up to date.", offered, provider.label, status.message, productService.nameShort);
		}

		if (options.showBackButton) {
			picker.buttons = [quickInputService.backButton];
		}
		store.add(picker.onDidTriggerButton(button => {
			if (button === quickInputService.backButton) {
				resolve('back');
				picker.hide();
			}
		}));
		store.add(picker.onDidAccept(() => {
			resolve(picker.selectedItems[0]);
			picker.hide();
		}));
		store.add(picker.onDidHide(() => {
			resolve(undefined);
			store.dispose();
		}));
		picker.show();
	});

	if (result === 'back') {
		return 'back';
	}
	if (!result) {
		return undefined;
	}

	switch (result.id) {
		case 'upgrade':
			if (upgradeMethod) {
				await instantiationService.invokeFunction(runServerUpgrade, provider, upgradeMethod);
			}
			break;
		case 'reconnect':
			await reconnectRemoteHost(provider, remoteAgentHostService);
			break;
		case 'remove':
			await removeRemoteHost(provider, remoteAgentHostService);
			break;
		case 'copy':
			await clipboardService.writeText(address);
			break;
		case 'settings':
			await preferencesService.openSettings({ query: 'chat.remoteAgentHosts' });
			break;
		case 'output':
			if (provider.outputChannelId) {
				outputService.showChannel(provider.outputChannelId, true);
			}
			break;
	}
	return undefined;
}
