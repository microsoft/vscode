/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { agentHostUri } from '../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IParsedRemoteAgentHostInput, IRemoteAgentHostService, parseRemoteAgentHostInput, RemoteAgentHostInputValidationError } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';

interface IRemoteAgentHostPickItem extends IQuickPickItem {
	readonly remoteType: 'existing' | 'add';
	readonly address?: string;
	readonly defaultDirectory?: string;
}

const removeButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.close),
	tooltip: localize('removeRemote', "Remove Remote"),
};

/**
 * Drives the "Browse Remotes" flow: lets the user pick an existing configured
 * remote or add a new one, then opens a folder-picker on that remote.
 *
 * Returns the selected folder URI, or `undefined` if the user cancelled.
 */
export async function pickRemoteAgentHostFolder(
	accessor: ServicesAccessor,
): Promise<URI | undefined> {
	const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
	const quickInputService = accessor.get(IQuickInputService);
	const fileDialogService = accessor.get(IFileDialogService);
	const notificationService = accessor.get(INotificationService);

	let selectedAddress: string | undefined;
	let selectedName: string | undefined;
	let defaultDirectory: string | undefined;

	const configuredEntries = remoteAgentHostService.configuredEntries;
	if (configuredEntries.length > 0) {
		const picks: IRemoteAgentHostPickItem[] = configuredEntries.map(entry => {
			const connection = remoteAgentHostService.connections.find(c => c.address === entry.address);
			return {
				remoteType: 'existing' as const,
				label: entry.name,
				description: entry.address,
				address: entry.address,
				defaultDirectory: connection?.defaultDirectory,
				buttons: [removeButton],
			};
		});
		picks.push({
			remoteType: 'add',
			label: localize('addRemote', "Add Remote..."),
			description: localize('addRemoteDescription', "Connect to a new remote agent host"),
		});

		const picked = await quickInputService.pick(picks, {
			title: localize('selectRemote', "Select Remote"),
			placeHolder: localize('selectRemotePlaceholder', "Choose a remote agent host or add a new one"),
			matchOnDescription: true,
			onDidTriggerItemButton: async context => {
				if (context.button === removeButton && context.item.address) {
					try {
						await remoteAgentHostService.removeRemoteAgentHost(context.item.address);
						context.removeItem();
					} catch {
						notificationService.error(localize('removeRemoteFailed', "Failed to remove remote agent host {0}.", context.item.address));
					}
				}
			},
		});
		if (!picked) {
			return undefined;
		}

		if (picked.remoteType === 'existing') {
			const configuredEntry = configuredEntries.find(e => e.address === picked.address);
			if (!configuredEntry) {
				return undefined;
			}
			try {
				const connection = await remoteAgentHostService.addRemoteAgentHost(configuredEntry);
				selectedAddress = connection.address;
				selectedName = connection.name;
				defaultDirectory = connection.defaultDirectory;
			} catch {
				notificationService.error(localize('connectRemoteFailed', "Failed to connect to remote agent host {0}.", configuredEntry.address));
				return undefined;
			}
		} else {
			const addedRemote = await promptToAddRemoteAgentHost(remoteAgentHostService, quickInputService, notificationService);
			if (!addedRemote) {
				return undefined;
			}
			selectedAddress = addedRemote.address;
			selectedName = addedRemote.name;
			defaultDirectory = addedRemote.defaultDirectory;
		}
	} else {
		const addedRemote = await promptToAddRemoteAgentHost(remoteAgentHostService, quickInputService, notificationService);
		if (!addedRemote) {
			return undefined;
		}
		selectedAddress = addedRemote.address;
		selectedName = addedRemote.name;
		defaultDirectory = addedRemote.defaultDirectory;
	}

	if (!selectedAddress || !selectedName) {
		return undefined;
	}

	return pickFolderOnRemote(selectedAddress, selectedName, defaultDirectory, fileDialogService);
}

async function promptToAddRemoteAgentHost(
	remoteAgentHostService: IRemoteAgentHostService,
	quickInputService: IQuickInputService,
	notificationService: INotificationService,
): Promise<{ readonly address: string; readonly name: string; readonly defaultDirectory?: string } | undefined> {
	const parsed = await promptForRemoteAddress(quickInputService);
	if (!parsed) {
		return undefined;
	}

	const name = await promptForRemoteName(quickInputService, parsed.suggestedName);
	if (!name) {
		return undefined;
	}

	try {
		const connection = await remoteAgentHostService.addRemoteAgentHost({
			address: parsed.address,
			name,
			connectionToken: parsed.connectionToken,
		});
		return {
			address: connection.address,
			name: connection.name,
			defaultDirectory: connection.defaultDirectory,
		};
	} catch {
		notificationService.error(localize('addRemoteFailed', "Failed to connect to remote agent host {0}.", parsed.address));
		return undefined;
	}
}

async function promptForRemoteAddress(quickInputService: IQuickInputService): Promise<IParsedRemoteAgentHostInput | undefined> {
	const value = await quickInputService.input({
		title: localize('addRemoteTitle', "Add Remote"),
		prompt: localize('addRemotePrompt', "Paste a host, host:port, or WebSocket URL. Example: {0}", 'ws://127.0.0.1:8089'),
		placeHolder: 'ws://127.0.0.1:8080?tkn=abc-123',
		ignoreFocusLost: true,
		validateInput: async value => {
			const result = parseRemoteAgentHostInput(value);
			if (result.error === RemoteAgentHostInputValidationError.Empty) {
				return localize('addRemoteValidationEmpty', "Enter a remote agent host address.");
			}
			if (result.error === RemoteAgentHostInputValidationError.Invalid) {
				return localize('addRemoteValidationInvalid', "Enter a valid host, host:port, or WebSocket URL.");
			}
			return undefined;
		},
	});
	if (!value) {
		return undefined;
	}
	const result = parseRemoteAgentHostInput(value);
	return result.parsed;
}

async function promptForRemoteName(quickInputService: IQuickInputService, defaultName: string): Promise<string | undefined> {
	const value = await quickInputService.input({
		title: localize('nameRemoteTitle', "Name Remote"),
		prompt: localize('nameRemotePrompt', "Enter a display name for this remote agent host."),
		placeHolder: localize('nameRemotePlaceholder', "My Remote"),
		value: defaultName,
		valueSelection: [0, defaultName.length],
		ignoreFocusLost: true,
		validateInput: async value => value.trim() ? undefined : localize('nameRemoteValidationEmpty', "Enter a name for this remote agent host."),
	});
	return value?.trim() || undefined;
}

async function pickFolderOnRemote(
	selectedAddress: string,
	selectedName: string,
	defaultDirectory: string | undefined,
	fileDialogService: IFileDialogService,
): Promise<URI | undefined> {
	const authority = agentHostAuthority(selectedAddress);
	const defaultUri = defaultDirectory
		? agentHostUri(authority, defaultDirectory)
		: agentHostUri(authority, '/');

	try {
		const selected = await fileDialogService.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			title: localize('selectRemoteFolder', "Select Folder on {0}", selectedName),
			availableFileSystems: [AGENT_HOST_SCHEME],
			defaultUri,
		});
		return selected?.[0];
	} catch {
		// dialog was cancelled or failed
		return undefined;
	}
}
