/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IOutputService } from '../../../../workbench/services/output/common/output.js';
import { IPreferencesService } from '../../../../workbench/services/preferences/common/preferences.js';
import { IAgentHostSessionsProvider } from '../../../common/agentHostSessionsProvider.js';
import { IProductService } from '../../../../platform/product/common/productService.js';

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

	const status = provider.connectionStatus?.get();
	const isConnected = RemoteAgentHostConnectionStatus.isConnected(status);

	type RemoteOptionPickItem = IQuickPickItem & { id: string };
	const items: RemoteOptionPickItem[] = [];
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
