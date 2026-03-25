/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { agentHostUri } from '../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IParsedRemoteAgentHostInput, IRemoteAgentHostService, parseRemoteAgentHostInput, RemoteAgentHostInputValidationError } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService, SSHAuthMethod, type ISSHAgentHostConfig } from '../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';

interface IRemoteAgentHostPickItem extends IQuickPickItem {
	readonly remoteType: 'existing' | 'add' | 'ssh';
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
			remoteType: 'ssh',
			label: localize('connectSSH', "Connect via SSH..."),
			description: localize('connectSSHDescription', "Bootstrap a remote agent host over SSH"),
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
		} else if (picked.remoteType === 'ssh') {
			const sshResult = await promptToConnectViaSSH(accessor);
			if (!sshResult) {
				return undefined;
			}
			selectedAddress = sshResult.address;
			selectedName = sshResult.name;
			defaultDirectory = sshResult.defaultDirectory;
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
		// No configured entries — show both SSH and direct WebSocket options
		const picks: IRemoteAgentHostPickItem[] = [
			{
				remoteType: 'ssh',
				label: localize('connectSSH', "Connect via SSH..."),
				description: localize('connectSSHDescription', "Bootstrap a remote agent host over SSH"),
			},
			{
				remoteType: 'add',
				label: localize('addRemote', "Add Remote..."),
				description: localize('addRemoteDescription', "Connect to a new remote agent host"),
			},
		];

		const picked = await quickInputService.pick(picks, {
			title: localize('selectRemote', "Select Remote"),
			placeHolder: localize('selectRemoteMethodPlaceholder', "Choose how to connect to a remote agent host"),
		});
		if (!picked) {
			return undefined;
		}

		if (picked.remoteType === 'ssh') {
			const sshResult = await promptToConnectViaSSH(accessor);
			if (!sshResult) {
				return undefined;
			}
			selectedAddress = sshResult.address;
			selectedName = sshResult.name;
			defaultDirectory = sshResult.defaultDirectory;
		} else {
			const addedRemote = await promptToAddRemoteAgentHost(remoteAgentHostService, quickInputService, notificationService);
			if (!addedRemote) {
				return undefined;
			}
			selectedAddress = addedRemote.address;
			selectedName = addedRemote.name;
			defaultDirectory = addedRemote.defaultDirectory;
		}
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

// ---- SSH connection flow -------------------------------------------------------

interface ISSHAuthMethodPickItem extends IQuickPickItem {
	readonly method: SSHAuthMethod;
}

/**
 * Multi-step quick input flow for connecting to a remote agent host via SSH.
 * Prompts for host, username, auth method, and display name.
 *
 * Exported so it can be invoked from the standalone "Connect via SSH" command.
 */
export async function promptToConnectViaSSH(
	accessor: ServicesAccessor,
): Promise<{ readonly address: string; readonly name: string; readonly defaultDirectory?: string } | undefined> {
	const sshService = accessor.get(ISSHRemoteAgentHostService);
	const quickInputService = accessor.get(IQuickInputService);
	const notificationService = accessor.get(INotificationService);

	const validateSshHostInput = (value: string): string | undefined => {
		const v = value.trim();
		if (!v) {
			return localize('sshHostEmpty', "Enter an SSH host.");
		}
		const atIdx = v.indexOf('@');
		if (atIdx === 0) {
			return localize('sshUsernameMissingInHost', "Enter a username before '@'.");
		}
		if (atIdx === v.length - 1) {
			return localize('sshHostMissingAfterAt', "Enter a host name after '@'.");
		}
		const hostPart = atIdx !== -1 ? v.substring(atIdx + 1) : v;
		if (!hostPart) {
			return localize('sshHostMissingAfterAt', "Enter a host name after '@'.");
		}
		const colonIdx = hostPart.lastIndexOf(':');
		if (colonIdx !== -1) {
			const hostName = hostPart.substring(0, colonIdx);
			const portStr = hostPart.substring(colonIdx + 1);
			if (!hostName) {
				return localize('sshHostMissingAfterAt', "Enter a host name after '@'.");
			}
			if (portStr) {
				const port = Number(portStr);
				if (!Number.isInteger(port) || port <= 0 || port > 65535) {
					return localize('sshHostInvalidPort', "Enter a valid port number.");
				}
			}
		}
		return undefined;
	};

	// Step 1: SSH host
	const hostInput = await quickInputService.input({
		title: localize('sshHostTitle', "Connect via SSH"),
		prompt: localize('sshHostPrompt', "Enter the SSH host (e.g. user@hostname or user@hostname:port)."),
		placeHolder: 'user@myserver.example.com',
		ignoreFocusLost: true,
		validateInput: async value => validateSshHostInput(value),
	});
	if (!hostInput) {
		return undefined;
	}

	// Parse user@host[:port] format
	const trimmed = hostInput.trim();
	let username: string | undefined;
	let host: string;
	let port: number | undefined;
	const atIndex = trimmed.indexOf('@');

	let hostPart: string;
	if (atIndex !== -1) {
		username = trimmed.substring(0, atIndex);
		hostPart = trimmed.substring(atIndex + 1);
	} else {
		hostPart = trimmed;
	}

	const colonIndex = hostPart.lastIndexOf(':');
	if (colonIndex !== -1) {
		host = hostPart.substring(0, colonIndex);
		const portStr = hostPart.substring(colonIndex + 1);
		if (portStr) {
			port = Number(portStr);
		}
	} else {
		host = hostPart;
	}

	if (atIndex === -1) {
		const usernameInput = await quickInputService.input({
			title: localize('sshUsernameTitle', "SSH Username"),
			prompt: localize('sshUsernamePrompt', "Enter the username for {0}.", host),
			placeHolder: 'root',
			ignoreFocusLost: true,
			validateInput: async value => value.trim() ? undefined : localize('sshUsernameEmpty', "Enter a username."),
		});
		if (!usernameInput) {
			return undefined;
		}
		username = usernameInput.trim();
	}

	if (!username) {
		return undefined;
	}

	// Step 3: Auth method
	const authPicks: ISSHAuthMethodPickItem[] = [
		{
			method: SSHAuthMethod.Agent,
			label: localize('sshAuthAgent', "SSH Agent"),
			description: localize('sshAuthAgentDesc', "Use the running SSH agent for authentication"),
		},
		{
			method: SSHAuthMethod.KeyFile,
			label: localize('sshAuthKey', "Private Key File"),
			description: localize('sshAuthKeyDesc', "Authenticate with a private key file"),
		},
		{
			method: SSHAuthMethod.Password,
			label: localize('sshAuthPassword', "Password"),
			description: localize('sshAuthPasswordDesc', "Authenticate with a password"),
		},
	];

	const authPicked = await quickInputService.pick(authPicks, {
		title: localize('sshAuthTitle', "Authentication Method"),
		placeHolder: localize('sshAuthPlaceholder', "Choose how to authenticate with {0}", host),
	});
	if (!authPicked) {
		return undefined;
	}

	let privateKeyPath: string | undefined;
	let password: string | undefined;

	if (authPicked.method === SSHAuthMethod.KeyFile) {
		const keyPath = await quickInputService.input({
			title: localize('sshKeyTitle', "Private Key Path"),
			prompt: localize('sshKeyPrompt', "Enter the path to your SSH private key."),
			placeHolder: '~/.ssh/id_rsa',
			value: '~/.ssh/id_rsa',
			ignoreFocusLost: true,
			validateInput: async value => value.trim() ? undefined : localize('sshKeyEmpty', "Enter a key file path."),
		});
		if (!keyPath) {
			return undefined;
		}
		privateKeyPath = keyPath.trim();
	} else if (authPicked.method === SSHAuthMethod.Password) {
		const pw = await quickInputService.input({
			title: localize('sshPasswordTitle', "SSH Password"),
			prompt: localize('sshPasswordPrompt', "Enter the password for {0}@{1}.", username, host),
			password: true,
			ignoreFocusLost: true,
			validateInput: async value => value ? undefined : localize('sshPasswordEmpty', "Enter a password."),
		});
		if (!pw) {
			return undefined;
		}
		password = pw;
	}

	// Step 4: Display name
	const suggestedName = `${username}@${host}`;
	const name = await quickInputService.input({
		title: localize('sshNameTitle', "Name Remote"),
		prompt: localize('sshNamePrompt', "Enter a display name for this SSH remote."),
		placeHolder: localize('sshNamePlaceholder', "My Remote"),
		value: suggestedName,
		valueSelection: [0, suggestedName.length],
		ignoreFocusLost: true,
		validateInput: async value => value.trim() ? undefined : localize('sshNameEmpty', "Enter a name."),
	});
	if (!name) {
		return undefined;
	}

	// Connect via SSH
	const config: ISSHAgentHostConfig = {
		host,
		port,
		username,
		authMethod: authPicked.method,
		privateKeyPath,
		password,
		name: name.trim(),
	};

	try {
		const connection = await sshService.connect(config);
		return {
			address: connection.localAddress,
			name: connection.name,
		};
	} catch (err) {
		notificationService.error(localize('sshConnectFailed', "Failed to connect via SSH to {0}: {1}", host, String(err)));
		return undefined;
	}
}
